# 📊 Reporte Ejecutivo FinOps — Auditoría Multi-Nube

**Generado:** 25 de julio de 2026
**Periodo:** 31 de mayo de 2026 — 13 de junio de 2026
**Proveedores:** AWS
**Costo mensual proyectado:** $3,786.00
**Ahorro identificado (rango):** $389.70–$1,971.00/mes
**Adicional sujeto a revisión de métricas:** hasta $630.00/mes (hallazgos fuera del alcance del billing, sin evidencia de utilización)
**Hallazgos:** 9

> **Aviso:** Estas son recomendaciones informativas basadas en tu facturación. Valida cada acción en tu entorno antes de aplicarla.

## 🎯 Resumen Ejecutivo

Se identificaron **9 oportunidades** con ahorro potencial de **$389.70–$1,971.00/mes** (estimación moderada: $1,005.00/mes, 26.5% del gasto).

**Quick Wins** (esfuerzo bajo + riesgo bajo + ahorro ≥$50.00/mes): 2 hallazgos, ~$210.00/mes.

## 📋 Hallazgos Priorizados

| # | Proveedor | Hallazgo | Ahorro (rango) | Esfuerzo | Riesgo | Confianza |
|---|-----------|----------|---------------|----------|--------|-----------|
| 1 | AWS | Contratar descuentos por uso constante (Compute Savings Plans) | $168.00–$945.00 | Bajo | Medio | 🔶 Inferencia |
| 2 | AWS | Revisar uso real de instancias t2.xlarge | $0.00–$360.00 | Bajo | Bajo | ⬜ Fuera-de-alcance-del-billing |
| 3 | AWS | Discos pagados que podrían no estar en uso | $30.00–$240.00 | Bajo | Bajo | 🔶 Inferencia |
| 4 | AWS | Reducir el costo de salida a internet (NAT Gateway) | $54.00–$252.00 | Medio | Bajo | 🔶 Inferencia |
| 5 | AWS | Revisar uso real de instancias db.m5.large | $0.00–$270.00 | Bajo | Bajo | ⬜ Fuera-de-alcance-del-billing |
| 6 | AWS | Migrar a un equivalente actual más barato: t2.xlarge → t3.xlarge | $84.00–$144.00 | Medio | Bajo | ✅ Confirmado |
| 7 | AWS | Mover datos poco usados a una clase de almacenamiento más barata | $22.50–$244.80 | Bajo | Bajo | 🔶 Inferencia |
| 8 | AWS | Respaldos (snapshots) antiguos que podrías depurar | $24.00–$120.00 | Medio | Bajo | 🔶 Inferencia |
| 9 | AWS | ~10 IPv4 públicas facturadas en us-east-1 | $7.20–$25.20 | Bajo | Bajo | 🔶 Inferencia |

## 📂 Por Categoría

| Categoría | Ahorro Est. | Hallazgos |
|-----------|-------------|-----------|
| Sin descuentos por compromiso (Savings Plans / Reservas) | $441.00/mes | 1 |
| Salida a internet cara (NAT Gateway) | $144.00/mes | 1 |
| Instancias de generación vieja | $123.60/mes | 1 |
| Discos pagados posiblemente sin uso | $120.00/mes | 1 |
| Datos en almacenamiento más caro de lo necesario | $90.00/mes | 1 |
| Respaldos (snapshots) antiguos acumulados | $72.00/mes | 1 |
| Direcciones IP pagadas sin usar | $14.40/mes | 1 |
| Revisar uso real (la factura no basta) | $0.00/mes | 2 |

## 🔍 Detalle

### 🔶 [AWS] Contratar descuentos por uso constante (Compute Savings Plans)

**Pilar:** AWS Well-Architected — Cost Optimization — COST06-BP01 ([ref](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_decomissioning.html))
**Ahorro:** $168.00–$945.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Medio

Gasto compute/DB On-Demand de ~$2,100.00/mes sin compromisos. AWS publica hasta 66% de descuento con Compute Savings Plans y hasta 72% con EC2 Instance Savings Plans (ligados a familia y región). Rango de ahorro estimado: $168.00–$945.00/mes.

> Gasto mensual On-Demand: $2,100.00. Supuestos: 70% elegible (40%–90%) × 30% descuento (20%–50%). Rango: $168.00–$945.00/mes.

**Supuestos:**
- % del gasto estable que puedes comprometer con descuento: 70% (rango: 40%–90%) — Estimación editorial ajustable — el % de gasto elegible depende de la estabilidad de tu uso. No hay benchmark público verificado. Ajusta según tu entorno.
- % de descuento esperado (compromiso 1 año, sin pago adelantado): 30% (rango: 20%–50%) — AWS publica hasta 66% de descuento con Compute Savings Plans y hasta 72% con EC2 Instance Savings Plans (ligados a familia y región). Fuente verificada el 2026-07-24: https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/select-the-best-pricing-model.html. Ningún proveedor publica un suelo de descuento, así que el % concreto para tu plazo y forma de pago es un supuesto ajustable: usa las recomendaciones nativas de tu proveedor.

**Investigación (solo lectura):**

```bash
# Ver recomendaciones de Savings Plans [aws]
aws ce get-savings-plans-purchase-recommendation \
  --savings-plans-type COMPUTE_SP \
  --term-in-years ONE_YEAR \
  --payment-option NO_UPFRONT \
  --lookback-period-in-days SIXTY_DAYS
```

**Rollback:** Los compromisos NO son cancelables. Elegir No Upfront/PAYG minimiza riesgo.

<details><summary>Remediación (expandir)</summary>

> ⚠️ **Acción irreversible — posible pérdida de datos o servicio. Respalda y valida antes de ejecutar.**

```bash
# Comprar Savings Plan (consola) [aws]
Ir a: Cost Explorer > Savings Plans > Recommendations
Evaluar compromiso basado en uso estable de últimos 60 días.
```

</details>

---

### ⬜ [AWS] Revisar uso real de instancias t2.xlarge

**Pilar:** AWS Well-Architected — Cost Optimization ([ref](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/))
**Ahorro:** $0.00–$360.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Cómputo con gasto de ~$1200/mes. El billing solo muestra horas encendidas, no carga real. Requiere revisión de métricas de utilización para determinar si está correctamente dimensionado.

> Costo mensual: $1200.00/mes. No se puede estimar ahorro sin métricas de utilización reales. El billing muestra horas encendidas, no carga de CPU/memoria.

**Investigación (solo lectura):**

```bash
# Verificar utilización de CPU (últimos 7 días) [aws]
# Inicio 7 días atrás (macOS / Linux):
START=$(date -v-7d +%Y-%m-%dT%H:%M:%S)              # macOS
# START=$(date -d "7 days ago" +%Y-%m-%dT%H:%M:%S)  # Linux (GNU)
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 --metric-name CPUUtilization \
  --start-time $START \
  --end-time $(date +%Y-%m-%dT%H:%M:%S) \
  --period 86400 --statistics Average Maximum \
  --dimensions Name=InstanceType,Value=t2.xlarge \
  --region us-east-1
```

```bash
# Verificar conexiones de red [aws]
# Inicio 7 días atrás (macOS / Linux):
START=$(date -v-7d +%Y-%m-%dT%H:%M:%S)              # macOS
# START=$(date -d "7 days ago" +%Y-%m-%dT%H:%M:%S)  # Linux (GNU)
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 --metric-name NetworkPacketsIn \
  --start-time $START \
  --end-time $(date +%Y-%m-%dT%H:%M:%S) \
  --period 86400 --statistics Sum \
  --dimensions Name=InstanceType,Value=t2.xlarge \
  --region us-east-1
```

**Rollback:** N/A — solo comandos de investigación.

---

### 🔶 [AWS] Discos pagados que podrían no estar en uso

**Pilar:** AWS Well-Architected — Cost Optimization — COST06-BP01 ([ref](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_decomissioning.html))
**Ahorro:** $30.00–$240.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Gasto total en almacenamiento de bloque: ~$600.00/mes. Rango estimado de ahorro: $30.00–$240.00/mes.

> Costo mensual total: $600.00. Supuesto: 20% no adjuntos (rango: 5%–40%). Ahorro moderado: $600.00 × 0.2 = $120.00/mes.

**Supuestos:**
- % de discos pagados que nadie usa (volúmenes sin adjuntar): 20% (rango: 5%–40%) — Estimación editorial ajustable — no hay benchmark público verificado del % de volúmenes sin adjuntar. Ajusta este valor según tu entorno.

**Investigación (solo lectura):**

```bash
# Listar volúmenes no adjuntos [aws]
aws ec2 describe-volumes --region us-east-1 \
  --filters Name=status,Values=available \
  --query "Volumes[*].{ID:VolumeId,Size:Size,Type:VolumeType,Created:CreateTime}" \
  --output table
```

**Rollback:** Restaurar desde snapshot/backup previo a la eliminación.

<details><summary>Remediación (expandir)</summary>

**Paso obligatorio de respaldo:** Crear snapshot del volumen antes de eliminarlo.

```bash
# Crear snapshot de respaldo [aws]
aws ec2 create-snapshot --volume-id <VOL_ID> \
  --description "Backup before deletion" --region us-east-1
```

> ⚠️ **Acción irreversible — posible pérdida de datos o servicio. Respalda y valida antes de ejecutar.**

```bash
# Eliminar volumen [aws]
aws ec2 delete-volume --volume-id <VOL_ID> --region us-east-1
```

</details>

---

### 🔶 [AWS] Reducir el costo de salida a internet (NAT Gateway)

**Pilar:** AWS Well-Architected — Cost Optimization — COST06-BP02 ([ref](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_type_size_number_resources_data.html))
**Ahorro:** $54.00–$252.00/mes | **Esfuerzo:** Medio | **Riesgo:** Bajo

Gasto en NAT: ~$360.00/mes (en AWS us-east-1 el NAT Gateway cuesta 0,045 USD/GB procesado más 0,045 USD/hora; varía por región). En AWS, los Gateway Endpoints de S3 y DynamoDB no tienen cargo adicional y sacan ese tráfico del NAT. Los Interface Endpoints (PrivateLink) sí cobran por hora y por datos procesados, igual que los equivalentes privados de Azure y GCP: compara antes de migrarlo todo.

> Costo NAT mensual: $360.00. Supuesto: 40% redirigible (rango: 15%–70%). Rango: $54.00–$252.00/mes.

**Supuestos:**
- % del tráfico que podría salir por conexiones privadas (VPC endpoints): 40% (rango: 15%–70%) — Estimación editorial ajustable — el % de tráfico redirigible a endpoints privados depende de tu mix; mídelo con VPC Flow Logs. No hay benchmark público verificado.

**Investigación (solo lectura):**

```bash
# Ver top destinos del NAT (VPC Flow Logs) [aws]
aws ec2 describe-flow-logs --region us-east-1 \
  --query "FlowLogs[*].{ID:FlowLogId,Status:FlowLogStatus}" \
  --output table
```

**Rollback:** Eliminar endpoint. El tráfico volverá a rutear por NAT Gateway.

<details><summary>Remediación (expandir)</summary>

```bash
# Crear VPC Endpoint para S3 [aws]
aws ec2 create-vpc-endpoint \
  --vpc-id <VPC_ID> \
  --service-name com.amazonaws.us-east-1.s3 \
  --route-table-ids <RTB_ID>
```

```bash
# Crear VPC Endpoint para DynamoDB [aws]
aws ec2 create-vpc-endpoint \
  --vpc-id <VPC_ID> \
  --service-name com.amazonaws.us-east-1.dynamodb \
  --route-table-ids <RTB_ID>
```

</details>

---

### ⬜ [AWS] Revisar uso real de instancias db.m5.large

**Pilar:** AWS Well-Architected — Cost Optimization ([ref](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/))
**Ahorro:** $0.00–$270.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Cómputo con gasto de ~$900/mes. El billing solo muestra horas encendidas, no carga real. Requiere revisión de métricas de utilización para determinar si está correctamente dimensionado.

> Costo mensual: $900.00/mes. No se puede estimar ahorro sin métricas de utilización reales. El billing muestra horas encendidas, no carga de CPU/memoria.

**Investigación (solo lectura):**

```bash
# Verificar utilización de CPU (últimos 7 días) [aws]
# Inicio 7 días atrás (macOS / Linux):
START=$(date -v-7d +%Y-%m-%dT%H:%M:%S)              # macOS
# START=$(date -d "7 days ago" +%Y-%m-%dT%H:%M:%S)  # Linux (GNU)
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 --metric-name CPUUtilization \
  --start-time $START \
  --end-time $(date +%Y-%m-%dT%H:%M:%S) \
  --period 86400 --statistics Average Maximum \
  --dimensions Name=InstanceType,Value=db.m5.large \
  --region us-east-1
```

```bash
# Verificar conexiones de red [aws]
# Inicio 7 días atrás (macOS / Linux):
START=$(date -v-7d +%Y-%m-%dT%H:%M:%S)              # macOS
# START=$(date -d "7 days ago" +%Y-%m-%dT%H:%M:%S)  # Linux (GNU)
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 --metric-name NetworkPacketsIn \
  --start-time $START \
  --end-time $(date +%Y-%m-%dT%H:%M:%S) \
  --period 86400 --statistics Sum \
  --dimensions Name=InstanceType,Value=db.m5.large \
  --region us-east-1
```

**Rollback:** N/A — solo comandos de investigación.

---

### ✅ [AWS] Migrar a un equivalente actual más barato: t2.xlarge → t3.xlarge

**Pilar:** AWS Well-Architected — Cost Optimization — COST06-BP02 ([ref](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_type_size_number_resources_data.html))
**Ahorro:** $84.00–$144.00/mes | **Esfuerzo:** Medio | **Riesgo:** Bajo

Instancia(s) t2.xlarge en us-east-1: t3.xlarge cuesta ~10.3% menos por la misma configuración (On-Demand, Linux, tenancy compartida, us-east-1, 2026-07-24). Ojo: AWS sigue clasificando algunas de estas familias como generación actual, así que no se trata de un recurso obsoleto, sino de una familia con un equivalente actual más económico.

> Costo mensual: $1,200.00. Delta verificado t2 → t3: 10.3% (us-east-1, On-Demand, Linux, 2026-07-24). Banda aplicada por variación de región y tamaño: 7%–12%. Rango: $84.00–$144.00/mes.

**Supuestos:**
- % de ahorro al migrar t2 → t3: 10% (rango: 7%–12%) — Delta verificado contra el Price List de AWS: t2 → t3 ahorra 10.3% (On-Demand, Linux, tenancy compartida, us-east-1, consultado el 2026-07-24). La banda min/max refleja que el delta varía por región y por tamaño de instancia: confirma el precio de tu tipo y región concretos.

**Investigación (solo lectura):**

```bash
# Describir instancias del tipo [aws]
aws ec2 describe-instances --region us-east-1 \
  --filters "Name=instance-type,Values=t2.xlarge" \
  --query "Reservations[*].Instances[*].{ID:InstanceId,State:State.Name,Type:InstanceType}" \
  --output table
```

**Rollback:** Revertir tipo: aws ec2 modify-instance-attribute --instance-id <ID> --instance-type '{"Value": "t2.xlarge"}' y reiniciar.

<details><summary>Remediación (expandir)</summary>

```bash
# Detener instancia [aws]
aws ec2 stop-instances --instance-ids <INSTANCE_ID> --region us-east-1
```

```bash
# Cambiar tipo de instancia [aws]
aws ec2 modify-instance-attribute \
  --instance-id <INSTANCE_ID> \
  --instance-type '{"Value": "t3.xlarge"}'
```

```bash
# Reiniciar instancia [aws]
aws ec2 start-instances --instance-ids <INSTANCE_ID> --region us-east-1
```

</details>

---

### 🔶 [AWS] Mover datos poco usados a una clase de almacenamiento más barata

**Pilar:** AWS Well-Architected — Cost Optimization — COST06-BP01 ([ref](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_decomissioning.html))
**Ahorro:** $22.50–$244.80/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Gasto en almacenamiento de objetos: ~$450.00/mes. S3 Intelligent-Tiering mueve los objetos automáticamente: a Infrequent Access tras 30 días sin acceso y a Archive Instant Access tras 90. Cobra una cuota de monitorización por objeto, así que no conviene para objetos muy pequeños.

> Costo mensual: $450.00. Supuestos: 50% datos infrecuentes (20%–80%) × 40% ahorro (25%–68%). Rango: $22.50–$244.80/mes.

**Supuestos:**
- % de datos que casi nunca se leen (acceso infrecuente): 50% (rango: 20%–80%) — Estimación editorial ajustable — el % de datos con acceso infrecuente depende de tu patrón real. Mídelo con la herramienta de tu proveedor: S3 Storage Lens en AWS, las métricas de Azure Monitor sobre la cuenta de almacenamiento en Azure, o Cloud Monitoring y el Storage Insights de Cloud Storage en GCP. No hay benchmark público verificado.
- % de ahorro al mover esos datos a almacenamiento más barato (tiering): 40% (rango: 25%–68%) — S3 Intelligent-Tiering tiene tiers Infrequent/Archive reales y transiciones automáticas a 30 y 90 días (verificado: https://docs.aws.amazon.com/AmazonS3/latest/userguide/intelligent-tiering-overview.html). El % de ahorro depende de tu patrón de acceso — estimación editorial ajustable.

**Investigación (solo lectura):**

```bash
# Ver métricas de acceso con S3 Storage Lens [aws]
aws s3control get-storage-lens-configuration \
  --account-id <ACCOUNT_ID> \
  --config-id default-account-dashboard
```

**Rollback:** Desactiva la regla de lifecycle. Los objetos ya movidos siguen accesibles; Infrequent Access y Archive Instant Access se leen sin restauración previa.

<details><summary>Remediación (expandir)</summary>

```bash
# Configurar lifecycle para Intelligent-Tiering [aws]
aws s3api put-bucket-lifecycle-configuration \
  --bucket <BUCKET_NAME> \
  --lifecycle-configuration '{
    "Rules": [{"ID": "AutoTiering", "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "Transitions": [{"Days": 0, "StorageClass": "INTELLIGENT_TIERING"}]
    }]
  }'
```

</details>

---

### 🔶 [AWS] Respaldos (snapshots) antiguos que podrías depurar

**Pilar:** AWS Well-Architected — Cost Optimization — COST06-BP01 ([ref](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_decomissioning.html))
**Ahorro:** $24.00–$120.00/mes | **Esfuerzo:** Medio | **Riesgo:** Bajo

Gasto en snapshots: ~$240.00/mes. Rango de ahorro: $24.00–$120.00/mes.

> Costo mensual snapshots: $240.00. Supuesto: 30% obsoletos (rango: 10%–50%). Ahorro moderado: $240.00 × 0.3 = $72.00/mes.

**Supuestos:**
- % de respaldos (snapshots) antiguos que ya no necesitas: 30% (rango: 10%–50%) — Estimación editorial ajustable — no hay benchmark público verificado del % de snapshots obsoletos. Ajusta este valor según tu entorno.

**Investigación (solo lectura):**

```bash
# Listar snapshots propios (>90 días) [aws]
# Fecha de corte 90 días atrás (macOS / Linux):
CUTOFF=$(date -v-90d +%Y-%m-%d)              # macOS
# CUTOFF=$(date -d "90 days ago" +%Y-%m-%d)  # Linux (GNU)
aws ec2 describe-snapshots --owner-ids self --region us-east-1 \
  --query "Snapshots[?StartTime<='$CUTOFF'].{ID:SnapshotId,Size:VolumeSize,Date:StartTime}" \
  --output table
```

**Rollback:** Los snapshots eliminados NO se pueden recuperar. Mantener al menos el más reciente por volumen.

<details><summary>Remediación (expandir)</summary>

**Paso obligatorio de respaldo:** Verificar que existe al menos un snapshot reciente antes de eliminar los obsoletos.

> ⚠️ **Acción irreversible — posible pérdida de datos o servicio. Respalda y valida antes de ejecutar.**

```bash
# Eliminar snapshot [aws]
aws ec2 delete-snapshot --snapshot-id <SNAP_ID> --region us-east-1
```

</details>

---

### 🔶 [AWS] ~10 IPv4 públicas facturadas en us-east-1

**Pilar:** AWS Well-Architected — Cost Optimization ([ref](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/))
**Ahorro:** $7.20–$25.20/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Cargo de $36.00/mes por ~10 IPv4 públicas facturadas en us-east-1. AWS cobra 0,005 USD/hora tanto por USE1-PublicIPv4:IdleAddress como por USE1-PublicIPv4:InUseAddress en us-east-1 (2026-07-24): la tarifa es idéntica, así que la factura no distingue una IP ociosa de una en uso. No asumas que todas están ociosas: confírmalo listando las direcciones sin asociación con los comandos de investigación de abajo.

> Tarifa de IPv4 pública: $0.005/hora = ~$3.65/mes (us-east-1, 2026-07-24), idéntica esté la IP asociada o no. Costo observado: $16.80 en 14 días → $36.00/mes, equivalente a ~10 IPv4 públicas FACTURADAS (no necesariamente ociosas). Criterio del rango: como no se puede separar ociosas de en uso desde la factura, se estima que solo entre el 20% y el 70% del cargo corresponde a direcciones liberables (valor central 40%). Verifica el número real listando las direcciones sin asociación.

**Investigación (solo lectura):**

```bash
# Listar EIPs no asociadas [aws]
aws ec2 describe-addresses --region us-east-1 \
  --query "Addresses[?AssociationId==null].{AllocationId:AllocationId,PublicIp:PublicIp}" \
  --output table
```

**Rollback:** Asignar nueva IP (será una dirección diferente).

<details><summary>Remediación (expandir)</summary>

> ⚠️ **Acción irreversible — posible pérdida de datos o servicio. Respalda y valida antes de ejecutar.**

```bash
# Liberar EIP [aws]
aws ec2 release-address --allocation-id <ALLOCATION_ID> --region us-east-1
```

</details>

---


## 📐 Metodología

Las cifras las calcula el motor de reglas determinístico; la IA no inventa números. Score de prioridad: ahorro (0-100, escalado a $1000) × multiplicador esfuerzo × multiplicador riesgo. Los ahorros se presentan como rangos basados en supuestos ajustables.

---

*Recomendaciones informativas. Valida en tu entorno antes de actuar.*