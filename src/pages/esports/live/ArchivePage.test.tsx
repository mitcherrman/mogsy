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
import { FEATURED_POOL } from "./archive";
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
  if (!screen.queryByLabelText(triggerLabel)) await openFilters();
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

/**
 * Scripted `/api/live-esports/history*`; records every URL it was asked for.
 *
 * The featured strip's request is answered from its own fixture rather than
 * from the page queue. It is a different question — "the newest full-timeline
 * games" — and letting it consume a scripted page would make every pagination
 * assertion depend on how many other queries the page happened to fire.
 */
function isFeaturedRequest(path: string): boolean {
  return (
    path.includes("depth=full") &&
    path.includes("status=final") &&
    path.includes(`limit=${FEATURED_POOL}`)
  );
}

function installBackend(
  pages: Record<string, unknown>[] | null,
  opts: { featured?: unknown[] } = {},
) {
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
      if (isFeaturedRequest(path)) return ok(body(opts.featured ?? []));
      const idx = Math.min(call++, pages.length - 1);
      return ok(pages[idx]);
    }
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, urls };
}

/** The rail is collapsed until asked for; every select lives behind this. */
async function openFilters() {
  // Idempotent: the disclosure starts OPEN whenever the URL already carries a
  // filter, and clicking it then would close the thing the caller wants.
  if (screen.queryByLabelText("League")) return;
  fireEvent.click(screen.getByRole("button", { name: /all filters/i }));
  await screen.findByLabelText("League");
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
  const state = (loc.state as { archive?: string } | null)?.archive ?? "";
  return (
    <>
      <div data-testid="loc">{`${loc.pathname}${loc.search}`}</div>
      <div data-testid="state">{state}</div>
    </>
  );
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

  it("renders a match with teams, competition, patch and date", async () => {
    installBackend([body([game()])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    // Competition, patch and date belong to the SERIES, so they are stated
    // once in its header rather than repeated on every game inside it.
    const block = within(screen.getByTestId("series-115548681803406242"));
    expect(block.getByText(/LEC/)).toBeTruthy();
    expect(block.getByText(/Summer 2026/)).toBeTruthy();
    expect(block.getByText(/Playoffs · Finals/)).toBeTruthy();
    // The four-part upstream version is shown as the patch a reader knows.
    expect(block.getByText("Patch 16.17")).toBeTruthy();
    expect(block.getByText(/Bo5/)).toBeTruthy();
    expect(block.getByText(/Game 3/)).toBeTruthy();
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
    // Wait for the list itself: "Full timeline" is also a quick-filter chip,
    // and matching that would assert before a single row had rendered.
    await screen.findByRole("button", { name: /GEN vs KT/i });
    expect(screen.getByText("Final snapshot")).toBeTruthy();
    expect(screen.getByText("No telemetry")).toBeTruthy();
    expect(screen.getAllByText("Full timeline").length).toBeGreaterThan(1);
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
    await openFilters();
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
    await openFilters();
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
    fireEvent.click(screen.getAllByRole("button", { name: /clear filters \(2\)/i })[0]);
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toBe(PRO_PLAY_LIVE_ARCHIVE_ROUTE),
    );
  });

  it("offers no way to clear, and no scope chips, when nothing is filtered", async () => {
    installBackend([body([game()])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    // Nothing is narrowing the archive, so the shortcut is absent rather than
    // present-but-dead — and the rail's own Clear stays disabled inside it.
    expect(screen.queryByRole("button", { name: /clear filters \(/i })).toBeNull();
    await openFilters();
    expect(
      screen.getByRole("button", { name: /^clear filters$/i }).hasAttribute("disabled"),
    ).toBe(true);
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

  it("carries the archive's own URL over so the viewer can come back to it", async () => {
    installBackend([body([game()])]);
    renderArchive(`${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?league=lec&cursor=Y3Vyc29yLTE`);
    fireEvent.click(await screen.findByRole("button", { name: /G2 vs FNC/i }));
    await waitFor(() => expect(screen.getByText("match centre")).toBeTruthy());
    // The filters do NOT go into the viewer's URL — a shared ?game= link is
    // about the match, not about a stranger's filter set.
    expect(screen.getByTestId("loc").textContent).not.toContain("league=lec");
    expect(screen.getByTestId("state").textContent).toBe(
      `${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?league=lec&cursor=Y3Vyc29yLTE`,
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
    await openFilters();
    const grid = container.querySelector('[class*="grid-cols-1"]');
    expect(grid?.className).toContain("sm:grid-cols-2");
    // Nothing may assert a width the 375px viewport cannot honour. A `max-w-`
    // ceiling is not one: it caps a chip on a wide screen and does nothing at
    // 375px, which is the opposite of the failure this guards against.
    const fixedWidths = Array.from(container.querySelectorAll("*")).filter((el) =>
      /(?:^|\s)(?:min-)?w-\[/.test(el.className?.toString?.() ?? ""),
    );
    expect(fixedWidths).toEqual([]);
  });

  it("stacks a row's identity above its metadata on a narrow screen", async () => {
    installBackend([body([game()])]);
    renderArchive();
    const row = await screen.findByRole("button", { name: /G2 vs FNC/i });
    expect(row.className).toContain("flex-col");
    expect(row.className).toContain("sm:flex-row");
  });

  it("stacks the series header the same way", async () => {
    installBackend([body([game()])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    const header = screen.getByTestId("series-115548681803406242").firstElementChild;
    expect(header?.className).toContain("flex-col");
    expect(header?.className).toContain("sm:flex-row");
  });

  it("truncates a long competition line rather than widening the block", async () => {
    installBackend([body([game()])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    const block = screen.getByTestId("series-115548681803406242");
    expect(block.querySelector('[class*="truncate"]')).toBeTruthy();
  });

  it("scrolls the quick-filter strip sideways instead of stacking it", async () => {
    installBackend([body([game()])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    const strip = screen.getByRole("list", { name: /quick filters/i });
    expect(strip.parentElement?.className).toContain("overflow-x-auto");
    // Wrapping is what happens from sm up; below it the strip is one line.
    expect(strip.className).toContain("sm:flex-wrap");
  });
});

/* ── series grouping ──────────────────────────────────────────────────────── */

/** Two games of one match, in the order the backend serves them. */
function seriesPage() {
  return body([
    game({
      game_id: "g4",
      game_number: 4,
      winner: "blue",
      teams: {
        blue: { name: "G2 Esports", code: "G2", esports_team_id: "g2", series_wins: 2, kills: 21 },
        red: { name: "Fnatic", code: "FNC", esports_team_id: "fnc", series_wins: 1, kills: 4 },
      },
    }),
    game({
      game_id: "g3",
      game_number: 3,
      winner: "red",
      teams: {
        blue: { name: "G2 Esports", code: "G2", esports_team_id: "g2", series_wins: 2, kills: 8 },
        red: { name: "Fnatic", code: "FNC", esports_team_id: "fnc", series_wins: 0, kills: 15 },
      },
    }),
  ]);
}

describe("series grouping", () => {
  it("states the competition, patch and date once for the whole series", async () => {
    installBackend([seriesPage()]);
    renderArchive();
    await screen.findByRole("button", { name: /Game 4/i });
    const block = within(screen.getByTestId("series-g4"));
    // Four rows used to repeat all three; the header carries them now.
    expect(block.getAllByText("Patch 16.17").length).toBe(1);
    expect(block.getAllByText(/Summer 2026/).length).toBe(1);
    expect(block.getAllByText(/Aug 30, 2026/).length).toBe(1);
    expect(block.getByText(/2 games/)).toBeTruthy();
  });

  it("numbers the games inside the series", async () => {
    installBackend([seriesPage()]);
    renderArchive();
    expect(await screen.findByRole("button", { name: /Game 4/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Game 3/i })).toBeTruthy();
  });

  it("derives the series score from the frozen score plus this game's winner", async () => {
    installBackend([seriesPage()]);
    renderArchive();
    await screen.findByRole("button", { name: /Game 4/i });
    // 2–1 entering game 4, G2 won it: 3–1 ends a Bo5.
    expect(within(screen.getByTestId("series-g4")).getByText("3–1")).toBeTruthy();
  });

  it("claims no series score while the match could still have gone on", async () => {
    installBackend([
      body([
        game({
          game_id: "g2",
          game_number: 2,
          winner: "red",
          teams: {
            blue: { name: "G2 Esports", code: "G2", esports_team_id: "g2", series_wins: 1, kills: 9 },
            red: { name: "Fnatic", code: "FNC", esports_team_id: "fnc", series_wins: 0, kills: 19 },
          },
        }),
      ]),
    ]);
    renderArchive();
    await screen.findByRole("button", { name: /Game 2/i });
    const block = within(screen.getByTestId("series-g2"));
    expect(block.queryByText("1–1")).toBeNull();
    // The header falls back to a plain "vs" — the same one every game row
    // already uses — rather than printing a score the store cannot prove.
    expect(block.getAllByText("vs").length).toBe(2);
  });

  it("says a game that was never played was never played", async () => {
    // Riot creates every slot of a best-of up front; production holds 16 such
    // rows, and three of them lead the unfiltered archive.
    installBackend([
      body([
        game({
          game_id: "unplayed",
          final: false,
          availability: "scheduled",
          winner: null,
          patch_version: null,
          telemetry: { frame_count: 0, event_count: 0, depth: "none", has_timeline: false },
        }),
      ]),
    ]);
    renderArchive();
    expect(await screen.findByText("Not played")).toBeTruthy();
    expect(screen.queryByText("No telemetry")).toBeNull();
  });
});

/* ── full-timeline discovery ──────────────────────────────────────────────── */

describe("Full timeline discovery", () => {
  it("offers the rich games as a chip, without opening a single control", async () => {
    const { urls } = installBackend([body([game()]), body([game()])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    const chip = screen.getByRole("button", { name: /^Full timeline$/i });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toContain("depth=full"));
    expect(urls.some((u) => u.includes("depth=full") && u.includes("limit=24"))).toBe(true);
  });

  it("shows the chip as on when the URL already asks for full timelines", async () => {
    installBackend([body([game()])]);
    renderArchive(`${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?depth=full`);
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    expect(
      screen.getByRole("button", { name: /^Full timeline$/i }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("turns the chip back off without touching anything else", async () => {
    installBackend([body([game()]), body([game()])]);
    renderArchive(`${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?depth=full&team=g2`);
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    fireEvent.click(screen.getByRole("button", { name: /^Full timeline$/i }));
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).not.toContain("depth=full"),
    );
    expect(screen.getByTestId("loc").textContent).toContain("team=g2");
  });

  it("never hides sparse games by default", async () => {
    const { urls } = installBackend([body([game()])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    const asked = urls.find((u) => u.includes("limit=24")) ?? "";
    expect(asked).not.toContain("depth=");
  });

  it("hardcodes no league in the strip", async () => {
    installBackend([body([game()])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    // LCK/LEC/LCP are here only because the FACETS fixture says they are the
    // biggest; swap the fixture and the chips change with it.
    const strip = within(screen.getByRole("list", { name: /quick filters/i }));
    expect(strip.getByRole("button", { name: /LCK/ })).toBeTruthy();
    expect(strip.getByRole("button", { name: /LCP/ })).toBeTruthy();
    expect(strip.queryByRole("button", { name: /Worlds/i })).toBeNull();
  });

  it("filters to a league from the strip and puts it in the URL", async () => {
    const { urls } = installBackend([body([game()]), body([game()])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    fireEvent.click(
      within(screen.getByRole("list", { name: /quick filters/i })).getByRole("button", {
        name: /LCK/,
      }),
    );
    await waitFor(() => expect(urls.some((u) => u.includes("league=lck"))).toBe(true));
    expect(screen.getByTestId("loc").textContent).toContain("league=lck");
  });
});

/* ── featured ─────────────────────────────────────────────────────────────── */

describe("the featured strip", () => {
  const FEATURED = [
    game({
      game_id: "feat-1",
      match_id: "feat-m1",
      game_number: 4,
      winner: "blue",
      teams: {
        blue: { name: "G2 Esports", code: "G2", esports_team_id: "g2", series_wins: 2, kills: 21 },
        red: { name: "Fnatic", code: "FNC", esports_team_id: "fnc", series_wins: 1, kills: 4 },
      },
    }),
  ];

  it("asks one bounded question for it, and never the catalogue", async () => {
    const { urls } = installBackend([body([game()])], { featured: FEATURED });
    renderArchive();
    await screen.findByText(/start here/i);
    const asked = urls.filter((u) => u.includes(`limit=${FEATURED_POOL}`));
    expect(asked.length).toBe(1);
    expect(asked[0]).toContain("depth=full");
    expect(asked[0]).toContain("status=final");
    expect(urls.some((u) => /\/live-esports\/games(\?|$)/.test(u))).toBe(false);
  });

  it("says why a match is there, and shows the score that earned it", async () => {
    installBackend([body([game()])], { featured: FEATURED });
    renderArchive();
    expect(await screen.findByText("Series decider")).toBeTruthy();
    const card = screen.getByRole("button", { name: /Series decider/i });
    expect(within(card).getByText("3–1")).toBeTruthy();
  });

  it("opens the match in the same viewer every other row uses", async () => {
    installBackend([body([game()])], { featured: FEATURED });
    renderArchive();
    fireEvent.click(await screen.findByRole("button", { name: /Series decider/i }));
    await waitFor(() => expect(screen.getByText("match centre")).toBeTruthy());
    expect(screen.getByTestId("loc").textContent).toBe(`${PRO_PLAY_LIVE_ROUTE}?game=feat-1`);
  });

  it("is not asked for at all once the reader is browsing something", async () => {
    const { urls } = installBackend([body([game()])], { featured: FEATURED });
    renderArchive(`${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?league=lec`);
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    expect(screen.queryByText(/start here/i)).toBeNull();
    expect(urls.some((u) => u.includes(`limit=${FEATURED_POOL}`))).toBe(false);
  });

  it("is not asked for on a deeper page either", async () => {
    const { urls } = installBackend([body([game()])], { featured: FEATURED });
    renderArchive(`${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?cursor=Y3Vyc29yLTE`);
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    expect(urls.some((u) => u.includes(`limit=${FEATURED_POOL}`))).toBe(false);
  });

  it("renders nothing rather than an empty shelf when no game qualifies", async () => {
    installBackend([body([game()])], { featured: [] });
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    expect(screen.queryByText(/start here/i)).toBeNull();
  });
});

/* ── browsing from a row ──────────────────────────────────────────────────── */

describe("team browsing", () => {
  it("narrows to a team from its name in a row, by exact id", async () => {
    const { urls } = installBackend([body([game()]), body([game()])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    fireEvent.click(screen.getByRole("button", { name: /Show every stored G2 Esports game/i }));
    // Ids, never names: "T1" and "SK Telecom T1" are separate upstream.
    await waitFor(() => expect(urls.some((u) => u.includes("team=g2"))).toBe(true));
    expect(screen.getByTestId("loc").textContent).toContain("team=g2");
  });

  it("shows the team scope in words, with a way out of it", async () => {
    installBackend([body([game()]), body([game()])]);
    renderArchive(`${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?team=g2`);
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    // The rail may never be opened, so the scope has to be visible outside it.
    expect(screen.getByText("G2 Esports")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Remove Team filter/i }));
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toBe(PRO_PLAY_LIVE_ARCHIVE_ROUTE),
    );
  });

  it("lets the same name drop the scope it set", async () => {
    installBackend([body([game()]), body([game()])]);
    renderArchive(`${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?team=g2`);
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    fireEvent.click(screen.getByRole("button", { name: /Stop filtering by G2 Esports/i }));
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toBe(PRO_PLAY_LIVE_ARCHIVE_ROUTE),
    );
  });

  it("leaves a team the store cannot identify as plain text, not a dead control", async () => {
    installBackend([
      body([
        game({
          teams: {
            blue: { name: "TBD", code: null, esports_team_id: null, series_wins: null, kills: null },
            red: { name: "Fnatic", code: "FNC", esports_team_id: "fnc", series_wins: null, kills: null },
          },
        }),
      ]),
    ]);
    renderArchive();
    await screen.findByRole("button", { name: /TBD vs FNC/i });
    expect(screen.queryByRole("button", { name: /Show every stored TBD game/i })).toBeNull();
  });
});

describe("tournament browsing", () => {
  it("narrows to a tournament from the competition line", async () => {
    const { urls } = installBackend([body([game()]), body([game()])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    fireEvent.click(screen.getByRole("button", { name: /Show every stored Summer 2026 game/i }));
    await waitFor(() => expect(urls.some((u) => u.includes("tournament=115548681802226458"))).toBe(true));
    // A tournament belongs to exactly one league, so its league comes with it.
    expect(screen.getByTestId("loc").textContent).toContain("league=lec");
  });

  it("narrows to a league from the competition line", async () => {
    const { urls } = installBackend([body([game()]), body([game()])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    fireEvent.click(screen.getByRole("button", { name: /Show every stored LEC game/i }));
    await waitFor(() => expect(urls.some((u) => u.includes("league=lec"))).toBe(true));
    expect(screen.getByTestId("loc").textContent).not.toContain("tournament=");
  });

  it("composes a league and a tournament scope with a team one", async () => {
    installBackend([body([game()]), body([game()])]);
    renderArchive(`${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?league=lec&tournament=t-lec&team=g2`);
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    for (const name of [/Remove League filter/i, /Remove Tournament filter/i, /Remove Team filter/i]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });
});

describe("a game with no final result", () => {
  it("says the record is not final, and never claims the match is live", async () => {
    // `availability: "live"` is the upstream label, not evidence: production
    // has carried rows stuck at it for weeks after the match ended.
    installBackend([
      body([game({ final: false, availability: "live", winner: null })]),
    ]);
    renderArchive();
    expect(await screen.findByText("Not final")).toBeTruthy();
    expect(screen.queryByText(/^live$/i)).toBeNull();
    // It is still a real recording, so what the viewer can render is shown.
    expect(screen.getAllByText("Full timeline").length).toBeGreaterThan(1);
  });

  it("says nothing of the sort about a finished game", async () => {
    installBackend([body([game()])]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    expect(screen.queryByText("Not final")).toBeNull();
  });
});

describe("a match that has only just started", () => {
  it("says the record is not final, and does not also say No telemetry", async () => {
    installBackend([
      body([
        game({
          final: false,
          availability: "live_waiting_for_stats",
          winner: null,
          telemetry: { frame_count: 0, event_count: 0, depth: "none", has_timeline: false },
        }),
      ]),
    ]);
    renderArchive();
    expect(await screen.findByText("Not final")).toBeTruthy();
    // The depth labels are promises about a finished game; "No telemetry was
    // stored for this game" is the wrong tense for one in progress.
    expect(screen.queryByText("No telemetry")).toBeNull();
  });

  it("still says what a running game has actually recorded so far", async () => {
    installBackend([body([game({ final: false, availability: "live", winner: null })])]);
    renderArchive();
    expect(await screen.findByText("Not final")).toBeTruthy();
    expect(screen.getAllByText("Full timeline").length).toBeGreaterThan(1);
  });
});

describe("hoisted metadata", () => {
  it("prints the date once even when there is no patch to hoist with it", async () => {
    // An unfinished game carries no patch, and tying the two together made
    // the header and the row both print the date.
    installBackend([
      body([game({ final: false, availability: "live", winner: null, patch_version: null })]),
    ]);
    renderArchive();
    await screen.findByRole("button", { name: /G2 vs FNC/i });
    const block = within(screen.getByTestId("series-115548681803406242"));
    expect(block.getAllByText("Aug 30, 2026").length).toBe(1);
  });

  it("leaves a patch on the game it belongs to when the series disagrees", async () => {
    installBackend([
      body([
        game({ game_id: "g2", game_number: 2, patch_version: "16.17.810.4348" }),
        game({ game_id: "g1", game_number: 1, patch_version: "16.16.700.1000" }),
      ]),
    ]);
    renderArchive();
    await screen.findByRole("button", { name: /Game 2/i });
    const block = within(screen.getByTestId("series-g2"));
    expect(block.getByText("Patch 16.17")).toBeTruthy();
    expect(block.getByText("Patch 16.16")).toBeTruthy();
  });
});

describe("a match id that appears twice on one page", () => {
  it("renders both runs as their own blocks, with no key collision", async () => {
    // Production does this: a scheduled game 3 sits at the top of the archive
    // while its own games 1 and 2 sit three weeks further down.
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    installBackend([
      body([
        game({ game_id: "later", game_number: 3, final: false, availability: "scheduled" }),
        game({
          game_id: "other",
          match_id: "m-other",
          teams: {
            blue: { name: "T1", code: "T1", esports_team_id: "t1", series_wins: 0, kills: 1 },
            red: { name: "Dplus KIA", code: "DK", esports_team_id: "dk", series_wins: 0, kills: 2 },
          },
        }),
        game({ game_id: "earlier", game_number: 2 }),
      ]),
    ]);
    renderArchive();
    await screen.findByRole("button", { name: /T1 vs DK/i });
    expect(screen.getByTestId("series-later")).toBeTruthy();
    expect(screen.getByTestId("series-earlier")).toBeTruthy();
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes("same key")),
    ).toBe(false);
    warn.mockRestore();
  });
});
