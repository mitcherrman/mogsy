/**
 * MISC-W2C (F04) — the Daily page, end to end, with the discovery ceremony.
 *
 * A v5 day through the real `DailyRunPage` and the in-memory B: Standard
 * settles into the MAIN result and its earned cards (taken from a payload the
 * real backend projection produced) arrive after the score; a bonus stage's
 * result reads its OWN match, and a stage that found nothing stays silent; the
 * cue is a single `ranked:<match>:discovery` event per match; the panel's CTA
 * goes to `/quiz#review`; and a reload onto a main-complete day (the only way
 * back to a result's data) draws no ceremony and makes no read.
 */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => ({ user: { id: "userA", is_anonymous: false } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockAuth }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
const play = vi.hoisted(() => vi.fn());
const sfxApi = vi.hoisted(() => ({ play, stop: () => {}, preload: () => {} }));
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
vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import backend from "@/lib/ranked-public/__fixtures__/dailyMatchDiscoveries.backend.json";
import type { MatchHost } from "@/lib/ranked-core/flow/matchHost";
import {
  V5_ELIGIBLE_DAY, createFixtureTransport, wireResult, type FixtureTransport,
} from "@/lib/daily-challenge/run/fixtures";
import { DAILY_START_STATE } from "@/lib/daily-challenge/run/entry";
import { STAGE_INTRO_MIN_MS } from "@/lib/daily-challenge/run/flow";
import { MORE_CHALLENGES_STAND_IN, MoreChallengesStandIn } from "@/test/moreChallengesStandIn";
import { DailyRunPage, type StageMatchProps } from "./DailyRunPage";
import { DAILY_DISCOVERY_HOLD_MS } from "./DailyDiscoveries";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});
/** child-0 (Standard) earned three cards; every other stage found nothing. */
const bodyFor = (id: string) => (id === "child-0"
  ? { ...backend.earned, match_id: id, payload: { ...backend.earned.payload, match_id: id } }
  : { ...backend.none, match_id: id, payload: { ...backend.none.payload, match_id: id } });

let reads: string[];
let lastHost: MatchHost | null = null;
function FakeStageMatch({ matchId, entry, chrome, host }: StageMatchProps) {
  lastHost = host;
  return <div data-testid="fake-stage-match" data-match-id={matchId} data-entry={entry}>{chrome}</div>;
}
function Where() {
  const l = useLocation();
  return <div data-testid="hub-stand-in" data-where={`${l.pathname}${l.hash}`} />;
}
const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const q = (id: string) => screen.queryByTestId(id);
const click = async (id: string) => { await act(async () => { screen.getByTestId(id).click(); }); await flush(10); };
const cues = () => play.mock.calls.filter(([e]) => e === "ranked.discovery.reveal");

function mount(t: FixtureTransport, state: unknown = DAILY_START_STATE) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/quiz/daily-challenge", state }]}>
      <Routes>
        <Route path="/quiz/daily-challenge"
          element={<DailyRunPage transport={t} StageMatch={FakeStageMatch} viewerUserId="userA" />} />
        <Route path="/quiz" element={<Where />} />
        <Route path="/quiz/more-challenges" element={<MoreChallengesStandIn />} />
      </Routes>
    </MemoryRouter>);
}

async function playStage(t: FixtureTransport, result = wireResult()) {
  await flush(STAGE_INTRO_MIN_MS + 50);
  t.finishActiveChild(result);
  const id = q("fake-stage-match")!.getAttribute("data-match-id")!;
  await act(async () => { lastHost!.onMatchSettled({ matchId: id, terminalReason: "combat", completionReason: null }); });
  await flush(10);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  play.mockClear();
  reads = [];
  lastHost = null;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const m = /\/api\/ranked\/matches\/([^/]+)\/discoveries$/.exec(String(url));
    if (!m) throw new Error(`unexpected request ${url}`);
    reads.push(decodeURIComponent(m[1]));
    return json(bodyFor(decodeURIComponent(m[1])));
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("F04 — a v5 Daily with earned cards", () => {
  it("Standard's main result earns its cards after the score, once", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5 });
    mount(t);
    await flush();
    await playStage(t, wireResult({ correct: 9, answered: 10, score: 1234, misses: 1 }));

    const main = screen.getByTestId("daily-main-result");
    // The settle is on screen; the answer is requested for Standard's own child,
    // while the run already points at the NEXT stage.
    expect(reads).toEqual(["child-0"]);
    expect(q("daily-discoveries")).toBeNull();
    expect(screen.getByTestId("daily-main-continue")).toBeEnabled();

    await flush(DAILY_DISCOVERY_HOLD_MS.mainResult + 50);
    await flush(1500);
    const panel = within(main).getByTestId("daily-discoveries");
    expect(within(panel).getAllByTestId("discovery-entry")).toHaveLength(3);
    expect(cues()).toHaveLength(1);
    expect(cues()[0][1]).toEqual({ eventId: "ranked:child-0:discovery" });

    // Nothing replays on a long idle.
    await flush(10_000);
    expect(reads).toEqual(["child-0"]);
    expect(cues()).toHaveLength(1);

    // The panel's way in: REVIEW → OWNED, the destination Ranked uses.
    await click("discovery-cta");
    expect(screen.getByTestId("hub-stand-in")).toHaveAttribute("data-where", "/quiz#review");
  });

  it("Continue into a bonus stage: its result reads its OWN match; no cards, no replay of Standard's", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5 });
    mount(t);
    await flush();
    await playStage(t, wireResult({ score: 1234 }));
    await flush(DAILY_DISCOVERY_HOLD_MS.mainResult + 50);
    await flush(1500);
    expect(cues()).toHaveLength(1);

    await click("daily-main-continue"); // → More Challenges catalog
    await click(MORE_CHALLENGES_STAND_IN); // → Time Trial intro
    await playStage(t, wireResult({ score: 999 }));
    expect(screen.getByTestId("daily-stage-result")).toBeInTheDocument();
    // Standard's panel is gone with its screen.
    expect(q("daily-discoveries")).toBeNull();
    await flush(DAILY_DISCOVERY_HOLD_MS.stageResult + 1500);
    expect(reads).toEqual(["child-0", "child-1"]);
    expect(q("daily-discoveries")).toBeNull(); // child-1 found nothing
    expect(q("discovery-quiet")).toBeNull();
    expect(cues()).toHaveLength(1); // still only Standard's
    expect(screen.getByTestId("daily-stage-result-continue")).toBeEnabled();
  });

  it("a reload onto a main-complete day lands on the optional entry: no read, no ceremony", async () => {
    const t = createFixtureTransport(V5_ELIGIBLE_DAY, { planVersion: 5 });
    mount(t);
    await flush();
    await playStage(t, wireResult({ score: 1234 }));
    await flush(DAILY_DISCOVERY_HOLD_MS.mainResult + 50);
    await flush(1500);
    cleanup();
    reads.length = 0;
    play.mockClear();

    mount(t, null); // the same server state, a fresh page (resume)
    await flush(5000);
    expect(screen.getByTestId("daily-run")).toHaveAttribute("data-flow-phase", "optional-entry");
    expect(reads).toEqual([]);
    expect(q("daily-discoveries")).toBeNull();
    expect(cues()).toHaveLength(0);
  });
});
