/**
 * AUDIT — Tarea 4b: contradicciones internas en la base de conocimiento.
 * Extrae todas las afirmaciones con porcentaje o tarifa y las agrupa por tema
 * para poder compararlas entre sí.
 * Run: npx tsx test-data/audit/audit-kb-contradictions.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { KNOWLEDGE_BASE } = await import("../../src/engine/knowledge/knowledge-base.ts");

const out = [];
const log = (s = "") => { out.push(s); console.log(s); };

const TEMAS = {
  "GCP CUD / descuentos comprometidos": /\b(cud|committed use)\b/i,
  "GCP Sustained Use Discounts": /sustained use|sud\b/i,
  "AWS Savings Plans": /savings plan/i,
  "Azure Reservations / Savings Plan": /azure reservation|savings plan for compute|azure savings plan/i,
  "IP pública IPv4": /ipv4|elastic ip|ip p[úu]blica/i,
  "NAT Gateway / endpoints": /nat gateway|gateway endpoint|privatelink/i,
  "Batch inference IA": /batch inference|global batch|batch prediction/i,
  "S3 Intelligent-Tiering / Autoclass": /intelligent-tiering|autoclass/i,
  "Versiones FOCUS": /focus 1\.\d|versi[óo]n/i,
};

const PCT = /(hasta\s+)?(\d{1,3}(?:[.,]\d+)?)\s*%/g;
const TARIFA = /\d+[.,]\d+\s*(USD|\$)?\s*(\/|por )\s*(hora|gb|GB|mes|1000|objeto)/g;

log("=".repeat(100));
log("TAREA 4b — AFIRMACIONES CUANTITATIVAS AGRUPADAS POR TEMA (búsqueda de contradicciones)");
log("=".repeat(100));

for (const [tema, re] of Object.entries(TEMAS)) {
  const hits = [];
  for (const e of KNOWLEDGE_BASE) {
    const texto = `${e.topic}\n${e.summary}\n${e.detail}`;
    if (!re.test(texto)) continue;
    const frases = texto.split(/(?<=[.:])\s+/).filter((f) => re.test(f) && (PCT.test(f) || TARIFA.test(f)));
    PCT.lastIndex = 0; TARIFA.lastIndex = 0;
    for (const f of frases) hits.push({ id: e.id, f: f.replace(/\s+/g, " ").trim() });
  }
  if (!hits.length) continue;
  log("");
  log(`── ${tema}`);
  for (const h of hits) log(`   [${h.id}] ${h.f.slice(0, 250)}`);
}

// Contradicciones concretas comprobadas con extracción de cifras
log("");
log("=".repeat(100));
log("COMPROBACIONES DIRIGIDAS");
log("=".repeat(100));
const byId = Object.fromEntries(KNOWLEDGE_BASE.map((e) => [e.id, e]));
const conflictos = [];

function pcts(text) {
  return [...text.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g)].map((m) => parseFloat(m[1].replace(",", ".")));
}

// 1. Techo de los CUD de GCP basados en recurso
{
  const a = byId["gcp-cuds"];
  const b = byId["playbook-cud-azure-reservations"];
  log("");
  log("1. Techo publicado de los CUD de Google Cloud basados en recurso");
  log(`   [gcp-cuds] resumen: "${a.summary}"`);
  log(`   [playbook-cud-azure-reservations] resumen: "${b.summary.slice(0, 300)}"`);
  log(`   porcentajes en gcp-cuds: ${pcts(a.summary + a.detail).join(", ")}`);
  log(`   porcentajes en playbook-cud: ${pcts(b.summary + b.detail).join(", ")}`);
  conflictos.push("CONTRADICCIÓN: gcp-cuds afirma «hasta 57% a 1 año, 70% a 3 años» para los CUD de GCP; playbook-cud-azure-reservations afirma «CUD basados en recurso hasta 55% (hasta 70% en máquinas optimizadas para memoria)» y «CUD flexibles 28% a un año / 46% a tres años», con fuente verificada. Los dos números para el mismo concepto (57 vs 55) son incompatibles, y gcp-cuds no cita fuente (sourceUrl null).");
  conflictos.push("INCOHERENCIA DE TAXONOMÍA: gcp-cuds describe los dos tipos de CUD como «Resource-based» y «Spend-based», mientras playbook-cud-azure-reservations habla de «basados en recurso» y «flexibles de Compute». La app usa ambos vocabularios para la misma realidad sin aclararlo.");
}

// 2. SUDs de GCP
{
  const a = byId["gcp-sustained-use"];
  log("");
  log("2. Sustained Use Discounts de GCP: techo declarado vs escalera del detalle");
  log(`   resumen: "${a.summary}"`);
  log(`   detalle: "${a.detail.slice(0, 330)}"`);
  log(`   porcentajes: resumen=${pcts(a.summary).join(", ")} / detalle=${pcts(a.detail).join(", ")}`);
  conflictos.push("CONTRADICCIÓN INTERNA en gcp-sustained-use: el resumen dice «Hasta 30% de descuento» y el detalle enumera una escalera que llega al «60%», aclarando después que el efectivo es «aproximadamente 30%». Un lector que cite el detalle publicará 60%. Sin sourceUrl (null).");
}

// 3. Savings Plans: 72% en el resumen vs 66/72 en el detalle
{
  const a = byId["playbook-savings-plans"];
  log("");
  log("3. AWS Savings Plans: techo en resumen vs detalle");
  log(`   resumen: "${a.summary}"`);
  log(`   porcentajes: resumen=${pcts(a.summary).join(", ")} / detalle=${pcts(a.detail).join(", ")}`);
  log("   El resumen atribuye «hasta 72%» a Savings Plans en general; el detalle aclara que 72% es sólo EC2 Instance SP y Compute SP llega a 66%. Coherente pero el resumen, leído solo, sobrevende.");
}

// 4. IP pública: tarifa y si la factura distingue
{
  const a = byId["playbook-public-ipv4"];
  log("");
  log("4. IPv4 pública: tarifas y capacidad de distinguir IP ociosa");
  log(`   "${a.summary.replace(/\s+/g, " ")}"`);
  log(`   detalle cita: 0,005 USD/hora AWS (idle e in-use iguales); GCP 0,01 vs 0,005`);
  log("   Coherente con IP_RATES de src/engine/rules/idle-resources.ts (aws 0.005 idleRateIsDistinct=false, gcp 0.01 idleRateIsDistinct=true, azure 0.005 false).");
}

// 5. Versiones FOCUS soportadas
{
  log("");
  log("5. Versiones FOCUS: qué dice cada sitio");
  log(`   [focus-what] "${byId["focus-what"].summary.replace(/\s+/g, " ").slice(0, 220)}"`);
  log(`   src/engine/parsers/focus-parser.ts encabezado: "FOCUS 1.0–1.4 CSV Parser"`);
  const fc = fs.readFileSync(path.join(HERE, "../../src/engine/validation/file-check.ts"), "utf8");
  const label = fc.match(/focus:\s*"([^"]+)"/);
  log(`   src/engine/validation/file-check.ts etiqueta al usuario: "${label?.[1]}"`);
  const idx = fs.readFileSync(path.join(HERE, "../../src/engine/parsers/index.ts"), "utf8");
  const msg = idx.match(/Formatos soportados: ([^"]+)/);
  log(`   mensaje de error de detección: "Formatos soportados: ${msg?.[1]?.trim()}"`);
  conflictos.push("INCOHERENCIA DE VERSIONES: el parser se documenta como «FOCUS 1.0–1.4» y trata explícitamente columnas de 1.4 (ServiceProviderName/HostProviderName), pero la etiqueta que ve el usuario y el mensaje de error dicen «FOCUS 1.0/1.2». Un usuario con un export 1.4 leerá que no está soportado.");
}

// 6. S3 Intelligent-Tiering: cuota de monitorización
{
  const a = byId["playbook-s3-tiering"];
  log("");
  log("6. S3 Intelligent-Tiering: cuota de monitorización citada");
  const m = a.detail.match(/\$[\d.]+ por [\d.]+ objetos\/mes|~\$[\d.]+[^.]*objetos[^.]*/);
  log(`   detalle: "${m?.[0]}"`);
  log("   La regla STORAGE-OBJ-001 menciona la cuota pero no la resta del ahorro estimado: el ahorro moderado se calcula sobre el 100% del coste sin descontar la cuota de monitorización ni el cargo de habilitación de Autoclass que ella misma advierte.");
  conflictos.push("El texto de STORAGE-OBJ-001 y playbook-s3-tiering advierten de la cuota de monitorización por objeto (y del cargo de habilitación de Autoclass), pero el cálculo del ahorro no la descuenta en ningún tramo del rango: el conservador tampoco la contempla.");
}

log("");
log("=".repeat(100));
log(`CONTRADICCIONES / INCOHERENCIAS: ${conflictos.length}`);
conflictos.forEach((c, i) => log(`  ${i + 1}. ${c}`));

fs.writeFileSync(path.join(HERE, "out-kb-contradictions.txt"), out.join("\n"));
