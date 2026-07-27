"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Gauge, SlidersHorizontal } from "@phosphor-icons/react";
import { AuditReport, Finding, ScenarioInput, TrendInsight, isQuickWin, QUICK_WIN_THRESHOLD_USD, formatUSD } from "@/engine/types";
import { calculateScenario, getScenarioVariables } from "@/engine/scenarios";
import { FindingCard, SourceText } from "./finding-card";
import { AiIcon, AlertIcon, CheckIcon, ChevronIcon, ConfidenceDot, SparkleIcon, TrendIcon } from "./icons";
import { PrintableReport } from "./printable-report";
import { AwsLogo, AzureLogo, GcpLogo } from "./cloud-logos";
import { useLocale, useT } from "@/i18n/locale-provider";
import { RichText } from "@/i18n/rich-text";
import { formatPlural, type TranslateFn, type TranslationKey } from "@/i18n/translate";
import { EFFORT_LABELS, RISK_LABELS } from "@/i18n/labels";
import { assumptionPresentation, findingPresentation } from "@/i18n/engine-presentation";
import type { AtlasScreenContextInput } from "@/engine/atlas-screen-context";

const PROVIDER_LOGOS = { aws: AwsLogo, azure: AzureLogo, gcp: GcpLogo } as const;

interface ReportDashboardProps {
  report: AuditReport;
  markdown: string;
  analysisId?: string;
  analysisToken?: string;
  onAtlasScreenContextChange?: (context: AtlasScreenContextInput) => void;
}

type TabId = "overview" | "findings" | "scenarios" | "markdown";

const TABS: TabId[] = ["overview", "findings", "scenarios", "markdown"];

export function ReportDashboard({
  report,
  markdown,
  analysisId,
  analysisToken,
  onAtlasScreenContextChange,
}: ReportDashboardProps) {
  const t = useT();
  const { locale } = useLocale();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);
  const [scenarioInput, setScenarioInput] = useState<ScenarioInput>({
    preset: "current",
    overrides: {},
  });
  const isSummaryOnly = report.analysisLevel === "summary";
  const visibleTabs: TabId[] = isSummaryOnly
    ? ["overview", "markdown"]
    : TABS;
  const scenario = useMemo(
    () => calculateScenario(report, scenarioInput),
    [report, scenarioInput]
  );
  const observedSpendUSD = report.financialReconciliation.isInvoiceNetComplete
    ? (report.financialReconciliation.invoiceNetCostUSD ??
      report.financialReconciliation.grossUsageCostUSD)
    : report.financialReconciliation.grossUsageCostUSD;
  const monthlyBaselineDuplicatesObserved =
    Math.abs(observedSpendUSD - report.totalCostUSD) < 0.01;
  const summaryDetailCta =
    report.providers.length === 1 && report.providers[0] === "azure"
      ? locale === "es"
        ? "Para desbloquear recomendaciones: carga Azure Cost Details (ActualCost o AmortizedCost) o FOCUS."
        : "To unlock recommendations, upload Azure Cost Details (ActualCost or AmortizedCost) or FOCUS."
      : report.providers.length === 1 && report.providers[0] === "gcp"
        ? locale === "es"
          ? "Para desbloquear recomendaciones: carga Detailed Usage Cost Export de BigQuery o FOCUS."
          : "To unlock recommendations, upload the BigQuery Detailed Usage Cost Export or FOCUS."
        : locale === "es"
          ? "Para desbloquear recomendaciones: carga CUR 2.0, Data Exports o FOCUS."
          : "To unlock recommendations, upload CUR 2.0, Data Exports, or FOCUS.";

  const quickWins = report.findings.filter(isQuickWin);
  const quickWinSavings = quickWins.reduce((s, f) => s + f.estimatedMonthlySavingsUSD, 0);

  // Structured, not parsed from prose: report.aiSpendSummary comes straight
  // from the engine (rules/ai-spend.ts buildAiSpendSummary), independent of
  // how any finding's title is worded.
  const aiSpend = report.aiSpendSummary;
  const aiFindings = report.findings.filter((f) => f.category.startsWith("ai-"));
  const noPositiveCost =
    report.sourceOutcome?.code === "aws-cost-explorer-no-positive-cost";

  const sortedFindings = [...report.findings].sort((a, b) => b.priorityScore - a.priorityScore);

  // When navigating from the overview to a specific finding, we need to scroll
  // to the card AFTER the findings tab has rendered. This ref holds the pending
  // finding id; the FindingsTab effect picks it up and scrolls.
  const scrollTarget = useRef<string | null>(null);

  useEffect(() => {
    onAtlasScreenContextChange?.({
      activeTab,
      expandedFindingId:
        activeTab === "findings" ? expandedFinding ?? undefined : undefined,
      visibleFindingIds: sortedFindings.map((f) => f.id),
    });
  }, [activeTab, expandedFinding, sortedFindings, onAtlasScreenContextChange]);

  const goToFinding = (id: string) => {
    setActiveTab("findings");
    setExpandedFinding(id);
    scrollTarget.current = id;
  };

  useEffect(() => {
    if (!analysisId || !analysisToken) return;
    const timer = window.setTimeout(() => {
      void fetch(`/api/analysis/${analysisId}/scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Nimbus-Analysis-Token": analysisToken },
        body: JSON.stringify(scenarioInput),
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [analysisId, analysisToken, scenarioInput]);

  useEffect(() => {
    const openScenarios = () => {
      setActiveTab("scenarios");
      window.setTimeout(() => document.getElementById("report-tab-scenarios")?.focus(), 0);
    };
    window.addEventListener("nimbus-open-scenarios", openScenarios);
    return () => window.removeEventListener("nimbus-open-scenarios", openScenarios);
  }, []);

  const selectTab = (tab: TabId) => setActiveTab(tab);
  const onTabKeyDown = (event: React.KeyboardEvent, current: TabId) => {
    const index = visibleTabs.indexOf(current);
    let target = index;
    if (event.key === "ArrowRight") target = (index + 1) % visibleTabs.length;
    else if (event.key === "ArrowLeft") target = (index - 1 + visibleTabs.length) % visibleTabs.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = visibleTabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(visibleTabs[target]);
    document.getElementById(`report-tab-${visibleTabs[target]}`)?.focus();
  };

  return (
    <div className="space-y-8">
      {/* ── Hero: answer first ─────────────────────────────── */}
      <header className="space-y-5">
        {noPositiveCost && (
          <section
            role="status"
            aria-live="polite"
            className="rounded-[14px] border border-positive/25 bg-positive-soft p-5 sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-positive/10 text-positive">
                <CheckIcon className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-ink">
                  {locale === "es"
                    ? "Consulta completada: no se detectó gasto positivo"
                    : "Query completed: no positive spend detected"}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  {locale === "es"
                    ? `AWS Cost Explorer respondió para el periodo ${report.periodStart} — ${report.periodEnd}. El importe observado es ${formatUSD(report.sourceOutcome?.returnedCostUSD ?? 0)} y no hay cargos sobre los cuales generar hallazgos de ahorro.`
                    : `AWS Cost Explorer responded for ${report.periodStart} — ${report.periodEnd}. The observed amount is ${formatUSD(report.sourceOutcome?.returnedCostUSD ?? 0)}, with no charges on which to generate savings findings.`}
                </p>
                <p className="mt-2 text-sm font-medium text-ink">
                  {locale === "es"
                    ? "Esto es un resultado válido, no un error. Si esperabas cargos, prueba una ventana de 60 o 90 días y verifica cuándo se habilitó Cost Explorer."
                    : "This is a valid result, not an error. If you expected charges, try a 60- or 90-day window and verify when Cost Explorer was enabled."}
                </p>
              </div>
            </div>
          </section>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card-premium p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                {report.providers.length === 1 && PROVIDER_LOGOS[report.providers[0]] && (() => {
                  const Logo = PROVIDER_LOGOS[report.providers[0]];
                  return <Logo className="h-10 w-10 shrink-0" />;
                })()}
                <div>
                  <p className="font-semibold text-ink">
                    {report.providers.length === 1
                      ? report.providers[0].toUpperCase()
                      : report.providers.map((provider) => provider.toUpperCase()).join(" · ")}
                  </p>
                  <p className="text-sm text-ink-muted">{report.periodStart} — {report.periodEnd}</p>
                </div>
              </div>
              {report.isFocusSource && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
                  <SparkleIcon className="h-3 w-3" /> {t("report.focusBadge")}
                </span>
              )}
            </div>
            {/* Two sibling blocks, deliberately different visual weight: the
                observed figure is what actually happened in the uploaded
                file; the projection is an estimate derived from it. Showing
                them as if they were the same kind of number is exactly what
                confused users about what "totalCostUSD" meant. */}
            <p className="text-sm text-ink-muted">
              {report.financialReconciliation.isInvoiceNetComplete
                ? (locale === "es" ? "Neto observado de factura" : "Observed net invoice")
                : (locale === "es" ? "Gasto bruto de uso observado" : "Observed gross usage spend")}
            </p>
            <p className="num mt-1 break-words text-[clamp(1.75rem,4vw,2rem)] font-semibold leading-tight text-ink">
              {formatUSD(observedSpendUSD)}
            </p>
            <p className="text-xs text-ink-muted mt-1">
              {locale === "es" ? "Periodo observado" : "Observed period"}:{" "}
              {report.observationPeriods ?? report.observationDays}{" "}
              {report.observationGranularity === "monthly"
                ? locale === "es"
                  ? (report.observationPeriods === 1 ? "mes" : "meses")
                  : (report.observationPeriods === 1 ? "month" : "months")
                : locale === "es"
                  ? (report.observationDays === 1 ? "día" : "días")
                  : (report.observationDays === 1 ? "day" : "days")}
              {" · "}
              {report.financialReconciliation.isInvoiceNetComplete
                ? (locale === "es" ? "conciliado" : "reconciled")
                : (locale === "es" ? "conciliación parcial" : "partial reconciliation")}
            </p>
            {monthlyBaselineDuplicatesObserved ? (
              <p className="mt-3 text-xs text-ink-muted">
                {locale === "es"
                  ? report.observationGranularity === "monthly"
                    ? "El archivo contiene un periodo mensual; este importe también es la referencia mensual."
                    : "El periodo ya cubre 30 días; este importe también es la referencia mensual."
                  : report.observationGranularity === "monthly"
                    ? "The file contains one monthly period, so this amount is also the monthly baseline."
                    : "The period already covers 30 days, so this amount is also the monthly baseline."}
              </p>
            ) : (
              <div className="mt-4 border-t border-line pt-3">
                <p className="text-sm text-ink-muted">
                  {report.analysisLevel === "summary" &&
                  report.financialReconciliation.creditsAndRefundsUSD > 0
                    ? locale === "es"
                      ? "Referencia mensual bruta · antes de créditos"
                      : "Gross monthly baseline · before credits"
                    : locale === "es"
                      ? "Referencia mensual · todo el periodo"
                      : "Monthly baseline · full period"}
                </p>
                <p className="num mt-1 break-words text-xl font-semibold leading-tight text-ink-muted">
                  {formatUSD(report.totalCostUSD)}
                  <span className="ml-1 text-sm font-medium text-ink-faint">{t("common.perMonth")}</span>
                </p>
                <p className="text-xs text-ink-muted mt-1">
                  {locale === "es"
                    ? report.observationGranularity === "monthly"
                      ? `Base comparable: promedio de los ${report.observationPeriods} meses incluidos en el resumen de consola.`
                      : report.analysisLevel === "summary" &&
                          report.financialReconciliation.creditsAndRefundsUSD > 0
                        ? `Proyección del uso positivo observado × 30; el crédito de ${formatUSD(report.financialReconciliation.creditsAndRefundsUSD)} se mantiene separado y no se proyecta.`
                        : `Base comparable: promedio diario de los ${report.observationDays} días observados × 30. No es una factura ni usa sólo la última semana.`
                    : report.observationGranularity === "monthly"
                      ? `Comparable baseline: average of the ${report.observationPeriods} months included in the console summary.`
                      : report.analysisLevel === "summary" &&
                          report.financialReconciliation.creditsAndRefundsUSD > 0
                        ? `Projection of observed positive usage × 30; the ${formatUSD(report.financialReconciliation.creditsAndRefundsUSD)} credit stays separate and is not projected.`
                        : `Comparable baseline: daily average across all ${report.observationDays} observed days × 30. It is not an invoice and does not use only the latest week.`}
                </p>
              </div>
            )}
          </section>

          {isSummaryOnly ? (
          <section className="card-premium p-5 sm:p-6">
            <p className="font-semibold text-ink">
              {noPositiveCost
                ? locale === "es" ? "Resultado válido sin cargos" : "Valid result with no charges"
                : locale === "es" ? "Nivel de análisis: resumen agregado" : "Analysis level: aggregate summary"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {noPositiveCost
                ? locale === "es"
                  ? "La conexión y la consulta funcionaron. Como el gasto observado es cero, Nimbus no inventa recomendaciones ni porcentajes de ahorro."
                  : "The connection and query worked. Because observed spend is zero, Nimbus does not invent recommendations or savings percentages."
                : locale === "es"
                ? `Puedes revisar gasto, periodos y distribución por ${report.breakdownDimension || "la dimensión elegida"}. Nimbus no calculará ahorro ni acciones sobre recursos sin evidencia detallada.`
                : `You can review spend, periods, and distribution by ${report.breakdownDimension || "the selected dimension"}. Nimbus will not calculate savings or resource actions without detailed evidence.`}
            </p>
            {!noPositiveCost && (
              <p className="mt-4 text-sm font-medium text-brand">
                {summaryDetailCta}
              </p>
            )}
          </section>
          ) : (
          <section className="card-premium p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">
                  {locale === "es" ? "Ahorro del escenario" : "Scenario savings"}
                </p>
                <p className="text-sm text-ink-muted">
                  {scenarioInput.preset === "current"
                    ? locale === "es" ? "Escenario actual" : "Current scenario"
                    : scenarioInput.preset}
                </p>
              </div>
              <button type="button" onClick={() => setActiveTab("scenarios")} className="btn-secondary">
                <SlidersHorizontal size={18} aria-hidden="true" />
                {locale === "es" ? "Ajustar" : "Adjust"}
              </button>
            </div>
            <p className="text-sm text-ink-muted">{locale === "es" ? "Ahorro mensual" : "Monthly savings"}</p>
            <p className="num mt-1 break-words text-[clamp(1.75rem,4vw,2rem)] font-semibold leading-tight text-positive">
              {formatUSD(scenario.monthlySavingsUSD)}
              <span className="ml-1 text-base font-medium text-ink-muted">{t("common.perMonth")}</span>
            </p>
            <p className="num mt-2 text-sm text-ink-muted">
              {locale === "es" ? "Rango" : "Range"}: {formatUSD(report.totalSavingsRange.conservative)} – {formatUSD(report.totalSavingsRange.optimistic)}
            </p>
          </section>
          )}
        </div>

        <FinancialReconciliationPanel report={report} />
        <BillingCoveragePanel report={report} />

        {/* Secondary stats, divided — no cards, no colored stripes */}
        {!isSummaryOnly && <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] divide-y divide-line card-premium sm:divide-x sm:divide-y-0">
          <Stat label={t("report.statRecoverable")} value={`${report.savingsPercentage}%`} hint={t("report.statRecoverableHint")} />
          <Stat
            label={t("report.statFindings")}
            value={`${report.findings.length}`}
            hint={t("report.statFindingsHint", { count: quickWins.length, amount: formatUSD(quickWinSavings) })}
          />
          {aiSpend && (
            <button onClick={() => goToFinding(aiFindings[0]?.id ?? "")} className="text-left group">
              <Stat
                label={t("report.statAiSpend")}
                value={formatUSD(aiSpend.projected30DayCostUSD)}
                hint={t("report.statAiSpendHint", { pct: aiSpend.grossSpendPercentage })}
                accent
              />
            </button>
          )}
        </div>}

        <p className="flex items-start gap-1.5 text-xs text-ink-muted">
          <AlertIcon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-caution" />
          {t("report.disclaimer")}
        </p>
      </header>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 border-b border-line bg-surface-2">
        <nav className="-mb-px flex gap-1 overflow-x-auto" role="tablist" aria-label={locale === "es" ? "Secciones del reporte" : "Report sections"}>
          {/* The tab ids are identifiers; only the labels are language. */}
          <TabButton id="overview" active={activeTab === "overview"} onClick={() => setActiveTab("overview")} onKeyDown={onTabKeyDown}>{t("report.tabOverview")}</TabButton>
          {!isSummaryOnly && <TabButton id="findings" active={activeTab === "findings"} onClick={() => setActiveTab("findings")} onKeyDown={onTabKeyDown}>{t("report.tabFindings", { count: report.findings.length })}</TabButton>}
          {!isSummaryOnly && <TabButton id="scenarios" active={activeTab === "scenarios"} onClick={() => setActiveTab("scenarios")} onKeyDown={onTabKeyDown}>{locale === "es" ? "Escenarios" : "Scenarios"}</TabButton>}
          <TabButton id="markdown" active={activeTab === "markdown"} onClick={() => setActiveTab("markdown")} onKeyDown={onTabKeyDown}>{t("report.tabReport")}</TabButton>
        </nav>
      </div>

      <div role="tabpanel" id={`report-panel-${activeTab}`} aria-labelledby={`report-tab-${activeTab}`} tabIndex={0}>
      {activeTab === "overview" && <OverviewTab report={report} onOpenFinding={goToFinding} />}
      {activeTab === "findings" && (
        <FindingsTab
          findings={sortedFindings}
          expandedFinding={expandedFinding}
          onToggle={(id) => {
            const opening = expandedFinding !== id;
            if (opening) scrollTarget.current = id;
            setExpandedFinding(opening ? id : null);
          }}
          scrollTarget={scrollTarget}
        />
      )}
      {activeTab === "scenarios" && (
        <ScenarioTab report={report} input={scenarioInput} onChange={setScenarioInput} />
      )}
      {activeTab === "markdown" && (
        <PrintableReport report={report} markdown={markdown} analysisId={analysisId} analysisToken={analysisToken} />
      )}
      </div>

      <details className="text-sm text-ink-muted">
        <summary className="cursor-pointer select-none font-medium text-ink hover:text-brand">{t("report.howItWorks")}</summary>
        <p className="mt-2 leading-relaxed max-w-2xl">{t("report.howItWorksBody")}</p>
      </details>
    </div>
  );
}

function BillingCoveragePanel({ report }: { report: AuditReport }) {
  const { locale } = useLocale();
  const coverage = report.billingCoverage;
  if (!coverage || report.analysisLevel === "summary") return null;
  const isSpanish = locale === "es";
  const statusLabel = {
    current: isSpanish ? "actual" : "current",
    warning: isSpanish ? "por actualizar" : "refresh recommended",
    stale: isSpanish ? "vencido" : "stale",
  }[coverage.status];
  return (
    <section className="card-premium p-4" aria-label={isSpanish ? "Cobertura del archivo" : "File coverage"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            {isSpanish ? "Cobertura determinística del archivo" : "Deterministic file coverage"}
          </h3>
          <p className="text-xs text-ink-muted mt-1">
            {coverage.provider.toUpperCase()} · {coverage.datasetType} · {coverage.sourceSchemaVersion}
          </p>
        </div>
        <span className="num text-sm font-semibold text-ink">
          {coverage.recognizedColumnCount}/{coverage.totalColumnCount} ({coverage.coveragePercentage}%)
        </span>
      </div>
      <p className="text-xs text-ink-muted mt-3">
        {isSpanish ? "Catálogo" : "Catalog"}: {statusLabel}, {coverage.catalogAgeDays}{" "}
        {isSpanish ? "días" : "days"}. {isSpanish ? "Sin consumo de IA." : "No AI usage."}
      </p>
      {coverage.unknownColumns.length > 0 && (
        <details className="mt-2 text-xs text-ink-muted">
          <summary className="cursor-pointer font-medium text-ink">
            {isSpanish ? "Columnas no normalizadas" : "Unnormalized columns"} ({coverage.unknownColumns.length})
          </summary>
          <p className="mt-2 break-words">{coverage.unknownColumns.join(", ")}</p>
        </details>
      )}
    </section>
  );
}

function FinancialReconciliationPanel({ report }: { report: AuditReport }) {
  const t = useT();
  const { locale } = useLocale();
  const reconciliation = report.financialReconciliation;
  const netLabel = reconciliation.isInvoiceNetComplete
    ? t("report.reconciliation.netInvoice")
    : t("report.reconciliation.netUsage");
  const netValue = reconciliation.invoiceNetCostUSD ??
    reconciliation.netUsageCostExcludingCommitmentPurchasesUSD;

  const status = reconciliation.isInvoiceNetComplete
    ? locale === "es" ? "Conciliado" : "Reconciled"
    : reconciliation.invoiceNetCostUSD === null
      ? locale === "es" ? "Neto parcial" : "Partial net"
      : locale === "es" ? "Requiere datos" : "Needs data";
  return (
    <details className="card-premium group p-4" aria-label={t("report.reconciliation.regionLabel")}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-[10px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            {locale === "es" ? "Ver conciliación financiera" : "View financial reconciliation"}
          </h3>
          <p className="text-sm text-ink-muted mt-0.5">{t("report.reconciliation.subtitle")}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
          reconciliation.isInvoiceNetComplete ? "bg-positive-soft text-positive" : "bg-caution-soft text-caution"
        }`}>{status}</span>
      </summary>
      <dl className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-4 gap-y-3 border-t border-line pt-4 text-sm">
        <ReconciliationItem label={t("report.reconciliation.gross")} value={formatUSD(reconciliation.grossUsageCostUSD)} />
        <ReconciliationItem label={t("report.reconciliation.credits")} value={`−${formatUSD(reconciliation.creditsAndRefundsUSD)}`} />
        <ReconciliationItem label={t("report.reconciliation.taxes")} value={`+${formatUSD(reconciliation.taxesUSD)}`} />
        <ReconciliationItem label={t("report.reconciliation.purchases")} value={formatUSD(reconciliation.commitmentPurchasesUSD)} />
        <ReconciliationItem label={netLabel} value={formatUSD(netValue)} strong />
      </dl>
      {/* The formula line is assembled by the engine. */}
      <p className="num text-xs text-ink-faint mt-3">{reconciliation.formula}</p>
    </details>
  );
}

function ReconciliationItem({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className={`num mt-0.5 ${strong ? "font-semibold text-ink" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ report, onOpenFinding }: { report: AuditReport; onOpenFinding: (id: string) => void }) {
  const { t, locale, dict } = useLocale();
  const aiCategories = ["ai-visibility", "ai-gpu-review", "ai-batch-opportunity", "ai-endpoint-idle", "ai-cost-attribution"];
  const aiFindings = report.findings.filter((f) => aiCategories.includes(f.category));
  // Structured (report.aiSpendSummary), not parsed from a finding title.
  const aiSpend = report.aiSpendSummary;

  const topActions = [...report.findings]
    .filter((f) => f.estimatedMonthlySavingsUSD > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 3);
  const topActionIds = new Set(topActions.map((f) => f.id));

  const categoriesWithSavings = report.summaryByCategory.filter((c) => c.totalSavingsUSD > 0);
  const zeroCategories = report.summaryByCategory.length - categoriesWithSavings.length;

  return (
    <div className="space-y-8">
      {/* Costos y oportunidades de IA — arriba de todo, antes de "Qué hacer
          primero": el usuario debe ver su exposición a gasto de IA antes que
          cualquier otra recomendación. Filas visibles, sin exigir abrir
          Hallazgos. Las filas que YA aparecen en "Qué hacer primero" se
          marcan en vez de ocultarse, para no dar la impresión de que faltan. */}
      {aiSpend && (
        <section className="card-premium p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <AiIcon className="w-4 h-4 text-brand" />
              <h3 className="font-semibold text-ink">
                {locale === "es" ? "Costos y oportunidades de IA" : "AI costs and opportunities"}
              </h3>
            </div>
            <span className="num text-sm font-semibold text-ink">
              {formatUSD(aiSpend.projected30DayCostUSD)}{t("common.perMonth")} · {aiSpend.grossSpendPercentage}%
              {locale === "es" ? " de tu factura" : " of your bill"}
            </span>
          </div>
          {aiFindings.length > 0 ? (
            <ul className="divide-y divide-line -mx-6">
              {aiFindings.slice(0, 6).map((f) => {
                const isGovernance = f.category === "ai-visibility" || f.category === "ai-cost-attribution";
                const kindLabel = isGovernance
                  ? (locale === "es" ? "Gobernanza/visibilidad" : "Governance/visibility")
                  : (locale === "es" ? "Ahorro" : "Savings");
                const alsoInFirst = topActionIds.has(f.id);
                return (
                  <li key={f.id}>
                    <button
                      onClick={() => onOpenFinding(f.id)}
                      className="w-full flex items-center justify-between gap-3 px-6 py-2.5 text-left hover:bg-surface-2 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{findingPresentation(f, locale).title}</p>
                        <p className="text-xs text-ink-muted truncate">
                          {f.provider.toUpperCase()} · {f.service} · {kindLabel}
                          {alsoInFirst ? (locale === "es" ? " · en Qué hacer primero" : " · in What to do first") : ""}
                        </p>
                      </div>
                      <span className="num text-sm font-medium text-ink shrink-0">
                        {f.estimatedMonthlySavingsUSD > 0
                          ? formatUSD(f.estimatedMonthlySavingsUSD)
                          : (locale === "es" ? "Requiere métricas" : "Needs metrics")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">
              {locale === "es"
                ? "Gasto de IA detectado en la factura, sin hallazgos accionables todavía."
                : "AI spend detected in the bill, with no actionable findings yet."}
            </p>
          )}
        </section>
      )}

      {/* What to do first */}
      {topActions.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold text-ink mb-3">{t("report.overview.whatFirst")}</h3>
          <ol className="card-premium divide-y divide-line">
            {topActions.map((f, i) => (
              <li key={f.id}>
                <button
                  onClick={() => onOpenFinding(f.id)}
                  className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-surface-2 transition-colors"
                >
                  <span className="num text-sm font-semibold text-ink-faint w-4 mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col items-start gap-1 sm:flex-row sm:justify-between sm:gap-3">
                      <p className="font-medium text-ink">{findingPresentation(f, locale).title}</p>
                      <span className="num text-sm font-semibold text-positive shrink-0 whitespace-nowrap">
                        {formatUSD(f.savingsRange.conservative)}–{formatUSD(f.savingsRange.optimistic)}
                      </span>
                    </div>
                    {/* Slug in, label out: the slug keys the colour class, the
                        label map supplies the readable text. */}
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <Chip level={f.effort}>{EFFORT_LABELS[locale][f.effort]}</Chip>
                      <Chip level={f.risk}>{RISK_LABELS[locale][f.risk]}</Chip>
                    </div>
                  </div>
                  <ChevronIcon className="w-4 h-4 text-ink-faint shrink-0 mt-0.5" />
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Trends — above category bars, only when insights exist */}
      {report.trendInsights.length > 0 && (
        <TrendsSection insights={report.trendInsights} />
      )}

      <div className={`grid grid-cols-1 gap-6 ${report.analysisLevel === "summary" ? "" : "lg:grid-cols-2"}`}>
        {/* Category breakdown */}
        {report.analysisLevel !== "summary" && (
        <section className="card-premium p-6">
          <h3 className="font-semibold text-ink mb-4">{t("report.overview.savingsByCategory")}</h3>
          <div className="space-y-3">
            {categoriesWithSavings.map((cat) => (
              <div key={cat.category}>
                {/* `cat.label` is the engine's own category label. */}
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-ink-muted truncate pr-2">{cat.label}</span>
                  <span className="num font-medium text-ink shrink-0">{formatUSD(cat.totalSavingsUSD)}{t("common.perMonth")}</span>
                </div>
                <div className="w-full bg-surface-3 rounded-full h-1.5">
                  <div className="bg-brand h-1.5 rounded-full" style={{ width: `${Math.min((cat.totalSavingsUSD / (report.totalEstimatedSavingsUSD || 1)) * 100, 100)}%` }} />
                </div>
              </div>
            ))}
            {zeroCategories > 0 && (
              <p className="text-xs text-ink-muted pt-1">
                {formatPlural(dict.report.overview.zeroCategories, zeroCategories)}
              </p>
            )}
          </div>
        </section>
        )}

        {/* Service breakdown */}
        <section className="card-premium p-6">
          <h3 className="font-semibold text-ink mb-4">
            {report.analysisLevel === "summary"
              ? locale === "es"
                ? `Desglose por ${report.breakdownDimension || "dimensión"}`
                : `Breakdown by ${report.breakdownDimension || "dimension"}`
              : t("report.overview.serviceBreakdown")}
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint border-b border-line">
                <th className="pb-2 font-medium">
                  {report.analysisLevel === "summary"
                    ? report.breakdownDimension || (locale === "es" ? "Dimensión" : "Dimension")
                    : t("report.overview.colService")}
                </th>
                <th className="pb-2 font-medium text-right">
                  {report.analysisLevel === "summary"
                    ? locale === "es" ? "Costo observado" : "Observed cost"
                    : t("report.overview.colCostPerMonth")}
                </th>
                
                <th className="pb-2 font-medium text-right">{t("report.overview.colSavings")}</th>
              </tr>
            </thead>
            <tbody>
              {report.summaryByService.filter((s) => s.totalCostUSD > 0).slice(0, 8).map((s) => (
                <tr key={s.service} className="border-b border-line last:border-0">
                  <td className="py-2 text-ink truncate max-w-[180px]">{s.service}</td>
                  <td className="num py-2 text-right text-ink-muted">{formatUSD(s.totalCostUSD)}</td>
                  <td className="num py-2 text-right text-positive font-medium">{s.potentialSavingsUSD > 0 ? formatUSD(s.potentialSavingsUSD) : "—"}</td>
                </tr>
              ))}
              {report.summaryByService.filter((s) => s.totalCostUSD > 0).length === 0 && (
                <tr>
                  <td colSpan={3} className="py-5 text-center text-sm text-ink-muted">
                    {locale === "es"
                      ? "No hay cargos positivos para desglosar en este periodo."
                      : "There are no positive charges to break down for this period."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

    </div>
  );
}

// ─── Trends Section ──────────────────────────────────────────────────────────

function TrendsSection({ insights }: { insights: TrendInsight[] }) {
  const t = useT();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section className="card-premium p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendIcon className="w-4 h-4 text-ink-muted" />
        <h3 className="font-semibold text-ink">{t("report.overview.trendsTitle")}</h3>
      </div>
      {/* Insight title, detail and evidence are all engine text. */}
      <ul className="space-y-2">
        {insights.map((ins) => {
          const isWarning = ins.severity === "warning";
          const isOpen = expandedId === ins.id;
          return (
            <li key={ins.id} className={`rounded-lg border ${isWarning ? "border-caution/30 bg-caution-soft" : "border-line bg-surface-2"}`}>
              <button
                onClick={() => setExpandedId(isOpen ? null : ins.id)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left"
              >
                {isWarning
                  ? <AlertIcon className="w-4 h-4 text-caution shrink-0 mt-0.5" />
                  : <TrendIcon className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
                }
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isWarning ? "text-caution" : "text-ink"}`}>{ins.title}</p>
                  <p className="text-xs text-ink-muted mt-0.5">{ins.detail}</p>
                </div>
                <ChevronIcon className={`w-4 h-4 text-ink-faint shrink-0 mt-0.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
              </button>
              {isOpen && (
                <div className="px-4 pb-3 pt-0">
                  <p className="text-xs text-ink-faint font-mono leading-relaxed">{ins.evidence}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── Assumptions Tab ──────────────────────────────────────────────────────────

function ScenarioTab({
  report,
  input,
  onChange,
}: {
  report: AuditReport;
  input: ScenarioInput;
  onChange: (input: ScenarioInput) => void;
}) {
  const { locale } = useLocale();
  const variables = useMemo(() => getScenarioVariables(report), [report]);
  const result = useMemo(() => calculateScenario(report, input), [report, input]);
  const visible = variables.slice(0, 6);
  const remaining = variables.slice(6);

  const currentValue = (variable: (typeof variables)[number]) =>
    input.overrides[variable.id] ??
    (input.preset === "conservative"
      ? variable.min
      : input.preset === "optimistic"
        ? variable.max
        : variable.value);

  const setVariable = (id: string, value: number) => {
    onChange({
      preset: "custom",
      overrides: { ...input.overrides, [id]: value },
    });
  };

  const resetVariable = (id: string) => {
    const overrides = { ...input.overrides };
    delete overrides[id];
    onChange({ preset: Object.keys(overrides).length ? "custom" : "current", overrides });
  };

  const renderVariable = (variable: (typeof variables)[number]) => (
    <div key={variable.id} className="border-b border-line py-5 first:pt-0 last:border-0 last:pb-0">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <label htmlFor={`scenario-${variable.id}`} className="text-sm font-semibold text-ink">
            {assumptionPresentation(variable, locale).label}
          </label>
          <p className="mt-1 text-xs text-ink-muted">
            {locale === "es" ? "Sensibilidad mensual" : "Monthly sensitivity"}: {formatUSD(variable.monthlySensitivityUSD)}
            {" · "}
            {variable.affectedFindingIds.length} {locale === "es" ? "hallazgos afectados" : "affected findings"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <output htmlFor={`scenario-${variable.id}`} className="num text-sm font-semibold text-brand">
            {(currentValue(variable) * 100).toFixed(0)}%
          </output>
          <button type="button" onClick={() => resetVariable(variable.id)} className="text-xs font-medium text-brand underline underline-offset-4">
            {locale === "es" ? "Restablecer" : "Reset"}
          </button>
        </div>
      </div>
      <input
        id={`scenario-${variable.id}`}
        type="range"
        min={variable.min}
        max={variable.max}
        step={variable.step}
        value={currentValue(variable)}
        onChange={(event) => setVariable(variable.id, Number(event.target.value))}
        className="h-11 w-full accent-brand"
      />
      <div className="num flex justify-between text-xs text-ink-muted">
        <span>{(variable.min * 100).toFixed(0)}%</span>
        <span>{(variable.max * 100).toFixed(0)}%</span>
      </div>
      {assumptionPresentation(variable, locale).source && (
        <p className="mt-2 text-xs text-ink-muted">
          {locale === "es" ? "Fuente:" : "Source:"} <SourceText text={assumptionPresentation(variable, locale).source ?? ""} />
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <section className="card-premium p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Gauge size={21} className="text-brand" aria-hidden="true" />
              <h3 className="text-lg font-semibold text-ink">
                {locale === "es" ? "Escenarios de ahorro" : "Savings scenarios"}
              </h3>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              {locale === "es"
                ? "Ajusta las variables que más cambian el resultado. El motor recalcula cada hallazgo; Atlas no interviene."
                : "Adjust the variables with the highest financial impact. The rules engine recalculates every finding; Atlas is not involved."}
            </p>
          </div>
          <button type="button" onClick={() => onChange({ preset: "current", overrides: {} })} className="btn-secondary">
            {locale === "es" ? "Restablecer todo" : "Reset all"}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2 rounded-[10px] bg-surface-3 p-1">
          {(["conservative", "current", "optimistic"] as const).map((preset) => {
            const label = {
              conservative: locale === "es" ? "Conservador" : "Conservative",
              current: locale === "es" ? "Actual" : "Current",
              optimistic: locale === "es" ? "Optimista" : "Optimistic",
            }[preset];
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={input.preset === preset}
                onClick={() => onChange({ preset, overrides: {} })}
                className={`min-h-11 rounded-[8px] px-3 text-sm font-medium transition-colors duration-200 ${
                  input.preset === preset ? "bg-surface text-ink ring-1 ring-line" : "text-ink-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <dl className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 border-t border-line pt-5">
          <ScenarioMetric label={locale === "es" ? "Impacto mensual" : "Monthly impact"} value={formatUSD(result.monthlySavingsUSD)} positive />
          <ScenarioMetric label={locale === "es" ? "Impacto anual" : "Annual impact"} value={formatUSD(result.annualSavingsUSD)} positive />
          <ScenarioMetric
            label={locale === "es" ? "Diferencia vs. actual" : "Delta vs current"}
            value={`${result.deltaFromCurrentUSD >= 0 ? "+" : "−"}${formatUSD(Math.abs(result.deltaFromCurrentUSD))}`}
          />
        </dl>
      </section>

      <section className="card-premium p-5 sm:p-6">
        {variables.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {locale === "es" ? "Este análisis no necesita variables ajustables." : "This analysis has no adjustable variables."}
          </p>
        ) : (
          <>
            {visible.map(renderVariable)}
            {remaining.length > 0 && (
              <details className="border-t border-line pt-4">
                <summary className="min-h-11 cursor-pointer font-medium text-brand">
                  {locale === "es" ? "Otras variables" : "Other variables"} ({remaining.length})
                </summary>
                {remaining.map(renderVariable)}
              </details>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function ScenarioMetric({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className={`num mt-1 text-xl font-semibold ${positive ? "text-positive" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

// ─── Findings Tab — grouped by priority quadrant ─────────────────────────────

function FindingsTab({ findings, expandedFinding, onToggle, scrollTarget }: {
  findings: Finding[];
  expandedFinding: string | null;
  onToggle: (id: string) => void;
  scrollTarget: React.MutableRefObject<string | null>;
}) {
  const t = useT();
  // After render, if there is a pending scroll target, scroll to the card,
  // move focus to it (keyboard/screen-reader users land where the click took
  // them, not just visually), and flash it briefly so the eye finds it too.
  // Dependency array added deliberately: this used to run on EVERY render of
  // FindingsTab (no deps), re-reading a ref that had already been cleared —
  // harmless but wasteful, and one accidental future dependency away from a
  // scroll-jump loop.
  useEffect(() => {
    const id = scrollTarget.current;
    if (!id) return;
    scrollTarget.current = null;
    // requestAnimationFrame gives the DOM one paint to lay out the expanded card.
    requestAnimationFrame(() => {
      const el = document.getElementById(`finding-${id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.focus({ preventScroll: true });
      el.classList.add("nimbus-highlight-flash");
      window.setTimeout(() => el.classList.remove("nimbus-highlight-flash"), 1600);
    });
  }, [expandedFinding]);

  // `key` and the effort slugs inside `match` are identifiers; `labelKey` points
  // at the heading each bucket prints.
  const groups: { key: string; labelKey: TranslationKey; match: (f: Finding) => boolean }[] = [
    { key: "quick", labelKey: "findings.groupQuickWins", match: (f) => isQuickWin(f) && f.estimatedMonthlySavingsUSD >= QUICK_WIN_THRESHOLD_USD },
    { key: "projects", labelKey: "findings.groupProjects", match: (f) => f.effort !== "bajo" && f.estimatedMonthlySavingsUSD >= QUICK_WIN_THRESHOLD_USD },
    { key: "small", labelKey: "findings.groupSmall", match: (f) => f.effort === "bajo" && f.estimatedMonthlySavingsUSD > 0 && f.estimatedMonthlySavingsUSD < QUICK_WIN_THRESHOLD_USD && !(isQuickWin(f) && f.estimatedMonthlySavingsUSD >= QUICK_WIN_THRESHOLD_USD) },
    { key: "review", labelKey: "findings.groupReview", match: (f) => f.estimatedMonthlySavingsUSD === 0 },
  ];

  const assigned = new Set<string>();
  const buckets = groups.map((g) => {
    const items = findings.filter((f) => !assigned.has(f.id) && g.match(f));
    items.forEach((f) => assigned.add(f.id));
    return { ...g, items };
  });
  // Any leftover → last bucket
  const leftover = findings.filter((f) => !assigned.has(f.id));
  if (leftover.length) buckets[buckets.length - 1].items.push(...leftover);

  let counter = 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-muted rounded-lg bg-surface-2 border border-line px-4 py-2.5">
        {/* The `confidence` prop is the slug the dot colours by; the legend text
            is the findings list's own shorter phrasing. */}
        <span className="inline-flex items-center gap-1.5"><ConfidenceDot confidence="confirmado" /> {t("findings.legend.confirmed")}</span>
        <span className="inline-flex items-center gap-1.5"><ConfidenceDot confidence="inferencia" /> {t("findings.legend.estimate")}</span>
        <span className="inline-flex items-center gap-1.5"><ConfidenceDot confidence="fuera-de-alcance-del-billing" /> {t("findings.legend.needsMetrics")}</span>
      </div>

      {buckets.filter((b) => b.items.length > 0).map((b) => {
        const total = b.items.reduce((s, f) => s + f.estimatedMonthlySavingsUSD, 0);
        return (
          <section key={b.key} className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-ink">{t(b.labelKey)} <span className="text-ink-faint font-normal">· {b.items.length}</span></h3>
              {total > 0 && <span className="num text-sm font-medium text-positive">{formatUSD(total)}{t("common.perMonth")}</span>}
            </div>
            <div className="space-y-3">
              {b.items.map((finding) => {
                counter += 1;
                return (
                  <div key={finding.id} id={`finding-${finding.id}`} tabIndex={-1} className="scroll-mt-24 rounded-[14px] outline-none">
                    <FindingCard
                      finding={finding}
                      index={counter}
                      expanded={expandedFinding === finding.id}
                      onToggle={() => onToggle(finding.id)}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ─── Markdown Tab ─────────────────────────────────────────────────────────────

// ─── Shared ───────────────────────────────────────────────────────────────────

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs text-ink-muted mb-0.5">{label}</p>
      <p className={`num text-lg font-bold ${accent ? "text-brand" : "text-ink"}`}>{value}</p>
      {hint && <p className={`text-xs mt-0.5 ${accent ? "text-brand/70 group-hover:text-brand" : "text-ink-faint"}`}>{hint}</p>}
    </div>
  );
}

function TabButton({
  id,
  active,
  onClick,
  onKeyDown,
  children,
}: {
  id: TabId;
  active: boolean;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent, id: TabId) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      id={`report-tab-${id}`}
      role="tab"
      aria-selected={active}
      aria-controls={`report-panel-${id}`}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      onKeyDown={(event) => onKeyDown(event, id)}
      className={`min-h-11 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        active ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Chip({ level, children }: { level: "bajo" | "medio" | "alto"; children: React.ReactNode }) {
  const cls = {
    bajo: "text-positive bg-positive-soft",
    medio: "text-caution bg-caution-soft",
    alto: "text-danger bg-danger-soft",
  }[level];
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{children}</span>;
}
