// ---------------------------------------------------------------------------
// NUM-LAB — the neutral contracts for the two numeric prototypes, Stat Drop
// and Combat Estimate. PROTOTYPE ONLY: neither mode has a server authority
// yet (see NUMERIC_MODES_PLAYTEST_HANDOFF.md), so nothing here is wired to
// Quiz, Daily or Ranked.
//
// The MIG reveal boundary holds exactly as in `types.ts`: `*Public` has no
// field that could carry the answer, and the shared `NumericReveal` is the only
// way a canonical value reaches a primitive. The primitive displays it and
// grades nothing.
//
// Responses are `{ selected: number }`, which is already a production
// `SegmentChoice` (the Mastery numeric step sends the same shape), so a host
// would map them 1:1 without widening the transport.
// ---------------------------------------------------------------------------

import type { SegmentChoice } from "@/lib/ranked-public/client";
import type { SubjectMedia } from "./types";

/** The range a value may be dropped on or typed into. Never derived from the answer. */
export interface NumericScale {
  min: number;
  max: number;
  /** The smallest movement; also the snapping grid. */
  step: number;
  /** Short unit after a number: "HP", "s", "damage". Empty for unitless. */
  unitLabel: string;
}

export interface NumericSubject {
  label: string;
  sublabel?: string | null;
  media?: SubjectMedia | null;
  monogram?: string | null;
}

// ------------------------------------------------------------------ Stat Drop

/** Everything a player may see before the reveal. */
export interface StatDropPublic {
  prompt: string;
  /** The quantity, short: "Base health". */
  metricLabel: string;
  context?: string | null;
  subject: NumericSubject;
  /**
   * The drop scale. It MUST be chosen independently of the answer (a fixed
   * range per metric family): a scale centred on the answer would leak it.
   */
  scale: NumericScale;
}

// ----------------------------------------------------------- Combat Estimate

export interface CombatSide {
  label: string;
  /** Plain premise lines: "Level 9", "120 bonus AD", "80 armor". */
  lines: readonly string[];
  media?: SubjectMedia | null;
  monogram?: string | null;
}

/** Everything a player may see before the reveal. */
export interface CombatEstimatePublic {
  prompt: string;
  /** The estimated quantity, short: "Post-mitigation damage". */
  metricLabel: string;
  context?: string | null;
  attacker: CombatSide;
  target: CombatSide;
  /** The single action being estimated: "Q at rank 3". */
  action: string;
  /** Accepted input range and precision. Fixed per family, never per answer. */
  scale: NumericScale;
}

// ------------------------------------------------------------- shared reveal

export type NumericVerdict = "exact" | "within" | "outside";

/** Authority-supplied, post-lock only. Every string is the authority's own. */
export interface NumericReveal {
  /** The value the authority recorded for this attempt. */
  submitted: number;
  submittedDisplay: string;
  canonicalValue: number;
  canonicalDisplay: string;
  /** The accepted band the authority graded against; null = exact-only. */
  band: { low: number; high: number; display: string } | null;
  verdict: NumericVerdict;
  /** The authority's signed miss, formatted ("+38 HP", "−12%"). */
  deltaDisplay?: string | null;
  isCorrect: boolean | null;
  evidence?: string | null;
  source?: string | null;
}

export type NumericResponse = { selected: number };

export const VERDICT_LABEL: Record<NumericVerdict, string> = {
  exact: "Exact",
  within: "Within the band",
  outside: "Outside the band",
};

/** The screen-reader sentence for a reveal. Built only from the authority's strings. */
export function verdictSentence(reveal: NumericReveal): string {
  return `${VERDICT_LABEL[reveal.verdict]}. Answer ${reveal.canonicalDisplay}; you said ${reveal.submittedDisplay}.`;
}

type Assert<T extends true> = T;
export type _NumericIsSegmentChoice = Assert<NumericResponse extends SegmentChoice ? true : false>;

// ---------------------------------------------------------- input mechanics
// Pure input helpers. They clamp and snap the PLAYER'S value only; none of them
// sees, compares against or rounds toward an answer.

/** Decimal places implied by a step (0.5 → 1, 25 → 0). */
export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const s = String(step);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

/** Clamp to the scale and snap to its step grid (anchored at `min`). */
export function snapToScale(value: number, scale: NumericScale): number {
  const clamped = Math.min(scale.max, Math.max(scale.min, value));
  const steps = Math.round((clamped - scale.min) / scale.step);
  const snapped = scale.min + steps * scale.step;
  return Number(Math.min(scale.max, snapped).toFixed(stepDecimals(scale.step)));
}

/** The value at a horizontal fraction (0–1) of the track. */
export function valueAtFraction(fraction: number, scale: NumericScale): number {
  const f = Math.min(1, Math.max(0, fraction));
  return snapToScale(scale.min + f * (scale.max - scale.min), scale);
}

/** Where a value sits on the track, 0–1. Display only. */
export function fractionOf(value: number, scale: NumericScale): number {
  const span = scale.max - scale.min;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (value - scale.min) / span));
}

/**
 * The WAI slider keys. Returns the next value, or null for a key the slider
 * does not own. An unplaced marker (null) is placed at the midpoint first.
 */
export function sliderKey(key: string, value: number | null, scale: NumericScale): number | null {
  const mid = snapToScale((scale.min + scale.max) / 2, scale);
  if (value === null) {
    return ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(key)
      ? (key === "Home" ? scale.min : key === "End" ? scale.max : mid)
      : null;
  }
  const big = scale.step * Math.max(1, Math.round((scale.max - scale.min) / scale.step / 10));
  switch (key) {
    case "ArrowRight": case "ArrowUp": return snapToScale(value + scale.step, scale);
    case "ArrowLeft": case "ArrowDown": return snapToScale(value - scale.step, scale);
    case "PageUp": return snapToScale(value + big, scale);
    case "PageDown": return snapToScale(value - big, scale);
    case "Home": return scale.min;
    case "End": return scale.max;
    default: return null;
  }
}

export type ParsedEstimate =
  | { ok: true; value: number }
  | { ok: false; reason: "empty" | "not-a-number" | "below-range" | "above-range" | "too-precise" };

/**
 * Parse a typed estimate. Accepts "1,240", " 1240 ", "12.5". Rejects anything
 * outside the scale or finer than its step's decimals — it never silently
 * rewrites what the player typed into a different number.
 */
export function parseEstimate(text: string, scale: NumericScale): ParsedEstimate {
  const t = text.trim().replace(/[,\s_]/g, "");
  if (!t) return { ok: false, reason: "empty" };
  if (!/^-?\d+(\.\d+)?$/.test(t)) return { ok: false, reason: "not-a-number" };
  const value = Number(t);
  if (!Number.isFinite(value)) return { ok: false, reason: "not-a-number" };
  const dot = t.indexOf(".");
  if (dot >= 0 && t.length - dot - 1 > stepDecimals(scale.step)) return { ok: false, reason: "too-precise" };
  if (value < scale.min) return { ok: false, reason: "below-range" };
  if (value > scale.max) return { ok: false, reason: "above-range" };
  return { ok: true, value };
}

/** The player's OWN value, for the live readout. Never used on an answer. */
export function formatPlayerValue(value: number, scale: NumericScale): string {
  const n = value.toLocaleString("en-US", {
    minimumFractionDigits: stepDecimals(scale.step),
    maximumFractionDigits: stepDecimals(scale.step),
  });
  return scale.unitLabel ? `${n} ${scale.unitLabel}` : n;
}
