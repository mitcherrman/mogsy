/**
 * JUX1-F1 — WHICH item slots became inspectable just now: a purchase the
 * viewer WATCHED arrive (the board's double flash, "new information arriving").
 *
 * The purchase is the server's (`transition.events`, `kind: "purchase"`, read
 * through `transitionMarks(...).newItems`); this hook only decides whether it
 * arrived live:
 *
 *   * the first render seeds silently — a reload, a resume or a mount in the
 *     middle of a beat replays nothing (the item is simply there);
 *   * a purchase is identified by its transition (from → to, and the server's
 *     beat instant) and its slot, so a poll re-delivering the same state, an
 *     ordinary rerender or a later question with no purchase flashes nothing;
 *   * the moment lasts `ITEM_ARRIVAL_MS`, then clears (the CSS animation itself
 *     runs exactly twice; the window only bounds the reduced-motion static cue).
 *
 * Reads which items the server says were bought and when — never a value.
 */
import { useEffect, useRef, useState } from "react";
import type { JourneyTransition } from "@/lib/journey/contract";

/** How long a just-bought slot is "arriving" (the reduced-motion cue's span). */
export const ITEM_ARRIVAL_MS = 1600;

const EMPTY: ReadonlySet<string> = new Set();

/** One transition's identity: its edge and the server's beat instant. */
export const transitionIdentity = (t: JourneyTransition | null): string =>
  t ? `${t.fromNode}>${t.toNode}@${t.beat.until ?? ""}` : "";

/**
 * `newItems`: `transitionMarks(transition).newItems` (`side:slot` keys).
 * Returns the `side:slot` keys that arrived live, for `ITEM_ARRIVAL_MS`.
 */
export function useItemArrivals(transition: JourneyTransition | null, newItems: ReadonlySet<string>): ReadonlySet<string> {
  const seen = useRef<Set<string> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [now, setNow] = useState<ReadonlySet<string>>(EMPTY);
  const id = transitionIdentity(transition);
  const entries = [...newItems].map((slot) => ({ key: `${id}|${slot}`, slot }));
  const signature = entries.map((e) => e.key).join(",");
  useEffect(() => {
    if (seen.current === null) { seen.current = new Set(entries.map((e) => e.key)); return; }
    const fresh = entries.filter((e) => !seen.current!.has(e.key));
    for (const e of entries) seen.current.add(e.key);
    if (fresh.length === 0) return;
    setNow(new Set(fresh.map((e) => e.slot)));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNow(EMPTY), ITEM_ARRIVAL_MS);
    // `signature` is `entries`, by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return now;
}
