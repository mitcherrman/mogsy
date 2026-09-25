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
 * * **Fetched once.** A match id already loaded, already failed, or still in
 *   flight is never requested again, so re-filtering the record (all / study /
 *   ranked) or re-rendering costs nothing. A read CANCELLED because its row
 *   left the record is not a result: that id is fetched afresh if it returns.
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
import { getMatchReview } from "@/lib/ranked-public/client";
import type { MatchReviewView } from "@/lib/ranked-public/contracts";

/** Two at a time: enough that the visible rows fill promptly, few enough that
 *  a twenty-row record cannot behave like a load test. */
const CONCURRENCY = 2;

export type ReviewState =
  | { status: "pending" }
  | { status: "ready"; review: MatchReviewView }
  | { status: "unavailable" };

type SettledState = Exclude<ReviewState, { status: "pending" }>;

export interface MatchReviewStore {
  /** `undefined` for an id that is not currently requested and never settled;
   *  `pending` for a requested id that has not settled yet. */
  get(matchId: string): ReviewState | undefined;
}

/**
 * HISTORY-D — THE LIFETIME IS THE HOOK'S, NOT THE EFFECT'S.
 *
 * The first version scoped one AbortController to each effect run and marked
 * every id it queued as permanently CLAIMED. Any change to the requested set
 * (a filter, a new page, React StrictMode's mount→unmount→mount) aborted those
 * reads while leaving the ids claimed, so they were never asked for again and
 * their rows kept placeholder marks forever.
 *
 * Now each read owns its own controller, held in `inFlight` for exactly as
 * long as it is running:
 *
 * * an id that stays requested across a change keeps its read — no abort, no
 *   duplicate request;
 * * an id that drops out is aborted and forgotten, so asking for it again
 *   starts a fresh read;
 * * a read whose controller is no longer the one in `inFlight` is stale and
 *   its answer is dropped, whatever it says;
 * * only a SETTLED answer (ready / unavailable) is cached — a pending state is
 *   derived from "requested and not settled", never stored, so there is no
 *   pending entry to strand.
 */
export function useMatchReviews(matchIds: readonly string[]): MatchReviewStore {
  const [settled, setSettled] = useState<Readonly<Record<string, SettledState>>>({});
  // Mirrors of state the scheduler needs synchronously — a state update lands
  // a render later, which is long enough for the same id to be started twice.
  const settledIds = useRef<Set<string>>(new Set());
  const inFlight = useRef<Map<string, AbortController>>(new Map());
  const wanted = useRef<readonly string[]>([]);
  const alive = useRef(false);

  // Walk the requested ids in display order, starting reads until the limit.
  // Refs only, so one stable function serves every effect run and completion.
  const pump = useRef(() => {
    if (!alive.current) return;
    const flight = inFlight.current;
    for (const id of wanted.current) {
      if (flight.size >= CONCURRENCY) return;
      if (settledIds.current.has(id) || flight.has(id)) continue;
      const controller = new AbortController();
      flight.set(id, controller);
      const finish = (state: SettledState) => {
        // Superseded (removed, unmounted, or re-requested since): not ours.
        if (flight.get(id) !== controller || controller.signal.aborted) return;
        flight.delete(id);
        settledIds.current.add(id);
        setSettled((prev) => ({ ...prev, [id]: state }));
        pump.current();
      };
      getMatchReview(id, controller.signal).then(
        (review) => finish({ status: "ready", review }),
        () => finish({ status: "unavailable" }),
      );
    }
  });

  useEffect(() => {
    alive.current = true;
    const flight = inFlight.current;
    return () => {
      alive.current = false;
      flight.forEach((controller) => controller.abort());
      flight.clear();
    };
  }, []);

  const key = matchIds.join("|");
  useEffect(() => {
    wanted.current = matchIds;
    const requested = new Set(matchIds);
    inFlight.current.forEach((controller, id) => {
      if (requested.has(id)) return;
      controller.abort();
      inFlight.current.delete(id);
    });
    pump.current();
    // `matchIds` is a new array each render; the join is the value that
    // actually changes when the rendered record does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const requested = new Set(matchIds);
  return {
    get: (matchId: string) =>
      settled[matchId] ?? (requested.has(matchId) ? { status: "pending" } : undefined),
  };
}
