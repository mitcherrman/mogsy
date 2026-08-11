/**
 * One-pass derived index over a VisualizationDataset.
 *
 * Built once at load; immutable afterwards. Gives the engine O(checkpoint
 * interval) random access to cumulative state without cloning the full
 * totals map per event (Phase 0 §H recommendation: client-side index, no
 * server checkpoints at these sizes).
 */
import type { Graph1Progression, VisualizationDataset } from "./contract";
import { resolveProgression } from "./contract";

export const CHECKPOINT_INTERVAL = 256;

export interface RaceIndex {
  dataset: VisualizationDataset;
  eventCount: number;
  /**
   * Discrete progression steps (Phase 4A). Position space is [0, stepCount];
   * step s covers events [stepStartIndices[s], stepStartIndices[s+1]) and all
   * of them apply together during that step's transition. Chronological
   * datasets get the identity mapping — one step per event, stepCount ==
   * eventCount — which reproduces pre-4A behaviour exactly.
   */
  stepCount: number;
  stepStartIndices: Int32Array;
  /** The validated progression declaration, or null for per-event races. */
  progression: Graph1Progression | null;
  /** dense entity table: id <-> index */
  entityIds: string[];
  entityIndexById: Map<string, number>;
  /** per event: dense entity index of events[i].rankedEntityId */
  eventEntityIdx: Int32Array;
  /** per event: delta (always 1 today, kept generic) */
  eventDelta: Int32Array;
  /** per event: winsDelta (0|1; absent in pre-1.1 payloads -> 0) */
  eventWinsDelta: Int32Array;
  /** per event: UTC year of occurredAt (for cadence + display) */
  eventYear: Int32Array;
  /** checkpoints: state AFTER applying the first `k = i * CHECKPOINT_INTERVAL`
   * events. totals[c][e] cumulative value; attain[c][e] sequence at which the
   * entity reached its current total (-1 when total is 0). */
  checkpointTotals: Int32Array[];
  checkpointWins: Int32Array[];
  checkpointAttain: Int32Array[];
  /** final cumulative totals (independent reduction, used by tests/UI) */
  finalTotals: Int32Array;
  finalWins: Int32Array;
  maxFinalTotal: number;
}

export function buildRaceIndex(dataset: VisualizationDataset): RaceIndex {
  const events = dataset.events;
  const eventCount = events.length;

  const entityIds: string[] = [];
  const entityIndexById = new Map<string, number>();
  for (const e of events) {
    if (!entityIndexById.has(e.rankedEntityId)) {
      entityIndexById.set(e.rankedEntityId, entityIds.length);
      entityIds.push(e.rankedEntityId);
    }
  }

  const n = entityIds.length;
  const eventEntityIdx = new Int32Array(eventCount);
  const eventDelta = new Int32Array(eventCount);
  const eventWinsDelta = new Int32Array(eventCount);
  const eventYear = new Int32Array(eventCount);

  const totals = new Int32Array(n);
  const wins = new Int32Array(n);
  const attain = new Int32Array(n).fill(-1);
  const checkpointTotals: Int32Array[] = [totals.slice()];
  const checkpointWins: Int32Array[] = [wins.slice()];
  const checkpointAttain: Int32Array[] = [attain.slice()];

  for (let i = 0; i < eventCount; i++) {
    const event = events[i];
    const idx = entityIndexById.get(event.rankedEntityId)!;
    eventEntityIdx[i] = idx;
    eventDelta[i] = event.delta;
    eventWinsDelta[i] = event.winsDelta ?? 0;
    eventYear[i] = Number(event.occurredAt.slice(0, 4));
    totals[idx] += event.delta;
    wins[idx] += event.winsDelta ?? 0;
    attain[idx] = i;
    if ((i + 1) % CHECKPOINT_INTERVAL === 0) {
      checkpointTotals.push(totals.slice());
      checkpointWins.push(wins.slice());
      checkpointAttain.push(attain.slice());
    }
  }

  let maxFinalTotal = 0;
  for (let e = 0; e < n; e++) maxFinalTotal = Math.max(maxFinalTotal, totals[e]);

  // Step map: declared progression when it exactly covers the event list,
  // else the identity mapping (one step per event — pre-4A semantics).
  const progression = resolveProgression(dataset);
  let stepStartIndices: Int32Array;
  if (progression) {
    const counts = progression.stepEventCounts;
    stepStartIndices = new Int32Array(counts.length + 1);
    let at = 0;
    for (let s = 0; s < counts.length; s++) {
      stepStartIndices[s] = at;
      at += counts[s];
    }
    stepStartIndices[counts.length] = at;
  } else {
    stepStartIndices = new Int32Array(eventCount + 1);
    for (let s = 0; s <= eventCount; s++) stepStartIndices[s] = s;
  }

  return {
    dataset,
    eventCount,
    stepCount: stepStartIndices.length - 1,
    stepStartIndices,
    progression,
    entityIds,
    entityIndexById,
    eventEntityIdx,
    eventDelta,
    eventWinsDelta,
    eventYear,
    checkpointTotals,
    checkpointWins,
    checkpointAttain,
    finalTotals: totals.slice(),
    finalWins: wins.slice(),
    maxFinalTotal,
  };
}

/**
 * Cumulative state after the first `k` events (0 <= k <= eventCount).
 * Returns fresh arrays — callers may not mutate the index.
 */
export function stateAfter(
  index: RaceIndex,
  k: number,
): { totals: Int32Array; wins: Int32Array; attain: Int32Array } {
  const clamped = Math.max(0, Math.min(index.eventCount, Math.floor(k)));
  const cp = Math.floor(clamped / CHECKPOINT_INTERVAL);
  const totals = index.checkpointTotals[cp].slice();
  const wins = index.checkpointWins[cp].slice();
  const attain = index.checkpointAttain[cp].slice();
  for (let i = cp * CHECKPOINT_INTERVAL; i < clamped; i++) {
    const e = index.eventEntityIdx[i];
    totals[e] += index.eventDelta[i];
    wins[e] += index.eventWinsDelta[i];
    attain[e] = i;
  }
  return { totals, wins, attain };
}
