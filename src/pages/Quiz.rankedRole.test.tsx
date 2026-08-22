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
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
/**
 * The visitor's identity, switchable per case.
 *
 * A GUEST is not "signed out": the lobby gives anonymous visitors a real
 * Supabase anonymous session, so `user` is present and `is_anonymous` is true.
 * That distinction is the whole point of the Ranked gate — `!!user` is true for
 * exactly the visitor who may not enter Ranked.
 */
const auth = vi.hoisted(() => ({
  user: { id: "u1", is_anonymous: false } as { id: string; is_anonymous: boolean } | null,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: auth.user }) }));
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

const sfx = vi.hoisted(() => ({ play: vi.fn() }));

/**
 * PLAY1's sound layer, stubbed to a spy.
 *
 * This suite is where "one action, one sound" is proved END TO END: it mounts
 * the real page, so the record's stepper, the lobby's carousel and the one
 * shared role selection are all the production ones. The spy is what lets a
 * test count soundings; the gate that decides whether a sounding happens at all
 * is covered by `src/lib/audio/play-sfx.test.ts`.
 */
vi.mock("@/lib/audio/usePlaySfx", () => ({
  usePlaySfx: () => ({ play: sfx.play }),
}));

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
    // The REFUSAL REASON, read the instant the write settles. The page reports
    // it from here and not from `error`, which is render state and is still the
    // previous value in that tick — the defect that reported an account
    // refusal with generic role copy. See `useRankedRole.readWriteError`.
    readWriteError: () => roleState.error,
    clearError: () => {},
  }),
}));

const toastError = vi.fn();
/** Plain notices. The Ranked signup gate is a GATE, not a failure, so it is
 *  raised with `toast(...)` and must never appear in `toastError`. */
const toastNotice = vi.fn();
vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: Object.assign((...a: unknown[]) => toastNotice(...a), {
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
  const loc = useLocation();
  return (
    <>
      <span data-testid="location">{loc.pathname}</span>
      {/* The full href, so a destination whose INTENT lives in the query — the
          signup gate's Leaguecraft return target — can be asserted. */}
      <span data-testid="location-href">{`${loc.pathname}${loc.search}`}</span>
    </>
  );
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
  auth.user = { id: "u1", is_anonymous: false };
  toastNotice.mockClear();
  sfx.play.mockClear();
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


/* ────────────────────────────────────────────────────────────────────────────
 * PLAY1 SOUND — the shared role selection, and the rule that makes it safe.
 *
 * One press of a role arrow inside the record changes TWO things on screen:
 * the mascot on the record's own stepper, and the lobby's carousel behind the
 * dimmed sheet — because both render `Quiz.tsx`'s one `effectiveRankedRole`.
 *
 * If the cue were fired from a surface REACTING to that value — an effect on
 * the role, a render-time trigger — it would fire twice. It is fired from the
 * arrow HANDLER in `PlayScrollRoleSelector`, which is the action itself, so it
 * cannot. Nothing in `RankedClassCarousel` or `RankedLobbyHero` makes a sound.
 *
 * These run against the real page for exactly that reason: a component test
 * with a frozen role prop would never render the second surface at all.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("PLAY1 sound — one action, one cue, across both role surfaces", () => {
  const lobbyRole = () =>
    screen.getByTestId("ranked-class-champion").getAttribute("data-role");
  const scrollRole = () =>
    screen.getByTestId("play-scroll-mascot").getAttribute("data-role");
  /** Every cue sounded so far, in order. */
  const cues = () => sfx.play.mock.calls.flat();

  async function openRecord() {
    play();
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
  }

  it("sounds the record unrolling once, and writes NO role to do it", async () => {
    await renderHub();
    sfx.play.mockClear();
    await openRecord();
    expect(cues()).toEqual(["scrollOpen"]);
    // THE CORRECTION THIS PHASE EXISTS TO KEEP: opening PLAY is "show me my
    // options", not "I have chosen". The commit lives on the Ranked clause.
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("moves BOTH mascots on one arrow press and plays exactly ONE tick", async () => {
    await renderHub();                 // stored role is Top
    await openRecord();
    expect(lobbyRole()).toBe("top");
    expect(scrollRole()).toBe("top");

    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));

    // Two visible things changed…
    await waitFor(() => expect(scrollRole()).toBe("jungle"));
    expect(lobbyRole()).toBe("jungle");
    // …and exactly one sound happened.
    expect(cues()).toEqual(["roleStep"]);
    // …and nothing was written for it.
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("plays one tick per press when the arrows are hammered, never two for one", async () => {
    await renderHub();
    await openRecord();
    sfx.play.mockClear();

    const next = screen.getByTestId("play-scroll-role-next");
    for (const expected of ["jungle", "mid", "adc", "support", "top"]) {
      fireEvent.click(next);
      await waitFor(() => expect(scrollRole()).toBe(expected));
      expect(lobbyRole()).toBe(expected);
    }

    // A full lap of a five-role ring: five presses, five ticks, and still no
    // write — three laps of this used to exhaust a minute's `role_set` budget.
    expect(cues()).toEqual(Array(5).fill("roleStep"));
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("ticks for the previous arrow too, on both surfaces", async () => {
    await renderHub();
    await openRecord();
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-scroll-role-prev"));
    await waitFor(() => expect(scrollRole()).toBe("support"));   // wraps
    expect(lobbyRole()).toBe("support");
    expect(cues()).toEqual(["roleStep"]);
  });

  it("sounds the seal, then the queue — in that order — when Ranked is chosen", async () => {
    await renderHub();
    await openRecord();
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));   // jungle
    sfx.play.mockClear();

    fireEvent.click(screen.getByTestId("play-mode-ranked"));
    await waitFor(() => expect(selectRole).toHaveBeenCalledTimes(1));
    expect(selectRole).toHaveBeenLastCalledWith("jungle");
    await waitFor(() =>
      expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("ranked"),
    );
    // The seal answered the PRESS; the commit that followed held, so there is
    // no refusal. Queue-start is the queue's own later event and has not
    // happened yet — the player has not pressed Enter the Queue.
    expect(cues()).toEqual(["modeConfirm"]);
  });

  it("sounds seal-then-refusal, and does NOT enter Ranked, when the write is declined", async () => {
    selectRole.mockResolvedValue(false);
    await renderHub();
    await openRecord();
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    sfx.play.mockClear();

    fireEvent.click(screen.getByTestId("play-mode-ranked"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(cues()).toEqual(["modeConfirm", "error"]);
    // The record stayed on its menu — so there is never a queue-start.
    expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("menu");
    expect(cues()).not.toContain("queueStart");
  });

  it("sounds one seal for Daily Challenge, and commits nothing", async () => {
    await renderHub();
    await openRecord();
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    sfx.play.mockClear();

    fireEvent.click(screen.getByTestId("play-mode-daily"));
    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());
    // The record closed as part of the handoff — one deliberate cue for the
    // action, not a seal plus a redundant close.
    expect(cues()).toEqual(["modeConfirm"]);
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("sounds one seal for Invite, and commits nothing", async () => {
    await renderHub();
    await openRecord();
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-mode-invite"));
    await waitFor(() =>
      expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("invite"),
    );
    expect(cues()).toEqual(["modeConfirm"]);
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("sounds one seal for Practice, and commits nothing", async () => {
    await renderHub();
    await openRecord();
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-scroll-practice"));
    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());
    expect(cues()).toEqual(["modeConfirm"]);
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("sounds the sheet rolling shut on a dismissal, and keeps the local choice", async () => {
    await renderHub();
    await openRecord();
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    await waitFor(() => expect(scrollRole()).toBe("jungle"));
    sfx.play.mockClear();

    fireEvent.click(screen.getByTestId("play-scroll-close"));
    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());
    expect(cues()).toEqual(["scrollClose"]);
    // The continuity this phase must not break: the choice survives, unwritten.
    expect(lobbyRole()).toBe("jungle");
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("reopens on the preserved role, sounding only the unroll", async () => {
    await renderHub();
    await openRecord();
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    await waitFor(() => expect(scrollRole()).toBe("jungle"));
    fireEvent.click(screen.getByTestId("play-scroll-close"));
    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());

    sfx.play.mockClear();
    await openRecord();
    expect(scrollRole()).toBe("jungle");
    expect(cues()).toEqual(["scrollOpen"]);
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("answers a poke at the record's mascot, once, with no role change", async () => {
    await renderHub();
    await openRecord();
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-scroll-mascot"));
    expect(cues()).toEqual(["mascotReact"]);
    expect(scrollRole()).toBe("top");
    expect(lobbyRole()).toBe("top");
    expect(selectRole).not.toHaveBeenCalled();
  });
});


/* ────────────────────────────────────────────────────────────────────────────
 * THE RANKED SIGNUP GATE — one question, asked first, answered once.
 *
 * THE BUG THIS REPLACES. Ranked is account-only on the server: `PUT
 * /api/ranked/role` and `POST /api/ranked/queue` both sit behind
 * `require_account_identity`, which answers an anonymous session `403
 * ACCOUNT_REQUIRED`. The lobby used to discover that by ATTEMPTING the write,
 * which produced two messages for one cause and neither of them the point:
 *
 *   1. the refused role write was reported with the host's ROLE copy, so a
 *      guest looking straight at a selected mascot was told the role had
 *      failed — indistinguishable from "pick a role";
 *   2. the queue, polled from the moment the record opens, independently
 *      resolved `unavailable` for the same account reason and had its own
 *      sign-in sentence ready.
 *
 * The eligibility question is now asked BEFORE anything is attempted, so
 * neither of those paths is reached at all.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("a guest pressing Ranked Match", () => {
  const asGuest = () => { auth.user = { id: "anon1", is_anonymous: true }; };
  const scrollRole = () =>
    screen.getByTestId("play-scroll-mascot").getAttribute("data-role");
  const lobbyRole = () =>
    screen.getByTestId("ranked-class-champion").getAttribute("data-role");

  async function guestAtRanked() {
    asGuest();
    await renderHub();
    // Choose a role visually, exactly as the report describes.
    fireEvent.click(screen.getByTestId("ranked-class-next"));   // top -> jungle
    play();
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    fireEvent.click(screen.getByTestId("play-mode-ranked"));
    await waitFor(() => expect(toastNotice).toHaveBeenCalled());
  }

  it("raises the signup notice and NOTHING else", async () => {
    await guestAtRanked();
    expect(toastNotice).toHaveBeenCalledTimes(1);
    // No role error, no queue error, no generic auth error. One gate, one
    // message — this is the assertion the two-notification bug fails.
    expect(toastError).not.toHaveBeenCalled();
  });

  it("never tells a guest to select a role they can plainly see selected", async () => {
    await guestAtRanked();
    const said = toastNotice.mock.calls.flat().concat(toastError.mock.calls.flat())
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" ");
    expect(said).not.toMatch(/select your role/i);
    expect(said).not.toMatch(/choose your role/i);
    expect(said).not.toMatch(/could not save your role/i);
  });

  it("writes NO role to the backend", async () => {
    await guestAtRanked();
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("joins NO queue and never leaves the record's menu", async () => {
    await guestAtRanked();
    expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("menu");
    expect(screen.queryByTestId("play-ranked")).toBeNull();
  });

  it("keeps the chosen role on BOTH surfaces — the lobby does not snap back to Top", async () => {
    await guestAtRanked();
    expect(scrollRole()).toBe("jungle");
    expect(lobbyRole()).toBe("jungle");
  });

  it("says one thing, in the owner's words, with a Create Account action", async () => {
    await guestAtRanked();
    const [message, opts] = toastNotice.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe("Create an account to play Ranked");
    expect(opts.description).toBe("Your Leaguecraft setup will be waiting when you return.");
    expect((opts.action as { label: string }).label).toBe("Create Account");
  });

  /** It must not behave like a short ephemeral toast — the player has to be
   *  able to read it and act on it. `duration: Infinity` is the app's own
   *  sticky-toast idiom, and the global Toaster already renders a close
   *  button, so it stays dismissible. */
  it("LINGERS until dismissed or acted on", async () => {
    await guestAtRanked();
    const [, opts] = toastNotice.mock.calls[0] as [string, Record<string, unknown>];
    expect(opts.duration).toBe(Infinity);
  });

  it("reuses ONE notice id, so a burst of presses cannot stack copies", async () => {
    await guestAtRanked();
    fireEvent.click(screen.getByTestId("play-mode-ranked"));
    fireEvent.click(screen.getByTestId("play-mode-ranked"));
    await waitFor(() => expect(toastNotice.mock.calls.length).toBeGreaterThan(1));
    const ids = new Set(
      toastNotice.mock.calls.map(([, o]) => (o as { id: string }).id),
    );
    expect(ids.size).toBe(1);
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("plays the seal and NO negative cue — a gate is not a failure", async () => {
    await guestAtRanked();
    const cues = sfx.play.mock.calls.flat();
    expect(cues).toContain("modeConfirm");
    expect(cues).not.toContain("error");
    // And nothing from the queue, because the queue was never touched.
    expect(cues).not.toContain("queueStart");
    expect(cues).not.toContain("opponentFound");
  });

  it("still lets a guest browse the record's stepper, writing nothing", async () => {
    await guestAtRanked();
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    await waitFor(() => expect(scrollRole()).toBe("mid"));
    expect(lobbyRole()).toBe("mid");
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("leaves Daily Challenge, Invite and Practice open to a guest", async () => {
    // The gate is RANKED's, not the record's: nothing else here queues, so
    // nothing else needs an account.
    asGuest();
    await renderHub();
    play();
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    fireEvent.click(screen.getByTestId("play-mode-invite"));
    await waitFor(() =>
      expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("invite"),
    );
    expect(toastNotice).not.toHaveBeenCalled();
    expect(selectRole).not.toHaveBeenCalled();
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * THE RETURN TRIP.
 *
 * The CTA goes through `authHref`, AUTH1's single builder for every sender, and
 * the destination is a PARAMETERISED Leaguecraft path — which is precisely what
 * that builder documents `pathname + search` for. Nothing here is a second
 * auth-return system: `/auth` and `/auth/callback` both already resolve
 * `returnTo` through `resolveReturnTo`, and both will land on this path.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("the signup CTA's destination", () => {
  async function ctaHref() {
    auth.user = { id: "anon1", is_anonymous: true };
    await renderHub();
    fireEvent.click(screen.getByTestId("ranked-class-next"));   // jungle
    play();
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    fireEvent.click(screen.getByTestId("play-mode-ranked"));
    await waitFor(() => expect(toastNotice).toHaveBeenCalled());
    const [, opts] = toastNotice.mock.calls[0] as [string, Record<string, unknown>];
    // The CTA is an ordinary click handler; the navigation it starts is a
    // router state update and has to be flushed like one.
    await act(async () => {
      (opts.action as { onClick: () => void }).onClick();
    });
    return screen.getByTestId("location").textContent ?? "";
  }

  it("sends the player into the canonical signup flow", async () => {
    expect(await ctaHref()).toBe("/auth");
  });

  it("carries a Leaguecraft return target, with the chosen role", async () => {
    await ctaHref();
    const href = screen.getByTestId("location-href").textContent ?? "";
    expect(href).toContain("/auth?");
    // The canonical builder's own parameters — not a second convention.
    expect(href).toContain("mode=signup");
    const returnTo = new URLSearchParams(href.split("?")[1]).get("returnTo") ?? "";
    expect(returnTo.startsWith("/quiz")).toBe(true);
    const back = new URLSearchParams(returnTo.split("?")[1]);
    expect(back.get("role")).toBe("jungle");
    expect(back.get("play")).toBe("1");
  });

  it("does not queue anything on the way out", async () => {
    await ctaHref();
    expect(selectRole).not.toHaveBeenCalled();
    expect(sfx.play.mock.calls.flat()).not.toContain("queueStart");
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * COMING BACK.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("returning from signup", () => {
  it("restores the role the guest had chosen, and reopens Choose Mode", async () => {
    // The account now exists, and the URL is the one the CTA asked auth to
    // return to.
    render(
      <MemoryRouter initialEntries={["/quiz?play=1&role=adc"]}>
        <Location />
        <Routes>
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/quiz/ranked" element={<div data-testid="ranked-route" />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    expect(screen.getByTestId("play-scroll-mascot").getAttribute("data-role")).toBe("adc");
    expect(screen.getByTestId("ranked-class-champion").getAttribute("data-role")).toBe("adc");
  });

  it("does NOT enter matchmaking by itself — the player presses Ranked again", async () => {
    render(
      <MemoryRouter initialEntries={["/quiz?play=1&role=adc"]}>
        <Location />
        <Routes><Route path="/quiz" element={<QuizPage />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    // Regaining context, not being queued.
    expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("menu");
    expect(selectRole).not.toHaveBeenCalled();
    expect(sfx.play.mock.calls.flat()).not.toContain("queueStart");
  });

  it("ignores a role parameter that is not a canonical role", async () => {
    // URL input: anything outside the vocabulary is dropped and the account's
    // own stored role wins, exactly as if nothing had been carried.
    render(
      <MemoryRouter initialEntries={["/quiz?play=1&role=jungler"]}>
        <Location />
        <Routes><Route path="/quiz" element={<QuizPage />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    expect(screen.getByTestId("play-scroll-mascot").getAttribute("data-role")).toBe("top");
  });
});


/* ────────────────────────────────────────────────────────────────────────────
 * BOTH ROLE SURFACES, END TO END.
 *
 * The lobby ring and the record's stepper move ONE shared selection. Pressing
 * either turns both — so either press must produce exactly one tick, and the
 * surface that merely followed must stay silent. Only the real page can prove
 * that: a component test renders one surface and would pass on a version where
 * the other one shouted.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("PLAY1 sound — the two role surfaces, one tick", () => {
  const lobbyRole = () =>
    screen.getByTestId("ranked-class-champion").getAttribute("data-role");
  const scrollRole = () =>
    screen.getByTestId("play-scroll-mascot").getAttribute("data-role");
  const cues = () => sfx.play.mock.calls.flat();

  async function openRecord() {
    play();
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
  }

  it("LOBBY arrow with the record open: both move, one tick", async () => {
    await renderHub();                       // stored role is Top
    await openRecord();
    sfx.play.mockClear();

    fireEvent.click(screen.getByTestId("ranked-class-next"));
    await waitFor(() => expect(lobbyRole()).toBe("jungle"));
    // The sheet above followed, in its own render, and said nothing.
    expect(scrollRole()).toBe("jungle");
    expect(cues()).toEqual(["roleStep"]);
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("RECORD arrow: both move, one tick", async () => {
    await renderHub();
    await openRecord();
    sfx.play.mockClear();

    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    await waitFor(() => expect(scrollRole()).toBe("jungle"));
    expect(lobbyRole()).toBe("jungle");
    expect(cues()).toEqual(["roleStep"]);
    expect(selectRole).not.toHaveBeenCalled();
  });

  it("LOBBY arrow with the record CLOSED still ticks once", async () => {
    await renderHub();
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("ranked-class-next"));
    await waitFor(() => expect(lobbyRole()).toBe("jungle"));
    expect(cues()).toEqual(["roleStep"]);
  });

  it("alternating between the two surfaces never doubles a press", async () => {
    await renderHub();
    await openRecord();
    sfx.play.mockClear();

    fireEvent.click(screen.getByTestId("ranked-class-next"));        // -> jungle
    await waitFor(() => expect(scrollRole()).toBe("jungle"));
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));    // -> mid
    await waitFor(() => expect(lobbyRole()).toBe("mid"));
    fireEvent.click(screen.getByTestId("ranked-class-next"));        // -> adc
    await waitFor(() => expect(scrollRole()).toBe("adc"));

    expect(cues()).toEqual(["roleStep", "roleStep", "roleStep"]);
    expect(selectRole).not.toHaveBeenCalled();
  });

  /* ── Passive synchronisation is silent ──────────────────────────────── */

  it("says nothing when PLAY merely REOPENS on a role already chosen", async () => {
    await renderHub();
    await openRecord();
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));    // jungle
    await waitFor(() => expect(scrollRole()).toBe("jungle"));
    fireEvent.click(screen.getByTestId("play-scroll-close"));
    await waitFor(() => expect(screen.queryByTestId("play-scroll")).toBeNull());

    sfx.play.mockClear();
    await openRecord();
    // Reopening restores the choice; nothing was chosen a second time.
    expect(scrollRole()).toBe("jungle");
    expect(cues()).toEqual(["scrollOpen"]);
  });

  it("says nothing when a role is RESTORED from the auth return URL", async () => {
    // The signup gate's return target. The lobby and the record both land on
    // ADC without anyone having pressed an arrow.
    render(
      <MemoryRouter initialEntries={["/quiz?play=1&role=adc"]}>
        <Location />
        <Routes><Route path="/quiz" element={<QuizPage />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    expect(scrollRole()).toBe("adc");
    expect(lobbyRole()).toBe("adc");
    expect(cues()).not.toContain("roleStep");
  });

  it("says nothing when the page first paints", async () => {
    await renderHub();
    expect(cues()).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * THE SIGNUP CTA'S OWN PRESS.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("PLAY1 sound — the Create Account action", () => {
  const cues = () => sfx.play.mock.calls.flat();

  it("knocks once, and still navigates", async () => {
    auth.user = { id: "anon1", is_anonymous: true };
    await renderHub();
    play();
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    fireEvent.click(screen.getByTestId("play-mode-ranked"));
    await waitFor(() => expect(toastNotice).toHaveBeenCalled());

    sfx.play.mockClear();
    const [, opts] = toastNotice.mock.calls[0] as [string, Record<string, unknown>];
    await act(async () => {
      (opts.action as { onClick: () => void }).onClick();
    });

    // The fallback knock, not the seal: Create Account chooses no way to play.
    expect(cues()).toEqual(["buttonPress"]);
    expect(screen.getByTestId("location").textContent).toBe("/auth");
  });
});
