/**
 * /lol/pro-play/live/archive — browsing the stored match catalogue.
 *
 * What these cover is what the archive is FOR: that a reader can reach games
 * the bounded live feed can never show, narrow them without the frontend
 * knowing a single league or team name up front, page without losing or
 * repeating a match, and be told honestly what telemetry a game actually has
 * before opening it.
 *
 * Fixtures are shaped from real `/api/live-esports/history` responses captured
 * against production-shaped data on 2026-09-05, not invented.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import ArchivePage from "./ArchivePage";
import {
  PRO_PLAY_LIVE_ARCHIVE_ROUTE,
  PRO_PLAY_LIVE_ROUTE,
  PRO_PLAY_ROUTE,
} from "@/lib/pro-play/routes";

/* Radix opens on pointerdown/keydown rather than click, and jsdom implements
   neither pointer capture nor scrollIntoView — the same shim the repo's other
   Radix tests use. */
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

/** Open a Select and choose an option by its visible label. */
async function choose(triggerLabel: string | RegExp, optionLabel: RegExp) {
  fireEvent.keyDown(screen.getByLabelText(triggerLabel), { key: "Enter" });
  const option = await screen.findByRole("option", { name: optionLabel });
  fireEvent.click(option);
}

function game(over: Record<string, unknown> = {}) {
  return {
    game_id: "115548681803406242",
    match_id: "115548681803406239",
    scheduled_start: "2026-08-30T16:00:00Z",
    sort_ts: "2026-08-30T16:00:00Z",
    league: { slug: "lec", name: "LEC", region: "EMEA", scope: "domestic" },
    tournament: {
      id: "115548681802226458",
      name: "Summer 2026",
      slug: "lec_summer_2026",
      season_name: "lolesports_2026",
      split_name: "Summer",
    },
    stage: {
      name: "Playoffs",
      slug: "playoffs",
      section_name: "Playoffs",
      section_type: "bracket",
      round_name: "Finals",
      block_name: "Playoffs",
    },
    best_of: 5,
    game_number: 3,
    teams: {
      blue: { name: "G2 Esports", code: "G2", esports_team_id: "g2", series_wins: 1, kills: 18 },
      red: { name: "Fnatic", code: "FNC", esports_team_id: "fnc", series_wins: 1, kills: 9 },
    },
    patch_version: "16.17.810.4348",
    availability: "finished",
    final: true,
    winner: null,
    telemetry: { frame_count: 77, event_count: 69, depth: "full", has_timeline: true },
    ...over,
  };
}

const FACETS = {
  enabled: true,
  generated_at: "2026-09-05T08:00:00.000Z",
  leagues: [
    { slug: "lck", name: "LCK", games: 93 },
    { slug: "lec", name: "LEC", games: 53 },
    { slug: "lcp", name: "LCP", games: 39 },
  ],
  tournaments: [
    { id: "t-lck", name: "Split 3 2026", league_slug: "lck", games: 90 },
    { id: "t-lec", name: "Summer 2026", league_slug: "lec", games: 53 },
    { id: "t-lcp", name: "Summer 2026", league_slug: "lcp", games: 39 },
  ],
  teams: [
    { id: "g2", name: "G2 Esports", code: "G2", games: 20 },
    { id: "t1", name: "T1", code: "T1", games: 22 },
    { id: "fnc", name: "Fnatic", code: "FNC", games: 18 },
  ],
  date_range: { from: "2026-08-13", to: "2026-09-05" },
  depth_thresholds: { full_timeline_min_frames: 20 },
};

/** Scripted `/api/live-esports/history*`; records every URL it was asked for. */
function installBackend(pages: Record<string, unknown>[] | null, opts: { total?: number } = {}) {
  const urls: string[] = [];
  let call = 0;
  const fetchMock = vi.fn(async (url: string) => {
    const path = String(url);
    urls.push(path);
    const ok = (body: unknown) =>
      ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    if (path.includes("/history/filters")) return ok(FACETS);
    if (path.includes("/history")) {
      if (pages === null) throw new Error("network down");
      const idx = Math.min(call++, pages.length - 1);
      return ok(pages[idx]);
    }
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, urls };
}

function body(games: unknown[], over: Record<string, unknown> = {}) {
  return {
    enabled: true,
    generated_at: "2026-09-05T08:00:00.000Z",
    games,
    next_cursor: null,
    total: games.length,
    limit: 24,
    filters: {
      league: null, tournament: null, team: null,
      date_from: null, date_to: null, status: null, depth: null,
    },
    ...over,
  };
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{`${loc.pathname}${loc.search}`}</div>;
}

function renderArchive(initial = PRO_PLAY_LIVE_ARCHIVE_ROUTE) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <LocationProbe />
        <Routes>
          <Route path={PRO_PLAY_LIVE_ARCHIVE_ROUTE} element={<ArchivePage />} />
          <Route path={PRO_PLAY_LIVE_ROUTE} element={<div>match centre</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ── the page ─────────────────────────────────────────────────────────────── */

describe("the archive route", () => {
  it("identifies itself as Pro Play and links back to the match centre", async () => {
    installBackend([body([game()])]);
    renderArchive();
    expect(await screen.findByRole("heading", { name: /match archive/i })).toBeTruthy();
    // Both ways back out of the archive, and the Pro Play eyebrow that says
    // which area this belongs to.
    expect(
      screen.getByRole("link", { name: /live & recent/i }).getAttribute("href"),
    ).toBe(PRO_PLAY_LIVE_ROUTE);
    expect(
      screen.getByRole("link", { name: "Pro Play" }).getAttribute("href"),
    ).toBe(PRO_PLAY_ROUTE);
    expect(screen.getAllByText("Pro Play").length).toBe(2);
  });

  it("renders a match row with teams, competition, patch and date", async () => {
    installBackend([body([game()])]);
    renderArchive();
    const row = await screen.findByRole("button", { name: /G2 vs FNC/i });
    const cell = within(row);
    expect(cell.getByText(/LEC/)).toBeTruthy();
    expect(cell.getByText(/Summer 2026/)).toBeTruthy();
    expect(cell.getByText(/Playoffs · Finals/)).toBeTruthy();
    // The four-part upstream version is shown as the patch a reader knows.
    expect(cell.getByText("Patch 16.17")).toBeTruthy();
    expect(cell.getByText(/Bo5 · G3/)).toBeTruthy();
  });

  it("reports the total, not just the page", async () => {
    installBackend([body([game()], { total: 774 })]);
    renderArchive();
    expect(await screen.findByText("774")).toBeTruthy();
    expect(screen.getByText(/matches stored/i)).toBeTruthy();
  });

  it("shows a loading state before the first page arrives", () => {
    installBackend([body([game()])]);
    const { container } = renderArchive();
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });

  it("shows an empty state, with a way out, when filters match nothing", async () => {
    installBackend([body([])]);
    renderArchive(`${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?league=lec`);
    expect(await screen.findByText(/no matches found/i)).toBeTruthy();
    expect(screen.getByText(/try widening the date range/i)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /clear filters/i }).length).toBeGreaterThan(0);
  });

  it("distinguishes an empty store from a too-narrow filter", async () => {
    installBackend([body([])]);
    renderArchive();
    expect(await screen.findByText(/no pro games have been stored yet/i)).toBeTruthy();
  });

  it("keeps the shell and offers a retry when the backend is unreachable", async () => {
    installBackend(null);
    renderArchive();
    expect(await screen.findByText(/can't reach the match archive/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });

  it("says so when ingestion is switched off, without hiding stored games", async () => {
    installBackend([body([game()], { enabled: false })]);
    renderArchive();
    expect(await screen.findByText(/live tracking is paused/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /G2 vs FNC/i })).toBeTruthy();
  });
});

/* ── telemetry richness ───────────────────────────────────────────────────── */

describe("telemetry richness", () => {
  it("labels each band from the backend's own classification", async () => {
    installBackend([
      body([
        game({ game_id: "a", telemetry: { frame_count: 77, event_count: 69, depth: "full", has_timeline: true } }),
        game({ game_id: "b", teams: { blue: { name: "T1", code: "T1", esports_team_id: "t1", series_wins: 0, kills: 3 }, red: { name: "Dplus KIA", code: "DK", esports_team_id: "dk", series_wins: 0, kills: 5 } }, telemetry: { frame_count: 1, event_count: 0, depth: "final_snapshot", has_timeline: false } }),
        game({ game_id: "c", teams: { blue: { name: "Gen.G", code: "GEN", esports_team_id: "gen", series_wins: 0, kills: 0 }, red: { name: "KT Rolster", code: "KT", esports_team_id: "kt", series_wins: 0, kills: 0 } }, telemetry: { frame_count: 0, event_count: 0, depth: "none", has_timeline: false } }),
      ]),
    ]);
    renderArchive();
    expect(await screen.findByText("Full timeline")).toBeTruthy();
    expect(screen.getByText("Final snapshot")).toBeTruthy();
    expect(screen.getByText("No telemetry")).toBeTruthy();
  });

  it("explains what a thin game will actually render, rather than implying a chart", async () => {
    installBackend([
      body([game({ telemetry: { frame_count: 1, event_count: 0, depth: "final_snapshot", has_timeline: false } })]),
    ]);
    renderArchive();
    const badge = await screen.findByText("Final snapshot");
    expect(badge.getAttribute("title")).toMatch(/no chart or timeline/i);
  });

  it("does not hide sparse games — they are listed alongside rich ones", async () => {
    installBackend([
      body([
        game({ game_id: "sparse", telemetry: { frame_count: 1, event_count: 0, depth: "final_snapshot", has_timeline: false } }),
        game({ game_id: "rich", teams: { blue: { name: "T1", code: "T1", esports_team_id: "t1", series_wins: 0, kills: 1 }, red: { name: "Dplus KIA", code: "DK", esports_team_id: "dk", series_wins: 0, kills: 2 } } }),
      ]),
    ]);
    renderArchive();
    expect(await screen.findByRole("button", { name: /G2 vs FNC/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /T1 vs DK/i })).toBeTruthy();
  });
});

/* ── the result ───────────────────────────────────────────────────────────── */

describe("results", () => {
  it("marks the winning side for a screen reader too", async () => {
    installBackend([body([game({ winner: "blue" })])]);
    renderArchive();
    const row = await screen.findByRole("button", { name: /G2 \(winner\) vs FNC/i });
    expect(row).toBeTruthy();
  });

  it("claims no winner when the backend returns none", async () => {
    installBackend([body([game({ winner: null })])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    expect(screen.queryByText(/winner/i)).toBeNull();
  });
});

/* ── filters ──────────────────────────────────────────────────────────────── */

describe("filters", () => {
  it("builds its dropdowns from the backend's facets, hardcoding no league", async () => {
    installBackend([body([game()])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    fireEvent.keyDown(screen.getByLabelText("League"), { key: "Enter" });
    expect(await screen.findByRole("option", { name: /LCK \(93\)/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /LEC \(53\)/ })).toBeTruthy();
  });

  it("sends the selected league to the backend and puts it in the URL", async () => {
    const { urls } = installBackend([body([game()]), body([game()])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    await choose("League", /LCK \(93\)/);
    await waitFor(() => expect(urls.some((u) => u.includes("league=lck"))).toBe(true));
    expect(screen.getByTestId("loc").textContent).toContain("league=lck");
  });

  it("scopes tournaments to the chosen league — five are named 'Summer 2026'", async () => {
    installBackend([body([game()]), body([game()])]);
    renderArchive(`${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?league=lec`);
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    fireEvent.keyDown(screen.getByLabelText("Tournament"), { key: "Enter" });
    expect(await screen.findByRole("option", { name: /Summer 2026 \(53\)/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Split 3 2026/ })).toBeNull();
  });

  it("drops a tournament that belongs to a league you just left", async () => {
    installBackend([body([game()]), body([game()]), body([game()])]);
    renderArchive(`${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?league=lec&tournament=t-lec`);
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    await choose("League", /LCK \(93\)/);
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).not.toContain("t-lec"),
    );
  });

  it("restores every filter from the URL, so a filtered view is shareable", async () => {
    const { urls } = installBackend([body([game()])]);
    renderArchive(
      `${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?league=lec&team=g2&date_from=2026-08-20&date_to=2026-08-31&status=final&depth=full`,
    );
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    const asked = urls.find((u) => u.includes("/history?")) ?? "";
    for (const part of ["league=lec", "team=g2", "date_from=2026-08-20",
                        "date_to=2026-08-31", "status=final", "depth=full"]) {
      expect(asked).toContain(part);
    }
  });

  it("ignores a filter value the backend would reject", async () => {
    const { urls } = installBackend([body([game()])]);
    renderArchive(`${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?status=bogus&depth=sparse`);
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    const asked = urls.find((u) => u.includes("/history?")) ?? urls.find((u) => u.includes("/history")) ?? "";
    expect(asked).not.toContain("bogus");
    expect(asked).not.toContain("sparse");
  });

  it("clears every filter at once", async () => {
    installBackend([body([game()]), body([game()])]);
    renderArchive(`${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?league=lec&team=g2`);
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    fireEvent.click(screen.getByRole("button", { name: /clear filters \(2\)/i }));
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toBe(PRO_PLAY_LIVE_ARCHIVE_ROUTE),
    );
  });

  it("disables Clear when nothing is filtered", async () => {
    installBackend([body([game()])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    expect(screen.getByRole("button", { name: /^clear filters$/i }).hasAttribute("disabled")).toBe(true);
  });
});

/* ── pagination ───────────────────────────────────────────────────────────── */

describe("pagination", () => {
  it("follows the backend's cursor rather than an offset it invented", async () => {
    const { urls } = installBackend([
      body([game({ game_id: "p1" })], { next_cursor: "Y3Vyc29yLTE", total: 60 }),
      body([game({ game_id: "p2", teams: { blue: { name: "T1", code: "T1", esports_team_id: "t1", series_wins: 0, kills: 1 }, red: { name: "Dplus KIA", code: "DK", esports_team_id: "dk", series_wins: 0, kills: 2 } } })], { total: 60 }),
    ]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(urls.some((u) => u.includes("cursor=Y3Vyc29yLTE"))).toBe(true));
    expect(await screen.findByRole("button", { name: /T1 vs DK/i })).toBeTruthy();
  });

  it("puts the cursor in the URL, so a page survives a refresh", async () => {
    installBackend([
      body([game()], { next_cursor: "Y3Vyc29yLTE" }),
      body([game()]),
    ]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toContain("cursor=Y3Vyc29yLTE"),
    );
  });

  it("disables Previous on a cold load of a shared deep page", async () => {
    // There is no reverse cursor and no in-app history to walk back through:
    // `navigate(-1)` here would have taken the reader off the site entirely.
    installBackend([body([game()], { next_cursor: "Y3Vyc29yLTI" })]);
    renderArchive(`${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?cursor=Y3Vyc29yLTE`);
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    expect(
      screen.getByRole("button", { name: /previous/i }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("walks back to the page it actually came from", async () => {
    installBackend([
      body([game({ game_id: "p1" })], { next_cursor: "Y3Vyc29yLTE" }),
      body([game({ game_id: "p2", teams: { blue: { name: "T1", code: "T1", esports_team_id: "t1", series_wins: 0, kills: 1 }, red: { name: "Dplus KIA", code: "DK", esports_team_id: "dk", series_wins: 0, kills: 2 } } })], { next_cursor: null }),
      body([game({ game_id: "p1" })], { next_cursor: "Y3Vyc29yLTE" }),
    ]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByRole("button", { name: /T1 vs DK/i });
    // Previous is only offered once there is a page to go back TO.
    const prev = screen.getByRole("button", { name: /previous/i });
    expect(prev.hasAttribute("disabled")).toBe(false);
    fireEvent.click(prev);
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toBe(PRO_PLAY_LIVE_ARCHIVE_ROUTE),
    );
  });

  it("offers no Next on the last page", async () => {
    installBackend([body([game()], { next_cursor: null })]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
  });

  it("does not carry a cursor across a filter change", async () => {
    const { urls } = installBackend([body([game()]), body([game()])]);
    renderArchive(`${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?cursor=Y3Vyc29yLTE`);
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    await choose("League", /LCK \(93\)/);
    await waitFor(() => expect(urls.some((u) => u.includes("league=lck"))).toBe(true));
    const after = urls.filter((u) => u.includes("league=lck"));
    expect(after.every((u) => !u.includes("cursor="))).toBe(true);
  });

  it("asks for a bounded page, never the whole catalogue", async () => {
    const { urls } = installBackend([body([game()])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    const asked = urls.find((u) => u.includes("/history?")) ?? "";
    expect(asked).toContain("limit=24");
    expect(urls.some((u) => /\/live-esports\/games(\?|$)/.test(u))).toBe(false);
  });
});

/* ── opening a match ──────────────────────────────────────────────────────── */

describe("opening an archived match", () => {
  it("hands the game to the existing match centre, not a second viewer", async () => {
    installBackend([body([game({ game_id: "115548681803406242" })])]);
    renderArchive();
    fireEvent.click(await screen.findByRole("button", { name: /G2 vs FNC/i }));
    await waitFor(() => expect(screen.getByText("match centre")).toBeTruthy());
    expect(screen.getByTestId("loc").textContent).toBe(
      `${PRO_PLAY_LIVE_ROUTE}?game=115548681803406242`,
    );
  });

  it("makes the whole row the target, and reaches it from the keyboard", async () => {
    installBackend([body([game()])]);
    renderArchive();
    const row = await screen.findByRole("button", { name: /G2 vs FNC/i });
    row.focus();
    expect(document.activeElement).toBe(row);
    // A <button> activates on Enter natively; the point is that the row IS one.
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByText("match centre")).toBeTruthy());
  });
});

/* ── mobile ───────────────────────────────────────────────────────────────── */

describe("mobile structure", () => {
  it("stacks filters in one column before sm and never scrolls the page sideways", async () => {
    installBackend([body([game()])]);
    const { container } = renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    const grid = container.querySelector('[class*="grid-cols-1"]');
    expect(grid?.className).toContain("sm:grid-cols-2");
    // Nothing may assert a width the 375px viewport cannot honour.
    expect(container.querySelectorAll('[class*="w-["]').length).toBe(0);
    expect(container.querySelectorAll('[class*="min-w-["]').length).toBe(0);
  });

  it("stacks a row's identity above its metadata on a narrow screen", async () => {
    installBackend([body([game()])]);
    renderArchive();
    const row = await screen.findByRole("button", { name: /G2 vs FNC/i });
    const layout = row.querySelector("div");
    expect(layout?.className).toContain("flex-col");
    expect(layout?.className).toContain("sm:flex-row");
  });

  it("truncates a long competition line rather than widening the row", async () => {
    installBackend([body([game()])]);
    renderArchive();
    const row = await screen.findByRole("button", { name: /G2 vs FNC/i });
    expect(row.querySelector('[class*="truncate"]')).toBeTruthy();
  });
});
