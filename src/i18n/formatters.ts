import type { Locale } from "./config";

export const LOCALE_TAG: Record<Locale, string> = {
  es: "es-MX",
  en: "en-US",
};

export function formatCurrency(value: number, locale: Locale, currency = "USD"): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(LOCALE_TAG[locale], {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function formatNumber(
  value: number,
  locale: Locale,
  options: Intl.NumberFormatOptions = {}
): string {
  return new Intl.NumberFormat(LOCALE_TAG[locale], options).format(
    Number.isFinite(value) ? value : 0
  );
}

export function formatDate(value: string | Date, locale: Locale): string {
  // Billing periods are calendar dates, not instants. JavaScript interprets
  // "YYYY-MM-DD" as midnight UTC and Intl then shifts it into the user's local
  // timezone (June 1 became May 31 in Mexico). Keep date-only values pinned to
  // UTC; timestamps and Date objects retain their normal instant semantics.
  const isDateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = value instanceof Date
    ? value
    : new Date(isDateOnly ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(isDateOnly ? { timeZone: "UTC" } : {}),
  }).format(date);
}
