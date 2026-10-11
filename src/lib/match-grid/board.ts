/**
 * MATCH GRID — pure board helpers. Seating knows tokens, groups and seat
 * indices, and nothing else: no domain, no data, no game words, no points.
 *
 * There is deliberately NO grader here. Correctness belongs to the authority
 * (server-side in production, the harness's private closure in the M1
 * prototype) and reaches the primitive only as `MatchReveal`. The browser
 * primitive therefore cannot compute the relation even by accident.
 */
import { snapToSocket, type SnapRect } from "@/lib/interaction-grammar/reconstruct";
import type { MatchPublic, MatchReveal, MatchResponse, MatchSeat, MatchValue } from "./contract";

export type { SnapRect };

export const MATCH_MIN_GROUPS = 2;
export const MATCH_MAX_GROUPS = 6;
export const MATCH_MIN_ENTITIES = 2;
export const MATCH_MAX_ENTITIES = 12;

/** Throws on a configuration the primitive cannot honour (fail loudly, never clamp). */
export function assertMatchContent(content: Pick<MatchPublic, "entities" | "groups" | "membership">): void {
  const { entities, groups, membership } = content;
  if (membership !== "one") {
    throw new Error(`Match: membership "${String(membership)}" is reserved; M1 seats each entity in exactly one group`);
  }
  if (groups.length < MATCH_MIN_GROUPS || groups.length > MATCH_MAX_GROUPS) {
    throw new Error(`Match: ${groups.length} groups; the board holds ${MATCH_MIN_GROUPS} to ${MATCH_MAX_GROUPS}`);
  }
  if (entities.length < MATCH_MIN_ENTITIES || entities.length > MATCH_MAX_ENTITIES) {
    throw new Error(`Match: ${entities.length} entities; the well holds ${MATCH_MIN_ENTITIES} to ${MATCH_MAX_ENTITIES}`);
  }
  const seen = new Set<string>();
  for (const g of groups) {
    if (!g.token) throw new Error("Match: a group has an empty token");
    if (seen.has(g.token)) throw new Error(`Match: duplicate group token "${g.token}"`);
    seen.add(g.token);
  }
  for (const e of entities) {
    if (!e.token) throw new Error("Match: an entity has an empty token");
    if (seen.has(e.token)) throw new Error(`Match: duplicate token "${e.token}" (entities and groups share one token space)`);
    seen.add(e.token);
  }
}

/** Tokens seated in `group`, by seat index. */
export function membersOf(value: MatchValue, group: string): { token: string; seat: number }[] {
  return Object.entries(value)
    .filter(([, s]) => s.group === group)
    .map(([token, s]) => ({ token, seat: s.seat }))
    .sort((a, b) => a.seat - b.seat);
}

/** The lowest seat index no member of `group` holds. Seats never compact, so a freed seat is reused. */
export function firstFreeSeat(value: MatchValue, group: string): number {
  const taken = new Set(membersOf(value, group).map((m) => m.seat));
  let seat = 0;
  while (taken.has(seat)) seat++;
  return seat;
}

/**
 * The board the primitive draws, whatever the caller passed: only dealt
 * entities, only dealt groups, one seat per entity, no two entities in one
 * seat of one group (the later one is re-seated). A stale value can therefore
 * never seat a stranger or stack two sigils.
 */
export function normalizeValue(content: Pick<MatchPublic, "entities" | "groups">, value: MatchValue): Record<string, MatchSeat> {
  const groups = new Set(content.groups.map((g) => g.token));
  const out: Record<string, MatchSeat> = {};
  for (const e of content.entities) {
    const s = value[e.token];
    if (!s || !groups.has(s.group)) continue;
    const free = Number.isInteger(s.seat) && s.seat >= 0 && !membersOf(out, s.group).some((m) => m.seat === s.seat);
    out[e.token] = { group: s.group, seat: free ? s.seat : firstFreeSeat(out, s.group) };
  }
  return out;
}

export type SeatOutcome =
  | { kind: "seated"; next: Record<string, MatchSeat> }
  | { kind: "moved"; next: Record<string, MatchSeat>; previous: string }
  /** Already seated there: nothing to do. */
  | { kind: "same"; next: Record<string, MatchSeat> }
  | { kind: "invalid"; next: Record<string, MatchSeat> };

/**
 * THE seating every input path calls: a pointer drop on a group's zone, a tap
 * on a group while holding an entity, Enter on a focused group while holding.
 * One function, so every path produces the same board and therefore the same
 * submitted `{assignments}`. Moving between groups frees the old seat first;
 * the new seat is the group's first free one (never a reflow of its members).
 */
export function seatEntity(
  content: Pick<MatchPublic, "entities" | "groups">,
  value: MatchValue,
  entity: string,
  group: string,
): SeatOutcome {
  const next: Record<string, MatchSeat> = { ...value };
  const known = content.entities.some((e) => e.token === entity) && content.groups.some((g) => g.token === group);
  if (!known) return { kind: "invalid", next };
  const current = value[entity];
  if (current?.group === group) return { kind: "same", next };
  delete next[entity];
  next[entity] = { group, seat: firstFreeSeat(next, group) };
  return current ? { kind: "moved", next, previous: current.group } : { kind: "seated", next };
}

/** Return one entity to the well. */
export function unseatEntity(value: MatchValue, entity: string): { next: Record<string, MatchSeat>; removed: string | null } {
  const next: Record<string, MatchSeat> = { ...value };
  const removed = value[entity]?.group ?? null;
  delete next[entity];
  return { next, removed };
}

/** Every entity seated: the only condition Lock has. */
export function isBoardComplete(content: Pick<MatchPublic, "entities">, value: MatchValue): boolean {
  return content.entities.length > 0 && content.entities.every((e) => value[e.token] !== undefined);
}

/** How many entities are still in the well. */
export function unsortedCount(content: Pick<MatchPublic, "entities">, value: MatchValue): number {
  return content.entities.filter((e) => value[e.token] === undefined).length;
}

/** The response: identity only, in dealt order, seats stripped. Throws on an incomplete board. */
export function toMatchResponse(content: Pick<MatchPublic, "entities">, value: MatchValue): MatchResponse {
  if (!isBoardComplete(content, value)) throw new Error("Match: Lock requires every entity to be seated");
  return { assignments: content.entities.map((e) => ({ entity: e.token, group: value[e.token]!.group })) };
}

/**
 * Which group a pointer drop lands in. Forgiving on purpose (the Reconstruct
 * R2 precedent): the drop region is the zones' bounding box grown by `slack`,
 * and inside it the NEAREST zone centre wins. Outside: null, nothing changes.
 */
export function snapToGroup(
  point: { x: number; y: number },
  zones: readonly SnapRect[],
  slack: { x: number; y: number },
): number | null {
  return snapToSocket(point, zones, slack);
}

/** One sigil's journey during the reveal: from the seat it was locked in to its canonical home. */
export interface RevealTravel {
  entity: string;
  from: MatchSeat;
  to: MatchSeat;
}

/**
 * The board after the reveal, as a DESCRIPTION of what the authority said:
 * a correct sigil keeps its seat; a wrong one travels to its canonical group's
 * first free seat (correct members keep theirs, so nothing already right
 * moves). Under "many" membership the first canonical group receives it.
 * Nothing here decides correctness: `entityCorrect` and `canonical` are read,
 * never computed.
 */
export function settleReveal(
  content: Pick<MatchPublic, "entities" | "groups">,
  locked: MatchValue,
  reveal: Pick<MatchReveal, "entityCorrect" | "canonical">,
): { settled: Record<string, MatchSeat>; travel: RevealTravel[] } {
  const base = normalizeValue(content, locked);
  const settled: Record<string, MatchSeat> = {};
  for (const e of content.entities) {
    const seat = base[e.token];
    if (seat && reveal.entityCorrect[e.token]) settled[e.token] = seat;
  }
  const travel: RevealTravel[] = [];
  for (const e of content.entities) {
    if (settled[e.token]) continue;
    const home = reveal.canonical[e.token]?.[0];
    const from = base[e.token];
    if (!home || !from) continue;
    const to = { group: home, seat: firstFreeSeat(settled, home) };
    settled[e.token] = to;
    travel.push({ entity: e.token, from, to });
  }
  return { settled, travel };
}

// ---------------------------------------------------------------- Plain speech

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** 0–12 as words, digits beyond; screen readers say both well, words read as speech. */
export function numberWord(n: number): string {
  return WORDS[n] ?? String(n);
}
