import type { AnalysisContext } from "./agent";
import type { Locale } from "@/i18n/config";
import { formatCurrency, formatNumber } from "@/i18n/formatters";
import type { AtlasScreenContext } from "./atlas-screen-context";

export interface DeterministicAtlasAnswer {
  content: string;
  toolCalls: Array<{ tool: string; result: unknown }>;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[¿?¡!.,;: ]+|[¿?¡!.,;: ]+$/g, "")
    .trim();
}

const REQUIRES_EXPLANATION =
  /\b(explica|por que|compara|prioriza|plan|estrateg|recomiend|como redu|como ahorr|deberia|riesgo|ventaja|alternativa|interpreta|explain|why|compare|prioritize|strategy|recommend|how (to )?(save|reduce)|should|risk|advantage|alternative|interpret)/;

export function tryBuildDeterministicAtlasAnswer(
  message: string,
  context: AnalysisContext,
  locale: Locale = "es",
  screenContext?: AtlasScreenContext
): DeterministicAtlasAnswer | null {
  const punctuationOnly = /^[?¿!. ]+$/.test(message.trim());
  const query = normalize(message);
  if (punctuationOnly) {
    return {
      content: locale === "es"
        ? "¿Qué parte quieres que aclare? Puedes preguntarme por una cifra, un hallazgo, el archivo cargado o la sección que tienes abierta."
        : "What would you like me to clarify? You can ask about a figure, a finding, the uploaded file, or the section you have open.",
      toolCalls: [],
    };
  }
  if (!query) return null;
  const es = locale === "es";
  const money = (value: number) => formatCurrency(value, locale);

  if (/^(gracias|muchas gracias|mil gracias|thanks|thank you)[?!. ]*$/.test(query)) {
    return {
      content: es
        ? "Con gusto. Si quieres continuar, puedo ayudarte con una cifra, un hallazgo o el siguiente paso de esta auditoría."
        : "You are welcome. I can continue with a figure, a finding, or the next step in this audit.",
      toolCalls: [],
    };
  }

  if (/^(hola|holi|buenas|buenos dias|buenas tardes|buenas noches|hey|hello|hi|como estas|como te va|que tal|how are you)[?!. ]*$/.test(query)) {
    return {
      content: es
        ? /como estas|como te va|que tal/.test(query)
          ? "Bien, gracias. Estoy listo para ayudarte con tu análisis cloud."
          : "Hola. Puedo resumir tu gasto, la conciliación, escenarios y las oportunidades prioritarias de este análisis."
        : /how are you/.test(query)
          ? "Doing well, thanks. I am ready to help with your cloud analysis."
          : "Hi. I can summarize this analysis's spend, reconciliation, scenarios, and prioritized opportunities.",
      toolCalls: [],
    };
  }

  if (/\b(que es focus|focus standard|what is focus|que es finops|what is finops)\b/.test(query)) {
    return {
      content: es
        ? "FOCUS es el estándar abierto de FinOps para normalizar facturación multicloud. FinOps une Finanzas, Ingeniería y negocio para tomar decisiones de costo con evidencia. Nimbus usa reglas deterministas; Atlas sólo explica el resultado."
        : "FOCUS is the open FinOps standard for normalizing multicloud billing. FinOps brings Finance, Engineering, and business together to make evidence-based cost decisions. Nimbus uses deterministic rules; Atlas only explains the result.",
      toolCalls: [],
    };
  }

  if (/\b(que es (una )?cifra|what is a figure|what is a number)\b/.test(query)) {
    return {
      content: es
        ? "Una **cifra** es un valor numérico. En Nimbus puede representar gasto, ahorro, porcentaje o cantidad de recursos; Atlas indica además su periodo y si proviene de datos confirmados o de una estimación."
        : "A **figure** is a numeric value. In Nimbus it can represent spend, savings, a percentage, or a resource count; Atlas also states its period and whether it comes from confirmed data or an estimate.",
      toolCalls: [],
    };
  }

  if (/\b(que es (la )?nube|que significa cloud|what is (the )?cloud|what does cloud mean)\b/.test(query)) {
    return {
      content: es
        ? "La **nube** es infraestructura y software que consumes como servicios de proveedores como AWS, Azure o Google Cloud. En Nimbus se refiere a los servicios que aparecen en tu facturación: cómputo, almacenamiento, red, bases de datos, IA y otros."
        : "The **cloud** is infrastructure and software consumed as services from providers such as AWS, Azure, or Google Cloud. In Nimbus it means the services found in your bill: compute, storage, networking, databases, AI, and others.",
      toolCalls: [],
    };
  }

  if (/\b(que es (el )?gasto bruto|que significa (el )?gasto bruto|what is gross spend|what does gross spend mean)\b/.test(query)) {
    return {
      content: es
        ? `El **gasto bruto** es el costo de uso antes de restar créditos o reembolsos y antes de sumar impuestos o compras separadas. En el periodo cargado es **${money(context.financialReconciliation.grossUsageCostUSD)}**. Nimbus lo usa como base para detectar desperdicio.`
        : `**Gross spend** is usage cost before subtracting credits or refunds and before adding taxes or separately reported purchases. In the loaded period it is **${money(context.financialReconciliation.grossUsageCostUSD)}**. Nimbus uses it as the waste-detection baseline.`,
      toolCalls: [{
        tool: "query_financial_reconciliation",
        result: context.financialReconciliation,
      }],
    };
  }

  if (
    /\b(que es|quien es|para que sirve)\s+(el\s+)?atlas\b/.test(query) ||
    /\batlas\s+(que es|quien es|para que sirve)\b/.test(query) ||
    /\b(what is|who is|what does)\s+atlas\b/.test(query)
  ) {
    return {
      content: es
        ? "Atlas es la guía FinOps de Nimbus. Explica la factura, los hallazgos y la sección que tienes abierta usando los resultados determinísticos del análisis. **No calcula ni modifica cifras**, y no ejecuta cambios en tu nube."
        : "Atlas is Nimbus's FinOps guide. It explains the bill, findings, and the section you currently have open using deterministic analysis results. It **does not calculate or alter figures**, and it never changes your cloud.",
      toolCalls: [],
    };
  }

  if (/\b(que es|como funciona|para que sirve|what is|how does)\s+(aws\s+)?bedrock\b/.test(query)) {
    return {
      content: es
        ? "Amazon Bedrock es el servicio administrado de AWS que permite invocar modelos fundacionales. En Nimbus, Bedrock sólo se usa para redactar respuestas abiertas de Atlas; los cálculos financieros, la conciliación, los escenarios y los hallazgos siguen siendo determinísticos."
        : "Amazon Bedrock is AWS's managed service for invoking foundation models. Nimbus uses it only for Atlas's open-ended explanations; financial calculations, reconciliation, scenarios, and findings remain deterministic.",
      toolCalls: [],
    };
  }

  if (/\b(que pasa si|si)\s+(bedrock|atlas ia|la ia)\s+(falla|no funciona|esta caido)|fallback|modo emergencia|circuit breaker\b/.test(query)) {
    return {
      content: es
        ? "Si Bedrock falla, Nimbus conserva el análisis completo y Atlas sigue respondiendo las consultas determinísticas con 0 tokens. Las explicaciones abiertas se pausan temporalmente y no deben cambiar ninguna cifra del tablero."
        : "If Bedrock fails, Nimbus keeps the full analysis available and Atlas continues answering deterministic questions with 0 tokens. Open-ended explanations pause temporarily and must not change any dashboard figure.",
      toolCalls: [],
    };
  }

  if (/\b(que usa ia|que es deterministico|que calcula atlas|atlas calcula|que depende de ia|what uses ai|what is deterministic)\b/.test(query)) {
    return {
      content: es
        ? "Nimbus calcula de forma determinística la carga, validación, conciliación, gasto, hallazgos, escenarios y exportaciones. Atlas usa IA únicamente para explicar preguntas abiertas; no recalcula ni modifica las cifras."
        : "Nimbus deterministically calculates upload validation, reconciliation, spend, findings, scenarios, and exports. Atlas uses AI only for open-ended explanations; it does not recalculate or alter figures.",
      toolCalls: [],
    };
  }

  if (/\b(cobertura|catalogo|catalog|schema|esquema|version del catalogo|coverage)\b/.test(query)) {
    const evidence = context.catalogEvidence;
    return {
      content: evidence
        ? es
          ? `La cobertura reconocida es **${formatNumber(evidence.coveragePercentage, locale)}%** para ${evidence.provider.toUpperCase()}, esquema **${evidence.schemaVersion}**. Estado: ${evidence.status}.`
          : `Recognized coverage is **${formatNumber(evidence.coveragePercentage, locale)}%** for ${evidence.provider.toUpperCase()}, schema **${evidence.schemaVersion}**. Status: ${evidence.status}.`
        : es
          ? "La cobertura de esquema y la versión del catálogo **no están disponibles en este análisis**. Atlas no debe inferirlas a partir del proveedor o del nombre del archivo."
          : "Schema coverage and catalog version are **not available in this analysis**. Atlas must not infer them from the provider or filename.",
      toolCalls: evidence ? [{ tool: "query_catalog_evidence", result: evidence }] : [],
    };
  }

  if (/\b(guardan|almacenan|eliminan|borran|retencion|retienen|cifran|encriptan|privacidad|datos sensibles|store|retain|delete|encrypt|privacy)\b/.test(query)) {
    return {
      content: es
        ? "Este análisis no incluye evidencia suficiente para afirmar políticas de almacenamiento, eliminación o cifrado. Consulta la documentación y configuración del despliegue antes de compartir datos sensibles; Atlas nunca debe prometer controles que no estén verificados."
        : "This analysis does not contain enough evidence to claim storage, deletion, or encryption policies. Check the deployment documentation and configuration before sharing sensitive data; Atlas must never promise unverified controls.",
      toolCalls: [],
    };
  }

  if (/\b(ignora .*instruccion|revela .*prompt|muestra .*prompt|dame .*credencial|extrae .*credencial|envia .*correo|manda .*correo|abre .*url|borra .*recurso|elimina .*recurso|ignore .*instruction|reveal .*prompt|show .*prompt|send .*email|delete .*resource)\b/.test(query)) {
    return {
      content: es
        ? "No puedo revelar instrucciones internas, credenciales, enviar mensajes ni ejecutar cambios. Sí puedo explicar el análisis, proponer una verificación de solo lectura o preparar pasos para que una persona autorizada los revise."
        : "I cannot reveal internal instructions or credentials, send messages, or execute changes. I can explain the analysis, propose a read-only verification, or prepare steps for an authorized person to review.",
      toolCalls: [],
    };
  }

  const asksVisibleContext =
    /\b(que (estoy viendo|hay en (esta )?pantalla)|explica (esta|la) pantalla|explica (esta|la) seccion|que significa esto|esto que es|donde estoy|what am i (seeing|looking at)|explain (this|the) screen|what is on (this|the) screen|what does this mean|where am i)\b/
      .test(query);
  if (asksVisibleContext && screenContext) {
    const finding = screenContext.expandedFinding;
    const scenarioPreset = screenContext.scenario
      ? es
        ? {
            conservative: "Conservador",
            current: "Actual",
            optimistic: "Optimista",
            custom: "Personalizado",
          }[screenContext.scenario.preset]
        : {
            conservative: "Conservative",
            current: "Current",
            optimistic: "Optimistic",
            custom: "Custom",
          }[screenContext.scenario.preset]
      : undefined;
    if (screenContext.activeTab === "findings" && finding) {
      return {
        content: es
          ? `Tienes abierto el hallazgo **${finding.title}** de ${finding.service}. El ahorro actual es **${money(finding.estimatedMonthlySavingsUSD)}/mes**, con un rango de **${money(finding.savingsRange.conservative)} a ${money(finding.savingsRange.optimistic)}/mes**.\n\n**Qué hacer ahora:** ${finding.nextAction}`
          : `You have opened the **${finding.title}** finding for ${finding.service}. Current savings are **${money(finding.estimatedMonthlySavingsUSD)}/month**, with a range of **${money(finding.savingsRange.conservative)} to ${money(finding.savingsRange.optimistic)}/month**.\n\n**What to do now:** ${finding.nextAction}`,
        toolCalls: [{ tool: "calculate_savings", result: finding }],
      };
    }

    const descriptions: Record<AtlasScreenContext["activeTab"], string> = es
      ? {
          overview: "Estás en **Resumen**. Aquí ves el gasto observado, el ahorro del escenario, la conciliación y las acciones prioritarias. Sirve para decidir qué revisar primero.",
          findings: "Estás en **Hallazgos**. Cada tarjeta muestra una oportunidad o revisión, su evidencia, rango de ahorro, métrica por confirmar y siguiente acción segura.",
          scenarios: screenContext.scenario
            ? `Estás en **Escenarios**. El escenario **${scenarioPreset}** calcula **${money(screenContext.scenario.monthlySavingsUSD)}/mes** y **${money(screenContext.scenario.annualSavingsUSD)}/año**. La diferencia frente al escenario actual es **${money(screenContext.scenario.deltaFromCurrentUSD)}/mes**. Tienes **${screenContext.scenario.changedVariables}** variables ajustadas; los controles no cambian tu factura ni tu nube.`
            : `Estás en **Escenarios**. Los controles cambian supuestos verificables y recalculan el ahorro; no cambian tu factura. El ahorro actual del portafolio es **${money(context.portfolioSavingsUSD)}/mes**.`,
          markdown: "Estás en **Reporte**. Aquí puedes revisar y exportar el resumen ejecutivo, el plan de acción y la evidencia técnica del mismo análisis.",
        }
      : {
          overview: "You are on **Overview**. It shows observed spend, scenario savings, reconciliation, and prioritized actions so you can decide what to review first.",
          findings: "You are on **Findings**. Each card shows an opportunity or review, its evidence, savings range, metric to confirm, and safe next action.",
          scenarios: screenContext.scenario
            ? `You are on **Scenarios**. The **${scenarioPreset}** scenario calculates **${money(screenContext.scenario.monthlySavingsUSD)}/month** and **${money(screenContext.scenario.annualSavingsUSD)}/year**. The difference from the current scenario is **${money(screenContext.scenario.deltaFromCurrentUSD)}/month**. You have adjusted **${screenContext.scenario.changedVariables}** variables; these controls do not change your bill or cloud.`
            : `You are on **Scenarios**. The controls change verifiable assumptions and recalculate savings; they do not change your bill. Current portfolio savings are **${money(context.portfolioSavingsUSD)}/month**.`,
          markdown: "You are on **Report**. Here you can review and export the executive summary, action plan, and technical evidence from the same analysis.",
        };
    return { content: descriptions[screenContext.activeTab], toolCalls: [] };
  }

  const productConcept =
    /\b(que es|para que sirve|what is|what does)\s+(el\s+|la\s+|los\s+|las\s+)?(resumen|hallazgos?|escenarios?|reporte|conciliacion|ahorro del escenario|overview|findings?|scenarios?|report|reconciliation|scenario savings)\b/
      .exec(query)?.[3];
  if (productConcept) {
    const concept = productConcept.startsWith("hallazgo") || productConcept.startsWith("finding")
      ? "findings"
      : productConcept.startsWith("escenario") || productConcept.startsWith("scenario")
        ? "scenarios"
        : productConcept === "resumen" || productConcept === "overview"
          ? "overview"
          : productConcept.startsWith("concili") || productConcept.startsWith("reconcil")
            ? "reconciliation"
            : productConcept.includes("ahorro")
              ? "scenarioSavings"
              : "report";
    const explanations = es
      ? {
          overview: "El **Resumen** reúne las cifras principales y las acciones que conviene revisar primero.",
          findings: "Los **Hallazgos** son patrones detectados en tu facturación. Separan datos confirmados, estimaciones y casos que necesitan métricas.",
          scenarios: "Los **Escenarios** recalculan el ahorro al cambiar supuestos; no modifican tu factura ni tu infraestructura.",
          report: "El **Reporte** convierte el análisis en un resumen y plan de acción exportable con evidencia técnica.",
          reconciliation: "La **conciliación** explica cómo el gasto bruto se relaciona con créditos, reembolsos, impuestos, compromisos y el neto disponible.",
          scenarioSavings: "El **ahorro del escenario** es el total mensual sin doble conteo calculado con los supuestos seleccionados.",
        }
      : {
          overview: "**Overview** combines the key figures and the actions worth reviewing first.",
          findings: "**Findings** are patterns detected in your billing data. They separate confirmed data, estimates, and cases that need metrics.",
          scenarios: "**Scenarios** recalculate savings when assumptions change; they do not modify your bill or infrastructure.",
          report: "**Report** turns the analysis into an exportable summary and action plan with technical evidence.",
          reconciliation: "**Reconciliation** explains how gross spend relates to credits, refunds, taxes, commitments, and the available net amount.",
          scenarioSavings: "**Scenario savings** is the monthly, de-duplicated total calculated from the selected assumptions.",
        };
    return { content: explanations[concept], toolCalls: [] };
  }

  const asksUploadReview =
    /\b(filas? descartad[ao]s?|registros? descartad[ao]s?|con lo que puedo|lo que (me )?falta|que (puede|puedo) hacer (con )?este archivo|que datos faltan|revision del (archivo|documento)|diagnostico del (archivo|documento)|capacidades? del archivo|por que .*descart|dropped rows?|discarded rows?|what (can|can't|cannot) (this|the) file|what is missing|file review|upload review|upload diagnosis)\b/
      .test(query);
  if (asksUploadReview) {
    const diagnosis = context.uploadDiagnosis;
    if (!diagnosis) {
      return {
        content: es
          ? `Nimbus procesó ${formatNumber(context.usableRows, locale)} de ${formatNumber(context.totalRows, locale)} filas. El detalle de la revisión no está disponible en esta sesión; vuelve a cargar el archivo para que Atlas pueda explicar cada descarte y dato faltante.`
          : `Nimbus processed ${formatNumber(context.usableRows, locale)} of ${formatNumber(context.totalRows, locale)} rows. The detailed upload review is unavailable in this session; upload the file again so Atlas can explain every discarded row and missing field.`,
        toolCalls: [{
          tool: "query_upload_diagnosis",
          result: { totalRows: context.totalRows, usableRows: context.usableRows },
        }],
      };
    }

    const available = diagnosis.capabilities.filter((capability) => capability.ok);
    const missing = diagnosis.capabilities.filter((capability) => !capability.ok);
    const lines: string[] = [
      es
        ? `La revisión significa que Nimbus pudo analizar **${formatNumber(diagnosis.usableRows, locale)} de ${formatNumber(diagnosis.totalDataRows, locale)} filas** de tu archivo ${diagnosis.formatLabel}.`
        : `The review means Nimbus could analyze **${formatNumber(diagnosis.usableRows, locale)} of ${formatNumber(diagnosis.totalDataRows, locale)} rows** from your ${diagnosis.formatLabel} file.`,
    ];

    if (diagnosis.dropped.length > 0) {
      lines.push(`\n**${es ? "Filas descartadas" : "Discarded rows"}**`);
      diagnosis.dropped.forEach((item) => {
        lines.push(`- ${item.reason}: **${formatNumber(item.count, locale)}**. ${item.hint}`);
      });
    }

    if (available.length > 0) {
      lines.push(`\n**${es ? "Lo que sí puedes obtener" : "What you can obtain"}**`);
      available.forEach((capability) => lines.push(`- ${capability.label}`));
    }

    if (missing.length > 0) {
      lines.push(`\n**${es ? "Lo que falta para ampliar el análisis" : "What is missing for a broader analysis"}**`);
      missing.forEach((capability) => {
        lines.push(`- ${capability.label}: ${capability.requires}`);
      });
    }

    if (diagnosis.nextSteps.length > 0) {
      lines.push(`\n**${es ? "Siguiente paso" : "Next step"}**`);
      diagnosis.nextSteps.slice(0, 2).forEach((step) => lines.push(`- ${step}`));
    }

    return {
      content: lines.join("\n"),
      toolCalls: [{ tool: "query_upload_diagnosis", result: diagnosis }],
    };
  }

  const asksPriority = /\b(que (puedo|debo) hacer primero|por donde empiezo|como (puedo )?ahorrar|acciones? prioritarias?|what should i do first|how (can i )?save|priorit)/.test(query);
  if (asksPriority) {
    const findings = context.topFindings.slice(0, 3);
    const actions = findings.length
      ? findings.map((finding, index) => `${index + 1}. **${finding.title}** — ${money(finding.savingsRange.conservative)}–${money(finding.savingsRange.optimistic)}/${es ? "mes" : "month"}`).join("\n")
      : es ? "No hay oportunidades cuantificadas con los datos cargados." : "There are no quantified opportunities in the loaded data.";
    return {
      content: es
        ? `Empieza por estas acciones calculadas con tu factura:\n\n${actions}\n\nVerifica primero la métrica indicada en cada hallazgo antes de aplicar cambios. Las buenas prácticas generales sólo complementan estas prioridades.`
        : `Start with these actions calculated from your bill:\n\n${actions}\n\nVerify each finding's stated metric before making changes. General best practices only complement these priorities.`,
      toolCalls: findings.length ? [{ tool: "calculate_savings", result: findings }] : [],
    };
  }

  const asksTopFinding =
    /\b(mayor hallazgo|hallazgo principal|hallazgo mas (caro|grande)|hallazgo de mayor (costo|ahorro)|mayor oportunidad|top finding|most expensive finding|largest finding|largest opportunity|top opportunity)\b/
      .test(query);
  if (asksTopFinding) {
    const finding = context.topFindings[0];
    return {
      content: finding
        ? es
          ? `El hallazgo prioritario es **${finding.title}**, con un ahorro estimado de **${money(finding.savingsRange.conservative)} a ${money(finding.savingsRange.optimistic)}/mes**. Abre ese hallazgo y valida la métrica indicada antes de aplicar cambios.`
          : `The priority finding is **${finding.title}**, with estimated savings of **${money(finding.savingsRange.conservative)} to ${money(finding.savingsRange.optimistic)}/month**. Open it and validate its stated metric before making changes.`
        : es
          ? "No hay hallazgos cuantificados en este análisis."
          : "There are no quantified findings in this analysis.",
      toolCalls: finding ? [{ tool: "calculate_savings", result: finding }] : [],
    };
  }

  if (/\b(savings plans?|plan de ahorro|compute savings plan)\b/.test(query) &&
      /\b(como|valid|compr|prueb|plazo|periodo|recomiend|how|buy|test|term)\b/.test(query)) {
    return {
      content: es
        ? "AWS Savings Plans son compromisos de gasto por hora de **1 o 3 años**; no se prueban sobre un conjunto pequeño de recursos ni tienen un plazo corto. Primero haz rightsizing, valida al menos 30–60 días de consumo estable y revisa Coverage, Utilization y la recomendación nativa de Cost Explorer antes de comprometerte."
        : "AWS Savings Plans are **1- or 3-year** hourly spend commitments; they are not tested on a small resource set and do not offer a short term. Rightsize first, validate at least 30–60 days of stable usage, and review Coverage, Utilization, and Cost Explorer's native recommendation before committing.",
      toolCalls: [],
    };
  }

  const asksScenario = /\b(escenario|conservador|optimista|supuesto|scenario|assumption|conservative|optimistic)\b/.test(query);
  if (asksScenario) {
    return {
      content: es
        ? `Los escenarios no cambian tu factura: recalculan el ahorro posible al variar supuestos verificables. En este análisis, el ahorro de cartera actual es ${money(context.portfolioSavingsUSD)}/mes. Úsalos para comparar una decisión conservadora con una de mayor potencial; el tablero y las exportaciones usan la misma cifra seleccionada.`
        : `Scenarios do not change your bill: they recalculate possible savings as verifiable assumptions change. In this analysis, current portfolio savings are ${money(context.portfolioSavingsUSD)}/month. Use them to compare a conservative decision with higher potential; the dashboard and exports use the same selected figure.`,
      toolCalls: [{ tool: "calculate_savings", result: { portfolioSavingsUSD: context.portfolioSavingsUSD } }],
    };
  }

  if (REQUIRES_EXPLANATION.test(query)) return null;

  const asksTodaySpend =
    /\b(cuanto (gaste|he gastado|estoy gastando) hoy|gasto de hoy|costo de hoy|how much (did i spend|have i spent|am i spending) today|today'?s spend|today'?s cost)\b/
      .test(query);
  if (asksTodaySpend) {
    const isSingleDay = context.periodStart === context.periodEnd;
    return {
      content: isSingleDay
        ? es
          ? `El archivo cargado corresponde al **${context.periodStart}** y registra **${money(context.financialReconciliation.grossUsageCostUSD)}** de gasto bruto. Confirma que esa fecha sea hoy en la zona horaria de tu cuenta.`
          : `The uploaded file covers **${context.periodStart}** and records **${money(context.financialReconciliation.grossUsageCostUSD)}** in gross spend. Confirm that this date is today in your account's time zone.`
        : es
          ? `No puedo aislar el gasto de hoy con este resumen. El archivo cubre **${context.periodStart} a ${context.periodEnd}** y suma **${money(context.financialReconciliation.grossUsageCostUSD)}** en el periodo. Para responder “hoy” necesito filas diarias que incluyan la fecha actual.`
          : `I cannot isolate today's spend from this summary. The file covers **${context.periodStart} to ${context.periodEnd}** and totals **${money(context.financialReconciliation.grossUsageCostUSD)}** for the period. To answer “today,” I need daily rows that include the current date.`,
      toolCalls: [{
        tool: "query_financial_reconciliation",
        result: {
          periodStart: context.periodStart,
          periodEnd: context.periodEnd,
          grossUsageCostUSD: context.financialReconciliation.grossUsageCostUSD,
        },
      }],
    };
  }

  const asksSpend =
    /\b(cuanto (estoy |llevo |he )?gast|cuanto llevo de gasto|gasto acumulado|gasto total|costo total|total gastado|gasto bruto|costo bruto|gasto mensual proyectado|costo mensual proyectado|how much (am i |have i )?(spending|spent|spend)|total spend|total cost|gross spend|gross cost|projected monthly spend)/
      .test(query);
  const asksNet = /\b(neto|factura neta|net|net invoice|net bill)\b/.test(query);
  const asksCredits = /\b(credito|creditos|reembolso|reembolsos|descuento excluido|credit|credits|refund|refunds)\b/.test(query);
  const asksTax = /\b(impuesto|impuestos|tax|taxes)\b/.test(query);
  const asksRows = /\b(cuantas filas|filas procesadas|filas usadas|registros procesados|how many rows|rows processed|rows used|records processed)\b/.test(query);
  const asksProviders = /\b(que proveedores|cuales proveedores|nubes contiene|proveedores contiene|which providers|which clouds|providers detected)\b/.test(query);
  const asksServices = /\b(en que servicios|servicio mas caro|principal servicio|top servicios|top services|most expensive service|highest spend service)\b/.test(query);
  const asksFinding = asksTopFinding;

  if (!(asksSpend || asksNet || asksCredits || asksTax || asksRows || asksProviders || asksServices || asksFinding)) {
    return null;
  }

  const lines: string[] = [];
  const toolCalls: Array<{ tool: string; result: unknown }> = [];
  const reconciliation = context.financialReconciliation;

  if (asksSpend || asksNet || asksCredits || asksTax) {
    const net = reconciliation.invoiceNetCostUSD ??
      reconciliation.netUsageCostExcludingCommitmentPurchasesUSD;
    lines.push(`- **${es ? "Gasto bruto mensual proyectado" : "Projected monthly gross spend"}:** ${money(context.totalCostUSD)}`);
    lines.push(`- **${es ? "Gasto bruto del periodo cargado" : "Loaded-period gross spend"}:** ${money(reconciliation.grossUsageCostUSD)}`);
    if (asksNet || asksSpend) {
      lines.push(
        `- **${reconciliation.isInvoiceNetComplete
          ? es ? "Neto estimado de factura" : "Estimated net invoice"
          : es ? "Neto de uso sin compras de compromiso" : "Net usage excluding commitment purchases"}:** ${money(net)}`
      );
    }
    if (asksCredits || asksSpend) {
      lines.push(`- **${es ? "Créditos y reembolsos excluidos" : "Excluded credits and refunds"}:** ${money(reconciliation.creditsAndRefundsUSD)}`);
    }
    if (asksTax || asksSpend) {
      lines.push(`- **${es ? "Impuestos excluidos" : "Excluded taxes"}:** ${money(reconciliation.taxesUSD)}`);
    }
    if (reconciliation.commitmentPurchasesUSD > 0) {
      lines.push(`- **${es ? "Compras de compromiso mostradas aparte" : "Commitment purchases shown separately"}:** ${money(reconciliation.commitmentPurchasesUSD)}`);
    }
    toolCalls.push({ tool: "query_financial_reconciliation", result: reconciliation });
  }

  if (asksRows) {
    lines.push(`- **${es ? "Filas procesadas" : "Rows processed"}:** ${formatNumber(context.usableRows, locale)} ${es ? "de" : "of"} ${formatNumber(context.totalRows, locale)}`);
    toolCalls.push({
      tool: "query_upload_diagnosis",
      result: { totalRows: context.totalRows, usableRows: context.usableRows },
    });
  }

  if (asksProviders) {
    lines.push(`- **${es ? "Proveedores detectados" : "Detected providers"}:** ${context.providers.map((provider) => provider.toUpperCase()).join(", ")}`);
    toolCalls.push({ tool: "query_billing", result: { providers: context.providers } });
  }

  if (asksServices) {
    const services = context.topServices.slice(0, asksSpend ? 5 : 3);
    if (services.length > 0) {
      lines.push(`**${es ? "Servicios con mayor gasto" : "Highest-spend services"}:**`);
      services.forEach((service, index) => {
        lines.push(`${index + 1}. ${service.service}: **${money(service.costUSD)}** (${service.percentage}%)`);
      });
      toolCalls.push({ tool: "query_billing", result: { topServices: services } });
    }
  }

  if (asksFinding && context.topFindings.length > 0) {
    const finding = context.topFindings[0];
    lines.push(
      `- **${es ? "Mayor oportunidad priorizada" : "Top prioritized opportunity"}:** ${finding.title} ` +
      `(${money(finding.savingsRange.conservative)}–${money(finding.savingsRange.optimistic)}/${es ? "mes" : "month"})`
    );
    toolCalls.push({ tool: "calculate_savings", result: finding });
  }

  return {
    content:
      `${es
        ? "Respuesta calculada directamente por el motor de Nimbus, sin consumir tokens de IA:"
        : "Answer calculated directly by the Nimbus rules engine, with zero AI tokens:"}\n\n${lines.join("\n")}`,
    toolCalls,
  };
}
