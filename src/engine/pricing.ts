import { CloudProvider } from "./types";

/**
 * Versioned pricing reference table.
 * Each entry has a last-updated date and source URL.
 * Live connector only for AWS (via Cost Explorer). Azure and GCP via CSV + demo.
 */

export interface PricingEntry {
  provider: CloudProvider;
  service: string;
  metric: string;
  pricePerUnit: number;
  unit: string;
  region: string;
  /** Date this price value was last set/queried (YYYY-MM-DD) */
  lastUpdated: string;
  /** Source URL for the price */
  source: string;
  /**
   * Whether pricePerUnit was verified against the live AWS Price List API
   * (via the aws-pricing MCP server). When false, the value is an unverified
   * placeholder from general knowledge and MUST NOT be presented as authoritative.
   */
  verified: boolean;
  /**
   * How the price was obtained/verified.
   * "official-pricing-docs" = checked against the provider's official pricing
   * documentation / public price list on `lastUpdated` (not via the MCP API).
   */
  verificationMethod: "aws-pricing-api" | "official-pricing-docs" | "unverified-placeholder";
}

/**
 * VERIFICATION STATUS (2026-07-24):
 * Some entries are now verified against official pricing documentation / public
 * price lists and are marked verified:true:
 *   - aws EC2 elastic-ip-idle (0.005 USD/hour, us-east-1). Note the idle and
 *     in-use public IPv4 rates are IDENTICAL, which is why rules must not infer
 *     "unused IP count" from AWS cost alone.
 *   - aws NAT Gateway data-processing (0.045 USD/GB, us-east-1).
 *   - azure Public IP static-ip (0.005 USD/hour, eastus, Standard static SKU).
 *   - gcp Static IP static-ip-unused (0.01 USD/hour, us-central1).
 * The remaining entries (EBS gp3, EBS snapshots, S3 standard, Azure managed disks,
 * Azure blob hot, GCP PD SSD, GCP Cloud Storage standard, GCP Cloud NAT) are still
 * unverified placeholders and MUST NOT be presented as authoritative.
 */

/**
 * Reference pricing — used for estimation calculations.
 * These are NOT used for billing; they inform the savings estimates.
 */
export const PRICING_TABLE: PricingEntry[] = [
  // ─── AWS ─────────────────────────────────────────────────────────────
  {
    provider: "aws",
    service: "EBS",
    metric: "gp3-storage",
    pricePerUnit: 0.08,
    unit: "GB-month",
    region: "us-east-1",
    lastUpdated: "2026-07-21",
    source: "https://aws.amazon.com/ebs/pricing/",
    verified: false,
    verificationMethod: "unverified-placeholder",
  },
  {
    provider: "aws",
    service: "EBS",
    metric: "snapshot-storage",
    pricePerUnit: 0.05,
    unit: "GB-month",
    region: "us-east-1",
    lastUpdated: "2026-07-21",
    source: "https://aws.amazon.com/ebs/pricing/",
    verified: false,
    verificationMethod: "unverified-placeholder",
  },
  {
    provider: "aws",
    service: "EC2",
    metric: "elastic-ip-idle",
    pricePerUnit: 0.005,
    unit: "hour",
    region: "us-east-1",
    lastUpdated: "2026-07-24",
    // USE1-PublicIPv4:IdleAddress and USE1-PublicIPv4:InUseAddress are both
    // 0.005 USD/hour, so this rate does NOT identify an idle address.
    source:
      "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-instance-addressing.html — USE1-PublicIPv4:IdleAddress y USE1-PublicIPv4:InUseAddress cuestan lo mismo (0,005 USD/hora, us-east-1, consultado el 2026-07-24)",
    verified: true,
    verificationMethod: "official-pricing-docs",
  },
  {
    provider: "aws",
    service: "NAT Gateway",
    metric: "data-processing",
    pricePerUnit: 0.045,
    unit: "GB",
    region: "us-east-1",
    lastUpdated: "2026-07-24",
    source:
      "https://aws.amazon.com/vpc/pricing/ — 0,045 USD por GB procesado y 0,045 USD por hora en us-east-1 (consultado el 2026-07-24); varía por región",
    verified: true,
    verificationMethod: "official-pricing-docs",
  },
  {
    provider: "aws",
    service: "S3",
    metric: "standard-storage",
    pricePerUnit: 0.023,
    unit: "GB-month",
    region: "us-east-1",
    lastUpdated: "2026-07-21",
    source: "https://aws.amazon.com/s3/pricing/",
    verified: false,
    verificationMethod: "unverified-placeholder",
  },
  // ─── Azure ───────────────────────────────────────────────────────────
  {
    provider: "azure",
    service: "Managed Disks",
    metric: "premium-ssd-storage",
    pricePerUnit: 0.132,
    unit: "GB-month",
    region: "eastus",
    lastUpdated: "2026-07-21",
    source: "https://azure.microsoft.com/en-us/pricing/details/managed-disks/",
    verified: false,
    verificationMethod: "unverified-placeholder",
  },
  {
    provider: "azure",
    service: "Blob Storage",
    metric: "hot-storage",
    pricePerUnit: 0.018,
    unit: "GB-month",
    region: "eastus",
    lastUpdated: "2026-07-21",
    source: "https://azure.microsoft.com/en-us/pricing/details/storage/blobs/",
    verified: false,
    verificationMethod: "unverified-placeholder",
  },
  {
    provider: "azure",
    service: "Public IP",
    metric: "static-ip",
    // Was 0.004: that was the Basic dynamic SKU, retired on 2025-09-30.
    pricePerUnit: 0.005,
    unit: "hour",
    region: "eastus",
    lastUpdated: "2026-07-24",
    source:
      "https://azure.microsoft.com/en-us/pricing/details/ip-addresses/ — SKU Standard estática IPv4: 0,005 USD/hora en eastus (consultado el 2026-07-24). La SKU Basic (0,004 USD/hora) se retiró el 30 de septiembre de 2025. Azure no publica tarifa distinta para direcciones sin asociar",
    verified: true,
    verificationMethod: "official-pricing-docs",
  },
  // ─── GCP ─────────────────────────────────────────────────────────────
  {
    provider: "gcp",
    service: "Static IP",
    // Unlike AWS/Azure, GCP prices the idle state differently (0.01 vs 0.005
    // in use), which is what makes the "unused IP" inference valid on GCP.
    metric: "static-ip-unused",
    pricePerUnit: 0.01,
    unit: "hour",
    region: "us-central1",
    lastUpdated: "2026-07-24",
    source:
      "https://cloud.google.com/vpc/network-pricing — IP estática asignada pero sin usar: 0,01 USD/hora en us-central1 (en uso en una VM estándar: 0,005 USD/hora), consultado el 2026-07-24",
    verified: true,
    verificationMethod: "official-pricing-docs",
  },
  {
    provider: "gcp",
    service: "Persistent Disk",
    metric: "pd-ssd-storage",
    pricePerUnit: 0.17,
    unit: "GB-month",
    region: "us-central1",
    lastUpdated: "2026-07-21",
    source: "https://cloud.google.com/compute/disks-image-pricing",
    verified: false,
    verificationMethod: "unverified-placeholder",
  },
  {
    provider: "gcp",
    service: "Cloud Storage",
    metric: "standard-storage",
    pricePerUnit: 0.02,
    unit: "GB-month",
    region: "us-central1",
    lastUpdated: "2026-07-21",
    source: "https://cloud.google.com/storage/pricing",
    verified: false,
    verificationMethod: "unverified-placeholder",
  },
  {
    provider: "gcp",
    service: "Cloud NAT",
    metric: "data-processing",
    pricePerUnit: 0.045,
    unit: "GB",
    region: "us-central1",
    lastUpdated: "2026-07-21",
    source: "https://cloud.google.com/nat/pricing",
    verified: false,
    verificationMethod: "unverified-placeholder",
  },
];

/** Pricing table version metadata */
export const PRICING_VERSION = {
  version: "1.2.0-partially-verified",
  lastUpdated: "2026-07-24",
  /**
   * True only when EVERY entry has been verified. Still false: the storage
   * entries below remain unverified placeholders.
   */
  allPricesVerified: false,
  verificationNote:
    "Parcialmente verificado el 2026-07-24. Verificadas contra documentación oficial de precios: IPv4 pública de AWS (0,005 USD/hora en us-east-1, misma tarifa esté ociosa o en uso), NAT Gateway de AWS (0,045 USD/GB en us-east-1), IP pública Standard estática de Azure (0,005 USD/hora en eastus; la SKU Basic se retiró el 30/09/2025) e IP estática sin usar de Google Cloud (0,01 USD/hora en us-central1). Siguen siendo placeholders sin verificar: EBS gp3, snapshots EBS, S3 Standard, Managed Disks Premium SSD, Blob Storage hot, Persistent Disk SSD, Cloud Storage Standard y Cloud NAT. Todos los precios varían por región.",
  sources: {
    aws: "https://aws.amazon.com/pricing/",
    azure: "https://azure.microsoft.com/en-us/pricing/",
    gcp: "https://cloud.google.com/pricing",
  },
};

/** Returns true if any price in the table is unverified. */
export function hasUnverifiedPrices(): boolean {
  return PRICING_TABLE.some((p) => !p.verified);
}

/**
 * Get reference price for a service/metric/provider combination.
 * Returns null if not found.
 */
export function getReferencePrice(
  provider: CloudProvider,
  service: string,
  metric: string
): PricingEntry | null {
  return PRICING_TABLE.find(
    (p) =>
      p.provider === provider &&
      p.service.toLowerCase() === service.toLowerCase() &&
      p.metric === metric
  ) || null;
}

/** Connector availability status per provider */
export const CONNECTOR_STATUS: Record<CloudProvider, { live: boolean; label: string }> = {
  aws: { live: true, label: "Conector en vivo disponible" },
  azure: { live: false, label: "Conector próximamente — usa CSV export" },
  gcp: { live: false, label: "Conector próximamente — usa CSV export" },
};
