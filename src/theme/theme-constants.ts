/* Plain module, deliberately NOT "use client": the blocking bootstrap script in
   layout.tsx is rendered by a server component, and a value imported from a
   client module arrives there as a client-reference proxy — it stringifies to
   "{}" and the script would end up reading the wrong localStorage key. Keeping
   the contract here lets both sides share one literal. */

/** What the user picked. "system" is a live subscription, not a snapshot. */
export type ThemeChoice = "light" | "dark" | "system";

/** What actually ends up painted — never "system". */
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "nimbus-theme";

export const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";
