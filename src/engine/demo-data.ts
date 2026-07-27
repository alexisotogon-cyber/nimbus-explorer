import { NormalizedCostRecord, CloudProvider } from "./types";

/** Deterministic demo data. A selection is a reproducible FinOps case, not a dice roll. */

type Archetype = "startup-serverless" | "vms-legacy" | "data-heavy" | "containers" | "ai-startup";

export type DemoComplexity = "simple" | "medium" | "complex";
export type DemoVariant = "standard" | "ai" | "credits" | "commitments" | "data-quality" | "mixed";

export interface DemoConfig {
  provider?: CloudProvider;
  complexity?: DemoComplexity;
  variant?: DemoVariant;
}

const DEMO_START = "2026-06-25T00:00:00.000Z";
let randomSource = Math.random;

function seededRandom(seedText: string): () => number {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619);
  return () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function random(): number { return randomSource(); }
function getDemoStartDate(days: number): Date {
  const start = new Date(DEMO_START);
  start.setUTCDate(start.getUTCDate() - days);
  return start;
}

const ARCHETYPES: Archetype[] = ["startup-serverless", "vms-legacy", "data-heavy", "containers", "ai-startup"];

interface WastePattern {
  name: string;
  generate: (provider: CloudProvider, days: number, baseMultiplier: number) => NormalizedCostRecord[];
}

// ─── Waste Pattern Generators ─────────────────────────────────────────────────

const WASTE_PATTERNS: WastePattern[] = [
  {
    name: "unattached-storage",
    generate: (provider, days, mult) => generateBlockStorageWaste(provider, days, mult),
  },
  {
    name: "excessive-snapshots",
    generate: (provider, days, mult) => generateSnapshotWaste(provider, days, mult),
  },
  {
    name: "nat-overuse",
    generate: (provider, days, mult) => generateNATWaste(provider, days, mult),
  },
  {
    name: "idle-ips",
    generate: (provider, days, mult) => generateIdleIPWaste(provider, days, mult),
  },
  {
    name: "object-storage-no-tiering",
    generate: (provider, days, mult) => generateObjectStorageWaste(provider, days, mult),
  },
  {
    name: "legacy-gen",
    generate: (provider, days, mult) => generateLegacyGenWaste(provider, days, mult),
  },
  {
    name: "no-commitments",
    generate: (provider, days, mult) => generateNoCommitmentsWaste(provider, days, mult),
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/** Generate the same 30-day case every time for an identical configuration. */
export function generateDemoData(input?: CloudProvider | DemoConfig): NormalizedCostRecord[] {
  const config: Required<DemoConfig> = typeof input === "string"
    ? { provider: input, complexity: "medium", variant: "standard" }
    : { provider: input?.provider ?? "aws", complexity: input?.complexity ?? "medium", variant: input?.variant ?? "standard" };
  const previousRandom = randomSource;
  randomSource = seededRandom(`${config.provider}:${config.complexity}:${config.variant}:v1`);
  try {
  const provider = config.provider;
  const archetype: Archetype = config.variant === "ai"
    ? "ai-startup"
    : config.complexity === "simple" ? "startup-serverless"
    : config.complexity === "medium" ? "vms-legacy"
    : "data-heavy";
  const days = 30;
  const baseMultiplier = config.complexity === "simple" ? 0.8 : config.complexity === "medium" ? 1.2 : 1.8;

  // Base workload records based on archetype
  const baseRecords = generateBaseWorkload(provider, archetype, days, baseMultiplier);

  const patternCount = config.complexity === "simple" ? 2 : config.complexity === "medium" ? 4 : 6;
  const preferred = config.variant === "commitments"
    ? ["no-commitments", "legacy-gen", "nat-overuse"]
    : config.variant === "ai"
      ? ["no-commitments", "nat-overuse", "object-storage-no-tiering"]
      : WASTE_PATTERNS.map((pattern) => pattern.name);
  const selectedPatterns = preferred
    .map((name) => WASTE_PATTERNS.find((pattern) => pattern.name === name))
    .filter((pattern): pattern is WastePattern => Boolean(pattern))
    .concat(WASTE_PATTERNS.filter((pattern) => !preferred.includes(pattern.name)))
    .slice(0, patternCount);

  const wasteRecords: NormalizedCostRecord[] = [];
  for (const pattern of selectedPatterns) {
    const patternMult = 0.7 + random() * 0.6;
    wasteRecords.push(...pattern.generate(provider, days, patternMult));
  }
  const records = [...baseRecords, ...wasteRecords];
  if (config.variant === "credits" || config.variant === "mixed") {
    records.push(...generateCreditRecords(provider, days, baseMultiplier));
  }
  if (config.variant === "data-quality") {
    records.forEach((record, index) => { if (index % 5 === 0) record.resourceId = undefined; });
  }
  return records;
  } finally {
    randomSource = previousRandom;
  }
}

/**
 * Generate demo CSV as string for download — emitted in FOCUS 1.x format so
 * the file the user downloads can be re-uploaded and parsed correctly
 * (round-trips through parseFOCUSCSV). Previously this used an internal
 * column shape (NativeService/Cost/...) that no parser recognized, so
 * downloading the example and re-uploading it produced 0 records.
 */
export function generateDemoCSV(input?: CloudProvider | DemoConfig): string {
  const records = generateDemoData(input);
  const headers = [
    "ProviderName", "ServiceName", "ServiceCategory", "ServiceSubcategory", "ChargeDescription",
    "RegionId", "ChargePeriodStart", "BilledCost", "ConsumedQuantity",
    "ChargeCategory", "SubAccountId", "CommitmentDiscountId", "ResourceId", "ResourceType",
  ];

  const rows = records.map((r) => {
    const { serviceCategory, serviceSubcategory } = toFocusServiceCategory(r.category);
    return [
      focusProviderName(r.provider),
      r.nativeService,
      serviceCategory,
      serviceSubcategory,
      r.nativeUsageType,
      r.region,
      r.date,
      r.cost.toFixed(6),
      r.quantity.toFixed(2),
      "Usage",
      r.accountId || "",
      r.commitmentDiscountId || "",
      r.resourceId || "",
      r.resourceType || "",
    ].map(csvEscape).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

/** ProviderName string that parseFOCUSCSV's mapProvider() resolves back to the same provider. */
function focusProviderName(p: CloudProvider | "unknown"): string {
  if (p === "aws") return "Amazon Web Services";
  if (p === "azure") return "Microsoft Azure";
  if (p === "gcp") return "Google Cloud Platform";
  return "Unknown";
}

/**
 * Explicit CostCategory → (FOCUS ServiceCategory, ServiceSubcategory) so the
 * round-trip through parseFOCUSCSV reclassifies the row into the SAME category it
 * started as, using only values the spec allows.
 *
 * ServiceCategory has exactly 19 allowed values and "Serverless" is NOT one of
 * them — the previous version emitted it, so the demo CSV was non-conformant.
 * ServiceSubcategory (1.1+) carries the exact discriminator instead, which is why
 * ChargeDescription no longer needs synthetic prefixes ("Volume ", "Snapshot ",
 * "NAT Gateway ", "Elastic IP Address "): it stays the native usage type, which is
 * cleaner and doesn't interfere with rules that pattern-match on usage type.
 *
 * Caveat: NAT and idle-IP charges are both Networking / Network Infrastructure in
 * the spec — the subcategory can't distinguish them, so on re-parse those rows are
 * subdivided from the usage type text ("NatGateway-Bytes", "ElasticIP:IdleAddress"),
 * which the native usage types already contain.
 */
function toFocusServiceCategory(
  category: NormalizedCostRecord["category"]
): { serviceCategory: string; serviceSubcategory: string } {
  switch (category) {
    case "block-storage":
      return { serviceCategory: "Storage", serviceSubcategory: "Block Storage" };
    case "snapshot":
      return { serviceCategory: "Storage", serviceSubcategory: "Backup Storage" };
    case "object-storage":
      return { serviceCategory: "Storage", serviceSubcategory: "Object Storage" };
    case "nat":
      return { serviceCategory: "Networking", serviceSubcategory: "Network Infrastructure" };
    case "ip-address":
      return { serviceCategory: "Networking", serviceSubcategory: "Network Infrastructure" };
    case "network-egress":
      return { serviceCategory: "Networking", serviceSubcategory: "Network Connectivity" };
    case "database":
      return { serviceCategory: "Databases", serviceSubcategory: "Relational Databases" };
    case "ai-ml":
      return { serviceCategory: "AI and Machine Learning", serviceSubcategory: "Generative AI" };
    case "serverless":
      return { serviceCategory: "Compute", serviceSubcategory: "Serverless Compute" };
    case "compute":
      return { serviceCategory: "Compute", serviceSubcategory: "Virtual Machines" };
    default:
      return { serviceCategory: "Other", serviceSubcategory: "Other (Other)" };
  }
}

/** Quotes a CSV field if it contains a comma, quote, or newline. */
function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// ─── Base Workload Generators ─────────────────────────────────────────────────

function generateBaseWorkload(provider: CloudProvider, archetype: Archetype, days: number, mult: number): NormalizedCostRecord[] {
  const records: NormalizedCostRecord[] = [];
  const baseDate = getDemoStartDate(days);
  const region = getDefaultRegion(provider);
  const accountId = getDefaultAccountId(provider);

  for (let day = 0; day < days; day++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split("T")[0];

    switch (archetype) {
      case "startup-serverless":
        records.push(
          makeRecord(provider, "serverless", getServerlessService(provider), getServerlessUsage(provider), region, dateStr, (8 + jitter(3)) * mult, 500000, accountId),
          makeRecord(provider, "database", getDBService(provider), "ServerlessCapacity", region, dateStr, (5 + jitter(2)) * mult, 1000, accountId),
          makeRecord(provider, "object-storage", getObjService(provider), "StandardStorage", region, dateStr, (3 + jitter(1)) * mult, 50000, accountId),
        );
        break;
      case "vms-legacy":
        records.push(
          makeRecord(provider, "compute", getComputeService(provider), getComputeUsage(provider, "large"), region, dateStr, (15 + jitter(5)) * mult, 24, accountId),
          makeRecord(provider, "compute", getComputeService(provider), getComputeUsage(provider, "xlarge"), region, dateStr, (25 + jitter(8)) * mult, 24, accountId),
          makeRecord(provider, "database", getDBService(provider), "DBInstance-Large", region, dateStr, (7 + jitter(2)) * mult, 24, accountId),
        );
        break;
      case "data-heavy":
        records.push(
          makeRecord(provider, "object-storage", getObjService(provider), "StandardStorage", region, dateStr, (20 + jitter(5)) * mult, 500000000, accountId),
          makeRecord(provider, "database", getDBService(provider), "Storage-IO", region, dateStr, (12 + jitter(4)) * mult, 100000, accountId),
          makeRecord(provider, "network-egress", getComputeService(provider), "DataTransfer-Out", region, dateStr, (8 + jitter(3)) * mult, 2000, accountId),
        );
        break;
      case "containers":
        records.push(
          makeRecord(provider, "compute", getContainerService(provider), "ContainerCPU", region, dateStr, (10 + jitter(4)) * mult, 48, accountId),
          makeRecord(provider, "compute", getContainerService(provider), "ContainerMemory", region, dateStr, (6 + jitter(2)) * mult, 96, accountId),
          makeRecord(provider, "serverless", getServerlessService(provider), "Invocations", region, dateStr, (4 + jitter(2)) * mult, 200000, accountId),
        );
        break;

      case "ai-startup": {
        // High managed-LLM spend, 2 inference endpoints, GPU instances, no cost tags.
        // Provider-correct service names and usage types (no AWS names on Azure/GCP).
        const ai = getAIServiceNames(provider);
        records.push(
          makeRecord(provider, "ai-ml", ai.llmService, ai.llmInputUsage, region, dateStr, (25 + jitter(5)) * mult, 30000000, accountId),
          makeRecord(provider, "ai-ml", ai.llmService, ai.llmOutputUsage, region, dateStr, (15 + jitter(3)) * mult, 5000000, accountId),
          makeRecord(provider, "ai-ml", ai.endpointService, ai.endpointUsage, region, dateStr, (12 + jitter(2)) * mult, 24, accountId),
          makeRecord(provider, "ai-ml", ai.endpointService, ai.endpointUsage, region, dateStr, (12 + jitter(2)) * mult, 24, accountId),
          makeRecord(provider, "compute", ai.gpuComputeService, ai.gpuUsage, region, dateStr, (8 + jitter(3)) * mult, 24, accountId),
          makeRecord(provider, "serverless", getServerlessService(provider), getServerlessUsage(provider), region, dateStr, (3 + jitter(1)) * mult, 200000, accountId),
        );
        break;
      }
    }
  }
  return records;
}

// ─── Waste Pattern Implementations ───────────────────────────────────────────

function generateBlockStorageWaste(provider: CloudProvider, days: number, mult: number): NormalizedCostRecord[] {
  const records: NormalizedCostRecord[] = [];
  const baseDate = getDemoStartDate(days);
  const region = getDefaultRegion(provider);
  const accountId = getDefaultAccountId(provider);

  // Generate 3–5 synthetic "volumes" with individual resource IDs
  const volumeCount = 3 + Math.floor(random() * 3);
  const volumeIds = Array.from({ length: volumeCount }, (_, i) => ({
    id: provider === "aws" ? `vol-${Math.floor(random() * 0xffffffff).toString(36).slice(0, 8).padEnd(8, "0")}` :
        provider === "azure" ? `/subscriptions/sub-demo/resourceGroups/rg-demo/providers/Microsoft.Compute/disks/disk-demo-${i + 1}` :
        `projects/proj-demo/zones/${region}-a/disks/disk-demo-${i + 1}`,
    type: provider === "aws" ? "EBS Volume (gp3)" : provider === "azure" ? "Managed Disk (Premium SSD)" : "Persistent Disk (SSD)",
    costMult: 0.5 + random() * 1.5,
  }));

  for (let day = 0; day < days; day++) {
    const date = new Date(baseDate); date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split("T")[0];
    for (const vol of volumeIds) {
      const r = makeRecord(provider, "block-storage", getBlockService(provider), getBlockUsage(provider), region, dateStr, (5 + jitter(1)) * mult * vol.costMult / volumeCount, 2000 / volumeCount, accountId);
      r.resourceId = vol.id;
      r.resourceType = vol.type;
      records.push(r);
    }
  }
  return records;
}

function generateSnapshotWaste(provider: CloudProvider, days: number, mult: number): NormalizedCostRecord[] {
  const records: NormalizedCostRecord[] = [];
  const baseDate = getDemoStartDate(days);
  const region = getDefaultRegion(provider);
  const accountId = getDefaultAccountId(provider);

  for (let day = 0; day < days; day++) {
    const date = new Date(baseDate); date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split("T")[0];
    records.push(makeRecord(provider, "snapshot", getBlockService(provider), getSnapshotUsage(provider), region, dateStr, (8 + jitter(2)) * mult, 5000, accountId));
  }
  return records;
}

function generateNATWaste(provider: CloudProvider, days: number, mult: number): NormalizedCostRecord[] {
  const records: NormalizedCostRecord[] = [];
  const baseDate = getDemoStartDate(days);
  const region = getDefaultRegion(provider);
  const accountId = getDefaultAccountId(provider);

  for (let day = 0; day < days; day++) {
    const date = new Date(baseDate); date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split("T")[0];
    records.push(makeRecord(provider, "nat", getComputeService(provider), getNATUsage(provider), region, dateStr, (22 + jitter(5)) * mult, 500, accountId));
  }
  return records;
}

function generateIdleIPWaste(provider: CloudProvider, days: number, mult: number): NormalizedCostRecord[] {
  const records: NormalizedCostRecord[] = [];
  const baseDate = getDemoStartDate(days);
  const region = getDefaultRegion(provider);
  const accountId = getDefaultAccountId(provider);
  const ipCount = 2 + Math.floor(random() * 4);

  for (let day = 0; day < days; day++) {
    const date = new Date(baseDate); date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split("T")[0];
    // Verified hourly rates (2026-07-24): AWS public IPv4 0.005 (us-east-1, same
    // rate idle or in use), Azure Standard static IPv4 0.005 (eastus; the old
    // 0.004 was the retired Basic SKU), GCP reserved-but-unused static IP 0.01
    // (us-central1). Kept in sync with PRICING_TABLE so demo data is coherent.
    const hourlyRate = provider === "aws" ? 0.005 : provider === "azure" ? 0.005 : 0.01;
    records.push(makeRecord(provider, "ip-address", getComputeService(provider), getIPUsage(provider), region, dateStr, hourlyRate * 24 * ipCount * mult, ipCount * 24, accountId));
  }
  return records;
}

function generateObjectStorageWaste(provider: CloudProvider, days: number, mult: number): NormalizedCostRecord[] {
  const records: NormalizedCostRecord[] = [];
  const baseDate = getDemoStartDate(days);
  const region = getDefaultRegion(provider);
  const accountId = getDefaultAccountId(provider);

  for (let day = 0; day < days; day++) {
    const date = new Date(baseDate); date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split("T")[0];
    records.push(makeRecord(provider, "object-storage", getObjService(provider), getObjStorageUsage(provider), region, dateStr, (7 + jitter(2)) * mult, 10000000000, accountId));
  }
  return records;
}

function generateLegacyGenWaste(provider: CloudProvider, days: number, mult: number): NormalizedCostRecord[] {
  const records: NormalizedCostRecord[] = [];
  if (provider !== "aws") return records; // Only AWS has detectable legacy families from billing

  const baseDate = getDemoStartDate(days);
  const region = "us-east-1";
  const accountId = "123456789012";
  const legacyTypes = ["BoxUsage:t2.xlarge", "BoxUsage:m4.2xlarge"];
  const chosen = pickRandom(legacyTypes);

  for (let day = 0; day < days; day++) {
    const date = new Date(baseDate); date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split("T")[0];
    records.push(makeRecord("aws", "compute", "Amazon EC2", chosen, region, dateStr, (6 + jitter(2)) * mult, 24, accountId));
  }
  return records;
}

function generateNoCommitmentsWaste(provider: CloudProvider, days: number, mult: number): NormalizedCostRecord[] {
  const records: NormalizedCostRecord[] = [];
  const baseDate = getDemoStartDate(days);
  const region = getDefaultRegion(provider);
  const accountId = getDefaultAccountId(provider);

  for (let day = 0; day < days; day++) {
    const date = new Date(baseDate); date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split("T")[0];
    // High stable compute spend to trigger missing-commitment rule
    records.push(makeRecord(provider, "compute", getComputeService(provider), getComputeUsage(provider, "2xlarge"), region, dateStr, (20 + jitter(3)) * mult, 24, accountId));
  }
  return records;
}

// ─── Provider-Specific Service Names ─────────────────────────────────────────

function getComputeService(p: CloudProvider): string {
  return p === "aws" ? "Amazon EC2" : p === "azure" ? "Microsoft.Compute" : "Compute Engine";
}
function getServerlessService(p: CloudProvider): string {
  return p === "aws" ? "AWS Lambda" : p === "azure" ? "Microsoft.Web" : "Cloud Functions";
}
function getDBService(p: CloudProvider): string {
  return p === "aws" ? "Amazon RDS" : p === "azure" ? "Microsoft.Sql" : "Cloud SQL";
}
function getObjService(p: CloudProvider): string {
  return p === "aws" ? "Amazon S3" : p === "azure" ? "Microsoft.Storage" : "Cloud Storage";
}
function getBlockService(p: CloudProvider): string {
  return p === "aws" ? "Amazon EC2" : p === "azure" ? "Microsoft.Compute" : "Compute Engine";
}
function getContainerService(p: CloudProvider): string {
  return p === "aws" ? "Amazon ECS" : p === "azure" ? "Microsoft.ContainerService" : "Google Kubernetes Engine";
}

interface AIServiceNames {
  llmService: string;        // managed foundation-model / LLM service
  llmInputUsage: string;     // input token/character usage type
  llmOutputUsage: string;    // output token/character usage type
  endpointService: string;   // managed inference endpoint service
  endpointUsage: string;     // endpoint instance usage type
  gpuComputeService: string; // raw GPU compute service
  gpuUsage: string;          // GPU instance usage type
}

/**
 * Provider-correct AI/ML service and usage names for the ai-startup archetype.
 * AWS: Amazon Bedrock + Amazon SageMaker + EC2 g5.
 * Azure: Azure OpenAI Service + Azure AI Foundry model deployments + NC-series A100 VM.
 * GCP: Vertex AI (Model Garden) + Vertex AI online prediction endpoints + A2 GPU VM.
 */
function getAIServiceNames(p: CloudProvider): AIServiceNames {
  if (p === "azure") {
    return {
      llmService: "Azure OpenAI Service",
      llmInputUsage: "Azure OpenAI/gpt-4o Input Tokens",
      llmOutputUsage: "Azure OpenAI/gpt-4o Output Tokens",
      endpointService: "Azure AI Foundry model deployments",
      endpointUsage: "Managed Online Endpoint/Standard_NC24ads_A100_v4",
      gpuComputeService: "Microsoft.Compute",
      gpuUsage: "Virtual Machines/Standard_NC24ads_A100_v4",
    };
  }
  if (p === "gcp") {
    return {
      llmService: "Vertex AI",
      llmInputUsage: "Vertex AI/Gemini 1.5 Pro Input Characters",
      llmOutputUsage: "Vertex AI/Gemini 1.5 Pro Output Characters",
      endpointService: "Vertex AI",
      endpointUsage: "Online Prediction/a2-highgpu-1g",
      gpuComputeService: "Compute Engine",
      gpuUsage: "A2/a2-highgpu-1g",
    };
  }
  // aws (default)
  return {
    llmService: "Amazon Bedrock",
    llmInputUsage: "BDR-InputTokens-claude-sonnet",
    llmOutputUsage: "BDR-OutputTokens-claude-sonnet",
    endpointService: "Amazon SageMaker",
    endpointUsage: "SageMaker:ml.g5.2xlarge",
    gpuComputeService: "Amazon EC2",
    gpuUsage: "BoxUsage:g5.2xlarge",
  };
}

function getComputeUsage(p: CloudProvider, size: string): string {
  if (p === "aws") return `BoxUsage:m6i.${size}`;
  if (p === "azure") return `Virtual Machines/Standard_D4s_v5`;
  return `N2/n2-standard-4`;
}
function getServerlessUsage(p: CloudProvider): string {
  return p === "aws" ? "Lambda-GB-Second" : p === "azure" ? "FunctionExecution" : "Invocations";
}
function getBlockUsage(p: CloudProvider): string {
  return p === "aws" ? "EBS:VolumeUsage.gp3" : p === "azure" ? "Managed Disks/Premium SSD" : "Storage PD SSD";
}
function getSnapshotUsage(p: CloudProvider): string {
  return p === "aws" ? "EBS:SnapshotUsage" : p === "azure" ? "Managed Disks/Snapshot" : "Storage PD Snapshot";
}
function getNATUsage(p: CloudProvider): string {
  return p === "aws" ? "NatGateway-Bytes" : p === "azure" ? "NAT Gateway/DataProcessed" : "Cloud NAT/DataProcessed";
}
function getIPUsage(p: CloudProvider): string {
  return p === "aws" ? "ElasticIP:IdleAddress" : p === "azure" ? "Public IP/Static" : "External IP/Unused";
}
function getObjStorageUsage(p: CloudProvider): string {
  return p === "aws" ? "TimedStorage-ByteHrs" : p === "azure" ? "Blob Storage/Hot" : "Standard Storage";
}

function getDefaultRegion(p: CloudProvider): string {
  return p === "aws" ? "us-east-1" : p === "azure" ? "eastus" : "us-central1";
}
function getDefaultAccountId(p: CloudProvider): string {
  return p === "aws" ? "123456789012" : p === "azure" ? "sub-demo-001" : "project-demo-001";
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function makeRecord(
  provider: CloudProvider, category: NormalizedCostRecord["category"],
  nativeService: string, nativeUsageType: string, region: string,
  date: string, cost: number, quantity: number, accountId: string
): NormalizedCostRecord {
  return { provider, category, nativeService, nativeUsageType, region, date, cost: Math.max(0, cost), quantity, accountId, chargeType: "Usage" };
}

/** Credits are explicit negative billing rows, so reconciliation can demonstrate them. */
function generateCreditRecords(provider: CloudProvider, days: number, mult: number): NormalizedCostRecord[] {
  const baseDate = getDemoStartDate(days);
  const region = getDefaultRegion(provider);
  const accountId = getDefaultAccountId(provider);
  const rows: NormalizedCostRecord[] = [];
  for (let day = 0; day < days; day += 10) {
    const date = new Date(baseDate);
    date.setUTCDate(date.getUTCDate() + day);
    const record = makeRecord(provider, "compute", getComputeService(provider), "PromotionalCredit", region, date.toISOString().slice(0, 10), 8 * mult, 1, accountId);
    record.cost = -record.cost;
    record.chargeType = "Credit";
    rows.push(record);
  }
  return rows;
}

function jitter(range: number): number {
  return (random() - 0.5) * range * 2;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(random() * arr.length)];
}
