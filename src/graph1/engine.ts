/**
 * Pure deterministic race engine.
 *
 * `stateAt(index, position, config)` is the single authoritative function:
 * inputs fully determine output. It never touches Date.now/performance.now/
 * Math.random/DOM/React state — it is directly callable from a Remotion
 * frame (frame → position via timeline.ts → stateAt).
 *
 * Position semantics: fractional STEP index in [0, stepCount].
 *   k = floor(position) steps are fully applied; f = position - k is the
 *   presentation progress of step k (bar/rank interpolation toward the state
 *   after step k+1). A chronological dataset has one step per event, so this
 *   is the original fractional-event-index semantics unchanged; a progression
 *   dataset (Phase 4A) applies ALL of a step's events together during the
 *   transition — every champion moves simultaneously between level
 *   checkpoints, and the state at every integer position is exactly the
 *   canonical state at that checkpoint. Displayed integers always show the
 *   fully-applied totals at k — numbers step, bars glide.
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
import type { Graph1EventContext } from "./contract";
import type { RaceIndex } from "./raceIndex";
import { stateAfter } from "./raceIndex";

export interface RaceDisplayConfig {
  topN: number;
  /** snap to whole-event states (prefers-reduced-motion) */
  reducedMotion?: boolean;
}

/** Narrowly typed metric state per ranked entity (no generic analytics). */
export interface RaceEntityTotals {
  totalGames: number;
  wins: number;
  losses: number;
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
  /** interpolated cumulative wins (win-overlay extent) */
  winsValue: number;
  /** whole-game integer shown next to the bar (never fractional) */
  displayValue: number;
  /** canonical units at the checkpoint the settled label names — the value
   * Exact-Levels mode prints. During a step transition it HOLDS the settled
   * step's value; during the pre-race rise (no step settled yet) it names the
   * first checkpoint the bars are rising to. Never an interpolated number. */
  checkpointValue: number;
  /** whole-game cumulative wins at floor(position) */
  displayWins: number;
  /** derived: displayValue - displayWins */
  displayLosses: number;
  /** value / current leader value, in (0, 1] */
  barFraction: number;
  /** winsValue / current leader value — same scale as barFraction so the
   * win segment nests inside the total bar */
  winBarFraction: number;
  /** context of this entity's latest counted event at the current playback
   * position (the in-flight event for the incrementing/entering entity) */
  latestContext: Graph1EventContext | null;
  latestOccurredAt: string | null;
  /** 0..1 presentation opacity for enter/exit */
  opacity: number;
  entering: boolean;
  exiting: boolean;
}

export interface RaceFrameState {
  position: number;
  /** first event index of the current step, clamped to last event (equals
   * floor(position) for chronological datasets) */
  eventIndex: number;
  eventCount: number;
  /** floor(position), clamped to the last step */
  stepIndex: number;
  stepCount: number;
  /** progression label of the current step ("Level 7"), null when the
   * dataset is chronological */
  stepLabel: string | null;
  /** the last SETTLED step — equal to stepIndex at rest, one behind it
   * mid-transition. Exact-Levels mode labels the board with this so the
   * level name always matches the held checkpoint values. */
  settledStepIndex: number;
  settledStepLabel: string | null;
  /** occurredAt of the event driving the current step (display context) */
  occurredAt: string;
  year: number;
  /** full source context of the event driving the current step */
  currentContext: Graph1EventContext;
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
  const stepCount = index.stepCount;
  const clamped = Math.max(0, Math.min(stepCount, position));
  const k = Math.floor(clamped);
  const rawF = clamped - k;
  const f = config.reducedMotion ? 0 : rawF;

  const before = stateAfter(index, index.stepStartIndices[k]);
  // the in-flight step applies events [rangeStart, rangeEnd) together — for a
  // chronological dataset that range is exactly one +delta event, unchanged
  const rangeStart = k < stepCount ? index.stepStartIndices[k] : -1;
  const rangeEnd = k < stepCount ? index.stepStartIndices[k + 1] : -1;
  const hasInFlight = f > 0 && rangeStart >= 0 && rangeEnd > rangeStart;

  const orderA = rankOrder(index, before.totals, before.attain);

  let orderB = orderA;
  let totalsB = before.totals;
  let winsB = before.wins;
  let attainB = before.attain;
  if (hasInFlight) {
    totalsB = before.totals.slice();
    winsB = before.wins.slice();
    attainB = before.attain.slice();
    for (let i = rangeStart; i < rangeEnd; i++) {
      const e = index.eventEntityIdx[i];
      totalsB[e] += index.eventDelta[i];
      winsB[e] += index.eventWinsDelta[i];
      attainB[e] = i;
    }
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
    // the settled checkpoint's canonical units; the pre-race rise (k === 0,
    // nothing settled) shows the first checkpoint the bars are rising to
    const checkpointValue = k > 0 || f === 0 ? valueA : valueB;
    const winsA = before.wins[e];
    const winsW = winsB[e];
    const winsValue = winsA + (winsW - winsA) * f;

    // latest counted event for this entity at the current position; an
    // in-flight event becomes the context of the entity it increments
    // (attainB holds the in-flight touch when there is one, else the
    // last touch before the step — both semantics unchanged)
    const latestIdx = attainB[e];
    const latestEvent = latestIdx >= 0 ? index.dataset.events[latestIdx] : null;

    let opacity = 1;
    if (entering) opacity = eased;
    if (exiting) opacity = 1 - eased;

    rows.push({
      entityId: index.entityIds[e],
      rank: (slotA === offBoard ? slotB : slotA) + 1,
      y: slotA + (slotB - slotA) * eased,
      value,
      winsValue,
      displayValue: valueA,
      checkpointValue,
      displayWins: winsA,
      displayLosses: valueA - winsA,
      barFraction: Math.max(0, Math.min(1, value / leaderValue)),
      winBarFraction: Math.max(0, Math.min(1, winsValue / leaderValue)),
      latestContext: latestEvent ? latestEvent.context : null,
      latestOccurredAt: latestEvent ? latestEvent.occurredAt : null,
      opacity,
      entering,
      exiting,
    });
  }
  rows.sort((a, b) => a.y - b.y || (a.entityId < b.entityId ? -1 : 1));

  // display step: the in-flight step during a transition, the last step at
  // the end. Its first event supplies occurredAt/context (for chronological
  // datasets that IS event floor(position), the pre-4A behaviour).
  //
  // Progression datasets additionally correct the AT-REST boundary: paused
  // exactly on integer position k, the settled state IS step k's checkpoint,
  // so the label must name step k, not the next step. Mid-transition (f>0)
  // the destination step is the honest label. Chronological datasets keep
  // the original convention untouched.
  const displayStep =
    index.progression && f === 0 && k > 0
      ? Math.min(k - 1, stepCount - 1)
      : Math.min(k, stepCount - 1);
  const displayEventIndex = Math.min(
    index.stepStartIndices[displayStep],
    eventCount - 1,
  );
  const displayEvent = index.dataset.events[displayEventIndex];
  // the settled step never advances mid-transition: paused or in flight it
  // names the checkpoint whose values checkpointValue holds
  const settledStepIndex = Math.min(Math.max(k - 1, 0), stepCount - 1);
  return {
    position: clamped,
    eventIndex: displayEventIndex,
    eventCount,
    stepIndex: displayStep,
    stepCount,
    stepLabel: index.progression
      ? index.progression.stepLabels[displayStep] ?? null
      : null,
    settledStepIndex,
    settledStepLabel: index.progression
      ? index.progression.stepLabels[settledStepIndex] ?? null
      : null,
    occurredAt: displayEvent.occurredAt,
    year: index.eventYear[displayEventIndex],
    currentContext: displayEvent.context,
    leaderValue,
    rows,
  };
}
