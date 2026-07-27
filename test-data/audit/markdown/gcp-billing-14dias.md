# 📊 Reporte Ejecutivo FinOps — Auditoría Multi-Nube

**Generado:** 25 de julio de 2026
**Periodo:** 31 de mayo de 2026 — 13 de junio de 2026
**Proveedores:** GCP
**Costo mensual proyectado:** $3,402.00
**Ahorro identificado (rango):** $314.70–$1,655.16/mes
**Adicional sujeto a revisión de métricas:** hasta $342.00/mes (hallazgos fuera del alcance del billing, sin evidencia de utilización)
**Hallazgos:** 6

> **Aviso:** Estas son recomendaciones informativas basadas en tu facturación. Valida cada acción en tu entorno antes de aplicarla.

## 🎯 Resumen Ejecutivo

Se identificaron **6 oportunidades** con ahorro potencial de **$314.70–$1,655.16/mes** (estimación moderada: $823.20/mes, 24.2% del gasto).

**Quick Wins** (esfuerzo bajo + riesgo bajo + ahorro ≥$50.00/mes): 3 hallazgos, ~$288.00/mes.

## 📋 Hallazgos Priorizados

| # | Proveedor | Hallazgo | Ahorro (rango) | Esfuerzo | Riesgo | Confianza |
|---|-----------|----------|---------------|----------|--------|-----------|
| 1 | GCP | Contratar descuentos por uso constante (Committed Use Discounts (CUDs)) | $153.60–$864.00 | Bajo | Medio | 🔶 Inferencia |
| 2 | GCP | Discos pagados que podrían no estar en uso | $34.50–$276.00 | Bajo | Bajo | 🔶 Inferencia |
| 3 | GCP | Revisar uso real de instancias N2 Instance Core running in Americas | $0.00–$342.00 | Bajo | Bajo | ⬜ Fuera-de-alcance-del-billing |
| 4 | GCP | Reducir el costo de salida a internet (NAT Gateway) | $49.50–$231.00 | Medio | Bajo | 🔶 Inferencia |
| 5 | GCP | Mover datos poco usados a una clase de almacenamiento más barata | $19.50–$212.16 | Bajo | Bajo | 🔶 Inferencia |
| 6 | GCP | ~10 IPs estáticas reservadas sin usar en us-central1 | $57.60–$72.00 | Bajo | Bajo | ✅ Confirmado |

## 📂 Por Categoría

| Categoría | Ahorro Est. | Hallazgos |
|-----------|-------------|-----------|
| Sin descuentos por compromiso (Savings Plans / Reservas) | $403.20/mes | 1 |
| Discos pagados posiblemente sin uso | $138.00/mes | 1 |
| Salida a internet cara (NAT Gateway) | $132.00/mes | 1 |
| Datos en almacenamiento más caro de lo necesario | $78.00/mes | 1 |
| Direcciones IP pagadas sin usar | $72.00/mes | 1 |
| Revisar uso real (la factura no basta) | $0.00/mes | 1 |

## 🔍 Detalle

### 🔶 [GCP] Contratar descuentos por uso constante (Committed Use Discounts (CUDs))

**Pilar:** Google Cloud Architecture Framework — Cost Optimization ([ref](https://cloud.google.com/architecture/framework/cost-optimization/optimize-resources))
**Ahorro:** $153.60–$864.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Medio

Gasto compute/DB On-Demand de ~$1,920.00/mes sin compromisos. Google Cloud publica hasta 55% con CUD basados en recurso (hasta 70% en máquinas optimizadas para memoria) y 28% a un año o 46% a tres años con los CUD flexibles de Compute. Rango de ahorro estimado: $153.60–$864.00/mes.

> Gasto mensual On-Demand: $1,920.00. Supuestos: 70% elegible (40%–90%) × 30% descuento (20%–50%). Rango: $153.60–$864.00/mes.

**Supuestos:**
- % del gasto estable que puedes comprometer con descuento: 70% (rango: 40%–90%) — Estimación editorial ajustable — el % de gasto elegible depende de la estabilidad de tu uso. No hay benchmark público verificado. Ajusta según tu entorno.
- % de descuento esperado (compromiso 1 año, sin pago adelantado): 30% (rango: 20%–50%) — Google Cloud publica hasta 55% con CUD basados en recurso (hasta 70% en máquinas optimizadas para memoria) y 28% a un año o 46% a tres años con los CUD flexibles de Compute. Fuente verificada el 2026-07-24: https://cloud.google.com/compute/docs/instances/committed-use-discounts-overview. Ningún proveedor publica un suelo de descuento, así que el % concreto para tu plazo y forma de pago es un supuesto ajustable: usa las recomendaciones nativas de tu proveedor.

**Investigación (solo lectura):**

```bash
# Ver recomendaciones de CUDs [gcp]
gcloud billing budgets list
gcloud compute commitments list --project=<PROJECT_ID>
```

**Rollback:** Los compromisos NO son cancelables. Elegir No Upfront/PAYG minimiza riesgo.

<details><summary>Remediación (expandir)</summary>

> ⚠️ **Acción irreversible — posible pérdida de datos o servicio. Respalda y valida antes de ejecutar.**

```bash
# Comprar CUD (consola) [gcp]
Ir a: Cloud Console > Compute Engine > Committed Use Discounts
Evaluar CUD de 1 año para recursos estables.
```

</details>

---

### 🔶 [GCP] Discos pagados que podrían no estar en uso

**Pilar:** Google Cloud Architecture Framework — Cost Optimization ([ref](https://cloud.google.com/architecture/framework/cost-optimization/optimize-resources))
**Ahorro:** $34.50–$276.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Gasto total en almacenamiento de bloque: ~$690.00/mes. Rango estimado de ahorro: $34.50–$276.00/mes.

> Costo mensual total: $690.00. Supuesto: 20% no adjuntos (rango: 5%–40%). Ahorro moderado: $690.00 × 0.2 = $138.00/mes.

**Supuestos:**
- % de discos pagados que nadie usa (volúmenes sin adjuntar): 20% (rango: 5%–40%) — Estimación editorial ajustable — no hay benchmark público verificado del % de volúmenes sin adjuntar. Ajusta este valor según tu entorno.

**Investigación (solo lectura):**

```bash
# Listar discos no adjuntos [gcp]
gcloud compute disks list --filter="NOT users:*" --format="table(name,sizeGb,type,zone)"
```

**Rollback:** Restaurar desde snapshot/backup previo a la eliminación.

<details><summary>Remediación (expandir)</summary>

**Paso obligatorio de respaldo:** Crear snapshot del volumen antes de eliminarlo.

```bash
# Crear snapshot de respaldo [gcp]
gcloud compute disks snapshot <DISK_NAME> --zone=<ZONE> --snapshot-names=<SNAP_NAME>
```

> ⚠️ **Acción irreversible — posible pérdida de datos o servicio. Respalda y valida antes de ejecutar.**

```bash
# Eliminar disco [gcp]
gcloud compute disks delete <DISK_NAME> --zone=<ZONE>
```

</details>

---

### ⬜ [GCP] Revisar uso real de instancias N2 Instance Core running in Americas

**Pilar:** Google Cloud Architecture Framework — Cost Optimization ([ref](https://cloud.google.com/architecture/framework/cost-optimization))
**Ahorro:** $0.00–$342.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Cómputo con gasto de ~$1140/mes. El billing solo muestra horas encendidas, no carga real. Requiere revisión de métricas de utilización para determinar si está correctamente dimensionado.

> Costo mensual: $1140.00/mes. No se puede estimar ahorro sin métricas de utilización reales. El billing muestra horas encendidas, no carga de CPU/memoria.

**Investigación (solo lectura):**

```bash
# Verificar utilización de CPU (Cloud Monitoring) [gcp]
gcloud monitoring metrics list \
  --filter='metric.type="compute.googleapis.com/instance/cpu/utilization"' \
  --format=json
```

**Rollback:** N/A — solo comandos de investigación.

---

### 🔶 [GCP] Reducir el costo de salida a internet (NAT Gateway)

**Pilar:** Google Cloud Architecture Framework — Cost Optimization — Right-sizing ([ref](https://cloud.google.com/architecture/framework/cost-optimization/optimize-resources))
**Ahorro:** $49.50–$231.00/mes | **Esfuerzo:** Medio | **Riesgo:** Bajo

Gasto en NAT: ~$330.00/mes (en AWS us-east-1 el NAT Gateway cuesta 0,045 USD/GB procesado más 0,045 USD/hora; varía por región). En AWS, los Gateway Endpoints de S3 y DynamoDB no tienen cargo adicional y sacan ese tráfico del NAT. Los Interface Endpoints (PrivateLink) sí cobran por hora y por datos procesados, igual que los equivalentes privados de Azure y GCP: compara antes de migrarlo todo.

> Costo NAT mensual: $330.00. Supuesto: 40% redirigible (rango: 15%–70%). Rango: $49.50–$231.00/mes.

**Supuestos:**
- % del tráfico que podría salir por conexiones privadas (VPC endpoints): 40% (rango: 15%–70%) — Estimación editorial ajustable — el % de tráfico redirigible a endpoints privados depende de tu mix; mídelo con VPC Flow Logs. No hay benchmark público verificado.

**Investigación (solo lectura):**

```bash
# Ver rutas de Cloud NAT [gcp]
gcloud compute routers nats list --router=<ROUTER_NAME> --region=us-central1
```

**Rollback:** Eliminar endpoint. El tráfico volverá a rutear por NAT Gateway.

<details><summary>Remediación (expandir)</summary>

```bash
# Habilitar Private Google Access en subnet [gcp]
gcloud compute networks subnets update <SUBNET_NAME> \
  --region=us-central1 \
  --enable-private-ip-google-access
```

</details>

---

### 🔶 [GCP] Mover datos poco usados a una clase de almacenamiento más barata

**Pilar:** Google Cloud Architecture Framework — Cost Optimization ([ref](https://cloud.google.com/architecture/framework/cost-optimization/optimize-resources))
**Ahorro:** $19.50–$212.16/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Gasto en almacenamiento de objetos: ~$390.00/mes. Google Cloud Autoclass mueve los objetos automáticamente y los devuelve a Standard al leerse; la clase terminal es Nearline (Archive es opcional) y los objetos de menos de 128 KiB no bajan de clase. Tiene cuota de gestión y un cargo por habilitarlo.

> Costo mensual: $390.00. Supuestos: 50% datos infrecuentes (20%–80%) × 40% ahorro (25%–68%). Rango: $19.50–$212.16/mes.

**Supuestos:**
- % de datos que casi nunca se leen (acceso infrecuente): 50% (rango: 20%–80%) — Estimación editorial ajustable — el % de datos con acceso infrecuente depende de tu patrón real. Mídelo con la herramienta de tu proveedor: S3 Storage Lens en AWS, las métricas de Azure Monitor sobre la cuenta de almacenamiento en Azure, o Cloud Monitoring y el Storage Insights de Cloud Storage en GCP. No hay benchmark público verificado.
- % de ahorro al mover esos datos a almacenamiento más barato (tiering): 40% (rango: 25%–68%) — S3 Intelligent-Tiering tiene tiers Infrequent/Archive reales y transiciones automáticas a 30 y 90 días (verificado: https://docs.aws.amazon.com/AmazonS3/latest/userguide/intelligent-tiering-overview.html). El % de ahorro depende de tu patrón de acceso — estimación editorial ajustable.

**Investigación (solo lectura):**

```bash
# Ver clase de almacenamiento actual [gcp]
gsutil ls -L gs://<BUCKET_NAME>/ | grep "Storage class"
```

**Rollback:** Desactiva Autoclass en el bucket. Los objetos permanecen en la clase en la que estén y siguen accesibles.

<details><summary>Remediación (expandir)</summary>

```bash
# Habilitar Autoclass (clase terminal Nearline; objetos <128 KiB no bajan de clase) [gcp]
gcloud storage buckets update gs://<BUCKET_NAME> --enable-autoclass
```

</details>

---

### ✅ [GCP] ~10 IPs estáticas reservadas sin usar en us-central1

**Pilar:** Google Cloud Architecture Framework — Cost Optimization ([ref](https://cloud.google.com/architecture/framework/cost-optimization))
**Ahorro:** $57.60–$72.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Google Cloud cobra una tarifa específica (0,01 USD/hora) por IP estática reservada sin usar, frente a 0,005 USD/hora cuando está en uso: el cargo identifica el estado ocioso. Detectadas ~10 IPs por $72.00/mes en us-central1.

> Tarifa de IP estática reservada sin usar: $0.01/hora = ~$7.30/mes (us-central1, 2026-07-24). Costo observado: $33.60 en 14 días → $72.00/mes. IPs estimadas: ~10. Como la tarifa distingue el estado ocioso, el ahorro estimado cubre del 80% al 100% del cargo.

**Investigación (solo lectura):**

```bash
# Listar IPs externas sin uso [gcp]
gcloud compute addresses list --filter="status=RESERVED" --format="table(name,address,region)"
```

**Rollback:** Asignar nueva IP (será una dirección diferente).

<details><summary>Remediación (expandir)</summary>

> ⚠️ **Acción irreversible — posible pérdida de datos o servicio. Respalda y valida antes de ejecutar.**

```bash
# Liberar IP estática [gcp]
gcloud compute addresses delete <ADDRESS_NAME> --region=<REGION>
```

</details>

---


## 📐 Metodología

Las cifras las calcula el motor de reglas determinístico; la IA no inventa números. Score de prioridad: ahorro (0-100, escalado a $1000) × multiplicador esfuerzo × multiplicador riesgo. Los ahorros se presentan como rangos basados en supuestos ajustables.

---

*Recomendaciones informativas. Valida en tu entorno antes de actuar.*