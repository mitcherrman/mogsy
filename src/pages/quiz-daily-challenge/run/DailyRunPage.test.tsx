/**
 * DCMOD-E — THE DAILY CHALLENGE STAGE FLOW, end to end against fixtures.
 *
 * The parent run is the fixture transport (an in-memory model of DCMOD-B's
 * state machine). The child match is a stand-in that renders the chrome it is
 * handed and exposes the `MatchHost` it received, so a test can play the part
 * of the canonical arena: report phases, and hand the match back. That the
 * REAL arena hands back without an outro or end screen is proven separately,
 * through the real controller, in `QuizRankedMatch.hosted.test.tsx`.
 */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => ({
  user: { id: "userA", is_anonymous: false } as { id: string; is_anonymous: boolean },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockAuth }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/pages/quiz-ranked/QuizRankedMatch", () => ({
  QuizRankedMatch: () => { throw new Error("the stand-in is injected in these tests"); },
}));

import type { MatchHost } from "@/lib/ranked-core/flow/matchHost";
import {
  FIVE_STAGE_DAY, FOUR_STAGE_DAY, createFixtureTransport, wireResult, wireRun,
  type FixtureTransport,
} from "@/lib/daily-challenge/run/fixtures";
import { DAILY_INTRO_MS, STAGE_INTRO_MIN_MS, STAGE_RESULT_MS } from "@/lib/daily-challenge/run/flow";
import { DailyRunPage, type StageMatchProps } from "./DailyRunPage";

let lastHost: MatchHost | null = null;
const mounts: { matchId: string; entry: string }[] = [];

function FakeStageMatch({ matchId, entry, chrome, host }: StageMatchProps) {
  lastHost = host;
  if (!mounts.some((m) => m.matchId === matchId)) mounts.push({ matchId, entry });
  return (
    <div data-testid="fake-stage-match" data-match-id={matchId} data-entry={entry}
      data-eyebrow={host.eyebrow}>
      {chrome}
    </div>
  );
}

const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const phase = () => screen.getAllByTestId("daily-run")[0].getAttribute("data-flow-phase");
const q = (id: string) => screen.queryByTestId(id);

function mount(t: FixtureTransport) {
  return render(
    <MemoryRouter>
      <DailyRunPage transport={t} StageMatch={FakeStageMatch} viewerUserId="userA" />
    </MemoryRouter>);
}

/** Play the current stage: wait out its tag, then hand its child back. */
async function playStage(t: FixtureTransport, result = wireResult()) {
  await flush(STAGE_INTRO_MIN_MS + 50);
  expect(phase()).toBe("stage-play");
  t.finishActiveChild(result);
  const id = q("fake-stage-match")!.getAttribute("data-match-id")!;
  await act(async () => { lastHost!.onMatchSettled({ matchId: id, terminalReason: "combat", completionReason: null }); });
  await flush(10);
}

beforeEach(() => {
  mockAuth.user = { id: "userA", is_anonymous: false };
  vi.useFakeTimers({ shouldAdvanceTime: false });
  lastHost = null;
  mounts.length = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("one Daily Challenge, stage by stage", () => {
  it("intro → tag → gameplay → short result → next tag … → Review → ONE completion", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY);
    mount(t);
    await flush();
    expect(q("daily-run-entry")).not.toBeNull();

    await act(async () => { screen.getByTestId("daily-run-start").click(); });
    await flush();
    // The Daily intro: one challenge, its whole lineup, Review last.
    expect(phase()).toBe("daily-intro");
    const ladder = within(screen.getByTestId("daily-intro")).getByTestId("daily-stage-ladder");
    const kinds = within(ladder).getAllByRole("listitem").map((li) => li.getAttribute("data-stage-kind"));
    expect(kinds).toEqual(["time_trial", "standard", "survival", "review"]);
    // Nothing is launched behind a screen the player is reading.
    expect(t.calls.filter((c) => c.startsWith("launch"))).toEqual([]);

    await flush(DAILY_INTRO_MS + 10);
    // Stage 1's tag: its mode, what it is about, its rule — and the launch it covers.
    expect(phase()).toBe("stage-intro");
    const intro = screen.getByTestId("daily-stage-intro");
    expect(within(intro).getByTestId("daily-stage-tag")).toHaveTextContent(/time trial/i);
    expect(within(intro).getByTestId("daily-stage-intro-content")).toHaveTextContent("Champion Mastery — Ahri");
    expect(t.calls.filter((c) => c.startsWith("launch"))).toEqual(["launch:0"]);
    // The tag holds its minimum even though the child already exists.
    expect(q("fake-stage-match")).toBeNull();

    const completions: number[] = [];
    const watch = () => completions.push(screen.queryAllByTestId("daily-run-complete").length);

    await playStage(t);
    watch();
    // A short interstitial — never a match outro.
    expect(phase()).toBe("stage-result");
    const result = screen.getByTestId("daily-stage-result");
    // The finished stage's own tag leads; "Up next" carries the next one's.
    expect(within(result).getAllByTestId("daily-stage-tag")[0]).toHaveTextContent(/time trial/i);
    expect(within(result).getByTestId("daily-stage-result-correct")).toHaveTextContent("8");
    expect(within(result).getByTestId("daily-stage-result-next")).toHaveTextContent(/standard/i);
    expect(result).not.toHaveTextContent(/victory|defeat/i);

    await flush(STAGE_RESULT_MS + 10);
    expect(phase()).toBe("stage-intro");
    expect(screen.getByTestId("daily-stage-intro")).toHaveAttribute("data-stage-kind", "standard");
    await playStage(t);
    watch();
    await flush(STAGE_RESULT_MS + 10);
    expect(screen.getByTestId("daily-stage-intro")).toHaveAttribute("data-stage-kind", "survival");
    await playStage(t);
    watch();
    await flush(STAGE_RESULT_MS + 10);

    // Review reads as the closing stage.
    const review = screen.getByTestId("daily-stage-intro");
    expect(review).toHaveAttribute("data-stage-kind", "review");
    expect(review).toHaveAttribute("data-closing", "true");
    expect(within(review).getByTestId("daily-stage-intro-position")).toHaveTextContent("Final stage");
    await playStage(t);

    // Review goes straight to the one final completion — no stage interstitial.
    expect(phase()).toBe("complete");
    expect(q("daily-stage-result")).toBeNull();
    expect(screen.getAllByTestId("daily-run-complete")).toHaveLength(1);
    expect(screen.getByTestId("daily-run-complete")).toHaveAttribute("data-perfect", "false");
    expect(screen.getByTestId("daily-recap-3")).toHaveAttribute("data-closing", "true");
    // No completion ever appeared between stages.
    expect(completions).toEqual([0, 0, 0]);
    // Each child mounted once, fresh, under the Daily's name.
    expect(mounts).toEqual([
      { matchId: "child-0", entry: "fresh" }, { matchId: "child-1", entry: "fresh" },
      { matchId: "child-2", entry: "fresh" }, { matchId: "child-3", entry: "fresh" },
    ]);
  });

  it("shows the ruleset tag and content above the canonical arena during play", async () => {
    const t = createFixtureTransport(FIVE_STAGE_DAY, {
      existing: wireRun(FIVE_STAGE_DAY, { current_stage_index: 3 }, {
        0: { status: "completed", result: wireResult() },
        1: { status: "completed", result: wireResult() },
        2: { status: "completed", result: wireResult() },
        3: { status: "in_progress", child_match_id: "child-3" },
      }),
    });
    mount(t);
    await flush();
    const chrome = within(screen.getByTestId("fake-stage-match")).getByTestId("daily-stage-chrome");
    expect(within(chrome).getByTestId("daily-stage-tag")).toHaveAttribute("data-stage-family", "special");
    expect(within(chrome).getByTestId("daily-stage-tag")).toHaveTextContent(/weak areas/i);
    expect(within(chrome).getByTestId("daily-stage-position")).toHaveTextContent("Stage 4 of 5");
    expect(within(chrome).getByTestId("daily-stage-content")).toHaveTextContent("Weak Areas — Jungle Timers");
    expect(screen.getByTestId("fake-stage-match")).toHaveAttribute("data-eyebrow", "Daily Challenge");
  });

  it("a perfect day closes with no Review: the last stage's result, then Perfect", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, {
      existing: wireRun(FOUR_STAGE_DAY, { current_stage_index: 2 }, {
        0: { status: "completed", result: wireResult({ misses: 0 }) },
        1: { status: "completed", result: wireResult({ misses: 0 }) },
      }),
    });
    mount(t);
    await flush();
    await playStage(t, wireResult({ correct: 10, answered: 10, misses: 0 }));
    expect(phase()).toBe("stage-result");
    expect(screen.getByTestId("daily-stage-result-perfect")).toBeInTheDocument();
    expect(q("daily-run-complete")).toBeNull();
    await flush(STAGE_RESULT_MS + 10);
    expect(phase()).toBe("complete");
    expect(screen.getByTestId("daily-run-complete")).toHaveAttribute("data-perfect", "true");
    expect(screen.getByTestId("daily-run-perfect")).toBeInTheDocument();
    expect(screen.getByTestId("daily-recap-3-result")).toHaveTextContent("Not needed");
    // Review was never launched.
    expect(t.calls).not.toContain("launch:3");
  });

  it("names why a governed stage ended", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, {
      existing: wireRun(FOUR_STAGE_DAY, {}, { 0: { status: "in_progress", child_match_id: "child-0" } }),
    });
    mount(t);
    await flush();
    t.finishActiveChild(wireResult({ ended_by: "time_bank_exhausted" }));
    await act(async () => { lastHost!.onMatchSettled({ matchId: "child-0", terminalReason: "combat", completionReason: "time_bank_exhausted" }); });
    await flush(10);
    expect(screen.getByTestId("daily-stage-result-ended")).toHaveTextContent("The bank ran out");
  });
});

describe("Survival shows mistakes left — never health", () => {
  it("renders the server's strike count as marks", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, {
      existing: wireRun(FOUR_STAGE_DAY, { current_stage_index: 2 }, {
        0: { status: "completed", result: wireResult() },
        1: { status: "completed", result: wireResult() },
        2: { status: "in_progress", child_match_id: "child-2", live: { strikes: { used: 1, max: 3 } } },
      }),
    });
    mount(t);
    await flush();
    const strikes = screen.getByTestId("daily-strikes");
    expect(strikes).toHaveAttribute("data-strikes-remaining", "2");
    expect(strikes).toHaveAccessibleName("2 of 3 mistakes left");
    expect(within(strikes).getAllByTestId("daily-strike-mark").map((m) => m.getAttribute("data-spent")))
      .toEqual(["true", "false", "false"]);
    expect(screen.getByTestId("daily-stage-chrome")).not.toHaveTextContent(/\bhp\b|health|damage/i);
  });

  it("shows the whole allowance before the server has reported a strike", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, {
      existing: wireRun(FOUR_STAGE_DAY, { current_stage_index: 2 }, {
        0: { status: "completed", result: wireResult() },
        1: { status: "completed", result: wireResult() },
        2: { status: "in_progress", child_match_id: "child-2" },
      }),
    });
    mount(t);
    await flush();
    expect(screen.getByTestId("daily-strikes")).toHaveAttribute("data-strikes-remaining", "3");
  });
});

describe("Time Trial shows the server's bank, held through non-answerable windows", () => {
  it("drains only while answering, and re-reads the server on each phase change", async () => {
    vi.setSystemTime(new Date("2026-09-21T12:00:00.000Z"));
    const asOf = new Date().toISOString();
    const t = createFixtureTransport(FOUR_STAGE_DAY, {
      existing: wireRun(FOUR_STAGE_DAY, {}, {
        0: { status: "in_progress", child_match_id: "child-0",
             live: { time_bank: { total_ms: 90_000, remaining_ms: 60_000, as_of: asOf, draining: true } } },
      }),
    });
    mount(t);
    await flush();
    const bank = () => screen.getByTestId("daily-time-bank");
    // The arena has not said a question is answerable: held at the server's number.
    expect(bank()).toHaveAttribute("data-bank-state", "held");
    expect(bank()).toHaveAttribute("data-bank-ms", "60000");
    await flush(3000);
    expect(bank()).toHaveAttribute("data-bank-ms", "60000");

    const reads = () => t.calls.filter((c) => c === "readRun").length;
    const before = reads();
    await act(async () => { lastHost!.onPresentationPhase!("answering"); });
    await flush(10);
    expect(reads()).toBe(before + 1);
    expect(bank()).toHaveAttribute("data-bank-state", "draining");
    // The re-read re-anchored as_of at "now" in the fixture: the projection
    // counts from the server's instant, not from mount.
    t.setLive({ time_bank: { total_ms: 90_000, remaining_ms: 60_000, as_of: new Date().toISOString(), draining: true } });
    await flush(500);
    await act(async () => { lastHost!.onPresentationPhase!("waiting"); });
    await act(async () => { lastHost!.onPresentationPhase!("answering"); });
    await flush(2000);
    const drained = Number(bank().getAttribute("data-bank-ms"));
    expect(drained).toBeLessThan(60_000);
    expect(drained).toBeGreaterThanOrEqual(57_500);

    // A reveal: the server says 52 s is left, and the display holds it.
    t.setLive({ time_bank: { total_ms: 90_000, remaining_ms: 52_000, as_of: new Date().toISOString(), draining: false } });
    await flush(500);
    await act(async () => { lastHost!.onPresentationPhase!("revealing"); });
    await flush(10);
    expect(bank()).toHaveAttribute("data-bank-state", "held");
    expect(bank()).toHaveAttribute("data-bank-ms", "52000");
    await flush(2500);
    expect(bank()).toHaveAttribute("data-bank-ms", "52000");
  });
});

describe("refresh lands on the server's current stage", () => {
  it("an in-progress stage remounts its child as a RECOVERY — no intro, no tag, no launch", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, {
      existing: wireRun(FOUR_STAGE_DAY, { current_stage_index: 1 }, {
        0: { status: "completed", result: wireResult() },
        1: { status: "in_progress", child_match_id: "child-1" },
      }),
    });
    mount(t);
    await flush();
    expect(phase()).toBe("stage-play");
    expect(q("daily-intro")).toBeNull();
    expect(q("daily-stage-intro")).toBeNull();
    expect(screen.getByTestId("fake-stage-match")).toHaveAttribute("data-match-id", "child-1");
    expect(screen.getByTestId("fake-stage-match")).toHaveAttribute("data-entry", "recovered");
    expect(t.calls.some((c) => c.startsWith("launch"))).toBe(false);
  });

  it("a child that finished while the page was gone is synced on its handback", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, {
      existing: wireRun(FOUR_STAGE_DAY, {}, { 0: { status: "in_progress", child_match_id: "child-0" } }),
    });
    t.finishActiveChild();
    mount(t);
    await flush();
    // The real arena hands a finished recovered match back on its first render.
    await act(async () => { lastHost!.onMatchSettled({ matchId: "child-0", terminalReason: "combat", completionReason: null }); });
    await flush(10);
    expect(t.calls).toContain("sync");
    expect(phase()).toBe("stage-result");
  });

  it("a pending stage plays its tag and launches", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, {
      existing: wireRun(FOUR_STAGE_DAY, { current_stage_index: 2 }, {
        0: { status: "completed", result: wireResult() },
        1: { status: "completed", result: wireResult() },
      }),
    });
    mount(t);
    await flush();
    expect(phase()).toBe("stage-intro");
    expect(q("daily-intro")).toBeNull();
    expect(t.calls).toContain("launch:2");
    await flush(STAGE_INTRO_MIN_MS + 10);
    expect(screen.getByTestId("fake-stage-match")).toHaveAttribute("data-entry", "fresh");
  });

  it("a finished day shows the completion, and replays nothing", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, {
      existing: wireRun(FOUR_STAGE_DAY, { status: "completed", outcome: "reviewed", current_stage_index: null }, {
        0: { status: "completed", result: wireResult() },
        1: { status: "completed", result: wireResult() },
        2: { status: "completed", result: wireResult() },
        3: { status: "completed", result: wireResult({ misses: 0 }) },
      }),
    });
    mount(t);
    await flush();
    expect(phase()).toBe("complete");
    expect(q("daily-stage-result")).toBeNull();
    expect(q("daily-intro")).toBeNull();
  });

  it("an untouched run is still an arrival: the Daily intro plays", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, { existing: wireRun(FOUR_STAGE_DAY) });
    mount(t);
    await flush();
    expect(phase()).toBe("daily-intro");
  });
});

describe("a stage that cannot open", () => {
  it("says so on its tag, and re-asks only when told to", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, { existing: wireRun(FOUR_STAGE_DAY, {}, {}) });
    // Skip the arrival intro: a run with stage 0 launched once and reverted.
    (t.wire().stages as Record<string, unknown>[])[0].status = "launching";
    t.failNextLaunch = true;
    mount(t);
    await flush(10);
    expect(phase()).toBe("stage-intro");
    expect(screen.getByTestId("daily-run-error")).toHaveTextContent("couldn't open");
    await flush(5000);
    expect(t.calls.filter((c) => c.startsWith("launch"))).toHaveLength(1);
    await act(async () => { screen.getByTestId("daily-run-retry").click(); });
    await flush(10);
    expect(t.calls.filter((c) => c.startsWith("launch"))).toHaveLength(2);
    expect(phase()).toBe("stage-play");
  });
});

describe("a guest's first Daily (owner decision: sign up at the END to save)", () => {
  const finishedDay = () => createFixtureTransport(FOUR_STAGE_DAY, {
    existing: wireRun(FOUR_STAGE_DAY, { status: "completed", outcome: "reviewed", current_stage_index: null }, {
      0: { status: "completed", result: wireResult() },
      1: { status: "completed", result: wireResult() },
      2: { status: "completed", result: wireResult() },
      3: { status: "completed", result: wireResult({ misses: 0 }) },
    }),
  });

  it("a guest starts the Daily with no signup step in front of it", async () => {
    mockAuth.user = { id: "guest-1", is_anonymous: true };
    const t = createFixtureTransport(FOUR_STAGE_DAY);
    mount(t);
    await flush();
    const begin = screen.getByRole("button", { name: /begin/i });
    await act(async () => { begin.click(); });
    await flush(10);
    expect(t.calls).toContain("startToday");
    expect(q("daily-save-gate")).toBeNull();
    expect(screen.queryByText(/create account/i)).toBeNull();
  });

  it("a guest's finished day ends on the signup-to-save gate, routed to the in-place upgrade", async () => {
    mockAuth.user = { id: "guest-1", is_anonymous: true };
    mount(finishedDay());
    await flush();
    expect(phase()).toBe("complete");
    const gate = screen.getByTestId("daily-save-gate");
    expect(within(gate).getByText("Save today's Daily Challenge")).toBeInTheDocument();
    expect(within(gate).getByRole("button", { name: "Create Account" })).toBeInTheDocument();
    // Saving is the point of the end of the first Daily: no guest dismissal.
    expect(within(gate).queryByRole("button", { name: /keep playing as guest/i })).toBeNull();
    // The recap is still the page behind it.
    expect(screen.getByTestId("daily-run-complete")).toBeInTheDocument();
  });

  it("a signed-in player's finished day has no save gate", async () => {
    mount(finishedDay());
    await flush();
    expect(phase()).toBe("complete");
    expect(q("daily-save-gate")).toBeNull();
  });
});

describe("DC-SURV-UX — Survival ends for the player at strike 3", () => {
  const survivalDay = (live: unknown = { strikes: { used: 2, max: 3 } }) => createFixtureTransport(FOUR_STAGE_DAY, {
    existing: wireRun(FOUR_STAGE_DAY, { current_stage_index: 2 }, {
      0: { status: "completed", result: wireResult() },
      1: { status: "completed", result: wireResult() },
      2: { status: "in_progress", child_match_id: "child-2", live },
    }),
  });

  it("shows answered and strikes out of 3 — never a module denominator", async () => {
    const t = survivalDay();
    mount(t);
    await flush();
    await act(async () => { lastHost!.onSurvivalStatus!({ answered: 12, strikesUsed: 2, maxStrikes: 3 }); });
    const chrome = screen.getByTestId("daily-stage-chrome");
    expect(within(chrome).getByTestId("daily-survival-answered")).toHaveTextContent("12 answered");
    expect(within(chrome).getByTestId("daily-strikes-count")).toHaveTextContent("2 / 3");
    expect(chrome).not.toHaveTextContent(/\/\s*175|of 175|\b12\s*\/\s*\d+/);
  });

  it("0/3, 1/3, 2/3 and 3/3 are distinguishable, from the server's ledger", async () => {
    const t = survivalDay(null);
    mount(t);
    await flush();
    const seen: string[] = [];
    for (const used of [0, 1, 2, 3]) {
      await act(async () => { lastHost!.onSurvivalStatus!({ answered: 4, strikesUsed: used, maxStrikes: 3 }); });
      const s = screen.getByTestId("daily-strikes");
      const spent = within(s).getAllByTestId("daily-strike-mark").map((m) => m.getAttribute("data-spent") === "true" ? "x" : "o").join("");
      seen.push(`${spent} ${screen.getByTestId("daily-strikes-count").textContent} ${s.getAttribute("data-strikes-out")}`);
    }
    expect(seen).toEqual(["ooo 0 / 3 false", "xoo 1 / 3 false", "xxo 2 / 3 false", "xxx 3 / 3 true"]);
  });

  it("player finished → the stage beat goes up at once; the parent advances only when the server does", async () => {
    const t = survivalDay();
    mount(t);
    await flush();
    expect(phase()).toBe("stage-play");
    const syncsBefore = t.calls.filter((c) => c === "sync").length;

    await act(async () => { lastHost!.onPlayerFinished!("child-2"); });
    // Immediately out of gameplay, into the Daily's own stage beat — pending.
    expect(phase()).toBe("stage-settling");
    const beat = screen.getByTestId("daily-stage-result");
    expect(beat).toHaveAttribute("data-pending", "true");
    expect(beat).not.toHaveTextContent(/victory|defeat/i);
    // The child stays connected, out of sight, so the server can settle it.
    const hidden = screen.getByTestId("daily-settling-child");
    expect(hidden).toHaveAttribute("hidden");
    expect(within(hidden).getByTestId("fake-stage-match")).toHaveAttribute("data-match-id", "child-2");
    // Nothing invented: no sync-driven advance, still on stage 3, no Review.
    await flush(5000);
    expect(t.calls.filter((c) => c === "sync").length).toBe(syncsBefore);
    expect(t.wire().current_stage_index).toBe(2);
    expect(q("daily-stage-intro")).toBeNull();

    // The server settles the child; the ordinary handback drives the sync.
    t.finishActiveChild(wireResult({ ended_by: "strikes_exhausted", correct: 9, answered: 12 }));
    await act(async () => { lastHost!.onMatchSettled({ matchId: "child-2", terminalReason: "combat", completionReason: "strikes_exhausted" }); });
    await flush(10);
    expect(phase()).toBe("stage-result");
    expect(q("daily-settling-child")).toBeNull();
    expect(screen.getByTestId("daily-stage-result-ended")).toHaveTextContent("Out of mistakes");
    expect(screen.getByTestId("daily-stage-result-next")).toHaveTextContent(/review/i);
    await flush(STAGE_RESULT_MS + 10);
    expect(phase()).toBe("stage-intro");
    expect(screen.getByTestId("daily-stage-intro")).toHaveAttribute("data-stage-kind", "review");
  });

  it("outside Survival the flow is unchanged: no settling child, ordinary handback", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, {
      existing: wireRun(FOUR_STAGE_DAY, {}, { 0: { status: "in_progress", child_match_id: "child-0" } }),
    });
    mount(t);
    await flush();
    expect(phase()).toBe("stage-play");
    expect(q("daily-survival-answered")).toBeNull();
    t.finishActiveChild(wireResult());
    await act(async () => { lastHost!.onMatchSettled({ matchId: "child-0", terminalReason: "combat", completionReason: null }); });
    await flush(10);
    expect(phase()).toBe("stage-result");
    expect(q("daily-settling-child")).toBeNull();
  });
});
