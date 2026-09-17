/**
 * RMOB1 — THE PHONE'S PLAYER COLUMNS.
 *
 * Below `lg` the arena is document flow, and the two duel banners stood side by
 * side at half width, ~360px tall each, mostly the empty module-history middle.
 * They were most of the first screen and pushed every answer below the fold.
 *
 * This is a purpose-built strip, not a squashed banner: both duelists on one
 * short plate, each half carrying only what matters while a question is open —
 * who, which role, the live standing (score or HP), and the round status. The
 * desktop banners are untouched; `CanonicalArena` shows one or the other by
 * breakpoint. Nothing here computes: every value is the `CombatantView` the
 * banners already draw.
 *
 * TEST IDS are `mobile-*`, never the banner's own, so a jsdom render (which
 * mounts both presentations) never sees duplicate ids.
 */
import { CheckCircle2, Hourglass, Lock, ShieldCheck, XCircle } from "lucide-react";
import type { DuelStanding } from "@/lib/ranked-core/duelState";
import type { CombatantView } from "@/lib/ranked-core/viewTypes";
import type { ArenaRail } from "@/lib/ranked-core/arenaView";
import { classIdentityFor } from "./classIdentity";
import { RoleCrest, roleIdentityFor } from "./roleIdentity";
import { isMirroredSide } from "./CombatantPanel";

type CombatantRail = Extract<ArenaRail, { kind: "combatant" }>;

const OUTCOME_COPY: Record<string, string> = {
  correct: "Correct",
  incorrect: "Incorrect",
  timed_out: "Timed out",
};

function statusOf(c: CombatantView, outcome: CombatantRail["outcome"], showAbility: boolean) {
  if (outcome) {
    const good = outcome === "correct";
    return { icon: good ? ShieldCheck : XCircle, text: OUTCOME_COPY[outcome] ?? String(outcome) };
  }
  // Half a phone is ~150px: the answer state is the one line that matters, and
  // the ability window earns a word only once it has a decision in it.
  const answer = c.hasSubmitted ? "Locked in" : "Thinking…";
  const armed = showAbility && c.abilityWindow !== null && c.hasAbilitySelected;
  return { icon: armed ? CheckCircle2 : c.hasSubmitted ? Lock : Hourglass,
    text: armed ? `${answer} · Armed` : answer };
}

function Half({ rail, progressionEnabled }: { rail: CombatantRail; progressionEnabled: boolean }) {
  const c = rail.combatant;
  const mirrored = isMirroredSide(c);
  const role = roleIdentityFor(c.roleId);
  const roleLayout = c.identityMode === "role" || role.role !== null;
  const klass = classIdentityFor(c.classId);
  const accent = roleLayout ? role.accent : klass.accent;
  const label = roleLayout ? (c.tag ?? role.label) : (c.tag ?? c.classId);
  const scored = c.score !== null && c.score !== undefined;
  const pct = c.maxHp !== null && c.maxHp > 0
    ? Math.min(100, Math.round((c.hp / c.maxHp) * 100)) : null;
  const status = statusOf(c, rail.outcome, progressionEnabled);
  const StatusIcon = status.icon;
  const standing: DuelStanding | null = rail.standing ?? null;

  return (
    <div data-testid={`mobile-combatant-${c.playerId}`} data-side={c.side}
      data-outcome={rail.outcome ?? "none"}
      className={`flex min-w-0 flex-1 basis-0 items-center gap-2 ${mirrored ? "flex-row-reverse text-right" : ""}`}>
      <div className="shrink-0">
        {roleLayout ? (
          <RoleCrest identity={role} mirrored={mirrored} size="sm" />
        ) : klass.portrait ? (
          <img src={klass.portrait} alt="" aria-hidden draggable={false} loading="lazy"
            decoding="async"
            className="h-10 w-10 select-none rounded-md border border-white/10 object-cover [object-position:50%_22%]" />
        ) : (
          <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 text-xs font-bold uppercase"
            style={{ color: accent }}>{label.slice(0, 2)}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className={`flex min-w-0 items-baseline gap-1.5 ${mirrored ? "flex-row-reverse" : ""}`}>
          <span data-testid={`mobile-name-${c.playerId}`}
            className="min-w-0 truncate text-sm font-bold leading-tight">{c.name}</span>
          {scored && (
            <span data-testid={`mobile-score-${c.playerId}`} data-standing={standing ?? undefined}
              className="ranked-score-value ml-auto shrink-0 text-base font-black leading-none tabular-nums"
              style={mirrored ? { marginLeft: 0, marginRight: "auto" } : undefined}
              aria-label={`${c.name} score ${c.score}`}>
              {c.score}
            </span>
          )}
        </div>
        <div className={`flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase leading-none tracking-[0.12em] ${
          mirrored ? "flex-row-reverse" : ""}`}>
          <span className="min-w-0 truncate" style={{ color: accent }}>{label}</span>
          {progressionEnabled && (
            <span className="shrink-0 tabular-nums text-muted-foreground">Lv {c.level}</span>
          )}
        </div>
        {!scored && (
          <div data-testid={`mobile-hp-${c.playerId}`}
            className={`flex min-w-0 items-center gap-1.5 ${mirrored ? "flex-row-reverse" : ""}`}>
            {pct !== null && (
              <div role="meter" aria-label={`${c.name} ${c.meterLabel ?? "HP"}`}
                aria-valuenow={c.hp} aria-valuemin={0} aria-valuemax={c.maxHp!}
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${pct > 50 ? "bg-emerald-500"
                  : pct > 25 ? "bg-amber-500" : "bg-destructive"} ${mirrored ? "ml-auto" : ""}`}
                  style={{ width: `${pct}%` }} />
              </div>
            )}
            <span className="shrink-0 text-[11px] font-bold leading-none tabular-nums">{c.hp}</span>
          </div>
        )}
        <p role="status" aria-label={`${c.name} status`}
          data-testid={`mobile-status-${c.playerId}`}
          className={`flex min-w-0 items-center gap-1 text-[11px] leading-tight text-muted-foreground ${
            mirrored ? "flex-row-reverse" : ""}`}>
          <StatusIcon aria-hidden className="h-3 w-3 shrink-0" />
          <span className="min-w-0 truncate">{status.text}</span>
        </p>
      </div>
    </div>
  );
}

export function MobileDuelStrip({ left, right, progressionEnabled, className = "" }: {
  left: CombatantRail;
  right: CombatantRail;
  progressionEnabled: boolean;
  className?: string;
}) {
  return (
    <section data-testid="ranked-mobile-duel" aria-label="Duelists"
      className={`ranked-panel flex gap-3 px-3 py-2 ${className}`}>
      <Half rail={left} progressionEnabled={progressionEnabled} />
      <Half rail={right} progressionEnabled={progressionEnabled} />
    </section>
  );
}
