/**
 * DEV-ONLY in-memory gateway: scripted scenarios plus events the Host Portal
 * creates in this tab. State survives in-app navigation (module memory) and a
 * reload (sessionStorage), never a server. Nothing here is reachable from a
 * production bundle: only the DEV route imports it.
 */
import type { ArenaEntrant, ArenaEvent } from "../contracts";
import { goLive, lockEvent, nextPlayableNode, recordGame, scriptedResult, startEvent, walkover } from "../engine/advance";
import { fixtureEntrants, fixtureFriends, VIEWER_ID } from "../fixtures/roster";
import { draftEvent, scenarioById, SCENARIOS, type DraftEventInput } from "../fixtures/scenarios";
import type { ArenaGateway } from "./types";

const STORE_KEY = "tournament-arena:fixture-events";

const events = new Map<string, ArenaEvent>();
const listeners = new Map<string, Set<(ev: ArenaEvent) => void>>();

function persist() {
  try {
    const created = [...events.values()].filter((e) => e.event_id.startsWith("aev_host_"));
    sessionStorage.setItem(STORE_KEY, JSON.stringify(created));
  } catch { /* optional */ }
}

function restore() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return;
    for (const ev of JSON.parse(raw) as ArenaEvent[]) events.set(ev.event_id, ev);
  } catch { /* optional */ }
}
if (typeof sessionStorage !== "undefined") restore();

function emit(ev: ArenaEvent) {
  events.set(ev.event_id, ev);
  persist();
  listeners.get(ev.event_id)?.forEach((l) => l(ev));
}

function ensure(eventId: string): ArenaEvent | null {
  const have = events.get(eventId);
  if (have) return have;
  const scenario = SCENARIOS.find((s) => `aev_${s.id.replace(/-/g, "_")}` === eventId || s.id === eventId);
  if (!scenario) return null;
  const ev = scenario.build();
  events.set(eventId, { ...ev, event_id: eventId });
  return events.get(eventId)!;
}

export function scenarioEventId(scenarioId: string) {
  return scenarioById(scenarioId).id;
}

export const fixtureArenaGateway: ArenaGateway = {
  availability: () => ({ available: true, reason: null, source: "fixture" }),
  getEvent: (id) => ensure(id),
  subscribe(id, listener) {
    let set = listeners.get(id);
    if (!set) {
      set = new Set();
      listeners.set(id, set);
    }
    set.add(listener);
    return () => { set!.delete(listener); };
  },
  listEvents: () => [...SCENARIOS.map((s) => ensure(s.id)!), ...[...events.values()].filter((e) => e.event_id.startsWith("aev_host_"))],
  friends: () => fixtureFriends(),
  createEvent(input) {
    const ev = draftEvent({ ...input, event_id: input.event_id || `aev_host_${Date.now().toString(36)}` });
    const invited = new Set(input.invitees ?? []);
    const roster = fixtureEntrants(32);
    ev.entrants = [
      roster[0],
      ...roster.slice(1).filter((e) => invited.has(e.profile_id)).map((e) => ({ ...e, status: "joined" as const })),
    ].slice(0, input.entrants);
    // Fill the remaining seats as joined-by-code players so a bracket exists.
    const missing = input.entrants - ev.entrants.length;
    if (missing > 0) {
      const taken = new Set(ev.entrants.map((e) => e.profile_id));
      ev.entrants.push(...roster.filter((e) => !taken.has(e.profile_id)).slice(0, missing).map((e, i) => ({ ...e, status: i % 3 === 2 ? ("invited" as const) : ("joined" as const) })));
    }
    ev.entrants.forEach((e, i) => { e.seed = i + 1; e.role = e.profile_id === VIEWER_ID ? "organizer" : "player"; });
    emit(ev);
    return ev;
  },
  lock(id, order) {
    const ev = ensure(id);
    if (!ev || ev.bracket) return ev;
    const next = lockEvent(ev, order);
    emit(next);
    return next;
  },
  start(id) {
    const ev = ensure(id);
    if (!ev || !ev.bracket) return ev;
    const next = startEvent(ev);
    emit(next);
    return next;
  },
  play(id, nodeId) {
    const ev = ensure(id);
    if (!ev) return null;
    const next = goLive(ev, nodeId);
    if (next !== ev) emit(next);
    return next;
  },
  stepResult(id, nodeId) {
    const ev = ensure(id);
    if (!ev?.bracket) return ev;
    const node = nodeId ? ev.bracket.nodes.find((n) => n.node_id === nodeId) ?? null : nextPlayableNode(ev);
    if (!node) return ev;
    let cur = ev;
    if (node.status === "ready") cur = goLive(cur, node.node_id);
    const live = cur.bracket!.nodes.find((n) => n.node_id === node.node_id)!;
    if (live.status !== "live") return ev;
    const seedOf = (pid: string | null) => cur.entrants.find((e) => e.profile_id === pid)?.seed ?? null;
    cur = recordGame(cur, node.node_id, scriptedResult(node.node_id, live.games.length + 1, seedOf(live.slots[0].profile_id), seedOf(live.slots[1].profile_id)));
    emit(cur);
    return cur;
  },
  commitGame(id, nodeId, result) {
    const ev = ensure(id);
    if (!ev?.bracket) return ev;
    let cur = ev;
    const node = cur.bracket!.nodes.find((n) => n.node_id === nodeId);
    if (!node) return ev;
    if (node.status === "ready") cur = goLive(cur, nodeId);
    const next = recordGame(cur, nodeId, result);
    if (next === cur) return ev;
    emit(next);
    return next;
  },
  walkover(id, nodeId, side) {
    const ev = ensure(id);
    if (!ev) return null;
    const next = walkover(ev, nodeId, side);
    if (next !== ev) emit(next);
    return next;
  },
  reset(id) {
    events.delete(id);
    const ev = ensure(id);
    if (ev) emit(ev);
  },
};

export const fixtureViewerId = VIEWER_ID;
export type { ArenaEntrant };
