# 📊 Reporte Ejecutivo FinOps — Auditoría Multi-Nube

**Generado:** 25 de julio de 2026
**Periodo:** 31 de mayo de 2026 — 13 de junio de 2026
**Proveedores:** AZURE
**Costo mensual proyectado:** $3,240.00
**Ahorro identificado (rango):** $208.80–$1,348.98/mes
**Adicional sujeto a revisión de métricas:** hasta $405.00/mes (hallazgos fuera del alcance del billing, sin evidencia de utilización)
**Hallazgos:** 4

> **Aviso:** Estas son recomendaciones informativas basadas en tu facturación. Valida cada acción en tu entorno antes de aplicarla.

## 🎯 Resumen Ejecutivo

Se identificaron **4 oportunidades** con ahorro potencial de **$208.80–$1,348.98/mes** (estimación moderada: $614.10/mes, 19% del gasto).

**Quick Wins** (esfuerzo bajo + riesgo bajo + ahorro ≥$50.00/mes): 2 hallazgos, ~$192.00/mes.

## 📋 Hallazgos Priorizados

| # | Proveedor | Hallazgo | Ahorro (rango) | Esfuerzo | Riesgo | Confianza |
|---|-----------|----------|---------------|----------|--------|-----------|
| 1 | AZURE | Contratar descuentos por uso constante (Azure Reservations) | $160.80–$904.50 | Bajo | Medio | 🔶 Inferencia |
| 2 | AZURE | Revisar uso real de instancias D4s v3 | $0.00–$405.00 | Bajo | Bajo | ⬜ Fuera-de-alcance-del-billing |
| 3 | AZURE | Discos pagados que podrían no estar en uso | $27.00–$216.00 | Bajo | Bajo | 🔶 Inferencia |
| 4 | AZURE | Mover datos poco usados a una clase de almacenamiento más barata | $21.00–$228.48 | Bajo | Bajo | 🔶 Inferencia |

## 📂 Por Categoría

| Categoría | Ahorro Est. | Hallazgos |
|-----------|-------------|-----------|
| Sin descuentos por compromiso (Savings Plans / Reservas) | $422.10/mes | 1 |
| Discos pagados posiblemente sin uso | $108.00/mes | 1 |
| Datos en almacenamiento más caro de lo necesario | $84.00/mes | 1 |
| Revisar uso real (la factura no basta) | $0.00/mes | 1 |

## 🔍 Detalle

### 🔶 [AZURE] Contratar descuentos por uso constante (Azure Reservations)

**Pilar:** Azure Well-Architected — Cost Optimization — CO:07 ([ref](https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/optimize-unassociated-resources))
**Ahorro:** $160.80–$904.50/mes | **Esfuerzo:** Bajo | **Riesgo:** Medio

Gasto compute/DB On-Demand de ~$2,010.00/mes sin compromisos. Azure publica hasta 72% de descuento con Reservations y hasta 65% con el Savings Plan for Compute. Rango de ahorro estimado: $160.80–$904.50/mes.

> Gasto mensual On-Demand: $2,010.00. Supuestos: 70% elegible (40%–90%) × 30% descuento (20%–50%). Rango: $160.80–$904.50/mes.

**Supuestos:**
- % del gasto estable que puedes comprometer con descuento: 70% (rango: 40%–90%) — Estimación editorial ajustable — el % de gasto elegible depende de la estabilidad de tu uso. No hay benchmark público verificado. Ajusta según tu entorno.
- % de descuento esperado (compromiso 1 año, sin pago adelantado): 30% (rango: 20%–50%) — Azure publica hasta 72% de descuento con Reservations y hasta 65% con el Savings Plan for Compute. Fuente verificada el 2026-07-24: https://learn.microsoft.com/en-us/azure/cost-management-billing/reservations/save-compute-costs-reservations. Ningún proveedor publica un suelo de descuento, así que el % concreto para tu plazo y forma de pago es un supuesto ajustable: usa las recomendaciones nativas de tu proveedor.

**Investigación (solo lectura):**

```bash
# Ver recomendaciones de reservas [azure]
az consumption reservation recommendation list \
  --scope shared --look-back-period Last60Days
```

**Rollback:** Los compromisos NO son cancelables. Elegir No Upfront/PAYG minimiza riesgo.

<details><summary>Remediación (expandir)</summary>

> ⚠️ **Acción irreversible — posible pérdida de datos o servicio. Respalda y valida antes de ejecutar.**

```bash
# Comprar reserva (portal) [azure]
Ir a: Azure Portal > Reservations > Add
Evaluar reserva de 1 año para VMs estables.
```

</details>

---

### ⬜ [AZURE] Revisar uso real de instancias D4s v3

**Pilar:** Azure Well-Architected — Cost Optimization ([ref](https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/))
**Ahorro:** $0.00–$405.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Cómputo con gasto de ~$1350/mes. El billing solo muestra horas encendidas, no carga real. Requiere revisión de métricas de utilización para determinar si está correctamente dimensionado.

> Costo mensual: $1350.00/mes. No se puede estimar ahorro sin métricas de utilización reales. El billing muestra horas encendidas, no carga de CPU/memoria.

**Investigación (solo lectura):**

```bash
# Verificar CPU promedio (Azure Monitor) [azure]
# Inicio 7 días atrás (macOS / Linux):
START=$(date -v-7d +%Y-%m-%dT%H:%M:%SZ)              # macOS
# START=$(date -d "7 days ago" +%Y-%m-%dT%H:%M:%SZ)  # Linux (GNU)
az monitor metrics list \
  --resource <RESOURCE_ID> \
  --metric "Percentage CPU" \
  --interval PT1H --aggregation Average \
  --start-time $START \
  --end-time $(date +%Y-%m-%dT%H:%M:%SZ)
```

**Rollback:** N/A — solo comandos de investigación.

---

### 🔶 [AZURE] Discos pagados que podrían no estar en uso

**Pilar:** Azure Well-Architected — Cost Optimization — CO:07 ([ref](https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/optimize-unassociated-resources))
**Ahorro:** $27.00–$216.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Gasto total en almacenamiento de bloque: ~$540.00/mes. Rango estimado de ahorro: $27.00–$216.00/mes.

> Costo mensual total: $540.00. Supuesto: 20% no adjuntos (rango: 5%–40%). Ahorro moderado: $540.00 × 0.2 = $108.00/mes.

**Supuestos:**
- % de discos pagados que nadie usa (volúmenes sin adjuntar): 20% (rango: 5%–40%) — Estimación editorial ajustable — no hay benchmark público verificado del % de volúmenes sin adjuntar. Ajusta este valor según tu entorno.

**Investigación (solo lectura):**

```bash
# Listar discos no adjuntos [azure]
az disk list --query "[?managedBy==null].{Name:name, Size:diskSizeGb, RG:resourceGroup, SKU:sku.name}" -o table
```

**Rollback:** Restaurar desde snapshot/backup previo a la eliminación.

<details><summary>Remediación (expandir)</summary>

**Paso obligatorio de respaldo:** Crear snapshot del volumen antes de eliminarlo.

```bash
# Crear snapshot de respaldo [azure]
az snapshot create --name <SNAP_NAME> --resource-group <RG> --source <DISK_ID>
```

> ⚠️ **Acción irreversible — posible pérdida de datos o servicio. Respalda y valida antes de ejecutar.**

```bash
# Eliminar disco [azure]
az disk delete --name <DISK_NAME> --resource-group <RG> --yes
```

</details>

---

### 🔶 [AZURE] Mover datos poco usados a una clase de almacenamiento más barata

**Pilar:** Azure Well-Architected — Cost Optimization — CO:07 ([ref](https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/optimize-unassociated-resources))
**Ahorro:** $21.00–$228.48/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Gasto en almacenamiento de objetos: ~$420.00/mes. En Azure los tiers hot, cool, cold y archive NO mueven los datos por sí solos: necesitas reglas de ciclo de vida (lifecycle management) que definan las transiciones, o activar Smart tier si quieres el movimiento automático. Archive además es offline: rehidratar puede tardar horas y tiene penalización por borrado temprano.

> Costo mensual: $420.00. Supuestos: 50% datos infrecuentes (20%–80%) × 40% ahorro (25%–68%). Rango: $21.00–$228.48/mes.

**Supuestos:**
- % de datos que casi nunca se leen (acceso infrecuente): 50% (rango: 20%–80%) — Estimación editorial ajustable — el % de datos con acceso infrecuente depende de tu patrón real. Mídelo con la herramienta de tu proveedor: S3 Storage Lens en AWS, las métricas de Azure Monitor sobre la cuenta de almacenamiento en Azure, o Cloud Monitoring y el Storage Insights de Cloud Storage en GCP. No hay benchmark público verificado.
- % de ahorro al mover esos datos a almacenamiento más barato (tiering): 40% (rango: 25%–68%) — S3 Intelligent-Tiering tiene tiers Infrequent/Archive reales y transiciones automáticas a 30 y 90 días (verificado: https://docs.aws.amazon.com/AmazonS3/latest/userguide/intelligent-tiering-overview.html). El % de ahorro depende de tu patrón de acceso — estimación editorial ajustable.

**Investigación (solo lectura):**

```bash
# Ver la política de ciclo de vida actual (Azure no mueve tiers sin ella) [azure]
az storage account management-policy show \
  --account-name <ACCOUNT> --resource-group <RG>
```

**Rollback:** Elimina la regla de lifecycle o cambia el tier del blob a mano. Cuidado: volver desde archive requiere rehidratación (horas) y los cambios de tier pueden incurrir en penalización por borrado temprano.

<details><summary>Remediación (expandir)</summary>

```bash
# Crear reglas de ciclo de vida (hot → cool → cold) [azure]
# Azure NO mueve los datos automáticamente entre tiers: define las transiciones
# en lifecycle-policy.json (tierToCool / tierToCold / tierToArchive con daysAfterModificationGreaterThan).
az storage account management-policy create \
  --account-name <ACCOUNT> --resource-group <RG> \
  --policy @lifecycle-policy.json
```

```bash
# Alternativa automática: activar Smart tier [azure]
Portal de Azure → Storage account → Configuration → Smart tier.
Es el equivalente automático a S3 Intelligent-Tiering / Autoclass:
sin Smart tier ni reglas de ciclo de vida, los blobs se quedan en el tier en el que están.
```

</details>

---


## 📐 Metodología

Las cifras las calcula el motor de reglas determinístico; la IA no inventa números. Score de prioridad: ahorro (0-100, escalado a $1000) × multiplicador esfuerzo × multiplicador riesgo. Los ahorros se presentan como rangos basados en supuestos ajustables.

---

*Recomendaciones informativas. Valida en tu entorno antes de actuar.*