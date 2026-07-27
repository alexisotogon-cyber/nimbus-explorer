import Papa from "papaparse";
import {
  DetectedFormat,
  ParseResult,
  detectFormat,
  parseAs,
  readHeaders,
} from "../parsers";

/**
 * Provider Guard — compares the cloud the user picked in step 1 (the "lane")
 * against what the uploaded file actually is.
 *
 * Why this exists: detection alone tells us what a file IS, not whether it
 * belongs where the user dropped it. Rules, savings math and remediation
 * commands are provider-specific, so analysing an Azure export inside the AWS
 * lane produces confident, wrong advice.
 */

export type LaneExpectation = "aws" | "azure" | "gcp" | "focus";

export interface ProviderMismatch {
  kind: "wrong-cloud" | "native-in-focus-lane" | "unrecognized" | "ambiguous";
  expected: LaneExpectation;
  /** Recognized format, when detection succeeded. */
  detected?: DetectedFormat;
  /** Known providers found inside a FOCUS file. */
  detectedProviders?: ("aws" | "azure" | "gcp")[];
  /** Candidates when detection was too close to call. */
  candidates?: DetectedFormat[];
  /** Required FOCUS columns that are missing. */
  focusMissing?: string[];
  /** Rows whose ProviderName could not be mapped to a known cloud. */
  unmappedProviderRows?: number;
}

export type GuardResult =
  | { ok: true; parsed: ParseResult; detected: DetectedFormat }
  | { ok: false; mismatch: ProviderMismatch };

export interface FocusProviderTally {
  known: ("aws" | "azure" | "gcp")[];
  unmappedRows: number;
}

/**
 * Same mapping as mapProvider() in focus-parser.ts. Duplicated on purpose:
 * that one is private to the parser and returns "unknown", while here we need
 * to distinguish "unmapped but present" from "absent".
 */
function mapProviderName(raw: string): "aws" | "azure" | "gcp" | "unknown" {
  const lc = raw.toLowerCase().trim();
  if (lc.includes("aws") || lc.includes("amazon")) return "aws";
  if (lc.includes("microsoft") || lc.includes("azure")) return "azure";
  if (lc.includes("google")) return "gcp";
  return "unknown";
}

/**
 * Counts the distinct providers declared inside a FOCUS file.
 *
 * Runs over the RAW csv rather than reusing parseFOCUSCSV, because that parser
 * drops rows with cost <= 0 and Tax lines BEFORE looking at ProviderName. A
 * file whose only Azure rows happen to be credits would then look like a
 * single-provider AWS file, and the lane check would pass on data it should
 * have flagged.
 */
export function tallyFocusProviders(csvContent: string): FocusProviderTally {
  const result = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim().toLowerCase(),
  });

  const known = new Set<"aws" | "azure" | "gcp">();
  let unmappedRows = 0;

  for (const row of result.data as Record<string, string>[]) {
    const raw = (
      row["serviceprovidername"] ||
      row["hostprovidername"] ||
      row["providername"] ||
      row["publishername"] ||
      ""
    ).trim();
    if (!raw) continue;
    const mapped = mapProviderName(raw);
    if (mapped === "unknown") unmappedRows++;
    else known.add(mapped);
  }

  return { known: Array.from(known), unmappedRows };
}

/**
 * Decides whether a billing file may be analysed in the requested lane, and
 * parses it when it may.
 *
 * Never filters rows to make a file fit: a partial accept would change the
 * projected cost without telling anyone, and the user could no longer
 * reconcile the report against their invoice. Accept whole, or reject whole.
 *
 * Lets readHeaders() throw through to the caller — an unreadable header is an
 * upload problem, not a lane problem.
 */
export function guardBillingFile(csvContent: string, expected?: LaneExpectation): GuardResult {
  const headers = readHeaders(csvContent);
  const detection = detectFormat(headers);

  if (!detection.format) {
    // No lane given still needs an `expected` value for the message; FOCUS is
    // the neutral default since it's the format we'd steer the user toward.
    const lane = expected ?? "focus";
    if (detection.ambiguous) {
      return {
        ok: false,
        mismatch: { kind: "ambiguous", expected: lane, candidates: detection.candidates },
      };
    }
    return {
      ok: false,
      mismatch: { kind: "unrecognized", expected: lane, focusMissing: detection.focusMissing },
    };
  }

  const format = detection.format;

  // No lane declared — callers that predate the lane concept keep working.
  if (!expected) {
    return { ok: true, parsed: parseAs(csvContent, format), detected: format };
  }

  if (expected === "focus") {
    if (format === "focus") {
      return { ok: true, parsed: parseAs(csvContent, format), detected: format };
    }
    return { ok: false, mismatch: { kind: "native-in-focus-lane", expected, detected: format } };
  }

  // expected is a concrete cloud from here on.
  if (format === expected) {
    return { ok: true, parsed: parseAs(csvContent, format), detected: format };
  }

  if (format === "focus") {
    const tally = tallyFocusProviders(csvContent);
    const foreign = tally.known.filter((p) => p !== expected);
    if (foreign.length > 0) {
      return {
        ok: false,
        mismatch: {
          kind: "wrong-cloud",
          expected,
          detected: "focus",
          detectedProviders: tally.known,
          unmappedProviderRows: tally.unmappedRows,
        },
      };
    }
    // Unmapped ProviderName values alone don't reject: FOCUS carries clouds we
    // don't model yet (Oracle, Alibaba) plus vendor spellings we haven't seen.
    // Refusing on those would block files that are perfectly analysable. We
    // only report the count so the caller can surface it.
    return { ok: true, parsed: parseAs(csvContent, format), detected: format };
  }

  return { ok: false, mismatch: { kind: "wrong-cloud", expected, detected: format } };
}

const CLOUD_LABELS: Record<LaneExpectation, string> = {
  aws: "Amazon Web Services",
  azure: "Microsoft Azure",
  gcp: "Google Cloud",
  focus: "FOCUS",
};

function labelFor(key: LaneExpectation | DetectedFormat): string {
  return CLOUD_LABELS[key as LaneExpectation] ?? key;
}

function joinLabels(keys: (LaneExpectation | DetectedFormat)[]): string {
  const labels = keys.map(labelFor);
  if (labels.length <= 1) return labels.join("");
  return labels.slice(0, -1).join(", ") + " y " + labels[labels.length - 1];
}

/** Spanish copy for the API's `error` field. */
export function mismatchMessage(m: ProviderMismatch): string {
  switch (m.kind) {
    case "wrong-cloud": {
      const found =
        m.detectedProviders && m.detectedProviders.length > 0
          ? joinLabels(m.detectedProviders)
          : labelFor(m.detected ?? "focus");
      const base =
        `Este archivo parece ser de ${found}. Elegiste el carril de ${labelFor(m.expected)}, ` +
        `y para que las reglas y los comandos correspondan a tu nube, los dos tienen que coincidir.`;
      if (m.unmappedProviderRows && m.unmappedProviderRows > 0) {
        return (
          base +
          ` Además, ${m.unmappedProviderRows} fila(s) traen un proveedor que no reconocemos.`
        );
      }
      return base;
    }

    case "native-in-focus-lane":
      return (
        "Este carril solo acepta archivos en formato FOCUS. Tu archivo es un export nativo de " +
        `${labelFor(m.detected ?? "aws")}, que también podemos analizar en su propio carril.`
      );

    case "unrecognized": {
      const base =
        "No reconocemos el formato de este archivo. No encontramos las columnas que identifican " +
        "un export de facturación.";
      if (m.focusMissing && m.focusMissing.length > 0) {
        return (
          base +
          ` El archivo parece FOCUS, pero le faltan columnas obligatorias: ${m.focusMissing.join(", ")}. ` +
          "Vuelve a generar el export incluyéndolas."
        );
      }
      return base;
    }

    case "ambiguous": {
      const base = "No podemos determinar con seguridad de qué nube es este archivo.";
      if (m.candidates && m.candidates.length > 0) {
        return (
          base +
          ` Coincide parcialmente con ${joinLabels(m.candidates)}. ` +
          "Exporta el archivo de facturación directamente de tu proveedor, o usa el formato FOCUS."
        );
      }
      return base;
    }
  }
}
