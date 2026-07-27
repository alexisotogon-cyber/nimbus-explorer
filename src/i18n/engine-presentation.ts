import type { Finding, FindingAssumption } from "@/engine/types";
import type { Locale } from "./config";

type FindingPresentation = {
  title: string;
  description: string;
  metric: string;
  nextAction: string;
  rollback: string;
};

const EN_FINDINGS: Record<string, Omit<FindingPresentation, "metric">> = {
  "unused-elastic-ips": {
    title: "Release public IP addresses that are no longer needed",
    description: "Billing shows public IP charges that may include addresses with no active workload.",
    nextAction: "List unassociated addresses, confirm ownership, then release only the approved ones.",
    rollback: "Reserve a replacement address and restore the DNS or allow-list reference if required.",
  },
  "utilization-review": {
    title: "Review utilization with operational metrics",
    description: "Billing alone cannot prove that these resources are idle; usage metrics are required.",
    nextAction: "Review the provider metrics for the affected resources before resizing or stopping anything.",
    rollback: "Restore the previous capacity or configuration if service indicators deteriorate.",
  },
  "legacy-generation": {
    title: "Move legacy compute to a current generation",
    description: "A newer instance generation can offer equivalent capacity at a lower public rate.",
    nextAction: "Benchmark one non-critical workload on the proposed generation before migrating the fleet.",
    rollback: "Return the workload to its previous instance family and size.",
  },
  "nat-gateway-overuse": {
    title: "Reduce internet egress cost through private endpoints",
    description: "Part of the NAT Gateway traffic may be eligible for lower-cost provider-native endpoints.",
    nextAction: "Use flow logs to identify the top NAT destinations before creating any endpoint.",
    rollback: "Remove the endpoint and restore the prior route through the NAT Gateway.",
  },
  "unattached-storage": {
    title: "Review block storage that may be unattached",
    description: "The bill contains block-storage charges that should be checked against attachment state.",
    nextAction: "Confirm the volume is unattached and has a valid backup before deleting it.",
    rollback: "Restore the volume from its snapshot and attach it to the original workload.",
  },
  "excessive-snapshots": {
    title: "Retire obsolete snapshots under a retention policy",
    description: "Snapshot cost can accumulate when old recovery points outlive their retention requirement.",
    nextAction: "Validate the retention and compliance policy, then remove only snapshots outside it.",
    rollback: "Restore from a retained copy or backup catalog if a deleted recovery point is needed.",
  },
  "unoptimized-storage-class": {
    title: "Move infrequently accessed data to a lower-cost storage class",
    description: "A portion of object-storage spend may be suitable for infrequent or archive tiers.",
    nextAction: "Measure access frequency and test a lifecycle policy on a limited prefix first.",
    rollback: "Restore the prior storage class or remove the lifecycle transition rule.",
  },
  "missing-commitment": {
    title: "Cover stable usage with commitment discounts",
    description: "Stable eligible spend is currently priced without a reservation or savings commitment.",
    nextAction: "Use the provider recommendation and hourly coverage data before purchasing a commitment.",
    rollback: "Do not purchase until the scope, term and utilization target are approved; commitments are not instantly reversible.",
  },
  "ai-visibility": {
    title: "Improve AI cost visibility and allocation",
    description: "AI-related charges are present but need clearer ownership and workload attribution.",
    nextAction: "Apply workload, model and owner tags and validate them in the next billing export.",
    rollback: "Remove or correct the new allocation tags if they conflict with the existing taxonomy.",
  },
  "ai-gpu-review": {
    title: "Review GPU utilization before changing capacity",
    description: "GPU cost is material, but billing data does not contain the utilization needed to prove waste.",
    nextAction: "Compare GPU, memory and queue metrics with the workload SLO before resizing.",
    rollback: "Restore the prior accelerator type and capacity if throughput or latency degrades.",
  },
  "ai-batch-opportunity": {
    title: "Use batch inference for delay-tolerant AI workloads",
    description: "Some inference demand may qualify for a lower-cost asynchronous batch path.",
    nextAction: "Classify delay-tolerant requests and run a small batch comparison with the same model inputs.",
    rollback: "Route the workload back to the on-demand endpoint.",
  },
  "ai-endpoint-idle": {
    title: "Reduce reserved AI endpoint capacity during intermittent demand",
    description: "Managed endpoint capacity may remain allocated between bursts of inference traffic.",
    nextAction: "Review invocation and latency metrics, then test lower minimum capacity in a safe window.",
    rollback: "Restore the previous minimum capacity and autoscaling limits.",
  },
  "ai-cost-attribution": {
    title: "Add owner and workload attribution to AI spend",
    description: "AI charges cannot be governed reliably until they can be assigned to a team and use case.",
    nextAction: "Define mandatory allocation tags and monitor unallocated AI cost as a quality metric.",
    rollback: "Revert tag-policy changes if they block deployment, then correct the policy in a test scope.",
  },
};

export function findingPresentation(finding: Finding, locale: Locale): FindingPresentation {
  if (locale === "es") {
    return {
      title: finding.title,
      description: finding.description,
      metric: finding.assumptions[0]?.label ?? "Uso y costo del recurso en la consola del proveedor.",
      nextAction: finding.remediation.description,
      rollback: finding.remediation.rollbackPlan,
    };
  }

  const translated = EN_FINDINGS[finding.category] ?? {
    title: `Review ${finding.service} cost opportunity`,
    description: "Nimbus detected a billing pattern that warrants operational validation.",
    nextAction: "Validate the affected resources and metrics before applying any change.",
    rollback: "Restore the previous configuration if the validated service indicators deteriorate.",
  };

  return {
    ...translated,
    metric: assumptionPresentation(finding.assumptions[0], locale).label,
  };
}

const EN_ASSUMPTIONS: Record<string, { label: string; source: string }> = {
  "recoverable-idle-ip-pct": {
    label: "% of public IP charges attributable to releasable addresses",
    source: "Adjustable estimate. Billing does not prove whether an address is unused; verify association and ownership in the provider inventory.",
  },
  "gen-migration-savings-pct": {
    label: "% savings from moving to the proposed compute generation",
    source: "Verified against the provider public price list. The actual delta varies by region, operating system and instance size.",
  },
  "endpoint-traffic-pct": {
    label: "% of traffic that can use private provider endpoints",
    source: "Adjustable estimate. Measure eligible destinations with flow logs; there is no verified public benchmark for your traffic mix.",
  },
  "unattached-pct": {
    label: "% of paid block storage confirmed as unattached",
    source: "Adjustable estimate. Verify attachment state and backup coverage in your environment.",
  },
  "obsolete-snapshot-pct": {
    label: "% of snapshots outside the approved retention policy",
    source: "Adjustable estimate. There is no public benchmark for obsolete snapshots; validate retention and compliance requirements.",
  },
  "infrequent-data-pct": {
    label: "% of data with infrequent access",
    source: "Adjustable estimate. Measure the real access pattern with the provider storage analytics and monitoring tools.",
  },
  "tiering-savings-pct": {
    label: "% savings from moving eligible data to lower-cost storage tiers",
    source: "Provider storage tiers are verified; the realized saving depends on access frequency, retrieval charges and minimum retention.",
  },
  "eligible-pct": {
    label: "% of stable spend eligible for a commitment",
    source: "Adjustable estimate. Eligibility depends on hourly usage stability; validate it with the provider recommendation.",
  },
  "discount-pct": {
    label: "% expected discount for a one-year commitment without upfront payment",
    source: "Provider discount ceilings are published, but the actual discount depends on scope, term, payment option and utilization.",
  },
  "batch-tolerance-pct": {
    label: "% of workloads that tolerate batch inference",
    source: "Adjustable architecture estimate. Classify workloads by latency requirement; no verified public benchmark applies to your mix.",
  },
  "batch-discount": {
    label: "% savings from batch inference versus on-demand",
    source: "Verified in the provider documentation linked by the finding.",
  },
  "serverless-inference-savings": {
    label: "% savings from reducing reserved endpoint capacity",
    source: "Adjustable estimate based on invocation frequency and idle time; validate with endpoint metrics.",
  },
};

/**
 * Some assumption ids carry a provider/family namespace to keep genuinely
 * different bands from colliding in scenarios.ts's getScenarioVariables()
 * (e.g. "aws:recoverable-idle-ip-pct", "aws:gen-migration-savings-pct:t2").
 * The EN copy below is written per semantic concept, not per provider/family,
 * so presentation looks up the middle segment — the semantic key — not the
 * full unique id.
 */
function baseAssumptionId(id: string): string {
  const parts = id.split(":");
  return parts.length > 1 ? parts[1] : parts[0];
}

export function assumptionPresentation(
  assumption: FindingAssumption | undefined,
  locale: Locale
): { label: string; source?: string } {
  if (!assumption) {
    return {
      label: locale === "es"
        ? "Uso y costo del recurso en la consola del proveedor."
        : "Resource usage and cost in the provider console.",
    };
  }
  if (locale === "es") return { label: assumption.label, source: assumption.source };

  const translated = EN_ASSUMPTIONS[baseAssumptionId(assumption.id)];
  if (!translated) {
    return {
      label: "Adjustable financial variable",
      source: "Validate this value with operational metrics from your environment.",
    };
  }
  const urls = assumption.source?.match(/https?:\/\/[^\s)]+/g) ?? [];
  return {
    label: translated.label,
    source: `${translated.source}${urls.length ? ` ${urls.join(" ")}` : ""}`,
  };
}
