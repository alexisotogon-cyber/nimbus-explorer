import { AuditReport } from "./types";
import { calculateSavings } from "./tools/calculate-savings";

export interface AwsNoSpendReportInput {
  startDate: string;
  /** AWS Cost Explorer treats this date as exclusive. */
  endDateExclusive: string;
  returnedCostUSD: number;
  returnedGroupCount: number;
  queriedPeriodCount: number;
}

function previousUtcDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

function requestedDayCount(startDate: string, endDateExclusive: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDateExclusive}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 86_400_000);
}

/**
 * Builds a real, navigable report for a successful Cost Explorer query that
 * returned no positive usage. Keeping this as a report makes dashboard, Atlas
 * and exports agree that the result is $0 rather than silently stopping.
 */
export function buildAwsNoSpendReport(input: AwsNoSpendReportInput): AuditReport {
  const report = calculateSavings([], false);
  const returnedCostUSD = Math.round(input.returnedCostUSD * 100) / 100;
  const creditsAndRefundsUSD = Math.max(0, -returnedCostUSD);
  const observedDays =
    input.queriedPeriodCount ||
    requestedDayCount(input.startDate, input.endDateExclusive);

  report.periodStart = input.startDate;
  report.periodEnd = previousUtcDate(input.endDateExclusive);
  report.providers = ["aws"];
  report.analysisLevel = "summary";
  report.breakdownDimension = "Service + Usage Type";
  report.observationDays = observedDays;
  report.dataWindow = {
    ...report.dataWindow,
    distinctDays: observedDays,
  };
  report.financialReconciliation = {
    currency: "USD",
    usageCostBasis: "native-provider-cost",
    commitmentPurchaseCostBasis: null,
    grossUsageCostUSD: 0,
    projectedMonthlyGrossUsageUSD: 0,
    creditsAndRefundsUSD,
    taxesUSD: 0,
    commitmentPurchasesUSD: 0,
    netUsageCostExcludingCommitmentPurchasesUSD: returnedCostUSD,
    invoiceNetCostUSD: returnedCostUSD,
    isInvoiceNetComplete: true,
    wasteAnalysisBaseUSD: 0,
    formula: `0.00 - ${creditsAndRefundsUSD.toFixed(2)} + 0.00 = ${returnedCostUSD.toFixed(2)} USD`,
    notes: [
      "AWS Cost Explorer respondió correctamente, pero no devolvió cargos positivos de uso para el periodo consultado.",
      "Sin gasto positivo no existe una base financiera sobre la cual generar recomendaciones de ahorro.",
    ],
  };
  report.sourceOutcome = {
    code: "aws-cost-explorer-no-positive-cost",
    returnedCostUSD,
    returnedGroupCount: input.returnedGroupCount,
    queriedPeriodCount: observedDays,
  };

  return report;
}
