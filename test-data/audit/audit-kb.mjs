/**
 * AUDIT — Tarea 4: base de conocimiento (integridad + accesibilidad de TODAS las URLs).
 * Comprueba también las URLs citadas en las reglas (pillar.url).
 * Run: npx tsx test-data/audit/audit-kb.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { KNOWLEDGE_BASE } = await import("../../src/engine/knowledge/knowledge-base.ts");
const { allRules } = await import("../../src/engine/rules/index.ts");

const out = [];
const log = (s = "") => { out.push(s); console.log(s); };

log("=".repeat(100));
log("TAREA 4 — BASE DE CONOCIMIENTO");
log("=".repeat(100));

// ── Integridad ──
const total = KNOWLEDGE_BASE.length;
const conUrl = KNOWLEDGE_BASE.filter((e) => e.sourceUrl);
const sinUrl = KNOWLEDGE_BASE.filter((e) => !e.sourceUrl);
log("");
log(`Entradas totales: ${total}`);
log(`Con sourceUrl real: ${conUrl.length} (${Math.round(conUrl.length / total * 100)}%)`);
log(`Con sourceUrl null: ${sinUrl.length} (${Math.round(sinUrl.length / total * 100)}%)`);
log(`  ids con null: ${sinUrl.map((e) => e.id).join(", ")}`);

// ids duplicados
const ids = KNOWLEDGE_BASE.map((e) => e.id);
const dupIds = ids.filter((v, i) => ids.indexOf(v) !== i);
log("");
log(`ids duplicados: ${dupIds.length ? [...new Set(dupIds)].join(", ") : "(ninguno)"}`);

// campos vacíos
const camposObligatorios = ["id", "topic", "summary", "detail", "sourceLabel"];
const vacios = [];
for (const e of KNOWLEDGE_BASE) {
  for (const c of camposObligatorios)
    if (!e[c] || String(e[c]).trim().length === 0) vacios.push(`${e.id}.${c}`);
  if (!Array.isArray(e.keywords) || e.keywords.length === 0) vacios.push(`${e.id}.keywords`);
  else {
    const kwVacias = e.keywords.filter((k) => !k || !k.trim());
    if (kwVacias.length) vacios.push(`${e.id}.keywords (${kwVacias.length} vacías)`);
    const kwDup = e.keywords.filter((v, i) => e.keywords.indexOf(v) !== i);
    if (kwDup.length) vacios.push(`${e.id}.keywords duplicadas: ${[...new Set(kwDup)].join("/")}`);
  }
}
log(`campos vacíos o inválidos: ${vacios.length ? vacios.join(" | ") : "(ninguno)"}`);

// palabras clave compartidas entre entradas (colisiones de retrieval)
const kwOwners = {};
for (const e of KNOWLEDGE_BASE) for (const k of e.keywords) (kwOwners[k] = kwOwners[k] || []).push(e.id);
const colisiones = Object.entries(kwOwners).filter(([, v]) => v.length > 2);
log("");
log(`Palabras clave presentes en 3+ entradas (riesgo de retrieval impreciso): ${colisiones.length}`);
for (const [k, v] of colisiones.slice(0, 12)) log(`   "${k}" → ${v.join(", ")}`);

// ── URLs a comprobar ──
const urlsKB = KNOWLEDGE_BASE.filter((e) => e.sourceUrl).map((e) => ({ src: `KB:${e.id}`, url: e.sourceUrl }));
// URLs de las reglas (pillar + reference)
const urlsReglas = [];
for (const r of allRules) {
  const found = r.evaluate([]);
  for (const m of (r.reference || "").matchAll(/https?:\/\/[^\s,)"']+/g))
    urlsReglas.push({ src: `RULE:${r.id}`, url: m[0].replace(/[.,;]$/, "") });
}
// pillar urls por proveedor: extraer del código fuente de las reglas
const ruleFiles = ["idle-resources.ts", "oversized-instances.ts", "storage-waste.ts", "ai-spend.ts"];
for (const f of ruleFiles) {
  const src = fs.readFileSync(path.join(HERE, "../../src/engine/rules", f), "utf8");
  for (const m of src.matchAll(/url:\s*\n?\s*"(https?:\/\/[^"]+)"/g))
    urlsReglas.push({ src: `PILLAR:${f}`, url: m[1] });
}

const byUrl = new Map();
for (const { src, url } of [...urlsKB, ...urlsReglas]) {
  if (!byUrl.has(url)) byUrl.set(url, new Set());
  byUrl.get(url).add(src);
}
const lista = [...byUrl.entries()].map(([url, srcs]) => ({ url, srcs: [...srcs] }));

log("");
log("=".repeat(100));
log(`COMPROBACIÓN DE ACCESIBILIDAD — ${lista.length} URLs únicas (${urlsKB.length} de la KB + ${urlsReglas.length} de reglas/pilares)`);
log("=".repeat(100));

async function check(url) {
  const attempt = async (method) => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(url, { method, redirect: "manual", signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36" } });
      return res;
    } finally { clearTimeout(to); }
  };
  try {
    let res = await attempt("GET");
    const chain = [];
    let cur = url, hops = 0;
    while ([301, 302, 303, 307, 308].includes(res.status) && hops < 6) {
      const loc = res.headers.get("location");
      if (!loc) break;
      const next = new URL(loc, cur).toString();
      chain.push({ from: cur, status: res.status, to: next });
      cur = next; hops++;
      res = await attempt("GET").catch(() => null) ;
      // refetch on new URL
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 25000);
      try {
        res = await fetch(cur, { method: "GET", redirect: "manual", signal: ctrl.signal,
          headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36" } });
      } finally { clearTimeout(to); }
    }
    return { status: res.status, finalUrl: cur, chain };
  } catch (e) {
    return { status: null, error: e.name === "AbortError" ? "timeout" : e.message };
  }
}

/** ¿El redirect va a una página distinta (no sólo canonicalización)? */
function redirectEsRelevante(orig, final) {
  const norm = (u) => {
    try {
      const x = new URL(u);
      return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "")).toLowerCase();
    } catch { return u; }
  };
  const a = norm(orig), b = norm(final);
  if (a === b) return false;
  // /es-es/ o /en-us/ insertado, o sufijo .html preservado
  const stripLocale = (s) => s.replace(/\/(es-es|en-us|es|en|fr-fr|de-de)\//, "/");
  return stripLocale(a) !== stripLocale(b);
}

const problemas = [];
const results = [];
const CONC = 6;
for (let i = 0; i < lista.length; i += CONC) {
  const batch = lista.slice(i, i + CONC);
  const res = await Promise.all(batch.map(async (item) => ({ ...item, ...(await check(item.url)) })));
  for (const r of res) {
    results.push(r);
    let estado;
    if (r.status === null) estado = `ERROR (${r.error})`;
    else if (r.status === 404) estado = "404";
    else if (r.status >= 400) estado = String(r.status);
    else if (r.chain?.length && redirectEsRelevante(r.url, r.finalUrl)) estado = `${r.chain[0].status} → PÁGINA DISTINTA`;
    else if (r.chain?.length) estado = `${r.chain[0].status} (canonicalización)`;
    else estado = "200";
    const bad = estado === "404" || estado.startsWith("ERROR") || estado.includes("PÁGINA DISTINTA") || (r.status >= 400);
    log(`  ${bad ? "✗" : "·"} [${estado}] ${r.url}`);
    if (r.chain?.length) for (const h of r.chain) log(`        ${h.status} → ${h.to}`);
    log(`        citada en: ${r.srcs.join(", ")}`);
    if (bad) problemas.push({ url: r.url, estado, finalUrl: r.finalUrl, srcs: r.srcs });
  }
}

log("");
log("=".repeat(100));
log(`URLS CON PROBLEMAS: ${problemas.length} de ${lista.length}`);
log("=".repeat(100));
for (const p of problemas) {
  log(`  ✗ ${p.estado}  ${p.url}`);
  if (p.finalUrl && p.finalUrl !== p.url) log(`      acaba en: ${p.finalUrl}`);
  log(`      citada en: ${p.srcs.join(", ")}`);
}

fs.writeFileSync(path.join(HERE, "out-kb.txt"), out.join("\n"));
fs.writeFileSync(path.join(HERE, "out-kb-urls.json"), JSON.stringify(results.map(({ url, srcs, status, finalUrl, error, chain }) => ({ url, srcs, status, finalUrl, error, chain })), null, 2));
