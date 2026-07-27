import Papa from "papaparse";
import { NormalizedCostRecord, CostCategory } from "../types";
import {
  ParseDiagnostics,
  coerceAmount,
  coerceQuantity,
  detectDateOrder,
  noteDateOrder,
  detectDecimalSeparator,
  noteDecimalSeparator,
  normalizeDate,
  DATE_ORDER_SAMPLE_SIZE,
} from "./coerce";
import { extractEmbeddedCsvTable, metadataDate } from "./embedded-csv-table";

/**
 * GCP Cloud Billing Export CSV Parser.
 * Supports the standard BigQuery billing export and Cloud Billing export format.
 */

const GCP_COLUMN_MAPPINGS: Record<string, string> = {
  "billing account id": "billingAccountId",
  billing_account_id: "billingAccountId",
  "billing account name": "billingAccountName",
  "project.id": "projectId",
  project_id: "projectId",
  "project id": "projectId",
  "project.name": "projectName",
  project_name: "projectName",
  "project number": "projectNumber",
  project_number: "projectNumber",
  "project hierarchy": "projectAncestry",
  "project.ancestry_numbers": "projectAncestry",
  project_ancestry_numbers: "projectAncestry",
  "project.ancestors": "projectAncestry",
  project_ancestors: "projectAncestry",
  "service.description": "service",
  service_description: "service",
  "service description": "service",
  service: "service",
  "service.id": "serviceId",
  service_id: "serviceId",
  "sku.description": "skuDescription",
  sku_description: "skuDescription",
  "sku description": "skuDescription",
  "sku.id": "skuId",
  sku_id: "skuId",
  "location.region": "region",
  location_region: "region",
  "location.location": "region",
  location_location: "region",
  "location.zone": "zone",
  location_zone: "zone",
  region: "region",
  location: "region",
  usage_start_time: "date",
  "usage start time": "date",
  usage_start_date: "date",
  date: "date",
  cost: "cost",
  "cost ($)": "cost",
  "list cost": "listCost",
  "unrounded cost": "cost",
  "unrounded subtotal": "cost",
  subtotal: "cost",
  cost_amount: "cost",
  currency: "billingCurrency",
  cost_type: "costType",
  "cost type": "costType",
  usage_amount: "quantity",
  "usage.amount": "quantity",
  "usage amount": "quantity",
  quantity: "quantity",
  "usage unit": "pricingUnit",
  usage_unit: "pricingUnit",
  "usage.pricing_unit": "pricingUnit",
  usage_pricing_unit: "pricingUnit",
  "resource.global_name": "resourceId",
  resource_global_name: "resourceId",
  "resource.name": "resourceId",
  resource_name: "resourceId",
  "consumption model id": "consumptionModelId",
  "consumption model description": "consumptionModelDescription",
  "consumption_model.id": "consumptionModelId",
  consumption_model_id: "consumptionModelId",
  "consumption_model.description": "consumptionModelDescription",
  consumption_model_description: "consumptionModelDescription",
  "subscription.instance_id": "subscriptionInstanceId",
  subscription_instance_id: "subscriptionInstanceId",
  "invoice.month": "invoiceMonth",
  invoice_month: "invoiceMonth",
  "credit id": "creditId",
  "credit name": "creditName",
  "label": "label",
  "tags": "tags",
  // Commitment-discount signal (verified against GCP's Standard usage export
  // schema, docs.cloud.google.com "credits" struct): `credits.type` carries
  // COMMITTED_USAGE_DISCOUNT[_DOLLAR_BASE] for a real compromise vs
  // SUSTAINED_USAGE_DISCOUNT for GCP's automatic, no-commitment discount — the
  // two must NOT be treated the same way (only the first is a commitment).
  "credits.type": "creditType",
  credits_type: "creditType",
  "credit type": "creditType",
  "credit_type": "creditType",
  "credits.amount": "creditAmount",
  credits_amount: "creditAmount",
  "credit amount": "creditAmount",
  "credit_amount": "creditAmount",
  "x_credits": "xCredits",
  "xcredits": "xCredits",
  "x_consumption_model_id": "consumptionModelId",
  "x_consumptionmodelid": "consumptionModelId",
  "xconsumptionmodelid": "consumptionModelId",
  "x_consumption_model_description": "consumptionModelDescription",
  "x_consumptionmodeldescription": "consumptionModelDescription",
  "xconsumptionmodeldescription": "consumptionModelDescription",
  "x_subscription_instance_id": "subscriptionInstanceId",
  "x_subscriptioninstanceid": "subscriptionInstanceId",
  "xsubscriptioninstanceid": "subscriptionInstanceId",
  "x_list_cost": "listCost",
  "xlistcost": "listCost",
  "x_effective_cost": "effectiveCost",
  "xeffectivecost": "effectiveCost",
  "price.list_price": "listUnitPrice",
  price_list_price: "listUnitPrice",
  "price.effective_price": "effectiveUnitPrice",
  price_effective_price: "effectiveUnitPrice",
  "price.unit": "pricingUnit",
  price_unit: "pricingUnit",
  "cost_at_list_consumption_model": "listCost",
  "cost_at_effective_price_default": "effectiveCost",
};

const GCP_REPORT_SAVINGS_COLUMNS: Record<string, string> = {
  "negotiated savings": "negotiatedSavings",
  "savings programs": "savingsPrograms",
  "other savings": "otherSavings",
  "credit amount": "creditAmount",
};

function normalizeReportHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/\s*\([^)]*(?:usd|eur|mxn|gbp|cad|aud|\$|€|£)[^)]*\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function gcpMappedColumn(header: string): string | undefined {
  const normalized = header.toLowerCase().trim();
  return GCP_COLUMN_MAPPINGS[normalized]
    || GCP_COLUMN_MAPPINGS[normalizeReportHeader(normalized)]
    || GCP_REPORT_SAVINGS_COLUMNS[normalizeReportHeader(normalized)];
}

function isGCPTableHeader(headers: string[]): boolean {
  const normalized = headers.map(normalizeReportHeader);
  const hasMoney = normalized.some((header) =>
    ["cost", "list cost", "unrounded cost", "unrounded subtotal", "subtotal"].includes(header)
  );
  const hasIdentity = normalized.some((header) =>
    [
      "service description",
      "service id",
      "sku description",
      "sku id",
      "project id",
      "billing account id",
    ].includes(header)
  );
  return hasMoney && hasIdentity;
}

/** Returns the real table headers even when GCP prepends invoice/report metadata. */
export function getGCPTable(csvContent: string) {
  return extractEmbeddedCsvTable(csvContent, isGCPTableHeader);
}

/**
 * GCP console Reports and Cost table downloads are aggregate/configurable CSVs.
 * They are deliberately distinguished from BigQuery Standard/Detailed exports:
 * the former prove spend and allocation, but not resource utilisation.
 */
export function isGCPConsoleSummary(headers: string[]): boolean {
  const normalized = headers.map(normalizeReportHeader);
  if (
    normalized.includes("usage_start_time")
    || normalized.includes("usage start time")
    || normalized.includes("export_time")
  ) return false;
  const hasMoney = normalized.some((header) =>
    ["cost", "list cost", "unrounded cost", "unrounded subtotal", "subtotal"].includes(header)
  );
  const hasConsoleColumn = normalized.some((header) =>
    [
      "negotiated savings",
      "savings programs",
      "other savings",
      "unrounded cost",
      "unrounded subtotal",
      "subtotal",
      "cost type",
      "project hierarchy",
      "consumption model description",
    ].includes(header)
  );
  const hasIdentity = normalized.some((header) =>
    ["service description", "service id", "sku description", "project id", "billing account id"].includes(header)
  );
  const hasTimeGrouping = normalized.includes("date") || normalized.includes("month");
  return hasMoney && hasConsoleColumn && (hasIdentity || hasTimeGrouping);
}

/** Header names that let a file express a real committed-use discount at all. */
const GCP_COMMITMENT_COLUMNS = [
  "credits.type", "credits_type", "credit type", "credit_type", "x_credits", "xcredits",
  "subscription.instance_id", "subscription_instance_id",
  "consumption_model.id", "consumption_model_id",
  "consumption model id",
];

/** GCP's own values for a REAL commitment, per docs.cloud.google.com. Sustained-use
 *  is automatic and NOT a commitment — deliberately excluded. */
const GCP_COMMITTED_CREDIT_TYPES = ["committed_usage_discount", "committed_usage_discount_dollar_base"];

/**
 * Infer a CostCategory from a GCP service name + SKU/charge description.
 * Exported because the FOCUS parser needs it too: Google's FOCUS export does not
 * publish ServiceCategory or ServiceSubcategory at all (documented conformance
 * gap), so ServiceName + SKU text is the only signal available there.
 */
export function categorizeGCP(service: string, skuDescription: string): CostCategory {
  const svc = service.toLowerCase();
  const sku = skuDescription.toLowerCase();

  if (
    svc.includes("vertex ai") ||
    svc.includes("generative ai") ||
    svc.includes("machine learning") ||
    svc.includes("vision ai") ||
    svc.includes("natural language") ||
    svc.includes("speech-to-text") ||
    svc.includes("text-to-speech")
  ) {
    return "ai-ml";
  }
  if (svc.includes("filestore")) return "file-storage";

  // Snapshot BEFORE "storage pd": Google's SKU for a disk snapshot is
  // "Storage PD Snapshot", so testing "storage pd" first filed every snapshot as
  // block storage and the snapshot rule never saw that spend.
  if (svc.includes("compute engine") && sku.includes("snapshot")) return "snapshot";
  if (svc.includes("compute engine") && (sku.includes("storage pd") || sku.includes("pd capacity"))) return "block-storage";
  if (svc.includes("compute engine") && (sku.includes("nat gateway") || sku.includes("cloud nat") || sku.includes("nat "))) return "nat";
  if (
    svc.includes("compute engine") &&
    (sku.includes("external ip") || sku.includes("static ip") || sku.includes("ip address"))
  ) {
    return "ip-address";
  }
  if (svc.includes("compute engine") && (sku.includes("instance") || sku.includes("core") || sku.includes("ram"))) return "compute";
  if (svc.includes("compute engine") && sku.includes("network")) return "network-egress";
  if (svc.includes("cloud storage")) return "object-storage";
  if (svc.includes("persistent disk")) return "block-storage";
  if (svc.includes("cloud sql") || svc.includes("bigtable") || svc.includes("spanner") || svc.includes("firestore")) return "database";
  if (svc.includes("cloud functions") || svc.includes("cloud run")) return "serverless";
  if (svc.includes("networking") || sku.includes("egress") || sku.includes("network")) return "network-egress";
  return "other";
}

function committedCreditSignal(...values: Array<string | undefined>): boolean {
  const text = values.filter(Boolean).join(" ").toLowerCase();
  return GCP_COMMITTED_CREDIT_TYPES.some((type) => text.includes(type));
}

function extractCreditAmount(raw: string | undefined, separator?: "." | ","): number {
  if (!raw) return 0;
  const direct = coerceAmount(raw, separator);
  if (direct !== null) return direct;
  try {
    const parsed = JSON.parse(raw);
    const values = Array.isArray(parsed) ? parsed : [parsed];
    return values.reduce((total, item) => {
      const amount = typeof item === "object" && item !== null ? Number(item.amount) : 0;
      return total + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  } catch {
    const matches = raw.match(/"amount"\s*:\s*(-?\d+(?:\.\d+)?)/gi) || [];
    return matches.reduce((total, item) => total + Number(item.split(":").pop()), 0);
  }
}

/**
 * Detect if a CSV is a GCP Cloud Billing export.
 */
export function isGCPFormat(headers: string[]): boolean {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  const gcpIndicators = [
    "service.description",
    "service_description",
    "service description",
    "sku.description",
    "sku_description",
    "sku description",
    "billing account id",
    "billing_account_id",
    "project.id",
    "project_id",
  ];
  return gcpIndicators.filter((ind) => normalized.includes(ind)).length >= 2;
}

function summaryDate(raw: string | undefined, fallback: string | undefined): {
  date: string;
  granularity: "daily" | "monthly";
} {
  const value = (raw || "").trim();
  if (/^\d{4}-\d{2}$/.test(value)) return { date: `${value}-01`, granularity: "monthly" };
  if (/^\d{6}$/.test(value)) {
    return { date: `${value.slice(0, 4)}-${value.slice(4, 6)}-01`, granularity: "monthly" };
  }
  const normalized = normalizeDate(value || fallback);
  return { date: normalized || fallback || "2000-01-01", granularity: value ? "daily" : "monthly" };
}

export function parseGCPConsoleSummary(
  csvContent: string,
  diagnostics?: ParseDiagnostics
): NormalizedCostRecord[] {
  const table = getGCPTable(csvContent);
  const parsed = Papa.parse(table.csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim().toLowerCase(),
  });
  const rows = parsed.data as Record<string, string>[];
  const mappedRows = rows.map((row) => {
    const mapped: Record<string, string> = {};
    for (const [header, value] of Object.entries(row)) {
      const target = gcpMappedColumn(header);
      if (target) mapped[target] = value?.trim() || "";
      else if (["date", "month"].includes(normalizeReportHeader(header))) {
        mapped.period = value?.trim() || "";
      }
    }
    return mapped;
  });
  const detectedDecimal = detectDecimalSeparator(
    mappedRows.slice(0, DATE_ORDER_SAMPLE_SIZE).map((row) => row.cost || row.listCost)
  );
  // BigQuery and Google Cloud console CSVs use "." decimals. Preserve a
  // decisively detected comma locale; only settle the 3-digit ambiguous case.
  const decimalSeparator =
    detectedDecimal.separator === null && detectedDecimal.ambiguous
      ? { ...detectedDecimal, separator: "." as const, ambiguous: false }
      : detectedDecimal;
  noteDecimalSeparator(diagnostics, decimalSeparator);

  if (diagnostics) {
    diagnostics.sourceKind = "gcp-console-summary";
    diagnostics.totalRows = mappedRows.length;
    diagnostics.commitmentSignalAvailable = table.headers
      .map(normalizeReportHeader)
      .some((header) =>
        ["savings programs", "consumption model id", "consumption model description", "credit type"].includes(header)
      );
  }

  const fallbackDate = metadataDate(table.metadata);
  const records: NormalizedCostRecord[] = [];
  const periodKeys = new Set<string>();
  let granularity: "daily" | "monthly" = "monthly";
  const groupFields = table.headers
    .map(normalizeReportHeader)
    .filter((header) =>
      [
        "date", "month", "billing account id", "billing account name", "project id",
        "project name", "project hierarchy", "service description", "sku description",
        "region", "label",
      ].includes(header)
    );

  for (const mapped of mappedRows) {
    const cost = coerceAmount(
      mapped.cost || mapped.listCost,
      decimalSeparator.separator ?? undefined
    );
    if (cost === null) {
      if (diagnostics && (mapped.cost || mapped.listCost || "").trim()) diagnostics.unparsableAmountRows++;
      continue;
    }
    const costType = (mapped.costType || "").toLowerCase();
    if (costType === "tax") {
      if (diagnostics) {
        diagnostics.taxRows++;
        diagnostics.taxTotalUSD += Math.abs(cost);
      }
      continue;
    }
    if (cost < 0 || costType === "adjustment") {
      if (diagnostics) {
        diagnostics.creditRows++;
        diagnostics.creditTotalUSD += Math.abs(cost);
      }
      continue;
    }
    if (cost === 0) {
      if (diagnostics) diagnostics.zeroCostRows++;
      continue;
    }

    const period = summaryDate(mapped.period || mapped.invoiceMonth, fallbackDate);
    granularity = period.granularity;
    periodKeys.add(period.date);
    const savings = ["negotiatedSavings", "savingsPrograms", "otherSavings", "creditAmount"]
      .reduce(
        (sum, field) =>
          sum + Math.abs(coerceAmount(mapped[field], decimalSeparator.separator ?? undefined) || 0),
        0
      );
    if (savings > 0 && diagnostics) {
      diagnostics.creditRows++;
      diagnostics.creditTotalUSD += savings;
    }
    const service =
      mapped.service
      || mapped.skuDescription
      || mapped.projectName
      || mapped.projectId
      || mapped.region
      || mapped.label
      || mapped.billingAccountName
      || mapped.billingAccountId
      || "Google Cloud";
    const sku = mapped.skuDescription || mapped.consumptionModelDescription || "Resumen de consola";
    const hasCommitment = /cud|committed/i.test(
      `${mapped.consumptionModelDescription || ""} ${mapped.creditType || ""}`
    ) || (
      coerceAmount(mapped.savingsPrograms, decimalSeparator.separator ?? undefined) || 0
    ) !== 0;

    records.push({
      provider: "gcp",
      category: categorizeGCP(service, sku),
      nativeService: service,
      nativeUsageType: sku,
      region: mapped.region || mapped.zone || "global",
      date: period.date,
      cost,
      quantity: coerceQuantity(mapped.quantity, diagnostics),
      accountId: mapped.projectId || mapped.billingAccountId || "",
      chargeType: mapped.costType || "Summary",
      commitmentDiscountId: hasCommitment
        ? mapped.subscriptionInstanceId || mapped.consumptionModelId || "gcp-cud-summary"
        : undefined,
      billingIdentity: {
        serviceId: mapped.serviceId || undefined,
        skuId: mapped.skuId || undefined,
      },
      pricing: {
        billingCurrency: mapped.billingCurrency || undefined,
        pricingCategory: mapped.consumptionModelDescription || undefined,
        listCost:
          coerceAmount(mapped.listCost, decimalSeparator.separator ?? undefined) ?? undefined,
        unit: mapped.pricingUnit || undefined,
      },
      source: {
        datasetType: "cost-and-usage",
        schemaVersion: table.headerRowIndex > 0
          ? "GCP Cost table/Reports CSV"
          : "GCP Reports CSV",
        catalogSnapshot: "gcp-services.json",
        extensions: {
          analysisLevel: "summary",
          granularity,
          summaryGroupByLabel: groupFields.join(" > ") || "Sin agrupación",
          invoiceMonth: mapped.invoiceMonth || "",
          projectAncestry: mapped.projectAncestry || "",
        },
      },
    });
  }

  if (diagnostics) {
    diagnostics.summaryGranularity = granularity;
    diagnostics.summaryPeriodCount = Math.max(1, periodKeys.size);
    diagnostics.summaryGroupByLabel = groupFields.join(" > ") || "Sin agrupación";
    diagnostics.summaryGroupBy = groupFields.length > 0 ? groupFields.join(">") : "none";
  }
  return records;
}

/**
 * Parse GCP Cloud Billing export CSV into NormalizedCostRecords.
 *
 * `diagnostics` is optional; when supplied it accumulates dropped-row counts.
 */
export function parseGCPCSV(
  csvContent: string,
  diagnostics?: ParseDiagnostics
): NormalizedCostRecord[] {
  const table = getGCPTable(csvContent);
  const result = Papa.parse(table.csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim().toLowerCase(),
  });

  if (result.errors.length > 0) {
    const critical = result.errors.filter(
      (e) => e.type === "FieldMismatch" || e.type === "Quotes"
    );
    if (critical.length > 0) {
      throw new Error(`Error parsing GCP CSV: ${critical.map((e) => e.message).join("; ")}`);
    }
  }

  const records: NormalizedCostRecord[] = [];

  // Map columns first so date order is decided once for the whole file.
  const mappedRows: Record<string, string>[] = (result.data as Record<string, string>[]).map(
    (row) => {
      const mapped: Record<string, string> = {};
      for (const [csvCol, value] of Object.entries(row)) {
        const normalizedCol = csvCol.toLowerCase().trim();
        const targetField = gcpMappedColumn(normalizedCol);
        if (targetField) {
          const clean = value?.trim() || "";
          // Prefer the globally unique resource.global_name over the later,
          // human-friendly resource.name column in Detailed exports.
          if (targetField !== "resourceId" || !mapped.resourceId) {
            mapped[targetField] = clean;
          }
        }
      }
      return mapped;
    }
  );

  const dateOrder = detectDateOrder(
    mappedRows.slice(0, DATE_ORDER_SAMPLE_SIZE).map((r) => r.date)
  );
  noteDateOrder(diagnostics, dateOrder);

  const detectedDecimalSeparator = detectDecimalSeparator(
    mappedRows.slice(0, DATE_ORDER_SAMPLE_SIZE).map((r) => r.cost)
  );
  const decimalSeparator =
    detectedDecimalSeparator.separator === null && detectedDecimalSeparator.ambiguous
      ? { ...detectedDecimalSeparator, separator: "." as const, ambiguous: false }
      : detectedDecimalSeparator;
  noteDecimalSeparator(diagnostics, decimalSeparator);
  if (diagnostics) diagnostics.totalRows = mappedRows.length;

  // Column PRESENCE, same idea as Azure's PricingModel check.
  const headers = (result.meta.fields || []).map((h) => h.toLowerCase().trim());
  if (diagnostics) {
    diagnostics.commitmentSignalAvailable = GCP_COMMITMENT_COLUMNS.some((c) => headers.includes(c));
  }

  // Credit rows carry the ONLY signal this flat export gives for a real
  // commitment (see GCP_COMMITTED_CREDIT_TYPES above), but they're separate
  // rows from the compute/database charges they discount — this format has no
  // shared key to join them precisely. Rather than leave every compute/DB
  // record blind to a commitment the file DOES prove exists (the false-positive
  // this whole change exists to fix), a verified committed-use discount
  // anywhere in the file is applied file-wide in the pass below. Coarse, but
  // correct in the direction that matters: it stops recommending a commitment
  // to an account that already has one.
  let sawUnattributedCommittedUseDiscount = false;

  for (const mapped of mappedRows) {
    const cost = coerceAmount(mapped.cost, decimalSeparator.separator ?? undefined);
    if (cost === null) {
      if (diagnostics && (mapped.cost ?? "").trim() !== "") diagnostics.unparsableAmountRows++;
      continue;
    }
    // GCP puts committed-use and sustained-use discounts in `credits.amount` as
    // negative numbers. Accounted for rather than silently dropped, so the report
    // can state gross vs net (see ParseDiagnostics.creditRows).
    if (cost < 0) {
      if (diagnostics) {
        diagnostics.creditRows++;
        diagnostics.creditTotalUSD += Math.abs(cost);
      }
      const creditType = (mapped.creditType || "").toLowerCase().trim();
      if (committedCreditSignal(creditType, mapped.xCredits)) {
        sawUnattributedCommittedUseDiscount = true;
      }
      continue;
    }
    if (cost <= 0) continue;

    // usage_start_time is a timestamp; normalizeDate validates it instead of
    // trusting `split("T")[0]`, which used to accept anything before the "T".
    const date = normalizeDate(mapped.date, dateOrder.order);
    if (date === null) {
      if (diagnostics) diagnostics.unparsableDateRows++;
      continue;
    }

    const service = mapped.service || "Unknown";
    const skuDescription = mapped.skuDescription || "";
    const creditAmount = extractCreditAmount(
      mapped.creditAmount || mapped.xCredits,
      decimalSeparator.separator ?? undefined
    );
    if (creditAmount !== 0 && diagnostics) {
      diagnostics.creditRows++;
      diagnostics.creditTotalUSD += Math.abs(creditAmount);
    }
    const rowHasCommitment =
      committedCreditSignal(mapped.creditType, mapped.xCredits)
      || !!mapped.subscriptionInstanceId
      || /cud|commit/i.test(mapped.consumptionModelDescription || "");
    const effectiveCost =
      coerceAmount(mapped.effectiveCost, decimalSeparator.separator ?? undefined) ?? undefined;

    records.push({
      provider: "gcp",
      category: categorizeGCP(service, skuDescription),
      nativeService: service,
      nativeUsageType: skuDescription || "Unknown",
      region: mapped.region || "unknown",
      date,
      cost,
      quantity: coerceQuantity(mapped.quantity, diagnostics),
      accountId: mapped.projectId || mapped.billingAccountId || "",
      chargeType: "Usage",
      commitmentDiscountId: rowHasCommitment
        ? mapped.subscriptionInstanceId || "gcp-cud-detected"
        : undefined,
      resourceId: mapped.resourceId || undefined,
      billingIdentity: {
        serviceId: mapped.serviceId || undefined,
        skuId: mapped.skuId || undefined,
      },
      pricing: {
        billingCurrency: mapped.billingCurrency || undefined,
        pricingCategory: mapped.consumptionModelDescription || mapped.costType || undefined,
        listCost: coerceAmount(mapped.listCost, decimalSeparator.separator ?? undefined) ?? undefined,
        contractedCost: effectiveCost,
        listUnitPrice:
          coerceAmount(mapped.listUnitPrice, decimalSeparator.separator ?? undefined) ?? undefined,
        effectiveUnitPrice:
          coerceAmount(mapped.effectiveUnitPrice, decimalSeparator.separator ?? undefined) ?? undefined,
        unit: mapped.pricingUnit || undefined,
      },
      source: {
        datasetType: "cost-and-usage",
        schemaVersion: mapped.xCredits ? "GCP FOCUS/native extension" : "GCP Billing Export",
        catalogSnapshot: "gcp-services.json",
        extensions: {
          consumptionModelId: mapped.consumptionModelId || "",
          subscriptionInstanceId: mapped.subscriptionInstanceId || "",
          creditAmount,
          projectAncestry: mapped.projectAncestry || "",
          tags: mapped.tags || "",
        },
      },
    });
  }

  // Compatibility fallback for flattened exports that represent credits as
  // independent negative rows without a join key. Row-level x_Credits wins when
  // available; this conservative fallback only prevents a false recommendation.
  if (sawUnattributedCommittedUseDiscount) {
    for (const r of records) {
      if (r.category === "compute" || r.category === "database") {
        r.commitmentDiscountId = r.commitmentDiscountId || "gcp-cud-detected";
      }
    }
  }

  return records;
}
