/**
 * Comparative (champion-vs-champion) question screen (Phase 4C2; DD1).
 *
 * DD1 — the question is presented as the MIG DATA DUEL
 * (`components/interaction-grammar/DataDuel`): the two champions face each
 * other as tablets, the player picks a side (or "Same value"), locks it, and
 * the reveal lands in place with both deciding values and the margin between
 * them. It is a presentation/input swap only: the same answer domain, the same
 * scalar answer token through the same `onSubmit`, the same server grading.
 * The props and the registry signature are unchanged, so every host that
 * dispatches a comparison (standalone Mastery, the Ranked slice, the Admin
 * Generator Lab) picks it up with no dispatcher edit.
 *
 * The backend answer domain for a comparison is ALWAYS exactly three options
 * — champion A, champion B, and the composer's own tie token — regardless of
 * whether this particular comparison happens to be decisive or a true tie
 * (`mastery.manifest_session.adapter._answer_and_options`). So the tie choice
 * is offered unconditionally here; nothing about whether THIS comparison is a
 * tie is visible before submission, and nothing needs to be inferred from
 * rounded values to decide whether to show it.
 *
 * REVEAL BOUNDARY. Before the reveal the duel is built from
 * `comparisonSemantics` + `answerOptions` alone (`toDataDuelPublic`), which
 * carry no value and no winner. After it, the canonical side is the server's
 * `correct_answer` and the values come only from `comparison_values`
 * (`toDataDuelReveal`); a reveal without that block shows no values and the
 * explanation prose is displayed, never parsed. Correctness words and the
 * explanation stay in the existing `MasteryInlineReveal`.
 *
 * No sound here: the host surface owns selection / lock / result cues.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { DataDuel } from "@/components/interaction-grammar/DataDuel";
import type { InteractionPhase } from "@/lib/interaction-grammar/types";
import type { MasteryPlayerQuestion } from "../contracts/playerQuestion";
import type { PlayerAnswer } from "../player/useMasteryFixtureSession";
import { useMasteryAssets } from "../player/MasteryAssets";
import { QuestionRoleEmblems } from "@/components/ranked-arena/RoleEmblem";
import { MasteryPatchBadge } from "../player/MasteryPatchBadge";
import { MasteryProgress } from "../player/MasteryProgress";
import { MasteryInlineReveal } from "./MasteryInlineReveal";
import type { MasteryQuestionReveal } from "./revealState";
import { DATA_DUEL_TIE_LABEL, toDataDuelPublic, toDataDuelReveal } from "./toDataDuel";
import { QuestionMotifLayer, motifHostClass } from "@/components/question-surface/QuestionMotifLayer";

export class MasteryComparisonContractError extends Error {
  constructor(message: string) {
    super(`Mastery comparison: ${message}`);
    this.name = "MasteryComparisonContractError";
  }
}

/** The composer's own tie token (`mastery.matchup.contract.TieState.TIE.value`). */
export const COMPARISON_TIE_TOKEN = "tie";

/** How the tie token reads to a player, everywhere a comparison is shown. */
export const COMPARISON_TIE_LABEL = DATA_DUEL_TIE_LABEL;

export function ComparisonQuestionView({
  question,
  total,
  submitting,
  onSubmit,
  reveal = null,
}: {
  question: MasteryPlayerQuestion;
  total: number;
  submitting: boolean;
  onSubmit: (answer: PlayerAnswer) => void;
  /** In-place reveal for THIS comparison — see `AtomicRecallQuestionView`. */
  reveal?: MasteryQuestionReveal | null;
}) {
  if (!question.comparisonSemantics) {
    throw new MasteryComparisonContractError(
      "comparison_left_right question is missing comparison_semantics",
    );
  }
  // A comparison is always presented as a 3-way single choice (A / B / tie) —
  // see the module docstring. A different answer_type means the payload does
  // not actually match this interaction kind's contract.
  if (question.answerType !== "single_choice") {
    throw new MasteryComparisonContractError(
      `unsupported answer_type "${question.answerType}" for comparison_left_right (single_choice only)`,
    );
  }
  const options = question.answerOptions;
  if (options.length !== 3 || options[2] !== COMPARISON_TIE_TOKEN) {
    throw new MasteryComparisonContractError(
      `comparison_left_right requires exactly [champion_a, champion_b, "${COMPARISON_TIE_TOKEN}"] answer_options`,
    );
  }

  const cs = question.comparisonSemantics;
  const assets = useMasteryAssets();

  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [question.sequenceIndex]);

  const [choice, setChoice] = useState<string | null>(null);

  // Public material only — semantics, tokens, art. See `toDataDuel.ts`.
  const content = useMemo(
    () => toDataDuelPublic(cs, options, assets),
    [cs, options, assets],
  );
  const duelReveal = useMemo(
    () => (reveal ? toDataDuelReveal(reveal, content) : null),
    [reveal, content],
  );
  const phase: InteractionPhase = reveal ? "revealed" : submitting ? "locked" : "open";
  // During a reveal the pick is the SERVER's record of it (a reload mid-hold
  // has no local choice); before it, the local pending pick.
  const value = reveal ? reveal.selectedValue ?? choice : choice;

  return (
    <section aria-label="Question" data-testid="mastery-comparison-question"
      data-presentation="data-duel"
      className={`space-y-4${motifHostClass(question.questionMotif)}`}>
      {/* JOURNEY-UI2 — `data-mastery-meta`: progress + metadata row. Inside a
          Journey the module's board already states both, so
          `.journey-question` hides this block; everywhere else it is drawn.
          DD1 — the two champions are no longer named here: the duel's own
          tablets carry their identity. */}
      <div className="space-y-3" data-mastery-meta>
        <MasteryProgress index={question.sequenceIndex} total={total} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* RQ1 — the question's role emblem(s), immediately left of the
              existing metadata (patch badge + kind label). Absent unless the
              Ranked slice froze roles; standalone Mastery is unchanged. */}
          <QuestionRoleEmblems roles={question.questionRoles} size="card" backed />
          <MasteryPatchBadge patchDisplay={question.patchDisplay} />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Comparison
          </span>
        </div>
      </div>

      <DataDuel
        content={content}
        phase={phase}
        value={value}
        onChange={setChoice}
        onLock={({ selected }) => {
          if (!submitting && reveal === null) onSubmit(selected);
        }}
        reveal={duelReveal}
        promptRef={headingRef}
      />

      {question.hintAvailable && reveal === null && (
        <p className="text-xs text-muted-foreground">A hint is available for this question.</p>
      )}

      {reveal !== null && (
        // Server correctness in words, and the backend's own explanation —
        // passed through, never recomputed and never mined for numbers.
        <MasteryInlineReveal
          correct={reveal.correct}
          answerLabel={reveal.answerLabel}
          explanation={reveal.explanation}
        />
      )}
      {submitting && reveal === null && (
        <span role="status" aria-live="polite" className="sr-only">
          Submitting your answer…
        </span>
      )}
      {/* QF1.2 — the motif illustration, last and absolutely positioned (a
          `space-y` host cannot offset it), behind the whole question. */}
      <QuestionMotifLayer motif={question.questionMotif} />
    </section>
  );
}
