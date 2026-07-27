import { NextRequest, NextResponse } from "next/server";
import { fetchFocusFromS3, validateS3Access, FocusS3Config } from "@/engine/focus-s3-connector";
import { calculateSavings } from "@/engine/tools/calculate-savings";
import { buildReport } from "@/engine/tools/build-report";
import { registerAnalysis } from "@/engine/analysis-store";

export const runtime = "nodejs";

/**
 * POST /api/connect-focus
 *
 * Reads the most-recent COMPLETE FOCUS 1.0/1.2 export (CSV.gz or Parquet) from a
 * user-owned S3 bucket written by AWS Data Exports, and runs the full analysis.
 *
 * The connector resolves the run through its Manifest.json — the commit point AWS
 * writes only after every data file finished — and reads every chunk of that run.
 *
 * Console path (verified):
 *   Billing and Cost Management → Data Exports → Create export
 *   → Standard data export → Table: "FOCUS 1.2 with AWS columns"
 *     (or "FOCUS 1.0 with AWS columns")
 *   Ref: https://docs.aws.amazon.com/cur/latest/userguide/dataexports-create-standard.html
 *
 * NOTE ON REGIONS: us-east-1 applies to the export resource and its control plane
 * (the bucket policy scopes aws:SourceArn to arn:aws:bcm-data-exports:us-east-1:...).
 * The destination bucket itself may live in any region — `region` here is the
 * bucket's region.
 *   Ref: https://docs.aws.amazon.com/cur/latest/userguide/dataexports-s3-bucket.html
 *
 * SECURITY: The user's AWS credentials are used ONLY in memory for this request.
 * They are NEVER written to disk, a database, or logs, and are NEVER forwarded
 * to any third party — only to the AWS S3 API.
 * Do NOT add console.log / console.error of accessKeyId, secretAccessKey, or sessionToken.
 *
 * Body: {
 *   accessKeyId: string,
 *   secretAccessKey: string,
 *   sessionToken?: string,
 *   region?: string,          // bucket region, default "us-east-1"
 *   bucket: string,
 *   prefix?: string,          // default "/"
 *   action: "validate" | "analyze"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accessKeyId, secretAccessKey, sessionToken, region, bucket, prefix, action } = body;

    if (!accessKeyId || !secretAccessKey) {
      return NextResponse.json(
        { success: false, error: "Se requieren accessKeyId y secretAccessKey." },
        { status: 400 }
      );
    }
    if (!bucket) {
      return NextResponse.json(
        { success: false, error: "Se requiere el nombre del bucket S3." },
        { status: 400 }
      );
    }

    // Build config — credentials held in memory only for this call
    const config: FocusS3Config = {
      accessKeyId,
      secretAccessKey,
      sessionToken: sessionToken || undefined,
      region: region || "us-east-1",
      bucket: bucket.trim(),
      prefix: (prefix || "").trim(),
    };

    // Validate-only mode
    if (action === "validate") {
      const result = await validateS3Access(config);
      return NextResponse.json({
        success: result.valid,
        message: result.valid
          ? `Acceso confirmado. Se encontraron ${result.objectCount ?? 0} objeto(s) bajo el prefijo.`
          : undefined,
        error: result.error,
      });
    }

    // Full analysis
    const result = await fetchFocusFromS3(config);
    const { records, sourceKey, lastModified, sizeBytes } = result;

    if (records.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            `El export FOCUS no contiene registros con costo > 0. ` +
            `Verifica que el export está generando datos (la primera entrega puede tardar entre 24 y 72 horas).`,
        },
        { status: 400 }
      );
    }

    const report = calculateSavings(records, true /* isFocus */);
    const markdown = buildReport(report);
    const { analysisId, analysisToken } = registerAnalysis(records, report, records.length);

    return NextResponse.json({
      success: true,
      report,
      markdown,
      analysisId,
      analysisToken,
      // Surfaced so the UI can tell the user when the figures came from the
      // fallback path (manifest unusable) and may therefore be partial.
      warnings: result.warnings,
      meta: {
        recordsAnalyzed: records.length,
        sourceKey,
        lastModified: lastModified.toISOString(),
        sizeBytes,
        manifestKey: result.manifestKey,
        chunkCount: result.chunkCount,
        billingPeriod: result.billingPeriod,
        discovery: result.discovery,
        format: result.format,
        isFocus: true,
      },
    });
  } catch (error) {
    // SECURITY: log only the error message, never the raw body or credentials
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("connect-focus error:", msg);

    // Friendly error classification
    if (msg.includes("NoSuchBucket") || msg.includes("no existe")) {
      return NextResponse.json({ success: false, error: msg }, { status: 404 });
    }
    if (msg.includes("AccessDenied") || msg.includes("403") || msg.includes("credencial")) {
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }
    if (
      msg.includes("formato FOCUS") ||
      msg.includes("Parquet") ||
      msg.includes("manifiesto") ||
      msg.includes("extensión") ||
      msg.includes("están vacíos") ||
      msg.includes("no se encontraron") ||
      msg.includes("No se encontraron")
    ) {
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    if (msg.includes("50 MB") || msg.includes("supera")) {
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: `Error: ${msg}` }, { status: 500 });
  }
}
