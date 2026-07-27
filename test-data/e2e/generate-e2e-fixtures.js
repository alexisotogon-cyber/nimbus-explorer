/* eslint-disable */
/**
 * Generador de fixtures E2E. Solo crea archivos dentro de test-data/e2e/.
 * No toca código de la aplicación.
 *
 * Ejecutar:  node test-data/e2e/generate-e2e-fixtures.js
 *
 * 21 días consecutivos (2026-06-01 .. 2026-06-21) para habilitar tendencias
 * (>=14 días) y hallazgos agregados (>=7 días).
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const OUT = __dirname;
const DAYS = 21;
const START = new Date(Date.UTC(2026, 5, 1)); // 2026-06-01

function day(i) {
  const d = new Date(START.getTime() + i * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Variación determinística ±6% + pico del 60% el día 15 (índice 14). */
function factor(i, seed) {
  const wob = 1 + 0.06 * Math.sin((i + seed) * 1.7);
  const spike = i === 14 ? 1.6 : 1;
  return wob * spike;
}

function r2(n) {
  return Math.round(n * 100) / 100;
}

function csv(headers, rows) {
  const esc = (v) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n") + "\n";
}

// ─── Catálogos de líneas por nube ────────────────────────────────────────────
// dailyCost = coste diario base en USD; qty = cantidad diaria base

const AWS_LINES = [
  { key: "ec2-m5", svc: "Amazon Elastic Compute Cloud", cat: "Compute", sub: "Virtual Machines",
    sku: "USE1-BoxUsage:m5.xlarge", desc: "$0.192 per On Demand Linux m5.xlarge Instance Hour (BoxUsage:m5.xlarge)",
    region: "us-east-1", rid: "arn:aws:ec2:us-east-1:123456789012:instance/i-0a1b2c3d4e5f60011", rtype: "Instance",
    dailyCost: 32.26, qty: 168, unit: "Hours" },
  { key: "ec2-t2", svc: "Amazon Elastic Compute Cloud", cat: "Compute", sub: "Virtual Machines",
    sku: "USE1-BoxUsage:t2.xlarge", desc: "$0.1856 per On Demand Linux t2.xlarge Instance Hour (BoxUsage:t2.xlarge)",
    region: "us-east-1", rid: "arn:aws:ec2:us-east-1:123456789012:instance/i-0a1b2c3d4e5f60022", rtype: "Instance",
    dailyCost: 13.36, qty: 72, unit: "Hours" },
  { key: "ec2-g5", svc: "Amazon Elastic Compute Cloud", cat: "Compute", sub: "Virtual Machines",
    sku: "USE1-BoxUsage:g5.2xlarge", desc: "$1.212 per On Demand Linux g5.2xlarge Instance Hour (BoxUsage:g5.2xlarge)",
    region: "us-east-1", rid: "arn:aws:ec2:us-east-1:123456789012:instance/i-0a1b2c3d4e5f60033", rtype: "Instance",
    dailyCost: 29.09, qty: 24, unit: "Hours" },
  { key: "ebs-unattached", svc: "Amazon Elastic Block Store", cat: "Storage", sub: "Block Storage",
    sku: "USE1-EBS:VolumeUsage.gp3", desc: "EBS gp3 volume storage (EBS:VolumeUsage.gp3) - unattached volume",
    region: "us-east-1", rid: "arn:aws:ec2:us-east-1:123456789012:volume/vol-0aa11bb22cc33dd44", rtype: "Volume",
    dailyCost: 4.0, qty: 500, unit: "GiB-Hours" },
  { key: "ebs-attached", svc: "Amazon Elastic Block Store", cat: "Storage", sub: "Block Storage",
    sku: "USE1-EBS:VolumeUsage.gp3", desc: "EBS gp3 volume storage (EBS:VolumeUsage.gp3)",
    region: "us-east-1", rid: "arn:aws:ec2:us-east-1:123456789012:volume/vol-0ee55ff66aa77bb88", rtype: "Volume",
    dailyCost: 2.4, qty: 300, unit: "GiB-Hours" },
  { key: "ebs-snap", svc: "Amazon Elastic Block Store", cat: "Storage", sub: "Backup Storage",
    sku: "USE1-EBS:SnapshotUsage", desc: "EBS snapshot storage (EBS:SnapshotUsage) - snapshots older than 90 days",
    region: "us-east-1", rid: "arn:aws:ec2:us-east-1:123456789012:snapshot/snap-0cc99dd88ee77ff66", rtype: "Snapshot",
    dailyCost: 3.1, qty: 1240, unit: "GiB-Hours" },
  { key: "eip", svc: "Amazon Elastic Compute Cloud", cat: "Networking", sub: "Network Infrastructure",
    sku: "USE1-PublicIPv4:IdleAddress", desc: "Elastic IP address not attached to a running instance (PublicIPv4:IdleAddress)",
    region: "us-east-1", rid: "arn:aws:ec2:us-east-1:123456789012:elastic-ip/eipalloc-0abc12de", rtype: "IP Address",
    dailyCost: 0.6, qty: 120, unit: "Hours" },
  { key: "nat", svc: "Amazon Virtual Private Cloud", cat: "Networking", sub: "Network Infrastructure",
    sku: "USE1-NatGateway-Bytes", desc: "NAT Gateway data processing charge (NatGateway-Bytes)",
    region: "us-east-1", rid: "arn:aws:ec2:us-east-1:123456789012:natgateway/nat-0f1e2d3c4b5a6978", rtype: "NAT Gateway",
    dailyCost: 5.4, qty: 120, unit: "GB" },
  { key: "s3", svc: "Amazon Simple Storage Service", cat: "Storage", sub: "Object Storage",
    sku: "USE1-TimedStorage-ByteHrs", desc: "S3 Standard storage, no lifecycle rule configured (TimedStorage-ByteHrs)",
    region: "us-east-1", rid: "arn:aws:s3:::acme-datalake-raw", rtype: "Bucket",
    dailyCost: 9.2, qty: 12000, unit: "GiB-Hours" },
  { key: "rds", svc: "Amazon Relational Database Service", cat: "Databases", sub: "Relational Databases",
    sku: "USE1-InstanceUsage:db.r6g.xlarge", desc: "PostgreSQL db.r6g.xlarge Multi-AZ instance hours (InstanceUsage:db.r6g.xlarge)",
    region: "us-east-1", rid: "arn:aws:rds:us-east-1:123456789012:db:acme-prod-pg", rtype: "DB Instance",
    dailyCost: 18.72, qty: 24, unit: "Hours" },
  { key: "bedrock", svc: "Amazon Bedrock", cat: "AI and Machine Learning", sub: "Generative AI",
    sku: "USE1-BedrockClaudeSonnet-InputTokens", desc: "Claude 3.5 Sonnet on-demand input tokens",
    region: "us-east-1", rid: "", rtype: "",
    dailyCost: 7.4, qty: 2450000, unit: "Tokens" },
  { key: "sagemaker", svc: "Amazon SageMaker", cat: "AI and Machine Learning", sub: "Machine Learning",
    sku: "USE1-Host:ml.m5.xlarge", desc: "SageMaker real-time inference endpoint instance hours (Host:ml.m5.xlarge)",
    region: "us-east-1", rid: "arn:aws:sagemaker:us-east-1:123456789012:endpoint/acme-scoring", rtype: "Endpoint",
    dailyCost: 6.53, qty: 24, unit: "Hours" },
  { key: "egress", svc: "Amazon CloudFront", cat: "Networking", sub: "Content Delivery",
    sku: "USE1-DataTransfer-Out-Bytes", desc: "Data transfer out to internet (DataTransfer-Out-Bytes)",
    region: "us-east-1", rid: "", rtype: "",
    dailyCost: 3.15, qty: 35, unit: "GB" },
];

const AZURE_LINES = [
  { key: "vm", svc: "Virtual Machines", cat: "Compute", sub: "Virtual Machines",
    sku: "Standard_D8s_v5", desc: "D8s v5 Compute Hours", region: "eastus",
    rid: "/subscriptions/8f1e9c2b-4d5a-4b6c-9e7f-1a2b3c4d5e6f/resourceGroups/rg-prod/providers/Microsoft.Compute/virtualMachines/vm-api-01",
    rtype: "Virtual Machine", dailyCost: 27.65, qty: 72, unit: "Hours" },
  { key: "vm-gpu", svc: "Virtual Machines", cat: "Compute", sub: "Virtual Machines",
    sku: "Standard_NC24ads_A100_v4", desc: "Standard_NC24ads_A100_v4 Compute Hours", region: "eastus",
    rid: "/subscriptions/8f1e9c2b-4d5a-4b6c-9e7f-1a2b3c4d5e6f/resourceGroups/rg-ml/providers/Microsoft.Compute/virtualMachines/vm-train-01",
    rtype: "Virtual Machine", dailyCost: 22.4, qty: 24, unit: "Hours" },
  { key: "disk-unattached", svc: "Storage", cat: "Storage", sub: "Block Storage",
    sku: "P20 Premium SSD Managed Disk", desc: "Premium SSD Managed Disk P20 - unattached disk", region: "eastus",
    rid: "/subscriptions/8f1e9c2b-4d5a-4b6c-9e7f-1a2b3c4d5e6f/resourceGroups/rg-prod/providers/Microsoft.Compute/disks/disk-orphan-01",
    rtype: "Disk", dailyCost: 3.7, qty: 24, unit: "Hours" },
  { key: "disk", svc: "Storage", cat: "Storage", sub: "Block Storage",
    sku: "P10 Premium SSD Managed Disk", desc: "Premium SSD Managed Disk P10", region: "eastus",
    rid: "/subscriptions/8f1e9c2b-4d5a-4b6c-9e7f-1a2b3c4d5e6f/resourceGroups/rg-prod/providers/Microsoft.Compute/disks/disk-api-01",
    rtype: "Disk", dailyCost: 1.9, qty: 24, unit: "Hours" },
  { key: "snap", svc: "Storage", cat: "Storage", sub: "Backup Storage",
    sku: "Standard Snapshots LRS", desc: "Managed disk snapshot storage older than 90 days", region: "eastus",
    rid: "/subscriptions/8f1e9c2b-4d5a-4b6c-9e7f-1a2b3c4d5e6f/resourceGroups/rg-prod/providers/Microsoft.Compute/snapshots/snap-2025-legacy",
    rtype: "Snapshot", dailyCost: 2.6, qty: 900, unit: "GB/Month" },
  { key: "pip", svc: "Virtual Network", cat: "Networking", sub: "Network Infrastructure",
    sku: "Standard Static Public IP", desc: "Standard static public IP address, not associated", region: "eastus",
    rid: "/subscriptions/8f1e9c2b-4d5a-4b6c-9e7f-1a2b3c4d5e6f/resourceGroups/rg-prod/providers/Microsoft.Network/publicIPAddresses/pip-legacy-01",
    rtype: "IP Address", dailyCost: 0.48, qty: 96, unit: "Hours" },
  { key: "nat", svc: "NAT Gateway", cat: "Networking", sub: "Network Infrastructure",
    sku: "NAT Gateway Data Processed", desc: "NAT gateway data processed", region: "eastus",
    rid: "/subscriptions/8f1e9c2b-4d5a-4b6c-9e7f-1a2b3c4d5e6f/resourceGroups/rg-prod/providers/Microsoft.Network/natGateways/nat-prod",
    rtype: "NAT Gateway", dailyCost: 4.85, qty: 110, unit: "GB" },
  { key: "blob", svc: "Storage", cat: "Storage", sub: "Object Storage",
    sku: "Hot LRS Data Stored", desc: "Hot LRS blob data stored, no lifecycle policy", region: "eastus",
    rid: "/subscriptions/8f1e9c2b-4d5a-4b6c-9e7f-1a2b3c4d5e6f/resourceGroups/rg-data/providers/Microsoft.Storage/storageAccounts/acmedatalake",
    rtype: "Storage Account", dailyCost: 7.6, qty: 11000, unit: "GB/Month" },
  { key: "sql", svc: "SQL Database", cat: "Databases", sub: "Relational Databases",
    sku: "GP_Gen5_8 vCore", desc: "SQL Database General Purpose Gen5 8 vCore", region: "eastus",
    rid: "/subscriptions/8f1e9c2b-4d5a-4b6c-9e7f-1a2b3c4d5e6f/resourceGroups/rg-prod/providers/Microsoft.Sql/servers/acme-sql/databases/orders",
    rtype: "SQL Database", dailyCost: 16.1, qty: 24, unit: "Hours" },
  { key: "openai", svc: "Azure OpenAI Service", cat: "AI and Machine Learning", sub: "Generative AI",
    sku: "gpt-4o-Input-Tokens-Global", desc: "Azure OpenAI gpt-4o global standard input tokens", region: "eastus",
    rid: "/subscriptions/8f1e9c2b-4d5a-4b6c-9e7f-1a2b3c4d5e6f/resourceGroups/rg-ml/providers/Microsoft.CognitiveServices/accounts/acme-openai",
    rtype: "Cognitive Service", dailyCost: 6.9, qty: 2760000, unit: "Tokens" },
  { key: "egress", svc: "Bandwidth", cat: "Networking", sub: "Content Delivery",
    sku: "Data Transfer Out - Zone 1", desc: "Inter-region and internet data transfer out", region: "eastus",
    rid: "", rtype: "", dailyCost: 2.4, qty: 30, unit: "GB" },
];

const GCP_LINES = [
  { key: "gce", svc: "Compute Engine", sku: "N2 Instance Core running in Americas",
    skuId: "2E27-4F75-95CD", region: "us-central1",
    rid: "//compute.googleapis.com/projects/acme-prod/zones/us-central1-a/instances/api-01",
    rtype: "Instance", dailyCost: 24.8, qty: 192, unit: "hour" },
  { key: "gce-ram", svc: "Compute Engine", sku: "N2 Instance Ram running in Americas",
    skuId: "8C1B-9E3A-11AA", region: "us-central1",
    rid: "//compute.googleapis.com/projects/acme-prod/zones/us-central1-a/instances/api-01",
    rtype: "Instance", dailyCost: 9.9, qty: 768, unit: "gibibyte hour" },
  { key: "gpu", svc: "Compute Engine", sku: "A2 Highgpu Instance Core running in Americas",
    skuId: "5A11-77BC-2D4E", region: "us-central1",
    rid: "//compute.googleapis.com/projects/acme-ml/zones/us-central1-b/instances/a2-highgpu-1g-train",
    rtype: "Instance", dailyCost: 21.6, qty: 24, unit: "hour" },
  { key: "pd-unattached", svc: "Compute Engine", sku: "Storage PD Capacity - unattached disk",
    skuId: "D973-5D65-BAB2", region: "us-central1",
    rid: "//compute.googleapis.com/projects/acme-prod/zones/us-central1-a/disks/pd-orphan-01",
    rtype: "Disk", dailyCost: 3.4, qty: 850, unit: "gibibyte month" },
  { key: "pd", svc: "Compute Engine", sku: "Storage PD Capacity",
    skuId: "D973-5D65-BAB2", region: "us-central1",
    rid: "//compute.googleapis.com/projects/acme-prod/zones/us-central1-a/disks/pd-api-01",
    rtype: "Disk", dailyCost: 2.1, qty: 525, unit: "gibibyte month" },
  { key: "snap", svc: "Compute Engine", sku: "Snapshot storage in Americas older than 90 days",
    skuId: "8A5D-B4C1-9E20", region: "us-central1",
    rid: "//compute.googleapis.com/projects/acme-prod/global/snapshots/snap-legacy-2025",
    rtype: "Snapshot", dailyCost: 2.4, qty: 960, unit: "gibibyte month" },
  { key: "ip", svc: "Compute Engine", sku: "Static Ip Charge - unused external IP address",
    skuId: "F1E5-4A2C-77DD", region: "us-central1",
    rid: "//compute.googleapis.com/projects/acme-prod/regions/us-central1/addresses/ip-legacy-01",
    rtype: "IP Address", dailyCost: 0.72, qty: 72, unit: "hour" },
  { key: "nat", svc: "Compute Engine", sku: "Cloud NAT Data Processing",
    skuId: "9B2F-1C3D-4E5F", region: "us-central1",
    rid: "//compute.googleapis.com/projects/acme-prod/regions/us-central1/routers/nat-prod",
    rtype: "NAT Gateway", dailyCost: 4.65, qty: 105, unit: "gibibyte" },
  { key: "gcs", svc: "Cloud Storage", sku: "Standard Storage US Multi-region, no Autoclass",
    skuId: "E5F0-6E58-3F19", region: "us", rid: "//storage.googleapis.com/acme-datalake-raw",
    rtype: "Bucket", dailyCost: 8.1, qty: 10500, unit: "gibibyte month" },
  { key: "sql", svc: "Cloud SQL", sku: "Cloud SQL for PostgreSQL: Zonal - 8 vCPU",
    skuId: "1C4A-5B6D-7E8F", region: "us-central1",
    rid: "//sqladmin.googleapis.com/projects/acme-prod/instances/pg-orders",
    rtype: "DB Instance", dailyCost: 14.3, qty: 24, unit: "hour" },
  { key: "vertex", svc: "Vertex AI", sku: "Gemini 1.5 Pro Input Text Tokens",
    skuId: "AB12-CD34-EF56", region: "us-central1", rid: "", rtype: "",
    dailyCost: 6.2, qty: 2100000, unit: "1k tokens" },
  { key: "egress", svc: "Networking", sku: "Network Internet Egress from Americas to Americas",
    skuId: "22EB-AAE8-FBCD", region: "us-central1", rid: "", rtype: "",
    dailyCost: 2.7, qty: 22, unit: "gibibyte" },
];

// ─── FOCUS (AWS / Azure) ─────────────────────────────────────────────────────

const FOCUS_HEADERS = [
  "ProviderName", "BillingAccountId", "BillingAccountName", "SubAccountId", "SubAccountName",
  "ServiceName", "ServiceCategory", "ServiceSubcategory", "SkuId", "ChargeDescription",
  "ChargeCategory", "BilledCost", "EffectiveCost", "ListCost", "BillingCurrency",
  "ChargePeriodStart", "ChargePeriodEnd", "RegionId", "ResourceId", "ResourceType",
  "ConsumedQuantity", "ConsumedUnit", "CommitmentDiscountId",
];

function focusRows(lines, meta, seed) {
  const rows = [];
  for (let i = 0; i < DAYS; i++) {
    const d = day(i);
    const next = day(i + 1);
    lines.forEach((l, li) => {
      const f = factor(i, seed + li);
      const cost = r2(l.dailyCost * f);
      rows.push({
        ProviderName: meta.provider,
        BillingAccountId: meta.billingAccountId,
        BillingAccountName: meta.billingAccountName,
        SubAccountId: meta.subAccountId,
        SubAccountName: meta.subAccountName,
        ServiceName: l.svc,
        ServiceCategory: l.cat,
        ServiceSubcategory: l.sub,
        SkuId: l.sku,
        ChargeDescription: l.desc,
        ChargeCategory: "Usage",
        BilledCost: cost,
        EffectiveCost: cost,
        ListCost: r2(cost * 1.08),
        BillingCurrency: "USD",
        ChargePeriodStart: d + "T00:00:00Z",
        ChargePeriodEnd: next + "T00:00:00Z",
        RegionId: l.region,
        ResourceId: l.rid,
        ResourceType: l.rtype,
        ConsumedQuantity: r2(l.qty * f),
        ConsumedUnit: l.unit,
        CommitmentDiscountId: "",
      });
    });
  }
  return rows;
}

const AWS_META = {
  provider: "AWS", billingAccountId: "123456789012", billingAccountName: "Acme Payer",
  subAccountId: "123456789012", subAccountName: "acme-prod",
};
const AZURE_META = {
  provider: "Microsoft", billingAccountId: "7c8d9e0f-1a2b-3c4d-5e6f-708192a3b4c5",
  billingAccountName: "Acme EA", subAccountId: "8f1e9c2b-4d5a-4b6c-9e7f-1a2b3c4d5e6f",
  subAccountName: "acme-prod-sub",
};

const awsFocus = focusRows(AWS_LINES, AWS_META, 0);
const azureFocus = focusRows(AZURE_LINES, AZURE_META, 3);

fs.writeFileSync(path.join(OUT, "focus-aws-only.csv"), csv(FOCUS_HEADERS, awsFocus));
fs.writeFileSync(path.join(OUT, "focus-azure-only.csv"), csv(FOCUS_HEADERS, azureFocus));

// ─── FOCUS GCP (sin ServiceCategory / ServiceSubcategory) ────────────────────

const GCP_FOCUS_HEADERS = [
  "ProviderName", "BillingAccountId", "SubAccountId", "ServiceName", "SkuId",
  "ChargeDescription", "ChargeCategory", "BilledCost", "EffectiveCost", "BillingCurrency",
  "ChargePeriodStart", "ChargePeriodEnd", "RegionId", "ResourceId",
  "ConsumedQuantity", "ConsumedUnit",
];

const gcpFocus = [];
for (let i = 0; i < DAYS; i++) {
  const d = day(i);
  const next = day(i + 1);
  GCP_LINES.forEach((l, li) => {
    const f = factor(i, 7 + li);
    const cost = r2(l.dailyCost * f);
    gcpFocus.push({
      ProviderName: "Google Cloud",
      BillingAccountId: "01ABCD-2EF345-6789GH",
      SubAccountId: "acme-prod",
      ServiceName: l.svc,
      SkuId: l.skuId,
      ChargeDescription: l.sku,
      ChargeCategory: "Usage",
      BilledCost: cost,
      EffectiveCost: cost,
      BillingCurrency: "USD",
      ChargePeriodStart: d + "T00:00:00Z",
      ChargePeriodEnd: next + "T00:00:00Z",
      RegionId: l.region,
      ResourceId: l.rid,
      ConsumedQuantity: r2(l.qty * f),
      ConsumedUnit: l.unit,
    });
  });
}
fs.writeFileSync(path.join(OUT, "focus-gcp-only.csv"), csv(GCP_FOCUS_HEADERS, gcpFocus));

// ─── FOCUS multinube: AWS + Azure + GCP en el mismo archivo ──────────────────
// Se usa el header completo; las filas GCP dejan ServiceCategory vacío
// (igual que el export real de Google).

const gcpAsFullFocus = [];
for (let i = 0; i < DAYS; i++) {
  const d = day(i);
  const next = day(i + 1);
  GCP_LINES.slice(0, 8).forEach((l, li) => {
    const f = factor(i, 11 + li);
    const cost = r2(l.dailyCost * 0.6 * f);
    gcpAsFullFocus.push({
      ProviderName: "Google Cloud",
      BillingAccountId: "01ABCD-2EF345-6789GH",
      BillingAccountName: "Acme GCP Billing",
      SubAccountId: "acme-prod",
      SubAccountName: "acme-prod",
      ServiceName: l.svc,
      ServiceCategory: "",
      ServiceSubcategory: "",
      SkuId: l.skuId,
      ChargeDescription: l.sku,
      ChargeCategory: "Usage",
      BilledCost: cost,
      EffectiveCost: cost,
      ListCost: r2(cost * 1.05),
      BillingCurrency: "USD",
      ChargePeriodStart: d + "T00:00:00Z",
      ChargePeriodEnd: next + "T00:00:00Z",
      RegionId: l.region,
      ResourceId: l.rid,
      ResourceType: l.rtype,
      ConsumedQuantity: r2(l.qty * f),
      ConsumedUnit: l.unit,
      CommitmentDiscountId: "",
    });
  });
}

const multi = [
  ...focusRows(AWS_LINES.slice(0, 10), AWS_META, 0),
  ...focusRows(AZURE_LINES.slice(0, 9), AZURE_META, 3),
  ...gcpAsFullFocus,
];
// Mezcla por fecha para que no queden bloques por nube
multi.sort((a, b) => (a.ChargePeriodStart + a.ProviderName).localeCompare(b.ChargePeriodStart + b.ProviderName));
fs.writeFileSync(path.join(OUT, "focus-multicloud.csv"), csv(FOCUS_HEADERS, multi));

// ─── FOCUS con compras de compromiso (Purchase, EffectiveCost = 0) ───────────

const commit = [];
const COMMIT_ID = "arn:aws:savingsplans::123456789012:savingsplan/1a2b3c4d-5e6f-7081-92a3-b4c5d6e7f809";
for (let i = 0; i < DAYS; i++) {
  const d = day(i);
  const next = day(i + 1);
  // Uso cubierto por el compromiso (EffectiveCost > 0, amortizado)
  AWS_LINES.slice(0, 3).forEach((l, li) => {
    const f = factor(i, 17 + li);
    const billed = 0; // ya pagado por la compra del compromiso
    const effective = r2(l.dailyCost * 0.68 * f);
    commit.push({
      ProviderName: "AWS", BillingAccountId: "123456789012", BillingAccountName: "Acme Payer",
      SubAccountId: "123456789012", SubAccountName: "acme-prod",
      ServiceName: l.svc, ServiceCategory: l.cat, ServiceSubcategory: l.sub, SkuId: l.sku,
      ChargeDescription: l.desc + " (covered by Savings Plan)", ChargeCategory: "Usage",
      BilledCost: billed, EffectiveCost: effective, ListCost: r2(l.dailyCost * f * 1.08),
      BillingCurrency: "USD", ChargePeriodStart: d + "T00:00:00Z", ChargePeriodEnd: next + "T00:00:00Z",
      RegionId: l.region, ResourceId: l.rid, ResourceType: l.rtype,
      ConsumedQuantity: r2(l.qty * f), ConsumedUnit: l.unit, CommitmentDiscountId: COMMIT_ID,
    });
  });
  // Resto del uso, sin cubrir
  AWS_LINES.slice(3).forEach((l, li) => {
    const f = factor(i, 23 + li);
    const cost = r2(l.dailyCost * f);
    commit.push({
      ProviderName: "AWS", BillingAccountId: "123456789012", BillingAccountName: "Acme Payer",
      SubAccountId: "123456789012", SubAccountName: "acme-prod",
      ServiceName: l.svc, ServiceCategory: l.cat, ServiceSubcategory: l.sub, SkuId: l.sku,
      ChargeDescription: l.desc, ChargeCategory: "Usage",
      BilledCost: cost, EffectiveCost: cost, ListCost: r2(cost * 1.08),
      BillingCurrency: "USD", ChargePeriodStart: d + "T00:00:00Z", ChargePeriodEnd: next + "T00:00:00Z",
      RegionId: l.region, ResourceId: l.rid, ResourceType: l.rtype,
      ConsumedQuantity: r2(l.qty * f), ConsumedUnit: l.unit, CommitmentDiscountId: "",
    });
  });
}
// 3 compras de compromiso: BilledCost > 0, EffectiveCost = 0
[[0, 8400], [7, 3600], [14, 5200]].forEach(([i, amount]) => {
  const d = day(i);
  const next = day(i + 1);
  commit.push({
    ProviderName: "AWS", BillingAccountId: "123456789012", BillingAccountName: "Acme Payer",
    SubAccountId: "123456789012", SubAccountName: "acme-prod",
    ServiceName: "Savings Plans for AWS Compute usage", ServiceCategory: "Compute",
    ServiceSubcategory: "Virtual Machines", SkuId: "ComputeSP:1yrNoUpfront",
    ChargeDescription: "Compute Savings Plan 1 year no upfront commitment purchase",
    ChargeCategory: "Purchase", BilledCost: amount, EffectiveCost: 0, ListCost: amount,
    BillingCurrency: "USD", ChargePeriodStart: d + "T00:00:00Z", ChargePeriodEnd: next + "T00:00:00Z",
    RegionId: "us-east-1", ResourceId: "", ResourceType: "",
    ConsumedQuantity: 1, ConsumedUnit: "Commitment", CommitmentDiscountId: COMMIT_ID,
  });
});
commit.sort((a, b) => a.ChargePeriodStart.localeCompare(b.ChargePeriodStart));
fs.writeFileSync(path.join(OUT, "focus-con-compras-compromiso.csv"), csv(FOCUS_HEADERS, commit));

// ─── AWS CUR nativo ──────────────────────────────────────────────────────────

const CUR_HEADERS = [
  "bill/BillingPeriodStartDate", "lineItem/UsageStartDate", "lineItem/UsageAccountId",
  "lineItem/LineItemType", "lineItem/ProductCode", "lineItem/UsageType",
  "lineItem/UsageAmount", "lineItem/UnblendedCost", "product/region", "lineItem/ResourceId",
];
const CUR_CODES = {
  "ec2-m5": "AmazonEC2", "ec2-t2": "AmazonEC2", "ec2-g5": "AmazonEC2",
  "ebs-unattached": "AmazonEC2", "ebs-attached": "AmazonEC2", "ebs-snap": "AmazonEC2",
  eip: "AmazonEC2", nat: "AmazonVPC", s3: "AmazonS3", rds: "AmazonRDS",
  bedrock: "AmazonBedrock", sagemaker: "AmazonSageMaker", egress: "AmazonCloudFront",
};
const CUR_USAGE = {
  "ec2-m5": "USE1-BoxUsage:m5.xlarge", "ec2-t2": "USE1-BoxUsage:t2.xlarge",
  "ec2-g5": "USE1-BoxUsage:g5.2xlarge", "ebs-unattached": "USE1-EBS:VolumeUsage.gp3",
  "ebs-attached": "USE1-EBS:VolumeUsage.gp3", "ebs-snap": "USE1-EBS:SnapshotUsage",
  eip: "USE1-PublicIPv4:IdleAddress", nat: "USE1-NatGateway-Bytes",
  s3: "USE1-TimedStorage-ByteHrs", rds: "USE1-InstanceUsage:db.r6g.xlarge",
  bedrock: "USE1-BedrockClaudeSonnet-InputTokens", sagemaker: "USE1-Host:ml.m5.xlarge",
  egress: "USE1-DataTransfer-Out-Bytes",
};
const curRows = [];
for (let i = 0; i < DAYS; i++) {
  AWS_LINES.forEach((l, li) => {
    const f = factor(i, li);
    curRows.push({
      "bill/BillingPeriodStartDate": "2026-06-01",
      "lineItem/UsageStartDate": day(i),
      "lineItem/UsageAccountId": "123456789012",
      "lineItem/LineItemType": "Usage",
      "lineItem/ProductCode": CUR_CODES[l.key],
      "lineItem/UsageType": CUR_USAGE[l.key],
      "lineItem/UsageAmount": r2(l.qty * f),
      "lineItem/UnblendedCost": r2(l.dailyCost * f),
      "product/region": l.region,
      "lineItem/ResourceId": l.rid,
    });
  });
}
fs.writeFileSync(path.join(OUT, "aws-cur-nativo.csv"), csv(CUR_HEADERS, curRows));

// ─── Azure Cost Management nativo ────────────────────────────────────────────

const AZ_HEADERS = [
  "Date", "SubscriptionId", "ResourceGroup", "ResourceId", "ResourceLocation",
  "ConsumedService", "MeterCategory", "MeterSubCategory", "MeterName",
  "Quantity", "CostInBillingCurrency", "BillingCurrency", "ChargeType",
];
const AZ_MAP = {
  vm: { cs: "Microsoft.Compute", mc: "Virtual Machines", ms: "Dv5 Series", mn: "D8s v5" },
  "vm-gpu": { cs: "Microsoft.Compute", mc: "Virtual Machines", ms: "NCADSA100v4 Series", mn: "Standard_NC24ads_A100_v4" },
  "disk-unattached": { cs: "Microsoft.Compute", mc: "Storage", ms: "Premium SSD Managed Disks", mn: "P20 LRS Disk" },
  disk: { cs: "Microsoft.Compute", mc: "Storage", ms: "Premium SSD Managed Disks", mn: "P10 LRS Disk" },
  snap: { cs: "Microsoft.Compute", mc: "Storage", ms: "Standard Page Blob Snapshots", mn: "LRS Snapshots" },
  pip: { cs: "Microsoft.Network", mc: "Virtual Network", ms: "Public IP Addresses", mn: "Standard Static Public IP" },
  nat: { cs: "Microsoft.Network", mc: "NAT Gateway", ms: "NAT Gateway", mn: "Data Processed" },
  blob: { cs: "Microsoft.Storage", mc: "Storage", ms: "General Block Blob v2 Hierarchical Namespace", mn: "Hot LRS Data Stored" },
  sql: { cs: "Microsoft.Sql", mc: "SQL Database", ms: "Single/Elastic Pool General Purpose - Compute Gen5", mn: "8 vCore" },
  openai: { cs: "Microsoft.CognitiveServices", mc: "Azure OpenAI", ms: "Language Models", mn: "gpt-4o-Input-Tokens-Global" },
  egress: { cs: "Microsoft.Network", mc: "Bandwidth", ms: "Inter-Region", mn: "Data Transfer Out - Zone 1" },
};
const azRows = [];
for (let i = 0; i < DAYS; i++) {
  AZURE_LINES.forEach((l, li) => {
    const f = factor(i, 3 + li);
    const m = AZ_MAP[l.key];
    azRows.push({
      Date: day(i),
      SubscriptionId: "8f1e9c2b-4d5a-4b6c-9e7f-1a2b3c4d5e6f",
      ResourceGroup: l.rid ? l.rid.split("/resourceGroups/")[1]?.split("/")[0] || "rg-prod" : "rg-prod",
      ResourceId: l.rid,
      ResourceLocation: l.region,
      ConsumedService: m.cs,
      MeterCategory: m.mc,
      MeterSubCategory: m.ms,
      MeterName: m.mn,
      Quantity: r2(l.qty * f),
      CostInBillingCurrency: r2(l.dailyCost * f),
      BillingCurrency: "USD",
      ChargeType: "Usage",
    });
  });
}
fs.writeFileSync(path.join(OUT, "azure-cost-management-nativo.csv"), csv(AZ_HEADERS, azRows));

// ─── GCP Cloud Billing nativo ────────────────────────────────────────────────

const GCP_HEADERS = [
  "billing_account_id", "project.id", "project.name", "service.description",
  "sku.description", "location.region", "usage_start_time", "usage_end_time",
  "cost", "currency", "usage_amount", "usage_unit",
];
const gcpRows = [];
for (let i = 0; i < DAYS; i++) {
  GCP_LINES.forEach((l, li) => {
    const f = factor(i, 7 + li);
    gcpRows.push({
      billing_account_id: "01ABCD-2EF345-6789GH",
      "project.id": l.rid.includes("acme-ml") ? "acme-ml" : "acme-prod",
      "project.name": l.rid.includes("acme-ml") ? "Acme ML" : "Acme Production",
      "service.description": l.svc,
      "sku.description": l.sku,
      "location.region": l.region,
      usage_start_time: day(i) + "T00:00:00Z",
      usage_end_time: day(i + 1) + "T00:00:00Z",
      cost: r2(l.dailyCost * f),
      currency: "USD",
      usage_amount: r2(l.qty * f),
      usage_unit: l.unit,
    });
  });
}
fs.writeFileSync(path.join(OUT, "gcp-billing-nativo.csv"), csv(GCP_HEADERS, gcpRows));

// ─── Excel a partir de focus-aws-only.csv ────────────────────────────────────

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(awsFocus, { header: FOCUS_HEADERS });
XLSX.utils.book_append_sheet(wb, ws, "FOCUS");
XLSX.writeFile(wb, path.join(OUT, "focus-aws-only.xlsx"));

// ─── Basura: no es un export de facturación ──────────────────────────────────

const junkHeaders = ["Fecha", "Concepto", "Importe", "Responsable"];
const junk = [];
const conceptos = [
  ["Comida equipo", "Ana Pérez"], ["Taxi cliente", "Luis Gómez"], ["Material oficina", "Ana Pérez"],
  ["Hotel congreso", "Marta Ruiz"], ["Licencia Figma", "Dev Team"], ["Café oficina", "Luis Gómez"],
];
for (let i = 0; i < 40; i++) {
  const c = conceptos[i % conceptos.length];
  junk.push({
    Fecha: day(i % DAYS),
    Concepto: c[0],
    Importe: r2(12 + (i * 7.3) % 240),
    Responsable: c[1],
  });
}
fs.writeFileSync(path.join(OUT, "basura-no-facturacion.csv"), csv(junkHeaders, junk));

// ─── Casos adversos ──────────────────────────────────────────────────────────

fs.writeFileSync(path.join(OUT, "adverso-vacio.csv"), "");
fs.writeFileSync(path.join(OUT, "adverso-solo-cabecera.csv"), csv(FOCUS_HEADERS, []));

const negRows = focusRows(AWS_LINES.slice(0, 4), AWS_META, 0).slice(0, 12);
negRows[3].BilledCost = -128.44;
negRows[3].EffectiveCost = -128.44;
negRows[3].ChargeDescription = "Credit - EC2 SLA refund";
negRows[3].ChargeCategory = "Credit";
fs.writeFileSync(path.join(OUT, "adverso-coste-negativo.csv"), csv(FOCUS_HEADERS, negRows));

const shuffled = focusRows(AWS_LINES.slice(0, 5), AWS_META, 0);
shuffled.sort((a, b) => (a.SkuId + b.ChargePeriodStart).localeCompare(b.SkuId + a.ChargePeriodStart));
shuffled.reverse();
fs.writeFileSync(path.join(OUT, "adverso-fechas-desordenadas.csv"), csv(FOCUS_HEADERS, shuffled));

const oneDay = awsFocus.filter((r) => r.ChargePeriodStart.startsWith(day(0)));
fs.writeFileSync(path.join(OUT, "adverso-un-solo-dia.csv"), csv(FOCUS_HEADERS, oneDay));

// ─── Resumen en consola ──────────────────────────────────────────────────────

function total(rows, field) {
  return r2(rows.reduce((s, r) => s + Number(r[field] || 0), 0));
}
console.log("focus-aws-only.csv           filas=%d  EffectiveCost=%s", awsFocus.length, total(awsFocus, "EffectiveCost"));
console.log("focus-azure-only.csv         filas=%d  EffectiveCost=%s", azureFocus.length, total(azureFocus, "EffectiveCost"));
console.log("focus-gcp-only.csv           filas=%d  EffectiveCost=%s", gcpFocus.length, total(gcpFocus, "EffectiveCost"));
console.log("focus-multicloud.csv         filas=%d  EffectiveCost=%s", multi.length, total(multi, "EffectiveCost"));
console.log("focus-con-compras-compromiso filas=%d  EffectiveCost=%s  BilledCost=%s",
  commit.length, total(commit, "EffectiveCost"), total(commit, "BilledCost"));
console.log("aws-cur-nativo.csv           filas=%d  UnblendedCost=%s", curRows.length, total(curRows, "lineItem/UnblendedCost"));
console.log("azure-...-nativo.csv         filas=%d  CostInBillingCurrency=%s", azRows.length, total(azRows, "CostInBillingCurrency"));
console.log("gcp-billing-nativo.csv       filas=%d  cost=%s", gcpRows.length, total(gcpRows, "cost"));
console.log("basura-no-facturacion.csv    filas=%d", junk.length);
console.log("adverso-un-solo-dia.csv      filas=%d  EffectiveCost=%s", oneDay.length, total(oneDay, "EffectiveCost"));
