import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  _Object as S3Object,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import zlib from "zlib";
import Papa from "papaparse";
import { NormalizedCostRecord } from "./types";
import { parseFOCUSCSV } from "./parsers/focus-parser";
import { isFOCUSFormat, readHeaders } from "./parsers";

/**
 * FOCUS Export S3 Connector — Phase 3
 *
 * Reads a FOCUS 1.0 / 1.2 export from an S3 bucket written by AWS Data Exports
 * (Billing and Cost Management → Data Exports → Create export → Standard data
 * export → Table: "FOCUS 1.2 with AWS columns" or "FOCUS 1.0 with AWS columns").
 *
 * Console path (verified):
 *   https://docs.aws.amazon.com/cur/latest/userguide/dataexports-create-standard.html
 *
 * HOW AWS LAYS OUT THE EXPORT (verified against AWS docs):
 *   <prefix>/<export-name>/data/BILLING_PERIOD=YYYY-MM/<export-name>-00001.csv.gz
 *   <prefix>/<export-name>/metadata/BILLING_PERIOD=YYYY-MM/...
 *   Chunk numbers are 5 digits starting at 00001. Files can be
 *   `.csv.gz` or `.snappy.parquet`.
 *
 * WHY WE READ THE MANIFEST INSTEAD OF "THE NEWEST OBJECT":
 *   Manifest.json is the commit point of the export. AWS writes it only once
 *   every data file of that run has finished. Listing the bucket and grabbing the
 *   newest `.csv.gz` can therefore pick up a half-written export and produce
 *   partial figures with no visible error — unacceptable for a report that is
 *   presented as auditable. Two further traps the manifest avoids:
 *     - In `Overwrite` delivery mode, leftover chunks from a previous, larger run
 *       are overwritten with EMPTY data, so "newest by LastModified" can be a
 *       legitimately empty file.
 *     - A run can be split across many chunks. Reading one chunk analyses a
 *       fraction of the data, again silently.
 *
 * Parquet is supported (hyparquet, MIT, pure JS incl. Snappy) because Parquet +
 * Overwrite + Glue crawler is the layout AWS's own Cloud Intelligence Dashboards
 * guidance recommends:
 *   https://docs.aws.amazon.com/guidance/latest/cloud-intelligence-dashboards/data-exports.html
 *
 * SECURITY: credentials are held only for the duration of this call.
 * They are NEVER stored, logged, or forwarded to any third party.
 * Do NOT add console.log of accessKeyId / secretAccessKey / sessionToken.
 */

/** Hard limit on the SUM of every chunk of the selected run. */
const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB

/** Safety valve on ListObjectsV2 pagination so a huge bucket cannot hang the request. */
const MAX_LIST_PAGES = 50;

/** Extensions AWS Data Exports uses for data files. */
const DATA_EXTENSIONS = [".csv.gz", ".csv", ".snappy.parquet", ".parquet", ".gz.parquet"];

export interface FocusS3Config {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  bucket: string;
  /** S3 key prefix where the export files live, e.g. "focus-export/data/" */
  prefix: string;
}

export interface FocusS3Result {
  records: NormalizedCostRecord[];
  /** Human-readable description of what was read (manifest key, or the single object). */
  sourceKey: string;
  lastModified: Date;
  /** Sum of the bytes actually downloaded across every chunk. */
  sizeBytes: number;
  /** Manifest that defined the run, when the manifest path was used. */
  manifestKey?: string;
  /** Number of data chunks read. */
  chunkCount: number;
  /** BILLING_PERIOD partition of the run, e.g. "2026-06", when derivable. */
  billingPeriod?: string;
  /** Which discovery path produced the data. */
  discovery: "manifest" | "fallback-listing";
  format: "csv" | "parquet";
  /** Non-fatal problems the caller should surface to the user. */
  warnings: string[];
}

/** Build the S3 client — credentials held in memory only for this call. */
function buildClient(config: FocusS3Config): S3Client {
  return new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}),
    },
  });
}

/** Convert a ReadableStream / Readable to a Buffer. */
async function streamToBuffer(stream: Readable | ReadableStream | unknown): Promise<Buffer> {
  if (stream instanceof Readable) {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      (stream as Readable).on("data", (chunk: Buffer) => chunks.push(chunk));
      (stream as Readable).on("end", () => resolve(Buffer.concat(chunks)));
      (stream as Readable).on("error", reject);
    });
  }
  // Web ReadableStream (Node 18+)
  const reader = (stream as ReadableStream).getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// ─── Listing ──────────────────────────────────────────────────────────────────

/**
 * List EVERY object under the prefix, following ContinuationToken.
 *
 * ListObjectsV2 caps a response at 1000 keys. The previous version issued a
 * single call, so any bucket holding more than 1000 objects was truncated in
 * silence — and a truncated listing is exactly how you miss the newest
 * partition or the Manifest.json.
 */
async function listAllObjects(
  client: S3Client,
  bucket: string,
  prefix: string
): Promise<{ objects: S3Object[]; truncated: boolean }> {
  const objects: S3Object[] = [];
  let token: string | undefined;
  let pages = 0;

  do {
    const resp = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );
    objects.push(...(resp.Contents ?? []));
    token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    pages++;
  } while (token && pages < MAX_LIST_PAGES);

  return { objects, truncated: Boolean(token) };
}

// ─── Manifest discovery ───────────────────────────────────────────────────────

/** Extracts the `BILLING_PERIOD=YYYY-MM` partition value from a key, if present. */
function billingPeriodOf(key: string): string | null {
  const m = /BILLING_PERIOD=(\d{4}-\d{2})/i.exec(key);
  return m ? m[1] : null;
}

function isManifestKey(key: string): boolean {
  return key.toLowerCase().endsWith("manifest.json");
}

/**
 * Pick the manifest of the most recent run:
 *   1. Most recent BILLING_PERIOD partition (YYYY-MM sorts correctly as a string).
 *   2. Within that partition, the most recent by LastModified — this is the
 *      `Create new` delivery mode, where each run lands under its own
 *      `<timestamp>-<execution-id>` path and writes two manifests.
 * Manifests with no partition in their key rank below any partitioned one.
 */
function pickManifest(objects: S3Object[]): S3Object | null {
  const manifests = objects.filter((o) => o.Key && isManifestKey(o.Key));
  if (manifests.length === 0) return null;

  const ranked = [...manifests].sort((a, b) => {
    const pa = billingPeriodOf(a.Key!) ?? "";
    const pb = billingPeriodOf(b.Key!) ?? "";
    if (pa !== pb) return pb.localeCompare(pa);
    return (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0);
  });

  return ranked[0];
}

// ─── Manifest parsing (deliberately tolerant) ─────────────────────────────────

/**
 * AWS does not publish the exact field schema of the Data Exports Manifest.json,
 * so hard-coding one field name would be a guess that breaks the moment it is
 * wrong. Instead we probe the plausible field names, accept both
 * `["key", ...]` and `[{ key | url | path ... }, ...]` item shapes, and walk
 * nested objects. If nothing usable comes out we fall back to bucket listing
 * rather than failing the whole connection — but the fallback is reported, never
 * silent, because it reintroduces the "possibly incomplete export" risk the
 * manifest exists to remove.
 */
const MANIFEST_LIST_FIELDS = new Set([
  "datafiles",
  "files",
  "reportkeys",
  "datafilekeys",
  "chunks",
  "dataset",
  "data",
  "objects",
  "parts",
]);

const MANIFEST_ITEM_KEY_FIELDS = [
  "key",
  "objectkey",
  "s3key",
  "url",
  "uri",
  "location",
  "path",
  "filename",
  "name",
];

/** Normalize a reference found in the manifest into a plain S3 object key. */
function toObjectKey(raw: string, bucket: string): string | null {
  let value = raw.trim();
  if (!value) return null;

  // s3://bucket/key
  if (value.toLowerCase().startsWith("s3://")) {
    const rest = value.slice(5);
    const slash = rest.indexOf("/");
    value = slash === -1 ? "" : rest.slice(slash + 1);
  } else if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      value = url.pathname.replace(/^\/+/, "");
      // path-style URL: s3.amazonaws.com/<bucket>/<key>
      if (value.startsWith(`${bucket}/`)) value = value.slice(bucket.length + 1);
    } catch {
      return null;
    }
  }

  value = value.replace(/^\/+/, "");
  return value || null;
}

function looksLikeDataFile(key: string): boolean {
  const lc = key.toLowerCase();
  return DATA_EXTENSIONS.some((ext) => lc.endsWith(ext));
}

function extractFromItem(item: unknown, bucket: string): string | null {
  if (typeof item === "string") return toObjectKey(item, bucket);
  if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    for (const field of Object.keys(obj)) {
      if (!MANIFEST_ITEM_KEY_FIELDS.includes(field.toLowerCase())) continue;
      const value = obj[field];
      if (typeof value === "string") {
        const key = toObjectKey(value, bucket);
        if (key) return key;
      }
    }
  }
  return null;
}

/**
 * Walk the manifest looking for the first array that yields at least one
 * recognizable data-file key.
 */
export function extractManifestDataKeys(manifest: unknown, bucket: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  const visit = (node: unknown, fieldName: string | null, depth: number): boolean => {
    if (depth > 8 || node === null || typeof node !== "object") return false;

    if (Array.isArray(node)) {
      // Only treat an array as the file list when its field name is plausible,
      // or when we are at the manifest root (a bare array of keys).
      const plausible = fieldName === null || MANIFEST_LIST_FIELDS.has(fieldName);
      if (plausible) {
        const keys = node
          .map((item) => extractFromItem(item, bucket))
          .filter((k): k is string => Boolean(k) && looksLikeDataFile(k!));
        if (keys.length > 0) {
          for (const k of keys) {
            if (!seen.has(k)) {
              seen.add(k);
              results.push(k);
            }
          }
          return true;
        }
      }
      for (const item of node) {
        if (visit(item, fieldName, depth + 1)) return true;
      }
      return false;
    }

    const obj = node as Record<string, unknown>;
    // Deterministic order: probe plausible field names first, then everything else.
    const fields = Object.keys(obj).sort((a, b) => {
      const pa = MANIFEST_LIST_FIELDS.has(a.toLowerCase()) ? 0 : 1;
      const pb = MANIFEST_LIST_FIELDS.has(b.toLowerCase()) ? 0 : 1;
      return pa - pb;
    });
    for (const field of fields) {
      if (visit(obj[field], field.toLowerCase(), depth + 1)) return true;
    }
    return false;
  };

  visit(manifest, null, 0);
  return results;
}

// ─── Download helpers ─────────────────────────────────────────────────────────

async function getObjectBuffer(client: S3Client, bucket: string, key: string): Promise<Buffer> {
  const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!resp.Body) {
    throw new Error(`GetObject no retornó datos para s3://${bucket}/${key}`);
  }
  return streamToBuffer(resp.Body as Readable);
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Drops the first physical line (the repeated header of a follow-up chunk). */
function dropHeaderLine(text: string): string {
  const idx = text.indexOf("\n");
  return idx === -1 ? "" : text.slice(idx + 1);
}

function decodeCsvChunk(buffer: Buffer, key: string): string {
  const raw = key.toLowerCase().endsWith(".gz")
    ? zlib.gunzipSync(buffer).toString("utf-8")
    : buffer.toString("utf-8");
  return stripBom(raw);
}

/**
 * Concatenate CSV chunks keeping only the first chunk's header row.
 *
 * Empty chunks are skipped: in `Overwrite` delivery mode AWS blanks out the
 * leftover chunks of a previous, larger run, so a zero-byte or header-only file
 * is expected, not an error.
 */
export function concatCsvChunks(chunks: string[]): string {
  const parts: string[] = [];
  let headerTaken = false;

  for (const chunk of chunks) {
    const text = stripBom(chunk);
    if (text.trim() === "") continue;

    if (!headerTaken) {
      parts.push(text.replace(/\r?\n+$/, ""));
      headerTaken = true;
      continue;
    }
    const body = dropHeaderLine(text).replace(/\r?\n+$/, "");
    if (body.trim() === "") continue;
    parts.push(body);
  }

  return parts.join("\n");
}

/**
 * Parquet → CSV text.
 *
 * hyparquet gives us row objects; the rest of the pipeline (FOCUS gate +
 * parseFOCUSCSV) is driven by CSV text, so we re-emit the rows with Papa.unparse.
 * That keeps the parsers untouched and guarantees Parquet and CSV inputs take
 * exactly the same code path afterwards.
 */
async function parquetChunksToCsv(buffers: Buffer[]): Promise<string> {
  // Dynamic import: hyparquet is ESM-only and only needed on the Parquet path.
  const { parquetReadObjects } = await import("hyparquet");

  const rows: Record<string, unknown>[] = [];
  for (const buffer of buffers) {
    if (buffer.byteLength === 0) continue;
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
    const file = {
      byteLength: arrayBuffer.byteLength,
      slice: (start: number, end?: number) => arrayBuffer.slice(start, end),
    };
    const chunkRows = (await parquetReadObjects({ file })) as Record<string, unknown>[];
    rows.push(...chunkRows);
  }

  if (rows.length === 0) return "";

  // Union of keys across chunks, so a chunk missing an optional column does not
  // shift every following row's values.
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  const flat = rows.map((row) => {
    const out: Record<string, string> = {};
    for (const col of columns) out[col] = stringifyCell(row[col]);
    return out;
  });

  return Papa.unparse(flat, { columns });
}

/** Parquet values can be bigint / Date / nested; CSV needs plain strings. */
function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ─── Export discovery ─────────────────────────────────────────────────────────

interface DiscoveredRun {
  keys: string[];
  manifestKey?: string;
  billingPeriod?: string;
  lastModified: Date;
  discovery: "manifest" | "fallback-listing";
  warnings: string[];
}

/**
 * Fallback used when there is no manifest, or when its schema does not match any
 * shape we recognize. This is the OLD behaviour (newest data object by
 * LastModified) and it carries the old risk: the run may still be mid-write and
 * chunked. It exists only so an unrecognized manifest schema degrades to
 * "works, with a warning" instead of "connector dead".
 */
function fallbackRun(objects: S3Object[], reason: string): DiscoveredRun {
  const dataObjects = objects.filter((o) => o.Key && looksLikeDataFile(o.Key));
  if (dataObjects.length === 0) {
    throw new Error(
      "No se encontraron archivos de datos (.csv.gz, .csv, .snappy.parquet) bajo el prefijo indicado. " +
      "AWS Data Exports escribe los datos en <prefijo>/data/BILLING_PERIOD=YYYY-MM/. " +
      "Revisa que el prefijo apunte a la carpeta del export y que la primera entrega ya se haya producido " +
      "(AWS tarda entre 24 y 72 horas en la primera entrega)."
    );
  }

  const latest = [...dataObjects].sort(
    (a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0)
  )[0];

  // Keep the run consistent: all chunks that share the newest file's directory
  // and modification day would be a guess, so the fallback stays with one file
  // and says so.
  return {
    keys: [latest.Key!],
    billingPeriod: billingPeriodOf(latest.Key!) ?? undefined,
    lastModified: latest.LastModified ?? new Date(),
    discovery: "fallback-listing",
    warnings: [
      `${reason} Se analizó el archivo más reciente (${latest.Key}) sin confirmar contra el manifiesto, ` +
      "así que el export podría estar incompleto o troceado en varios archivos. " +
      "Trata las cifras como orientativas hasta poder validarlas.",
    ],
  };
}

async function discoverRun(
  client: S3Client,
  bucket: string,
  prefix: string,
  listing: { objects: S3Object[]; truncated: boolean }
): Promise<DiscoveredRun> {
  const { objects, truncated } = listing;

  if (objects.length === 0) {
    throw new Error(
      `No se encontraron archivos en s3://${bucket}/${prefix}. ` +
      "Verifica que el Data Export está activo y el prefijo es correcto. " +
      "La primera entrega puede tardar entre 24 y 72 horas desde que creas el export."
    );
  }

  const warnings: string[] = [];
  if (truncated) {
    warnings.push(
      `El bucket contiene más objetos de los que se pueden listar en una sola pasada ` +
      `(${MAX_LIST_PAGES * 1000}+). Acota el prefijo para asegurar que se lee la partición más reciente.`
    );
  }

  const manifest = pickManifest(objects);
  if (!manifest?.Key) {
    const run = fallbackRun(
      objects,
      "No se encontró ningún Manifest.json bajo el prefijo. AWS lo escribe solo cuando el export ha terminado por completo, " +
      "y es lo que permite garantizar que se leen todos los archivos."
    );
    run.warnings.unshift(...warnings);
    return run;
  }

  let keys: string[] = [];
  let parseProblem: string | null = null;

  try {
    const buffer = await getObjectBuffer(client, bucket, manifest.Key);
    const parsed = JSON.parse(buffer.toString("utf-8")) as unknown;
    keys = extractManifestDataKeys(parsed, bucket);
    if (keys.length === 0) {
      parseProblem =
        `El Manifest.json (${manifest.Key}) no expone la lista de archivos en ninguno de los campos conocidos ` +
        "(dataFiles, files, reportKeys...). Puede que AWS haya cambiado el esquema.";
    }
  } catch (err) {
    parseProblem =
      `No se pudo leer o interpretar el Manifest.json (${manifest.Key}): ` +
      `${err instanceof Error ? err.message : String(err)}.`;
  }

  if (parseProblem) {
    const run = fallbackRun(objects, parseProblem);
    run.warnings.unshift(...warnings);
    return run;
  }

  // A manifest can point at a sibling partition; keep the period of the manifest.
  const period = billingPeriodOf(manifest.Key) ?? billingPeriodOf(keys[0]) ?? undefined;

  return {
    keys,
    manifestKey: manifest.Key,
    billingPeriod: period,
    lastModified: manifest.LastModified ?? new Date(),
    discovery: "manifest",
    warnings,
  };
}

/** Pre-flight size check using the listing metadata, before downloading anything. */
function checkAnnouncedSize(keys: string[], objects: Map<string, number>): void {
  let known = 0;
  for (const key of keys) known += objects.get(key) ?? 0;
  if (known > MAX_TOTAL_BYTES) {
    throw new Error(
      `El export completo (${(known / 1024 / 1024).toFixed(1)} MB en ${keys.length} archivo(s)) ` +
      "supera el límite de 50 MB. Configura un export con menor alcance de fechas " +
      "(por ejemplo, los últimos 7 días) o acota el prefijo a una sola partición BILLING_PERIOD."
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches, decompresses and parses the most recent COMPLETE FOCUS export from S3.
 * Reads every chunk of the run identified by the manifest, not just one file.
 */
export async function fetchFocusFromS3(config: FocusS3Config): Promise<FocusS3Result> {
  const client = buildClient(config);

  // 1. Identify the run (manifest-first, listing as reported fallback).
  // The bucket is listed exactly once and the listing is reused for sizes.
  const listing = await listAllObjects(client, config.bucket, config.prefix);
  const sizeByKey = new Map<string, number>();
  for (const o of listing.objects) if (o.Key) sizeByKey.set(o.Key, o.Size ?? 0);

  const run = await discoverRun(client, config.bucket, config.prefix, listing);
  const warnings = [...run.warnings];

  if (run.keys.length === 0) {
    throw new Error("El manifiesto no referencia ningún archivo de datos.");
  }

  // 2. Reject a mixed run rather than analysing half of it.
  const parquetKeys = run.keys.filter((k) => k.toLowerCase().endsWith(".parquet"));
  const csvKeys = run.keys.filter((k) => {
    const lc = k.toLowerCase();
    return lc.endsWith(".csv") || lc.endsWith(".csv.gz");
  });

  if (parquetKeys.length > 0 && csvKeys.length > 0) {
    throw new Error(
      "El export mezcla archivos CSV y Parquet en la misma ejecución, así que no se puede " +
      "determinar qué conjunto es el bueno. Acota el prefijo a un solo export."
    );
  }
  if (parquetKeys.length === 0 && csvKeys.length === 0) {
    throw new Error(
      `Los archivos referenciados no tienen una extensión reconocible (${run.keys.slice(0, 3).join(", ")}). ` +
      "Se admiten .csv, .csv.gz y .snappy.parquet."
    );
  }

  const format: "csv" | "parquet" = parquetKeys.length > 0 ? "parquet" : "csv";
  const keys = format === "parquet" ? parquetKeys : csvKeys;

  // 3. Size guard: announced sizes first, then the real bytes as we download.
  checkAnnouncedSize(keys, sizeByKey);

  const buffers: Buffer[] = [];
  let downloaded = 0;
  for (const key of keys) {
    const buffer = await getObjectBuffer(client, config.bucket, key);
    downloaded += buffer.byteLength;
    if (downloaded > MAX_TOTAL_BYTES) {
      throw new Error(
        `El export completo supera el límite de 50 MB (${(downloaded / 1024 / 1024).toFixed(1)} MB ` +
        `descargados de ${keys.length} archivo(s)). Reduce el alcance de fechas del export.`
      );
    }
    buffers.push(buffer);
  }

  // 4. Decode. CSV: keep the first header only. Parquet: rows → CSV text.
  let csvContent: string;
  if (format === "parquet") {
    csvContent = await parquetChunksToCsv(buffers);
    if (csvContent.trim() === "") {
      throw new Error(
        "Los archivos Parquet del export no contienen filas. En modo Overwrite AWS sobrescribe " +
        "los archivos sobrantes de una ejecución anterior con datos vacíos; espera al siguiente refresco " +
        "(el export se actualiza al menos una vez al día)."
      );
    }
  } else {
    csvContent = concatCsvChunks(buffers.map((b, i) => decodeCsvChunk(b, keys[i])));
    if (csvContent.trim() === "") {
      throw new Error(
        "Los archivos del export están vacíos. En modo Overwrite AWS sobrescribe los archivos " +
        "sobrantes de una ejecución anterior con datos vacíos; espera al siguiente refresco " +
        "(el export se actualiza al menos una vez al día)."
      );
    }
  }

  // 5. Gate: whatever sits under the prefix may be any file the account happens
  // to write there (a CUR export, a legacy report, something unrelated). Parsing
  // a non-FOCUS file with the FOCUS parser yields zero rows or, worse, silently
  // mislabelled ones, so refuse before parsing.
  if (!isFOCUSFormat(readHeaders(csvContent))) {
    throw new Error(
      `Los datos leídos de s3://${config.bucket}/${keys[0]} no están en formato FOCUS: ` +
      "faltan las columnas obligatorias (BilledCost, ChargePeriodStart y al menos dos de " +
      "ChargePeriodEnd, BillingAccountId, BillingCurrency, ChargeCategory, EffectiveCost, ServiceName). " +
      "Al crear el Data Export en Billing and Cost Management → Data Exports → Standard data export, " +
      'elige la tabla "FOCUS 1.2 with AWS columns" (o "FOCUS 1.0 with AWS columns") y no deselecciones esas columnas.'
    );
  }

  // 6. Parse with FOCUS parser
  const records = parseFOCUSCSV(csvContent);

  return {
    records,
    sourceKey: run.manifestKey ?? keys[0],
    lastModified: run.lastModified,
    sizeBytes: downloaded,
    manifestKey: run.manifestKey,
    chunkCount: keys.length,
    billingPeriod: run.billingPeriod,
    discovery: run.discovery,
    format,
    warnings,
  };
}

/**
 * Validates that the credentials can list the given bucket/prefix.
 * Uses a minimal ListObjectsV2 with MaxKeys=1 to avoid large responses.
 */
export async function validateS3Access(
  config: FocusS3Config
): Promise<{ valid: boolean; error?: string; objectCount?: number }> {
  try {
    const client = buildClient(config);
    const resp = await client.send(
      new ListObjectsV2Command({ Bucket: config.bucket, Prefix: config.prefix, MaxKeys: 5 })
    );
    return { valid: true, objectCount: resp.KeyCount ?? 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("NoSuchBucket")) {
      return { valid: false, error: `Bucket '${config.bucket}' no existe o no tienes acceso.` };
    }
    if (msg.includes("PermanentRedirect") || msg.includes("AuthorizationHeaderMalformed")) {
      return {
        valid: false,
        error:
          `El bucket '${config.bucket}' no está en la región '${config.region}'. ` +
          "Selecciona la región real del bucket: el bucket puede estar en cualquier región, " +
          "el requisito de us-east-1 aplica al recurso del export, no al bucket de destino.",
      };
    }
    if (msg.includes("AccessDenied") || msg.includes("403")) {
      return {
        valid: false,
        error:
          `Acceso denegado a s3://${config.bucket}/${config.prefix}. ` +
          `Verifica la política IAM: necesita s3:ListBucket + s3:GetObject sobre ese bucket y prefijo.`,
      };
    }
    if (msg.includes("InvalidAccessKeyId") || msg.includes("SignatureDoesNotMatch")) {
      return { valid: false, error: "Credenciales AWS inválidas. Verifica Access Key ID y Secret Access Key." };
    }
    return { valid: false, error: `Error al conectar con S3: ${msg}` };
  }
}
