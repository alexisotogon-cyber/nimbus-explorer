import focusSnapshotJson from "./snapshots/focus-1.4.json";
import awsSnapshotJson from "./snapshots/aws-services.json";
import azureSnapshotJson from "./snapshots/azure-services.json";
import gcpSnapshotJson from "./snapshots/gcp-services.json";
import type {
  BillingCatalogSnapshot,
  BillingConceptDefinition,
} from "./types";
import type {
  BillingConceptCoverage,
  BillingDatasetType,
  CloudProvider,
} from "../types";

export type {
  BillingCatalogSnapshot,
  BillingConceptDefinition,
  BillingServiceDefinition,
} from "./types";

const snapshots: Record<"focus" | CloudProvider, BillingCatalogSnapshot> = {
  focus: focusSnapshotJson as BillingCatalogSnapshot,
  aws: awsSnapshotJson as BillingCatalogSnapshot,
  azure: azureSnapshotJson as BillingCatalogSnapshot,
  gcp: gcpSnapshotJson as BillingCatalogSnapshot,
};

export function getBillingCatalog(provider: "focus" | CloudProvider): BillingCatalogSnapshot {
  return snapshots[provider];
}

export function catalogStatus(
  fetchedAt: string,
  now = new Date()
): Pick<BillingConceptCoverage, "catalogAgeDays" | "status"> {
  const fetched = new Date(fetchedAt);
  const ageMs = Number.isFinite(fetched.getTime()) ? now.getTime() - fetched.getTime() : Infinity;
  const catalogAgeDays = Number.isFinite(ageMs)
    ? Math.max(0, Math.floor(ageMs / 86_400_000))
    : Number.MAX_SAFE_INTEGER;
  return {
    catalogAgeDays,
    status: catalogAgeDays > 45 ? "stale" : catalogAgeDays > 30 ? "warning" : "current",
  };
}

function conceptKeys(concept: BillingConceptDefinition): string[] {
  return [concept.id, concept.name, concept.providerField, concept.focusConcept]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

export function buildBillingCoverage(
  provider: "focus" | CloudProvider,
  datasetType: BillingDatasetType,
  headers: string[]
): BillingConceptCoverage {
  const snapshot = getBillingCatalog(provider);
  const concepts = snapshot.concepts.filter((concept) => concept.dataset === datasetType);
  const supported = new Set(
    concepts.filter((concept) => concept.supportedByParser).flatMap(conceptKeys)
  );
  const normalized = headers.map((header) => ({
    raw: header,
    key: header.toLowerCase().replace(/[^a-z0-9]/g, ""),
  }));
  const recognizedColumns = normalized
    .filter(({ key }) => supported.has(key))
    .map(({ raw }) => raw);
  const unknownColumns = normalized
    .filter(({ key }) => !supported.has(key))
    .map(({ raw }) => raw);
  const age = catalogStatus(snapshot.fetchedAt);
  const totalColumnCount = normalized.length;

  return {
    provider,
    datasetType,
    sourceSchemaVersion: snapshot.sourceVersion,
    catalogSnapshot: snapshot.sourceUrl,
    catalogFetchedAt: snapshot.fetchedAt,
    ...age,
    recognizedColumns,
    unknownColumns,
    recognizedColumnCount: recognizedColumns.length,
    totalColumnCount,
    coveragePercentage:
      totalColumnCount === 0
        ? 0
        : Math.round((recognizedColumns.length / totalColumnCount) * 10_000) / 100,
    deterministic: true,
    warnings: [
      ...snapshot.warnings,
      ...(age.status === "warning"
        ? [`El catálogo tiene ${age.catalogAgeDays} días; conviene actualizarlo.`]
        : []),
      ...(age.status === "stale"
        ? [`El catálogo está vencido (${age.catalogAgeDays} días).`]
        : []),
    ],
  };
}
