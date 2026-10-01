/**
 * Pro Play hub — match-centred (PPH1).
 *
 * Pins the three sections and their contracts: the Match Center's selection
 * (live first, then a FINISHED game, `?game=` never overridden), the
 * workspace's lanes and the existing destinations it joins to (and the gated
 * ones it must not), the match-independent discovery, and the Stats Explorer
 * keeping its place and URL contract on this page.
 *
 * Live fixtures follow the real `/api/live-esports/*` shapes the match centre
 * tests use (captured 2026-09-04).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProPlayHub, {
  PRO_PLAY_GRAPHS_ROUTE,
  PRO_PLAY_LIVE_ROUTE,
  PRO_PLAY_MATCHUP_ROUTE,
  PRO_PLAY_QUIZ_ROUTE,
  PRO_PLAY_ROUTE,
  PRO_PLAY_SEARCH_ROUTE,
} from "./ProPlayHub";
import { PRO_PLAY_LIVE_ARCHIVE_ROUTE } from "@/lib/pro-play/routes";

const { sfx } = vi.hoisted(() => ({ sfx: { play: vi.fn() } }));

vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => sfx }));
vi.mock("@/components/pro-play/ProStatsExplorer", () => ({
  default: () => <div data-testid="pro-stats-explorer" />,
}));

/* ── fixtures ───────────────────────────────────────────────────────────── */

const FINAL = {
  label: "final" as const,
  seconds_since_success: 12558,
  source_frame_ts: "2026-09-04T17:45:50.080Z",
  last_attempt_at: "2026-09-04T17:57:00.743Z",
  last_success_at: "2026-09-04T17:57:00.743Z",
};
const LIVE = { ...FINAL, label: "live_fresh" as const, seconds_since_success: 8 };
const STALE = { ...FINAL, label: "stale" as const, seconds_since_success: 9000 };

function summary(id: string, blue: string, red: string, over: Record<string, unknown> = {}) {
  return {
    game_id: id,
    match_id: `m-${id}`,
    league: { slug: "lck", name: "LCK" },
    block_name: "Week 4",
    competition: null,
    best_of: 3,
    game_number: 1,
    teams: {
      blue: { name: blue, code: blue, esports_team_id: "b", resolved_page: blue, series_wins: 0 },
      red: { name: red, code: red, esports_team_id: "r", resolved_page: red, series_wins: 0 },
    },
    patch_version: "16.17.810.4348",
    game_state: "finished",
    availability: "finished",
    availability_detail: null,
    scheduled_start: "2026-09-04T16:30:00Z",
    first_frame_ts: "2026-09-04T17:45:50.080Z",
    freshness: FINAL,
    ...over,
  };
}

const liveGame = (id: string, blue: string, red: string) =>
  summary(id, blue, red, { availability: "live", game_state: "inProgress", freshness: LIVE });

function lanePlayer(
  id: number,
  side: "blue" | "red",
  role: string,
  name: string,
  champion: string,
  over: Record<string, unknown> = {},
) {
  return {
    participant_id: id,
    side,
    esports_player_id: String(id),
    summoner_name: `X ${name}`,
    champion_id: champion,
    role,
    resolved_player_page: name,
    resolved_player_name: name,
    resolution_method: "exact",
    resolved_champion_name: champion,
    level: 18,
    kills: 3,
    deaths: 1,
    assists: 5,
    total_gold: 12000,
    creep_score: 250,
    items: [],
    abilities: [],
    ...over,
  };
}

const DEFAULT_PLAYERS = [
  lanePlayer(1, "blue", "top", "Kiin", "Ambessa"),
  lanePlayer(6, "red", "top", "Doran", "Camille"),
  lanePlayer(3, "blue", "mid", "Chovy", "Azir"),
  lanePlayer(8, "red", "mid", "Faker", "Orianna", { resolution_method: "unresolved:no_match", resolved_player_page: null, resolved_player_name: null, summoner_name: "T1 Mystery" }),
];

function pairPayload(subject: string, opponent: string) {
  return {
    schemaVersion: 1,
    id: `champion-matchup:${subject}:${opponent}@all-pro`,
    pairId: [subject, opponent].sort().join("|"),
    subject: { id: subject, name: subject === "ambessa" ? "Ambessa" : subject },
    opponent: { id: opponent, name: opponent === "camille" ? "Camille" : opponent },
    scope: { id: "all-pro", label: "All professional play" },
    games: 12,
    record: { wins: 7, losses: 5, winRate: 7 / 12 },
    byYear: [{ year: "2026", games: 12, wins: 7 }],
    subjectPositions: { Top: { games: 12, wins: 7 } },
    opponentPositions: { Top: { games: 12, wins: 5 } },
    subjectSides: { blue: { games: 6, wins: 4 }, red: { games: 6, wins: 3 } },
    firstGame: null,
    latestGame: null,
    coverage: { source: "x", definition: "x", excludedGameCount: 0, warnings: [] },
  };
}

function statsRow(player: string) {
  return {
    schema_version: 1,
    view: "players",
    rows: [
      {
        player,
        games: 412,
        wins: 260,
        losses: 152,
        win_rate: 260 / 412,
        stat_backed_games: 400,
        kills: 3,
        deaths: 2,
        assists: 6,
        kda: 4.52,
        cs_per_min: 8.9,
        gold_per_min: 420,
        damage_per_min: 600,
      },
    ],
    page: 1,
    page_size: 1,
    total_rows: 1,
    total_pages: 1,
    sort: "games",
    dir: "desc",
    filters: { year: null, league: null, patch: null, role: null, player, team: null, champion: null, min_games: 0 },
    aggregates: {},
    coverage: { games: 412, stat_backed_games: 400, missing_stat_games: 12, stat_coverage_pct: 97 },
  };
}

type Backend = {
  live?: unknown[];
  recent?: unknown[];
  feedDown?: boolean;
  players?: unknown[];
  goldPoints?: number;
  detail?: (id: string) => unknown;
};

let requests: string[] = [];

function installBackend(opts: Backend) {
  requests = [];
  const all = [...(opts.live ?? []), ...(opts.recent ?? [])] as Array<{ game_id: string }>;
  const fetchMock = vi.fn(async (url: string) => {
    const path = String(url);
    requests.push(path);
    const ok = (body: unknown) =>
      ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    const notFound = () =>
      ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response;
    if (path.includes("/live-esports/live")) {
      if (opts.feedDown) throw new Error("network down");
      return ok({
        enabled: true,
        generated_at: "2026-09-04T21:26:00.000Z",
        live: opts.live ?? [],
        recent: opts.recent ?? [],
        limits: { live: 12, recent: 6 },
      });
    }
    const gameMatch = path.match(/\/live-esports\/games\/([^/?]+)/);
    if (gameMatch) {
      const id = decodeURIComponent(gameMatch[1]);
      if (path.includes("/players")) {
        return ok({
          enabled: true,
          generated_at: "x",
          game_id: id,
          availability: "finished",
          freshness: FINAL,
          identity_resolution: { resolved: 3, total: 4, rate: 0.75 },
          players: opts.players ?? DEFAULT_PLAYERS,
        });
      }
      if (path.includes("/gold")) {
        const n = opts.goldPoints ?? 1;
        return ok({
          series: Array.from({ length: n }, (_, i) => ({ ts: `t${i}`, t: i * 60, blue: 1000 * i, red: 0, diff: 1000 * i })),
          downsampled: false,
          retention: "full",
        });
      }
      if (path.includes("/insights")) return ok({ coverage: {}, gold: {}, objectives: [], players: {} });
      const fromFeed = all.find((g) => g.game_id === id);
      const game = fromFeed ?? opts.detail?.(id);
      if (!game) return notFound();
      return ok({
        enabled: true,
        generated_at: "x",
        game,
        team_state: {
          blue: { kills: 20, total_gold: 60000, towers: 9, inhibitors: 2, barons: 1, dragons: [], frame_ts: null },
          red: { kills: 8, total_gold: 50000, towers: 2, inhibitors: 0, barons: 0, dragons: [], frame_ts: null },
        },
        recent_events: [],
      });
    }
    if (path.includes("/api/graph1/champion-matchup")) {
      const u = new URL(path, "http://x");
      return ok(pairPayload(u.searchParams.get("a") ?? "", u.searchParams.get("b") ?? ""));
    }
    if (path.includes("/api/pro-play/stats/players")) {
      const u = new URL(path, "http://x");
      return ok(statsRow(u.searchParams.get("player") ?? ""));
    }
    if (path.includes("/media/resolve")) return ok({ results: [] });
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

let location = { pathname: "", search: "" };
function LocationProbe() {
  const l = useLocation();
  location = { pathname: l.pathname, search: l.search };
  return null;
}

function renderHub(entry = PRO_PLAY_ROUTE) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <ProPlayHub />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const matchCenter = () => document.getElementById("match-center") as HTMLElement;
const workspace = () => document.getElementById("match-workspace") as HTMLElement;
const findWorkspace = () =>
  waitFor(() => {
    const el = workspace();
    if (!el) throw new Error("workspace not rendered yet");
    return el;
  });
const summaryTitle = async () =>
  (await within(matchCenter()).findByTestId("match-summary")).querySelector("h3")?.textContent;

beforeEach(() => {
  sfx.play.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ── page identity ──────────────────────────────────────────────────────── */

describe("ProPlayHub identity", () => {
  it("identifies the area as Pro Play and keeps a way back to the academy", () => {
    installBackend({ recent: [summary("g1", "GEN", "T1")] });
    renderHub();
    expect(screen.getByRole("heading", { level: 1, name: "Pro Play" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to the Academy/i }).getAttribute("href")).toBe("/lol");
  });

  it("is not the subscription page", () => {
    installBackend({ recent: [summary("g1", "GEN", "T1")] });
    renderHub();
    expect(screen.queryByText(/subscribe|upgrade|per month/i)).toBeNull();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toBe("/lol/premium");
      expect(link.getAttribute("href")).not.toBe("/lol/pro");
    }
  });

  it("orders the page Match Center → Workspace → Discover → Pro Stats", async () => {
    installBackend({ recent: [summary("g1", "GEN", "T1")] });
    renderHub();
    await screen.findByTestId("match-summary");
    const ids = ["match-center", "match-workspace", "discover", "pro-stats"].map((id) =>
      document.getElementById(id),
    );
    ids.forEach((el) => expect(el).toBeTruthy());
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i - 1]!.compareDocumentPosition(ids[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("promises no Upcoming matches — there is no schedule source", async () => {
    installBackend({ recent: [summary("g1", "GEN", "T1")] });
    renderHub();
    await screen.findByTestId("match-summary");
    expect(screen.queryByText(/upcoming|coming soon/i)).toBeNull();
  });
});

/* ── Match Center ───────────────────────────────────────────────────────── */

describe("Match Center selection", () => {
  it("leads with the live game when one is live", async () => {
    installBackend({ live: [liveGame("L1", "HLE", "DK")], recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    expect(await summaryTitle()).toMatch(/HLE/);
    expect(within(matchCenter()).getByRole("heading", { level: 2, name: "Live now" })).toBeTruthy();
  });

  it("prefers the latest FINISHED game over a stale one when nothing is live", async () => {
    installBackend({
      recent: [summary("S1", "KT", "NS", { availability: "live", freshness: STALE }), summary("F1", "GEN", "T1")],
    });
    renderHub();
    expect(await summaryTitle()).toMatch(/GEN/);
    expect(within(matchCenter()).getByRole("heading", { level: 2, name: "Latest match" })).toBeTruthy();
  });

  it("never overrides an explicit ?game= — even while a game is live", async () => {
    installBackend({ live: [liveGame("L1", "HLE", "DK")], recent: [summary("R1", "GEN", "T1")] });
    renderHub(`${PRO_PLAY_ROUTE}?game=R1`);
    expect(await summaryTitle()).toMatch(/GEN/);
    expect(location.search).toBe("?game=R1");
  });

  it("opens a pinned archived game that is not in the feed", async () => {
    installBackend({
      recent: [summary("R1", "GEN", "T1")],
      detail: (id) => (id === "OLD" ? summary("OLD", "FNC", "G2") : undefined),
    });
    renderHub(`${PRO_PLAY_ROUTE}?game=OLD`);
    expect(await summaryTitle()).toMatch(/FNC/);
    // The rail always shows what is selected.
    expect(within(matchCenter()).getAllByRole("button", { pressed: true }).length).toBe(1);
  });

  it("says so when a pinned game does not exist, and offers the latest instead", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub(`${PRO_PLAY_ROUTE}?game=NOPE`);
    await within(matchCenter()).findByText(/Couldn't load that match/i);
    fireEvent.click(within(matchCenter()).getByRole("button", { name: /Show the latest match/i }));
    expect(await summaryTitle()).toMatch(/GEN/);
    expect(location.search).toBe("");
  });

  it("writes a rail pick to ?game= and keeps the Stats Explorer's parameters", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1"), summary("R2", "KT", "NS")] });
    renderHub(`${PRO_PLAY_ROUTE}?view=teams&year=2026`);
    await screen.findByTestId("match-summary");
    const rail = within(matchCenter()).getByRole("group", { name: /Choose a match/i });
    fireEvent.click(within(rail).getByText(/KT/));
    await waitFor(() => expect(new URLSearchParams(location.search).get("game")).toBe("R2"));
    const params = new URLSearchParams(location.search);
    expect(params.get("view")).toBe("teams");
    expect(params.get("year")).toBe("2026");
    expect(await summaryTitle()).toMatch(/KT/);
  });

  it("links to the full match centre for the selected game, and to the archive", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    await screen.findByTestId("match-summary");
    const mc = within(matchCenter());
    expect(mc.getByRole("link", { name: /Open full match/i }).getAttribute("href")).toBe(
      `${PRO_PLAY_LIVE_ROUTE}?game=R1`,
    );
    expect(mc.getByRole("link", { name: /Match archive/i }).getAttribute("href")).toBe(
      PRO_PLAY_LIVE_ARCHIVE_ROUTE,
    );
  });

  it("shows the scoreboard and crowns a winner only by the match centre's rule", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    await screen.findByTestId("match-summary");
    await within(matchCenter()).findByText("WINNER");
    expect(within(matchCenter()).getAllByText("WINNER")).toHaveLength(1);
  });

  it("hides the gold chart for a one-frame game and shows it when there is history", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")], goldPoints: 1 });
    const first = renderHub();
    await screen.findByTestId("match-summary");
    await waitFor(() => expect(requests.some((r) => r.includes("/gold"))).toBe(true));
    expect(screen.queryByTestId("hub-gold")).toBeNull();
    first.unmount();

    installBackend({ recent: [summary("R1", "GEN", "T1")], goldPoints: 12 });
    renderHub();
    expect(await screen.findByTestId("hub-gold")).toBeTruthy();
  });

  it("shows an empty state, not a broken board, when there are no games", async () => {
    installBackend({ live: [], recent: [] });
    renderHub();
    expect(await within(matchCenter()).findByText(/No matches right now/i)).toBeTruthy();
    expect(screen.queryByTestId("match-summary")).toBeNull();
    // The rest of the hub is untouched.
    expect(screen.getByRole("search", { name: /Search Pro Play/i })).toBeTruthy();
  });

  it("keeps the rest of the hub working when the live feed is down", async () => {
    installBackend({ feedDown: true });
    renderHub();
    expect(await within(matchCenter()).findByText(/Can't reach the live feed/i)).toBeTruthy();
    expect(screen.getByRole("search", { name: /Search Pro Play/i })).toBeTruthy();
    expect(screen.getByTestId("pro-stats-explorer")).toBeTruthy();
  });
});

/* ── Match Workspace ────────────────────────────────────────────────────── */

describe("Match Workspace", () => {
  it("offers only the lanes the game can pair, starting on the first", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    const ws = within(await findWorkspace());
    const picker = await ws.findByRole("group", { name: /Choose a lane/i });
    const lanes = within(picker).getAllByRole("button").map((b) => b.textContent?.replace(/[A-Z]{2}/g, "").trim());
    expect(lanes.map((l) => l?.match(/Top|Jungle|Mid|Bot|Support/)?.[0])).toEqual(["Top", "Mid"]);
    expect(within(picker).getByRole("button", { name: /Top/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(ws.getByTestId("lane-player-blue")).getByText("Kiin")).toBeTruthy();
    expect(within(ws.getByTestId("lane-player-red")).getByText("Doran")).toBeTruthy();
  });

  it("links resolved players to their profiles and shows their career row with its scope", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    const blue = within(await screen.findByTestId("lane-player-blue"));
    expect(blue.getAllByRole("link", { name: "Kiin" })[0].getAttribute("href")).toBe("/lol/pro-play/player/Kiin");
    expect(await blue.findByText("4.52")).toBeTruthy();
    expect(blue.getByTestId("career-scope").textContent).toMatch(/Career · All seasons · all competitions/);
    expect(blue.getByRole("link", { name: /Stats row/i }).getAttribute("href")).toBe(
      "/lol/pro-play?view=players&player=Kiin",
    );
    expect(blue.getByRole("link", { name: /Champion graph/i }).getAttribute("href")).toMatch(
      /^\/lol\/pro-play\/graphs\?focus=player&vs=champions&e=Kiin/,
    );
  });

  it("draws the lane's champion pair from GRAPH1, blue champion as subject", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    expect(await screen.findByTestId("champion-matchup")).toBeTruthy();
    expect(requests.some((r) => r.includes("/api/graph1/champion-matchup") && r.includes("a=ambessa") && r.includes("b=camille"))).toBe(true);
    expect(screen.getByText(/not a specific pair of players/i)).toBeTruthy();
  });

  it("links the lane to Combat Lab, the matchup study, Pro Data and the Archives", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    const lane = within(await screen.findByTestId("lane-matchup"));
    expect(lane.getByRole("link", { name: /Combat Lab/i }).getAttribute("href")).toBe(
      "/combat-lab?attacker=ambessa&defender=camille",
    );
    expect(lane.getByRole("link", { name: /Matchup study/i }).getAttribute("href")).toBe(
      "/quiz/matchup?a=ambessa&b=camille",
    );
    expect(lane.getByRole("link", { name: /Pro Data/i }).getAttribute("href")).toBe(
      "/lol/pro-play/graphs?focus=matchup&a=ambessa&b=camille",
    );
    expect(lane.getByRole("link", { name: "Ambessa" }).getAttribute("href")).toBe("/lol/docs/champions/ambessa");
    expect(lane.getByRole("link", { name: "Camille" }).getAttribute("href")).toBe("/lol/docs/champions/camille");
  });

  it("switches lanes, and keeps an unresolved player as plain text with no profile", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    const picker = await screen.findByRole("group", { name: /Choose a lane/i });
    fireEvent.click(within(picker).getByRole("button", { name: /Mid/ }));
    const red = within(await screen.findByTestId("lane-player-red"));
    await red.findByText("T1 Mystery");
    expect(red.queryByRole("link", { name: "T1 Mystery" })).toBeNull();
    expect(red.queryByRole("link", { name: /Profile/i })).toBeNull();
    expect(red.getByText(/isn't matched to a Pro Play profile/i)).toBeTruthy();
    await waitFor(() =>
      expect(requests.some((r) => r.includes("a=azir") && r.includes("b=orianna"))).toBe(true),
    );
  });

  it("links both teams to their profiles", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    const ws = within(await findWorkspace());
    expect(ws.getByRole("link", { name: /GEN profile/ }).getAttribute("href")).toBe("/lol/pro-play/team/GEN");
    expect(ws.getByRole("link", { name: /T1 profile/ }).getAttribute("href")).toBe("/lol/pro-play/team/T1");
  });

  it("never links the gated Matchup Explorer and invents no match quiz", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    await screen.findByTestId("champion-matchup");
    const hrefs = within(workspace()).getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.startsWith(PRO_PLAY_MATCHUP_ROUTE))).toBe(false);
    expect(hrefs.some((h) => h.startsWith(PRO_PLAY_QUIZ_ROUTE))).toBe(false);
    expect(within(workspace()).queryByText(/quiz/i)).toBeNull();
  });

  it("says so when the game published no player roles", async () => {
    installBackend({
      recent: [summary("R1", "GEN", "T1")],
      players: [lanePlayer(1, "blue", "", "Kiin", "Ambessa", { role: null })],
    });
    renderHub();
    expect(await within(await findWorkspace()).findByText(/roles weren't published/i)).toBeTruthy();
  });
});

/* ── Discovery ──────────────────────────────────────────────────────────── */

describe("Discovery", () => {
  it("sends a search to the Pro Play search page", async () => {
    installBackend({ recent: [] });
    renderHub();
    const form = screen.getByRole("search", { name: /Search Pro Play/i });
    fireEvent.change(within(form).getByRole("searchbox"), { target: { value: "  Faker " } });
    fireEvent.click(within(form).getByRole("button", { name: /Search/i }));
    expect(location.pathname).toBe(PRO_PLAY_SEARCH_ROUTE);
    expect(location.search).toBe("?q=Faker");
  });

  it("does not send a search the backend would refuse", () => {
    installBackend({ recent: [] });
    renderHub();
    const form = screen.getByRole("search", { name: /Search Pro Play/i });
    fireEvent.change(within(form).getByRole("searchbox"), { target: { value: "F" } });
    fireEvent.click(within(form).getByRole("button", { name: /Search/i }));
    expect(location.pathname).toBe(PRO_PLAY_ROUTE);
    expect(screen.getByText(/at least 2 characters/i)).toBeTruthy();
  });

  it("shows featured graphs that land on working graph URLs", () => {
    installBackend({ recent: [] });
    renderHub();
    const cards = screen.getAllByTestId(/^featured-/);
    expect(cards).toHaveLength(6);
    for (const card of cards) expect(card.getAttribute("href")).toMatch(/^\/lol\/pro-play\/graphs\?focus=/);
  });

  it("keeps every full tool, in the hub's established order", () => {
    installBackend({ recent: [] });
    renderHub();
    const nav = screen.getByRole("navigation", { name: /Pro Play tools/i });
    expect(within(nav).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      PRO_PLAY_LIVE_ROUTE,
      PRO_PLAY_MATCHUP_ROUTE,
      PRO_PLAY_GRAPHS_ROUTE,
      PRO_PLAY_LIVE_ARCHIVE_ROUTE,
      PRO_PLAY_QUIZ_ROUTE,
    ]);
    expect(within(nav).getByRole("link", { name: /Live & Recent Matches/i }).textContent).toMatch(/just finished/i);
  });

  it("sounds one analytical handoff for Matchup Explorer and keeps plain navigation silent", () => {
    installBackend({ recent: [] });
    renderHub();
    const nav = screen.getByRole("navigation", { name: /Pro Play tools/i });
    fireEvent.click(within(nav).getByRole("link", { name: /Live & Recent Matches/i }));
    expect(sfx.play).not.toHaveBeenCalled();
    fireEvent.click(within(nav).getByRole("link", { name: /Matchup Explorer/i }));
    expect(sfx.play).toHaveBeenCalledOnce();
    expect(sfx.play).toHaveBeenCalledWith("pro-play.analysis.open");
  });
});

/* ── Pro Stats stays ────────────────────────────────────────────────────── */

describe("Pro Stats Explorer", () => {
  it("stays on the hub", () => {
    installBackend({ recent: [] });
    renderHub();
    expect(screen.getByTestId("pro-stats-explorer")).toBeTruthy();
  });

  it("brings a 'View in Pro Stats' arrival straight to the table", () => {
    installBackend({ recent: [] });
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    renderHub(`${PRO_PLAY_ROUTE}?view=players&player=Faker`);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.instances[0]).toBe(document.getElementById("pro-stats"));
  });

  it("does not jump a plain hub visit down to the table", () => {
    installBackend({ recent: [] });
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    renderHub();
    expect(spy).not.toHaveBeenCalled();
  });
});
