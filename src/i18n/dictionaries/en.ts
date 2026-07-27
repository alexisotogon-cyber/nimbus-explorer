/* English dictionary.

   Typed as `Dictionary` — the recursive shape derived from es.ts — so TypeScript
   fails when a key is missing (the object no longer satisfies the shape) and when
   a key is extra (excess-property check on the literal). That compile error is
   the whole point: a half-finished translation must not ship quietly.

   Terms listed in glossary.ts must appear here byte-identical to the Spanish
   version. "Savings Plans" is a product name, not a phrase to translate; the
   glossary test enforces it.

   Register: the same direct second person as the Spanish ("your bill", "check
   it"), professional product tone, no exclamation marks, no emoji. Translated as
   English, not transliterated from Spanish — where a literal rendering would read
   as a translation, the English sentence was rewritten to carry the same meaning. */

import type { Dictionary } from "./es";

export const en: Dictionary = {
  common: {
    loading: "Loading…",
    cancel: "Cancel",
    close: "Close",
    retry: "Retry",
    copy: "Copy",
    copied: "Copied",
    perMonth: "/mo",
    day: {
      one: "{count} day",
      other: "{count} days",
    },
    finding: {
      one: "{count} finding",
      other: "{count} findings",
    },
    row: {
      one: "{count} row",
      other: "{count} rows",
    },
  },

  header: {
    tagline: "Cloud Cost Explorer",
    newAudit: "New audit",
    askAtlas: "Ask Atlas",
    closeAtlas: "Close Atlas",
    themeGroupLabel: "Interface theme",
    languageGroupLabel: "Interface language",
    switchToLanguage: "Switch to {language}",
  },

  upload: {
    title: "Upload your billing file",
    sample: "Download a sample file",
    dropzone: "Drop your CSV or Excel file here, or {pick}",
    dropzonePick: "pick one",
    laneHint: {
      aws: "CSV from Cost Explorer, CUR or Data Exports; Excel and FOCUS are also supported.",
      azure: "CSV or Excel from Cost Analysis, Actual/Amortized Cost Details, or FOCUS.",
      gcp: "CSV from Reports, Cost table, a Standard/Detailed BigQuery export query, or FOCUS.",
      focus: "CSV or Excel in FOCUS format (AWS, Azure or GCP).",
    },
    removeFile: "Remove",
    analyzing: "Analyzing...",
    analyze: "Analyze costs",
    trust: {
      privateTitle: "Private",
      privateDesc: "Sent to the Nimbus backend for analysis only; never shared with third parties.",
      verifiableTitle: "Verifiable",
      verifiableDesc: "Figures come from rules; the AI does not make them up.",
      auditableTitle: "Auditable",
      auditableDesc: "Every finding shows its calculation and its source.",
    },
  },

  connect: {
    credentialsTitle: "Your credentials, your call",
    sessionTokenPlaceholder: "Leave empty if you use permanent credentials",
    validating: "Validating...",

    aws: {
      title: "Connect an AWS account",
      bulletReadOnly: "Use {readOnly} — they can read cost data and nothing else.",
      bulletReadOnlyStrong: "read-only credentials (IAM)",
      bulletInMemory: "They are used {inMemory}.",
      bulletInMemoryStrong: "in memory only, for this one request",
      bulletNeverStored: "They are {never} written to disk, to a database or to logs.",
      bulletNeverStoredStrong: "never",
      bulletNoThirdParties:
        "They never reach third parties — they go straight from the server to the AWS Cost Explorer API.",
      recommended:
        "Recommended: create a dedicated IAM user with the minimal policy below ({permission} only).",
      policyTitle: "Permissions policy for Cost Explorer",
      policyPath:
        "Paste it under IAM → Users → the user that owns these Access Keys → Add permissions → Create inline policy → JSON. It does not belong in a role trust policy.",
      policyNote:
        "It only allows cost queries ({permission}). It grants no access to resources, no access to data and no write actions.",
      sessionTokenOptional: "(optional, for temporary roles)",
      regionLabel: "Region",
      periodLabel: "Period (days)",
      periodOption: "Last {count} days",
      credentialsValid: "Credentials are valid. Ready to analyze.",
      validateCta: "Validate credentials",
      analyzing: "Analyzing the account...",
      analyzeCta: "Analyze the last {days} days",
    },

    focus: {
      title: "Connect a FOCUS export bucket (AWS Data Exports)",
      setupTitle: "No export yet?",
      setupBody:
        "Turn it on under: {path} (or {altTable} if your account does not offer 1.2 yet). AWS refreshes it at least once a day, and the first delivery takes 24 to 72 hours. For history, you can request a backfill of up to 36 months through a support case.",
      setupPath:
        "Billing and Cost Management → Data Exports → Create export → Standard data export → Table: FOCUS 1.2 with AWS columns",
      setupAltTable: "FOCUS 1.0 with AWS columns",
      formatsBody:
        "Both {csv} and {parquet} work — and Parquet is what the AWS Cloud Intelligence Dashboards guide recommends, together with the {deliveryMode} delivery mode.",
      formatsCsv: "CSV (gzip)",
      formatsParquet: "Parquet",
      formatsDeliveryMode: "Overwrite existing export file",
      prefixHelp:
        "Point the prefix at the export folder (for example {example}). We read the {manifest} of the most recent {partition} partition and analyze every file in it, so nothing is measured on a half-written export.",
      bulletReadOnly: "Use read-only credentials (IAM) — they can only read the bucket.",
      bulletInMemory: "They are used {inMemory} for this request.",
      bulletInMemoryStrong: "in memory only",
      bulletNeverStored: "They are {never} stored or written to logs.",
      bulletNeverStoredStrong: "never",
      bucketLabel: "S3 bucket name",
      bucketPlaceholder: "my-exports-bucket",
      prefixLabel: "Prefix (path inside the bucket)",
      sessionTokenOptional: "(optional — temporary credentials only)",
      regionLabel: "Bucket region",
      regionHint: "(the bucket's, not the export's — the bucket can live in any region)",
      accessConfirmed: "Access confirmed. Ready to analyze.",
      warningsTitle: "Notes on reading the export",
      validateCta: "Validate bucket access",
      analyzing: "Downloading and analyzing...",
      analyzeCta: "Analyze the FOCUS export",
      policyTitle: "Permissions policy for an IAM user",
      policyPath:
        "Paste it under IAM → Users → your user → Add permissions → Create inline policy → JSON. It does not belong in a role trust policy.",
      policyBucketLabel: "Bucket used to generate the policy",
      policyPrefixLabel: "Allowed prefix (optional)",
      policyEnterBucket: "Enter the bucket name to enable Copy.",
      policyNote:
        "Nimbus generates it from the bucket and prefix entered above. ListBucket is scoped to the bucket and GetObject only to objects under the prefix; it grants no write access.",
    },
  },

  diagnosis: {
    fileCheck: {
      allOk: {
        one: "{format} — {count} usable row, every analysis capability available.",
        other: "{format} — {count} usable rows, every analysis capability available.",
      },
      blockingTitle: "No usable rows were found in your file",
      summaryTitle: "Console summary recognized",
      capabilitiesHeading: "{format} — what I can do, and what is missing",
      rowsUsed: "{used} of {total} rows used",
      valuesUsed: "{used} of {total} cost values used",
      summaryRecognized: "This is a valid aggregate {provider} {source} download.",
      summaryDetails: "Grouped by {group} · {granularity} · {periods} periods",
      summaryDetailsOne: "Grouped by {group} · {granularity} · 1 period",
      summaryScope:
        "Nimbus can validate spend and its distribution from this file. Verified savings recommendations require more detailed billing evidence.",
      summaryUsage: "Aggregate usage detected: {amount} {unit}.",
      granularity: {
        hourly: "hourly",
        daily: "daily",
        monthly: "monthly",
      },
      daysOfData: {
        one: "{count} day of data",
        other: "{count} days of data",
      },
      droppedTitle: "Discarded rows",
      assumptionsTitle: "Assumptions applied to your file",
      capabilitiesTitle: "What this file can do",
      requires: "Requires {requirement}.",
      unlockMore: "How to unlock more",
    },

    mismatch: {
      badge: "File not analyzed",
      fileName: "File: {name}",
      unknownCloud: "another cloud",
      severalClouds: "several clouds",
      listPair: "{head} and {last}",
      multiCloudTitle: "This file covers more than one cloud",
      multiCloudBody:
        "Your file is in FOCUS format and holds data from {found}, while the lane you picked is {expected} only. The FOCUS lane analyzes all of those clouds together, so no spend is left out.",
      multiCloudAction: "Analyze it in the FOCUS lane",
      wrongCloudTitle: "This file looks like it came from {detected}",
      wrongCloudBody:
        "You picked the {expected} lane, and the two have to match for the rules and the commands to fit your cloud.",
      analyzeAsAction: "Analyze it as {cloud}",
      nativeInFocusTitle: "This lane only takes files in FOCUS format",
      nativeInFocusBody:
        "Your file is a native {detected} export, which we can analyze in its own lane instead.",
      unrecognizedTitle: "We do not recognize this file's format",
      unrecognizedBody:
        "We could not find the columns that identify a billing export. Check that this is your provider's cost export and not a summary or an invoice.",
      ambiguousTitle: "We cannot tell which cloud this file comes from",
      ambiguousPartial: "It partly matches {candidates}, without fitting any of them fully.",
      ambiguousNoMatch: "Its columns do not fully match any format we know.",
      ambiguousAdvice:
        "Export the billing file straight from your provider, or use FOCUS format, the open standard all three clouds can produce.",
      focusMissingTitle: "The file looks like a FOCUS export, but required columns are missing:",
      focusMissingHint: "Generate the export again with those columns and upload it.",
      unmappedRows: {
        one: "On top of that, {count} row carries a provider we do not recognize.",
        other: "On top of that, {count} rows carry a provider we do not recognize.",
      },
      pickAnother: "Pick another file",
    },
  },

  findings: {
    reviewOnly: "review",
    friendlyConfidence: {
      confirmado: "Verified against your bill",
      inferencia: "Estimate — you can tune the assumptions",
      "fuera-de-alcance-del-billing": "Needs usage metrics to confirm",
    },
    savingsPotential: "Potential saving",
    scaleConservative: "conservative",
    scaleModerate: "mid scenario {amount}",
    scaleOptimistic: "optimistic",
    informational:
      "Informational finding — no direct saving is estimated without more data (see below what is missing to confirm it).",
    concreteResources: "Specific resources",
    viewTechnicalDetail: "See the technical detail",
    categoryLabel: "Category:",
    resourcesLabel: "Resources:",
    howWeCalculated: "How we got to this number",
    assumptionsTitle: "Assumptions behind the calculation",
    assumptionRange: "(range {min}%–{max}%)",
    pillarLabel: "Pillar:",
    verifyYourself: "Check it yourself",
    verifyYourselfNote: "(read-only — changes nothing)",
    rollbackLabel: "How to roll back if something goes wrong:",
    applyChange: "Apply the change",
    applyChangeNote: {
      one: "({count} command — for your technical team)",
      other: "({count} commands — for your technical team)",
    },
    irreversibleWarning:
      "Irreversible action — possible data or service loss. Back up and validate before running it.",
    backupStepLabel: "Required backup step:",
    irreversible: "Irreversible",

    whereToRunShell: "{shell} or local {cli}",

    simulator: {
      toggle: "See how it moves with your assumptions",
      groupLabel: "Assumption scenario",
      presetMin: "Minimum",
      presetMinHint: "Every assumption at its lowest value.",
      presetDefault: "Default",
      presetDefaultHint: "The values this report was calculated with.",
      presetMax: "Maximum",
      presetMaxHint: "Every assumption at its highest value.",
      presetCustom: "My value",
      presetCustomHint: "Set each assumption to what you measure in your account.",
      resultLabel: "Estimated saving · {scenario} scenario",
      annualPace: "≈ {amount}/yr at this pace",
      basis:
        "Calculated on ≈{base}/mo of {service} ({provider}) attributed to this finding; ≈{remaining}/mo would remain.",
      commitmentCaveat:
        "Committing more is not automatically better: coverage you do not use is still billed, and commitments cannot be cancelled. Validate the eligible percentage against your provider's recommendations before signing.",
      provenance:
        "Where the assumptions come from: {provenance}. The detail and the sources are under “See the technical detail”.",
      provenanceEditorial: "Editorial estimate — tune it",
      provenanceDocumented: "Verified against official documentation",
      footnote:
        "Calculated in your browser with the same formula the engine uses. Minimum and maximum are the ends of the range shown above in this finding.",
    },

    legend: {
      confirmed: "Confirmed with your data",
      estimate: "Estimate — check it",
      needsMetrics: "Needs extra metrics",
    },
    groupQuickWins: "Easy and valuable",
    groupProjects: "Bigger projects",
    groupSmall: "Small and easy",
    groupReview: "Needs metrics or review",
  },

  report: {
    grossMonthly: "Projected gross monthly spend: {amount}/mo.",
    focusBadge: "FOCUS format",
    savingsIdentified: "Potential saving identified",
    reviewPending: "+ up to {amount}/mo more, pending a metrics review",
    statRecoverable: "% of spend recoverable",
    statRecoverableHint: "mid scenario",
    statFindings: "Findings",
    statFindingsHint: "{count} easy · {amount}/mo",
    statAiSpend: "AI spend",
    statAiSpendHint: "{pct}% of your bill →",
    statAiSpendHintFallback: "see detail →",
    disclaimer:
      "Informational recommendations based on your billing data. Validate every action in your own environment before applying it.",
    tabOverview: "Overview",
    tabFindings: "Findings ({count})",
    tabAssumptions: "Assumptions",
    tabReport: "Report",
    howItWorks: "How this analysis works",
    howItWorksBody:
      "The numbers come from verifiable calculation rules applied to your bill; Atlas explains those results and calls deterministic tools for the figures. Every saving is a range because it depends on assumptions. To see how a figure moves, open the finding and expand “See how it moves with your assumptions”. The Assumptions tab lists the values and their sources.",

    reconciliation: {
      regionLabel: "Financial reconciliation",
      title: "Reconciliation for the loaded period",
      subtitle:
        "Gross spend is what waste is detected on; the adjustments explain the financial amount.",
      partialNet: "Partial net",
      gross: "Gross usage",
      credits: "Credits/refunds",
      taxes: "Taxes",
      purchases: "Separate purchases",
      netInvoice: "Estimated invoice net",
      netUsage: "Usage net, purchases excluded",
    },

    overview: {
      whatFirst: "What to do first",
      savingsByCategory: "Saving by category",
      zeroCategories: {
        one: "{count} more topic needs a metrics review — see the Findings tab.",
        other: "{count} more topics need a metrics review — see the Findings tab.",
      },
      serviceBreakdown: "Breakdown by service",
      colService: "Service",
      colCostPerMonth: "Cost/mo",
      colSavings: "Saving",
      aiTitle: "Your artificial intelligence spend",
      aiSummary: {
        one: "{title}. {count} AI-related finding — {link}.",
        other: "{title}. {count} AI-related findings — {link}.",
      },
      aiLink: "see it under Findings",
      trendsTitle: "Trends in your spend",
    },

    printable: {
      downloadPdf: "Download PDF",
      downloadExcel: "Download Excel",
      copyMarkdown: "Copy Markdown",
      eyebrow: "Nimbus Explorer · Executive report",
      title: "Cost Optimization Report",
      focusBadge: "FOCUS 1.0–1.4 format",
      generated: "Generated: {date}",
      period: "Period: {start} — {end}",
      providers: "Providers: {list}",
      keyFigures: "Key figures",
      kpiCost: "Monthly baseline · full period",
      kpiSavings: "Potential saving (mid scenario)",
      kpiPercentage: "Share of spend recoverable",
      kpiQuickWins: {
        one: "{count} quick and easy action",
        other: "{count} quick and easy actions",
      },
      topActions: "Three priority actions",
      charts: "Analysis at a glance",
      findingsTable: "Prioritized findings",
      colFinding: "Finding",
      colSavingsPerMonth: "Saving/mo",
      colEffort: "Effort",
      colConfidence: "Confidence",
      trends: "Trends detected",
      disclaimer:
        "Informational recommendations based on billing data. Every figure is calculated by the deterministic rules engine; the AI generates no numbers. Validate every action in your own environment before applying it. Savings are shown as a range (conservative–optimistic) based on adjustable assumptions.",
    },

    excel: {
      sheetSummary: "Summary",
      sheetFindings: "Findings",
      sheetByService: "By service",
      sheetTrends: "Trends",
      rowGenerated: "Generated",
      rowPeriodStart: "Period start",
      rowPeriodEnd: "Period end",
      rowProviders: "Providers",
      rowMonthlyCost: "Normalized monthly baseline (USD)",
      rowSavingsConservative: "Conservative saving (USD/mo)",
      rowSavingsModerate: "Moderate saving (USD/mo)",
      rowSavingsOptimistic: "Optimistic saving (USD/mo)",
      rowRecoverablePct: "% of spend recoverable",
      rowTotalFindings: "Total findings",
      rowQuickWins: "Quick and easy actions (quick wins)",
      colTitle: "Title",
      colCategory: "Category",
      colProvider: "Provider",
      colConfidence: "Confidence",
      colEffort: "Effort",
      colRisk: "Risk",
      colPillar: "Architecture pillar",
      colAffectedResources: "Affected resources",
      colService: "Service",
      colServiceCost: "Monthly cost (USD)",
      colServiceSavings: "Potential saving (USD/mo)",
      colTrendType: "Type",
      colTrendSeverity: "Severity",
      colTrendDetail: "Detail",
      colTrendEvidence: "Evidence",
    },

    charts: {
      savingsByCategory: "Potential saving by category",
      savingsSeries: "Saving",
      costByService: "Cost distribution by service",
      otherServices: "Other",
      costSeries: "Cost",
      monthProjection: "Spend run-rate comparison",
      periodAverage: "Full-period daily average",
      last7DaysAverage: "Last 7 days daily average",
      projection30Days: "Recent run rate × 30 days",
    },
  },

  assumptions: {
    title: "Assumptions behind the analysis",
    intro:
      "A reference for the assumptions feeding every estimate, with their range and their source. The default values are not the minimums: they sit at the middle of the range, and the report shows both ends to reflect the uncertainty. To simulate other values, open the finding they belong to.",
    empty: "This analysis uses no adjustable assumptions.",
    defaultPosition: "Where the default value sits inside the range (reference, not editable).",
    sourceLabel: "Source:",
    usedIn: "Used in: {titles}",
    usedInMore: " (+{count} more)",
  },

  chat: {
    agentName: "Atlas agent",
    agentTagline: "Your cloud cost guide",
    minimize: "Minimize",
    closeChat: "Close chat",
    messageCount: {
      one: "{count} message",
      other: "{count} messages",
    },
    expandHint: "Click to expand",
    intro:
      "Atlas works from the deterministic results of your analysis. Confirm the actions in your own environment before applying them.",
    suggestion1: "How much am I spending, and on which services?",
    suggestion2: "Where can I save the most with the least effort?",
    suggestion3: "Give me the full executive report",
    suggestion4: "What can I do today to start saving?",
    suggestion5: "How much am I spending on AI, and how do I cut it?",
    suggestion6: "What is FOCUS and why is it worth adopting?",
    placeholder: "Ask about your costs…",
    placeholderRateLimited: "Demo limit reached",
    send: "Send",
    modeCached: "Cached answer · 0 tokens",
    modeDeterministic: "Direct calculation · 0 tokens",
    modeLlm: "Atlas AI · {count} tokens",
    toolReconciliation: "reconciling gross, adjustments and net",
    toolUploadDiagnosis: "reviewing file rows and available capabilities",
    toolQueryBilling: "querying your billing data",
    toolCalculateSavings: "calculating savings",
    toolGenerateRemediation: "generating commands",
    toolBuildReport: "assembling the report",
    toolLookupKnowledge: "looking up best practices",
  },

  errors: {
    title: "Error",
    unsupportedFile: "Unsupported file",
    notCsvOrExcel:
      "\"{name}\" is not a CSV or an Excel file (.xlsx). Export your billing data in one of those formats.",
    validation: "Validation error",
    connection: "Connection error",
    unknown: "Unknown error",
    validationDot: "Validation error.",
    connectionDot: "Connection error.",
    unknownDot: "Unknown error.",
    unknownCause: "unknown",
  },
};
