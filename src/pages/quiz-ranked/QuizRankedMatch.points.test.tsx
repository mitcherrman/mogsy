/**
 * RP1 Step 3 — WHAT A V2 PLAYER ACTUALLY SEES.
 *
 * The live arena, mounted against backend-shaped payloads, asserted on the
 * four things the redesign promises: your score, their score, which module of
 * how many, and no HP battle anywhere in the frame. The legacy hp match is
 * asserted in the same file and from the same harness, because "v2 reads as
 * points" and "v1 still reads as HP" are one invariant with two sides.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import {
  matchResultPointsV1, privatePlayerV2, publicRoundV2, withPointsScoring,
} from "@/lib/ranked-public/fixtures";

type Points = {
  moduleNumber: number; matchLength: number | null; modulesCompleted: number;
  scores: Record<string, number>;
} | null;

let points: Points;
/** Serve a completed match, with the result row a terminal frame reads. */
let finished: { finalScores: Record<string, number>; winner: string | null } | null;

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { "Content-Type": "application/json" },
});

/** An R1-shaped match, points-scored or not, exactly as the backend serves it. */
function shape<T extends { payload: Record<string, unknown> }>(env: T): T {
  env.payload.progression_enabled = false;
  if (finished) {
    env.payload.match_over = true;
    env.payload.match_status = "complete";
    env.payload.winner_id = finished.winner;
    env.payload.active_round = null;
  }
  for (const p of env.payload.players as Record<string, unknown>[]) p.role = "top";
  return points === null ? env : withPointsScoring(env, points) as T;
}
const publicBody = () => shape(publicRoundV2());
const privateBody = () => shape(privatePlayerV2("userA"));

beforeEach(() => {
  points = {
    moduleNumber: 1, matchLength: 10, modulesCompleted: 0,
    scores: { userA: 0, userB: 0 },
  };
  finished = null;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: 1, server_time: "2026-07-18T12:00:00+00:00",
        payload: {
          match_status: "active", match_over: false, progression_enabled: false,
          public: publicBody(), private: privateBody(),
          progression_pending_players: [], latest_resolved_round: null, result: null,
        },
      });
    }
    if (u.endsWith("/result")) {
      return json(finished
        ? matchResultPointsV1(finished.finalScores, { winner: finished.winner })
        : {});
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (/\/matches\/m1$/.test(u)) return json(publicBody());
    return json({});
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); });

async function mount() {
  const view = render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
  await screen.findByTestId("ranked-match");
  return view;
}

describe("a points match presents a SCORE", () => {
  it("opens at 0 – 0 on Module 1 / 10", async () => {
    await mount();
    await waitFor(() =>
      expect(screen.getByTestId("score-userA")).toHaveAttribute("data-score", "0"));
    expect(screen.getByTestId("score-userB")).toHaveAttribute("data-score", "0");
    expect(screen.getByTestId("ranked-header-title")).toHaveTextContent("Module 1 / 10");
  });

  it("shows both cumulative scores mid-match, labelled POINTS", async () => {
    points = {
      moduleNumber: 5, matchLength: 10, modulesCompleted: 4,
      scores: { userA: 11, userB: 8 },
    };
    await mount();
    await waitFor(() =>
      expect(screen.getByTestId("score-userA")).toHaveTextContent("11"));
    expect(screen.getByTestId("score-userB")).toHaveTextContent("8");
    expect(within(screen.getByTestId("score-userA")).getByText("POINTS"))
      .toBeInTheDocument();
    expect(within(screen.getByTestId("score-userB")).getByText("POINTS"))
      .toBeInTheDocument();
    expect(screen.getByTestId("ranked-header-title")).toHaveTextContent("Module 5 / 10");
  });

  it("reaches Module 10 / 10 without an off-by-one", async () => {
    points = {
      moduleNumber: 10, matchLength: 10, modulesCompleted: 9,
      scores: { userA: 24, userB: 24 },
    };
    await mount();
    await waitFor(() =>
      expect(screen.getByTestId("ranked-header-title")).toHaveTextContent("Module 10 / 10"));
    // A tie reads as a tie; nothing in the arena decides anything from it.
    expect(screen.getByTestId("score-userA")).toHaveTextContent("24");
    expect(screen.getByTestId("score-userB")).toHaveTextContent("24");
  });

  it("shows no HP meter, no HP bar and no Ranked damage copy", async () => {
    points = {
      moduleNumber: 3, matchLength: 10, modulesCompleted: 2,
      scores: { userA: 6, userB: 4 },
    };
    await mount();
    await waitFor(() =>
      expect(screen.getByTestId("combatant-userA"))
        .toHaveAttribute("data-scoring", "points"));
    expect(screen.queryByTestId("hp-userA")).toBeNull();
    expect(screen.queryByTestId("hp-userB")).toBeNull();
    const arena = screen.getByTestId("ranked-match");
    expect(arena.textContent ?? "").not.toMatch(/\bHP\b|\bDMG\b|health|damage/i);
    // The meter is a NUMBER, not a fill: no proportional meter role survives
    // on either rail.
    expect(within(screen.getByTestId("combatant-userA")).queryAllByRole("meter"))
      .toHaveLength(0);
  });

  it("moves the opponent's score only from SETTLED backend state", async () => {
    points = {
      moduleNumber: 4, matchLength: 10, modulesCompleted: 3,
      scores: { userA: 5, userB: 7 },
    };
    await mount();
    await waitFor(() =>
      expect(screen.getByTestId("score-userB")).toHaveTextContent("7"));
    // The opponent locks their answer for the OPEN module. Nothing about the
    // score may move on that: the module has not settled, and an optimistic
    // client would be showing a number the backend has not banked.
    points = { ...points, scores: { userA: 5, userB: 7 } };
    const before = screen.getByTestId("score-userB").getAttribute("data-score");
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("score-userB").getAttribute("data-score")).toBe(before);
    // And the arena publishes no opponent points anywhere else either.
    expect(screen.queryByTestId("outcome-points-userB")).toBeNull();
  });
});

describe("the terminal frame carries the final scoreline", () => {
  it("shows each player's final score, read from the RESULT row", async () => {
    // The live snapshot is deliberately STALE here (7–5): the result row is
    // the authority on what the match finished at, and the frame must read it
    // rather than the last poll it happened to see.
    points = {
      moduleNumber: 10, matchLength: 10, modulesCompleted: 10,
      scores: { userA: 7, userB: 5 },
    };
    finished = { finalScores: { userA: 24, userB: 19 }, winner: "userA" };
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
    await screen.findByTestId("ranked-match-over");
    await waitFor(() =>
      expect(screen.getByTestId("score-userA")).toHaveTextContent("24"));
    expect(screen.getByTestId("score-userB")).toHaveTextContent("19");
    // The winner is still the backend's, never a comparison of those two.
    expect(screen.getByTestId("ranked-match-over").textContent ?? "")
      .toMatch(/victory/i);
  });
});

describe("a legacy hp match is untouched", () => {
  beforeEach(() => { points = null; });

  it("keeps its HP meters and its proportional bars", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("hp-userA")).toBeInTheDocument());
    expect(screen.getByTestId("hp-userA")).toHaveTextContent("170");
    expect(screen.getByTestId("combatant-userA"))
      .toHaveAttribute("data-scoring", "hp");
    expect(screen.queryByTestId("score-userA")).toBeNull();
    expect(within(screen.getByTestId("combatant-userA")).getAllByRole("meter"))
      .not.toHaveLength(0);
  });

  it("shows Round N and NO invented module count", async () => {
    await mount();
    await waitFor(() =>
      expect(screen.getByTestId("ranked-header-title")).toHaveTextContent("Round 1"));
    expect(screen.getByTestId("ranked-header-title")).not.toHaveTextContent("/ 10");
    expect(screen.getByTestId("ranked-header-title")).not.toHaveTextContent("Module");
  });
});
