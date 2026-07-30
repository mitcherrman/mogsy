import { describe, expect, it } from "vitest";

import {
  buildActiveRequest,
  buildBasicAttackRequest,
  buildItemNames,
  buildRequestState,
  getAuthoritativeCombatTime,
  makeEmptyCombatState,
} from "./combat-request";

/**
 * The six Spellblade items the backend has authoritative profiles for
 * (`spellblade_profiles.SPELLBLADE_PROFILES`). The frontend must transmit these
 * names verbatim — it must never classify, score or special-case them.
 */
const SUPPORTED_SPELLBLADE_ITEMS = [
  "Sheen",
  "Trinity Force",
  "Iceborn Gauntlet",
  "Lich Bane",
  "Essence Reaver",
  "Bloodsong",
];

const attackerStats = { LEVEL: 18, AD: 100, AP: 300 };
const targetStats = { HP: 4000, ARMOR: 0, MR: 0 };

const activeInput = (overrides: Record<string, unknown> = {}) => ({
  championName: "Ezreal",
  itemNames: ["Sheen"],
  attackerStats,
  targetStats,
  currentState: null as unknown,
  activeName: "Q",
  targetScope: "PRIMARY",
  ...overrides,
});

describe("active-action request: attacker inventory (item_names)", () => {
  it("sends a supported Spellblade item in item_names", () => {
    const payload = buildActiveRequest(activeInput({ itemNames: ["Sheen"] }));
    expect(payload.item_names).toEqual(["Sheen"]);
  });

  it.each(SUPPORTED_SPELLBLADE_ITEMS)(
    "transmits the authoritative Spellblade item %s verbatim",
    (item) => {
      const payload = buildActiveRequest(activeInput({ itemNames: [item] }));
      expect(payload.item_names).toEqual([item]);
      // The frontend must not annotate, reclassify or score the item.
      expect(payload).not.toHaveProperty("spellblade_item");
      expect(payload).not.toHaveProperty("spellblade_multiplier");
      expect(payload).not.toHaveProperty("spellblade_ready");
    }
  );

  it("sends a full multi-item build in order, without dropping or reordering", () => {
    const build = [
      "Trinity Force",
      "Berserker's Greaves",
      "Infinity Edge",
      "Lord Dominik's Regards",
      "Bloodthirster",
      "Guardian Angel",
    ];
    const payload = buildActiveRequest(activeInput({ itemNames: build }));
    expect(payload.item_names).toEqual(build);
    expect(payload.item_names).toHaveLength(6);
  });

  it("carries more than one Spellblade item when the user equips both (backend resolves which arms)", () => {
    const payload = buildActiveRequest(
      activeInput({ itemNames: ["Sheen", "Lich Bane"] })
    );
    // Both are transmitted. Choosing the single armed item is the backend's
    // job (`mark_sheet_spellblade_ready` orders by profile), never ours.
    expect(payload.item_names).toEqual(["Sheen", "Lich Bane"]);
  });

  it("drops blank entries and trims names so the backend sees a clean inventory", () => {
    const payload = buildActiveRequest(
      activeInput({ itemNames: ["  Sheen  ", "", "   ", "Lich Bane"] })
    );
    expect(payload.item_names).toEqual(["Sheen", "Lich Bane"]);
  });

  it("sends an empty inventory (never undefined) when nothing is equipped", () => {
    for (const empty of [[], undefined, null]) {
      const payload = buildActiveRequest(activeInput({ itemNames: empty }));
      expect(payload.item_names).toEqual([]);
    }
  });
});

describe("active-action request: non-Spellblade builds are unchanged", () => {
  it("sends a valid request and no Spellblade-specific fields for a build with no Spellblade item", () => {
    const build = ["Rabadon's Deathcap", "Void Staff", "Sorcerer's Shoes"];
    const payload = buildActiveRequest(activeInput({ itemNames: build }));

    expect(payload.item_names).toEqual(build);
    expect(payload.champion_name).toBe("Ezreal");
    expect(payload.active_name).toBe("Q");
    expect(payload.target_scope).toBe("PRIMARY");
    expect(payload.current_time).toBe(0);
    expect(payload.state).toEqual(makeEmptyCombatState());
    // No arming hint of any kind is invented for a non-Spellblade build.
    expect(Object.keys(payload).filter((k) => /spellblade/i.test(k))).toEqual([]);
  });

  it("produces the identical payload shape whether or not a Spellblade item is present", () => {
    const withSpellblade = buildActiveRequest(
      activeInput({ itemNames: ["Sheen"] })
    );
    const withoutSpellblade = buildActiveRequest(
      activeInput({ itemNames: ["Void Staff"] })
    );
    expect(Object.keys(withSpellblade).sort()).toEqual(
      Object.keys(withoutSpellblade).sort()
    );
  });
});

describe("current_time comes from the existing simulation clock", () => {
  it("defaults to 0 with no backend state — matching the long-standing /basic-attack value", () => {
    expect(getAuthoritativeCombatTime(null)).toBe(0);
    expect(getAuthoritativeCombatTime(undefined)).toBe(0);
    expect(getAuthoritativeCombatTime({})).toBe(0);
    expect(getAuthoritativeCombatTime(makeEmptyCombatState())).toBe(0);
  });

  it("reads a backend-provided top-level current_time", () => {
    expect(getAuthoritativeCombatTime({ current_time: 4.25 })).toBe(4.25);
  });

  it("reads a backend-provided states.CURRENT_TIME", () => {
    expect(
      getAuthoritativeCombatTime({ states: { CURRENT_TIME: 7.5 } })
    ).toBe(7.5);
  });

  it("prefers the top-level clock over the nested one", () => {
    expect(
      getAuthoritativeCombatTime({
        current_time: 2,
        states: { CURRENT_TIME: 99 },
      })
    ).toBe(2);
  });

  it("ignores non-finite and non-numeric clock values instead of forwarding garbage", () => {
    expect(getAuthoritativeCombatTime({ current_time: Number.NaN })).toBe(0);
    expect(getAuthoritativeCombatTime({ current_time: Infinity })).toBe(0);
    expect(getAuthoritativeCombatTime({ current_time: "5" })).toBe(0);
    expect(getAuthoritativeCombatTime({ states: { CURRENT_TIME: "5" } })).toBe(0);
  });

  it("is NOT a wall clock: the same state yields the same time across calls", () => {
    const state = { states: { ITEM_SHEET_SPELLBLADE_READY: 1 } };
    const first = getAuthoritativeCombatTime(state);
    const second = getAuthoritativeCombatTime(state);
    expect(first).toBe(second);
    // A wall-clock or Date.now()-derived value would be a large number.
    expect(first).toBe(0);
  });

  it("feeds both routes from that one clock, so the Spellblade ICD is judged identically", () => {
    const state = { current_time: 3.5, states: {} };
    const active = buildActiveRequest(activeInput({ currentState: state }));
    const basic = buildBasicAttackRequest({
      championName: "Ezreal",
      itemNames: ["Sheen"],
      runeNames: [],
      attackerStats,
      targetStats,
      currentState: state,
    });
    expect(active.current_time).toBe(3.5);
    expect(basic.current_time).toBe(3.5);
    expect(active.current_time).toBe(basic.current_time);
  });
});

describe("request state preserves backend-owned mechanic state", () => {
  it("round-trips the three canonical keys the backend snapshot returns", () => {
    const snapshot = {
      states: { ITEM_SHEET_SPELLBLADE_READY: 1 },
      timed_effects: [{ key: "X", expires_at: 3 }],
      permanent_stacks: { NASUS_Q: 120 },
    };
    expect(buildRequestState(snapshot)).toEqual(snapshot);
  });

  const statesOf = (state: unknown): Record<string, unknown> =>
    (state as { states: Record<string, unknown> }).states;

  it("preserves every Spellblade key the arming path writes", () => {
    const armed = {
      states: {
        ITEM_SHEET_SPELLBLADE_READY: 1,
        ITEM_SHEET_SPELLBLADE_ITEM: "Lich Bane",
        ITEM_SHEET_SPELLBLADE_MULTIPLIER: 0.75,
        COOLDOWN_LICH_BANE_SPELLBLADE: 1.5,
      },
      timed_effects: [],
      permanent_stacks: {},
    };
    const sent = buildActiveRequest(
      activeInput({ currentState: armed, itemNames: ["Lich Bane"] })
    );
    expect(sent.state).toEqual(armed);
    expect(statesOf(sent.state).ITEM_SHEET_SPELLBLADE_READY).toBe(1);
    expect(statesOf(sent.state).ITEM_SHEET_SPELLBLADE_ITEM).toBe("Lich Bane");
    expect(statesOf(sent.state).COOLDOWN_LICH_BANE_SPELLBLADE).toBe(1.5);
  });

  it("still strips stray top-level keys that are not part of the snapshot contract", () => {
    const leaky = {
      states: { ITEM_SHEET_SPELLBLADE_READY: 1 },
      timed_effects: [],
      permanent_stacks: {},
      TARGET_DAMAGE_REDUCTION_PERCENT: 75,
      SOME_EXPIRES_AT: 9,
    };
    const built = buildRequestState(leaky);
    expect(Object.keys(built).sort()).toEqual([
      "permanent_stacks",
      "states",
      "timed_effects",
    ]);
    expect(built).not.toHaveProperty("TARGET_DAMAGE_REDUCTION_PERCENT");
    // ...without losing the mechanic state that lives inside `states`.
    expect(built.states.ITEM_SHEET_SPELLBLADE_READY).toBe(1);
  });

  it("normalizes malformed state to the canonical empty shape", () => {
    for (const bad of [null, undefined, 42, "x", [] as unknown]) {
      expect(buildRequestState(bad)).toEqual(makeEmptyCombatState());
    }
    expect(
      buildRequestState({ states: [], timed_effects: {}, permanent_stacks: 1 })
    ).toEqual(makeEmptyCombatState());
  });
});

describe("existing request contracts are not regressed", () => {
  it("keeps the full historical /active field set, plus exactly the two additive fields", () => {
    const payload = buildActiveRequest(
      activeInput({
        extraFields: [
          { copied_champion: "Malphite" },
          { target_champion_name: "Ornn", target_level: 18 },
          { q_rank: 5, w_rank: 5, e_rank: 5, r_rank: 3 },
        ],
      })
    );
    // Historical contract.
    expect(payload.champion_name).toBe("Ezreal");
    expect(payload.attacker_stats).toEqual(attackerStats);
    expect(payload.target_stats).toEqual(targetStats);
    expect(payload.active_name).toBe("Q");
    expect(payload.target_scope).toBe("PRIMARY");
    expect(payload.piercing_arrow_charge_bonus_percent).toBe(0);
    expect(payload.state).toEqual(makeEmptyCombatState());
    expect(payload.copied_champion).toBe("Malphite");
    expect(payload.target_champion_name).toBe("Ornn");
    expect(payload.q_rank).toBe(5);
    expect(payload.r_rank).toBe(3);
    // The two additive fields, and nothing else new.
    expect(payload.item_names).toEqual(["Sheen"]);
    expect(payload.current_time).toBe(0);
  });

  it("keeps the full historical /basic-attack field set unchanged", () => {
    const payload = buildBasicAttackRequest({
      championName: "Ezreal",
      itemNames: ["Sheen", "Infinity Edge"],
      runeNames: ["Electrocute"],
      attackerStats,
      targetStats,
      currentState: null,
      extraFields: [{ q_rank: 5, w_rank: 5, e_rank: 5, r_rank: 3 }],
    });
    expect(Object.keys(payload).sort()).toEqual([
      "attacker_stats",
      "champion_name",
      "current_time",
      "e_rank",
      "item_names",
      "q_rank",
      "r_rank",
      "rune_names",
      "state",
      "target_stats",
      "w_rank",
    ]);
    expect(payload.item_names).toEqual(["Sheen", "Infinity Edge"]);
    expect(payload.rune_names).toEqual(["Electrocute"]);
    expect(payload.current_time).toBe(0);
  });

  it("lets trailing per-action fields override base fields, exactly as the old literal spread did", () => {
    const payload = buildActiveRequest(
      activeInput({ extraFields: [{ target_scope: "RUNAANS_BOLT_1" }] })
    );
    expect(payload.target_scope).toBe("RUNAANS_BOLT_1");
  });

  it("defaults target_scope to PRIMARY when the caller passes an empty scope", () => {
    expect(buildActiveRequest(activeInput({ targetScope: "" })).target_scope).toBe(
      "PRIMARY"
    );
  });

  it("computes no damage, readiness or cooldown client-side", () => {
    const payload = buildActiveRequest(activeInput({ itemNames: ["Lich Bane"] }));
    const keys = Object.keys(payload);
    expect(keys.filter((k) => /damage|cooldown|ready|proc|multiplier/i.test(k))).toEqual(
      []
    );
  });
});

describe("buildItemNames", () => {
  it("is a pass-through normalizer with no item knowledge", () => {
    expect(buildItemNames(["Sheen", "Void Staff"])).toEqual([
      "Sheen",
      "Void Staff",
    ]);
    expect(buildItemNames(undefined)).toEqual([]);
    expect(buildItemNames(null)).toEqual([]);
    expect(buildItemNames("Sheen" as unknown as string[])).toEqual([]);
  });
});
