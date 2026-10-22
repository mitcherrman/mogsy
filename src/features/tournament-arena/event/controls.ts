/**
 * What an event page can ask for, independent of where events live.
 *
 * The fixture gateway answers synchronously and pushes revisions; the real
 * backend answers asynchronously and the page polls. The page only ever says
 * what the viewer pressed: every outcome, success or refusal, comes back as a
 * new projection (or as `notice` copy), never as an optimistic guess.
 */
import type { ArenaEvent } from "../contracts";
import type { ArenaGateway } from "../gateway/types";

export interface ArenaEventControls {
  source: "fixture" | "http";
  /** The viewer wants to play their node (opens the match room). */
  play: (nodeId: string) => void;
  /** The viewer's node game is live: go to it. */
  enterMatch: (nodeId: string) => void;
  /** The viewer marks themself ready in the lobby (real events only). */
  checkIn?: () => void;
  lock: (seedOrder?: readonly string[]) => void;
  start: () => void;
  walkover: (nodeId: string, side: 0 | 1) => void;
  /** Owner correction of a decided node (real events only). */
  override?: (nodeId: string) => void;
  /** FIXTURE ONLY. */
  stepResult?: (nodeId?: string) => void;
  /** FIXTURE ONLY. */
  reset?: () => void;
  /** The control in flight (its id), so its button can say so. */
  busy?: string | null;
  /** The last refusal or failure, as player-facing copy. */
  notice?: string | null;
}

/** The DEV harness: every press goes to the fixture gateway. */
export function fixtureEventControls(gateway: ArenaGateway, event: ArenaEvent, duelHref: (eventId: string, nodeId: string) => string): ArenaEventControls {
  const id = event.event_id;
  return {
    source: "fixture",
    play: (nodeId) => { gateway.play(id, nodeId); },
    enterMatch: (nodeId) => { window.location.assign(duelHref(id, nodeId)); },
    lock: (seedOrder) => { gateway.lock(id, seedOrder); },
    start: () => { gateway.start(id); },
    walkover: (nodeId, side) => { gateway.walkover(id, nodeId, side); },
    stepResult: (nodeId) => { gateway.stepResult(id, nodeId); },
    reset: () => { gateway.reset(id); },
  };
}
