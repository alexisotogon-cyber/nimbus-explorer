---
name: Nimbus Explorer
description: A calm, evidence-first FinOps decision workspace.
colors:
  action: "#1D4ED8"
  action-dark: "#93C5FD"
  financial: "#047857"
  financial-dark: "#5BD6AA"
  page: "#F6F8FB"
  surface: "#FFFFFF"
  surface-secondary: "#EEF2F6"
  ink: "#172033"
  ink-muted: "#526077"
  page-dark: "#0D121A"
  surface-dark: "#141B25"
  surface-secondary-dark: "#1C2532"
  ink-dark: "#EDF2F7"
  ink-muted-dark: "#B2BECD"
  caution: "#A64B00"
  danger: "#B42318"
typography:
  headline:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: "10px"
  panel: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "48px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "11px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.action}"
    rounded: "{rounded.control}"
    padding: "11px 16px"
    height: "44px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "24px"
---

# Design System: Nimbus Explorer

## Overview

**Creative North Star: “La mesa de decisiones FinOps”**

Nimbus is an analytical business workspace, not a decorative dashboard. A finance leader should be able to sit down in a bright office, scan the decision, and trust the evidence; an engineer can then reveal the technical depth without navigating to a different product. The visual language is restrained, crisp, and quietly premium.

The interface rejects generic AI styling, nested-card stacks, oversized empty zones, tiny metadata, and novelty controls. Information earns emphasis through hierarchy, alignment, and semantic color.

**Key Characteristics:**

- Executive result and technical evidence share one visual system.
- Wide, responsive layouts use the available screen without stretching prose.
- Financial values are never truncated and use tabular numerals.
- Detail appears progressively and retains focus context.
- Motion confirms state changes in 150–220 ms and disappears under reduced motion.

## Colors

The palette uses cool neutral surfaces with one interaction blue and one financial green.

### Primary

- **Decision Blue** (`#1D4ED8`, dark `#93C5FD`): actions, links, focus, and current selection only.
- **Verified Savings** (`#047857`, dark `#5BD6AA`): money, savings, and financially positive outcomes only.

### Neutral

- **Analyst Canvas** (`#F6F8FB`, dark `#0D121A`): page background.
- **Evidence Surface** (`#FFFFFF`, dark `#141B25`): primary panels and working surfaces.
- **Recessed Context** (`#EEF2F6`, dark `#1C2532`): secondary information and selected/open states.
- **Decision Ink** (`#172033`, dark `#EDF2F7`): headings, labels, and values.
- **Context Ink** (`#526077`, dark `#B2BECD`): supporting copy that still meets AA.

### Named Rules

**The Two-Signal Rule.** Blue means interaction. Green means money. Never interchange them for decoration.

## Typography

**Display Font:** IBM Plex Sans with system sans fallback  
**Body Font:** IBM Plex Sans with system sans fallback  
**Label/Mono Font:** IBM Plex Mono for commands, identifiers, and formulas

**Character:** IBM Plex is technical without feeling mechanical. One family keeps the product coherent; weight, spacing, and alignment create the hierarchy.

### Hierarchy

- **Headline** (600, 28–32 px, 1.2): primary monthly spend and savings.
- **Title** (600, 18–20 px, 1.35): sections and opportunity actions.
- **Body** (400, 16 px, 1.6): explanatory prose, capped at 72ch.
- **UI label** (500, minimum 14 px, 1.4): buttons, tabs, and fields.
- **Metadata** (400–500, minimum 12 px): provenance and compact identifiers only.

### Named Rules

**The Legible Evidence Rule.** A detail is not “secondary” if the user must read it to verify a financial claim; verification copy uses at least 14 px.

## Elevation

Nimbus is layered through tonal surfaces and defined borders. Resting panels do not combine a border with a wide, diffuse shadow. Elevation appears only for overlays, menus, and active drag states.

### Shadow Vocabulary

- **Overlay** (`0 8px 24px rgba(13, 18, 26, 0.18)`): Atlas, popovers, and dialogs only.
- **Lifted control** (`0 2px 6px rgba(13, 18, 26, 0.12)`): temporary active or dragged state.

### Named Rules

**Flat by default.** Structure comes from spacing, tonal layers, and a single subtle edge; shadow communicates temporary elevation.

## Components

### Buttons

- **Shape:** restrained 10 px corners and a minimum 44 px target.
- **Primary:** Decision Blue fill with white text.
- **Hover / Focus:** small color shift, defined 2 px focus ring, 180 ms ease-out; no scale bounce.
- **Secondary / Ghost:** outlined or tonal surface, still visibly interactive.

### Chips

- **Style:** pills are reserved for state tags. Every status combines an icon and text.
- **State:** green check for confirmed data, amber calibration for estimates, blue/slate metric icon for missing evidence.

### Cards / Containers

- **Corner Style:** 14 px for major panels; avoid nesting full cards.
- **Background:** Evidence Surface over Analyst Canvas.
- **Shadow Strategy:** flat at rest.
- **Border:** one restrained neutral edge when separation is necessary.
- **Internal Padding:** 20–24 px desktop, 16 px mobile.

### Inputs / Fields

- **Style:** 10 px corners, 44 px minimum height, clear label, visible placeholder contrast.
- **Focus:** Decision Blue border and 2 px offset focus ring.
- **Error / Disabled:** error pairs icon, text, and color; disabled remains legible and non-interactive.

### Navigation

Completed flow steps become links. Tabs implement the ARIA tabs pattern with arrow, Home, and End keys. “Volver” preserves the current audit; “Nueva auditoría” is a separate destructive reset with confirmation.

### Finding Row

Collapsed rows show the action, provider/service, current savings, range, confidence, effort, risk, and one “Revisar oportunidad” action. The expanded state reveals business evidence first; formulas, sources, commands, remediation, and reversal live under one separate “Evidencia y pasos técnicos” disclosure.

### Scenario Workspace

The global scenario workspace offers Conservador, Actual, and Optimista presets, six high-sensitivity variables, monthly/annual impact, delta, affected findings, and deterministic reset controls.

## Do's and Don'ts

### Do:

- **Do** use blue for every clickable affordance and visible focus.
- **Do** reserve green for money and savings.
- **Do** use `repeat(auto-fit, minmax(...))` or content-aware grids instead of empty columns.
- **Do** keep all financial values visible at 320 px and 200% zoom.
- **Do** give newly opened content a temporary tonal highlight and move focus without moving layout.
- **Do** expose one level of detail at a time.

### Don't:

- **Don't** create a generic AI-dashboard appearance or ornamental “AI magic”.
- **Don't** use nested cards, repeated boxes, excessive rounding, or decorative gradients.
- **Don't** place icons in square containers by default.
- **Don't** use 10–11 px visible text, truncate financial values, or leave half the viewport unused.
- **Don't** show formulas, assumptions, simulators, and commands simultaneously.
- **Don't** add decorative motion, bouncing controls, card scaling, or `transition-all`.
- **Don't** use green for generic actions.
- **Don't** combine a 1 px border with a wide soft shadow on the same resting panel.
