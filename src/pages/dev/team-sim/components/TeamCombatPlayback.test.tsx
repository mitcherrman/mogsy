import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TeamCombatPlayback } from "./TeamCombatPlayback";
import {
  REAL_1V1,
  REAL_2V2,
  REAL_2V2_CALCULATION,
  REAL_ACTION_FAILED,
} from "@/lib/combat-lab/team-sim/__fixtures__";

describe("TeamCombatPlayback", () => {
  it("renders a two-lane timeline with one block per scheduler action", () => {
    render(<TeamCombatPlayback response={REAL_1V1} />);
    const blocks = screen.getAllByTestId("timeline-block");
    const schedulerActionCount = REAL_1V1.events.filter(
      (e) => e.source === "scheduler" && (e.type === "action_executed" || e.type === "action_failed")
    ).length;
    expect(blocks.length).toBe(schedulerActionCount);
  });

  it("renders HP before/after for the selected action straight from damage_accounting", () => {
    render(<TeamCombatPlayback response={REAL_1V1} />);
    const hpBars = screen.getByTestId("hp-bars");
    expect(within(hpBars).getByText(/Before:/)).toBeInTheDocument();
    expect(within(hpBars).getByText(/After:/)).toBeInTheDocument();
  });

  it("clicking a timeline block updates the calculator to that action (trace_detail=calculation)", () => {
    render(<TeamCombatPlayback response={REAL_2V2_CALCULATION} />);
    const blocks = screen.getAllByTestId("timeline-block");
    // Find the block for the recorded Lux Q action.
    const luxKernel = REAL_2V2_CALCULATION.events.find((e) => e.type === "champion_ability")!;
    const luxAction = REAL_2V2_CALCULATION.events.find(
      (e) =>
        e.source === "scheduler" &&
        e.type === "action_executed" &&
        e.actor_id === luxKernel.actor_id &&
        e.time === luxKernel.time
    )!;
    const target = blocks.find((b) => b.dataset.seq === String(luxAction.seq));
    expect(target).toBeDefined();
    fireEvent.click(target!);
    const calc = screen.getByTestId("calculator-panel");
    expect(within(calc).getByTestId("formula-text").textContent).toContain("MOD_Magic");
    // formula_bindings — the authoritative inputs the server's own evaluator
    // used — not a re-evaluation, not state_used.
    const bindingsTable = within(calc).getByTestId("formula-bindings-table");
    expect(bindingsTable.textContent).toContain("P_Q");
    expect(bindingsTable.textContent).toContain("5");
    expect(within(calc).getByTestId("pipeline-stages-table")).toBeInTheDocument();
  });

  it("shows neutral 'unavailable' copy for a basic attack — never asserts champion-runtime ownership it can't prove", () => {
    render(<TeamCombatPlayback response={REAL_1V1} />);
    // REAL_1V1 is a basic-attack-only 1v1: its first action carries no
    // champion_ability kernel event at all, so absence of formula evidence
    // proves nothing about WHY it's absent — the panel must not claim
    // "champion-specific runtime" here.
    const calc = screen.getByTestId("calculator-panel");
    expect(within(calc).getByTestId("formula-unavailable-note")).toBeInTheDocument();
    expect(within(calc).queryByTestId("champion-runtime-note")).not.toBeInTheDocument();
    expect(within(calc).queryByTestId("formula-bindings-table")).not.toBeInTheDocument();
    // The mitigation pipeline still renders even without formula evidence —
    // basic attacks carry it on a damage_packet kernel event.
    expect(within(calc).getByTestId("pipeline-stages-table")).toBeInTheDocument();
  });

  it("shows the formula (but no bindings table) for a generic-formula action when the response has no formula_bindings (e.g. trace_detail=full) — never labeled champion-runtime, never falls back to state_used", () => {
    render(<TeamCombatPlayback response={REAL_2V2} />);
    const blocks = screen.getAllByTestId("timeline-block");
    const luxKernel = REAL_2V2.events.find((e) => e.type === "champion_ability")!;
    const luxAction = REAL_2V2.events.find(
      (e) =>
        e.source === "scheduler" &&
        e.type === "action_executed" &&
        e.actor_id === luxKernel.actor_id &&
        e.time === luxKernel.time
    )!;
    const target = blocks.find((b) => b.dataset.seq === String(luxAction.seq));
    fireEvent.click(target!);
    const calc = screen.getByTestId("calculator-panel");
    // formula_status ("ok") is the reliable signal this WAS a generic-formula
    // action, so it must show the formula text it has, not a champion-runtime
    // or "unavailable" label.
    expect(within(calc).queryByTestId("champion-runtime-note")).not.toBeInTheDocument();
    expect(within(calc).queryByTestId("formula-unavailable-note")).not.toBeInTheDocument();
    expect(within(calc).getByTestId("formula-text").textContent).toContain("MOD_Magic");
    expect(within(calc).queryByTestId("formula-bindings-table")).not.toBeInTheDocument();
  });

  it("shows action_failed rows without a damage/HP claim", () => {
    render(<TeamCombatPlayback response={REAL_ACTION_FAILED} />);
    const failedBlock = screen
      .getAllByTestId("timeline-block")
      .find((b) => b.className.includes("border-destructive"));
    expect(failedBlock).toBeDefined();
  });

  it("play/pause/reset controls are present and reset returns to the first action", () => {
    render(<TeamCombatPlayback response={REAL_2V2} />);
    const playBtn = screen.getByTestId("playback-play-pause");
    expect(playBtn).toHaveTextContent("Play");
    fireEvent.click(playBtn);
    expect(playBtn).toHaveTextContent("Pause");
    fireEvent.click(screen.getByTestId("playback-reset"));
    expect(playBtn).toHaveTextContent("Play");
  });
});
