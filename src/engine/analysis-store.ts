import { randomUUID } from "node:crypto";
import type { AuditReport, NormalizedCostRecord, ScenarioInput } from "./types";
import type { FileDiagnosis } from "./validation/file-check";

export interface StoredAnalysis {
  records: NormalizedCostRecord[];
  report: AuditReport;
  totalRows: number;
  /** The exact upload review shown above the dashboard, so Atlas can explain it. */
  diagnosis?: FileDiagnosis;
  scenario: ScenarioInput;
  /** Bumped every time the applied scenario changes — Atlas and exporters use it to invalidate their own caches. */
  scenarioRevision: number;
  /**
   * Second secret, known only to the client that created this analysis.
   * analysisId alone used to be the only thing guarding an analysis, and it
   * travels in URLs (export links, logs, browser history) — anyone who saw
   * one could read, export, chat about, or mutate someone else's billing
   * data. The token is returned once at creation and never appears in a URL.
   */
  analysisToken: string;
  createdAt: number;
  lastUsed: number;
}

const ANALYSIS_TTL_MS = 30 * 60 * 1000;
const MAX_ANALYSES = 100;

type AnalysisGlobal = typeof globalThis & {
  __nimbusAnalysisStore?: Map<string, StoredAnalysis>;
};

const globalStore = globalThis as AnalysisGlobal;
const analyses = globalStore.__nimbusAnalysisStore ?? new Map<string, StoredAnalysis>();
globalStore.__nimbusAnalysisStore = analyses;

function cleanupAnalyses(now = Date.now()): void {
  for (const [id, analysis] of analyses) {
    if (now - analysis.lastUsed > ANALYSIS_TTL_MS) analyses.delete(id);
  }
  if (analyses.size <= MAX_ANALYSES) return;
  const oldest = [...analyses.entries()]
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed)
    .slice(0, analyses.size - MAX_ANALYSES);
  for (const [id] of oldest) analyses.delete(id);
}

export function registerAnalysis(
  records: NormalizedCostRecord[],
  report: AuditReport,
  totalRows = records.length,
  diagnosis?: FileDiagnosis
): { analysisId: string; analysisToken: string } {
  cleanupAnalyses();
  const analysisId = randomUUID();
  const analysisToken = randomUUID();
  const now = Date.now();
  analyses.set(analysisId, {
    records,
    report,
    totalRows,
    diagnosis,
    scenario: { preset: "current", overrides: {} },
    scenarioRevision: 0,
    analysisToken,
    createdAt: now,
    lastUsed: now,
  });
  return { analysisId, analysisToken };
}

/**
 * Constant-time-ish comparison isn't the point here (the token is a random
 * UUIDv4, not a low-entropy secret being brute-forced character by
 * character) — this just centralizes the check so every route asks it the
 * same way instead of re-deriving "does this token match" per file.
 */
export function verifyAnalysisToken(analysisId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const analysis = analyses.get(analysisId);
  return !!analysis && analysis.analysisToken === token;
}

export function deleteAnalysis(analysisId: string): boolean {
  return analyses.delete(analysisId);
}

export function updateAnalysisScenario(
  analysisId: string,
  scenario: ScenarioInput
): StoredAnalysis | null {
  const analysis = getAnalysis(analysisId);
  if (!analysis) return null;
  analysis.scenario = {
    preset: scenario.preset,
    overrides: { ...scenario.overrides },
    selections: scenario.selections ? { ...scenario.selections } : undefined,
  };
  analysis.scenarioRevision += 1;
  analysis.lastUsed = Date.now();
  return analysis;
}

export function getAnalysis(analysisId: string): StoredAnalysis | null {
  cleanupAnalyses();
  const analysis = analyses.get(analysisId);
  if (!analysis) return null;
  analysis.lastUsed = Date.now();
  return analysis;
}
