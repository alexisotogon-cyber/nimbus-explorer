/* Lookup, interpolation and pluralisation. Plain module (no "use client") so the
   dictionaries can also be read from server components or from the .mjs test
   suites without dragging a React boundary along. */

/* Relative imports, not the "@/" alias, in the data-only i18n modules: the
   test-data/*.mjs suites import these files directly through tsx, the same way
   they import the engine, and that path must not depend on alias resolution. */
import { DEFAULT_LOCALE, type Locale } from "./config";
import { es, type Dictionary } from "./dictionaries/es";
import { en } from "./dictionaries/en";

export const DICTIONARIES: Record<Locale, Dictionary> = { es, en };

/**
 * Every dot path in the dictionary that resolves to a string. Derived from es.ts,
 * so t("header.nweAudit") does not compile. Empty sections contribute nothing,
 * which is exactly what we want while the migration is in progress.
 */
type LeafPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${LeafPaths<T[K]>}`;
}[keyof T & string];

export type TranslationKey = LeafPaths<Dictionary>;

/** Values substituted into "{marker}" slots. Numbers are stringified as-is. */
export type TranslationParams = Record<string, string | number>;

export type PluralForms = { one: string; other: string };

/**
 * Interpolation is by named marker ("{count} días"), never by concatenating
 * fragments. Word order is not stable across languages — "3 days left" vs
 * "quedan 3 días" — so a sentence assembled from pieces in Spanish order cannot
 * be translated without rewriting the code that builds it. One marked-up string
 * per sentence keeps the whole sentence in the translator's hands.
 */
export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    // An unknown marker is left verbatim on purpose: it is visible in the UI and
    // in screenshots, which surfaces the bug instead of printing "undefined".
    return value === undefined ? match : String(value);
  });
}

function resolve(dict: Dictionary, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
}

/**
 * Looks a key up in `dict`, falling back to the Spanish entry and finally to the
 * key itself. The fallback chain exists for runtime safety only — the types
 * already make a missing key impossible at compile time.
 */
export function translate(
  dict: Dictionary,
  key: TranslationKey,
  params?: TranslationParams
): string {
  const found = resolve(dict, key);
  if (typeof found === "string") return interpolate(found, params);

  const fallback = resolve(DICTIONARIES[DEFAULT_LOCALE], key);
  if (typeof fallback === "string") return interpolate(fallback, params);

  return key;
}

export type TranslateFn = (key: TranslationKey, params?: TranslationParams) => string;

export function createTranslator(dict: Dictionary): TranslateFn {
  return (key, params) => translate(dict, key, params);
}

/**
 * Picks the singular or plural form and injects {count}.
 *
 * Spanish and English share the simple one/other split, so two forms are enough
 * and Intl.PluralRules would only add weight. If a language with more plural
 * categories ever ships (Polish, Russian, Arabic: few/many/zero), this helper —
 * and the { one, other } shape in the dictionaries — must be replaced by
 * Intl.PluralRules(locale).select(count); do not paper over it with extra ifs.
 */
export function formatPlural(
  forms: PluralForms,
  count: number,
  params?: TranslationParams
): string {
  const form = Math.abs(count) === 1 ? forms.one : forms.other;
  return interpolate(form, { count, ...params });
}
