# Fixtures E2E de facturación

Generados por `node test-data/e2e/generate-e2e-fixtures.js` (determinístico, se puede regenerar).
Periodo: **21 días consecutivos, 2026-06-01 → 2026-06-21** (habilita hallazgos agregados ≥7 días
y tendencias ≥14 días). Cada línea lleva variación diaria ±6% (senoidal determinística) y un
**pico del 60% el 2026-06-15** para que la sección de tendencias tenga algo que detectar.

Scripts de prueba (solo HTTP contra el dev server, no modifican la app):

| script | qué hace |
|---|---|
| `generate-e2e-fixtures.js` | crea todos los CSV/XLSX de esta carpeta |
| `run-matrix.js` | 10 archivos × 4 carriles = 40 POST a `/api/analyze`; deja los informes en `out/` |
| `run-flow.js` | `/api/demo-csv` ida y vuelta, rutas JSON, `/api/agent`, casos adversos |
| `check-numbers.js` | coherencia de rangos y totales sobre los informes de `out/` |

## Totales reales de cada archivo (medidos, no estimados)

| archivo | filas | días | coste del periodo | proyección mensual esperada (÷días ×30) |
|---|---|---|---|---|
| `focus-aws-only.csv` | 273 | 21 | 2 920,89 USD (EffectiveCost) | 4 172,70 |
| `focus-azure-only.csv` | 231 | 21 | 2 086,84 | 2 981,20 |
| `focus-gcp-only.csv` | 252 | 21 | 2 179,18 | 3 113,11 |
| `focus-multicloud.csv` | 567 | 21 | 5 339,58 | 7 627,97 |
| `focus-con-compras-compromiso.csv` | 276 | 21 | 2 403,88 uso + 17 200,00 en compras | 3 434,11 (las compras NO deben sumarse) |
| `aws-cur-nativo.csv` | 273 | 21 | 2 920,89 (UnblendedCost) | 4 172,70 |
| `azure-cost-management-nativo.csv` | 231 | 21 | 2 086,84 (CostInBillingCurrency) | 2 981,20 |
| `gcp-billing-nativo.csv` | 252 | 21 | 2 179,18 (cost) | 3 113,11 |
| `focus-aws-only.xlsx` | 273 | 21 | igual que el CSV AWS | 4 172,70 |
| `basura-no-facturacion.csv` | 40 | – | no es facturación | debe rechazarse |

Los tres ficheros nativos contienen exactamente el mismo dinero que su equivalente FOCUS,
para poder comparar hallazgos entre formatos con la misma factura.

## Desperdicio deliberado inyectado

Coste diario base por línea; el mensual es ≈ diario × 30.

### AWS (`focus-aws-only.csv`, `focus-aws-only.xlsx`, `aws-cur-nativo.csv`)

| desperdicio | línea | USD/día | USD/mes aprox. |
|---|---|---|---|
| Disco de bloque sin adjuntar | `vol-0aa11bb22cc33dd44` gp3 500 GiB, descripción "unattached volume" | 4,00 | 120 |
| Snapshots de más de 90 días | `snap-0cc99dd88ee77ff66`, 1 240 GiB-h | 3,10 | 93 |
| IP pública ociosa (`PublicIPv4:IdleAddress`) | 5 direcciones, 120 h/día | 0,60 | 18 |
| NAT Gateway con mucho tráfico | 120 GB/día procesados | 5,40 | 162 |
| Object storage sin tiering | S3 Standard 12 000 GiB-h, "no lifecycle rule configured" | 9,20 | 276 |
| Cómputo estable sin compromisos | m5.xlarge 32,26 + t2.xlarge 13,36 + g5.2xlarge 29,09 + RDS 18,72 | 93,43 | 2 803 |
| Familia con equivalente más barato | `BoxUsage:t2.xlarge` | 13,36 | 401 |
| Gasto de IA | Bedrock Claude 7,40 + endpoint SageMaker 6,53 | 13,93 | 418 |
| GPU siempre encendida | `BoxUsage:g5.2xlarge` 24 h/día | 29,09 | 873 |
| Egress a internet | CloudFront 35 GB/día | 3,15 | 95 |
| Disco adjunto y sano (control) | `vol-0ee55ff66aa77bb88` | 2,40 | 72 |

### Azure (`focus-azure-only.csv`, `azure-cost-management-nativo.csv`)

| desperdicio | línea | USD/día | USD/mes aprox. |
|---|---|---|---|
| Disco Premium SSD sin adjuntar | `disk-orphan-01` P20 | 3,70 | 111 |
| Snapshots antiguos | `snap-2025-legacy` 900 GB | 2,60 | 78 |
| IP pública Standard sin asociar | `pip-legacy-01`, 96 h/día | 0,48 | 14 |
| NAT Gateway | 110 GB/día procesados | 4,85 | 146 |
| Blob Hot sin política de ciclo de vida | 11 000 GB | 7,60 | 228 |
| Cómputo estable sin reservas | D8s_v5 27,65 + NC24ads_A100 22,40 + SQL 16,10 | 66,15 | 1 985 |
| Gasto de IA | Azure OpenAI gpt-4o 6,90 | 6,90 | 207 |
| GPU siempre encendida | `Standard_NC24ads_A100_v4` | 22,40 | 672 |

### GCP (`focus-gcp-only.csv` sin `ServiceCategory`, `gcp-billing-nativo.csv`)

| desperdicio | línea | USD/día | USD/mes aprox. |
|---|---|---|---|
| Persistent Disk sin adjuntar | `pd-orphan-01`, "Storage PD Capacity - unattached disk" | 3,40 | 102 |
| Snapshots >90 días | `snap-legacy-2025` | 2,40 | 72 |
| IP estática reservada sin usar | `ip-legacy-01`, "Static Ip Charge - unused external IP address" | 0,72 | 22 |
| Cloud NAT | 105 GiB/día | 4,65 | 140 |
| Cloud Storage sin Autoclass | 10 500 GiB | 8,10 | 243 |
| Cómputo estable sin CUD | N2 core 24,80 + N2 RAM 9,90 + A2 GPU 21,60 + Cloud SQL 14,30 | 70,60 | 2 118 |
| Gasto de IA | Vertex AI Gemini 6,20 | 6,20 | 186 |

`focus-gcp-only.csv` es el caso crítico: imita el export real de Google, **sin las columnas
`ServiceCategory` ni `ServiceSubcategory`**. La clasificación tiene que salir de
`ServiceName` + `ChargeDescription`.

### `focus-con-compras-compromiso.csv`

- 3 filas `ChargeCategory=Purchase` con `BilledCost` 8 400 / 3 600 / 5 200 (**17 200 en total**)
  y `EffectiveCost = 0`: compras de Compute Savings Plan.
- 63 filas de uso cubierto por ese compromiso (`BilledCost = 0`, `EffectiveCost > 0`,
  `CommitmentDiscountId` presente) — el 68% del precio On-Demand.
- 210 filas de uso no cubierto, `BilledCost = EffectiveCost`.
- Coste correcto del periodo: **2 403,88** (solo `EffectiveCost`). Si se sumaran las compras
  junto al uso que cubren, saldría 19 603,88 en el periodo / 26 437,99 mensuales: eso sería
  el doble conteo que el archivo busca detectar.

## Casos adversos

`adverso-vacio.csv` (0 bytes) · `adverso-solo-cabecera.csv` (cabecera FOCUS, 0 filas) ·
`adverso-coste-negativo.csv` (12 filas, una con −128,44 y `ChargeCategory=Credit`) ·
`adverso-fechas-desordenadas.csv` (105 filas en orden aleatorio) ·
`adverso-un-solo-dia.csv` (13 filas, un único día, 135,94 USD).
