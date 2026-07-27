# Nimbus Explorer component contract

This file translates `PRODUCT.md` and `DESIGN.md` into acceptance criteria for reusable UI components.

## Global controls

- `ThemeToggle`: one icon button, announces the destination theme, toggles in one click, 44 px target.
- `LocaleToggle`: one globe button with ES/EN, toggles in one click, never recalculates the report.
- Both expose default, hover, focus-visible, active, disabled, and loading-safe states.

## Flow navigation

- A reducer owns `provider`, `source`, and `dashboard`.
- “Volver” preserves provider, selected file metadata, and report for the current session.
- Browser Back uses the same reducer via `popstate`.
- Completed stepper items are keyboard-focusable navigation.
- “Nueva auditoría” requires confirmation when a report exists.

## Upload

- The entire drop zone is one accessible file control with drag, click, Enter, and Space support.
- The format sample is a 44 px secondary button, not a text link.
- Upload reports transfer progress from XHR, then deterministic processing states.
- Cancel aborts the request and prevents stale responses from updating state.
- Errors receive focus and are announced; busy states use `aria-live`, `aria-busy`, and `role="status"`.

## Executive dashboard

- Maximum content width: 1440 px.
- Header contains two sibling blocks: spend context and scenario savings.
- Provider logo: 36–40 px. Primary values: 28–32 px.
- No amount truncation. Grids adapt to the real metric count.
- Full financial reconciliation is collapsed by default; its status remains visible.

## Findings

- Collapsed content: action, provider/service, current saving, range, confidence, effort, risk, and review CTA.
- Expanded business content: detection reason, affected cost, saving, remaining cost, up to three resources, verification metric, safe next action, scenario link.
- Technical content is a second disclosure and contains calculation, sources, assumptions, read-only commands, remediation, and reversal.
- Only one interactive detail layer is open by default.

## Scenarios

- Global, deterministic, and shared by dashboard, Atlas, and exports.
- Three presets plus editable variables sorted by financial sensitivity.
- Six variables visible; remaining variables are collapsed.
- Show monthly, annual, and delta versus Actual.
- Support global and individual reset.

## Atlas

- Desktop: right-side panel approximately 420 px.
- Mobile: accessible bottom sheet.
- Escape closes it; focus is trapped while open and restored on close.
- Deterministic financial questions consume zero AI tokens.

## Tabs and disclosures

- Tabs follow ARIA keyboard behavior: Left/Right, Home, and End.
- Opening content receives focus and a brief tonal emphasis.
- Disclosure animations use 150–220 ms ease-out and respect reduced motion.
