/**
 * AUDIT — FOCUS con encabezados espaciados: detección OK pero 0 filas útiles.
 * Run: npx tsx test-data/audit/audit-empty-report.mjs
 */
const { parseCSVAutoDetect, detectFormat, readHeaders } = await import("../../src/engine/parsers/index.ts");
const { calculateSavings } = await import("../../src/engine/tools/calculate-savings.ts");
const { diagnoseUpload } = await import("../../src/engine/validation/file-check.ts");
const { buildReport } = await import("../../src/engine/tools/build-report.ts");

const HEAD_ESPACIADO = "Billing Account Id,Billing Currency,Billed Cost,Effective Cost,Charge Period Start,Charge Category,Charge Description,Provider Name,Service Name,Service Category,Sku Id,Region Id";
const rows = [];
for (let i = 1; i <= 14; i++) {
  rows.push(`111122223333,USD,500,500,2026-06-${String(i).padStart(2, "0")}T00:00:00Z,Usage,EBS:VolumeUsage.gp3,AWS,Amazon Elastic Block Store,Storage,EBS,us-east-1`);
}
const csv = [HEAD_ESPACIADO, ...rows].join("\n");

console.log("Encabezados del archivo:", readHeaders(csv).join(" | "));
console.log("Detección de formato:", JSON.stringify(detectFormat(readHeaders(csv))));
const parsed = parseCSVAutoDetect(csv);
console.log(`Filas de datos en el archivo: ${rows.length}`);
console.log(`Registros parseados: ${parsed.records.length}  (isFocus=${parsed.isFocus})`);
const diag = diagnoseUpload(csv, parsed);
console.log(`Diagnóstico: formato=${diag.detectedFormat}, totalDataRows=${diag.totalDataRows}, usableRows=${diag.usableRows}, distinctDays=${diag.distinctDays}`);
console.log(`Motivos de descarte reportados al usuario:`);
for (const d of diag.dropped) console.log(`   - ${d.reason} ×${d.count}: ${d.hint}`);
const rep = calculateSavings(parsed.records, parsed.isFocus);
console.log(`Informe: coste=$${rep.totalCostUSD}, ahorro=$${rep.totalEstimatedSavingsUSD}, hallazgos=${rep.findings.length}, periodo="${rep.periodStart}"–"${rep.periodEnd}"`);
console.log(`Se lanzó excepción: NO`);
const md = buildReport(rep);
console.log("Primeras líneas del markdown generado:");
console.log(md.split("\n").slice(0, 10).map((l) => "   " + l).join("\n"));
