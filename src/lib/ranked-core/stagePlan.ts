/**
 * IS THIS STAGE'S LENGTH A PLAN, OR A CEILING?
 *
 * `scoring.matchLength` answers two different questions depending on the
 * ruleset the stage was frozen with, and the arena renders a lie if it reads
 * the number without reading which one it got:
 *
 * * STANDARD (and Review, which is a standard-ruleset stage): the content
 *   set's curriculum IS the stage. Champion Fundamentals declares four slots,
 *   the format freezes `match_length = 4`, and the stage serves exactly four
 *   questions. The number is a PLAN and the whole plan can be drawn.
 * * TIME TRIAL / SURVIVAL (rapid recall): the same pattern cycles and the
 *   backend freezes `match_length` as the CLEAN CANDIDATE CEILING — how deep
 *   the content could go before it would have to repeat itself
 *   (`content_sets.depth`). Item Fundamentals reaches 377 there. The stage
 *   ends when the bank drains or the strikes run out, so that number is not
 *   how long the stage is and must never be shown as a denominator or drawn
 *   as a strip of 377 slots.
 *
 * So a rapid-recall stage is OPEN-ENDED to this client — the same shape an hp
 * match has always had, and the shape every consumer of a null length already
 * renders correctly (a module number with no denominator, a sliding timeline
 * window). Nothing here invents a length, shortens one, or pads one: it only
 * declines to publish a ceiling as a plan.
 *
 * POST-LAUNCH AUDIT (2026-09-22): production drew a 10-slot round bar over a
 * 4-question Daily Standard stage because the arena passed no total at all and
 * `projectRoundTimeline` fell back to its indefinite 9-slot window. The
 * content was right; the strip was not being told what the server had frozen.
 */
import type { PublicRoundView } from "@/lib/ranked-public/contracts";

/** Rulesets whose `match_length` is a candidate ceiling, not a plan. */
export const RAPID_RECALL_RULESETS = new Set(["time_trial", "survival"]);

/** Does `rulesetId` end by bank/strikes rather than by finishing a plan? */
export function isRapidRecallRuleset(rulesetId: string | null | undefined): boolean {
  return typeof rulesetId === "string" && RAPID_RECALL_RULESETS.has(rulesetId);
}

/**
 * The stage's AUTHORITATIVE playable length, or null when it has none.
 *
 * Null for: an hp match, a match with no scoring block, a points match the
 * backend gave no length, and every rapid-recall stage. A caller renders the
 * null the way it already renders an hp match's — never by substituting a
 * constant.
 */
export function plannedRoundTotal(pub: PublicRoundView | null | undefined): number | null {
  const scoring = pub?.scoring;
  if (!scoring || scoring.model !== "points") return null;
  if (isRapidRecallRuleset(pub?.ruleset?.rulesetId)) return null;
  const length = scoring.matchLength;
  return typeof length === "number" && length > 0 ? length : null;
}
