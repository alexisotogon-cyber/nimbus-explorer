import ExcelJS from "exceljs";
import type { ReportExportModel } from "./model";

const COLORS = {
  ink: "FF172033",
  action: "FF1D4ED8",
  positive: "FF047857",
  surface: "FFFFFFFF",
  secondary: "FFEEF2F6",
  line: "FFD8DEE8",
  caution: "FFA64B00",
  danger: "FFB42318",
};

const currency = '"$"#,##0.00;[Red]("$"#,##0.00);-';
const percent = "0.0%";

function styleSheet(sheet: ExcelJS.Worksheet, title: string, width = 12, locale: "es" | "en" = "es") {
  sheet.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];
  sheet.mergeCells(1, 1, 1, width);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: "Aptos Display", size: 20, bold: true, color: { argb: COLORS.ink } };
  titleCell.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 34;
  sheet.getRow(3).height = 24;
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const footerLabel = locale === "es" ? "Confidencial - Nimbus Explorer" : "Confidential - Nimbus Explorer";
  const footerPage = locale === "es" ? "Página &P de &N" : "Page &P of &N";
  sheet.headerFooter.oddFooter = `&L${footerLabel}&C${footerPage}&R&F`;
}

function headerStyle(row: ExcelJS.Row) {
  row.font = { name: "Aptos", bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.ink } };
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 30;
}

function addTable(
  sheet: ExcelJS.Worksheet,
  name: string,
  ref: string,
  headers: string[],
  rows: Array<Array<string | number | Date | null>>
) {
  sheet.addTable({
    name,
    ref,
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: headers.map((header) => ({ name: header, filterButton: true })),
    rows,
  });
  headerStyle(sheet.getRow(Number(ref.match(/\d+/)?.[0] ?? 1)));
}

export async function buildExcelExport(model: ReportExportModel): Promise<Buffer> {
  const es = model.locale === "es";
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nimbus Explorer";
  workbook.subject = "Deterministic FinOps action plan";
  workbook.created = new Date(model.meta.generatedAt);
  workbook.calcProperties.fullCalcOnLoad = true;

  const names = es
    ? {
        summary: "Resumen",
        plan: "Plan de acción",
        services: "Servicios",
        scenarios: "Escenarios y evidencia",
        finance: "Finanzas y calidad",
        trends: "Tendencias",
      }
    : {
        summary: "Summary",
        plan: "Action plan",
        services: "Services",
        scenarios: "Scenarios and evidence",
        finance: "Finance and quality",
        trends: "Trends",
      };

  const lists = workbook.addWorksheet("_Lists", { state: "veryHidden" });
  lists.addRows([
    [es ? "Estado" : "Status", es ? "Responsable" : "Owner"],
    [es ? "Por evaluar" : "To assess", es ? "FinOps" : "FinOps"],
    [es ? "Planificado" : "Planned", es ? "Cloud Platform" : "Cloud Platform"],
    [es ? "En curso" : "In progress", es ? "Propietario del servicio" : "Service owner"],
    [es ? "Bloqueado" : "Blocked", es ? "Finanzas" : "Finance"],
    [es ? "Completado" : "Completed", es ? "Seguridad" : "Security"],
  ]);

  const summary = workbook.addWorksheet(names.summary);
  styleSheet(summary, es ? "Nimbus Explorer - Resumen ejecutivo" : "Nimbus Explorer - Executive summary", 8, model.locale);
  summary.getCell("A3").value = es ? "Análisis" : "Analysis";
  summary.getCell("B3").value = model.meta.analysisId.slice(0, 8);
  summary.getCell("D3").value = es ? "Periodo" : "Period";
  summary.getCell("E3").value = `${model.meta.periodStart} - ${model.meta.periodEnd}`;
  summary.getCell("G3").value = es ? "Proveedores" : "Providers";
  summary.getCell("H3").value = model.meta.providers.join(", ");
  headerStyle(summary.getRow(3));
  summary.getRow(3).alignment = { vertical: "middle", wrapText: false };
  const kpis = [
    [es ? "Gasto bruto mensual" : "Monthly gross spend", model.financials.gross],
    [es ? "Ahorro mensual actual" : "Current monthly savings", model.savings.current],
    [es ? "Ahorro anual" : "Annual savings", model.savings.annual],
    [es ? "Recuperable" : "Recoverable", model.savings.percentage / 100],
  ];
  kpis.forEach(([label, value], index) => {
    const col = 1 + index * 2;
    summary.getCell(5, col).value = label;
    summary.getCell(6, col).value = value;
    summary.getCell(5, col).font = { bold: true, color: { argb: COLORS.ink } };
    summary.getCell(6, col).font = { bold: true, size: 18, color: { argb: index === 0 ? COLORS.ink : COLORS.positive } };
    summary.getCell(6, col).numFmt = index === 3 ? percent : currency;
    summary.mergeCells(5, col, 5, col + 1);
    summary.mergeCells(6, col, 6, col + 1);
  });
  addTable(
    summary,
    "TopActions",
    "A9",
    [es ? "Prioridad" : "Priority", es ? "Acción" : "Action", es ? "Servicio" : "Service", es ? "Ahorro mensual" : "Monthly savings"],
    model.findings.slice(0, 5).map((finding) => [finding.priority, finding.title, finding.service, finding.savingsCurrent])
  );
  summary.getColumn(2).width = 46;
  summary.getColumn(3).width = 28;
  summary.getColumn(4).width = 18;
  summary.getColumn(1).width = 12;
  summary.getColumn(5).width = 28;
  summary.getColumn(6).width = 14;
  summary.getColumn(7).width = 18;
  summary.getColumn(8).width = 18;
  summary.getColumn(4).numFmt = currency;

  const plan = workbook.addWorksheet(names.plan);
  styleSheet(plan, es ? "Plan de acción editable" : "Editable action plan", 17, model.locale);
  // "Finding ID" used to be a visible column here — the engine's internal
  // rule-id slug, meaningless to a client reading the plan. It now lives
  // only in the hidden _Audit sheet below (row order maps 1:1 to this table).
  const planHeaders = [
    es ? "Prioridad" : "Priority", es ? "Proveedor" : "Provider",
    es ? "Servicio" : "Service", es ? "Oportunidad" : "Opportunity",
    es ? "Ahorro bajo" : "Low saving", es ? "Ahorro mensual" : "Monthly saving",
    es ? "Ahorro alto" : "High saving", es ? "Ahorro anual" : "Annual saving",
    es ? "Esfuerzo" : "Effort", es ? "Riesgo" : "Risk", es ? "Confianza" : "Confidence",
    es ? "Responsable" : "Owner", es ? "Estado" : "Status",
    es ? "Fecha objetivo" : "Target date", es ? "Siguiente acción" : "Next action",
    es ? "Reversión" : "Rollback", es ? "Notas" : "Notes",
  ];
  const planRows = model.findings.map((finding, index) => [
    finding.priority, finding.provider, finding.service, finding.title,
    finding.savingsLow, finding.savingsCurrent, finding.savingsHigh,
    { formula: `F${5 + index}*12`, result: finding.annualSavings } as unknown as number,
    finding.effort, finding.risk, finding.confidence, "FinOps", es ? "Por evaluar" : "To assess",
    null, finding.nextAction, finding.rollback, "—",
  ]);
  addTable(plan, "ActionPlan", "A4", planHeaders, planRows);
  plan.views = [{ state: "frozen", xSplit: 4, ySplit: 4, showGridLines: false }];
  plan.getColumn(1).width = 12;
  plan.getColumn(2).width = 14;
  [5, 6, 7, 8].forEach((col) => { plan.getColumn(col).numFmt = currency; plan.getColumn(col).width = 16; });
  plan.getColumn(3).width = 24;
  plan.getColumn(4).width = 48;
  plan.getColumn(9).width = 12;
  plan.getColumn(10).width = 12;
  plan.getColumn(11).width = 24;
  plan.getColumn(12).width = 22;
  plan.getColumn(13).width = 18;
  plan.getColumn(14).width = 16;
  plan.getColumn(15).width = 48;
  plan.getColumn(16).width = 42;
  plan.getColumn(17).width = 30;

  // Hidden technical sheet: internal rule-id slugs for support/debugging,
  // never shown to the client. Row N here corresponds to plan row N.
  const audit = workbook.addWorksheet("_Audit", { state: "veryHidden" });
  audit.addRows([
    ["Finding ID", "Title"],
    ...model.findings.map((finding) => [finding.id, finding.title]),
  ]);

  if (model.findings.length > 0) {
    const first = 5;
    const last = 4 + model.findings.length;
    // Column numbers shifted by -1 across the board since "Finding ID" (the
    // old column 2) was removed: Owner is now L(12), Status M(13), Target
    // date N(14), Next action O(15), Rollback P(16), Notes Q(17).
    plan.getCell(`L${first}`).dataValidation = { type: "list", allowBlank: true, formulae: ["'_Lists'!$B$2:$B$6"] };
    plan.getCell(`M${first}`).dataValidation = { type: "list", allowBlank: false, formulae: ["'_Lists'!$A$2:$A$6"] };
    for (let row = first; row <= last; row++) {
      plan.getRow(row).height = 42;
      for (const col of [4, 15, 16, 17]) {
        plan.getCell(row, col).alignment = { vertical: "top", wrapText: true };
      }
      plan.getCell(row, 12).dataValidation = plan.getCell(first, 12).dataValidation;
      plan.getCell(row, 13).dataValidation = plan.getCell(first, 13).dataValidation;
      plan.getCell(row, 14).numFmt = "yyyy-mm-dd";
      for (const col of [12, 13, 14, 17]) {
        plan.getCell(row, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF2FF" } };
      }
    }
    plan.addConditionalFormatting({
      ref: `M${first}:M${last}`,
      rules: [
        { type: "containsText", priority: 1, operator: "containsText", text: es ? "Completado" : "Completed", style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFDDF7EB" } } } },
        { type: "containsText", priority: 2, operator: "containsText", text: es ? "Bloqueado" : "Blocked", style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFDE8E8" } } } },
      ],
    });
  }

  const services = workbook.addWorksheet(names.services);
  styleSheet(services, names.services, 6, model.locale);
  addTable(
    services,
    "ServicesPortfolio",
    "A4",
    [es ? "Servicio" : "Service", es ? "Costo mensual" : "Monthly cost", es ? "Ahorro mensual" : "Monthly saving", es ? "Tasa de ahorro" : "Saving rate", es ? "Ahorro anual" : "Annual saving", es ? "Hallazgos" : "Findings"],
    model.services.map((service, index) => [
      service.service, service.cost, service.savings,
      { formula: `IFERROR(C${5 + index}/B${5 + index},0)`, result: service.cost ? service.savings / service.cost : 0 } as unknown as number,
      { formula: `C${5 + index}*12`, result: service.savings * 12 } as unknown as number,
      service.findings,
    ])
  );
  services.getColumn(1).width = 38;
  [2, 3, 5].forEach((col) => { services.getColumn(col).width = 18; services.getColumn(col).numFmt = currency; });
  services.getColumn(4).width = 16;
  services.getColumn(4).numFmt = percent;

  const scenarios = workbook.addWorksheet(names.scenarios);
  styleSheet(scenarios, names.scenarios, 8, model.locale);
  addTable(
    scenarios,
    "ScenarioEvidence",
    "A4",
    ["ID", es ? "Variable" : "Variable", es ? "Actual" : "Current", es ? "Mínimo" : "Minimum", es ? "Máximo" : "Maximum", es ? "Sensibilidad mensual" : "Monthly sensitivity", es ? "Hallazgos" : "Findings", es ? "Fuente" : "Source"],
    model.scenarios.map((variable) => [variable.id, variable.label, variable.current, variable.min, variable.max, variable.sensitivity, variable.findingCount, variable.source])
  );
  scenarios.getColumn(1).width = 28;
  scenarios.getColumn(2).width = 48;
  [3, 4, 5].forEach((col) => { scenarios.getColumn(col).numFmt = percent; scenarios.getColumn(col).width = 14; });
  scenarios.getColumn(6).numFmt = currency;
  scenarios.getColumn(6).width = 20;
  scenarios.getColumn(8).width = 64;
  for (let row = 5; row < 5 + model.scenarios.length; row++) {
    scenarios.getRow(row).height = 72;
    scenarios.getCell(row, 2).alignment = { vertical: "top", wrapText: true };
    scenarios.getCell(row, 8).alignment = { vertical: "top", wrapText: true };
  }

  // Delta reused below both for the initial cached value and for the
  // literal strings embedded in the IF() formula — Excel overwrites `result`
  // on recalculation, so the PASS/REVIEW-equivalent text has to be correct
  // in the FORMULA itself, not just the value ExcelJS ships as a cache.
  const reconciliationDelta =
    model.financials.periodGross - model.financials.credits + model.financials.taxes -
    model.financials.commitmentPurchases - model.financials.net;
  const reconciledLabel = es ? "Conciliado" : "Reconciled";
  const reviewLabel = es ? "Revisar" : "Review";

  const finance = workbook.addWorksheet(names.finance);
  styleSheet(finance, names.finance, 6, model.locale);
  addTable(
    finance,
    "FinancialReconciliation",
    "A4",
    [es ? "Concepto" : "Concept", es ? "Valor" : "Value", es ? "Cómo se calcula" : "How it's calculated", es ? "Control" : "Check"],
    [
      [es ? "Bruto del periodo" : "Period gross", model.financials.periodGross, es ? "Gasto bruto de uso del periodo, tal como llegó del archivo." : "Period's gross usage spend, as read from the file.", "—"],
      [es ? "Créditos/reembolsos" : "Credits/refunds", model.financials.credits, es ? "Créditos y reembolsos del periodo." : "Period credits and refunds.", "—"],
      [es ? "Impuestos" : "Taxes", model.financials.taxes, es ? "Impuestos del periodo." : "Period taxes.", "—"],
      [es ? "Compras de compromiso" : "Commitment purchases", model.financials.commitmentPurchases, es ? "Compras de Savings Plans/Reservas/CUDs, mostradas aparte (base de caja, no de devengo)." : "Savings Plan/Reservation/CUD purchases, shown separately (cash basis, not accrual).", "—"],
      [es ? "Neto calculado sin compras" : "Calculated net excluding purchases", { formula: "B5-B6+B7-B8", result: model.financials.periodGross - model.financials.credits + model.financials.taxes - model.financials.commitmentPurchases } as unknown as number, es ? "Bruto − créditos + impuestos, sin incluir compras de compromiso." : "Gross − credits + taxes, excluding commitment purchases.", "—"],
      [es ? "Neto del reporte" : "Reported net", model.financials.net, es ? "Neto que muestra el dashboard para este análisis." : "Net figure the dashboard shows for this analysis.", "—"],
      [es ? "Delta conciliación" : "Reconciliation delta", { formula: "B9-B10", result: reconciliationDelta } as unknown as number, es ? "Diferencia entre el neto calculado y el reportado; debe ser ~0." : "Difference between the calculated and reported net; should be ~0.", { formula: `IF(ABS(B11)<0.01,"${reconciledLabel}","${reviewLabel}")`, result: Math.abs(reconciliationDelta) < 0.01 ? reconciledLabel : reviewLabel } as unknown as string],
    ]
  );
  finance.getColumn(1).width = 30;
  finance.getColumn(2).width = 20;
  finance.getColumn(2).numFmt = currency;
  finance.getColumn(3).width = 42;
  finance.getColumn(4).width = 16;
  finance.getCell("A14").value = es ? "Calidad de datos" : "Data quality";
  finance.getCell("A14").font = { bold: true, size: 14, color: { argb: COLORS.ink } };
  const notAvailable = es ? "No disponible en este archivo" : "Not available in this file";
  finance.addRows([
    [es ? "Ventana de datos" : "Data window", `${model.quality.distinctDays}/${model.quality.requiredDays}`],
    [es ? "Reglas suprimidas" : "Suppressed rules", model.quality.suppressedRules],
    [es ? "Cobertura de columnas" : "Column coverage", model.quality.coveragePercentage === null ? notAvailable : model.quality.coveragePercentage / 100],
    [es ? "Antigüedad del catálogo" : "Catalog age", model.quality.catalogAgeDays ?? notAvailable],
    [es ? "Columnas no reconocidas" : "Unknown columns", model.quality.unknownColumns.join(", ") || (es ? "Ninguna" : "None")],
  ]);
  finance.getCell("B17").numFmt = percent;

  // Only created VISIBLE when there is real data — an empty sheet with a
  // synthetic "no trends" row read as a broken export, not a deliberate
  // "nothing to report" state. Still created hidden so the workbook keeps
  // one file format regardless of content, and Resumen explains why it's
  // not there instead of leaving a placeholder.
  const hasTrends = model.trends.length > 0;
  if (hasTrends) {
    const trends = workbook.addWorksheet(names.trends);
    styleSheet(trends, names.trends, 4, model.locale);
    const trendRows = model.trends.map((trend) => [trend.severity, trend.title, trend.detail, trend.evidence]);
    addTable(trends, "BillingTrends", "A4", [es ? "Severidad" : "Severity", es ? "Título" : "Title", es ? "Detalle" : "Detail", es ? "Evidencia" : "Evidence"], trendRows);
    trends.getColumn(1).width = 16;
    trends.getColumn(2).width = 34;
    trends.getColumn(3).width = 60;
    trends.getColumn(4).width = 60;
    for (let row = 5; row < 5 + trendRows.length; row++) {
      trends.getRow(row).height = 72;
      for (const col of [2, 3, 4]) trends.getCell(row, col).alignment = { vertical: "top", wrapText: true };
    }
  } else {
    summary.getCell("A21").value =
      es
        ? "No se detectaron tendencias con esta ventana de datos. Carga un periodo más largo o uno anterior para comparar."
        : "No trends were detected with this data window. Load a longer or earlier period to compare.";
    summary.getCell("A21").font = { italic: true, color: { argb: COLORS.ink } };
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
