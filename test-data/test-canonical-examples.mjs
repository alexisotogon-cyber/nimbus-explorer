import assert from "node:assert/strict";

const { getCanonicalExample, validateCanonicalExample } = await import("../src/engine/examples/canonical.ts");
const { parseCSVAutoDetect } = await import("../src/engine/parsers/index.ts");
const { calculateSavings } = await import("../src/engine/tools/calculate-savings.ts");

for (const provider of ["aws", "azure", "gcp", "focus"]) {
  const example = getCanonicalExample(provider);
  assert.equal(example.rows.length, 3, `${provider}: exactly three rows`);
  assert.deepEqual(validateCanonicalExample(example), [], `${provider}: schema validation`);

  const parsed = parseCSVAutoDetect(example.csv);
  assert.equal(parsed.records.length, 2, `${provider}: two positive usage records`);
  assert.equal(parsed.diagnostics?.totalRows, 3, `${provider}: parser saw three rows`);
  assert.ok((parsed.diagnostics?.creditRows ?? 0) >= 1, `${provider}: credit/refund evidence preserved`);

  const report = calculateSavings(
    parsed.records,
    parsed.isFocus,
    parsed.diagnostics,
    parsed.schemaCoverage
  );
  assert.equal(report.dataWindow.distinctDays, 1, `${provider}: one-day window`);
  assert.equal(report.findings.length, 0, `${provider}: insufficient window produces no findings`);
}

const focus = getCanonicalExample("focus");
assert.equal(focus.headers.length, 65);
assert.ok(focus.headers.includes("ServiceProviderName"));
assert.ok(!focus.headers.includes("ProviderName"));

const azure = getCanonicalExample("azure");
assert.equal(azure.headers.length, 55);

const gcp = getCanonicalExample("gcp");
assert.match(gcp.sql, /UNNEST\(credits\)/);
assert.doesNotMatch(gcp.sql, /JOIN\s+UNNEST\(credits\)/i);

console.log("PASS: canonical AWS, Azure, GCP and FOCUS samples.");
