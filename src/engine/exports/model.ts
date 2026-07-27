import type { StoredAnalysis } from "@/engine/analysis-store";
import { calculateScenario, getScenarioVariables } from "@/engine/scenarios";
import type { Finding } from "@/engine/types";
import type { Locale } from "@/i18n/config";

export interface ExportFinding {
  id: string;
  priority: number;
  provider: string;
  service: string;
  title: string;
  description: string;
  savingsLow: number;
  savingsCurrent: number;
  savingsHigh: number;
  annualSavings: number;
  effort: string;
  risk: string;
  confidence: string;
  affectedCost: number;
  remainingCost: number;
  resources: string[];
  calculation: string;
  source: string;
  nextAction: string;
  rollback: string;
}

export interface ReportExportModel {
  locale: Locale;
  meta: {
    analysisId: string;
    generatedAt: string;
    periodStart: string;
    periodEnd: string;
    providers: string[];
    totalRows: number;
  };
  financials: {
    periodGross: number;
    gross: number;
    credits: number;
    taxes: number;
    commitmentPurchases: number;
    net: number;
    complete: boolean;
  };
  savings: {
    conservative: number;
    current: number;
    optimistic: number;
    annual: number;
    percentage: number;
    delta: number;
  };
  findings: ExportFinding[];
  services: Array<{ service: string; cost: number; savings: number; findings: number }>;
  scenarios: Array<{
    id: string;
    label: string;
    current: number;
    min: number;
    max: number;
    sensitivity: number;
    findingCount: number;
    source: string;
  }>;
  trends: Array<{ title: string; detail: string; evidence: string; severity: string }>;
  quality: {
    distinctDays: number;
    requiredDays: number;
    suppressedRules: number;
    coveragePercentage: number | null;
    catalog: string | null;
    catalogAgeDays: number | null;
    unknownColumns: string[];
  };
}

const CATEGORY_ACTION_EN: Record<Finding["category"], string> = {
  "idle-resources": "Review idle resources",
  "utilization-review": "Validate utilization before rightsizing",
  "oversized-instances": "Rightsize oversized compute",
  "unattached-storage": "Review unattached storage",
  "legacy-generation": "Migrate legacy instance generations",
  "missing-commitment": "Evaluate commitment coverage",
  "data-transfer": "Reduce data transfer cost",
  "unoptimized-storage-class": "Optimize storage class",
  "unused-elastic-ips": "Release unused public IPs",
  "excessive-snapshots": "Review obsolete snapshots",
  "nat-gateway-overuse": "Reduce NAT gateway processing",
  "ai-visibility": "Improve AI cost visibility",
  "ai-gpu-review": "Validate GPU utilization",
  "ai-batch-opportunity": "Evaluate batch inference",
  "ai-endpoint-idle": "Review idle AI endpoints",
  "ai-cost-attribution": "Improve AI cost attribution",
};

function findingTitle(finding: Finding, locale: Locale): string {
  return locale === "es"
    ? finding.title
    : `${CATEGORY_ACTION_EN[finding.category]} - ${finding.service}`;
}

function findingDescription(finding: Finding, locale: Locale): string {
  if (locale === "es") return finding.description;
  return `Nimbus detected a cost-optimization opportunity in ${finding.service}. Verify the listed metric and affected resources before making a change.`;
}

function safeFinancialText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function buildReportExportModel(
  stored: StoredAnalysis,
  analysisId: string,
  locale: Locale
): ReportExportModel {
  const report = stored.report;
  const scenario = calculateScenario(report, stored.scenario);
  const scenarioByFinding = new Map(scenario.findings.map((finding) => [finding.findingId, finding]));
  const reconciliation = report.financialReconciliation;
  const variables = getScenarioVariables(report);

  return {
    locale,
    meta: {
      analysisId,
      generatedAt: report.generatedAt,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      providers: report.providers.map((provider) => provider.toUpperCase()),
      totalRows: stored.totalRows,
    },
    financials: {
      periodGross: reconciliation.grossUsageCostUSD,
      gross: reconciliation.projectedMonthlyGrossUsageUSD,
      credits: reconciliation.creditsAndRefundsUSD,
      taxes: reconciliation.taxesUSD,
      commitmentPurchases: reconciliation.commitmentPurchasesUSD,
      net:
        reconciliation.invoiceNetCostUSD ??
        reconciliation.netUsageCostExcludingCommitmentPurchasesUSD,
      complete: reconciliation.isInvoiceNetComplete,
    },
    savings: {
      conservative: report.totalSavingsRange.conservative,
      current: scenario.monthlySavingsUSD,
      optimistic: report.totalSavingsRange.optimistic,
      annual: scenario.annualSavingsUSD,
      percentage: report.totalCostUSD > 0 ? (scenario.monthlySavingsUSD / report.totalCostUSD) * 100 : 0,
      delta: scenario.deltaFromCurrentUSD,
    },
    findings: [...report.findings]
      .sort((left, right) => right.priorityScore - left.priorityScore)
      .map((finding, index) => {
        const current = scenarioByFinding.get(finding.id)?.monthlySavingsUSD ?? finding.estimatedMonthlySavingsUSD;
        const affectedCost = finding.savingsModel?.baseMonthlyCostUSD ?? current;
        return {
          id: finding.id,
          priority: index + 1,
          provider: finding.provider.toUpperCase(),
          service: safeFinancialText(finding.service),
          title: safeFinancialText(findingTitle(finding, locale)),
          description: safeFinancialText(findingDescription(finding, locale)),
          savingsLow: finding.savingsRange.conservative,
          savingsCurrent: current,
          savingsHigh: finding.savingsRange.optimistic,
          annualSavings: current * 12,
          effort: finding.effort,
          risk: finding.risk,
          confidence: finding.confidence,
          affectedCost,
          remainingCost: Math.max(0, affectedCost - current),
          resources: finding.topResources.slice(0, 3).map((resource) => safeFinancialText(resource.resourceId)),
          calculation:
            locale === "es"
              ? safeFinancialText(finding.calculationBreakdown)
              : `Versioned multiplicative model: affected cost ${affectedCost.toFixed(2)} USD; current monthly saving ${current.toFixed(2)} USD.`,
          source: finding.reference,
          nextAction:
            locale === "es"
              ? safeFinancialText(finding.remediation.description)
              : "Run the read-only verification first, validate the metric, then schedule the change with the service owner.",
          rollback:
            locale === "es"
              ? safeFinancialText(finding.remediation.rollbackPlan)
              : "Restore the previous configuration and verify traffic, availability, and cost telemetry.",
        };
      }),
    services: report.summaryByService
      .filter((service) => service.totalCostUSD > 0)
      .map((service) => ({
        service: safeFinancialText(service.service),
        cost: service.totalCostUSD,
        savings: service.potentialSavingsUSD,
        findings: service.findingCount,
      })),
    scenarios: variables.map((variable) => ({
      id: variable.id,
      label: safeFinancialText(variable.label),
      current: stored.scenario.overrides[variable.id] ?? variable.value,
      min: variable.min,
      max: variable.max,
      sensitivity: variable.monthlySensitivityUSD,
      findingCount: variable.affectedFindingIds.length,
      source: safeFinancialText(variable.source ?? ""),
    })),
    trends: report.trendInsights.map((trend) => ({
      title: locale === "es" ? safeFinancialText(trend.title) : "Billing trend detected",
      detail: locale === "es" ? safeFinancialText(trend.detail) : "Review the deterministic evidence and compare it with the previous period.",
      evidence: locale === "es" ? safeFinancialText(trend.evidence) : safeFinancialText(trend.evidence.replace(/[A-Za-zÁ-ú ]+/g, " ").trim()),
      severity: trend.severity,
    })),
    quality: {
      distinctDays: report.dataWindow.distinctDays,
      requiredDays: report.dataWindow.requiredDays,
      suppressedRules: report.dataWindow.suppressedRules,
      coveragePercentage: report.billingCoverage?.coveragePercentage ?? null,
      catalog: report.billingCoverage?.catalogSnapshot ?? null,
      catalogAgeDays: report.billingCoverage?.catalogAgeDays ?? null,
      unknownColumns: report.billingCoverage?.unknownColumns ?? [],
    },
  };
}
