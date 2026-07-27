import Papa from "papaparse";
import {
  NormalizedCostRecord,
  CloudProvider,
  BillingDatasetType,
  SupplementalBillingRecord,
  BillingConceptCoverage,
} from "../types";
import { parseAWSCSV } from "./aws-parser";
import {
  isAWSCostExplorerSummary,
  parseAWSCostExplorerSummary,
} from "./aws-cost-explorer-parser";
import {
  getAzureTable,
  isAzureCostAnalysisSummary,
  parseAzureCostAnalysisSummary,
  parseAzureCSV,
} from "./azure-parser";
import {
  getGCPTable,
  isGCPConsoleSummary,
  parseGCPConsoleSummary,
  parseGCPCSV,
} from "./gcp-parser";
import {
  parseFOCUSCSV,
  parseFOCUSSupplementalCSV,
  isFOCUSFormat,
  detectFOCUSDataset,
  FOCUS_SIGNATURE,
  normalizeHeaderKey,
} from "./focus-parser";
import { ParseDiagnostics, createParseDiagnostics } from "./coerce";
import { buildBillingCoverage } from "../catalog";

export { parseAWSCSV, isAWSFormat, convertLegacyRecords } from "./aws-parser";
export {
  isAWSCostExplorerSummary,
  parseAWSCostExplorerSummary,
} from "./aws-cost-explorer-parser";
export {
  isAzureCostAnalysisSummary,
  parseAzureCostAnalysisSummary,
  parseAzureCSV,
  isAzureFormat,
} from "./azure-parser";
export {
  isGCPConsoleSummary,
  parseGCPConsoleSummary,
  parseGCPCSV,
  isGCPFormat,
} from "./gcp-parser";
export {
  parseFOCUSCSV,
  parseFOCUSSupplementalCSV,
  isFOCUSFormat,
  detectFOCUSDataset,
  normalizeHeaderKey,
} from "./focus-parser";
export {
  coerceAmount,
  normalizeDate,
  detectDateOrder,
  createParseDiagnostics,
  DEFAULT_AMBIGUOUS_DATE_ORDER,
} from "./coerce";
export type { ParseDiagnostics, DateOrder, DateOrderDetection } from "./coerce";

export interface ParseResult {
  records: NormalizedCostRecord[];
  supplementalRecords: SupplementalBillingRecord[];
  datasetType: BillingDatasetType;
  sourceSchemaVersion: string;
  schemaCoverage: BillingConceptCoverage;
  detectedProvider: CloudProvider | "unknown" | "focus-multi";
  /** True when format was detected as FOCUS (may carry multiple providers) */
  isFocus: boolean;
  /**
   * Rows dropped for an unreadable amount or date, plus any date-order assumption
   * the parser had to make. Optional so existing consumers of ParseResult keep
   * compiling; always populated by parseAs()/parseCSVAutoDetect().
   */
  diagnostics?: ParseDiagnostics;
}

// ─── Format detection ─────────────────────────────────────────────────────────

export type DetectedFormat = "focus" | "aws" | "azure" | "gcp";

export interface FormatDetection {
  /** null when nothing scored high enough to be recognized. */
  format: DetectedFormat | null;
  /** True when two native formats scored too close to call. */
  ambiguous: boolean;
  /** The two best candidates, when ambiguous. */
  candidates: DetectedFormat[];
  scores: Record<"aws" | "azure" | "gcp", number>;
  /**
   * FOCUS required columns that are missing. Only populated when the file
   * looks FOCUS-ish (has some FOCUS columns) but not enough to qualify —
   * the common case of deselecting columns in AWS Data Exports.
   */
  focusMissing: string[];
}

/**
 * Display names for the FOCUS signature columns, derived from the parser's own
 * signature so the two never drift. Used only to build the "you're missing these
 * columns" hint; the actual gate is isFOCUSFormat().
 */
const FOCUS_COLUMN_LABELS: Record<string, string> = {
  billedcost: "BilledCost",
  chargeperiodstart: "ChargePeriodStart",
  chargeperiodend: "ChargePeriodEnd",
  billingaccountid: "BillingAccountId",
  billingcurrency: "BillingCurrency",
  chargecategory: "ChargeCategory",
  effectivecost: "EffectiveCost",
  servicename: "ServiceName",
};

function focusLabel(key: string): string {
  return FOCUS_COLUMN_LABELS[key] ?? key;
}

/**
 * Scoring tables. Weight 3 = a token that effectively only appears in that
 * provider's export. Weight 1 = a token that provider uses but others may too.
 *
 * Why scoring instead of "at least N indicators": the old counting thresholds
 * produced both false positives and false negatives. isAWSFormat in particular
 * accepted any file with a `service` and a `cost` column, which swallowed
 * generic spreadsheets, third-party tool exports (Kubecost, Datadog,
 * Cloudability) and — worst — the GCP console cost table with short column
 * names, sealing every row with provider "aws".
 */
const EXCLUSIVE_TOKENS: Record<"aws" | "azure" | "gcp", string[]> = {
  aws: [
    "unblendedcost", "unblended cost", "amortizedcost", "amortized cost",
    "netunblendedcost", "netamortizedcost", "blendedcost",
  ],
  azure: [
    "metercategory", "meter category", "metersubcategory", "meter subcategory",
    "metername", "meter name", "meterid",
    "costinbillingcurrency", "pretaxcost",
    "consumedservice", "consumed service",
    "subscriptionid", "subscription id", "subscriptionname", "subscription name",
    "resourcegroup", "resource group", "resourcegroupname",
    "billingprofileid", "billingprofilename",
  ],
  gcp: [
    "service.description", "service_description",
    "sku.description", "sku_description",
    "project.id", "project_id", "project.name", "project_name",
    "billing_account_id",
    "location.region", "location_region", "location.location",
    "usage_start_time", "usage_end_time",
    "cost_amount", "usage_amount",
    "credits.amount", "cost_type",
  ],
};

/** Header prefixes unique to AWS CUR / Data Exports (dotted and snake_case). */
const AWS_PREFIXES = [
  "lineitem/", "bill/", "product/", "pricing/", "reservation/", "savingsplan/",
  "line_item_", "bill_", "product_", "pricing_", "reservation_", "savings_plan_",
  "identity/", "identity_",
];

const SHARED_TOKENS: Record<"aws" | "azure" | "gcp", string[]> = {
  aws: ["linked account", "usage type", "usagetype", "payer account id", "invoice id"],
  azure: ["costinusd", "usagedatetime", "usagequantity", "resourcelocation", "resource location", "unitofmeasure"],
  gcp: ["billing account id", "service description", "sku description", "project id", "usage amount", "sku", "folder_id"],
};

/** Minimum score to claim a format at all. */
const MIN_SCORE = 3;
/** Minimum lead over the runner-up; below this the file is ambiguous. */
const MIN_MARGIN = 2;

function scoreFormat(normalized: string[], key: "aws" | "azure" | "gcp"): number {
  let score = 0;
  for (const token of EXCLUSIVE_TOKENS[key]) {
    if (normalized.includes(token)) score += 3;
  }
  for (const token of SHARED_TOKENS[key]) {
    if (normalized.includes(token)) score += 1;
  }
  if (key === "aws") {
    // Any CUR-style namespaced column is decisive on its own.
    const hasPrefixed = normalized.some((h) => AWS_PREFIXES.some((p) => h.startsWith(p)));
    if (hasPrefixed) score += 3;
  }
  return score;
}

/**
 * Detects which billing export format a set of CSV headers belongs to.
 * Pure function over headers — no parsing, no side effects.
 *
 * FOCUS is a hard gate (all required columns present) rather than a score,
 * because the spec defines exactly what a conformant file must carry.
 */
export function detectFormat(headers: string[]): FormatDetection {
  const normalized = headers.map((h) => h.toLowerCase().trim());

  const empty: Record<"aws" | "azure" | "gcp", number> = { aws: 0, azure: 0, gcp: 0 };

  if (isFOCUSFormat(headers)) {
    return { format: "focus", ambiguous: false, candidates: [], scores: empty, focusMissing: [] };
  }

  if (isAWSCostExplorerSummary(headers)) {
    return {
      format: "aws",
      ambiguous: false,
      candidates: [],
      scores: { ...empty, aws: 3 },
      focusMissing: [],
    };
  }

  if (isAzureCostAnalysisSummary(headers)) {
    return {
      format: "azure",
      ambiguous: false,
      candidates: [],
      scores: { ...empty, azure: 3 },
      focusMissing: [],
    };
  }

  if (isGCPConsoleSummary(headers)) {
    return {
      format: "gcp",
      ambiguous: false,
      candidates: [],
      scores: { ...empty, gcp: 3 },
      focusMissing: [],
    };
  }

  // Partial FOCUS: carries some signature columns but not enough to qualify.
  // Same normalization the FOCUS parser applies to its own header keys, so the
  // detector and the parser can never disagree about what a column is called.
  const focusish = new Set(headers.map(normalizeHeaderKey));
  const missingMandatory = FOCUS_SIGNATURE.mandatory.filter((c) => !focusish.has(c));
  const presentCorroborating = FOCUS_SIGNATURE.corroborating.filter((c) => focusish.has(c));
  const looksFocus =
    missingMandatory.length < FOCUS_SIGNATURE.mandatory.length || presentCorroborating.length > 0;
  const focusMissing = looksFocus
    ? [
        ...missingMandatory.map(focusLabel),
        ...(presentCorroborating.length < FOCUS_SIGNATURE.minCorroborating
          ? [
              `al menos ${FOCUS_SIGNATURE.minCorroborating} de: ` +
                FOCUS_SIGNATURE.corroborating.map(focusLabel).join(", "),
            ]
          : []),
      ]
    : [];

  const scores = {
    aws: scoreFormat(normalized, "aws"),
    azure: scoreFormat(normalized, "azure"),
    gcp: scoreFormat(normalized, "gcp"),
  };

  const ranked = (Object.keys(scores) as ("aws" | "azure" | "gcp")[])
    .sort((a, b) => scores[b] - scores[a]);
  const [best, second] = ranked;

  if (scores[best] < MIN_SCORE) {
    return { format: null, ambiguous: false, candidates: [], scores, focusMissing };
  }

  if (scores[best] - scores[second] < MIN_MARGIN) {
    return { format: null, ambiguous: true, candidates: [best, second], scores, focusMissing };
  }

  return { format: best, ambiguous: false, candidates: [], scores, focusMissing };
}

/** Reads just the header row. Throws when the file has no usable header. */
export function readHeaders(csvContent: string): string[] {
  const headerResult = Papa.parse(csvContent, {
    header: true,
    preview: 1,
    skipEmptyLines: true,
  });

  const gcpTable = getGCPTable(csvContent);
  if (gcpTable.headerRowIndex > 0) return gcpTable.headers;
  const azureTable = getAzureTable(csvContent);
  if (azureTable.headerRowIndex > 0) return azureTable.headers;

  if (!headerResult.meta.fields || headerResult.meta.fields.length === 0) {
    throw new Error("No se pudieron detectar columnas en el CSV. Verifica que el archivo tiene encabezados.");
  }

  return headerResult.meta.fields;
}

/** Parses with the parser matching an already-decided format. */
export function parseAs(csvContent: string, format: DetectedFormat): ParseResult {
  const diagnostics = createParseDiagnostics();
  const headers = readHeaders(csvContent);
  const nativeDatasetType: BillingDatasetType = "cost-and-usage";
  switch (format) {
    case "focus": {
      const datasetType = detectFOCUSDataset(headers) ?? "cost-and-usage";
      const schemaCoverage = buildBillingCoverage("focus", datasetType, headers);
      const supplementalRecords =
        datasetType === "cost-and-usage"
          ? []
          : parseFOCUSSupplementalCSV(csvContent, datasetType);
      return {
        records: datasetType === "cost-and-usage" ? parseFOCUSCSV(csvContent, diagnostics) : [],
        supplementalRecords,
        datasetType,
        sourceSchemaVersion: schemaCoverage.sourceSchemaVersion,
        schemaCoverage,
        detectedProvider: "focus-multi",
        isFocus: true,
        diagnostics,
      };
    }
    case "azure":
      if (isAzureCostAnalysisSummary(headers)) {
        return {
          records: parseAzureCostAnalysisSummary(csvContent, diagnostics),
          supplementalRecords: [],
          datasetType: nativeDatasetType,
          sourceSchemaVersion: "Azure Cost Analysis CSV summary",
          schemaCoverage: buildBillingCoverage("azure", nativeDatasetType, headers),
          detectedProvider: "azure",
          isFocus: false,
          diagnostics,
        };
      }
      return {
        records: parseAzureCSV(csvContent, diagnostics),
        supplementalRecords: [],
        datasetType: nativeDatasetType,
        sourceSchemaVersion: headers.some((header) =>
          ["benefitid", "benefitname", "provider", "frequency"].includes(
            header.toLowerCase().replace(/[\s_-]+/g, "")
          )
        )
          ? "Azure Cost Details 2023-12-01-preview"
          : "Azure Cost Management",
        schemaCoverage: buildBillingCoverage("azure", nativeDatasetType, headers),
        detectedProvider: "azure",
        isFocus: false,
        diagnostics,
      };
    case "gcp":
      if (isGCPConsoleSummary(headers)) {
        return {
          records: parseGCPConsoleSummary(csvContent, diagnostics),
          supplementalRecords: [],
          datasetType: nativeDatasetType,
          sourceSchemaVersion: "GCP Cost table/Reports CSV summary",
          schemaCoverage: buildBillingCoverage("gcp", nativeDatasetType, headers),
          detectedProvider: "gcp",
          isFocus: false,
          diagnostics,
        };
      }
      return {
        records: parseGCPCSV(csvContent, diagnostics),
        supplementalRecords: [],
        datasetType: nativeDatasetType,
        sourceSchemaVersion: headers.some((header) =>
          ["resource.global_name", "resource_global_name", "subscription.instance_id"].includes(
            header.toLowerCase().trim()
          )
        )
          ? "GCP BigQuery Detailed Usage Cost Export"
          : "GCP BigQuery Standard Usage Cost Export",
        schemaCoverage: buildBillingCoverage("gcp", nativeDatasetType, headers),
        detectedProvider: "gcp",
        isFocus: false,
        diagnostics,
      };
    case "aws":
      if (isAWSCostExplorerSummary(headers)) {
        return {
          records: parseAWSCostExplorerSummary(csvContent, diagnostics),
          supplementalRecords: [],
          datasetType: nativeDatasetType,
          sourceSchemaVersion: "AWS Cost Explorer CSV summary",
          schemaCoverage: buildBillingCoverage("aws", nativeDatasetType, headers),
          detectedProvider: "aws",
          isFocus: false,
          diagnostics,
        };
      }
      return {
        records: parseAWSCSV(csvContent, diagnostics),
        supplementalRecords: [],
        datasetType: nativeDatasetType,
        sourceSchemaVersion: headers.some((header) => header.toLowerCase().startsWith("line_item_"))
          ? "AWS CUR 2.0"
          : "AWS CUR/Cost Explorer",
        schemaCoverage: buildBillingCoverage("aws", nativeDatasetType, headers),
        detectedProvider: "aws",
        isFocus: false,
        diagnostics,
      };
  }
}

/**
 * Auto-detect CSV format and parse accordingly.
 *
 * There is deliberately NO fallback to the AWS parser when detection fails.
 * The previous version tried parseAWSCSV anyway and, if it happened to return
 * rows, labelled the file "aws" — which stamped provider "aws" onto data from
 * other clouds and onto files that were not billing exports at all.
 */
export function parseCSVAutoDetect(csvContent: string): ParseResult {
  const headers = readHeaders(csvContent);
  const detection = detectFormat(headers);

  if (detection.format) return parseAs(csvContent, detection.format);

  if (detection.ambiguous) {
    throw new Error(
      "No se pudo determinar con seguridad de qué proveedor es este archivo " +
      `(coincide parcialmente con ${detection.candidates.join(" y ")}). ` +
      "Exporta el archivo de facturación directamente de tu proveedor, o usa el formato FOCUS."
    );
  }

  if (detection.focusMissing.length > 0) {
    throw new Error(
      `El archivo parece FOCUS pero le faltan columnas obligatorias: ${detection.focusMissing.join(", ")}. ` +
      "Vuelve a generar el export incluyéndolas."
    );
  }

  throw new Error(
    "No se pudo detectar el formato del CSV. " +
    "Formatos soportados: FOCUS 1.0–1.4, AWS Cost Explorer/CUR, Azure Cost Management Export, GCP Cloud Billing Export."
  );
}
