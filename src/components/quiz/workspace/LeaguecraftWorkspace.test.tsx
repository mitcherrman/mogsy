/**
 * MALT Phase A — the Leaguecraft History / Review workspace.
 *
 * Asserted against the REAL hub composition rather than the workspace in
 * isolation, because half of what Phase A promises is about the workspace's
 * relationship to the page above it: that it reuses the payload the lobby
 * already holds, that Recent Studies now opens it instead of leaving, that
 * the Pro-gated bank is not read by a reader who never opened Review, and
 * that none of it disturbs the approved first screen.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LeaguecraftHub from "@/components/quiz/LeaguecraftHub";
import type { QuizHistoryResponse, MissedQuestionsResponse } from "@/lib/quiz/api";

const getMissedQuestions = vi.fn();

vi.mock("@/lib/quiz/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz/api")>();
  return {
    ...actual,
    quizApi: {
      ...actual.quizApi,
      getMissedQuestions: (...args: unknown[]) => getMissedQuestions(...args),
    },
  };
});
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ loading: false, user: { id: "u1" }, session: null }),
}));
vi.mock("@/lib/backend-auth", () => ({
  ensureBackendAuthToken: vi.fn().mockResolvedValue("token"),
}));

const HISTORY: QuizHistoryResponse = {
  ok: true,
  is_pro: false,
  total_count: 41,
  limited: true,
  free_limit: 10,
  upsell_message: "Free accounts save your last 10 results.",
  entitlement_status: "ok",
  results: [
    { session_id: 3, date: "2026-08-16 10:00:00", completed_at: "2026-08-16 10:00:00", mode: "standard", category: "Item Knowledge", score: 8, total_questions: 10, accuracy: 80, duration_seconds: 125 },
    { session_id: 2, date: "2026-08-15 09:00:00", completed_at: "2026-08-15 09:00:00", mode: "daily", category: null, score: 3, total_questions: 5, accuracy: 60, duration_seconds: 45 },
    { session_id: 1, date: "2026-08-14 08:00:00", completed_at: "2026-08-14 08:00:00", mode: "legacy", category: null, score: 2, total_questions: 10, accuracy: 20, duration_seconds: null },
  ],
};

const PRO_BANK: MissedQuestionsResponse = {
  ok: true,
  is_pro: true,
  locked: false,
  total_count: 1,
  limit: 25,
  offset: 0,
  results: [
    {
      attempt_id: 11,
      question_id: 5,
      question_text: "Which item builds from B.F. Sword?",
      selected_answer: "Sunfire Aegis",
      correct_answer: "Infinity Edge",
      category: "Item Knowledge",
      difficulty: 2,
      missed_at: "2026-08-15 10:00:00",
      explanation: "Infinity Edge uses B.F. Sword.",
    },
  ],
};

const LOCKED_BANK: MissedQuestionsResponse = {
  ok: true,
  is_pro: false,
  locked: true,
  upsell_message: "Upgrade to Mogsy Pro to review every question you missed.",
  results: [],
};

function renderHub(
  over: Partial<React.ComponentProps<typeof LeaguecraftHub>> = {},
  entries: string[] = ["/quiz"],
) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <LeaguecraftHub
        progress={{ rank_name: "Bronze" }}
        ranked={{ placementMatchesRemaining: 0, isPlaced: true, estimatedGain: 20, estimatedLoss: 15 }}
        onPlayRanked={() => true}
        onEnterMatch={() => {}}
        onPlayDailyChallenge={() => {}}
        playModes={{ ranked: true, daily: true, invite: true }}
        sets={[]}
        setsLoading={false}
        onSelectSet={() => {}}
        onRefreshSets={() => {}}
        history={HISTORY}
        historyLoading={false}
        historyError={null}
        rankedProgression={null}
        {...over}
      />
    </MemoryRouter>,
  );
}

const openReview = () => fireEvent.click(screen.getByTestId("workspace-tab-review"));

beforeEach(() => {
  getMissedQuestions.mockReset();
  getMissedQuestions.mockResolvedValue(PRO_BANK);
  // jsdom has neither; the hub's arrival scroll calls both.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("MALT — the workspace exists, below the approved first screen", () => {
  it("mounts one workspace, after the composition and the secondary row", () => {
    const { container } = renderHub();
    const rack = container.querySelector('[data-testid="hub-ranked-section"]')!;
    const rail = container.querySelector('[data-testid="quiz-category-rail"]')!;
    const record = container.querySelector('[data-testid="hub-record-section"]')!;
    expect(record).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="leaguecraft-workspace"]').length).toBe(1);
    const follows = (a: Element, b: Element) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(follows(rack, record)).toBeTruthy();
    expect(follows(rail, record)).toBeTruthy();
    // It is the ONLY thing under the rail: no Recent Studies preview, no
    // Practice panel between the composition and the record.
    expect(container.querySelector('[data-testid="hub-recent-section"]')).toBeNull();
    expect(container.querySelector('[data-testid="hub-practice-section"]')).toBeNull();
  });

  it("is NOT another parchment scroll — it sits on the lower lobby's plate", () => {
    const { container } = renderHub();
    const record = container.querySelector('[data-testid="hub-record-section"]')!;
    const panel = record.querySelector('[data-testid="hero-panel"]')!;
    expect(panel.getAttribute("data-variant")).toBe("plate");
    expect(record.querySelector(".lc-scroll")).toBeNull();
    // …and the page's ONE ceremonial emblem is still the centre column's, so
    // the workspace did not become a second hero.
    expect(container.querySelectorAll('[data-emphasis="true"]').length).toBeLessThanOrEqual(1);
  });

  it("leaves the approved first screen exactly as it was", () => {
    const { container } = renderHub();
    // The three-scroll rack, the rail, and the wrapper that composes them.
    expect(container.querySelectorAll('[data-variant="scroll"]').length).toBe(3);
    const rail = container.querySelector('[data-testid="quiz-category-rail"]')!;
    expect(rail).not.toBeNull();
    const firstScreen = container
      .querySelector('[data-testid="hub-ranked-section"]')!
      .parentElement!;
    expect(firstScreen.contains(rail)).toBe(true);
    // The reserve is height-aware now — full-viewport on a short desktop,
    // absent above 880px tall so the record can follow the rail naturally
    // instead of a 268px band of dead classroom.
    expect(firstScreen.className).toContain(
      "lg:[@media(max-height:879px)]:min-h-[calc(100dvh_-_2.25rem)]",
    );
    expect(firstScreen.className).toContain(
      "xl:[@media(max-height:879px)]:min-h-[calc(100dvh_-_0.75rem)]",
    );
    expect(firstScreen.className).toContain("gap-2");
    // The record is still OUTSIDE the composition, whichever regime is on —
    // it follows the first screen, it is never part of it.
    expect(firstScreen.contains(container.querySelector('[data-testid="hub-record-section"]'))).toBe(
      false,
    );
    // Exactly one seal, one wordmark.
    expect(screen.getAllByRole("button", { name: /^Play$/ }).length).toBe(1);
    expect(container.querySelectorAll("h1").length).toBe(1);
  });
});

describe("MALT — the consolidation: one history system, no practice panel", () => {
  it("renders no standalone Recent Studies preview alongside the ledger", () => {
    const { container } = renderHub();
    expect(container.querySelector('[data-testid="recent-results-card"]')).toBeNull();
    expect(container.querySelector('[data-testid="history-row"]')).toBeNull();
    expect(container.querySelector('[data-testid="recent-results-view-full"]')).toBeNull();
    expect(screen.queryByText("Recent Studies")).toBeNull();
    // Each session is printed exactly once, by the ledger.
    expect(container.querySelectorAll('[data-testid="study-history-row"]').length).toBe(
      HISTORY.results.length,
    );
  });

  it("hides the Practice for Ranked panel by default, and keeps it restorable", () => {
    const hidden = renderHub().container;
    expect(hidden.querySelector('[data-testid="hub-practice-section"]')).toBeNull();
    expect(hidden.querySelectorAll('[data-testid="practice-tile"]').length).toBe(0);
    cleanup();
    // WITHHELD, not deleted: the sets, their counts and the start action are
    // all still behind the flag `Quiz.tsx` owns.
    const shown = renderHub({
      showPractice: true,
      sets: [{ id: 5, name: "All Current Questions", description: "", question_count: 1260 }],
    }).container;
    expect(shown.querySelector('[data-testid="hub-practice-section"]')).not.toBeNull();
    expect(shown.querySelectorAll('[data-testid="practice-tile"]').length).toBe(1);
  });

  it("keeps ONE empty state, with one practice action, when there is no record", () => {
    const onSelectSet = vi.fn();
    const { container } = renderHub({
      history: { ...HISTORY, results: [], total_count: 0, limited: false },
      sets: [{ id: 5, name: "All Current Questions", description: "", question_count: 1260 }],
      onSelectSet,
    });
    expect(container.querySelectorAll('[data-testid="study-history-empty"]').length).toBe(1);
    expect(container.querySelector('[data-testid="history-empty"]')).toBeNull();
    fireEvent.click(screen.getByTestId("study-history-start-practice"));
    expect(onSelectSet).toHaveBeenCalledTimes(1);
    expect(onSelectSet.mock.calls[0][0]).toMatchObject({ name: "All Current Questions" });
  });

  it("folds the old card's summary into the ledger's own scope line", () => {
    renderHub();
    const scope = screen.getByTestId("study-history-scope").textContent!;
    // 80, 60 and 20 across the three rows.
    expect(scope).toContain("53%");
    expect(scope).toContain("80%");
    expect(scope).toMatch(/average/);
    expect(scope).toMatch(/best/);
    // …and it says the figures are over the visible window, not a career.
    expect(scope).toMatch(/over these/);
  });
});

describe("MALT — History", () => {
  it("renders the account's real sessions from the payload the page already holds", () => {
    const { container } = renderHub();
    const rows = container.querySelectorAll('[data-testid="study-history-row"]');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain("Item Knowledge");
    expect(rows[0].textContent).toContain("8/10");
    expect(rows[0].textContent).toContain("80%");
    expect(rows[0].textContent).toContain("2m 5s");
    // Daily is Daily; a legacy row falls back to the neutral label rather
    // than inventing a category it does not carry.
    expect(rows[1].textContent).toContain("Daily");
    expect(rows[2].textContent).toContain("Practice");
    // No Ranked row can reach this stream, and the ledger never claims one.
    expect(container.querySelector('[data-testid="hub-record-section"]')!.textContent).not.toMatch(
      /Ranked (history|record)/i,
    );
  });

  it("states the Free window truthfully instead of implying full history", () => {
    renderHub();
    const scope = screen.getByTestId("study-history-scope");
    expect(scope.textContent).toContain("3");
    expect(scope.textContent).toContain("41");
    expect(screen.getByTestId("study-history-upsell").textContent).toContain(
      "Free accounts save your last 10 results.",
    );
    expect(
      within(screen.getByTestId("study-history-upsell")).getByRole("link").getAttribute("href"),
    ).toBe("/lol/pro");
  });

  it("says so when the backend could not resolve entitlement at all", () => {
    renderHub({ history: { ...HISTORY, entitlement_status: "error" } });
    expect(screen.getByTestId("study-history-entitlement-unknown").textContent).toMatch(
      /could not be confirmed/i,
    );
  });

  it("shows an honest empty record, and never an error as an empty one", () => {
    renderHub({ history: { ...HISTORY, results: [], total_count: 0, limited: false } });
    expect(screen.getByTestId("study-history-empty").textContent).toContain(
      "No completed quizzes yet.",
    );
  });

  it("offers a guest the way in rather than an error string", () => {
    renderHub({ history: null, historyError: "sign-in required" });
    const auth = screen.getByTestId("study-history-auth");
    expect(within(auth).getByRole("link", { name: /Sign in/ })).toBeTruthy();
    expect(auth.textContent).not.toContain("sign-in required");
  });
});

describe("MALT — the Ranked record (Phase B design preview)", () => {
  const RANKED = [
    {
      matchId: "m1", viewerOutcome: "win" as const, terminalReason: "combat" as const,
      completionReason: "rounds_complete", finalRoundNumber: 5,
      completedAt: "2026-08-16 12:00:00", isBotMatch: false,
      viewerClass: "mage", opponentClass: "marksman",
      viewerRole: "mid" as const, opponentRole: null,
      opponentDisplayName: "Sylvara", opponentIsBot: false,
      ratingDelta: 22, ratingAfter: 1284,
    },
    {
      matchId: "m2", viewerOutcome: "loss" as const, terminalReason: "forfeit" as const,
      completionReason: "forfeit", finalRoundNumber: 2,
      completedAt: "2026-08-14 12:00:00", isBotMatch: true,
      viewerClass: "mage", opponentClass: "mage",
      viewerRole: "jungle" as const, opponentRole: null,
      opponentDisplayName: null, opponentIsBot: true,
      ratingDelta: null, ratingAfter: null,
    },
  ];

  it("renders NOTHING unless a host supplies entries — Phase B is not wired", () => {
    // `Quiz.tsx` holds the account's real Ranked rows for the centre
    // parchment and deliberately does not hand them to the record. A record
    // that quietly started printing them would BE Phase B.
    const { container } = renderHub();
    expect(container.querySelector('[data-testid="ranked-match-row"]')).toBeNull();
    expect(container.querySelector('[data-testid="history-stream-filter"]')).toBeNull();
  });

  it("prints only what the match-history contract actually carries", () => {
    renderHub({ rankedHistoryPreview: RANKED });
    const row = screen.getAllByTestId("ranked-match-row")[0];
    expect(row.getAttribute("data-outcome")).toBe("win");
    expect(row.textContent).toContain("Victory");
    expect(row.textContent).toContain("Sylvara");
    expect(row.textContent).toContain("Mid");
    expect(row.textContent).toContain("+22");
    // finalRoundNumber is match LENGTH. It must never be dressed as a score.
    expect(row.textContent).toContain("5 rounds");
    expect(row.textContent).not.toMatch(/\b\d+\s*[-–]\s*\d+\b/);
    // Rating before is DERIVED, and only from two present halves.
    expect(screen.getByTestId("ranked-match-ladder").textContent).toMatch(/1262.*1284/);
  });

  it("withholds the ladder line rather than inventing one", () => {
    renderHub({ rankedHistoryPreview: RANKED });
    const rows = screen.getAllByTestId("ranked-match-row");
    const pre = rows[1];
    // A pre-rating result has neither delta nor rating: an em dash, and no
    // before → after pair computed from a missing half.
    expect(pre.textContent).toContain("—");
    expect(pre.querySelector('[data-testid="ranked-match-ladder"]')).toBeNull();
    expect(pre.textContent).toContain("Bot");
    expect(pre.textContent).toContain("forfeit");
  });

  it("invents no analytics, no champions and no round strip", () => {
    const { container } = renderHub({ rankedHistoryPreview: RANKED });
    const text = container.querySelector('[data-testid="hub-record-section"]')!.textContent!;
    for (const invented of [/dominant/i, /comeback/i, /outdrafted/i, /clutch/i, /mvp/i]) {
      expect(text).not.toMatch(invented);
    }
    // No champion art: Ranked records a class and a role, never a champion.
    const imgs = screen.getAllByTestId("ranked-match-row").flatMap((r) =>
      Array.from(r.querySelectorAll("img")),
    );
    expect(imgs).toHaveLength(0);
  });

  it("is a record, not a button — there is no match review to open yet", () => {
    renderHub({ rankedHistoryPreview: RANKED });
    const row = screen.getAllByTestId("ranked-match-row")[0];
    expect(row.tagName).toBe("LI");
    expect(row.getAttribute("role")).toBeNull();
    expect(row.getAttribute("tabindex")).toBeNull();
    expect(row.querySelector("a, button")).toBeNull();
  });

  it("interleaves both streams into ONE record, newest first", () => {
    const { container } = renderHub({ rankedHistoryPreview: RANKED });
    const kinds = Array.from(
      container.querySelector('[data-testid="study-history"] ul')!.children,
    ).map((li) => li.getAttribute("data-testid"));
    expect(kinds).toContain("ranked-match-row");
    expect(kinds).toContain("study-history-row");
    // Mixed, not two stacked blocks. The fixtures interleave by time —
    // ranked(16th 12:00), study(16th 10:00), study(15th), ranked(14th 12:00),
    // study(14th 08:00) — so a study row must sit BEFORE the last ranked row.
    expect(kinds.lastIndexOf("ranked-match-row")).toBeGreaterThan(
      kinds.indexOf("study-history-row"),
    );
    expect(kinds.indexOf("study-history-row")).toBeGreaterThan(
      kinds.indexOf("ranked-match-row"),
    );
  });

  it("filters the record by stream, and says what it is showing", () => {
    renderHub({ rankedHistoryPreview: RANKED });
    fireEvent.click(screen.getByTestId("history-stream-ranked"));
    expect(screen.queryByTestId("study-history-row")).toBeNull();
    expect(screen.getAllByTestId("ranked-match-row").length).toBe(RANKED.length);
    expect(screen.getByTestId("study-history-scope").textContent).toMatch(/ranked duels/i);

    fireEvent.click(screen.getByTestId("history-stream-study"));
    expect(screen.queryByTestId("ranked-match-row")).toBeNull();
    expect(screen.getAllByTestId("study-history-row").length).toBe(HISTORY.results.length);
    expect(screen.getByTestId("study-history-scope").textContent).toMatch(/sessions/i);
  });
});

describe("MALT — Review", () => {
  it("does NOT read the Pro-gated bank until a reader opens Review", async () => {
    renderHub();
    await waitFor(() =>
      expect(screen.getByTestId("study-history-scope")).toBeTruthy(),
    );
    expect(getMissedQuestions).not.toHaveBeenCalled();
    openReview();
    await waitFor(() => expect(getMissedQuestions).toHaveBeenCalled());
  });

  it("renders the missed question, both answers and the explanation", async () => {
    renderHub();
    openReview();
    await waitFor(() =>
      expect(screen.getByText("Which item builds from B.F. Sword?")).toBeTruthy(),
    );
    expect(screen.getByText(/Your answer: Sunfire Aegis/)).toBeTruthy();
    expect(screen.getByText(/Correct answer: Infinity Edge/)).toBeTruthy();
    expect(screen.getByText("Infinity Edge uses B.F. Sword.")).toBeTruthy();
    expect(screen.queryByText(/Upgrade to Mogsy Pro/)).toBeNull();
  });

  it("keeps the Free paywall exactly as it was, with no content leaked", async () => {
    getMissedQuestions.mockResolvedValue(LOCKED_BANK);
    renderHub();
    openReview();
    await waitFor(() => expect(screen.getByTestId("missed-questions-locked")).toBeTruthy());
    expect(
      screen.getByRole("link", { name: /Upgrade to Mogsy Pro/ }).getAttribute("href"),
    ).toBe("/lol/pro");
    expect(screen.queryByTestId("missed-question")).toBeNull();
    expect(screen.getByTestId("missed-questions-locked").textContent).toContain(
      "Free players can review missed questions on each quiz’s results screen.",
    );
  });

  it("never shows the paywall for a backend failure", async () => {
    getMissedQuestions.mockResolvedValue({ ok: false, error: "db", results: [] });
    renderHub();
    openReview();
    await waitFor(() => expect(screen.getByTestId("missed-questions-error")).toBeTruthy());
    expect(screen.queryByText(/Upgrade to Mogsy Pro/)).toBeNull();
  });

  it("pages the bank rather than capping it", async () => {
    getMissedQuestions.mockResolvedValue({ ...PRO_BANK, total_count: 2 });
    renderHub();
    openReview();
    await waitFor(() => expect(screen.getByRole("button", { name: /Load more/ })).toBeTruthy());
    expect(screen.getByTestId("missed-questions-scope").textContent).toContain("2");
    fireEvent.click(screen.getByRole("button", { name: /Load more/ }));
    await waitFor(() =>
      expect(getMissedQuestions).toHaveBeenLastCalledWith({ limit: 25, offset: 1 }),
    );
  });

  it("offers NO retry-missed action, because there is no retry-missed path", async () => {
    renderHub();
    openReview();
    await waitFor(() =>
      expect(screen.getByText("Which item builds from B.F. Sword?")).toBeTruthy(),
    );
    // The old control opened a "coming soon" toast and practised nothing. A
    // dead primary action inside the lobby, a scroll below real play
    // entrances, is worse than no action at all.
    expect(screen.queryByRole("button", { name: /Practice missed/i })).toBeNull();
    const panel = screen.getByTestId("workspace-panel-review");
    for (const button of within(panel).queryAllByRole("button")) {
      expect(button.textContent).not.toMatch(/practice|retry|try these again/i);
    }
  });
});

describe("MALT — moving between the two", () => {
  it("switches panes, and exposes them as tabs rather than as destinations", async () => {
    const { container } = renderHub();
    const tablist = screen.getByTestId("workspace-tablist");
    expect(tablist.getAttribute("role")).toBe("tablist");
    expect(screen.getByTestId("workspace-tab-history").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("workspace-tab-review").getAttribute("aria-selected")).toBe("false");

    openReview();
    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="leaguecraft-workspace"]')!.getAttribute("data-mode"),
      ).toBe("review"),
    );
    expect(screen.queryByTestId("study-history-row")).toBeNull();
    expect(screen.getByTestId("workspace-panel-review")).toBeTruthy();

    fireEvent.click(screen.getByTestId("workspace-tab-history"));
    await waitFor(() => expect(screen.getAllByTestId("study-history-row").length).toBe(3));
    expect(screen.queryByTestId("missed-question")).toBeNull();
  });

  it("moves between panes from the keyboard", async () => {
    renderHub();
    fireEvent.keyDown(screen.getByTestId("workspace-tab-history"), { key: "ArrowRight" });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-tab-review").getAttribute("aria-selected")).toBe("true"),
    );
  });

  it("is NOT called Admin Review — the player's review is their own mistakes", () => {
    const { container } = renderHub();
    const record = container.querySelector('[data-testid="hub-record-section"]')!;
    expect(record.textContent).not.toMatch(/admin/i);
    expect(record.textContent).not.toMatch(/moderat/i);
  });
});

describe("MALT — the workspace is addressable", () => {
  it("opens Review directly from /quiz#review", async () => {
    const { container } = renderHub({}, ["/quiz#review"]);
    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="leaguecraft-workspace"]')!.getAttribute("data-mode"),
      ).toBe("review"),
    );
    await waitFor(() => expect(getMissedQuestions).toHaveBeenCalled());
    // …and it takes the reader there rather than leaving them on the lobby
    // wondering what changed four screens down.
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("opens History from /quiz#history, and ignores a hash that names nothing", async () => {
    const { container } = renderHub({}, ["/quiz#history"]);
    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="leaguecraft-workspace"]')!.getAttribute("data-mode"),
      ).toBe("history"),
    );
    cleanup();
    vi.mocked(Element.prototype.scrollIntoView).mockClear();
    const plain = renderHub({}, ["/quiz#somethingelse"]).container;
    expect(
      plain.querySelector('[data-testid="leaguecraft-workspace"]')!.getAttribute("data-mode"),
    ).toBe("history");
    // A hash that names no pane must not throw a reader past the first screen.
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("does not scroll a reader who merely arrived at /quiz", () => {
    renderHub();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("makes a tab press undoable — back returns to the pane before it", async () => {
    const { container } = renderHub();
    const mode = () =>
      container.querySelector('[data-testid="leaguecraft-workspace"]')!.getAttribute("data-mode");
    openReview();
    await waitFor(() => expect(mode()).toBe("review"));
    window.history.back();
    // MemoryRouter owns its own stack, so the assertion that matters here is
    // that the pane is driven by the URL and not by state the router cannot
    // reach: re-rendering at the previous entry restores History.
    cleanup();
    const back = renderHub({}, ["/quiz"]).container;
    expect(
      back.querySelector('[data-testid="leaguecraft-workspace"]')!.getAttribute("data-mode"),
    ).toBe("history");
  });
});
