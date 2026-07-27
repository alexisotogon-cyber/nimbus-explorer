import assert from "node:assert/strict";
const { buildAwsNoSpendReport } = await import("../src/engine/aws-zero-spend.ts");

const report = buildAwsNoSpendReport({
  startDate: "2026-06-26",
  endDateExclusive: "2026-07-26",
  returnedCostUSD: 0,
  returnedGroupCount: 0,
  queriedPeriodCount: 30,
});

assert.deepEqual(report.providers, ["aws"]);
assert.equal(report.periodStart, "2026-06-26");
assert.equal(report.periodEnd, "2026-07-25");
assert.equal(report.totalCostUSD, 0);
assert.equal(report.portfolioSavingsUSD, 0);
assert.equal(report.findings.length, 0);
assert.equal(report.analysisLevel, "summary");
assert.equal(report.observationDays, 30);
assert.equal(report.financialReconciliation.invoiceNetCostUSD, 0);
assert.equal(report.financialReconciliation.isInvoiceNetComplete, true);
assert.equal(report.sourceOutcome?.code, "aws-cost-explorer-no-positive-cost");

console.log("AWS zero-spend report: PASS");
