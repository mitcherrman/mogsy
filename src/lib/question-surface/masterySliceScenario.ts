/**
 * Mastery / Matchup slice → Ranked scenario source. PURE, and now tiny.
 *
 * WHAT THIS USED TO BE, AND WHY IT ISN'T
 * ──────────────────────────────────────
 * This module used to BUILD the media: it read `promptSemantics` /
 * `comparisonSemantics`, decided that a champion recall draws a
 * `combat_cooldown` subject and a comparison draws a `matchup` one, chose the
 * badge, mapped `ability_cooldown` to "Cooldown" through its own table, and
 * constructed the ability-icon URL itself.
 *
 * Every one of those is presentation POLICY, and policy in a client is policy
 * per client: the same generated question drawn in Ranked, in a replay and
 * (later) in Practice would each be drawn by whatever that surface believed,
 * and nothing would ever report that the three had drifted. Meanwhile every
 * pooled Ranked question already resolved its media through ONE server-side
 * registry, with a stated reason per family. Mastery was the exception.
 *
 * It was also policy the client could not carry out. A Mastery premise names
 * its ability by SLOT — `subject_ref: "W"`, and `ability_name` is also "W" —
 * and the canonical ability name and its verified icon live in
 * `champion_abilities` and the asset tree. So this module used the slot AS the
 * name and asked for `/api/ranked/media/ability-icon/Ahri/W.png`, which is not
 * an ability. The server resolves the same premise to Fox-Fire and to its real
 * icon.
 *
 * RR1 Stage 1 moved all of it into `quiz/presentation_contract.py` +
 * `ranked_public/presentation_render.py`, beside every other family. What is
 * left here is the one thing that genuinely is the client's: putting the blob
 * the server already sent into the shape `selectScenario` reads.
 *
 * There is deliberately NO local fallback. Re-deriving media here when the
 * server sends none would restore exactly the second source of truth this
 * change removed — and a pre-Stage-1 segment has always rendered compact, so
 * `null` costs nothing that existed.
 */

import type { QuizQuestion } from "@/lib/quiz/api";
import type { MasterySliceChallengeView } from "@/lib/ranked-public/contracts";

/**
 * The scenario source for one slice challenge, or `null` when the server sent
 * no media for it.
 *
 * `null` is the honest answer and keeps the existing behaviour: the surface
 * falls back to the compact band, exactly as a slice did before it had media
 * at all. Nothing here throws — a media adapter must never be able to take a
 * round down.
 */
export function scenarioSourceForMasteryChallenge(
  challenge: MasterySliceChallengeView,
): QuizQuestion | null {
  const presentation = challenge.presentation;
  if (!presentation || typeof presentation !== "object") return null;
  const assets = (presentation as { assets?: unknown }).assets;
  if (!assets || typeof assets !== "object") return null;
  if (!(assets as { subject?: unknown }).subject) return null;

  return {
    // `id` only keys the card's crossfade between challenges.
    id: `mastery-slice-${challenge.challengeIndex}`,
    category: "mastery",
    question_text: "",
    format: "multiple_choice",
    choices: [],
    // Forwarded VERBATIM. The server's blob is the contract — reshaping it
    // here would be this module quietly having an opinion again.
    metadata: presentation as QuizQuestion["metadata"],
  };
}
