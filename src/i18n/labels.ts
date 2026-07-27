/* ============================================================================
   THE SPANISH-LOOKING SLUGS ARE IDENTIFIERS, NOT TEXT.
   ============================================================================
   EffortLevel and RiskLevel are "bajo" | "medio" | "alto"; ConfidenceLevel
   includes "fuera-de-alcance-del-billing"; WasteCategory is a set of kebab-case
   slugs. All of them are KEYS: they index the colour-class maps in
   components/finding-card.tsx, components/report-dashboard.tsx and
   components/icons.tsx, they are the discriminators in the engine's scoring
   multipliers, and they are serialised into every report already generated.

   Do NOT rename them, translate them, or widen the types. Renaming "bajo" breaks
   the colour lookup silently (undefined class → unstyled chip) and invalidates
   stored reports.

   Language lives ONLY in the maps below: slug → human-readable label, per locale.
   The UI is supposed to render these instead of printing the raw slug, which is
   what it does today ("bajo", "riesgo bajo"). Wiring the components up to these
   maps is the component-translation phase; this file only provides them.
   ============================================================================ */

import type { Locale } from "./config";
import {
  CONFIDENCE_LABELS,
  type ConfidenceLevel,
  type EffortLevel,
  type RiskLevel,
  type WasteCategory,
} from "../engine/types";

export const EFFORT_LABELS: Record<Locale, Record<EffortLevel, string>> = {
  es: {
    bajo: "Esfuerzo bajo",
    medio: "Esfuerzo medio",
    alto: "Esfuerzo alto",
  },
  en: {
    bajo: "Low effort",
    medio: "Medium effort",
    alto: "High effort",
  },
};

export const RISK_LABELS: Record<Locale, Record<RiskLevel, string>> = {
  es: {
    bajo: "Riesgo bajo",
    medio: "Riesgo medio",
    alto: "Riesgo alto",
  },
  en: {
    bajo: "Low risk",
    medio: "Medium risk",
    alto: "High risk",
  },
};

/**
 * Spanish side is CONFIDENCE_LABELS from engine/types.ts verbatim — spread, not
 * retyped, so the two can never drift. The engine keeps owning the Spanish
 * wording; this file only adds the English column.
 */
export const CONFIDENCE_LABELS_I18N: Record<Locale, Record<ConfidenceLevel, string>> = {
  es: { ...CONFIDENCE_LABELS },
  en: {
    confirmado: "Confirmed with your data",
    inferencia: "Estimate — verify it in your account",
    "fuera-de-alcance-del-billing": "Needs extra metrics (the invoice is not enough)",
  },
};

/**
 * Spanish side copied from the CATEGORY_LABELS table behind getCategoryLabel() in
 * engine/tools/query-billing.ts (that one is module-private, so it cannot be
 * imported; it was read, not reinvented). If the engine's wording changes, this
 * column has to follow — the duplication is deliberate but not free.
 *
 * "Savings Plans" and "NAT Gateway" stay untranslated in both columns per
 * glossary.ts.
 */
export const CATEGORY_LABELS: Record<Locale, Record<WasteCategory, string>> = {
  es: {
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
  },
  en: {
    "idle-resources": "Unused resources",
    "utilization-review": "Check real usage (the invoice is not enough)",
    "oversized-instances": "Instances larger than needed",
    "unattached-storage": "Paid disks possibly unused",
    "legacy-generation": "Old-generation instances",
    "missing-commitment": "No commitment discounts (Savings Plans / Reserved Instances)",
    "data-transfer": "Data transfer",
    "unoptimized-storage-class": "Data in pricier storage than needed",
    "unused-elastic-ips": "Paid IP addresses sitting unused",
    "excessive-snapshots": "Old snapshots piling up",
    "nat-gateway-overuse": "Expensive internet egress (NAT Gateway)",
    "ai-visibility": "Artificial intelligence spend (AI/ML)",
    "ai-gpu-review": "Check real GPU usage (the invoice is not enough)",
    "ai-batch-opportunity": "Expensive AI inference where a batch option exists",
    "ai-endpoint-idle": "Inference endpoints always on",
    "ai-cost-attribution": "AI spend with no team or project attribution",
  },
};
