/**
 * Pro Play hub — match-centred (PPH1), composed as one match board (PPH2.1).
 *
 * Pins the three sections and their contracts: the Match Center's selection
 * (live first, then a FINISHED game, `?game=` never overridden), the
 * workspace's lanes and the existing destinations it joins to (and the gated
 * ones it must not), the match-independent discovery, and the Stats Explorer
 * URL contract (PP-IA2: now on its own route, reached by redirect).
 *
 * PP-IA2 also pins STATISTICAL SCOPE: the board's core region carries only
 * this game's numbers — no career lines, no all-time champion pair, no
 * leaderboard — and only what the feed or Riot's series record states: kills
 * labelled as kills, no duration, no structure-inferred winner, the FINAL
 * series score.
 *
 * Live fixtures follow the real `/api/live-esports/*` shapes the match centre
 * tests use (captured 2026-09-04).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProPlayHub, {
  PRO_PLAY_GRAPHS_ROUTE,
  PRO_PLAY_LIVE_ROUTE,
  PRO_PLAY_MATCHUP_ROUTE,
  PRO_PLAY_QUIZ_ROUTE,
  PRO_PLAY_ROUTE,
  PRO_PLAY_SEARCH_ROUTE,
} from "./ProPlayHub";
import { PRO_PLAY_LIVE_ARCHIVE_ROUTE, PRO_PLAY_STATS_ROUTE } from "@/lib/pro-play/routes";
import { __resetProPlayMediaCache } from "@/components/pro-play/media/ProPlayMediaProvider";
import DCGI_PRE_EVENT from "@/lib/pro-play/__fixtures__/tournamentDcgiPreEvent.json";
import LES_G1 from "@/lib/live-esports/__fixtures__/ppia2LesSwappedG1.json";

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
  /** `/live-esports/upcoming` matches; undefined = an older backend (404). */
  upcoming?: unknown[];
  /** `/live-esports/tournament/{id}` (DCGI1); undefined = an older backend (404). */
  tournament?: unknown;
  itemIndex?: { id: number; name: string; slug: string }[];
  media?: unknown[];
  teamState?: (id: string) => unknown;
  /** PP-IA2 `result` / `series` fields of `/games/{id}`; absent = none sent. */
  record?: (id: string) => Record<string, unknown> | undefined;
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
    if (path.includes("/live-esports/tournament/")) {
      return opts.tournament ? ok(opts.tournament) : notFound();
    }
    if (path.includes("/live-esports/upcoming")) {
      if (!opts.upcoming) return notFound();
      return ok({
        enabled: true,
        generated_at: "x",
        source: "getSchedule",
        source_ok: true,
        stale: false,
        fetched_at: "x",
        horizon_days: 14,
        limit: 12,
        matches: opts.upcoming,
      });
    }
    if (/\/api\/items(\?|$)/.test(path)) return ok({ ok: true, count: 0, items: opts.itemIndex ?? [] });
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
        team_state: opts.teamState?.(id) ?? {
          blue: { kills: 20, total_gold: 60000, towers: 9, inhibitors: 2, barons: 1, dragons: [], frame_ts: null },
          red: { kills: 8, total_gold: 50000, towers: 2, inhibitors: 0, barons: 0, dragons: [], frame_ts: null },
        },
        recent_events: [],
        ...(opts.record?.(id) ?? {}),
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
    if (path.includes("/media/resolve")) return ok({ results: opts.media ?? [], identity_available: true });
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

/** The hub inside real routes, for the Pro Stats redirect. */
function renderRoutes(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path={PRO_PLAY_ROUTE} element={<ProPlayHub />} />
          <Route path={PRO_PLAY_STATS_ROUTE} element={<div data-testid="stats-route" />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** A `/games/{id}` PP-IA2 record: one official winner by team id, or none. */
function officialRecord(matchId: string, games: [string, number, string | null, "blue" | "red" | null][], final?: [string, string, number][]) {
  return {
    result: null as unknown,
    series: {
      contract_version: 1,
      match_id: matchId,
      best_of: 3,
      state: final ? "completed" : "unknown",
      teams: (final ?? [["b", "GEN", 0], ["r", "T1", 0]]).map(([id, code, wins]) => ({
        esports_team_id: id,
        code,
        name: code,
        wins: final ? wins : null,
      })),
      score: { basis: final ? "upstream_final" : "confirmed_games", complete: !!final },
      games: games.map(([gameId, n, winner, side]) => ({
        game_id: gameId,
        game_number: n,
        availability: "finished",
        result: winner
          ? { status: "official", winner_team_id: winner, winner_side: side, basis: "series_progression" }
          : { status: "unconfirmed", winner_team_id: null, winner_side: null, basis: null },
        sides: { source: "schedule" as const, verified: true, corrected: false },
      })),
    },
  };
}

/** The selected game's own result entry, alongside its series record. */
function withResult(rec: ReturnType<typeof officialRecord>, gameId: string) {
  const entry = rec.series.games.find((g) => g.game_id === gameId)!;
  return { ...rec, result: { ...entry.result, sides: entry.sides } };
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
  // The media provider caches per session by key set; every test is a session.
  __resetProPlayMediaCache();
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

  it("orders the page Match Center → Workspace → Explore, with nothing beside the board (PP-IA2)", async () => {
    installBackend({ recent: [summary("g1", "GEN", "T1")] });
    renderHub();
    await screen.findByTestId("match-summary");
    const ids = ["match-center", "match-workspace", "discover"].map((id) => document.getElementById(id));
    ids.forEach((el) => expect(el).toBeTruthy());
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i - 1]!.compareDocumentPosition(ids[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // Discovery is not inside the board and not a column beside it: the
    // board and the Explore band are siblings, board first.
    expect(matchCenter().contains(document.getElementById("discover"))).toBe(false);
    expect(matchCenter().parentElement).toBe(document.getElementById("discover")!.parentElement);
    // The Pro Stats table is not on the hub any more.
    expect(document.getElementById("pro-stats")).toBeNull();
    expect(screen.queryByTestId("pro-stats-explorer")).toBeNull();
  });

  it("shows no UP NEXT at all when the backend has no schedule route", async () => {
    installBackend({ recent: [summary("g1", "GEN", "T1")] });
    renderHub();
    await screen.findByTestId("match-summary");
    expect(screen.queryByText(/up next/i)).toBeNull();
    expect(screen.queryByTestId("upcoming-chip")).toBeNull();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });

  it("carries the featured event in the header row, never as a band above the match (DCGI1)", async () => {
    installBackend({ recent: [summary("g1", "GEN", "T1")], tournament: DCGI_PRE_EVENT });
    renderHub();
    const pill = await screen.findByTestId("tournament-spotlight");
    expect(pill.getAttribute("href")).toBe("/lol/pro-play/tournament/dcgi-2026");
    expect(pill.closest("header")).toBeTruthy();
    // Page chrome, labelled as such — never read as the selected game's event.
    expect(within(pill).getByTestId("spotlight-label").textContent).toBe("Featured");
    expect(matchCenter().contains(pill)).toBe(false);
    const header = pill.closest("header")!;
    // Nothing new between the header and the Match Center.
    expect(header.nextElementSibling?.contains(document.getElementById("match-center"))).toBe(true);
  });

  it("draws no event entry when the backend has no tournament route", async () => {
    installBackend({ recent: [summary("g1", "GEN", "T1")] });
    renderHub();
    await screen.findByTestId("match-summary");
    await waitFor(() => expect(requests.some((u) => u.includes("/live-esports/tournament/"))).toBe(true));
    expect(screen.queryByTestId("tournament-spotlight")).toBeNull();
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
    expect(within(matchCenter()).getByRole("heading", { level: 2, name: "Previous match" })).toBeTruthy();
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
    const rail = within(matchCenter()).getByRole("group", { name: /Choose a match/i });
    expect(within(rail).getAllByRole("button", { pressed: true }).length).toBe(1);
  });

  it("says so when a pinned game does not exist, and offers the latest instead", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub(`${PRO_PLAY_ROUTE}?game=NOPE`);
    await within(matchCenter()).findByText(/Couldn't load that match/i);
    fireEvent.click(within(matchCenter()).getByRole("button", { name: /Show the latest match/i }));
    expect(await summaryTitle()).toMatch(/GEN/);
    expect(location.search).toBe("");
  });

  it("writes a rail pick to ?game=", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1"), summary("R2", "KT", "NS")] });
    renderHub();
    await screen.findByTestId("match-summary");
    const rail = within(matchCenter()).getByRole("group", { name: /Choose a match/i });
    fireEvent.click(within(rail).getByText(/KT/));
    await waitFor(() => expect(new URLSearchParams(location.search).get("game")).toBe("R2"));
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

  it("crowns a winner only when Riot's series record names one (PP-IA2)", async () => {
    const rec = officialRecord("m-R1", [["R1", 1, "b", "blue"]]);
    installBackend({ recent: [summary("R1", "GEN", "T1")], record: () => withResult(rec, "R1") });
    renderHub();
    await screen.findByTestId("match-summary");
    await waitFor(() => expect(screen.getByTestId("team-blue").textContent).toMatch(/Winner/));
    expect(screen.getByTestId("team-red").textContent).not.toMatch(/Winner/);
    expect(screen.queryByTestId("result-note")).toBeNull();
  });

  it("never crowns a team from a structure lead: an unconfirmed result says so", async () => {
    // The default team state is a 2–0 inhibitor, 9–2 tower lead for blue —
    // exactly what the removed heuristic crowned.
    const rec = officialRecord("m-R1", [["R1", 1, null, null]]);
    installBackend({ recent: [summary("R1", "GEN", "T1")], record: () => withResult(rec, "R1") });
    renderHub();
    await screen.findByTestId("match-summary");
    expect(await screen.findByTestId("result-note")).toBeTruthy();
    expect(screen.getByTestId("result-note").textContent).toMatch(/Result not confirmed/);
    expect(screen.getByTestId("team-blue").textContent).not.toMatch(/Winner/);
    expect(screen.getByTestId("team-red").textContent).not.toMatch(/Winner/);
  });

  it("claims no result at all from a backend that sends none", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    await screen.findByTestId("match-summary");
    await waitFor(() => expect(screen.getByTestId("result-note").textContent).toMatch(/Result not confirmed/));
    expect(screen.getByTestId("team-blue").textContent).not.toMatch(/Winner/);
  });

  it("labels the big number as KILLS — never a bare score — and shows no duration", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    const kills = await within(matchCenter()).findByTestId("kills-score");
    expect(kills.textContent).toMatch(/^Kills\s*20\s*–\s*8$/);
    expect(within(matchCenter()).getByLabelText("Kills 20 to 8")).toBeTruthy();
    // No m:ss anywhere in the score header (the frame span is not a game clock).
    const header = kills.parentElement!.parentElement!;
    expect(header.textContent).not.toMatch(/\d+:\d\d/);
    expect(within(matchCenter()).queryByTitle(/Elapsed game time/i)).toBeNull();
  });

  it("shows the completed series' FINAL score in the event band, not the score entering the game", async () => {
    // LCS 2026 final shape: G4 entered at TLAW 2–1, the series ended 3–1.
    const g4 = summary("G4", "TLAW", "LYON", {
      match_id: "final",
      best_of: 5,
      game_number: 4,
      teams: {
        blue: { name: "Team Liquid", code: "TLAW", esports_team_id: "tl", resolved_page: null, series_wins: 2 },
        red: { name: "LYON", code: "LYON", esports_team_id: "ly", resolved_page: null, series_wins: 1 },
      },
    });
    const rec = officialRecord(
      "final",
      [["G1", 1, "tl", "blue"], ["G2", 2, "tl", "blue"], ["G3", 3, "ly", "red"], ["G4", 4, "tl", "blue"]],
      [["tl", "TLAW", 3], ["ly", "LYON", 1]],
    );
    installBackend({ recent: [g4], record: () => withResult(rec, "G4") });
    renderHub();
    const score = await screen.findByTestId("series-final-score");
    expect(score.textContent).toBe("Final · TLAW 3–1 LYON");
    expect(within(screen.getByTestId("event-band")).queryByText(/2–1/)).toBeNull();
    await waitFor(() => expect(within(screen.getByTestId("match-rail")).getByTestId("series-score").textContent).toBe("3–1"));
  });

  it("splits the event (competition) from the match facts, with no 'nothing live' chrome", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    const meta = await screen.findByTestId("match-meta");
    expect(meta.textContent).toMatch(/LCK.*·.*Week 4/);
    const facts = screen.getByTestId("match-facts");
    expect(facts.textContent).toMatch(/Bo3 · .*2026 · Patch 16\.17/);
    // The series score lives on the rail's series chip, not in the facts line.
    expect(facts.textContent).not.toMatch(/Series/);
    // No duration (PP-IA2).
    expect(facts.textContent).not.toMatch(/\d+:\d\d/);
    expect(screen.queryByText(/Nothing is live/i)).toBeNull();
  });

  it("names a team in full when no crest resolves, never an empty initials frame", async () => {
    installBackend({
      recent: [
        summary("R1", "GEN", "T1", {
          teams: {
            blue: { name: "Gen.G Esports Extremely Long Organisation Name", code: "GEN", esports_team_id: "b", resolved_page: null, series_wins: 0 },
            red: { name: "T1", code: "T1", esports_team_id: "r", resolved_page: "T1", series_wins: 0 },
          },
        }),
      ],
    });
    renderHub();
    const blue = await screen.findByTestId("team-blue");
    expect(blue.textContent).toMatch(/Gen\.G Esports Extremely Long Organisation Name/);
    expect(within(blue).queryByTestId("team-crest")).toBeNull();
    // No canonical page: no profile link is invented.
    expect(within(blue).queryByRole("link")).toBeNull();
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
    expect(screen.getByTestId("explore-band")).toBeTruthy();
  });
});

/* ── Match Workspace ────────────────────────────────────────────────────── */

describe("Match Workspace", () => {
  it("offers only the lanes the game can pair, starting on the first", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    const ws = within(await findWorkspace());
    const picker = await ws.findByRole("group", { name: /Choose a lane/i });
    const rows = within(picker).getAllByRole("button");
    expect(rows.map((b) => b.getAttribute("data-testid"))).toEqual(["lane-row-top", "lane-row-mid"]);
    expect(within(picker).getByRole("button", { name: /Top/ }).getAttribute("aria-pressed")).toBe("true");
    // Every row says it expands; only the selected one is open.
    expect(rows.map((b) => b.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
    expect(within(ws.getByTestId("lane-player-blue")).getByText("Kiin")).toBeTruthy();
    expect(within(ws.getByTestId("lane-player-red")).getByText("Doran")).toBeTruthy();
  });

  it("shows both lineups at once: player, KDA, CS and gold, and the lane's gold difference", async () => {
    installBackend({
      recent: [summary("R1", "GEN", "T1")],
      players: [
        lanePlayer(1, "blue", "top", "Kiin", "Ambessa", { total_gold: 14598, creep_score: 277, kills: 7, deaths: 1, assists: 9 }),
        lanePlayer(6, "red", "top", "Doran", "Camille", { total_gold: 7933 }),
        lanePlayer(3, "blue", "mid", "Chovy", "Azir", { total_gold: 10000 }),
        lanePlayer(8, "red", "mid", "Faker", "Orianna", { total_gold: null }),
      ],
    });
    renderHub();
    const top = await screen.findByTestId("lane-row-top");
    expect(top.textContent).toMatch(/Kiin/);
    expect(top.textContent).toMatch(/7\/1\/9/);
    expect(top.textContent).toMatch(/277 CS · 14\.6k/);
    expect(top.textContent).toMatch(/Doran/);
    expect(top.textContent).toMatch(/\+6\.7k/);
    // Missing gold on one side: no difference is shown, never a zero.
    expect(screen.getByTestId("lane-row-mid").textContent).not.toMatch(/[+−±]\d/);
  });

  it("keeps the lane expansion to THIS GAME: no career line, no all-time champion pair (PP-IA2)", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    const lane = await screen.findByTestId("lane-matchup");
    await screen.findByTestId("go-deeper");
    expect(within(lane).queryByTestId("career-line")).toBeNull();
    expect(within(lane).queryByTestId("champion-matchup")).toBeNull();
    // Neither population is even requested by the board.
    expect(requests.some((r) => r.includes("/api/pro-play/stats/players"))).toBe(false);
    expect(requests.some((r) => r.includes("/api/graph1/champion-matchup"))).toBe(false);
    // Outside the labelled Go deeper block, the expansion prints no record,
    // no career and no historical game counts.
    const core = [screen.getByTestId("lane-player-blue"), screen.getByTestId("lane-player-red")]
      .map((el) => el.textContent ?? "")
      .join(" ");
    expect(core).not.toMatch(/career|games|win rate|all-time|\d+–\d+/i);
  });

  it("shows this game's runes, kill participation and damage share for both players", async () => {
    installBackend({
      recent: [summary("R1", "GEN", "T1")],
      players: [
        lanePlayer(1, "blue", "top", "Morgan", "Jax", {
          kill_participation: 0.667,
          champion_damage_share: 0.25,
          wards_placed: 11,
          // LCS 2026 final G4, Morgan: Grasp / Resolve + Sorcery.
          runes: { style_id: 8400, sub_style_id: 8200, perks: [8437, 8446, 8444, 8242, 8226, 8237, 5005, 5008, 5011] },
        }),
        lanePlayer(6, "red", "top", "Dhokla", "Gnar", {
          runes: { style_id: 8000, sub_style_id: 8400, perks: [8021, 9101, 9104, 8299, 8473, 8242, 5005, 5008, 5011] },
        }),
      ],
    });
    renderHub();
    const blue = within(await screen.findByTestId("lane-player-blue"));
    expect(blue.getByTestId("lane-runes").textContent).toBe("Grasp of the Undying · Resolve / Sorcery");
    expect(blue.getByTestId("lane-game-stats").textContent).toMatch(/KP 67% · Dmg 25% · Wards 11/);
    const red = within(screen.getByTestId("lane-player-red"));
    expect(red.getByTestId("lane-runes").textContent).toBe("Fleet Footwork · Precision / Resolve");
  });

  it("draws no rune line when the feed sent no rune page", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    const blue = within(await screen.findByTestId("lane-player-blue"));
    expect(blue.queryByTestId("lane-runes")).toBeNull();
  });

  it("reaches the historical champion pair in one click, under a labelled scope change", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    const deeper = within(await screen.findByTestId("go-deeper"));
    expect(deeper.getByText(/Go deeper/i)).toBeTruthy();
    expect(deeper.getByText(/beyond this game/i)).toBeTruthy();
    const pair = deeper.getByRole("link", { name: /Ambessa vs Camille in pro play/i });
    expect(pair.getAttribute("href")).toBe("/lol/pro-play/graphs?focus=matchup&a=ambessa&b=camille");
    expect(within(pair).getByTestId("scope-chip").textContent).toBe("Historical · any role");
    // Every way out names the population it opens.
    for (const link of deeper.getAllByRole("link")) {
      expect(within(link).getByTestId("scope-chip").textContent).toBeTruthy();
    }
  });

  it("links the lane to profiles, Combat Lab, the matchup study and champion references, all under Go deeper", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    const deeper = within(await screen.findByTestId("go-deeper"));
    const href = (name: RegExp) => deeper.getByRole("link", { name }).getAttribute("href");
    expect(href(/Kiin profile/)).toBe("/lol/pro-play/player/Kiin");
    expect(href(/Doran profile/)).toBe("/lol/pro-play/player/Doran");
    expect(href(/Combat Lab/)).toBe("/combat-lab?attacker=ambessa&defender=camille");
    expect(href(/Matchup study/)).toBe("/quiz/matchup?a=ambessa&b=camille");
    expect(href(/^Ambessa in pro play/)).toBe("/lol/pro-play/champion/Ambessa");
    expect(href(/^Camille in pro play/)).toBe("/lol/pro-play/champion/Camille");
    expect(href(/Ambessa reference/)).toBe("/lol/docs/champions/ambessa");
    expect(href(/Camille reference/)).toBe("/lol/docs/champions/camille");
  });

  it("switches lanes, and keeps an unresolved player as plain text with no profile", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    const picker = await screen.findByRole("group", { name: /Choose a lane/i });
    fireEvent.click(within(picker).getByRole("button", { name: /Mid/ }));
    expect(within(picker).getByRole("button", { name: /Mid/ }).getAttribute("aria-expanded")).toBe("true");
    const red = within(await screen.findByTestId("lane-player-red"));
    await red.findByText("T1 Mystery");
    expect(red.getByText("T1 Mystery").getAttribute("title")).toMatch(/Not matched to a Pro Play profile/);
    const deeper = within(await screen.findByTestId("go-deeper"));
    expect(deeper.getByRole("link", { name: /Chovy profile/ })).toBeTruthy();
    expect(deeper.queryByRole("link", { name: /T1 Mystery/ })).toBeNull();
    expect(deeper.getByRole("link", { name: /Azir vs Orianna/ }).getAttribute("href")).toBe(
      "/lol/pro-play/graphs?focus=matchup&a=azir&b=orianna",
    );
  });

  it("links both teams to their profiles from the score header", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    await screen.findByTestId("match-summary");
    const mc = within(matchCenter());
    expect(mc.getByRole("link", { name: /GEN profile/ }).getAttribute("href")).toBe("/lol/pro-play/team/GEN");
    expect(mc.getByRole("link", { name: /T1 profile/ }).getAttribute("href")).toBe("/lol/pro-play/team/T1");
  });

  it("never links the gated Matchup Explorer and invents no match quiz", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    await screen.findByTestId("go-deeper");
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
    expect(cards).toHaveLength(4);
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
    expect(within(nav).getByRole("link", { name: /Live & Recent/i }).getAttribute("title")).toMatch(/just finished/i);
  });

  it("sounds one analytical handoff for Matchup Explorer and keeps plain navigation silent", () => {
    installBackend({ recent: [] });
    renderHub();
    const nav = screen.getByRole("navigation", { name: /Pro Play tools/i });
    fireEvent.click(within(nav).getByRole("link", { name: /Live & Recent/i }));
    expect(sfx.play).not.toHaveBeenCalled();
    fireEvent.click(within(nav).getByRole("link", { name: /Matchup Explorer/i }));
    expect(sfx.play).toHaveBeenCalledOnce();
    expect(sfx.play).toHaveBeenCalledWith("pro-play.analysis.open");
  });
});

/* ── PP-IA2: discovery is labelled, global numbers leave the board ──────── */

describe("Explore band", () => {
  it("says it is not about the match, and carries no leaderboard", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    await screen.findByTestId("match-summary");
    const band = screen.getByTestId("explore-band");
    expect(within(band).getByRole("heading", { level: 2, name: /Explore pro history/i })).toBeTruthy();
    expect(within(band).getByTestId("explore-scope").textContent).toMatch(/Not about the match above/);
    // The calendar-year "Most games" leaderboard is not on the hub at all.
    expect(screen.queryByTestId("stats-glimpse")).toBeNull();
    expect(screen.queryByText(/Most games/i)).toBeNull();
    expect(requests.some((r) => r.includes("/api/pro-play/stats/"))).toBe(false);
    // Global prompts never sit inside the selected-game board.
    for (const card of screen.getAllByTestId(/^featured-/)) expect(matchCenter().contains(card)).toBe(false);
  });

  it("leads to Pro Stats on its own route", () => {
    installBackend({ recent: [] });
    renderHub();
    expect(screen.getByTestId("pro-stats-entry").getAttribute("href")).toBe(PRO_PLAY_STATS_ROUTE);
    expect(screen.getByRole("link", { name: "Pro Stats" }).getAttribute("href")).toBe(PRO_PLAY_STATS_ROUTE);
  });
});

describe("Pro Stats route (PP-IA2)", () => {
  it("redirects a 'View in Pro Stats' hub URL to the stats route with its filters intact", async () => {
    installBackend({ recent: [] });
    renderRoutes(`${PRO_PLAY_ROUTE}?view=players&player=Faker&year=2026&sort=kda&dir=asc&page=2`);
    await screen.findByTestId("stats-route");
    expect(location.pathname).toBe(PRO_PLAY_STATS_ROUTE);
    expect(location.search).toBe("?view=players&player=Faker&year=2026&sort=kda&dir=asc&page=2");
  });

  it("carries only the table's own keys", async () => {
    installBackend({ recent: [] });
    renderRoutes(`${PRO_PLAY_ROUTE}?league=LCK&utm_source=x&min_games=5`);
    await screen.findByTestId("stats-route");
    expect(location.search).toBe("?league=LCK&min_games=5");
  });

  it("leaves a plain hub visit, and a hub URL that selects a match, on the hub", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderRoutes(`${PRO_PLAY_ROUTE}?game=R1&view=teams`);
    await screen.findByTestId("match-summary");
    expect(location.pathname).toBe(PRO_PLAY_ROUTE);
    expect(screen.queryByTestId("stats-route")).toBeNull();
  });
});


/* ── PPH3: the compact match dossier ────────────────────────────────────── */

const FUTURE = "2099-10-03T05:00:00Z";
function upcomingMatch(id: string, a: string, b: string, over: Record<string, unknown> = {}) {
  return {
    match_id: id,
    scheduled_start: FUTURE,
    league: { slug: "lck", name: "LCK", region: "KOREA", scope: "domestic" },
    block_name: "Playoffs",
    best_of: 5,
    teams: {
      a: { name: a, code: a, resolved_page: a, tbd: false },
      b: { name: b, code: b, resolved_page: null, tbd: false },
    },
    ...over,
  };
}

/** Two games of ONE Bo3 series; sides swap for game 2, as they do. */
function bo3Series() {
  const g1 = summary("S-G1", "GEN", "T1", { match_id: "m-series", game_number: 1 });
  const g2 = summary("S-G2", "T1", "GEN", {
    match_id: "m-series",
    game_number: 2,
    teams: {
      blue: { name: "T1", code: "T1", esports_team_id: "r", resolved_page: "T1", series_wins: 0 },
      red: { name: "GEN", code: "GEN", esports_team_id: "b", resolved_page: "GEN", series_wins: 1 },
    },
  });
  return [g2, g1];
}

/** Riot's record for `bo3Series`: GEN ("b") took game 1, T1 ("r") game 2. */
const bo3Record = (id: string) =>
  withResult(
    officialRecord("m-series", [
      ["S-G1", 1, "b", "blue"],
      ["S-G2", 2, "r", "blue"],
    ]),
    id,
  );

describe("PPH3 · series and state", () => {
  it("groups a series' games into ONE rail chip with its series score", async () => {
    installBackend({ recent: [...bo3Series(), summary("X1", "DK", "KT")], record: bo3Record });
    renderHub();
    await screen.findByTestId("match-summary");
    const chips = within(matchCenter()).getAllByTestId("series-chip");
    expect(chips.length).toBe(2);
    // Both results from Riot's series record: GEN took game 1, T1 game 2.
    await waitFor(() => expect(chips[0].textContent).toMatch(/T1\s*1–1\s*GEN/));
    expect(within(chips[0]).getByTestId("match-state").textContent).toMatch(/Completed/i);
  });

  it("marks the series score as possibly short while the last result is unconfirmed", async () => {
    // No record: game 2's 2–0 inhibitor lead for blue T1 decides nothing.
    installBackend({ recent: bo3Series() });
    renderHub();
    await screen.findByTestId("match-summary");
    const chip = within(matchCenter()).getAllByTestId("series-chip")[0];
    await waitFor(() => expect(chip.textContent).toMatch(/T1\s*0–1\*\s*GEN/));
  });

  it("puts a tab per played game right after the selected series chip, and switches games", async () => {
    installBackend({ recent: bo3Series(), record: bo3Record });
    renderHub();
    const bar = await screen.findByTestId("series-bar");
    const rail = screen.getByTestId("match-rail");
    expect(rail.contains(bar)).toBe(true);
    await waitFor(() => expect(within(rail).getByTestId("series-score").textContent).toBe("1–1"));
    const tabs = within(bar).getAllByTestId("game-tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["G1GEN", "G2T1"]);
    fireEvent.click(tabs[0]);
    await waitFor(() => expect(location.search).toContain("game=S-G1"));
  });

  it("labels the rail groups LIVE NOW and PREVIOUS MATCH, and a live game LIVE", async () => {
    installBackend({ live: [liveGame("L1", "HLE", "DK")], recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    await screen.findByTestId("match-summary");
    const rail = screen.getByTestId("match-rail");
    expect(rail.textContent).toMatch(/Live now.*Previous match/i);
    const header = within(screen.getByTestId("match-summary")).getAllByTestId("match-state")[0];
    expect(header.getAttribute("data-state")).toBe("live");
    expect(header.textContent).toMatch(/^Live/);
  });

  it("never shows a LIVE/COMPLETED badge for a stale game — its honest pill stays", async () => {
    installBackend({ recent: [summary("S1", "KT", "NS", { availability: "live", freshness: STALE })] });
    renderHub(`${PRO_PLAY_ROUTE}?game=S1`);
    const s = await screen.findByTestId("match-summary");
    expect(within(s).queryByTestId("match-state")).toBeNull();
    expect(within(s).getByText("STALE")).toBeTruthy();
  });

  it("never treats a store `scheduled` row as a played game or an upcoming match", async () => {
    installBackend({
      recent: [
        summary("R1", "GEN", "T1"),
        summary("NP", "BFX", "DNS", { availability: "scheduled", freshness: { ...FINAL, label: "no_data" } }),
      ],
    });
    renderHub();
    await screen.findByTestId("match-summary");
    expect(within(screen.getByTestId("match-rail")).queryByText("BFX")).toBeNull();
    expect(screen.queryByText(/up next/i)).toBeNull();
  });
});

describe("PPH3 · UP NEXT", () => {
  it("lists upstream's upcoming matches under UP NEXT and opens one without scaffolding", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")], upcoming: [upcomingMatch("u1", "HLE", "KT")] });
    renderHub();
    const chip = await screen.findByTestId("upcoming-chip");
    expect(screen.getByTestId("match-rail").textContent).toMatch(/Up next/i);
    expect(within(chip).getByTestId("match-state").getAttribute("data-state")).toBe("upcoming");
    fireEvent.click(chip);
    await waitFor(() => expect(location.search).toContain("next=u1"));
    const board = await screen.findByTestId("upcoming-summary");
    expect(within(board).getByTestId("match-state").textContent).toMatch(/Upcoming/i);
    expect(board.textContent).toMatch(/Best of 5/);
    // No empty scoreboard, no lanes for a match that has not started.
    expect(screen.queryByTestId("match-summary")).toBeNull();
    expect(document.getElementById("match-workspace")).toBeNull();
    // The resolved team links to its profile; the unresolved one does not.
    expect(within(board).getByRole("link", { name: /HLE profile/ })).toBeTruthy();
    expect(within(board).queryByRole("link", { name: /KT profile/ })).toBeNull();
  });

  it("points at UP NEXT from the rail's edge only while its first chip is cut off", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")], upcoming: [upcomingMatch("u1", "HLE", "KT")] });
    const rect = (right: number) => ({ left: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, right, toJSON: () => ({}) }) as DOMRect;
    let chipRight = 900;
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const id = this.getAttribute("data-testid");
      return rect(id === "upcoming-chip" ? chipRight : id === "match-rail" ? 600 : 0);
    });
    const scrollBy = vi.fn();
    Element.prototype.scrollBy = scrollBy;
    try {
      renderHub();
      const jump = await screen.findByTestId("rail-jump-next");
      fireEvent.click(jump);
      expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
      // Scrolled into view: the pill goes away.
      chipRight = 500;
      fireEvent.scroll(screen.getByTestId("match-rail"));
      await waitFor(() => expect(screen.queryByTestId("rail-jump-next")).toBeNull());
    } finally {
      spy.mockRestore();
      delete Element.prototype.scrollBy;
    }
  });

  it("falls back to the played games when ?next= names a match no longer upcoming", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")], upcoming: [] });
    renderHub(`${PRO_PLAY_ROUTE}?next=gone`);
    expect(await summaryTitle()).toMatch(/GEN/);
  });

  it("picking a played game from the rail leaves the upcoming view", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")], upcoming: [upcomingMatch("u1", "HLE", "KT")] });
    renderHub(`${PRO_PLAY_ROUTE}?next=u1`);
    await screen.findByTestId("upcoming-summary");
    fireEvent.click(within(matchCenter()).getAllByTestId("series-chip")[0]);
    await waitFor(() => expect(location.search).not.toContain("next="));
    await screen.findByTestId("match-summary");
  });
});

describe("PPH3 · entity media", () => {
  const ITEM_PLAYERS = [
    lanePlayer(1, "blue", "top", "Kiin", "Ambessa", { items: [3078, 3363, 3111, 2055, 2055] }),
    lanePlayer(6, "red", "top", "Doran", "Camille", { items: [] }),
  ];

  it("resolves real item IDs to the asset store's item icons, trinket last, named by the item index", async () => {
    installBackend({
      recent: [summary("R1", "GEN", "T1")],
      players: ITEM_PLAYERS,
      itemIndex: [{ id: 3078, name: "Trinity Force", slug: "trinity-force" }],
    });
    renderHub();
    const row = await screen.findByTestId("lane-row-top");
    const strips = within(row).getAllByTestId("item-strip");
    // A player with no items draws no empty strip.
    expect(strips.length).toBe(1);
    const ids = within(strips[0]).getAllByTestId("item-icon").map((el) => el.getAttribute("data-item-id"));
    // Every served entry, duplicates included; the trinket (3363) moved last.
    expect(ids).toEqual(["3078", "3111", "2055", "2055", "3363"]);
    const img = within(strips[0]).getAllByTestId("item-icon")[0].querySelector("img")!;
    expect(img.getAttribute("src")).toMatch(/assets\/items\/3078\.png$/);
    await waitFor(() => expect(strips[0].getAttribute("aria-label")).toMatch(/Trinity Force/));
  });

  it("draws approved player portraits from the media authority, and no empty frame otherwise", async () => {
    installBackend({
      recent: [summary("R1", "GEN", "T1")],
      media: [
        {
          entity_type: "player", entity_key: "Kiin", media_type: "player_portrait", state: "art", reason: "ok",
          display_name: "Kiin", fallback_label: null, asset_path: "assets/esports/players/kiin/p.jpg",
          mime_type: "image/jpeg", width: 1, height: 1, credit: null, contract_version: "1",
        },
      ],
    });
    renderHub();
    const row = await screen.findByTestId("lane-row-top");
    // Only the player with approved art gets a face; a monogram frame would
    // only cost the row width (the score header's crest rule).
    await waitFor(() => {
      const states = within(row).getAllByTestId("player-portrait").map((el) => el.getAttribute("data-media-state"));
      expect(states).toEqual(["art"]);
    });
    // An unresolved player's portrait is never looked up.
    const media = requests.filter((r) => r.includes("/media/resolve"));
    expect(media.some((r) => r.includes("player=Kiin"))).toBe(true);
    expect(media.some((r) => r.includes("player=T1"))).toBe(false);
  });

  it("gives the league a first-class event mark with a designed fallback", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    const band = await screen.findByTestId("event-band");
    const mark = within(band).getByTestId("event-mark");
    expect(mark.textContent).toBe("LCK");
    expect(mark.getAttribute("data-media-state")).toBe("placeholder");
    expect(mark.querySelector("img")).toBeNull();
  });

  it("puts a real champion icon and level on every lane side", async () => {
    installBackend({ recent: [summary("R1", "GEN", "T1")] });
    renderHub();
    const row = await screen.findByTestId("lane-row-top");
    expect(within(row).getAllByTitle("Level 18").length).toBe(2);
  });
});

/* ── PP-IA2 P0: sides follow the game's own team identity ───────────────── */

describe("PP-IA2 · swapped schedule sides (real LES UCAM vs MKF G1)", () => {
  const d = LES_G1.detail;
  function install(gameOver: Record<string, unknown> = {}, record: Record<string, unknown> = {}) {
    const game = { ...d.game, ...gameOver };
    installBackend({
      recent: [game],
      players: LES_G1.players,
      teamState: () => d.team_state,
      record: () => ({ result: d.result, series: d.series, ...record }),
    });
  }

  it("puts MKF's name over MKF's numbers and players, and marks MKF the winner", async () => {
    install();
    renderHub();
    await screen.findByTestId("match-summary");
    await waitFor(() => expect(screen.getByTestId("team-blue").textContent).toMatch(/Winner/));
    expect(screen.getByTestId("team-blue").textContent).toMatch(/MKF/);
    expect(screen.getByTestId("team-red").textContent).toMatch(/UCAM/);
    const blueKills = d.team_state.blue.kills;
    const redKills = d.team_state.red.kills;
    expect(within(matchCenter()).getByLabelText(`Kills ${blueKills} to ${redKills}`)).toBeTruthy();
    // The blue lane side is an MKF player.
    const top = await screen.findByTestId("lane-row-top");
    const blueTop = LES_G1.players.find((p) => p.side === "blue" && p.role === "top")!;
    expect(top.textContent).toContain(blueTop.resolved_player_name ?? blueTop.summoner_name);
    expect(screen.queryByTestId("sides-unverified")).toBeNull();
  });

  it("says so, and marks no winning side, when the sides could not be verified", async () => {
    install(
      { sides: { source: "schedule", verified: false, corrected: false } },
      { result: { ...d.result, winner_side: null } },
    );
    renderHub();
    expect(await screen.findByTestId("sides-unverified")).toBeTruthy();
    await screen.findByTestId("result-note");
    expect(screen.getByTestId("team-blue").textContent).not.toMatch(/Winner/);
    expect(screen.getByTestId("team-red").textContent).not.toMatch(/Winner/);
  });
});
