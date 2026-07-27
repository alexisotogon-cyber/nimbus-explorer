/* PROTECTED TERMS — the machine-checkable half of the client rule:
   only ordinary language gets translated. Methodology names, standard column
   names, product names and technical identifiers stay identical in every
   language, including when they sit in the middle of a Spanish sentence.

   "Savings Plans" is what the AWS console calls the thing; "planes de ahorro" is
   a phrase no user can search for, and "BilledCost" is a column header that must
   match the file byte for byte. Translating either one turns correct output into
   a support ticket.

   test-data/test-i18n-glossary.mjs walks every string pair in the dictionaries
   and fails if a term present in the Spanish text disappeared from the English
   one, so this list is enforced rather than merely documented.

   Plain module (no "use client"): read from client components, server code and
   the node test suites alike. */

/** FOCUS column and field names. These are literal identifiers in the billing
    exports we parse — the parsers match them by exact spelling. */
export const FOCUS_COLUMNS = [
  "BilledCost",
  "EffectiveCost",
  "ListCost",
  "ContractedCost",
  "ChargeCategory",
  "ChargeClass",
  "ChargePeriodStart",
  "ChargePeriodEnd",
  "ServiceCategory",
  "ServiceSubcategory",
  "ServiceName",
  "ProviderName",
  "ServiceProviderName",
  "HostProviderName",
  "PublisherName",
  "BillingAccountId",
  "BillingCurrency",
  "CommitmentDiscountId",
  "ResourceId",
  "ResourceType",
  "RegionId",
  "ConsumedQuantity",
  "PricingQuantity",
  "SubAccountId",
] as const;

/** The standard and the discipline. Proper nouns: "FinOps" is not "OpsFinancieras",
    and the FinOps Foundation is an organisation with one name. */
export const METHODOLOGY_TERMS = ["FOCUS", "FinOps", "FinOps Foundation"] as const;

/** Frameworks and best-practice identifiers. The codes are citations: a reader
    should be able to paste "COST04-BP03" into the vendor's docs and land on the
    same page we are referring to. */
export const FRAMEWORK_TERMS = [
  "Well-Architected",
  "COST04-BP03",
  "COST07-BP04",
  "CO:05",
  "CO:07",
] as const;

/** Cloud services, features and pricing constructs — vendor product names, which
    are the terms users see in their own consoles and invoices. */
export const CLOUD_SERVICE_TERMS = [
  "Savings Plans",
  "Reserved Instances",
  "Committed Use Discounts",
  "CUD",
  "Gateway Endpoints",
  "Interface Endpoints",
  "PrivateLink",
  "NAT Gateway",
  "Elastic IP",
  "Intelligent-Tiering",
  "Autoclass",
  "Batch Inference",
  "Serverless Inference",
  "Provisioned Throughput",
  "SageMaker",
  "Bedrock",
  "Vertex AI",
  "Cost Explorer",
  "Data Exports",
  "CUR",
  "Cost Management",
  "Cloud Billing Export",
  "CloudWatch",
  "Azure Monitor",
  "Cloud Monitoring",
] as const;

/**
 * Finding / rule identifiers.
 *
 * Read off the `id` field of every RuleDefinition exported from
 * src/engine/rules/** (ripgrep over `src/engine/rules/*.ts` for `id: "`, then
 * filtered to the rules registered in `allRules` in src/engine/rules/index.ts —
 * the other `id:` hits in those files are FindingAssumption ids like
 * "unattached-pct", not rule ids).
 *
 * NOTE: the registry holds THIRTEEN rules, not twelve. Reported upstream rather
 * than trimmed, because dropping one would leave a real rule id unprotected.
 *
 * These appear verbatim in reports users file tickets about, so they never
 * change spelling per language.
 */
export const RULE_ID_TERMS = [
  "AI-VIS-001",
  "AI-TAG-001",
  "AI-BDR-001",
  "AI-SM-001",
  "AI-GPU-001",
  "UTIL-REVIEW-001",
  "IDLE-EIP-001",
  "OVERSIZED-GEN-001",
  "NAT-GW-001",
  "STORAGE-BLOCK-001",
  "STORAGE-SNAP-001",
  "STORAGE-OBJ-001",
  "COMMIT-001",
] as const;

/** Flat list used by the checker. Order matters only for stable test output. */
export const PROTECTED_TERMS: readonly string[] = [
  ...FOCUS_COLUMNS,
  ...METHODOLOGY_TERMS,
  ...FRAMEWORK_TERMS,
  ...CLOUD_SERVICE_TERMS,
  ...RULE_ID_TERMS,
];

/** Terms carry regex metacharacters ("CO:05" is harmless, "Intelligent-Tiering"
    and any future "C++"-shaped term are not), so every term is escaped before it
    becomes a pattern. */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Word-boundary match, case SENSITIVE.
 *
 * Case sensitivity is the point: "savings plans" in lower case is already a
 * translation slip, and the check must catch it. Boundaries are expressed as
 * lookarounds over [A-Za-z0-9] instead of \b because several terms start or end
 * next to punctuation ("CO:05"), where \b behaves differently. This is what stops
 * "CUD" from matching inside "CUDA" while still allowing "S3-Intelligent-Tiering".
 */
function termPattern(term: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(term)}(?![A-Za-z0-9])`);
}

export function containsProtectedTerm(text: string, term: string): boolean {
  return termPattern(term).test(text);
}

/**
 * Protected terms that were in `source` and are gone from `translation`.
 *
 * Empty array means the translation kept every protected term. A non-empty array
 * is a list of words someone translated that they should not have.
 */
export function findMissingProtectedTerms(source: string, translation: string): string[] {
  return PROTECTED_TERMS.filter(
    (term) => containsProtectedTerm(source, term) && !containsProtectedTerm(translation, term)
  );
}
