/**
 * R1 contract parsing: League role identity and the progression signal.
 *
 * The version-skew cases are the point of this file. Frontend and backend
 * deploy independently (Lovable / Railway), so a build of this client will
 * certainly run against a backend that has never heard of R1 — and the parse
 * has to fail SAFE there, showing legacy progression UI rather than hiding it.
 */

import { describe, expect, it } from "vitest";
import {
  readMatchHistory, readPublicRound, readQueueStatus, readRankedRole, readResume,
} from "./contracts";
import { privatePlayerV2, publicRoundV2, queueStatusV1 } from "./fixtures";

/** Deep-clone a fixture so a mutation cannot leak between cases. */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function publicWith(patch: Record<string, unknown>) {
  const body = clone(publicRoundV2());
  Object.assign(body.payload, patch);
  return body;
}

describe("R1 — progression_enabled", () => {
  it("parses an explicit false (an R1 no-progression match)", () => {
    expect(readPublicRound(publicWith({ progression_enabled: false })).progressionEnabled)
      .toBe(false);
  });

  it("parses an explicit true (a legacy match)", () => {
    expect(readPublicRound(publicWith({ progression_enabled: true })).progressionEnabled)
      .toBe(true);
  });

  it("VERSION SKEW: an absent field reads as true, never false", () => {
    // The shipped fixtures carry no `progression_enabled` at all — exactly
    // what a pre-R1 backend sends. Reading that as `false` would hide the
    // ability tray and the Level 2 choice on matches that require them.
    const body = clone(publicRoundV2());
    expect("progression_enabled" in body.payload).toBe(false);
    expect(readPublicRound(body).progressionEnabled).toBe(true);
  });

  it("a null or malformed value also reads as true (fail safe, not fail closed)", () => {
    expect(readPublicRound(publicWith({ progression_enabled: null })).progressionEnabled)
      .toBe(true);
    expect(readPublicRound(publicWith({ progression_enabled: "no" })).progressionEnabled)
      .toBe(true);
  });

  it("is mirrored on the resume payload, with the same safe default", () => {
    const resume = (patch: Record<string, unknown>) => ({
      schema_version: "ranked_duel.resume.v1",
      projection_type: "resume",
      match_id: "m1", round_number: 1, server_time: "2026-07-18T12:00:00+00:00",
      payload: {
        match_status: "active", match_over: false,
        public: publicWith(patch), private: privatePlayerV2(),
        progression_pending_players: [],
        latest_resolved_round: null, result: null, presence: null,
        ...patch,
      },
    });
    expect(readResume(resume({ progression_enabled: false })).progressionEnabled).toBe(false);
    expect(readResume(resume({ progression_enabled: true })).progressionEnabled).toBe(true);
    expect(readResume(resume({})).progressionEnabled).toBe(true);
  });
});

describe("R1 — role on the public projection", () => {
  it("reads a frozen role per player", () => {
    const body = clone(publicRoundV2());
    body.payload.players[0].role = "jungle";
    body.payload.players[1].role = "support";
    const view = readPublicRound(body);
    expect(view.players.map((p) => p.role)).toEqual(["jungle", "support"]);
  });

  it("reads null for a pre-R1 match and NEVER derives one from the class", () => {
    const view = readPublicRound(clone(publicRoundV2()));
    expect(view.players.map((p) => p.role)).toEqual([null, null]);
    // The classes are still there and are still exactly what they were.
    expect(view.players.map((p) => p.classId)).toEqual(["tank", "mage"]);
  });

  it("drops an unrecognised role to null rather than guessing", () => {
    const body = clone(publicRoundV2());
    body.payload.players[0].role = "bot";
    expect(readPublicRound(body).players[0].role).toBeNull();
  });
});

describe("R1 — role on queue status", () => {
  it("carries the role the entry queued as, beside the legacy class", () => {
    const body = clone(queueStatusV1("waiting"));
    body.payload.role = "mid";
    const view = readQueueStatus(body);
    expect(view.role).toBe("mid");
    expect(view.classId).toBe("tank");
  });

  it("is null on a pre-R1 entry", () => {
    expect(readQueueStatus(clone(queueStatusV1("waiting"))).role).toBeNull();
  });
});

describe("R1 — role on match history", () => {
  const historyBody = (entry: Record<string, unknown>) => ({
    schema_version: "ranked_duel.match_history.v1",
    projection_type: "match_history",
    match_id: null, round_number: null, server_time: "2026-07-18T12:00:00+00:00",
    payload: { count: 1, entries: [{
      match_id: "m1", viewer_outcome: "win", terminal_reason: "combat",
      completion_reason: "hp_zero", final_round_number: 7,
      completed_at: "2026-07-18T12:00:00+00:00", is_bot_match: false,
      viewer_class: "tank", opponent_class: "mage",
      opponent_display_name: "Rival", opponent_is_bot: false,
      rating_delta: null, rating_after: null, ...entry,
    }] },
  });

  it("reads both roles when the match froze them", () => {
    const [e] = readMatchHistory(historyBody({
      viewer_role: "adc", opponent_role: "top",
    })).entries;
    expect(e.viewerRole).toBe("adc");
    expect(e.opponentRole).toBe("top");
  });

  it("a historical row keeps its class and gets NO fabricated role", () => {
    const [e] = readMatchHistory(historyBody({})).entries;
    expect(e.viewerRole).toBeNull();
    expect(e.opponentRole).toBeNull();
    expect(e.viewerClass).toBe("tank");
    expect(e.opponentClass).toBe("mage");
  });
});

describe("R1 — the role preference snapshot", () => {
  it("reads a chosen role", () => {
    expect(readRankedRole({
      role: "support", selected_at: "2026-08-18T00:00:00+00:00",
      updated_at: "2026-08-18T00:00:00+00:00",
    })).toEqual({
      role: "support",
      selectedAt: "2026-08-18T00:00:00+00:00",
      updatedAt: "2026-08-18T00:00:00+00:00",
    });
  });

  it("reads the unselected state as a normal answer, not an error", () => {
    expect(readRankedRole({ role: null, selected_at: null, updated_at: null }))
      .toEqual({ role: null, selectedAt: null, updatedAt: null });
  });

  it("refuses a role outside the five", () => {
    expect(readRankedRole({ role: "tank", selected_at: null, updated_at: null }).role)
      .toBeNull();
  });
});
