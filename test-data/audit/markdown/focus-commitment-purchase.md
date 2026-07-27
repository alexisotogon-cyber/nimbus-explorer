# 📊 Reporte Ejecutivo FinOps — Auditoría Multi-Nube

**Generado:** 25 de julio de 2026
**Periodo:** 31 de mayo de 2026 — 13 de junio de 2026
**Proveedores:** AWS
**Costo mensual proyectado:** $7,536.00
**Ahorro identificado (rango):** $252.00–$1,225.80/mes
**Adicional sujeto a revisión de métricas:** hasta $1,260.00/mes (hallazgos fuera del alcance del billing, sin evidencia de utilización)
**Hallazgos:** 10

> **Aviso:** Estas son recomendaciones informativas basadas en tu facturación. Valida cada acción en tu entorno antes de aplicarla.

## 🎯 Resumen Ejecutivo

Se identificaron **10 oportunidades** con ahorro potencial de **$252.00–$1,225.80/mes** (estimación moderada: $662.10/mes, 8.8% del gasto).

**Quick Wins** (esfuerzo bajo + riesgo bajo + ahorro ≥$50.00/mes): 2 hallazgos, ~$210.00/mes.

## 📋 Hallazgos Priorizados

| # | Proveedor | Hallazgo | Ahorro (rango) | Esfuerzo | Riesgo | Confianza |
|---|-----------|----------|---------------|----------|--------|-----------|
| 1 | AWS | Tu gasto en IA: $750.00/mes (10.0% de tu factura) | $0.00–$0.00 | Bajo | Bajo | ✅ Confirmado |
| 2 | AWS | Gasto en IA sin asignación visible por equipo o proyecto | $0.00–$0.00 | Bajo | Bajo | ✅ Confirmado |
| 3 | AWS | Revisar uso real de instancias m6i.4xlarge | $0.00–$900.00 | Bajo | Bajo | ⬜ Fuera-de-alcance-del-billing |
| 4 | AWS | Revisar uso real de instancias t2.xlarge | $0.00–$360.00 | Bajo | Bajo | ⬜ Fuera-de-alcance-del-billing |
| 5 | AWS | Discos pagados que podrían no estar en uso | $30.00–$240.00 | Bajo | Bajo | ✅ Confirmado |
| 6 | AWS | Reducir el costo de salida a internet (NAT Gateway) | $54.00–$252.00 | Medio | Bajo | 🔶 Inferencia |
| 7 | AWS | Migrar a un equivalente actual más barato: t2.xlarge → t3.xlarge | $84.00–$144.00 | Medio | Bajo | ✅ Confirmado |
| 8 | AWS | Mover datos poco usados a una clase de almacenamiento más barata | $22.50–$244.80 | Bajo | Bajo | 🔶 Inferencia |
| 9 | AWS | Usar Batch Inference para reducir costos de Amazon Bedrock | $37.50–$225.00 | Medio | Bajo | 🔶 Inferencia |
| 10 | AWS | Respaldos (snapshots) antiguos que podrías depurar | $24.00–$120.00 | Medio | Bajo | 🔶 Inferencia |

## 📂 Por Categoría

| Categoría | Ahorro Est. | Hallazgos |
|-----------|-------------|-----------|
| Salida a internet cara (NAT Gateway) | $144.00/mes | 1 |
| Instancias de generación vieja | $123.60/mes | 1 |
| Discos pagados posiblemente sin uso | $120.00/mes | 1 |
| Inferencia IA cara cuando hay alternativa por lotes | $112.50/mes | 1 |
| Datos en almacenamiento más caro de lo necesario | $90.00/mes | 1 |
| Respaldos (snapshots) antiguos acumulados | $72.00/mes | 1 |
| Gasto en inteligencia artificial (AI/ML) | $0.00/mes | 1 |
| Gasto IA sin asignación por equipo o proyecto | $0.00/mes | 1 |
| Revisar uso real (la factura no basta) | $0.00/mes | 2 |

## 🔍 Detalle

### ✅ [AWS] Tu gasto en IA: $750.00/mes (10.0% de tu factura)

**Pilar:** AWS Well-Architected — Cost Optimization — Visibility ([ref](https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-best-practices.html))
**Ahorro:** $0.00–$0.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Gasto mensual en servicios de inteligencia artificial (AI/ML): $750.00/mes (10.0% de tu factura total de $7,536.00/mes). Tendencia: estable en el periodo. Desglose: Amazon Bedrock: $750.00/mes.

> Gasto IA total en el periodo: $350.00. Días de datos: 14. Proyección mensual: $350.00 / 14 × 30 = $750.00.

**Investigación (solo lectura):**

```bash
# Ver gasto por servicio IA (últimos 30 días) [aws]
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-30d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --filter '{"Or":[{"Dimensions":{"Key":"SERVICE","Values":["Amazon Bedrock","Amazon SageMaker"]}},{"Tags":{"Key":"team","Values":["ai"]}}]}'
```

**Rollback:** N/A — solo comandos de investigación.

---

### ✅ [AWS] Gasto en IA sin asignación visible por equipo o proyecto

**Pilar:** AWS Well-Architected — Cost Optimization — Cost Attribution ([ref](https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-application-inference-profiles.html))
**Ahorro:** $0.00–$0.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Hay $750.00/mes en servicios de IA pero no se detectan perfiles de inferencia ni dimensiones de asignación de costos. No es posible saber qué equipo o aplicación genera qué gasto.

> Gasto IA mensual sin atribuir: $750.00. No hay ahorro directo estimable — este hallazgo es de gobernanza.

**Investigación (solo lectura):**

```bash
# Listar application inference profiles existentes (Bedrock) [aws]
aws bedrock list-inference-profiles \
  --query "inferenceProfileSummaries[*].{Name:inferenceProfileName,Status:status,Type:type}" \
  --output table
```

**Rollback:** Eliminar el profile si no se usa. Los perfiles no afectan el funcionamiento de modelos existentes.

<details><summary>Remediación (expandir)</summary>

```bash
# Crear un application inference profile para un equipo [aws]
aws bedrock create-inference-profile \
  --inference-profile-name "team-a-claude" \
  --description "Inference profile for Team A" \
  --model-source '{"copyFrom": "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0"}' \
  --tags Key=team,Value=team-a Key=project,Value=my-app
```

</details>

---

### ⬜ [AWS] Revisar uso real de instancias m6i.4xlarge

**Pilar:** AWS Well-Architected — Cost Optimization ([ref](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/))
**Ahorro:** $0.00–$900.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Cómputo con gasto de ~$3000/mes. El billing solo muestra horas encendidas, no carga real. Requiere revisión de métricas de utilización para determinar si está correctamente dimensionado.

> Costo mensual: $3000.00/mes. No se puede estimar ahorro sin métricas de utilización reales. El billing muestra horas encendidas, no carga de CPU/memoria.

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
  --dimensions Name=InstanceType,Value=m6i.4xlarge \
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
  --dimensions Name=InstanceType,Value=m6i.4xlarge \
  --region us-east-1
```

**Rollback:** N/A — solo comandos de investigación.

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

### ✅ [AWS] Discos pagados que podrían no estar en uso

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

### 🔶 [AWS] Usar Batch Inference para reducir costos de Amazon Bedrock

**Pilar:** AWS Well-Architected — Cost Optimization — Serverless and Managed Services ([ref](https://docs.aws.amazon.com/bedrock/latest/userguide/capacity-limits-cost-optimization.html))
**Ahorro:** $37.50–$225.00/mes | **Esfuerzo:** Medio | **Riesgo:** Bajo

Gasto en Amazon Bedrock bajo demanda (On-Demand): ~$750.00/mes. Batch Inference ofrece 50% de ahorro para cargas que toleran hasta 24 horas de latencia.

> Costo Amazon Bedrock mensual: $750.00. Supuestos: 30% tolera lotes (10%–60%) × 50% descuento batch (verificado). Rango: $37.50–$225.00/mes.

**Supuestos:**
- % de cargas que toleran procesamiento por lotes (Batch Inference): 30% (rango: 10%–60%) — Estimación editorial ajustable — depende de tu arquitectura. No hay benchmark público verificado.
- % de ahorro de Batch Inference vs On-Demand: 50% (rango: 50%–50%) — Verificado en docs oficiales: https://docs.aws.amazon.com/bedrock/latest/userguide/capacity-limits-cost-optimization.html

**Investigación (solo lectura):**

```bash
# Ver invocaciones Bedrock recientes por modelo [aws]
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-30d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY --metrics UnblendedCost \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["Amazon Bedrock"]}}' \
  --group-by Type=DIMENSION,Key=USAGE_TYPE
```

**Rollback:** Los trabajos batch no son destructivos — se pueden cancelar antes de completarse.

<details><summary>Remediación (expandir)</summary>

```bash
# Crear trabajo Batch Inference en Bedrock [aws]
Consola Bedrock → Inference → Batch inference → Create batch inference job
Carga el JSONL de prompts en S3. La respuesta también llega a S3.
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


## 📐 Metodología

Las cifras las calcula el motor de reglas determinístico; la IA no inventa números. Score de prioridad: ahorro (0-100, escalado a $1000) × multiplicador esfuerzo × multiplicador riesgo. Los ahorros se presentan como rangos basados en supuestos ajustables.

---

*Recomendaciones informativas. Valida en tu entorno antes de actuar.*