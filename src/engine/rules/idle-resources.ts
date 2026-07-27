import {
  NormalizedCostRecord,
  Finding,
  RuleDefinition,
  calculatePriority,
  formatUSD,
  topResourcesFromRecords,
  FindingAssumption,
} from "../types";

/**
 * Rule: Utilization Review Candidates (P0-1).
 * 
 * Reports compute with stable high cost as a finding with confidence
 * "fuera-de-alcance-del-billing". NEVER recommends terminate/delete.
 * Instead, recommends reviewing real utilization metrics (CloudWatch / Azure Monitor / Cloud Monitoring).
 * 
 * Rationale: Compute is billed per hour powered on regardless of CPU load.
 * Cost stability does NOT indicate the instance is idle — it just means it's
 * always running (which is normal for production). Only real metrics can tell
 * if it's actually underutilized.
 */
export const utilizationReviewRule: RuleDefinition = {
  id: "UTIL-REVIEW-001",
  name: "Candidatos a revisión de utilización",
  category: "utilization-review",
  description:
    "Cómputo con costo estable alto que requiere revisión de métricas reales de utilización para determinar si está sobredimensionado.",
  reference:
    // COST06-BP02, not COST07: COST07 covers pricing models. The previous URL
    // (cost_type_size_number_resources.html) 302s to the pillar landing page.
    "AWS Well-Architected — COST06-BP02: Select resource type, size, and number based on data. https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_type_size_number_resources_data.html",
  evaluate: (records: NormalizedCostRecord[]): Finding[] => {
    const findings: Finding[] = [];

    const computeRecords = records.filter(
      (r) => r.category === "compute" && (r.chargeType === "Usage" || !r.chargeType)
    );

    // Group by native usage type (instance type)
    const byUsageType = groupBy(computeRecords, "nativeUsageType");

    for (const [usageType, recs] of Object.entries(byUsageType)) {
      // Threshold and average are per DISTINCT DAY, never per record. A real CUR
      // emits several lines per day for the same resource (one per operation,
      // account or availability zone), so `recs.length` was both a false "7 days"
      // gate — 8 lines spread over 4 days passed it — and a wrong divisor: the
      // daily average was diluted by the number of lines, halving or quartering
      // the projected monthly cost. Same day-counting as every other rule.
      const uniqueDays = new Set(recs.map((r) => r.date)).size;
      if (uniqueDays < 7) continue; // Need at least 7 distinct days of data

      const totalCost = sum(recs.map((r) => r.cost));
      const avgDailyCost = totalCost / uniqueDays;
      const monthlyCost = avgDailyCost * 30;

      // Only flag if monthly cost is significant (> $100)
      if (monthlyCost < 100) continue;

      const provider = recs[0].provider;
      if (provider === "unknown") continue; // skip FOCUS records with unmapped provider
      const region = recs[0].region || "unknown";

      // Build provider-specific investigation commands
      const investigationCommands = getInvestigationCommands(provider, usageType, region);

      // Clean instance type for the title (strip "BoxUsage:" / "region-" / path prefixes).
      // The raw usageType is preserved in affectedResources.
      const cleanType = usageType.split(/[:/]/).pop() || usageType;

      // P2: resource IDs when present (e.g. FOCUS)
      const top = topResourcesFromRecords(recs, uniqueDays);
      const hasIds = top.length > 0;

      findings.push({
        id: `UTIL-REVIEW-${provider}-${usageType.replace(/[^a-zA-Z0-9]/g, "-")}`,
        title: `Revisar uso real de instancias ${cleanType}`,
        description:
          // formatUSD, not raw interpolation: `$${Math.round(x)}` printed "$18000"
          // in the middle of a report where every other figure reads "$18,000.00".
          `Cómputo con gasto de ~${formatUSD(monthlyCost)}/mes. ` +
          `El billing solo muestra horas encendidas, no carga real. ` +
          `Requiere revisión de métricas de utilización para determinar si está correctamente dimensionado.`,
        provider,
        service: recs[0].nativeService,
        category: "utilization-review",
        savingsRange: {
          conservative: 0,
          moderate: 0,
          optimistic: Math.round(monthlyCost * 0.3 * 100) / 100,
        },
        estimatedMonthlySavingsUSD: 0,
        calculationBreakdown:
          `Costo mensual: ${formatUSD(monthlyCost)}/mes. ` +
          `No se puede estimar ahorro sin métricas de utilización reales. ` +
          `El billing muestra horas encendidas, no carga de CPU/memoria.`,
        effort: "bajo",
        risk: "bajo",
        priorityScore: calculatePriority(monthlyCost * 0.1, "bajo", "bajo"),
        // With resource IDs we can see exactly which instances are running;
        // still requires metrics to confirm utilization, so stays out-of-scope-del-billing.
        confidence: "fuera-de-alcance-del-billing",
        reference: getUtilizationReference(provider),
        pillar: getPillar(provider),
        remediation: {
          description:
            "Revisar métricas reales de utilización. NO terminar ni eliminar sin datos de CloudWatch/Monitor/Cloud Monitoring.",
          commands: investigationCommands,
          rollbackPlan: "No aplica: esta recomendación solo consulta datos y no realiza cambios.",
        },
        affectedResources: hasIds
          ? top.map((r) => `${r.resourceId}${r.resourceType ? ` (${r.resourceType})` : ""}`)
          : [`${usageType} (${region})`],
        topResources: top,
        assumptions: [],
        // Shares its scope with legacyGenerationRule (optimize) and
        // missingCommitmentsRule (commit) on the same provider's compute pool.
        // estimatedMonthlySavingsUSD is 0 here (out-of-scope-del-billing), so it
        // never actually consumes any of that pool — the tag documents the real
        // FinOps relationship (review before rightsizing before committing) in
        // case this rule ever gains a real savings figure.
        scopeId: `${provider}:compute-pool`,
        stage: "eliminate",
        stacking: "sequential",
      });
    }

    return findings;
  },
};

/**
 * Per-provider hourly rate for a public IPv4 address, and whether the provider's
 * own price list distinguishes an idle address from an in-use one.
 *
 * This distinction drives the confidence asymmetry of the rule below:
 *
 *  - AWS (us-east-1): USE1-PublicIPv4:IdleAddress and USE1-PublicIPv4:InUseAddress
 *    are both 0.005 USD/hour — the SAME rate. Therefore dividing the observed cost
 *    by rate × 730 does NOT count unassociated addresses, it counts billed public
 *    IPv4 addresses regardless of state. The old "confirmado" claim was invalid.
 *  - Azure (eastus): Standard static IPv4 costs 0.005 USD/hour. Azure publishes no
 *    separate "unassociated" rate, so the same limitation applies. (The previous
 *    0.004 figure was the Basic dynamic SKU, retired on 2025-09-30.)
 *  - GCP (us-central1): a reserved-but-unused static IP costs 0.01 USD/hour, while
 *    an in-use one on a standard VM costs 0.005. Here the charge itself identifies
 *    the idle state, so the inference IS valid and confidence stays "confirmado".
 */
const IP_RATES: Record<
  "aws" | "azure" | "gcp",
  { hourlyRate: number; region: string; idleRateIsDistinct: boolean; note: string }
> = {
  aws: {
    hourlyRate: 0.005,
    region: "us-east-1",
    idleRateIsDistinct: false,
    note:
      "AWS cobra 0,005 USD/hora tanto por USE1-PublicIPv4:IdleAddress como por " +
      "USE1-PublicIPv4:InUseAddress en us-east-1 (2026-07-24): la tarifa es idéntica, " +
      "así que la factura no distingue una IP ociosa de una en uso.",
  },
  azure: {
    hourlyRate: 0.005,
    region: "eastus",
    idleRateIsDistinct: false,
    note:
      "Azure cobra 0,005 USD/hora por IP pública Standard IPv4 estática en eastus " +
      "(2026-07-24). La SKU Basic dinámica se retiró el 30 de septiembre de 2025. " +
      "Azure no publica una tarifa distinta para direcciones sin asociar, así que " +
      "la factura tampoco permite distinguirlas.",
  },
  gcp: {
    hourlyRate: 0.01,
    region: "us-central1",
    idleRateIsDistinct: true,
    note:
      "Google Cloud cobra 0,01 USD/hora por una IP estática reservada pero sin usar " +
      "en us-central1, frente a 0,005 USD/hora cuando está en uso en una VM estándar " +
      "(2026-07-24). Aquí el propio cargo identifica el estado ocioso.",
  },
};

const IP_SOURCES =
  "AWS — tarifas de IPv4 pública (IdleAddress e InUseAddress cuestan lo mismo, 0,005 USD/hora en us-east-1, consultado el 2026-07-24): " +
  "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-instance-addressing.html. " +
  "Google Cloud — 0,01 USD/hora por IP estática reservada sin usar frente a 0,005 USD/hora en uso, us-central1, 2026-07-24: " +
  "https://cloud.google.com/vpc/network-pricing. " +
  "Azure — IP pública Standard IPv4 estática 0,005 USD/hora en eastus, 2026-07-24 (la SKU Basic se retiró el 30/09/2025). " +
  "CLI verificada en docs AWS: aws ec2 release-address — https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-instance-addressing-eips-releasing.html";

/**
 * The share of the observed IPv4 charge that is realistically recoverable,
 * expressed as an adjustable assumption so it appears in the Supuestos panel and
 * the user can move it.
 *
 * Two very different situations, hence two very different bands:
 *  - GCP: the price list has a dedicated rate for a reserved-but-unused address,
 *    so the charge itself proves the address is idle. Releasing it recovers the
 *    charge; the only reason the floor is not 100% is that some of those
 *    reservations may be held deliberately (DNS, allow-lists, failover).
 *  - AWS / Azure: idle and in-use cost the same, so the charge proves only that
 *    public IPv4 addresses exist. What fraction is unattached cannot be derived
 *    from the invoice at all, which is why the band is wide and the centre low.
 *    This is an editorial estimate, and it says so.
 */
function buildRecoverableIpAssumption(
  provider: "aws" | "azure" | "gcp",
  idleRateIsDistinct: boolean
): FindingAssumption {
  if (idleRateIsDistinct) {
    return {
      // Namespaced by provider: the AWS/Azure band (0.2-0.7) and the GCP band
      // (0.8-1.0) are different claims about different evidence — a bare
      // shared id let getScenarioVariables() in scenarios.ts silently keep
      // only whichever finding registered first, showing its label/band on a
      // slider that also controlled the other provider's very different one.
      id: `${provider}:recoverable-idle-ip-pct`,
      label: "% del cargo por IPs reservadas sin usar que esperas liberar",
      value: 0.9,
      min: 0.8,
      max: 1.0,
      step: 0.05,
      source:
        "Google Cloud factura una tarifa propia (0,01 USD/hora) por IP estática reservada sin usar " +
        "frente a 0,005 USD/hora en uso (us-central1, 2026-07-24), así que el cargo identifica el " +
        "estado ocioso y liberar la dirección recupera el importe. El tope no es 100% porque algunas " +
        "reservas se mantienen a propósito (DNS, listas de permitidos, failover). " +
        "https://cloud.google.com/vpc/network-pricing",
    };
  }
  const providerLabel = provider === "azure" ? "Azure" : "AWS";
  return {
    id: `${provider}:recoverable-idle-ip-pct`,
    label: "% del cargo de IPv4 públicas que corresponde a direcciones liberables",
    value: 0.4,
    min: 0.2,
    max: 0.7,
    step: 0.05,
    source:
      `Estimación editorial ajustable, sin benchmark público. En ${providerLabel} la tarifa de una ` +
      "IPv4 pública es la misma esté asociada o no (0,005 USD/hora), así que la factura no permite " +
      "separar direcciones ociosas de direcciones en uso: el reparto es un supuesto, no un dato. " +
      "Lista las direcciones sin asociación con los comandos de investigación y sustituye este valor " +
      "por el real.",
  };
}

/**
 * Rule: Billed public IPv4 addresses (potentially unused).
 *
 * Confidence is provider-dependent on purpose — see IP_RATES above.
 */
export const unusedElasticIpRule: RuleDefinition = {
  id: "IDLE-EIP-001",
  name: "IPv4 públicas facturadas (posibles IPs sin usar)",
  category: "unused-elastic-ips",
  description:
    "Cargos por direcciones IPv4 públicas. En AWS y Azure la tarifa es la misma esté la IP asociada o no, así que desde la factura no se puede saber cuántas están ociosas; en Google Cloud la IP reservada sin usar tiene tarifa propia y sí se identifica.",
  reference: IP_SOURCES,
  evaluate: (records: NormalizedCostRecord[]): Finding[] => {
    const findings: Finding[] = [];

    const ipRecords = records.filter((r) => r.category === "ip-address");
    if (ipRecords.length === 0) return findings;

    // Group by provider + region
    const byKey = groupByFn(ipRecords, (r) => `${r.provider}:${r.region}`);

    for (const [key, recs] of Object.entries(byKey)) {
      const [provider, region] = key.split(":") as [string, string];
      const totalCost = sum(recs.map((r) => r.cost));
      const days = new Set(recs.map((r) => r.date)).size || 1;
      const monthlyCost = (totalCost / days) * 30;

      if (monthlyCost < 2) continue;

      const typedProvider = provider as "aws" | "azure" | "gcp";
      const rateInfo = IP_RATES[typedProvider] ?? IP_RATES.aws;
      const hourlyRate = rateInfo.hourlyRate;
      const estimatedCount = Math.round(monthlyCost / (hourlyRate * 730)) || 1;

      // GCP: the provider's own price list separates idle from in-use, so the
      // count really is "unused IPs" and recovering the full charge is realistic.
      // AWS/Azure: the same rate covers both states, so the count is "billed
      // public IPv4" and only a fraction is actually recoverable — the savings
      // band is trimmed accordingly instead of assuming 100%.
      const idleIsDistinct = rateInfo.idleRateIsDistinct;

      // The recoverable fraction is a JUDGEMENT, and it is now declared as an
      // adjustable assumption instead of three bare multipliers inline. The finding
      // used to publish its band from 0.2/0.4/0.7 (or 0.8/1.0/1.0) while shipping
      // `assumptions: []`, so the Supuestos panel showed nothing and the user could
      // neither see nor change the single number driving the whole range.
      const recoverableAssumption = buildRecoverableIpAssumption(typedProvider, idleIsDistinct);
      const savingsRange = {
        conservative: Math.round(monthlyCost * recoverableAssumption.min * 100) / 100,
        moderate: Math.round(monthlyCost * recoverableAssumption.value * 100) / 100,
        optimistic: Math.round(monthlyCost * recoverableAssumption.max * 100) / 100,
      };

      const title = idleIsDistinct
        ? `~${estimatedCount} IPs estáticas reservadas sin usar en ${region}`
        : `~${estimatedCount} IPv4 públicas facturadas en ${region}`;

      const description = idleIsDistinct
        ? `Google Cloud cobra una tarifa específica (0,01 USD/hora) por IP estática reservada sin usar, frente a 0,005 USD/hora cuando está en uso: el cargo identifica el estado ocioso. Detectadas ~${estimatedCount} IPs por ${formatUSD(monthlyCost)}/mes en ${region}.`
        : `Cargo de ${formatUSD(monthlyCost)}/mes por ~${estimatedCount} IPv4 públicas facturadas en ${region}. ${rateInfo.note} No asumas que todas están ociosas: confírmalo listando las direcciones sin asociación con los comandos de investigación de abajo.`;

      findings.push({
        id: `IDLE-IP-${provider}-${region}`,
        title,
        description,
        provider: typedProvider,
        service: recs[0].nativeService,
        category: "unused-elastic-ips",
        savingsRange,
        estimatedMonthlySavingsUSD: savingsRange.moderate,
        calculationBreakdown: idleIsDistinct
          ? `Tarifa de IP estática reservada sin usar: $${hourlyRate}/hora = ~$${(hourlyRate * 730).toFixed(2)}/mes (${rateInfo.region}, 2026-07-24). Costo observado: ${formatUSD(totalCost)} en ${days} días → ${formatUSD(monthlyCost)}/mes. IPs estimadas: ~${estimatedCount}. Como la tarifa distingue el estado ocioso, el ahorro estimado cubre del ${pct(recoverableAssumption.min)} al ${pct(recoverableAssumption.max)} del cargo (valor central ${pct(recoverableAssumption.value)}, ajustable en el panel Supuestos).`
          : `Tarifa de IPv4 pública: $${hourlyRate}/hora = ~$${(hourlyRate * 730).toFixed(2)}/mes (${rateInfo.region}, 2026-07-24), idéntica esté la IP asociada o no. Costo observado: ${formatUSD(totalCost)} en ${days} días → ${formatUSD(monthlyCost)}/mes, equivalente a ~${estimatedCount} IPv4 públicas FACTURADAS (no necesariamente ociosas). Criterio del rango: como no se puede separar ociosas de en uso desde la factura, se estima que solo entre el ${pct(recoverableAssumption.min)} y el ${pct(recoverableAssumption.max)} del cargo corresponde a direcciones liberables (valor central ${pct(recoverableAssumption.value)}, ajustable en el panel Supuestos). Verifica el número real listando las direcciones sin asociación.`,
        effort: "bajo",
        risk: "bajo",
        priorityScore: calculatePriority(savingsRange.moderate, "bajo", "bajo"),
        // Asymmetric on purpose: only GCP's price list distinguishes idle vs in-use.
        confidence: idleIsDistinct ? "confirmado" : "inferencia",
        reference: unusedElasticIpRule.reference,
        pillar: getPillar(typedProvider),
        remediation: {
          description: idleIsDistinct
            ? "Liberar las IPs reservadas sin usar después de confirmar que no se necesitan."
            : "Primero identifica qué direcciones no están asociadas a ningún recurso (la factura no lo dice) y libera solo esas.",
          commands: getIPRemediationCommands(typedProvider, region),
          rollbackPlan: "Asignar nueva IP (será una dirección diferente).",
        },
        affectedResources: [
          idleIsDistinct
            ? `~${estimatedCount} IPs reservadas sin usar en ${region}`
            : `~${estimatedCount} IPv4 públicas facturadas en ${region}`,
        ],
        topResources: [],
        assumptions: [recoverableAssumption],
      });
    }

    return findings;
  },
};

/** Formats a 0–1 fraction as a whole percentage, for finding prose. */
function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Per-provider citation for `utilizationReviewRule` findings — was a single
 * static string always citing AWS Well-Architected regardless of `provider`,
 * even though `pillar` (right below) already varied correctly per finding.
 * Same landing pages as `getPillar` below, since those are the ones already
 * verified for this codebase; a hyper-specific sub-anchor risks 302ing away
 * like the AWS one already did once (see the comment on the rule's own
 * `reference` field above).
 */
function getUtilizationReference(provider: "aws" | "azure" | "gcp"): string {
  const refs = {
    aws: "AWS Well-Architected — COST06-BP02: Select resource type, size, and number based on data. https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_type_size_number_resources_data.html",
    azure: "Azure Well-Architected — Cost Optimization: right-size resources based on utilization data. https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/",
    gcp: "Google Cloud Architecture Framework — Cost Optimization: right-size resources based on utilization data. https://cloud.google.com/architecture/framework/cost-optimization",
  };
  return refs[provider];
}

function getPillar(provider: "aws" | "azure" | "gcp") {
  const pillars = {
    aws: {
      framework: "AWS Well-Architected" as const,
      pillar: "Cost Optimization",
      url: "https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/",
    },
    azure: {
      framework: "Azure Well-Architected" as const,
      pillar: "Cost Optimization",
      url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/",
    },
    gcp: {
      framework: "Google Cloud Architecture Framework" as const,
      pillar: "Cost Optimization",
      url: "https://cloud.google.com/architecture/framework/cost-optimization",
    },
  };
  return pillars[provider];
}

function getInvestigationCommands(provider: "aws" | "azure" | "gcp", usageType: string, region: string) {
  const commands = [];

  if (provider === "aws") {
    commands.push({
      provider: "aws" as const,
      tool: "cli" as const,
      label: "Verificar utilización de CPU (últimos 7 días)",
      snippet: [
        `# Inicio 7 días atrás (macOS / Linux):`,
        `START=$(date -v-7d +%Y-%m-%dT%H:%M:%S)              # macOS`,
        `# START=$(date -d "7 days ago" +%Y-%m-%dT%H:%M:%S)  # Linux (GNU)`,
        `aws cloudwatch get-metric-statistics \\`,
        `  --namespace AWS/EC2 --metric-name CPUUtilization \\`,
        `  --start-time $START \\`,
        `  --end-time $(date +%Y-%m-%dT%H:%M:%S) \\`,
        `  --period 86400 --statistics Average Maximum \\`,
        `  --dimensions Name=InstanceType,Value=${usageType.replace(/.*:/, "")} \\`,
        `  --region ${region}`,
      ].join("\n"),
      isInvestigation: true,
      isIrreversible: false,
    });
    commands.push({
      provider: "aws" as const,
      tool: "cli" as const,
      label: "Verificar conexiones de red",
      snippet: [
        `# Inicio 7 días atrás (macOS / Linux):`,
        `START=$(date -v-7d +%Y-%m-%dT%H:%M:%S)              # macOS`,
        `# START=$(date -d "7 days ago" +%Y-%m-%dT%H:%M:%S)  # Linux (GNU)`,
        `aws cloudwatch get-metric-statistics \\`,
        `  --namespace AWS/EC2 --metric-name NetworkPacketsIn \\`,
        `  --start-time $START \\`,
        `  --end-time $(date +%Y-%m-%dT%H:%M:%S) \\`,
        `  --period 86400 --statistics Sum \\`,
        `  --dimensions Name=InstanceType,Value=${usageType.replace(/.*:/, "")} \\`,
        `  --region ${region}`,
      ].join("\n"),
      isInvestigation: true,
      isIrreversible: false,
    });
  } else if (provider === "azure") {
    commands.push({
      provider: "azure" as const,
      tool: "cli" as const,
      label: "Verificar CPU promedio (Azure Monitor)",
      snippet: [
        `# Inicio 7 días atrás (macOS / Linux):`,
        `START=$(date -v-7d +%Y-%m-%dT%H:%M:%SZ)              # macOS`,
        `# START=$(date -d "7 days ago" +%Y-%m-%dT%H:%M:%SZ)  # Linux (GNU)`,
        `az monitor metrics list \\`,
        `  --resource <RESOURCE_ID> \\`,
        `  --metric "Percentage CPU" \\`,
        `  --interval PT1H --aggregation Average \\`,
        `  --start-time $START \\`,
        `  --end-time $(date +%Y-%m-%dT%H:%M:%SZ)`,
      ].join("\n"),
      isInvestigation: true,
      isIrreversible: false,
    });
  } else {
    commands.push({
      provider: "gcp" as const,
      tool: "cli" as const,
      label: "Verificar utilización de CPU (Cloud Monitoring)",
      snippet: [
        `gcloud monitoring metrics list \\`,
        `  --filter='metric.type="compute.googleapis.com/instance/cpu/utilization"' \\`,
        `  --format=json`,
      ].join("\n"),
      isInvestigation: true,
      isIrreversible: false,
    });
  }

  return commands;
}

function getIPRemediationCommands(provider: "aws" | "azure" | "gcp", region: string) {
  const commands = [];

  if (provider === "aws") {
    commands.push(
      {
        provider: "aws" as const,
        tool: "cli" as const,
        label: "Listar EIPs no asociadas",
        snippet: `aws ec2 describe-addresses --region ${region} \\\n  --query "Addresses[?AssociationId==null].{AllocationId:AllocationId,PublicIp:PublicIp}" \\\n  --output table`,
        isInvestigation: true,
        isIrreversible: false,
      },
      {
        provider: "aws" as const,
        tool: "cli" as const,
        label: "Liberar EIP",
        snippet: `aws ec2 release-address --allocation-id <ALLOCATION_ID> --region ${region}`,
        isInvestigation: false,
        isIrreversible: true,
      }
    );
  } else if (provider === "azure") {
    commands.push(
      {
        provider: "azure" as const,
        tool: "cli" as const,
        label: "Listar IPs públicas no asociadas",
        snippet: `az network public-ip list --query "[?ipConfiguration==null].{Name:name, IP:ipAddress, RG:resourceGroup}" -o table`,
        isInvestigation: true,
        isIrreversible: false,
      },
      {
        provider: "azure" as const,
        tool: "cli" as const,
        label: "Eliminar IP pública",
        snippet: `az network public-ip delete --name <IP_NAME> --resource-group <RG>`,
        isInvestigation: false,
        isIrreversible: true,
      }
    );
  } else {
    commands.push(
      {
        provider: "gcp" as const,
        tool: "cli" as const,
        label: "Listar IPs externas sin uso",
        snippet: `gcloud compute addresses list --filter="status=RESERVED" --format="table(name,address,region)"`,
        isInvestigation: true,
        isIrreversible: false,
      },
      {
        provider: "gcp" as const,
        tool: "cli" as const,
        label: "Liberar IP estática",
        snippet: `gcloud compute addresses delete <ADDRESS_NAME> --region=<REGION>`,
        isInvestigation: false,
        isIrreversible: true,
      }
    );
  }

  return commands;
}

function groupBy(records: NormalizedCostRecord[], key: keyof NormalizedCostRecord): Record<string, NormalizedCostRecord[]> {
  return records.reduce((acc, r) => {
    const k = String(r[key]);
    if (!acc[k]) acc[k] = [];
    acc[k].push(r);
    return acc;
  }, {} as Record<string, NormalizedCostRecord[]>);
}

function groupByFn(records: NormalizedCostRecord[], fn: (r: NormalizedCostRecord) => string): Record<string, NormalizedCostRecord[]> {
  return records.reduce((acc, r) => {
    const k = fn(r);
    if (!acc[k]) acc[k] = [];
    acc[k].push(r);
    return acc;
  }, {} as Record<string, NormalizedCostRecord[]>);
}

function sum(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0);
}
