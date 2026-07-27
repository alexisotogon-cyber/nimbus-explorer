import assert from "node:assert/strict";

const { generateDemoData } = await import("../src/engine/demo-data.ts");
const { calculateSavings } = await import("../src/engine/tools/calculate-savings.ts");
const { tryBuildDeterministicAtlasAnswer } = await import("../src/engine/atlas-deterministic.ts");
const { resolveAtlasScreenContext } = await import("../src/engine/atlas-screen-context.ts");

const records = generateDemoData({
  provider: "aws",
  complexity: "medium",
  variant: "standard",
});
const report = calculateSavings(records);
const finding = report.findings.find((candidate) => candidate.estimatedMonthlySavingsUSD > 0);
assert.ok(finding, "the demo must contain a quantified finding");

const context = {
  totalCostUSD: report.totalCostUSD,
  periodStart: report.periodStart,
  periodEnd: report.periodEnd,
  financialReconciliation: report.financialReconciliation,
  totalRows: records.length,
  usableRows: records.length,
  providers: report.providers,
  topServices: report.summaryByService.slice(0, 5).map((service) => ({
    service: service.service,
    costUSD: service.totalCostUSD,
    percentage: 0,
  })),
  portfolioSavingsUSD: report.portfolioSavingsUSD,
  savingsRange: {
    conservative: report.totalSavingsRange.conservative,
    optimistic: report.totalSavingsRange.optimistic,
  },
  topFindings: report.findings.slice(0, 3).map((item) => ({
    id: item.id,
    title: item.title,
    savingsRange: item.savingsRange,
  })),
};

const atlasAnswer = tryBuildDeterministicAtlasAnswer(
  "atlas que es?",
  context,
  "es",
  resolveAtlasScreenContext({ activeTab: "overview" }, report)
);
assert.ok(atlasAnswer?.content.includes("guía FinOps"), "Atlas must explain itself");

const screenAnswer = tryBuildDeterministicAtlasAnswer(
  "¿qué estoy viendo?",
  context,
  "es",
  resolveAtlasScreenContext(
    { activeTab: "findings", expandedFindingId: finding.id },
    report
  )
);
assert.ok(screenAnswer?.content.includes(finding.title), "screen answer must identify the open finding");
assert.ok(screenAnswer?.content.includes("Qué hacer ahora"), "screen answer must provide the next action");

const scenarioAnswer = tryBuildDeterministicAtlasAnswer(
  "explica esta pantalla",
  context,
  "es",
  resolveAtlasScreenContext(
    { activeTab: "scenarios" },
    report,
    {
      input: { preset: "custom", overrides: { sample: 0.42 } },
      scenarioRevision: 3,
      monthlySavingsUSD: 321.45,
      annualSavingsUSD: 3857.4,
      deltaFromCurrentUSD: -20,
      deltaFromBaseUSD: -20,
      findings: [],
      excludedAlternatives: [],
    }
  )
);
assert.ok(scenarioAnswer?.content.includes("Escenarios"), "screen answer must identify the scenarios tab");
assert.ok(scenarioAnswer?.content.includes("$321.45"), "screen answer must use the live scenario result");
assert.ok(scenarioAnswer?.content.includes("1"), "screen answer must include changed variables");

console.log("PASS Atlas: contexto de producto, pestaña y hallazgo visibles con cero tokens.");
