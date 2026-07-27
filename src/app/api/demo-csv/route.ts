import { NextRequest, NextResponse } from "next/server";
import { generateDemoCSV, type DemoComplexity, type DemoVariant } from "@/engine/demo-data";
import { CloudProvider } from "@/engine/types";

/**
 * GET /api/demo-csv?provider=aws|azure|gcp
 * Returns a downloadable demo CSV file.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const provider = request.nextUrl.searchParams.get("provider") as CloudProvider | null;
  const complexity = request.nextUrl.searchParams.get("complexity");
  const variant = request.nextUrl.searchParams.get("variant");
  const csv = generateDemoCSV({
    provider: provider === "aws" || provider === "azure" || provider === "gcp" ? provider : "aws",
    complexity: complexity === "simple" || complexity === "medium" || complexity === "complex" ? complexity as DemoComplexity : "medium",
    variant: variant === "standard" || variant === "ai" || variant === "credits" || variant === "commitments" || variant === "data-quality" || variant === "mixed" ? variant as DemoVariant : "standard",
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="finops-demo-${provider || "multicloud"}.csv"`,
    },
  });
}
