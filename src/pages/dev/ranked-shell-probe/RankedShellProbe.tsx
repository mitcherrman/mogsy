/**
 * RG1 — dev-only Ranked SHELL probe.
 *
 * The arena inspector next door renders the arena COMPONENTS from fixtures; it
 * deliberately does not mount the live view, so it cannot answer the question
 * RG1 asks: does the page's outer composition hold still when the question
 * inside it changes height?
 *
 * This route mounts the REAL `QuizRankedMatch` inside the REAL `/quiz/ranked`
 * frame, under the REAL app shell, and serves it backend-shaped fixtures from
 * an in-page `fetch` interceptor. Nothing here is a second implementation:
 * there is no engine, no controller and no projection of its own — only a
 * canned HTTP response, which is exactly what the vitest suites already do,
 * moved into a browser so real boxes can be measured.
 *
 * `?q=` selects the question state to serve:
 *   short | opts2 | opts4 | realP99 | realMax | stress | media | family |
 *   stressA | stressB | metareflex | junglePet | junglePetBase | jungleRule |
 *   masteryRecall | masteryCompare (RQ1: a Mastery slice whose challenges
 *   carry `?qroles=` as their frozen roles) | masteryStat (QF1.2A: a
 *   base-stat recall) | abilityCost (QF1.2A: a real `ability_cost_rank`
 *   presentation blob)
 * `?motif=` (QF1) serves `topic.motif` on the question/segment and `motif` on
 *   every Mastery challenge, e.g. `?motif=champion_studies`.
 * `?role=` freezes a League role onto the viewer's participant.
 * `?qroles=` (RQ1) serves the QUESTION's role(s) as `topic.roles`, e.g.
 *   `?qroles=top` or `?qroles=adc,support`. Independent of `?role=` on
 *   purpose: the player's role and the question's roles are different facts.
 * `?points=` serves an RP1 v2 POINTS match instead of the hp one, as
 *   `module:you-them` (e.g. `?points=1:0-0`, `?points=6:11-8`,
 *   `?points=10:24-24`). Anything unparseable serves module 1 at 0–0.
 *   RMOB2: a points state also serves its `module - 1` settled modules as
 *   resolved rounds, so the arena's own resume backfill fills the history.
 * `?progression=0` serves the R1 LIVE shape (`progression_enabled: false`, no
 *   ability layer) instead of the legacy default.
 * `?orole=` freezes a League role onto the opponent's seat too.
 * `?name=` is the viewer's display name, as `QuizRankedPage` would pass it.
 * `?end=victory|defeat|draw` (RE1) serves a FINISHED ten-module points match:
 *   the resume carries the result row, the resume backfill fetches every
 *   settled module (both players' awards), and the review / history /
 *   discoveries reads answer too — so the real end screen renders through the
 *   real controller. `?gap=4,7` withholds those modules' settlements (a
 *   reconnect's partial backfill); `?bot=1` marks the match a bot match;
 *   `?rating=0` withholds the rating row; `?disc=0` serves no discoveries.
 * `?frame=0` mounts the match BARE, exactly as `QuizRankedPage` does (the arena
 *   brings its own `ArenaShell`). The default keeps the historical extra
 *   `Frame`, which every desktop fit baseline was measured inside; on a phone
 *   that second shell costs 32px of padding production never renders.
 *
 * Dev route only — excluded from navigation and the sitemap.
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Frame } from "@/pages/quiz-ranked/QuizRankedPage";
import { RankedRouteHeader } from "@/pages/quiz-ranked/RankedRouteHeader";
import { QuizRankedMatch } from "@/pages/quiz-ranked/QuizRankedMatch";
import {
  matchResultPointsV1, metaReflexSegmentMeta, metaReflexState, modulePointsBlock,
  privatePlayerV2, publicRoundV2, withPointsScoring,
} from "@/lib/ranked-public/fixtures";
import {
  CHAMPION_OPTION_QUESTION, ITEM_OPTION_QUESTION,
} from "@/lib/ranked-core/adapters/optionMediaFixtures";
import {
  PHYSICAL_DAMAGE_PRESENTATION, PHYSICAL_DAMAGE_Q,
} from "@/lib/question-surface/familyLayoutFixtures";
import { RANKED_API_BASE } from "@/lib/ranked-public/client";

const VIEWER = "userA";

/**
 * The probe states, ordered by how much vertical room they need.
 *
 * `realP99` and `realMax` are NOT invented. They are built from a read-only
 * audit of every question `ranked_modern` can currently serve out of the
 * shipped pools (928 distinct rows, all four-option):
 *
 *   prompt chars   p50 44 · p75 51 · p90 89 · p95 94 · p99 99 · max 108
 *   option chars   p50  3 · p75 10 · p90 12 · p95 17 · p99 48 · max  63
 *
 * `realMax` pairs the longest real prompt with the longest real options, so it
 * is an upper bound the bank cannot actually exceed — that is the case the
 * arena MUST fit without scrolling anything.
 *
 * `stress` is the old synthetic probe, kept deliberately: a 480-character
 * prompt (4.4x the real maximum) with four ~130-character options (2.1x). It
 * is a torture test for finding the breaking point, and it does not get to
 * dictate the normal UI.
 */
export const PROBE_STATES = [
  "short", "opts2", "opts4", "realP99", "realMax", "stress", "media", "family", "stressA", "stressB", "metareflex",
  "masteryRecall", "masteryCompare", "masteryStat", "abilityCost",
  "junglePet", "junglePetBase", "jungleRule",
] as const;
export type ProbeState = (typeof PROBE_STATES)[number];

const STRESS_PROMPT =
  "During the mid-game, your team has taken the first Rift Herald and is holding "
  + "a two-turret lead in the top lane while the enemy jungler has just cleared "
  + "the bottom-side camps and the Baron spawn is ninety seconds away. Your "
  + "support has vision on the enemy mid laner rotating toward the river. "
  + "Given that the enemy has one death timer running at twenty-eight seconds "
  + "and your bot lane has just recalled with 1600 gold, which of the following "
  + "objectives should the team commit to first?";

/**
 * RS2 — COMPOUND worst cases at REAL corpus bounds (not the synthetic
 * `stress`). QuestionStageGeometry's corpus audit: prompt MAX 188 chars; the
 * `realMax` option labels are the longest real labels (63 chars). Each state
 * pairs those with the media shape that costs the most height.
 */
const COMPOUND_PROMPT_188 =
  "Trinity Force builds from Sheen and Phage. Your top laner holds both "
  + "components and 1,250 gold after recalling at nine minutes. Which "
  + "other component completes the Trinity Force build now?";
const COMPOUND_FAMILY_PROMPT_188 =
  "Caitlyn's Piltover Peacemaker would deal 600 raw physical damage. Ahri "
  + "then buys Chain Vest, raising armor from 60 to 100. How much less damage "
  + "does the hit deal after that armor purchase?";
const LONGEST_REAL_OPTIONS = [
  "Ability Haste, Ability Power, Heal and Shield Power, Mana Regen",
  "Ability Power, Heal and Shield Power, Move Speed, Mana Regen",
  "Ability Haste, Ability Power, Health, Mana Regeneration Bonus",
  "Ability Haste, Ability Power, Move Speed, Mana Regeneration",
];

const STRESS_OPTIONS = [
  "Group mid and force the Baron immediately, using the Herald to break the mid inhibitor turret before the death timer expires",
  "Rotate the whole team bottom to take the Drake, conceding mid-lane pressure and the Herald charge for the next two minutes",
  "Split the map: send the top laner to side-lane pressure while the remaining four set deep vision around the Baron pit",
  "Reset as a team, buy completed items with the accumulated gold, and re-approach the Baron with a full item advantage",
];

/**
 * JPM1 — a jungle companion subject in the verbatim backend blob shape. The
 * icon is absolutised against THIS origin only because the probe runs with no
 * backend: production serves the same relative path from the API's `/assets`.
 */
function junglePetPresentation(pet: string, form: "base" | "evolved") {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return {
    assets: { subject: {
      type: "jungle_pet", id: pet, name: pet[0].toUpperCase() + pet.slice(1), form,
      icon: `${origin}/assets/ranked/jungle_pets/${pet}_${form}.png`,
    } },
    presentation: { role: "context", timing: "question", spoiler: false },
  };
}

/** RQ1 — a backend-shaped Mastery slice segment for geometry checks. */
function masteryChallenge(kind: "recall" | "compare" | "stat", index: number) {
  const roles = {
    ...(probe.questionRoles.length ? { roles: probe.questionRoles } : {}),
    ...(probe.motif ? { motif: probe.motif } : {}),
  };
  if (kind === "stat") {
    return {
      challenge_index: index, interaction_kind: "atomic_recall",
      question_family: "champion_base_stat", prompt: `Garen base armor #${index}`,
      answer_type: "single_choice", answer_options: ["32", "36", "38", "40"],
      prompt_semantics: { template: "champion_base_stat", champion_display: "Garen",
        metric: "armor" },
      comparison_semantics: null, patch_display: "League 26.18", ...roles,
    };
  }
  return kind === "recall" ? {
    challenge_index: index, interaction_kind: "atomic_recall",
    question_family: "ability_cooldown", prompt: `Brand Q — ability_cooldown #${index}`,
    answer_type: "single_choice", answer_options: ["9", "10", "11", "12"],
    prompt_semantics: { template: "ability_cooldown_at_rank", champion_display: "Brand",
      metric: "ability_cooldown", subject_ref: "Q", ability_name: "Q",
      context: { ability_rank: 1, champion_level: null, form: null } },
    comparison_semantics: null, patch_display: "League 26.18", ...roles,
  } : {
    challenge_index: index, interaction_kind: "comparison_left_right",
    question_family: "ability_cooldown", prompt: "Brand Q vs Diana Q — ability_cooldown",
    answer_type: "single_choice", answer_options: ["Brand", "Diana", "tie"],
    prompt_semantics: null,
    comparison_semantics: { template: "compare_ability_cooldown", champion_a_display: "Brand",
      champion_b_display: "Diana", metric: "ability_cooldown", dimension: "duration",
      subject_ref: "Q", context: { ability_rank: 1, champion_level: null, form: null },
      unit: "seconds", ability_name_a: "Sear", ability_name_b: "Crescent Strike",
      rank_independent: false },
    patch_display: "League 26.18", ...roles,
  };
}

function masterySegment(kind: "recall" | "compare" | "stat") {
  const base = {
    module_id: "mastery_slice", module_version: 1, challenge_count: 3,
    segment_number: 3, phase: "challenges", ability_deadline: null,
    challenge_started_at: "2026-07-18T12:00:05+00:00",
    challenge_deadline: "2026-07-18T12:00:30+00:00", pressure_applied: false,
  };
  return {
    meta: { ...base, challenge_index: 0, resolved: false,
      topic: { category: "general", tier: null,
        icon_hint: { kind: "generic", key: null, icon: null }, roles: probe.questionRoles,
        ...(probe.motif ? { motif: probe.motif } : {}) } },
    state: { ...base, active: true,
      own_ability: { selected_ability_id: null, confirmed: false,
        available_ability_ids: [], unavailable_ability_ids: {} },
      opponent_ability_confirmed: false, own_next_challenge_index: 0,
      own_submitted_choices: [null, null, null], own_challenges_completed: 0,
      opponent_challenges_completed: 0, opponent_finished: false, own_finished: false,
      challenges: { prompt: kind === "stat" ? "Mastery Slice: Garen" : "Mastery Slice: Brand",
        challenge_count: 3,
        challenges: [0, 1, 2].map((i) => masteryChallenge(kind, i)) } },
  };
}

function questionFor(state: ProbeState) {
  const question = baseQuestionFor(state) as Record<string, unknown>;
  if (probe.questionRoles.length === 0 && !probe.motif) return question;
  return { ...question, topic: {
    category: "abilities", tier: "hard",
    icon_hint: { kind: "category", key: String(question.category ?? ""), icon: null },
    roles: probe.questionRoles,
    ...(probe.motif ? { motif: probe.motif } : {}),
  } };
}

function baseQuestionFor(state: ProbeState) {
  switch (state) {
    case "short":
      return { question_id: "q-short", prompt: "Which item grants Immolate?",
        options: ["Sunfire Aegis", "Heartsteel"], category: "items" };
    case "opts2":
      return { question_id: "q-2", prompt: "Is Sunfire Aegis a legendary item?",
        options: ["Yes", "No"], category: "items" };
    case "opts4":
      return { question_id: "q-4", prompt: "Which item grants Immolate?",
        options: ["Sunfire Aegis", "Heartsteel", "Thornmail", "Randuin's Omen"],
        category: "items" };
    case "realP99":
      // p99 of both dimensions, verbatim shapes from the audited pools.
      return { question_id: "q-p99",
        prompt: "What is the cooldown of Kayle R - Divine Judgment at rank 3 "
          + "with 40 ability haste and a completed Cosmic Drive?",
        options: [
          "Ability Haste, Ability Power, Health, Mana Regen",
          "Ability Haste, Ability Power, Move Speed, Mana",
          "Ability Power, Heal and Shield Power, Move Speed",
          "Ability Haste, Health, Move Speed, Mana Regeneration",
        ],
        category: "champion_ability_cooldown" };
    case "realMax":
      // THE BOUND THAT MUST FIT: the longest real prompt (108) paired with the
      // longest real options (63) — a pairing the bank cannot exceed.
      return { question_id: "q-realmax",
        prompt: "What is the cooldown of Vel'Koz R - Life Form Disintegration "
          + "Ray at level 16 with rank 3 R and Cosmic Drive?",
        options: [
          "Ability Haste, Ability Power, Heal and Shield Power, Mana Regen",
          "Ability Power, Heal and Shield Power, Move Speed, Mana Regen",
          "Ability Haste, Ability Power, Health, Mana Regeneration Bonus",
          "Ability Haste, Ability Power, Move Speed, Mana Regeneration",
        ],
        category: "champion_ability_cooldown" };
    case "stress":
      return { question_id: "q-stress", prompt: STRESS_PROMPT,
        options: STRESS_OPTIONS, category: "macro" };
    case "media":
      return ITEM_OPTION_QUESTION;
    // RS2 Stress A: 188-char prompt + longest real labels + cinematic item art.
    case "stressA":
      return { ...ITEM_OPTION_QUESTION, question_id: "q-stress-a",
        prompt: COMPOUND_PROMPT_188, options: LONGEST_REAL_OPTIONS,
        option_media: undefined };
    // RS2 Stress B: 188-char Combat Calculation prompt + longest real labels.
    case "stressB":
      return { question_id: "q-stress-b", prompt: COMPOUND_FAMILY_PROMPT_188,
        options: LONGEST_REAL_OPTIONS, category: PHYSICAL_DAMAGE_Q.category ?? null,
        presentation: PHYSICAL_DAMAGE_PRESENTATION };
    // RS1: a Combat Calculation (family band) round — the longest RA7 prompt.
    case "family":
      return { question_id: PHYSICAL_DAMAGE_Q.questionId, prompt: PHYSICAL_DAMAGE_Q.prompt,
        options: PHYSICAL_DAMAGE_Q.options.map((o) => o.label),
        category: PHYSICAL_DAMAGE_Q.category ?? null,
        presentation: PHYSICAL_DAMAGE_PRESENTATION };
    // JPM1 — Jungle Systems: an evolved pet, a base pet, and a media-free rule.
    case "junglePet": {
      const pet = probe.pet ?? "scorchclaw";
      return { question_id: "q-jungle-pet",
        prompt: "Scorchclaw's Slash burns the champion you hit at full stacks. How much "
          + "of the target's maximum health does that burn deal as true damage?",
        options: ["3%", "4%", "5%", "6%"], category: "Jungle Systems",
        presentation: junglePetPresentation(pet, "evolved") };
    }
    case "junglePetBase": {
      const pet = probe.pet ?? "mosstomper";
      return { question_id: "q-jungle-pet-base",
        prompt: "Your jungle companion has not evolved yet. Which buff will it grant at its final evolution?",
        options: ["A shield", "Bonus movement speed", "A burn", "Bonus gold"],
        category: "Jungle Systems", presentation: junglePetPresentation(pet, "base") };
    }
    // QF1.2A — a pooled `ability_cost_rank` round, with the presentation blob
    // the backend's renderer produces for it verbatim.
    case "abilityCost":
      return { question_id: "qq-ability-cost#r8",
        prompt: "What is the mana cost of Ahri's Orb of Deception (Q) at rank 1?",
        options: ["55", "60", "65", "70"], category: "Champion Ability Costs",
        presentation: { assets: { subject: {
          type: "combat_cooldown", champion: "Ahri", ability_name: "Orb of Deception",
          champion_icon: "assets/champions/Ahri/icon.png",
          ability_icon: "assets/champions/Ahri/Q_AhriQ.png", item_icons: [],
          ability_slot: "Q", champion_splash: "assets/champions/Ahri/splash/0_default.jpg",
          champion_loading: "assets/champions/Ahri/loading/0_default.jpg", ability_rank: 1 } },
          presentation: { role: "context", timing: "question", spoiler: false } } };
    case "jungleRule":
      return { question_id: "q-jungle-rule",
        prompt: "How long does it take a spent Smite charge to recharge?",
        options: ["60 seconds", "75 seconds", "90 seconds", "120 seconds"],
        category: "Jungle Systems" };
    default:
      return CHAMPION_OPTION_QUESTION;
  }
}

/**
 * RP1 — the points state this probe is serving, or null for an hp match.
 *
 * Parsed from `?points=module:you-them`, so every state Step 3 has to be
 * looked at (0–0 at module 1, a two-digit mid-match lead, a tie, module 10/10)
 * is a URL rather than a code change. The numbers are SERVED, exactly as a
 * backend would serve them — nothing in the arena computes one.
 */
function parsePoints(raw: string | null):
{ module: number; you: number; them: number } | null {
  if (raw === null) return null;
  const m = /^(\d+)(?::(\d+)-(\d+))?$/.exec(raw.trim());
  if (!m) return { module: 1, you: 0, them: 0 };
  return {
    module: Number(m[1]) || 1,
    you: Number(m[2] ?? 0), them: Number(m[3] ?? 0),
  };
}

/** Apply the probe's points state to a public/private envelope, or leave it. */
function applyPoints(env: { payload: Record<string, unknown> } & { round_number?: number }) {
  const p = probe.points;
  if (!p) return env;
  // RMOB2 — the module in play is the round in play, and every module before
  // it has settled. Only on envelopes that carry a round (the public one).
  if ("completed_rounds" in env.payload) {
    env.payload.completed_rounds = p.module - 1;
    const active = env.payload.active_round as Record<string, unknown> | null;
    if (active) active.round_number = p.module;
    env.round_number = p.module;
  }
  return withPointsScoring(env, {
    moduleNumber: p.module,
    matchLength: 10,
    modulesCompleted: p.module - 1,
    scores: { userA: p.you, userB: p.them },
  });
}

/** The public-round envelope this probe serves, for one probe state. */
function publicFor(state: ProbeState, role: string | null) {
  const env = publicRoundV2() as ReturnType<typeof publicRoundV2>
    & { payload: Record<string, unknown> };
  const payload = env.payload as Record<string, unknown>;
  // R1: freeze a role onto the viewer's seat and leave the opponent's null —
  // exactly the shape an admin bot match produces.
  const players = (payload.players as Record<string, unknown>[]).map((p, i) => ({
    ...p, role: i === 0 ? role : probe.opponentRole,
  }));
  payload.players = players;
  // R1 matches carry no progression layer, which is what puts the arena in
  // role vocabulary rather than legacy-class vocabulary. `?legacy=1` serves
  // the FLAG-OFF shape instead: both roles null, legacy thresholds — which is
  // what a deployment with RANKED_ROLE_IDENTITY_ENABLED unset actually writes.
  if (!probe.legacy) {
    payload.level_thresholds = [0];
    payload.max_level = 1;
    if (probe.progressionOff) payload.progression_enabled = false;
  } else {
    payload.players = (payload.players as Record<string, unknown>[])
      .map((p) => ({ ...p, role: null }));
    payload.level_thresholds = [0, 30, 66];
    payload.max_level = 3;
  }
  if (state === "metareflex") {
    payload.question = null;
    payload.segment = metaReflexSegmentMeta();
    payload.segment_state = metaReflexState(0);
  } else if (state === "masteryRecall" || state === "masteryCompare" || state === "masteryStat") {
    const seg = masterySegment(state === "masteryRecall" ? "recall"
      : state === "masteryStat" ? "stat" : "compare");
    payload.question = null;
    payload.segment = seg.meta;
    payload.segment_state = seg.state;
  } else {
    payload.question = questionFor(state);
  }
  return applyPoints(env);
}

function privateFor(state: ProbeState) {
  const env = privatePlayerV2(VIEWER) as ReturnType<typeof privatePlayerV2>
    & { payload: Record<string, unknown> };
  const payload = env.payload as Record<string, unknown>;
  payload.level_thresholds = [0];
  payload.max_level = 1;
  if (state === "metareflex") {
    payload.question = null;
    payload.segment = metaReflexSegmentMeta();
    payload.segment_state = metaReflexState(0);
  } else if (state === "masteryRecall" || state === "masteryCompare" || state === "masteryStat") {
    const seg = masterySegment(state === "masteryRecall" ? "recall"
      : state === "masteryStat" ? "stat" : "compare");
    payload.question = null;
    payload.segment = seg.meta;
    payload.segment_state = seg.state;
  } else {
    payload.question = questionFor(state);
  }
  return applyPoints(env);
}

/** RMOB2 — one settled points module, in the shape the backend resolves. */
function resolvedFor(round: number) {
  const T = "2026-07-18T12:00:00+00:00";
  const youScored = round % 3 !== 0;
  const themScored = round % 2 === 1;
  const player = (id: string, scored: boolean) => ({
    player_id: id, class_id: id === VIEWER ? "tank" : "mage",
    outcome: scored ? "correct" : "incorrect", submitted_at: T,
    answered_first: id === VIEWER, timed_out: false, selected_ability_id: null,
    damage: { base_damage_dealt: 0, outgoing_bonus: 0, final_damage_dealt: 0,
      shield_absorbed: 0, incoming_reduction: 0, final_damage_received: 0 },
    hp_before: 170, hp_after: 170, reached_zero_hp: false,
    xp_gained: 0, total_xp_after: 0, level_before: 1, level_after: 1,
    level_up_events: [], charge_consumed: false, consumed_ability_id: null,
    remaining_charges: {},
    carryover: { effects_gained: [], effects_consumed: [], consecutive_correct: 0 },
    combat_lab_unlock_delta_seconds: 0,
  });
  return {
    match_id: "m1", round_number: round, question_id: `q${round}`,
    end_reason: "both_answered", started_at: T, original_deadline: T, final_deadline: T,
    pressure_applied: false,
    players: [player(VIEWER, youScored), player("userB", themScored)],
    next_round_duration_seconds: 30, next_round_duration_delta: 0,
    match_over: false, winner_id: null, completion_reason: null,
    module_points: modulePointsBlock({
      [VIEWER]: { base: youScored ? 2 : 0, speed: youScored && round % 2 === 0 ? 1 : 0 },
      userB: { base: themScored ? 2 : 0 },
    }),
  };
}

/** Mutable, so switching probe state re-serves without a reload. */
const probe: {
  state: ProbeState; role: string | null; legacy: boolean;
  points: { module: number; you: number; them: number } | null;
  questionRoles: string[];
  /** QF1 — `?motif=`, served verbatim; the client validates it. */
  motif: string | null;
  /** JPM1 — `?pet=` companion for the jungle pet states. */
  pet: string | null;
  /** RMOB2 — `?orole=` opponent role; `?progression=0` live R1 shape. */
  opponentRole: string | null;
  progressionOff: boolean;
  /** RE1 — `?end=` terminal state, `?gap=` withheld modules, `?bot=1`. */
  end: EndState | null;
  gaps: number[];
  bot: boolean;
  rated: boolean;
  discoveries: boolean;
} = { state: "opts4", role: "top", legacy: false, points: null, questionRoles: [], motif: null, pet: null,
  opponentRole: null, progressionOff: false, end: null, gaps: [], bot: false, rated: true,
  discoveries: true };

/**
 * RE1 — A FINISHED MATCH, module by module, for both seats.
 *
 * Base and speed travel separately, exactly as `module_points` publishes them,
 * and the final score is the result row's own figure (the sums below), so the
 * end screen is measured on data that agrees with itself. Module 5 is a Meta
 * Reflex block and module 8 a hard module, so the grid carries every base
 * figure a real match can.
 */
type EndState = "victory" | "defeat" | "draw";
const END_LENGTH = 10;
const END_AWARDS: Record<EndState, { you: [number, number][]; them: [number, number][] }> = (() => {
  const strong: [number, number][] = [
    [2, 1], [0, 0], [3, 0], [2, 1], [4, 0], [2, 0], [2, 1], [3, 0], [0, 0], [2, 1]];
  const weak: [number, number][] = [
    [0, 0], [2, 1], [2, 0], [0, 0], [2, 0], [0, 0], [2, 1], [3, 0], [2, 0], [0, 0]];
  const even: [number, number][] = [
    [2, 0], [2, 1], [0, 0], [2, 1], [3, 0], [2, 1], [0, 0], [3, 0], [2, 1], [3, 1]];
  return {
    victory: { you: strong, them: weak },
    defeat: { you: weak, them: strong },
    draw: { you: strong, them: even },
  };
})();
const END_SUBJECTS = [
  "items", "abilities", "summoner_spells", "runes", "meta_reflex",
  "abilities", "items", "item_costs", "runes", "abilities"];

function endTotals(end: EndState) {
  const sum = (rows: [number, number][]) => rows.reduce((t, [b, sp]) => t + b + sp, 0);
  return { userA: sum(END_AWARDS[end].you), userB: sum(END_AWARDS[end].them) };
}

/** The finished match's public snapshot: every module settled, no round open. */
function endPublic(end: EndState) {
  const env = publicFor(probe.state, probe.role) as { payload: Record<string, unknown>;
    round_number?: number };
  const payload = env.payload;
  payload.match_status = "complete";
  payload.match_over = true;
  payload.completed_rounds = END_LENGTH;
  payload.active_round = null;
  payload.question = null;
  payload.winner_id = end === "draw" ? null : end === "victory" ? VIEWER : "userB";
  payload.completion_reason = "segments_complete";
  if (probe.bot) {
    payload.playtest = { question_bank_mode: "production", is_placeholder: false,
      is_bot_match: true, session_preset: null };
  }
  env.round_number = END_LENGTH;
  return withPointsScoring(env, {
    moduleNumber: END_LENGTH, matchLength: END_LENGTH, modulesCompleted: END_LENGTH,
    scores: endTotals(end),
  });
}

function endResult(end: EndState) {
  return matchResultPointsV1(endTotals(end), {
    outcome: end === "draw" ? "draw" : "decisive",
    winner: end === "draw" ? null : end === "victory" ? VIEWER : "userB",
    modulesPlayed: END_LENGTH,
  });
}

/** One settled module of the finished match, both seats' awards intact. */
function endResolved(end: EndState, round: number) {
  const base = resolvedFor(round);
  const [yb, ys] = END_AWARDS[end].you[round - 1];
  const [tb, ts] = END_AWARDS[end].them[round - 1];
  base.players[0].outcome = yb > 0 ? "correct" : "incorrect";
  base.players[1].outcome = tb > 0 ? "correct" : "incorrect";
  base.module_points = modulePointsBlock({
    [VIEWER]: { base: yb, speed: ys }, userB: { base: tb, speed: ts },
  });
  // The final module ends the match the way every points match ends.
  const last = round === END_LENGTH;
  return {
    ...base,
    match_over: last,
    winner_id: last && end !== "draw" ? (end === "victory" ? VIEWER : "userB") : null,
    completion_reason: last ? "segments_complete" : null,
  };
}

function endReview(end: EndState) {
  return {
    schema_version: "ranked_duel.match_review.v1", projection_type: "match_review",
    match_id: "m1", round_number: END_LENGTH, server_time: "2026-07-18T12:10:00+00:00",
    payload: {
      match_id: "m1", final_round_number: END_LENGTH, round_count: END_LENGTH,
      rounds: END_SUBJECTS.map((subject, i) => {
        const won = END_AWARDS[end].you[i][0] > 0;
        const meta = subject === "meta_reflex";
        return {
          round_number: i + 1,
          kind: meta ? "meta_reflex" : "quiz",
          module_id: meta ? "meta_reflex.v1" : "quiz.v1",
          category: meta ? null : subject,
          canonical_question_ref: `ranked:probe-${i + 1}`,
          revealed: true,
          icon_hint: meta ? { kind: "meta_reflex", key: null, icon: null }
            : { kind: "category", key: subject, icon: null },
          question: meta ? null : {
            prompt: `Module ${i + 1} — a probe question.`,
            options: ["A", "B", "C", "D"], correct_option_index: 0, explanation: null,
          },
          challenges: null,
          viewer_submission: {
            answer_index: won ? 0 : 1, is_correct: won,
            correct_count: null, answered_count: null, challenge_count: null,
          },
        };
      }),
    },
  };
}

function endHistory(end: EndState) {
  return {
    schema_version: "ranked_duel.match_history.v1", projection_type: "match_history",
    match_id: null, round_number: null, server_time: "2026-07-18T12:10:00+00:00",
    payload: {
      count: 1,
      entries: [{
        match_id: "m1",
        viewer_outcome: end === "victory" ? "win" : end === "defeat" ? "loss" : "draw",
        terminal_reason: "combat", completion_reason: "segments_complete",
        final_round_number: END_LENGTH, completed_at: "2026-07-18T12:10:00+00:00",
        is_bot_match: probe.bot, viewer_class: "tank", opponent_class: "mage",
        viewer_role: probe.role, opponent_role: probe.opponentRole,
        opponent_display_name: probe.bot ? null : "Rivalmogz",
        opponent_is_bot: probe.bot,
        rating_delta: probe.bot || !probe.rated ? null
          : end === "victory" ? 18 : end === "defeat" ? -14 : 0,
        rating_after: probe.bot || !probe.rated ? null
          : end === "victory" ? 1218 : end === "defeat" ? 1186 : 1200,
      }],
    },
  };
}

function endDiscoveries() {
  const found = probe.discoveries ? [1, 3, 6] : [];
  return {
    schema_version: "ranked_duel.match_discoveries.v1", projection_type: "match_discoveries",
    match_id: "m1", round_number: null, server_time: "2026-07-18T12:10:00+00:00",
    payload: {
      match_id: "m1", scope: "account", includes_default_library: true,
      new_discoveries: found.map((r) => ({
        canonical_question_ref: `ranked:probe-${r}`, first_seen_at: "2026-07-18T12:05:00+00:00",
        first_round_number: r, metadata_status: "resolved", metadata_source: "frozen_round",
        question: { prompt: `Module ${r} — a probe question.`, category: END_SUBJECTS[r - 1] },
      })),
      new_count: found.length, collection_total: 420 + found.length,
      collection_total_before: 420, truncated: false,
    },
  };
}

let installed = false;
function installInterceptor() {
  if (installed) return;
  installed = true;
  const real = window.fetch.bind(window);
  const json = (body: unknown) => new Response(JSON.stringify(body), {
    status: 200, headers: { "Content-Type": "application/json" } });
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input
      : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(`${RANKED_API_BASE}/api/ranked/`)) return real(input as RequestInfo, init);
    const path = url.slice(`${RANKED_API_BASE}`.length);
    // RE1 — a finished match. Checked first: every read below has a terminal
    // answer that differs from the live one.
    const end = probe.end;
    if (end) {
      if (path.endsWith("/resume")) {
        return json({
          schema_version: "ranked_duel.resume.v1", projection_type: "resume",
          match_id: "m1", round_number: END_LENGTH, server_time: "2026-07-18T12:10:00+00:00",
          payload: {
            match_status: "complete", match_over: true,
            public: endPublic(end), private: privateFor(probe.state),
            progression_pending_players: [], latest_resolved_round: null,
            result: endResult(end),
          },
        });
      }
      const settled = /\/rounds\/(\d+)\/resolved$/.exec(path);
      if (settled) {
        const round = Number(settled[1]);
        if (probe.gaps.includes(round) || round > END_LENGTH) {
          return new Response("{}", { status: 404 });
        }
        return json({ schema_version: "ranked_duel.resolved_round.v2",
          projection_type: "resolved_round", match_id: "m1", round_number: round,
          server_time: "2026-07-18T12:10:00+00:00", payload: endResolved(end, round) });
      }
      if (path.endsWith("/result")) return json(endResult(end));
      if (path.endsWith("/review")) return json(endReview(end));
      if (path.endsWith("/discoveries")) return json(endDiscoveries());
      if (path.startsWith("/api/ranked/history")) return json(endHistory(end));
      if (path.includes("/presence")) return json({ status: "complete", match_id: "m1", active: false });
      if (/\/matches\/m1$/.test(path)) return json(endPublic(end));
      return json({});
    }
    if (path.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: 1, server_time: "2026-07-18T12:00:00+00:00",
        payload: {
          match_status: "active", match_over: false,
          public: publicFor(probe.state, probe.role),
          private: privateFor(probe.state),
          progression_pending_players: [], latest_resolved_round: null, result: null,
        },
      });
    }
    // RG1: the probe answers the forfeit command so the control can be
    // exercised here. It settles nothing — this route has no engine — so the
    // arena keeps rendering the live round, which is exactly the property the
    // forfeit tests assert: no client-invented terminal state.
    if (path.endsWith("/forfeit")) {
      return json({ status: "complete", match_id: "m1",
        forfeited: true, already_complete: false });
    }
    // RMOB2 — a settled module of a points state, so the resume backfill (the
    // real controller path) fills the recent-result history. Deterministic:
    // the viewer takes every module but each third, the opponent every other.
    const resolved = /\/rounds\/(\d+)\/resolved$/.exec(path);
    if (resolved && probe.points && Number(resolved[1]) < probe.points.module) {
      const round = Number(resolved[1]);
      return json({ schema_version: "ranked_duel.resolved_round.v2",
        projection_type: "resolved_round", match_id: "m1", round_number: round,
        server_time: "2026-07-18T12:00:00+00:00", payload: resolvedFor(round) });
    }
    if (path.endsWith("/private")) return json(privateFor(probe.state));
    if (path.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (/\/matches\/m1$/.test(path)) return json(publicFor(probe.state, probe.role));
    return json({});
  }) as typeof window.fetch;
}

installInterceptor();

export default function RankedShellProbe() {
  const [params, setParams] = useSearchParams();
  const state = (PROBE_STATES as readonly string[]).includes(params.get("q") ?? "")
    ? (params.get("q") as ProbeState) : "opts4";
  const role = params.get("role");
  probe.state = state;
  probe.role = role && role !== "none" ? role : null;
  probe.legacy = params.get("legacy") === "1";
  probe.points = parsePoints(params.get("points"));
  probe.questionRoles = (params.get("qroles") ?? "").split(",").filter(Boolean);
  probe.motif = params.get("motif") || null;
  const orole = params.get("orole");
  probe.opponentRole = orole && orole !== "none" ? orole : null;
  probe.progressionOff = params.get("progression") === "0";
  const end = params.get("end");
  probe.end = end === "victory" || end === "defeat" || end === "draw" ? end : null;
  probe.gaps = (params.get("gap") ?? "").split(",").map(Number).filter((n) => n > 0);
  probe.bot = params.get("bot") === "1";
  probe.rated = params.get("rating") !== "0";
  probe.discoveries = params.get("disc") !== "0";
  const viewerName = params.get("name");
  const pet = params.get("pet");
  probe.pet = pet && ["scorchclaw", "mosstomper", "gustwalker"].includes(pet) ? pet : null;
  // Remount the arena when the probe state changes so the canned round is
  // re-read; the controller caches its snapshot for the life of the mount.
  const [, force] = useState(0);
  return (
    <div data-testid="ranked-shell-probe">
      <div className="pointer-events-auto fixed bottom-2 left-2 z-[60] flex flex-wrap gap-1
        rounded bg-black/80 p-1 text-[11px] text-white">
        {PROBE_STATES.map((s) => (
          <button key={s} type="button" data-testid={`probe-${s}`}
            className={`rounded px-1.5 py-0.5 ${s === state ? "bg-white text-black" : "bg-white/20"}`}
            onClick={() => {
              const next: Record<string, string> = { q: s, role: role ?? "top" };
              // The points state survives a question switch — otherwise every
              // click drops the match back to hp and the scored states can
              // only be reached by editing the URL.
              const points = params.get("points");
              if (points !== null) next.points = points;
              setParams(next); force((n) => n + 1);
            }}>
            {s}
          </button>
        ))}
      </div>
      {params.get("frame") === "0" ? (
        <QuizRankedMatch key={`${state}:${params.get("points") ?? "hp"}:${params.get("qroles") ?? ""}:${params.toString()}`}
          matchId="m1" viewerUserId={VIEWER} viewerDisplayName={viewerName}
          chrome={<RankedRouteHeader size="wide" />} />
      ) : (
        <Frame size="wide">
          <QuizRankedMatch key={`${state}:${params.get("points") ?? "hp"}:${params.get("qroles") ?? ""}:${params.toString()}`}
            matchId="m1" viewerUserId={VIEWER} viewerDisplayName={viewerName} />
        </Frame>
      )}
    </div>
  );
}
