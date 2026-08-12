import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MechanicsExplorerPage from "./MechanicsExplorerPage";
import {
  fetchExplorerContext,
  fetchMinion,
  type MinionResult,
} from "@/lib/mechanics-explorer/api";

vi.mock("@/lib/mechanics-explorer/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/mechanics-explorer/api")>();
  return {
    ...original,
    fetchExplorerContext: vi.fn(),
    fetchRespawn: vi.fn(),
    fetchWaveByNumber: vi.fn(),
    fetchWaveByTime: vi.fn(),
    fetchMinion: vi.fn(),
    postStructureInspect: vi.fn(),
  };
});

const mockContext = vi.mocked(fetchExplorerContext);
const mockMinion = vi.mocked(fetchMinion);

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const PROVENANCE = [
  {
    mechanic_id: "minion.stats.siege",
    status: "verified",
    effective_patch: "26.01",
    verified_through: "26.15",
    empirical_test_required: false,
    caveat: "",
  },
];

/** Shaped from the live deployed 5A payloads. */
function minionFixture(overrides: Partial<MinionResult> = {}): MinionResult {
  return {
    context: { patch: "26.15", map: "summoners_rift", mode: "classic_5v5" },
    minion_type: "melee",
    requested_type: "melee",
    game_time_s: 0,
    game_time_display: "0:00",
    upgrades: { count: 0, last_upgrade_at_s: null, next_upgrade_at_s: 30 },
    stats: {
      health: { value: "430", status: "verified" },
      attack_damage: { value: "11", status: "verified" },
      armor: { value: "0", status: "verified" },
      magic_resist: { value: "0", status: "verified" },
      attack_speed: { value: "1.25", status: "verified" },
      attack_range: { value: "110", status: "verified" },
      movement_speed: { value: "350", status: "verified" },
      gold: { value: "20", status: "verified" },
      experience: { value: "62", status: "verified" },
    },
    health_breakdown: { base: "430", from_upgrades: "0", capped: false },
    minion_slayer: {
      has_passive: true,
      passive_name: "Minion Wounder",
      percent_current_health: "2",
      damage_type: "physical",
      applies_to: "lane_minions",
    },
    structure_damage: {
      vs_turret: { damage_multiplier: "0.60", mechanic_id: "minion.damage.vs_champions_structures" },
      vs_non_turret_structure: {
        damage_multiplier: "0.60",
        mechanic_id: "minion.damage.vs_champions_structures",
      },
    },
    aggro: {
      attacking_minion_triggers_aggro: false,
      removed_in_patch: "26.10",
      champion_triggers: [],
      ignored_while_attacking_turret: true,
    },
    explanation: "At 0:00, lane minions have received 0 stat upgrade(s).",
    provenance: PROVENANCE,
    ...overrides,
  };
}

const SIEGE_CERTIFIED = minionFixture({
  minion_type: "siege",
  requested_type: "siege",
  game_time_s: 449,
  game_time_display: "7:29",
  upgrades: { count: 5, last_upgrade_at_s: 390, next_upgrade_at_s: 480 },
  stats: {
    ...minionFixture().stats,
    health: { value: "1175", status: "verified" },
    attack_damage: { value: "46.5", status: "verified" },
    gold: { value: "55", status: "verified" },
    experience: { value: "75", status: "verified" },
  },
  minion_slayer: {
    has_passive: true,
    passive_name: "Minion Slayer",
    percent_current_health: "5",
    damage_type: "physical",
    applies_to: "lane_minions",
  },
  structure_damage: {
    vs_turret: { damage_multiplier: "0.84", mechanic_id: "minion.damage.siege_vs_turrets" },
    vs_non_turret_structure: {
      damage_multiplier: "0.60",
      mechanic_id: "minion.damage.vs_champions_structures",
    },
  },
  siege_attack_damage_transition: {
    certified_strictly_before_s: 450,
    certified_strictly_before_display: "7:30",
    unresolved_from_display: "7:30",
  },
});

const SIEGE_UNRESOLVED = minionFixture({
  ...SIEGE_CERTIFIED,
  game_time_s: 450,
  game_time_display: "7:30",
  stats: {
    ...SIEGE_CERTIFIED.stats,
    attack_damage: {
      value: null,
      status: "unresolved",
      unresolved_reason:
        "Siege minion attack damage at and after the wave-15 transition — unresolved from wave 15's spawn (7:30) onward",
    },
  },
});

const SUPER = minionFixture({
  minion_type: "super",
  requested_type: "super",
  stats: {
    ...minionFixture().stats,
    armor: { value: "100", status: "verified" },
    magic_resist: { value: "-30", status: "verified" },
  },
  minion_slayer: {
    has_passive: false,
    passive_name: null,
    percent_current_health: null,
    damage_type: null,
    applies_to: "lane_minions",
  },
  structure_damage: {
    vs_turret: { damage_multiplier: "0.60", mechanic_id: "minion.damage.vs_champions_structures" },
    vs_non_turret_structure: {
      damage_multiplier: "0.125",
      mechanic_id: "minion.damage.super_vs_buildings",
    },
  },
});

function renderAt(url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/lol/mechanics" element={<MechanicsExplorerPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  mockContext.mockResolvedValue({
    default_patch: "26.15",
    map: "summoners_rift",
    mode: "classic_5v5",
  } as never);
  mockMinion.mockImplementation(async (type, seconds) => {
    if (type === "siege") return seconds < 450 ? SIEGE_CERTIFIED : SIEGE_UNRESOLVED;
    if (type === "super") return SUPER;
    return minionFixture();
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Minion Inspector", () => {
  it("requests the default melee minion at the shared default time", async () => {
    renderAt("/lol/mechanics?tool=minions&time=0:00");
    await waitFor(() => expect(mockMinion).toHaveBeenCalledWith("melee", 0));
    expect(await screen.findByTestId("minion-result")).toBeInTheDocument();
    expect(screen.getByTestId("minion-stat-health")).toHaveTextContent("430");
    expect(screen.getByTestId("minion-stat-movement_speed")).toHaveTextContent("350");
  });

  it("switches minion type through the chip selector", async () => {
    renderAt("/lol/mechanics?tool=minions&time=0:00");
    await screen.findByTestId("minion-result");
    fireEvent.click(screen.getByRole("radio", { name: /Super/ }));
    await waitFor(() => expect(mockMinion).toHaveBeenCalledWith("super", 0));
    expect(await screen.findByText(/no on-hit passive/)).toBeInTheDocument();
    expect(screen.getByTestId("minion-stat-magic_resist")).toHaveTextContent("-30");
  });

  it("maps a game-time input into the request", async () => {
    renderAt("/lol/mechanics?tool=minions&type=siege&time=7:29");
    await waitFor(() => expect(mockMinion).toHaveBeenCalledWith("siege", 449));
  });

  it("renders certified siege AD before the transition, with the boundary callout", async () => {
    renderAt("/lol/mechanics?tool=minions&type=siege&time=7:29");
    expect(await screen.findByTestId("minion-result")).toBeInTheDocument();
    expect(screen.getByTestId("minion-stat-attack_damage")).toHaveTextContent("46.5");
    const callout = screen.getByTestId("siege-ad-transition");
    expect(callout).toHaveTextContent("7:30");
    expect(callout).toHaveTextContent(/unresolved from/i);
  });

  it("renders the unresolved siege AD state at the transition — no guessed value", async () => {
    renderAt("/lol/mechanics?tool=minions&type=siege&time=7:30");
    await waitFor(() => expect(mockMinion).toHaveBeenCalledWith("siege", 450));
    const row = await screen.findByTestId("minion-stat-attack_damage");
    expect(row).toHaveTextContent("Unresolved");
    expect(row).toHaveTextContent("wave-15 transition");
    // The unresolved stat renders no number at all.
    expect(row).not.toHaveTextContent("46.5");
    // Other stats still answer.
    expect(screen.getByTestId("minion-stat-health")).toHaveTextContent("1175");
  });

  it("renders Minion Slayer from API values only", async () => {
    renderAt("/lol/mechanics?tool=minions&type=siege&time=7:29");
    const slayer = await screen.findByTestId("minion-slayer");
    expect(slayer).toHaveTextContent("Minion Slayer");
    expect(slayer).toHaveTextContent("5%");
    expect(slayer).toHaveTextContent(/current/);
  });

  it("renders structure-damage modifiers and the aggro rule", async () => {
    renderAt("/lol/mechanics?tool=minions&type=siege&time=7:29");
    const damage = await screen.findByTestId("structure-damage");
    expect(damage).toHaveTextContent("×0.84");
    expect(damage).toHaveTextContent("×0.60");
    expect(screen.getByTestId("minion-aggro")).toHaveTextContent("not");
    expect(screen.getByTestId("minion-aggro")).toHaveTextContent("26.10");
  });

  it("rejects invalid game-time input without firing a request", async () => {
    renderAt("/lol/mechanics?tool=minions&time=banana");
    expect(await screen.findByText(/Use MM:SS/)).toBeInTheDocument();
    expect(screen.queryByTestId("minion-result")).not.toBeInTheDocument();
    expect(mockMinion).not.toHaveBeenCalled();
  });

  it("shows loading and error states", async () => {
    mockMinion.mockImplementation(() => new Promise(() => {}));
    renderAt("/lol/mechanics?tool=minions&time=0:00");
    expect(await screen.findByTestId("mechanics-result-skeleton")).toBeInTheDocument();
    cleanup();

    mockMinion.mockRejectedValue(new Error("Unknown minion type 'mega'"));
    renderAt("/lol/mechanics?tool=minions&time=0:00");
    expect(await screen.findByText("Unknown minion type 'mega'")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
