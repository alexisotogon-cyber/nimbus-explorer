import { Finding } from "../types";

/**
 * Tool: generate_remediation
 * Formats remediation steps from findings for presentation.
 */

export interface RemediationOutput {
  findingId: string;
  title: string;
  provider: string;
  priority: "crítica" | "alta" | "media" | "baja";
  estimatedSavings: string;
  savingsRange: string;
  investigationSteps: RemediationStep[];
  remediationSteps: RemediationStep[];
  rollbackPlan: string;
  backupStep?: string;
  warnings: string[];
}

export interface RemediationStep {
  order: number;
  description: string;
  type: "cli" | "terraform" | "console";
  provider: string;
  code: string;
  isIrreversible: boolean;
}

export function generateRemediation(finding: Finding): RemediationOutput {
  const priority = getPriorityLabel(finding.priorityScore);
  const investigationSteps: RemediationStep[] = [];
  const remediationSteps: RemediationStep[] = [];
  const warnings: string[] = [];

  let invOrder = 1;
  let remOrder = 1;

  for (const cmd of finding.remediation.commands) {
    const step: RemediationStep = {
      order: cmd.isInvestigation ? invOrder : remOrder,
      description: cmd.label,
      type: cmd.tool,
      provider: cmd.provider,
      code: cmd.snippet,
      isIrreversible: cmd.isIrreversible,
    };

    if (cmd.isInvestigation) {
      investigationSteps.push(step);
      invOrder++;
    } else {
      remediationSteps.push(step);
      remOrder++;
    }
  }

  // Warnings based on risk
  if (finding.risk === "alto") {
    warnings.push("ALTO RIESGO: Validar en ambiente de staging antes de producción.");
  }
  if (finding.risk === "medio") {
    warnings.push("Riesgo medio: Verificar que no hay dependencias antes de ejecutar.");
  }
  if (finding.confidence === "inferencia") {
    warnings.push("Nota: este hallazgo es una inferencia del análisis de costos. Confirmar con métricas reales antes de actuar.");
  }
  if (finding.confidence === "fuera-de-alcance-del-billing") {
    warnings.push("Nota: el billing no provee datos de utilización. Revisar métricas del proveedor antes de tomar acción.");
  }

  // Add irreversible warnings
  const hasIrreversible = remediationSteps.some((s) => s.isIrreversible);
  if (hasIrreversible) {
    warnings.push("Atención: contiene acciones irreversibles — posible pérdida de datos o servicio. Respalda y valida antes de ejecutar.");
  }

  return {
    findingId: finding.id,
    title: finding.title,
    provider: finding.provider,
    priority,
    estimatedSavings: `$${finding.estimatedMonthlySavingsUSD.toFixed(2)}/mes`,
    savingsRange: `$${finding.savingsRange.conservative}–$${finding.savingsRange.optimistic}/mes`,
    investigationSteps,
    remediationSteps,
    rollbackPlan: finding.remediation.rollbackPlan,
    backupStep: finding.remediation.backupStep,
    warnings,
  };
}

export function generateAllRemediations(findings: Finding[]): RemediationOutput[] {
  return findings.map(generateRemediation);
}

function getPriorityLabel(score: number): "crítica" | "alta" | "media" | "baja" {
  if (score >= 75) return "crítica";
  if (score >= 50) return "alta";
  if (score >= 25) return "media";
  return "baja";
}
