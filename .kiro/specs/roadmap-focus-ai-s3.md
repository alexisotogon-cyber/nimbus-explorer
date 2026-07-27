# FinOps Agent — Roadmap: FOCUS + AI Lens + S3 Connector

**Versión:** 1.1  
**Fecha:** 2026-07-21  
**Estado:** Fase 1 ✓ — Fase 2 ✓ — Fase 3 ✓ (completo)

---

## Contexto y principios

### Producto
Auditor de costos multi-nube con motor de reglas determinístico y agente IA conversacional. La IA explica; los números los calcula el motor.

### Reglas de integridad (aplican a TODO el código)
1. **El LLM nunca inventa cifras.** Toda cifra viene del motor.
2. **Supuestos ajustables con rangos derivados** de `min`/`value`/`max` del `FindingAssumption` vía `deriveSavingsRange()`. Sin multiplicadores fijos separados.
3. **Fuentes solo si son verificables con URL** (verificar con MCP `aws-documentation` antes de citar). Si no verificable: "estimación editorial ajustable".
4. **Comandos destructivos con advertencia de irreversibilidad** ANTES del bloque de código.
5. **Doble altitud en textos**: lenguaje llano primero, término técnico entre paréntesis. Ejemplo: "Respaldos (snapshots)".
6. **Nombres de servicios cloud NUNCA se traducen**: EC2, EBS, snapshot, Savings Plans, On-Demand, tiering, Bedrock, SageMaker, NAT Gateway, etc.
7. **Credenciales de usuario** solo en memoria por request. Jamás almacenadas, logueadas ni reenviadas.

---

## FASE 1 — Soporte FOCUS (FinOps Open Cost and Usage Specification)

### Contexto
FOCUS es el estándar abierto de la FinOps Foundation para billing multi-nube. AWS, Azure, GCP, Oracle y Alibaba ya exportan nativamente en este formato. El `NormalizedCostRecord` del motor mapea casi 1:1 con sus columnas.

### Requisitos

#### F1-1: Parser FOCUS (`src/engine/parsers/focus-parser.ts`)
- **Detección de formato**: CSV con headers que contengan al menos `BilledCost`, `ServiceCategory`, `ProviderName` y `ChargePeriodStart` (case-insensitive). FOCUS tiene prioridad sobre los demás formatos en la detección automática.
- **Mapeo a `NormalizedCostRecord`**:
  - `ProviderName`: "AWS"/"Amazon" → `aws`; "Microsoft"/"Azure" → `azure`; "Google" → `gcp`; otros → nuevo campo `providerRaw: string` en el record, `provider` mapeado a tipo genérico que no emita comandos de remediación específicos.
  - `ServiceCategory` → `CostCategory`: "Compute"→`compute`, "Storage"→(`block-storage`|`object-storage`|`snapshot` según `SkuId`/`ChargeDescription`; si indistinguible→`object-storage`), "Databases"→`database`, "Networking"→(`nat`|`network-egress`|`ip-address` según `ChargeDescription`; default→`network-egress`), "AI and Machine Learning"→nueva categoría `ai-ml`.
  - `ServiceName` → `nativeService`, `SkuId` o `ChargeDescription` → `nativeUsageType`, `RegionId` → `region`, `ChargePeriodStart` → `date` (solo fecha YYYY-MM-DD), `BilledCost` → `cost`, `ConsumedQuantity` → `quantity`, `ChargeCategory` → `chargeType`.
  - **Señal de compromiso**: si hay registros con `CommitmentDiscountId` no vacío → la regla `missing-commitment` debe leer esta señal como "ya tiene compromisos de descuento" y NO emitir el hallazgo.

#### F1-2: Nueva categoría `ai-ml` en `types.ts`
- Agregar `"ai-ml"` a `CostCategory`.
- Agregar a `CATEGORY_LABELS` en `query-billing.ts`: `"ai-ml"` → "Inteligencia artificial (AI/ML)".
- Agregar a `WasteCategory`: `"ai-visibility"` para el hallazgo de visibilidad de gasto IA.

#### F1-3: Orden de detección de formato
En `src/engine/parsers/index.ts`: FOCUS primero, luego AWS nativo, Azure, GCP.

#### F1-4: Fixture de prueba
- `test-data/caso-prueba-focus.csv`: 30 días, multi-categoría, incluye "AI and Machine Learning", costos diarios constantes para validación manual. Multi-proveedor (AWS + Azure) para verificar el mapeo de `ProviderName`.

#### F1-5: UI — Opción FOCUS destacada en Paso 2
- Nueva opción en la pantalla de fuente de datos: "Archivo FOCUS (recomendado) — el formato estándar que exportan AWS, Azure y GCP".
- Guía corta "¿Cómo lo exporto?":
  - **AWS (verificado con MCP)**: Billing and Cost Management console → Data Exports → Create export → Standard data export → Tabla: "FOCUS 1.0 with AWS columns" o "FOCUS 1.2 with AWS columns". Ref: `https://docs.aws.amazon.com/cur/latest/userguide/dataexports-create-standard.html`
  - **Azure**: Cost Management → Exports (FOCUS) *(ruta estimación editorial — verificar en portal Azure antes de citar como verificada)*.
  - **GCP**: BigQuery export + vista FOCUS *(ruta estimación editorial — verificar en Cloud Console antes de citar como verificada)*.
- Badge en el dashboard cuando el análisis proviene de FOCUS: "Datos en formato FOCUS 1.x".

#### F1-6: UI — Cuarta card en Paso 1
- Card "Cualquier nube (FOCUS)" que salta directamente a la pantalla de carga de archivo FOCUS, sin selección de proveedor (el proveedor se detecta del campo `ProviderName` en el CSV).

#### Criterios de aceptación Fase 1
- [ ] `npx tsc --noEmit` y `npm run build` limpios.
- [ ] `test-data/caso-prueba-focus.csv` sube y produce hallazgos (no 0 hallazgos).
- [ ] `test-data/caso-prueba-aws.csv` sigue produciendo los mismos hallazgos que antes.
- [ ] Fichero FOCUS con `CommitmentDiscountId` no vacío → `missing-commitment` NO se emite.

---

## FASE 2 — Lente de costos de IA (paquete de reglas `ai-spend`)

> **Prerequisito**: Fase 1 compilada y con build limpio.

### Contexto
State of FinOps 2026: gestión de costos de IA es la prioridad #1 de la industria. El agente de IA ahora audita el gasto en IA — "un agente de IA que audita tu gasto en IA".

### Detección de servicios IA
Cualquiera de estos criterios en un `NormalizedCostRecord`:
- `category === "ai-ml"` (viene de parser FOCUS).
- `nativeService` contiene (case-insensitive): "Bedrock", "SageMaker", "Comprehend", "Textract", "Rekognition", "OpenAI", "Cognitive Services", "AI Foundry", "Vertex AI".
- `nativeUsageType` coincide con patrón GPU de EC2: `BoxUsage:[pg]\d` (p3, p4, g4, g5, etc.).

### Requisitos

#### F2-1: Regla AI-VIS-001 — Visibilidad de gasto IA
- **Confianza**: `confirmado`.
- **Condición de disparo**: gasto IA total > $10/mes.
- **Contenido**: suma total, % de la factura, desglose por servicio IA, tendencia (primera vs segunda mitad del periodo con datos reales).
- **`savingsRange`**: `{conservative: 0, moderate: 0, optimistic: 0}` — es visibilidad, no ahorro.
- **`priorityScore`**: calculado con ahorro ficticio alto para que aparezca primero en la lista.
- **Remediación**: solo comandos de investigación (AWS CLI para filtrar Cost Explorer por servicio IA).

#### F2-2: Regla AI-GPU-001 — Instancias GPU siempre encendidas
- **Confianza**: `fuera-de-alcance-del-billing`.
- **Condición**: GPU (patrón `[pg]\d`) con costo estable ≥ $100/mes (≥ 7 días de datos).
- **`moderate = 0`**; `optimistic` teórico va al mecanismo `reviewPendingOptimisticUSD` existente (excluido del header del dashboard).
- **NUNCA recomendar terminate/stop** — solo revisar métricas reales.

#### F2-3: Regla AI-BDR-001 — Inferencia On-Demand intensiva en Bedrock
- **Confianza**: `inferencia`.
- **Condición**: gasto Bedrock ≥ $50/mes.
- **Recomendación**: Batch Inference (50% ahorro vs On-Demand — **verificado**: `https://docs.aws.amazon.com/bedrock/latest/userguide/capacity-limits-cost-optimization.html`) y prompt caching.
- **Supuestos** (`deriveSavingsRange()`):
  - "% de cargas que toleran procesamiento por lotes (Batch Inference)": `value=0.30`, `min=0.10`, `max=0.60`, estimación editorial ajustable.
  - "% de ahorro por Batch Inference vs On-Demand": `value=0.50`, `min=0.50`, `max=0.50` (fijo — verificado en docs).
- **Remediación**: comandos de investigación primero (listar invocaciones recientes); instrucción Batch Inference después con advertencia de que el procesamiento tarda hasta 24 horas.

#### F2-4: Regla AI-SM-001 — Endpoints SageMaker 24/7
- **Confianza**: `inferencia`.
- **Condición**: gasto SageMaker endpoint estable ≥ $50/mes (costo constante = siempre activo).
- **Recomendación**: Serverless Inference para tráfico intermitente (supuesto % ahorro ajustable, estimación editorial).
- **Remediación**: investigación primero (listar endpoints en servicio).

#### F2-5: Regla AI-TAG-001 — Gasto IA difícil de atribuir
- **Confianza**: `confirmado`.
- **Condición**: hay gasto IA y NO se detectan `CommitmentDiscountId` ni tags de asignación de costos en los registros IA.
- **Recomendación**: activar **application inference profiles** de Bedrock (**verificado** — feature real: `https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-application-inference-profiles.html`) para asignar costos por equipo/proyecto.
- **`savingsRange`**: ceros (es visibilidad/gobierno, no ahorro directo).

#### F2-6: UI — Tarjeta de gasto IA en dashboard
- Nueva tarjeta resumen "Gasto en IA — $X/mes (Y%)" con color distintivo (morado), SOLO visible cuando existe gasto IA detectado.
- En el tab Resumen: sección "Tu gasto en IA" con desglose por servicio IA.

#### F2-7: Demo — Arquetipo "startup de IA"
- Nuevo arquetipo en la rotación aleatoria de `generateDemoData()`.
- Patrones: Bedrock on-demand alto, 2 endpoints SageMaker, instancias g5, gasto IA sin tags de asignación.

#### F2-8: Chat — Soporte IA
- Nueva pregunta sugerida: "¿Cuánto estoy gastando en IA y cómo lo reduzco?"
- Las tools del agente ya filtran por `category` — verificar que `"ai-ml"` funciona como filtro.

#### Criterios de aceptación Fase 2
- [ ] Demo con arquetipo "startup de IA" produce hallazgos AI-VIS-001, AI-BDR-001 y AI-TAG-001.
- [ ] AI-GPU-001 no recomienda terminar instancias.
- [ ] El campo `optimistic` de AI-GPU-001 va a `reviewPendingOptimisticUSD`, no al header.
- [ ] `npx tsc --noEmit` y `npm run build` limpios.

---

## FASE 3 — Conector en vivo a FOCUS export de AWS (S3)

> **Prerequisito**: Fase 2 compilada y con build limpio.

### Contexto
AWS Data Exports deposita el FOCUS 1.0/1.2 como archivos CSV (gzip) o Parquet en un bucket S3 del usuario, actualizado a diario. Leeremos el archivo más reciente directamente con credenciales read-only mínimas.

### Requisitos

#### F3-1: Conector S3 (`src/engine/focus-s3-connector.ts`)
- **Dependencia**: `@aws-sdk/client-s3` (ya en `package.json`; verificar que incluye GetObject y ListObjectsV2).
- **Inputs**: `{ credentials: AWSCredentials, bucket: string, prefix: string, region: string }`.
- **Lógica**:
  1. `ListObjectsV2` sobre el prefijo → objeto `.csv.gz` más reciente por `LastModified`.
  2. `GetObject` → `zlib.gunzipSync()` → string CSV → `parseFOCUSCSV()` del parser Fase 1.
  3. Si el objeto más reciente es `.parquet`: error claro "Configura tu export en formato CSV (gzip) — el formato Parquet no está soportado aún."
  4. Si el objeto > 50 MB (Content-Length): error claro "El export supera 50 MB — configura un export con menor alcance de fechas."
- **Seguridad**: credenciales en memoria por llamada, jamás almacenadas ni logueadas.

#### F3-2: Ruta API `POST /api/connect-focus`
- Mismo patrón de seguridad que `/api/connect`.
- Body: `{ accessKeyId, secretAccessKey, sessionToken?, region?, bucket, prefix, action: "validate" | "analyze" }`.
- Acción `validate`: verifica que las credenciales pueden hacer `s3:ListBucket` sobre el bucket/prefijo.
- Acción `analyze`: llama al conector, parsea con FOCUS parser, ejecuta `calculateSavings()`, retorna report.
- **No loguear** `accessKeyId`, `secretAccessKey` ni `sessionToken` en ningún `console.log` o `console.error`.

#### F3-3: UI — Opción en Paso 2 (solo AWS)
- Tercera opción en la pantalla de fuente de datos de AWS: "Conectar bucket de FOCUS export (Data Exports)".
- Campos: bucket, prefijo (default: `/`), región (default: `us-east-1`), Access Key ID, Secret Access Key, Session Token (opcional).
- Política IAM mínima lista para copiar:
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetObject"],
      "Resource": [
        "arn:aws:s3:::<TU-BUCKET>",
        "arn:aws:s3:::<TU-BUCKET>/<TU-PREFIJO>/*"
      ]
    }]
  }
  ```
- Aviso de seguridad: "Las credenciales se usan solo en memoria para esta solicitud y no se almacenan."
- Guía: "¿No tienes el export? Actívalo en: Billing and Cost Management → Data Exports → Create export → Standard data export → Tabla: FOCUS 1.0 with AWS columns. AWS lo actualiza a diario." (ruta verificada con MCP).

#### F3-4: Fixture gzip para pruebas
- `test-data/focus-export-sample.csv.gz`: gzip del fixture `test-data/caso-prueba-focus.csv` de la Fase 1.
- El script de generación se incluye en `test-data/generate-fixtures.sh`.

#### Criterios de aceptación Fase 3
- [ ] `test-data/focus-export-sample.csv.gz` se procesa correctamente por el conector.
- [ ] Error claro al recibir `.parquet`.
- [ ] Error claro al exceder 50 MB.
- [ ] Ninguna credencial aparece en los logs del servidor.
- [ ] `npx tsc --noEmit` y `npm run build` limpios.

---

## Cierre transversal (después de cada fase y al final)

- **UX**: pase de claridad doble altitud aplicado a todo lo nuevo; `CONFIDENCE_LABELS` y `CATEGORY_LABELS` en español usados en todos los textos visibles; leyenda de confianza visible en la lista de hallazgos.
- **Verificación**: `npx tsc --noEmit && npm run build` limpios al cierre de cada fase.
- **Regresión**: correr análisis con `test-data/caso-prueba-aws.csv` y `test-data/caso-prueba-focus.csv` y confirmar que ningún hallazgo existente se rompe.
