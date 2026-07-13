import { describe, expect, it } from "vitest";
import {
  MAX_TIMER_DELTA_SECONDS,
  SettlementAdapterError,
  adaptBackendSettlement,
} from "./adaptBackendSettlement";
import { SETTLEMENT_SCENARIOS, getScenario } from "./backendSettlementFixtures";
import { BackendRoundSettlement } from "./backendSettlementTypes";

const fixture = (key: string): BackendRoundSettlement => {
  const s = getScenario(key);
  if (!s) throw new Error(`missing scenario ${key}`);
  // Deep-clone so mutation-based malformed-fixture tests can't leak.
  return JSON.parse(JSON.stringify(s.settlement)) as BackendRoundSettlement;
};

describe("adaptBackendSettlement — pass-through mapping", () => {
  it("maps HP before/after exactly as resolved by the backend", () => {
    const a = adaptBackendSettlement(fixture("solo-correct"));
    expect(a.players.p2.hpBefore).toBe(90);
    expect(a.players.p2.hpAfter).toBe(60);
    expect(a.players.p1.hpBefore).toBe(90);
    expect(a.players.p1.hpAfter).toBe(90);
  });

  it("maps XP and levels without recalculation", () => {
    const a = adaptBackendSettlement(fixture("level-up"));
    const p1 = a.players.p1;
    expect(p1.xpBefore).toBe(20);
    expect(p1.xpAwarded).toBe(20);
    expect(p1.xpAfter).toBe(40);
    expect(p1.levelBefore).toBe(1);
    expect(p1.levelAfter).toBe(2);
    expect(p1.leveledUp).toBe(true);
    expect(a.players.p2.leveledUp).toBe(false);
  });

  it("preserves answer outcome and speed metadata", () => {
    const a = adaptBackendSettlement(fixture("both-correct-faster"));
    expect(a.players.p1.outcome).toBe("correct");
    expect(a.players.p1.wasFaster).toBe(true);
    expect(a.players.p1.answerTimeLabel).toBe("3.1s");
    expect(a.players.p2.wasFaster).toBe(false);
    expect(a.players.p2.answerTimeLabel).toBe("6.4s");
  });

  it("maps base and final damage as separate values", () => {
    const a = adaptBackendSettlement(fixture("shield-plus-reduction"));
    expect(a.players.p2.baseDamage).toBe(30);
    expect(a.players.p2.finalDamage).toBe(15);
  });

  it("maps shield absorbed", () => {
    const a = adaptBackendSettlement(fixture("shield-absorb"));
    expect(a.players.p2.shieldAbsorbed).toBe(12);
    expect(a.players.p2.finalDamage).toBe(18);
  });

  it("maps damage reduction", () => {
    const a = adaptBackendSettlement(fixture("damage-reduction"));
    expect(a.players.p2.damageReduced).toBe(10);
    expect(a.players.p2.finalDamage).toBe(20);
  });

  it("maps the selected active ability", () => {
    const a = adaptBackendSettlement(fixture("charge-consumed"));
    expect(a.players.p1.abilityName).toBe("Bulwark");
    expect(a.players.p1.abilityId).toBe("tank-starter");
  });

  it("maps charge consumption (and non-consumption)", () => {
    const consumed = adaptBackendSettlement(fixture("charge-consumed")).players.p1;
    expect(consumed.chargesBefore).toBe(2);
    expect(consumed.chargesConsumed).toBe(1);
    expect(consumed.chargesAfter).toBe(1);
    const kept = adaptBackendSettlement(fixture("charge-not-consumed")).players.p1;
    expect(kept.chargesConsumed).toBe(0);
    expect(kept.chargesAfter).toBe(1);
  });

  it("maps Combat Lab carryover data", () => {
    const created = adaptBackendSettlement(fixture("carryover-created")).players.p1;
    expect(created.carryoverStatus).toBe("created");
    expect(created.carryoverSummary).toContain("Stored burn");
    const consumed = adaptBackendSettlement(fixture("carryover-consumed")).players.p2;
    expect(consumed.carryoverStatus).toBe("consumed");
  });

  it("maps match-over and winner (backend keys -> p1/p2)", () => {
    const a = adaptBackendSettlement(fixture("match-over"));
    expect(a.matchOver).toBe(true);
    expect(a.winner).toBe("p1");
    expect(a.players.p2.hpAfter).toBe(0);
  });

  it("maps non-match-over rounds with a null winner", () => {
    const a = adaptBackendSettlement(fixture("plain-round"));
    expect(a.matchOver).toBe(false);
    expect(a.winner).toBeNull();
  });

  it("produces exactly one shared next-round timer value", () => {
    const up = adaptBackendSettlement(fixture("timer-increased"));
    expect(up.sharedNextRoundDurationSeconds).toBe(25);
    expect(up.sharedTimerDeltaSeconds).toBe(5);
    const down = adaptBackendSettlement(fixture("timer-decreased"));
    expect(down.sharedNextRoundDurationSeconds).toBe(18);
    // No per-player timer fields exist anywhere in the adapted shape.
    for (const a of [up, down]) {
      const keys = JSON.stringify(a).toLowerCase();
      expect(keys).not.toContain("player1nexttimer");
      expect(keys).not.toContain("player2nexttimer");
      expect(Object.keys(a.players.p1)).not.toContain("nextTimer");
      expect(Object.keys(a.players.p1).filter((k) => k.toLowerCase().includes("timer"))).toEqual([]);
    }
  });

  it("maps a timed-out player", () => {
    const a = adaptBackendSettlement(fixture("timed-out"));
    expect(a.players.p2.outcome).toBe("timed_out");
    expect(a.players.p2.answerTimeLabel).toBeNull();
  });

  it("maps no active ability to a display-safe value", () => {
    const a = adaptBackendSettlement(fixture("no-ability"));
    expect(a.players.p1.abilityName).toBe("No active ability");
    expect(a.players.p1.abilityId).toBeNull();
  });

  it("maps zero final damage after modifiers for both players", () => {
    const a = adaptBackendSettlement(fixture("zero-final-damage"));
    expect(a.players.p1.finalDamage).toBe(0);
    expect(a.players.p2.finalDamage).toBe(0);
    expect(a.players.p2.baseDamage).toBe(30);
    expect(a.players.p1.hpAfter).toBe(a.players.p1.hpBefore);
  });

  it("every scenario fixture adapts cleanly", () => {
    for (const s of SETTLEMENT_SCENARIOS) {
      expect(() => adaptBackendSettlement(s.settlement), s.key).not.toThrow();
    }
  });
});

describe("adaptBackendSettlement — validation (fails closed)", () => {
  it("rejects negative final damage", () => {
    const f = fixture("solo-correct");
    f.players.playerTwo.finalDamage = -5;
    expect(() => adaptBackendSettlement(f)).toThrow(SettlementAdapterError);
  });

  it("rejects negative HP", () => {
    const f = fixture("solo-correct");
    f.players.playerTwo.hpAfter = -1;
    expect(() => adaptBackendSettlement(f)).toThrow(/hpAfter/);
  });

  it("rejects negative XP, shields, reductions, and charges", () => {
    for (const field of ["xpAwarded", "shieldAbsorbed", "damageReductionAmount", "chargesConsumed"] as const) {
      const f = fixture("solo-correct");
      f.players.playerOne[field] = -1;
      expect(() => adaptBackendSettlement(f), field).toThrow(SettlementAdapterError);
    }
    const f = fixture("charge-consumed");
    f.players.playerOne.chargesAfter = -1;
    expect(() => adaptBackendSettlement(f)).toThrow(/chargesAfter/);
  });

  it("rejects a winner without match-over", () => {
    const f = fixture("solo-correct");
    f.winner = "playerOne";
    expect(() => adaptBackendSettlement(f)).toThrow(/matchOver/);
  });

  it("rejects an unrecognized winner", () => {
    const f = fixture("match-over");
    (f as unknown as { winner: string }).winner = "playerThree";
    expect(() => adaptBackendSettlement(f)).toThrow(/unrecognized winner/);
  });

  it("rejects missing player settlement records and unknown player keys", () => {
    const f = fixture("solo-correct");
    delete (f.players as Partial<typeof f.players>).playerTwo;
    expect(() => adaptBackendSettlement(f)).toThrow(/playerTwo/);
    const g = fixture("solo-correct");
    (g.players as Record<string, unknown>).playerThree = g.players.playerOne;
    expect(() => adaptBackendSettlement(g)).toThrow(/unrecognized player key/);
  });

  it("rejects a non-positive or oversized shared duration and out-of-range delta", () => {
    const zero = fixture("solo-correct");
    zero.sharedNextRoundTimer = { durationSeconds: 0 };
    expect(() => adaptBackendSettlement(zero)).toThrow(/positive/);
    const wild = fixture("solo-correct");
    wild.sharedNextRoundTimer = { durationSeconds: 20, deltaSeconds: MAX_TIMER_DELTA_SECONDS + 1 };
    expect(() => adaptBackendSettlement(wild)).toThrow(/prototype-safe/);
  });
});
