/**
 * Match History V2 (Track D) — deterministic, LEGITIMATE review fixtures.
 *
 * Every value is shaped like the frozen `ReviewRound` the backend serves and the
 * reader in `src/lib/ranked-public/contracts.ts` accepts: nothing here is
 * computed, inferred from prose or invented structure. This file has no runtime
 * imports from `src/` (types only), so the spec can import it directly and prove,
 * before a browser is involved, that a sealed fixture carries no answer at all.
 */
import type { ReviewRound } from "@/lib/ranked-public/contracts";

const GENERIC_HINT = { kind: "generic", key: null, icon: null } as const;
const NO_SUBMISSION = {
  answerIndex: null, isCorrect: null, correctCount: null, answeredCount: null, challengeCount: null,
};
const base = (over: Partial<ReviewRound>): ReviewRound => ({
  roundNumber: 3, kind: "quiz", moduleId: "quiz", category: "items",
  canonicalQuestionRef: null, revealed: true, iconHint: GENERIC_HINT,
  topic: null, question: null, challenges: null, masteryChallenges: null,
  viewerSubmission: NO_SUBMISSION,
  ...over,
});

export const LONG_PROMPT = "A deliberately long frozen prompt that keeps going so the review card has to wrap "
  + "it on a 320px phone and inside a 24rem popover without spilling sideways, covering "
  + "Pantheon's Rank 1 Aegis Assault against a fully-itemised, level 13 Leona who has bought "
  + "Frozen Heart and Thornmail while the attacker holds Black Cleaver, Serylda's Grudge and Lord Dominik's Regards?";
export const UNBROKEN = "Supercalifragilisticexpialidocious_ThisOptionHasNoBreakOpportunities_0123456789ABCDEFGHIJKLMNOP";

type Mc = NonNullable<ReviewRound["masteryChallenges"]>[number];
const mc = (index: number, over: Partial<Mc> = {}): Mc => ({
  challengeIndex: index,
  prompt: `Generated question #${index + 1}: how much armor does Leona have at level 3?`,
  interactionKind: "legacy_combat",
  questionFamily: "post_mitigation_single_type_damage",
  answerType: "single_choice",
  answerOptions: ["44", "50", "57", "63"],
  promptSemantics: null, comparisonSemantics: null,
  correctAnswer: "50", explanation: `Frozen worked explanation for #${index + 1}.`,
  viewerAnswer: "50", isCorrect: true,
  ...over,
});

const quizExplanation = {
  scenario_note: "Armor is rounded once, at the end, after the level-3 growth is applied to the base value.",
  calculation_steps: [
    { step: "Base armor", value: 32 },
    { step: "Growth per level x 2", value: 7.2 },
    { step: "Rounded", running_total: 50 },
  ],
  distractor_derivations: [{ value: "57", derivation: "Adds the level-4 growth by mistake." }],
};

export interface Fixture {
  label: string;
  total: number;
  /** A round whose answers the backend withheld: nothing revealed may be present. */
  sealed?: boolean;
  /**
   * Journey Combat row. The harness swaps in the backend's REAL captured child
   * (prompt + prompt_semantics, pantheon.standard.json child4-live) so the
   * card's semantic sentence is exercised; "working" also attaches the real
   * combat_working.v1 example, "semantic-only" is an old record without it.
   */
  combat?: "working" | "semantic-only";
  round: ReviewRound;
}

export const FIXTURES: Record<string, Fixture> = {
  "quiz-correct": {
    label: "Quiz, correct", total: 6,
    round: base({
      iconHint: { kind: "item", key: "Infinity Edge", icon: "art/ok.png" },
      question: { prompt: "What does Infinity Edge grant?", options: ["Crit damage", "Lifesteal", "Armor", "Mana"], correctOptionIndex: 0, explanation: quizExplanation },
      viewerSubmission: { ...NO_SUBMISSION, answerIndex: 0, isCorrect: true },
    }),
  },
  "quiz-incorrect": {
    label: "Quiz, incorrect", total: 6,
    round: base({
      iconHint: { kind: "champion", key: "Leona", icon: "art/ok.png" },
      question: { prompt: "What is Leona's armor at level 3?", options: ["44", "50", "57", "63"], correctOptionIndex: 1, explanation: quizExplanation },
      viewerSubmission: { ...NO_SUBMISSION, answerIndex: 2, isCorrect: false },
    }),
  },
  "quiz-unanswered": {
    label: "Quiz, unanswered (timed out, revealed)", total: 6,
    round: base({
      question: { prompt: "What is Leona's armor at level 3?", options: ["44", "50", "57", "63"], correctOptionIndex: 1, explanation: quizExplanation },
    }),
  },
  "quiz-sealed": {
    label: "Quiz, sealed (never played out)", total: 6, sealed: true,
    round: base({
      revealed: false,
      question: { prompt: "What is Leona's armor at level 3?", options: ["44", "50", "57", "63"], correctOptionIndex: null, explanation: null },
    }),
  },
  "quiz-long": {
    label: "Quiz, long text", total: 12,
    round: base({
      iconHint: { kind: "item", key: "Black Cleaver", icon: "art/ok.png" },
      question: {
        prompt: LONG_PROMPT,
        options: [LONG_PROMPT.slice(0, 120), UNBROKEN, "A medium option that wraps onto two lines on a narrow phone screen", "7"],
        correctOptionIndex: 1,
        explanation: {
          scenario_note: `${LONG_PROMPT} ${LONG_PROMPT}`,
          calculation_steps: Array.from({ length: 8 }, (_, i) => ({
            step: `Step ${i + 1}: ${LONG_PROMPT.slice(0, 90)}`, value: `${100 + i}.${i}${i}${i}${i}`,
          })),
        },
      },
      viewerSubmission: { ...NO_SUBMISSION, answerIndex: 0, isCorrect: false },
    }),
  },
  "quiz-missing-art": {
    label: "Quiz, art that fails to load", total: 6,
    round: base({
      iconHint: { kind: "ability", key: "Aegis Assault", icon: "art/missing.png" },
      question: { prompt: "Which ability is this?", options: ["Q", "W", "E", "R"], correctOptionIndex: 2, explanation: null },
      viewerSubmission: { ...NO_SUBMISSION, answerIndex: 2, isCorrect: true },
    }),
  },
  "mastery-mixed": {
    label: "Mastery, mixed (correct / incorrect / unanswered / long)", total: 6,
    round: base({
      kind: "mastery_slice", moduleId: "mastery_slice", category: null,
      masteryChallenges: [
        mc(0),
        mc(1, { viewerAnswer: "57", isCorrect: false, correctAnswer: "50" }),
        mc(2, { viewerAnswer: null, isCorrect: null }),
        mc(3, {
          prompt: LONG_PROMPT, answerOptions: [UNBROKEN, "50", "57", "63"], correctAnswer: "50",
          viewerAnswer: UNBROKEN, isCorrect: false, explanation: LONG_PROMPT,
        }),
      ],
      viewerSubmission: { ...NO_SUBMISSION, correctCount: 1, answeredCount: 3, challengeCount: 4 },
    }),
  },
  "mastery-sealed": {
    label: "Mastery, sealed", total: 6, sealed: true,
    round: base({
      kind: "mastery_slice", moduleId: "mastery_slice", category: null, revealed: false,
      masteryChallenges: [0, 1].map((i) => mc(i, { correctAnswer: null, explanation: null, viewerAnswer: null, isCorrect: null })),
      viewerSubmission: { ...NO_SUBMISSION, challengeCount: 2 },
    }),
  },
  "mastery-combat": {
    label: "Mastery, Combat with structured working", total: 6, combat: "working",
    round: base({
      kind: "mastery_slice", moduleId: "mastery_slice", category: null,
      masteryChallenges: [mc(0, {
        prompt: "How much physical damage does Pantheon's Rank 1 Aegis Assault deal to Leona?",
        answerOptions: ["72", "83", "91", "123"], correctAnswer: "83", viewerAnswer: "91", isCorrect: false,
        explanation: "Raw damage is reduced by Leona's effective armor.",
      })],
      viewerSubmission: { ...NO_SUBMISSION, correctCount: 0, answeredCount: 1, challengeCount: 1 },
    }),
  },
};

FIXTURES["mastery-combat-legacy"] = {
  label: "Mastery, Combat record without structured working", total: 6, combat: "semantic-only",
  round: {
    ...FIXTURES["mastery-combat"].round,
    masteryChallenges: [mc(0, {
      prompt: "placeholder, replaced by the harness",
      answerOptions: ["72", "83", "91", "123"], correctAnswer: "83", viewerAnswer: "83", isCorrect: true,
      explanation: "Frozen prose: 123.8675 raw, 50.08 armor, 0.6663 multiplier, 82.5343 rounds to 83.",
    })],
    viewerSubmission: { ...NO_SUBMISSION, correctCount: 1, answeredCount: 1, challengeCount: 1 },
  },
};

export const STATE_IDS = Object.keys(FIXTURES);
