/**
 * AUDIT — Tarea 2.5: coherencia del simulador de escenarios de la UI.
 * Reproduce exactamente la aritmética de WhatIfSimulator (src/components/finding-card.tsx)
 * y compara el coste base recuperado con el coste mensual que la propia regla declara
 * en calculationBreakdown.
 * Run: npx tsx test-data/audit/audit-simulator.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "fixtures");
const { parseCSVAutoDetect } = await import("../../src/engine/parsers/index.ts");
const { calculateSavings } = await import("../../src/engine/tools/calculate-savings.ts");

const out = [];
const log = (s = "") => { out.push(s); console.log(s); };
const r2 = (n) => Math.round(n * 100) / 100;

log("=".repeat(100));
log("TAREA 2.5 — SIMULADOR DE ESCENARIOS: inversión del coste base");
log("=".repeat(100));
log("");
log("| Archivo | Hallazgo | supuestos | Π valores | base recuperada | coste declarado en el breakdown | deriva | simulador visible |");
log("|---|---|---|---|---|---|---|---|");

const problemas = [];
for (const file of fs.readdirSync(FIX).filter((f) => f.endsWith(".csv"))) {
  const csv = fs.readFileSync(path.join(FIX, file), "utf8");
  const parsed = parseCSVAutoDetect(csv);
  const rep = calculateSavings(parsed.records, parsed.isFocus);
  for (const f of rep.findings) {
    const all = f.assumptions;
    const actionable = all.filter((a) => a.value > 0 && a.max > a.min);
    const prod = all.reduce((p, a) => p * a.value, 1);
    // Réplica exacta de las guardas del componente
    const visible = !(actionable.length === 0 || prod === 0 || f.estimatedMonthlySavingsUSD === 0);
    const base = prod === 0 ? Infinity : f.estimatedMonthlySavingsUSD / prod;
    // coste mensual declarado por la regla en su propio texto
    const m = f.calculationBreakdown.match(/\$([\d,]+(?:\.\d+)?)/);
    const declarado = m ? parseFloat(m[1].replace(/,/g, "")) : null;
    const deriva = declarado != null && Number.isFinite(base) ? r2(base - declarado) : null;
    const flag = deriva != null && Math.abs(deriva) > 0.5 ? " ←" : "";
    log(`| ${file} | ${f.id} | ${all.length} | ${r2(prod)} | ${Number.isFinite(base) ? "$" + r2(base) : "∞"} | ${declarado != null ? "$" + declarado : "n/d"} | ${deriva != null ? "$" + deriva : "n/d"}${flag} | ${visible ? "sí" : "NO"} |`);
    if (!Number.isFinite(base) || base < 0) problemas.push(`${file}/${f.id}: base = ${base}`);
    if (deriva != null && Math.abs(deriva) > 0.5) problemas.push(`${file}/${f.id}: deriva de $${deriva} entre la base invertida ($${r2(base)}) y el coste declarado ($${declarado})`);
    if (!visible && (f.savingsRange.moderate > 0)) problemas.push(`${file}/${f.id}: ahorro moderado $${f.savingsRange.moderate}/mes pero el simulador NO se muestra (sin supuestos ajustables)`);
  }
}

log("");
log(`Problemas: ${problemas.length}`);
[...new Set(problemas)].forEach((p, i) => log(`  ${i + 1}. ${p}`));

fs.writeFileSync(path.join(HERE, "out-simulator.txt"), out.join("\n"));
