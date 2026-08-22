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
 * it has no quiz host to hand a set to, so the record simply closes and
 * leaves the preview page's own furniture on screen.
 *
 * The claim that needed evidence rather than a reading of the wiring is this
 * one: on the REAL page the same press starts the real Daily Challenge. So
 * these two run the actual `Quiz` page, press the actual clause, and watch
 * the actual host.
 */
describe("Daily Challenge hands off to the page's own host", () => {
  it("closes the record and swaps the lobby out for today's questions", async () => {
    dailyResponse = () => ({
      ok: true,
      // The real `QuizQuestion` shape — `question_text` and `choices`, not
      // `question`/`options`. A question the host cannot render would make
      // this test pass for the wrong reason.
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

    // The record gets out of the way — the host replaces the whole lobby, and
    // a dialog left open over a page that no longer exists is a trap.
    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());

    // And the host really did take over: the lobby is gone and the day's
    // question is on screen. This is the assertion the dev preview cannot
    // make, and the one the report turns on.
    await waitFor(() =>
      expect(screen.getByText(/Hand of Baron/)).toBeTruthy(),
    );
    expect(container.querySelector('[data-testid="leaguecraft-workspace"]')).toBeNull();

    // Still no navigation. The Daily Challenge is hosted in place.
    expect(screen.getByTestId("location").textContent).toBe("/quiz");
  });

  it("returns to the lobby when the day's set is already finished", async () => {
    // A REAL production case, and a quiet one: the host filters to unanswered
    // questions, finds none, and puts the page back to `sets` — which is the
    // lobby. Pressing Daily Challenge on a completed day therefore closes the
    // record and appears to do nothing. Pinned here because the streak-only
    // clause no longer prints "Complete", so nothing on the card warns first.
    dailyResponse = () => ({
      ok: true,
      questions: [
        {
          id: 902, category: "Monsters", question_text: "Already answered",
          format: "multiple_choice", choices: ["a"], answered: true,
        },
      ],
      answered: 5, target: 5, daily_streak: 4,
    });

    const { container } = await renderLobby();
    fireEvent.click(screen.getByTestId("ranked-play-gem"));
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    fireEvent.click(screen.getByTestId("play-mode-daily"));

    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());
    // Back on the lobby, with no question and no message.
    await waitFor(() =>
      expect(container.querySelector('[data-testid="leaguecraft-workspace"]')).not.toBeNull(),
    );
    expect(screen.queryByText(/Already answered/)).toBeNull();
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

  async function openRecordOnAFinishedDay() {
    dailyResponse = COMPLETED_DAY;
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
