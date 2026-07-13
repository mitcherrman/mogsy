import { useEffect, useReducer } from "react";
import { duelReducer, initialDuelState } from "./duelMachine";
import { REVEAL_DELAY_MS } from "./fixtures";
import { SetupScreen } from "./SetupScreen";
import { DuelScreen } from "./DuelScreen";
import { MatchOverScreen } from "./MatchOverScreen";

/**
 * /dev/ranked-duel — frontend-only visual & interaction prototype for the
 * synchronized ranked 1v1 League knowledge duel. Deterministic local mock
 * state only; no backend calls and no shared API contract. Intentionally not
 * linked from any navigation.
 */
export default function RankedDuelPrototype() {
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
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Ranked 1v1 Duel — Dev Prototype</h1>
        <p className="text-sm text-muted-foreground">
          Local mock state only. Not connected to the backend duel engine; all damage, XP, and
          class values are frontend presentation fixtures.
        </p>
      </header>

      {state.phase === "setup" && (
        <SetupScreen onStart={(classes) => dispatch({ type: "START_MATCH", classes })} />
      )}
      {(state.phase === "question" ||
        state.phase === "awaiting_reveal" ||
        state.phase === "reveal" ||
        state.phase === "progression") && <DuelScreen state={state} dispatch={dispatch} />}
      {state.phase === "match_over" && <MatchOverScreen state={state} dispatch={dispatch} />}
    </main>
  );
}
