import type { AuditReport, ScenarioResult } from "./types";
import { calculateScenario } from "./scenarios";

export type AtlasReportTab = "overview" | "findings" | "scenarios" | "markdown";

/** Minimal browser-provided state. Never accept display copy from the client. */
export interface AtlasScreenContextInput {
  activeTab: AtlasReportTab;
  expandedFindingId?: string;
}

/** Server-resolved context; finding metadata comes from the stored analysis. */
export interface AtlasScreenContext {
  view: "dashboard";
  activeTab: AtlasReportTab;
  scenario?: {
    preset: ScenarioResult["input"]["preset"];
    monthlySavingsUSD: number;
    annualSavingsUSD: number;
    deltaFromCurrentUSD: number;
    changedVariables: number;
    revision: number;
    presets: {
      conservative: { monthlySavingsUSD: number; annualSavingsUSD: number };
      current: { monthlySavingsUSD: number; annualSavingsUSD: number };
      optimistic: { monthlySavingsUSD: number; annualSavingsUSD: number };
    };
  };
  expandedFinding?: {
    id: string;
    title: string;
    category: string;
    service: string;
    provider: string;
    estimatedMonthlySavingsUSD: number;
    savingsRange: { conservative: number; optimistic: number };
    confidence: string;
    nextAction: string;
  };
}

const REPORT_TABS = new Set<AtlasReportTab>([
  "overview",
  "findings",
  "scenarios",
  "markdown",
]);

function safeLabel(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code === 9 || code === 10 || code === 13 || code >= 32;
    })
    .join("")
    .slice(0, 300);
}

export function parseAtlasScreenContextInput(value: unknown): AtlasScreenContextInput {
  if (!value || typeof value !== "object") return { activeTab: "overview" };
  const raw = value as Record<string, unknown>;
  const activeTab = typeof raw.activeTab === "string" &&
    REPORT_TABS.has(raw.activeTab as AtlasReportTab)
      ? raw.activeTab as AtlasReportTab
      : "overview";
  const expandedFindingId =
    typeof raw.expandedFindingId === "string" &&
    raw.expandedFindingId.length > 0 &&
    raw.expandedFindingId.length <= 200
      ? raw.expandedFindingId
      : undefined;
  return { activeTab, expandedFindingId };
}

export function resolveAtlasScreenContext(
  input: AtlasScreenContextInput,
  report: AuditReport,
  scenario?: ScenarioResult
): AtlasScreenContext {
  const finding = input.activeTab === "findings" && input.expandedFindingId
    ? report.findings.find((candidate) => candidate.id === input.expandedFindingId)
    : undefined;

  return {
    view: "dashboard",
    activeTab: input.activeTab,
    scenario: scenario
      ? {
          ...(() => {
            const conservative = calculateScenario(report, {
              preset: "conservative",
              overrides: {},
            });
            const current = calculateScenario(report, {
              preset: "current",
              overrides: {},
            });
            const optimistic = calculateScenario(report, {
              preset: "optimistic",
              overrides: {},
            });
            return {
              presets: {
                conservative: {
                  monthlySavingsUSD: conservative.monthlySavingsUSD,
                  annualSavingsUSD: conservative.annualSavingsUSD,
                },
                current: {
                  monthlySavingsUSD: current.monthlySavingsUSD,
                  annualSavingsUSD: current.annualSavingsUSD,
                },
                optimistic: {
                  monthlySavingsUSD: optimistic.monthlySavingsUSD,
                  annualSavingsUSD: optimistic.annualSavingsUSD,
                },
              },
            };
          })(),
          preset: scenario.input.preset,
          monthlySavingsUSD: scenario.monthlySavingsUSD,
          annualSavingsUSD: scenario.annualSavingsUSD,
          deltaFromCurrentUSD: scenario.deltaFromCurrentUSD,
          changedVariables: Object.keys(scenario.input.overrides).length,
          revision: scenario.scenarioRevision,
        }
      : undefined,
    expandedFinding: finding
      ? {
          id: finding.id,
          title: safeLabel(finding.title),
          category: finding.category,
          service: safeLabel(finding.service),
          provider: finding.provider,
          estimatedMonthlySavingsUSD: finding.estimatedMonthlySavingsUSD,
          savingsRange: {
            conservative: finding.savingsRange.conservative,
            optimistic: finding.savingsRange.optimistic,
          },
          confidence: finding.confidence,
          nextAction: safeLabel(finding.remediation.description),
        }
      : undefined,
  };
}
