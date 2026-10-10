/**
 * JATTN1 — WHICH facts the board SAVED just now, for the one short "Saved"
 * moment (the anchored tag, the `!` popping in) — ~1.6s, inside the reveal
 * hold.
 *
 * Only facts behind a persistent `!` (`persistentBoardFacts` — the one Saved
 * rule): a reveal that saves nothing the board keeps (damage after armor)
 * has no Saved moment.
 *
 * Semantic, then latched:
 *
 *   * a fact is "saved now" only when it ARRIVES in K2's knowledge while the
 *     reveal of the very child that established it is on screen
 *     (`revealingChild` — the held child), so the cue sits on the exact
 *     object that child's reveal saved;
 *   * the first render seeds silently: a reload in the middle of an already
 *     established state (even mid-reveal) replays nothing — the persistent
 *     `!` is simply there;
 *   * a fact that arrives outside its own reveal (a late poll after the
 *     window) is latched silently too: no transient cue on answer time.
 *
 * Reads which facts exist and which child established them — never a value's
 * correctness.
 */
import { useEffect, useRef, useState } from "react";
import type { PersistentBoardFact } from "@/lib/journey/attention";

export const SAVED_NOW_MS = 1600;

export interface SavedNow {
  /** `objectKey#fact` of every fact saved just now. */
  facts: ReadonlySet<string>;
  /** K1 object keys (`player:zed:E`, `opponent:ahri`) that just saved a fact. */
  objects: ReadonlySet<string>;
}

const EMPTY: SavedNow = { facts: new Set(), objects: new Set() };

export function useSavedNow(saved: readonly PersistentBoardFact[], revealingChild: number | null): SavedNow {
  const seen = useRef<Set<string> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [now, setNow] = useState<SavedNow>(EMPTY);
  const entries = saved.map((s) => ({ id: s.id, object: s.objectKey, child: s.fact.child }));
  const signature = entries.map((e) => e.id).join("|");
  useEffect(() => {
    if (seen.current === null) { seen.current = new Set(entries.map((e) => e.id)); return; }
    const added = entries.filter((e) => !seen.current!.has(e.id));
    for (const e of entries) seen.current.add(e.id);
    const live = revealingChild === null ? [] : added.filter((e) => e.child === revealingChild);
    if (live.length === 0) return;
    setNow({ facts: new Set(live.map((e) => e.id)), objects: new Set(live.map((e) => e.object)) });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNow(EMPTY), SAVED_NOW_MS);
    // `signature` is `entries`, by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, revealingChild]);
  // The moment belongs to the reveal hold: it never outlives it (a late
  // arrival in a short window would otherwise run into the next child).
  useEffect(() => {
    if (revealingChild !== null) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setNow((cur) => (cur.facts.size ? EMPTY : cur));
  }, [revealingChild]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return now;
}
