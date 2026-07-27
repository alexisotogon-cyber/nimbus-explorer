import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  GetCostAndUsageCommandOutput,
  GroupDefinition,
} from "@aws-sdk/client-cost-explorer";
import { CostRecord } from "./types";

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region?: string;
}

export interface FetchCostParams {
  credentials: AWSCredentials;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  granularity?: "DAILY" | "MONTHLY";
}

export interface FetchCostResult {
  records: CostRecord[];
  /** Every group returned by AWS, including zero and negative-cost groups. */
  returnedGroupCount: number;
  /** Sum at original API precision before Nimbus filters non-positive usage. */
  returnedCostUSD: number;
  /** Number of ResultsByTime periods AWS returned for the requested window. */
  queriedPeriodCount: number;
}

/**
 * Conecta a AWS Cost Explorer con credenciales read-only y retorna
 * registros normalizados para el motor de reglas.
 */
export async function fetchCostData(params: FetchCostParams): Promise<FetchCostResult> {
  const { credentials, startDate, endDate, granularity = "DAILY" } = params;

  const client = new CostExplorerClient({
    region: credentials.region || "us-east-1",
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken }),
    },
  });

  const records: CostRecord[] = [];
  let returnedGroupCount = 0;
  let returnedCostUSD = 0;
  let queriedPeriodCount = 0;
  let nextPageToken: string | undefined;

  const groupBy: GroupDefinition[] = [
    { Type: "DIMENSION", Key: "SERVICE" },
    { Type: "DIMENSION", Key: "USAGE_TYPE" },
  ];

  do {
    const command = new GetCostAndUsageCommand({
      TimePeriod: { Start: startDate, End: endDate },
      Granularity: granularity,
      Metrics: ["UnblendedCost", "UsageQuantity"],
      GroupBy: groupBy,
      NextPageToken: nextPageToken,
    });

    const response: GetCostAndUsageCommandOutput = await client.send(command);

    if (response.ResultsByTime) {
      for (const result of response.ResultsByTime) {
        queriedPeriodCount++;
        const date = result.TimePeriod?.Start || "";

        for (const group of result.Groups || []) {
          returnedGroupCount++;
          const keys = group.Keys || [];
          const service = keys[0] || "Unknown";
          const usageType = keys[1] || "Unknown";
          const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || "0");
          const usage = parseFloat(group.Metrics?.UsageQuantity?.Amount || "0");
          if (Number.isFinite(cost)) returnedCostUSD += cost;

          if (cost > 0) {
            records.push({
              date,
              service,
              usageType,
              region: credentials.region || "us-east-1",
              accountId: "",
              usageQuantity: usage,
              unblendedCost: cost,
              chargeType: "Usage",
            });
          }
        }
      }
    }

    nextPageToken = response.NextPageToken;
  } while (nextPageToken);

  return {
    records,
    returnedGroupCount,
    returnedCostUSD,
    queriedPeriodCount,
  };
}

/**
 * Valida que las credenciales pueden acceder a Cost Explorer.
 * Hace una query mínima (1 día) para verificar permisos.
 */
export async function validateCredentials(credentials: AWSCredentials): Promise<{
  valid: boolean;
  accountInfo?: string;
  error?: string;
}> {
  try {
    const client = new CostExplorerClient({
      region: credentials.region || "us-east-1",
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        ...(credentials.sessionToken && { sessionToken: credentials.sessionToken }),
      },
    });

    // Query minimal: último día
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const command = new GetCostAndUsageCommand({
      TimePeriod: {
        Start: yesterday.toISOString().split("T")[0],
        End: today.toISOString().split("T")[0],
      },
      Granularity: "DAILY",
      Metrics: ["UnblendedCost"],
    });

    await client.send(command);

    return { valid: true, accountInfo: "Conexión exitosa a Cost Explorer" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";

    if (message.includes("credentials") || message.includes("Credential")) {
      return { valid: false, error: "Credenciales inválidas. Verifica Access Key y Secret Key." };
    }
    if (message.includes("AccessDenied") || message.includes("not authorized")) {
      const identity = message.match(/arn:aws:iam::\d+:(?:user|role)\/[^\s"]+/)?.[0];
      return {
        valid: false,
        error:
          `Permisos insuficientes${identity ? ` para ${identity}` : ""}. ` +
          "Adjunta ce:GetCostAndUsage como política de permisos al usuario de estas Access Keys; no como política de confianza.",
      };
    }

    return { valid: false, error: message };
  }
}
