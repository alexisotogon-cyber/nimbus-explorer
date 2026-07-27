# Requisitos del Sistema — FinOps Agent (Nimbus Explorer)

**Versión:** 1.0  
**Estado:** Entregado  
**Fecha:** 2026-07-21  

---

## 1. Introducción

### 1.1 Propósito

Este documento especifica los requisitos funcionales y no funcionales para **Nimbus Explorer**, un auditor de costos cloud multi-nube (AWS, Azure, GCP, FOCUS) con motor de reglas determinístico y un agente conversacional basado en IA (Atlas) que explica, compara y propone estrategias sobre hallazgos ya calculados.

**Principio rector:** Las cifras y hallazgos **siempre** los produce el motor determinístico. Atlas **nunca** recalcula ni completa datos ausentes.

### 1.2 Alcance

- **Incluido:**
  - Parsers para FOCUS 1.x, AWS CUR/Cost Explorer, Azure Cost Management, GCP Cloud Billing
  - Motor de reglas determinístico para detección de desperdicio de costos
  - Agente conversacional Atlas vía Amazon Bedrock (opcional, con guardrails estrictos)
  - Conexión en vivo a AWS Cost Explorer y S3 (FOCUS Data Export)
  - Fuente de datos demo sintética, archivo CSV subido, o conexión live
  - Reporte ejecutivo con PDF/Markdown/Excel y tablero interactivo

- **Excluido:**
  - Almacenamiento persistente de credenciales de usuario
  - Modificaciones de infraestructura cloud (solo lectura y comandos de investigación)
  - Cálculos financieros desde IA
  - Autenticación de usuarios (demo y single-session)

### 1.3 Definiciones, Acrónimos y Abreviaturas

| Término | Significado |
|---------|-------------|
| **FOCUS** | FinOps Open Cost and Usage Specification (estándar abierto) |
| **AWS CUR** | AWS Cost and Usage Report |
| **IAM** | Identity and Access Management |
| **Bedrock** | Amazon Bedrock (servicio de LLMs) |
| **S3** | Amazon Simple Storage Service |
| **AI/ML** | Artificial Intelligence / Machine Learning |
| **LLM** | Large Language Model |

### 1.4 Referencias

- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [PRODUCT.md](../../PRODUCT.md)
- `.kiro/specs/roadmap-focus-ai-s3.md`

---

## 2. Visión General del Producto

### 2.1 Perspectiva del Producto

Nimbus Explorer sirve a dos audiencias en el mismo flujo de decisión FinOps:

- **Líderes financieros y FinOps:** necesitan una visión rápida y justificable del gasto cloud, ahorros, reconciliación, confianza y próximas acciones.
- **Equipos cloud y de ingeniería:** necesitan acceso progresivo a la evidencia, supuestos, métricas, comandos, remediación y pasos de reversión detrás de cada oportunidad.

Ambos grupos trabajan desde la misma evidencia de facturación subida. El trabajo principal es decidir qué investigar o cambiar a continuación sin perder trazabilidad financiera.

### 2.2 Funciones Principales

| ID | Función | Descripción |
|----|---------|-------------|
| F1 | **Auto-detección de formato** | Identifica automáticamente si el archivo es FOCUS, AWS, Azure o GCP basado en encabezados |
| F2 | **Parser FOCUS** | Parsers completos para el estándar abierto FOCUS 1.x con detección de múltiples proveedores |
| F3 | **Reglas de desperdicio** | 13+ reglas determinísticas para detectar recursos ociosos, instancias sobredimensionadas, almacenamiento desperdiciado y más |
| F4 | **Motor de ahorros** | Calcula rangos de ahorro (conservador → optimista) con supuestos declarados y ajustables |
| F5 | **Conexión live AWS** | Validación y lectura de Cost Explorer (solo lectura) o S3 (FOCUS export) con credenciales IAM del usuario |
| F6 | **Atlas (Agente IA)** | Consulta de costos, hallazgos, remediaciones y buenas prácticas vía Bedrock con guardrails estrictos |
| F7 | **Reporte ejecutivo** | Generación de PDF, Markdown y Excel con tablero interactivo |

### 2.3 Características de la Línea de Productos

- **Múltiples orígenes de datos:** demo (1-clic), CSV subido, conexión live AWS
- **Formato unificado:** FOCUS como estándar abierto recomendado
- **Motor determinístico único:** unica fuente de verdad financiera
- **Agente IA con guardrails:** nunca calcula cifras, solo explica y propone

---

## 3. Requisitos Funcionales

### 3.1 Requisitos de Origen de Datos

#### RQ-DATA-001: Fuente Demo

**Prioridad:** Alta  
**Precondición:** Ninguna  
**Flujo de evento:**
1. El usuario selecciona "Demo 1-clic"
2. La aplicación genera datos sintéticos determinísticos (por defecto AWS, con opciones para startup de IA o multi-cloud)
3. Se ejecuta el motor de reglas y se muestra el reporte

**Postcondición:** Se genera un reporte completo sin necesidad de credenciales

#### RQ-DATA-002: Subida de CSV

**Prioridad:** Alta  
**Precondición:** Archivo CSV válido (FOCUS, AWS, Azure o GCP)  
**Flujo de evento:**
1. El usuario selecciona la nube (o FOCUS)
2. Sube un archivo CSV de su cuenta
3. La aplicación detecta automáticamente el formato basado en encabezados
4. Se ejecuta el parser correspondiente y el motor de reglas
5. Se muestra el reporte

**Postcondición:** El archivo se procesa y se genera un reporte determinístico

#### RQ-DATA-003: Conexión Live AWS (Cost Explorer)

**Prioridad:** Alta  
**Precondición:** Credenciales IAM de solo lectura (`ce:Get*`) válidas  
**Flujo de evento:**
1. El usuario ingresa Access Key ID y Secret Access Key
2. La aplicación valida las credenciales
3. Se consulta Cost Explorer para datos de facturación (30 días por defecto)
4. Se ejecuta el motor de reglas y se genera el reporte

**Postcondición:** Se obtienen datos en vivo de la cuenta del usuario

#### RQ-DATA-004: Conexión Live AWS (FOCUS S3 Export)

**Prioridad:** Alta  
**Precondición:** Bucket S3 con FOCUS Data Export y credenciales IAM (`s3:ListBucket`, `s3:GetObject`)  
**Flujo de evento:**
1. El usuario ingresa credenciales IAM, bucket y prefijo
2. La aplicación valida acceso al bucket
3. Se lee el archivo CSV.gz más reciente del export
4. Se parsea con el parser FOCUS y se ejecuta el motor de reglas
5. Se genera el reporte

**Postcondición:** Se lee y procesa el FOCUS Data Export en vivo

#### RQ-DATA-005: Detección Automática de Formato

**Prioridad:** Alta  
**Precondición:** Archivo CSV con encabezados  
**Flujo de evento:**
1. Se leen los encabezados del CSV
2. Se evalúan tokens exclusivos y compartidos por proveedor
3. FOCUS se detecta primero con prioridad absoluta (todos los campos obligatorios presentes)
4. Si no es FOCUS, se calcula un puntaje para AWS, Azure o GCP
5. Si el puntaje es ambiguo, se notifica al usuario

**Postcondición:** Se identifica correctamente el formato del archivo

### 3.2 Requisitos del Motor de Reglas

#### RQ-RULES-001: Reglas de Recursos Ociosos

**Prioridad:** Alta  
**Descripción:** Detectar recursos que no se están utilizando activamente

**Sub-reglas:**
- **IDLE-EC2-001**: Instancias EC2 con CPU < 10% promedio durante el periodo
- **IDLE-ELASTICIP-001**: IPs elásticas no asignadas
- **IDLE-SNAPSHOT-001**: Snapshots EBS sin recursos asociados
- **IDLE-LOADBALANCER-001**: Load balancers sin instancias registradas

#### RQ-RULES-002: Reglas de Instancias Sobredimensionadas

**Prioridad:** Alta  
**Descripción:** Detectar instancias con capacidad significativamente mayor que la necesaria

**Sub-reglas:**
- **OVERSIZED-EC2-001**: Instancias EC2 con CPU < 50% y memoria < 50% del promedio de 30 días
- **OVERSIZED-EC2-002**: Instancias con CPU < 30% durante más del 70% del periodo

#### RQ-RULES-003: Reglas de Almacenamiento Desperdiciado

**Prioridad:** Alta  
**Descripción:** Detectar almacenamiento no utilizado o desproporcionado

**Sub-reglas:**
- **STORAGE-S3-001**: Buckets S3 con objetos sin acceso en 90 días
- **STORAGE-S3-002**: Versiones antiguas de objetos sin uso
- **STORAGE-EBS-001**: Volúmenes EBS sin montar
- **STORAGE-SNAPSHOT-002**: Snapshots sin uso
- **STORAGE-MISSING-COMMITMENT-001**: Gasto en compromisos pendientes de adquisición

#### RQ-RULES-004: Reglas de Gasto en IA (Fase 2)

**Prioridad:** Alta  
**Descripción:** Auditoría de costos de IA (Bedrock, SageMaker, GPU)

**Sub-reglas:**
- **AI-VIS-001**: Visibilidad de gasto IA (total > $10/mes)
- **AI-GPU-001**: Instancias GPU siempre encendidas (costo estable ≥ $100/mes)
- **AI-BDR-001**: Inferencia On-Demand intensiva en Bedrock (gasto ≥ $50/mes)
- **AI-SM-001**: Endpoints SageMaker 24/7 (gasto estable ≥ $50/mes)
- **AI-TAG-001**: Gasto IA difícil de atribuir

#### RQ-RULES-005: Rangos de Ahorros con Supuestos

**Prioridad:** Alta  
**Descripción:** Cada hallazgo debe tener rangos de ahorro basados en supuestos declarados

**Requisitos:**
- `conservative`: estimación más conservadora (menor ahorro)
- `moderate`: valor central basado en supuestos razonables
- `optimistic`: estimación optimista (mayor ahorro posible)

**Estructura:**
```typescript
interface SavingsRange {
  conservative: number;
  moderate: number;
  optimistic: number;
}
```

#### RQ-RULES-006: Contradicción con Comportamiento de Demo

**Prioridad:** Alta  
**Descripción:** La demo no debe contradecir el comportamiento real del parser

**Requisito:** Si la demo usa el mismo parser FOCUS que los archivos reales, debe producir hallazgos consistentes

### 3.3 Requisitos de Atlas (Agente IA)

#### RQ-ATLAS-001: Guardrails de Escopo

**Prioridad:** Alta  
**Descripción:** Atlas solo responde sobre costos cloud, billing, FinOps, FOCUS, hallazgos, tendencias, ahorro y metodología

**Requisito:** Respuesta automática y consistente para temas fuera de scope:
> "No puedo ayudarte con eso. Mi especialidad son tus costos cloud. Pregúntame sobre tu gasto, tus hallazgos de ahorro, o cómo implementar alguna recomendación."

#### RQ-ATLAS-002: Guardrails de Seguridad

**Prioridad:** Alta  
**Descripción:** Cifras deben provenir exclusivamente del motor determinístico

**Requisitos:**
- Atlas **nunca** calcula ni recalcula cifras
- Atlas **nunca** completa datos ausentes
- Cifras de la API deben provenir de herramientas (`calculate_savings`, `query_billing`, etc.)
- Todo texto derivado de datos del usuario debe ser sanitizado (control chars eliminados, longitud limitada)

#### RQ-ATLAS-003: Credenciales del Servidor

**Prioridad:** Alta  
**Descripción:** Credenciales de Bedrock viven solo en variables de entorno del servidor

**Requisitos:**
- `BEDROCK_ACCESS_KEY_ID` y `BEDROCK_SECRET_ACCESS_KEY` leídas de entorno
- **Nunca** aceptadas desde el navegador o request body
- Validación de allowlist de modelos (`ATLAS_ALLOWED_MODEL_IDS`)

#### RQ-ATLAS-004: Presupuestos y Rate Limits

**Prioridad:** Alta  
**Descripción:** Control de consumo con presupuestos diarios/mensuales y rate limits

**Variables de entorno:**
- `ATLAS_DAILY_TOKEN_BUDGET`: Hard stop diario de tokens (default: 500,000)
- `ATLAS_DAILY_COST_BUDGET_USD`: Hard stop diario de costo estimado (default: $10)
- `ATLAS_MONTHLY_COST_BUDGET_USD`: Hard stop mensual (default: $100)
- `ATLAS_MAX_MESSAGES_PER_IP`: Solicitudes por IP/ventana (default: 30)
- `ATLAS_IP_WINDOW_MS`: Ventana del rate limit por IP (default: 1h)
- `ATLAS_MAX_MESSAGES_PER_AUDIT`: Tope por sesión de auditoría (default: 20)
- `ATLAS_MAX_TOOL_CALLS`: Tope de herramientas por respuesta (default: 2)
- `ATLAS_MAX_HISTORY_MESSAGES`: Historial textual conservado (default: 8)
- `ATLAS_MAX_INPUT_CHARACTERS`: Rechaza prompts excesivos (default: 12,000)
- `ATLAS_MAX_BILLING_ROWS`: Máximo de filas que una sesión puede retener (default: 50,000)

#### RQ-ATLAS-005: Circuit Breaker

**Prioridad:** Alta  
**Descripción:** Pausa automática de IA ante fallos consecutivos

**Requisitos:**
- `ATLAS_CIRCUIT_BREAKER_FAILURES`: Fallos consecutivos antes de pausar (default: 3)
- `ATLAS_CIRCUIT_BREAKER_OPEN_MS`: Duración de la pausa (default: 60,000ms)
- Modo de emergencia (`ATLAS_MODE=emergency`) corta todas las llamadas de IA

#### RQ-ATLAS-006: Deterministic Scope Guard

**Prioridad:** Alta  
**Descripción:** Backstop determinístico para el scope antes de invocar al LLM

**Requisito:** Si el mensaje no contiene vocabulario del dominio Y el LLM no llamó herramientas → respuesta automática de fuera de scope

#### RQ-ATLAS-007: Modos de Modelos

**Prioridad:** Media  
**Descripción:** Selección automática entre modelo principal y económico

**Reglas:**
- **Modelo principal**: consultas complejas (compara, estrategia, prioriza, arquitectura, plan detallado)
- **Modelo económico**: preguntas simples y de contexto

### 3.4 Requisitos de Reporte

#### RQ-REPORT-001: Estructura de Hallazgos

**Prioridad:** Alta  
**Descripción:** Cada hallazgo debe incluir todos los campos necesarios para trazabilidad

**Campos obligatorios:**
- `id`: Identificador único (ej: `IDLE-EC2-001-2024-01`)
- `title`: Título descriptivo
- `description`: Descripción técnica
- `service`: Servicio cloud (ej: `EC2`, `S3`)
- `category`: Categoría de desperdicio (ej: `compute`, `storage`, `network-egress`, `ai-ml`)
- `savingsRange`: `{conservative, moderate, optimistic}` en USD/mes
- `estimatedMonthlySavingsUSD`: Valor central (moderate)
- `priorityScore`: Puntuación para ordenamiento
- `effort`: `{bajo, medio, alto}`
- `risk`: `{bajo, medio, alto}`
- `confidence`: `{confirmado, inferencia, fuera-de-alcance-del-billing}`
- `calculationBreakdown`: Fórmula paso a paso
- `remediation`: Comandos de investigación y aplicación

#### RQ-REPORT-002: Conciliación Financiera

**Prioridad:** Alta  
**Descripción:** Bridge contable para trazabilidad financiera

**Campos:**
- `currency`: "USD"
- `grossUsageCostUSD`: Gasto bruto de uso
- `creditsAndRefundsUSD`: Créditos y reembolsos
- `taxesUSD`: Impuestos
- `commitmentPurchasesUSD`: Compras de compromiso
- `netUsageCostExcludingCommitmentPurchasesUSD`: Neto excluyendo compromisos
- `wasteAnalysisBaseUSD`: Base para análisis de desperdicio

#### RQ-REPORT-003: Tendencias

**Prioridad:** Media  
**Descripción:** Análisis de tendencias de gasto

**Campos:**
- `trend`: `up`, `down`, `stable`
- `percentageChange`: Variación porcentual
- `description`: Descripción cualitativa

#### RQ-REPORT-004: Cobertura de Esquema

**Prioridad:** Alta  
**Descripción:** Evidencia de qué columnas del esquema fueron reconocidas

**Campos:**
- `provider`: "aws" | "azure" | "gcp" | "focus"
- `sourceSchemaVersion`: Versión del esquema detectada
- `catalogSnapshot`: Hash del catálogo de servicios usado
- `coveragePercentage`: Porcentaje de columnas reconocidas
- `status`: "current" | "warning" | "stale"
- `recognizedColumns`: Lista de columnas reconocidas
- `unknownColumns`: Lista de columnas desconocidas

### 3.5 Requisitos de UI

#### RQ-UI-001: Selección de Nube

**Prioridad:** Alta  
**Descripción:** Opción para seleccionar proveedor antes de cargar archivo

**Opciones:**
- AWS
- Azure
- GCP
- FOCUS (recomendado)

#### RQ-UI-002: Opción FOCUS Destacada

**Prioridad:** Alta  
**Descripción:** Fuente de datos FOCUS como primera opción en Paso 2

**Requisito:** Badge en dashboard cuando el análisis proviene de FOCUS: "Datos en formato FOCUS 1.x"

#### RQ-UI-003: Diagnóstico de Archivo

**Prioridad:** Alta  
**Descripción:** Panel de diagnóstico antes de ejecutar el análisis

**Campos:**
- Total de filas
- Filas válidas
- Proveedor detectado
- Cobertura de esquema
- Categorías presentes
- Fechas presentes

#### RQ-UI-004: Card de Hallazgos

**Prioridad:** Alta  
**Descripción:** Tarjeta para cada hallazgo con todos los detalles

**Elementos visuales:**
- Título y ID
- Rangos de ahorro (conservador → optimista)
- Porcentaje de ahorro potencial
- Categoría (color-coded)
- Confianza del hallazgo
- Esfuerzo y Riesgo (semaforizado)
- Expandible con: descripción, supuestos, remediación

#### RQ-UI-005: Tablero de Resumen

**Prioridad:** Alta  
**Descripción:** Card resumen con métricas clave

**Métricas:**
- Gasto bruto mensual
- Ahorro potencial (rango)
- Porcentaje de ahorro potencial
- Total de hallazgos
- Hallazgos por categoría

#### RQ-UI-006: Exportación de Reporte

**Prioridad:** Media  
**Descripción:** Generación de PDF, Markdown y Excel

**Formatos:**
- **PDF**: Reporte ejecutivo completo con gráficos
- **Markdown**: Version legible con código de comandos
- **Excel**: Datos estructurados para análisis adicional

---

## 4. Requisitos No Funcionales

### 4.1 Seguridad

#### RQ-SEC-001: Credenciales de Usuario

**Prioridad:** Crítica  
**Descripción:** Credenciales IAM del usuario solo en memoria durante cada request

**Requisitos:**
- **Nunca** almacenadas en disco, base de datos ni logs
- **Nunca** enviadas a terceros (solo a AWS APIs)
- **Nunca** expuestas en la UI
- Limpiadas inmediatamente después de usar

#### RQ-SEC-002: Credenciales de Bedrock

**Prioridad:** Crítica  
**Descripción:** Credenciales de Bedrock solo en variables de entorno del servidor

**Requisitos:**
- Leídas solo de entorno del servidor
- **Nunca** aceptadas desde navegador
- Validación de allowlist de modelos
- Encriptación en reposo (según plataforma de despliegue)

#### RQ-SEC-003: Sanitización de Datos

**Prioridad:** Alta  
**Descripción:** Todos los strings del archivo del usuario deben ser sanitizados

**Requisitos:**
- Eliminar caracteres de control
- Limitar longitud máxima (300 caracteres)
- Nunca splicear en prose libre (solo en JSON con envelope explícito)

#### RQ-SEC-004: Modo de Emergencia

**Prioridad:** Alta  
**Descripción:** Deshabilitar IA sin apagar el producto

**Requisito:** `ATLAS_MODE=emergency` corta todas las llamadas de IA pero mantiene análisis y respuestas factuales

### 4.2 Rendimiento

#### RQ-PERF-001: Tiempo de Procesamiento

**Prioridad:** Media  
**Descripción:** Tiempo total desde carga hasta reporte

**Objetivo:**
- CSV pequeño (< 10,000 filas): < 10 segundos
- CSV grande (50,000 filas): < 30 segundos
- Demo: < 5 segundos

#### RQ-PERF-002: Timeout de Bedrock

**Prioridad:** Media  
**Descripción:** Timeout por llamada al LLM

**Requisito:** `ATLAS_REQUEST_TIMEOUT_MS` (default: 30,000ms)

#### RQ-PERF-003: Cacheo de Respuestas

**Prioridad:** Media  
**Descripción:** Evitar re-calculos innecesarios

**Requisito:** Cacheo por análisis de hasta 30 minutos

### 4.3 Usabilidad

#### RQ-US-001: Lenguaje Dual

**Prioridad:** Alta  
**Descripción:** Soporte completo para español e inglés

**Requisitos:**
- Todos los textos visibles en ambos idiomas
- Diccionarios de términos protegidos (metodología, columnas, comandos no se traducen)
- Selección de idioma persistente

#### RQ-US-002: Claridad Doble Altitud

**Prioridad:** Alta  
**Descripción:** Lenguaje llano primero, término técnico entre paréntesis

**Ejemplo:** "Respaldos (snapshots)"

#### RQ-US-003: Comandos Destructivos con Advertencia

**Prioridad:** Alta  
**Descripción:** Advertencia de irreversibilidad ANTES del bloque de código

**Formato:**
> ⚠️ **ATENCIÓN:** Esta acción es irreversible
>
> 1. Cree un snapshot del recurso actual
> 2. Verifique dependencias
> 3. Ejecute el comando de eliminación

### 4.4 Mantenibilidad

#### RQ-MAINT-001: Separación Motor vs Agente

**Prioridad:** Alta  
**Descripción:** Motor determinístico como única fuente de cifras

**Requisito:** Atlas nunca calcula ni completa datos. Solo explica basándose en resultados del motor.

#### RQ-MAINT-002: Reglas Modulares

**Prioridad:** Alta  
**Descripción:** Cada regla debe ser independiente y testeable

**Requisitos:**
- Una clase o función por regla
- Interface estandarizada: `evaluate(records): Finding[]`
- `minDistinctDays`: umbral mínimo de datos para aplicar la regla

#### RQ-MAINT-003: Catálogos Versionados

**Prioridad:** Media  
**Descripción:** Servicios y categorías versionadas para validación

**Requisitos:**
- Snapshots de AWS, Azure y GCP en `src/engine/catalog/`
- Alertas a los 30 días de antigüedad
- Fallo de validación a los 45 días

---

## 5. Restricciones

### 5.1 Restricciones de Plataforma

| Restricción | Descripción |
|-------------|-------------|
| **Framework** | Next.js 14 con App Router |
| **Lenguaje** | TypeScript (tsc --noEmit y build deben pasar) |
| **UI Framework** | React 18 con Tailwind CSS |
| **Testing** | Jest y React Testing Library |
| **Deploy** | Vercel, AWS Amplify o contenedor Docker |

### 5.2 Restricciones Técnicas

| Restricción | Descripción |
|-------------|-------------|
| **AWS SDK** | `@aws-sdk/client-bedrock-runtime` para LLM, `@aws-sdk/client-ce` para Cost Explorer, `@aws-sdk/client-s3` para Data Exports |
| **CSV Parser** | PapaParse para todos los formatos |
| **State Management** | React Context + hooks (sin Redux) |
| **Data Persistence** | Solo en memoria por sesión (análisis expira a los 30 min) |

### 5.3 Restricciones de Seguridad

| Restricción | Descripción |
|-------------|-------------|
| **CORS** | Solo requests desde el mismo origen (o configurado explícitamente) |
| **CSRF** | No se requiere token CSRF (APIs son stateless y no aceptan credenciales de usuario) |
| **XSS** | Todos los strings del usuario deben ser escapados antes de inyectar en HTML |
| **Rate Limiting** | Límite por IP y por sesión |

---

## 6. Supuestos y Dependencias

### 6.1 Supuestos

| ID | Supuesto | Impacto si no se cumple |
|----|----------|------------------------|
| A1 | El usuario tiene acceso a una cuenta AWS/Azure/GCP válida | No se puede generar reporte live |
| A2 | Las credenciales IAM del usuario tienen permisos de solo lectura (`ce:Get*`, `s3:ListBucket`, `s3:GetObject`) | Falla la conexión live |
| A3 | El formato del CSV sigue el esquema documentado por el proveedor | Parser puede fallar |
| A4 | AWS Bedrock está habilitado en `us-east-1` (o región configurada) | Atlas no funciona |
| A5 | El catálogo de servicios en `src/engine/catalog/` es actualizado | Cobertura de esquema puede ser incorrecta |

### 6.2 Dependencias

| Componente | Versión | Licencia | Notas |
|------------|---------|----------|-------|
| Next.js | 14.x | MIT | Framework principal |
| React | 18.x | MIT | UI library |
| TypeScript | 5.x | Apache 2.0 | Tipado estático |
| Tailwind CSS | 3.x | MIT | Styling |
| AWS SDK v3 | 3.x | Apache 2.0 | Integración AWS |
| PapaParse | 5.x | MIT | CSV parsing |

---

## 7. Requisitos de Validación

### 7.1 Criterios de Aceptación por Fase

#### FASE 1 — Soporte FOCUS (Completado)

| Criterio | Archivo/Función | Estado |
|----------|----------------|--------|
| Parser FOCUS detecta y parsea correctamente | `src/engine/parsers/focus-parser.ts` | ✓ |
| Nueva categoría `ai-ml` en types.ts | `src/engine/types.ts` | ✓ |
| Orden de detección: FOCUS > AWS > Azure > GCP | `src/engine/parsers/index.ts` | ✓ |
| Fixture de prueba con FOCUS | `test-data/caso-prueba-focus.csv` | ✓ |
| UI — Opción FOCUS destacada | `src/components/upload-section.tsx` | ✓ |
| `npx tsc --noEmit` y `npm run build` limpios | Script de CI | ✓ |

#### FASE 2 — Lente de Costos de IA (Completado)

| Criterio | Archivo/Función | Estado |
|----------|----------------|--------|
| Regla AI-VIS-001: Visibilidad de gasto IA | `src/engine/rules/ai-spend.ts` | ✓ |
| Regla AI-GPU-001: Instancias GPU | `src/engine/rules/ai-spend.ts` | ✓ |
| Regla AI-BDR-001: Inferencia Bedrock | `src/engine/rules/ai-spend.ts` | ✓ |
| Regla AI-SM-001: Endpoints SageMaker | `src/engine/rules/ai-spend.ts` | ✓ |
| Regla AI-TAG-001: Gasto IA sin atribución | `src/engine/rules/ai-spend.ts` | ✓ |
| UI — Tarjeta de gasto IA en dashboard | `src/components/report-dashboard.tsx` | ✓ |
| Demo — Arquetipo "startup de IA" | `src/engine/demo-data.ts` | ✓ |
| Chat — Soporte IA | `src/engine/agent.ts` | ✓ |
| `npx tsc --noEmit` y `npm run build` limpios | Script de CI | ✓ |

#### FASE 3 — Conector S3 FOCUS (Completado)

| Criterio | Archivo/Función | Estado |
|----------|----------------|--------|
| Conector S3 lee archivo más reciente | `src/engine/focus-s3-connector.ts` | ✓ |
| Ruta API `POST /api/connect-focus` | `src/app/api/connect-focus/route.ts` | ✓ |
| UI — Opción conectar bucket FOCUS | `src/components/focus-s3-connect-section.tsx` | ✓ |
| Fixture gzip para pruebas | `test-data/focus-export-sample.csv.gz` | ✓ |
| Error claro al recibir `.parquet` | `src/engine/focus-s3-connector.ts` | ✓ |
| Error claro al exceder 50 MB | `src/engine/focus-s3-connector.ts` | ✓ |
| Cero credenciales en logs | `src/app/api/connect-focus/route.ts` | ✓ |
| `npx tsc --noEmit` y `npm run build` limpios | Script de CI | ✓ |

### 7.2 Regresión Continua

- `test-data/caso-prueba-aws.csv` sigue produciendo los mismos hallazgos que antes
- `test-data/caso-prueba-focus.csv` produce hallazgos consistentes
- `npm run test:billing` pasa todas las suites

---

## 8. Cambios Propuestos

No hay cambios propuestos en este documento.

---

## 9. Glosario

| Término | Definición |
|---------|------------|
| **FOCUS** | FinOps Open Cost and Usage Specification. Estándar abierto de la FinOps Foundation para billing multi-nube. |
| **AWS CUR** | AWS Cost and Usage Report. Reporte nativo de AWS con métricas de uso y costo. |
| **Cost Explorer** | API de AWS para consultar datos de facturación y uso. |
| **Bedrock** | Servicio de Amazon para acceder a LLMs de diferentes proveedores. |
| **S3 Data Export** | Funcionalidad de AWS para exportar datos de billing a S3 en formatos estructurados (FOCUS, Parquet). |
| **IAM** | Identity and Access Management. Sistema de gestión de identidades de AWS. |
| **LLM** | Large Language Model. Modelo de lenguaje de gran escala (ej: Claude, GPT). |
| **AI/ML** | Artificial Intelligence / Machine Learning. Categoría de servicios cloud para IA. |
| **Savings Plans** | Compromisos de uso con descuento para AWS. |
| **Reservations** | Compromisos de uso con descuento para AWS (RDS, EC2). |
| **CUDs** | Committed Use Discounts. Compromisos de uso con descuento para GCP. |
| **Right-sizing** | Optimización de recursos para usar la cantidad adecuada de capacidad. |
| **Idle Resources** | Recursos que no se están utilizando activamente. |
