/**
 * MISC W2D review edge B — a Time Trial bank that goes from >0 STRAIGHT to the
 * server-settled stage result (`ended_by: "time_bank_exhausted"`).
 *
 * The bank readout (`TimeBankMeter`) can only announce TIME'S UP from a server
 * reading of 0 that arrives while it is still mounted. On the common direct
 * transition the parent run adopts the completed stage and the chrome is gone
 * before any such reading, so the authoritative cue must come from the parent
 * run noticing the stage it WATCHED finish with that `ended_by` — under the
 * same event id as the bank's own cue, so the engine plays it once either way.
 */
import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => ({ user: { id: "userA", is_anonymous: false } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockAuth }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
const sfxPlays = vi.hoisted(() => [] as { event: string; eventId?: string }[]);
const sfxApi = vi.hoisted(() => ({
  play: (event: string, options?: { eventId?: string }) => { sfxPlays.push({ event, eventId: options?.eventId }); },
  stop: () => {}, preload: () => {},
}));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => sfxApi }));
vi.mock("@/pages/quiz-ranked/QuizRankedMatch", () => ({
  QuizRankedMatch: () => { throw new Error("the stand-in is injected in these tests"); },
}));
vi.mock("@/lib/navigation/useTransactionalLeaveGuard", () => ({
  useTransactionalLeaveGuard: ({ copy }: { copy: unknown }) => ({
    kind: "daily_run", copy, state: "unblocked", confirmationOpen: false,
    pendingLocation: null, stay: vi.fn(), leave: vi.fn(), runWithBypass: vi.fn(),
  }),
}));

import type { MatchHost } from "@/lib/ranked-core/flow/matchHost";
import {
  FIXTURE_RUN_ID, FOUR_STAGE_DAY, createFixtureTransport, wireResult, wireRun, type FixtureTransport,
} from "@/lib/daily-challenge/run/fixtures";
import { timeoutEventId } from "@/lib/quiz-timer/countdownFeedback";
import { DailyRunPage, type StageMatchProps } from "./DailyRunPage";

let lastHost: MatchHost | null = null;
function FakeStageMatch({ matchId, chrome, host }: StageMatchProps) {
  lastHost = host;
  return <div data-testid="fake-stage-match" data-match-id={matchId}>{chrome}</div>;
}
const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
function mount(t: FixtureTransport) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/quiz/daily-challenge" }]}>
      <Routes>
        <Route path="/quiz/daily-challenge"
          element={<DailyRunPage transport={t} StageMatch={FakeStageMatch} viewerUserId="userA" />} />
      </Routes>
    </MemoryRouter>);
}

const STAGE_ID = `${FIXTURE_RUN_ID}:0:time_trial`;
const BANK_TIMEOUT_ID = timeoutEventId(`daily-bank:${STAGE_ID}`);
const timeouts = () => sfxPlays.filter((p) => p.event === "quiz.answer.timeout");
/** A Time Trial stage in play, its bank still well above zero. */
const liveTimeTrial = (remainingMs: number) => wireRun(FOUR_STAGE_DAY, {}, {
  0: { status: "in_progress", child_match_id: "child-0", live: { time_bank: {
    total_ms: 90_000, remaining_ms: remainingMs, as_of: new Date().toISOString(),
    draining: false, answerable_at: null, deadline: null, answered: false } } },
});
async function settleChild(t: FixtureTransport, endedBy: string) {
  t.finishActiveChild(wireResult({ ended_by: endedBy }));
  await act(async () => {
    lastHost!.onMatchSettled({ matchId: "child-0", terminalReason: "combat", completionReason: endedBy });
  });
  await flush(10);
}

beforeEach(() => {
  sfxPlays.length = 0;
  vi.useFakeTimers({ shouldAdvanceTime: false });
  lastHost = null;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Daily Time Trial: bank >0 → server stage result", () => {
  it("sounds TIME'S UP once, under the bank's own event id, when the server ends the stage on the bank", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, { existing: liveTimeTrial(7_000) });
    mount(t);
    await flush();
    expect((t.wire().stages as { stage_id: string }[])[0].stage_id).toBe(STAGE_ID);
    expect(timeouts()).toEqual([]);
    await settleChild(t, "time_bank_exhausted");
    expect(timeouts()).toEqual([{ event: "quiz.answer.timeout", eventId: BANK_TIMEOUT_ID }]);
    // The stage sting still plays, once.
    expect(sfxPlays.filter((p) => p.event === "daily.stage.complete")).toHaveLength(1);
  });

  it("a stage the content ended (not the bank) is not a timeout", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, { existing: liveTimeTrial(7_000) });
    mount(t);
    await flush();
    await settleChild(t, "completed");
    expect(timeouts()).toEqual([]);
  });

  it("re-entering a stage the bank already ended (reload / history) replays nothing", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, {
      existing: wireRun(FOUR_STAGE_DAY, { current_stage_index: 1 }, {
        0: { status: "completed", result: wireResult({ ended_by: "time_bank_exhausted" }) },
      }),
    });
    mount(t);
    await flush(2_000);
    expect(timeouts()).toEqual([]);
  });
});
