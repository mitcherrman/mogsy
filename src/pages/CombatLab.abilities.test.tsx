/**
 * Contract for the Combat Lab's castable ability controls.
 *
 * The Q/W/E/R bar used to be four lucide glyphs in a bordered square. It now
 * renders Mogzy's own stored ability art as the content of a pressable frame,
 * with the key badge and rank carried by the frame. jsdom has no layout engine,
 * so what is pinned here is the wiring that a browser then renders: the right
 * image for the right slot, the key label, the cast handler, and the
 * champion-specific variant actions falling back to their parent ability's art.
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

/** Resolve only the endpoints a test cares about; reject the rest (offline). */
function stubFetch(routes: Record<string, unknown> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String((input as Request).url ?? input);
      const hit = Object.keys(routes).find((path) => url.includes(path));
      if (hit) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(routes[hit]),
          text: () => Promise.resolve(""),
        } as unknown as Response);
      }
      return Promise.reject(new Error("offline in test"));
    }),
  );
}

const AATROX_ACTIONS = {
  ok: true,
  actions: [
    {
      id: "aatrox_q1",
      label: "Q1 - The Darkin Blade",
      type: "active",
      champions: ["Aatrox"],
      active_name: "aatrox_q1",
    },
    {
      id: "aatrox_q1_sweetspot",
      label: "Q1 Sweetspot",
      type: "active",
      champions: ["Aatrox"],
      active_name: "aatrox_q1_sweetspot",
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorage());
  stubFetch();
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

/** The cast control for a slot, addressed the way a screen reader would. */
function castButton(slot: "Q" | "W" | "E" | "R"): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^Cast ${slot} rank \\d+$`) });
}

describe("Combat Lab ability buttons", () => {
  it("renders the stored ability icon as the content of each Q/W/E/R button", () => {
    mount();

    const expected: Record<string, string> = {
      Q: "/assets/champions/Aatrox/Q_AatroxQ.png",
      W: "/assets/champions/Aatrox/W_AatroxW.png",
      E: "/assets/champions/Aatrox/E_AatroxE.png",
      R: "/assets/champions/Aatrox/R_AatroxR.png",
    };
    for (const slot of ["Q", "W", "E", "R"] as const) {
      const img = castButton(slot).querySelector("img");
      expect(img, `${slot} has no ability art`).not.toBeNull();
      expect(img?.getAttribute("src")).toContain(expected[slot]);
    }
  });

  it("keeps the pressed key visible on every ability button", () => {
    mount();
    for (const slot of ["Q", "W", "E", "R"] as const) {
      expect(castButton(slot).textContent).toContain(slot);
    }
  });

  it("still shows the ability rank on the button", () => {
    mount();
    // Defaults are Q/W/E 5 and R 3.
    expect(castButton("Q").textContent).toContain("5");
    expect(castButton("R").textContent).toContain("3");
  });

  it("casts through the same handler when an ability button is clicked", async () => {
    const active = vi.fn(() =>
      Promise.resolve({ ok: true, state: {}, events: [], remaining_by_scope: {} }),
    );
    stubFetch({ "/api/combat-lab/active": undefined });
    // Route the active endpoint through a spy so the cast is observable.
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : String((input as Request).url ?? input);
        if (url.includes("/api/combat-lab/active")) {
          active();
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ ok: true, state: {}, events: [] }),
            text: () => Promise.resolve(""),
          } as unknown as Response);
        }
        return Promise.reject(new Error("offline in test"));
      }),
    );

    mount();
    fireEvent.click(castButton("Q"));
    await waitFor(() => expect(active).toHaveBeenCalled());
  });

  it("does not render a champion's art before a champion is chosen", () => {
    localStorage.removeItem(CONFIG_KEY);
    const { container } = mount();
    expect(container.querySelector('img[src*="/assets/champions/"]')).toBeNull();
  });

  it("gives champion-specific variants their parent ability's art and a variant key", async () => {
    stubFetch({ "/api/meta/combat-lab-actions": AATROX_ACTIONS });
    mount();

    const sweetspot = await screen.findByRole("button", { name: "Cast Q1 Sweetspot" });
    // No dedicated sweetspot icon exists, so it reuses Aatrox's Q art…
    expect(sweetspot.querySelector("img")?.getAttribute("src")).toContain(
      "/assets/champions/Aatrox/Q_AatroxQ.png",
    );
    // …and is told apart by its key token plus its caption, not by different art.
    expect(sweetspot.textContent).toContain("Q1");
    expect(screen.getByText("Sweetspot")).toBeTruthy();
    expect(screen.getByText("The Darkin Blade")).toBeTruthy();
  });
});
