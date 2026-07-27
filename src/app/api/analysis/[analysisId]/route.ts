import { NextRequest, NextResponse } from "next/server";
import { deleteAnalysis, getAnalysis, verifyAnalysisToken } from "@/engine/analysis-store";

export const runtime = "nodejs";

/**
 * DELETE /api/analysis/{analysisId}
 * Lets "Nueva auditoría" actually remove the data instead of just abandoning
 * it client-side — until now an analysis lived until its 30-minute TTL
 * regardless of whether the user asked to start over.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { analysisId: string } }
) {
  const token = request.headers.get("X-Nimbus-Analysis-Token");
  const analysis = getAnalysis(params.analysisId);
  if (!analysis) {
    return NextResponse.json({ code: "ANALYSIS_EXPIRED", params: {} }, { status: 410 });
  }
  if (!verifyAnalysisToken(params.analysisId, token)) {
    return NextResponse.json({ code: "INVALID_ANALYSIS_TOKEN", params: {} }, { status: 401 });
  }
  deleteAnalysis(params.analysisId);
  return NextResponse.json({ success: true });
}
