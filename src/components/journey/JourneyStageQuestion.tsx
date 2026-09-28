/**
 * JP2 — THE JOURNEY STAGE'S QUESTION: every Journey child, one grammar.
 *
 *   "Every Journey child uses the same fixed stage. The state changes; the
 *    layout does not."
 *
 * Before JP2 a Journey child was drawn by whichever renderer its interaction
 * kind had outside a Journey — the arena's prose surface with a "Lock in"
 * button, a Mastery radio list with "Submit answer", a Combat premise panel
 * over the prose surface, a comparison's champion buttons — each with its own
 * height, so the question and the answers moved between children, and the
 * reveal was appended to the document flow under the answers.
 *
 * Now every child that is answered by CHOOSING goes through the SAME
 * component the arena's own rounds use (`InteractiveScenarioSurface`), in the
 * same two regions (`data-surface-region="prompt"` / `"answers"`), whose
 * heights the Journey stage reserves (index.css, "JP2 — THE FIXED JOURNEY
 * STAGE"). What differs per child is only WORDS:
 *
 *   * the sentence — the semantic question, from the served semantics
 *     (Combat: `combatQuestionSentence`; a structural recall or comparison:
 *     the Mastery formatters they already use; anything else: the served
 *     prompt), never a serialization of the state the board already shows;
 *   * the option labels — the served values, drawn in the Journey's wording
 *     (a comparison's champion names; a formula's explicit AD category);
 *   * the one cue line — "Builds on Steps 2 & 3", and a premise fact the
 *     board has no object for.
 *
 * DIRECT ANSWER. Choosing a tablet IS answering — the Ranked arena's own rule
 * ("There is no Lock In button — clicking an answer submits it"). The value
 * sent is the served option string, looked up by index, never a drawn label.
 *
 * THE REVEAL IS A REPLACEMENT LAYER, NOT A NEW BLOCK. It is drawn in the
 * prompt region's own reserved box (the prompt is hidden, not removed), while
 * the tablets stay exactly where they are and take the surface's own
 * correct / chosen tones. Nothing is appended, so nothing moves.
 *
 * A child answered by TYPING (a numeric free-entry recall) keeps its Mastery
 * renderer — a text box cannot be one tap — inside the same reserved frame.
 *
 * Presentation only: nothing here grades, computes or rounds.
 */
import { useEffect, useMemo, useState } from "react";
import { InteractiveScenarioSurface } from "@/components/question-surface/InteractiveScenarioSurface";
import type { AnswerOptionView, QuestionView } from "@/lib/ranked-core/viewTypes";
import type { MasterySliceChallengeView } from "@/lib/ranked-public/contracts";
import type { JourneyChildContext, JourneyFormula } from "@/lib/journey/adapter";
import type { MasteryQuestionReveal } from "@/features/mastery/interactions/revealState";
import type { PlayerAnswer } from "@/features/mastery/player/useMasteryFixtureSession";
import { PROMPT_TEMPLATES, readPromptSemantics } from "@/features/mastery/contracts/promptSemantics";
import { readComparisonSemantics } from "@/features/mastery/contracts/comparisonSemantics";
import { formatRecallPrompt } from "@/features/mastery/interactions/formatPromptSemantics";
import { formatComparisonPrompt } from "@/features/mastery/interactions/formatComparisonSemantics";
import { COMPARISON_TIE_TOKEN } from "@/features/mastery/interactions/ComparisonQuestionView";
import type { CombatWorking } from "@/lib/journey/combatWorking";
import { ratioStatLabel, explicitAdText } from "@/lib/journey/statWording";
import {
  combatPremiseOf, combatQuestionSentence, percent, premiseNotes, premiseValue, type CombatPremise,
} from "./JourneyCombatQuestion";
import { JourneyCombatWorking } from "./JourneyCombatWorking";

/** Which words a child is drawn with. The ANSWER path is the same for all of them. */
export type JourneyQuestionKind = "combat" | "recall" | "comparison" | "prose";

export interface JourneyQuestion {
  kind: JourneyQuestionKind;
  /** The semantic question sentence. */
  sentence: string;
  /** The label drawn on each served option (same order, same count). */
  labels: string[];
  /** The one cue line under the sentence, or null. */
  cue: string | null;
  /** A formula this child STATES as its premise (Combat), drawn with the question. */
  statedFormula: JourneyFormula | null;
  /** The served Combat premise, when this is a Combat child. */
  premise: CombatPremise | null;
}

/** "Builds on Step 1" / "Builds on Steps 2 & 3" / "Builds on Steps 1, 2 & 4". */
export function buildsOnCue(reinforces: readonly number[]): string | null {
  if (reinforces.length === 0) return null;
  const steps = [...reinforces].sort((a, b) => a - b).map((i) => String(i + 1));
  if (steps.length === 1) return `Builds on Step ${steps[0]}`;
  return `Builds on Steps ${steps.slice(0, -1).join(", ")} & ${steps[steps.length - 1]}`;
}

const FORMULA_FAMILY = "ability_damage_formula";

/**
 * One wire challenge + its Journey context → the words the stage draws. Pure;
 * reads only the served challenge and the reached child's public context.
 */
export function journeyQuestionFor(challenge: MasterySliceChallengeView, journey: JourneyChildContext): JourneyQuestion {
  const options = challenge.answerOptions;
  const formulaLabels = challenge.questionFamily === FORMULA_FAMILY;
  const served = options.map((o) => (formulaLabels ? explicitAdText(o) : o));
  const cue = (notes: string[] = []) => [buildsOnCue(journey.reinforces), ...notes].filter(Boolean).join(" · ") || null;

  const premise = combatPremiseOf(challenge);
  if (premise) {
    const stated = journey.formula && journey.formula.slot === premise.slot ? journey.formula : null;
    return { kind: "combat", sentence: combatQuestionSentence(premise), labels: served, cue: cue(premiseNotes(premise)),
      statedFormula: stated, premise };
  }
  if (challenge.interactionKind === "comparison_left_right" && challenge.comparisonSemantics
      && options.length === 3 && options[2] === COMPARISON_TIE_TOKEN) {
    try {
      const cs = readComparisonSemantics(challenge.comparisonSemantics);
      // The comparison renderer's own labels: champion NAMES, never the ids.
      return { kind: "comparison", sentence: formatComparisonPrompt(cs),
        labels: [cs.championADisplay, cs.championBDisplay, "Tie / Same"], cue: cue(), statedFormula: null, premise: null };
    } catch { /* an unreadable comparison is asked in its served words below */ }
  }
  const template = (challenge.promptSemantics as { template?: unknown } | null)?.template;
  if (challenge.interactionKind === "atomic_recall" && challenge.promptSemantics
      && (PROMPT_TEMPLATES as readonly unknown[]).includes(template)) {
    try {
      return { kind: "recall", sentence: formatRecallPrompt(readPromptSemantics(challenge.promptSemantics)),
        labels: served, cue: cue(), statedFormula: null, premise: null };
    } catch { /* fall through to the served prompt */ }
  }
  return { kind: "prose", sentence: challenge.prompt, labels: served, cue: cue(), statedFormula: null, premise: null };
}

/** A formula stated as the question's premise, in one line. Served values only. */
function StatedFormula({ formula, rank }: { formula: JourneyFormula; rank: number | null }) {
  return (
    <span data-testid="journey-stated-formula" className="journey-ask__formula">
      <span className="font-bold">{formula.abilityName} ({formula.slot})</span>{" "}
      {formula.flatByRank.map((n, i) => (
        <span key={i} data-rank-value={i + 1}
          className={rank === i + 1 ? "font-black underline decoration-[#b8860b]" : "opacity-70"}>
          {n}{i < formula.flatByRank.length - 1 ? " / " : ""}
        </span>
      ))}
      {formula.ratios.map((r) => (
        <span key={r.stat}> + {percent(r.ratio)} {ratioStatLabel(r.stat, r.label)}</span>
      ))}
    </span>
  );
}

/**
 * JP2 — a raw-damage answer's working, laid out from SERVED parts only: the
 * formula the learner was taught (the ledger's value), the stat values the
 * premise states, and the reveal's own answer. Nothing is multiplied, summed
 * or rounded here; where a part is not served, no working is drawn.
 *
 *   Rank 1 Shadow Slash: 70 + (70% × 20.8 bonus AD) ≈ 85
 */
export function rawWorkingParts(premise: CombatPremise, formula: JourneyFormula | null, answer: string | null) {
  if (!formula || premise.rank === null || answer === null) return null;
  const flat = formula.flatByRank[premise.rank - 1];
  if (flat === undefined) return null;
  const terms: string[] = [];
  for (const r of formula.ratios) {
    const value = premiseValue(premise, r.stat);
    if (typeof value !== "number") return null;
    terms.push(`(${percent(r.ratio)} × ${value} ${ratioStatLabel(r.stat, r.label)})`);
  }
  return {
    what: `Rank ${premise.rank} ${premise.ability || premise.slot}`,
    expression: [String(flat), ...terms].join(" + "),
    answer,
  };
}

/**
 * The reveal, in the prompt region's reserved box: the verdict and the answer,
 * then ONE line of working — the server's Combat working, else a raw result
 * laid out from served parts, else the served explanation.
 */
function JourneyReveal({ question, correct, timedOut, answer, explanation, working, learnedFormula }: {
  question: JourneyQuestion;
  correct: boolean;
  /** No answer was submitted: the clock ran out on this child. */
  timedOut: boolean;
  /** The correct answer as its tablet draws it. */
  answer: string | null;
  explanation: string;
  working: CombatWorking | null;
  learnedFormula: JourneyFormula | null;
}) {
  const raw = question.premise?.mitigation === "before_armor"
    ? rawWorkingParts(question.premise, learnedFormula, answer) : null;
  return (
    <div data-testid="journey-reveal" role="status" aria-live="polite" className="journey-reveal">
      <p data-testid="journey-reveal-verdict" data-correct={correct ? "true" : "false"}
        className={`journey-reveal__verdict ${correct ? "journey-reveal__verdict--correct" : "journey-reveal__verdict--wrong"}`}>
        {correct ? "Correct" : timedOut ? "Time's up" : "Not quite"}
        {answer !== null && <> · <span data-testid="journey-reveal-answer">{answer}</span></>}
      </p>
      {working ? (
        <JourneyCombatWorking working={working} className="journey-reveal__working" />
      ) : raw ? (
        <p data-testid="journey-raw-working" className="journey-reveal__working">
          <span className="font-semibold">{raw.what}:</span>{" "}
          <span className="tabular-nums">{raw.expression}</span>{" "}
          <span aria-hidden className="opacity-60">≈</span>{" "}
          <span className="font-black tabular-nums">{raw.answer}</span>{" "}
          <span className="opacity-80">physical damage before armor</span>
        </p>
      ) : explanation ? (
        <p data-testid="journey-reveal-explanation" className="journey-reveal__working">{explanation}</p>
      ) : null}
    </div>
  );
}

export function JourneyStageQuestion({
  challenge, journey, submitting, onSubmit, reveal, combatWorking = null,
}: {
  challenge: MasterySliceChallengeView;
  journey: JourneyChildContext;
  submitting: boolean;
  onSubmit: (answer: PlayerAnswer) => void;
  reveal: MasteryQuestionReveal | null;
  combatWorking?: CombatWorking | null;
}) {
  const question = useMemo(() => journeyQuestionFor(challenge, journey), [challenge, journey]);
  const view: QuestionView = useMemo(() => ({
    questionId: `journey-${challenge.challengeIndex}`,
    prompt: question.sentence,
    options: question.labels.map((label, index): AnswerOptionView => ({ id: String(index), index, label })),
    // No category eyebrow: the board's header already says which step this is.
    category: "",
    ...(challenge.motif ? { motif: challenge.motif } : {}),
  }), [challenge, question]);

  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => { setPicked(null); }, [challenge.challengeIndex]);
  const revealing = reveal !== null;
  const optionId = (value: string | null) => {
    const i = value === null ? -1 : challenge.answerOptions.indexOf(value);
    return i >= 0 ? String(i) : null;
  };
  const labelOf = (value: string | null) => {
    const id = optionId(value);
    return id === null ? value : question.labels[Number(id)] ?? value;
  };
  // During a reveal the tablet shown as chosen is the player's OWN submitted
  // option, from the server payload, so a reload lands on the same picture.
  const shown = revealing ? (optionId(reveal.selectedValue) ?? picked) : picked;
  const open = !submitting && !revealing;
  const context = question.statedFormula || question.cue ? (
    <>
      {question.statedFormula && <StatedFormula formula={question.statedFormula} rank={question.premise?.rank ?? null} />}
      {question.statedFormula && question.cue && <br />}
      {question.cue && <span data-testid="journey-cue">{question.cue}</span>}
    </>
  ) : null;

  return (
    <div data-testid="journey-child" data-render-path={question.kind} data-revealing={revealing ? "true" : undefined}
      className="journey-ask">
      <InteractiveScenarioSurface
        question={view}
        selectedOptionId={shown}
        permissions={{
          canSelectAnswer: open, canChangeAnswer: open, canSelectAbility: false,
          canReviewSubmission: false, canConfirmSubmission: false, canAdvance: false,
        }}
        // DIRECT ANSWER: the tap IS the submission (the arena's own rule).
        onSelectOption={(option) => {
          if (!open) return;
          const value = challenge.answerOptions[option.index];
          if (value === undefined) return;
          setPicked(option.id);
          onSubmit(value);
        }}
        variant="competitive"
        settings={{ mediaScale: "none" }}
        scenarioSource={null}
        reveal={revealing ? { revealed: true, isCorrect: reveal.correct, correctOptionId: optionId(reveal.correctValue) } : null}
        context={context}
      />
      {revealing && (
        <JourneyReveal question={question} correct={reveal.correct} timedOut={!reveal.correct && reveal.selectedValue === null}
          answer={labelOf(reveal.correctValue)}
          explanation={challenge.questionFamily === FORMULA_FAMILY ? explicitAdText(reveal.explanation) : reveal.explanation}
          working={combatWorking} learnedFormula={journey.learnedFormula ?? null} />
      )}
    </div>
  );
}
