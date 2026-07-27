import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { ParseResult } from "@/engine/parsers";
import { generateDemoData, type DemoComplexity, type DemoVariant } from "@/engine/demo-data";
import { calculateSavings } from "@/engine/tools/calculate-savings";
import { buildReport } from "@/engine/tools/build-report";
import { diagnoseUpload, FileDiagnosis } from "@/engine/validation/file-check";
import {
  guardBillingFile,
  mismatchMessage,
  LaneExpectation,
  ProviderMismatch,
} from "@/engine/validation/provider-guard";
import { AnalysisResponse, CloudProvider } from "@/engine/types";
import { registerAnalysis } from "@/engine/analysis-store";

export const runtime = "nodejs";

type AnalyzeResponse = AnalysisResponse & {
  markdown?: string;
  diagnosis?: FileDiagnosis;
  providerMismatch?: ProviderMismatch;
  supplementalDataset?: {
    datasetType: ParseResult["datasetType"];
    sourceSchemaVersion: string;
    rows: number;
    schemaCoverage: ParseResult["schemaCoverage"];
  };
};

/** True if the buffer looks like a .xlsx/.xlsm (ZIP magic bytes "PK\x03\x04"). */
function looksLikeXlsx(buffer: Buffer, filename: string): boolean {
  if (/\.xlsx?$|\.xlsm$/i.test(filename)) return true;
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

/** Reads the first sheet of an Excel workbook and returns it as CSV text. */
function xlsxToCsv(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("El archivo Excel no tiene hojas.");
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_csv(sheet);
}

const VALID_LANES: LaneExpectation[] = ["aws", "azure", "gcp", "focus"];
const VALID_DEMO_COMPLEXITIES: DemoComplexity[] = ["simple", "medium", "complex"];
const VALID_DEMO_VARIANTS: DemoVariant[] = ["standard", "ai", "credits", "commitments", "data-quality", "mixed"];

type LaneResolution =
  | { kind: "none" }
  | { kind: "lane"; lane: LaneExpectation }
  | { kind: "invalid"; raw: string };

/**
 * Resolves the lane the user picked in step 1.
 *
 * An ABSENT lane and an INVALID lane are not the same thing and must not collapse
 * into the same `undefined`. When they did, `provider=oracle` silently disabled the
 * whole cross-cloud guard: the caller asked for an Oracle lane, got no lane at all,
 * and any AWS or Azure file was accepted as if the lane had matched. Absent means
 * "parse whatever it is"; invalid means "reject the request".
 */
function resolveLane(raw: unknown): LaneResolution {
  if (raw === undefined || raw === null) return { kind: "none" };
  if (typeof raw !== "string") return { kind: "invalid", raw: String(raw) };
  const lc = raw.trim().toLowerCase();
  if (lc === "") return { kind: "none" };
  if ((VALID_LANES as string[]).includes(lc)) return { kind: "lane", lane: lc as LaneExpectation };
  return { kind: "invalid", raw: raw.trim() };
}

function invalidLaneMessage(raw: string): string {
  return (
    `El proveedor "${raw}" no es un carril válido. ` +
    `Usa uno de: ${VALID_LANES.join(", ")}. ` +
    "Si tu factura viene de otra nube, expórtala en formato FOCUS y usa el carril focus."
  );
}

/**
 * Explains a zero-row parse instead of leaving the user with a bare "no valid
 * records". A file whose format was recognized but yielded nothing is almost
 * always one of three things, and the parser's own counters know which.
 */
function zeroRecordsHint(
  parseResult: ParseResult | undefined,
  diagnosis: FileDiagnosis | undefined
): string {
  if (!diagnosis || diagnosis.totalDataRows === 0) {
    return " El archivo no tiene filas de datos debajo del encabezado.";
  }
  const d = parseResult?.diagnostics;
  if (d?.sourceKind && d.sourceKind !== "detailed") {
    const source =
      d.sourceKind === "aws-cost-explorer-summary"
        ? "AWS Cost Explorer"
        : d.sourceKind === "azure-cost-analysis-summary"
          ? "Azure Cost Analysis"
          : "GCP Reports/Cost table";
    if (d.zeroCostRows === d.totalRows && d.totalRows > 0) {
      return (
        ` El archivo fue reconocido como un resumen de ${source} con ` +
        `${d.summaryPeriodCount ?? 0} ${(d.summaryPeriodCount ?? 0) === 1 ? "periodo" : "periodos"}, pero todos los importes son $0. ` +
        "No se generan recomendaciones porque no existe gasto positivo que optimizar."
      );
    }
    return (
      ` El archivo fue reconocido como un resumen agregado de ${source}, ` +
      "pero no contiene gasto observado positivo. Revisa filtros, intervalo y métrica de costo."
    );
  }
  const parts: string[] = [
    ` Se leyeron ${diagnosis.totalDataRows} filas y ninguna resultó analizable.`,
  ];
  if (d && d.unparsableAmountRows === 0 && d.unparsableDateRows === 0 && d.creditRows === 0) {
    // Nothing was rejected for its content, so the columns themselves didn't line
    // up: the header names don't match what the detected format expects.
    parts.push(
      `El formato detectado fue ${diagnosis.formatLabel}, pero las columnas de costo o de fecha ` +
        "no coinciden con los nombres esperados. Revisa el encabezado del archivo."
    );
  }
  if (d && d.creditRows > 0 && d.creditRows === diagnosis.totalDataRows) {
    parts.push("Todas las filas son créditos o reembolsos, no hay gasto que analizar.");
  }
  if (d && d.unparsableDateRows > 0) {
    parts.push(`${d.unparsableDateRows} filas no traían una fecha interpretable.`);
  }
  if (d && d.unparsableAmountRows > 0) {
    parts.push(`${d.unparsableAmountRows} filas no traían un importe interpretable.`);
  }
  return parts.join(" ");
}

type GuardOutcome =
  | { kind: "ok"; parsed: ParseResult }
  | { kind: "mismatch"; mismatch: ProviderMismatch }
  | { kind: "error"; message: string; mismatch: ProviderMismatch };

/**
 * Runs the guard and turns a thrown parse/header error into a reportable
 * "unrecognized" outcome, so the caller never has to dead-end on a 500.
 */
function runGuard(csvContent: string, lane: LaneExpectation | undefined): GuardOutcome {
  try {
    const result = guardBillingFile(csvContent, lane);
    if (result.ok) return { kind: "ok", parsed: result.parsed };
    return { kind: "mismatch", mismatch: result.mismatch };
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "No se pudo leer el archivo.",
      mismatch: { kind: "unrecognized", expected: lane ?? "focus" },
    };
  }
}

/**
 * POST /api/analyze
 * Accepts:
 * - FormData with a billing file — CSV or Excel (.xlsx/.xlsm) — plus an
 *   optional `provider` field carrying the lane picked in step 1
 * - JSON body: { useDemo: true, provider?: "aws"|"azure"|"gcp" }
 *            | { csvContent: string, provider?: "aws"|"azure"|"gcp"|"focus" }
 */
export async function POST(request: NextRequest): Promise<NextResponse<AnalyzeResponse>> {
  try {
    const contentType = request.headers.get("content-type") || "";

    let records;
    let isFocus = false;
    let rawCsv: string | undefined;
    let parseResult: ParseResult | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const laneResolution = resolveLane(formData.get("provider"));
      if (laneResolution.kind === "invalid") {
        return NextResponse.json(
          { success: false, error: invalidLaneMessage(laneResolution.raw) },
          { status: 400 }
        );
      }
      const lane = laneResolution.kind === "lane" ? laneResolution.lane : undefined;

      if (!file) {
        return NextResponse.json(
          { success: false, error: "No se proporcionó archivo." },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.length === 0) {
        return NextResponse.json(
          { success: false, error: "El archivo está vacío." },
          { status: 400 }
        );
      }

      let csvContent: string;
      if (looksLikeXlsx(buffer, file.name)) {
        try {
          csvContent = xlsxToCsv(buffer);
        } catch (err) {
          return NextResponse.json(
            {
              success: false,
              error:
                "No se pudo leer el archivo Excel. Verifica que sea un .xlsx válido y que la primera hoja tenga tu tabla de facturación." +
                (err instanceof Error ? ` (${err.message})` : ""),
            },
            { status: 400 }
          );
        }
      } else {
        csvContent = buffer.toString("utf-8");
      }

      if (!csvContent.trim()) {
        return NextResponse.json(
          { success: false, error: "El archivo está vacío." },
          { status: 400 }
        );
      }

      const outcome = runGuard(csvContent, lane);
      if (outcome.kind === "error") {
        return NextResponse.json({
          success: false,
          error: outcome.message,
          providerMismatch: outcome.mismatch,
        });
      }
      if (outcome.kind === "mismatch") {
        // 200, not 400: the file is fine, it's just in the wrong lane.
        // `diagnosis` is deliberately omitted — diagnoseUpload would report
        // "0 usable rows", which is misleading here.
        return NextResponse.json({
          success: false,
          error: mismatchMessage(outcome.mismatch),
          providerMismatch: outcome.mismatch,
        });
      }

      rawCsv = csvContent;
      parseResult = outcome.parsed;
      records = parseResult.records;
      isFocus = parseResult.isFocus;
    } else {
      const body = await request.json().catch(() => ({}));
      const laneResolution = resolveLane(body.provider);
      if (laneResolution.kind === "invalid") {
        return NextResponse.json(
          { success: false, error: invalidLaneMessage(laneResolution.raw) },
          { status: 400 }
        );
      }
      const lane = laneResolution.kind === "lane" ? laneResolution.lane : undefined;

      if (body.useDemo) {
        // Demo data only exists for the three native clouds; "focus" is a file
        // format, not a provider, so it falls back to the multi-cloud mix.
        const provider =
          lane === "aws" || lane === "azure" || lane === "gcp"
            ? (lane as CloudProvider)
            : undefined;
        const complexity = VALID_DEMO_COMPLEXITIES.includes(body.demo?.complexity)
          ? body.demo.complexity as DemoComplexity
          : "medium";
        const variant = VALID_DEMO_VARIANTS.includes(body.demo?.variant)
          ? body.demo.variant as DemoVariant
          : "standard";
        records = generateDemoData({ provider: provider ?? "aws", complexity, variant });
      } else if (body.csvContent) {
        const outcome = runGuard(body.csvContent, lane);
        if (outcome.kind === "error") {
          return NextResponse.json({
            success: false,
            error: outcome.message,
            providerMismatch: outcome.mismatch,
          });
        }
        if (outcome.kind === "mismatch") {
          return NextResponse.json({
            success: false,
            error: mismatchMessage(outcome.mismatch),
            providerMismatch: outcome.mismatch,
          });
        }

        rawCsv = body.csvContent;
        parseResult = outcome.parsed;
        records = parseResult.records;
        isFocus = parseResult.isFocus;
      } else {
        return NextResponse.json(
          { success: false, error: 'Enviar un archivo CSV/Excel o { "useDemo": true } para datos de demostración.' },
          { status: 400 }
        );
      }
    }

    // Diagnosis is only meaningful for user-uploaded files (not the random demo).
    const diagnosis = rawCsv && parseResult ? diagnoseUpload(rawCsv, parseResult) : undefined;

    if (records.length === 0) {
      if (parseResult && parseResult.supplementalRecords.length > 0) {
        return NextResponse.json({
          success: false,
          error:
            `Se validó un dataset FOCUS ${parseResult.datasetType} con ` +
            `${parseResult.supplementalRecords.length} filas. Este dataset aporta contexto financiero, ` +
            "pero no contiene consumo granular para ejecutar reglas de optimización.",
          supplementalDataset: {
            datasetType: parseResult.datasetType,
            sourceSchemaVersion: parseResult.sourceSchemaVersion,
            rows: parseResult.supplementalRecords.length,
            schemaCoverage: parseResult.schemaCoverage,
          },
          diagnosis,
        });
      }
      // 200, not 400: the diagnosis panel explains exactly what's missing
      // instead of a dead-end generic error.
      return NextResponse.json({
        success: false,
        error:
          "No se encontraron registros de costo válidos en el archivo." +
          zeroRecordsHint(parseResult, diagnosis),
        diagnosis,
      });
    }

    const report = calculateSavings(
      records,
      isFocus,
      parseResult?.diagnostics,
      parseResult?.schemaCoverage
    );
    const markdown = buildReport(report);
    const { analysisId, analysisToken } = registerAnalysis(
      records,
      report,
      parseResult?.diagnostics?.totalRows ?? records.length,
      diagnosis
    );

    return NextResponse.json({ success: true, report, markdown, diagnosis, analysisId, analysisToken });
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error interno." },
      { status: 500 }
    );
  }
}
