/**
 * JOURNEY-UI1 — is the canonical transition beat running right now?
 *
 * Reads ONE thing: the server's `transition.beat.until`, compared with server
 * time (`Date.now() + skewMs`, the arena's ordinary skew). It arms a single
 * timer for the instant the beat ends and re-renders then. It never starts,
 * pauses, extends or shortens anything, and it touches no match clock — if the
 * server says the beat is over (a refresh after `until`), it is over.
 */
import { useEffect, useState } from "react";
import type { JourneyTransition } from "@/lib/journey/contract";
import { beatRemainingMs } from "@/lib/journey/beat";

export function useJourneyBeat(transition: JourneyTransition | null, skewMs = 0, suspended = false): boolean {
  const until = transition?.beat.until ?? null;
  const [, setTick] = useState(0);
  const remaining = suspended ? 0 : beatRemainingMs(transition, Date.now() + skewMs);

  useEffect(() => {
    if (suspended || until === null) return;
    const left = beatRemainingMs(transition, Date.now() + skewMs);
    if (left <= 0) return;
    const id = window.setTimeout(() => setTick((n) => n + 1), left + 1);
    return () => window.clearTimeout(id);
    // Keyed on the instant, not the object: a poll re-delivering the same beat
    // must not re-arm it differently.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [until, skewMs, suspended]);

  return remaining > 0;
}
