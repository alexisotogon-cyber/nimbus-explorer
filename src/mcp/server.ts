/**
 * MCP Server — FinOps Agent Multi-Cloud.
 * Exposes tools via JSON-RPC stdio protocol.
 */

import { NormalizedCostRecord, CloudProvider } from "../engine/types";
import { parseCSVAutoDetect } from "../engine/parsers";
import { generateDemoData } from "../engine/demo-data";
import { queryBilling } from "../engine/tools/query-billing";
import { calculateSavings } from "../engine/tools/calculate-savings";
import { generateAllRemediations } from "../engine/tools/generate-remediation";
import { buildReport } from "../engine/tools/build-report";

export const MCP_TOOLS = [
  {
    name: "query_billing",
    description: "Consulta y agrega datos de billing multi-nube.",
    inputSchema: {
      type: "object" as const,
      properties: {
        csvContent: { type: "string", description: "CSV content (optional if useDemo=true)" },
        useDemo: { type: "boolean", description: "Use demo data" },
        provider: { type: "string", enum: ["aws", "azure", "gcp"], description: "Provider for demo" },
      },
    },
  },
  {
    name: "calculate_savings",
    description: "Ejecuta el motor de reglas multi-nube completo.",
    inputSchema: {
      type: "object" as const,
      properties: {
        csvContent: { type: "string", description: "CSV content" },
        useDemo: { type: "boolean", description: "Use demo data" },
        provider: { type: "string", enum: ["aws", "azure", "gcp"], description: "Provider for demo" },
      },
    },
  },
  {
    name: "generate_remediation",
    description: "Genera planes de remediación multi-proveedor.",
    inputSchema: {
      type: "object" as const,
      properties: {
        csvContent: { type: "string", description: "CSV content" },
        useDemo: { type: "boolean", description: "Use demo data" },
        provider: { type: "string", enum: ["aws", "azure", "gcp"], description: "Provider for demo" },
      },
    },
  },
  {
    name: "build_report",
    description: "Genera reporte ejecutivo multi-nube en Markdown.",
    inputSchema: {
      type: "object" as const,
      properties: {
        csvContent: { type: "string", description: "CSV content" },
        useDemo: { type: "boolean", description: "Use demo data" },
        provider: { type: "string", enum: ["aws", "azure", "gcp"], description: "Provider for demo" },
      },
    },
  },
];

function getRecords(input: { csvContent?: string; useDemo?: boolean; provider?: string }): NormalizedCostRecord[] {
  if (input.useDemo) {
    return generateDemoData((input.provider as CloudProvider) || undefined);
  }
  if (input.csvContent) {
    return parseCSVAutoDetect(input.csvContent).records;
  }
  throw new Error('Se requiere "csvContent" o "useDemo": true.');
}

export function handleToolCall(toolName: string, input: Record<string, unknown>): unknown {
  switch (toolName) {
    case "query_billing":
      return queryBilling(getRecords(input as { csvContent?: string; useDemo?: boolean; provider?: string }));
    case "calculate_savings":
      return calculateSavings(getRecords(input as { csvContent?: string; useDemo?: boolean; provider?: string }));
    case "generate_remediation": {
      const report = calculateSavings(getRecords(input as { csvContent?: string; useDemo?: boolean; provider?: string }));
      return generateAllRemediations(report.findings);
    }
    case "build_report": {
      const report = calculateSavings(getRecords(input as { csvContent?: string; useDemo?: boolean; provider?: string }));
      return { markdown: buildReport(report), report };
    }
    default:
      throw new Error(`Tool desconocida: ${toolName}`);
  }
}

async function main() {
  const decoder = new TextDecoder();
  let buffer = "";

  process.stdout.write(JSON.stringify({
    jsonrpc: "2.0",
    method: "initialized",
    params: { serverInfo: { name: "finops-agent", version: "2.0.0" }, capabilities: { tools: {} } },
  }) + "\n");

  process.stdin.on("data", (chunk: Buffer) => {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        const response = handleMessage(message);
        if (response) process.stdout.write(JSON.stringify(response) + "\n");
      } catch (err) {
        process.stderr.write(`Error: ${err}\n`);
      }
    }
  });
}

function handleMessage(message: { id?: number | string; method: string; params?: Record<string, unknown> }) {
  switch (message.method) {
    case "tools/list":
      return { jsonrpc: "2.0", id: message.id, result: { tools: MCP_TOOLS } };
    case "tools/call": {
      const params = message.params as { name: string; arguments?: Record<string, unknown> };
      try {
        const result = handleToolCall(params.name, params.arguments || {});
        return { jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } };
      } catch (err) {
        return { jsonrpc: "2.0", id: message.id, error: { code: -32000, message: err instanceof Error ? err.message : "Error" } };
      }
    }
    default:
      return null;
  }
}

if (require.main === module) {
  main();
}
