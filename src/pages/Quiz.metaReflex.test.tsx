/**
 * Meta Reflex — the Leaguecraft entry point.
 *
 * Leaguecraft owns /quiz, /quiz/ranked, /quiz/stat-check and /quiz/mastery
 * (src/lib/ranked-tutorial/onboarding.ts). Meta Reflex (internally League
 * Swipe) was removed from the /lol hub on 2026-07-29 on the stated basis that
 * it "now lives inside Leaguecraft" — but that Leaguecraft entry was never
 * written, so the feature was left with no discoverable entry point at all.
 * These tests lock in the entry point and its branding.
 *
 * WHY THIS IS A SEPARATE FILE FROM Quiz.hub.test.tsx:
 * that suite's `beforeEach` calls `localStorage.clear()`, and in this repo's
 * vitest/jsdom environment `localStorage` is a plain `{}` with no Storage
 * methods at all — so all 15 of its tests error out before running, on a clean
 * checkout as well as this branch. Rather than entangle new coverage with an
 * unrelated pre-existing environment defect (or "fix" a shared setup file and
 * unmask a different workstream's stale expectations), this file carries the
 * same mocks minus that one call, so these assertions genuinely execute.
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
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
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

async function renderHub() {
  const utils = render(
    <MemoryRouter initialEntries={["/quiz"]}>
      <QuizPage />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByText("Item Build Paths")).toBeTruthy());
  return utils;
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Leaguecraft → Meta Reflex discovery", () => {
  it("offers a Meta Reflex entry on the Leaguecraft hub", async () => {
    await renderHub();
    expect(screen.getByTestId("hub-meta-reflex-section")).toBeTruthy();
    expect(screen.getByTestId("hub-meta-reflex-link")).toBeTruthy();
  });

  it("links to the PRESERVED public URL, not a migrated /quiz route", async () => {
    await renderHub();
    // /league-swipe is a live public URL. A route migration for organisational
    // tidiness alone would break existing links, so the entry point reaches
    // across namespaces on purpose.
    expect(screen.getByTestId("hub-meta-reflex-link").getAttribute("href")).toBe("/league-swipe");
  });

  it("calls it Meta Reflex, never the retired public name", async () => {
    const { container } = await renderHub();
    const section = container.querySelector('[data-testid="hub-meta-reflex-section"]')!;
    expect(section.textContent).toMatch(/Meta Reflex/);
    expect(section.textContent).not.toMatch(/League Swipe/);
  });

  it("places the entry in the hub body, above the practice grid", async () => {
    const { container } = await renderHub();
    const practice = container.querySelector('[data-testid="hub-practice-section"]')!;
    const reflex = container.querySelector('[data-testid="hub-meta-reflex-section"]')!;
    expect(reflex.compareDocumentPosition(practice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("exposes no dev-only or unrelated swipe route", async () => {
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
  });

  it("leaves the established Leaguecraft mode entries intact", async () => {
    await renderHub();
    // Adding Meta Reflex must not displace its siblings.
    expect(screen.getByTestId("hub-stat-check-link").getAttribute("href")).toBe("/quiz/stat-check");
    expect(screen.getByTestId("hub-mastery-link").getAttribute("href")).toBe("/quiz/mastery");
  });
});
