// ---------------------------------------------------------------------------
// Daily V2 lane D — the PROPOSED host contract for a graded Stat Drop segment.
//
// Status: CONTRACT ONLY. No backend module serves `stat_drop` today
// (`ranked_modules` has no scorer; the numeric lab and the public bonus
// session both release a value with `graded: false`). Nothing here is wired
// into `registry.ts` or `contracts.ts`; lane E stages that.
//
// What this file pins, so the future server module and the existing primitive
// meet without a clone:
//   * the snake_case PUBLIC block a `stat_drop` segment would publish, and a
//     fail-closed reader for it that refuses any answer-bearing key;
//   * the snake_case REVEAL row it would publish inside
//     `own_challenge_reveals`, carrying the SERVER's grade verbatim;
//   * field mappings onto the EXISTING `StatDrop` primitive's
//     `StatDropPublic` / `StatDropReveal` — a mapping, nothing more.
//
// What this file deliberately does NOT do:
//   * grade. There is no tolerance, band or points arithmetic here. The
//     closeness policy is an OWNER decision (see DAILY_V2_REUSE_MATRIX.md);
//     whatever it becomes, the server applies it and this reader relays the
//     server's `outcome` / `points` unchanged;
//   * derive the scale. The bounds must come from the server, chosen without
//     reference to the answer (a scale centred on the answer is a leak). The
//     reader can only check that the scale is well-formed.
// ---------------------------------------------------------------------------

import type {
  StatDropPublic, StatDropReveal, StatDropScale,
} from "@/lib/interaction-grammar/types";

/** The proposed module id. Not registered anywhere yet. */
export const PROPOSED_STAT_DROP_MODULE_ID = "stat_drop";
export const PROPOSED_STAT_DROP_MODULE_VERSION = 1;

/** Generous upper bound on slider positions: a 10k-step rail is unusable. */
export const MAX_SCALE_STEPS = 2000;

export class StatDropHostParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatDropHostParseError";
  }
}

/**
 * Keys that would carry (or locate) the answer. A pre-reveal block holding any
 * of them, at any depth, is refused. `value_display` is already reveal-only in
 * the shared segment reader; the rest are this module's own spellings.
 */
export const STAT_DROP_REVEAL_ONLY_KEYS: ReadonlySet<string> = new Set([
  "canonical_value", "canonical_display", "value", "value_display", "answer",
  "correct", "is_correct", "outcome", "points", "band", "closeness",
  "error", "abs_error", "relative_error", "evidence", "source",
]);

/** The server-graded outcome vocabulary a reveal may state. Opaque to the client. */
export type StatDropServerOutcome = string;

/** The PUBLIC (pre-reveal) Stat Drop block, as the client reads it. */
export interface StatDropBlockView {
  prompt: string;
  metricLabel: string;
  unit: string;
  context: string | null;
  scale: StatDropScale;
  subject: { label: string; media: { src: string | null; alt: string } | null } | null;
}

/** The viewer's own post-lock reveal: the server's value AND the server's grade. */
export interface StatDropChallengeReveal {
  selected: number;
  canonicalValue: number;
  canonicalDisplay: string;
  /** The server's word for the result; `null` while grading is not approved. */
  outcome: StatDropServerOutcome | null;
  /** Points the server awarded this answer; `null` when it awards none. */
  points: number | null;
  evidence: string | null;
  source: string | null;
}

type Obj = Record<string, unknown>;

function rec(v: unknown, label: string): Obj {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new StatDropHostParseError(`${label}: expected an object`);
  }
  return v as Obj;
}

function str(v: unknown, label: string): string {
  if (typeof v !== "string") throw new StatDropHostParseError(`${label}: expected a string`);
  return v;
}

function nstr(v: unknown, label: string): string | null {
  return v === null || v === undefined ? null : str(v, label);
}

function finite(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new StatDropHostParseError(`${label}: expected a finite number`);
  }
  return v;
}

function nfinite(v: unknown, label: string): number | null {
  return v === null || v === undefined ? null : finite(v, label);
}

function assertNoRevealKeys(node: unknown, path: string, depth = 0): void {
  if (depth > 8 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => assertNoRevealKeys(v, `${path}[${i}]`, depth + 1));
    return;
  }
  for (const [k, v] of Object.entries(node as Obj)) {
    if (STAT_DROP_REVEAL_ONLY_KEYS.has(k)) {
      throw new StatDropHostParseError(`${path}.${k}: reveal-only key in a pre-reveal block`);
    }
    assertNoRevealKeys(v, `${path}.${k}`, depth + 1);
  }
}

/**
 * A well-formed scale: finite, `min < max`, positive step that divides the
 * range into a whole, bounded number of positions, and integral decimals.
 *
 * Well-formed is all the client can check. Answer-independence is a SERVER
 * obligation, proven by server tests (the bounds must be a function of the
 * family's public range, never of the hidden value).
 */
export function readStatDropScale(v: unknown, label = "scale"): StatDropScale {
  const o = rec(v, label);
  const min = finite(o.min, `${label}.min`);
  const max = finite(o.max, `${label}.max`);
  const step = finite(o.step, `${label}.step`);
  const decimals = finite(o.decimals, `${label}.decimals`);
  if (!(min < max)) throw new StatDropHostParseError(`${label}: min must be below max`);
  if (!(step > 0)) throw new StatDropHostParseError(`${label}: step must be positive`);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) {
    throw new StatDropHostParseError(`${label}.decimals: expected an integer 0..6`);
  }
  const positions = (max - min) / step;
  if (Math.abs(positions - Math.round(positions)) > 1e-9) {
    throw new StatDropHostParseError(`${label}: step does not divide the range`);
  }
  if (Math.round(positions) > MAX_SCALE_STEPS) {
    throw new StatDropHostParseError(`${label}: more than ${MAX_SCALE_STEPS} positions`);
  }
  return { min, max, step, decimals };
}

/** Read the proposed public block (`segment_state.challenges` of a `stat_drop` segment). */
export function readStatDropBlock(v: unknown): StatDropBlockView {
  const o = rec(v, "stat_drop");
  assertNoRevealKeys(o, "stat_drop");
  const subjectRaw = o.subject === null || o.subject === undefined ? null : rec(o.subject, "stat_drop.subject");
  const mediaRaw = subjectRaw && subjectRaw.media ? rec(subjectRaw.media, "stat_drop.subject.media") : null;
  return {
    prompt: str(o.prompt, "stat_drop.prompt"),
    metricLabel: str(o.metric_label, "stat_drop.metric_label"),
    unit: typeof o.unit === "string" ? o.unit : "",
    context: nstr(o.context, "stat_drop.context"),
    scale: readStatDropScale(o.scale, "stat_drop.scale"),
    subject: subjectRaw ? {
      label: str(subjectRaw.label, "stat_drop.subject.label"),
      media: mediaRaw ? {
        src: nstr(mediaRaw.src, "stat_drop.subject.media.src"),
        alt: typeof mediaRaw.alt === "string" ? mediaRaw.alt : "",
      } : null,
    } : null,
  };
}

/** Read the proposed reveal row (`own_challenge_reveals[i].stat_drop`). */
export function readStatDropReveal(v: unknown): StatDropChallengeReveal {
  const o = rec(v, "stat_drop_reveal");
  return {
    selected: finite(o.selected, "stat_drop_reveal.selected"),
    canonicalValue: finite(o.canonical_value, "stat_drop_reveal.canonical_value"),
    canonicalDisplay: str(o.canonical_display, "stat_drop_reveal.canonical_display"),
    outcome: nstr(o.outcome, "stat_drop_reveal.outcome"),
    points: nfinite(o.points, "stat_drop_reveal.points"),
    evidence: nstr(o.evidence, "stat_drop_reveal.evidence"),
    source: nstr(o.source, "stat_drop_reveal.source"),
  };
}

/** Public block -> the EXISTING primitive's `StatDropPublic`. A field mapping. */
export function toStatDropPublic(
  block: StatDropBlockView,
  resolveMedia: (src: string | null) => string | null = (s) => s,
): StatDropPublic {
  return {
    prompt: block.prompt,
    metricLabel: block.metricLabel,
    unit: block.unit,
    context: block.context,
    scale: block.scale,
    subject: block.subject ? {
      label: block.subject.label,
      media: block.subject.media
        ? { src: resolveMedia(block.subject.media.src), alt: block.subject.media.alt }
        : null,
    } : null,
  };
}

/**
 * Reveal row -> the EXISTING primitive's `StatDropReveal`. The server's
 * `outcome`/`points` are NOT passed into the primitive (it has no grade
 * vocabulary by design); the host shell shows them in its own verdict slot.
 */
export function toStatDropReveal(reveal: StatDropChallengeReveal): StatDropReveal {
  return {
    canonicalValue: reveal.canonicalValue,
    canonicalDisplay: reveal.canonicalDisplay,
    evidence: reveal.evidence,
    source: reveal.source,
  };
}
