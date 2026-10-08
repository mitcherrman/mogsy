/**
 * DV2-P2A.1 — THE OPTIONAL-LAUNCH LEAVE RACE.
 *
 * On a main-complete v5 day, choosing an optional activity starts
 * `launchStage()` behind the stage tag. Until the response binds a child, the
 * snapshot still says "pending, no child". These tests drive the REAL
 * controller (`useDailyRun`), the REAL router blocker
 * (`useTransactionalLeaveGuard`) and a launch the test holds open, and prove
 * there is no window where the request can still create a child while leaving
 * is unguarded, without ever calling that window a live child.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, Link, RouterProvider } from "react-router-dom";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "userA", is_anonymous: false } }) }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
const sfxApi = vi.hoisted(() => ({ play: () => {}, stop: () => {}, preload: () => {} }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => sfxApi }));
vi.mock("@/pages/quiz-ranked/QuizRankedMatch", () => ({
  QuizRankedMatch: () => { throw new Error("the stand-in is injected in these tests"); },
}));

import type { MatchHost } from "@/lib/ranked-core/flow/matchHost";
import { DailyRunApiError } from "@/lib/daily-challenge/run/client";
import { readDailyRun } from "@/lib/daily-challenge/run/contracts";
import {
  FOUR_STAGE_DAY, V5_ELIGIBLE_DAY, createFixtureTransport, wireResult, wireRun, wireV5Run,
  type FixtureTransport,
} from "@/lib/daily-challenge/run/fixtures";
import { optionalLaunchInFlight, optionalLaunchTarget } from "@/lib/daily-challenge/run/flow";
import { DailyRunPage, type StageMatchProps } from "./DailyRunPage";
import { dailyLeaveCopy, shouldGuardDailyLeave } from "./dailyLeaveContract";

const NativeRequest = globalThis.Request;
class RouterTestRequest {
  readonly url: string;
  readonly method: string;
  readonly signal: AbortSignal | null;
  readonly headers: Headers;
  constructor(input: string | URL, init: RequestInit = {}) {
    this.url = String(input); this.method = init.method ?? "GET";
    this.signal = init.signal ?? null; this.headers = new Headers(init.headers);
  }
}
beforeAll(() => { globalThis.Request = RouterTestRequest as unknown as typeof Request; });
afterAll(() => { globalThis.Request = NativeRequest; });

let lastHost: MatchHost | null = null;
function FakeStageMatch({ matchId, chrome, host }: StageMatchProps) {
  lastHost = host;
  return <div data-testid="fake-stage-match" data-match-id={matchId}>{chrome}</div>;
}
beforeEach(() => { lastHost = null; });

/** A v5 eligible day: Standard settled and main frozen, the run at Time Trial. */
const mainCompleteWire = (stages: Record<number, Record<string, unknown>> = {}) =>
  wireV5Run(V5_ELIGIBLE_DAY, {
    current_stage_index: 1, main_completed_at: "2026-10-08T12:00:00Z", main_score: 1234,
  }, { 0: { status: "completed", child_match_id: "m0", result: wireResult({ score: 1234 }) }, ...stages });

/** Hold every launch open until the test lets it go (or fails it). */
function holdLaunches(t: FixtureTransport) {
  const real = t.launchStage.bind(t);
  let release: (outcome: "ok" | "refused" | "lost") => void = () => {};
  t.launchStage = (runId, index, signal, interactionId) => new Promise((resolve, reject) => {
    release = (outcome) => {
      if (outcome === "refused") {
        t.calls.push(`launch:${index}`);
        reject(new DailyRunApiError("backend", 503, "child unavailable", "DAILY_RUN_CHILD_UNAVAILABLE"));
        return;
      }
      // "lost": the server created the child, the response never arrived.
      const done = real(runId, index, signal, interactionId);
      if (outcome === "ok") done.then(resolve, reject);
      else done.then(() => reject(new DailyRunApiError("network", 0, "connection lost")), reject);
    };
  });
  return { release: (o: "ok" | "refused" | "lost") => act(async () => { release(o); await Promise.resolve(); }) };
}

function mountAt(t: FixtureTransport) {
  const router = createMemoryRouter([
    { path: "/quiz", element: <h1>Quiz</h1> },
    { path: "/lol", element: <h1>Home</h1> },
    { path: "/quiz/daily-challenge", element: <>
      <DailyRunPage transport={t} StageMatch={FakeStageMatch} viewerUserId="userA" />
      <Link to="/lol">HUD Home</Link>
    </> },
  ], { initialEntries: ["/quiz", "/quiz/daily-challenge"], initialIndex: 1 });
  render(<RouterProvider router={router} />);
  return router;
}

const phase = () => screen.getAllByTestId("daily-run")[0].getAttribute("data-flow-phase");
const leaveVia = (name = "HUD Home") => fireEvent.click(screen.getByRole("link", { name }));
const launches = (t: FixtureTransport) => t.calls.filter((c) => c.startsWith("launch"));

describe("DV2-P2A.1 — the optional-launch latch", () => {
  it("main complete on optional-entry is unguarded: leaving needs no confirmation", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5, existing: mainCompleteWire() });
    const router = mountAt(t);
    await waitFor(() => expect(phase()).toBe("optional-entry"));
    leaveVia();
    await waitFor(() => expect(router.state.location.pathname).toBe("/lol"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(launches(t)).toEqual([]);
  });

  it("Play More Challenges guards at once, before the launch resolves; then the live-child guard takes over", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5, existing: mainCompleteWire() });
    const gate = holdLaunches(t);
    const router = mountAt(t);
    await waitFor(() => expect(phase()).toBe("optional-entry"));
    fireEvent.click(screen.getByTestId("daily-optional-continue"));
    await waitFor(() => expect(phase()).toBe("stage-intro"));

    // The launch is in flight and the snapshot still has no child.
    expect(t.wire().stages).toMatchObject({ 1: { status: "pending", child_match_id: null } });
    // Back (POP) and a HUD link (PUSH) are both blocked — said as STARTING,
    // never as a live child with a 45-second clock.
    await act(() => router.navigate(-1));
    const starting = await screen.findByRole("alertdialog");
    expect(starting).toHaveTextContent("Leave Time Trial?");
    expect(starting).toHaveTextContent("Time Trial is starting");
    expect(starting).toHaveTextContent("leaving now may still start Time Trial");
    expect(starting).not.toHaveTextContent("45 seconds");
    expect(router.state.location.pathname).toBe("/quiz/daily-challenge");

    // The launch binds a child while the player is deciding: the copy becomes
    // the live child's, and the original destination is kept.
    await gate.release("ok");
    await waitFor(() => expect(screen.getByRole("alertdialog")).toHaveTextContent("about 45 seconds"));
    expect(screen.getByRole("alertdialog")).not.toHaveTextContent("is starting");
    fireEvent.click(screen.getByRole("button", { name: "Keep playing" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    // Still live: still guarded.
    leaveVia();
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("about 45 seconds");
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/lol"));
  });

  it("navigating during a held launch cannot leave silently: confirmed leave is the only way out", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5, existing: mainCompleteWire() });
    holdLaunches(t);
    const router = mountAt(t);
    await waitFor(() => expect(phase()).toBe("optional-entry"));
    fireEvent.click(screen.getByTestId("daily-optional-continue"));
    // Synchronously after the press: no render tick in which leaving is free.
    leaveVia();
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("is starting");
    expect(router.state.location.pathname).toBe("/quiz/daily-challenge");
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/lol"));
  });

  it("a refused launch, confirmed childless, frees leaving again", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5, existing: mainCompleteWire() });
    const gate = holdLaunches(t);
    const router = mountAt(t);
    await waitFor(() => expect(phase()).toBe("optional-entry"));
    fireEvent.click(screen.getByTestId("daily-optional-continue"));
    await gate.release("refused");
    // The failure is shown, and the server was asked what it holds.
    await waitFor(() => expect(screen.getByTestId("daily-run-error")).toHaveTextContent("This stage couldn't open"));
    await waitFor(() => expect(t.calls.at(-1)).toBe("readRun"));
    expect(t.wire().stages).toMatchObject({ 1: { child_match_id: null } });
    leaveVia();
    await waitFor(() => expect(router.state.location.pathname).toBe("/lol"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("Try again re-commits: guarded again while the retried launch is in flight", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5, existing: mainCompleteWire() });
    const gate = holdLaunches(t);
    mountAt(t);
    await waitFor(() => expect(phase()).toBe("optional-entry"));
    fireEvent.click(screen.getByTestId("daily-optional-continue"));
    await gate.release("refused");
    await waitFor(() => expect(t.calls.at(-1)).toBe("readRun"));
    fireEvent.click(screen.getByTestId("daily-run-retry"));
    leaveVia();
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("is starting");
  });

  it("a launch whose response was lost but whose child exists is treated as live, not as failed", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5, existing: mainCompleteWire() });
    const gate = holdLaunches(t);
    mountAt(t);
    await waitFor(() => expect(phase()).toBe("optional-entry"));
    fireEvent.click(screen.getByTestId("daily-optional-continue"));
    await gate.release("lost");
    await waitFor(() => expect(t.calls.at(-1)).toBe("readRun"));
    expect(t.wire().stages).toMatchObject({ 1: { status: "in_progress", child_match_id: "child-1" } });
    leaveVia();
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("about 45 seconds");
  });

  it("a failed launch whose re-read also fails stays guarded (the outcome is unknown)", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5, existing: mainCompleteWire() });
    const gate = holdLaunches(t);
    mountAt(t);
    await waitFor(() => expect(phase()).toBe("optional-entry"));
    fireEvent.click(screen.getByTestId("daily-optional-continue"));
    t.readRun = async () => { t.calls.push("readRun"); throw new DailyRunApiError("network", 0, "offline"); };
    await gate.release("refused");
    await waitFor(() => expect(t.calls.at(-1)).toBe("readRun"));
    leaveVia();
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("is starting");
  });

  it("from the in-session MAIN result, Play More Challenges guards at once too", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5,
      existing: wireV5Run(V5_ELIGIBLE_DAY, {}, { 0: { status: "in_progress", child_match_id: "child-0" } }) });
    holdLaunches(t);
    const router = mountAt(t);
    await waitFor(() => expect(phase()).toBe("stage-play"));
    t.finishActiveChild(wireResult({ score: 77 }));
    await act(async () => { lastHost!.onMatchSettled({ matchId: "child-0", terminalReason: "combat", completionReason: null }); });
    await waitFor(() => expect(screen.getByTestId("daily-main-result")).not.toHaveAttribute("data-pending"));
    // The main result itself: free to leave (P2A, unchanged).
    expect(shouldGuardDailyLeave(readDailyRun(t.wire()), null)).toBe(false);
    fireEvent.click(screen.getByTestId("daily-main-continue"));
    leaveVia();
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Time Trial is starting");
    expect(router.state.location.pathname).toBe("/quiz/daily-challenge");
  });

  it("Done for now from the main result still makes zero server calls", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5,
      existing: wireV5Run(V5_ELIGIBLE_DAY, {}, { 0: { status: "in_progress", child_match_id: "child-0" } }) });
    const router = mountAt(t);
    await waitFor(() => expect(phase()).toBe("stage-play"));
    t.finishActiveChild(wireResult({ score: 77 }));
    await act(async () => { lastHost!.onMatchSettled({ matchId: "child-0", terminalReason: "combat", completionReason: null }); });
    await waitFor(() => expect(screen.getByTestId("daily-main-result")).not.toHaveAttribute("data-pending"));
    const before = [...t.calls];
    fireEvent.click(screen.getByTestId("daily-done-for-now"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/quiz"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(t.calls).toEqual(before);
  });

  it("v4: guards and copy are unchanged (no latch can exist)", async () => {
    const legacy = wireRun(FOUR_STAGE_DAY, { plan_version: 4, current_stage_index: 1 },
      { 0: { status: "completed", child_match_id: "m0", result: wireResult() } });
    expect(optionalLaunchTarget(readDailyRun(legacy))).toBeNull();
    const t = createFixtureTransport(FOUR_STAGE_DAY, { existing: legacy });
    holdLaunches(t);
    const router = mountAt(t);
    await waitFor(() => expect(phase()).toBe("stage-intro"));
    leaveVia();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Exit Daily Challenge?");
    expect(dialog).toHaveTextContent("Your completed stages are saved. You can resume before the Daily resets.");
    expect(dialog).not.toHaveTextContent("is starting");
    expect(router.state.location.pathname).toBe("/quiz/daily-challenge");
  });
});

describe("DV2-P2A.1 — the pure seam", () => {
  const run = (stages: Record<number, Record<string, unknown>> = {}) => readDailyRun(mainCompleteWire(stages));

  it("a target exists only on an open main-complete v5 day with no child bound", () => {
    expect(optionalLaunchTarget(run())).toBe(run().stages[1].id);
    expect(optionalLaunchTarget(run({ 1: { status: "in_progress", child_match_id: "child-1" } }))).toBeNull();
    expect(optionalLaunchTarget(readDailyRun(wireV5Run(V5_ELIGIBLE_DAY)))).toBeNull(); // pre-main
  });

  it("in flight only for the committed stage, and never without a commit (reload)", () => {
    const r = run();
    expect(optionalLaunchInFlight(r, null)).toBe(false);
    expect(optionalLaunchInFlight(r, r.stages[1].id)).toBe(true);
    expect(optionalLaunchInFlight(r, r.stages[2].id)).toBe(false);
    const bound = run({ 1: { status: "in_progress", child_match_id: "child-1" } });
    expect(optionalLaunchInFlight(bound, bound.stages[1].id)).toBe(false);
  });

  it("the guard and its copy: starting is guarded and says starting; a live child keeps its copy", () => {
    const r = run();
    expect(shouldGuardDailyLeave(r, null)).toBe(false);
    expect(shouldGuardDailyLeave(r, null, true)).toBe(true);
    expect(String(dailyLeaveCopy(r, null, true).body)).toContain("is starting");
    expect(String(dailyLeaveCopy(r, null, true).body)).not.toContain("45 seconds");
    const live = run({ 1: { status: "in_progress", child_match_id: "child-1" } });
    const flow = { phase: "stage-play" as const, stage: live.stages[1], childMatchId: "child-1" };
    expect(String(dailyLeaveCopy(live, flow, true).body)).toContain("about 45 seconds");
  });
});
