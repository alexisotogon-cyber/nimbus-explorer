import Papa from "papaparse";
import { CostCategory, NormalizedCostRecord } from "../types";
import {
  coerceAmount,
  normalizeDate,
  ParseDiagnostics,
} from "./coerce";

export type AWSCostExplorerGranularity = "hourly" | "daily" | "monthly";

type SummaryDimension =
  | "none"
  | "service"
  | "linked-account"
  | "region"
  | "instance-type"
  | "usage-type"
  | "usage-type-group"
  | "resource"
  | "cost-category"
  | "tag"
  | "api-operation"
  | "availability-zone"
  | "platform"
  | "purchase-option"
  | "tenancy"
  | "database-engine"
  | "billing-entity"
  | "legal-entity"
  | "charge-type"
  | "payer-account"
  | "other";

const DIMENSION_ALIASES: Record<string, SummaryDimension> = {
  service: "service",
  servicio: "service",
  "linked account": "linked-account",
  "cuenta vinculada": "linked-account",
  region: "region",
  "instance type": "instance-type",
  "tipo de instancia": "instance-type",
  "usage type": "usage-type",
  "tipo de uso": "usage-type",
  "usage type group": "usage-type-group",
  "grupo de tipo de uso": "usage-type-group",
  resource: "resource",
  recurso: "resource",
  "cost category": "cost-category",
  "categoria de costos": "cost-category",
  tag: "tag",
  etiqueta: "tag",
  "api operation": "api-operation",
  "operacion de la api": "api-operation",
  "availability zone": "availability-zone",
  "zona de disponibilidad": "availability-zone",
  platform: "platform",
  plataforma: "platform",
  "purchase option": "purchase-option",
  "opcion de compra": "purchase-option",
  tenancy: "tenancy",
  tenencia: "tenancy",
  "database engine": "database-engine",
  "motor de base de datos": "database-engine",
  "billing entity": "billing-entity",
  "entidad de facturacion": "billing-entity",
  "legal entity": "legal-entity",
  "entidad juridica": "legal-entity",
  "charge type": "charge-type",
  "tipo de cargo": "charge-type",
  "payer account": "payer-account",
  "cuenta del pagador": "payer-account",
};

function normalizedLabel(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isTotalCostHeader(value: string): boolean {
  const label = normalizedLabel(value).replace(/\s/g, "");
  return (
    /^(totalcosts?|coststotal|costostotales?|costetotal|costestotales)/.test(label) ||
    /^(unblended|netunblended|amortized|netamortized)costs?/.test(label)
  );
}

function hasCurrencySuffix(value: string): boolean {
  return /\(\s*(?:\$|usd|eur|gbp|mxn|cad|aud|jpy)\s*\)\s*$/i.test(value.trim());
}

function measureParts(value: string): { group: string; unit: string } | null {
  const match = value.trim().match(/^(.*?)\(\s*([^)]+?)\s*\)\s*$/);
  if (!match) return null;
  return { group: match[1].trim(), unit: match[2].trim() };
}

function isCurrencyUnit(unit: string): boolean {
  return /^(?:\$|usd|eur|gbp|mxn|cad|aud|jpy)$/i.test(unit.trim());
}

function isTotalUsageHeader(value: string): boolean {
  const parts = measureParts(value);
  if (!parts || isCurrencyUnit(parts.unit)) return false;
  const group = normalizedLabel(parts.group);
  return group === "total usage" || group === "uso total" || group.startsWith("total ");
}

function stripCurrencySuffix(value: string): string {
  return value
    .replace(/\s*\(\s*(?:\$|usd|eur|gbp|mxn|cad|aud|jpy)\s*\)\s*$/i, "")
    .trim();
}

function dimensionFromHeader(header: string): SummaryDimension {
  const label = normalizedLabel(header);
  if (!label) return "none";
  return DIMENSION_ALIASES[label] ?? "other";
}

function looksLikePeriod(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}(?::\d{2}(?::\d{2})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(
    value.trim()
  );
}

function isAggregateRow(value: string): boolean {
  const label = normalizedLabel(value);
  return (
    label === "total" ||
    label.endsWith(" total") ||
    label.endsWith(" en total") ||
    label.startsWith("total ")
  );
}

function inferGranularity(periods: string[]): AWSCostExplorerGranularity {
  if (periods.some((period) => /[T\s]\d{2}/.test(period))) return "hourly";
  const dates = periods
    .map((period) => new Date(`${period.slice(0, 10)}T00:00:00Z`))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (
    dates.length > 1 &&
    dates.every((date) => date.getUTCDate() === 1) &&
    dates.slice(1).every((date, index) => {
      const days = (date.getTime() - dates[index].getTime()) / 86_400_000;
      return days >= 27;
    })
  ) {
    return "monthly";
  }
  return "daily";
}

function categoryFromService(service: string): CostCategory {
  const value = service.toLowerCase();
  if (
    value.includes("bedrock") ||
    value.includes("sagemaker") ||
    value.includes("machine learning") ||
    value.includes("comprehend") ||
    value.includes("rekognition") ||
    value.includes("textract")
  ) return "ai-ml";
  if (value.includes("simple storage") || /\bs3\b/.test(value)) return "object-storage";
  if (
    value.includes("relational database") ||
    /\brds\b/.test(value) ||
    value.includes("aurora") ||
    value.includes("dynamodb") ||
    value.includes("redshift")
  ) return "database";
  if (
    value.includes("elastic compute") ||
    /\bec2\b/.test(value) ||
    value.includes("elastic container")
  ) return "compute";
  if (value.includes("lambda") || value.includes("fargate")) return "serverless";
  if (value.includes("elastic file system") || /\befs\b/.test(value)) return "file-storage";
  return "other";
}

export function isAWSCostExplorerSummary(headers: string[]): boolean {
  if (headers.length < 2) return false;
  const firstDimension = dimensionFromHeader(headers[0] ?? "");
  const hasTotal = headers.some(isTotalCostHeader);
  const hasCostSeries = headers.slice(1).some(hasCurrencySuffix);
  // The ungrouped download has a blank first header and one "Total costs($)"
  // column. Grouped downloads name the first cell after the selected dimension
  // and then expose one currency-suffixed column per group.
  return (
    hasTotal &&
    hasCostSeries &&
    (firstDimension !== "other" || normalizedLabel(headers[0] ?? "") === "")
  );
}

export function parseAWSCostExplorerSummary(
  csvContent: string,
  diagnostics?: ParseDiagnostics
): NormalizedCostRecord[] {
  const parsed = Papa.parse<string[]>(csvContent, {
    header: false,
    skipEmptyLines: true,
  });
  const rows = parsed.data;
  const headers = (rows[0] ?? []).map((header) => String(header ?? "").trim());
  if (!isAWSCostExplorerSummary(headers)) {
    throw new Error("El archivo no coincide con una descarga resumida de AWS Cost Explorer.");
  }

  const dimensionLabel = headers[0].replace(/^\uFEFF/, "").trim();
  const dimension = dimensionFromHeader(dimensionLabel);
  const totalIndex = headers.findIndex(isTotalCostHeader);
  const groupedIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header, index }) => index > 0 && index !== totalIndex && hasCurrencySuffix(header))
    .map(({ index }) => index);
  const usageIndexes = headers
    .map((header, index) => ({ header, index, parts: measureParts(header) }))
    .filter(
      ({ index, parts, header }) =>
        index > 0 &&
        !!parts &&
        !isCurrencyUnit(parts.unit) &&
        !isTotalUsageHeader(header)
    )
    .map(({ index }) => index);
  const costIndexes = groupedIndexes.length > 0
    ? groupedIndexes
    : totalIndex >= 0
      ? [totalIndex]
      : [];

  const periodRows = rows.slice(1).filter((row) => {
    const label = String(row[0] ?? "").trim();
    return looksLikePeriod(label) && !isAggregateRow(label);
  });
  const periodLabels = periodRows.map((row) => String(row[0] ?? "").trim());
  const granularity = inferGranularity(periodLabels);
  const today = new Date().toISOString().slice(0, 10);
  const records: NormalizedCostRecord[] = [];
  const usageByPeriodAndGroup = new Map<string, number>();

  if (diagnostics) {
    diagnostics.sourceKind = "aws-cost-explorer-summary";
    diagnostics.summaryGroupBy = dimension;
    diagnostics.summaryGroupByLabel = dimensionLabel || "Sin agrupación";
    diagnostics.summaryGranularity = granularity;
    diagnostics.summaryPeriodCount = new Set(periodLabels.map((value) => value.slice(0, 10))).size;
    diagnostics.totalRows = periodRows.length * costIndexes.length;
    diagnostics.commitmentSignalAvailable =
      dimension === "purchase-option" || dimension === "charge-type";
  }

  for (const row of periodRows) {
    const rawPeriod = String(row[0] ?? "").trim();
    for (const index of usageIndexes) {
      const parts = measureParts(headers[index]);
      const quantity = coerceAmount(String(row[index] ?? "").trim());
      if (!parts || quantity === null) continue;
      const group = parts.group || "AWS Cost Explorer";
      usageByPeriodAndGroup.set(`${rawPeriod}\u0000${group}`, quantity);
      if (quantity !== 0 && diagnostics) {
        diagnostics.summaryUsageValueCount++;
        diagnostics.summaryUsageTotal += quantity;
        diagnostics.summaryUsageUnit ||= parts.unit;
      }
    }
  }

  for (const row of periodRows) {
    const rawPeriod = String(row[0] ?? "").trim();
    const date = normalizeDate(rawPeriod);
    if (!date) {
      if (diagnostics) diagnostics.unparsableDateRows += costIndexes.length;
      continue;
    }
    const isForecast = date > today;

    for (const index of costIndexes) {
      const rawAmount = String(row[index] ?? "").trim();
      const amount = coerceAmount(rawAmount);
      if (amount === null) {
        if (diagnostics && rawAmount !== "") diagnostics.unparsableAmountRows++;
        continue;
      }
      if (isForecast) {
        if (diagnostics) {
          diagnostics.forecastRows++;
          diagnostics.forecastTotalUSD += amount;
        }
        continue;
      }
      if (amount < 0) {
        if (diagnostics) {
          diagnostics.creditRows++;
          diagnostics.creditTotalUSD += Math.abs(amount);
        }
        continue;
      }
      if (amount === 0) {
        if (diagnostics) diagnostics.zeroCostRows++;
        continue;
      }

      const groupValue =
        groupedIndexes.length > 0
          ? stripCurrencySuffix(headers[index])
          : "AWS Cost Explorer";
      const service = dimension === "service" ? groupValue : groupValue || "AWS Cost Explorer";
      const quantity = usageByPeriodAndGroup.get(`${rawPeriod}\u0000${groupValue}`) ?? 0;

      records.push({
        provider: "aws",
        category: dimension === "service" ? categoryFromService(service) : "other",
        nativeService: service,
        nativeUsageType: dimension === "usage-type" || dimension === "usage-type-group"
          ? groupValue
          : "Cost Explorer summary",
        region: dimension === "region" || dimension === "availability-zone"
          ? groupValue
          : "global",
        date,
        cost: amount,
        quantity,
        accountId:
          dimension === "linked-account" || dimension === "payer-account"
            ? groupValue
            : undefined,
        chargeType: dimension === "charge-type" ? groupValue : "Summary",
        resourceId: dimension === "resource" ? groupValue : undefined,
        source: {
          datasetType: "cost-and-usage",
          schemaVersion: "AWS Cost Explorer CSV summary",
          catalogSnapshot: "aws-services.json",
          extensions: {
            analysisLevel: "summary",
            summaryGroupBy: dimension,
            summaryGroupByLabel: dimensionLabel || "Sin agrupación",
            summaryGroupValue: groupValue,
            granularity,
            costMetric: stripCurrencySuffix(headers[totalIndex] ?? "Total costs"),
          },
        },
      });
    }
  }

  return records;
}
