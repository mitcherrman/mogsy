import { describe, expect, it } from "vitest";
import { adaptPrivatePlayer } from "./adaptPrivatePlayer";
import {
  FIXTURE_OWNER_ID,
  PRIVATE_ENVELOPE_SCENARIOS,
  getPrivateEnvelopeScenario,
} from "./rankedDuelEnvelopeFixtures";
import { PrivatePlayerEnvelope } from "./rankedDuelEnvelopeTypes";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const env = (key: string): PrivatePlayerEnvelope =>
  clone(getPrivateEnvelopeScenario(key)!.envelope);

describe("adaptPrivatePlayer", () => {
  it("maps the owning player exactly and rejects a mismatched expected owner", () => {
    const a = adaptPrivatePlayer(env("private-idle"), FIXTURE_OWNER_ID);
    expect(a.ownerPlayerId).toBe("alice");
    expect(() => adaptPrivatePlayer(env("private-idle"), "bob")).toThrow(
      /does not match expected owner/,
    );
  });

  it("maps accepted answer and lock states exactly", () => {
    const idle = adaptPrivatePlayer(env("private-idle"), FIXTURE_OWNER_ID);
    expect(idle.answerSubmitted).toBe(false);
    expect(idle.selectionPhase).toBe("open");
    const submitted = adaptPrivatePlayer(env("private-answer-submitted"), FIXTURE_OWNER_ID);
    expect(submitted.answerSubmitted).toBe(true);
    expect(submitted.selectionPhase).toBe("open"); // window still open
    const locked = adaptPrivatePlayer(env("private-locked-with-ability"), FIXTURE_OWNER_ID);
    expect(locked.selectionPhase).toBe("locked");
  });

  it("keeps the selected ability nullable — no-ability is a deliberate state", () => {
    const withAbility = adaptPrivatePlayer(env("private-ability-selected"), FIXTURE_OWNER_ID);
    expect(withAbility.selectedAbilityId).toBe("tank.fortify");
    const noAbility = adaptPrivatePlayer(env("private-locked-no-ability"), FIXTURE_OWNER_ID);
    expect(noAbility.selectedAbilityId).toBeNull();
    expect(noAbility.selectionPhase).toBe("locked");
  });

  it("passes eligible abilities and CURRENT charges through without calculation", () => {
    const a = adaptPrivatePlayer(env("private-max-level"), FIXTURE_OWNER_ID);
    expect(a.unlockedAbilityIds).toEqual(["tank.fortify", "tank.brace", "tank.barrier"]);
    expect(a.lockedAbilityIds).toEqual([]);
    expect(a.remainingCharges).toEqual({
      "tank.fortify": 2,
      "tank.brace": 2,
      "tank.barrier": 1,
    });
    expect(a.level3Unlocked).toBe(true);
    expect(a.level3FinalUnlockId).toBe("tank.barrier");
  });

  it("maps the pending and confirmed Level 2 choice states exactly", () => {
    const pending = adaptPrivatePlayer(env("private-level2-pending"), FIXTURE_OWNER_ID);
    expect(pending.level2ChoiceMade).toBe(false);
    expect(pending.level2Choice).toBeNull();
    expect(pending.level2Options).toEqual(["tank.brace", "tank.barrier"]);
    const chosen = adaptPrivatePlayer(env("private-level2-chosen"), FIXTURE_OWNER_ID);
    expect(chosen.level2ChoiceMade).toBe(true);
    expect(chosen.level2Choice).toBe("tank.brace");
  });

  it("exposes only the SHARED timer, never a personal one", () => {
    const a = adaptPrivatePlayer(env("private-idle"), FIXTURE_OWNER_ID);
    expect(a.sharedActiveDeadline).toBe("2026-07-13T12:00:20+00:00");
    expect(a.sharedNextRoundDurationSeconds).toBe(20);
    const keys = Object.keys(a).filter((k) => /timer|deadline|duration/i.test(k));
    expect(keys.sort()).toEqual(["sharedActiveDeadline", "sharedNextRoundDurationSeconds"]);
  });

  it("private payloads contain no opponent-private or resolved combat data", () => {
    for (const s of PRIVATE_ENVELOPE_SCENARIOS) {
      const flat = JSON.stringify(s.envelope).toLowerCase();
      // Exactly one owner scope; opponent private state is absent.
      expect(flat.match(/owner_player_id/g)!.length, s.key).toBe(1);
      expect(flat.match(/own_selection/g)!.length, s.key).toBe(1);
      for (const banned of [
        "opponent",
        "final_damage",
        "base_damage",
        "shield_absorbed",
        "incoming_reduction",
        "xp_gained",
        "level_up_events",
        "answer_index",
        "answer_text",
        "outcome",
      ]) {
        expect(flat, `${s.key} must not contain "${banned}"`).not.toContain(banned);
      }
      // The public player entries never carry ability identity or charges.
      for (const p of s.envelope.payload.players) {
        expect(p).not.toHaveProperty("selected_ability_id");
        expect(p).not.toHaveProperty("remaining_charges");
      }
    }
  });

  it("rejects extra private-player records or opponent-private structures", () => {
    const e = env("private-idle") as unknown as { payload: Record<string, unknown> };
    e.payload.opponent_selection = { selected_ability_id: "mage.insight" };
    expect(() => adaptPrivatePlayer(e, FIXTURE_OWNER_ID)).toThrow(/unexpected field/);
  });
});
