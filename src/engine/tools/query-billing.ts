import { NormalizedCostRecord, CategorySummary, ServiceSummary, WasteCategory, Finding } from "../types";

/**
 * Tool: query_billing
 * Deterministic aggregation of cost data.
 */

export interface BillingQueryResult {
  totalCostUSD: number;
  periodStart: string;
  periodEnd: string;
  totalDays: number;
  recordCount: number;
  serviceBreakdown: ServiceSummary[];
  dailyAverage: number;
  projectedMonthlyCost: number;
  topServices: { service: string; cost: number; percentage: number }[];
  providers: string[];
}

const CATEGORY_LABELS: Record<WasteCategory, string> = {
  "idle-resources": "Recursos sin uso",
  "utilization-review": "Revisar uso real (la factura no basta)",
  "oversized-instances": "Instancias más grandes de lo necesario",
  "unattached-storage": "Discos pagados posiblemente sin uso",
  "legacy-generation": "Instancias de generación vieja",
  "missing-commitment": "Sin descuentos por compromiso (Savings Plans / Reservas)",
  "data-transfer": "Transferencia de datos",
  "unoptimized-storage-class": "Datos en almacenamiento más caro de lo necesario",
  "unused-elastic-ips": "Direcciones IP pagadas sin usar",
  "excessive-snapshots": "Respaldos (snapshots) antiguos acumulados",
  "nat-gateway-overuse": "Salida a internet cara (NAT Gateway)",
  "ai-visibility": "Gasto en inteligencia artificial (AI/ML)",
  "ai-gpu-review": "Revisar uso real de GPUs (la factura no basta)",
  "ai-batch-opportunity": "Inferencia IA cara cuando hay alternativa por lotes",
  "ai-endpoint-idle": "Endpoints de inferencia siempre activos",
  "ai-cost-attribution": "Gasto IA sin asignación por equipo o proyecto",
};

export function getCategoryLabel(category: WasteCategory): string {
  return CATEGORY_LABELS[category] || category;
}

export function queryBilling(records: NormalizedCostRecord[]): BillingQueryResult {
  if (records.length === 0) {
    return {
      totalCostUSD: 0, periodStart: "", periodEnd: "", totalDays: 0,
      recordCount: 0, serviceBreakdown: [], dailyAverage: 0,
      projectedMonthlyCost: 0, topServices: [], providers: [],
    };
  }

  const usageRecords = records.filter((record) => {
    const chargeType = (record.chargeType || "Usage").toLowerCase();
    return record.cost > 0 &&
      !/(credit|refund|tax|purchase|adjustment)/.test(chargeType);
  });
  const dates = usageRecords.map((r) => r.date).filter(Boolean).sort();
  const periodStart = dates[0] || "";
  const periodEnd = dates[dates.length - 1] || "";
  const uniqueDays = new Set(dates).size;
  const totalCostUSD = usageRecords.reduce((sum, r) => sum + r.cost, 0);

  // Providers
  const providers = Array.from(new Set(records.map((r) => r.provider)));

  // Group by native service
  const byService: Record<string, number> = {};
  for (const r of usageRecords) {
    byService[r.nativeService] = (byService[r.nativeService] || 0) + r.cost;
  }

  const serviceBreakdown: ServiceSummary[] = Object.entries(byService)
    .map(([service, totalCost]) => ({
      service,
      totalCostUSD: Math.round(totalCost * 100) / 100,
      potentialSavingsUSD: 0,
      findingCount: 0,
    }))
    .sort((a, b) => b.totalCostUSD - a.totalCostUSD);

  const topServices = serviceBreakdown.slice(0, 10).map((s) => ({
    service: s.service,
    cost: s.totalCostUSD,
    percentage: totalCostUSD > 0 ? Math.round((s.totalCostUSD / totalCostUSD) * 10000) / 100 : 0,
  }));

  const dailyAverage = uniqueDays > 0 ? totalCostUSD / uniqueDays : 0;
  const monthlySummary = usageRecords.length > 0 && usageRecords.every(
    (record) =>
      record.source?.extensions?.analysisLevel === "summary" &&
      record.source?.extensions?.granularity === "monthly"
  );
  // A monthly Cost Explorer row is already one complete period. Its comparable
  // monthly baseline is the average of the observed months, not a daily value
  // multiplied by 30.
  const projectedMonthlyCost = monthlySummary
    ? (uniqueDays > 0 ? totalCostUSD / uniqueDays : 0)
    : dailyAverage * 30;

  return {
    totalCostUSD: Math.round(totalCostUSD * 100) / 100,
    periodStart,
    periodEnd,
    totalDays: uniqueDays,
    recordCount: usageRecords.length,
    serviceBreakdown,
    dailyAverage: Math.round(dailyAverage * 100) / 100,
    projectedMonthlyCost: Math.round(projectedMonthlyCost * 100) / 100,
    topServices,
    providers,
  };
}

/**
 * Generate category summary from findings.
 */
export function summarizeByCategory(
  findings: { category: WasteCategory; estimatedMonthlySavingsUSD: number }[]
): CategorySummary[] {
  const byCategory: Record<string, { total: number; count: number }> = {};

  for (const f of findings) {
    if (!byCategory[f.category]) {
      byCategory[f.category] = { total: 0, count: 0 };
    }
    byCategory[f.category].total += f.estimatedMonthlySavingsUSD;
    byCategory[f.category].count += 1;
  }

  return Object.entries(byCategory)
    .map(([category, data]) => ({
      category: category as WasteCategory,
      label: getCategoryLabel(category as WasteCategory),
      totalSavingsUSD: Math.round(data.total * 100) / 100,
      findingCount: data.count,
    }))
    .sort((a, b) => b.totalSavingsUSD - a.totalSavingsUSD);
}
