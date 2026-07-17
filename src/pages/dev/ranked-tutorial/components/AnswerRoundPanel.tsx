import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Hourglass, Lock, X } from "lucide-react";
import { RoundState } from "../types";
import { TUTORIAL_OPPONENT, TUTORIAL_PLAYER, TUTORIAL_QUESTIONS } from "../fixtures";
import { TutorialEvent } from "../types";

const CHOICE_LABELS = ["A", "B", "C", "D"];

function OutcomeBadge({
  correct,
  timedOut,
}: {
  correct: boolean;
  timedOut: boolean;
}) {
  if (timedOut)
    return (
      <Badge variant="secondary" className="gap-1">
        <Hourglass className="h-3 w-3" aria-hidden /> Timed out
      </Badge>
    );
  if (correct)
    return (
      <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
        <Check className="h-3 w-3" aria-hidden /> Correct
      </Badge>
    );
  return (
    <Badge variant="destructive" className="gap-1">
      <X className="h-3 w-3" aria-hidden /> Incorrect
    </Badge>
  );
}

/**
 * Interactive round area: question, answer buttons, the (currently
 * no-ability-only) ability selector, review/lock/confirm flow, locked
 * banner, opponent status, and the simultaneous reveal panel.
 *
 * Purely presentational over machine state — every interaction dispatches
 * a machine event; nothing here owns game logic.
 */
export function AnswerRoundPanel({
  round,
  interactive,
  dispatch,
}: {
  round: RoundState;
  /** False while an explanation step is showing a resolved round. */
  interactive: boolean;
  dispatch: (event: TutorialEvent) => void;
}) {
  const question = TUTORIAL_QUESTIONS[round.questionIndex];
  const selecting = interactive && round.phase === "selecting";
  const reviewing = interactive && round.phase === "reviewing";
  const locked = round.phase === "locked";
  const revealed = round.phase === "revealed";
  const result = round.result;

  return (
    <section
      aria-label="Round area"
      data-testid="round-area"
      className="rounded-xl border-2 border-border bg-card p-4 space-y-4"
    >
      {/* Question — shared by both players. */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-1">
          Shared question
        </div>
        <p className="font-semibold" data-testid="round-question">
          {question.prompt}
        </p>
      </div>

      {/* Answer buttons. */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${
          selecting ? "ring-2 ring-primary/60 rounded-lg p-2" : ""
        }`}
        data-testid="answer-options"
      >
        {question.choices.map((choice, i) => {
          const isSelected = round.playerAnswerIndex === i;
          const isPlayerReveal = revealed && result?.playerAnswer === i;
          const isOpponentReveal = revealed && result?.opponentAnswer === i;
          return (
            <Button
              key={choice}
              variant={isSelected ? "default" : "outline"}
              className="justify-start gap-2 h-auto py-2 whitespace-normal text-left"
              aria-pressed={isSelected}
              disabled={!selecting}
              onClick={() => dispatch({ type: "SELECT_ANSWER", answerIndex: i })}
              data-testid={`answer-${i}`}
            >
              <span className="font-mono text-xs">{CHOICE_LABELS[i]}</span>
              <span>{choice}</span>
              {isPlayerReveal && (
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {TUTORIAL_PLAYER.name}
                </Badge>
              )}
              {isOpponentReveal && (
                <Badge variant="outline" className="text-[10px]">
                  {TUTORIAL_OPPONENT.name}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>

      {/* Ability selector — this phase teaches only the no-ability path. */}
      <div className="flex items-center gap-2" data-testid="ability-selector">
        <span className="text-xs font-semibold text-muted-foreground">Ability:</span>
        <Button
          variant={round.playerAbilityId === null ? "secondary" : "outline"}
          size="sm"
          aria-pressed={round.playerAbilityId === null}
          disabled={!selecting}
          onClick={() => dispatch({ type: "SELECT_ABILITY", abilityId: null })}
          data-testid="ability-none"
        >
          No ability
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Abilities are taught after Level 2.
        </span>
      </div>

      {/* Selection → review → confirm flow. */}
      {selecting && (
        <Button
          onClick={() => dispatch({ type: "LOCK_SUBMISSION" })}
          disabled={round.playerAnswerIndex === null}
          data-testid="lock-submission"
        >
          Lock Answer &amp; Ability
        </Button>
      )}

      {reviewing && (
        <div
          className="rounded-lg border bg-background/60 p-3 space-y-2"
          data-testid="submission-review"
        >
          <div className="text-sm font-semibold">Review your submission</div>
          <div className="text-sm">
            Answer:{" "}
            <span className="font-medium">
              {round.playerAnswerIndex !== null
                ? question.choices[round.playerAnswerIndex]
                : "—"}
            </span>
            {" · "}Ability: <span className="font-medium">None</span>
          </div>
          {round.coachNudge && (
            <p className="text-sm text-amber-600 dark:text-amber-400" data-testid="coach-nudge">
              Training tip: that answer won't land this lesson — go back and
              pick again before locking in.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => dispatch({ type: "CONFIRM_LOCK" })}
              disabled={round.coachNudge}
              data-testid="confirm-lock"
            >
              Confirm — lock it in
            </Button>
            <Button
              variant="outline"
              onClick={() => dispatch({ type: "EDIT_SUBMISSION" })}
              data-testid="edit-submission"
            >
              Go back
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            After confirming, your answer and ability are final for the round.
          </p>
        </div>
      )}

      {locked && (
        <div
          className="rounded-lg border border-primary/40 bg-primary/5 p-3 flex items-center gap-2"
          data-testid="locked-banner"
          role="status"
        >
          <Lock className="h-4 w-4" aria-hidden />
          <span className="text-sm font-medium">
            Locked in. Your answer is hidden until reveal.
          </span>
        </div>
      )}

      {/* Neutral opponent status — never the answer content. */}
      {!revealed && (
        <div
          className="flex items-center gap-2 text-sm"
          data-testid="opponent-status"
          role="status"
          aria-label={`${TUTORIAL_OPPONENT.name} status`}
        >
          <span className="text-xs font-semibold text-muted-foreground">
            {TUTORIAL_OPPONENT.name}:
          </span>
          {round.opponentStatus === "thinking" && (
            <Badge variant="secondary" className="gap-1">
              <Hourglass className="h-3 w-3" aria-hidden /> Thinking…
            </Badge>
          )}
          {round.opponentStatus === "submitted" && (
            <Badge className="gap-1">
              <Lock className="h-3 w-3" aria-hidden /> Answer submitted
            </Badge>
          )}
          {round.opponentStatus === "timed_out" && (
            <Badge variant="secondary" className="gap-1">
              <Hourglass className="h-3 w-3" aria-hidden /> Timed out
            </Badge>
          )}
        </div>
      )}

      {/* Simultaneous reveal: both sides appear in the same transition. */}
      {revealed && result && (
        <div className="rounded-lg border p-3 space-y-3" data-testid="reveal-panel">
          <div className="text-sm font-semibold">Reveal</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1" data-testid="reveal-player">
              <div className="text-xs font-semibold">{TUTORIAL_PLAYER.name}</div>
              <div className="text-sm">
                {result.playerTimedOut || result.playerAnswer === null
                  ? "No answer (timed out)"
                  : question.choices[result.playerAnswer]}
              </div>
              <OutcomeBadge correct={result.playerCorrect} timedOut={result.playerTimedOut} />
              <div className="text-xs text-muted-foreground tabular-nums">
                Dealt {result.playerDamage} damage · HP {result.playerHpBefore} →{" "}
                {result.playerHpAfter} · +{result.playerXpAwarded} XP
              </div>
            </div>
            <div className="space-y-1" data-testid="reveal-opponent">
              <div className="text-xs font-semibold">{TUTORIAL_OPPONENT.name}</div>
              <div className="text-sm">
                {result.opponentTimedOut || result.opponentAnswer === null
                  ? "No answer (timed out)"
                  : question.choices[result.opponentAnswer]}
              </div>
              <OutcomeBadge
                correct={result.opponentCorrect}
                timedOut={result.opponentTimedOut}
              />
              <div className="text-xs text-muted-foreground tabular-nums">
                Dealt {result.opponentDamage} damage · HP {result.opponentHpBefore} →{" "}
                {result.opponentHpAfter} · +{result.opponentXpAwarded} XP
              </div>
            </div>
          </div>
          {result.playerLeveledUpTo && (
            <Badge
              className="bg-violet-600 text-white hover:bg-violet-600"
              data-testid="level-up-badge"
            >
              Level {result.playerLeveledUpTo} reached!
            </Badge>
          )}
          <p className="text-sm" data-testid="result-copy">
            {result.resultCopy}
          </p>
        </div>
      )}
    </section>
  );
}
