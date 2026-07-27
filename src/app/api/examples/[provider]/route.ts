import { NextRequest, NextResponse } from "next/server";
import {
  getCanonicalExample,
  validateCanonicalExample,
  type ExampleProvider,
} from "@/engine/examples/canonical";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDERS = new Set<ExampleProvider>(["aws", "azure", "gcp", "focus"]);

export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  if (!PROVIDERS.has(params.provider as ExampleProvider)) {
    return NextResponse.json({ code: "UNKNOWN_EXAMPLE_PROVIDER", params: {} }, { status: 404 });
  }

  const example = getCanonicalExample(params.provider as ExampleProvider);
  const warnings = validateCanonicalExample(example);
  if (warnings.length > 0) {
    return NextResponse.json(
      { code: "EXAMPLE_VALIDATION_FAILED", params: { warnings } },
      { status: 500 }
    );
  }

  const artifact = request.nextUrl.searchParams.get("artifact");
  if (artifact === "sql") {
    if (!example.sql) {
      return NextResponse.json({ code: "SQL_NOT_AVAILABLE", params: {} }, { status: 404 });
    }
    return new NextResponse(example.sql, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": 'attachment; filename="nimbus-gcp-standard-export-query.sql"',
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return new NextResponse(example.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${example.filename}"`,
      "Cache-Control": "public, max-age=3600",
      "X-Nimbus-Example-Rows": "3",
      "X-Nimbus-Source-Version": example.sourceVersion,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
