import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LeagueDocsProChampionDetail from "./LeagueDocsProChampionDetail";

const CHAMPION_DETAIL = {
  champion: "Ryze",
  slug: "ryze",
  years_with_data: [2011, 2026],
  rows_by_year: [
    {
      year: 2026,
      game_rows: 100,
      pick_rows: 60,
      ban_rows: 40,
      patch_null_rows: 0,
      min_match_date: "2026-01-01 00:00:00",
      max_match_date: "2026-07-01 00:00:00",
    },
  ],
  yearly_stats: [],
  scoped_stats: [],
  import_jobs: [
    { year: 2026, status: "done", skip_reason: null, rows_created: 100, latest_match_date: "2026-07-01 00:00:00" },
  ],
  recent_games: [],
};

vi.mock("@/hooks/useProChampion", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useProChampion")>("@/hooks/useProChampion");
  return {
    isPlausibleChampionSlug: actual.isPlausibleChampionSlug,
    useProChampion: () => ({
      data: CHAMPION_DETAIL,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    }),
  };
});
vi.mock("@/hooks/useProChampions", () => ({ useProChampions: () => ({ data: { champions: [] } }) }));
vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: undefined }),
  getChampionIcon: () => null,
}));

function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/lol/docs/pro/champions/:slug" element={<LeagueDocsProChampionDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("LeagueDocsProChampionDetail Explorer link", () => {
  it("renders a contextual Explorer link naming the champion, using the champion slug", () => {
    mount("/lol/docs/pro/champions/ryze");
    const link = screen.getByRole("link", { name: /Explore Ryze data/i });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("view=explorer");
    expect(href).toContain("champion=ryze");
    // No year is carried when the page has no valid selected year.
    expect(href).not.toContain("year=");
    expect(href).toBe("/lol/docs/pro?view=explorer&champion=ryze");
  });

  it("carries a valid selected year into the Explorer link", () => {
    mount("/lol/docs/pro/champions/ryze?year=2026");
    const href = screen.getByRole("link", { name: /Explore Ryze data/i }).getAttribute("href") ?? "";
    expect(href).toContain("champion=ryze");
    expect(href).toContain("year=2026");
    expect(href).toBe("/lol/docs/pro?view=explorer&year=2026&champion=ryze");
  });

  it("omits a selected year that isn't part of the champion's imported data", () => {
    // 2019 is not in years_with_data → treated as no valid focus year.
    mount("/lol/docs/pro/champions/ryze?year=2019");
    const href = screen.getByRole("link", { name: /Explore Ryze data/i }).getAttribute("href") ?? "";
    expect(href).toContain("champion=ryze");
    expect(href).not.toContain("year=");
  });
});
