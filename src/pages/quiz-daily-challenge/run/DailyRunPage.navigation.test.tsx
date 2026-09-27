import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, Link, RouterProvider } from "react-router-dom";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FOUR_STAGE_DAY, wireResult, wireRun } from "@/lib/daily-challenge/run/fixtures";
import { readDailyRun } from "@/lib/daily-challenge/run/contracts";
import type { DailyFlowView } from "@/lib/daily-challenge/run/flow";

const mockState = vi.hoisted(() => ({
  current: null as unknown as Record<string, unknown>,
  listeners: new Set<() => void>(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "userA", is_anonymous: false } }) }));
vi.mock("./useDailyRun", async () => {
  const { useSyncExternalStore } = await import("react");
  return { useDailyRun: () => useSyncExternalStore(
    (listener) => { mockState.listeners.add(listener); return () => mockState.listeners.delete(listener); },
    () => mockState.current,
  ) };
});
vi.mock("@/pages/quiz-ranked/QuizRankedMatch", () => ({ QuizRankedMatch: () => <div data-testid="hosted-child" /> }));

import { DailyRunPage } from "./DailyRunPage";

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

const activeRun = () => readDailyRun(wireRun(FOUR_STAGE_DAY));
const completedRun = () => readDailyRun(wireRun(FOUR_STAGE_DAY,
  { status: "completed", outcome: "reviewed", current_stage_index: null },
  Object.fromEntries(FOUR_STAGE_DAY.map((_, i) => [i, { status: "completed", result: wireResult() }]))));
const view = (run: ReturnType<typeof activeRun>, phase: DailyFlowView["phase"]): DailyFlowView => ({
  phase, stage: phase === "complete" ? null : run.stages[run.currentStageIndex ?? 0],
  childMatchId: phase === "stage-play" ? run.stages[run.currentStageIndex ?? 0].childMatchId : null,
  settlingChildMatchId: null,
});

function setDaily(run = activeRun(), phase: DailyFlowView["phase"] = "daily-intro") {
  mockState.current = {
    load: "run", run, flow: view(run, phase), busy: false, error: null, skewMs: 0,
    childPhase: null, childEntry: "recovered", survival: null, strikesSeen: {},
    start: vi.fn(), retry: vi.fn(), onChildSettled: vi.fn(), onChildPhase: vi.fn(),
    onChildPlayerFinished: vi.fn(), onChildSurvivalStatus: vi.fn(), continueFromResult: vi.fn(),
  };
  mockState.listeners.forEach((listener) => listener());
}

function harness(entries = ["/quiz", "/quiz/daily-challenge", "/lol"], index = 1) {
  return createMemoryRouter([
    { path: "/quiz", element: <h1>Quiz</h1> },
    { path: "/lol", element: <h1>Home</h1> },
    { path: "/quiz/daily-challenge", element: <><DailyRunPage viewerUserId="userA" /><Link to="/lol">HUD Home</Link></> },
  ], { initialEntries: entries, initialIndex: index });
}

beforeAll(() => { globalThis.Request = RouterTestRequest as unknown as typeof Request; });
afterAll(() => { globalThis.Request = NativeRequest; });
beforeEach(() => setDaily());

describe("DailyRunPage navigation ownership", () => {
  it("resets Back on Continue, then proceeds the original POP and preserves Forward recovery", async () => {
    const router = harness();
    render(<RouterProvider router={router} />);
    await act(() => router.navigate(-1));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Your completed stages are saved");
    fireEvent.click(screen.getByRole("button", { name: "Continue Daily" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/quiz/daily-challenge");
    await act(() => router.navigate(-1));
    fireEvent.click(await screen.findByRole("button", { name: "Exit Daily Challenge" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/quiz"));
    expect(router.state.historyAction).toBe("POP");
    await act(() => router.navigate(1));
    expect(router.state.location.pathname).toBe("/quiz/daily-challenge");
    expect((mockState.current.run as ReturnType<typeof activeRun>).runId).toBe("dr_fixture0000000000000000");
  });

  it("labels and guards the header's ordinary PUSH", async () => {
    const daily = activeRun();
    setDaily(daily, "stage-intro");
    const router = harness(["/quiz/daily-challenge"], 0);
    render(<RouterProvider router={router} />);
    fireEvent.click(screen.getByRole("link", { name: "Exit Daily Challenge" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue Daily" }));
    fireEvent.click(screen.getByRole("link", { name: "Exit Daily Challenge" }));
    fireEvent.click(await screen.findByRole("button", { name: "Exit Daily Challenge" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/quiz"));
    expect(router.state.historyAction).toBe("PUSH");
  });

  it("guards HUD Home without a separate handler", async () => {
    const router = harness(["/quiz/daily-challenge"], 0);
    render(<RouterProvider router={router} />);
    fireEvent.click(screen.getByRole("link", { name: "HUD Home" }));
    expect(await screen.findAllByRole("alertdialog")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Exit Daily Challenge" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/lol"));
  });

  it("updates copy from the newest stage while retaining the blocked destination", async () => {
    const router = harness(["/quiz/daily-challenge"], 0);
    const rendered = render(<RouterProvider router={router} />);
    fireEvent.click(screen.getByRole("link", { name: "HUD Home" }));
    expect(await screen.findByRole("alertdialog")).not.toHaveTextContent("still live");
    const live = readDailyRun(wireRun(FOUR_STAGE_DAY, {}, { 0: { status: "in_progress", child_match_id: "child-0" } }));
    act(() => setDaily(live, "stage-play"));
    rendered.rerender(<RouterProvider router={router} />);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("still live");
    fireEvent.click(screen.getByRole("button", { name: "Exit Daily Challenge" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/lol"));
  });

  it("dismisses a stale blocked transition when the whole Daily completes", async () => {
    const router = harness(["/quiz/daily-challenge"], 0);
    const rendered = render(<RouterProvider router={router} />);
    fireEvent.click(screen.getByRole("link", { name: "HUD Home" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    const done = completedRun();
    act(() => setDaily(done, "complete"));
    rendered.rerender(<RouterProvider router={router} />);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/quiz/daily-challenge");
    expect(screen.getByTestId("daily-run-complete")).toBeInTheDocument();
  });

  it("shows the result-loss warning only for the mount-local result interstitial", async () => {
    const daily = activeRun();
    setDaily(daily, "stage-result");
    const router = harness(["/quiz/daily-challenge"], 0);
    render(<RouterProvider router={router} />);
    fireEvent.click(screen.getByRole("link", { name: "HUD Home" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("result screen will not be shown again");
  });

  it("does not guard pre-run recovery when readToday returns no current-date run", async () => {
    mockState.current = { ...mockState.current, load: "ready", run: null, flow: null };
    const router = harness(["/quiz/daily-challenge"], 0);
    render(<RouterProvider router={router} />);
    fireEvent.click(screen.getByRole("link", { name: "HUD Home" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/lol"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
