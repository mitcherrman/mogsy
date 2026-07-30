import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CombatLab from "./CombatLab";

/**
 * Regression guard for the Combat Lab portrait layout shift.
 *
 * The versus grid is stretch-aligned, so a portrait frame sized with `flex-1`
 * inherited leftover height from the tallest column and silently grew when the
 * center/defender column expanded as metadata resolved. jsdom has no layout
 * engine, so these tests pin the *sizing contract* — a fixed desktop height and
 * no residual flex sizing — which is what makes the rendered geometry stable.
 * Pixel geometry is verified in a real browser.
 */

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@/hooks/useSitewideTheme", () => ({
  useSitewideTheme: () => ({ proStatus: "free" }),
}));

const CONFIG_KEY = "combat-lab:last-config";
const TARGET_KEY = "combat-lab:target-setup";

/**
 * This environment exposes a non-functional `localStorage` (a bare object), which
 * is why the page reads it defensively. Supply a real one so tests can seed the
 * persisted setup that CombatLab restores synchronously on first render.
 */
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

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorage());
  stubFetch();
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

/**
 * The portrait frame is the parent of ChampionVisual's role badge, whose text
 * content is exactly the lowercase role ("attacker" / "defender").
 */
function portraitFrame(container: HTMLElement, role: "attacker" | "defender"): HTMLElement {
  const badge = Array.from(container.querySelectorAll("div")).find(
    (d) => d.textContent === role && d.className.includes("uppercase"),
  );
  if (!badge?.parentElement) throw new Error(`no ${role} portrait frame found`);
  return badge.parentElement;
}

const RESIDUAL_FLEX = /(?:^|\s)(?:lg:)?flex-1(?:\s|$)/;

describe("Combat Lab portrait frame geometry", () => {
  it("sizes the attacker portrait with a fixed desktop height, not residual flex", () => {
    const { container } = mount();
    const frame = portraitFrame(container, "attacker");

    expect(frame.className).toContain("lg:h-[400px]");
    expect(frame.className).toContain("shrink-0");
    // Residual sizing is what coupled the frame to its siblings' height.
    expect(frame.className).not.toMatch(RESIDUAL_FLEX);
    expect(frame.className).not.toContain("lg:h-auto");
  });

  it("keeps the attacker frame's sizing classes identical across metadata resolution", async () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ champion: "Sett" }));
    stubFetch({
      "/api/health": { ok: true },
      "/api/meta/champions": { champions: [{ id: "Sett", name: "Sett Resolved" }] },
    });

    const { container } = mount();
    const frame = portraitFrame(container, "attacker");

    // Before metadata lands the frame falls back to the raw champion id.
    expect(frame.textContent).toContain("Sett");
    const before = frame.className;

    // Metadata reaching this very subtree is observable via the resolved label.
    await waitFor(() => expect(frame.textContent).toContain("Sett Resolved"));

    expect(frame.className).toBe(before);
    expect(frame.className).toContain("lg:h-[400px]");
    expect(frame.className).not.toMatch(RESIDUAL_FLEX);
  });

  it("gives the defender portrait the same desktop geometry as the attacker", () => {
    localStorage.setItem(
      TARGET_KEY,
      JSON.stringify({ targetMode: "target_champion", targetChampionName: "Malphite" }),
    );
    const { container } = mount();

    const attacker = portraitFrame(container, "attacker");
    const defender = portraitFrame(container, "defender");

    expect(defender.className).toContain("lg:h-[400px]");
    expect(defender.className).not.toMatch(RESIDUAL_FLEX);
    // Both sides resolve to the same desktop height utility.
    const lgHeight = (cls: string) => cls.match(/lg:h-\[\d+px\]/)?.[0];
    expect(lgHeight(defender.className)).toBe(lgHeight(attacker.className));
  });

  it("does not let any portrait frame or its wrapper grow with the grid row", () => {
    // Default target mode is target_dummy, which renders the placeholder
    // defender frame inside its own lg-only wrapper.
    const { container } = mount();

    for (const role of ["attacker", "defender"] as const) {
      const frame = portraitFrame(container, role);
      expect(frame.className).not.toMatch(RESIDUAL_FLEX);
      expect(frame.parentElement?.className ?? "").not.toMatch(RESIDUAL_FLEX);
    }
  });

  it("preserves mobile portrait sizing (200px empty, 300px with a champion)", () => {
    const empty = mount();
    expect(portraitFrame(empty.container, "attacker").className).toContain("h-[200px]");
    cleanup();

    localStorage.setItem(CONFIG_KEY, JSON.stringify({ champion: "Sett" }));
    const picked = mount();
    const frame = portraitFrame(picked.container, "attacker");
    expect(frame.className).toContain("min-h-[300px]");
    expect(frame.className).not.toContain("h-[200px]");
  });
});
