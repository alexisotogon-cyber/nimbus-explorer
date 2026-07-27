import React from "react";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import path from "node:path";
import type { ReportExportModel } from "./model";

Font.register({
  family: "IBM Plex Sans",
  fonts: [
    { src: path.join(process.cwd(), "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff"), fontWeight: 400 },
    { src: path.join(process.cwd(), "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff"), fontWeight: 600 },
  ],
});

const styles = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 48, paddingHorizontal: 44, fontFamily: "IBM Plex Sans", fontSize: 9, color: "#172033", backgroundColor: "#FFFFFF" },
  header: { position: "absolute", top: 18, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", color: "#526077", fontSize: 8 },
  footer: { position: "absolute", bottom: 18, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", color: "#526077", fontSize: 8 },
  title: { fontSize: 22, fontWeight: 600, marginBottom: 6 },
  subtitle: { color: "#526077", fontSize: 10, marginBottom: 22 },
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 13, fontWeight: 600, marginBottom: 8 },
  grid: { flexDirection: "row", gap: 8, marginBottom: 18 },
  kpi: { flexGrow: 1, padding: 10, backgroundColor: "#EEF2F6", borderRadius: 6 },
  label: { fontSize: 8, color: "#526077", marginBottom: 4 },
  value: { fontSize: 15, fontWeight: 600 },
  positive: { color: "#047857" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#D8DEE8", paddingVertical: 6 },
  rank: { width: 24, color: "#526077" },
  action: { flexGrow: 1, paddingRight: 8 },
  saving: { width: 78, textAlign: "right", color: "#047857", fontWeight: 600 },
  small: { fontSize: 8, color: "#526077", marginTop: 2 },
  reconciliation: { flexDirection: "row", gap: 10, padding: 10, borderWidth: 0.6, borderColor: "#D8DEE8", borderRadius: 6 },
  recItem: { flexGrow: 1 },
  finding: { marginBottom: 12, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: "#D8DEE8" },
  findingTitle: { fontSize: 11, fontWeight: 600, marginBottom: 4 },
  body: { lineHeight: 1.45, marginBottom: 5 },
  badge: { color: "#1D4ED8", fontSize: 8, marginBottom: 4 },
});

const money = (value: number, locale: "es" | "en") =>
  new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);

function Footer({ model }: { model: ReportExportModel }) {
  return (
    <>
      <View style={styles.header} fixed>
        <Text>Nimbus Explorer</Text>
        <Text>{model.meta.providers.join(" · ")} · {model.meta.periodStart} - {model.meta.periodEnd}</Text>
      </View>
      <View style={styles.footer} fixed>
        <Text>{model.locale === "es" ? "Confidencial" : "Confidential"} · {model.locale === "es" ? "análisis" : "analysis"} {model.meta.analysisId.slice(0, 8)}</Text>
        <Text render={({ pageNumber, totalPages }) => `${model.locale === "es" ? "Página" : "Page"} ${pageNumber} ${model.locale === "es" ? "de" : "of"} ${totalPages}`} />
      </View>
    </>
  );
}

function ReportDocument({ model }: { model: ReportExportModel }) {
  const es = model.locale === "es";
  return (
    <Document
      title={es ? "Reporte de optimización de costos cloud" : "Cloud cost optimization report"}
      author="Nimbus Explorer"
      subject="Deterministic FinOps analysis"
      keywords="FinOps, cloud cost, AWS, Azure, GCP, FOCUS"
      language={model.locale}
    >
      <Page size="A4" style={styles.page}>
        <Footer model={model} />
        <Text style={styles.title}>{es ? "Reporte de optimización de costos" : "Cloud cost optimization report"}</Text>
        <Text style={styles.subtitle}>
          {es ? "Resumen ejecutivo con evidencia financiera determinística" : "Executive summary with deterministic financial evidence"} · {model.meta.analysisId.slice(0, 8)}
        </Text>

        <View style={styles.grid}>
          <View style={styles.kpi}>
            <Text style={styles.label}>{es ? "Gasto bruto mensual" : "Monthly gross spend"}</Text>
            <Text style={styles.value}>{money(model.financials.gross, model.locale)}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.label}>{es ? "Ahorro mensual actual" : "Current monthly savings"}</Text>
            <Text style={[styles.value, styles.positive]}>{money(model.savings.current, model.locale)}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.label}>{es ? "Ahorro anual" : "Annual savings"}</Text>
            <Text style={[styles.value, styles.positive]}>{money(model.savings.annual, model.locale)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{es ? "Conciliación financiera" : "Financial reconciliation"}</Text>
          <View style={styles.reconciliation}>
            {[
              [es ? "Bruto" : "Gross", model.financials.gross],
              [es ? "Créditos" : "Credits", -model.financials.credits],
              [es ? "Impuestos" : "Taxes", model.financials.taxes],
              [es ? "Neto" : "Net", model.financials.net],
            ].map(([label, value]) => (
              <View style={styles.recItem} key={String(label)}>
                <Text style={styles.label}>{label}</Text>
                <Text>{money(Number(value), model.locale)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{es ? "Acciones prioritarias" : "Priority actions"}</Text>
          {model.findings.slice(0, 5).map((finding) => (
            <View style={styles.row} key={finding.id} wrap={false}>
              <Text style={styles.rank}>{finding.priority}</Text>
              <View style={styles.action}>
                <Text>{finding.title}</Text>
                <Text style={styles.small}>{finding.provider} · {finding.service} · {finding.effort} · {finding.risk}</Text>
              </View>
              <Text style={styles.saving}>{money(finding.savingsCurrent, model.locale)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{es ? "Cobertura y calidad" : "Coverage and quality"}</Text>
          <Text style={styles.body}>
            {es ? "Ventana" : "Window"}: {model.quality.distinctDays}/{model.quality.requiredDays} · {es ? "Filas" : "Rows"}: {model.meta.totalRows} · {es ? "Cobertura" : "Coverage"}:{" "}
            {model.quality.coveragePercentage !== null
              ? `${model.quality.coveragePercentage}%`
              : (es ? "no disponible en este archivo" : "not available in this file")}
          </Text>
          <Text style={styles.body}>
            {es ? "Catálogo" : "Catalog"}: {model.quality.catalog ?? (es ? "no disponible" : "not available")}
          </Text>
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <Footer model={model} />
        <Text style={styles.sectionTitle}>{es ? "Anexo técnico de hallazgos" : "Technical findings appendix"}</Text>
        {model.findings.map((finding) => (
          <View style={styles.finding} key={finding.id} wrap={false}>
            <Text style={styles.findingTitle}>{finding.priority}. {finding.title}</Text>
            <Text style={styles.badge}>{finding.provider} · {finding.service} · {finding.confidence}</Text>
            <Text style={styles.body}>{finding.description}</Text>
            <Text style={styles.body}>{es ? "Cálculo" : "Calculation"}: {finding.calculation}</Text>
            <Text style={styles.body}>{es ? "Siguiente acción" : "Next action"}: {finding.nextAction}</Text>
            <Text style={styles.body}>{es ? "Reversión" : "Rollback"}: {finding.rollback}</Text>
            <Text style={styles.small}>{finding.source}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function buildPdfExport(model: ReportExportModel): Promise<Buffer> {
  const instance = pdf(<ReportDocument model={model} />);
  const blob = await instance.toBlob();
  return Buffer.from(await blob.arrayBuffer());
}
