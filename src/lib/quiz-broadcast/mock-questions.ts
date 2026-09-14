import type { QuizQuestion } from "@/lib/quiz/api";

/**
 * Offline fixture for the admin Broadcast Studio, used only when the live quiz
 * API returns nothing. It is DELIBERATELY NOT LEAGUE CONTENT.
 *
 * What was here before, and why it went
 * -------------------------------------
 * Five hand-written League questions: Ahri's Q cooldown, Rabadon's AP, Flash's
 * cooldown, an Infinity Edge / Bloodthirster component, and Sheen's recipe —
 * each with a `correct_answer` literal and a `patch: "14.20"` stamp. That made
 * this file an independent League authority sitting in frontend source, with
 * no canonical owner behind it and nothing reconciling it against the backend.
 * It had already drifted: Rabadon's Deathcap answer read 140 AP with a 35%
 * multiplier, neither of which was current, and the patch stamp was many
 * patches stale. Nobody would have noticed, because a fallback is by
 * definition the path nobody looks at.
 *
 * League facts belong to the backend's canonical authorities and reach this
 * app through `/api/quiz/questions`. When that is unreachable, the honest
 * thing for the Studio to render is a fixture that PROVES IT IS A FIXTURE —
 * so an operator who sees "Fixture Alpha" on a broadcast preview knows
 * immediately that the API is down, rather than reading a plausible-looking
 * League answer and trusting it.
 *
 * Rules for this file, enforced by `mock-questions.test.ts`:
 *   - no champion, item, rune or summoner-spell name;
 *   - no patch version stamp;
 *   - every answer is about the fixture itself, not about League.
 */
export const MOCK_BROADCAST_QUESTIONS: QuizQuestion[] = [
  {
    id: "fixture-1",
    category: "broadcast_fixture",
    question_text: "Fixture question 1 — which label is the correct answer?",
    format: "multiple_choice",
    choices: ["Fixture Alpha", "Fixture Bravo", "Fixture Charlie", "Fixture Delta"],
    difficulty: 1,
    metadata: {
      correct_answer: "Fixture Alpha",
      explanation: "Offline fixture. The live quiz API is unreachable, so the Studio is rendering placeholder content.",
      fixture: true,
    },
  },
  {
    id: "fixture-2",
    category: "broadcast_fixture",
    question_text: "Fixture question 2 — which label is the correct answer?",
    format: "multiple_choice",
    choices: ["Fixture Alpha", "Fixture Bravo", "Fixture Charlie", "Fixture Delta"],
    difficulty: 2,
    metadata: {
      correct_answer: "Fixture Bravo",
      explanation: "Offline fixture. Answer positions vary across the set so the reveal animation can be checked.",
      fixture: true,
    },
  },
  {
    id: "fixture-3",
    category: "broadcast_fixture",
    question_text: "Fixture question 3 — which label is the correct answer?",
    format: "multiple_choice",
    choices: ["Fixture Alpha", "Fixture Bravo", "Fixture Charlie", "Fixture Delta"],
    difficulty: 3,
    metadata: {
      correct_answer: "Fixture Charlie",
      explanation: "Offline fixture. Difficulty varies across the set so difficulty-dependent styling can be checked.",
      fixture: true,
    },
  },
  {
    id: "fixture-4",
    category: "broadcast_fixture",
    question_text: "Fixture question 4 — a deliberately long prompt, so the Studio can be checked for text overflow, wrapping and vertical rhythm at the largest prompt length the renderer is expected to survive without clipping.",
    format: "multiple_choice",
    choices: ["Fixture Alpha", "Fixture Bravo", "Fixture Charlie", "Fixture Delta"],
    difficulty: 2,
    metadata: {
      correct_answer: "Fixture Delta",
      explanation: "Offline fixture. This one exists to exercise long-prompt layout.",
      fixture: true,
    },
  },
  {
    id: "fixture-5",
    category: "broadcast_fixture",
    question_text: "Fixture question 5 — which label is the correct answer?",
    format: "multiple_choice",
    choices: ["Fixture Alpha", "Fixture Bravo", "Fixture Charlie", "Fixture Delta"],
    difficulty: 1,
    metadata: {
      correct_answer: "Fixture Alpha",
      explanation: "Offline fixture. The set cycles so a full playlist run can be exercised without the API.",
      fixture: true,
    },
  },
];
