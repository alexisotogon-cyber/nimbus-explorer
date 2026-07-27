import { FinancialReconciliation, NormalizedCostRecord } from "./types";
import { ParseDiagnostics } from "./parsers/coerce";

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Builds the accounting bridge separately from the waste rules. Positive usage
 * remains the optimization base; credits, taxes and purchases are surfaced so
 * neither the UI nor Atlas has to infer them from prose.
 */
export function buildFinancialReconciliation(
  records: NormalizedCostRecord[],
  projectedMonthlyGrossUsageUSD: number,
  diagnostics?: ParseDiagnostics
): FinancialReconciliation {
  const grossUsageRaw = records.reduce((sum, record) => sum + record.cost, 0);
  const creditsRaw = diagnostics?.creditTotalUSD ?? 0;
  const taxesRaw = diagnostics?.taxTotalUSD ?? 0;
  const purchasesRaw = diagnostics?.commitmentPurchaseTotalUSD ?? 0;
  const grossUsageCostUSD = round2(grossUsageRaw);
  const creditsAndRefundsUSD = round2(creditsRaw);
  const taxesUSD = round2(taxesRaw);
  const commitmentPurchasesUSD = round2(purchasesRaw);
  // Round only after the complete formula. Summing already-rounded display
  // values caused a one-cent drift on the GCP fixture.
  const netUsageCostExcludingCommitmentPurchasesUSD = round2(
    grossUsageRaw - creditsRaw + taxesRaw
  );
  const hasDiagnostics = diagnostics !== undefined;
  const mixesCommitmentCashAndAccrual = commitmentPurchasesUSD > 0;
  const usageCostBasis = records.some((record) => record.effectiveCost !== undefined)
    ? "effective-cost"
    : "native-provider-cost";

  const notes: string[] = [
    "La base de optimización usa cargos positivos de uso; créditos e impuestos no cambian si un recurso está desperdiciando capacidad.",
  ];
  if (!hasDiagnostics) {
    notes.push("No hubo diagnóstico de archivo; el neto no puede considerarse una conciliación completa.");
  }
  if (mixesCommitmentCashAndAccrual) {
    notes.push(
      "El gasto bruto de uso está calculado con EffectiveCost (devengo). La compra de compromiso usa BilledCost (caja), se muestra aparte y no se suma al neto para evitar mezclar bases y duplicar gasto."
    );
  }

  return {
    currency: "USD",
    usageCostBasis,
    commitmentPurchaseCostBasis: commitmentPurchasesUSD > 0 ? "billed-cost" : null,
    grossUsageCostUSD,
    projectedMonthlyGrossUsageUSD: round2(projectedMonthlyGrossUsageUSD),
    creditsAndRefundsUSD,
    taxesUSD,
    commitmentPurchasesUSD,
    netUsageCostExcludingCommitmentPurchasesUSD,
    invoiceNetCostUSD:
      hasDiagnostics && !mixesCommitmentCashAndAccrual
        ? netUsageCostExcludingCommitmentPurchasesUSD
        : null,
    isInvoiceNetComplete: hasDiagnostics && !mixesCommitmentCashAndAccrual,
    wasteAnalysisBaseUSD: grossUsageCostUSD,
    formula:
      `${grossUsageCostUSD.toFixed(2)} - ${creditsAndRefundsUSD.toFixed(2)} + ` +
      `${taxesUSD.toFixed(2)} ≈ ${netUsageCostExcludingCommitmentPurchasesUSD.toFixed(2)} USD ` +
      `(calculado con la precisión original; sin compras de compromiso)`,
    notes,
  };
}
