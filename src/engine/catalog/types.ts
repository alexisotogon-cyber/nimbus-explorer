import type { BillingDatasetType, CloudProvider } from "../types";

export interface BillingServiceDefinition {
  id: string;
  name: string;
  family?: string;
  aliases: string[];
  productCount?: number;
  skuCount?: number;
  meterCount?: number;
}

export interface BillingConceptDefinition {
  id: string;
  name: string;
  dataset: BillingDatasetType;
  providerField?: string;
  focusConcept?: string;
  required?: boolean;
  supportedByParser: boolean;
  notes?: string;
}

export interface BillingCatalogSnapshot {
  provider: "focus" | CloudProvider;
  sourceType: string;
  sourceUrl: string;
  sourceVersion: string;
  fetchedAt: string;
  sourcePublishedAt?: string;
  sha256: string;
  services: BillingServiceDefinition[];
  concepts: BillingConceptDefinition[];
  warnings: string[];
  metadata?: {
    datasetColumnCounts?: Record<BillingDatasetType, number>;
    serviceCategories?: string[];
    serviceSubcategories?: string[];
    serviceFamilies?: string[];
  };
}
