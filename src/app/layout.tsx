import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/theme/theme-provider";
import { THEME_MEDIA_QUERY, THEME_STORAGE_KEY } from "@/theme/theme-constants";
import { LocaleProvider } from "@/i18n/locale-provider";
import { DEFAULT_LOCALE } from "@/i18n/config";

// One superfamily, contrasted on the sans/mono axis — not two competing
// sans-serifs. Mono is functional (terminal commands, resource IDs), not
// decorative; sans carries everything else, including figures.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nimbus Explorer - Cloud Cost Explorer",
  description:
    "Nimbus Explorer — explora y optimiza tu nube con motor de reglas determinístico y Atlas, tu agente de costos cloud",
  icons: {
    icon: [
      { url: "/brand/nimbus-favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/nimbus-favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/brand/nimbus-favicon-32.png",
    apple: [
      {
        url: "/brand/nimbus-apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

// Resolves the theme and stamps data-theme on <html>. It has to be inline and
// synchronous in <head>: an external or deferred script runs after the first
// paint, so the page would render light and then snap to dark. localStorage is
// also unreadable from the server, so this is the earliest point the stored
// choice exists. Kept dependency-free and tiny for that reason; it duplicates a
// few lines of theme-provider.tsx on purpose.
const themeBootstrap = `
(function(){
  try {
    var c = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var dark = c === "dark" || ((c === "system" || !c) && window.matchMedia(${JSON.stringify(
      THEME_MEDIA_QUERY
    )}).matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } catch (e) {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: the bootstrap script above mutates data-theme
    // before React hydrates, so the server markup and the live DOM differ on
    // this one attribute by design.
    // lang is rendered as DEFAULT_LOCALE and corrected by LocaleProvider on
    // mount. NO blocking bootstrap script for the language, deliberately: unlike
    // data-theme, `lang` paints nothing. A wrong `lang` for the few milliseconds
    // before hydration costs a hyphenation/spell-check hint that no user can
    // perceive, whereas a wrong theme is a white flash. Buying that back with
    // another synchronous script in <head> would add render-blocking work — and
    // the visible text itself only becomes translated at hydration anyway, so a
    // pre-paint `lang` would just be lying earlier.
    <html
      lang={DEFAULT_LOCALE}
      className={`${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="bg-surface-2 text-ink antialiased font-sans">
        <LocaleProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
