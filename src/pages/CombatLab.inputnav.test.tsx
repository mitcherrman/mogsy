/**
 * Contract for the Combat Lab input-navigation toolbar: undo/redo over the
 * canonical simulator inputs, reset-to-defaults with confirmation, previous/
 * next section navigation, keyboard shortcuts that never fight native input
 * undo, and the polite live-region feedback.
 *
 * jsdom has no layout engine, so section geometry degrades to definition
 * order here (every rect is 0). What is pinned is the wiring: stable section
 * ids, focus movement, disabled edges, indicator copy and history semantics.
 * Pixel behavior is verified in a real browser.
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

const toolbar = () =>
  screen.getByRole("toolbar", { name: /input history and section navigation/i });
const undoButton = () => within(toolbar()).getByRole("button", { name: /^Undo/ });
const redoButton = () => within(toolbar()).getByRole("button", { name: /^Redo/ });
const resetButton = () => within(toolbar()).getByRole("button", { name: /^Reset inputs/ });
const prevButton = () => within(toolbar()).getByRole("button", { name: /^Previous section/ });
const nextButton = () => within(toolbar()).getByRole("button", { name: /^Next section/ });
const indicator = () =>
  toolbar().querySelector("[data-combat-lab-section-indicator]") as HTMLElement;
const status = () =>
  toolbar().querySelector("[data-combat-lab-toolbar-status]") as HTMLElement;

function section(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing section ${id}`);
  return el;
}

/** The Q/W/E/R rank pip, addressed by its accessible name. */
const pip = (name: string) => screen.getByRole("button", { name });

const attackerSection = () => section("combat-lab-section-attacker");
const levelInput = () =>
  within(attackerSection()).getByRole("spinbutton") as HTMLInputElement;

describe("Combat Lab input-navigation toolbar", () => {
  it("renders semantic controls with stable geometry and disabled history at start", () => {
    mount();
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();
    // Seeded config differs from defaults, so Reset is live.
    expect(resetButton()).not.toBeDisabled();
    expect(prevButton()).toBeDisabled();
    expect(nextButton()).not.toBeDisabled();
    expect(indicator().textContent).toBe("1 of 6 · Attacker");
    // Icon buttons keep a fixed footprint so enabling/disabling never shifts
    // the row.
    for (const b of [undoButton(), redoButton(), resetButton(), prevButton(), nextButton()]) {
      expect(b.className).toContain("w-8");
      expect(b.tagName).toBe("BUTTON");
    }
    // Shortcut discoverability travels with the accessible name.
    expect(undoButton().getAttribute("aria-label")).toMatch(/Undo \((⌘Z|Ctrl\+Z)\)/);
    expect(undoButton().getAttribute("aria-keyshortcuts")).toBeTruthy();
  });

  it("undoes and redoes a discrete edit, with live-region feedback", async () => {
    mount();
    fireEvent.click(pip("Q rank 4"));
    await waitFor(() => expect(undoButton()).not.toBeDisabled());

    fireEvent.click(undoButton());
    await waitFor(() => expect(redoButton()).not.toBeDisabled());
    expect(screen.getByRole("button", { name: "Cast Q rank 5" })).toBeTruthy();
    expect(status().getAttribute("aria-live")).toBe("polite");
    expect(status().textContent).toBe("Undid ability rank change");

    fireEvent.click(redoButton());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cast Q rank 4" })).toBeTruthy(),
    );
    expect(status().textContent).toBe("Redid ability rank change");
    expect(redoButton()).toBeDisabled();
  });

  it("creates no history for a no-op reassignment", async () => {
    mount();
    // "expected" is already the active crit mode; re-selecting it rebuilds an
    // equal config object and must not become undoable.
    fireEvent.click(within(attackerSection()).getByRole("button", { name: "Edit State" }));
    fireEvent.click(within(attackerSection()).getByRole("button", { name: "expected" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(undoButton()).toBeDisabled();
  });

  it("a divergent edit after undo clears the redo branch", async () => {
    mount();
    fireEvent.click(pip("Q rank 4"));
    fireEvent.click(pip("Q rank 3"));
    await waitFor(() => expect(undoButton()).not.toBeDisabled());
    fireEvent.click(undoButton());
    await waitFor(() => expect(redoButton()).not.toBeDisabled());

    fireEvent.click(pip("W rank 4"));
    await waitFor(() => expect(redoButton()).toBeDisabled());
  });

  it("coalesces rapid typing in one numeric field into a single undo step", async () => {
    mount();
    const input = levelInput();
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.change(input, { target: { value: "15" } });
    fireEvent.change(input, { target: { value: "9" } });
    await waitFor(() => expect(undoButton()).not.toBeDisabled());

    fireEvent.click(undoButton());
    await waitFor(() => expect(levelInput().value).toBe("18"));
    // One transaction: nothing more to undo.
    expect(undoButton()).toBeDisabled();
  });

  it("keeps separate fields as separate transactions", async () => {
    mount();
    fireEvent.change(levelInput(), { target: { value: "12" } });
    fireEvent.click(pip("Q rank 4"));
    await waitFor(() => expect(undoButton()).not.toBeDisabled());

    fireEvent.click(undoButton());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cast Q rank 5" })).toBeTruthy(),
    );
    expect(levelInput().value).toBe("12");
    expect(undoButton()).not.toBeDisabled();
    fireEvent.click(undoButton());
    await waitFor(() => expect(levelInput().value).toBe("18"));
  });

  describe("reset", () => {
    it("confirms, restores canonical defaults, and is one undoable transaction", async () => {
      const { container } = mount();
      expect(container.querySelector('img[src*="/assets/champions/Aatrox"]')).not.toBeNull();

      fireEvent.click(resetButton());
      const dialog = await screen.findByRole("alertdialog", { name: /reset all inputs/i });
      fireEvent.click(within(dialog).getByRole("button", { name: /^Reset inputs$/ }));

      // Back at canonical defaults: champion cleared, Reset disabled.
      await waitFor(() =>
        expect(container.querySelector('img[src*="/assets/champions/Aatrox"]')).toBeNull(),
      );
      expect(resetButton()).toBeDisabled();
      expect(status().textContent).toBe("Inputs reset");

      // Undo immediately restores the complete prior setup.
      fireEvent.click(undoButton());
      await waitFor(() =>
        expect(container.querySelector('img[src*="/assets/champions/Aatrox"]')).not.toBeNull(),
      );
      expect(status().textContent).toBe("Undid inputs reset");
    });

    it("reset after undo invalidates the redo branch", async () => {
      mount();
      fireEvent.click(pip("Q rank 4"));
      fireEvent.click(pip("Q rank 3"));
      await waitFor(() => expect(undoButton()).not.toBeDisabled());
      fireEvent.click(undoButton());
      await waitFor(() => expect(redoButton()).not.toBeDisabled());

      fireEvent.click(resetButton());
      const dialog = await screen.findByRole("alertdialog", { name: /reset all inputs/i });
      fireEvent.click(within(dialog).getByRole("button", { name: /^Reset inputs$/ }));
      await waitFor(() => expect(redoButton()).toBeDisabled());
    });

    it("is disabled — no confirmation needed — when inputs already equal defaults", () => {
      localStorage.removeItem(CONFIG_KEY);
      mount();
      expect(resetButton()).toBeDisabled();
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  describe("keyboard shortcuts", () => {
    it("undoes with Ctrl/Cmd+Z and redoes with both redo conventions", async () => {
      mount();
      fireEvent.click(pip("Q rank 4"));
      await waitFor(() => expect(undoButton()).not.toBeDisabled());

      fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Cast Q rank 5" })).toBeTruthy(),
      );

      // Redo convention 1: Ctrl+Y.
      fireEvent.keyDown(document.body, { key: "y", ctrlKey: true });
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Cast Q rank 4" })).toBeTruthy(),
      );

      // Undo again, then redo convention 2: Ctrl+Shift+Z.
      fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Cast Q rank 5" })).toBeTruthy(),
      );
      fireEvent.keyDown(document.body, { key: "z", ctrlKey: true, shiftKey: true });
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Cast Q rank 4" })).toBeTruthy(),
      );

      // Meta (mac) variants drive the same paths.
      fireEvent.keyDown(document.body, { key: "z", metaKey: true });
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Cast Q rank 5" })).toBeTruthy(),
      );
      fireEvent.keyDown(document.body, { key: "z", metaKey: true, shiftKey: true });
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Cast Q rank 4" })).toBeTruthy(),
      );
    });

    it("prevents default only when a shortcut actually performs work", async () => {
      mount();
      // Nothing to undo yet — the event must pass through untouched.
      expect(fireEvent.keyDown(document.body, { key: "z", ctrlKey: true })).toBe(true);

      fireEvent.click(pip("Q rank 4"));
      await waitFor(() => expect(undoButton()).not.toBeDisabled());
      // Now the app handles it, so default is prevented.
      expect(fireEvent.keyDown(document.body, { key: "z", ctrlKey: true })).toBe(false);
    });

    it("never intercepts Ctrl/Cmd+Z while focus is inside a native input", async () => {
      mount();
      fireEvent.click(pip("Q rank 4"));
      await waitFor(() => expect(undoButton()).not.toBeDisabled());

      const input = levelInput();
      input.focus();
      // Native undo stays native: not prevented, and app history untouched.
      expect(fireEvent.keyDown(input, { key: "z", ctrlKey: true })).toBe(true);
      expect(screen.getByRole("button", { name: "Cast Q rank 4" })).toBeTruthy();
      expect(undoButton()).not.toBeDisabled();
    });

    it("ignores Alt-modified combinations", async () => {
      mount();
      fireEvent.click(pip("Q rank 4"));
      await waitFor(() => expect(undoButton()).not.toBeDisabled());
      expect(
        fireEvent.keyDown(document.body, { key: "z", ctrlKey: true, altKey: true }),
      ).toBe(true);
      expect(screen.getByRole("button", { name: "Cast Q rank 4" })).toBeTruthy();
    });

    it("removes its window keydown listener on unmount", () => {
      const addSpy = vi.spyOn(window, "addEventListener");
      const removeSpy = vi.spyOn(window, "removeEventListener");
      const { unmount } = mount();
      const added = addSpy.mock.calls.filter(([type]) => type === "keydown").map(([, fn]) => fn);
      expect(added.length).toBeGreaterThan(0);
      unmount();
      const removed = removeSpy.mock.calls
        .filter(([type]) => type === "keydown")
        .map(([, fn]) => fn);
      for (const fn of added) expect(removed).toContain(fn);
      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe("section navigation", () => {
    it("walks sections in order, moving focus to the section landmark", async () => {
      mount();
      fireEvent.click(nextButton());
      expect(indicator().textContent).toBe("2 of 6 · Combat");
      expect(document.activeElement).toBe(section("combat-lab-section-combat"));
      expect(status().textContent).toBe("Combat section");
      expect(prevButton()).not.toBeDisabled();

      for (let i = 0; i < 4; i++) fireEvent.click(nextButton());
      expect(indicator().textContent).toBe("6 of 6 · Results");
      expect(nextButton()).toBeDisabled();
      expect(document.activeElement).toBe(section("combat-lab-section-results"));

      fireEvent.click(prevButton());
      expect(indicator().textContent).toBe("5 of 6 · Timeline");
      expect(document.activeElement).toBe(section("combat-lab-section-timeline"));
    });

    it("section landmarks are focusable without becoming tab stops", () => {
      mount();
      for (const id of [
        "combat-lab-section-attacker",
        "combat-lab-section-combat",
        "combat-lab-section-defender",
        "combat-lab-section-stats",
        "combat-lab-section-timeline",
        "combat-lab-section-results",
      ]) {
        const el = section(id);
        expect(el.tabIndex).toBe(-1);
        expect(el.getAttribute("role")).toBe("region");
        expect(el.getAttribute("aria-label")).toBeTruthy();
      }
    });

    it("triggers no simulator calculation", async () => {
      mount();
      // Let the mount-time build-preview debounce settle first.
      await new Promise((r) => setTimeout(r, 400));
      const fetchSpy = fetch as unknown as ReturnType<typeof vi.fn>;
      const combatCalls = () =>
        fetchSpy.mock.calls.filter(([u]) => String(u).includes("/api/combat-lab/")).length;
      const before = combatCalls();
      fireEvent.click(nextButton());
      fireEvent.click(nextButton());
      fireEvent.click(prevButton());
      await new Promise((r) => setTimeout(r, 400));
      expect(combatCalls()).toBe(before);
    });
  });
});
