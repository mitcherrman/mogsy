/**
 * R1 contract parsing: League role identity, and the retired progression keys.
 *
 * There is no leveling system any more. `progression_enabled` and
 * `progression_pending_players` are gone from the backend, and the reader
 * must TOLERATE both their absence and (from an older deployment) their
 * presence, without surfacing either.
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

describe("retired progression keys", () => {
  const resume = (patch: Record<string, unknown>) => ({
    schema_version: "ranked_duel.resume.v1",
    projection_type: "resume",
    match_id: "m1", round_number: 1, server_time: "2026-07-18T12:00:00+00:00",
    payload: {
      match_status: "active", match_over: false,
      public: publicWith(patch), private: privatePlayerV2(),
      latest_resolved_round: null, result: null, presence: null,
      ...patch,
    },
  });

  it("parses a public projection that carries neither key", () => {
    const body = clone(publicRoundV2());
    const payload = body.payload as Record<string, unknown>;
    delete payload.progression_pending_players;
    delete payload.progression_enabled;
    const view = readPublicRound(body);
    expect(view.matchId).toBeTruthy();
    expect("progressionEnabled" in view).toBe(false);
    expect("progressionPendingPlayers" in view).toBe(false);
  });

  it("ignores both keys when an older backend still sends them", () => {
    const view = readPublicRound(publicWith({
      progression_enabled: true, progression_pending_players: ["userA"],
    }));
    expect("progressionEnabled" in view).toBe(false);
    expect("progressionPendingPlayers" in view).toBe(false);
  });

  it("parses a resume payload with or without the keys", () => {
    const bare = readResume(resume({}));
    expect(bare.matchStatus).toBe("active");
    expect("progressionEnabled" in bare).toBe(false);
    expect("progressionPendingPlayers" in bare).toBe(false);
    const legacy = readResume(resume({
      progression_enabled: false, progression_pending_players: ["userA"],
    }));
    expect("progressionEnabled" in legacy).toBe(false);
    expect("progressionPendingPlayers" in legacy).toBe(false);
  });
});

describe("R1 — role on the public projection", () => {
  it("reads a frozen role per player", () => {
    const body = clone(publicRoundV2());
    Object.assign(body.payload.players[0], { role: "jungle" });
    Object.assign(body.payload.players[1], { role: "support" });
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
    Object.assign(body.payload.players[0], { role: "bot" });
    expect(readPublicRound(body).players[0].role).toBeNull();
  });
});

describe("R1 — role on queue status", () => {
  it("carries the role the entry queued as, beside the legacy class", () => {
    const body = clone(queueStatusV1("waiting"));
    Object.assign(body.payload, { role: "mid" });
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
