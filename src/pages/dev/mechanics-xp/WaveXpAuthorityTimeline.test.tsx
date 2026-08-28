import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WaveXpAuthorityTimeline from "./WaveXpAuthorityTimeline";
import * as api from "./api";

const ROW = {
  wave_number: 2,
  spawn_time_seconds: 90,
  spawn_time_display: "1:30",
  melee_count: 3,
  caster_count: 3,
  cannon_count: 0,
  is_cannon_wave: false,
  solo_wave_xp: "100",
  solo_cumulative_xp: "200",
  duo_wave_xp_per_player: "60",
  duo_cumulative_xp_per_player: "120",
  solo_level_breakpoint_note: "Level 2 (1st melee in wave)",
  duo_level_breakpoint_note: "Level 2 (3rd melee in wave)",
};

describe("WaveXpAuthorityTimeline", () => {
  it("renders rows from the backend authority and shows level-breakpoint badges", async () => {
    vi.spyOn(api, "fetchWaveXpAuthority").mockResolvedValue({
      patch: "26.15",
      map: "summoners_rift",
      mode: "classic",
      rows: [ROW],
      warnings: ["level breakpoints are asserted at wave (spawn-time) granularity"],
    });

    render(<WaveXpAuthorityTimeline />);

    await waitFor(() => expect(screen.getByTestId("wave-row-2")).toBeInTheDocument());
    expect(screen.getByText("1:30")).toBeInTheDocument();
    expect(screen.getByText(/Level 2 \(1st melee in wave\)/)).toBeInTheDocument();
    expect(screen.getByText(/Level 2 \(3rd melee in wave\)/)).toBeInTheDocument();
  });

  it("shows wave detail on row select", async () => {
    vi.spyOn(api, "fetchWaveXpAuthority").mockResolvedValue({
      patch: "26.15",
      map: "summoners_rift",
      mode: "classic",
      rows: [ROW],
      warnings: [],
    });

    render(<WaveXpAuthorityTimeline />);

    await waitFor(() => expect(screen.getByTestId("wave-row-2")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("wave-row-2"));

    expect(screen.getByTestId("wave-xp-authority-detail")).toBeInTheDocument();
  });
});
