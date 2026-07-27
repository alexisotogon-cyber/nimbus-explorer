/**
 * FOCUS S3 connector tests — mocked S3, no AWS calls, no credentials.
 * Run: npx tsx test-data/test-focus-s3.mjs
 *
 * Covers:
 *   1. Manifest with a single chunk.
 *   2. Manifest with three chunks concatenated without repeated headers.
 *   3. Manifest with an unexpected field schema → fallback path + warning.
 *   4. ListObjectsV2 pagination beyond 1000 objects.
 *   5. No manifest at all → fallback path + warning.
 *   6. Parquet export (Snappy compressed) read through hyparquet.
 *   7. Total size over the 50 MB limit is rejected.
 *
 * SECURITY: the fake credentials below are literal dummies; nothing is sent anywhere.
 */

import zlib from "zlib";
import { ListObjectsV2Command, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { parquetWriteBuffer } from "hyparquet-writer";

const { fetchFocusFromS3 } = await import("../src/engine/focus-s3-connector.ts");

let passed = 0;
let failed = 0;

function ok(label, condition, detail = "") {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function expectThrow(label, fn, substring) {
  try {
    await fn();
    ok(label, false, "no lanzó error");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ok(label, msg.includes(substring), `mensaje: ${msg}`);
  }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const HEADER =
  "BilledCost,EffectiveCost,ChargePeriodStart,ChargePeriodEnd,BillingAccountId," +
  "BillingCurrency,ChargeCategory,ServiceName,ServiceCategory,RegionId,ChargeDescription,ConsumedQuantity";

function row(cost, service, category, date) {
  return `${cost},${cost},${date}T00:00:00Z,${date}T23:59:59Z,111122223333,USD,Usage,${service},${category},us-east-1,${service} usage,1`;
}

function csv(rows) {
  return [HEADER, ...rows].join("\n") + "\n";
}

const CHUNK_A = csv([row(100, "Amazon Elastic Compute Cloud", "Compute", "2026-06-01")]);
const CHUNK_B = csv([
  row(50, "Amazon Simple Storage Service", "Storage", "2026-06-02"),
  row(25, "Amazon Relational Database Service", "Databases", "2026-06-02"),
]);
const CHUNK_C = csv([row(10, "Amazon Bedrock", "AI and Machine Learning", "2026-06-03")]);

function gz(text) {
  return zlib.gzipSync(Buffer.from(text, "utf-8"));
}

/**
 * Minimal fake S3: an in-memory map of key → { body: Buffer, lastModified: Date }.
 * ListObjectsV2 honours Prefix and ContinuationToken with a 1000-key page size,
 * exactly like the real API, so the pagination path is genuinely exercised.
 */
function mockS3(store) {
  const keys = Object.keys(store).sort();

  const send = async (command) => {
    if (command instanceof ListObjectsV2Command || command.constructor.name === "ListObjectsV2Command") {
      const { Prefix = "", ContinuationToken, MaxKeys } = command.input;
      const matching = keys.filter((k) => k.startsWith(Prefix));
      const pageSize = MaxKeys ?? 1000;
      const start = ContinuationToken ? Number(ContinuationToken) : 0;
      const page = matching.slice(start, start + pageSize);
      const nextStart = start + page.length;
      const isTruncated = nextStart < matching.length;
      return {
        Contents: page.map((k) => ({
          Key: k,
          Size: store[k].body.byteLength,
          LastModified: store[k].lastModified,
        })),
        KeyCount: page.length,
        IsTruncated: isTruncated,
        NextContinuationToken: isTruncated ? String(nextStart) : undefined,
      };
    }
    if (command instanceof GetObjectCommand || command.constructor.name === "GetObjectCommand") {
      const entry = store[command.input.Key];
      if (!entry) {
        const err = new Error("NoSuchKey: The specified key does not exist.");
        throw err;
      }
      const buf = entry.body;
      return {
        Body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(buf));
            controller.close();
          },
        }),
      };
    }
    throw new Error(`Comando no soportado en el mock: ${command.constructor.name}`);
  };

  // Patch the prototype so the connector's own `new S3Client(...)` is intercepted.
  return send;
}

const originalSend = S3Client.prototype.send;
function withMock(store, fn) {
  S3Client.prototype.send = mockS3(store);
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      S3Client.prototype.send = originalSend;
    });
}

const CONFIG = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  region: "eu-west-1",
  bucket: "mi-bucket-exports",
  prefix: "focus-export/",
};

const T = (iso) => new Date(iso);

function entry(body, iso) {
  return { body: Buffer.isBuffer(body) ? body : Buffer.from(body, "utf-8"), lastModified: T(iso) };
}

// ─── Test 1: manifest with a single chunk ────────────────────────────────────

console.log("\n── 1. Manifiesto con un solo chunk ──────────────────────────");

await withMock(
  {
    "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00001.csv.gz": entry(
      gz(CHUNK_A),
      "2026-07-01T03:00:00Z"
    ),
    "focus-export/metadata/BILLING_PERIOD=2026-06/Manifest.json": entry(
      JSON.stringify({
        dataFiles: ["focus-export/data/BILLING_PERIOD=2026-06/focus-export-00001.csv.gz"],
        executionId: "abc",
      }),
      "2026-07-01T03:05:00Z"
    ),
  },
  async () => {
    const r = await fetchFocusFromS3(CONFIG);
    ok("usa el camino del manifiesto", r.discovery === "manifest", `discovery=${r.discovery}`);
    ok("1 chunk", r.chunkCount === 1, `chunkCount=${r.chunkCount}`);
    ok("1 registro", r.records.length === 1, `records=${r.records.length}`);
    ok("periodo 2026-06", r.billingPeriod === "2026-06", `period=${r.billingPeriod}`);
    ok("sin avisos", r.warnings.length === 0, JSON.stringify(r.warnings));
    ok("formato csv", r.format === "csv");
    ok("sizeBytes > 0", r.sizeBytes > 0);
  }
);

// ─── Test 2: three chunks, headers not repeated ──────────────────────────────

console.log("\n── 2. Manifiesto con tres chunks ────────────────────────────");

await withMock(
  {
    "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00001.csv.gz": entry(gz(CHUNK_A), "2026-07-01T03:00:00Z"),
    "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00002.csv.gz": entry(gz(CHUNK_B), "2026-07-01T03:01:00Z"),
    "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00003.csv.gz": entry(gz(CHUNK_C), "2026-07-01T03:02:00Z"),
    // Older partition with a newer LastModified: proves partition ranking wins
    // over "newest file", which is what the old implementation got wrong.
    "focus-export/data/BILLING_PERIOD=2026-05/focus-export-00001.csv.gz": entry(gz(CHUNK_A), "2026-07-02T09:00:00Z"),
    "focus-export/metadata/BILLING_PERIOD=2026-05/Manifest.json": entry(
      JSON.stringify({ dataFiles: ["focus-export/data/BILLING_PERIOD=2026-05/focus-export-00001.csv.gz"] }),
      "2026-07-02T09:05:00Z"
    ),
    "focus-export/metadata/BILLING_PERIOD=2026-06/Manifest.json": entry(
      JSON.stringify({
        dataFiles: [
          { key: "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00001.csv.gz" },
          { key: "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00002.csv.gz" },
          { key: "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00003.csv.gz" },
        ],
      }),
      "2026-07-01T03:05:00Z"
    ),
  },
  async () => {
    const r = await fetchFocusFromS3(CONFIG);
    ok("camino del manifiesto", r.discovery === "manifest");
    ok("3 chunks", r.chunkCount === 3, `chunkCount=${r.chunkCount}`);
    ok("4 registros (1+2+1)", r.records.length === 4, `records=${r.records.length}`);
    ok(
      "sin cabeceras repetidas parseadas como datos",
      r.records.every((rec) => rec.cost > 0 && rec.date.startsWith("2026-06")),
      JSON.stringify(r.records.map((x) => [x.date, x.cost]))
    );
    const total = r.records.reduce((s, x) => s + x.cost, 0);
    ok("suma de costos = 185", Math.abs(total - 185) < 0.001, `total=${total}`);
    ok(
      "elige la partición 2026-06 y no la 2026-05 más reciente por fecha",
      r.billingPeriod === "2026-06",
      `period=${r.billingPeriod}`
    );
  }
);

// ─── Test 3: unexpected manifest schema → fallback ───────────────────────────

console.log("\n── 3. Manifiesto con esquema inesperado (respaldo) ──────────");

await withMock(
  {
    "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00001.csv.gz": entry(gz(CHUNK_A), "2026-07-01T03:00:00Z"),
    "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00002.csv.gz": entry(gz(CHUNK_B), "2026-07-01T03:01:00Z"),
    "focus-export/metadata/BILLING_PERIOD=2026-06/Manifest.json": entry(
      // Nothing resembling a file list: unknown container names, no data extensions.
      JSON.stringify({ schemaVersion: 99, payloadDescriptor: { blobs: [{ ref: "opaque-token-123" }] } }),
      "2026-07-01T03:05:00Z"
    ),
  },
  async () => {
    const r = await fetchFocusFromS3(CONFIG);
    ok("cae al respaldo", r.discovery === "fallback-listing", `discovery=${r.discovery}`);
    ok("avisa al usuario", r.warnings.length > 0, JSON.stringify(r.warnings));
    ok(
      "el aviso explica el motivo",
      r.warnings.some((w) => w.includes("Manifest.json")),
      JSON.stringify(r.warnings)
    );
    ok("lee el archivo más reciente (chunk B, 2 filas)", r.records.length === 2, `records=${r.records.length}`);
  }
);

// ─── Test 4: pagination beyond 1000 objects ──────────────────────────────────

console.log("\n── 4. Paginación con más de 1000 objetos ────────────────────");

await withMock(
  (() => {
    const store = {};
    // 1200 unrelated objects sorted BEFORE the manifest and data keys, so a
    // single non-paginated ListObjectsV2 would never see them.
    for (let i = 0; i < 1200; i++) {
      store[`focus-export/aaa-filler/${String(i).padStart(5, "0")}.txt`] = entry("x", "2026-01-01T00:00:00Z");
    }
    store["focus-export/data/BILLING_PERIOD=2026-06/focus-export-00001.csv.gz"] = entry(
      gz(CHUNK_A),
      "2026-07-01T03:00:00Z"
    );
    store["focus-export/metadata/BILLING_PERIOD=2026-06/Manifest.json"] = entry(
      JSON.stringify({ reportKeys: ["focus-export/data/BILLING_PERIOD=2026-06/focus-export-00001.csv.gz"] }),
      "2026-07-01T03:05:00Z"
    );
    return store;
  })(),
  async () => {
    const r = await fetchFocusFromS3(CONFIG);
    ok("encuentra el manifiesto en la página 2", r.discovery === "manifest", `discovery=${r.discovery}`);
    ok("campo alternativo reportKeys reconocido", r.chunkCount === 1);
    ok("1 registro", r.records.length === 1);
    ok("sin avisos de truncado", r.warnings.length === 0, JSON.stringify(r.warnings));
  }
);

// ─── Test 5: no manifest at all ──────────────────────────────────────────────

console.log("\n── 5. Sin Manifest.json ─────────────────────────────────────");

await withMock(
  {
    "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00001.csv.gz": entry(gz(CHUNK_A), "2026-07-01T03:00:00Z"),
  },
  async () => {
    const r = await fetchFocusFromS3(CONFIG);
    ok("cae al respaldo", r.discovery === "fallback-listing");
    ok(
      "avisa de que no hay manifiesto",
      r.warnings.some((w) => w.includes("Manifest.json")),
      JSON.stringify(r.warnings)
    );
  }
);

// ─── Test 6: Parquet with Snappy ─────────────────────────────────────────────

console.log("\n── 6. Parquet con compresión Snappy ─────────────────────────");

function parquetBuffer(rows) {
  const columnData = [
    { name: "BilledCost", data: rows.map((r) => r.cost), type: "DOUBLE" },
    { name: "EffectiveCost", data: rows.map((r) => r.cost), type: "DOUBLE" },
    { name: "ChargePeriodStart", data: rows.map((r) => `${r.date}T00:00:00Z`), type: "STRING" },
    { name: "ChargePeriodEnd", data: rows.map((r) => `${r.date}T23:59:59Z`), type: "STRING" },
    { name: "BillingAccountId", data: rows.map(() => "111122223333"), type: "STRING" },
    { name: "BillingCurrency", data: rows.map(() => "USD"), type: "STRING" },
    { name: "ChargeCategory", data: rows.map(() => "Usage"), type: "STRING" },
    { name: "ServiceName", data: rows.map((r) => r.service), type: "STRING" },
    { name: "ServiceCategory", data: rows.map((r) => r.category), type: "STRING" },
    { name: "RegionId", data: rows.map(() => "us-east-1"), type: "STRING" },
    { name: "ChargeDescription", data: rows.map((r) => `${r.service} usage`), type: "STRING" },
    { name: "ConsumedQuantity", data: rows.map(() => 1), type: "DOUBLE" },
  ];
  // compressed: true → SNAPPY codec, which is what AWS writes (.snappy.parquet).
  return Buffer.from(parquetWriteBuffer({ columnData, compressed: true }));
}

const PARQUET_1 = parquetBuffer([
  { cost: 100, service: "Amazon Elastic Compute Cloud", category: "Compute", date: "2026-06-01" },
  { cost: 40, service: "Amazon Simple Storage Service", category: "Storage", date: "2026-06-01" },
]);
const PARQUET_2 = parquetBuffer([
  { cost: 7, service: "Amazon Bedrock", category: "AI and Machine Learning", date: "2026-06-02" },
]);

await withMock(
  {
    "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00001.snappy.parquet": entry(
      PARQUET_1,
      "2026-07-01T03:00:00Z"
    ),
    "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00002.snappy.parquet": entry(
      PARQUET_2,
      "2026-07-01T03:01:00Z"
    ),
    "focus-export/metadata/BILLING_PERIOD=2026-06/Manifest.json": entry(
      JSON.stringify({
        files: [
          { url: "s3://mi-bucket-exports/focus-export/data/BILLING_PERIOD=2026-06/focus-export-00001.snappy.parquet" },
          { url: "s3://mi-bucket-exports/focus-export/data/BILLING_PERIOD=2026-06/focus-export-00002.snappy.parquet" },
        ],
      }),
      "2026-07-01T03:05:00Z"
    ),
  },
  async () => {
    const r = await fetchFocusFromS3(CONFIG);
    ok("formato parquet detectado", r.format === "parquet", `format=${r.format}`);
    ok("2 chunks parquet", r.chunkCount === 2, `chunkCount=${r.chunkCount}`);
    ok("3 registros descomprimidos con Snappy", r.records.length === 3, `records=${r.records.length}`);
    const total = r.records.reduce((s, x) => s + x.cost, 0);
    ok("suma de costos = 147", Math.abs(total - 147) < 0.001, `total=${total}`);
    ok(
      "claves s3:// del manifiesto resueltas",
      r.manifestKey === "focus-export/metadata/BILLING_PERIOD=2026-06/Manifest.json"
    );
    const categories = new Set(r.records.map((x) => x.category));
    ok("categorías clasificadas", categories.has("compute") && categories.has("ai-ml"), [...categories].join(","));
  }
);

// ─── Test 7: size limit ──────────────────────────────────────────────────────

console.log("\n── 7. Límite de 50 MB sobre la suma de chunks ───────────────");

await withMock(
  {
    "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00001.csv": {
      body: Buffer.alloc(30 * 1024 * 1024, "a"),
      lastModified: T("2026-07-01T03:00:00Z"),
    },
    "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00002.csv": {
      body: Buffer.alloc(30 * 1024 * 1024, "a"),
      lastModified: T("2026-07-01T03:01:00Z"),
    },
    "focus-export/metadata/BILLING_PERIOD=2026-06/Manifest.json": entry(
      JSON.stringify({
        dataFiles: [
          "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00001.csv",
          "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00002.csv",
        ],
      }),
      "2026-07-01T03:05:00Z"
    ),
  },
  async () => {
    await expectThrow("rechaza 60 MB en dos chunks", () => fetchFocusFromS3(CONFIG), "50 MB");
  }
);

// ─── Test 8: empty overwrite chunk is skipped, not treated as data ────────────

console.log("\n── 8. Chunk vacío en modo Overwrite ─────────────────────────");

await withMock(
  {
    "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00001.csv.gz": entry(gz(CHUNK_A), "2026-07-01T03:00:00Z"),
    "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00002.csv.gz": entry(gz(""), "2026-07-01T03:09:00Z"),
    "focus-export/metadata/BILLING_PERIOD=2026-06/Manifest.json": entry(
      JSON.stringify({
        dataFiles: [
          "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00001.csv.gz",
          "focus-export/data/BILLING_PERIOD=2026-06/focus-export-00002.csv.gz",
        ],
      }),
      "2026-07-01T03:10:00Z"
    ),
  },
  async () => {
    const r = await fetchFocusFromS3(CONFIG);
    ok("ignora el chunk vacío", r.records.length === 1, `records=${r.records.length}`);
  }
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
