import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Search } from "lucide-react";
import { TutorialEvent } from "../types";

const STAGES = ["Ready", "Searching", "Opponent found", "Match ready"] as const;

/**
 * Queue education. Entirely visual and deterministic: one button completes
 * the whole stage sequence in a single machine transition. Never calls
 * matchmaking, never shows a queue estimate, never uses a match ID, and
 * never advances into Ranked by itself.
 */
export function QueueSimulationPanel({
  done,
  dispatch,
}: {
  done: boolean;
  dispatch: (event: TutorialEvent) => void;
}) {
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (done) resultRef.current?.focus();
  }, [done]);

  return (
    <section
      aria-label="Queue simulation"
      data-testid="queue-simulation"
      className="rounded-xl border-2 border-border bg-card p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4" aria-hidden />
        <h3 className="text-sm font-bold">Queue simulation</h3>
        <Badge variant="secondary" className="text-[10px]">
          Not a live queue
        </Badge>
      </div>
      <ol className="space-y-1" data-testid="queue-stages">
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
          onClick={() => dispatch({ type: "SIMULATE_MATCHMAKING" })}
          data-testid="simulate-matchmaking"
        >
          Simulate matchmaking
        </Button>
      ) : (
        <div
          ref={resultRef}
          tabIndex={-1}
          className="rounded-lg border bg-background/60 p-3 text-sm outline-none"
          data-testid="queue-sim-result"
        >
          <p className="font-medium">Simulation complete — no real queue was entered.</p>
          <p className="text-muted-foreground mt-1">
            In real Ranked, matchmaking pairs you with another player who sees
            the same questions and timer. Nothing starts automatically after
            this simulation — use Continue when you're ready.
          </p>
        </div>
      )}
    </section>
  );
}
