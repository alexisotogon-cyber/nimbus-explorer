# 📊 Reporte Ejecutivo FinOps — Auditoría Multi-Nube

**Generado:** 25 de julio de 2026
**Periodo:** 31 de mayo de 2026 — 19 de junio de 2026
**Proveedores:** AWS
**Costo mensual proyectado:** $73,500.00
**Ahorro identificado (rango):** $10,860.00–$45,336.00/mes
**Adicional sujeto a revisión de métricas:** hasta $5,400.00/mes (hallazgos fuera del alcance del billing, sin evidencia de utilización)
**Hallazgos:** 11

> **Aviso:** Estas son recomendaciones informativas basadas en tu facturación. Valida cada acción en tu entorno antes de aplicarla.

## 🎯 Resumen Ejecutivo

Se identificaron **11 oportunidades** con ahorro potencial de **$10,860.00–$45,336.00/mes** (estimación moderada: $24,984.00/mes, 34% del gasto).

**Quick Wins** (esfuerzo bajo + riesgo bajo + ahorro ≥$50.00/mes): 2 hallazgos, ~$3,600.00/mes.

## 📋 Hallazgos Priorizados

| # | Proveedor | Hallazgo | Ahorro (rango) | Esfuerzo | Riesgo | Confianza |
|---|-----------|----------|---------------|----------|--------|-----------|
| 1 | AWS | Revisar uso real de instancias m3.2xlarge | $0.00–$5,400.00 | Bajo | Bajo | ⬜ Fuera-de-alcance-del-billing |
| 2 | AWS | Discos pagados que podrían no estar en uso | $450.00–$3,600.00 | Bajo | Bajo | 🔶 Inferencia |
| 3 | AWS | Mover datos poco usados a una clase de almacenamiento más barata | $450.00–$4,896.00 | Bajo | Bajo | 🔶 Inferencia |
| 4 | AWS | Tu gasto en IA: $24,000.00/mes (32.7% de tu factura) | $0.00–$0.00 | Bajo | Bajo | ✅ Confirmado |
| 5 | AWS | Contratar descuentos por uso constante (Compute Savings Plans) | $1,440.00–$8,100.00 | Bajo | Medio | 🔶 Inferencia |
| 6 | AWS | Gasto en IA sin asignación visible por equipo o proyecto | $0.00–$0.00 | Bajo | Bajo | ✅ Confirmado |
| 7 | AWS | Usar Batch Inference para reducir costos de Amazon Bedrock | $1,200.00–$7,200.00 | Medio | Bajo | 🔶 Inferencia |
| 8 | AWS | Endpoints SageMaker que podrían usar Serverless Inference (paga por invocación) | $2,400.00–$8,400.00 | Medio | Medio | 🔶 Inferencia |
| 9 | AWS | Migrar a un equivalente actual más barato: m3.2xlarge → m6i.2xlarge | $3,420.00–$5,940.00 | Medio | Bajo | ✅ Confirmado |
| 10 | AWS | Reducir el costo de salida a internet (NAT Gateway) | $900.00–$4,200.00 | Medio | Bajo | 🔶 Inferencia |
| 11 | AWS | Respaldos (snapshots) antiguos que podrías depurar | $600.00–$3,000.00 | Medio | Bajo | 🔶 Inferencia |

## 📂 Por Categoría

| Categoría | Ahorro Est. | Hallazgos |
|-----------|-------------|-----------|
| Instancias de generación vieja | $5,004.00/mes | 1 |
| Endpoints de inferencia siempre activos | $4,800.00/mes | 1 |
| Sin descuentos por compromiso (Savings Plans / Reservas) | $3,780.00/mes | 1 |
| Inferencia IA cara cuando hay alternativa por lotes | $3,600.00/mes | 1 |
| Salida a internet cara (NAT Gateway) | $2,400.00/mes | 1 |
| Discos pagados posiblemente sin uso | $1,800.00/mes | 1 |
| Datos en almacenamiento más caro de lo necesario | $1,800.00/mes | 1 |
| Respaldos (snapshots) antiguos acumulados | $1,800.00/mes | 1 |
| Revisar uso real (la factura no basta) | $0.00/mes | 1 |
| Gasto en inteligencia artificial (AI/ML) | $0.00/mes | 1 |
| Gasto IA sin asignación por equipo o proyecto | $0.00/mes | 1 |

## 🔍 Detalle

### ⬜ [AWS] Revisar uso real de instancias m3.2xlarge

**Pilar:** AWS Well-Architected — Cost Optimization ([ref](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/))
**Ahorro:** $0.00–$5,400.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Cómputo con gasto de ~$18000/mes. El billing solo muestra horas encendidas, no carga real. Requiere revisión de métricas de utilización para determinar si está correctamente dimensionado.

> Costo mensual: $18000.00/mes. No se puede estimar ahorro sin métricas de utilización reales. El billing muestra horas encendidas, no carga de CPU/memoria.

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
  --dimensions Name=InstanceType,Value=m3.2xlarge \
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
  --dimensions Name=InstanceType,Value=m3.2xlarge \
  --region us-east-1
```

**Rollback:** N/A — solo comandos de investigación.

---

### 🔶 [AWS] Discos pagados que podrían no estar en uso

**Pilar:** AWS Well-Architected — Cost Optimization — COST06-BP01 ([ref](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_decomissioning.html))
**Ahorro:** $450.00–$3,600.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Gasto total en almacenamiento de bloque: ~$9,000.00/mes. Rango estimado de ahorro: $450.00–$3,600.00/mes.

> Costo mensual total: $9,000.00. Supuesto: 20% no adjuntos (rango: 5%–40%). Ahorro moderado: $9,000.00 × 0.2 = $1,800.00/mes.

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

### 🔶 [AWS] Mover datos poco usados a una clase de almacenamiento más barata

**Pilar:** AWS Well-Architected — Cost Optimization — COST06-BP01 ([ref](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_decomissioning.html))
**Ahorro:** $450.00–$4,896.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Gasto en almacenamiento de objetos: ~$9,000.00/mes. S3 Intelligent-Tiering mueve los objetos automáticamente: a Infrequent Access tras 30 días sin acceso y a Archive Instant Access tras 90. Cobra una cuota de monitorización por objeto, así que no conviene para objetos muy pequeños.

> Costo mensual: $9,000.00. Supuestos: 50% datos infrecuentes (20%–80%) × 40% ahorro (25%–68%). Rango: $450.00–$4,896.00/mes.

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

### ✅ [AWS] Tu gasto en IA: $24,000.00/mes (32.7% de tu factura)

**Pilar:** AWS Well-Architected — Cost Optimization — Visibility ([ref](https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-best-practices.html))
**Ahorro:** $0.00–$0.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Gasto mensual en servicios de inteligencia artificial (AI/ML): $24,000.00/mes (32.7% de tu factura total de $73,500.00/mes). Tendencia: estable en el periodo. Desglose: Amazon Bedrock: $12,000.00/mes; Amazon SageMaker: $12,000.00/mes.

> Gasto IA total en el periodo: $16,000.00. Días de datos: 20. Proyección mensual: $16,000.00 / 20 × 30 = $24,000.00.

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

### 🔶 [AWS] Contratar descuentos por uso constante (Compute Savings Plans)

**Pilar:** AWS Well-Architected — Cost Optimization — COST06-BP01 ([ref](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_decomissioning.html))
**Ahorro:** $1,440.00–$8,100.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Medio

Gasto compute/DB On-Demand de ~$18,000.00/mes sin compromisos. AWS publica hasta 66% de descuento con Compute Savings Plans y hasta 72% con EC2 Instance Savings Plans (ligados a familia y región). Rango de ahorro estimado: $1,440.00–$8,100.00/mes.

> Gasto mensual On-Demand: $18,000.00. Supuestos: 70% elegible (40%–90%) × 30% descuento (20%–50%). Rango: $1,440.00–$8,100.00/mes.

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

### ✅ [AWS] Gasto en IA sin asignación visible por equipo o proyecto

**Pilar:** AWS Well-Architected — Cost Optimization — Cost Attribution ([ref](https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-application-inference-profiles.html))
**Ahorro:** $0.00–$0.00/mes | **Esfuerzo:** Bajo | **Riesgo:** Bajo

Hay $24,000.00/mes en servicios de IA pero no se detectan perfiles de inferencia ni dimensiones de asignación de costos. No es posible saber qué equipo o aplicación genera qué gasto.

> Gasto IA mensual sin atribuir: $24,000.00. No hay ahorro directo estimable — este hallazgo es de gobernanza.

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

### 🔶 [AWS] Usar Batch Inference para reducir costos de Amazon Bedrock

**Pilar:** AWS Well-Architected — Cost Optimization — Serverless and Managed Services ([ref](https://docs.aws.amazon.com/bedrock/latest/userguide/capacity-limits-cost-optimization.html))
**Ahorro:** $1,200.00–$7,200.00/mes | **Esfuerzo:** Medio | **Riesgo:** Bajo

Gasto en Amazon Bedrock bajo demanda (On-Demand): ~$24,000.00/mes. Batch Inference ofrece 50% de ahorro para cargas que toleran hasta 24 horas de latencia.

> Costo Amazon Bedrock mensual: $24,000.00. Supuestos: 30% tolera lotes (10%–60%) × 50% descuento batch (verificado). Rango: $1,200.00–$7,200.00/mes.

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

### 🔶 [AWS] Endpoints SageMaker que podrían usar Serverless Inference (paga por invocación)

**Pilar:** AWS Well-Architected — Cost Optimization — Managed Services ([ref](https://docs.aws.amazon.com/sagemaker/latest/dg/serverless-endpoints.html))
**Ahorro:** $2,400.00–$8,400.00/mes | **Esfuerzo:** Medio | **Riesgo:** Medio

Gasto en endpoints SageMaker: ~$12,000.00/mes. Serverless Inference elimina el costo de endpoints inactivos.

> Costo endpoints (Amazon SageMaker) mensual: $12,000.00. Supuesto: 40% ahorro (20%–70%). Rango: $2,400.00–$8,400.00/mes.

**Supuestos:**
- % de ahorro al reducir capacidad reservada (tráfico intermitente): 40% (rango: 20%–70%) — Estimación editorial ajustable — depende de la frecuencia de invocaciones. No hay benchmark público verificado.

**Investigación (solo lectura):**

```bash
# Listar endpoints SageMaker en servicio [aws]
aws sagemaker list-endpoints --status-equals InService \
  --query "Endpoints[*].{Name:EndpointName,Config:EndpointConfigName,Created:CreationTime}" \
  --output table
```

```bash
# Ver invocaciones del endpoint (últimos 7 días) [aws]
START=$(date -v-7d +%Y-%m-%dT%H:%M:%S)              # macOS
# START=$(date -d "7 days ago" +%Y-%m-%dT%H:%M:%S)  # Linux (GNU)
aws cloudwatch get-metric-statistics \
  --namespace AWS/SageMaker --metric-name Invocations \
  --dimensions Name=EndpointName,Value=<ENDPOINT_NAME> \
  --start-time $START --end-time $(date +%Y-%m-%dT%H:%M:%S) \
  --period 3600 --statistics Sum
```

**Rollback:** Restaurar endpoint real-time si Serverless Inference no cumple los requisitos de latencia.

---

### ✅ [AWS] Migrar a un equivalente actual más barato: m3.2xlarge → m6i.2xlarge

**Pilar:** AWS Well-Architected — Cost Optimization — COST06-BP02 ([ref](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_type_size_number_resources_data.html))
**Ahorro:** $3,420.00–$5,940.00/mes | **Esfuerzo:** Medio | **Riesgo:** Bajo

Instancia(s) m3.2xlarge en us-east-1: m6i.2xlarge cuesta ~27.8% menos por la misma configuración (On-Demand, Linux, tenancy compartida, us-east-1, 2026-07-24). Ojo: AWS sigue clasificando algunas de estas familias como generación actual, así que no se trata de un recurso obsoleto, sino de una familia con un equivalente actual más económico.

> Costo mensual: $18,000.00. Delta verificado m3 → m6i: 27.8% (us-east-1, On-Demand, Linux, 2026-07-24). Banda aplicada por variación de región y tamaño: 19%–33%. Rango: $3,420.00–$5,940.00/mes.

**Supuestos:**
- % de ahorro al migrar m3 → m6i: 28% (rango: 19%–33%) — Delta verificado contra el Price List de AWS: m3 → m6i ahorra 27.8% (On-Demand, Linux, tenancy compartida, us-east-1, consultado el 2026-07-24). La banda min/max refleja que el delta varía por región y por tamaño de instancia: confirma el precio de tu tipo y región concretos.

**Investigación (solo lectura):**

```bash
# Describir instancias del tipo [aws]
aws ec2 describe-instances --region us-east-1 \
  --filters "Name=instance-type,Values=m3.2xlarge" \
  --query "Reservations[*].Instances[*].{ID:InstanceId,State:State.Name,Type:InstanceType}" \
  --output table
```

**Rollback:** Revertir tipo: aws ec2 modify-instance-attribute --instance-id <ID> --instance-type '{"Value": "m3.2xlarge"}' y reiniciar.

<details><summary>Remediación (expandir)</summary>

```bash
# Detener instancia [aws]
aws ec2 stop-instances --instance-ids <INSTANCE_ID> --region us-east-1
```

```bash
# Cambiar tipo de instancia [aws]
aws ec2 modify-instance-attribute \
  --instance-id <INSTANCE_ID> \
  --instance-type '{"Value": "m6i.2xlarge"}'
```

```bash
# Reiniciar instancia [aws]
aws ec2 start-instances --instance-ids <INSTANCE_ID> --region us-east-1
```

</details>

---

### 🔶 [AWS] Reducir el costo de salida a internet (NAT Gateway)

**Pilar:** AWS Well-Architected — Cost Optimization — COST06-BP02 ([ref](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_type_size_number_resources_data.html))
**Ahorro:** $900.00–$4,200.00/mes | **Esfuerzo:** Medio | **Riesgo:** Bajo

Gasto en NAT: ~$6,000.00/mes (en AWS us-east-1 el NAT Gateway cuesta 0,045 USD/GB procesado más 0,045 USD/hora; varía por región). En AWS, los Gateway Endpoints de S3 y DynamoDB no tienen cargo adicional y sacan ese tráfico del NAT. Los Interface Endpoints (PrivateLink) sí cobran por hora y por datos procesados, igual que los equivalentes privados de Azure y GCP: compara antes de migrarlo todo.

> Costo NAT mensual: $6,000.00. Supuesto: 40% redirigible (rango: 15%–70%). Rango: $900.00–$4,200.00/mes.

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

### 🔶 [AWS] Respaldos (snapshots) antiguos que podrías depurar

**Pilar:** AWS Well-Architected — Cost Optimization — COST06-BP01 ([ref](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_decomissioning.html))
**Ahorro:** $600.00–$3,000.00/mes | **Esfuerzo:** Medio | **Riesgo:** Bajo

Gasto en snapshots: ~$6,000.00/mes. Rango de ahorro: $600.00–$3,000.00/mes.

> Costo mensual snapshots: $6,000.00. Supuesto: 30% obsoletos (rango: 10%–50%). Ahorro moderado: $6,000.00 × 0.3 = $1,800.00/mes.

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