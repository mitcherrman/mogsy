/**
 * The Arena GATEWAY seam (handoff §6), in the style of
 * `src/lib/ranked-public/rankedInvite.ts`: a gateway either reports itself
 * unavailable with a reason a player can read, or it serves events. There is
 * no optimistic path and no "pretend it worked" branch.
 */
import type { ArenaEvent, ArenaEntrant } from "../contracts";
import type { GameResult } from "../engine/advance";
import type { DraftEventInput } from "../fixtures/scenarios";

export interface ArenaAvailability {
  available: boolean;
  /** Player-facing, null when available. */
  reason: string | null;
  /** `fixture` drives scripted scenarios and must be labelled as such. */
  source: "fixture" | "http";
}

export interface ArenaGateway {
  availability(): ArenaAvailability;
  /** The current projection, or null when unknown. */
  getEvent(eventId: string): ArenaEvent | null;
  /** Subscribe to revisions of one event; returns the unsubscribe. */
  subscribe(eventId: string, listener: (ev: ArenaEvent) => void): () => void;
  listEvents(): ArenaEvent[];
  friends(): ArenaEntrant[];
  createEvent(input: DraftEventInput & { invitees?: readonly string[] }): ArenaEvent;
  lock(eventId: string, seedOrder?: readonly string[]): ArenaEvent | null;
  start(eventId: string): ArenaEvent | null;
  play(eventId: string, nodeId: string): ArenaEvent | null;
  /** FIXTURE ONLY: commit the next scripted game of a node. */
  stepResult(eventId: string, nodeId?: string): ArenaEvent | null;
  /** Commit a played game to a node (what the backend terminal hook does). */
  commitGame(eventId: string, nodeId: string, result: GameResult): ArenaEvent | null;
  walkover(eventId: string, nodeId: string, side: 0 | 1): ArenaEvent | null;
  reset(eventId: string): void;
}
