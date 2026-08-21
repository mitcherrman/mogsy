/**
 * RG — the round timeline's model.
 *
 * Two things are pinned here, and the second matters more than the first:
 *
 *  1. THE WINDOW — a fixed-width viewport that slides one round per advance
 *     over an indefinite sequence. A Ranked match ends on HP, so there is no
 *     round ceiling: the model must behave identically at round 3, round 13
 *     and round 100, and must never re-base, reset or change width.
 *
 *  2. TRUTHFULNESS — a node may state what the SERVER said and what the
 *     settlement recorded, and nothing else. In particular nothing about a
 *     round's character may be derived from its ordinal. The product's
 *     twelve-segment pacing intention is not authoritative public state, and
 *     an earlier version of this model asserted it as fact; these tests exist
 *     partly to keep it from coming back.
 */
import { describe, expect, it } from "vitest";
import { adaptBackendSettlement } from "@/lib/ranked-core/backend/adaptBackendSettlement";
import type { ResolvedRoundView } from "@/lib/ranked-core/viewTypes";
import { LEGACY_SEGMENT, type SegmentMeta } from "@/lib/ranked-public/contracts";
import {
  EMPTY_OBSERVED_ROUND_KINDS, OBSERVED_KINDS_MEMORY, TIMELINE_ANCHOR_INDEX,
  TIMELINE_VISIBLE_NODES, currentTimelineRound, isMetaReflexSegment,
  observeRoundKinds, projectRoundTimeline, timelineWindowStart,
  type RoundTimelineInput, type TimelineSegmentKind,
} from "./roundTimeline";

// Same derivation the controller uses — the adapter exports the function, not
// its payload type.
type ResolvedProjection = Parameters<typeof adaptBackendSettlement>[0];

const T = "2026-07-18T12:00:08+00:00";
type Outcome = "correct" | "incorrect" | "timeout";

function player(id: string, outcome: Outcome) {
  const correct = outcome === "correct";
  return {
    player_id: id, class_id: "tank", outcome,
    submitted_at: outcome === "timeout" ? null : T,
    answered_first: correct, timed_out: outcome === "timeout",
    selected_ability_id: null,
    damage: {
      base_damage_dealt: correct ? 14 : 0, outgoing_bonus: 0,
      final_damage_dealt: correct ? 14 : 0, shield_absorbed: 0,
      incoming_reduction: 0, final_damage_received: correct ? 0 : 14,
    },
    hp_before: 170, hp_after: correct ? 170 : 156, reached_zero_hp: false,
    xp_gained: 0, total_xp_after: 0, level_before: 1, level_after: 1,
    level_up_events: [], charge_consumed: false, consumed_ability_id: null,
    remaining_charges: {},
    carryover: { effects_gained: [], effects_consumed: [], consecutive_correct: 0 },
    combat_lab_unlock_delta_seconds: 0,
  };
}

/** A real settlement for `round`, through the real adapter. */
function settled(round: number, mine: Outcome, theirs: Outcome): ResolvedRoundView {
  const payload = {
    match_id: "m1", round_number: round, question_id: `q${round}`,
    end_reason: mine === "timeout" && theirs === "timeout"
      ? "deadline_expired" : "both_answered",
    started_at: T, original_deadline: T, final_deadline: T,
    pressure_applied: false,
    players: [player("userA", mine), player("userB", theirs)],
    next_round_duration_seconds: 30, next_round_duration_delta: 0,
    match_over: false, winner_id: null, completion_reason: null,
  };
  return adaptBackendSettlement(payload as unknown as ResolvedProjection,
    { p1PlayerId: "userA", p2PlayerId: "userB" });
}

const metaReflexSegment = (segmentNumber: number): SegmentMeta => ({
  ...LEGACY_SEGMENT, moduleId: "item_cost_duel", moduleVersion: 4,
  challengeCount: 5, segmentNumber,
});
const quizSegment = (segmentNumber: number): SegmentMeta => ({
  ...LEGACY_SEGMENT, segmentNumber,
});

function project(over: Partial<RoundTimelineInput> = {}) {
  return projectRoundTimeline({
    roundNumber: 1, completedRounds: 0, segmentRoundNumber: null,
    settlements: [], viewerSlot: "p1", ...over,
  });
}

/** The window as the player sees it: the visible slots, in order. */
const visibleRounds = (view: ReturnType<typeof project>) =>
  view.nodes.filter((n) => n.visible).map((n) => n.roundNumber);

/** Project for a live match sitting on `round` with everything before settled. */
const atRound = (round: number, over: Partial<RoundTimelineInput> = {}) =>
  project({ roundNumber: round, completedRounds: round - 1, ...over });

// ------------------------------------------------------------- the geometry

describe("the window's shape", () => {
  it("is a fixed odd width with a centred anchor", () => {
    expect(TIMELINE_VISIBLE_NODES).toBe(9);
    expect(TIMELINE_ANCHOR_INDEX).toBe(4);
    // Odd width + centred anchor is what makes "the marker holds still" read
    // as a stable centre rather than an off-balance scroll.
    expect(TIMELINE_VISIBLE_NODES % 2).toBe(1);
    expect(TIMELINE_ANCHOR_INDEX).toBe((TIMELINE_VISIBLE_NODES - 1) / 2);
  });

  it("starts the window at the anchor offset, never below round 1", () => {
    expect(timelineWindowStart(1)).toBe(1);
    expect(timelineWindowStart(4)).toBe(1);
    expect(timelineWindowStart(5)).toBe(1);
    expect(timelineWindowStart(6)).toBe(2);
    expect(timelineWindowStart(31)).toBe(27);
    expect(timelineWindowStart(100)).toBe(96);
  });
});

// -------------------------------------------------------- opening rounds

describe("the opening rounds — the current node walks out to the anchor", () => {
  it("puts round 1 in the first slot, with the rest of the window ahead of it", () => {
    const view = atRound(1);
    expect(visibleRounds(view)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(view.currentIndex).toBe(0);
    expect(view.anchored).toBe(false);
  });

  it("advances the current node one slot per round while the window holds still", () => {
    for (let round = 1; round <= TIMELINE_ANCHOR_INDEX + 1; round += 1) {
      const view = atRound(round);
      expect(view.windowStart, `round ${round}`).toBe(1);
      expect(visibleRounds(view)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(view.currentIndex, `round ${round}`).toBe(round - 1);
    }
  });

  it("reaches the anchor on round 5 and reports it", () => {
    const before = atRound(4);
    expect(before.currentIndex).toBe(3);
    expect(before.anchored).toBe(false);

    const at = atRound(5);
    expect(at.currentIndex).toBe(TIMELINE_ANCHOR_INDEX);
    expect(at.anchored).toBe(true);
    expect(visibleRounds(at)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("invents no round at or below zero to centre the opening", () => {
    for (const round of [1, 2, 3, 4]) {
      const view = atRound(round);
      expect(Math.min(...view.nodes.map((n) => n.roundNumber))).toBe(1);
      expect(view.nodes.every((n) => n.roundNumber >= 1)).toBe(true);
    }
  });
});

// ---------------------------------------------------------- the slide

describe("past the anchor — the window slides and the current node holds still", () => {
  it("moves the window by exactly one round per advance", () => {
    expect(visibleRounds(atRound(6))).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(visibleRounds(atRound(7))).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(visibleRounds(atRound(8))).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(visibleRounds(atRound(31))).toEqual([27, 28, 29, 30, 31, 32, 33, 34, 35]);
  });

  it("keeps the current node at the same slot for every round past the anchor", () => {
    for (const round of [5, 6, 7, 8, 12, 13, 25, 31, 100, 1000]) {
      const view = atRound(round);
      expect(view.currentIndex, `round ${round}`).toBe(TIMELINE_ANCHOR_INDEX);
      expect(view.anchored, `round ${round}`).toBe(true);
      expect(view.nodes.find((n) => n.state === "current")!.roundNumber).toBe(round);
    }
  });

  it("advances the window start by one whenever the round does", () => {
    let previousStart = atRound(5).windowStart;
    for (let round = 6; round <= 40; round += 1) {
      const start = atRound(round).windowStart;
      expect(start - previousStart, `round ${round}`).toBe(1);
      previousStart = start;
    }
  });
});

// ------------------------------------------------------ no cycle anywhere

describe("there is no twelve-round cycle", () => {
  it("treats 12 → 13 as one ordinary step, with no reset", () => {
    const twelve = atRound(12);
    const thirteen = atRound(13);
    expect(visibleRounds(twelve)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(visibleRounds(thirteen)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    // The window moved by one, exactly like every other advance...
    expect(thirteen.windowStart - twelve.windowStart).toBe(1);
    // ...the current node did not jump back to the left...
    expect(thirteen.currentIndex).toBe(twelve.currentIndex);
    // ...and eight of the nine visible rounds are the same ones.
    const shared = visibleRounds(thirteen).filter((r) => visibleRounds(twelve).includes(r));
    expect(shared).toHaveLength(8);
  });

  it("behaves identically at every multiple of twelve", () => {
    for (const round of [12, 13, 24, 25, 36, 37, 120, 121]) {
      const view = atRound(round);
      expect(view.currentIndex, `round ${round}`).toBe(TIMELINE_ANCHOR_INDEX);
      expect(view.windowStart, `round ${round}`).toBe(round - TIMELINE_ANCHOR_INDEX);
      expect(visibleRounds(view)).toHaveLength(TIMELINE_VISIBLE_NODES);
    }
  });
});

// -------------------------------------------------------------- invariants

describe("invariants that hold for every round of every match", () => {
  const ROUNDS = [1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 25, 26, 40, 100, 517];

  it("shows a bounded, constant number of slots", () => {
    for (const round of ROUNDS) {
      expect(visibleRounds(atRound(round)), `round ${round}`)
        .toHaveLength(TIMELINE_VISIBLE_NODES);
    }
  });

  it("carries at most one buffer node beyond each edge", () => {
    for (const round of ROUNDS) {
      const view = atRound(round);
      const indices = view.nodes.map((n) => n.index);
      expect(Math.min(...indices), `round ${round}`).toBeGreaterThanOrEqual(-1);
      expect(Math.max(...indices), `round ${round}`)
        .toBeLessThanOrEqual(TIMELINE_VISIBLE_NODES);
      expect(view.nodes.length).toBeLessThanOrEqual(TIMELINE_VISIBLE_NODES + 2);
    }
  });

  it("marks exactly one current node, and it is the round in play", () => {
    for (const round of ROUNDS) {
      const view = atRound(round);
      const current = view.nodes.filter((n) => n.state === "current");
      expect(current, `round ${round}`).toHaveLength(1);
      expect(current[0].roundNumber).toBe(round);
      expect(view.currentRoundNumber).toBe(round);
    }
  });

  it("never produces a round at or below zero", () => {
    for (const round of ROUNDS) {
      expect(atRound(round).nodes.every((n) => n.roundNumber >= 1),
        `round ${round}`).toBe(true);
    }
  });

  it("orders the nodes ascending with no gaps", () => {
    for (const round of ROUNDS) {
      const rounds = atRound(round).nodes.map((n) => n.roundNumber);
      expect(rounds).toEqual([...rounds].sort((a, b) => a - b));
      for (let i = 1; i < rounds.length; i += 1) {
        expect(rounds[i] - rounds[i - 1]).toBe(1);
      }
    }
  });

  it("splits the window into resolved, current and upcoming, in that order", () => {
    const view = atRound(20);
    const states = view.nodes.filter((n) => n.visible).map((n) => n.state);
    expect(states).toEqual([
      "resolved", "resolved", "resolved", "resolved",
      "current",
      "upcoming", "upcoming", "upcoming", "upcoming",
    ]);
  });
});

// ------------------------------------------------------------ truthfulness

describe("a node states only what is known", () => {
  it("says NOTHING about a round's character from its ordinal alone", () => {
    // No observed kinds supplied: every node — resolved, current and upcoming
    // — is neutral. This is the guard against reviving a schedule-derived
    // "easy / medium / hard / scenario / Meta Reflex" prediction.
    for (const round of [1, 4, 5, 9, 10, 12, 13, 16, 22, 100]) {
      const view = atRound(round);
      expect(view.nodes.every((n) => n.segmentKind === null),
        `round ${round} invented a segment kind`).toBe(true);
    }
  });

  it("leaves every FUTURE node neutral under the real observation feed", () => {
    // The feed can only ever describe the round in play or a settled one (see
    // `observeRoundKinds`), so nothing ahead of the current round is ever
    // marked — including the slots an intensity schedule would have predicted.
    const observed = observeRoundKinds(EMPTY_OBSERVED_ROUND_KINDS, {
      matchId: "m1",
      segment: metaReflexSegment(4), segmentRoundNumber: 4,
      settledReveal: null, settledRoundNumber: null,
    });
    const view = atRound(4, { observedKinds: observed.byRound });
    for (const node of view.nodes) {
      if (node.state !== "upcoming") continue;
      expect(node.segmentKind, `round ${node.roundNumber}`).toBeNull();
      expect(node.outcome).toBeNull();
    }
  });

  it("never emits a role/question tag — no authoritative field exists", () => {
    for (const round of [1, 4, 9, 13, 31]) {
      const view = atRound(round, {
        observedKinds: new Map<number, TimelineSegmentKind>([[round, "meta-reflex"]]),
        settlements: [settled(Math.max(1, round - 1), "correct", "incorrect")],
      });
      expect(view.nodes.every((n) => n.tag === null)).toBe(true);
    }
  });
});

// ------------------------------------------------- observed segment identity

describe("observing what the server says a round's segment is", () => {
  it("recognises Meta Reflex by the renderer registry's own rule", () => {
    expect(isMetaReflexSegment("item_cost_duel", 4)).toBe(true);
    expect(isMetaReflexSegment("item_cost_duel", 7)).toBe(true);
    // v1–v3 is the ITEM COST pair block, not Meta Reflex.
    expect(isMetaReflexSegment("item_cost_duel", 1)).toBe(false);
    expect(isMetaReflexSegment("item_cost_duel", 3)).toBe(false);
    expect(isMetaReflexSegment("quiz", 4)).toBe(false);
    expect(isMetaReflexSegment(null, 4)).toBe(false);
    expect(isMetaReflexSegment("item_cost_duel", null)).toBe(false);
  });

  it("records the live segment and the settled transcript", () => {
    let observed = observeRoundKinds(EMPTY_OBSERVED_ROUND_KINDS, {
      matchId: "m1", segment: metaReflexSegment(4), segmentRoundNumber: 4,
      settledReveal: null, settledRoundNumber: null,
    });
    expect(observed.byRound.get(4)).toBe("meta-reflex");

    observed = observeRoundKinds(observed, {
      matchId: "m1", segment: quizSegment(5), segmentRoundNumber: 5,
      settledReveal: { moduleId: "item_cost_duel", moduleVersion: 4 },
      settledRoundNumber: 4,
    });
    expect(observed.byRound.get(4)).toBe("meta-reflex");
    expect(observed.byRound.get(5)).toBe("standard");
  });

  it("returns the SAME record when the snapshot says nothing new", () => {
    const first = observeRoundKinds(EMPTY_OBSERVED_ROUND_KINDS, {
      matchId: "m1", segment: quizSegment(3), segmentRoundNumber: 3,
      settledReveal: null, settledRoundNumber: null,
    });
    const again = observeRoundKinds(first, {
      matchId: "m1", segment: quizSegment(3), segmentRoundNumber: 3,
      settledReveal: null, settledRoundNumber: null,
    });
    expect(again).toBe(first);
  });

  it("discards the record when the match changes", () => {
    const first = observeRoundKinds(EMPTY_OBSERVED_ROUND_KINDS, {
      matchId: "m1", segment: metaReflexSegment(4), segmentRoundNumber: 4,
      settledReveal: null, settledRoundNumber: null,
    });
    const second = observeRoundKinds(first, {
      matchId: "m2", segment: quizSegment(1), segmentRoundNumber: 1,
      settledReveal: null, settledRoundNumber: null,
    });
    expect(second.byRound.has(4)).toBe(false);
    expect(second.byRound.get(1)).toBe("standard");
  });

  it("stays bounded across an indefinite match", () => {
    let observed = EMPTY_OBSERVED_ROUND_KINDS;
    for (let round = 1; round <= 400; round += 1) {
      observed = observeRoundKinds(observed, {
        matchId: "m1", segment: quizSegment(round), segmentRoundNumber: round,
        settledReveal: null, settledRoundNumber: null,
      });
    }
    expect(observed.byRound.size).toBeLessThanOrEqual(OBSERVED_KINDS_MEMORY);
    expect(observed.byRound.get(400)).toBe("standard");
  });

  it("ignores a segment with no round to attach it to", () => {
    const observed = observeRoundKinds(EMPTY_OBSERVED_ROUND_KINDS, {
      matchId: "m1", segment: metaReflexSegment(4), segmentRoundNumber: null,
      settledReveal: null, settledRoundNumber: null,
    });
    expect(observed.byRound.size).toBe(0);
  });
});

describe("Meta Reflex on the timeline", () => {
  it("marks the round in play, and preserves it as the node travels into history", () => {
    const observed = new Map<number, TimelineSegmentKind>([
      [4, "meta-reflex"], [5, "standard"], [6, "standard"],
    ]);
    const live = atRound(4, { observedKinds: observed });
    expect(live.nodes.find((n) => n.roundNumber === 4)!.segmentKind).toBe("meta-reflex");
    expect(live.nodes.find((n) => n.roundNumber === 4)!.state).toBe("current");

    // Four rounds later the block has travelled to the far left of the window
    // and is STILL marked — the mark rides the round, not a momentary field.
    const later = atRound(8, { observedKinds: observed });
    const four = later.nodes.find((n) => n.roundNumber === 4)!;
    expect(four.index).toBe(0);
    expect(four.segmentKind).toBe("meta-reflex");
    expect(four.state).toBe("resolved");
    expect(later.nodes.find((n) => n.roundNumber === 5)!.segmentKind).toBe("standard");

    // And once it has scrolled out of the window entirely it is simply gone —
    // the strip is a viewport, not a match log.
    expect(atRound(11, { observedKinds: observed })
      .nodes.some((n) => n.roundNumber === 4)).toBe(false);
  });

  it("does not predict a block on any unobserved round", () => {
    const observed = new Map<number, TimelineSegmentKind>([[4, "meta-reflex"]]);
    const view = atRound(5, { observedKinds: observed });
    // Round 9 is where a twelve-slot schedule would have put the next block.
    expect(view.nodes.find((n) => n.roundNumber === 9)!.segmentKind).toBeNull();
  });
});

// -------------------------------------------------------- resolved outcomes

describe("resolved outcomes", () => {
  it("reads correct, traded, incorrect and timed out off the settlements", () => {
    const view = atRound(5, {
      settlements: [
        settled(1, "correct", "incorrect"),
        settled(2, "correct", "correct"),
        settled(3, "incorrect", "correct"),
        settled(4, "timeout", "timeout"),
      ],
    });
    const outcomes = Object.fromEntries(
      view.nodes.map((n) => [n.roundNumber, n.outcome]));
    expect(outcomes[1]).toBe("correct");
    expect(outcomes[2]).toBe("both-correct");
    expect(outcomes[3]).toBe("incorrect");
    expect(outcomes[4]).toBe("timed-out");
    // Nothing is claimed for the live round or for anything ahead of it.
    expect(outcomes[5]).toBeNull();
    expect(outcomes[6]).toBeNull();
    expect(outcomes[9]).toBeNull();
  });

  it("leaves a settled round resolved but UNSCORED once it ages out of the ledger", () => {
    // The ledger is bounded (`DAMAGE_LOG_LIMIT`). A past node with no
    // settlement is an ordinary state, not an error, and must not be defaulted
    // to an outcome.
    const view = atRound(20, {
      settlements: [settled(18, "correct", "incorrect"), settled(19, "incorrect", "correct")],
    });
    const byRound = Object.fromEntries(view.nodes.map((n) => [n.roundNumber, n]));
    expect(byRound[16].state).toBe("resolved");
    expect(byRound[16].outcome).toBeNull();
    expect(byRound[18].outcome).toBe("correct");
    expect(byRound[19].outcome).toBe("incorrect");
  });

  it("mirrors correctly for a p2 viewer", () => {
    const view = atRound(2, {
      viewerSlot: "p2", settlements: [settled(1, "correct", "incorrect")],
    });
    // userA answered correctly and userB did not; from p2's chair that is an
    // incorrect round.
    expect(view.nodes.find((n) => n.roundNumber === 1)!.outcome).toBe("incorrect");
  });
});

// -------------------------------------------------- the anchor's own rules

describe("which round the marker points at", () => {
  it("follows the sticky round while it names an unsettled round", () => {
    expect(currentTimelineRound(5, 4, null)).toBe(5);
    expect(currentTimelineRound(5, 4, 5)).toBe(5);
  });

  it("advances past a sticky value that has itself settled (the transition gap)", () => {
    expect(currentTimelineRound(4, 4, null)).toBe(5);
  });

  it("follows an active segment that has no engine round yet (ability phase)", () => {
    expect(currentTimelineRound(4, 4, 5)).toBe(5);
    expect(currentTimelineRound(3, 3, 4)).toBe(4);
  });

  it("points at round 1 before the first round exists", () => {
    expect(currentTimelineRound(null, 0, null)).toBe(1);
    const view = project({ roundNumber: null, completedRounds: 0 });
    expect(view.currentRoundNumber).toBe(1);
    expect(view.currentIndex).toBe(0);
  });

  it("never walks backwards across a settlement beat", () => {
    const sequence: Array<[number | null, number, number | null]> = [
      [4, 3, 4], [5, 4, 5], [4, 4, null], [5, 4, 5], [5, 4, 5], [6, 5, 6],
    ];
    let previous = 0;
    for (const [rn, done, seg] of sequence) {
      const current = currentTimelineRound(rn, done, seg);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });
});

// ------------------------------------------------------------- match over

describe("a finished match", () => {
  it("keeps a full window ending on the final round, with no marker", () => {
    const view = project({
      roundNumber: 14, completedRounds: 14, segmentRoundNumber: null,
      matchOver: true,
      settlements: [settled(13, "correct", "incorrect"), settled(14, "incorrect", "correct")],
    });
    expect(view.currentRoundNumber).toBeNull();
    expect(view.currentIndex).toBeNull();
    expect(visibleRounds(view)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14]);
    // No future is sketched past the round the match ended on.
    expect(Math.max(...view.nodes.map((n) => n.roundNumber))).toBe(14);
    expect(view.nodes.every((n) => n.state === "resolved")).toBe(true);
    expect(view.nodes.find((n) => n.roundNumber === 14)!.outcome).toBe("incorrect");
  });

  it("does not pad a short match backwards past round 1", () => {
    const view = project({
      roundNumber: 6, completedRounds: 6, segmentRoundNumber: null, matchOver: true,
      settlements: [settled(6, "correct", "incorrect")],
    });
    expect(visibleRounds(view)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(view.nodes.every((n) => n.roundNumber >= 1)).toBe(true);
  });

  it("ignores a match-over flag before anything has settled", () => {
    const view = project({
      roundNumber: 1, completedRounds: 0, segmentRoundNumber: null, matchOver: true,
    });
    expect(view.currentRoundNumber).toBe(1);
  });
});
