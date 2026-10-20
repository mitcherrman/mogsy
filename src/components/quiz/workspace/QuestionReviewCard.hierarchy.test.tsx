// ---------------------------------------------------------------------------
// Match History V2 · Track A — the answer hierarchy of the question inspector.
//
// The card states "what I picked" and "what was right" ONCE, as a pair of
// figures under the question, and keeps the frozen options as a quiet strip
// beneath them. These tests pin that hierarchy and the contracts it must not
// move: every frozen option still printed with its state, sealed answers still
// sealed, no answerable control, and art only where the data proves it.
// ---------------------------------------------------------------------------

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ReviewRound } from "@/lib/ranked-public/contracts";
import QuestionReviewCard from "./QuestionReviewCard";

function quiz(over: Partial<ReviewRound> = {}, q: Partial<NonNullable<ReviewRound["question"]>> = {}): ReviewRound {
  return {
    roundNumber: 1,
    kind: "quiz",
    moduleId: "quiz",
    category: "Item Costs",
    canonicalQuestionRef: null,
    revealed: true,
    iconHint: { kind: "generic", key: null, icon: null },
    topic: null,
    question: {
      prompt: "What is Leona's armor at level 3?",
      options: ["50", "57", "62", "70"],
      correctOptionIndex: 0,
      explanation: null,
      ...q,
    },
    challenges: null,
    masteryChallenges: null,
    viewerSubmission: {
      answerIndex: 1, isCorrect: false,
      correctCount: null, answeredCount: null, challengeCount: null,
    },
    ...over,
  };
}

const sub = (over: Partial<ReviewRound["viewerSubmission"]>) => ({
  answerIndex: null, isCorrect: null, correctCount: null, answeredCount: null, challengeCount: null,
  ...over,
});

const card = () => screen.getByTestId("question-review-card");
const states = (root: HTMLElement) =>
  [...root.querySelectorAll("[data-review-option]")].map((li) => li.getAttribute("data-option-state"));

describe("answer pair — a wrong answer", () => {
  it("states yours and the right answer once each, as figures", () => {
    render(<QuestionReviewCard round={quiz()} position={1} total={4} />);
    const mine = screen.getByTestId("review-your-answer");
    const right = screen.getByTestId("review-correct-answer");
    expect(mine).toHaveAttribute("data-answer-state", "wrong");
    expect(mine).toHaveTextContent("57");
    expect(right).toHaveAttribute("data-answer-state", "right");
    expect(right).toHaveTextContent("50");
    // Stated once: the words appear on the two tiles and nowhere else.
    expect(card().textContent!.match(/Your answer/g)).toHaveLength(1);
    expect(card().textContent!.match(/Correct answer/g)).toHaveLength(1);
  });

  it("gives a screen reader the verdict as a word, not only a colour", () => {
    render(<QuestionReviewCard round={quiz()} position={1} total={4} />);
    expect(screen.getByTestId("review-your-answer")).toHaveTextContent("57, incorrect");
  });

  it("keeps every frozen option, in order, with its state", () => {
    render(<QuestionReviewCard round={quiz()} position={1} total={4} />);
    const list = screen.getByTestId("review-options");
    expect([...list.querySelectorAll("li")].map((li) => li.textContent!.replace(/yours/i, "").trim()))
      .toEqual(["50", "57", "62", "70"]);
    expect(states(list)).toEqual(["correct", "chosen", "idle", "idle"]);
    expect(within(list).getByText("yours")).toBeInTheDocument();
  });

  it("lays short figures out as chips, not four stacked rows", () => {
    render(<QuestionReviewCard round={quiz()} position={1} total={4} />);
    expect(screen.getByTestId("review-options")).toHaveAttribute("data-layout", "chips");
  });

  it("attaches the reader's own derivation to their answer tile", () => {
    render(<QuestionReviewCard position={1} total={4} round={quiz({}, {
      explanation: { distractor_derivations: [{ value: "57", derivation: "used level 4 armor" }] },
    })} />);
    expect(screen.getByTestId("review-your-answer")).toHaveTextContent("used level 4 armor");
    expect(screen.getByTestId("review-correct-answer")).not.toHaveTextContent("used level 4 armor");
  });
});

describe("answer pair — a right answer, an unanswered one", () => {
  it("marks both tiles right when the reader was right", () => {
    render(<QuestionReviewCard position={1} total={4} round={quiz({
      viewerSubmission: sub({ answerIndex: 0, isCorrect: true }),
    })} />);
    expect(screen.getByTestId("review-your-answer")).toHaveAttribute("data-answer-state", "right");
    expect(screen.getByTestId("review-correct-answer")).toHaveAttribute("data-answer-state", "right");
    expect(screen.getByTestId("review-outcome")).toHaveTextContent("Correct");
  });

  it("says 'Not answered' neutrally and still shows the right answer", () => {
    render(<QuestionReviewCard position={1} total={4} round={quiz({
      viewerSubmission: sub({}),
    })} />);
    expect(screen.getByTestId("review-your-answer")).toHaveAttribute("data-answer-state", "none");
    expect(screen.getByTestId("review-your-answer")).toHaveTextContent("Not answered");
    expect(screen.getByTestId("review-correct-answer")).toHaveTextContent("50");
    expect(screen.getByTestId("review-outcome")).toHaveTextContent("Unanswered");
  });
});

describe("sealed answers stay sealed", () => {
  const sealed = () => quiz({
    revealed: false,
    question: {
      prompt: "Which component does Sunfire build from?",
      options: ["Bami's Cinder", "Kindlegem", "Giant's Belt", "Ruby Crystal"],
      correctOptionIndex: null,
      explanation: null,
    },
    viewerSubmission: sub({ answerIndex: 1 }),
  });

  it("prints no correct answer and says why", () => {
    render(<QuestionReviewCard round={sealed()} position={1} total={4} />);
    expect(screen.queryByTestId("review-correct-answer")).toBeNull();
    expect(screen.getByTestId("review-unresolved")).toHaveTextContent(/never played out/i);
    expect(screen.getByTestId("review-outcome")).toHaveTextContent("Not played out");
  });

  it("does not grade a pick nobody could judge — neither jade nor red", () => {
    render(<QuestionReviewCard round={sealed()} position={1} total={4} />);
    expect(screen.getByTestId("review-your-answer")).toHaveAttribute("data-answer-state", "pending");
    expect(screen.getByTestId("review-your-answer")).not.toHaveTextContent(/incorrect|, correct/);
    expect(card().querySelector('[data-answer-state="wrong"]')).toBeNull();
    const picked = card().querySelector('[data-option-state="chosen"]')!;
    expect(picked).toHaveTextContent("Kindlegem");
    expect(picked.querySelector("svg.lucide-x")).toBeNull();
    // The options are the question's substance here, and are all still shown.
    expect(card().querySelectorAll("[data-review-option]")).toHaveLength(4);
    expect(card().querySelector('[data-option-state="correct"]')).toBeNull();
  });
});

describe("long text", () => {
  const longOption = "1270 gold, the full amount available before buying anything at all";
  const long = () => quiz({
    viewerSubmission: sub({ answerIndex: 2, isCorrect: false }),
  }, {
    prompt: "Ashe has just completed Kraken Slayer and is standing on the mid lane wave with a "
      + "full inventory. Assuming she sells the Vampiric Sceptre at the standard rate and "
      + "immediately buys a Noonquiver, how much gold does she have left over?",
    options: ["70 gold, with Noonquiver bought", "630 gold, before the purchase", longOption, "340 gold at full price"],
    correctOptionIndex: 0,
  });

  it("falls back to full-width rows and wraps instead of clipping", () => {
    render(<QuestionReviewCard round={long()} position={1} total={4} />);
    expect(screen.getByTestId("review-options")).toHaveAttribute("data-layout", "rows");
    const mine = screen.getByTestId("review-your-answer");
    expect(mine).toHaveTextContent(longOption);
    // Wrapping, not truncation, anywhere a long string can land.
    expect(mine.querySelector(".break-words")).not.toBeNull();
    expect(screen.getByTestId("review-correct-answer").querySelector(".break-words")).not.toBeNull();
    for (const li of card().querySelectorAll("[data-review-option]")) {
      expect(li.querySelector(".break-words")).not.toBeNull();
      expect(li.querySelector(".truncate")).toBeNull();
    }
  });

  it("sizes the answer pair by container width, never by viewport", () => {
    render(<QuestionReviewCard round={long()} position={1} total={4} />);
    const grid = screen.getByTestId("review-your-answer").parentElement!;
    expect(grid.className).toContain("grid-cols-[repeat(auto-fit,minmax(min(9.5rem,100%),1fr))]");
    expect(card().innerHTML).not.toMatch(/\bw-\[\d{3,}px\]|\bmin-w-\[\d{3,}px\]/);
  });
});

describe("working and explanation", () => {
  it("rules off the worked total and keeps every step", () => {
    render(<QuestionReviewCard position={1} total={4} round={quiz({}, {
      explanation: {
        scenario_note: "Totals the full purchase history.",
        calculation_steps: [
          { step: "Doran's Blade costs 450 gold", running_total: 450 },
          { step: "total gold spent", value: 2400 },
        ],
      },
    })} />);
    const rows = [...screen.getByTestId("review-working").querySelectorAll("li")];
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent("total gold spent2400");
    expect(rows[1].style.borderTop).not.toBe("");
    expect(rows[0].style.borderTop).toBe("");
    expect(screen.getByTestId("review-explanation")).toHaveTextContent("Totals the full purchase history.");
  });

  it("never prints pipeline metadata", () => {
    render(<QuestionReviewCard position={1} total={4} round={quiz({}, {
      explanation: { formula_id: "armor.v3", rounding_rule: "floor", scenario_note: "ok" },
    })} />);
    expect(card().textContent).not.toMatch(/armor\.v3|rounding|formula/i);
  });
});

describe("the subject mark uses only proven art", () => {
  it("prints backend-proven entity art as specific", () => {
    render(<QuestionReviewCard position={1} total={4} round={quiz({
      iconHint: { kind: "item", key: "Doran's Blade", icon: "assets/items/1055.png" },
    })} />);
    const mark = screen.getByTestId("review-subject-mark");
    expect(mark).toHaveAttribute("data-specific", "true");
    expect(mark.getAttribute("src")).toContain("assets/items/1055.png");
    expect(mark).toHaveAttribute("aria-hidden", "true");
  });

  it("drops proven art that fails to load, leaving no broken image and no substitute", () => {
    render(<QuestionReviewCard position={1} total={4} round={quiz({
      iconHint: { kind: "ability", key: "Aegis Assault", icon: "art/missing.png" },
    })} />);
    fireEvent.error(screen.getByTestId("review-subject-mark"));
    expect(screen.queryByTestId("review-subject-mark")).toBeNull();
    expect(card().querySelector("img")).toBeNull();
    // The rest of the card is intact.
    expect(screen.getByTestId("review-position")).toHaveTextContent("Q1 of 4");
  });

  it("mutes a category stand-in so it does not claim a subject", () => {
    render(<QuestionReviewCard position={1} total={4} round={quiz({
      iconHint: { kind: "category", key: "Item Costs", icon: null },
    })} />);
    const mark = screen.getByTestId("review-subject-mark");
    expect(mark).toHaveAttribute("data-specific", "false");
    expect(mark.style.opacity).toBe("0.88");
  });

  it("prints no picture at all for a named entity whose art is unproven", () => {
    render(<QuestionReviewCard position={1} total={4} round={quiz({
      iconHint: { kind: "champion", key: "Darius", icon: null },
    })} />);
    expect(screen.queryByTestId("review-subject-mark")).toBeNull();
    expect(card().querySelector("img")).toBeNull();
  });

  it("gives a module its drawn sigil, never borrowed art", () => {
    render(<QuestionReviewCard position={1} total={4} round={quiz({
      kind: "mastery_slice", moduleId: "mastery_slice", question: null,
      masteryChallenges: [], viewerSubmission: sub({ correctCount: 0, answeredCount: 0, challengeCount: 0 }),
    })} />);
    expect(screen.getByTestId("module-sigil")).toHaveAttribute("data-module", "mastery_slice");
    expect(screen.queryByTestId("review-subject-mark")).toBeNull();
  });
});

describe("the inspector stays read-only", () => {
  it("has no button, radio, input or form — the options are a list", () => {
    render(<QuestionReviewCard round={quiz()} position={1} total={4} />);
    expect(card().querySelectorAll("button, input, select, textarea, form, [role='radio'], [role='button']"))
      .toHaveLength(0);
  });
});

describe("Meta Reflex cards are marked by shape as well as tint", () => {
  it("adds a check to the right card and a cross to a wrong pick", () => {
    const reflex = quiz({
      kind: "meta_reflex", moduleId: "item_cost_duel", category: null, question: null,
      iconHint: { kind: "meta_reflex", key: null, icon: null },
      challenges: [{
        challengeIndex: 0, prompt: "Which champion has more base armor?", kind: "magnitude", entityKind: "champion",
        left: { label: "Trundle", icon: null, value: 37 }, right: { label: "Gwen", icon: null, value: 39 },
        correctSide: "right", viewerSide: "left", isCorrect: false,
      }],
      viewerSubmission: sub({ correctCount: 0, answeredCount: 1, challengeCount: 1 }),
    });
    render(<QuestionReviewCard round={reflex} position={1} total={4} />);
    const right = card().querySelector('[data-side-state="correct"]')!;
    const left = card().querySelector('[data-side-state="chosen"]')!;
    expect(right.querySelector("svg.lucide-check")).not.toBeNull();
    expect(left.querySelector("svg.lucide-x")).not.toBeNull();
    expect(screen.getByTestId("review-outcome")).toHaveTextContent("Incorrect");
  });
});

// ------------------------------------------------------- mastery & combat

type Challenge = NonNullable<ReviewRound["masteryChallenges"]>[number];

function challenge(index: number, over: Partial<Challenge> = {}): Challenge {
  return {
    challengeIndex: index,
    prompt: `Question #${index}`,
    interactionKind: "legacy_combat",
    questionFamily: "post_mitigation_single_type_damage",
    answerType: "single_choice",
    answerOptions: ["115", "134", "144", "199"],
    promptSemantics: null,
    comparisonSemantics: null,
    correctAnswer: "144",
    explanation: `Because of #${index}.`,
    viewerAnswer: "144",
    isCorrect: true,
    ...over,
  };
}

function slice(challenges: Challenge[], over: Partial<ReviewRound> = {}): ReviewRound {
  const right = challenges.filter((c) => c.isCorrect).length;
  return quiz({
    kind: "mastery_slice", moduleId: "mastery_slice", question: null,
    masteryChallenges: challenges,
    viewerSubmission: sub({ correctCount: right, answeredCount: challenges.length, challengeCount: challenges.length }),
    ...over,
  });
}

describe("mastery slice — one answer pair per challenge", () => {
  const mixed = () => slice([
    challenge(0),
    challenge(1, { correctAnswer: "168", viewerAnswer: "149", isCorrect: false, answerOptions: ["115", "149", "168", "221"] }),
  ]);

  it("grades each challenge's own tiles", () => {
    render(<QuestionReviewCard round={mixed()} position={3} total={6} />);
    expect(screen.getByTestId("review-mastery-your-answer-0")).toHaveAttribute("data-answer-state", "right");
    fireEvent.click(screen.getByTestId("review-mastery-select-2"));
    expect(screen.getByTestId("review-mastery-your-answer-1")).toHaveAttribute("data-answer-state", "wrong");
    expect(screen.getByTestId("review-mastery-correct-answer-1")).toHaveTextContent("168");
  });

  it("numbers several challenges with the selector; a lone one needs no selector", () => {
    const { unmount } = render(<QuestionReviewCard round={mixed()} position={3} total={6} />);
    expect(screen.getByTestId("review-mastery-position")).toHaveTextContent("Question 1 of 2");
    expect(screen.getByTestId("review-mastery-select-1")).toHaveAttribute("data-status", "correct");
    expect(screen.getByTestId("review-mastery-select-2")).toHaveAttribute("data-status", "incorrect");
    unmount();
    render(<QuestionReviewCard round={slice([challenge(0)])} position={3} total={6} />);
    expect(screen.queryByTestId("review-mastery-nav")).toBeNull();
    expect(screen.queryByTestId("review-pips")).toBeNull();
  });

  it("calls a part-right slice Partial, and a clean sweep Correct", () => {
    const { unmount } = render(<QuestionReviewCard round={mixed()} position={3} total={6} />);
    expect(screen.getByTestId("review-outcome")).toHaveTextContent("Partial");
    // The timeline's tint is unchanged: anything short of a sweep is incorrect.
    expect(card()).toHaveAttribute("data-outcome", "incorrect");
    unmount();
    render(<QuestionReviewCard round={slice([challenge(0), challenge(1)])} position={3} total={6} />);
    expect(screen.getByTestId("review-outcome")).toHaveTextContent("Correct");
  });

  it("keeps a never-played challenge sealed and its pick unjudged", () => {
    render(<QuestionReviewCard position={3} total={6} round={slice([
      challenge(0, { correctAnswer: null, explanation: null, viewerAnswer: "134", isCorrect: null }),
    ], { revealed: false })} />);
    expect(screen.getByTestId("review-mastery-unresolved-0")).toBeInTheDocument();
    expect(screen.queryByTestId("review-mastery-correct-answer-0")).toBeNull();
    expect(screen.getByTestId("review-mastery-your-answer-0")).toHaveAttribute("data-answer-state", "pending");
    expect(screen.getByTestId("review-outcome")).toHaveTextContent("Not played out");
    expect(card().querySelectorAll("[data-review-option]")).toHaveLength(4);
  });
});

describe("mastery slice — Journey Combat working leads, prose folds away", () => {
  async function combat() {
    const { readCombatWorking } = await import("@/lib/journey/combatWorking");
    const { PANTHEON_E_WORKING_RECALLED } = await import("@/lib/journey/__fixtures__/j5/finalWindow");
    return readCombatWorking(structuredClone(PANTHEON_E_WORKING_RECALLED))!;
  }
  const dense = "Pantheon Aegis Assault (rank 1) ability physical damage after armor at Leona target, "
    + "4 target level, Cloth Armor target items, 68.872 target armor: 89.698 damage.";

  it("lays the served working out in the Journey's own rows form", async () => {
    const working = await combat();
    render(<QuestionReviewCard position={3} total={6} round={slice([
      challenge(0, { correctAnswer: "83", viewerAnswer: "83", combatWorking: working, explanation: dense }),
    ])} />);
    const block = screen.getByTestId("review-mastery-working-0");
    expect(within(block).getByTestId("journey-combat-working")).toHaveAttribute("data-layout", "rows");
    // Served digits only — nothing recomputed.
    expect(block).toHaveTextContent("Leona armor 50.08 (recalled from step 1)");
    expect(block).toHaveTextContent("Answer 83");
  });

  it("keeps the dense frozen sentence, behind a native disclosure, closed", async () => {
    const working = await combat();
    render(<QuestionReviewCard position={3} total={6} round={slice([
      challenge(0, { correctAnswer: "83", viewerAnswer: "83", combatWorking: working, explanation: dense }),
    ])} />);
    const expl = screen.getByTestId("review-mastery-explanation-0");
    const details = expl.querySelector("details")!;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")).toHaveTextContent("Full explanation");
    // Still the frozen record, character for character.
    expect(expl).toHaveTextContent(dense);
    // A disclosure is not an answer control.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("leaves the explanation of a row WITHOUT working open and labelled, as before", () => {
    render(<QuestionReviewCard position={3} total={6} round={slice([challenge(0)])} />);
    const expl = screen.getByTestId("review-mastery-explanation-0");
    expect(expl.querySelector("details")).toBeNull();
    expect(expl).toHaveTextContent("Explanation");
    expect(expl).toHaveTextContent("Because of #0.");
  });

  it("does not show working or explanation prose-folding on a sealed round", async () => {
    const working = await combat();
    render(<QuestionReviewCard position={3} total={6} round={slice([
      challenge(0, { combatWorking: working, correctAnswer: null, explanation: null, viewerAnswer: null, isCorrect: null }),
    ], { revealed: false })} />);
    expect(screen.queryByTestId("review-mastery-working-0")).toBeNull();
    expect(screen.queryByTestId("journey-combat-working")).toBeNull();
  });
});

// ------------------------------------------- semantic combat question / margin

describe("mastery slice — a Journey Combat question is phrased from its served premise", () => {
  // The REAL captured child (pantheon.standard › child4-live, index 2): the
  // backend's serialized prompt and its structured prompt_semantics.
  async function pantheon() {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const all = JSON.parse(readFileSync(
      join(process.cwd(), "src/lib/journey/__fixtures__/j4/pantheon.standard.json"), "utf8")) as
      { label: string; envelope: { payload: { segment_state: { challenges: { challenges: Record<string, unknown>[] } } } } }[];
    const c = all.find((x) => x.label === "child4-live")!
      .envelope.payload.segment_state.challenges.challenges[2];
    return { prompt: c.prompt as string, semantics: c.prompt_semantics as Record<string, unknown> };
  }

  it("shows the semantic sentence, not the serialized state", async () => {
    const { prompt, semantics } = await pantheon();
    render(<QuestionReviewCard position={3} total={6} round={slice([
      challenge(0, { prompt, promptSemantics: semantics, answerOptions: ["53", "83", "63", "73"],
        correctAnswer: "83", viewerAnswer: "83" }),
    ])} />);
    const item = card().querySelector("[data-review-mastery-challenge='0']")!;
    const shown = item.querySelector("p")!;
    expect(shown).toHaveTextContent("How much physical damage does Pantheon's Rank 1 Aegis Assault deal to Leona?");
    expect(shown.textContent).not.toMatch(/@ Leona target|target items|armor penetration percent/);
  });

  it("keeps the recorded serialized prompt verbatim, folded and closed", async () => {
    const { prompt, semantics } = await pantheon();
    render(<QuestionReviewCard position={3} total={6} round={slice([
      challenge(0, { prompt, promptSemantics: semantics }),
    ])} />);
    const fold = screen.getByTestId("review-mastery-recorded-0") as HTMLDetailsElement;
    expect(fold.open).toBe(false);
    expect(fold.querySelector("summary")).toHaveTextContent("Recorded question");
    expect(fold.textContent).toContain(prompt);
  });

  it("an old record WITHOUT working still reads: semantic question, prose stays visible", async () => {
    const { prompt, semantics } = await pantheon();
    render(<QuestionReviewCard position={3} total={6} round={slice([
      challenge(0, { prompt, promptSemantics: semantics, explanation: "Frozen prose with 89.698 damage." }),
    ])} />);
    const expl = screen.getByTestId("review-mastery-explanation-0");
    expect(expl.querySelector("details")).toBeNull();
    expect(expl).toHaveTextContent("Explanation");
    expect(expl).toHaveTextContent("Frozen prose with 89.698 damage.");
  });

  it("phrases the raw (before-armor) template as before armor", async () => {
    const { prompt, semantics } = await pantheon();
    render(<QuestionReviewCard position={3} total={6} round={slice([
      challenge(0, { prompt, promptSemantics: { ...semantics, template: "ability_raw_damage_under_state" } }),
    ])} />);
    expect(card()).toHaveTextContent("deal before armor?");
  });

  it("falls back to the recorded prompt for other families and thin premises", async () => {
    const { prompt, semantics } = await pantheon();
    const cases: Record<string, unknown>[] = [
      { ...semantics, template: "atomic_recall_stat" },        // not Combat
      { ...semantics, champion_display: "" },                  // cannot name the attacker
      { ...semantics, ability_name: "", subject_ref: "" },     // cannot name the ability
      { ...semantics, scenario: [["target"]] },                // malformed pairs
    ];
    for (const promptSemantics of cases) {
      const { unmount } = render(<QuestionReviewCard position={3} total={6} round={slice([
        challenge(0, { prompt, promptSemantics }),
      ])} />);
      const item = card().querySelector("[data-review-mastery-challenge='0']")!;
      expect(item.querySelector("p")).toHaveTextContent(prompt);
      expect(screen.queryByTestId("review-mastery-recorded-0")).toBeNull();
      unmount();
    }
  });

  it("serves the sentence on a sealed round too — the question is not the answer", async () => {
    const { prompt, semantics } = await pantheon();
    render(<QuestionReviewCard position={3} total={6} round={slice([
      challenge(0, { prompt, promptSemantics: semantics, correctAnswer: null, explanation: null,
        viewerAnswer: null, isCorrect: null }),
    ], { revealed: false })} />);
    expect(card()).toHaveTextContent("deal to Leona?");
    expect(screen.getByTestId("review-mastery-unresolved-0")).toBeInTheDocument();
  });
});

describe("mastery slice — comparison values are the backend's, verbatim", () => {
  const values = async () => {
    const { readComparisonValues } = await import("@/features/mastery/contracts/comparisonValues");
    return readComparisonValues({
      contract: "comparison_values.v1",
      sides: [{ token: "Leona", value: 90, display: "90" }, { token: "Pantheon", value: 180, display: "180" }],
      unit: "seconds", unit_label: "seconds", operator: "greater", delta: 90, delta_display: "90",
    })!;
  };

  it("prints both served values and the served margin, computing nothing", async () => {
    const cv = await values();
    render(<QuestionReviewCard position={3} total={6} round={slice([
      challenge(0, { comparisonValues: cv, answerOptions: ["Leona", "Pantheon"], correctAnswer: "Pantheon", viewerAnswer: "Pantheon" }),
    ])} />);
    expect(screen.getByTestId("review-mastery-values-0")).toHaveTextContent("Leona 90 seconds · Pantheon 180 seconds");
    expect(screen.getByTestId("review-mastery-margin-0")).toHaveTextContent("Margin 90 seconds");
  });

  it("prints no margin when the block carries none, and no values on a sealed round", async () => {
    const cv = { ...(await values()), delta: null, deltaDisplay: null };
    const { unmount } = render(<QuestionReviewCard position={3} total={6} round={slice([
      challenge(0, { comparisonValues: cv }),
    ])} />);
    expect(screen.getByTestId("review-mastery-values-0")).toBeInTheDocument();
    expect(screen.queryByTestId("review-mastery-margin-0")).toBeNull();
    unmount();
    render(<QuestionReviewCard position={3} total={6} round={slice([
      challenge(0, { comparisonValues: await values(), correctAnswer: null, explanation: null, viewerAnswer: null, isCorrect: null }),
    ], { revealed: false })} />);
    expect(screen.queryByTestId("review-mastery-values-0")).toBeNull();
    expect(screen.queryByTestId("review-mastery-margin-0")).toBeNull();
  });
});
