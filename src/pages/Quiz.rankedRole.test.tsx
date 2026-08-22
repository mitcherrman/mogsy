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
// Invite reads the Academy roster on open. Not what this file measures, and
// this file's supabase stub does not carry that query chain.
vi.mock("@/hooks/useFriends", () => ({
  useFriends: () => ({ friends: [], loading: false }),
}));
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

/**
 * Press PLAY and then choose RANKED MATCH.
 *
 * THE COMMIT MOVED. It used to fire on the PLAY press, which meant every
 * reader who opened the record to look at Daily Challenge spent one of ten
 * rate-limited `role_set` writes a minute on a role they never queued with.
 * The record now carries its own role stepper, and Ranked — the only entry
 * that queues — is the thing that writes.
 *
 * Everything these tests exist to protect is unchanged: browsing writes
 * nothing, the write happens exactly once, an unchanged role writes nothing,
 * and a refusal does not carry the reader onward. Only the press that
 * triggers it moved one step later.
 */
async function playRanked() {
  play();
  await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
  fireEvent.click(screen.getByTestId("play-mode-ranked"));
}

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
  it("persists the settled role exactly once, then opens the record", async () => {
    // Stored role is Top; the reader wanders and settles on Mid.
    await renderHub();
    browseRing(15);          // three full laps, back on Top
    browseTo("mid");
    expect(selectRole).not.toHaveBeenCalled();

    await playRanked();
    await waitFor(() => expect(selectRole).toHaveBeenCalledTimes(1));
    // The record's stepper opened on the lobby's settled choice, so Ranked
    // commits Mid without the reader touching anything on the record.
    expect(selectRole).toHaveBeenLastCalledWith("mid");
    // No navigation: `/quiz/ranked` is entered only once the SERVER has a
    // match. Staying on /quiz is part of the assertion, not incidental.
    await waitFor(() =>
      expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("ranked"),
    );
    expect(screen.getByTestId("location").textContent).toBe("/quiz");
  });

  it("writes NOTHING when the settled role is the one already stored", async () => {
    // Stored role is Top. The reader spins a full lap and lands back on Top —
    // a real journey that changes nothing, and must cost nothing.
    await renderHub();
    browseRing(5);           // one full lap, back where it started
    expect(screen.getByTestId("ranked-class-champion").getAttribute("data-role")).toBe("top");

    await playRanked();
    await waitFor(() =>
      expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("ranked"),
    );
    expect(screen.getByTestId("location").textContent).toBe("/quiz");
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("writes NOTHING when the reader never touches the stage", async () => {
    await renderHub();
    await playRanked();
    await waitFor(() =>
      expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("ranked"),
    );
    expect(screen.getByTestId("location").textContent).toBe("/quiz");
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("writes NOTHING when the reader only OPENS the record", async () => {
    // The reason the commit moved. Opening the record to look at Daily
    // Challenge must not spend one of ten role writes a minute.
    await renderHub();
    browseTo("mid");
    play();
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("commits a FIRST role for an account that has never chosen one", async () => {
    roleState = { role: null, error: null };
    await renderHub();
    browseTo("adc");
    expect(selectRole).not.toHaveBeenCalled();

    await playRanked();
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

    await playRanked();
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("location").textContent).toBe("/quiz");
    expect(screen.queryByTestId("ranked-route")).toBeNull();
    // And the record stays on its menu — a refused write must not leave the
    // reader in matchmaking under a role the account never took.
    expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("menu");
  });

  it("reuses ONE toast id across a burst of refusals, so copies cannot stack", async () => {
    roleState = { role: "top", error: "too many requests; slow down" };
    selectRole.mockResolvedValue(false);
    await renderHub();
    browseTo("mid");

    // Repeated Ranked presses inside the open record are the route a burst
    // can still take.
    play();
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByTestId("play-mode-ranked"));
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

  it("keeps the local choice after a refusal, so Ranked can be retried", async () => {
    roleState = { role: "top", error: "too many requests; slow down" };
    selectRole.mockResolvedValue(false);
    await renderHub();
    browseTo("mid");

    await playRanked();
    await waitFor(() => expect(selectRole).toHaveBeenCalledTimes(1));
    // The stage still shows what the reader chose — a refusal must not
    // silently snap them back to the stored role.
    expect(screen.getByTestId("ranked-class-champion").getAttribute("data-role")).toBe("mid");

    // The record stayed on its menu, so the retry is another Ranked press —
    // no reopening, and the stepper is still showing Mid.
    expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("menu");
    expect(screen.getByTestId("play-scroll-role-name").textContent).toBe("Mid");

    selectRole.mockResolvedValue(true);
    fireEvent.click(screen.getByTestId("play-mode-ranked"));
    await waitFor(() => expect(selectRole).toHaveBeenCalledTimes(2));
    expect(selectRole).toHaveBeenLastCalledWith("mid");
  });
});

/**
 * ONE ROLE SELECTION, TWO RENDERINGS OF IT.
 *
 * The record used to keep a `previewRole` of its own, seeded from the lobby
 * and never propagated back — so stepping an arrow on the record moved a
 * figure the lobby knew nothing about, and closing the record threw the
 * player's choice away. There is now a single local value
 * (`pendingRankedRole` → `effectiveRankedRole`): the lobby's stage renders
 * it, the record's stepper renders it, and the record's arrows are the
 * lobby's own setter.
 *
 * These run the real page, so "both surfaces agree" is measured on both
 * surfaces rather than asserted about one.
 */
describe("the lobby and the record share one role selection", () => {
  /** What the LOBBY's stage is pointing at, behind the open record. */
  const lobbyRole = () =>
    screen.getByTestId("ranked-class-champion").getAttribute("data-role");
  /** What the RECORD's stepper is showing. */
  const scrollRole = () =>
    screen.getByTestId("play-scroll-mascot").getAttribute("data-role");

  async function openRecord() {
    play();
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
  }

  it("opens on the role the lobby is already showing", async () => {
    await renderHub();          // stored role is Top
    browseTo("mid");            // local only
    expect(lobbyRole()).toBe("mid");

    await openRecord();
    expect(scrollRole()).toBe("mid");
    expect(screen.getByTestId("play-scroll-role-name").textContent).toBe("Mid");
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("moves BOTH when the record's next arrow is pressed", async () => {
    await renderHub();          // Top
    await openRecord();
    expect(lobbyRole()).toBe("top");
    expect(scrollRole()).toBe("top");

    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    await waitFor(() => expect(scrollRole()).toBe("jungle"));
    // The lobby's stage followed, in its own transition, behind the sheet.
    expect(lobbyRole()).toBe("jungle");

    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    await waitFor(() => expect(scrollRole()).toBe("mid"));
    expect(lobbyRole()).toBe("mid");
  });

  it("moves BOTH when the record's previous arrow is pressed", async () => {
    await renderHub();
    await openRecord();
    fireEvent.click(screen.getByTestId("play-scroll-role-prev"));
    await waitFor(() => expect(scrollRole()).toBe("support"));   // wraps
    expect(lobbyRole()).toBe("support");
  });

  it("wraps in the canonical order, on both surfaces at once", async () => {
    await renderHub();
    await openRecord();
    for (const expected of ["jungle", "mid", "adc", "support", "top"]) {
      fireEvent.click(screen.getByTestId("play-scroll-role-next"));
      await waitFor(() => expect(scrollRole()).toBe(expected));
      expect(lobbyRole()).toBe(expected);
    }
  });

  it("WRITES NOTHING however far the record is stepped", async () => {
    // Three laps of a five-role ring — three times the whole minute's budget
    // under a per-move write.
    await renderHub();
    await openRecord();
    for (let i = 0; i < 15; i += 1) {
      fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    }
    await waitFor(() => expect(scrollRole()).toBe("top"));
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("keeps the choice on the lobby after the record is dismissed", async () => {
    await renderHub();          // Top
    await openRecord();
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    await waitFor(() => expect(scrollRole()).toBe("jungle"));

    fireEvent.click(screen.getByTestId("play-scroll-close"));
    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());

    // The lobby stays where the player left it — and still nothing written.
    expect(lobbyRole()).toBe("jungle");
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("reopens on the role the player left it on", async () => {
    await renderHub();
    await openRecord();
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    await waitFor(() => expect(scrollRole()).toBe("mid"));
    fireEvent.click(screen.getByTestId("play-scroll-close"));
    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());

    await openRecord();
    expect(scrollRole()).toBe("mid");
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("commits the SHARED role once when Ranked is chosen", async () => {
    await renderHub();
    await openRecord();
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));   // jungle
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));   // mid
    expect(selectRole).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("play-mode-ranked"));
    await waitFor(() => expect(selectRole).toHaveBeenCalledTimes(1));
    expect(selectRole).toHaveBeenLastCalledWith("mid");
    await waitFor(() =>
      expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("ranked"),
    );
  });

  it("commits NOTHING for Daily Challenge after a role change", async () => {
    await renderHub();
    await openRecord();
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    await waitFor(() => expect(scrollRole()).toBe("jungle"));

    fireEvent.click(screen.getByTestId("play-mode-daily"));
    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());
    // No write. (The lobby's stage is not asserted here: the Daily Challenge
    // host swaps the whole lobby out for the question view, so there is no
    // stage left to read — the surviving-choice case is the DISMISS test
    // above, where the lobby is still on screen.)
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("commits NOTHING for Invite after a role change", async () => {
    await renderHub();
    await openRecord();
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    await waitFor(() => expect(scrollRole()).toBe("jungle"));

    fireEvent.click(screen.getByTestId("play-mode-invite"));
    await waitFor(() =>
      expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("invite"),
    );
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("commits NOTHING for Practice after a role change", async () => {
    await renderHub();
    await openRecord();
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    await waitFor(() => expect(scrollRole()).toBe("jungle"));

    fireEvent.click(screen.getByTestId("play-scroll-practice"));
    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());
    expect(selectRole).not.toHaveBeenCalled();
    expect(lobbyRole()).toBe("jungle");
  });

  it("never shows a no-role state, even for an account that has never picked", async () => {
    roleState = { role: null, error: null };
    await renderHub();
    await openRecord();
    // Both surfaces land on the head of the canonical order without anything
    // being written to make them agree.
    expect(scrollRole()).toBe("top");
    expect(lobbyRole()).toBe("top");
    expect(screen.getByTestId("play-scroll").textContent).not.toContain("No role chosen");
    expect(selectRole).not.toHaveBeenCalled();
  });
});
