import { useEffect, useReducer, useState } from "react";
import { Button } from "@/components/ui/button";
import { duelReducer, initialDuelState } from "./duelMachine";
import { REVEAL_DELAY_MS } from "./fixtures";
import { SetupScreen } from "./SetupScreen";
import { DuelScreen } from "./DuelScreen";
import { MatchOverScreen } from "./MatchOverScreen";
import { RankedDuelStaffPage } from "./staff-duel/RankedDuelStaffPage";

type Mode = "fixture" | "live";

/**
 * /dev/ranked-duel — staff/dev-only ranked duel surface. Two modes share the
 * route and never mix:
 *
 *  * "fixture"  — the original deterministic local prototype (mock state, no
 *                 backend calls), preserved for design and adapter work;
 *  * "live"     — the playable staff duel wired to the real backend lifecycle.
 *
 * Intentionally not linked from any navigation.
 */
export default function RankedDuelPrototype() {
  const [mode, setMode] = useState<Mode>("fixture");
  const [state, dispatch] = useReducer(duelReducer, initialDuelState);

  // Single shared 1s tick — the reducer ignores TICK outside the question
  // phase, so the interval can only exist while a question is live.
  useEffect(() => {
    if (state.phase !== "question") return;
    const id = window.setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => window.clearInterval(id);
  }, [state.phase]);

  // Deterministic short pause between round end and simultaneous reveal.
  useEffect(() => {
    if (state.phase !== "awaiting_reveal") return;
    const id = window.setTimeout(() => dispatch({ type: "RESOLVE" }), REVEAL_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [state.phase]);

  return (
    <main className="container mx-auto max-w-6xl px-3 py-6 space-y-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Ranked 1v1 Duel — Staff / Dev</h1>
        <p className="text-sm text-muted-foreground">
          {mode === "fixture"
            ? "Fixture prototype: local mock state only. Not connected to the backend duel engine; all damage, XP, and class values are frontend presentation fixtures."
            : "Live staff duel: every value shown comes from the backend ranked-duel lifecycle. Staff demonstration only."}
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Ranked duel mode">
          <Button
            size="sm"
            variant={mode === "fixture" ? "default" : "outline"}
            data-testid="mode-fixture"
            onClick={() => setMode("fixture")}
          >
            Fixture prototype
          </Button>
          <Button
            size="sm"
            variant={mode === "live" ? "default" : "outline"}
            data-testid="mode-live"
            onClick={() => setMode("live")}
          >
            Live staff duel
          </Button>
        </div>
      </header>

      {mode === "live" && <RankedDuelStaffPage />}

      {mode === "fixture" && state.phase === "setup" && (
        <SetupScreen onStart={(classes) => dispatch({ type: "START_MATCH", classes })} />
      )}
      {mode === "fixture" &&
        (state.phase === "question" ||
          state.phase === "awaiting_reveal" ||
          state.phase === "reveal" ||
          state.phase === "progression") && <DuelScreen state={state} dispatch={dispatch} />}
      {mode === "fixture" && state.phase === "match_over" && (
        <MatchOverScreen state={state} dispatch={dispatch} />
      )}
    </main>
  );
}
