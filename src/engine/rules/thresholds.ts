import { NormalizedCostRecord } from "../types";

/**
 * Data-window thresholds shared by the rule engine and by the file diagnosis
 * panel, so the two can never promise different things.
 *
 * Why this module exists: `file-check.ts` told the user that aggregate findings
 * need "al menos 7 días de datos diarios distintos", but only ONE rule out of
 * thirteen actually enforced it. With a single day of billing in the file every
 * rule still ran `total / 1 * 30`, so a $1.600 day was published as $48.000/mes
 * of waste. The promise and the behaviour now come from the same constant.
 */

/**
 * Minimum distinct days required before a rule may extrapolate a daily average
 * to a monthly figure.
 *
 * 7 is the smallest window that covers a full weekly cycle. Anything shorter
 * cannot tell a weekend dip from a decommissioned resource, and multiplying it
 * by 30 turns that ambiguity into a headline number.
 */
export const MIN_DISTINCT_DAYS = 7;

/** Distinct calendar days present in a record set. Empty dates never count. */
export function distinctDayCount(records: NormalizedCostRecord[]): number {
  return new Set(records.map((r) => r.date).filter(Boolean)).size;
}

/** True when the record set covers enough days to project to a month. */
export function hasProjectableWindow(records: NormalizedCostRecord[]): boolean {
  return distinctDayCount(records) >= MIN_DISTINCT_DAYS;
}

/** Human-readable explanation of why nothing was published, in Spanish. */
export function insufficientWindowMessage(distinctDays: number): string {
  return (
    `El archivo cubre ${distinctDays} ${distinctDays === 1 ? "día" : "días"} distintos de facturación. ` +
    `Los hallazgos agregados necesitan al menos ${MIN_DISTINCT_DAYS} para proyectar a mes sin inventar: ` +
    `con menos, multiplicar el promedio diario por 30 convierte un fin de semana o un pico puntual ` +
    `en una cifra mensual que no existe. Exporta un rango de al menos ${MIN_DISTINCT_DAYS} días ` +
    `(idealmente 30) y vuelve a subirlo.`
  );
}
