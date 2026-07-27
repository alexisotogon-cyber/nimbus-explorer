import type {
  AuditReport,
  Finding,
  FindingAssumption,
  ScenarioInput,
  ScenarioPreset,
  ScenarioResult,
} from "./types";
import { combinePortfolio, PortfolioLineItem } from "./portfolio";

const round2 = (value: number) => Math.round(value * 100) / 100;

function clamp(value: number, assumption: FindingAssumption): number {
  if (!Number.isFinite(value)) return assumption.value;
  return Math.min(assumption.max, Math.max(assumption.min, value));
}

function presetValue(preset: ScenarioPreset, assumption: FindingAssumption): number {
  if (preset === "conservative") return assumption.min;
  if (preset === "optimistic") return assumption.max;
  return assumption.value;
}

function currentSavings(finding: Finding): number {
  return finding.confidence === "fuera-de-alcance-del-billing"
    ? 0
    : finding.estimatedMonthlySavingsUSD;
}

/**
 * Recomputes every finding's savings under a scenario (preset + per-variable
 * overrides), then combines them through the SAME combinePortfolio() engine
 * calculate-savings.ts uses for the base report. This is what makes the
 * "current" preset with no overrides reproduce report.portfolioSavingsUSD
 * exactly — the dashboard header and the Escenarios tab can never disagree
 * about the same underlying assumptions.
 */
export function calculateScenario(
  report: AuditReport,
  input: ScenarioInput,
  scenarioRevision = 0
): ScenarioResult {
  const estimableFindings = report.findings.filter(
    (f) => f.confidence !== "fuera-de-alcance-del-billing"
  );

  const scaledByFindingId = new Map<string, number>();
  for (const finding of estimableFindings) {
    const model = finding.savingsModel;
    const base = model?.baseMonthlyCostUSD ?? finding.estimatedMonthlySavingsUSD;
    const assumptions = finding.assumptions ?? [];
    const product = assumptions.reduce((total, assumption) => {
      const override = input.overrides[assumption.id];
      const chosen =
        override === undefined ? presetValue(input.preset, assumption) : clamp(override, assumption);
      return total * chosen;
    }, 1);
    scaledByFindingId.set(finding.id, round2(base * product));
  }

  const items: PortfolioLineItem[] = estimableFindings.map((finding) => ({
    findingId: finding.id,
    scopeId: finding.savingsModel?.scopeId ?? `solo:${finding.id}`,
    stacking: finding.savingsModel?.stacking ?? "independent",
    stage: finding.savingsModel?.stage ?? "optimize",
    exclusiveGroupId: finding.savingsModel?.exclusiveGroupId,
    baseMonthlyCostUSD: finding.savingsModel?.baseMonthlyCostUSD ?? finding.estimatedMonthlySavingsUSD,
    priorityScore: finding.priorityScore,
    savingsUSD: scaledByFindingId.get(finding.id) ?? 0,
  }));
  const combined = combinePortfolio(items);
  const excludedIds = new Set(combined.excludedFindingIds);

  const findingsOut = estimableFindings.map((finding) => {
    const isExcluded = excludedIds.has(finding.id);
    const estimated = isExcluded ? 0 : scaledByFindingId.get(finding.id) ?? 0;
    const current = currentSavings(finding);
    return {
      findingId: finding.id,
      monthlySavingsUSD: estimated,
      annualSavingsUSD: round2(estimated * 12),
      deltaFromCurrentUSD: round2(estimated - current),
    };
  });

  const excludedAlternatives = findingsOut.filter((f) => excludedIds.has(f.findingId));
  const findings = findingsOut.filter((f) => !excludedIds.has(f.findingId));

  const monthlySavingsUSD = combined.portfolioUSD;
  // Compare portfolio with portfolio. Summing every finding here reintroduced
  // alternatives excluded by combinePortfolio(), so the "current" preset could
  // show a non-zero delta even when its impact matched the dashboard exactly.
  const currentMonthly = round2(report.portfolioSavingsUSD);

  return {
    input: {
      preset: input.preset,
      overrides: { ...input.overrides },
      selections: input.selections ? { ...input.selections } : undefined,
    },
    scenarioRevision,
    monthlySavingsUSD,
    annualSavingsUSD: round2(monthlySavingsUSD * 12),
    deltaFromCurrentUSD: round2(monthlySavingsUSD - currentMonthly),
    deltaFromBaseUSD: round2(monthlySavingsUSD - currentMonthly),
    findings,
    excludedAlternatives,
  };
}

export function currentScenario(report: AuditReport): ScenarioResult {
  return calculateScenario(report, { preset: "current", overrides: {} });
}

export interface ScenarioVariable {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  source?: string;
  affectedFindingIds: string[];
  monthlySensitivityUSD: number;
}

/**
 * Deduplicates shared assumptions and orders them by their impact from minimum
 * to maximum. This keeps the six visible controls focused on financial value.
 */
export function getScenarioVariables(report: AuditReport): ScenarioVariable[] {
  const variables = new Map<string, ScenarioVariable>();

  for (const finding of report.findings) {
    if (finding.confidence === "fuera-de-alcance-del-billing") continue;
    const base = finding.savingsModel?.baseMonthlyCostUSD ?? finding.estimatedMonthlySavingsUSD;
    for (const assumption of finding.assumptions) {
      const otherProduct = finding.assumptions
        .filter((candidate) => candidate.id !== assumption.id)
        .reduce((product, candidate) => product * candidate.value, 1);
      const sensitivity = Math.abs(base * otherProduct * (assumption.max - assumption.min));
      const existing = variables.get(assumption.id);
      if (existing) {
        existing.monthlySensitivityUSD = round2(existing.monthlySensitivityUSD + sensitivity);
        if (!existing.affectedFindingIds.includes(finding.id)) {
          existing.affectedFindingIds.push(finding.id);
        }
      } else {
        variables.set(assumption.id, {
          ...assumption,
          affectedFindingIds: [finding.id],
          monthlySensitivityUSD: round2(sensitivity),
        });
      }
    }
  }

  return [...variables.values()].sort(
    (left, right) => right.monthlySensitivityUSD - left.monthlySensitivityUSD
  );
}
