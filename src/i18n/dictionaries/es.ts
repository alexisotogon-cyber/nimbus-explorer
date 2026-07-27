/* Spanish dictionary — the SOURCE OF TRUTH for the whole i18n layer.
   en.ts is typed against the shape of this file, so a key added here without an
   English counterpart is a compile error, never a silent gap.

   KEY CONVENTION (one convention, applied everywhere):
   - Keys are nested objects grouped by UI area, and always written in English
     (`header.newAudit`), even though the Spanish value is the original text. The
     key names a concept; the value is one of its translations. English keys keep
     the two dictionaries structurally readable side by side.
   - Call sites address a key by dot path: t("header.newAudit"). The path union is
     derived from this object, so an unknown path is a compile error too.
   - Interpolation uses named markers: "{count}", "{language}". See translate.ts
     for why markers and not concatenation.
   - A countable string is not a plain string but a { one, other } pair, so the
     plural form is chosen by the helper and never by ad-hoc string surgery.
   - Grouping follows the UI area, NOT the file: one phrase shown by two
     components is one key (see common.copy, used by three copy buttons).

   THE SPANISH SIDE IS THE TEXT THAT SHIPS TODAY, character for character. It was
   moved here, not rewritten: any wording improvement made during the move would
   be a copy change disguised as a refactor, and nothing would catch it. Phrases
   worth improving are reported, not edited.

   Terms that are NOT language — FOCUS columns, framework codes, product names,
   CLI snippets, rule ids — stay identical in both dictionaries. glossary.ts holds
   the list and test-i18n-glossary.mjs enforces it.

   Covered: src/components/**. Still pending: src/app/** (page copy, metadata, API
   route messages) and the engine's generated text (report markdown, finding
   descriptions, month names in build-report.ts). */

export const es = {
  common: {
    loading: "Cargando…",
    cancel: "Cancelar",
    close: "Cerrar",
    retry: "Reintentar",
    /* One pair of keys for every copy-to-clipboard button in the product: the
       finding-card snippet, both IAM policy blocks and the markdown export. */
    copy: "Copiar",
    copied: "Copiado",
    /* Monthly unit suffix, appended to an already formatted amount
       ("$1,234.00/mes"). Money formatting itself stays in the engine's
       formatUSD — USD is the only currency. */
    perMonth: "/mes",
    // Countable units live as {one, other} pairs: the product prints day,
    // finding and row counts constantly and each one needs the same treatment.
    day: {
      one: "{count} día",
      other: "{count} días",
    },
    finding: {
      one: "{count} hallazgo",
      other: "{count} hallazgos",
    },
    row: {
      one: "{count} fila",
      other: "{count} filas",
    },
  },

  header: {
    // Brand name and tagline are deliberately NOT translated — see glossary.ts.
    tagline: "Cloud Cost Explorer",
    newAudit: "Nueva auditoría",
    askAtlas: "Preguntar a Atlas",
    closeAtlas: "Cerrar Atlas",
    themeGroupLabel: "Tema de la interfaz",
    languageGroupLabel: "Idioma de la interfaz",
    // {language} is filled with LOCALE_LABELS[locale], i.e. the target language
    // named in its own language ("Cambiar a English").
    switchToLanguage: "Cambiar a {language}",
  },

  upload: {
    title: "Cargar tu facturación",
    sample: "Descargar archivo de ejemplo",
    /* {pick} is the inline file-picker <label>, not a value: the sentence wraps a
       control, and English puts it in a different place, so it travels as a
       marker instead of two concatenated halves. */
    dropzone: "Arrastra tu archivo CSV o Excel aquí o {pick}",
    dropzonePick: "selecciónalo",
    /* One hint per lane. The lane keys are identifiers (LaneExpectation), so they
       are not translated; the export names inside the sentences are product
       names and stay as they are. */
    laneHint: {
      aws: "CSV de Cost Explorer, CUR o Data Exports; también admite Excel y FOCUS.",
      azure: "CSV o Excel de Cost Analysis, Cost Details Actual/Amortized o FOCUS.",
      gcp: "CSV de Reports, Cost table, una consulta del export Standard/Detailed de BigQuery o FOCUS.",
      focus: "CSV o Excel en formato FOCUS (AWS, Azure o GCP).",
    },
    removeFile: "Quitar",
    analyzing: "Analizando...",
    analyze: "Analizar costos",
    trust: {
      privateTitle: "Privado",
      privateDesc:
        "Se envía solo al backend de Nimbus para analizarlo; no se comparte con terceros.",
      verifiableTitle: "Verificable",
      verifiableDesc: "Cifras calculadas por reglas; la IA no las inventa.",
      auditableTitle: "Auditable",
      auditableDesc: "Cada hallazgo muestra su cálculo y su fuente.",
    },
  },

  connect: {
    /* Shared by both connectors. Field names (Access Key ID, Secret Access Key,
       Session Token) and the region options ("us-east-1 (N. Virginia)") are not
       here: they are AWS identifiers and place names, identical in both
       languages, so they stay as literals at the call site. */
    credentialsTitle: "Tus credenciales, tu control",
    sessionTokenPlaceholder: "Dejar vacío si usas credenciales permanentes",
    validating: "Validando...",

    aws: {
      title: "Conectar cuenta AWS",
      /* The four security bullets. {readOnly}, {inMemory} and {never} are the
         <strong> spans the sentences emphasise — markers, so the emphasis can
         land wherever the sentence needs it in each language. */
      bulletReadOnly: "Usa {readOnly} — solo pueden consultar costos, nada más.",
      bulletReadOnlyStrong: "credenciales de solo lectura (IAM)",
      bulletInMemory: "Se usan {inMemory}.",
      bulletInMemoryStrong: "solo en memoria durante esta solicitud",
      bulletNeverStored: "{never} se almacenan en disco, base de datos ni logs.",
      bulletNeverStoredStrong: "Jamás",
      bulletNoThirdParties:
        "No viajan a terceros — van directo del servidor a la API de AWS Cost Explorer.",
      /* {permission} is the <code>ce:Get*</code> chip: an IAM action, so it is
         never translated, but it sits mid-sentence. */
      recommended:
        "Recomendado: crea un usuario IAM dedicado con la política mínima de abajo (solo {permission}).",
      policyTitle: "Política de permisos para Cost Explorer",
      policyPath:
        "Pégala en IAM → Usuarios → usuario de estas Access Keys → Agregar permisos → Crear política en línea → JSON. No va en la política de confianza de un rol.",
      policyNote:
        "Solo permite consultar costos ({permission}). No concede acceso a recursos, datos ni acciones de escritura.",
      sessionTokenOptional: "(opcional, para roles temporales)",
      regionLabel: "Región",
      periodLabel: "Periodo (días)",
      periodOption: "Últimos {count} días",
      credentialsValid: "Credenciales válidas. Listo para analizar.",
      validateCta: "Validar credenciales",
      analyzing: "Analizando cuenta...",
      analyzeCta: "Analizar últimos {days} días",
    },

    focus: {
      title: "Conectar bucket de FOCUS export (Data Exports de AWS)",
      setupTitle: "¿No tienes el export aún?",
      /* {path} and {altTable} are the two <strong> console paths. "Tabla:" is the
         only word of language inside {path}; the rest is the console's own
         wording and must match what the user sees on screen. */
      setupBody:
        "Actívalo en: {path} (o {altTable} si tu cuenta aún no ofrece la 1.2). AWS lo refresca al menos una vez al día; la primera entrega tarda entre 24 y 72 horas. Si necesitas histórico, puedes pedir un backfill de hasta 36 meses abriendo un caso de soporte.",
      setupPath:
        "Billing and Cost Management → Data Exports → Create export → Standard data export → Tabla: FOCUS 1.2 with AWS columns",
      setupAltTable: "FOCUS 1.0 with AWS columns",
      /* {csv}, {parquet} and {deliveryMode} are emphasised file formats and the
         console's delivery-mode option — product wording, kept verbatim. */
      formatsBody:
        "Valen tanto {csv} como {parquet} — que es el formato que recomienda la guía de Cloud Intelligence Dashboards de AWS, junto con el modo de entrega {deliveryMode}.",
      formatsCsv: "CSV (gzip)",
      formatsParquet: "Parquet",
      formatsDeliveryMode: "Overwrite existing export file",
      /* {example}, {manifest} and {partition} are <code> chips: a path, a file
         name and a partition column. All three are identifiers. */
      prefixHelp:
        "En el prefijo apunta a la carpeta del export (por ejemplo {example}). Se lee el {manifest} de la partición {partition} más reciente y se analizan todos sus archivos, para no medir sobre un export a medio escribir.",
      bulletReadOnly: "Usa credenciales de solo lectura (IAM) — solo pueden leer el bucket.",
      bulletInMemory: "Se usan {inMemory} para esta solicitud.",
      bulletInMemoryStrong: "solo en memoria",
      bulletNeverStored: "{never} se almacenan ni se registran en logs.",
      bulletNeverStoredStrong: "Nunca",
      bucketLabel: "Nombre del bucket S3",
      bucketPlaceholder: "mi-bucket-exports",
      prefixLabel: "Prefijo (path dentro del bucket)",
      sessionTokenOptional: "(opcional — solo credenciales temporales)",
      regionLabel: "Región del bucket",
      regionHint: "(la del bucket, no la del export — el bucket puede estar en cualquier región)",
      accessConfirmed: "Acceso confirmado. Listo para analizar.",
      warningsTitle: "Avisos sobre la lectura del export",
      validateCta: "Validar acceso al bucket",
      analyzing: "Descargando y analizando...",
      analyzeCta: "Analizar FOCUS export",
      policyTitle: "Política de permisos para un usuario IAM",
      policyPath:
        "Pégala en IAM → Usuarios → tu usuario → Agregar permisos → Crear política en línea → JSON. No va en la política de confianza de un rol.",
      policyBucketLabel: "Bucket para generar la política",
      policyPrefixLabel: "Prefijo permitido (opcional)",
      policyEnterBucket: "Escribe el nombre del bucket para habilitar Copiar.",
      policyNote:
        "Nimbus la genera con el bucket y prefijo escritos arriba. ListBucket se limita al bucket y GetObject únicamente a los objetos del prefijo; no concede escritura.",
    },
  },

  diagnosis: {
    /* file-check-panel. Everything the panel *lists* — dropped-row reasons,
       capability labels, next steps, the format label — is written by the engine
       (FileDiagnosis) and is not translated here; only the panel's own chrome is. */
    fileCheck: {
      /* {format} is the engine's format label. Spanish does not inflict "fila" in
         this sentence today and that is preserved: both plural forms carry the
         same Spanish text, so the ES output is unchanged while English still
         reads correctly at count === 1. */
      allOk: {
        one: "{format} — {count} filas usables, todas las capacidades de análisis disponibles.",
        other: "{format} — {count} filas usables, todas las capacidades de análisis disponibles.",
      },
      blockingTitle: "No se encontraron filas usables en tu archivo",
      summaryTitle: "Resumen de consola reconocido",
      capabilitiesHeading: "{format} — con lo que puedo, y lo que falta",
      rowsUsed: "{used} de {total} filas usadas",
      valuesUsed: "{used} de {total} valores de costo utilizados",
      summaryRecognized: "Esta es una descarga agregada válida de {provider} {source}.",
      summaryDetails: "Agrupación: {group} · {granularity} · {periods} periodos",
      summaryDetailsOne: "Agrupación: {group} · {granularity} · 1 periodo",
      summaryScope:
        "Nimbus puede validar el gasto y su distribución con este archivo. Las recomendaciones verificables requieren evidencia de facturación más detallada.",
      summaryUsage: "Uso agregado detectado: {amount} {unit}.",
      granularity: {
        hourly: "por hora",
        daily: "diaria",
        monthly: "mensual",
      },
      // Same non-inflecting Spanish as allOk above.
      daysOfData: {
        one: "{count} día de datos",
        other: "{count} días de datos",
      },
      droppedTitle: "Filas descartadas",
      assumptionsTitle: "Supuestos aplicados a tu archivo",
      capabilitiesTitle: "Qué puede hacer este archivo",
      // {requirement} is the engine's `requires` text.
      requires: "Requiere {requirement}.",
      unlockMore: "Cómo desbloquear más",
    },

    /* provider-mismatch-panel. The lane keys (aws/azure/gcp/focus) are
       identifiers and the cloud names they map to are brands, so neither is
       translated; the sentences around them are. */
    mismatch: {
      badge: "Archivo no analizado",
      fileName: "Archivo: {name}",
      unknownCloud: "otra nube",
      severalClouds: "varias nubes",
      // "A, B y C": the head is already joined with commas, the conjunction is
      // the only translated part.
      listPair: "{head} y {last}",
      multiCloudTitle: "Este archivo cubre más de una nube",
      multiCloudBody:
        "Tu archivo está en formato FOCUS y contiene datos de {found}, mientras que el carril que elegiste es solo {expected}. En el carril FOCUS podemos analizar todas esas nubes juntas, sin dejar gasto fuera.",
      multiCloudAction: "Analizarlo en el carril FOCUS",
      wrongCloudTitle: "Este archivo parece ser de {detected}",
      wrongCloudBody:
        "Elegiste el carril de {expected}, y para que las reglas y los comandos correspondan a tu nube, los dos tienen que coincidir.",
      analyzeAsAction: "Analizarlo como {cloud}",
      nativeInFocusTitle: "Este carril solo acepta archivos en formato FOCUS",
      nativeInFocusBody:
        "Tu archivo es un export nativo de {detected}, que también podemos analizar en su propio carril.",
      unrecognizedTitle: "No reconocemos el formato de este archivo",
      unrecognizedBody:
        "No encontramos las columnas que identifican un export de facturación. Revisa que sea el export de costos de tu proveedor y no un resumen o una factura.",
      ambiguousTitle: "No podemos determinar de qué nube es este archivo",
      ambiguousPartial:
        "Coincide parcialmente con {candidates}, sin que ninguno encaje del todo.",
      ambiguousNoMatch: "Sus columnas no encajan del todo con ningún formato conocido.",
      ambiguousAdvice:
        "Exporta el archivo de facturación directamente desde tu proveedor, o usa el formato FOCUS, que es el estándar abierto que las tres nubes pueden generar.",
      focusMissingTitle:
        "El archivo se parece a un export FOCUS, pero le faltan columnas obligatorias:",
      focusMissingHint: "Vuelve a generar el export incluyéndolas y súbelo de nuevo.",
      unmappedRows: {
        one: "Además, {count} fila trae un proveedor que no reconocemos.",
        other: "Además, {count} filas traen un proveedor que no reconocemos.",
      },
      pickAnother: "Elegir otro archivo",
    },
  },

  findings: {
    // Header of a finding with no quantified saving, where the amount would go.
    reviewOnly: "revisar",
    /* Confidence wording specific to the finding card: friendlier than the
       engine's CONFIDENCE_LABELS, which the card falls back to. Keyed by the
       confidence slug — the slug is an identifier, see labels.ts. */
    friendlyConfidence: {
      confirmado: "Verificado en tu factura",
      inferencia: "Estimación — puedes ajustar los supuestos",
      "fuera-de-alcance-del-billing": "Necesita métricas de uso para confirmar",
    },
    savingsPotential: "Ahorro potencial",
    scaleConservative: "conservador",
    scaleModerate: "escenario medio {amount}",
    scaleOptimistic: "optimista",
    informational:
      "Hallazgo informativo — no se estima un ahorro directo sin más datos (ver abajo qué falta para confirmarlo).",
    concreteResources: "Recursos concretos",
    viewTechnicalDetail: "Ver el detalle técnico",
    categoryLabel: "Categoría:",
    resourcesLabel: "Recursos:",
    howWeCalculated: "Cómo calculamos este número",
    assumptionsTitle: "Supuestos del cálculo",
    assumptionRange: "(rango {min}%–{max}%)",
    pillarLabel: "Pilar:",
    verifyYourself: "Verifícalo tú mismo",
    verifyYourselfNote: "(solo lectura — no cambia nada)",
    rollbackLabel: "Cómo revertir si algo sale mal:",
    applyChange: "Aplicar el cambio",
    applyChangeNote: {
      one: "({count} comando — para tu equipo técnico)",
      other: "({count} comandos — para tu equipo técnico)",
    },
    irreversibleWarning:
      "Acción irreversible — posible pérdida de datos o servicio. Respalda y valida antes de ejecutar.",
    backupStepLabel: "Paso obligatorio de respaldo:",
    irreversible: "Irreversible",

    /* Where to run each command. The shell, CLI and console names are products
       and stay identical in both languages; only the conjunction and the word
       "local" are language, which is why the shell/CLI line is one interpolated
       sentence and not three concatenated fragments. */
    whereToRunShell: "{shell} o {cli} local",

    simulator: {
      toggle: "Ver cómo cambia según tus supuestos",
      groupLabel: "Escenario de supuestos",
      /* Preset labels and hints. The preset `id` (min/default/max/custom) is an
         identifier and is not in the dictionary. */
      presetMin: "Mínimo",
      presetMinHint: "Todos los supuestos en su valor más bajo.",
      presetDefault: "Por defecto",
      presetDefaultHint: "Los valores con los que se calculó este reporte.",
      presetMax: "Máximo",
      presetMaxHint: "Todos los supuestos en su valor más alto.",
      presetCustom: "Mi valor",
      presetCustomHint: "Ajusta cada supuesto a lo que midas en tu cuenta.",
      // {scenario} is the active preset label, lower-cased by the caller.
      resultLabel: "Ahorro estimado · escenario {scenario}",
      annualPace: "≈ {amount}/año a este ritmo",
      // {base} and {remaining} are amounts wrapped in the tabular-numeral span.
      basis:
        "Calculado sobre ≈{base}/mes de {service} ({provider}) atribuidos a este hallazgo; quedarían ≈{remaining}/mes.",
      commitmentCaveat:
        "Comprometer más no es automáticamente mejor: la cobertura que no uses se paga igual, y los compromisos no son cancelables. Valida el porcentaje elegible con las recomendaciones de tu proveedor antes de firmar.",
      provenance:
        "Origen de los supuestos: {provenance}. El detalle y las fuentes están en “Ver el detalle técnico”.",
      provenanceEditorial: "Estimación editorial — ajústala",
      provenanceDocumented: "Verificado en documentación oficial",
      footnote:
        "Se calcula en tu navegador con la misma fórmula del motor. Mínimo y máximo son los extremos del rango que ves arriba en este hallazgo.",
    },

    /* Confidence legend above the findings list. Shorter than the label maps in
       labels.ts on purpose — it is a legend, not a per-finding statement. */
    legend: {
      confirmed: "Confirmado con tus datos",
      estimate: "Estimación — verifícala",
      needsMetrics: "Requiere métricas adicionales",
    },
    /* The four priority buckets the findings tab groups by. The bucket keys are
       identifiers; these are their headings. */
    groupQuickWins: "Fáciles y valiosos",
    groupProjects: "Grandes proyectos",
    groupSmall: "Pequeños y fáciles",
    groupReview: "Requiere métricas o revisión",
  },

  report: {
    // {amount} is the formatted monthly figure, in a tabular-numeral span.
    grossMonthly: "Gasto bruto mensual proyectado: {amount}/mes.",
    focusBadge: "Formato FOCUS",
    savingsIdentified: "Ahorro potencial identificado",
    reviewPending: "+ hasta {amount}/mes adicionales sujetos a revisión de métricas",
    statRecoverable: "% del gasto recuperable",
    statRecoverableHint: "escenario medio",
    statFindings: "Hallazgos",
    statFindingsHint: "{count} fáciles · {amount}/mes",
    statAiSpend: "Gasto en IA",
    statAiSpendHint: "{pct}% de tu factura →",
    statAiSpendHintFallback: "ver detalle →",
    disclaimer:
      "Recomendaciones informativas basadas en tu facturación. Valida cada acción en tu entorno antes de aplicarla.",
    tabOverview: "Resumen",
    tabFindings: "Hallazgos ({count})",
    tabAssumptions: "Supuestos",
    tabReport: "Reporte",
    howItWorks: "Cómo funciona este análisis",
    howItWorksBody:
      "Los números salen de reglas de cálculo verificables aplicadas a tu factura; Atlas explica esos resultados y consulta herramientas determinísticas para las cifras. Cada ahorro es un rango porque depende de supuestos. Para ver cómo cambia una cifra, entra al hallazgo y abre “Ver cómo cambia según tus supuestos”. La pestaña Supuestos lista los valores y sus fuentes.",

    reconciliation: {
      regionLabel: "Conciliación financiera",
      title: "Conciliación del periodo cargado",
      subtitle:
        "El bruto se usa para detectar desperdicio; los ajustes explican el importe financiero.",
      partialNet: "Neto parcial",
      gross: "Bruto de uso",
      credits: "Créditos/reembolsos",
      taxes: "Impuestos",
      purchases: "Compras aparte",
      netInvoice: "Neto estimado de factura",
      netUsage: "Neto de uso sin compras",
    },

    overview: {
      whatFirst: "Qué hacer primero",
      savingsByCategory: "Ahorro por categoría",
      /* The category names in this list come from the engine's own
         summaryByCategory labels, not from here. */
      zeroCategories: {
        one: "{count} tema más requiere revisión de métricas — ver pestaña Hallazgos.",
        other: "{count} temas más requieren revisión de métricas — ver pestaña Hallazgos.",
      },
      serviceBreakdown: "Desglose por servicio",
      colService: "Servicio",
      colCostPerMonth: "Costo/mes",
      colSavings: "Ahorro",
      aiTitle: "Tu gasto en inteligencia artificial",
      // {title} is the engine's finding title, {link} the inline button.
      aiSummary: {
        one: "{title}. {count} hallazgo relacionado con IA — {link}.",
        other: "{title}. {count} hallazgos relacionados con IA — {link}.",
      },
      aiLink: "ver en Hallazgos",
      trendsTitle: "Tendencias de tu gasto",
    },

    /* printable-report. The report BODY (the markdown behind the Copy button) is
       written by the engine; only the component's own chrome is translated here:
       export buttons, section headings, table headers and the disclaimer. */
    printable: {
      downloadPdf: "Descargar PDF",
      downloadExcel: "Descargar Excel",
      copyMarkdown: "Copiar Markdown",
      eyebrow: "Nimbus Explorer · Reporte ejecutivo",
      title: "Reporte de Optimización de Costos",
      focusBadge: "Formato FOCUS 1.0–1.4",
      generated: "Generado: {date}",
      period: "Periodo: {start} — {end}",
      providers: "Proveedores: {list}",
      keyFigures: "Cifras clave",
      kpiCost: "Referencia mensual · todo el periodo",
      kpiSavings: "Ahorro potencial (escenario medio)",
      kpiPercentage: "Porcentaje del gasto recuperable",
      kpiQuickWins: {
        one: "{count} acciones fáciles e inmediatas",
        other: "{count} acciones fáciles e inmediatas",
      },
      topActions: "Tres acciones prioritarias",
      charts: "Visualización del análisis",
      findingsTable: "Hallazgos priorizados",
      colFinding: "Hallazgo",
      colSavingsPerMonth: "Ahorro/mes",
      colEffort: "Esfuerzo",
      colConfidence: "Confianza",
      trends: "Tendencias detectadas",
      disclaimer:
        "Recomendaciones informativas basadas en datos de facturación. Todas las cifras son calculadas por el motor de reglas determinístico; la IA no genera números. Valida cada acción en tu entorno antes de aplicarla. Ahorro mostrado como rango (conservador–optimista) basado en supuestos ajustables.",
    },

    /* Excel export. Sheet names and column headers are visible to whoever opens
       the file, so they are translated; the cell values come from the engine. */
    excel: {
      sheetSummary: "Resumen",
      sheetFindings: "Hallazgos",
      sheetByService: "Por servicio",
      sheetTrends: "Tendencias",
      rowGenerated: "Generado",
      rowPeriodStart: "Periodo inicio",
      rowPeriodEnd: "Periodo fin",
      rowProviders: "Proveedores",
      rowMonthlyCost: "Referencia mensual normalizada (USD)",
      rowSavingsConservative: "Ahorro conservador (USD/mes)",
      rowSavingsModerate: "Ahorro moderado (USD/mes)",
      rowSavingsOptimistic: "Ahorro optimista (USD/mes)",
      rowRecoverablePct: "% del gasto recuperable",
      rowTotalFindings: "Hallazgos totales",
      rowQuickWins: "Acciones fáciles e inmediatas (quick wins)",
      colTitle: "Título",
      colCategory: "Categoría",
      colProvider: "Proveedor",
      colConfidence: "Confianza",
      colEffort: "Esfuerzo",
      colRisk: "Riesgo",
      colPillar: "Pilar de arquitectura",
      colAffectedResources: "Recursos afectados",
      colService: "Servicio",
      colServiceCost: "Costo mensual (USD)",
      colServiceSavings: "Ahorro potencial (USD/mes)",
      colTrendType: "Tipo",
      colTrendSeverity: "Severidad",
      colTrendDetail: "Detalle",
      colTrendEvidence: "Evidencia",
    },

    /* Chart chrome. Category and service names on the axes and in the legend come
       from the engine and are not translated here. */
    charts: {
      savingsByCategory: "Ahorro potencial por categoría",
      savingsSeries: "Ahorro",
      costByService: "Distribución de costo por servicio",
      otherServices: "Otros",
      costSeries: "Costo",
      monthProjection: "Comparación de ritmos de gasto",
      periodAverage: "Promedio diario del periodo",
      last7DaysAverage: "Promedio diario de los últimos 7 días",
      projection30Days: "Ritmo reciente × 30 días",
    },
  },

  assumptions: {
    title: "Supuestos del análisis",
    intro:
      "Referencia de los supuestos que alimentan cada estimación, con su rango y su fuente. Los valores por defecto no son los mínimos: son el punto medio del rango, y el reporte muestra los extremos para reflejar la incertidumbre. Para simular otros valores, entra al hallazgo correspondiente.",
    empty: "Este análisis no usa supuestos ajustables.",
    defaultPosition: "Posición del valor por defecto dentro del rango (referencia, no editable).",
    sourceLabel: "Fuente:",
    usedIn: "Usado en: {titles}",
    usedInMore: " (+{count} más)",
  },

  chat: {
    agentName: "Agente Atlas",
    agentTagline: "Tu guía de costos cloud",
    minimize: "Minimizar",
    closeChat: "Cerrar chat",
    messageCount: {
      one: "{count} mensajes",
      other: "{count} mensajes",
    },
    expandHint: "Clic para expandir",
    intro:
      "Atlas utiliza los resultados determinísticos de tu análisis. Confirma las acciones en tu entorno antes de aplicarlas.",
    /* Suggested questions. They are shown to the user AND sent to the agent as
       the prompt, so the English versions are real questions, not glosses. */
    suggestion1: "¿Cuánto estoy gastando y en qué servicios?",
    suggestion2: "¿Dónde puedo ahorrar más con menor esfuerzo?",
    suggestion3: "Dame el reporte ejecutivo completo",
    suggestion4: "¿Qué puedo hacer hoy mismo para ahorrar?",
    suggestion5: "¿Cuánto estoy gastando en IA y cómo lo reduzco?",
    suggestion6: "¿Qué es FOCUS y por qué me conviene?",
    placeholder: "Pregunta sobre tus costos…",
    placeholderRateLimited: "Límite de demo alcanzado",
    send: "Enviar",
    /* How an answer was produced, with its token cost. The token count is a
       number and the word "tokens" is the same in both languages. */
    modeCached: "Respuesta en caché · 0 tokens",
    modeDeterministic: "Cálculo directo · 0 tokens",
    modeLlm: "Atlas IA · {count} tokens",
    /* Tool-call badges. Keyed by the tool name, which is an identifier: the raw
       name is never shown, these phrases are. */
    toolReconciliation: "conciliando bruto, ajustes y neto",
    toolUploadDiagnosis: "revisando las filas y capacidades del archivo",
    toolQueryBilling: "consultando tu facturación",
    toolCalculateSavings: "calculando ahorros",
    toolGenerateRemediation: "generando comandos",
    toolBuildReport: "armando el reporte",
    toolLookupKnowledge: "consultando buenas prácticas",
  },

  errors: {
    title: "Error",
    unsupportedFile: "Archivo no soportado",
    notCsvOrExcel:
      "\"{name}\" no es un CSV ni un Excel (.xlsx). Exporta tu facturación en uno de esos formatos.",
    validation: "Error de validación",
    connection: "Error de conexión",
    unknown: "Error desconocido",
    /* The FOCUS connector ends these three fallbacks with a full stop and the AWS
       connector does not. Both spellings are kept because the Spanish output has
       to stay byte-identical; normalising the punctuation is a copy change, and
       it is reported instead of made here. */
    validationDot: "Error de validación.",
    connectionDot: "Error de conexión.",
    unknownDot: "Error desconocido.",
    // Fills the cause slot when a thrown value carries no message.
    unknownCause: "desconocido",
  },
};

/**
 * Recursive shape derived from the Spanish dictionary: every nested object must
 * carry exactly the same keys, and every leaf must be a string (not the specific
 * Spanish literal, which would make translating impossible). Combined with the
 * excess-property check on `const en: Dictionary = { ... }`, this rejects both a
 * missing key and a stray one.
 */
export type DictionaryShape<T> = {
  [K in keyof T]: T[K] extends string ? string : DictionaryShape<T[K]>;
};

export type Dictionary = DictionaryShape<typeof es>;
