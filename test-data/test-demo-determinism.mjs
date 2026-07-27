import assert from "node:assert/strict";

const { generateDemoCSV, generateDemoData } = await import("../src/engine/demo-data.ts");

const base = { provider: "aws", complexity: "medium", variant: "standard" };
assert.deepEqual(generateDemoData(base), generateDemoData(base), "the same demo config must be reproducible");
assert.equal(generateDemoCSV(base), generateDemoCSV(base), "demo CSV must round-trip deterministically");

const simple = generateDemoData({ provider: "aws", complexity: "simple", variant: "standard" });
const complex = generateDemoData({ provider: "aws", complexity: "complex", variant: "standard" });
assert.ok(complex.length > simple.length, "complex demo should contain more billing evidence");

const ai = generateDemoData({ provider: "aws", complexity: "medium", variant: "ai" });
assert.ok(ai.some((row) => /bedrock|sagemaker/i.test(`${row.nativeService} ${row.nativeUsageType}`)), "AI demo must contain provider-correct AI services");

const credits = generateDemoData({ provider: "aws", complexity: "medium", variant: "credits" });
assert.ok(credits.some((row) => row.chargeType === "Credit" && row.cost < 0), "credits demo must include explicit negative credit rows");

console.log("PASS demos: deterministic complexity and variants");
