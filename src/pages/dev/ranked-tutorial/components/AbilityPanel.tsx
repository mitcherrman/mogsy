import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, Zap } from "lucide-react";
import { RoundState, TutorialEvent } from "../types";
import { TANK_LEVEL_TWO_OPTIONS, TANK_STARTER, TutorialAbility } from "../fixtures";

const ALL_ABILITIES: TutorialAbility[] = [TANK_STARTER, ...TANK_LEVEL_TWO_OPTIONS];

/**
 * Tutorial-owned Tank kit panel: every normal ability with unlock state,
 * remaining charges, and (when a round is in its selection phase) arm
 * buttons including the explicit "No ability" option. No ultimate slot —
 * ultimates do not exist in the verified contract.
 */
export function AbilityPanel({
  charges,
  unlockedIds,
  chosenLevelTwoAbilityId,
  playerLevel,
  round,
  interactive,
  dispatch,
}: {
  charges: Record<string, number>;
  unlockedIds: string[];
  chosenLevelTwoAbilityId: string | null;
  playerLevel: number;
  round: RoundState | null;
  interactive: boolean;
  dispatch: (event: TutorialEvent) => void;
}) {
  const selecting = interactive && round?.phase === "selecting";
  const armedId = round?.playerAbilityId ?? null;

  const lockReason = (a: TutorialAbility): string | null => {
    if (unlockedIds.includes(a.id)) {
      return (charges[a.id] ?? 0) > 0 ? null : "No charges left";
    }
    if (a.id === TANK_STARTER.id) return null;
    if (!chosenLevelTwoAbilityId) return "Unlocks with the Level 2 choice";
    if (a.id !== chosenLevelTwoAbilityId && playerLevel < 3)
      return "Not chosen — unlocks automatically at Level 3";
    return "Locked";
  };

  return (
    <section
      aria-label="Your abilities"
      data-testid="ability-panel"
      className="rounded-xl border-2 border-border bg-card p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Your abilities</h3>
        {selecting && (
          <Button
            variant={armedId === null ? "secondary" : "outline"}
            size="sm"
            aria-pressed={armedId === null}
            onClick={() => dispatch({ type: "SELECT_ABILITY", abilityId: null })}
            data-testid="ability-none"
          >
            No ability
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {ALL_ABILITIES.map((a) => {
          const reason = lockReason(a);
          const unlocked = unlockedIds.includes(a.id);
          const remaining = charges[a.id] ?? 0;
          const armed = armedId === a.id;
          const exhausted = unlocked && remaining <= 0;
          return (
            <div
              key={a.id}
              className={`rounded-lg border p-2.5 space-y-1.5 ${
                armed ? "border-primary ring-2 ring-primary/50" : "border-border"
              } ${!unlocked || exhausted ? "opacity-75" : ""}`}
              data-testid={`ability-card-${a.id}`}
            >
              <div className="flex items-center gap-1.5">
                {unlocked && !exhausted ? (
                  <Zap className="h-3.5 w-3.5 text-primary" aria-hidden />
                ) : (
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                )}
                <span className="text-sm font-semibold">{a.name}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {a.description}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] tabular-nums">
                  {unlocked
                    ? `${remaining} of ${a.charges} charge${a.charges === 1 ? "" : "s"} left`
                    : `${a.charges} charge${a.charges === 1 ? "" : "s"}`}
                </Badge>
                {reason ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {reason}
                  </Badge>
                ) : armed ? (
                  <Badge className="text-[10px]" data-testid={`ability-armed-${a.id}`}>
                    {round?.phase === "locked" ? "Armed · locked" : "Armed"}
                  </Badge>
                ) : null}
              </div>
              {selecting && !reason && (
                <Button
                  size="sm"
                  variant={armed ? "default" : "outline"}
                  aria-pressed={armed}
                  onClick={() => dispatch({ type: "SELECT_ABILITY", abilityId: a.id })}
                  data-testid={`arm-${a.id}`}
                >
                  {armed ? "Armed" : "Arm"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
