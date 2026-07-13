import { Dispatch } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Hourglass, Sparkles, Unlock } from "lucide-react";
import {
  MOCK_PLAYERS,
  PlayerId,
  finalNormalAbility,
  findClassAbility,
  getDuelClass,
} from "./fixtures";
import {
  DuelAction,
  DuelState,
  progressionChoicesComplete,
} from "./duelMachine";

const PLAYER_IDS: PlayerId[] = ["p1", "p2"];

/**
 * Center-column presentation of a progression stop (phase === "progression").
 *
 * While any required Level 2 choice is unresolved, this panel shows only
 * NEUTRAL per-player statuses — the actual picks live in the operator
 * controls. Once every required choice is confirmed, all newly unlocked
 * abilities (Level 2 picks and Level 3 final-normal unlocks) reveal
 * together, and only then can the next round begin.
 */
export function ProgressionPanel({
  state,
  dispatch,
}: {
  state: DuelState;
  dispatch: Dispatch<DuelAction>;
}) {
  const progression = state.progression;
  if (!progression || !state.players) return null;
  const complete = progressionChoicesComplete(progression);
  const leveledPlayers = PLAYER_IDS.filter((p) => progression[p].newLevel !== null);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3" data-testid="progression-panel">
      <h3 className="font-bold text-center flex items-center justify-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-400" aria-hidden />
        Level up!
      </h3>

      {!complete ? (
        <>
          {/* Neutral statuses only — picks stay hidden until the shared reveal. */}
          <ul className="space-y-2" data-testid="progression-status-list">
            {leveledPlayers.map((p) => {
              const prog = progression[p];
              const cls = getDuelClass(state.players![p].classId);
              return (
                <li key={p} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  <span className="font-semibold">{MOCK_PLAYERS[p].name}</span>
                  <Badge variant="outline" className="tabular-nums">
                    {cls.name} · Lv {prog.newLevel}
                  </Badge>
                  {prog.needsChoice ? (
                    prog.confirmed ? (
                      <Badge className="ml-auto gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
                        <CheckCircle2 className="h-3 w-3" aria-hidden /> Ability chosen — Ready
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="ml-auto gap-1">
                        <Hourglass className="h-3 w-3" aria-hidden /> Choosing ability
                      </Badge>
                    )
                  ) : (
                    <Badge variant="secondary" className="ml-auto">Ready</Badge>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-center text-muted-foreground">
            Waiting for all ability choices — make picks in the dev controls below. Choices reveal
            together once everyone is ready.
          </p>
        </>
      ) : (
        <>
          {/* Shared unlock reveal: everything unlocked this stop, together. */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            data-testid="progression-reveal"
          >
            {leveledPlayers.map((p) => {
              const prog = progression[p];
              const cls = getDuelClass(state.players![p].classId);
              const chosen = findClassAbility(cls, prog.selectedAbilityId);
              // The final normal = the Level 2 option this player did NOT
              // pick (committed earlier, or picked in this same stop).
              const finalAbility = prog.finalAbilityUnlocked
                ? finalNormalAbility(
                    cls,
                    state.players![p].chosenLevelTwoAbilityId ?? prog.selectedAbilityId,
                  )
                : undefined;
              return (
                <div key={p} className="rounded-lg border p-3 space-y-2" data-testid={`progression-reveal-${p}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{MOCK_PLAYERS[p].name}</span>
                    <Badge variant="outline" className="tabular-nums">
                      {cls.name} · Lv {prog.newLevel}
                    </Badge>
                  </div>
                  {chosen && (
                    <div className="rounded-md border border-primary/50 bg-primary/10 p-2">
                      <div className="text-sm font-semibold flex items-center gap-1.5">
                        {chosen.name}
                        <Badge variant="outline" className="text-[10px]">Normal · Lv2</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{chosen.description}</p>
                    </div>
                  )}
                  {finalAbility && (
                    <div
                      className="rounded-md border-2 border-violet-500/70 bg-violet-500/10 p-2"
                      data-testid={`final-unlock-${p}`}
                    >
                      <div className="text-sm font-bold flex items-center gap-1.5">
                        <Unlock className="h-4 w-4 text-violet-400" aria-hidden />
                        {finalAbility.name}
                        <Badge className="text-[10px] bg-violet-600 text-white hover:bg-violet-600">
                          Normal · Lv3
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Final normal ability — unlocked automatically at Level 3.{" "}
                        {finalAbility.description}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="text-center">
            <Button onClick={() => dispatch({ type: "CONTINUE_AFTER_PROGRESSION" })}>
              Continue to next round
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
