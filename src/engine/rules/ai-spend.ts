import {
  NormalizedCostRecord,
  Finding,
  RuleDefinition,
  ArchitecturePillar,
  FindingAssumption,
  AiSpendSummary,
  deriveSavingsRange,
  calculatePriority,
  formatUSD,
} from "../types";

/**
 * AI Spend Rules — Phase 2
 *
 * Detects AI/ML spending patterns from:
 *   - category === "ai-ml" (FOCUS parser)
 *   - nativeService containing AI service names
 *   - nativeUsageType matching GPU EC2 instance patterns
 *
 * Integrity rules:
 *   - LLM never generates numbers; all figures from deterministic engine.
 *   - Sources verified with aws-documentation MCP before citing.
 *   - Irreversible commands marked with warnings.
 *   - GPU rules NEVER recommend terminate/stop.
 */

// ─── AI Service Detection ────────────────────────────────────────────────────

const AI_SERVICE_PATTERNS = [
  "bedrock", "sagemaker", "comprehend", "textract", "rekognition",
  "openai", "cognitive services", "ai foundry", "vertex ai",
  "translate", "polly", "transcribe", "forecast", "personalize",
  "lookout", "monitron", "panorama", "kendra", "lex",
];

// GPU usage-type patterns per provider. AWS EC2/SageMaker GPU families (p*/g*)
// show up as "BoxUsage:g5.2xlarge" etc. Azure GPU VM SKUs are the NC/ND/NV
// families ("Virtual Machines/Standard_NC24ads_A100_v4"). GCP GPU-only
// machine families are A2, A3 and G2 ("A2/a2-highgpu-1g").
const AWS_GPU_PATTERN = /BoxUsage:[pg]\d/i;
const AZURE_GPU_PATTERN = /standard_(nc|nd|nv)\d/i;
const GCP_GPU_PATTERN = /\b(a2|a3|g2)-(highgpu|megagpu|standard)/i;

function matchesGPUPattern(usageType: string): boolean {
  return AWS_GPU_PATTERN.test(usageType) || AZURE_GPU_PATTERN.test(usageType) || GCP_GPU_PATTERN.test(usageType);
}

export function isAIRecord(r: NormalizedCostRecord): boolean {
  if (r.category === "ai-ml") return true;
  const searchable = `${r.nativeService} ${r.nativeUsageType} ${r.serviceSubcategory || ""}`.toLowerCase();
  if (AI_SERVICE_PATTERNS.some((p) => searchable.includes(p))) return true;
  if (matchesGPUPattern(r.nativeUsageType)) return true;
  return false;
}

// Managed LLM / foundation-model spend across providers:
//   AWS Amazon Bedrock, Azure OpenAI Service, GCP Vertex AI — or any ai-ml record.
function isManagedLLMRecord(r: NormalizedCostRecord): boolean {
  const svc = `${r.nativeService} ${r.nativeUsageType} ${r.serviceSubcategory || ""}`.toLowerCase();
  return (
    svc.includes("bedrock") ||
    svc.includes("openai") ||
    svc.includes("vertex") ||
    r.category === "ai-ml"
  );
}

// Managed inference endpoints across providers:
//   AWS SageMaker endpoints, Azure AI Foundry / ML online endpoints, GCP Vertex AI online prediction.
function isManagedEndpoint(r: NormalizedCostRecord): boolean {
  const svc = r.nativeService.toLowerCase();
  const usage = r.nativeUsageType.toLowerCase();
  const isAwsSm = svc.includes("sagemaker") &&
    (usage.includes("endpoint") || usage.includes("inference") || usage.includes("instance"));
  const isAzureEndpoint = (svc.includes("foundry") || svc.includes("machine learning") || svc.includes("openai")) &&
    (usage.includes("endpoint") || usage.includes("online"));
  const isGcpEndpoint = svc.includes("vertex") &&
    (usage.includes("prediction") || usage.includes("endpoint"));
  return isAwsSm || isAzureEndpoint || isGcpEndpoint;
}

function isGPURecord(r: NormalizedCostRecord): boolean {
  return matchesGPUPattern(r.nativeUsageType);
}

// ─── Provider helpers ──────────────────────────────────────────────────────────

type Provider = "aws" | "azure" | "gcp";

function normProvider(p: NormalizedCostRecord["provider"]): Provider {
  return p !== "unknown" ? p : "aws";
}

/**
 * Provider-correct AI/ML cost-optimization pillar.
 * AWS keeps the rule-specific Well-Architected page; Azure/GCP use their
 * verified cost-optimization guidance (checklist / AI-ML cost perspective).
 */
function getAiPillar(provider: Provider, awsPillarText: string, awsUrl: string): ArchitecturePillar {
  if (provider === "azure") {
    return {
      framework: "Azure Well-Architected",
      pillar: "Cost Optimization",
      url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/checklist",
    };
  }
  if (provider === "gcp") {
    return {
      framework: "Google Cloud Architecture Framework",
      pillar: "Cost optimization for AI and ML",
      url: "https://cloud.google.com/architecture/framework/perspectives/ai-ml/cost-optimization",
    };
  }
  return { framework: "AWS Well-Architected", pillar: awsPillarText, url: awsUrl };
}

// Managed-LLM service display name per provider.
function llmServiceName(provider: Provider): string {
  return provider === "azure" ? "Azure OpenAI Service" : provider === "gcp" ? "Vertex AI" : "Amazon Bedrock";
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function sum(nums: number[]): number { return nums.reduce((a, b) => a + b, 0); }

function groupBy<T>(arr: T[], key: (x: T) => string): Record<string, T[]> {
  return arr.reduce((acc, x) => {
    const k = key(x); (acc[k] = acc[k] || []).push(x); return acc;
  }, {} as Record<string, T[]>);
}

function monthlyCostFrom(recs: NormalizedCostRecord[]): number {
  const totalCost = sum(recs.map((r) => r.cost));
  const days = new Set(recs.map((r) => r.date)).size || 1;
  const monthlySummary = recs.every(
    (record) =>
      record.source?.extensions?.analysisLevel === "summary"
      && record.source?.extensions?.granularity === "monthly"
  );
  if (monthlySummary) return totalCost / days;
  return (totalCost / days) * 30;
}

/**
 * Structured AI/ML spend summary — the dashboard's "Costos y oportunidades de
 * IA" block reads THIS, not a regex over aiVisibilityRule's finding title.
 * Same formula the finding uses (aiCost/days*30), computed independently so
 * a wording change to the finding's prose can never silently blank the KPI.
 */
export function buildAiSpendSummary(records: NormalizedCostRecord[]): AiSpendSummary | null {
  const aiRecords = records.filter(isAIRecord);
  if (aiRecords.length === 0) return null;

  const totalMonthly = monthlyCostFrom(records);
  const aiMonthly = monthlyCostFrom(aiRecords);
  const observedAiCost = sum(aiRecords.map((r) => r.cost));
  if (aiMonthly < 10) return null;

  const grossSpendPercentage = totalMonthly > 0 ? Math.round((aiMonthly / totalMonthly) * 1000) / 10 : 0;

  const attributedCost = sum(aiRecords.filter((r) => !!r.resourceId).map((r) => r.cost));
  const attributionCoveragePercentage =
    observedAiCost > 0 ? Math.round((attributedCost / observedAiCost) * 1000) / 10 : 0;

  const byProviderMap = groupBy(aiRecords, (r) => normProvider(r.provider));
  const byProvider = Object.entries(byProviderMap)
    .map(([provider, recs]) => ({ provider, costUSD: Math.round(monthlyCostFrom(recs) * 100) / 100 }))
    .sort((a, b) => b.costUSD - a.costUSD);

  const byServiceMap = groupBy(aiRecords, (r) => r.nativeService);
  const byService = Object.entries(byServiceMap)
    .map(([service, recs]) => ({ service, costUSD: Math.round(monthlyCostFrom(recs) * 100) / 100 }))
    .sort((a, b) => b.costUSD - a.costUSD);

  return {
    observedCostUSD: Math.round(observedAiCost * 100) / 100,
    projected30DayCostUSD: Math.round(aiMonthly * 100) / 100,
    grossSpendPercentage,
    attributionCoveragePercentage,
    byProvider,
    byService,
  };
}

// ─── RULE AI-VIS-001 — AI Spend Visibility ───────────────────────────────────

export const aiVisibilityRule: RuleDefinition = {
  id: "AI-VIS-001",
  name: "Visibilidad de gasto en inteligencia artificial (AI/ML)",
  category: "ai-visibility",
  description:
    "Resume todo el gasto en servicios de IA/ML: total, porcentaje de la factura y tendencia. " +
    "Es visibilidad — no implica ahorro directo.",
  reference:
    "State of FinOps 2026: el 98% de los equipos FinOps ya gestionan gasto de IA o lo gestionarán " +
    "en los próximos 12 meses, frente al 63% en 2025. Fuente: https://data.finops.org/ — " +
    "recomendaciones de atribución de costes en Bedrock: " +
    "https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-best-practices.html",
  evaluate: (records: NormalizedCostRecord[]): Finding[] => {
    const aiRecords = records.filter(isAIRecord);
    if (aiRecords.length === 0) return [];

    const totalCost = sum(records.map((r) => r.cost));
    const days = new Set(records.map((r) => r.date)).size || 1;
    const totalMonthly = (totalCost / days) * 30;

    const aiCost = sum(aiRecords.map((r) => r.cost));
    const aiMonthly = (aiCost / days) * 30;
    if (aiMonthly < 10) return [];

    const aiPct = totalMonthly > 0 ? (aiMonthly / totalMonthly) * 100 : 0;

    // Desglose por servicio
    const byService = groupBy(aiRecords, (r) => r.nativeService);
    const serviceBreakdown = Object.entries(byService)
      .map(([svc, recs]) => {
        const mc = monthlyCostFrom(recs);
        return { label: svc, monthlyCostUSD: Math.round(mc * 100) / 100 };
      })
      .sort((a, b) => b.monthlyCostUSD - a.monthlyCostUSD);
    const serviceLines = serviceBreakdown
      .map(({ label, monthlyCostUSD }) => `${label}: ${formatUSD(monthlyCostUSD)}/mes`)
      .join("; ");

    // Tendencia: primera vs segunda mitad del periodo
    const sortedDates = Array.from(new Set(aiRecords.map((r) => r.date))).sort();
    const mid = Math.floor(sortedDates.length / 2);
    const firstHalf = aiRecords.filter((r) => sortedDates.indexOf(r.date) < mid);
    const secondHalf = aiRecords.filter((r) => sortedDates.indexOf(r.date) >= mid);
    const firstCost = sum(firstHalf.map((r) => r.cost));
    const secondCost = sum(secondHalf.map((r) => r.cost));
    const trend = firstCost > 0
      ? ((secondCost - firstCost) / firstCost) * 100
      : 0;
    const trendStr = trend > 5
      ? `↑ ${trend.toFixed(1)}% vs primera mitad del periodo`
      : trend < -5
        ? `↓ ${Math.abs(trend).toFixed(1)}% vs primera mitad del periodo`
        : "estable en el periodo";

    const provider = normProvider(aiRecords[0].provider);
    // Provider-correct command to break down AI spend by service.
    const visibilityCommand =
      provider === "azure"
        ? {
            provider,
            tool: "cli" as const,
            label: "Listar cuentas de Azure OpenAI / Cognitive Services y revisar costos por servicio",
            snippet: [
              `# Cuentas de Azure OpenAI / Cognitive Services en la suscripción:`,
              `az cognitiveservices account list \\`,
              `  --query "[].{Name:name,Kind:kind,ResourceGroup:resourceGroup,Location:location}" \\`,
              `  --output table`,
              `# Desglose de costo por servicio: Portal → Cost Management + Billing → Cost analysis`,
              `# (agrupa por "Service name" y filtra por Azure OpenAI / Cognitive Services).`,
            ].join("\n"),
            isInvestigation: true,
            isIrreversible: false,
          }
        : provider === "gcp"
          ? {
              provider,
              tool: "cli" as const,
              label: "Listar endpoints y modelos de Vertex AI y revisar costos por servicio",
              snippet: [
                `# Endpoints de Vertex AI en la región:`,
                `gcloud ai endpoints list --region=${aiRecords[0].region || "us-central1"}`,
                `# Modelos registrados:`,
                `gcloud ai models list --region=${aiRecords[0].region || "us-central1"}`,
                `# Desglose de costo: Console → Billing → Reports (agrupa por Service),`,
                `# o consulta el export de Cloud Billing a BigQuery filtrando service.description = "Vertex AI".`,
              ].join("\n"),
              isInvestigation: true,
              isIrreversible: false,
            }
          : {
              provider,
              tool: "cli" as const,
              label: "Ver gasto por servicio IA (últimos 30 días)",
              snippet: [
                `aws ce get-cost-and-usage \\`,
                `  --time-period Start=$(date -v-30d +%Y-%m-%d),End=$(date +%Y-%m-%d) \\`,
                `  --granularity MONTHLY --metrics UnblendedCost \\`,
                `  --group-by Type=DIMENSION,Key=SERVICE \\`,
                `  --filter '{"Or":[{"Dimensions":{"Key":"SERVICE","Values":["Amazon Bedrock","Amazon SageMaker"]}},{"Tags":{"Key":"team","Values":["ai"]}}]}'`,
              ].join("\n"),
              isInvestigation: true,
              isIrreversible: false,
            };

    return [{
      id: "AI-VIS-SPEND",
      title: "Gasto en inteligencia artificial",
      description:
        `Gasto mensual en servicios de inteligencia artificial (AI/ML): ${formatUSD(aiMonthly)}/mes ` +
        `(${aiPct.toFixed(1)}% de tu factura total de ${formatUSD(totalMonthly)}/mes). ` +
        `Tendencia: ${trendStr}. Desglose: ${serviceLines}.`,
      provider: provider as "aws" | "azure" | "gcp",
      service: "AI/ML Services",
      category: "ai-visibility",
      savingsRange: { conservative: 0, moderate: 0, optimistic: 0 },
      estimatedMonthlySavingsUSD: 0,
      // Priority boosted so visibility appears near top regardless of $0 savings
      priorityScore: 85,
      calculationBreakdown:
        `Gasto IA total en el periodo: ${formatUSD(aiCost)}. ` +
        `Días de datos: ${days}. Proyección mensual: ${formatUSD(aiCost)} / ${days} × 30 = ${formatUSD(aiMonthly)}.`,
      effort: "bajo",
      risk: "bajo",
      confidence: "inferencia",
      reference: aiVisibilityRule.reference,
      pillar: getAiPillar(provider, "Cost Optimization — Visibility", "https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-best-practices.html"),
      remediation: {
        description: "Explora el gasto IA en más detalle desglosado por servicio en tu herramienta de costos nativa.",
        commands: [visibilityCommand],
        rollbackPlan: "No aplica: esta recomendación solo consulta datos y no realiza cambios.",
      },
      affectedResources: Object.keys(byService),
      topResources: [],
      assumptions: [],
      visibilitySummary: {
        monthlyCostUSD: Math.round(aiMonthly * 100) / 100,
        shareOfTotalPercentage: Math.round(aiPct * 10) / 10,
        trend: trend > 5 ? "up" : trend < -5 ? "down" : "stable",
        trendPercentage: Math.round(Math.abs(trend) * 10) / 10,
        breakdown: serviceBreakdown,
      },
    }];
  },
};

// ─── RULE AI-GPU-001 — GPU Always On ─────────────────────────────────────────

export const aiGpuReviewRule: RuleDefinition = {
  id: "AI-GPU-001",
  name: "Instancias GPU siempre encendidas",
  category: "ai-gpu-review",
  description:
    "GPU con gasto estable alto que requiere revisión de métricas reales de utilización. " +
    "La factura solo muestra horas encendidas, no carga real.",
  reference:
    // COST06-BP02, not COST07 (COST07 is about pricing models). The previous
    // cost_type_size_number_resources.html URL is a dead link (302 to landing page).
    "AWS Well-Architected — COST06-BP02: Select resource type, size, and number based on data. " +
    "https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_type_size_number_resources_data.html",
  evaluate: (records: NormalizedCostRecord[]): Finding[] => {
    const findings: Finding[] = [];
    const gpuRecs = records.filter(isGPURecord);
    if (gpuRecs.length === 0) return findings;

    const byType = groupBy(gpuRecs, (r) => r.nativeUsageType);

    for (const [usageType, recs] of Object.entries(byType)) {
      // Distinct days, not record count: a CUR emits several lines per day per GPU
      // instance, so `recs.length < 7` let 8 lines over 4 days through as if they
      // were 8 days of evidence. monthlyCostFrom() already divides by distinct
      // days, so the gate has to use the same unit or the two disagree.
      const uniqueDays = new Set(recs.map((r) => r.date)).size;
      if (uniqueDays < 7) continue;
      const monthlyCost = monthlyCostFrom(recs);
      if (monthlyCost < 100) continue;

      const cleanType = usageType.split(/[:/]/).pop() || usageType;
      const provider = normProvider(recs[0].provider);
      const region = recs[0].region || (provider === "azure" ? "eastus" : provider === "gcp" ? "us-central1" : "us-east-1");

      // Provider-correct GPU utilization check. AWS: CloudWatch metric
      // (existing, unchanged). Azure/GCP platform GPU metrics are not
      // exposed as reliably as AWS's — the defensible cross-cloud check is
      // guest-level nvidia-smi (works identically on any provider) plus,
      // for GCP, the documented Cloud Monitoring GPU utilization metric.
      const gpuCommands = provider === "azure"
        ? [{
            provider,
            tool: "cli" as const,
            label: "Conectarte a la VM y revisar utilización real de GPU (nvidia-smi)",
            snippet: [
              `# 1. Conéctate a la VM (Azure Bastion o SSH si tiene IP pública):`,
              `az vm show --name <VM_NAME> --resource-group <RESOURCE_GROUP> --query "id" -o tsv`,
              `# 2. Dentro de la VM, revisa utilización de GPU:`,
              `nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv -l 5`,
            ].join("\n"),
            isInvestigation: true,
            isIrreversible: false,
          }]
        : provider === "gcp"
          ? [{
              provider,
              tool: "cli" as const,
              label: "Ver métrica de utilización de GPU (Cloud Monitoring)",
              snippet: `gcloud monitoring metrics list \\\n  --filter='metric.type="compute.googleapis.com/instance/gpu/utilization"'`,
              isInvestigation: true,
              isIrreversible: false,
            }]
          : [{
              provider,
              tool: "cli" as const,
              label: "Ver utilización de GPU (CloudWatch — requiere GPU utilization metric)",
              snippet: [
                `# Inicio 7 días atrás (macOS / Linux):`,
                `START=$(date -v-7d +%Y-%m-%dT%H:%M:%S)              # macOS`,
                `# START=$(date -d "7 days ago" +%Y-%m-%dT%H:%M:%S)  # Linux (GNU)`,
                `aws cloudwatch get-metric-statistics \\`,
                `  --namespace AWS/SageMaker --metric-name GPUUtilization \\`,
                `  --start-time $START --end-time $(date +%Y-%m-%dT%H:%M:%S) \\`,
                `  --period 86400 --statistics Average Maximum \\`,
                `  --region ${region}`,
              ].join("\n"),
              isInvestigation: true,
              isIrreversible: false,
            }];

      findings.push({
        id: `AI-GPU-${usageType.replace(/[^a-zA-Z0-9]/g, "-")}`,
        title: `Revisar uso real de instancias GPU ${cleanType} (la factura no basta)`,
        description:
          `GPU ${cleanType} con gasto de ~${formatUSD(monthlyCost)}/mes. ` +
          `Solo métricas reales (GPU utilization, model throughput) pueden confirmar si están correctamente utilizadas.`,
        provider,
        service: recs[0].nativeService,
        category: "ai-gpu-review",
        savingsRange: { conservative: 0, moderate: 0, optimistic: Math.round(monthlyCost * 0.3 * 100) / 100 },
        estimatedMonthlySavingsUSD: 0,
        priorityScore: calculatePriority(monthlyCost * 0.05, "bajo", "bajo"),
        calculationBreakdown:
          `Costo mensual GPU: ${formatUSD(monthlyCost)}. ` +
          `No se puede estimar ahorro sin métricas de utilización. El optimista teórico (30%) se excluye del encabezado.`,
        effort: "bajo",
        risk: "bajo",
        confidence: "fuera-de-alcance-del-billing",
        reference: provider === "azure"
          ? "Azure Well-Architected — Cost Optimization: dimensiona recursos según datos de uso reales, no supuestos. " +
            "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/checklist"
          : provider === "gcp"
            ? "Google Cloud Architecture Framework — Cost optimization for AI and ML: dimensiona GPU según utilización real. " +
              "https://cloud.google.com/architecture/framework/perspectives/ai-ml/cost-optimization"
            : aiGpuReviewRule.reference,
        pillar: getAiPillar(provider, "Cost Optimization — COST06-BP02", "https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_type_size_number_resources_data.html"),
        remediation: {
          description: provider === "aws"
            ? "Revisa métricas de GPU en CloudWatch. NO terminar sin confirmar baja utilización."
            : "Revisa utilización real de GPU antes de decidir. NO terminar sin confirmar baja utilización.",
          commands: gpuCommands,
          rollbackPlan: "No aplica: esta recomendación solo consulta datos y no realiza cambios.",
        },
        affectedResources: [`${cleanType} (${region})`],
        topResources: [],
        assumptions: [],
      });
    }
    return findings;
  },
};

// ─── RULE AI-BDR-001 — Bedrock On-Demand Intensive ───────────────────────────

export const aiBedrockBatchRule: RuleDefinition = {
  id: "AI-BDR-001",
  name: "Inferencia On-Demand intensiva en Amazon Bedrock",
  category: "ai-batch-opportunity",
  description:
    "Gasto alto en Bedrock On-Demand que podría reducirse con Batch Inference " +
    "para cargas que toleran procesamiento asíncrono.",
  reference:
    "Amazon Bedrock Batch Inference: 50% de ahorro vs On-Demand, ventana de 24 horas. " +
    "Verificado: https://docs.aws.amazon.com/bedrock/latest/userguide/capacity-limits-cost-optimization.html",
  evaluate: (records: NormalizedCostRecord[]): Finding[] => {
    // Managed-endpoint spend is EXCLUDED from the batch base, for two reasons that
    // point the same way:
    //   · Double counting. isManagedEndpoint rows also satisfy isManagedLLMRecord
    //     (they are Vertex / OpenAI / ai-ml rows), so AI-SM-ENDPOINT and
    //     AI-BDR-BATCH were each claiming a percentage of the SAME dollars and the
    //     report's total came out above what is actually achievable.
    //   · Semantics. Batch Inference is a pricing mode for on-demand model
    //     invocations. Capacity already reserved on a provisioned endpoint is not
    //     billed per invocation, so no batch discount applies to it — there the
    //     lever is reducing the reserved capacity, which is exactly what
    //     AI-SM-ENDPOINT recommends.
    const llmRecs = records.filter((r) => isManagedLLMRecord(r) && !isManagedEndpoint(r));
    if (llmRecs.length === 0) return [];

    const monthlyCost = monthlyCostFrom(llmRecs);
    if (monthlyCost < 50) return [];

    const endpointRecords = records.filter(isManagedEndpoint);
    const excludedEndpointCost = endpointRecords.length > 0 ? monthlyCostFrom(endpointRecords) : 0;

    const provider = normProvider(llmRecs[0].provider);
    const svcName = llmServiceName(provider);
    const region = llmRecs[0].region || (provider === "azure" ? "eastus" : provider === "gcp" ? "us-central1" : "us-east-1");

    // Batch discount verified at 50% off On-Demand for all three providers.
    const batchConfig = {
      aws: {
        featureName: "Batch Inference",
        discountUrl: "https://docs.aws.amazon.com/bedrock/latest/userguide/capacity-limits-cost-optimization.html",
        reference:
          "Amazon Bedrock Batch Inference: 50% de ahorro vs On-Demand, ventana de 24 horas. " +
          "Verificado: https://docs.aws.amazon.com/bedrock/latest/userguide/capacity-limits-cost-optimization.html",
        commands: [
          {
            provider,
            tool: "cli" as const,
            label: "Ver invocaciones Bedrock recientes por modelo",
            snippet: [
              `aws ce get-cost-and-usage \\`,
              `  --time-period Start=$(date -v-30d +%Y-%m-%d),End=$(date +%Y-%m-%d) \\`,
              `  --granularity MONTHLY --metrics UnblendedCost \\`,
              `  --filter '{"Dimensions":{"Key":"SERVICE","Values":["Amazon Bedrock"]}}' \\`,
              `  --group-by Type=DIMENSION,Key=USAGE_TYPE`,
            ].join("\n"),
            isInvestigation: true,
            isIrreversible: false,
          },
          {
            provider,
            tool: "console" as const,
            label: "Crear trabajo Batch Inference en Bedrock",
            snippet:
              `Consola Bedrock → Inference → Batch inference → Create batch inference job\n` +
              `Carga el JSONL de prompts en S3. La respuesta también llega a S3.`,
            isInvestigation: false,
            isIrreversible: false,
          },
        ],
      },
      azure: {
        featureName: "Global Batch (Azure OpenAI)",
        discountUrl: "https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/batch",
        reference:
          "Azure OpenAI Global Batch: 50% de descuento vs Global Standard, ventana objetivo de 24 horas. " +
          "Verificado: https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/batch",
        commands: [
          {
            provider,
            tool: "cli" as const,
            label: "Listar deployments de Azure OpenAI (revisar modelos en Global Standard)",
            snippet: [
              `# Reemplaza <account> y <resource-group> por los de tu cuenta de Azure OpenAI:`,
              `az cognitiveservices account deployment list \\`,
              `  --name <account> --resource-group <resource-group> \\`,
              `  --query "[].{Name:name,Model:properties.model.name,Sku:sku.name}" \\`,
              `  --output table`,
            ].join("\n"),
            isInvestigation: true,
            isIrreversible: false,
          },
          {
            provider,
            tool: "console" as const,
            label: "Crear un deployment Global Batch en Azure AI Foundry",
            snippet:
              `Azure AI Foundry → Deployments → Deploy model → Deployment type: Global Batch.\n` +
              `Envía los prompts como archivo JSONL vía la Batch API. Ventana objetivo: 24 horas.`,
            isInvestigation: false,
            isIrreversible: false,
          },
        ],
      },
      gcp: {
        featureName: "Batch prediction (Vertex AI)",
        discountUrl: "https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/batch-prediction-gemini",
        reference:
          "Vertex AI batch prediction para Gemini: 50% de descuento vs las solicitudes en línea (online). " +
          "Verificado: https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/batch-prediction-gemini",
        commands: [
          {
            provider,
            tool: "cli" as const,
            label: "Listar modelos de Vertex AI disponibles",
            snippet: `gcloud ai models list --region=${region}`,
            isInvestigation: true,
            isIrreversible: false,
          },
          {
            provider,
            tool: "console" as const,
            label: "Crear un trabajo de batch prediction en Vertex AI",
            snippet:
              `Console → Vertex AI → Batch predictions → Create.\n` +
              `Proporciona la entrada en BigQuery o Cloud Storage (JSONL). ` +
              `La salida se escribe en el destino indicado.`,
            isInvestigation: false,
            isIrreversible: false,
          },
        ],
      },
    }[provider];

    const batchToleranceAssumption: FindingAssumption = {
      id: "batch-tolerance-pct",
      label: "% de cargas que toleran procesamiento por lotes (Batch Inference)",
      value: 0.30, min: 0.10, max: 0.60, step: 0.05,
      source: "Estimación editorial ajustable — depende de tu arquitectura. No hay benchmark público verificado.",
    };
    const batchDiscountAssumption: FindingAssumption = {
      id: "batch-discount",
      label: `% de ahorro de ${batchConfig.featureName} vs On-Demand`,
      value: 0.50, min: 0.50, max: 0.50, step: 0.01,
      source: `Verificado en docs oficiales: ${batchConfig.discountUrl}`,
    };

    const savingsRange = deriveSavingsRange(monthlyCost, [batchToleranceAssumption, batchDiscountAssumption]);

    return [{
      id: "AI-BDR-BATCH",
      title: `Usar ${batchConfig.featureName} para reducir costos de ${svcName}`,
      description:
        `Gasto en ${svcName} bajo demanda (On-Demand): ~${formatUSD(monthlyCost)}/mes. ` +
        `${batchConfig.featureName} ofrece 50% de ahorro para cargas que toleran hasta 24 horas de latencia.`,
      provider,
      service: svcName,
      category: "ai-batch-opportunity",
      savingsRange,
      estimatedMonthlySavingsUSD: savingsRange.moderate,
      priorityScore: calculatePriority(savingsRange.moderate, "medio", "bajo"),
      calculationBreakdown:
        `Costo ${svcName} mensual: ${formatUSD(monthlyCost)}. ` +
        `Supuestos: ${(batchToleranceAssumption.value * 100).toFixed(0)}% tolera lotes ` +
        `(${(batchToleranceAssumption.min * 100).toFixed(0)}%–${(batchToleranceAssumption.max * 100).toFixed(0)}%) ` +
        `× 50% descuento batch (verificado). Rango: ${formatUSD(savingsRange.conservative)}–${formatUSD(savingsRange.optimistic)}/mes.` +
        (excludedEndpointCost > 0
          ? ` Base excluida: ${formatUSD(excludedEndpointCost)}/mes de endpoints administrados, que se analizan en el hallazgo de capacidad reservada para no contar el mismo gasto dos veces.`
          : ""),
      effort: "medio",
      risk: "bajo",
      confidence: "inferencia",
      reference: batchConfig.reference,
      pillar: getAiPillar(provider, "Cost Optimization — Serverless and Managed Services", "https://docs.aws.amazon.com/bedrock/latest/userguide/capacity-limits-cost-optimization.html"),
      remediation: {
        description:
          `Identifica invocaciones candidatas a lote. ` +
          `Atención: ${batchConfig.featureName} tiene ventana de hasta 24 horas — no apto para inferencia en tiempo real.`,
        commands: batchConfig.commands,
        rollbackPlan: "Los trabajos batch no son destructivos — se pueden cancelar antes de completarse.",
      },
      affectedResources: [`${svcName} On-Demand`],
      topResources: [],
      assumptions: [batchToleranceAssumption, batchDiscountAssumption],
    }];
  },
};

// ─── RULE AI-SM-001 — SageMaker Endpoints 24/7 ───────────────────────────────

export const aiSageMakerEndpointRule: RuleDefinition = {
  id: "AI-SM-001",
  name: "Endpoints de inferencia administrados siempre activos",
  category: "ai-endpoint-idle",
  description:
    "Gasto estable en endpoints de inferencia administrados (SageMaker, Azure ML/OpenAI, Vertex AI) " +
    "que podrían reducir capacidad reservada para tráfico intermitente.",
  reference:
    "Amazon SageMaker Serverless Inference — paga solo por invocaciones, sin costo de endpoint inactivo. " +
    "https://docs.aws.amazon.com/sagemaker/latest/dg/serverless-endpoints.html",
  evaluate: (records: NormalizedCostRecord[]): Finding[] => {
    const endpointRecs = records.filter(isManagedEndpoint);
    if (endpointRecs.length === 0) return [];

    const monthlyCost = monthlyCostFrom(endpointRecs);
    if (monthlyCost < 50) return [];

    const serverlessSavingsAssumption: FindingAssumption = {
      id: "serverless-inference-savings",
      label: "% de ahorro al reducir capacidad reservada (tráfico intermitente)",
      value: 0.40, min: 0.20, max: 0.70, step: 0.05,
      source: "Estimación editorial ajustable — depende de la frecuencia de invocaciones. No hay benchmark público verificado.",
    };

    const savingsRange = deriveSavingsRange(monthlyCost, [serverlessSavingsAssumption]);
    const provider = normProvider(endpointRecs[0].provider);
    const region = endpointRecs[0].region || (provider === "azure" ? "eastus" : provider === "gcp" ? "us-central1" : "us-east-1");

    // Provider-correct managed-endpoint config. AWS SageMaker has a true
    // serverless (scale-to-zero, pay-per-invocation) mode. Azure ML online
    // endpoints and Vertex AI online prediction do NOT — their equivalent
    // lever is reducing minimum replica/node count or consolidating
    // deployments; Azure OpenAI's reserved-capacity analog is Provisioned
    // Throughput Units (PTU), reviewed against Standard/PayGo pricing.
    const endpointConfig = {
      aws: {
        serviceName: "Amazon SageMaker",
        title: "Endpoints SageMaker que podrían usar Serverless Inference (paga por invocación)",
        description:
          `Gasto en endpoints SageMaker: ~${formatUSD(monthlyCost)}/mes. ` +
          `Serverless Inference elimina el costo de endpoints inactivos.`,
        remediationDescription: "Lista tus endpoints activos y evalúa la migración a Serverless Inference para los de tráfico bajo.",
        resourceLabel: "Amazon SageMaker Endpoints",
        pillarText: "Cost Optimization — Managed Services",
        pillarUrl: "https://docs.aws.amazon.com/sagemaker/latest/dg/serverless-endpoints.html",
        reference:
          "Amazon SageMaker Serverless Inference — paga solo por invocaciones, sin costo de endpoint inactivo. " +
          "https://docs.aws.amazon.com/sagemaker/latest/dg/serverless-endpoints.html",
        rollbackPlan: "Restaurar endpoint real-time si Serverless Inference no cumple los requisitos de latencia.",
        commands: [
          {
            provider,
            tool: "cli" as const,
            label: "Listar endpoints SageMaker en servicio",
            snippet: `aws sagemaker list-endpoints --status-equals InService \\\n  --query "Endpoints[*].{Name:EndpointName,Config:EndpointConfigName,Created:CreationTime}" \\\n  --output table`,
            isInvestigation: true,
            isIrreversible: false,
          },
          {
            provider,
            tool: "cli" as const,
            label: "Ver invocaciones del endpoint (últimos 7 días)",
            snippet: [
              `START=$(date -v-7d +%Y-%m-%dT%H:%M:%S)              # macOS`,
              `# START=$(date -d "7 days ago" +%Y-%m-%dT%H:%M:%S)  # Linux (GNU)`,
              `aws cloudwatch get-metric-statistics \\`,
              `  --namespace AWS/SageMaker --metric-name Invocations \\`,
              `  --dimensions Name=EndpointName,Value=<ENDPOINT_NAME> \\`,
              `  --start-time $START --end-time $(date +%Y-%m-%dT%H:%M:%S) \\`,
              `  --period 3600 --statistics Sum`,
            ].join("\n"),
            isInvestigation: true,
            isIrreversible: false,
          },
        ],
      },
      azure: {
        serviceName: "Azure ML / Azure OpenAI — endpoints administrados",
        title: "Endpoints administrados de Azure (ML / OpenAI) con capacidad reservada que podría reducirse",
        description:
          `Gasto en endpoints administrados (Azure ML online endpoints o deployments Azure OpenAI con ` +
          `Provisioned Throughput): ~${formatUSD(monthlyCost)}/mes. A diferencia de AWS, Azure no ofrece ` +
          `un modo serverless para estos endpoints — el ahorro viene de reducir instancias mínimas o ` +
          `volver a Standard/PayGo si el PTU está infrautilizado.`,
        remediationDescription:
          "Lista tus endpoints/deployments y revisa tráfico real. Para Azure ML, reduce min_instances o consolida " +
          "deployments; para Azure OpenAI, evalúa si un PTU infrautilizado conviene más como Standard/PayGo.",
        resourceLabel: "Azure ML / Azure OpenAI — Online Endpoints",
        pillarText: "Cost Optimization",
        pillarUrl: "https://learn.microsoft.com/en-us/azure/machine-learning/how-to-autoscale-endpoints",
        reference:
          "Azure ML online endpoints — autoscaling y réplicas mínimas. Azure OpenAI Provisioned Throughput vs Standard. " +
          "Verificado: https://learn.microsoft.com/en-us/azure/machine-learning/how-to-autoscale-endpoints",
        rollbackPlan: "Restaurar el número de réplicas mínimas (min_instances) o el PTU original si la latencia se degrada.",
        commands: [
          {
            provider,
            tool: "cli" as const,
            label: "Listar online endpoints de Azure ML",
            snippet: `az ml online-endpoint list \\\n  --resource-group <RESOURCE_GROUP> --workspace-name <WORKSPACE> \\\n  --query "[].{Name:name,State:provisioningState}" \\\n  --output table`,
            isInvestigation: true,
            isIrreversible: false,
          },
          {
            provider,
            tool: "console" as const,
            label: "Revisar tráfico e invocaciones del endpoint",
            snippet:
              `Azure Portal → tu recurso de Azure ML u Azure OpenAI → Metrics.\n` +
              `Revisa "Requests"/"Total Calls" en el periodo — tráfico bajo o intermitente es candidato a ` +
              `reducir réplicas mínimas o revisar el PTU asignado.`,
            isInvestigation: true,
            isIrreversible: false,
          },
        ],
      },
      gcp: {
        serviceName: "Vertex AI — Online Prediction",
        title: "Endpoints de Vertex AI Online Prediction que podrían reducir nodos mínimos",
        description:
          `Gasto en endpoints de Vertex AI Online Prediction: ~${formatUSD(monthlyCost)}/mes. ` +
          `Los nodos quedan asignados mientras el endpoint está desplegado — reducir minReplicaCount ` +
          `o consolidar modelos de bajo tráfico en un solo endpoint reduce el costo de capacidad ociosa.`,
        remediationDescription: "Lista tus endpoints y revisa el tráfico desplegado antes de reducir minReplicaCount.",
        resourceLabel: "Vertex AI — Online Prediction Endpoints",
        pillarText: "Cost optimization for AI and ML",
        pillarUrl: "https://cloud.google.com/vertex-ai/docs/predictions/configure-compute",
        reference:
          "Vertex AI Online Prediction — configuración de nodos mínimos/máximos por deployment. " +
          "Verificado: https://cloud.google.com/vertex-ai/docs/predictions/configure-compute",
        rollbackPlan: "Restaurar el minReplicaCount original en el deployment si la latencia se degrada.",
        commands: [
          {
            provider,
            tool: "cli" as const,
            label: "Listar endpoints de Vertex AI",
            snippet: `gcloud ai endpoints list --region=${region}`,
            isInvestigation: true,
            isIrreversible: false,
          },
          {
            provider,
            tool: "cli" as const,
            label: "Ver detalle y modelos desplegados del endpoint",
            snippet: `gcloud ai endpoints describe <ENDPOINT_ID> --region=${region}`,
            isInvestigation: true,
            isIrreversible: false,
          },
        ],
      },
    }[provider];

    return [{
      id: "AI-SM-ENDPOINT",
      title: endpointConfig.title,
      description: endpointConfig.description,
      provider,
      service: endpointConfig.serviceName,
      category: "ai-endpoint-idle",
      savingsRange,
      estimatedMonthlySavingsUSD: savingsRange.moderate,
      priorityScore: calculatePriority(savingsRange.moderate, "medio", "bajo"),
      calculationBreakdown:
        `Costo endpoints (${endpointConfig.serviceName}) mensual: ${formatUSD(monthlyCost)}. ` +
        `Supuesto: ${(serverlessSavingsAssumption.value * 100).toFixed(0)}% ahorro ` +
        `(${(serverlessSavingsAssumption.min * 100).toFixed(0)}%–${(serverlessSavingsAssumption.max * 100).toFixed(0)}%). ` +
        `Rango: ${formatUSD(savingsRange.conservative)}–${formatUSD(savingsRange.optimistic)}/mes.`,
      effort: "medio",
      risk: "medio",
      confidence: "inferencia",
      reference: endpointConfig.reference,
      pillar: getAiPillar(provider, endpointConfig.pillarText, endpointConfig.pillarUrl),
      remediation: {
        description: endpointConfig.remediationDescription,
        commands: endpointConfig.commands,
        rollbackPlan: endpointConfig.rollbackPlan,
      },
      affectedResources: [endpointConfig.resourceLabel],
      topResources: [],
      assumptions: [serverlessSavingsAssumption],
    }];
  },
};

// ─── RULE AI-TAG-001 — AI Cost Attribution ────────────────────────────────────

export const aiTaggingRule: RuleDefinition = {
  id: "AI-TAG-001",
  name: "Gasto IA difícil de atribuir por equipo o proyecto",
  category: "ai-cost-attribution",
  description:
    "Hay gasto IA pero no se detectan perfiles de inferencia ni tags de asignación de costos. " +
    "Sin esta información, es imposible saber qué equipo o proyecto consume qué.",
  reference:
    "Amazon Bedrock application inference profiles — permiten asignar costos por equipo/proyecto. " +
    "Verificado: https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-application-inference-profiles.html",
  evaluate: (records: NormalizedCostRecord[]): Finding[] => {
    const aiRecords = records.filter(isAIRecord);
    if (aiRecords.length === 0) return [];

    const monthlyCost = monthlyCostFrom(aiRecords);
    if (monthlyCost < 10) return [];

    // Check for FOCUS commitment discount IDs as proxy for some cost governance
    const hasAttribution = aiRecords.some((r) => !!r.commitmentDiscountId);
    if (hasAttribution) return [];

    const provider = normProvider(aiRecords[0].provider);
    // GCP native billing carries project.id in accountId. That is real partial
    // attribution, even if team/application labels are unavailable in the flat
    // export. Do not claim that no allocation dimension exists.
    if (provider === "gcp" && aiRecords.every((r) => !!r.accountId)) return [];

    // Provider-correct cost-attribution mechanism. AWS: Bedrock application
    // inference profiles. Azure: resource tags read through Cost Management
    // (Azure OpenAI/Cognitive Services don't have an inference-profile
    // equivalent — tagging is the native attribution mechanism). GCP: labels
    // read through Cloud Billing export to BigQuery.
    const attributionConfig = {
      aws: {
        remediationDescription:
          "Crea application inference profiles en Bedrock para asignar costos por equipo/proyecto. " +
          "Para SageMaker, usa tags de asignación de costos.",
        reference:
          "Amazon Bedrock application inference profiles — permiten asignar costos por equipo/proyecto. " +
          "Verificado: https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-application-inference-profiles.html",
        pillarUrl: "https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-application-inference-profiles.html",
        rollbackPlan: "Eliminar el profile si no se usa. Los perfiles no afectan el funcionamiento de modelos existentes.",
        commands: [
          {
            provider,
            tool: "cli" as const,
            label: "Listar application inference profiles existentes (Bedrock)",
            snippet: `aws bedrock list-inference-profiles \\\n  --query "inferenceProfileSummaries[*].{Name:inferenceProfileName,Status:status,Type:type}" \\\n  --output table`,
            isInvestigation: true,
            isIrreversible: false,
          },
          {
            provider,
            tool: "cli" as const,
            label: "Crear un application inference profile para un equipo",
            snippet: [
              `aws bedrock create-inference-profile \\`,
              `  --inference-profile-name "team-a-claude" \\`,
              `  --description "Inference profile for Team A" \\`,
              `  --model-source '{"copyFrom": "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0"}' \\`,
              `  --tags Key=team,Value=team-a Key=project,Value=my-app`,
            ].join("\n"),
            isInvestigation: false,
            isIrreversible: false,
          },
        ],
      },
      azure: {
        remediationDescription:
          "Azure OpenAI / Cognitive Services no tienen perfiles de inferencia — la atribución se hace con tags " +
          "de recurso, leídos luego en Cost Management + Billing agrupando por tag.",
        reference:
          "Azure Cost Management — agrupar y filtrar costos por tags de recurso. " +
          "Verificado: https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/cost-mgt-alerts-monitor-usage-spending",
        pillarUrl: "https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/cost-mgt-alerts-monitor-usage-spending",
        rollbackPlan: "Quitar el tag si se asignó por error. Los tags no afectan el funcionamiento del recurso.",
        commands: [
          {
            provider,
            tool: "cli" as const,
            label: "Listar cuentas de Azure OpenAI / Cognitive Services sin tags de equipo/proyecto",
            snippet: `az cognitiveservices account list \\\n  --query "[?tags.team==null].{Name:name,ResourceGroup:resourceGroup}" \\\n  --output table`,
            isInvestigation: true,
            isIrreversible: false,
          },
          {
            provider,
            tool: "cli" as const,
            label: "Etiquetar el recurso con equipo/proyecto",
            snippet: `az resource tag --tags team=team-a project=my-app \\\n  --name <ACCOUNT_NAME> --resource-group <RESOURCE_GROUP> \\\n  --resource-type "Microsoft.CognitiveServices/accounts"`,
            isInvestigation: false,
            isIrreversible: false,
          },
        ],
      },
      gcp: {
        remediationDescription:
          "Vertex AI no tiene perfiles de inferencia — la atribución se hace con labels de recurso, leídos " +
          "luego en el export de Cloud Billing a BigQuery agrupando por label.",
        reference:
          "GCP — Labels para cost allocation, vía export de Cloud Billing a BigQuery. " +
          "Verificado: https://cloud.google.com/billing/docs/how-to/bq-examples",
        pillarUrl: "https://cloud.google.com/billing/docs/how-to/bq-examples",
        rollbackPlan: "Quitar el label si se asignó por error. Los labels no afectan el funcionamiento del recurso.",
        commands: [
          {
            provider,
            tool: "cli" as const,
            label: "Listar endpoints/modelos de Vertex AI sin label de equipo",
            snippet: `gcloud ai endpoints list --region=${aiRecords[0].region || "us-central1"} \\\n  --filter="NOT labels.team:*"`,
            isInvestigation: true,
            isIrreversible: false,
          },
          {
            provider,
            tool: "cli" as const,
            label: "Etiquetar el endpoint con equipo/proyecto",
            snippet: `gcloud ai endpoints update <ENDPOINT_ID> --region=${aiRecords[0].region || "us-central1"} \\\n  --update-labels=team=team-a,project=my-app`,
            isInvestigation: false,
            isIrreversible: false,
          },
        ],
      },
    }[provider];

    return [{
      id: "AI-TAG-ATTRIBUTION",
      title: "Gasto en IA sin asignación visible por equipo o proyecto",
      description:
        `Hay ${formatUSD(monthlyCost)}/mes en servicios de IA pero no se detectan ` +
        `perfiles de inferencia ni dimensiones de asignación de costos. ` +
        `No es posible saber qué equipo o aplicación genera qué gasto.`,
      provider,
      service: "AI/ML Services",
      category: "ai-cost-attribution",
      savingsRange: { conservative: 0, moderate: 0, optimistic: 0 },
      estimatedMonthlySavingsUSD: 0,
      priorityScore: 70, // High priority for governance
      calculationBreakdown:
        `Gasto IA mensual sin atribuir: ${formatUSD(monthlyCost)}. ` +
        `No hay ahorro directo estimable — este hallazgo es de gobernanza.`,
      effort: "bajo",
      risk: "bajo",
      confidence: "inferencia",
      reference: attributionConfig.reference,
      pillar: getAiPillar(provider, "Cost Optimization — Cost Attribution", attributionConfig.pillarUrl),
      remediation: {
        description: attributionConfig.remediationDescription,
        commands: attributionConfig.commands,
        rollbackPlan: attributionConfig.rollbackPlan,
      },
      affectedResources: ["AI/ML Services (sin tags de asignación)"],
      topResources: [],
      assumptions: [],
    }];
  },
};
