/**
 * MISC-W2C (F04) — newly earned question cards on a Daily result.
 *
 * The rules under test: the read names the match of the stage the result is
 * ABOUT (never the run's current stage), waits for the settle, and is made once;
 * the cards are exactly what the server's discoveries payload names — taken
 * from a response produced by the real backend projection — and appear only
 * after the score has landed; anything short of "earned" (nothing found, guest,
 * anonymous, missing, still settling, transport failure, garbage) renders
 * nothing and never touches the Continue action; the cue plays once under the
 * Ranked event id (StrictMode, re-render, poll, stage switch); and a host that
 * gives no way into REVIEW gets neither the panel nor the request.
 */
import { StrictMode } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const play = vi.fn();
const SFX_API = { play, stop: vi.fn(), preload: vi.fn() };
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => SFX_API }));
let reduced = false;
vi.mock("@/hooks/useReducedMotionPreference", () => ({
  useReducedMotionPreference: () => reduced,
  readReducedMotionPreference: () => reduced,
  APP_REDUCE_MOTION_CLASS: "reduce-motion",
}));
vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import backend from "@/lib/ranked-public/__fixtures__/dailyMatchDiscoveries.backend.json";
import { discoverySoundEventId } from "@/components/ranked-arena/DiscoveryReveal";
import { V5_ELIGIBLE_DAY, fixtureV5Run, wireResult } from "@/lib/daily-challenge/run/fixtures";
import { FOUR_STAGE_DAY, fixtureRun } from "@/lib/daily-challenge/run/fixtures";
import { DAILY_DISCOVERY_HOLD_MS, DailyDiscoveries, stageCanDiscover } from "./DailyDiscoveries";
import { DailyMainResult } from "./DailyMainResult";
import { DailyStageResult } from "./DailyStageResult";

const EARNED_ID = backend.earned.match_id;
const NONE_ID = backend.none.match_id;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});

type Responder = (matchId: string) => Response | Promise<Response>;
let respond: Responder;
let calls: string[];

const bodyFor = (matchId: string) => (matchId === NONE_ID ? backend.none : {
  ...backend.earned, match_id: matchId,
  payload: { ...backend.earned.payload, match_id: matchId },
});

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval",
      "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"],
  });
  play.mockClear();
  reduced = false;
  calls = [];
  respond = (id) => json(bodyFor(id));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const m = /\/api\/ranked\/matches\/([^/]+)\/discoveries$/.exec(String(url));
    if (!m) throw new Error(`unexpected request ${url}`);
    calls.push(decodeURIComponent(m[1]));
    return respond(decodeURIComponent(m[1]));
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const MAIN_PAIR = { main_completed_at: "2026-10-17T09:30:00Z", main_score: 1234 };

/** A settled v5 run whose Standard stage ran as `matchId`; the run is now on stage 1. */
const settledRun = (matchId = EARNED_ID, score = 1234) => fixtureV5Run(V5_ELIGIBLE_DAY, {
  current_stage_index: 1, main_completed_at: "2026-10-17T09:30:00Z", main_score: score,
}, {
  0: { status: "completed", child_match_id: matchId,
    result: wireResult({ correct: 9, answered: 10, score: 16, misses: 1 }) },
  1: { status: "pending", child_match_id: "rkb_current_pointer_must_not_be_read" },
});
const pendingRun = (matchId = EARNED_ID) => fixtureV5Run(V5_ELIGIBLE_DAY, {},
  { 0: { status: "in_progress", child_match_id: matchId } });

async function flush(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
const panel = () => screen.queryByTestId("daily-discoveries");
const MAIN_HOLD = DAILY_DISCOVERY_HOLD_MS.mainResult;

function Main({ run, onReview = () => {} }: { run: ReturnType<typeof settledRun>; onReview?: () => void }) {
  return <DailyMainResult run={run} stage={run.stages[0]} onDone={() => {}}
    onProceed={() => {}} onReviewDiscoveries={onReview} />;
}

describe("the read", () => {
  it("is not made while the result is pending, and names the SETTLED stage's match once it is", async () => {
    const pending = pendingRun();
    const { rerender } = render(<Main run={pending} />);
    await flush(5000);
    expect(calls).toEqual([]);
    expect(panel()).toBeNull();

    rerender(<Main run={settledRun()} />);
    await flush(0);
    // The run's current stage (1) carries a different child; it is never read.
    expect(calls).toEqual([EARNED_ID]);
  });

  it("is made once across polls and re-renders", async () => {
    const { rerender } = render(<Main run={settledRun()} />);
    await flush(MAIN_HOLD + 500);
    for (let i = 0; i < 4; i++) {
      rerender(<Main run={settledRun()} />); // a poll's fresh run object
      await flush(250);
    }
    expect(calls).toEqual([EARNED_ID]);
  });

  it("repeats nothing after the first answer under StrictMode, and only ever asks about one match", async () => {
    const { rerender } = render(<StrictMode><Main run={settledRun()} /></StrictMode>);
    await flush(MAIN_HOLD + 500);
    const first = calls.length;
    for (let i = 0; i < 4; i++) {
      rerender(<StrictMode><Main run={settledRun()} /></StrictMode>);
      await flush(250);
    }
    expect(new Set(calls)).toEqual(new Set([EARNED_ID]));
    expect(calls.length).toBeLessThanOrEqual(first + 2); // dev double-invoke only; never one per poll
    expect(screen.getAllByTestId("discovery-entry")).toHaveLength(3);
  });

  it("is never made for a Review, which only replays what is already owned", async () => {
    expect(stageCanDiscover({ kind: "review" })).toBe(false);
    expect(stageCanDiscover({ kind: "standard" })).toBe(true);
    const run = fixtureV5Run(V5_ELIGIBLE_DAY, { current_stage_index: null, status: "completed" },
      { 4: { status: "completed", child_match_id: "rkb_review",
        result: wireResult({ correct: 1, answered: 1, score: 1, misses: 0 }) } });
    render(<DailyDiscoveries stage={run.stages[4]} settled holdMs={0} onReview={() => {}} />);
    await flush(2000);
    expect(calls).toEqual([]);
  });
});

describe("what is earned", () => {
  it("shows exactly the server's cards, after the score has landed, inside the main result", async () => {
    render(<Main run={settledRun()} />);
    await flush(MAIN_HOLD - 50);
    expect(panel()).toBeNull(); // the answer is in, the score is still on stage
    await flush(100);
    expect(panel()).not.toBeNull();
    expect(panel()).toHaveAttribute("data-match-id", EARNED_ID);

    const reveal = within(panel()!).getByTestId("discovery-reveal");
    expect(reveal).toHaveAttribute("data-new-count", "3");
    expect(within(reveal).getByTestId("discovery-headline"))
      .toHaveTextContent("3 new questions added to your collection");
    const cards = within(reveal).getAllByTestId("discovery-entry");
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent("What is Flash's base cooldown?");
    expect(cards[0]).toHaveTextContent("Summoner Spells");
    expect(cards[1]).toHaveTextContent("How much does a Long Sword cost?");
    // A retired question is still counted, never dropped.
    expect(cards[2]).toHaveAttribute("data-metadata", "unavailable");
    const growth = within(reveal).getByTestId("discovery-growth");
    expect(growth).toHaveAttribute("data-collection-before", "423");
    expect(growth).toHaveAttribute("data-collection-total", "426");
    // No answer anywhere in the panel.
    expect(panel()!.textContent).not.toMatch(/correct|answer is/i);
    // It sits between the snapshot and the optional panel.
    const order = Array.from(screen.getByTestId("daily-main-result").children)
      .map((el) => el.getAttribute("data-testid"));
    expect(order.indexOf("daily-discoveries")).toBe(order.indexOf("daily-main-result-snapshot-slot") + 1);
    expect(order.indexOf("daily-discoveries")).toBeLessThan(order.indexOf("daily-main-optional"));
  });

  it("opens by growing from zero height, never at full height", async () => {
    render(<Main run={settledRun()} />);
    await flush(MAIN_HOLD + 20);
    // First frame: mounted closed (the negative margin cancels the parent gap).
    expect(panel()).toHaveAttribute("data-expanded", "false");
    expect(panel()!.className).toContain("grid-rows-[0fr]");
    await flush(50);
    expect(panel()).toHaveAttribute("data-expanded", "true");
    expect(panel()!.className).toContain("grid-rows-[1fr]");
  });

  it("plays the discovery cue once, under Ranked's event id, with the first card", async () => {
    render(<StrictMode><Main run={settledRun()} /></StrictMode>);
    // In steps: React applies the effects of a timer-driven update when the
    // act scope closes, so the panel's own 180 ms cue timer starts after this.
    await flush(MAIN_HOLD + 50);
    await flush(1500);
    const cues = play.mock.calls.filter(([event]) => event === "ranked.discovery.reveal");
    expect(cues.length).toBeGreaterThanOrEqual(1);
    for (const [, opts] of cues) expect(opts).toEqual({ eventId: discoverySoundEventId(EARNED_ID) });
    // And nothing else replays it later.
    const before = cues.length;
    await flush(5000);
    expect(play.mock.calls.filter(([e]) => e === "ranked.discovery.reveal")).toHaveLength(before);
  });

  it("opens REVIEW from the panel's CTA", async () => {
    const onReview = vi.fn();
    render(<Main run={settledRun()} onReview={onReview} />);
    await flush(MAIN_HOLD + 1500);
    act(() => { screen.getByTestId("discovery-cta").click(); });
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("skips the hold and the ease under reduced motion", async () => {
    reduced = true;
    render(<Main run={settledRun()} />);
    await flush(0);
    expect(panel()).not.toBeNull();
    expect(panel()).toHaveAttribute("data-expanded", "true");
    expect(screen.getByTestId("discovery-reveal")).toHaveAttribute("data-new-count", "3");
  });

  it("appears on a stage result too, after the completion sting, from that stage's own match", async () => {
    const run = fixtureV5Run(V5_ELIGIBLE_DAY, { current_stage_index: 2, ...MAIN_PAIR }, {
      0: { status: "completed", child_match_id: "rkb_std",
        result: wireResult({ correct: 9, answered: 10, score: 16, misses: 1 }) },
      1: { status: "completed", child_match_id: "rkb_time_trial_stage",
        result: wireResult({ correct: 7, answered: 9, score: 11, misses: 2 }) },
    });
    render(<DailyStageResult run={run} stage={run.stages[1]} onProceed={() => {}}
      onDone={() => {}} onReviewDiscoveries={() => {}} />);
    await flush(DAILY_DISCOVERY_HOLD_MS.stageResult + 100);
    expect(calls).toEqual(["rkb_time_trial_stage"]);
    expect(panel()).toHaveAttribute("data-match-id", "rkb_time_trial_stage");
  });

  it("serves a legacy (pre-v5) Daily's stage result as well", async () => {
    const run = fixtureRun(FOUR_STAGE_DAY, { current_stage_index: 1 }, {
      0: { status: "completed", child_match_id: "rkb_legacy_0",
        result: wireResult({ correct: 5, answered: 5, score: 10, misses: 0 }) },
    });
    render(<DailyStageResult run={run} stage={run.stages[0]} onProceed={() => {}}
      onReviewDiscoveries={() => {}} />);
    await flush(DAILY_DISCOVERY_HOLD_MS.stageResult + 100);
    expect(calls).toEqual(["rkb_legacy_0"]);
    expect(panel()).not.toBeNull();
  });
});

describe("everything short of earned is silence", () => {
  const settledMain = () => {
    render(<Main run={settledRun(NONE_ID)} />);
  };

  it("renders nothing for a stage that discovered nothing — no quiet strip, no wrapper", async () => {
    settledMain();
    await flush(MAIN_HOLD + 1500);
    expect(calls).toEqual([NONE_ID]);
    expect(panel()).toBeNull();
    expect(screen.queryByTestId("discovery-quiet")).toBeNull();
    expect(screen.queryByTestId("discovery-reveal")).toBeNull();
    expect(play.mock.calls.filter(([e]) => e === "ranked.discovery.reveal")).toHaveLength(0);
  });

  const FAILURES: [string, Responder][] = [
    ["a guest (401)", () => json({ detail: { code: "AUTH_REQUIRED", message: "sign in" } }, 401)],
    ["an anonymous session (403 ACCOUNT_REQUIRED)",
      () => json({ detail: { code: "ACCOUNT_REQUIRED", message: "account required" } }, 403)],
    ["a match the caller did not play (403)",
      () => json({ detail: { code: "RANKED_NOT_A_PARTICIPANT", message: "no" } }, 403)],
    ["a missing match (404)", () => json({ detail: { code: "RANKED_MATCH_NOT_FOUND", message: "no" } }, 404)],
    ["a match still settling (409)",
      () => json({ detail: { code: "RANKED_MATCH_NOT_COMPLETE", message: "not complete" } }, 409)],
    ["a server error (500)", () => json({ detail: "boom" }, 500)],
    ["a transport failure", () => { throw new TypeError("Failed to fetch"); }],
    ["a malformed body", () => new Response("<html>gateway</html>", { status: 200 })],
    ["a payload that fails the contract",
      () => json({ ...backend.earned, schema_version: "ranked_duel.match_discoveries.v0" })],
    ["a payload that leaks an answer", () => json({
      ...backend.earned,
      payload: { ...backend.earned.payload, new_discoveries: [{
        ...backend.earned.payload.new_discoveries[0], correct_index: 2 }] },
    })],
  ];

  for (const [name, failure] of FAILURES) {
    it(`for ${name}: no panel, no error, no hang, Continue still works`, async () => {
      respond = failure;
      const onProceed = vi.fn();
      const run = settledRun();
      render(<DailyMainResult run={run} stage={run.stages[0]} onDone={() => {}}
        onProceed={onProceed} onReviewDiscoveries={() => {}} />);
      await flush(MAIN_HOLD + 3000);
      expect(calls).toEqual([EARNED_ID]);
      expect(panel()).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      const cont = screen.getByTestId("daily-main-continue");
      expect(cont).toBeEnabled();
      act(() => { cont.click(); });
      expect(onProceed).toHaveBeenCalledTimes(1);
    });
  }

  it("a slow read never blocks Continue and lands its cards only if it ever answers", async () => {
    let release: (r: Response) => void = () => {};
    respond = () => new Promise<Response>((resolve) => { release = resolve; });
    const onProceed = vi.fn();
    const run = settledRun();
    render(<DailyMainResult run={run} stage={run.stages[0]} onDone={() => {}}
      onProceed={onProceed} onReviewDiscoveries={() => {}} />);
    await flush(MAIN_HOLD + 5000);
    expect(panel()).toBeNull();
    act(() => { screen.getByTestId("daily-main-continue").click(); });
    expect(onProceed).toHaveBeenCalledTimes(1);
    release(json(bodyFor(EARNED_ID)));
    await flush(50);
    expect(panel()).not.toBeNull();
  });
});

describe("gating by the host", () => {
  it("a result given no way into REVIEW makes no request and draws no panel", async () => {
    const run = settledRun();
    render(<DailyMainResult run={run} stage={run.stages[0]} onDone={() => {}} onProceed={() => {}} />);
    await flush(MAIN_HOLD + 3000);
    expect(calls).toEqual([]);
    expect(panel()).toBeNull();
  });
});

describe("stage switch", () => {
  it("drops the previous stage's cards at once and reads the next stage's own match", async () => {
    const run = fixtureV5Run(V5_ELIGIBLE_DAY, { current_stage_index: 2, ...MAIN_PAIR }, {
      0: { status: "completed", child_match_id: "rkb_std",
        result: wireResult({ correct: 9, answered: 10, score: 16, misses: 1 }) },
      1: { status: "completed", child_match_id: NONE_ID,
        result: wireResult({ correct: 7, answered: 9, score: 11, misses: 2 }) },
    });
    const { rerender } = render(
      <DailyStageResult run={run} stage={run.stages[0]} onProceed={() => {}} onReviewDiscoveries={() => {}} />);
    await flush(DAILY_DISCOVERY_HOLD_MS.stageResult + 200);
    expect(panel()).toHaveAttribute("data-match-id", "rkb_std");
    const cuesBefore = play.mock.calls.filter(([e]) => e === "ranked.discovery.reveal").length;

    // The same component instance is reused for the next stage's result.
    rerender(<DailyStageResult run={run} stage={run.stages[1]} onProceed={() => {}} onReviewDiscoveries={() => {}} />);
    expect(panel()).toBeNull(); // not one frame of the old stage's cards
    await flush(DAILY_DISCOVERY_HOLD_MS.stageResult + 1500);
    expect(calls).toEqual(["rkb_std", NONE_ID]);
    expect(panel()).toBeNull(); // the next stage discovered nothing
    expect(play.mock.calls.filter(([e]) => e === "ranked.discovery.reveal")).toHaveLength(cuesBefore);
  });
});
