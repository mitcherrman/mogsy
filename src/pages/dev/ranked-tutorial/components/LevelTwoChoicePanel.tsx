import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Lock } from "lucide-react";
import { TutorialEvent } from "../types";
import { TANK_LEVEL_TWO_OPTIONS, tankLevelThreeUnlock } from "../fixtures";

/**
 * Level 2 permanent choice: pick Brace or Barrier, review inline, confirm
 * explicitly. After confirmation the panel becomes the selected-kit summary.
 */
export function LevelTwoChoicePanel({
  pendingId,
  chosenId,
  dispatch,
}: {
  pendingId: string | null;
  chosenId: string | null;
  dispatch: (event: TutorialEvent) => void;
}) {
  if (chosenId) {
    const chosen = TANK_LEVEL_TWO_OPTIONS.find((a) => a.id === chosenId)!;
    const other = tankLevelThreeUnlock(chosenId)!;
    return (
      <section
        aria-label="Level 2 choice confirmed"
        data-testid="level-two-summary"
        tabIndex={-1}
        className="rounded-xl border-2 border-emerald-600/50 bg-card p-4 space-y-2"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
          <h3 className="text-sm font-bold">Choice locked: {chosen.name}</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {chosen.name} is unlocked for the rest of this match. This choice is
          permanent.
        </p>
        <div className="flex items-center gap-2 text-sm">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <span data-testid="level-two-locked-other">
            {other.name} stays locked until Level 3 unlocks it automatically.
          </span>
        </div>
      </section>
    );
  }

  const pending = TANK_LEVEL_TWO_OPTIONS.find((a) => a.id === pendingId) ?? null;
  return (
    <section
      aria-label="Level 2 choice"
      data-testid="level-two-choice"
      className="rounded-xl border-2 border-violet-500/50 bg-card p-4 space-y-3"
    >
      <h3 className="text-sm font-bold">Choose one ability — permanent for this match</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {TANK_LEVEL_TWO_OPTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={pendingId === a.id}
            onClick={() => dispatch({ type: "CHOOSE_LEVEL_TWO", abilityId: a.id })}
            data-testid={`choose-${a.id}`}
            className={`rounded-lg border p-3 text-left space-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              pendingId === a.id ? "border-primary ring-2 ring-primary/50" : "border-border"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{a.name}</span>
              <Badge variant="outline" className="text-[10px] tabular-nums">
                {a.charges} charge{a.charges === 1 ? "" : "s"}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {a.description}
            </p>
            {pendingId === a.id && (
              <Badge className="text-[10px]">Selected — not confirmed yet</Badge>
            )}
          </button>
        ))}
      </div>
      {pending && (
        <div
          className="rounded-lg border bg-background/60 p-3 space-y-2"
          data-testid="level-two-review"
        >
          <p className="text-sm">
            You are choosing <span className="font-semibold">{pending.name}</span>.
            The other ability stays locked until Level 3. Your choice is
            permanent for this match.
          </p>
          <Button
            onClick={() => dispatch({ type: "CONFIRM_LEVEL_TWO" })}
            data-testid="confirm-level-two"
          >
            Confirm {pending.name} — permanent
          </Button>
        </div>
      )}
    </section>
  );
}
