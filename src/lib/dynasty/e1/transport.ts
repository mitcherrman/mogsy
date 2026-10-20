/**
 * UX-3 — the adapter boundary between the Dynasty BO5 UI and its authority.
 *
 * The UI talks ONLY to this interface. Today the single implementation is the
 * in-browser contract double (`fixtureServer.ts`) that replays recorded E1
 * machine output. A live implementation needs, at minimum (none exist yet):
 *
 *   series   RUN-2: a persisted Combat v2 series / game (owner-gated migration)
 *   game     an owner-only route exposing E1 `advance` + `snapshot`
 *   objective E2B: `POST …/objectives/{encounter}/open|settle`, `GET …/objectives/{encounter}`
 *            (E2A §5); answers go to the Ranked child-match routes, never here
 *
 * Contract rules every implementation must keep (the UI relies on them):
 *  - every mutation quotes the series `rev` it was based on; a mismatch is
 *    `STALE_REVISION` and carries the fresh envelope;
 *  - every mutation carries a `requestId`; replaying the same id returns the
 *    original response and never re-applies the action (retry safety);
 *  - `advance` performs exactly one E1 transition;
 *  - no method accepts a correct count or a game outcome from the client.
 */
import type { BetweenGameDecisionId, SeriesEnvelope } from "./contracts";

export interface Mutation { rev: number; requestId: string }

export interface DynastySeriesTransport {
  readonly kind: "fixture" | "live";
  /** Read the caller's existing series, if any (resume after refresh / re-entry). */
  resume(): Promise<SeriesEnvelope | null>;
  /** Create (or return the existing) series. */
  create(m: Omit<Mutation, "rev">): Promise<SeriesEnvelope>;
  /** prep -> drafting: the series game plan (a legal lineup id) for game 1. */
  choosePlan(m: Mutation, lineupId: string): Promise<SeriesEnvelope>;
  /** drafting -> in_game: lock a legal lineup; the server starts the E1 game. */
  lockLineup(m: Mutation, lineupId: string): Promise<SeriesEnvelope>;
  /** One E1 transition. `expectedSeq` must equal the current snapshot seq. */
  advance(m: Mutation, expectedSeq: number): Promise<SeriesEnvelope>;
  /** E2 (pending): open or resume the hosted objective for the pending encounter. */
  openObjective(m: Mutation, encounterId: string): Promise<SeriesEnvelope>;
  /** E2 (pending; Ranked child routes): lock one answer. The server grades it. */
  answerQuestion(m: Mutation, encounterId: string, index: number, option: number): Promise<SeriesEnvelope>;
  /** E2 (pending): settle the server grade into the game. The body has no count. */
  settleObjective(m: Mutation, encounterId: string): Promise<SeriesEnvelope>;
  /** between_games -> drafting. */
  decide(m: Mutation, decision: BetweenGameDecisionId, lineupId: string): Promise<SeriesEnvelope>;
  /** Leave the series and discard it (dev only). */
  abandon(): Promise<void>;
}

let seq = 0;
export function newRequestId(prefix = "ux3"): string {
  seq += 1;
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(16).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${seq}-${rnd}`;
}
