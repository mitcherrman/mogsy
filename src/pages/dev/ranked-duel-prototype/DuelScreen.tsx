import { Dispatch } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Timer, Check, X, Zap, Hourglass } from "lucide-react";
import {
  MOCK_PLAYERS,
  MOCK_QUESTIONS,
  PlayerId,
  ROUND_SECONDS,
  findClassAbility,
  getDuelClass,
} from "./fixtures";
import { DuelAction, DuelState, RoundResult } from "./duelMachine";
import { PlayerPanel } from "./PlayerPanel";
import { OperatorPanel } from "./OperatorPanel";
import { ProgressionPanel } from "./ProgressionPanel";

const CHOICE_LABELS = ["A", "B", "C", "D"];

function SharedTimer({ state }: { state: DuelState }) {
  const running = state.phase === "question";
  const pct = (state.timerRemaining / ROUND_SECONDS) * 100;
  const urgent = running && state.timerRemaining <= 5;
  return (
    <div className="flex flex-col items-center gap-1" data-testid="shared-timer">
      <div
        className={`flex items-center gap-2 text-2xl font-bold tabular-nums ${
          urgent ? "text-destructive" : ""
        }`}
        aria-live="off"
      >
        <Timer className="h-5 w-5" aria-hidden />
        <span data-testid="timer-seconds">{state.timerRemaining}s</span>
      </div>
      <div className="w-40 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear motion-reduce:transition-none ${
            urgent ? "bg-destructive" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {state.timerShortened && running && (
        <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
          −5s: first answer is in
        </span>
      )}
      {!running && <span className="text-[11px] text-muted-foreground">Timer paused</span>}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: "correct" | "incorrect" | "timed_out" }) {
  if (outcome === "correct")
    return (
      <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
        <Check className="h-3 w-3" aria-hidden /> Correct
      </Badge>
    );
  if (outcome === "incorrect")
    return (
      <Badge variant="destructive" className="gap-1">
        <X className="h-3 w-3" aria-hidden /> Incorrect
      </Badge>
    );
  return (
    <Badge variant="secondary" className="gap-1">
      <Hourglass className="h-3 w-3" aria-hidden /> Timed out
    </Badge>
  );
}

/** Simultaneous reveal: both players' answers and abilities shown together. */
function RevealPanel({
  state,
  result,
  dispatch,
}: {
  state: DuelState;
  result: RoundResult;
  dispatch: Dispatch<DuelAction>;
}) {
  const question = MOCK_QUESTIONS[result.questionIndex];
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3" data-testid="reveal-panel">
      <h3 className="font-bold text-center">Round {result.round} — Reveal</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(["p1", "p2"] as PlayerId[]).map((p) => {
          const rp = result.players[p];
          const cls = state.players ? getDuelClass(state.players[p].classId) : null;
          const ability = cls ? findClassAbility(cls, rp.abilityId) : undefined;
          return (
            <div key={p} className="rounded-lg border p-3 space-y-1.5" data-testid={`reveal-${p}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{MOCK_PLAYERS[p].name}</span>
                <OutcomeBadge outcome={rp.outcome} />
                {rp.wasFaster && (
                  <Badge variant="outline" className="gap-1 border-amber-500/60">
                    <Zap className="h-3 w-3" aria-hidden /> Faster
                  </Badge>
                )}
              </div>
              <p className="text-sm">
                Answer:{" "}
                <strong>
                  {rp.answerIndex !== null
                    ? `${CHOICE_LABELS[rp.answerIndex]}. ${question.choices[rp.answerIndex]}`
                    : "No answer (timed out)"}
                </strong>
              </p>
              <p className="text-sm">
                Ability: <strong>{ability ? ability.name : "None"}</strong>
              </p>
              <div className="text-xs text-muted-foreground tabular-nums">
                Dealt {rp.damageDealt} dmg · +{rp.xpAwarded} XP
                {rp.leveledUp && (
                  <Badge className="ml-2 bg-violet-600 text-white hover:bg-violet-600">
                    Level up! Lv {rp.levelAfter}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-sm text-center text-muted-foreground">
        Correct answer: <strong>{question.choices[question.correctIndex]}</strong> —{" "}
        {question.explanation}
      </p>
      <div className="text-center">
        <Button onClick={() => dispatch({ type: "NEXT_ROUND" })}>
          {state.winner ? "View match result" : "Next Round"}
        </Button>
      </div>
    </div>
  );
}

function CombatLog({ log }: { log: RoundResult[] }) {
  if (log.length === 0) return null;
  return (
    <div className="rounded-xl border bg-card p-3" data-testid="combat-log">
      <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
        Combat log
      </h4>
      <ol className="space-y-1 text-xs max-h-28 overflow-y-auto">
        {[...log].reverse().map((r) => (
          <li key={r.round} className="tabular-nums">
            <span className="font-semibold">R{r.round}:</span> {r.summary}{" "}
            <span className="text-muted-foreground">
              (HP {r.players.p1.hpAfter} vs {r.players.p2.hpAfter})
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function DuelScreen({
  state,
  dispatch,
}: {
  state: DuelState;
  dispatch: Dispatch<DuelAction>;
}) {
  const question = MOCK_QUESTIONS[state.questionIndex];
  if (!state.players) return null;

  return (
    <div className="space-y-4">
      {/* Desktop: two opposing players around a central column. Mobile: stacked
          with HP/timer/question kept at the top of the reading order. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(320px,1.4fr)_1fr] gap-4 items-start">
        <PlayerPanel
          player="p1"
          match={state.players.p1}
          round={state.roundPlayers.p1}
          side="left"
          progression={state.phase === "progression" ? state.progression?.p1 : null}
        />

        <div className="space-y-3 order-first lg:order-none">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="tabular-nums">Round {state.round}</Badge>
            <SharedTimer state={state} />
            <Badge variant="outline" className="text-muted-foreground">Ranked 1v1 · Mock</Badge>
          </div>

          {state.phase === "progression" ? (
            <ProgressionPanel state={state} dispatch={dispatch} />
          ) : state.phase === "reveal" && state.lastResult ? (
            <RevealPanel state={state} result={state.lastResult} dispatch={dispatch} />
          ) : (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <p className="font-semibold text-center" data-testid="question-prompt">
                {question.prompt}
              </p>
              <ul className="grid gap-2" aria-label="Answer choices">
                {question.choices.map((choice, i) => (
                  <li
                    key={i}
                    className="rounded-lg border px-3 py-2 text-sm bg-background/50"
                  >
                    <span className="font-bold mr-1.5">{CHOICE_LABELS[i]}.</span>
                    {choice}
                  </li>
                ))}
              </ul>
              {state.phase === "awaiting_reveal" && (
                <p
                  className="text-center text-sm font-medium animate-pulse motion-reduce:animate-none"
                  data-testid="awaiting-reveal"
                >
                  Resolving round…
                </p>
              )}
            </div>
          )}
        </div>

        <PlayerPanel
          player="p2"
          match={state.players.p2}
          round={state.roundPlayers.p2}
          side="right"
          progression={state.phase === "progression" ? state.progression?.p2 : null}
        />
      </div>

      <CombatLog log={state.log} />
      <OperatorPanel state={state} question={question} dispatch={dispatch} />
    </div>
  );
}
