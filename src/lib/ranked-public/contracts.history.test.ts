import { describe, expect, it } from "vitest";
import { readMatchHistory, RankedPublicParseError } from "./contracts";

const entry = (over: Record<string, unknown> = {}) => ({
  match_id: "m1",
  viewer_outcome: "win",
  terminal_reason: "combat",
  completion_reason: "hp_zero",
  final_round_number: 7,
  completed_at: "2026-07-18T12:00:00+00:00",
  is_bot_match: false,
  viewer_class: "tank",
  opponent_class: "mage",
  opponent_display_name: "Rival",
  opponent_is_bot: false,
  rating_delta: 16,
  rating_after: 1016,
  ...over,
});

const body = (entries: unknown[]) => ({
  schema_version: "ranked_duel.match_history.v1",
  projection_type: "match_history",
  match_id: null,
  round_number: null,
  server_time: "2026-07-18T12:00:00+00:00",
  payload: { entries, count: entries.length },
});

describe("readMatchHistory", () => {
  it("parses a well-formed history", () => {
    const view = readMatchHistory(body([entry(), entry({ match_id: "m2", viewer_outcome: "draw", terminal_reason: "no_contest" })]));
    expect(view.count).toBe(2);
    expect(view.entries[0]).toMatchObject({
      matchId: "m1", viewerOutcome: "win", terminalReason: "combat",
      finalRoundNumber: 7, viewerClass: "tank", opponentClass: "mage",
      opponentDisplayName: "Rival", opponentIsBot: false,
      ratingDelta: 16, ratingAfter: 1016,
    });
    expect(view.entries[1].viewerOutcome).toBe("draw");
  });

  it("tolerates absent rating fields (pre-F2.2 backend)", () => {
    const view = readMatchHistory(body([entry({ rating_delta: undefined, rating_after: undefined })]));
    expect(view.entries[0].ratingDelta).toBeNull();
    expect(view.entries[0].ratingAfter).toBeNull();
  });

  it("accepts an empty history", () => {
    expect(readMatchHistory(body([])).entries).toEqual([]);
  });

  it("rejects a raw account id in an entry", () => {
    expect(() => readMatchHistory(body([entry({ winner_user_id: "u1" })])))
      .toThrow(RankedPublicParseError);
    expect(() => readMatchHistory(body([entry({ opponent_user_id: "u2" })])))
      .toThrow(RankedPublicParseError);
  });

  it("rejects an invalid viewer_outcome", () => {
    expect(() => readMatchHistory(body([entry({ viewer_outcome: "decisive" })])))
      .toThrow(RankedPublicParseError);
  });

  it("rejects a wrong projection_type", () => {
    const wrong = { ...body([]), projection_type: "match_result" };
    expect(() => readMatchHistory(wrong)).toThrow(RankedPublicParseError);
  });
});
