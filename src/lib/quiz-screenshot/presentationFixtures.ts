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
  question_key: "item_exact_stat:armor:highest",
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
  question_key: "post_mitigation_damage:caitlyn:q:ahri",
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
  question_key: "minion_xp_level_breakpoint:exact_minion:solo:l4:w4",
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
  question_key: "minion_xp_level_breakpoint:wave:solo:l4",
  question_text: "Solo lane, no XP missed — which wave takes you to level 4?",
  choices: [{ label: "Wave 3" }, { label: "Wave 4" }, { label: "Wave 5" }, { label: "Wave 6" }],
  correct_index: 1,
  category: "league_mechanics",
  metadata: { ...EXACT_MINION_METADATA, target_level: 4, composition: "3 melee, 3 caster" },
};

/**
 * A purchase/sell-swap premise — the LIFECYCLE family layout, the second rule
 * `selectFamilyLayout` supports on this branch. Shaped exactly like the RA7
 * fixture the layout authority's own tests use, so the harness proves the
 * bridge for both supported families, not just combat.
 */
export const LIFECYCLE_PRESENTATION = {
  assets: {
    subject: {
      type: "combat_cooldown",
      champion: "Ornn",
      champion_icon: "assets/champions/Ornn/icon.png",
      item_icons: [
        { name: "Sunfire Aegis", icon: "assets/items/3068.png" },
        { name: "Abyssal Mask", icon: "assets/items/8020.png" },
      ],
    },
    entities: {
      champions: [
        {
          type: "champion",
          id: "Ornn",
          name: "Ornn",
          role: "subject",
          icon: "assets/champions/Ornn/icon.png",
        },
      ],
      items: [
        { type: "item", id: 3068, name: "Sunfire Aegis", role: "subject", status: "retained", icon: "assets/items/3068.png" },
        { type: "item", id: 8020, name: "Abyssal Mask", role: "subject", status: "purchased", icon: "assets/items/8020.png" },
        { type: "item", id: 1054, name: "Doran's Shield", role: "subject", status: "sold", icon: "assets/items/1054.png" },
      ],
      abilities: [],
      runes: [],
      summoner_spells: [],
    },
  },
};

/**
 * `ability_cooldown_haste` — the exact safe premise
 * `quiz.family_contract.PREMISE_CONTRACTS` projects for this family, copied
 * from a real active row.
 *
 * It is here because it is the counter-example that shaped the Step 1D gate:
 * `selectFamilyLayout` declines it (no assets, no entities), yet
 * `classifySubject` reads `champion_name` and the band renders a full
 * champion_profile card. A gate keyed on "no family layout" would have failed
 * every one of these; the gate is keyed on the BAND, and passes them.
 */
export const COOLDOWN_HASTE_PRESENTATION = {
  base_cooldown: 5.0,
  rank: 5,
  slot: "E",
  champion_name: "Aatrox",
  ability_haste: 10.0,
  ability_name: "Umbral Dash",
} as const;

/**
 * `pro_champion_scope_comparison` — likewise the real projected premise from an
 * active row. Scope, metric and candidate identities: no subject, no entities,
 * nothing `classifySubject` or `selectFamilyLayout` can draw. The band falls
 * back to the category-only compact strip, so the premise reaches no pixel.
 */
export const PRO_SCOPE_PRESENTATION = {
  scope_key: "World Championship|ALL|4.14",
  candidates: ["Janna", "Kha'Zix"],
  metric: "picks",
  patch: "4.14",
  shape: "pairwise",
  tournament_id: null,
  league_slug: "World Championship",
} as const;

/** 5 — a lifecycle transaction premise the layout authority fully supports. */
export const LIFECYCLE_SCENARIO: RenderQuestion = {
  id: "lifecycle-1",
  question_key: "flat_inventory_stat:ornn:sell-swap",
  question_text:
    "Ornn started with Doran's Shield and still has Sunfire Aegis. Later, Ornn sold "
    + "Doran's Shield and bought Abyssal Mask. How much flat health do Ornn's items provide now?",
  choices: [{ label: "750" }, { label: "810" }, { label: "700" }, { label: "800" }],
  correct_index: 1,
  category: "flat_inventory_stat",
  presentation: LIFECYCLE_PRESENTATION,
};

/** 6 — a real `ability_cooldown_haste` row: no family band, a cinematic one. */
export const COOLDOWN_HASTE: RenderQuestion = {
  id: "haste-1",
  question_key: "ability_cooldown_haste:aatrox:e:r5",
  question_text:
    "Aatrox E - Umbral Dash has a rank 5 cooldown of 5 seconds. With Sundered Sky and "
    + "Plated Steelcaps and Spear of Shojin, what is its cooldown?",
  choices: [{ label: "4.5" }, { label: "5.0" }, { label: "4.0" }, { label: "3.5" }],
  correct_index: 0,
  category: "Champion Ability Cooldowns",
  presentation: { ...COOLDOWN_HASTE_PRESENTATION },
};

/** 7 — a real `pro_champion_scope_comparison` row: a premise that draws nothing. */
export const PRO_SCOPE_COMPARISON: RenderQuestion = {
  id: "pro-1",
  question_key: "pro_champion_scope_comparison:worlds:4.14:picks",
  question_text:
    "In World Championship (patch 4.14), which champion had the higher pick count: "
    + "Kha'Zix or Janna?",
  choices: [{ label: "Kha'Zix" }, { label: "Janna" }],
  correct_index: 0,
  category: "Pro Play",
  presentation: { ...PRO_SCOPE_PRESENTATION },
};

/**
 * 8 — a row the preview envelope cannot shape into a public question at all:
 * one option. `storedQuestionPreviewPayload` returns null, so the resolver
 * reports `unreadable` rather than adapting a half-model.
 *
 * Not reachable through the render harness — `adaptScreenshotQuestion` refuses
 * a row with fewer than two choices before it is ever injected — which is why
 * this fixture is exercised on the pure path. It is kept because `unreadable`
 * is a real resolver outcome for the Admin preview, which loads rows the
 * screenshot adapter never sees.
 */
export const UNREADABLE_PRESENTATION_QUESTION: RenderQuestion = {
  id: "unreadable-1",
  question_key: "broken:presentation:row",
  question_text: "Which item grants the most armor?",
  choices: [{ label: "Thornmail" }],
  correct_index: 0,
  category: "items",
  presentation: { ...COMBAT_PRESENTATION },
};

/**
 * 9 — a row whose presentation the RANKED TRANSPORT reader discards.
 *
 * `readOptionalPresentation` walks a presentation against a node budget and
 * returns null for anything over it, so a payload that is well-formed on the
 * wire can still arrive with no premise attached. The row is a complete,
 * capturable question — the harness accepts it and the card renders — and the
 * premise silently vanishes on the way to the band. Exactly the class of
 * silent loss this gate exists to catch, and reachable through the real page.
 */
export const OVERSIZED_PRESENTATION_QUESTION: RenderQuestion = {
  id: "oversized-1",
  question_key: "oversized:presentation:row",
  question_text: "Which item grants the most armor?",
  choices: [{ label: "Sunfire Aegis" }, { label: "Thornmail" }, { label: "Randuin's Omen" }],
  correct_index: 1,
  category: "items",
  presentation: Object.fromEntries(
    // Comfortably past the reader's node budget.
    Array.from({ length: 800 }, (_, i) => [`fact_${i}`, i]),
  ),
};

/** The Phase 0 diagnostic set, in the order the diagnostic reports them. */
export const PHASE_0_DIAGNOSTIC: readonly RenderQuestion[] = [
  PLAIN_MCQ,
  COMBAT_SCENARIO,
  MINION_EXACT,
  MINION_WAVE,
];

// ---------------------------------------------------------------------------
// CON1 Step 1E — asset-health fixtures
//
// These mirror what `quiz.asset_health.compute_asset_status` actually returns
// for the corresponding row shapes, verified against the backend module and
// the live corpus (58,526 active rows). They are the ONLY asset knowledge in
// the Content Factory — a fixture of the backend's answer, never a lookup that
// could be consulted at runtime.
// ---------------------------------------------------------------------------

/** A visual-recognition question whose required icon resolves. */
export const ASSET_REQUIRED_RESOLVED = {
  status: "resolved",
  reason: "",
  references: [
    {
      channel: "image_path",
      path: "assets/champions/Aatrox/icon.png",
      requirement: "required",
      resolution: "match",
      resolved_path: "assets/champions/Aatrox/icon.png",
      reason: "",
    },
  ],
  unresolved: [],
  degraded_to_text: false,
  optional_unresolved: false,
  case_repaired: false,
} as const;

/** The same family, with the file absent from disk. */
export const ASSET_REQUIRED_UNRESOLVED = {
  status: "unresolved",
  reason:
    "image_path: 'assets/champions/NoSuchChampion/icon.png' does not resolve to a file on disk",
  references: [
    {
      channel: "image_path",
      path: "assets/champions/NoSuchChampion/icon.png",
      requirement: "required",
      resolution: "missing",
      resolved_path: null,
      reason:
        "'assets/champions/NoSuchChampion/icon.png' does not resolve to a file on disk",
    },
  ],
  unresolved: [
    {
      channel: "image_path",
      path: "assets/champions/NoSuchChampion/icon.png",
      requirement: "required",
      resolution: "missing",
      resolved_path: null,
      reason:
        "'assets/champions/NoSuchChampion/icon.png' does not resolve to a file on disk",
    },
  ],
  degraded_to_text: false,
  optional_unresolved: false,
  case_repaired: false,
} as const;

/**
 * A text-only question — Minion XP is exactly this. The band is drawn from
 * geometric glyphs, so no minion art is referenced and none is required.
 */
export const ASSET_NOT_REQUIRED = {
  status: "not_required",
  reason: "",
  references: [],
  unresolved: [],
  degraded_to_text: false,
  optional_unresolved: false,
  case_repaired: false,
} as const;

/**
 * A context family (`item_cost`) whose illustrative icon is gone. The prompt
 * names the item, so production legitimately renders this as text.
 */
export const ASSET_OPTIONAL_UNRESOLVED = {
  status: "not_required",
  reason: "",
  references: [
    {
      channel: "image_path",
      path: "assets/items/9999.png",
      requirement: "optional",
      resolution: "missing",
      resolved_path: null,
      reason: "'assets/items/9999.png' does not resolve to a file on disk",
    },
  ],
  unresolved: [],
  degraded_to_text: false,
  optional_unresolved: true,
  case_repaired: false,
} as const;

/** An audited answer-revealing family: production withholds the image. */
export const ASSET_WITHHELD = {
  status: "not_required",
  reason: "",
  references: [
    {
      channel: "image_path",
      path: "assets/items/3003.png",
      requirement: "withheld",
      resolution: "match",
      resolved_path: "assets/items/3003.png",
      reason: "",
    },
  ],
  unresolved: [],
  degraded_to_text: true,
  optional_unresolved: false,
  case_repaired: false,
} as const;

/** Serves through the resolver's case repair; the stored string 404s on Linux. */
export const ASSET_CASE_REPAIRED = {
  status: "resolved",
  reason: "",
  references: [
    {
      channel: "image_path",
      path: "assets/champions/BelVeth/icon.png",
      requirement: "required",
      resolution: "case_repaired",
      resolved_path: "assets/champions/Belveth/icon.png",
      reason:
        "stored spelling 'assets/champions/BelVeth/icon.png' differs from the " +
        "on-disk spelling 'assets/champions/Belveth/icon.png'; it opens on a " +
        "case-insensitive filesystem and 404s on Linux",
    },
  ],
  unresolved: [],
  degraded_to_text: false,
  optional_unresolved: false,
  case_repaired: true,
} as const;

/** No asset tree in the serving checkout — nothing is claimed either way. */
export const ASSET_UNKNOWN = {
  status: "unknown",
  reason: "no asset tree in this checkout; asset health cannot be judged here",
  references: [],
  unresolved: [],
  degraded_to_text: false,
  optional_unresolved: false,
  case_repaired: false,
} as const;
