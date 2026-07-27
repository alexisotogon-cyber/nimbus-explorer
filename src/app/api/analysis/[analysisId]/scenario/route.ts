import { NextRequest, NextResponse } from "next/server";
import { calculateScenario } from "@/engine/scenarios";
import { updateAnalysisScenario, verifyAnalysisToken } from "@/engine/analysis-store";
import type { ScenarioInput, ScenarioPreset } from "@/engine/types";

export const runtime = "nodejs";

const PRESETS = new Set<ScenarioPreset>([
  "conservative",
  "current",
  "optimistic",
  "custom",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: { analysisId: string } }
) {
  if (!verifyAnalysisToken(params.analysisId, request.headers.get("X-Nimbus-Analysis-Token"))) {
    return NextResponse.json({ code: "INVALID_ANALYSIS_TOKEN", params: {} }, { status: 401 });
  }

  let body: Partial<ScenarioInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "INVALID_JSON", params: {} }, { status: 400 });
  }

  if (!body.preset || !PRESETS.has(body.preset) || typeof body.overrides !== "object") {
    return NextResponse.json({ code: "INVALID_SCENARIO", params: {} }, { status: 400 });
  }

  const overrides = Object.fromEntries(
    Object.entries(body.overrides ?? {}).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1])
    )
  );
  const selections =
    body.selections && typeof body.selections === "object"
      ? Object.fromEntries(
          Object.entries(body.selections).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
        )
      : undefined;
  const scenario: ScenarioInput = { preset: body.preset, overrides, selections };
  const analysis = updateAnalysisScenario(params.analysisId, scenario);
  if (!analysis) {
    return NextResponse.json({ code: "ANALYSIS_EXPIRED", params: {} }, { status: 410 });
  }

  return NextResponse.json({
    success: true,
    result: calculateScenario(analysis.report, scenario, analysis.scenarioRevision),
  });
}
