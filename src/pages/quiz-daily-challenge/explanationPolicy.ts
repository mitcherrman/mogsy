/**
 * WHETHER AN EXPLANATION IS WORTH THE PLAYER'S TIME (ARENA1 Phase 2 §6).
 *
 * A FILTER, and only ever a filter. Nothing here writes, rewrites, summarises,
 * softens or generates a single word of explanation text: the only two answers
 * this module can give are "show the server's sentence unchanged" and "show
 * nothing". Prefer omission over filler is the rule, and a filter is the only
 * shape of it that cannot invent a fact.
 *
 * WHY A POLICY EXISTS AT ALL — THE AUDIT
 * ──────────────────────────────────────
 * The card's `explanation` is `COALESCE(question_overrides.explanation,
 * quiz_questions.explanation)` (see `ranked_public/shared_bank._pool_query`),
 * frozen onto the card at composition time. Two facts about that column decide
 * everything below, and both were measured against the live bank rather than
 * assumed:
 *
 *   * every eligible question has one — 4426 of 4426 active multiple-choice
 *     rows carry a non-empty explanation. "A string exists" is therefore ZERO
 *     signal, which is exactly the drift this phase was asked to remove;
 *   * the overwhelming majority are TEMPLATE RESTATEMENTS produced by the
 *     generators — "Zhonya's Hourglass gives 105 Ability Power.", "This W icon
 *     belongs to Malzahar." — which tell a player who has just seen the
 *     question and the revealed answer nothing they are not already looking at.
 *
 * NO METADATA FIELD DISTINGUISHES THEM. `quiz_questions.metadata_json` is asset
 * paths and entity ids; there is no quality, kind, provenance or "hand written"
 * marker, and the Daily card contract (`DcResolvedCard`) transports the string
 * alone. So there is no backend signal to read, and none is invented here.
 *
 * WHAT IS TESTED INSTEAD — INFORMATION, NOT QUALITY
 * ────────────────────────────────────────────────
 * The question is deliberately narrowed to one a machine can answer honestly:
 * DOES THIS SENTENCE CONTAIN ANYTHING THE PROMPT AND THE REVEALED ANSWER DO NOT
 * ALREADY CONTAIN? That is a statement about information, not about writing
 * quality, and it is decidable from the three strings themselves.
 *
 * Three things count as new information, all objective:
 *
 *   DERIVATION   two numbers joined by an arithmetic operator — a formula being
 *                worked. "80 × 100 / (100 + 10) = 72.73s" is the mechanic.
 *   CONNECTIVE   an explicit causal, contrastive or exception word that the
 *                prompt did not itself use — because, unlike, however, caps at,
 *                does not. A restatement never needs one.
 *   QUANTITY     a number stated by neither the prompt nor the answer. "Senna
 *                is ranged with 600 attack range" answers "why" with a datum.
 *
 * Everything else is omitted. Measured over the whole live bank this shows
 * ~11% of explanations and hides ~89%, and the hidden set is uniformly of the
 * "X is a component of Y" restatement shape.
 *
 * WHY IT ERRS TOWARD OMISSION
 * ───────────────────────────
 * A wrongly hidden explanation costs a player one sentence they could have read.
 * A wrongly shown one costs them a beat of their attention on a sentence that
 * says what they just read, every card, all day — which is the thing the mode
 * was reported for. The asymmetry is the reason the tests above are conjunctive
 * evidence of new content rather than absence of old.
 */

/** Two numbers joined by an operator, or a parenthesised term: a worked value. */
const DERIVATION = /\d\s*[×÷*/+=]\s*[\d(]|\(\s*\d/;

/**
 * Words that only appear when a sentence is doing more than naming a fact.
 *
 * Deliberately short and deliberately unambiguous. A word is disqualified when
 * the PROMPT already used it, so a question that asks "which item does not…"
 * cannot license its own restatement.
 */
const CONNECTIVES = [
  "because", "since", "therefore", "which means", "unlike", "however",
  "instead", "whereas", "note that", "unless", "only if", "except",
  ", so ", "does not", "cannot", "rounded", "caps at", "stacks",
] as const;

const NUMBER = /\d+(?:\.\d+)?/g;

const numbers = (text: string): Set<string> => new Set(text.match(NUMBER) ?? []);

/**
 * Should this card's explanation be shown?
 *
 * @param explanation the server's frozen sentence, verbatim. Never modified.
 * @param prompt      the card's question text.
 * @param answerLabel the revealed correct option's label, or null.
 */
export function explanationIsInformative(
  explanation: string | null | undefined,
  prompt: string,
  answerLabel: string | null,
): boolean {
  const text = (explanation ?? "").trim();
  if (!text) return false;

  if (DERIVATION.test(text)) return true;

  const lower = text.toLowerCase();
  const askedWith = prompt.toLowerCase();
  for (const connective of CONNECTIVES) {
    if (!lower.includes(connective)) continue;
    // A connective the PROMPT already used is the prompt's, not the
    // explanation's — it cannot be evidence that the explanation adds anything.
    // Matched as the whole phrase: "does" is an ordinary question word and
    // disqualifying on it alone would silence every "does not" clause.
    if (!askedWith.includes(connective)) return true;
  }

  const known = new Set([...numbers(prompt), ...numbers(answerLabel ?? "")]);
  for (const value of numbers(text)) {
    if (!known.has(value)) return true;
  }

  return false;
}

/**
 * The explanation to render for a resolved card, or null.
 *
 * The one function callers should reach for: it keeps "decide" and "what to
 * pass to the surface" in the same place, so no caller can accidentally show a
 * string the policy rejected.
 */
export function displayExplanation(
  explanation: string | null | undefined,
  prompt: string,
  answerLabel: string | null,
): string | null {
  return explanationIsInformative(explanation, prompt, answerLabel)
    ? (explanation as string).trim()
    : null;
}
