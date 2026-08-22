/**
 * Meta Reflex — its Leaguecraft entry point, under the Ranked-first redesign.
 *
 * Leaguecraft owns /quiz, /quiz/ranked, /quiz/stat-check and /quiz/mastery
 * (src/lib/ranked-tutorial/onboarding.ts). Meta Reflex (internally League
 * Swipe) was removed from the /lol hub on 2026-07-29 on the stated basis that
 * it "now lives inside Leaguecraft"; the Leaguecraft entry was then written as
 * a hub card.
 *
 * The LC1 redesign makes /quiz a Ranked-first one-page hub, and WITHHOLDS that
 * card along with the other standalone modes (Time Trial, Stat Check,
 * Knowledge Breakdown, Achievements) — see HUB_MODULES in Quiz.tsx. Withheld is
 * not retired: the card, its route and its branding are all intact, and
 * flipping HUB_MODULES.metaReflex restores it in place.
 *
 * These tests therefore lock in two things at once: that the hub does not
 * surface the entry today, and that the module behind it is still whole — so a
 * future "no entry point at all" regression is still caught.
 *
 * WHY THIS IS A SEPARATE FILE FROM Quiz.hub.test.tsx: it was originally split
 * off because that suite's `beforeEach` called `localStorage.clear()`, which
 * throws in this repo's vitest/jsdom environment and errored out every test in
 * it. That call is now optional-guarded there, but this file stays separate: it
 * covers a cross-namespace concern (/league-swipe) rather than the hub's own
 * composition.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
vi.mock("@/lib/backend-auth", () => ({ ensureBackendAuthToken: async () => "test-token" }));

const SETS = [{ id: 1, name: "Item Build Paths", description: "Recipes", question_count: 120 }];

vi.mock("@/lib/quiz/api", () => ({
  quizApi: {
    sets: async () => ({ sets: SETS }),
    questions: async () => ({ questions: [] }),
    getProgress: async () => ({
      rank_name: "Bronze", attempts: 2, current_streak: 3, best_streak: 7, accuracy: 71.2,
    }),
    getCategories: async () => ({ categories: [] }),
    getAchievements: async () => ({ achievements: [] }),
    getDailyChallenge: async () => ({ ok: false }),
    getHistory: async () => ({ ok: true, results: [], total_count: 0, is_pro: false, limited: false, free_limit: 10, upsell_message: null }),
    startSession: async () => ({ ok: false }),
    completeSession: async () => ({}),
  },
  resolveQuizAssetUrl: (p?: string) => (p ? `http://assets.local/${p}` : undefined),
  progressAttempts: (p: { attempts?: number } | null) => p?.attempts ?? 0,
}));

import QuizPage from "./Quiz";
import {
  META_REFLEX_NAME,
  META_REFLEX_ROUTE,
  META_REFLEX_TAGLINE,
} from "@/lib/league-swipe/branding";

async function renderHub() {
  const utils = render(
    <MemoryRouter initialEntries={["/quiz"]}>
      <QuizPage />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(utils.container.querySelectorAll('[data-testid="practice-tile"]').length).toBe(
      SETS.length,
    ),
  );
  return utils;
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Leaguecraft → Meta Reflex, withheld from the Ranked-first hub", () => {
  it("does not surface the Meta Reflex card on the hub", async () => {
    await renderHub();
    // Withheld by HUB_MODULES.metaReflex, alongside the other standalone modes.
    expect(screen.queryByTestId("hub-meta-reflex-section")).toBeNull();
    expect(screen.queryByTestId("hub-meta-reflex-link")).toBeNull();
  });

  it("keeps the module whole: the preserved public URL and its branding", () => {
    // The card is hidden, not deleted, so the constants it renders must still
    // resolve. /league-swipe is a live public URL — a route migration for
    // organisational tidiness alone would break existing links, so the entry
    // point reaches across namespaces on purpose.
    expect(META_REFLEX_ROUTE).toBe("/league-swipe");
    expect(META_REFLEX_NAME).toBe("Meta Reflex");
    expect(META_REFLEX_NAME).not.toMatch(/League Swipe/);
    expect(META_REFLEX_TAGLINE).toBeTruthy();
  });

  it("exposes no dev-only or unrelated swipe route in its place", async () => {
    const { container } = await renderHub();
    const hrefs = Array.from(container.querySelectorAll("a[href]")).map((a) =>
      a.getAttribute("href"),
    );
    // The legacy general-Mogsy swipe product, the Aura Check sibling, and the
    // unauthenticated ranked-duel prototype must not gain an entry point here.
    for (const forbidden of ["/swipe", "/swipe-game", "/swipe-leagues", "/elo-check"]) {
      expect(hrefs).not.toContain(forbidden);
    }
    expect(hrefs.filter((h) => h?.startsWith("/dev/"))).toHaveLength(0);
    // Withholding Meta Reflex must not have quietly withheld /league-swipe's
    // siblings into the hub either.
    expect(hrefs).not.toContain("/league-swipe/stats");
  });

  it("leaves the Leaguecraft mode entry that the redesign keeps intact", async () => {
    await renderHub();
    // Mastery Journey is the one standalone mode the Ranked-first hub still
    // hosts; Stat Check is withheld with Meta Reflex, at /quiz/stat-check.
    expect(screen.getByTestId("hub-mastery-link").getAttribute("href")).toBe("/quiz/mastery");
    expect(screen.queryByTestId("hub-stat-check-link")).toBeNull();
  });
});
