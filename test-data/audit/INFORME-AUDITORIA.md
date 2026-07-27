# Informe de auditoría del motor — Nimbus / finops-agent

Fecha de ejecución: 2026-07-25. Todo lo que aparece aquí sale de una ejecución real con `npx tsx`, sin pasar por HTTP.
No se modificó ningún fichero de `src/`. Los scripts nuevos viven en `test-data/audit/`.

Reproducción completa:

```bash
npx tsx test-data/audit/generate.mjs             # fixtures + ground-truth.json
npx tsx test-data/audit/audit-figures.mjs        # tareas 1 y 2
npx tsx test-data/audit/audit-probes.mjs         # sondas de clasificación y umbrales
npx tsx test-data/audit/audit-markdown.mjs       # tarea 3
npx tsx test-data/audit/audit-kb.mjs             # tarea 4 (incluye 61 URLs)
npx tsx test-data/audit/audit-kb-contradictions.mjs
npx tsx test-data/audit/audit-parsers.mjs        # tarea 5
npx tsx test-data/audit/audit-simulator.mjs
npx tsx test-data/audit/audit-empty-report.mjs
npx tsc --noEmit                                 # exit 0, sin errores de tipos
```

---

## 1. Verdad de referencia frente al motor

Costes exactos por diseño del generador. «Coste periodo» = suma de `EffectiveCost` de las filas de uso; «Mensual» = coste/día × 30.

| Archivo | Formato esp/det | Días esp/motor | Coste periodo esp/motor | Mensual esp/motor | Hallazgos | Tendencias |
|---|---|---|---|---|---|---|
| focus-6dias.csv | focus/focus | 6/6 | $907.20 / $907.20 OK | $4 536 / $4 536 OK | 9 | 0 |
| focus-7dias.csv | focus/focus | 7/7 | $1 058.40 / $1 058.40 OK | $4 536 / $4 536 OK | 10 | 0 |
| focus-13dias.csv | focus/focus | 13/13 | $1 965.60 / $1 965.60 OK | $4 536 / $4 536 OK | 10 | 0 |
| focus-14dias.csv | focus/focus | 14/14 | $2 116.80 / $2 116.80 OK | $4 536 / $4 536 OK | 10 | 0 |
| focus-effective-vs-billed.csv | focus/focus | 14/14 | $2 116.80 / $2 116.80 OK | $4 536 / $4 536 OK | 10 | 0 |
| focus-commitment-purchase.csv | focus/focus | 14/14 | $3 516.80 / $3 516.80 OK | $7 536 / $7 536 OK | 10 | 0 |
| focus-tax-credits.csv | focus/focus | 14/14 | $2 116.80 / $2 116.80 OK | $4 536 / $4 536 OK | 10 | 0 |
| focus-con-subcategory.csv | focus/focus | 14/14 | $2 116.80 / $2 116.80 OK | $4 536 / $4 536 OK | 10 | 0 |
| focus-sin-subcategory.csv | focus/focus | 14/14 | $2 116.80 / $2 116.80 OK | $4 536 / $4 536 OK | 10 | 0 |
| aws-cur-14dias.csv | aws/aws | 14/14 | $1 766.80 / $1 766.80 OK | $3 786 / $3 786 OK | 9 | 0 |
| azure-cm-14dias.csv | azure/azure | 14/14 | $1 512.00 / $1 512.00 OK | $3 240 / $3 240 OK | 4 | 0 |
| gcp-billing-14dias.csv | gcp/gcp | 14/14 | $1 587.60 / $1 587.60 OK | $3 402 / $3 402 OK | 6 | 0 |
| focus-ahorro-agresivo.csv | focus/focus | 20/20 | $49 000 / $49 000 OK | $73 500 / $73 500 OK | 11 | 0 |

Totales y detección de formato: **13 de 13 exactos**. Donde falla es en la **clasificación por categoría**:

| Archivo | Categoría esperada | Categoría del motor | Importe desplazado |
|---|---|---|---|
| todos los FOCUS | ip-address | network-egress | $16.80 en 14 días ($36/mes) |
| aws-cur-14dias.csv | database (RDS) | compute | $420 en 14 días ($900/mes) |
| gcp-billing-14dias.csv | snapshot | block-storage | $98 en 14 días ($210/mes) |
| azure-cm-14dias.csv | — | — | sin desvíos |

Consecuencia: las reglas dedicadas (IP ociosa, snapshots) no se disparan y el dinero se atribuye a otra categoría en el desglose y en el simulador.

### Casos exigidos explícitamente

**6 vs 7 días.** El umbral de 7 días **solo aplica a 1 de las 10 reglas**. Con 6 días distintos el motor ya emite **9 hallazgos agregados** (ai-visibility, ai-cost-attribution, missing-commitment, unattached-storage, nat-gateway-overuse, legacy-generation, unoptimized-storage-class, ai-batch-opportunity, excessive-snapshots). Solo `utilization-review` aparece al llegar a 7. Con **un único día** de datos ($6 500) el motor emite 3 hallazgos y promete **$48 000/mes de ahorro** proyectando ese día ×30, sin ninguna advertencia. El panel `file-check` declara al usuario `aggregate-findings: al menos 7 días`, lo que no se cumple.

**13 vs 14 días (tendencias).** Correcto y verificado con datos que sí llevan señal (pico el día 5 + crecimiento lineal): 12 días → 0 insights, 13 → 0, 14 → 3 (`daily-spike`, `sustained-growth`, `month-projection`), 20 → 3. La aritmética de la evidencia es reproducible a mano (mediana $226, pico $1 048 → 4.6×; pendiente $12/día sobre intercepto $100 → 84 %/semana).

**EffectiveCost vs BilledCost.** Fixture con `BilledCost = EffectiveCost × 1.25` en todas las filas: Σ EffectiveCost = **$2 116.80**, Σ BilledCost = **$2 646.00**, y lo que analizan las reglas (`record.cost`) = **$2 116.80**. `totalCostUSD` = $4 536, que es exactamente el mensual sobre base devengo. **El motor usa EffectiveCost. Correcto.**

**Compras de compromiso.** Fila `ChargeCategory=Purchase`, `BilledCost=5 000`, `EffectiveCost=0`, junto a 14 días de uso amortizado a $100/día. Filas Purchase que sobreviven al parser: **0**. Σ cost = $3 516.80 (con doble conteo habría dado $8 516.80). `totalCostUSD` = $7 536 = esperado. Además `missing-commitment` **no** se emite porque hay `CommitmentDiscountId`. **Sin doble conteo. Correcto.**

**Impuestos y créditos.** De 14 filas Tax y 14 filas Credit (−$30/día), sobreviven **0 y 0**. Los impuestos se excluyen a propósito y está documentado. Los créditos **no**: caen por el filtro genérico `cost <= 0` del parser, sin mención en el código ni en el informe. El informe declara **$4 536/mes** cuando el neto facturado del mismo periodo es **$4 086/mes** (sobreestimación de $450/mes, un 11 %). `file-check` los agrupa bajo «Costo en $0, negativo o no numérico», que es donde el usuario podría verlo, pero el hallazgo y el total no lo reflejan.

**ServiceSubcategory presente vs ausente.** Dos ficheros idénticos salvo esa columna: 112 registros cada uno, **0 discrepancias de clasificación**, 10 hallazgos y $1 103.10 de ahorro moderado en ambos. **Correcto.**

---

## 2. Auditoría de las cifras

Sobre 13 informes y **119 hallazgos**:

| # | Comprobación | Comprobaciones | Violaciones | Resultado |
|---|---|---|---|---|
| 1 | conservador ≤ moderado ≤ optimista | 119 | 0 | OK |
| 2 | `estimatedMonthlySavingsUSD` == `savingsRange.moderate` | 119 | 0 | OK |
| 3 | ahorro total ≤ coste proyectado | 13 informes | 0 | OK — máximo 33.99 % del gasto (focus-ahorro-agresivo: $24 984 de ahorro moderado y $45 336 optimista sobre $73 500) |
| 4 | contrato de `deriveSavingsRange` | 7 casos + 119 hallazgos | 0 | OK |
| 5 | inversión del simulador | 119 | 2 | 2 hallazgos con ahorro real y sin supuestos |
| 6 | artefactos de coma flotante en hallazgos y tendencias | 119 | 0 | OK |

**4. `deriveSavingsRange`.** Verificado con casos concretos, incluido el supuesto fijo:

| Caso | Base | Resultado | Esperado |
|---|---|---|---|
| ejemplo del docblock (2 supuestos) | 100 | 5 / 20 / 54.40 | 5 / 20 / 54.40 |
| un supuesto | 1 234.567 | 61.73 / 246.91 / 493.83 | idem |
| supuesto fijo min=value=max=0.5 | 900 | 450 / 450 / 450 | idem |
| variable × fijo (caso batch 0.3 × 0.5) | 900 | 45 / 135 / 270 | idem |
| base 0 | 0 | 0 / 0 / 0 | idem |
| sin supuestos | 500 | 500 / 500 / 500 | producto vacío = 1, coherente |
| base negativa | −100 | −10 / −30 / −60 | idem (no hay guarda de signo) |

Además, los 119 hallazgos con supuestos permiten **reproducir su rango exacto** invirtiendo `moderate / Π(valores)` y volviendo a llamar a la función: **0 discrepancias**.

**5. Simulador.** Réplica exacta de la aritmética de `WhatIfSimulator`: en todos los hallazgos con supuestos, la base recuperada coincide **al céntimo** con el coste mensual que la propia regla declara en su `calculationBreakdown` (deriva $0.00; p. ej. COMMIT-AWS: $2 100 / (0.70 × 0.30) → $2 100). No hay bases negativas ni infinitas: el componente se protege con `productOfDefaults === 0 || estimatedMonthlySavingsUSD === 0 → return null`.

El problema es otro: **8 hallazgos distintos publican `savingsRange` sin ningún supuesto**, y en 2 de ellos con dinero real:

| Hallazgo | Rango publicado | Supuestos | Simulador |
|---|---|---|---|
| IDLE-IP-aws-us-east-1 | $7.20 / $14.40 / $25.20 | 0 | no se muestra |
| IDLE-IP-gcp-us-central1 | $57.60 / $72.00 / $72.00 | 0 | no se muestra |
| UTIL-REVIEW-* (5 variantes) | $0 / $0 / hasta $5 400 | 0 | no se muestra |
| AI-GPU / AI-VIS / AI-TAG | $0 | 0 | no se muestra |

En los dos IDLE-IP los multiplicadores 0.2 / 0.4 / 0.7 (y 0.8 / 1.0 / 1.0) están **codificados dentro de la regla**, no como `FindingAssumption`. Eso rompe la promesa del docblock de `deriveSavingsRange` («no separate hardcoded multipliers») y la de la entrada `app-what-if` de la base de conocimiento («los rangos derivan de los sliders»). El usuario ve un rango de ahorro que no puede ajustar ni auditar.

**6. `formatUSD`.** Cero artefactos de coma flotante en los 119 hallazgos y en las tendencias. En el markdown sí hay importes que **no pasan por `formatUSD`**: `$18000`, `$1200`, `$900` (plantilla `Cómputo con gasto de ~$${Math.round(monthlyCost)}/mes` en `idle-resources.ts`) y `$18000.00` (`Costo mensual: $${monthlyCost.toFixed(2)}`). No son artefactos de coma flotante, pero rompen la regla de «todos los importes mostrados pasan por formatUSD» y salen sin separador de miles junto a otros que sí lo llevan.

**Extra.** `savingsPercentage` coincide con el recálculo en los 13 informes (diferencias ≤0.05 pp por redondeo a 1 decimal). `totalEstimatedSavingsUSD` incluye **todos** los hallazgos y `totalSavingsRange.moderate` solo los estimables; en la práctica coinciden porque los fuera de alcance tienen moderado 0, pero son bases distintas y la UI las mezcla (ver defecto D-11).

---

## 3. Hallazgos de la revisión del markdown

Revisados 5 informes (`test-data/audit/markdown/*.md`, entre 19 953 y 23 116 caracteres).

- **Emojis: 38–42 ocurrencias por informe, 12 distintos** (📊 🎯 📋 📂 🔍 📐 ✅ 🔶 ⬜ ⚠ ️ →) en cabeceras de sección, columna de confianza y avisos de irreversibilidad. El requisito de no emojis no se cumple.
- **Slug crudo renderizado.** La tabla de hallazgos imprime `⬜ Fuera-de-alcance-del-billing` porque `build-report.ts` hace `cap(f.confidence)`. `types.ts` dice literalmente que ese slug *NUNCA* debe renderizarse y que hay que usar `CONFIDENCE_LABELS`; ninguna etiqueta legible aparece en el markdown. El componente `printable-report.tsx` sí usa `CONFIDENCE_LABELS`, así que el PDF y el markdown muestran cosas distintas para el mismo dato.
- **Cifra calculada en la plantilla.** La suma de quick wins ($3 600, $210…) se calcula con un `reduce` dentro de `buildReport`, no es un campo de `AuditReport`. Es la única cifra genuinamente calculada aparte.
- **Cifras del markdown ausentes del objeto informe: 6 a 9 por informe.** Son costes base por hallazgo ($9 000/mes de almacenamiento de bloque, $24 000/mes de IA, $2 100/mes On-Demand, $36/mes de IPv4, tarifas de $0.005 y $3.65). Existen solo como texto dentro de `description` y `calculationBreakdown`; no hay ningún campo numérico que las respalde, así que no son verificables por un consumidor del JSON.
- **`summaryByService` no se exporta.** El motor lo calcula y `calculate-savings.ts` lo enriquece con ahorro por servicio, pero el markdown no tiene sección «Por servicio». Tampoco imprime nunca `finding.service`: en `aws-cur-14dias.md` los cinco nombres de servicio del informe (`Amazon Elastic Compute Cloud`, `Amazon Relational Database Service`, …) **no aparecen ni una vez**.
- **Nombres de servicio sin traducir: correcto** en lo que sí aparece (`Amazon Bedrock`, `Amazon SageMaker`). Cero traducciones indebidas detectadas.
- **Advertencias de acciones irreversibles: correctas.** Coincidencia exacta entre comandos `isIrreversible` y avisos: 3/3 y 4/4. El rollback aparece **antes** de la remediación en el 100 % de los bloques (contrato P0-3 cumplido).
- **Sin marcadores sin sustituir**, sin `undefined`/`NaN`/`[object Object]`. El único `null` es parte de una consulta JMESPath legítima de la AWS CLI.
- **Texto duplicado: 5–6 líneas largas repetidas por informe.** El aviso de irreversibilidad se repite ×3–4 literal, la línea de pilar ×4, y el bloque `# START=$(date -d "7 days ago" …)` ×3–4. El mismo rango de ahorro aparece en cabecera, resumen ejecutivo, tabla y detalle.
- **Pilar mal asignado.** `COMMIT-AWS` (Savings Plans) cita «COST06-BP01 — Decommission unused resources» y su URL, porque `missingCommitmentsRule` reutiliza el `getPillar` de `storage-waste.ts`. Un compromiso de descuento no es decomisionar recursos; el pilar correcto sería COST07.
- **Informe vacío sin error.** Con `parsed.records = []` (ver D-9) se genera un markdown completo con «Periodo: N/A — N/A», «Proveedores:» vacío y $0.00, sin ninguna señal de que el fichero no se pudo leer.

**Excel / PDF.** Existen ambas. `downloadExcel` en `printable-report.tsx` usa la dependencia `xlsx` y construye 4 hojas (Resumen, Hallazgos, Por servicio, Tendencias) con valores numéricos y `CONFIDENCE_LABELS`; el PDF es `window.print()` con `@media print`. **No pude invocarlas desde Node**: `downloadExcel` es una función no exportada dentro de un componente `"use client"` y termina en `XLSX.writeFile` disparando la descarga del navegador; `window.print()` es puramente de navegador. Revisadas por lectura: la hoja «Por servicio» sí exporta `summaryByService`, que el markdown omite.

---

## 4. Estado de la base de conocimiento

`npx tsx test-data/test-knowledge.mjs` → **43 passed, 0 failed**, exit 0.

| Métrica | Valor |
|---|---|
| Entradas totales | 79 |
| Con `sourceUrl` real | 56 (71 %) |
| Con `sourceUrl: null` | 23 (29 %) |
| ids duplicados | 0 |
| Campos vacíos o inválidos (incluidas keywords vacías o duplicadas) | 0 |
| Palabras clave presentes en 3+ entradas | 19 |

Las 23 entradas sin URL son, en su mayoría, precisamente las de Azure y GCP (`azure-advisor`, `azure-hybrid-benefit`, `gcp-cuds`, `gcp-sustained-use`, `gcp-recommender`, …) y las de metodología interna. Es coherente con la política declarada en la cabecera del fichero, pero significa que casi todas las cifras de descuento de Azure y GCP que la app puede citar en el chat vienen sin fuente verificable.

Colisiones de retrieval más fuertes: `focus` (9 entradas), `azure` (7), `gcp` (6), `billing` (5), `rightsizing` (4). Con `slice(0, 3)` en `lookupKnowledge`, una pregunta genérica sobre Azure o GCP puede dejar fuera la entrada correcta.

### URLs con problemas (61 únicas comprobadas: 56 de la KB + las citadas en `reference` y `pillar.url` de las reglas)

| Estado | URL | Acaba en | Citada en |
|---|---|---|---|
| **404** | `https://cloud.google.com/architecture/framework/cost-optimization/optimize-resources` | 301 → `docs.cloud.google.com/...` que devuelve **404** | `PILLAR:oversized-instances.ts`, `PILLAR:storage-waste.ts` |
| **404** | `https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/optimize-unassociated-resources` | 404 directo | `PILLAR:storage-waste.ts` |
| **302 → portada** | `https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_decomissioning.html` | `.../cost-optimization-pillar/` (portada del pilar) | `KB:wa-cost06-bp01`, `PILLAR:storage-waste.ts` |
| 301 → otro dominio | `https://cloud.google.com/storage/docs/autoclass` | `docs.cloud.google.com/storage/docs/autoclass` | `RULE:STORAGE-OBJ-001` |
| 301 → otro dominio + `?hl=pt` | `https://cloud.google.com/architecture/framework/cost-optimization` | `docs.cloud.google.com/...?hl=pt` (portugués) | `PILLAR:idle-resources.ts` |
| 301 → otro dominio | `https://cloud.google.com/architecture/framework/perspectives/ai-ml/cost-optimization` | `docs.cloud.google.com/...` | `PILLAR:ai-spend.ts` |

Los dos **404** se confirmaron por segunda vía con una petición independiente. **Sí hay más casos del patrón que ya conocíais**: `cost_decomissioning.html` es exactamente la misma situación que la URL de Well-Architected que ya habíais detectado (302 a la portada del pilar), y es el pilar que más se muestra, porque `storage-waste.ts` lo usa para discos, snapshots, tiering y compromisos. Las 55 restantes devuelven 200.

### Contradicciones internas

1. **Techo de los CUD de Google Cloud.** `gcp-cuds` (sin fuente): «hasta 57 % a 1 año, 70 % a 3 años». `playbook-cud-azure-reservations` (con fuente verificada): «CUD basados en recurso hasta 55 %, hasta 70 % en máquinas optimizadas para memoria; CUD flexibles 28 % a un año, 46 % a tres años». 57 y 55 no pueden ser ambos el techo publicado del mismo producto. La regla `COMMIT-001` usa la versión de 55 %/70 %, así que la entrada incoherente es la que va sin fuente.
2. **SUDs de GCP, contradicción dentro de la misma entrada.** `gcp-sustained-use` titula «Hasta 30 % de descuento» y en el detalle enumera una escalera que llega al «60 %», para luego decir que el efectivo es «aproximadamente 30 %». Quien cite el detalle publicará 60 %. Sin fuente.
3. **Taxonomía de CUD inconsistente**: `gcp-cuds` habla de «Resource-based / Spend-based» y `playbook-cud-azure-reservations` de «basados en recurso / flexibles de Compute», para la misma realidad y sin puente entre ambos vocabularios.
4. **Versiones FOCUS.** El parser se documenta como «FOCUS 1.0–1.4» y trata columnas de 1.4 (`ServiceProviderName`, `HostProviderName`), pero la etiqueta que ve el usuario en `file-check.ts` y el mensaje de error de detección dicen «FOCUS 1.0/1.2», y `printable-report.tsx` muestra «Formato FOCUS 1.x». Tres versiones distintas del mismo dato.
5. **Cuota de monitorización no descontada.** `STORAGE-OBJ-001` y `playbook-s3-tiering` advierten de la cuota por objeto de Intelligent-Tiering (~$0.0025 por 1 000 objetos/mes) y del cargo de habilitación de Autoclass, pero el rango de ahorro no la resta en ningún tramo, ni siquiera en el conservador.

Sí verifiqué que **la contradicción de tarifas de IP ya está resuelta**: `playbook-public-ipv4` y las `IP_RATES` de `idle-resources.ts` coinciden (AWS 0.005 con `idleRateIsDistinct: false`, Azure 0.005 false, GCP 0.01 true), igual que las tarifas de NAT (0.045/GB y 0.045/hora) entre `playbook-nat-vpc-endpoints` y `NAT-GW-001`.

---

## 5. Robustez de los parsers

| Entrada | Comportamiento | Veredicto |
|---|---|---|
| Comillas sin cerrar | Excepción: «Error al parsear FOCUS CSV: Quoted field unterminated; Too few fields: expected 13 fields but parsed 7» | **Limpio** — falla rápido, mensaje útil (aunque en inglés dentro de un mensaje en español) |
| Nº de columnas inconsistente | Excepción: «Too few fields: expected 13 but parsed 6; Too many fields: expected 13 but parsed 15» | **Limpio** |
| BOM al principio | 2 filas, Σ$150 exacto | **Limpio** |
| CRLF (Windows) | 2 filas, Σ$150 exacto | **Limpio** |
| Separador `;` | 2 filas, Σ$150 exacto (Papa autodetecta el delimitador) | **Limpio** |
| **Formato europeo `;` + `1.234,56`** | 2 filas, **Σ$3.73 en lugar de $3 734.56** | **SUCIO GRAVE** — subestima el gasto un **99.9 %** sin avisar |
| **Coma decimal con separador `,` (`"1.234,56"`)** | 1 fila, **Σ$1.23 en lugar de $1 234.56** (factor 1 003×) | **SUCIO GRAVE** — tres órdenes de magnitud, en silencio |
| Fechas ambiguas `01/02/2026` | La cadena se usa tal cual como clave de día, sin validar ni normalizar (`rawDate.split("T")[0].substring(0,10)`) | **SUCIO** — el mismo día en dos formatos cuenta como **2 días**: la proyección mensual cae de $6 000 a $3 000 |
| Otros formatos de fecha (`02-01-2026`, `01.02.2026`, epoch, texto) | Se aceptan como día distinto; «1 de febrero de 2026» queda como `"1 de febre"` | **SUCIO** — silenciosamente incorrecto |
| 50 000 filas (7.38 MB) | Parseo 114 ms + reglas e informe 82 ms = **196 ms**; Σ$289 883 exacto | **Limpio** |
| Unicode y acentos (`Almacén de Bloques Elásticos ñÑáéíóú 日本語 ☁`) | 1 fila, Σ$100 | **Limpio** |
| CSV vacío | Excepción: «No se pudieron detectar columnas en el CSV…» | **Limpio** |
| Texto libre (no es facturación) | Excepción: «No se pudo detectar el formato del CSV. Formatos soportados: …» | **Limpio** |
| Solo encabezado, 0 filas | 0 registros, informe a $0, sin excepción | **Revisar** |
| Coste no numérico (`N/A`) | Fila descartada en silencio (1 de 2, Σ$100) | **Parcial** |
| Importe con símbolo de moneda (`"$1,234.56"`) | **0 filas, Σ$0**: `parseFloat` da NaN → 0 → `cost <= 0` → descarte silencioso | **SUCIO** |
| **Encabezados FOCUS con espacios** (`Billed Cost`, `Charge Period Start`) | Detección dice `focus`, **0 de 14 filas parseadas**, informe a $0, sin excepción | **SUCIO** — ver D-9 |

Sobre el formato europeo, que era la preocupación explícita: **el defecto es real y peor de lo previsto**. Con `;` como separador, Papa detecta bien las columnas, y `parseFloat("1.234,56")` devuelve `1.234`. No es un factor 1 000 exacto porque además se pierden los decimales: `$3 734.56` reales se convierten en `$3.73`. El caso más peligroso es el segundo, donde el fichero está bien formado (importes entre comillas) y aun así el gasto se divide por mil. Los cuatro parsers usan `parseFloat` crudo, así que afecta a FOCUS, AWS, Azure y GCP por igual — y Azure Cost Management exporta con coma decimal en varias configuraciones regionales.

---

## 6. Defectos encontrados

Gravedad: **crítica** = el número que se muestra al usuario es falso; **alta** = pérdida silenciosa de datos o incumplimiento de un contrato declarado; **media** = incoherencia visible; **baja** = cosmético.

**D-1 · Importes en formato europeo se leen mil veces más pequeños — CRÍTICA**
Reproducir: `npx tsx test-data/audit/audit-parsers.mjs`, casos «CSV europeo» y «coma decimal».
Esperado: $3 734.56 y $1 234.56, o un error explícito.
Ocurrió: $3.73 y $1.23. Ningún aviso; el informe se genera con normalidad.
Causa: `parseFloat` crudo sobre el campo de coste en los cuatro parsers (`focus-parser.ts:216`, `aws-parser.ts:104`, `azure-parser.ts:110`, `gcp-parser.ts:118`).

**D-2 · Fechas sin validar: la cadena es la clave de día — CRÍTICA**
Reproducir: mismo script, sección de fechas.
Esperado: fecha normalizada a `YYYY-MM-DD` o rechazo del fichero.
Ocurrió: `01/02/2026`, `02-01-2026`, `1769904000` y `""` se aceptan como días distintos. El mismo día en dos formatos cuenta como 2 días y la proyección mensual se divide por 2 ($6 000 → $3 000). Como *todas* las reglas proyectan con `(total / díasDistintos) × 30`, el error se propaga a cada hallazgo.

**D-3 · El promedio diario se calcula sobre el número de registros, no de días — CRÍTICA**
Reproducir: `npx tsx test-data/audit/audit-figures.mjs`, sección «¿El umbral de 7 se cuenta en días o en registros?».
Esperado: con 4 días y 2 filas por día, el hallazgo no debería emitirse (umbral de 7 días) y el mensual debería ser $9 000.
Ocurrió: el hallazgo se emite y declara **$4 500/mes**, la mitad. `utilizationReviewRule` usa `recs.length < 7` y `avgDailyCost = totalCost / recs.length` (`idle-resources.ts:47-52`); `aiGpuReviewRule` tiene el mismo `recs.length < 7` (`ai-spend.ts`). Cualquier export con más de una línea por día y recurso (lo normal en un CUR real) cae aquí.

**D-4 · El umbral de 7 días solo aplica a 1 de 10 reglas — ALTA**
Reproducir: `npx tsx test-data/audit/audit-probes.mjs`, sonda F.
Esperado: coherencia con lo que `file-check.ts` promete («hallazgos agregados: al menos 7 días de datos diarios distintos»).
Ocurrió: con 6 días se emiten 9 hallazgos; con **1 día** se emiten 3 y se promete **$48 000/mes** extrapolando ×30. Ninguna regla salvo `utilization-review` mira el número de días para decidir si emite.

**D-5 · Los créditos se descartan en silencio — ALTA**
Reproducir: `audit-figures.mjs`, sección «Impuestos y créditos», fixture `focus-tax-credits.csv`.
Esperado: o se restan del gasto, o se excluyen dejándolo dicho en el informe como se hace con Tax.
Ocurrió: las 14 filas `ChargeCategory=Credit` con −$30/día desaparecen por el filtro `cost <= 0` (`focus-parser.ts:231`). El informe declara $4 536/mes frente a $4 086/mes netos: **+11 %**. La especificación FOCUS advierte de que los cinco valores de `ChargeCategory` admiten importes negativos, y la propia base de conocimiento (`focus-chargecategory-chargeclass`) lo dice.

**D-6 · Cuatro errores de orden en la clasificación de categorías — ALTA**
Reproducir: `audit-probes.mjs`, sondas A a D.
| Caso | Esperado | Ocurrió | Efecto |
|---|---|---|---|
| FOCUS, `SkuId`/`ChargeDescription` = `USE1-PublicIPv4:IdleAddress` | ip-address | network-egress | `IDLE-EIP-001` nunca se dispara; el cargo se cuenta como egress |
| AWS CUR, `USE1-InstanceUsage:db.m5.large` (RDS) | database | compute | $900/mes de RDS pasan a compute y generan un falso `utilization-review` de EC2 |
| AWS CUR, `NodeUsage:cache.m5.large` (ElastiCache) | database | other | queda fuera de `missing-commitment` |
| GCP, `Storage PD Snapshot` | snapshot | block-storage | `STORAGE-SNAP-001` nunca se dispara en GCP; infla el hallazgo de discos |
| Azure, `MeterCategory=Networking` + `SubCategory=NAT Gateway` / `Public IP` | nat / ip-address | network-egress | `NAT-GW-001` e `IDLE-EIP-001` no se disparan |
En los cuatro casos la causa es la misma: la comprobación general (`instanceusage`, `storage pd`, `networking`) se evalúa **antes** que la específica (`rds`, `snapshot`, `nat`, `public ip`).

**D-7 · Dos URLs 404 y una 302 a la portada en pilares que se muestran al usuario — ALTA**
Reproducir: `npx tsx test-data/audit/audit-kb.mjs`.
Esperado: 200 en todas.
Ocurrió: `cloud.google.com/architecture/framework/cost-optimization/optimize-resources` → **404** (citada en `oversized-instances.ts` y `storage-waste.ts`); `learn.microsoft.com/.../optimize-unassociated-resources` → **404** (`storage-waste.ts`); `cost_decomissioning.html` → **302 a la portada del pilar** (`wa-cost06-bp01` y `storage-waste.ts`). Ambos 404 confirmados por segunda vía. Tres URLs más redirigen de `cloud.google.com` a `docs.cloud.google.com`, y una de ellas acaba en portugués (`?hl=pt`).

**D-8 · El markdown renderiza el slug crudo de confianza — ALTA**
Reproducir: `npx tsx test-data/audit/audit-markdown.mjs`, comprobación 6, o `grep "Fuera-de-alcance" test-data/audit/markdown/*.md`.
Esperado: `CONFIDENCE_LABELS`, que `types.ts` declara obligatorio («el raw slug NUNCA debe renderizarse»).
Ocurrió: `⬜ Fuera-de-alcance-del-billing` en la tabla de todos los informes, por `cap(f.confidence)` en `build-report.ts:80`. El PDF sí usa las etiquetas legibles, así que markdown y PDF discrepan.

**D-9 · Un FOCUS con encabezados espaciados produce un informe de $0 sin error — ALTA**
Reproducir: `npx tsx test-data/audit/audit-empty-report.mjs`.
Esperado: o se parsean las 14 filas, o se rechaza el fichero.
Ocurrió: `detectFormat` dice `focus` (normaliza los encabezados quitando lo que no es letra), `parseFOCUSCSV` solo hace `trim().toLowerCase()` y por tanto `"billed cost" !== "billedcost"`: **0 de 14 filas**, informe completo a $0.00 con «Periodo: N/A — N/A». Solo el panel de diagnóstico lo insinúa («14 filas no reconocidas»).

**D-10 · Dos hallazgos con dinero real llevan multiplicadores codificados en vez de supuestos — MEDIA**
Reproducir: `npx tsx test-data/audit/audit-simulator.mjs`.
Esperado: que todo rango derive de `FindingAssumption`, como promete el docblock de `deriveSavingsRange` y la entrada `app-what-if`.
Ocurrió: `IDLE-IP-aws-*` publica $7.20/$14.40/$25.20 y `IDLE-IP-gcp-*` $57.60/$72/$72 con `assumptions: []`. Los factores 0.2/0.4/0.7 y 0.8/1.0/1.0 están escritos dentro de la regla; el simulador no aparece y el usuario no puede ajustar ni invertir la cifra.

**D-11 · Etiquetas y agregados incoherentes en el informe imprimible — MEDIA**
`printable-report.tsx` rotula la tarjeta «Ahorro potencial (**escenario medio**)» pero muestra el rango conservador–optimista. Y «Porcentaje del gasto recuperable» usa `savingsPercentage`, derivado de `totalEstimatedSavingsUSD` (todos los hallazgos), mientras el rango de al lado usa `totalSavingsRange` (solo estimables): dos bases distintas contiguas.

**D-12 · Pilar equivocado en el hallazgo de compromisos — MEDIA**
`COMMIT-AWS` cita «COST06-BP01 — Decommission unused resources». `missingCommitmentsRule` reutiliza el `getPillar` de `storage-waste.ts`; los modelos de precio son COST07.

**D-13 · Contradicciones cuantitativas en la base de conocimiento — MEDIA**
Ver sección 4: CUD de GCP 57 % frente a 55 % (la entrada sin fuente contra la verificada), SUD «hasta 30 %» frente a «60 %» dentro de la misma entrada, y tres versiones distintas de qué FOCUS soporta la app.

**D-14 · `summaryByService` y `finding.service` no llegan al markdown — MEDIA**
El motor los calcula, el Excel los usa, el markdown no: en `aws-cur-14dias.md` ningún nombre de servicio del informe aparece ni una vez.

**D-15 · La suma de quick wins se calcula en la plantilla — BAJA**
`buildReport` hace su propio `reduce` sobre `findings`; no existe como campo de `AuditReport`.

**D-16 · Importes fuera de `formatUSD` en el markdown — BAJA**
`$18000`, `$1200`, `$900`, `$18000.00`, procedentes de `Math.round(monthlyCost)` y `toFixed(2)` en `idle-resources.ts`.

**D-17 · 42 emojis por informe en el markdown — BAJA**
12 distintos en cabeceras, tabla de confianza y avisos.

**D-18 · Texto duplicado en el markdown — BAJA**
El aviso de irreversibilidad ×3–4 literal, la línea de pilar ×4, el bloque `START=$(date …)` ×3–4.

**D-19 · Ficheros sin filas útiles no producen ningún aviso en el informe — BAJA**
Solo encabezado, o todas las filas descartadas: markdown completo a $0.00 sin señal.

---

## 7. Lo que no pude comprobar

- **Exportación real a Excel y PDF.** `downloadExcel` es una función no exportada dentro de un componente `"use client"` y acaba en `XLSX.writeFile`, y el PDF es `window.print()`. Ninguna es invocable desde Node sin modificar código de la aplicación, que estaba fuera de mi alcance. Revisé la lógica por lectura: 4 hojas, valores numéricos y `CONFIDENCE_LABELS`. **No verifiqué el fichero .xlsx resultante ni la paginación del PDF.**
- **Cuál de los dos techos de CUD de GCP es el correcto.** Busqué la documentación oficial y no obtuve una cifra concluyente para «resource-based, todos los recursos». Reporto la contradicción, no cuál lado es cierto.
- **La exactitud de las tarifas citadas** (0.005 USD/hora de IPv4, 0.045 USD/GB de NAT, los deltas de familia t2→t3, m3→m6i…). Comprobé que son **internamente coherentes** entre reglas y base de conocimiento; no las contrasté contra el Price List de AWS en vivo.
- **Umbral de tendencias con datos reales de proveedor.** Lo verifiqué con series sintéticas. Con 14 días planos no se emite ninguna tendencia, que es correcto por diseño (`diffPct >= 5`), pero significa que el umbral de 14 solo se nota si además hay señal.
- **Cobertura de las reglas de IA en Azure y GCP.** Mis fixtures nativos de Azure y GCP no incluyen SKUs de GPU ni de endpoints administrados, así que `AI-GPU-001` y `AI-SM-001` solo se ejercitaron por la vía AWS/FOCUS.
- **El comportamiento del agente LLM** (`src/engine/agent.ts`, `src/engine/tools/generate-remediation.ts` más allá de lo que consume `buildReport`) y los conectores (`aws-connector.ts`, `focus-s3-connector.ts`): requieren credenciales o red hacia AWS.
- **Ficheros `.xlsx` y `.parquet` de entrada**, que la UI acepta (`upload-section.tsx`, dependencias `xlsx` y `hyparquet`). Solo audité la ruta CSV.
- **El flujo HTTP**, por indicación explícita: no toqué el puerto 3000 ni ejecuté `npm run build`. `npx tsc --noEmit` termina con exit 0.
