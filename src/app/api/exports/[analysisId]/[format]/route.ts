import { NextRequest, NextResponse } from "next/server";
import { getAnalysis, verifyAnalysisToken } from "@/engine/analysis-store";
import { buildReportExportModel } from "@/engine/exports/model";
import { buildMarkdownExport, buildAiContextMarkdown } from "@/engine/exports/markdown";
import { buildExcelExport } from "@/engine/exports/excel";
import { buildPdfExport } from "@/engine/exports/pdf";
import { isLocale } from "@/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMATS = new Set(["pdf", "xlsx", "md"]);

function safeFilename(model: ReturnType<typeof buildReportExportModel>, extension: string) {
  const providers = model.meta.providers.join("-").toLowerCase().replace(/[^a-z0-9-]/g, "");
  return `nimbus-finops-${providers || "cloud"}-${model.meta.periodEnd || "report"}-${model.locale}.${extension}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { analysisId: string; format: string } }
) {
  if (!FORMATS.has(params.format)) {
    return NextResponse.json({ code: "INVALID_EXPORT_FORMAT", params: {} }, { status: 400 });
  }
  const localeParam = request.nextUrl.searchParams.get("locale") ?? "es";
  if (!isLocale(localeParam)) {
    return NextResponse.json({ code: "INVALID_LOCALE", params: {} }, { status: 400 });
  }
  const stored = getAnalysis(params.analysisId);
  if (!stored) {
    return NextResponse.json({ code: "ANALYSIS_EXPIRED", params: {} }, { status: 410 });
  }
  if (!verifyAnalysisToken(params.analysisId, request.headers.get("X-Nimbus-Analysis-Token"))) {
    return NextResponse.json({ code: "INVALID_ANALYSIS_TOKEN", params: {} }, { status: 401 });
  }

  try {
    const model = buildReportExportModel(stored, params.analysisId, localeParam);
    let body: BodyInit;
    let type: string;
    if (params.format === "pdf") {
      body = new Uint8Array(await buildPdfExport(model));
      type = "application/pdf";
    } else if (params.format === "xlsx") {
      body = new Uint8Array(await buildExcelExport(model));
      type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else {
      // technical stays the default: existing callers (the dashboard's
      // "Copiar contexto para IA" button hits this same route) keep working
      // unless they explicitly opt into the shorter ai profile.
      const profile = request.nextUrl.searchParams.get("profile") === "ai" ? "ai" : "technical";
      body = profile === "ai" ? buildAiContextMarkdown(model) : buildMarkdownExport(model);
      type = "text/markdown; charset=utf-8";
    }
    return new NextResponse(body, {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `attachment; filename="${safeFilename(model, params.format)}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Export generation failed", error);
    return NextResponse.json({ code: "EXPORT_GENERATION_FAILED", params: {} }, { status: 500 });
  }
}
