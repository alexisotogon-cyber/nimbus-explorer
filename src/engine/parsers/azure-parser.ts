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
 * Azure Cost Management Export CSV Parser.
 * Supports the standard Azure Cost Management export format.
 */

const AZURE_COLUMN_MAPPINGS: Record<string, string> = {
  "date": "date",
  "usagedate": "date",
  "usagedatetime": "date",
  "billingperiodstartdate": "date",
  "metercategory": "meterCategory",
  "meter category": "meterCategory",
  "metersubcategory": "meterSubCategory",
  "meter subcategory": "meterSubCategory",
  "metername": "meterName",
  "meter name": "meterName",
  "meterid": "meterId",
  "meterregion": "meterRegion",
  "serviceid": "serviceId",
  "servicefamily": "serviceFamily",
  "productid": "productId",
  "productname": "productName",
  "skuid": "skuId",
  "resourcegroup": "resourceGroup",
  "resourcegroupname": "resourceGroup",
  "resource group": "resourceGroup",
  "resourcelocation": "region",
  "location": "region",
  "resource location": "region",
  "resourceid": "resourceId",
  "resource id": "resourceId",
  "subscriptionid": "subscriptionId",
  "subscription id": "subscriptionId",
  "subscriptionname": "subscriptionName",
  "subscription name": "subscriptionName",
  "costinbillingcurrency": "cost",
  "cost": "cost",
  "costinusd": "cost",
  "pretaxcost": "cost",
  "billingcurrencycode": "billingCurrency",
  "billingcurrency": "billingCurrency",
  "pricingcurrency": "pricingCurrency",
  "effectiveprice": "effectiveUnitPrice",
  "paygprice": "listUnitPrice",
  "unitprice": "listUnitPrice",
  "unitofmeasure": "pricingUnit",
  "quantity": "quantity",
  "usagequantity": "quantity",
  "servicename": "serviceName",
  "service name": "serviceName",
  "consumedservice": "consumedService",
  "consumed service": "consumedService",
  "chargetype": "chargeType",
  "charge type": "chargeType",
  // Commitment-discount signal (verified against learn.microsoft.com "Understand
  // usage details fields"): PricingModel is the real column, present for every
  // Azure account type, with exact values OnDemand/Reservation/Spot/SavingsPlan.
  // ChargeType Usage/Purchase/Refund alone can never express "already committed" —
  // that's what left missingCommitmentsRule unable to distinguish "no reservation"
  // from "can't see reservations" for native Azure exports.
  "pricingmodel": "pricingModel",
  "reservationid": "reservationId",
  "reservationname": "reservationName",
  "benefitid": "benefitId",
  "benefitname": "benefitName",
  "productorderid": "productOrderId",
  "invoiceid": "invoiceId",
  "billingprofileid": "billingProfileId",
  "billingprofilename": "billingProfileName",
  "invoicesectionid": "invoiceSectionId",
  "invoicesectionname": "invoiceSectionName",
  "billingaccountid": "billingAccountId",
  "billingaccountname": "billingAccountName",
  "publisherid": "publisherId",
  "publishername": "publisherName",
  "publishertype": "publisherType",
  "frequency": "frequency",
  "term": "term",
  "costcenter": "costCenter",
  "exchangeratepricingtobilling": "exchangeRate",
  "serviceperiodstartdate": "servicePeriodStartDate",
  "serviceperiodenddate": "servicePeriodEndDate",
  "additionalinfo": "additionalInfo",
  "tags": "tags",
  "costallocationrule": "costAllocationRule",
};

function normalizeAzureHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/\s*\([^)]*(?:usd|eur|mxn|gbp|cad|aud|\$|€|£)[^)]*\)\s*$/i, "")
    .replace(/[\s_-]+/g, "")
    .trim();
}

const AZURE_SUMMARY_ALIASES: Record<string, string> = {
  cost: "cost",
  costusd: "cost",
  actualcost: "cost",
  amortizedcost: "cost",
  forecastcost: "forecastCost",
  currency: "billingCurrency",
  servicename: "serviceName",
  service: "serviceName",
  resourcetype: "resourceType",
  resource: "resourceId",
  resourceid: "resourceId",
  resourcegroupname: "resourceGroup",
  resourcegroup: "resourceGroup",
  subscriptionname: "subscriptionName",
  subscriptionid: "subscriptionId",
  location: "region",
  resourcelocation: "region",
  meter: "meterName",
  metername: "meterName",
  date: "date",
  month: "month",
};

function azureMappedColumn(header: string): string | undefined {
  const raw = header.toLowerCase().trim();
  return AZURE_COLUMN_MAPPINGS[raw] || AZURE_SUMMARY_ALIASES[normalizeAzureHeader(raw)];
}

function isAzureTableHeader(headers: string[]): boolean {
  const normalized = headers.map(normalizeAzureHeader);
  const hasCost = normalized.some((header) =>
    ["cost", "costusd", "actualcost", "amortizedcost", "costinbillingcurrency", "pretaxcost"].includes(header)
  );
  const hasIdentity = normalized.some((header) =>
    [
      "servicename",
      "service",
      "resource",
      "resourceid",
      "resourcegroup",
      "resourcegroupname",
      "subscriptionid",
      "subscriptionname",
      "metercategory",
    ].includes(header)
  );
  return hasCost && hasIdentity;
}

export function getAzureTable(csvContent: string) {
  return extractEmbeddedCsvTable(csvContent, isAzureTableHeader);
}

/** Azure Cost Analysis smart/custom view CSV (summarised), not raw Cost Details. */
export function isAzureCostAnalysisSummary(headers: string[]): boolean {
  const normalized = headers.map(normalizeAzureHeader);
  const hasCost = normalized.some((header) =>
    ["cost", "costusd", "actualcost", "amortizedcost"].includes(header)
  );
  const hasIdentity = normalized.some((header) =>
    [
      "servicename",
      "service",
      "resource",
      "resourcetype",
      "resourcegroup",
      "resourcegroupname",
      "subscriptionname",
    ].includes(header)
  );
  const detailedSignals = [
    "meterid",
    "quantity",
    "chargetype",
    "costinbillingcurrency",
    "billingperiodstartdate",
    "pricingmodel",
  ];
  return hasCost && hasIdentity && !detailedSignals.some((signal) => normalized.includes(signal));
}

/** Header names that let a file express an existing commitment at all — see the
 *  comment above AZURE_COLUMN_MAPPINGS. Column PRESENCE, not per-row value. */
const AZURE_COMMITMENT_COLUMNS = ["pricingmodel", "reservationid", "benefitid"];

function categorizeAzure(meterCategory: string, meterSubCategory: string, consumedService: string): CostCategory {
  const cat = meterCategory.toLowerCase();
  const sub = meterSubCategory.toLowerCase();
  const svc = consumedService.toLowerCase();

  if (
    cat.includes("ai") ||
    sub.includes("openai") ||
    sub.includes("cognitive services") ||
    svc.includes("cognitiveservices") ||
    svc.includes("machinelearningservices")
  ) return "ai-ml";

  // Order matters, and it is deliberately most-specific-first.
  //
  // Two ordering bugs used to live here:
  //   · "blob" was tested before "snapshot", so meterCategory "Storage" with
  //     subcategory "Blob Snapshot" was filed as object-storage and the snapshot
  //     rule never saw it.
  //   · the generic "networking" test came before NAT and public IP, so both
  //     collapsed into network-egress and their dedicated rules went silent.
  if (cat.includes("virtual machines") || cat.includes("compute") || sub.includes("virtual machines")) return "compute";

  // Snapshots first: the subcategory usually names the underlying blob/disk too.
  if (sub.includes("snapshot")) return "snapshot";
  if (cat.includes("storage") && (sub.includes("disk") || sub.includes("managed disk"))) return "block-storage";
  if (
    cat.includes("storage") &&
    (sub.includes("files") || sub.includes("azure files") || svc.includes("microsoft.storage/storageaccounts/fileservices"))
  ) {
    return "file-storage";
  }
  if (cat.includes("storage") && (sub.includes("blob") || sub.includes("general"))) return "object-storage";

  // NAT and public IPs before the generic networking bucket.
  if (cat.includes("nat gateway") || sub.includes("nat gateway") || sub.includes("nat")) return "nat";
  if (
    cat.includes("ip addresses") ||
    sub.includes("public ip") ||
    sub.includes("ip addresses") ||
    sub.includes("reserved ip")
  ) {
    return "ip-address";
  }
  if (cat.includes("networking") || cat.includes("bandwidth") || cat.includes("data transfer")) return "network-egress";

  if (cat.includes("sql") || cat.includes("cosmos") || cat.includes("database") || cat.includes("redis") || cat.includes("cache") || svc.includes("sql")) return "database";
  if (cat.includes("functions") || cat.includes("container") || svc.includes("functions")) return "serverless";
  return "other";
}

/**
 * Detect if a CSV is an Azure Cost Management export.
 */
export function isAzureFormat(headers: string[]): boolean {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  const azureIndicators = [
    "metercategory",
    "meter category",
    "costinbillingcurrency",
    "consumedservice",
    "consumed service",
    "subscriptionid",
    "subscription id",
    "resourcegroup",
    "resource group",
  ];
  return azureIndicators.filter((ind) => normalized.includes(ind)).length >= 2;
}

function azureSummaryDate(
  date: string | undefined,
  month: string | undefined,
  fallback: string | undefined
): { date: string; granularity: "daily" | "monthly" } {
  const raw = (date || month || "").trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return { date: `${raw}-01`, granularity: "monthly" };
  const normalized = normalizeDate(raw || fallback);
  return { date: normalized || fallback || "2000-01-01", granularity: date ? "daily" : "monthly" };
}

export function parseAzureCostAnalysisSummary(
  csvContent: string,
  diagnostics?: ParseDiagnostics
): NormalizedCostRecord[] {
  const table = getAzureTable(csvContent);
  const result = Papa.parse(table.csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim().toLowerCase(),
  });
  const rows = result.data as Record<string, string>[];
  const mappedRows = rows.map((row) => {
    const mapped: Record<string, string> = {};
    for (const [header, value] of Object.entries(row)) {
      const target = azureMappedColumn(header);
      if (target) mapped[target] = value?.trim() || "";
    }
    return mapped;
  });
  const detectedDecimal = detectDecimalSeparator(
    mappedRows.slice(0, DATE_ORDER_SAMPLE_SIZE).map((row) => row.cost)
  );
  // Microsoft Cost Details/Cost Analysis CSVs use invariant "." decimals.
  // Keep an explicitly detected comma locale, but resolve the otherwise
  // ambiguous "1.944" shape as 1.944 rather than 1,944.
  const decimalSeparator =
    detectedDecimal.separator === null && detectedDecimal.ambiguous
      ? { ...detectedDecimal, separator: "." as const, ambiguous: false }
      : detectedDecimal;
  noteDecimalSeparator(diagnostics, decimalSeparator);

  if (diagnostics) {
    diagnostics.sourceKind = "azure-cost-analysis-summary";
    diagnostics.totalRows = mappedRows.length;
    diagnostics.commitmentSignalAvailable = false;
  }

  const fallbackDate = metadataDate(table.metadata);
  const records: NormalizedCostRecord[] = [];
  const periods = new Set<string>();
  let granularity: "daily" | "monthly" = "monthly";
  const groupFields = table.headers
    .map((header) => header.trim())
    .filter((header) => {
      const key = normalizeAzureHeader(header);
      return [
        "date", "month", "servicename", "service", "resource", "resourceid",
        "resourcetype", "resourcegroup", "resourcegroupname", "subscriptionname", "location",
      ].includes(key);
    });

  for (const mapped of mappedRows) {
    const cost = coerceAmount(mapped.cost, decimalSeparator.separator ?? undefined);
    if (cost === null) {
      if (diagnostics && (mapped.cost || "").trim()) diagnostics.unparsableAmountRows++;
      continue;
    }
    if (cost < 0) {
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
    const period = azureSummaryDate(mapped.date, mapped.month, fallbackDate);
    granularity = period.granularity;
    periods.add(period.date);
    const service =
      mapped.serviceName
      || mapped.resourceType
      || mapped.resourceId
      || mapped.resourceGroup
      || mapped.subscriptionName
      || mapped.region
      || "Microsoft Azure";
    const usageType = mapped.meterName || mapped.resourceType || "Resumen de Cost Analysis";

    records.push({
      provider: "azure",
      category: categorizeAzure(service, usageType, service),
      nativeService: service,
      nativeUsageType: usageType,
      region: mapped.region || "global",
      date: period.date,
      cost,
      quantity: 0,
      accountId: mapped.subscriptionId || mapped.subscriptionName || "",
      chargeType: "Summary",
      resourceId: mapped.resourceId || undefined,
      resourceType: mapped.resourceType || undefined,
      pricing: {
        billingCurrency: mapped.billingCurrency || undefined,
      },
      source: {
        datasetType: "cost-and-usage",
        schemaVersion: "Azure Cost Analysis CSV summary",
        catalogSnapshot: "azure-services.json",
        extensions: {
          analysisLevel: "summary",
          granularity,
          summaryGroupByLabel: groupFields.join(" > ") || "Sin agrupación",
          resourceGroup: mapped.resourceGroup || "",
        },
      },
    });
  }

  if (diagnostics) {
    diagnostics.summaryGranularity = granularity;
    diagnostics.summaryPeriodCount = Math.max(1, periods.size);
    diagnostics.summaryGroupByLabel = groupFields.join(" > ") || "Sin agrupación";
    diagnostics.summaryGroupBy = groupFields.length > 0 ? groupFields.join(">") : "none";
  }
  return records;
}

/**
 * Parse Azure Cost Management export CSV into NormalizedCostRecords.
 *
 * `diagnostics` is optional; when supplied it accumulates dropped-row counts.
 * Azure is the format where amount coercion matters most: several regional
 * settings export comma-decimal amounts ("1.234,56").
 */
export function parseAzureCSV(
  csvContent: string,
  diagnostics?: ParseDiagnostics
): NormalizedCostRecord[] {
  const table = getAzureTable(csvContent);
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
      throw new Error(`Error parsing Azure CSV: ${critical.map((e) => e.message).join("; ")}`);
    }
  }

  const records: NormalizedCostRecord[] = [];

  // Map columns first so date order is decided once for the whole file.
  const mappedRows: Record<string, string>[] = (result.data as Record<string, string>[]).map(
    (row) => {
      const mapped: Record<string, string> = {};
      for (const [csvCol, value] of Object.entries(row)) {
        const normalizedCol = csvCol.toLowerCase().trim();
        const targetField = azureMappedColumn(normalizedCol);
        if (targetField) {
          mapped[targetField] = value?.trim() || "";
        }
      }
      return mapped;
    }
  );

  // Column PRESENCE (not per-row value) — whether this file is even capable of
  // saying "this charge is already committed". Checked against the raw headers,
  // not mappedRows, so a file where every value happens to be "OnDemand" still
  // counts as available (it truthfully has no commitments, vs a file that can't
  // say either way).
  const headers = (result.meta.fields || []).map((h) => h.toLowerCase().trim());
  if (diagnostics) {
    diagnostics.commitmentSignalAvailable = AZURE_COMMITMENT_COLUMNS.some((c) => headers.includes(c));
  }

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

  for (const mapped of mappedRows) {
    const cost = coerceAmount(mapped.cost, decimalSeparator.separator ?? undefined);
    if (cost === null) {
      if (diagnostics && (mapped.cost ?? "").trim() !== "") diagnostics.unparsableAmountRows++;
      continue;
    }
    // Tax and credits/refunds are excluded from the analysis but accounted for,
    // so the report can state gross vs net (see ParseDiagnostics.creditRows).
    const azureChargeType = (mapped.chargeType || "").toLowerCase().trim();
    if (azureChargeType === "tax") {
      if (diagnostics) {
        diagnostics.taxRows++;
        diagnostics.taxTotalUSD += Math.abs(cost);
      }
      continue;
    }
    if (
      azureChargeType === "credit" ||
      azureChargeType === "refund" ||
      azureChargeType === "adjustment" ||
      cost < 0
    ) {
      if (diagnostics) {
        diagnostics.creditRows++;
        diagnostics.creditTotalUSD += Math.abs(cost);
      }
      continue;
    }
    if (cost <= 0) continue;

    const date = normalizeDate(mapped.date, dateOrder.order);
    if (date === null) {
      if (diagnostics) diagnostics.unparsableDateRows++;
      continue;
    }

    const meterCategory = mapped.meterCategory || "";
    const meterSubCategory = mapped.meterSubCategory || "";
    const consumedService = mapped.consumedService || mapped.serviceName || "";
    const nativeService = consumedService || meterCategory || "Unknown";
    const nativeUsageType = [meterCategory, meterSubCategory, mapped.meterName].filter(Boolean).join("/");

    // PricingModel Reservation/SavingsPlan (or a ReservationId/BenefitId present
    // on the row) means this charge is already covered by a commitment —
    // missingCommitmentsRule reads commitmentDiscountId as its "has commitment"
    // signal, same as it does for FOCUS sources.
    const pricingModel = (mapped.pricingModel || "").toLowerCase().trim();
    const isCommitted = pricingModel === "reservation" || pricingModel === "savingsplan";
    const commitmentDiscountId =
      mapped.reservationId || mapped.benefitId || (isCommitted ? mapped.productOrderId : "");
    const quantity = coerceQuantity(mapped.quantity, diagnostics);

    records.push({
      provider: "azure",
      category: categorizeAzure(meterCategory, meterSubCategory, consumedService),
      nativeService,
      nativeUsageType: nativeUsageType || "Unknown",
      region: mapped.region || "unknown",
      date,
      cost,
      quantity,
      accountId: mapped.subscriptionId || "",
      chargeType: mapped.chargeType || "Usage",
      commitmentDiscountId: commitmentDiscountId || undefined,
      resourceId: mapped.resourceId || undefined,
      billingIdentity: {
        serviceId: mapped.serviceId || mapped.consumedService || undefined,
        productId: mapped.productId || undefined,
        skuId: mapped.skuId || undefined,
        meterId: mapped.meterId || undefined,
        invoiceId: mapped.invoiceId || undefined,
        billingProfileId: mapped.billingProfileId || undefined,
      },
      pricing: {
        billingCurrency: mapped.billingCurrency || undefined,
        pricingCategory: mapped.pricingModel || undefined,
        quantity,
        unit: mapped.pricingUnit || undefined,
        listUnitPrice:
          coerceAmount(mapped.listUnitPrice, decimalSeparator.separator ?? undefined) ?? undefined,
        effectiveUnitPrice:
          coerceAmount(mapped.effectiveUnitPrice, decimalSeparator.separator ?? undefined) ?? undefined,
      },
      source: {
        datasetType: "cost-and-usage",
        schemaVersion: "Azure Cost Management",
        catalogSnapshot: "azure-services.json",
        extensions: {
          serviceFamily: mapped.serviceFamily || "",
          productName: mapped.productName || "",
          invoiceSectionId: mapped.invoiceSectionId || "",
          tags: mapped.tags || "",
          costAllocationRule: mapped.costAllocationRule || "",
        },
      },
    });
  }

  return records;
}
