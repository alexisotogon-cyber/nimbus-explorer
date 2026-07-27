import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

const { parseCSVAutoDetect } = await import("../src/engine/parsers/index.ts");
const { calculateSavings } = await import("../src/engine/tools/calculate-savings.ts");
const { buildReportExportModel } = await import("../src/engine/exports/model.ts");
const { buildMarkdownExport } = await import("../src/engine/exports/markdown.ts");
const { buildExcelExport } = await import("../src/engine/exports/excel.ts");
const { buildPdfExport } = await import("../src/engine/exports/pdf.tsx");

const csv = await fs.readFile("test-data/e2e/aws-cur-nativo.csv", "utf8");
const parsed = parseCSVAutoDetect(csv);
const report = calculateSavings(parsed.records, parsed.isFocus, parsed.diagnostics, parsed.schemaCoverage);
const stored = {
  records: parsed.records,
  report,
  totalRows: parsed.diagnostics?.totalRows ?? parsed.records.length,
  scenario: { preset: "current", overrides: {} },
  createdAt: Date.now(),
  lastUsed: Date.now(),
};
const analysisId = "11111111-2222-4333-8444-555555555555";
const model = buildReportExportModel(stored, analysisId, "es");
const outputDir = path.join("test-data", "out", "premium-exports");
await fs.mkdir(outputDir, { recursive: true });

const markdown = buildMarkdownExport(model);
assert.match(markdown, /Resumen ejecutivo/);
assert.doesNotMatch(markdown, /localhost:3000|127\.0\.0\.1|file:\/\//);
await fs.writeFile(path.join(outputDir, "report.md"), markdown);

const xlsx = await buildExcelExport(model);
await fs.writeFile(path.join(outputDir, "report.xlsx"), xlsx);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(xlsx);
assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [
  "_Lists",
  "Resumen",
  "Plan de acción",
  "_Audit",
  "Servicios",
  "Escenarios y evidencia",
  "Finanzas y calidad",
  ...(model.trends.length > 0 ? ["Tendencias"] : []),
]);
assert.equal(workbook.getWorksheet("_Lists").state, "veryHidden");
assert.equal(workbook.getWorksheet("_Audit").state, "veryHidden");
assert.equal(Boolean(workbook.getWorksheet("Tendencias")), model.trends.length > 0);
assert.ok(workbook.getWorksheet("Plan de acción").getTable("ActionPlan"));
assert.ok(workbook.getWorksheet("Plan de acción").getCell("L5").dataValidation);
assert.ok(workbook.getWorksheet("Plan de acción").getCell("M5").dataValidation);
const reconciliationSheet = workbook.getWorksheet("Finanzas y calidad");
assert.ok(reconciliationSheet.getCell("B11").formula);
assert.ok(Math.abs(Number(reconciliationSheet.getCell("B11").result)) < 0.01);
assert.equal(reconciliationSheet.getCell("D11").result, "Conciliado");

const pdfBuffer = await buildPdfExport(model);
assert.equal(pdfBuffer.subarray(0, 4).toString(), "%PDF");
assert.doesNotMatch(pdfBuffer.toString("latin1"), /localhost:3000|127\.0\.0\.1/);
await fs.writeFile(path.join(outputDir, "report.pdf"), pdfBuffer);

console.log(`PASS: premium exports written to ${outputDir}`);
