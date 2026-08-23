/**
 * The CENTRE — one card, in whichever of its states it is in (DC1 Phase 5).
 *
 * Composes the canonical arena's `QuestionPanel` and `TimerDisplay` unchanged,
 * and adds the two things Ranked has no concept of: a Meta Reflex card that is
 * READY but not started, and an answer grid with options struck out under a
 * still-live card.
 *
 * THE ACTIVATION ORDER IS VISIBLE HERE
 * ────────────────────────────────────
 * A `reflex_ready` card renders its prompt and its options — greyed, inert —
 * behind a START gate. The player can read the question before the clock
 * exists, which is the whole reason activation is explicit: the six seconds
 * are for ANSWERING, not for parsing a prompt that arrived at the same instant
 * as the countdown. Nothing on this surface calls activate on mount.
 *
 * THE BEAT IS INLINE, NOT MODAL
 * ─────────────────────────────
 * A miss is the most common thing that happens in this mode and it happens
 * mid-card. An overlay would stop the run to say "you missed", which is both
 * slower and meaner than a line that changes above the options while the
 * options stay exactly where they were.
 */

import { ReactNode } from "react";
import { ArrowRight, Clock, GraduationCap, Lightbulb, Target, XCircle, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuestionPanel } from "@/components/ranked-arena/QuestionPanel";
import { TimerDisplay } from "@/components/ranked-arena/TimerDisplay";
import type { TimerView } from "@/lib/ranked-core/viewTypes";
import type { DcCard, DcResolvedCard } from "@/lib/daily-challenge/contracts";
import { DailyAnswerGrid } from "./DailyAnswerGrid";
import {
  BEAT_COPY,
  DcBeat,
  DcCardPhase,
  DcRevealView,
  projectOptionMedia,
  projectQuestion,
} from "./dailyChallengeViews";

const BEAT_TONE: Record<DcBeat["kind"], { className: string; Icon: typeof Target }> = {
  first_correct: { className: "text-emerald-300", Icon: Target },
  first_miss: { className: "text-amber-300", Icon: XCircle },
  // Quieter than the first miss, deliberately: it cost nothing.
  learning_miss: { className: "text-muted-foreground", Icon: XCircle },
  learned: { className: "text-sky-300", Icon: GraduationCap },
  reflex_timeout: { className: "text-amber-300", Icon: Clock },
};

function BeatLine({ beat }: { beat: DcBeat }) {
  const { className, Icon } = BEAT_TONE[beat.kind];
  const copy = BEAT_COPY[beat.kind];
  return (
    <p
      role="status"
      data-testid="dc-beat"
      data-beat-kind={beat.kind}
      data-beat-scored={beat.scored ? "true" : "false"}
      className={`flex items-center gap-1.5 text-xs font-medium ${className}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="font-semibold">{copy.title}</span>
      <span className="text-muted-foreground">{copy.detail}</span>
      {beat.scored && beat.scoreDelta > 0 && (
        <span data-testid="dc-beat-delta" className="ml-auto font-bold tabular-nums">
          +{beat.scoreDelta}
        </span>
      )}
    </p>
  );
}

function Reveal({ reveal }: { reveal: DcRevealView }) {
  return (
    <div
      data-testid="dc-reveal"
      data-first-try={reveal.firstAttemptCorrect ? "true" : "false"}
      className="space-y-2 rounded-md border border-white/10 bg-black/20 p-3"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        {reveal.firstAttemptCorrect ? (
          <>
            <Target className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />
            <span className="text-emerald-300">Solved first try</span>
            <span className="ml-auto tabular-nums text-emerald-300">
              +{reveal.awardedScore}
            </span>
          </>
        ) : (
          <>
            <GraduationCap className="h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden="true" />
            {/* Never "wrong". The card IS solved; what it did not do is score. */}
            <span className="text-sky-300">
              {reveal.timedOut ? "Learned after the window closed" : "Learned"}
            </span>
            <span className="ml-auto text-muted-foreground">
              {reveal.attemptCount === 1 ? "1 attempt" : `${reveal.attemptCount} attempts`}
            </span>
          </>
        )}
      </p>
      {reveal.correctLabel && (
        <p data-testid="dc-reveal-answer" className="text-sm">
          <span className="text-muted-foreground">Answer: </span>
          <span className="font-medium">{reveal.correctLabel}</span>
        </p>
      )}
      {reveal.explanation && (
        <p
          data-testid="dc-reveal-explanation"
          className="flex gap-1.5 text-xs leading-relaxed text-muted-foreground"
        >
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
          <span>{reveal.explanation}</span>
        </p>
      )}
    </div>
  );
}

export interface DailyCardStageProps {
  card: DcCard;
  phase: DcCardPhase;
  timer: TimerView | null;
  beat: DcBeat | null;
  /** Only ever derived from a RESOLVED card. */
  reveal: DcRevealView | null;
  busy: boolean;
  onActivate: () => void;
  onAnswer: (optionIndex: number) => void;
  /** Present only while the stage is HOLDING a resolved card. */
  onContinue?: (() => void) | null;
  continueLabel?: string;
  footer?: ReactNode;
}

export function DailyCardStage({
  card, phase, timer, beat, reveal, busy, onActivate, onAnswer,
  onContinue = null, continueLabel = "Next card", footer,
}: DailyCardStageProps) {
  const question = projectQuestion(card);
  const isReflex = card.kind === "meta_reflex";
  const gated = phase === "reflex_ready";
  const resolved = phase === "resolved";
  // The beat belongs to THIS card. A stale one from the card before would
  // otherwise flash over a fresh prompt.
  const liveBeat = beat && beat.sequence === card.sequence ? beat : null;

  return (
    <section
      data-testid="dc-card-stage"
      data-card-phase={phase}
      data-card-kind={card.kind}
      data-sequence={card.sequence}
      className="ranked-panel ranked-folio space-y-3 p-3 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px]">
          Card {card.sequence}
        </Badge>
        {isReflex ? (
          <Badge
            data-testid="dc-reflex-badge"
            className="gap-1 bg-amber-500/20 text-[10px] text-amber-200 ring-1 ring-amber-400/40"
          >
            <Zap className="h-3 w-3" aria-hidden="true" />
            Meta Reflex
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] capitalize">
            {card.tier}
          </Badge>
        )}
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
          {card.points} pts
        </span>
      </div>

      {/* The timer occupies a RESERVED box whether or not a window is open, so
          the prompt below it does not jump when the countdown appears at
          activation or vanishes at the lock.

          The box is tall enough to CONTAIN the expired note as well.
          TimerDisplay overlays that line absolutely (`top-full`) to keep its
          own height constant, which means the space for it has to be reserved
          by whoever mounts it — otherwise it paints over the prompt below. */}
      {isReflex && (
        <div data-testid="dc-timer-slot" className="min-h-[4.25rem]">
          {timer && (
            <TimerDisplay
              timer={timer}
              label="Meta Reflex window"
              // Solo copy. Ranked's defaults describe a shared round and an
              // opponent to wait for; neither exists here.
              durationNote={(duration) => `of ${duration} to answer`}
              expiredNote="Window closed — solve it untimed."
            />
          )}
        </div>
      )}

      <QuestionPanel question={question}>
        <div className="space-y-3">
          {liveBeat && <BeatLine beat={liveBeat} />}

          {phase === "learning" && !liveBeat && (
            <p role="status" data-testid="dc-learning-note"
              className="text-xs text-muted-foreground">
              Scored attempt spent — keep solving to clear the card.
            </p>
          )}

          <div className={gated ? "pointer-events-none select-none opacity-40" : ""}>
            <DailyAnswerGrid
              options={question.options}
              eliminated={card.eliminated}
              optionMedia={projectOptionMedia(card)}
              disabled={gated || busy || resolved}
              revealedCorrectIndex={
                // The ONLY path to a correct index is a resolved card, and the
                // parser gives no such field on any other shape.
                card.resolved === true ? (card as DcResolvedCard).correctIndex : null}
              onSelect={onAnswer}
            />
          </div>

          {gated && (
            <div
              data-testid="dc-reflex-gate"
              className="flex flex-col items-center gap-2 rounded-md border border-amber-400/30
                         bg-amber-500/10 p-3 text-center"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
                Six seconds
              </p>
              <p className="text-xs text-muted-foreground">
                Read the card. The clock starts when you do.
              </p>
              <Button
                type="button"
                data-testid="dc-reflex-start"
                onClick={onActivate}
                disabled={busy}
                className="gap-1.5"
              >
                <Zap className="h-4 w-4" aria-hidden="true" />
                {busy ? "Starting…" : "Start card"}
              </Button>
            </div>
          )}

          {resolved && reveal && reveal.sequence === card.sequence && (
            <Reveal reveal={reveal} />
          )}

          {/* The player leaves a resolved card when THEY are done reading it.
              Auto-advancing would make the explanation a flash — and the
              explanation is what the retry loop exists to deliver. */}
          {onContinue && (
            <Button
              type="button"
              data-testid="dc-continue"
              onClick={onContinue}
              disabled={busy}
              className="w-full gap-1.5 sm:w-auto"
            >
              {continueLabel}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}

          {footer}
        </div>
      </QuestionPanel>
    </section>
  );
}
