/**
 * i18n glossary + dictionary parity tests.
 * Run: npx tsx test-data/test-i18n-glossary.mjs
 *
 * Guards three things the type system cannot see:
 *   - that es.ts and en.ts describe the same tree (tsc catches this too, but the
 *     suite reports WHICH keys drifted);
 *   - that protected terms survived translation with their exact spelling;
 *   - that no English leaf was left blank next to a filled Spanish one.
 */

const { es } = await import("../src/i18n/dictionaries/es.ts");
const { en } = await import("../src/i18n/dictionaries/en.ts");
const { PROTECTED_TERMS, findMissingProtectedTerms } = await import("../src/i18n/glossary.ts");

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  PASS  ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  FAIL  ${label}${detail ? ` → ${detail}` : ""}`);
  failed++;
}

function check(label, ok, detail) {
  ok ? pass(label) : fail(label, detail);
}

/** Flattens a nested dictionary into { "a.b.c": "value" }. */
function flatten(node, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

const flatEs = flatten(es);
const flatEn = flatten(en);

console.log("i18n: glosario y paridad de diccionarios\n");

// ── 1. Same key set, recursively ──────────────────────────────────────────────
console.log("── Paridad de claves es/en ───────────────────────────────────");
{
  const esKeys = Object.keys(flatEs);
  const enKeys = Object.keys(flatEn);
  const missingInEn = esKeys.filter((k) => !(k in flatEn));
  const extraInEn = enKeys.filter((k) => !(k in flatEs));

  check(
    `en.ts no le faltan claves (${esKeys.length} claves en es.ts)`,
    missingInEn.length === 0,
    `faltan: ${missingInEn.join(", ")}`
  );
  check(
    "en.ts no tiene claves de más",
    extraInEn.length === 0,
    `sobran: ${extraInEn.join(", ")}`
  );
  check(
    "los valores hoja son strings en ambos idiomas",
    [...esKeys, ...enKeys].every((k) => typeof (flatEs[k] ?? flatEn[k]) === "string"),
    "hay una hoja que no es string"
  );
}

// ── 2. Protected terms survive translation ────────────────────────────────────
console.log("\n── Términos protegidos en las traducciones ───────────────────");
{
  const offenders = [];
  for (const [key, source] of Object.entries(flatEs)) {
    const translation = flatEn[key];
    if (typeof translation !== "string") continue;
    const missing = findMissingProtectedTerms(source, translation);
    if (missing.length > 0) offenders.push(`${key} → perdió ${missing.join(", ")}`);
  }
  check(
    `ninguna traducción pierde un término protegido (${PROTECTED_TERMS.length} términos vigilados)`,
    offenders.length === 0,
    offenders.join(" | ")
  );

  // Same rule applied to the slug label maps, which are translated text too.
  const { CATEGORY_LABELS, CONFIDENCE_LABELS_I18N, EFFORT_LABELS, RISK_LABELS } = await import(
    "../src/i18n/labels.ts"
  );
  const labelMaps = { CATEGORY_LABELS, CONFIDENCE_LABELS_I18N, EFFORT_LABELS, RISK_LABELS };
  const labelOffenders = [];
  for (const [mapName, map] of Object.entries(labelMaps)) {
    for (const slug of Object.keys(map.es)) {
      const missing = findMissingProtectedTerms(map.es[slug], map.en[slug] ?? "");
      if (missing.length > 0) labelOffenders.push(`${mapName}.${slug} → perdió ${missing.join(", ")}`);
    }
  }
  check(
    "los mapas de etiquetas (labels.ts) conservan los términos protegidos",
    labelOffenders.length === 0,
    labelOffenders.join(" | ")
  );

  // The slugs themselves are identifiers: both locales must key on the same set.
  const slugOffenders = Object.entries(labelMaps)
    .filter(([, map]) => {
      const esSlugs = Object.keys(map.es).sort().join("|");
      const enSlugs = Object.keys(map.en).sort().join("|");
      return esSlugs !== enSlugs;
    })
    .map(([name]) => name);
  check(
    "los slugs de labels.ts son idénticos en es y en",
    slugOffenders.length === 0,
    `divergen: ${slugOffenders.join(", ")}`
  );
}

// ── 3. findMissingProtectedTerms behaviour ────────────────────────────────────
console.log("\n── findMissingProtectedTerms ─────────────────────────────────");
{
  const cases = [
    // [label, source, translation, expected missing]
    [
      "detecta la traducción de un nombre de producto",
      "Sin descuentos por compromiso (Savings Plans)",
      "No commitment discounts (planes de ahorro)",
      ["Savings Plans"],
    ],
    [
      "acepta la traducción que conserva el término",
      "Sin descuentos por compromiso (Savings Plans)",
      "No commitment discounts (Savings Plans)",
      [],
    ],
    [
      "es sensible a mayúsculas: 'savings plans' no cuenta",
      "Activa Savings Plans",
      "Enable savings plans",
      ["Savings Plans"],
    ],
    [
      "columna FOCUS perdida en la traducción",
      "Usamos BilledCost y EffectiveCost",
      "We use costo facturado and EffectiveCost",
      ["BilledCost"],
    ],
    [
      "término con ':' (metacarácter escapado) detectado",
      "Ver CO:05 y CO:07 del marco de Azure",
      "See CO:05 in the Azure framework",
      ["CO:07"],
    ],
    [
      "término con guion (Intelligent-Tiering) conservado",
      "Activa Intelligent-Tiering en el bucket",
      "Enable Intelligent-Tiering on the bucket",
      [],
    ],
    [
      "término con guion traducido se detecta",
      "Activa Intelligent-Tiering en el bucket",
      "Enable niveles inteligentes on the bucket",
      ["Intelligent-Tiering"],
    ],
    [
      "límite de palabra: 'CUD' no dispara dentro de 'CUDA'",
      "Los kernels CUDA del entrenamiento",
      "The training CUDA kernels",
      [],
    ],
    [
      "límite de palabra: 'CUD' suelto sí se vigila",
      "Aplica CUD en Google Cloud",
      "Apply descuentos por uso comprometido in Google Cloud",
      ["CUD"],
    ],
    [
      "límite de palabra: 'CUR' no dispara dentro de 'CURRENCY'",
      "La columna CURRENCY del export",
      "The export's CURRENCY column",
      [],
    ],
    [
      "id de regla perdido",
      "El hallazgo NAT-GW-001 lo explica",
      "The finding explains it",
      ["NAT-GW-001"],
    ],
    [
      "texto sin términos protegidos no genera ruido",
      "Cargando…",
      "Loading…",
      [],
    ],
  ];

  for (const [label, source, translation, expected] of cases) {
    const actual = findMissingProtectedTerms(source, translation);
    check(
      label,
      actual.length === expected.length && expected.every((t) => actual.includes(t)),
      `esperado [${expected.join(", ")}], obtenido [${actual.join(", ")}]`
    );
  }

  // Every protected term must be detectable in isolation, otherwise a bad escape
  // would silently disable part of the list.
  const undetectable = PROTECTED_TERMS.filter(
    (term) => findMissingProtectedTerms(`prefijo ${term} sufijo`, "nada").length === 0
  );
  check(
    `los ${PROTECTED_TERMS.length} términos protegidos son detectables (escapes correctos)`,
    undetectable.length === 0,
    `no detectados: ${undetectable.join(", ")}`
  );

  const duplicates = PROTECTED_TERMS.filter((t, i) => PROTECTED_TERMS.indexOf(t) !== i);
  check("la lista de términos protegidos no tiene duplicados", duplicates.length === 0, duplicates.join(", "));
}

// ── 4. No blank English leaf next to a filled Spanish one ─────────────────────
console.log("\n── Traducciones vacías ───────────────────────────────────────");
{
  const blanks = Object.entries(flatEs)
    .filter(([key, source]) => source.trim() !== "" && (flatEn[key] ?? "").trim() === "")
    .map(([key]) => key);
  check(
    "ninguna cadena de en.ts está vacía teniendo texto en es.ts",
    blanks.length === 0,
    `vacías: ${blanks.join(", ")}`
  );

  const blanksEs = Object.entries(flatEs)
    .filter(([, source]) => source.trim() === "")
    .map(([key]) => key);
  check("ninguna cadena de es.ts está vacía", blanksEs.length === 0, `vacías: ${blanksEs.join(", ")}`);
}

// ── 5. Interpolation and plural machinery ─────────────────────────────────────
console.log("\n── Interpolación y plurales ──────────────────────────────────");
{
  const { interpolate, formatPlural, translate, DICTIONARIES } = await import(
    "../src/i18n/translate.ts"
  );

  check(
    "interpolate sustituye el marcador",
    interpolate("Cambiar a {language}", { language: "English" }) === "Cambiar a English"
  );
  check(
    "interpolate deja el marcador desconocido visible",
    interpolate("Hola {nombre}", {}) === "Hola {nombre}"
  );
  check("formatPlural elige el singular", formatPlural(es.common.day, 1) === "1 día");
  check("formatPlural elige el plural", formatPlural(es.common.day, 3) === "3 días");
  check("formatPlural en inglés: singular", formatPlural(en.common.day, 1) === "1 day");
  check("formatPlural en inglés: plural", formatPlural(en.common.day, 0) === "0 days");
  check(
    "translate resuelve rutas por punto",
    translate(DICTIONARIES.en, "header.newAudit") === "New audit"
  );
  check(
    "translate cae al español si la clave no existe en el diccionario dado",
    translate({ header: {} }, "header.newAudit") === "Nueva auditoría"
  );

  // Every marker in the Spanish string must exist in the English one, or the
  // translated sentence would drop a value.
  const markerMismatches = Object.entries(flatEs)
    .filter(([key, source]) => {
      const markers = (str) => (str.match(/\{(\w+)\}/g) ?? []).sort().join(",");
      return markers(source) !== markers(flatEn[key] ?? "");
    })
    .map(([key]) => key);
  check(
    "los marcadores de interpolación coinciden en ambos idiomas",
    markerMismatches.length === 0,
    `difieren: ${markerMismatches.join(", ")}`
  );
}

// ── 6. <html lang> follows the locale ─────────────────────────────────────────
console.log("\n── document.documentElement.lang ─────────────────────────────");
{
  const { applyDocumentLocale } = await import("../src/i18n/document-locale.ts");
  const { LOCALES, DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isLocale } = await import(
    "../src/i18n/config.ts"
  );

  // Minimal stand-in for the DOM: the helper only ever touches this one attribute.
  const fakeDocument = { documentElement: { lang: "" } };
  globalThis.document = fakeDocument;
  try {
    for (const locale of LOCALES) {
      applyDocumentLocale(locale);
      check(`applyDocumentLocale("${locale}") escribe lang="${locale}"`, fakeDocument.documentElement.lang === locale, `lang=${fakeDocument.documentElement.lang}`);
    }
  } finally {
    delete globalThis.document;
  }

  check("applyDocumentLocale no explota sin DOM (SSR)", (() => {
    try {
      applyDocumentLocale(DEFAULT_LOCALE);
      return true;
    } catch {
      return false;
    }
  })());

  check("LOCALE_STORAGE_KEY comparte el namespace del tema", LOCALE_STORAGE_KEY === "nimbus-locale");
  check("isLocale acepta es/en y rechaza el resto", isLocale("es") && isLocale("en") && !isLocale("fr") && !isLocale(null) && !isLocale("ES"));
  check("DEFAULT_LOCALE es español", DEFAULT_LOCALE === "es");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
