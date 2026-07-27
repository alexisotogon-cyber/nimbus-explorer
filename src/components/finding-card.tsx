"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle, Gauge, Wrench } from "@phosphor-icons/react";
import { Finding, FindingAssumption, formatUSD } from "@/engine/types";
import {
  AlertIcon, CalcIcon, ChevronIcon, DocIcon, SearchIcon, SparkleIcon,
  categoryIcon, Confidence,
} from "./icons";
import { useLocale, useT } from "@/i18n/locale-provider";
import { RichText } from "@/i18n/rich-text";
import {
  formatPlural,
  type TranslateFn,
  type TranslationKey,
} from "@/i18n/translate";
import {
  CATEGORY_LABELS,
  CONFIDENCE_LABELS_I18N,
  EFFORT_LABELS,
  RISK_LABELS,
} from "@/i18n/labels";
import { assumptionPresentation, findingPresentation } from "@/i18n/engine-presentation";

interface FindingCardProps {
  finding: Finding;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}

function Chip({ level, children }: { level: "bajo" | "medio" | "alto"; children: React.ReactNode }) {
  const cls = {
    bajo: "text-positive bg-positive-soft",
    medio: "text-caution bg-caution-soft",
    alto: "text-danger bg-danger-soft",
  }[level];
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{children}</span>;
}

/** Last path/ARN segment of a resource identifier — the human name, not the full ID. */
function shortResourceName(id: string): string {
  const clean = id.replace(/\/$/, "");
  const bySlash = clean.split("/").filter(Boolean);
  const last = bySlash[bySlash.length - 1] || clean;
  const byColon = last.split(":").filter(Boolean);
  return byColon[byColon.length - 1] || last;
}

/** Icon avatar: shape = category (what the finding is about), color = confidence (how sure we are). */
function CategoryAvatar({ category, confidence }: { category: string; confidence: Confidence }) {
  const Icon = categoryIcon(category);
  const cls = {
    confirmado: "bg-positive-soft text-positive",
    inferencia: "bg-caution-soft text-caution",
    "fuera-de-alcance-del-billing": "bg-surface-3 text-ink-faint",
  }[confidence] ?? "bg-surface-3 text-ink-faint";
  return (
    <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cls}`}>
      <Icon className="w-4 h-4" />
    </span>
  );
}

/** Keep the decision layer to one sentence; the complete context remains below. */
function firstSentence(text: string): string {
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  return match?.[0] ?? text;
}

/** Financial and percentage values should be visible while scanning prose. */
function EmphasizedNumbers({ text }: { text: string }) {
  const parts = text.split(/(\$[\d.,]+(?:\/(?:mes|mo))?|~\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?(?:%|\sUSD(?:\/(?:GB|hora))?))/g);
  return (
    <>
      {parts.map((part, index) =>
        /^(\$|~?\d)/.test(part) && /(\$|~|%|USD)/.test(part) ? (
          <strong key={index} className="num font-semibold text-ink">{part}</strong>
        ) : (
          part
        )
      )}
    </>
  );
}

export function FindingCard({ finding, index, expanded, onToggle }: FindingCardProps) {
  const { t, locale, dict } = useLocale();
  const presentation = findingPresentation(finding, locale);
  const [detailOpen, setDetailOpen] = useState(false);
  const [remediationExpanded, setRemediationExpanded] = useState(false);

  const investigationCmds = finding.remediation.commands.filter((c) => c.isInvestigation);
  const remediationCmds = finding.remediation.commands.filter((c) => !c.isInvestigation);
  const hasIrreversible = remediationCmds.some((c) => c.isIrreversible);

  const hasSavings = finding.savingsRange.optimistic > 0;
  const isAiVisibility = finding.category === "ai-visibility";
  const visibility = finding.visibilitySummary;
  const visibilityTitle = locale === "es"
    ? "Gasto en inteligencia artificial"
    : "Artificial intelligence spend";
  const trendLabel = visibility?.trend === "up"
    ? (locale === "es" ? `Subió ${visibility.trendPercentage.toFixed(1)}%` : `Up ${visibility.trendPercentage.toFixed(1)}%`)
    : visibility?.trend === "down"
      ? (locale === "es" ? `Bajó ${visibility.trendPercentage.toFixed(1)}%` : `Down ${visibility.trendPercentage.toFixed(1)}%`)
      : (locale === "es" ? "Estable" : "Stable");
  const maxResourceCost = Math.max(1, ...finding.topResources.map((r) => r.monthlyCostUSD));
  const affectedCost = finding.savingsModel?.baseMonthlyCostUSD ?? finding.estimatedMonthlySavingsUSD;
  const remainingCost = Math.max(0, affectedCost - finding.estimatedMonthlySavingsUSD);
  const ConfidenceIcon =
    finding.confidence === "confirmado"
      ? CheckCircle
      : finding.confidence === "inferencia"
        ? Gauge
        : Wrench;

  return (
    <div className={`overflow-hidden rounded-[14px] bg-surface ring-1 transition-[background-color,box-shadow] duration-200 ease-out ${expanded ? "ring-brand/40 bg-brand-soft/20" : "ring-line hover:ring-brand/25"}`}>
      <button onClick={onToggle} className="w-full px-4 py-4 sm:px-5 flex items-start gap-3 sm:gap-4 hover:bg-brand-soft/25 transition-colors duration-200 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset" aria-expanded={expanded}>
        <span className="num mt-0.5 hidden w-5 shrink-0 text-xs font-medium text-ink-faint sm:block">{index}</span>
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-semibold leading-snug text-ink">
            {isAiVisibility ? visibilityTitle : presentation.title}
          </h4>
          <p className="mt-1 text-sm text-ink-muted">{finding.provider.toUpperCase()} · {finding.service}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isAiVisibility ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2 py-1 text-xs font-medium text-brand">
                <Gauge size={14} aria-hidden="true" />
                {locale === "es" ? "Requiere atribución" : "Needs allocation"}
              </span>
            ) : (
              <>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${
              finding.confidence === "confirmado"
                ? "bg-positive-soft text-positive"
                : finding.confidence === "inferencia"
                  ? "bg-caution-soft text-caution"
                  : "bg-brand-soft text-brand"
            }`}>
              <ConfidenceIcon size={14} aria-hidden="true" />
              {CONFIDENCE_LABELS_I18N[locale][finding.confidence]}
            </span>
            <Chip level={finding.effort}>{EFFORT_LABELS[locale][finding.effort]}</Chip>
            <Chip level={finding.risk}>{RISK_LABELS[locale][finding.risk]}</Chip>
              </>
            )}
          </div>
        </div>
        {/* The chips used to print the raw slug ("bajo", "riesgo bajo"). The slug
            stays as the colour-class key on <Chip>; the readable label comes from
            the label maps, which is what those maps exist for. */}
        <div className="shrink-0 text-right">
          <span className={`num block text-base font-semibold ${hasSavings ? "text-positive" : "text-ink"}`}>
            {isAiVisibility && visibility
              ? `${formatUSD(visibility.monthlyCostUSD)}${t("common.perMonth")}`
              : hasSavings
                ? formatUSD(finding.estimatedMonthlySavingsUSD)
                : t("findings.reviewOnly")}
          </span>
          {isAiVisibility && visibility ? (
            <span className="num mt-1 block text-xs text-ink-muted">
              {visibility.shareOfTotalPercentage.toFixed(1)}% {locale === "es" ? "de la factura" : "of the bill"}
            </span>
          ) : hasSavings && (
            <span className="num mt-1 block text-xs text-ink-muted">
              {formatUSD(finding.savingsRange.conservative)}–{formatUSD(finding.savingsRange.optimistic)}
            </span>
          )}
          <span className="mt-2 hidden items-center justify-end gap-1 text-xs font-semibold text-brand sm:flex">
            {isAiVisibility
              ? (locale === "es" ? "Revisar gasto de IA" : "Review AI spend")
              : (locale === "es" ? "Revisar oportunidad" : "Review opportunity")}
            <ArrowRight size={14} aria-hidden="true" />
          </span>
        </div>
        <ChevronIcon className={`w-4 h-4 text-ink-faint shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-line pt-4 space-y-5 text-sm">
          {isAiVisibility && visibility && (
            <section aria-labelledby={`ai-spend-summary-${finding.id}`} className="space-y-5">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <div>
                  <span className="text-ink-muted">{locale === "es" ? "Tendencia" : "Trend"} </span>
                  <strong className="font-semibold text-ink">{trendLabel}</strong>
                </div>
                <div>
                  <span className="text-ink-muted">{locale === "es" ? "Servicios detectados" : "Services detected"} </span>
                  <strong className="num font-semibold text-ink">{visibility.breakdown.length}</strong>
                </div>
              </div>

              <div>
                <h5 id={`ai-spend-summary-${finding.id}`} className="mb-2 text-sm font-semibold text-ink">
                  {locale === "es" ? "Dónde se concentra" : "Where it is concentrated"}
                </h5>
                <dl className="divide-y divide-line border-y border-line">
                  {visibility.breakdown.slice(0, 5).map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-4 py-2.5">
                      <dt className="min-w-0 truncate text-sm text-ink-muted">{item.label}</dt>
                      <dd className="num shrink-0 text-sm font-semibold text-ink">
                        {formatUSD(item.monthlyCostUSD)}{t("common.perMonth")}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="grid gap-4 border-t border-line pt-4 md:grid-cols-[minmax(0,1.35fr)_minmax(220px,0.65fr)]">
                <div>
                  <h5 className="text-sm font-semibold text-ink">
                    {locale === "es" ? "Qué hacer ahora" : "What to do now"}
                  </h5>
                  <p className="mt-1 max-w-[68ch] text-sm text-ink-muted">
                    {locale === "es"
                      ? "Desglosa este gasto por recurso, equipo o aplicación para asignar responsables y detectar oportunidades reales."
                      : "Break this spend down by resource, team or application to assign ownership and identify real opportunities."}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDetailOpen(true)}
                    className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                  >
                    {locale === "es" ? "Revisar gasto de IA" : "Review AI spend"}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
                <div>
                  <h5 className="text-sm font-semibold text-ink">
                    {locale === "es" ? "Dato necesario" : "Data needed"}
                  </h5>
                  <p className="mt-1 text-sm text-ink-muted">
                    {locale === "es"
                      ? "Uso y costo por recurso, equipo o aplicación."
                      : "Usage and cost by resource, team or application."}
                  </p>
                </div>
              </div>
            </section>
          )}

          {!isAiVisibility && hasSavings && (
            <dl className="grid grid-cols-2 gap-4 border-b border-line pb-4">
              <BusinessMetric label={locale === "es" ? "Costo analizado" : "Analyzed cost"} value={formatUSD(affectedCost)} />
              <BusinessMetric label={locale === "es" ? "Costo después del ahorro" : "Cost after savings"} value={formatUSD(remainingCost)} />
            </dl>
          )}

          {!isAiVisibility && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h5 className="text-sm font-semibold text-ink">
                    {locale === "es" ? "Qué hacer ahora" : "What to do now"}
                  </h5>
                  <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-ink-muted">
                    <EmphasizedNumbers text={presentation.nextAction} />
                  </p>
                </div>
                <div>
                  <h5 className="text-sm font-semibold text-ink">
                    {locale === "es" ? "Confirma primero" : "Confirm first"}
                  </h5>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                    <EmphasizedNumbers text={presentation.metric} />
                  </p>
                </div>
              </div>

              <div className="border-t border-line pt-4">
                <h5 className="text-sm font-semibold text-ink">
                  {locale === "es" ? "Qué detectamos" : "What we detected"}
                </h5>
                <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-ink-muted">
                  <EmphasizedNumbers text={firstSentence(presentation.description)} />
                </p>
              </div>

              {hasSavings && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <p className="text-sm text-ink-muted">
                    {locale === "es" ? "Rango mensual estimado" : "Estimated monthly range"}{" "}
                    <strong className="num font-semibold text-positive">
                      {formatUSD(finding.savingsRange.conservative)}–{formatUSD(finding.savingsRange.optimistic)}
                    </strong>
                  </p>
                  {finding.assumptions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent("nimbus-open-scenarios"))}
                      className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand underline decoration-brand/30 underline-offset-4 hover:decoration-brand"
                    >
                      {locale === "es" ? "Ajustar escenario" : "Adjust scenario"}
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Concrete resources — horizontal bars with short names */}
          {finding.topResources.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-ink mb-2">{t("findings.concreteResources")}</h5>
              <div className="space-y-2">
                {finding.topResources.slice(0, 3).map((r) => (
                  <div key={r.resourceId} title={r.resourceId}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-mono text-ink truncate max-w-[65%]">{shortResourceName(r.resourceId)}</span>
                      <span className="num text-ink-muted shrink-0">{formatUSD(r.monthlyCostUSD)}{t("common.perMonth")}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-3">
                      <div
                        className="h-1.5 rounded-full bg-brand"
                        style={{ width: `${Math.max(6, (r.monthlyCostUSD / maxResourceCost) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Level 2: technical detail — collapsed by default ──────────── */}
          <div className="border-t border-line pt-3">
            <button onClick={() => setDetailOpen(!detailOpen)} className="flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink">
              <ChevronIcon className={`w-3.5 h-3.5 transition-transform ${detailOpen ? "rotate-90" : ""}`} />
              {locale === "es" ? "Evidencia y pasos técnicos" : "Evidence and technical steps"}
            </button>

            {detailOpen && (
              <div className="mt-4 space-y-5">
                {!isAiVisibility && (
                  <section>
                    <h5 className="mb-1.5 text-xs font-semibold text-ink">
                      {locale === "es" ? "Contexto completo" : "Full context"}
                    </h5>
                    <p className="max-w-[72ch] text-sm leading-relaxed text-ink-muted">
                      <EmphasizedNumbers text={presentation.description} />
                    </p>
                  </section>
                )}
                <div className="text-xs">
                  {/* Category label from the localised map, replacing the engine's
                      Spanish-only getCategoryLabel(). The category slug itself is
                      untouched — it is the key. Resource ids print verbatim. */}
                  <span className="text-ink-faint">{t("findings.categoryLabel")}</span> <span className="text-ink-muted">{CATEGORY_LABELS[locale][finding.category]}</span>
                  {finding.topResources.length === 0 && finding.affectedResources.length > 0 && (
                    <> · <span className="text-ink-faint">{t("findings.resourcesLabel")}</span> <span className="text-ink-muted">{finding.affectedResources.join(", ")}</span></>
                  )}
                </div>

                {/* Calculation */}
                <section>
                  <h5 className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1.5"><CalcIcon className="w-3.5 h-3.5 text-ink-muted" /> {t("findings.howWeCalculated")}</h5>
                  <p className="text-ink-muted font-mono text-xs leading-relaxed">
                    {locale === "es"
                      ? finding.calculationBreakdown
                      : `Affected monthly cost × versioned scenario variables = ${formatUSD(finding.estimatedMonthlySavingsUSD)}/mo.`}
                  </p>
                </section>

                {/* Assumptions */}
                {finding.assumptions.length > 0 && (
                  <section>
                    <h5 className="text-xs font-semibold text-ink mb-2">{t("findings.assumptionsTitle")}</h5>
                    <ul className="space-y-1.5">
                      {finding.assumptions.map((a) => {
                        const localized = assumptionPresentation(a, locale);
                        return (
                        <li key={a.id} className="text-xs text-ink-muted">
                          <span className="font-medium text-ink">{localized.label}:</span> {(a.value * 100).toFixed(0)}%
                          <span className="text-ink-faint ml-1">{t("findings.assumptionRange", { min: (a.min * 100).toFixed(0), max: (a.max * 100).toFixed(0) })}</span>
                          {localized.source && <span className="text-ink-faint"> — <SourceText text={localized.source} /></span>}
                        </li>
                      )})}
                    </ul>
                  </section>
                )}

                {/* Pillar */}
                <section>
                  <p className="flex items-center gap-1.5 text-xs">
                    <DocIcon className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                    <span className="text-ink-faint">{t("findings.pillarLabel")}</span>
                    <a href={finding.pillar.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                      {finding.pillar.framework} — {finding.pillar.pillar}
                    </a>
                  </p>
                </section>

                {/* Investigation (read-only) */}
                {investigationCmds.length > 0 && (
                  <section>
                    <h5 className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-3"><SearchIcon className="w-3.5 h-3.5 text-ink-muted" /> {t("findings.verifyYourself")} <span className="font-normal text-ink-faint">{t("findings.verifyYourselfNote")}</span></h5>
                    <div className="space-y-3">
                      {investigationCmds.map((cmd, i) => <CommandBlock key={i} cmd={cmd} />)}
                    </div>
                  </section>
                )}

                {/* Rollback */}
                <section>
                  {/* The rollback plan itself comes from the engine. */}
                  <p className="text-xs"><span className="font-semibold text-ink">{t("findings.rollbackLabel")}</span> <span className="text-ink-muted">{presentation.rollback}</span></p>
                </section>

                {/* Remediation — collapsed */}
                {remediationCmds.length > 0 && (
                  <section>
                    <button onClick={() => setRemediationExpanded(!remediationExpanded)} className="w-full flex items-center justify-between text-left">
                      <h5 className="text-xs font-semibold text-ink">{t("findings.applyChange")} <span className="font-normal text-ink-faint">{formatPlural(dict.findings.applyChangeNote, remediationCmds.length)}</span></h5>
                      <ChevronIcon className={`w-4 h-4 text-ink-faint transition-transform ${remediationExpanded ? "rotate-90" : ""}`} />
                    </button>

                    {remediationExpanded && (
                      <div className="mt-3 space-y-3">
                        {hasIrreversible && (
                          <div className="flex items-start gap-2 bg-danger-soft border border-danger/20 rounded-lg p-3">
                            <AlertIcon className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                            <p className="text-xs font-semibold text-danger">{t("findings.irreversibleWarning")}</p>
                          </div>
                        )}
                        {finding.remediation.backupStep && (
                          <p className="text-xs"><span className="font-semibold text-ink">{t("findings.backupStepLabel")}</span> <span className="text-ink-muted">{finding.remediation.backupStep}</span></p>
                        )}
                        {remediationCmds.map((cmd, i) => (
                          <div key={i}>
                            {cmd.isIrreversible && <p className="flex items-center gap-1 text-xs text-danger font-semibold mb-1"><AlertIcon className="w-3 h-3" /> {t("findings.irreversible")}</p>}
                            <CommandBlock cmd={cmd} />
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BusinessMetric({
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
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className={`num mt-1 text-base font-semibold ${positive ? "text-positive" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

// ─── Scenario Simulator ──────────────────────────────────────────────────────

type PresetId = "min" | "default" | "max" | "custom";

/**
 * The four scenarios. `id` is an identifier — it drives the arithmetic below and
 * is compared against, so it is NOT translated; the label and hint are keys.
 */
const PRESETS: { id: PresetId; labelKey: TranslationKey; hintKey: TranslationKey }[] = [
  { id: "min", labelKey: "findings.simulator.presetMin", hintKey: "findings.simulator.presetMinHint" },
  { id: "default", labelKey: "findings.simulator.presetDefault", hintKey: "findings.simulator.presetDefaultHint" },
  { id: "max", labelKey: "findings.simulator.presetMax", hintKey: "findings.simulator.presetMaxHint" },
  { id: "custom", labelKey: "findings.simulator.presetCustom", hintKey: "findings.simulator.presetCustomHint" },
];

/**
 * Provenance of the assumptions, derived from the `source` free text.
 * Temporary heuristic: when an assumption cites documentation AND admits the
 * concrete value is editorial, the weaker label wins — that is what a FinOps
 * practitioner has to defend. Replace with a structured `sourceKind` field on
 * FindingAssumption when the engine can be changed.
 */
function provenanceLabel(assumptions: FindingAssumption[], t: TranslateFn): string | null {
  const sources = assumptions.map((a) => a.source ?? "");
  // The pattern matches the ENGINE's Spanish `source` text, so it is not
  // translated: it is a probe into engine data, not a phrase anyone reads.
  if (sources.some((s) => /estimaci[oó]n editorial/i.test(s))) {
    return t("findings.simulator.provenanceEditorial");
  }
  if (sources.some((s) => /https?:\/\//.test(s))) {
    return t("findings.simulator.provenanceDocumented");
  }
  return null;
}

/** Renders a source string turning its URLs into real links (they were dead text). */
export function SourceText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part.replace(/[.,;)]+$/, "")}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand underline hover:no-underline break-all"
          >
            {part.replace(/[.,;)]+$/, "")}
          </a>
        ) : (
          part
        )
      )}
    </>
  );
}

/**
 * Shows how the saving moves with the assumptions.
 * 100% client-side arithmetic — no backend calls, no LLM involvement.
 *
 * The three presets do NOT recalculate: they read finding.savingsRange, which
 * the engine already derived from the min/value/max of these same assumptions.
 * That guarantees the figure shown here is identical to the one in the finding
 * header and in the exported report, with no rounding drift.
 *
 * Only the "custom" preset recalculates. For that it recovers the base monthly cost by
 * inverting estimatedMonthlySavingsUSD over the product of ALL assumptions
 * (including fixed ones where min === max, e.g. a verified 50% discount).
 * Dividing by only the actionable subset would drop those fixed factors and
 * understate the base. That inverted figure is deliberately kept as a hedged
 * auxiliary line, never as a headline claim about the user's bill.
 */
function WhatIfSimulator({ finding }: { finding: Finding }) {
  const t = useT();
  const all = finding.assumptions;
  // Only assumptions with a real range are adjustable
  const actionable = all.filter((a) => a.value > 0 && a.max > a.min);
  const productOfDefaults = all.reduce((p, a) => p * a.value, 1);

  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<PresetId>("default");
  const [custom, setCustom] = useState<Record<string, number>>(
    () => Object.fromEntries(actionable.map((a) => [a.id, a.value]))
  );

  if (actionable.length === 0) return null;
  // Guard: if estimatedMonthlySavingsUSD === 0 the finding is visibility-only
  if (productOfDefaults === 0 || finding.estimatedMonthlySavingsUSD === 0) return null;

  const baseMonthlyCost = finding.estimatedMonthlySavingsUSD / productOfDefaults;

  const customSaving =
    Math.round(baseMonthlyCost * all.reduce((p, a) => p * (custom[a.id] ?? a.value), 1) * 100) / 100;

  const saving =
    preset === "min" ? finding.savingsRange.conservative
    : preset === "max" ? finding.savingsRange.optimistic
    : preset === "default" ? finding.savingsRange.moderate
    : customSaving;

  const remaining = Math.max(0, Math.round((baseMonthlyCost - saving) * 100) / 100);
  const annual = Math.round(saving * 12 * 100) / 100;

  const activePreset = PRESETS.find((p) => p.id === preset)!;
  const activePresetLabel = t(activePreset.labelKey);
  const touched = preset !== "default";
  const provenance = provenanceLabel(all, t);
  const isCommitment = finding.category === "missing-commitment";

  const pick = (id: PresetId) => {
    if (id === "custom") {
      // Continue from wherever we are so the sliders don't jump
      setCustom(Object.fromEntries(actionable.map((a) => [a.id, custom[a.id] ?? a.value])));
    }
    setPreset(id);
  };

  const setCustomValue = (id: string, v: number) => {
    setCustom((prev) => ({ ...prev, [id]: v }));
    setPreset("custom");
  };

  return (
    <div className="rounded-xl ring-1 ring-line bg-surface-2 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-surface-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-inset"
      >
        <SparkleIcon className="w-4 h-4 text-ink-muted shrink-0" />
        <span className="text-caption font-semibold text-ink flex-1">
          {t("findings.simulator.toggle")}
        </span>
        {!open && touched && (
          <span className="text-caption text-ink-muted shrink-0">
            {activePresetLabel} · <span className="num font-semibold text-positive">{formatUSD(saving)}{t("common.perMonth")}</span>
          </span>
        )}
        <ChevronIcon className={`w-3.5 h-3.5 text-ink-faint shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {/* Selector — named by mechanism, not by likelihood: the engine never
              computes a probability, so "probable" would be an unearned claim. */}
          <div>
            <div
              role="group"
              aria-label={t("findings.simulator.groupLabel")}
              className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-lg bg-surface ring-1 ring-line"
            >
              {PRESETS.map((p) => {
                const active = preset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => pick(p.id)}
                    aria-pressed={active}
                    className={`inline-flex items-center justify-center gap-1 px-2 py-2 rounded-md text-caption transition-[background-color,color,border-color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
                      active
                        ? "bg-brand text-brand-ink font-semibold"
                        : "text-ink-muted font-medium hover:bg-surface-2 hover:text-ink"
                    }`}
                  >
                    {/* Check mark so the active state is not conveyed by colour alone */}
                    {active && (
                      <svg className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" clipRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z" />
                      </svg>
                    )}
                    {t(p.labelKey)}
                  </button>
                );
              })}
            </div>
            <p className="text-caption text-ink-faint mt-1.5">{t(activePreset.hintKey)}</p>
          </div>

          {/* Sliders live inside the "custom" preset, where the measured value is the point */}
          {preset === "custom" && (
            <div className="space-y-3.5">
              {actionable.map((a) => {
                const pct = Math.round((custom[a.id] ?? a.value) * 100);
                return (
                  <div key={a.id}>
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <label htmlFor={`sim-${finding.id}-${a.id}`} className="text-caption text-ink-muted">
                        {a.label}
                      </label>
                      <span className="num text-caption font-semibold text-ink shrink-0">{pct}%</span>
                    </div>
                    <input
                      id={`sim-${finding.id}-${a.id}`}
                      type="range"
                      min={Math.round(a.min * 100)}
                      max={Math.round(a.max * 100)}
                      step={Math.round(a.step * 100)}
                      value={pct}
                      onChange={(e) => setCustomValue(a.id, Number(e.target.value) / 100)}
                      className="w-full h-1.5 rounded-full accent-brand cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                    />
                    <div className="num flex justify-between text-caption text-ink-faint mt-0.5">
                      <span>{Math.round(a.min * 100)}%</span>
                      <span>{Math.round(a.max * 100)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Result — one figure, always labelled with the scenario that produced it,
              so a screenshot can never pass as an unqualified commitment. */}
          <div className="rounded-lg bg-surface ring-1 ring-line px-4 py-3.5">
            <p className="text-caption text-ink-muted mb-0.5">
              {t("findings.simulator.resultLabel", { scenario: activePresetLabel.toLowerCase() })}
            </p>
            <p className="num text-title font-bold text-positive leading-tight">{formatUSD(saving)}{t("common.perMonth")}</p>
            <p className="num text-caption text-ink-faint mt-1">{t("findings.simulator.annualPace", { amount: formatUSD(annual) })}</p>
            {/* Both amounts sit in their own tabular-numeral span, so they travel
                as nodes and the sentence stays one key. The service name and the
                provider code come from the billing data. */}
            <p className="text-caption text-ink-faint mt-2 pt-2 border-t border-line">
              <RichText
                template={t("findings.simulator.basis", {
                  service: finding.service,
                  provider: finding.provider.toUpperCase(),
                })}
                nodes={{
                  base: <span className="num">{formatUSD(baseMonthlyCost)}</span>,
                  remaining: <span className="num">{formatUSD(remaining)}</span>,
                }}
              />
            </p>
          </div>

          {/* Commitments are not a "more is better" axis: the max end is the
              riskiest one, and unused coverage is a cost the model cannot express. */}
          {isCommitment && (
            <p className="text-caption text-caution bg-caution-soft rounded-lg px-3 py-2">
              {t("findings.simulator.commitmentCaveat")}
            </p>
          )}

          {provenance && (
            <p className="text-caption text-ink-faint">
              {t("findings.simulator.provenance", { provenance })}
            </p>
          )}

          <p className="text-caption text-ink-faint">{t("findings.simulator.footnote")}</p>
        </div>
      )}
    </div>
  );
}

// ─── Command Block ────────────────────────────────────────────────────────────

/* Where to actually run each provider·tool combination — the UI otherwise only
   shows a [provider · tool] tag with no hint of the shell/console.

   Every name in here is a product name and stays identical in both languages:
   the shells, the CLIs, the consoles. The ONLY language in the CLI line is the
   conjunction and the word "local", so that line is one interpolated sentence
   ("{shell} o {cli} local" / "{shell} or local {cli}") instead of fragments glued
   in Spanish order — English puts "local" on the other side of the CLI name.
   The console rows carry no language at all, so they need no key. */
const SHELL_AND_CLI: Record<string, { shell: string; cli: string }> = {
  "aws·cli": { shell: "AWS CloudShell", cli: "AWS CLI" },
  "azure·cli": { shell: "Azure Cloud Shell", cli: "az CLI" },
  "gcp·cli": { shell: "Cloud Shell", cli: "gcloud CLI" },
};

const CONSOLE_NAMES: Record<string, string> = {
  "aws·console": "Consola de AWS",
  "azure·console": "Azure Portal",
  "gcp·console": "Cloud Console",
};

function CommandBlock({ cmd }: { cmd: { label: string; provider: string; tool: string; snippet: string } }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(cmd.snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const target = `${cmd.provider}·${cmd.tool}`;
  const shellAndCli = SHELL_AND_CLI[target];
  const whereToRun = shellAndCli
    ? t("findings.whereToRunShell", shellAndCli)
    : CONSOLE_NAMES[target];

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-ink-muted">
          <span className="font-medium text-ink">{cmd.label}</span>
          <span className="text-ink-faint ml-2">[{cmd.provider} · {cmd.tool}]</span>
          {whereToRun && <span className="text-ink-faint ml-2">· {whereToRun}</span>}
        </p>
        {/* Base is already surface-3, so the slate-200 hover maps to `line-strong`
            to stay a visible darker step instead of collapsing into the base. */}
        <button onClick={handleCopy} className="min-h-11 rounded-[10px] bg-surface-3 px-3 py-1.5 text-xs text-ink transition-colors duration-200 ease-out hover:bg-line-strong">
          {copied ? t("common.copied") : t("common.copy")}
        </button>
      </div>
      {/* The snippet is a CLI command: never translated, not the command, not its
          flags, not its values.
          `ring-1 ring-line` is new: the dark `code` fill sits below the page
          background, so the block needs an edge to keep reading as a block. */}
      <pre className="bg-code text-code-ink text-xs p-3 rounded-lg overflow-x-auto ring-1 ring-line">{cmd.snippet}</pre>
    </div>
  );
}
