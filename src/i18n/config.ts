/* Plain module, deliberately NOT "use client" — same reason as
   theme-constants.ts: layout.tsx is a server component, and a constant imported
   from a client module arrives there as a client-reference proxy that
   stringifies to "{}". Keeping the storage key and the locale contract in a
   neutral module lets the server bootstrap and the client provider share one
   literal instead of drifting apart. */

/** The two languages the product ships. Widening this is a data change, not a
    code change: everything below is derived from it. */
export type Locale = "es" | "en";

export const LOCALES: readonly Locale[] = ["es", "en"] as const;

/**
 * Spanish is the product's default, not a fallback of last resort: Nimbus
 * Explorer was written in Spanish, es.ts is the source of truth for the
 * dictionary, and English is the added translation. A visitor with no stored
 * preference and no usable navigator.language lands here.
 */
export const DEFAULT_LOCALE: Locale = "es";

/** Mirrors "nimbus-theme" so both preferences share one namespace in storage. */
export const LOCALE_STORAGE_KEY = "nimbus-locale";

export function isLocale(value: unknown): value is Locale {
  return value === "es" || value === "en";
}

/**
 * Each language named in its own language — the standard convention for a
 * language picker. Someone who only reads English should not have to recognise
 * the Spanish word "Inglés" to find their way out.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  es: "Español",
  en: "English",
};
