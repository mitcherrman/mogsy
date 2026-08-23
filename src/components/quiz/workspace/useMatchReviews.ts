/**
 * MALT B1 — the ONE loader behind every question timeline in the record.
 *
 * Each Ranked row wants its own match's rounds, and a History pane can hold
 * twenty rows. Twenty components each owning a fetch would open twenty
 * simultaneous reads of one SQLite file the moment the tab opens, which is a
 * self-inflicted thundering herd on the same database live matches are being
 * settled in. So the ledger mounts this once and the rows read from it.
 *
 * WHAT IT GUARANTEES
 * ──────────────────
 * * **Bounded.** At most `CONCURRENCY` requests are in flight, and the queue
 *   is walked in DISPLAY order — the rows a reader is actually looking at fill
 *   first, and the twentieth row's timeline arrives while they are still
 *   reading the first.
 * * **Fetched once.** A match id already loaded, already failed, or already in
 *   flight is never requested again, so re-filtering the record (all / study /
 *   ranked) or re-rendering costs nothing.
 * * **Best-effort, exactly like the history read it sits beside.** A backend
 *   without the endpoint, a rate limit, a malformed body — every failure is
 *   "this row has no timeline", never a broken record. The timeline degrades
 *   to placeholder marks, which is still the truth: the match had that many
 *   rounds.
 *
 * It fetches nothing on its own initiative. `matchIds` is what the ledger is
 * currently rendering, so a reader who never opens History never issues one
 * of these reads.
 */
import { useEffect, useRef, useState } from "react";
import { getMatchReview, isAborted } from "@/lib/ranked-public/client";
import type { MatchReviewView } from "@/lib/ranked-public/contracts";

/** Two at a time: enough that the visible rows fill promptly, few enough that
 *  a twenty-row record cannot behave like a load test. */
const CONCURRENCY = 2;

export type ReviewState =
  | { status: "pending" }
  | { status: "ready"; review: MatchReviewView }
  | { status: "unavailable" };

export interface MatchReviewStore {
  /** `undefined` until the match has been reached in the queue. */
  get(matchId: string): ReviewState | undefined;
}

export function useMatchReviews(matchIds: readonly string[]): MatchReviewStore {
  const [states, setStates] = useState<Record<string, ReviewState>>({});
  // Which ids have been CLAIMED (in flight, done, or failed). Kept in a ref
  // rather than derived from `states` so a claim is visible to the effect
  // immediately — a state update lands a render later, which is long enough
  // for the same id to be claimed twice.
  const claimed = useRef<Set<string>>(new Set());
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  useEffect(() => {
    const pending = matchIds.filter((id) => !claimed.current.has(id));
    if (pending.length === 0) return;
    const controller = new AbortController();
    const queue = [...pending];
    queue.forEach((id) => claimed.current.add(id));
    setStates((prev) => {
      const next = { ...prev };
      queue.forEach((id) => {
        next[id] = { status: "pending" };
      });
      return next;
    });

    let stopped = false;
    const worker = async () => {
      for (;;) {
        const id = queue.shift();
        if (id === undefined || stopped) return;
        try {
          const review = await getMatchReview(id, controller.signal);
          if (stopped || cancelled.current) return;
          setStates((prev) => ({ ...prev, [id]: { status: "ready", review } }));
        } catch (e) {
          if (isAborted(e) || stopped || cancelled.current) return;
          setStates((prev) => ({ ...prev, [id]: { status: "unavailable" } }));
        }
      }
    };
    for (let i = 0; i < CONCURRENCY; i += 1) void worker();

    return () => {
      stopped = true;
      controller.abort();
    };
    // `matchIds` is a new array each render; the join is the value that
    // actually changes when the rendered record does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchIds.join("|")]);

  return {
    get: (matchId: string) => states[matchId],
  };
}
