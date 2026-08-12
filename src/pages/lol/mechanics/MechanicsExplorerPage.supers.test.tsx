import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MechanicsExplorerPage from "./MechanicsExplorerPage";
import {
  fetchExplorerContext,
  postSupersState,
  type LaneToken,
  type SupersLaneState,
  type SupersStateResult,
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
    postSupersState: vi.fn(),
  };
});

const mockContext = vi.mocked(fetchExplorerContext);
const mockSupers = vi.mocked(postSupersState);

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const PROVENANCE = [
  {
    mechanic_id: "wave.super.counts",
    status: "verified",
    effective_patch: "26.01",
    verified_through: "26.15",
    empirical_test_required: false,
    caveat: "Two destroyed inhibitors do NOT give two supers in those lanes.",
  },
  {
    mechanic_id: "wave.super.cutoff",
    status: "verified",
    effective_patch: "26.01",
    verified_through: "26.15",
    empirical_test_required: false,
    caveat: "This is a LOOK-AHEAD on the scheduled respawn.",
  },
];

/** Shaped from the live deployed 5A payloads. */
function standingLane(): SupersLaneState {
  return {
    inhibitor: {
      down_at_spawn: false,
      destroyed_at_s: null,
      respawn_at_s: null,
      respawn_display: null,
    },
    super_minion_count: 0,
    suppressed_by_cutoff: false,
    waves_until_respawn: null,
    composition: { melee: 3, caster: 3, cannon: 0, super: 0 },
    is_cannon_wave: false,
    siege_replaced_by_super: false,
    explanation: "The inhibitor is not destroyed at this wave, so this lane gets no super minions.",
    provenance: PROVENANCE,
  };
}

function downLane(count: number): SupersLaneState {
  return {
    ...standingLane(),
    inhibitor: {
      down_at_spawn: true,
      destroyed_at_s: 900,
      respawn_at_s: 1200,
      respawn_display: "20:00",
    },
    super_minion_count: count,
    waves_until_respawn: 8,
    composition: { melee: 3, caster: 3, cannon: 0, super: count },
    siege_replaced_by_super: true,
    explanation:
      count === 2
        ? "All three inhibitors are destroyed, so every lane gets two super minions."
        : "The inhibitor is destroyed, so this lane gets one super minion.",
  };
}

function cutoffLane(): SupersLaneState {
  return {
    ...standingLane(),
    inhibitor: {
      down_at_spawn: true,
      destroyed_at_s: 600,
      respawn_at_s: 900,
      respawn_display: "15:00",
    },
    super_minion_count: 0,
    suppressed_by_cutoff: true,
    waves_until_respawn: 2,
    explanation:
      "The top inhibitor is still down, but it respawns at 15:00 on wave 31, and super minions stop 2 waves before that.",
  };
}

function restoredLane(): SupersLaneState {
  return {
    ...standingLane(),
    inhibitor: {
      down_at_spawn: false,
      destroyed_at_s: 600,
      respawn_at_s: 900,
      respawn_display: "15:00",
    },
    explanation: "The inhibitor is not destroyed at this wave, so this lane gets no super minions.",
  };
}

function makeResult(
  lanes: Partial<Record<LaneToken, SupersLaneState>>,
  overrides: Partial<SupersStateResult> = {},
): SupersStateResult {
  return {
    context: { patch: "26.15", map: "summoners_rift", mode: "classic_5v5" },
    wave: { wave_number: 32, spawn_time_s: 940, spawn_time_display: "15:40" },
    derivation: { queried_by: "wave_number" },
    all_inhibitors_down_at_spawn: false,
    lanes: {
      top: lanes.top ?? standingLane(),
      middle: lanes.middle ?? standingLane(),
      bottom: lanes.bottom ?? standingLane(),
    },
    explanation: "Wave 32 spawns at 15:40.",
    ...overrides,
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
  mockSupers.mockResolvedValue(makeResult({}));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Supers explorer", () => {
  it("requests with no inhibitors and renders three standing lanes", async () => {
    renderAt("/lol/mechanics?tool=supers&wave=32");
    await waitFor(() =>
      expect(mockSupers).toHaveBeenCalledWith({ wave_number: 32, inhibitors: {} }),
    );
    expect(await screen.findByTestId("supers-board")).toBeInTheDocument();
    for (const lane of ["top", "middle", "bottom"]) {
      const card = screen.getByTestId(`supers-lane-${lane}`);
      expect(card).toHaveTextContent("Inhibitor standing");
      expect(card).toHaveTextContent("No supers");
    }
    expect(screen.queryByTestId("all-three-banner")).not.toBeInTheDocument();
  });

  it("marks a destroyed inhibitor and sends its timeline; one lane gets one super", async () => {
    mockSupers.mockResolvedValue(makeResult({ top: downLane(1) }));
    renderAt("/lol/mechanics?tool=supers&wave=32");
    await screen.findByTestId("supers-board");

    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Top inhibitor state" })).getByRole("radio", {
        name: "Destroyed",
      }),
    );
    fireEvent.change(screen.getByLabelText("Destroyed at"), { target: { value: "15:00" } });
    await waitFor(() =>
      expect(mockSupers).toHaveBeenCalledWith({
        wave_number: 32,
        inhibitors: { top: { destroyed_at_s: 900 } },
      }),
    );

    const top = await screen.findByTestId("supers-lane-top");
    expect(top).toHaveTextContent("1 Super");
    expect(top).toHaveTextContent("Inhibitor down — supers active");
    expect(top).toHaveTextContent("Inhibitor respawns at 20:00 · 8 waves until respawn");
    // Composition reflects super insertion and the replaced cannon slot.
    expect(screen.getByTestId("supers-composition-top")).toHaveTextContent("1 Super");
    expect(top).toHaveTextContent("cannon slot is replaced by the super minion");
    // Other lanes unaffected.
    expect(screen.getByTestId("supers-lane-middle")).toHaveTextContent("No supers");
    expect(screen.getByTestId("supers-lane-bottom")).toHaveTextContent("No supers");
  });

  it("two inhibitors down: one super each, never doubled, third lane unaffected", async () => {
    mockSupers.mockResolvedValue(makeResult({ top: downLane(1), middle: downLane(1) }));
    renderAt("/lol/mechanics?tool=supers&wave=32");
    expect(await screen.findByTestId("supers-board")).toBeInTheDocument();
    expect(screen.getByTestId("supers-lane-top")).toHaveTextContent("1 Super");
    expect(screen.getByTestId("supers-lane-middle")).toHaveTextContent("1 Super");
    expect(screen.getByTestId("supers-lane-bottom")).toHaveTextContent("No supers");
    expect(screen.queryByText("2 Supers")).not.toBeInTheDocument();
  });

  it("all three down: two supers in every lane, with the banner", async () => {
    mockSupers.mockResolvedValue(
      makeResult(
        { top: downLane(2), middle: downLane(2), bottom: downLane(2) },
        { all_inhibitors_down_at_spawn: true },
      ),
    );
    renderAt("/lol/mechanics?tool=supers&wave=32");
    expect(await screen.findByTestId("all-three-banner")).toHaveTextContent(
      "All three inhibitors down at spawn",
    );
    for (const lane of ["top", "middle", "bottom"]) {
      const card = screen.getByTestId(`supers-lane-${lane}`);
      expect(card).toHaveTextContent("2 Supers");
      expect(card).toHaveTextContent("every lane gets two super minions");
    }
  });

  it("renders the pre-respawn cutoff as an unmistakable distinct state", async () => {
    mockSupers.mockResolvedValue(makeResult({ top: cutoffLane() }));
    renderAt("/lol/mechanics?tool=supers&wave=29");
    const top = await screen.findByTestId("supers-lane-top");
    expect(top).toHaveTextContent("Down — pre-respawn cutoff");
    expect(top).toHaveTextContent("No supers");
    expect(top).toHaveTextContent("2 waves until respawn");
    // The backend's own reason, verbatim.
    expect(top).toHaveTextContent("super minions stop 2 waves before that");
    // The canonical rule statement is on the page (look-ahead, cadence-dependent).
    expect(screen.getByText(/two waves before/)).toBeInTheDocument();
    expect(screen.getByText(/look-ahead/)).toBeInTheDocument();
  });

  it("renders a restored inhibitor distinctly from never-destroyed", async () => {
    mockSupers.mockResolvedValue(makeResult({ top: restoredLane() }));
    renderAt("/lol/mechanics?tool=supers&wave=32");
    const top = await screen.findByTestId("supers-lane-top");
    expect(top).toHaveTextContent("Inhibitor restored");
    expect(top).toHaveTextContent("No supers");
  });

  it("presets populate inputs only and the backend is still asked", async () => {
    renderAt("/lol/mechanics?tool=supers&wave=5");
    await screen.findByTestId("supers-board");
    fireEvent.click(screen.getByRole("button", { name: "All three down" }));
    await waitFor(() =>
      expect(mockSupers).toHaveBeenCalledWith({
        wave_number: 32,
        inhibitors: {
          top: { destroyed_at_s: 900 },
          middle: { destroyed_at_s: 900 },
          bottom: { destroyed_at_s: 900 },
        },
      }),
    );
  });

  it("supports game-time queries with the derivation shown", async () => {
    mockSupers.mockResolvedValue(
      makeResult(
        {},
        {
          derivation: {
            queried_by: "game_time",
            game_time_s: 940,
            game_time_display: "15:40",
            resolution_rule: "most recent wave spawned at or before the query time",
          },
        },
      ),
    );
    renderAt("/lol/mechanics?tool=supers&at=15:40");
    await waitFor(() =>
      expect(mockSupers).toHaveBeenCalledWith({ game_time_s: 940, inhibitors: {} }),
    );
    expect(await screen.findByText(/Most recent wave at 15:40/)).toBeInTheDocument();
  });

  it("validates wave and lane-time inputs before requesting", async () => {
    renderAt("/lol/mechanics?tool=supers&wave=0");
    expect(
      await screen.findByText(/Wave number must be a whole number/),
    ).toBeInTheDocument();
    expect(mockSupers).not.toHaveBeenCalled();

    cleanup();
    renderAt("/lol/mechanics?tool=supers&wave=32");
    await screen.findByTestId("supers-board");
    // Toggling a lane fires a request with the valid default time first.
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Mid inhibitor state" })).getByRole("radio", {
        name: "Destroyed",
      }),
    );
    await waitFor(() =>
      expect(mockSupers).toHaveBeenCalledWith(
        expect.objectContaining({
          inhibitors: expect.objectContaining({ middle: { destroyed_at_s: 900 } }),
        }),
      ),
    );
    const calls = mockSupers.mock.calls.length;
    // An invalid destruction time blocks the request and hides the result.
    fireEvent.change(screen.getByLabelText("Destroyed at"), { target: { value: "banana" } });
    expect(
      await screen.findByText(/Mid inhibitor destruction time/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("supers-result")).not.toBeInTheDocument();
    expect(mockSupers.mock.calls.length).toBe(calls);
  });

  it("merges lane provenance into one deduplicated disclosure", async () => {
    renderAt("/lol/mechanics?tool=supers&wave=32");
    await screen.findByTestId("supers-board");
    // Both rules appear once despite being returned by all three lanes.
    expect(screen.getByText("Rules behind this result (2)")).toBeInTheDocument();
  });

  it("shows loading and error states", async () => {
    mockSupers.mockImplementation(() => new Promise(() => {}));
    renderAt("/lol/mechanics?tool=supers&wave=32");
    expect(await screen.findByTestId("mechanics-result-skeleton")).toBeInTheDocument();
    cleanup();

    mockSupers.mockRejectedValue(
      new Error("Provide exactly one of wave_number or game_time_s."),
    );
    renderAt("/lol/mechanics?tool=supers&wave=32");
    expect(
      await screen.findByText("Provide exactly one of wave_number or game_time_s."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("Supers inhibitor state control (5B4)", () => {
  it("exposes Standing and Destroyed as an explicit labeled two-state control", async () => {
    renderAt("/lol/mechanics?tool=supers&wave=32");
    await screen.findByTestId("supers-board");
    const topState = screen.getByRole("radiogroup", { name: "Top inhibitor state" });
    const standing = within(topState).getByRole("radio", { name: "Standing" });
    const destroyed = within(topState).getByRole("radio", { name: "Destroyed" });
    expect(standing).toHaveAttribute("aria-checked", "true");
    expect(destroyed).toHaveAttribute("aria-checked", "false");
    fireEvent.click(destroyed);
    expect(destroyed).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Destroyed at")).toBeInTheDocument();
  });

  it("features the cutoff preset prominently and keeps presets backend-driven", async () => {
    renderAt("/lol/mechanics?tool=supers&wave=32");
    await screen.findByTestId("supers-board");
    expect(screen.getByText("Try an example")).toBeInTheDocument();
    const featured = screen.getByRole("button", {
      name: /Inside respawn cutoff — see the unusual rule/,
    });
    const calls = mockSupers.mock.calls.length;
    fireEvent.click(featured);
    // The preset only populated inputs; the backend was asked again.
    await waitFor(() => expect(mockSupers.mock.calls.length).toBeGreaterThan(calls));
    expect(mockSupers).toHaveBeenCalledWith({
      wave_number: 29,
      inhibitors: { top: { destroyed_at_s: 600 } },
    });
  });
});
