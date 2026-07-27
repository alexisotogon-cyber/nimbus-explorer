import Papa from "papaparse";
import { NormalizedCostRecord, CostCategory, CostRecord } from "../types";
import {
  ParseDiagnostics,
  coerceAmount,
  coerceQuantity,
  detectDateOrder,
  noteDateOrder,
  detectDecimalSeparator,
  noteDecimalSeparator,
  normalizeDate,
  DATE_ORDER_SAMPLE_SIZE,
} from "./coerce";

/**
 * AWS Cost Explorer / CUR CSV Parser.
 * Detects column formats and normalizes to NormalizedCostRecord.
 */

const AWS_COLUMN_MAPPINGS: Record<string, string> = {
  "product": "productJson",
  "resource_tags": "resourceTags",
  "cost_category": "costCategories",
  "bill/billingperiodstartdate": "date",
  "bill_billing_period_start_date": "date",
  "bill/payeraccountid": "payerAccountId",
  "bill_payer_account_id": "payerAccountId",
  "bill/invoiceid": "invoiceId",
  "bill_invoice_id": "invoiceId",
  "lineitem/usagestartdate": "date",
  "line_item_usage_start_date": "date",
  "lineitem/productcode": "service",
  "line_item_product_code": "serviceCode",
  "product/productname": "service",
  "product_product_name": "service",
  "product/servicecode": "serviceCode",
  "product_servicecode": "serviceCode",
  "product/sku": "skuId",
  "product_sku": "skuId",
  "lineitem/usagetype": "usageType",
  "line_item_usage_type": "usageType",
  "product/usagetype": "usageType",
  "product_usagetype": "usageType",
  "product/region": "region",
  "product_region": "region",
  "lineitem/availabilityzone": "region",
  "line_item_availability_zone": "region",
  "lineitem/usageaccountid": "accountId",
  "line_item_usage_account_id": "accountId",
  "lineitem/resourceid": "resourceId",
  "line_item_resource_id": "resourceId",
  "lineitem/usageamount": "usageQuantity",
  "line_item_usage_amount": "usageQuantity",
  "lineitem/unblendedcost": "cost",
  "line_item_unblended_cost": "cost",
  "lineitem/netunblendedcost": "netCost",
  "line_item_net_unblended_cost": "netCost",
  "lineitem/lineitemtype": "chargeType",
  "line_item_line_item_type": "chargeType",
  "lineitem/currencycode": "billingCurrency",
  "line_item_currency_code": "billingCurrency",
  "pricing/unit": "pricingUnit",
  "pricing_unit": "pricingUnit",
  "pricing/publicondemandcost": "listCost",
  "pricing_public_on_demand_cost": "listCost",
  "pricing/publicondemandrate": "listUnitPrice",
  "pricing_public_on_demand_rate": "listUnitPrice",
  "reservation/reservationarn": "reservationId",
  "reservation_reservation_a_r_n": "reservationId",
  "reservation/effectivecost": "reservationEffectiveCost",
  "reservation_effective_cost": "reservationEffectiveCost",
  "reservation/neteffectivecost": "reservationNetEffectiveCost",
  "reservation_net_effective_cost": "reservationNetEffectiveCost",
  "savingsplan/savingsplanarn": "savingsPlanId",
  "savings_plan_savings_plan_a_r_n": "savingsPlanId",
  "savingsplan/savingsplaneffectivecost": "savingsPlanEffectiveCost",
  "savings_plan_savings_plan_effective_cost": "savingsPlanEffectiveCost",
  "savingsplan/netsavingsplaneffectivecost": "savingsPlanNetEffectiveCost",
  "savings_plan_net_savings_plan_effective_cost": "savingsPlanNetEffectiveCost",
  "discount/totaldiscount": "totalDiscount",
  "discount_total_discount": "totalDiscount",
  date: "date",
  service: "service",
  "usage type": "usageType",
  usagetype: "usageType",
  region: "region",
  "linked account": "accountId",
  accountid: "accountId",
  "usage quantity": "usageQuantity",
  usagequantity: "usageQuantity",
  cost: "cost",
  unblendedcost: "cost",
  "unblended cost": "cost",
  "charge type": "chargeType",
  chargetype: "chargeType",
  resourceid: "resourceId",
  "resource id": "resourceId",
};

function parseStringMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key.toLowerCase(), String(item ?? "")])
    );
  } catch {
    return {};
  }
}

/**
 * Categorize an AWS usage type into a canonical CostCategory.
 */
function categorizeAWS(service: string, usageType: string): CostCategory {
  const svc = service.toLowerCase();
  const usage = usageType.toLowerCase();

  if (
    svc.includes("bedrock") ||
    svc.includes("sagemaker") ||
    svc.includes("machine learning") ||
    svc.includes("comprehend") ||
    svc.includes("rekognition") ||
    svc.includes("textract") ||
    svc.includes("lex") ||
    svc.includes("polly")
  ) {
    return "ai-ml";
  }
  if (svc.includes("elastic file system") || svc.includes("efs") || svc.includes("fsx")) {
    return "file-storage";
  }

  if (usage.includes("natgateway")) return "nat";
  if (
    usage.includes("elasticip") ||
    usage.includes("idleaddress") ||
    usage.includes("publicipv4")
  ) {
    return "ip-address";
  }
  if (usage.includes("ebs:snapshot") || usage.includes("snapshotusage")) return "snapshot";
  if (usage.includes("ebs:volume") || usage.includes("volumeusage")) return "block-storage";
  if (usage.includes("timedstorage") || svc.includes("s3")) return "object-storage";

  // Managed data services BEFORE the generic compute usage types. RDS bills its
  // instances as "InstanceUsage:db.t3.medium" and ElastiCache as
  // "NodeUsage:cache.m5.large": with the compute check first, every RDS instance
  // was filed as "compute" and every ElastiCache node fell through to "other",
  // so the database rules never saw the spend they exist to analyse.
  if (
    svc.includes("rds") ||
    svc.includes("relational database") ||
    svc.includes("aurora") ||
    svc.includes("database") ||
    svc.includes("dynamodb") ||
    svc.includes("elasticache") ||
    svc.includes("memorydb") ||
    svc.includes("documentdb") ||
    svc.includes("neptune") ||
    svc.includes("redshift") ||
    svc.includes("timestream") ||
    svc.includes("keyspaces")
  ) {
    return "database";
  }
  if (svc.includes("lambda") || svc.includes("fargate")) return "serverless";

  if (usage.includes("boxusage") || usage.includes("instanceusage") || usage.includes("nodeusage")) {
    return "compute";
  }
  if (usage.includes("dataprocessing") || usage.includes("datatransfer") || usage.includes("-bytes")) return "network-egress";
  return "other";
}

/**
 * Detect if a CSV is an AWS Cost Explorer export.
 */
export function isAWSFormat(headers: string[]): boolean {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  const awsIndicators = [
    "lineitem/unblendedcost",
    "lineitem/productcode",
    "product/productname",
    "unblendedcost",
    "unblended cost",
  ];
  // Check for at least one AWS-specific header
  return awsIndicators.some((ind) => normalized.includes(ind)) ||
    (normalized.includes("service") && (normalized.includes("cost") || normalized.includes("unblendedcost")));
}

/**
 * Parse AWS Cost Explorer CSV into NormalizedCostRecords.
 *
 * `diagnostics` is optional; when supplied it accumulates how many rows were
 * dropped for an unreadable amount or date.
 */
export function parseAWSCSV(
  csvContent: string,
  diagnostics?: ParseDiagnostics
): NormalizedCostRecord[] {
  const result = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim().toLowerCase(),
  });

  if (result.errors.length > 0) {
    const critical = result.errors.filter(
      (e) => e.type === "FieldMismatch" || e.type === "Quotes"
    );
    if (critical.length > 0) {
      throw new Error(`Error parsing AWS CSV: ${critical.map((e) => e.message).join("; ")}`);
    }
  }

  const records: NormalizedCostRecord[] = [];

  // Map columns first so the date-order decision can be made once over the whole
  // file rather than row by row (see detectDateOrder).
  const mappedRows: Record<string, string>[] = (result.data as Record<string, string>[]).map(
    (row) => {
      const mapped: Record<string, string> = {};
      for (const [csvCol, value] of Object.entries(row)) {
        const normalizedCol = csvCol.toLowerCase().trim();
        const targetField = AWS_COLUMN_MAPPINGS[normalizedCol];
        if (targetField) {
          mapped[targetField] = value?.trim() || "";
        }
      }
      const product = parseStringMap(mapped.productJson);
      mapped.serviceCode ||= product.servicecode || product.productcode || "";
      mapped.service ||= product.productname || product.servicename || "";
      mapped.skuId ||= product.sku || "";
      mapped.usageType ||= product.usagetype || "";
      mapped.region ||= product.region || product.regioncode || "";
      return mapped;
    }
  );

  const dateOrder = detectDateOrder(
    mappedRows.slice(0, DATE_ORDER_SAMPLE_SIZE).map((r) => r.date)
  );
  noteDateOrder(diagnostics, dateOrder);

  // Same file-level-not-per-row resolution as dates, for the exactly-3-digit
  // ambiguous case in coerceAmount (see coerce.ts rule 9).
  const decimalSeparator = detectDecimalSeparator(
    mappedRows
      .slice(0, DATE_ORDER_SAMPLE_SIZE)
      .flatMap((r) => [
        r.netCost,
        r.cost,
        r.reservationNetEffectiveCost,
        r.reservationEffectiveCost,
        r.savingsPlanNetEffectiveCost,
        r.savingsPlanEffectiveCost,
      ])
  );
  noteDecimalSeparator(diagnostics, decimalSeparator);
  if (diagnostics) diagnostics.totalRows = mappedRows.length;

  // Unlike Azure/GCP, AWS's own lineitem/LineItemType column already carries
  // real commitment values (DiscountedUsage, RIFee, SavingsPlanCoveredUsage...)
  // when the source file has it — the column just has to be present.
  const headers = (result.meta.fields || []).map((h) => h.toLowerCase().trim());
  if (diagnostics) {
    diagnostics.commitmentSignalAvailable =
      headers.includes("lineitem/lineitemtype") ||
      headers.includes("line_item_line_item_type") ||
      headers.includes("chargetype") ||
      headers.includes("charge type");
  }

  for (const mapped of mappedRows) {
    const lineItemType = (mapped.chargeType || "").toLowerCase().trim();
    const netUnblendedCost = coerceAmount(
      mapped.netCost,
      decimalSeparator.separator ?? undefined
    );
    const unblendedCost = coerceAmount(
      mapped.cost,
      decimalSeparator.separator ?? undefined
    );
    const reservationEffectiveCost =
      coerceAmount(
        mapped.reservationNetEffectiveCost,
        decimalSeparator.separator ?? undefined
      ) ??
      coerceAmount(
        mapped.reservationEffectiveCost,
        decimalSeparator.separator ?? undefined
      );
    const savingsPlanEffectiveCost =
      coerceAmount(
        mapped.savingsPlanNetEffectiveCost,
        decimalSeparator.separator ?? undefined
      ) ??
      coerceAmount(
        mapped.savingsPlanEffectiveCost,
        decimalSeparator.separator ?? undefined
      );

    // CUR represents commitment spend twice: once as the recurring/upfront fee
    // and again allocated to the usage it covered. The analysis uses the
    // effective (accrual) amount on covered usage and reports the cash-basis fee
    // separately, otherwise Savings Plans and Reservations are double-counted.
    const isCommitmentPurchase =
      lineItemType === "savingsplanrecurringfee" ||
      lineItemType === "savingsplanupfrontfee" ||
      lineItemType === "rifee";
    if (isCommitmentPurchase) {
      const purchaseCost = netUnblendedCost ?? unblendedCost;
      if (diagnostics) {
        diagnostics.commitmentPurchaseRows++;
        diagnostics.commitmentPurchaseTotalUSD += Math.abs(purchaseCost ?? 0);
      }
      continue;
    }

    // A covered-usage line normally has UnblendedCost = 0. Its actual
    // period cost lives in the provider's effective-cost column.
    const cost =
      lineItemType === "savingsplancoveredusage" && savingsPlanEffectiveCost !== null
        ? savingsPlanEffectiveCost
        : lineItemType === "discountedusage" && reservationEffectiveCost !== null
          ? reservationEffectiveCost
          : netUnblendedCost ?? unblendedCost;
    if (cost === null) {
      if (diagnostics && (mapped.cost ?? "").trim() !== "") diagnostics.unparsableAmountRows++;
      continue;
    }
    // lineItem/LineItemType: Tax, Credit and Refund are excluded from the waste
    // analysis on purpose, but the amounts are now accounted for instead of
    // vanishing into `cost <= 0` (see ParseDiagnostics.creditRows).
    if (lineItemType === "tax") {
      if (diagnostics) {
        diagnostics.taxRows++;
        diagnostics.taxTotalUSD += Math.abs(cost);
      }
      continue;
    }
    if (lineItemType === "credit" || lineItemType === "refund" || cost < 0) {
      if (diagnostics) {
        diagnostics.creditRows++;
        diagnostics.creditTotalUSD += Math.abs(cost);
      }
      continue;
    }
    if (cost <= 0 || (!mapped.service && !mapped.serviceCode)) continue;

    const date = normalizeDate(mapped.date, dateOrder.order);
    if (date === null) {
      if (diagnostics) diagnostics.unparsableDateRows++;
      continue;
    }

    const usageType = mapped.usageType || "Unknown";
    const service = mapped.service || mapped.serviceCode || "Unknown";
    const commitmentDiscountId = mapped.reservationId || mapped.savingsPlanId || "";

    records.push({
      provider: "aws",
      category: categorizeAWS(service, usageType),
      nativeService: service,
      nativeUsageType: usageType,
      region: mapped.region || "us-east-1",
      date,
      cost,
      // Signal that this row was allocated on an accrual basis. The financial
      // reconciliation uses this to explain why the separate commitment fee
      // must not be added to the same total.
      effectiveCost:
        lineItemType === "savingsplancoveredusage" ||
        lineItemType === "discountedusage"
          ? cost
          : undefined,
      quantity: coerceQuantity(mapped.usageQuantity, diagnostics),
      accountId: mapped.accountId || "",
      chargeType: mapped.chargeType || "Usage",
      commitmentDiscountId: commitmentDiscountId || undefined,
      resourceId: mapped.resourceId || undefined,
      billingIdentity: {
        serviceId: mapped.serviceCode || undefined,
        skuId: mapped.skuId || undefined,
        invoiceId: mapped.invoiceId || undefined,
      },
      pricing: {
        billingCurrency: mapped.billingCurrency || undefined,
        pricingCategory: mapped.chargeType || undefined,
        unit: mapped.pricingUnit || undefined,
        listCost: coerceAmount(mapped.listCost, decimalSeparator.separator ?? undefined) ?? undefined,
        listUnitPrice:
          coerceAmount(mapped.listUnitPrice, decimalSeparator.separator ?? undefined) ?? undefined,
        contractedCost: reservationEffectiveCost ?? savingsPlanEffectiveCost ?? undefined,
      },
      source: {
        datasetType: "cost-and-usage",
        schemaVersion: headers.some((header) => header.startsWith("line_item_"))
          ? "CUR 2.0"
          : "CUR/Cost Explorer",
        catalogSnapshot: "aws-services.json",
        extensions: {
          payerAccountId: mapped.payerAccountId || "",
          totalDiscount:
            coerceAmount(mapped.totalDiscount, decimalSeparator.separator ?? undefined) ?? 0,
          resourceTags: mapped.resourceTags || "",
          costCategories: mapped.costCategories || "",
        },
      },
    });
  }

  return records;
}

/**
 * Convert legacy CostRecord[] to NormalizedCostRecord[] (for aws-connector.ts compat).
 */
export function convertLegacyRecords(records: CostRecord[]): NormalizedCostRecord[] {
  return records
    .filter((r) => r.unblendedCost > 0)
    .map((r) => ({
      provider: "aws" as const,
      category: categorizeAWS(r.service, r.usageType),
      nativeService: r.service,
      nativeUsageType: r.usageType,
      region: r.region,
      date: r.date,
      cost: r.unblendedCost,
      quantity: r.usageQuantity,
      accountId: r.accountId,
      chargeType: r.chargeType,
    }));
}
