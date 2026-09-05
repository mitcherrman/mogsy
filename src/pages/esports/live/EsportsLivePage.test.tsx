/**
 * /lol/pro-play/live — the LIVE1 match centre as a PUBLIC Pro Play surface.
 *
 * These tests cover what surfacing the page changed or now depends on: that it
 * identifies itself as Pro Play and can get back there, that the live/recent
 * split behaves when nothing is on, that a match renders from the real payload
 * shape, and that one missing field never takes the page down. The rendering
 * internals the page already had (insights maths, competition lines) are
 * covered by `insights.test.ts` and `lib.matchContext.test.ts`.
 *
 * Fixtures are shaped from real production responses captured from
 * `/api/live-esports/*` on 2026-09-04, not invented.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EsportsLivePage from "./EsportsLivePage";
import {
  LEGACY_ESPORTS_LIVE_ROUTE,
  PRO_PLAY_LIVE_ARCHIVE_ROUTE,
  PRO_PLAY_LIVE_ROUTE,
  PRO_PLAY_ROUTE,
} from "@/lib/pro-play/routes";

const FINAL_FRESHNESS = {
  label: "final" as const,
  seconds_since_success: 12558,
  source_frame_ts: "2026-09-04T17:45:50.080Z",
  last_attempt_at: "2026-09-04T17:57:00.743Z",
  last_success_at: "2026-09-04T17:57:00.743Z",
};

const LIVE_FRESHNESS = {
  label: "live_fresh" as const,
  seconds_since_success: 8,
  source_frame_ts: "2026-09-04T17:45:50.080Z",
  last_attempt_at: "2026-09-04T17:45:52.000Z",
  last_success_at: "2026-09-04T17:45:52.000Z",
};

function summary(over: Record<string, unknown> = {}) {
  return {
    game_id: "116996464901571353",
    match_id: "116996464901571350",
    league: { slug: "hitpoint_masters", name: "Hitpoint Masters" },
    block_name: "Week 4",
    competition: {
      league: {
        slug: "hitpoint_masters",
        name: "Hitpoint Masters",
        region: "EMEA",
        scope: "domestic",
      },
      tournament: {
        id: "t1",
        name: "Summer 2026",
        slug: null,
        season_name: null,
        split_name: "tier_2_leagues_2026",
      },
      stage: {
        name: null,
        slug: null,
        section_name: null,
        section_type: null,
        round_name: null,
        block_name: "Week 4",
      },
    },
    best_of: 3,
    game_number: 3,
    teams: {
      blue: {
        name: "eSuba",
        code: "ESB",
        esports_team_id: "102787200129022886",
        resolved_page: "eSuba",
        series_wins: 1,
      },
      red: {
        name: "Bigger Gaming",
        code: "BG",
        esports_team_id: "116395381365000444",
        resolved_page: null,
        series_wins: 1,
      },
    },
    patch_version: "16.17.810.4348",
    game_state: "finished",
    availability: "finished",
    availability_detail: null,
    scheduled_start: "2026-09-04T16:30:00Z",
    first_frame_ts: "2026-09-04T17:45:50.080Z",
    freshness: FINAL_FRESHNESS,
    ...over,
  };
}

const DETAIL = {
  enabled: true,
  generated_at: "2026-09-04T21:26:00.000Z",
  game: summary(),
  team_state: {
    blue: {
      esports_team_id: "102787200129022886",
      kills: 29,
      total_gold: 68453,
      towers: 9,
      inhibitors: 1,
      barons: 1,
      dragons: ["mountain", "cloud", "cloud"],
      frame_ts: "2026-09-04T17:45:50.080Z",
    },
    red: {
      esports_team_id: "116395381365000444",
      kills: 16,
      total_gold: 54419,
      towers: 1,
      inhibitors: 0,
      barons: 0,
      dragons: ["hextech", "cloud"],
      frame_ts: "2026-09-04T17:45:50.080Z",
    },
  },
  recent_events: [],
};

const PLAYERS = {
  enabled: true,
  generated_at: "2026-09-04T21:26:00.000Z",
  game_id: "116996464901571353",
  availability: "finished",
  freshness: FINAL_FRESHNESS,
  identity_resolution: { resolved: 2, total: 2, rate: 1 },
  players: [
    {
      participant_id: 1,
      side: "blue",
      esports_player_id: "113866836856867115",
      summoner_name: "ESB Darkeszy",
      champion_id: "Ambessa",
      role: "top",
      resolved_player_page: "Darkeszy",
      resolved_player_name: "Darkeszy",
      resolution_method: "exact",
      resolved_champion_name: "Ambessa",
      level: 18,
      kills: 7,
      deaths: 2,
      assists: 8,
      total_gold: 13746,
      creep_score: 269,
      items: [6692, 6333, 3363],
      abilities: ["Q", "W", "E"],
    },
    {
      participant_id: 6,
      side: "red",
      esports_player_id: "2",
      summoner_name: "BG Vodin",
      champion_id: "Camille",
      role: "top",
      resolved_player_page: "Vodin",
      resolved_player_name: "Vodin",
      resolution_method: "exact",
      resolved_champion_name: "Camille",
      level: 17,
      kills: 2,
      deaths: 6,
      assists: 3,
      total_gold: 10328,
      creep_score: 229,
      items: [3161],
      abilities: ["Q"],
    },
  ],
};

const GOLD = {
  enabled: true,
  generated_at: "2026-09-04T21:26:00.000Z",
  game_id: "116996464901571353",
  availability: "finished",
  freshness: FINAL_FRESHNESS,
  retention: "full",
  points: 1,
  downsampled: false,
  series: [
    { ts: "2026-09-04T17:45:50.080Z", t: 0, blue: 68453, red: 54419, diff: 14034 },
  ],
};

type FeedShape = { enabled?: boolean; live?: unknown[]; recent?: unknown[] };

/** A scripted `/api/live-esports/*`. `feed: null` means the service is down. */
function installBackend(feed: FeedShape | null) {
  const fetchMock = vi.fn(async (url: string) => {
    const path = String(url);
    const ok = (body: unknown) =>
      ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    if (path.includes("/live-esports/live")) {
      if (feed === null) throw new Error("network down");
      return ok({
        enabled: feed.enabled ?? true,
        generated_at: "2026-09-04T21:26:00.000Z",
        live: feed.live ?? [],
        recent: feed.recent ?? [],
        limits: { live: 12, recent: 6 },
      });
    }
    if (path.includes("/players")) return ok(PLAYERS);
    if (path.includes("/gold")) return ok(GOLD);
    if (path.includes("/insights")) return ok({ coverage: {}, gold: {}, objectives: [], players: {} });
    if (path.includes("/live-esports/games/")) return ok(DETAIL);
    // Champion asset manifest and anything else the page reaches for.
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EsportsLivePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("EsportsLivePage as a Pro Play surface", () => {
  it("identifies itself as Pro Play and links back to the hub", async () => {
    installBackend({ recent: [summary()] });
    renderPage();
    await waitFor(() => expect(screen.getByText("Pro Play")).toBeTruthy());
    expect(
      screen.getByRole("link", { name: /Back to Pro Play/i }).getAttribute("href"),
    ).toBe(PRO_PLAY_ROUTE);
  });

  it("titles the page Live & Recent Matches, as the hub tile promises", async () => {
    installBackend({ recent: [summary()] });
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: /Live & Recent Matches/i }),
      ).toBeTruthy(),
    );
  });

  it("keeps the shell — and the way out — when the backend is unreachable", async () => {
    // A dead feed must not strand someone on a page with no navigation.
    installBackend(null);
    renderPage();
    await waitFor(() => expect(screen.getByText(/Can't reach the live feed/i)).toBeTruthy());
    expect(screen.getByRole("link", { name: /Back to Pro Play/i })).toBeTruthy();
  });
});

describe("live / recent discovery", () => {
  it("falls back to recent games and says so when nothing is live", async () => {
    // The common case: the poller is healthy, no competition is playing.
    installBackend({ live: [], recent: [summary()] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Nothing is live at the moment/i)).toBeTruthy(),
    );
    expect(screen.getAllByText(/eSuba/).length).toBeGreaterThan(0);
  });

  it("does not say 'nothing is live' when a game is live", async () => {
    installBackend({
      live: [summary({ availability: "live", game_state: "inProgress", freshness: LIVE_FRESHNESS })],
      recent: [],
    });
    renderPage();
    await waitFor(() => expect(screen.getAllByText(/eSuba/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Nothing is live at the moment/i)).toBeNull();
    expect(screen.getAllByText(/^LIVE$/i).length).toBeGreaterThan(0);
  });

  it("shows an empty state rather than a broken board when there is neither", async () => {
    installBackend({ live: [], recent: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/No matches right now/i)).toBeTruthy());
  });

  it("warns when ingestion is switched off", async () => {
    installBackend({ enabled: false, live: [], recent: [summary()] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/Live tracking is paused/i)).toBeTruthy());
  });
});

describe("match rendering from the production payload shape", () => {
  it("renders the match selector, one card per game", async () => {
    installBackend({
      recent: [summary(), summary({ game_id: "g2", game_number: 2 })],
    });
    renderPage();
    // Selector cards title themselves with team CODES ("ESB vs BG"); the
    // full names appear on the scoreboard panels below.
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /ESB vs BG/ }).length).toBe(2),
    );
  });

  it("renders team objective totals from team_state", async () => {
    installBackend({ recent: [summary()] });
    renderPage();
    // Kills, towers and barons for both sides come off the same payload the
    // production API returns; the page must show them, not a placeholder.
    await waitFor(() => expect(screen.getAllByText("29").length).toBeGreaterThan(0));
    expect(screen.getAllByText("16").length).toBeGreaterThan(0);
  });

  it("renders a player row with champion, KDA and CS", async () => {
    installBackend({ recent: [summary()] });
    renderPage();
    await waitFor(() => expect(screen.getAllByText(/Darkeszy/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Ambessa/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/7\s*\/\s*2\s*\/\s*8/).length).toBeGreaterThan(0);
  });

  it("shows the competition context — league, split, patch, game number", async () => {
    installBackend({ recent: [summary()] });
    renderPage();
    await waitFor(() => expect(screen.getAllByText(/Hitpoint Masters/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Game 3/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/16\.17/).length).toBeGreaterThan(0);
  });
});

describe("degrading on incomplete data", () => {
  it("renders a game whose competition metadata was never synced", async () => {
    // Real production condition: tournament metadata is demand-driven, so a
    // finished game from a league that is not currently playing has none.
    installBackend({
      recent: [summary({ competition: null, patch_version: null, scheduled_start: null })],
    });
    renderPage();
    await waitFor(() => expect(screen.getAllByText(/eSuba/).length).toBeGreaterThan(0));
  });

  it("renders a game with no player telemetry at all", async () => {
    const fetchMock = installBackend({ recent: [summary()] });
    fetchMock.mockImplementation(async (url: string) => {
      const path = String(url);
      const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as unknown as Response;
      if (path.includes("/live-esports/live"))
        return ok({
          enabled: true,
          generated_at: "x",
          live: [],
          recent: [summary()],
          limits: { live: 12, recent: 6 },
        });
      if (path.includes("/players"))
        return ok({ ...PLAYERS, players: [], identity_resolution: { resolved: 0, total: 0, rate: null } });
      if (path.includes("/gold")) return ok({ ...GOLD, series: [], points: 0 });
      if (path.includes("/live-esports/games/")) return ok({ ...DETAIL, team_state: {} });
      return ok({});
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/No player telemetry was published/i)).toBeTruthy(),
    );
  });

  it("marks a live game whose telemetry has stopped as stale", async () => {
    installBackend({
      live: [],
      recent: [
        summary({
          availability: "live",
          game_state: "inProgress",
          freshness: { ...FINAL_FRESHNESS, label: "stale", seconds_since_success: 9000 },
        }),
      ],
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/telemetry has stopped updating/i)).toBeTruthy(),
    );
  });
});

describe("the pre-Pro-Play URL", () => {
  it("redirects /esports/live to the canonical match-centre route", async () => {
    // The match centre lived here for months and the admin directory still
    // lists the path. Moving it into Pro Play must not 404 anyone's bookmark.
    // This mirrors App.tsx's wiring for exactly these two routes.
    installBackend({ live: [], recent: [] });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[LEGACY_ESPORTS_LIVE_ROUTE]}>
          <Routes>
            <Route
              path={LEGACY_ESPORTS_LIVE_ROUTE}
              element={<Navigate to={PRO_PLAY_LIVE_ROUTE} replace />}
            />
            <Route path={PRO_PLAY_LIVE_ROUTE} element={<EsportsLivePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: /Live & Recent Matches/i }),
      ).toBeTruthy(),
    );
  });
});

/**
 * Archive integration: the match centre is the ONE viewer, so an archived game
 * has to render here rather than in a second renderer. `?game=<id>` is how it
 * arrives — from an archive row, a shared link, or a refresh.
 */
describe("opening an archived game in this viewer", () => {
  /** A game that is in the store but NOT in the bounded live/recent feed. */
  const ARCHIVED_ID = "116769742220520950";

  function renderAt(path: string) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={PRO_PLAY_LIVE_ROUTE} element={<EsportsLivePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("offers a way into the archive from the live page", async () => {
    installBackend({ recent: [summary()] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Browse archive/i })).toBeTruthy(),
    );
    expect(
      screen.getByRole("link", { name: /Browse archive/i }).getAttribute("href"),
    ).toBe(PRO_PLAY_LIVE_ARCHIVE_ROUTE);
  });

  it("offers the archive even when nothing is live or recent", async () => {
    // The empty feed is the NORMAL state for most of the day, and it is
    // exactly when the archive is the most useful thing on the page.
    installBackend({ live: [], recent: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/No matches right now/i)).toBeTruthy());
    expect(screen.getByRole("link", { name: /Browse archive/i })).toBeTruthy();
  });

  it("renders a deep-linked game that the feed does not contain", async () => {
    // The feed is empty; the game exists only in the store. Before this, the
    // page's auto-follow reset the selection to `selectable[0]` — null — and
    // the deep link rendered "No matches right now".
    const fetchMock = installBackend({ live: [], recent: [] });
    fetchMock.mockImplementation(async (url: string) => {
      const path = String(url);
      const ok = (b: unknown) =>
        ({ ok: true, status: 200, json: async () => b }) as unknown as Response;
      if (path.includes("/live-esports/live")) {
        return ok({
          enabled: true, generated_at: "2026-09-05T08:00:00.000Z",
          live: [], recent: [], limits: { live: 12, recent: 6 },
        });
      }
      if (path.includes("/players")) return ok(PLAYERS);
      if (path.includes("/gold")) return ok(GOLD);
      if (path.includes("/insights")) return ok({ coverage: {}, gold: {}, objectives: [], players: {} });
      if (path.includes(`/live-esports/games/${ARCHIVED_ID}`)) {
        return ok({ ...DETAIL, game: { ...DETAIL.game, game_id: ARCHIVED_ID } });
      }
      return ok({});
    });
    renderAt(`${PRO_PLAY_LIVE_ROUTE}?game=${ARCHIVED_ID}`);
    await waitFor(() =>
      expect(screen.queryByText(/No matches right now/i)).toBeNull(),
    );
    // The scoreboard the live page renders for everything else.
    await waitFor(() => expect(screen.getByText(/Players/i)).toBeTruthy());
    expect(fetchMock.mock.calls.some(([u]) =>
      String(u).includes(`/live-esports/games/${ARCHIVED_ID}`))).toBe(true);
  });

  it("says so plainly when a deep link names a game that does not exist", async () => {
    const fetchMock = installBackend({ live: [], recent: [] });
    fetchMock.mockImplementation(async (url: string) => {
      const path = String(url);
      const ok = (b: unknown) =>
        ({ ok: true, status: 200, json: async () => b }) as unknown as Response;
      if (path.includes("/live-esports/live")) {
        return ok({
          enabled: true, generated_at: "2026-09-05T08:00:00.000Z",
          live: [], recent: [], limits: { live: 12, recent: 6 },
        });
      }
      if (path.includes("/live-esports/games/")) throw new Error("404");
      return ok({});
    });
    renderAt(`${PRO_PLAY_LIVE_ROUTE}?game=does-not-exist`);
    await waitFor(() =>
      expect(screen.getByText(/Couldn't load that match/i)).toBeTruthy(),
    );
    expect(screen.getByRole("link", { name: /Browse archive/i })).toBeTruthy();
  });

  it("does not let the live feed steal a game someone explicitly opened", async () => {
    // A live game arriving must not replace what the reader chose to look at.
    installBackend({ live: [summary({ game_id: "live-one" })], recent: [] });
    renderAt(`${PRO_PLAY_LIVE_ROUTE}?game=116996464901571353`);
    await waitFor(() => expect(screen.getByText(/Players/i)).toBeTruthy());
    // The pinned id is what the per-game reads asked for.
    const asked = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      .map(([u]) => String(u))
      .filter((u) => u.includes("/players"));
    expect(asked.every((u) => u.includes("116996464901571353"))).toBe(true);
  });

  it("still follows the action when nobody has pinned anything", async () => {
    installBackend({ live: [summary({ game_id: "the-live-one" })], recent: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/Players/i)).toBeTruthy());
    const asked = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      .map(([u]) => String(u))
      .filter((u) => u.includes("/players"));
    expect(asked.some((u) => u.includes("the-live-one"))).toBe(true);
  });
});
