/**
 * DD1 — THE STRUCTURED COMPARISON REVEAL (`comparison_values.v1`).
 *
 * A `comparison_left_right` reveal (`own_challenge_reveals[]`, the submit
 * response's `challenge_reveal`, a match-review challenge row, the standalone
 * `mastery_player_reveal`) may carry an OPTIONAL `comparison_values` block: the
 * two authoritative values behind the comparison, with the backend's own
 * display strings (`docs/DD1_DATA_DUEL_PRODUCTION_PATH.md` §5).
 *
 * REVEAL-ONLY. It never exists on a pre-reveal payload (the backend names it in
 * `FORBIDDEN_PRE_REVEAL_KEYS`), and no pre-reveal type here has a slot for it.
 *
 * This reader is a typed ALLOWLIST and FAILS CLOSED TO "NO VALUES", the
 * `combat_working` discipline (`lib/journey/combatWorking.ts`): an exact key
 * set, a contract string, exactly two sides with distinct non-empty tokens,
 * finite numbers and non-empty display strings. Anything off-contract returns
 * `null` and never throws — a malformed block must never take a reveal down;
 * the reveal simply renders as a legacy one (tags + explanation, no values).
 *
 * Nothing here decides a winner, a tie or text: `correct_answer` states the
 * winner, the displays are printed verbatim, and `value` only sizes a bar.
 * Values are NEVER recovered from the explanation prose.
 */

export const COMPARISON_VALUES_CONTRACT = "comparison_values.v1";

export interface ComparisonValueSide {
  /** The answer-option token this value belongs to (`answer_options[0|1]`). */
  readonly token: string;
  /** Display only: sizes the margin bar. Never compared to decide anything. */
  readonly value: number;
  /** Backend-formatted, printed verbatim. */
  readonly display: string;
}

export interface ComparisonValues {
  readonly contract: typeof COMPARISON_VALUES_CONTRACT;
  /** Exactly two, in `answer_options[0..1]` order. */
  readonly sides: readonly [ComparisonValueSide, ComparisonValueSide];
  /** Canonical unit slug ("seconds", "hitpoints"), or null when unstated. "" = unitless. */
  readonly unit: string | null;
  /** The backend's label for `unit` ("seconds", "health"), or null when unstated. */
  readonly unitLabel: string | null;
  readonly displayPrecision: number | null;
  /** Which direction wins ("greater" / "lesser"); informational only. */
  readonly operator: string | null;
  readonly delta: number | null;
  /** Backend-formatted margin, printed verbatim. */
  readonly deltaDisplay: string | null;
}

const KEYS = [
  "contract", "sides", "unit", "unit_label", "display_precision", "operator", "delta", "delta_display",
] as const;
const SIDE_KEYS = ["token", "value", "display"] as const;

class Off extends Error {}
type Obj = Record<string, unknown>;

function exactObj(v: unknown, allowed: readonly string[], required: readonly string[]): Obj {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Off();
  const o = v as Obj;
  for (const k of Object.keys(o)) if (!allowed.includes(k)) throw new Off();
  for (const k of required) if (!(k in o)) throw new Off();
  return o;
}
const finite = (v: unknown): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Off();
  return v;
};
const text = (v: unknown): string => {
  if (typeof v !== "string" || v.trim().length === 0) throw new Off();
  return v;
};
/** Optional fields: absent/null → null; present → must be well-typed. */
const optStr = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new Off();
  return v;
};
const optText = (v: unknown): string | null => (v === undefined || v === null ? null : text(v));
const optFinite = (v: unknown): number | null => (v === undefined || v === null ? null : finite(v));
const optPrecision = (v: unknown): number | null => {
  if (v === undefined || v === null) return null;
  const n = finite(v);
  if (!Number.isInteger(n) || n < 0) throw new Off();
  return n;
};

function side(v: unknown): ComparisonValueSide {
  const o = exactObj(v, SIDE_KEYS, SIDE_KEYS);
  return { token: text(o.token), value: finite(o.value), display: text(o.display) };
}

/**
 * Read a served `comparison_values` block, or `null` when there is none or it
 * is off-contract. Never throws.
 */
export function readComparisonValues(raw: unknown): ComparisonValues | null {
  if (raw === null || raw === undefined) return null;
  try {
    const o = exactObj(raw, KEYS, ["contract", "sides"]);
    if (o.contract !== COMPARISON_VALUES_CONTRACT) return null;
    if (!Array.isArray(o.sides) || o.sides.length !== 2) return null;
    const a = side(o.sides[0]);
    const b = side(o.sides[1]);
    if (a.token === b.token) return null;
    return {
      contract: COMPARISON_VALUES_CONTRACT,
      sides: [a, b],
      unit: optStr(o.unit),
      unitLabel: optStr(o.unit_label),
      displayPrecision: optPrecision(o.display_precision),
      operator: optText(o.operator),
      delta: optFinite(o.delta),
      deltaDisplay: optText(o.delta_display),
    };
  } catch {
    // Off-contract (or anything else unexpected): no values, never a crash.
    return null;
  }
}

/**
 * A backend display with its unit, as the player reads it: "90 seconds",
 * "590 health", "25.0%". The unit text is the backend's `unit_label`; the only
 * client rule is that a percent sign is written tight.
 */
export function withUnitLabel(display: string, cv: Pick<ComparisonValues, "unit" | "unitLabel">): string {
  const label = cv.unitLabel?.trim();
  if (!label) return display;
  if (cv.unit === "percent" || label === "%") return `${display}%`;
  return `${display} ${label}`;
}
