/**
 * AUDIT — Generador de datos sintéticos con desperdicio CONOCIDO.
 * Escribe los CSV en test-data/audit/fixtures/ y la verdad de referencia
 * en test-data/audit/ground-truth.json
 *
 * Run: npx tsx test-data/audit/generate.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "fixtures");
fs.mkdirSync(OUT, { recursive: true });

const r2 = (n) => Math.round(n * 100) / 100;
const days = (n, start = 1) =>
  Array.from({ length: n }, (_, i) => `2026-06-${String(start + i).padStart(2, "0")}`);

// ───────────────────────── FOCUS builder ─────────────────────────

const FOCUS_COLS = [
  "BillingAccountId", "BillingCurrency", "BilledCost", "EffectiveCost",
  "ChargePeriodStart", "ChargePeriodEnd", "ChargeCategory", "ChargeDescription",
  "ProviderName", "ServiceName", "ServiceCategory", "ServiceSubcategory",
  "SkuId", "RegionId", "ResourceId", "ResourceType", "ConsumedQuantity",
  "CommitmentDiscountId",
];

function focusRow(o) {
  const d = {
    BillingAccountId: "111122223333", BillingCurrency: "USD",
    BilledCost: 0, EffectiveCost: 0,
    ChargePeriodStart: "", ChargePeriodEnd: "",
    ChargeCategory: "Usage", ChargeDescription: "", ProviderName: "AWS",
    ServiceName: "", ServiceCategory: "", ServiceSubcategory: "",
    SkuId: "", RegionId: "us-east-1", ResourceId: "", ResourceType: "",
    ConsumedQuantity: 1, CommitmentDiscountId: "",
    ...o,
  };
  return FOCUS_COLS.map((c) => {
    const v = String(d[c] ?? "");
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(",");
}

function writeFocus(name, rows) {
  fs.writeFileSync(path.join(OUT, name), [FOCUS_COLS.join(","), ...rows].join("\n") + "\n");
}

/**
 * Perfil base multi-categoría usado por varios fixtures.
 * Devuelve { rows, truth } donde truth lleva los totales exactos por categoría.
 */
function focusProfile(dateList, opts = {}) {
  const { withSubcategory = true, effectiveEqualsBilled = true } = opts;
  const rows = [];
  const byCat = {};
  const add = (cat, cost, o) => {
    byCat[cat] = r2((byCat[cat] || 0) + cost);
    rows.push(focusRow({
      BilledCost: effectiveEqualsBilled ? cost : r2(cost * 1.25),
      EffectiveCost: cost,
      ...o,
    }));
  };
  const sub = (s) => (withSubcategory ? s : "");

  for (const d of dateList) {
    const end = d; // fin no relevante para el motor
    const common = { ChargePeriodStart: `${d}T00:00:00Z`, ChargePeriodEnd: `${end}T23:59:59Z` };
    // compute: 40.00/día  (BoxUsage t2 para disparar legacy-generation)
    add("compute", 40.0, {
      ...common, ServiceName: "Amazon Elastic Compute Cloud", ServiceCategory: "Compute",
      ServiceSubcategory: sub("Virtual Machines"), ChargeDescription: "USE1-BoxUsage:t2.xlarge",
      SkuId: "BoxUsage:t2.xlarge", ResourceId: "i-0aaa1111", ResourceType: "EC2 Instance",
    });
    // block-storage: 20.00/día
    add("block-storage", 20.0, {
      ...common, ServiceName: "Amazon Elastic Block Store", ServiceCategory: "Storage",
      ServiceSubcategory: sub("Block Storage"), ChargeDescription: "EBS:VolumeUsage.gp3",
      SkuId: "EBS:VolumeUsage.gp3", ResourceId: "vol-0bbb2222", ResourceType: "EBS Volume",
    });
    // object-storage: 15.00/día
    add("object-storage", 15.0, {
      ...common, ServiceName: "Amazon Simple Storage Service", ServiceCategory: "Storage",
      ServiceSubcategory: sub("Object Storage"), ChargeDescription: "TimedStorage-ByteHrs",
      SkuId: "TimedStorage-ByteHrs", ResourceId: "arn:aws:s3:::audit-bucket", ResourceType: "S3 Bucket",
    });
    // snapshot: 8.00/día
    add("snapshot", 8.0, {
      ...common, ServiceName: "Amazon Elastic Block Store", ServiceCategory: "Storage",
      ServiceSubcategory: sub("Backup Storage"), ChargeDescription: "EBS:SnapshotUsage",
      SkuId: "EBS:SnapshotUsage", ResourceId: "snap-0ccc3333", ResourceType: "EBS Snapshot",
    });
    // nat: 12.00/día
    add("nat", 12.0, {
      ...common, ServiceName: "Amazon Virtual Private Cloud", ServiceCategory: "Networking",
      ServiceSubcategory: sub("Network Infrastructure"), ChargeDescription: "NatGateway-Bytes",
      SkuId: "NatGateway-Bytes", ResourceId: "nat-0ddd4444", ResourceType: "NAT Gateway",
    });
    // ip-address: 1.20/día
    add("ip-address", 1.2, {
      ...common, ServiceName: "Amazon Elastic Compute Cloud", ServiceCategory: "Networking",
      ServiceSubcategory: sub("Network Infrastructure"), ChargeDescription: "PublicIPv4:IdleAddress",
      SkuId: "PublicIPv4:IdleAddress",
    });
    // ai-ml: 25.00/día
    add("ai-ml", 25.0, {
      ...common, ServiceName: "Amazon Bedrock", ServiceCategory: "AI and Machine Learning",
      ServiceSubcategory: sub("Generative AI"), ChargeDescription: "InputTokenCount",
      SkuId: "Claude-InputTokens",
    });
    // database: 30.00/día
    add("database", 30.0, {
      ...common, ServiceName: "Amazon Relational Database Service", ServiceCategory: "Databases",
      ServiceSubcategory: sub("Relational Databases"), ChargeDescription: "InstanceUsage:db.m5.large",
      SkuId: "InstanceUsage:db.m5.large",
    });
  }

  const perDay = 40 + 20 + 15 + 8 + 12 + 1.2 + 25 + 30; // 151.20
  return {
    rows,
    truth: {
      distinctDays: dateList.length,
      totalEffectiveCost: r2(perDay * dateList.length),
      dailyCost: perDay,
      projectedMonthly: r2(perDay * 30),
      byCategory: byCat,
    },
  };
}

const truth = {};

// ─── 1 & 2: umbral de 7 días (6 vs 7) ─────────────────────────────
for (const n of [6, 7]) {
  const { rows, truth: t } = focusProfile(days(n));
  const name = `focus-${n}dias.csv`;
  writeFocus(name, rows);
  truth[name] = {
    format: "focus", ...t,
    expect: {
      aggregateFindings: n >= 7,
      trends: n >= 14,
      note: `Umbral documentado: hallazgos agregados requieren >=7 días distintos; tendencias >=14.`,
    },
  };
}

// ─── 3 & 4: umbral de 14 días para tendencias (13 vs 14) ──────────
for (const n of [13, 14]) {
  const { rows, truth: t } = focusProfile(days(n));
  const name = `focus-${n}dias.csv`;
  writeFocus(name, rows);
  truth[name] = {
    format: "focus", ...t,
    expect: { aggregateFindings: true, trends: n >= 14 },
  };
}

// ─── 5: EffectiveCost != BilledCost ───────────────────────────────
{
  const dl = days(14);
  const { rows, truth: t } = focusProfile(dl, { effectiveEqualsBilled: false });
  const name = "focus-effective-vs-billed.csv";
  writeFocus(name, rows);
  truth[name] = {
    format: "focus", ...t,
    billedTotal: r2(t.totalEffectiveCost * 1.25),
    expect: {
      engineMustUse: "EffectiveCost",
      totalCostUSD: r2((t.dailyCost / 1) * 30),
      note: "BilledCost = EffectiveCost * 1.25 en TODAS las filas. Si el motor usara BilledCost el total sería 25% mayor.",
    },
  };
}

// ─── 6: compras de compromiso (Purchase) + uso cubierto ───────────
{
  const dl = days(14);
  const { rows, truth: t } = focusProfile(dl);
  // 1 compra de compromiso: BilledCost 5000, EffectiveCost 0
  rows.push(focusRow({
    BilledCost: 5000, EffectiveCost: 0, ChargeCategory: "Purchase",
    ChargePeriodStart: `${dl[0]}T00:00:00Z`, ChargePeriodEnd: `${dl[0]}T23:59:59Z`,
    ServiceName: "Savings Plans for AWS Compute usage", ServiceCategory: "Compute",
    ChargeDescription: "Compute Savings Plan 1yr No Upfront purchase",
    CommitmentDiscountId: "arn:aws:savingsplans::111122223333:savingsplan/abc",
  }));
  // uso cubierto por ese compromiso: 100/día amortizado
  let covered = 0;
  for (const d of dl) {
    covered += 100;
    rows.push(focusRow({
      BilledCost: 0, EffectiveCost: 100, ChargeCategory: "Usage",
      ChargePeriodStart: `${d}T00:00:00Z`, ChargePeriodEnd: `${d}T23:59:59Z`,
      ServiceName: "Amazon Elastic Compute Cloud", ServiceCategory: "Compute",
      ServiceSubcategory: "Virtual Machines",
      ChargeDescription: "USE1-BoxUsage:m6i.4xlarge", SkuId: "BoxUsage:m6i.4xlarge",
      CommitmentDiscountId: "arn:aws:savingsplans::111122223333:savingsplan/abc",
      ResourceId: "i-0eee5555", ResourceType: "EC2 Instance",
    }));
  }
  const name = "focus-commitment-purchase.csv";
  writeFocus(name, rows);
  truth[name] = {
    format: "focus",
    distinctDays: 14,
    totalEffectiveCost: r2(t.totalEffectiveCost + covered),
    purchaseBilledCost: 5000,
    dailyCost: r2(t.dailyCost + 100),
    projectedMonthly: r2((t.dailyCost + 100) * 30),
    byCategory: { ...t.byCategory, compute: r2(t.byCategory.compute + covered) },
    expect: {
      purchaseRowExcluded: true,
      totalCostUSD: r2((t.dailyCost + 100) * 30),
      note: "La fila Purchase (BilledCost 5000, EffectiveCost 0) NO debe sumarse. Si se sumara el total subiría 5000.",
    },
  };
}

// ─── 7: impuestos + créditos (importes negativos) ──────────────────
{
  const dl = days(14);
  const { rows, truth: t } = focusProfile(dl);
  let tax = 0, credit = 0;
  for (const d of dl) {
    tax += 15;
    rows.push(focusRow({
      BilledCost: 15, EffectiveCost: 15, ChargeCategory: "Tax",
      ChargePeriodStart: `${d}T00:00:00Z`, ChargePeriodEnd: `${d}T23:59:59Z`,
      ServiceName: "Tax", ChargeDescription: "VAT 21%",
    }));
    credit += -30;
    rows.push(focusRow({
      BilledCost: -30, EffectiveCost: -30, ChargeCategory: "Credit",
      ChargePeriodStart: `${d}T00:00:00Z`, ChargePeriodEnd: `${d}T23:59:59Z`,
      ServiceName: "Amazon Elastic Compute Cloud", ServiceCategory: "Compute",
      ServiceSubcategory: "Virtual Machines",
      ChargeDescription: "EDP discount credit", SkuId: "BoxUsage:t2.xlarge",
    }));
  }
  const name = "focus-tax-credits.csv";
  writeFocus(name, rows);
  truth[name] = {
    format: "focus",
    distinctDays: 14,
    totalEffectiveCostAllRows: r2(t.totalEffectiveCost + tax + credit),
    totalEffectiveCostUsageOnly: t.totalEffectiveCost,
    taxTotal: tax, creditTotal: credit,
    dailyCost: t.dailyCost,
    projectedMonthly: t.projectedMonthly,
    byCategory: t.byCategory,
    expect: {
      taxExcluded: true,
      creditsExcluded: "a documentar — el motor descarta cost<=0",
      note: "Impuestos 15/día y créditos -30/día. Si ambos se excluyen, el neto real de la factura (netCash) queda 15/día por encima y 30/día por debajo del análisis.",
      netCashPerDay: r2(t.dailyCost + 15 - 30),
    },
  };
}

// ─── 8 & 9: ServiceSubcategory presente vs ausente (idénticos) ─────
{
  const dl = days(14);
  const a = focusProfile(dl, { withSubcategory: true });
  const b = focusProfile(dl, { withSubcategory: false });
  writeFocus("focus-con-subcategory.csv", a.rows);
  writeFocus("focus-sin-subcategory.csv", b.rows);
  truth["focus-con-subcategory.csv"] = { format: "focus", ...a.truth, expect: { pairWith: "focus-sin-subcategory.csv" } };
  truth["focus-sin-subcategory.csv"] = { format: "focus", ...b.truth, expect: { pairWith: "focus-con-subcategory.csv", note: "La clasificación por categoría debe coincidir con el par que sí trae ServiceSubcategory." } };
}

// ───────────────────────── AWS CUR nativo ─────────────────────────
{
  const dl = days(14);
  const cols = [
    "bill/BillingPeriodStartDate", "lineItem/UsageStartDate", "lineItem/ProductCode",
    "product/ProductName", "lineItem/UsageType", "product/region",
    "lineItem/UsageAccountId", "lineItem/UsageAmount", "lineItem/UnblendedCost",
    "lineItem/LineItemType",
  ];
  const rows = [];
  const byCat = {};
  const spec = [
    ["compute", "AmazonEC2", "Amazon Elastic Compute Cloud", "USE1-BoxUsage:t2.xlarge", 40.0],
    ["block-storage", "AmazonEC2", "Amazon Elastic Compute Cloud", "USE1-EBS:VolumeUsage.gp3", 20.0],
    ["object-storage", "AmazonS3", "Amazon Simple Storage Service", "USE1-TimedStorage-ByteHrs", 15.0],
    ["snapshot", "AmazonEC2", "Amazon Elastic Compute Cloud", "USE1-EBS:SnapshotUsage", 8.0],
    ["nat", "AmazonVPC", "Amazon Virtual Private Cloud", "USE1-NatGateway-Bytes", 12.0],
    ["ip-address", "AmazonEC2", "Amazon Elastic Compute Cloud", "USE1-PublicIPv4:IdleAddress", 1.2],
    ["database", "AmazonRDS", "Amazon Relational Database Service", "USE1-InstanceUsage:db.m5.large", 30.0],
  ];
  for (const d of dl) {
    for (const [cat, code, pname, usage, cost] of spec) {
      byCat[cat] = r2((byCat[cat] || 0) + cost);
      rows.push([
        "2026-06-01", `${d}T00:00:00Z`, code, pname, usage, "us-east-1",
        "111122223333", "24", cost.toFixed(2), "Usage",
      ].join(","));
    }
  }
  const perDay = spec.reduce((s, x) => s + x[4], 0);
  const name = "aws-cur-14dias.csv";
  fs.writeFileSync(path.join(OUT, name), [cols.join(","), ...rows].join("\n") + "\n");
  truth[name] = {
    format: "aws", distinctDays: 14,
    totalEffectiveCost: r2(perDay * 14), dailyCost: perDay,
    projectedMonthly: r2(perDay * 30), byCategory: byCat,
    expect: { aggregateFindings: true, trends: true },
  };
}

// ───────────────────── Azure Cost Management ──────────────────────
{
  const dl = days(14);
  const cols = [
    "Date", "SubscriptionId", "ResourceGroup", "MeterCategory", "MeterSubCategory",
    "MeterName", "ConsumedService", "ResourceLocation", "CostInBillingCurrency", "Quantity",
  ];
  const rows = [];
  const byCat = {};
  const spec = [
    ["compute", "Virtual Machines", "Dv3/DSv3 Series", "D4s v3", "Microsoft.Compute", 45.0],
    ["block-storage", "Storage", "Premium SSD Managed Disks", "P10 Disks", "Microsoft.Compute", 18.0],
    ["object-storage", "Storage", "General Block Blob", "Hot LRS Data Stored", "Microsoft.Storage", 14.0],
    ["network-egress", "Bandwidth", "Inter-Region", "Data Transfer Out", "Microsoft.Network", 9.0],
    ["database", "SQL Database", "Single Standard", "S2 DTUs", "Microsoft.Sql", 22.0],
  ];
  for (const d of dl) {
    for (const [cat, mc, msc, mn, cs, cost] of spec) {
      byCat[cat] = r2((byCat[cat] || 0) + cost);
      rows.push([d, "sub-0001", "rg-audit", mc, msc, mn, cs, "eastus", cost.toFixed(2), "24"].join(","));
    }
  }
  const perDay = spec.reduce((s, x) => s + x[5], 0);
  const name = "azure-cm-14dias.csv";
  fs.writeFileSync(path.join(OUT, name), [cols.join(","), ...rows].join("\n") + "\n");
  truth[name] = {
    format: "azure", distinctDays: 14,
    totalEffectiveCost: r2(perDay * 14), dailyCost: perDay,
    projectedMonthly: r2(perDay * 30), byCategory: byCat,
  };
}

// ───────────────────── GCP billing nativo ─────────────────────────
{
  const dl = days(14);
  const cols = [
    "billing_account_id", "project_id", "service_description", "sku_description",
    "location_region", "usage_start_time", "cost", "usage_amount",
  ];
  const rows = [];
  const byCat = {};
  const spec = [
    ["compute", "Compute Engine", "N2 Instance Core running in Americas", 38.0],
    ["block-storage", "Compute Engine", "Storage PD Capacity", 16.0],
    ["object-storage", "Cloud Storage", "Standard Storage US Multi-region", 13.0],
    ["snapshot", "Compute Engine", "Storage PD Snapshot", 7.0],
    ["nat", "Compute Engine", "Cloud NAT Gateway uptime", 11.0],
    ["ip-address", "Compute Engine", "Static External IP Address charge (idle)", 2.4],
    ["database", "Cloud SQL", "Cloud SQL for MySQL: Zonal - vCPU", 26.0],
  ];
  for (const d of dl) {
    for (const [cat, svc, sku, cost] of spec) {
      byCat[cat] = r2((byCat[cat] || 0) + cost);
      rows.push(["01AB-CDEF", "proj-audit", svc, `"${sku}"`, "us-central1", `${d}T00:00:00Z`, cost.toFixed(2), "24"].join(","));
    }
  }
  const perDay = spec.reduce((s, x) => s + x[3], 0);
  const name = "gcp-billing-14dias.csv";
  fs.writeFileSync(path.join(OUT, name), [cols.join(","), ...rows].join("\n") + "\n");
  truth[name] = {
    format: "gcp", distinctDays: 14,
    totalEffectiveCost: r2(perDay * 14), dailyCost: perDay,
    projectedMonthly: r2(perDay * 30), byCategory: byCat,
  };
}

// ─── Extra: caso de ahorro grande para probar el techo del ahorro ──
{
  const dl = days(20);
  const rows = [];
  let perDay = 0;
  for (const d of dl) {
    const common = { ChargePeriodStart: `${d}T00:00:00Z`, ChargePeriodEnd: `${d}T23:59:59Z` };
    // Perfil dominado por storage + NAT + IP: muchas reglas con supuestos altos
    const items = [
      [300, "Amazon Elastic Block Store", "Storage", "Block Storage", "EBS:VolumeUsage.gp3"],
      [300, "Amazon Simple Storage Service", "Storage", "Object Storage", "TimedStorage-ByteHrs"],
      [200, "Amazon Elastic Block Store", "Storage", "Backup Storage", "EBS:SnapshotUsage"],
      [200, "Amazon Virtual Private Cloud", "Networking", "Network Infrastructure", "NatGateway-Bytes"],
      [50, "Amazon Elastic Compute Cloud", "Networking", "Network Infrastructure", "PublicIPv4:IdleAddress"],
      [400, "Amazon Bedrock", "AI and Machine Learning", "Generative AI", "InputTokenCount"],
      [600, "Amazon Elastic Compute Cloud", "Compute", "Virtual Machines", "USE1-BoxUsage:m3.2xlarge"],
      [400, "Amazon SageMaker", "AI and Machine Learning", "Machine Learning", "USE1-Host:ml.p3.2xlarge endpoint inference"],
    ];
    for (const [cost, svc, cat, sub, desc] of items) {
      rows.push(focusRow({
        ...common, BilledCost: cost, EffectiveCost: cost, ServiceName: svc,
        ServiceCategory: cat, ServiceSubcategory: sub, ChargeDescription: desc, SkuId: desc,
      }));
    }
    if (perDay === 0) perDay = items.reduce((s, x) => s + x[0], 0);
  }
  const name = "focus-ahorro-agresivo.csv";
  writeFocus(name, rows);
  truth[name] = {
    format: "focus", distinctDays: 20,
    totalEffectiveCost: r2(perDay * 20), dailyCost: perDay,
    projectedMonthly: r2(perDay * 30),
    expect: { note: "Perfil diseñado para maximizar el ahorro agregado y comprobar el techo ahorro<=coste." },
  };
}

fs.writeFileSync(path.join(HERE, "ground-truth.json"), JSON.stringify(truth, null, 2));
console.log(`Fixtures escritos en ${OUT}`);
for (const [k, v] of Object.entries(truth)) {
  console.log(`  ${k.padEnd(34)} días=${String(v.distinctDays).padStart(2)} total=$${v.totalEffectiveCost ?? v.totalEffectiveCostUsageOnly} mensual=$${v.projectedMonthly}`);
}
