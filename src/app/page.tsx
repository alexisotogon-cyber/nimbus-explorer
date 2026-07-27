"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ChatCircleDots,
  CheckCircle,
  FileCsv,
  ShieldCheck,
  X,
} from "@phosphor-icons/react";
import { ReportDashboard } from "@/components/report-dashboard";
import { AgentChat } from "@/components/agent-chat";
import { AWSConnectSection } from "@/components/aws-connect-section";
import { UploadSection } from "@/components/upload-section";
import { FocusS3ConnectSection } from "@/components/focus-s3-connect-section";
import { AuditReport, CloudProvider } from "@/engine/types";
import type { DemoComplexity, DemoVariant } from "@/engine/demo-data";
import { FileDiagnosis } from "@/engine/validation/file-check";
import { FileCheckPanel } from "@/components/file-check-panel";
import { ProviderMismatchPanel } from "@/components/provider-mismatch-panel";
import { ProviderMismatch, LaneExpectation } from "@/engine/validation/provider-guard";
import { AiIcon, SparkleIcon } from "@/components/icons";
import {
  AwsWordmark,
  AzureWordmark,
  FinOpsFoundationWordmark,
  FocusWordmark,
  GcpWordmark,
} from "@/components/provider-wordmarks";
import { ThemeToggle } from "@/theme/theme-toggle";
import { LocaleToggle } from "@/i18n/locale-toggle";
import { useLocale } from "@/i18n/locale-provider";
import type { AtlasScreenContextInput } from "@/engine/atlas-screen-context";

type StableStep = "choose-cloud" | "data-source" | "dashboard";
type AnalysisStatus = "idle" | "uploading" | "processing" | "cancelled";
type Step = StableStep | "analyzing";

interface FlowState {
  step: StableStep;
  provider: CloudProvider | null;
  report: AuditReport | null;
  markdown: string;
  analysisId: string | null;
  /** Second secret required as X-Nimbus-Analysis-Token on every Atlas/scenario/export/delete call. Kept only in memory, never in a URL. */
  analysisToken: string | null;
  status: AnalysisStatus;
  error: string | null;
  diagnosis: FileDiagnosis | null;
  mismatch: ProviderMismatch | null;
  selectedFile: File | null;
  uploadProgress: number | null;
  processingStage: number;
}

type FlowAction =
  | { type: "PATCH"; patch: Partial<FlowState> }
  | { type: "RESET" };

const INITIAL_FLOW: FlowState = {
  step: "choose-cloud",
  provider: null,
  report: null,
  markdown: "",
  analysisId: null,
  analysisToken: null,
  status: "idle",
  error: null,
  diagnosis: null,
  mismatch: null,
  selectedFile: null,
  uploadProgress: null,
  processingStage: 0,
};

function flowReducer(state: FlowState, action: FlowAction): FlowState {
  if (action.type === "RESET") return INITIAL_FLOW;
  return { ...state, ...action.patch };
}

export default function HomePage() {
  const [flow, dispatch] = useReducer(flowReducer, INITIAL_FLOW);
  const [showAgentDrawer, setShowAgentDrawer] = useReducer((_: boolean, value: boolean) => value, false);
  const [agentMinimized, setAgentMinimized] = useReducer((_: boolean, value: boolean) => value, false);
  const abortRef = useRef<AbortController | XMLHttpRequest | null>(null);
  const processingTimersRef = useRef<number[]>([]);
  const cancelledRef = useRef(false);
  const atlasTriggerRef = useRef<HTMLButtonElement>(null);
  const reportRef = useRef<AuditReport | null>(null);
  const generatedContentRef = useRef<HTMLDivElement>(null);
  const lastRevealedOutcomeRef = useRef<object | null>(null);
  const { locale } = useLocale();
  const [demoConfig, setDemoConfig] = useState<{ complexity: DemoComplexity; variant: DemoVariant }>({ complexity: "medium", variant: "standard" });
  const [atlasScreenContext, setAtlasScreenContext] = useState<AtlasScreenContextInput>({
    activeTab: "overview",
  });

  const {
    provider: selectedProvider,
    report,
    markdown,
    analysisId,
    analysisToken,
    error,
    diagnosis: fileDiagnosis,
    mismatch: providerMismatch,
    selectedFile,
  } = flow;
  reportRef.current = report;
  const loading = flow.status === "uploading" || flow.status === "processing";
  const step: Step = loading ? "analyzing" : flow.step;

  /**
   * Newly generated content should not appear somewhere outside the viewport
   * without telling the user where the action landed. Scroll first, then move
   * programmatic focus without causing a second jump. Motion-sensitive users
   * get the same destination immediately.
   */
  const revealElement = useCallback((element: HTMLElement, moveFocus = true) => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.requestAnimationFrame(() => {
      element.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
      if (moveFocus) element.focus({ preventScroll: true });
    });
  }, []);

  const handleDisclosureToggle = useCallback(
    (event: SyntheticEvent<HTMLDetailsElement>) => {
      const disclosure = event.currentTarget;
      if (disclosure.open) revealElement(disclosure, false);
    },
    [revealElement]
  );

  useEffect(() => {
    if (loading) return;
    const outcome =
      providerMismatch ??
      fileDiagnosis ??
      (flow.step === "dashboard" ? report : null);
    if (!outcome || lastRevealedOutcomeRef.current === outcome) return;
    lastRevealedOutcomeRef.current = outcome;

    const target = generatedContentRef.current;
    if (target) revealElement(target);
  }, [
    fileDiagnosis,
    flow.step,
    loading,
    providerMismatch,
    report,
    revealElement,
  ]);

  const setSelectedProvider = (provider: CloudProvider | null) =>
    dispatch({ type: "PATCH", patch: { provider } });
  const setReport = (next: AuditReport | null) =>
    dispatch({ type: "PATCH", patch: { report: next } });
  const setMarkdown = (next: string) =>
    dispatch({ type: "PATCH", patch: { markdown: next } });
  const setAnalysisId = (next: string | null) =>
    dispatch({ type: "PATCH", patch: { analysisId: next } });
  const setAnalysisToken = (next: string | null) =>
    dispatch({ type: "PATCH", patch: { analysisToken: next } });
  const setError = (next: string | null) =>
    dispatch({ type: "PATCH", patch: { error: next } });
  const setFileDiagnosis = (next: FileDiagnosis | null) =>
    dispatch({ type: "PATCH", patch: { diagnosis: next } });
  const setProviderMismatch = (next: ProviderMismatch | null) =>
    dispatch({ type: "PATCH", patch: { mismatch: next } });
  const setSelectedFile = (next: File | null) =>
    dispatch({ type: "PATCH", patch: { selectedFile: next } });
  const setLoading = (value: boolean) =>
    dispatch({ type: "PATCH", patch: { status: value ? "processing" : "idle" } });

  const clearProcessingStages = () => {
    processingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    processingTimersRef.current = [];
  };

  const startProcessingStages = () => {
    clearProcessingStages();
    dispatch({ type: "PATCH", patch: { status: "processing", uploadProgress: 100, processingStage: 1 } });
    processingTimersRef.current = [
      window.setTimeout(() => dispatch({ type: "PATCH", patch: { processingStage: 2 } }), 800),
      window.setTimeout(() => dispatch({ type: "PATCH", patch: { processingStage: 3 } }), 1_600),
    ];
  };

  const setStep = useCallback((next: Step, historyMode: "push" | "replace" = "push") => {
    if (next === "analyzing") {
      dispatch({ type: "PATCH", patch: { status: "processing" } });
      return;
    }
    dispatch({ type: "PATCH", patch: { step: next, status: "idle" } });
    if (typeof window !== "undefined") {
      const method = historyMode === "replace" ? "replaceState" : "pushState";
      window.history[method]({ nimbusStep: next }, "", `#${next}`);
    }
  }, []);

  useEffect(() => {
    window.history.replaceState({ nimbusStep: flow.step }, "", `#${flow.step}`);
    const onPopState = (event: PopStateEvent) => {
      const requested = event.state?.nimbusStep as StableStep | undefined;
      const safeStep = requested === "dashboard" && !reportRef.current ? "data-source" : requested;
      if (safeStep === "choose-cloud" || safeStep === "data-source" || safeStep === "dashboard") {
        dispatch({ type: "PATCH", patch: { step: safeStep, status: "idle" } });
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const currentLane: LaneExpectation = selectedProvider ?? "focus";

  const handleProviderSelect = (provider: CloudProvider) => {
    setSelectedProvider(provider);
    setStep("data-source");
  };

  const handleBack = () => {
    if (flow.step === "dashboard") {
      setStep("data-source");
    } else if (flow.step === "data-source") {
      setStep("choose-cloud");
    }
  };

  const closeAtlas = useCallback(() => {
    setShowAgentDrawer(false);
    window.setTimeout(() => atlasTriggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!showAgentDrawer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAtlas();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeAtlas, showAgentDrawer]);

  // Focus trap: aria-modal="true" alone doesn't stop Tab from leaving the
  // panel — it just tells assistive tech the rest of the page is inert while
  // sighted-but-keyboard users could still tab straight into the dashboard
  // behind it. Moves focus in on open and wraps Tab/Shift+Tab at the edges.
  const atlasDialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showAgentDrawer) return;
    const dialog = atlasDialogRef.current;
    if (!dialog) return;
    const getFocusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);

    const focusFirst = window.setTimeout(() => getFocusable()[0]?.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusFirst);
      dialog.removeEventListener("keydown", onKeyDown);
    };
  }, [showAgentDrawer]);

  /**
   * `laneOverride` exists because retryInLane switches lane and re-submits in
   * the same tick, when `selectedProvider` still holds the old value. Passing
   * the lane explicitly avoids depending on when React flushes state.
   */
  const handleAnalyze = async (
    mode: "demo" | "file",
    file?: File,
    laneOverride?: LaneExpectation
  ) => {
    cancelledRef.current = false;
    clearProcessingStages();
    let processingStartedAt = 0;
    let processingStarted = mode === "demo";
    dispatch({
      type: "PATCH",
      patch: {
        status: mode === "file" ? "uploading" : "processing",
        uploadProgress: mode === "file" ? 0 : null,
      },
    });
    setError(null);
    setFileDiagnosis(null);
    setProviderMismatch(null);

    if (mode === "demo") {
      processingStartedAt = Date.now();
      startProcessingStages();
    }

    try {
      let data: {
        success?: boolean;
        error?: string;
        diagnosis?: FileDiagnosis;
        providerMismatch?: ProviderMismatch;
        report?: AuditReport;
        markdown?: string;
        analysisId?: string;
        analysisToken?: string;
      };

      if (mode === "demo") {
        const controller = new AbortController();
        abortRef.current = controller;
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ useDemo: true, provider: selectedProvider, demo: demoConfig }),
          signal: controller.signal,
        });
        data = await response.json();
      } else if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("provider", laneOverride ?? selectedProvider ?? "focus");
        data = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          abortRef.current = xhr;
          xhr.open("POST", "/api/analyze");
          xhr.responseType = "json";
          xhr.upload.addEventListener("progress", (event) => {
            if (!event.lengthComputable) return;
            const progress = Math.round((event.loaded / event.total) * 100);
            dispatch({ type: "PATCH", patch: { status: "uploading", uploadProgress: progress } });
            if (progress >= 100 && !processingStarted) {
              processingStarted = true;
              processingStartedAt = Date.now();
              startProcessingStages();
            }
          });
          xhr.addEventListener("load", () => {
            const responseBody =
              xhr.response ?? JSON.parse(xhr.responseText || "{}");
            resolve(responseBody);
          });
          xhr.addEventListener("error", () => reject(new Error("NETWORK_ERROR")));
          xhr.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")));
          xhr.send(formData);
        });
      } else {
        setError(locale === "es" ? "No se proporcionó archivo." : "No file was provided.");
        setStep("data-source");
        return;
      }

      if (!processingStarted) {
        processingStarted = true;
        processingStartedAt = Date.now();
        startProcessingStages();
      }
      const elapsed = Date.now() - processingStartedAt;
      if (elapsed < 2_400) {
        await new Promise((resolve) => window.setTimeout(resolve, 2_400 - elapsed));
      }
      if (cancelledRef.current) return;

      if (data.diagnosis) setFileDiagnosis(data.diagnosis);
      if (data.providerMismatch) setProviderMismatch(data.providerMismatch);

      if (!data.success) {
        setError(data.error || (locale === "es" ? "Error desconocido." : "Unknown error."));
        setStep("data-source");
      } else if (data.report) {
        setReport(data.report);
        setMarkdown(data.markdown || "");
        setAnalysisId(data.analysisId || null);
        setAnalysisToken(data.analysisToken || null);
        setStep("dashboard");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        dispatch({ type: "PATCH", patch: { status: "cancelled", uploadProgress: null } });
      } else {
        setError(
          err instanceof Error && err.message !== "NETWORK_ERROR"
            ? err.message
            : locale === "es"
              ? "Error de conexión."
              : "Connection error."
        );
        dispatch({ type: "PATCH", patch: { status: "idle", processingStage: 0 } });
      }
    } finally {
      abortRef.current = null;
      clearProcessingStages();
      if (!cancelledRef.current) dispatch({ type: "PATCH", patch: { status: "idle", processingStage: 0 } });
    }
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    clearProcessingStages();
    const active = abortRef.current;
    if (active instanceof XMLHttpRequest) active.abort();
    else active?.abort();
    abortRef.current = null;
    dispatch({ type: "PATCH", patch: { status: "cancelled", uploadProgress: null, processingStage: 0 } });
  };

  const handleAWSConnected = (
    reportData: unknown,
    md: string,
    connectedAnalysisId: string,
    connectedAnalysisToken: string
  ) => {
    setReport(reportData as AuditReport);
    setMarkdown(md);
    setAnalysisId(connectedAnalysisId);
    setAnalysisToken(connectedAnalysisToken);
    setStep("dashboard");
  };

  const handleFocusConnected = (
    reportData: AuditReport,
    md: string,
    connectedAnalysisId: string,
    connectedAnalysisToken: string
  ) => {
    setReport(reportData);
    setMarkdown(md);
    setAnalysisId(connectedAnalysisId);
    setAnalysisToken(connectedAnalysisToken);
    setStep("dashboard");
  };

  /** Switches lane in place and re-submits the same file — no trip back to step 1. */
  const retryInLane = (lane: LaneExpectation) => {
    setSelectedProvider(lane === "focus" ? null : lane);
    setProviderMismatch(null);
    setError(null);
    if (selectedFile) handleAnalyze("file", selectedFile, lane);
  };

  /** Clears the rejected file, leaving the user on step 2 ready to drop another. */
  const handlePickAnother = () => {
    setSelectedFile(null);
    setProviderMismatch(null);
    setError(null);
    setFileDiagnosis(null);
  };

  const handleReset = () => {
    if (flow.report) {
      const confirmed = window.confirm(
        locale === "es"
          ? "¿Iniciar una nueva auditoría? El análisis actual se quitará de esta sesión."
          : "Start a new audit? The current analysis will be removed from this session."
      );
      if (!confirmed) return;
    }
    abortRef.current instanceof XMLHttpRequest
      ? abortRef.current.abort()
      : abortRef.current?.abort();
    if (analysisId && analysisToken) {
      // Best-effort: actually delete the data server-side instead of just
      // abandoning it to its 30-minute TTL. Fire-and-forget — the user is
      // leaving this analysis regardless of whether the network call lands.
      void fetch(`/api/analysis/${analysisId}`, {
        method: "DELETE",
        headers: { "X-Nimbus-Analysis-Token": analysisToken },
      }).catch(() => {});
    }
    dispatch({ type: "RESET" });
    window.history.replaceState({ nimbusStep: "choose-cloud" }, "", "#choose-cloud");
    setShowAgentDrawer(false);
  };

  return (
    <main className="min-h-screen">
      {/* Header */}
      {/* shell tokens, not ink: this bar must stay dark in both themes — an
          inverted `ink` would turn it into a white slab inside a dark page. */}
      <header className="bg-shell text-shell-ink px-4 py-3 relative z-10 sm:px-6">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src="/brand/nimbus-logo.png"
              alt=""
              width={40}
              height={40}
              priority
              className="size-10 shrink-0"
              aria-hidden="true"
            />
            <h1 className="text-lg font-bold leading-tight tracking-tight">
              Nimbus Explorer
            </h1>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <LocaleToggle />
            <ThemeToggle />
            {step === "dashboard" && (
              <button
                ref={atlasTriggerRef}
                onClick={() => setShowAgentDrawer(!showAgentDrawer)}
                className="btn-primary ml-1 px-3 sm:px-4"
                aria-expanded={showAgentDrawer}
                aria-label={
                  showAgentDrawer
                    ? locale === "es" ? "Cerrar Atlas" : "Close Atlas"
                    : locale === "es" ? "Preguntar a Atlas" : "Ask Atlas"
                }
              >
                <ChatCircleDots size={18} aria-hidden="true" />
                <span className="hidden sm:inline">
                  {showAgentDrawer
                    ? locale === "es" ? "Cerrar Atlas" : "Close Atlas"
                    : locale === "es" ? "Preguntar a Atlas" : "Ask Atlas"}
                </span>
              </button>
            )}
            {step !== "choose-cloud" && (
              <button
                onClick={handleReset}
                className="btn-shell-secondary hidden md:inline-flex"
              >
                <ArrowCounterClockwise size={17} aria-hidden="true" />
                {locale === "es" ? "Nueva auditoría" : "New audit"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Stepper indicator */}
      {step !== "dashboard" && (
        <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 pt-6 sm:px-6">
          {step !== "choose-cloud" && (
            <button type="button" onClick={handleBack} className="btn-secondary">
              <ArrowLeft size={18} aria-hidden="true" />
              {locale === "es" ? "Volver" : "Back"}
            </button>
          )}
          <div className="min-w-0 flex-1">
            <StepIndicator
              currentStep={step}
              canNavigateDashboard={Boolean(report)}
              onNavigate={(target) => setStep(target)}
            />
          </div>
        </div>
      )}

      <div className={`mx-auto max-w-[1440px] px-4 sm:px-6 ${step === "choose-cloud" ? "py-4" : "py-8"}`}>
        {/* Step 1: Choose cloud */}
        {step === "choose-cloud" && (
          <div className="flex min-h-[calc(100svh-10.5rem)] flex-col gap-10 pb-3 pt-3 lg:justify-between lg:gap-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-4xl sm:text-5xl font-bold text-ink tracking-tight leading-[1.1]">
                {locale === "es"
                  ? <>Convierte tu factura cloud<br />en decisiones claras</>
                  : <>Turn your cloud bill<br />into clear decisions</>}
              </h2>
            </div>

            <section aria-labelledby="provider-selection-title">
              <h3 id="provider-selection-title" className="mb-5 text-center text-subhead font-semibold text-ink">
                {locale === "es" ? "Elige tu proveedor" : "Choose your provider"}
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <CloudCard
                provider="aws"
                label="Amazon Web Services"
                description={locale === "es"
                  ? "Conecta Cost Explorer con acceso de solo lectura o carga tu archivo."
                  : "Connect Cost Explorer with read-only access or upload your file."}
                formats={locale === "es"
                  ? "Cost Explorer CSV · CUR · Data Exports · FOCUS"
                  : "Cost Explorer CSV · CUR · Data Exports · FOCUS"}
                Logo={AwsWordmark}
                highlighted
                onClick={() => handleProviderSelect("aws")}
              />
              <CloudCard
                provider="azure"
                label="Microsoft Azure"
                description={locale === "es"
                  ? "Revisa un resumen de Cost Analysis o audita Cost Details."
                  : "Review a Cost Analysis summary or audit Cost Details."}
                formats="Cost Analysis · Cost Details · FOCUS"
                Logo={AzureWordmark}
                onClick={() => handleProviderSelect("azure")}
              />
              <CloudCard
                provider="gcp"
                label="Google Cloud"
                description={locale === "es"
                  ? "Revisa Reports y Cost table o audita tu export de BigQuery."
                  : "Review Reports and Cost table or audit your BigQuery export."}
                formats="Reports · Cost table · BigQuery · FOCUS"
                Logo={GcpWordmark}
                onClick={() => handleProviderSelect("gcp")}
              />
              {/* FOCUS multi-cloud card */}
              <button
                onClick={() => { setSelectedProvider(null); setStep("data-source"); }}
                className="group card-premium flex min-h-[250px] flex-col p-6 text-left transition-colors duration-200 ease-out hover:bg-brand-soft/30 hover:ring-brand/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <div className="mb-5 flex min-h-[5rem] items-start">
                  <FocusWordmark className="h-12 w-44 max-w-full" />
                </div>
                <h4 className="font-semibold text-ink text-[15px]">
                  {locale === "es" ? "Análisis multicloud" : "Multicloud analysis"}
                </h4>
                <p className="text-xs text-ink-faint mt-1 font-medium">
                  {locale === "es" ? "Formato FOCUS" : "FOCUS format"}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  {locale === "es"
                    ? "Reúne AWS, Azure y GCP en un solo archivo estándar."
                    : "Combine AWS, Azure, and GCP in one standard file."}
                </p>
                <p className="mt-3 text-xs text-ink-muted">
                  <span className="font-semibold text-ink">
                    {locale === "es" ? "Admite:" : "Accepts:"}
                  </span>{" "}
                  FOCUS CSV
                </p>
                <div className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-semibold text-brand">
                  {locale === "es" ? "Continuar con FOCUS" : "Continue with FOCUS"}
                </div>
              </button>
              </div>
            </section>

            <p className="mx-auto max-w-2xl pb-1 text-center text-body text-ink-muted">
              {locale === "es"
                ? "Nimbus convierte tus datos de facturación en oportunidades de ahorro verificables, cifras transparentes y pasos seguros para actuar."
                : "Nimbus turns billing data into verifiable savings opportunities, transparent figures, and safe next steps."}
            </p>
          </div>
        )}

        {/* Step 2: Data source */}
        {step === "data-source" && (
          <div className="max-w-5xl mx-auto space-y-5">
            <ProviderContextHeader provider={selectedProvider} locale={locale} />

            {/* FOCUS guidance — shown when "Cualquier nube" was selected */}
            {!selectedProvider && (
              <div className="bg-brand-soft/60 border border-brand/20 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <SparkleIcon className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-ink">
                      {locale === "es"
                        ? "Archivo FOCUS — el formato estándar que exportan AWS, Azure y GCP"
                        : "FOCUS file — the standard format exported by AWS, Azure and GCP"}
                    </h4>
                    <p className="text-sm text-ink-muted mt-1 mb-2">
                      {locale === "es" ? "Un solo archivo cubre todas tus nubes." : "One file covers all your clouds."}
                    </p>
                    <details
                      onToggle={handleDisclosureToggle}
                      className="scroll-mt-24 text-xs text-ink-muted"
                    >
                      <summary className="cursor-pointer font-medium text-brand">
                        {locale === "es" ? "¿Cómo exporto el archivo FOCUS?" : "How do I export a FOCUS file?"}
                      </summary>
                      <ul className="mt-2 space-y-1 list-disc list-inside">
                        <li><strong>AWS:</strong> Billing and Cost Management → Data Exports → Create export → Standard data export → Tabla &ldquo;FOCUS 1.0 with AWS columns&rdquo;</li>
                        <li><strong>Azure:</strong> Cost Management → Exports (formato FOCUS)</li>
                        <li><strong>GCP:</strong> BigQuery export → vista FOCUS</li>
                      </ul>
                    </details>
                    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-brand/10 pt-3">
                      <span className="text-xs text-ink-muted">
                        {locale === "es" ? "Estándar abierto de" : "Open standard from"}
                      </span>
                      <FinOpsFoundationWordmark className="h-9 w-40" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Demo — single entry point */}
            <div className="card-premium p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <h4 className="font-semibold text-ink">{locale === "es" ? "Ver demostración" : "View demo"}</h4>
                  <p className="text-sm text-ink-muted">
                    {locale === "es"
                      ? "Demo analítica ficticia de 30 días para explorar oportunidades."
                      : "Fictional 30-day analytical demo for exploring opportunities."}
                  </p>
                  <a
                    href={`/api/examples/${selectedProvider ?? "focus"}`}
                    download
                    className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand underline decoration-brand/30 underline-offset-4 hover:decoration-brand"
                  >
                    {locale === "es" ? "Descargar muestra canónica (3 filas)" : "Download canonical sample (3 rows)"}
                  </a>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                    {locale === "es" ? "Complejidad" : "Complexity"}
                    <select
                      value={demoConfig.complexity}
                      onChange={(event) => setDemoConfig((current) => ({ ...current, complexity: event.target.value as DemoComplexity }))}
                      disabled={loading}
                      className="min-h-11 rounded-[10px] border border-line-strong bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                    >
                      <option value="simple">{locale === "es" ? "Sencillo" : "Simple"}</option>
                      <option value="medium">{locale === "es" ? "Medio" : "Medium"}</option>
                      <option value="complex">{locale === "es" ? "Complejo" : "Complex"}</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                    {locale === "es" ? "Variante" : "Variant"}
                    <select
                      value={demoConfig.variant}
                      onChange={(event) => setDemoConfig((current) => ({ ...current, variant: event.target.value as DemoVariant }))}
                      disabled={loading}
                      className="min-h-11 rounded-[10px] border border-line-strong bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                    >
                      <option value="standard">{locale === "es" ? "Estándar" : "Standard"}</option>
                      <option value="ai">IA</option>
                      <option value="credits">{locale === "es" ? "Créditos" : "Credits"}</option>
                      <option value="commitments">{locale === "es" ? "Compromisos" : "Commitments"}</option>
                      <option value="data-quality">{locale === "es" ? "Calidad de datos" : "Data quality"}</option>
                      <option value="mixed">{locale === "es" ? "Mixto" : "Mixed"}</option>
                    </select>
                  </label>
                  <button onClick={() => handleAnalyze("demo")} disabled={loading} className="btn-primary disabled:opacity-40 shrink-0">
                    {locale === "es" ? "Probar demo" : "Try demo"}
                  </button>
                </div>
              </div>
            </div>

            {/* Upload CSV/Excel */}
            <UploadSection
              onAnalyze={handleAnalyze}
              loading={loading}
              error={error}
              lane={currentLane}
              selectedFile={selectedFile}
              onSelectFile={setSelectedFile}
              suppressServerError={!!providerMismatch || !!fileDiagnosis}
            />

            {/* Wrong-lane rejection — takes over the explanation, including the error copy */}
            {providerMismatch && (
              <div
                ref={generatedContentRef}
                tabIndex={-1}
                role="region"
                aria-label={locale === "es" ? "Revisión del archivo" : "File review"}
                className="scroll-mt-24 rounded-[14px] outline-none"
              >
                <ProviderMismatchPanel
                  mismatch={providerMismatch}
                  fileName={selectedFile?.name}
                  onRetryInLane={retryInLane}
                  onPickAnother={handlePickAnother}
                />
              </div>
            )}

            {/* File diagnosis — replaces the generic error when the upload produced 0 usable rows.
                Never stacked under the mismatch panel: two verdicts on one file read as noise. */}
            {fileDiagnosis && !providerMismatch && (
              <div
                ref={generatedContentRef}
                tabIndex={-1}
                role="region"
                aria-label={locale === "es" ? "Revisión del archivo" : "File review"}
                className="scroll-mt-24 rounded-[14px] outline-none"
              >
                <FileCheckPanel diagnosis={fileDiagnosis} isBlocking />
              </div>
            )}

            {/* Live connectors — separated into individual expandable cards */}
            {selectedProvider === "aws" && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-faint mt-2">
                  {locale === "es" ? "Conectar cuenta AWS en vivo (opcional)" : "Connect a live AWS account (optional)"}
                </h3>
                
                {/* Cost Explorer connector */}
                <details
                  onToggle={handleDisclosureToggle}
                  className="card-premium group scroll-mt-24 ring-1 ring-brand/10 overflow-hidden"
                >
                  <summary className="cursor-pointer select-none px-5 py-4 flex items-center justify-between hover:bg-brand-soft/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-brand-soft flex items-center justify-center">
                        <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
                      </div>
                      <div>
                        <p className="font-semibold text-ink text-sm">AWS Cost Explorer</p>
                        <p className="text-xs text-ink-muted">
                          {locale === "es" ? "Datos de facturación en tiempo real vía API" : "Near-real-time billing data through the API"}
                        </p>
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-ink-faint group-open:rotate-180 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </summary>
                  <div className="px-5 pb-5 border-t border-brand/10 pt-4">
                    <div className="mx-auto max-w-5xl">
                      <AWSConnectSection onConnected={handleAWSConnected} loading={loading} setLoading={setLoading} />
                    </div>
                  </div>
                </details>

                {/* FOCUS S3 connector */}
                <details
                  onToggle={handleDisclosureToggle}
                  className="card-premium group scroll-mt-24 ring-1 ring-positive/10 overflow-hidden"
                >
                  <summary className="cursor-pointer select-none px-5 py-4 flex items-center justify-between hover:bg-positive-soft/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-positive-soft flex items-center justify-center">
                        <svg className="w-5 h-5 text-positive" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>
                      </div>
                      <div>
                        <p className="font-semibold text-ink text-sm">Bucket FOCUS (S3)</p>
                        <p className="text-xs text-ink-muted">
                          {locale === "es" ? "Lee datos FOCUS exportados a un bucket S3" : "Read FOCUS data exported to an S3 bucket"}
                        </p>
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-ink-faint group-open:rotate-180 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </summary>
                  <div className="px-5 pb-5 border-t border-positive/10 pt-4">
                    <div className="mx-auto max-w-5xl">
                      <FocusS3ConnectSection onConnected={handleFocusConnected} loading={loading} setLoading={setLoading} />
                    </div>
                  </div>
                </details>
              </div>
            )}

            {/* Note for non-AWS */}
            {selectedProvider && selectedProvider !== "aws" && (
              <p className="text-sm text-ink-muted">
                <strong className="text-ink">
                  {locale === "es" ? "Conector en vivo próximamente." : "Live connector coming soon."}
                </strong>{" "}
                {locale === "es" ? "Por ahora, usa tu archivo de facturación (CSV) de " : "For now, use your billing CSV from "}
                {selectedProvider === "azure" ? "Azure Cost Management" : "GCP Cloud Billing"}
                {locale === "es" ? " o la demo." : " or the demo."}
              </p>
            )}
          </div>
        )}

        {/* Step 3: Analyzing */}
        {step === "analyzing" && (
          <div
            className="analysis-workbench card-premium mx-auto max-w-4xl overflow-hidden"
            aria-live="polite"
            aria-busy="true"
            role="status"
          >
            <header className="flex flex-col items-stretch justify-between gap-4 border-b border-line px-5 py-5 sm:flex-row sm:items-start sm:px-7">
              <div className="flex min-w-0 items-start gap-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
                  <FileCsv size={21} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-ink">
                    {locale === "es" ? "Analizando tu facturación" : "Analyzing your billing data"}
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm text-ink-muted">
                    {locale === "es"
                      ? "Validamos la estructura, conciliamos los costos y aplicamos reglas FinOps antes de construir el reporte."
                      : "We validate the structure, reconcile costs, and apply FinOps rules before building the report."}
                  </p>
                  {flow.status === "uploading" && flow.uploadProgress !== null && (
                    <div className="mt-3 max-w-md">
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-ink-muted">
                        <span>{locale === "es" ? "Transferencia del archivo" : "File transfer"}</span>
                        <span className="num font-medium text-ink">{flow.uploadProgress}%</span>
                      </div>
                      <div
                        className="h-1 overflow-hidden rounded-full bg-surface-3"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={flow.uploadProgress}
                      >
                        <span
                          className="block h-full rounded-full bg-brand transition-[width] duration-150 ease-out"
                          style={{ width: `${flow.uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <button type="button" onClick={handleCancel} className="btn-secondary w-full sm:w-auto">
                <X size={18} aria-hidden="true" />
                {locale === "es" ? "Cancelar" : "Cancel"}
              </button>
            </header>

            <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
              <ol className="px-5 py-5 sm:px-7 sm:py-7">
                <ProgressStep
                  index={1}
                  complete={flow.status === "processing"}
                  active={flow.status === "uploading"}
                  label={locale === "es" ? "Archivo recibido" : "File received"}
                  description={
                    flow.status === "uploading"
                      ? locale === "es" ? "Transfiriendo de forma segura" : "Secure transfer in progress"
                      : locale === "es" ? "Carga completada" : "Upload complete"
                  }
                />
                <ProgressStep
                  index={2}
                  complete={flow.processingStage > 1}
                  active={flow.status === "processing" && flow.processingStage === 1}
                  label={locale === "es" ? "Validando formato" : "Validating format"}
                  description={locale === "es" ? "Columnas, fechas y moneda" : "Columns, dates, and currency"}
                />
                <ProgressStep
                  index={3}
                  complete={flow.processingStage > 2}
                  active={flow.status === "processing" && flow.processingStage === 2}
                  label={locale === "es" ? "Calculando oportunidades" : "Calculating opportunities"}
                  description={locale === "es" ? "Conciliación y reglas FinOps" : "Reconciliation and FinOps rules"}
                />
                <ProgressStep
                  index={4}
                  active={flow.status === "processing" && flow.processingStage === 3}
                  label={locale === "es" ? "Preparando reporte" : "Preparing report"}
                  description={locale === "es" ? "Hallazgos, escenarios y evidencia" : "Findings, scenarios, and evidence"}
                  last
                />
              </ol>

              <div className="border-t border-line bg-surface-2 p-5 sm:p-7 lg:border-l lg:border-t-0">
                <div className="analysis-ledger overflow-hidden rounded-[12px] border border-line bg-surface">
                  <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <FileCsv size={18} className="shrink-0 text-brand" aria-hidden="true" />
                      <span className="truncate text-sm font-medium text-ink">
                        {selectedFile?.name ??
                          (locale === "es" ? "Datos de demostración" : "Demonstration data")}
                      </span>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-ink-muted">
                      <ShieldCheck size={15} className="text-brand" aria-hidden="true" />
                      {locale === "es" ? "Lectura segura" : "Secure read"}
                    </span>
                  </div>

                  <div className="relative px-4 py-4" aria-hidden="true">
                    {flow.status === "processing" && <span className="analysis-scan-line" />}
                    <div className="mb-3 grid grid-cols-[1.1fr_1.6fr_0.8fr] gap-3">
                      <span className="h-2 rounded-full bg-surface-3" />
                      <span className="h-2 rounded-full bg-surface-3" />
                      <span className="h-2 rounded-full bg-surface-3" />
                    </div>
                    <div className="space-y-2">
                      {[0, 1, 2, 3, 4, 5].map((row) => (
                        <div
                          key={row}
                          className="analysis-ledger-row grid grid-cols-[1.1fr_1.6fr_0.8fr] gap-3 border-t border-line py-2.5"
                          style={{ animationDelay: `${row * 120}ms` }}
                        >
                          <span className="h-2 rounded-full bg-ink-faint/20" />
                          <span className="h-2 rounded-full bg-ink-faint/20" />
                          <span className="h-2 rounded-full bg-brand/20" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 border-t border-line px-4 py-3 text-xs text-ink-muted">
                    <span className="analysis-live-dot size-1.5 rounded-full bg-brand" aria-hidden="true" />
                    <span>
                      {flow.status === "uploading"
                        ? locale === "es" ? "Recibiendo datos" : "Receiving data"
                        : flow.processingStage === 1
                          ? locale === "es" ? "Reconociendo el esquema" : "Recognizing the schema"
                          : flow.processingStage === 2
                            ? locale === "es" ? "Evaluando evidencia financiera" : "Evaluating financial evidence"
                            : locale === "es" ? "Ensamblando resultados auditables" : "Assembling auditable results"}
                    </span>
                  </div>
                </div>

                <p className="mt-4 flex items-center gap-2 text-xs text-ink-muted">
                  <ShieldCheck size={15} className="shrink-0 text-brand" aria-hidden="true" />
                  {locale === "es"
                    ? "Las cifras se calculan con reglas determinísticas; Atlas no interviene."
                    : "Figures are calculated with deterministic rules; Atlas is not involved."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Dashboard */}
        {step === "dashboard" && report && (
          <div
            ref={fileDiagnosis ? undefined : generatedContentRef}
            tabIndex={-1}
            role="region"
            aria-label={locale === "es" ? "Resultado del análisis" : "Analysis result"}
            className="relative scroll-mt-24 outline-none"
          >
            <div className="w-full space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={handleBack} className="btn-secondary">
                  <ArrowLeft size={18} aria-hidden="true" />
                  {locale === "es" ? "Volver a la fuente" : "Back to source"}
                </button>
                <button type="button" onClick={handleReset} className="text-sm font-medium text-brand underline decoration-brand/30 underline-offset-4 hover:decoration-brand md:hidden">
                  {locale === "es" ? "Nueva auditoría" : "New audit"}
                </button>
              </div>
              {fileDiagnosis && (
                <div
                  ref={generatedContentRef}
                  tabIndex={-1}
                  role="region"
                  aria-label={locale === "es" ? "Revisión del archivo" : "File review"}
                  className="scroll-mt-24 rounded-[14px] outline-none"
                >
                  <FileCheckPanel diagnosis={fileDiagnosis} />
                </div>
              )}
              <ReportDashboard
                report={report}
                markdown={markdown}
                analysisId={analysisId ?? undefined}
                analysisToken={analysisToken ?? undefined}
                onAtlasScreenContextChange={setAtlasScreenContext}
              />
            </div>

            {/* Agent floating panel — overlays without compressing the dashboard */}
            {showAgentDrawer && analysisId && analysisToken && (
              <>
                <button
                  type="button"
                  aria-label={locale === "es" ? "Cerrar Atlas" : "Close Atlas"}
                  onClick={closeAtlas}
                  className="fixed inset-0 z-40 bg-black/35 md:hidden"
                />
                <div
                  ref={atlasDialogRef}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Atlas"
                  className={`fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] w-full transition-[background-color,border-color] duration-200 ease-out md:inset-x-auto md:right-4 md:w-[420px] ${
                    agentMinimized ? "md:bottom-4 md:top-auto" : "md:bottom-auto md:top-20 md:max-h-[calc(100vh-6rem)]"
                  }`}
                >
                <AgentChat
                  key={analysisId}
                  analysisId={analysisId}
                  analysisToken={analysisToken}
                  screenContext={atlasScreenContext}
                  onClose={closeAtlas}
                  onMinimizedChange={setAgentMinimized}
                />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIndicator({
  currentStep,
  canNavigateDashboard,
  onNavigate,
}: {
  currentStep: Step;
  canNavigateDashboard: boolean;
  onNavigate: (step: StableStep) => void;
}) {
  const { locale } = useLocale();
  const steps = [
    { id: "choose-cloud" as const, label: locale === "es" ? "Elige tu nube" : "Choose cloud" },
    { id: "data-source" as const, label: locale === "es" ? "Fuente de datos" : "Data source" },
    { id: "dashboard" as const, label: locale === "es" ? "Análisis" : "Analysis" },
  ];

  const currentIdx = currentStep === "analyzing"
    ? 2
    : steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex items-center justify-center gap-0 sm:gap-2">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          {(() => {
            const completed = i <= currentIdx || (s.id === "dashboard" && canNavigateDashboard);
            return (
          <button
            type="button"
            aria-label={`${i + 1} ${s.label}`}
            disabled={s.id === "dashboard" ? !canNavigateDashboard : i > currentIdx}
            onClick={() => onNavigate(s.id)}
            className="group inline-flex min-h-11 items-center gap-1 rounded-[10px] px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default sm:gap-2 sm:px-2"
          >
            <span className={`num flex size-6 items-center justify-center rounded-full text-xs font-bold ${
              completed ? "bg-brand text-brand-ink" : "bg-surface-3 text-ink-faint"
            }`}>
              {i + 1}
            </span>
            <span className={`hidden text-sm min-[480px]:inline ${completed ? "text-ink font-medium group-hover:text-brand" : "text-ink-faint"}`}>
              {s.label}
            </span>
          </button>
            );
          })()}
          {i < steps.length - 1 && <div className="h-px w-4 bg-line sm:w-8" />}
        </div>
      ))}
    </div>
  );
}

function ProgressStep({
  index,
  label,
  description,
  active = false,
  complete = false,
  last = false,
}: {
  index: number;
  label: string;
  description: string;
  active?: boolean;
  complete?: boolean;
  last?: boolean;
}) {
  return (
    <li className="relative flex gap-3.5 pb-5 last:pb-0" aria-current={active ? "step" : undefined}>
      {!last && (
        <span
          className={`absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px ${
            complete ? "bg-brand/55" : "bg-line-strong"
          }`}
          aria-hidden="true"
        />
      )}
      <span
        className={`relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors duration-200 ${
          complete
            ? "border-brand bg-brand text-brand-ink"
            : active
              ? "analysis-active-step border-brand bg-brand-soft text-brand"
              : "border-line-strong bg-surface text-ink-faint"
        }`}
        aria-hidden="true"
      >
        {complete ? <CheckCircle size={16} weight="fill" /> : index}
      </span>
      <div className={`min-w-0 pt-0.5 ${active || complete ? "text-ink" : "text-ink-muted"}`}>
        <p className="text-sm font-semibold leading-5">{label}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
      </div>
    </li>
  );
}

function CloudCard({ provider, label, description, formats, Logo, highlighted = false, onClick }: {
  provider: CloudProvider; label: string;
  description: string;
  formats: string;
  Logo: React.ComponentType<{ className?: string }>;
  highlighted?: boolean;
  onClick: () => void;
}) {
  const { locale } = useLocale();
  const action = locale === "es"
    ? `Continuar con ${provider.toUpperCase()}`
    : `Continue with ${provider.toUpperCase()}`;

  return (
    <button
      onClick={onClick}
      className={`group card-premium flex min-h-[250px] flex-col p-6 text-left transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        highlighted
          ? "bg-brand-soft/25 ring-2 ring-brand/35 hover:bg-brand-soft/45 hover:ring-brand/55"
          : "hover:bg-brand-soft/30 hover:ring-brand/30"
      }`}
    >
      <div className="mb-5 flex min-h-[5rem] flex-col items-start gap-2">
        <Logo className="h-12 w-44 max-w-full shrink-0" />
        {highlighted && (
          <span className="inline-flex min-h-6 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-positive">
            <CheckCircle className="shrink-0" size={16} weight="fill" aria-hidden="true" />
            {locale === "es" ? "Integración en vivo" : "Live integration"}
          </span>
        )}
      </div>
      <h4 className="sr-only">{label}</h4>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">{description}</p>
      <p className="mt-3 text-xs text-ink-muted">
        <span className="font-semibold text-ink">{locale === "es" ? "Admite:" : "Accepts:"}</span>{" "}
        {formats}
      </p>
      <div className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-semibold text-brand">
        {action}
      </div>
    </button>
  );
}

function ProviderContextHeader({
  provider,
  locale,
}: {
  provider: CloudProvider | null;
  locale: "es" | "en";
}) {
  const isSpanish = locale === "es";
  const format = provider === "aws"
    ? "Cost Explorer CSV · CUR · Data Exports · FOCUS"
    : provider === "azure"
      ? isSpanish
        ? "Cost Analysis · Cost Details Actual/Amortized · FOCUS"
        : "Cost Analysis · Actual/Amortized Cost Details · FOCUS"
      : provider === "gcp"
        ? isSpanish
          ? "Reports · Cost table · BigQuery Standard/Detailed · FOCUS"
          : "Reports · Cost table · BigQuery Standard/Detailed · FOCUS"
        : isSpanish
          ? "Formato estándar para AWS, Azure y Google Cloud"
          : "Standard format for AWS, Azure, and Google Cloud";
  const providerName = provider === "aws"
    ? "Amazon Web Services"
    : provider === "azure"
      ? "Microsoft Azure"
      : provider === "gcp"
        ? "Google Cloud"
        : "FOCUS";

  return (
    <section
      className="flex flex-col items-center border-b border-line pb-6 text-center"
      aria-labelledby="provider-context-title"
    >
      <h2 id="provider-context-title" className="sr-only">
        {providerName}
      </h2>
      <div aria-hidden="true">
        {provider === "aws" && <AwsWordmark className="h-16 w-48" />}
        {provider === "azure" && <AzureWordmark className="h-16 w-52" />}
        {provider === "gcp" && <GcpWordmark className="h-16 w-56" />}
        {!provider && <FocusWordmark className="h-16 w-52" />}
      </div>
      <p className="mt-3 text-sm text-ink-muted">
        <span className="font-semibold text-ink">
          {isSpanish ? "Formatos compatibles:" : "Supported formats:"}
        </span>{" "}
        {format}
      </p>
    </section>
  );
}
