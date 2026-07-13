import { Dispatch } from "react";
import { Button } from "@/components/ui/button";
import { Trophy } from "lucide-react";
import { MOCK_PLAYERS, PlayerId, getDuelClass } from "./fixtures";
import { DuelAction, DuelState } from "./duelMachine";

export function MatchOverScreen({
  state,
  dispatch,
}: {
  state: DuelState;
  dispatch: Dispatch<DuelAction>;
}) {
  if (!state.players || !state.winner) return null;
  const winner = state.winner;

  return (
    <div className="max-w-xl mx-auto space-y-4 text-center" data-testid="match-over">
      <div className="rounded-xl border-2 border-primary/50 bg-card p-6 space-y-2">
        <Trophy className="h-10 w-10 mx-auto text-amber-500" aria-hidden />
        <h2 className="text-2xl font-bold">{MOCK_PLAYERS[winner].name} wins!</h2>
        <p className="text-sm text-muted-foreground">
          Match decided after {state.round} round{state.round === 1 ? "" : "s"}.
        </p>
        {state.log.length > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="final-round-summary">
            Final round: {state.log[state.log.length - 1].summary}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
        {(["p1", "p2"] as PlayerId[]).map((p) => {
          const m = state.players![p];
          return (
            <div
              key={p}
              className={`rounded-xl border p-4 ${p === winner ? "border-amber-500/60" : ""}`}
            >
              <div className="font-bold">{MOCK_PLAYERS[p].name}</div>
              <div className="text-xs text-muted-foreground mb-2">{getDuelClass(m.classId).name}</div>
              <dl className="text-sm space-y-1 tabular-nums">
                <div className="flex justify-between"><dt>Final HP</dt><dd>{m.hp} / {m.maxHp}</dd></div>
                <div className="flex justify-between"><dt>Level</dt><dd>{m.level}</dd></div>
                <div className="flex justify-between"><dt>XP</dt><dd>{m.xp}</dd></div>
              </dl>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        {/* Primary next action: run it back with the same classes. */}
        <Button size="lg" onClick={() => dispatch({ type: "RESTART_SAME_CLASSES" })}>
          Rematch — same classes
        </Button>
        <Button size="lg" variant="outline" onClick={() => dispatch({ type: "BACK_TO_SETUP" })}>
          Back to setup
        </Button>
      </div>
    </div>
  );
}
