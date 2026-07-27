/**
 * AUDIT — sondas puntuales sobre clasificación y umbrales.
 * Run: npx tsx test-data/audit/audit-probes.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { parseFOCUSCSV, parseAWSCSV, parseGCPCSV, parseAzureCSV } = await import("../../src/engine/parsers/index.ts");
const { calculateSavings } = await import("../../src/engine/tools/calculate-savings.ts");
const { analyzeTrends } = await import("../../src/engine/trends.ts");

const out = [];
const log = (s = "") => { out.push(s); console.log(s); };
const r2 = (n) => Math.round(n * 100) / 100;

// ─── Sonda A: clasificación de IPv4 pública en FOCUS ──────────────
log("=".repeat(100));
log("SONDA A — Clasificación de cargos de IPv4 pública en FOCUS (categoría esperada: ip-address)");
log("=".repeat(100));
{
  const cols = "BillingAccountId,BillingCurrency,BilledCost,EffectiveCost,ChargePeriodStart,ChargeCategory,ChargeDescription,ProviderName,ServiceName,ServiceCategory,ServiceSubcategory,SkuId,RegionId";
  const variantes = [
    ["SkuId estilo CUR", "USE1-PublicIPv4:IdleAddress", "USE1-PublicIPv4:IdleAddress"],
    ["descripción larga AWS", "$0.005 per Idle public IPv4 address per hour", "USE1-PublicIPv4:IdleAddress"],
    ["descripción larga in-use", "$0.005 per In-use public IPv4 address per hour", "USE1-PublicIPv4:InUseAddress"],
    ["Elastic IP", "Elastic IP address not attached to a running instance", "ElasticIP:IdleAddress"],
    ["Azure IP pública", "Standard Static Public IPv4 Address Hours", "public-ip-standard-static"],
    ["texto genérico", "IdleAddress", "IdleAddress"],
  ];
  log("");
  log("| Variante | ChargeDescription | ServiceSubcategory | Categoría asignada | ¿ip-address? |");
  log("|---|---|---|---|---|");
  for (const [nombre, desc, sku] of variantes) {
    for (const sub of ["Network Infrastructure", ""]) {
      const csv = [cols,
        `111122223333,USD,10,10,2026-06-01T00:00:00Z,Usage,"${desc}",AWS,Amazon Elastic Compute Cloud,Networking,${sub},${sku},us-east-1`
      ].join("\n");
      const recs = parseFOCUSCSV(csv);
      const cat = recs[0]?.category;
      log(`| ${nombre} | ${desc.slice(0, 46)} | ${sub || "(vacía)"} | ${cat} | ${cat === "ip-address" ? "SÍ" : "NO ←"} |`);
    }
  }
  log("");
  log("  Nota: subdivideNetworking() sólo busca 'ip address', 'elastic ip' y 'public ip' en ChargeDescription+SkuId.");
  log("  El parser nativo de AWS sí reconoce 'elasticip' e 'idleaddress' (categorizeAWS), el de FOCUS no.");
}

// ─── Sonda B: RDS clasificado como compute (parser AWS nativo) ─────
log("");
log("=".repeat(100));
log("SONDA B — categorizeAWS: orden de las reglas (RDS / DynamoDB / Lambda)");
log("=".repeat(100));
{
  const cols = "lineItem/UsageStartDate,lineItem/ProductCode,product/ProductName,lineItem/UsageType,product/region,lineItem/UnblendedCost";
  const casos = [
    ["RDS instancia", "AmazonRDS", "Amazon Relational Database Service", "USE1-InstanceUsage:db.m5.large", "database"],
    ["RDS almacenamiento", "AmazonRDS", "Amazon Relational Database Service", "USE1-RDS:GP2-Storage", "database"],
    ["DynamoDB", "AmazonDynamoDB", "Amazon DynamoDB", "USE1-WriteRequestUnits", "database"],
    ["Lambda", "AWSLambda", "AWS Lambda", "USE1-Lambda-GB-Second", "serverless"],
    ["EC2 BoxUsage", "AmazonEC2", "Amazon Elastic Compute Cloud", "USE1-BoxUsage:m6i.large", "compute"],
    ["S3 almacenamiento", "AmazonS3", "Amazon Simple Storage Service", "USE1-TimedStorage-ByteHrs", "object-storage"],
    ["ElastiCache", "AmazonElastiCache", "Amazon ElastiCache", "USE1-NodeUsage:cache.m5.large", "database"],
  ];
  log("");
  log("| Caso | UsageType | Esperado | Motor | |");
  log("|---|---|---|---|---|");
  for (const [nombre, code, pname, usage, esperado] of casos) {
    const csv = [cols, `2026-06-01T00:00:00Z,${code},${pname},${usage},us-east-1,10.00`].join("\n");
    const recs = parseAWSCSV(csv);
    const cat = recs[0]?.category;
    log(`| ${nombre} | ${usage} | ${esperado} | ${cat} | ${cat === esperado ? "OK" : "DIF ←"} |`);
  }
}

// ─── Sonda C: GCP snapshot vs disco ────────────────────────────────
log("");
log("=".repeat(100));
log("SONDA C — categorizeGCP: orden de las reglas (snapshot vs disco persistente)");
log("=".repeat(100));
{
  const cols = "service_description,sku_description,location_region,usage_start_time,cost";
  const casos = [
    ["Snapshot PD", "Compute Engine", "Storage PD Snapshot", "snapshot"],
    ["Snapshot (otro texto)", "Compute Engine", "Snapshot storage in US", "snapshot"],
    ["Disco PD", "Compute Engine", "Storage PD Capacity", "block-storage"],
    ["Cloud NAT", "Compute Engine", "Cloud NAT Gateway uptime", "nat"],
    ["IP externa idle", "Compute Engine", "Static External IP Address charge (idle)", "ip-address"],
    ["Egress", "Compute Engine", "Network Internet Egress from Americas", "network-egress"],
  ];
  log("");
  log("| Caso | sku_description | Esperado | Motor | |");
  log("|---|---|---|---|---|");
  for (const [nombre, svc, sku, esperado] of casos) {
    const csv = [cols, `${svc},"${sku}",us-central1,2026-06-01T00:00:00Z,10.00`].join("\n");
    const recs = parseGCPCSV(csv);
    const cat = recs[0]?.category;
    log(`| ${nombre} | ${sku} | ${esperado} | ${cat} | ${cat === esperado ? "OK" : "DIF ←"} |`);
  }
}

// ─── Sonda D: Azure — NAT e IP tapados por reglas previas ──────────
log("");
log("=".repeat(100));
log("SONDA D — categorizeAzure: orden de las reglas (NAT / IP pública / snapshot)");
log("=".repeat(100));
{
  const cols = "Date,MeterCategory,MeterSubCategory,MeterName,ConsumedService,ResourceLocation,CostInBillingCurrency";
  const casos = [
    ["NAT Gateway", "NAT Gateway", "NAT Gateway", "Data Processed", "Microsoft.Network", "nat"],
    ["NAT via Networking", "Networking", "NAT Gateway", "Data Processed", "Microsoft.Network", "nat"],
    ["IP pública", "IP Addresses", "Standard", "Standard Static Public IP", "Microsoft.Network", "ip-address"],
    ["IP via Networking", "Networking", "Public IP", "Standard Static IP Hours", "Microsoft.Network", "ip-address"],
    ["Snapshot de disco", "Storage", "Standard Snapshots", "LRS Snapshots", "Microsoft.Compute", "snapshot"],
    ["Disco premium", "Storage", "Premium SSD Managed Disks", "P10 Disks", "Microsoft.Compute", "block-storage"],
    ["Blob", "Storage", "General Block Blob", "Hot LRS Data Stored", "Microsoft.Storage", "object-storage"],
  ];
  log("");
  log("| Caso | MeterCategory / SubCategory | Esperado | Motor | |");
  log("|---|---|---|---|---|");
  for (const [nombre, mc, msc, mn, cs, esperado] of casos) {
    const csv = [cols, `2026-06-01,${mc},${msc},${mn},${cs},eastus,10.00`].join("\n");
    const recs = parseAzureCSV(csv);
    const cat = recs[0]?.category;
    log(`| ${nombre} | ${mc} / ${msc} | ${esperado} | ${cat} | ${cat === esperado ? "OK" : "DIF ←"} |`);
  }
}

// ─── Sonda E: umbral de 14 días con datos que SÍ tienen señal ──────
log("");
log("=".repeat(100));
log("SONDA E — Umbral de 14 días para tendencias (datos con pico y crecimiento)");
log("=".repeat(100));
{
  const mk = (n) => {
    const recs = [];
    for (let i = 0; i < n; i++) {
      const d = `2026-06-${String(i + 1).padStart(2, "0")}`;
      // base creciente + pico el día 5
      const base = 100 + i * 12;
      const spike = i === 4 ? 900 : 0;
      recs.push({ provider: "aws", category: "compute", nativeService: "Amazon EC2", nativeUsageType: "BoxUsage:m6i.large", region: "us-east-1", date: d, cost: base, quantity: 24, chargeType: "Usage" });
      if (spike) recs.push({ provider: "aws", category: "other", nativeService: "AWS Glue", nativeUsageType: "CrawlerRun", region: "us-east-1", date: d, cost: spike, quantity: 1, chargeType: "Usage" });
    }
    return recs;
  };
  for (const n of [12, 13, 14, 15, 20]) {
    const ins = analyzeTrends(mk(n));
    log(`  ${String(n).padStart(2)} días distintos → ${ins.length} insights: ${ins.map(i => i.type).join(", ") || "(vacío)"}`);
  }
  log("");
  log("  Verificación del contenido con 20 días:");
  for (const i of analyzeTrends(mk(20))) {
    log(`   - [${i.type}] ${i.title}`);
    log(`     evidencia: ${i.evidence}`);
  }
}

// ─── Sonda F: umbral de 7 días declarado por file-check ────────────
log("");
log("=".repeat(100));
log("SONDA F — ¿Qué reglas dependen realmente de un mínimo de días?");
log("=".repeat(100));
{
  const { diagnoseUpload } = await import("../../src/engine/validation/file-check.ts");
  const { parseCSVAutoDetect } = await import("../../src/engine/parsers/index.ts");
  const FIX = path.join(HERE, "fixtures");
  for (const f of ["focus-6dias.csv", "focus-7dias.csv", "focus-13dias.csv", "focus-14dias.csv"]) {
    const csv = fs.readFileSync(path.join(FIX, f), "utf8");
    const parsed = parseCSVAutoDetect(csv);
    const diag = diagnoseUpload(csv, parsed);
    const rep = calculateSavings(parsed.records, parsed.isFocus);
    const caps = diag.capabilities.map(c => `${c.id}=${c.ok ? "sí" : "no"}`).join(" ");
    log(`  ${f.padEnd(20)} días=${diag.distinctDays} | ${caps}`);
    log(`  ${"".padEnd(20)} hallazgos reales=${rep.findings.length}, tendencias reales=${rep.trendInsights.length}`);
  }
  log("");
  log("  Un solo día de datos:");
  const cols = "BillingAccountId,BillingCurrency,BilledCost,EffectiveCost,ChargePeriodStart,ChargeCategory,ChargeDescription,ProviderName,ServiceName,ServiceCategory,ServiceSubcategory,SkuId,RegionId";
  const rs = [
    `111122223333,USD,3000,3000,2026-06-01T00:00:00Z,Usage,EBS:VolumeUsage.gp3,AWS,Amazon Elastic Block Store,Storage,Block Storage,EBS:VolumeUsage.gp3,us-east-1`,
    `111122223333,USD,2000,2000,2026-06-01T00:00:00Z,Usage,TimedStorage-ByteHrs,AWS,Amazon Simple Storage Service,Storage,Object Storage,TimedStorage-ByteHrs,us-east-1`,
    `111122223333,USD,1500,1500,2026-06-01T00:00:00Z,Usage,NatGateway-Bytes,AWS,Amazon Virtual Private Cloud,Networking,Network Infrastructure,NatGateway-Bytes,us-east-1`,
  ];
  const csv1 = [cols, ...rs].join("\n");
  const p1 = parseCSVAutoDetect(csv1);
  const rep1 = calculateSavings(p1.records, true);
  log(`   1 día, $6500 en el día → coste mensual proyectado = $${rep1.totalCostUSD} (6500 × 30)`);
  log(`   hallazgos emitidos = ${rep1.findings.length}: ${rep1.findings.map(f => `${f.category} $${f.estimatedMonthlySavingsUSD}`).join(", ")}`);
  log(`   ahorro total prometido = $${rep1.totalEstimatedSavingsUSD}/mes a partir de UN día de datos`);
}

fs.writeFileSync(path.join(HERE, "out-probes.txt"), out.join("\n"));
