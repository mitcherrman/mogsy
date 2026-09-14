/**
 * POINT1 — WHICH VOCABULARY THE RESULT PLATES SPEAK, AND WHO DECIDES.
 *
 * POINT1 made the header's damage clauses unreachable under a points match.
 * The risk that creates is not in either branch — it is in the DISCRIMINATOR:
 * a guard wired to the wrong signal would either leak damage back into an
 * active points module or, far worse, silently retire the legacy hp
 * presentation the product deliberately preserves.
 *
 * So these fix the discriminator by counter-example. Every test below settles
 * the SAME round, with the SAME damage figures, the SAME cumulative scores and
 * the SAME module, and changes exactly ONE thing: the backend's own
 * `scoring.model`. If any other signal could flip the vocabulary, the matching
 * pair here would disagree.
 *
 * THE AUTHORITY CHAIN, end to end:
 *
 *   backend payload `scoring.model`
 *     -> `readScoring` (contracts) — rejects any value but "points"/"hp"
 *     -> `PublicRoundView.scoring` (null when the backend published no block)
 *     -> `matchScoringModel` — `?? "hp"`, the pre-RP1 default
 *     -> `isPointsMatch`
 *     -> `QuizRankedMatch` `pointsMatch`
 *     -> `ArenaViewModel.roundBeat.pointsMatch` / `segmentBeat.pointsMatch`
 *     -> `RoundResultBeat` / `SegmentResultBeat`
 *     -> `resultConsequence` / `segmentScoreline`
 *
 * Not one link in that chain consults a score, a damage field, a module id or
 * the presence of points feedback. `rankedViews.points.test` pins the top of
 * it; these pin that the PLATES consume it and nothing else.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import {
  metaReflexResolvedPayload, metaReflexSegmentMeta, metaReflexState,
  privatePlayerV2, publicRoundV2, withPointsScoring,
} from "@/lib/ranked-public/fixtures";

const T = "2026-07-18T12:00:00+00:00";

interface Backend {
  /** The ONLY thing any pair of tests below varies. */
  model: "points" | "hp" | null;
  activeRound: number;
  resolved: Record<number, unknown>;
  /** Present on every match, points or hp — the counter-example signal. */
  withModulePoints: boolean;
  segmentState: unknown;
}
let backend: Backend;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});

/**
 * A settled round with REAL damage figures on both sides.
 *
 * Identical in every scenario. On an hp match these are the mechanic; on a
 * points match they are the award travelling through the engine's damage
 * channel. The plate must tell those apart from the scoring block alone — it
 * cannot tell them apart from these numbers, which is the whole point.
 */
function resolvedPayload(round: number) {
  const player = (id: string, dealt: number, received: number) => ({
    player_id: id, class_id: id === "userA" ? "tank" : "mage",
    outcome: dealt > 0 ? "correct" : "incorrect",
    submitted_at: T, answered_first: id === "userA",
    timed_out: false, selected_ability_id: null,
    damage: {
      base_damage_dealt: dealt, outgoing_bonus: 0, final_damage_dealt: dealt,
      shield_absorbed: 0, incoming_reduction: 0, final_damage_received: received,
    },
    hp_before: 170, hp_after: 170 - received, reached_zero_hp: false,
    xp_gained: 0, total_xp_after: 0, level_before: 1, level_after: 1,
    level_up_events: [], charge_consumed: false, consumed_ability_id: null,
    remaining_charges: {},
    carryover: { effects_gained: [], effects_consumed: [], consecutive_correct: 1 },
    combat_lab_unlock_delta_seconds: 0,
  });
  const payload: Record<string, unknown> = {
    match_id: "m1", round_number: round, question_id: "q1",
    end_reason: "both_answered", started_at: T, original_deadline: T,
    final_deadline: T, pressure_applied: false,
    players: [player("userA", 2, 3), player("userB", 3, 2)],
    next_round_duration_seconds: 30, next_round_duration_delta: 0,
    match_over: false, winner_id: null, completion_reason: null,
  };
  if (backend.withModulePoints) {
    payload.module_points = {
      userA: { base_points: 2, speed_bonus_points: 1, points_awarded: 3,
        score_before: 9, score_after: 12 },
      userB: { base_points: 0, speed_bonus_points: 0, points_awarded: 0,
        score_before: 6, score_after: 6 },
    };
  }
  return payload;
}

function shape<T extends { payload: Record<string, unknown> }>(env: T): T {
  env.payload.progression_enabled = false;
  for (const p of env.payload.players as Record<string, unknown>[]) p.role = "top";
  (env.payload.active_round as Record<string, unknown>).round_number = backend.activeRound;
  if (backend.segmentState !== undefined) {
    env.payload.segment = backend.segmentState === null
      ? { module_id: "quiz", module_version: 1, challenge_count: 1, challenge_index: 0 }
      : metaReflexSegmentMeta();
    env.payload.segment_state = backend.segmentState;
  }
  if (backend.model === null) return env;          // pre-RP1: no block at all
  if (backend.model === "hp") {
    // A `score` on every player, which a points match also has — so the plate
    // cannot be reading THAT either. The block still says hp.
    env.payload.players = (env.payload.players as Record<string, unknown>[])
      .map((p) => ({ ...p, score: 12 }));
    env.payload.scoring = { model: "hp", match_length: null,
      module_number: backend.activeRound, modules_completed: 0 };
    return env;
  }
  return withPointsScoring(env, {
    moduleNumber: backend.activeRound, matchLength: 10, modulesCompleted: 0,
    scores: { userA: 12, userB: 6 },
  }) as T;
}

beforeEach(() => {
  backend = {
    model: "points", activeRound: 1, resolved: {},
    withModulePoints: true, segmentState: undefined,
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: backend.activeRound, server_time: T,
        payload: {
          match_status: "active", match_over: false, progression_enabled: false,
          public: shape(publicRoundV2()), private: shape(privatePlayerV2("userA")),
          progression_pending_players: [], latest_resolved_round: null, result: null,
        },
      });
    }
    if (u.endsWith("/private")) return json(shape(privatePlayerV2("userA")));
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    const resolved = /\/rounds\/(\d+)\/resolved$/.exec(u);
    if (resolved) {
      const payload = backend.resolved[Number(resolved[1])];
      if (!payload) return json({ detail: "not ready" }, 404);
      return json({
        schema_version: "ranked_duel.resolved_round.v2", projection_type: "resolved_round",
        match_id: "m1", round_number: Number(resolved[1]), server_time: T, payload });
    }
    if (/\/matches\/m1$/.test(u)) return json(shape(publicRoundV2()));
    return json({});
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); });

async function mount() {
  const view = render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
  await screen.findByTestId("ranked-match");
  return view;
}

function settle() {
  backend.resolved[backend.activeRound] = resolvedPayload(backend.activeRound);
  backend.activeRound += 1;
}

/** The plate's quiet line — the one POINT1 changed. */
async function consequence() {
  await screen.findByTestId("ranked-last-result", {}, { timeout: 6000 });
  return (screen.getByTestId("ranked-last-result-consequence").textContent ?? "");
}

const DAMAGE_WORDS = ["DAMAGE", "DEALT", "TAKEN", "ABSORBED", "DMG"];

// --------------------------------------------------------------- points side

describe("an ACTIVE points match states points, never damage", () => {
  it("shows the award and no damage clause on a standard module", async () => {
    await mount();
    settle();
    await waitFor(async () => expect(await consequence()).toContain("FIRST +1"),
      { timeout: 6000 });
    // The loud line carries the base award; the quiet line carries the bonus.
    expect(screen.getByTestId("ranked-last-result-verdict"))
      .toHaveTextContent("CORRECT +2");
    const text = (screen.getByTestId("ranked-last-result").textContent ?? "")
      .toUpperCase();
    for (const w of DAMAGE_WORDS) expect(text).not.toContain(w);
  }, 15000);

  /**
   * THE FALLBACK THAT USED TO LEAK. `feedback` alone was the guard and it is
   * projected per settlement, so a points settlement that published no
   * `module_points` dropped straight onto "2 DEALT · 3 TAKEN".
   */
  it("states NOTHING rather than damage when the backend banked no award",
    async () => {
      backend.withModulePoints = false;
      await mount();
      settle();
      await waitFor(async () => {
        const text = (await screen.findByTestId("ranked-last-result", {},
          { timeout: 6000 })).textContent ?? "";
        for (const w of DAMAGE_WORDS) {
          expect(text.toUpperCase()).not.toContain(w);
        }
      }, { timeout: 6000 });
      expect(await consequence()).toBe("");
    }, 15000);

  /**
   * THE DECAY. The plate persists after its ~1.5s reveal hold as the
   * previous-module summary; its award used to expire with the hold and drop
   * it back onto the damage clauses for the whole of the next module.
   */
  it("keeps stating points long after the reveal hold has lifted", async () => {
    await mount();
    settle();
    await waitFor(async () => expect(await consequence()).toContain("FIRST +1"),
      { timeout: 6000 });
    await waitFor(() => expect(screen.getByTestId("ranked-match"))
      .toHaveAttribute("data-reveal-hold", "false"), { timeout: 6000 });
    const text = (screen.getByTestId("ranked-last-result").textContent ?? "")
      .toUpperCase();
    for (const w of DAMAGE_WORDS) expect(text).not.toContain(w);
    expect(screen.getByTestId("ranked-last-result-verdict"))
      .toHaveTextContent("CORRECT +2");
  }, 15000);
});

// ------------------------------------------------------------------- hp side

describe("a LEGACY hp match keeps its damage presentation, unchanged", () => {
  /**
   * THE THING POINT1 MUST NOT HAVE DONE. Damage vocabulary is retired from
   * ACTIVE POINTS MODES; the hp machinery is preserved as legacy and future
   * capability. Same round, same figures, same `score` fields on the players —
   * only `scoring.model` differs from the points case above.
   */
  it("still says DEALT and TAKEN on a settled hp round", async () => {
    backend.model = "hp";
    backend.withModulePoints = false;
    await mount();
    settle();
    await waitFor(async () => expect(await consequence()).toBe("2 DEALT · 3 TAKEN"),
      { timeout: 6000 });
  }, 15000);

  it("still says DEALT and TAKEN when the backend published NO scoring block",
    async () => {
      // Pre-RP1 backend. `matchScoringModel` answers "hp" without guessing.
      backend.model = null;
      backend.withModulePoints = false;
      await mount();
      settle();
      await waitFor(async () => expect(await consequence()).toBe("2 DEALT · 3 TAKEN"),
        { timeout: 6000 });
    }, 15000);

  /**
   * The counter-example that matters most: an hp match whose settlement
   * happens to carry `module_points`. If the guard read the award instead of
   * the model, this would silently lose its damage line.
   */
  it("keeps damage even if a settlement carries an award block", async () => {
    backend.model = "hp";
    backend.withModulePoints = true;
    await mount();
    settle();
    // The award still replaces the clause when one is genuinely present —
    // that is RP1's rule and POINT1 did not touch it — but the match is still
    // an hp match, which is what `data-mode` and the rails go on saying.
    await screen.findByTestId("ranked-last-result", {}, { timeout: 6000 });
    // The rails are the tell: an hp match's duelists still draw HP meters, so
    // nothing about this match has been quietly reclassified as points.
    expect(screen.getByTestId("hp-userA")).toBeInTheDocument();
    expect(screen.getByTestId("hp-userB")).toBeInTheDocument();
  }, 15000);
});

// ------------------------------------------------ Meta Reflex, both vocabularies

describe("the block plate follows the same authority", () => {
  it("drops the DMG clause on a points block", async () => {
    backend.segmentState = metaReflexState(0);
    await mount();
    backend.resolved[1] = metaReflexResolvedPayload({ round_number: 1 });
    backend.segmentState = null;
    backend.activeRound = 2;
    const beat = await screen.findByTestId("ranked-last-result", {},
      { timeout: 6000 });
    expect(beat).toHaveAttribute("data-mode", "segment");
    expect(beat).toHaveTextContent("YOU 4/5");
    expect((beat.textContent ?? "").toUpperCase()).not.toContain("DMG");
  }, 15000);

  it("KEEPS the DMG clause on an hp block", async () => {
    backend.model = "hp";
    backend.segmentState = metaReflexState(0);
    await mount();
    backend.resolved[1] = metaReflexResolvedPayload({ round_number: 1 });
    backend.segmentState = null;
    backend.activeRound = 2;
    const beat = await screen.findByTestId("ranked-last-result", {},
      { timeout: 6000 });
    expect(beat).toHaveAttribute("data-mode", "segment");
    expect(beat).toHaveTextContent("YOU 4/5");
    expect(beat).toHaveTextContent("6 DMG");
  }, 15000);
});
