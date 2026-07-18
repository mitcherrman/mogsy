/**
 * Canonical ability tray (F1 Phase C1). Fully controlled and roster-neutral:
 * abilities arrive as AbilityView props (any class, any count — no hardcoded
 * roster import), selection is externally owned, and the tray emits only the
 * chosen ability id (or null for the explicit no-ability option). It never
 * consumes charges, never decides whether an ability triggers, and shows only
 * the viewer's OWN abilities — opponent ability content never reaches these
 * props pre-reveal.
 */
import { Badge } from "@/components/ui/badge";
import { AbilityView, InteractionPermissions } from "@/lib/ranked-core/viewTypes";

export interface AbilityTrayProps {
  abilities: AbilityView[];
  /** null = the explicit no-ability choice (a valid, deliberate state). */
  selectedAbilityId: string | null;
  permissions: InteractionPermissions;
  onSelectAbility: (abilityId: string | null) => void;
  /** Controller-supplied copy for the no-ability option. */
  noAbilityLabel?: string;
}

function chargesText(ability: AbilityView): string | null {
  if (ability.remainingCharges === null) return null;
  return `${ability.remainingCharges} charge${ability.remainingCharges === 1 ? "" : "s"} left`;
}

export function AbilityTray({
  abilities,
  selectedAbilityId,
  permissions,
  onSelectAbility,
  noAbilityLabel = "No ability",
}: AbilityTrayProps) {
  const trayReason = permissions.disabledReasons?.ability;

  const abilityDisabled = (ability: AbilityView): boolean =>
    !permissions.canSelectAbility || !ability.unlocked || ability.exhausted || ability.locked;

  return (
    <section aria-label="Abilities" data-testid="ability-tray" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ability
        </h3>
        {trayReason && (
          <span className="text-[11px] text-muted-foreground" data-testid="ability-tray-reason">
            {trayReason}
          </span>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {abilities.map((ability) => {
          const disabled = abilityDisabled(ability);
          const charges = chargesText(ability);
          return (
            <button
              key={ability.id}
              type="button"
              aria-pressed={ability.selected}
              disabled={disabled}
              data-testid={`ability-${ability.id}`}
              data-ability-state={
                !ability.unlocked
                  ? "locked-progression"
                  : ability.exhausted
                    ? "exhausted"
                    : ability.locked
                      ? "locked-round"
                      : ability.selected
                        ? "selected"
                        : "available"
              }
              onClick={() => onSelectAbility(ability.id)}
              className={`min-h-[44px] rounded-lg border-2 p-3 text-left transition-colors motion-reduce:transition-none disabled:opacity-60 ${
                ability.selected ? "border-primary bg-primary/10" : "border-border bg-card"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{ability.name}</span>
                {ability.selected && !ability.locked && (
                  <Badge variant="default" className="text-[10px]">
                    Armed
                  </Badge>
                )}
                {ability.selected && ability.locked && (
                  <Badge variant="default" className="text-[10px]">
                    Armed · locked
                  </Badge>
                )}
                {charges && (
                  <Badge variant="outline" className="ml-auto shrink-0 text-[10px] tabular-nums">
                    {charges}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{ability.description}</p>
              {ability.unavailableReason && (
                <p className="mt-1 text-[11px] text-muted-foreground" role="note">
                  {ability.unavailableReason}
                </p>
              )}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={selectedAbilityId === null}
          disabled={!permissions.canSelectAbility}
          data-testid="ability-none"
          data-ability-state={selectedAbilityId === null ? "selected" : "available"}
          onClick={() => onSelectAbility(null)}
          className={`min-h-[44px] rounded-lg border-2 border-dashed p-3 text-left transition-colors motion-reduce:transition-none disabled:opacity-60 ${
            selectedAbilityId === null ? "border-primary bg-primary/10" : "border-border bg-card"
          }`}
        >
          <span className="font-semibold text-sm">{noAbilityLabel}</span>
          <p className="mt-1 text-xs text-muted-foreground">
            Submit this round without arming an ability.
          </p>
        </button>
      </div>
    </section>
  );
}
