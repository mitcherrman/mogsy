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
 *   * a formula the child STATES as its premise (a Daily Combat child), the
 *     one premise the question itself must carry.
 *
 * NO HELPER LINES. What earlier steps established is on the board (K2 `!`
 * marks, recall chips), so the question does not repeat it underneath
 * ("Builds on step N"), and internal scenario state that the calculation
 * holds fixed (item effects declared inactive) is never question copy.
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
import { useEffect, useMemo, useRef, useState } from "react";
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
import type { AbilitySlot } from "@/lib/journey/contract";
import { ratioStatLabel, explicitAdText } from "@/lib/journey/statWording";
import { mnemonicForMetric } from "@/lib/journey/statIcons";
import { isJourneyStatKey, JOURNEY_STAT_META } from "@/lib/journey/stats";
import {
  combatReasoning, explainedExact, rawReasoning, statReasoning, type Reasoning,
} from "@/lib/journey/reasoning";
import {
  combatPremiseOf, combatQuestionSentence, percent, premiseValue, type CombatPremise,
} from "./JourneyCombatQuestion";
import { displayExplanation } from "./JourneyCalcFlow";
import { JourneyReasoningChain, JourneyReasoningHead } from "./JourneyReasoning";
import { AbilityIcon } from "./JourneyIcons";
import { JourneyQuestionText, useFittedQuestion, type PromptSubject } from "./JourneyQuestionText";

/** Which words a child is drawn with. The ANSWER path is the same for all of them. */
export type JourneyQuestionKind = "combat" | "recall" | "comparison" | "prose";

export interface JourneyQuestion {
  kind: JourneyQuestionKind;
  /** The semantic question sentence. */
  sentence: string;
  /** The label drawn on each served option (same order, same count). */
  labels: string[];
  /** A formula this child STATES as its premise (Combat), drawn with the question. */
  statedFormula: JourneyFormula | null;
  /** The served Combat premise, when this is a Combat child. */
  premise: CombatPremise | null;
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

  const premise = combatPremiseOf(challenge);
  if (premise) {
    const stated = journey.formula && journey.formula.slot === premise.slot ? journey.formula : null;
    return { kind: "combat", sentence: combatQuestionSentence(premise), labels: served, statedFormula: stated, premise };
  }
  if (challenge.interactionKind === "comparison_left_right" && challenge.comparisonSemantics
      && options.length === 3 && options[2] === COMPARISON_TIE_TOKEN) {
    try {
      const cs = readComparisonSemantics(challenge.comparisonSemantics);
      // The comparison renderer's own labels: champion NAMES, never the ids.
      return { kind: "comparison", sentence: formatComparisonPrompt(cs),
        labels: [cs.championADisplay, cs.championBDisplay, "Tie / Same"], statedFormula: null, premise: null };
    } catch { /* an unreadable comparison is asked in its served words below */ }
  }
  const template = (challenge.promptSemantics as { template?: unknown } | null)?.template;
  if (challenge.interactionKind === "atomic_recall" && challenge.promptSemantics
      && (PROMPT_TEMPLATES as readonly unknown[]).includes(template)) {
    try {
      return { kind: "recall", sentence: formatRecallPrompt(readPromptSemantics(challenge.promptSemantics)),
        labels: served, statedFormula: null, premise: null };
    } catch { /* fall through to the served prompt */ }
  }
  return { kind: "prose", sentence: challenge.prompt, labels: served, statedFormula: null, premise: null };
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
 * JP3 — the served parts of a raw-damage answer: the taught formula's flat
 * value at the premise's rank, each ratio with the premise's stated stat, and
 * the reveal's answer. `null` when any part is not served.
 */
export function rawCalcPartsOf(premise: CombatPremise, formula: JourneyFormula | null, answer: string | null) {
  if (!formula || premise.rank === null || answer === null) return null;
  const flat = formula.flatByRank[premise.rank - 1];
  if (flat === undefined) return null;
  const ratios: { ratio: number; stat: string; label: string; value: number }[] = [];
  for (const r of formula.ratios) {
    const value = premiseValue(premise, r.stat);
    if (typeof value !== "number") return null;
    ratios.push({ ratio: r.ratio, stat: r.stat, label: r.label, value });
  }
  return { rank: premise.rank, flat, ratios, answer };
}

/** JP3 — a champion stat recall's own semantics (champion, metric, level), or null. */
function statRecallOf(challenge: MasterySliceChallengeView) {
  const p = challenge.promptSemantics as Record<string, unknown> | null | undefined;
  if (!p || p.template !== "champion_stat_at_level") return null;
  const ctx = (p.context ?? {}) as Record<string, unknown>;
  return {
    champion: typeof p.champion_display === "string" ? p.champion_display : "",
    metric: typeof p.metric === "string" ? p.metric : "",
    level: typeof ctx.champion_level === "number" ? ctx.champion_level : null,
  };
}

const ABILITY_SLOTS_SET = new Set(["Q", "W", "E", "R"]);

/** The board's id for a champion named in the question (its portrait), or null. */
function championIdOf(journey: JourneyChildContext, name: string | undefined | null): string | null {
  if (!name) return null;
  if (name === journey.playerChampion) return journey.playerChampionId ?? name;
  if (name === journey.opponentChampion) return journey.opponentChampionId ?? name;
  return null;
}

/**
 * JP4 — which nouns of this question get a subject icon (`JourneyQuestionText`):
 * a rule per question kind, from the served semantics only.
 */
export function promptSubjectsFor(challenge: MasterySliceChallengeView, journey: JourneyChildContext,
  question: JourneyQuestion): PromptSubject[] {
  const p = (challenge.promptSemantics ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const champion = text(p.champion_display);
  const slot = text(p.subject_ref);
  const abilityName = text(p.ability_name);
  const ability: PromptSubject[] = abilityName && champion && ABILITY_SLOTS_SET.has(slot)
    ? [{ kind: "ability", text: abilityName, champion, slot: slot as AbilitySlot }] : [];
  const championSubject = (name: string | null | undefined): PromptSubject[] => {
    const id = championIdOf(journey, name);
    return id && name ? [{ kind: "champion", text: name, championId: id }] : [];
  };
  if (question.kind === "combat" && question.premise) {
    const target = premiseValue(question.premise, "target");
    return [...ability, ...championSubject(typeof target === "string" ? target : null)];
  }
  if (p.template === "ability_damage_formula") return ability;
  if (p.template === "champion_stat_at_level") {
    const mnemonic = mnemonicForMetric(text(p.metric));
    const stat = text(p.metric).replace(/^base_/, "");
    const word = isJourneyStatKey(stat) ? JOURNEY_STAT_META[stat].long : "";
    return [...championSubject(champion),
      ...(mnemonic && word ? [{ kind: "stat" as const, text: word, mnemonic }] : [])];
  }
  // Anything else: the champions it names, at most two.
  return [...championSubject(journey.playerChampion), ...championSubject(journey.opponentChampion)];
}

/**
 * The reveal, in the prompt region's reserved box: the verdict and the answer,
 * then (JP4) the REASONING CHAIN when the child has a real derivation — the
 * server's Combat working, a raw result from served parts, a stat recall's own
 * semantics — or, for a taught fact (a formula), the fact itself beside its
 * subject. Anything else keeps the served explanation, whole-number display.
 */
function JourneyReveal({ challenge, journey, question, correct, timedOut, answer, explanation, working,
  learnedFormula, rawRecalled }: {
  challenge: MasterySliceChallengeView;
  journey: JourneyChildContext;
  question: JourneyQuestion;
  correct: boolean;
  /** No answer was submitted: the clock ran out on this child. */
  timedOut: boolean;
  /** The correct answer as its tablet draws it. */
  answer: string | null;
  explanation: string;
  working: CombatWorking | null;
  learnedFormula: JourneyFormula | null;
  /** The raw damage this Combat answer applies was established by an earlier step. */
  rawRecalled: boolean;
}) {
  const shown = displayExplanation(explanation);
  const statRecall = statRecallOf(challenge);
  let reasoning: Reasoning | null = null;
  if (working) {
    reasoning = combatReasoning(working, rawRecalled);
  } else if (question.premise?.mitigation === "before_armor") {
    const parts = rawCalcPartsOf(question.premise, learnedFormula, answer);
    if (parts) {
      reasoning = rawReasoning({
        ...parts, champion: question.premise.champion, slot: question.premise.slot,
        ability: question.premise.ability, exactRaw: explainedExact(explanation),
      });
    }
  } else if (statRecall && answer !== null) {
    reasoning = statReasoning({ ...statRecall, championId: championIdOf(journey, statRecall.champion) },
      answer, explainedExact(explanation));
  }
  const fact = !reasoning && challenge.questionFamily === FORMULA_FAMILY
    ? promptSubjectsFor(challenge, journey, question).find((s) => s.kind === "ability") ?? null : null;
  const kind = reasoning?.kind ?? (fact ? "fact" : null);
  const chainId = reasoning?.kind === "combat" ? "journey-combat-working"
    : reasoning?.kind === "raw" ? "journey-raw-working" : "journey-stat-working";
  return (
    <div data-testid="journey-reveal" role="status" aria-live="polite" className="journey-reveal"
      data-working={kind ?? (shown.text ? "explanation" : "none")}>
      <div className="journey-reveal__top">
        <p data-testid="journey-reveal-verdict" data-correct={correct ? "true" : "false"}
          className={`journey-reveal__verdict ${correct ? "journey-reveal__verdict--correct" : "journey-reveal__verdict--wrong"}`}>
          {correct ? "Correct" : timedOut ? "Time's up" : "Not quite"}
          {answer !== null && !fact && <> · <span data-testid="journey-reveal-answer">{answer}</span></>}
        </p>
        {reasoning && <JourneyReasoningHead reasoning={reasoning} testId={chainId} />}
      </div>
      {reasoning ? (
        <JourneyReasoningChain reasoning={reasoning} testId={chainId} />
      ) : fact && fact.kind === "ability" && answer !== null ? (
        <p data-testid="journey-reveal-fact" className="journey-reveal__fact">
          <AbilityIcon champion={fact.champion} slot={fact.slot} size="node" />
          <span className="journey-reveal__fact-text">
            <span className="journey-reveal__fact-name">{fact.text} ({fact.slot})</span>
            <span className="journey-reveal__fact-value" data-testid="journey-reveal-answer">{answer}</span>
          </span>
        </p>
      ) : shown.text ? (
        <p data-testid="journey-reveal-explanation" className="journey-reveal__working" title={shown.exact ?? undefined}>
          {shown.text}
        </p>
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
  const subjects = useMemo(() => promptSubjectsFor(challenge, journey, question), [challenge, journey, question]);
  // JP4 — a fixed prompt box, adaptive type: fitted before paint.
  const host = useRef<HTMLDivElement>(null);
  useFittedQuestion(host, `${challenge.challengeIndex}:${question.sentence}`);
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
  const context = question.statedFormula
    ? <StatedFormula formula={question.statedFormula} rank={question.premise?.rank ?? null} />
    : null;

  return (
    <div ref={host} data-testid="journey-child" data-render-path={question.kind} data-revealing={revealing ? "true" : undefined}
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
        promptNode={<JourneyQuestionText sentence={question.sentence} subjects={subjects} />}
      />
      {revealing && (
        <JourneyReveal challenge={challenge} journey={journey} question={question}
          correct={reveal.correct} timedOut={!reveal.correct && reveal.selectedValue === null}
          answer={labelOf(reveal.correctValue)}
          explanation={challenge.questionFamily === FORMULA_FAMILY ? explicitAdText(reveal.explanation) : reveal.explanation}
          working={combatWorking} learnedFormula={journey.learnedFormula ?? null}
          rawRecalled={journey.recalled.some((r) => r.what === "raw_damage")} />
      )}
    </div>
  );
}
