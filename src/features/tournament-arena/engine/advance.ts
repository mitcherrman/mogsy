/**
 * FIXTURE advancement — what the backend's `arena.on_match_terminal` hook
 * would do, written as a pure function so the visual layer can be driven by
 * scripted scenarios and unit-tested without a server.
 *
 * NOTHING HERE IS AUTHORITATIVE. In production every one of these transitions
 * happens inside the LCS SQLite transaction that commits the Ranked result
 * (handoff §5.4); the frontend only ever reads the resulting projection.
 */
import type { ArenaEvent, ArenaGame, ArenaNode } from "../contracts";
import { hashString } from "../identity";
import { generateBracket, nextSlotOf } from "../bracket/layout";

export const winsNeeded = (bestOf: number) => Math.floor(bestOf / 2) + 1;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function readyIfFilled(n: ArenaNode): void {
  if (n.status === "pending" && n.slots[0].profile_id && n.slots[1].profile_id) n.status = "ready";
}

/** Fill `winner` into the node that waits for `nodeId`'s result. */
function advanceWinner(ev: ArenaEvent, nodeId: string, winner: string): void {
  const next = nextSlotOf(nodeId, ev.bracket!.nodes);
  if (!next) {
    ev.status = "complete";
    ev.champion_profile_id = winner;
    const champ = ev.entrants.find((e) => e.profile_id === winner);
    if (champ) champ.status = "champion";
    return;
  }
  next.node.slots[next.slot].profile_id = winner;
  readyIfFilled(next.node);
}

/**
 * Lock the field: seed entrants (in the given order, or by join order), build
 * the nodes, resolve byes as walkovers and mark round 1 ready.
 */
export function lockEvent(input: ArenaEvent, seedOrder?: readonly string[]): ArenaEvent {
  const ev = clone(input);
  const players = ev.entrants.filter((e) => e.status !== "withdrawn" && e.status !== "invited");
  const ordered = seedOrder
    ? seedOrder.map((id) => players.find((p) => p.profile_id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p))
    : players;
  ordered.forEach((p, i) => { p.seed = i + 1; p.status = "checked_in"; });
  const gen = generateBracket(ordered.length);
  const bySeed = new Map(ordered.map((p) => [p.seed!, p.profile_id]));
  const nodes: ArenaNode[] = gen.nodes.map((g) => ({
    node_id: g.node_id,
    round: g.round,
    position: g.position,
    section: "main",
    best_of: g.round === gen.rounds ? ev.best_of : (ev.best_of === 5 ? 3 : ev.best_of),
    status: "pending",
    slots: [
      { source: g.slots[0], profile_id: g.slots[0].kind === "seed" ? bySeed.get(g.slots[0].seed) ?? null : null, wins: 0 },
      { source: g.slots[1], profile_id: g.slots[1].kind === "seed" ? bySeed.get(g.slots[1].seed) ?? null : null, wins: 0 },
    ],
    winner_profile_id: null,
    current_match_id: null,
    ready_deadline: null,
    games: [],
  }));
  ev.bracket = { type: "single_elimination", rounds: gen.rounds, nodes };
  ev.status = "locked";
  ev.revision += 1;
  // Byes: the seeded side walks over, and the next node fills at once.
  for (const n of nodes) {
    const bye = n.slots.findIndex((s) => s.source.kind === "bye");
    if (bye < 0) continue;
    const other = n.slots[1 - bye];
    n.status = "bye";
    n.winner_profile_id = other.profile_id;
    if (other.profile_id) advanceWinner(ev, n.node_id, other.profile_id);
  }
  for (const n of nodes) readyIfFilled(n);
  return ev;
}

/** Start the event: round-1 nodes go `ready` → the organizer may open play. */
export function startEvent(input: ArenaEvent): ArenaEvent {
  const ev = clone(input);
  if (!ev.bracket) return ev;
  ev.status = "running";
  ev.revision += 1;
  for (const n of ev.bracket.nodes) readyIfFilled(n);
  return ev;
}

/** A node goes live (both entrants pressed Play). */
export function goLive(input: ArenaEvent, nodeId: string): ArenaEvent {
  const ev = clone(input);
  const n = ev.bracket?.nodes.find((x) => x.node_id === nodeId);
  if (!n || n.status !== "ready") return input;
  n.status = "live";
  n.current_match_id = `fx_${nodeId}_${n.games.length + 1}`;
  ev.revision += 1;
  return ev;
}

export interface GameResult {
  winner: 0 | 1 | null;
  score_a: number;
  score_b: number;
  outcome?: ArenaGame["outcome"];
}

/** Commit one game's result to a node; advance when the series is decided. */
export function recordGame(input: ArenaEvent, nodeId: string, result: GameResult): ArenaEvent {
  const ev = clone(input);
  const n = ev.bracket?.nodes.find((x) => x.node_id === nodeId);
  if (!n || (n.status !== "live" && n.status !== "ready")) return input;
  const game: ArenaGame = {
    game_index: n.games.length + 1,
    winner_profile_id: result.winner === null ? null : n.slots[result.winner].profile_id,
    outcome: result.outcome ?? (result.winner === null ? "draw" : "decisive"),
    score_a: result.score_a,
    score_b: result.score_b,
  };
  n.games.push(game);
  if (result.winner !== null) n.slots[result.winner].wins += 1;
  ev.revision += 1;
  const need = winsNeeded(n.best_of);
  const decided = n.slots.findIndex((s) => s.wins >= need);
  if (decided >= 0) {
    n.status = result.outcome === "forfeit" ? "walkover" : "complete";
    n.winner_profile_id = n.slots[decided].profile_id;
    n.current_match_id = null;
    const loser = n.slots[1 - decided].profile_id;
    const le = ev.entrants.find((e) => e.profile_id === loser);
    if (le) le.status = "eliminated";
    if (n.winner_profile_id) advanceWinner(ev, n.node_id, n.winner_profile_id);
  } else {
    // Draws replay (decision D4); a decided game keeps the node live.
    n.status = "live";
    n.current_match_id = `fx_${nodeId}_${n.games.length + 1}`;
  }
  return ev;
}

/** Organizer walkover: the named side advances without a game. */
export function walkover(input: ArenaEvent, nodeId: string, side: 0 | 1): ArenaEvent {
  const ev = clone(input);
  const n = ev.bracket?.nodes.find((x) => x.node_id === nodeId);
  if (!n || n.status === "complete" || n.status === "walkover" || n.status === "bye") return input;
  const winner = n.slots[side].profile_id;
  if (!winner) return input;
  n.status = "walkover";
  n.winner_profile_id = winner;
  n.slots[side].wins = winsNeeded(n.best_of);
  n.current_match_id = null;
  const le = ev.entrants.find((e) => e.profile_id === n.slots[1 - side].profile_id);
  if (le) le.status = "eliminated";
  ev.revision += 1;
  advanceWinner(ev, n.node_id, winner);
  return ev;
}

/** A deterministic, believable game result for a fixture node. */
export function scriptedResult(nodeId: string, gameIndex: number, seedA: number | null, seedB: number | null): GameResult {
  const h = hashString(`${nodeId}:${gameIndex}`);
  const base = 14 + (h % 9);
  const spread = 2 + ((h >>> 8) % 7);
  // The better seed wins more often, by the seed gap (never certain); a draw is rare.
  const gap = (seedB ?? 16) - (seedA ?? 16);
  const pA = Math.max(28, Math.min(78, 53 + gap * 5));
  const roll = (h >>> 16) % 100;
  if (roll < 5) return { winner: null, score_a: base, score_b: base };
  const aWins = roll < pA;
  return aWins ? { winner: 0, score_a: base + spread, score_b: base } : { winner: 1, score_a: base, score_b: base + spread };
}

/** The next node a scripted scenario would play: the lowest round first, live before ready. */
export function nextPlayableNode(ev: ArenaEvent): ArenaNode | null {
  if (!ev.bracket) return null;
  const live = ev.bracket.nodes.filter((n) => n.status === "live").sort((a, b) => a.round - b.round || a.position - b.position);
  if (live.length) return live[0];
  const ready = ev.bracket.nodes.filter((n) => n.status === "ready").sort((a, b) => a.round - b.round || a.position - b.position);
  return ready[0] ?? null;
}

/** Whether all nodes of a round are decided. */
export function roundComplete(ev: ArenaEvent, round: number): boolean {
  if (!ev.bracket) return false;
  const nodes = ev.bracket.nodes.filter((n) => n.round === round);
  return nodes.length > 0 && nodes.every((n) => n.status === "complete" || n.status === "walkover" || n.status === "bye");
}
