/**
 * RG — the Ranked round timeline's presentation model.
 *
 * The arena reads top-to-bottom as: match state · the question · the duelists
 * · PROGRESSION. This module is the bottom region's whole derivation, kept out
 * of JSX so the rules below are readable and testable on their own.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE SHAPE OF A RANKED MATCH, AND WHY THE TIMELINE IS A MOVING WINDOW
 * ─────────────────────────────────────────────────────────────────────────
 *
 * A Ranked match ends when a player's HP reaches zero. Nothing bounds the
 * round count: a match may end on round 6, on round 27, or run far longer.
 * The timeline is therefore an ADAPTIVE MOVING VIEWPORT over an indefinite
 * sequence of rounds — never a fixed cycle, never a strip that re-bases.
 *
 * A fixed `TIMELINE_VISIBLE_NODES`-wide window slides one round per advance,
 * and the current round settles at a fixed `TIMELINE_ANCHOR_INDEX`. Over the
 * opening rounds the current node walks out to that anchor (there are no
 * rounds at or below zero to pad with, and inventing some would be a lie about
 * where the match is). From the anchor onward the current position is FIXED
 * and the rounds move underneath it — the property the whole design turns on.
 *
 *   R1 is current:   [R1]  R2   R3   R4   R5   R6   R7   R8   R9
 *   R3 is current:    R1   R2  [R3]  R4   R5   R6   R7   R8   R9
 *   R5 is current:    R1   R2   R3   R4  [R5]  R6   R7   R8   R9   <- anchored
 *   R6 is current:    R2   R3   R4   R5  [R6]  R7   R8   R9  R10
 *   R31 is current:  R27  R28  R29  R30 [R31] R32  R33  R34  R35
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT A NODE MAY CLAIM
 * ─────────────────────────────────────────────────────────────────────────
 *
 * PAST — what actually happened: that the round resolved, and the viewer's own
 * verdict where the bounded settlement ledger still holds it. A settlement
 * that has aged out leaves the node resolved with NO verdict rather than a
 * guessed one.
 *
 * CURRENT — what is being played, including its segment identity, because the
 * live snapshot states it.
 *
 * FUTURE — only that the round exists. Nothing else. There is no public field
 * carrying a future round's difficulty, family, module or role: the question
 * projection publishes question id, prompt, options, category, presentation
 * and option media, and a future round's question has not been generated at
 * all. A future node is therefore NEUTRAL, and this module derives NOTHING
 * about a round's character from its ordinal.
 *
 * That last rule is the one this model was rewritten for. The product does
 * have an intended twelve-segment pacing wave, and an earlier version of this
 * file made it the timeline's structure — predicting "medium", "hard",
 * "scenario" and Meta Reflex slots from the round number alone. That is a
 * product intention, not authoritative state, and it is not this view's to
 * assert. Pacing lives with whatever selects questions; the timeline is a view
 * OF rounds, never the authority on how they are chosen.
 */
import { META_REFLEX_MIXED_VERSION, type SegmentMeta } from "@/lib/ranked-public/contracts";
import { ITEM_COST_DUEL_MODULE_ID } from "@/lib/ranked-core/modules/itemCostDuelModule";
import type { PlayerSlot, ResolvedRoundView } from "@/lib/ranked-core/viewTypes";
import { resultKind, type ResultKind } from "@/components/ranked-arena/RoundResultBeat";
import type { RankedRole } from "@/lib/ranked-public/roles";

/**
 * How many round slots the strip shows at once.
 *
 * NINE, and odd on purpose: an odd count puts the anchor dead centre, which is
 * what makes "the marker holds still and the rounds move" legible rather than
 * looking like a slightly-off scroll. Nine also survives the arena's narrowest
 * desktop track — see the geometry measured in the phase report — with node
 * tokens still large enough to read their glyph.
 */
export const TIMELINE_VISIBLE_NODES = 9;

/** The slot the current round settles into once the match is past its opening. */
export const TIMELINE_ANCHOR_INDEX = 4;

/**
 * How many rounds of observed segment identity to remember.
 *
 * Bounded because a match is not: the map only ever needs to answer for rounds
 * the window can still show, and a generous margin past that costs nothing.
 */
export const OBSERVED_KINDS_MEMORY = 64;

/**
 * A round's segment identity, as stated by the SERVER.
 *
 * Two values, because two are all the public contract distinguishes: a Meta
 * Reflex block (`item_cost_duel` at the mixed-card version or later) and an
 * ordinary round. There is deliberately no difficulty here — no public field
 * carries one.
 */
export type TimelineSegmentKind = "meta-reflex" | "standard";

export type TimelineNodeState = "resolved" | "current" | "upcoming";

/**
 * RESERVED — a future per-question tag on a node.
 *
 * No public Ranked field carries one today: `players[].role` is the
 * PARTICIPANT's frozen League role (R1), not a property of the question, and
 * the question block publishes no role, difficulty or family. So
 * `projectRoundTimeline` returns `null` here for every node, always, and the
 * only thing this type does is fix the shape a later phase fills once the
 * backend publishes an authoritative tag. It is NOT a place to smuggle
 * `metadata_json`, to read a category string as a role, or to guess.
 */
export type TimelineNodeTag = { kind: "role"; role: RankedRole };

export interface TimelineNode {
  roundNumber: number;
  /**
   * Slot offset from `windowStart`.
   *
   * `-1` and `TIMELINE_VISIBLE_NODES` are the OFF-EDGE BUFFER: nodes that are
   * mounted but clipped, so a round leaving on the left and one arriving on
   * the right both travel rather than popping in and out of existence.
   */
  index: number;
  /** False for the two buffer slots. */
  visible: boolean;
  state: TimelineNodeState;
  /**
   * What the server said this round's segment is, or null when this client has
   * never been told. Null is the ordinary state for a future round and for a
   * past round played before this client connected — it is "not observed",
   * never "an ordinary round".
   */
  segmentKind: TimelineSegmentKind | null;
  /**
   * The viewer's settled verdict, in the arena's existing vocabulary, or null.
   *
   * Null on an unresolved round AND on a resolved round whose settlement has
   * aged out of the bounded ledger — a real and ordinary state, not an error.
   * Such a node stays resolved and simply carries no verdict.
   */
  outcome: ResultKind | null;
  /** Always null today. See `TimelineNodeTag`. */
  tag: TimelineNodeTag | null;
}

export interface RoundTimelineView {
  /** Constant for the whole match. Never varies round to round. */
  visibleNodes: number;
  /** The slot the current round occupies once the opening rounds are past. */
  anchorIndex: number;
  /** The round at slot 0. */
  windowStart: number;
  /** Slot of the current round, or null once the match is over. */
  currentIndex: number | null;
  currentRoundNumber: number | null;
  /** True once the current round has reached `anchorIndex` and stays there. */
  anchored: boolean;
  /** Ascending, INCLUDING the off-edge buffer. See `TimelineNode.index`. */
  nodes: TimelineNode[];
}

/** Is this segment a Meta Reflex block? The renderer registry's own rule. */
export function isMetaReflexSegment(
  moduleId: string | null | undefined, moduleVersion: number | null | undefined,
): boolean {
  return moduleId === ITEM_COST_DUEL_MODULE_ID
    && typeof moduleVersion === "number"
    && moduleVersion >= META_REFLEX_MIXED_VERSION;
}

// ------------------------------------------------- observed segment identity

/**
 * What this client has been TOLD about each round's segment, for one match.
 *
 * Accumulated rather than read from a single field because the two sources are
 * both momentary: the live snapshot speaks only for the round in play, and the
 * settled transcript only for the most recent block. Neither survives the next
 * round — so a Meta Reflex block would lose its mark on the timeline the
 * instant the match moved on, which is exactly the opposite of "preserve it as
 * the node moves into history".
 *
 * Every entry is something the server stated. Nothing here is inferred from an
 * ordinal, a category, or a schedule.
 */
export interface ObservedRoundKinds {
  matchId: string | null;
  byRound: ReadonlyMap<number, TimelineSegmentKind>;
}

export const EMPTY_OBSERVED_ROUND_KINDS: ObservedRoundKinds =
  Object.freeze({ matchId: null, byRound: new Map<number, TimelineSegmentKind>() });

export interface RoundKindObservation {
  matchId: string | null;
  /** The live segment, and the round it describes. */
  segment: SegmentMeta | null;
  segmentRoundNumber: number | null;
  /** The last settled block's transcript, and the round it settled on. */
  settledReveal: { moduleId: string; moduleVersion: number } | null;
  settledRoundNumber: number | null;
}

/**
 * Fold one snapshot's segment facts into the record.
 *
 * Returns the SAME object when nothing changed, so a caller can use identity to
 * decide whether to store it — the common case (nothing new this poll) costs an
 * allocation of nothing. A different `matchId` discards the record outright:
 * carrying one match's segment history into another would mislabel rounds.
 */
export function observeRoundKinds(
  previous: ObservedRoundKinds, observation: RoundKindObservation,
): ObservedRoundKinds {
  const { matchId, segment, segmentRoundNumber, settledReveal, settledRoundNumber } = observation;
  const sameMatch = previous.matchId === matchId;
  const facts: [number, TimelineSegmentKind][] = [];
  if (segment && segmentRoundNumber !== null && segmentRoundNumber >= 1) {
    facts.push([segmentRoundNumber,
      isMetaReflexSegment(segment.moduleId, segment.moduleVersion) ? "meta-reflex" : "standard"]);
  }
  if (settledReveal && settledRoundNumber !== null && settledRoundNumber >= 1) {
    facts.push([settledRoundNumber,
      isMetaReflexSegment(settledReveal.moduleId, settledReveal.moduleVersion)
        ? "meta-reflex" : "standard"]);
  }
  if (sameMatch && facts.every(([r, k]) => previous.byRound.get(r) === k)) return previous;

  const byRound = new Map(sameMatch ? previous.byRound : []);
  for (const [round, kind] of facts) byRound.set(round, kind);
  // Bounded: a match has no round ceiling, so drop what the window can never
  // reach again rather than growing for its whole length.
  if (byRound.size > OBSERVED_KINDS_MEMORY) {
    const floor = Math.max(...byRound.keys()) - OBSERVED_KINDS_MEMORY + 1;
    for (const round of [...byRound.keys()]) if (round < floor) byRound.delete(round);
  }
  return { matchId, byRound };
}

// -------------------------------------------------------- the window itself

/**
 * WHICH ROUND THE MARKER POINTS AT.
 *
 * The sticky round number is the right answer whenever it names a round that
 * has not settled. It stops being the right answer in two states the arena
 * genuinely passes through:
 *
 *   * the transition gap, where `activeRound` is briefly null and the sticky
 *     value still names the round that just settled; and
 *   * a phased segment's ability window, which has no engine round at all, so
 *     the sticky value lags the segment the player is actually in.
 *
 * In both, the first UNSETTLED round is the truthful position, and an active
 * segment that names a later round than that wins over it. The result is
 * monotonic: the marker never walks backwards, which is the property that
 * makes the strip stable across a settlement beat.
 */
export function currentTimelineRound(
  roundNumber: number | null, completedRounds: number,
  segmentRoundNumber: number | null,
): number {
  const settled = Math.max(0, completedRounds);
  if (roundNumber !== null && roundNumber > settled) return roundNumber;
  return Math.max(settled + 1, segmentRoundNumber ?? 0);
}

/**
 * The round at slot 0.
 *
 * `max(1, …)` is the entire opening-rounds rule: there is no round 0, so early
 * on the window simply starts at 1 and the current node sits wherever it
 * genuinely is. It walks out to the anchor over the first few rounds, and that
 * walk is itself a true statement about how far into the match the player is.
 */
export function timelineWindowStart(currentRound: number): number {
  return Math.max(1, currentRound - TIMELINE_ANCHOR_INDEX);
}

export interface RoundTimelineInput {
  /** The controller's sticky live round, or null before the first round. */
  roundNumber: number | null;
  /** Authoritative count of settled rounds. */
  completedRounds: number;
  /**
   * The round the LIVE segment describes.
   *
   * Carried explicitly rather than assumed to be the live round, because the
   * two legitimately disagree: a phased segment has no engine round while its
   * ability window is open, so the snapshot describes segment N while the
   * controller's sticky round number is still N-1.
   */
  segmentRoundNumber: number | null;
  /** Terminal match: there is no current round and no future to sketch. */
  matchOver?: boolean;
  /** Server-stated segment identity per round (see `observeRoundKinds`). */
  observedKinds?: ReadonlyMap<number, TimelineSegmentKind>;
  /** The bounded settlement ledger the duelist columns already read. */
  settlements: readonly ResolvedRoundView[];
  /** Which slot of a settlement is the viewer. The arena maps the viewer to p1. */
  viewerSlot: PlayerSlot;
}

/**
 * Project the visible window.
 *
 * Fixed size — `TIMELINE_VISIBLE_NODES` slots plus a clipped buffer node at
 * each edge — at every point in every match. The window never grows, never
 * re-bases, and never changes width; advancing a round moves it by exactly one
 * once the current round has reached the anchor.
 */
export function projectRoundTimeline(input: RoundTimelineInput): RoundTimelineView {
  const {
    roundNumber, completedRounds, segmentRoundNumber, settlements, viewerSlot,
    observedKinds, matchOver = false,
  } = input;

  const settled = Math.max(0, completedRounds);
  // A terminal match has no round in play. The window slides back so the strip
  // still shows a full set of slots ending on the round the match finished on,
  // and no future rounds are sketched past it — there are none.
  const over = matchOver && settled > 0;
  const current = over
    ? null : currentTimelineRound(roundNumber, settled, segmentRoundNumber);
  const windowStart = over
    ? Math.max(1, settled - TIMELINE_VISIBLE_NODES + 1)
    : timelineWindowStart(current as number);
  const currentIndex = current === null ? null : current - windowStart;
  const finalRound = over ? settled : null;

  const byRound = new Map<number, ResolvedRoundView>();
  for (const s of settlements) byRound.set(s.roundNumber, s);

  // One buffer slot beyond each edge, clamped so no round <= 0 is ever
  // produced and nothing is sketched past a finished match's last round.
  const first = Math.max(1, windowStart - 1);
  const lastSlot = windowStart + TIMELINE_VISIBLE_NODES;
  const last = finalRound === null ? lastSlot : Math.min(lastSlot, finalRound);

  const nodes: TimelineNode[] = [];
  for (let rn = first; rn <= last; rn += 1) {
    const index = rn - windowStart;
    const state: TimelineNodeState = rn === current ? "current"
      : rn <= settled ? "resolved" : "upcoming";
    const settlement = state === "resolved" ? byRound.get(rn) : undefined;
    const viewer = settlement?.players[viewerSlot];
    const opponent = settlement?.players[viewerSlot === "p1" ? "p2" : "p1"];
    nodes.push({
      roundNumber: rn,
      index,
      visible: index >= 0 && index < TIMELINE_VISIBLE_NODES,
      state,
      // Only what the server stated. With no record, the node is neutral —
      // NOT "an ordinary round", and never derived from the ordinal.
      segmentKind: observedKinds?.get(rn) ?? null,
      outcome: viewer && opponent ? resultKind(viewer, opponent) : null,
      tag: null,
    });
  }

  return {
    visibleNodes: TIMELINE_VISIBLE_NODES,
    anchorIndex: TIMELINE_ANCHOR_INDEX,
    windowStart,
    currentIndex,
    currentRoundNumber: current,
    anchored: currentIndex === TIMELINE_ANCHOR_INDEX,
    nodes,
  };
}
