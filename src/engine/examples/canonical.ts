import Papa from "papaparse";
import focusSnapshot from "@/engine/catalog/snapshots/focus-1.4.json";

export type ExampleProvider = "aws" | "azure" | "gcp" | "focus";

export interface CanonicalExample {
  provider: ExampleProvider;
  filename: string;
  sourceVersion: string;
  sourceUrl: string;
  headers: string[];
  rows: Record<string, string | number>[];
  csv: string;
  sql?: string;
  expected: {
    physicalRows: 3;
    positiveUsageRows: 2;
    distinctDays: 1;
    findings: 0;
  };
}

const AWS_HEADERS = [
  "identity_line_item_id",
  "bill_invoice_id",
  "bill_billing_period_start_date",
  "bill_billing_period_end_date",
  "line_item_usage_account_id",
  "line_item_line_item_type",
  "line_item_usage_start_date",
  "line_item_usage_end_date",
  "line_item_product_code",
  "product_servicecode",
  "product_product_name",
  "product_sku",
  "product_usagetype",
  "product_region",
  "line_item_availability_zone",
  "line_item_resource_id",
  "line_item_usage_amount",
  "line_item_unblended_rate",
  "line_item_unblended_cost",
  "line_item_net_unblended_cost",
  "line_item_currency_code",
  "pricing_unit",
  "pricing_public_on_demand_rate",
  "pricing_public_on_demand_cost",
  "savings_plan_savings_plan_a_r_n",
  "savings_plan_savings_plan_effective_cost",
  "reservation_reservation_a_r_n",
  "reservation_effective_cost",
  "discount_total_discount",
  "resource_tags",
];

const AZURE_HEADERS = [
  "InvoiceSectionName", "AccountName", "AccountOwnerId", "SubscriptionId",
  "SubscriptionName", "ResourceGroup", "ResourceLocation", "Date", "ProductName",
  "MeterCategory", "MeterSubCategory", "MeterId", "MeterName", "MeterRegion",
  "UnitOfMeasure", "Quantity", "EffectivePrice", "CostInBillingCurrency", "CostCenter",
  "ConsumedService", "ResourceId", "Tags", "OfferId", "AdditionalInfo", "ServiceInfo1",
  "ServiceInfo2", "ResourceName", "ReservationId", "ReservationName", "UnitPrice",
  "ProductOrderId", "ProductOrderName", "Term", "PublisherType", "PublisherName",
  "ChargeType", "Frequency", "PricingModel", "AvailabilityZone", "BillingAccountId",
  "BillingAccountName", "BillingCurrencyCode", "BillingPeriodStartDate",
  "BillingPeriodEndDate", "BillingProfileId", "BillingProfileName", "InvoiceSectionId",
  "IsAzureCreditEligible", "PartNumber", "PayGPrice", "PlanName", "ServiceFamily",
  "CostAllocationRuleName", "benefitId", "benefitName",
];

const GCP_HEADERS = [
  "billing_account_id", "service_id", "service_description", "sku_id", "sku_description",
  "project_id", "project_name", "project_ancestry_numbers", "location_region",
  "usage_start_time", "usage_end_time", "usage_amount", "usage_unit", "cost", "currency",
  "cost_type", "credits_amount", "credits_type", "x_credits", "x_consumption_model_id",
  "x_consumption_model_description", "x_subscription_instance_id", "x_list_cost",
  "x_effective_cost", "resource_global_name", "tags",
];

const GCP_SQL = `-- Nimbus canonical sample: flattened result of Standard Usage Cost Export
SELECT
  billing_account_id,
  service.id AS service_id,
  service.description AS service_description,
  sku.id AS sku_id,
  sku.description AS sku_description,
  project.id AS project_id,
  project.name AS project_name,
  project.ancestry_numbers AS project_ancestry_numbers,
  location.region AS location_region,
  usage_start_time,
  usage_end_time,
  usage.amount AS usage_amount,
  usage.unit AS usage_unit,
  cost,
  currency,
  cost_type,
  (SELECT SUM(c.amount) FROM UNNEST(credits) AS c) AS credits_amount,
  ARRAY_TO_STRING(ARRAY(SELECT c.type FROM UNNEST(credits) AS c), '|') AS credits_type,
  TO_JSON_STRING(credits) AS x_credits,
  invoice.month AS invoice_month,
  resource.global_name AS resource_global_name,
  TO_JSON_STRING(tags) AS tags
FROM \`PROJECT.DATASET.gcp_billing_export_v1_BILLING_ACCOUNT\`
WHERE DATE(usage_start_time) = DATE '2026-07-01'
ORDER BY usage_start_time, service_description, sku_description
LIMIT 3;`;

function record(headers: string[], values: Record<string, string | number>) {
  return Object.fromEntries(headers.map((header) => [header, values[header] ?? ""]));
}

function awsExample(): CanonicalExample {
  const common = {
    bill_invoice_id: "INV-2026-07-NIMBUS",
    bill_billing_period_start_date: "2026-07-01T00:00:00Z",
    bill_billing_period_end_date: "2026-08-01T00:00:00Z",
    line_item_usage_account_id: "123456789012",
    line_item_usage_start_date: "2026-07-01T00:00:00Z",
    line_item_usage_end_date: "2026-07-01T01:00:00Z",
    line_item_currency_code: "USD",
    product_region: "us-east-1",
    line_item_availability_zone: "us-east-1a",
    pricing_unit: "Hrs",
  };
  const rows = [
    record(AWS_HEADERS, {
      ...common,
      identity_line_item_id: "li-ondemand-0001",
      line_item_line_item_type: "Usage",
      line_item_product_code: "AmazonEC2",
      product_servicecode: "AmazonEC2",
      product_product_name: "Amazon Elastic Compute Cloud",
      product_sku: "SKU-EC2-M6I-LARGE",
      product_usagetype: "USE1-BoxUsage:m6i.large",
      line_item_resource_id: "i-0a11b22c33d44e55f",
      line_item_usage_amount: 400,
      line_item_unblended_rate: 0.10625,
      line_item_unblended_cost: 42.5,
      line_item_net_unblended_cost: 42.5,
      pricing_public_on_demand_rate: 0.10625,
      pricing_public_on_demand_cost: 42.5,
      resource_tags: '{"user:Environment":"production","user:Owner":"platform"}',
    }),
    record(AWS_HEADERS, {
      ...common,
      identity_line_item_id: "li-savingsplan-0002",
      line_item_line_item_type: "SavingsPlanCoveredUsage",
      line_item_product_code: "AmazonEC2",
      product_servicecode: "AmazonEC2",
      product_product_name: "Amazon Elastic Compute Cloud",
      product_sku: "SKU-EC2-C7G-LARGE",
      product_usagetype: "USE1-BoxUsage:c7g.large",
      line_item_resource_id: "i-0123456789abcdef0",
      line_item_usage_amount: 250,
      line_item_unblended_rate: 0.07,
      line_item_unblended_cost: 17.5,
      line_item_net_unblended_cost: 17.5,
      pricing_public_on_demand_rate: 0.09,
      pricing_public_on_demand_cost: 22.5,
      savings_plan_savings_plan_a_r_n: "arn:aws:savingsplans::123456789012:savingsplan/sp-0abc1234",
      savings_plan_savings_plan_effective_cost: 17.5,
      discount_total_discount: 5,
      resource_tags: '{"user:Environment":"production","user:Owner":"data"}',
    }),
    record(AWS_HEADERS, {
      ...common,
      identity_line_item_id: "li-credit-0003",
      line_item_line_item_type: "Credit",
      line_item_product_code: "AmazonEC2",
      product_servicecode: "AmazonEC2",
      product_product_name: "Amazon Elastic Compute Cloud",
      product_sku: "SKU-CREDIT",
      product_usagetype: "Credit",
      line_item_usage_amount: 1,
      line_item_unblended_cost: -6.5,
      line_item_net_unblended_cost: -6.5,
    }),
  ];
  return finalize("aws", "nimbus-aws-cur2-sample.csv", "CUR 2.0", "https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-cur2.html", AWS_HEADERS, rows);
}

function azureExample(): CanonicalExample {
  const common = {
    InvoiceSectionName: "Platform Engineering",
    AccountName: "Nimbus Example EA",
    AccountOwnerId: "finops@example.invalid",
    SubscriptionId: "11111111-2222-3333-4444-555555555555",
    SubscriptionName: "Production",
    ResourceGroup: "rg-platform-prod",
    ResourceLocation: "eastus",
    Date: "2026-07-01",
    MeterRegion: "US East",
    BillingAccountId: "9876543",
    BillingAccountName: "Nimbus Example Enrollment",
    BillingCurrencyCode: "USD",
    BillingPeriodStartDate: "2026-07-01",
    BillingPeriodEndDate: "2026-07-31",
    BillingProfileId: "EA-9876543",
    BillingProfileName: "Nimbus Example EA",
    InvoiceSectionId: "dept-platform",
    PublisherType: "Azure",
    PublisherName: "Microsoft",
    Frequency: "UsageBased",
    IsAzureCreditEligible: "True",
    ServiceFamily: "Compute",
  };
  const rows = [
    record(AZURE_HEADERS, {
      ...common,
      ProductName: "Virtual Machines Dsv5 Series",
      MeterCategory: "Virtual Machines",
      MeterSubCategory: "Dv5/DSv5 Series Windows",
      MeterId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      MeterName: "D2s v5",
      UnitOfMeasure: "1 Hour",
      Quantity: 400,
      EffectivePrice: 0.10625,
      UnitPrice: 0.10625,
      PayGPrice: 0.12,
      CostInBillingCurrency: 42.5,
      ConsumedService: "Microsoft.Compute",
      ResourceId: "/subscriptions/11111111-2222-3333-4444-555555555555/resourceGroups/rg-platform-prod/providers/Microsoft.Compute/virtualMachines/vm-api-01",
      ResourceName: "vm-api-01",
      ChargeType: "Usage",
      PricingModel: "On Demand",
    }),
    record(AZURE_HEADERS, {
      ...common,
      ProductName: "Virtual Machines Dsv5 Series",
      MeterCategory: "Virtual Machines",
      MeterSubCategory: "Dv5/DSv5 Series Linux",
      MeterId: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
      MeterName: "D2s v5",
      UnitOfMeasure: "1 Hour",
      Quantity: 250,
      EffectivePrice: 0.07,
      UnitPrice: 0.07,
      PayGPrice: 0.09,
      CostInBillingCurrency: 17.5,
      ConsumedService: "Microsoft.Compute",
      ResourceId: "/subscriptions/11111111-2222-3333-4444-555555555555/resourceGroups/rg-platform-prod/providers/Microsoft.Compute/virtualMachines/vm-worker-02",
      ResourceName: "vm-worker-02",
      ReservationId: "/providers/Microsoft.Capacity/reservationOrders/ro-123/reservations/r-456",
      ReservationName: "prod-compute-1y",
      ProductOrderId: "ro-123",
      ProductOrderName: "prod-compute-1y",
      Term: "12 Months",
      ChargeType: "Usage",
      PricingModel: "Reservation",
      benefitId: "r-456",
      benefitName: "prod-compute-1y",
    }),
    record(AZURE_HEADERS, {
      ...common,
      ProductName: "Azure service credit",
      MeterCategory: "Virtual Machines",
      MeterSubCategory: "Adjustment",
      MeterId: "cccccccc-dddd-eeee-ffff-000000000000",
      MeterName: "Service Credit",
      UnitOfMeasure: "1",
      Quantity: 1,
      EffectivePrice: -6.5,
      UnitPrice: -6.5,
      CostInBillingCurrency: -6.5,
      ConsumedService: "Microsoft.Compute",
      ChargeType: "Refund",
      Frequency: "OneTime",
      PricingModel: "On Demand",
    }),
  ];
  return finalize("azure", "nimbus-azure-cost-details-sample.csv", "2023-12-01-preview", "https://learn.microsoft.com/en-us/azure/cost-management-billing/dataset-schema/cost-usage-details-ea", AZURE_HEADERS, rows);
}

function gcpExample(): CanonicalExample {
  const common = {
    billing_account_id: "012345-ABCDEF-678901",
    project_id: "nimbus-prod-001",
    project_name: "Nimbus Production",
    project_ancestry_numbers: "organizations/123456789/folders/987654321/projects/nimbus-prod-001",
    location_region: "us-central1",
    usage_start_time: "2026-07-01T00:00:00Z",
    usage_end_time: "2026-07-01T01:00:00Z",
    currency: "USD",
    cost_type: "regular",
  };
  const rows = [
    record(GCP_HEADERS, {
      ...common,
      service_id: "6F81-5844-456A",
      service_description: "Compute Engine",
      sku_id: "2E27-4F75-95CD",
      sku_description: "N2 Instance Core running in Americas",
      usage_amount: 400,
      usage_unit: "hour",
      cost: 42.5,
      x_list_cost: 42.5,
      x_effective_cost: 42.5,
      resource_global_name: "//compute.googleapis.com/projects/nimbus-prod-001/zones/us-central1-a/instances/api-01",
      tags: '[{"key":"environment","value":"production"}]',
    }),
    record(GCP_HEADERS, {
      ...common,
      service_id: "6F81-5844-456A",
      service_description: "Compute Engine",
      sku_id: "D973-5D65-BAB2",
      sku_description: "C3 Instance Core running in Americas",
      usage_amount: 250,
      usage_unit: "hour",
      cost: 17.5,
      credits_amount: -5,
      credits_type: "COMMITTED_USAGE_DISCOUNT_DOLLAR_BASE",
      x_credits: '[{"name":"Committed use discount","amount":-5,"type":"COMMITTED_USAGE_DISCOUNT_DOLLAR_BASE"}]',
      x_consumption_model_id: "7754-699E-0EBF",
      x_consumption_model_description: "Compute flexible CUD",
      x_subscription_instance_id: "cud-subscription-001",
      x_list_cost: 22.5,
      x_effective_cost: 17.5,
      resource_global_name: "//compute.googleapis.com/projects/nimbus-prod-001/zones/us-central1-a/instances/worker-02",
      tags: '[{"key":"environment","value":"production"}]',
    }),
    record(GCP_HEADERS, {
      ...common,
      service_id: "6F81-5844-456A",
      service_description: "Compute Engine",
      sku_id: "CREDIT-0001",
      sku_description: "Service credit",
      usage_amount: 0,
      usage_unit: "1",
      cost: -6.5,
      cost_type: "adjustment",
      credits_amount: -6.5,
      credits_type: "PROMOTION",
      x_credits: '[{"name":"Service credit","amount":-6.5,"type":"PROMOTION"}]',
      x_effective_cost: -6.5,
    }),
  ];
  return { ...finalize("gcp", "nimbus-gcp-standard-query-sample.csv", "Standard Usage Cost Export", "https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/standard-usage", GCP_HEADERS, rows), sql: GCP_SQL };
}

function focusExample(): CanonicalExample {
  const headers = focusSnapshot.concepts
    .filter((concept) => concept.dataset === "cost-and-usage")
    .map((concept) => concept.name);
  const common = {
    BillingAccountId: "123456789012",
    BillingAccountName: "Nimbus Example",
    BillingAccountType: "Enterprise",
    BillingCurrency: "USD",
    BillingPeriodStart: "2026-07-01T00:00:00Z",
    BillingPeriodEnd: "2026-08-01T00:00:00Z",
    ChargeFrequency: "Usage-Based",
    ChargePeriodStart: "2026-07-01T00:00:00Z",
    ChargePeriodEnd: "2026-07-01T01:00:00Z",
    HostProviderName: "Amazon Web Services",
    InvoiceIssuerName: "Amazon Web Services",
    ServiceProviderName: "Amazon Web Services",
    PricingCurrency: "USD",
    RegionId: "us-east-1",
    RegionName: "US East (N. Virginia)",
  };
  const rows = [
    record(headers, {
      ...common,
      BilledCost: 42.5,
      EffectiveCost: 42.5,
      ContractedCost: 42.5,
      ListCost: 42.5,
      ChargeCategory: "Usage",
      ChargeClass: "Regular",
      ChargeDescription: "m6i.large Linux usage",
      ConsumedQuantity: 400,
      ConsumedUnit: "Hour",
      PricingQuantity: 400,
      PricingUnit: "Hour",
      ResourceId: "arn:aws:ec2:us-east-1:123456789012:instance/i-0a11b22c33d44e55f",
      ResourceName: "api-01",
      ResourceType: "EC2 Instance",
      ServiceCategory: "Compute",
      ServiceName: "Amazon Elastic Compute Cloud",
      ServiceSubcategory: "Virtual Machines",
      SkuId: "SKU-EC2-M6I-LARGE",
      SkuPriceId: "price-ondemand-001",
    }),
    record(headers, {
      ...common,
      BilledCost: 17.5,
      EffectiveCost: 17.5,
      ContractedCost: 17.5,
      ListCost: 22.5,
      ChargeCategory: "Usage",
      ChargeClass: "Regular",
      ChargeDescription: "c7g.large Savings Plan covered usage",
      CommitmentDiscountCategory: "Spend",
      CommitmentDiscountId: "arn:aws:savingsplans::123456789012:savingsplan/sp-0abc1234",
      CommitmentDiscountName: "prod-compute-1y",
      CommitmentDiscountStatus: "Used",
      CommitmentDiscountType: "Savings Plan",
      ConsumedQuantity: 250,
      ConsumedUnit: "Hour",
      PricingQuantity: 250,
      PricingUnit: "Hour",
      ResourceId: "arn:aws:ec2:us-east-1:123456789012:instance/i-0123456789abcdef0",
      ResourceName: "worker-02",
      ResourceType: "EC2 Instance",
      ServiceCategory: "Compute",
      ServiceName: "Amazon Elastic Compute Cloud",
      ServiceSubcategory: "Virtual Machines",
      SkuId: "SKU-EC2-C7G-LARGE",
      SkuPriceId: "price-savingsplan-001",
    }),
    record(headers, {
      ...common,
      BilledCost: -6.5,
      EffectiveCost: -6.5,
      ContractedCost: -6.5,
      ListCost: -6.5,
      ChargeCategory: "Adjustment",
      ChargeClass: "Correction",
      ChargeDescription: "Service credit",
      ConsumedQuantity: 1,
      ConsumedUnit: "Count",
      PricingQuantity: 1,
      PricingUnit: "Count",
      ServiceCategory: "Compute",
      ServiceName: "Amazon Elastic Compute Cloud",
      ServiceSubcategory: "Virtual Machines",
      SkuId: "SKU-CREDIT",
    }),
  ];
  if (headers.length !== 65 || headers.includes("ProviderName") || !headers.includes("ServiceProviderName")) {
    throw new Error("FOCUS 1.4 catalog snapshot does not expose the expected 65-column CostAndUsage schema");
  }
  return finalize("focus", "nimbus-focus-1.4-sample.csv", "FOCUS 1.4 CostAndUsage", "https://focus.finops.org/focus-specification/v1-4/", headers, rows);
}

function finalize(
  provider: ExampleProvider,
  filename: string,
  sourceVersion: string,
  sourceUrl: string,
  headers: string[],
  rows: Record<string, string | number>[]
): CanonicalExample {
  if (rows.length !== 3) throw new Error(`${provider} example must contain exactly three rows`);
  return {
    provider,
    filename,
    sourceVersion,
    sourceUrl,
    headers,
    rows,
    csv: Papa.unparse({ fields: headers, data: rows.map((row) => headers.map((header) => row[header] ?? "")) }, { newline: "\n" }),
    expected: {
      physicalRows: 3,
      positiveUsageRows: 2,
      distinctDays: 1,
      findings: 0,
    },
  };
}

export function getCanonicalExample(provider: ExampleProvider): CanonicalExample {
  if (provider === "aws") return awsExample();
  if (provider === "azure") return azureExample();
  if (provider === "gcp") return gcpExample();
  return focusExample();
}

export function validateCanonicalExample(example: CanonicalExample): string[] {
  const warnings: string[] = [];
  if (example.rows.length !== 3) warnings.push("ROW_COUNT");
  if (new Set(example.headers).size !== example.headers.length) warnings.push("DUPLICATE_HEADERS");
  if (example.provider === "focus") {
    if (example.headers.length !== 65) warnings.push("FOCUS_COLUMN_COUNT");
    if (!example.headers.includes("ServiceProviderName")) warnings.push("FOCUS_SERVICE_PROVIDER_NAME");
    if (example.headers.includes("ProviderName")) warnings.push("FOCUS_RETIRED_PROVIDER_NAME");
  }
  if (example.provider === "azure" && example.headers.length !== 55) warnings.push("AZURE_COLUMN_COUNT");
  if (example.provider === "gcp" && !example.sql) warnings.push("GCP_SQL_MISSING");
  return warnings;
}
