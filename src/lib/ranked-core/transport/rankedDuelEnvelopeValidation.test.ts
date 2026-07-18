import { describe, expect, it } from "vitest";
import {
  EnvelopeValidationError,
  validatePrivatePlayerEnvelope,
  validatePublicRoundEnvelope,
  validateResolvedRoundEnvelope,
} from "./rankedDuelEnvelopeValidation";
import {
  PRIVATE_ENVELOPE_SCENARIOS,
  PUBLIC_ENVELOPE_SCENARIOS,
  RESOLVED_ENVELOPE_SCENARIOS,
  getPublicEnvelopeScenario,
  getResolvedEnvelopeScenario,
} from "./rankedDuelEnvelopeFixtures";
import { adaptResolvedRoundEnvelope } from "./adaptResolvedRoundEnvelope";
import { adaptBackendSettlement } from "../backend/adaptBackendSettlement";
import {
  FIXTURE_PLAYER_IDS,
  getScenario,
} from "../backend/backendSettlementFixtures";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const resolvedEnv = (key = "solo-correct") => clone(getResolvedEnvelopeScenario(key)!.envelope);
const publicEnv = (key = "public-active-question") => clone(getPublicEnvelopeScenario(key)!.envelope);
const privateEnv = () => clone(PRIVATE_ENVELOPE_SCENARIOS[0].envelope);

describe("five-field envelope validation", () => {
  it("every exact resolved/public/private envelope fixture validates", () => {
    for (const s of RESOLVED_ENVELOPE_SCENARIOS) {
      expect(() => validateResolvedRoundEnvelope(s.envelope), s.key).not.toThrow();
    }
    for (const s of PUBLIC_ENVELOPE_SCENARIOS) {
      expect(() => validatePublicRoundEnvelope(s.envelope), s.key).not.toThrow();
    }
    for (const s of PRIVATE_ENVELOPE_SCENARIOS) {
      expect(() => validatePrivatePlayerEnvelope(s.envelope), s.key).not.toThrow();
    }
  });

  it("rejects a missing envelope field", () => {
    for (const field of ["schema_version", "projection_type", "match_id", "round_number", "payload"]) {
      const e = resolvedEnv() as unknown as Record<string, unknown>;
      delete e[field];
      expect(() => validateResolvedRoundEnvelope(e), field).toThrow(
        new RegExp(`missing field "${field}"`),
      );
    }
  });

  it("rejects an extra sixth envelope field (no invented transport metadata)", () => {
    const e = resolvedEnv() as unknown as Record<string, unknown>;
    e.event_id = "evt-1";
    expect(() => validateResolvedRoundEnvelope(e)).toThrow(/unexpected field "event_id"/);
  });

  it("rejects a wrong envelope kind even with an otherwise valid payload", () => {
    const e = resolvedEnv() as unknown as Record<string, unknown>;
    e.schema_version = "ranked_duel.resolved_round.v2";
    expect(() => validateResolvedRoundEnvelope(e)).toThrow(/wrong schema_version/);
    const f = resolvedEnv() as unknown as Record<string, unknown>;
    f.projection_type = "public_round";
    expect(() => validateResolvedRoundEnvelope(f)).toThrow(/wrong projection_type/);
  });

  it("rejects invalid envelope metadata", () => {
    const e = resolvedEnv() as unknown as Record<string, unknown>;
    e.round_number = 0;
    expect(() => validateResolvedRoundEnvelope(e)).toThrow(/positive integer/);
    const f = resolvedEnv() as unknown as Record<string, unknown>;
    f.match_id = "";
    expect(() => validateResolvedRoundEnvelope(f)).toThrow(/match_id/);
  });

  it("rejects a payload that does not match its envelope association", () => {
    const e = resolvedEnv();
    e.payload.round_number = 99;
    expect(() => validateResolvedRoundEnvelope(e)).toThrow(/does not match envelope/);
  });

  it("rejects the wrong payload shape for the kind", () => {
    const e = resolvedEnv() as unknown as Record<string, unknown>;
    e.payload = { hello: "world" };
    expect(() => validateResolvedRoundEnvelope(e)).toThrow(/players array/);
  });

  it("cross-kind misuse: each validator rejects the other kinds", () => {
    expect(() => validatePublicRoundEnvelope(privateEnv())).toThrow(EnvelopeValidationError);
    expect(() => validatePublicRoundEnvelope(resolvedEnv())).toThrow(EnvelopeValidationError);
    expect(() => validatePrivatePlayerEnvelope(publicEnv())).toThrow(EnvelopeValidationError);
    expect(() => validatePrivatePlayerEnvelope(resolvedEnv())).toThrow(EnvelopeValidationError);
    expect(() => validateResolvedRoundEnvelope(publicEnv())).toThrow(EnvelopeValidationError);
    expect(() => validateResolvedRoundEnvelope(privateEnv())).toThrow(EnvelopeValidationError);
  });

  it("public validator rejects a private payload even under the public kind", () => {
    // Privacy is structural: unexpected owner fields are rejected outright.
    const e = publicEnv() as unknown as { payload: Record<string, unknown> };
    e.payload.own_selection = { phase: "open", selected_ability_id: "tank.fortify" };
    expect(() => validatePublicRoundEnvelope(e)).toThrow(/unexpected field "own_selection"/);
  });

  it("rejects an invalid backend timestamp", () => {
    const e = publicEnv();
    e.payload.active_round!.started_at = "not-a-timestamp";
    expect(() => validatePublicRoundEnvelope(e)).toThrow(/ISO-8601/);
  });
});

describe("resolved envelope path", () => {
  it("extracts the exact payload and feeds the existing settlement adapter", () => {
    const env = resolvedEnv("shield-plus-reduction");
    const viaEnvelope = adaptResolvedRoundEnvelope(env, FIXTURE_PLAYER_IDS);
    const direct = adaptBackendSettlement(
      getScenario("shield-plus-reduction")!.settlement,
      FIXTURE_PLAYER_IDS,
    );
    // Identical result: no settlement mapping is duplicated in the envelope
    // layer, and no damage/XP/charge value is recalculated on the way.
    expect(viaEnvelope).toEqual(direct);
    expect(viaEnvelope.players.p2.finalDamageReceived).toBe(20);
    expect(viaEnvelope.players.p1.finalDamageDealt).toBe(35);
  });

  it("preserves explicit player-id mapping — lexical order never decides p1/p2", () => {
    const env = resolvedEnv("solo-correct");
    // Rename so the frontend's p1 sorts SECOND in the backend array.
    const rename = (id: string) => (id === "alice" ? "zed" : "adam");
    env.payload.players = env.payload.players
      .map((p) => ({ ...p, player_id: rename(p.player_id) }))
      .sort((a, b) => (a.player_id < b.player_id ? -1 : 1));
    const a = adaptResolvedRoundEnvelope(env, { p1PlayerId: "zed", p2PlayerId: "adam" });
    expect(a.players.p1.playerId).toBe("zed");
    expect(a.players.p1.finalDamageDealt).toBe(30); // still the attacker
    expect(a.players.p2.finalDamageReceived).toBe(30);
  });

  it("maps the winner via explicit ids and keeps a draw winner null", () => {
    const win = adaptResolvedRoundEnvelope(resolvedEnv("match-over"), FIXTURE_PLAYER_IDS);
    expect(win.winner).toBe("p1");
    const draw = adaptResolvedRoundEnvelope(resolvedEnv("double-knockout"), FIXTURE_PLAYER_IDS);
    expect(draw.matchOver).toBe(true);
    expect(draw.winner).toBeNull();
  });

  it("keeps historical charges and shared timer values exact (metadata delta)", () => {
    const charges = adaptResolvedRoundEnvelope(resolvedEnv("charge-consumed"), FIXTURE_PLAYER_IDS);
    expect(charges.players.p1.remainingChargesAfterRound).toEqual({
      "tank.fortify": 2,
      "tank.brace": 2,
    });
    const timer = adaptResolvedRoundEnvelope(resolvedEnv("timer-decreased"), FIXTURE_PLAYER_IDS);
    expect(timer.sharedNextRoundDurationSeconds).toBe(18); // authoritative
    expect(timer.sharedTimerDeltaSeconds).toBe(-2); // display metadata only
    for (const p of Object.values(timer.players)) {
      expect(Object.keys(p).filter((k) => /timer|duration|deadline/i.test(k))).toEqual([]);
    }
  });

  it("fails closed on malformed player identity through the envelope path", () => {
    const env = resolvedEnv("solo-correct");
    expect(() =>
      adaptResolvedRoundEnvelope(env, { p1PlayerId: "mallory", p2PlayerId: "bob" }),
    ).toThrow(/missing/);
    expect(() =>
      adaptResolvedRoundEnvelope(env, { p1PlayerId: "alice", p2PlayerId: "alice" }),
    ).toThrow(/distinct/);
  });
});
