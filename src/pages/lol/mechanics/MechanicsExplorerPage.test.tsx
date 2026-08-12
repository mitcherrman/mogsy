import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MechanicsExplorerPage from "./MechanicsExplorerPage";
import {
  fetchExplorerContext,
  fetchRespawn,
  fetchWaveByNumber,
  fetchWaveByTime,
} from "@/lib/mechanics-explorer/api";

// Mock only the network functions; keep parsing/formatting helpers real so
// the input → request mapping is exercised end to end.
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
const mockRespawn = vi.mocked(fetchRespawn);
const mockWaveByNumber = vi.mocked(fetchWaveByNumber);
const mockWaveByTime = vi.mocked(fetchWaveByTime);

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const CONTEXT = {
  default_patch: "26.15",
  map: "summoners_rift",
  mode: "classic_5v5",
  unsupported_context_behavior: "fails closed",
  surfaces: {},
} as never;

const RESPAWN_PROVENANCE = [
  {
    mechanic_id: "respawn.brw.levels_1_18",
    status: "verified",
    effective_patch: "8.13",
    verified_through: "26.15",
    empirical_test_required: false,
    caveat: "",
  },
];

const REQUEST_CONTEXT = { patch: "26.15", map: "summoners_rift", mode: "classic_5v5" };

const RESPAWN_NORMAL = {
  context: REQUEST_CONTEXT,
  input: { level: 11, game_time_s: "1275", game_time_display: "21:15" },
  base_respawn_wait_s: "35",
  time_increase_factor_percent: "5.525",
  time_increase_s: "1.93375",
  duration_s: "36.93375",
  displayed_timer_s: 37,
  tif_active: true,
  at_tif_cap: false,
  step_rule: "ceil_as_written",
  boundary: { on_step_boundary: false, alternate_duration_s: null },
  explanation: "At level 11, the base respawn is 35 seconds.",
  provenance: RESPAWN_PROVENANCE,
};

const RESPAWN_CAPPED = {
  ...RESPAWN_NORMAL,
  input: { level: 18, game_time_s: "3600", game_time_display: "60:00" },
  base_respawn_wait_s: "52.5",
  time_increase_factor_percent: "50",
  time_increase_s: "26.25",
  duration_s: "78.75",
  displayed_timer_s: 79,
  at_tif_cap: true,
  explanation: "The Time Increase Factor is at its 50% cap.",
};

const RESPAWN_BOUNDARY = {
  ...RESPAWN_NORMAL,
  input: { level: 14, game_time_s: "930", game_time_display: "15:30" },
  base_respawn_wait_s: "42.5",
  time_increase_factor_percent: "0.425",
  time_increase_s: "0.180625",
  duration_s: "42.680625",
  displayed_timer_s: 43,
  boundary: { on_step_boundary: true, alternate_duration_s: "42.86125" },
  explanation: "This instant lies exactly on a published 30-second step boundary.",
};

const WAVE_PROVENANCE = [
  {
    mechanic_id: "wave.timing.spawn_schedule",
    status: "verified",
    effective_patch: "26.01",
    verified_through: "26.15",
    empirical_test_required: false,
    caveat: "",
  },
];

const WAVE_29_DETAIL = {
  wave_number: 29,
  spawn_time_s: 865,
  spawn_time_display: "14:25",
  composition: { melee: 2, caster: 3, cannon: 1, super: 0 },
  is_cannon_wave: true,
  next_cannon_wave: { wave_number: 31, spawn_time_s: 915, spawn_time_display: "15:15" },
  cadence: {
    interval_before_s: 25,
    interval_after_s: 25,
    is_first_wave_of_game: false,
    is_first_wave_of_cadence: true,
    is_last_wave_of_cadence: false,
  },
  previous_wave: { wave_number: 28, spawn_time_s: 840, spawn_time_display: "14:00" },
  next_wave: { wave_number: 30, spawn_time_s: 890, spawn_time_display: "14:50" },
  provenance: WAVE_PROVENANCE,
};

const WAVE_29_RESULT = {
  context: REQUEST_CONTEXT,
  query: { by: "wave_number" as const, wave_number: 29 },
  wave: WAVE_29_DETAIL,
  next_wave_to_spawn: { wave_number: 30, spawn_time_s: 890, spawn_time_display: "14:50" },
  explanation: "Wave 29 spawns at 14:25 and is the first wave on the 25-second spawn cadence.",
  provenance: WAVE_PROVENANCE,
};

const WAVE_66_DETAIL = {
  ...WAVE_29_DETAIL,
  wave_number: 66,
  spawn_time_s: 1790,
  spawn_time_display: "29:50",
  composition: { melee: 3, caster: 3, cannon: 1, super: 0 },
  cadence: {
    interval_before_s: 25,
    interval_after_s: 20,
    is_first_wave_of_game: false,
    is_first_wave_of_cadence: false,
    is_last_wave_of_cadence: true,
  },
  previous_wave: { wave_number: 65, spawn_time_s: 1765, spawn_time_display: "29:25" },
  next_wave: { wave_number: 67, spawn_time_s: 1810, spawn_time_display: "30:10" },
};

const WAVE_AT_1800_RESULT = {
  context: REQUEST_CONTEXT,
  query: {
    by: "game_time" as const,
    game_time_s: 1800,
    game_time_display: "30:00",
    resolution_rule: "wave = most recent wave spawned at or before the query time",
  },
  wave: WAVE_66_DETAIL,
  next_wave_to_spawn: {
    wave_number: 67,
    spawn_time_s: 1810,
    spawn_time_display: "30:10",
    seconds_until_spawn: 10,
  },
  explanation: "Wave 66 spawns at 29:50.",
  provenance: WAVE_PROVENANCE,
};

function renderAt(url: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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
  mockContext.mockResolvedValue(CONTEXT);
  mockRespawn.mockImplementation(async ({ level, gameTimeS }) => {
    if (level === 18 && gameTimeS === 3600) return RESPAWN_CAPPED as never;
    if (level === 14 && gameTimeS === 930) return RESPAWN_BOUNDARY as never;
    return RESPAWN_NORMAL as never;
  });
  mockWaveByNumber.mockResolvedValue(WAVE_29_RESULT as never);
  mockWaveByTime.mockResolvedValue(WAVE_AT_1800_RESULT as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Mechanics Explorer shell", () => {
  it("renders the page, patch context, and all five active tabs at /lol/mechanics", async () => {
    renderAt("/lol/mechanics");
    expect(screen.getByRole("heading", { name: "Mechanics Explorer" })).toBeInTheDocument();
    expect(await screen.findByText("Patch 26.15")).toBeInTheDocument();
    expect(screen.getByText("Summoner's Rift")).toBeInTheDocument();

    // 5B3: every tool is live — no remaining "Soon" state.
    for (const name of [/Respawn/, /Waves/, /Minions/, /Structures/, /Supers/]) {
      expect(screen.getByRole("tab", { name })).toBeEnabled();
    }
    expect(screen.queryByText("Soon")).not.toBeInTheDocument();
  });

  it("surfaces a context error with a retry affordance", async () => {
    mockContext.mockRejectedValue(new Error("backend unreachable"));
    renderAt("/lol/mechanics");
    expect(await screen.findByText("backend unreachable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("Respawn calculator", () => {
  it("maps default level/time inputs to the API request and renders the result", async () => {
    renderAt("/lol/mechanics");
    await waitFor(() =>
      expect(mockRespawn).toHaveBeenCalledWith({ level: 11, gameTimeS: 1275 }),
    );
    expect((await screen.findAllByText("37s")).length).toBeGreaterThan(0);
    const flow = screen.getByTestId("respawn-flow");
    expect(flow).toHaveTextContent("35s");
    expect(flow).toHaveTextContent("+1.93s");
    expect(flow).toHaveTextContent("TIF (+5.53%)");
    expect(flow).toHaveTextContent("36.93s");
    expect(flow).toHaveTextContent("37s");
    // Full precision stays available in the backend explanation below.
    expect(screen.getByText(/base respawn is 35 seconds/)).toBeInTheDocument();
    // No boundary block and no cap note in the normal case.
    expect(screen.queryByTestId("respawn-boundary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tif-cap-note")).not.toBeInTheDocument();
  });

  it("renders the TIF cap state", async () => {
    renderAt("/lol/mechanics?tool=respawn&level=18&time=60:00");
    expect((await screen.findAllByText("79s")).length).toBeGreaterThan(0);
    expect(screen.getByTestId("tif-cap-note")).toBeInTheDocument();
    expect(mockRespawn).toHaveBeenCalledWith({ level: 18, gameTimeS: 3600 });
  });

  it("shows the exact-boundary block with the alternate reading, uncollapsed", async () => {
    renderAt("/lol/mechanics?tool=respawn&level=14&time=15:30");
    expect((await screen.findAllByText("43s")).length).toBeGreaterThan(0);
    const boundary = screen.getByTestId("respawn-boundary");
    expect(boundary).toHaveTextContent("42.86");
    expect(boundary).toHaveTextContent("ceil_as_written");
    expect(boundary).toHaveTextContent(/canonical reading/i);
  });

  it("rejects invalid game-time input without firing a request or showing stale results", async () => {
    renderAt("/lol/mechanics");
    await screen.findAllByText("37s");
    const calls = mockRespawn.mock.calls.length;

    fireEvent.change(screen.getByLabelText("Game time of death"), {
      target: { value: "banana" },
    });
    expect(
      await screen.findByText(/Use MM:SS/, { exact: false }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("respawn-result")).not.toBeInTheDocument();
    expect(mockRespawn.mock.calls.length).toBe(calls);
  });

  it("shows a loading skeleton while the respawn request is in flight", async () => {
    mockRespawn.mockImplementation(() => new Promise(() => {}));
    renderAt("/lol/mechanics");
    expect(await screen.findByTestId("mechanics-result-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("respawn-result")).not.toBeInTheDocument();
  });
});

describe("Wave timeline", () => {
  it("looks up a wave by number and renders composition, cannon and neighbors", async () => {
    renderAt("/lol/mechanics?tool=waves&wave=29");
    await waitFor(() => expect(mockWaveByNumber).toHaveBeenCalledWith(29));
    expect(await screen.findByText("14:25")).toBeInTheDocument();
    expect(screen.getByText("Cannon wave")).toBeInTheDocument();

    const composition = screen.getByTestId("wave-composition");
    expect(composition).toHaveTextContent("2 Melee");
    expect(composition).toHaveTextContent("3 Caster");
    expect(composition).toHaveTextContent("1 Cannon");

    const neighbors = screen.getByTestId("wave-neighbors");
    expect(neighbors).toHaveTextContent("Wave 28");
    expect(neighbors).toHaveTextContent("Wave 30");
    expect(screen.getByTestId("cadence-transition")).toHaveTextContent(
      "First wave on the 25-second spawn cadence.",
    );
    // 5B4 wording: an explicit list from returned composition, never "including".
    expect(
      screen.getByText(
        /Wave 29 spawns at 14:25 with 2 melee minions, 3 caster minions, and 1 cannon minion\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/including a cannon/)).not.toBeInTheDocument();
  });

  it("handles the 30:00 canonical edge: wave 66 most recent, wave 67 next", async () => {
    renderAt("/lol/mechanics?tool=waves&at=30:00");
    await waitFor(() => expect(mockWaveByTime).toHaveBeenCalledWith(1800));
    // Most recent spawn is 66 at 29:50 — never a fabricated wave at 30:00.
    expect(await screen.findByText("66")).toBeInTheDocument();
    expect(screen.getByText("29:50")).toBeInTheDocument();
    const next = screen.getByTestId("next-wave-to-spawn");
    expect(next).toHaveTextContent("Wave 67");
    expect(next).toHaveTextContent("30:10");
    expect(next).toHaveTextContent("in 10s");
  });

  it("validates wave-number input before requesting", async () => {
    renderAt("/lol/mechanics?tool=waves&wave=0");
    expect(
      await screen.findByText(/Wave number must be a whole number/),
    ).toBeInTheDocument();
    expect(mockWaveByNumber).not.toHaveBeenCalled();
  });

  it("renders a clean error banner with retry when the lookup fails", async () => {
    mockWaveByNumber.mockRejectedValue(new Error("Patch '25.24' is outside the certified range."));
    renderAt("/lol/mechanics?tool=waves&wave=29");
    expect(
      await screen.findByText("Patch '25.24' is outside the certified range."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
