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
 *   short | long | opts2 | opts4 | media | metareflex
 * `?role=` freezes a League role onto the viewer's participant.
 *
 * Dev route only — excluded from navigation and the sitemap.
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Frame } from "@/pages/quiz-ranked/QuizRankedPage";
import { QuizRankedMatch } from "@/pages/quiz-ranked/QuizRankedMatch";
import {
  metaReflexSegmentMeta, metaReflexState, privatePlayerV2, publicRoundV2,
} from "@/lib/ranked-public/fixtures";
import {
  CHAMPION_OPTION_QUESTION, ITEM_OPTION_QUESTION,
} from "@/lib/ranked-core/adapters/optionMediaFixtures";
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
  "short", "opts2", "opts4", "realP99", "realMax", "stress", "media", "metareflex",
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

const STRESS_OPTIONS = [
  "Group mid and force the Baron immediately, using the Herald to break the mid inhibitor turret before the death timer expires",
  "Rotate the whole team bottom to take the Drake, conceding mid-lane pressure and the Herald charge for the next two minutes",
  "Split the map: send the top laner to side-lane pressure while the remaining four set deep vision around the Baron pit",
  "Reset as a team, buy completed items with the accumulated gold, and re-approach the Baron with a full item advantage",
];

function questionFor(state: ProbeState) {
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
    default:
      return CHAMPION_OPTION_QUESTION;
  }
}

/** The public-round envelope this probe serves, for one probe state. */
function publicFor(state: ProbeState, role: string | null) {
  const env = publicRoundV2() as ReturnType<typeof publicRoundV2>
    & { payload: Record<string, unknown> };
  const payload = env.payload as Record<string, unknown>;
  // R1: freeze a role onto the viewer's seat and leave the opponent's null —
  // exactly the shape an admin bot match produces.
  const players = (payload.players as Record<string, unknown>[]).map((p, i) => ({
    ...p, role: i === 0 ? role : null,
  }));
  payload.players = players;
  // R1 matches carry no progression layer, which is what puts the arena in
  // role vocabulary rather than legacy-class vocabulary. `?legacy=1` serves
  // the FLAG-OFF shape instead: both roles null, legacy thresholds — which is
  // what a deployment with RANKED_ROLE_IDENTITY_ENABLED unset actually writes.
  if (!probe.legacy) {
    payload.level_thresholds = [0];
    payload.max_level = 1;
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
  return env;
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
  return env;
}

/** Mutable, so switching probe state re-serves without a reload. */
const probe: { state: ProbeState; role: string | null; legacy: boolean } =
  { state: "opts4", role: "top", legacy: false };

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
            onClick={() => { setParams({ q: s, role: role ?? "top" }); force((n) => n + 1); }}>
            {s}
          </button>
        ))}
      </div>
      <Frame size="wide">
        <QuizRankedMatch key={state} matchId="m1" viewerUserId={VIEWER} />
      </Frame>
    </div>
  );
}
