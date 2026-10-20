/**
 * Hextech Gunblade in Combat Lab, end to end through the page.
 *
 * Pins the four promises the Gunblade change makes to a player: the item's
 * partial-capability warning is shown, Lightning Bolt is offered only against
 * an enemy champion, the cast sends the equipped items and runes the backend
 * needs to authorise it, and a saved build holding inert or corrupt rune
 * entries is cleaned against the backend's executable rune list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CombatLab from "./CombatLab";

const { sfx, toast } = vi.hoisted(() => ({ sfx: { play: vi.fn() }, toast: vi.fn() }));

vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => sfx }));
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast, toasts: [] }) }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@/hooks/usePremiumSession", () => ({
  usePremiumSession: () => ({ proStatus: "free" }),
}));

const CONFIG_KEY = "combat-lab:last-config";
const TARGET_KEY = "combat-lab:target-setup";
const WARNING = "Lightning Bolt models targeted magic damage; range is not verified.";

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

type Recorded = { url: string; body: any };

function stubBackend(step?: () => unknown) {
  const calls: Recorded[] = [];
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
      if (url.includes("/api/health")) return ok({ ok: true, status: "ok" });
      if (url.includes("/api/meta/combat-lab-actions")) return ok({ ok: true, actions: [] });
      if (url.includes("/api/meta/items")) {
        return ok({
          ok: true,
          items: [
            {
              item_name: "Hextech Gunblade",
              item_type: "legendary",
              cost: 3000,
              cost_source: "item_canonical.shop_price",
              simulation_warnings: [WARNING],
            },
            {
              item_name: "Amplifying Tome",
              item_type: "basic",
              cost: 400,
              cost_source: "item_canonical.shop_price",
              simulation_warnings: [],
            },
          ],
        });
      }
      if (url.includes("/api/meta/runes")) {
        return ok({
          ok: true,
          runes: [{ rune_name: "Electrocute", tree_name: "Domination", rune_type: "keystone" }],
          known_unsupported_runes: ["Glacial Augment", "Phase Rush"],
        });
      }
      if (url.includes("/api/combat-lab/active") || url.includes("/api/combat-lab/basic-attack")) {
        calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        const response = step ? step() : { ok: true, result: { state: {}, events: [] } };
        return ok(response);
      }
      return Promise.reject(new Error("offline in test"));
    }),
  );
  return calls;
}

function saveSetup(config: Record<string, unknown>, target: Record<string, unknown>) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  localStorage.setItem(TARGET_KEY, JSON.stringify(target));
}

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

const bolt = () => screen.findByRole("button", { name: /^Gunblade · Lightning Bolt/ });

beforeEach(() => {
  sfx.play.mockReset();
  toast.mockReset();
  vi.stubGlobal("localStorage", createStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("Combat Lab Hextech Gunblade", () => {
  it("casts Lightning Bolt at the enemy champion with items and runes attached", async () => {
    saveSetup(
      { champion: "Ahri", items: ["Hextech Gunblade"], runes: ["Electrocute"] },
      { targetMode: "target_champion", targetChampionName: "Garen" },
    );
    const calls = stubBackend(() => ({
      ok: true,
      result: {
        state: { states: { COOLDOWN_ITEM_HEXTECH_GUNBLADE: 60 } },
        events: [
          {
            type: "damage_packet",
            state: "ITEM_ACTIVE_SECONDARY_TARGET_DAMAGE",
            final_damage: 168,
            damage_type: "magic",
          },
        ],
      },
    }));
    mount();

    const button = await bolt();
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    expect(button.textContent).toContain("25% slow");
    expect(button.textContent).toContain("60s cooldown");
    fireEvent.click(button);

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toContain("/api/combat-lab/active");
    expect(calls[0].body.active_name).toBe("item_hextech_gunblade");
    expect(calls[0].body.item_names).toEqual(["Hextech Gunblade"]);
    expect(calls[0].body.rune_names).toEqual(["Electrocute"]);
    expect(calls[0].body.target_champion_name).toBe("Garen");
    // The timeline names the cast, not the registry key.
    expect((await screen.findAllByText("Gunblade · Lightning Bolt")).length).toBeGreaterThan(0);
  });

  it("refuses to offer the cast against a non-champion target", async () => {
    saveSetup(
      { champion: "Ahri", items: ["Hextech Gunblade"], runes: [] },
      { targetMode: "target_dummy" },
    );
    const calls = stubBackend();
    mount();

    const button = await bolt();
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.textContent).toContain("Select an enemy champion");
    fireEvent.click(button);
    expect(calls).toHaveLength(0);
  });

  it("does not offer Lightning Bolt without the item equipped", async () => {
    saveSetup(
      { champion: "Ahri", items: ["Amplifying Tome"], runes: [] },
      { targetMode: "target_champion", targetChampionName: "Garen" },
    );
    stubBackend();
    mount();
    await screen.findByRole("button", { name: /^Basic Attack/ });
    expect(screen.queryByRole("button", { name: /^Gunblade · Lightning Bolt/ })).toBeNull();
  });

  it("shows the backend's partial-capability warning beside the cast", async () => {
    saveSetup(
      { champion: "Ahri", items: ["Hextech Gunblade"], runes: [] },
      { targetMode: "target_champion", targetChampionName: "Garen" },
    );
    stubBackend();
    mount();
    // Beside the cast button: the Items row starts collapsed.
    const button = await bolt();
    await waitFor(() =>
      expect(button.parentElement?.textContent).toContain(WARNING));
  });

  it("strips inert and corrupt runes from a saved build but keeps executable ones", async () => {
    saveSetup(
      { champion: "Ahri", items: [], runes: ["Electrocute", "Phase Rush", 42, null] },
      { targetMode: "target_dummy" },
    );
    stubBackend();
    mount();

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
      expect(saved.runes).toEqual(["Electrocute"]);
    });
    expect(toast).toHaveBeenCalledWith({
      title: "Unsupported runes removed",
      description: "Phase Rush, 42, null are not executable in Combat Lab.",
    });
  });
});
