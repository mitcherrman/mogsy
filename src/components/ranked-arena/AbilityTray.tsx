/**
 * Canonical ability tray (F1 Phase C1). Fully controlled and roster-neutral:
 * abilities arrive as AbilityView props (any class, any count — no hardcoded
 * roster import), selection is externally owned, and the tray emits only the
 * chosen ability id (or null for the explicit no-ability option). It never
 * consumes charges, never decides whether an ability triggers, and shows only
 * the viewer's OWN abilities — opponent ability content never reaches these
 * props pre-reveal.
 *
 * Presentation (RA10): a compact game hotbar — per slot an art tile with a
 * keycap index, the ability name, charge pips and the state marker. The full
 * effect text is demoted to hover (`title`) and screen readers (sr-only); the
 * one visible caption line is reserved for the availability reason when the
 * ability cannot be armed. Art comes from the local abilityArt registry, so
 * this component hardcodes no visuals and unknown ids still get a sigil.
 * Layout/density only; the roster, gating, and emitted ids are unchanged.
 */
import { Lock } from "lucide-react";
import { AbilityView, InteractionPermissions } from "@/lib/ranked-core/viewTypes";
import { abilityGlyphFor, clearAbilityGlyph as ClearGlyph } from "./abilityArt";

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

/** Small rune-pip row for remaining charges (visual only; sr text carries the
 * count). Rotated squares read as the academy's gem marks, not meter dots. */
function ChargePips({ count }: { count: number }) {
  const pips = Math.min(count, 5);
  return (
    <span aria-hidden className="flex items-center gap-[3px]">
      {Array.from({ length: pips }).map((_, i) => (
        <span key={i} className="h-1.5 w-1.5 rotate-45 rounded-[1px] bg-[#f0d78c] shadow-[0_0_4px_rgba(240,215,140,0.5)]" />
      ))}
      {count > 5 && <span className="text-[9px] font-bold leading-none text-[#f0d78c]">+</span>}
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
    <section aria-label="Abilities" data-testid="ability-tray" className="ability-hotbar-host space-y-1.5">
      <div className="flex items-baseline justify-between">
        <h3 className="ranked-eyebrow ranked-eyebrow--cyan">Ability Hotbar</h3>
        {trayReason && (
          <span className="text-[11px] text-muted-foreground" data-testid="ability-tray-reason">
            {trayReason}
          </span>
        )}
      </div>

      {/* Hotbar: one compact control strip. Column count follows the TRAY's
          own width (see .ability-hotbar-grid): two-up when narrow, one
          four-across row once each slot can hold art + name comfortably. */}
      <div className="ability-hotbar-grid">
        {abilities.map((ability, i) => {
          const disabled = abilityDisabled(ability);
          const charges = chargesText(ability);
          const Glyph = abilityGlyphFor(ability.id);
          const state = !ability.unlocked
            ? "locked-progression"
            : ability.exhausted
              ? "exhausted"
              : ability.locked
                ? "locked-round"
                : ability.selected
                  ? "selected"
                  : "available";
          const dimmedArt = state === "locked-progression" || state === "exhausted";
          return (
            <button
              key={ability.id}
              type="button"
              aria-pressed={ability.selected}
              disabled={disabled}
              data-testid={`ability-${ability.id}`}
              data-ability-state={state}
              onClick={() => onSelectAbility(ability.id)}
              // Full effect text lives on hover/long-press and in the sr-only
              // line below; the visible slot is icon + name + state.
              title={ability.description}
              className={`group relative flex min-h-[3.5rem] items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-55 ${
                ability.selected
                  ? "border-[#f0d78c] bg-[#c9a84c]/15 shadow-[0_0_16px_-6px_rgba(201,168,76,0.7),inset_0_0_0_1px_rgba(240,215,140,0.4)]"
                  : "border-white/10 bg-white/[0.03] enabled:hover:border-[#7fd6ef]/45 enabled:hover:bg-white/[0.05]"
              }`}
            >
              {/* Art tile with the keycap index pinned to its corner. */}
              <span
                aria-hidden
                className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition-colors motion-reduce:transition-none ${
                  ability.selected
                    ? "border-[#f0d78c]/70 bg-gradient-to-b from-[#3d3014] to-[#241c0b] text-[#f6e2a4]"
                    : "border-white/12 bg-gradient-to-b from-[#16283f] to-[#0a1626] text-[#d8c58e] group-enabled:group-hover:text-[#efe3bd]"
                }`}
              >
                <Glyph className={`h-6 w-6 ${dimmedArt ? "opacity-45" : ""}`} />
                <span
                  className={`absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-[4px] text-[10px] font-black tabular-nums shadow-[0_1px_2px_rgba(0,0,0,0.6)] ${
                    ability.selected ? "bg-[#f0d78c] text-[#2a1f08]" : "bg-[#1d2c42] text-white/70 ring-1 ring-white/15"
                  }`}
                >
                  {i + 1}
                </span>
                {(state === "locked-progression" || state === "locked-round") && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-md bg-[#040a14]/55">
                    <Lock className="h-3.5 w-3.5 text-white/65" />
                  </span>
                )}
              </span>

              {/* Name + one quiet line: pips, or why the slot is unavailable. */}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-bold leading-tight">{ability.name}</span>
                {ability.unavailableReason ? (
                  <span className="truncate text-[10px] leading-tight text-muted-foreground" role="note">
                    {ability.unavailableReason}
                  </span>
                ) : charges ? (
                  <span className="flex h-3 items-center">
                    <ChargePips count={ability.remainingCharges ?? 0} />
                    <span className="sr-only">{charges}</span>
                  </span>
                ) : (
                  <span className="h-3" aria-hidden />
                )}
              </span>

              {/* Reserved marker slot. The "Armed" pill used to appear from
                  nothing on selection, stealing width from the name beside it
                  and re-truncating it mid-round. From sm the slot is always
                  this wide, so arming changes only what is drawn; below sm the
                  slot is hidden entirely (constant, state-independent) and the
                  armed/locked state reads from the tile treatment instead. */}
              <span className="ml-auto hidden w-[3.25rem] shrink-0 items-center justify-end sm:flex">
                {state === "selected" && !ability.locked && (
                  <span className="rounded bg-[#f0d78c] px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#2a1f08]">
                    Armed
                  </span>
                )}
                {state === "selected" && ability.locked && (
                  <Lock className="h-3.5 w-3.5 text-[#f0d78c]" aria-hidden />
                )}
              </span>

              <span className="sr-only">{ability.description}</span>
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
          title="Submit this round without arming an ability."
          className={`group relative flex min-h-[3.5rem] items-center gap-2 rounded-lg border border-dashed px-2 py-1.5 text-left transition-all motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-55 ${
            selectedAbilityId === null
              ? "border-[#f0d78c] bg-[#c9a84c]/12 shadow-[inset_0_0_0_1px_rgba(240,215,140,0.35)]"
              : "border-white/15 bg-transparent enabled:hover:border-white/30"
          }`}
        >
          <span
            aria-hidden
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed transition-colors motion-reduce:transition-none ${
              selectedAbilityId === null
                ? "border-[#f0d78c]/60 text-[#f0d78c]"
                : "border-white/20 text-white/45 group-enabled:group-hover:text-white/65"
            }`}
          >
            <ClearGlyph className="h-5 w-5" />
            <span className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-[4px] bg-[#1d2c42] text-[10px] font-black text-white/70 ring-1 ring-white/15 shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
              —
            </span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px] font-bold leading-tight">{noAbilityLabel}</span>
            <span className="truncate text-[10px] leading-tight text-muted-foreground">
              Answer without an ability.
            </span>
          </span>
          <span className="ml-auto hidden w-[3.25rem] shrink-0 items-center justify-end sm:flex">
            {selectedAbilityId === null && (
              <span className="rounded bg-[#f0d78c] px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#2a1f08]">
                Chosen
              </span>
            )}
          </span>
          <span className="sr-only">Submit this round without arming an ability.</span>
        </button>
      </div>
    </section>
  );
}
