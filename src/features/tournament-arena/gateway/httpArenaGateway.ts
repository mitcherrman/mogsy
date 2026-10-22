/**
 * The REAL gateway, as far as it exists: nothing serves `/api/arena/*` yet
 * (handoff §5 is PROPOSED), so in production the Arena reports itself
 * unavailable with finished copy and never pretends. The day the backend
 * lands, this file gains fetches against `getBackendAuthHeaders()` and the
 * `isArenaEvent` validator; nothing that renders changes.
 */
import type { ArenaGateway } from "./types";

export const ARENA_UNAVAILABLE_COPY =
  "Tournament Arena events are not open yet. Brackets, custom matches and challenges arrive once the Arena service is live.";

const unavailable = () => ({ available: false, reason: ARENA_UNAVAILABLE_COPY, source: "http" as const });

export const httpArenaGateway: ArenaGateway = {
  availability: unavailable,
  getEvent: () => null,
  subscribe: () => () => undefined,
  listEvents: () => [],
  friends: () => [],
  createEvent: () => { throw new Error("Arena service unavailable"); },
  lock: () => null,
  start: () => null,
  play: () => null,
  stepResult: () => null,
  commitGame: () => null,
  walkover: () => null,
  reset: () => undefined,
};
