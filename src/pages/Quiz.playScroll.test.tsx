/**
 * PLAY1 — PLAY, at the lobby level.
 *
 * The unit tests for the record itself live beside the component. These are
 * the claims that only the real page can make:
 *
 *   · pressing PLAY opens the record and does NOT navigate;
 *   · the role the lobby is showing is the role the record enters as;
 *   · closing the record puts focus back on the seal it was opened from;
 *   · the lobby underneath does not move while the record is open;
 *   · arriving from `/quiz/ranked` with no match opens the record straight
 *     away, which is what makes that route's retirement a redirect rather
 *     than a dead end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/components/ads/AdSlot", () => ({ default: () => null }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", is_anonymous: false } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { signInAnonymously: vi.fn() },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null }),
          single: () => Promise.resolve({ data: null }),
        }),
        then: (resolve: (v: { data: unknown[] }) => unknown) => resolve({ data: [] }),
      }),
    }),
  },
}));
vi.mock("@/lib/quiz/onboarding-gate", () => ({
  hasVisitedHub: () => true,
  incrementAnonymousActions: () => 0,
  getAnonymousActionCount: () => 0,
  hasSoftNudgeBeenSeen: () => true,
  markSoftNudgeSeen: () => {},
}));
vi.mock("@/lib/backend-auth", () => ({
  ensureBackendAuthToken: async () => "test-token",
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));
// The lobby's own Ranked reads. The role is the one under test.
vi.mock("@/pages/quiz-ranked/useRankedRole", () => ({
  useRankedRole: () => ({
    role: "adc", loadState: "ready", saving: false, error: null,
    selectRole: async () => true,
  }),
}));
vi.mock("@/pages/quiz-ranked/useRankedProgression", () => ({
  useRankedProgression: () => ({ progression: null, loadState: "ready" }),
}));
vi.mock("@/pages/quiz-ranked/useRankedMatchHistory", () => ({
  useRankedMatchHistory: () => ({ entries: [], loadState: "ready" }),
}));
// The queue never leaves idle here: this file is about the lobby, not the
// queue (which has its own regression suite).
vi.mock("@/pages/quiz-ranked/useRankedQueue", () => ({
  useRankedQueue: () => ({
    state: "selecting_class", status: null, matchId: null, selectedClass: "tank",
    unavailableReason: null, error: null, canCancel: false,
    setSelectedClass: vi.fn(), join: vi.fn(), joinAs: vi.fn(),
    joinWithoutClass: vi.fn(), cancel: vi.fn(),
  }),
}));
vi.mock("@/hooks/useFriends", () => ({
  useFriends: () => ({ friends: [], loading: false }),
}));

/**
 * What `quizApi.getDailyChallenge` answers with.
 *
 * Mutable so one test can hand the host a real day's set and watch what the
 * host does with it. Everything else in this file wants the "no daily"
 * answer, which is the default.
 */
let dailyResponse: () => unknown = () => ({ ok: false });

/**
 * WHAT DC2 SAYS ABOUT TODAY (ARENA1 Step 5 §19).
 *
 * The match record's Daily clause reads the Daily Challenge service now, not
 * the legacy `getDailyChallenge` payload above. That was the point of the
 * change: the clause decides whether to OFFER a mode, and the button it offers
 * opens DC2 — so a day the legacy endpoint calls finished and DC2 does not
 * would either refuse a playable day or open a finished one.
 *
 * The legacy response stays mocked because the legacy in-page flow still reads
 * it; it simply no longer decides anything the record draws.
 */
let dcStatus: DailyStatusView = { ...UNKNOWN_DAILY_STATUS };
vi.mock("@/lib/daily-challenge/useDailyChallengeStatus", () => ({
  useDailyChallengeStatus: () => dcStatus,
}));

const SETS = [
  { id: 5, name: "All Current Questions", description: "Everything", question_count: 1260 },
];

/** Which set a start actually opened — the Practice handoff turns on this. */
const questionsMock = vi.fn(async () => ({ questions: [] }));

vi.mock("@/lib/quiz/api", () => ({
  quizApi: {
    sets: async () => ({ sets: SETS }),
    questions: (...args: unknown[]) => questionsMock(...(args as [])),
    getProgress: async () => ({ rank_name: "Bronze", attempts: 2, accuracy: 71 }),
    getCategories: async () => ({ categories: [] }),
    getAchievements: async () => ({ achievements: [] }),
    getDailyChallenge: async () => dailyResponse(),
    getHistory: async () => ({ ok: true, results: [], total_count: 0, is_pro: false, limited: false, free_limit: 10, upsell_message: null }),
    startSession: async () => ({ ok: false }),
    completeSession: async () => ({}),
  },
  resolveQuizAssetUrl: (p?: string) => (p ? `http://assets.local/${p}` : undefined),
  progressAttempts: (p: { attempts?: number } | null) => p?.attempts ?? 0,
}));

import { UNKNOWN_DAILY_STATUS } from "@/lib/daily-challenge/status";
import type { DailyStatusView } from "@/lib/daily-challenge/status";
import QuizPage from "./Quiz";

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

async function renderLobby(entry: unknown = "/quiz") {
  const utils = render(
    <MemoryRouter initialEntries={[entry as string]}>
      <QuizPage />
      <LocationProbe />
    </MemoryRouter>,
  );
  // The Leaguecraft Record is the lobby's stable landmark. The practice tiles
  // used to be this signal; the panel holding them is withheld now
  // (HUB_MODULES.practicePanel), so it waits on the record instead.
  await waitFor(() =>
    expect(utils.container.querySelector('[data-testid="leaguecraft-workspace"]')).not.toBeNull(),
  );
  return utils;
}

beforeEach(() => {
  vi.clearAllMocks();
  dailyResponse = () => ({ ok: false });
  dcStatus = { ...UNKNOWN_DAILY_STATUS };
});
afterEach(cleanup);

describe("PLAY opens the match-entry record", () => {
  it("opens the record in place instead of navigating", async () => {
    await renderLobby();
    expect(screen.queryByTestId("play-scroll")).toBeNull();
    fireEvent.click(screen.getByTestId("ranked-play-gem"));
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    expect(screen.getByTestId("location").textContent).toBe("/quiz");
  });

  it("carries the lobby's selected role into the record", async () => {
    await renderLobby();
    fireEvent.click(screen.getByTestId("ranked-play-gem"));
    await waitFor(() => expect(screen.getByTestId("play-scroll-role-name")).toBeTruthy());
    expect(screen.getByTestId("play-scroll-role-name").textContent).toBe("ADC");
  });

  /**
   * The record is a PORTAL over the lobby, not a node inserted into it —
   * which is what makes "the lobby does not move" true by construction
   * rather than by measurement. jsdom performs no layout, so the pixel half
   * of that claim is checked in a real browser; this pins the structural
   * half, which is the part that can regress in code.
   *
   * (Deliberately NOT an `innerHTML` snapshot of the hero: the lobby's role
   * stage and mascot art settle asynchronously, so an identical-markup
   * assertion is a race, not a contract.)
   */
  it("renders the record outside the lobby's own tree, leaving it untouched", async () => {
    const { container } = await renderLobby();
    const hero = container.querySelector('[data-testid="hub-ranked-section"]')!;
    fireEvent.click(screen.getByTestId("ranked-play-gem"));
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    const record = screen.getByTestId("play-scroll");
    expect(hero.contains(record)).toBe(false);
    expect(container.contains(record)).toBe(false);
    // And the lobby is still mounted behind it, seal and all.
    expect(hero.contains(screen.getByTestId("ranked-play-gem"))).toBe(true);
  });

  it("returns focus to the seal when the record closes", async () => {
    await renderLobby();
    const seal = screen.getByTestId("ranked-play-gem");
    seal.focus();
    fireEvent.click(seal);
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    fireEvent.click(screen.getByTestId("play-scroll-close"));
    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(seal));
  });

  it("can be reopened after closing", async () => {
    await renderLobby();
    fireEvent.click(screen.getByTestId("ranked-play-gem"));
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    fireEvent.click(screen.getByTestId("play-scroll-close"));
    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());
    fireEvent.click(screen.getByTestId("ranked-play-gem"));
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
  });
});

describe("arriving from the retired /quiz/ranked menu", () => {
  it("opens the record straight away when the route asks for it", async () => {
    await renderLobby({ pathname: "/quiz", state: { openPlay: true } });
    expect(screen.getByTestId("play-scroll")).toBeTruthy();
  });

  it("does NOT re-open it after the player closes it", async () => {
    await renderLobby({ pathname: "/quiz", state: { openPlay: true } });
    fireEvent.click(screen.getByTestId("play-scroll-close"));
    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());
    // A re-render must not resurrect the record from the same router state.
    fireEvent.click(screen.getByTestId("workspace-tab-review"));
    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());
  });

  it("stays closed on an ordinary visit", async () => {
    await renderLobby();
    expect(screen.queryByTestId("play-scroll")).toBeNull();
  });
});

/**
 * THE DAILY CHALLENGE HANDOFF, at the level where it is actually real.
 *
 * This exists because the opposite was reported: on `/dev/play-scroll`,
 * pressing Daily Challenge appeared to do nothing at all. It genuinely does
 * nothing there — that route wires `onPlayDailyChallenge` to a no-op because
 * it has no host to hand anything to, so the record simply closes and leaves
 * the preview page's own furniture on screen.
 *
 * DC1 PHASE 5 CHANGED WHERE THE PRESS GOES, and these tests changed with it.
 * They used to assert that the lobby swapped itself out for the legacy Daily's
 * questions IN PLACE, with no navigation — which was true, and is exactly what
 * this phase replaces. The Daily now has its own route and its own arena on
 * the DC2 transport, so the claim worth evidence is that the clause reaches
 * it: the record closes, the page navigates, and the legacy in-page flow is
 * not started on the way past.
 */
describe("Daily Challenge hands off to the Daily Challenge route", () => {
  it("closes the record and navigates to the Daily Challenge arena", async () => {
    dailyResponse = () => ({
      ok: true,
      questions: [
        {
          id: 901,
          category: "Monsters",
          question_text: "Which epic monster grants Hand of Baron?",
          format: "multiple_choice",
          choices: ["Baron Nashor", "Drake", "Herald", "Krug"],
          answered: false,
        },
      ],
      answered: 0, target: 5, daily_streak: 4,
    });

    const { container } = await renderLobby();
    fireEvent.click(screen.getByTestId("ranked-play-gem"));
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());

    fireEvent.click(screen.getByTestId("play-mode-daily"));

    // The record gets out of the way — the player is leaving this page, and a
    // dialog left open over a page that is navigating is a trap.
    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());

    // THE handoff: a real route change to the DC2 arena.
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe("/quiz/daily-challenge"),
    );

    // And the legacy in-page Daily was NOT started on the way: its question
    // never reaches the screen, and the lobby is not swapped out underneath.
    expect(screen.queryByText(/Hand of Baron/)).toBeNull();
    expect(container.querySelector('[data-testid="leaguecraft-workspace"]')).not.toBeNull();
  });

  it("does not depend on the legacy Daily endpoint answering", async () => {
    // The old handoff loaded the day's questions before it could show
    // anything, so a failing legacy read stranded the player on a dead lobby.
    // The new one is a navigation: the arena reads its own transport.
    dailyResponse = () => ({ ok: false, error: "legacy daily is down" });

    await renderLobby();
    fireEvent.click(screen.getByTestId("ranked-play-gem"));
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    fireEvent.click(screen.getByTestId("play-mode-daily"));

    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe("/quiz/daily-challenge"),
    );
  });
});

/**
 * THE PRACTICE HANDOFF, at the level where the destination actually exists.
 *
 * The record can only say "take me to Practice"; only the page knows where
 * Practice is. These drive the real `Quiz` page with a finished day and watch
 * where the player ends up.
 */
describe("a finished Daily Challenge hands the player to Practice", () => {
  /** Today's set, answered out. The page reads this on mount. */
  const COMPLETED_DAY = () => ({
    ok: true,
    challenge: {
      challenge_date: "2026-08-21", question_count: 5,
      xp_bonus: 250, theme: "Item Knowledge",
    },
    progress: { answered_count: 5, correct_count: 4, daily_streak: 4, completed: true },
    questions_remaining: 0,
    questions: [],
  });

  /**
   * The two services disagreeing is not hypothetical: they are different
   * products. The legacy Daily is one attempt per question over 5 questions;
   * DC2 is 11–15 cards with retry-until-correct and a timed block. A player
   * who finished the legacy set has not necessarily played today's Daily
   * Challenge at all — and the clause opens the Daily Challenge.
   */
  it("offers the day when DC2 says it is unplayed, whatever the legacy set says", async () => {
    dailyResponse = COMPLETED_DAY;
    dcStatus = {
      known: true, completed: false, resumable: false,
      resolved: 0, total: 12, streak: 4, theme: "Item Knowledge",
    };
    await renderLobby();
    fireEvent.click(screen.getByTestId("ranked-play-gem"));
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());

    expect(screen.getByTestId("play-mode-daily")).toBeTruthy();
    expect(screen.queryByTestId("play-mode-daily-complete")).toBeNull();
  });

  async function openRecordOnAFinishedDay() {
    dailyResponse = COMPLETED_DAY;
    // The clause's actual authority.
    dcStatus = {
      known: true, completed: true, resumable: false,
      resolved: 12, total: 12, streak: 4, theme: "Item Knowledge",
    };
    const utils = await renderLobby();
    fireEvent.click(screen.getByTestId("ranked-play-gem"));
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    // The clause knows BEFORE it is pressed: the launcher is not there at all.
    await waitFor(() =>
      expect(screen.getByTestId("play-mode-daily-complete")).toBeTruthy(),
    );
    expect(screen.queryByTestId("play-mode-daily")).toBeNull();
    return utils;
  }

  it("knows the day is finished before the player presses anything", async () => {
    await openRecordOnAFinishedDay();
    const panel = screen.getByTestId("play-mode-daily-complete");
    expect(panel.textContent).toContain("Today's Challenge Complete");
    expect(panel.textContent).toContain("Come back tomorrow.");
  });

  /**
   * WHAT CHANGED, AND WHY IT HAD TO.
   *
   * This entry used to close the record and SCROLL to the lobby's Practice
   * panel, deliberately stopping short of starting anything. The panel is
   * withheld now (`HUB_MODULES.practicePanel`) — the category rail above it
   * is becoming the practice selector — so a scroll would have travelled to
   * nothing at all, which is precisely the silent-no-op defect the old scroll
   * machinery existed to prevent.
   *
   * So the entry now does what its own label has always promised — "Play
   * practice questions to improve" — and starts the catalog-wide set in
   * place, the same set the panel's primary action opened. The deferred
   * scroll, its ref and its Radix-teardown ordering note went with it: a
   * phase change has no such race, and it is the same synchronous shape the
   * Daily Challenge entry beside it already uses.
   */
  it("closes the record and STARTS practice, because there is no panel to visit", async () => {
    await openRecordOnAFinishedDay();

    fireEvent.click(screen.getByTestId("play-mode-daily-action"));

    // The record gets out of the way first — a dialog left open over a page
    // that is swapping itself out is a trap.
    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());

    // …and the catalog-wide practice set is the one that starts.
    await waitFor(() =>
      expect(questionsMock).toHaveBeenCalledWith("All Current Questions", 10),
    );

    // Still on the hub's own route: practice is a phase of this page, never
    // a navigation.
    expect(screen.getByTestId("location").textContent).toBe("/quiz");
  });

  it("does not scroll anywhere — there is no section left to scroll to", async () => {
    // The old contract travelled by ref to `hub-practice-section`. That
    // landmark is gone with the panel, and a handoff must not fall back to
    // scrolling the reader to an offset that means nothing.
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      await openRecordOnAFinishedDay();
      scrollIntoView.mockClear();
      fireEvent.click(screen.getByTestId("play-mode-daily-action"));
      await waitFor(() =>
        expect(questionsMock).toHaveBeenCalledWith("All Current Questions", 10),
      );
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("leaves the withheld Practice panel withheld", async () => {
    await openRecordOnAFinishedDay();
    fireEvent.click(screen.getByTestId("play-mode-daily-action"));
    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());
    // Starting practice must not resurrect the panel as a side effect.
    expect(screen.queryByTestId("hub-practice-section")).toBeNull();
    expect(screen.queryByTestId("practice-tiles")).toBeNull();
  });
});
