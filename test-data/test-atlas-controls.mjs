/**
 * Atlas cost-control regression tests.
 * Run: npx tsx test-data/test-atlas-controls.mjs
 */
import assert from "node:assert/strict";

const { tryBuildDeterministicAtlasAnswer } = await import("../src/engine/atlas-deterministic.ts");
const {
  AtlasBudgetTracker,
  estimateAtlasCost,
  normalizeAtlasCacheKey,
} = await import("../src/engine/atlas-controls.ts");

const context = {
  totalCostUSD: 3230.74,
  totalRows: 272,
  usableRows: 270,
  providers: ["azure"],
  topServices: [
    { service: "Microsoft.Compute", costUSD: 2144.02, percentage: 66.36 },
    { service: "Microsoft.Sql", costUSD: 460.48, percentage: 14.25 },
  ],
  financialReconciliation: {
    currency: "USD",
    usageCostBasis: "native-provider-cost",
    commitmentPurchaseCostBasis: null,
    grossUsageCostUSD: 3230.74,
    projectedMonthlyGrossUsageUSD: 3230.74,
    creditsAndRefundsUSD: 120,
    taxesUSD: 45,
    commitmentPurchasesUSD: 0,
    netUsageCostExcludingCommitmentPurchasesUSD: 3155.74,
    invoiceNetCostUSD: 3155.74,
    isInvoiceNetComplete: true,
    wasteAnalysisBaseUSD: 3230.74,
    formula: "3230.74 - 120 + 45 = 3155.74",
    notes: [],
  },
  savingsRange: { conservative: 100, optimistic: 500 },
  topFindings: [
    {
      id: "COMMIT-AZURE",
      title: "Cobertura de compromisos",
      savingsRange: { conservative: 150, optimistic: 846 },
    },
  ],
};

const spend = tryBuildDeterministicAtlasAnswer(
  "¿Cuánto estoy gastando y en qué servicios?",
  context
);
assert.ok(spend, "la consulta factual debe evitar el LLM");
assert.match(spend.content, /\$3,230\.74/);
assert.match(spend.content, /Microsoft\.Compute/);

const spendEnglish = tryBuildDeterministicAtlasAnswer(
  "How much am I spending and on which services?",
  context,
  "en"
);
assert.ok(spendEnglish, "the English factual question must also avoid the LLM");
assert.match(spendEnglish.content, /\$3,230\.74/);
assert.match(spendEnglish.content, /Projected monthly gross spend/);
assert.doesNotMatch(spendEnglish.content, /Gasto bruto mensual/);

const rows = tryBuildDeterministicAtlasAnswer("¿Cuántas filas fueron procesadas?", context);
assert.ok(rows);
assert.match(rows.content, /270 de 272/);

const providers = tryBuildDeterministicAtlasAnswer("¿Qué proveedores contiene?", context);
assert.ok(providers);
assert.match(providers.content, /AZURE/);

const dashboardSpend = tryBuildDeterministicAtlasAnswer(
  "arriba dice Gasto bruto mensual proyectado: $6,358.46/mes.",
  context
);
assert.ok(dashboardSpend);
assert.match(dashboardSpend.content, /\$3,230\.74/);
assert.doesNotMatch(dashboardSpend.content, /\$6,358\.46/);
assert.ok(
  tryBuildDeterministicAtlasAnswer("¿Cuánto estoy gastando?", context),
  "la forma progresiva 'gastando' debe usar la ruta de 0 tokens"
);

const explanation = tryBuildDeterministicAtlasAnswer(
  "Explica por qué debería priorizar compromisos sobre rightsizing",
  context
);
assert.equal(explanation, null, "la explicación estratégica debe seguir usando IA");

assert.equal(
  normalizeAtlasCacheKey("  ¿CUÁNTO   gasté? "),
  "¿cuanto gaste?",
  "la clave de caché normaliza acentos, mayúsculas y espacios"
);

const limits = {
  inputPricePerMillionUSD: 3,
  outputPricePerMillionUSD: 15,
  cacheReadPricePerMillionUSD: 0.3,
};
assert.equal(
  estimateAtlasCost(
    {
      inputTokens: 1000,
      outputTokens: 100,
      cacheReadInputTokens: 0,
      totalTokens: 1100,
    },
    limits
  ),
  0.0045
);

const tracker = new AtlasBudgetTracker();
const fullLimits = {
  dailyTokenBudget: 1000,
  dailyCostBudgetUSD: 1,
  monthlyCostBudgetUSD: 10,
};
assert.deepEqual(tracker.canCallModel(fullLimits), { ok: true });
tracker.recordLlm({
  inputTokens: 800,
  outputTokens: 200,
  cacheReadInputTokens: 0,
  totalTokens: 1000,
  estimatedCostUSD: 0.01,
  modelCalls: 1,
  latencyMs: 10,
});
assert.equal(tracker.canCallModel(fullLimits).ok, false, "el presupuesto diario de tokens corta nuevas llamadas");

console.log("PASS: respuestas determinísticas, caché, costo y presupuesto de Atlas.");
