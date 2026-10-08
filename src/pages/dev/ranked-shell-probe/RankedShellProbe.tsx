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
 *   stressA | stressB | metareflex | orderforge (OF1-B: an Order Forge segment; `?forge=locked|revealed|live`
 *   serves the viewer past their Lock In) | reconstruct (GM1-R1: a Reconstruct
 *   segment; `?rc=witsEnd|stormrazor|fourSlot` picks the real round and
 *   `?recon=locked|wrong|right|live` serves the viewer past their Lock In) | junglePet | junglePetBase | jungleRule |
 *   masteryRecall | masteryCompare (RQ1: a Mastery slice whose challenges
 *   carry `?qroles=` as their frozen roles) | masteryStat (QF1.2A: a
 *   base-stat recall) | abilityCost (QF1.2A: a real `ability_cost_rank`
 *   presentation blob) | matchup (VISCONT1: a two-champion Matchup card) |
 *   twoChamp (VISCONT1: the RCP1 two-option champion duel, option media only)
 * `?seq=a,b,c,d` (VISCONT1) — with `?sfx=1`, serves probe state `a` for round
 *   1, `b` for round 2 and so on, and settles each round with a correct option
 *   and an evidence note. Advancing the SFX fixture therefore plays a real
 *   question → reveal → next question sequence inside ONE mount of the arena,
 *   which is what the visual-continuity certification measures.
 * `?broken=1` (VISCONT1) points every served asset path at a file that does
 *   not exist, so a failed load can be measured against a loaded one.
 * `?q=shape&alen=N&acount=K&plen=M&rich=1` (VISCONT1) serves a round of an
 *   exact CONTENT SHAPE — K option labels of N characters and an M-character
 *   prompt, built from real League vocabulary, on a compact plate or (rich=1)
 *   the cinematic item card — so the harness can find where a typography tier
 *   stops fitting. Inside `?seq=` the same round is `shape.N.K.M.R`.
 * `?lol=1` (VISCONT1-SSM) wears the League section's `theme-lol` root class,
 * so the prompt is drawn in the production display face (Cinzel).
 *
 * `?mrlive=1` (SCBS1) walks a Stat Check block through the live controller, one
 *   server snapshot per Advance click (`probe-mr-advance`): an ordinary quiz
 *   round, the first card, its reveal, a middle card, the final card, its
 *   reveal, the wait, and the settled block with the next quiz round. See
 *   `statCheckLiveScript.ts`.
 * `?evlen=N` (VISCONT1) settles `?seq=` rounds with an N-character evidence
 *   statement (capped at 96, the longest the evidence beat carries).
 * `?ruleset=time_trial|survival|standard` (VISCONT1) serves the Daily stage
 *   ruleset block on the public round; `?host=daily` mounts the match the way
 *   `DailyRunPage` does (hosted, bare), so Daily stages are measured through
 *   the hosted code path rather than inferred.
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
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Frame } from "@/pages/quiz-ranked/QuizRankedPage";
import { RankedRouteHeader } from "@/pages/quiz-ranked/RankedRouteHeader";
import { QuizRankedMatch } from "@/pages/quiz-ranked/QuizRankedMatch";
import { MetaReflexSting } from "@/components/ranked-arena/MetaReflexSting";
import { RankedFinalRoundWarning } from "@/components/ranked-arena/RankedFinalRoundWarning";
import { RankedMatchOutro } from "@/components/ranked-arena/RankedMatchOutro";
import {
  matchResultPointsV1, metaReflexCards, metaReflexLevelAwareCard, metaReflexSegmentMeta, metaReflexState, modulePointsBlock,
  orderForgeChallengeReveal, orderForgeSegmentMeta, orderForgeState,
  RECONSTRUCT_PROBE_ROUNDS, reconstructChallengeReveal, reconstructRound, reconstructSegmentMeta,
  reconstructState, type ReconstructProbeRound,
  privatePlayerV2, publicRoundV2, withPointsScoring,
} from "@/lib/ranked-public/fixtures";
import {
  CHAMPION_OPTION_QUESTION, ITEM_OPTION_QUESTION, TWO_CHAMPION_OPTION_QUESTION,
} from "@/lib/ranked-core/adapters/optionMediaFixtures";
import {
  PHYSICAL_DAMAGE_PRESENTATION, PHYSICAL_DAMAGE_Q,
} from "@/lib/question-surface/familyLayoutFixtures";
import { RANKED_API_BASE } from "@/lib/ranked-public/client";
import {
  STAT_CHECK_LIVE_LAST_STEP, applyStatCheckLive, statCheckLiveSettled,
} from "./statCheckLiveScript";
import {
  FORGE_BOT_MATCH_ID, FORGE_BOT_VIEWER, forgeBotReplay, isForgeBotReplay,
} from "./orderForgeBotReplay";

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
  "short", "opts2", "opts4", "realP99", "realMax", "stress", "media", "family", "stressA", "stressB", "metareflex", "orderforge",
  "reconstruct", "masteryRecall", "masteryCompare", "masteryStat", "abilityCost",
  "junglePet", "junglePetBase", "jungleRule", "minionWave", "jungleLong",
  "spellCooldown", "matchup", "twoChamp", "shape",
  "ssm212", "ssm218", "ssm224", "ssm228", "ssm248",
  "f1Ionian", "f1IonianText", "f1Chempunk", "f1ChempunkText", "f1Locket",
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

/**
 * The probe's own reveal: the shared fixture's canonical order runs cheapest
 * first under a "Most expensive" first rail, which is fine for contract tests
 * and wrong on screen. Here it agrees with the rail (OF4); marks match it.
 */
const PROBE_FORGE_REVEAL = {
  canonical_order: ["e1", "e4", "e3", "e0", "e2"],
  position_correct: [false, false, false, false, true],
  entries: [
    { entry_id: "e0", label: "Kindlegem", value_display: "800 gold" },
    { entry_id: "e1", label: "Infinity Edge", value_display: "3,450 gold" },
    { entry_id: "e2", label: "Long Sword", value_display: "350 gold" },
    { entry_id: "e3", label: "Sunfire Aegis", value_display: "2,700 gold" },
    { entry_id: "e4", label: "Zhonya's Hourglass", value_display: "3,250 gold" },
  ],
};
/** OF4 — `?forge=live`: locked, then the reveal lands this long after the first read. */
const FORGE_LIVE_REVEAL_MS = 2500;
let forgeLiveAnchor: number | null = null;

/**
 * `?forge=locked|revealed` serves the viewer past their Lock In (OF1-B);
 * `?forge=live` serves the lock and then the reveal, so the reveal animation
 * plays as it does in a match (OF4).
 */
function orderForgeProbeState() {
  const mode = new URLSearchParams(window.location.search).get("forge");
  if (mode === "live") {
    if (forgeLiveAnchor === null) forgeLiveAnchor = Date.now();
    if (Date.now() - forgeLiveAnchor < FORGE_LIVE_REVEAL_MS) return orderForgeState({}, true);
  }
  if (mode === "revealed" || mode === "live") {
    return orderForgeState({
      own_challenge_reveals: [orderForgeChallengeReveal(PROBE_FORGE_REVEAL)] }, true);
  }
  return orderForgeState({}, mode === "locked");
}

/** GM1-R1 — `?recon=live`: locked, then the reveal lands this long after the first read. */
const RECON_LIVE_REVEAL_MS = 2500;
let reconLiveAnchor: number | null = null;

/**
 * `?rc=` picks one of the server-produced rounds; `?recon=locked|wrong|right`
 * serves the viewer past their Lock In (locked: the wrong build, not yet
 * revealed); `?recon=live` serves the lock, then the wrong reveal, so the
 * reveal choreography plays as it does in a match.
 */
function reconstructProbeState() {
  const params = new URLSearchParams(window.location.search);
  const asked = params.get("rc") as ReconstructProbeRound | null;
  const round: ReconstructProbeRound = asked && RECONSTRUCT_PROBE_ROUNDS.includes(asked) ? asked : "witsEnd";
  const mode = params.get("recon");
  const r = reconstructRound(round);
  if (mode === "live") {
    if (reconLiveAnchor === null) reconLiveAnchor = Date.now();
    if (Date.now() - reconLiveAnchor < RECON_LIVE_REVEAL_MS) {
      return reconstructState(round, {}, r.wrong_placement);
    }
  }
  if (mode === "wrong" || mode === "live") {
    return reconstructState(round, {
      own_challenge_reveals: [reconstructChallengeReveal(round, "wrong")] }, r.wrong_placement);
  }
  if (mode === "right") {
    return reconstructState(round, {
      own_challenge_reveals: [reconstructChallengeReveal(round, "right")] }, r.right_placement);
  }
  return reconstructState(round, {}, mode === "locked" ? r.wrong_placement : null);
}

/** VISCONT1 — a `?seq=` entry: a probe state, or `shape.N.K.M.R`. */
const SEQ_ENTRY = /^shape(?:\.\d+){0,5}$/;

/** VISCONT1 — the probe state the CURRENT round serves: `?seq=` by round. */
function stateForRound(state: ProbeState): string {
  if (probe.seq.length === 0) return state;
  const round = probe.sfxStep > 0 && probe.sfxStep < 5 ? Math.max(1, probe.sfxStep) : 1;
  return probe.seq[Math.min(round, probe.seq.length) - 1];
}

/** VISCONT1 — `?broken=1`: every served asset path, pointed at nothing. */
function breakAssets<T>(value: T): T {
  if (typeof value === "string") {
    return (/^(assets|api\/ranked\/media)\//.test(value)
      ? value.replace(/^[^/]+(?:\/[^/]+)*\//, "assets/__viscont_missing__/") : value) as T;
  }
  if (Array.isArray(value)) return value.map(breakAssets) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, breakAssets(v)])) as T;
  }
  return value;
}

/**
 * VISCONT1 — real League vocabulary, cut to an exact length at a word
 * boundary, so a label of N characters wraps the way a real label of N
 * characters does (no synthetic long tokens, no repeated filler).
 */
const SHAPE_WORDS = ("Ability Haste, Ability Power, Heal and Shield Power, Mana Regeneration, "
  + "Move Speed, Health, Armor Penetration, Magic Resist, Lethality, Omnivamp, Tenacity, "
  + "Attack Speed, Critical Strike Chance, Base Health Regeneration, Life Steal").split(" ");
const PROMPT_WORDS = ("Your jungler has taken the first dragon and your top laner holds the "
  + "Rift Herald while the enemy support rotates toward the river with vision on the "
  + "mid lane, and your team has two completed items and a lead in tower plates, so "
  + "which objective or item choice gives the team the strongest advantage next").split(" ");

function exactText(words: string[], length: number, offset: number, end = ""): string {
  let out = "";
  for (let i = 0; out.length < length + 12; i++) {
    out += (out ? " " : "") + words[(offset + i) % words.length];
  }
  const cut = out.slice(0, Math.max(1, length - end.length));
  const at = cut.lastIndexOf(" ");
  const trimmed = (at > cut.length * 0.6 ? cut.slice(0, at) : cut).replace(/[ ,]+$/, "");
  return trimmed + end;
}

function shapeQuestion(token: string) {
  const parts = token.split(".").slice(1).map(Number);
  const q = new URLSearchParams(window.location.search);
  const num = (i: number, key: string, dflt: number) =>
    Number.isFinite(parts[i]) ? parts[i] : Number(q.get(key) ?? dflt) || dflt;
  const alen = num(0, "alen", 20);
  const acount = Math.max(2, Math.min(4, num(1, "acount", 4)));
  const plen = num(2, "plen", 60);
  const rich = (Number.isFinite(parts[3]) ? parts[3] : Number(q.get("rich") ?? 0)) === 1;
  // VISCONT1-F1 — `om=1`: every option carries the canonical inline item icon
  // (the same `option_media` shape the backend serves), and the labels are
  // cut from real item names so they wrap the way item options do.
  const om = (Number.isFinite(parts[4]) ? parts[4] : Number(q.get("om") ?? 0)) === 1;
  const options = Array.from({ length: acount },
    (_, i) => om ? exactText(ITEM_NAME_WORDS, alen, i * 3) : exactText(SHAPE_WORDS, alen, i * 5));
  const prompt = exactText(PROMPT_WORDS, plen, 0, "?");
  const option_media = om ? options.map((name, i) => itemOptionMedia(name, F1_ICON_IDS[i % F1_ICON_IDS.length])) : undefined;
  return rich
    ? { ...ITEM_OPTION_QUESTION, question_id: `q-shape-${token}`, prompt, options, option_media }
    : { question_id: `q-shape-${token}`, prompt, options, category: "champion_ability_cooldown",
      ...(option_media ? { option_media } : {}) };
}

/**
 * VISCONT1-F1 — REAL item-graph rounds whose labels wrap beside their inline
 * option icon (Phase 1 final certification F1). Served verbatim in Ranked and
 * Daily: `quiz:item_component_v2:Dead Man's Plate:Chain Vest` (24-character
 * "Ionian Boots of Lucidity") and "What can Giant's Belt build into?"
 * (19-character "Chempunk Chainsword"). Each has a TEXT-ONLY twin — the same
 * labels with no option media — as the control: same characters, no icon.
 * `f1Locket` is a longer (25-character) media-bearing set.
 */
const ITEM_NAME_WORDS = ("Ionian Boots of Lucidity Chempunk Chainsword Locket of the Iron "
  + "Solari Plated Steelcaps Runic Compass Shurelya's Battlesong Mercury's Scimitar "
  + "Youmuu's Ghostblade Rabadon's Deathcap Zeke's Convergence Bandleglass Mirror").split(" ");
const F1_ICON_IDS = [3158, 3047, 3866, 1031, 6609, 3068, 3084, 3075];
const itemOptionMedia = (name: string, id: number) =>
  ({ type: "item", id, name, icon: `assets/items/${id}.png` });
const F1_ROUNDS: Record<string, { subject: [string, number]; prompt: string; options: [string, number][] }> = {
  f1Ionian: { subject: ["Dead Man's Plate", 3742], prompt: "Which item is a component of Dead Man's Plate?",
    options: [["Ionian Boots of Lucidity", 3158], ["Plated Steelcaps", 3047], ["Runic Compass", 3866], ["Chain Vest", 1031]] },
  f1Chempunk: { subject: ["Giant's Belt", 1011], prompt: "What can Giant's Belt build into?",
    options: [["Chempunk Chainsword", 6609], ["Sunfire Aegis", 3068], ["Heartsteel", 3084], ["Thornmail", 3075]] },
  f1Locket: { subject: ["Aegis of the Legion", 3105], prompt: "What can Aegis of the Legion build into?",
    options: [["Locket of the Iron Solari", 3190], ["Zeke's Convergence", 3050], ["Knight's Vow", 3109], ["Bandleglass Mirror", 4642]] },
};
function f1Question(state: string) {
  const textOnly = state.endsWith("Text");
  const round = F1_ROUNDS[textOnly ? state.slice(0, -4) : state];
  const [name, id] = round.subject;
  return { question_id: `q-${state}`, prompt: round.prompt, category: "item_component",
    options: round.options.map(([label]) => label),
    presentation: { assets: { subject: { type: "item", name, icon: `assets/items/${id}.png` } },
      presentation: { scenario_type: "item", timing: "question", role: "context", spoiler: false } },
    ...(textOnly ? {} : { option_media: round.options.map(([label, oid]) => itemOptionMedia(label, oid)) }) };
}

/** VISCONT1-SSM — `ssm.combined.<SPELL>.<rune>+<item>`, verbatim old wording. */
const SSM_COMBINED: Record<string, [spell: string, cooldown: number, item: string, itemHaste: number]> = {
  ssm212: ["Heal", 240, "Crimson Lucidity", 20],
  ssm218: ["Exhaust", 240, "Crimson Lucidity", 20],
  ssm224: ["Ignite", 180, "Ionian Boots of Lucidity", 10],
  ssm228: ["Teleport", 360, "Ionian Boots of Lucidity", 10],
  ssm248: ["Unleashed Teleport", 330, "Ionian Boots of Lucidity", 10],
};

function ssmCombinedQuestion(state: string) {
  const [spell, cooldown, item, itemHaste] = SSM_COMBINED[state];
  const total = 18 + itemHaste;
  const after = (cooldown * 100 / (100 + total)).toFixed(1);
  return { question_id: `q-${state}`,
    prompt: `${spell} has a ${cooldown}-second base cooldown. You are running Cosmic Insight `
      + `(18 summoner spell haste) and ${item} (${itemHaste} summoner spell haste). That is `
      + `${total} summoner spell haste in total. What is ${spell}'s cooldown now?`,
    options: [`${after}s`, `${(cooldown * 100 / (100 + 18)).toFixed(1)}s`, `${cooldown}s`,
      `${(cooldown * 100 / (100 + itemHaste)).toFixed(1)}s`],
    category: "summoners",
    presentation: { assets: { subject: { type: "summoner_spell_haste", spell,
      spell_icon: `assets/summoner_spells/${spell.replace(/ /g, "")}.png`,
      sources: [
        { name: "Cosmic Insight", icon: "assets/runes/Cosmic_Insight.png", kind: "rune" },
        { name: item, icon: "assets/items/3158.png", kind: "item" },
      ],
      total_haste: total, badge: "Summoner Spell" } },
      presentation: { role: "context", timing: "question", spoiler: false } } };
}

function questionFor(state: ProbeState) {
  const round = stateForRound(state);
  const served = (round.startsWith("shape") ? shapeQuestion(round)
    : baseQuestionFor(round as ProbeState)) as Record<string, unknown>;
  const question = probe.broken ? breakAssets(served) : served;
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
    // QF1 Rift/Jungle — an `environment_mechanic` minion row, with the blob the
    // backend renderer produces for (minion_base_stats, gold_start:melee).
    case "minionWave":
      return { question_id: "qq-minion-wave#r4",
        prompt: "How much gold does a melee minion grant at the start of the game?",
        options: ["20", "21", "22", "23"], category: "Minion Waves",
        presentation: { assets: { subject: { type: "minion", id: "melee",
          name: "Melee Minion", icon: "assets/minions/melee.png" } },
          presentation: { role: "context", timing: "question", spoiler: false } } };
    // QF1 Rift/Jungle — long-prompt stress for a media-less jungle rule.
    case "jungleLong":
      return { question_id: "q-jungle-long",
        prompt: "Your jungle companion has finished its quest and your Smite has upgraded. "
          + "When you next Smite an enemy champion, how much of the upgraded Smite's "
          + "damage is dealt, and as what damage type?",
        options: ["All of it, as true damage", "Half of it, as true damage",
          "All of it, as magic damage", "None; Smite cannot target champions"],
        category: "Jungle Systems" };
    // QF1 Spells — a pooled `summoner_spell_cooldown` round, with the blob the
    // backend renderer produces for Ignite.
    case "spellCooldown":
      return { question_id: "qq-spell-cd#r2", prompt: "What is the cooldown of Ignite?",
        options: ["150 seconds", "180 seconds", "210 seconds", "240 seconds"],
        category: "Summoner Spells",
        presentation: { assets: { subject: { type: "summoner_spell_subject", spell: "Ignite",
          spell_icon: "assets/summoner_spells/Ignite.png", badge: "Summoner Spell" } },
          presentation: { role: "context", timing: "question", spoiler: false } } };
    // VISCONT1-SSM — the REAL `ssm.combined` (rune + item) Mastery prompt in
    // its pre-QWORD wording, 212-224 characters: the shape the Phase 1 release
    // certification found past the bank's 188 (B1). Real spells, real sources,
    // real sentence shape, so it wraps the way the served prompt does. `ssm228`
    // (Teleport + Ionian Boots of Lucidity) is the longest the old wording can
    // produce and the certified safety bound; `ssm248` is PAST it, kept only to
    // measure what lies beyond the bound.
    case "f1Ionian": case "f1IonianText": case "f1Chempunk": case "f1ChempunkText": case "f1Locket":
      return f1Question(state);
    case "ssm212": case "ssm218": case "ssm224": case "ssm228": case "ssm248":
      return ssmCombinedQuestion(state);
    // VISCONT1 — a two-champion Matchup card (two 50/50 splashes, VS seam),
    // in the subject shape the backend emits for a champion comparison.
    case "matchup":
      return { question_id: "q-matchup",
        prompt: "At rank 1, whose W has the longer cooldown: Ahri or Syndra?",
        options: ["Ahri", "Syndra"], category: "Champion Ability Cooldowns",
        presentation: { assets: { subject: {
          type: "matchup", champion_a: "Ahri", champion_b: "Syndra", badge: "Matchup",
          champion_a_splash: "assets/champions/Ahri/splash/0_default.jpg",
          champion_a_icon: "assets/champions/Ahri/icon.png",
          champion_b_splash: "assets/champions/Syndra/splash/0_default.jpg",
          champion_b_icon: "assets/champions/Syndra/icon.png",
          ability_slot: "W", ability_name: "Ability W", metric_label: "Cooldown",
          ability_rank: 1 } },
          presentation: { role: "context", timing: "question", spoiler: false } } };
    // VISCONT1 — RCP1's two-option champion duel: option media, no premise.
    case "twoChamp":
      return TWO_CHAMPION_OPTION_QUESTION;
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
  // RFX1 2B2 — `?bot=1` on a LIVE round, not only on the end screen. The
  // arena's bot vocabulary (the "vs Bot" note, `opponentLabelFor`, the entry
  // card's Academy Duel eyebrow) all read this one field, and the probe could
  // not reach any of it before.
  if (probe.bot) {
    payload.playtest = { question_bank_mode: "production", is_placeholder: false,
      is_bot_match: true, session_preset: null };
  }
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
    payload.segment_state = probeMetaReflexState();
  } else if (state === "orderforge") {
    payload.question = null;
    payload.segment = orderForgeSegmentMeta();
    payload.segment_state = orderForgeProbeState();
  } else if (state === "reconstruct") {
    payload.question = null;
    payload.segment = reconstructSegmentMeta();
    payload.segment_state = reconstructProbeState();
  } else if (state === "masteryRecall" || state === "masteryCompare" || state === "masteryStat") {
    const seg = masterySegment(state === "masteryRecall" ? "recall"
      : state === "masteryStat" ? "stat" : "compare");
    payload.question = null;
    payload.segment = seg.meta;
    payload.segment_state = seg.state;
  } else {
    payload.question = questionFor(state);
  }
  // VISCONT1 — `?ruleset=`: the Daily stage ruleset block, as the backend
  // publishes it on the round (a fresh stage: nothing settled, no strikes).
  if (probe.ruleset) {
    payload.ruleset = { ruleset_id: probe.ruleset,
      max_strikes: probe.ruleset === "survival" ? 3 : null, strikes: 0,
      questions_settled: 0, stage_ended: false, live_strikes: 0 };
  }
  if (probe.mrStep !== null) return applyStatCheckLive(env, probe.mrStep);
  const applied = applyPoints(env);
  if (probe.sfxStep > 0 && probe.sfxStep < 5) {
    const round = Math.max(1, probe.sfxStep);
    const completed = round - 1;
    const active = payload.active_round as Record<string, unknown> | null;
    if (active) active.round_number = round;
    payload.completed_rounds = completed;
    env.round_number = round;
    const publicPlayers = payload.players as Record<string, unknown>[];
    publicPlayers[0].has_submitted = false;
    publicPlayers[1].has_submitted = probe.sfxStep === 1;
    const viewerScore = completed >= 2 ? 5 : completed >= 1 ? 2 : 0;
    const opponentScore = completed >= 3 ? 4 : completed >= 1 ? 2 : 0;
    return withPointsScoring(applied, {
      moduleNumber: round, matchLength: 10, modulesCompleted: completed,
      scores: { userA: viewerScore, userB: opponentScore },
    });
  }
  return applied;
}

/** SC-RENAME3: `?mrlvl=N` makes the active Meta Reflex card level-aware at N,
 *  so the reserved badge slot can be compared against a level-independent card. */
function probeMetaReflexState() {
  const level = Number(new URLSearchParams(window.location.search).get("mrlvl") ?? "");
  if (!level) return metaReflexState(0);
  const cards = metaReflexCards();
  cards[0] = metaReflexLevelAwareCard(level) as (typeof cards)[number];
  return metaReflexState(0, {
    challenges: { prompt: "Meta Reflex", challenge_count: 5, challenges: cards },
  });
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
    payload.segment_state = probeMetaReflexState();
  } else if (state === "orderforge") {
    payload.question = null;
    payload.segment = orderForgeSegmentMeta();
    payload.segment_state = orderForgeProbeState();
  } else if (state === "reconstruct") {
    payload.question = null;
    payload.segment = reconstructSegmentMeta();
    payload.segment_state = reconstructProbeState();
  } else if (state === "masteryRecall" || state === "masteryCompare" || state === "masteryStat") {
    const seg = masterySegment(state === "masteryRecall" ? "recall"
      : state === "masteryStat" ? "stat" : "compare");
    payload.question = null;
    payload.segment = seg.meta;
    payload.segment_state = seg.state;
  } else {
    payload.question = questionFor(state);
  }
  // VISCONT1 — `?ruleset=`: the Daily stage ruleset block, as the backend
  // publishes it on the round (a fresh stage: nothing settled, no strikes).
  if (probe.ruleset) {
    payload.ruleset = { ruleset_id: probe.ruleset,
      max_strikes: probe.ruleset === "survival" ? 3 : null, strikes: 0,
      questions_settled: 0, stage_ended: false, live_strikes: 0 };
  }
  if (probe.mrStep !== null) return applyStatCheckLive(env, probe.mrStep);
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
    // VISCONT1 — a `?seq=` round is DISCLOSED on settlement: the correct
    // tablet lights and the evidence line mounts under the grid, which is the
    // reveal state the continuity certification has to hold still through.
    ...(probe.seq.length > 0 ? {
      correct_option_index: 0,
      question_explanation: {
        // `?evlen=N` (VISCONT1): an evidence statement of N characters — 96 is
        // the longest the concise-evidence beat will carry.
        scenario_note: probe.evlen > 0
          ? exactText(PROMPT_WORDS, probe.evlen, 3, ".")
          : "The first option is correct for this probe round.",
      },
    } : {}),
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
  /**
   * RFX1 2B2 — `?entry=fresh&lead=<ms>`: model a COLD ENTRY.
   *
   * The canned envelopes carry a fixed 2026-07-18 clock, which is fine for
   * every state that is about layout and wrong for every state that is about
   * TIME: a round whose `started_at` is years in the past is answerable on
   * the first render, so the entry presentation the server's lead-in exists
   * for can never be seen here. With a lead, the probe stamps `server_time`
   * to the real clock and puts round 1's start `lead` ms ahead of the FIRST
   * envelope it serves — the anchor is taken once, exactly as the backend
   * writes `started_at` once inside the creation transaction, so repeated
   * reads never move it.
   */
  entryFresh: boolean;
  leadMs: number;
  leadAnchorMs: number | null;
  /** SFX1.5 browser-only live transition step; zero outside `?sfx=1`. */
  sfxStep: number;
  /** VISCONT1 — `?seq=` per-round probe states, and `?broken=1`. */
  seq: string[];
  broken: boolean;
  /** VISCONT1 — `?ruleset=` Daily stage ruleset, `?host=daily`. */
  ruleset: string | null;
  evlen: number;
  /** SCBS1 — `?mrlive=1`: the Stat Check script step, or null outside it. */
  mrStep: number | null;
} = { state: "opts4", role: "top", legacy: false, points: null, questionRoles: [], motif: null, pet: null,
  opponentRole: null, progressionOff: false, end: null, gaps: [], bot: false, rated: true,
  discoveries: true, entryFresh: false, leadMs: 0, leadAnchorMs: null, sfxStep: 0,
  seq: [], broken: false, ruleset: null, evlen: 0, mrStep: null };

/** Stamp a live clock and a future round-1 start onto a canned envelope. */
function applyEntryLead<T extends { payload: Record<string, unknown>; server_time?: string }>(
  env: T,
): T {
  if (probe.leadMs <= 0) return env;
  if (probe.leadAnchorMs === null) probe.leadAnchorMs = Date.now() + probe.leadMs;
  const startedAt = probe.leadAnchorMs;
  env.server_time = new Date().toISOString();
  env.payload.server_time = env.server_time;
  const active = env.payload.active_round as Record<string, unknown> | null | undefined;
  if (active) {
    active.started_at = new Date(startedAt).toISOString();
    const duration = Number(active.duration_seconds ?? 30) * 1000;
    active.active_deadline = new Date(startedAt + duration).toISOString();
  }
  return env;
}

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

/** VISCONT1 — the host `?host=daily` mounts the match under. */
const DAILY_PROBE_HOST = {
  eyebrow: "Daily Challenge",
  settlingMessage: "Stage complete…",
  onMatchSettled: () => {},
};

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
    // OF4-CONTINUITY — `?forge=bot` replays the real bot-lock lifecycle.
    if (isForgeBotReplay()) {
      const replayed = await forgeBotReplay(path, init);
      if (replayed) return replayed;
    }
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
          public: applyEntryLead(publicFor(probe.state, probe.role)),
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
    // SFX1.5 — keep the visual-QA bench on the real challenge-ack contract so
    // a Meta Reflex click reaches the same accepted-command boundary as live
    // Ranked. The next public snapshot deliberately remains unchanged; this
    // probe verifies interaction/audio/layout, not a second match engine.
    const challenge = /\/segments\/(\d+)\/challenges\/(\d+)$/.exec(path);
    if (challenge && (init?.method ?? "GET") === "POST") {
      const segment = Number(challenge[1]);
      const index = Number(challenge[2]);
      return json({
        status: "accepted", match_id: "m1", segment_number: segment,
        challenge_index: index, idempotent: false, conflicting: false,
        segment_resolved: false, next_challenge_index: index + 1,
      });
    }
    // RMOB2 — a settled module of a points state, so the resume backfill (the
    // real controller path) fills the recent-result history. Deterministic:
    // the viewer takes every module but each third, the opponent every other.
    const resolved = /\/rounds\/(\d+)\/resolved$/.exec(path);
    // SCBS1 — the Stat Check script: the block (round 4) has settled once the
    // script is on its last step; every earlier round is an ordinary quiz.
    if (resolved && probe.mrStep !== null) {
      const round = Number(resolved[1]);
      const settledThrough = probe.mrStep >= STAT_CHECK_LIVE_LAST_STEP ? 4 : 2;
      if (round > settledThrough) return new Response("{}", { status: 409 });
      return json({ schema_version: "ranked_duel.resolved_round.v2",
        projection_type: "resolved_round", match_id: "m1", round_number: round,
        server_time: "2026-07-18T12:00:00+00:00",
        payload: round === 4 ? statCheckLiveSettled() : resolvedFor(round) });
    }
    if (resolved && ((probe.points && Number(resolved[1]) < probe.points.module)
      || (probe.sfxStep >= 2 && Number(resolved[1]) < probe.sfxStep))) {
      const round = Number(resolved[1]);
      return json({ schema_version: "ranked_duel.resolved_round.v2",
        projection_type: "resolved_round", match_id: "m1", round_number: round,
        server_time: "2026-07-18T12:00:00+00:00", payload: resolvedFor(round) });
    }
    if (path.endsWith("/private")) return json(privateFor(probe.state));
    if (path.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (/\/matches\/m1$/.test(path)) return json(applyEntryLead(publicFor(probe.state, probe.role)));
    return json({});
  }) as typeof window.fetch;
}

installInterceptor();

export default function RankedShellProbe() {
  const [params, setParams] = useSearchParams();
  const [sfxStep, setSfxStep] = useState(0);
  const [mrStep, setMrStep] = useState(0);
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
  const sfxQa = params.get("sfx") === "1";
  /**
   * RFX1 2B3 visual implementation — STATIC PREVIEW of the two beats that
   * need a live round transition to appear on their own.
   *
   * `?beat=final` and `?beat=outro` mount the REAL components with real-shaped
   * payloads so the composition can be reviewed and screenshotted. It is a
   * preview, not a simulation: the beats' timing, their replay protection and
   * their substitution for the module title are owned by the arena and are
   * covered by `QuizRankedMatch.rfx1b3.test.tsx`, not by this.
   */
  const beatPreview = params.get("beat");
  const forgeBot = state === "orderforge" && params.get("forge") === "bot";
  probe.sfxStep = sfxQa ? sfxStep : 0;
  probe.mrStep = params.get("mrlive") === "1" ? mrStep : null;
  probe.seq = (params.get("seq") ?? "").split(",")
    .filter((s) => (PROBE_STATES as readonly string[]).includes(s) || SEQ_ENTRY.test(s));
  probe.broken = params.get("broken") === "1";
  const ruleset = params.get("ruleset");
  probe.ruleset = ruleset && ["time_trial", "survival", "standard"].includes(ruleset) ? ruleset : null;
  const dailyHost = params.get("host") === "daily";
  probe.evlen = Math.min(96, Number(params.get("evlen") ?? 0) || 0);
  // VISCONT1-SSM — `?lol=1`: the League section's root theme, as the real
  // Ranked and Daily routes (`/quiz/*`) wear it. `Layout` puts `theme-lol` on
  // <html> by PATH, and `.theme-lol h2` draws the prompt in Cinzel; this dev
  // path is outside the section, so without it the prompt is measured in the
  // body face (Inter), which is far narrower than what a player sees. A
  // passive effect, so it lands after `Layout`'s layout-timed class write.
  const lolTheme = params.get("lol") === "1";
  useEffect(() => {
    if (!lolTheme) return;
    const root = document.documentElement;
    root.classList.add("theme-lol");
    return () => root.classList.remove("theme-lol");
  }, [lolTheme]);
  probe.end = sfxQa && sfxStep >= 5 ? "victory"
    : end === "victory" || end === "defeat" || end === "draw" ? end : null;
  probe.gaps = (params.get("gap") ?? "").split(",").map(Number).filter((n) => n > 0);
  probe.bot = params.get("bot") === "1";
  probe.rated = params.get("rating") !== "0";
  probe.discoveries = params.get("disc") !== "0";
  const viewerName = params.get("name");
  const pet = params.get("pet");
  probe.pet = pet && ["scorchclaw", "mosstomper", "gustwalker"].includes(pet) ? pet : null;
  // RFX1 2B2 — the cold-entry model. `lead` is reset with the mount key below,
  // so switching probe states re-anchors rather than replaying a spent lead.
  probe.entryFresh = params.get("entry") === "fresh";
  const lead = Number(params.get("lead") ?? "");
  if (lead !== probe.leadMs) probe.leadAnchorMs = null;
  probe.leadMs = Number.isFinite(lead) && lead > 0 ? lead : 0;
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
      {sfxQa && sfxStep < 5 ? (
        <button type="button" data-testid="probe-sfx-advance"
          className="pointer-events-auto fixed right-2 top-24 z-[61] rounded bg-cyan-700 px-3 py-2 text-xs text-white"
          onClick={() => setSfxStep((step) => Math.min(5, step + 1))}>
          Advance SFX fixture ({sfxStep}/5)
        </button>
      ) : null}
      {probe.mrStep !== null && probe.mrStep < STAT_CHECK_LIVE_LAST_STEP ? (
        <button type="button" data-testid="probe-mr-advance"
          className="pointer-events-auto fixed right-2 top-24 z-[61] rounded bg-cyan-700 px-3 py-2 text-xs text-white"
          onClick={() => setMrStep((step) => Math.min(STAT_CHECK_LIVE_LAST_STEP, step + 1))}>
          Advance Stat Check ({mrStep}/{STAT_CHECK_LIVE_LAST_STEP})
        </button>
      ) : null}
      {beatPreview === "meta" && (
        <div className="pointer-events-none fixed inset-0 z-[70]"
          data-testid="probe-beat-preview">
          {/* The element cannot be driven through the probe's own fixtures —
              it needs a contract-valid `segment_state` the overlay cannot
              fabricate — so this mounts it directly. To hold it still for a
              screenshot, pause its animations from the browser rather than
              from here: the probe declares no layout and no styling of its
              own, which its own test enforces. */}
          <MetaReflexSting variant="beat" durationMs={1800} cardCount={5}
            reducedMotion={params.get("rm") === "1"} />
        </div>
      )}
      {beatPreview === "final" && (
        <div className="pointer-events-none fixed inset-0 z-[70]"
          data-testid="probe-beat-preview">
          <RankedFinalRoundWarning id="preview" visibleMs={1300}
            viewerScore={24} opponentScore={22}
            reducedMotion={params.get("rm") === "1"} />
        </div>
      )}
      {beatPreview === "outro" && (
        <div className="pointer-events-none fixed inset-0 z-[70]"
          data-testid="probe-beat-preview">
          <RankedMatchOutro reducedMotion={params.get("rm") === "1"} outro={{
            id: "m1:outro", matchId: "m1",
            result: (params.get("end") === "defeat" ? "loss"
              : params.get("end") === "draw" ? "draw" : "win"),
            terminalReason: params.get("forfeit") === "1" ? "forfeit" : "combat",
            viewerScore: 24, opponentScore: 15,
            viewerLabel: viewerName ?? "You", opponentLabel: "Opponent",
            viewerRole: role ?? "mid", opponentRole: orole ?? "top",
            finalRoundNumber: 10, ratingDelta: 18,
          }} />
        </div>
      )}
      {params.get("frame") === "0" || dailyHost ? (
        <QuizRankedMatch key={`${state}:${params.get("points") ?? "hp"}:${params.get("qroles") ?? ""}:${params.toString()}`}
          matchId={forgeBot ? FORGE_BOT_MATCH_ID : "m1"} viewerUserId={forgeBot ? FORGE_BOT_VIEWER : VIEWER} viewerDisplayName={viewerName}
          entry={probe.entryFresh ? "fresh" : "recovered"}
          // VISCONT1 — `?host=daily`: hosted exactly as `DailyRunPage` hosts
          // a stage (its own eyebrow and settling copy, no settlement action
          // here because this route has no run to hand back to).
          host={dailyHost ? DAILY_PROBE_HOST : undefined}
          chrome={<RankedRouteHeader size="wide" />} />
      ) : (
        <Frame size="wide">
          <QuizRankedMatch key={`${state}:${params.get("points") ?? "hp"}:${params.get("qroles") ?? ""}:${params.toString()}`}
            matchId={forgeBot ? FORGE_BOT_MATCH_ID : "m1"} viewerUserId={forgeBot ? FORGE_BOT_VIEWER : VIEWER} viewerDisplayName={viewerName}
            entry={probe.entryFresh ? "fresh" : "recovered"} />
        </Frame>
      )}
    </div>
  );
}
