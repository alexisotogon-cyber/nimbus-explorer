import Papa from "papaparse";
import { NormalizedCostRecord, formatUSD } from "../types";
import { ParseResult } from "../parsers";
import { coerceAmount, ParseDiagnostics } from "../parsers/coerce";
import { normalizeHeaderKey } from "../parsers/focus-parser";
import { MIN_DISTINCT_DAYS } from "../rules/thresholds";
import { KNOWLEDGE_BASE } from "../knowledge/knowledge-base";

/**
 * File Check — diagnoses what a user's uploaded billing file can and can't
 * do, instead of a binary "válido/inválido". Every threshold quoted here
 * mirrors a real gate already in the engine (see the `requires` string on
 * each capability) — this module doesn't invent new rules, it explains
 * existing ones. See src/engine/rules/idle-resources.ts, trends.ts,
 * storage-waste.ts, ai-spend.ts, and types.ts (topResourcesFromRecords).
 */

export interface DroppedRowReason {
  reason: string;
  count: number;
  hint: string;
}

/** Same shape minus `count` — for assumptions applied to KEPT values, where a row count doesn't apply. */
export interface AssumptionWarning {
  reason: string;
  hint: string;
}

export interface Capability {
  id: string;
  label: string;
  ok: boolean;
  requires: string;
  unlocks: string;
}

export interface FileDiagnosis {
  detectedFormat: "focus" | "aws" | "azure" | "gcp" | "desconocido";
  formatLabel: string;
  totalDataRows: number;
  usableRows: number;
  dropped: DroppedRowReason[];
  distinctDays: number;
  capabilities: Capability[];
  nextSteps: string[];
  /**
   * Credits, discounts and refunds found in the file and excluded from the waste
   * analysis, as a positive USD figure. Surfaced so the user can see that the
   * gross spend we analyse is above the net invoice they pay.
   */
  creditsExcludedUSD: number;
  taxesExcludedUSD: number;
  commitmentPurchasesExcludedUSD: number;
  /**
   * File-level assumptions the parser had to make on values it KEPT (not
   * dropped) because the file itself was ambiguous — e.g. a decimal separator
   * or date order it couldn't read off unambiguous evidence in the sample.
   * Distinct from `dropped`: these rows are in the analysis, just under a
   * best-effort reading the user should know about.
   */
  assumptionWarnings: AssumptionWarning[];
  sourceProfile?: {
    kind:
      | "aws-cost-explorer-summary"
      | "azure-cost-analysis-summary"
      | "gcp-console-summary";
    provider: "AWS" | "Azure" | "GCP";
    sourceLabel: string;
    groupBy: string;
    granularity: "hourly" | "daily" | "monthly";
    periodCount: number;
    forecastRows: number;
    forecastTotalUSD: number;
    usageValueCount: number;
    usageTotal: number;
    usageUnit?: string;
  };
}

const FORMAT_LABELS: Record<FileDiagnosis["detectedFormat"], string> = {
  // Single wording for the supported FOCUS range, matching the parser's own
  // range (see focus-parser.ts). The app used to claim "1.0/1.2", "1.0-1.2" and
  // "1.x" in three different places.
  focus: "FOCUS 1.0–1.4 (estándar multi-nube)",
  aws: "AWS Cost Explorer / CUR",
  azure: "Azure Cost Management Export",
  gcp: "GCP Cloud Billing Export",
  desconocido: "Formato no reconocido",
};

function toDetectedFormat(p: ParseResult["detectedProvider"], isFocus: boolean): FileDiagnosis["detectedFormat"] {
  if (isFocus) return "focus";
  if (p === "aws" || p === "azure" || p === "gcp") return p;
  return "desconocido";
}

/** Best-effort raw scan to attribute WHY rows were dropped. Independent of
 *  the parser internals (each parser has its own column map) — this is an
 *  approximation shown to the user as a diagnostic, not exact accounting. */
function findColumn(headers: string[], candidates: string[]): string | null {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  for (const cand of candidates) {
    const idx = normalized.indexOf(cand);
    if (idx !== -1) return headers[idx];
  }
  // Separator-insensitive match, the same normalization the FOCUS parser uses.
  // Without it a file with spaced headers ("Billed Cost") matched no cost column
  // at all, so the scan below judged every row unreadable and the panel claimed
  // 30 discards on a file where the parser had discarded 2.
  const keys = headers.map(normalizeHeaderKey);
  for (const cand of candidates) {
    const key = normalizeHeaderKey(cand);
    const idx = keys.indexOf(key);
    if (idx !== -1) return headers[idx];
  }
  // Separator-insensitive substring fallback (e.g. candidate
  // "unblendedcost" inside "line_item_unblended_cost"). A bare "cost" is
  // deliberately excluded: otherwise CUR 2.0's descriptive `cost_category`
  // map is mistaken for money.
  for (const cand of candidates) {
    const key = normalizeHeaderKey(cand);
    if (key === "cost") continue;
    const idx = keys.findIndex((headerKey) => headerKey.includes(key));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

/**
 * Cost column preference, PER FORMAT, mirroring what each parser actually reads.
 *
 * This used to be a single list headed by "billedcost" for every format, while the
 * FOCUS parser analyses EffectiveCost. On a file where BilledCost is 0 and
 * EffectiveCost carries the amount (amortized commitments — routine in AWS FOCUS
 * exports) the panel reported 63 discarded rows when the parser had discarded 3.
 * The diagnosis has to read the same column as the parser or it invents defects.
 */
const COST_COLUMN_CANDIDATES: Record<FileDiagnosis["detectedFormat"], string[]> = {
  focus: ["effectivecost", "billedcost"],
  aws: [
    "line_item_net_unblended_cost",
    "lineitem/netunblendedcost",
    "line_item_unblended_cost",
    "lineitem/unblendedcost",
    "netunblendedcost",
    "unblendedcost",
    "unblended cost",
    "amortizedcost",
    "cost",
  ],
  azure: ["costinbillingcurrency", "costinusd", "pretaxcost", "cost"],
  gcp: ["cost_amount", "cost"],
  desconocido: ["effectivecost", "billedcost", "unblendedcost", "cost"],
};
const SERVICE_COLUMN_CANDIDATES = ["servicename", "service", "product/productname", "lineitem/productcode"];
const CHARGE_TYPE_CANDIDATES = ["chargecategory", "chargesubcategory", "chargetype", "charge type", "lineitem/lineitemtype"];

/** Reads a row's cost using the parser's own fallback chain, not just one column. */
function rowCost(row: Record<string, string>, costCols: string[]): number | null {
  for (const col of costCols) {
    const raw = row[col];
    if (raw === undefined || raw.trim() === "") continue;
    const value = coerceAmount(raw);
    if (value !== null) return value;
  }
  return null;
}

function diagnoseDropped(
  rawCsv: string,
  detectedFormat: FileDiagnosis["detectedFormat"],
  droppedCount: number,
  parseDiagnostics?: ParseDiagnostics
): DroppedRowReason[] {
  if (droppedCount <= 0) return [];

  const result = Papa.parse(rawCsv, { header: true, skipEmptyLines: true });
  const rows = result.data as Record<string, string>[];
  const headers = result.meta.fields || [];

  // Every candidate column that exists, in the parser's own preference order.
  const costCols = COST_COLUMN_CANDIDATES[detectedFormat]
    .map((c) => findColumn(headers, [c]))
    .filter((c): c is string => c !== null);
  const serviceCol = findColumn(headers, SERVICE_COLUMN_CANDIDATES);
  const chargeTypeCol = findColumn(headers, CHARGE_TYPE_CANDIDATES);

  let zeroCost = 0;
  let unreadableCost = 0;
  let credits = 0;
  let creditTotal = 0;
  let missingService = 0;
  let taxRows = 0;

  for (const row of rows) {
    const chargeType = (chargeTypeCol ? row[chargeTypeCol] : "").toLowerCase().trim();
    if (chargeType === "tax") {
      taxRows++;
      continue;
    }

    const cost = rowCost(row, costCols);
    if (cost === null) {
      unreadableCost++;
      continue;
    }
    if (cost < 0 || chargeType === "credit" || chargeType === "refund") {
      credits++;
      creditTotal += Math.abs(cost);
      continue;
    }
    if (cost === 0) {
      zeroCost++;
      continue;
    }
    // AWS parser is the only one that also requires a non-empty service.
    if (detectedFormat === "aws" && serviceCol && !row[serviceCol]?.trim()) {
      missingService++;
    }
  }

  // The parser's own counters win over the raw re-scan whenever they exist: they
  // are the ground truth for what was actually dropped.
  if (parseDiagnostics) {
    if (parseDiagnostics.creditRows > 0) {
      credits = parseDiagnostics.creditRows;
      creditTotal = parseDiagnostics.creditTotalUSD;
    }
    if (parseDiagnostics.taxRows > 0) taxRows = parseDiagnostics.taxRows;
    if (parseDiagnostics.unparsableAmountRows > 0) {
      unreadableCost = parseDiagnostics.unparsableAmountRows;
    }
  }

  const reasons: DroppedRowReason[] = [];
  if (credits > 0) {
    reasons.push({
      reason: "Créditos, descuentos y reembolsos",
      count: credits,
      hint:
        `Suman ${formatUSD(creditTotal)} y se excluyen del análisis de desperdicio: un crédito no ` +
        "cambia el hecho de que un recurso esté ocioso. Tu factura neta es menor que el gasto bruto que analizamos.",
    });
  }
  if (unreadableCost > 0) {
    reasons.push({
      reason: "Importe no interpretable",
      count: unreadableCost,
      hint:
        costCols.length > 0
          ? `La columna "${costCols[0]}" traía un valor que no es un número reconocible en esas filas.`
          : "No se detectó una columna de costo reconocible.",
    });
  }
  if (parseDiagnostics && parseDiagnostics.unparsableDateRows > 0) {
    reasons.push({
      reason: "Fecha ausente o no interpretable",
      count: parseDiagnostics.unparsableDateRows,
      hint: "Sin fecha no se puede proyectar a mes, así que la fila queda fuera.",
    });
  }
  if (parseDiagnostics && parseDiagnostics.commitmentPurchaseRows > 0) {
    reasons.push({
      reason: "Compras de compromiso (Savings Plans, reservas)",
      count: parseDiagnostics.commitmentPurchaseRows,
      hint: "Se excluyen a propósito: sumarlas junto al uso que amortizan contaría el mismo dinero dos veces.",
    });
  }
  if (taxRows > 0) {
    reasons.push({
      reason: "Líneas de impuestos",
      count: taxRows,
      hint: "Se excluyen del análisis a propósito — no son gasto de infraestructura.",
    });
  }
  if (missingService > 0) {
    reasons.push({
      reason: "Fila sin nombre de servicio",
      count: missingService,
      hint: `La columna "${serviceCol}" viene vacía en esas filas.`,
    });
  }
  // Listed last on purpose: it is the only reason derived purely from the raw
  // re-scan, so it is the first to be trimmed if the reasons overshoot.
  if (zeroCost > 0) {
    reasons.push({
      reason: "Costo en $0",
      count: zeroCost,
      hint:
        costCols.length > 0
          ? `Filas sin importe en "${costCols[0]}" — capa gratuita o líneas informativas.`
          : "No se detectó una columna de costo reconocible.",
    });
  }

  // Hard invariant: the reasons explain the rows that were DROPPED, so they can
  // never add up to more than droppedCount. The raw re-scan is an approximation of
  // the parser's own logic and can overshoot (a column named differently, a
  // charge-type value the parser reads from another field); when it does, the
  // surplus is trimmed instead of published. Reasons backed by the parser's own
  // counters are listed first and therefore survive the trim.
  const trimmed: DroppedRowReason[] = [];
  let budget = droppedCount;
  for (const reason of reasons) {
    if (budget <= 0) break;
    trimmed.push(reason.count > budget ? { ...reason, count: budget } : reason);
    budget -= Math.min(reason.count, budget);
  }

  if (budget > 0) {
    trimmed.push({
      reason: "Otras filas no reconocidas por el formato detectado",
      count: budget,
      hint: "Puede ser una columna con nombre distinto al esperado, o encoding del archivo.",
    });
  }

  return trimmed;
}

/**
 * Assumptions the parser had to apply to values it KEPT because the file
 * itself gave no unambiguous reading — decimal separator and date order.
 * Both are resolved once per file (see coerce.ts detectDecimalSeparator /
 * detectDateOrder), never per row, but "resolved" still means "guessed" when
 * `ambiguous` is true, so it's surfaced the same way a dropped row would be.
 */
function buildAssumptionWarnings(parseDiagnostics?: ParseDiagnostics): AssumptionWarning[] {
  if (!parseDiagnostics) return [];
  const warnings: AssumptionWarning[] = [];

  if (parseDiagnostics.ambiguousDecimalSeparator) {
    const sep = parseDiagnostics.assumedDecimalSeparator === "," ? "coma" : "punto";
    warnings.push({
      reason: "Separador decimal ambiguo en algunos importes",
      hint:
        `Algunos montos como "1.234" podían leerse como 1234 (miles) o como 1.234 (decimal). ` +
        `Sin otra evidencia en el archivo se asumió "${sep}" como separador decimal ` +
        (parseDiagnostics.assumedDecimalSeparator === null ? "por defecto (miles)." : "."),
    });
  }
  if (parseDiagnostics.conflictingDecimalSeparator) {
    warnings.push({
      reason: "Separador decimal inconsistente",
      hint: "El archivo tiene evidencia de ambos separadores (punto y coma) como decimal — revisa que todas las filas usen el mismo formato regional.",
    });
  }
  if (parseDiagnostics.ambiguousDateOrder) {
    const order = parseDiagnostics.assumedDateOrder === "month-first" ? "mes/día" : "día/mes";
    warnings.push({
      reason: "Orden de fecha ambiguo",
      hint: `Fechas tipo "03/04/2026" podían ser 3 de abril o 4 de marzo. Se asumió el orden "${order}" para todo el archivo.`,
    });
  }

  return warnings;
}

function buildCapabilities(
  records: NormalizedCostRecord[],
  distinctDays: number,
  parseDiagnostics?: ParseDiagnostics
): Capability[] {
  if (parseDiagnostics && parseDiagnostics.sourceKind !== "detailed") {
    const sourceKind = parseDiagnostics.sourceKind;
    const provider =
      sourceKind === "aws-cost-explorer-summary" ? "AWS"
      : sourceKind === "azure-cost-analysis-summary" ? "Azure"
      : "GCP";
    const detailedExport =
      provider === "AWS" ? "CUR 2.0, Data Exports o FOCUS"
      : provider === "Azure" ? "Cost Details Actual/Amortized o FOCUS"
      : "BigQuery Detailed Usage Cost Export o FOCUS";
    const resourceColumn =
      provider === "AWS" ? "ResourceId"
      : provider === "Azure" ? "ResourceId"
      : "resource.global_name";
    const groupBy = parseDiagnostics.summaryGroupBy ?? "none";
    const groupLabel = parseDiagnostics.summaryGroupByLabel || "la dimensión elegida";
    const parsedCells = parseDiagnostics.totalRows > 0;
    const periodCount = parseDiagnostics.summaryPeriodCount ?? distinctDays;
    const capabilities: Capability[] = [
      {
        id: "totals",
        label: "Validar el gasto total y su evolución por periodo",
        ok: parsedCells,
        requires: "al menos un periodo con una columna de costo",
        unlocks: "totales, promedio del periodo y evolución temporal",
      },
      {
        id: "selected-breakdown",
        label:
          groupBy === "none"
            ? "Desglosar el gasto por una dimensión"
            : `Desglosar el gasto por ${groupLabel}`,
        ok: groupBy !== "none",
        requires: "seleccionar «Agrupar por» antes de descargar el CSV",
        unlocks: "comparar servicios, cuentas, regiones u otra dimensión",
      },
      ...(parseDiagnostics.summaryUsageValueCount > 0
        ? [{
            id: "aggregate-usage",
            label: `Validar uso agregado (${parseDiagnostics.summaryUsageUnit || "unidades"})`,
            ok: true,
            requires: "columnas de uso en la descarga de Cost Explorer",
            unlocks: "volumen agregado por periodo y dimensión",
          }]
        : []),
      {
        id: "trends",
        label: "Comparar periodos y detectar cambios de gasto",
        ok: periodCount >= 2,
        requires: `al menos 2 periodos distintos (tienes ${periodCount})`,
        unlocks: "evolución y comparación del gasto agregado",
      },
      {
        id: "aggregate-findings",
        label: "Generar recomendaciones de ahorro verificables",
        ok: false,
        requires:
          `${detailedExport} con tipo de uso, recurso, región y tipo de cargo`,
        unlocks: "reglas de optimización y escenarios de ahorro",
      },
      {
        id: "resource-level",
        label: "Identificar recursos concretos que requieren acción",
        ok: false,
        requires:
          `${detailedExport} con ${resourceColumn}; agrupar una vista de consola no prueba utilización`,
        unlocks: "acciones sobre IDs reales y evidencia técnica",
      },
      {
        id: "commitments",
        label: "Validar Savings Plans y Reservas sin doble conteo",
        ok: false,
        requires:
          provider === "GCP"
            ? "BigQuery export con credits.type, consumption_model y subscription.instance_id"
            : provider === "Azure"
              ? "Cost Details con PricingModel, ReservationId y BenefitId"
              : "CUR 2.0 o FOCUS con ChargeType y datos de Savings Plans/Reservations",
        unlocks: "cobertura, costo efectivo y oportunidades de compromiso",
      },
      {
        id: "ai-attribution",
        label: "Atribuir gasto de IA a cuenta, equipo o aplicación",
        ok: false,
        requires:
          "detalle adicional por proyecto/etiqueta; un CSV agrupado sólo por servicio no prueba atribución",
        unlocks: "gobernanza de costos de Bedrock y SageMaker",
      },
    ];
    return capabilities;
  }

  const hasResourceId = records.some((r) => !!r.resourceId);
  // NOT `records.some(r => !!r.chargeType)` — every parser defaults chargeType
  // to "Usage" when the column is absent, so that check was always true and
  // this capability never actually reflected whether a commitment COULD be
  // expressed. `commitmentSignalAvailable` is set by the parser only when the
  // file carries a column capable of saying so (PricingModel, credits.type,
  // CommitmentDiscountId...).
  const hasCommitmentSignal = parseDiagnostics?.commitmentSignalAvailable ?? false;
  const hasAiRecords = records.some((r) => r.category === "ai-ml");

  return [
    {
      id: "totals",
      label: "Gasto total y desglose por servicio",
      ok: records.length > 0,
      requires: "una columna de costo y de servicio",
      unlocks: "el resumen y el desglose por servicio de la pestaña Resumen",
    },
    {
      id: "aggregate-findings",
      label: "Hallazgos agregados (por tipo de recurso y región)",
      // Threshold imported, not retyped: this is the same constant the engine
      // enforces in calculateSavings(), so the panel cannot promise a gate that
      // the rules don't apply (which is exactly what used to happen).
      ok: distinctDays >= MIN_DISTINCT_DAYS,
      requires:
        `al menos ${MIN_DISTINCT_DAYS} días de datos diarios distintos (tienes ${distinctDays})`,
      unlocks: "hallazgos de utilización, discos, snapshots y más",
    },
    {
      id: "trends",
      label: "Tendencias, picos de gasto y proyección de fin de mes",
      ok: distinctDays >= 14,
      requires: "al menos 14 días de datos diarios distintos (tienes " + distinctDays + ")",
      unlocks: "la sección de tendencias en el Resumen",
    },
    {
      id: "resource-level",
      label: "Hallazgos por recurso concreto (con ID real, ej. vol-xxxx)",
      ok: hasResourceId,
      requires: "una columna ResourceId o identificador equivalente en el export",
      unlocks: "las barras de recursos concretos dentro de cada hallazgo",
    },
    {
      id: "commitments",
      label: "Detección de compromisos / Savings Plans faltantes",
      ok: hasCommitmentSignal,
      requires: "ChargeType o CommitmentDiscountId en tus datos",
      unlocks: "el hallazgo de descuentos por compromiso no contratados",
    },
    {
      id: "ai-attribution",
      label: "Atribución de gasto de IA por equipo/proyecto",
      // GCP's native accountId is project.id, a real (partial) allocation
      // dimension. AWS account IDs and Azure subscription IDs identify a billing
      // boundary, not a team/application, so they do not prove attribution.
      ok: hasAiRecords && records.some(
        (r) => r.category === "ai-ml" && r.provider === "gcp" && !!r.accountId
      ),
      requires: "gasto de IA/ML y una dimensión de cuenta, proyecto, equipo o aplicación",
      unlocks: "el hallazgo de asignación de costos de IA",
    },
  ];
}

function buildNextSteps(
  detectedFormat: FileDiagnosis["detectedFormat"],
  capabilities: Capability[],
  sourceKind: ParseDiagnostics["sourceKind"] = "detailed"
): string[] {
  const byId = (id: string) => KNOWLEDGE_BASE.find((k) => k.id === id);
  const steps: string[] = [];

  if (sourceKind !== "detailed" && capabilities.some((cap) => cap.id === "selected-breakdown")) {
    const source =
      sourceKind === "aws-cost-explorer-summary" ? "AWS Cost Explorer"
      : sourceKind === "azure-cost-analysis-summary" ? "Azure Cost Analysis"
      : "GCP Reports/Cost table";
    steps.push(
      `Este CSV de ${source} es un resumen agregado: sirve para validar totales, periodos y la dimensión seleccionada, pero no demuestra utilización ni ociosidad de recursos.`
    );
    if (sourceKind === "aws-cost-explorer-summary") {
      steps.push("Para recomendaciones verificables, usa AWS Data Exports/CUR 2.0 o FOCUS con ResourceId, UsageType, Region, ChargeType y campos de Savings Plans/Reservations; también puedes usar el conector AWS de solo lectura.");
    } else if (sourceKind === "azure-cost-analysis-summary") {
      steps.push("Para recomendaciones verificables, exporta Azure Cost Details (ActualCost o AmortizedCost) con ResourceId, MeterId, Quantity, ChargeType, PricingModel, ReservationId y BenefitId.");
    } else {
      steps.push("Para recomendaciones verificables, usa el Detailed Usage Cost Export de BigQuery con resource.global_name, usage, credits, consumption_model y subscription.instance_id.");
    }
    return steps;
  }

  if (detectedFormat === "desconocido") {
    const what = byId("focus-what");
    if (what) steps.push(what.summary);
    return steps;
  }

  if (detectedFormat === "aws") {
    const vsCur = byId("focus-vs-cur");
    if (vsCur) steps.push(vsCur.summary);
  }

  const missingResourceLevel = !capabilities.find((c) => c.id === "resource-level")?.ok;
  if (missingResourceLevel) {
    const exportId =
      detectedFormat === "aws" ? "focus-export-aws" :
      detectedFormat === "azure" ? "focus-export-azure" :
      detectedFormat === "gcp" ? "focus-export-gcp" : "focus-columns";
    const entry = byId(exportId);
    if (entry) steps.push(entry.summary);
  }

  return steps;
}

/**
 * Diagnoses an uploaded file: what format it is, how many rows were usable,
 * why the rest were dropped, and which analysis capabilities the data
 * supports. Read-only — does not touch the parsers, just re-derives what's
 * observable from the raw CSV + the already-parsed records.
 */
export function diagnoseUpload(rawCsv: string, parsed: ParseResult): FileDiagnosis {
  const headerScan = Papa.parse(rawCsv, { header: true, skipEmptyLines: true });
  const isProviderSummary =
    parsed.diagnostics?.sourceKind !== undefined
    && parsed.diagnostics.sourceKind !== "detailed";
  const totalDataRows = isProviderSummary
    ? parsed.diagnostics?.totalRows ?? 0
    : (headerScan.data as unknown[]).length;
  const usableRows = parsed.records.length;

  const detectedFormat = toDetectedFormat(parsed.detectedProvider, parsed.isFocus);
  const distinctDays = new Set(parsed.records.map((r) => r.date).filter(Boolean)).size;

  const dropped = isProviderSummary
    ? [
        ...(parsed.diagnostics?.creditRows
          ? [{
              reason: "Créditos o importes negativos",
              count: parsed.diagnostics.creditRows,
              hint: `Suman ${formatUSD(parsed.diagnostics.creditTotalUSD)} y se muestran fuera del gasto positivo analizado.`,
            }]
          : []),
        ...(parsed.diagnostics?.zeroCostRows
          ? [{
              reason: "Periodos o grupos con costo en $0",
              count: parsed.diagnostics.zeroCostRows,
              hint: "El archivo es válido, pero esos valores no aportan gasto positivo para analizar.",
            }]
          : []),
        ...(parsed.diagnostics?.forecastRows
          ? [{
              reason: "Costos previstos",
              count: parsed.diagnostics.forecastRows,
              hint: `Suman ${formatUSD(parsed.diagnostics.forecastTotalUSD)} y se separan del gasto observado para no mezclarlos.`,
            }]
          : []),
      ]
    : diagnoseDropped(
        rawCsv,
        detectedFormat,
        totalDataRows - usableRows,
        parsed.diagnostics
      );
  const capabilities = buildCapabilities(parsed.records, distinctDays, parsed.diagnostics);
  const nextSteps = buildNextSteps(
    detectedFormat,
    capabilities,
    parsed.diagnostics?.sourceKind
  );
  const assumptionWarnings = buildAssumptionWarnings(parsed.diagnostics);

  return {
    detectedFormat,
    formatLabel: isProviderSummary
      ? parsed.diagnostics?.sourceKind === "aws-cost-explorer-summary"
        ? "AWS Cost Explorer (resumen descargado)"
        : parsed.diagnostics?.sourceKind === "azure-cost-analysis-summary"
          ? "Azure Cost Analysis (resumen descargado)"
          : "GCP Reports / Cost table (resumen descargado)"
      : FORMAT_LABELS[detectedFormat],
    totalDataRows,
    usableRows,
    dropped,
    distinctDays,
    capabilities,
    nextSteps,
    creditsExcludedUSD:
      Math.round((parsed.diagnostics?.creditTotalUSD ?? 0) * 100) / 100,
    taxesExcludedUSD:
      Math.round((parsed.diagnostics?.taxTotalUSD ?? 0) * 100) / 100,
    commitmentPurchasesExcludedUSD:
      Math.round((parsed.diagnostics?.commitmentPurchaseTotalUSD ?? 0) * 100) / 100,
    assumptionWarnings,
    sourceProfile: isProviderSummary
      ? {
          kind: parsed.diagnostics!.sourceKind as Exclude<ParseDiagnostics["sourceKind"], "detailed">,
          provider:
            parsed.diagnostics?.sourceKind === "aws-cost-explorer-summary"
              ? "AWS"
              : parsed.diagnostics?.sourceKind === "azure-cost-analysis-summary"
                ? "Azure"
                : "GCP",
          sourceLabel:
            parsed.diagnostics?.sourceKind === "aws-cost-explorer-summary"
              ? "Cost Explorer"
              : parsed.diagnostics?.sourceKind === "azure-cost-analysis-summary"
                ? "Cost Analysis"
                : "Reports / Cost table",
          groupBy: parsed.diagnostics?.summaryGroupByLabel || "Sin agrupación",
          granularity: parsed.diagnostics?.summaryGranularity || "daily",
          periodCount: parsed.diagnostics?.summaryPeriodCount || 0,
          forecastRows: parsed.diagnostics?.forecastRows || 0,
          forecastTotalUSD:
            Math.round((parsed.diagnostics?.forecastTotalUSD || 0) * 100) / 100,
          usageValueCount: parsed.diagnostics?.summaryUsageValueCount || 0,
          usageTotal:
            Math.round((parsed.diagnostics?.summaryUsageTotal || 0) * 1_000_000) /
            1_000_000,
          usageUnit: parsed.diagnostics?.summaryUsageUnit,
        }
      : undefined,
  };
}
