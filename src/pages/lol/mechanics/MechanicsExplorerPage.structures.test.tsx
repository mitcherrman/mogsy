import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MechanicsExplorerPage from "./MechanicsExplorerPage";
import {
  fetchExplorerContext,
  postStructureInspect,
  type StructureInspectRequest,
  type StructureInspectResult,
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
const mockInspect = vi.mocked(postStructureInspect);

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const PROVENANCE = [
  {
    mechanic_id: "structure.turret.stats.outer",
    status: "verified",
    effective_patch: "26.03",
    verified_through: "26.15",
    empirical_test_required: false,
    caveat: "",
  },
];

/** Shaped from the live deployed 5A payloads (outer turret at 11:40). */
function outerTurretFixture(body: StructureInspectRequest): StructureInspectResult {
  return {
    context: { patch: "26.15", map: "summoners_rift", mode: "classic_5v5" },
    identity: {
      structure: "turret_outer",
      kind: "turret",
      display_name: "Outer turret",
      lane: body.lane ?? null,
    },
    game_time_s: String(body.game_time_s),
    game_time_display: "11:40",
    stats: {
      max_health: "9000",
      armor: "50.0",
      magic_resist: "50.0",
      attack_damage: "326",
      attack_speed: "0.833",
      attack_range: "750",
      health_regen_per_second: null,
      respawn_after_s: null,
      respawn_health_fraction: null,
      has_plating: true,
    },
    plates: {
      applicable: true,
      plate_count: 5,
      thresholds: [
        { index: 1, missing_hp_fraction: "0.10", remaining_hp_fraction: "0.90", health_at_threshold: "8100.00", segment_health: "900.00", destroys_turret: false, grants_bulwark_stack: true },
        { index: 2, missing_hp_fraction: "0.25", remaining_hp_fraction: "0.75", health_at_threshold: "6750.00", segment_health: "1350.00", destroys_turret: false, grants_bulwark_stack: true },
        { index: 3, missing_hp_fraction: "0.45", remaining_hp_fraction: "0.55", health_at_threshold: "4950.00", segment_health: "1800.00", destroys_turret: false, grants_bulwark_stack: true },
        { index: 4, missing_hp_fraction: "0.70", remaining_hp_fraction: "0.30", health_at_threshold: "2700.00", segment_health: "2250.00", destroys_turret: false, grants_bulwark_stack: true },
        { index: 5, missing_hp_fraction: "1.00", remaining_hp_fraction: "0.00", health_at_threshold: "0.00", segment_health: "2700.00", destroys_turret: true, grants_bulwark_stack: false },
      ],
      current_gold_per_plate: "110",
      gold_decayed: true,
      gold_schedule: {
        base_gold: "120",
        decays: true,
        decay_start_s: 660,
        per_minute_loss: "10",
        floor_gold: "80",
        floor_reached_at_s: 840,
      },
    },
    warming_up: {
      applicable: true,
      multipliers_by_consecutive_hit: { "1": "1.00", "2": "1.50", "3": "2.00", "4": "2.50" },
      reset_after_s: "5",
      resets_on_target_switch: false,
    },
    penetration: {
      flat_armor_penetration_applies: true,
      percent_armor_penetration_applies: true,
      armor_reduction_applies: true,
      magic_penetration_applies: true,
      magic_penetration_moot: false,
      critical_strike_applies: false,
      life_steal_applies: false,
      turret_own_armor_penetration_fraction: "0.30",
      melee_damage_taken_multiplier: "1.20",
    },
    bulwark: body.bulwark
      ? {
          applicable: true,
          stacks: body.bulwark.stacks,
          nearby_enemy_champions: body.bulwark.nearby_enemy_champions,
          per_stack: "40",
          bonus_armor: String(40 * body.bulwark.stacks),
          bonus_magic_resist: String(40 * body.bulwark.stacks),
          duration_s: "20",
          radius: "850",
          durations_overlap: true,
        }
      : null,
    overgrowth: body.overgrowth
      ? {
          applicable: true,
          team_average_level: "10.0",
          seconds_since_available: "300.0",
          ramp_progress: "1",
          damage_fraction_of_turret_max_health: "0.1155882352941176470588235294",
          damage: "1040.294117647058823529411765",
          level_interpolation_assumed: true,
          suppressed_by_backdoor_protection: true,
        }
      : null,
    backdoor: body.backdoor
      ? {
          applicable: true,
          protection_active: !body.backdoor.enemy_minion_nearby,
          damage_reduction: "0.80",
          damage_multiplier: "0.20",
          applies_to_true_damage: true,
          reactivation_delay_s: "3",
          seconds_until_active: null,
          explanation:
            "No qualifying minion nearby and the reactivation delay has elapsed, so the turret takes 80% reduced damage including true damage.",
        }
      : null,
    dependencies: {
      required_predecessors: [],
      targetability: body.base_state
        ? { targetable: true, blocked_by: [], explanation: "Outer turrets are always targetable." }
        : null,
    },
    explanation: "Outer turret at 11:40: 9000 max health.",
    provenance: PROVENANCE,
  };
}

/** Shaped from the live Nexus payload. */
function nexusFixture(body: StructureInspectRequest): StructureInspectResult {
  return {
    ...outerTurretFixture(body),
    identity: { structure: "nexus", kind: "nexus", display_name: "Nexus", lane: null },
    stats: {
      max_health: "5500",
      armor: "20",
      magic_resist: "0",
      health_regen_per_second: "20",
      last_hitter_gold: "50",
      respawn_after_s: null,
      count_per_team: 1,
    },
    plates: { applicable: false, reason: "Unknown turret tier <StructureClass.NEXUS: 'nexus'>" },
    warming_up: {
      applicable: false,
      reason: "Warming Up is a turret attack ramp; 'nexus' is not a turret.",
    },
    penetration: {
      flat_armor_penetration_applies: false,
      percent_armor_penetration_applies: false,
      armor_reduction_applies: true,
      magic_penetration_applies: false,
      magic_penetration_moot: true,
      critical_strike_applies: false,
      life_steal_applies: false,
    },
    bulwark: null,
    overgrowth: null,
    backdoor: null,
    dependencies: {
      required_predecessors: [
        "at least one enemy inhibitor, currently destroyed",
        "both nexus turrets",
      ],
      targetability: body.base_state
        ? {
            targetable: false,
            blocked_by: ["any inhibitor"],
            explanation:
              "The Nexus is only targetable while both its turrets as well as at least one inhibitor are destroyed.",
          }
        : null,
    },
    explanation: "Nexus: 5500 max health.",
  };
}

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
  mockInspect.mockImplementation(async (body) =>
    body.structure === "nexus" ? nexusFixture(body) : outerTurretFixture(body),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Structure Inspector", () => {
  it("requests the default outer turret with no optional sections", async () => {
    renderAt("/lol/mechanics?tool=structures&time=11:40");
    await waitFor(() =>
      expect(mockInspect).toHaveBeenCalledWith({ structure: "turret_outer", game_time_s: 700 }),
    );
    expect(await screen.findByTestId("structure-result")).toBeInTheDocument();
    expect(screen.getByText("9000")).toBeInTheDocument();
  });

  it("renders applicable plate data: unequal thresholds and the current gold bucket", async () => {
    renderAt("/lol/mechanics?tool=structures&time=11:40");
    expect(await screen.findByTestId("plate-gold")).toHaveTextContent("110g");
    const table = screen.getByTestId("plate-table");
    for (const fraction of ["10%", "25%", "45%", "70%", "100%"]) {
      expect(table).toHaveTextContent(fraction);
    }
    expect(table).toHaveTextContent("Destroys the turret");
    expect(table).toHaveTextContent("Grants a Bulwark stack");
    // Schedule text is backend-provided values, formatted.
    expect(screen.getByText(/120g base, dropping 10g per minute from 11:00/)).toBeInTheDocument();
  });

  it("renders Warming Up multipliers and reset behavior from the API", async () => {
    renderAt("/lol/mechanics?tool=structures&time=11:40");
    const warming = await screen.findByTestId("warming-up");
    expect(warming).toHaveTextContent("×1");
    expect(warming).toHaveTextContent("×2.5");
    expect(
      screen.getByText(/switching between champion targets does not reset it/),
    ).toBeInTheDocument();
  });

  it("switches structures and hides inapplicable sections with a friendly note", async () => {
    renderAt("/lol/mechanics?tool=structures&type=nexus&time=30:00");
    await waitFor(() =>
      expect(mockInspect).toHaveBeenCalledWith({ structure: "nexus", game_time_s: 1800 }),
    );
    expect(await screen.findByTestId("structure-result")).toBeInTheDocument();
    // No plate section, no plate table, no raw enum leak.
    expect(screen.queryByTestId("plate-table")).not.toBeInTheDocument();
    expect(screen.queryByText(/StructureClass/)).not.toBeInTheDocument();
    const notes = screen.getByTestId("not-applicable-notes");
    expect(notes).toHaveTextContent("Turret plates do not apply to the Nexus.");
    expect(notes).toHaveTextContent("Warming Up is a turret attack ramp");
    // Building stats render their own fields.
    expect(screen.getByText("Last-hit gold")).toBeInTheDocument();
    // Dependencies from the API.
    expect(screen.getByTestId("dependencies")).toHaveTextContent("both nexus turrets");
  });

  it("sends the Bulwark what-if and renders the returned stacks", async () => {
    renderAt("/lol/mechanics?tool=structures&time=11:40");
    await screen.findByTestId("structure-result");
    fireEvent.click(screen.getByRole("button", { name: "Inspect Bulwark" }));
    await waitFor(() =>
      expect(mockInspect).toHaveBeenCalledWith(
        expect.objectContaining({
          bulwark: { stacks: 1, nearby_enemy_champions: 1 },
        }),
      ),
    );
    const bulwark = await screen.findByTestId("bulwark-result");
    expect(bulwark).toHaveTextContent("40");
  });

  it("marks Crystalline Overgrowth values as Derived with the interpolation note", async () => {
    renderAt("/lol/mechanics?tool=structures&time=11:40");
    await screen.findByTestId("structure-result");
    fireEvent.click(screen.getByRole("button", { name: "Inspect Crystalline Overgrowth" }));
    await waitFor(() =>
      expect(mockInspect).toHaveBeenCalledWith(
        expect.objectContaining({
          overgrowth: { team_average_level: 10, seconds_since_available: 300 },
        }),
      ),
    );
    expect(await screen.findByTestId("overgrowth-damage")).toHaveTextContent("≈1040");
    expect(screen.getByText("Derived")).toBeInTheDocument();
    expect(screen.getByTestId("overgrowth-derived-note")).toHaveTextContent(
      /linear interpolation/,
    );
  });

  it("exposes backdoor as a plain enemy-minion-nearby scenario toggle", async () => {
    renderAt("/lol/mechanics?tool=structures&time=11:40");
    await screen.findByTestId("structure-result");
    fireEvent.click(screen.getByRole("button", { name: "Inspect Backdoor protection" }));
    // Default scenario: no minion nearby, 5s since the last one left.
    await waitFor(() =>
      expect(mockInspect).toHaveBeenCalledWith(
        expect.objectContaining({
          backdoor: { enemy_minion_nearby: false, seconds_since_minion_state_change: 5 },
        }),
      ),
    );
    const backdoor = await screen.findByTestId("backdoor-result");
    expect(backdoor).toHaveTextContent("Protection active");
    // No invented radius/distance control anywhere.
    expect(screen.queryByText(/radius/i)).not.toBeInTheDocument();
  });

  it("sends base state for targetability and renders the verdict", async () => {
    renderAt("/lol/mechanics?tool=structures&type=nexus&time=30:00");
    await screen.findByTestId("structure-result");
    fireEvent.click(screen.getByRole("button", { name: "Inspect Targetability" }));
    await waitFor(() =>
      expect(mockInspect).toHaveBeenCalledWith(
        expect.objectContaining({
          base_state: expect.objectContaining({ nexus_turrets_destroyed: 0 }),
        }),
      ),
    );
    // Nexus is not lane-bound: no lane is sent.
    const lastBody = mockInspect.mock.calls.at(-1)![0];
    expect(lastBody.lane).toBeUndefined();
    expect(await screen.findByTestId("targetability-verdict")).toHaveTextContent(
      "Not targetable in this scenario.",
    );
  });

  it("validates what-if inputs before requesting", async () => {
    renderAt("/lol/mechanics?tool=structures&time=11:40");
    await screen.findByTestId("structure-result");
    const calls = mockInspect.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Inspect Bulwark" }));
    fireEvent.change(screen.getByLabelText("Stacks (0–4)"), { target: { value: "9" } });
    expect(await screen.findByText(/Bulwark stacks must be a whole number/)).toBeInTheDocument();
    // No request carried stacks: 9.
    expect(
      mockInspect.mock.calls
        .slice(calls)
        .some(([body]) => body.bulwark?.stacks === 9),
    ).toBe(false);
  });

  it("shows loading and error states", async () => {
    mockInspect.mockImplementation(() => new Promise(() => {}));
    renderAt("/lol/mechanics?tool=structures&time=11:40");
    expect(await screen.findByTestId("mechanics-result-skeleton")).toBeInTheDocument();
    cleanup();

    mockInspect.mockRejectedValue(new Error("Patch '25.24' is outside the certified range."));
    renderAt("/lol/mechanics?tool=structures&time=11:40");
    expect(
      await screen.findByText("Patch '25.24' is outside the certified range."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("Structure inspect controls (5B4)", () => {
  it("scenario controls are inspect/expand disclosures, not top-level switches", async () => {
    renderAt("/lol/mechanics?tool=structures&time=11:40");
    await screen.findByTestId("structure-result");
    // No top-level mechanic on/off switches remain…
    expect(screen.queryByRole("switch", { name: "Bulwark stacks" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Backdoor protection" })).not.toBeInTheDocument();
    // …the controls are expandable inspect buttons.
    const inspect = screen.getByRole("button", { name: "Inspect Bulwark" });
    expect(inspect).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(inspect);
    expect(inspect).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Stacks (0–4)")).toBeInTheDocument();
  });

  it("the nested enemy-minion-nearby boolean still works inside the disclosure", async () => {
    renderAt("/lol/mechanics?tool=structures&time=11:40");
    await screen.findByTestId("structure-result");
    fireEvent.click(screen.getByRole("button", { name: "Inspect Backdoor protection" }));
    const nearby = screen.getByRole("switch", { name: "Enemy minion nearby" });
    fireEvent.click(nearby);
    await waitFor(() =>
      expect(mockInspect).toHaveBeenCalledWith(
        expect.objectContaining({ backdoor: { enemy_minion_nearby: true } }),
      ),
    );
  });

  it("groups the result under the four 5B4 headings with all content intact", async () => {
    renderAt("/lol/mechanics?tool=structures&time=11:40");
    await screen.findByTestId("structure-result");
    for (const heading of ["Base stats", "Turret plates", "Combat rules"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    // All pre-5B4 content still renders.
    expect(screen.getByTestId("plate-table")).toBeInTheDocument();
    expect(screen.getByTestId("warming-up")).toBeInTheDocument();
    expect(screen.getByTestId("penetration")).toBeInTheDocument();
    expect(screen.getByTestId("dependencies")).toBeInTheDocument();
  });
});
