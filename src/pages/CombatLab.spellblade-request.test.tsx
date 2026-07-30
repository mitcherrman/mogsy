/**
 * Page-level certification that the REAL Combat Lab UI puts the attacker's
 * equipped items and the authoritative clock on the wire.
 *
 * `combat-request.test.ts` certifies the payload builders and
 * `spellblade-live-arming.test.ts` certifies the arm → consume sequence through
 * the transport. Neither proves that CombatLab.tsx actually hands the live
 * loadout to those builders — this file does, by rendering the page, clicking
 * the real ability tile and the real Basic Attack button, and reading the bodies
 * the page sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import CombatLab from "./CombatLab";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@/hooks/useSitewideTheme", () => ({
  useSitewideTheme: () => ({ proStatus: "free" }),
}));
vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: () => Promise.resolve({}),
}));

const EQUIPPED = ["Sheen", "Infinity Edge", "Berserker's Greaves"];

type WireState = {
  states?: Record<string, unknown>;
  timed_effects?: unknown[];
  permanent_stacks?: Record<string, unknown>;
};
type WireBody = {
  champion_name?: string;
  item_names?: string[];
  rune_names?: string[];
  current_time?: number;
  active_name?: string;
  target_scope?: string;
  piercing_arrow_charge_bonus_percent?: number;
  q_rank?: number;
  state?: WireState;
  [k: string]: unknown;
};
type WireCall = { path: string; body: WireBody | null };
let wire: WireCall[] = [];

/** Spellblade state as the backend writes it on a qualifying armed cast. */
const ARMED_STATES = {
  ITEM_SHEET_SPELLBLADE_READY: 1,
  ITEM_SHEET_SPELLBLADE_ITEM: "Sheen",
  ITEM_SHEET_SPELLBLADE_MULTIPLIER: 100,
  COOLDOWN_SHEEN_SPELLBLADE: 1.5,
};

const json = (payload: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  } as unknown as Response);

function routeFetch(path: string, body: WireBody | null) {
  if (path.includes("/api/health")) return json({ ok: true, status: "ok" });
  if (path.includes("/api/meta/champions"))
    return json({ champions: [{ name: "Ezreal" }] });
  if (path.includes("/api/meta/items"))
    return json({ items: EQUIPPED.map((name) => ({ name })) });
  if (path.includes("/api/meta/runes")) return json({ runes: [] });
  if (path.includes("/api/meta/target-profiles"))
    return json({ target_profiles: [{ name: "Tank" }] });
  if (path.includes("/api/meta/summoners")) return json({ summoners: [] });
  if (path.includes("/api/meta/combat-lab-actions")) return json({ actions: [] });
  if (path.includes("/api/meta/target-defenses")) return json({ defenses: [] });
  if (path.includes("/api/meta/options")) return json({});
  if (path.includes("/api/combat-lab/credits"))
    return json({ ok: true, credits: { is_pro: false, unlimited: true, credits_used: 0, credits_limit: null, credits_remaining: null, blocked: false, reset_at: null, upsell_message: null } });
  if (path.includes("/api/combat-lab/build-preview"))
    return json({
      ok: true,
      result: {
        champion_name: "Ezreal",
        level: 18,
        item_names: EQUIPPED,
        rune_names: [],
        summoner_names: [],
        base_stats: {},
        loadout_stats: {},
        build_stats: { AD: 100 },
        runtime_stats: { AD: 100, AP: 300 },
        state: { states: {}, timed_effects: [], permanent_stacks: {} },
        loadout: {},
      },
    });

  if (path.includes("/api/combat-lab/active")) {
    // Arm, exactly as the engine does for a qualifying cast with an inventory.
    const armed =
      Array.isArray(body?.item_names) && body.item_names.includes("Sheen");
    return json({
      ok: true,
      result: {
        state: {
          states: armed ? { ...ARMED_STATES } : {},
          timed_effects: [],
          permanent_stacks: {},
        },
        events: [{ event: "Q", damage: 300, final_damage: 300, damage_type: "magic" }],
        remaining_by_scope: { PRIMARY: { current_hp: 3700, max_hp: 4000 } },
        attacker_stats: { AD: 100 },
      },
    });
  }

  if (path.includes("/api/combat-lab/basic-attack")) {
    const ready = !!body?.state?.states?.ITEM_SHEET_SPELLBLADE_READY;
    return json({
      ok: true,
      result: {
        state: {
          states: ready
            ? { ...ARMED_STATES, ITEM_SHEET_SPELLBLADE_READY: 0 }
            : { ...(body?.state?.states || {}) },
          timed_effects: [],
          permanent_stacks: {},
        },
        events: ready
          ? [
              { event: "Basic Attack", damage: 100, final_damage: 100, damage_type: "physical" },
              { event: "ITEM_SHEET_SPELLBLADE_CONSUME", source: "Sheen", damage: 100, final_damage: 100, damage_type: "physical" },
            ]
          : [{ event: "Basic Attack", damage: 100, final_damage: 100, damage_type: "physical" }],
        remaining_by_scope: {},
        attacker_stats: {},
      },
    });
  }

  return json({ ok: true });
}

/**
 * This repo's vitest environment exposes a `localStorage` global with no
 * methods at all (Node's own global shadows jsdom's Storage), so the page's
 * loadout hydration silently no-ops. Supply a real in-memory Storage for this
 * file only, so the page can hydrate the equipped build the way it does in a
 * browser.
 */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  } as Storage;
}

beforeEach(() => {
  wire = [];
  basicAttackButton = null;
  // jsdom implements neither; the timeline auto-scrolls after every action and
  // would otherwise throw through React's commit phase and unmount the page.
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  vi.stubGlobal("localStorage", memoryStorage());
  // The page hydrates its loadout from here on mount.
  localStorage.setItem(
    "combat-lab:last-config",
    JSON.stringify({
      champion: "Ezreal",
      sequence: "Q",
      items: EQUIPPED,
      runes: [],
      target_profile: "Tank",
      stats: { LEVEL: 18 },
      ranks: { Q: 5, W: 5, E: 5, R: 3 },
    })
  );
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const path = String(url);
      const body: WireBody | null = init?.body
        ? (JSON.parse(String(init.body)) as WireBody)
        : null;
      wire.push({ path, body });
      return routeFetch(path, body);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/combat-lab"]}>
        <CombatLab />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const call = (path: string) => wire.find((c) => c.path.includes(path));
const lastCall = (path: string) =>
  [...wire].reverse().find((c) => c.path.includes(path));

async function castQ() {
  const tile = await screen.findByLabelText(/^Cast Q rank/i);
  await waitFor(() => expect(tile).not.toBeDisabled());
  fireEvent.click(tile);
  await waitFor(() => expect(call("/api/combat-lab/active")).toBeTruthy());
}

/**
 * Resolved once and reused: once the combat timeline has entries it also renders
 * a "Basic Attack" labelled node, so a fresh query would become ambiguous. The
 * action button itself stays the same DOM node across re-renders.
 */
let basicAttackButton: HTMLElement | null = null;

async function basicAttack() {
  const before = wire.filter((c) => c.path.includes("/basic-attack")).length;
  if (!basicAttackButton) {
    basicAttackButton = await screen.findByRole("button", {
      name: /Basic Attack/i,
    });
  }
  const btn = basicAttackButton;
  await waitFor(() => expect(btn).not.toBeDisabled());
  fireEvent.click(btn);
  await waitFor(() =>
    expect(
      wire.filter((c) => c.path.includes("/basic-attack")).length
    ).toBeGreaterThan(before)
  );
}

describe("Combat Lab UI sends the attacker loadout on an ability cast", () => {
  it("puts the equipped items and the clock on the /active request", async () => {
    mount();
    await castQ();

    const body = call("/api/combat-lab/active")!.body;
    expect(body.item_names).toEqual(EQUIPPED);
    expect(body.item_names).toContain("Sheen");
    expect(body.current_time).toBe(0);
    // Historical contract still intact.
    expect(body.champion_name).toBe("Ezreal");
    expect(body.active_name).toBe("Q");
    expect(body.target_scope).toBe("PRIMARY");
    expect(body.piercing_arrow_charge_bonus_percent).toBe(0);
    expect(body.state).toEqual({
      states: {},
      timed_effects: [],
      permanent_stacks: {},
    });
    expect(body.q_rank).toBe(5);
  });

  it("retains the armed Spellblade state into the following basic attack", async () => {
    mount();
    await castQ();
    await basicAttack();

    const body = lastCall("/api/combat-lab/basic-attack")!.body;
    expect(body.state.states.ITEM_SHEET_SPELLBLADE_READY).toBe(1);
    expect(body.state.states.ITEM_SHEET_SPELLBLADE_ITEM).toBe("Sheen");
    expect(body.state.states.COOLDOWN_SHEEN_SPELLBLADE).toBe(1.5);
    // The basic attack still sends its own inventory and clock, as always.
    expect(body.item_names).toEqual(EQUIPPED);
    expect(body.current_time).toBe(0);
  });

  it("does not re-send a consumed proc on the next basic attack", async () => {
    mount();
    await castQ();
    await basicAttack();
    await basicAttack();

    const attacks = wire.filter((c) => c.path.includes("/basic-attack"));
    expect(attacks).toHaveLength(2);
    expect(attacks[0].body.state.states.ITEM_SHEET_SPELLBLADE_READY).toBe(1);
    // Second attack carries the backend's zeroed readiness, not a stale 1.
    expect(attacks[1].body.state.states.ITEM_SHEET_SPELLBLADE_READY).toBe(0);
  });

  it("computes no Spellblade values client-side on any request it sends", async () => {
    mount();
    await castQ();
    await basicAttack();

    for (const c of wire) {
      if (!c.body) continue;
      expect(
        Object.keys(c.body).filter((k) => /spellblade|proc/i.test(k))
      ).toEqual([]);
    }
  });
});
