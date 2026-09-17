/**
 * RMOB2 — THE PHONE'S MATCH BAR.
 *
 * One plate instead of two. Below `lg` the RMOB1 compact header (timer) and the
 * duel strip (players) stacked to ~150px; this draws both in a single row:
 *
 *   [crest] name ◆ · score ●● · status  |  0:24 / 4 / 10  |  status · ●● score · ◆ name [crest]
 *
 * The timer lives here on purpose: it is part of the one band that is always on
 * screen, so a player never scrolls away from the clock during ordinary play.
 *
 * PRESENTATION ONLY. Every value is something the desktop header and banners
 * already draw from the same view model — the combatant views, the rail's
 * settled history, the header's timer and module title. Nothing is computed
 * about the match here. Desktop never mounts this (`lg:hidden` at the call
 * site), and its test ids are `mobile-*` so a jsdom render, which mounts both,
 * never sees a duplicate.
 */
import { CheckCircle2, Hourglass, Lock, ShieldCheck, XCircle } from "lucide-react";
import { RoleMascot } from "@/components/mascot/RoleMascot";
import type { ArenaHeaderView, ArenaRail } from "@/lib/ranked-core/arenaView";
import type { CombatantView, TimerView } from "@/lib/ranked-core/viewTypes";
import { classIdentityFor } from "./classIdentity";
import { isMirroredSide } from "./CombatantPanel";
import { ModuleBubble } from "./ModuleBubble";
import { RoleEmblem } from "./RoleEmblem";
import { NeutralSigil, roleIdentityFor } from "./roleIdentity";

type CombatantRail = Extract<ArenaRail, { kind: "combatant" }>;

/** How many settled modules each side shows: momentum, not a second timeline. */
export const MOBILE_RECENT_RESULTS = 2;

const OUTCOME_COPY: Record<string, string> = {
  correct: "Correct",
  incorrect: "Incorrect",
  timed_out: "Timed out",
};

const formatClock = (totalSeconds: number): string => {
  const clamped = Math.max(0, totalSeconds);
  return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, "0")}`;
};

function statusOf(c: CombatantView, outcome: CombatantRail["outcome"], showAbility: boolean) {
  if (outcome) {
    return { icon: outcome === "correct" ? ShieldCheck : XCircle,
      text: OUTCOME_COPY[outcome] ?? String(outcome) };
  }
  const answer = c.hasSubmitted ? "Locked in" : "Thinking…";
  const armed = showAbility && c.abilityWindow !== null && c.hasAbilitySelected;
  return { icon: armed ? CheckCircle2 : c.hasSubmitted ? Lock : Hourglass,
    text: armed ? `${answer} · Armed` : answer };
}

/**
 * The crest box. The FOOTPRINT is the RMOB1 strip's 40–44px box, but the art
 * now fills it: the mascot is `cover` at the full box instead of a 20px glyph
 * inside a thick inset frame, and the frame is a single hairline.
 */
function Crest({ rail, mirrored }: { rail: CombatantRail; mirrored: boolean }) {
  const c = rail.combatant;
  const role = roleIdentityFor(c.roleId);
  const roleLayout = c.identityMode === "role" || role.role !== null;
  const klass = classIdentityFor(c.classId);
  const accent = roleLayout ? role.accent : klass.accent;
  return (
    <span aria-hidden data-testid={`mobile-crest-${c.playerId}`}
      className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-[#0b1727]"
      style={{
        borderColor: `${accent}40`,
        backgroundImage: `radial-gradient(85% 75% at 50% 35%, ${
          roleLayout ? role.accentSoft : "rgba(233,220,190,0.10)"}, transparent 78%)`,
      }}>
      {roleLayout && role.role !== null ? (
        <RoleMascot role={role.role} facing={mirrored ? "left" : "right"}
          action={rail.reaction?.action ?? null} actionId={rail.reaction?.actionId ?? null}
          fit="cover" loading="eager"
          className="absolute inset-0 h-full w-full scale-[1.12]"
          data-testid={`mobile-crest-mascot-${c.playerId}`} />
      ) : !roleLayout && klass.portrait ? (
        <img src={klass.portrait} alt="" draggable={false} decoding="async"
          className="h-full w-full select-none object-cover [object-position:50%_22%]" />
      ) : (
        <span className="flex h-full w-full items-center justify-center p-2.5"
          style={{ color: accent }}>
          <NeutralSigil />
        </span>
      )}
    </span>
  );
}

function Side({ rail, progressionEnabled }: { rail: CombatantRail; progressionEnabled: boolean }) {
  const c = rail.combatant;
  const mirrored = isMirroredSide(c);
  const role = roleIdentityFor(c.roleId);
  const scored = c.score !== null && c.score !== undefined;
  const pct = c.maxHp !== null && c.maxHp > 0
    ? Math.min(100, Math.round((c.hp / c.maxHp) * 100)) : null;
  const status = statusOf(c, rail.outcome, progressionEnabled);
  const StatusIcon = status.icon;
  const recent = rail.damage.slice(-MOBILE_RECENT_RESULTS);
  const row = mirrored ? "flex-row-reverse" : "";
  return (
    <div data-testid={`mobile-combatant-${c.playerId}`} data-side={c.side}
      data-outcome={rail.outcome ?? "none"}
      className={`flex min-w-0 items-center gap-1 ${row} ${mirrored ? "text-right" : ""}`}>
      <Crest rail={rail} mirrored={mirrored} />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className={`flex min-w-0 items-center gap-1 ${row}`}>
          <span data-testid={`mobile-name-${c.playerId}`} title={c.name}
            className="min-w-0 truncate text-[13px] font-bold leading-tight">{c.name}</span>
          {role.role !== null && (
            <RoleEmblem role={role.role} size="sm" className="opacity-90" />
          )}
        </div>
        <div className={`flex min-w-0 items-center gap-1.5 ${row}`}>
          {scored ? (
            <span data-testid={`mobile-score-${c.playerId}`} data-standing={rail.standing ?? undefined}
              aria-label={`${c.name} score ${c.score}`}
              className="ranked-score-value shrink-0 text-lg font-black leading-none tabular-nums">
              {c.score}
            </span>
          ) : (
            <span data-testid={`mobile-hp-${c.playerId}`}
              className={`flex min-w-0 flex-1 items-center gap-1 ${row}`}>
              <span className="shrink-0 text-xs font-bold leading-none tabular-nums">{c.hp}</span>
              {pct !== null && (
                <span role="meter" aria-label={`${c.name} ${c.meterLabel ?? "HP"}`}
                  aria-valuenow={c.hp} aria-valuemin={0} aria-valuemax={c.maxHp!}
                  className="block h-1.5 min-w-0 max-w-[3rem] flex-1 overflow-hidden rounded-full bg-muted">
                  <span className={`block h-full rounded-full ${pct > 50 ? "bg-emerald-500"
                    : pct > 25 ? "bg-amber-500" : "bg-destructive"} ${mirrored ? "ml-auto" : ""}`}
                    style={{ width: `${pct}%` }} />
                </span>
              )}
            </span>
          )}
          {recent.length > 0 && (
            <span data-testid={`mobile-recent-${c.playerId}`} aria-label="Recent modules"
              className={`flex shrink-0 items-center gap-0.5 ${row}`}>
              {/* Newest nearest the score, so the row reads outward in time. */}
              {[...recent].reverse().map((e) => (
                <ModuleBubble key={e.roundNumber}
                  testId={`mobile-recent-bubble-${c.playerId}-${e.roundNumber}`}
                  basePoints={e.basePoints ?? null} speedBonusPoints={e.speedBonusPoints ?? null}
                  className="!h-4 !min-w-4 !px-1 !text-[9px]" />
              ))}
            </span>
          )}
        </div>
        <p role="status" aria-label={`${c.name} status`} data-testid={`mobile-status-${c.playerId}`}
          className={`flex min-w-0 items-center gap-1 text-[10px] leading-none text-muted-foreground ${row}`}>
          <StatusIcon aria-hidden className="h-2.5 w-2.5 shrink-0" />
          <span className="min-w-0 truncate">{status.text}</span>
        </p>
      </div>
    </div>
  );
}

function Clock({ timer, header }: { timer: TimerView | null; header: ArenaHeaderView }) {
  const expired = timer !== null && timer.remainingSeconds <= 0;
  return (
    <div data-testid="mobile-clock"
      className="flex min-w-[3.25rem] flex-col items-center justify-center gap-0.5">
      {timer ? (
        <span data-testid="mobile-timer-value" aria-label={`Time remaining ${formatClock(timer.remainingSeconds)}`}
          data-timer-state={timer.paused ? "paused" : expired ? "zero" : timer.urgent ? "urgent" : "running"}
          className={`font-mono text-[1.25rem] font-black leading-none tabular-nums ${
            expired || timer.urgent ? "text-destructive" : "text-foreground"}`}>
          {formatClock(timer.remainingSeconds)}
        </span>
      ) : (
        <span data-testid="mobile-timer-value" aria-hidden
          className="font-mono text-[1.25rem] font-black leading-none text-muted-foreground/50">–:––</span>
      )}
      <span data-testid="mobile-module-position"
        className="whitespace-nowrap text-[10px] font-bold uppercase leading-none tracking-[0.12em] tabular-nums text-muted-foreground">
        {header.title}
      </span>
    </div>
  );
}

export function MobileMatchBar({ left, right, header, progressionEnabled, className = "" }: {
  left: CombatantRail;
  right: CombatantRail;
  header: ArenaHeaderView;
  progressionEnabled: boolean;
  className?: string;
}) {
  return (
    <section data-testid="ranked-mobile-matchbar" aria-label="Match"
      className={`ranked-panel flex items-center gap-0.5 px-1 py-1 ${className}`}>
      <div className="min-w-0 flex-1 basis-0"><Side rail={left} progressionEnabled={progressionEnabled} /></div>
      <Clock timer={header.timer} header={header} />
      <div className="min-w-0 flex-1 basis-0"><Side rail={right} progressionEnabled={progressionEnabled} /></div>
    </section>
  );
}
