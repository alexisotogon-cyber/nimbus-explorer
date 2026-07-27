import { NormalizedCostRecord } from "./types";

/**
 * Trends & Anomaly Engine — Phase A / P0
 *
 * 100% deterministic: only arithmetic over NormalizedCostRecord[].
 * Zero LLM, zero assumptions, zero hardcoded percentages.
 * Requires ≥14 days of daily data; returns [] otherwise.
 *
 * INTEGRITY: every TrendInsight carries an `evidence` string that reproduces
 * the raw numbers used in the calculation so the result can be verified by hand.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type TrendType =
  | "daily-spike"
  | "sustained-growth"
  | "month-projection"
  | "new-service";

export interface TrendInsight {
  id: string;
  type: TrendType;
  /** "warning" = notable anomaly that may need attention; "info" = informational */
  severity: "warning" | "info";
  title: string;
  detail: string;
  /**
   * Raw numbers used in the calculation — allows manual verification.
   * Format is free-form text; must contain the arithmetic that produced the
   * title/detail figures.
   */
  evidence: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Formats YYYY-MM-DD as a human-readable date in Spanish. */
function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr + "T12:00:00Z").toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
    });
  } catch {
    return dateStr;
  }
}

/** Formats a USD amount without importing the UI helper (engine is UI-agnostic). */
function fmtUSD(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return `$${safe.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Returns the median of a sorted array. */
function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Simple OLS linear regression — returns slope (cost per day) and intercept.
 * Input: array of [x, y] pairs where x is a 0-based day index.
 */
function linearRegression(points: [number, number][]): { slope: number; intercept: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0 };
  const sumX = points.reduce((s, [x]) => s + x, 0);
  const sumY = points.reduce((s, [, y]) => s + y, 0);
  const sumXY = points.reduce((s, [x, y]) => s + x * y, 0);
  const sumX2 = points.reduce((s, [x]) => s + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Analyzes trends and anomalies in the cost records.
 * Requires ≥14 distinct daily dates; returns [] if data is insufficient.
 */
export function analyzeTrends(records: NormalizedCostRecord[]): TrendInsight[] {
  // Provider parsers already remove taxes, credits, refunds and cash-basis
  // commitment purchases before normalization. Keep every remaining positive
  // usage row here, including provider-specific labels such as AWS
  // SavingsPlanCoveredUsage and DiscountedUsage. Excluding those rows made the
  // trend baseline disagree with the canonical monthly figure on the dashboard.
  const usageRecords = records.filter((record) => record.cost > 0);

  // Group total cost by day
  const dailyTotals = new Map<string, number>();
  for (const r of usageRecords) {
    if (!r.date) continue;
    dailyTotals.set(r.date, (dailyTotals.get(r.date) ?? 0) + r.cost);
  }

  const sortedDates = Array.from(dailyTotals.keys()).sort();
  if (sortedDates.length < 14) return [];

  const insights: TrendInsight[] = [];

  // ── 1. Daily spike detection ────────────────────────────────────────────────
  const dailyValues = sortedDates.map((d) => dailyTotals.get(d)!);
  const sortedValues = [...dailyValues].sort((a, b) => a - b);
  const med = median(sortedValues);

  /**
   * spikeDatesPerService: service name → Set of date strings that were
   * identified as spike days with that service as the dominant contributor.
   * Built during section 1 and consumed in section 2 to exclude outlier
   * days from the sustained-growth regression so a single puntual event
   * cannot be reported twice (once as a spike, once as a false growth trend).
   */
  const spikeDatesPerService = new Map<string, Set<string>>();

  if (med > 0) {
    for (let i = 0; i < sortedDates.length; i++) {
      const dayDate = sortedDates[i];
      const dayCost = dailyValues[i];
      const ratio = dayCost / med;

      if (ratio >= 2) {
        // Find service with largest delta vs its own average
        const dayRecords = usageRecords.filter((r) => r.date === dayDate);
        const serviceAvgs = new Map<string, { total: number; days: Set<string> }>();
        for (const r of usageRecords) {
          if (!r.date) continue;
          const entry = serviceAvgs.get(r.nativeService) ?? { total: 0, days: new Set() };
          entry.total += r.cost;
          entry.days.add(r.date);
          serviceAvgs.set(r.nativeService, entry);
        }

        let topService = "";
        let topDelta = 0;
        for (const sr of dayRecords) {
          const entry = serviceAvgs.get(sr.nativeService);
          if (!entry || entry.days.size === 0) continue;
          const avgForService = entry.total / entry.days.size;
          const dayServiceCost = dayRecords
            .filter((r) => r.nativeService === sr.nativeService)
            .reduce((s, r) => s + r.cost, 0);
          const delta = dayServiceCost - avgForService;
          if (delta > topDelta) {
            topDelta = delta;
            topService = sr.nativeService;
          }
        }

        // Record this date as a spike day for the dominant service so that
        // section 2 can exclude it from the regression.
        if (topService) {
          if (!spikeDatesPerService.has(topService)) {
            spikeDatesPerService.set(topService, new Set());
          }
          spikeDatesPerService.get(topService)!.add(dayDate);
        }

        const ratioStr = ratio.toFixed(1);
        insights.push({
          id: `spike-${dayDate}`,
          type: "daily-spike",
          severity: "warning",
          title: `El ${fmtDate(dayDate)} el gasto saltó ${ratioStr}× (${fmtUSD(dayCost)} vs ${fmtUSD(med)} típico)`,
          detail: topService
            ? `El servicio que más contribuyó al pico fue ${topService}.`
            : "No se pudo identificar un servicio dominante.",
          evidence:
            `Fecha: ${dayDate}. Gasto del día: ${fmtUSD(dayCost)}. ` +
            `Mediana del periodo (${sortedDates.length} días): ${fmtUSD(med)}. ` +
            `Ratio: ${fmtUSD(dayCost)} / ${fmtUSD(med)} = ${ratioStr}×. ` +
            (topService ? `Delta de ${topService}: ${fmtUSD(topDelta)} por encima de su promedio diario.` : ""),
        });
      }
    }
  }

  // ── 2. Sustained growth by service ──────────────────────────────────────────
  // Group cost by service by day
  const serviceByDay = new Map<string, Map<string, number>>();
  for (const r of usageRecords) {
    if (!r.date) continue;
    if (!serviceByDay.has(r.nativeService)) serviceByDay.set(r.nativeService, new Map());
    const dm = serviceByDay.get(r.nativeService)!;
    dm.set(r.date, (dm.get(r.date) ?? 0) + r.cost);
  }

  for (const [service, dayMap] of Array.from(serviceByDay.entries())) {
    const allDates = sortedDates.filter((d) => dayMap.has(d));

    // Exclude days already flagged as daily spikes for this service.
    // A single outlier day biases OLS slope significantly; excluding it keeps
    // the regression honest to the sustained trend rather than the puntual event.
    const spikeSet = spikeDatesPerService.get(service) ?? new Set<string>();
    const dates = allDates.filter((d) => !spikeSet.has(d));

    // Need at least 7 clean points after excluding spike days.
    if (dates.length < 7) continue;

    const points: [number, number][] = dates.map((d, i) => [i, dayMap.get(d)!]);
    const { slope, intercept } = linearRegression(points);

    if (slope <= 0 || intercept <= 0) continue;

    const weeklyGrowthPct = (slope * 7) / intercept * 100;
    if (weeklyGrowthPct < 15) continue; // threshold: ≥15%/week

    const currentAvgDaily = dates.reduce((s, d) => s + (dayMap.get(d) ?? 0), 0) / dates.length;
    const projectedDailyIn4Weeks = currentAvgDaily + slope * 28;
    const monthlyCostUplift = round2((projectedDailyIn4Weeks - currentAvgDaily) * 30);

    const excludedNote = spikeSet.size > 0
      ? ` Se excluyeron ${spikeSet.size} día(s) de spike (${Array.from(spikeSet).join(", ")}) para evitar sesgo en la regresión.`
      : "";

    insights.push({
      id: `growth-${service.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`,
      type: "sustained-growth",
      severity: "warning",
      title: `${service} crece ~${Math.round(weeklyGrowthPct)}%/semana`,
      detail: `Si continúa esta tendencia, el gasto en ${service} aumentará ~${fmtUSD(monthlyCostUplift)}/mes en 4 semanas.`,
      evidence:
        `Regresión lineal sobre ${dates.length} días con datos (de ${allDates.length} totales).` +
        excludedNote +
        ` Pendiente: ${fmtUSD(slope)}/día. Intercepto inicial: ${fmtUSD(intercept)}/día.` +
        ` Promedio diario actual: ${fmtUSD(currentAvgDaily)}.` +
        ` Proyectado en +28 días: ${fmtUSD(projectedDailyIn4Weeks)}/día.` +
        ` Crecimiento semanal: ${slope * 7 >= 0 ? "+" : ""}${fmtUSD(slope * 7)}/semana = ${weeklyGrowthPct.toFixed(1)}% sobre el intercepto inicial.`,
    });
    // Limit to top 3 growing services to avoid noise
    if (insights.filter((i) => i.type === "sustained-growth").length >= 3) break;
  }

  // ── 3. Month-end projection (run-rate of last 7 days) ───────────────────────
  const last7Dates = sortedDates.slice(-7);
  const last7Total = last7Dates.reduce((s, d) => s + (dailyTotals.get(d) ?? 0), 0);
  const last7AvgDaily = last7Total / 7;
  const projectedMonthly = round2(last7AvgDaily * 30);

  // Current period total cost
  // Preserve source precision through the division and round only the final
  // monthly amount, matching queryBilling(). Rounding the period total first
  // produced occasional one-cent disagreements with the dashboard.
  const periodTotal = dailyValues.reduce((sum, value) => sum + value, 0);
  const periodDays = sortedDates.length;

  // Only emit if projection is meaningfully different from simple run-rate of whole period
  const wholeAvgDaily = periodTotal / periodDays;
  const baselineMonthly = round2(wholeAvgDaily * 30);
  const deltaMonthly = round2(projectedMonthly - baselineMonthly);
  const diffPct = Math.abs(deltaMonthly) / baselineMonthly * 100;

  if (diffPct >= 5) {
    const direction = deltaMonthly > 0 ? "más" : "menos";
    insights.push({
      id: "month-projection",
      type: "month-projection",
      severity: last7AvgDaily > wholeAvgDaily * 1.1 ? "warning" : "info",
      title: `Ritmo reciente: ~${fmtUSD(projectedMonthly)} en los próximos 30 días`,
      detail:
        `Son ${fmtUSD(Math.abs(deltaMonthly))} (${diffPct.toFixed(1)}%) ${direction} que la referencia mensual ` +
        `de ${fmtUSD(baselineMonthly)}, porque este pronóstico usa sólo los últimos 7 días.`,
      evidence:
        `Últimos 7 días analizados: ${last7Dates[0]} a ${last7Dates[last7Dates.length - 1]}. ` +
        `Gasto total últimos 7 días: ${fmtUSD(last7Total)}. ` +
        `Promedio diario últimos 7 días: ${fmtUSD(last7Total)} / 7 = ${fmtUSD(last7AvgDaily)}. ` +
        `Pronóstico por ritmo reciente: ${fmtUSD(last7AvgDaily)} × 30 = ${fmtUSD(projectedMonthly)}. ` +
        `Referencia mensual del periodo completo: ${fmtUSD(wholeAvgDaily)} × 30 = ${fmtUSD(baselineMonthly)}. ` +
        `Diferencia: ${fmtUSD(Math.abs(deltaMonthly))} (${diffPct.toFixed(1)}%) ${direction}.`,
    });
  }

  // ── 4. New services (absent in first half, present in second half) ───────────
  const midIdx = Math.floor(sortedDates.length / 2);
  const firstHalfDates = new Set(sortedDates.slice(0, midIdx));
  const secondHalfDates = new Set(sortedDates.slice(midIdx));

  const firstHalfServices = new Set<string>();
  const secondHalfServices = new Map<string, { cost: number; firstDate: string }>();

  for (const r of usageRecords) {
    if (!r.date) continue;
    if (firstHalfDates.has(r.date)) {
      firstHalfServices.add(r.nativeService);
    }
    if (secondHalfDates.has(r.date)) {
      const entry = secondHalfServices.get(r.nativeService) ?? { cost: 0, firstDate: r.date };
      entry.cost += r.cost;
      if (r.date < entry.firstDate) entry.firstDate = r.date;
      secondHalfServices.set(r.nativeService, entry);
    }
  }

  for (const [service, { cost, firstDate }] of Array.from(secondHalfServices.entries())) {
    if (firstHalfServices.has(service)) continue; // existed before
    if (cost < 1) continue; // noise threshold

    // Estimate monthly cost from cost in the second half
    const daysInSecondHalf = secondHalfDates.size;
    const projMonthly = round2((cost / daysInSecondHalf) * 30);

    insights.push({
      id: `new-service-${service.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`,
      type: "new-service",
      severity: "info",
      title: `Nuevo gasto detectado: ${service}`,
      detail: `${fmtUSD(cost)} desde ${fmtDate(firstDate)}. A este ritmo: ~${fmtUSD(projMonthly)}/mes.`,
      evidence:
        `Servicio ausente en la primera mitad del periodo (${sortedDates[0]}–${sortedDates[midIdx - 1]}). ` +
        `Primera aparición: ${firstDate}. ` +
        `Gasto en segunda mitad (${secondHalfDates.size} días): ${fmtUSD(cost)}. ` +
        `Proyección mensual: ${fmtUSD(cost)} / ${secondHalfDates.size} días × 30 = ${fmtUSD(projMonthly)}.`,
    });
  }

  return insights;
}
