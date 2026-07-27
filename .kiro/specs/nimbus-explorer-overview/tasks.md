# Tareas — FinOps Agent (Nimbus Explorer)

**Versión:** 1.0  
**Estado:** Fases 1-3 completadas, roadmap pendiente  
**Fecha:** 2026-07-21  

---

## 1. FASE 1 — Soporte FOCUS (Completada)

### F1-1: Parser FOCUS (`src/engine/parsers/focus-parser.ts`)

**Estado:** ✅ Completado  
**Evidencia:** `src/engine/parsers/focus-parser.ts`

**Implementación:**
- Detección de formato: CSV con headers que contengan `billedcost` y `chargeperiodstart` (case-insensitive) más al menos 2 corroborantes
- Mapeo de `ProviderName`: "AWS"/"Amazon" → `aws`; "Microsoft"/"Azure" → `azure`; "Google" → `gcp`; otros → `unknown`
- Mapeo de `ServiceCategory`: "Compute"→`compute`, "Storage"→(`block-storage`|`object-storage`|`snapshot`), "Databases"→`database`, "Networking"→(`nat`|`network-egress`|`ip-address`), "AI and Machine Learning"→`ai-ml`
- Señal de compromiso: `CommitmentDiscountId` no vacío → `missing-commitment` NO se emite

---

### F1-2: Nueva categoría `ai-ml` en `types.ts`

**Estado:** ✅ Completado  
**Evidencia:** `src/engine/types.ts`

**Implementación:**
```typescript
export type CostCategory =
  | "compute"
  | "block-storage"
  | "file-storage"
  | "object-storage"
  | "snapshot"
  | "network-egress"
  | "nat"
  | "ip-address"
  | "database"
  | "serverless"
  | "ai-ml"      // ← NUEVO
  | "other";
```

---

### F1-3: Orden de detección de formato

**Estado:** ✅ Completado  
**Evidencia:** `src/engine/parsers/index.ts`

**Implementación:**
```typescript
// Order: FOCUS primero, luego native providers
if (isFOCUSFormat(headers)) {
  return { format: "focus", ambiguous: false, ... };
}
if (isAWSCostExplorerSummary(headers)) {
  return { format: "aws", ... };
}
if (isAzureCostAnalysisSummary(headers)) {
  return { format: "azure", ... };
}
if (isGCPConsoleSummary(headers)) {
  return { format: "gcp", ... };
}
// Fallback a scoring...
```

---

### F1-4: Fixture de prueba

**Estado:** ✅ Completado  
**Evidencia:** `test-data/caso-prueba-focus.csv`

**Características:**
- 30 días, multi-categoría
- Incluye "AI and Machine Learning"
- Costos diarios constantes para validación manual
- Multi-proveedor (AWS + Azure) para verificar el mapeo de `ProviderName`

---

### F1-5: UI — Opción FOCUS destacada en Paso 2

**Estado:** ✅ Completado  
**Evidencia:** `src/components/upload-section.tsx`

**Implementación:**
- Nueva opción en la pantalla de fuente de datos: "Archivo FOCUS (recomendado) — el formato estándar que exportan AWS, Azure y GCP"
- Guía corta "¿Cómo lo exporto?":
  - **AWS**: Billing and Cost Management console → Data Exports → Create export → Standard data export → Table: "FOCUS 1.0 with AWS columns" o "FOCUS 1.2 with AWS columns"
  - **Azure**: Cost Management → Exports (FOCUS)
  - **GCP**: BigQuery export + vista FOCUS
- Badge en el dashboard cuando el análisis proviene de FOCUS: "Datos en formato FOCUS 1.x"

---

### F1-6: UI — Cuarta card en Paso 1

**Estado:** ✅ Completado  
**Evidencia:** `src/app/page.tsx`

**Implementación:**
- Card "Cualquier nube (FOCUS)" que salta directamente a la pantalla de carga de archivo FOCUS, sin selección de proveedor (el proveedor se detecta del campo `ProviderName` en el CSV)

---

### Criterios de aceptación Fase 1

| Criterio | Archivo/Función | Estado |
|----------|----------------|--------|
| `npx tsc --noEmit` y `npm run build` limpios | Script de CI | ✅ |
| `test-data/caso-prueba-focus.csv` sube y produce hallazgos | `test-data/caso-prueba-focus.csv` | ✅ |
| `test-data/caso-prueba-aws.csv` sigue produciendo los mismos hallazgos que antes | Regresión | ✅ |
| Fichero FOCUS con `CommitmentDiscountId` no vacío → `missing-commitment` NO se emite | `src/engine/rules/storage-waste.ts` | ✅ |

---

## 2. FASE 2 — Lente de costos de IA (Completada)

### F2-1: Regla AI-VIS-001 — Visibilidad de gasto IA

**Estado:** ✅ Completado  
**Evidencia:** `src/engine/rules/ai-spend.ts`

**Implementación:**
- **Confianza:** `confirmado`
- **Condición de disparo:** gasto IA total > $10/mes
- **Contenido:** suma total, % de la factura, desglose por servicio IA, tendencia (primera vs segunda mitad del periodo con datos reales)
- **`savingsRange`**: `{conservative: 0, moderate: 0, optimistic: 0}` — es visibilidad, no ahorro
- **`priorityScore`**: calculado con ahorro ficticio alto para que aparezca primero en la lista
- **Remediación:** solo comandos de investigación (AWS CLI para filtrar Cost Explorer por servicio IA)

---

### F2-2: Regla AI-GPU-001 — Instancias GPU siempre encendidas

**Estado:** ✅ Completado  
**Evidencia:** `src/engine/rules/ai-spend.ts`

**Implementación:**
- **Confianza:** `fuera-de-alcance-del-billing`
- **Condición:** GPU (patrón `[pg]\d`) con costo estable ≥ $100/mes (≥ 7 días de datos)
- **`moderate = 0`**; `optimistic` teórico va al mecanismo `reviewPendingOptimisticUSD` existente (excluido del header del dashboard)
- **NUNCA recomendar terminate/stop** — solo revisar métricas reales

---

### F2-3: Regla AI-BDR-001 — Inferencia On-Demand intensiva en Bedrock

**Estado:** ✅ Completado  
**Evidencia:** `src/engine/rules/ai-spend.ts`

**Implementación:**
- **Confianza:** `inferencia`
- **Condición:** gasto Bedrock ≥ $50/mes
- **Recomendación:** Batch Inference (50% ahorro vs On-Demand — **verificado**) y prompt caching
- **Supuestos** (`deriveSavingsRange()`):
  - "% de cargas que toleran procesamiento por lotes (Batch Inference)": `value=0.30`, `min=0.10`, `max=0.60`
  - "% de ahorro por Batch Inference vs On-Demand": `value=0.50`, `min=0.50`, `max=0.50` (fijo — verificado en docs)

---

### F2-4: Regla AI-SM-001 — Endpoints SageMaker 24/7

**Estado:** ✅ Completado  
**Evidencia:** `src/engine/rules/ai-spend.ts`

**Implementación:**
- **Confianza:** `inferencia`
- **Condición:** gasto SageMaker endpoint estable ≥ $50/mes (costo constante = siempre activo)
- **Recomendación:** Serverless Inference para tráfico intermitente (supuesto % ahorro ajustable, estimación editorial)
- **Remediación:** investigación primero (listar endpoints en servicio)

---

### F2-5: Regla AI-TAG-001 — Gasto IA difícil de atribuir

**Estado:** ✅ Completado  
**Evidencia:** `src/engine/rules/ai-spend.ts`

**Implementación:**
- **Confianza:** `confirmado`
- **Condición:** hay gasto IA y NO se detectan `CommitmentDiscountId` ni tags de asignación de costos en los registros IA
- **Recomendación:** activar **application inference profiles** de Bedrock (**verificado**) para asignar costos por equipo/proyecto
- **`savingsRange`**: ceros (es visibilidad/gobierno, no ahorro directo)

---

### F2-6: UI — Tarjeta de gasto IA en dashboard

**Estado:** ✅ Completado  
**Evidencia:** `src/components/report-dashboard.tsx`

**Implementación:**
- Nueva tarjeta resumen "Gasto en IA — $X/mes (Y%)" con color distintivo (morado), SOLO visible cuando existe gasto IA detectado
- En el tab Resumen: sección "Tu gasto en IA" con desglose por servicio IA

---

### F2-7: Demo — Arquetipo "startup de IA"

**Estado:** ✅ Completado  
**Evidencia:** `src/engine/demo-data.ts`

**Implementación:**
- Nuevo arquetipo en la rotación aleatoria de `generateDemoData()`
- Patrones: Bedrock on-demand alto, 2 endpoints SageMaker, instancias g5, gasto IA sin tags de asignación

---

### F2-8: Chat — Soporte IA

**Estado:** ✅ Completado  
**Evidencia:** `src/engine/agent.ts`

**Implementación:**
- Nueva pregunta sugerida: "¿Cuánto estoy gastando en IA y cómo lo reduzco?"
- Las tools del agente ya filtran por `category` — verificar que `"ai-ml"` funciona como filtro

---

### Criterios de aceptación Fase 2

| Criterio | Archivo/Función | Estado |
|----------|----------------|--------|
| Demo con arquetipo "startup de IA" produce hallazgos AI-VIS-001, AI-BDR-001 y AI-TAG-001 | `test-data/demo-data.ts` | ✅ |
| AI-GPU-001 no recomienda terminar instancias | `src/engine/rules/ai-spend.ts` | ✅ |
| El campo `optimistic` de AI-GPU-001 va a `reviewPendingOptimisticUSD`, no al header | `src/engine/rules/ai-spend.ts` | ✅ |
| `npx tsc --noEmit` y `npm run build` limpios | Script de CI | ✅ |

---

## 3. FASE 3 — Conector en vivo a FOCUS export de AWS (S3) (Completada)

### F3-1: Conector S3 (`src/engine/focus-s3-connector.ts`)

**Estado:** ✅ Completado  
**Evidencia:** `src/engine/focus-s3-connector.ts`

**Implementación:**
- **Dependencia:** `@aws-sdk/client-s3` (ya en `package.json`)
- **Inputs:** `{ credentials: AWSCredentials, bucket: string, prefix: string, region: string }`
- **Lógica:**
  1. Lee el `Manifest.json` para obtener la lista de chunks de la ejecución más reciente
  2. Download todos los chunks `.csv.gz` (o `.parquet`)
  3. `zlib.gunzipSync()` → string CSV → `parseFOCUSCSV()` del parser Fase 1
  4. Si el objeto es `.parquet`: error claro "Configura tu export en formato CSV (gzip) — el formato Parquet no está soportado aún."
  5. Si el objeto > 50 MB (Content-Length): error claro "El export supera 50 MB — configura un export con menor alcance de fechas."

---

### F3-2: Ruta API `POST /api/connect-focus`

**Estado:** ✅ Completado  
**Evidencia:** `src/app/api/connect-focus/route.ts`

**Implementación:**
- Mismo patrón de seguridad que `/api/connect`
- Body: `{ accessKeyId, secretAccessKey, sessionToken?, region?, bucket, prefix, action: "validate" | "analyze" }`
- Acción `validate`: verifica que las credenciales pueden hacer `s3:ListBucket` sobre el bucket/prefijo
- Acción `analyze`: llama al conector, parsea con FOCUS parser, ejecuta `calculateSavings()`, retorna report
- **No loguear** `accessKeyId`, `secretAccessKey` ni `sessionToken` en ningún `console.log` o `console.error`

---

### F3-3: UI — Opción en Paso 2 (solo AWS)

**Estado:** ✅ Completado  
**Evidencia:** `src/components/focus-s3-connect-section.tsx`

**Implementación:**
- Tercera opción en la pantalla de fuente de datos de AWS: "Conectar bucket de FOCUS export (Data Exports)"
- Campos: bucket, prefijo (default: `/`), región (default: `us-east-1`), Access Key ID, Secret Access Key, Session Token (opcional)
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
- Guía: "¿No tienes el export? Actívalo en: Billing and Cost Management → Data Exports → Create export → Standard data export → Table: FOCUS 1.0 with AWS columns. AWS lo actualiza a diario."

---

### F3-4: Fixture gzip para pruebas

**Estado:** ✅ Completado  
**Evidencia:** `test-data/focus-export-sample.csv.gz`

**Implementación:**
- `test-data/focus-export-sample.csv.gz`: gzip del fixture `test-data/caso-prueba-focus.csv` de la Fase 1
- El script de generación se incluye en `test-data/generate-fixtures.sh`

---

### Criterios de aceptación Fase 3

| Criterio | Archivo/Función | Estado |
|----------|----------------|--------|
| `test-data/focus-export-sample.csv.gz` se procesa correctamente por el conector | `test-data/focus-export-sample.csv.gz` | ✅ |
| Error claro al recibir `.parquet` | `src/engine/focus-s3-connector.ts` | ✅ |
| Error claro al exceder 50 MB | `src/engine/focus-s3-connector.ts` | ✅ |
| Ninguna credencial aparece en los logs del servidor | `src/app/api/connect-focus/route.ts` | ✅ |
| `npx tsc --noEmit` y `npm run build` limpios | Script de CI | ✅ |

---

## 4. Roadmap Pendiente

### R1: Conexión por cross-account role con external ID

**Estado:** 🟡 Pendiente  
**Prioridad:** Alta  
**Descripción:** En lugar de que el usuario pegue keys de acceso, la app asumiría un rol IAM en la cuenta del cliente mediante `sts:AssumeRole` con un **external ID** único por cliente para prevenir el problema del "confused deputy". El cliente crearía un rol de solo lectura (`ce:Get*`) que confía en la cuenta del servicio, y nunca compartiría credenciales de larga duración.

**Implementación requerida:**
1. Nueva API `/api/connect-cross-account` que recibe `roleArn` y `externalId`
2. Uso de `@aws-sdk/client-sts` para `assumeRole`
3. Recuperación de credenciales temporales (`AccessKeyId`, `SecretAccessKey`, `SessionToken`)
4. Reutilización de la lógica existente de `/api/connect` con las credenciales temporales
5. UI: nuevo campo para `roleArn` y `externalId` en lugar de `accessKeyId` y `secretAccessKey`

**Archivos a modificar:**
- `src/app/api/connect-cross-account/route.ts` (nuevo)
- `src/components/cross-account-connect-section.tsx` (nuevo)
- `src/app/page.tsx`: agregar opción "Cross-account role" en el flujo

---

### R2: Conectores en vivo para Azure Cost Management y GCP Cloud Billing

**Estado:** 🟡 Pendiente  
**Prioridad:** Alta  
**Descripción:** Hoy Azure y GCP se conectan solo vía CSV export. Se desea conectar en vivo a sus APIs de costos.

**Azure Cost Management:**
- API: `https://management.azure.com/providers/Microsoft.Billing/billingPeriods/{billingPeriodName}/providers/Microsoft.Consumption/aggregatedCost?api-version=2023-05-01`
- Credenciales: Azure AD app registration con `Contributor` role
- Endpoints: `costs` endpoint con filtros por `groupName`, `tagName`, `dimension`, `tagValue`

**GCP Cloud Billing:**
- API: `https://cloudbilling.googleapis.com/v1/{billingAccountName}/costs`
- Credenciales: Service account con `Billing Account Viewer` role
- Endpoints: `costs` endpoint con filtros por `period`, `currency`, `filter`

**Implementación requerida:**
1. `src/engine/azure-connector.ts` — similar a `aws-connector.ts`
2. `src/engine/gcp-connector.ts` — similar a `aws-connector.ts`
3. Rutas API `/api/connect-azure` y `/api/connect-gcp`
4. UI: secciones de conexión específicas para Azure y GCP
5. Mapeo de Azure/GCP services a las categorías canónicas

**Archivos a crear/modificar:**
- `src/engine/azure-connector.ts` (nuevo)
- `src/engine/gcp-connector.ts` (nuevo)
- `src/app/api/connect-azure/route.ts` (nuevo)
- `src/app/api/connect-gcp/route.ts` (nuevo)
- `src/components/azure-connect-section.tsx` (nuevo)
- `src/components/gcp-connect-section.tsx` (nuevo)
- `src/app/page.tsx`: agregar opciones para Azure y GCP en "Conectar cuenta"

---

### R3: Verificación automática de la tabla de precios contra las APIs de precios

**Estado:** 🟡 Pendiente  
**Prioridad:** Media  
**Descripción:** La tabla de precios (`src/engine/pricing.ts`) está versionada y marcada como **no verificada** hasta consultarse contra la API de precios de cada nube.

**AWS Price List API:**
- Service code: `AmazonEC2`, `AmazonS3`, `AmazonEBS`, `AmazonVPC`, etc.
- Endpoint: `pricing.getProducts()`
- Filtros: `ServiceCode`, `Location`, `ProductFamily`, `termType`, `unit`, etc.

**Azure Pricing API:**
- Endpoint: `https://prices.azure.com/api/retail/prices`
- Filtros: `serviceName`, `meterName`, `armSkuName`, `reservationTerm`, etc.

**GCP Billing API:**
- Endpoint: `https://cloudbilling.googleapis.com/v1/services/{serviceId}/skus`
- Filtros: `service`, `sku`, `currency`, etc.

**Implementación requerida:**
1. MCP server `aws-pricing` / `azure-pricing` / `gcp-pricing` (ya existe `aws-pricing`)
2. Script de validación `npm run pricing:check`
3. Actualización automática con `npm run pricing:refresh`
4. Indicador visual en UI: "Precios verificados" / "Precios estimados"

**Archivos a modificar:**
- `src/mcp/price-list-connector.ts` (nuevo, para Azure y GCP)
- `src/engine/pricing.ts`: marcar entries como `verified: true` cuando se consulte la API
- `src/app/api/pricing/verify/route.ts` (nuevo)

---

### R4: Panel de supuestos interactivo

**Estado:** 🟡 Pendiente  
**Prioridad:** Media  
**Descripción:** Panel que recalcula los rangos de ahorro en vivo ajustando los supuestos de cada hallazgo.

**Requisitos:**
1. UI: sliders/deslizadores para cada supuesto de cada hallazgo
2. Backend: función `calculateScenario()` ya existe en `src/engine/scenarios.ts`
3. Sync: actualización en tiempo real del dashboard al ajustar supuestos
4. Persistencia: guardar escenario en `analysis-store.ts`
5. Export: incluir supuestos en PDF/Markdown/Excel

**Implementación requerida:**
1. Componente `<ScenarioPanel findings: Finding[]>` con sliders por supuesto
2. Endpoint `/api/analysis/:id/scenario` ya existe
3. UI: actualizar dashboard al cambiar supuestos
4. Export: incluir supuestos en reporte

**Archivos a modificar:**
- `src/components/scenario-panel.tsx` (nuevo)
- `src/components/report-dashboard.tsx`: agregar pestaña "Supuestos" o integrar sliders
- `src/i18n/dictionaries/es.ts` y `en.ts`: traducciones para el panel

---

## 5. Resumen de estado

| Componente | Estado |
|------------|--------|
| **Parsers** | ✅ FOCUS, AWS, Azure, GCP |
| **Motor de reglas** | ✅ 13+ reglas |
| **Agente IA (Atlas)** | ✅ Con guardrails |
| **Conector AWS Cost Explorer** | ✅ |
| **Conector AWS S3 (FOCUS)** | ✅ |
| **Demo** | ✅ Con arquetipo "startup de IA" |
| **Reporte** | ✅ PDF, Markdown, Excel |
| **Tema claro/oscuro** | ✅ |
| **i18n ES/EN** | ✅ |
| **Cross-account role** | 🟡 Pendiente |
| **Azure/GCP live** | 🟡 Pendiente |
| **Pricing API** | 🟡 Pendiente |
| **Panel de supuestos** | 🟡 Pendiente |

---

## 6. Notas

- Las Fases 1, 2 y 3 están completamente implementadas y verificadas (`npm run build` y `npm run test:billing` pasan).
- El roadmap pendiente está priorizado según el README.md.
- Todas las funcionalidades del roadmap se pueden implementar sin modificar la arquitectura existente.
