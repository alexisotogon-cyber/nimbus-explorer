export interface AtlasLimits {
  maxBillingRows: number;
  maxInputCharacters: number;
  maxOutputTokens: number;
  maxMessagesPerSession: number;
  maxToolCalls: number;
  requestTimeoutMs: number;
  maxHistoryTextMessages: number;
  maxConcurrentRequests: number;
  ipWindowMs: number;
  maxMessagesPerIp: number;
  dailyTokenBudget: number;
  dailyCostBudgetUSD: number;
  monthlyCostBudgetUSD: number;
  inputPricePerMillionUSD: number;
  outputPricePerMillionUSD: number;
  cacheReadPricePerMillionUSD: number;
  circuitBreakerFailures: number;
  circuitBreakerOpenMs: number;
}

export interface AtlasUsage {
  modelId?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
  modelCalls: number;
  latencyMs: number;
}

export interface AtlasBudgetSnapshot {
  day: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUSD: number;
    llmRequests: number;
    deterministicRequests: number;
    cacheHits: number;
  };
  month: {
    estimatedCostUSD: number;
    llmRequests: number;
  };
  limits: {
    dailyTokenBudget: number;
    dailyCostBudgetUSD: number;
    monthlyCostBudgetUSD: number;
  };
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function getAtlasLimits(): AtlasLimits {
  return {
    maxBillingRows: envNumber("ATLAS_MAX_BILLING_ROWS", 50_000, 100, 1_000_000),
    maxInputCharacters: envNumber("ATLAS_MAX_INPUT_CHARACTERS", 12_000, 200, 100_000),
    maxOutputTokens: envNumber("ATLAS_MAX_OUTPUT_TOKENS", 220, 64, 4_096),
    maxMessagesPerSession: envNumber("ATLAS_MAX_MESSAGES_PER_AUDIT", 12, 1, 100),
    maxToolCalls: envNumber("ATLAS_MAX_TOOL_CALLS", 1, 0, 10),
    requestTimeoutMs: envNumber("ATLAS_REQUEST_TIMEOUT_MS", 30_000, 1_000, 120_000),
    maxHistoryTextMessages: envNumber("ATLAS_MAX_HISTORY_MESSAGES", 4, 2, 30),
    maxConcurrentRequests: envNumber("ATLAS_MAX_CONCURRENT_REQUESTS", 4, 1, 50),
    ipWindowMs: envNumber("ATLAS_IP_WINDOW_MS", 3_600_000, 60_000, 86_400_000),
    maxMessagesPerIp: envNumber("ATLAS_MAX_MESSAGES_PER_IP", 30, 1, 1_000),
    dailyTokenBudget: envNumber("ATLAS_DAILY_TOKEN_BUDGET", 100_000, 1_000, 100_000_000),
    dailyCostBudgetUSD: envNumber("ATLAS_DAILY_COST_BUDGET_USD", 1.5, 0.01, 100_000),
    monthlyCostBudgetUSD: envNumber("ATLAS_MONTHLY_COST_BUDGET_USD", 25, 0.01, 1_000_000),
    // Nova Pro on-demand defaults for the demo. Override these when the
    // configured model, region, or service tier uses a different price card.
    inputPricePerMillionUSD: envNumber("ATLAS_INPUT_PRICE_PER_MILLION_USD", 0.8, 0, 1_000),
    outputPricePerMillionUSD: envNumber("ATLAS_OUTPUT_PRICE_PER_MILLION_USD", 3.2, 0, 1_000),
    cacheReadPricePerMillionUSD: envNumber("ATLAS_CACHE_READ_PRICE_PER_MILLION_USD", 0, 0, 1_000),
    circuitBreakerFailures: envNumber("ATLAS_CIRCUIT_BREAKER_FAILURES", 3, 1, 20),
    circuitBreakerOpenMs: envNumber("ATLAS_CIRCUIT_BREAKER_OPEN_MS", 60_000, 1_000, 3_600_000),
  };
}

export function estimateAtlasCost(
  usage: Omit<AtlasUsage, "estimatedCostUSD" | "latencyMs" | "modelCalls">,
  limits: AtlasLimits
): number {
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cacheReadInputTokens);
  const cost =
    (uncachedInput / 1_000_000) * limits.inputPricePerMillionUSD +
    (usage.cacheReadInputTokens / 1_000_000) * limits.cacheReadPricePerMillionUSD +
    (usage.outputTokens / 1_000_000) * limits.outputPricePerMillionUSD;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function normalizeAtlasCacheKey(message: string): string {
  return message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

interface PeriodCounters {
  key: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
  llmRequests: number;
  deterministicRequests: number;
  cacheHits: number;
}

export class AtlasBudgetTracker {
  private day: PeriodCounters = this.newCounters(this.dayKey());
  private month: PeriodCounters = this.newCounters(this.monthKey());

  private dayKey(now = new Date()): string {
    return now.toISOString().slice(0, 10);
  }

  private monthKey(now = new Date()): string {
    return now.toISOString().slice(0, 7);
  }

  private newCounters(key: string): PeriodCounters {
    return {
      key,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUSD: 0,
      llmRequests: 0,
      deterministicRequests: 0,
      cacheHits: 0,
    };
  }

  private rollover(): void {
    const dayKey = this.dayKey();
    const monthKey = this.monthKey();
    if (this.day.key !== dayKey) this.day = this.newCounters(dayKey);
    if (this.month.key !== monthKey) this.month = this.newCounters(monthKey);
  }

  canCallModel(limits: AtlasLimits): { ok: true } | { ok: false; reason: string } {
    this.rollover();
    const reservedInputTokens = Math.ceil((limits.maxInputCharacters || 0) / 4);
    const reservedOutputTokens = limits.maxOutputTokens || 0;
    const reservedTotalTokens = reservedInputTokens + reservedOutputTokens;
    const reservedCostUSD =
      (reservedInputTokens / 1_000_000) * (limits.inputPricePerMillionUSD || 0) +
      (reservedOutputTokens / 1_000_000) * (limits.outputPricePerMillionUSD || 0);
    if (
      this.day.totalTokens >= limits.dailyTokenBudget ||
      this.day.totalTokens + reservedTotalTokens > limits.dailyTokenBudget
    ) {
      return { ok: false, reason: "Se alcanzó el presupuesto diario de tokens de Atlas." };
    }
    if (
      this.day.estimatedCostUSD >= limits.dailyCostBudgetUSD ||
      this.day.estimatedCostUSD + reservedCostUSD > limits.dailyCostBudgetUSD
    ) {
      return { ok: false, reason: "Se alcanzó el presupuesto diario de costo de Atlas." };
    }
    if (
      this.month.estimatedCostUSD >= limits.monthlyCostBudgetUSD ||
      this.month.estimatedCostUSD + reservedCostUSD > limits.monthlyCostBudgetUSD
    ) {
      return { ok: false, reason: "Se alcanzó el presupuesto mensual de costo de Atlas." };
    }
    return { ok: true };
  }

  recordLlm(usage: AtlasUsage): void {
    this.rollover();
    for (const counters of [this.day, this.month]) {
      counters.inputTokens += usage.inputTokens;
      counters.outputTokens += usage.outputTokens;
      counters.totalTokens += usage.totalTokens;
      counters.estimatedCostUSD =
        Math.round((counters.estimatedCostUSD + usage.estimatedCostUSD) * 1_000_000) / 1_000_000;
      counters.llmRequests += 1;
    }
  }

  recordDeterministic(): void {
    this.rollover();
    this.day.deterministicRequests += 1;
    this.month.deterministicRequests += 1;
  }

  recordCacheHit(): void {
    this.rollover();
    this.day.cacheHits += 1;
    this.month.cacheHits += 1;
  }

  snapshot(limits: AtlasLimits): AtlasBudgetSnapshot {
    this.rollover();
    return {
      day: {
        inputTokens: this.day.inputTokens,
        outputTokens: this.day.outputTokens,
        totalTokens: this.day.totalTokens,
        estimatedCostUSD: this.day.estimatedCostUSD,
        llmRequests: this.day.llmRequests,
        deterministicRequests: this.day.deterministicRequests,
        cacheHits: this.day.cacheHits,
      },
      month: {
        estimatedCostUSD: this.month.estimatedCostUSD,
        llmRequests: this.month.llmRequests,
      },
      limits: {
        dailyTokenBudget: limits.dailyTokenBudget,
        dailyCostBudgetUSD: limits.dailyCostBudgetUSD,
        monthlyCostBudgetUSD: limits.monthlyCostBudgetUSD,
      },
    };
  }
}
