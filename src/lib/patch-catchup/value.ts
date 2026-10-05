/**
 * Cosmetic text folds and exact-decimal arithmetic for Catch-Up (PH3-A §9–§10).
 *
 * Everything here is an ENUMERATED fold — spacing, case, quote/dash variants,
 * two whole-token synonyms, one unit spelling, decimal literal form. Nothing is
 * semantic or fuzzy: a qualifier (`bonus`, `base`, `max`, `True Form`), a
 * parenthetical, a `%`, a trailing note or a unit's presence/absence always
 * survives, so two values that differ in meaning can never compare equal.
 *
 * Why not reuse `patch-impact/grammar.ts`: that grammar is a mirror of the
 * backend's BASE-STAT grammar (flat/compound/percent scalars, floats). Catch-Up
 * compares arbitrary ability values (rank arrays, ratios, parentheticals) and
 * PH3-A requires exact decimals, never binary floats.
 */

import type { ValueFact } from "./types";

/* -------------------------------------------------------------------------- */
/* Shared character folds                                                     */
/* -------------------------------------------------------------------------- */

/** U+2010 ‐ U+2011 ‑ U+2012 ‒ U+2013 – U+2014 — U+2212 − */
const DASH_VARIANTS = /[‐‑‒–—−]/g;
const SINGLE_QUOTE_VARIANTS = /[‘’‛]/g;
const DOUBLE_QUOTE_VARIANTS = /[“”‟]/g;

function foldCharacters(input: string): string {
  return input
    .normalize("NFKC")
    .replace(SINGLE_QUOTE_VARIANTS, "'")
    .replace(DOUBLE_QUOTE_VARIANTS, '"')
    .replace(DASH_VARIANTS, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cosmetic fold for entity, group and property names: NFKC, curly quotes →
 * straight, Unicode dashes/minus → `-`, whitespace collapsed, one trailing `:`
 * stripped, case-folded. NO token rewriting (`&` stays `&`, no abbreviations,
 * no plural folding).
 */
export function canonicalLabel(input: string | null | undefined): string {
  if (typeof input !== "string") return "";
  return foldCharacters(input)
    .replace(/:+$/, "")
    .trim()
    .toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Values                                                                     */
/* -------------------------------------------------------------------------- */

const SENTINELS = new Set(["removed", "unchanged", "none", "n/a"]);

/**
 * A raw value may take part in a chain only if it is non-null, contains at
 * least one digit, is not truncated (`…` / `...`) and is not a sentinel.
 */
export function isEligibleValue(raw: string | null | undefined): raw is string {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (trimmed === "") return false;
  if (!/\d/.test(trimmed)) return false;
  if (trimmed.includes("…") || trimmed.includes("...")) return false;
  if (SENTINELS.has(trimmed.toLowerCase())) return false;
  return true;
}

/**
 * One numeric literal in canonical-candidate form. A literal glued to a letter,
 * a digit group (`1,000`) or another number is not touched, so only a clean
 * decimal like `0.60` / `.6` is rewritten.
 */
const NUMBER_TOKEN = /(?<![\w.,])(\d+\.\d+|\.\d+|\d+)(?![\d,])/g;

/** Exact decimal literal canonical form: `0.60` → `0.6`, `.6` → `0.6`, `5.0` → `5`, `007` → `7`. */
function canonicalDecimalLiteral(literal: string): string {
  const dot = literal.indexOf(".");
  const rawInt = dot === -1 ? literal : literal.slice(0, dot);
  const rawFrac = dot === -1 ? "" : literal.slice(dot + 1);
  const int = rawInt.replace(/^0+(?=\d)/, "") || "0";
  const frac = rawFrac.replace(/0+$/, "");
  return frac === "" ? int : `${int}.${frac}`;
}

/**
 * Canonical form of a Riot value, or null when the value is not chain-eligible.
 * The enumerated folds, in order:
 *  1. NFKC; curly quotes → straight; Unicode dashes/minus → `-`; whitespace.
 *  2. Spacing only: `/` → ` / `, `( ` → `(`, ` )` → `)`, `(+ ` → `(+`.
 *  3. Case-fold.
 *  4. Whole-token synonyms, exactly two: `ability power` → `ap`,
 *     `attack damage` → `ad` (qualifiers survive: `bonus attack damage` →
 *     `bonus ad`, never `ad`).
 *  5. A seconds unit attached to a digit → `s` (`16 seconds` ≡ `16s`; `5` ≠ `5s`).
 *  6. Decimal literal form via exact decimal parsing.
 */
export function canonicalValue(raw: string | null | undefined): string | null {
  if (!isEligibleValue(raw)) return null;
  const folded = foldCharacters(raw)
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\(\+\s+/g, "(+")
    .toLowerCase()
    .replace(/\bability power\b/g, "ap")
    .replace(/\battack damage\b/g, "ad")
    .replace(/(\d)\s*(?:seconds|second|secs|sec|s)\b/g, "$1s")
    .replace(NUMBER_TOKEN, (literal) => canonicalDecimalLiteral(literal));
  return folded;
}

/* -------------------------------------------------------------------------- */
/* Templates                                                                  */
/* -------------------------------------------------------------------------- */

export type ValueTemplate = {
  /** The canonical string with every numeric literal replaced by `#`. */
  template: string;
  /** The literals, exact decimal strings, in order. */
  numbers: string[];
};

/**
 * Split a canonical value into its template and numbers. Two values are
 * COMPARABLE (per-component arithmetic is allowed) iff their templates are
 * identical, which also fixes the rank-array length, `%` placement, ratio-basis
 * words, level ranges and trailing qualifiers.
 */
export function valueTemplate(canonical: string): ValueTemplate {
  const numbers: string[] = [];
  const template = canonical.replace(NUMBER_TOKEN, (literal) => {
    numbers.push(literal);
    return "#";
  });
  return { template, numbers };
}

/** Verbatim value plus its safe normalisation, or null when not chain-eligible. */
export function valueFact(raw: string | null | undefined): ValueFact | null {
  const canonical = canonicalValue(raw);
  if (canonical === null || typeof raw !== "string") return null;
  const { template, numbers } = valueTemplate(canonical);
  return { raw, canonical, template, numbers };
}

/* -------------------------------------------------------------------------- */
/* Exact decimals                                                             */
/* -------------------------------------------------------------------------- */

/** `value = units / 10^scale`. Never a binary float. */
export type Decimal = { units: bigint; scale: number };

/** Parse a canonical non-negative decimal literal (digits with an optional fraction). */
export function parseDecimal(literal: string): Decimal {
  const dot = literal.indexOf(".");
  if (dot === -1) return { units: BigInt(literal), scale: 0 };
  const frac = literal.slice(dot + 1);
  return { units: BigInt(`${literal.slice(0, dot)}${frac}`), scale: frac.length };
}

function align(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [
    a.units * 10n ** BigInt(scale - a.scale),
    b.units * 10n ** BigInt(scale - b.scale),
    scale,
  ];
}

export function compareDecimals(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const [x, y] = align(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function subtractDecimals(a: Decimal, b: Decimal): Decimal {
  const [x, y, scale] = align(a, b);
  return { units: x - y, scale };
}

export function decimalSign(a: Decimal): -1 | 0 | 1 {
  return a.units < 0n ? -1 : a.units > 0n ? 1 : 0;
}

export function absDecimal(a: Decimal): Decimal {
  return a.units < 0n ? { units: -a.units, scale: a.scale } : a;
}

/** Exact decimal string without trailing zeros: `{units: -50n, scale: 1}` → `-5`. */
export function formatDecimal(a: Decimal): string {
  const negative = a.units < 0n;
  let digits = (negative ? -a.units : a.units).toString();
  if (a.scale > 0) {
    digits = digits.padStart(a.scale + 1, "0");
    const int = digits.slice(0, digits.length - a.scale);
    const frac = digits.slice(digits.length - a.scale).replace(/0+$/, "");
    digits = frac === "" ? int : `${int}.${frac}`;
  }
  return negative && digits !== "0" ? `-${digits}` : digits;
}
