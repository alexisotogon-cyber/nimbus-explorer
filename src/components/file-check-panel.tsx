"use client";

import { useState } from "react";
import { FileDiagnosis } from "@/engine/validation/file-check";
import { AlertIcon, CheckIcon, ChevronIcon, SparkleIcon } from "./icons";
import { useLocale } from "@/i18n/locale-provider";
import { RichText } from "@/i18n/rich-text";
import { formatPlural } from "@/i18n/translate";

interface FileCheckPanelProps {
  diagnosis: FileDiagnosis;
  /** True when the upload produced zero usable rows — panel takes over as the error explanation. */
  isBlocking?: boolean;
}

/**
 * Shows what a user's uploaded file can and can't do — not a binary valid/invalid
 * verdict, but "with this I can do A and B; add X to get C".
 * Collapses to a slim confirmation bar when every capability is unlocked,
 * to avoid clutter on a file that's already complete.
 *
 * Everything this panel LISTS is written by the engine (FileDiagnosis): the format
 * label, the dropped-row reasons and hints, the capability labels and their
 * `requires` text, the next steps. Only the panel's own chrome is translated here;
 * the engine's own text is a later phase.
 */
export function FileCheckPanel({ diagnosis, isBlocking }: FileCheckPanelProps) {
  const { t, dict, locale } = useLocale();
  const allOk =
    diagnosis.capabilities.every((c) => c.ok) &&
    diagnosis.usableRows > 0 &&
    diagnosis.assumptionWarnings.length === 0;
  const [expanded, setExpanded] = useState(!allOk);

  if (allOk && !isBlocking) {
    return (
      <div className="card-premium px-4 py-3 flex items-center gap-2.5 text-sm">
        <span className="w-6 h-6 rounded-full bg-positive-soft text-positive flex items-center justify-center shrink-0">
          <CheckIcon className="w-3.5 h-3.5" />
        </span>
        <span className="text-ink">
          {/* The row count picks the plural form, then {format} is filled with the
              engine's label wrapped in its <strong>. */}
          <RichText
            template={formatPlural(dict.diagnosis.fileCheck.allOk, diagnosis.usableRows)}
            nodes={{ format: <strong className="font-semibold">{diagnosis.formatLabel}</strong> }}
          />
        </span>
      </div>
    );
  }

  return (
    <div
      className={`card-premium file-review-panel overflow-hidden ${
        isBlocking ? "ring-1 ring-danger/20" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="file-review-attention w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-surface-2 transition-colors"
      >
        <span
          className={`file-review-attention-icon w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
            isBlocking ? "bg-danger-soft text-danger" : "bg-caution-soft text-caution"
          }`}
        >
          <AlertIcon className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-ink">
            {isBlocking
              ? diagnosis.sourceProfile
                ? t("diagnosis.fileCheck.summaryTitle")
                : t("diagnosis.fileCheck.blockingTitle")
              : t("diagnosis.fileCheck.capabilitiesHeading", { format: diagnosis.formatLabel })}
          </h4>
          <p className="text-xs text-ink-muted mt-0.5">
            {t(diagnosis.sourceProfile ? "diagnosis.fileCheck.valuesUsed" : "diagnosis.fileCheck.rowsUsed", {
              used: diagnosis.usableRows,
              total: diagnosis.totalDataRows,
            })}
            {diagnosis.sourceProfile
              ? ` · ${diagnosis.sourceProfile.periodCount} ${
                  locale === "es"
                    ? diagnosis.sourceProfile.periodCount === 1 ? "periodo" : "periodos"
                    : diagnosis.sourceProfile.periodCount === 1 ? "period" : "periods"
                }`
              : diagnosis.distinctDays > 0
                ? ` · ${formatPlural(dict.diagnosis.fileCheck.daysOfData, diagnosis.distinctDays)}`
                : ""}
          </p>
        </div>
        <ChevronIcon className={`w-4 h-4 text-ink-faint shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-line pt-4 space-y-5 text-sm">
          {diagnosis.sourceProfile && (
            <div className="rounded-xl bg-brand-soft/40 border border-brand/20 p-4">
              <p className="font-medium text-ink">
                {t("diagnosis.fileCheck.summaryRecognized", {
                  provider: diagnosis.sourceProfile.provider,
                  source: diagnosis.sourceProfile.sourceLabel,
                })}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {t(
                  diagnosis.sourceProfile.periodCount === 1
                    ? "diagnosis.fileCheck.summaryDetailsOne"
                    : "diagnosis.fileCheck.summaryDetails",
                  {
                  group: diagnosis.sourceProfile.groupBy,
                  granularity: t(
                    `diagnosis.fileCheck.granularity.${diagnosis.sourceProfile.granularity}`
                  ),
                  periods: diagnosis.sourceProfile.periodCount,
                  }
                )}
              </p>
              <p className="mt-2 text-xs text-ink-muted">
                {t("diagnosis.fileCheck.summaryScope")}
              </p>
              {diagnosis.sourceProfile.usageValueCount > 0 && (
                <p className="mt-2 text-xs font-medium text-ink">
                  {t("diagnosis.fileCheck.summaryUsage", {
                    amount: diagnosis.sourceProfile.usageTotal,
                    unit: diagnosis.sourceProfile.usageUnit || "",
                  })}
                </p>
              )}
            </div>
          )}

          {diagnosis.dropped.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-ink mb-2">{t("diagnosis.fileCheck.droppedTitle")}</h5>
              <div className="space-y-1.5">
                {diagnosis.dropped.map((d) => (
                  <div key={d.reason} className="flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <span className="text-ink">{d.reason}</span>
                      <p className="text-ink-faint mt-0.5">{d.hint}</p>
                    </div>
                    <span className="num text-ink-muted shrink-0">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diagnosis.assumptionWarnings.length > 0 && (
            <div className="rounded-xl bg-caution-soft border border-caution/20 p-4">
              <h5 className="text-xs font-semibold text-caution mb-2">{t("diagnosis.fileCheck.assumptionsTitle")}</h5>
              <div className="space-y-2">
                {diagnosis.assumptionWarnings.map((w) => (
                  <div key={w.reason} className="text-xs">
                    <span className="text-ink font-medium">{w.reason}</span>
                    <p className="text-ink-muted mt-0.5">{w.hint}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h5 className="text-xs font-semibold text-ink mb-2">{t("diagnosis.fileCheck.capabilitiesTitle")}</h5>
            <div className="space-y-2">
              {diagnosis.capabilities.map((cap) => (
                <div key={cap.id} className="flex items-start gap-2.5">
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      cap.ok ? "bg-positive-soft text-positive" : "bg-surface-3 text-ink-faint"
                    }`}
                  >
                    {cap.ok ? <CheckIcon className="w-2.5 h-2.5" /> : <span className="text-[9px] leading-none">✕</span>}
                  </span>
                  <div className="min-w-0">
                    <p className={cap.ok ? "text-ink" : "text-ink-muted"}>{cap.label}</p>
                    {!cap.ok && (
                      <p className="text-xs text-ink-faint mt-0.5">
                        {t("diagnosis.fileCheck.requires", { requirement: cap.requires })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {diagnosis.nextSteps.length > 0 && (
            <div className="rounded-xl bg-brand-soft/40 border border-brand/20 p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-brand mb-2">
                <SparkleIcon className="w-3.5 h-3.5" /> {t("diagnosis.fileCheck.unlockMore")}
              </div>
              <ul className="space-y-1.5 text-xs text-ink-muted list-disc list-inside">
                {diagnosis.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
