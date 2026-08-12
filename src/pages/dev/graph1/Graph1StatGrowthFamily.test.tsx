/**
 * Phase 4A — the stat-growth family on /dev/graph1.
 *
 * Choosing "Champion stat growth" must land directly on the attack-damage
 * race (the catalog-declared defaultEntity), render the level surface, and
 * offer NO roster picker — the token set is closed and shipped inline.
 * The esports family/dataset surfaces must be unaffected (their own suites
 * cover them; here we only prove coexistence in one catalog).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeStatGrowthDataset } from "@/graph1/testFixtures";
import Graph1RacePage from "./Graph1RacePage";

const STAT_CONTROLS = {
  metrics: [
    {
      id: "champion_stat_value",
      label: "Attack Damage",
      unit: "AD",
      accumulation: "sum",
      valueDisplay: { scale: 100, decimals: 1 },
      default: true,
    },
  ],
  filters: [],
  topN: { default: 10, options: [5, 10, 15, 20] },
  speed: { default: 1, options: [0.5, 1, 2, 4] },
};

const CATALOG = {
  schemaVersion: 2,
  datasets: [
    {
      key: "faker-champions",
      title: "Faker — champions",
      rankedEntityType: "champion",
      defaultTopN: 10,
    },
  ],
  families: [
    {
      id: "player-champions",
      label: "Player → champions",
      focusEntityType: "player",
      rankedEntityType: "champion",
      entitySource: "/api/graph1/entities/players",
      display: { contextMode: "event-header", showSecondaryEntityLabel: false },
      defaultTopN: 10,
    },
    {
      id: "champion-stat-growth",
      label: "Champion stat growth",
      focusEntityType: "stat",
      rankedEntityType: "champion",
      mediaStrategy: "champion-icon",
      keyTemplate: "champion-stat-growth:{entity}",
      stats: [
        { id: "armor", label: "Armor", unit: "Armor" },
        { id: "attack-damage", label: "Attack Damage", unit: "AD" },
        { id: "health", label: "Health", unit: "HP" },
        { id: "magic-resist", label: "Magic Resist", unit: "MR" },
      ],
      defaultEntity: "attack-damage",
      display: {
        contextMode: "event-header",
        showSecondaryEntityLabel: false,
        defaultToggles: {
          winOverlay: false,
          contextLine: false,
          dateLabel: false,
          secondaryLabel: false,
        },
      },
      controls: STAT_CONTROLS,
      defaultTopN: 10,
    },
  ],
};

const UNITS = {
  Alpha: [6000, 6360, 7100],
  Beta: [7000, 7100, 7250],
};

let locationSearch = "";
let requestedUrls: string[] = [];

function LocationProbe() {
  locationSearch = useLocation().search;
  return null;
}

function mockFetch() {
  return vi.fn(async (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    requestedUrls.push(url);
    if (url.endsWith("/api/graph1/datasets")) {
      return { ok: true, status: 200, json: async () => CATALOG } as Response;
    }
    if (url.includes("/datasets/champion-stat-growth")) {
      const stat = decodeURIComponent(url.split(":").pop()!);
      const label = {
        "attack-damage": "Attack Damage", health: "Health",
        armor: "Armor", "magic-resist": "Magic Resist",
      }[stat]!;
      const ds = makeStatGrowthDataset(UNITS, {
        decimals: stat === "health" ? 0 : 1,
      });
      ds.id = `champion-stat-growth:${stat}@base-stats`;
      ds.definition.title = `Champion stat growth — ${label} by level`;
      ds.definition.metric.label = label;
      return { ok: true, status: 200, json: async () => ds } as Response;
    }
    return { ok: false, status: 404 } as Response;
  });
}

function renderPage(initialEntry = "/dev/graph1") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/dev/graph1"
            element={
              <>
                <Graph1RacePage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  requestedUrls = [];
  locationSearch = "";
  vi.stubGlobal("fetch", mockFetch());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("champion stat growth on /dev/graph1", () => {
  it("selecting the family lands on the attack-damage race with no picker", async () => {
    renderPage();
    const familyButton = await screen.findByRole("button", {
      name: "Champion stat growth",
    });
    fireEvent.click(familyButton);

    await waitFor(() =>
      expect(decodeURIComponent(locationSearch)).toContain(
        "d=champion-stat-growth:attack-damage",
      ),
    );
    // the race renders with the level surface
    expect(
      await screen.findByText("Champion stat growth — Attack Damage by level"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("event-header")).toHaveTextContent("Level 1");
    // no roster picker: the stat family has no player/champion focus
    expect(screen.queryByLabelText("Player")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Champion")).not.toBeInTheDocument();
    // and no entity endpoint was ever fetched
    expect(
      requestedUrls.filter((u) => u.includes("/api/graph1/entities/")),
    ).toHaveLength(0);
  });

  it("a shared deep link reproduces the race", async () => {
    renderPage("/dev/graph1?d=champion-stat-growth:attack-damage");
    expect(
      await screen.findByText("Champion stat growth — Attack Damage by level"),
    ).toBeInTheDocument();
    const slider = await screen.findByLabelText("Seek by level");
    expect(slider).toHaveAttribute("max", "3");
  });
});


describe("Phase 4B — four-stat selector", () => {
  it("offers all four stats and switches datasets through d=", async () => {
    renderPage("/dev/graph1?d=champion-stat-growth:attack-damage");
    const selector = (await screen.findByLabelText("Stat")) as HTMLSelectElement;
    expect(selector.value).toBe("attack-damage");
    expect([...selector.options].map((o) => o.textContent)).toEqual([
      "Armor",
      "Attack Damage",
      "Health",
      "Magic Resist",
    ]);

    fireEvent.change(selector, { target: { value: "health" } });
    await waitFor(() =>
      expect(decodeURIComponent(locationSearch)).toContain(
        "d=champion-stat-growth:health",
      ),
    );
    // the new payload replaces the old — title and metric flip, no stale AD
    expect(
      await screen.findByText("Champion stat growth — Health by level"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Champion stat growth — Attack Damage by level"),
    ).not.toBeInTheDocument();
    expect(selector.value).toBe("health");
  });

  it("deep links hydrate each stat directly", async () => {
    renderPage("/dev/graph1?d=champion-stat-growth:magic-resist");
    expect(
      await screen.findByText("Champion stat growth — Magic Resist by level"),
    ).toBeInTheDocument();
    const selector = (await screen.findByLabelText("Stat")) as HTMLSelectElement;
    expect(selector.value).toBe("magic-resist");
    // level header still canonical
    expect(screen.getByTestId("event-header")).toHaveTextContent("Level 1");
  });

  it("esports surfaces expose no stat selector", async () => {
    renderPage("/dev/graph1?d=faker-champions");
    await screen.findByRole("button", { name: "Champion stat growth" });
    expect(screen.queryByLabelText("Stat")).not.toBeInTheDocument();
  });
});
