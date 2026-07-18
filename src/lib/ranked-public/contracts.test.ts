import { describe, expect, it } from "vitest";
import {
  readMatchResult, readPrivatePlayer, readPublicRound, readQueueStatus,
  RankedPublicParseError,
} from "./contracts";
import {
  matchResultV1, privatePlayerV2, publicRoundV2, queueStatusV1,
} from "./fixtures";

describe("readPublicRound", () => {
  it("parses a valid v2 public envelope with authoritative max_hp", () => {
    const view = readPublicRound(publicRoundV2());
    expect(view.schemaVersion).toBe("ranked_duel.public_round.v2");
    expect(view.players.map((p) => [p.playerId, p.maxHp])).toEqual([
      ["userA", 170], ["userB", 150]]);
    expect(view.question?.options).toHaveLength(4);
    expect(view.presence?.opponentConnectionState).toBe("connected");
    expect(view.activeRound?.activeDeadline).toBeTruthy();
  });

  it("rejects the wrong projection_type", () => {
    const bad = { ...publicRoundV2(), projection_type: "private_player" };
    expect(() => readPublicRound(bad)).toThrow(RankedPublicParseError);
  });

  it("rejects a public payload that leaks a correct answer index", () => {
    const leaky = publicRoundV2();
    (leaky.payload as Record<string, unknown>).correct_index = 0;
    expect(() => readPublicRound(leaky)).toThrow(/leaked a correct answer/);
  });

  it("rejects a question that carries correct_index", () => {
    const leaky = publicRoundV2();
    (leaky.payload.question as Record<string, unknown>).correct_index = 2;
    expect(() => readPublicRound(leaky)).toThrow(RankedPublicParseError);
  });
});

describe("readPrivatePlayer", () => {
  it("parses the owner's own ability state only", () => {
    const view = readPrivatePlayer(privatePlayerV2("userA"));
    expect(view.ownerPlayerId).toBe("userA");
    expect(view.ownAbilities.unlockedAbilityIds).toEqual(["tank.fortify"]);
    expect(view.ownAbilities.remainingCharges["tank.fortify"]).toBe(3);
    expect(view.ownAbilities.level2Options).toEqual(["tank.brace", "tank.barrier"]);
    // No opponent private state is present.
    expect(JSON.stringify(view.ownAbilities)).not.toMatch(/userB/);
  });

  it("rejects a private payload that leaks correctness", () => {
    const leaky = privatePlayerV2();
    (leaky.payload as Record<string, unknown>).correct_index = 1;
    expect(() => readPrivatePlayer(leaky)).toThrow(RankedPublicParseError);
  });
});

describe("readQueueStatus", () => {
  it("parses each queue status variant", () => {
    expect(readQueueStatus(queueStatusV1("waiting")).status).toBe("waiting");
    const matched = readQueueStatus(queueStatusV1("matched", "m1"));
    expect(matched.status).toBe("matched");
    expect(matched.matchId).toBe("m1");
    expect(readQueueStatus(queueStatusV1("not_queued")).status).toBe("not_queued");
    expect(readQueueStatus(queueStatusV1("cancelled")).status).toBe("cancelled");
    expect(readQueueStatus(queueStatusV1("expired")).status).toBe("expired");
  });

  it("never carries an opponent id in the queue payload", () => {
    expect(JSON.stringify(readQueueStatus(queueStatusV1("matched", "m1")))).not.toMatch(/userB/);
  });
});

describe("readMatchResult", () => {
  it("exposes the terminal reason", () => {
    expect(readMatchResult(matchResultV1("combat")).terminalReason).toBe("combat");
    expect(readMatchResult(matchResultV1("forfeit")).terminalReason).toBe("forfeit");
    expect(readMatchResult(matchResultV1("no_contest")).outcome).toBe("decisive");
  });
});
