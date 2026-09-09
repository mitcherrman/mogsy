/**
 * Mastery / Matchup slice → Ranked scenario source. PURE.
 *
 * WHY THIS EXISTS, AND WHY IT IS THE WHOLE CHANGE
 * ──────────────────────────────────────────────
 * A Mastery Slice question and a Combat Calculation question are the same kind
 * of thing — a League premise with a prompt and an answer — and they should
 * look it. What separated them was not the arena, the folio or the answer
 * controls, all of which are already shared: it was that a slice challenge
 * arrived with NO `presentation`, so `resolveBandProfile` returned "compact"
 * and the round drew a category plate where every other round draws its subject.
 *
 * The fix is not a new renderer. Every field the gold-standard card needs is
 * ALREADY on the wire — `MasterySliceChallengeView.promptSemantics` carries
 * `championDisplay`, `subjectRef` (the ability slot), `abilityName`, `metric`
 * and a `context` with `abilityRank` / `championLevel`; `comparisonSemantics`
 * carries both champions and the same axes. This module is the small adapter
 * that turns those into the exact `{assets: {subject}}` blob
 * `scenario-cards/classify.ts` already consumes, so a slice question flows
 * through the SAME path a pooled Ranked question does:
 *
 *   challenge → THIS → QuizQuestion.metadata → selectScenario → ScenarioCard
 *
 * No backend change, no second rendering architecture, and no new media
 * vocabulary: `combat_cooldown` is reused for the single-champion case because
 * it is already the frontend's identity for "champion splash + ability row +
 * condition chips" (see `_ability_composite` in `ranked_public/presentation_render.py`,
 * which reuses it for `ability_cost_rank` for exactly this reason).
 *
 * HIDDEN INFORMATION
 * ──────────────────
 * Everything emitted here is a GIVEN of the question — the champion(s) being
 * tested, which ability, at what rank and level, and the NAME of the metric.
 * The correct answer is the metric's VALUE (or, for a comparison, which side is
 * higher), and no value ever reaches this module: `promptSemantics` and
 * `comparisonSemantics` are structural payloads that carry no answer, and
 * `challenge.answerOptions` is never read here. A comparison draws both sides
 * identically, so the picture cannot favour either.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * ────────────────────────────────
 * It does not touch the interaction. A slice challenge may be `single_choice`,
 * `numeric` or `boolean`, and the Mastery interaction renderers own all three;
 * forcing a numeric recall into answer tablets would be a mechanics change
 * wearing a visual costume. This module produces MEDIA only — the band above
 * the interaction — which is precisely the part that was missing.
 */

import type { QuizQuestion } from "@/lib/quiz/api";
import type { MasterySliceChallengeView } from "@/lib/ranked-public/contracts";
import { readPromptSemantics } from "@/features/mastery/contracts/promptSemantics";
import { readComparisonSemantics } from "@/features/mastery/contracts/comparisonSemantics";

/**
 * Slot-neutral ability icon route. The backend already serves an ability's art
 * by champion + ability NAME (`routes.ranked_media`), which is the only pair a
 * slice challenge carries — the semantics give `abilityName`, and `subjectRef`
 * gives the slot separately. Reusing the shipped route means no second asset
 * catalogue and no client-side path construction.
 */
const API_BASE =
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ?? "http://127.0.0.1:8000";

export function abilityIconUrl(champion: string, abilityName: string): string {
  return `${API_BASE}/api/ranked/media/ability-icon/${encodeURIComponent(champion)}/${encodeURIComponent(abilityName)}.png`;
}

/**
 * Human label for a metric key, for the "Compare" / context chip.
 *
 * A closed map with a readable fallback: an unmapped metric still renders as
 * words rather than as `ability_cooldown`, and adding a metric is one line. The
 * label is the metric's NAME, never its value.
 */
const METRIC_LABELS: Record<string, string> = {
  ability_cooldown: "Cooldown",
  ability_cost: "Cost",
  cooldown: "Cooldown",
  cost: "Cost",
  base_health: "Base Health",
  base_armor: "Base Armor",
  base_attack_damage: "Base AD",
  base_magic_resist: "Base MR",
  attack_speed: "Attack Speed",
  move_speed: "Move Speed",
  health_per_level: "Health / Level",
  armor_per_level: "Armor / Level",
};

export function metricLabel(metric: string): string | undefined {
  if (!metric) return undefined;
  const known = METRIC_LABELS[metric.toLowerCase()];
  if (known) return known;
  return metric
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** The shape `selectScenario` reads. `id` only keys the card's crossfade. */
function source(id: string, subject: Record<string, unknown>): QuizQuestion {
  return {
    id,
    category: "mastery",
    question_text: "",
    format: "multiple_choice",
    choices: [],
    metadata: {
      assets: { subject },
      // The same context flags `presentation_render` stamps on every pooled
      // Ranked question: premise media, shown with the question, not a spoiler.
      presentation: { role: "context", timing: "question", spoiler: false },
    } as QuizQuestion["metadata"],
  };
}

/**
 * The scenario source for one slice challenge, or `null` when the challenge
 * carries no semantics this can draw from (a chain-sourced `legacy_combat`
 * step, or a malformed payload).
 *
 * `null` is the honest answer and keeps the existing behaviour: the surface
 * falls back to the compact band exactly as it does today. Nothing here throws
 * — a media adapter must never be able to take a round down.
 */
export function scenarioSourceForMasteryChallenge(
  challenge: MasterySliceChallengeView,
): QuizQuestion | null {
  const id = `mastery-slice-${challenge.challengeIndex}`;
  try {
    if (challenge.interactionKind === "comparison_left_right" && challenge.comparisonSemantics) {
      const c = readComparisonSemantics(challenge.comparisonSemantics);
      if (!c.championADisplay || !c.championBDisplay) return null;
      const slot = c.subjectRef || undefined;
      return source(id, {
        type: "matchup",
        champion_a: c.championADisplay,
        champion_b: c.championBDisplay,
        // A comparison names one ability slot shared by both kits ("their Q").
        // The icon is only meaningful for one side, so it is omitted and the
        // slot is stated as the ability label instead — see the card.
        ability_slot: slot,
        ability_name: slot ? `Ability ${slot}` : undefined,
        metric_label: metricLabel(c.metric),
        level: c.context.championLevel ?? undefined,
        ability_rank: c.context.abilityRank ?? undefined,
        badge: "Matchup",
      });
    }

    if (challenge.interactionKind === "atomic_recall" && challenge.promptSemantics) {
      const p = readPromptSemantics(challenge.promptSemantics);
      if (!p.championDisplay) return null;
      const slot = p.subjectRef || undefined;
      return source(id, {
        // Reused, not invented: the frontend's identity for "champion splash +
        // ability row + condition chips".
        type: "combat_cooldown",
        champion: p.championDisplay,
        ability_slot: slot,
        ability_name: p.abilityName || undefined,
        ability_icon:
          p.abilityName ? abilityIconUrl(p.championDisplay, p.abilityName) : undefined,
        level: p.context.championLevel ?? undefined,
        ability_rank: p.context.abilityRank ?? undefined,
        // A champion-level stat question names no ability, so the metric is what
        // says which part of the champion is being tested.
        badge: slot ? "Champion Mastery" : (metricLabel(p.metric) ?? "Champion Mastery"),
      });
    }
  } catch {
    // A semantics payload that fails its own reader is a content problem, not a
    // reason to lose the round. Fall through to no media.
    return null;
  }
  return null;
}
