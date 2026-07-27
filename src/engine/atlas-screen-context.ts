import type { AuditReport, ScenarioResult } from "./types";
import { calculateScenario } from "./scenarios";

export type AtlasReportTab = "overview" | "findings" | "scenarios" | "markdown";

/** Minimal browser-provided state. Never accept display copy from the client. */
export interface AtlasScreenContextInput {
  activeTab: AtlasReportTab;
  expandedFindingId?: string;
  /**
   * IDs only, in the exact order the dashboard renders them (report-dashboard.tsx's
   * `sortedFindings`) — never trust display copy (titles/numbers) from the client,
   * that gets looked up server-side from the stored analysis below.
   */
  visibleFindingIds?: string[];
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
  /**
   * The findings the user is actually looking at, in that exact order. Ordinal
   * references ("hallazgo 1", "el primero") MUST resolve against this list, not
   * against the server's own priority ranking — the dashboard groups findings
   * into sections (e.g. "Grandes proyectos") that restart their own numbering,
   * so "1" here is a hint to check, never a guarantee.
   */
  findingsList?: Array<{ position: number; id: string; title: string }>;
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
  const visibleFindingIds =
    Array.isArray(raw.visibleFindingIds) &&
    raw.visibleFindingIds.every((id) => typeof id === "string" && id.length <= 200)
      ? (raw.visibleFindingIds as string[]).slice(0, 50)
      : undefined;
  return { activeTab, expandedFindingId, visibleFindingIds };
}

export function resolveAtlasScreenContext(
  input: AtlasScreenContextInput,
  report: AuditReport,
  scenario?: ScenarioResult
): AtlasScreenContext {
  const finding = input.activeTab === "findings" && input.expandedFindingId
    ? report.findings.find((candidate) => candidate.id === input.expandedFindingId)
    : undefined;

  const findingsById = new Map(report.findings.map((f) => [f.id, f]));
  const findingsList = input.visibleFindingIds
    ?.map((id, index) => {
      const match = findingsById.get(id);
      return match ? { position: index + 1, id: match.id, title: safeLabel(match.title) } : undefined;
    })
    .filter((entry): entry is { position: number; id: string; title: string } => !!entry);

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
    findingsList: findingsList && findingsList.length > 0 ? findingsList : undefined,
  };
}
