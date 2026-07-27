import {
  AuditReport,
  Finding,
  isQuickWin,
  QUICK_WIN_THRESHOLD_USD,
  formatUSD,
  CONFIDENCE_LABELS,
  ConfidenceLevel,
} from "../types";
import { generateRemediation } from "./generate-remediation";

/**
 * Tool: build_report
 * Generates the executive report in Spanish (Markdown).
 * All figures come from the deterministic engine.
 *
 * Three things this file deliberately does NOT do any more:
 *
 *  1. Emojis. The report is meant to be pasted into a finance review or exported
 *     to PDF; 42 emojis per report is noise in that context, and the confidence
 *     emoji in particular carried meaning that the label already carries.
 *  2. Raw confidence slugs. `cap(f.confidence)` printed
 *     "Fuera-de-alcance-del-billing", the internal identifier, which types.ts
 *     explicitly documents as not for display. CONFIDENCE_LABELS is the display
 *     form and is now the only thing rendered.
 *  3. Locale date formatting on a bare date string. `new Date("2026-07-01")` is
 *     parsed as UTC midnight and `toLocaleDateString` then renders it in the local
 *     zone, so every user west of Greenwich saw "30 de junio". Dates are now
 *     formatted from their own components, no timezone involved.
 */

export function buildReport(report: AuditReport): string {
  const sections: string[] = [];

  // Header
  sections.push(`# Reporte Ejecutivo FinOps — Auditoría Multi-Nube\n`);
  sections.push(`**Generado:** ${formatTimestamp(report.generatedAt)}`);
  sections.push(`**Periodo:** ${formatDate(report.periodStart)} — ${formatDate(report.periodEnd)}`);
  sections.push(`**Días de datos:** ${report.dataWindow.distinctDays}`);
  sections.push(`**Proveedores:** ${report.providers.map((p) => p.toUpperCase()).join(", ")}`);
  sections.push(`**Gasto bruto mensual proyectado:** ${formatUSD(report.totalCostUSD)}`);
  sections.push(`**Ahorro de cartera (sin doble conteo):** ${formatUSD(report.portfolioSavingsUSD)}/mes`);
  sections.push(`**Oportunidad bruta (rango, suma de cada hallazgo por separado):** ${formatUSD(report.totalSavingsRange.conservative)}–${formatUSD(report.totalSavingsRange.optimistic)}/mes`);
  if (report.reviewPendingOptimisticUSD > 0) {
    sections.push(`**Adicional sujeto a revisión de métricas:** hasta ${formatUSD(report.reviewPendingOptimisticUSD)}/mes (hallazgos fuera del alcance del billing, sin evidencia de utilización)`);
  }
  sections.push(`**Hallazgos:** ${report.findings.length}\n`);

  const reconciliation = report.financialReconciliation;
  sections.push(`## Conciliación financiera del periodo\n`);
  sections.push(`| Concepto | Importe |`);
  sections.push(`|---|---:|`);
  sections.push(`| Gasto bruto de uso | ${formatUSD(reconciliation.grossUsageCostUSD)} |`);
  sections.push(`| Créditos y reembolsos | −${formatUSD(reconciliation.creditsAndRefundsUSD)} |`);
  sections.push(`| Impuestos | +${formatUSD(reconciliation.taxesUSD)} |`);
  sections.push(`| Compras de compromiso mostradas aparte | ${formatUSD(reconciliation.commitmentPurchasesUSD)} |`);
  sections.push(
    `| ${reconciliation.isInvoiceNetComplete ? "Neto estimado de factura" : "Neto de uso sin compras de compromiso"} | ` +
    `${formatUSD(reconciliation.invoiceNetCostUSD ?? reconciliation.netUsageCostExcludingCommitmentPurchasesUSD)} |`
  );
  sections.push(`\n**Fórmula:** ${reconciliation.formula}\n`);
  if (!reconciliation.isInvoiceNetComplete) {
    sections.push(
      `> El neto completo no está disponible con una sola base contable. Las compras de compromiso se muestran ` +
      `aparte para no mezclar BilledCost con EffectiveCost ni duplicar gasto.\n`
    );
  }

  if (report.billingCoverage) {
    const coverage = report.billingCoverage;
    sections.push(`## Cobertura del archivo y catálogo\n`);
    sections.push(`| Evidencia | Valor |`);
    sections.push(`|---|---|`);
    sections.push(`| Cálculo | Determinístico, sin IA |`);
    sections.push(`| Proveedor/dataset | ${coverage.provider.toUpperCase()} / ${coverage.datasetType} |`);
    sections.push(`| Esquema de referencia | ${coverage.sourceSchemaVersion} |`);
    sections.push(`| Columnas reconocidas | ${coverage.recognizedColumnCount} de ${coverage.totalColumnCount} (${coverage.coveragePercentage}%) |`);
    sections.push(`| Antigüedad del catálogo | ${coverage.catalogAgeDays} días (${coverage.status}) |`);
    if (coverage.unknownColumns.length > 0) {
      sections.push(
        `\n**Columnas detectadas pero no normalizadas:** ` +
        `${coverage.unknownColumns.slice(0, 20).join(", ")}` +
        `${coverage.unknownColumns.length > 20 ? ` y ${coverage.unknownColumns.length - 20} más` : ""}.\n`
      );
    }
    for (const warning of coverage.warnings) sections.push(`> ${warning}\n`);
  }

  // Data-window notice — printed BEFORE anything else, because it explains an
  // incomplete findings list and must not be buried under the figures.
  if (report.dataWindow.suppressedRules > 0) {
    sections.push(
      `> **Ventana de datos insuficiente.** El archivo cubre ` +
      `${report.dataWindow.distinctDays} ${report.dataWindow.distinctDays === 1 ? "día" : "días"} ` +
      `distintos y los hallazgos agregados necesitan al menos ${report.dataWindow.requiredDays}. ` +
      `Se omitieron ${report.dataWindow.suppressedRules} reglas: proyectar un promedio de tan pocos ` +
      `días a 30 convertiría un fin de semana o un pico puntual en una cifra mensual que no existe. ` +
      `Exporta un rango de al menos ${report.dataWindow.requiredDays} días (idealmente 30).\n`
    );
  }

  // Disclaimer (P0-5)
  sections.push(`> **Aviso:** Estas son recomendaciones informativas basadas en tu facturación. Valida cada acción en tu entorno antes de aplicarla.\n`);

  // Executive summary
  sections.push(`## Resumen Ejecutivo\n`);
  sections.push(`Se identificaron **${report.findings.length} oportunidades** por un total combinado de cartera de **${formatUSD(report.portfolioSavingsUSD)}/mes** (${report.savingsPercentage}% del gasto), ya descontado el solapamiento entre hallazgos que compiten por el mismo dinero. Sumando cada hallazgo por separado (oportunidad bruta, sin descontar solapamiento) el rango sería ${formatUSD(report.totalSavingsRange.conservative)}–${formatUSD(report.totalSavingsRange.optimistic)}/mes.\n`);

  const quickWins = report.findings.filter(isQuickWin);
  const quickWinSavings = quickWins.reduce((s, f) => s + f.estimatedMonthlySavingsUSD, 0);
  if (quickWins.length > 0) {
    sections.push(`**Quick Wins** (esfuerzo bajo + riesgo bajo + ahorro ≥${formatUSD(QUICK_WIN_THRESHOLD_USD)}/mes): ${quickWins.length} hallazgos, ~${formatUSD(quickWinSavings)}/mes.\n`);
  }

  // Trend insights — after executive summary
  if (report.trendInsights.length > 0) {
    sections.push(`\n## Tendencias\n`);
    sections.push(
      `> Calculadas determinísticamente sobre los registros — sin intervención del LLM. ` +
      `Cada entrada incluye la evidencia aritmética para verificación manual.\n`
    );
    for (const ins of report.trendInsights) {
      const tag = ins.severity === "warning" ? "Atención" : "Nota";
      sections.push(`### ${tag}: ${ins.title}\n`);
      sections.push(`${ins.detail}\n`);
      sections.push(`**Evidencia:** ${ins.evidence}\n`);
    }
  }

  // Priority table
  sections.push(`## Hallazgos Priorizados\n`);
  // Findings are already sorted by internal priorityScore; the score itself is
  // an internal sort key and is intentionally not shown to avoid confusion.
  sections.push(`| # | Proveedor | Servicio | Hallazgo | Ahorro (rango) | Esfuerzo | Riesgo | Confianza |`);
  sections.push(`|---|-----------|----------|----------|---------------|----------|--------|-----------|`);

  report.findings.forEach((f, i) => {
    sections.push(
      `| ${i + 1} | ${f.provider.toUpperCase()} | ${f.service} | ${f.title} | ${formatUSD(f.savingsRange.conservative)}–${formatUSD(f.savingsRange.optimistic)} | ${cap(f.effort)} | ${cap(f.risk)} | ${confidenceLabel(f.confidence)} |`
    );
  });

  // Category summary
  sections.push(`\n## Por Categoría\n`);
  sections.push(`| Categoría | Ahorro Est. | Hallazgos |`);
  sections.push(`|-----------|-------------|-----------|`);
  for (const cat of report.summaryByCategory) {
    sections.push(`| ${cat.label} | ${formatUSD(cat.totalSavingsUSD)}/mes | ${cat.findingCount} |`);
  }

  // Service summary — the engine has computed summaryByService all along and the
  // markdown never printed it, so the reader could see WHAT to fix but not WHERE
  // the money actually sits.
  if (report.summaryByService.length > 0) {
    sections.push(`\n## Por Servicio\n`);
    sections.push(`| Servicio | Costo mensual | Ahorro Est. | Hallazgos |`);
    sections.push(`|----------|--------------|-------------|-----------|`);
    for (const svc of report.summaryByService) {
      sections.push(
        `| ${svc.service} | ${formatUSD(svc.totalCostUSD)}/mes | ${formatUSD(svc.potentialSavingsUSD)}/mes | ${svc.findingCount} |`
      );
    }
  }

  // Finding details
  sections.push(`\n## Detalle\n`);
  for (const finding of report.findings) {
    sections.push(buildFindingDetail(finding));
  }

  // Methodology (single block, P1-15)
  sections.push(`\n## Metodología\n`);
  sections.push(
    `Las cifras las calcula el motor de reglas determinístico; la IA no inventa números. ` +
    `Las proyecciones mensuales son el promedio diario observado × 30, y por eso ninguna regla ` +
    `agregada se ejecuta con menos de ${report.dataWindow.requiredDays} días distintos de datos. ` +
    `Score de prioridad: ahorro (0-100, escalado a $1000) × multiplicador esfuerzo × multiplicador riesgo. ` +
    `Los ahorros se presentan como rangos basados en supuestos ajustables.\n`
  );

  // Disclaimer footer
  sections.push(`---\n`);
  sections.push(`*Recomendaciones informativas. Valida en tu entorno antes de actuar.*`);

  return sections.join("\n");
}

function buildFindingDetail(finding: Finding): string {
  const rem = generateRemediation(finding);
  const lines: string[] = [];

  lines.push(`### [${finding.provider.toUpperCase()}] ${finding.title}\n`);
  lines.push(`**Servicio:** ${finding.service}`);
  lines.push(`**Confianza:** ${confidenceLabel(finding.confidence)}`);
  lines.push(`**Pilar:** ${finding.pillar.framework} — ${finding.pillar.pillar} ([ref](${finding.pillar.url}))`);
  lines.push(`**Ahorro:** ${formatUSD(finding.savingsRange.conservative)}–${formatUSD(finding.savingsRange.optimistic)}/mes | **Esfuerzo:** ${cap(finding.effort)} | **Riesgo:** ${cap(finding.risk)}\n`);
  lines.push(`${finding.description}\n`);
  lines.push(`> ${finding.calculationBreakdown}\n`);

  if (finding.assumptions.length > 0) {
    lines.push(`**Supuestos:**`);
    for (const a of finding.assumptions) {
      lines.push(`- ${a.label}: ${(a.value * 100).toFixed(0)}% (rango: ${(a.min * 100).toFixed(0)}%–${(a.max * 100).toFixed(0)}%)${a.source ? ` — ${a.source}` : ""}`);
    }
    lines.push("");
  }

  // Investigation commands first
  if (rem.investigationSteps.length > 0) {
    lines.push(`**Investigación (solo lectura):**\n`);
    for (const step of rem.investigationSteps) {
      lines.push(`\`\`\`bash\n# ${step.description} [${step.provider}]\n${step.code}\n\`\`\`\n`);
    }
  }

  // Rollback ABOVE remediation (P0-3)
  lines.push(`**Rollback:** ${finding.remediation.rollbackPlan}\n`);

  // Remediation (collapsed in markdown via details)
  if (rem.remediationSteps.length > 0) {
    lines.push(`<details><summary>Remediación (expandir)</summary>\n`);
    if (rem.backupStep) {
      lines.push(`**Paso obligatorio de respaldo:** ${rem.backupStep}\n`);
    }
    for (const step of rem.remediationSteps) {
      if (step.isIrreversible) {
        lines.push(`> **Acción irreversible — posible pérdida de datos o servicio. Respalda y valida antes de ejecutar.**\n`);
      }
      lines.push(`\`\`\`bash\n# ${step.description} [${step.provider}]\n${step.code}\n\`\`\`\n`);
    }
    lines.push(`</details>\n`);
  }

  lines.push(`---\n`);
  return lines.join("\n");
}

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Formats a calendar date WITHOUT going through the local timezone.
 *
 * The engine's dates are plain YYYY-MM-DD day keys with no time and no zone.
 * `new Date("2026-07-01").toLocaleDateString("es-ES")` interprets them as UTC
 * midnight and then renders in the local zone, so at UTC-3 the report said
 * "30 de junio de 2026" for a row the parser had filed under 2026-07-01. Parsing
 * the components directly keeps the printed date equal to the stored date.
 */
function formatDate(dateStr: string): string {
  if (!dateStr) return "N/A";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (!match) return dateStr;
  const [, year, month, day] = match;
  const monthName = MONTHS_ES[Number(month) - 1];
  if (!monthName) return dateStr;
  return `${Number(day)} de ${monthName} de ${year}`;
}

/**
 * Formats an ISO instant (generatedAt), where the timezone IS meaningful — it is
 * a real moment in time, not a day key.
 */
function formatTimestamp(isoString: string): string {
  if (!isoString) return "N/A";
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return isoString;
  const date = `${parsed.getDate()} de ${MONTHS_ES[parsed.getMonth()]} de ${parsed.getFullYear()}`;
  const time = `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
  return `${date}, ${time}`;
}

function cap(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Display form of a confidence level. Never the raw slug. */
function confidenceLabel(confidence: string): string {
  return CONFIDENCE_LABELS[confidence as ConfidenceLevel] ?? confidence;
}
