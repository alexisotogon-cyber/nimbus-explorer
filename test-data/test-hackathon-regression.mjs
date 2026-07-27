/**
 * Regression suite for the four realistic hackathon fixtures.
 *
 * Run:
 *   npx tsx test-data/test-hackathon-regression.mjs
 *
 * Override fixture location with HACKATHON_FIXTURE_DIR when needed.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { parseCSVAutoDetect } = await import("../src/engine/parsers/index.ts");
const { calculateSavings } = await import("../src/engine/tools/calculate-savings.ts");

const fixtureDir =
  process.env.HACKATHON_FIXTURE_DIR ||
  "/Users/ale/Documents/Codex/2026-07-25/users-ale-documents-nodobravo-proyectos-kiro/outputs/hackathon-test-suite";

const cases = [
  {
    name: "AWS",
    file: "aws_cur_2026-06_realistic.csv",
    format: "aws",
    rows: 333,
    usable: 331,
    gross: 1358.32,
    credits: 75,
    taxes: 20,
    purchases: 0,
    net: 1303.32,
  },
  {
    name: "Azure",
    file: "azure_cost_management_export_2026-06_realistic.csv",
    format: "azure",
    rows: 272,
    usable: 270,
    gross: 3230.74,
    credits: 120,
    taxes: 45,
    purchases: 0,
    net: 3155.74,
  },
  {
    name: "GCP",
    file: "gcp_cloud_billing_export_2026-06-25_to_2026-07-24.csv",
    format: "gcp",
    rows: 330,
    usable: 300,
    gross: 4310.61,
    credits: 536.95,
    taxes: 0,
    purchases: 0,
    net: 3773.65,
  },
  {
    name: "FOCUS",
    file: "focus-multicloud-realistic.csv",
    format: "focus",
    rows: 572,
    usable: 570,
    gross: 2763.69,
    credits: 50,
    taxes: 0,
    purchases: 1200,
    net: 2713.69,
  },
];

const round2 = (value) => Math.round(value * 100) / 100;

for (const testCase of cases) {
  const csv = fs.readFileSync(path.join(fixtureDir, testCase.file), "utf8");
  const parsed = parseCSVAutoDetect(csv);
  const report = calculateSavings(parsed.records, parsed.isFocus, parsed.diagnostics);
  const reconciliation = report.financialReconciliation;

  assert.equal(parsed.isFocus ? "focus" : parsed.detectedProvider, testCase.format, `${testCase.name}: formato`);
  assert.equal(parsed.diagnostics.totalRows, testCase.rows, `${testCase.name}: filas totales`);
  assert.equal(parsed.records.length, testCase.usable, `${testCase.name}: filas útiles`);
  assert.equal(round2(reconciliation.grossUsageCostUSD), testCase.gross, `${testCase.name}: bruto`);
  assert.equal(round2(reconciliation.creditsAndRefundsUSD), testCase.credits, `${testCase.name}: créditos`);
  assert.equal(round2(reconciliation.taxesUSD), testCase.taxes, `${testCase.name}: impuestos`);
  assert.equal(round2(reconciliation.commitmentPurchasesUSD), testCase.purchases, `${testCase.name}: compras`);
  assert.equal(
    round2(reconciliation.netUsageCostExcludingCommitmentPurchasesUSD),
    testCase.net,
    `${testCase.name}: neto de uso`
  );

  console.log(
    `PASS ${testCase.name}: ${testCase.rows}/${testCase.usable} filas, ` +
      `bruto $${testCase.gross.toFixed(2)}, neto $${testCase.net.toFixed(2)}`
  );

  if (testCase.name === "Azure") {
    assert.ok(
      report.findings.some((finding) => finding.id === "AI-VIS-SPEND"),
      "Azure: Azure OpenAI debe activar visibilidad IA"
    );
    assert.ok(
      report.findings.some((finding) => finding.id === "COMMIT-AZURE"),
      "Azure: una Reservation parcial no debe suprimir el gasto On-Demand sin cubrir"
    );
    assert.ok(
      parsed.records.every((record) => !!record.resourceId),
      "Azure: ResourceId nativo debe preservarse"
    );
  }

  if (testCase.name === "GCP") {
    assert.ok(
      !report.findings.some((finding) => finding.id === "AI-TAG-ATTRIBUTION"),
      "GCP: project.id debe reconocerse como atribución parcial"
    );
  }

  if (testCase.name === "FOCUS") {
    assert.equal(reconciliation.invoiceNetCostUSD, null, "FOCUS: no mezclar Purchase cash con EffectiveCost");
    assert.equal(reconciliation.isInvoiceNetComplete, false, "FOCUS: el neto de factura debe marcarse parcial");
  }
}

console.log("PASS: regresión financiera y semántica de los cuatro fixtures.");
