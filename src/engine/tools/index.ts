/**
 * Agent Tools — Exported interface for the FinOps agent.
 */

export { queryBilling, summarizeByCategory, getCategoryLabel } from "./query-billing";
export type { BillingQueryResult } from "./query-billing";

export { calculateSavings } from "./calculate-savings";

export { generateRemediation, generateAllRemediations } from "./generate-remediation";
export type { RemediationOutput, RemediationStep } from "./generate-remediation";

export { buildReport } from "./build-report";
