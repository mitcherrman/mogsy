import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, WifiOff } from "lucide-react";
import { TutorialCombatant, TutorialEvent } from "../types";

const STAGES = [
  "Connected",
  "Connection interrupted",
  "Recovering match",
  "State restored",
] as const;

/**
 * Recovery education. A local, deterministic demonstration of the INTENDED
 * recovery behavior: no transport, no polling, no WebSockets, no reload,
 * no storage, no real match identifier. The "restored" snapshot is simply
 * the current tutorial state shown twice, proving nothing changed.
 */
export function RecoverySimulationPanel({
  done,
  player,
  fortifyCharges,
  dispatch,
}: {
  done: boolean;
  player: TutorialCombatant;
  fortifyCharges: number;
  dispatch: (event: TutorialEvent) => void;
}) {
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (done) resultRef.current?.focus();
  }, [done]);

  const snapshot = `HP ${player.hp} · ${player.xp} XP · Level ${player.level} · Fortify ${fortifyCharges} charge${fortifyCharges === 1 ? "" : "s"} · last answer locked`;

  return (
    <section
      aria-label="Recovery simulation"
      data-testid="recovery-simulation"
      className="rounded-xl border-2 border-border bg-card p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <WifiOff className="h-4 w-4" aria-hidden />
        <h3 className="text-sm font-bold">Recovery simulation</h3>
        <Badge variant="secondary" className="text-[10px]">
          Local demonstration of intended behavior
        </Badge>
      </div>
      <ol className="space-y-1" data-testid="recovery-stages">
        {STAGES.map((stage, i) => (
          <li key={stage} className="flex items-center gap-2 text-sm">
            {done ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            ) : (
              <span className="h-3.5 w-3.5 rounded-full border border-border" aria-hidden />
            )}
            <span className={done ? "" : "text-muted-foreground"}>
              {i + 1}. {stage}
            </span>
            {done && <span className="sr-only">completed</span>}
          </li>
        ))}
      </ol>
      {!done ? (
        <Button
          onClick={() => dispatch({ type: "SIMULATE_DISCONNECT" })}
          data-testid="simulate-disconnect"
        >
          Simulate disconnect
        </Button>
      ) : (
        <div
          ref={resultRef}
          tabIndex={-1}
          className="rounded-lg border bg-background/60 p-3 text-sm space-y-1 outline-none"
          data-testid="recovery-sim-result"
        >
          <p className="font-medium">State restored — nothing was lost.</p>
          <div className="text-xs text-muted-foreground tabular-nums space-y-0.5">
            <div data-testid="recovery-before">
              Before the drop: {snapshot} · Training round (tutorial label — real
              matches use a server-side match record)
            </div>
            <div data-testid="recovery-after">After recovery: {snapshot}</div>
          </div>
          <p className="text-muted-foreground">
            The match is server-authoritative: refreshing never grants a free
            restart, and locked answers stay locked.
          </p>
        </div>
      )}
    </section>
  );
}
