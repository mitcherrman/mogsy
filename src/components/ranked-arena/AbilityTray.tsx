/**
 * Canonical ability tray (F1 Phase C1). Fully controlled and roster-neutral:
 * abilities arrive as AbilityView props (any class, any count — no hardcoded
 * roster import), selection is externally owned, and the tray emits only the
 * chosen ability id (or null for the explicit no-ability option). It never
 * consumes charges, never decides whether an ability triggers, and shows only
 * the viewer's OWN abilities — opponent ability content never reaches these
 * props pre-reveal.
 *
 * Presentation (F1 arena layout): a League-style combat HOTBAR — a horizontal
 * row of slots (keycap index, name, charge pips, strong armed/locked/exhausted
 * states) plus the explicit no-ability slot. Layout/density only; the roster,
 * gating, and emitted ids are unchanged.
 */
import { Lock } from "lucide-react";
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

/** Small pip row for remaining charges (visual only; sr text carries the count). */
function ChargePips({ count }: { count: number }) {
  const pips = Math.min(count, 5);
  return (
    <span aria-hidden className="flex items-center gap-0.5">
      {Array.from({ length: pips }).map((_, i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-[#f0d78c]" />
      ))}
      {count > 5 && <span className="text-[9px] font-bold text-[#f0d78c]">+</span>}
    </span>
  );
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
        <h3 className="ranked-eyebrow ranked-eyebrow--cyan">Ability Hotbar</h3>
        {trayReason && (
          <span className="text-[11px] text-muted-foreground" data-testid="ability-tray-reason">
            {trayReason}
          </span>
        )}
      </div>

      {/* Hotbar: horizontal slots on wider screens, 2-up on mobile. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {abilities.map((ability, i) => {
          const disabled = abilityDisabled(ability);
          const charges = chargesText(ability);
          const state = !ability.unlocked
            ? "locked-progression"
            : ability.exhausted
              ? "exhausted"
              : ability.locked
                ? "locked-round"
                : ability.selected
                  ? "selected"
                  : "available";
          return (
            <button
              key={ability.id}
              type="button"
              aria-pressed={ability.selected}
              disabled={disabled}
              data-testid={`ability-${ability.id}`}
              data-ability-state={state}
              onClick={() => onSelectAbility(ability.id)}
              className={`group relative flex min-h-[76px] flex-col rounded-lg border p-2.5 text-left transition-all motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-55 ${
                ability.selected
                  ? "border-[#f0d78c] bg-[#c9a84c]/15 shadow-[0_0_20px_-6px_rgba(201,168,76,0.7),inset_0_0_0_1px_rgba(240,215,140,0.4)]"
                  : "border-white/10 bg-white/[0.03] enabled:hover:border-[#7fd6ef]/45 enabled:hover:bg-white/[0.05]"
              }`}
            >
              {/* Keycap slot index + state marker */}
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] text-[10px] font-black tabular-nums ${
                    ability.selected ? "bg-[#f0d78c] text-[#2a1f08]" : "bg-white/10 text-white/60"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="truncate text-sm font-bold">{ability.name}</span>
                <span className="ml-auto flex shrink-0 items-center">
                  {state === "selected" && !ability.locked && (
                    <span className="rounded bg-[#f0d78c] px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#2a1f08]">
                      Armed
                    </span>
                  )}
                  {state === "selected" && ability.locked && (
                    <Lock className="h-3.5 w-3.5 text-[#f0d78c]" aria-hidden />
                  )}
                  {(state === "locked-progression" || state === "locked-round") && (
                    <Lock className="h-3.5 w-3.5 text-white/35" aria-hidden />
                  )}
                </span>
              </div>

              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                {ability.description}
              </p>

              <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
                {charges ? (
                  <span className="flex items-center gap-1">
                    <ChargePips count={ability.remainingCharges ?? 0} />
                    <span className="sr-only">{charges}</span>
                    <span aria-hidden className="text-[10px] font-semibold tabular-nums text-[#e8c97a]/80">
                      {ability.remainingCharges} left
                    </span>
                  </span>
                ) : (
                  <span />
                )}
                {ability.unavailableReason && (
                  <span className="truncate text-right text-[10px] text-muted-foreground" role="note">
                    {ability.unavailableReason}
                  </span>
                )}
              </div>
            </button>
          );
        })}

        {/* Explicit no-ability slot. */}
        <button
          type="button"
          aria-pressed={selectedAbilityId === null}
          disabled={!permissions.canSelectAbility}
          data-testid="ability-none"
          data-ability-state={selectedAbilityId === null ? "selected" : "available"}
          onClick={() => onSelectAbility(null)}
          className={`group relative flex min-h-[76px] flex-col rounded-lg border border-dashed p-2.5 text-left transition-all motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-55 ${
            selectedAbilityId === null
              ? "border-[#f0d78c] bg-[#c9a84c]/12 shadow-[inset_0_0_0_1px_rgba(240,215,140,0.35)]"
              : "border-white/15 bg-transparent enabled:hover:border-white/30"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] bg-white/10 text-[10px] font-black text-white/60">
              —
            </span>
            <span className="truncate text-sm font-bold">{noAbilityLabel}</span>
            {selectedAbilityId === null && (
              <span className="ml-auto rounded bg-[#f0d78c] px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#2a1f08]">
                Chosen
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Submit this round without arming an ability.
          </p>
        </button>
      </div>
    </section>
  );
}
