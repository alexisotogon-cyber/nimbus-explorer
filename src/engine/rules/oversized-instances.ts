import {
  NormalizedCostRecord,
  Finding,
  RuleDefinition,
  CloudProvider,
  ArchitecturePillar,
  FindingAssumption,
  RemediationCommand,
  calculatePriority,
  deriveSavingsRange,
  formatUSD,
} from "../types";

/** Formats an assumption's min/max band as a percentage string, e.g. "15%–70%". */
function pctRange(a: FindingAssumption): string {
  return `${(a.min * 100).toFixed(0)}%–${(a.max * 100).toFixed(0)}%`;
}

function sum(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0);
}

function getPillar(provider: CloudProvider): ArchitecturePillar {
  const pillars: Record<CloudProvider, ArchitecturePillar> = {
    aws: {
      framework: "AWS Well-Architected",
      // COST07 is the pricing-model best practice set (COST07-BP01 = pricing model
      // analysis), NOT resource sizing. Resource type/size/number lives in COST06,
      // and the old `cost_type_size_number_resources.html` URL now 302s to the
      // pillar landing page, so it was a dead link.
      pillar: "Cost Optimization — COST06-BP02",
      url: "https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_type_size_number_resources_data.html",
    },
    azure: {
      framework: "Azure Well-Architected",
      pillar: "Cost Optimization — CO:05",
      url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/optimize-scaling-costs",
    },
    gcp: {
      framework: "Google Cloud Architecture Framework",
      pillar: "Cost Optimization — Right-sizing",
      // `cost-optimization/optimize-resources` was a 404; the live page is
      // "Optimize resource usage" (verified 2026-07-21).
      url: "https://docs.cloud.google.com/architecture/framework/cost-optimization/optimize-resource-usage",
    },
  };
  return pillars[provider];
}

// ─── AWS Legacy Instance Family Patterns ─────────────────────────────────────

/**
 * Price delta between an older EC2 family and its current cheaper equivalent,
 * expressed as the saving obtained by migrating old → current.
 *
 * All values verified against the AWS Price List for On-Demand, Linux, shared
 * tenancy, us-east-1, on 2026-07-24. They vary by region and by size, which is
 * why the finding assumption keeps a min/max band around them.
 *
 * Caveat worth knowing: AWS still lists t2, m4, c4 and r4 as
 * "Current Generation = Yes"; only m3 and c3 are flagged as No. So the
 * user-facing copy must not call these families "previous generation" — the
 * defensible claim is only that a cheaper current equivalent exists.
 *
 * r3 and i3 were REMOVED: their previous figures (35% and 15%) could not be
 * verified against the Price List, and we don't keep unsourced numbers.
 */
const AWS_LEGACY_PATTERNS: Record<string, { current: string; savingsPct: number }> = {
  t2: { current: "t3", savingsPct: 0.103 },
  m3: { current: "m6i", savingsPct: 0.278 },
  m4: { current: "m6i", savingsPct: 0.040 },
  c3: { current: "c6i", savingsPct: 0.190 },
  c4: { current: "c6i", savingsPct: 0.150 },
  r4: { current: "r6i", savingsPct: 0.053 },
};

/**
 * Rule: Legacy Generation Instances (AWS-specific detection, multi-cloud pillar).
 *
 * Rule id and category are intentionally kept as-is (`OVERSIZED-GEN-001` /
 * `legacy-generation`) for backwards compatibility, even though the copy no
 * longer claims these families are "previous generation".
 */
export const legacyGenerationRule: RuleDefinition = {
  id: "OVERSIZED-GEN-001",
  name: "Familias con equivalente actual más barato",
  category: "legacy-generation",
  description:
    "Existen familias de instancias EC2 cuyo equivalente actual cuesta menos por la misma configuración. El ahorro verificado va de ~4% a ~28% según la familia (On-Demand, Linux, tenancy compartida, us-east-1, consultado el 2026-07-24).",
  reference:
    "AWS Well-Architected — COST06-BP02: Select resource type, size, and number based on data — https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_type_size_number_resources_data.html. Deltas de precio verificados contra el Price List de AWS (On-Demand, Linux, tenancy compartida, us-east-1, 2026-07-24). CLI verificada: aws ec2 modify-instance-attribute (requiere instancia detenida) — https://docs.aws.amazon.com/cli/latest/userguide/cli-services-ec2-instance-type-script.html",
  evaluate: (records: NormalizedCostRecord[]): Finding[] => {
    const findings: Finding[] = [];

    // AWS: detect by nativeUsageType containing BoxUsage:<family>.<size>
    const awsCompute = records.filter(
      (r) => r.provider === "aws" && r.category === "compute" &&
        r.nativeUsageType.toLowerCase().includes("boxusage")
    );

    const byUsageType: Record<string, NormalizedCostRecord[]> = {};
    for (const r of awsCompute) {
      const k = r.nativeUsageType;
      if (!byUsageType[k]) byUsageType[k] = [];
      byUsageType[k].push(r);
    }

    for (const [usageType, recs] of Object.entries(byUsageType)) {
      // Extract instance type from "BoxUsage:t2.xlarge" or "USE1-BoxUsage:t2.xlarge"
      const match = usageType.match(/BoxUsage:(.+)/i);
      if (!match) continue;

      const instanceType = match[1];
      const family = instanceType.split(".")[0];
      const legacyInfo = AWS_LEGACY_PATTERNS[family];
      if (!legacyInfo) continue;

      const totalCost = sum(recs.map((r) => r.cost));
      const days = new Set(recs.map((r) => r.date)).size || 1;
      const monthlyCost = (totalCost / days) * 30;

      const size = instanceType.split(".")[1] || "unknown";
      const region = recs[0].region || "us-east-1";
      const newInstanceType = `${legacyInfo.current}.${size}`;

      // The central value is a verified price delta; the min/max band exists
      // because the same delta shifts with region and instance size, not because
      // the central figure is an editorial guess.
      const savingsPctAssumption: FindingAssumption = {
        // Namespaced by family: t2/m3/m4/c3/c4/r4 each carry a DIFFERENT
        // verified delta (4%-28%). A bare shared id let getScenarioVariables()
        // in scenarios.ts silently show only the first-registered family's
        // band on a slider that also controlled every other family's finding.
        id: `aws:gen-migration-savings-pct:${family}`,
        label: `% de ahorro al migrar ${family} → ${legacyInfo.current}`,
        value: legacyInfo.savingsPct,
        min: Math.round(legacyInfo.savingsPct * 0.7 * 100) / 100,
        max: Math.round(legacyInfo.savingsPct * 1.2 * 100) / 100,
        step: 0.05,
        source: `Delta verificado contra el Price List de AWS: ${family} → ${legacyInfo.current} ahorra ${(legacyInfo.savingsPct * 100).toFixed(1)}% (On-Demand, Linux, tenancy compartida, us-east-1, consultado el 2026-07-24). La banda min/max refleja que el delta varía por región y por tamaño de instancia: confirma el precio de tu tipo y región concretos.`,
      };

      const savingsRange = deriveSavingsRange(monthlyCost, [savingsPctAssumption]);

      if (savingsRange.moderate < 10) continue;

      findings.push({
        id: `LEGACY-GEN-${family}-${size}-${region}`,
        title: `Migrar a un equivalente actual más barato: ${instanceType} → ${newInstanceType}`,
        description: `Instancia(s) ${instanceType} en ${region}: ${newInstanceType} cuesta ~${(legacyInfo.savingsPct * 100).toFixed(1)}% menos por la misma configuración (On-Demand, Linux, tenancy compartida, us-east-1, 2026-07-24). Ojo: AWS sigue clasificando algunas de estas familias como generación actual, así que no se trata de un recurso obsoleto, sino de una familia con un equivalente actual más económico.`,
        provider: "aws",
        service: recs[0].nativeService,
        category: "legacy-generation",
        savingsRange,
        estimatedMonthlySavingsUSD: savingsRange.moderate,
        calculationBreakdown: `Costo mensual: ${formatUSD(monthlyCost)}. Delta verificado ${family} → ${legacyInfo.current}: ${(legacyInfo.savingsPct * 100).toFixed(1)}% (us-east-1, On-Demand, Linux, 2026-07-24). Banda aplicada por variación de región y tamaño: ${pctRange(savingsPctAssumption)}. Rango: ${formatUSD(savingsRange.conservative)}–${formatUSD(savingsRange.optimistic)}/mes.`,
        effort: "medio",
        risk: "bajo",
        priorityScore: calculatePriority(savingsRange.moderate, "medio", "bajo"),
        confidence: "confirmado",
        reference: legacyGenerationRule.reference,
        pillar: getPillar("aws"),
        remediation: {
          description: `Detener instancia, cambiar tipo a ${newInstanceType}, reiniciar. Validar compatibilidad de drivers y AMI.`,
          commands: [
            { provider: "aws", tool: "cli", label: "Describir instancias del tipo", snippet: `aws ec2 describe-instances --region ${region} \\\n  --filters "Name=instance-type,Values=${instanceType}" \\\n  --query "Reservations[*].Instances[*].{ID:InstanceId,State:State.Name,Type:InstanceType}" \\\n  --output table`, isInvestigation: true, isIrreversible: false },
            { provider: "aws", tool: "cli", label: "Detener instancia", snippet: `aws ec2 stop-instances --instance-ids <INSTANCE_ID> --region ${region}`, isInvestigation: false, isIrreversible: false },
            { provider: "aws", tool: "cli", label: "Cambiar tipo de instancia", snippet: `aws ec2 modify-instance-attribute \\\n  --instance-id <INSTANCE_ID> \\\n  --instance-type '{"Value": "${newInstanceType}"}'`, isInvestigation: false, isIrreversible: false },
            { provider: "aws", tool: "cli", label: "Reiniciar instancia", snippet: `aws ec2 start-instances --instance-ids <INSTANCE_ID> --region ${region}`, isInvestigation: false, isIrreversible: false },
          ],
          rollbackPlan: `Revertir tipo: aws ec2 modify-instance-attribute --instance-id <ID> --instance-type '{"Value": "${instanceType}"}' y reiniciar.`,
        },
        affectedResources: [`${instanceType} (${region})`],
        topResources: [],
        assumptions: [savingsPctAssumption],
        // Shares its scope with missingCommitmentsRule (commit stage): both
        // draw from the same uncommitted AWS compute spend. Migrating first
        // (optimize) shrinks the pool missingCommitmentsRule can still claim —
        // enforced centrally in calculate-savings.ts's buildPortfolio().
        scopeId: "aws:compute-pool",
        stage: "optimize",
        stacking: "sequential",
      });
    }

    return findings;
  },
};

/**
 * Rule: Excessive NAT Gateway / Cloud NAT cost.
 */
export const natGatewayRule: RuleDefinition = {
  id: "NAT-GW-001",
  name: "Gasto excesivo en NAT Gateway",
  category: "nat-gateway-overuse",
  description:
    "Tráfico alto a través de NAT que podría salir parcialmente por Gateway Endpoints de S3/DynamoDB (sin cargo adicional), Private Endpoints de Azure o Private Google Access.",
  reference:
    "AWS: los Gateway Endpoints de S3 y DynamoDB no tienen cargo adicional, ni por hora ni por GB — https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html. Ojo: los Interface Endpoints (PrivateLink) SÍ cobran por hora y por datos procesados — https://docs.aws.amazon.com/vpc/latest/privatelink/create-interface-endpoint.html, y los equivalentes de Azure (Private Endpoints) y GCP tampoco son gratuitos. NAT Gateway: 0,045 USD por GB procesado y 0,045 USD por hora en us-east-1 (varía por región). CLI verificada: aws ec2 create-vpc-endpoint.",
  evaluate: (records: NormalizedCostRecord[]): Finding[] => {
    const findings: Finding[] = [];

    const natRecords = records.filter(
      (r) => r.category === "nat" && (r.chargeType === "Usage" || !r.chargeType)
    );
    if (natRecords.length === 0) return findings;

    const byKey: Record<string, NormalizedCostRecord[]> = {};
    for (const r of natRecords) {
      const k = `${r.provider}:${r.region}`;
      if (!byKey[k]) byKey[k] = [];
      byKey[k].push(r);
    }

    for (const [key, recs] of Object.entries(byKey)) {
      const [provider, region] = key.split(":") as [CloudProvider, string];
      const totalCost = sum(recs.map((r) => r.cost));
      const days = new Set(recs.map((r) => r.date)).size || 1;
      const monthlyCost = (totalCost / days) * 30;

      const endpointTrafficAssumption: FindingAssumption = {
        id: "endpoint-traffic-pct",
        label: "% del tráfico que podría salir por conexiones privadas (VPC endpoints)",
        value: 0.40,
        min: 0.15,
        max: 0.70,
        step: 0.05,
        source: "Estimación editorial ajustable — el % de tráfico redirigible a endpoints privados depende de tu mix; mídelo con VPC Flow Logs. No hay benchmark público verificado.",
      };

      const savingsRange = deriveSavingsRange(monthlyCost, [endpointTrafficAssumption]);

      if (savingsRange.moderate < 20) continue;

      findings.push({
        id: `NAT-GW-${provider}-${region}`,
        title: `Reducir el costo de salida a internet (NAT Gateway)`,
        description: `Gasto en NAT: ~${formatUSD(monthlyCost)}/mes (en AWS us-east-1 el NAT Gateway cuesta 0,045 USD/GB procesado más 0,045 USD/hora; varía por región). En AWS, los Gateway Endpoints de S3 y DynamoDB no tienen cargo adicional y sacan ese tráfico del NAT. Los Interface Endpoints (PrivateLink) sí cobran por hora y por datos procesados, igual que los equivalentes privados de Azure y GCP: compara antes de migrarlo todo.`,
        provider,
        service: recs[0].nativeService,
        category: "nat-gateway-overuse",
        savingsRange,
        estimatedMonthlySavingsUSD: savingsRange.moderate,
        calculationBreakdown: `Costo NAT mensual: ${formatUSD(monthlyCost)}. Supuesto: ${(endpointTrafficAssumption.value * 100).toFixed(0)}% redirigible (rango: ${pctRange(endpointTrafficAssumption)}). Rango: ${formatUSD(savingsRange.conservative)}–${formatUSD(savingsRange.optimistic)}/mes.`,
        effort: "medio",
        risk: "bajo",
        priorityScore: calculatePriority(savingsRange.moderate, "medio", "bajo"),
        confidence: "inferencia",
        reference: natGatewayRule.reference,
        pillar: getPillar(provider),
        remediation: {
          description: "En AWS, crea Gateway Endpoints para S3 y DynamoDB (sin cargo adicional) y actualiza las tablas de rutas. Para el resto de servicios necesitarás Interface Endpoints, que cobran por hora y por datos procesados: valida que el ahorro en NAT compense. En Azure y GCP los equivalentes privados también tienen coste propio.",
          commands: getNATCommands(provider, region),
          rollbackPlan: "Eliminar endpoint. El tráfico volverá a rutear por NAT Gateway.",
        },
        affectedResources: [`NAT (${region})`],
        topResources: [],
        assumptions: [endpointTrafficAssumption],
      });
    }

    return findings;
  },
};

function getNATCommands(provider: CloudProvider, region: string): RemediationCommand[] {
  if (provider === "aws") {
    return [
      { provider, tool: "cli", label: "Ver top destinos del NAT (VPC Flow Logs)", snippet: `aws ec2 describe-flow-logs --region ${region} \\\n  --query "FlowLogs[*].{ID:FlowLogId,Status:FlowLogStatus}" \\\n  --output table`, isInvestigation: true, isIrreversible: false },
      { provider, tool: "cli", label: "Crear VPC Endpoint para S3", snippet: `aws ec2 create-vpc-endpoint \\\n  --vpc-id <VPC_ID> \\\n  --service-name com.amazonaws.${region}.s3 \\\n  --route-table-ids <RTB_ID>`, isInvestigation: false, isIrreversible: false },
      { provider, tool: "cli", label: "Crear VPC Endpoint para DynamoDB", snippet: `aws ec2 create-vpc-endpoint \\\n  --vpc-id <VPC_ID> \\\n  --service-name com.amazonaws.${region}.dynamodb \\\n  --route-table-ids <RTB_ID>`, isInvestigation: false, isIrreversible: false },
    ];
  }
  if (provider === "azure") {
    return [
      { provider, tool: "cli", label: "Listar NAT Gateways", snippet: `az network nat gateway list -o table`, isInvestigation: true, isIrreversible: false },
      { provider, tool: "cli", label: "Crear Private Endpoint para Storage", snippet: `az network private-endpoint create \\\n  --name <PE_NAME> --resource-group <RG> \\\n  --vnet-name <VNET> --subnet <SUBNET> \\\n  --private-connection-resource-id <STORAGE_ID> \\\n  --group-id blob`, isInvestigation: false, isIrreversible: false },
    ];
  }
  return [
    { provider, tool: "cli", label: "Ver rutas de Cloud NAT", snippet: `gcloud compute routers nats list --router=<ROUTER_NAME> --region=${region}`, isInvestigation: true, isIrreversible: false },
    { provider, tool: "cli", label: "Habilitar Private Google Access en subnet", snippet: `gcloud compute networks subnets update <SUBNET_NAME> \\\n  --region=${region} \\\n  --enable-private-ip-google-access`, isInvestigation: false, isIrreversible: false },
  ];
}
