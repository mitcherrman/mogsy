/**
 * The Academy Record — the Commons' large gilt-framed mount.
 *
 * What this file guards is one product rule above all: **the Record never
 * invents a number.** A visitor, a signed-in account with no activity, and a
 * backend that answers with an incoherent tier block must all produce an
 * honest short panel — never `0%`, never a fabricated standing, never a
 * progress bar at a guessed position. The second rule is that a member sees
 * their standing, not an advertisement.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AcademyRecord from "./AcademyRecord";
import type { QuizProgress } from "@/lib/quiz/api";

const mocks = vi.hoisted(() => ({
  authUser: { id: "u1", is_anonymous: false } as
    | { id: string; is_anonymous?: boolean }
    | null,
  proStatus: "free" as "unknown" | "pro" | "free",
  identity: { loading: false, displayName: "Mogzy", avatarUrl: null } as {
    loading: boolean;
    displayName: string | null;
    avatarUrl: string | null;
  },
  progress: null as QuizProgress | null,
  categories: [] as Array<{ category_name: string; accuracy: number; attempts: number }>,
  ranked: { loadState: "unavailable", progression: null } as {
    loadState: "loading" | "ready" | "unavailable";
    progression: { rating: number; tier: string; rated: boolean } | null;
  },
  /** Every `useRankedProgression(...)` options object this render passed. */
  rankedCalls: [] as Array<{ enabled?: boolean } | undefined>,
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.authUser }) }));
vi.mock("@/hooks/usePremiumSession", () => ({
  usePremiumSession: () => ({ proStatus: mocks.proStatus }),
}));
vi.mock("@/hooks/useProfileIdentity", () => ({
  useProfileIdentity: () => mocks.identity,
}));
vi.mock("@/pages/quiz-ranked/useRankedProgression", () => ({
  useRankedProgression: (opts?: { enabled?: boolean }) => {
    mocks.rankedCalls.push(opts);
    return mocks.ranked;
  },
}));
vi.mock("@/lib/quiz/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz/api")>();
  return {
    ...actual,
    quizApi: {
      getProgress: () => Promise.resolve(mocks.progress),
      getCategories: () => Promise.resolve({ categories: mocks.categories }),
    },
  };
});

function renderRecord() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AcademyRecord />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ACTIVE_PROGRESS: QuizProgress = {
  total_attempts: 412,
  correct_attempts: 300,
  accuracy: 72.8,
  current_streak: 6,
  best_streak: 19,
  total_xp: 5400,
  rank_name: "Diamond",
  academy_tier: "gold",
  academy_next_tier: "diamond",
  academy_current_tier_xp: 5000,
  academy_next_tier_xp: 8000,
  academy_xp_to_next: 2600,
  academy_progress_percent: 13.3,
};

beforeEach(() => {
  mocks.authUser = { id: "u1", is_anonymous: false };
  mocks.proStatus = "free";
  mocks.identity = { loading: false, displayName: "Mogzy", avatarUrl: null };
  mocks.progress = null;
  mocks.categories = [];
  mocks.ranked = { loadState: "unavailable", progression: null };
  mocks.rankedCalls = [];
});
afterEach(cleanup);

describe("AcademyRecord — the empty register", () => {
  it("shows a guest an invitation, never a record of zeroes", async () => {
    mocks.authUser = null;
    mocks.identity = { loading: false, displayName: null, avatarUrl: null };
    const { container } = renderRecord();

    await waitFor(() =>
      expect(screen.getByTestId("academy-record").dataset.recordState).toBe("empty"),
    );
    expect(screen.getByText("No record opened")).toBeTruthy();
    // The three numbers a dishonest empty state would print.
    expect(container.textContent).not.toMatch(/0%/);
    expect(container.textContent).not.toMatch(/Answered/);
    expect(container.textContent).not.toMatch(/Unranked/);
    expect(container.querySelector(".academy-commons-record-bar")).toBeNull();
    expect(screen.getByTestId("academy-record-primary").textContent).toContain(
      "Begin Studying",
    );
  });

  it("treats a signed-in account with no activity exactly the same way", async () => {
    mocks.progress = { total_attempts: 0, accuracy: 0, current_streak: 0, best_streak: 0 };
    const { container } = renderRecord();

    await waitFor(() =>
      expect(screen.getByTestId("academy-record").dataset.recordState).toBe("empty"),
    );
    expect(container.textContent).not.toMatch(/0%/);
    expect(screen.getByTestId("academy-record-primary").textContent).toContain(
      "Begin Studying",
    );
  });
});

describe("AcademyRecord — an open record", () => {
  it("engraves only facts the backend actually returned", async () => {
    mocks.progress = ACTIVE_PROGRESS;
    mocks.categories = [{ category_name: "runes", accuracy: 88, attempts: 40 }];
    renderRecord();

    await waitFor(() =>
      expect(screen.getByTestId("academy-record").dataset.recordState).toBe("open"),
    );
    expect(screen.getByText("Academy Gold")).toBeTruthy();
    expect(screen.getByText("412")).toBeTruthy();
    expect(screen.getByText("72.8%")).toBeTruthy();
    expect(screen.getByText("6 · best 19")).toBeTruthy();
    expect(screen.getByText("runes")).toBeTruthy();
    expect(screen.getByText("2,600 XP")).toBeTruthy();
    expect(screen.getByTestId("academy-record-primary").textContent).toContain(
      "Continue Studying",
    );
    expect(screen.getByTestId("academy-record-secondary").getAttribute("href")).toBe(
      "/profile",
    );
  });

  it("omits the strongest-category line when nothing has been answered in one", async () => {
    mocks.progress = ACTIVE_PROGRESS;
    // A category that exists but was never played is not a strength.
    mocks.categories = [{ category_name: "items", accuracy: 0, attempts: 0 }];
    renderRecord();

    await waitFor(() =>
      expect(screen.getByTestId("academy-record").dataset.recordState).toBe("open"),
    );
    expect(screen.queryByText("Strongest")).toBeNull();
  });

  it("draws no tier bar when the backend's academy block is incoherent", async () => {
    // A tier with no next tier that is not Challenger — a broken migration,
    // which `parseAcademyProgression` rejects outright.
    mocks.progress = { ...ACTIVE_PROGRESS, academy_next_tier: undefined };
    const { container } = renderRecord();

    await waitFor(() =>
      expect(screen.getByTestId("academy-record").dataset.recordState).toBe("open"),
    );
    expect(container.querySelector(".academy-commons-record-bar")).toBeNull();
    // It falls back to the legacy rank name rather than rendering half a tier.
    expect(screen.getByText("Diamond")).toBeTruthy();
  });
});

describe("AcademyRecord — Ranked and membership", () => {
  it("shows a Ranked standing only once the account is actually rated", async () => {
    mocks.progress = ACTIVE_PROGRESS;
    mocks.ranked = {
      loadState: "ready",
      progression: { rating: 1240, tier: "silver", rated: false },
    };
    renderRecord();

    await waitFor(() =>
      expect(screen.getByTestId("academy-record").dataset.recordState).toBe("open"),
    );
    expect(screen.queryByText("Ranked")).toBeNull();

    cleanup();
    mocks.ranked.progression = { rating: 1240, tier: "silver", rated: true };
    renderRecord();
    await waitFor(() => expect(screen.getByText("Ranked")).toBeTruthy());
    expect(screen.getByText("1,240 · Silver")).toBeTruthy();
  });

  it("does not ask about a Ranked standing for a guest or an anonymous session", async () => {
    // `/lol` is the front page: every anonymous visitor mounts this panel, and
    // asking an endpoint about an account that does not exist logged an
    // expected 403 in the console on every one of those page views.
    mocks.authUser = null;
    renderRecord();
    await waitFor(() => expect(mocks.rankedCalls.length).toBeGreaterThan(0));
    expect(mocks.rankedCalls.every((o) => o?.enabled === false)).toBe(true);

    cleanup();
    mocks.rankedCalls = [];
    mocks.authUser = { id: "anon1", is_anonymous: true };
    renderRecord();
    await waitFor(() => expect(mocks.rankedCalls.length).toBeGreaterThan(0));
    expect(mocks.rankedCalls.every((o) => o?.enabled === false)).toBe(true);
  });

  it("does ask for an identified account — the fix must not silence real users", async () => {
    mocks.authUser = { id: "u1", is_anonymous: false };
    mocks.progress = ACTIVE_PROGRESS;
    renderRecord();
    await waitFor(() => expect(mocks.rankedCalls.length).toBeGreaterThan(0));
    expect(mocks.rankedCalls.some((o) => o?.enabled === true)).toBe(true);
  });

  it("marks a member's standing and never advertises to them", async () => {
    mocks.proStatus = "pro";
    mocks.progress = ACTIVE_PROGRESS;
    const { container } = renderRecord();

    await waitFor(() => expect(screen.getByText("Academy Record · Member")).toBeTruthy());
    // The Record is not a place Premium is sold — that is the supporting slip's
    // job, and only for a non-member.
    expect(container.querySelector('a[href="/lol/premium"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Explore Premium|Upgrade/i);
  });
});
