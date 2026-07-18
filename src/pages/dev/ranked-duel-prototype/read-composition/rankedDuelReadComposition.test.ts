import { describe, expect, it } from "vitest";
import {
  RankedDuelIdentity,
  RankedDuelReadCompositionState,
  ReadCompositionAction,
  ReadCompositionError,
  initialReadCompositionState,
  pendingSettlementToCommit,
  readCompositionReducer,
} from "./rankedDuelReadComposition";
import { adaptPublicRound, AdaptedPublicRound } from "@/lib/ranked-core/transport/adaptPublicRound";
import {
  adaptPrivatePlayer,
  AdaptedPrivatePlayer,
} from "@/lib/ranked-core/transport/adaptPrivatePlayer";
import {
  FIXTURE_OWNER_ID,
  getPrivateEnvelopeScenario,
  getPublicEnvelopeScenario,
} from "@/lib/ranked-core/transport/rankedDuelEnvelopeFixtures";
import {
  AdaptedSettlement,
  adaptBackendSettlement,
} from "@/lib/ranked-core/backend/adaptBackendSettlement";
import {
  FIXTURE_PLAYER_IDS,
  getScenario,
} from "@/lib/ranked-core/backend/backendSettlementFixtures";

// ---------------------------------------------------------------------------
// Deterministic adapted fixtures (no HTTP anywhere). All committed fixtures
// share matchId "mock-match-001" and player ids alice (p1) / bob (p2).
// ---------------------------------------------------------------------------

const IDENTITY: RankedDuelIdentity = {
  matchId: "mock-match-001",
  p1PlayerId: "alice",
  p2PlayerId: "bob",
  ownerPlayerId: FIXTURE_OWNER_ID, // "alice"
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const publicRound = (
  key = "public-active-question",
  overrides: Partial<AdaptedPublicRound> = {},
): AdaptedPublicRound => ({
  ...adaptPublicRound(clone(getPublicEnvelopeScenario(key)!.envelope), FIXTURE_PLAYER_IDS),
  ...overrides,
});

const privatePlayer = (
  key = "private-idle",
  overrides: Partial<AdaptedPrivatePlayer> = {},
): AdaptedPrivatePlayer => ({
  ...adaptPrivatePlayer(clone(getPrivateEnvelopeScenario(key)!.envelope), FIXTURE_OWNER_ID),
  ...overrides,
});

// Settlements: plain-round is round 1, carryover-consumed round 2,
// match-over (knockout) round 3, double-knockout (draw) round 3.
const settlement = (key: string): AdaptedSettlement =>
  adaptBackendSettlement(clone(getScenario(key)!.settlement), FIXTURE_PLAYER_IDS);

const run = (
  state: RankedDuelReadCompositionState,
  ...actions: ReadCompositionAction[]
): RankedDuelReadCompositionState => actions.reduce(readCompositionReducer, state);

const initialized = () =>
  run(initialReadCompositionState, { type: "INITIALIZE_IDENTITY", identity: IDENTITY });

/** Start a surface request and return [state, itsGeneration]. */
const started = (
  state: RankedDuelReadCompositionState,
  action: ReadCompositionAction,
  surface: "public" | "private" | "resolved",
): [RankedDuelReadCompositionState, number] => {
  const next = readCompositionReducer(state, action);
  return [next, next.requestStatus[surface].generation];
};

/** Shorthand: run one start+success cycle on a surface. */
const applyPublic = (state: RankedDuelReadCompositionState, value: AdaptedPublicRound) => {
  const [s, generation] = started(state, { type: "PUBLIC_REQUEST_STARTED" }, "public");
  return run(s, { type: "PUBLIC_REQUEST_SUCCEEDED", generation, publicRound: value });
};
const applyPrivate = (state: RankedDuelReadCompositionState, value: AdaptedPrivatePlayer) => {
  const [s, generation] = started(state, { type: "PRIVATE_REQUEST_STARTED" }, "private");
  return run(s, { type: "PRIVATE_REQUEST_SUCCEEDED", generation, privatePlayer: value });
};
const applyResolved = (state: RankedDuelReadCompositionState, value: AdaptedSettlement) => {
  const [s, generation] = started(
    state,
    { type: "RESOLVED_REQUEST_STARTED", roundNumber: value.roundNumber },
    "resolved",
  );
  return run(s, { type: "RESOLVED_REQUEST_SUCCEEDED", generation, settlement: value });
};

// ---------------------------------------------------------------------------

describe("identity", () => {
  it("initializes with a valid identity", () => {
    const s = initialized();
    expect(s.identity).toEqual(IDENTITY);
    expect(s.publicRound).toBeNull();
  });

  it("rejects empty ids", () => {
    for (const field of ["matchId", "p1PlayerId", "p2PlayerId", "ownerPlayerId"] as const) {
      expect(() =>
        run(initialReadCompositionState, {
          type: "INITIALIZE_IDENTITY",
          identity: { ...IDENTITY, [field]: "  " },
        }),
      ).toThrow(ReadCompositionError);
    }
  });

  it("rejects identical p1/p2 ids", () => {
    expect(() =>
      run(initialReadCompositionState, {
        type: "INITIALIZE_IDENTITY",
        identity: { ...IDENTITY, p2PlayerId: "alice" },
      }),
    ).toThrow(/must differ/);
  });

  it("requires the owner to be p1 or p2", () => {
    expect(() =>
      run(initialReadCompositionState, {
        type: "INITIALIZE_IDENTITY",
        identity: { ...IDENTITY, ownerPlayerId: "mallory" },
      }),
    ).toThrow(/ownerPlayerId/);
  });

  it("cannot silently change identity after initialization", () => {
    const s = initialized();
    // Same values: harmless no-op.
    expect(run(s, { type: "INITIALIZE_IDENTITY", identity: { ...IDENTITY } })).toBe(s);
    // Different values: explicit failure, not a silent swap.
    expect(() =>
      run(s, {
        type: "INITIALIZE_IDENTITY",
        identity: { ...IDENTITY, matchId: "other-match" },
      }),
    ).toThrow(/RESET first/);
  });

  it("reversed lexical player ordering has no effect (explicit ids only)", () => {
    // Owner "zed" sorts AFTER "adam" — identity is still explicit ids.
    const reversed: RankedDuelIdentity = {
      matchId: "mock-match-001",
      p1PlayerId: "zed",
      p2PlayerId: "adam",
      ownerPlayerId: "zed",
    };
    const s = run(initialReadCompositionState, {
      type: "INITIALIZE_IDENTITY",
      identity: reversed,
    });
    expect(s.identity!.p1PlayerId).toBe("zed");
    // Public payload adapted with the same reversed explicit mapping applies.
    const env = clone(getPublicEnvelopeScenario("public-first-submitted")!.envelope);
    env.payload.players = env.payload.players
      .map((p) => ({ ...p, player_id: p.player_id === "alice" ? "zed" : "adam" }))
      .sort((a, b) => (a.player_id < b.player_id ? -1 : 1));
    const adapted = adaptPublicRound(env, { p1PlayerId: "zed", p2PlayerId: "adam" });
    const applied = applyPublic(s, adapted);
    expect(applied.publicRound!.players.p1.playerId).toBe("zed");
    expect(applied.publicRound!.players.p1.hasSubmitted).toBe(true);
  });
});

describe("public surface precedence", () => {
  it("applies current public state and tracks high-water marks", () => {
    const s = applyPublic(initialized(), publicRound());
    expect(s.publicRound!.matchId).toBe("mock-match-001");
    expect(s.publicHighWater).toEqual({ roundNumber: 3, completedRounds: 2 });
    expect(s.requestStatus.public.phase).toBe("success");
  });

  it("rejects a wrong match id", () => {
    const s = initialized();
    const t = applyPublic(s, publicRound("public-active-question", { matchId: "other-match" }));
    expect(t.publicRound).toBeNull();
  });

  it("ignores an older public round number", () => {
    let s = applyPublic(initialized(), publicRound()); // round 3
    const older = publicRound("public-active-question", { roundNumber: 2 });
    s = applyPublic(s, older);
    expect(s.publicRound!.roundNumber).toBe(3);
  });

  it("ignores a lower completed-round count", () => {
    let s = applyPublic(initialized(), publicRound()); // completedRounds 2
    s = applyPublic(s, publicRound("public-active-question", { completedRounds: 1 }));
    expect(s.publicRound!.completedRounds).toBe(2);
  });

  it("ignores stale public 'active' state for an already-settled round", () => {
    // Settle round 1, then a public payload still claiming round 1 active.
    let s = applyResolved(initialized(), settlement("plain-round")); // round 1
    const stale = publicRound("public-active-question", {
      roundNumber: 1,
      completedRounds: 0,
      activeRound: { ...publicRound().activeRound!, roundNumber: 1 },
    });
    s = applyPublic(s, stale);
    expect(s.publicRound).toBeNull(); // never became current
    expect(s.resolvedRounds[1]).toBeDefined(); // history untouched
  });

  it("applies new-round public state after the previous round resolved", () => {
    let s = applyResolved(initialized(), settlement("plain-round")); // round 1 settled
    const next = publicRound("public-active-question", {
      roundNumber: 2,
      completedRounds: 1,
      activeRound: { ...publicRound().activeRound!, roundNumber: 2 },
    });
    s = applyPublic(s, next);
    expect(s.publicRound!.roundNumber).toBe(2);
    expect(s.resolvedRounds[1]).toBeDefined(); // resolved history unchanged
  });

  it("terminal resolved state beats stale active public state", () => {
    let s = applyResolved(initialized(), settlement("match-over")); // round 3, terminal
    expect(s.matchTerminal).toBe(true);
    const staleActive = publicRound("public-active-question", {
      roundNumber: 4,
      completedRounds: 3,
      activeRound: { ...publicRound().activeRound!, roundNumber: 4 },
    });
    s = applyPublic(s, staleActive); // still claims "active"
    expect(s.publicRound).toBeNull();
    expect(s.matchTerminal).toBe(true);
  });

  it("public state remains structurally free of private fields", () => {
    const s = applyPublic(initialized(), publicRound("public-both-submitted"));
    const flat = JSON.stringify(s.publicRound).toLowerCase();
    for (const banned of [
      "selectedability",
      "remainingcharges",
      "level2",
      "carryover",
      "outcome",
      "damage",
    ]) {
      expect(flat, banned).not.toContain(banned);
    }
  });
});

describe("private surface precedence", () => {
  it("applies current owner-private state", () => {
    const s = applyPrivate(initialized(), privatePlayer());
    expect(s.privatePlayer!.ownerPlayerId).toBe("alice");
    expect(s.requestStatus.private.phase).toBe("success");
  });

  it("rejects a wrong owner", () => {
    const s = applyPrivate(initialized(), privatePlayer("private-idle", { ownerPlayerId: "bob" }));
    expect(s.privatePlayer).toBeNull();
  });

  it("rejects a wrong match id", () => {
    const s = applyPrivate(initialized(), privatePlayer("private-idle", { matchId: "other" }));
    expect(s.privatePlayer).toBeNull();
  });

  it("ignores older private round state", () => {
    let s = applyPrivate(initialized(), privatePlayer("private-idle", { roundNumber: 5 }));
    s = applyPrivate(s, privatePlayer("private-ability-selected", { roundNumber: 4 }));
    expect(s.privatePlayer!.roundNumber).toBe(5);
    expect(s.privatePlayer!.selectedAbilityId).toBeNull(); // still the round-5 state
  });

  it("ignores a stale private generation", () => {
    let s = initialized();
    const [s1, oldGeneration] = started(s, { type: "PRIVATE_REQUEST_STARTED" }, "private");
    // A newer request supersedes the old one before it completes.
    const [s2] = started(s1, { type: "PRIVATE_REQUEST_STARTED" }, "private");
    s = run(s2, {
      type: "PRIVATE_REQUEST_SUCCEEDED",
      generation: oldGeneration,
      privatePlayer: privatePlayer(),
    });
    expect(s.privatePlayer).toBeNull(); // old-generation success ignored
    expect(s.requestStatus.private.phase).toBe("loading"); // newer still owns it
  });

  it("a private failure does not erase public state (and vice versa)", () => {
    let s = applyPublic(initialized(), publicRound());
    const [s1, generation] = started(s, { type: "PRIVATE_REQUEST_STARTED" }, "private");
    s = run(s1, {
      type: "PRIVATE_REQUEST_FAILED",
      generation,
      error: { kind: "network", message: "down" },
    });
    expect(s.publicRound).not.toBeNull();
    expect(s.requestStatus.private).toMatchObject({
      phase: "error",
      error: { kind: "network" },
    });

    // Inverse: public failure keeps private state.
    let t = applyPrivate(initialized(), privatePlayer());
    const [t1, publicGeneration] = started(t, { type: "PUBLIC_REQUEST_STARTED" }, "public");
    t = run(t1, {
      type: "PUBLIC_REQUEST_FAILED",
      generation: publicGeneration,
      error: { kind: "backend_error", message: "boom" },
    });
    expect(t.privatePlayer).not.toBeNull();
    expect(t.requestStatus.public.phase).toBe("error");
  });

  it("private data never merges into public state", () => {
    let s = applyPublic(initialized(), publicRound());
    s = applyPrivate(s, privatePlayer("private-max-level"));
    // Surfaces stay separate objects; nothing private appears under public.
    const flat = JSON.stringify(s.publicRound).toLowerCase();
    for (const banned of ["tank.fortify", "remainingcharges", "level2", "pendingeffects"]) {
      expect(flat, banned).not.toContain(banned);
    }
    expect(s.privatePlayer!.remainingCharges["tank.fortify"]).toBe(2);
  });
});

describe("resolved surface precedence and history", () => {
  it("applies a new resolved settlement and updates the high-water mark", () => {
    const s = applyResolved(initialized(), settlement("plain-round"));
    expect(s.resolvedRounds[1]).toBeDefined();
    expect(s.lastResolvedRoundNumber).toBe(1);
    expect(s.presentation.activeResolvedRoundNumber).toBe(1);
    expect(pendingSettlementToCommit(s)).toBe(s.resolvedRounds[1]);
  });

  it("ignores a duplicate resolved round", () => {
    let s = applyResolved(initialized(), settlement("plain-round"));
    const first = s.resolvedRounds[1];
    s = applyResolved(s, settlement("solo-correct")); // also round 1
    expect(s.resolvedRounds[1]).toBe(first); // untouched
    expect(s.lastResolvedRoundNumber).toBe(1);
  });

  it("ignores an older resolved round", () => {
    let s = applyResolved(initialized(), settlement("carryover-consumed")); // round 2
    s = applyResolved(s, settlement("plain-round")); // round 1 — older
    expect(s.lastResolvedRoundNumber).toBe(2);
    expect(s.resolvedRounds[1]).toBeUndefined();
  });

  it("ignores a stale resolved request generation", () => {
    let s = initialized();
    const [s1, oldGeneration] = started(
      s,
      { type: "RESOLVED_REQUEST_STARTED", roundNumber: 1 },
      "resolved",
    );
    const [s2] = started(s1, { type: "RESOLVED_REQUEST_STARTED", roundNumber: 1 }, "resolved");
    s = run(s2, {
      type: "RESOLVED_REQUEST_SUCCEEDED",
      generation: oldGeneration,
      settlement: settlement("plain-round"),
    });
    expect(s.lastResolvedRoundNumber).toBeNull();
  });

  it("preserves the winner and the simultaneous-knockout draw from the settlement only", () => {
    const win = applyResolved(initialized(), settlement("match-over"));
    expect(win.resolvedRounds[3].winner).toBe("p1");
    expect(win.matchTerminal).toBe(true);

    const draw = applyResolved(initialized(), settlement("double-knockout"));
    expect(draw.resolvedRounds[3].matchOver).toBe(true);
    expect(draw.resolvedRounds[3].winner).toBeNull();
    expect(draw.resolvedRounds[3].completionReason).toBe("simultaneous_knockout");
    expect(draw.matchTerminal).toBe(true);
  });

  it("never infers match-over from HP", () => {
    // A non-terminal settlement that leaves p2 at low HP: matchTerminal stays
    // false because the settlement says matchOver=false — HP is irrelevant.
    const s = applyResolved(initialized(), settlement("solo-correct")); // p2 at 60hp
    expect(s.matchTerminal).toBe(false);
    // Even zero final HP in a hypothetical payload wouldn't matter: the flag
    // only ever copies settlement.matchOver.
    const zeroHp = { ...settlement("carryover-consumed") };
    zeroHp.players = {
      ...zeroHp.players,
      p2: { ...zeroHp.players.p2, hpAfter: 0, reachedZeroHp: true },
    };
    const t = applyResolved(initialized(), zeroHp);
    expect(t.matchTerminal).toBe(false); // matchOver=false wins over HP facts
  });

  it("historical settlement values stay immutable after later private updates", () => {
    let s = applyResolved(initialized(), settlement("charge-consumed")); // round 1
    const before = clone(s.resolvedRounds[1]);
    // Later private state (round 2) with DIFFERENT current charges arrives.
    s = applyPrivate(
      s,
      privatePlayer("private-max-level", { roundNumber: 2 }), // charges fortify 2/brace 2/barrier 1
    );
    expect(s.privatePlayer).not.toBeNull();
    // Historical remaining charges, consumption, damage audit, XP, level-up
    // events, carryover, Combat Lab delta, and completion are untouched.
    expect(s.resolvedRounds[1]).toEqual(before);
    expect(s.resolvedRounds[1].players.p1.remainingChargesAfterRound).toEqual({
      "tank.fortify": 2,
      "tank.brace": 2,
    });
    expect(s.resolvedRounds[1].players.p1.chargeConsumed).toBe(true);
    expect(s.resolvedRounds[1].players.p2.finalDamageReceived).toBe(30);
    expect(s.resolvedRounds[1].players.p1.xpGained).toBe(20);
  });

  it("historical carryover, Combat Lab delta, damage, and XP remain immutable across surface churn", () => {
    let s = applyResolved(initialized(), settlement("combat-lab-delta")); // round 1
    const before = clone(s.resolvedRounds[1]);
    s = applyPublic(
      s,
      publicRound("public-active-question", {
        roundNumber: 2,
        completedRounds: 1,
        activeRound: { ...publicRound().activeRound!, roundNumber: 2 },
      }),
    );
    s = applyPrivate(s, privatePlayer("private-level2-chosen", { roundNumber: 2 }));
    expect(s.resolvedRounds[1]).toEqual(before);
    expect(s.resolvedRounds[1].players.p2.combatLabUnlockDeltaSeconds).toBe(-5);
  });
});

describe("request generations", () => {
  it("a new public request invalidates a prior public response (success AND failure)", () => {
    const s = initialized();
    const [s1, oldGeneration] = started(s, { type: "PUBLIC_REQUEST_STARTED" }, "public");
    const [s2] = started(s1, { type: "PUBLIC_REQUEST_STARTED" }, "public");
    // Old-generation success ignored:
    let t = run(s2, {
      type: "PUBLIC_REQUEST_SUCCEEDED",
      generation: oldGeneration,
      publicRound: publicRound(),
    });
    expect(t.publicRound).toBeNull();
    expect(t.requestStatus.public.phase).toBe("loading");
    // Old-generation failure ignored:
    t = run(s2, {
      type: "PUBLIC_REQUEST_FAILED",
      generation: oldGeneration,
      error: { kind: "network", message: "old" },
    });
    expect(t.requestStatus.public.phase).toBe("loading");
    expect(t.requestStatus.public.error).toBeNull();
  });

  it("a new resolved request invalidates the prior resolved response for the slot", () => {
    let s = initialized();
    const [s1, g1] = started(s, { type: "RESOLVED_REQUEST_STARTED", roundNumber: 1 }, "resolved");
    const [s2, g2] = started(s1, { type: "RESOLVED_REQUEST_STARTED", roundNumber: 2 }, "resolved");
    s = run(
      s2,
      { type: "RESOLVED_REQUEST_SUCCEEDED", generation: g1, settlement: settlement("plain-round") },
      {
        type: "RESOLVED_REQUEST_SUCCEEDED",
        generation: g2,
        settlement: settlement("carryover-consumed"),
      },
    );
    expect(s.resolvedRounds[1]).toBeUndefined(); // stale slot ignored
    expect(s.resolvedRounds[2]).toBeDefined();
  });
});

describe("shared timer and privacy of the composed state", () => {
  it("exactly one shared timer model exists — no per-player timer fields anywhere", () => {
    let s = applyPublic(initialized(), publicRound("public-pressure-shortened"));
    s = applyPrivate(s, privatePlayer());
    // Public: one shared active round object.
    expect(s.publicRound!.activeRound!.durationSeconds).toBe(20);
    for (const p of Object.values(s.publicRound!.players)) {
      expect(Object.keys(p).filter((k) => /timer|duration|deadline/i.test(k))).toEqual([]);
    }
    // Private: only the two shared fields.
    const privateTimerKeys = Object.keys(s.privatePlayer!).filter((k) =>
      /timer|duration|deadline/i.test(k),
    );
    expect(privateTimerKeys.sort()).toEqual([
      "sharedActiveDeadline",
      "sharedNextRoundDurationSeconds",
    ]);
    // Composition adds no timer state of its own.
    expect(
      Object.keys(s).filter((k) => /timer|duration|deadline/i.test(k)),
    ).toEqual([]);
  });

  it("resolved facts do not leak into current pre-resolution public/private state", () => {
    let s = applyResolved(initialized(), settlement("plain-round")); // round 1 settled
    s = applyPublic(
      s,
      publicRound("public-active-question", {
        roundNumber: 2,
        completedRounds: 1,
        activeRound: { ...publicRound().activeRound!, roundNumber: 2 },
      }),
    );
    s = applyPrivate(s, privatePlayer("private-idle", { roundNumber: 2 }));
    // Resolved data is only reachable through resolvedRounds.
    for (const flat of [
      JSON.stringify(s.publicRound).toLowerCase(),
      JSON.stringify(s.privatePlayer).toLowerCase(),
    ]) {
      for (const banned of ["outcome", "finaldamage", "shieldabsorbed", "xpgained", "leveledup"]) {
        expect(flat, banned).not.toContain(banned);
      }
    }
    expect(s.resolvedRounds[1].players.p2.finalDamageReceived).toBe(30);
  });

  it("private state contains no opponent-private record", () => {
    const s = applyPrivate(initialized(), privatePlayer("private-answer-submitted"));
    const flat = JSON.stringify(s.privatePlayer).toLowerCase();
    expect(flat).not.toContain("opponent");
    // Owner-scoped only: the private slot is the owner's model, and public
    // neutral facts stay under publicRound.
    expect(s.privatePlayer!.ownerPlayerId).toBe("alice");
  });
});

describe("reset", () => {
  it("clears all surfaces, history, and presentation", () => {
    let s = applyPublic(initialized(), publicRound());
    s = applyPrivate(s, privatePlayer());
    s = applyResolved(s, settlement("match-over"));
    s = run(s, { type: "RESET" });
    expect(s).toEqual(initialReadCompositionState);
  });

  it("allows a new identity to initialize after reset", () => {
    let s = run(applyResolved(initialized(), settlement("match-over")), { type: "RESET" });
    const newIdentity: RankedDuelIdentity = {
      matchId: "another-match",
      p1PlayerId: "carol",
      p2PlayerId: "dave",
      ownerPlayerId: "dave",
    };
    s = run(s, { type: "INITIALIZE_IDENTITY", identity: newIdentity });
    expect(s.identity).toEqual(newIdentity);
    expect(s.matchTerminal).toBe(false);
    expect(s.lastResolvedRoundNumber).toBeNull();
  });
});
