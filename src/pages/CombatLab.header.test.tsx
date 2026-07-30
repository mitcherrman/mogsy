/**
 * Contract for the compact Combat Lab header.
 *
 * The old top section stacked four blocks above the simulator: an eyebrow, a
 * developer status strip, an H1 + explanatory paragraph, and a verbose daily
 * credit pill. Together they pushed the versus grid — and the 440px portraits —
 * well below the fold on desktop.
 *
 * These tests pin the replacement: one header row carrying the hub control, the
 * emblem, the full title and the remaining-simulation count, with the removed
 * chrome absent rather than merely hidden. jsdom has no layout engine, so the
 * single-row geometry is pinned as a class contract (the same approach as
 * CombatLab.portrait.test.tsx); pixel geometry is verified in a real browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CombatLab from "./CombatLab";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@/hooks/useSitewideTheme", () => ({
  useSitewideTheme: () => ({ proStatus: "free" }),
}));

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

function header(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>("[data-combat-lab-header]");
  if (!el) throw new Error("no compact Combat Lab header found");
  return el;
}

const TITLE = "COMBAT LAB: LEAGUE OF LEGENDS DAMAGE SIMULATOR";

describe("Combat Lab compact header", () => {
  it("carries the exact title as the page H1", () => {
    mount();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent?.trim()).toBe(TITLE);
  });

  it("puts the hub control, emblem, title and count in one header element", () => {
    const { container } = mount();
    const row = header(container);

    // Hub control is the leftmost child and links back to the League hub.
    const hub = row.querySelector("a");
    expect(hub?.getAttribute("href")).toBe("/lol");
    expect(hub?.textContent).toContain("League Hub");
    expect(row.firstElementChild).toBe(hub);

    // The emblem survives the eyebrow's removal.
    expect(row.querySelector("svg")).not.toBeNull();

    // The H1 lives in the row, not in a block beneath it.
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(row.contains(h1)).toBe(true);
  });

  it("keeps the row on one line at desktop width and lets it wrap below it", () => {
    const { container } = mount();
    const row = header(container);

    expect(row.className).toContain("flex");
    // Wrapping is the narrow-viewport fallback; desktop is pinned to one line.
    expect(row.className).toContain("flex-wrap");
    expect(row.className).toContain("lg:flex-nowrap");

    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.className).toContain("lg:whitespace-nowrap");
    expect(h1.className).toContain("min-w-0");
  });

  it("leaves only a small gap between the header and the simulator grid", () => {
    const { container } = mount();
    const row = header(container);

    // 14px — the single piece of spacing between the row and the versus grid.
    expect(row.className).toContain("mb-3.5");
    expect(row.className).not.toMatch(/(?:^|\s)mb-(?:4|5|6|8|10|12)(?:\s|$)/);

    // Nothing else is stacked between the header and the workspace.
    const tabsRoot = container.querySelector("[data-orientation]");
    expect(tabsRoot).not.toBeNull();
    expect(row.nextElementSibling).toBe(tabsRoot);
  });

  it("renders the remaining simulations as '30/30 left', hard right on desktop", async () => {
    stubFetch({
      "/api/combat-lab/credits": {
        ok: true,
        credits: { unlimited: false, credits_used: 0, credits_limit: 30, credits_remaining: 30 },
      },
    });
    const { container } = mount();

    const count = await waitFor(() => {
      const el = container.querySelector<HTMLElement>("[data-combat-lab-credits]");
      if (!el) throw new Error("credit count not rendered yet");
      return el;
    });

    expect(count.textContent?.replace(/\s+/g, " ").trim()).toBe("30/30 left");
    // Right-aligned on desktop; its own line once the row wraps.
    expect(count.className).toContain("lg:text-right");
    expect(count.className).toContain("basis-full");
    expect(count.className).toContain("lg:basis-auto");
    // It is the last thing in the row, so it sits at the far-right edge.
    expect(header(container).lastElementChild).toBe(count);
  });

  it("drops the verbose credit wording", async () => {
    stubFetch({
      "/api/combat-lab/credits": {
        ok: true,
        credits: { unlimited: false, credits_used: 0, credits_limit: 30, credits_remaining: 30 },
      },
    });
    const { container } = mount();
    await waitFor(() =>
      expect(container.querySelector("[data-combat-lab-credits]")).not.toBeNull(),
    );

    expect(screen.queryByText(/free simulations left today/i)).toBeNull();
    expect(screen.queryByText(/\bof\s+30\b/i)).toBeNull();
  });

  it("drops the separate eyebrow and the explanatory subtitle", () => {
    const { container } = mount();

    // The eyebrow was the only element whose text was exactly "Combat Lab".
    const eyebrow = Array.from(container.querySelectorAll("div, span, p")).find(
      (el) => el.textContent?.trim() === "Combat Lab",
    );
    expect(eyebrow).toBeUndefined();

    expect(screen.queryByText(/Build a champion loadout/i)).toBeNull();
    expect(screen.queryByText(/no account needed/i)).toBeNull();
  });

  it("renders no production diagnostics chrome, at any viewport", () => {
    const { container } = mount();

    expect(screen.queryByText(/Backend Connected/i)).toBeNull();
    expect(screen.queryByText(/Dev Mode/i)).toBeNull();
    expect(screen.queryByText(/^Diagnostics$/i)).toBeNull();
    // No link into the diagnostics surface, and no viewport-gated copy of it.
    expect(container.querySelector('a[href="/combat-lab/diagnostics"]')).toBeNull();
    expect(header(container).querySelector(".lg\\:hidden")).toBeNull();
  });

  it("still mounts the simulator workspace and the 440px portraits", () => {
    const { container } = mount();

    expect(container.querySelector("[data-orientation]")).not.toBeNull();
    const badge = Array.from(container.querySelectorAll("div")).find(
      (d) => d.textContent === "attacker" && d.className.includes("uppercase"),
    );
    expect(badge?.parentElement?.className).toContain("lg:h-[440px]");
  });
});
