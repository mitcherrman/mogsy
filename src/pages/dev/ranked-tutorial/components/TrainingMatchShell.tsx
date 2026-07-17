import { Badge } from "@/components/ui/badge";
import { Shield, Timer } from "lucide-react";
import { TimerState, TutorialCombatant, TutorialTimerMode } from "../types";
import { nextLevelThreshold, xpProgressPct } from "../tutorialMachine";
import { TUTORIAL_OPPONENT, TUTORIAL_PLAYER } from "../fixtures";

/**
 * Identity + HP + XP panel for one side of the training match. Visual
 * language adapted from the Ranked prototype's PlayerPanel (HP loud with a
 * meter role, XP quiet) but tutorial-owned and fed only tutorial props.
 */
function CombatantPanel({
  identity,
  combatant,
  side,
}: {
  identity: { name: string; tag: string };
  combatant: TutorialCombatant;
  side: "player" | "opponent";
}) {
  const hpPct = Math.round((combatant.hp / combatant.maxHp) * 100);
  return (
    <section
      aria-label={`${identity.name} panel`}
      data-testid={`${side}-panel`}
      className={`rounded-xl border-2 bg-card p-4 space-y-3 ${
        side === "player" ? "border-primary/50" : "border-destructive/50"
      }`}
    >
      <header className="flex items-center gap-2 min-w-0">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            side === "player"
              ? "bg-primary/15 text-primary"
              : "bg-destructive/15 text-destructive"
          }`}
        >
          <Shield className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="font-bold leading-tight truncate">{identity.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            Tank · {identity.tag}
          </div>
        </div>
        <Badge variant="outline" className="ml-auto shrink-0 tabular-nums">
          Lv {combatant.level}
        </Badge>
      </header>

      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-xs font-semibold" id={`${side}-hp-label`}>
            HP
          </span>
          <span className="tabular-nums text-base font-bold leading-none">
            {combatant.hp}
            <span className="text-xs font-medium text-muted-foreground">
              {" "}
              / {combatant.maxHp}
            </span>
          </span>
        </div>
        <div
          role="meter"
          aria-label={`${identity.name} HP`}
          aria-valuenow={combatant.hp}
          aria-valuemin={0}
          aria-valuemax={combatant.maxHp}
          className="h-4 rounded-full bg-muted overflow-hidden border border-border"
        >
          <div
            className={`h-full rounded-full transition-all duration-700 motion-reduce:transition-none ${
              hpPct > 50 ? "bg-emerald-500" : hpPct > 25 ? "bg-amber-500" : "bg-destructive"
            }`}
            style={{ width: `${hpPct}%` }}
          />
        </div>
      </div>

      <div>
        <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
          <span id={`${side}-xp-label`}>XP</span>
          <span className="tabular-nums" data-testid={`${side}-xp-value`}>
            {nextLevelThreshold(combatant.level) === null
              ? `${combatant.xp} xp · max level`
              : `${combatant.xp} xp · next level at ${nextLevelThreshold(combatant.level)}`}
          </span>
        </div>
        <div
          aria-labelledby={`${side}-xp-label`}
          className="h-1.5 rounded-full bg-muted overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-violet-400/70 transition-all duration-700 motion-reduce:transition-none"
            style={{ width: `${xpProgressPct(combatant.xp, combatant.level)}%` }}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * Controlled tutorial timer display. Reducer-owned countdown — this
 * component only renders TimerState; it never resolves anything. The
 * ticking digits are deliberately aria-live="off" (warnings are announced
 * through the page's live region instead, never per-second ticks).
 */
function TutorialTimer({ mode, timer }: { mode: TutorialTimerMode; timer: TimerState }) {
  const urgent = timer.running && timer.remaining <= 5;
  const pct = Math.max(0, Math.min(100, (timer.remaining / timer.duration) * 100));
  const fortifyBonus = timer.duration > 30;
  return (
    <div className="flex flex-col items-center gap-1" data-testid="tutorial-timer">
      <div
        className={`flex items-center gap-2 text-2xl font-bold tabular-nums ${
          urgent ? "text-destructive" : ""
        }`}
        aria-live="off"
      >
        <Timer className="h-5 w-5" aria-hidden />
        <span data-testid="timer-seconds">{timer.remaining}s</span>
      </div>
      <div className="w-40 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear motion-reduce:transition-none ${
            urgent ? "bg-destructive" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {fortifyBonus && (
        <span
          className="text-[11px] text-sky-600 dark:text-sky-400 font-medium"
          data-testid="timer-fortify-note"
        >
          +5s: Fortify bonus ({timer.duration}s start)
        </span>
      )}
      {timer.pressureCutApplied && timer.running && (
        <span
          className="text-[11px] text-amber-600 dark:text-amber-400 font-medium"
          data-testid="timer-cut-note"
        >
          −5s: first answer is in
        </span>
      )}
      {!timer.running && mode !== "running" && (
        <span className="text-[11px] text-muted-foreground" data-testid="timer-paused-note">
          Timer paused for training
        </span>
      )}
    </div>
  );
}

/**
 * Layout shell for the training match: both identity panels around the
 * shared timer, mobile-first (single column, timer ordered first on small
 * screens), with the instructional content slot below.
 */
export function TrainingMatchShell({
  player,
  opponent,
  timerMode,
  timer,
  children,
}: {
  player: TutorialCombatant;
  opponent: TutorialCombatant;
  timerMode: TutorialTimerMode;
  timer: TimerState;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
        <div className="order-first md:order-none md:col-start-2 flex justify-center pt-2">
          <TutorialTimer mode={timerMode} timer={timer} />
        </div>
        <div className="md:col-start-1 md:row-start-1">
          <CombatantPanel identity={TUTORIAL_PLAYER} combatant={player} side="player" />
        </div>
        <div className="md:col-start-3 md:row-start-1">
          <CombatantPanel identity={TUTORIAL_OPPONENT} combatant={opponent} side="opponent" />
        </div>
      </div>
      {children}
    </div>
  );
}
