import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LeagueDocsProYear from "./LeagueDocsProYear";

const YEAR_DETAIL = {
  year: 2026,
  coverage_status: "complete" as const,
  jobs: { total: 172, done: 172, pending: 0, failed: 0, skipped_not_released: 0, other: 0 },
  data: {
    game_rows: 146465,
    pick_rows: 74389,
    ban_rows: 72076,
    unique_champions: 172,
    min_match_date: "2026-01-01 00:00:00",
    max_match_date: "2026-07-10 00:00:00",
    patch_null_rows: 0,
    patch_null_pct: 0,
  },
  scoped_stats: { "all-imported": 172 },
  caveats: [],
  total_champions: 172,
  top_picked: [],
  top_banned: [],
  top_presence: [],
};

vi.mock("@/hooks/useProYear", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useProYear")>("@/hooks/useProYear");
  return {
    isPlausibleProYear: actual.isPlausibleProYear,
    useProYear: () => ({
      data: YEAR_DETAIL,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    }),
  };
});
vi.mock("@/hooks/useProCoverage", () => ({ useProCoverage: () => ({ data: undefined }) }));
vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: undefined }),
  getChampionIcon: () => null,
}));

function mount(yearParam: string) {
  return render(
    <MemoryRouter initialEntries={[`/lol/docs/pro/years/${yearParam}`]}>
      <Routes>
        <Route path="/lol/docs/pro/years/:year" element={<LeagueDocsProYear />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("LeagueDocsProYear Explorer link", () => {
  it("renders a contextual Explorer link naming the year, deep-linking into the Explorer view", () => {
    mount("2026");
    const link = screen.getByRole("link", { name: /Explore 2026 data/i });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("view=explorer");
    expect(href).toContain("year=2026");
    // Exact contract from buildProExplorerUrl.
    expect(href).toBe("/lol/docs/pro?view=explorer&year=2026");
  });
});
