import assert from "node:assert/strict";

const { parseCSVAutoDetect } = await import("../src/engine/parsers/index.ts");
const { calculateSavings } = await import("../src/engine/tools/calculate-savings.ts");
const { diagnoseUpload } = await import("../src/engine/validation/file-check.ts");

const aws = parseCSVAutoDetect(
  [
    "line_item_usage_start_date,line_item_product_code,product_servicecode,product_product_name,product_sku,line_item_usage_type,product_region,line_item_usage_account_id,line_item_resource_id,line_item_usage_amount,line_item_unblended_cost,line_item_net_unblended_cost,line_item_line_item_type,line_item_currency_code,pricing_unit,pricing_public_on_demand_cost,reservation_reservation_a_r_n,reservation_effective_cost",
    "2026-07-01T00:00:00Z,AmazonEC2,AmazonEC2,Amazon Elastic Compute Cloud,SKU-EC2,USE1-BoxUsage:m7i.large,us-east-1,123456789012,i-123,24,4.80,4.20,DiscountedUsage,USD,Hrs,6.00,arn:aws:ec2:ri/test,4.20",
  ].join("\n")
);
assert.equal(aws.sourceSchemaVersion, "AWS CUR 2.0");
assert.equal(aws.records.length, 1);
assert.equal(aws.records[0].cost, 4.2);
assert.equal(aws.records[0].billingIdentity.serviceId, "AmazonEC2");
assert.equal(aws.records[0].billingIdentity.skuId, "SKU-EC2");
assert.equal(aws.records[0].commitmentDiscountId, "arn:aws:ec2:ri/test");
assert.equal(aws.records[0].pricing.listCost, 6);

// CUR 2.0: cost_category is a JSON map, never a monetary column. Covered
// Savings Plan usage carries its accrual cost in
// savings_plan_savings_plan_effective_cost while the recurring fee is the
// cash-basis purchase of the same commitment and must be shown separately.
const awsSavingsPlanCsv = [
  "line_item_usage_start_date,line_item_product_code,product_servicecode,product_product_name,line_item_usage_type,product_region,line_item_usage_amount,line_item_unblended_cost,line_item_net_unblended_cost,line_item_line_item_type,savings_plan_savings_plan_effective_cost,savings_plan_savings_plan_a_r_n,cost_category",
  '2026-07-01T00:00:00Z,AmazonEC2,AmazonEC2,Amazon Elastic Compute Cloud,USE1-BoxUsage:m7i.large,us-east-1,24,0,0,SavingsPlanCoveredUsage,4.20,arn:aws:savingsplans::123:savingsplan/sp-1,"{""Environment"":""Production""}"',
  '2026-07-01T00:00:00Z,AmazonEC2,AmazonEC2,Amazon Elastic Compute Cloud,SavingsPlanRecurringFee,us-east-1,1,4.25,4.25,SavingsPlanRecurringFee,,arn:aws:savingsplans::123:savingsplan/sp-1,"{""Environment"":""Production""}"',
].join("\n");
const awsSavingsPlan = parseCSVAutoDetect(awsSavingsPlanCsv);
assert.equal(awsSavingsPlan.records.length, 1);
assert.equal(awsSavingsPlan.records[0].cost, 4.2);
assert.equal(awsSavingsPlan.records[0].effectiveCost, 4.2);
assert.equal(awsSavingsPlan.records[0].source.extensions.costCategories.includes("Production"), true);
assert.equal(awsSavingsPlan.diagnostics.unparsableAmountRows, 0);
assert.equal(awsSavingsPlan.diagnostics.commitmentPurchaseRows, 1);
assert.equal(awsSavingsPlan.diagnostics.commitmentPurchaseTotalUSD, 4.25);
const awsSavingsPlanDiagnosis = diagnoseUpload(awsSavingsPlanCsv, awsSavingsPlan);
assert.equal(
  awsSavingsPlanDiagnosis.dropped.some((item) => item.reason === "Importe no interpretable"),
  false
);
assert.equal(awsSavingsPlanDiagnosis.commitmentPurchasesExcludedUSD, 4.25);

// AWS Cost Explorer console downloads are transposed summaries: periods are
// rows and group values are dynamic currency-suffixed columns. They are valid
// inputs for spend exploration, but never for detailed optimization rules.
const awsCostExplorerService = [
  "Servicio,Glue($),Bedrock($),Costos totales($)",
  "Servicio en total,30,60,90",
  "2026-06-01,10,20,30",
  "2026-07-01,20,40,60",
].join("\n");
const awsCostExplorer = parseCSVAutoDetect(awsCostExplorerService);
assert.equal(awsCostExplorer.sourceSchemaVersion, "AWS Cost Explorer CSV summary");
assert.equal(awsCostExplorer.records.length, 4);
assert.equal(awsCostExplorer.records[0].source.extensions.analysisLevel, "summary");
assert.equal(awsCostExplorer.records[1].category, "ai-ml");
assert.equal(awsCostExplorer.diagnostics.summaryGranularity, "monthly");
assert.equal(awsCostExplorer.diagnostics.summaryGroupBy, "service");
const awsCostExplorerReport = calculateSavings(
  awsCostExplorer.records,
  false,
  awsCostExplorer.diagnostics,
  awsCostExplorer.schemaCoverage
);
assert.equal(awsCostExplorerReport.analysisLevel, "summary");
assert.equal(awsCostExplorerReport.totalCostUSD, 45);
assert.equal(awsCostExplorerReport.findings.length, 0);
assert.equal(awsCostExplorerReport.breakdownDimension, "Servicio");

const awsCostExplorerZeroCsv = [
  ",Costos totales($)",
  "Total,0",
  "2026-01-01,0",
  "2026-02-01,0",
].join("\n");
const awsCostExplorerZero = parseCSVAutoDetect(awsCostExplorerZeroCsv);
assert.equal(awsCostExplorerZero.records.length, 0);
assert.equal(awsCostExplorerZero.diagnostics.zeroCostRows, 2);
const zeroSummaryDiagnosis = diagnoseUpload(
  awsCostExplorerZeroCsv,
  awsCostExplorerZero
);
assert.equal(zeroSummaryDiagnosis.sourceProfile.kind, "aws-cost-explorer-summary");
assert.equal(zeroSummaryDiagnosis.sourceProfile.periodCount, 2);
assert.equal(zeroSummaryDiagnosis.dropped[0].reason, "Periodos o grupos con costo en $0");

for (const dimension of [
  "Cuenta vinculada",
  "Región",
  "Tipo de instancia",
  "Tipo de uso",
  "Grupo de tipo de uso",
  "Recurso",
  "Categoría de costos",
  "Etiqueta",
  "Operación de la API",
  "Zona de disponibilidad",
  "Plataforma",
  "Opción de compra",
  "Tenencia",
  "Motor de base de datos",
  "Entidad de facturación",
  "Entidad jurídica",
  "Tipo de cargo",
  "Cuenta del pagador",
]) {
  const fixture = [
    `${dimension},Grupo de prueba($),Costos totales($)`,
    `${dimension} en total,12.34,12.34`,
    "2026-07-01,12.34,12.34",
  ].join("\n");
  const result = parseCSVAutoDetect(fixture);
  assert.equal(result.detectedProvider, "aws", dimension);
  assert.equal(result.records.length, 1, dimension);
  assert.equal(result.records[0].cost, 12.34, dimension);
}

const awsCostExplorerHourly = parseCSVAutoDetect([
  "Service,Amazon EC2(USD),Net amortized costs(USD)",
  "Service total,3.50,3.50",
  "2026-07-01T01:00:00Z,1.50,1.50",
  "2026-07-01T02:00:00Z,2.00,2.00",
].join("\n"));
assert.equal(awsCostExplorerHourly.diagnostics.summaryGranularity, "hourly");
assert.equal(awsCostExplorerHourly.records.length, 2);

const awsCostExplorerForecast = parseCSVAutoDetect([
  ",Total costs($)",
  "Total,25",
  "2099-01-01,25",
].join("\n"));
assert.equal(awsCostExplorerForecast.records.length, 0);
assert.equal(awsCostExplorerForecast.diagnostics.forecastRows, 1);
assert.equal(awsCostExplorerForecast.diagnostics.forecastTotalUSD, 25);

const awsCostExplorerUsageUnits = parseCSVAutoDetect([
  "Servicio,S3($),Costos totales($),S3(Requests),Uso total(Requests)",
  "Servicio en total,0,0,5,5",
  "2026-07-19,0,0,5,5",
].join("\n"));
assert.equal(awsCostExplorerUsageUnits.records.length, 0);
assert.equal(awsCostExplorerUsageUnits.diagnostics.zeroCostRows, 1);
assert.equal(awsCostExplorerUsageUnits.diagnostics.summaryUsageValueCount, 1);
assert.equal(awsCostExplorerUsageUnits.diagnostics.summaryUsageTotal, 5);
assert.equal(awsCostExplorerUsageUnits.diagnostics.summaryUsageUnit, "Requests");

const azure = parseCSVAutoDetect(
  [
    "Date,MeterCategory,MeterSubCategory,MeterName,MeterId,ServiceName,ServiceId,ServiceFamily,ConsumedService,ProductId,ProductName,SkuId,ResourceLocation,ResourceId,SubscriptionId,CostInBillingCurrency,BillingCurrencyCode,Quantity,UnitOfMeasure,EffectivePrice,PayGPrice,PricingModel,BenefitId,InvoiceId,BillingProfileId",
    "2026-07-01,Storage,Azure Files,Premium File Shares,METER-1,Storage,SERVICE-1,Storage,Microsoft.Storage,PRODUCT-1,Azure Files Premium,SKU-1,eastus,/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/a/fileServices/default,sub,32.50,USD,500,1 GiB/Month,0.065,0.08,SavingsPlan,BENEFIT-1,INV-1,PROFILE-1",
  ].join("\n")
);
assert.equal(azure.records[0].category, "file-storage");
assert.equal(azure.records[0].billingIdentity.productId, "PRODUCT-1");
assert.equal(azure.records[0].billingIdentity.meterId, "METER-1");
assert.equal(azure.records[0].pricing.effectiveUnitPrice, 0.065);
assert.equal(azure.records[0].commitmentDiscountId, "BENEFIT-1");

// Azure Cost Analysis downloads are configurable summaries, distinct from
// Cost Details. They can validate allocation and time evolution but must never
// trigger resource-utilisation rules.
const azureCostAnalysisCsv = [
  "Month,Service name,Resource group name,Cost (USD),Currency",
  "2026-06,Virtual Machines,rg-prod,410.25,USD",
  "2026-07,Azure OpenAI,rg-ai,188.70,USD",
].join("\n");
const azureCostAnalysis = parseCSVAutoDetect(azureCostAnalysisCsv);
assert.equal(azureCostAnalysis.sourceSchemaVersion, "Azure Cost Analysis CSV summary");
assert.equal(azureCostAnalysis.diagnostics.sourceKind, "azure-cost-analysis-summary");
assert.equal(azureCostAnalysis.records.length, 2);
assert.equal(azureCostAnalysis.records[1].category, "ai-ml");
assert.equal(azureCostAnalysis.diagnostics.summaryGranularity, "monthly");
const azureSummaryReport = calculateSavings(
  azureCostAnalysis.records,
  false,
  azureCostAnalysis.diagnostics,
  azureCostAnalysis.schemaCoverage
);
assert.equal(azureSummaryReport.analysisLevel, "summary");
assert.equal(azureSummaryReport.findings.length, 0);
assert.equal(azureSummaryReport.totalCostUSD, 299.48);
assert.equal(azureSummaryReport.aiSpendSummary.projected30DayCostUSD, 188.7);
assert.equal(azureSummaryReport.aiSpendSummary.grossSpendPercentage, 63);
assert.equal(
  diagnoseUpload(azureCostAnalysisCsv, azureCostAnalysis).sourceProfile.provider,
  "Azure"
);
for (const [dimension, value] of [
  ["Service name", "Azure Kubernetes Service"],
  ["Resource group name", "rg-platform"],
  ["Subscription name", "Production"],
  ["Resource type", "microsoft.compute/virtualmachines"],
  ["Resource", "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/vm-2"],
]) {
  const variant = parseCSVAutoDetect([
    `Date,${dimension},Cost (USD),Currency`,
    `2026-07-01,${value},42.50,USD`,
  ].join("\n"));
  assert.equal(variant.diagnostics.sourceKind, "azure-cost-analysis-summary", dimension);
  assert.equal(variant.records.length, 1, dimension);
  assert.equal(variant.records[0].cost, 42.5, dimension);
}
const azureLocationSummary = parseCSVAutoDetect([
  "Date,Service name,Location,Cost (USD),Currency",
  "2026-07-01,Virtual Machines,eastus2,42.50,USD",
].join("\n"));
assert.equal(azureLocationSummary.records[0].region, "eastus2");

// Current Azure Cost Details 2023-12-01-preview partner/subscription shape:
// ResourceGroupName and the full Actual/Amortized commitment/pricing vocabulary.
const azurePartnerCostDetails = parseCSVAutoDetect([
  "billingAccountName,billingPeriodStartDate,date,serviceFamily,consumedService,meterId,meterName,meterCategory,meterSubCategory,meterRegion,ProductId,ProductName,SubscriptionId,subscriptionName,publisherType,resourceGroupName,ResourceId,resourceLocation,location,effectivePrice,quantity,unitOfMeasure,chargeType,billingCurrency,pricingCurrency,costInBillingCurrency,costInUsd,PayGPrice,frequency,term,reservationId,PricingModel,unitPrice,benefitId,benefitName,provider",
  "Contoso,2026-07-01,2026-07-02,Compute,Microsoft.Compute,METER-VM,D2as v5,Virtual Machines,Dv5 Series,US East,PROD-VM,Virtual Machines,SUB-1,Production,Microsoft,rg-prod,/subscriptions/SUB-1/resourceGroups/rg-prod/providers/Microsoft.Compute/virtualMachines/vm-1,eastus,US East,0.081,24,1 Hour,Usage,USD,USD,1.944,1.944,0.096,UsageBased,12 months,RES-1,Reservation,0.081,,,Azure",
].join("\n"));
assert.equal(azurePartnerCostDetails.sourceSchemaVersion, "Azure Cost Details 2023-12-01-preview");
assert.equal(azurePartnerCostDetails.records[0].resourceId.endsWith("/vm-1"), true);
assert.equal(azurePartnerCostDetails.records[0].cost, 1.944);
assert.equal(azurePartnerCostDetails.records[0].commitmentDiscountId, "RES-1");
assert.equal(azurePartnerCostDetails.records[0].pricing.billingCurrency, "USD");

const gcp = parseCSVAutoDetect(
  [
    'usage_start_time,service.id,service.description,sku.id,sku.description,project.id,location.region,cost,currency,usage.amount,credits.amount,credits.type,x_Credits,x_ConsumptionModelId,x_ConsumptionModelDescription,x_SubscriptionInstanceId',
    '2026-07-01T00:00:00Z,services/vertex,Vertex AI,sku/gemini,Gemini input tokens,project-1,us-central1,120.00,USD,1000000,-24.00,COMMITTED_USAGE_DISCOUNT,"[{""type"":""COMMITTED_USAGE_DISCOUNT"",""amount"":-24}]",7754-699E-0EBF,1 year commitment,sub-instance-1',
  ].join("\n")
);
assert.equal(gcp.records[0].category, "ai-ml");
assert.equal(gcp.records[0].billingIdentity.serviceId, "services/vertex");
assert.equal(gcp.records[0].commitmentDiscountId, "sub-instance-1");
assert.equal(gcp.records[0].source.extensions.creditAmount, -24);
assert.equal(gcp.diagnostics.creditTotalUSD, 24);

// Official BigQuery Detailed schema flattened to CSV, including the fields
// added for resource identity, consumption models, price evidence and CUDs.
const gcpDetailed = parseCSVAutoDetect([
  "billing_account_id,invoice.month,service.id,service.description,sku.id,sku.description,project.id,project.number,project.name,project.ancestry_numbers,location.location,location.region,location.zone,usage_start_time,usage_end_time,cost,currency,usage.amount,usage.unit,resource.global_name,resource.name,subscription.instance_id,consumption_model.id,consumption_model.description,price.list_price,price.effective_price,price.unit,cost_at_list_consumption_model,cost_at_effective_price_default",
  "ABCDEF-123456-ABCDEF,202607,6F81-5844-456A,Compute Engine,2E27-4F75-95CD,N2 Instance Core running in Americas,prod-project,123456789,Production,/organizations/1/folders/2/,us-central1,us-central1,us-central1-a,2026-07-01T00:00:00Z,2026-07-01T01:00:00Z,12.40,USD,24,hour,//compute.googleapis.com/projects/prod-project/zones/us-central1-a/instances/vm-1,vm-1,cud-sub-1,7754-699E-0EBF,Compute Flexible CUD - 1 Year,0.775,0.516,GiBy.h,18.60,12.40",
].join("\n"));
assert.equal(gcpDetailed.sourceSchemaVersion, "GCP BigQuery Detailed Usage Cost Export");
assert.equal(gcpDetailed.records[0].resourceId.includes("instances/vm-1"), true);
assert.equal(gcpDetailed.records[0].commitmentDiscountId, "cud-sub-1");
assert.equal(gcpDetailed.records[0].pricing.listUnitPrice, 0.775);
assert.equal(gcpDetailed.records[0].pricing.effectiveUnitPrice, 0.516);
const gcpThreeDecimalCost = parseCSVAutoDetect([
  "billing_account_id,service.description,sku.description,project.id,usage_start_time,cost,currency",
  "ABCDEF-123456-ABCDEF,Cloud Run,CPU allocation,prod-project,2026-07-01T00:00:00Z,1.944,USD",
].join("\n"));
assert.equal(gcpThreeDecimalCost.records[0].cost, 1.944);

// GCP Reports CSV: configurable group-by dimensions plus savings columns.
const gcpReportsCsv = [
  "Billing account name,Contoso Cloud",
  "Start date,2026-06-01",
  "End date,2026-07-31",
  "",
  "Month,Service description,Service ID,List cost ($),Negotiated savings ($),Savings programs ($),Other savings ($),Unrounded subtotal ($),Subtotal ($)",
  "2026-06,Compute Engine,6F81-5844-456A,500.00,-25.00,-80.00,-5.00,390.00,390.00",
  "2026-07,Vertex AI,95FF-2EF5-5EA1,220.00,-10.00,0.00,-2.00,208.00,208.00",
].join("\n");
const gcpReports = parseCSVAutoDetect(gcpReportsCsv);
assert.equal(gcpReports.sourceSchemaVersion, "GCP Cost table/Reports CSV summary");
assert.equal(gcpReports.diagnostics.sourceKind, "gcp-console-summary");
assert.equal(gcpReports.records.length, 2);
assert.equal(gcpReports.records[1].category, "ai-ml");
assert.equal(gcpReports.diagnostics.creditTotalUSD, 122);
const gcpReportsAudit = calculateSavings(gcpReports.records);
assert.equal(gcpReportsAudit.findings.length, 0);
assert.equal(gcpReportsAudit.aiSpendSummary.projected30DayCostUSD, 208);
assert.equal(gcpReportsAudit.aiSpendSummary.grossSpendPercentage, 69.6);
const gcpReportsDiagnosis = diagnoseUpload(gcpReportsCsv, gcpReports);
assert.equal(gcpReportsDiagnosis.sourceProfile.provider, "GCP");
assert.equal(gcpReportsDiagnosis.nextSteps.some((step) => step.includes("CUR (")), false);
for (const headersAndRow of [
  [
    "Date,Project name,Project ID,Cost ($),Savings programs ($),Other savings ($),Unrounded subtotal ($),Subtotal ($)",
    "2026-07-01,Production,prod-project,50,-5,-1,44,44",
  ],
  [
    "Month,Service description,Service ID,Cost ($),Savings programs ($),Other savings ($),Unrounded subtotal ($),Subtotal ($)",
    "2026-07,Cloud Run,SERVICE-RUN,30,0,-2,28,28",
  ],
  [
    "Month,Service description,SKU description,SKU ID,Cost ($),Savings programs ($),Other savings ($),Unrounded subtotal ($),Subtotal ($),Usage amount,Usage unit",
    "2026-07,Compute Engine,N2 Core,SKU-N2,80,-10,0,70,70,240,hour",
  ],
  [
    "Month,Billing account name,Billing account ID,Cost ($),Savings programs ($),Other savings ($),Unrounded subtotal ($),Subtotal ($)",
    "2026-07,Contoso,ABCDEF-123456-ABCDEF,100,-15,0,85,85",
  ],
  [
    "Month,Region,Cost ($),Savings programs ($),Other savings ($),Unrounded subtotal ($),Subtotal ($)",
    "2026-07,us-central1,60,0,-3,57,57",
  ],
  [
    "Month,Label,Cost ($),Savings programs ($),Other savings ($),Unrounded subtotal ($),Subtotal ($)",
    "2026-07,environment:prod,75,-5,0,70,70",
  ],
]) {
  const variant = parseCSVAutoDetect(headersAndRow.join("\n"));
  assert.equal(variant.diagnostics.sourceKind, "gcp-console-summary", headersAndRow[0]);
  assert.equal(variant.records.length, 1, headersAndRow[0]);
}

// GCP Cost table CSV adds invoice metadata before the table and lets users
// select/group columns. Nimbus must find the embedded header and reconcile the
// flat positive, tax and adjustment lines without treating it as BigQuery data.
const gcpCostTableCsv = [
  "Billing account ID,ABCDEF-123456-ABCDEF",
  "Invoice month,202607",
  "Invoice total,127.40",
  "Currency,USD",
  "",
  "Project ID,Service description,Service ID,SKU description,SKU ID,Consumption model description,Consumption model ID,Cost type,Unrounded cost ($),Cost ($)",
  "prod-project,Compute Engine,6F81-5844-456A,N2 Instance Core,SKU-1,Default,7754-699E-0EBF,regular,120.00,120.00",
  "prod-project,Compute Engine,6F81-5844-456A,Committed use discount,SKU-CUD,Compute Flexible CUD - 1 Year,CUD-1,adjustment,-5.00,-5.00",
  "prod-project,Tax,TAX,State sales tax,TAX-1,Default,DEFAULT,tax,7.40,7.40",
].join("\n");
const gcpCostTable = parseCSVAutoDetect(gcpCostTableCsv);
assert.equal(gcpCostTable.records.length, 1);
assert.equal(gcpCostTable.records[0].date, "2026-07-01");
assert.equal(gcpCostTable.diagnostics.creditTotalUSD, 5);
assert.equal(gcpCostTable.diagnostics.taxTotalUSD, 7.4);
assert.equal(gcpCostTable.diagnostics.sourceKind, "gcp-console-summary");

const focusFile = parseCSVAutoDetect(
  [
    "BilledCost,EffectiveCost,ChargePeriodStart,ChargePeriodEnd,BillingAccountId,BillingCurrency,ChargeCategory,ServiceName,ServiceProviderName,ServiceCategory,ServiceSubcategory,ConsumedQuantity,ConsumedUnit,ContractedCost,ListCost,PricingCategory,PricingUnit,SkuId,SkuPriceId,ResourceId",
    "10,8,2026-07-01T00:00:00Z,2026-07-02T00:00:00Z,acct,USD,Usage,Elastic File System,AWS,Storage,File Storage,100,GB-Month,8,10,Committed,GB-Month,sku-efs,price-efs,fs-123",
  ].join("\n")
);
assert.equal(focusFile.datasetType, "cost-and-usage");
assert.equal(focusFile.records[0].category, "file-storage");
assert.equal(focusFile.records[0].pricing.contractedCost, 8);
assert.equal(focusFile.records[0].billingIdentity.skuPriceId, "price-efs");

const billingPeriod = parseCSVAutoDetect(
  [
    "InvoiceIssuerName,BillingPeriodStart,BillingPeriodEnd,BillingPeriodStatus,BillingPeriodCreated,BillingPeriodLastUpdated",
    "Example Cloud,2026-07-01T00:00:00Z,2026-08-01T00:00:00Z,Closed,2026-07-01T00:00:00Z,2026-08-03T00:00:00Z",
  ].join("\n")
);
assert.equal(billingPeriod.datasetType, "billing-period");
assert.equal(billingPeriod.records.length, 0);
assert.equal(billingPeriod.supplementalRecords.length, 1);

const commitment = parseCSVAutoDetect(
  [
    "ContractCommitmentId,ContractCommitmentPeriodStart,ContractCommitmentPeriodEnd,ContractId,ServiceProviderName,ContractCommitmentCategory,ContractCommitmentType,ContractCommitmentLifecycleStatus,ContractCommitmentQuantity,ContractCommitmentUnit,ContractCommitmentCost,BillingCurrency",
    "cc-1,2026-01-01T00:00:00Z,2027-01-01T00:00:00Z,c-1,AWS,Spend,Savings Plan,Active,1,Year,2400,USD",
  ].join("\n")
);
assert.equal(commitment.datasetType, "contract-commitment");
assert.equal(commitment.supplementalRecords[0].cost, 2400);

const invoice = parseCSVAutoDetect(
  [
    "InvoiceDetailId,InvoiceId,InvoiceIssuerName,BilledCost,BillingCurrency,ChargeCategory,InvoiceDetailDescription,InvoiceIssueDate,PaymentDueDate,InvoiceIssueStatus",
    "detail-1,invoice-1,Example Cloud,100,USD,Usage,Cloud usage,2026-08-01,2026-08-31,Issued",
  ].join("\n")
);
assert.equal(invoice.datasetType, "invoice-detail");
assert.equal(invoice.supplementalRecords[0].billedCost, 100);

const report = calculateSavings(
  aws.records,
  aws.isFocus,
  aws.diagnostics,
  aws.schemaCoverage
);
assert.equal(report.billingCoverage.deterministic, true);
assert.equal(report.billingCoverage.datasetType, "cost-and-usage");
assert.ok(report.billingCoverage.coveragePercentage > 50);

console.log("PASS billing moderno: AWS, Azure y GCP detallados/resúmenes; FOCUS 1.4 y cobertura determinística.");
