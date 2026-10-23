/**
 * Daily three acts owner playtest (2026-10-21) — two transcript defects seen in
 * the console of a real take, pinned with the payload shapes the backend sent.
 *
 *  1. A points-scored QUIZ round settles a `segment_reveal` (answer index and
 *     points per player). It is one question with no card tallies, so it reads
 *     as no transcript -- it used to throw "players.<id>.correct must be a
 *     number" on every Daily quiz round, Time Trial included.
 *  2. A per-card Meta Reflex block counts a card whose own clock ran out as
 *     `incorrect` and lists it in `timed_out`. The tallies show it as
 *     Unanswered, matching the row's "No answer".
 */
import { describe, expect, it } from "vitest";

import { readSegmentReveal, readSegmentSettlement } from "@/lib/ranked-public/contracts";
import { icdResolvedPayload } from "@/lib/ranked-public/fixtures";

describe("points-scored quiz round", () => {
  const payload = {
    segment_reveal: {
      module_id: "quiz", module_version: 2, correct_index: 2, scoring: "points",
      correct_points: 2, speed_bonus_points: 0,
      players: {
        userA: { answer_index: null, base_points: 0, speed_bonus_points: 0,
          points_awarded: 0, finished_first: false, response_us: null },
        bot: { answer_index: 1, base_points: 0, speed_bonus_points: 0,
          points_awarded: 0, finished_first: true, response_us: 4295268 },
      },
    },
  };

  it("reads as no segment transcript instead of failing", () => {
    expect(readSegmentReveal(payload)).toBeNull();
    expect(readSegmentSettlement(payload)).toBeNull();
  });
});

describe("per-card Meta Reflex timeouts", () => {
  const withTimeouts = () => {
    const payload = icdResolvedPayload() as Record<string, any>;
    const players = payload.segment_reveal.players;
    // The backend's per-card shape: two of five cards ran out of time.
    Object.assign(players.userB, {
      correct: 1, incorrect: 4, unanswered: 0,
      timed_out: [false, true, false, true, false], timed_out_count: 2,
    });
    return payload;
  };

  it("moves timed-out cards from Incorrect to Unanswered", () => {
    const b = readSegmentReveal(withTimeouts())!.players.userB;
    expect([b.correct, b.incorrect, b.unanswered]).toEqual([1, 2, 2]);
  });

  it("uses timed_out_count when the per-card list is absent", () => {
    const payload = withTimeouts();
    delete payload.segment_reveal.players.userB.timed_out;
    const b = readSegmentReveal(payload)!.players.userB;
    expect([b.incorrect, b.unanswered]).toEqual([2, 2]);
  });

  it("leaves a block without timeout fields exactly as it was", () => {
    const a = readSegmentReveal(icdResolvedPayload())!.players;
    expect([a.userA.correct, a.userA.incorrect, a.userA.unanswered]).toEqual([5, 0, 0]);
    expect([a.userB.correct, a.userB.incorrect, a.userB.unanswered]).toEqual([1, 3, 1]);
  });
});
