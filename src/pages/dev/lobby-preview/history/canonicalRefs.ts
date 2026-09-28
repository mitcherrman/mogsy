/**
 * HUB5 — the ONE place a Timmy fixture mints a canonical question ref.
 *
 * The real system mints each namespace in one place (`ranked_public
 * .discovery`): `ranked:<candidate_id>`, `quiz:<question_key>`,
 * `mastery:<concept_id>`, `reflex:<card_key>` (HUB6.2: Meta Reflex cards,
 * `REFLEX_NAMESPACE` in `ranked_public.discovery`). Before HUB5 the preview wrote `ranked:demo-<id>` in
 * its match reviews and `ranked:<id>` in its question collection, so the same
 * question had two identities on one screen. Every fixture now mints through
 * these functions, and `questionIdentity.ts` resolves every ref back.
 *
 * A leaf module on purpose: the Ranked match fixture and the identity factory
 * both need it, and neither may import the other in a cycle.
 */

export type RefNamespace = "ranked" | "quiz" | "mastery" | "reflex";

/** Demo candidate ids carry `demo-` so no fixture ref can be mistaken for a
 *  real reviewed candidate. */
export const rankedRef = (questionId: string): string => `ranked:demo-${questionId}`;
export const quizRef = (questionKey: string): string => `quiz:${questionKey}`;
export const masteryRef = (conceptId: string): string => `mastery:${conceptId}`;
export const reflexRef = (cardKey: string): string => `reflex:${cardKey}`;

export function refNamespace(ref: string): RefNamespace {
  const ns = ref.slice(0, ref.indexOf(":"));
  if (ns === "ranked" || ns === "quiz" || ns === "mastery" || ns === "reflex") return ns;
  throw new Error(`not a fixture canonical ref: ${ref}`);
}
