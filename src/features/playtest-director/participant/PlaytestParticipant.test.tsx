/**
 * PLAY1 — the participant wrapper end to end, against the canonical Daily
 * fixture engine (`createFixtureTransport`) and the real, unmodified
 * `DailyRunPage`. The child match is the same stand-in DailyRunPage.test uses:
 * it exposes the `MatchHost` so a test can hand a stage back.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => ({
  user: { id: "userA", is_anonymous: false } as { id: string; is_anonymous: boolean } | null,
}));
vi.mock("@/lib/navigation/useTransactionalLeaveGuard", () => ({
  useTransactionalLeaveGuard: ({ copy }: { copy: unknown }) => ({
    kind: "daily_run", copy, state: "unblocked", confirmationOpen: false,
    pendingLocation: null, stay: vi.fn(), leave: vi.fn(), runWithBypass: vi.fn(),
  }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockAuth }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/pages/quiz-ranked/QuizRankedMatch", () => ({
  QuizRankedMatch: () => { throw new Error("the stand-in is injected in these tests"); },
}));
const tracked = vi.hoisted(() => [] as { name: string; sceneId?: string }[]);
vi.mock("@/features/playtest-director/analytics", () => ({
  trackPlaytest: (name: string, _ctx: unknown, extra: { sceneId?: string } = {}) =>
    tracked.push({ name, sceneId: extra.sceneId }),
}));

import type { MatchHost } from "@/lib/ranked-core/flow/matchHost";
import {
  FOUR_STAGE_DAY, createFixtureTransport, wireResult, wireRun, type FixtureTransport,
} from "@/lib/daily-challenge/run/fixtures";
import { DAILY_INTRO_MS, STAGE_INTRO_MIN_MS } from "@/lib/daily-challenge/run/flow";
import { DailyRunPage, type StageMatchProps } from "@/pages/quiz-daily-challenge/run/DailyRunPage";
import PlaytestParticipantPage from "@/pages/playtest/PlaytestParticipantPage";
import type { ChannelStatus, DirectorStateSource, JoinedCohort } from "../api";
import { PlaytestApiError } from "../api";
import type { DirectorState } from "../directorState";
import type { GameplayScene } from "../manifest";
import { DailyGameplayGate } from "./DailyGameplayGate";
import { PlaytestParticipant, type ParticipantDeps } from "./PlaytestParticipant";

// ── the canonical-arena stand-in ────────────────────────────────────────────
let lastHost: MatchHost | null = null;
function FakeStageMatch({ matchId, chrome, host }: StageMatchProps) {
  lastHost = host;
  return <div data-testid="fake-stage-match" data-match-id={matchId}>{chrome}</div>;
}

const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const q = (id: string) => screen.queryByTestId(id);

/** Play the current stage: wait out its tag, then hand its child back. */
async function playStage(t: FixtureTransport) {
  await flush(STAGE_INTRO_MIN_MS + 50);
  t.finishActiveChild(wireResult());
  const id = q("fake-stage-match")!.getAttribute("data-match-id")!;
  await act(async () => { lastHost!.onMatchSettled({ matchId: id, terminalReason: "combat", completionReason: null }); });
  await flush(10);
}

// ── an in-memory authoritative row + Realtime channel ───────────────────────
function fakeSource(initial: Omit<DirectorState, "cohortId" | "updatedAt">) {
  let row: DirectorState = { cohortId: "cohort-1", updatedAt: null, ...initial };
  const subs = new Set<{ onRow: (s: DirectorState | null) => void; onStatus: (s: ChannelStatus) => void }>();
  const source: DirectorStateSource & {
    set: (r: Partial<DirectorState>) => DirectorState;
    push: (r: DirectorState) => void;
    status: (s: ChannelStatus) => void;
    subscribers: () => number;
  } = {
    fetch: vi.fn(async () => ({ ...row })),
    subscribe: vi.fn((_id, onRow, onStatus) => {
      const s = { onRow, onStatus };
      subs.add(s);
      return () => { subs.delete(s); };
    }),
    set: (r) => (row = { ...row, ...r }),
    push: (r) => subs.forEach((s) => s.onRow({ ...r })),
    status: (st) => subs.forEach((s) => s.onStatus(st)),
    subscribers: () => subs.size,
  };
  return source;
}

const JOINED: JoinedCohort = {
  cohortId: "cohort-1", cohortName: "PLAY1", cohortStatus: "open",
  manifestId: "play1_placeholder", manifestVersion: 1,
  enrollmentId: "enr-1", enrollmentStatus: "joined", created: true, answeredPromptKeys: [],
};

function LocationProbe() {
  const l = useLocation();
  return <output data-testid="location">{l.pathname}</output>;
}

function mountParticipant(deps: ParticipantDeps, joined: JoinedCohort = JOINED) {
  return render(
    <MemoryRouter initialEntries={["/playtest/slug"]}>
      <PlaytestParticipant joined={joined} deps={deps} />
      <LocationProbe />
    </MemoryRouter>);
}

const builds = () => screen.queryAllByTestId(/^playtest-build-/).map((el) => el.getAttribute("data-testid"));
const participant = () => screen.getByTestId("playtest-participant");

let report: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockAuth.user = { id: "userA", is_anonymous: false };
  vi.useFakeTimers({ shouldAdvanceTime: false });
  lastHost = null;
  tracked.length = 0;
  report = vi.fn(async () => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ── route + enrollment ──────────────────────────────────────────────────────

describe("/playtest/:slug", () => {
  const route = (join: (slug: string) => Promise<JoinedCohort>, deps?: ParticipantDeps) => render(
    <MemoryRouter initialEntries={["/playtest/abc123"]}>
      <Routes>
        <Route path="/playtest/:slug" element={<PlaytestParticipantPage join={join} deps={deps} />} />
      </Routes>
    </MemoryRouter>);

  it("resolves a valid cohort through the invitation slug and joins", async () => {
    const join = vi.fn(async () => JOINED);
    const source = fakeSource({ sceneId: "welcome", buildStep: 0, revision: 0 });
    route(join, { source, report });
    await flush();
    expect(join).toHaveBeenCalledWith("abc123");
    expect(participant()).toHaveAttribute("data-scene-id", "welcome");
    expect(tracked.map((t) => t.name)).toContain("playtest_joined");
  });

  it("refuses an invalid invitation", async () => {
    route(vi.fn(async () => { throw new PlaytestApiError("playtest_invitation_invalid"); }));
    await flush();
    expect(q("playtest-join-error")).toHaveTextContent(/isn't valid/);
  });

  it("asks a guest session to sign in and never calls join", async () => {
    mockAuth.user = { id: "guest", is_anonymous: true };
    const join = vi.fn(async () => JOINED);
    route(join);
    await flush();
    expect(q("playtest-sign-in")).not.toBeNull();
    expect(join).not.toHaveBeenCalled();
  });
});

// ── authoritative presentation state ────────────────────────────────────────

describe("presentation follows the authoritative row", () => {
  it("loads state on initial mount and renders the revealed builds", async () => {
    const source = fakeSource({ sceneId: "welcome", buildStep: 1, revision: 1 });
    mountParticipant({ source, report });
    await flush();
    expect(source.fetch).toHaveBeenCalledTimes(1);
    expect(builds()).toEqual(["playtest-build-what"]);
  });

  it("applies a reveal live; a duplicate or late event never moves it twice or backwards", async () => {
    const source = fakeSource({ sceneId: "welcome", buildStep: 1, revision: 1 });
    mountParticipant({ source, report });
    await flush();
    const next = source.set({ buildStep: 2, revision: 2 });
    await act(async () => { source.push(next); });
    expect(builds()).toEqual(["playtest-build-what", "playtest-build-how"]);
    await act(async () => { source.push(next); source.push({ ...next, buildStep: 1, revision: 1 }); });
    expect(builds()).toEqual(["playtest-build-what", "playtest-build-how"]);
    expect(participant()).toHaveAttribute("data-revision", "2");
  });

  it("reconstructs exactly scene N / build M after a refresh", async () => {
    const source = fakeSource({ sceneId: "welcome", buildStep: 3, revision: 3 });
    const first = mountParticipant({ source, report });
    await flush();
    const before = builds();
    first.unmount();
    expect(source.subscribers()).toBe(0);
    mountParticipant({ source, report });
    await flush();
    expect(builds()).toEqual(before);
    expect(builds()).toHaveLength(3);
    expect(participant()).toHaveAttribute("data-build-step", "3");
  });

  it("converges through the ~15 s fallback poll when no Realtime event arrives", async () => {
    const source = fakeSource({ sceneId: "welcome", buildStep: 0, revision: 0 });
    mountParticipant({ source, report });
    await flush();
    source.set({ sceneId: "welcome", buildStep: 2, revision: 2 });
    await flush(14_000);
    expect(builds()).toHaveLength(0);
    await flush(1_500);
    expect(builds()).toHaveLength(2);
  });

  it("re-reads the row when the channel (re)subscribes", async () => {
    const source = fakeSource({ sceneId: "welcome", buildStep: 0, revision: 0 });
    mountParticipant({ source, report });
    await flush();
    source.set({ buildStep: 1, revision: 1 });
    await act(async () => { source.status("SUBSCRIBED"); });
    await flush();
    expect(builds()).toHaveLength(1);
  });
});

// ── the Daily boundary ──────────────────────────────────────────────────────

describe("gameplay: canonical Daily, observed, returned at the manifest's checkpoint", () => {
  const gameplayDeps = (t: FixtureTransport): ParticipantDeps => ({
    source: fakeSource({ sceneId: "daily_standard", buildStep: 0, revision: 5 }),
    report, dailyTransport: t, StageMatch: FakeStageMatch, viewerUserId: "userA",
  });

  it("renders the real Daily, keeps it through nonterminal snapshots, and unmounts it at stage 0's end", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY);
    mountParticipant(gameplayDeps(t));
    await flush();
    expect(q("daily-run-entry")).not.toBeNull();
    expect(tracked.map((e) => e.name)).toContain("playtest_gameplay_released");

    await act(async () => { screen.getByTestId("daily-run-start").click(); });
    await flush(DAILY_INTRO_MS + 10);
    await flush(STAGE_INTRO_MIN_MS + 50);
    // Stage 0 is in progress: several nonterminal snapshots, still in Daily.
    expect(q("fake-stage-match")).not.toBeNull();
    expect(q("playtest-gameplay-held")).toBeNull();

    t.finishActiveChild(wireResult());
    const id = q("fake-stage-match")!.getAttribute("data-match-id")!;
    await act(async () => { lastHost!.onMatchSettled({ matchId: id, terminalReason: "combat", completionReason: null }); });
    await flush(10);

    expect(q("playtest-gameplay-held")).not.toBeNull();
    expect(q("daily-run")).toBeNull();
    expect(q("daily-stage-result")).toBeNull();
    // Control returned before Daily could launch stage 1.
    expect(t.calls.filter((c) => c.startsWith("launch"))).toEqual(["launch:0"]);
    expect(tracked.map((e) => e.name)).toContain("playtest_stage_checkpoint_reached");
    expect(report).toHaveBeenCalledWith("enr-1", "checkpoint_reached", "daily_standard",
      expect.objectContaining({ runStatus: "active", stageStatuses: expect.arrayContaining(["completed"]) }));
  });

  it("after a refresh past the checkpoint, canonical resume re-derives the return without replaying", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, {
      existing: wireRun(FOUR_STAGE_DAY, { current_stage_index: 1 }, { 0: { status: "completed", result: wireResult() } }),
    });
    mountParticipant(gameplayDeps(t));
    await flush(10);
    expect(q("playtest-gameplay-held")).not.toBeNull();
    expect(q("daily-run")).toBeNull();
    expect(t.calls).toEqual(["readToday"]);
  });
});

describe("DailyCompletion's hard-coded /quiz link is never reachable through Playtest", () => {
  const WHOLE_DAILY: GameplayScene = {
    kind: "gameplay", id: "whole_daily", title: "", surface: "daily_challenge",
    returnWhen: { type: "daily_terminal" }, heldMessage: "held",
  };
  const completedRun = () => wireRun(FOUR_STAGE_DAY, { status: "completed", outcome: "reviewed", current_stage_index: null },
    Object.fromEntries(FOUR_STAGE_DAY.map((_, i) => [i, { status: "completed", result: wireResult() }])));

  const mountAt = (ui: JSX.Element) => render(
    <MemoryRouter initialEntries={["/playtest/slug"]}>{ui}<LocationProbe /></MemoryRouter>);

  it("control: the bare Daily does render the /quiz completion link for a completed day", async () => {
    mountAt(<DailyRunPage transport={createFixtureTransport(FOUR_STAGE_DAY, { existing: completedRun() })}
      StageMatch={FakeStageMatch} viewerUserId="userA" />);
    await flush(10);
    expect(q("daily-run-home")).toHaveAttribute("href", "/quiz");
  });

  it("the gate returns on the terminal snapshot, so the completion link never renders", async () => {
    mountAt(<DailyGameplayGate scene={WHOLE_DAILY} StageMatch={FakeStageMatch} viewerUserId="userA"
      transport={createFixtureTransport(FOUR_STAGE_DAY, { existing: completedRun() })} />);
    await flush(10);
    expect(q("daily-run-home")).toBeNull();
    expect(q("playtest-gameplay-held")).not.toBeNull();
    expect(screen.getByTestId("location")).toHaveTextContent("/playtest/slug");
  });

  it("finishing the LAST stage live returns control before the completion screen", async () => {
    const t = createFixtureTransport(FOUR_STAGE_DAY, {
      existing: wireRun(FOUR_STAGE_DAY, { current_stage_index: 3 }, {
        0: { status: "completed", result: wireResult() },
        1: { status: "completed", result: wireResult() },
        2: { status: "completed", result: wireResult() },
        3: { status: "in_progress", child_match_id: "child-3" },
      }),
    });
    mountAt(<DailyGameplayGate scene={WHOLE_DAILY} StageMatch={FakeStageMatch} viewerUserId="userA" transport={t} />);
    await flush(10);
    expect(q("fake-stage-match")).not.toBeNull();
    await playStage(t);
    expect(q("playtest-gameplay-held")).not.toBeNull();
    expect(q("daily-run-home")).toBeNull();
    expect(q("daily-run-complete")).toBeNull();
    expect(screen.getByTestId("location")).toHaveTextContent("/playtest/slug");
  });
});

// ── feedback ────────────────────────────────────────────────────────────────

describe("structured feedback", () => {
  it("submits one answer for the manifest prompt and shows it as recorded", async () => {
    const submit = vi.fn(async () => ({ created: true }));
    mountParticipant({ source: fakeSource({ sceneId: "standard_feedback", buildStep: 0, revision: 7 }), report, submit });
    await flush();
    await act(async () => { screen.getByTestId("playtest-feedback-just_right").click(); });
    await flush();
    expect(submit).toHaveBeenCalledWith("enr-1", "standard_stage_feel", "standard_feedback", { choice: "just_right" });
    expect(q("playtest-feedback-thanks")).not.toBeNull();
    expect(tracked.map((e) => e.name)).toContain("playtest_feedback_submitted");
  });

  it("an already-answered prompt stays answered after a refresh", async () => {
    mountParticipant({ source: fakeSource({ sceneId: "standard_feedback", buildStep: 0, revision: 7 }), report },
      { ...JOINED, answeredPromptKeys: ["standard_stage_feel"] });
    await flush();
    expect(q("playtest-feedback-thanks")).not.toBeNull();
  });
});
