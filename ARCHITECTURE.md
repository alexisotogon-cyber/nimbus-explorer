# Arquitectura — FinOps Agent (Nimbus Explorer)

Documento de referencia técnica para jurado y equipo. Cubre los componentes
del sistema, el flujo de datos, el modelo de seguridad y cómo se usó Kiro
para construir el proyecto.

**Principio rector:** las cifras y hallazgos siempre los produce el motor
determinístico (`src/engine/`). Atlas, el agente conversacional sobre Amazon
Bedrock, solo explica, compara o propone estrategia sobre resultados ya
calculados — nunca recalcula ni completa datos ausentes. Ver
[README.md](README.md) para variables de entorno y detalle completo de límites.

## Índice

1. [Arquitectura general](#1-arquitectura-general)
2. [Conexión AWS en vivo](#2-conexión-aws-en-vivo-modelo-de-seguridad)
3. [Flujo de uso del usuario](#3-flujo-de-uso-del-usuario)
4. [Uso de Kiro en el desarrollo](#4-uso-de-kiro-en-el-desarrollo)

---

## 1. Arquitectura general

```mermaid
flowchart TB
    classDef client fill:#EBF2FF,stroke:#1D4ED8,stroke-width:1.5px,color:#172033
    classDef engine fill:#ECFDF5,stroke:#047857,stroke-width:1.5px,color:#065F46
    classDef guard fill:#FFFBEB,stroke:#B45309,stroke-width:1.5px,color:#78350F
    classDef aws fill:#FFFFFF,stroke:#526077,stroke-width:1.5px,color:#172033
    classDef mcp fill:#FFFFFF,stroke:#94A3B8,stroke-width:1px,color:#526077,stroke-dasharray: 4 3

    subgraph Client["NAVEGADOR"]
        UI["Next.js 14 · App Router\nsrc/app + src/components"]:::client
    end

    subgraph Server["SERVIDOR — Next.js API routes"]
        API["/api/agent · /api/connect\n/api/connect-focus"]:::client
        Parsers["Parsers\nFOCUS 1.x · AWS CUR · Azure · GCP"]:::engine
        Engine["Motor determinístico\nrules/ · pricing.ts\nfinancial-reconciliation.ts"]:::engine
        Atlas["Atlas\nsrc/engine/agent.ts"]:::client
        Guard["Guardrails\nallowlist de modelos · presupuesto\ndiario/mensual · circuit breaker\nrate limit · timeout"]:::guard
    end

    subgraph AWSCloud["AWS"]
        Bedrock["Amazon Bedrock\nAmazon Nova Pro"]:::aws
        CostExplorer["Cost Explorer API\nce:GetCostAndUsage — solo lectura"]:::aws
        S3["S3 — FOCUS Data Export\ns3:ListBucket / GetObject"]:::aws
    end

    subgraph MCPServers["MCP — solo en desarrollo (Kiro)"]
        PricingMCP["aws-pricing"]:::mcp
        DocsMCP["aws-documentation"]:::mcp
    end

    UI -->|"CSV / demo / credenciales IAM\nsolo dentro del request"| API
    API --> Parsers --> Engine
    API -->|"Access Key IAM solo lectura\nen memoria por request"| CostExplorer
    API --> S3
    Engine -->|"reporte estructurado"| UI
    UI -->|"pregunta del usuario"| API
    API --> Atlas --> Guard --> Bedrock
    Atlas -.->|"solo lee el reporte\nno recalcula"| Engine

    PricingMCP -.->|"verifica pricing.ts"| Engine
    DocsMCP -.->|"verifica URLs citadas"| Atlas

    style Client fill:#F8FAFC,stroke:#CBD5E1
    style Server fill:#FFFFFF,stroke:#E2E8F0
    style AWSCloud fill:#F8FAFC,stroke:#CBD5E1
    style MCPServers fill:#F8FAFC,stroke:#CBD5E1,stroke-dasharray: 4 3
```

| Componente | Rol | Verdad financiera |
|---|---|---|
| **Motor determinístico** (`src/engine/`) | Calcula hallazgos y rangos de ahorro (conservador → optimista) | Única fuente de cifras |
| **Atlas** (`agent.ts` → Bedrock) | Explica, compara, sugiere estrategia | Nunca calcula ni inventa números |
| **Guardrails** | Allowlist de modelos, presupuesto diario/mensual, circuit breaker, rate limit | Corta IA sin apagar el producto (`ATLAS_MODE=emergency`) |
| **MCP `aws-pricing` / `aws-documentation`** | Verifican precios y URLs citadas en tiempo de desarrollo | No corren en producción |

Las credenciales de Bedrock viven solo en variables de entorno del servidor.
Las credenciales de la cuenta AWS del **usuario** (Cost Explorer, S3) viven
solo en memoria durante cada request — ver sección 2.

## 2. Conexión AWS en vivo (modelo de seguridad)

```mermaid
sequenceDiagram
    autonumber
    actor Usuario
    participant UI as Next.js UI
    participant API as /api/connect
    participant CE as AWS Cost Explorer
    participant Engine as Motor determinístico

    Usuario->>UI: Pega Access Key IAM (ce:GetCostAndUsage — solo lectura)
    Note over UI,API: Las keys viajan solo en el body HTTPS,\nnunca en la URL ni en query string
    UI->>API: POST credenciales (una sola vez)
    API->>CE: GetCostAndUsage (solo lectura)
    CE-->>API: Datos de facturación
    API->>Engine: Normaliza y ejecuta reglas
    Engine-->>API: Hallazgos + rangos de ahorro
    API-->>UI: Reporte (JSON)
    Note over API: Las credenciales se descartan\nal terminar el request.\nNunca se escriben a disco, BD ni logs.
```

El conector `/api/connect-focus` (S3) sigue el mismo patrón: `s3:ListBucket`
+ `s3:GetObject` en lugar de `ce:GetCostAndUsage`, lectura de CSV, CSV.gz o
Parquet, y el mismo motor de reglas al final. Las credenciales no se
persisten ni se registran deliberadamente.

## 3. Flujo de uso del usuario

```mermaid
flowchart LR
    classDef step fill:#EBF2FF,stroke:#1D4ED8,stroke-width:1.5px,color:#172033
    classDef decision fill:#FFFFFF,stroke:#526077,stroke-width:1.5px,color:#172033
    classDef result fill:#ECFDF5,stroke:#047857,stroke-width:1.5px,color:#065F46

    A["1 · Elige nube\nAWS / Azure / GCP / FOCUS"]:::step --> B{"2 · Fuente de datos"}:::decision
    B -->|"Demo 1-clic"| C["Datos sintéticos\ndeterminísticos"]:::step
    B -->|"Subir CSV / FOCUS"| D["Parser detecta\nformato automáticamente"]:::step
    B -->|"Conectar cuenta AWS"| E["Cost Explorer\no S3 FOCUS export\nsolo lectura"]:::step
    C --> F["3 · Motor de reglas\nhallazgos + rangos de ahorro"]:::result
    D --> F
    E --> F
    F --> G["4 · Dashboard\nreporte + PDF / Excel / Markdown"]:::result
    G -.->|"opcional"| H["Chat con Atlas\nexplica, compara, sugiere"]:::step
```

## 4. Uso de Kiro en el desarrollo

El proyecto se construyó guiado por una spec versionada —
[`.kiro/specs/roadmap-focus-ai-s3.md`](.kiro/specs/roadmap-focus-ai-s3.md) —
con reglas de integridad transversales y tres fases secuenciales, cada una
cerrada por un gate de aceptación antes de avanzar a la siguiente.

| Fase | Entregable | Gate de aceptación |
|---|---|---|
| **1 — FOCUS** | Parser del estándar abierto FOCUS 1.x, detección automática multi-nube | `tsc --noEmit` y `npm run build` limpios; fixture FOCUS produce hallazgos |
| **2 — Lente de IA** | Reglas `ai-spend` (Bedrock, SageMaker, GPU) | Demo "startup de IA" produce los 3 hallazgos esperados; ninguna regla recomienda terminar instancias |
| **3 — Conector S3** | Lectura en vivo del FOCUS Data Export de AWS | CSV/CSV.gz y Parquet; manifiesto completo; límite agregado de 50 MiB |

Reglas de integridad de la spec, verificadas en cada fase:

- El LLM nunca inventa cifras — todo viene del motor.
- Fuentes citadas por Atlas se verifican con el MCP `aws-documentation` antes
  de publicarse (ejemplo: 50% de ahorro con Batch Inference de Bedrock,
  verificado contra la documentación oficial de AWS).
- El MCP `aws-pricing` verifica `src/engine/pricing.ts` contra el Price List
  API real de AWS en desarrollo — no en producción.
- Credenciales de usuario solo en memoria por request, nunca persistidas.

Cada fase cerró con una regresión contra `test-data/caso-prueba-aws.csv` y
`test-data/caso-prueba-focus.csv` para confirmar que ningún hallazgo
existente se rompiera.
