import assert from "node:assert/strict";
import fs from "node:fs";

const { formatDate } = await import("../src/i18n/formatters.ts");
const { parseCSVAutoDetect } = await import("../src/engine/parsers/index.ts");
const { calculateSavings } = await import("../src/engine/tools/calculate-savings.ts");
const { currentScenario } = await import("../src/engine/scenarios.ts");

assert.equal(formatDate("2026-07-01", "es"), "1 de julio de 2026");
assert.equal(formatDate("2026-07-01", "en"), "July 1, 2026");

const parsed = parseCSVAutoDetect(
  fs.readFileSync("test-data/ronda2-aws-nativo-complejo.csv", "utf8")
);
const report = calculateSavings(
  parsed.records,
  parsed.isFocus,
  parsed.diagnostics,
  parsed.schemaCoverage
);
const scenario = currentScenario(report);

assert.equal(scenario.monthlySavingsUSD, report.portfolioSavingsUSD);
assert.equal(scenario.deltaFromCurrentUSD, 0);
assert.equal(scenario.deltaFromBaseUSD, 0);

console.log("PASS P1: calendar dates and current scenario delta");
