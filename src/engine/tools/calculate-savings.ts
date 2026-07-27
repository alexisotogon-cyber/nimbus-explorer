import {
  NormalizedCostRecord,
  AuditReport,
  CloudProvider,
  SavingsRange,
  Finding,
  BillingConceptCoverage,
} from "../types";
import { allRules } from "../rules";
import { buildAiSpendSummary } from "../rules/ai-spend";
import { queryBilling, summarizeByCategory } from "./query-billing";
import { analyzeTrends } from "../trends";
import { MIN_DISTINCT_DAYS, distinctDayCount } from "../rules/thresholds";
import { ParseDiagnostics } from "../parsers/coerce";
import { buildFinancialReconciliation } from "../financial-reconciliation";
import { combinePortfolio, PortfolioLineItem } from "../portfolio";

/**
 * Tool: calculate_savings
 * Runs ALL deterministic rules on normalized records.
 * Produces the full audit report with auditable figures.
 */

/**
 * Adapts findings (with savingsModel already attached) to the shared
 * combinePortfolio() engine — same function scenarios.ts uses, so the
 * "current" scenario always reproduces this report's own portfolioSavingsUSD.
 */
function buildPortfolio(estimableFindings: Finding[]): {
  grossOpportunityUSD: number;
  portfolioSavingsUSD: number;
  excludedAlternativeFindingIds: string[];
} {
  const items: PortfolioLineItem[] = estimableFindings.map((finding) => ({
    findingId: finding.id,
    scopeId: finding.savingsModel?.scopeId ?? `solo:${finding.id}`,
    stacking: finding.savingsModel?.stacking ?? "independent",
    stage: finding.savingsModel?.stage ?? "optimize",
    exclusiveGroupId: finding.savingsModel?.exclusiveGroupId,
    baseMonthlyCostUSD: finding.savingsModel?.baseMonthlyCostUSD ?? finding.estimatedMonthlySavingsUSD,
    priorityScore: finding.priorityScore,
    savingsUSD: finding.estimatedMonthlySavingsUSD,
  }));
  const result = combinePortfolio(items);
  return {
    grossOpportunityUSD: result.grossUSD,
    portfolioSavingsUSD: result.portfolioUSD,
    excludedAlternativeFindingIds: result.excludedFindingIds,
  };
}

export function calculateSavings(
  records: NormalizedCostRecord[],
  isFocus = false,
  diagnostics?: ParseDiagnostics,
  billingCoverage?: BillingConceptCoverage
): AuditReport {
  // 1. Query billing data
  const billing = queryBilling(records);

  // 2. Execute all rules, honouring each rule's minimum data window.
  //    Enforced HERE rather than inside each rule so the threshold quoted to the
  //    user in the file-diagnosis panel and the threshold the engine applies are
  //    literally the same constant (see rules/thresholds.ts).
  const distinctDays = distinctDayCount(records);
  const summaryOnly =
    records.length > 0 &&
    records.every((record) => record.source?.extensions?.analysisLevel === "summary");
  const summaryGranularity = summaryOnly
    ? records[0]?.source?.extensions?.granularity as "hourly" | "daily" | "monthly" | undefined
    : undefined;
  const summaryGroupBy = summaryOnly
    ? String(records[0]?.source?.extensions?.summaryGroupByLabel ?? "")
    : undefined;
  const allFindings: Finding[] = [];
  let suppressedRules = 0;
  for (const rule of allRules) {
    // Cost Explorer chart downloads are aggregate evidence. They can prove
    // spend and trends, but not resource idleness or rightsizing. Applying the
    // detailed rules to a service/region total would invent confidence.
    if (summaryOnly) {
      suppressedRules++;
      continue;
    }
    const required = rule.minDistinctDays ?? 0;
    if (distinctDays < required) {
      suppressedRules++;
      continue;
    }
    try {
      const findings = rule.evaluate(records);
      allFindings.push(...findings);
    } catch (error) {
      console.error(`Error in rule ${rule.id}:`, error);
    }
  }

  // 3. Sort by priority (highest first)
  for (const finding of allFindings) {
    const assumptionProduct = finding.assumptions.reduce(
      (product, assumption) => product * assumption.value,
      1
    );
    const baseMonthlyCostUSD =
      finding.assumptions.length > 0 && assumptionProduct > 0
        ? finding.estimatedMonthlySavingsUSD / assumptionProduct
        : finding.estimatedMonthlySavingsUSD;
    finding.ruleId ??= finding.id.replace(/-\d+$/, "");
    // Portfolio metadata: rules that KNOWINGLY overlap another rule's money
    // (see rules/storage-waste.ts missingCommitmentsRule and
    // rules/oversized-instances.ts legacyGenerationRule) declare scopeId/stage/
    // stacking themselves. Everything else defaults to its own independent
    // scope, which reproduces today's plain-sum behavior exactly.
    const stacking = finding.stacking ?? "independent";
    const stage = finding.stage ?? "optimize";
    const scopeId = finding.scopeId ?? `solo:${finding.id}`;
    finding.savingsModel = {
      version: finding.scopeId ? "portfolio-v2" : "multiplicative-v1",
      baseMonthlyCostUSD: Math.round(baseMonthlyCostUSD * 100) / 100,
      variableIds: finding.assumptions.map((assumption) => assumption.id),
      scopeId,
      stacking,
      stage,
      exclusiveGroupId: finding.exclusiveGroupId,
    };
  }

  allFindings.sort((a, b) => b.priorityScore - a.priorityScore);

  // 4. Calculate totals (using moderate estimates)
  const totalEstimatedSavingsUSD = allFindings.reduce(
    (sum, f) => sum + f.estimatedMonthlySavingsUSD, 0
  );

  // Separate estimable findings from those out of the billing's scope.
  // "fuera-de-alcance-del-billing" findings have theoretical optimistic values
  // with no evidence, so they must NOT inflate the headline range.
  const estimableFindings = allFindings.filter(
    (f) => f.confidence !== "fuera-de-alcance-del-billing"
  );
  const reviewPendingFindings = allFindings.filter(
    (f) => f.confidence === "fuera-de-alcance-del-billing"
  );

  const { grossOpportunityUSD, portfolioSavingsUSD, excludedAlternativeFindingIds } =
    buildPortfolio(estimableFindings);

  // Total savings range — estimable findings only
  const totalSavingsRange: SavingsRange = {
    conservative: estimableFindings.reduce((sum, f) => sum + f.savingsRange.conservative, 0),
    moderate: estimableFindings.reduce((sum, f) => sum + f.estimatedMonthlySavingsUSD, 0),
    optimistic: estimableFindings.reduce((sum, f) => sum + f.savingsRange.optimistic, 0),
  };

  // Theoretical additional savings pending metrics review (out-of-scope findings).
  const reviewPendingOptimisticUSD = reviewPendingFindings.reduce(
    (sum, f) => sum + f.savingsRange.optimistic, 0
  );

  // Uses portfolioSavingsUSD (post anti-double-counting), not the naive sum:
  // this percentage is the one printed on the headline, so it must match it.
  const savingsPercentage =
    billing.projectedMonthlyCost > 0
      ? (portfolioSavingsUSD / billing.projectedMonthlyCost) * 100
      : 0;

  // 5. Category summaries
  const summaryByCategory = summarizeByCategory(allFindings);

  // 6. Enrich service breakdown with savings
  const serviceBreakdown = billing.serviceBreakdown.map((s) => {
    const serviceFindings = allFindings.filter((f) =>
      f.service.toLowerCase().includes(s.service.toLowerCase()) ||
      s.service.toLowerCase().includes(f.service.toLowerCase())
    );
    return {
      ...s,
      potentialSavingsUSD: serviceFindings.reduce(
        (sum, f) => sum + f.estimatedMonthlySavingsUSD, 0
      ),
      findingCount: serviceFindings.length,
    };
  });

  // 7. Detect providers (exclude "unknown" from CloudProvider union)
  const providers = Array.from(new Set(
    records.map((r) => r.provider).filter((p): p is import("../types").CloudProvider =>
      p === "aws" || p === "azure" || p === "gcp"
    )
  ));

  return {
    generatedAt: new Date().toISOString(),
    periodStart: billing.periodStart,
    periodEnd: billing.periodEnd,
    providers,
    isFocusSource: isFocus,
    billingCoverage,
    financialReconciliation: buildFinancialReconciliation(
      records,
      billing.projectedMonthlyCost,
      diagnostics
    ),
    totalCostUSD: billing.projectedMonthlyCost,
    totalEstimatedSavingsUSD: Math.round(totalEstimatedSavingsUSD * 100) / 100,
    grossOpportunityUSD,
    portfolioSavingsUSD,
    excludedAlternativeFindingIds,
    totalSavingsRange: {
      conservative: Math.round(totalSavingsRange.conservative * 100) / 100,
      moderate: Math.round(totalSavingsRange.moderate * 100) / 100,
      optimistic: Math.round(totalSavingsRange.optimistic * 100) / 100,
    },
    reviewPendingOptimisticUSD: Math.round(reviewPendingOptimisticUSD * 100) / 100,
    savingsPercentage: Math.round(savingsPercentage * 10) / 10,
    findings: allFindings,
    summaryByCategory,
    summaryByService: serviceBreakdown,
    trendInsights: analyzeTrends(records),
    dataWindow: {
      distinctDays,
      requiredDays: MIN_DISTINCT_DAYS,
      suppressedRules,
    },
    observationDays: distinctDays,
    observationGranularity: summaryGranularity,
    observationPeriods: summaryOnly ? distinctDays : undefined,
    analysisLevel: summaryOnly ? "summary" : "detailed",
    breakdownDimension: summaryGroupBy || undefined,
    aiSpendSummary: buildAiSpendSummary(records),
  };
}
