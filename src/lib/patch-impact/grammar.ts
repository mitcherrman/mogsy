/**
 * Controlled numeric grammar for Riot base-stat lines.
 *
 * A frontend mirror of the backend's `base_stat_grammar` (master `1b62f1a3`):
 * a fixed set of anchored patterns, never a natural-language parser. Anything it
 * does not recognise returns null / a refusal, and the line gets no Impact.
 *
 * Deliberately NOT reused: the patch-report resolver's `_NUM_TOKEN_RE`, which
 * reads `.658` as 658. Leading-dot numbers are a real Riot form.
 */
import { V1_PROPERTIES, type V1Property } from "./families";

/** One numeric literal; a leading dot is real (Vayne's `.658`). */
const NUMBER = String.raw`-?(?:\d+(?:\.\d+)?|\.\d+)`;

/** `34 + 5/Level`, `.658 + 3.3%/Level`, `280 + 40/level`, `3.5 + 0.55 per level`. */
const COMPOUND_RE = new RegExp(
  String.raw`^\s*(${NUMBER})\s*\+\s*(${NUMBER})\s*(%)?\s*(?:/|\bper\b)\s*level\s*$`,
  "i",
);

/** `58`, `2.35%`, `4.95 per level`, `4.5/level`. */
const SCALAR_RE = new RegExp(
  String.raw`^\s*(${NUMBER})\s*(%)?\s*(?:(?:/|\bper\b)\s*level)?\s*$`,
  "i",
);
const PER_LEVEL_SUFFIX_RE = /(?:\/|\bper\b)\s*level\s*$/i;

export type ParsedImpactValue =
  | { kind: "scalar"; value: number; percent: boolean; perLevel: boolean }
  | { kind: "compound"; base: number; growth: number; growthPercent: boolean };

/** Parse one side of a line. Null for any shape outside the grammar. */
export function parseImpactValue(raw: string | null | undefined): ParsedImpactValue | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;

  const compound = COMPOUND_RE.exec(raw);
  if (compound) {
    const base = Number(compound[1]);
    const growth = Number(compound[2]);
    if (!Number.isFinite(base) || !Number.isFinite(growth)) return null;
    return { kind: "compound", base, growth, growthPercent: compound[3] === "%" };
  }

  const scalar = SCALAR_RE.exec(raw);
  if (scalar) {
    const value = Number(scalar[1]);
    if (!Number.isFinite(value)) return null;
    return {
      kind: "scalar",
      value,
      percent: scalar[2] === "%",
      perLevel: PER_LEVEL_SUFFIX_RE.test(raw),
    };
  }
  return null;
}

/** Why a before/after pair was refused. Mirrors the backend's refusal codes. */
export type PairRefusal =
  | "unparseable"
  /** `COMPOUND_SHAPE_MISMATCH`: scalar on one side, compound on the other. */
  | "shape_mismatch"
  /** `GROWTH_UNIT_CHANGED`: flat ↔ percent growth. */
  | "growth_unit_changed"
  /** `%` or `per level` where the property does not allow it, or on one side only. */
  | "qualifier_not_allowed"
  /** A percent growth half in a flat family, or a compound attack-speed line. */
  | "unsupported_compound"
  | "negative_value";

export type ParsedImpactPair =
  | {
      ok: true;
      shape: "scalar";
      before: number;
      after: number;
    }
  | {
      ok: true;
      shape: "compound";
      before: { base: number; growth: number };
      after: { base: number; growth: number };
    }
  | { ok: false; refusal: PairRefusal };

/**
 * Parse a Riot before/after pair for a V1 property, enforcing the per-property
 * qualifier rules:
 *
 * - `%` only on `attack_speed_growth`, on both sides or neither.
 * - `per level` only on a growth property, on both sides or neither.
 * - compound only for flat families, with flat growth on both sides.
 * - every value finite and ≥ 0.
 */
export function parseImpactPair(
  property: V1Property,
  beforeRaw: string | null | undefined,
  afterRaw: string | null | undefined,
): ParsedImpactPair {
  const spec = V1_PROPERTIES[property];
  const before = parseImpactValue(beforeRaw);
  const after = parseImpactValue(afterRaw);
  if (!before || !after) return { ok: false, refusal: "unparseable" };

  if (before.kind !== after.kind) return { ok: false, refusal: "shape_mismatch" };

  if (before.kind === "compound" && after.kind === "compound") {
    if (before.growthPercent !== after.growthPercent) {
      return { ok: false, refusal: "growth_unit_changed" };
    }
    // No ratio, so a percent growth (or any attack-speed compound) has no safe
    // reading in V1.
    if (before.growthPercent || spec.family === "attack_speed") {
      return { ok: false, refusal: "unsupported_compound" };
    }
    const values = [before.base, before.growth, after.base, after.growth];
    if (values.some((v) => v < 0)) return { ok: false, refusal: "negative_value" };
    return {
      ok: true,
      shape: "compound",
      before: { base: before.base, growth: before.growth },
      after: { base: after.base, growth: after.growth },
    };
  }

  if (before.kind === "scalar" && after.kind === "scalar") {
    const percentAllowed = property === "attack_speed_growth";
    if (before.percent !== after.percent) return { ok: false, refusal: "qualifier_not_allowed" };
    if (before.percent && !percentAllowed) return { ok: false, refusal: "qualifier_not_allowed" };
    if (before.perLevel !== after.perLevel) return { ok: false, refusal: "qualifier_not_allowed" };
    if (before.perLevel && spec.half !== "growth") {
      return { ok: false, refusal: "qualifier_not_allowed" };
    }
    if (before.value < 0 || after.value < 0) return { ok: false, refusal: "negative_value" };
    return { ok: true, shape: "scalar", before: before.value, after: after.value };
  }

  return { ok: false, refusal: "unparseable" };
}
