/**
 * AUDIT — Tarea 1 (verdad de referencia vs motor) + Tarea 2 (comprobaciones numéricas).
 * Run: npx tsx test-data/audit/audit-figures.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "fixtures");

const { parseCSVAutoDetect, detectFormat, readHeaders } = await import("../../src/engine/parsers/index.ts");
const { calculateSavings } = await import("../../src/engine/tools/calculate-savings.ts");
const { deriveSavingsRange, formatUSD } = await import("../../src/engine/types.ts");
const { analyzeTrends } = await import("../../src/engine/trends.ts");

const truth = JSON.parse(fs.readFileSync(path.join(HERE, "ground-truth.json"), "utf8"));
const r2 = (n) => Math.round(n * 100) / 100;
const defects = [];
const out = [];
const log = (s = "") => { out.push(s); console.log(s); };

// ───────────────────── Tarea 1: verdad vs motor ─────────────────────
log("=".repeat(100));
log("TAREA 1 — VERDAD DE REFERENCIA vs MOTOR");
log("=".repeat(100));

const reports = {};
const rows = [];

for (const [file, t] of Object.entries(truth)) {
  const csv = fs.readFileSync(path.join(FIX, file), "utf8");
  let parsed, report, err = null;
  try {
    parsed = parseCSVAutoDetect(csv);
    report = calculateSavings(parsed.records, parsed.isFocus);
    reports[file] = { parsed, report, truth: t };
  } catch (e) {
    err = e.message;
  }
  const det = detectFormat(readHeaders(csv));
  const sumCost = parsed ? r2(parsed.records.reduce((s, r) => s + r.cost, 0)) : null;
  const distinct = parsed ? new Set(parsed.records.map((r) => r.date)).size : 0;
  rows.push({
    file, err,
    fmtEsperado: t.format, fmtDetectado: det.format ?? (det.ambiguous ? "AMBIGUO" : "null"),
    diasEsp: t.distinctDays, diasMotor: distinct,
    totalEsp: t.totalEffectiveCost ?? t.totalEffectiveCostUsageOnly,
    totalMotor: sumCost,
    mensualEsp: t.projectedMonthly, mensualMotor: report?.totalCostUSD ?? null,
    hallazgos: report?.findings.length ?? 0,
    tendencias: report?.trendInsights.length ?? 0,
  });
}

log("");
log("| Archivo | Fmt esp/det | Días esp/motor | Coste periodo esp/motor | Mensual esp/motor | Hallazgos | Tendencias |");
log("|---|---|---|---|---|---|---|");
for (const r of rows) {
  if (r.err) { log(`| ${r.file} | ${r.fmtEsperado}/ERROR | - | - | - | - | ${r.err} |`); continue; }
  const okT = r.totalEsp === r.totalMotor ? "OK" : "DIF";
  const okM = Math.abs(r.mensualEsp - r.mensualMotor) < 0.02 ? "OK" : "DIF";
  log(`| ${r.file} | ${r.fmtEsperado}/${r.fmtDetectado} | ${r.diasEsp}/${r.diasMotor} | $${r.totalEsp}/$${r.totalMotor} ${okT} | $${r.mensualEsp}/$${r.mensualMotor} ${okM} | ${r.hallazgos} | ${r.tendencias} |`);
  if (okT === "DIF") defects.push(`[${r.file}] coste del periodo: esperado $${r.totalEsp}, motor $${r.totalMotor}`);
  if (okM === "DIF") defects.push(`[${r.file}] coste mensual proyectado: esperado $${r.mensualEsp}, motor $${r.mensualMotor}`);
  if (r.diasEsp !== r.diasMotor) defects.push(`[${r.file}] días distintos: esperado ${r.diasEsp}, motor ${r.diasMotor}`);
}

// ── Umbral 7 días ──
log("");
log("── Umbral de 7 días (hallazgos agregados) ──");
for (const f of ["focus-6dias.csv", "focus-7dias.csv"]) {
  const { report, parsed } = reports[f];
  const cats = {};
  for (const fi of report.findings) cats[fi.category] = (cats[fi.category] || 0) + 1;
  log(`  ${f}: ${report.findings.length} hallazgos → ${JSON.stringify(cats)}`);
  log(`     días distintos=${new Set(parsed.records.map(r=>r.date)).size}, registros=${parsed.records.length}`);
}
{
  const a = reports["focus-6dias.csv"].report.findings.map(f=>f.category);
  const b = reports["focus-7dias.csv"].report.findings.map(f=>f.category);
  const soloEn7 = b.filter(c => !a.includes(c));
  log(`  Categorías que SOLO aparecen con 7 días: ${soloEn7.length ? soloEn7.join(", ") : "(ninguna)"}`);
  if (a.length > 0) {
    log(`  >> Con 6 días YA se emiten ${a.length} hallazgos agregados: ${[...new Set(a)].join(", ")}`);
    defects.push(`Umbral de 7 días NO se aplica a la mayoría de reglas agregadas: con 6 días distintos el motor ya emite ${a.length} hallazgos (${[...new Set(a)].join(", ")}). El panel file-check declara "aggregate-findings: >=7 días".`);
  }
}
// utilizationReview usa recs.length, no días distintos
log("");
log("── ¿El umbral de 7 se cuenta en días o en registros? (UTIL-REVIEW / AI-GPU) ──");
{
  // 4 días con 2 filas/día = 8 registros del mismo usageType
  const cols = "BillingAccountId,BillingCurrency,BilledCost,EffectiveCost,ChargePeriodStart,ChargeCategory,ChargeDescription,ProviderName,ServiceName,ServiceCategory,SkuId,RegionId";
  const rs = [];
  for (const d of ["2026-06-01","2026-06-02","2026-06-03","2026-06-04"]) {
    for (const half of ["00","12"]) {
      rs.push(`111122223333,USD,150,150,${d}T${half}:00:00Z,Usage,USE1-BoxUsage:m6i.4xlarge,AWS,Amazon Elastic Compute Cloud,Compute,BoxUsage:m6i.4xlarge,us-east-1`);
    }
  }
  const csv = [cols, ...rs].join("\n");
  const p = parseCSVAutoDetect(csv);
  const rep = calculateSavings(p.records, true);
  const util = rep.findings.filter(f => f.category === "utilization-review");
  const dias = new Set(p.records.map(r=>r.date)).size;
  log(`  4 días × 2 filas = ${p.records.length} registros, días distintos = ${dias}`);
  log(`  Hallazgos utilization-review emitidos: ${util.length}`);
  if (util.length > 0) {
    const f = util[0];
    log(`     breakdown: ${f.calculationBreakdown}`);
    const costeReal = p.records.reduce((s,r)=>s+r.cost,0);
    log(`     coste real periodo = $${costeReal}; coste/día real = $${costeReal/dias}; mensual correcto = $${r2(costeReal/dias*30)}`);
    defects.push(`UTIL-REVIEW-001 (y AI-GPU-001) usan recs.length>=7 en lugar de días distintos>=7: con 4 días y 8 registros el hallazgo se emite, y avgDailyCost = total/nº registros en vez de total/días, lo que SUBESTIMA el mensual (motor $${r2(costeReal/8*30)} vs correcto $${r2(costeReal/dias*30)}).`);
  }
}

// ── Umbral 14 días (tendencias) ──
log("");
log("── Umbral de 14 días (tendencias) ──");
for (const f of ["focus-13dias.csv", "focus-14dias.csv"]) {
  const { report } = reports[f];
  log(`  ${f}: trendInsights=${report.trendInsights.length} → ${report.trendInsights.map(t=>t.type).join(", ") || "(vacío)"}`);
}
if (reports["focus-13dias.csv"].report.trendInsights.length !== 0)
  defects.push("Tendencias emitidas con 13 días (<14).");
if (reports["focus-14dias.csv"].report.trendInsights.length === 0)
  log("  >> AVISO: con 14 días exactos tampoco se emitió ninguna tendencia (datos planos: ni picos ni crecimiento ni desviación >=5%). Umbral verificado por separado.");

// ── EffectiveCost vs BilledCost ──
log("");
log("── EffectiveCost vs BilledCost ──");
{
  const { parsed, report, truth: t } = reports["focus-effective-vs-billed.csv"];
  const sumEff = r2(parsed.records.reduce((s,r)=>s+(r.effectiveCost??0),0));
  const sumBil = r2(parsed.records.reduce((s,r)=>s+(r.billedCost??0),0));
  const sumCost = r2(parsed.records.reduce((s,r)=>s+r.cost,0));
  log(`  Σ EffectiveCost = $${sumEff}   Σ BilledCost = $${sumBil}   Σ record.cost (lo que analizan las reglas) = $${sumCost}`);
  log(`  totalCostUSD del informe = $${report.totalCostUSD} ; esperado usando EffectiveCost = $${t.expect.totalCostUSD}`);
  const usaEff = sumCost === sumEff;
  log(`  VEREDICTO: el motor usa ${usaEff ? "EffectiveCost (correcto)" : "BilledCost (INCORRECTO)"}`);
  if (!usaEff) defects.push("El motor no usa EffectiveCost como base de análisis.");
}

// ── Purchase / doble conteo ──
log("");
log("── Compras de compromiso (ChargeCategory=Purchase) ──");
{
  const { parsed, report, truth: t } = reports["focus-commitment-purchase.csv"];
  const purch = parsed.records.filter(r => (r.chargeType||"").toLowerCase() === "purchase");
  const sumCost = r2(parsed.records.reduce((s,r)=>s+r.cost,0));
  log(`  Filas Purchase que sobrevivieron al parser: ${purch.length} (esperado 0)`);
  log(`  Σ cost = $${sumCost} ; esperado sin la compra = $${t.totalEffectiveCost} ; con doble conteo sería $${r2(t.totalEffectiveCost + 5000)}`);
  log(`  totalCostUSD = $${report.totalCostUSD} ; esperado $${t.expect.totalCostUSD}`);
  if (purch.length > 0 || sumCost !== t.totalEffectiveCost) defects.push("Doble conteo de compras de compromiso.");
  else log("  VEREDICTO: sin doble conteo (correcto).");
  const commit = report.findings.filter(f=>f.category==="missing-commitment");
  log(`  Hallazgos missing-commitment: ${commit.length} (esperado 0 — hay CommitmentDiscountId en los datos)`);
  if (commit.length > 0) defects.push("missing-commitment emitido pese a existir CommitmentDiscountId.");
}

// ── Tax y créditos ──
log("");
log("── Impuestos y créditos (importes negativos) ──");
{
  const { parsed, report, truth: t } = reports["focus-tax-credits.csv"];
  const tax = parsed.records.filter(r=>(r.chargeType||"").toLowerCase()==="tax");
  const neg = parsed.records.filter(r=>r.cost<0);
  const credit = parsed.records.filter(r=>(r.chargeType||"").toLowerCase()==="credit");
  const sumCost = r2(parsed.records.reduce((s,r)=>s+r.cost,0));
  log(`  Filas Tax en records: ${tax.length} (generadas 14) → excluidas: ${14-tax.length}`);
  log(`  Filas Credit en records: ${credit.length} (generadas 14) → excluidas: ${14-credit.length}`);
  log(`  Filas con cost<0: ${neg.length}`);
  log(`  Σ cost = $${sumCost} ; sólo uso = $${t.totalEffectiveCostUsageOnly} ; neto real de factura (uso+tax+créditos) = $${t.totalEffectiveCostAllRows}`);
  log(`  totalCostUSD informe = $${report.totalCostUSD} ; neto real mensual = $${r2(t.expect.netCashPerDay*30)}`);
  log(`  >> Los créditos (-$30/día = -$900/mes) se descartan silenciosamente: el motor sobreestima el gasto neto en ese importe.`);
  defects.push(`Los créditos (ChargeCategory=Credit, importe negativo) se descartan por el filtro cost<=0 sin registrarlo en ningún sitio del informe. Con -$30/día el informe declara $${report.totalCostUSD}/mes cuando el neto facturado es $${r2(t.expect.netCashPerDay*30)}/mes (sobreestimación de $${r2(report.totalCostUSD - t.expect.netCashPerDay*30)}).`);
}

// ── ServiceSubcategory presente vs ausente ──
log("");
log("── ServiceSubcategory presente vs ausente ──");
{
  const a = reports["focus-con-subcategory.csv"].parsed.records;
  const b = reports["focus-sin-subcategory.csv"].parsed.records;
  log(`  registros: con=${a.length} sin=${b.length}`);
  const key = (r)=>`${r.nativeService}|${r.nativeUsageType}`;
  const mapA = new Map(a.map(r=>[key(r), r.category]));
  const mapB = new Map(b.map(r=>[key(r), r.category]));
  let mismatches = [];
  for (const [k, cat] of mapA) if (mapB.get(k) !== cat) mismatches.push(`${k}: con="${cat}" sin="${mapB.get(k)}"`);
  log(`  Discrepancias de clasificación: ${mismatches.length}`);
  for (const m of mismatches) log(`    - ${m}`);
  if (mismatches.length) defects.push(`Clasificación distinta con y sin ServiceSubcategory en ${mismatches.length} combinaciones: ${mismatches.join(" ; ")}`);
  const rA = reports["focus-con-subcategory.csv"].report;
  const rB = reports["focus-sin-subcategory.csv"].report;
  log(`  hallazgos: con=${rA.findings.length} ($${rA.totalEstimatedSavingsUSD}) sin=${rB.findings.length} ($${rB.totalEstimatedSavingsUSD})`);
  if (rA.findings.length !== rB.findings.length || rA.totalEstimatedSavingsUSD !== rB.totalEstimatedSavingsUSD)
    defects.push(`El mismo gasto produce informes distintos según venga o no ServiceSubcategory: ${rA.findings.length} hallazgos/$${rA.totalEstimatedSavingsUSD} vs ${rB.findings.length}/$${rB.totalEstimatedSavingsUSD}.`);
}

// ── Categorías: verdad vs motor ──
log("");
log("── Coste por categoría: verdad vs motor ──");
for (const [file, { parsed, truth: t }] of Object.entries(reports)) {
  if (!t.byCategory) continue;
  const motor = {};
  for (const r of parsed.records) motor[r.category] = r2((motor[r.category]||0) + r.cost);
  const keys = new Set([...Object.keys(t.byCategory), ...Object.keys(motor)]);
  const diffs = [];
  for (const k of keys) if ((t.byCategory[k]??0) !== (motor[k]??0)) diffs.push(`${k}: esp $${t.byCategory[k]??0} vs motor $${motor[k]??0}`);
  log(`  ${file.padEnd(34)} ${diffs.length ? "DIF → " + diffs.join(" | ") : "OK (todas las categorías coinciden)"}`);
  if (diffs.length) defects.push(`[${file}] clasificación por categoría distinta de la verdad: ${diffs.join(" | ")}`);
}

// ───────────────────── Tarea 2 ─────────────────────
log("");
log("=".repeat(100));
log("TAREA 2 — AUDITORÍA DE LAS CIFRAS");
log("=".repeat(100));

let n1 = 0, v1 = [];
let n2 = 0, v2 = [];
let n3 = 0, v3 = [];
let n5 = 0, v5 = [];
let n6 = 0, v6 = [];
const FLOAT_RE = /\d+\.\d{4,}/;

for (const [file, { report }] of Object.entries(reports)) {
  // 3. ahorro total <= coste proyectado
  n3++;
  const tot = report.totalEstimatedSavingsUSD, cost = report.totalCostUSD;
  const line = `  ${file.padEnd(34)} ahorro moderado $${tot} / coste proyectado $${cost} = ${cost>0?r2(tot/cost*100):"n/a"}% ; rango opt $${report.totalSavingsRange.optimistic}`;
  if (tot > cost) { v3.push(`${file}: ahorro $${tot} > coste $${cost}`); log(line + "  <<< VIOLACIÓN"); }
  else if (report.totalSavingsRange.optimistic > cost) { v3.push(`${file}: optimista $${report.totalSavingsRange.optimistic} > coste $${cost}`); log(line + "  <<< VIOLACIÓN (optimista)"); }
  else log(line);

  for (const f of report.findings) {
    // 1. ordenación del rango
    n1++;
    const sr = f.savingsRange;
    if (!(sr.conservative <= sr.moderate && sr.moderate <= sr.optimistic))
      v1.push(`${file} / ${f.id}: ${sr.conservative} / ${sr.moderate} / ${sr.optimistic}`);
    // 2. estimatedMonthlySavingsUSD === moderate
    n2++;
    if (f.estimatedMonthlySavingsUSD !== sr.moderate)
      v2.push(`${file} / ${f.id}: estimated=${f.estimatedMonthlySavingsUSD} moderate=${sr.moderate}`);
    // 5. inversión del simulador
    n5++;
    const prod = f.assumptions.reduce((a, x) => a * x.value, 1);
    const base = f.assumptions.length === 0 ? null : f.estimatedMonthlySavingsUSD / prod;
    if (base !== null && (!Number.isFinite(base) || base < 0))
      v5.push(`${file} / ${f.id}: base recuperada = ${base} (prod supuestos=${prod})`);
    if (f.assumptions.length === 0 && f.estimatedMonthlySavingsUSD !== 0)
      v5.push(`${file} / ${f.id}: sin supuestos pero ahorro=${f.estimatedMonthlySavingsUSD} → el simulador no puede invertir el coste base`);
    // 6. artefactos de coma flotante en textos
    n6++;
    const texts = [f.title, f.description, f.calculationBreakdown, ...f.affectedResources, f.remediation.description, f.remediation.rollbackPlan];
    for (const t of texts) {
      const m = String(t).match(FLOAT_RE);
      if (m) v6.push(`${file} / ${f.id}: "${m[0]}" en «${String(t).slice(Math.max(0,String(t).indexOf(m[0])-45), String(t).indexOf(m[0])+25)}»`);
    }
  }
  for (const t of report.trendInsights) {
    n6++;
    for (const s of [t.title, t.detail, t.evidence]) {
      const m = String(s).match(FLOAT_RE);
      if (m) v6.push(`${file} / trend ${t.id}: "${m[0]}"`);
    }
  }
}

const rep = (num, titulo, total, viols) => {
  log("");
  log(`── ${num}. ${titulo} — ${total} comprobaciones, ${viols.length} violaciones`);
  for (const v of viols.slice(0, 25)) log(`     ✗ ${v}`);
  if (viols.length > 25) log(`     ... y ${viols.length - 25} más`);
  if (!viols.length) log("     OK");
};
rep(1, "conservador <= moderado <= optimista", n1, v1);
rep(2, "estimatedMonthlySavingsUSD == savingsRange.moderate", n2, v2);
rep(3, "ahorro total <= coste proyectado", n3, v3);
rep(5, "inversión del simulador (base = ahorro / Π valores)", n5, v5);
rep(6, "artefactos de coma flotante en textos de hallazgos/tendencias", n6, v6);
if (v1.length) defects.push(`Rangos de ahorro desordenados en ${v1.length} hallazgos.`);
if (v2.length) defects.push(`estimatedMonthlySavingsUSD != moderate en ${v2.length} hallazgos.`);
if (v3.length) defects.push(`Ahorro prometido > coste proyectado: ${v3.join(" ; ")}`);
if (v6.length) defects.push(`Artefactos de coma flotante en ${v6.length} textos.`);

// ── 4. contrato de deriveSavingsRange ──
log("");
log("── 4. Contrato de deriveSavingsRange ──");
{
  const cases = [
    { c: 100, a: [{min:.2,value:.5,max:.8}, {min:.25,value:.4,max:.68}], nombre: "ejemplo del docblock" },
    { c: 1234.567, a: [{min:.05,value:.2,max:.4}], nombre: "un supuesto" },
    { c: 900, a: [{min:.5,value:.5,max:.5}], nombre: "supuesto fijo (min=value=max)" },
    { c: 900, a: [{min:.1,value:.3,max:.6},{min:.5,value:.5,max:.5}], nombre: "mixto: variable × fijo (caso batch)" },
    { c: 0, a: [{min:.1,value:.3,max:.6}], nombre: "coste base 0" },
    { c: 500, a: [], nombre: "sin supuestos" },
    { c: -100, a: [{min:.1,value:.3,max:.6}], nombre: "coste base negativo" },
  ];
  let bad = 0;
  for (const { c, a, nombre } of cases) {
    const got = deriveSavingsRange(c, a);
    const exp = {
      conservative: r2(c * a.reduce((s,x)=>s*x.min,1)),
      moderate: r2(c * a.reduce((s,x)=>s*x.value,1)),
      optimistic: r2(c * a.reduce((s,x)=>s*x.max,1)),
    };
    const ok = got.conservative===exp.conservative && got.moderate===exp.moderate && got.optimistic===exp.optimistic;
    log(`  ${ok?"OK ":"FAIL"} ${nombre.padEnd(34)} base=${c} → ${JSON.stringify(got)} (esperado ${JSON.stringify(exp)})`);
    if (!ok) bad++;
  }
  // Validación cruzada contra los hallazgos reales del motor
  let mismatchReal = [];
  for (const [file, { report }] of Object.entries(reports)) {
    for (const f of report.findings) {
      if (f.assumptions.length === 0) continue;
      const prodV = f.assumptions.reduce((s,x)=>s*x.value,1);
      const prodMin = f.assumptions.reduce((s,x)=>s*x.min,1);
      const prodMax = f.assumptions.reduce((s,x)=>s*x.max,1);
      const base = f.savingsRange.moderate / prodV;
      const recomputed = deriveSavingsRange(base, f.assumptions);
      const tol = 0.02;
      if (Math.abs(recomputed.conservative - f.savingsRange.conservative) > tol ||
          Math.abs(recomputed.optimistic - f.savingsRange.optimistic) > tol)
        mismatchReal.push(`${file}/${f.id}: rango ${JSON.stringify(f.savingsRange)} no reproducible desde base=$${r2(base)} (Πmin=${r2(prodMin)} Πmax=${r2(prodMax)}) → ${JSON.stringify(recomputed)}`);
    }
  }
  log(`  Reproducibilidad del rango en hallazgos reales con supuestos: ${mismatchReal.length} discrepancias`);
  for (const m of mismatchReal.slice(0,10)) log(`     ✗ ${m}`);
  if (bad) defects.push(`deriveSavingsRange incumple su contrato en ${bad} casos.`);
  if (mismatchReal.length) defects.push(`Rangos no reproducibles desde los supuestos publicados en ${mismatchReal.length} hallazgos.`);
}

// ── 5b: hallazgos sin supuestos pero con rango != 0 (simulador roto) ──
log("");
log("── 5b. Hallazgos con rango de ahorro pero SIN supuestos (los 3 presets del simulador leerían savingsRange sin sliders) ──");
{
  const seen = new Set();
  for (const [file, { report }] of Object.entries(reports)) {
    for (const f of report.findings) {
      const anyRange = f.savingsRange.conservative || f.savingsRange.moderate || f.savingsRange.optimistic;
      if (f.assumptions.length === 0 && anyRange) {
        const k = f.id;
        if (seen.has(k)) continue; seen.add(k);
        log(`  ${f.id.padEnd(30)} rango=${JSON.stringify(f.savingsRange)} supuestos=0  (${file})`);
      }
    }
  }
  if (seen.size) defects.push(`${seen.size} hallazgos distintos publican savingsRange sin ningún supuesto (${[...seen].join(", ")}): el simulador no tiene sliders con los que reproducir ni invertir esas cifras, y la inversión ahorro/Π(supuestos) es indefinida.`);
}

// ── savingsPercentage coherente ──
log("");
log("── Extra: savingsPercentage vs rango total ──");
for (const [file, { report }] of Object.entries(reports)) {
  const esperado = report.totalCostUSD > 0 ? r2(report.totalEstimatedSavingsUSD / report.totalCostUSD * 100) : 0;
  const flag = Math.abs(esperado - report.savingsPercentage) > 0.15 ? "  <<< DIF" : "";
  log(`  ${file.padEnd(34)} savingsPercentage=${report.savingsPercentage}% recalculado=${esperado}%${flag}`);
  // totalEstimatedSavings incluye TODOS los hallazgos, totalSavingsRange.moderate sólo los estimables
  if (report.totalEstimatedSavingsUSD !== report.totalSavingsRange.moderate)
    log(`     nota: totalEstimatedSavingsUSD ($${report.totalEstimatedSavingsUSD}) != totalSavingsRange.moderate ($${report.totalSavingsRange.moderate})`);
}

log("");
log("=".repeat(100));
log(`DEFECTOS ACUMULADOS EN ESTE SCRIPT: ${defects.length}`);
defects.forEach((d, i) => log(`  ${i+1}. ${d}`));

fs.writeFileSync(path.join(HERE, "out-figures.txt"), out.join("\n"));
fs.writeFileSync(path.join(HERE, "out-defects-figures.json"), JSON.stringify(defects, null, 2));
