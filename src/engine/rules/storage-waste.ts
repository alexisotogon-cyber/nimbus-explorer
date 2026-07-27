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
  topResourcesFromRecords,
} from "../types";

/** Formats an assumption's min/max band as a percentage string, e.g. "10%–50%". */
function pctRange(a: FindingAssumption): string {
  return `${(a.min * 100).toFixed(0)}%–${(a.max * 100).toFixed(0)}%`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sum(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0);
}

function getPillar(provider: CloudProvider): ArchitecturePillar {
  const pillars: Record<CloudProvider, ArchitecturePillar> = {
    // All three URLs verified live on 2026-07-21. The previous set was broken:
    //   · the AWS `cost_decomissioning.html` link 302'd to the pillar landing page,
    //     and the best practice was mislabelled — decommissioning is COST04-BP03,
    //     not COST06-BP01 (COST06 is resource type/size/number).
    //   · the Azure `optimize-unassociated-resources` page returned 404.
    //   · the Google `cost-optimization/optimize-resources` page returned 404.
    aws: {
      framework: "AWS Well-Architected",
      pillar: "Cost Optimization — COST04-BP03 Decommission resources",
      url: "https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_decomissioning_resources_decommission.html",
    },
    azure: {
      framework: "Azure Well-Architected",
      pillar: "Cost Optimization — CO:07 Optimizar los costos de los componentes",
      url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/optimize-component-costs",
    },
    gcp: {
      framework: "Google Cloud Architecture Framework",
      pillar: "Cost Optimization — Optimize resource usage",
      url: "https://docs.cloud.google.com/architecture/framework/cost-optimization/optimize-resource-usage",
    },
  };
  return pillars[provider];
}

/**
 * Pillar for the commitment-discount finding. Separate from getPillar() on
 * purpose: buying a Savings Plan / Reservation / CUD is a PRICING-MODEL decision,
 * not a decommissioning one. All three URLs verified live on 2026-07-21.
 */
function getCommitmentPillar(provider: CloudProvider): ArchitecturePillar {
  const pillars: Record<CloudProvider, ArchitecturePillar> = {
    aws: {
      framework: "AWS Well-Architected",
      pillar: "Cost Optimization — COST07-BP04 Implement pricing models for all components of this workload",
      url: "https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_pricing_model_implement_models.html",
    },
    azure: {
      framework: "Azure Well-Architected",
      pillar: "Cost Optimization — CO:05 Obtener las mejores tarifas del proveedor",
      url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/get-best-rates",
    },
    gcp: {
      framework: "Google Cloud Architecture Framework",
      pillar: "Cost Optimization — Committed use discounts (CUDs)",
      url: "https://cloud.google.com/docs/cuds",
    },
  };
  return pillars[provider];
}

// ─── Rule: Unattached Block Storage ──────────────────────────────────────────

export const unattachedStorageRule: RuleDefinition = {
  id: "STORAGE-BLOCK-001",
  name: "Volúmenes/Discos de bloque potencialmente no adjuntos",
  category: "unattached-storage",
  description:
    "Gasto en almacenamiento de bloque que podría incluir volúmenes no adjuntos a instancias activas.",
  reference:
    "El % de volúmenes sin adjuntar es una estimación editorial ajustable (ver panel Supuestos); no hay un benchmark público verificado. Confírmalo listando volúmenes en estado 'available' en tu cuenta.",
  evaluate: (records: NormalizedCostRecord[]): Finding[] => {
    const findings: Finding[] = [];

    const storageRecords = records.filter(
      (r) => r.category === "block-storage" && (r.chargeType === "Usage" || !r.chargeType)
    );
    if (storageRecords.length === 0) return findings;

    // Group by provider + region
    const byKey: Record<string, NormalizedCostRecord[]> = {};
    for (const r of storageRecords) {
      const k = `${r.provider}:${r.region}`;
      if (!byKey[k]) byKey[k] = [];
      byKey[k].push(r);
    }

    for (const [key, recs] of Object.entries(byKey)) {
      const [provider, region] = key.split(":") as [CloudProvider, string];
      const totalCost = sum(recs.map((r) => r.cost));
      const days = new Set(recs.map((r) => r.date)).size || 1;
      const monthlyCost = (totalCost / days) * 30;

      // Assumption: % of volumes unattached
      const unattachedPctAssumption: FindingAssumption = {
        id: "unattached-pct",
        label: "% de discos pagados que nadie usa (volúmenes sin adjuntar)",
        value: 0.20,
        min: 0.05,
        max: 0.40,
        step: 0.05,
        source: "Estimación editorial ajustable — no hay benchmark público verificado del % de volúmenes sin adjuntar. Ajusta este valor según tu entorno.",
      };

      const savingsRange = deriveSavingsRange(monthlyCost, [unattachedPctAssumption]);

      if (savingsRange.moderate < 10) continue;

      // P2: extract resource IDs when present (e.g. from FOCUS export)
      const uniqueDays = new Set(recs.map((r) => r.date)).size || 1;
      const top = topResourcesFromRecords(recs, uniqueDays);
      const hasIds = top.length > 0;

      findings.push({
        id: `UNATTACHED-BLOCK-${provider}-${region}`,
        title: `Discos pagados que podrían no estar en uso`,
        description: `Gasto total en almacenamiento de bloque: ~${formatUSD(monthlyCost)}/mes. Rango estimado de ahorro: ${formatUSD(savingsRange.conservative)}–${formatUSD(savingsRange.optimistic)}/mes.`,
        provider,
        service: recs[0].nativeService,
        category: "unattached-storage",
        savingsRange,
        estimatedMonthlySavingsUSD: savingsRange.moderate,
        calculationBreakdown: `Costo mensual total: ${formatUSD(monthlyCost)}. Supuesto: ${(unattachedPctAssumption.value * 100).toFixed(0)}% no adjuntos (rango: ${pctRange(unattachedPctAssumption)}). Ahorro moderado: ${formatUSD(monthlyCost)} × ${unattachedPctAssumption.value} = ${formatUSD(savingsRange.moderate)}/mes.`,
        effort: "bajo",
        risk: "bajo",
        priorityScore: calculatePriority(savingsRange.moderate, "bajo", "bajo"),
        // When individual resource IDs are available the finding is confirmed —
        // we can see exactly which resources are generating cost.
        confidence: hasIds ? "confirmado" : "inferencia",
        reference: unattachedStorageRule.reference,
        pillar: getPillar(provider),
        remediation: {
          description: "Identificar volúmenes no adjuntos. Respaldar y eliminar los confirmados.",
          commands: getBlockStorageCommands(provider, region),
          rollbackPlan: "Restaurar desde snapshot/backup previo a la eliminación.",
          backupStep: "Crear snapshot del volumen antes de eliminarlo.",
        },
        affectedResources: hasIds
          ? top.map((r) => `${r.resourceId}${r.resourceType ? ` (${r.resourceType})` : ""}`)
          : [`Almacenamiento de bloque (${region})`],
        topResources: top,
        assumptions: [unattachedPctAssumption],
      });
    }

    return findings;
  },
};

// ─── Rule: Excessive Snapshots ───────────────────────────────────────────────

export const excessiveSnapshotsRule: RuleDefinition = {
  id: "STORAGE-SNAP-001",
  name: "Snapshots potencialmente obsoletos",
  category: "excessive-snapshots",
  description:
    "Gasto en snapshots que podría incluir copias obsoletas (>90 días sin AMI/imagen asociada).",
  reference:
    "El % de snapshots obsoletos es una estimación editorial ajustable (ver panel Supuestos); no hay un benchmark público verificado. Confírmalo listando snapshots sin imagen asociada de más de 90 días.",
  evaluate: (records: NormalizedCostRecord[]): Finding[] => {
    const findings: Finding[] = [];

    const snapshotRecords = records.filter(
      (r) => r.category === "snapshot" && (r.chargeType === "Usage" || !r.chargeType)
    );
    if (snapshotRecords.length === 0) return findings;

    const byKey: Record<string, NormalizedCostRecord[]> = {};
    for (const r of snapshotRecords) {
      const k = `${r.provider}:${r.region}`;
      if (!byKey[k]) byKey[k] = [];
      byKey[k].push(r);
    }

    for (const [key, recs] of Object.entries(byKey)) {
      const [provider, region] = key.split(":") as [CloudProvider, string];
      const totalCost = sum(recs.map((r) => r.cost));
      const days = new Set(recs.map((r) => r.date)).size || 1;
      const monthlyCost = (totalCost / days) * 30;

      const obsoletePctAssumption: FindingAssumption = {
        id: "obsolete-snapshot-pct",
        label: "% de respaldos (snapshots) antiguos que ya no necesitas",
        value: 0.30,
        min: 0.10,
        max: 0.50,
        step: 0.05,
        source: "Estimación editorial ajustable — no hay benchmark público verificado del % de snapshots obsoletos. Ajusta este valor según tu entorno.",
      };

      const savingsRange = deriveSavingsRange(monthlyCost, [obsoletePctAssumption]);

      if (savingsRange.moderate < 5) continue;

      findings.push({
        id: `EXCESSIVE-SNAP-${provider}-${region}`,
        title: `Respaldos (snapshots) antiguos que podrías depurar`,
        description: `Gasto en snapshots: ~${formatUSD(monthlyCost)}/mes. Rango de ahorro: ${formatUSD(savingsRange.conservative)}–${formatUSD(savingsRange.optimistic)}/mes.`,
        provider,
        service: recs[0].nativeService,
        category: "excessive-snapshots",
        savingsRange,
        estimatedMonthlySavingsUSD: savingsRange.moderate,
        calculationBreakdown: `Costo mensual snapshots: ${formatUSD(monthlyCost)}. Supuesto: ${(obsoletePctAssumption.value * 100).toFixed(0)}% obsoletos (rango: ${pctRange(obsoletePctAssumption)}). Ahorro moderado: ${formatUSD(monthlyCost)} × ${obsoletePctAssumption.value} = ${formatUSD(savingsRange.moderate)}/mes.`,
        effort: "medio",
        risk: "bajo",
        priorityScore: calculatePriority(savingsRange.moderate, "medio", "bajo"),
        confidence: "inferencia",
        reference: excessiveSnapshotsRule.reference,
        pillar: getPillar(provider),
        remediation: {
          description: "Listar snapshots sin imagen asociada de más de 90 días. Eliminar tras confirmar.",
          commands: getSnapshotCommands(provider, region),
          rollbackPlan: "Los snapshots eliminados NO se pueden recuperar. Mantener al menos el más reciente por volumen.",
          backupStep: "Verificar que existe al menos un snapshot reciente antes de eliminar los obsoletos.",
        },
        affectedResources: [`Snapshots (${region})`],
        topResources: [],
        assumptions: [obsoletePctAssumption],
      });
    }

    return findings;
  },
};

// ─── Rule: Object Storage Optimization ───────────────────────────────────────

export const objectStorageOptRule: RuleDefinition = {
  id: "STORAGE-OBJ-001",
  name: "Almacenamiento de objetos sin optimizar por clase de acceso",
  category: "unoptimized-storage-class",
  description:
    "Gasto alto en almacenamiento de objetos que podría bajar moviendo los datos poco accedidos a clases más baratas. Solo AWS y Google Cloud ofrecen movimiento automático (S3 Intelligent-Tiering y Autoclass); en Azure los tiers hot/cool/cold/archive requieren reglas de ciclo de vida, o Smart tier si quieres que sea automático.",
  reference:
    "S3 Intelligent-Tiering (automático: a Infrequent Access a los 30 días y a Archive Instant Access a los 90; tiene cuota de monitorización) — https://docs.aws.amazon.com/AmazonS3/latest/userguide/intelligent-tiering-overview.html. Google Cloud Autoclass (automático; todo entra en Standard y vuelve a Standard al leerse, la clase terminal es Nearline con Archive opcional, los objetos de menos de 128 KiB no bajan de clase; tiene cuota de gestión y cargo de habilitación) — https://cloud.google.com/storage/docs/autoclass. Azure hot/cool/cold/archive NO es automático: requiere reglas de ciclo de vida — https://learn.microsoft.com/en-us/azure/storage/blobs/access-tiers-overview y https://learn.microsoft.com/en-us/azure/storage/blobs/lifecycle-management-overview. CLI verificada: aws s3api put-bucket-lifecycle-configuration — https://docs.aws.amazon.com/AmazonS3/latest/developerguide/s3_example_s3_PutBucketLifecycleConfiguration_section.html",
  evaluate: (records: NormalizedCostRecord[]): Finding[] => {
    const findings: Finding[] = [];

    const objRecords = records.filter(
      (r) => r.category === "object-storage" && (r.chargeType === "Usage" || !r.chargeType)
    );
    if (objRecords.length === 0) return findings;

    const byKey: Record<string, NormalizedCostRecord[]> = {};
    for (const r of objRecords) {
      const k = `${r.provider}:${r.region}`;
      if (!byKey[k]) byKey[k] = [];
      byKey[k].push(r);
    }

    for (const [key, recs] of Object.entries(byKey)) {
      const [provider, region] = key.split(":") as [CloudProvider, string];
      const totalCost = sum(recs.map((r) => r.cost));
      const days = new Set(recs.map((r) => r.date)).size || 1;
      const monthlyCost = (totalCost / days) * 30;

      const infrequentPctAssumption: FindingAssumption = {
        id: "infrequent-data-pct",
        label: "% de datos que casi nunca se leen (acceso infrecuente)",
        value: 0.50,
        min: 0.20,
        max: 0.80,
        step: 0.10,
        source: "Estimación editorial ajustable — el % de datos con acceso infrecuente depende de tu patrón real. Mídelo con la herramienta de tu proveedor: S3 Storage Lens en AWS, las métricas de Azure Monitor sobre la cuenta de almacenamiento en Azure, o Cloud Monitoring y el Storage Insights de Cloud Storage en GCP. No hay benchmark público verificado.",
      };

      const tieringSavingsAssumption: FindingAssumption = {
        id: "tiering-savings-pct",
        label: "% de ahorro al mover esos datos a almacenamiento más barato (tiering)",
        value: 0.40,
        min: 0.25,
        max: 0.68,
        step: 0.05,
        source: "S3 Intelligent-Tiering tiene tiers Infrequent/Archive reales y transiciones automáticas a 30 y 90 días (verificado: https://docs.aws.amazon.com/AmazonS3/latest/userguide/intelligent-tiering-overview.html). El % de ahorro depende de tu patrón de acceso — estimación editorial ajustable.",
      };

      // Provider-correct copy: only AWS and GCP move data automatically.
      const tieringMechanism = getTieringMechanismText(provider);

      const savingsRange = deriveSavingsRange(monthlyCost, [infrequentPctAssumption, tieringSavingsAssumption]);

      if (savingsRange.moderate < 10) continue;

      findings.push({
        id: `OBJ-TIERING-${provider}-${region}`,
        title: `Mover datos poco usados a una clase de almacenamiento más barata`,
        description: `Gasto en almacenamiento de objetos: ~${formatUSD(monthlyCost)}/mes. ${tieringMechanism.description}`,
        provider,
        service: recs[0].nativeService,
        category: "unoptimized-storage-class",
        savingsRange,
        estimatedMonthlySavingsUSD: savingsRange.moderate,
        calculationBreakdown: `Costo mensual: ${formatUSD(monthlyCost)}. Supuestos: ${(infrequentPctAssumption.value * 100).toFixed(0)}% datos infrecuentes (${pctRange(infrequentPctAssumption)}) × ${(tieringSavingsAssumption.value * 100).toFixed(0)}% ahorro (${pctRange(tieringSavingsAssumption)}). Rango: ${formatUSD(savingsRange.conservative)}–${formatUSD(savingsRange.optimistic)}/mes.`,
        effort: "bajo",
        risk: "bajo",
        priorityScore: calculatePriority(savingsRange.moderate, "bajo", "bajo"),
        confidence: "inferencia",
        reference: objectStorageOptRule.reference,
        pillar: getPillar(provider),
        remediation: {
          description: tieringMechanism.remediation,
          commands: getObjectStorageCommands(provider, region),
          rollbackPlan: tieringMechanism.rollback,
        },
        affectedResources: [`Object Storage (${region})`],
        topResources: [],
        assumptions: [infrequentPctAssumption, tieringSavingsAssumption],
      });
    }

    return findings;
  },
};

// ─── Rule: Missing Commitments (Savings Plans / Reservations) ────────────────

export const missingCommitmentsRule: RuleDefinition = {
  id: "COMMIT-001",
  name: "Sin compromisos de descuento (SP/RI/CUD)",
  category: "missing-commitment",
  description:
    "Gasto significativo On-Demand/Pay-As-You-Go sin compromisos. Cada proveedor publica su propio techo de descuento (ver el hallazgo concreto).",
  reference:
    "Techos de descuento verificados por proveedor el 2026-07-24 (ver el texto del hallazgo). El % aplicable a tu plazo y forma de pago concretos sigue siendo un supuesto ajustable. Recomendaciones oficiales en Cost Explorer: https://docs.aws.amazon.com/savingsplans/latest/userguide/get-started.html",
  evaluate: (records: NormalizedCostRecord[]): Finding[] => {
    const findings: Finding[] = [];

    const computeRecords = records.filter(
      (r) => (r.category === "compute" || r.category === "serverless" || r.category === "database") &&
        (r.chargeType === "Usage" || !r.chargeType)
    );
    if (computeRecords.length === 0) return findings;

    // Group by provider
    const byProvider: Record<string, NormalizedCostRecord[]> = {};
    for (const r of computeRecords) {
      if (!byProvider[r.provider]) byProvider[r.provider] = [];
      byProvider[r.provider].push(r);
    }

    for (const [provider, recs] of Object.entries(byProvider)) {
      const totalCost = sum(recs.map((r) => r.cost));
      const days = new Set(recs.map((r) => r.date)).size || 1;
      const isCommitted = (r: NormalizedCostRecord) => {
        const chargeType = (r.chargeType || "").toLowerCase();
        return (
          !!r.commitmentDiscountId ||
          chargeType.includes("discountedusage") ||
          chargeType.includes("savingsplan") ||
          chargeType.includes("reservation") ||
          chargeType.includes("commit")
        );
      };
      const uncoveredRecords = recs.filter((r) => !isCommitted(r));
      if (uncoveredRecords.length === 0) continue;

      const uncoveredCost = sum(uncoveredRecords.map((r) => r.cost));
      const monthlyCost = (uncoveredCost / days) * 30;
      const totalMonthlyEligibleCost = (totalCost / days) * 30;
      const coveredMonthlyCost = Math.max(0, totalMonthlyEligibleCost - monthlyCost);
      const coveragePct =
        totalMonthlyEligibleCost > 0
          ? Math.round((coveredMonthlyCost / totalMonthlyEligibleCost) * 1000) / 10
          : 0;

      if (monthlyCost < 500) continue;

      const eligiblePctAssumption: FindingAssumption = {
        id: "eligible-pct",
        label: "% del gasto estable que puedes comprometer con descuento",
        value: 0.70,
        min: 0.40,
        max: 0.90,
        step: 0.10,
        source: "Estimación editorial ajustable — el % de gasto elegible depende de la estabilidad de tu uso. No hay benchmark público verificado. Ajusta según tu entorno.",
      };

      const typedProvider = provider as CloudProvider;
      // Each provider publishes its own ceiling; there is no published floor,
      // so the previous generic "20-72%" range had no source behind it.
      const commitInfo = getCommitmentDiscountInfo(typedProvider);

      const discountPctAssumption: FindingAssumption = {
        id: "discount-pct",
        label: "% de descuento esperado (compromiso 1 año, sin pago adelantado)",
        value: 0.30,
        min: 0.20,
        max: 0.50,
        step: 0.05,
        source: `${commitInfo.ceilingText} Fuente verificada el 2026-07-24: ${commitInfo.sourceUrl}. Ningún proveedor publica un suelo de descuento, así que el % concreto para tu plazo y forma de pago es un supuesto ajustable: usa las recomendaciones nativas de tu proveedor.`,
      };

      const savingsRange = deriveSavingsRange(monthlyCost, [eligiblePctAssumption, discountPctAssumption]);

      findings.push({
        id: `COMMIT-${provider.toUpperCase()}`,
        title: `Contratar descuentos por uso constante (${getCommitmentName(typedProvider)})`,
        description:
          `Gasto compute/DB elegible sin cubrir de ~${formatUSD(monthlyCost)}/mes. ` +
          `Cobertura visible actual: ${coveragePct}% (${formatUSD(coveredMonthlyCost)}/mes cubiertos de ` +
          `${formatUSD(totalMonthlyEligibleCost)}/mes elegibles). ${commitInfo.ceilingText} ` +
          `Rango de ahorro estimado: ${formatUSD(savingsRange.conservative)}–${formatUSD(savingsRange.optimistic)}/mes.`,
        provider: typedProvider,
        service: "Compute + Database",
        category: "missing-commitment",
        savingsRange,
        estimatedMonthlySavingsUSD: savingsRange.moderate,
        calculationBreakdown:
          `Gasto mensual elegible: ${formatUSD(totalMonthlyEligibleCost)}; cubierto: ` +
          `${formatUSD(coveredMonthlyCost)} (${coveragePct}%); On-Demand sin cubrir: ${formatUSD(monthlyCost)}. ` +
          `Supuestos sobre el tramo sin cubrir: ${(eligiblePctAssumption.value * 100).toFixed(0)}% estable ` +
          `(${pctRange(eligiblePctAssumption)}) × ${(discountPctAssumption.value * 100).toFixed(0)}% descuento ` +
          `(${pctRange(discountPctAssumption)}). Rango: ${formatUSD(savingsRange.conservative)}–` +
          `${formatUSD(savingsRange.optimistic)}/mes.`,
        effort: "bajo",
        risk: "medio",
        priorityScore: calculatePriority(savingsRange.moderate, "bajo", "medio"),
        confidence: "inferencia",
        reference: `${commitInfo.ceilingText} Fuente verificada el 2026-07-24: ${commitInfo.sourceUrl}. El % aplicable a tu plazo y forma de pago concretos es un supuesto ajustable (ver panel Supuestos).`,
        // NOT getPillar(): that one is about decommissioning unused resources
        // (COST04-BP03), which is the opposite of this finding — here the resources
        // are in use and the recommendation is to change their PRICING MODEL.
        // Citing the decommissioning best practice alongside "contrata un Savings
        // Plan" was a contradiction the reader could check.
        pillar: getCommitmentPillar(typedProvider),
        remediation: {
          description: `Analizar patrón de uso estable y evaluar ${getCommitmentName(typedProvider)} de 1 año sin prepago.`,
          commands: getCommitmentCommands(typedProvider),
          rollbackPlan: "Los compromisos NO son cancelables. Elegir No Upfront/PAYG minimiza riesgo.",
        },
        affectedResources: ["Compute + Database (gasto elegible On-Demand sin cubrir)"],
        topResources: [],
        assumptions: [eligiblePctAssumption, discountPctAssumption],
        // Shares its scope with legacyGenerationRule (optimize stage, AWS
        // only) and utilizationReviewRule (eliminate stage): all three draw
        // from the same provider's uncommitted compute spend. This finding is
        // "commit" — it applies to what's LEFT after elimination/rightsizing,
        // not to the full uncovered base — enforced centrally in
        // calculate-savings.ts's buildPortfolio().
        scopeId: `${typedProvider}:compute-pool`,
        stage: "commit",
        stacking: "sequential",
      });
    }

    return findings;
  },
};

// ─── Command Generators ──────────────────────────────────────────────────────

function getBlockStorageCommands(provider: CloudProvider, region: string): RemediationCommand[] {
  if (provider === "aws") {
    return [
      { provider, tool: "cli", label: "Listar volúmenes no adjuntos", snippet: `aws ec2 describe-volumes --region ${region} \\\n  --filters Name=status,Values=available \\\n  --query "Volumes[*].{ID:VolumeId,Size:Size,Type:VolumeType,Created:CreateTime}" \\\n  --output table`, isInvestigation: true, isIrreversible: false },
      { provider, tool: "cli", label: "Crear snapshot de respaldo", snippet: `aws ec2 create-snapshot --volume-id <VOL_ID> \\\n  --description "Backup before deletion" --region ${region}`, isInvestigation: false, isIrreversible: false },
      { provider, tool: "cli", label: "Eliminar volumen", snippet: `aws ec2 delete-volume --volume-id <VOL_ID> --region ${region}`, isInvestigation: false, isIrreversible: true },
    ];
  }
  if (provider === "azure") {
    return [
      { provider, tool: "cli", label: "Listar discos no adjuntos", snippet: `az disk list --query "[?managedBy==null].{Name:name, Size:diskSizeGb, RG:resourceGroup, SKU:sku.name}" -o table`, isInvestigation: true, isIrreversible: false },
      { provider, tool: "cli", label: "Crear snapshot de respaldo", snippet: `az snapshot create --name <SNAP_NAME> --resource-group <RG> --source <DISK_ID>`, isInvestigation: false, isIrreversible: false },
      { provider, tool: "cli", label: "Eliminar disco", snippet: `az disk delete --name <DISK_NAME> --resource-group <RG> --yes`, isInvestigation: false, isIrreversible: true },
    ];
  }
  return [
    { provider, tool: "cli", label: "Listar discos no adjuntos", snippet: `gcloud compute disks list --filter="NOT users:*" --format="table(name,sizeGb,type,zone)"`, isInvestigation: true, isIrreversible: false },
    { provider, tool: "cli", label: "Crear snapshot de respaldo", snippet: `gcloud compute disks snapshot <DISK_NAME> --zone=<ZONE> --snapshot-names=<SNAP_NAME>`, isInvestigation: false, isIrreversible: false },
    { provider, tool: "cli", label: "Eliminar disco", snippet: `gcloud compute disks delete <DISK_NAME> --zone=<ZONE>`, isInvestigation: false, isIrreversible: true },
  ];
}

function getSnapshotCommands(provider: CloudProvider, region: string): RemediationCommand[] {
  if (provider === "aws") {
    return [
      { provider, tool: "cli", label: "Listar snapshots propios (>90 días)", snippet: `# Fecha de corte 90 días atrás (macOS / Linux):\nCUTOFF=$(date -v-90d +%Y-%m-%d)              # macOS\n# CUTOFF=$(date -d "90 days ago" +%Y-%m-%d)  # Linux (GNU)\naws ec2 describe-snapshots --owner-ids self --region ${region} \\\n  --query "Snapshots[?StartTime<='$CUTOFF'].{ID:SnapshotId,Size:VolumeSize,Date:StartTime}" \\\n  --output table`, isInvestigation: true, isIrreversible: false },
      { provider, tool: "cli", label: "Eliminar snapshot", snippet: `aws ec2 delete-snapshot --snapshot-id <SNAP_ID> --region ${region}`, isInvestigation: false, isIrreversible: true },
    ];
  }
  if (provider === "azure") {
    return [
      { provider, tool: "cli", label: "Listar snapshots antiguos", snippet: `# Fecha de corte 90 días atrás (macOS / Linux):\nCUTOFF=$(date -v-90d +%Y-%m-%d)              # macOS\n# CUTOFF=$(date -d "90 days ago" +%Y-%m-%d)  # Linux (GNU)\naz snapshot list --query "[?timeCreated<'$CUTOFF'].{Name:name, Size:diskSizeGb, RG:resourceGroup, Created:timeCreated}" -o table`, isInvestigation: true, isIrreversible: false },
      { provider, tool: "cli", label: "Eliminar snapshot", snippet: `az snapshot delete --name <SNAP_NAME> --resource-group <RG>`, isInvestigation: false, isIrreversible: true },
    ];
  }
  return [
    { provider, tool: "cli", label: "Listar snapshots antiguos", snippet: `# Fecha de corte 90 días atrás (macOS / Linux):\nCUTOFF=$(date -v-90d +%Y-%m-%d)              # macOS\n# CUTOFF=$(date -d "90 days ago" +%Y-%m-%d)  # Linux (GNU)\ngcloud compute snapshots list --filter="creationTimestamp<$CUTOFF" --format="table(name,diskSizeGb,creationTimestamp)"`, isInvestigation: true, isIrreversible: false },
    { provider, tool: "cli", label: "Eliminar snapshot", snippet: `gcloud compute snapshots delete <SNAP_NAME>`, isInvestigation: false, isIrreversible: true },
  ];
}

/**
 * The three products are NOT equivalent (verified 2026-07-24):
 *  - S3 Intelligent-Tiering: automatic (IA at 30 days, Archive Instant Access at 90),
 *    with a per-object monitoring fee.
 *  - GCS Autoclass: automatic, terminal class Nearline (Archive optional), objects
 *    under 128 KiB never demote, management fee + enabling charge.
 *  - Azure hot/cool/cold/archive: NOT automatic — needs lifecycle management rules.
 *    Smart tier is the automatic equivalent. Archive is offline: rehydration can take
 *    hours and has early-deletion penalties.
 */
function getTieringMechanismText(provider: CloudProvider): {
  description: string;
  remediation: string;
  rollback: string;
} {
  if (provider === "aws") {
    return {
      description:
        "S3 Intelligent-Tiering mueve los objetos automáticamente: a Infrequent Access tras 30 días sin acceso y a Archive Instant Access tras 90. Cobra una cuota de monitorización por objeto, así que no conviene para objetos muy pequeños.",
      remediation:
        "Habilita S3 Intelligent-Tiering (lifecycle con transición a INTELLIGENT_TIERING o la clase directamente al escribir). Ten en cuenta la cuota de monitorización por objeto.",
      rollback:
        "Desactiva la regla de lifecycle. Los objetos ya movidos siguen accesibles; Infrequent Access y Archive Instant Access se leen sin restauración previa.",
    };
  }
  if (provider === "azure") {
    return {
      description:
        "En Azure los tiers hot, cool, cold y archive NO mueven los datos por sí solos: necesitas reglas de ciclo de vida (lifecycle management) que definan las transiciones, o activar Smart tier si quieres el movimiento automático. Archive además es offline: rehidratar puede tardar horas y tiene penalización por borrado temprano.",
      remediation:
        "Define una política de lifecycle management con las transiciones que quieras (hot → cool → cold), o activa Smart tier si prefieres que Azure decida automáticamente. Evita archive para datos que puedas necesitar en minutos.",
      rollback:
        "Elimina la regla de lifecycle o cambia el tier del blob a mano. Cuidado: volver desde archive requiere rehidratación (horas) y los cambios de tier pueden incurrir en penalización por borrado temprano.",
    };
  }
  return {
    description:
      "Google Cloud Autoclass mueve los objetos automáticamente y los devuelve a Standard al leerse; la clase terminal es Nearline (Archive es opcional) y los objetos de menos de 128 KiB no bajan de clase. Tiene cuota de gestión y un cargo por habilitarlo.",
    remediation:
      "Habilita Autoclass en el bucket. Recuerda la cuota de gestión y el cargo de habilitación, y que los objetos por debajo de 128 KiB no cambian de clase.",
    rollback:
      "Desactiva Autoclass en el bucket. Los objetos permanecen en la clase en la que estén y siguen accesibles.",
  };
}

function getObjectStorageCommands(provider: CloudProvider, region: string): RemediationCommand[] {
  if (provider === "aws") {
    return [
      { provider, tool: "cli", label: "Ver métricas de acceso con S3 Storage Lens", snippet: `aws s3control get-storage-lens-configuration \\\n  --account-id <ACCOUNT_ID> \\\n  --config-id default-account-dashboard`, isInvestigation: true, isIrreversible: false },
      { provider, tool: "cli", label: "Configurar lifecycle para Intelligent-Tiering", snippet: `aws s3api put-bucket-lifecycle-configuration \\\n  --bucket <BUCKET_NAME> \\\n  --lifecycle-configuration '{\n    "Rules": [{"ID": "AutoTiering", "Status": "Enabled",\n      "Filter": {"Prefix": ""},\n      "Transitions": [{"Days": 0, "StorageClass": "INTELLIGENT_TIERING"}]\n    }]\n  }'`, isInvestigation: false, isIrreversible: false },
    ];
  }
  if (provider === "azure") {
    return [
      { provider, tool: "cli", label: "Ver la política de ciclo de vida actual (Azure no mueve tiers sin ella)", snippet: `az storage account management-policy show \\\n  --account-name <ACCOUNT> --resource-group <RG>`, isInvestigation: true, isIrreversible: false },
      { provider, tool: "cli", label: "Crear reglas de ciclo de vida (hot → cool → cold)", snippet: `# Azure NO mueve los datos automáticamente entre tiers: define las transiciones\n# en lifecycle-policy.json (tierToCool / tierToCold / tierToArchive con daysAfterModificationGreaterThan).\naz storage account management-policy create \\\n  --account-name <ACCOUNT> --resource-group <RG> \\\n  --policy @lifecycle-policy.json`, isInvestigation: false, isIrreversible: false },
      { provider, tool: "console", label: "Alternativa automática: activar Smart tier", snippet: `Portal de Azure → Storage account → Configuration → Smart tier.\nEs el equivalente automático a S3 Intelligent-Tiering / Autoclass:\nsin Smart tier ni reglas de ciclo de vida, los blobs se quedan en el tier en el que están.`, isInvestigation: false, isIrreversible: false },
    ];
  }
  return [
    { provider, tool: "cli", label: "Ver clase de almacenamiento actual", snippet: `gsutil ls -L gs://<BUCKET_NAME>/ | grep "Storage class"`, isInvestigation: true, isIrreversible: false },
    { provider, tool: "cli", label: "Habilitar Autoclass (clase terminal Nearline; objetos <128 KiB no bajan de clase)", snippet: `gcloud storage buckets update gs://<BUCKET_NAME> --enable-autoclass`, isInvestigation: false, isIrreversible: false },
  ];
}

function getCommitmentCommands(provider: CloudProvider): RemediationCommand[] {
  if (provider === "aws") {
    return [
      { provider, tool: "cli", label: "Ver recomendaciones de Savings Plans", snippet: `aws ce get-savings-plans-purchase-recommendation \\\n  --savings-plans-type COMPUTE_SP \\\n  --term-in-years ONE_YEAR \\\n  --payment-option NO_UPFRONT \\\n  --lookback-period-in-days SIXTY_DAYS`, isInvestigation: true, isIrreversible: false },
      { provider, tool: "console", label: "Comprar Savings Plan (consola)", snippet: `Ir a: Cost Explorer > Savings Plans > Recommendations\nEvaluar compromiso basado en uso estable de últimos 60 días.`, isInvestigation: false, isIrreversible: true },
    ];
  }
  if (provider === "azure") {
    return [
      { provider, tool: "cli", label: "Ver recomendaciones de reservas", snippet: `az consumption reservation recommendation list \\\n  --scope shared --look-back-period Last60Days`, isInvestigation: true, isIrreversible: false },
      { provider, tool: "console", label: "Comprar reserva (portal)", snippet: `Ir a: Azure Portal > Reservations > Add\nEvaluar reserva de 1 año para VMs estables.`, isInvestigation: false, isIrreversible: true },
    ];
  }
  return [
    { provider, tool: "cli", label: "Ver recomendaciones de CUDs", snippet: `gcloud billing budgets list\ngcloud compute commitments list --project=<PROJECT_ID>`, isInvestigation: true, isIrreversible: false },
    { provider, tool: "console", label: "Comprar CUD (consola)", snippet: `Ir a: Cloud Console > Compute Engine > Committed Use Discounts\nEvaluar CUD de 1 año para recursos estables.`, isInvestigation: false, isIrreversible: true },
  ];
}

/**
 * Published commitment-discount ceilings per provider, verified 2026-07-24.
 * Cited per provider instead of as a single cross-cloud range: the old
 * "20-72%" mixed all three clouds and no provider publishes a floor at all.
 */
function getCommitmentDiscountInfo(provider: CloudProvider): { ceilingText: string; sourceUrl: string } {
  const info: Record<CloudProvider, { ceilingText: string; sourceUrl: string }> = {
    aws: {
      ceilingText:
        "AWS publica hasta 66% de descuento con Compute Savings Plans y hasta 72% con EC2 Instance Savings Plans (ligados a familia y región).",
      sourceUrl:
        "https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/select-the-best-pricing-model.html",
    },
    azure: {
      ceilingText:
        "Azure publica hasta 72% de descuento con Reservations y hasta 65% con el Savings Plan for Compute.",
      sourceUrl:
        "https://learn.microsoft.com/en-us/azure/cost-management-billing/reservations/save-compute-costs-reservations",
    },
    gcp: {
      ceilingText:
        "Google Cloud publica hasta 55% con CUD basados en recurso (hasta 70% en máquinas optimizadas para memoria) y 28% a un año o 46% a tres años con los CUD flexibles de Compute.",
      sourceUrl:
        "https://cloud.google.com/compute/docs/instances/committed-use-discounts-overview",
    },
  };
  return info[provider];
}

function getCommitmentName(provider: CloudProvider): string {
  const names: Record<CloudProvider, string> = {
    aws: "Compute Savings Plans",
    azure: "Azure Reservations",
    gcp: "Committed Use Discounts (CUDs)",
  };
  return names[provider];
}
