import { describe, expect, it } from "vitest";
import { adaptPublicRound } from "./adaptPublicRound";
import {
  PUBLIC_ENVELOPE_SCENARIOS,
  getPublicEnvelopeScenario,
} from "./rankedDuelEnvelopeFixtures";
import { PublicRoundEnvelope } from "./rankedDuelEnvelopeTypes";

const IDS = { p1PlayerId: "alice", p2PlayerId: "bob" };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const env = (key: string): PublicRoundEnvelope =>
  clone(getPublicEnvelopeScenario(key)!.envelope);

describe("adaptPublicRound", () => {
  it("maps players by explicit id, not array order", () => {
    const e = env("public-first-submitted");
    // Reverse the array — identity must not change.
    e.payload.players = [...e.payload.players].reverse();
    const a = adaptPublicRound(e, IDS);
    expect(a.players.p1.playerId).toBe("alice");
    expect(a.players.p1.hasSubmitted).toBe(true);
    expect(a.players.p2.playerId).toBe("bob");
    expect(a.players.p2.hasSubmitted).toBe(false);
  });

  it("maps phase, HP, XP, level, and neutral statuses as pass-through", () => {
    const a = adaptPublicRound(env("public-both-submitted"), IDS);
    expect(a.matchStatus).toBe("active");
    expect(a.players.p1.hp).toBe(90);
    expect(a.players.p1.totalXp).toBe(16);
    expect(a.players.p1.level).toBe(1);
    expect(a.players.p1.abilitySelectionPhase).toBe("locked");
    expect(a.players.p1.hasAbilitySelected).toBe(true);
    expect(a.players.p2.hasAbilitySelected).toBe(false); // status only, no leak
    expect(a.activeRound!.readyToResolve).toBe(true);
  });

  it("passes shared timer fields through — one shared timer, no per-player fields", () => {
    const a = adaptPublicRound(env("public-pressure-shortened"), IDS);
    expect(a.activeRound!.durationSeconds).toBe(20);
    expect(a.activeRound!.activeDeadline).toBe("2026-07-13T12:00:15+00:00");
    expect(a.activeRound!.pressureApplied).toBe(true);
    expect(a.sharedNextRoundDurationSeconds).toBe(25);
    for (const p of Object.values(a.players)) {
      expect(Object.keys(p).filter((k) => /timer|duration|deadline/i.test(k))).toEqual([]);
    }
  });

  it("maps match-over and winner via explicit ids", () => {
    const a = adaptPublicRound(env("public-match-over"), IDS);
    expect(a.matchOver).toBe(true);
    expect(a.winner).toBe("p1");
    expect(a.completionReason).toBe("knockout");
    expect(a.activeRound).toBeNull();
  });

  it("public payloads structurally contain no hidden information", () => {
    for (const s of PUBLIC_ENVELOPE_SCENARIOS) {
      const flat = JSON.stringify(s.envelope).toLowerCase();
      for (const banned of [
        "selected_ability_id",
        "answer_index",
        "answer_text",
        "outcome",
        "correct",
        "remaining_charges",
        "level2_choice",
        "damage",
        "shield",
        "own_",
      ]) {
        expect(flat, `${s.key} must not contain "${banned}"`).not.toContain(banned);
      }
    }
  });

  it("adapted output invents no hidden fields either", () => {
    const a = adaptPublicRound(env("public-no-hidden-info"), IDS);
    const flat = JSON.stringify(a).toLowerCase();
    for (const banned of ["ability_id", "abilityid", "outcome", "damage", "charge", "choice"]) {
      expect(flat).not.toContain(banned);
    }
  });

  it("rejects a missing expected player id and an unknown winner", () => {
    expect(() =>
      adaptPublicRound(env("public-active-question"), { p1PlayerId: "mallory", p2PlayerId: "bob" }),
    ).toThrow(/missing/);
    const e = env("public-match-over");
    e.payload.winner_id = "mallory";
    expect(() => adaptPublicRound(e, IDS)).toThrow(/unrecognized winner_id/);
  });
});
