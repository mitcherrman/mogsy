/**
 * PURE bracket layout (handoff §7.2).
 *
 * Positions come from `(round, position)` and the slot-source graph, never
 * from DOM cell names. Connector geometry is derived from the same numbers,
 * so a `pathLength` animation always has a stable path, and a winner can
 * travel along the exact line that joins the two cards (`offset-path`).
 *
 * The bracket is drawn in CSS pixels at a given card size; the caller scales
 * the whole plane (or switches composition) to fit its box.
 */
import type { ArenaBracket, ArenaNode, ArenaSlotSource } from "../contracts";

export interface CardMetrics {
  width: number;
  height: number;
  /** Horizontal gap between rounds (the connector's run). */
  columnGap: number;
  /** Vertical gap between first-round cards. */
  rowGap: number;
  /** Where the two slot rows' centres sit, as fractions of the card height. */
  slotCentres: [number, number];
}

export const CARD_FULL: CardMetrics = { width: 236, height: 108, columnGap: 56, rowGap: 14, slotCentres: [0.3, 0.72] };
export const CARD_COMPACT: CardMetrics = { width: 196, height: 82, columnGap: 44, rowGap: 10, slotCentres: [0.3, 0.72] };

export interface NodeBox {
  node_id: string;
  round: number;
  position: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Edge {
  from: string;
  to: string;
  /** Which of the target's two slots the winner fills. */
  slot: 0 | 1;
  /** SVG path from the source card's right edge to the target slot row. */
  d: string;
  /** Straight-line length proxy for stroke-dash animation. */
  length: number;
}

export interface BracketPlane {
  width: number;
  height: number;
  rounds: number;
  boxes: NodeBox[];
  edges: Edge[];
  byId: Map<string, NodeBox>;
}

/** Nodes of one round in position order. */
export function nodesOfRound(nodes: readonly ArenaNode[], round: number): ArenaNode[] {
  return nodes.filter((n) => n.round === round).sort((a, b) => a.position - b.position);
}

/**
 * Lay out a single-elimination bracket. Round r's cards each span 2^(r-1)
 * first-round rows, so a card is always centred on the pair that feeds it.
 */
export function layoutBracket(bracket: Pick<ArenaBracket, "rounds" | "nodes">, m: CardMetrics): BracketPlane {
  const unit = m.height + m.rowGap;
  const boxes: NodeBox[] = [];
  const byId = new Map<string, NodeBox>();
  const firstRound = nodesOfRound(bracket.nodes, 1).length;
  for (const n of bracket.nodes) {
    const span = 2 ** (n.round - 1);
    const x = (n.round - 1) * (m.width + m.columnGap);
    const y = (n.position * span + (span - 1) / 2) * unit;
    const box: NodeBox = { node_id: n.node_id, round: n.round, position: n.position, x, y, width: m.width, height: m.height };
    boxes.push(box);
    byId.set(n.node_id, box);
  }
  const edges: Edge[] = [];
  for (const n of bracket.nodes) {
    n.slots.forEach((s, i) => {
      if (s.source.kind !== "winner_of") return;
      const from = byId.get(s.source.node_id);
      const to = byId.get(n.node_id);
      if (!from || !to) return;
      const sx = from.x + from.width;
      const sy = from.y + from.height / 2;
      const tx = to.x;
      const ty = to.y + to.height * m.slotCentres[i];
      const mx = Math.round(sx + (tx - sx) / 2);
      const d = `M${sx} ${sy}H${mx}V${ty}H${tx}`;
      const length = Math.abs(tx - sx) + Math.abs(ty - sy);
      edges.push({ from: from.node_id, to: n.node_id, slot: i as 0 | 1, d, length });
    });
  }
  const width = bracket.rounds * m.width + (bracket.rounds - 1) * m.columnGap;
  const height = Math.max(1, firstRound) * unit - m.rowGap;
  return { width, height, rounds: bracket.rounds, boxes, edges, byId };
}

/** The scale that fits a plane into a box, capped at 1 and floored at `min`. */
export function fitScale(plane: Pick<BracketPlane, "width" | "height">, boxW: number, boxH: number, min = 0.5): number {
  if (!(boxW > 0) || !(boxH > 0)) return 1;
  const s = Math.min(1, boxW / plane.width, boxH / plane.height);
  return Math.max(min, s);
}

/* ── generation ─────────────────────────────────────────────────────────── */

/** Smallest power of two ≥ n (2 for n ≤ 2). */
export function bracketSize(n: number): number {
  let s = 2;
  while (s < n) s *= 2;
  return s;
}

/**
 * Standard seeding order for a bracket of `size`: 1 v size, then the pairs
 * that keep the top seeds apart until the final ([1,8,4,5,2,7,3,6] for 8).
 */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const next: number[] = [];
    const total = order.length * 2 + 1;
    for (const s of order) next.push(s, total - s);
    order = next;
  }
  return order;
}

export interface GeneratedNode {
  node_id: string;
  round: number;
  position: number;
  slots: [ArenaSlotSource, ArenaSlotSource];
}

/**
 * Generate the nodes for `entrants` seeds (byes fill the slots beyond the
 * entrant count, against the top seeds, as the standard order dictates).
 */
export function generateBracket(entrantCount: number): { rounds: number; nodes: GeneratedNode[] } {
  const size = bracketSize(entrantCount);
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  const nodes: GeneratedNode[] = [];
  const idOf = (round: number, position: number) => `r${round}n${position + 1}`;
  for (let i = 0; i < size / 2; i++) {
    const a = order[i * 2];
    const b = order[i * 2 + 1];
    const src = (seed: number): ArenaSlotSource => (seed <= entrantCount ? { kind: "seed", seed } : { kind: "bye" });
    nodes.push({ node_id: idOf(1, i), round: 1, position: i, slots: [src(a), src(b)] });
  }
  for (let r = 2; r <= rounds; r++) {
    const count = size / 2 ** r;
    for (let i = 0; i < count; i++) {
      nodes.push({
        node_id: idOf(r, i),
        round: r,
        position: i,
        slots: [
          { kind: "winner_of", node_id: idOf(r - 1, i * 2) },
          { kind: "winner_of", node_id: idOf(r - 1, i * 2 + 1) },
        ],
      });
    }
  }
  return { rounds, nodes };
}

/** The node a winner advances to, and the slot it fills. */
export function nextSlotOf(nodeId: string, nodes: readonly ArenaNode[]): { node: ArenaNode; slot: 0 | 1 } | null {
  for (const n of nodes) {
    const i = n.slots.findIndex((s) => s.source.kind === "winner_of" && s.source.node_id === nodeId);
    if (i >= 0) return { node: n, slot: i as 0 | 1 };
  }
  return null;
}
