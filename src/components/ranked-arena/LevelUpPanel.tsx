/**
 * Canonical level-progression panel (F1 Phase C2). Two externally supplied
 * events, no class assumptions:
 *
 * - "level2-choice": a permanent one-of-N ability choice. Options, pending
 *   and confirmed state all come from props; selecting/confirming emit
 *   intents only — progression never mutates locally. A pending choice can
 *   gate the next round (backend rule), which this panel states when told to.
 * - "level3-unlock": presentation-only announcement of the automatic unlock.
 *
 * No tutorial copy lives here; directors layer their own instruction around
 * the panel and drive it through permissions.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Lock } from "lucide-react";
import {
  InteractionPermissions,
  LevelUpOptionView,
} from "@/lib/ranked-core/viewTypes";

export type LevelUpEventView =
  | {
      kind: "level2-choice";
      options: LevelUpOptionView[];
      /** Option highlighted for confirmation; null = none picked yet. */
      pendingOptionId: string | null;
      /** Non-null once the backend confirmed the permanent choice. */
      confirmedOptionId: string | null;
    }
  | {
      kind: "level3-unlock";
      ability: LevelUpOptionView;
    };

export interface LevelUpPanelProps {
  event: LevelUpEventView;
  permissions: InteractionPermissions;
  onSelectOption?: (optionId: string) => void;
  onConfirmOption?: () => void;
  /** Whether the backend is gating the next round on this choice. */
  gatesNextRound?: boolean;
}

export function LevelUpPanel({
  event,
  permissions,
  onSelectOption,
  onConfirmOption,
  gatesNextRound = false,
}: LevelUpPanelProps) {
  if (event.kind === "level3-unlock") {
    return (
      <section
        aria-label="Level 3 unlock"
        data-testid="level-up-panel"
        data-kind="level3-unlock"
        className="rounded-xl border-2 border-violet-500/60 bg-card p-4 space-y-1"
      >
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4 text-violet-400" aria-hidden />
          Level 3 — {event.ability.name} unlocked automatically
        </div>
        <p className="text-xs text-muted-foreground">{event.ability.description}</p>
      </section>
    );
  }

  const { options, pendingOptionId, confirmedOptionId } = event;
  const confirmed = options.find((o) => o.id === confirmedOptionId) ?? null;
  const selectReason = permissions.disabledReasons?.levelUpChoice;

  if (confirmed) {
    return (
      <section
        aria-label="Level 2 choice"
        data-testid="level-up-panel"
        data-kind="level2-choice"
        className="rounded-xl border-2 border-primary/50 bg-card p-4 space-y-1"
      >
        <div role="status" className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Level 2 ability chosen: {confirmed.name}
        </div>
        <p className="text-xs text-muted-foreground">
          This choice is permanent for the match.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Level 2 choice"
      data-testid="level-up-panel"
      data-kind="level2-choice"
      className="rounded-xl border-2 border-border bg-card p-4 space-y-3"
    >
      <header className="space-y-1">
        <h3 className="font-semibold">Choose your Level 2 ability</h3>
        <p className="text-xs text-muted-foreground">
          This choice is permanent for the match.
          {gatesNextRound && " The next round starts after you choose."}
        </p>
        {selectReason && (
          <p className="text-[11px] text-muted-foreground" role="note">
            {selectReason}
          </p>
        )}
      </header>
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Level 2 options">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={pendingOptionId === option.id}
            disabled={!permissions.canSelectAbility}
            data-testid={`level-option-${option.id}`}
            onClick={() => onSelectOption?.(option.id)}
            className={`min-h-[44px] rounded-lg border-2 p-3 text-left transition-colors motion-reduce:transition-none disabled:opacity-60 ${
              pendingOptionId === option.id
                ? "border-primary bg-primary/10"
                : "border-border bg-card"
            }`}
          >
            <span className="font-semibold text-sm">{option.name}</span>
            <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
          </button>
        ))}
      </div>
      <Button
        type="button"
        data-testid="level-confirm"
        disabled={!permissions.canConfirmSubmission || pendingOptionId === null}
        onClick={() => onConfirmOption?.()}
        className="w-full min-h-[44px]"
      >
        <Lock className="h-4 w-4 mr-1" aria-hidden />
        Confirm permanent choice
      </Button>
    </section>
  );
}
