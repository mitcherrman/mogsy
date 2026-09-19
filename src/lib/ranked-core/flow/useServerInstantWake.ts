/**
 * RFX1 Phase 2A — re-render exactly when an authoritative server instant
 * arrives.
 *
 * The arena's answerable gate (`msUntilAnswerable(started_at)`) was only
 * re-evaluated by the 1s render tick or a poll, so input could open up to a
 * second after the server's `started_at`. This schedules ONE timeout for the
 * instant itself (server time converted to local through the snapshot skew),
 * re-armed only when the instant or the skew changes, and cleared on change or
 * unmount — so a superseded round's wake-up can never fire into the next one.
 * It decides nothing: the render it causes re-reads the same server fields.
 */
import { useEffect, useState } from "react";

/** A few ms past the boundary, so the re-render reads "answerable" rather
 *  than landing a hair early on a coarse timer. */
export const WAKE_SLACK_MS = 8;

export function msUntilServerInstant(iso: string, skewMs: number, nowMs: number): number {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? 0 : at - nowMs - skewMs;
}

export function useServerInstantWake(iso: string | null, skewMs: number): void {
  const [, setWoken] = useState(0);
  useEffect(() => {
    if (!iso) return;
    const delay = msUntilServerInstant(iso, skewMs, Date.now());
    if (delay <= 0) return;
    const id = window.setTimeout(() => setWoken((n) => n + 1), delay + WAKE_SLACK_MS);
    return () => window.clearTimeout(id);
  }, [iso, skewMs]);
}
