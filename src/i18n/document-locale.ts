/* One-line DOM side effect, pulled out of locale-provider.tsx into a plain
   module (no "use client") for two reasons: it is the piece a test can drive
   without a React renderer, and keeping it neutral means a server component
   could reuse it without importing a client boundary. */

import type { Locale } from "./config";

/**
 * Writes the active locale onto <html lang>.
 *
 * Not cosmetic: screen readers choose their pronunciation rules from this
 * attribute, and the browser uses it for hyphenation and spell-checking. Spanish
 * text served under lang="en" is read out with English phonetics.
 */
export function applyDocumentLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
}
