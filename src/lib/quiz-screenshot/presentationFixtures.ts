/**
 * CON1 Phase 0 diagnostic payloads — the four questions the Content Factory
 * presentation bridge has to be right about, in ONE place so the pure-path
 * tests and the render-harness tests exercise identical rows.
 *
 * These are test/diagnostic fixtures, not sample content: they are deliberately
 * NOT added to `SAMPLE_RENDER_QUESTIONS`, which is the dev-mode fallback the
 * harness page renders when nothing is injected.
 *
 * Every `presentation` here is what the BACKEND projects
 * (`quiz.premise_projection.build_presentation` through
 * `quiz.family_contract.PREMISE_CONTRACTS`) — a strict subset of the row's
 * metadata. Every `metadata` here is the full stored blob, solution fields
 * included, exactly as the review endpoint returns it. The gap between the two
 * is the whole point: the harness must draw scenarios from the first and never
 * from the second.
 */

import type { RenderQuestion } from "./types";

/** The exact_minion contract's nine safe premise fields. */
export const EXACT_MINION_PRESENTATION = {
  lane_context: "solo",
  no_xp_missed: true,
  wave_number: 4,
  spawn_time_display: "2:05",
  melee_count: 3,
  caster_count: 3,
  cannon_count: 0,
  is_cannon_wave: false,
  minion_order_assumption: "melee before caster",
} as const;

/** The same row's complete metadata — safe fields plus solution-only ones. */
export const EXACT_MINION_METADATA = {
  ...EXACT_MINION_PRESENTATION,
  breakpoint_minion_type: "melee",
  breakpoint_minion_ordinal: 3,
  breakpoint_wave_number: 4,
  solo_cumulative_xp_after_wave: 280,
  solo_level_breakpoint_note: "3rd melee of wave 4",
};

/** Fields that exist ONLY in the metadata blob above. */
export const MINION_SOLUTION_FIELDS = [
  "breakpoint_minion_type",
  "breakpoint_minion_ordinal",
  "breakpoint_wave_number",
  "solo_cumulative_xp_after_wave",
  "solo_level_breakpoint_note",
] as const;

/**
 * A post-mitigation combat premise — the family whose layout rule IS on this
 * branch, which is what makes it the diagnostic's proof that the bridge works
 * end to end rather than only up to the layout authority's door.
 */
export const COMBAT_PRESENTATION = {
  assets: {
    subject: {
      type: "combat_cooldown",
      champion: "Caitlyn",
      champion_icon: "assets/champions/Caitlyn/icon.png",
      item_icons: [],
      ability_slot: "Q",
      ability_name: "Piltover Peacemaker",
    },
    entities: {
      champions: [
        {
          type: "champion",
          id: "Caitlyn",
          name: "Caitlyn",
          role: "attacker",
          icon: "assets/champions/Caitlyn/icon.png",
        },
        {
          type: "champion",
          id: "Ahri",
          name: "Ahri",
          role: "target",
          icon: "assets/champions/Ahri/icon.png",
        },
      ],
      items: [],
      abilities: [],
      runes: [],
      summoner_spells: [],
    },
    premise_facts: {
      damage_type: "physical",
      raw_damage: 600,
      target_resist: 60,
      target_resist_after: 100,
    },
  },
};

/** 1 — a plain multiple-choice question: no premise contract, no presentation. */
export const PLAIN_MCQ: RenderQuestion = {
  id: "plain-1",
  question_text: "Which item grants the most armor?",
  choices: [{ label: "Sunfire Aegis" }, { label: "Thornmail" }, { label: "Dead Man's Plate" }],
  correct_index: 1,
  explanation: "Thornmail grants 70 armor.",
  category: "items",
  metadata: { cost: 2700 },
};

/** 2 — a combat scenario the production layout authority fully supports. */
export const COMBAT_SCENARIO: RenderQuestion = {
  id: "combat-1",
  question_text:
    "How much less post-mitigation damage does the hit deal after the purchase?",
  choices: [{ label: "64" }, { label: "86" }, { label: "75" }, { label: "109" }],
  correct_index: 1,
  category: "post_mitigation_damage",
  presentation: COMBAT_PRESENTATION,
};

/** 3 — Minion XP `exact_minion`: a real safe premise the backend does project. */
export const MINION_EXACT: RenderQuestion = {
  id: "minion-exact",
  question_text:
    "Solo lane, no XP missed — which minion of wave 4 takes you to level 4?",
  choices: [
    { label: "1st melee" },
    { label: "2nd melee" },
    { label: "3rd melee" },
    { label: "1st caster" },
  ],
  correct_index: 2,
  category: "league_mechanics",
  presentation: { ...EXACT_MINION_PRESENTATION },
  metadata: EXACT_MINION_METADATA,
};

/**
 * 4 — Minion XP `wave`: the backend deliberately projects NO presentation,
 * because this form's wave number and spawn time map 1:1 back to its answer.
 * The metadata is still complete on the row, and still unusable.
 */
export const MINION_WAVE: RenderQuestion = {
  id: "minion-wave",
  question_text: "Solo lane, no XP missed — which wave takes you to level 4?",
  choices: [{ label: "Wave 3" }, { label: "Wave 4" }, { label: "Wave 5" }, { label: "Wave 6" }],
  correct_index: 1,
  category: "league_mechanics",
  metadata: { ...EXACT_MINION_METADATA, target_level: 4, composition: "3 melee, 3 caster" },
};

/** The Phase 0 diagnostic set, in the order the diagnostic reports them. */
export const PHASE_0_DIAGNOSTIC: readonly RenderQuestion[] = [
  PLAIN_MCQ,
  COMBAT_SCENARIO,
  MINION_EXACT,
  MINION_WAVE,
];
