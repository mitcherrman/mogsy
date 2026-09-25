/**
 * HISTORY-D — the responsive question-review host and the Ranked row layout.
 *
 * Pointer-fine keeps the approved anchored Popover (pinned in depth by
 * `QuestionTimeline.test.tsx`). Coarse pointer opens the SAME
 * `QuestionReviewCard` in a modal bottom sheet. These tests drive the pointer
 * through `matchMedia("(pointer: coarse)")`, and the row width through a
 * `ResizeObserver` stub that reports a chosen `clientWidth`.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QuestionTimeline from "@/components/quiz/workspace/QuestionTimeline";
import RankedMatchRow from "@/components/quiz/workspace/RankedMatchRow";
import { questionIconLabel } from "@/components/quiz/workspace/questionIcons";
import type {
  MatchHistoryEntryView,
  MatchReviewView,
  ReviewRound,
} from "@/lib/ranked-public/contracts";

// ------------------------------------------------------------- fixtures

function quizRound(n: number, over: Partial<ReviewRound> = {}): ReviewRound {
  return {
    roundNumber: n,
    kind: "quiz",
    moduleId: "quiz",
    category: "Item Costs",
    canonicalQuestionRef: `ranked:c${n}`,
    revealed: true,
    iconHint: { kind: "item", key: "Doran's Blade", icon: "assets/items/1055.png" },
    topic: {
      category: "itemization", tier: "easy",
      iconHint: { kind: "item", key: "Doran's Blade", icon: "assets/items/1055.png" },
    },
    question: {
      prompt: `Prompt ${n}`,
      options: ["A", "B", "C", "D"],
      correctOptionIndex: 0,
      explanation: null,
    },
    challenges: null,
    masteryChallenges: null,
    viewerSubmission: {
      answerIndex: 0, isCorrect: true,
      correctCount: null, answeredCount: null, challengeCount: null,
    },
    ...over,
  };
}

function review(matchId: string, count: number): MatchReviewView {
  const rounds = Array.from({ length: count }, (_, i) => quizRound(i + 1));
  return {
    schemaVersion: "ranked_duel.match_review.v1",
    serverTime: "2026-08-20T12:00:00+00:00",
    matchId,
    finalRoundNumber: count,
    roundCount: count,
    rounds,
  };
}

const ENTRY: MatchHistoryEntryView = {
  matchId: "m1",
  viewerOutcome: "loss",
  terminalReason: "forfeit",
  completionReason: "rounds_complete",
  finalRoundNumber: 5,
  completedAt: "2026-08-20 11:00:00",
  isBotMatch: false,
  viewerClass: "mage",
  opponentClass: "marksman",
  viewerRole: "mid",
  opponentRole: null,
  opponentDisplayName: "Nocturnaut",
  opponentIsBot: false,
  ratingDelta: -18,
  ratingAfter: 1266,
};

// ------------------------------------------------------------- environment

let coarse = false;
let width = 0;

class SizedResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe() {
    this.cb([], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  coarse = false;
  width = 0;
  vi.stubGlobal("ResizeObserver", SizedResizeObserver);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query === "(pointer: coarse)" ? coarse : false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const icons = () => screen.getAllByTestId("timeline-icon");

// ------------------------------------------------------------- touch host

describe("HISTORY-D — touch opens the same card in a modal sheet", () => {
  beforeEach(() => {
    coarse = true;
  });

  it("opens a dialog named for the question, holding QuestionReviewCard, and no popover", async () => {
    const r = review("m1", 3);
    render(<QuestionTimeline matchId="m1" roundCount={3} review={r} />);
    expect(icons()[1]).toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.click(icons()[1]);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName(questionIconLabel(r.rounds[1], 2, 3));
    expect(dialog).toHaveAttribute("data-testid", "question-review-sheet");
    expect(within(dialog).getByTestId("question-review-card")).toBeInTheDocument();
    expect(within(dialog).getByTestId("review-position")).toHaveTextContent("Q2 of 3");
    expect(within(dialog).getByText("Prompt 2")).toBeInTheDocument();
    expect(screen.queryByTestId("question-review-popover")).toBeNull();
  });

  // Radix Popper tests run slowly in this jsdom (see handoff); bound generously.
  it("renders exactly the markup the desktop popover renders", { timeout: 60000 }, async () => {
    const r = review("m1", 2);
    render(<QuestionTimeline matchId="m1" roundCount={2} review={r} />);
    fireEvent.click(icons()[0]);
    const sheetCard = within(await screen.findByRole("dialog")).getByTestId("question-review-card").outerHTML;
    cleanup();

    coarse = false;
    render(<QuestionTimeline matchId="m1" roundCount={2} review={r} />);
    fireEvent.click(icons()[0]);
    const popover = await screen.findByTestId("question-review-popover");
    expect(within(popover).getByTestId("question-review-card").outerHTML).toBe(sheetCard);
    expect(screen.queryByTestId("question-review-sheet")).toBeNull();
  });

  it("has a 44px named close control and returns focus to the opening icon", async () => {
    render(<QuestionTimeline matchId="m1" roundCount={2} review={review("m1", 2)} />);
    const icon = icons()[1];
    fireEvent.click(icon);
    const close = await screen.findByRole("button", { name: "Close question review" });
    expect(close.className).toContain("h-11");
    expect(close.className).toContain("w-11");

    fireEvent.click(close);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(icon);
  });

  it("closes on Escape and returns focus", async () => {
    render(<QuestionTimeline matchId="m1" roundCount={2} review={review("m1", 2)} />);
    const icon = icons()[0];
    fireEvent.click(icon);
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(icon);
  });

  it("opens from the keyboard (the icon is a real button)", async () => {
    render(<QuestionTimeline matchId="m1" roundCount={2} review={review("m1", 2)} />);
    const icon = icons()[0];
    icon.focus();
    expect(document.activeElement).toBe(icon);
    // A native <button> turns Enter/Space into click; jsdom does not, so the
    // click is the activation under test.
    fireEvent.click(icon);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("scrolls its own body, clears the safe area, and has no enter/exit motion", async () => {
    render(<QuestionTimeline matchId="m1" roundCount={1} review={review("m1", 1)} />);
    fireEvent.click(icons()[0]);
    const sheet = await screen.findByTestId("question-review-sheet");
    const body = screen.getByTestId("question-review-sheet-body");
    expect(body.className).toContain("overflow-y-auto");
    expect(body.className).toContain("pb-[max(1rem,env(safe-area-inset-bottom))]");
    expect(sheet.className).toContain("pl-[env(safe-area-inset-left)]");
    expect(sheet.className).toContain("max-h-[85dvh]");
    expect(sheet.className).toContain("!animate-none");
    expect(screen.getByTestId("question-review-sheet-overlay").className).toContain("!animate-none");
  });

  it("gives every question and paging control a 44x44 target", () => {
    render(<QuestionTimeline matchId="m1" roundCount={8} review={review("m1", 8)} />);
    for (const icon of icons()) expect(icon.className).toMatch(/\bh-11 w-11\b/);
    expect(screen.getByTestId("timeline-next").className).toMatch(/\bh-11 w-11\b/);
    expect(screen.getByTestId("timeline-prev").className).toMatch(/\bh-11 w-11\b/);
  });
});

// ------------------------------------------------------------- desktop stays

describe("HISTORY-D — pointer-fine keeps the approved popover", () => {
  it("uses the Popover, the 28px tiles and no dialog semantics", { timeout: 60000 }, async () => {
    render(<QuestionTimeline matchId="m1" roundCount={2} review={review("m1", 2)} />);
    expect(icons()[0].className).toMatch(/\bh-7 w-7\b/);
    expect(icons()[0]).not.toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.click(icons()[0]);
    expect(await screen.findByTestId("question-review-popover")).toBeInTheDocument();
    expect(screen.queryByTestId("question-review-sheet")).toBeNull();
  });
});

// ------------------------------------------------------------- width paging

describe("HISTORY-D — the timeline pages by what fits", () => {
  it("keeps five per page wherever five fit", () => {
    width = 600;
    render(<QuestionTimeline matchId="m1" roundCount={8} review={review("m1", 8)} />);
    expect(icons()).toHaveLength(5);
    expect(screen.getByTestId("question-timeline")).toHaveAttribute("data-page-size", "5");
  });

  it("holds fewer 44px targets on a narrow touch row instead of overflowing it", () => {
    coarse = true;
    width = 228; // a 320px phone's row: (228 - 92 + 2) / 46 = 3
    render(<QuestionTimeline matchId="m1" roundCount={8} review={review("m1", 8)} />);
    expect(icons().map((b) => b.getAttribute("data-round"))).toEqual(["1", "2", "3"]);

    fireEvent.click(screen.getByTestId("timeline-next"));
    expect(icons().map((b) => b.getAttribute("data-round"))).toEqual(["4", "5", "6"]);
    fireEvent.click(screen.getByTestId("timeline-next"));
    expect(icons().map((b) => b.getAttribute("data-round"))).toEqual(["7", "8"]);
    expect(screen.getByTestId("timeline-next")).toBeDisabled();
  });

  it("fits five on a touch row 336px wide (e.g. a landscape phone)", () => {
    coarse = true;
    width = 336;
    render(<QuestionTimeline matchId="m1" roundCount={8} review={review("m1", 8)} />);
    expect(icons()).toHaveLength(5);
  });

  it("HUB4: at 200% text the rem-sized targets double, so the fit halves instead of overflowing", () => {
    coarse = true;
    width = 336; // five 44px targets fit at a 16px root…
    document.documentElement.style.fontSize = "32px";
    try {
      render(<QuestionTimeline matchId="m1" roundCount={8} review={review("m1", 8)} />);
      // …but at 32px each target is 88px: (336 - 184 + 4) / 92 = 1.
      expect(screen.getByTestId("question-timeline")).toHaveAttribute("data-page-size", "1");
    } finally {
      document.documentElement.style.fontSize = "";
    }
  });

  it("is labelled as a group of the match's questions", () => {
    render(<QuestionTimeline matchId="m1" roundCount={3} review={null} />);
    expect(screen.getByRole("group", { name: "Match questions" })).toBeInTheDocument();
  });
});

// ------------------------------------------------------------- the row

describe("HISTORY-D — the Ranked row has no fixed width that can force overflow", () => {
  const renderRow = () =>
    render(
      <ul>
        <RankedMatchRow entry={ENTRY} review={review("m1", 5)} />
      </ul>,
    );

  it("is its own inline-size container and wraps below the one-line width", () => {
    renderRow();
    const row = screen.getByTestId("ranked-match-row");
    expect(row.className).toContain("[container-type:inline-size]");
    const line = screen.getByTestId("ranked-match-line");
    expect(line.className).toContain("flex-wrap");
    expect(line.className).toContain("[@container(min-width:35rem)]:flex-nowrap");
    // Stacked: the timeline takes its own full line after identity/result.
    const timeline = screen.getByTestId("question-timeline");
    expect(timeline.className).toContain("order-last");
    expect(timeline.className).toContain("basis-full");
    // The old fixed 13rem track is gone; the cap is a max-width only.
    expect(row.innerHTML).not.toMatch(/[\s"]w-\[13rem\]/);
    expect(row.innerHTML).toContain("max-w-[13rem]");
  });

  it("uses the wider one-line threshold on touch", () => {
    coarse = true;
    renderRow();
    expect(screen.getByTestId("ranked-match-line").className).toContain(
      "[@container(min-width:44rem)]:flex-nowrap",
    );
  });

  it("still shows every fact the row carried", () => {
    renderRow();
    const row = screen.getByTestId("ranked-match-row");
    expect(within(row).getByText("Defeat")).toBeInTheDocument();
    expect(within(row).getByText("Nocturnaut")).toBeInTheDocument();
    expect(within(row).getByText(/mid/i)).toBeInTheDocument();
    expect(screen.getByTestId("ranked-match-delta")).toHaveTextContent("-18");
    expect(screen.getByTestId("ranked-match-age")).toBeInTheDocument();
    expect(within(row).getByText(/forfeit/)).toBeInTheDocument();
    expect(screen.getByTestId("ranked-match-ladder")).toHaveTextContent("1284 → 1266");
    expect(icons()).toHaveLength(5);
  });
});
