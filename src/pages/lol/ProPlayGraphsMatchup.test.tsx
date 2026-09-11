/**
 * `focus=matchup` — the champion-pair mode of Explore Pro Data.
 *
 * The assertions that matter are about ORIENTATION and POPULATION: the record
 * on screen is the subject's, reversing the pair inverts it, and a pair with
 * no professional meetings says so rather than quietly showing one champion's
 * data. The last test in this file is the regression guard: the existing
 * single-champion mode is untouched by any of it.
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

import ProPlayGraphs from "./ProPlayGraphs";

const SCOPE_VALUES = {
  limit: 1000,
  leagues: { total: 0, values: [] },
  tournaments: { total: 0, values: [] },
  regions: { total: 0, values: [] },
  patches: { total: 0, values: [] },
};

const CHAMPIONS = {
  family: "champion-players",
  total: 3,
  entities: [
    { id: "olaf", label: "Olaf", games: 8538 },
    { id: "ksante", label: "K'Sante", games: 4100 },
    { id: "dr-mundo", label: "Dr Mundo", games: 2920 },
  ],
};

function matchupPayload(subject: string, opponent: string) {
  const names: Record<string, string> = {
    olaf: "Olaf",
    ksante: "K'Sante",
    "dr-mundo": "Dr Mundo",
  };
  // Olaf 38-24; reversed, K'Sante is 24-38 over the SAME 62 games.
  const subjectIsOlaf = subject === "olaf";
  const wins = subjectIsOlaf ? 38 : 24;
  const losses = subjectIsOlaf ? 24 : 38;
  return {
    schemaVersion: 1,
    id: `champion-matchup:${subject}:${opponent}@all-pro`,
    pairId: [subject, opponent].sort().join("|"),
    subject: { id: subject, name: names[subject] ?? subject },
    opponent: { id: opponent, name: names[opponent] ?? opponent },
    scope: { id: "all-pro", label: "All professional play" },
    games: 62,
    record: { wins, losses, winRate: wins / 62 },
    byYear: [
      { year: "2023", games: 32, wins: 21 },
      { year: "2024", games: 30, wins: wins - 21 },
    ],
    subjectPositions: { Top: { games: 56, wins: 33 }, Jungle: { games: 6, wins: 5 } },
    opponentPositions: { Top: { games: 62, wins: 29 } },
    subjectSides: { red: { games: 43, wins: 27 }, blue: { games: 19, wins: 11 } },
    firstGame: {
      gameId: "g0", date: "2023-01-14T09:00:00Z", subjectWon: true,
      subjectTeam: "T1", opponentTeam: "Gen.G", league: "LCK",
    },
    latestGame: {
      gameId: "g9", date: "2026-05-16T22:00:00Z", subjectWon: true,
      subjectTeam: "Shopify Rebellion", opponentTeam: "Disguised",
      tournament: "LCS 2026 Spring",
    },
    coverage: {
      source: "pro_canonical_player_games + pro_canonical_games",
      definition:
        "professional games in which both champions appeared on opposing teams",
      excludedGameCount: 198,
      warnings: [],
    },
  };
}

let requests: string[] = [];
let locationSearch = "";

function LocationProbe() {
  locationSearch = useLocation().search;
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Back one entry
    </button>
  );
}

interface Options {
  zero?: boolean;
  matchupStatus?: number;
}

function mockFetch(options: Options = {}) {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    requests.push(url);
    const path = url.split("?")[0];
    if (path.endsWith("/api/graph1/scope-values")) {
      return { ok: true, status: 200, json: async () => SCOPE_VALUES } as Response;
    }
    if (path.endsWith("/api/graph1/entities/champions")) {
      return { ok: true, status: 200, json: async () => CHAMPIONS } as Response;
    }
    if (path.endsWith("/api/graph1/champion-matchup")) {
      if (options.matchupStatus && options.matchupStatus !== 200) {
        return {
          ok: false,
          status: options.matchupStatus,
          json: async () => ({ detail: "refused" }),
        } as unknown as Response;
      }
      const query = new URLSearchParams(url.split("?")[1]);
      const payload = matchupPayload(query.get("a")!, query.get("b")!);
      if (options.zero) {
        Object.assign(payload, {
          games: 0,
          record: { wins: 0, losses: 0, winRate: null },
          byYear: [],
          subjectPositions: {},
          opponentPositions: {},
          subjectSides: {},
          firstGame: null,
          latestGame: null,
        });
      }
      return { ok: true, status: 200, json: async () => payload } as Response;
    }
    // Any single-champion race request, for the regression guard.
    return {
      ok: true,
      status: 200,
      json: async () => ({
        schemaVersion: 1,
        id: "champion-players:olaf@all-pro",
        visualizationType: "ranked-race",
        definition: {
          title: "Olaf",
          focusEntity: { type: "champion", id: "champion:Olaf" },
          rankedEntityType: "player",
          metric: {
            id: "cumulative_games",
            label: "Games",
            unit: "games",
            accumulation: "sum",
          },
          scope: { id: "all-pro", label: "All professional play" },
        },
        entities: {
          "champion:Olaf": {
            id: "champion:Olaf",
            type: "champion",
            displayName: "Olaf",
            identityStatus: "canonical",
            media: { kind: "initials", value: "OL" },
          },
        },
        events: [],
        coverage: { source: "test", eligibleEventCount: 0, distinctRankedEntityCount: 0 },
      }),
    } as Response;
  });
}

function renderPage(entry: string, options: Options = {}) {
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
            element={
              <>
                <ProPlayGraphs />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const matchupRequests = () => requests.filter((u) => u.includes("/champion-matchup"));

beforeEach(() => {
  requests = [];
  locationSearch = "";
});
afterEach(() => vi.unstubAllGlobals());

const OLAF_VS_KSANTE = "/lol/pro-play/graphs?focus=matchup&a=olaf&b=ksante";

describe("the pair deep link", () => {
  it("asks the backend for both champions", async () => {
    renderPage(OLAF_VS_KSANTE);
    await waitFor(() => expect(matchupRequests().length).toBe(1));
    const url = matchupRequests()[0];
    expect(url).toContain("a=olaf");
    expect(url).toContain("b=ksante");
  });

  it("names both champions in the heading", async () => {
    renderPage(OLAF_VS_KSANTE);
    await waitFor(() =>
      expect(screen.getByTestId("matchup-heading")).toHaveTextContent(
        "Olaf vs K'Sante",
      ),
    );
  });

  it("shows the game count and the SUBJECT's record", async () => {
    renderPage(OLAF_VS_KSANTE);
    await screen.findByTestId("champion-matchup");
    expect(screen.getByText("62")).toBeInTheDocument();
    expect(screen.getByText("38–24")).toBeInTheDocument();
    expect(screen.getByText("61.3%")).toBeInTheDocument();
    expect(screen.getByText(/Olaf win rate/i)).toBeInTheDocument();
  });

  it("says on screen that this is the broader sample", async () => {
    renderPage(OLAF_VS_KSANTE);
    await screen.findByTestId("champion-matchup");
    expect(screen.getByText(/broader professional sample/i)).toBeInTheDocument();
  });

  it("reports positions as context and refuses to call them a lane", async () => {
    renderPage(OLAF_VS_KSANTE);
    await screen.findByTestId("matchup-subject-positions");
    expect(screen.getByTestId("matchup-subject-positions")).toHaveTextContent("Top");
    // The flex case survives: Olaf's six Jungle games are in the sample.
    expect(screen.getByTestId("matchup-subject-positions")).toHaveTextContent(
      "Jungle",
    );
    expect(
      screen.getByText(/Not a claim that the two laned against each other/i),
    ).toBeInTheDocument();
  });

  it("survives a refresh — the URL is the state", async () => {
    const { unmount } = renderPage(OLAF_VS_KSANTE);
    await screen.findByTestId("champion-matchup");
    unmount();
    requests = [];
    renderPage(OLAF_VS_KSANTE);
    await waitFor(() =>
      expect(screen.getByTestId("matchup-heading")).toHaveTextContent(
        "Olaf vs K'Sante",
      ),
    );
  });
});

describe("reversal", () => {
  it("swaps the subject and inverts the record", async () => {
    renderPage(OLAF_VS_KSANTE);
    await screen.findByTestId("champion-matchup");
    fireEvent.click(screen.getByTestId("matchup-swap"));
    await waitFor(() =>
      expect(screen.getByTestId("matchup-heading")).toHaveTextContent(
        "K'Sante vs Olaf",
      ),
    );
    expect(locationSearch).toContain("a=ksante");
    expect(locationSearch).toContain("b=olaf");
    await waitFor(() =>
      expect(screen.getByText("24–38")).toBeInTheDocument(),
    );
  });

  it("pushes, so Back returns to the orientation the reader had", async () => {
    renderPage(OLAF_VS_KSANTE);
    await screen.findByTestId("champion-matchup");
    fireEvent.click(screen.getByTestId("matchup-swap"));
    await waitFor(() => expect(locationSearch).toContain("a=ksante"));
    fireEvent.click(screen.getByText("Back one entry"));
    await waitFor(() => expect(locationSearch).toContain("a=olaf"));
  });
});

describe("the answers that are not a graph", () => {
  it("shows a zero state and never falls back to one champion", async () => {
    renderPage(OLAF_VS_KSANTE, { zero: true });
    const zero = await screen.findByTestId("matchup-zero");
    expect(zero).toHaveTextContent(/No professional games found/i);
    // No single-champion request was made to fill the gap.
    expect(requests.filter((u) => u.includes("/datasets/"))).toHaveLength(0);
  });

  it("asks for two champions when one is missing, and requests nothing", async () => {
    renderPage("/lol/pro-play/graphs?focus=matchup&a=olaf");
    await screen.findByText(/Pick two champions above/i);
    expect(matchupRequests()).toHaveLength(0);
  });

  it("refuses a champion against itself without calling the backend", async () => {
    renderPage("/lol/pro-play/graphs?focus=matchup&a=olaf&b=olaf");
    await screen.findByText(/cannot be its own opponent/i);
    expect(matchupRequests()).toHaveLength(0);
  });

  it("treats a malformed slug as a missing one", async () => {
    renderPage("/lol/pro-play/graphs?focus=matchup&a=%3Cscript%3E&b=ksante");
    await screen.findByText(/Pick two champions above/i);
    expect(matchupRequests()).toHaveLength(0);
  });

  it("reads a 404 as an unknown champion, not as zero games", async () => {
    renderPage(OLAF_VS_KSANTE, { matchupStatus: 404 });
    await screen.findByText(/could not find one of those champions/i);
    expect(screen.queryByTestId("matchup-zero")).toBeNull();
  });
});

describe("regression", () => {
  it("leaves the single-champion mode exactly as it was", async () => {
    renderPage("/lol/pro-play/graphs?focus=champion&vs=players&e=olaf");
    await waitFor(() =>
      expect(
        requests.some((u) => u.includes("/datasets/champion-players:olaf")),
      ).toBe(true),
    );
    expect(matchupRequests()).toHaveLength(0);
    expect(screen.queryByTestId("matchup-heading")).toBeNull();
  });
});
