/**
 * Amount / date coercion tests.
 * Run: npx tsx test-data/test-coerce.mjs
 */

const {
  coerceAmount,
  normalizeDate,
  detectDateOrder,
  DEFAULT_AMBIGUOUS_DATE_ORDER,
} = await import("../src/engine/parsers/coerce.ts");

let passed = 0;
let failed = 0;

function eq(label, actual, expected) {
  const ok = Object.is(actual, expected);
  if (ok) {
    console.log(`  PASS  ${label} → ${fmt(actual)}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label} → esperado ${fmt(expected)}, obtenido ${fmt(actual)}`);
    failed++;
  }
}

function fmt(v) {
  if (v === null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  return String(v);
}

function amount(input, expected) {
  eq(`coerceAmount(${JSON.stringify(input)})`, coerceAmount(input), expected);
}

function date(input, expected, order) {
  const label = `normalizeDate(${JSON.stringify(input)}${order ? `, "${order}"` : ""})`;
  eq(label, normalizeDate(input, order), expected);
}

console.log("Coerción de importes y fechas\n");
console.log("── Importes: formato anglosajón ──────────────────────────────");
amount("1234.56", 1234.56);
amount("1,234.56", 1234.56);
amount("$1,234.56", 1234.56);
amount("1.5", 1.5);
amount("1.2345", 1.2345);
amount("-99.9", -99.9);
amount("0", 0); // cero es un importe válido, NO null
amount("0.00", 0);

console.log("\n── Importes: formato europeo ─────────────────────────────────");
amount("1.234,56", 1234.56);
amount("1 234,56", 1234.56);
amount("1\u00A0234,56", 1234.56); // espacio no separable (Excel / Azure)
amount("1\u202F234,56", 1234.56); // espacio fino no separable
amount("1234,56", 1234.56);
amount("1.234.567,89", 1234567.89);
amount("12,34 €", 12.34);
amount("-1.234,56", -1234.56);

console.log("\n── Importes: caso ambiguo de 3 dígitos ───────────────────────");
// Un único separador seguido de exactamente 3 dígitos = separador de miles.
amount("1.234", 1234);
amount("1,234", 1234);
amount("1.234.567", 1234567);
amount("1,234,567", 1234567);

console.log("\n── Importes: paréntesis contables y signos ───────────────────");
amount("(123.45)", -123.45);
amount("(1.234,56)", -1234.56);
amount("($1,234.56)", -1234.56);
amount("-$5", -5);
amount("+1234.56", 1234.56);

console.log("\n── Importes: no interpretables → null, nunca 0 ───────────────");
amount("", null);
amount("   ", null);
amount("N/A", null);
amount("abc", null);
amount(null, null);
amount(undefined, null);
amount("-", null);
amount("1.23.456", null); // agrupación malformada
amount(NaN, null);
amount(Infinity, null);

console.log("\n── Importes: numéricos y ruido tolerable ─────────────────────");
amount(1234.56, 1234.56);
amount(0, 0);
amount("1234.", 1234); // separador final = ruido
amount("1234.56 USD", 1234.56);
amount("USD 1234.56", 1234.56);

console.log("\n── Fechas: ISO y variantes con año primero ───────────────────");
date("2026-06-01", "2026-06-01");
date("2026-06-01T00:00:00Z", "2026-06-01");
date("2026-06-01T13:45:00", "2026-06-01");
date("2026-06-01 13:45:00", "2026-06-01");
date("2026/06/01", "2026-06-01");
date("2026.06.01", "2026-06-01");
date("2026-6-1", "2026-06-01");

console.log("\n── Fechas: ambiguas resueltas por el orden del archivo ───────");
date("01/02/2026", "2026-01-02", "month-first"); // 2 de enero
date("01/02/2026", "2026-02-01", "day-first"); // 1 de febrero
date("13/02/2026", "2026-02-13", "month-first"); // fuerza día primero por valor
date("02/13/2026", "2026-02-13", "day-first"); // fuerza mes primero por valor
date("1-2-2026", "2026-01-02", "month-first");
// Sin orden explícito se aplica el defecto documentado.
eq(
  'normalizeDate("01/02/2026") usa el defecto documentado',
  normalizeDate("01/02/2026"),
  DEFAULT_AMBIGUOUS_DATE_ORDER === "month-first" ? "2026-01-02" : "2026-02-01"
);

console.log("\n── Fechas: rechazos ──────────────────────────────────────────");
date("2026-02-31", null); // el 31 de febrero no existe
date("2026-13-01", null); // mes 13
date("31/02/2026", null); // día 31 de febrero, con día primero por valor
date("1769904000", null); // epoch numérico
date(1769904000, null);
date("1 de febrero de 2026", null);
date("", null);
date("   ", null);
date(null, null);
date("junio", null);
date("01/02/26", null); // año de 2 dígitos: habría que inventar el siglo
date("20260601", null); // compacto, indistinguible de un número

console.log("\n── Detección de orden a nivel de archivo ─────────────────────");
function order(label, samples, expectedOrder, expectedAmbiguous) {
  const d = detectDateOrder(samples);
  const ok = d.order === expectedOrder && d.ambiguous === expectedAmbiguous;
  if (ok) {
    console.log(`  PASS  ${label} → order=${d.order} ambiguous=${d.ambiguous} conflicting=${d.conflicting}`);
    passed++;
  } else {
    console.error(
      `  FAIL  ${label} → esperado order=${expectedOrder} ambiguous=${expectedAmbiguous}, ` +
        `obtenido order=${d.order} ambiguous=${d.ambiguous}`
    );
    failed++;
  }
}

// Una sola fila desambigua todo el archivo: 13 no puede ser un mes.
order(
  "una fila desambigua → día primero",
  ["01/02/2026", "02/02/2026", "13/02/2026", "04/02/2026"],
  "day-first",
  false
);
// Simétrico: el segundo componente 13 solo puede ser día.
order(
  "una fila desambigua → mes primero",
  ["01/02/2026", "02/02/2026", "02/13/2026"],
  "month-first",
  false
);
// Nada desambigua: se asume el defecto y se marca como ambiguo (reportable).
order("archivo entero ambiguo → defecto + ambiguous", ["01/02/2026", "03/04/2026"], DEFAULT_AMBIGUOUS_DATE_ORDER, true);
// Un archivo ISO nunca necesitó orden: no se marca nada.
order("archivo ISO → sin ambigüedad", ["2026-06-01", "2026-06-02T00:00:00Z"], DEFAULT_AMBIGUOUS_DATE_ORDER, false);
// Evidencia contradictoria: se marca conflicto.
const conflicting = detectDateOrder(["13/02/2026", "02/13/2026"]);
eq("detectDateOrder detecta archivo contradictorio", conflicting.conflicting, true);

// El orden del archivo se aplica a TODAS las filas ambiguas, no fila a fila.
const detected = detectDateOrder(["01/02/2026", "13/02/2026"]);
eq(
  "orden de archivo aplicado a la fila ambigua (01/02/2026 con día primero)",
  normalizeDate("01/02/2026", detected.order),
  "2026-02-01"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
