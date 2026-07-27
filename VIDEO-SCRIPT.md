# Guion — Video de presentación (máx. 5 min)

Reglamento: máx. 5 min, se pueden mostrar fragmentos de código sin datos
sensibles, 1 video final por equipo. Ritmo aproximado: ~150 palabras/min en
español hablado — este guion pesa ~720 palabras, cómodo para 5 min con pausas
para pantalla.

Convención: **[EN PANTALLA]** = qué grabar/mostrar. Texto normal = narración,
léela como si le explicaras esto a un colega, no como discurso.

---

## 0:00–0:20 — Gancho

**[EN PANTALLA]** Dashboard de Nimbus ya cargado con un análisis real (usa el
demo "mixed"/complex, tiene hallazgos variados). Congela en la cifra de gasto
total.

> Esta cuenta gasta casi $4,000 dólares al mes entre AWS, Azure y GCP. Sin
> Nimbus, saber cuánto de eso se puede recortar significa entrar a tres
> consolas distintas y cruzar tres formatos de factura a mano.

## 0:20–0:45 — Qué es

**[EN PANTALLA]** Logo/wordmark de Nimbus Explorer, luego corte al Paso 1 de
la app (selección de nube).

> Nimbus Explorer es un auditor de costos multi-nube. Un motor de reglas
> determinístico calcula los hallazgos y los rangos de ahorro. Atlas, el
> agente conversacional, solo los explica — nunca inventa ni recalcula una
> cifra. Esa separación es el eje de todo el proyecto.

## 0:45–2:40 — Demo en vivo (el bloque más largo)

**[EN PANTALLA]** Grabación real de la app, en este orden:

1. **Paso 1–2**: elegir "Cualquier nube (FOCUS)" o AWS, y mostrar las tres
   opciones de fuente — demo, subir CSV, conectar cuenta.
   > No necesitas entrar a la consola de AWS ni dar acceso a nada para
   > empezar: subes el CSV que ya tienes y Nimbus produce el mismo reporte
   > que con una conexión en vivo.
2. **Sube o usa el demo** → espera a que cargue el dashboard.
3. **Dashboard**: señala UN hallazgo real con su rango de ahorro
   (conservador/moderado/optimista) y el nivel de confianza.
   > Cada hallazgo trae su rango de ahorro y sus supuestos declarados — no
   > una promesa de un número exacto.
4. **Abre el chat de Atlas** y pregunta algo real en vivo (no lo edites,
   grábalo tal como responde): por ejemplo *"¿por qué el rango de ahorro de
   este hallazgo no es lineal?"*
   > Fíjate: Atlas cita la cifra exacta del reporte, no una que se inventa
   > al vuelo.
5. **Exporta** a PDF o Excel en 2 segundos.

> Todo esto — demo, CSV o FOCUS — pasa por el mismo motor. El reporte del
> dashboard, el del chat y el del PDF nunca se contradicen entre sí.

## 2:40–3:35 — Arquitectura y AWS

**[EN PANTALLA]** Diagrama de arquitectura de `ARCHITECTURE.md` (captura o
scroll lento), o el mermaid renderizado en GitHub.

> Bajo el capó: Amazon Bedrock con Nova Pro ejecuta a Atlas. AWS Cost
> Explorer trae el gasto en vivo de la cuenta del usuario. S3 lee
> directamente el FOCUS Data Export que AWS ya genera, sin exportar nada a
> mano. Y en desarrollo, el Price List API de AWS verifica que la tabla de
> precios del motor no se haya desactualizado.

**[EN PANTALLA]** Corte rápido a `.kiro/specs/nimbus-explorer-overview/` en
el editor (requirements.md, design.md, tasks.md).

> El proyecto se construyó con Kiro mediante specs versionadas, no a punta
> de prompts sueltos: requisitos, diseño y tareas verificables, con un gate
> de aceptación por fase antes de avanzar a la siguiente.

## 3:35–4:25 — Por qué importa

**[EN PANTALLA]** Puede ser solo cara a cámara o texto en pantalla con las
cifras clave.

> Esta regla de "la IA nunca inventa una cifra" no se quedó en el prompt.
> La probamos con intentos de ruptura de rol, presión para que recalculara
> y benchmarks falsos de mercado — y sostuvo la regla en los tres casos.
> Además, FOCUS le evita a quien audita aprender tres modelos de
> facturación distintos: audita AWS, Azure y GCP bajo el mismo esquema. Y
> como el gasto en inteligencia artificial es hoy la prioridad número uno
> de la industria FinOps, el motor trae cinco reglas dedicadas solo a eso —
> un auditor de costos que audita su propio gasto en IA.

## 4:25–5:00 — Cierre

**[EN PANTALLA]** Repo de GitHub abierto en el README, con el link de demo
visible.

> Nimbus Explorer: [nombre del equipo]. Repositorio, demo en línea y el
> detalle técnico completo están en la descripción de este video.

---

## Notas de grabación

- Graba la demo (bloque 0:45–2:40) en una sola toma si puedes — se nota
  cuando es real vs. cuando está cortada, y "software funcional" es un
  criterio de evaluación explícito.
- El guardrail contra cifras inventadas ya pasó tres rondas de pruebas
  adversariales (costo base por hallazgo, escenario optimista, presión para
  "recalcular"). Si quieres un momento fuerte para el criterio de
  innovación, pídele en vivo algo que sepas que no puede confirmar — la
  respuesta segura que da en vez de inventar es justo la garantía que
  vendes.
- Si el tiempo aprieta, el bloque que más se puede recortar es
  "Arquitectura y AWS" (3:35) a costa de mostrar menos pantalla y hablar
  más rápido — no recortes la demo en vivo, es lo que pide el reglamento.
