import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import WaveBreakpointsSection from "./WaveBreakpointsSection";

const ANALYSIS_RESPONSE = {
  request_summary: {},
  generation: {
    ruleset_id: "sr_classic_waves.v26_01",
    effective_patch: "26.01",
    verified_through: "26.15",
    waves: [],
  },
  simulation: { warnings: [] },
  target_level_breakpoints: [
    {
      target_level: 2,
      reached: true,
      wave_number: 2,
      event_id: "w2-melee-1",
      minion_type: "melee",
      sequence_within_wave: 1,
      global_sequence: 7,
      spawn_time_seconds: 60,
      spawn_time_display: "1:00",
      cumulative_xp: "341",
      xp_over_threshold: "61",
    },
    {
      target_level: 4,
      reached: false,
      wave_number: null,
      event_id: null,
      minion_type: null,
      sequence_within_wave: null,
      global_sequence: null,
      spawn_time_seconds: null,
      spawn_time_display: null,
      cumulative_xp: null,
      xp_over_threshold: null,
    },
  ],
  unreached_targets: [4],
  wave_summaries: [
    {
      wave_number: 1,
      spawn_time_seconds: 30,
      spawn_time_display: "0:30",
      is_cannon_wave: false,
      minion_counts: { melee: 3, caster: 3, cannon: 0, super: 0 },
      omitted_count: 0,
      wave_xp: "279",
      cumulative_xp_after_wave: "279",
      level_after_wave: 1,
    },
  ],
  omitted_events: [],
  warnings: [
    "breakpoint times are wave spawn times at the Nexus, not predicted minion death times; minion deaths are not simulated",
  ],
  applied_rules: [
    {
      rule_id: "wave.timing.spawn_schedule",
      description: "Wave spawn timing",
      status: "verified",
      sources: [
        {
          name: "League Wiki: Minion",
          location: "https://wiki.leagueoflegends.com/en-us/Minion",
          source_class: "maintained_reference",
        },
      ],
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WaveBreakpointsSection", () => {
  it("renders breakpoint cards, wave table, and warnings from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ANALYSIS_RESPONSE,
      }),
    );
    render(<WaveBreakpointsSection />);
    fireEvent.click(screen.getByRole("button", { name: /analyze breakpoints/i }));

    await waitFor(() =>
      expect(screen.getByTestId("wave-breakpoints-result")).toBeTruthy(),
    );
    expect(screen.getByText("Level 2")).toBeTruthy();
    expect(screen.getByText("w2-melee-1")).toBeTruthy();
    expect(screen.getByText(/not reached in the requested wave range/i)).toBeTruthy();
    expect(
      screen.getByText(/not predicted minion death times/i),
    ).toBeTruthy();
    expect(screen.getByText("wave.timing.spawn_schedule")).toBeTruthy();
    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(body.wave_count).toBe(3);
    expect(body.target_levels).toEqual([2, 3]);
  });

  it("surfaces backend fail-closed errors verbatim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          detail: "Patch '25.24' is outside the certified range",
        }),
      }),
    );
    render(<WaveBreakpointsSection />);
    fireEvent.click(screen.getByRole("button", { name: /analyze breakpoints/i }));

    await waitFor(() =>
      expect(screen.getByTestId("wave-breakpoints-error").textContent).toContain(
        "certified range",
      ),
    );
    expect(screen.queryByTestId("wave-breakpoints-result")).toBeNull();
  });
});
