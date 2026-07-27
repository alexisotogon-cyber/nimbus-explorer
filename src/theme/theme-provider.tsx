"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/* The storage key and the media query live in theme-constants.ts so the server
   component that renders the bootstrap script can read the same literal. */
import {
  THEME_MEDIA_QUERY as MEDIA_QUERY,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemeChoice,
} from "@/theme/theme-constants";

export type { ResolvedTheme, ThemeChoice };

type ThemeContextValue = {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  setChoice: (choice: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

function systemPrefersDark(): boolean {
  // Guarded for SSR and for the (rare) engine without matchMedia; falling back
  // to light matches the pre-dark-mode behaviour.
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(MEDIA_QUERY).matches;
}

function readStoredChoice(): ThemeChoice {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return systemPrefersDark() ? "dark" : "light";
  } catch {
    return systemPrefersDark() ? "dark" : "light";
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Server renders "system"; the bootstrap script has already written the real
  // data-theme onto <html>, so nothing flashes while we catch up on mount.
  const [choice, setChoiceState] = useState<ThemeChoice>("light");

  useEffect(() => {
    setChoiceState(readStoredChoice());
  }, []);

  // The operating system chooses only the first value. After that, Nimbus has
  // one predictable one-click day/night control.
  const resolved: ResolvedTheme =
    choice === "system" ? (systemPrefersDark() ? "dark" : "light") : choice;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    try {
      // The *choice* is persisted, not the resolved result: storing "dark"
      // because the OS happened to be dark would quietly unsubscribe the user
      // from their system preference the next time it changes.
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* non-persistent session — ignore */
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ choice, resolved, setChoice }),
    [choice, resolved, setChoice]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  return ctx;
}
