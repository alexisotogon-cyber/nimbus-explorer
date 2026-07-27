/**
 * AUDIT — Tarea 3: informe exportable (markdown de buildReport).
 * Run: npx tsx test-data/audit/audit-markdown.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "fixtures");
const MD = path.join(HERE, "markdown");
fs.mkdirSync(MD, { recursive: true });

const { parseCSVAutoDetect } = await import("../../src/engine/parsers/index.ts");
const { calculateSavings } = await import("../../src/engine/tools/calculate-savings.ts");
const { buildReport } = await import("../../src/engine/tools/build-report.ts");
const { formatUSD, CONFIDENCE_LABELS } = await import("../../src/engine/types.ts");

const out = [];
const log = (s = "") => { out.push(s); console.log(s); };
const defects = [];

const FILES = [
  "focus-ahorro-agresivo.csv",
  "aws-cur-14dias.csv",
  "azure-cm-14dias.csv",
  "gcp-billing-14dias.csv",
  "focus-commitment-purchase.csv",
];

log("=".repeat(100));
log("TAREA 3 — REVISIÓN DEL MARKDOWN EXPORTABLE");
log("=".repeat(100));

// Recolector de todas las cifras monetarias que existen en el objeto informe
function figuresInReport(rep) {
  const set = new Set();
  const add = (n) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return;
    set.add(formatUSD(n));
    set.add(formatUSD(Math.round(n * 100) / 100));
  };
  add(rep.totalCostUSD); add(rep.totalEstimatedSavingsUSD);
  add(rep.totalSavingsRange.conservative); add(rep.totalSavingsRange.moderate); add(rep.totalSavingsRange.optimistic);
  add(rep.reviewPendingOptimisticUSD);
  for (const c of rep.summaryByCategory) add(c.totalSavingsUSD);
  for (const s of rep.summaryByService) { add(s.totalCostUSD); add(s.potentialSavingsUSD); }
  for (const f of rep.findings) {
    add(f.savingsRange.conservative); add(f.savingsRange.moderate); add(f.savingsRange.optimistic);
    add(f.estimatedMonthlySavingsUSD);
    for (const r of f.topResources) add(r.monthlyCostUSD);
  }
  return set;
}

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2705}\u{26A0}\u{2139}]/gu;
const FLOAT_RE = /\d+\.\d{4,}/g;

for (const file of FILES) {
  const csv = fs.readFileSync(path.join(FIX, file), "utf8");
  const parsed = parseCSVAutoDetect(csv);
  const rep = calculateSavings(parsed.records, parsed.isFocus);
  const md = buildReport(rep);
  fs.writeFileSync(path.join(MD, file.replace(".csv", ".md")), md);

  log("");
  log("─".repeat(90));
  log(`ARCHIVO: ${file}  (${md.length} caracteres, ${md.split("\n").length} líneas, ${rep.findings.length} hallazgos)`);
  log("─".repeat(90));

  // 1. Trazabilidad de cifras
  const known = figuresInReport(rep);
  const inMd = [...new Set(md.match(/\$[\d,]+\.\d{2}/g) || [])];
  const untraceable = inMd.filter((s) => !known.has(s));
  // quitar las que provienen de tarifas citadas en texto y del umbral quick win
  const knownLiterals = new Set([formatUSD(50)]);
  const realUntraceable = untraceable.filter((s) => !knownLiterals.has(s));
  log(`  1. Trazabilidad: ${inMd.length} importes formateados distintos en el markdown; ${realUntraceable.length} no localizados en el objeto informe`);
  for (const u of realUntraceable.slice(0, 12)) {
    const i = md.indexOf(u);
    log(`       ✗ ${u} → «...${md.slice(Math.max(0, i - 70), i + 30).replace(/\n/g, " ")}...»`);
  }
  if (realUntraceable.length) defects.push(`[${file}] ${realUntraceable.length} importes del markdown no existen como campo del objeto informe (${realUntraceable.slice(0,5).join(", ")}).`);

  // cifras "calculadas aparte" en la plantilla: quick wins
  const qw = md.match(/Quick Wins.*?~(\$[\d,]+\.\d{2})\/mes/s);
  if (qw) {
    const val = qw[1];
    log(`     Suma de quick wins mostrada: ${val} — calculada dentro de la plantilla (build-report.ts reduce sobre findings), no es un campo del informe`);
    defects.push(`[${file}] La suma de quick wins (${val}) se calcula en la plantilla de markdown (build-report.ts) en lugar de venir del objeto informe.`);
  }

  // 2. Marcadores sin sustituir / secciones vacías / duplicados
  const placeholders = md.match(/\{\{[^}]*\}\}|\$\{[^}]*\}|undefined|NaN|\bnull\b|\[object Object\]/g) || [];
  log(`  2. Marcadores sin sustituir / valores basura: ${placeholders.length} ${placeholders.length ? "→ " + [...new Set(placeholders)].join(", ") : "(ninguno)"}`);
  if (placeholders.length) defects.push(`[${file}] Markdown contiene ${[...new Set(placeholders)].join(", ")}.`);

  const secciones = [...md.matchAll(/^(#{2,3}) (.+)$/gm)].map((m) => ({ lvl: m[1].length, t: m[2], i: m.index }));
  const vacias = [];
  for (let i = 0; i < secciones.length; i++) {
    const start = secciones[i].i + secciones[i].t.length;
    const end = i + 1 < secciones.length ? secciones[i + 1].i : md.length;
    const body = md.slice(start, end).replace(/^[^\n]*\n/, "").trim();
    if (body.length === 0) vacias.push(secciones[i].t);
  }
  log(`     Secciones vacías: ${vacias.length ? vacias.join(" | ") : "(ninguna)"}`);
  if (vacias.length) defects.push(`[${file}] Secciones vacías en el markdown: ${vacias.join(", ")}`);

  // duplicados: mismo párrafo repetido
  const paras = md.split("\n").map((l) => l.trim()).filter((l) => l.length > 60);
  const counts = {};
  for (const p of paras) counts[p] = (counts[p] || 0) + 1;
  const dups = Object.entries(counts).filter(([, c]) => c > 1);
  log(`     Líneas largas repetidas: ${dups.length}`);
  for (const [p, c] of dups.slice(0, 6)) log(`       ×${c} «${p.slice(0, 110)}...»`);
  if (dups.length) defects.push(`[${file}] ${dups.length} líneas largas duplicadas en el markdown (p.ej. el rango de ahorro aparece en cabecera, resumen ejecutivo, tabla y detalle).`);

  // 3. Nombres de servicio sin traducir
  const svcNames = [...new Set(rep.findings.map((f) => f.service))];
  const missing = svcNames.filter((s) => !md.includes(s));
  log(`  3. Nombres de servicio: ${svcNames.length} distintos; presentes literalmente en el markdown: ${svcNames.length - missing.length}`);
  log(`     servicios: ${svcNames.join(" | ")}`);
  if (missing.length) log(`     ✗ no aparecen: ${missing.join(", ")}`);
  const traducidos = ["Cómputo elástico", "Almacenamiento simple", "Servicio de base de datos relacional", "Motor de cómputo"];
  const halladosTrad = traducidos.filter((t) => md.includes(t));
  log(`     traducciones indebidas detectadas: ${halladosTrad.length ? halladosTrad.join(", ") : "(ninguna)"}`);

  // 4. Emojis
  const emojis = md.match(EMOJI_RE) || [];
  const uniq = [...new Set(emojis)];
  log(`  4. Emojis: ${emojis.length} ocurrencias, ${uniq.length} distintos → ${uniq.join(" ")}`);
  if (emojis.length) defects.push(`[${file}] El markdown contiene ${emojis.length} emojis (${uniq.join(" ")}) en cabeceras de sección, tabla de hallazgos y avisos.`);

  // 5. Advertencias de acciones irreversibles
  const irrevCmds = [];
  for (const f of rep.findings)
    for (const c of f.remediation.commands)
      if (c.isIrreversible) irrevCmds.push({ finding: f.id, label: c.label, snippet: c.snippet.split("\n")[0] });
  const warnCount = (md.match(/Acción irreversible/g) || []).length;
  log(`  5. Comandos irreversibles en el informe: ${irrevCmds.length}; avisos "Acción irreversible" en el markdown: ${warnCount}`);
  for (const c of irrevCmds) {
    const present = md.includes(c.snippet.slice(0, 40));
    log(`       ${present ? "en markdown" : "AUSENTE   "} | ${c.finding} | ${c.label}`);
  }
  if (irrevCmds.length !== warnCount) {
    defects.push(`[${file}] ${irrevCmds.length} comandos irreversibles pero ${warnCount} avisos de irreversibilidad en el markdown.`);
  }
  // Rollback antes de remediación
  const detalle = md.slice(md.indexOf("## 🔍 Detalle"));
  const bloques = detalle.split(/^### /m).slice(1);
  let ordenMal = 0;
  for (const b of bloques) {
    const iRb = b.indexOf("**Rollback:**");
    const iRem = b.indexOf("<details><summary>Remediación");
    if (iRb !== -1 && iRem !== -1 && iRb > iRem) ordenMal++;
  }
  log(`     Bloques donde el rollback aparece DESPUÉS de la remediación: ${ordenMal} (contrato P0-3: debe ir antes)`);
  if (ordenMal) defects.push(`[${file}] ${ordenMal} hallazgos muestran el rollback después de los comandos de remediación.`);

  // 6. Slugs de confianza sin traducir
  const slugs = Object.keys(CONFIDENCE_LABELS);
  const slugsEnMd = slugs.filter((s) => md.toLowerCase().includes(s.toLowerCase()));
  log(`  6. Slugs de confianza crudos visibles: ${slugsEnMd.length ? slugsEnMd.join(", ") : "(ninguno)"}`);
  log(`     etiquetas legibles presentes: ${slugs.filter((s) => md.includes(CONFIDENCE_LABELS[s])).map((s) => CONFIDENCE_LABELS[s]).join(" | ") || "(ninguna)"}`);
  if (slugsEnMd.includes("fuera-de-alcance-del-billing")) {
    const i = md.indexOf("uera-de-alcance-del-billing");
    log(`       ✗ contexto: «...${md.slice(Math.max(0, i - 90), i + 40).replace(/\n/g, " ")}...»`);
    defects.push(`[${file}] El markdown renderiza el slug crudo "Fuera-de-alcance-del-billing" en la tabla de hallazgos; types.ts declara explícitamente que ese slug NUNCA debe renderizarse y que debe usarse CONFIDENCE_LABELS.`);
  }

  // 7. Artefactos de coma flotante
  const floats = md.match(FLOAT_RE) || [];
  log(`  7. Artefactos de coma flotante (>=4 decimales): ${floats.length} ${floats.length ? "→ " + [...new Set(floats)].slice(0, 10).join(", ") : "(ninguno)"}`);
  if (floats.length) {
    for (const f of [...new Set(floats)].slice(0, 5)) {
      const i = md.indexOf(f);
      log(`       ✗ ${f} → «...${md.slice(Math.max(0, i - 70), i + 30).replace(/\n/g, " ")}...»`);
    }
    defects.push(`[${file}] ${floats.length} números con 4+ decimales en el markdown: ${[...new Set(floats)].slice(0,5).join(", ")}`);
  }

  // 8. Importes que NO pasan por formatUSD (patrón $NN sin separador/decimales)
  const rawAmounts = [...new Set(md.match(/\$\d+(?!\d*[.,]\d)/g) || [])];
  log(`  8. Importes sin formato formatUSD ($N sin decimales): ${rawAmounts.length} → ${rawAmounts.slice(0, 12).join(", ")}`);
  if (rawAmounts.length) {
    for (const a of rawAmounts.slice(0, 6)) {
      const i = md.indexOf(a);
      log(`       ✗ ${a} → «...${md.slice(Math.max(0, i - 80), i + 40).replace(/\n/g, " ")}...»`);
    }
    defects.push(`[${file}] ${rawAmounts.length} importes escritos sin pasar por formatUSD (${rawAmounts.slice(0,6).join(", ")}), sin decimales ni separador de miles.`);
  }
}

// ── Exportación a Excel / PDF ─────────────────────────────────────
log("");
log("=".repeat(100));
log("Utilidades de exportación (Excel / PDF)");
log("=".repeat(100));
{
  const pkg = JSON.parse(fs.readFileSync(path.join(HERE, "../../package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  log(`  Dependencias declaradas: ${Object.keys(deps).join(", ")}`);
  const excelLibs = Object.keys(deps).filter((d) => /xlsx|exceljs|sheetjs|csv-|pdf|jspdf|puppeteer/i.test(d));
  log(`  Librerías de Excel/PDF en package.json: ${excelLibs.length ? excelLibs.join(", ") : "(ninguna)"}`);
}

log("");
log("=".repeat(100));
log(`DEFECTOS DE MARKDOWN: ${defects.length}`);
[...new Set(defects.map(d => d.replace(/^\[[^\]]+\]\s*/, "")))].forEach((d, i) => log(`  ${i + 1}. ${d}`));

fs.writeFileSync(path.join(HERE, "out-markdown.txt"), out.join("\n"));
