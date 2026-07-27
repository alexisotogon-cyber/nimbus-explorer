import type { ReportExportModel } from "./model";

const money = (value: number, locale: "es" | "en") =>
  new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const escapeTable = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").replace(/`/g, "\\`");

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildMarkdownExport(model: ReportExportModel): string {
  const es = model.locale === "es";
  const t = es
    ? {
        title: "Reporte ejecutivo de optimización cloud",
        summary: "Resumen ejecutivo",
        reconciliation: "Conciliación financiera",
        actions: "Plan de acción",
        methodology: "Metodología y calidad",
        gross: "Gasto bruto mensual",
        saving: "Ahorro mensual del escenario",
        annual: "Ahorro anual",
        range: "Rango conservador-optimista",
        status: "Estado",
        reconciled: "Conciliado",
        partial: "Neto parcial",
        priority: "Prioridad",
        action: "Acción",
        provider: "Proveedor",
        service: "Servicio",
        current: "Ahorro actual",
        confidence: "Confianza",
        details: "Evidencia técnica",
        gross2: "Bruto",
        credits2: "Créditos/reembolsos",
        taxes2: "Impuestos",
        net2: "Neto",
        deterministic: "Análisis determinístico; la IA no calcula valores financieros.",
        window: "Ventana de datos",
        days: "días",
        rows2: "Filas",
        coverage: "Cobertura",
        catalog: "Catálogo",
        notAvailable: "no disponible en este archivo",
      }
    : {
        title: "Cloud cost optimization executive report",
        summary: "Executive summary",
        reconciliation: "Financial reconciliation",
        actions: "Action plan",
        methodology: "Methodology and quality",
        gross: "Monthly gross spend",
        saving: "Scenario monthly savings",
        annual: "Annual savings",
        range: "Conservative-optimistic range",
        status: "Status",
        reconciled: "Reconciled",
        partial: "Partial net",
        priority: "Priority",
        action: "Action",
        provider: "Provider",
        service: "Service",
        current: "Current savings",
        confidence: "Confidence",
        details: "Technical evidence",
        gross2: "Gross",
        credits2: "Credits/refunds",
        taxes2: "Taxes",
        net2: "Net",
        deterministic: "Deterministic analysis; AI does not calculate financial values.",
        window: "Data window",
        days: "days",
        rows2: "Rows",
        coverage: "Coverage",
        catalog: "Catalog",
        notAvailable: "not available in this file",
      };

  const lines = [
    `# ${t.title}`,
    "",
    `> ${model.meta.providers.join(", ")} · ${model.meta.periodStart} - ${model.meta.periodEnd} · ${model.meta.analysisId.slice(0, 8)}`,
    "",
    `## ${t.summary}`,
    "",
    `- **${t.gross}:** ${money(model.financials.gross, model.locale)}`,
    `- **${t.saving}:** ${money(model.savings.current, model.locale)}`,
    `- **${t.annual}:** ${money(model.savings.annual, model.locale)}`,
    `- **${t.range}:** ${money(model.savings.conservative, model.locale)} - ${money(model.savings.optimistic, model.locale)}`,
    "",
    `## ${t.reconciliation}`,
    "",
    `- **${t.status}:** ${model.financials.complete ? t.reconciled : t.partial}`,
    `- **${t.gross2}:** ${money(model.financials.gross, model.locale)}`,
    `- **${t.credits2}:** -${money(model.financials.credits, model.locale)}`,
    `- **${t.taxes2}:** +${money(model.financials.taxes, model.locale)}`,
    `- **${t.net2}:** ${money(model.financials.net, model.locale)}`,
    "",
    `## ${t.actions}`,
    "",
    `| ${t.priority} | ${t.action} | ${t.provider} | ${t.service} | ${t.current} | ${t.confidence} |`,
    "|---:|---|---|---|---:|---|",
    ...model.findings.map(
      (finding) =>
        `| ${finding.priority} | ${escapeTable(finding.title)} | ${finding.provider} | ${escapeTable(finding.service)} | ${money(finding.savingsCurrent, model.locale)} | ${escapeTable(finding.confidence)} |`
    ),
    "",
    `<details><summary>${t.details}</summary>`,
    "",
    ...model.findings.flatMap((finding) => [
      `### ${finding.priority}. ${escapeHtml(finding.title)}`,
      "",
      escapeHtml(finding.description),
      "",
      `- ${escapeHtml(finding.calculation)}`,
      `- ${escapeHtml(finding.nextAction)}`,
      `- ${escapeHtml(finding.rollback)}`,
      `- Source: ${escapeHtml(finding.source)}`,
      "",
    ]),
    "</details>",
    "",
    `## ${t.methodology}`,
    "",
    `- ${t.deterministic}`,
    `- ${t.window}: ${model.quality.distinctDays}/${model.quality.requiredDays} ${t.days}.`,
    `- ${t.rows2}: ${model.meta.totalRows}.`,
    `- ${t.coverage}: ${model.quality.coveragePercentage !== null ? `${model.quality.coveragePercentage}%` : t.notAvailable}.`,
    `- ${t.catalog}: ${model.quality.catalog ?? t.notAvailable}.`,
    "",
  ];
  return lines.join("\n");
}

/**
 * Compact profile meant to be pasted into another AI tool as evidence — the
 * opposite tradeoff from buildMarkdownExport(): drops remediation commands,
 * rollback plans and per-finding technical detail, keeps only the numbers
 * and the top actions, and opens with an explicit anti-hallucination
 * instruction so a downstream model doesn't recompute or invent figures.
 * Capped at roughly 2500 tokens (~10,000 characters, a 4 chars/token
 * approximation) by capping the number of findings listed, not by
 * truncating mid-sentence.
 */
export function buildAiContextMarkdown(model: ReportExportModel): string {
  const es = model.locale === "es";
  const instruction = es
    ? "Usa estas cifras como evidencia. No inventes, recalcules ni combines importes fuera de las reglas indicadas. Distingue datos confirmados, estimaciones y métricas faltantes."
    : "Use these figures as evidence. Do not invent, recompute, or combine amounts outside the rules stated. Distinguish confirmed data, estimates, and missing metrics.";

  const t = es
    ? {
        title: "Contexto Nimbus para IA",
        provider: "Proveedor(es)", period: "Periodo", gross: "Gasto bruto mensual",
        saving: "Ahorro mensual del escenario", annual: "Ahorro anual",
        reconciliation: "Conciliación", status: "Estado", reconciled: "Conciliado", partial: "Neto parcial",
        topActions: "Top 5 acciones cuantificadas", reviewOnly: "Revisiones sin cifra (requieren métricas)",
        none: "Ninguna.",
      }
    : {
        title: "Nimbus AI context",
        provider: "Provider(s)", period: "Period", gross: "Monthly gross spend",
        saving: "Scenario monthly savings", annual: "Annual savings",
        reconciliation: "Reconciliation", status: "Status", reconciled: "Reconciled", partial: "Partial net",
        topActions: "Top 5 quantified actions", reviewOnly: "Reviews with no figure (need metrics)",
        none: "None.",
      };

  const quantified = model.findings.filter((f) => f.savingsCurrent > 0).slice(0, 5);
  const reviewOnly = model.findings.filter((f) => f.savingsCurrent === 0).slice(0, 5);

  const lines = [
    `# ${t.title}`,
    "",
    `> ${instruction}`,
    "",
    `- **${t.provider}:** ${model.meta.providers.join(", ")}`,
    `- **${t.period}:** ${model.meta.periodStart} - ${model.meta.periodEnd}`,
    `- **${t.gross}:** ${money(model.financials.gross, model.locale)}`,
    `- **${t.saving}:** ${money(model.savings.current, model.locale)}`,
    `- **${t.annual}:** ${money(model.savings.annual, model.locale)}`,
    `- **${t.reconciliation}:** ${model.financials.complete ? t.reconciled : t.partial} (${money(model.financials.net, model.locale)})`,
    "",
    `## ${t.topActions}`,
    "",
    ...(quantified.length
      ? quantified.map((f) => `- **${escapeTable(f.title)}** (${f.provider}/${escapeTable(f.service)}): ${money(f.savingsCurrent, model.locale)}/mes — ${escapeTable(f.confidence)}`)
      : [`- ${t.none}`]),
    "",
    `## ${t.reviewOnly}`,
    "",
    ...(reviewOnly.length
      ? reviewOnly.map((f) => `- ${escapeTable(f.title)} (${f.provider}/${escapeTable(f.service)})`)
      : [`- ${t.none}`]),
    "",
  ];
  return lines.join("\n");
}
