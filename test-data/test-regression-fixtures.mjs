/**
 * Regression snapshot for the five anglo-format fixtures.
 * These files use plain `1234.56` amounts and ISO dates, so the amount/date
 * coercion work must NOT change any of their figures.
 *
 * Run: npx tsx test-data/test-regression-fixtures.mjs
 * Compare against test-data/out-regression-baseline.json (written on first run
 * with BASELINE=1, then diffed on subsequent runs).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { parseCSVAutoDetect } = await import("../src/engine/parsers/index.ts");
const { calculateSavings } = await import("../src/engine/tools/calculate-savings.ts");

const FIXTURES = [
  "caso-prueba-aws.csv",
  "caso-prueba-focus.csv",
  "caso-complejo-azure-focus.csv",
  "caso-focus-gcp-sin-servicecategory.csv",
  "caso-focus-1.4-serviceprovidername.csv",
];

const round = (n) => Math.round(n * 100) / 100;

const snapshot = {};
for (const f of FIXTURES) {
  const csv = fs.readFileSync(path.join(__dirname, f), "utf8");
  const parsed = parseCSVAutoDetect(csv);
  const report = calculateSavings(parsed.records, parsed.isFocus);
  snapshot[f] = {
    records: parsed.records.length,
    totalCostUSD: round(report.totalCostUSD),
    totalSavingsUSD: round(report.totalEstimatedSavingsUSD),
    findings: report.findings.length,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    findingIds: report.findings.map((x) => x.id).sort(),
    perFinding: Object.fromEntries(
      report.findings
        .slice()
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((x) => [x.id, round(x.estimatedMonthlySavingsUSD)])
    ),
    droppedRows: parsed.diagnostics
      ? {
          unparsableAmount: parsed.diagnostics.unparsableAmountRows,
          unparsableDate: parsed.diagnostics.unparsableDateRows,
          ambiguousDateOrder: parsed.diagnostics.ambiguousDateOrder,
        }
      : null,
  };
}

const baselinePath = path.join(__dirname, "out-regression-baseline.json");

if (process.env.BASELINE === "1" || !fs.existsSync(baselinePath)) {
  fs.writeFileSync(baselinePath, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`Baseline written to ${path.relative(process.cwd(), baselinePath)}`);
  for (const [f, s] of Object.entries(snapshot)) {
    console.log(`  ${f}: ${s.records} registros, ${s.findings} hallazgos, coste $${s.totalCostUSD}, ahorro $${s.totalSavingsUSD}`);
  }
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
let failed = 0;

for (const f of FIXTURES) {
  const a = baseline[f];
  const b = snapshot[f];
  // droppedRows is new information, not part of the pre-change figures.
  const cmpA = { ...a, droppedRows: undefined };
  const cmpB = { ...b, droppedRows: undefined };
  const same = JSON.stringify(cmpA) === JSON.stringify(cmpB);
  if (same) {
    console.log(
      `  PASS  ${f} — ${b.records} registros, ${b.findings} hallazgos, coste $${b.totalCostUSD}, ahorro $${b.totalSavingsUSD}` +
        (b.droppedRows
          ? ` (descartes: importe ${b.droppedRows.unparsableAmount}, fecha ${b.droppedRows.unparsableDate})`
          : "")
    );
  } else {
    failed++;
    console.error(`  FAIL  ${f}`);
    console.error(`        antes:  ${JSON.stringify(cmpA)}`);
    console.error(`        ahora:  ${JSON.stringify(cmpB)}`);
  }
}

console.log(failed === 0 ? "\nSin cambios respecto a la baseline." : `\n${failed} fixture(s) cambiaron.`);
process.exit(failed === 0 ? 0 : 1);
