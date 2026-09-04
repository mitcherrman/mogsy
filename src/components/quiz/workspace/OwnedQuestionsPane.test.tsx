/**
 * PT1.2 (revised) — OWNED, the question-ownership half of REVIEW.
 *
 * Asserted against the REAL hub composition, because most of what this
 * promises is about its place in the record: that it is a source INSIDE
 * REVIEW rather than a third pane, that it is FREE while MISSED stays
 * Pro-gated, and that neither source can break or read the other.
 *
 * The rest is honesty: no answer may reach the DOM, an unavailable question
 * stays owned, and an empty collection states the ACTUAL mechanic (play
 * Ranked) rather than promising a Base Library PT1.3 has not built.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LeaguecraftHub from "@/components/quiz/LeaguecraftHub";
import OwnedQuestionsPane from "@/components/quiz/workspace/OwnedQuestionsPane";
import { RankedApiError } from "@/lib/ranked-public/client";
import type { QuizHistoryResponse } from "@/lib/quiz/api";

const getQuestionLibrary = vi.fn();
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

vi.mock("@/lib/ranked-public/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ranked-public/client")>();
  return {
    ...actual,
    getQuestionLibrary: (...args: unknown[]) => getQuestionLibrary(...args),
  };
});
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ loading: false, user: { id: "u1" }, session: null }),
}));
vi.mock("@/lib/backend-auth", () => ({
  ensureBackendAuthToken: vi.fn().mockResolvedValue("token"),
  getBackendAuthHeaders: vi.fn().mockResolvedValue({}),
}));

const HISTORY: QuizHistoryResponse = {
  ok: true, is_pro: false, total_count: 0, limited: false, free_limit: 10,
  upsell_message: null, entitlement_status: "ok", results: [],
};

const entry = (over: Record<string, unknown> = {}) => ({
  canonicalQuestionRef: "ranked:q-1",
  firstSeenAt: "2026-08-01T10:00:00Z",
  lastSeenAt: "2026-08-20T10:00:00Z",
  timesAnswered: 4,
  timesCorrect: 3,
  accuracy: 0.75,
  firstMatchId: "rkb_a",
  firstRoundNumber: 1,
  metadataStatus: "resolved" as const,
  metadataSource: "frozen_round",
  question: { prompt: "What is Flash's base cooldown?", category: "Summoner Spells" },
  ...over,
});

const view = (entries: ReturnType<typeof entry>[], over: Record<string, unknown> = {}) => ({
  schemaVersion: "ranked_duel.question_library.v1",
  serverTime: "2026-09-02T12:00:00Z",
  scope: "ranked_discoveries",
  includesDefaultLibrary: false,
  summary: {
    uniqueDiscovered: entries.length,
    totalAnswered: entries.reduce((n, e) => n + e.timesAnswered, 0),
    totalCorrect: entries.reduce((n, e) => n + e.timesCorrect, 0),
    accuracy: 0.75,
  },
  entries,
  pagination: {
    limit: 25, offset: 0, count: entries.length, total_count: entries.length,
    totalCount: entries.length, hasMore: false, order: "last_seen_at_desc",
  },
  ...over,
});

function renderOwned(props: Partial<React.ComponentProps<typeof OwnedQuestionsPane>> = {}) {
  return render(
    <MemoryRouter>
      <OwnedQuestionsPane {...props} />
    </MemoryRouter>,
  );
}

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
        onCommitRole={() => true}
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
        signedIn
        hasAccount
        {...over}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getQuestionLibrary.mockReset();
  getQuestionLibrary.mockResolvedValue(view([entry()]));
  getMissedQuestions.mockReset();
  getMissedQuestions.mockResolvedValue({
    ok: true, is_pro: true, locked: false, total_count: 1, limit: 25, offset: 0,
    results: [{
      attempt_id: 1, question_id: 9, question_text: "Which item builds from B.F. Sword?",
      selected_answer: "Sunfire Aegis", correct_answer: "Infinity Edge",
      category: "Item Knowledge", difficulty: 2, missed_at: "2026-08-15 10:00:00",
      explanation: "Infinity Edge uses B.F. Sword.",
    }],
  });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("placement — a source inside REVIEW, not a third pane", () => {
  it("leaves the record with exactly two panes", () => {
    renderHub();
    const tabs = screen.getByTestId("workspace-tablist");
    expect(within(tabs).getByTestId("workspace-tab-history")).toBeTruthy();
    expect(within(tabs).getByTestId("workspace-tab-review")).toBeTruthy();
    // The standalone Library pane was removed — REVIEW absorbed it.
    expect(within(tabs).queryByTestId("workspace-tab-library")).toBeNull();
    expect(document.querySelectorAll('[data-testid="leaguecraft-workspace"]').length).toBe(1);
  });

  it("offers OWNED and MISSED inside REVIEW, with OWNED open first", async () => {
    renderHub();
    fireEvent.click(screen.getByTestId("workspace-tab-review"));
    await waitFor(() => expect(screen.getByTestId("review-pane")).toBeTruthy());
    expect(screen.getByTestId("review-pane").dataset.source).toBe("owned");
    expect(screen.getByTestId("review-source-owned")).toBeTruthy();
    expect(screen.getByTestId("review-source-missed")).toBeTruthy();
  });

  it("reads neither source until a reader opens REVIEW", async () => {
    renderHub();
    await waitFor(() => expect(screen.getByTestId("workspace-tablist")).toBeTruthy());
    expect(getQuestionLibrary).not.toHaveBeenCalled();
    expect(getMissedQuestions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("workspace-tab-review"));
    await waitFor(() => expect(getQuestionLibrary).toHaveBeenCalledTimes(1));
    // OWNED is open; the Pro-gated bank is still untouched.
    expect(getMissedQuestions).not.toHaveBeenCalled();
  });

  it("reads MISSED only once its own tab is opened", async () => {
    renderHub();
    fireEvent.click(screen.getByTestId("workspace-tab-review"));
    await waitFor(() => expect(getQuestionLibrary).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("review-source-missed"));
    await waitFor(() => expect(getMissedQuestions).toHaveBeenCalledTimes(1));
  });

  it("still opens REVIEW from /quiz#review, and no #library hash exists", async () => {
    renderHub({}, ["/quiz#review"]);
    await waitFor(() => expect(screen.getByTestId("workspace-panel-review")).toBeTruthy());
    cleanup();
    // An unknown hash falls back to History rather than resolving a Library.
    renderHub({}, ["/quiz#library"]);
    await waitFor(() => expect(screen.getByTestId("workspace-panel-history")).toBeTruthy());
    expect(screen.queryByTestId("workspace-panel-library")).toBeNull();
  });
});

describe("the two sources stay independent", () => {
  it("a failing MISSED bank does not blank OWNED", async () => {
    getMissedQuestions.mockRejectedValue(new Error("bank down"));
    renderHub();
    fireEvent.click(screen.getByTestId("workspace-tab-review"));
    await waitFor(() => expect(screen.getByTestId("owned")).toBeTruthy());
    fireEvent.click(screen.getByTestId("review-source-missed"));
    await waitFor(() => expect(screen.getByTestId("missed-questions-error")).toBeTruthy());
    fireEvent.click(screen.getByTestId("review-source-owned"));
    await waitFor(() => expect(screen.getByTestId("owned")).toBeTruthy());
  });

  it("a Free account sees the MISSED paywall but keeps OWNED", async () => {
    getMissedQuestions.mockResolvedValue({
      ok: true, is_pro: false, locked: true, results: [],
      upsell_message: "Upgrade to Mogzy Premium to review every question you missed.",
    });
    renderHub();
    fireEvent.click(screen.getByTestId("workspace-tab-review"));
    // OWNED is Free: a non-Pro account gets its real collection, not a paywall.
    await waitFor(() => expect(screen.getByTestId("owned")).toBeTruthy());
    expect(screen.queryByTestId("missed-questions-locked")).toBeNull();
    fireEvent.click(screen.getByTestId("review-source-missed"));
    await waitFor(() => expect(screen.getByTestId("missed-questions-locked")).toBeTruthy());
  });

  it("a failing OWNED collection does not break MISSED", async () => {
    getQuestionLibrary.mockRejectedValue(new RankedApiError("backend", 500, "boom"));
    renderHub();
    fireEvent.click(screen.getByTestId("workspace-tab-review"));
    await waitFor(() => expect(screen.getByTestId("owned-error")).toBeTruthy());
    fireEvent.click(screen.getByTestId("review-source-missed"));
    await waitFor(() => expect(screen.getByTestId("missed-questions")).toBeTruthy());
  });
});

describe("an authenticated collection", () => {
  it("shows the discovery count, the counters and the questions", async () => {
    renderOwned();
    await waitFor(() => expect(screen.getByTestId("owned")).toBeTruthy());
    expect(screen.getByTestId("owned-total").textContent).toBe("1");
    expect(screen.getByText("What is Flash's base cooldown?")).toBeTruthy();
    expect(screen.getByText("3/4 correct")).toBeTruthy();
    expect(screen.getAllByTestId("owned-entry")).toHaveLength(1);
  });

  it("asks for one clamped page and sends no user id", async () => {
    renderOwned();
    await waitFor(() => expect(getQuestionLibrary).toHaveBeenCalled());
    const [opts] = getQuestionLibrary.mock.calls[0];
    expect(opts).toEqual({ limit: 25, offset: 0 });
    expect(JSON.stringify(opts)).not.toMatch(/user/i);
  });

  it("groups by category over the loaded pages, and says that is the scope", async () => {
    getQuestionLibrary.mockResolvedValue(
      view([
        entry(),
        entry({
          canonicalQuestionRef: "ranked:q-2",
          question: { prompt: "What does Doran's Shield cost?", category: "Item Costs" },
        }),
      ]),
    );
    renderOwned();
    await waitFor(() => expect(screen.getAllByTestId("owned-entry")).toHaveLength(2));
    fireEvent.click(screen.getByTestId("owned-category-Item Costs"));
    expect(screen.getAllByTestId("owned-entry")).toHaveLength(1);
    expect(screen.getByText("What does Doran's Shield cost?")).toBeTruthy();
    fireEvent.click(screen.getByTestId("owned-category-all"));
    expect(screen.getAllByTestId("owned-entry")).toHaveLength(2);
  });

  it("keeps an unavailable question in the collection, counters intact", async () => {
    getQuestionLibrary.mockResolvedValue(
      view([entry({ metadataStatus: "unavailable", question: null })]),
    );
    renderOwned();
    await waitFor(() => expect(screen.getByTestId("owned-entry")).toBeTruthy());
    expect(screen.getByTestId("owned-entry-unavailable")).toBeTruthy();
    expect(screen.getByText("3/4 correct")).toBeTruthy();
    expect(screen.getByTestId("owned-total").textContent).toBe("1");
  });

  it("renders no-data accuracy as an em dash, never 0%", async () => {
    getQuestionLibrary.mockResolvedValue(
      view([entry({ timesAnswered: 0, timesCorrect: 0, accuracy: null })]),
    );
    renderOwned();
    await waitFor(() => expect(screen.getByTestId("owned-entry")).toBeTruthy());
    const row = screen.getByTestId("owned-entry");
    expect(within(row).getByText("—")).toBeTruthy();
    expect(within(row).queryByText("0%")).toBeNull();
  });
});

describe("no answer may reach the DOM", () => {
  it("renders nothing answer-shaped even if a payload smuggles it in", async () => {
    // The contract reader rejects such a payload; this asserts the SECOND
    // line — the presentation never prints an answer field either.
    getQuestionLibrary.mockResolvedValue(
      view([
        entry({
          question: { prompt: "What is Flash's base cooldown?", category: "Summoner Spells" },
          // deliberately smuggled past the (mocked) reader
          correctIndex: 2,
          options: ["300s", "150s", "270s"],
          explanation: "Flash is 300 seconds at base.",
        } as never),
      ]),
    );
    const { container } = renderOwned();
    await waitFor(() => expect(screen.getByTestId("owned")).toBeTruthy());
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/300s|150s|270s/);
    expect(text).not.toMatch(/Flash is 300 seconds/);
  });
});

describe("states", () => {
  it("shows a loading skeleton first", () => {
    getQuestionLibrary.mockReturnValue(new Promise(() => {}));
    renderOwned();
    expect(screen.getByTestId("owned-loading")).toBeTruthy();
  });

  it("explains the real mechanic when the collection is empty", async () => {
    getQuestionLibrary.mockResolvedValue(view([]));
    renderOwned();
    await waitFor(() => expect(screen.getByTestId("owned-empty")).toBeTruthy());
    const empty = screen.getByTestId("owned-empty");
    expect(empty.textContent).toMatch(/Play Ranked to discover questions and build your collection/);
    // PT1.3 has not built a Base Library; the empty state must not imply one.
    expect(empty.textContent).not.toMatch(/base library|starter|already own/i);
    // And it must not advertise Pro.
    expect(empty.textContent).not.toMatch(/pro\b/i);
  });

  it("surfaces a backend failure with a retry, and does not claim an empty library", async () => {
    getQuestionLibrary.mockRejectedValue(new RankedApiError("backend", 500, "boom"));
    renderOwned();
    await waitFor(() => expect(screen.getByTestId("owned-error")).toBeTruthy());
    expect(screen.queryByTestId("owned-empty")).toBeNull();
    getQuestionLibrary.mockResolvedValue(view([entry()]));
    fireEvent.click(screen.getByText("Try again"));
    await waitFor(() => expect(screen.getByTestId("owned")).toBeTruthy());
  });

  it("asks a guest to sign in WITHOUT spending a request", async () => {
    renderOwned({ hasAccount: false });
    await waitFor(() => expect(screen.getByTestId("owned-needs-account")).toBeTruthy());
    expect(getQuestionLibrary).not.toHaveBeenCalled();
    expect(screen.queryByTestId("owned-empty")).toBeNull();
  });

  it("treats a 403 ACCOUNT_REQUIRED as the account boundary, not an error", async () => {
    getQuestionLibrary.mockRejectedValue(
      new RankedApiError("backend", 403, "a signed-in account is required", "ACCOUNT_REQUIRED"),
    );
    renderOwned();
    await waitFor(() => expect(screen.getByTestId("owned-needs-account")).toBeTruthy());
    expect(screen.queryByTestId("owned-error")).toBeNull();
  });

  it("treats a 401 the same way", async () => {
    getQuestionLibrary.mockRejectedValue(new RankedApiError("backend", 401, "auth required"));
    renderOwned();
    await waitFor(() => expect(screen.getByTestId("owned-needs-account")).toBeTruthy());
  });
});

describe("paging", () => {
  it("appends the next page and never duplicates a ref", async () => {
    const first = view([entry()], {
      summary: { uniqueDiscovered: 2, totalAnswered: 4, totalCorrect: 3, accuracy: 0.75 },
    });
    getQuestionLibrary.mockResolvedValue(first);
    renderOwned();
    await waitFor(() => expect(screen.getByTestId("owned")).toBeTruthy());

    getQuestionLibrary.mockResolvedValue(
      view(
        [
          entry(), // the SAME ref, shifted pages by a concurrent submission
          entry({
            canonicalQuestionRef: "ranked:q-2",
            question: { prompt: "What does Doran's Shield cost?", category: "Item Costs" },
          }),
        ],
        { summary: { uniqueDiscovered: 2, totalAnswered: 6, totalCorrect: 4, accuracy: 0.66 } },
      ),
    );
    fireEvent.click(screen.getByText("Load more"));
    await waitFor(() => expect(screen.getAllByTestId("owned-entry")).toHaveLength(2));
  });
});
