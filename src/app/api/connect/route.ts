import { NextRequest, NextResponse } from "next/server";
import { fetchCostData, validateCredentials, AWSCredentials } from "@/engine/aws-connector";
import { convertLegacyRecords } from "@/engine/parsers/aws-parser";
import { calculateSavings } from "@/engine/tools/calculate-savings";
import { buildReport } from "@/engine/tools/build-report";
import { registerAnalysis } from "@/engine/analysis-store";
import { buildAwsNoSpendReport } from "@/engine/aws-zero-spend";

export const runtime = "nodejs";

/**
 * POST /api/connect
 * Connects to a real AWS account using the user's own read-only credentials.
 *
 * SECURITY: The user's AWS keys are used ONLY in memory for the duration of
 * this request. They are never written to disk, a database, or logs, and are
 * never forwarded to any third party (only to the AWS Cost Explorer API).
 * Do NOT add logging of `accessKeyId`, `secretAccessKey`, or `sessionToken`.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accessKeyId, secretAccessKey, sessionToken, region, action } = body;

    if (!accessKeyId || !secretAccessKey) {
      return NextResponse.json(
        { success: false, error: "Se requieren accessKeyId y secretAccessKey." },
        { status: 400 }
      );
    }

    const credentials: AWSCredentials = {
      accessKeyId,
      secretAccessKey,
      sessionToken: sessionToken || undefined,
      region: region || "us-east-1",
    };

    if (action === "validate") {
      const result = await validateCredentials(credentials);
      return NextResponse.json({
        success: result.valid,
        message: result.valid ? result.accountInfo : undefined,
        error: result.error,
      });
    }

    const endDate = body.endDate || new Date().toISOString().split("T")[0];
    const startDate = body.startDate || (() => {
      const d = new Date(); d.setDate(d.getDate() - 30);
      return d.toISOString().split("T")[0];
    })();

    const costResult = await fetchCostData({
      credentials,
      startDate,
      endDate,
      granularity: "DAILY",
    });
    const legacyRecords = costResult.records;

    if (legacyRecords.length === 0) {
      const report = buildAwsNoSpendReport({
        startDate,
        endDateExclusive: endDate,
        returnedCostUSD: costResult.returnedCostUSD,
        returnedGroupCount: costResult.returnedGroupCount,
        queriedPeriodCount: costResult.queriedPeriodCount,
      });
      const markdown = buildReport(report);
      const { analysisId, analysisToken } = registerAnalysis([], report, 0);

      return NextResponse.json({
        success: true,
        empty: true,
        report,
        markdown,
        analysisId,
        analysisToken,
        meta: {
          recordsAnalyzed: 0,
          period: { startDate, endDateExclusive: endDate },
          region: credentials.region,
          returnedGroupCount: costResult.returnedGroupCount,
          returnedCostUSD: costResult.returnedCostUSD,
        },
      });
    }

    // Convert legacy records to normalized format
    const records = convertLegacyRecords(legacyRecords);
    const report = calculateSavings(records, false);
    const markdown = buildReport(report);
    const { analysisId, analysisToken } = registerAnalysis(records, report, records.length);

    return NextResponse.json({
      success: true,
      report,
      markdown,
      analysisId,
      analysisToken,
      meta: { recordsAnalyzed: records.length, period: { startDate, endDate }, region: credentials.region },
    });
  } catch (error) {
    console.error("AWS Connect error:", error);
    const message = error instanceof Error ? error.message : "Error desconocido";

    if (message.includes("UnrecognizedClientException") || message.includes("InvalidSignature")) {
      return NextResponse.json({ success: false, error: "Credenciales inválidas." }, { status: 401 });
    }
    if (message.includes("AccessDenied")) {
      const identity = message.match(/arn:aws:iam::\d+:(?:user|role)\/[^\s"]+/)?.[0];
      return NextResponse.json(
        {
          success: false,
          error:
            `Acceso denegado${identity ? ` para ${identity}` : ""}. ` +
            "Adjunta ce:GetCostAndUsage como política de permisos al usuario de estas Access Keys; no como política de confianza.",
        },
        { status: 403 },
      );
    }
    return NextResponse.json({ success: false, error: `Error: ${message}` }, { status: 500 });
  }
}
