/**
 * Canonical ability tray (F1 Phase C1). Fully controlled and roster-neutral:
 * abilities arrive as AbilityView props (any class, any count — no hardcoded
 * roster import), selection is externally owned, and the tray emits only the
 * chosen ability id (or null for the explicit no-ability option). It never
 * consumes charges, never decides whether an ability triggers, and shows only
 * the viewer's OWN abilities — opponent ability content never reaches these
 * props pre-reveal.
 *
 * Presentation (RA11): ONE connected dock — a spellbook-spine artifact —
 * instead of a panel of separate cards. The `.ability-spine` frame in
 * index.css owns the silhouette (leather-dark backing, brass edge) and the
 * 1px binding ribs between slots; the slots themselves are adjacent
 * compartments with no borders or rounding of their own, so the whole bar
 * reads as a single bound object. Per slot: an art tile with a keycap index,
 * the ability name, charge pips and the state marker. The full effect text
 * stays on hover (`title`) and screen readers (sr-only); the one visible
 * caption line is reserved for the availability reason when the ability
 * cannot be armed. Art (and the family tile tint) comes from the local
 * abilityArt registry, so this component hardcodes no visuals and unknown ids
 * still get a sigil. Layout/density only; the roster, gating, and emitted ids
 * are unchanged.
 */
import { Lock } from "lucide-react";
import { AbilityView, InteractionPermissions } from "@/lib/ranked-core/viewTypes";
import {
  abilityGlyphFor, abilityTileAccentFor, clearAbilityGlyph as ClearGlyph,
} from "./abilityArt";

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

/* Shared compartment skeleton. No border/rounding utilities here — the spine
   frame and its position-based ribs (index.css) own all slot geometry, so no
   state change can move a separator. Disabled dimming is applied to the slot
   CONTENT (group-disabled) rather than the button box, keeping the ribs and
   the dock silhouette crisp next to a spent slot. */
const SLOT_BASE =
  "ability-spine-slot group relative flex min-h-[3.25rem] items-center gap-2.5 px-2.5 py-1.5 " +
  "text-left transition-[background-color,box-shadow] motion-reduce:transition-none " +
  "disabled:cursor-not-allowed";
const SLOT_CONTENT_DIM = "group-disabled:opacity-55";

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
    <section aria-label="Abilities" data-testid="ability-tray" className="ability-hotbar-host">
      <div className="mb-1.5 flex items-baseline justify-between px-0.5">
        <h3 className="ranked-eyebrow ranked-eyebrow--cyan">Ability Hotbar</h3>
        {trayReason && (
          <span className="text-[11px] text-muted-foreground" data-testid="ability-tray-reason">
            {trayReason}
          </span>
        )}
      </div>

      {/* The bound artifact: one continuous spine with adjacent compartments.
          Column count follows the TRAY's container (see .ability-spine-grid):
          two-up when narrow, four-across once each slot holds art + name. */}
      <div className="ability-spine">
        <div className="ability-spine-grid">
          {abilities.map((ability, i) => {
            const disabled = abilityDisabled(ability);
            const charges = chargesText(ability);
            const Glyph = abilityGlyphFor(ability.id);
            const tileAccent = abilityTileAccentFor(ability.id);
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
                // Full effect text lives on hover/long-press and in the
                // sr-only line below; the visible slot is icon + name + state.
                title={ability.description}
                className={`${SLOT_BASE} ${
                  ability.selected
                    ? "bg-[#c9a84c]/[0.16] shadow-[inset_0_0_0_1px_rgba(240,215,140,0.5),inset_0_0_22px_-8px_rgba(201,168,76,0.65)]"
                    : "enabled:hover:bg-[#d5b66f]/[0.07]"
                }`}
              >
                {/* Art tile with the keycap index pinned to its corner. Inset
                    ring instead of a border so its box never changes. */}
                <span
                  aria-hidden
                  className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-[filter,color] motion-reduce:transition-none ${SLOT_CONTENT_DIM} ${
                    ability.selected
                      ? "bg-gradient-to-b from-[#3d3014] to-[#241c0b] text-[#f6e2a4] shadow-[inset_0_0_0_1px_rgba(240,215,140,0.55),0_0_10px_-2px_rgba(201,168,76,0.45)]"
                      : `${tileAccent} shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),inset_0_-9px_10px_-8px_rgba(0,0,0,0.7)] group-enabled:group-hover:brightness-110`
                  }`}
                >
                  <Glyph className={`h-7 w-7 ${dimmedArt ? "opacity-45" : ""}`} />
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
                <span className={`flex min-w-0 flex-1 flex-col gap-0.5 ${SLOT_CONTENT_DIM}`}>
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
                <span className={`ml-auto hidden w-[3.25rem] shrink-0 items-center justify-end sm:flex ${SLOT_CONTENT_DIM}`}>
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

          {/* Explicit no-ability slot: the spine's quiet fourth compartment —
              recessed and desaturated, never a detached card. */}
          <button
            type="button"
            aria-pressed={selectedAbilityId === null}
            disabled={!permissions.canSelectAbility}
            data-testid="ability-none"
            data-ability-state={selectedAbilityId === null ? "selected" : "available"}
            onClick={() => onSelectAbility(null)}
            title="Submit this round without arming an ability."
            className={`${SLOT_BASE} ${
              selectedAbilityId === null
                ? "bg-[#c9a84c]/[0.09] shadow-[inset_0_0_0_1px_rgba(240,215,140,0.38)]"
                : "bg-black/25 enabled:hover:bg-[#d5b66f]/[0.05]"
            }`}
          >
            <span
              aria-hidden
              className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed transition-colors motion-reduce:transition-none ${SLOT_CONTENT_DIM} ${
                selectedAbilityId === null
                  ? "border-[#f0d78c]/60 text-[#f0d78c]"
                  : "border-white/20 bg-black/20 text-white/45 group-enabled:group-hover:text-white/65"
              }`}
            >
              <ClearGlyph className="h-6 w-6" />
              <span className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-[4px] bg-[#1d2c42] text-[10px] font-black text-white/70 ring-1 ring-white/15 shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                —
              </span>
            </span>
            <span className={`flex min-w-0 flex-1 flex-col gap-0.5 ${SLOT_CONTENT_DIM}`}>
              <span className="truncate text-[13px] font-bold leading-tight text-white/85">{noAbilityLabel}</span>
              <span className="truncate text-[10px] leading-tight text-muted-foreground">
                Answer without an ability.
              </span>
            </span>
            <span className={`ml-auto hidden w-[3.25rem] shrink-0 items-center justify-end sm:flex ${SLOT_CONTENT_DIM}`}>
              {selectedAbilityId === null && (
                <span className="rounded bg-[#f0d78c] px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#2a1f08]">
                  Chosen
                </span>
              )}
            </span>
            <span className="sr-only">Submit this round without arming an ability.</span>
          </button>
        </div>
      </div>
    </section>
  );
}
