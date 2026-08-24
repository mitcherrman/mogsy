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
import type {
  PlayerSlot, ResolvedRoundView, ResultKind, RoundTimelineView, TimelineNode,
  TimelineNodeState, TimelineNodeTag, TimelineSegmentKind,
} from "./viewTypes";
import { resultKind } from "./resultKind";
import type { TimelineTopic } from "@/components/quiz/timeline/timelineNodeModel";

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

// ARENA1 Step 2A declared every type below in `viewTypes` — `RoundTimeline`
// renders them and must not import upward. Step 5 moved this DERIVATION down
// beside them, out of `pages/quiz-ranked/`, because three modes now project a
// timeline and only one of them is Ranked. Re-exported unchanged, and
// `pages/quiz-ranked/roundTimeline` re-exports this whole module, so every
// historical import site still resolves.
export type {
  RoundTimelineView, TimelineNode, TimelineNodeState, TimelineNodeTag,
  TimelineSegmentKind,
};

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
  /**
   * RG2 — the round's published topic, by round number.
   *
   * A SECOND map rather than a richer value in the first, because the two
   * facts have genuinely different availability and collapsing them would
   * lose that. A segment's KIND is proven by its module id, which the live
   * snapshot and the settled transcript both carry — so a Meta Reflex block
   * is identifiable even from a settlement with no question in it. A TOPIC is
   * published on the question block, so it exists only while the round is the
   * live one. Rounds therefore routinely have a kind and no topic, and a
   * single map would have to invent a value for one of them.
   */
  topics: ReadonlyMap<number, TimelineTopic>;
}

export const EMPTY_OBSERVED_ROUND_KINDS: ObservedRoundKinds =
  Object.freeze({
    matchId: null,
    byRound: new Map<number, TimelineSegmentKind>(),
    topics: new Map<number, TimelineTopic>(),
  });

export interface RoundKindObservation {
  matchId: string | null;
  /** The live segment, and the round it describes. */
  segment: SegmentMeta | null;
  segmentRoundNumber: number | null;
  /** The last settled block's transcript, and the round it settled on. */
  settledReveal: { moduleId: string; moduleVersion: number } | null;
  settledRoundNumber: number | null;
  /**
   * RG2 — the topic the LIVE question block published, and the round it
   * describes. Momentary in exactly the way the segment is: it speaks for the
   * round in play and nothing else, which is why it is folded into a record
   * rather than read fresh each time the strip renders.
   */
  questionTopic?: TimelineTopic | null;
  questionRoundNumber?: number | null;
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
  const {
    matchId, segment, segmentRoundNumber, settledReveal, settledRoundNumber,
    questionTopic, questionRoundNumber,
  } = observation;
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
  // RG2: the live question's topic, for the round it names. A topic is
  // recorded ONCE per round and never overwritten — the first publication is
  // the round's own, and a later poll cannot re-describe a round that has
  // moved into history.
  const topicRound = questionRoundNumber ?? null;
  const newTopic = questionTopic && topicRound !== null && topicRound >= 1
    && !(sameMatch && previous.topics.has(topicRound))
    ? ([topicRound, questionTopic] as const)
    : null;

  if (sameMatch && !newTopic
      && facts.every(([r, k]) => previous.byRound.get(r) === k)) return previous;

  const byRound = new Map(sameMatch ? previous.byRound : []);
  for (const [round, kind] of facts) byRound.set(round, kind);
  const topics = new Map(sameMatch ? previous.topics : []);
  if (newTopic) topics.set(newTopic[0], newTopic[1]);
  // Bounded: a match has no round ceiling, so drop what the window can never
  // reach again rather than growing for its whole length. Both maps are
  // trimmed against the SAME floor, taken from the furthest round either has
  // seen — trimming them independently would let one forget a round the other
  // still describes, and a node with a topic and no kind is a worse state than
  // a node with neither.
  const highest = Math.max(0, ...byRound.keys(), ...topics.keys());
  if (byRound.size > OBSERVED_KINDS_MEMORY || topics.size > OBSERVED_KINDS_MEMORY) {
    const floor = highest - OBSERVED_KINDS_MEMORY + 1;
    for (const round of [...byRound.keys()]) if (round < floor) byRound.delete(round);
    for (const round of [...topics.keys()]) if (round < floor) topics.delete(round);
  }
  return { matchId, byRound, topics };
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
  /** RG2 — server-published topic per round (see `observeRoundKinds`). */
  observedTopics?: ReadonlyMap<number, TimelineTopic>;
  /** The bounded settlement ledger the duelist columns already read. */
  settlements: readonly ResolvedRoundView[];
  /** Which slot of a settlement is the viewer. The arena maps the viewer to p1. */
  viewerSlot: PlayerSlot;
  /**
   * ARENA1 Step 5 — A KNOWN PLAN LENGTH, or null/absent for a match that has
   * none. Ranked passes nothing and everything below is unchanged for it.
   *
   * Ranked ends on HP, so its round count is genuinely unbounded and the strip
   * has to be a moving window over an indefinite sequence — that is the whole
   * of the design above. A mode whose plan is FROZEN at N cards is a different
   * shape, not a smaller version of the same one: there is no future to sketch
   * past N, and with N in the 11–15 range there is no reason to hide any of it
   * behind a window either. So a finite plan renders as ITSELF — every
   * position, at once, with the marker travelling — and the window machinery is
   * simply not reached.
   *
   * It is a length and nothing more. It says how many positions exist; it says
   * nothing whatever about what is IN them, and `outcomes`/`observedKinds`
   * remain the only ways a node acquires a character.
   */
  totalRounds?: number | null;
  /**
   * ARENA1 Step 5 — the viewer's verdict per round, STATED by the mode.
   *
   * Ranked derives every verdict from `settlements`, because a PvP round's
   * verdict is a comparison of two players and the settlement is the authority
   * on it. A solo mode has no second player and therefore no settlement to
   * compare — its verdict is a property of the card, which its own backend
   * already reported. Supplying it here is what lets such a mode reach the
   * canonical strip without inventing a fake opponent to be compared against.
   *
   * Consulted only where a settlement does not already answer, so Ranked's
   * output is bit-identical whether or not this is passed.
   */
  outcomes?: ReadonlyMap<number, ResultKind>;
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
    observedKinds, observedTopics, outcomes, matchOver = false,
    totalRounds = null,
  } = input;

  const settled = Math.max(0, completedRounds);
  const byRoundSettlement = new Map<number, ResolvedRoundView>();
  for (const s of settlements) byRoundSettlement.set(s.roundNumber, s);

  /** A node's verdict: the settlement if there is one, else the mode's own. */
  const verdictFor = (rn: number, state: TimelineNodeState): ResultKind | null => {
    if (state !== "resolved") return null;
    const settlement = byRoundSettlement.get(rn);
    const viewer = settlement?.players[viewerSlot];
    const opponent = settlement?.players[viewerSlot === "p1" ? "p2" : "p1"];
    if (viewer && opponent) return resultKind(viewer, opponent);
    return outcomes?.get(rn) ?? null;
  };

  // ── the FINITE plan: the strip IS the plan ───────────────────────────────
  if (typeof totalRounds === "number" && totalRounds > 0) {
    const current = matchOver
      ? null
      : Math.min(totalRounds,
        currentTimelineRound(roundNumber, settled, segmentRoundNumber));
    const nodes: TimelineNode[] = [];
    for (let rn = 1; rn <= totalRounds; rn += 1) {
      const state: TimelineNodeState = rn === current ? "current"
        : rn <= settled ? "resolved" : "upcoming";
      nodes.push({
        roundNumber: rn,
        index: rn - 1,
        // Every position is on screen: a finite plan has no off-edge buffer
        // because it has no edge to travel over.
        visible: true,
        state,
        segmentKind: observedKinds?.get(rn) ?? null,
        outcome: verdictFor(rn, state),
        tag: null,
        // RG2: a finite plan's nodes carry no server-published topic today.
        // Null draws the neutral token, which is the truthful rendering of
        // "this client was not told" — never an inferred subject.
        topic: observedTopics?.get(rn) ?? null,
      });
    }
    const currentIndex = current === null ? null : current - 1;
    return {
      visibleNodes: totalRounds,
      // The marker rides the current position rather than settling at a fixed
      // anchor: with the whole plan on screen there is nothing for the track to
      // travel THROUGH, so the marker is the only thing that can move.
      anchorIndex: currentIndex ?? 0,
      windowStart: 1,
      currentIndex,
      currentRoundNumber: current,
      anchored: false,
      nodes,
    };
  }

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
    nodes.push({
      roundNumber: rn,
      index,
      visible: index >= 0 && index < TIMELINE_VISIBLE_NODES,
      state,
      // Only what the server stated. With no record, the node is neutral —
      // NOT "an ordinary round", and never derived from the ordinal.
      segmentKind: observedKinds?.get(rn) ?? null,
      outcome: verdictFor(rn, state),
      tag: null,
      // Same rule, same source of truth: only what the server published for
      // THIS round. Never derived from the ordinal.
      topic: observedTopics?.get(rn) ?? null,
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
