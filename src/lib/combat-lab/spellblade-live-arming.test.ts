/**
 * End-to-end certification of Combat Lab Spellblade live arming, driven through
 * the real request builders and the real `combatApi` transport against a mocked
 * backend.
 *
 * The mock is a deliberately faithful miniature of the deployed engine
 * (backend commit 21a75f4321c8c7a8c43266aeae83ae8080ee5779), so these tests fail
 * if the frontend stops holding up its half of the contract:
 *
 *   - `/active` arms only when the request carries the attacker's `item_names`
 *     AND the action qualifies AND `current_time >= COOLDOWN_<ITEM>_SPELLBLADE`
 *     (`item_runtime_rules.mark_sheet_spellblade_ready` + `combat_cooldown_state`).
 *   - Arming writes `states.ITEM_SHEET_SPELLBLADE_READY / _ITEM / _MULTIPLIER`
 *     and `COOLDOWN_<ITEM>_SPELLBLADE = current_time + cooldown_seconds`.
 *   - `/basic-attack` consumes readiness exactly once and zeroes it
 *     (`consume_sheet_spellblade`), with no time check on the consume side.
 *   - Responses carry state via `CombatState.snapshot()`, i.e. exactly
 *     `{ states, timed_effects, permanent_stacks }`.
 *
 * ALL Spellblade damage in this file originates in the mock. The frontend is
 * only ever asserted to be a faithful conduit: it must never compute, scale or
 * type a proc itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { combatApi } from "./api";
import { buildActiveRequest, buildBasicAttackRequest } from "./combat-request";

// Keep the transport offline and away from Supabase.
vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: () => Promise.resolve({}),
}));

/* ─────────────── faithful miniature of the backend engine ─────────────── */

/** Mirrors `spellblade_profiles.SPELLBLADE_PROFILES` (name → type + cooldown). */
const SPELLBLADE_PROFILES: Record<
  string,
  { damage_type: "physical" | "magic"; cooldown_seconds: number; proc: number }
> = {
  Sheen: { damage_type: "physical", cooldown_seconds: 1.5, proc: 100 },
  "Trinity Force": { damage_type: "physical", cooldown_seconds: 1.5, proc: 200 },
  "Iceborn Gauntlet": { damage_type: "physical", cooldown_seconds: 1.5, proc: 150 },
  "Lich Bane": { damage_type: "magic", cooldown_seconds: 1.5, proc: 375 },
  "Essence Reaver": { damage_type: "physical", cooldown_seconds: 1.5, proc: 130 },
  Bloodsong: { damage_type: "physical", cooldown_seconds: 1.5, proc: 175 },
};

/** Mirrors `combat_cooldown_state.get_cooldown_key`. */
const cooldownKey = (item: string) =>
  `COOLDOWN_${item.toUpperCase().replace(/ /g, "_").replace(/'/g, "")}_SPELLBLADE`;

/** Mirrors the generic qualifying set in `combat_lab_spellblade_arming`. */
const QUALIFYING = new Set(["q", "w", "e", "r", "sett_q", "kalista_rend"]);
const NON_QUALIFYING = new Set(["p", "passive", "ksante_r", "target_alistar_r"]);

type Snapshot = {
  states: Record<string, unknown>;
  timed_effects: unknown[];
  permanent_stacks: Record<string, unknown>;
};

/** A backend combat event, intentionally open-ended. */
type CombatEvent = Record<string, unknown> & { event?: string };

/** A request body as it went on the wire. */
type WireBody = {
  active_name?: string;
  item_names?: string[];
  current_time?: number;
  state?: Snapshot;
  [k: string]: unknown;
};

/** A response as `unwrapInteractive` hands it back. */
type StepResponse = {
  state?: Snapshot;
  events?: CombatEvent[];
  [k: string]: unknown;
};

const asSnapshot = (raw: unknown): Snapshot => {
  const s = (raw || {}) as Snapshot;
  return {
    states: { ...(s.states || {}) },
    timed_effects: [...(s.timed_effects || [])],
    permanent_stacks: { ...(s.permanent_stacks || {}) },
  };
};

/** Records every request the frontend actually put on the wire. */
type WireCall = { path: string; body: WireBody };
let wire: WireCall[] = [];

function fakeActive(body: WireBody) {
  const state = asSnapshot(body.state);
  const events: CombatEvent[] = [
    { event: "Ability", damage: 300, final_damage: 300, damage_type: "magic" },
  ];

  const name = String(body.active_name || "").toLowerCase();
  const items: string[] = Array.isArray(body.item_names) ? body.item_names : [];
  const currentTime = typeof body.current_time === "number" ? body.current_time : 0;

  const qualifies = QUALIFYING.has(name) && !NON_QUALIFYING.has(name);

  if (qualifies) {
    // `if not items: return []` — nothing to arm without an inventory.
    const spellblade = items.find((i) => SPELLBLADE_PROFILES[i]);
    if (spellblade) {
      const profile = SPELLBLADE_PROFILES[spellblade];
      const key = cooldownKey(spellblade);
      const readyAt = Number(state.states[key] || 0);
      // `is_ready(state, key, current_time)`
      if (currentTime >= readyAt) {
        state.states.ITEM_SHEET_SPELLBLADE_READY = 1;
        state.states.ITEM_SHEET_SPELLBLADE_ITEM = spellblade;
        state.states.ITEM_SHEET_SPELLBLADE_MULTIPLIER = profile.proc;
        state.states[key] = currentTime + profile.cooldown_seconds;
        events.push({
          event: "ITEM_SHEET_SPELLBLADE_READY",
          type: "item_state",
          damage: 0,
          final_damage: 0,
          description: `${spellblade} Spellblade is ready.`,
          metadata: { spellblade_item: spellblade },
        });
      }
    }
  }

  return {
    ok: true,
    result: {
      state,
      events,
      remaining_by_scope: { PRIMARY: { current_hp: 3700, max_hp: 4000 } },
      attacker_stats: { AD: 100 },
      // An unknown-to-the-frontend field, to prove nothing strips it.
      spellblade_debug: { armed_by: body.active_name },
    },
  };
}

function fakeBasicAttack(body: WireBody) {
  const state = asSnapshot(body.state);
  const events: CombatEvent[] = [
    { event: "Basic Attack", damage: 100, final_damage: 100, damage_type: "physical" },
  ];

  // `consume_sheet_spellblade`: readiness only, no time check.
  if (state.states.ITEM_SHEET_SPELLBLADE_READY) {
    const item = String(state.states.ITEM_SHEET_SPELLBLADE_ITEM || "");
    const profile = SPELLBLADE_PROFILES[item];
    state.states.ITEM_SHEET_SPELLBLADE_READY = 0;
    events.push({
      event: "ITEM_SHEET_SPELLBLADE_CONSUME",
      source: item,
      damage: profile.proc,
      final_damage: profile.proc,
      damage_type: profile.damage_type,
      metadata: { spellblade_item: item },
    });
  }

  return { ok: true, result: { state, events, remaining_by_scope: {}, attacker_stats: {} } };
}

beforeEach(() => {
  wire = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const path = String(url);
      const body = JSON.parse(String(init?.body ?? "{}")) as WireBody;
      wire.push({ path, body });
      const payload = path.includes("/api/combat-lab/active")
        ? fakeActive(body)
        : fakeBasicAttack(body);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(payload),
      } as unknown as Response);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ─────────────── the sandbox's live loop, as the page runs it ─────────────── */

const ATTACKER = { LEVEL: 18, AD: 100, AP: 300 };
const TARGET = { HP: 4000, ARMOR: 0, MR: 0 };

/**
 * The sandbox's state merge. This mirrors `applyResponse` in CombatLab.tsx,
 * which assigns the backend snapshot wholesale: `if (res.state) setState(res.state)`.
 */
class Sandbox {
  state: Snapshot | null = null;
  items: string[];
  champion: string;
  events: CombatEvent[] = [];

  constructor(champion: string, items: string[]) {
    this.champion = champion;
    this.items = items;
  }

  private apply(res: StepResponse): StepResponse {
    if (res.state) this.state = res.state;
    if (Array.isArray(res.events)) this.events.push(...res.events);
    return res;
  }

  async cast(activeName: string) {
    const payload = buildActiveRequest({
      championName: this.champion,
      itemNames: this.items,
      attackerStats: ATTACKER,
      targetStats: TARGET,
      currentState: this.state,
      activeName,
      targetScope: "PRIMARY",
    });
    return this.apply(await combatApi.active(payload));
  }

  async attack() {
    const payload = buildBasicAttackRequest({
      championName: this.champion,
      itemNames: this.items,
      runeNames: [],
      attackerStats: ATTACKER,
      targetStats: TARGET,
      currentState: this.state,
    });
    return this.apply(await combatApi.basicAttack(payload));
  }

  get readiness() {
    return this.state?.states?.ITEM_SHEET_SPELLBLADE_READY;
  }

  /** The live `states` bag, which is where the engine keeps mechanic state. */
  get states(): Record<string, unknown> {
    return this.state?.states ?? {};
  }
}

const procEvents = (res: StepResponse): CombatEvent[] =>
  (res.events || []).filter((e) => e.event === "ITEM_SHEET_SPELLBLADE_CONSUME");
const armEvents = (res: StepResponse): CombatEvent[] =>
  (res.events || []).filter((e) => e.event === "ITEM_SHEET_SPELLBLADE_READY");
const lastCall = (path: string) =>
  [...wire].reverse().find((c) => c.path.includes(path))!;

/* ─────────────── certification ─────────────── */

describe("live Spellblade arming: cast → armed → attack → consumed → no duplicate", () => {
  it("runs the full user-visible sequence", async () => {
    const lab = new Sandbox("Ezreal", ["Sheen", "Infinity Edge"]);

    // 1. Ability cast — the request carries the attacker's inventory + clock.
    const cast = await lab.cast("Q");
    const castBody = lastCall("/api/combat-lab/active").body;
    expect(castBody.item_names).toEqual(["Sheen", "Infinity Edge"]);
    expect(castBody.current_time).toBe(0);

    // 2. Backend armed exactly one proc, and the frontend kept the state.
    expect(armEvents(cast)).toHaveLength(1);
    expect(lab.readiness).toBe(1);
    expect(lab.states.ITEM_SHEET_SPELLBLADE_ITEM).toBe("Sheen");
    expect(lab.states.COOLDOWN_SHEEN_SPELLBLADE).toBe(1.5);

    // 3. The following basic attack's request carries the retained state.
    const hit = await lab.attack();
    const hitBody = lastCall("/api/combat-lab/basic-attack").body;
    expect(hitBody.state.states.ITEM_SHEET_SPELLBLADE_READY).toBe(1);
    expect(hitBody.state.states.ITEM_SHEET_SPELLBLADE_ITEM).toBe("Sheen");

    // 4. The proc was consumed exactly once.
    expect(procEvents(hit)).toHaveLength(1);
    expect(procEvents(hit)[0].final_damage).toBe(100);
    expect(lab.readiness).toBe(0);

    // 5. A second attack with no new cast gets no proc.
    const second = await lab.attack();
    expect(procEvents(second)).toHaveLength(0);
    expect(lab.readiness).toBe(0);
  });

  it("arms one proc per qualifying cast — not two", async () => {
    const lab = new Sandbox("Ezreal", ["Sheen"]);
    const cast = await lab.cast("Q");
    expect(armEvents(cast)).toHaveLength(1);
    expect(lab.readiness).toBe(1);
  });

  it("consumes the proc on exactly one attack, then never again unprompted", async () => {
    const lab = new Sandbox("Ezreal", ["Sheen"]);
    await lab.cast("Q");

    const results = [await lab.attack(), await lab.attack(), await lab.attack()];
    const procs = results.flatMap(procEvents);
    expect(procs).toHaveLength(1);
    expect(results.map((r) => procEvents(r).length)).toEqual([1, 0, 0]);
  });

  it("does not arm at all when the attacker holds no Spellblade item", async () => {
    const lab = new Sandbox("Ezreal", ["Void Staff", "Rabadon's Deathcap"]);
    const cast = await lab.cast("Q");
    expect(armEvents(cast)).toHaveLength(0);
    expect(lab.readiness).toBeUndefined();

    const hit = await lab.attack();
    expect(procEvents(hit)).toHaveLength(0);
    // The non-Spellblade build still sent a complete, valid request.
    const body = lastCall("/api/combat-lab/basic-attack").body;
    expect(body.champion_name).toBe("Ezreal");
    expect(body.item_names).toEqual(["Void Staff", "Rabadon's Deathcap"]);
    expect(body.current_time).toBe(0);
  });

  it("does not arm on a non-qualifying action even with a Spellblade equipped", async () => {
    const lab = new Sandbox("K'Sante", ["Sheen"]);
    const cast = await lab.cast("ksante_r");
    expect(armEvents(cast)).toHaveLength(0);
    expect(lab.readiness).toBeUndefined();
    // The inventory was still transmitted; the backend made the decision.
    expect(lastCall("/api/combat-lab/active").body.item_names).toEqual(["Sheen"]);
  });

  it("REGRESSION: an /active request without item_names can never arm", async () => {
    // This is the exact pre-fix behavior. It proves item_names is the cause.
    const legacyPayload = buildActiveRequest({
      championName: "Ezreal",
      itemNames: [],
      attackerStats: ATTACKER,
      targetStats: TARGET,
      currentState: null,
      activeName: "Q",
      targetScope: "PRIMARY",
    });
    const res = await combatApi.active(legacyPayload);
    expect(armEvents(res)).toHaveLength(0);
    expect(res.state?.states.ITEM_SHEET_SPELLBLADE_READY).toBeUndefined();
  });
});

describe("Lich Bane stays backend-authoritative magic damage", () => {
  it("procs as magic with the backend's own number, never a frontend formula", async () => {
    const lab = new Sandbox("Ezreal", ["Lich Bane"]);
    await lab.cast("Q");
    expect(lab.states.ITEM_SHEET_SPELLBLADE_ITEM).toBe("Lich Bane");

    const hit = await lab.attack();
    const proc = procEvents(hit)[0];
    expect(proc).toBeDefined();
    // Type and magnitude are the backend's, verbatim.
    expect(proc.damage_type).toBe("magic");
    expect(proc.final_damage).toBe(SPELLBLADE_PROFILES["Lich Bane"].proc);
    expect(proc.source).toBe("Lich Bane");
  });

  it("is a pure conduit: change the backend number and the frontend result changes with it", async () => {
    const original = SPELLBLADE_PROFILES["Lich Bane"].proc;
    try {
      SPELLBLADE_PROFILES["Lich Bane"].proc = 999;
      const lab = new Sandbox("Ezreal", ["Lich Bane"]);
      await lab.cast("Q");
      const hit = await lab.attack();
      // No frontend formula could produce 999 — it can only have been relayed.
      expect(procEvents(hit)[0].final_damage).toBe(999);
    } finally {
      SPELLBLADE_PROFILES["Lich Bane"].proc = original;
    }
  });

  it("sends no client-side Spellblade damage, readiness or cooldown fields", async () => {
    const lab = new Sandbox("Ezreal", ["Lich Bane"]);
    await lab.cast("Q");
    await lab.attack();
    for (const call of wire) {
      const topLevel = Object.keys(call.body);
      expect(
        topLevel.filter((k) => /spellblade|proc|sheen_multiplier/i.test(k))
      ).toEqual([]);
    }
  });
});

describe("all six authoritative Spellblade items arm through the live route", () => {
  it.each(Object.keys(SPELLBLADE_PROFILES))("arms and procs %s", async (item) => {
    const lab = new Sandbox("Ezreal", [item]);
    const cast = await lab.cast("Q");
    expect(armEvents(cast)).toHaveLength(1);
    expect(lab.states.ITEM_SHEET_SPELLBLADE_ITEM).toBe(item);

    const hit = await lab.attack();
    const proc = procEvents(hit)[0];
    expect(proc.source).toBe(item);
    expect(proc.damage_type).toBe(SPELLBLADE_PROFILES[item].damage_type);
    expect(lab.readiness).toBe(0);
  });
});

describe("response passthrough", () => {
  it("does not drop unknown backend response fields", async () => {
    const lab = new Sandbox("Ezreal", ["Sheen"]);
    const cast = await lab.cast("Q");
    // `unwrapInteractive` spreads the inner result, so new backend fields survive.
    expect(cast.spellblade_debug).toEqual({ armed_by: "Q" });
  });

  it("keeps timed_effects and permanent_stacks alongside the Spellblade keys", async () => {
    const lab = new Sandbox("Nasus", ["Sheen"]);
    lab.state = {
      states: {},
      timed_effects: [{ key: "X", expires_at: 3 }],
      permanent_stacks: { NASUS_Q: 120 },
    };
    await lab.cast("Q");
    const body = lastCall("/api/combat-lab/active").body;
    expect(body.state.timed_effects).toEqual([{ key: "X", expires_at: 3 }]);
    expect(body.state.permanent_stacks).toEqual({ NASUS_Q: 120 });
    expect(lab.state?.permanent_stacks).toEqual({ NASUS_Q: 120 });
  });
});

describe("KNOWN GAP: re-arming needs an authoritative clock", () => {
  it("documents that a pinned 0 clock blocks the second cast's re-arm", async () => {
    const lab = new Sandbox("Ezreal", ["Sheen"]);

    await lab.cast("Q");
    expect(lab.readiness).toBe(1);
    expect(lab.states.COOLDOWN_SHEEN_SPELLBLADE).toBe(1.5);

    await lab.attack();
    expect(lab.readiness).toBe(0);

    // Second cast: the engine gate is `current_time >= COOLDOWN_..._SPELLBLADE`,
    // i.e. `0 >= 1.5` → false, so it cannot re-arm. This is NOT something the
    // frontend may fix by inventing a clock; it needs a real authoritative time
    // source. Asserted so the gap is visible and so the fix flips this test.
    const second = await lab.cast("Q");
    expect(armEvents(second)).toHaveLength(0);
    expect(lab.readiness).toBe(0);
  });

  it("re-arms correctly as soon as an authoritative clock exists", async () => {
    const lab = new Sandbox("Ezreal", ["Sheen"]);
    await lab.cast("Q");
    await lab.attack();
    expect(lab.readiness).toBe(0);

    // Simulate the backend echoing a real clock past the internal cooldown.
    lab.states.CURRENT_TIME = 2.0;

    const second = await lab.cast("Q");
    expect(lastCall("/api/combat-lab/active").body.current_time).toBe(2.0);
    expect(armEvents(second)).toHaveLength(1);
    expect(lab.readiness).toBe(1);
    expect(lab.states.COOLDOWN_SHEEN_SPELLBLADE).toBe(3.5);
  });
});
