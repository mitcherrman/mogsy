import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LeagueDocsProYear from "./LeagueDocsProYear";

vi.mock("@/hooks/useProYear", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useProYear")>("@/hooks/useProYear");
  return {
    isPlausibleProYear: actual.isPlausibleProYear,
    useProYear: () => ({
      data: undefined,
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

describe("LeagueDocsProYear invalid-year indexing", () => {
  it("renders a distinct not-found state with noindex — no landing-page canonical reuse", async () => {
    mount("banana");
    expect(screen.getByText(/doesn't look like a year/i)).toBeInTheDocument();
    // Navigation back to valid content
    expect(screen.getByRole("link", { name: /browse pro data coverage/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.title).toContain("Pro Data year not found");
      const robots = document.querySelector('meta[name="robots"]');
      expect(robots?.getAttribute("content")).toContain("noindex");
      // Must NOT canonicalize to the Pro Data landing
      const canonical = document.querySelector('link[rel="canonical"]');
      expect(canonical?.getAttribute("href") ?? "").not.toBe("https://mogzy.lol/lol/docs/pro");
    });
  });
});
