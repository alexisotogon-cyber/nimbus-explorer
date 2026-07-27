/* eslint-disable */
/**
 * Tarea 4: coherencia de cifras sobre los informes ya guardados en out/.
 *   node test-data/e2e/check-numbers.js
 */
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "out");
const r2 = (n) => Math.round(n * 100) / 100;

function checkReport(label, file) {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, file), "utf-8"));
  const rep = j.report;
  console.log(`\n### ${label}`);
  console.log(`periodo ${rep.periodStart} → ${rep.periodEnd} | días=${new Set().size || "-"} | totalCostUSD(proyección mensual)=${rep.totalCostUSD}`);
  console.log(`rango total: cons=${rep.totalSavingsRange.conservative} mod=${rep.totalSavingsRange.moderate} opt=${rep.totalSavingsRange.optimistic} | reviewPendingOpt=${rep.reviewPendingOptimisticUSD} | totalEstimatedSavings=${rep.totalEstimatedSavingsUSD} | savingsPct=${rep.savingsPercentage}`);

  // 1. monotonía por hallazgo
  const bad = rep.findings.filter(
    (f) => !(f.savingsRange.conservative <= f.savingsRange.moderate && f.savingsRange.moderate <= f.savingsRange.optimistic)
  );
  console.log(`monotonía por hallazgo (cons<=mod<=opt): ${bad.length === 0 ? "OK" : "FALLA en " + bad.map((f) => f.id + " " + JSON.stringify(f.savingsRange)).join("; ")}`);

  // 1b. moderate del rango vs estimatedMonthlySavingsUSD
  const mism = rep.findings.filter((f) => r2(f.savingsRange.moderate) !== r2(f.estimatedMonthlySavingsUSD));
  console.log(`savingsRange.moderate == estimatedMonthlySavingsUSD: ${mism.length === 0 ? "OK" : "difieren en " + mism.map((f) => `${f.id}(${f.savingsRange.moderate} vs ${f.estimatedMonthlySavingsUSD})`).join("; ")}`);

  // 2. monotonía del total
  const t = rep.totalSavingsRange;
  console.log(`monotonía total: ${t.conservative <= t.moderate && t.moderate <= t.optimistic ? "OK" : "FALLA"}`);

  // 3. ahorro total <= coste total
  console.log(`ahorro moderado (${t.moderate}) <= coste (${rep.totalCostUSD}): ${t.moderate <= rep.totalCostUSD ? "OK" : "FALLA"}`);
  console.log(`ahorro optimista (${t.optimistic}) <= coste (${rep.totalCostUSD}): ${t.optimistic <= rep.totalCostUSD ? "OK" : "FALLA"}`);
  console.log(`ahorro optimista + reviewPending (${r2(t.optimistic + rep.reviewPendingOptimisticUSD)}) <= coste: ${t.optimistic + rep.reviewPendingOptimisticUSD <= rep.totalCostUSD ? "OK" : "FALLA"}`);

  // 4. suma de hallazgos vs total declarado
  const estimable = rep.findings.filter((f) => f.confidence !== "fuera-de-alcance-del-billing");
  const sums = {
    cons: r2(estimable.reduce((s, f) => s + f.savingsRange.conservative, 0)),
    mod: r2(estimable.reduce((s, f) => s + f.savingsRange.moderate, 0)),
    opt: r2(estimable.reduce((s, f) => s + f.savingsRange.optimistic, 0)),
  };
  const allMod = r2(rep.findings.reduce((s, f) => s + f.estimatedMonthlySavingsUSD, 0));
  console.log(`suma hallazgos estimables: cons=${sums.cons} mod=${sums.mod} opt=${sums.opt} → coincide con rango total: ${
    sums.cons === t.conservative && sums.mod === t.moderate && sums.opt === t.optimistic ? "OK" : "DIFIERE"}`);
  console.log(`suma de TODOS los estimatedMonthlySavingsUSD=${allMod} vs totalEstimatedSavingsUSD=${rep.totalEstimatedSavingsUSD}: ${
    allMod === r2(rep.totalEstimatedSavingsUSD) ? "OK" : "DIFIERE"}`);
  const pct = rep.totalCostUSD > 0 ? r2((rep.totalEstimatedSavingsUSD / rep.totalCostUSD) * 1000) / 10 : 0;
  console.log(`savingsPercentage declarado=${rep.savingsPercentage} recalculado=${Math.round(((rep.totalEstimatedSavingsUSD / rep.totalCostUSD) * 100) * 10) / 10}`);

  // 5. desglose por servicio: suma de costes del periodo
  const svcSum = r2(rep.summaryByService.reduce((s, x) => s + x.totalCostUSD, 0));
  console.log(`suma summaryByService.totalCostUSD (coste del PERIODO) = ${svcSum}`);
  return { rep, svcSum };
}

const Papa = require(path.join(__dirname, "../../node_modules/papaparse"));

function rows(csvFile) {
  const txt = fs.readFileSync(path.join(__dirname, csvFile), "utf-8");
  return Papa.parse(txt, { header: true, skipEmptyLines: true }).data;
}

function fileSum(csvFile, col, filter) {
  const data = rows(csvFile).filter(filter || (() => true));
  let s = 0;
  const days = new Set();
  for (const r of data) {
    s += Number(r[col] || 0);
    days.add(String(r.ChargePeriodStart || "").slice(0, 10));
  }
  return { sum: r2(s), days: days.size, n: data.length };
}

const cases = [
  ["FOCUS AWS only (carril aws)", "focus_aws_only_csv__aws.json", "focus-aws-only.csv"],
  ["FOCUS GCP only sin ServiceCategory (carril gcp)", "focus_gcp_only_csv__gcp.json", "focus-gcp-only.csv"],
  ["FOCUS multinube (carril focus)", "focus_multicloud_csv__focus.json", "focus-multicloud.csv"],
  ["FOCUS con compras de compromiso (carril focus)", "focus_con_compras_compromiso_csv__focus.json", "focus-con-compras-compromiso.csv"],
  ["Excel FOCUS AWS (carril focus)", "focus_aws_only_xlsx__focus.json", "focus-aws-only.csv"],
  ["AWS CUR nativo (carril aws)", "aws_cur_nativo_csv__aws.json", null],
  ["Azure nativo (carril azure)", "azure_cost_management_nativo_csv__azure.json", null],
];

for (const [label, jf, csvf] of cases) {
  const { rep, svcSum } = checkReport(label, jf);
  if (csvf) {
    const eff = fileSum(csvf, "EffectiveCost");
    const bil = fileSum(csvf, "BilledCost");
    const purch = fileSum(csvf, "BilledCost", (r) => (r.ChargeCategory || "").toLowerCase() === "purchase");
    const effNoPurch = fileSum(csvf, "EffectiveCost", (r) => (r.ChargeCategory || "").toLowerCase() !== "purchase");
    console.log(`archivo: filas=${eff.n} días=${eff.days} EffectiveCost=${eff.sum} BilledCost=${bil.sum}`);
    console.log(`  filas ChargeCategory=Purchase: n=${purch.n} BilledCost=${purch.sum}`);
    console.log(`  EffectiveCost excluyendo Purchase = ${effNoPurch.sum}`);
    console.log(`mi proyección mensual (EffectiveCost sin Purchase / ${eff.days} días × 30) = ${r2((effNoPurch.sum / eff.days) * 30)}  vs app=${rep.totalCostUSD}`);
    console.log(`si se sumaran las compras (BilledCost total) la proyección sería = ${r2((bil.sum / eff.days) * 30)}`);
    console.log(`coste periodo según app (suma servicios) = ${svcSum}  vs EffectiveCost sin Purchase = ${effNoPurch.sum}`);
  }
}

// diagnóstico de casos adversos
for (const [label, f] of [
  ["coste negativo", "adverso-negativo.json"],
  ["fechas desordenadas", "adverso-desorden.json"],
  ["un solo día", "adverso-un-dia.json"],
]) {
  if (!fs.existsSync(path.join(OUT, f))) continue;
  const j = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf-8"));
  console.log(`\n### diagnosis — ${label}`);
  console.log(JSON.stringify(j.diagnosis, null, 1));
  if (j.report) {
    console.log("periodo:", j.report.periodStart, "→", j.report.periodEnd,
      "| hallazgos:", j.report.findings.length,
      "| categorías:", j.report.summaryByCategory.map((c) => c.category).join(","));
    console.log("trendInsights:", JSON.stringify(j.report.trendInsights));
  }
}
