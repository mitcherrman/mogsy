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
 *   stressA | stressB | metareflex | junglePet | junglePetBase | jungleRule
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
  metaReflexSegmentMeta, metaReflexState, modulePointsBlock, privatePlayerV2, publicRoundV2,
  withPointsScoring,
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

function questionFor(state: ProbeState) {
  const question = baseQuestionFor(state) as Record<string, unknown>;
  if (probe.questionRoles.length === 0) return question;
  return { ...question, topic: {
    category: "abilities", tier: "hard",
    icon_hint: { kind: "category", key: String(question.category ?? ""), icon: null },
    roles: probe.questionRoles,
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
  /** JPM1 — `?pet=` companion for the jungle pet states. */
  pet: string | null;
  /** RMOB2 — `?orole=` opponent role; `?progression=0` live R1 shape. */
  opponentRole: string | null;
  progressionOff: boolean;
} = { state: "opts4", role: "top", legacy: false, points: null, questionRoles: [], pet: null,
  opponentRole: null, progressionOff: false };

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
  const orole = params.get("orole");
  probe.opponentRole = orole && orole !== "none" ? orole : null;
  probe.progressionOff = params.get("progression") === "0";
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
        <QuizRankedMatch key={`${state}:${params.get("points") ?? "hp"}:${params.get("qroles") ?? ""}`}
          matchId="m1" viewerUserId={VIEWER} viewerDisplayName={viewerName}
          chrome={<RankedRouteHeader size="wide" />} />
      ) : (
        <Frame size="wide">
          <QuizRankedMatch key={`${state}:${params.get("points") ?? "hp"}:${params.get("qroles") ?? ""}`}
            matchId="m1" viewerUserId={VIEWER} viewerDisplayName={viewerName} />
        </Frame>
      )}
    </div>
  );
}
