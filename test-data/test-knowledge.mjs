/**
 * Knowledge base retrieval test.
 * Run: npx tsx test-data/test-knowledge.mjs
 */

const { lookupKnowledge } = await import("../src/engine/knowledge/knowledge-base.ts");

let passed = 0;
let failed = 0;

function test(label, query, expectedIdSubstring) {
  const results = lookupKnowledge(query);
  const ids = results.map((e) => e.id);
  const ok = results.some((e) => e.id.includes(expectedIdSubstring));
  if (ok) {
    console.log(`  PASS  ${label} — got: [${ids.join(", ")}]`);
    passed++;
  } else {
    console.error(`  FAIL  ${label} — expected id containing "${expectedIdSubstring}", got: [${ids.join(", ")}]`);
    failed++;
  }
}

function testEmpty(label, query) {
  const results = lookupKnowledge(query);
  if (results.length === 0) {
    console.log(`  PASS  ${label} — correctly returned empty`);
    passed++;
  } else {
    console.error(`  FAIL  ${label} — expected empty, got: [${results.map((e) => e.id).join(", ")}]`);
    failed++;
  }
}

console.log("Knowledge base retrieval tests\n");
console.log("── Original 9 tests ──────────────────────────────────────────");

test("focus query returns FOCUS entry", "focus", "focus");
test("savings plan query returns Savings Plans entry", "savings plan", "savings-plans");
test("snapshot query returns EBS/snapshots entry", "snapshot", "ebs-snapshots");
test("batch inference query returns Bedrock entry", "batch inference", "bedrock-batch");
test("FOCUS columns query", "columnas focus billedcost", "focus-columns");
test("well-architected cost06 query", "generacion instancia well-architected", "wa-cost06");
test("utilization metrics limits query", "utilizacion cpu cloudwatch factura", "billing-limits-utilization");
testEmpty("nonsense query returns empty", "xyzabc123notaword");
testEmpty("empty query returns empty", "");

console.log("\n── New tests (10) ────────────────────────────────────────────");

// FinOps Framework
test("principios finops", "principios finops teams collaborate ownership", "finops-principles");
test("fases inform optimize operate", "fases inform optimize operate ciclo", "finops-phases");

// Azure
test("azure advisor recomendaciones", "azure advisor rightsizing vm disco no adjunto", "azure-advisor");
test("azure reservations vs savings plans", "azure reservations savings plans compute diferencia", "azure-reservations");

// GCP
test("gcp recommender rightsizing", "gcp recommender rightsizing vm idle", "gcp-recommender");
test("sustained use discount gcp", "sustained use descuento automatico gcp sin compromiso", "gcp-sustained");

// AI costs
test("prompt tokens costo ia", "tokens input output facturacion llm costo inferencia", "ai-cost-model");

// Governance
test("tagging chargeback estrategia", "tagging etiquetas chargeback cost center owner", "tagging-strategy");
test("cost anomaly detection aws", "anomaly detection gasto inusual aws machine learning", "aws-cost-anomaly");

// Kubernetes
test("kubecost kubernetes allocation", "kubernetes kubecost namespace costo cluster", "kubernetes-cost");

console.log("\n── New tests (16) — FOCUS a fondo, framework 2026, IA ────────");

// FOCUS: estado del estándar
test("focus 1.4 que cambio", "focus 1.4 que cambio", "focus-versiones-cronologia");
test("datasets y niveles de exigencia", "datasets focus costandusage mandatory conditional", "focus-datasets");
test("formato periodos y nulos", "periodos cota exclusiva between nulos iso 8601", "focus-formato-datos");
test("casos de uso oficiales", "casos de uso focus queries sql reconciliacion", "focus-use-cases");

// FOCUS: métricas de coste
test("billedcost vs effectivecost", "billedcost vs effectivecost", "focus-cuatro-metricas-coste");
test("doble conteo compromisos", "doble conteo compromisos", "focus-doble-conteo-compromisos");

// FOCUS: taxonomía
test("servicecategory valores", "servicecategory valores", "focus-servicecategory");
test("servicesubcategory storage", "servicesubcategory storage", "focus-servicesubcategory");
test("chargecategory y chargeclass", "chargecategory chargeclass correction", "focus-chargecategory-chargeclass");

// FOCUS: conformidad
test("conformidad y gap report", "conformance gap report certificacion desviaciones", "focus-conformance-program");
test("gcp no trae servicecategory", "gcp no trae servicecategory", "focus-gcp-gaps");

// Framework 2026
test("22 capabilities dominios", "22 capabilities dominios", "finops-domains");
test("scopes vs technology categories", "scopes vs technology categories", "finops-scopes");
test("optimizar antes de comprometer", "optimizar antes de comprometer", "finops-optimizar-antes-de-comprometer");

// IA
test("focus para ia sin columna de tokens", "focus ia consumedquantity skuid moneda virtual", "focus-for-ai");
test("coste por token", "coste por token", "ai-cost-metrics");
test("gpu utilizacion vs saturacion", "saturacion gpu vataje consumo electrico", "ai-gpu-utilizacion-saturacion");
test("PTU capacidad reservada", "PTU capacidad reservada", "ai-ptu-capacidad-reservada");
test("state of finops 2026", "state of finops 2026 encuesta prioridad", "state-of-finops-2026");

// Token Economics
test("token economics borrador", "token economics tokenomics foundation borrador", "token-economics");
test("big-t notation", "big-t notation", "big-t-notation");

// Metodología working groups
test("adoptar focus etapas", "adoptar focus etapas", "focus-adopcion-etapas");
test("saas licencia vs consumo", "saas licencias correlacionar uso y coste chargeback", "finops-saas");
test("rate card data center capacidad ociosa", "rate card data center capacidad ociosa", "finops-data-center");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
