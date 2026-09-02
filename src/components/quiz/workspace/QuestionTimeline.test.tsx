/**
 * MALT B1 — the question timeline and its anchored review popover.
 *
 * Asserted through the REAL hub composition wherever the claim is about the
 * record (that production reads real Ranked rows, that each match pages its
 * own timeline), and against the timeline in isolation where the claim is
 * about the control itself. Both matter: a timeline that works alone and
 * never receives production data would be the same shipped nothing Phase A
 * deliberately refused to pretend it wasn't.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import LeaguecraftHub from "@/components/quiz/LeaguecraftHub";
import QuestionTimeline from "@/components/quiz/workspace/QuestionTimeline";
import {
  questionIconLabel,
  questionOutcome,
  resolveQuestionIcon,
} from "@/components/quiz/workspace/questionIcons";
import type { QuizHistoryResponse } from "@/lib/quiz/api";
import type {
  MatchHistoryEntryView,
  MatchReviewView,
  ReviewRound,
} from "@/lib/ranked-public/contracts";

/**
 * Radix's popper measures its anchor, and jsdom has no `ResizeObserver`.
 *
 * STUBBED, NOT ASSIGNED. An earlier version did
 * `globalThis.ResizeObserver = RO` at module scope, which is a permanent
 * mutation of a shared global: vitest reuses a worker across files, so a
 * no-op observer leaked into every suite that ran after this one and made
 * Combat Lab, LolHub and Stat Check fail intermittently depending on file
 * order. `vi.stubGlobal` + `unstubAllGlobals` scopes it to this file, which
 * is what makes the full-suite failure set reproducible again.
 */
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", RO);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const getMatchReview = vi.fn();

vi.mock("@/lib/ranked-public/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ranked-public/client")>();
  return {
    ...actual,
    getMatchReview: (...args: unknown[]) => getMatchReview(...args),
  };
});
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ loading: false, user: { id: "u1" }, session: null }),
}));
vi.mock("@/lib/backend-auth", () => ({
  ensureBackendAuthToken: vi.fn().mockResolvedValue("token"),
}));

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
      iconHint: { kind: "item", key: "Doran's Blade",
        icon: "assets/items/1055.png" },
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

function review(matchId: string, rounds: ReviewRound[]): MatchReviewView {
  return {
    schemaVersion: "ranked_duel.match_review.v1",
    serverTime: "2026-08-20T12:00:00+00:00",
    matchId,
    finalRoundNumber: rounds.length,
    roundCount: rounds.length,
    rounds,
  };
}

const FIFTEEN = review("m1", Array.from({ length: 15 }, (_, i) => quizRound(i + 1)));

function entry(matchId: string, rounds: number): MatchHistoryEntryView {
  return {
    matchId,
    viewerOutcome: "win",
    terminalReason: "combat",
    completionReason: "rounds_complete",
    finalRoundNumber: rounds,
    completedAt: "2026-08-20 11:00:00",
    isBotMatch: false,
    viewerClass: "mage",
    opponentClass: "marksman",
    viewerRole: "mid",
    opponentRole: null,
    opponentDisplayName: "Sylvara",
    opponentIsBot: false,
    ratingDelta: 22,
    ratingAfter: 1284,
  };
}

const HISTORY: QuizHistoryResponse = {
  ok: true, is_pro: true, total_count: 1, limited: false, free_limit: 10,
  upsell_message: "", entitlement_status: "ok",
  results: [{
    session_id: 1, date: "2026-08-19 08:00:00", completed_at: "2026-08-19 08:00:00",
    mode: "standard", category: "Item Knowledge", score: 8, total_questions: 10,
    accuracy: 80, duration_seconds: 100,
  }],
};

const noop = () => {};
/** Some hub callbacks are contracted to report whether the commit happened. */
const noopOk = () => true;

function renderHub(props: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <LeaguecraftHub
        progress={{} as never}
        ranked={{ tier: "Bronze", rating: 1284 } as never}
        onPlayRanked={noopOk}
        onCommitRole={noopOk}
        onEnterMatch={noopOk}
        onPlayDailyChallenge={noop}
        playModes={[] as never}
        sets={[]}
        setsLoading={false}
        onSelectSet={noop}
        onRefreshSets={noop}
        history={HISTORY}
        historyLoading={false}
        historyError={null}
        {...props}
      />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  getMatchReview.mockReset();
});

// -------------------------------------------------------------- the pager

describe("MALT B1 — the question timeline", () => {
  it("shows at most five icons at a time", () => {
    render(<QuestionTimeline matchId="m1" roundCount={15} review={FIFTEEN} />);
    expect(screen.getAllByTestId("timeline-icon")).toHaveLength(5);
    expect(screen.getByTestId("question-timeline").getAttribute("data-total")).toBe("15");
  });

  it("pages forward and back within the match, five at a time", () => {
    render(<QuestionTimeline matchId="m1" roundCount={15} review={FIFTEEN} />);
    const rounds = () =>
      screen.getAllByTestId("timeline-icon").map((b) => b.getAttribute("data-round"));

    expect(rounds()).toEqual(["1", "2", "3", "4", "5"]);
    fireEvent.click(screen.getByTestId("timeline-next"));
    expect(rounds()).toEqual(["6", "7", "8", "9", "10"]);
    fireEvent.click(screen.getByTestId("timeline-next"));
    expect(rounds()).toEqual(["11", "12", "13", "14", "15"]);
    fireEvent.click(screen.getByTestId("timeline-prev"));
    expect(rounds()).toEqual(["6", "7", "8", "9", "10"]);
  });

  it("disables the arrow that would run off the end", () => {
    render(<QuestionTimeline matchId="m1" roundCount={15} review={FIFTEEN} />);
    expect(screen.getByTestId("timeline-prev")).toBeDisabled();
    expect(screen.getByTestId("timeline-next")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("timeline-next"));
    // The middle page: neither edge, so neither arrow is disabled.
    expect(screen.getByTestId("timeline-prev")).not.toBeDisabled();
    expect(screen.getByTestId("timeline-next")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("timeline-next"));
    expect(screen.getByTestId("timeline-next")).toBeDisabled();
  });

  it("shows no arrows at all when one page holds the match", () => {
    render(
      <QuestionTimeline
        matchId="m1" roundCount={5}
        review={review("m1", [1, 2, 3, 4, 5].map((n) => quizRound(n)))}
      />,
    );
    expect(screen.queryByTestId("timeline-prev")).toBeNull();
    expect(screen.queryByTestId("timeline-next")).toBeNull();
  });

  it("renders its full length from the history row before any review lands", () => {
    // The round COUNT is already a fact on the history entry, so the timeline
    // does not pop into existence when the review arrives — it fills in.
    render(<QuestionTimeline matchId="m1" roundCount={7} review={null} />);
    expect(screen.getByTestId("question-timeline").getAttribute("data-total")).toBe("7");
    for (const icon of screen.getAllByTestId("timeline-icon")) {
      expect(icon.getAttribute("data-loaded")).toBe("false");
      // Nothing to open yet, so nothing to tab to.
      expect(icon).toBeDisabled();
    }
  });
});

// ------------------------------------------------------------ the icons

describe("MALT B1 — what an icon shows", () => {
  it("uses the backend's proven entity art when there is any", () => {
    const view = resolveQuestionIcon({
      kind: "champion", key: "Darius", icon: "assets/champions/Darius/icon.png",
    });
    expect(view.specific).toBe(true);
    expect(view.src).toContain("assets/champions/Darius/icon.png");
    expect(view.label).toBe("Darius");
  });

  it("falls back to the category tile when no entity was frozen", () => {
    const view = resolveQuestionIcon({ kind: "category", key: "Summoner Spells", icon: null });
    expect(view.specific).toBe(false);
    expect(view.src).toContain("assets/summoner_spells/Flash.png");
  });

  it("maps a generator SLUG and a human LABEL of one subject to the same tile", () => {
    // Two providers write categories two ways and both are on rows today.
    const slug = resolveQuestionIcon({ kind: "category", key: "item_costs", icon: null });
    const label = resolveQuestionIcon({ kind: "category", key: "Item Costs", icon: null });
    expect(slug.src).toBe(label.src);
    expect(slug.src).toBeTruthy();
  });

  it("draws nothing rather than guessing when the data proves nothing", () => {
    expect(resolveQuestionIcon({ kind: "generic", key: null, icon: null }).src).toBeUndefined();
    // A category the taxonomy does not classify is normal — the bank grows,
    // and some of what it holds is not quiz content at all. `Patch History` is
    // a seeded category for patch-note material; it has no public subject and
    // no art, and resolving it to a plausible neighbour would be worse than
    // resolving it to nothing.
    expect(
      resolveQuestionIcon({ kind: "category", key: "Patch History", icon: null }).src,
    ).toBeUndefined();
    // `Rune Identity` DOES now resolve — RG2 moved classification to the
    // canonical taxonomy, which knows a rune-identity question is about runes.
    expect(
      resolveQuestionIcon({ kind: "category", key: "Rune Identity", icon: null }).src,
    ).toBeDefined();
  });

  it("never builds a path from a name the backend refused to verify", () => {
    // `{champion, "Darius", null}` means the media resolver could not verify
    // the file. Constructing one here would be exactly the unverified guess it
    // declined to make.
    const view = resolveQuestionIcon({ kind: "champion", key: "Darius", icon: null });
    expect(view.src).toBeUndefined();
    expect(view.label).toBe("Darius");
  });

  it("does NOT repeat one item across a whole match", () => {
    // The regression this pass exists to prevent. Before the resolver weighed
    // semantic ownership, every calculation family resolved to whichever
    // entity the premise happened to list first, and a timeline printed the
    // same picture ten times. The backend now degrades those to a category;
    // this pins that the frontend renders the SAME icon for a repeated
    // category rather than pretending each round is about a different item.
    const hints = [
      { kind: "category" as const, key: "purchase_history_total", icon: null },
      { kind: "category" as const, key: "flat_inventory_stat_total", icon: null },
      { kind: "champion" as const, key: "Malphite", icon: "assets/champions/Malphite/icon.png" },
      { kind: "item" as const, key: "Doran's Shield", icon: "assets/items/1054.png" },
    ];
    const srcs = hints.map((h) => resolveQuestionIcon(h).src);
    // The two economy families share the itemization tile, which is correct —
    // they are the same subject. What matters is that neither claims the item.
    expect(srcs[0]).toBe(srcs[1]);
    expect(srcs[0]).not.toContain("1054");
    expect(srcs[0]).not.toContain("1055");
    // And the genuinely specific ones stay distinct from it and each other.
    expect(new Set([srcs[0], srcs[2], srcs[3]]).size).toBe(3);
  });

  it("a Doran's Shield question still shows Doran's Shield", () => {
    // The rule must not over-correct into "everything is a category".
    const view = resolveQuestionIcon({
      kind: "item", key: "Doran's Shield", icon: "assets/items/1054.png",
    });
    expect(view.specific).toBe(true);
    expect(view.src).toContain("assets/items/1054.png");
    expect(view.label).toBe("Doran's Shield");
  });

  it("Meta Reflex stays distinct from every question kind", () => {
    const meta = resolveQuestionIcon({ kind: "meta_reflex", key: null, icon: null });
    expect(meta.label).toBe("Meta Reflex");
    const others = [
      resolveQuestionIcon({ kind: "category", key: "Item Costs", icon: null }),
      resolveQuestionIcon({ kind: "champion", key: "Malphite", icon: "assets/champions/Malphite/icon.png" }),
      resolveQuestionIcon({ kind: "item", key: "Doran's Shield", icon: "assets/items/1054.png" }),
    ];
    for (const o of others) expect(o.label).not.toBe("Meta Reflex");
    // Its aria label names the block, whatever art it borrows.
    expect(questionIconLabel(
      quizRound(1, {
        kind: "meta_reflex",
        iconHint: { kind: "meta_reflex", key: null, icon: null },
        viewerSubmission: {
          answerIndex: null, isCorrect: null,
          correctCount: 5, answeredCount: 5, challengeCount: 5,
        },
      }), 1, 5,
    )).toBe("Question 1 of 5, Meta Reflex, correct");
  });

  it("tints by outcome, and a Meta Reflex block only on a clean sweep", () => {
    expect(questionOutcome(quizRound(1))).toBe("correct");
    expect(questionOutcome(quizRound(1, {
      viewerSubmission: { answerIndex: 2, isCorrect: false, correctCount: null, answeredCount: null, challengeCount: null },
    }))).toBe("incorrect");
    expect(questionOutcome(quizRound(1, {
      viewerSubmission: { answerIndex: null, isCorrect: null, correctCount: null, answeredCount: null, challengeCount: null },
    }))).toBe("unanswered");

    const block = (correct: number, answered: number) => quizRound(1, {
      kind: "meta_reflex",
      viewerSubmission: { answerIndex: null, isCorrect: null, correctCount: correct, answeredCount: answered, challengeCount: 5 },
    });
    expect(questionOutcome(block(5, 5))).toBe("correct");
    // 3 of 5 is not "correct". Rounding in the reader's favour is the one
    // direction a study record must never round.
    expect(questionOutcome(block(3, 5))).toBe("incorrect");
    expect(questionOutcome(block(0, 0))).toBe("unanswered");
  });

  it("gives a screen reader position, subject and outcome", () => {
    expect(questionIconLabel(quizRound(4), 4, 15))
      .toBe("Question 4 of 15, Doran's Blade, correct");
    expect(questionIconLabel(quizRound(4, {
      revealed: false,
      question: { prompt: "p", options: [], correctOptionIndex: null, explanation: null },
    }), 4, 15)).toContain("not played out");
  });
});

// ---------------------------------------------------------- the popover

describe("MALT B1 — the anchored review popover", () => {
  const REVIEWED = review("m1", [
    quizRound(1, {
      question: {
        prompt: "How much gold has Darius spent?",
        options: ["2400", "2500", "2450", "2300"],
        correctOptionIndex: 0,
        explanation: {
          calculation_steps: ["450 + 50 + 1100 + 800"],
          distractor_derivations: { "2500": "counted the potion twice" },
        },
      },
      viewerSubmission: {
        answerIndex: 1, isCorrect: false,
        correctCount: null, answeredCount: null, challengeCount: null,
      },
    }),
    quizRound(2, { question: { prompt: "Second question", options: ["A", "B", "C", "D"], correctOptionIndex: 2, explanation: null } }),
  ]);

  const open = (round: number) =>
    fireEvent.click(
      screen.getAllByTestId("timeline-icon").find((b) => b.getAttribute("data-round") === String(round))!,
    );

  it("opens from the clicked icon and shows question, answers and why", async () => {
    render(<QuestionTimeline matchId="m1" roundCount={2} review={REVIEWED} />);
    open(1);
    const card = await screen.findByTestId("question-review-card");
    expect(within(card).getByTestId("review-position").textContent).toBe("Q1 of 2");
    expect(card.textContent).toContain("How much gold has Darius spent?");
    // The viewer's own answer, and the right one, both marked in the list…
    const options = within(card).getByTestId("review-options");
    expect(options.querySelector('[data-option-state="chosen"]')!.textContent).toContain("2500");
    expect(options.querySelector('[data-option-state="correct"]')!.textContent).toContain("2400");
    // …and stated in words, so one glance answers "what did I pick, what was
    // right" without decoding two icons.
    expect(within(card).getByTestId("review-your-answer").textContent).toContain("2500");
    expect(within(card).getByTestId("review-correct-answer").textContent).toContain("2400");
    // The derivation for the reader's OWN wrong option, attached to it —
    // never the whole distractor table.
    expect(within(card).getByTestId("review-your-answer").textContent)
      .toContain("counted the potion twice");
  });

  it("shows NO internal metadata — no formula id, no rounding rule, no keys", async () => {
    // The frozen explanation is the candidate pipeline's own review material
    // and some of it is addressed to the pipeline. A study card that printed
    // `formula_id: purchase_history_total.v3` reads as a stack trace.
    const technical = review("m1", [quizRound(1, {
      question: {
        prompt: "How much gold has Darius spent in total?",
        options: ["2400", "2500", "2450", "2300"],
        correctOptionIndex: 0,
        explanation: {
          formula_id: "purchase_history_total.v3",
          rounding_rule: "floor at each sale, never at the end",
          scenario_note: "Totals the full purchase history.",
          calculation_steps: [{ step: "Doran's Blade costs 450 gold", running_total: 450 }],
          distractor_derivations: [{ value: "2500", derivation: "misread one price" }],
        },
      },
    })]);
    render(<QuestionTimeline matchId="m1" roundCount={1} review={technical} />);
    open(1);
    const card = await screen.findByTestId("question-review-card");
    const text = card.textContent ?? "";
    expect(text).not.toContain("purchase_history_total.v3");
    expect(text).not.toMatch(/formula/i);
    expect(text).not.toMatch(/rounding/i);
    expect(text).not.toContain("scenario_note");
    expect(text).not.toContain("calculation_steps");
    expect(text).not.toContain("distractor_derivations");
    expect(text).not.toContain("running_total");
    // What DOES survive is the teaching content.
    expect(within(card).getByTestId("review-explanation").textContent)
      .toContain("Totals the full purchase history.");
    expect(within(card).getByTestId("review-working").textContent)
      .toContain("Doran's Blade costs 450 gold");
  });

  it("prints the SHIPPED explanation shape, not a flattened one", async () => {
    // The candidate schema writes `calculation_steps` as `{step,
    // running_total}` rows and `distractor_derivations` as a LIST of
    // `{value, derivation}` matched on the option's own text. A renderer that
    // only handled strings would print `[object Object]` against real data,
    // and a fixture that used strings would never catch it.
    const real = review("m1", [quizRound(1, {
      question: {
        prompt: "How much gold has Darius spent in total?",
        options: ["2400", "2500", "2450", "2300"],
        correctOptionIndex: 0,
        explanation: {
          calculation_steps: [
            { step: "Doran's Blade costs 450 gold", running_total: 450 },
            { step: "total gold spent", value: 2400 },
          ],
          distractor_derivations: [
            { value: "2500", derivation: "misread one price by 100 gold" },
            { value: "2450", derivation: "counted one extra Health Potion" },
          ],
        },
      },
      viewerSubmission: {
        answerIndex: 1, isCorrect: false,
        correctCount: null, answeredCount: null, challengeCount: null,
      },
    })]);
    render(<QuestionTimeline matchId="m1" roundCount={1} review={real} />);
    open(1);
    const card = await screen.findByTestId("question-review-card");
    const steps = within(card).getByTestId("review-working");
    expect(steps.textContent).toContain("Doran's Blade costs 450 gold");
    expect(steps.textContent).toContain("450");
    expect(steps.textContent).toContain("2400");
    expect(steps.textContent).not.toContain("object Object");
    // The reader chose "2500", so THAT row is the one pulled out — not the
    // whole distractor table.
    const own = within(card).getByTestId("review-your-answer");
    expect(own.textContent).toContain("misread one price by 100 gold");
    expect(own.textContent).not.toContain("counted one extra Health Potion");
  });

  it("is review, not replay — nothing in the card is answerable", async () => {
    render(<QuestionTimeline matchId="m1" roundCount={2} review={REVIEWED} />);
    open(1);
    const card = await screen.findByTestId("question-review-card");
    expect(card.querySelectorAll("button, input, [role='radio'], form")).toHaveLength(0);
  });

  it("swaps to the other question rather than stacking two cards", async () => {
    render(<QuestionTimeline matchId="m1" roundCount={2} review={REVIEWED} />);
    open(1);
    await screen.findByTestId("question-review-card");
    open(2);
    await waitFor(() => {
      const cards = screen.getAllByTestId("question-review-card");
      expect(cards).toHaveLength(1);
      expect(cards[0].textContent).toContain("Second question");
    });
  });

  it("is reachable and operable from the keyboard", async () => {
    render(<QuestionTimeline matchId="m1" roundCount={2} review={REVIEWED} />);
    const icon = screen.getAllByTestId("timeline-icon")[0];
    // A real <button> with no tabindex override: in the tab order by default,
    // and Enter/Space activate it through the browser's own click synthesis.
    // What this pins is that nothing here opted OUT of that — no role="button"
    // on a div, no tabIndex={-1}, and not disabled once there is a review.
    expect(icon.tagName).toBe("BUTTON");
    expect(icon).not.toBeDisabled();
    expect(icon.getAttribute("tabindex")).toBeNull();
    icon.focus();
    expect(document.activeElement).toBe(icon);
    fireEvent.click(document.activeElement!);
    const card = await screen.findByTestId("question-review-card");
    expect(card).toBeTruthy();
  });

  it("returns focus to the icon that opened it", async () => {
    render(<QuestionTimeline matchId="m1" roundCount={2} review={REVIEWED} />);
    const icon = screen.getAllByTestId("timeline-icon")[0];
    icon.focus();
    fireEvent.click(icon);
    await screen.findByTestId("question-review-card");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("question-review-card")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(icon));
  });

  it("closes on Escape", async () => {
    render(<QuestionTimeline matchId="m1" roundCount={2} review={REVIEWED} />);
    open(1);
    await screen.findByTestId("question-review-card");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("question-review-card")).toBeNull());
  });

  it("closes on a click away", async () => {
    render(
      <div>
        <button type="button" data-testid="outside">elsewhere</button>
        <QuestionTimeline matchId="m1" roundCount={2} review={REVIEWED} />
      </div>,
    );
    open(1);
    await screen.findByTestId("question-review-card");
    fireEvent.pointerDown(screen.getByTestId("outside"));
    await waitFor(() => expect(screen.queryByTestId("question-review-card")).toBeNull());
  });

  it("is a WIDE inspector, bounded to the viewport", async () => {
    render(<QuestionTimeline matchId="m1" roundCount={2} review={REVIEWED} />);
    open(1);
    const pop = await screen.findByTestId("question-review-popover");
    // ~460px on a desktop, never wider than the viewport, and height-capped by
    // the space Radix actually measured on the side it chose — capping on a
    // fixed `vh` fraction overflowed the fold near an edge.
    expect(pop.className).toContain("w-[min(29rem,calc(100vw-2rem))]");
    expect(pop.className).toContain("max-h-[min(24rem,var(--radix-popper-available-height))]");
    expect(pop.className).toContain("overflow-y-auto");
  });

  it("keeps a very long question, choices and working inside the same box", async () => {
    const long = review("m1", [quizRound(1, {
      question: {
        prompt: "Ashe has just completed Kraken Slayer and is standing on the mid "
          + "lane wave with a full inventory of Berserker's Greaves, Vampiric "
          + "Sceptre and two Long Swords. Assuming she sells the Vampiric Sceptre "
          + "at the standard 70% sell rate and immediately purchases a Noonquiver "
          + "with the proceeds plus the 640 gold she is already carrying, how much "
          + "gold does she have left over once the purchase completes?",
        options: [
          "70 gold, with Noonquiver in the inventory",
          "630 gold, before the Noonquiver purchase is made",
          "1270 gold, the full amount available before buying",
          "340 gold, having sold the Sceptre at its full purchase price",
        ],
        correctOptionIndex: 0,
        explanation: {
          scenario_note: "Sell value is 70% of the item's TOTAL cost, not of its "
            + "combine cost, and the leftover is what remains after the purchase "
            + "rather than the sale proceeds on their own.",
          calculation_steps: Array.from({ length: 8 }, (_, i) => ({
            step: `Step number ${i + 1} of a deliberately long worked solution`,
            running_total: (i + 1) * 100,
          })),
        },
      },
      viewerSubmission: {
        answerIndex: 2, isCorrect: false,
        correctCount: null, answeredCount: null, challengeCount: null,
      },
    })]);
    render(<QuestionTimeline matchId="m1" roundCount={1} review={long} />);
    open(1);
    const pop = await screen.findByTestId("question-review-popover");
    // Everything still renders; the box, not the content, decides the size.
    expect(pop.textContent).toContain("Noonquiver");
    expect(within(pop).getByTestId("review-working").querySelectorAll("li")).toHaveLength(8);
    expect(pop.className).toContain("max-h-[min(24rem,var(--radix-popper-available-height))]");
    expect(pop.className).toContain("overflow-y-auto");
  });

  it("closes when the reader pages the timeline out from under it", async () => {
    render(<QuestionTimeline matchId="m1" roundCount={15} review={FIFTEEN} />);
    open(1);
    await screen.findByTestId("question-review-card");
    fireEvent.click(screen.getByTestId("timeline-next"));
    await waitFor(() => expect(screen.queryByTestId("question-review-card")).toBeNull());
  });

  it("says a sealed round is sealed rather than showing an empty answer", async () => {
    const forfeited = review("m1", [
      quizRound(1, {
        revealed: false,
        question: {
          prompt: "Which component does Sunfire build from?",
          options: ["Bami's Cinder", "Kindlegem", "Giant's Belt", "Ruby Crystal"],
          correctOptionIndex: null,
          explanation: null,
        },
        viewerSubmission: {
          answerIndex: null, isCorrect: null,
          correctCount: null, answeredCount: null, challengeCount: null,
        },
      }),
    ]);
    render(<QuestionTimeline matchId="m1" roundCount={1} review={forfeited} />);
    open(1);
    const card = await screen.findByTestId("question-review-card");
    expect(within(card).getByTestId("review-unresolved").textContent)
      .toMatch(/never played out/i);
    expect(card.querySelector('[data-option-state="correct"]')).toBeNull();
    expect(screen.queryByTestId("review-correct-answer")).toBeNull();
    expect(within(card).getByTestId("review-your-answer").textContent)
      .toContain("Not answered");
  });

  it("reviews a Meta Reflex block as its cards", async () => {
    const block = review("m1", [quizRound(1, {
      kind: "meta_reflex",
      moduleId: "item_cost_duel",
      category: null,
      question: null,
      iconHint: { kind: "meta_reflex", key: null, icon: null },
      challenges: [{
        challengeIndex: 0,
        prompt: "Which champion has more base armor?",
        kind: "magnitude",
        entityKind: "champion",
        left: { label: "Trundle", icon: "assets/champions/Trundle/icon.png", value: 37 },
        right: { label: "Gwen", icon: "assets/champions/Gwen/icon.png", value: 39 },
        correctSide: "right",
        viewerSide: "left",
        isCorrect: false,
      }],
      viewerSubmission: {
        answerIndex: null, isCorrect: null,
        correctCount: 0, answeredCount: 1, challengeCount: 1,
      },
    })]);
    render(<QuestionTimeline matchId="m1" roundCount={1} review={block} />);
    open(1);
    const card = await screen.findByTestId("question-review-card");
    expect(card.textContent).toContain("Meta Reflex");
    expect(card.textContent).toContain("Which champion has more base armor?");
    const cards = within(card).getByTestId("review-cards");
    expect(cards.querySelector('[data-side-state="correct"]')!.textContent).toContain("Gwen");
    expect(cards.querySelector('[data-side-state="chosen"]')!.textContent).toContain("Trundle");
    // Counts, never a fake answer index.
    expect(card.textContent).toMatch(/0[\s\S]*of[\s\S]*1[\s\S]*cards right/);
  });
});

// ------------------------------------------------- production integration

describe("MALT B1 — the record in production", () => {
  it("reads the account's REAL Ranked rows, one review per match", async () => {
    getMatchReview.mockImplementation((id: string) =>
      Promise.resolve(review(id, [quizRound(1), quizRound(2), quizRound(3)])));
    renderHub({ matchHistory: [entry("m1", 3), entry("m2", 3)] });

    await waitFor(() => {
      expect(screen.getAllByTestId("ranked-match-row")).toHaveLength(2);
    });
    await waitFor(() => {
      expect(getMatchReview).toHaveBeenCalledTimes(2);
    });
    expect(getMatchReview.mock.calls.map((c) => c[0]).sort()).toEqual(["m1", "m2"]);
    await waitFor(() => {
      expect(
        screen.getAllByTestId("timeline-icon").filter((b) => b.getAttribute("data-loaded") === "true"),
      ).toHaveLength(6);
    });
  });

  it("each match pages its OWN timeline", async () => {
    getMatchReview.mockImplementation((id: string) =>
      Promise.resolve(review(id, Array.from({ length: 15 }, (_, i) => quizRound(i + 1)))));
    renderHub({ matchHistory: [entry("m1", 15), entry("m2", 15)] });

    await waitFor(() => expect(getMatchReview).toHaveBeenCalledTimes(2));
    const timelines = () => screen.getAllByTestId("question-timeline");
    await waitFor(() => expect(timelines()[0].getAttribute("data-total")).toBe("15"));

    fireEvent.click(within(timelines()[0]).getByTestId("timeline-next"));
    expect(timelines()[0].getAttribute("data-page")).toBe("1");
    // The other record did not move.
    expect(timelines()[1].getAttribute("data-page")).toBe("0");
  });

  it("keeps the record readable when a review never arrives", async () => {
    getMatchReview.mockRejectedValue(new Error("boom"));
    renderHub({ matchHistory: [entry("m1", 5)] });
    await waitFor(() => expect(getMatchReview).toHaveBeenCalled());
    // The row is still a row, and the timeline still states the true length.
    expect(screen.getAllByTestId("ranked-match-row")).toHaveLength(1);
    expect(screen.getByTestId("question-timeline").getAttribute("data-total")).toBe("5");
  });

  it("asks for nothing when a host supplies frozen reviews", async () => {
    // `/dev/lobby-preview` must never reach the network.
    renderHub({
      rankedHistoryPreview: [entry("m1", 2)],
      rankedReviewPreview: { m1: review("m1", [quizRound(1), quizRound(2)]) },
    });
    await waitFor(() => expect(screen.getAllByTestId("ranked-match-row")).toHaveLength(1));
    expect(getMatchReview).not.toHaveBeenCalled();
    expect(
      screen.getAllByTestId("timeline-icon").every((b) => b.getAttribute("data-loaded") === "true"),
    ).toBe(true);
  });

  it("an account with no Ranked rows asks for nothing and shows nothing", async () => {
    renderHub({ matchHistory: [] });
    await waitFor(() => expect(screen.getByTestId("study-history")).toBeTruthy());
    expect(getMatchReview).not.toHaveBeenCalled();
    expect(screen.queryByTestId("ranked-match-row")).toBeNull();
    expect(screen.queryByTestId("question-timeline")).toBeNull();
    // The study record is untouched by any of this.
    expect(screen.getAllByTestId("study-history-row")).toHaveLength(1);
  });
});
