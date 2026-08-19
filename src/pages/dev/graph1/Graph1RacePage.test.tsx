/**
 * Catalog-driven page tests: loading, error, empty and malformed catalogs, a
 * selected dataset that no longer exists, and URL round-tripping of the race
 * view.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveDatasetKey } from "@/graph1/useGraph1Catalog";
import { makeDataset, type EventSpec } from "@/graph1/testFixtures";
import Graph1RacePage from "./Graph1RacePage";

const SPEC: EventSpec[] = [
  ["player:A", "2020-01-01T10:00:00Z", 1,
   { gameId: "G0", team: "T1", opponent: "GEN", region: "Korea",
     league: "LCK", tournament: "LCK 2020" }],
  ["player:B", "2021-01-02T10:00:00Z", 0,
   { gameId: "G1", team: "FNC", opponent: "G2", region: "EMEA",
     league: "LEC", tournament: "LEC 2021" }],
];

const CATALOG = {
  schemaVersion: 2,
  datasets: [
    {
      key: "faker-champions",
      title: "Faker — champions",
      rankedEntityType: "champion",
      defaultTopN: 10,
      snapshot: { pinned: true, eventCount: 1720, rankedEntityCount: 89 },
    },
    {
      key: "azir-players",
      title: "Azir — players",
      rankedEntityType: "player",
      defaultTopN: 10,
    },
  ],
};

function payload(id: string) {
  const ds = makeDataset(SPEC);
  ds.id = `${id}@all-pro`;
  ds.definition.title = `${id} race`;
  ds.definition.controls = {
    metrics: [
      { id: "cumulative_games", label: "games", unit: "games",
        accumulation: "sum", default: true },
    ],
    filters: [
      { id: "year", kind: "range", source: "occurredAt", label: "Year",
        widget: "range", advanced: false },
      { id: "region", kind: "enum", source: "context.region", label: "Region",
        widget: "select", advanced: false },
      { id: "league", kind: "enum", source: "context.league", label: "League",
        widget: "combobox", advanced: true },
    ],
    topN: { default: 10, options: [5, 10, 15, 20] },
    speed: { default: 1, options: [0.5, 1, 2, 4, 8, 10] },
  };
  return ds;
}

/** useGraph1Catalog/useGraph1Dataset both declare retry: 1, so a failing
 * request needs longer than the 1s default before its error surfaces. */
const RETRY_TIMEOUT = { timeout: 5000 };

let locationSearch = "";

function LocationProbe() {
  locationSearch = useLocation().search;
  return null;
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

function mockFetch(handlers: {
  catalog?: () => unknown | Promise<unknown>;
  catalogStatus?: number;
  datasetStatus?: number;
}) {
  return vi.fn(async (url: string) => {
    if (url.endsWith("/api/graph1/datasets")) {
      if (handlers.catalogStatus && handlers.catalogStatus !== 200) {
        return { ok: false, status: handlers.catalogStatus } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => (handlers.catalog ? handlers.catalog() : CATALOG),
      } as Response;
    }
    if (handlers.datasetStatus && handlers.datasetStatus !== 200) {
      return { ok: false, status: handlers.datasetStatus } as Response;
    }
    const key = url.split("/").pop()!;
    return { ok: true, status: 200, json: async () => payload(key) } as Response;
  });
}

beforeEach(() => {
  locationSearch = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("catalog states", () => {
  it("shows a loading notice before the catalog resolves", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderPage();
    expect(screen.getByText("Loading datasets…")).toBeInTheDocument();
  });

  it("builds the selector from the catalog, not a hardcoded list", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    renderPage();
    expect(
      await screen.findByRole("button", { name: "Faker — champions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Azir — players" }),
    ).toBeInTheDocument();
  });

  it("surfaces a catalog error without crashing", async () => {
    vi.stubGlobal("fetch", mockFetch({ catalogStatus: 503 }));
    renderPage();
    expect(
      await screen.findByRole("alert", {}, RETRY_TIMEOUT),
    ).toHaveTextContent(/catalog is unavailable/);
  });

  it("handles an empty catalog", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ catalog: () => ({ schemaVersion: 2, datasets: [] }) }),
    );
    renderPage();
    expect(
      await screen.findByText(/No datasets are available/),
    ).toBeInTheDocument();
  });

  it("handles a malformed catalog", async () => {
    vi.stubGlobal("fetch", mockFetch({ catalog: () => ({ nope: true }) }));
    renderPage();
    expect(
      await screen.findByRole("alert", {}, RETRY_TIMEOUT),
    ).toHaveTextContent(/malformed dataset catalog/);
  });

  it("drops malformed entries but keeps the good ones", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        catalog: () => ({
          schemaVersion: 2,
          datasets: [null, { key: "ok", title: "Good one" }],
        }),
      }),
    );
    renderPage();
    expect(
      await screen.findByRole("button", { name: "Good one" }),
    ).toBeInTheDocument();
  });

  it("shows pinned snapshot facts before the payload arrives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/graph1/datasets")) {
          return { ok: true, status: 200, json: async () => CATALOG } as Response;
        }
        return new Promise(() => {}) as never;
      }),
    );
    renderPage();
    expect(await screen.findByText(/1,720 games/)).toBeInTheDocument();
  });

  it("surfaces a dataset error separately from a catalog error", async () => {
    vi.stubGlobal("fetch", mockFetch({ datasetStatus: 503 }));
    renderPage();
    expect(
      await screen.findByRole("alert", {}, RETRY_TIMEOUT),
    ).toHaveTextContent(/HTTP 503/);
  });
});

describe("dataset selection", () => {
  it("selects the first dataset when the URL names none", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    renderPage();
    const button = await screen.findByRole("button", {
      name: "Faker — champions",
    });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("honours a dataset named in the URL", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    renderPage("/dev/graph1?d=azir-players");
    const button = await screen.findByRole("button", { name: "Azir — players" });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("falls back when the URL names a dataset that no longer exists", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    renderPage("/dev/graph1?d=deleted-race");
    const button = await screen.findByRole("button", {
      name: "Faker — champions",
    });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("resolveDatasetKey covers the selection rules directly", () => {
    const catalog = CATALOG as never;
    expect(resolveDatasetKey(catalog, "azir-players")).toBe("azir-players");
    expect(resolveDatasetKey(catalog, "gone")).toBe("faker-champions");
    expect(resolveDatasetKey(catalog, undefined)).toBe("faker-champions");
    expect(resolveDatasetKey({ schemaVersion: 2, datasets: [], families: [] }, "x")).toBeNull();
    expect(resolveDatasetKey(undefined, "x")).toBeNull();
  });
});

describe("URL state", () => {
  it("writes the selected dataset into the URL", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Azir — players" }));
    await waitFor(() => expect(locationSearch).toContain("d=azir-players"));
  });

  it("writes a changed top-N and drops it again at the default", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    renderPage();
    const rows = await screen.findByRole("combobox", { name: "Rows shown" });
    fireEvent.change(rows, { target: { value: "20" } });
    await waitFor(() => expect(locationSearch).toContain("top=20"));
    fireEvent.change(screen.getByRole("combobox", { name: "Rows shown" }), {
      target: { value: "10" },
    });
    await waitFor(() => expect(locationSearch).not.toContain("top="));
  });

  it("restores top-N from the URL on load", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    renderPage("/dev/graph1?d=faker-champions&top=15");
    expect(
      await screen.findByRole("list", { name: /Top 15 by/ }),
    ).toBeInTheDocument();
  });

  it("writes only the toggles the user switched off", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    renderPage();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Rank number" }));
    await waitFor(() => expect(locationSearch).toContain("off=rankNumber"));
  });

  it("restores display toggles from the URL", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    const { container } = renderPage(
      "/dev/graph1?d=faker-champions&off=winOverlay",
    );
    await screen.findByRole("list", { name: /Top 10 by/ });
    expect(container.querySelector('[data-bar="wins"]')).toBeNull();
  });

  it("carries the ?api= override through URL updates", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    renderPage("/dev/graph1?api=http://localhost:8321");
    fireEvent.change(await screen.findByRole("combobox", { name: "Rows shown" }), {
      target: { value: "5" },
    });
    await waitFor(() => expect(locationSearch).toContain("api=http"));
    expect(locationSearch).toContain("top=5");
  });

  it("uses the ?api= override as the fetch origin", async () => {
    const fetchMock = mockFetch({});
    vi.stubGlobal("fetch", fetchMock);
    renderPage("/dev/graph1?api=http://localhost:8321");
    await screen.findByRole("button", { name: "Faker — champions" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8321/api/graph1/datasets",
    );
  });

  it("restores filters from the URL and drops ones the data cannot satisfy", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    renderPage("/dev/graph1?d=faker-champions&region=Korea,Atlantis");
    await screen.findByRole("list", { name: /Top 10 by/ });
    expect(await screen.findByText(/1 of 2 games/)).toBeInTheDocument();
  });

  it("switching dataset clears filters rather than carrying them over", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    renderPage("/dev/graph1?d=faker-champions&region=Korea");
    fireEvent.click(await screen.findByRole("button", { name: "Azir — players" }));
    await waitFor(() => expect(locationSearch).not.toContain("region="));
  });
});
