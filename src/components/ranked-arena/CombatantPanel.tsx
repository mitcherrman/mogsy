/**
 * Canonical Ranked combatant presentation (F1 shared arena, Phase B).
 *
 * Stateless and mode-neutral: renders a CombatantView plus neutral round
 * status. Shows only pre-reveal-safe information — never an answer or
 * ability identity. Visual language follows the ranked prototype's
 * PlayerPanel / E2's combatant panel (HP loud, XP quiet), with meter
 * semantics and reduced-motion-safe transitions.
 */
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Hourglass, Lock } from "lucide-react";
import { CombatantView } from "@/lib/ranked-core/viewTypes";
import { ClassIdentity, classIdentityFor } from "./classIdentity";

/** HP meter. maxHp null = unknown: absolute number only, no proportion. */
export function HealthMeter({ combatant }: { combatant: CombatantView }) {
  const { hp, maxHp, name } = combatant;
  const pct = maxHp !== null && maxHp > 0 ? Math.min(100, Math.round((hp / maxHp) * 100)) : null;
  return (
    <div data-testid={`hp-${combatant.playerId}`}>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold">HP</span>
        <span className="tabular-nums text-base font-bold leading-none">
          {hp}
          {maxHp !== null && (
            <span className="text-xs font-medium text-muted-foreground"> / {maxHp}</span>
          )}
        </span>
      </div>
      {pct !== null ? (
        <div
          role="meter"
          aria-label={`${name} HP`}
          aria-valuenow={hp}
          aria-valuemin={0}
          aria-valuemax={maxHp!}
          className="h-3 rounded-full bg-muted overflow-hidden border border-border"
        >
          <div
            className={`h-full rounded-full transition-all duration-700 motion-reduce:transition-none ${
              pct > 50 ? "bg-emerald-500" : pct > 25 ? "bg-amber-500" : "bg-destructive"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : (
        // Unknown maximum: no proportional bar — we never invent a max HP.
        <div
          className="text-[11px] text-muted-foreground"
          aria-label={`${name} HP ${hp}, maximum unknown`}
        >
          Max HP unavailable
        </div>
      )}
    </div>
  );
}

/** Quiet XP progression bar; thresholds are supplied, never computed here. */
export function ExperienceMeter({ combatant }: { combatant: CombatantView }) {
  const { xp, level, currentLevelThreshold, nextLevelThreshold, playerId } = combatant;
  const atMax = nextLevelThreshold === null;
  let pct: number | null = null;
  if (!atMax && currentLevelThreshold !== null && nextLevelThreshold > currentLevelThreshold) {
    pct = Math.min(
      100,
      Math.max(
        0,
        Math.round(((xp - currentLevelThreshold) / (nextLevelThreshold - currentLevelThreshold)) * 100),
      ),
    );
  }
  return (
    <div data-testid={`xp-${playerId}`}>
      <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
        <span id={`xp-label-${playerId}`}>XP</span>
        <span className="tabular-nums" aria-labelledby={`xp-label-${playerId}`}>
          {atMax
            ? `${xp} xp · Level ${level} (max)`
            : nextLevelThreshold !== null
              ? `${xp} / ${nextLevelThreshold} xp`
              : `${xp} xp`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-violet-400/70 transition-all duration-700 motion-reduce:transition-none"
          style={{ width: `${atMax ? 100 : (pct ?? 0)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Neutral round-status chips: submitted / thinking, ability window state.
 * Announced politely; never reveals WHICH answer or ability was chosen.
 */
function RoundStatus({ combatant }: { combatant: CombatantView }) {
  const { hasSubmitted, abilityWindow, hasAbilitySelected, name } = combatant;
  // ONE reserved row, and each badge holds a fixed icon slot.
  //
  // Phase 2 compact layout: the ability chip's labels are short enough
  // ("Armed" / "Picking…" / "Locked") that both chips always fit one line in
  // the rail, so the reserved height is a single row now instead of two.
  // The answer chip keeps its full wording — "Answer locked" is load-bearing
  // copy (tutorial + player comprehension); the ability chip is disambiguated
  // by its aria-label rather than a longer visible label. The icon still
  // occupies the same 12px whether or not it is drawn.
  //
  // RA10: the chips are compacted (11px / px-1.5) because the lg rail is now
  // 14rem — at default Badge density the WIDEST pairing ("Answer locked" +
  // "Picking…") wrapped while narrower pairings did not, which made the panel
  // height depend on round state. At this density every state pairing fits
  // one row in a 14rem rail.
  return (
    <div
      className="flex min-h-7 flex-wrap content-start gap-1.5"
      role="status"
      aria-label={`${name} round status`}
      data-testid={`status-${combatant.playerId}`}
    >
      <Badge variant={hasSubmitted ? "default" : "secondary"} className="gap-1 px-1.5 text-[11px]">
        <span aria-hidden className="inline-flex h-3 w-3 shrink-0 items-center justify-center">
          {hasSubmitted ? <Lock className="h-3 w-3" /> : <Hourglass className="h-3 w-3" />}
        </span>
        {hasSubmitted ? "Answer locked" : "Thinking…"}
      </Badge>
      {abilityWindow !== null && (
        <Badge variant={abilityWindow === "locked" ? "default" : "secondary"} className="gap-1 px-1.5 text-[11px]"
          aria-label={abilityWindow === "locked" ? "Ability locked"
            : hasAbilitySelected ? "Ability armed" : "Choosing ability"}>
          <span aria-hidden className="inline-flex h-3 w-3 shrink-0 items-center justify-center">
            {abilityWindow === "locked" ? <Lock className="h-3 w-3" />
              : hasAbilitySelected ? <CheckCircle2 className="h-3 w-3" /> : null}
          </span>
          {abilityWindow === "locked" ? "Locked"
            : hasAbilitySelected ? "Armed" : "Picking…"}
        </Badge>
      )}
    </div>
  );
}

/**
 * RA10 — class mascot portrait (framed bust). DECORATIVE by contract: the tag
 * line already names the class, so the image is aria-hidden and a missing or
 * unknown class degrades to a monogram in the very same frame — the header's
 * geometry never depends on which class (or whether any) arrived.
 */
function ClassPortrait({
  identity,
  fallbackLabel,
  mirrored,
}: {
  identity: ClassIdentity;
  fallbackLabel: string;
  mirrored: boolean;
}) {
  return (
    <span
      aria-hidden
      data-testid="class-portrait"
      // Hidden on the narrow mobile cards, where 48px of art squeezed the
      // name to a single letter — the tag row shows a mini-crest there
      // instead, so the class stays visible at every width.
      className="relative hidden h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#0b1727] sm:block"
      style={{
        boxShadow: `inset 0 0 0 1px ${identity.accent}33, inset 0 -8px 12px -8px rgba(0,0,0,0.8)`,
        backgroundImage: `radial-gradient(80% 70% at 50% 30%, ${identity.accentSoft}, transparent 75%)`,
      }}
    >
      {identity.portrait ? (
        // The class art is a painted 2:3 card (its backdrop is baked in), so
        // the frame shows a cover crop biased toward the figure's head rather
        // than a zoomed cutout — zooming read as noise at 48px. Opponent art
        // mirrors so both duelists face the arena centre.
        <img
          src={identity.portrait}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className={`absolute inset-0 h-full w-full select-none object-cover [object-position:50%_30%] ${
            mirrored ? "-scale-x-100" : ""
          }`}
        />
      ) : (
        <span
          className="absolute inset-0 flex items-center justify-center text-base font-black uppercase"
          style={{ color: identity.accent }}
        >
          {fallbackLabel.charAt(0) || "?"}
        </span>
      )}
    </span>
  );
}

export function CombatantPanel({
  combatant,
  showRoundStatus = true,
}: {
  combatant: CombatantView;
  /** Controllers may hide status chips (e.g. between rounds). */
  showRoundStatus?: boolean;
}) {
  const { side, name, tag } = combatant;
  const identity = classIdentityFor(combatant.classId);
  // Opponent panels mirror the header (portrait outboard, text toward the
  // centre) so the two cards read as facing duelists. Structure is identical —
  // only flex direction and text alignment flip.
  const mirrored = side === "opponent";
  return (
    <section
      aria-label={`${name} panel`}
      data-testid={`combatant-${combatant.playerId}`}
      className={`relative rounded-xl border-2 bg-card p-3 space-y-2 ring-1 ring-inset ring-white/5 ${
        side === "player"
          ? "border-primary/60 shadow-[0_0_24px_-12px_hsl(var(--primary)/0.55)]"
          : "border-destructive/50 shadow-[0_0_24px_-12px_hsl(var(--destructive)/0.45)]"
      }`}
    >
      <header className={`flex items-center gap-2 min-w-0 ${mirrored ? "flex-row-reverse" : ""}`}>
        <ClassPortrait identity={identity} fallbackLabel={tag ?? combatant.classId} mirrored={mirrored} />
        <div className={`min-w-0 ${mirrored ? "text-right" : ""}`}>
          <div className="font-bold leading-tight truncate">{name}</div>
          {tag && (
            <div
              className={`flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] ${
                mirrored ? "justify-end" : ""}`}
              style={{ color: identity.accent }}
            >
              {identity.portrait && (
                // Mobile stand-in for the framed bust above (hidden <sm).
                <img
                  src={identity.portrait}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="h-4 w-4 shrink-0 select-none rounded-[3px] object-cover [object-position:50%_22%] sm:hidden"
                />
              )}
              <span className="truncate">{tag}</span>
            </div>
          )}
        </div>
        <Badge variant="outline"
          className={`${mirrored ? "mr-auto" : "ml-auto"} shrink-0 tabular-nums ${
            side === "player" ? "border-primary/50 text-primary" : "border-destructive/50 text-destructive"
          }`}>
          Lv {combatant.level}
        </Badge>
      </header>
      <HealthMeter combatant={combatant} />
      <ExperienceMeter combatant={combatant} />
      {showRoundStatus && <RoundStatus combatant={combatant} />}
    </section>
  );
}
