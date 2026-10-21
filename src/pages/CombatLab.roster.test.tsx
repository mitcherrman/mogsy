/**
 * Universal item/rune availability (owner decision 2026-10-20) through the page.
 *
 * Every current ranked item and rune is selectable, modeled or not. Pins the
 * three promises that makes: limitations of a selected rune are spelled out,
 * options that are not fully modeled carry a badge, and a saved build keeps
 * current-but-unmodeled entries while dropping names League no longer has.
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
const GLACIAL = "Not simulated: the icy-zone slow and damage reduction are not applied.";

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

function stubBackend() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
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
              item_name: "Luden's Echo",
              item_id: 6655,
              item_type: "legendary",
              cost: 2750,
              cost_source: "item_canonical.shop_price",
              capability: "partially_modeled",
              capability_label: "Partially modeled",
              simulation_warnings: ["Echo is not simulated: a rule exists but no live route calls it."],
            },
            {
              item_name: "Stealth Ward",
              item_id: 3340,
              item_type: "trinket",
              cost: 0,
              cost_source: "item_canonical.shop_price",
              capability: "noncombat",
              capability_label: "No combat effect in this simulator",
              simulation_warnings: ["Trinket has no combat effect here: places a vision ward."],
            },
            {
              item_name: "Long Sword",
              item_id: 1036,
              item_type: "basic",
              cost: 350,
              cost_source: "item_canonical.shop_price",
              capability: "fully_modeled",
              capability_label: "Fully modeled",
              simulation_warnings: [],
            },
          ],
        });
      }
      if (url.includes("/api/meta/runes")) {
        return ok({
          ok: true,
          runes: [
            {
              rune_name: "Electrocute",
              tree_name: "Domination",
              rune_type: "keystone",
              capability: "partially_modeled",
              simulation_warnings: ["Electrocute damage is simulated, but only basic attacks build stacks."],
            },
            {
              rune_name: "Glacial Augment",
              tree_name: "Inspiration",
              rune_type: "keystone",
              capability: "not_implemented",
              capability_label: "Mechanics not yet implemented",
              simulation_warnings: [GLACIAL],
            },
          ],
          known_unsupported_runes: ["Phase Rush"],
        });
      }
      return Promise.reject(new Error("offline in test"));
    }),
  );
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

beforeEach(() => {
  sfx.play.mockReset();
  toast.mockReset();
  vi.stubGlobal("localStorage", createStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("Combat Lab universal item and rune availability", () => {
  it("keeps a current rune that is not simulated and spells out its limitation", async () => {
    saveSetup(
      { champion: "Ahri", items: [], runes: ["Glacial Augment"] },
      { targetMode: "target_dummy" },
    );
    stubBackend();
    mount();
    // The collapsed row already says the selection is not fully simulated.
    await screen.findByText(/1 not fully simulated/);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit Runes" })[0]);
    await waitFor(() =>
      expect(screen.getAllByRole("status").some((el) => el.textContent?.includes(GLACIAL))).toBe(true));
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
    expect(saved.runes).toEqual(["Glacial Augment"]);
    expect(toast).not.toHaveBeenCalled();
  });

  it("keeps current unmodeled items but drops items League no longer has", async () => {
    saveSetup(
      { champion: "Ahri", items: ["Luden's Echo", "Luden's Companion", "Stealth Ward"], runes: [] },
      { targetMode: "target_dummy" },
    );
    stubBackend();
    mount();
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
      expect(saved.items).toEqual(["Luden's Echo", "Stealth Ward"]);
    });
    expect(toast).toHaveBeenCalledWith({
      title: "Retired item removed",
      description: "Not in the current ranked roster: Luden's Companion.",
    });
    await screen.findByText(/2 not fully simulated/);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit Items" })[0]);
    await waitFor(() =>
      expect(screen.getAllByRole("status").some((el) =>
        el.textContent?.includes("Echo is not simulated"))).toBe(true));
  });

  it("badges options that are not fully modeled, and only those", async () => {
    saveSetup({ champion: "Ahri", items: [], runes: [] }, { targetMode: "target_dummy" });
    stubBackend();
    mount();
    fireEvent.click((await screen.findAllByRole("button", { name: "Edit Items" }))[0]);
    fireEvent.click((await screen.findAllByRole("button", { name: /Select items/ }))[0]);
    const ward = await screen.findByRole("button", { name: /Stealth Ward/ });
    expect(ward.textContent).toContain("No combat effect");
    expect(screen.getByRole("button", { name: /Luden's Echo/ }).textContent).toContain("Partial");
    expect(screen.getByRole("button", { name: /^Long Sword/ }).textContent).not.toMatch(
      /Partial|Not simulated|No combat effect/);
  });
});
