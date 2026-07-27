import { RuleDefinition } from "../types";
import { MIN_DISTINCT_DAYS } from "./thresholds";
import { utilizationReviewRule, unusedElasticIpRule } from "./idle-resources";
import { legacyGenerationRule, natGatewayRule } from "./oversized-instances";
import {
  unattachedStorageRule,
  excessiveSnapshotsRule,
  objectStorageOptRule,
  missingCommitmentsRule,
} from "./storage-waste";
import {
  aiVisibilityRule,
  aiGpuReviewRule,
  aiBedrockBatchRule,
  aiSageMakerEndpointRule,
  aiTaggingRule,
} from "./ai-spend";

/**
 * Registry of all deterministic rules.
 * Each rule operates on NormalizedCostRecord[] and returns Finding[].
 * AI visibility rules have high priorityScore so they surface near the top.
 */
/**
 * Every rule in this engine turns an observed daily average into a monthly figure
 * (`total / distinctDays * 30`), so every rule needs the same minimum window
 * before it may speak. Declared once here instead of thirteen times, and enforced
 * centrally in calculateSavings().
 *
 * If a future rule does NOT extrapolate (a pure structural check, say), give it an
 * explicit `minDistinctDays: 0` in its own definition — the `??` below preserves it.
 */
function withWindowGate(rules: RuleDefinition[]): RuleDefinition[] {
  return rules.map((rule) => ({
    ...rule,
    minDistinctDays: rule.minDistinctDays ?? MIN_DISTINCT_DAYS,
  }));
}

export const allRules: RuleDefinition[] = withWindowGate([
  aiVisibilityRule,
  aiTaggingRule,
  aiBedrockBatchRule,
  aiSageMakerEndpointRule,
  aiGpuReviewRule,
  utilizationReviewRule,
  unusedElasticIpRule,
  legacyGenerationRule,
  natGatewayRule,
  unattachedStorageRule,
  excessiveSnapshotsRule,
  objectStorageOptRule,
  missingCommitmentsRule,
]);

export {
  aiVisibilityRule, aiGpuReviewRule, aiBedrockBatchRule,
  aiSageMakerEndpointRule, aiTaggingRule,
  utilizationReviewRule, unusedElasticIpRule,
  legacyGenerationRule, natGatewayRule,
  unattachedStorageRule, excessiveSnapshotsRule,
  objectStorageOptRule, missingCommitmentsRule,
};

export { MIN_DISTINCT_DAYS, distinctDayCount, hasProjectableWindow, insufficientWindowMessage } from "./thresholds";
