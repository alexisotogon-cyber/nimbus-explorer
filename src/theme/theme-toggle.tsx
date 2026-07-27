"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import { useLocale } from "@/i18n/locale-provider";
import { useTheme } from "@/theme/theme-provider";

export function ThemeToggle() {
  const { resolved, setChoice } = useTheme();
  const { locale } = useLocale();
  const next = resolved === "dark" ? "light" : "dark";
  const label =
    locale === "es"
      ? `Cambiar a tema ${next === "dark" ? "oscuro" : "claro"}`
      : `Switch to ${next} theme`;
  const Icon = resolved === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={() => setChoice(next)}
      aria-label={label}
      title={label}
      className="no-print inline-flex size-11 items-center justify-center rounded-[10px] text-shell-ink/80 transition-colors duration-200 ease-out hover:bg-shell-ink/10 hover:text-shell-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-shell-ink active:bg-shell-ink/20"
    >
      <Icon size={20} weight="regular" aria-hidden="true" />
    </button>
  );
}
