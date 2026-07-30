/**
 * Contract for the Combat Lab's action feedback surfaces.
 *
 * Covers the four things this pass changed about how a cast reads back to the
 * user: how variant actions are arranged, what the Last Action panel says, how
 * a repeated action appears in the timeline, and what the page shows once the
 * target is down. jsdom has no layout engine, so what is pinned here is the
 * wiring and the wording — geometry is verified in a real browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CombatLab from "./CombatLab";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@/hooks/useSitewideTheme", () => ({
  useSitewideTheme: () => ({ proStatus: "free" }),
}));

const CONFIG_KEY = "combat-lab:last-config";

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  } as Storage;
}

/** Aatrox's real staged actions, exactly as `/api/meta/combat-lab-actions` lists them. */
const AATROX_ACTIONS = {
  ok: true,
  actions: [
    { id: "aatrox_q1", label: "Q1 - The Darkin Blade", type: "active", champions: ["Aatrox"] },
    { id: "aatrox_q1_sweetspot", label: "Q1 Sweetspot", type: "active", champions: ["Aatrox"] },
    { id: "aatrox_q2", label: "Q2 - The Darkin Blade", type: "active", champions: ["Aatrox"] },
    { id: "aatrox_q2_sweetspot", label: "Q2 Sweetspot", type: "active", champions: ["Aatrox"] },
    { id: "aatrox_q3", label: "Q3 - The Darkin Blade", type: "active", champions: ["Aatrox"] },
    { id: "aatrox_q3_sweetspot", label: "Q3 Sweetspot", type: "active", champions: ["Aatrox"] },
    // No slot token in the label — must keep rendering on its own.
    { id: "aatrox_umbral", label: "Umbral Dash", type: "active", champions: ["Aatrox"] },
  ],
};

/** One mitigated basic-attack packet, shaped exactly like the engine's. */
function packet(final_damage: number) {
  return {
    type: "damage_packet",
    source: "Basic Attack",
    state: "BASIC_ATTACK_DAMAGE",
    description: "",
    raw_damage: final_damage * 1.3,
    final_damage,
    damage_type: "physical",
    mitigated: true,
  };
}

type Recorded = { url: string; body: unknown };

/**
 * Stub the backend. `step` supplies the response for every interactive call, so
 * a test can walk the defender's HP down; each request is recorded so the cast
 * payload can be asserted.
 */
function stubBackend({
  actions = AATROX_ACTIONS,
  step,
}: {
  actions?: unknown;
  step?: (call: number) => unknown;
} = {}) {
  const calls: Recorded[] = [];
  let n = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String((input as Request).url ?? input);
      const ok = (json: unknown) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(json),
          text: () => Promise.resolve(""),
        } as unknown as Response);
      // Backend reachable, otherwise every cast control renders disabled.
      if (url.includes("/api/health")) return ok({ ok: true, status: "ok" });
      if (url.includes("/api/meta/combat-lab-actions")) return ok(actions);
      if (url.includes("/api/combat-lab/active") || url.includes("/api/combat-lab/basic-attack")) {
        calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        return ok(step ? step(n++) : { ok: true, result: { state: {}, events: [] } });
      }
      return Promise.reject(new Error("offline in test"));
    }),
  );
  return calls;
}

/** The Combat Lab's default Target Dummy — the page starts every test here. */
const DUMMY_HP = 4000;

/** A response that leaves the dummy at `hp` of `max`, having just taken `damage`. */
function stepResponse(damage: number, hp: number, max = DUMMY_HP) {
  return {
    ok: true,
    result: {
      state: { states: { TARGET_REMAINING_HP: hp } },
      events: [packet(damage)],
      remaining_by_scope: { PRIMARY: { current_hp: hp, max_hp: max } },
      target_stats: { TARGET_MAX_HP: max, HP: max },
      attacker_stats: {},
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorage());
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ champion: "Aatrox" }));
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
    </QueryClientProvider>,
  );
}

/** The Basic Attack control itself — not a timeline pill that mentions it. */
const basicAttack = () =>
  screen.getByRole("button", { name: /^Basic Attack\s*Auto-attack the primary target$/i });

/* ─────────────── 1. Variant grouping ─────────────── */

describe("Combat Lab variant grouping", () => {
  it("lays Aatrox's Q1/Q2/Q3 out as stages with normal and sweetspot tiles", async () => {
    stubBackend();
    mount();

    await screen.findByRole("button", { name: "Cast Q1 Sweetspot" });
    for (const stage of ["Q1", "Q2", "Q3"]) {
      // The stage header plus the key badge on each of its two tiles.
      expect(screen.getAllByText(stage).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole("button", { name: `Cast ${stage} - The Darkin Blade` })).toBeTruthy();
      expect(screen.getByRole("button", { name: `Cast ${stage} Sweetspot` })).toBeTruthy();
    }
    expect(screen.getAllByText("Normal")).toHaveLength(3);
    expect(screen.getAllByText("Sweetspot")).toHaveLength(3);
    // The shared ability name is stated once per stage, not once per tile.
    expect(screen.getAllByText("The Darkin Blade")).toHaveLength(3);
  });

  it("keeps an action with no slot token as an independent button", async () => {
    stubBackend();
    mount();
    const umbral = await screen.findByRole("button", { name: "Cast Umbral Dash" });
    expect(umbral).toBeTruthy();
    expect(screen.getByText("Umbral Dash")).toBeTruthy();
  });

  it("still casts each variant with its own unchanged action id", async () => {
    const calls = stubBackend();
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Cast Q2 Sweetspot" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toContain("/api/combat-lab/active");
    expect((calls[0].body as any).active_name).toBe("aatrox_q2_sweetspot");
    expect((calls[0].body as any).champion_name).toBe("Aatrox");
    expect((calls[0].body as any).target_scope).toBe("PRIMARY");
  });

  it("keeps the stored parent ability art on every grouped tile", async () => {
    stubBackend();
    mount();
    const tile = await screen.findByRole("button", { name: "Cast Q3 Sweetspot" });
    expect(tile.querySelector("img")?.getAttribute("src")).toContain(
      "/assets/champions/Aatrox/Q_AatroxQ.png",
    );
  });
});

/* ─────────────── 2. Last Action ─────────────── */

describe("Combat Lab Last Action panel", () => {
  it("never shows the engine's internal action type", async () => {
    stubBackend({ step: () => stepResponse(107, 3893) });
    mount();

    fireEvent.click(basicAttack());
    await screen.findByText("Last Action");
    expect(screen.queryByText(/damage_packet/i)).toBeNull();
    expect(screen.queryByText(/BASIC_ATTACK_DAMAGE/)).toBeNull();
  });

  it("leads with the damage figure, its type and the resulting HP", async () => {
    stubBackend({ step: () => stepResponse(107, 3893) });
    mount();

    fireEvent.click(basicAttack());
    await screen.findByText("PHYSICAL DAMAGE");
    expect(screen.getAllByText("107").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/3,893/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/97% left/).length).toBeGreaterThan(0);
  });

  it("names the action a player cast, not the record the engine wrote", async () => {
    stubBackend({ step: () => stepResponse(107, 3893) });
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Cast Q1 Sweetspot" }));
    await screen.findByText("PHYSICAL DAMAGE");
    expect(screen.getAllByText(/Aatrox · Q1 Sweetspot/).length).toBeGreaterThan(0);
  });

  it("says 'no damage' rather than showing a blank result", async () => {
    stubBackend({
      step: () => ({
        ok: true,
        result: {
          state: { states: { TARGET_REMAINING_HP: DUMMY_HP } },
          events: [],
          remaining_by_scope: { PRIMARY: { current_hp: DUMMY_HP, max_hp: DUMMY_HP } },
          target_stats: { TARGET_MAX_HP: DUMMY_HP, HP: DUMMY_HP },
        },
      }),
    });
    mount();

    fireEvent.click(basicAttack());
    await screen.findByText("NO DAMAGE");
  });

  it("labels magic damage as magic", async () => {
    stubBackend({
      step: () => ({
        ok: true,
        result: {
          state: { states: { TARGET_REMAINING_HP: 3800 } },
          events: [{ ...packet(200), damage_type: "magic" }],
          remaining_by_scope: { PRIMARY: { current_hp: 3800, max_hp: DUMMY_HP } },
          target_stats: { TARGET_MAX_HP: DUMMY_HP, HP: DUMMY_HP },
        },
      }),
    });
    mount();

    fireEvent.click(basicAttack());
    await screen.findByText("MAGIC DAMAGE");
  });

  it("keeps diagnostics out of the default view", async () => {
    stubBackend({ step: () => stepResponse(107, 3893) });
    const { container } = mount();

    fireEvent.click(basicAttack());
    await screen.findByText("PHYSICAL DAMAGE");
    expect(screen.queryByText(/raw event:/)).toBeNull();
    expect(container.querySelector('a[href="/combat-lab/diagnostics"]')).toBeNull();
  });
});

/* ─────────────── 3. Timeline compaction ─────────────── */

describe("Combat Lab timeline compaction", () => {
  it("collapses a run of identical basic attacks into one pill", async () => {
    let hp = DUMMY_HP;
    stubBackend({
      step: () => {
        hp -= 107;
        return stepResponse(107, hp);
      },
    });
    mount();

    for (let i = 0; i < 3; i++) {
      fireEvent.click(basicAttack());
      await waitFor(() => expect(screen.getAllByText(/HP left|107/).length).toBeGreaterThan(0));
    }

    await waitFor(() => expect(screen.getByText("×3")).toBeTruthy());
    // Every action is still counted in the timeline's own tally.
    expect(screen.getByText("3", { selector: "span.rounded-full" })).toBeTruthy();
  });

  it("does not collapse actions whose damage differs", async () => {
    let hp = DUMMY_HP;
    const damages = [107, 214];
    stubBackend({
      step: (n) => {
        hp -= damages[n];
        return stepResponse(damages[n], hp);
      },
    });
    mount();

    fireEvent.click(basicAttack());
    await waitFor(() => expect(screen.getAllByText("107").length).toBeGreaterThan(0));
    fireEvent.click(basicAttack());
    await waitFor(() => expect(screen.getAllByText("214").length).toBeGreaterThan(0));

    expect(screen.queryByText("×2")).toBeNull();
  });

  it("leaves the latest action reachable and labelled", async () => {
    let hp = DUMMY_HP;
    stubBackend({
      step: () => {
        hp -= 107;
        return stepResponse(107, hp);
      },
    });
    mount();

    fireEvent.click(basicAttack());
    const pill = await screen.findByRole("button", {
      name: /Action 1, Basic Attack, 107 damage, 3,893 HP remaining/,
    });
    expect(pill).toBeTruthy();
  });
});

/* ─────────────── 4. Defeated target ─────────────── */

describe("Combat Lab defeated target", () => {
  async function killTarget() {
    stubBackend({ step: () => stepResponse(DUMMY_HP, 0) });
    mount();
    fireEvent.click(basicAttack());
    await waitFor(() => expect(screen.getAllByText(/Defeated/i).length).toBeGreaterThan(0));
  }

  it("announces the defeat in words, not colour alone", async () => {
    await killTarget();
    expect(screen.getAllByText(/defeated/i).length).toBeGreaterThan(0);
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/defeated/i);
    expect(status.textContent).toMatch(/reset to start a new sequence/i);
  });

  it("does not appear before an action has resolved", () => {
    stubBackend();
    mount();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/Defeated/i)).toBeNull();
  });

  it("keeps Reset available as the next action", async () => {
    await killTarget();
    const reset = screen.getByRole("button", { name: /Reset/i });
    expect(reset).toBeTruthy();
    expect((reset as HTMLButtonElement).disabled).toBe(false);
  });

  it("leaves cast controls enabled, matching what the backend still accepts", async () => {
    await killTarget();
    // The interactive routes have no post-death guard, so blocking the button
    // here would refuse a request the engine answers.
    expect((basicAttack() as HTMLButtonElement).disabled).toBe(false);
  });

  it("preserves Auto Reset, which stays on and does not fire on death", async () => {
    await killTarget();
    const autoReset = screen.getByRole("switch", { name: /Auto Reset/i });
    expect(autoReset.getAttribute("data-state")).toBe("checked");
    // Death is not a configuration change, so the timeline survives it.
    expect(screen.getAllByText(/Defeated/i).length).toBeGreaterThan(0);
  });
});

/* ─────────────── 5. Regression protection ─────────────── */

describe("Combat Lab action feedback regressions", () => {
  it("keeps the desktop portrait frame at 400px", () => {
    stubBackend();
    const { container } = mount();
    const frames = container.querySelectorAll(".lg\\:h-\\[400px\\]");
    expect(frames.length).toBeGreaterThan(0);
  });

  it("keeps the compact header untouched", () => {
    stubBackend();
    const { container } = mount();
    const row = container.querySelector("[data-combat-lab-header]");
    expect(row).not.toBeNull();
    expect(String(row?.className)).toContain("mb-3.5");
    expect(screen.queryByText(/Dev Mode/i)).toBeNull();
    expect(screen.queryByText(/Backend Connected/i)).toBeNull();
  });

  it("still renders real ability art on the Q/W/E/R bar", () => {
    stubBackend();
    mount();
    const q = screen.getByRole("button", { name: /^Cast Q rank \d+$/ });
    expect(q.querySelector("img")?.getAttribute("src")).toContain(
      "/assets/champions/Aatrox/Q_AatroxQ.png",
    );
  });

  it("shows the ability art on timeline pills too", async () => {
    stubBackend({ step: () => stepResponse(107, 3893) });
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^Cast Q rank \d+$/ }));
    const pill = await screen.findByRole("button", { name: /Action 1, .*107 damage/ });
    expect(within(pill).getByRole("presentation", { hidden: true })).toBeTruthy();
  });
});
