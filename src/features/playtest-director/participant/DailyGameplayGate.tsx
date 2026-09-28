/**
 * PLAY1 — the one place Playtest meets the Daily.
 *
 * Renders the canonical `DailyRunPage` UNCHANGED, with its transport wrapped
 * by the pass-through observer. When the manifest's return condition is met by
 * an observed canonical snapshot, the gate UNMOUNTS the Daily and shows its own
 * held state. That is how Playtest takes presentation control back — and why a
 * participant can never reach `DailyCompletion`'s hard-coded `/quiz` link: the
 * Daily is gone before its completion screen could be interacted with.
 *
 * Returning is local and derived: after a refresh the gate remounts the Daily,
 * canonical resume (`GET /today`) re-reads the run, and the first observed
 * snapshot re-derives the same answer. Playtest stores no copy of Daily state.
 */
import { useMemo, useRef, useState, type ComponentType } from "react";
import { DailyRunPage, type StageMatchProps } from "@/pages/quiz-daily-challenge/run/DailyRunPage";
import { httpDailyRunTransport, type DailyRunTransport } from "@/lib/daily-challenge/run/client";
import type { GameplayScene } from "../manifest";
import { observeDailyTransport, projectDaily, returnConditionMet, type DailyProjection } from "../dailyObserver";

export interface DailyGameplayGateProps {
  scene: GameplayScene;
  /** Each observed canonical snapshot, projected. */
  onSnapshot?: (projection: DailyProjection) => void;
  /** Fired once, when the manifest's return point is reached. */
  onReturned?: (projection: DailyProjection) => void;
  /** Test seams, passed straight through to DailyRunPage. */
  transport?: DailyRunTransport;
  StageMatch?: ComponentType<StageMatchProps>;
  viewerUserId?: string;
}

export function DailyGameplayGate({
  scene, onSnapshot, onReturned, transport = httpDailyRunTransport, StageMatch, viewerUserId,
}: DailyGameplayGateProps) {
  const [returned, setReturned] = useState(false);
  const returnedRef = useRef(false);
  const callbacks = useRef({ onSnapshot, onReturned });
  callbacks.current = { onSnapshot, onReturned };
  const condition = scene.returnWhen;

  // Stable identity: useDailyRun's effects depend on the transport object.
  const observed = useMemo(() => observeDailyTransport(transport, (run) => {
    const projection = projectDaily(run);
    callbacks.current.onSnapshot?.(projection);
    if (!returnedRef.current && returnConditionMet(condition, projection)) {
      returnedRef.current = true;
      setReturned(true);
      callbacks.current.onReturned?.(projection);
    }
  }), [transport, condition]);

  if (returned) {
    return (
      <div data-testid="playtest-gameplay-held" className="ranked-panel mx-auto max-w-lg space-y-2 p-6 text-center">
        <p className="ranked-eyebrow">Playtest</p>
        <p className="text-sm text-muted-foreground">{scene.heldMessage}</p>
      </div>
    );
  }

  return (
    <div data-testid="playtest-daily-gameplay">
      <DailyRunPage
        transport={observed}
        startOnMount
        {...(StageMatch ? { StageMatch } : {})}
        {...(viewerUserId ? { viewerUserId } : {})}
      />
    </div>
  );
}
