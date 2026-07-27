/**
 * Knowledge Base — FinOps / FOCUS / Cloud Best Practices
 *
 * SOURCE INTEGRITY: every sourceUrl was verified with the aws-documentation MCP
 * or is an official domain (focus.finops.org, finops.org). Entries without a
 * verifiable URL carry sourceUrl: null and sourceLabel: "Conocimiento general —
 * verifica en documentación oficial". NEVER invent URLs.
 */

export interface KnowledgeEntry {
  id: string;
  topic: string;
  keywords: string[];
  summary: string;
  detail: string;
  sourceUrl: string | null;
  sourceLabel: string;
}

export const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  // ─── a) FinOps Framework ──────────────────────────────────────────────────
  {
    id: "finops-what",
    topic: "FinOps — qué es",
    keywords: ["finops", "que es finops", "framework", "fundacion", "foundation", "practica"],
    summary:
      "FinOps es la práctica de ingeniería financiera en la nube que une finanzas, ingeniería y negocio para tomar decisiones de gasto basadas en datos. Promovida por la FinOps Foundation.",
    detail:
      "FinOps no es solo reducir costos: es lograr el máximo valor por cada dólar invertido en la nube. " +
      "Los equipos FinOps colaboran para que cada decisión de gasto sea intencional y transparente. " +
      "La FinOps Foundation define el marco de referencia, los principios y la terminología estándar (incluyendo el estándar FOCUS).",
    sourceUrl: "https://www.finops.org/framework/",
    sourceLabel: "FinOps Foundation — Framework",
  },
  {
    id: "finops-phases",
    topic: "FinOps — fases Inform / Optimize / Operate",
    keywords: ["inform", "optimize", "operate", "fases", "ciclo", "madurez", "fase"],
    summary:
      "El ciclo FinOps tiene tres fases iterativas: Inform (visibilidad y asignación de costos), Optimize (identificar y aplicar ahorros), Operate (procesos continuos y cultura de responsabilidad).",
    detail:
      "Inform: medir, asignar costos a equipos/productos, crear showback/chargeback. " +
      "Optimize: rightsizing, compromisos (Savings Plans, Reserved Instances, CUDs), arquitectura más eficiente. " +
      "Operate: automatización, anomaly detection, KPIs de eficiencia (unit economics). " +
      "Las organizaciones pasan por estas fases repetidamente a medida que crecen.",
    sourceUrl: "https://www.finops.org/framework/phases/",
    sourceLabel: "FinOps Foundation — Phases",
  },
  {
    id: "finops-unit-economics",
    topic: "FinOps — unit economics",
    keywords: ["unit economics", "costo por unidad", "kpi", "metrica", "eficiencia"],
    summary:
      "Unit economics mide el costo de la nube por unidad de negocio: costo por transacción, por usuario activo, por petición de API. Permite saber si el gasto crece proporcionalmente al negocio.",
    detail:
      "Sin unit economics, un aumento del 30% en factura podría ser malo (ineficiencia) o bueno (crecimiento). " +
      "Ejemplos: costo por pedido procesado, costo por GB almacenado, costo por llamada de API. " +
      "La FinOps Foundation recomienda definir al menos un unit metric por producto antes de optimizar.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en documentación oficial",
  },

  // ─── b) FOCUS ─────────────────────────────────────────────────────────────
  {
    id: "focus-what",
    topic: "FOCUS — qué es el estándar",
    keywords: ["focus", "estandar", "finops open cost", "especificacion", "billing unificado", "multi-nube schema", "que es focus"],
    summary:
      "FOCUS (FinOps Open Cost and Usage Specification) es el estándar abierto de la FinOps Foundation para normalizar datos de facturación de múltiples nubes en un único esquema. " +
      "La especificación va por delante de los proveedores: hoy publica 1.4 mientras los hiperescaladores exportan como máximo 1.2.",
    detail:
      "Antes de FOCUS, AWS, Azure y GCP tenían formatos de billing incompatibles. Con FOCUS, un solo pipeline procesa datos de todas las nubes. " +
      "El estándar define columnas obligatorias presentes en todos los proveedores, como BilledCost, ServiceCategory y ChargePeriodStart. " +
      "Consecuencia práctica para una herramienta seria: parsear el rango 1.0 a 1.2, que es lo que realmente sale de los proveedores, y a la vez entender hacia dónde avanza el estándar. " +
      "Esta app hace exactamente eso, y tolera exports que omiten columnas recomendadas.",
    sourceUrl: "https://focus.finops.org/what-is-focus/",
    sourceLabel: "FinOps Foundation — What is FOCUS",
  },
  {
    id: "focus-columns",
    topic: "FOCUS — columnas clave",
    keywords: ["focus", "columnas", "billedcost", "effectivecost", "servicecategory", "resourceid", "chargecategory", "commitmentdiscountstatus", "providername", "chargeperiodstart"],
    summary:
      "Las columnas FOCUS más importantes: BilledCost (base caja, lo que factura el emisor), EffectiveCost (base devengo, con las compras de compromiso amortizadas), ServiceCategory (categoría canónica), ResourceId (recurso individual), CommitmentDiscountStatus.",
    detail:
      "BilledCost: el importe facturado en el periodo de facturación. EffectiveCost: coste reconocido en el periodo de cargo, amortizando compromisos (Savings Plans, RIs, CUDs). No son dos nombres del mismo número. " +
      "ServiceCategory: categoría estandarizada (Compute, Storage, Networking, AI/ML, Databases). " +
      "ResourceId: identificador único del recurso (ej. arn:aws:ec2:.../vol-xxx). " +
      "CommitmentDiscountStatus: indica si la línea está cubierta por un compromiso. " +
      "ChargeCategory: tipo de cargo (Usage, Purchase, Tax, Credit).",
    sourceUrl: "https://focus.finops.org/",
    sourceLabel: "FinOps Foundation — FOCUS Specification",
  },
  {
    id: "focus-export-aws",
    topic: "FOCUS — cómo exportarlo en AWS",
    keywords: ["focus", "exportar", "aws", "data exports", "billing", "crear export", "cur"],
    summary:
      "En AWS: Billing and Cost Management → Data Exports → Create export → Standard data export → Tabla: FOCUS 1.0 with AWS columns. AWS actualiza el export a diario en tu bucket S3.",
    detail:
      "El export FOCUS de AWS incluye columnas nativas adicionales (AWS-specific columns) además de las columnas FOCUS estándar. " +
      "Soporta FOCUS 1.0 y 1.2 with AWS columns. Los archivos se depositan en un bucket S3 como CSV.gz. " +
      "Requiere activar Cost Explorer y configurar un bucket S3 con la política correcta.",
    sourceUrl: "https://docs.aws.amazon.com/cur/latest/userguide/dataexports-create.html",
    sourceLabel: "AWS Docs — Creating data exports",
  },
  {
    id: "focus-export-azure",
    topic: "FOCUS — cómo exportarlo en Azure",
    keywords: ["focus", "azure", "exportar", "cost management", "exports"],
    summary:
      "En Azure: Cost Management → Exports → selecciona formato FOCUS al crear el export. Azure lo deposita en un storage account.",
    detail:
      "Azure Cost Management soporta el formato FOCUS en sus exports programados. " +
      "El export puede ser diario, semanal o mensual y cubre la suscripción o grupo de administración seleccionado.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en Azure Cost Management portal",
  },
  {
    id: "focus-export-gcp",
    topic: "FOCUS — cómo exportarlo en GCP",
    keywords: ["focus", "gcp", "google cloud", "bigquery", "billing export", "focus export gcp"],
    summary:
      "Google Cloud tiene un export FOCUS nativo hacia una tabla de BigQuery, que se configura desde Cloud Billing. También sigue existiendo el export nativo de billing sobre el que se puede construir una vista propia.",
    detail:
      "El export FOCUS de Google Cloud escribe en BigQuery y se documenta con su propio esquema y su informe de columnas no soportadas. " +
      "Antes de construir análisis sobre él conviene revisar qué columnas omite, porque el hueco es amplio y afecta a la clasificación de servicios y al etiquetado. " +
      "Si necesitas enriquecer los datos con metadata propia, la vía habitual es tomar el export FOCUS tal cual y añadir columnas encima con prefijo x_.",
    sourceUrl:
      "https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/focus-export",
    sourceLabel: "Google Cloud — FOCUS export a BigQuery",
  },

  // ─── c) AWS Well-Architected COST (verified URLs from existing rules) ──────
  {
    id: "wa-cost04-bp03",
    topic: "AWS Well-Architected — COST04-BP03: Decommission resources",
    keywords: ["well-architected", "cost04", "decomisionar", "eliminar", "recursos no usados", "cost optimization"],
    summary:
      "COST04-BP03: identificar y eliminar recursos que ya no se necesitan (volúmenes EBS no adjuntos, snapshots obsoletos, IPs sin usar). Reduce gasto sin cambios de arquitectura.",
    detail:
      "El pilar de Cost Optimization del Well-Architected Framework recomienda un proceso regular de revisión de recursos. " +
      "Los recursos más comunes a decommissionar: EBS volumes en estado 'available', snapshots sin AMI asociada, Elastic IPs sin instancia, load balancers sin backends.",
    sourceUrl: "https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_decomissioning_resources_decommission.html",
    sourceLabel: "AWS Well-Architected — COST04-BP03 Decommission resources",
  },
  // The two former entries (wa-cost07-bp01 / wa-cost07-bp02) were consolidated
  // here: both pointed at the same dead URL and both used the wrong best-practice
  // number. Resource type/size/number is COST06, not COST07 (COST07 covers pricing
  // models, e.g. COST07-BP01 Perform pricing model analysis). "Selecting the
  // resource type and generation" is not a separate best practice — that guidance
  // lives inside COST06-BP02.
  {
    id: "wa-cost06-bp02",
    topic: "AWS Well-Architected — COST06-BP02: Select resource type, size, and number based on data",
    keywords: [
      "well-architected", "cost06", "cost06-bp02", "generacion", "instancia", "tipo",
      "rightsizing", "t2 t3 m4 m6i", "utilizacion", "cloudwatch", "metricas", "datos reales",
      "compute optimizer",
    ],
    summary:
      "COST06-BP02: elige tipo, tamaño y número de recursos a partir de datos de utilización reales (CPU, memoria, red), no de la factura. La factura solo muestra horas facturadas, no carga.",
    detail:
      "COST06 agrupa las best practices de selección de recursos: BP01 modelado de costes, BP02 selección basada en datos, " +
      "BP03 selección automática a partir de métricas y BP04 uso de recursos compartidos. " +
      "La guía sobre elegir la generación de instancia vive dentro de esta misma best practice (COST06-BP02): no es una best practice aparte. " +
      "Un recurso puede tener coste estable y estar al 5% de CPU — el billing no lo revela. " +
      "CloudWatch sí aporta CPUUtilization, NetworkIn/Out y MemoryUtilization (con el CloudWatch Agent), " +
      "y AWS Compute Optimizer analiza esas métricas para recomendar tipos y tamaños. " +
      "Sobre generaciones: hay familias cuyo equivalente actual es más barato por la misma configuración, con un ahorro verificado " +
      "de aproximadamente 4% (m4 → m6i) a 28% (m3 → m6i) en On-Demand, Linux, tenancy compartida, us-east-1, consultado el 2026-07-24. " +
      "Ojo: AWS sigue clasificando t2, m4, c4 y r4 como generación actual; solo m3 y c3 figuran como no actuales. " +
      "La migración requiere detener la instancia y cambiar el tipo con modify-instance-attribute, verificando antes AMI y drivers.",
    sourceUrl: "https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/cost_type_size_number_resources_data.html",
    sourceLabel: "AWS Well-Architected — COST06-BP02 Select resource type, size, and number based on data",
  },

  // ─── d) Playbooks por tipo de hallazgo ────────────────────────────────────
  {
    id: "playbook-savings-plans",
    topic: "Savings Plans — compromisos de descuento en AWS",
    keywords: ["savings plans", "reservas", "reserved instances", "compromiso", "descuento", "1 año", "3 años", "no upfront", "partial upfront", "all upfront"],
    summary:
      "Savings Plans son compromisos de gasto por hora (1 o 3 años) que ofrecen hasta 72% de descuento vs On-Demand. No son cancelables, por lo que elegir el plazo y pago correcto es crítico.",
    detail:
      "Tipos: Compute SP (más flexible, cubre EC2, Lambda, Fargate, hasta 66% descuento), " +
      "EC2 Instance SP (más descuento, hasta 72%, pero ligado a familia/región), " +
      "SageMaker SP (para SageMaker). " +
      "Opciones de pago: No Upfront (pago mensual, menor descuento), Partial Upfront, All Upfront (mayor descuento). " +
      "Recomendación: empezar con Compute SP 1 año No Upfront para máxima flexibilidad. " +
      "ADVERTENCIA: una vez comprado, el compromiso NO se puede cancelar.",
    sourceUrl: "https://docs.aws.amazon.com/savingsplans/latest/userguide/plan-types.html",
    sourceLabel: "AWS Docs — Savings Plans types",
  },
  {
    id: "playbook-cud-azure-reservations",
    topic: "Azure Reservations y GCP CUDs — compromisos de descuento",
    keywords: ["azure reservations", "gcp cud", "committed use", "reserva", "descuento", "compromiso azure google"],
    summary:
      "Techos publicados por proveedor (verificados el 2026-07-24): Azure Reservations hasta 72% y Azure Savings Plan for Compute hasta 65%; Google Cloud CUD basados en recurso hasta 55% (hasta 70% en máquinas optimizadas para memoria) y CUD flexibles de Compute 28% a un año o 46% a tres años. Ningún proveedor publica un suelo de descuento.",
    detail:
      "Azure Reservations: descuento en VMs, SQL Database, Cosmos DB y otros; hasta 72%. Se pueden intercambiar o cancelar parcialmente (con penalización en algunos casos). " +
      "Azure Savings Plan for Compute: hasta 65%, más flexible que la reserva — https://learn.microsoft.com/en-us/azure/cost-management-billing/savings-plan/discount-application. " +
      "Google Cloud CUD basados en recurso (vCPU/memoria): hasta 55%, y hasta 70% en máquinas optimizadas para memoria — https://cloud.google.com/compute/docs/instances/committed-use-discounts-overview. " +
      "Google Cloud Compute flexible CUD: 28% a un año y 46% a tres años — https://cloud.google.com/billing/docs/how-to/cud-analysis-flexible. " +
      "Como referencia AWS: Compute Savings Plans hasta 66% y EC2 Instance Savings Plans hasta 72%. " +
      "Todos requieren carga de trabajo estable y predecible para ser rentables.",
    sourceUrl: "https://learn.microsoft.com/en-us/azure/cost-management-billing/reservations/save-compute-costs-reservations",
    sourceLabel: "Microsoft Learn — Save costs with Azure Reservations (techos de GCP citados en el detalle)",
  },
  {
    id: "playbook-s3-tiering",
    topic: "S3 — clases de almacenamiento y tiering automático",
    keywords: ["s3", "tiering", "intelligent-tiering", "storage class", "lifecycle", "acceso infrecuente", "glacier", "clase almacenamiento"],
    summary:
      "S3 Intelligent-Tiering mueve objetos automáticamente entre tiers según el patrón de acceso, sin penalización por recuperación en los tiers de acceso frecuente e infrecuente.",
    detail:
      "Tiers de S3 Intelligent-Tiering: Frequent Access (igual precio que Standard), " +
      "Infrequent Access (tras 30 días sin acceso), " +
      "Archive Instant Access (tras 90 días), " +
      "Archive Access y Deep Archive Access (opcionales, latencia de minutos a horas). " +
      "Se configura con una Lifecycle Policy o directamente con la clase INTELLIGENT_TIERING. " +
      "Tiene un cargo de monitoreo por objeto (~$0.0025 por 1000 objetos/mes), no rentable para objetos muy pequeños o accedidos frecuentemente.",
    sourceUrl: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/intelligent-tiering-overview.html",
    sourceLabel: "AWS Docs — S3 Intelligent-Tiering",
  },
  {
    id: "playbook-ebs-snapshots",
    topic: "EBS — volúmenes huérfanos y gestión de snapshots",
    keywords: ["ebs", "volumen", "snapshot", "orphan", "huerfano", "lifecycle", "dlm", "data lifecycle manager", "eliminar volumen"],
    summary:
      "Los volúmenes EBS en estado 'available' (no adjuntos) siguen generando cargo. Los snapshots sin AMI asociada de más de 90 días son candidatos a eliminación.",
    detail:
      "Proceso seguro para volúmenes: listar con describe-volumes --filter status=available, " +
      "crear snapshot de respaldo, luego eliminar. " +
      "Para snapshots: Amazon Data Lifecycle Manager (DLM) automatiza creación, retención y eliminación. " +
      "NUNCA eliminar el snapshot más reciente de un volumen sin verificar que hay respaldo. " +
      "Los snapshots eliminados no se pueden recuperar.",
    sourceUrl: "https://docs.aws.amazon.com/ebs/latest/userguide/snapshot-ami-policy.html",
    sourceLabel: "AWS Docs — EBS snapshot lifecycle policy (Data Lifecycle Manager)",
  },
  {
    id: "playbook-nat-vpc-endpoints",
    topic: "NAT Gateway — reducir costos con VPC Endpoints",
    keywords: ["nat", "nat gateway", "vpc endpoint", "privatelink", "s3 gateway", "dynamodb", "salida internet"],
    summary:
      "El tráfico hacia S3 y DynamoDB que pasa por NAT Gateway paga 0,045 USD/GB en us-east-1 (varía por región). Con Gateway Endpoints, que no tienen cargo adicional, ese tráfico no pasa por NAT.",
    detail:
      "Los Gateway Endpoints de S3 y DynamoDB no tienen cargo adicional: ni por hora ni por GB. " +
      "Solo hay que crearlos en la VPC y actualizar las tablas de rutas de las subnets privadas. " +
      "IMPORTANTE: los Interface Endpoints (VPC PrivateLink), que son los que necesitas para el resto de servicios (SSM, ECR, Secrets Manager), " +
      "SÍ cobran por hora y por datos procesados — https://docs.aws.amazon.com/vpc/latest/privatelink/create-interface-endpoint.html. " +
      "No generalices a \"endpoints privados gratis\": en Azure (Private Endpoints) y en Google Cloud los equivalentes tampoco son gratuitos. " +
      "Tarifa NAT Gateway de referencia: 0,045 USD por GB procesado y 0,045 USD por hora en us-east-1 (2026-07-24); varía por región. " +
      "Verifica el tráfico real con VPC Flow Logs antes de asumir el % redirigible.",
    sourceUrl: "https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html",
    sourceLabel: "AWS Docs — Gateway endpoints for Amazon S3 and DynamoDB",
  },
  {
    id: "playbook-public-ipv4",
    topic: "IPs públicas IPv4 — cargo por dirección",
    keywords: ["ip", "ipv4", "publica", "elasticip", "elastic ip", "eip", "ip address", "cargo ip", "ip sin usar"],
    summary:
      "AWS cobra por todas las IPv4 públicas, tanto las adjuntas a instancias en ejecución como las Elastic IPs no asociadas. " +
      "La tarifa es la MISMA en ambos casos, así que la factura no permite distinguir una IP ociosa de una en uso.",
    detail:
      "Verificado en us-east-1 el 2026-07-24: USE1-PublicIPv4:IdleAddress y USE1-PublicIPv4:InUseAddress cuestan ambos 0,005 USD/hora. " +
      "Consecuencia práctica: dividir el gasto entre la tarifa cuenta IPv4 públicas facturadas, no direcciones desperdiciadas, así que hay que confirmarlo listando las que no tienen asociación. " +
      "Google Cloud sí diferencia y ahí la factura basta: una IP estática reservada sin usar cuesta 0,01 USD/hora frente a 0,005 en uso (us-central1). " +
      "Solución en AWS: liberar las EIP no usadas con aws ec2 release-address, o migrar a IPv6 donde sea posible. " +
      "Listar las candidatas: aws ec2 describe-addresses --query 'Addresses[?AssociationId==null]'.",
    sourceUrl: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-instance-addressing.html",
    sourceLabel: "AWS Docs — Direccionamiento de instancias y tarifas de IPv4 pública",
  },
  {
    id: "playbook-bedrock-batch",
    topic: "Amazon Bedrock — Batch Inference y prompt caching",
    keywords: ["bedrock", "batch inference", "batch", "prompt caching", "cache", "on-demand", "latencia", "costo ia"],
    summary:
      "Bedrock Batch Inference ofrece 50% de ahorro vs On-Demand para cargas que toleran procesamiento asíncrono (hasta 24 horas). Prompt caching reduce tokens repetidos en conversaciones largas.",
    detail:
      "Batch Inference: ideal para procesamiento masivo no urgente (clasificación de documentos, embeddings batch, evaluaciones). " +
      "Los trabajos pueden tardar hasta 24 horas; no apto para inferencia en tiempo real. " +
      "Prompt caching: almacena prefijos de prompt (system prompt, contexto largo) para reutilizarlos en llamadas sucesivas, reduciendo tokens de entrada. " +
      "Application inference profiles permiten asignar costos por equipo/proyecto mediante tags.",
    sourceUrl: "https://docs.aws.amazon.com/bedrock/latest/userguide/capacity-limits-cost-optimization.html",
    sourceLabel: "AWS Docs — Bedrock Batch Inference (50% descuento vs On-Demand verificado)",
  },
  {
    id: "playbook-bedrock-prompt-caching",
    topic: "Amazon Bedrock — prompt caching para reducir costos",
    keywords: ["bedrock", "prompt caching", "cache", "tokens", "contexto", "system prompt"],
    summary:
      "El prompt caching de Bedrock reutiliza prefijos de prompt cacheados en llamadas sucesivas, reduciendo tokens de entrada y latencia en aplicaciones conversacionales.",
    detail:
      "Los tokens de cache read son más baratos que los de input estándar. " +
      "Útil cuando el system prompt o el contexto es largo y se repite en muchas llamadas. " +
      "Soporta TTL de 5 minutos, 1 hora o caché automático según el modelo. " +
      "La documentación oficial detalla los parámetros y el comportamiento por modelo.",
    sourceUrl: "https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html",
    sourceLabel: "AWS Docs — Bedrock prompt caching",
  },
  {
    id: "playbook-bedrock-inference-profiles",
    topic: "Amazon Bedrock — application inference profiles para asignación de costos",
    keywords: ["bedrock", "inference profiles", "application inference", "cost allocation", "tagging", "atribucion costos ia"],
    summary:
      "Los application inference profiles de Bedrock permiten asignar costos de inferencia a equipos o proyectos mediante tags de asignación de costos.",
    detail:
      "Sin inference profiles, todo el gasto de Bedrock aparece como una sola línea sin distinción de aplicación. " +
      "Crear un profile por equipo/aplicación y usar ese profile ARN en las invocaciones permite ver el desglose en Cost Explorer. " +
      "Es el mecanismo oficial recomendado por AWS para cost attribution de IA.",
    sourceUrl: "https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-application-inference-profiles.html",
    sourceLabel: "AWS Docs — Bedrock application inference profiles",
  },
  {
    id: "playbook-sagemaker-serverless",
    topic: "SageMaker — Serverless Inference vs endpoints 24/7",
    keywords: ["sagemaker", "serverless", "endpoint", "inferencia", "24/7", "siempre activo", "intermitente"],
    summary:
      "SageMaker Serverless Inference elimina el costo de endpoints inactivos: pagas solo por las invocaciones. Ideal para tráfico intermitente; no recomendado para latencia constante baja.",
    detail:
      "Endpoints tradicionales (Real-time): instancias siempre activas, pago por hora aunque no haya tráfico. " +
      "Serverless Inference: escala a cero, pago solo por compute y tiempo de invocación. " +
      "Cold start de segundos puede ser inaceptable para aplicaciones interactivas. " +
      "Asynchronous Inference: para cargas con procesamiento mayor a 60 segundos, con cola SQS.",
    sourceUrl: "https://docs.aws.amazon.com/sagemaker/latest/dg/serverless-endpoints.html",
    sourceLabel: "AWS Docs — SageMaker Serverless Inference",
  },

  // ─── e) Límites del billing ───────────────────────────────────────────────
  {
    id: "billing-limits-utilization",
    topic: "Límites del billing — qué NO revela la factura",
    keywords: ["billing", "factura", "limitaciones", "cpu", "utilizacion", "memoria", "cloudwatch", "azure monitor", "cloud monitoring", "fuera de alcance"],
    summary:
      "La factura muestra horas encendidas y bytes transferidos, pero NO la utilización real (CPU, memoria, IOPS). Para saber si un recurso está sobredimensionado se necesitan métricas de monitoreo.",
    detail:
      "En AWS: CloudWatch proporciona CPUUtilization, NetworkPacketsIn, MemoryUtilization (con CloudWatch Agent), DiskReadOps. " +
      "En Azure: Azure Monitor ofrece Percentage CPU, Network In/Out, Disk Read/Write. " +
      "En GCP: Cloud Monitoring tiene CPU utilization, network bytes, disk throughput. " +
      "Un recurso con gasto estable puede estar al 5% de CPU — el billing no lo distingue de uno al 90%. " +
      "Por eso los hallazgos de 'revisión de utilización' tienen confianza 'fuera-de-alcance-del-billing'.",
    sourceUrl: "https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/getting-metric-statistics.html",
    sourceLabel: "AWS Docs — CloudWatch get-metric-statistics",
  },
  {
    id: "billing-limits-resources",
    topic: "Límites del billing — qué SÍ se puede saber desde la factura",
    keywords: ["billing", "factura", "que puedo saber", "confirmado", "recursos", "costo", "desglose"],
    summary:
      "La factura revela: qué servicios gastaron, cuánto, en qué región y por qué tipo de uso. Con FOCUS también el ResourceId de cada recurso y si está bajo un compromiso.",
    detail:
      "Datos disponibles en facturación: costo por servicio, región, tipo de uso, cuenta, fecha. " +
      "Con FOCUS: ResourceId (identifica el recurso exacto), ChargeCategory (tipo de cargo), CommitmentDiscountStatus. " +
      "Lo que no está en la factura: utilización de CPU/memoria, latencia, errores de aplicación, si un recurso es 'necesario' para el negocio. " +
      "Los hallazgos con confianza 'confirmado' en esta app usan solo datos presentes en la factura.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en documentación de tu proveedor",
  },
  {
    id: "app-confidence-levels",
    topic: "Metodología de la app — niveles de confianza de los hallazgos",
    keywords: ["confianza", "confirmado", "inferencia", "fuera de alcance", "metodologia", "como funciona", "niveles"],
    summary:
      "Los hallazgos tienen tres niveles de confianza: 'Confirmado con tus datos' (evidencia directa en la factura), 'Estimación — verifícala' (supuestos ajustables), 'Requiere métricas adicionales' (la factura no basta).",
    detail:
      "Confirmado: el dato está explícito en la factura (ej. EIP con cargo IdleAddress, gasto en Bedrock). " +
      "Inferencia: se aplica un supuesto porcentual (ej. 20% de volúmenes posiblemente sin adjuntar) — el usuario debe verificarlo. " +
      "Fuera de alcance del billing: requiere métricas de CloudWatch / Azure Monitor / Cloud Monitoring para confirmar (ej. instancias posiblemente subutilizadas). " +
      "Los rangos de ahorro (conservador–optimista) derivan de los sliders de supuestos en la pestaña Supuestos.",
    sourceUrl: null,
    sourceLabel: "Metodología de la app — documentación interna",
  },
  {
    id: "app-quick-win",
    topic: "Metodología de la app — qué es un quick win",
    keywords: ["quick win", "accion facil", "inmediata", "bajo esfuerzo", "bajo riesgo", "criterio", "50 dolares"],
    summary:
      "Un quick win es un hallazgo con esfuerzo bajo + riesgo bajo + ahorro moderado ≥ $50/mes. Son las acciones más fáciles de implementar con el mayor retorno inmediato.",
    detail:
      "Esfuerzo bajo: cambio sencillo, generalmente un comando CLI o configuración. " +
      "Riesgo bajo: acción reversible o sin impacto en disponibilidad. " +
      "Umbral de $50/mes: suficientemente relevante para justificar el tiempo de implementación. " +
      "Ejemplos típicos: liberar EIPs no usadas, habilitar S3 Intelligent-Tiering, configurar VPC Endpoints.",
    sourceUrl: null,
    sourceLabel: "Metodología de la app — documentación interna",
  },
  {
    id: "app-safe-remediation",
    topic: "Metodología de la app — flujo seguro de remediación",
    keywords: ["remediacion", "seguro", "flujo", "investigacion", "rollback", "irreversible", "antes de ejecutar"],
    summary:
      "El flujo seguro: primero comandos de investigación (solo lectura, no cambian nada), luego remediación opcional. Las acciones irreversibles llevan advertencia explícita.",
    detail:
      "Fase 1 — Investigación: comandos describe/list que solo consultan el estado actual sin modificar nada. " +
      "Fase 2 — Remediación: comandos de cambio, colapsados por defecto en la UI. Las acciones que no se pueden deshacer (delete-volume, delete-snapshot, release-address) llevan advertencia roja. " +
      "Siempre crear un respaldo (snapshot, AMI) antes de eliminar recursos. " +
      "El plan de rollback aparece ANTES de los comandos de cambio.",
    sourceUrl: null,
    sourceLabel: "Metodología de la app — documentación interna",
  },
  {
    id: "app-what-if",
    topic: "Metodología de la app — simulador What-If",
    keywords: ["what if", "simulador", "supuestos", "slider", "ajustar", "rango", "escenario"],
    summary:
      "El simulador What-If en cada hallazgo permite ajustar los supuestos (sliders) y ver el impacto en el ahorro estimado en tiempo real, sin llamadas al servidor.",
    detail:
      "Los rangos de ahorro (conservador–optimista) se calculan multiplicando el costo base por el rango del supuesto (mínimo–máximo). " +
      "El simulador recalcula con la misma fórmula del motor determinístico, solo cambiando el valor del slider. " +
      "Importante: los valores por defecto son conservadores y representan estimaciones editoriales; el usuario debe ajustarlos según su entorno real.",
    sourceUrl: null,
    sourceLabel: "Metodología de la app — documentación interna",
  },

  // ─── FinOps Framework — Principles ────────────────────────────────────────
  {
    id: "finops-principles",
    topic: "FinOps — 6 principios del framework",
    keywords: ["principios", "principles", "colaborar", "ownership", "centralizado", "variable cost", "business value", "datos accesibles"],
    summary:
      "Son 6 principios: colaboración entre equipos, ownership distribuido del propio uso, un equipo centralizado que impulsa la práctica, datos accesibles y oportunos, decisiones guiadas por valor de negocio y aprovechamiento del modelo de coste variable.",
    detail:
      "1. Los equipos colaboran: finanzas, ingeniería, producto y negocio. " +
      "2. Cada equipo asume el ownership del uso de tecnología que genera. " +
      "3. Un equipo centralizado lleva las tarifas, los compromisos y las buenas prácticas. " +
      "4. Los informes deben ser accesibles y llegar a tiempo para poder actuar. " +
      "5. Las decisiones se toman por valor de negocio, no solo por coste. " +
      "6. Se aprovecha la naturaleza variable del gasto: pago por uso y ajuste continuo. " +
      "Un matiz importante de la versión vigente del framework: el alcance ya no se limita a la nube pública, sino a la tecnología en general, incluyendo SaaS, licencias y data center propio.",
    sourceUrl: "https://www.finops.org/framework/principles/",
    sourceLabel: "FinOps Foundation — Principles",
  },
  {
    id: "finops-domains",
    topic: "FinOps — 4 Domains y 22 Capabilities",
    keywords: [
      "domains",
      "dominios",
      "understand",
      "quantify",
      "optimize",
      "manage",
      "capabilities",
      "22 capabilities",
      "estructura framework",
      "arbol dominios",
    ],
    summary:
      "El framework vigente tiene 4 Domains con 22 Capabilities en total, más Principles, Personas, Phases, Maturity Model, Scopes y Technology Categories. " +
      "Su alcance ya va más allá de la nube pública.",
    detail:
      "Understand Usage & Cost, con 4 capabilities: Data Ingestion, Allocation, Reporting & Analytics, Anomaly Management. " +
      "Quantify Business Value, con 5: Planning & Estimating, Forecasting, Budgeting, Unit Economics, KPIs & Benchmarking. " +
      "Optimize Usage & Cost, con 5: Architecting & Workload Placement, Usage Optimization, Rate Optimization, Licensing & SaaS, Sustainability. " +
      "Manage the FinOps Practice, con 8: FinOps Practice Operations, FinOps Education & Enablement, Governance Policy & Risk, Automation Tools & Services, Invoicing & Chargeback, Intersecting Disciplines, Executive Strategy Alignment, FinOps Assessment. " +
      "Detalles que suelen confundirse: Invoicing & Chargeback pertenece a Manage the FinOps Practice y no a Understand, Sustainability vive en Optimize, y Executive Strategy Alignment es la capability añadida en 2026.",
    sourceUrl: "https://www.finops.org/framework/",
    sourceLabel: "FinOps Foundation — Framework",
  },
  {
    id: "finops-scopes",
    topic: "FinOps — Scopes frente a Technology Categories",
    keywords: [
      "scopes",
      "scope",
      "technology categories",
      "categorias tecnologicas",
      "diferencia scopes",
      "saas",
      "data center",
      "licencias",
      "alcance",
    ],
    summary:
      "Los Scopes son cortes de negocio del gasto tecnológico y las Technology Categories son la clasificación técnica. No son lo mismo y no son mutuamente excluyentes.",
    detail:
      "Un Scope puede cruzar varias Technology Categories: por ejemplo, un mismo ámbito de negocio puede incluir a la vez servicios de nube pública, SaaS y capacidad de data center. " +
      "El error habitual es tratar los Scopes como una taxonomía cerrada y forzar cada línea de gasto a uno solo, cuando la intención es justamente permitir vistas solapadas según la pregunta de negocio. " +
      "Al diseñar informes conviene decidir primero si la pregunta es de negocio, y entonces se usa Scope, o técnica, y entonces se usa Technology Category.",
    sourceUrl: "https://www.finops.org/framework/scopes/",
    sourceLabel: "FinOps Foundation — Scopes",
  },
  {
    id: "finops-optimizar-antes-de-comprometer",
    topic: "FinOps — optimizar el uso antes de comprometer tarifa",
    keywords: [
      "optimizar antes de comprometer",
      "antes de comprar savings plans",
      "orden recomendado",
      "secuencia",
      "rightsizing primero",
      "comprometer tarifa",
      "usage optimization",
      "rate optimization",
      "linea base inflada",
      "sobrecomprometido",
    ],
    summary:
      "La secuencia recomendada es optimizar el uso y después comprometer tarifa. Comprar Savings Plans o reservas antes de hacer rightsizing te deja comprometido de más sobre una línea base inflada.",
    detail:
      "Usage Optimization y Rate Optimization son capabilities distintas dentro de Optimize Usage & Cost, y el orden entre ellas importa. Si primero compras compromiso sobre el consumo actual y después reduces ese consumo, la capacidad comprometida sobrante se convierte en desperdicio que no puedes cancelar. " +
      "Secuencia práctica: apagar lo que no se usa, dimensionar lo que queda, medir la nueva línea base durante un periodo estable y solo entonces comprar compromiso sobre la parte predecible. " +
      "Si ya tienes compromiso previo, haz el rightsizing por tramos y vigila la utilización del compromiso para no dejarlo por debajo del umbral en que empieza a costar dinero.",
    sourceUrl: "https://www.finops.org/framework/",
    sourceLabel: "FinOps Foundation — Framework (Optimize Usage & Cost)",
  },
  {
    id: "finops-personas",
    topic: "FinOps — Personas y roles",
    keywords: ["personas", "roles", "practitioner", "executive", "engineering", "finance", "procurement", "responsable"],
    summary:
      "FinOps requiere colaboración de múltiples personas: Practitioner (coordina), Executive (prioridades), Engineering (ownership de uso), Finance (forecast), Procurement (contratos y compromisos).",
    detail:
      "FinOps Practitioner: analiza costos, identifica oportunidades, comunica a stakeholders. " +
      "Executive (CFO, CTO): prioridades de optimización, aprueba compromisos de descuento. " +
      "Engineering: toma decisiones de arquitectura con conciencia de costo; ownership distribuido. " +
      "Finance: gestiona presupuestos, chargeback, forecasting. " +
      "Procurement: negocia contratos cloud, gestiona EAs y EDPs. " +
      "Allied Personas: ITAM, ITFM, Sustainability, Security, ITSM.",
    sourceUrl: "https://www.finops.org/framework/personas/",
    sourceLabel: "FinOps Foundation — Personas",
  },
  {
    id: "finops-maturity",
    topic: "FinOps — Niveles de madurez: Crawl, Walk, Run",
    keywords: ["madurez", "crawl", "walk", "run", "nivel", "adopcion", "avanzado", "basico", "iterativo"],
    summary:
      "El modelo de madurez FinOps tiene tres niveles: Crawl (visibilidad básica), Walk (optimización sistemática), Run (cultura establecida y automatización). Se avanza iterativamente por dominio.",
    detail:
      "Crawl: primera visibilidad de costos, asignación manual, showback básico, pocos descuentos. " +
      "Walk: tagging automatizado, chargeback a equipos, algunos Savings Plans/RIs, anomaly detection, KPIs definidos. " +
      "Run: FinOps embebido en el SDLC, unit economics por producto, rightsizing automatizado, forecasting preciso, benchmarking externo. " +
      "Las organizaciones iteran Crawl→Walk→Run en cada Domain de forma independiente.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en finops.org/framework/maturity-model/",
  },
  {
    id: "finops-kpis",
    topic: "FinOps — KPIs clave: effective savings rate, coverage, utilization",
    keywords: ["kpi", "metricas", "savings rate", "coverage", "utilization", "tasa ahorro", "cobertura", "utilizacion compromiso"],
    summary:
      "KPIs FinOps: Effective Savings Rate (% ahorrado con compromisos), Coverage (% del gasto elegible cubierto por descuentos), Utilization (% del compromiso que se está usando).",
    detail:
      "Effective Savings Rate = (On-Demand - Effective Cost) / On-Demand. Mide el ahorro real respecto al precio de tarifa. " +
      "Coverage = gasto cubierto por Savings Plans/RIs / gasto total elegible. Objetivo típico: >70%. " +
      "Utilization = horas/capacidad usada del compromiso / horas/capacidad comprometida. Si cae <80%, el SP/RI genera desperdicio. " +
      "Todos estos KPIs se consultan en AWS Cost Explorer bajo Savings Plans → Coverage/Utilization.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en AWS Cost Explorer y documentación de Savings Plans",
  },
  // ─── FOCUS a fondo ────────────────────────────────────────────────────────
  {
    id: "focus-governance",
    topic: "FOCUS — gobernanza, versionado y lenguaje normativo",
    keywords: [
      "focus",
      "gobernanza",
      "governance",
      "linux foundation",
      "open billing",
      "steering committee",
      "versionado",
      "semver",
      "lenguaje normativo",
      "bcp 14",
      "must should may",
    ],
    summary:
      "FOCUS nació en el working group Open Billing de la FinOps Foundation y desde enero de 2023 es un proyecto propio bajo la Linux Foundation. " +
      "Cada versión la ratifica el FOCUS Steering Committee y el lenguaje normativo se limita a un subconjunto de BCP 14.",
    detail:
      "El versionado se inspira en SemVer, pero el propio repositorio advierte que el número de versión no es una garantía estricta de compatibilidad: hay que leer el changelog antes de asumir que un parser sigue sirviendo. " +
      "Los únicos verbos normativos admitidos son MUST, MUST NOT, SHOULD, SHOULD NOT y MAY, lo que hace que el nivel de exigencia de cada columna se pueda deducir del texto. " +
      "La especificación se desarrolla en abierto en GitHub y cualquier proveedor puede implementarla; algunas adopciones añaden columnas propias, como el export de AWS con sus columnas nativas.",
    sourceUrl: "https://github.com/FinOps-Open-Cost-and-Usage-Spec/FOCUS_Spec",
    sourceLabel: "FinOps Foundation — repositorio de la especificación FOCUS",
  },
  {
    id: "focus-versiones-cronologia",
    topic: "FOCUS — cronología de versiones y qué cambió en 1.4",
    keywords: [
      "focus 1.4",
      "focus 1.3",
      "focus 1.2",
      "focus 1.0",
      "version focus",
      "versiones",
      "cronologia",
      "changelog",
      "que cambio en focus",
      "cambios focus",
      "providername",
      "publishername",
      "serviceprovidername",
      "hostprovidername",
    ],
    summary:
      "Cronología: 0.5 (jun 2023), 1.0-preview (nov 2023), 1.0 (jun 2024, primera de producción), 1.1 (nov 2024), 1.2 (may 2025), 1.3 (dic 2025) y 1.4, ratificada el 4 de junio de 2026 y vigente. " +
      "La 1.4 no introdujo cambios incompatibles.",
    detail:
      "El cambio de 1.4 que más afecta a un parser es la eliminación de ProviderName y PublisherName. Sus sucesores son ServiceProviderName, que identifica a quien pone el servicio a disposición, y HostProviderName, que identifica la infraestructura subyacente, junto a InvoiceIssuerName para el emisor de la factura. " +
      "Un archivo 1.0 a 1.2 seguirá trayendo ProviderName y uno 1.4 no, así que conviene aceptar ambos nombres al leer. " +
      "Recuerda que los proveedores van por detrás: el techo real que publican hoy es 1.2, de modo que estos nombres nuevos aparecerán antes en documentación que en tus archivos.",
    sourceUrl: "https://focus.finops.org/focus-specification/",
    sourceLabel: "FinOps Foundation — FOCUS Specification (versiones)",
  },
  {
    id: "focus-datasets",
    topic: "FOCUS 1.4 — los cuatro datasets y los niveles de exigencia",
    keywords: [
      "datasets",
      "dataset",
      "costandusage",
      "cost and usage",
      "billingperiod",
      "contractcommitment",
      "invoicedetail",
      "65 columnas",
      "mandatory",
      "conditional",
      "recommended",
      "optional",
      "obligatoria",
      "nulos",
      "chargeclass",
    ],
    summary:
      "FOCUS 1.4 define cuatro datasets: CostAndUsage, obligatorio y transaccional con 65 columnas, más BillingPeriod, ContractCommitment e InvoiceDetail, que son condicionales y de referencia.",
    detail:
      "El nivel de exigencia de cada columna se deriva del verbo normativo: Mandatory cuando es un MUST sin condiciones, Conditional cuando es un MUST sujeto a condiciones, Recommended con SHOULD y Optional con MAY. " +
      "Ortogonal a eso está si la columna admite nulos: hay columnas Mandatory que sí los admiten, y ChargeClass es el ejemplo típico. Confundir ambas cosas lleva a validadores que rechazan archivos correctos. " +
      "En la práctica, un parser robusto valida presencia de columna y validez de valor por separado, y nunca asume que Mandatory implica valor no nulo en todas las filas.",
    sourceUrl: "https://focus.finops.org/focus-specification/",
    sourceLabel: "FinOps Foundation — FOCUS Specification",
  },
  {
    id: "focus-formato-datos",
    topic: "FOCUS — reglas de formato: periodos, fechas, moneda, nulos y columnas x_",
    keywords: [
      "formato",
      "periodos",
      "chargeperiodstart",
      "chargeperiodend",
      "between",
      "cota exclusiva",
      "iso 8601",
      "utc",
      "iso 4217",
      "moneda",
      "currency",
      "moneda virtual",
      "nulos",
      "null",
      "cadena vacia",
      "columnas personalizadas",
      "prefijo x_",
    ],
    summary:
      "Los periodos FOCUS tienen cota inicial inclusiva y final exclusiva, así que un filtro correcto usa >= inicio AND < fin. " +
      "Las fechas van en UTC ISO 8601 terminando en Z y la moneda con código ISO 4217 de tres letras.",
    detail:
      "Usar BETWEEN sobre los periodos duplica el registro del borde, porque incluye el instante final que la especificación considera fuera del intervalo. Es la causa más común de totales inflados al comparar periodos consecutivos. " +
      "La moneda contempla también moneda virtual, como créditos o tokens, con su propio código. Los nulos deben ser nulos de verdad: está prohibido usar cadena vacía o un cero como marcador de ausencia, porque un cero es un importe válido y falsea las agregaciones. " +
      "Cualquier columna que un proveedor añada por su cuenta debe llevar el prefijo x_, lo que permite distinguir de un vistazo lo estándar de lo propietario.",
    sourceUrl: "https://focus.finops.org/focus-columns/",
    sourceLabel: "FinOps Foundation — FOCUS Columns",
  },
  {
    id: "focus-use-cases",
    topic: "FOCUS — casos de uso oficiales con queries SQL",
    keywords: [
      "casos de uso",
      "use cases",
      "queries",
      "sql",
      "reconciliacion de facturas",
      "cobertura de tags",
      "effective savings rate",
      "burn-down",
      "compromisos sin usar",
      "gasto anomalo",
      "moneda virtual",
      "unit economics focus",
    ],
    summary:
      "FOCUS publica 59 casos de uso agrupados por capability, cada uno con queries SQL predefinidas sobre el esquema estándar. Sirven como punto de partida verificado en lugar de escribir análisis desde cero.",
    detail:
      "Entre los casos publicados están la reconciliación de facturas, la cobertura de tags, el Effective Savings Rate, el burn-down de compromisos, la detección de compromisos y reservas de capacidad sin usar, el gasto diario anómalo, el consumo y la previsión de moneda virtual, y el unit economics. " +
      "Al estar escritos sobre columnas estándar, la misma consulta funciona con datos de cualquier proveedor conforme, lo que convierte esta colección en la forma más rápida de validar que tu pipeline FOCUS produce números correctos.",
    sourceUrl: "https://focus.finops.org/use-cases/",
    sourceLabel: "FinOps Foundation — FOCUS Use Cases",
  },
  {
    id: "focus-all-columns",
    topic: "FOCUS — columnas obligatorias completas",
    keywords: ["focus", "columnas", "billingaccountid", "chargeperiodstart", "chargeperiodend", "chargefrequency", "listcost", "listunitprice", "pricingquantity", "skuid", "skupriceid", "invoiceissuername"],
    summary:
      "FOCUS define columnas agrupadas en: identidad (BillingAccountId), tiempo (ChargePeriodStart/End), costo (BilledCost, EffectiveCost, ListCost), pricing (PricingQuantity, ListUnitPrice), SKU (SkuId, SkuPriceId), proveedor (ProviderName, InvoiceIssuerName).",
    detail:
      "Identidad/cuenta: BillingAccountId (ID de la cuenta de facturación), BillingPeriodStart/End (mes de facturación). " +
      "Tiempo de uso: ChargePeriodStart/End (ventana exacta del cargo). " +
      "Costos: BilledCost (importe real facturado), EffectiveCost (costo amortizado con compromisos), ListCost (precio de lista sin descuentos). " +
      "Pricing: ListUnitPrice (precio por unidad), PricingQuantity/PricingUnit (cantidad y unidad de precio). " +
      "SKU/servicio: SkuId, SkuPriceId, ChargeDescription (descripción legible del cargo). " +
      "Proveedor: hasta 1.3 se usaban ProviderName y PublisherName; en 1.4 se eliminaron y los sustituyen ServiceProviderName, HostProviderName e InvoiceIssuerName.",
    sourceUrl: "https://focus.finops.org/focus-columns/",
    sourceLabel: "FinOps Foundation — FOCUS Columns",
  },
  {
    id: "focus-commitment-columns",
    topic: "FOCUS — columnas de compromisos (CommitmentDiscount*)",
    keywords: ["focus", "commitment", "commitmentdiscountid", "commitmentdiscountstatus", "commitmentdiscounttype", "savings plan", "reserved instance", "cud"],
    summary:
      "FOCUS normaliza los compromisos de descuento (RI, SP, CUD) con columnas CommitmentDiscount*: id del compromiso, estado (Used/Unused), tipo (Recurring/Upfront) y nombre.",
    detail:
      "CommitmentDiscountId: identificador del compromiso que cubrió ese cargo. Si vacío, el cargo no está cubierto. " +
      "CommitmentDiscountStatus: 'Used' (el cargo fue cubierto) o 'Unused' (capacidad del compromiso no utilizada — desperdicio). " +
      "CommitmentDiscountType: categoría del compromiso (ej. 'Savings Plan', 'Reserved Capacity', 'Committed Use Discount'). " +
      "CommitmentDiscountName: nombre legible del compromiso. " +
      "Estas columnas permiten calcular Coverage y Utilization con un solo query SQL independiente del proveedor.",
    sourceUrl: "https://focus.finops.org/",
    sourceLabel: "FinOps Foundation — FOCUS Specification",
  },
  {
    id: "focus-vs-cur",
    topic: "FOCUS vs CUR clásico de AWS — por qué elegir FOCUS",
    keywords: ["focus", "cur", "cost and usage report", "diferencia", "multi-nube", "migracion", "ventaja"],
    summary:
      "CUR (Cost and Usage Report) es el formato nativo de AWS. FOCUS es el estándar multi-nube. Para cuentas solo AWS, ambos funcionan. Para multi-nube, FOCUS elimina la necesidad de ETLs por proveedor.",
    detail:
      "CUR tiene columnas específicas de AWS (lineitem/usagetype, product/ProductName, etc.) que no tienen equivalente en Azure ni GCP. " +
      "FOCUS mapea todos los proveedores al mismo esquema: ServiceCategory, ServiceName, BilledCost, ChargePeriodStart. " +
      "Con FOCUS puedes escribir un solo query SQL que compare gasto AWS vs Azure vs GCP sin joins complicados. " +
      "AWS ofrece CUR 2.0 (nueva generación) y FOCUS 1.0/1.2 with AWS columns: ambos como Data Exports en S3.",
    sourceUrl: "https://docs.aws.amazon.com/cur/latest/userguide/what-is-data-exports.html",
    sourceLabel: "AWS Docs — What is AWS Data Exports",
  },

  // ─── Azure a fondo ────────────────────────────────────────────────────────
  {
    id: "azure-cost-management",
    topic: "Azure Cost Management + Billing — visibilidad de costos",
    keywords: ["azure", "cost management", "billing", "portal", "dashboard", "analisis costos", "azure portal"],
    summary:
      "Azure Cost Management + Billing es la herramienta nativa de Microsoft para visualizar, analizar y gestionar el gasto en Azure. Incluye Cost Analysis, Budgets, Exports y Azure Advisor.",
    detail:
      "Cost Analysis: dashboards interactivos de gasto por suscripción, grupo de recursos, servicio, tag. Permite crear vistas personalizadas y exportarlas. " +
      "Soporta chargeback con cost allocation rules para distribuir costos compartidos entre departamentos. " +
      "Los exports van a Azure Storage (Blob), pueden configurarse en formato FOCUS. " +
      "Se accede desde portal.azure.com → Cost Management + Billing.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en portal.azure.com o documentación de Azure Cost Management",
  },
  {
    id: "azure-advisor",
    topic: "Azure Advisor — recomendaciones de costo nativas",
    keywords: ["azure", "advisor", "recomendaciones", "rightsizing", "vm", "discos", "ip publica", "optimizacion nativa"],
    summary:
      "Azure Advisor es el motor de recomendaciones nativo de Azure. En la categoría Cost detecta: VMs sobredimensionadas, discos no adjuntos, IPs públicas sin usar, recursos sin actividad.",
    detail:
      "Rightsizing de VMs: Advisor analiza CPU, memoria y red de los últimos 7-30 días y sugiere tipos de VM más pequeños o apagado. " +
      "Discos no adjuntos (Unattached Managed Disks): equivalente al hallazgo de EBS unattached de nuestra app. " +
      "IPs públicas no asociadas: equivalente a EIPs de AWS. " +
      "Las recomendaciones incluyen ahorro mensual estimado y el impacto en el rendimiento. " +
      "Se accede desde portal.azure.com → Advisor → Cost.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en portal.azure.com/Advisor",
  },
  {
    id: "azure-reservations-vs-savings-plans",
    topic: "Azure Reservations vs Azure Savings Plans for Compute",
    keywords: ["azure", "reservations", "savings plans", "compute", "vm", "sql database", "diferencia", "compromiso azure"],
    summary:
      "Azure Reservations: descuento en un recurso específico (VM familia/región). Azure Savings Plans for Compute: descuento flexible en cualquier VM (cambia tamaño, región, OS). Hasta 65-72% de ahorro vs Pay-As-You-Go.",
    detail:
      "Azure Reservations: mejor descuento, pero atado a familia de VM y región. Cancelables con penalización. Disponibles para VMs, SQL Database, Cosmos DB, Redis, Synapse, Databricks. " +
      "Azure Savings Plans for Compute: menor descuento que RI pero aplica a cualquier VM incluyendo cambios de tamaño y región. Similar a AWS Compute Savings Plans. " +
      "Regla general: si tienes cargas estables y predecibles → Reservations; si tienes cargas que escalan o migran → Savings Plans. " +
      "Ambos se compran en el portal o con la API y se pueden ver en Cost Management → Reservations.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en docs.microsoft.com/azure/cost-management-billing",
  },
  {
    id: "azure-tagging",
    topic: "Azure — Cost allocation con tags en Cost Management",
    keywords: ["azure", "tags", "etiquetas", "cost allocation", "chargeback", "departamento", "proyecto", "azure cost management"],
    summary:
      "Los tags de Azure se usan para asignar costos a departamentos y proyectos. En Cost Management se puede filtrar y agrupar el gasto por cualquier tag activado como cost allocation tag.",
    detail:
      "Para que los tags aparezcan en Cost Analysis deben estar activados como cost allocation tags en Cost Management Settings. " +
      "Azure permite hasta 50 tags por recurso. Los tags no se heredan automáticamente a recursos hijos — hay que usar Azure Policy para enforcement. " +
      "Tags recomendados típicos: environment (prod/dev/staging), owner, cost-center, project, application. " +
      "Azure Cost Management soporta cost allocation rules para distribuir costos de recursos compartidos (VPN Gateway, Log Analytics) a las suscripciones que los usan.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en docs.microsoft.com/azure/cost-management-billing/costs/allocate-costs",
  },
  {
    id: "azure-budgets",
    topic: "Azure Budgets y alertas de costo",
    keywords: ["azure", "budgets", "presupuesto", "alertas", "notificacion", "gasto", "limite"],
    summary:
      "Azure Budgets permite configurar límites de gasto y alertas por email cuando el gasto actual o proyectado alcanza un umbral. Puede aplicarse a suscripción, grupo de recursos o tag.",
    detail:
      "Los budgets pueden ser mensuales, trimestrales o anuales. Las alertas se envían cuando el gasto alcanza el 50%, 75%, 90% o el 100% del presupuesto configurado. " +
      "También soporta alertas de forecast (gasto proyectado). " +
      "Se puede conectar a Azure Action Groups para automatizar respuestas (ej. apagar VMs no críticas al alcanzar el 100%). " +
      "Se accede desde Cost Management + Billing → Budgets.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en portal.azure.com o docs.microsoft.com/azure/cost-management-billing",
  },
  {
    id: "azure-hybrid-benefit",
    topic: "Azure Hybrid Benefit — licencias existentes en la nube",
    keywords: ["azure", "hybrid benefit", "licencias", "windows server", "sql server", "on-premises", "ahorro licencia"],
    summary:
      "Azure Hybrid Benefit permite usar licencias de Windows Server y SQL Server on-premises (con Software Assurance) en Azure sin pagar el costo de licencia adicional. Ahorro de hasta 40%.",
    detail:
      "Si una empresa tiene licencias de Windows Server o SQL Server con Software Assurance activo, puede aplicarlas a las VMs de Azure eliminando el cargo de licencia. " +
      "Disponible también para Red Hat y SUSE Linux en ciertos casos. " +
      "Se activa a nivel de VM en el portal o con CLI. " +
      "Combinado con Reserved Instances, puede llevar el ahorro total a >70% vs tarifa base. " +
      "Es uno de los ahorros con mayor impacto para empresas con parque grande de Windows/SQL.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en azure.microsoft.com/pricing/hybrid-benefit/",
  },

  // ─── GCP a fondo ─────────────────────────────────────────────────────────
  {
    id: "gcp-billing-bigquery",
    topic: "GCP — Cloud Billing reports y BigQuery export",
    keywords: ["gcp", "google cloud", "billing", "bigquery", "export", "reportes", "facturacion"],
    summary:
      "GCP exporta datos de billing a BigQuery para análisis avanzado. Los Cloud Billing Reports en la consola ofrecen visibilidad básica por servicio, proyecto y label.",
    detail:
      "Cloud Billing Reports (console): dashboards de gasto por proyecto, servicio, SKU, región y label. Permite filtros y comparaciones mensuales. " +
      "BigQuery export: exporta cada línea de billing al dataset de BigQuery para queries SQL personalizados. Ideal para FOCUS y análisis multi-cuenta. " +
      "Para activar el export: Cloud Console → Billing → Billing export → BigQuery export. " +
      "El esquema de BigQuery incluye campos como service.description, sku.description, usage.amount, cost, labels — equivalentes a las columnas FOCUS.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en cloud.google.com/billing/docs/how-to/export-data-bigquery",
  },
  {
    id: "gcp-recommender",
    topic: "GCP Recommender — recomendaciones de costo nativas",
    keywords: ["gcp", "recommender", "recomendaciones", "rightsizing", "vm", "idle", "disco persistente", "cloud sql"],
    summary:
      "GCP Recommender proporciona recomendaciones de rightsizing para Compute Engine VMs, Cloud SQL, discos persistentes no usados e instancias inactivas. Similar a AWS Compute Optimizer.",
    detail:
      "VM rightsizing: analiza CPU y memoria de los últimos 8 días y sugiere tipos de máquina más pequeños. " +
      "Idle VMs: VMs con CPU <0.03 vCPU y sin tráfico durante los últimos 15 días. " +
      "Unused persistent disks: discos no adjuntos a ninguna instancia. " +
      "Cloud SQL idle instances: bases de datos sin conexiones durante 7 días. " +
      "Se accede desde Cloud Console → Recommender o con la API gcloud recommender recommendations list.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en cloud.google.com/recommender/docs",
  },
  {
    id: "gcp-cuds",
    topic: "GCP — Committed Use Discounts (CUDs): resource-based vs spend-based",
    keywords: ["gcp", "cud", "committed use", "descuento", "compromiso", "resource based", "spend based", "1 ano", "3 anos"],
    summary:
      "GCP ofrece dos tipos de CUDs: Resource-based (compromiso de vCPU/memoria en una región) y Spend-based (compromiso de gasto por hora en un servicio). Descuento de hasta 57% a 1 año, 70% a 3 años.",
    detail:
      "Resource-based CUDs: compromiso de vCPU y memoria específicos en una región. Más descuento, pero menos flexibles. Ideal para cargas de trabajo con tamaño fijo. " +
      "Spend-based CUDs: compromiso de gasto mínimo por hora en Cloud SQL o VMware Engine. Más flexibles. " +
      "Los CUDs se compran en Cloud Console → Committed Use Discounts. Son contratos de 1 o 3 años, no cancelables. " +
      "A diferencia de AWS, GCP también tiene Sustained Use Discounts (SUDs) automáticos sin compromiso.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en cloud.google.com/compute/docs/instances/signing-up-committed-use-discounts",
  },
  {
    id: "gcp-sustained-use",
    topic: "GCP — Sustained Use Discounts (SUDs): descuento automático sin compromiso",
    keywords: ["gcp", "sustained use", "descuento automatico", "sin compromiso", "compute engine", "uso continuo"],
    summary:
      "GCP aplica automáticamente Sustained Use Discounts a las VMs de Compute Engine según el porcentaje del mes que estuvieron encendidas, sin que el usuario tenga que hacer nada. Hasta 30% de descuento.",
    detail:
      "Los SUDs se aplican de forma incremental: 0-25% del mes = sin descuento; 25-50% = 20%; 50-75% = 40%; 75-100% = 60% (sobre el precio por hora extra). " +
      "El descuento efectivo para una VM siempre activa es aproximadamente 30% vs precio On-Demand base. " +
      "Los SUDs son exclusivos de Compute Engine (N1, N2, C2, etc.) y no aplican a preemptible VMs, E2, ni Cloud SQL. " +
      "Son automáticos: GCP los aplica sin configuración adicional.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en cloud.google.com/compute/docs/sustained-use-savings",
  },
  {
    id: "gcp-labels-budgets",
    topic: "GCP — Labels y Budget alerts",
    keywords: ["gcp", "labels", "etiquetas", "budget", "alerta", "presupuesto", "cost allocation", "proyecto"],
    summary:
      "GCP usa labels (key:value) en recursos para asignación de costos. Los Google Cloud Budgets permiten configurar alertas por suscripción de facturación, proyecto, servicio o label.",
    detail:
      "Labels en GCP: se aplican a VMs, buckets, clusters, etc. Las labels aparecen en el BigQuery billing export y en Cloud Billing Reports. " +
      "Límite: 64 labels por recurso. Recomendados: env, team, cost-center, project. " +
      "Google Cloud Budgets: configura umbrales (50%, 90%, 100%, 110%) con notificaciones a email o Pub/Sub. " +
      "Pub/Sub permite automatizar respuestas: ej. apagar VMs no críticas cuando se alcanza el 100% del presupuesto. " +
      "Acceso: Cloud Console → Billing → Budgets & alerts.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en cloud.google.com/billing/docs/how-to/budgets",
  },

  // ─── Costos de IA / LLM ───────────────────────────────────────────────────
  {
    id: "ai-cost-model",
    topic: "Costos de IA/LLM — modelo de facturación por tokens",
    keywords: ["ia", "llm", "tokens", "facturacion", "input tokens", "output tokens", "inferencia", "modelo de costo"],
    summary:
      "La IA se factura por tokens y no por horas. Los tokens de entrada se facturan a una tarifa más baja que los generados, y la unidad habitual de precio es el millón de tokens.",
    detail:
      "Los tokens de entrada son el texto que envías al modelo: instrucciones de sistema, historial y pregunta. Los generados son la respuesta, y salen más caros porque se producen de forma secuencial. " +
      "Al cambiar la unidad de medida, cambian también las palancas de optimización: aquí no hay nada que apagar por la noche, lo que se recorta es contexto repetido, longitud de respuesta y llamadas innecesarias al modelo. " +
      "Para el precio exacto de cada modelo consulta siempre su página de precios, porque varía por modelo, por región y por modalidad de servicio.",
    sourceUrl: "https://www.finops.org/wg/finops-for-ai-overview/",
    sourceLabel: "FinOps Foundation — FinOps for AI Overview",
  },
  {
    id: "ai-cost-strategies",
    topic: "Estrategias de reducción de costo en IA/LLM",
    keywords: ["ia", "llm", "costo", "reducir", "prompt caching", "model routing", "context window", "fine-tuning", "batch"],
    summary:
      "Las principales estrategias: prompt caching (reusar contexto repetido), batch processing (50% descuento en Bedrock), model routing (modelo pequeño para tareas simples), context window management.",
    detail:
      "Prompt caching: cachea el system prompt o contexto largo para no re-tokenizarlo en cada llamada. Ahorra input tokens en conversaciones largas. " +
      "Model routing: usar modelos más pequeños (o más baratos) para tareas de clasificación o extracción simple, y modelos grandes solo cuando es necesario. " +
      "Context window management: truncar o resumir el historial de conversación para no crecer indefinidamente. " +
      "Batch processing: procesar en lotes asíncronos (hasta 24 horas) en vez de On-Demand; 50% de descuento en Bedrock (verificado). " +
      "Fine-tuning vs prompting: para tareas muy repetitivas, fine-tuning puede reducir el tamaño del prompt necesario — pero tiene costo inicial.",
    sourceUrl: "https://docs.aws.amazon.com/bedrock/latest/userguide/capacity-limits-cost-optimization.html",
    sourceLabel: "AWS Docs — Bedrock cost optimization (Batch Inference 50% verificado)",
  },
  {
    id: "ai-cost-metrics",
    topic: "Métricas de coste de IA — coste por inferencia, coste por token y ROI",
    keywords: [
      "metricas ia",
      "coste por token",
      "costo por token",
      "coste por inferencia",
      "costo por inferencia",
      "costo por request",
      "coste por llamada api",
      "millon tokens",
      "mtok",
      "unit economics ia",
      "eficiencia entrenamiento",
      "utilizacion recursos",
      "tiempo hasta el primer prompt",
      "roi ia",
    ],
    summary:
      "Métricas oficiales de FinOps para IA con su fórmula: coste por inferencia, coste por token, eficiencia de coste de entrenamiento, eficiencia de utilización de recursos, coste por llamada API, tiempo hasta el primer prompt y ROI.",
    detail:
      "Coste por inferencia = coste total dividido entre el número de peticiones. Coste por token = coste total dividido entre el número de tokens. Eficiencia de coste de entrenamiento = coste de entrenamiento dividido entre una métrica de rendimiento del modelo. Eficiencia de utilización de recursos = utilización real dividida entre capacidad aprovisionada. " +
      "El coste por llamada API y el tiempo hasta el primer prompt miden respectivamente el gasto por integración y la velocidad con la que un equipo llega a producir valor; el ROI cierra el conjunto conectando el gasto con el retorno de negocio. " +
      "Para calcular cualquiera de ellas hace falta atribución fiable: en Bedrock eso significa application inference profiles o tags de asignación de costes, porque muchos SKUs de IA no soportan etiquetado nativo.",
    sourceUrl: "https://www.finops.org/wg/finops-for-ai-overview/",
    sourceLabel: "FinOps Foundation — FinOps for AI Overview",
  },
  {
    id: "finops-for-ai",
    topic: "FinOps for AI — por qué el gasto de IA es distinto",
    keywords: [
      "finops ia",
      "finops ai",
      "gasto ia",
      "costos ia",
      "llm costos",
      "gestion costos ia",
      "foundation models",
      "atribucion ia",
      "etiquetado ia",
      "entrenamiento continuo",
      "showback ia",
      "chargeback ia",
    ],
    summary:
      "FinOps for AI extiende la práctica al gasto de modelos y servicios de IA. Cambia la unidad de medida, la atribución es más difícil y la calidad del modelo entra como dimensión de decisión junto al coste.",
    detail:
      "Diferencias concretas: la unidad son tokens y no horas; los tokens de entrada se facturan más baratos que los generados y se cobran por millón; muchos SKUs nuevos de IA no soportan etiquetado nativo, lo que rompe la atribución por equipo; el entrenamiento continuo es coste recurrente y no un proyecto puntual; y la calidad del resultado se convierte en una variable de decisión más, porque el modelo más barato no siempre resuelve la tarea. " +
      "Recomendación de gobierno para empezar: showback antes que chargeback. Usar la visibilidad como herramienta de concienciación durante los primeros meses evita la fricción de cobrar sobre datos de atribución que todavía son incompletos.",
    sourceUrl: "https://www.finops.org/wg/finops-for-ai-overview/",
    sourceLabel: "FinOps Foundation — FinOps for AI Overview",
  },
  // ─── Gobernanza y operación ───────────────────────────────────────────────
  {
    id: "tagging-strategy",
    topic: "Estrategia de tagging/labeling — base del chargeback",
    keywords: ["tagging", "labeling", "etiquetas", "tags", "estrategia", "owner", "environment", "cost-center", "project", "obligatorio"],
    summary:
      "El tagging es la base de toda asignación de costos. Sin tags consistentes no hay chargeback ni showback fiable. Los tags mínimos recomendados: owner, environment, cost-center, project.",
    detail:
      "Tags obligatorios típicos en organizaciones FinOps maduras: " +
      "owner (equipo o persona responsable), environment (prod/staging/dev/test), cost-center (código de centro de costo), project (identificador del proyecto o producto), application (nombre de la app). " +
      "Enforcement: usar AWS Organizations SCPs o Azure Policy para rechazar recursos sin tags obligatorios. " +
      "Los tags deben activarse como cost allocation tags en AWS Billing para aparecer en Cost Explorer y reportes. " +
      "Retroactiva tagging: para recursos ya existentes sin tags usar Tag Editor (AWS) o Azure Policy remediation tasks.",
    sourceUrl: "https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activating-tags.html",
    sourceLabel: "AWS Docs — Activating user-defined cost allocation tags",
  },
  {
    id: "showback-chargeback",
    topic: "Showback vs Chargeback — diferencia y cuándo usar cada uno",
    keywords: ["showback", "chargeback", "diferencia", "asignacion", "costos", "departamento", "transparencia"],
    summary:
      "Showback: mostrar a cada equipo cuánto gasta (sin transferencia financiera real). Chargeback: facturar internamente al equipo el costo real. El showback es el primer paso; el chargeback requiere madurez organizacional.",
    detail:
      "Showback: informa a los equipos de su gasto sin cobrarles. Ideal para organizaciones que están empezando con FinOps. Crea conciencia sin fricción financiera. " +
      "Chargeback: los costos cloud se imputan al presupuesto del equipo/departamento. Requiere acuerdo entre finance y engineering, y tags/etiquetas confiables. " +
      "Showback primero, chargeback después: la mayoría de organizaciones hacen showback 6-12 meses antes de pasar a chargeback. " +
      "Herramientas: AWS Cost Categories para showback; Azure cost allocation rules para chargeback. " +
      "El objetivo final es que cada equipo sea responsable de su gasto cloud como si fuera su propio P&L.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en finops.org/framework/capabilities/",
  },
  {
    id: "aws-budgets",
    topic: "AWS Budgets — alertas de presupuesto y control de gasto",
    keywords: ["aws budgets", "presupuesto", "alerta", "gasto", "notificacion", "forecast", "threshold"],
    summary:
      "AWS Budgets permite configurar umbrales de gasto y recibir alertas cuando el gasto real o proyectado supera el límite. Soporta presupuestos por costo, uso, Savings Plans y Reserved Instances.",
    detail:
      "Tipos de budget: Cost Budget (USD), Usage Budget (horas, GB, etc.), Savings Plans Budget, RI Coverage Budget. " +
      "Alertas: se disparan al alcanzar el 50%, 75%, 90%, 100% del umbral. También soporta alertas de forecast. " +
      "Notificaciones: email (hasta 10 destinatarios) o Amazon SNS. SNS permite automatizar acciones. " +
      "Budget Actions: permite ejecutar acciones automáticas al superar el umbral (aplicar SCP, detener instancias EC2/RDS, etc.). " +
      "Acceso: AWS Billing → Budgets. Los 2 primeros budgets son gratuitos; después $0.02/budget/día.",
    sourceUrl: "https://docs.aws.amazon.com/cost-management/latest/userguide/create-cost-budget.html",
    sourceLabel: "AWS Docs — Creating a cost budget",
  },
  {
    id: "aws-cost-anomaly",
    topic: "AWS Cost Anomaly Detection — detección automática de gasto inusual",
    keywords: ["anomaly detection", "anomalia", "gasto inusual", "aws", "alertas", "machine learning", "monitor"],
    summary:
      "AWS Cost Anomaly Detection usa ML para detectar aumentos de gasto inusuales en servicios, cuentas o etiquetas. Envía alertas cuando detecta un patrón anómalo con el impacto estimado en USD.",
    detail:
      "Monitors: se configuran para vigilar un servicio AWS específico, una cuenta vinculada, un cost category o un tag. " +
      "El modelo ML aprende el patrón histórico de gasto y alerta cuando hay desviaciones significativas. " +
      "Las alertas incluyen: el monto del impacto, el servicio responsable, el periodo del anomalía y un enlace a Cost Explorer filtrado. " +
      "Puede integrarse con SNS para notificaciones en Slack, PagerDuty, etc. " +
      "Acceso: AWS Cost Management → Cost Anomaly Detection.",
    sourceUrl: "https://docs.aws.amazon.com/cost-management/latest/userguide/getting-started-ad.html",
    sourceLabel: "AWS Docs — Getting started with AWS Cost Anomaly Detection",
  },
  {
    id: "aws-compute-optimizer",
    topic: "AWS Compute Optimizer — rightsizing basado en métricas reales",
    keywords: ["compute optimizer", "rightsizing", "metricas", "cloudwatch", "recomendaciones", "ec2", "lambda", "ecs"],
    summary:
      "AWS Compute Optimizer analiza métricas de CloudWatch de los últimos 14 días (o hasta 3 meses con lookback opcional) y recomienda tipos de instancia óptimos para EC2, ASG, Lambda, ECS y EBS.",
    detail:
      "Compute Optimizer requiere opt-in por cuenta u organización. Necesita al menos 30 horas de métricas para EC2. " +
      "Las recomendaciones incluyen: tipo de instancia actual vs recomendado, ahorro estimado, % de CPU/memoria p99 en el periodo. " +
      "Diferencia clave con nuestra app: Compute Optimizer usa métricas reales de CloudWatch (CPU, memoria, red, disco), " +
      "mientras que nuestra app solo tiene datos de billing (horas encendidas). " +
      "Por eso nuestros hallazgos de 'revisión de utilización' tienen confianza 'fuera-de-alcance-del-billing'.",
    sourceUrl: "https://docs.aws.amazon.com/compute-optimizer/latest/ug/what-is-compute-optimizer.html",
    sourceLabel: "AWS Docs — What is AWS Compute Optimizer",
  },
  {
    id: "finops-raci",
    topic: "RACI de FinOps — quién es responsable de qué",
    keywords: ["raci", "responsable", "accountable", "consulted", "informed", "roles", "organizacion"],
    summary:
      "Un RACI de FinOps típico: el equipo FinOps (Responsible), CFO/CTO (Accountable), Engineering liders (Consulted), todos los equipos (Informed). Para compromisos: Procurement es Accountable.",
    detail:
      "Responsible (hace el trabajo): FinOps Practitioner — analiza, detecta oportunidades, informa. " +
      "Accountable (responde por el resultado): CFO para costos totales; Product Owner para costos de su producto. " +
      "Consulted (aporta input): Engineering managers para validar recomendaciones de rightsizing; Procurement para compromisos. " +
      "Informed (se les notifica): todos los equipos con gasto cloud mediante showback/chargeback regular. " +
      "La falta de un RACI claro es la causa más común de que las recomendaciones FinOps no se implementen.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en finops.org/framework/",
  },
  // ─── Kubernetes ───────────────────────────────────────────────────────────
  {
    id: "kubernetes-cost",
    topic: "Kubernetes — cost allocation en clústeres compartidos (Kubecost)",
    keywords: ["kubernetes", "k8s", "kubecost", "namespace", "costo cluster", "allocation", "contenedores", "eks", "aks", "gke"],
    summary:
      "Asignar costos en Kubernetes compartidos requiere herramientas adicionales como Kubecost. El billing cloud solo muestra el costo del nodo, no del namespace o deployment.",
    detail:
      "El problema: un nodo EC2 puede ejecutar 50 pods de 10 equipos. El billing de AWS solo muestra el costo del nodo, no de cada pod. " +
      "Kubecost (y herramientas similares como OpenCost) analiza métricas de CPU/memoria de cada pod y asigna costos proporcionales a namespace, deployment, label. " +
      "OpenCost es el proyecto open-source de la CNCF equivalente. " +
      "AWS también ofrece Split Cost Allocation Data en CUR 2.0 para ECS y EKS. " +
      "AVISO: esto está fuera del alcance del motor de reglas actual de esta app — nuestra app opera sobre datos de billing, no sobre métricas de Kubernetes.",
    sourceUrl: null,
    sourceLabel: "Conocimiento general — verifica en kubecost.com o opencost.io",
  },

  // ─── FOCUS — métricas de coste y doble conteo ──────────────────────────────
  {
    id: "focus-cuatro-metricas-coste",
    topic: "FOCUS — las cuatro métricas de coste: BilledCost, EffectiveCost, ListCost, ContractedCost",
    keywords: [
      "billedcost",
      "effectivecost",
      "listcost",
      "contractedcost",
      "billedcost vs effectivecost",
      "diferencia billedcost effectivecost",
      "base caja",
      "base devengo",
      "amortizado",
      "listunitprice",
      "contractedunitprice",
      "metricas de coste",
    ],
    summary:
      "BilledCost es base caja: lo que el emisor factura en un periodo de facturación. EffectiveCost es base devengo: el coste reconocido en el periodo de cargo, amortizando las compras de compromiso. " +
      "ListCost y ContractedCost expresan el precio antes y después de negociación.",
    detail:
      "ListCost es ListUnitPrice multiplicado por PricingQuantity, es decir el precio de tarifa sin descuentos. ContractedCost es ContractedUnitPrice por PricingQuantity y refleja el precio negociado; si no hay descuentos negociados, por defecto coincide con ListCost. " +
      "BilledCost y EffectiveCost no son dos nombres del mismo número: uno responde a cuánto dinero salió este mes y el otro a qué coste corresponde al consumo de este mes. Mezclarlos en el mismo informe produce totales que no cuadran con la factura ni con el consumo. " +
      "Esta app analiza en base devengo y usa EffectiveCost cuando el archivo lo trae, porque el desperdicio pertenece al periodo en que se consumió la capacidad, no al periodo en que se pagó.",
    sourceUrl: "https://focus.finops.org/focus-columns/",
    sourceLabel: "FinOps Foundation — FOCUS Columns",
  },
  {
    id: "focus-doble-conteo-compromisos",
    topic: "FOCUS — doble conteo de compromisos al agregar costes",
    keywords: [
      "doble conteo",
      "conteo doble",
      "duplicar costes",
      "compromisos",
      "purchase",
      "chargecategory purchase",
      "compra de compromiso",
      "sumar dos veces",
      "agregacion",
      "base caja base devengo",
    ],
    summary:
      "Una compra de compromiso que paga cargos futuros aparece con ChargeCategory igual a Purchase, BilledCost mayor que cero y EffectiveCost igual a cero. " +
      "Sumarla junto a los cargos de uso que cubre cuenta el mismo dinero dos veces.",
    detail:
      "Esa combinación de tres condiciones es el filtro exacto que da la especificación para identificar estas compras, y es la forma fiable de detectarlas sin depender del texto de la descripción del cargo. " +
      "Al agregar hay que elegir base y ser consistente: en base caja se suman las compras y se excluyen los cargos de uso cubiertos por ellas; en base devengo se excluyen las compras futuras y se suman los cargos con su coste amortizado. " +
      "El síntoma típico del error es un total mensual que supera la factura justo en los meses con compra de reservas o Savings Plans.",
    sourceUrl: "https://focus.finops.org/focus-columns/",
    sourceLabel: "FinOps Foundation — FOCUS Columns",
  },

  // ─── FOCUS — taxonomía de servicios ───────────────────────────────────────
  {
    id: "focus-servicecategory",
    topic: "FOCUS — ServiceCategory: los 19 valores permitidos",
    keywords: [
      "servicecategory",
      "service category",
      "categoria de servicio",
      "19 valores",
      "valores permitidos",
      "compute",
      "networking",
      "databases",
      "ai and machine learning",
      "serverless",
      "taxonomia",
    ],
    summary:
      "ServiceCategory es Mandatory, no admite nulos, existe desde 0.5 y tiene exactamente 19 valores. Cada servicio pertenece a una y solo una categoría.",
    detail:
      "Los 19 valores son: AI and Machine Learning, Analytics, Business Applications, Compute, Databases, Developer Tools, Multicloud, Identity, Integration, Internet of Things, Management and Governance, Media, Migration, Mobile, Networking, Security, Storage, Web y Other. " +
      "Aclaración que suele hacer falta: Serverless no es una categoría. Lo serverless vive como subcategoría Serverless Compute dentro de Compute, así que buscar una categoría llamada Serverless no devolverá nada. " +
      "Al ser un enum cerrado, cualquier valor fuera de esa lista indica un export no conforme o una transformación propia mal hecha.",
    sourceUrl:
      "https://raw.githubusercontent.com/FinOps-Open-Cost-and-Usage-Spec/FOCUS_Spec/v1.4/specification/datasets/cost_and_usage/columns/servicecategory.md",
    sourceLabel: "FOCUS Spec v1.4 — ServiceCategory",
  },
  {
    id: "focus-servicesubcategory",
    topic: "FOCUS — ServiceSubcategory y las subcategorías de Storage",
    keywords: [
      "servicesubcategory",
      "service subcategory",
      "subcategoria",
      "subcategorias storage",
      "82 valores",
      "block storage",
      "object storage",
      "file storage",
      "backup storage",
      "storage platforms",
      "serverless compute",
    ],
    summary:
      "ServiceSubcategory es Recommended, existe desde 1.1 y tiene 82 valores; cada uno pertenece a un único padre. Es el discriminador exacto que evita adivinar el tipo de recurso leyendo la descripción del cargo.",
    detail:
      "Las subcategorías de Storage son Backup Storage, Block Storage, File Storage, Object Storage, Storage Platforms y Other (Storage). Con ellas se distingue un volumen de bloque de un bucket de objetos sin heurísticas sobre el texto del SKU. " +
      "Al ser Recommended y no Mandatory, hay proveedores conformes que no la emiten, por lo que una regla que dependa solo de esta columna debe tener un camino alternativo. " +
      "Esta app la usa cuando está presente y cae a inferencia por nombre de servicio cuando no lo está.",
    sourceUrl:
      "https://raw.githubusercontent.com/FinOps-Open-Cost-and-Usage-Spec/FOCUS_Spec/v1.4/specification/datasets/cost_and_usage/columns/servicesubcategory.md",
    sourceLabel: "FOCUS Spec v1.4 — ServiceSubcategory",
  },
  {
    id: "focus-chargecategory-chargeclass",
    topic: "FOCUS — ChargeCategory y ChargeClass",
    keywords: [
      "chargecategory",
      "charge category",
      "usage purchase tax credit adjustment",
      "chargeclass",
      "correction",
      "correcciones",
      "importes negativos",
      "tipos de cargo",
    ],
    summary:
      "ChargeCategory tiene cinco valores: Usage, Purchase, Tax, Credit y Adjustment. Todos admiten importes positivos y negativos. ChargeClass tiene un único valor, Correction.",
    detail:
      "Que los cinco tipos admitan signo negativo importa al agregar: un Credit no es necesariamente negativo ni un Usage necesariamente positivo, así que filtrar por signo en lugar de por categoría produce resultados erróneos. " +
      "ChargeClass se marca como Correction solo en correcciones a periodos de facturación ya cerrados. Es la forma de detectar reprocesos del proveedor y de excluirlos de una serie temporal si quieres ver el gasto tal y como se reportó originalmente. " +
      "ChargeClass es además el ejemplo típico de columna Mandatory que sí admite nulos, porque la mayoría de filas no son correcciones.",
    sourceUrl: "https://focus.finops.org/focus-columns/",
    sourceLabel: "FinOps Foundation — FOCUS Columns",
  },

  // ─── FOCUS — conformidad ──────────────────────────────────────────────────
  {
    id: "focus-conformance-program",
    topic: "FOCUS — programa de conformidad y Conformance Gap Report",
    keywords: [
      "conformidad",
      "conformance",
      "certificado",
      "certificacion",
      "finops certified focus conformant",
      "essential",
      "full",
      "gap report",
      "conformance gap report",
      "desviaciones",
    ],
    summary:
      "Existe el programa FinOps Certified FOCUS Conformant, sin coste adicional para miembros, específico por versión, con dos niveles (Essential y Full) y una ventana de 24 meses. " +
      "Estar certificado no significa cumplir el 100% del estándar.",
    detail:
      "El programa admite desviaciones toleradas, y por eso obliga a los proveedores a publicar un Conformance Gap Report accesible sin registro ni paywall. Ese informe es el documento que dice qué columnas faltan, cuáles tienen semántica distinta y qué mitigación propone el proveedor. " +
      "Recomendación práctica: antes de asumir la semántica de una columna en un análisis, lee el informe de gaps del proveedor concreto y de la versión concreta que estás consumiendo. Es más rápido que descubrir la desviación cuando los números ya no cuadran.",
    sourceUrl:
      "https://www.finops.org/certification-for-organizations/finops-certified-focus-v1-3-conformant/",
    sourceLabel: "FinOps Foundation — FinOps Certified FOCUS Conformant",
  },
  {
    id: "focus-gcp-gaps",
    topic: "FOCUS — el hueco del export de Google Cloud",
    keywords: [
      "gcp no trae servicecategory",
      "gcp sin servicecategory",
      "gcp servicesubcategory",
      "export gcp incompleto",
      "columnas no soportadas gcp",
      "resourcetype",
      "tags gcp",
      "commitmentdiscount gcp",
      "informe vacio gcp",
      "google cloud focus",
    ],
    summary:
      "El export FOCUS de Google Cloud no incluye ServiceCategory ni ServiceSubcategory, ni ResourceType, ni Tags, ni ninguna columna CommitmentDiscount. Tampoco emite nunca ChargeCategory con valor Purchase ni Credit.",
    detail:
      "La documentación las marca como no soportadas y con mitigación None, es decir, no hay alternativa que el proveedor ofrezca dentro del export. La consecuencia práctica es concreta: una herramienta que clasifique el gasto solo por ServiceCategory devuelve un informe vacío con un archivo de GCP perfectamente válido, y una que calcule cobertura de compromisos no encontrará ninguna columna donde mirar. " +
      "Esta app lo resuelve infiriendo la categoría a partir del nombre del servicio cuando la columna no existe, y marcando esos hallazgos con la confianza que corresponde a un dato inferido en lugar de presentarlos como confirmados.",
    sourceUrl:
      "https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/focus-export",
    sourceLabel: "Google Cloud — FOCUS export (columnas no soportadas)",
  },

  // ─── FOCUS e IA ───────────────────────────────────────────────────────────
  {
    id: "focus-for-ai",
    topic: "FOCUS para IA — cómo se mapea el uso de modelos sin columnas de tokens",
    keywords: [
      "focus ia",
      "focus ai",
      "focus tokens",
      "columna de tokens",
      "consumedquantity",
      "consumedunit",
      "skuid",
      "skupriceid",
      "pricingcurrency",
      "moneda virtual",
      "creditos",
      "burn-down",
      "throughput reservado",
    ],
    summary:
      "FOCUS no tiene ninguna columna específica de tokens. La postura oficial es que el estándar ya trae los bloques necesarios y el uso de IA se mapea sobre columnas existentes.",
    detail:
      "El mapeo es: el volumen de tokens de entrada va a ConsumedQuantity con su ConsumedUnit; el modelo y su punto de precio a SkuId y SkuPriceId; que se trate de un servicio de IA se expresa con ServiceCategory igual a AI and Machine Learning; el pago en créditos o tokens con PricingCurrency; y el throughput reservado con las columnas de CommitmentDiscount. " +
      "La propia documentación reconoce que con el tiempo puede surgir la necesidad de columnas propias para IA. Mientras tanto, FOCUS 1.2 incorporó el ciclo de vida de moneda virtual, que cubre créditos y tokens con burn-down diario y previsión de agotamiento, y es la pieza que permite responder cuándo se acaba el saldo comprometido.",
    sourceUrl: "https://focus.finops.org/technology-categories/focus-for-ai/",
    sourceLabel: "FinOps Foundation — FOCUS for AI",
  },
  {
    id: "ai-gpu-utilizacion-saturacion",
    topic: "IA — utilización frente a saturación de GPU, y peso de la inferencia",
    keywords: [
      "gpu",
      "utilizacion gpu",
      "saturacion gpu",
      "vataje",
      "consumo electrico gpu",
      "inferencia coste total",
      "tco ia",
      "capacidad gpu desaprovechada",
      "optimizar genai",
    ],
    summary:
      "La utilización de GPU indica con qué frecuencia el recurso está activo; la saturación mide el vataje medio consumido frente al máximo del dispositivo. Son señales distintas y hay que leerlas juntas.",
    detail:
      "Utilización alta con consumo eléctrico bajo señala una GPU asignada a un workload que no la aprovecha: el dispositivo está ocupado pero no trabajando a fondo, y ese es exactamente el caso que una métrica de utilización sola no detecta. " +
      "Dos cifras del trabajo de optimización de GenAI de la FinOps Foundation ayudan a dimensionar el problema: la inferencia puede representar entre el 80 y el 90 por ciento del coste total de propiedad de un sistema de IA generativa, y las GPUs suelen operar solo entre el 15 y el 30 por ciento de su capacidad. " +
      "Implicación práctica: optimizar el entrenamiento mientras se ignora la inferencia ataca la parte pequeña del coste.",
    sourceUrl: "https://www.finops.org/wg/optimizing-genai-usage/",
    sourceLabel: "FinOps Foundation — Optimizing GenAI Usage",
  },
  {
    id: "ai-ptu-capacidad-reservada",
    topic: "IA — capacidad reservada tipo PTU y reparto justo entre casos de uso",
    keywords: [
      "ptu",
      "provisioned throughput",
      "capacidad reservada",
      "throughput reservado",
      "unidad de throughput",
      "tarifa efectiva por token",
      "reparto",
      "compartir reserva",
      "utilizacion reserva ia",
    ],
    summary:
      "Cuando se reserva throughput se paga capacidad fija y se deja de pagar por token. Es habitual que varios casos de uso compartan la reserva, y entonces hace falta un criterio de reparto.",
    detail:
      "El método recomendado es calcular la tarifa efectiva por token dividiendo el coste de la reserva entre los tokens realmente generados en el periodo, y corregir después por utilización con la fórmula Gasto = tarifa de la reserva multiplicada por (2 menos la tasa de utilización) y por los millones de tokens, aplicada por separado a entrada y salida. " +
      "La corrección por utilización evita que una reserva medio vacía parezca barata para quienes sí la usan: cuanto menor es la utilización, mayor es el coste que se imputa por token. " +
      "Advertencia al comparar proveedores: una unidad de throughput no significa lo mismo entre ellos, así que las cifras de unidades no son comparables sin traducir a tokens.",
    sourceUrl: "https://www.finops.org/wg/how-to-build-a-generative-ai-cost-and-usage-tracker/",
    sourceLabel: "FinOps Foundation — Generative AI Cost and Usage Tracker",
  },
  {
    id: "state-of-finops-2026",
    topic: "State of FinOps 2026 — alcance declarado del gasto de IA",
    keywords: [
      "state of finops",
      "state of finops 2026",
      "encuesta",
      "datos finops",
      "98 por ciento",
      "prioridad finops",
      "desperdicio",
      "skill mas demandado",
      "saas licencias data center",
    ],
    summary:
      "En la sexta edición del State of FinOps, con 1.192 respondientes de empresas que representan más de 83.000 millones de dólares de gasto cloud anual, el 98% de los equipos ya gestionan gasto de IA o lo harán en los próximos 12 meses, frente al 63% en 2025 y el 31% en 2024.",
    detail:
      "Publicado el 19 de febrero de 2026, el informe también recoge que el 48% gestionan costes de data center, el 90% SaaS y el 64% licencias. Cuidado al interpretar el 98%: mide alcance declarado incluyendo intención a 12 meses, no madurez ni prioridad. " +
      "En prioridades el informe es explícito y conviene no mezclarlo con lo anterior: la prioridad actual número uno sigue siendo la optimización de workloads y la reducción de desperdicio, mientras FinOps para IA aparece como la principal prioridad a 12 meses y como el skill más demandado.",
    sourceUrl: "https://data.finops.org/",
    sourceLabel: "FinOps Foundation — State of FinOps data",
  },

  // ─── Token Economics (proyecto en formación, no estándar ratificado) ───────
  {
    id: "token-economics",
    topic: "Token Economics — proyecto en formación (borrador 0.1)",
    keywords: [
      "token economics",
      "tokenomics",
      "tokenomics foundation",
      "energia inteligencia valor",
      "token factory",
      "cache kv",
      "tokens de razonamiento",
      "carga agentica",
      "coste por token hardware",
    ],
    summary:
      "Token Economics es la documentación de la Tokenomics Foundation, proyecto de la Linux Foundation anunciado el 3 de junio de 2026 con asociación declarada con la FinOps Foundation. " +
      "Su definición está marcada como borrador sin ratificar, versión 0.1.",
    detail:
      "Propone un modelo conceptual de energía a inteligencia a valor, con tres etapas en la cadena de suministro del token: producción, consumo y valor. Introduce vocabulario propio como token factory, caché KV, tokens de razonamiento y carga agéntica, y aclara que el término no tiene relación con el uso en criptomonedas. " +
      "Su propuesta central de medición es calcular el coste por token como coste de hardware dividido entre tokens producidos, defendiéndolo como métrica de salida frente al coste por hora de GPU. " +
      "Etiqueta honesta: es un proyecto en formación y no un estándar ratificado, así que no tiene el mismo nivel de autoridad que la especificación FOCUS y conviene tratarlo como vocabulario emergente.",
    sourceUrl: "https://www.tokeneconomics.com/docs/overview/",
    sourceLabel: "Tokenomics Foundation — Overview (borrador 0.1, sin ratificar)",
  },
  {
    id: "big-t-notation",
    topic: "Notación Big-T — coste de las llamadas ocultas al modelo (informal)",
    keywords: [
      "big-t",
      "big t",
      "big-t notation",
      "notacion big-t",
      "llamadas ocultas al modelo",
      "profundidad de agentes",
      "coste agentico",
      "escalada de llamadas",
    ],
    summary:
      "Big-T es una notación propuesta como T(n · k · a), donde n son las peticiones, k las llamadas al modelo por petición y a la profundidad de agentes, con una escalera de clases desde T(1) constante hasta T(∞) no acotado.",
    detail:
      "Su valor está en hacer visible el coste de las llamadas ocultas al modelo y no solo el de los tokens: un sistema agéntico puede multiplicar el gasto por petición sin que el prompt del usuario crezca, y esa multiplicación es lo que la notación intenta expresar de un vistazo. " +
      "Etiqueta honesta: la propia fuente la describe como informal y sin demostraciones formales, y es una contribución corporativa adoptada por el consorcio dentro de una documentación en estado de borrador 0.1. Úsala como herramienta de comunicación, no como base de un modelo de costes formal.",
    sourceUrl: "https://www.tokeneconomics.com/docs/overview/",
    sourceLabel: "Tokenomics Foundation — Overview (notación informal, borrador 0.1)",
  },

  // ─── Metodología aplicada de los working groups ───────────────────────────
  {
    id: "focus-adopcion-etapas",
    topic: "FOCUS — ruta de adopción en cinco etapas",
    keywords: [
      "adoptar focus",
      "adopcion focus",
      "etapas",
      "decide design build test launch",
      "de donde tomar los datos",
      "enriquecimiento",
      "validar antes de lanzar",
      "kpi concreto",
      "migrar a focus",
    ],
    summary:
      "La ruta de adopción de FOCUS tiene cinco etapas: Decide, Design, Build, Test y Launch. La recomendación explícita es atar la adopción a un KPI concreto en lugar de migrar por migrar.",
    detail:
      "Criterio para decidir de dónde tomar los datos: si no necesitas enriquecimiento, toma FOCUS directo del proveedor; si tu herramienta de terceros es el hogar del enriquecimiento, tómalo de ahí; y si el enriquecimiento viene de fuentes variadas, toma el del proveedor y añade encima. Un tercer criterio es el soporte: quien convierta los datos por su cuenta debe garantizar recursos para operarlo en el día a día, no solo para construirlo. " +
      "En la etapa de prueba la recomendación es comparar los datos FOCUS nuevos contra los datos previos antes de lanzar. Lanzar sin esa validación destruye la confianza de los equipos, y recuperarla cuesta más que el retraso.",
    sourceUrl:
      "https://www.finops.org/wg/adopting-focus-the-finops-open-cost-and-usage-specification/",
    sourceLabel: "FinOps Foundation — Adopting FOCUS",
  },
  {
    id: "finops-saas",
    topic: "FinOps para SaaS — licencia frente a consumo y correlación uso/coste",
    keywords: [
      "saas",
      "licencias saas",
      "saas por consumo",
      "saas por licencia",
      "correlacionar uso y coste",
      "chargeback saas",
      "componentes compartidos",
      "granularidad saas",
    ],
    summary:
      "En SaaS se distingue el gasto por licencia del gasto por consumo. El reto propio es que el dato de uso y el de coste llegan de fuentes distintas y hay que correlacionarlos.",
    detail:
      "Es habitual que el proveedor exporte uso sin coste asociado, o coste pero sin la granularidad que da un proveedor cloud, de modo que el trabajo real está en unir ambas fuentes con una clave estable antes de poder hablar de eficiencia. " +
      "Criterio de chargeback recomendado: recargar los elementos de uso que el consumidor puede influir y dejar los componentes compartidos al owner del producto. Cobrar a un equipo por algo que no puede cambiar genera discusión sin cambiar el gasto. " +
      "En el framework vigente esto vive en la capability Licensing & SaaS, dentro de Optimize Usage & Cost.",
    sourceUrl: "https://www.finops.org/wg/finops-for-saas-best-practices-and-adopting-focus/",
    sourceLabel: "FinOps Foundation — FinOps for SaaS",
  },
  {
    id: "finops-data-center",
    topic: "FinOps para data center — rate card interno y capacidad ociosa",
    keywords: [
      "data center",
      "datacenter",
      "centro de datos",
      "rate card",
      "tarifa interna",
      "capacidad ociosa",
      "split cost allocation",
      "coste fijo",
      "utilizacion estable",
      "on-premises",
    ],
    summary:
      "En un data center la mayor parte del coste existe independientemente del trabajo que se haga dentro, y los componentes variables son una fracción pequeña del total. Eso cambia el mecanismo de asignación.",
    detail:
      "El mecanismo recomendado es un rate card interno con un supuesto de utilización estable, tratando la capacidad ociosa como un componente de coste identificable propio mediante split cost allocation, en lugar de dejar que la utilización mueva las tarifas mes a mes. Si las tarifas fluctúan con la ocupación, los equipos reciben señales de precio que no pueden interpretar ni controlar. " +
      "Matiz importante al leer el indicador: una capacidad ociosa muy baja o cercana a cero no es necesariamente eficiencia. Puede indicar que se opera sin margen para fallos, mantenimiento o workloads nuevos, y ese margen tiene valor aunque no aparezca como consumo.",
    sourceUrl:
      "https://www.finops.org/wg/finops-for-data-center-practical-cost-modeling-focus-alignment/",
    sourceLabel: "FinOps Foundation — FinOps for Data Center",
  },
];

// ─── Retrieval function ───────────────────────────────────────────────────────

/**
 * Deterministic keyword-based retrieval.
 * Tokenizes query, scores each entry by keyword (weight 3), topic (weight 2),
 * summary (weight 1). Returns top 3 entries with score > 0.
 * Zero network calls, zero embeddings.
 */
export function lookupKnowledge(query: string): KnowledgeEntry[] {
  if (!query || query.trim().length === 0) return [];

  const tokens = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .split(/[\s,;?!.]+/)
    .filter((t) => t.length >= 3);

  if (tokens.length === 0) return [];

  const scored = KNOWLEDGE_BASE.map((entry) => {
    const topicLower = entry.topic.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const summaryLower = entry.summary.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    let score = 0;
    for (const token of tokens) {
      // keywords: weight 3
      if (entry.keywords.some((k) => k.includes(token) || token.includes(k))) score += 3;
      // topic: weight 2
      if (topicLower.includes(token)) score += 2;
      // summary: weight 1
      if (summaryLower.includes(token)) score += 1;
    }
    return { entry, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.entry);
}
