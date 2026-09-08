/**
 * The Academy Bulletin — the Commons' rotating noticeboard.
 *
 * Three things this file guards, in order of how much damage they would do:
 *
 *  1. **Honesty.** No answer ever reaches the board; no personal notice
 *     appears without a real qualifying event; the patch family — which Screen
 *     1's Broadcast already owns — is not here at all.
 *  2. **A board is never empty.** Guests, sparse accounts and a total backend
 *     outage all still get a notice.
 *  3. **Rotation yields to the reader.** Hover, focus, manual navigation and
 *     either motion preference all stop it, and it never fights them back.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AcademyBulletin from "./AcademyBulletin";

const mocks = vi.hoisted(() => ({
  authUser: null as { id: string; is_anonymous?: boolean } | null,
  rankedEntries: [] as Array<Record<string, unknown>>,
  rankedLoadState: "unavailable" as "loading" | "ready" | "unavailable",
  rankedCalls: [] as Array<{ enabled?: boolean } | undefined>,
  question: null as Record<string, unknown> | null,
  questionThrows: false,
  tables: null as Record<string, unknown> | null,
  tablesThrows: false,
  reducedMotion: false,
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.authUser }) }));
vi.mock("@/pages/quiz-ranked/useRankedMatchHistory", () => ({
  useRankedMatchHistory: (_limit?: number, opts?: { enabled?: boolean }) => {
    mocks.rankedCalls.push(opts);
    return {
      loadState: mocks.rankedLoadState,
      entries: mocks.rankedEntries,
      limit: 5,
    };
  },
}));
vi.mock("@/lib/quiz/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz/api")>();
  return {
    ...actual,
    quizApi: {
      categoryQuestions: () => {
        if (mocks.questionThrows) return Promise.reject(new Error("down"));
        return Promise.resolve({ questions: mocks.question ? [mocks.question] : [] });
      },
    },
  };
});
vi.mock("@/lib/mechanics-tables/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mechanics-tables/api")>();
  return {
    ...actual,
    fetchTablesIndex: () =>
      mocks.tablesThrows ? Promise.reject(new Error("down")) : Promise.resolve(mocks.tables),
  };
});

const QUESTION = {
  id: 132030,
  category: "Champion Ability Cooldowns",
  question_text: "What is the cooldown of Cassiopeia Q - Noxious Blast?",
  choices: ["2.5 seconds", "6.5 seconds", "4.5 seconds", "3.5 seconds"],
  format: "multiple_choice",
};

const TABLES = {
  patch: "26.15",
  categories: [
    {
      category: "base_systems",
      study_tables: [
        {
          table_id: "base_systems.study.death_timers",
          title: "Death timers",
          subtitle: "How long you stay dead, and what makes it longer",
          row_count: 22,
        },
      ],
    },
  ],
};

const MATCH = {
  matchId: "m-1",
  viewerOutcome: "win" as const,
  completedAt: "2026-09-06T12:00:00",
  ratingDelta: 18,
  ratingAfter: 1258,
  opponentDisplayName: "Karthus Enjoyer",
  opponentIsBot: false,
};

function renderBulletin(props: Parameters<typeof AcademyBulletin>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AcademyBulletin {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Wait for every family that can answer to have answered. */
async function settled(expected: number) {
  await waitFor(() =>
    expect(screen.getByTestId("academy-bulletin").dataset.bulletinCount).toBe(String(expected)),
  );
}

beforeEach(() => {
  mocks.authUser = null;
  mocks.rankedEntries = [];
  mocks.rankedLoadState = "unavailable";
  mocks.rankedCalls = [];
  mocks.question = QUESTION;
  mocks.questionThrows = false;
  mocks.tables = TABLES;
  mocks.tablesThrows = false;
  mocks.reducedMotion = false;
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: mocks.reducedMotion && q.includes("reduced-motion"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  document.documentElement.className = "";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("what the board is allowed to say", () => {
  it("never puts an answer on the board", async () => {
    const { container } = renderBulletin();
    await settled(3);
    // The prompt is pinned; walk every notice and assert no choice is printed.
    for (let i = 0; i < 3; i++) {
      for (const choice of QUESTION.choices) {
        expect(container.textContent).not.toContain(choice);
      }
      fireEvent.click(screen.getByTestId("academy-bulletin-next"));
    }
  });

  it("carries the live question verbatim and sends the reader to the quiz", async () => {
    renderBulletin({ initialNoticeId: `quiz-${QUESTION.id}` });
    await waitFor(() =>
      expect(screen.getByTestId("academy-bulletin").dataset.bulletinKind).toBe("quiz"),
    );
    expect(screen.getByTestId("academy-bulletin-title").textContent).toBe(QUESTION.question_text);
    expect(screen.getByTestId("academy-bulletin-cta").getAttribute("href")).toBe("/quiz");
  });

  it("names a real published study table, with its own patch", async () => {
    renderBulletin({ initialNoticeId: "mechanics-base_systems.study.death_timers" });
    await waitFor(() =>
      expect(screen.getByTestId("academy-bulletin").dataset.bulletinKind).toBe("mechanics"),
    );
    expect(screen.getByTestId("academy-bulletin-title").textContent).toBe("Death timers");
    expect(screen.getByTestId("academy-bulletin-meta").textContent).toContain("Patch 26.15");
    expect(screen.getByTestId("academy-bulletin-cta").getAttribute("href")).toBe("/lol/mechanics");
  });

  it("does not duplicate Screen 1's Patch Brief", async () => {
    const { container } = renderBulletin();
    await settled(3);
    for (let i = 0; i < 3; i++) {
      expect(container.textContent).not.toMatch(/patch brief|patch report|what'?s new/i);
      fireEvent.click(screen.getByTestId("academy-bulletin-next"));
    }
  });

  it("claims no statistic the Pro Play invitation cannot read", async () => {
    renderBulletin({ initialNoticeId: "proplay-invitation" });
    await waitFor(() =>
      expect(screen.getByTestId("academy-bulletin").dataset.bulletinKind).toBe("proplay"),
    );
    const text = screen.getByTestId("academy-bulletin").textContent ?? "";
    expect(text).not.toMatch(/\d+\s*-\s*\d+/); // no scoreline
    expect(text).not.toMatch(/\b\d+(\.\d+)?%/); // no win rate
    expect(screen.getByTestId("academy-bulletin-cta").getAttribute("href")).toBe("/lol/pro-play");
  });
});

describe("the board is never empty", () => {
  it("falls back to a single notice when every source fails", async () => {
    mocks.questionThrows = true;
    mocks.tablesThrows = true;
    renderBulletin();
    await settled(1);
    expect(screen.getByTestId("academy-bulletin").dataset.bulletinKind).toBe("proplay");
    // Nothing to navigate between, so no controls are offered at all.
    expect(screen.queryByTestId("academy-bulletin-prev")).toBeNull();
    expect(screen.queryByTestId("academy-bulletin-next")).toBeNull();
    expect(screen.queryByTestId("academy-bulletin-dots")).toBeNull();
    expect(screen.getByTestId("academy-bulletin-cta")).toBeTruthy();
  });

  it("gives a guest the three impersonal notices and asks nothing about them", async () => {
    renderBulletin();
    await settled(3);
    expect(mocks.rankedCalls.every((o) => o?.enabled === false)).toBe(true);
    const kinds = new Set<string>();
    for (let i = 0; i < 3; i++) {
      kinds.add(screen.getByTestId("academy-bulletin").dataset.bulletinKind!);
      fireEvent.click(screen.getByTestId("academy-bulletin-next"));
    }
    expect(kinds).toEqual(new Set(["quiz", "mechanics", "proplay"]));
    expect(kinds.has("personal")).toBe(false);
  });

  it("treats an anonymous session as a guest", async () => {
    mocks.authUser = { id: "anon1", is_anonymous: true };
    renderBulletin();
    await settled(3);
    expect(mocks.rankedCalls.every((o) => o?.enabled === false)).toBe(true);
  });

  it("gives an identified account with no Ranked history no personal notice", async () => {
    mocks.authUser = { id: "u1", is_anonymous: false };
    mocks.rankedLoadState = "ready";
    mocks.rankedEntries = [];
    renderBulletin();
    await settled(3);
    expect(mocks.rankedCalls.some((o) => o?.enabled === true)).toBe(true);
    expect(screen.getByTestId("academy-bulletin").dataset.bulletinKind).not.toBe("personal");
  });
});

describe("personal activity — only when it is real", () => {
  beforeEach(() => {
    mocks.authUser = { id: "u1", is_anonymous: false };
    mocks.rankedLoadState = "ready";
    mocks.rankedEntries = [MATCH];
  });

  it("leads with a real Ranked result, and says only what the row says", async () => {
    renderBulletin();
    await settled(4);
    const board = screen.getByTestId("academy-bulletin");
    expect(board.dataset.bulletinKind).toBe("personal");
    expect(screen.getByTestId("academy-bulletin-title").textContent).toBe(
      "You won your last Ranked match",
    );
    const meta = screen.getByTestId("academy-bulletin-meta").textContent ?? "";
    expect(meta).toContain("+18 rating");
    expect(meta).toContain("versus Karthus Enjoyer");
  });

  it("prints no rating when the backend recorded none", async () => {
    mocks.rankedEntries = [{ ...MATCH, ratingDelta: null }];
    renderBulletin();
    await settled(4);
    const meta = screen.getByTestId("academy-bulletin-meta").textContent ?? "";
    expect(meta).not.toMatch(/rating/);
    expect(meta).toContain("versus Karthus Enjoyer");
  });

  it("says a bot was a bot rather than implying an opponent", async () => {
    mocks.rankedEntries = [{ ...MATCH, opponentIsBot: true, opponentDisplayName: null }];
    renderBulletin();
    await settled(4);
    expect(screen.getByTestId("academy-bulletin-meta").textContent).toContain("versus a bot");
  });

  it("reports a loss as a loss", async () => {
    mocks.rankedEntries = [{ ...MATCH, viewerOutcome: "loss", ratingDelta: -12 }];
    renderBulletin();
    await settled(4);
    expect(screen.getByTestId("academy-bulletin-title").textContent).toBe(
      "You lost your last Ranked match",
    );
    expect(screen.getByTestId("academy-bulletin-meta").textContent).toContain("-12 rating");
  });
});

describe("navigation", () => {
  it("moves forward and backward, and wraps in both directions", async () => {
    renderBulletin();
    await settled(3);
    const board = screen.getByTestId("academy-bulletin");
    const first = board.dataset.bulletinNotice;

    fireEvent.click(screen.getByTestId("academy-bulletin-next"));
    expect(board.dataset.bulletinIndex).toBe("1");
    fireEvent.click(screen.getByTestId("academy-bulletin-next"));
    fireEvent.click(screen.getByTestId("academy-bulletin-next"));
    expect(board.dataset.bulletinIndex).toBe("0");
    expect(board.dataset.bulletinNotice).toBe(first);

    fireEvent.click(screen.getByTestId("academy-bulletin-prev"));
    expect(board.dataset.bulletinIndex).toBe("2");
  });

  it("is not a live region — an auto-advancing board must not interrupt", async () => {
    const { container } = renderBulletin();
    await settled(3);
    // A carousel that announces every rotation talks over a screen-reader user
    // every twelve seconds. The board is reachable and labelled instead.
    expect(container.querySelector("[aria-live]")).toBeNull();
    expect(screen.getByTestId("academy-bulletin").getAttribute("aria-labelledby")).toBe(
      "academy-bulletin-heading",
    );
  });

  it("labels both controls and keeps them operable from the keyboard", async () => {
    renderBulletin();
    await settled(3);
    const next = screen.getByRole("button", { name: "Next notice" });
    const prev = screen.getByRole("button", { name: "Previous notice" });
    next.focus();
    expect(document.activeElement).toBe(next);
    fireEvent.click(next);
    // Focus stays on the control the reader is using; the notice changes under it.
    expect(document.activeElement).toBe(next);
    expect(prev.className).toMatch(/focus-visible:ring-2/);
  });

  it("marks the reader's place with one current dot", async () => {
    renderBulletin();
    await settled(3);
    const dots = screen.getByTestId("academy-bulletin-dots");
    expect(dots.querySelectorAll(".academy-commons-bulletin-dot")).toHaveLength(3);
    expect(dots.querySelectorAll(".is-current")).toHaveLength(1);
  });
});

describe("rotation", () => {
  it("advances on its own, slowly", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBulletin();
    await settled(3);
    const board = screen.getByTestId("academy-bulletin");
    expect(board.dataset.bulletinRotating).toBe("true");
    expect(board.dataset.bulletinIndex).toBe("0");
    // Nothing at 10s: this is a noticeboard, not a slideshow.
    act(() => void vi.advanceTimersByTime(10000));
    expect(board.dataset.bulletinIndex).toBe("0");
    act(() => void vi.advanceTimersByTime(2500));
    expect(board.dataset.bulletinIndex).toBe("1");
  });

  it("stops for good once the reader takes control", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBulletin();
    await settled(3);
    const board = screen.getByTestId("academy-bulletin");
    fireEvent.click(screen.getByTestId("academy-bulletin-next"));
    expect(board.dataset.bulletinRotating).toBe("false");
    act(() => void vi.advanceTimersByTime(60000));
    expect(board.dataset.bulletinIndex).toBe("1");
  });

  it("pauses while hovered and resumes when the pointer leaves", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBulletin();
    await settled(3);
    const board = screen.getByTestId("academy-bulletin");
    fireEvent.mouseEnter(board);
    expect(board.dataset.bulletinRotating).toBe("false");
    act(() => void vi.advanceTimersByTime(30000));
    expect(board.dataset.bulletinIndex).toBe("0");
    fireEvent.mouseLeave(board);
    expect(board.dataset.bulletinRotating).toBe("true");
  });

  it("pauses while focus is inside the board", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBulletin();
    await settled(3);
    const board = screen.getByTestId("academy-bulletin");
    fireEvent.focus(screen.getByTestId("academy-bulletin-cta"));
    expect(board.dataset.bulletinRotating).toBe("false");
    act(() => void vi.advanceTimersByTime(30000));
    expect(board.dataset.bulletinIndex).toBe("0");
  });

  it("does not rotate while the tab is hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBulletin();
    await settled(3);
    const board = screen.getByTestId("academy-bulletin");
    const spy = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => void vi.advanceTimersByTime(40000));
    expect(board.dataset.bulletinIndex).toBe("0");
    spy.mockRestore();
  });

  it("does not rotate while the Commons is not the room on screen", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // The hub is mounted (snap class present) but the Hall is in view.
    document.documentElement.className = "hub-two-screen";
    renderBulletin();
    await settled(3);
    const board = screen.getByTestId("academy-bulletin");
    act(() => void vi.advanceTimersByTime(40000));
    expect(board.dataset.bulletinIndex).toBe("0");
    document.documentElement.className = "hub-two-screen hub-commons-in-view";
    act(() => void vi.advanceTimersByTime(13000));
    expect(board.dataset.bulletinIndex).toBe("1");
  });

  it("never rotates on a single-notice board", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.questionThrows = true;
    mocks.tablesThrows = true;
    renderBulletin();
    await settled(1);
    expect(screen.getByTestId("academy-bulletin").dataset.bulletinRotating).toBe("false");
    act(() => void vi.advanceTimersByTime(60000));
    expect(screen.getByTestId("academy-bulletin").dataset.bulletinIndex).toBe("0");
  });
});

describe("reduced motion", () => {
  it("does not autoplay, drops the crossfade, and keeps manual navigation", async () => {
    mocks.reducedMotion = true;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBulletin();
    await settled(3);
    const board = screen.getByTestId("academy-bulletin");
    expect(board.dataset.bulletinRotating).toBe("false");
    act(() => void vi.advanceTimersByTime(60000));
    expect(board.dataset.bulletinIndex).toBe("0");
    expect(
      screen.getByTestId("academy-bulletin-notice").className,
    ).not.toMatch(/academy-commons-bulletin-enter/);
    // The reader loses the movement, never the capability.
    fireEvent.click(screen.getByTestId("academy-bulletin-next"));
    expect(board.dataset.bulletinIndex).toBe("1");
  });

  it("honours the app's own reduce-motion setting, not just the OS query", async () => {
    document.documentElement.className = "reduce-motion";
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBulletin();
    await settled(3);
    expect(screen.getByTestId("academy-bulletin").dataset.bulletinRotating).toBe("false");
    act(() => void vi.advanceTimersByTime(60000));
    expect(screen.getByTestId("academy-bulletin").dataset.bulletinIndex).toBe("0");
  });
});

describe("deterministic selection", () => {
  it("pins the board to a named notice and stops rotating", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBulletin({ initialNoticeId: "proplay-invitation" });
    await settled(3);
    const board = screen.getByTestId("academy-bulletin");
    expect(board.dataset.bulletinNotice).toBe("proplay-invitation");
    expect(board.dataset.bulletinRotating).toBe("false");
    act(() => void vi.advanceTimersByTime(60000));
    expect(board.dataset.bulletinNotice).toBe("proplay-invitation");
  });

  it("ignores an id the board does not carry rather than blanking", async () => {
    renderBulletin({ initialNoticeId: "a-notice-that-was-retired" });
    await settled(3);
    expect(screen.getByTestId("academy-bulletin-cta")).toBeTruthy();
    expect(screen.getByTestId("academy-bulletin").dataset.bulletinIndex).toBe("0");
  });

  it("autoRotate:false holds the board still without pinning it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBulletin({ autoRotate: false });
    await settled(3);
    const board = screen.getByTestId("academy-bulletin");
    act(() => void vi.advanceTimersByTime(60000));
    expect(board.dataset.bulletinIndex).toBe("0");
    fireEvent.click(screen.getByTestId("academy-bulletin-next"));
    expect(board.dataset.bulletinIndex).toBe("1");
  });
});

describe("the painted mount", () => {
  it("keeps the class hooks index.css positions the board through", async () => {
    const { container } = renderBulletin();
    await settled(3);
    for (const hook of [
      ".academy-commons-board",
      ".academy-commons-bill",
      ".academy-commons-bulletin-title",
      ".academy-commons-bulletin-blurb",
      ".academy-commons-bulletin-foot",
      ".academy-commons-bulletin-nav-prev",
      ".academy-commons-bulletin-nav-next",
    ]) {
      expect(container.querySelector(hook)).not.toBeNull();
    }
  });
});
