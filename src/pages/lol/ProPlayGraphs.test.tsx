/**
 * The Explore Pro Data page end to end: the builder resolves the right family,
 * metrics route to the right renderer, scope reaches the SERVER, deep links
 * round-trip, and every refusal reads as itself rather than a wrong number.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Graph1ControlSchema } from "@/graph1/contract";
import { makeDataset, type EventSpec } from "@/graph1/testFixtures";
import ProPlayGraphs, { parseSelection, selectionHref } from "./ProPlayGraphs";

const SPEC: EventSpec[] = [
  ["champion:azir", "2020-01-01T10:00:00Z", 1,
   { gameId: "G0", team: "T1", region: "Korea", league: "LCK" }],
  ["champion:ryze", "2021-01-02T10:00:00Z", 0,
   { gameId: "G1", team: "GEN", region: "Korea", league: "LCK" }],
];

const CONTROLS: Graph1ControlSchema = {
  metrics: [
    { id: "cumulative_games", label: "Professional games", unit: "games",
      accumulation: "sum", default: true },
    { id: "cumulative_wins", label: "Professional wins", unit: "games",
      accumulation: "sum" },
  ],
  filters: [],
  topN: { default: 10, options: [5, 10, 15, 20] },
  speed: { default: 1, options: [0.5, 1, 2] },
};

const SCOPE_VALUES = {
  limit: 1000,
  leagues: {
    total: 2,
    values: [
      { value: "LoL Champions Korea", label: "LCK", games: 5234, major: true },
      { value: "World Championship", label: "Worlds", games: 2801, major: true },
    ],
  },
  tournaments: {
    total: 1,
    values: [
      { value: "Worlds 2024 Main Event", label: "Worlds 2024 Main Event",
        league: "World Championship", games: 100, major: true },
    ],
  },
  regions: { total: 1, values: [{ value: "Korea", label: "Korea", games: 6627 }] },
  patches: {
    total: 2,
    values: [
      { value: "16.14", label: "16.14", games: 200 },
      { value: "16.15", label: "16.15", games: 180 },
    ],
  },
};

function racePayload(key: string) {
  const ds = makeDataset(SPEC);
  ds.id = `${key}@all-pro`;
  ds.definition.controls = CONTROLS;
  return ds;
}

function emptyRacePayload(key: string) {
  const ds = racePayload(key);
  ds.events = [];
  return ds;
}

function boardPayload(key: string) {
  return {
    schemaVersion: 1,
    id: `${key}@all-pro`,
    visualizationType: "ranked-snapshot",
    definition: {
      title: "board",
      focusEntity: { type: "champion", id: "champion:azir" },
      rankedEntityType: "team",
      metric: {
        id: "win_rate", label: "Win rate", unit: "percent",
        accumulation: "none", valueDisplay: { scale: 100, decimals: 1 },
      },
      minimumSample: 20,
      snapshots: { points: [{ id: "win_rate", label: "Win rate" }], defaultId: "win_rate" },
      scope: { id: "all-pro", label: "All professional play" },
    },
    entities: {
      "team:T1": { id: "team:T1", type: "team", displayName: "T1",
        identityStatus: "canonical", media: { kind: "initials", value: "T1" } },
    },
    rows: [{ rankedEntityId: "team:T1", values: { win_rate: 6200 }, sample: 40 }],
    coverage: { source: "test", eligibleEventCount: 40, distinctRankedEntityCount: 1 },
  };
}

/** Every request the page made, so a test can assert what reached the server. */
let requests: string[] = [];
let locationSearch = "";

/** Mirrors the URL and exposes the router's own Back, since MemoryRouter does
 * not use `window.history`. */
function LocationProbe() {
  locationSearch = useLocation().search;
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Back one entry
    </button>
  );
}

interface FetchOptions {
  datasetStatus?: number;
  datasetDetail?: string;
  empty?: boolean;
}

function mockFetch(options: FetchOptions = {}) {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    requests.push(url);
    const path = url.split("?")[0];

    if (path.endsWith("/api/graph1/scope-values")) {
      return { ok: true, status: 200, json: async () => SCOPE_VALUES } as Response;
    }
    if (path.endsWith("/api/graph1/entities/players")) {
      return {
        ok: true, status: 200,
        json: async () => ({
          family: "player-champions", query: "", limit: 25, listedTotal: 1210,
          minGames: 20,
          entities: [
            { id: "Faker", label: "Faker", games: 1611, featured: true },
            { id: "Levi", label: "Levi", games: 900 },
          ],
        }),
      } as Response;
    }
    if (path.endsWith("/api/graph1/entities/teams")) {
      return {
        ok: true, status: 200,
        json: async () => ({
          family: "team-champions", query: "", limit: 25, listedTotal: 473,
          minGames: 50,
          entities: [
            { id: "T1", label: "T1", games: 4863, short: "T1", region: "Korea", featured: true },
            { id: "SK Telecom T1", label: "SK Telecom T1", games: 3248,
              short: "SKT", region: "Korea", featured: true },
            { id: "Anubis Gaming", label: "Anubis Gaming", games: 1013,
              short: "ANB", region: "EMEA" },
          ],
        }),
      } as Response;
    }
    if (path.endsWith("/api/graph1/entities/champions")) {
      return {
        ok: true, status: 200,
        json: async () => ({
          family: "champion-players", total: 2,
          entities: [
            { id: "azir", label: "Azir", games: 6595 },
            { id: "kaisa", label: "Kai'Sa", games: 5706 },
          ],
        }),
      } as Response;
    }

    // A dataset request.
    if (options.datasetStatus && options.datasetStatus !== 200) {
      return {
        ok: false,
        status: options.datasetStatus,
        json: async () => ({ detail: options.datasetDetail ?? "refused" }),
      } as unknown as Response;
    }
    const key = decodeURIComponent(path.split("/datasets/")[1]);
    const isBoard = url.includes("metric=");
    return {
      ok: true, status: 200,
      json: async () =>
        isBoard
          ? boardPayload(key)
          : options.empty
            ? emptyRacePayload(key)
            : racePayload(key),
    } as Response;
  });
}

function renderPage(entry = "/lol/pro-play/graphs", options: FetchOptions = {}) {
  vi.stubGlobal("fetch", mockFetch(options));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/lol/pro-play/graphs"
            element={<><ProPlayGraphs /><LocationProbe /></>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The dataset requests only, in order. */
const datasetRequests = () => requests.filter((u) => u.includes("/datasets/"));

beforeEach(() => {
  requests = [];
  locationSearch = "";
});
afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------
// the four combinations

describe("the graph builder resolves the right family", () => {
  const cases: [string, string, string][] = [
    ["player -> champions", "?focus=player&vs=champions&e=Faker",
     "player-champions:Faker"],
    ["champion -> players", "?focus=champion&vs=players&e=azir",
     "champion-players:azir"],
    ["team -> champions", "?focus=team&vs=champions&e=T1",
     "team-champions:T1"],
    ["champion -> teams (picks)", "?focus=champion&vs=teams&e=kaisa",
     "champion-teams:kaisa"],
    ["champion -> teams (bans)", "?focus=champion&vs=teams&e=nautilus&mode=bans&metric=bans",
     "champion-teams:nautilus:bans"],
  ];

  for (const [name, query, key] of cases) {
    it(name, async () => {
      renderPage(`/lol/pro-play/graphs${query}`);
      await waitFor(() =>
        expect(datasetRequests().some((u) => u.includes(`/datasets/${key}`))).toBe(true),
      );
    });
  }
});

// ---------------------------------------------------------------------------
// metrics -> renderer

describe("metric chooses the renderer", () => {
  it("draws a monotonic total as a RACE", async () => {
    renderPage("/lol/pro-play/graphs?focus=player&vs=champions&e=Faker");
    // The race player's transport controls only exist on the race path.
    expect(await screen.findByRole("button", { name: "Play" })).toBeTruthy();
    expect(datasetRequests()[0]).not.toContain("metric=");
  });

  it("draws a ratio as a ranked BOARD and sends the backend's metric id", async () => {
    renderPage("/lol/pro-play/graphs?focus=champion&vs=teams&e=kaisa&metric=winrate");
    await waitFor(() => expect(datasetRequests().length).toBeGreaterThan(0));
    expect(datasetRequests()[0]).toContain("metric=win_rate");
    // Never animated: a ratio goes down as often as up.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Play" })).toBeNull(),
    );
  });

  it("offers only the metrics a ban graph can define", async () => {
    renderPage("/lol/pro-play/graphs?focus=champion&vs=teams&e=nautilus&mode=bans&metric=bans");
    const metrics = await screen.findByRole("group", { name: "Metric" });
    expect(within(metrics).getByRole("button", { name: "Bans" })).toBeTruthy();
    expect(within(metrics).getByRole("button", { name: "Ban rate" })).toBeTruthy();
    // A win with a banned champion is undefined, and the backend 409s on it.
    expect(within(metrics).queryByRole("button", { name: "Wins" })).toBeNull();
    expect(within(metrics).queryByRole("button", { name: "Win rate" })).toBeNull();
  });

  it("never offers ban rate on a pick graph", async () => {
    renderPage("/lol/pro-play/graphs?focus=champion&vs=teams&e=kaisa");
    const metrics = await screen.findByRole("group", { name: "Metric" });
    expect(within(metrics).queryByRole("button", { name: "Ban rate" })).toBeNull();
  });

  it("switches to the wins race without issuing a request", async () => {
    renderPage("/lol/pro-play/graphs?focus=player&vs=champions&e=Faker");
    await screen.findByRole("button", { name: "Play" });
    const before = datasetRequests().length;
    fireEvent.click(screen.getByRole("button", { name: "Wins" }));
    await waitFor(() => expect(locationSearch).toContain("metric=wins"));
    // The backend ships both count metrics on ONE payload, so the switch is a
    // filter, not a fetch.
    expect(datasetRequests()).toHaveLength(before);
  });
});

// ---------------------------------------------------------------------------
// scope reaches the server

describe("scope is a server-side query, not a browser-side filter", () => {
  it("sends nothing at all for the broad professional default", async () => {
    renderPage("/lol/pro-play/graphs?focus=player&vs=champions&e=Faker");
    await waitFor(() => expect(datasetRequests().length).toBeGreaterThan(0));
    const url = datasetRequests()[0];
    expect(url).toContain("/datasets/player-champions:Faker");
    // Byte-identical to the pre-Phase-E request, so every old deep link still
    // resolves to exactly the payload it always did.
    expect(url).not.toContain("?");
  });

  const scopes: [string, string, string][] = [
    ["major preset", "&major=1", "major=true"],
    ["league", "&league=LoL+Champions+Korea", "league=LoL+Champions+Korea"],
    ["tournament", "&tournament=Worlds+2024+Main+Event", "tournament=Worlds+2024+Main+Event"],
    ["region", "&region=Korea", "region=Korea"],
    ["patch", "&patch=16.15", "patch=16.15"],
    ["date range", "&from=2024-01-01&to=2024-12-31", "date_from=2024-01-01"],
  ];

  for (const [name, query, expected] of scopes) {
    it(`sends ${name} to the backend`, async () => {
      renderPage(`/lol/pro-play/graphs?focus=player&vs=champions&e=Faker${query}`);
      await waitFor(() => expect(datasetRequests().length).toBeGreaterThan(0));
      expect(datasetRequests()[0]).toContain(expected);
    });
  }

  it("composes scopes rather than replacing them", async () => {
    renderPage(
      "/lol/pro-play/graphs?focus=player&vs=champions&e=Faker&league=LoL+Champions+Korea&patch=16.15&major=1",
    );
    await waitFor(() => expect(datasetRequests().length).toBeGreaterThan(0));
    const url = datasetRequests()[0];
    expect(url).toContain("league=LoL+Champions+Korea");
    expect(url).toContain("patch=16.15");
    expect(url).toContain("major=true");
  });

  it("offers no raw or unfiltered scope anywhere on the page", async () => {
    renderPage("/lol/pro-play/graphs?focus=player&vs=champions&e=Faker");
    const group = await screen.findByRole("group", { name: "Professional play" });
    expect(within(group).getByRole("button", { name: "All Pro Play" })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Major Pro" })).toBeTruthy();
    expect(within(group).queryByRole("button", { name: /raw|unfiltered|all data/i }))
      .toBeNull();
  });

  it("fetches scope options from discovery instead of hardcoding them", async () => {
    renderPage("/lol/pro-play/graphs?focus=player&vs=champions&e=Faker");
    await waitFor(() =>
      expect(requests.some((u) => u.includes("/api/graph1/scope-values"))).toBe(true),
    );
    // Friendly label on screen, exact canonical value in the option.
    const league = await screen.findByLabelText("League");
    expect(within(league as HTMLElement).getByText(/LCK/)).toBeTruthy();
    expect(
      (within(league as HTMLElement).getByText(/LCK/) as HTMLOptionElement).value,
    ).toBe("LoL Champions Korea");
  });
});

// ---------------------------------------------------------------------------
// URL contract

describe("URL / deep-link contract", () => {
  it("round-trips a full selection through parse", () => {
    const href = selectionHref({
      id: "x", focus: "champion", compare: "teams", entityId: "kaisa",
      entityLabel: "Kai'Sa", mode: "bans", metric: "banrate",
      scope: { major: false, league: "LoL Champions Korea", patch: "16.15" },
      title: "t", hook: "h",
    });
    const parsed = parseSelection(new URLSearchParams(href.split("?")[1]));
    expect(parsed.combination.familyId).toBe("champion-teams");
    expect(parsed.entityId).toBe("kaisa");
    expect(parsed.mode).toBe("bans");
    expect(parsed.metric).toBe("banrate");
  });

  it("accepts an OLD operator-page dataset key as a deep link", async () => {
    // A `?d=` link shared before this page existed must still open a graph.
    renderPage("/lol/pro-play/graphs?d=champion-teams:kaisa:bans");
    await waitFor(() =>
      expect(
        datasetRequests().some((u) => u.includes("/datasets/champion-teams:kaisa:bans")),
      ).toBe(true),
    );
  });

  it("encodes no internal policy name", async () => {
    renderPage("/lol/pro-play/graphs?focus=player&vs=champions&e=Faker&major=1");
    await waitFor(() => expect(datasetRequests().length).toBeGreaterThan(0));
    expect(locationSearch + datasetRequests()[0]).not.toMatch(
      /MAJOR_PRO|PRO_TEAM|pro_broad|apply_policy/,
    );
  });

  it("degrades a hand-edited URL to a valid graph rather than an error", () => {
    const parsed = parseSelection(
      new URLSearchParams("focus=wizard&vs=dragons&metric=nonsense"),
    );
    expect(parsed.focus).toBe("player");
    expect(parsed.combination.familyId).toBe("player-champions");
    expect(parsed.metric).toBe("games");
  });

  it("pushes a new graph and replaces a control nudge, so Back is useful", async () => {
    renderPage("/lol/pro-play/graphs?focus=player&vs=champions&e=Faker");
    await screen.findByRole("button", { name: "Play" });

    // Changing WHAT is graphed is real navigation.
    fireEvent.click(screen.getByRole("button", { name: "Champion" }));
    await waitFor(() => expect(locationSearch).toContain("focus=champion"));
    fireEvent.click(screen.getByRole("button", { name: "Back one entry" }));
    await waitFor(() => expect(locationSearch).toContain("focus=player"));

    // Nudging a control does NOT add an entry, so Back does not walk every
    // tweak: from champion + Major Pro, one Back lands on the PLAYER graph.
    fireEvent.click(screen.getByRole("button", { name: "Champion" }));
    await waitFor(() => expect(locationSearch).toContain("focus=champion"));
    fireEvent.click(screen.getByRole("button", { name: "Major Pro" }));
    await waitFor(() => expect(locationSearch).toContain("major=1"));
    fireEvent.click(screen.getByRole("button", { name: "Back one entry" }));
    await waitFor(() => expect(locationSearch).toContain("focus=player"));
    expect(locationSearch).not.toContain("major=1");
  });
});

// ---------------------------------------------------------------------------
// entities

describe("entity discovery", () => {
  /** Open the focus picker and return its listbox. */
  async function openPicker(label: string) {
    const trigger = await screen.findByRole("button", {
      name: new RegExp(`^${label}:`),
    });
    fireEvent.click(trigger);
    return screen.findByRole("listbox", { name: label });
  }

  it("keeps two canonical team identities separate", async () => {
    renderPage("/lol/pro-play/graphs?focus=team&vs=champions&e=T1");
    const list = await openPicker("Team");
    // Lineage is deliberately not merged: T1 (2020-) and SK Telecom T1
    // (2014-2019) have zero games in common and are two options, not one.
    const options = within(list).getAllByRole("option").map((o) => o.textContent ?? "");
    expect(options.some((t) => t.includes("SK Telecom T1"))).toBe(true);
    // Two separate rows, not one merged organisation.
    expect(options.filter((t) => t.includes("T1"))).toHaveLength(2);
  });

  it("keeps broader-pro entities searchable, not hidden", async () => {
    renderPage("/lol/pro-play/graphs?focus=team&vs=champions&e=T1");
    const list = await openPicker("Team");
    // Anubis Gaming carries no `featured` flag; it must still be listed.
    expect(
      within(list).getAllByRole("option").some((o) =>
        o.textContent?.includes("Anubis Gaming"),
      ),
    ).toBe(true);
  });

  it("does not fetch entity lists for the kinds it is not showing", async () => {
    renderPage("/lol/pro-play/graphs?focus=team&vs=champions&e=T1");
    await waitFor(() => expect(requests.some((u) => u.includes("entities/teams"))).toBe(true));
    expect(requests.some((u) => u.includes("entities/players"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// featured content

describe("featured content", () => {
  it("renders cards that link to complete, valid selections", async () => {
    renderPage("/lol/pro-play/graphs?focus=player&vs=champions&e=Faker");
    const section = await screen.findByRole("region", { name: "Featured graphs" });
    const links = within(section).getAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(8);
    for (const link of links) {
      const href = link.getAttribute("href")!;
      expect(href.startsWith("/lol/pro-play/graphs?")).toBe(true);
      const parsed = parseSelection(new URLSearchParams(href.split("?")[1]));
      expect(parsed.entityId).toBeTruthy();
    }
  });

  it("keeps a broader-pro card reachable on the featured surface", async () => {
    renderPage("/lol/pro-play/graphs?focus=player&vs=champions&e=Faker");
    const section = await screen.findByRole("region", { name: "Featured graphs" });
    expect(within(section).getAllByText(/Anubis Gaming|GAM Esports/).length)
      .toBeGreaterThan(0);
  });

  it("shows no family id to the reader", async () => {
    renderPage("/lol/pro-play/graphs?focus=player&vs=champions&e=Faker");
    await screen.findByRole("region", { name: "Featured graphs" });
    expect(document.body.textContent).not.toMatch(
      /player-champions|champion-players|team-champions|champion-teams|MAJOR_PRO|pro_broad/,
    );
  });
});

// ---------------------------------------------------------------------------
// states

describe("loading, empty and refusal states", () => {
  it("shows a loading state while the graph is in flight", async () => {
    renderPage("/lol/pro-play/graphs?focus=player&vs=champions&e=Faker");
    expect(screen.getByText(/Loading graph/i)).toBeTruthy();
  });

  it("treats a factual zero-result scope as an answer, not an error", async () => {
    renderPage(
      "/lol/pro-play/graphs?focus=champion&vs=teams&e=kaisa&tournament=Worlds+2024+Main+Event",
      { empty: true },
    );
    const empty = await screen.findByTestId("graph1-empty");
    expect(empty.textContent).toContain("No qualifying pro games for this combination.");
    expect(screen.queryByRole("alert")).toBeNull();
    // And offers a way out of the scope that produced it.
    expect(within(empty).getByRole("button", { name: /all pro play/i })).toBeTruthy();
  });

  it("explains a 409 ban-coverage refusal instead of showing a number", async () => {
    renderPage(
      "/lol/pro-play/graphs?focus=champion&vs=teams&e=kaisa&mode=bans&metric=banrate",
      { datasetStatus: 409, datasetDetail: "ban coverage is incomplete for this scope" },
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/ban coverage/i);
    expect(alert.textContent).toMatch(/unavailable/i);
    // No board, and above all no plausible-looking substitute figure.
    expect(screen.queryByTestId("graph1-empty")).toBeNull();
  });

  it("explains a 404 as an entity that is not in professional play", async () => {
    renderPage("/lol/pro-play/graphs?focus=player&vs=champions&e=Nobody",
      { datasetStatus: 404 });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/could not find/i);
  });

  it("explains a 400 as a combination it cannot graph", async () => {
    renderPage("/lol/pro-play/graphs?focus=player&vs=champions&e=Faker",
      { datasetStatus: 400 });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/not something we can graph/i);
  });

  it("keeps the page usable when only the scope list fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      requests.push(url);
      if (url.includes("scope-values")) return { ok: false, status: 503 } as Response;
      if (url.includes("entities/")) {
        return { ok: true, status: 200,
          json: async () => ({ entities: [], limit: 25, total: 0 }) } as Response;
      }
      return { ok: true, status: 200,
        json: async () => racePayload("player-champions:Faker") } as Response;
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/lol/pro-play/graphs?focus=player&vs=champions&e=Faker"]}>
          <Routes>
            <Route path="/lol/pro-play/graphs" element={<ProPlayGraphs />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // A secondary list failing must not block the graph.
    expect(await screen.findByRole("button", { name: "Play" })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// accessibility / controls

describe("controls are labelled and reachable", () => {
  it("labels every control group and select", async () => {
    renderPage("/lol/pro-play/graphs?focus=player&vs=champions&e=Faker");
    expect(await screen.findByRole("group", { name: "Metric" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Professional play" })).toBeTruthy();
    expect(screen.getByLabelText("Compare")).toBeTruthy();
    expect(screen.getByLabelText("League")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Scope" })).toBeTruthy();
  });

  it("marks the active metric and scope so the selection is visible", async () => {
    renderPage("/lol/pro-play/graphs?focus=player&vs=champions&e=Faker&major=1");
    const metrics = await screen.findByRole("group", { name: "Metric" });
    expect(
      within(metrics).getByRole("button", { name: "Games" }).getAttribute("aria-pressed"),
    ).toBe("true");
    const play = screen.getByRole("group", { name: "Professional play" });
    expect(
      within(play).getByRole("button", { name: "Major Pro" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("gives the graph an accessible title and scope line", async () => {
    renderPage("/lol/pro-play/graphs?focus=team&vs=champions&e=T1&league=LoL+Champions+Korea");
    const heading = await screen.findByRole("heading", { name: /Champion Pool/i });
    // The scope line sits with the title, and prints the FRIENDLY label for
    // the canonical value the URL carries.
    const header = heading.closest("header")!;
    await waitFor(() => expect(within(header).getByText("LCK")).toBeTruthy());
  });
});
