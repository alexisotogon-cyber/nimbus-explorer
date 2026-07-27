/**
 * Reproduce los tres defectos con los mismos casos que los detectaron y demuestra
 * con números que están cerrados.
 * Run: npx tsx test-data/test-defectos-cerrados.mjs
 */

const { parseAzureCSV, parseFOCUSCSV, createParseDiagnostics } = await import(
  "../src/engine/parsers/index.ts"
);
const { utilizationReviewRule } = await import("../src/engine/rules/idle-resources.ts");
const { aiGpuReviewRule } = await import("../src/engine/rules/ai-spend.ts");

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = Object.is(actual, expected);
  if (ok) {
    console.log(`  PASS  ${label} → ${actual}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label} → esperado ${expected}, obtenido ${actual}`);
    failed++;
  }
}

const r2 = (n) => Math.round(n * 100) / 100;

// ─── DEFECTO 1 — importes en formato europeo ─────────────────────────────────
console.log("── DEFECTO 1: importes europeos (antes 3.734,56 → 3,73) ──────");

// Export de Azure Cost Management con coma decimal y punto de miles.
const azureEU = [
  "Date,MeterCategory,MeterSubCategory,MeterName,ResourceLocation,SubscriptionId,CostInBillingCurrency,Quantity,ConsumedService,ChargeType",
  "2026-06-01,Virtual Machines,Dv3 Series,D4 v3,eastus,sub-1,\"1.500,00\",24,Microsoft.Compute,Usage",
  "2026-06-02,Virtual Machines,Dv3 Series,D4 v3,eastus,sub-1,\"1.234,56\",24,Microsoft.Compute,Usage",
  "2026-06-03,Storage,Blob,Hot LRS,eastus,sub-1,\"1 000,00\",100,Microsoft.Storage,Usage",
  "2026-06-04,Storage,Blob,Hot LRS,eastus,sub-1,\"N/A\",100,Microsoft.Storage,Usage",
].join("\n");

const diagEU = createParseDiagnostics();
const recEU = parseAzureCSV(azureEU, diagEU);
const totalEU = r2(recEU.reduce((s, r) => s + r.cost, 0));

check("filas parseadas (la de 'N/A' se descarta)", recEU.length, 3);
check("total del archivo europeo", totalEU, 3734.56);
check("importe de la fila '1.234,56'", recEU[1].cost, 1234.56);
check("filas descartadas por importe ilegible (contables)", diagEU.unparsableAmountRows, 1);
// Antes: parseFloat("1.500,00")=1.5 + parseFloat("1.234,56")=1.234 + parseFloat("1 000,00")=1
// → 3,73 y ningún aviso.
console.log(`        antes: 1.5 + 1.234 + 1 = 3.73 · ahora: ${totalEU}`);

// ─── DEFECTO 2 — mismo día en dos formatos ───────────────────────────────────
console.log("\n── DEFECTO 2: el mismo día en dos formatos = UN día ───────────");

const focusMixed = [
  "BilledCost,EffectiveCost,ChargePeriodStart,ChargePeriodEnd,BillingAccountId,BillingCurrency,ChargeCategory,ServiceName,ServiceCategory,ProviderName,ChargeDescription",
  "100,100,2026-02-01,2026-02-02,acct,USD,Usage,Amazon EC2,Compute,AWS,BoxUsage:m6i.xlarge",
  "100,100,2026-02-01T00:00:00Z,2026-02-02,acct,USD,Usage,Amazon EC2,Compute,AWS,BoxUsage:m6i.xlarge",
  "100,100,2026/02/01,2026-02-02,acct,USD,Usage,Amazon EC2,Compute,AWS,BoxUsage:m6i.xlarge",
  "100,100,01/02/2026,2026-02-02,acct,USD,Usage,Amazon EC2,Compute,AWS,BoxUsage:m6i.xlarge",
  "100,100,1769904000,2026-02-02,acct,USD,Usage,Amazon EC2,Compute,AWS,BoxUsage:m6i.xlarge",
  "100,100,1 de febrero de 2026,2026-02-02,acct,USD,Usage,Amazon EC2,Compute,AWS,BoxUsage:m6i.xlarge",
  "100,100,2026-02-31,2026-02-02,acct,USD,Usage,Amazon EC2,Compute,AWS,BoxUsage:m6i.xlarge",
].join("\n");

const diagMixed = createParseDiagnostics();
const recMixed = parseFOCUSCSV(focusMixed, diagMixed);
const daysMixed = new Set(recMixed.map((r) => r.date));

// Las cuatro grafías del 1 de febrero (ISO, ISO con hora Z, con barras y
// 01/02/2026 leído con el orden por defecto día-primero) colapsan en un solo día.
// El epoch, el texto libre y el 31 de febrero se descartan y quedan contados.
check("filas válidas (epoch, texto libre y 31-feb descartadas)", recMixed.length, 4);
check("descartes por fecha ilegible (contables)", diagMixed.unparsableDateRows, 3);
check("orden ambiguo reportado al usuario", diagMixed.ambiguousDateOrder, true);
check("orden asumido", diagMixed.assumedDateOrder, "day-first");
check("el mismo día en cuatro formatos cuenta como UN día", daysMixed.size, 1);
check("y agrupa las 4 filas en 2026-02-01", recMixed.filter((r) => r.date === "2026-02-01").length, 4);
console.log(`        días distintos en el archivo: ${[...daysMixed].sort().join(", ")}`);
console.log(`        antes: 4 grafías = 4 días → proyección /4; ahora: 1 día`);

// Misma prueba con el archivo desambiguado: 13/02 fija día primero, así que
// 01/02/2026 pasa a ser 1 de febrero y colapsa con las grafías ISO.
const focusDMY = focusMixed
  .split("\n")
  .filter((l, i) => i === 0 || !/1769904000|1 de febrero|2026-02-31/.test(l))
  .concat("100,100,13/02/2026,2026-02-14,acct,USD,Usage,Amazon EC2,Compute,AWS,BoxUsage:m6i.xlarge")
  .join("\n");
const diagDMY = createParseDiagnostics();
const recDMY = parseFOCUSCSV(focusDMY, diagDMY);
const daysDMY = [...new Set(recDMY.map((r) => r.date))].sort();
check("con 13/02/2026 el orden queda determinado (ya no es una suposición)", diagDMY.ambiguousDateOrder, false);
check("las 4 grafías del 1-feb son un solo día", daysDMY.join(","), "2026-02-01,2026-02-13");

// ─── DEFECTO 3 — reglas que contaban registros ───────────────────────────────
console.log("\n── DEFECTO 3: 4 días con 8 registros ─────────────────────────");

function computeRecord(date, cost, usageType, service) {
  return {
    provider: "aws",
    category: "compute",
    nativeService: service,
    nativeUsageType: usageType,
    region: "us-east-1",
    date,
    cost,
    quantity: 12,
    accountId: "123456789012",
    chargeType: "Usage",
  };
}

// 4 días, 2 líneas por día, 300 USD/día → 1200 USD observados.
// Correcto: 1200 / 4 días × 30 = 9.000 USD/mes.
// Antes:    1200 / 8 registros × 30 = 4.500 USD/mes, y la regla se emitía aunque
//           el umbral son 7 días.
const dates4 = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"];
const recs4d = dates4.flatMap((d) => [
  computeRecord(d, 150, "BoxUsage:m6i.xlarge", "Amazon EC2"),
  computeRecord(d, 150, "BoxUsage:m6i.xlarge", "Amazon EC2"),
]);

check("registros de entrada", recs4d.length, 8);
check("días distintos", new Set(recs4d.map((r) => r.date)).size, 4);
check("UTIL-REVIEW no se emite con 4 días (umbral 7 días)", utilizationReviewRule.evaluate(recs4d).length, 0);

const recsGpu4d = dates4.flatMap((d) => [
  computeRecord(d, 150, "BoxUsage:p4d.24xlarge", "Amazon EC2"),
  computeRecord(d, 150, "BoxUsage:p4d.24xlarge", "Amazon EC2"),
]);
check("AI-GPU no se emite con 4 días (umbral 7 días)", aiGpuReviewRule.evaluate(recsGpu4d).length, 0);

// 7 días × 2 líneas/día × 150 USD = 2100 USD → 2100 / 7 × 30 = 9.000 USD/mes.
const dates7 = [
  "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04",
  "2026-06-05", "2026-06-06", "2026-06-07",
];
const recs7d = dates7.flatMap((d) => [
  computeRecord(d, 150, "BoxUsage:m6i.xlarge", "Amazon EC2"),
  computeRecord(d, 150, "BoxUsage:m6i.xlarge", "Amazon EC2"),
]);
const util7 = utilizationReviewRule.evaluate(recs7d);
check("UTIL-REVIEW se emite con 7 días", util7.length, 1);
// El hallazgo no declara ahorro (fuera de alcance del billing); la cifra mensual
// viaja en el desglose de cálculo y en el optimista teórico (30%).
check("proyección mensual = 2100/7×30 = 9000 (30% = 2700)", util7[0].savingsRange.optimistic, 2700);
console.log(`        antes: 2100/14 registros×30 = 4500/mes (optimista 1350) · ahora: 9000/mes`);
console.log(`        desglose: ${util7[0].calculationBreakdown.split(".")[0]}.`);

const gpu7 = aiGpuReviewRule.evaluate(
  dates7.flatMap((d) => [
    computeRecord(d, 150, "BoxUsage:p4d.24xlarge", "Amazon EC2"),
    computeRecord(d, 150, "BoxUsage:p4d.24xlarge", "Amazon EC2"),
  ])
);
check("AI-GPU se emite con 7 días", gpu7.length, 1);
check("AI-GPU proyecta 9000/mes (30% = 2700)", gpu7[0].savingsRange.optimistic, 2700);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
