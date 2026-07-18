import { ReactNode } from "react";
import { CombatantPanel } from "@/components/ranked-arena/CombatantPanel";
import { TimerDisplay } from "@/components/ranked-arena/TimerDisplay";
import { CombatantView, TimerView } from "@/lib/ranked-core/viewTypes";

/**
 * Tutorial layout shell around the CANONICAL arena components: both
 * combatant panels and the shared timer are the real Ranked presentation,
 * fed tutorial view models. This file owns layout only — no game
 * presentation is reimplemented here. Mobile-first: timer ordered first on
 * small screens, three columns from md up.
 */
export function TrainingMatchShell({
  player,
  opponent,
  timer,
  children,
}: {
  player: CombatantView;
  opponent: CombatantView;
  timer: TimerView;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
        <div className="order-first md:order-none md:col-start-2 flex justify-center pt-2">
          <TimerDisplay timer={timer} label="Shared round timer" />
        </div>
        <div className="md:col-start-1 md:row-start-1">
          <CombatantPanel combatant={player} />
        </div>
        <div className="md:col-start-3 md:row-start-1">
          <CombatantPanel combatant={opponent} />
        </div>
      </div>
      {children}
    </div>
  );
}
