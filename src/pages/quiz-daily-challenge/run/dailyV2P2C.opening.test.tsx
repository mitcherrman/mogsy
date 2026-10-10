/**
 * DV2-P2C — ONE OPENING BEAT ON A V5 DAILY.
 *
 * A fresh plan-v5 Daily used to open with two beats in a row: the Daily intro
 * (date, Today's Challenge, Standard, content, rule, "More Challenges and
 * Review open after") and then Standard's own tag. Now it opens with ONE:
 * Standard's tag, drawn as the Daily's opening — "Daily Challenge", nothing
 * else — and that tag still covers Standard's launch exactly as before.
 *
 * Drives the REAL controller (`useDailyRun`) through the page with the
 * in-memory backend, and proves:
 *   * fresh v5 (Play, a reload onto an untouched run, Try again on a failed
 *     start): one beat, never `daily-intro`, and it says only the title;
 *   * Standard launches once, behind that beat, and plays as a fresh entry
 *     only after the tag's minimum — the clock never starts behind it;
 *   * a failed launch keeps its error and Try again on the opening;
 *   * recovery of a live Standard child replays no beat;
 *   * optional stages keep their mode-naming tags;
 *   * v1–v4 keep the Daily intro, then the stage tag, launch held behind both.
 */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "userA", is_anonymous: false } }) }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
const sfxApi = vi.hoisted(() => ({ play: () => {}, stop: () => {}, preload: () => {} }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => sfxApi }));
vi.mock("@/pages/quiz-ranked/QuizRankedMatch", () => ({
  QuizRankedMatch: () => { throw new Error("the stand-in is injected in these tests"); },
}));
const guardActive = vi.hoisted(() => [] as boolean[]);
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
import { DailyRunApiError } from "@/lib/daily-challenge/run/client";
import { readDailyRun } from "@/lib/daily-challenge/run/contracts";
import {
  FOUR_STAGE_DAY, V5_ELIGIBLE_DAY, createFixtureTransport, fixtureRun, fixtureV5Run, wireResult,
  wireRun, wireV5Run, type FixtureStageSpec, type FixtureTransport,
} from "@/lib/daily-challenge/run/fixtures";
import { DAILY_START_STATE } from "@/lib/daily-challenge/run/entry";
import {
  DAILY_INTRO_MS, STAGE_INTRO_MIN_MS, isDailyOpeningStage, opensWithDailyIntro,
} from "@/lib/daily-challenge/run/flow";
import { stageIdentity } from "@/lib/daily-challenge/run/stageIdentity";
import { DailyRunPage, type StageMatchProps } from "./DailyRunPage";

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
const launches = (t: FixtureTransport) => t.calls.filter((c) => c.startsWith("launch"));

/** A v5 day whose Standard has a real content line, so "no content line" is a claim. */
const V5_WITH_CONTENT: FixtureStageSpec[] = [
  { kind: "standard", ruleset: { ruleset_id: "standard" }, content: { title: "Champion Mastery", focus: "Ahri" } },
  ...V5_ELIGIBLE_DAY.slice(1),
];
const STANDARD_RULE = stageIdentity({ kind: "standard", ruleset: null }).rule;

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

/**
 * Step the clock until gameplay, recording every distinct beat the player
 * saw on the way (consecutive duplicates collapsed). Fails rather than loops.
 */
async function beatsUntilPlay(stepMs = 100, limitMs = DAILY_INTRO_MS + STAGE_INTRO_MIN_MS + 2000) {
  const seen: string[] = [];
  for (let elapsed = 0; elapsed <= limitMs; elapsed += stepMs) {
    const p = phase()!;
    if (p === "stage-play") return seen;
    const beat = q("daily-intro") ? "daily-intro"
      : q("daily-stage-intro")?.getAttribute("data-opening") === "main" ? "opening" : p;
    if (seen.at(-1) !== beat) seen.push(beat);
    await flush(stepMs);
  }
  throw new Error(`never reached stage-play; saw ${seen.join(" → ")}`);
}

/** The opening says the title and nothing else — not on the beat, not in its header. */
function expectMinimalOpening(planDate: string) {
  const opening = screen.getByTestId("daily-stage-intro");
  expect(opening).toHaveAttribute("data-opening", "main");
  expect(opening).toHaveAttribute("data-stage-kind", "standard");
  expect(opening.textContent).toBe("Daily Challenge");
  expect(within(opening).getByTestId("daily-opening-title")).toHaveTextContent("Daily Challenge");
  expect(within(opening).queryByTestId("daily-stage-tag")).toBeNull();
  expect(within(opening).queryByTestId("daily-stage-intro-position")).toBeNull();
  expect(within(opening).queryByTestId("daily-stage-intro-content")).toBeNull();
  expect(within(opening).queryByTestId("daily-stage-intro-rule")).toBeNull();
  // The whole page while it is up: the header names no stage either.
  const page = document.body.textContent ?? "";
  for (const banned of [/standard/i, /Today's Challenge/i, /optional/i, /More Challenges/i, /\bReview\b/,
    /Stage \d+ of \d+/, /stages today/i, /Champion Mastery/, /Ahri/]) {
    expect(page).not.toMatch(banned);
  }
  expect(page).not.toContain(planDate);
  expect(page).not.toContain(STANDARD_RULE);
  expect(q("daily-stage-position")).toBeNull();
  expect(q("daily-stage-content")).toBeNull();
  expect(q("daily-intro")).toBeNull();
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  lastHost = null;
  mounts.length = 0;
  guardActive.length = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ── the seam ───────────────────────────────────────────────────────────────

describe("DV2-P2C — the pure seam", () => {
  it("only v1–v4 arrivals play the separate Daily intro", () => {
    expect(opensWithDailyIntro({ planVersion: null })).toBe(true);
    for (const v of [1, 2, 3, 4]) expect(opensWithDailyIntro({ planVersion: v })).toBe(true);
    expect(opensWithDailyIntro({ planVersion: 5 })).toBe(false);
    expect(opensWithDailyIntro({ planVersion: 6 })).toBe(false);
  });

  it("the opening is the v5 MAIN stage's tag only — never an optional or a legacy stage", () => {
    const v5 = fixtureV5Run(V5_ELIGIBLE_DAY);
    expect(v5.stages.map((s) => isDailyOpeningStage(v5, s))).toEqual([true, false, false, false, false]);
    const v4 = fixtureRun(V5_ELIGIBLE_DAY, { plan_version: 4 });
    expect(v4.stages.some((s) => isDailyOpeningStage(v4, s))).toBe(false);
    const legacy = fixtureRun(FOUR_STAGE_DAY);
    expect(legacy.stages.some((s) => isDailyOpeningStage(legacy, s))).toBe(false);
  });
});

// ── fresh v5 ───────────────────────────────────────────────────────────────

describe("DV2-P2C — a fresh v5 Daily opens with one beat", () => {
  it("Play: one opening beat that says only 'Daily Challenge', then Standard", async () => {
    const t = createFixtureTransport(V5_WITH_CONTENT, { planVersion: 5 });
    mount(t);
    await flush();

    expect(phase()).toBe("stage-intro");
    expectMinimalOpening(t.wire().plan_date as string);
    // The opening IS Standard's tag: the launch it covers is already under way.
    expect(launches(t)).toEqual(["launch:0"]);
    // An unfinished Daily: leaving is guarded through the opening, as before.
    expect(guardActive.at(-1)).toBe(true);

    // It holds for the tag's minimum — gameplay never starts behind it early.
    await flush(STAGE_INTRO_MIN_MS - 50);
    expect(phase()).toBe("stage-intro");
    expectMinimalOpening(t.wire().plan_date as string);
    expect(mounts).toEqual([]);

    await flush(100);
    expect(phase()).toBe("stage-play");
    expect(mounts).toEqual([{ matchId: "child-0", entry: "fresh" }]);
    expect(launches(t)).toEqual(["launch:0"]);
    // In gameplay the header names the mode again, as it always has.
    expect(screen.getByTestId("daily-stage-position")).toHaveTextContent("Today's Challenge");
    expect(screen.getByTestId("daily-stage-chrome")).toHaveTextContent(/standard/i);
  });

  it("counts the beats: exactly one before gameplay, never the Daily intro", async () => {
    const t = createFixtureTransport(V5_WITH_CONTENT, { planVersion: 5 });
    mount(t);
    await flush();
    expect(await beatsUntilPlay()).toEqual(["opening"]);
  });

  it("a reload onto an untouched v5 run: the same single opening, one launch", async () => {
    const t = createFixtureTransport(V5_WITH_CONTENT, { planVersion: 5, existing: wireV5Run(V5_WITH_CONTENT) });
    mount(t, { play: false });
    await flush();
    expectMinimalOpening("2026-09-21");
    expect(await beatsUntilPlay()).toEqual(["opening"]);
    expect(t.calls).not.toContain("startToday");
    expect(launches(t)).toEqual(["launch:0"]);
    expect(mounts).toEqual([{ matchId: "child-0", entry: "fresh" }]);
  });

  it("Try again after a failed start: the same single opening", async () => {
    const t = createFixtureTransport(V5_WITH_CONTENT, { planVersion: 5 });
    const realStart = t.startToday.bind(t);
    let failed = false;
    t.startToday = async () => {
      if (!failed) { failed = true; throw new DailyRunApiError("network", 0, "offline"); }
      return realStart();
    };
    mount(t);
    await flush();
    expect(q("daily-run-start-error")).toBeInTheDocument();
    await act(async () => { screen.getByTestId("daily-run-start").click(); });
    await flush();
    expectMinimalOpening("2026-09-21");
    expect(await beatsUntilPlay()).toEqual(["opening"]);
    expect(launches(t)).toEqual(["launch:0"]);
  });

  it("a failed Standard launch keeps its error and Try again on the opening, and retries one launch", async () => {
    const t = createFixtureTransport(V5_WITH_CONTENT, { planVersion: 5 });
    t.failNextLaunch = true;
    mount(t);
    await flush();
    const opening = screen.getByTestId("daily-stage-intro");
    expect(opening).toHaveAttribute("data-opening", "main");
    expect(within(opening).getByTestId("daily-run-error")).toHaveTextContent("This stage couldn't open");
    expect(within(opening).queryByTestId("daily-stage-tag")).toBeNull();
    expect(within(opening).queryByTestId("daily-stage-intro-rule")).toBeNull();
    // No automatic hammering while the error stands.
    await flush(STAGE_INTRO_MIN_MS + 100);
    expect(launches(t)).toEqual(["launch:0"]);
    expect(phase()).toBe("stage-intro");

    await act(async () => { within(opening).getByTestId("daily-run-retry").click(); });
    await flush(10);
    expect(launches(t)).toEqual(["launch:0", "launch:0"]);
    // One logical launch: the retry reuses the stage's interaction id.
    expect(new Set(t.launchInteractions).size).toBe(1);
    await flush(STAGE_INTRO_MIN_MS + 50);
    expect(phase()).toBe("stage-play");
    expect(mounts).toEqual([{ matchId: "child-0", entry: "fresh" }]);
  });

  it("a reload onto a live Standard child is a recovery: no opening, no intro, no launch", async () => {
    const t = createFixtureTransport(V5_WITH_CONTENT, { planVersion: 5,
      existing: wireV5Run(V5_WITH_CONTENT, {}, { 0: { status: "in_progress", child_match_id: "child-0" } }) });
    mount(t, { play: false });
    await flush();
    expect(phase()).toBe("stage-play");
    expect(q("daily-stage-intro")).toBeNull();
    expect(q("daily-intro")).toBeNull();
    expect(mounts).toEqual([{ matchId: "child-0", entry: "recovered" }]);
    expect(launches(t)).toEqual([]);
  });
});

// ── after the opening: optional tags are unchanged ─────────────────────────

describe("DV2-P2C — optional stage tags still name their mode", () => {
  it("after the main result, More Challenges and Review tags keep mode, section and rule", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5 });
    mount(t);
    await flush();
    await flush(STAGE_INTRO_MIN_MS + 50);
    expect(phase()).toBe("stage-play");
    t.finishActiveChild(wireResult({ score: 40 }));
    await act(async () => { lastHost!.onMatchSettled({ matchId: "child-0", terminalReason: "combat", completionReason: null }); });
    await flush(10);
    expect(q("daily-main-result")).toBeInTheDocument();

    await act(async () => { screen.getByTestId("daily-main-continue").click(); });
    await flush(10);
    const tt = screen.getByTestId("daily-stage-intro");
    expect(tt).not.toHaveAttribute("data-opening");
    expect(tt).toHaveAttribute("data-stage-kind", "time_trial");
    expect(within(tt).getByTestId("daily-stage-tag")).toHaveTextContent(/time trial/i);
    expect(within(tt).getByTestId("daily-stage-intro-position")).toHaveTextContent("More Challenges · Optional");
    expect(within(tt).getByTestId("daily-stage-intro-rule")).toHaveTextContent(
      stageIdentity(readDailyRun(t.wire()).stages[1]).rule);
    // Its header names the stage, as before.
    expect(screen.getByTestId("daily-stage-position")).toBeInTheDocument();
    expect(screen.getByTestId("daily-stage-chrome")).toHaveTextContent(/time trial/i);
  });
});

// ── v1–v4 unchanged ────────────────────────────────────────────────────────

describe("DV2-P2C — the legacy Daily keeps its two beats", () => {
  it.each([
    ["plan_version absent (v1 default)", undefined],
    ["v4", 4],
  ] as const)("%s: Daily intro, then the stage tag; nothing launches behind the intro", async (_label, pv) => {
    const existing = pv === undefined ? wireRun(FOUR_STAGE_DAY) : wireRun(FOUR_STAGE_DAY, { plan_version: pv });
    const t = createFixtureTransport(FOUR_STAGE_DAY, { existing });
    mount(t, { play: false });
    await flush();

    expect(phase()).toBe("daily-intro");
    const intro = screen.getByTestId("daily-intro");
    expect(intro).not.toHaveAttribute("data-hierarchy");
    expect(intro).toHaveTextContent("2026-09-21");
    expect(intro).toHaveTextContent("4 stages today");
    expect(within(intro).getByTestId("daily-stage-ladder")).toBeInTheDocument();
    expect(intro).toHaveAttribute("data-beat-ms", String(DAILY_INTRO_MS));
    // A child's clock must not start behind a screen the player is reading.
    await flush(DAILY_INTRO_MS - 50);
    expect(launches(t)).toEqual([]);

    await flush(60);
    const tag = screen.getByTestId("daily-stage-intro");
    expect(tag).not.toHaveAttribute("data-opening");
    expect(within(tag).getByTestId("daily-stage-intro-position")).toHaveTextContent("Stage 1 of 4");
    expect(within(tag).getByTestId("daily-stage-tag")).toHaveTextContent(/time trial/i);
    expect(within(tag).getByTestId("daily-stage-intro-content")).toHaveTextContent("Champion Mastery — Ahri");
    expect(within(tag).getByTestId("daily-stage-intro-rule")).toBeInTheDocument();
    expect(screen.getByTestId("daily-stage-position")).toHaveTextContent("Stage 1 of 4");
    expect(launches(t)).toEqual(["launch:0"]);
  });

  it("v4 Play: counts two beats before gameplay", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY);
    mount(t);
    await flush();
    expect(await beatsUntilPlay()).toEqual(["daily-intro", "stage-intro"]);
  });

  it("v4 with a Standard at index 0 is still a legacy tag, not the v5 opening", async () => {
    const t = createFixtureTransport(V5_WITH_CONTENT, { existing: wireRun(V5_WITH_CONTENT, { plan_version: 4 }) });
    mount(t, { play: false });
    await flush(DAILY_INTRO_MS + 10);
    const tag = screen.getByTestId("daily-stage-intro");
    expect(tag).not.toHaveAttribute("data-opening");
    expect(within(tag).getByTestId("daily-stage-tag")).toHaveTextContent(/standard/i);
    expect(within(tag).getByTestId("daily-stage-intro-position")).toHaveTextContent("Stage 1 of 5");
  });
});
