/**
 * PGM1 — the Daily's ways into and back from the public More Challenges catalog.
 *
 *   * the main result's "Play More Challenges" opens the catalog when the next
 *     stage is a bonus stage; Review and the recap still proceed in place;
 *   * a bonus stage's result offers "More Challenges"; a Review stage's does not;
 *   * the recap of a finished v5 day links to the catalog; a v4 recap does not;
 *   * the catalog's continue intent goes on into the current optional stage
 *     ONCE, and never starts a run or skips a live child's recovery;
 *   * nothing here changes the main score.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes, useLocation } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "userA", is_anonymous: false } }) }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
const sfxApi = vi.hoisted(() => ({ play: () => {}, stop: () => {}, preload: () => {} }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => sfxApi }));
vi.mock("@/pages/quiz-ranked/QuizRankedMatch", () => ({
  QuizRankedMatch: () => { throw new Error("the stand-in is injected in these tests"); },
}));

import {
  FOUR_STAGE_DAY, V5_ELIGIBLE_DAY, createFixtureTransport, fixtureRun, fixtureV5Run, wireResult, wireV5Run,
} from "@/lib/daily-challenge/run/fixtures";
import { DAILY_CONTINUE_STATE } from "@/lib/daily-challenge/run/entry";
import { STAGE_INTRO_MIN_MS } from "@/lib/daily-challenge/run/flow";
import { DailyMainResult } from "./DailyMainResult";
import { DailyStageResult } from "./DailyStageResult";
import { DailyCompletion } from "./DailyCompletion";
import { DailyRunPage, type StageMatchProps } from "./DailyRunPage";

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { vi.useRealTimers(); });

const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const phase = () => screen.getAllByTestId("daily-run")[0].getAttribute("data-flow-phase");

const MAIN_DONE = { main_completed_at: "2026-10-16T10:00:00Z", main_score: 1234 };
const mainDone = (overrides = {}, stages = {}) => fixtureV5Run(V5_ELIGIBLE_DAY,
  { ...MAIN_DONE, current_stage_index: 1, ...overrides },
  { 0: { status: "completed", result: wireResult() }, ...stages });

describe("PGM1 — the main result", () => {
  it("Play More Challenges opens the catalog when the next stage is a bonus stage", () => {
    const run = mainDone();
    const onProceed = vi.fn();
    const onMoreChallenges = vi.fn();
    render(<MemoryRouter><DailyMainResult run={run} stage={run.stages[0]} onDone={() => {}}
      onProceed={onProceed} onMoreChallenges={onMoreChallenges} /></MemoryRouter>);
    const primary = screen.getByTestId("daily-main-continue");
    expect(primary).toHaveTextContent("Play More Challenges");
    fireEvent.click(primary);
    expect(onMoreChallenges).toHaveBeenCalledTimes(1);
    expect(onProceed).not.toHaveBeenCalled();
  });

  it("Start Review still proceeds in place", () => {
    const run = mainDone({ current_stage_index: 3 }, {
      1: { status: "completed", result: wireResult() }, 2: { status: "completed", result: wireResult() } });
    const onProceed = vi.fn();
    const onMoreChallenges = vi.fn();
    render(<MemoryRouter><DailyMainResult run={run} stage={run.stages[0]} onDone={() => {}}
      onProceed={onProceed} onMoreChallenges={onMoreChallenges} /></MemoryRouter>);
    fireEvent.click(screen.getByTestId("daily-main-continue"));
    expect(onProceed).toHaveBeenCalledTimes(1);
    expect(onMoreChallenges).not.toHaveBeenCalled();
  });
});

describe("PGM1 — a stage result", () => {
  it("a bonus stage offers the way back to More Challenges", () => {
    const run = mainDone({ current_stage_index: 2 }, { 1: { status: "completed", result: wireResult() } });
    const onMoreChallenges = vi.fn();
    render(<MemoryRouter><DailyStageResult run={run} stage={run.stages[1]} onProceed={() => {}}
      onDone={() => {}} onMoreChallenges={onMoreChallenges} /></MemoryRouter>);
    const back = screen.getByTestId("daily-stage-result-more-challenges");
    expect(back).toHaveTextContent("More Challenges");
    fireEvent.click(back);
    expect(onMoreChallenges).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("daily-stage-result-continue")).toHaveTextContent("Continue");
  });

  it("a Review-side stage does not", () => {
    const run = mainDone({ current_stage_index: 4 }, {
      1: { status: "completed", result: wireResult() }, 2: { status: "completed", result: wireResult() },
      3: { status: "completed", result: wireResult() } });
    render(<MemoryRouter><DailyStageResult run={run} stage={run.stages[3]} onProceed={() => {}}
      onDone={() => {}} onMoreChallenges={() => {}} /></MemoryRouter>);
    expect(screen.queryByTestId("daily-stage-result-more-challenges")).toBeNull();
  });
});

describe("PGM1 — the recap", () => {
  function LocationProbe() {
    const l = useLocation();
    return <pre data-testid="probe">{l.pathname + JSON.stringify(l.state)}</pre>;
  }

  it("a finished v5 day links to More Challenges", () => {
    const run = fixtureV5Run(V5_ELIGIBLE_DAY, { ...MAIN_DONE, status: "completed", current_stage_index: null,
      outcome: "reviewed" }, Object.fromEntries(V5_ELIGIBLE_DAY.map((_, i) => [i, { status: "completed", result: wireResult() }])));
    render(<MemoryRouter initialEntries={["/quiz/daily-challenge"]}><Routes>
      <Route path="/quiz/daily-challenge" element={<DailyCompletion run={run} saveRequired={false} />} />
      <Route path="/quiz/more-challenges" element={<LocationProbe />} />
    </Routes></MemoryRouter>);
    fireEvent.click(screen.getByTestId("daily-run-more-challenges"));
    expect(screen.getByTestId("probe")).toHaveTextContent('/quiz/more-challenges{"moreChallengesSource":"daily"}');
  });

  it("a v4 recap is unchanged", () => {
    const run = fixtureRun(FOUR_STAGE_DAY, { plan_version: 4, status: "completed", current_stage_index: null,
      outcome: "reviewed" }, Object.fromEntries(FOUR_STAGE_DAY.map((_, i) => [i, { status: "completed", result: wireResult() }])));
    render(<MemoryRouter><DailyCompletion run={run} saveRequired={false} /></MemoryRouter>);
    expect(screen.queryByTestId("daily-run-more-challenges")).toBeNull();
    expect(screen.getByTestId("daily-run-home")).toBeInTheDocument();
  });
});

describe("PGM1 — the catalog's continue intent", () => {
  // jsdom's AbortSignal is not undici's, so a data-router navigation needs a
  // Request it can build (the same stand-in JourneyLibraryPage.test uses).
  const NativeRequest = globalThis.Request;
  class RouterTestRequest {
    readonly url: string;
    readonly method: string;
    readonly signal: AbortSignal | null;
    readonly headers: Headers;
    constructor(input: string | URL, init: RequestInit = {}) {
      this.url = String(input);
      this.method = init.method ?? "GET";
      this.signal = init.signal ?? null;
      this.headers = new Headers(init.headers);
    }
  }
  beforeAll(() => { globalThis.Request = RouterTestRequest as unknown as typeof Request; });
  afterAll(() => { globalThis.Request = NativeRequest; });

  function FakeStageMatch({ matchId }: StageMatchProps) {
    return <div data-testid="fake-stage-match" data-match-id={matchId} />;
  }
  function mount(transport: ReturnType<typeof createFixtureTransport>, state: unknown) {
    // A data router: the Daily's leave guard uses `useBlocker`.
    const router = createMemoryRouter([
      { path: "/quiz/daily-challenge",
        element: <DailyRunPage transport={transport} StageMatch={FakeStageMatch} viewerUserId="userA" /> },
      { path: "/quiz", element: <div data-testid="hub-stand-in" /> },
    ], { initialEntries: [{ pathname: "/quiz/daily-challenge", state }] });
    render(<RouterProvider router={router} />);
  }
  const mainDoneWire = () => wireV5Run(V5_ELIGIBLE_DAY, { ...MAIN_DONE, current_stage_index: 1 },
    { 0: { status: "completed", result: wireResult() } });

  it("goes on into the current bonus stage, once, without starting a run", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5, existing: mainDoneWire() });
    mount(t, DAILY_CONTINUE_STATE);
    await flush(10);
    expect(phase()).toBe("stage-intro");
    expect(screen.getByTestId("daily-stage-intro")).toHaveAttribute("data-stage-kind", "time_trial");
    await flush(STAGE_INTRO_MIN_MS + 50);
    expect(phase()).toBe("stage-play");
    expect(t.calls).not.toContain("startToday");
    expect(t.calls.filter((c) => c.startsWith("launch"))).toEqual(["launch:1"]);
    expect(t.wire().main_score).toBe(1234);
  });

  it("without the intent, the same run lands on the optional entry and waits", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5, existing: mainDoneWire() });
    mount(t, null);
    await flush(STAGE_INTRO_MIN_MS + 50);
    expect(phase()).toBe("optional-entry");
    expect(t.calls.filter((c) => c.startsWith("launch"))).toEqual([]);
  });

  it("a live optional child recovers as before; the intent is not spent on it", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5, existing: wireV5Run(V5_ELIGIBLE_DAY,
      { ...MAIN_DONE, current_stage_index: 1 },
      { 0: { status: "completed", result: wireResult() }, 1: { status: "in_progress", child_match_id: "child-1" } }) });
    mount(t, DAILY_CONTINUE_STATE);
    await flush(10);
    expect(phase()).toBe("stage-play");
    expect(screen.getByTestId("fake-stage-match")).toHaveAttribute("data-match-id", "child-1");
    expect(t.calls.filter((c) => c.startsWith("launch"))).toEqual([]);
  });

  it("with no run today, the intent starts nothing and the page returns to the hub", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5 });
    mount(t, DAILY_CONTINUE_STATE);
    await flush(10);
    expect(screen.getByTestId("hub-stand-in")).toBeInTheDocument();
    expect(t.calls).not.toContain("startToday");
  });
});
