/**
 * UX-3 — the adapter boundary between the Dynasty BO5 UI and its authority.
 *
 * The UI talks ONLY to this interface. Two implementations:
 *
 *   fixture  `fixtureServer.ts`, the in-browser contract double replaying
 *            recorded E1 machine output (UX-3; the default);
 *   live     `liveTransport.ts`, the E2 series API `/api/admin/dynasty/v2`
 *            (UX-4/UX-5; `?view=bo5&transport=live`). E2 hosts the series,
 *            the games and the Baron questions; `choosePlan`/`decide` stay
 *            client-side there until E3, and `settleObjective` is local (the
 *            server applied the grade with the third answer).
 *
 * Contract rules every implementation must keep (the UI relies on them):
 *  - every mutation quotes the series `rev` it was based on; a mismatch is
 *    `STALE_REVISION` and carries the fresh envelope;
 *  - every mutation carries a `requestId`; replaying the same id returns the
 *    original response and never re-applies the action (retry safety);
 *  - `advance` performs exactly one E1 transition;
 *  - no method accepts a correct count or a game outcome from the client.
 */
import type { BetweenGameDecisionId, SeriesChoice, SeriesEnvelope } from "./contracts";

export interface Mutation { rev: number; requestId: string }

/** `resume` found several unfinished series: the owner chooses (never picked silently). */
export interface SeriesChoices { choices: SeriesChoice[] }
export const isChoices = (r: SeriesEnvelope | SeriesChoices | null): r is SeriesChoices => !!r && "choices" in r;

export interface DynastySeriesTransport {
  readonly kind: "fixture" | "live";
  /** Read the caller's existing series, if any (resume after refresh / re-entry, or the choices to pick from). */
  resume(): Promise<SeriesEnvelope | SeriesChoices | null>;
  /** Resume one chosen series by id. */
  resumeSeries(seriesId: string): Promise<SeriesEnvelope>;
  /**
   * Create (or return the existing) series. `refuse` (automatic entry) fails with
   * `UNFINISHED_SERIES` + `choices` when another series is unfinished; `create`
   * (an explicit "New series") always starts one.
   */
  create(m: Omit<Mutation, "rev">, when?: "refuse" | "create"): Promise<SeriesEnvelope>;
  /** prep -> drafting: the series game plan (a legal lineup id) for game 1. */
  choosePlan(m: Mutation, lineupId: string): Promise<SeriesEnvelope>;
  /** drafting -> in_game: lock a legal lineup; the server starts the E1 game. */
  lockLineup(m: Mutation, lineupId: string): Promise<SeriesEnvelope>;
  /** One E1 transition. `expectedSeq` must equal the current snapshot seq. */
  advance(m: Mutation, expectedSeq: number): Promise<SeriesEnvelope>;
  /** Open or resume the hosted objective for the pending encounter. */
  openObjective(m: Mutation, encounterId: string): Promise<SeriesEnvelope>;
  /** Lock one answer (option index of the current question). The server grades it. */
  answerQuestion(m: Mutation, encounterId: string, index: number, option: number): Promise<SeriesEnvelope>;
  /** Settle the server grade into the game (live: local; E2 applied it on the third answer). No count is sent. */
  settleObjective(m: Mutation, encounterId: string): Promise<SeriesEnvelope>;
  /** between_games -> drafting. */
  decide(m: Mutation, decision: BetweenGameDecisionId, lineupId: string): Promise<SeriesEnvelope>;
  /** Leave the series on this client (fixture: discard it; live: the server keeps it, there is no abandon route). */
  abandon(): Promise<void>;
}

let seq = 0;
export function newRequestId(prefix = "ux3"): string {
  seq += 1;
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(16).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${seq}-${rnd}`;
}
