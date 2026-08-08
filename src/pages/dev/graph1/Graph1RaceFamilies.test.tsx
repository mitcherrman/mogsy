/**
 * Phase 3A — parameterized family + focus-entity selection on /dev/graph1.
 *
 * Covers what the fixed-dataset tests could not: choosing a family, searching and
 * picking a focus entity, the `<family>:<entity>` URL round trip, Back/Forward
 * across entity choices, an unknown dynamic key surfacing as an error instead of
 * silently rendering a different race, and the zero-event empty state.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveDatasetKey } from "@/graph1/useGraph1Catalog";
import { makeDataset, type EventSpec } from "@/graph1/testFixtures";
import Graph1RacePage from "./Graph1RacePage";

const SPEC: EventSpec[] = [
  ["champion:Azir", "2020-01-01T10:00:00Z", 1,
   { gameId: "G0", team: "T1", opponent: "GEN", region: "Korea", league: "LCK" }],
  ["champion:Orianna", "2021-01-02T10:00:00Z", 0,
   { gameId: "G1", team: "FNC", opponent: "G2", region: "EMEA", league: "LEC" }],
];

const CONTROLS = {
  metrics: [
    { id: "cumulative_games", label: "games", unit: "games",
      accumulation: "sum", default: true },
  ],
  filters: [
    { id: "year", kind: "range", source: "occurredAt", label: "Year",
      widget: "range", advanced: false },
  ],
  topN: { default: 10, options: [5, 10, 15, 20] },
  speed: { default: 1, options: [0.5, 1, 2, 4, 8, 10] },
};

const CATALOG = {
  schemaVersion: 2,
  datasets: [
    { key: "faker-champions", title: "Faker — champions",
      rankedEntityType: "champion", defaultTopN: 10 },
    { key: "azir-players", title: "Azir — players",
      rankedEntityType: "player", defaultTopN: 10 },
  ],
  families: [
    {
      id: "player-champions", label: "Player → champions",
      focusEntityType: "player", rankedEntityType: "champion",
      mediaStrategy: "champion-icon",
      display: { contextMode: "event-header", showSecondaryEntityLabel: false },
      controls: CONTROLS, defaultTopN: 10,
      entitySource: "/api/graph1/entities/players",
    },
    {
      id: "champion-players", label: "Champion → players",
      focusEntityType: "champion", rankedEntityType: "player",
      mediaStrategy: "role-initials",
      display: { contextMode: "latest-entity-context",
                 showSecondaryEntityLabel: true },
      controls: CONTROLS, defaultTopN: 10,
      entitySource: "/api/graph1/entities/champions",
    },
  ],
};

const CHAMPIONS = {
  family: "champion-players",
  total: 3,
  entities: [
    { id: "azir", label: "Azir", games: 18377 },
    { id: "lee-sin", label: "Lee Sin", games: 20507 },
    { id: "kaisa", label: "Kai'Sa", games: 21830 },
  ],
};

const PLAYERS: Record<string, unknown> = {
  "": {
    family: "player-champions", query: "", limit: 25, listedTotal: 7939,
    minGames: 20,
    entities: [
      { id: "Faker", label: "Faker", games: 1721, sublabel: "Lee Sang-hyeok" },
      { id: "Xiaohu", label: "Xiaohu", games: 1422 },
    ],
  },
  chov: {
    family: "player-champions", query: "chov", limit: 25, listedTotal: 7939,
    minGames: 20,
    entities: [{ id: "Chovy", label: "Chovy", games: 1050 }],
  },
};

let locationSearch = "";
let requestedUrls: string[] = [];

/** `:` is percent-encoded by setSearchParams but literal in initialEntries, so
 * every URL assertion compares the DECODED query string. */
function currentQuery(): string {
  return decodeURIComponent(locationSearch);
}

function LocationProbe() {
  locationSearch = useLocation().search;
  return null;
}

/** MemoryRouter keeps its own history, so window.history.back() does not drive
 * it. This exposes the router's own back navigation to the test. */
function BackButton() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      test-back
    </button>
  );
}

function payload(key: string, opts: { empty?: boolean } = {}) {
  const ds = makeDataset(SPEC);
  ds.id = `${key}@all-pro`;
  ds.definition.title = `${key} race`;
  ds.definition.controls = CONTROLS as never;
  if (opts.empty) {
    ds.events = [];
    ds.coverage.eligibleEventCount = 0;
    ds.coverage.firstEventAt = null;
    ds.coverage.lastEventAt = null;
    ds.coverage.generatedAt = null;
  }
  return ds;
}

function mockFetch(
  opts: { datasetStatus?: number; emptyKeys?: string[] } = {},
) {
  return vi.fn(async (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    requestedUrls.push(url);
    if (url.endsWith("/api/graph1/datasets")) {
      return { ok: true, status: 200, json: async () => CATALOG } as Response;
    }
    if (url.includes("/api/graph1/entities/champions")) {
      return { ok: true, status: 200, json: async () => CHAMPIONS } as Response;
    }
    if (url.includes("/api/graph1/entities/players")) {
      const q = new URL(url).searchParams.get("q") ?? "";
      return {
        ok: true, status: 200,
        json: async () => PLAYERS[q] ?? PLAYERS[""],
      } as Response;
    }
    if (opts.datasetStatus && opts.datasetStatus !== 200) {
      return { ok: false, status: opts.datasetStatus } as Response;
    }
    const key = decodeURIComponent(url.split("/datasets/").pop()!);
    return {
      ok: true, status: 200,
      json: async () => payload(key, { empty: opts.emptyKeys?.includes(key) }),
    } as Response;
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
                <BackButton />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  locationSearch = "";
  requestedUrls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// key resolution

describe("dynamic key resolution", () => {
  it("passes a family instance key through instead of falling back", () => {
    // The decisive property: a family key is never in the catalog, so the old
    // membership test would have silently swapped in datasets[0] and rendered a
    // DIFFERENT race than the shared link asked for.
    expect(resolveDatasetKey(CATALOG as never, "player-champions:Chovy")).toBe(
      "player-champions:Chovy",
    );
    expect(resolveDatasetKey(CATALOG as never, "champion-players:kaisa")).toBe(
      "champion-players:kaisa",
    );
  });

  it("still falls back for an unknown NON-family key", () => {
    expect(resolveDatasetKey(CATALOG as never, "deleted-race")).toBe(
      "faker-champions",
    );
  });

  it("keeps legacy keys exactly as requested", () => {
    for (const key of ["faker-champions", "azir-players"]) {
      expect(resolveDatasetKey(CATALOG as never, key)).toBe(key);
    }
  });
});

// ---------------------------------------------------------------------------
// family + entity selection

describe("family selection", () => {
  it("offers both families from discovery", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPage();
    expect(
      await screen.findByRole("button", { name: "Player → champions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Champion → players" }),
    ).toBeInTheDocument();
  });

  it("choosing a family lands on its default focus entity", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Champion → players" }),
    );
    await waitFor(() =>
      expect(currentQuery()).toContain("d=champion-players:azir"),
    );
  });

  it("shows the champion picker for a champion-focus family", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPage("/dev/graph1?d=champion-players:azir");
    expect(
      await screen.findByRole("button", { name: /^Champion:/ }),
    ).toBeInTheDocument();
  });

  it("shows the player picker for a player-focus family", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPage("/dev/graph1?d=player-champions:Faker");
    expect(
      await screen.findByRole("button", { name: /^Player:/ }),
    ).toBeInTheDocument();
  });
});

describe("champion selection", () => {
  it("filters the preloaded list client-side and selects into the URL", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPage("/dev/graph1?d=champion-players:azir");

    fireEvent.click(await screen.findByRole("button", { name: /^Champion:/ }));
    const search = await screen.findByLabelText("Search Champion");
    fireEvent.change(search, { target: { value: "lee" } });

    const option = await screen.findByRole("option", { name: /Lee Sin/ });
    fireEvent.click(option);

    await waitFor(() =>
      expect(currentQuery()).toContain("d=champion-players:lee-sin"),
    );
    // one champion request, no per-keystroke traffic
    expect(
      requestedUrls.filter((u) => u.includes("/entities/champions")).length,
    ).toBe(1);
  });

  it("resolves punctuation champions by slug", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPage("/dev/graph1?d=champion-players:azir");
    fireEvent.click(await screen.findByRole("button", { name: /^Champion:/ }));
    fireEvent.click(await screen.findByRole("option", { name: /Kai'Sa/ }));
    await waitFor(() =>
      expect(currentQuery()).toContain("d=champion-players:kaisa"),
    );
  });
});

describe("player search", () => {
  it("queries the server for a typed term and selects the result", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPage("/dev/graph1?d=player-champions:Faker");

    fireEvent.click(await screen.findByRole("button", { name: /^Player:/ }));
    fireEvent.change(await screen.findByLabelText("Search Player"), {
      target: { value: "chov" },
    });

    const option = await screen.findByRole("option", { name: /Chovy/ }, {
      timeout: 4000,
    });
    fireEvent.click(option);
    await waitFor(() =>
      expect(currentQuery()).toContain("d=player-champions:Chovy"),
    );
  });

  it("shows the initial listing before anything is typed", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPage("/dev/graph1?d=player-champions:Faker");
    fireEvent.click(await screen.findByRole("button", { name: /^Player:/ }));
    expect(await screen.findByRole("option", { name: /Faker/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Xiaohu/ })).toBeInTheDocument();
  });

  it("debounces so typing does not fire a request per keystroke", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPage("/dev/graph1?d=player-champions:Faker");
    fireEvent.click(await screen.findByRole("button", { name: /^Player:/ }));
    const input = await screen.findByLabelText("Search Player");
    for (const value of ["c", "ch", "cho", "chov"]) {
      fireEvent.change(input, { target: { value } });
    }
    await screen.findByRole("option", { name: /Chovy/ }, { timeout: 4000 });
    const playerCalls = requestedUrls.filter((u) =>
      u.includes("/entities/players"),
    );
    // the empty-query listing plus the one settled term — not four
    expect(playerCalls.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// URL + navigation

describe("URL state", () => {
  it("hydrates a dynamic key from the URL and fetches exactly it", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPage("/dev/graph1?d=player-champions:Chovy");
    expect(
      await screen.findByRole("heading", { name: "player-champions:Chovy race" }),
    ).toBeInTheDocument();
    expect(
      requestedUrls.some((u) =>
        u.includes("/api/graph1/datasets/player-champions:Chovy"),
      ),
    ).toBe(true);
  });

  it("changing entity pushes history so Back returns to the previous race", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPage("/dev/graph1?d=champion-players:azir");

    fireEvent.click(await screen.findByRole("button", { name: /^Champion:/ }));
    fireEvent.click(await screen.findByRole("option", { name: /Lee Sin/ }));
    await waitFor(() =>
      expect(currentQuery()).toContain("d=champion-players:lee-sin"),
    );

    fireEvent.click(screen.getByRole("button", { name: "test-back" }));
    await waitFor(() =>
      expect(currentQuery()).toContain("d=champion-players:azir"),
    );
  });

  it("does not leave the previous entity's race on screen after a switch", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPage("/dev/graph1?d=champion-players:azir");
    await screen.findByRole("heading", { name: "champion-players:azir race" });

    fireEvent.click(screen.getByRole("button", { name: /^Champion:/ }));
    fireEvent.click(await screen.findByRole("option", { name: /Lee Sin/ }));

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "champion-players:azir race" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole("heading", {
        name: "champion-players:lee-sin race",
      }),
    ).toBeInTheDocument();
  });

  it("switching family clears the previous family's search term", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPage("/dev/graph1?d=player-champions:Faker");
    fireEvent.click(await screen.findByRole("button", { name: /^Player:/ }));
    fireEvent.change(await screen.findByLabelText("Search Player"), {
      target: { value: "chov" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Champion → players" }));

    fireEvent.click(await screen.findByRole("button", { name: /^Champion:/ }));
    expect(await screen.findByLabelText("Search Champion")).toHaveValue("");
  });
});

// ---------------------------------------------------------------------------
// failure + empty states

describe("failure and empty states", () => {
  it("surfaces an error for an unknown dynamic key rather than another race", async () => {
    vi.stubGlobal("fetch", mockFetch({ datasetStatus: 404 }));
    renderPage("/dev/graph1?d=player-champions:NoSuchPlayer");

    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert).toHaveTextContent(/could not be loaded/i);
    // the diagnostic detail is retained
    expect(alert).toHaveTextContent(/404/);
    // and it must NOT have quietly rendered the fallback race
    expect(
      screen.queryByRole("heading", { name: "faker-champions race" }),
    ).not.toBeInTheDocument();
  });

  it("does not tell a reader to start a local API", async () => {
    vi.stubGlobal("fetch", mockFetch({ datasetStatus: 503 }));
    renderPage("/dev/graph1?d=champion-players:azir");
    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert).not.toHaveTextContent(/localhost/i);
    expect(alert).not.toHaveTextContent(/start the local API/i);
  });

  it("renders a zero-event race as an empty state, not an error", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ emptyKeys: ["champion-players:azir"] }),
    );
    renderPage("/dev/graph1?d=champion-players:azir");
    // the payload is accepted (no alert) and the race surface takes over
    expect(
      await screen.findByRole("heading", {
        name: "champion-players:azir race",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// backward compatibility

describe("legacy races are untouched", () => {
  it("still renders the two fixed races from the catalog", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPage("/dev/graph1?d=faker-champions");
    expect(
      await screen.findByRole("heading", { name: "faker-champions race" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Faker — champions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Azir — players" }),
    ).toBeInTheDocument();
  });

  it("shows no entity picker for a fixed race", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderPage("/dev/graph1?d=faker-champions");
    await screen.findByRole("heading", { name: "faker-champions race" });
    expect(
      screen.queryByRole("button", { name: /^Player:/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Champion:/ }),
    ).not.toBeInTheDocument();
  });

  it("tolerates a backend with no families block", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/graph1/datasets")) {
        return {
          ok: true, status: 200,
          json: async () => ({ schemaVersion: 2, datasets: CATALOG.datasets }),
        } as Response;
      }
      const key = decodeURIComponent(url.split("/datasets/").pop()!);
      return { ok: true, status: 200, json: async () => payload(key) } as Response;
    }));
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "faker-champions race" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Player → champions" }),
    ).not.toBeInTheDocument();
  });
});
