// Regression: Jhin's League Docs projection must grow with level (his ratio is
// a real 0.0 but his level growth scales from base AS); ordinary champions are
// unchanged.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import LeagueDocsChampionDetail from "./LeagueDocsChampionDetail";

let currentDoc: unknown;

vi.mock("@/hooks/useChampionDoc", () => ({
  useChampionDoc: () => ({ data: currentDoc, isLoading: false, isError: false, refetch: vi.fn(), isRefetching: false }),
  isChampionNotFound: () => false,
}));
vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: null }),
  getChampionIcon: () => null,
}));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/components/ads/AdSlot", () => ({ default: () => null }));

function makeDoc(name: string, as: number, growth: number, ratio: number | null) {
  return {
    champion: { name, title: null, resource_type: null, release_date: null },
    stats: { attack_speed: as, attack_speed_per_level: growth, attack_speed_ratio: ratio },
    abilities: [],
    meta: { verification_status: "unknown" },
  };
}

function attackSpeedCell(): string {
  const row = screen.getByText("Attack speed").closest("tr") as HTMLElement;
  const cells = within(row).getAllByRole("cell");
  return cells[cells.length - 1].textContent ?? "";
}

function renderAt(doc: unknown, level: 1 | 18) {
  currentDoc = doc;
  render(
    <MemoryRouter initialEntries={["/lol/docs/champions/x"]}>
      <Routes>
        <Route path="/lol/docs/champions/:slug" element={<LeagueDocsChampionDetail />} />
      </Routes>
    </MemoryRouter>,
  );
  if (level === 18) fireEvent.keyDown(screen.getByRole("slider"), { key: "End" });
}

describe("League Docs champion detail — attack-speed projection", () => {
  it("shows Jhin at 0.625 on level 1 and ≈0.944 on level 18", () => {
    renderAt(makeDoc("Jhin", 0.625, 3, 0), 1);
    expect(attackSpeedCell()).toBe("0.625");
    fireEvent.keyDown(screen.getByRole("slider"), { key: "End" });
    expect(attackSpeedCell()).toBe("0.944");
  });

  it("leaves an ordinary champion unchanged (growth scaled by ratio)", () => {
    renderAt(makeDoc("Ashe", 0.658, 3.33, 0.625), 18);
    expect(attackSpeedCell()).toBe((0.658 + (0.625 * 3.33 * 17) / 100).toFixed(3).replace(/0+$/, ""));
  });
});
