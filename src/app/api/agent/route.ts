import { NextRequest, NextResponse } from "next/server";
import { FinOpsAgent, AgentConfig, AnalysisContext } from "@/engine/agent";
import { generateDemoData } from "@/engine/demo-data";
import { calculateSavings } from "@/engine/tools/calculate-savings";
import { NormalizedCostRecord, CloudProvider, AuditReport } from "@/engine/types";
import {
  AtlasBudgetTracker,
  getAtlasLimits,
  normalizeAtlasCacheKey,
} from "@/engine/atlas-controls";
import { AgentMessage } from "@/engine/agent";
import { getAnalysis, verifyAnalysisToken } from "@/engine/analysis-store";
import { isLocale, type Locale } from "@/i18n/config";
import { guardBillingFile, mismatchMessage, LaneExpectation } from "@/engine/validation/provider-guard";
import { calculateScenario } from "@/engine/scenarios";
import {
  parseAtlasScreenContextInput,
  resolveAtlasScreenContext,
} from "@/engine/atlas-screen-context";

/**
 * Same lane-vs-file check /api/analyze runs, applied to the csvContent path
 * of this route too — csvContent used to call parseCSVAutoDetect() directly,
 * skipping the guard entirely, so an Azure export dropped in through this
 * path got analysed with AWS-shaped rules and no mismatch warning.
 */
function guardCsvContent(csvContent: string, lane: LaneExpectation | undefined) {
  try {
    return guardBillingFile(csvContent, lane);
  } catch (err) {
    return {
      ok: false as const,
      mismatch: {
        kind: "unrecognized" as const,
        expected: lane ?? "focus",
      },
      parseError: err instanceof Error ? err.message : "No se pudo leer el archivo.",
    };
  }
}

export const runtime = "nodejs";

// ─── Session store with TTL ──────────────────────────────────────────────────

interface SessionEntry {
  agent: FinOpsAgent;
  report: AuditReport;
  analysisId?: string;
  locale: Locale;
  createdAt: number;
  lastUsed: number;
  messageCount: number;
  responseCache: Map<string, AgentMessage>;
  inFlight: boolean;
}

const sessions = new Map<string, SessionEntry>();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_SESSIONS = 100;
const limits = getAtlasLimits();
const budgetTracker = new AtlasBudgetTracker();
let activeRequests = 0;
let consecutiveLlmFailures = 0;
let circuitOpenUntil = 0;

// ─── Rate limiting (public-use safety) ───────────────────────────────────────

interface IpCounter {
  count: number;
  windowStart: number;
}
const ipCounters = new Map<string, IpCounter>();

function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

/** Returns true if the IP is over its rolling-window limit. */
function isIpRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipCounters.get(ip);
  if (!entry || now - entry.windowStart > limits.ipWindowMs) {
    ipCounters.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > limits.maxMessagesPerIp;
}

/** Cleanup expired sessions and IP counters. */
function cleanup() {
  const now = Date.now();

  const staleSessions: string[] = [];
  sessions.forEach((entry, id) => {
    if (now - entry.lastUsed > SESSION_TTL_MS) staleSessions.push(id);
  });
  staleSessions.forEach((id) => sessions.delete(id));

  if (sessions.size > MAX_SESSIONS) {
    const sorted: [string, SessionEntry][] = [];
    sessions.forEach((entry, id) => sorted.push([id, entry]));
    sorted.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    sorted.slice(0, sessions.size - MAX_SESSIONS).forEach(([id]) => sessions.delete(id));
  }

  const staleIps: string[] = [];
  ipCounters.forEach((entry, ip) => {
    if (now - entry.windowStart > limits.ipWindowMs) staleIps.push(ip);
  });
  staleIps.forEach((ip) => ipCounters.delete(ip));
}

// ─── Server-side Bedrock config ──────────────────────────────────────────────

/**
 * Bedrock credentials are read ONLY from server environment variables.
 * They are NEVER accepted from the browser/request body.
 */
function getBedrockConfig(): AgentConfig | null {
  const accessKeyId = process.env.BEDROCK_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BEDROCK_SECRET_ACCESS_KEY;
  const region = process.env.BEDROCK_REGION || "us-east-1";
  const sessionToken = process.env.BEDROCK_SESSION_TOKEN;
  const modelId =
    process.env.BEDROCK_MODEL_ID || "amazon.nova-pro-v1:0";
  const economyModelId = process.env.BEDROCK_ECONOMY_MODEL_ID;

  if (!accessKeyId || !secretAccessKey) return null;

  return {
    bedrockRegion: region,
    bedrockAccessKeyId: accessKeyId,
    bedrockSecretAccessKey: secretAccessKey,
    bedrockSessionToken: sessionToken,
    modelId,
    economyModelId,
  };
}

function assertAllowedModels(config: AgentConfig): void {
  const configuredModels = [config.modelId, config.economyModelId].filter(
    (value): value is string => !!value
  );
  const allowedModels = (process.env.ATLAS_ALLOWED_MODEL_IDS || configuredModels.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const rejectedModel = configuredModels.find((value) => !allowedModels.includes(value));
  if (rejectedModel) {
    throw new Error(`ATLAS_MODEL_NOT_ALLOWED: ${rejectedModel}`);
  }
}

/** Build a compact AnalysisContext from an AuditReport for context injection. */
function buildAnalysisContext(
  report: AuditReport,
  totalRows: number,
  usableRows: number,
  scenarioSavingsUSD?: number,
  uploadDiagnosis?: AnalysisContext["uploadDiagnosis"]
): AnalysisContext {
  return {
    totalCostUSD: report.totalCostUSD,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    financialReconciliation: report.financialReconciliation,
    totalRows,
    usableRows,
    providers: report.providers,
    topServices: report.summaryByService
      .filter((service) => service.totalCostUSD > 0)
      .slice(0, 5)
      .map((service) => ({
        service: service.service,
        costUSD: service.totalCostUSD,
        percentage:
          report.financialReconciliation.grossUsageCostUSD > 0
            ? Math.round(
                (service.totalCostUSD / report.financialReconciliation.grossUsageCostUSD) * 10_000
              ) / 100
            : 0,
      })),
    portfolioSavingsUSD: scenarioSavingsUSD ?? report.portfolioSavingsUSD,
    savingsRange: {
      conservative: report.totalSavingsRange.conservative,
      optimistic: report.totalSavingsRange.optimistic,
    },
    topFindings: report.findings
      .filter((f) => f.estimatedMonthlySavingsUSD > 0)
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 3)
      .map((f) => ({
        id: f.id,
        title: f.title,
        provider: f.provider,
        service: f.service,
        category: f.category,
        estimatedMonthlySavingsUSD: f.estimatedMonthlySavingsUSD,
        priorityScore: f.priorityScore,
        nextAction: f.remediation.description,
        savingsRange: { conservative: f.savingsRange.conservative, optimistic: f.savingsRange.optimistic },
      })),
    highestSavingsFinding: report.findings
      .filter((finding) => finding.estimatedMonthlySavingsUSD > 0)
      .sort((left, right) =>
        right.estimatedMonthlySavingsUSD - left.estimatedMonthlySavingsUSD
      )
      .slice(0, 1)
      .map((finding) => ({
        id: finding.id,
        title: finding.title,
        estimatedMonthlySavingsUSD: finding.estimatedMonthlySavingsUSD,
        savingsRange: {
          conservative: finding.savingsRange.conservative,
          optimistic: finding.savingsRange.optimistic,
        },
      }))[0],
    commitmentEvidence: {
      purchasesUSD: report.financialReconciliation.commitmentPurchasesUSD,
      purchaseBasis: report.financialReconciliation.commitmentPurchaseCostBasis,
      missingCommitmentFinding: report.findings
        .filter((finding) => finding.category === "missing-commitment")
        .slice(0, 1)
        .map((finding) => ({
          title: finding.title,
          estimatedMonthlySavingsUSD: finding.estimatedMonthlySavingsUSD,
          savingsRange: {
            conservative: finding.savingsRange.conservative,
            optimistic: finding.savingsRange.optimistic,
          },
        }))[0],
    },
    aiAttribution: report.aiSpendSummary
      ? {
          observedCostUSD: report.aiSpendSummary.observedCostUSD,
          coveragePercentage: report.aiSpendSummary.attributionCoveragePercentage,
          attributable: report.aiSpendSummary.attributionCoveragePercentage > 0,
        }
      : undefined,
    uploadDiagnosis,
    catalogEvidence: report.billingCoverage
      ? {
          provider: report.billingCoverage.provider,
          schemaVersion: report.billingCoverage.sourceSchemaVersion,
          coveragePercentage: report.billingCoverage.coveragePercentage,
          status: report.billingCoverage.status,
          deterministic: true,
        }
      : undefined,
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * POST /api/agent
 * Body: { sessionId, message, useDemo?, csvContent?, provider? }
 * NOTE: No credentials are accepted from the client. Bedrock creds come from env.
 */
export async function POST(request: NextRequest) {
  let remainingForError: number | undefined;
  try {
    const body = await request.json();
    const { sessionId, message } = body;
    const screenContextInput = parseAtlasScreenContextInput(body.screenContext);
    const locale: Locale = body.locale === undefined ? "es" : body.locale;
    if (!isLocale(locale)) {
      return NextResponse.json(
        { success: false, code: "INVALID_LOCALE", error: "Locale must be es or en." },
        { status: 400 }
      );
    }
    const analysisId =
      typeof body.analysisId === "string" && body.analysisId.trim()
        ? body.analysisId.trim()
        : undefined;

    if (!sessionId || !message) {
      return NextResponse.json(
        { success: false, error: "Se requiere sessionId y message." },
        { status: 400 }
      );
    }
    if (typeof sessionId !== "string" || sessionId.length > 200) {
      return NextResponse.json(
        { success: false, error: "sessionId inválido." },
        { status: 400 }
      );
    }
    if (body.analysisId !== undefined && !analysisId) {
      return NextResponse.json(
        { success: false, error: "analysisId inválido." },
        { status: 400 }
      );
    }
    if (!analysisId) {
      return NextResponse.json(
        {
          success: false,
          code: "NO_ANALYSIS_CONTEXT",
          error: "Atlas necesita un análisis cargado para responder sobre costos o datos.",
        },
        { status: 409 }
      );
    }
    if (!verifyAnalysisToken(analysisId, request.headers.get("X-Nimbus-Analysis-Token"))) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_ANALYSIS_TOKEN",
          error: "Falta o es inválido el token del análisis (X-Nimbus-Analysis-Token).",
        },
        { status: 401 }
      );
    }
    if (typeof message !== "string" || message.length > limits.maxInputCharacters) {
      return NextResponse.json(
        {
          success: false,
          error: `La pregunta supera el límite de ${limits.maxInputCharacters.toLocaleString("es-MX")} caracteres.`,
        },
        { status: 413 }
      );
    }

    cleanup();

    // Per-IP rate limit
    const ip = getClientIp(request);
    if (isIpRateLimited(ip)) {
      return NextResponse.json(
        {
          success: false,
          rateLimited: true,
          error: "Límite de demo alcanzado desde tu red. Intenta de nuevo más tarde.",
        },
        { status: 429 }
      );
    }

    let entry = sessions.get(sessionId);
    if (entry && ((analysisId && entry.analysisId !== analysisId) || entry.locale !== locale)) {
      sessions.delete(sessionId);
      entry = undefined;
    }
    const bedrockConfig = getBedrockConfig();

    if (!entry) {
      let records: NormalizedCostRecord[];
      let report: AuditReport;
      let totalRows: number;
      const storedAnalysis = getAnalysis(analysisId);
      if (!storedAnalysis) {
        return NextResponse.json(
          {
            success: false,
            analysisExpired: true,
            error:
              "El análisis de Atlas expiró. Vuelve a ejecutar la auditoría para enlazar el chat con el reporte visible.",
          },
          { status: 410 }
        );
      }
      if (storedAnalysis) {
        records = storedAnalysis.records;
        report = storedAnalysis.report;
        totalRows = storedAnalysis.totalRows;
      } else if (body.useDemo) {
        const provider = (body.provider as CloudProvider) || undefined;
        records = generateDemoData(provider);
        report = calculateSavings(records);
        totalRows = records.length;
      } else if (typeof body.csvContent === "string") {
        // Cheap pre-check BEFORE parsing: a rough floor of ~20 bytes per CSV
        // row means a file already too big to possibly fit under
        // maxBillingRows gets rejected without paying for a full parse.
        // parseCSVAutoDetect() still runs the real, precise check below —
        // this only stops the worst case (a multi-hundred-MB body) early.
        if (body.csvContent.length > limits.maxBillingRows * 20) {
          return NextResponse.json(
            {
              success: false,
              error: `El archivo es demasiado grande para Atlas (máximo ${limits.maxBillingRows.toLocaleString()} filas por sesión).`,
            },
            { status: 413 }
          );
        }
        const laneRaw = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
        const lane = (["aws", "azure", "gcp", "focus"] as const).includes(laneRaw as never)
          ? (laneRaw as LaneExpectation)
          : undefined;
        const guard = guardCsvContent(body.csvContent, lane);
        if (!guard.ok) {
          return NextResponse.json(
            {
              success: false,
              error: "parseError" in guard && guard.parseError ? guard.parseError : mismatchMessage(guard.mismatch),
              providerMismatch: guard.mismatch,
            },
            { status: 400 }
          );
        }
        records = guard.parsed.records;
        if (records.length > limits.maxBillingRows) {
          return NextResponse.json(
            {
              success: false,
              error:
                `Atlas acepta como máximo ${limits.maxBillingRows.toLocaleString()} filas por sesión. ` +
                "El reporte determinístico puede seguir generándose desde la carga principal.",
            },
            { status: 413 }
          );
        }
        report = calculateSavings(
          records,
          guard.parsed.isFocus,
          guard.parsed.diagnostics,
          guard.parsed.schemaCoverage
        );
        totalRows = guard.parsed.diagnostics?.totalRows ?? records.length;
      } else {
        // No analysisId, no explicit useDemo, no csvContent: there is nothing
        // to talk about. This used to silently fall back to random demo
        // data — the user would see confident-looking numbers about a cloud
        // bill that does not exist and was never told so. The real UI always
        // sends analysisId (AgentChat requires it as a prop), so this path
        // only matters for direct API callers, and for them a clear error is
        // strictly better than fabricated data.
        return NextResponse.json(
          {
            success: false,
            code: "NO_ANALYSIS_CONTEXT",
            error: 'Atlas necesita un análisis. Envía "analysisId" (con su token) o, para pruebas, "useDemo": true.',
          },
          { status: 409 }
        );
      }
      if (records.length > limits.maxBillingRows) {
        return NextResponse.json(
          {
            success: false,
            error:
              `Atlas acepta como máximo ${limits.maxBillingRows.toLocaleString()} filas por sesión. ` +
              "El reporte determinístico puede seguir utilizándose sin Atlas.",
          },
          { status: 413 }
        );
      }

      const scenarioSavingsUSD = storedAnalysis
        ? calculateScenario(report, storedAnalysis.scenario, storedAnalysis.scenarioRevision).monthlySavingsUSD
        : undefined;
      const agent = new FinOpsAgent(
        records,
        bedrockConfig ?? {},
        buildAnalysisContext(
          report,
          totalRows,
          records.length,
          scenarioSavingsUSD,
          storedAnalysis?.diagnosis
        ),
        report,
        locale
      );
      entry = {
        agent,
        report,
        analysisId,
        locale,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        messageCount: 0,
        responseCache: new Map(),
        inFlight: false,
      };
      sessions.set(sessionId, entry);
    }

    // Per-session message limit
    if (entry.messageCount >= limits.maxMessagesPerSession) {
      return NextResponse.json(
        {
          success: false,
          rateLimited: true,
          error: `Límite de demo alcanzado (${limits.maxMessagesPerSession} mensajes por sesión). Inicia una nueva auditoría para seguir explorando.`,
        },
        { status: 429 }
      );
    }
    remainingForError = limits.maxMessagesPerSession - entry.messageCount;

    const currentAnalysis = getAnalysis(analysisId);
    if (!currentAnalysis) {
      return NextResponse.json(
        {
          success: false,
          analysisExpired: true,
          error:
            "El análisis de Atlas expiró. Vuelve a ejecutar la auditoría para enlazar el chat con el reporte visible.",
        },
        { status: 410 }
      );
    }
    const currentScenario = calculateScenario(
      entry.report,
      currentAnalysis.scenario,
      currentAnalysis.scenarioRevision
    );
    const screenContext = resolveAtlasScreenContext(
      screenContextInput,
      entry.report,
      currentScenario
    );
    const screenCacheKey =
      `${screenContext.activeTab}:${screenContext.expandedFinding?.id ?? ""}:` +
      `${screenContext.scenario?.revision ?? 0}`;
    const cacheKey = `${locale}:${screenCacheKey}:${normalizeAtlasCacheKey(message)}`;
    const cached = entry.responseCache.get(cacheKey);
    if (cached) {
      budgetTracker.recordCacheHit();
      entry.lastUsed = Date.now();
      return NextResponse.json({
        success: true,
        response: { content: cached.content, toolCalls: cached.toolCalls },
        remaining: limits.maxMessagesPerSession - entry.messageCount,
        atlas: {
          mode: cached.mode ?? "llm",
          cached: true,
          usage: { ...(cached.usage ?? {}), estimatedCostUSD: 0, modelCalls: 0 },
          budget: budgetTracker.snapshot(limits),
        },
      });
    }

    const deterministic = entry.agent.canAnswerDeterministically(message, screenContext);
    if (!deterministic) {
      if ((process.env.ATLAS_MODE || "normal").toLowerCase() === "emergency") {
        return NextResponse.json(
          {
            success: false,
            atlasUnavailable: true,
            remaining: limits.maxMessagesPerSession - entry.messageCount,
            error:
              "Atlas está en modo emergencia: las llamadas de IA están deshabilitadas, pero las respuestas factuales siguen disponibles.",
          },
          { status: 503 }
        );
      }
      if (!bedrockConfig) {
        return NextResponse.json(
          {
            success: false,
            remaining: limits.maxMessagesPerSession - entry.messageCount,
            error:
              "Atlas IA no está configurado en el servidor. Las consultas factuales determinísticas siguen disponibles.",
          },
          { status: 503 }
        );
      }
      assertAllowedModels(bedrockConfig);
      if (Date.now() < circuitOpenUntil) {
        return NextResponse.json(
          {
            success: false,
            atlasUnavailable: true,
            remaining: limits.maxMessagesPerSession - entry.messageCount,
            error:
              "Atlas IA está temporalmente pausado por protección de costos o fallos. El análisis determinístico sigue disponible.",
          },
          { status: 503 }
        );
      }
      const budgetCheck = budgetTracker.canCallModel(limits);
      if (!budgetCheck.ok) {
        return NextResponse.json(
          {
            success: false,
            budgetLimited: true,
            remaining: limits.maxMessagesPerSession - entry.messageCount,
            error: `${budgetCheck.reason} El análisis y las respuestas factuales siguen disponibles.`,
          },
          { status: 429 }
        );
      }
      if (activeRequests >= limits.maxConcurrentRequests || entry.inFlight) {
        return NextResponse.json(
          {
            success: false,
            rateLimited: true,
            remaining: limits.maxMessagesPerSession - entry.messageCount,
            error: "Atlas ya está procesando una consulta. Espera a que termine antes de enviar otra.",
          },
          { status: 429 }
        );
      }
    }

    entry.lastUsed = Date.now();
    if (!deterministic) {
      activeRequests += 1;
      entry.inFlight = true;
    }

    let response: AgentMessage;
    try {
      response = await entry.agent.chat(message, screenContext);
      if (response.mode === "deterministic") {
        budgetTracker.recordDeterministic();
      } else if (response.usage) {
        budgetTracker.recordLlm(response.usage);
        consecutiveLlmFailures = 0;
      }
      // A failed Bedrock request must not consume one of the user's demo
      // messages. Count only responses that Atlas actually returned.
      entry.messageCount += 1;
      remainingForError = limits.maxMessagesPerSession - entry.messageCount;
    } catch (error) {
      if (!deterministic) {
        consecutiveLlmFailures += 1;
        if (consecutiveLlmFailures >= limits.circuitBreakerFailures) {
          circuitOpenUntil = Date.now() + limits.circuitBreakerOpenMs;
        }
      }
      throw error;
    } finally {
      if (!deterministic) {
        activeRequests = Math.max(0, activeRequests - 1);
        entry.inFlight = false;
      }
    }

    entry.responseCache.set(cacheKey, response);
    if (entry.responseCache.size > 50) {
      const oldestKey = entry.responseCache.keys().next().value as string | undefined;
      if (oldestKey) entry.responseCache.delete(oldestKey);
    }

    return NextResponse.json({
      success: true,
      response: { content: response.content, toolCalls: response.toolCalls },
      remaining: limits.maxMessagesPerSession - entry.messageCount,
      atlas: {
        mode: response.mode ?? "llm",
        cached: false,
        usage: response.usage,
        budget: budgetTracker.snapshot(limits),
      },
    });
  } catch (error) {
    console.error("Agent error:", error);
    const msg = error instanceof Error ? error.message : "Error desconocido";
    const errorName =
      error && typeof error === "object" && "name" in error
        ? String((error as { name?: unknown }).name ?? "")
        : "";

    if (errorName === "AccessDeniedException" || msg.includes("AccessDeniedException")) {
      const marketplace = /marketplace|subscription|subscribe/i.test(msg);
      return NextResponse.json(
        {
          success: false,
          error: marketplace
            ? "El modelo requiere habilitar su suscripción en AWS Marketplace o autorizar aws-marketplace:ViewSubscriptions y aws-marketplace:Subscribe."
            : "La identidad de Atlas no tiene permiso para invocar este modelo en Bedrock.",
        },
        { status: 403 }
      );
    }
    if (msg.startsWith("ATLAS_MODEL_NOT_ALLOWED")) {
      return NextResponse.json(
        { success: false, error: "El modelo configurado para Atlas no está en la allowlist del servidor." },
        { status: 503 }
      );
    }
    if (errorName === "ResourceNotFoundException" || msg.includes("ResourceNotFoundException")) {
      return NextResponse.json({ success: false, error: "Modelo no encontrado en Bedrock." }, { status: 404 });
    }
    if (
      errorName === "ThrottlingException" ||
      errorName === "TooManyRequestsException" ||
      /too many requests|throttl|rate.?exceed/i.test(msg)
    ) {
      return NextResponse.json(
        {
          success: false,
          retryable: true,
          remaining: remainingForError,
          error:
            "Bedrock está recibiendo demasiadas solicitudes. Tu mensaje no consumió el límite de la auditoría; inténtalo nuevamente en unos segundos.",
        },
        { status: 503, headers: { "Retry-After": "5" } }
      );
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
