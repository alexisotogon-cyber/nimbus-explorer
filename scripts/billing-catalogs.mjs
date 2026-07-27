#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotsDir = path.join(root, "src/engine/catalog/snapshots");
const FOCUS_ROOT =
  "https://raw.githubusercontent.com/FinOps-Open-Cost-and-Usage-Spec/FOCUS_Spec/main/specification/requirements_model/releases/1.4";
const FOCUS_TREE =
  "https://api.github.com/repos/FinOps-Open-Cost-and-Usage-Spec/FOCUS_Spec/git/trees/main?recursive=1";
const AWS_URL = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/index.json";
const AZURE_URL =
  "https://prices.azure.com/api/retail/prices?api-version=2023-01-01-preview&meterRegion='primary'";
const GCP_URL = "https://cloudbilling.googleapis.com/v1/services";
const AZURE_SERVICE_FAMILIES = [
  "Analytics", "Azure Arc", "Azure Communication Services", "Azure Security",
  "Azure Stack", "Compute", "Containers", "Data", "Databases", "Developer Tools",
  "Dynamics", "Gaming", "Integration", "Internet of Things",
  "Management and Governance", "Microsoft Syntex", "Mixed Reality", "Networking",
  "Other", "Power Platform", "Quantum Computing", "Security", "Storage",
  "Telecommunications", "Web", "Windows Virtual Desktop",
];
const EXPECTED_FOCUS_COUNTS = {
  "cost-and-usage": 65,
  "billing-period": 6,
  "contract-commitment": 30,
  "invoice-detail": 22,
};
const FOCUS_PATHS = {
  "cost-and-usage": "cost_and_usage",
  "billing-period": "billing_period",
  "contract-commitment": "contract_commitment",
  "invoice-detail": "invoice_detail",
};

const FOCUS_SUPPORTED = new Set([
  "availabilityzone", "billedcost", "billingaccountid", "billingcurrency",
  "chargecategory", "chargeclass", "chargedescription", "chargeperiodstart",
  "chargesubcategory", "commitmentdiscountid", "consumedquantity", "consumedunit",
  "contractedcost", "contractedunitprice", "effectivecost", "hostprovidername",
  "invoiceid", "listcost", "listunitprice", "pricingcategory", "pricingcurrency",
  "pricingquantity", "pricingunit", "providername", "publishername", "regionid",
  "regionname", "resourceid", "resourcetype", "servicecategory", "servicename",
  "serviceprovidername", "servicesubcategory", "skuid", "skupriceid",
  "subaccountid", "subaccountname",
]);

const PROVIDER_CONCEPTS = {
  aws: [
    "bill_billing_period_start_date", "bill_payer_account_id", "bill_invoice_id",
    "line_item_usage_start_date", "line_item_product_code", "line_item_usage_type",
    "line_item_availability_zone", "line_item_usage_account_id", "line_item_resource_id",
    "line_item_usage_amount", "line_item_unblended_cost", "line_item_net_unblended_cost",
    "line_item_line_item_type", "line_item_currency_code", "product_servicecode",
    "product_sku", "product_product_name", "product_region", "pricing_unit",
    "pricing_public_on_demand_cost", "pricing_public_on_demand_rate",
    "reservation_reservation_a_r_n", "reservation_effective_cost",
    "savings_plan_savings_plan_a_r_n", "savings_plan_savings_plan_effective_cost",
    "discount_total_discount", "resource_tags",
  ],
  azure: [
    "Date", "ServiceName", "ServiceId", "ServiceFamily", "ConsumedService",
    "ProductId", "ProductName", "SkuId", "MeterId", "MeterName", "MeterCategory",
    "MeterSubCategory", "ResourceId", "ResourceLocation", "SubscriptionId",
    "CostInBillingCurrency", "CostInUSD", "BillingCurrencyCode", "Quantity",
    "UnitOfMeasure", "EffectivePrice", "PayGPrice", "PricingModel", "ChargeType",
    "ReservationId", "BenefitId", "InvoiceId", "BillingProfileId", "InvoiceSectionId",
  ],
  gcp: [
    "billing_account_id", "project.id", "project.name", "project.ancestry_numbers",
    "service.id", "service.description", "sku.id", "sku.description",
    "location.region", "usage_start_time", "usage.amount", "usage.unit", "cost",
    "currency", "currency_conversion_rate", "cost_type", "credits.amount",
    "credits.type", "resource.global_name", "resource.name", "tags",
    "x_Credits", "x_ConsumptionModelId", "x_ConsumptionModelDescription",
    "x_SubscriptionInstanceId", "x_ListCost", "x_EffectiveCost",
  ],
};

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sha(snapshot) {
  const clone = { ...snapshot, sha256: "" };
  return createHash("sha256").update(JSON.stringify(clone)).digest("hex");
}

async function fetchJson(url, options = {}, attempts = 8) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal || AbortSignal.timeout(30_000),
        headers: {
          Accept: "application/json",
          "User-Agent": "Nimbus-FinOps-Catalog-Updater/1.0",
          ...(options.headers || {}),
        },
      });
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}`);
        const retryAfter = Number(response.headers.get("retry-after"));
        error.retryAfterMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 0;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const isRateLimited = String(error?.message || "").startsWith("429");
        const delay = error?.retryAfterMs ||
          (isRateLimited ? Math.min(30_000, attempt * 5_000) : attempt * 750);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw new Error(`No se pudo descargar ${new URL(url).origin}: ${lastError?.message}`);
}

function collectAllowedValues(value, columnName, output = new Set()) {
  if (!value || typeof value !== "object") return output;
  if (
    value.CheckFunction === "CheckValue" &&
    value.ColumnName === columnName &&
    typeof value.Value === "string"
  ) {
    output.add(value.Value);
  }
  for (const child of Object.values(value)) collectAllowedValues(child, columnName, output);
  return output;
}

async function refreshFocus() {
  const tree = await fetchJson(FOCUS_TREE);
  const paths = tree.tree.map((item) => item.path);
  const concepts = [];
  const counts = {};

  for (const [dataset, folder] of Object.entries(FOCUS_PATHS)) {
    const prefix =
      `specification/requirements_model/releases/1.4/model_rules/datasets/${folder}/columns/`;
    const columnPaths = paths
      .filter((entry) => entry.startsWith(prefix) && entry.endsWith(".json"))
      .sort();
    const columnRules = await mapLimit(columnPaths, 12, async (entry) => ({
      entry,
      rules: await fetchJson(
        `https://raw.githubusercontent.com/FinOps-Open-Cost-and-Usage-Spec/FOCUS_Spec/main/${entry}`
      ),
    }));
    const activeColumns = columnRules.filter(({ rules }) => {
      const rootRule = Object.values(rules).find(
        (rule) => rule.EntityType === "Column" && rule.Order === 0
      );
      return rootRule?.Status === "Active";
    });
    counts[dataset] = activeColumns.length;
    for (const { entry, rules } of activeColumns) {
      const id = path.basename(entry, ".json");
      const rootRule = Object.values(rules).find(
        (rule) => rule.EntityType === "Column" && rule.Order === 0
      );
      concepts.push({
        id,
        name: rootRule?.EntityId || id,
        dataset,
        focusConcept: id,
        supportedByParser:
          dataset === "cost-and-usage" ? FOCUS_SUPPORTED.has(normalize(id)) : true,
      });
    }
  }

  for (const [dataset, expected] of Object.entries(EXPECTED_FOCUS_COUNTS)) {
    if (counts[dataset] !== expected) {
      throw new Error(`FOCUS ${dataset}: se esperaban ${expected} columnas y llegaron ${counts[dataset]}`);
    }
  }

  const [categoryRules, subcategoryRules] = await Promise.all([
    fetchJson(`${FOCUS_ROOT}/model_rules/datasets/cost_and_usage/columns/servicecategory.json`),
    fetchJson(`${FOCUS_ROOT}/model_rules/datasets/cost_and_usage/columns/servicesubcategory.json`),
  ]);
  const serviceCategories = [...collectAllowedValues(categoryRules, "ServiceCategory")].sort();
  const serviceSubcategories = [...collectAllowedValues(subcategoryRules, "ServiceSubcategory")].sort();
  if (serviceCategories.length !== 19 || serviceSubcategories.length !== 82) {
    throw new Error(
      `Taxonomía FOCUS inesperada: ${serviceCategories.length} categorías/${serviceSubcategories.length} subcategorías`
    );
  }

  return finalize({
    provider: "focus",
    sourceType: "FOCUS requirements model",
    sourceUrl:
      "https://github.com/FinOps-Open-Cost-and-Usage-Spec/FOCUS_Spec/tree/main/specification/requirements_model/releases/1.4",
    sourceVersion: "1.4",
    fetchedAt: new Date().toISOString(),
    services: [],
    concepts,
    warnings: [],
    metadata: {
      datasetColumnCounts: counts,
      serviceCategories,
      serviceSubcategories,
    },
  });
}

function conceptsFor(provider) {
  return PROVIDER_CONCEPTS[provider].map((field) => ({
    id: normalize(field),
    name: field,
    providerField: field,
    dataset: "cost-and-usage",
    supportedByParser: true,
  }));
}

async function refreshAws() {
  const data = await fetchJson(AWS_URL);
  const services = Object.entries(data.offers || {})
    .map(([id, offer]) => ({
      id,
      name: offer.offerCode || id,
      aliases: [...new Set([offer.currentVersionUrl, offer.versionIndexUrl].filter(Boolean))],
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (services.length < 200) throw new Error(`AWS devolvió sólo ${services.length} ofertas`);

  return finalize({
    provider: "aws",
    sourceType: "AWS Bulk Price List offer index",
    sourceUrl: AWS_URL,
    sourceVersion: data.formatVersion || "dynamic",
    fetchedAt: new Date().toISOString(),
    sourcePublishedAt: data.publicationDate,
    services,
    concepts: conceptsFor("aws"),
    warnings: [
      "El Price List público no sustituye CUR 2.0 ni contiene precios contractuales de la cuenta.",
    ],
  });
}

async function refreshAzure() {
  if (process.env.AZURE_CATALOG_METADATA_ONLY === "1") {
    return finalize({
      provider: "azure",
      sourceType: "Azure Retail Prices API service-family snapshot",
      sourceUrl: AZURE_URL,
      sourceVersion: "2023-01-01-preview",
      fetchedAt: new Date().toISOString(),
      services: AZURE_SERVICE_FAMILIES.map((family) => ({
        id: `family:${normalize(family)}`,
        name: family,
        family,
        aliases: [],
      })),
      concepts: conceptsFor("azure"),
      warnings: [
        "Snapshot inicial limitado a las 26 familias oficiales por throttling del catálogo completo.",
        "CI debe ejecutar el refresco sin AZURE_CATALOG_METADATA_ONLY para deduplicar servicios, productos, SKU y meters.",
      ],
      metadata: { serviceFamilies: AZURE_SERVICE_FAMILIES },
    });
  }
  const aggregates = new Map();
  let pages = 0;
  const hardLimit = Number(process.env.AZURE_CATALOG_MAX_PAGES || 10000);
  const concurrency = Number(process.env.AZURE_CATALOG_CONCURRENCY || 8);
  let reachedEnd = false;
  for (let firstPage = 0; !reachedEnd; firstPage += concurrency) {
    if (firstPage + concurrency > hardLimit) {
      throw new Error(`Azure quedó incompleto al alcanzar AZURE_CATALOG_MAX_PAGES=${hardLimit}`);
    }
    const batch = await Promise.all(
      Array.from({ length: concurrency }, (_, index) => {
        const page = firstPage + index;
        return fetchJson(`${AZURE_URL}&$skip=${page * 1000}`);
      })
    );
    for (const data of batch) {
      const items = data.Items || [];
      pages++;
      if (items.length === 0) reachedEnd = true;
      for (const item of items) {
        if (!item.isPrimaryMeterRegion) continue;
        const id = item.serviceId || normalize(item.serviceName);
        const current = aggregates.get(id) || {
          id,
          name: item.serviceName || id,
          family: item.serviceFamily || "Other",
          aliases: new Set(),
          products: new Set(),
          skus: new Set(),
          meters: new Set(),
        };
        if (item.consumedService) current.aliases.add(item.consumedService);
        if (item.productId) current.products.add(item.productId);
        if (item.skuId) current.skus.add(item.skuId);
        if (item.meterId) current.meters.add(item.meterId);
        aggregates.set(id, current);
      }
    }
    console.log(`Azure: ${pages.toLocaleString()} páginas, ${aggregates.size} servicios…`);
  }
  if (aggregates.size < 20) throw new Error(`Azure devolvió sólo ${aggregates.size} servicios`);

  const services = [...aggregates.values()]
    .map((item) => ({
      id: item.id,
      name: item.name,
      family: item.family,
      aliases: [...item.aliases].sort(),
      productCount: item.products.size,
      skuCount: item.skus.size,
      meterCount: item.meters.size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const serviceFamilies = [...new Set(services.map((service) => service.family))].sort();

  return finalize({
    provider: "azure",
    sourceType: "Azure Retail Prices API",
    sourceUrl: AZURE_URL,
    sourceVersion: "2023-01-01-preview",
    fetchedAt: new Date().toISOString(),
    services,
    concepts: conceptsFor("azure"),
    warnings: [
      "Los conteos de producto/SKU/meter describen precios retail primarios, no acuerdos contractuales.",
    ],
    metadata: { serviceFamilies },
  });
}

async function mapLimit(values, limit, mapper) {
  const output = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      output[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}

async function refreshGcp(existing) {
  const apiKey = process.env.GCP_BILLING_CATALOG_API_KEY;
  if (!apiKey) {
    console.warn("GCP: sin GCP_BILLING_CATALOG_API_KEY; se conserva el snapshot existente.");
    if (existing && existing.sha256 !== "pending-refresh" && existing.sha256 === sha(existing)) {
      return null;
    }
    return finalize({
      ...(existing || {}),
      provider: "gcp",
      sourceType: "Google Cloud Billing Catalog API",
      sourceUrl: GCP_URL,
      sourceVersion: "v1",
      fetchedAt: new Date().toISOString(),
      services: existing?.services || [],
      concepts: conceptsFor("gcp"),
      warnings: [
        "El catálogo de GCP requiere GCP_BILLING_CATALOG_API_KEY en CI; no se inventaron servicios.",
        "Los precios contractuales requieren Cloud Billing Pricing API o export de la cuenta.",
      ],
    });
  }
  const services = [];
  let pageToken = "";
  do {
    const url = new URL(GCP_URL);
    url.searchParams.set("pageSize", "5000");
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await fetchJson(url);
    services.push(...(data.services || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  if (services.length === 0) throw new Error("GCP no devolvió servicios");

  const enriched = await mapLimit(services, 5, async (service) => {
    let skuToken = "";
    let skuCount = 0;
    const aliases = new Set();
    do {
      const url = new URL(`https://cloudbilling.googleapis.com/v1/${service.name}/skus`);
      url.searchParams.set("pageSize", "5000");
      url.searchParams.set("key", apiKey);
      if (skuToken) url.searchParams.set("pageToken", skuToken);
      const data = await fetchJson(url);
      for (const sku of data.skus || []) {
        skuCount++;
        const category = sku.category || {};
        if (category.resourceFamily) aliases.add(category.resourceFamily);
        if (category.resourceGroup) aliases.add(category.resourceGroup);
        if (category.usageType) aliases.add(category.usageType);
      }
      skuToken = data.nextPageToken || "";
    } while (skuToken);
    return {
      id: service.name,
      name: service.displayName || service.name,
      aliases: [...aliases].sort(),
      skuCount,
    };
  });

  return finalize({
    provider: "gcp",
    sourceType: "Google Cloud Billing Catalog API",
    sourceUrl: GCP_URL,
    sourceVersion: "v1",
    fetchedAt: new Date().toISOString(),
    services: enriched.sort((a, b) => a.name.localeCompare(b.name)),
    concepts: conceptsFor("gcp"),
    warnings: [
      "El catálogo contiene precios públicos; los precios contractuales requieren Cloud Billing Pricing API o export de la cuenta.",
    ],
  });
}

function finalize(snapshot) {
  const withHash = { ...snapshot, sha256: "" };
  withHash.sha256 = sha(withHash);
  return withHash;
}

async function writeAtomic(filename, snapshot) {
  await mkdir(snapshotsDir, { recursive: true });
  const destination = path.join(snapshotsDir, filename);
  const temporary = `${destination}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
}

async function readSnapshot(filename) {
  return JSON.parse(await readFile(path.join(snapshotsDir, filename), "utf8"));
}

const files = {
  focus: "focus-1.4.json",
  aws: "aws-services.json",
  azure: "azure-services.json",
  gcp: "gcp-services.json",
};

async function refresh() {
  const selectedArg = process.argv.find((arg) => arg.startsWith("--provider="));
  const selected = selectedArg ? selectedArg.split("=")[1] : "all";
  const wanted = selected === "all" ? Object.keys(files) : [selected];
  for (const provider of wanted) {
    if (!files[provider]) throw new Error(`Proveedor desconocido: ${provider}`);
    console.log(`Actualizando ${provider.toUpperCase()}…`);
    const existing = await readSnapshot(files[provider]).catch(() => null);
    const snapshot =
      provider === "focus" ? await refreshFocus()
      : provider === "aws" ? await refreshAws()
      : provider === "azure" ? await refreshAzure()
      : await refreshGcp(existing);
    if (snapshot) {
      await writeAtomic(files[provider], snapshot);
      console.log(`${provider.toUpperCase()}: ${snapshot.services.length} servicios, ${snapshot.concepts.length} conceptos.`);
    }
  }
  await check();
}

async function check() {
  const now = Date.now();
  let failed = false;
  for (const [provider, filename] of Object.entries(files)) {
    const snapshot = await readSnapshot(filename);
    const computed = sha(snapshot);
    const ageDays = Math.max(0, Math.floor((now - new Date(snapshot.fetchedAt).getTime()) / 86_400_000));
    const errors = [];
    if (snapshot.provider !== provider) errors.push(`provider=${snapshot.provider}`);
    if (snapshot.sha256 !== computed) errors.push("sha256 no coincide");
    if (ageDays > 45) errors.push(`snapshot vencido (${ageDays} días)`);
    if (provider === "focus") {
      for (const [dataset, expected] of Object.entries(EXPECTED_FOCUS_COUNTS)) {
        if (snapshot.metadata?.datasetColumnCounts?.[dataset] !== expected) {
          errors.push(`${dataset} != ${expected}`);
        }
      }
      if (snapshot.metadata?.serviceCategories?.length !== 19) errors.push("categorías FOCUS != 19");
      if (snapshot.metadata?.serviceSubcategories?.length !== 82) errors.push("subcategorías FOCUS != 82");
    }
    if (ageDays > 30 && ageDays <= 45) {
      console.warn(`WARN ${provider.toUpperCase()}: ${ageDays} días de antigüedad.`);
    }
    if (errors.length) {
      failed = true;
      console.error(`FAIL ${provider.toUpperCase()}: ${errors.join("; ")}`);
    } else {
      console.log(`PASS ${provider.toUpperCase()}: hash válido, ${ageDays} días.`);
    }
  }
  if (failed) process.exitCode = 1;
}

const command = process.argv[2] || "check";
if (command === "refresh") await refresh();
else if (command === "check") await check();
else throw new Error(`Comando desconocido: ${command}`);
