/**
 * THE CANONICAL PUBLIC CHAMPION PROFILE.
 *
 * Two things are specific to Champion and are what most of this file pins:
 *
 * 1. THE POPULATION UNIT IS **PICKS**, NOT GAMES. A champion picked by both
 *    teams in one game is two picks and one game, and `bans`/`presence` are
 *    DISTINCT GAMES while the rates are over picks. Calling the coverage
 *    denominator "games" would be wrong by a different amount for every
 *    champion, so the noun itself is asserted.
 *
 * 2. THE SLUG IS THE ONE CONVERSION in the whole identity vocabulary. The
 *    route key is a name ("Lee Sin"), the graph entity id is a slug
 *    ("lee-sin"), and an inlined second slugifier on this page really did
 *    404 for 8 apostrophe champions.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProPlayChampionProfile from "./ProPlayChampionProfile";
import { statsExplorerUrl } from "@/lib/pro-play/entityStats";
import { graphEntityId, graphUrl } from "@/lib/pro-play/graphHandoff";
import { championSlug } from "@/lib/league-docs/api";
import { proPlayProfileUrl } from "@/lib/pro-play/routes";

vi.mock("@/components/SEOHead", () => ({ default: () => null }));

const requests: { url: string; init?: RequestInit }[] = [];
const KEY = "Azir";

function statsResponse(row: Record<string, unknown>) {
  return {
    schema_version: 1, view: "champions", rows: [row],
    page: 1, page_size: 1, total_rows: 1, total_pages: 1,
    sort: "picks", dir: "desc",
    filters: { year: null, league: null, patch: null, role: null, player: null, team: null, champion: null, min_games: 0 },
    aggregates: {},
    coverage: { games: 0, stat_backed_games: 0, missing_stat_games: 0, stat_coverage_pct: null },
  };
}

const FULL_ROW = {
  champion: KEY,
  picks: 913,
  picked_games: 880,
  wins: 470,
  losses: 443,
  win_rate: 0.5148,
  stat_backed_games: 842,
  kills: 3100, deaths: 2400, assists: 5400,
  kda: 3.54, cs_per_min: 9.31, gold_per_min: 421, damage_per_min: 812,
  bans: 3959,
  presence_games: 4700,
  draft_games: 6032,
  presence_rate: 0.7792,
};

/** Pre-2014: canonical picks and a real record, no statistics, and NO draft
 *  coverage at all — so presence is null, not zero. */
const SPARSE_ROW = {
  champion: KEY,
  picks: 46, picked_games: 46, wins: 24, losses: 22, win_rate: 0.5217,
  stat_backed_games: 0,
  kills: null, deaths: null, assists: null,
  kda: null, cs_per_min: null, gold_per_min: null, damage_per_min: null,
  bans: 0, presence_games: 0, draft_games: 0, presence_rate: null,
};

function draftRow(games: number) {
  return {
    games_in_scope: games, picks: 120, wins: 70, losses: 50, win_rate: 0.583,
    ban_events: 300, games_banned_in: 280, pick_rate: 0.2, ban_rate: 0.35,
    presence: 0.55, participation: "participated",
  };
}

function championPayload(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: "pro_profile_v1",
    entity: { kind: "champion", key: KEY, display_name: KEY },
    identity: { in_registry: true, registry_available: true },
    draft: { current_2026: draftRow(600), all_time: draftRow(6000) },
    draft_note: "Presence is the share of games in the scope where this champion was picked or banned.",
    comparison: {
      contract_version: "pro_comparison_v1",
      entity: { kind: "champion", id: KEY, display_name: KEY },
      league_filter: "MAJOR_PRO",
      scope_order: ["current_2026", "all_time"],
      scopes: {
        current_2026: {
          scope: { scope_id: "current_2026", kind: "season", label: "2026", bounded: true },
          participation: "participated", entity_games_in_scope: 120,
          tournaments_in_scope: ["LCK 2026"], leagues_in_scope: ["LoL Champions Korea"],
          stats: {
            games: 120, wins: 70, losses: 50, win_rate: 0.583,
            first_played_at: null, last_played_at: null,
            distinct_players: 40, distinct_teams: 18,
            top_players: [{ key: "Faker", games: 20, wins: 14, losses: 6, win_rate: 0.7, first_played_at: null, last_played_at: null }],
            top_teams: [{ key: "T1", games: 22, wins: 15, losses: 7, win_rate: 0.68, first_played_at: null, last_played_at: null }],
          },
        },
        all_time: {
          scope: { scope_id: "all_time", kind: "all_time", label: "All Time", bounded: false },
          participation: "participated", entity_games_in_scope: 880,
          tournaments_in_scope: [], leagues_in_scope: [],
          stats: {
            games: 880, wins: 460, losses: 420, win_rate: 0.523,
            first_played_at: null, last_played_at: null,
            distinct_players: 300, distinct_teams: 120,
            top_players: [], top_teams: [],
          },
        },
      },
    },
    comparison_error: null,
    ...overrides,
  };
}

function installFetch(handlers: Array<[(url: string) => boolean, { status?: number; body: unknown }]>) {
  requests.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    const match = handlers.find(([test]) => test(url));
    const handler = match?.[1] ?? { status: 404, body: { detail: "Not found." } };
    const status = handler.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => handler.body } as Response;
  }));
}

const isProfile = (u: string) => u.includes("/api/pro-play/research/champion/");
const isStats = (u: string) => u.includes("/api/pro-play/stats/champions");

function renderProfile(key = KEY) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[proPlayProfileUrl("champion", key)]}>
        <Routes>
          <Route path="/lol/pro-play/champion/:key" element={<ProPlayChampionProfile />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function ok(profile: unknown = championPayload(), row: Record<string, unknown> = FULL_ROW) {
  installFetch([[isProfile, { body: profile }], [isStats, { body: statsResponse(row) }]]);
}

const SRC = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");

afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------

describe("publicization", () => {
  it("carries no AdminAuthGate and no noindex", () => {
    const src = SRC("pages/pro-play/ProPlayChampionProfile.tsx");
    expect(src).not.toContain("AdminAuthGate");
    expect(src).not.toMatch(/\bnoindex\b/);
  });

  it("requests the profile with no credentials", async () => {
    ok();
    renderProfile();
    await screen.findByRole("heading", { name: KEY });
    expect(requests.find((r) => isProfile(r.url))?.init?.headers).toBeUndefined();
  });

  it("shows a clean public not-found for an unknown champion", async () => {
    installFetch([[isProfile, {
      status: 404,
      body: { detail: "champion 'Nope' has no canonical games under league_filter='MAJOR_PRO'" },
    }]]);
    renderProfile("Nope");
    const err = await screen.findByTestId("research-error");
    expect(err).toHaveTextContent(/No professional record/i);
    expect(err.textContent).not.toMatch(/admin|sign in|403|league_filter|MAJOR_PRO/i);
  });
});

describe("picks are the population unit", () => {
  it("counts coverage in PICKS, never generic games", async () => {
    ok();
    renderProfile();
    const panel = await screen.findByTestId("performance-panel");
    // 842 of 913 PICKS -- the word is the assertion.
    expect(panel).toHaveTextContent(/842 of 913 picks/);
    expect(panel).not.toHaveTextContent(/842 of 913 games/);
  });

  it("uses picks, not picked_games, as the coverage denominator", async () => {
    // picks 913 vs picked_games 880: the rates are over picks, so the
    // coverage line must describe the same population.
    ok();
    renderProfile();
    const panel = await screen.findByTestId("performance-panel");
    expect(panel).toHaveTextContent(/913 picks/);
    expect(panel).not.toHaveTextContent(/880 picks/);
  });

  it("says 'pick' in the singular when nothing carries statistics", async () => {
    ok(championPayload(), SPARSE_ROW);
    renderProfile();
    const panel = await screen.findByTestId("performance-panel");
    expect(panel).toHaveTextContent(/No pick in this career carries detailed statistics/);
    expect(panel).toHaveTextContent(/covers all 46 picks/);
  });
});

describe("statistics semantics", () => {
  it("reuses the public champions endpoint filtered to this champion", async () => {
    ok();
    renderProfile();
    await screen.findByTestId("performance-panel");
    const params = new URLSearchParams(requests.find((r) => isStats(r.url))!.url.split("?")[1]);
    expect(params.get("champion")).toBe(KEY);
    expect(params.get("year")).toBeNull();
  });

  it("renders picks, canonical W-L and win rate", async () => {
    ok();
    renderProfile();
    const p = await screen.findByTestId("performance-panel");
    expect(within(p).getByTestId("metric-Picks")).toHaveTextContent("913");
    expect(within(p).getByTestId("metric-W-L")).toHaveTextContent("470–443");
    expect(within(p).getByTestId("metric-Win %")).toHaveTextContent("51.5%");
  });

  it("renders bans and presence from the served values", async () => {
    ok();
    renderProfile();
    const p = await screen.findByTestId("performance-panel");
    expect(within(p).getByTestId("metric-Bans")).toHaveTextContent("3,959");
    expect(within(p).getByTestId("metric-Presence")).toHaveTextContent("77.9%");
  });

  it("never shows presence above 100%", async () => {
    // The bug section J caught: a numerator counting picks from games with no
    // draft data reported 1567% for 2013 Thresh. The value is served, not
    // recomputed, but the rendering must not be able to exceed 1 either.
    ok(championPayload(), { ...FULL_ROW, presence_games: 4700, draft_games: 6032, presence_rate: 1 });
    renderProfile();
    const p = await screen.findByTestId("performance-panel");
    const shown = within(p).getByTestId("metric-Presence").textContent ?? "";
    expect(Number(shown.replace("%", ""))).toBeLessThanOrEqual(100);
  });

  it("renders per-minute metrics and KDA", async () => {
    ok();
    renderProfile();
    const p = await screen.findByTestId("performance-panel");
    expect(within(p).getByTestId("metric-KDA")).toHaveTextContent("3.54");
    expect(within(p).getByTestId("metric-CS/min")).toHaveTextContent("9.31");
    expect(within(p).getByTestId("metric-Gold/min")).toHaveTextContent("421");
    expect(within(p).getByTestId("metric-Dmg/min")).toHaveTextContent("812");
  });

  it("renders em dashes — never zero — where nothing is recorded", async () => {
    ok(championPayload(), SPARSE_ROW);
    renderProfile();
    const p = await screen.findByTestId("performance-panel");
    expect(within(p).getByTestId("metric-W-L")).toHaveTextContent("24–22");
    for (const label of ["KDA", "CS/min", "Gold/min", "Dmg/min", "Presence"]) {
      expect(within(p).getByTestId(`metric-${label}`)).toHaveTextContent("—");
    }
    // Bans is a real zero here -- it WAS drafted in zero games -- so it must
    // NOT be an em dash. Absence and zero are different facts.
    expect(within(p).getByTestId("metric-Bans")).toHaveTextContent("0");
  });

  it("labels its scope apart from the curated draft record", async () => {
    ok();
    renderProfile();
    expect(await screen.findByTestId("performance-scope")).toHaveTextContent("All seasons");
    expect(await screen.findByText("Career Draft Record")).toBeInTheDocument();
    expect(await screen.findByText("All-Competition Performance")).toBeInTheDocument();
    expect(await screen.findByText(/curated major leagues only/i)).toBeInTheDocument();
  });

  it("keeps top players and top teams, which come from the profile contract", async () => {
    ok();
    renderProfile();
    expect(await screen.findByText("Faker")).toBeInTheDocument();
    expect(await screen.findByText("T1")).toBeInTheDocument();
  });

  it("survives a statistics failure without taking the profile down", async () => {
    installFetch([[isProfile, { body: championPayload() }], [isStats, { status: 500, body: {} }]]);
    renderProfile();
    expect(await screen.findByRole("heading", { name: KEY })).toBeInTheDocument();
    expect(await screen.findByText("Faker")).toBeInTheDocument();
  });
});

describe("the slug conversion", () => {
  it("uses the canonical championSlug for Lee Sin", () => {
    expect(championSlug("Lee Sin")).toBe("lee-sin");
    expect(graphEntityId("champion", "Lee Sin")).toBe("lee-sin");
  });

  it("strips apostrophes the way the corpus does", () => {
    // The 8 champions an inlined slugifier got wrong.
    for (const [name, slug] of [
      ["Bel'Veth", "belveth"], ["Cho'Gath", "chogath"], ["K'Sante", "ksante"],
      ["Kai'Sa", "kaisa"], ["Kha'Zix", "khazix"], ["Kog'Maw", "kogmaw"],
      ["Rek'Sai", "reksai"], ["Vel'Koz", "velkoz"],
    ] as const) {
      expect(championSlug(name)).toBe(slug);
    }
  });

  it("carries no second slugifier on the page", () => {
    const src = SRC("pages/pro-play/ProPlayChampionProfile.tsx");
    expect(src).toContain("championSlug(");
    // The inlined one that 404'd for apostrophe champions.
    expect(src).not.toMatch(/toLowerCase\(\)\.replace\(/);
  });

  it("builds both graph URLs from the slug, not the key", async () => {
    ok(championPayload({ entity: { kind: "champion", key: "Lee Sin", display_name: "Lee Sin" } }));
    renderProfile("Lee Sin");
    const players = (await screen.findByText("Graph top players")).closest("a")!.getAttribute("href")!;
    expect(new URLSearchParams(players.split("?")[1]).get("e")).toBe("lee-sin");
  });
});

describe("navigation", () => {
  it("links to the champion-filtered public stats table", async () => {
    ok();
    renderProfile();
    const link = await screen.findByText("View in Pro Stats");
    expect(link.closest("a")).toHaveAttribute("href", statsExplorerUrl("champions", KEY));
    expect(statsExplorerUrl("champions", KEY)).toContain("view=champions");
    // The table filters by champion KEY, not slug.
    expect(new URLSearchParams(statsExplorerUrl("champions", KEY).split("?")[1]).get("champion")).toBe(KEY);
  });

  it("offers Champion -> Players with no fabricated scope", async () => {
    ok();
    renderProfile();
    const href = (await screen.findByText("Graph top players")).closest("a")!.getAttribute("href")!;
    const params = new URLSearchParams(href.split("?")[1]);
    expect(href.startsWith("/lol/pro-play/graphs")).toBe(true);
    expect(params.get("focus")).toBe("champion");
    expect(params.get("vs")).toBe("players");
    expect(params.get("e")).toBe(championSlug(KEY));
    for (const k of ["from", "to", "league", "patch"]) expect(params.get(k)).toBeNull();
  });

  it("offers Champion -> Teams", async () => {
    ok();
    renderProfile();
    const href = (await screen.findByText("Graph top teams")).closest("a")!.getAttribute("href")!;
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("focus")).toBe("champion");
    expect(params.get("vs")).toBe("teams");
    expect(params.get("e")).toBe(championSlug(KEY));
  });

  it("uses the same graph URL builder the shipped hand-off uses", () => {
    expect(graphUrl("champion", "players", "lee-sin")).toBe(
      "/lol/pro-play/graphs?focus=champion&vs=players&e=lee-sin",
    );
  });

  it("links to the Docs reference history with the exact slug", async () => {
    ok();
    renderProfile();
    const link = await screen.findByText("Open reference history");
    expect(link.closest("a")).toHaveAttribute(
      "href",
      `/lol/docs/pro/champions/${championSlug(KEY)}`,
    );
  });

  it("keeps the abilities link, a separate authority", async () => {
    ok();
    renderProfile();
    const link = await screen.findByText(/Champion abilities/);
    expect(link.closest("a")).toHaveAttribute("href", `/lol/docs/champions/${championSlug(KEY)}`);
  });

  it("offers NO Matchup Explorer action", async () => {
    // There is no champion-only entry point: `champion_a` is meaningful only
    // inside a configured lane matchup. Not a disabled teaser either.
    ok();
    renderProfile();
    await screen.findByTestId("performance-panel");
    expect(screen.queryByText(/matchup/i)).toBeNull();
  });

  it("does NOT embed the Docs yearly import table", async () => {
    // It is a DIFFERENT corpus (Azir 2016: 902 picks there, 807 here), so
    // embedding it would print two contradicting pick counts on one page.
    ok();
    renderProfile();
    await screen.findByTestId("performance-panel");
    expect(screen.queryByText(/imported rows by year|import status/i)).toBeNull();
  });

  it("the Stats Explorer champion cell targets the canonical profile", () => {
    const explorer = SRC("components/pro-play/ProStatsExplorer.tsx");
    expect(explorer).toContain('proPlayProfileUrl("champion", name)');
    // All three identity columns now link, through one helper.
    expect(explorer).toContain('proPlayProfileUrl("player", name)');
    expect(explorer).toContain('proPlayProfileUrl("team", name)');
  });

  it("Search resolves a champion to the same canonical helper", () => {
    expect(proPlayProfileUrl("champion", "Lee Sin")).toBe("/lol/pro-play/champion/Lee%20Sin");
    expect(SRC("pages/pro-play/ProPlaySearch.tsx")).toContain("profilePath");
  });
});
