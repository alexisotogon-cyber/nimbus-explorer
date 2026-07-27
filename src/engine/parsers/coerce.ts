/**
 * Shared value coercion for every billing parser (FOCUS, AWS, Azure, GCP).
 *
 * Why this module exists: each parser used to call `parseFloat(raw) || 0` on the
 * cost column. `parseFloat` reads only the leading ASCII-decimal prefix, so a
 * European-formatted export silently collapsed to a wrong-by-1000x figure and the
 * report was generated as if nothing happened:
 *
 *   parseFloat("1.234,56")  === 1.234   → a $1,234.56 line became $1.23
 *   parseFloat("$1,234.56") === NaN → 0 → the line was dropped as "cost <= 0"
 *
 * Azure Cost Management emits comma-decimal amounts under several regional
 * settings, so this is a real export shape, not a hypothetical one.
 *
 * The same applied to dates: parsers used the raw string (or `raw.split("T")[0]`)
 * as the per-day grouping key. Since every rule projects monthly cost as
 * `total / distinctDays * 30`, two spellings of the same day doubled the day count
 * and halved every figure in the report.
 */

// ─── Amount coercion ─────────────────────────────────────────────────────────

/** Whitespace that shows up inside exported amounts: normal, non-breaking, narrow no-break, thin. */
const AMOUNT_WHITESPACE = /[\s\u00A0\u202F\u2009\u2007]/g;

/**
 * Characters stripped before numeric interpretation: currency symbols
 * ($ € £ ¥ ₹ ₽ ₩ ¢ ƒ …) plus 3-letter ISO codes appended or prepended to the
 * figure ("1234.56 USD", "USD 1234.56").
 *
 * Written as an explicit character class rather than the `\p{Sc}` Unicode property
 * because the project's tsconfig has no `target` (so it compiles as ES5, where the
 * regex `u` flag is unavailable). The class covers the Latin-1 and Currency
 * Symbols blocks, which is every symbol a cloud invoice uses.
 */
const CURRENCY_SYMBOL = /[$\u00A2-\u00A5\u00A9\u0192\u058F\u060B\u09F2\u09F3\u20A0-\u20BF]/g;
const ISO_CURRENCY_CODE = /^[A-Za-z]{3}|[A-Za-z]{3}$/g;

/**
 * Coerces a raw cell into a number, or returns `null` when the value cannot be
 * interpreted.
 *
 * `null` and `0` are deliberately different results. `0` is a valid amount (a
 * zero-cost usage line); `null` means "this cell was not readable". The engine's
 * `cost <= 0` filters conflated the two, so an unreadable amount looked exactly
 * like a free line and disappeared without a trace.
 *
 * Decision rules, each with the example that justifies it:
 *
 *  1. Currency symbols, ISO codes and every flavour of space are noise:
 *       "$1,234.56" → 1234.56 ; "12,34 €" → 12.34 ; "1 234,56" → 1234.56
 *       (the space may be U+00A0 or U+202F in Excel/Azure exports).
 *  2. Parentheses mean negative — standard accounting convention:
 *       "(123.45)" → -123.45
 *  3. Both `,` and `.` present: the RIGHTMOST one is the decimal separator, the
 *     other is the thousands separator:
 *       "1,234.56"     → 1234.56   (dot is right → dot decimal)
 *       "1.234,56"     → 1234.56   (comma is right → comma decimal)
 *       "1.234.567,89" → 1234567.89
 *  4. Only one separator kind present, appearing MORE THAN ONCE: it can only be a
 *     thousands separator, since a number has at most one decimal point:
 *       "1,234,567" → 1234567 ; "1.234.567" → 1234567
 *  5. Only one separator, appearing ONCE — decided by the digit count after it:
 *       exactly 3 digits and no other separator → THOUSANDS separator
 *         "1.234" → 1234 ; "1,234" → 1234
 *       1, 2, or 4+ digits → DECIMAL separator
 *         "1.5" → 1.5 ; "1,23" → 1.23 ; "1.2345" → 1.2345
 *     The 3-digit case is genuinely ambiguous ("1.234" is 1234 in de-DE and 1.234
 *     in en-US). It is resolved as thousands because billing exports quote money
 *     with 2 (or 4+, for unit prices) decimals, essentially never with 3 — while
 *     4-digit thousands groups are everywhere. Reading it as a decimal would
 *     understate a $1,234 line as $1.23, which is the exact failure being fixed;
 *     reading it as thousands overstates a hypothetical 3-decimal $1.234 line by
 *     less than a dollar. The asymmetry of the damage decides the tie.
 *
 *     BUT that default is a per-VALUE guess, and hourly meter rates ("2.304",
 *     "8.952" — 3 real decimals, common on Azure and AWS) hit it constantly.
 *     Measured on a real-shaped fixture: 60 such values inflated a $561,600
 *     period total by +$337,342 (60%), silently — no unreadable-amount warning,
 *     because the value WAS read, just read as the wrong number. See rule 9.
 *  9. Optional file-level override (`decimalSeparator` argument, paired with
 *     `detectDecimalSeparator` below): when the caller has evidence for the
 *     file's actual decimal character — from OTHER values in the same column
 *     that aren't 3-digit-ambiguous — rule 5's tie is decided by that evidence
 *     instead of the thousands default. Exactly the same idea as `DateOrder`:
 *     resolved once for the whole file, never per row, so two values in one
 *     column can't be read two different ways.
 *  6. A trailing separator with no digits after it is dropped as noise:
 *       "1234." → 1234
 *  7. Malformed grouping is rejected rather than guessed:
 *       "1.23.456" → null
 *  8. Anything with no digits left after cleaning is null, never 0:
 *       "" → null ; "N/A" → null ; "abc" → null
 */
/**
 * Optional 9th rule, layered on top of the 8 above: when the caller has
 * inferred the file's decimal separator from `detectDecimalSeparator` (same
 * idea as `DateOrder`, resolved once per FILE from surrounding evidence, not
 * per value), the exactly-3-digits case in rule 5 is decided by it instead of
 * defaulting to thousands. Omitting the argument reproduces the original
 * behaviour exactly, so every existing call site (`coerceQuantity` included)
 * is unaffected.
 */
export function coerceAmount(raw: unknown, decimalSeparator?: DecimalSeparator): number | null {
  if (raw === null || raw === undefined) return null;

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }

  if (typeof raw !== "string") return null;

  let s = raw.trim();
  if (s === "") return null;

  // Rule 2 — accounting parentheses.
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }

  // Rule 1 — strip currency noise and whitespace.
  s = s.replace(CURRENCY_SYMBOL, "").replace(AMOUNT_WHITESPACE, "");
  s = s.replace(ISO_CURRENCY_CODE, "");

  // Explicit sign (after symbol stripping, so "-$5" and "$-5" both work).
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  if (s === "" || !/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;

  // Rule 6 — drop a trailing separator.
  s = s.replace(/[.,]+$/, "");
  if (s === "") return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  let integerPart: string;
  let decimalPart = "";

  if (lastComma >= 0 && lastDot >= 0) {
    // Rule 3 — rightmost separator wins.
    const decimalIndex = Math.max(lastComma, lastDot);
    integerPart = s.slice(0, decimalIndex);
    decimalPart = s.slice(decimalIndex + 1);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const occurrences = s.split(sep).length - 1;
    const digitsAfter = s.length - s.lastIndexOf(sep) - 1;

    if (occurrences > 1) {
      // Rule 4 — repeated separator can only be a thousands separator.
      integerPart = s;
    } else if (digitsAfter === 3 && sep !== decimalSeparator) {
      // Rule 5 — the documented ambiguous case. Resolved as thousands unless
      // the file-level detector identified THIS character as the file's own
      // decimal separator (rule 9), in which case it can't be thousands.
      integerPart = s;
    } else if (digitsAfter === 3 && sep === decimalSeparator) {
      // Rule 9 — file evidence overrides the thousands default.
      integerPart = s.slice(0, s.lastIndexOf(sep));
      decimalPart = s.slice(s.lastIndexOf(sep) + 1);
    } else {
      // Rule 5 — decimal separator.
      integerPart = s.slice(0, s.lastIndexOf(sep));
      decimalPart = s.slice(s.lastIndexOf(sep) + 1);
    }
  } else {
    integerPart = s;
  }

  // Remaining separators inside the integer part are thousands separators.
  const integerDigits = integerPart.replace(/[.,]/g, "");
  if (integerDigits !== "" && !/^\d+$/.test(integerDigits)) return null;

  // Rule 7 — every group after the first must be exactly 3 digits.
  const groups = integerPart.split(/[.,]/);
  if (groups.length > 1) {
    if (groups[0] === "" || groups[0].length > 3) return null;
    if (groups.slice(1).some((g) => g.length !== 3)) return null;
  }

  if (decimalPart !== "" && !/^\d+$/.test(decimalPart)) return null;

  const numeric = Number(`${integerDigits === "" ? "0" : integerDigits}.${decimalPart === "" ? "0" : decimalPart}`);
  if (!Number.isFinite(numeric)) return null;

  return negative ? -numeric : numeric;
}

// ─── Decimal separator detection ──────────────────────────────────────────────

/** Which character a file uses as the decimal point in its amount column. */
export type DecimalSeparator = "." | ",";

export interface DecimalSeparatorDetection {
  /** null when the file gave no usable evidence either way (rule 5's original default applies). */
  separator: DecimalSeparator | null;
  /** True when the file contained the 3-digit-ambiguous shape but no OTHER value settled it. */
  ambiguous: boolean;
  /** True when the file has decisive evidence for BOTH characters as decimal (inconsistent file). */
  conflicting: boolean;
}

/**
 * Classifies a single amount string for decimal-separator evidence, reusing
 * `coerceAmount`'s own cleanup so a value is judged exactly as it will later
 * be parsed. Returns the character decided as decimal for THIS value alone —
 * "." | "," when unambiguous, null when this particular value carries no
 * decisive evidence (a bare integer, a repeated separator, or exactly the
 * 3-digit shape rule 9 exists to disambiguate).
 */
function classifyAmountSample(raw: string): { decisive: DecimalSeparator | null; ambiguousShape: boolean } {
  let s = raw.trim();
  if (s === "") return { decisive: null, ambiguousShape: false };

  if (/^\(.*\)$/.test(s)) s = s.slice(1, -1).trim();
  s = s.replace(CURRENCY_SYMBOL, "").replace(AMOUNT_WHITESPACE, "").replace(ISO_CURRENCY_CODE, "");
  if (s.startsWith("-") || s.startsWith("+")) s = s.slice(1);
  if (s === "" || !/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return { decisive: null, ambiguousShape: false };

  s = s.replace(/[.,]+$/, "");
  if (s === "") return { decisive: null, ambiguousShape: false };

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    // Both present — rightmost is decimal, and that reading is definitive.
    return { decisive: lastDot > lastComma ? "." : ",", ambiguousShape: false };
  }
  if (lastComma >= 0 || lastDot >= 0) {
    const sep: DecimalSeparator = lastComma >= 0 ? "," : ".";
    const occurrences = s.split(sep).length - 1;
    const digitsAfter = s.length - s.lastIndexOf(sep) - 1;
    if (occurrences > 1) return { decisive: null, ambiguousShape: false }; // repeated → thousands, no decimal evidence
    if (digitsAfter === 3) return { decisive: null, ambiguousShape: true }; // the case rule 9 exists for
    return { decisive: sep, ambiguousShape: false }; // 1, 2, or 4+ digits → decisive
  }
  return { decisive: null, ambiguousShape: false }; // bare integer, no separator at all
}

/**
 * A lone outlier shouldn't veto a file's otherwise-consistent evidence: one
 * mistyped or hand-edited row (a "12,34" in an Azure export that's otherwise
 * dot-decimal throughout) is far more likely than a genuinely bilingual export.
 * The minority reading only counts as real conflicting evidence — not noise —
 * once it clears BOTH a floor (more than one occurrence) and a share of the
 * majority (at least 10%); a single stray row never meets the floor.
 */
const CONFLICT_MIN_COUNT = 2;
const CONFLICT_MIN_SHARE = 0.1;

/**
 * Decides the decimal separator for a whole FILE from a sample of its amount
 * column, the same way `detectDateOrder` decides date component order:
 * resolved once, not per row, from whichever values in the sample are NOT
 * themselves ambiguous. A file's 2-decimal and 4-decimal values (the common
 * case) settle it long before the rare 3-decimal ones are ever reached.
 */
export function detectDecimalSeparator(samples: Array<string | undefined | null>): DecimalSeparatorDetection {
  let dotCount = 0;
  let commaCount = 0;
  let sawAmbiguousShape = false;

  for (const sample of samples) {
    if (typeof sample !== "string") continue;
    const { decisive, ambiguousShape } = classifyAmountSample(sample);
    if (decisive === ".") dotCount++;
    else if (decisive === ",") commaCount++;
    else if (ambiguousShape) sawAmbiguousShape = true;
  }

  const [majorityCount, minorityCount, majoritySep]: [number, number, DecimalSeparator | null] =
    dotCount >= commaCount ? [dotCount, commaCount, "."] : [commaCount, dotCount, ","];

  if (majorityCount === 0) {
    // No decisive evidence of either kind — rule 5's original default applies.
    return { separator: null, ambiguous: sawAmbiguousShape, conflicting: false };
  }

  const isRealConflict =
    minorityCount >= CONFLICT_MIN_COUNT && minorityCount / majorityCount >= CONFLICT_MIN_SHARE;

  if (isRealConflict) {
    // Genuinely inconsistent file — don't invent a reading: fall back to
    // rule 5's original thousands default and say so.
    return { separator: null, ambiguous: true, conflicting: true };
  }

  return { separator: majoritySep, ambiguous: false, conflicting: false };
}

// ─── Date coercion ───────────────────────────────────────────────────────────

/** Component order of an ambiguous slash/dash date. */
export type DateOrder = "day-first" | "month-first";

/**
 * Default order applied when a whole file's slash/dash dates are ambiguous
 * (every first component <= 12 AND every second component <= 12, e.g. a file
 * where all dates are 01/02/2026-style).
 *
 * DAY-FIRST is the default, for two reasons:
 *   1. Native provider exports are ISO (YYYY-MM-DD) and never reach this branch.
 *      A slash-dated file has been through a spreadsheet or a locale-aware export,
 *      and that is precisely the locale family that also writes "1.234,56" — the
 *      reason this module exists. Day-first is the reading that matches it.
 *   2. Day-first is the ordering used by most of the world outside the US.
 *
 * This is still a GUESS, and guessing wrong shifts spend from one month to
 * another, so it is never silent: `ParseDiagnostics.ambiguousDateOrder` is set to
 * true whenever the default had to be applied, together with `assumedDateOrder`,
 * so the caller can tell the user which reading was used.
 */
export const DEFAULT_AMBIGUOUS_DATE_ORDER: DateOrder = "day-first";

/** ISO-ish: YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD, optional time and zone suffix. */
const YEAR_FIRST = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/;

/** Ambiguous: D/M/YYYY or M/D/YYYY (slash, dash or dot), optional time suffix. */
const YEAR_LAST = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[T ].*)?$/;

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Rejects 2026-02-31: the Date constructor rolls it over to March 3, so the
  // components no longer match what was asked for.
  return (
    d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Normalizes a raw date cell to `YYYY-MM-DD`, or returns `null` when the value is
 * not a date. Never returns a partially-parsed string: the previous
 * `rawDate.split("T")[0].substring(0, 10)` happily produced "01/02/2026",
 * "1769904" and "junio" as day keys.
 *
 * Accepted:
 *   "2026-06-01", "2026-06-01T00:00:00Z", "2026-06-01T00:00:00", "2026-06-01 00:00:00",
 *   "2026/06/01", "2026.06.01", "01/02/2026" and "1-2-2026" (order per `order`).
 *
 * Rejected (returns null, row must be counted as dropped):
 *   "" · "1769904000" (epoch) · "1 de febrero de 2026" · "2026-02-31" (does not exist)
 *   · 2-digit years ("01/02/26") — the century would have to be invented
 *   · compact "20260601" — indistinguishable from a plain number.
 */
export function normalizeDate(
  raw: unknown,
  order: DateOrder = DEFAULT_AMBIGUOUS_DATE_ORDER
): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return null; // epoch seconds/millis are not dates here
  if (typeof raw !== "string") return null;

  const s = raw.trim();
  if (s === "") return null;

  const yearFirst = YEAR_FIRST.exec(s);
  if (yearFirst) {
    const [, y, m, d] = yearFirst;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (!isRealDate(year, month, day)) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  const yearLast = YEAR_LAST.exec(s);
  if (yearLast) {
    const [, first, second, y] = yearLast;
    const a = Number(first);
    const b = Number(second);
    const year = Number(y);
    // Unambiguous on its own value wins over the file-level order: a first
    // component > 12 can only be a day, a second > 12 can only be a day.
    let day: number;
    let month: number;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else if (order === "day-first") {
      day = a;
      month = b;
    } else {
      month = a;
      day = b;
    }
    if (!isRealDate(year, month, day)) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  return null;
}

export interface DateOrderDetection {
  order: DateOrder;
  /** True when nothing in the sample disambiguated and the default was assumed. */
  ambiguous: boolean;
  /** True when the sample contains evidence for BOTH orders (inconsistent file). */
  conflicting: boolean;
}

/**
 * Decides the component order for a whole FILE, not row by row.
 *
 * Row-by-row guessing is what makes ambiguous dates dangerous: "03/04/2026" and
 * "13/04/2026" in the same column would be read with different orders, scattering
 * one month's spend across two. So the order is resolved once from a sample and
 * then applied to every row.
 *
 * Evidence:
 *   - any first component > 12  → day-first  ("13/02/2026" can only be 13 Feb)
 *   - any second component > 12 → month-first ("02/13/2026" can only be 13 Feb)
 * A single disambiguating row is enough to fix the order for the file.
 *
 * When both kinds of evidence appear the file is internally inconsistent
 * (`conflicting: true`); the default order is used and per-row unambiguous values
 * still win in normalizeDate, which is the best that can be done without
 * inventing data.
 *
 * When no row disambiguates, DEFAULT_AMBIGUOUS_DATE_ORDER is returned with
 * `ambiguous: true` so the caller can surface the assumption.
 */
export function detectDateOrder(samples: Array<string | undefined | null>): DateOrderDetection {
  let dayFirstEvidence = false;
  let monthFirstEvidence = false;
  let sawAmbiguousShape = false;

  for (const sample of samples) {
    if (typeof sample !== "string") continue;
    const m = YEAR_LAST.exec(sample.trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) dayFirstEvidence = true;
    else if (b > 12 && a <= 12) monthFirstEvidence = true;
    else sawAmbiguousShape = true;
  }

  if (dayFirstEvidence && monthFirstEvidence) {
    return { order: DEFAULT_AMBIGUOUS_DATE_ORDER, ambiguous: true, conflicting: true };
  }
  if (dayFirstEvidence) return { order: "day-first", ambiguous: false, conflicting: false };
  if (monthFirstEvidence) return { order: "month-first", ambiguous: false, conflicting: false };

  return {
    order: DEFAULT_AMBIGUOUS_DATE_ORDER,
    // Only flag the assumption when the file actually contains ambiguous dates.
    // A pure ISO file never needed an order in the first place.
    ambiguous: sawAmbiguousShape,
    conflicting: false,
  };
}

// ─── Parse diagnostics ───────────────────────────────────────────────────────

/**
 * Counters for rows a parser dropped, and assumptions it had to make.
 *
 * Passed in as an OPTIONAL argument to every parser rather than changing their
 * return type. Rationale for the least-invasive option: `parseFOCUSCSV` and
 * friends return `NormalizedCostRecord[]` and are called directly from
 * `focus-s3-connector.ts`, `provider-guard.ts` and several audit scripts. Turning
 * the return value into an object would break all of those call sites (and the
 * S3 connector is explicitly out of scope for this change). A module-level
 * accumulator was rejected because it is shared mutable state — two concurrent
 * requests in the Next.js server would interleave their counters. An optional
 * parameter costs nothing at existing call sites and is per-parse by construction;
 * `parseAs`/`parseCSVAutoDetect` create one and expose it on `ParseResult`.
 */
export interface ParseDiagnostics {
  /** Data rows the parser actually looked at (header excluded). */
  totalRows: number;
  /**
   * Rows excluded because they were credits/refunds (ChargeCategory "Credit",
   * ChargeClass "Correction", or simply a negative amount).
   *
   * These used to disappear through the generic `cost <= 0` filter, which made the
   * engine analyse GROSS spend while the invoice the user pays is NET. On a file
   * with meaningful credits that overstates every projection — measured at +11%
   * ($4.536 gross vs $4.086 net) on caso-complejo-azure-focus.csv.
   */
  creditRows: number;
  /** Sum of the credits excluded, as a POSITIVE number of USD. */
  creditTotalUSD: number;
  /** Rows excluded on purpose because they are not infrastructure spend (Tax). */
  taxRows: number;
  /** Sum of excluded tax rows, as a positive USD figure. */
  taxTotalUSD: number;
  /** Rows excluded because they are commitment purchases (would double-count). */
  commitmentPurchaseRows: number;
  /** Billed amount of excluded commitment purchases, as a positive USD figure. */
  commitmentPurchaseTotalUSD: number;
  /** Rows dropped because the cost cell could not be interpreted as a number. */
  unparsableAmountRows: number;
  /** Rows kept but with quantity forced to 0 because the quantity cell was unreadable. */
  unparsableQuantityRows: number;
  /** Rows dropped because the date cell was missing or not a date. */
  unparsableDateRows: number;
  /** True when the file's dates were ambiguous and DEFAULT_AMBIGUOUS_DATE_ORDER was assumed. */
  ambiguousDateOrder: boolean;
  /** True when the file contained evidence of both day-first and month-first dates. */
  conflictingDateOrder: boolean;
  /** The order actually applied to ambiguous values, null when no such value existed. */
  assumedDateOrder: DateOrder | null;
  /**
   * True when the file contained 3-digit-ambiguous amounts (see coerceAmount
   * rule 5/9) and no other value in the sample settled the file's decimal
   * separator, so the thousands default had to be assumed for them.
   */
  ambiguousDecimalSeparator: boolean;
  /** True when the file has decisive evidence for BOTH "." and "," as decimal (inconsistent file). */
  conflictingDecimalSeparator: boolean;
  /** The separator actually detected and applied to ambiguous values, null when no such value existed. */
  assumedDecimalSeparator: DecimalSeparator | null;
  /**
   * True when the file carries at least one column capable of expressing an
   * existing commitment discount (Savings Plan / Reservation / CUD), whether
   * or not any row actually uses one. Native (non-FOCUS) exports often don't
   * carry this column at all — see the parsers' PRICING_MODEL_COLUMNS /
   * credits handling — in which case `missingCommitmentsRule` cannot tell
   * "no commitments" from "can't see commitments" and must say so rather than
   * assert one with full confidence.
   */
  commitmentSignalAvailable: boolean;
  /** True zero-cost cells intentionally omitted from normalized analysis. */
  zeroCostRows: number;
  /** Future Cost Explorer summary cells excluded from observed spend. */
  forecastRows: number;
  forecastTotalUSD: number;
  /** Identifies an aggregate console download versus line-item billing. */
  sourceKind:
    | "detailed"
    | "aws-cost-explorer-summary"
    | "azure-cost-analysis-summary"
    | "gcp-console-summary";
  summaryGroupBy?: string;
  summaryGroupByLabel?: string;
  summaryGranularity?: "hourly" | "daily" | "monthly";
  summaryPeriodCount?: number;
  summaryUsageValueCount: number;
  summaryUsageTotal: number;
  summaryUsageUnit?: string;
}

export function createParseDiagnostics(): ParseDiagnostics {
  return {
    totalRows: 0,
    creditRows: 0,
    creditTotalUSD: 0,
    taxRows: 0,
    taxTotalUSD: 0,
    commitmentPurchaseRows: 0,
    commitmentPurchaseTotalUSD: 0,
    unparsableAmountRows: 0,
    unparsableQuantityRows: 0,
    unparsableDateRows: 0,
    ambiguousDateOrder: false,
    conflictingDateOrder: false,
    assumedDateOrder: null,
    ambiguousDecimalSeparator: false,
    conflictingDecimalSeparator: false,
    assumedDecimalSeparator: null,
    commitmentSignalAvailable: false,
    zeroCostRows: 0,
    forecastRows: 0,
    forecastTotalUSD: 0,
    sourceKind: "detailed",
    summaryUsageValueCount: 0,
    summaryUsageTotal: 0,
  };
}

/** Records a file-level date-order decision onto the diagnostics object. */
export function noteDateOrder(
  diagnostics: ParseDiagnostics | undefined,
  detection: DateOrderDetection
): void {
  if (!diagnostics) return;
  diagnostics.ambiguousDateOrder = detection.ambiguous;
  diagnostics.conflictingDateOrder = detection.conflicting;
  diagnostics.assumedDateOrder = detection.ambiguous ? detection.order : null;
}

/** Records a file-level decimal-separator decision onto the diagnostics object. */
export function noteDecimalSeparator(
  diagnostics: ParseDiagnostics | undefined,
  detection: DecimalSeparatorDetection
): void {
  if (!diagnostics) return;
  diagnostics.ambiguousDecimalSeparator = detection.ambiguous;
  diagnostics.conflictingDecimalSeparator = detection.conflicting;
  diagnostics.assumedDecimalSeparator = detection.separator;
}

/**
 * Cap on how many rows are sampled for date-order detection. The first
 * disambiguating row settles it, and a file whose first 2000 rows are all
 * ambiguous is ambiguous in practice.
 */
export const DATE_ORDER_SAMPLE_SIZE = 2000;

/** Coerces a quantity: unreadable becomes 0 and is counted, never drops the row. */
export function coerceQuantity(raw: unknown, diagnostics?: ParseDiagnostics): number {
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
    // A missing quantity column is normal (Cost Explorer exports omit it) and is
    // not a data-quality problem — only a present-but-garbage value is.
    return 0;
  }
  const value = coerceAmount(raw);
  if (value === null) {
    if (diagnostics) diagnostics.unparsableQuantityRows++;
    return 0;
  }
  return value;
}
