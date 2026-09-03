/**
 * PT1.2 (revised) — the ownership footnote HISTORY's question cards gained.
 *
 * Two properties matter more than the rendering: the index costs ONE request
 * for a whole record of cards, and an index that could not be completed shows
 * NOTHING rather than a partial answer a reader would misread as "not owned".
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QuestionReviewCard from "@/components/quiz/workspace/QuestionReviewCard";
import {
  OwnedQuestionIndexProvider,
  useOwnedQuestionIndex,
  type OwnedQuestionIndex,
} from "@/components/quiz/workspace/ownedQuestionIndex";
import type { QuestionLibraryEntryView, ReviewRound } from "@/lib/ranked-public/contracts";

const getQuestionLibrary = vi.fn();
vi.mock("@/lib/ranked-public/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ranked-public/client")>();
  return { ...actual, getQuestionLibrary: (...a: unknown[]) => getQuestionLibrary(...a) };
});

const ROUND: ReviewRound = {
  roundNumber: 1,
  kind: "quiz",
  moduleId: "quiz",
  category: "Summoner Spells",
  canonicalQuestionRef: "ranked:q-1",
  revealed: true,
  iconHint: { kind: "category", key: "Summoner Spells", icon: null },
  topic: null,
  question: {
    prompt: "What is Flash's base cooldown?",
    options: ["300s", "150s", "270s"],
    correctOptionIndex: 0,
    explanation: null,
  },
  challenges: null,
  masteryChallenges: null,
  viewerSubmission: {
    answerIndex: 0, isCorrect: true, correctCount: null,
    answeredCount: null, challengeCount: null,
  },
};

const OWNED: QuestionLibraryEntryView = {
  canonicalQuestionRef: "ranked:q-1",
  firstSeenAt: "2026-08-18T10:00:00Z",
  lastSeenAt: "2026-08-31T10:00:00Z",
  timesAnswered: 4,
  timesCorrect: 3,
  accuracy: 0.75,
  firstMatchId: "rkb_a",
  firstRoundNumber: 1,
  metadataStatus: "resolved",
  metadataSource: "frozen_round",
  question: { prompt: "What is Flash's base cooldown?", category: "Summoner Spells" },
};

function renderCard(index: OwnedQuestionIndex, round: ReviewRound = ROUND) {
  return render(
    <OwnedQuestionIndexProvider value={index}>
      <QuestionReviewCard round={round} position={1} total={5} />
    </OwnedQuestionIndexProvider>,
  );
}

const complete = (entries: QuestionLibraryEntryView[]): OwnedQuestionIndex => ({
  byRef: new Map(entries.map((e) => [e.canonicalQuestionRef, e])),
  complete: true,
});

beforeEach(() => {
  getQuestionLibrary.mockReset();
  getQuestionLibrary.mockResolvedValue({
    schemaVersion: "ranked_duel.question_library.v1",
    serverTime: "2026-09-02T12:00:00Z",
    scope: "ranked_discoveries",
    includesDefaultLibrary: false,
    summary: { uniqueDiscovered: 1, totalAnswered: 4, totalCorrect: 3, accuracy: 0.75 },
    entries: [OWNED],
    pagination: {
      limit: 100, offset: 0, count: 1, totalCount: 1,
      hasMore: false, order: "last_seen_at_desc",
    },
  });
});
afterEach(cleanup);

describe("the ownership footnote on HISTORY's card", () => {
  it("states the lifetime record without touching the rest of the card", () => {
    renderCard(complete([OWNED]));
    const note = screen.getByTestId("review-ownership");
    expect(note.textContent).toMatch(/In your collection since/);
    expect(note.textContent).toMatch(/answered\s*4\s*times/);
    expect(note.textContent).toMatch(/3\s*correct/);
    expect(note.textContent).toMatch(/75%/);
    // The rich card is undamaged: prompt, options, pick and correct answer.
    expect(screen.getByText("What is Flash's base cooldown?")).toBeTruthy();
    // "300s" appears twice — as an option and as the marked correct answer.
    expect(screen.getAllByText("300s").length).toBeGreaterThan(0);
    expect(screen.getAllByText("150s").length).toBeGreaterThan(0);
  });

  it("prints nothing for a question that is not in the collection", () => {
    renderCard(complete([]));
    expect(screen.queryByTestId("review-ownership")).toBeNull();
  });

  it("prints nothing for a round with no canonical ref", () => {
    renderCard(complete([OWNED]), { ...ROUND, canonicalQuestionRef: null });
    expect(screen.queryByTestId("review-ownership")).toBeNull();
  });

  it("prints nothing while the index is INCOMPLETE, rather than a partial answer", () => {
    // The load-bearing case: a player whose collection did not fit one page
    // must not see "not owned" on questions they do own.
    renderCard({ byRef: new Map([[OWNED.canonicalQuestionRef, OWNED]]), complete: false });
    expect(screen.queryByTestId("review-ownership")).toBeNull();
  });

  it("prints an em dash, never 0%, when nothing was answered", () => {
    renderCard(complete([{ ...OWNED, timesAnswered: 0, timesCorrect: 0, accuracy: null }]));
    const note = screen.getByTestId("review-ownership");
    expect(note.textContent).toContain("—");
    expect(note.textContent).not.toContain("0%");
  });
});

describe("the index itself", () => {
  function Probe({ enabled }: { enabled: boolean }) {
    const index = useOwnedQuestionIndex(enabled);
    return <span data-testid="probe">{`${index.complete}:${index.byRef.size}`}</span>;
  }

  it("costs ONE request for the whole record", async () => {
    render(<Probe enabled />);
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("true:1"));
    expect(getQuestionLibrary).toHaveBeenCalledTimes(1);
    expect(getQuestionLibrary.mock.calls[0][0]).toEqual({ limit: 100, offset: 0 });
  });

  it("makes no request at all when disabled (guest / frozen host)", () => {
    render(<Probe enabled={false} />);
    expect(getQuestionLibrary).not.toHaveBeenCalled();
    expect(screen.getByTestId("probe").textContent).toBe("false:0");
  });

  it("reports incomplete when the collection did not fit one page", async () => {
    getQuestionLibrary.mockResolvedValue({
      schemaVersion: "ranked_duel.question_library.v1",
      serverTime: "2026-09-02T12:00:00Z",
      scope: "ranked_discoveries",
      includesDefaultLibrary: false,
      summary: { uniqueDiscovered: 250, totalAnswered: 400, totalCorrect: 300, accuracy: 0.75 },
      entries: [OWNED],
      pagination: {
        limit: 100, offset: 0, count: 1, totalCount: 250,
        hasMore: true, order: "last_seen_at_desc",
      },
    });
    render(<Probe enabled />);
    await waitFor(() => expect(getQuestionLibrary).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("false:1"));
  });

  it("degrades to no ownership when the read fails", async () => {
    getQuestionLibrary.mockRejectedValue(new Error("down"));
    render(<Probe enabled />);
    await waitFor(() => expect(getQuestionLibrary).toHaveBeenCalled());
    expect(screen.getByTestId("probe").textContent).toBe("false:0");
  });
});
