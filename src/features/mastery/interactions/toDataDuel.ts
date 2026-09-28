/**
 * DD1 — Mastery comparison → Data Duel. PURE.
 *
 * The one place a `comparison_left_right` question becomes the MIG Data Duel's
 * props. Two functions, split on the reveal boundary:
 *
 *   * `toDataDuelPublic` reads ONLY pre-reveal material — the structured
 *     `comparison_semantics`, the answer tokens and champion art. It cannot
 *     see a value or a winner because none of its inputs has one.
 *   * `toDataDuelReveal` reads ONLY the server's reveal: `correct_answer` names
 *     the canonical side, and the side values come from `comparison_values`
 *     and nowhere else. A reveal without that block (every segment frozen
 *     before DD1-A) yields no values — the explanation prose is displayed by
 *     the host, never parsed here.
 *
 * Nothing here grades, compares or formats a number.
 */
import type { DataDuelPublic, DataDuelReveal, DuelSide } from "@/lib/interaction-grammar/types";
import type { MasteryComparisonSemantics } from "../contracts/comparisonSemantics";
import { withUnitLabel } from "../contracts/comparisonValues";
import type { MasteryAssets } from "../player/MasteryAssets";
import {
  comparisonMetricLabel, comparisonScopeLabel, comparisonSideSublabel, formatComparisonPrompt,
} from "./formatComparisonSemantics";
import type { MasteryQuestionReveal } from "./revealState";

/** The player-facing label of the comparison's "same value" answer. */
export const DATA_DUEL_TIE_LABEL = "Same value";

function side(
  cs: MasteryComparisonSemantics, i: 0 | 1, token: string, assets: MasteryAssets | null,
): DuelSide {
  const label = i === 0 ? cs.championADisplay : cs.championBDisplay;
  // Splash first (the tablet is a landscape crop), then the square icon, then
  // the monogram — the same resolver every Mastery portrait already uses.
  const src = assets
    ? assets.championSplashUrl?.(token, label) ?? assets.championIconUrl(token, label)
    : null;
  return {
    token,
    label,
    sublabel: comparisonSideSublabel(cs, i),
    // Decorative: the label names the subject.
    media: src ? { src, alt: "" } : null,
  };
}

/**
 * The public duel for one comparison. `answerOptions` is the served
 * `[side A, side B, tie?]` domain; a tie option is offered only when the
 * domain has a third token.
 */
export function toDataDuelPublic(
  cs: MasteryComparisonSemantics,
  answerOptions: readonly string[],
  assets: MasteryAssets | null = null,
): DataDuelPublic {
  const [a, b, tie] = answerOptions;
  return {
    prompt: formatComparisonPrompt(cs),
    metricLabel: comparisonMetricLabel(cs),
    context: comparisonScopeLabel(cs),
    left: side(cs, 0, a, assets),
    right: side(cs, 1, b, assets),
    tie: tie !== undefined ? { token: tie, label: DATA_DUEL_TIE_LABEL } : null,
  };
}

/**
 * The duel's reveal from the server's graded reveal. Values appear only when
 * the structured block names exactly this duel's two tokens; any mismatch
 * drops them (fail closed to the legacy reveal), never guesses.
 */
export function toDataDuelReveal(
  reveal: MasteryQuestionReveal,
  content: Pick<DataDuelPublic, "left" | "right">,
): DataDuelReveal {
  const out: DataDuelReveal = { canonicalToken: reveal.correctValue ?? "", values: {} };
  const cv = reveal.comparisonValues;
  if (!cv) return out;
  const tokens = new Set([content.left.token, content.right.token]);
  if (tokens.size !== 2 || !cv.sides.every((s) => tokens.has(s.token))) return out;
  const values: Record<string, string> = {};
  const numericValues: Record<string, number> = {};
  for (const s of cv.sides) {
    values[s.token] = withUnitLabel(s.display, cv);
    numericValues[s.token] = s.value;
  }
  return {
    ...out,
    values,
    numericValues,
    marginDisplay: cv.deltaDisplay !== null ? withUnitLabel(cv.deltaDisplay, cv) : null,
  };
}
