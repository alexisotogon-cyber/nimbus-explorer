"use client";

import { GlobeSimple } from "@phosphor-icons/react";
import { LOCALE_LABELS } from "@/i18n/config";
import { useLocale } from "@/i18n/locale-provider";

/* Same segmented group as theme-toggle.tsx, on purpose: two controls sitting
   side by side in the header must read as one family, not as two widgets.
   Two states only — unlike the theme there is no "system" option to come back
   to, because navigator.language is a first-load hint, not a live subscription
   the user can opt into. */
export function LocaleToggle() {
  const { locale, setLocale, t } = useLocale();
  const next = locale === "es" ? "en" : "es";
  const aria = t("header.switchToLanguage", { language: LOCALE_LABELS[next] });

  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      aria-label={aria}
      title={aria}
      lang={locale}
      className="no-print inline-flex h-11 items-center gap-2 rounded-[10px] px-3 text-sm font-medium text-shell-ink/80 transition-colors duration-200 ease-out hover:bg-shell-ink/10 hover:text-shell-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-shell-ink active:bg-shell-ink/20"
    >
      <GlobeSimple
        size={20}
        weight="regular"
        className="h-5 w-5 shrink-0"
        aria-hidden="true"
      />
      <span aria-hidden="true">{locale.toUpperCase()}</span>
    </button>
  );
}
