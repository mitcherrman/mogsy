/**
 * Pure deterministic race engine.
 *
 * `stateAt(index, position, config)` is the single authoritative function:
 * inputs fully determine output. It never touches Date.now/performance.now/
 * Math.random/DOM/React state — it is directly callable from a Remotion
 * frame (frame → position via timeline.ts → stateAt).
 *
 * Position semantics: fractional event index in [0, eventCount].
 *   k = floor(position) events are fully applied; f = position - k is the
 *   presentation progress of event k (bar/rank interpolation toward the
 *   state after k+1 events). Displayed integers always show whole-game
 *   totals at k — numbers step, bars glide.
 *
 * Ranking rule (total order, tested):
 *   1. higher cumulative total first
 *   2. equal totals: earlier attainment of that total first — this IS
 *      "retain prior stable order" under +1 deltas (an incrementing entity
 *      passes an equal-valued rival only when it becomes strictly greater),
 *      and gives new entrants their first-positive-event order for free
 *   3. final fallback: entityId lexical order (unreachable for distinct
 *      attainment sequences, but keeps the comparator total)
 */
import type { RaceIndex } from "./raceIndex";
import { stateAfter } from "./raceIndex";

export interface RaceDisplayConfig {
  topN: number;
  /** snap to whole-event states (prefers-reduced-motion) */
  reducedMotion?: boolean;
}

export interface RaceRow {
  entityId: string;
  /** integer rank at floor(position), 1-based; entering rows report their
   * destination rank */
  rank: number;
  /** continuous vertical slot (0 = top row) for transform positioning */
  y: number;
  /** interpolated value for bar width */
  value: number;
  /** whole-game integer shown next to the bar (never fractional) */
  displayValue: number;
  /** value / current leader value, in (0, 1] */
  barFraction: number;
  /** 0..1 presentation opacity for enter/exit */
  opacity: number;
  entering: boolean;
  exiting: boolean;
}

export interface RaceFrameState {
  position: number;
  eventIndex: number; // floor(position), clamped to last event
  eventCount: number;
  /** occurredAt of the event driving the current step (display context) */
  occurredAt: string;
  year: number;
  leaderValue: number;
  rows: RaceRow[];
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** rank order of all entities with total > 0, per the documented rule */
function rankOrder(
  index: RaceIndex,
  totals: Int32Array,
  attain: Int32Array,
): number[] {
  const alive: number[] = [];
  for (let e = 0; e < index.entityIds.length; e++) {
    if (totals[e] > 0) alive.push(e);
  }
  alive.sort((a, b) => {
    if (totals[b] !== totals[a]) return totals[b] - totals[a];
    if (attain[a] !== attain[b]) return attain[a] - attain[b];
    return index.entityIds[a] < index.entityIds[b] ? -1 : 1;
  });
  return alive;
}

export function stateAt(
  index: RaceIndex,
  position: number,
  config: RaceDisplayConfig,
): RaceFrameState {
  const eventCount = index.eventCount;
  const clamped = Math.max(0, Math.min(eventCount, position));
  const k = Math.floor(clamped);
  const rawF = clamped - k;
  const f = config.reducedMotion ? 0 : rawF;

  const before = stateAfter(index, k);
  // state after k+1 events differs from k by exactly one +delta event
  const nextEvent = k < eventCount ? k : -1;

  const orderA = rankOrder(index, before.totals, before.attain);

  let orderB = orderA;
  let totalsB = before.totals;
  if (nextEvent >= 0 && f > 0) {
    totalsB = before.totals.slice();
    const attainB = before.attain.slice();
    totalsB[index.eventEntityIdx[nextEvent]] += index.eventDelta[nextEvent];
    attainB[index.eventEntityIdx[nextEvent]] = nextEvent;
    orderB = rankOrder(index, totalsB, attainB);
  }

  const topN = config.topN;
  const rankA = new Map<number, number>(); // entity idx -> 0-based slot at k
  orderA.forEach((e, slot) => rankA.set(e, slot));
  const rankB = new Map<number, number>();
  orderB.forEach((e, slot) => rankB.set(e, slot));

  // rows: union of entities visible at k or k+1
  const visible = new Set<number>();
  for (let s = 0; s < Math.min(topN, orderA.length); s++) visible.add(orderA[s]);
  for (let s = 0; s < Math.min(topN, orderB.length); s++) visible.add(orderB[s]);

  const eased = easeInOutCubic(f);
  const offBoard = topN; // one slot below the last visible row

  // interpolated leader value for bar scaling
  let leaderA = 0;
  let leaderB = 0;
  if (orderA.length > 0) leaderA = before.totals[orderA[0]];
  if (orderB.length > 0) leaderB = totalsB[orderB[0]];
  const leaderValue = leaderA + (leaderB - leaderA) * f || 1;

  const rows: RaceRow[] = [];
  for (const e of visible) {
    const slotA = rankA.has(e) && rankA.get(e)! < topN ? rankA.get(e)! : offBoard;
    const slotB = rankB.has(e) && rankB.get(e)! < topN ? rankB.get(e)! : offBoard;
    const entering = slotA === offBoard && slotB !== offBoard;
    const exiting = slotA !== offBoard && slotB === offBoard;

    const valueA = before.totals[e];
    const valueB = totalsB[e];
    const value = valueA + (valueB - valueA) * f;

    let opacity = 1;
    if (entering) opacity = eased;
    if (exiting) opacity = 1 - eased;

    rows.push({
      entityId: index.entityIds[e],
      rank: (slotA === offBoard ? slotB : slotA) + 1,
      y: slotA + (slotB - slotA) * eased,
      value,
      displayValue: valueA,
      barFraction: Math.max(0, Math.min(1, value / leaderValue)),
      opacity,
      entering,
      exiting,
    });
  }
  rows.sort((a, b) => a.y - b.y || (a.entityId < b.entityId ? -1 : 1));

  const displayEventIndex = Math.min(k, eventCount - 1);
  return {
    position: clamped,
    eventIndex: displayEventIndex,
    eventCount,
    occurredAt: index.dataset.events[displayEventIndex].occurredAt,
    year: index.eventYear[displayEventIndex],
    leaderValue,
    rows,
  };
}
