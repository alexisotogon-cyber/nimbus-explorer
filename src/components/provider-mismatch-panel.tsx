"use client";

import { ProviderMismatch, LaneExpectation } from "@/engine/validation/provider-guard";
import { AlertIcon } from "./icons";
import { useLocale } from "@/i18n/locale-provider";
import { formatPlural, type TranslateFn } from "@/i18n/translate";

interface ProviderMismatchPanelProps {
  mismatch: ProviderMismatch;
  fileName?: string;
  onRetryInLane: (lane: LaneExpectation) => void;
  onPickAnother: () => void;
}

/* Lane keys (aws/azure/gcp/focus) are identifiers, and the names they map to are
   brands and a standard: neither side of this table is language, so it stays out
   of the dictionary. Only the sentences built around it are translated. */
const CLOUD_LABELS: Record<LaneExpectation, string> = {
  aws: "Amazon Web Services",
  azure: "Microsoft Azure",
  gcp: "Google Cloud",
  focus: "FOCUS",
};

/** Never renders a raw slug: an unknown key falls back to a neutral phrase. */
function label(key: string | undefined, t: TranslateFn): string {
  if (!key) return t("diagnosis.mismatch.unknownCloud");
  return CLOUD_LABELS[key as LaneExpectation] ?? t("diagnosis.mismatch.unknownCloud");
}

/**
 * "A, B y C" / "A, B and C". The comma-joined head and the last item go into one
 * two-marker sentence instead of being glued around a translated conjunction, so
 * a language that punctuates lists differently only has to edit the key.
 */
function joinLabels(keys: string[], t: TranslateFn): string {
  const labels = keys.map((k) => label(k, t));
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return t("diagnosis.mismatch.listPair", {
    head: labels.slice(0, -1).join(", "),
    last: labels[labels.length - 1],
  });
}

interface Copy {
  title: string;
  body: React.ReactNode;
  /** Present only when the file can be re-analysed in a different lane. */
  action?: { label: string; lane: LaneExpectation };
}

function buildCopy(m: ProviderMismatch, t: TranslateFn): Copy {
  switch (m.kind) {
    case "wrong-cloud": {
      if (m.detected === "focus") {
        const found =
          m.detectedProviders && m.detectedProviders.length > 0
            ? joinLabels(m.detectedProviders, t)
            : t("diagnosis.mismatch.severalClouds");
        return {
          title: t("diagnosis.mismatch.multiCloudTitle"),
          body: t("diagnosis.mismatch.multiCloudBody", {
            found,
            expected: label(m.expected, t),
          }),
          action: { label: t("diagnosis.mismatch.multiCloudAction"), lane: "focus" },
        };
      }
      return {
        title: t("diagnosis.mismatch.wrongCloudTitle", { detected: label(m.detected, t) }),
        body: t("diagnosis.mismatch.wrongCloudBody", { expected: label(m.expected, t) }),
        action: m.detected
          ? {
              label: t("diagnosis.mismatch.analyzeAsAction", { cloud: label(m.detected, t) }),
              lane: m.detected,
            }
          : undefined,
      };
    }

    case "native-in-focus-lane":
      return {
        title: t("diagnosis.mismatch.nativeInFocusTitle"),
        body: t("diagnosis.mismatch.nativeInFocusBody", { detected: label(m.detected, t) }),
        action: m.detected
          ? {
              label: t("diagnosis.mismatch.analyzeAsAction", { cloud: label(m.detected, t) }),
              lane: m.detected,
            }
          : undefined,
      };

    case "unrecognized":
      return {
        title: t("diagnosis.mismatch.unrecognizedTitle"),
        body: t("diagnosis.mismatch.unrecognizedBody"),
      };

    case "ambiguous":
      return {
        title: t("diagnosis.mismatch.ambiguousTitle"),
        // Two sentences, two keys: the first one varies, the advice never does.
        // The joining space stays in code so no dictionary value ends in one.
        body: `${
          m.candidates && m.candidates.length > 0
            ? t("diagnosis.mismatch.ambiguousPartial", { candidates: joinLabels(m.candidates, t) })
            : t("diagnosis.mismatch.ambiguousNoMatch")
        } ${t("diagnosis.mismatch.ambiguousAdvice")}`,
      };
  }
}

/**
 * Renders a rejected upload as a correctable situation, not a failure.
 *
 * Uses `caution` rather than `danger` on purpose: the file is usually fine and
 * one click away from analysable — a red panel would read as data loss. Colour
 * never carries the state alone: an icon plus an explicit heading do.
 */
export function ProviderMismatchPanel({
  mismatch,
  fileName,
  onRetryInLane,
  onPickAnother,
}: ProviderMismatchPanelProps) {
  const { t, dict } = useLocale();
  const copy = buildCopy(mismatch, t);
  const unmapped = mismatch.unmappedProviderRows ?? 0;
  const focusMissing = mismatch.focusMissing ?? [];

  return (
    <div
      role="alert"
      className="card-premium ring-1 ring-caution/30 bg-caution-soft/40 overflow-hidden"
    >
      <div className="p-5 flex items-start gap-3.5">
        <span className="w-9 h-9 rounded-xl bg-caution-soft text-caution ring-1 ring-caution/20 flex items-center justify-center shrink-0">
          <AlertIcon className="w-4 h-4" />
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-caption font-semibold uppercase tracking-widest text-caution">
            {t("diagnosis.mismatch.badge")}
          </p>
          <h4 className="font-semibold text-ink mt-1">{copy.title}</h4>

          {fileName && (
            <p className="text-caption text-ink-faint mt-1 truncate">
              {t("diagnosis.mismatch.fileName", { name: fileName })}
            </p>
          )}

          <p className="text-meta text-ink-muted mt-2">{copy.body}</p>

          {mismatch.kind === "unrecognized" && focusMissing.length > 0 && (
            <div className="mt-3 rounded-xl bg-surface ring-1 ring-line p-3.5">
              <p className="text-meta text-ink">{t("diagnosis.mismatch.focusMissingTitle")}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {focusMissing.map((col) => (
                  <li key={col}>
                    <code className="text-caption font-mono bg-surface-3 text-ink-muted rounded px-1.5 py-0.5">
                      {col}
                    </code>
                  </li>
                ))}
              </ul>
              <p className="text-caption text-ink-faint mt-2">
                {t("diagnosis.mismatch.focusMissingHint")}
              </p>
            </div>
          )}

          {unmapped > 0 && (
            <p className="text-caption text-ink-faint mt-2">
              {formatPlural(dict.diagnosis.mismatch.unmappedRows, unmapped)}
            </p>
          )}

          {/* ring-offset-surface on both buttons: Tailwind's default ring-offset
              colour is a hardcoded #fff, so `ring-offset-2` alone paints a white
              gap around the focus ring in the dark theme. The offset has to
              follow the card the buttons sit on. */}
          <div className="mt-4 flex flex-wrap gap-2.5">
            {copy.action && (
              <button
                type="button"
                onClick={() => onRetryInLane(copy.action!.lane)}
                className="btn-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                {copy.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={onPickAnother}
              className="btn-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {t("diagnosis.mismatch.pickAnother")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
