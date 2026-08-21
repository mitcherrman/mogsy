/**
 * Leaguecraft hub (/quiz) — the Ranked-first one-page composition.
 *
 * Hierarchy under test: compact Leaguecraft header → the dominant Ranked hero
 * (with the absorbed progress strip) → one short secondary row of Recent
 * Studies and a demoted Practice panel, with Mastery as a link inside it. The modes withheld from this page (Time Trial / Daily, Stat
 * Check, Knowledge Breakdown, Achievements) must be absent from the hub while
 * their routes stay live elsewhere — see HUB_MODULES in Quiz.tsx.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
      // PLAY1: `useAppSettings` reads the whole app_settings table with a
      // bare `.select(...).then(...)` to resolve global platform policy. No
      // rows -> the fail-safe defaults, which is all three PLAY entries
      // visible.
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
}));

// Mirrors the shape the backend actually serves at /api/quiz/sets, including
// the catalog-wide set the "Practice Questions" primary action opens.
const SETS = [
  { id: 5, name: "All Current Questions", description: "Everything", question_count: 1260 },
  { id: 2, name: "Item Knowledge", description: "Recipes", question_count: 606 },
  { id: 3, name: "Champion Basics", description: "Kits", question_count: 522 },
];

const HISTORY = {
  ok: true,
  is_pro: false,
  total_count: 12,
  limited: false,
  free_limit: 10,
  upsell_message: null,
  results: [
    { session_id: 3, date: "2026-07-16", completed_at: "2026-07-16 10:00:00", mode: "standard", category: "Item Knowledge", score: 8, total_questions: 10, accuracy: 80 },
    { session_id: 2, date: "2026-07-15", completed_at: "2026-07-15 09:00:00", mode: "daily", category: null, score: 3, total_questions: 5, accuracy: 60 },
    { session_id: 1, date: "2026-07-14", completed_at: "2026-07-14 08:00:00", mode: "standard", category: "Champion Basics", score: 2, total_questions: 10, accuracy: 20 },
  ],
};

const questionsMock = vi.fn(async () => ({ questions: [] }));
const historyMock = vi.fn(async () => HISTORY);
vi.mock("@/lib/quiz/api", () => ({
  quizApi: {
    sets: async () => ({ sets: SETS }),
    questions: (...args: unknown[]) => questionsMock(...(args as [])),
    getProgress: async () => ({
      rank_name: "Bronze",
      attempts: 2,
      current_streak: 3,
      best_streak: 7,
      accuracy: 71.2,
    }),
    getCategories: async () => ({ categories: [] }),
    getAchievements: async () => ({ achievements: [] }),
    getDailyChallenge: async () => ({ ok: false }),
    getHistory: () => historyMock(),
    startSession: async () => ({ ok: false }),
    completeSession: async () => ({}),
  },
  resolveQuizAssetUrl: (p?: string) => (p ? `http://assets.local/${p}` : undefined),
  progressAttempts: (p: { attempts?: number } | null) => p?.attempts ?? 0,
}));

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

async function renderHub() {
  const utils = render(
    <MemoryRouter initialEntries={["/quiz"]}>
      <QuizPage />
      <LocationProbe />
    </MemoryRouter>,
  );
  // Wait on the practice tiles, not on a set name: category names such as
  // "Item Knowledge" legitimately appear in the history rows too.
  await waitFor(() =>
    expect(utils.container.querySelectorAll('[data-testid="practice-tile"]').length).toBe(
      SETS.length,
    ),
  );
  return utils;
}

import QuizPage from "./Quiz";

beforeEach(() => {
  questionsMock.mockClear();
  historyMock.mockClear();
  historyMock.mockResolvedValue(HISTORY);
  // Optional-call: in this repo's vitest/jsdom environment `localStorage`
  // is a bare object with no Storage methods, and an unguarded call throws
  // in `beforeEach` — which silently errored out every test in this file
  // before the redesign. Guarding here keeps the reset when the environment
  // provides one, without touching the shared setup other suites rely on.
  localStorage.clear?.();
});
afterEach(cleanup);

describe("Leaguecraft hub — top chrome", () => {
  // The lobby has NO utility/header row of its own. It used to, and the row
  // cost the three parchment columns the strip directly under the shell's HUD
  // band — the space the scroll caps want. Every control on it was decorative
  // or reachable elsewhere, so the whole row is gone from this phase rather
  // than shrunk. These assertions are the guard against it creeping back.
  it("renders no header row above the lobby", async () => {
    const { container } = await renderHub();
    expect(container.querySelector("header")).toBeNull();
  });

  it("drops the decorative tagline from the lobby", async () => {
    await renderHub();
    expect(screen.queryByText("Study. Practice. Ascend.")).toBeNull();
  });

  it("leaves the /lol escape to the shell's own home control, not a second inline pill", async () => {
    // LEAGUE_ONLY_MODE points GlobalHud's always-present top-left home control
    // at /lol (see GlobalHud.test.tsx), so an inline "League Hub" link here was
    // a duplicate of it that cost a whole row of document flow.
    await renderHub();
    expect(screen.queryByLabelText("Back to League hub")).toBeNull();
  });

  it("keeps exactly one h1 — the centre scroll's wordmark", async () => {
    const { container } = await renderHub();
    const h1s = [...container.querySelectorAll("h1")];
    expect(h1s.length).toBe(1);
    expect(h1s[0].textContent).toContain("LEAGUECRAFT");
  });

  it("demotes the tutorial entry below the lobby without removing it", async () => {
    // /quiz/tutorial has no other UI entry point, and the platform-policy copy
    // promises it stays available, so this link may be MOVED but never deleted.
    const { container } = await renderHub();
    const link = screen.getByTestId("replay-tutorial-link");
    expect(link.getAttribute("href")).toBe("/quiz/tutorial");

    const utility = container.querySelector('[data-testid="hub-utility-line"]')!;
    expect(utility).not.toBeNull();
    expect(utility.contains(link)).toBe(true);

    // Below the composition, in DOM (= tab) order.
    const ranked = container.querySelector('[data-testid="hub-ranked-section"]')!;
    expect(
      ranked.compareDocumentPosition(utility) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("Leaguecraft hub — hierarchy", () => {
  it("orders Ranked hero → Recent Studies → the demoted Practice panel", async () => {
    const { container } = await renderHub();
    const ranked = container.querySelector('[data-testid="hub-ranked-section"]')!;
    const recent = container.querySelector('[data-testid="hub-recent-section"]')!;
    const practice = container.querySelector('[data-testid="hub-practice-section"]')!;
    for (const el of [ranked, recent, practice]) expect(el).not.toBeNull();
    const follows = (a: Element, b: Element) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(follows(ranked, recent)).toBeTruthy();
    expect(follows(recent, practice)).toBeTruthy();
    expect(ranked.querySelector('[data-testid="ranked-hero"]')).not.toBeNull();
    // Mastery no longer gets a band of its own: it lives inside the study
    // panel, below Practice, as the quietest link on the page.
    expect(container.querySelector('[data-testid="hub-mastery-section"]')).toBeNull();
    expect(practice.querySelector('[data-testid="hub-mastery-link"]')).not.toBeNull();
  });

  it("the Ranked hero keeps the personal records ledger + profile link", async () => {
    const { container } = await renderHub();
    const hero = container.querySelector('[data-testid="ranked-hero"]')!;
    // MALT: the four rounded stat tiles are now ruled ledger lines on the
    // Academy sheet. Same real figures, parchment-native treatment.
    const strip = hero.querySelector('[data-testid="hero-personal-records"]')!;
    expect(strip.textContent).toContain("Current streak");
    expect(strip.textContent).toContain("Best streak");
    expect(strip.textContent).toContain("71%"); // rounded accuracy
    expect(strip.textContent).not.toContain("71.2");
    expect(strip.textContent).toContain("Questions answered");
    expect(hero.querySelector('a[href="/profile"]')?.textContent).toMatch(/View full profile/);
  });

  it("shows placement as a compact state inside the Ranked block, not a screen", async () => {
    const { container } = await renderHub();
    // The pre-placement state names the ladder's FLOOR rather than exclusion
    // from it: Bronze is the lowest of the five tiers. It is still not a tier
    // CLAIM — the emblem carries `data-baseline`, and no rating is shown.
    expect(screen.getByRole("heading", { name: "Bronze" })).toBeTruthy();
    expect(screen.queryByText("Unranked")).toBeNull();
    expect(screen.getByTestId("hub-ranked-placement").textContent).toContain("Placement 2 / 5");
    expect(screen.queryByTestId("hub-ranked-rating")).toBeNull();
    // MALT removed the permanent placement furniture: no "Placement Series"
    // headline, no Bronze pill, no explanatory paragraph, and no popup.
    expect(container.textContent).not.toContain("Placement Series");
    expect(container.textContent).not.toContain("Complete your placement matches");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(screen.getByRole("button", { name: /^Play$/ })).toBeTruthy();
  });

  /**
   * PLAY1: PLAY opens the match-entry record ON the lobby. It does NOT
   * navigate — the lobby stays mounted behind the record, and `/quiz/ranked`
   * is only reached once the server actually has a match.
   */
  it("the Ranked CTA opens the match-entry record without leaving the lobby", async () => {
    await renderHub();
    fireEvent.click(screen.getByRole("button", { name: /^Play$/ }));
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    expect(screen.getByTestId("location").textContent).toBe("/quiz");
    // The lobby is still there, behind the record.
    expect(screen.getByTestId("hub-ranked-section")).toBeTruthy();
  });
});

describe("Leaguecraft hub — Practice for Ranked", () => {
  it("states its purpose and offers one primary action", async () => {
    await renderHub();
    expect(screen.getByRole("heading", { name: /Practice for Ranked/i })).toBeTruthy();
    expect(screen.getByText("Sharpen the knowledge used in Ranked.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("practice-primary-cta"));
    await waitFor(() =>
      expect(questionsMock).toHaveBeenCalledWith("All Current Questions", 10),
    );
  });

  it("keeps every category compact, with its real question count and start action", async () => {
    const { container } = await renderHub();
    const tiles = Array.from(container.querySelectorAll('[data-testid="practice-tile"]'));
    expect(tiles.length).toBe(SETS.length);
    // Real counts from the catalog, not invented numbers.
    const tileText = container.querySelector('[data-testid="practice-tiles"]')!.textContent!;
    expect(tileText).toContain("1,260 Q");
    expect(tileText).toContain("606 Q");
    const championTile = tiles.find((t) => t.textContent?.includes("Champion Basics"))!;
    fireEvent.click(championTile);
    await waitFor(() => expect(questionsMock).toHaveBeenCalledWith("Champion Basics", 10));
  });
});

describe("Leaguecraft hub — Recent Studies", () => {
  it("uses the real history data and the real history route", async () => {
    const { container } = await renderHub();
    expect(screen.getByRole("heading", { name: /Recent Studies/i })).toBeTruthy();
    expect(screen.getByText("How am I doing?")).toBeTruthy();
    await waitFor(() =>
      expect(container.querySelectorAll('[data-testid="history-row"]').length).toBe(3),
    );
    const rows = container.querySelectorAll('[data-testid="history-row"]');
    expect(rows[0].textContent).toContain("Item Knowledge");
    expect(rows[0].textContent).toContain("8/10");
    expect(rows[0].textContent).toContain("80%");
    expect(rows[1].textContent).toContain("Daily");
    expect(rows[2].textContent).toContain("2/10");
    expect(
      screen.getByRole("link", { name: /View full history/ }).getAttribute("href"),
    ).toBe("/lol/history");
  });

  it("shows the honest empty state, whose CTA drives the Ranked flow", async () => {
    historyMock.mockResolvedValue({ ...HISTORY, results: [], total_count: 0 });
    const { container } = await renderHub();
    await waitFor(() =>
      expect(container.querySelector('[data-testid="history-empty"]')).not.toBeNull(),
    );
    expect(screen.getByText("No quiz results yet")).toBeTruthy();
    // The second way in, and it opens the same record the seal does.
    fireEvent.click(screen.getByRole("button", { name: /Play Ranked/ }));
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    expect(screen.getByTestId("location").textContent).toBe("/quiz");
  });
});

describe("Leaguecraft hub — Mastery", () => {
  it("keeps Mastery as one quiet strip that still links to the journeys", async () => {
    await renderHub();
    expect(screen.getByTestId("hub-mastery-link").getAttribute("href")).toBe("/quiz/mastery");
  });
});

describe("Leaguecraft hub — modes withheld from this page", () => {
  it("does not surface Time Trial, Daily, Stat Check, Knowledge Breakdown or Achievements", async () => {
    const { container } = await renderHub();
    expect(container.querySelector('[data-testid="hub-score-attack-card"]')).toBeNull();
    expect(screen.queryByText("Daily Challenge")).toBeNull();
    expect(container.querySelector('[data-testid="hub-stat-check-link"]')).toBeNull();
    expect(screen.queryByText("Knowledge Breakdown")).toBeNull();
    expect(screen.queryByText("Achievements")).toBeNull();
    // …and the page is not simply empty in their place: the Ranked-first loop
    // is fully present.
    expect(container.querySelector('[data-testid="ranked-hero"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="hub-practice-section"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="hub-recent-section"]')).not.toBeNull();
  });

  it("keeps the diagnostics entry available for testing", async () => {
    await renderHub();
    expect(
      screen.getByRole("link", { name: /Diagnostics/ }).getAttribute("href"),
    ).toBe("/quiz/diagnostics");
  });
});
