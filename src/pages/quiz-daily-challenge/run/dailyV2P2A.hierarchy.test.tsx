/**
 * DV2-P2A — THE LIVE DAILY V2 HIERARCHY.
 *
 * Proves the frontend reads and presents the plan-v5 contract (backend B1 +
 * B1.1, `ec3500d0`) while staying exactly as before against today's v4
 * backend:
 *
 *   A  the reader: `plan_version`, the MAIN pair, and its fail-closed rules
 *   B  hub status: main-complete may still be resumable; no all-stage count
 *   C  the page, end to end on a v5 day: opening (DV2-P2C) → Standard → MAIN result →
 *      More Challenges → Review → "All Done for Today"; "Done for now"
 *   D  recovery: a reload after main completion, and a live optional child
 *   E  the leave guard: main-complete with no live child is unguarded
 *   F  v4 is unchanged; nothing claims rank, streak or a leaderboard
 */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const guardActive = vi.hoisted(() => [] as boolean[]);
const mockAuth = vi.hoisted(() => ({
  user: { id: "userA", is_anonymous: false } as { id: string; is_anonymous: boolean },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockAuth }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
const sfxApi = vi.hoisted(() => ({ play: () => {}, stop: () => {}, preload: () => {} }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => sfxApi }));
vi.mock("@/pages/quiz-ranked/QuizRankedMatch", () => ({
  QuizRankedMatch: () => { throw new Error("the stand-in is injected in these tests"); },
}));
vi.mock("@/lib/navigation/useTransactionalLeaveGuard", () => ({
  useTransactionalLeaveGuard: ({ copy, active }: { copy: unknown; active: boolean }) => {
    guardActive.push(active);
    return {
      kind: "daily_run", copy, state: "unblocked", confirmationOpen: false,
      pendingLocation: null, stay: vi.fn(), leave: vi.fn(), runWithBypass: vi.fn(),
    };
  },
}));

import type { MatchHost } from "@/lib/ranked-core/flow/matchHost";
import {
  DailyRunParseError, MAIN_DAILY_PLAN_VERSION, hasMainDaily, isMainDailyComplete, readDailyRun,
} from "@/lib/daily-challenge/run/contracts";
import {
  FIVE_STAGE_DAY, FOUR_STAGE_DAY, V5_ELIGIBLE_DAY, V5_INELIGIBLE_DAY, createFixtureTransport,
  fixtureRun, fixtureV5Run, wireResult, wireRun, wireV5Run, type FixtureTransport,
} from "@/lib/daily-challenge/run/fixtures";
import { DAILY_START_STATE } from "@/lib/daily-challenge/run/entry";
import { DAILY_INTRO_MS, STAGE_INTRO_MIN_MS, type DailyFlowView } from "@/lib/daily-challenge/run/flow";
import { DAILY_STAGE_CATEGORY, dailySection, dailySections } from "@/lib/daily-challenge/run/stageCategory";
import { buildDailyMainResult, stagePositionLabel } from "@/lib/daily-challenge/run/stageResultModel";
import { dailyStatusFrom } from "@/lib/daily-challenge/status";
import { DailyCompletion } from "./DailyCompletion";
import { DailyMainResult } from "./DailyMainResult";
import { DailyIntroBeat } from "./DailyRunBeats";
import { DailyRunPage, type StageMatchProps } from "./DailyRunPage";
import { dailyLeaveCopy, hasLiveDailyChild, shouldGuardDailyLeave } from "./dailyLeaveContract";

// ── helpers ────────────────────────────────────────────────────────────────

let lastHost: MatchHost | null = null;
const mounts: { matchId: string; entry: string }[] = [];
function FakeStageMatch({ matchId, entry, chrome, host }: StageMatchProps) {
  lastHost = host;
  if (!mounts.some((m) => m.matchId === matchId)) mounts.push({ matchId, entry });
  return <div data-testid="fake-stage-match" data-match-id={matchId} data-entry={entry}>{chrome}</div>;
}

const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const phase = () => screen.getAllByTestId("daily-run")[0].getAttribute("data-flow-phase");
const q = (id: string) => screen.queryByTestId(id);
const click = async (id: string) => {
  await act(async () => { screen.getByTestId(id).click(); });
  await flush(10);
};
const launches = (t: FixtureTransport) => t.calls.filter((c) => c.startsWith("launch"));
/** No whole-day stage count, anywhere on the page. */
const NO_GLOBAL_COUNT = /Stage \d+ of \d+|\d+ stages today|Final stage/;
const NO_FAKE_AUTHORITY = /\brank(ed)?\b|percentile|\btier\b|streak|leaderboard|personal best/i;

function mount(t: FixtureTransport, { play = true }: { play?: boolean } = {}) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/quiz/daily-challenge",
      state: play ? DAILY_START_STATE : null }]}>
      <Routes>
        <Route path="/quiz/daily-challenge"
          element={<DailyRunPage transport={t} StageMatch={FakeStageMatch} viewerUserId="userA" />} />
        <Route path="/quiz" element={<div data-testid="hub-stand-in" />} />
      </Routes>
    </MemoryRouter>);
}

async function playStage(t: FixtureTransport, result = wireResult()) {
  await flush(STAGE_INTRO_MIN_MS + 50);
  expect(phase()).toBe("stage-play");
  t.finishActiveChild(result);
  const id = q("fake-stage-match")!.getAttribute("data-match-id")!;
  await act(async () => { lastHost!.onMatchSettled({ matchId: id, terminalReason: "combat", completionReason: null }); });
  await flush(10);
}

/** A v5 eligible day with Standard settled (main frozen) and the run at stage 1. */
const mainCompleteWire = (over: Record<string, unknown> = {}, stages: Record<number, Record<string, unknown>> = {}) =>
  wireV5Run(V5_ELIGIBLE_DAY, {
    current_stage_index: 1, main_completed_at: "2026-10-08T12:00:00Z", main_score: 1234, ...over,
  }, { 0: { status: "completed", child_match_id: "m0", result: wireResult({ score: 16 }) }, ...stages });

beforeEach(() => {
  mockAuth.user = { id: "userA", is_anonymous: false };
  vi.useFakeTimers({ shouldAdvanceTime: false });
  lastHost = null;
  mounts.length = 0;
  guardActive.length = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ── A — the reader ─────────────────────────────────────────────────────────

describe("A — the live-run reader", () => {
  it("parses today's v4 payload exactly as before: legacy, no main fields", () => {
    const run = fixtureRun(FIVE_STAGE_DAY, { plan_version: 4 });
    expect(run.planVersion).toBe(4);
    expect(hasMainDaily(run)).toBe(false);
    expect(run.mainCompletedAt).toBeNull();
    expect(run.mainScore).toBeNull();
    expect(isMainDailyComplete(run)).toBe(false);
  });

  it("reads a payload with no plan_version as legacy", () => {
    const wire = wireRun(FOUR_STAGE_DAY);
    delete wire.plan_version;
    const run = readDailyRun(wire);
    expect(run.planVersion).toBeNull();
    expect(hasMainDaily(run)).toBe(false);
  });

  it("switches on plan_version alone: v5 kinds at v4 stay legacy", () => {
    expect(MAIN_DAILY_PLAN_VERSION).toBe(5);
    expect(hasMainDaily(fixtureRun(V5_ELIGIBLE_DAY, { plan_version: 4 }))).toBe(false);
    expect(hasMainDaily(fixtureV5Run(V5_ELIGIBLE_DAY))).toBe(true);
  });

  it("a v5 run before Standard settles has no main completion", () => {
    for (const day of [V5_ELIGIBLE_DAY, V5_INELIGIBLE_DAY]) {
      const run = fixtureV5Run(day);
      expect(run.mainCompletedAt).toBeNull();
      expect(run.mainScore).toBeNull();
      expect(isMainDailyComplete(run)).toBe(false);
    }
    // Absent (not just null) main fields read the same way.
    const wire = wireV5Run(V5_ELIGIBLE_DAY);
    delete wire.main_completed_at; delete wire.main_score;
    expect(isMainDailyComplete(readDailyRun(wire))).toBe(false);
  });

  it("a v5 run after Standard reads the server's main pair, never the stage's score", () => {
    const run = readDailyRun(mainCompleteWire());
    expect(isMainDailyComplete(run)).toBe(true);
    expect(run.mainCompletedAt).toBe("2026-10-08T12:00:00Z");
    expect(run.mainScore).toBe(1234);
    expect(run.stages[0].result?.score).toBe(16);
    // A genuine zero is a score, not an absence.
    expect(readDailyRun(mainCompleteWire({ main_score: 0 })).mainScore).toBe(0);
  });

  it("refuses half a main pair instead of fabricating the other half", () => {
    expect(() => readDailyRun(mainCompleteWire({ main_score: null }))).toThrow(DailyRunParseError);
    expect(() => readDailyRun(mainCompleteWire({ main_completed_at: null }))).toThrow(DailyRunParseError);
    const absent = mainCompleteWire();
    delete absent.main_score;
    expect(() => readDailyRun(absent)).toThrow(/together/);
  });

  it.each([
    ["negative", -1], ["fractional", 12.5], ["string", "1234"], ["boolean", true], ["object", {}],
  ])("refuses a %s main_score", (_label, bad) => {
    expect(() => readDailyRun(mainCompleteWire({ main_score: bad }))).toThrow(DailyRunParseError);
  });

  it.each([["number", 1700000000], ["empty", ""], ["boolean", true]])("refuses a %s main_completed_at", (_l, bad) => {
    expect(() => readDailyRun(mainCompleteWire({ main_completed_at: bad }))).toThrow(DailyRunParseError);
  });

  it("never infers main completion from Standard's status, nor the reverse", () => {
    // Standard completed, pair missing: corrupt, refused (not "probably done").
    expect(() => readDailyRun(mainCompleteWire({ main_completed_at: null, main_score: null })))
      .toThrow(/exactly when Standard is completed/);
    // Pair present, Standard not completed: refused too.
    expect(() => readDailyRun(wireV5Run(V5_ELIGIBLE_DAY, {
      main_completed_at: "2026-10-08T12:00:00Z", main_score: 5 }))).toThrow(DailyRunParseError);
  });

  it("refuses a v5 order that does not run Today → More Challenges → Review", () => {
    const swap = [V5_ELIGIBLE_DAY[1], V5_ELIGIBLE_DAY[0], ...V5_ELIGIBLE_DAY.slice(2)];
    expect(() => fixtureV5Run(swap)).toThrow(/one Standard, first/);
    const weakAmongBonus = [V5_ELIGIBLE_DAY[0], V5_ELIGIBLE_DAY[1], V5_ELIGIBLE_DAY[3], V5_ELIGIBLE_DAY[2],
      V5_ELIGIBLE_DAY[4]];
    expect(() => fixtureV5Run(weakAmongBonus)).toThrow(/Today, then More Challenges, then Review/);
    // Either bonus order is the server's, and is kept as sent.
    const ttSecond = [V5_ELIGIBLE_DAY[0], V5_ELIGIBLE_DAY[2], V5_ELIGIBLE_DAY[1], ...V5_ELIGIBLE_DAY.slice(3)];
    expect(fixtureV5Run(ttSecond).stages.map((s) => s.kind))
      .toEqual(["standard", "survival", "time_trial", "weak_areas", "review"]);
  });

  it("does not validate legacy runs by the v5 rules, and ignores their main fields", () => {
    const run = fixtureRun(FOUR_STAGE_DAY, { plan_version: 4, main_completed_at: "x", main_score: "bad" });
    expect(run.stages[0].kind).toBe("time_trial");
    expect(run.mainCompletedAt).toBeNull();
    expect(run.mainScore).toBeNull();
  });

  it("does not read main_complete (the backend deliberately sends none)", () => {
    const run = readDailyRun(mainCompleteWire({ main_complete: false }));
    expect(isMainDailyComplete(run)).toBe(true);
    expect(run).not.toHaveProperty("mainComplete");
  });
});

// ── sections ───────────────────────────────────────────────────────────────

describe("sections", () => {
  it("files Time Trial + Survival under More Challenges and Weak Areas + Recently Missed under Review", () => {
    expect(dailySection({ kind: "standard" })).toBe("today");
    expect(dailySection({ kind: "time_trial" })).toBe("more");
    expect(dailySection({ kind: "survival" })).toBe("more");
    expect(dailySection({ kind: "weak_areas" })).toBe("review");
    expect(dailySection({ kind: "review" })).toBe("review");
    expect(Object.keys(DAILY_STAGE_CATEGORY)).toHaveLength(6);
  });

  it("groups without reordering, and leaves out a section with nothing in it", () => {
    const groups = dailySections(fixtureV5Run(V5_ELIGIBLE_DAY));
    expect(groups.map((g) => [g.label, g.stages.map((s) => s.kind)])).toEqual([
      ["Today's Challenge", ["standard"]],
      ["More Challenges", ["time_trial", "survival"]],
      ["Review", ["weak_areas", "review"]],
    ]);
    expect(groups.flatMap((g) => g.stages.map((s) => s.index))).toEqual([0, 1, 2, 3, 4]);
    expect(dailySections(fixtureV5Run(V5_INELIGIBLE_DAY))[2].stages.map((s) => s.kind)).toEqual(["review"]);
  });

  it("names a v5 stage's place by its section, a legacy one by its number", () => {
    const v5 = fixtureV5Run(V5_ELIGIBLE_DAY);
    expect(v5.stages.map((s) => stagePositionLabel(v5, s))).toEqual([
      "Today's Challenge", "More Challenges", "More Challenges", "Review", "Review"]);
    const v4 = fixtureRun(FIVE_STAGE_DAY, { plan_version: 4 });
    expect(stagePositionLabel(v4, v4.stages[1])).toBe("Stage 2 of 5");
  });
});

// ── B — hub status ─────────────────────────────────────────────────────────

describe("B — hub status", () => {
  it("v4 status is unchanged", () => {
    const run = fixtureRun(FOUR_STAGE_DAY, { plan_version: 4, current_stage_index: 1 }, {
      0: { status: "completed", result: wireResult() } });
    expect(dailyStatusFrom(run)).toEqual({ known: true, completed: false, resumable: true,
      optionalOpen: false, resolved: 1, total: 4, streak: null, theme: null });
  });

  it("v5 before Standard: not complete, resumable, no all-stage count", () => {
    expect(dailyStatusFrom(fixtureV5Run(V5_ELIGIBLE_DAY))).toEqual({ known: true, completed: false,
      resumable: true, optionalOpen: false, resolved: null, total: null, streak: null, theme: null });
  });

  it("v5 main-complete: complete AND resumable, with optional content open", () => {
    expect(dailyStatusFrom(readDailyRun(mainCompleteWire()))).toMatchObject({
      completed: true, resumable: true, optionalOpen: true, resolved: null, total: null });
  });

  it("v5 fully finished: complete, nothing open", () => {
    const wire = mainCompleteWire({ status: "completed", outcome: "reviewed", current_stage_index: null },
      Object.fromEntries([1, 2, 3, 4].map((i) => [i, { status: "completed", result: wireResult() }])));
    expect(dailyStatusFrom(readDailyRun(wire))).toMatchObject({
      completed: true, resumable: false, optionalOpen: false, resolved: null });
  });
});

// ── C — the page, end to end on a v5 day ───────────────────────────────────

describe("C — a v5 Daily, end to end", () => {
  it("Standard is the Daily; its MAIN result comes first; the rest is optional and sectioned", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5 });
    mount(t);
    await flush();

    // DV2-P2C — one opening beat: Standard's tag, drawn as "Daily Challenge"
    // alone (no separate Daily intro, no lineup, no count). See
    // dailyV2P2C.opening.test.tsx for the full proof.
    expect(phase()).toBe("stage-intro");
    expect(q("daily-intro")).toBeNull();
    const opening = screen.getByTestId("daily-stage-intro");
    expect(opening).toHaveAttribute("data-opening", "main");
    expect(opening.textContent).toBe("Daily Challenge");
    expect(document.body.textContent).not.toMatch(NO_GLOBAL_COUNT);

    // Gameplay: the header names Today's Challenge again.
    await flush(STAGE_INTRO_MIN_MS + 50);
    expect(screen.getByTestId("daily-stage-position")).toHaveTextContent("Today's Challenge");
    expect(document.body.textContent).not.toMatch(NO_GLOBAL_COUNT);

    // Standard settles: the parent freezes main_score from the child's score.
    await playStage(t, wireResult({ correct: 9, answered: 10, score: 1234, misses: 1 }));
    expect(phase()).toBe("stage-result");
    const main = screen.getByTestId("daily-main-result");
    expect(q("daily-stage-result")).toBeNull();
    expect(within(main).getByTestId("result-headline")).toHaveTextContent("Today's Challenge");
    expect(within(main).getByTestId("result-subheading")).toHaveTextContent("Complete");
    expect(within(main).getByTestId("daily-main-score")).toHaveTextContent("1,234");
    expect(within(main).getByTestId("daily-main-correct")).toHaveTextContent("9 / 10");
    expect(within(main).getByTestId("daily-main-accuracy")).toHaveTextContent("90%");
    // Optional content is offered as optional, and nothing optional has started.
    expect(within(main).getByTestId("daily-main-optional")).toHaveTextContent(/optional/i);
    expect(within(main).getByTestId("daily-main-optional")).toHaveTextContent(/nothing here changes your daily score/i);
    expect(within(within(main).getByTestId("daily-main-optional-more")).getAllByTestId("daily-stage-tag")
      .map((el) => el.getAttribute("data-stage-kind"))).toEqual(["time_trial", "survival"]);
    expect(within(within(main).getByTestId("daily-main-optional-review")).getAllByTestId("daily-stage-tag")
      .map((el) => el.getAttribute("data-stage-kind"))).toEqual(["weak_areas", "review"]);
    expect(launches(t)).toEqual(["launch:0"]);
    expect(screen.getByTestId("daily-main-continue")).toHaveTextContent("Play More Challenges");
    expect(screen.getByTestId("daily-done-for-now")).toHaveTextContent("Done for now");
    expect(main.textContent).not.toMatch(NO_FAKE_AUTHORITY);
    expect(document.body.textContent).not.toMatch(NO_GLOBAL_COUNT);

    // More Challenges: section-scoped, optional, in the server's order.
    await click("daily-main-continue");
    expect(phase()).toBe("stage-intro");
    expect(screen.getByTestId("daily-stage-intro")).toHaveAttribute("data-stage-kind", "time_trial");
    expect(screen.getByTestId("daily-stage-intro")).toHaveAttribute("data-section", "more");
    expect(screen.getByTestId("daily-stage-intro-position")).toHaveTextContent("More Challenges · Optional");
    await playStage(t, wireResult({ score: 999 }));
    const tt = screen.getByTestId("daily-stage-result");
    expect(within(tt).getByTestId("result-eyebrow")).toHaveTextContent("More Challenges");
    expect(within(tt).getByTestId("daily-section-ladder")).toBeInTheDocument();
    expect(within(tt).queryByTestId("daily-stage-ladder")).toBeNull();
    expect(within(tt).getByTestId("daily-done-for-now")).toHaveTextContent("Done for now");
    expect(document.body.textContent).not.toMatch(NO_GLOBAL_COUNT);
    // The optional score never touches the main one.
    expect(t.wire().main_score).toBe(1234);

    await click("daily-stage-result-continue");
    expect(screen.getByTestId("daily-stage-intro")).toHaveAttribute("data-stage-kind", "survival");
    await playStage(t);
    await click("daily-stage-result-continue");

    // Review: Weak Areas, then Recently Missed, each with its own sentence.
    const wa = screen.getByTestId("daily-stage-intro");
    expect(wa).toHaveAttribute("data-stage-kind", "weak_areas");
    expect(within(wa).getByTestId("daily-stage-intro-position")).toHaveTextContent("Review · Optional");
    expect(within(wa).getByTestId("daily-stage-intro-rule")).toHaveTextContent(
      "From your history — fresh questions from areas you've struggled with before.");
    await playStage(t);
    await click("daily-stage-result-continue");
    const rm = screen.getByTestId("daily-stage-intro");
    expect(rm).toHaveAttribute("data-stage-kind", "review");
    expect(within(rm).getByTestId("daily-stage-tag")).toHaveTextContent(/recently missed/i);
    expect(within(rm).getByTestId("daily-stage-intro-rule")).toHaveTextContent(
      "From today — retry the knowledge you missed in this Daily.");
    expect(rm.textContent).not.toMatch(/another daily game/i);
    await playStage(t);
    expect(screen.getByTestId("daily-stage-result-continue")).toHaveTextContent("See today's recap");
    await click("daily-stage-result-continue");

    // The close: everything available is done — not "the Daily just finished".
    expect(phase()).toBe("complete");
    const done = screen.getByTestId("daily-run-complete");
    expect(within(done).getByTestId("daily-run-complete-title")).toHaveTextContent("All Done for Today");
    expect(done).not.toHaveTextContent("Daily Challenge Complete");
    expect(within(done).getByTestId("daily-run-complete-note")).toHaveTextContent(/already complete/);
    expect(within(done).getByTestId("daily-recap-main-score")).toHaveTextContent("1,234");
    expect(within(done).getByTestId("daily-recap-section-today")).toHaveTextContent(/standard/i);
    expect(within(within(done).getByTestId("daily-recap-section-more")).getAllByRole("listitem")
      .map((li) => li.getAttribute("data-stage-kind"))).toEqual(["time_trial", "survival"]);
    expect(within(within(done).getByTestId("daily-recap-section-review")).getAllByRole("listitem")
      .map((li) => li.getAttribute("data-stage-kind"))).toEqual(["weak_areas", "review"]);
    expect(done.textContent).not.toMatch(NO_FAKE_AUTHORITY);
    expect(launches(t)).toEqual(["launch:0", "launch:1", "launch:2", "launch:3", "launch:4"]);
  });

  it("'Done for now' on the main result only leaves: no server call, the run stays open", async () => {
    const t = createFixtureTransport(V5_INELIGIBLE_DAY, { planVersion: 5 });
    mount(t);
    await flush(DAILY_INTRO_MS + 10);
    await playStage(t, wireResult({ score: 40 }));
    expect(q("daily-main-result")).toBeInTheDocument();
    const before = [...t.calls];
    await click("daily-done-for-now");
    expect(q("hub-stand-in")).toBeInTheDocument();
    expect(t.calls).toEqual(before);
    expect(t.wire().status).toBe("active");
    expect(t.wire().current_stage_index).toBe(1);
  });

  it("an ineligible v5 day has no Weak Areas and still never reorders", async () => {
    const run = fixtureV5Run(V5_INELIGIBLE_DAY);
    expect(run.stages.map((s) => s.kind)).toEqual(["standard", "time_trial", "survival", "review"]);
    render(<MemoryRouter><DailyIntroBeat run={run} /></MemoryRouter>);
    expect(document.body.textContent).not.toMatch(NO_GLOBAL_COUNT);
  });
});

// ── main result unit ───────────────────────────────────────────────────────

describe("the main result", () => {
  it("uses run.mainScore as the headline score, and Standard's own result for the snapshot", () => {
    const run = readDailyRun(mainCompleteWire());
    const model = buildDailyMainResult(run, run.stages[0]);
    expect(model.score).toMatchObject({ you: 1234, label: "Daily score" });
    expect(model.snapshot!.map((s) => s.key)).toEqual(["correct", "accuracy", "misses"]);
    expect(model.snapshot!.some((s) => s.value === "16")).toBe(false);
  });

  it("pending: same headline, no figure, both actions held in place", () => {
    const run = fixtureV5Run(V5_ELIGIBLE_DAY, {}, { 0: { status: "in_progress", child_match_id: "child-0" } });
    render(<MemoryRouter><DailyMainResult run={run} stage={run.stages[0]} onDone={() => {}} /></MemoryRouter>);
    const main = screen.getByTestId("daily-main-result");
    expect(main).toHaveAttribute("data-pending", "true");
    expect(within(main).getByTestId("result-headline")).toHaveTextContent("Today's Challenge");
    expect(within(main).getByTestId("result-subheading")).toHaveTextContent("Scoring…");
    expect(within(main).getByTestId("result-score-reserve")).toBeInTheDocument();
    expect(within(main).queryByTestId("daily-main-score")).toBeNull();
    expect(screen.getByTestId("daily-main-continue")).toBeDisabled();
    expect(screen.getByTestId("daily-done-for-now")).toBeDisabled();
    expect(within(main).getByTestId("daily-main-optional")).toBeInTheDocument();
  });
});

// ── D — recovery ───────────────────────────────────────────────────────────

describe("D — recovery after main completion", () => {
  it("a reload lands on the optional entry: no Standard replay, no main result replay, nothing launched", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5, existing: mainCompleteWire() });
    mount(t, { play: false });
    await flush(DAILY_INTRO_MS + STAGE_INTRO_MIN_MS + 100);
    expect(phase()).toBe("optional-entry");
    expect(q("daily-main-result")).toBeNull();
    expect(q("daily-intro")).toBeNull();
    expect(launches(t)).toEqual([]);
    const entry = screen.getByTestId("daily-optional-entry");
    expect(entry).toHaveAttribute("data-section", "more");
    expect(within(entry).getByTestId("daily-optional-entry-score")).toHaveTextContent("1,234");
    expect(within(entry).getByTestId("daily-optional-entry-next")).toHaveTextContent(/time trial/i);
    expect(within(entry).getByTestId("daily-section-ladder")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(NO_GLOBAL_COUNT);
    expect(entry.textContent).not.toMatch(NO_FAKE_AUTHORITY);

    // Continue resumes at the backend's current optional stage.
    await click("daily-optional-continue");
    expect(phase()).toBe("stage-intro");
    expect(screen.getByTestId("daily-stage-intro")).toHaveAttribute("data-stage-kind", "time_trial");
    expect(launches(t)).toEqual(["launch:1"]);
  });

  it("a reload onto Review names it Review, not More Challenges", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5, existing: mainCompleteWire(
      { current_stage_index: 3 },
      { 1: { status: "completed", result: wireResult() }, 2: { status: "completed", result: wireResult() } }) });
    mount(t, { play: false });
    await flush(10);
    expect(screen.getByTestId("daily-optional-entry")).toHaveAttribute("data-section", "review");
    expect(screen.getByTestId("daily-optional-continue")).toHaveTextContent("Start Review");
  });

  it("'Done for now' on the entry leaves without a call", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5, existing: mainCompleteWire() });
    mount(t, { play: false });
    await flush(10);
    const before = [...t.calls];
    await click("daily-done-for-now");
    expect(q("hub-stand-in")).toBeInTheDocument();
    expect(t.calls).toEqual(before);
  });

  it("a live optional child keeps the existing recovery: remounted, recovered, no entry screen", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5, existing: mainCompleteWire({},
      { 1: { status: "in_progress", child_match_id: "child-1" } }) });
    mount(t, { play: false });
    await flush(10);
    expect(phase()).toBe("stage-play");
    expect(mounts).toEqual([{ matchId: "child-1", entry: "recovered" }]);
    expect(q("daily-optional-entry")).toBeNull();
    expect(launches(t)).toEqual([]);
  });

  it("the hub's resume (start intent) on a main-complete day creates nothing", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5, existing: mainCompleteWire() });
    mount(t, { play: true });
    await flush(10);
    expect(phase()).toBe("optional-entry");
    expect(t.calls).not.toContain("startToday");
  });
});

// ── E — the leave guard ────────────────────────────────────────────────────

describe("E — leaving", () => {
  const view = (run: ReturnType<typeof readDailyRun>, phase: DailyFlowView["phase"],
                settling: string | null = null): DailyFlowView => ({
    phase, stage: run.currentStageIndex === null ? null : run.stages[run.currentStageIndex],
    childMatchId: phase === "stage-play" ? run.stages[run.currentStageIndex ?? 0].childMatchId : null,
    settlingChildMatchId: settling,
  });

  it("v5 before main completion is guarded like the legacy Daily, with truthful copy", () => {
    const run = fixtureV5Run(V5_ELIGIBLE_DAY);
    expect(shouldGuardDailyLeave(run, view(run, "stage-intro"))).toBe(true);
    const copy = dailyLeaveCopy(run, view(run, "stage-intro"));
    expect(copy.title).toBe("Exit Daily Challenge?");
    expect(String(copy.body)).toContain("Today's Challenge isn't finished yet");
    const live = fixtureV5Run(V5_ELIGIBLE_DAY, {}, { 0: { status: "in_progress", child_match_id: "child-0" } });
    expect(String(dailyLeaveCopy(live, view(live, "stage-play")).body)).toContain("about 45 seconds");
  });

  it.each(["stage-result", "optional-entry", "stage-intro"] as const)(
    "main-complete with no live child is unguarded (%s)", (p) => {
      const run = readDailyRun(mainCompleteWire());
      expect(hasLiveDailyChild(run, view(run, p))).toBe(false);
      expect(shouldGuardDailyLeave(run, view(run, p))).toBe(false);
    });

  it("a live optional child is still guarded, with the 45-second consequence", () => {
    const run = readDailyRun(mainCompleteWire({}, { 1: { status: "in_progress", child_match_id: "child-1" } }));
    for (const p of ["stage-intro", "stage-play"] as const) {
      expect(shouldGuardDailyLeave(run, view(run, p))).toBe(true);
    }
    const copy = dailyLeaveCopy(run, view(run, "stage-play"));
    expect(copy.title).toBe("Leave Time Trial?");
    expect(String(copy.body)).toContain("Today's Daily is complete and saved");
    expect(String(copy.body)).toContain("about 45 seconds");
    // A Survival child hidden while it settles is live; a plain handback is not.
    expect(shouldGuardDailyLeave(run, view(run, "stage-settling", "child-1"))).toBe(true);
    expect(shouldGuardDailyLeave(run, view(run, "stage-settling"))).toBe(false);
  });

  it("legacy runs keep the whole-run guard", () => {
    const run = fixtureRun(FOUR_STAGE_DAY, { plan_version: 4, current_stage_index: 1 }, {
      0: { status: "completed", result: wireResult() } });
    expect(shouldGuardDailyLeave(run, view(run, "stage-result"))).toBe(true);
    expect(dailyLeaveCopy(run, view(run, "stage-intro")).title).toBe("Exit Daily Challenge?");
  });

  it("the page turns the guard off once the main result is up, and on again for a live optional child", async () => {
    const t = createFixtureTransport(V5_INELIGIBLE_DAY, { planVersion: 5 });
    mount(t);
    await flush(DAILY_INTRO_MS + 10);
    expect(guardActive.at(-1)).toBe(true);
    await playStage(t);
    expect(q("daily-main-result")).toBeInTheDocument();
    expect(guardActive.at(-1)).toBe(false);
    await click("daily-main-continue");
    await flush(STAGE_INTRO_MIN_MS + 50);
    expect(phase()).toBe("stage-play");
    expect(guardActive.at(-1)).toBe(true);
    // The header's way out reads as a pause, not an exit from an unfinished Daily.
    expect(screen.getByRole("link", { name: "Done for now" })).toBeInTheDocument();
  });
});

// ── F — v4 unchanged, no invented authority ────────────────────────────────

describe("F — the v4 Daily is unchanged", () => {
  it("v4 intro, stage tag, result and completion keep the linear presentation", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY);
    mount(t);
    await flush();
    expect(screen.getByTestId("daily-intro")).toHaveTextContent("4 stages today");
    expect(within(screen.getByTestId("daily-intro")).getByTestId("daily-stage-ladder")).toBeInTheDocument();
    await flush(DAILY_INTRO_MS + 10);
    expect(screen.getByTestId("daily-stage-intro-position")).toHaveTextContent("Stage 1 of 4");
    // A legacy Standard (here at index 1) is just a stage: no main result.
    for (let i = 0; i < 3; i++) {
      await playStage(t);
      expect(q("daily-main-result")).toBeNull();
      expect(q("daily-done-for-now")).toBeNull();
      await click("daily-stage-result-continue");
    }
    await playStage(t);
    expect(screen.getByTestId("daily-stage-result-continue")).toHaveTextContent("See today's results");
    await click("daily-stage-result-continue");
    expect(screen.getByTestId("daily-run-complete-title")).toHaveTextContent("Daily Challenge Complete");
    expect(q("daily-recap-section-today")).toBeNull();
  });

  it("the v5 completion's guest save gate still appears, after the recap", () => {
    mockAuth.user = { id: "guest", is_anonymous: true };
    const wire = mainCompleteWire({ status: "completed", outcome: "reviewed", current_stage_index: null },
      Object.fromEntries([1, 2, 3, 4].map((i) => [i, { status: "completed", result: wireResult() }])));
    render(<MemoryRouter><DailyCompletion run={readDailyRun(wire)} saveRequired /></MemoryRouter>);
    expect(screen.getByTestId("daily-save-gate")).toBeInTheDocument();
    expect(screen.getByTestId("daily-run-recap")).toBeInTheDocument();
    expect(screen.getByTestId("daily-run-complete").textContent).not.toMatch(NO_FAKE_AUTHORITY);
  });

  it("the guest's main result is never covered by the save gate", async () => {
    mockAuth.user = { id: "guest", is_anonymous: true };
    const t = createFixtureTransport(V5_INELIGIBLE_DAY, { planVersion: 5 });
    mount(t);
    await flush(DAILY_INTRO_MS + 10);
    await playStage(t);
    expect(q("daily-main-result")).toBeInTheDocument();
    expect(q("daily-save-gate")).toBeNull();
  });
});
