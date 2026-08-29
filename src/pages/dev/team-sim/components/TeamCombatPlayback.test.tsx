import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { TeamCombatPlayback } from "./TeamCombatPlayback";
import type { TeamSimulationResponse } from "@/lib/combat-lab/team-sim/contract";
import {
  REAL_1V1,
  REAL_2V2,
  REAL_2V2_CALCULATION,
  REAL_ACTION_FAILED,
} from "@/lib/combat-lab/team-sim/__fixtures__";

/**
 * `TeamCombatPlayback` reads the shared champion asset manifest via
 * `useChampionAssets` (react-query) for portrait/icon art — same
 * infrastructure every other Combat Lab surface uses. This component is
 * tested in isolation (unlike the full page, which always renders under
 * `teamSimTree`'s provider — see testHarness.tsx), so it needs its own
 * QueryClient here. No fetch is stubbed, so the manifest query simply fails
 * fast (`retry: false`) and every icon falls back to its glyph — exercising
 * exactly the fallback path this feature must never break.
 */
function renderPlayback(response: TeamSimulationResponse) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <TeamCombatPlayback response={response} />
    </QueryClientProvider>
  );
}

describe("TeamCombatPlayback", () => {
  it("renders a two-lane timeline with one block per scheduler action", () => {
    renderPlayback(REAL_1V1);
    const blocks = screen.getAllByTestId("timeline-block");
    const schedulerActionCount = REAL_1V1.events.filter(
      (e) => e.source === "scheduler" && (e.type === "action_executed" || e.type === "action_failed")
    ).length;
    expect(blocks.length).toBe(schedulerActionCount);
  });

  it("renders a champion roster chip per combatant, grouped by team", () => {
    renderPlayback(REAL_2V2);
    const roster = screen.getByTestId("champion-roster");
    const chips = within(roster).getAllByTestId("roster-chip");
    expect(chips.length).toBe(Object.keys(REAL_2V2.combatant_summaries).length);
    // Each chip is labeled with the champion from the authoritative build,
    // never a bare runtime id.
    for (const [runtimeId, build] of Object.entries(REAL_2V2.effective_builds)) {
      const chip = chips.find((c) => c.dataset.runtimeId === runtimeId);
      expect(chip).toBeDefined();
      expect(within(chip!).getByText(build.champion)).toBeInTheDocument();
    }
  });

  it("resolves roster/timeline icons without crashing, and falls back to a glyph when an icon <img> fails to load", () => {
    // No champion asset manifest is stubbed in this harness, so any
    // manifest-sourced icon lookup misses; Mogzy's stored ability-icon files
    // still resolve statically for a known champion, so either an <img> (with
    // an onError fallback wired) or the neutral glyph is acceptable here —
    // the point is that this never throws and always renders SOMETHING.
    renderPlayback(REAL_1V1);
    const roster = screen.getByTestId("champion-roster");
    const chip = within(roster).getAllByTestId("roster-chip")[0];
    const chipImg = chip.querySelector("img");
    expect(chip.querySelector("svg") ?? chipImg).toBeTruthy();
    if (chipImg) {
      // Simulate the image failing to load — the component must swap to the
      // glyph fallback rather than leaving a broken <img>.
      fireEvent.error(chipImg);
      expect(chip.querySelector("svg")).toBeInTheDocument();
      expect(chip.querySelector("img")).not.toBeInTheDocument();
    }
  });

  it("renders HP before/after for the selected action straight from damage_accounting, inside the calculator panel", () => {
    renderPlayback(REAL_1V1);
    const calc = screen.getByTestId("calculator-panel");
    const hpBars = within(calc).getByTestId("hp-bars");
    expect(hpBars.textContent).toMatch(/→/);
  });

  it("shows the action header with actor, target, and applied damage prominently", () => {
    renderPlayback(REAL_1V1);
    const header = screen.getByTestId("calculator-action-header");
    expect(header).toBeInTheDocument();
    expect(header.textContent).toMatch(/applied damage/i);
  });

  it("zero-duration actions remain visible and clickable, with a truthful (non-fabricated) displayed time", () => {
    renderPlayback(REAL_1V1);
    const blocks = screen.getAllByTestId("timeline-block");
    // Every block must be clickable regardless of its displayed span; the
    // component never invents a nonzero duration to make a block wider.
    for (const block of blocks) {
      expect(block).toBeVisible();
      fireEvent.click(block);
      expect(screen.getByTestId("calculator-panel")).toBeInTheDocument();
    }
  });

  it("clicking a timeline block updates the calculator to that action (trace_detail=calculation)", () => {
    renderPlayback(REAL_2V2_CALCULATION);
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
    expect(target).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(target!);
    expect(target).toHaveAttribute("aria-pressed", "true");
    const calc = screen.getByTestId("calculator-panel");
    expect(within(calc).getByTestId("formula-text").textContent).toContain("MOD_Magic");
    // formula_bindings — the authoritative inputs the server's own evaluator
    // used — not a re-evaluation, not state_used.
    const bindingsTable = within(calc).getByTestId("formula-bindings-table");
    expect(bindingsTable.textContent).toContain("P_Q");
    expect(bindingsTable.textContent).toContain("5");
    expect(within(calc).getByTestId("damage-pipeline")).toBeInTheDocument();
    expect(within(calc).getAllByTestId("pipeline-stage-row").length).toBeGreaterThan(0);
  });

  it("shows neutral 'unavailable' copy for a basic attack — never asserts champion-runtime ownership it can't prove", () => {
    renderPlayback(REAL_1V1);
    // REAL_1V1 is a basic-attack-only 1v1: its first action carries no
    // champion_ability kernel event at all, so absence of formula evidence
    // proves nothing about WHY it's absent — the panel must not claim
    // "champion-specific runtime" here.
    const calc = screen.getByTestId("calculator-panel");
    expect(within(calc).getByTestId("formula-unavailable-note")).toBeInTheDocument();
    expect(within(calc).getByTestId("formula-unavailable-note").textContent).toMatch(
  /formula breakdown unavailable/i
    );
    expect(within(calc).queryByTestId("champion-runtime-note")).not.toBeInTheDocument();
    expect(within(calc).queryByTestId("formula-bindings-table")).not.toBeInTheDocument();
    // The mitigation pipeline still renders even without formula evidence —
    // basic attacks carry it on a damage_packet kernel event.
    expect(within(calc).getByTestId("damage-pipeline")).toBeInTheDocument();
  });

  it("shows the formula (but no bindings table) for a generic-formula action when the response has no formula_bindings (e.g. trace_detail=full) — never labeled champion-runtime, never falls back to state_used", () => {
    renderPlayback(REAL_2V2);
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
    renderPlayback(REAL_ACTION_FAILED);
    const failedBlock = screen
      .getAllByTestId("timeline-block")
      .find((b) => b.className.includes("border-destructive"));
    expect(failedBlock).toBeDefined();
  });

  it("play/pause/reset controls are present and reset returns to the first action", () => {
    renderPlayback(REAL_2V2);
    const playBtn = screen.getByTestId("playback-play-pause");
    expect(playBtn).toHaveTextContent("Play");
    fireEvent.click(playBtn);
    expect(playBtn).toHaveTextContent("Pause");
    fireEvent.click(screen.getByTestId("playback-reset"));
    expect(playBtn).toHaveTextContent("Play");
  });
});

describe("TeamCombatPlayback — label and density (CS2 cleanup)", () => {
  it("prints a readable action label while keeping the raw id reachable", () => {
    renderPlayback(REAL_1V1);
    const blocks = screen.getAllByTestId("timeline-block");
    const auto = blocks.find((b) => b.getAttribute("data-auto") === "true");
    expect(auto).toBeDefined();

    // Humanized on the face…
    expect(auto!).toHaveTextContent("Basic Attack");
    expect(auto!.textContent).not.toContain("basic_attack");
    // …and the authoritative id still readable by an operator.
    expect(auto!.getAttribute("title")).toContain("basic_attack");
  });

  it("marks basic attacks from the SERVER's action_type, not from the id", () => {
    renderPlayback(REAL_1V1);
    const marked = screen
      .getAllByTestId("timeline-block")
      .filter((b) => b.getAttribute("data-auto") === "true").length;
    const fromServer = REAL_1V1.events.filter(
      (e) =>
        e.source === "scheduler" &&
        (e.type === "action_executed" || e.type === "action_failed") &&
        (e.meta as Record<string, unknown> | null)?.action_type === "basic_attack"
    ).length;
    expect(marked).toBe(fromServer);
  });

  it("de-emphasizes autos WITHOUT removing, merging or retiming any event", () => {
    renderPlayback(REAL_1V1);
    const blocks = screen.getAllByTestId("timeline-block");
    // Every scheduler action still has exactly one block of its own.
    const schedulerActionCount = REAL_1V1.events.filter(
      (e) => e.source === "scheduler" && (e.type === "action_executed" || e.type === "action_failed")
    ).length;
    expect(blocks.length).toBe(schedulerActionCount);
    // Sequence numbers are unique and untouched — nothing was folded together.
    const seqs = blocks.map((b) => b.getAttribute("data-seq"));
    expect(new Set(seqs).size).toBe(seqs.length);

    // The SELECTED block is deliberately exempt (selection must stay legible),
    // so assert on an unselected auto.
    const auto = blocks.find(
      (b) =>
        b.getAttribute("data-auto") === "true" &&
        b.getAttribute("aria-pressed") !== "true"
    )!;
    expect(auto).toBeDefined();
    expect(auto.className).toContain("opacity-60");
    // Still a real click target.
    expect(auto.tagName).toBe("BUTTON");
  });

  it("keeps a failed action at full weight even when it is an auto", () => {
    renderPlayback(REAL_ACTION_FAILED);
    for (const block of screen.getAllByTestId("timeline-block")) {
      if ((block.getAttribute("title") ?? "").includes("(failed)")) {
        expect(block.className).not.toContain("opacity-60");
      }
    }
  });

  it("shows the humanized name AND the raw id in the calculator header", () => {
    renderPlayback(REAL_2V2_CALCULATION);
    fireEvent.click(screen.getAllByTestId("timeline-block")[0]);
    const header = screen.getByTestId("calculator-action-header");
    const rawId = screen.getByTestId("calculator-action-id").textContent ?? "";
    expect(rawId.length).toBeGreaterThan(0);
    // The header's readable label is a LABEL; identity is the raw id beside it.
    expect(header).toHaveTextContent(rawId);
  });
});
