// The League Docs "Mechanics" tile is the product entry point for the
// Mechanics Explorer (MECH1 Phase 5B1). This pins that it is a real link to
// /lol/mechanics rather than the pre-5B1 greyed "Soon" placeholder.

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import LeagueDocsLanding from "./LeagueDocsLanding";

vi.mock("@/hooks/useChampionBaseStats", () => ({
  useChampionBaseStats: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: null }),
  getChampionIcon: () => null,
}));

describe("League Docs landing — Mechanics tiles", () => {
  it("links the Mechanics Explorer category to /lol/mechanics", () => {
    render(
      <MemoryRouter>
        <LeagueDocsLanding />
      </MemoryRouter>,
    );
    // Matched by its own title now that a second mechanics tile (the study
    // tables) sits beside it — a bare /Mechanics/ would match both.
    const tile = screen.getByRole("link", { name: /Mechanics Explorer/ });
    expect(tile).toHaveAttribute("href", "/lol/mechanics");
    // It is a live tile now, not a greyed "Soon" placeholder.
    expect(tile).not.toHaveTextContent(/Soon/);
  });

  it("links the Mechanics Tables category to the Archives mechanics reference", () => {
    render(
      <MemoryRouter>
        <LeagueDocsLanding />
      </MemoryRouter>,
    );
    const tile = screen.getByRole("link", { name: /Mechanics Tables/ });
    expect(tile).toHaveAttribute("href", "/lol/docs/mechanics");
    expect(tile).not.toHaveTextContent(/Soon/);
  });
});
