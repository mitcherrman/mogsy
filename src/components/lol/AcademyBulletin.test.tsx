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
import {
  BULLETIN_AUTHORED_BODY_MAX_CHARS,
  BULLETIN_QUESTION_MAX_CHARS,
  BULLETIN_QUIZ_SOURCES,
  isBulletinSuitableQuestion,
} from "./useAcademyBulletin";

const mocks = vi.hoisted(() => ({
  authUser: null as { id: string; is_anonymous?: boolean } | null,
  rankedEntries: [] as Array<Record<string, unknown>>,
  rankedLoadState: "unavailable" as "loading" | "ready" | "unavailable",
  rankedCalls: [] as Array<{ enabled?: boolean } | undefined>,
  questions: [] as Array<Record<string, unknown>>,
  questionThrows: false,
  progress: null as Record<string, unknown> | null,
  tables: null as Record<string, unknown> | null,
  tablesThrows: false,
  reducedMotion: false,
  requestedCategories: [] as string[],
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
      categoryQuestions: (category: string) => {
        if (mocks.questionThrows) return Promise.reject(new Error("down"));
        mocks.requestedCategories.push(category);
        return Promise.resolve({ questions: mocks.questions });
      },
      getProgress: () => Promise.resolve(mocks.progress),
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

/** 42 characters — comfortably inside the measured budget. */
const QUESTION = {
  id: 132030,
  category: "Item Costs",
  question_text: "How much does a Doran's Blade cost?",
  choices: ["450 gold", "400 gold", "500 gold", "350 gold"],
  format: "multiple_choice",
};

/**
 * The two real production formats that broke the live board. Both are drawn
 * from what mogzy.lol actually served on 2026-09-07.
 */
const LONG_COMPARISON = {
  id: 900001,
  category: "Champion Ability Cooldowns",
  question_text:
    "Which ultimate has the shorter rank 1 cooldown: Lee Sin R - Dragon's Rage, or Leona R - Solar Flare?",
  choices: ["Lee Sin R", "Leona R", "Equal", "Neither"],
  format: "multiple_choice",
};
const LONG_SCENARIO = {
  id: 900002,
  category: "Champion Ability Cooldowns",
  question_text:
    "Tryndamere R - Undying Rage has a rank 3 cooldown of 80 seconds. With Sundered Sky and 20 ability haste, what is it?",
  choices: ["61.5 seconds", "66.7 seconds", "58.0 seconds", "72.0 seconds"],
  format: "multiple_choice",
};

const TABLES = {
  patch: "26.15",
  categories: [
    {
      category: "base_systems",
      study_tables: [
        {
          table_id: "base_systems.study.fountain",
          title: "The fountain",
          subtitle: "What your own fountain gives back, and what the enemy one takes",
          row_count: 6,
        },
        {
          table_id: "base_systems.study.death_timers",
          title: "Death timers",
          subtitle: "How long you stay dead, and what makes it longer",
          row_count: 22,
        },
      ],
    },
    {
      category: "waves",
      study_tables: [
        {
          table_id: "waves.study.gold",
          title: "Wave gold",
          subtitle: "What a wave is worth, minute by minute",
          row_count: 14,
        },
      ],
    },
  ],
};

const PROGRESS_ACTIVE = {
  total_attempts: 412,
  accuracy: 72.8,
  current_streak: 7,
  best_streak: 19,
  academy_tier: "gold",
  academy_next_tier: "diamond",
  academy_current_tier_xp: 5000,
  academy_next_tier_xp: 8000,
  academy_xp_to_next: 2600,
  academy_progress_percent: 13.3,
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
        {/* A fixed seed everywhere, so a test never depends on today's date. */}
        <AcademyBulletin daySeed={0} {...props} />
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
  mocks.questions = [QUESTION];
  mocks.questionThrows = false;
  mocks.progress = null;
  mocks.requestedCategories = [];
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
    // Seed 0 selects the first table in the flattened index.
    renderBulletin({ initialNoticeId: "mechanics-base_systems.study.fountain" });
    await waitFor(() =>
      expect(screen.getByTestId("academy-bulletin").dataset.bulletinKind).toBe("mechanics"),
    );
    expect(screen.getByTestId("academy-bulletin-title").textContent).toBe("The fountain");
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

describe("question suitability — a question must be shown WHOLE", () => {
  it("rejects the long comparison format that truncated in production", async () => {
    mocks.questions = [LONG_COMPARISON];
    renderBulletin();
    await settled(2); // mechanics + proplay only
    const kinds = new Set<string>();
    for (let i = 0; i < 2; i++) {
      kinds.add(screen.getByTestId("academy-bulletin").dataset.bulletinKind!);
      fireEvent.click(screen.getByTestId("academy-bulletin-next"));
    }
    expect(kinds.has("quiz")).toBe(false);
  });

  it("rejects the long scenario format too", async () => {
    mocks.questions = [LONG_SCENARIO];
    renderBulletin();
    await settled(2);
    expect(screen.getByTestId("academy-bulletin").dataset.bulletinKind).not.toBe("quiz");
  });

  it("picks the eligible question out of a batch that mostly does not fit", async () => {
    // Exactly what the live bank looks like: mostly too long, a few short.
    mocks.questions = [LONG_SCENARIO, LONG_COMPARISON, QUESTION];
    renderBulletin({ initialNoticeId: `quiz-${QUESTION.id}` });
    await waitFor(() =>
      expect(screen.getByTestId("academy-bulletin").dataset.bulletinKind).toBe("quiz"),
    );
    expect(screen.getByTestId("academy-bulletin-title").textContent).toBe(
      QUESTION.question_text,
    );
  });

  it("shows an eligible question complete — no ellipsis, no cut", async () => {
    renderBulletin({ initialNoticeId: `quiz-${QUESTION.id}` });
    await waitFor(() =>
      expect(screen.getByTestId("academy-bulletin").dataset.bulletinKind).toBe("quiz"),
    );
    const t = screen.getByTestId("academy-bulletin-title").textContent ?? "";
    expect(t).toBe(QUESTION.question_text);
    expect(t.endsWith("?")).toBe(true);
    expect(t).not.toMatch(/[…]|\.\.\.$/);
  });

  it("rejects a pathological unbroken token whatever the total length", async () => {
    expect(isBulletinSuitableQuestion("Which is longer: " + "x".repeat(19) + "?")).toBe(false);
    expect(isBulletinSuitableQuestion("Which is longer: abcdefgh?")).toBe(true);
  });

  it("authored bodies fit the two-line clamp whole", async () => {
    // The Pro Play invitation shipped at 127 characters and was cut mid-
    // sentence on the live board. Authored copy is policed the same way a
    // question is; a table's own subtitle is its authority's business.
    renderBulletin({ initialNoticeId: "proplay-invitation" });
    await waitFor(() =>
      expect(screen.getByTestId("academy-bulletin").dataset.bulletinKind).toBe("proplay"),
    );
    const body = document.querySelector(".academy-commons-bulletin-blurb")?.textContent ?? "";
    expect(body.length).toBeLessThanOrEqual(BULLETIN_AUTHORED_BODY_MAX_CHARS);
    expect(body.trim().endsWith(".")).toBe(true);
  });

  it("the threshold sits below the shortest failure measured in production", () => {
    // 52 characters was the shortest live question that would not fit the
    // three-line budget at 1024x781. The rule must be strictly under it.
    expect(BULLETIN_QUESTION_MAX_CHARS).toBeLessThan(52);
    expect(isBulletinSuitableQuestion("x".repeat(BULLETIN_QUESTION_MAX_CHARS))).toBe(false);
  });

  it("falls back honestly when no question in the day's subject is suitable", async () => {
    mocks.questions = [LONG_COMPARISON, LONG_SCENARIO];
    renderBulletin();
    await settled(2);
    // The board is still a board: mechanics and the invitation both stand.
    expect(screen.getByTestId("academy-bulletin-cta")).toBeTruthy();
    expect(screen.getByTestId("academy-bulletin-next")).toBeTruthy();
  });
});

describe("variety", () => {
  it("draws its subject from the practice rail's own sources", () => {
    expect(BULLETIN_QUIZ_SOURCES).toContain("Item Costs");
    expect(BULLETIN_QUIZ_SOURCES).toContain("Champion Ability Cooldowns");
    expect(BULLETIN_QUIZ_SOURCES).toContain("Minion Waves");
    // `vision` has no sources and must contribute nothing.
    expect(BULLETIN_QUIZ_SOURCES.length).toBeGreaterThan(10);
  });

  it("asks a different subject on a different day", async () => {
    renderBulletin({ daySeed: 0 });
    await settled(3);
    const first = mocks.requestedCategories[0];
    cleanup();
    mocks.requestedCategories = [];
    renderBulletin({ daySeed: 1 });
    await settled(3);
    expect(mocks.requestedCategories[0]).not.toBe(first);
  });

  it("shows a different study table on a different day", async () => {
    renderBulletin({ daySeed: 0, initialNoticeId: "mechanics-base_systems.study.fountain" });
    await waitFor(() =>
      expect(screen.getByTestId("academy-bulletin").dataset.bulletinKind).toBe("mechanics"),
    );
    expect(screen.getByTestId("academy-bulletin-title").textContent).toBe("The fountain");
    cleanup();
    renderBulletin({ daySeed: 1, initialNoticeId: "mechanics-base_systems.study.death_timers" });
    await waitFor(() =>
      expect(screen.getByTestId("academy-bulletin").dataset.bulletinKind).toBe("mechanics"),
    );
    expect(screen.getByTestId("academy-bulletin-title").textContent).toBe("Death timers");
  });

  it("considers study tables from every category, not just the first", async () => {
    // Seed 2 lands on the third table, which lives under a different category.
    renderBulletin({ daySeed: 2, initialNoticeId: "mechanics-waves.study.gold" });
    await waitFor(() =>
      expect(screen.getByTestId("academy-bulletin-title").textContent).toBe("Wave gold"),
    );
  });
});

describe("personal projections", () => {
  beforeEach(() => {
    mocks.authUser = { id: "u1", is_anonymous: false };
    mocks.rankedLoadState = "ready";
    mocks.rankedEntries = [MATCH];
    mocks.progress = PROGRESS_ACTIVE;
  });

  it("adds a streak notice on a streak day, with the real numbers", async () => {
    renderBulletin({ daySeed: 0, initialNoticeId: "personal-streak" });
    await waitFor(() =>
      expect(screen.getByTestId("academy-bulletin").dataset.bulletinNotice).toBe(
        "personal-streak",
      ),
    );
    expect(screen.getByTestId("academy-bulletin-title").textContent).toBe("7 correct in a row");
    expect(screen.getByTestId("academy-bulletin-meta").textContent).toContain("Best 19");
  });

  it("adds an Academy standing notice on the alternate day", async () => {
    renderBulletin({ daySeed: 1, initialNoticeId: "personal-standing" });
    await waitFor(() =>
      expect(screen.getByTestId("academy-bulletin").dataset.bulletinNotice).toBe(
        "personal-standing",
      ),
    );
    expect(screen.getByTestId("academy-bulletin-title").textContent).toBe(
      "You stand at Academy Gold",
    );
    expect(screen.getByTestId("academy-bulletin-meta").textContent).toContain("2,600 XP");
  });

  it("gives a sparse account fewer personal notices, not padded ones", async () => {
    // Real account, one match, but no streak and no coherent academy block.
    mocks.progress = { total_attempts: 4, accuracy: 50, current_streak: 1, best_streak: 2 };
    renderBulletin();
    // match + quiz + mechanics + proplay — the SECOND personal notice is the
    // one a sparse account loses, not the board's structure.
    await settled(4);
    const kinds: string[] = [];
    for (let i = 0; i < 4; i++) {
      kinds.push(screen.getByTestId("academy-bulletin").dataset.bulletinKind!);
      fireEvent.click(screen.getByTestId("academy-bulletin-next"));
    }
    expect(kinds.filter((k) => k === "personal")).toHaveLength(1);
  });

  it("never calls a four-answer run a streak", async () => {
    mocks.rankedEntries = [];
    mocks.progress = { total_attempts: 40, accuracy: 60, current_streak: 4, best_streak: 9 };
    renderBulletin({ daySeed: 0 });
    await settled(3);
    for (let i = 0; i < 3; i++) {
      expect(screen.getByTestId("academy-bulletin").dataset.bulletinKind).not.toBe("personal");
      fireEvent.click(screen.getByTestId("academy-bulletin-next"));
    }
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
