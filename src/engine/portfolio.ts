import type { SavingsStacking, SavingsStage } from "./types";

const round2 = (value: number) => Math.round(value * 100) / 100;

const STAGE_ORDER: Record<string, number> = { eliminate: 0, optimize: 1, commit: 2, architecture: 3 };

export interface PortfolioLineItem {
  findingId: string;
  scopeId: string;
  stacking: SavingsStacking;
  stage: SavingsStage;
  exclusiveGroupId?: string;
  baseMonthlyCostUSD: number;
  priorityScore: number;
  /** The USD amount this caller currently assigns to the finding, before portfolio adjustment. */
  savingsUSD: number;
}

export interface PortfolioResult {
  grossUSD: number;
  portfolioUSD: number;
  excludedFindingIds: string[];
}

/**
 * Combines a set of findings' savings into a portfolio total without
 * double-counting money two findings both claim. Shared by calculate-savings.ts
 * (the base report) and scenarios.ts (what-if scenarios) so the "current"
 * scenario always reproduces the report's own portfolioSavingsUSD exactly —
 * otherwise the dashboard header and the Escenarios tab could show two
 * different numbers for the same underlying assumptions.
 *
 * Three stacking rules:
 *  - "independent" (default): different pools of money, sum in full.
 *  - "exclusive": alternatives for the SAME money (same scopeId +
 *    exclusiveGroupId) — keep only the highest-priority one.
 *  - "sequential": same money, applied in FinOps order (eliminate -> optimize
 *    -> commit -> architecture). Items sharing a stage are independent
 *    siblings and sum in full; a LATER stage's aggregate base is reduced by
 *    the full savings earlier stages already claimed, and that stage's
 *    savings are rescaled proportionally.
 */
export function combinePortfolio(items: PortfolioLineItem[]): PortfolioResult {
  const grossUSD = round2(items.reduce((sum, item) => sum + item.savingsUSD, 0));

  const byScope = new Map<string, PortfolioLineItem[]>();
  for (const item of items) {
    if (!byScope.has(item.scopeId)) byScope.set(item.scopeId, []);
    byScope.get(item.scopeId)!.push(item);
  }

  const excludedFindingIds: string[] = [];
  let portfolioUSD = 0;

  for (const group of byScope.values()) {
    const exclusiveBuckets = new Map<string, PortfolioLineItem[]>();
    const survivors: PortfolioLineItem[] = [];
    for (const item of group) {
      if (item.stacking === "exclusive" && item.exclusiveGroupId) {
        const key = item.exclusiveGroupId;
        if (!exclusiveBuckets.has(key)) exclusiveBuckets.set(key, []);
        exclusiveBuckets.get(key)!.push(item);
      } else {
        survivors.push(item);
      }
    }
    for (const bucket of exclusiveBuckets.values()) {
      const sorted = [...bucket].sort((a, b) => b.priorityScore - a.priorityScore);
      survivors.push(sorted[0]);
      for (const loser of sorted.slice(1)) excludedFindingIds.push(loser.findingId);
    }

    // Sequential stages: order eliminate -> optimize -> commit -> architecture.
    // Items sharing a STAGE are independent siblings (e.g. two different
    // legacy instance families both at the "optimize" stage) — they sum in
    // full within the stage, no reduction between them. Only a LATER stage's
    // aggregate base is reduced by what earlier stages already saved, because
    // that later stage's base (e.g. "all uncommitted compute") is the one
    // that actually contains the earlier stages' cost as a subset.
    const sequential = survivors.filter((item) => item.stacking === "sequential");
    const rest = survivors.filter((item) => item.stacking !== "sequential");

    const byStage = new Map<string, PortfolioLineItem[]>();
    for (const item of sequential) {
      if (!byStage.has(item.stage)) byStage.set(item.stage, []);
      byStage.get(item.stage)!.push(item);
    }
    const orderedStages = [...byStage.entries()].sort(
      (a, b) => (STAGE_ORDER[a[0]] ?? 1) - (STAGE_ORDER[b[0]] ?? 1)
    );

    let consumedFromScope = 0;
    let scopeTotal = 0;
    for (const [, stageItems] of orderedStages) {
      const stageBaseTotal = stageItems.reduce((sum, item) => sum + item.baseMonthlyCostUSD, 0);
      const stageSavingsTotal = stageItems.reduce((sum, item) => sum + item.savingsUSD, 0);
      const adjustedStageBase = Math.max(0, stageBaseTotal - consumedFromScope);
      const ratio = stageBaseTotal > 0 ? adjustedStageBase / stageBaseTotal : 0;
      scopeTotal += round2(stageSavingsTotal * ratio);
      // The next stage's pool shrinks by this stage's FULL (un-rescaled)
      // savings — that money is gone regardless of how much of it a later
      // stage's own base could still claim.
      consumedFromScope += stageSavingsTotal;
    }
    for (const item of rest) {
      scopeTotal += item.savingsUSD;
    }

    const maxBaseInScope = Math.max(0, ...group.map((item) => item.baseMonthlyCostUSD || item.savingsUSD));
    portfolioUSD += maxBaseInScope > 0 ? Math.min(scopeTotal, maxBaseInScope) : scopeTotal;
  }

  return { grossUSD, portfolioUSD: round2(portfolioUSD), excludedFindingIds };
}
