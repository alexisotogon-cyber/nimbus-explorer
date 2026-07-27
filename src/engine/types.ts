/**
 * Core types for the FinOps Rules Engine — Multi-Cloud.
 * All monetary calculations are deterministic — the LLM never generates numbers.
 */

// ─── Cloud Providers ──────────────────────────────────────────────────────────

export type CloudProvider = "aws" | "azure" | "gcp";

export type BillingDatasetType =
  | "cost-and-usage"
  | "billing-period"
  | "contract-commitment"
  | "invoice-detail";

// ─── Canonical Cost Record (P0-7) ────────────────────────────────────────────

export type CostCategory =
  | "compute"
  | "block-storage"
  | "file-storage"
  | "object-storage"
  | "snapshot"
  | "network-egress"
  | "nat"
  | "ip-address"
  | "database"
  | "serverless"
  | "ai-ml"
  | "other";

/**
 * Canonical normalized cost record. All parsers (AWS, Azure, GCP) emit this.
 * The entire engine operates on this schema — no raw provider strings in rules.
 */
export interface NormalizedCostRecord {
  provider: CloudProvider | "unknown";
  /** Raw ProviderName from FOCUS when provider could not be mapped to aws/azure/gcp */
  providerRaw?: string;
  category: CostCategory;
  nativeService: string;
  nativeUsageType: string;
  region: string;
  date: string;
  /**
   * The single figure the engine analyses. Every rule reads `cost` and nothing else.
   * For FOCUS sources this is EffectiveCost (accrual basis) when the column is
   * present, falling back to BilledCost otherwise: accrual is the correct basis for
   * attributing waste to the period in which the capacity was actually consumed.
   * Native parsers (AWS/Azure/GCP) keep populating their own single cost figure.
   */
  cost: number;
  /**
   * FOCUS BilledCost — cash basis: what the invoice issuer charged in the billing
   * period. Only populated when the source carried the column. Not used by rules.
   */
  billedCost?: number;
  /**
   * Effective cost on an accrual basis: cost recognised in the charge period,
   * amortising commitment purchases. Populated by FOCUS and by native provider
   * rows that expose an equivalent value (for example AWS Savings Plan covered
   * usage). Mirrors `cost` when that basis was selected.
   */
  effectiveCost?: number;
  /**
   * FOCUS ServiceSubcategory (1.1+), stored raw for traceability. This is the
   * exact discriminator the provider published, so it is preferred over guessing
   * from ChargeDescription/SkuId when classifying.
   */
  serviceSubcategory?: string;
  quantity: number;
  accountId?: string;
  chargeType?: string;
  /** FOCUS: CommitmentDiscountId — truthy means this record is already under a discount commitment */
  commitmentDiscountId?: string;
  /** FOCUS / P2: individual resource identifier (e.g. EBS volume-id, S3 bucket ARN) */
  resourceId?: string;
  /** FOCUS / P2: resource type label (e.g. "EBS Volume", "EC2 Instance") */
  resourceType?: string;
  /** Stable billing identifiers. Names remain available in nativeService/nativeUsageType. */
  billingIdentity?: {
    serviceId?: string;
    productId?: string;
    skuId?: string;
    skuPriceId?: string;
    meterId?: string;
    invoiceId?: string;
    billingProfileId?: string;
  };
  /** Pricing evidence carried by the export; never replaced with public list prices. */
  pricing?: {
    billingCurrency?: string;
    pricingCurrency?: string;
    pricingCategory?: string;
    quantity?: number;
    unit?: string;
    listCost?: number;
    contractedCost?: number;
    listUnitPrice?: number;
    contractedUnitPrice?: number;
    effectiveUnitPrice?: number;
  };
  /** Traceability to the provider schema/catalog used for deterministic parsing. */
  source?: {
    datasetType: BillingDatasetType;
    schemaVersion: string;
    catalogSnapshot: string;
    extensions?: Record<string, string | number | boolean>;
  };
}

export interface BillingPeriodRecord {
  datasetType: "billing-period";
  invoiceIssuerName: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  status?: string;
  createdAt?: string;
  lastUpdatedAt?: string;
}

export interface ContractCommitmentRecord {
  datasetType: "contract-commitment";
  contractCommitmentId: string;
  contractId?: string;
  serviceProviderName?: string;
  category?: string;
  type?: string;
  status?: string;
  periodStart?: string;
  periodEnd?: string;
  quantity?: number;
  unit?: string;
  cost?: number;
  billingCurrency?: string;
}

export interface InvoiceDetailRecord {
  datasetType: "invoice-detail";
  invoiceDetailId: string;
  invoiceId?: string;
  invoiceIssuerName?: string;
  chargeCategory?: string;
  description?: string;
  billedCost?: number;
  billingCurrency?: string;
  invoiceIssueDate?: string;
  paymentDueDate?: string;
  status?: string;
}

export type SupplementalBillingRecord =
  | BillingPeriodRecord
  | ContractCommitmentRecord
  | InvoiceDetailRecord;

export interface BillingConceptCoverage {
  provider: "focus" | CloudProvider;
  datasetType: BillingDatasetType;
  sourceSchemaVersion: string;
  catalogSnapshot: string;
  catalogFetchedAt: string;
  catalogAgeDays: number;
  status: "current" | "warning" | "stale";
  recognizedColumns: string[];
  unknownColumns: string[];
  recognizedColumnCount: number;
  totalColumnCount: number;
  coveragePercentage: number;
  deterministic: true;
  warnings: string[];
}

// ─── Legacy CostRecord (kept for AWS CSV backward compat, but rules use NormalizedCostRecord) ─

export interface CostRecord {
  date: string;
  service: string;
  usageType: string;
  region: string;
  accountId: string;
  usageQuantity: number;
  unblendedCost: number;
  chargeType: string;
  [key: string]: string | number;
}

// ─── Findings & Rules ─────────────────────────────────────────────────────────

export type ConfidenceLevel = "confirmado" | "inferencia" | "fuera-de-alcance-del-billing";

export type EffortLevel = "bajo" | "medio" | "alto";
export type RiskLevel = "bajo" | "medio" | "alto";

export type LocalizedMessageParam = string | number | boolean;

/**
 * Presentation copy travels as a semantic key plus typed parameters. The
 * deterministic engine may keep legacy strings during migration, but all new
 * surfaces should prefer this shape so changing locale never recalculates data.
 */
export interface LocalizedMessage {
  key: string;
  params?: Record<string, LocalizedMessageParam>;
}

/** Architecture pillar reference (P0-4) */
export interface ArchitecturePillar {
  framework: "AWS Well-Architected" | "Azure Well-Architected" | "Google Cloud Architecture Framework";
  pillar: string;
  url: string;
}

/** Multi-provider remediation command (P0-9) */
export interface RemediationCommand {
  provider: CloudProvider;
  tool: "cli" | "terraform" | "console";
  /** Label for the command */
  label: string;
  snippet: string;
  /** Whether this is a read-only investigation command */
  isInvestigation: boolean;
  /** Whether this command is irreversible */
  isIrreversible: boolean;
}

export interface Remediation {
  description: string;
  /** Multi-provider commands (P0-9) */
  commands: RemediationCommand[];
  /** Rollback plan */
  rollbackPlan: string;
  /** Backup step (required before irreversible actions, P0-3) */
  backupStep?: string;

  // Legacy fields kept for compatibility during migration
  awsCli?: string[];
  terraform?: string;
  manualSteps?: string[];
}

/** Assumptions used in a finding (P0-2) */
export interface FindingAssumption {
  id: string;
  label: string;
  /** Current value (0-1 for percentages) */
  value: number;
  /** Min value for slider */
  min: number;
  /** Max value for slider */
  max: number;
  /** Step for slider */
  step: number;
  /** Source citation if available */
  source?: string;
}

/** Savings range based on assumptions (P0-2) */
export interface SavingsRange {
  conservative: number;
  moderate: number;
  optimistic: number;
}

/**
 * Where in the FinOps sequence a finding's savings apply. Order matters for
 * "sequential" stacking: eliminate (stop paying for it) before optimize
 * (rightsize/migrate) before commit (buy a discount on what remains).
 */
export type SavingsStage = "eliminate" | "optimize" | "commit" | "architecture";

/**
 * How a finding's savings combine with others sharing its `scopeId`:
 *  - "independent": different money, sum freely (the default — most findings).
 *  - "exclusive": alternatives for the SAME money; only the best one counts,
 *    the rest are shown as excluded alternatives (see `exclusiveGroupId`).
 *  - "sequential": same money, applied in stages — a later stage's base is
 *    reduced by what an earlier stage already saved (see `stage`).
 */
export type SavingsStacking = "independent" | "exclusive" | "sequential";

export interface FindingSavingsModel {
  version: "multiplicative-v1" | "portfolio-v2";
  baseMonthlyCostUSD: number;
  variableIds: string[];
  /**
   * Identifies the pool of money this finding's savings come from. Findings
   * that don't share a scopeId with anything else are their own scope and
   * always sum independently — most rules never need to think about this.
   */
  scopeId: string;
  stacking: SavingsStacking;
  stage: SavingsStage;
  /** Set together with stacking "exclusive": findings sharing this id compete for the same money. */
  exclusiveGroupId?: string;
  /** Rule ids (not finding ids) whose savings must be realized before this one is meaningful. */
  dependsOn?: string[];
}

export interface Finding {
  id: string;
  /** Stable rule identifier used for deterministic localization and export. */
  ruleId?: string;
  title: string;
  titleMessage?: LocalizedMessage;
  description: string;
  descriptionMessage?: LocalizedMessage;
  /** Provider that generated this finding */
  provider: CloudProvider;
  /** Service affected (native name) */
  service: string;
  category: WasteCategory;
  /** Savings range instead of single value (P0-2) */
  savingsRange: SavingsRange;
  /** The moderate estimate for backward compat and sorting */
  estimatedMonthlySavingsUSD: number;
  calculationBreakdown: string;
  effort: EffortLevel;
  risk: RiskLevel;
  priorityScore: number;
  confidence: ConfidenceLevel;
  reference: string;
  /** Architecture pillar (P0-4) */
  pillar: ArchitecturePillar;
  remediation: Remediation;
  affectedResources: string[];
  /**
   * P2: Concrete resources with individual cost, populated when resourceId is
   * available in the records. When present, confidence is upgraded to
   * "confirmado" by the rule. Empty array means no IDs available.
   */
  topResources: Array<{ resourceId: string; resourceType?: string; monthlyCostUSD: number }>;
  /** Assumptions used in the calculation (P0-2) */
  assumptions: FindingAssumption[];
  /**
   * Structured spend context for visibility-only findings. The UI consumes
   * these values directly instead of recovering financial data from prose.
   */
  visibilitySummary?: {
    monthlyCostUSD: number;
    shareOfTotalPercentage: number;
    trend: "up" | "down" | "stable";
    trendPercentage: number;
    breakdown: Array<{ label: string; monthlyCostUSD: number }>;
  };
  /** Versioned deterministic formula consumed by the global scenario engine. */
  savingsModel?: FindingSavingsModel;
  /**
   * Portfolio metadata, declared by the rule at construction time (not
   * inferred later): which pool of money this finding draws from, and how it
   * combines with other findings in that pool. Optional because most rules'
   * findings are their own independent scope by default — only rules that
   * KNOWINGLY overlap another rule's money need to set these explicitly.
   * calculateSavings() defaults missing values to an independent, self-scoped
   * finding, and folds them into `savingsModel` centrally.
   */
  scopeId?: string;
  stage?: SavingsStage;
  stacking?: SavingsStacking;
  exclusiveGroupId?: string;
}

export type ScenarioPreset = "conservative" | "current" | "optimistic" | "custom";

export interface ScenarioInput {
  preset: ScenarioPreset;
  overrides: Record<string, number>;
  /** Explicit choice within an exclusive group: scopeId -> the findingId kept. */
  selections?: Record<string, string>;
}

export interface ScenarioFindingResult {
  findingId: string;
  monthlySavingsUSD: number;
  annualSavingsUSD: number;
  deltaFromCurrentUSD: number;
}

export interface ScenarioResult {
  input: ScenarioInput;
  /** Incremented by updateAnalysisScenario() each time a scenario is actually applied. */
  scenarioRevision: number;
  monthlySavingsUSD: number;
  annualSavingsUSD: number;
  deltaFromCurrentUSD: number;
  /** Same figure as deltaFromCurrentUSD — named to match the "Aplicar escenario" UI copy. */
  deltaFromBaseUSD: number;
  findings: ScenarioFindingResult[];
  /** Findings excluded from the portfolio because an alternative in their exclusiveGroupId was preferred. */
  excludedAlternatives: ScenarioFindingResult[];
}

export type WasteCategory =
  | "idle-resources"
  | "utilization-review"
  | "oversized-instances"
  | "unattached-storage"
  | "legacy-generation"
  | "missing-commitment"
  | "data-transfer"
  | "unoptimized-storage-class"
  | "unused-elastic-ips"
  | "excessive-snapshots"
  | "nat-gateway-overuse"
  | "ai-visibility"
  | "ai-gpu-review"
  | "ai-batch-opportunity"
  | "ai-endpoint-idle"
  | "ai-cost-attribution";

export interface RuleDefinition {
  id: string;
  name: string;
  category: WasteCategory;
  description: string;
  evaluate: (records: NormalizedCostRecord[]) => Finding[];
  reference: string;
  /**
   * Distinct days of data the rule needs before it is allowed to run. Rules that
   * extrapolate a daily average to a month (`total / days * 30`) must declare
   * MIN_DISTINCT_DAYS; the gate is enforced centrally in calculateSavings() so the
   * engine and the file-diagnosis panel state the same threshold.
   * Defaults to 0 (no window requirement) when omitted.
   */
  minDistinctDays?: number;
}

// ─── Trends ───────────────────────────────────────────────────────────────────

export type TrendType = "daily-spike" | "sustained-growth" | "month-projection" | "new-service";

export interface TrendInsight {
  id: string;
  type: TrendType;
  severity: "warning" | "info";
  title: string;
  detail: string;
  /** Raw arithmetic used to produce the figures — verifiable by hand, never generated by LLM. */
  evidence: string;
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export interface AuditReport {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  providers: CloudProvider[];
  /** True when source data was in FOCUS format */
  isFocusSource?: boolean;
  /** Deterministic parser/schema coverage for the uploaded billing file. */
  billingCoverage?: BillingConceptCoverage;
  /**
   * Deterministic reconciliation of the uploaded billing period. The waste
   * engine analyses positive usage, while finance needs to see the adjustments
   * that reconcile that base with the invoice.
   */
  financialReconciliation: FinancialReconciliation;
  totalCostUSD: number;
  totalEstimatedSavingsUSD: number;
  /**
   * Naive sum of every estimable finding's moderate savings, as if each one
   * were independent money. Informative only — DOUBLE-COUNTS whenever two
   * findings share a scopeId (e.g. a rightsizing finding and a commitment
   * finding both drawing from the same uncommitted compute spend).
   */
  grossOpportunityUSD: number;
  /**
   * The number to actually headline. Same findings as grossOpportunityUSD,
   * but "exclusive" alternatives keep only their best option and "sequential"
   * stages have later stages' base reduced by what earlier stages already
   * saved — so this never double-counts the same dollar twice.
   */
  portfolioSavingsUSD: number;
  /** Finding ids dropped by exclusive-group resolution (alternatives not chosen for the portfolio). */
  excludedAlternativeFindingIds: string[];
  /** Total savings range — estimable findings only (excludes out-of-scope) */
  totalSavingsRange: SavingsRange;
  /**
   * Theoretical additional monthly savings (USD) from findings whose confidence
   * is "fuera-de-alcance-del-billing". Not evidence-backed — shown as a separate
   * note, never folded into totalSavingsRange.
   */
  reviewPendingOptimisticUSD: number;
  savingsPercentage: number;
  findings: Finding[];
  summaryByCategory: CategorySummary[];
  summaryByService: ServiceSummary[];
  /** Deterministic trend/anomaly insights — populated by analyzeTrends(). */
  trendInsights: TrendInsight[];
  /**
   * How much of a window the data actually covers, and how many rules were held
   * back because of it. Present on every report; `suppressedRules > 0` means the
   * findings list is deliberately incomplete and the report says so.
   */
  dataWindow: {
    distinctDays: number;
    requiredDays: number;
    suppressedRules: number;
  };
  /** Alias of dataWindow.distinctDays for surfaces that only need the count (section 3: "Total observado del periodo"). */
  observationDays: number;
  /** Aggregate console exports use periods rather than line-item billing days. */
  observationGranularity?: "hourly" | "daily" | "monthly";
  observationPeriods?: number;
  /** Summary inputs support spend exploration but never evidence-backed optimization rules. */
  analysisLevel?: "detailed" | "summary";
  /** Dimension selected in Cost Explorer's "Group by" control. */
  breakdownDimension?: string;
  /** Null when the file has no AI/ML spend at all — distinct from "zero", which would still render the block. */
  aiSpendSummary: AiSpendSummary | null;
  /**
   * Structured outcome for a successful analysis that has no positive usage
   * rows. This is not an error: the provider answered the query, but there is
   * no spend on which the optimization rules can operate.
   */
  sourceOutcome?: {
    code: "aws-cost-explorer-no-positive-cost";
    returnedCostUSD: number;
    returnedGroupCount: number;
    queriedPeriodCount: number;
  };
}

export interface FinancialReconciliation {
  currency: "USD";
  usageCostBasis: "effective-cost" | "native-provider-cost";
  commitmentPurchaseCostBasis: "billed-cost" | null;
  /** Positive usage kept by the parser for the uploaded period (not projected). */
  grossUsageCostUSD: number;
  /** Monthly projection used by the optimization dashboard. */
  projectedMonthlyGrossUsageUSD: number;
  creditsAndRefundsUSD: number;
  taxesUSD: number;
  commitmentPurchasesUSD: number;
  /** Gross - credits/refunds + taxes, deliberately excluding commitment purchases. */
  netUsageCostExcludingCommitmentPurchasesUSD: number;
  /**
   * Invoice-like net when the available rows share a compatible accounting
   * basis. Null for FOCUS files with commitment purchases because adding cash
   * purchases to EffectiveCost usage would mix cash and accrual bases.
   */
  invoiceNetCostUSD: number | null;
  isInvoiceNetComplete: boolean;
  wasteAnalysisBaseUSD: number;
  formula: string;
  notes: string[];
}

/**
 * Structured AI/ML spend summary. Exists so the dashboard's "Costos y
 * oportunidades de IA" block reads numbers directly instead of regexing
 * `aiVisibilityFinding.title` (a Spanish-formatted string built for prose,
 * which silently returned null the moment the title's wording changed).
 */
export interface AiSpendSummary {
  observedCostUSD: number;
  projected30DayCostUSD: number;
  /** % of total projected spend that is AI/ML. */
  grossSpendPercentage: number;
  /** % of AI/ML spend that carries a resourceId — a proxy for "can be attributed to an owner". */
  attributionCoveragePercentage: number;
  byProvider: Array<{ provider: string; costUSD: number }>;
  byService: Array<{ service: string; costUSD: number }>;
}

export interface CategorySummary {
  category: WasteCategory;
  label: string;
  totalSavingsUSD: number;
  findingCount: number;
}

export interface ServiceSummary {
  service: string;
  totalCostUSD: number;
  potentialSavingsUSD: number;
  findingCount: number;
}

export interface AnalysisRequest {
  records?: NormalizedCostRecord[];
  csvContent?: string;
  useDemo?: boolean;
  provider?: CloudProvider;
}

export interface AnalysisResponse {
  success: boolean;
  report?: AuditReport;
  /** Opaque server-side handle used to bind Atlas to this exact report. */
  analysisId?: string;
  /**
   * Second secret, returned once and kept only in client memory (never in a
   * URL). Required as the X-Nimbus-Analysis-Token header on every subsequent
   * call that reads or mutates this analysis — analysisId alone is not
   * authorization, it is just a lookup key.
   */
  analysisToken?: string;
  error?: string;
}

// ─── Savings range derivation ─────────────────────────────────────────────────

/**
 * Derives a SavingsRange from a base monthly cost and the assumptions that drive it.
 * The conservative/moderate/optimistic ends are the product of each assumption's
 * min/value/max respectively — so the money range ALWAYS matches the assumption
 * sliders shown to the user (no separate hardcoded multipliers).
 *
 * Example: cost=$100, assumptions [{min:.2,value:.5,max:.8}, {min:.25,value:.4,max:.68}]
 *   conservative = 100 * .2 * .25 = $5
 *   moderate     = 100 * .5 * .4  = $20
 *   optimistic   = 100 * .8 * .68 = $54.40
 */
export function deriveSavingsRange(
  monthlyCost: number,
  assumptions: FindingAssumption[]
): SavingsRange {
  const product = (pick: (a: FindingAssumption) => number) =>
    assumptions.reduce((acc, a) => acc * pick(a), 1);
  const round2 = (x: number) => Math.round(x * 100) / 100;
  return {
    conservative: round2(monthlyCost * product((a) => a.min)),
    moderate: round2(monthlyCost * product((a) => a.value)),
    optimistic: round2(monthlyCost * product((a) => a.max)),
  };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/**
 * Formats a USD amount safely for display: fixed 2 decimals + thousands separator.
 * Guards against floating-point artifacts (e.g. 5.760000000000004 → "$5.76").
 * ALL monetary values shown in the UI or report MUST pass through this.
 */
export function formatUSD(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return `$${safe.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Helpers (P0-6) ───────────────────────────────────────────────────────────

/**
 * Unified quick win definition.
 * A finding is a quick win if: low effort + low risk + savings >= $50/mes (moderate estimate).
 * The $50 threshold is documented in the UI.
 */
export function isQuickWin(finding: Finding): boolean {
  return (
    finding.effort === "bajo" &&
    finding.risk === "bajo" &&
    finding.estimatedMonthlySavingsUSD >= 50
  );
}

/** Quick win threshold documented for the UI */
export const QUICK_WIN_THRESHOLD_USD = 50;

/**
 * Plain-language labels for confidence levels (doble altitud).
 * The raw slug (e.g. "fuera-de-alcance-del-billing") must NEVER be rendered.
 */
export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  confirmado: "Confirmado con tus datos",
  inferencia: "Estimación — verifícala en tu cuenta",
  "fuera-de-alcance-del-billing": "Requiere métricas adicionales (la factura no basta)",
};

// ─── Resource-level helpers (P2) ─────────────────────────────────────────────

export interface ResourceSummary {
  resourceId: string;
  resourceType?: string;
  monthlyCostUSD: number;
}

/**
 * Extracts the top N resources (by monthly cost) from a slice of records,
 * when those records carry resourceId. Days is the number of distinct dates
 * in the full record set, used to project monthly cost from observed cost.
 * Returns [] if no records have resourceId.
 */
export function topResourcesFromRecords(
  records: NormalizedCostRecord[],
  days: number,
  topN = 5
): ResourceSummary[] {
  const withId = records.filter((r) => r.resourceId);
  if (withId.length === 0) return [];

  const byCost = new Map<string, { cost: number; type?: string }>();
  for (const r of withId) {
    const id = r.resourceId!;
    const entry = byCost.get(id) ?? { cost: 0, type: r.resourceType };
    entry.cost += r.cost;
    byCost.set(id, entry);
  }

  const monthly = Array.from(byCost.entries()).map(([id, e]) => ({
    resourceId: id,
    resourceType: e.type,
    monthlyCostUSD: Math.round((e.cost / Math.max(days, 1)) * 30 * 100) / 100,
  }));

  return monthly
    .sort((a, b) => b.monthlyCostUSD - a.monthlyCostUSD)
    .slice(0, topN);
}

// ─── Priority Score Calculation ───────────────────────────────────────────────

export function calculatePriority(
  savings: number,
  effort: EffortLevel,
  risk: RiskLevel
): number {
  const effortMultiplier: Record<EffortLevel, number> = { bajo: 1.0, medio: 0.7, alto: 0.4 };
  const riskMultiplier: Record<RiskLevel, number> = { bajo: 1.0, medio: 0.8, alto: 0.5 };
  const savingsScore = Math.min((savings / 1000) * 100, 100);
  return Math.round(savingsScore * effortMultiplier[effort] * riskMultiplier[risk]);
}
