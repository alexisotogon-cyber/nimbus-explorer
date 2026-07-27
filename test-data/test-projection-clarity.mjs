import assert from "node:assert/strict";

const { analyzeTrends } = await import("../src/engine/trends.ts");

const records = Array.from({ length: 30 }, (_, index) => ({
  provider: "aws",
  category: "storage",
  nativeService: "Amazon S3",
  nativeUsageType: "TimedStorage-ByteHrs",
  region: "us-east-1",
  date: `2026-06-${String(index + 1).padStart(2, "0")}`,
  cost: index < 23 ? 25 : 30,
  quantity: 1,
  // Covered usage is still real consumption and must participate in trends.
  chargeType: index < 23 ? "Usage" : "SavingsPlanCoveredUsage",
}));

const projection = analyzeTrends(records).find((insight) => insight.type === "month-projection");

assert.ok(projection, "A material recent run-rate change should produce a projection insight");
assert.match(projection.title, /Ritmo reciente: ~\$900\.00 en los próximos 30 días/);
assert.match(
  projection.detail,
  /\$115\.00 \(14\.6%\) más que la referencia mensual de \$785\.00/
);
assert.match(
  projection.evidence,
  /Referencia mensual del periodo completo: \$26\.17 × 30 = \$785\.00/
);

console.log("PASS projection clarity: full-period baseline reconciles with recent run rate");
