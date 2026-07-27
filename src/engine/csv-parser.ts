/**
 * Legacy CSV parser — delegates to new multi-cloud parsers.
 * Kept for backward compatibility with imports that reference this file.
 */

import { CostRecord } from "./types";
import { parseCSVAutoDetect } from "./parsers";

/**
 * @deprecated Use parseCSVAutoDetect from ./parsers instead.
 * This function converts the result back to legacy CostRecord format.
 */
export function parseCostExplorerCSV(csvContent: string): CostRecord[] {
  const { records } = parseCSVAutoDetect(csvContent);

  return records.map((r) => ({
    date: r.date,
    service: r.nativeService,
    usageType: r.nativeUsageType,
    region: r.region,
    accountId: r.accountId || "",
    usageQuantity: r.quantity,
    unblendedCost: r.cost,
    chargeType: r.chargeType || "Usage",
  }));
}
