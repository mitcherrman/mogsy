/**
 * MALT — the Leaguecraft lobby's role WRITE path.
 *
 * BROWSING IS LOCAL, PLAY IS THE COMMIT. `PUT /api/ranked/role` is rate
 * limited to ten writes per account per minute (`role_set`). While the
 * carousel wrote on every move, two laps of the five-role ring spent the whole
 * budget and the next move came back `429 RANKED_RATE_LIMITED` — from nothing
 * but looking through five mascots. The stage now moves against local state
 * and the account is written once, when the reader commits.
 *
 * What these cover, from a click on the stage all the way to the network call
 * and the notice it can produce:
 *
 *  1. NO write happens while browsing, however far the ring is spun;
 *  2. PLAY writes the settled role exactly once, then navigates;
 *  3. PLAY writes NOTHING when the choice already matches the stored role
 *     (this subsumes the e07da052 same-mascot guard, which is also still
 *     asserted directly);
 *  4. a refused commit surfaces once, reuses ONE toast id, and does NOT
 *     navigate — sending the reader into Ranked as the wrong role would be
 *     worse than keeping them on the lobby where they can act on the notice.
 *
 * The controller is faked at the hook boundary so the assertions are about the
 * page's own behaviour and not about the Ranked service.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RankedRole } from "@/lib/ranked-public/roles";

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

const SETS = [
  { id: 5, name: "All Current Questions", description: "Everything", question_count: 1260 },
  { id: 2, name: "Item Knowledge", description: "Recipes", question_count: 606 },
];

vi.mock("@/lib/quiz/api", () => ({
  quizApi: {
    sets: async () => ({ sets: SETS }),
    questions: async () => ({ questions: [] }),
    getProgress: async () => ({ rank_name: "Bronze", attempts: 2, current_streak: 1, best_streak: 2, accuracy: 50 }),
    getCategories: async () => ({ categories: [] }),
    getAchievements: async () => ({ achievements: [] }),
    getDailyChallenge: async () => ({ ok: false }),
    getHistory: async () => ({ ok: true, results: [] }),
    startSession: async () => ({ ok: false }),
    completeSession: async () => ({}),
  },
  resolveQuizAssetUrl: (p?: string) => (p ? `http://assets.local/${p}` : undefined),
  progressAttempts: (p: { attempts?: number } | null) => p?.attempts ?? 0,
}));

// The Ranked reads the lobby also makes; none of them is under test here.
vi.mock("@/pages/quiz-ranked/useRankedProgression", () => ({
  useRankedProgression: () => ({ loadState: "unavailable" as const, progression: null }),
}));
vi.mock("@/pages/quiz-ranked/useRankedMatchHistory", () => ({
  useRankedMatchHistory: () => ({ loadState: "ready" as const, entries: [], limit: 20 }),
}));
vi.mock("@/hooks/useProfileIdentity", () => ({
  useProfileIdentity: () => ({ loading: false, displayName: null, avatarUrl: null }),
}));

/** The role write, faked at the controller boundary. */
const selectRole = vi.fn(async (_role: RankedRole) => true);
let roleState: { role: RankedRole | null; error: string | null } = { role: "top", error: null };
vi.mock("@/pages/quiz-ranked/useRankedRole", () => ({
  useRankedRole: () => ({
    loadState: "ready" as const,
    role: roleState.role,
    saving: false,
    error: roleState.error,
    selectRole,
    clearError: () => {},
  }),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: Object.assign(vi.fn(), {
    error: (...a: unknown[]) => toastError(...a),
    success: vi.fn(),
    message: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import QuizPage from "./Quiz";

/** Where the router actually is, so "PLAY continued" is asserted as the
 *  navigation it is rather than inferred from a mock. */
function Location() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

async function renderHub() {
  const utils = render(
    <MemoryRouter initialEntries={["/quiz"]}>
      <Location />
      <Routes>
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/quiz/ranked" element={<div data-testid="ranked-route" />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByTestId("ranked-class-carousel")).toBeTruthy());
  return utils;
}

/**
 * Spin the ring forward `steps` times, the way a reader actually does it.
 *
 * The NEXT control, not the slides: the stage shows three of the five roles
 * and the two off-stage buttons are genuinely `disabled`, so clicking a
 * distant role is a no-op and would make this helper assert nothing. One
 * press of NEXT is one real role change, and the ring wraps — so five presses
 * is a full lap back to where it started.
 */
function browseRing(steps: number) {
  for (let i = 0; i < steps; i++) {
    fireEvent.click(screen.getByTestId("ranked-class-next"));
  }
  return steps;
}

/** Move the stage onto a specific role by stepping to it. */
function browseTo(role: "top" | "jungle" | "mid" | "adc" | "support") {
  const ring = ["top", "jungle", "mid", "adc", "support"] as const;
  const current = () =>
    screen.getByTestId("ranked-class-champion").getAttribute("data-role") as (typeof ring)[number];
  for (let guard = 0; guard < ring.length && current() !== role; guard++) {
    fireEvent.click(screen.getByTestId("ranked-class-next"));
  }
}

const play = () => fireEvent.click(screen.getByTestId("ranked-play-gem"));

beforeEach(() => {
  selectRole.mockClear();
  selectRole.mockResolvedValue(true);
  toastError.mockClear();
  roleState = { role: "top", error: null };
  localStorage.clear?.();
});
afterEach(cleanup);

describe("Leaguecraft lobby — browsing is local", () => {
  it("sends NOTHING when the already-selected mascot is clicked twenty-five times", async () => {
    // e07da052, preserved. The stage's own guard still refuses to re-select
    // the role it is already standing on, so this is a no-op twice over.
    await renderHub();
    const top = screen.getByTestId("ranked-class-slide-top");
    for (let i = 0; i < 25; i++) fireEvent.click(top);
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("sends NOTHING while the reader spins the whole ring, lap after lap", async () => {
    await renderHub();
    // Ten laps of five roles: fifty REAL role changes. At one write each that
    // is five times the account's whole per-minute budget and a guaranteed
    // 429; the point of the fix is that it is now zero requests.
    const moves = browseRing(50);
    expect(moves).toBe(50);
    expect(selectRole).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("still moves the stage and the ledger with every browse", async () => {
    await renderHub();
    const champion = () => screen.getByTestId("ranked-class-champion").getAttribute("data-role");
    const ledger = () => screen.getByTestId("role-mastery-ledger").getAttribute("data-role");
    expect(champion()).toBe("top");

    browseRing(1);
    await waitFor(() => expect(champion()).toBe("jungle"));
    expect(ledger()).toBe("jungle");

    browseRing(1);
    await waitFor(() => expect(champion()).toBe("mid"));
    expect(ledger()).toBe("mid");
    // Visuals followed the reader the whole way; the account never moved.
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("marks the browsed mascot as the selected one, not the stored role", async () => {
    // The stage's `value` is the EFFECTIVE role — the unsaved choice when
    // there is one. Leaving it on the stored role would tell a screen reader
    // the account still has Top selected while the reader is looking at Mid.
    await renderHub();
    browseTo("mid");
    await waitFor(() =>
      expect(screen.getByTestId("ranked-class-slide-mid").getAttribute("aria-checked")).toBe("true"),
    );
    expect(screen.getByTestId("ranked-class-slide-top").getAttribute("aria-checked")).toBe("false");
    expect(selectRole).not.toHaveBeenCalled();
  });
});

describe("Leaguecraft lobby — PLAY commits the role", () => {
  it("persists the settled role exactly once, then continues into Ranked", async () => {
    // Stored role is Top; the reader wanders and settles on Mid.
    await renderHub();
    browseRing(15);          // three full laps, back on Top
    browseTo("mid");
    expect(selectRole).not.toHaveBeenCalled();

    play();
    await waitFor(() => expect(selectRole).toHaveBeenCalledTimes(1));
    expect(selectRole).toHaveBeenLastCalledWith("mid");
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/quiz/ranked"));
  });

  it("writes NOTHING when the settled role is the one already stored", async () => {
    // Stored role is Top. The reader spins a full lap and lands back on Top —
    // a real journey that changes nothing, and must cost nothing.
    await renderHub();
    browseRing(5);           // one full lap, back where it started
    expect(screen.getByTestId("ranked-class-champion").getAttribute("data-role")).toBe("top");

    play();
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/quiz/ranked"));
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("writes NOTHING when the reader never touches the stage", async () => {
    await renderHub();
    play();
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/quiz/ranked"));
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("commits a FIRST role for an account that has never chosen one", async () => {
    roleState = { role: null, error: null };
    await renderHub();
    browseTo("adc");
    expect(selectRole).not.toHaveBeenCalled();

    play();
    await waitFor(() => expect(selectRole).toHaveBeenCalledTimes(1));
    expect(selectRole).toHaveBeenLastCalledWith("adc");
  });
});

describe("Leaguecraft lobby — a refused commit", () => {
  it("surfaces the refusal and does NOT continue into Ranked", async () => {
    // Landing in Ranked as the role the reader just tried to leave, with no
    // sign anything failed, is the one outcome worse than staying put.
    roleState = { role: "top", error: "Finish your active match before changing your role." };
    selectRole.mockResolvedValue(false);
    await renderHub();
    browseTo("mid");

    play();
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("location").textContent).toBe("/quiz");
    expect(screen.queryByTestId("ranked-route")).toBeNull();
  });

  it("reuses ONE toast id across a burst of refusals, so copies cannot stack", async () => {
    roleState = { role: "top", error: "too many requests; slow down" };
    selectRole.mockResolvedValue(false);
    await renderHub();
    browseTo("mid");

    // Repeated PLAY presses are the route a burst can still take.
    for (let i = 0; i < 5; i++) {
      play();
      await waitFor(() => expect(toastError).toHaveBeenCalledTimes(i + 1));
    }

    expect(toastError.mock.calls.length).toBe(5);
    const ids = new Set(
      toastError.mock.calls.map(([, opts]) => (opts as { id?: string } | undefined)?.id),
    );
    // One id, and a real one — an undefined id is a fresh toast every time.
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBeTruthy();
  });

  it("keeps the local choice after a refusal, so PLAY can be retried", async () => {
    roleState = { role: "top", error: "too many requests; slow down" };
    selectRole.mockResolvedValue(false);
    await renderHub();
    browseTo("mid");

    play();
    await waitFor(() => expect(selectRole).toHaveBeenCalledTimes(1));
    // The stage still shows what the reader chose — a refusal must not
    // silently snap them back to the stored role.
    expect(screen.getByTestId("ranked-class-champion").getAttribute("data-role")).toBe("mid");

    selectRole.mockResolvedValue(true);
    play();
    await waitFor(() => expect(selectRole).toHaveBeenCalledTimes(2));
    expect(selectRole).toHaveBeenLastCalledWith("mid");
  });
});
