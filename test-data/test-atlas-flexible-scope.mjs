import assert from "node:assert/strict";

const {
  OUT_OF_SCOPE_REPLY,
  shouldForceOutOfScopeReply,
} = await import("../src/engine/agent.ts");
const { tryBuildDeterministicAtlasAnswer } = await import(
  "../src/engine/atlas-deterministic.ts"
);

const context = {
  totalCostUSD: 100,
  periodStart: "2026-06-01",
  periodEnd: "2026-06-30",
  financialReconciliation: {
    grossUsageCostUSD: 100,
    creditsAndRefundsUSD: 0,
    taxesUSD: 0,
    commitmentPurchasesUSD: 0,
    netUsageCostExcludingCommitmentPurchasesUSD: 100,
    invoiceNetCostUSD: null,
    isInvoiceNetComplete: false,
    formula: "100 - 0 + 0 = 100",
  },
  totalRows: 3,
  usableRows: 3,
  providers: ["aws"],
  topServices: [],
  portfolioSavingsUSD: 10,
  savingsRange: { conservative: 5, optimistic: 20 },
  topFindings: [],
};

assert.equal(shouldForceOutOfScopeReply("¿qué es una cifra?", 0), false);
assert.equal(shouldForceOutOfScopeReply("¿qué es nube?", 0), false);
assert.equal(shouldForceOutOfScopeReply("¿qué error tuviste?", 0), false);
assert.equal(shouldForceOutOfScopeReply("¿por qué?", 0), false);
assert.equal(shouldForceOutOfScopeReply("dame una receta para hornear pan", 0), true);
assert.equal(shouldForceOutOfScopeReply("quién ganó el partido de fútbol", 0), true);
assert.ok(OUT_OF_SCOPE_REPLY.includes("fuera de Atlas"));

const figure = tryBuildDeterministicAtlasAnswer("¿qué es una cifra?", context, "es");
assert.ok(figure?.content.includes("valor numérico"));
const cloud = tryBuildDeterministicAtlasAnswer("¿qué es nube?", context, "es");
assert.ok(cloud?.content.includes("AWS"));
const gross = tryBuildDeterministicAtlasAnswer("¿qué es gasto bruto?", context, "es");
assert.ok(gross?.content.includes("$100.00"));
assert.ok(gross?.content.includes("antes de restar"));

const today = tryBuildDeterministicAtlasAnswer("¿cuánto gasté hoy?", context, "es");
assert.ok(today?.content.includes("No puedo aislar"));
assert.ok(today?.content.includes("2026-06-01"));

const social = tryBuildDeterministicAtlasAnswer("¿cómo estás?", context, "es");
assert.ok(social?.content.includes("Bien"));

const clarification = tryBuildDeterministicAtlasAnswer("?", context, "es");
assert.ok(clarification?.content.includes("Qué parte"));

const findingContext = {
  ...context,
  topFindings: [{
    id: "finding-1",
    title: "Reducir NAT Gateway",
    savingsRange: { conservative: 10, optimistic: 20 },
  }],
};
const mostExpensive = tryBuildDeterministicAtlasAnswer(
  "¿cuál es el hallazgo más caro?",
  findingContext,
  "es"
);
assert.ok(mostExpensive?.content.includes("Reducir NAT Gateway"));

console.log("PASS Atlas: alcance flexible, conceptos adyacentes y descarte explícito.");
