import { describe, expect, it } from "vitest";
import {
  MAX_TIMER_DELTA_SECONDS,
  SettlementAdapterError,
  adaptBackendSettlement,
} from "./adaptBackendSettlement";
import {
  FIXTURE_P1_ID,
  FIXTURE_P2_ID,
  FIXTURE_PLAYER_IDS,
  SETTLEMENT_SCENARIOS,
  getScenario,
} from "./backendSettlementFixtures";
import { BackendResolvedRoundProjection } from "./backendSettlementTypes";

const fixture = (key: string): BackendResolvedRoundProjection => {
  const s = getScenario(key);
  if (!s) throw new Error(`missing scenario ${key}`);
  // Deep-clone so mutation-based malformed-fixture tests can't leak.
  return JSON.parse(JSON.stringify(s.settlement)) as BackendResolvedRoundProjection;
};

/** Adapt with the fixtures' canonical explicit p1/p2 player-id mapping. */
const adapt = (raw: BackendResolvedRoundProjection) =>
  adaptBackendSettlement(raw, FIXTURE_PLAYER_IDS);

/**
 * The same round with ids renamed so the frontend's p1 sorts SECOND in the
 * backend array ("zed" > "adam"). Array order must not matter.
 */
const reversedLexicalFixture = (key: string): BackendResolvedRoundProjection => {
  const f = fixture(key);
  const rename = (id: string) => (id === FIXTURE_P1_ID ? "zed" : "adam");
  f.players = f.players
    .map((p) => ({ ...p, player_id: rename(p.player_id) }))
    .sort((a, b) => (a.player_id < b.player_id ? -1 : 1)); // backend sort
  if (f.winner_id !== null) f.winner_id = rename(f.winner_id);
  return f;
};
const REVERSED_IDS = { p1PlayerId: "zed", p2PlayerId: "adam" };

describe("adaptBackendSettlement — exact projection pass-through", () => {
  it("every exact backend-shaped fixture validates and adapts cleanly", () => {
    for (const s of SETTLEMENT_SCENARIOS) {
      expect(() => adapt(s.settlement), s.key).not.toThrow();
    }
  });

  it("maps sole-correct full damage (dealt vs received directionality)", () => {
    const a = adapt(fixture("solo-correct"));
    expect(a.players.p1.baseDamageDealt).toBe(30);
    expect(a.players.p1.finalDamageDealt).toBe(30);
    expect(a.players.p1.finalDamageReceived).toBe(0);
    expect(a.players.p2.finalDamageReceived).toBe(30);
    expect(a.players.p2.finalDamageDealt).toBe(0);
  });

  it("maps both-correct faster-player reduced damage and answered_first", () => {
    const a = adapt(fixture("both-correct-faster"));
    expect(a.players.p1.answeredFirst).toBe(true);
    expect(a.players.p1.finalDamageDealt).toBe(18);
    expect(a.players.p2.answeredFirst).toBe(false);
    expect(a.players.p2.finalDamageReceived).toBe(18);
    expect(a.players.p2.hpAfter).toBe(72);
  });

  it("maps a both-wrong wash", () => {
    const a = adapt(fixture("both-incorrect-wash"));
    for (const p of [a.players.p1, a.players.p2]) {
      expect(p.finalDamageDealt).toBe(0);
      expect(p.finalDamageReceived).toBe(0);
      expect(p.hpBefore).toBe(p.hpAfter);
    }
  });

  it("maps explicit timeout: enum conversion, flag, null timestamp, end reason", () => {
    const a = adapt(fixture("timed-out"));
    expect(a.players.p2.outcome).toBe("timed_out"); // backend spells "timeout"
    expect(a.players.p2.timedOut).toBe(true);
    expect(a.players.p2.submittedAt).toBeNull();
    expect(a.endReason).toBe("deadline_expired");
    // Timeout is the explicit flag, not inferred from the null timestamp.
    expect(a.players.p1.timedOut).toBe(false);
    expect(a.players.p1.submittedAt).toBe("2026-07-13T12:00:04+00:00");
  });

  it("maps null selected ability to a display-safe value", () => {
    const a = adapt(fixture("no-ability"));
    expect(a.players.p1.abilityId).toBeNull();
    expect(a.players.p1.abilityName).toBe("No active ability");
  });

  it("maps shield absorption", () => {
    const a = adapt(fixture("shield-absorb"));
    expect(a.players.p2.shieldAbsorbed).toBe(12);
    expect(a.players.p2.finalDamageReceived).toBe(18);
  });

  it("maps incoming reduction", () => {
    const a = adapt(fixture("damage-reduction"));
    expect(a.players.p2.incomingReduction).toBe(10);
    expect(a.players.p2.finalDamageReceived).toBe(20);
  });

  it("maps combined shield + reduction + outgoing bonus without arithmetic", () => {
    const a = adapt(fixture("shield-plus-reduction"));
    expect(a.players.p1.baseDamageDealt).toBe(30);
    expect(a.players.p1.outgoingBonus).toBe(5);
    expect(a.players.p1.finalDamageDealt).toBe(35);
    expect(a.players.p2.shieldAbsorbed).toBe(8);
    expect(a.players.p2.incomingReduction).toBe(7);
    expect(a.players.p2.finalDamageReceived).toBe(20);
  });

  it("maps HP before/after exactly", () => {
    const a = adapt(fixture("solo-correct"));
    expect(a.players.p2.hpBefore).toBe(90);
    expect(a.players.p2.hpAfter).toBe(60);
    expect(a.players.p1.hpBefore).toBe(90);
    expect(a.players.p1.hpAfter).toBe(90);
  });

  it("maps XP gained and total XP after — no XP-before exists anywhere", () => {
    const a = adapt(fixture("level-up"));
    expect(a.players.p1.xpGained).toBe(20);
    expect(a.players.p1.totalXpAfter).toBe(40);
    // The projection has no xp-before, and the adapter must not invent one.
    expect(JSON.stringify(a)).not.toMatch(/xpBefore|xp_before/);
  });

  it("maps level before/after and explicit level-up events", () => {
    const a = adapt(fixture("level-up"));
    const p1 = a.players.p1;
    expect(p1.levelBefore).toBe(1);
    expect(p1.levelAfter).toBe(2);
    expect(p1.leveledUp).toBe(true); // from events, not numeric comparison
    expect(p1.levelUpEvents).toEqual([
      { previousLevel: 1, newLevel: 2, totalXpAfter: 40, thresholdsCrossed: [40] },
    ]);
    expect(a.players.p2.leveledUp).toBe(false);
    expect(a.players.p2.levelUpEvents).toEqual([]);
  });

  it("maps charge consumption and the immutable post-round snapshot", () => {
    const a = adapt(fixture("charge-consumed")).players.p1;
    expect(a.chargeConsumed).toBe(true);
    expect(a.consumedAbilityId).toBe("tank.brace");
    // Historical remaining charges come straight from the backend's
    // commit-time snapshot — never reconstructed, never live state.
    expect(a.remainingChargesAfterRound).toEqual({ "tank.fortify": 2, "tank.brace": 2 });
    // No charges-before field exists in the adapted model.
    expect(JSON.stringify(a)).not.toMatch(/chargesBefore|charges_before/);
  });

  it("maps ability-selected-without-consumption", () => {
    const a = adapt(fixture("charge-not-consumed")).players.p1;
    expect(a.chargeConsumed).toBe(false);
    expect(a.consumedAbilityId).toBeNull();
    expect(a.remainingChargesAfterRound["tank.fortify"]).toBe(2);
  });

  it("preserves null remaining charges (uncharged use policy)", () => {
    const a = adapt(fixture("uncharged-policy")).players.p1;
    expect(a.remainingChargesAfterRound["tank.fortify"]).toBeNull();
    expect(a.remainingChargesAfterRound["tank.brace"]).toBe(3);
  });

  it("maps carryover gained (kept separate from consumed)", () => {
    const a = adapt(fixture("carryover-gained")).players.p1;
    expect(a.effectsGained).toEqual(["mage.arcane_charge"]);
    expect(a.effectsConsumed).toEqual([]);
    expect(a.consecutiveCorrect).toBe(1);
  });

  it("maps carryover consumed", () => {
    const a = adapt(fixture("carryover-consumed")).players.p1;
    expect(a.effectsConsumed).toEqual(["mage.arcane_charge"]);
    expect(a.effectsGained).toEqual([]);
    expect(a.consecutiveCorrect).toBe(2);
  });

  it("keeps the Combat Lab delta separate from every damage field", () => {
    const a = adapt(fixture("combat-lab-delta")).players.p2;
    expect(a.combatLabUnlockDeltaSeconds).toBe(-5);
    // Damage audit untouched by the delta.
    expect(a.finalDamageReceived).toBe(30);
    expect(a.outgoingBonus).toBe(0);
    expect(a.finalDamageDealt).toBe(0);
  });

  it("maps the single shared next-round duration and the raw delta", () => {
    const up = adapt(fixture("timer-increased"));
    expect(up.sharedNextRoundDurationSeconds).toBe(25);
    expect(up.sharedTimerDeltaSeconds).toBe(5);
    const down = adapt(fixture("timer-decreased"));
    expect(down.sharedNextRoundDurationSeconds).toBe(18);
    expect(down.sharedTimerDeltaSeconds).toBe(-2);
  });

  it("exposes no per-player timer fields", () => {
    const a = adapt(fixture("timer-increased"));
    for (const p of Object.values(a.players)) {
      expect(Object.keys(p).filter((k) => /timer|duration|deadline/i.test(k))).toEqual([]);
    }
  });

  it("maps match-over, winner id -> p1/p2, and completion reason", () => {
    const a = adapt(fixture("match-over"));
    expect(a.matchOver).toBe(true);
    expect(a.winner).toBe("p1");
    expect(a.completionReason).toBe("knockout");
    expect(a.players.p2.reachedZeroHp).toBe(true);
  });

  it("maps a simultaneous-knockout draw: match over, NO winner", () => {
    const a = adapt(fixture("double-knockout"));
    expect(a.matchOver).toBe(true);
    expect(a.winner).toBeNull(); // never inferred from HP
    expect(a.completionReason).toBe("simultaneous_knockout");
    expect(a.players.p1.reachedZeroHp).toBe(true);
    expect(a.players.p2.reachedZeroHp).toBe(true);
  });

  it("maps non-terminal rounds with null winner and completion reason", () => {
    const a = adapt(fixture("plain-round"));
    expect(a.matchOver).toBe(false);
    expect(a.winner).toBeNull();
    expect(a.completionReason).toBeNull();
  });

  it("maps round metadata: match id, round number, question id, pressure", () => {
    const a = adapt(fixture("pressure-applied"));
    expect(a.matchId).toBe("mock-match-001");
    expect(a.roundNumber).toBe(1);
    expect(a.questionId).toBe("q-mock-1");
    expect(a.pressureApplied).toBe(true);
  });

  it("derives nothing: no elapsed time, no answer rank, no answer content", () => {
    const a = adapt(fixture("both-correct-faster"));
    const flat = JSON.stringify(a).toLowerCase();
    expect(flat).not.toMatch(/elapsed|answertimems|answer_rank|rank|answer_text|answerindex/);
    // answeredFirst stays boolean, not converted into a numeric order.
    expect(typeof a.players.p1.answeredFirst).toBe("boolean");
  });

  it("maps zero final damage after modifiers without recomputation", () => {
    const a = adapt(fixture("zero-final-damage"));
    expect(a.players.p2.baseDamageDealt).toBe(18);
    expect(a.players.p2.finalDamageDealt).toBe(0);
    expect(a.players.p1.finalDamageReceived).toBe(0);
    expect(a.players.p1.hpAfter).toBe(a.players.p1.hpBefore);
  });
});

describe("adaptBackendSettlement — explicit player-id identity", () => {
  it("maps p1/p2 correctly when lexical order matches the UI order", () => {
    const a = adapt(fixture("solo-correct")); // alice < bob, alice is p1
    expect(a.players.p1.playerId).toBe(FIXTURE_P1_ID);
    expect(a.players.p2.playerId).toBe(FIXTURE_P2_ID);
    expect(a.players.p1.finalDamageDealt).toBe(30);
  });

  it("maps p1/p2 correctly when lexical order is OPPOSITE (index never decides)", () => {
    const f = reversedLexicalFixture("solo-correct"); // array: [adam, zed], p1 = zed
    expect(f.players[0].player_id).toBe("adam"); // p1 sorts second
    const a = adaptBackendSettlement(f, REVERSED_IDS);
    expect(a.players.p1.playerId).toBe("zed");
    expect(a.players.p1.finalDamageDealt).toBe(30); // still the attacker
    expect(a.players.p2.playerId).toBe("adam");
    expect(a.players.p2.finalDamageReceived).toBe(30);
  });

  it("maps the winner through ids even when p1 sorts second", () => {
    const f = reversedLexicalFixture("match-over"); // winner was p1 -> "zed"
    expect(f.winner_id).toBe("zed");
    const a = adaptBackendSettlement(f, REVERSED_IDS);
    expect(a.winner).toBe("p1");
  });

  it("rejects a missing expected p1 or p2 id", () => {
    const f = fixture("solo-correct");
    expect(() =>
      adaptBackendSettlement(f, { p1PlayerId: "mallory", p2PlayerId: FIXTURE_P2_ID }),
    ).toThrow(/expected p1 player_id "mallory" is missing/);
    expect(() =>
      adaptBackendSettlement(f, { p1PlayerId: FIXTURE_P1_ID, p2PlayerId: "mallory" }),
    ).toThrow(/expected p2 player_id "mallory" is missing/);
  });

  it("rejects identical p1/p2 mapping ids and duplicate projection ids", () => {
    const f = fixture("solo-correct");
    expect(() =>
      adaptBackendSettlement(f, { p1PlayerId: FIXTURE_P1_ID, p2PlayerId: FIXTURE_P1_ID }),
    ).toThrow(/distinct player ids/);
    const dup = fixture("solo-correct");
    dup.players[1].player_id = FIXTURE_P1_ID;
    expect(() => adapt(dup)).toThrow(/duplicate player_id/);
  });
});

describe("adaptBackendSettlement — validation (fails closed)", () => {
  it("rejects a malformed payload", () => {
    expect(() =>
      adapt(undefined as unknown as BackendResolvedRoundProjection),
    ).toThrow(SettlementAdapterError);
    const f = fixture("solo-correct");
    (f as { match_id: unknown }).match_id = "";
    expect(() => adapt(f)).toThrow(/match_id/);
  });

  it("rejects a missing required player projection", () => {
    const f = fixture("solo-correct");
    f.players = [f.players[0]];
    expect(() => adapt(f)).toThrow(/exactly two/);
  });

  it("rejects invalid enum values", () => {
    const f = fixture("solo-correct");
    (f.players[0] as { outcome: string }).outcome = "blessed";
    expect(() => adapt(f)).toThrow(/unrecognized outcome/);
    const g = fixture("solo-correct");
    (g as { end_reason: string }).end_reason = "meteor";
    expect(() => adapt(g)).toThrow(/end_reason/);
    const h = fixture("match-over");
    (h as { completion_reason: string }).completion_reason = "rage_quit";
    expect(() => adapt(h)).toThrow(/completion_reason/);
  });

  it("rejects negative damage-audit values", () => {
    const f = fixture("solo-correct");
    f.players[1].damage.final_damage_received = -5;
    expect(() => adapt(f)).toThrow(/final_damage_received/);
  });

  it("rejects negative HP", () => {
    const f = fixture("solo-correct");
    f.players[1].hp_after = -1;
    expect(() => adapt(f)).toThrow(/hp_after/);
  });

  it("rejects negative XP, shields, and reductions", () => {
    const f = fixture("solo-correct");
    f.players[0].xp_gained = -1;
    expect(() => adapt(f)).toThrow(/xp_gained/);
    const g = fixture("solo-correct");
    g.players[0].damage.shield_absorbed = -2;
    expect(() => adapt(g)).toThrow(/shield_absorbed/);
  });

  it("rejects negative historical remaining charges", () => {
    const f = fixture("charge-consumed");
    f.players[0].remaining_charges["tank.brace"] = -1;
    expect(() => adapt(f)).toThrow(/remaining_charges/);
  });

  it("rejects invalid winner data", () => {
    const noOver = fixture("solo-correct");
    noOver.winner_id = FIXTURE_P1_ID;
    expect(() => adapt(noOver)).toThrow(/match_over/);
    const unknown = fixture("match-over");
    unknown.winner_id = "mallory";
    expect(() => adapt(unknown)).toThrow(/unrecognized winner_id/);
  });

  it("rejects a non-positive shared duration and an out-of-range raw delta", () => {
    const zero = fixture("solo-correct");
    zero.next_round_duration_seconds = 0;
    expect(() => adapt(zero)).toThrow(/positive/);
    const wild = fixture("solo-correct");
    wild.next_round_duration_delta = MAX_TIMER_DELTA_SECONDS + 1;
    expect(() => adapt(wild)).toThrow(/prototype-safe/);
  });

  it("rejects match_over without a completion reason", () => {
    const f = fixture("match-over");
    f.completion_reason = null;
    expect(() => adapt(f)).toThrow(/completion_reason/);
  });
});
