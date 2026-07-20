import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { BattleListItem } from "@/lib/combat-battles/types";

let listData: BattleListItem[] | undefined = [];
let listState = { isLoading: false, isError: false };
vi.mock("@/hooks/useCombatBattles", () => ({
  useBattleList: () => ({ data: listData, ...listState, refetch: vi.fn() }),
  useMyArenaScore: () => ({ data: undefined, isLoading: false }),
  useCountdown: () => 1000,
  formatDuration: () => "1s",
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: null }),
  getChampionIcon: () => null,
  getChampionSplash: () => null,
}));

import CombatBattlesIndex from "./CombatBattlesIndex";

afterEach(() => { cleanup(); listData = []; listState = { isLoading: false, isError: false }; });

const battle = (over: Partial<BattleListItem>): BattleListItem => ({
  battle_id: over.battle_id ?? "b", slug: over.slug ?? "s", title: over.title ?? "T",
  status: over.status ?? "open", battle_format: "independent_damage_comparison_v1",
  open_at: null, lock_at: null, reveal_at: null,
  left_champion: over.left_champion ?? "Annie", right_champion: over.right_champion ?? "Brand", ...over,
});

const renderIndex = () => render(<MemoryRouter><CombatBattlesIndex /></MemoryRouter>);

describe("CombatBattlesIndex", () => {
  it("groups battles by lifecycle status", () => {
    listData = [
      battle({ battle_id: "1", slug: "a", status: "open", title: "Open One" }),
      battle({ battle_id: "2", slug: "b", status: "revealed", title: "Done One" }),
      battle({ battle_id: "3", slug: "c", status: "scheduled", title: "Soon One" }),
    ];
    renderIndex();
    expect(screen.getByRole("heading", { name: /Open for predictions/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Revealed results/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Upcoming/ })).toBeTruthy();
  });

  it("does not show a winner on cards (winner only appears after opening detail)", () => {
    listData = [battle({ status: "revealed", title: "Done" })];
    renderIndex();
    expect(screen.queryByText(/Winner/i)).toBeNull();
  });

  it("shows an empty state when there are no battles", () => {
    listData = [];
    renderIndex();
    expect(screen.getByText(/No battles have been published/)).toBeTruthy();
  });

  it("shows an error state when the list fails", () => {
    listData = undefined;
    listState = { isLoading: false, isError: true };
    renderIndex();
    expect(screen.getByText(/couldn't load battles/i)).toBeTruthy();
  });
});
