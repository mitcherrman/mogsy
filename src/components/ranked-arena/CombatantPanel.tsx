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
          className="h-4 rounded-full bg-muted overflow-hidden border border-border"
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
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="status"
      aria-label={`${name} round status`}
      data-testid={`status-${combatant.playerId}`}
    >
      <Badge variant={hasSubmitted ? "default" : "secondary"} className="gap-1">
        {hasSubmitted ? (
          <Lock className="h-3 w-3" aria-hidden />
        ) : (
          <Hourglass className="h-3 w-3" aria-hidden />
        )}
        {hasSubmitted ? "Answer locked" : "Thinking…"}
      </Badge>
      {abilityWindow !== null && (
        <Badge variant={abilityWindow === "locked" ? "default" : "secondary"} className="gap-1">
          {abilityWindow === "locked" ? (
            <>
              <Lock className="h-3 w-3" aria-hidden /> Ability locked
            </>
          ) : hasAbilitySelected ? (
            <>
              <CheckCircle2 className="h-3 w-3" aria-hidden /> Ability armed
            </>
          ) : (
            "Choosing ability"
          )}
        </Badge>
      )}
    </div>
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
  return (
    <section
      aria-label={`${name} panel`}
      data-testid={`combatant-${combatant.playerId}`}
      className={`relative rounded-xl border-2 bg-card p-4 space-y-3 ring-1 ring-inset ring-white/5 ${
        side === "player"
          ? "border-primary/60 shadow-[0_0_24px_-12px_hsl(var(--primary)/0.55)]"
          : "border-destructive/50 shadow-[0_0_24px_-12px_hsl(var(--destructive)/0.45)]"
      }`}
    >
      <header className="flex items-center gap-2 min-w-0">
        <div className="min-w-0">
          <div className="font-bold leading-tight truncate">{name}</div>
          {tag && <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground truncate">{tag}</div>}
        </div>
        <Badge variant="outline"
          className={`ml-auto shrink-0 tabular-nums ${
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
