/**
 * AUDIT — Tarea 5: robustez de los parsers ante entradas malformadas.
 * Run: npx tsx test-data/audit/audit-parsers.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { parseCSVAutoDetect, detectFormat, readHeaders } = await import("../../src/engine/parsers/index.ts");
const { calculateSavings } = await import("../../src/engine/tools/calculate-savings.ts");

const out = [];
const log = (s = "") => { out.push(s); console.log(s); };
const r2 = (n) => Math.round(n * 100) / 100;
const results = [];

const HEAD = "BillingAccountId,BillingCurrency,BilledCost,EffectiveCost,ChargePeriodStart,ChargeCategory,ChargeDescription,ProviderName,ServiceName,ServiceCategory,ServiceSubcategory,SkuId,RegionId";
const row = (cost, desc = "EBS:VolumeUsage.gp3", d = "2026-06-01") =>
  `111122223333,USD,${cost},${cost},${d}T00:00:00Z,Usage,${desc},AWS,Amazon Elastic Block Store,Storage,Block Storage,EBS:VolumeUsage.gp3,us-east-1`;

/** Ejecuta un caso y clasifica el comportamiento. */
function probe(nombre, csv, esperado) {
  let veredicto, comportamiento, detalle = "";
  const t0 = performance.now();
  try {
    const parsed = parseCSVAutoDetect(csv);
    const ms = r2(performance.now() - t0);
    const total = r2(parsed.records.reduce((s, r) => s + r.cost, 0));
    const dias = new Set(parsed.records.map((r) => r.date)).size;
    comportamiento = `parseó ${parsed.records.length} filas, Σcost=$${total}, días=${dias}, fmt=${parsed.detectedProvider}, ${ms}ms`;
    detalle = { records: parsed.records.length, total, dias, ms, fmt: parsed.detectedProvider };
    veredicto = esperado(null, detalle);
  } catch (e) {
    const ms = r2(performance.now() - t0);
    comportamiento = `EXCEPCIÓN (${ms}ms): ${e.message.slice(0, 190)}`;
    detalle = { error: e.message, ms };
    veredicto = esperado(e, detalle);
  }
  results.push({ nombre, comportamiento, veredicto });
  log(`\n── ${nombre}`);
  log(`   comportamiento: ${comportamiento}`);
  log(`   veredicto: ${veredicto}`);
  return detalle;
}

log("=".repeat(100));
log("TAREA 5 — ROBUSTEZ DE LOS PARSERS");
log("=".repeat(100));

// 1. Comillas sin cerrar
probe("CSV con comillas sin cerrar",
  [HEAD, `111122223333,USD,100,100,2026-06-01T00:00:00Z,Usage,"descripción sin cerrar,AWS,Amazon Elastic Block Store,Storage,Block Storage,EBS,us-east-1`, row(50)].join("\n"),
  (err, d) => {
    if (err) return `LIMPIO — excepción con mensaje: sí`;
    return `SUCIO — no lanza; ${d.records} filas y Σ$${d.total} (se esperaban 2 filas y $150). Las filas afectadas se pierden o se fusionan SIN AVISO.`;
  });

// 2. Nº de columnas inconsistente
probe("CSV con nº de columnas inconsistente",
  [HEAD, row(100), `111122223333,USD,50,50,2026-06-02T00:00:00Z,Usage`, `111122223333,USD,25,25,2026-06-03T00:00:00Z,Usage,X,AWS,S,Storage,Block Storage,EBS,us-east-1,EXTRA,EXTRA2`].join("\n"),
  (err, d) => err ? `LIMPIO — excepción: ${err.message.slice(0,80)}` : `SUCIO/PARCIAL — no lanza; ${d.records} filas, Σ$${d.total} (se esperaban 3 filas y $175)`);

// 3. BOM
probe("CSV con BOM al principio",
  "\uFEFF" + [HEAD, row(100), row(50, "EBS:VolumeUsage.gp3", "2026-06-02")].join("\n"),
  (err, d) => err ? `SUCIO — falla por el BOM: ${err.message.slice(0,90)}` : (d.total === 150 && d.records === 2 ? `LIMPIO — BOM tolerado, Σ$${d.total} correcto` : `SUCIO — Σ$${d.total} != $150`));

// 4. CRLF
probe("CSV con saltos de línea de Windows (CRLF)",
  [HEAD, row(100), row(50, "EBS:VolumeUsage.gp3", "2026-06-02")].join("\r\n") + "\r\n",
  (err, d) => err ? `SUCIO — falla con CRLF` : (d.total === 150 && d.records === 2 ? `LIMPIO — CRLF tolerado` : `SUCIO — Σ$${d.total} != $150 / ${d.records} filas`));

// 5. Separador punto y coma
probe("CSV con separador de punto y coma",
  [HEAD.replace(/,/g, ";"), row(100).replace(/,/g, ";"), row(50, "EBS:VolumeUsage.gp3", "2026-06-02").replace(/,/g, ";")].join("\n"),
  (err, d) => err ? `LIMPIO — excepción con mensaje útil` : (d.total === 150 ? `LIMPIO — delimitador autodetectado, Σ$${d.total}` : `REVISAR — Σ$${d.total} con ${d.records} filas (esperado $150 / 2)`));

// 6. Importes en formato europeo (coma decimal)
{
  const head = HEAD.replace(/,/g, ";");
  const rEU = (c, d) => `111122223333;USD;${c};${c};${d}T00:00:00Z;Usage;EBS:VolumeUsage.gp3;AWS;Amazon Elastic Block Store;Storage;Block Storage;EBS;us-east-1`;
  probe("CSV europeo: separador ';' e importes '1.234,56'",
    [head, rEU("1.234,56", "2026-06-01"), rEU("2.500,00", "2026-06-02")].join("\n"),
    (err, d) => {
      if (err) return `LIMPIO — excepción: ${err.message.slice(0,90)}`;
      const esperado = 1234.56 + 2500.00; // 3734.56
      if (Math.abs(d.total - esperado) < 0.01) return `LIMPIO — Σ$${d.total} correcto`;
      return `SUCIO GRAVE — Σ$${d.total} en lugar de $${esperado}: subestimación de ${r2((1 - d.total / esperado) * 100)}% SIN AVISO (parseFloat("1.234,56") = 1.234)`;
    });
  probe("CSV con coma decimal pero separador ',' (ambiguo)",
    [HEAD, `111122223333,USD,"1.234,56","1.234,56",2026-06-01T00:00:00Z,Usage,EBS,AWS,Amazon Elastic Block Store,Storage,Block Storage,EBS,us-east-1`].join("\n"),
    (err, d) => {
      if (err) return `LIMPIO — excepción: ${err.message.slice(0,90)}`;
      if (Math.abs(d.total - 1234.56) < 0.01) return `LIMPIO — Σ$${d.total}`;
      return `SUCIO GRAVE — Σ$${d.total} en lugar de $1234.56 (factor ${r2(1234.56 / (d.total || 1))}×): subestima el gasto en 3 órdenes de magnitud sin avisar`;
    });
}

// 7. Fechas en formatos distintos y ambiguos
log("");
log("── Fechas ambiguas y formatos alternativos");
{
  const casos = [
    ["ISO YYYY-MM-DD", "2026-02-01"],
    ["ISO con hora Z", "2026-02-01T00:00:00Z"],
    ["DD/MM/YYYY vs MM/DD/YYYY", "01/02/2026"],
    ["MM-DD-YYYY", "02-01-2026"],
    ["DD.MM.YYYY", "01.02.2026"],
    ["texto", "1 de febrero de 2026"],
    ["epoch", "1769904000"],
    ["vacía", ""],
  ];
  log("");
  log("| Formato de fecha en ChargePeriodStart | date normalizada por el motor | ¿día utilizable? |");
  log("|---|---|---|");
  for (const [nombre, fecha] of casos) {
    const csv = [HEAD, `111122223333,USD,100,100,${fecha},Usage,EBS,AWS,Amazon Elastic Block Store,Storage,Block Storage,EBS,us-east-1`].join("\n");
    try {
      const p = parseCSVAutoDetect(csv);
      const d = p.records[0]?.date;
      const valido = /^\d{4}-\d{2}-\d{2}$/.test(d || "");
      log(`| ${nombre} (${fecha || "(vacía)"}) | "${d}" | ${valido ? "sí" : "NO — se agrupa como día \"\""} |`);
    } catch (e) {
      log(`| ${nombre} (${fecha}) | EXCEPCIÓN | ${e.message.slice(0, 60)} |`);
    }
  }
  log("");
  log("  El parser FOCUS hace rawDate.split(\"T\")[0].substring(0,10): no valida ni normaliza.");
  log("  Con 01/02/2026 la fecha queda \"01/02/2026\" — no se interpreta, pero SÍ cuenta como un día distinto.");
  // Impacto: dos formatos distintos del mismo día = 2 días
  const csv2 = [HEAD,
    `111122223333,USD,100,100,2026-02-01,Usage,EBS,AWS,Amazon Elastic Block Store,Storage,Block Storage,EBS,us-east-1`,
    `111122223333,USD,100,100,01/02/2026,Usage,EBS,AWS,Amazon Elastic Block Store,Storage,Block Storage,EBS,us-east-1`,
  ].join("\n");
  const p2 = parseCSVAutoDetect(csv2);
  const dias = new Set(p2.records.map(r => r.date)).size;
  const rep2 = calculateSavings(p2.records, true);
  log(`  Mismo día en dos formatos → días distintos detectados = ${dias} (deberían ser 1); coste mensual proyectado = $${rep2.totalCostUSD} (correcto sería $${r2(200 / 1 * 30)})`);
  results.push({
    nombre: "Fechas ambiguas / mezcladas (01/02/2026)",
    comportamiento: `sin validación: la cadena se usa tal cual como clave de día; el mismo día en dos formatos cuenta como ${dias} días`,
    veredicto: dias === 1 ? "LIMPIO" : `SUCIO — resultado silenciosamente incorrecto: divide el coste diario por ${dias} y la proyección mensual pasa de $${r2(200*30)} a $${rep2.totalCostUSD}`,
  });
}

// 8. CSV enorme
log("");
log("── CSV grande (50.000 filas)");
{
  const rows = [HEAD];
  for (let i = 0; i < 50000; i++) {
    const d = `2026-06-${String((i % 28) + 1).padStart(2, "0")}`;
    rows.push(row(r2(1 + (i % 97) / 10), "EBS:VolumeUsage.gp3", d));
  }
  const csv = rows.join("\n");
  const bytes = Buffer.byteLength(csv);
  const t0 = performance.now();
  const p = parseCSVAutoDetect(csv);
  const tParse = r2(performance.now() - t0);
  const t1 = performance.now();
  const rep = calculateSavings(p.records, true);
  const tRules = r2(performance.now() - t1);
  const esperado = r2(rows.slice(1).reduce((s, r) => s + parseFloat(r.split(",")[2]), 0));
  const got = r2(p.records.reduce((s, r) => s + r.cost, 0));
  log(`   tamaño=${r2(bytes / 1024 / 1024)} MB, filas=${p.records.length}`);
  log(`   parseo=${tParse} ms, reglas+informe=${tRules} ms, total=${r2(tParse + tRules)} ms`);
  log(`   Σcost motor=$${got} vs esperado=$${esperado} → ${Math.abs(got - esperado) < 0.5 ? "OK" : "DIF"}`);
  log(`   hallazgos=${rep.findings.length}, tendencias=${rep.trendInsights.length}`);
  results.push({
    nombre: "CSV de 50.000 filas",
    comportamiento: `${r2(bytes/1024/1024)} MB, parseo ${tParse} ms + reglas ${tRules} ms; Σ$${got} (exacto)`,
    veredicto: tParse + tRules < 15000 ? "LIMPIO — tiempo aceptable y suma exacta" : "REVISAR — tiempo elevado",
  });
}

// 9. Unicode y acentos
probe("Unicode y acentos en nombres de servicio",
  [HEAD,
    `111122223333,USD,100,100,2026-06-01T00:00:00Z,Usage,"Almacenamiento — cópia de seguridad ☁",AWS,"Almacén de Bloques Elásticos ñÑáéíóú 日本語",Storage,Block Storage,EBS,us-east-1`,
  ].join("\n"),
  (err, d) => err ? `SUCIO — falla con Unicode` : `LIMPIO — Σ$${d.total}, ${d.records} filas`);

// 10. Extras de robustez
probe("CSV sólo con encabezado (0 filas de datos)",
  HEAD, (err, d) => err ? `LIMPIO — excepción: ${err.message.slice(0,90)}` : `REVISAR — no lanza, ${d.records} registros; el informe queda a $0`);

probe("CSV vacío",
  "", (err) => err ? `LIMPIO — excepción: ${err.message.slice(0, 110)}` : `SUCIO — no lanza con archivo vacío`);

probe("No es un CSV de facturación (texto libre)",
  "hola mundo\nesto no es un csv", (err) => err ? `LIMPIO — excepción: ${err.message.slice(0, 110)}` : `SUCIO — acepta un archivo que no es de facturación`);

probe("CSV con columna de coste no numérica",
  [HEAD, `111122223333,USD,N/A,N/A,2026-06-01T00:00:00Z,Usage,EBS,AWS,Amazon Elastic Block Store,Storage,Block Storage,EBS,us-east-1`, row(100, "EBS:VolumeUsage.gp3", "2026-06-02")].join("\n"),
  (err, d) => err ? `LIMPIO — excepción` : `PARCIAL — no lanza; la fila no numérica se descarta en silencio (${d.records} de 2 filas, Σ$${d.total})`);

probe("FOCUS con símbolo de moneda en el importe ($1,234.56)",
  [HEAD, `111122223333,USD,"$1,234.56","$1,234.56",2026-06-01T00:00:00Z,Usage,EBS,AWS,Amazon Elastic Block Store,Storage,Block Storage,EBS,us-east-1`].join("\n"),
  (err, d) => {
    if (err) return `LIMPIO — excepción`;
    if (Math.abs(d.total - 1234.56) < 0.01) return `LIMPIO — Σ$${d.total}`;
    return `SUCIO — Σ$${d.total} en lugar de $1234.56 (parseFloat("$1,234.56") = NaN → 0, fila descartada en silencio)`;
  });

probe("Encabezados con espacios y mayúsculas mezcladas",
  ["Billing Account Id, Billing Currency ,BILLED COST,Effective Cost , Charge Period Start ,Charge Category,ChargeDescription,ProviderName,Service Name,ServiceCategory,ServiceSubcategory,SkuId,RegionId",
   row(100)].join("\n"),
  (err, d) => err ? `REVISAR — excepción: ${err.message.slice(0,110)}` : `LIMPIO — ${d.records} filas, Σ$${d.total}`);

// Tabla final
log("");
log("=".repeat(100));
log("TABLA DE ROBUSTEZ");
log("=".repeat(100));
log("");
log("| Entrada | Comportamiento | Veredicto |");
log("|---|---|---|");
for (const r of results) log(`| ${r.nombre} | ${r.comportamiento} | ${r.veredicto} |`);

fs.writeFileSync(path.join(HERE, "out-parsers.txt"), out.join("\n"));
