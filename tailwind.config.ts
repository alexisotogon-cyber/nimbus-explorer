import type { Config } from "tailwindcss";

const config: Config = {
  // Theming rides on CSS custom properties, so `dark:` is not required for the
  // palette swap. Kept as an escape hatch for the handful of cases a token
  // can't express (e.g. flipping a gradient direction or swapping an asset).
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      // Fixed rem scale, ~1.2 ratio — product register, not fluid clamp().
      // Semantic roles instead of t-shirt sizes so intent stays legible at the call site.
      fontSize: {
        caption: ["0.75rem", { lineHeight: "1.4" }],   // 12px — chips, footnotes
        meta: ["0.875rem", { lineHeight: "1.5" }],      // 14px — UI metadata, labels
        body: ["1rem", { lineHeight: "1.6" }],          // 16px — prose, descriptions
        subhead: ["1.125rem", { lineHeight: "1.4" }],   // 18px — section titles
        title: ["1.5rem", { lineHeight: "1.25" }],      // 24px — page title
        figure: ["2.25rem", { lineHeight: "1.15" }],    // 36px — hero savings figure
      },
      boxShadow: {
        soft: "0 1px 3px rgba(15,23,42,0.02), 0 8px 24px -12px rgba(15,23,42,0.12)",
        "soft-lg": "0 2px 6px rgba(15,23,42,0.03), 0 16px 40px -16px rgba(15,23,42,0.16)",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      // Tokens resolve through CSS custom properties declared in globals.css
      // (`:root` = light, `[data-theme="dark"]` = dark). The values are stored
      // as bare "R G B" triplets rather than hex so `rgb(var(--t) / <alpha-value>)`
      // keeps Tailwind's opacity modifiers working — `bg-positive/30`,
      // `ring-brand/10` and friends are already used in ~600 places and a plain
      // `var(--t)` colour would silently break every one of them.
      colors: {
        // Ink-dominant identity: color is reserved for money signals (positive/
        // caution/danger). Brand itself is a near-black blue-grey, not a hue
        // competing with the semantic palette.
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          soft: "rgb(var(--brand-soft) / <alpha-value>)",
          strong: "rgb(var(--brand-strong) / <alpha-value>)",
          // Full colour, not a triplet: glow carries its own alpha by design,
          // so there is no channel left for an opacity modifier to occupy.
          glow: "var(--brand-glow)",
          // Text sitting on a `bg-brand` fill. Was hardcoded `text-white`, which
          // only holds while brand is near-black; in dark the primary button
          // inverts to a light fill and needs dark ink on top.
          ink: "rgb(var(--brand-ink) / <alpha-value>)",
        },
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          2: "rgb(var(--surface-2) / <alpha-value>)",
          3: "rgb(var(--surface-3) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          faint: "rgb(var(--ink-faint) / <alpha-value>)",
        },
        // WCAG AA at body weight/size (≥4.5:1 on the theme's own surface) — the
        // 2026-06 tokens (#059669 3.77:1, #d97706 3.19:1) failed on the savings
        // figures. Dark uses the *-400 ramp: the light -700 values sink into a
        // dark background and stop reading as a signal.
        positive: {
          DEFAULT: "rgb(var(--positive) / <alpha-value>)",
          soft: "rgb(var(--positive-soft) / <alpha-value>)",
        },
        caution: {
          DEFAULT: "rgb(var(--caution) / <alpha-value>)",
          soft: "rgb(var(--caution-soft) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--danger) / <alpha-value>)",
          soft: "rgb(var(--danger-soft) / <alpha-value>)",
        },
        // Borders. The codebase draws edges with `ring-black/[0.08]` and
        // `border-slate-*`, which have to become translucent *white* in dark —
        // and a black-with-opacity value can't be inverted by swapping a
        // triplet, because the alpha differs per theme too (8% black vs 10%
        // white). So `line` is a complete colour, not a triplet: simpler and
        // more honest than a triplet plus a separate opacity variable, at the
        // cost of losing the `/` modifier on this one token.
        line: {
          DEFAULT: "var(--line)",
          strong: "var(--line-strong)",
        },
        // The global app header and the chat headers, today `bg-ink text-white`.
        // They own a token because they must stay a *dark* bar in both themes:
        // if `ink` inverts to a light value the header becomes a white slab
        // floating in a dark page.
        shell: {
          DEFAULT: "rgb(var(--shell) / <alpha-value>)",
          ink: "rgb(var(--shell-ink) / <alpha-value>)",
        },
        // CLI command blocks (`pre`), today `bg-slate-900 text-emerald-300`.
        // In dark that fill merges with the page and the block stops reading as
        // a block, so `code` goes *below* the page background and gains a
        // `line` border to keep its edges.
        code: {
          DEFAULT: "rgb(var(--code) / <alpha-value>)",
          ink: "rgb(var(--code-ink) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
export default config;
