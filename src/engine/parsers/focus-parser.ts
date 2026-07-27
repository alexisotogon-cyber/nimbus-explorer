import Papa from "papaparse";
import {
  NormalizedCostRecord,
  CostCategory,
  BillingDatasetType,
  SupplementalBillingRecord,
} from "../types";
import { categorizeGCP } from "./gcp-parser";
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

/**
 * FOCUS 1.0–1.4 CSV Parser — FinOps Open Cost and Usage Specification
 * https://focus.finops.org/
 *
 * AWS, Azure, GCP, Oracle, and Alibaba export billing natively in this format.
 * AWS path (verified): Billing and Cost Management console → Data Exports
 *   → Create export → Standard data export → Table: "FOCUS 1.0 with AWS columns"
 *   Ref: https://docs.aws.amazon.com/cur/latest/userguide/dataexports-create-standard.html
 */

/**
 * FOCUS detection signature, two tiers (header names normalized to letters only,
 * so "Charge Period Start" / "charge_period_start" / "ChargePeriodStart" all match).
 *
 * Why not ProviderName or ServiceCategory as part of the signature:
 *   - ProviderName (and PublisherName) were REMOVED in FOCUS 1.4, superseded by
 *     ServiceProviderName / HostProviderName. Requiring it rejects every 1.4 file.
 *   - ServiceCategory is mandatory in the spec but Google Cloud's FOCUS export does
 *     not emit the column at all (documented conformance gap, mitigation "None":
 *     https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/focus-export).
 *     Requiring it rejects every legitimate GCP FOCUS export.
 *
 * So the gate is: both mandatory columns, plus at least two corroborating columns
 * (enough to separate a FOCUS export from an arbitrary spreadsheet that happens to
 * have a "billed cost" column).
 */
const FOCUS_MANDATORY_HEADERS = ["billedcost", "chargeperiodstart"];

const FOCUS_CORROBORATING_HEADERS = [
  "chargeperiodend",
  "billingaccountid",
  "billingcurrency",
  "chargecategory",
  "effectivecost",
  "servicename",
];

const MIN_CORROBORATING = 2;

const SUPPLEMENTAL_SIGNATURES: Array<{
  datasetType: Exclude<BillingDatasetType, "cost-and-usage">;
  required: string[];
}> = [
  {
    datasetType: "contract-commitment",
    required: ["contractcommitmentid", "contractcommitmentperiodstart", "contractcommitmentperiodend"],
  },
  {
    datasetType: "invoice-detail",
    required: ["invoicedetailid", "invoiceid", "invoiceissuername"],
  },
  {
    datasetType: "billing-period",
    required: ["billingperiodstart", "billingperiodend", "billingperiodstatus", "invoiceissuername"],
  },
];

/**
 * Single definition of how a FOCUS header becomes a lookup key. Digits are kept
 * (x_* vendor columns and "FOCUS 1.0" style names may carry them); anything else
 * that is not a letter or digit is dropped, so "Billed Cost", "billed_cost" and
 * "BilledCost" all land on "billedcost".
 */
export function normalizeHeaderKey(header: string): string {
  return header.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

function normalizeHeaders(headers: string[]): Set<string> {
  return new Set(headers.map(normalizeHeaderKey));
}

/** Map a provider-name column to internal CloudProvider. */
function mapProvider(raw: string): NormalizedCostRecord["provider"] {
  const lc = raw.toLowerCase().trim();
  if (lc.includes("aws") || lc.includes("amazon")) return "aws";
  if (lc.includes("microsoft") || lc.includes("azure")) return "azure";
  if (lc.includes("google")) return "gcp";
  return "unknown";
}

// ─── ServiceSubcategory → CostCategory (FOCUS 1.1+) ──────────────────────────

/**
 * ServiceSubcategory is Recommended from FOCUS 1.1 and each of its 82 allowed
 * values belongs to exactly one ServiceCategory. When present it is the exact
 * discriminator we need — no keyword guessing.
 *
 * The `Other (...)` values carry no discriminating information, so they are
 * deliberately absent here and fall through to the ServiceCategory tier.
 */
const SUBCATEGORY_MAP: Record<string, CostCategory> = {
  // Storage
  "block storage": "block-storage",
  "object storage": "object-storage",
  "backup storage": "snapshot",
  "file storage": "file-storage",
  "storage platforms": "other",
  // Compute
  "serverless compute": "serverless",
  containers: "compute",
  "virtual machines": "compute",
  "end user computing": "compute",
  "quantum compute": "compute",
  // Databases
  caching: "database",
  "data warehouses": "database",
  "ledger databases": "database",
  "nosql databases": "database",
  "relational databases": "database",
  "time series databases": "database",
  // AI and Machine Learning
  "ai platforms": "ai-ml",
  bots: "ai-ml",
  "generative ai": "ai-ml",
  "machine learning": "ai-ml",
  "natural language processing": "ai-ml",
  // Networking — our model has no generic "network" bucket, egress is the catch-all.
  "application networking": "network-egress",
  "content delivery": "network-egress",
  "network connectivity": "network-egress",
  "network infrastructure": "network-egress",
  "network routing": "network-egress",
  "network security": "network-egress",
};

/** Normalizes a FOCUS enum value: case and surrounding/inner whitespace only. */
function normalizeEnum(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Storage subdivision the spec does not express in ServiceCategory but the engine
 * needs (block vs object vs snapshot rules are distinct).
 */
function subdivideStorage(hints: string): CostCategory {
  if (hints.includes("snapshot")) return "snapshot";
  if (
    hints.includes("block") ||
    hints.includes("disk") ||
    hints.includes("volume") ||
    hints.includes("ebs")
  ) {
    return "block-storage";
  }
  return "object-storage";
}

/** Same idea for Networking: NAT and idle public IPs have their own rules. */
function subdivideNetworking(hints: string): CostCategory {
  if (hints.includes("nat gateway") || hints.includes("nat-gateway") || hints.includes("natgateway")) {
    return "nat";
  }
  // The hints are ChargeDescription + SkuId, and SkuIds are written without
  // spaces: an idle Elastic IP arrives as "USE1-PublicIPv4:IdleAddress", which
  // matched none of the spaced variants and was filed as generic egress. Both
  // spellings are accepted now.
  if (
    hints.includes("ip address") ||
    hints.includes("ipaddress") ||
    hints.includes("elastic ip") ||
    hints.includes("elasticip") ||
    hints.includes("public ip") ||
    hints.includes("publicip") ||
    hints.includes("idleaddress") ||
    hints.includes("idle address")
  ) {
    return "ip-address";
  }
  return "network-egress";
}

/**
 * ServiceCategory has EXACTLY 19 allowed values in FOCUS and is Mandatory with no
 * nulls. Only exact (case/whitespace-normalized) matches are accepted — the
 * previous version also accepted "Serverless", "AI/ML", "AI & Machine Learning"
 * and "Machine Learning", none of which are spec values, which silently invited
 * non-conformant input.
 */
function fromServiceCategory(category: string, hints: string): CostCategory | null {
  switch (category) {
    case "compute":
      return "compute";
    case "storage":
      return subdivideStorage(hints);
    case "databases":
      return "database";
    case "networking":
      return subdivideNetworking(hints);
    case "ai and machine learning":
      return "ai-ml";
    // Remaining spec values have no dedicated waste rule in this engine:
    // Analytics, Business Applications, Developer Tools, Multicloud, Identity,
    // Integration, Internet of Things, Management and Governance, Media,
    // Migration, Mobile, Security, Web, Other.
    case "analytics":
    case "business applications":
    case "developer tools":
    case "multicloud":
    case "identity":
    case "integration":
    case "internet of things":
    case "management and governance":
    case "media":
    case "migration":
    case "mobile":
    case "security":
    case "web":
    case "other":
      return "other";
    default:
      // Not a spec value — treat as absent and let the next tier try.
      return null;
  }
}

/**
 * Three-tier classification, most precise signal first:
 *   1. ServiceSubcategory (FOCUS 1.1+) — exact, no guessing.
 *   2. ServiceCategory — the 19 spec values, with Storage/Networking subdivided
 *      by ChargeDescription/SkuId hints the engine needs.
 *   3. ServiceName + hints — the GCP case, where neither category column exists.
 *      Without this tier a conformant Google FOCUS export classifies every row as
 *      "other" and the whole report comes back empty, silently.
 */
function classifyRecord(
  serviceCategory: string,
  serviceSubcategory: string,
  serviceName: string,
  skuId: string,
  chargeDescription: string
): CostCategory {
  const hints = (chargeDescription + " " + skuId).toLowerCase();

  const sub = normalizeEnum(serviceSubcategory);
  if (sub) {
    const mapped = SUBCATEGORY_MAP[sub];
    // Networking subcategories still get the NAT / idle-IP subdivision applied:
    // the spec has no subcategory that distinguishes a NAT gateway from a public IP
    // (both are "Network Infrastructure"), and those two have dedicated rules.
    // This only refines within Networking, it never reclassifies across categories.
    if (mapped === "network-egress") return subdivideNetworking(hints);
    if (mapped) return mapped;
  }

  const cat = normalizeEnum(serviceCategory);
  if (cat) {
    const mapped = fromServiceCategory(cat, hints);
    if (mapped) return mapped;
  }

  // Tier 3 — shared with the native GCP parser, never duplicated.
  return categorizeGCP(serviceName, hints);
}

/**
 * Detect if a CSV uses FOCUS format.
 * See FOCUS_MANDATORY_HEADERS / FOCUS_CORROBORATING_HEADERS for the rationale.
 */
export function isFOCUSFormat(headers: string[]): boolean {
  if (detectFOCUSDataset(headers) !== null) return true;
  return false;
}

export function detectFOCUSDataset(headers: string[]): BillingDatasetType | null {
  const normalized = normalizeHeaders(headers);
  // CostAndUsage 1.4 legitimately includes invoice reference columns. Prefer
  // its mandatory signature before checking supplemental datasets, otherwise
  // the complete 65-column schema is misclassified as InvoiceDetail.
  if (FOCUS_MANDATORY_HEADERS.every((req) => normalized.has(req))) {
    const corroborating = FOCUS_CORROBORATING_HEADERS.filter((h) => normalized.has(h)).length;
    if (corroborating >= MIN_CORROBORATING) return "cost-and-usage";
  }
  for (const signature of SUPPLEMENTAL_SIGNATURES) {
    if (signature.required.every((required) => normalized.has(required))) {
      return signature.datasetType;
    }
  }
  return null;
}

/** Exposed so the format-detection layer can explain what a near-FOCUS file is missing. */
export const FOCUS_SIGNATURE = {
  mandatory: FOCUS_MANDATORY_HEADERS,
  corroborating: FOCUS_CORROBORATING_HEADERS,
  minCorroborating: MIN_CORROBORATING,
};

export function parseFOCUSSupplementalCSV(
  csvContent: string,
  datasetType: Exclude<BillingDatasetType, "cost-and-usage">
): SupplementalBillingRecord[] {
  const result = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => normalizeHeaderKey(header),
  });
  if (result.errors.some((error) => error.type === "FieldMismatch" || error.type === "Quotes")) {
    throw new Error(`Error al parsear dataset FOCUS ${datasetType}.`);
  }
  const rows = result.data as Record<string, string>[];
  if (datasetType === "billing-period") {
    return rows.map((row) => ({
      datasetType,
      invoiceIssuerName: row["invoiceissuername"] || "",
      billingPeriodStart: row["billingperiodstart"] || "",
      billingPeriodEnd: row["billingperiodend"] || "",
      status: row["billingperiodstatus"] || undefined,
      createdAt: row["billingperiodcreated"] || undefined,
      lastUpdatedAt: row["billingperiodlastupdated"] || undefined,
    }));
  }
  if (datasetType === "contract-commitment") {
    return rows.map((row) => ({
      datasetType,
      contractCommitmentId: row["contractcommitmentid"] || "",
      contractId: row["contractid"] || undefined,
      serviceProviderName: row["serviceprovidername"] || undefined,
      category: row["contractcommitmentcategory"] || undefined,
      type: row["contractcommitmenttype"] || undefined,
      status: row["contractcommitmentlifecyclestatus"] || undefined,
      periodStart: row["contractcommitmentperiodstart"] || undefined,
      periodEnd: row["contractcommitmentperiodend"] || undefined,
      quantity: coerceAmount(row["contractcommitmentquantity"]) ?? undefined,
      unit: row["contractcommitmentunit"] || undefined,
      cost: coerceAmount(row["contractcommitmentcost"]) ?? undefined,
      billingCurrency: row["billingcurrency"] || undefined,
    }));
  }
  return rows.map((row) => ({
    datasetType,
    invoiceDetailId: row["invoicedetailid"] || "",
    invoiceId: row["invoiceid"] || undefined,
    invoiceIssuerName: row["invoiceissuername"] || undefined,
    chargeCategory: row["chargecategory"] || undefined,
    description: row["invoicedetaildescription"] || undefined,
    billedCost: coerceAmount(row["billedcost"]) ?? undefined,
    billingCurrency: row["billingcurrency"] || undefined,
    invoiceIssueDate: row["invoiceissuedate"] || undefined,
    paymentDueDate: row["paymentduedate"] || undefined,
    status: row["invoiceissuestatus"] || undefined,
  }));
}

/**
 * Parse a FOCUS 1.0–1.4 CSV string into NormalizedCostRecords.
 *
 * `diagnostics` is optional: pass one to learn how many rows were dropped because
 * their amount or date was unreadable (see ParseDiagnostics for why this is a
 * parameter rather than a changed return type).
 */
export function parseFOCUSCSV(
  csvContent: string,
  diagnostics?: ParseDiagnostics
): NormalizedCostRecord[] {
  const result = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    // MUST match normalizeHeaders() below, which is what isFOCUSFormat() and
    // detectFormat() use. When this only did `trim().toLowerCase()`, a file with
    // spaced headers ("Billed Cost", "Charge Period Start") passed detection and
    // then every `row["billedcost"]` lookup came back undefined: 0 rows parsed out
    // of 14 and a $0.00 report. Same normalization on both sides or they drift.
    transformHeader: (h: string) => normalizeHeaderKey(h),
  });

  if (result.errors.length > 0) {
    const critical = result.errors.filter((e) => e.type === "FieldMismatch" || e.type === "Quotes");
    if (critical.length > 0) {
      throw new Error(`Error al parsear FOCUS CSV: ${critical.map((e) => e.message).join("; ")}`);
    }
  }

  const records: NormalizedCostRecord[] = [];
  const rows = result.data as Record<string, string>[];

  // Date component order is resolved ONCE for the whole file (see detectDateOrder).
  const dateOrder = detectDateOrder(
    rows.slice(0, DATE_ORDER_SAMPLE_SIZE).map((r) => r["chargeperiodstart"])
  );
  noteDateOrder(diagnostics, dateOrder);

  // Sample BOTH cost columns — either one alone could miss the file's decimal
  // separator evidence if it happens to be all round numbers.
  const decimalSeparator = detectDecimalSeparator(
    rows.slice(0, DATE_ORDER_SAMPLE_SIZE).flatMap((r) => [r["billedcost"], r["effectivecost"]])
  );
  noteDecimalSeparator(diagnostics, decimalSeparator);
  if (diagnostics) diagnostics.totalRows = rows.length;

  // Column PRESENCE: CommitmentDiscountId is a real FOCUS column (spec-mandatory
  // to exist when the generator supports commitment discounts at all), and
  // x_Credits is GCP's own extension carrying the same signal when
  // CommitmentDiscountId is left empty (documented GCP conformance gap).
  if (diagnostics) {
    const headers = (result.meta.fields || []).map((h) => normalizeHeaderKey(h));
    diagnostics.commitmentSignalAvailable =
      headers.includes("commitmentdiscountid") || headers.includes("x_credits");
  }

  for (const row of rows) {
    // BilledCost (cash basis) and EffectiveCost (accrual basis) are NOT synonyms.
    // Track column presence separately from value, since 0 is a meaningful value.
    const hasBilled = row["billedcost"] !== undefined;
    const hasEffective = row["effectivecost"] !== undefined;
    // null means "column present but unreadable", which is NOT the same as 0.
    const billedValue = hasBilled ? coerceAmount(row["billedcost"], decimalSeparator.separator ?? undefined) : null;
    const effectiveValue = hasEffective ? coerceAmount(row["effectivecost"], decimalSeparator.separator ?? undefined) : null;
    const billedCost = billedValue ?? 0;
    const effectiveCost = effectiveValue ?? 0;

    const chargeCategory = row["chargecategory"] || row["chargesubcategory"] || "Usage";

    // Commitment purchase guard (FOCUS spec, double-counting warning): a purchase
    // that pre-pays future usage appears as ChargeCategory "Purchase" with
    // BilledCost > 0 and EffectiveCost 0. Summing it alongside the usage charges it
    // covers double-counts the same money. Kept explicit rather than relying on the
    // accrual basis making cost 0 — this is a spec rule, not a side effect.
    if (chargeCategory.toLowerCase().trim() === "purchase" && billedCost > 0 && effectiveCost === 0) {
      if (diagnostics) {
        diagnostics.commitmentPurchaseRows++;
        diagnostics.commitmentPurchaseTotalUSD += Math.abs(billedCost);
      }
      continue;
    }

    // The engine analyses accrual basis when available: waste belongs to the period
    // in which the capacity was consumed, not the period it was invoiced.
    // EffectiveCost is only preferred when it actually READ as a number; an
    // unreadable EffectiveCost falls back to BilledCost instead of becoming 0.
    const cost = effectiveValue !== null ? effectiveValue : billedValue;
    if (cost === null) {
      // Both cost columns unreadable. Dropped, but counted — the old code turned
      // this into 0 and let the `cost <= 0` filter hide it. An empty cell counts as
      // missing data rather than garbage, so it is not reported as unreadable.
      const hadContent =
        (row["billedcost"] ?? "").trim() !== "" || (row["effectivecost"] ?? "").trim() !== "";
      if (diagnostics && hadContent) diagnostics.unparsableAmountRows++;
      continue;
    }
    // Skip non-Usage charge types (Tax, etc.) for analysis
    const chargeCategoryLc = chargeCategory.toLowerCase().trim();
    if (chargeCategoryLc === "tax") {
      if (diagnostics) {
        diagnostics.taxRows++;
        diagnostics.taxTotalUSD += Math.abs(billedValue ?? effectiveValue ?? 0);
      }
      continue;
    }

    // Credits and corrections. The engine still analyses GROSS usage (a credit is
    // not evidence that a disk stopped being unattached), but the amount is now
    // accounted for instead of vanishing into `cost <= 0`, so the report can state
    // gross vs net rather than quietly overstating the bill.
    const chargeClassLc = (row["chargeclass"] || "").toLowerCase().trim();
    const isCredit =
      chargeCategoryLc === "credit" ||
      chargeCategoryLc === "adjustment" ||
      chargeClassLc === "correction" ||
      cost < 0;
    if (isCredit) {
      if (diagnostics) {
        diagnostics.creditRows++;
        diagnostics.creditTotalUSD += Math.abs(cost);
      }
      continue;
    }

    if (cost <= 0) continue;

    // Provider columns across FOCUS versions: ProviderName (≤1.3) was removed in
    // 1.4 and replaced by ServiceProviderName (who makes the service available) and
    // HostProviderName (underlying infrastructure). PublisherName is the legacy
    // last resort.
    const providerRaw =
      row["providername"] ||
      row["serviceprovidername"] ||
      row["hostprovidername"] ||
      row["publishername"] ||
      "";
    const provider = mapProvider(providerRaw);

    const serviceCategory = row["servicecategory"] || "";
    const serviceSubcategory = row["servicesubcategory"] || "";
    const skuId = row["skuid"] || "";
    const chargeDescription = row["chargedescription"] || row["skudescription"] || "";
    const nativeService = row["servicename"] || row["publishername"] || "Unknown";

    const category = classifyRecord(
      serviceCategory,
      serviceSubcategory,
      nativeService,
      skuId,
      chargeDescription
    );

    const nativeUsageType = chargeDescription || skuId || row["resourcetype"] || "Unknown";

    // Date: ChargePeriodStart → YYYY-MM-DD, validated. Never a raw string: the day
    // key drives `total / distinctDays * 30` in every rule, so "01/02/2026" and
    // "2026-02-01" must not count as two different days.
    const rawDate = row["chargeperiodstart"] || "";
    const date = normalizeDate(rawDate, dateOrder.order);
    if (date === null) {
      if (diagnostics) diagnostics.unparsableDateRows++;
      continue;
    }

    const quantity = coerceQuantity(
      row["consumedquantity"] || row["pricingquantity"] || "",
      diagnostics
    );

    const accountId =
      row["subaccountid"] || row["billingaccountid"] || row["subaccountname"] || "";

    // FOCUS commitment signal (F1-1). GCP's FOCUS export leaves
    // CommitmentDiscountId empty (documented conformance gap — CUDs live in its
    // own x_Credits extension column instead, see gcp-parser.ts). Substring check
    // rather than JSON.parse: x_Credits' exact shape isn't standardized and a
    // malformed blob shouldn't throw mid-parse. SUSTAINED_USAGE_DISCOUNT is
    // GCP's automatic, no-commitment discount and must NOT count as one.
    const xCredits = row["x_credits"] || "";
    const hasCommittedUseCredit = /committed_usage_discount/i.test(xCredits);
    const commitmentDiscountId =
      row["commitmentdiscountid"] || (hasCommittedUseCredit ? "gcp-cud-detected" : "");

    // P2: resource-level identifiers
    const resourceId = row["resourceid"] || row["resource_id"] || "";
    const resourceType = row["resourcetype"] || row["resource_type"] || "";

    const record: NormalizedCostRecord = {
      provider,
      category,
      nativeService,
      nativeUsageType,
      region: row["regionid"] || row["regionname"] || row["availabilityzone"] || "unknown",
      date,
      cost,
      quantity,
      accountId,
      chargeType: chargeCategory || "Usage",
      commitmentDiscountId: commitmentDiscountId || undefined,
      resourceId: resourceId || undefined,
      resourceType: resourceType || undefined,
      billingIdentity: {
        serviceId: row["serviceid"] || undefined,
        skuId: skuId || undefined,
        skuPriceId: row["skupriceid"] || undefined,
        meterId: row["skumeter"] || undefined,
        invoiceId: row["invoiceid"] || undefined,
      },
      pricing: {
        billingCurrency: row["billingcurrency"] || undefined,
        pricingCurrency: row["pricingcurrency"] || undefined,
        pricingCategory: row["pricingcategory"] || undefined,
        quantity:
          coerceAmount(row["pricingquantity"], decimalSeparator.separator ?? undefined) ?? undefined,
        unit: row["pricingunit"] || row["consumedunit"] || undefined,
        listCost: coerceAmount(row["listcost"], decimalSeparator.separator ?? undefined) ?? undefined,
        contractedCost:
          coerceAmount(row["contractedcost"], decimalSeparator.separator ?? undefined) ?? undefined,
        listUnitPrice:
          coerceAmount(row["listunitprice"], decimalSeparator.separator ?? undefined) ?? undefined,
        contractedUnitPrice:
          coerceAmount(row["contractedunitprice"], decimalSeparator.separator ?? undefined) ?? undefined,
      },
      source: {
        datasetType: "cost-and-usage",
        schemaVersion:
          row["serviceprovidername"] !== undefined && row["providername"] === undefined
            ? "FOCUS 1.4"
            : "FOCUS 1.0-1.3/provider export",
        catalogSnapshot: "focus-1.4.json",
        extensions: {
          xCredits,
          tags: row["tags"] || "",
          contractApplied: row["contractapplied"] || "",
          commitmentProgramEligibilityDetails:
            row["commitmentprogrameligibilitydetails"] || "",
        },
      },
    };

    // Only surface the two bases when they actually read as numbers.
    if (billedValue !== null) record.billedCost = billedValue;
    if (effectiveValue !== null) record.effectiveCost = effectiveValue;
    if (serviceSubcategory) record.serviceSubcategory = serviceSubcategory;

    if (provider === "unknown" && providerRaw) {
      record.providerRaw = providerRaw;
    }

    records.push(record);
  }

  return records;
}
