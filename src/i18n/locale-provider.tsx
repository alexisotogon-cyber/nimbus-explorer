"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/* The storage key and the Locale contract live in config.ts — a plain module —
   so layout.tsx (a server component) can read the same literal. See the header
   comment there. */
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isLocale, type Locale } from "@/i18n/config";
import { applyDocumentLocale } from "@/i18n/document-locale";
import { DICTIONARIES, createTranslator, type TranslateFn } from "@/i18n/translate";
import type { Dictionary } from "@/i18n/dictionaries/es";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Dot-path lookup with {marker} interpolation. */
  t: TranslateFn;
  /** The raw dictionary, for nested {one, other} forms fed to formatPlural(). */
  dict: Dictionary;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Resolution order, most specific first:
 *   1. the stored preference — an explicit choice outranks everything;
 *   2. navigator.language ("en-GB" → "en"), so a first-time English speaker is
 *      not dropped into Spanish;
 *   3. DEFAULT_LOCALE ("es"), the product's own language.
 */
function detectLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Private mode / blocked storage: the selector still works, it just won't persist.
  }

  const navigatorLocales = [
    ...(typeof navigator !== "undefined" ? navigator.languages ?? [] : []),
    typeof navigator !== "undefined" ? navigator.language : undefined,
  ];
  for (const tag of navigatorLocales) {
    // Only the primary subtag matters: we ship one Spanish and one English, not
    // regional variants, so "es-419" and "es-ES" are the same product.
    const primary = tag?.split("-")[0]?.toLowerCase();
    if (isLocale(primary)) return primary;
  }

  return DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Server renders DEFAULT_LOCALE, matching the lang="es" in the static markup;
  // detection runs on mount because both localStorage and navigator are
  // client-only. Text may swap once on first load for an English speaker — that
  // is a content change, not a colour flash, so it needs no blocking script.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  // <html lang> follows the active locale — see document-locale.ts for why it
  // matters and why the write lives in a plain module.
  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* non-persistent session — ignore */
    }
  }, []);

  const value = useMemo<LocaleContextValue>(() => {
    const dict = DICTIONARIES[locale];
    return { locale, setLocale, t: createTranslator(dict), dict };
  }, [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale debe usarse dentro de <LocaleProvider>");
  return ctx;
}

/** Shortcut for the common case: a component that only needs to translate. */
export function useT(): TranslateFn {
  return useLocale().t;
}
