import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { CalculationInspector, type CalculationInspectorEntry } from "./CalculationInspector";
import type { TimelineEvent, SandboxStepResponse } from "@/lib/combat-lab/api";

/**
 * No fetch is stubbed, so `useChampionAssets` fails fast (retry: false) and
 * every icon falls back to its glyph — this exercises the same fallback path
 * `TeamCombatPlayback.test.tsx` relies on for the same hook.
 */
function renderInspector(entry: CalculationInspectorEntry | null, attackerChampion?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <CalculationInspector entry={entry} attackerChampion={attackerChampion} />
    </QueryClientProvider>
  );
}

function formulaAbilityEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    type: "champion_ability",
    source: "Ashe",
    final_damage: 202,
    damage_type: "magic",
    metadata: {
      formula_text: "(40 + 40 * P_Q + 0.8 * AP) * MOD_Magic",
      formula_bindings: { P_Q: 5, AP: 0, MOD_Magic: 1 },
      formula_status: "ok",
      formula_found: true,
      raw_damage_before_pipeline: 240,
      target_damage_after_defenses: 184,
      damage_after_modifiers: 202,
      post_mitigation_damage: 202,
      target_shield_absorbed: 40,
    },
    ...overrides,
  } as TimelineEvent;
}

function responseWithPrimaryHp(hp_before: number, hp_after: number): SandboxStepResponse {
  return {
    damage_accounting: {
      total_applied_hp_damage: hp_before - hp_after,
      by_scope: {
        PRIMARY: { hp_before, hp_after, applied_hp_damage: hp_before - hp_after },
      },
    },
  } as unknown as SandboxStepResponse;
}

describe("CalculationInspector", () => {
  it("shows a neutral placeholder when no action has happened yet", () => {
    renderInspector(null);
    expect(screen.getByTestId("calculation-inspector")).toHaveTextContent(
      "Perform an action to see the calculation"
    );
  });

  it("renders formula text and bindings from server evidence, behind a collapsed toggle by default", () => {
    const entry: CalculationInspectorEntry = {
      label: "Q",
      action_id: "q",
      attacker: "Ashe",
      defender: "Target Dummy",
      events: [formulaAbilityEvent()],
      response: responseWithPrimaryHp(1420, 1258),
    };
    renderInspector(entry, "Ashe");

    expect(screen.getByTestId("formula-text")).toHaveTextContent(
      "(40 + 40 * P_Q + 0.8 * AP) * MOD_Magic"
    );

    // Resolved inputs are collapsed until the viewer asks for them.
    expect(screen.queryByTestId("formula-bindings-table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("calculation-inputs-toggle"));
    const table = screen.getByTestId("formula-bindings-table");
    expect(within(table).getByText("P_Q")).toBeInTheDocument();
    expect(within(table).getByText("AP")).toBeInTheDocument();
  });

  it("renders the damage-mitigation pipeline and shield absorption from server evidence", () => {
    const entry: CalculationInspectorEntry = {
      label: "Q",
      action_id: "q",
      attacker: "Ashe",
      defender: "Target Dummy",
      events: [formulaAbilityEvent()],
      response: responseWithPrimaryHp(1420, 1258),
    };
    renderInspector(entry, "Ashe");

    const pipeline = screen.getByTestId("damage-pipeline");
    const rows = within(pipeline).getAllByTestId("pipeline-stage-row");
    expect(rows.length).toBeGreaterThan(0);
    expect(pipeline).toHaveTextContent("202");
    expect(pipeline).toHaveTextContent("Shield absorbs");
    expect(pipeline).toHaveTextContent("40");
  });

  it("renders HP before/after straight from damage_accounting, never re-derived", () => {
    const entry: CalculationInspectorEntry = {
      label: "Q",
      action_id: "q",
      attacker: "Ashe",
      defender: "Target Dummy",
      events: [formulaAbilityEvent()],
      response: responseWithPrimaryHp(1420, 1258),
    };
    renderInspector(entry, "Ashe");

    const hp = screen.getByTestId("hp-result");
    expect(hp).toHaveTextContent("1,420");
    expect(hp).toHaveTextContent("1,258");
  });

  it("shows neutral copy, not a blank panel, when a basic attack carries no formula evidence", () => {
    const basicAttackEvent: TimelineEvent = {
      type: "damage_packet",
      source: "Ashe",
      final_damage: 60,
      damage_type: "physical",
      metadata: {
        raw_damage_before_pipeline: 70,
        post_mitigation_damage: 60,
      },
    } as TimelineEvent;
    const entry: CalculationInspectorEntry = {
      label: "Basic Attack",
      attacker: "Ashe",
      defender: "Target Dummy",
      events: [basicAttackEvent],
      response: responseWithPrimaryHp(1420, 1360),
    };
    renderInspector(entry, "Ashe");

    expect(screen.getByTestId("formula-unavailable-note")).toBeInTheDocument();
    expect(screen.queryByTestId("formula-text")).not.toBeInTheDocument();
    // The mitigation pipeline present on the basic attack's own event still renders.
    expect(screen.getByTestId("damage-pipeline")).toHaveTextContent("60");
    expect(screen.getByTestId("hp-result")).toHaveTextContent("1,360");
  });

  it("labels a champion-runtime action distinctly from a plain missing-evidence action", () => {
    const runtimeEvent: TimelineEvent = {
      type: "champion_ability",
      source: "Sylas",
      final_damage: 120,
      damage_type: "magic",
      metadata: {},
    } as TimelineEvent;
    const entry: CalculationInspectorEntry = {
      label: "Q",
      attacker: "Sylas",
      defender: "Target Dummy",
      events: [runtimeEvent],
      response: responseWithPrimaryHp(1000, 880),
    };
    renderInspector(entry, "Sylas");

    expect(screen.getByTestId("champion-runtime-note")).toBeInTheDocument();
    expect(screen.queryByTestId("formula-unavailable-note")).not.toBeInTheDocument();
  });

  it("renders outgoing/incoming amp stages only when the server actually applied one, using the real field names (verified against a live Annie Q response)", () => {
    // Field names and shape confirmed against an actual
    // POST /api/combat-lab/active response for Annie Q with an amp active —
    // not inferred from the shared engine's source.
    const ampedEvent = formulaAbilityEvent({
      metadata: {
        formula_text: "(40 + 40 * P_Q + 0,8 * AP) * MOD_Magic",
        formula_bindings: { P_Q: 5, AP: 90, MOD_Magic: 1 },
        formula_status: "ok",
        formula_found: true,
        raw_damage_before_pipeline: 312,
        post_mitigation_damage: 240,
        attacker_outgoing_damage_amp_percent: 10,
        post_outgoing_amp_damage: 264,
        target_damage_taken_amp_percent: 0,
        post_amp_damage: 264,
        target_damage_after_reduction: 264,
        target_shield_before: 100,
        target_shield_absorbed: 100,
        target_shield_after: 0,
        target_damage_after_defenses: 164,
        applied_hp_damage: 164,
      },
    } as Partial<TimelineEvent>);
    const entry: CalculationInspectorEntry = {
      label: "Q",
      action_id: "q",
      attacker: "Annie",
      defender: "Target Dummy",
      events: [ampedEvent],
      response: responseWithPrimaryHp(2000, 1836),
    };
    renderInspector(entry, "Annie");

    const pipeline = screen.getByTestId("damage-pipeline");
    expect(pipeline).toHaveTextContent("Outgoing damage amp (+10%)");
    expect(pipeline).toHaveTextContent("264");
    // No incoming amp was applied (0%) — that stage must not appear as a
    // redundant "+0%" row.
    expect(pipeline).not.toHaveTextContent("Incoming damage amp");
    expect(pipeline).toHaveTextContent("Shield absorbs");
    expect(pipeline).toHaveTextContent("100");
  });

  it("omits both amp stages entirely for an action where neither amp fired, rather than showing +0% noise", () => {
    const entry: CalculationInspectorEntry = {
      label: "Q",
      action_id: "q",
      attacker: "Annie",
      defender: "Target Dummy",
      events: [formulaAbilityEvent()],
      response: responseWithPrimaryHp(1420, 1258),
    };
    renderInspector(entry, "Annie");
    const pipeline = screen.getByTestId("damage-pipeline");
    expect(pipeline).not.toHaveTextContent("amp");
  });

  it("falls back to a neutral glyph when the ability/champion icon fails to load", () => {
    const entry: CalculationInspectorEntry = {
      label: "Q",
      action_id: "q",
      attacker: "Ashe",
      defender: "Target Dummy",
      events: [formulaAbilityEvent()],
      response: responseWithPrimaryHp(1420, 1258),
    };
    renderInspector(entry, "Ashe");
    const header = screen.getByTestId("calculation-header");
    const img = header.querySelector("img");
    if (img) {
      fireEvent.error(img);
      expect(header.querySelector("svg")).toBeInTheDocument();
      expect(header.querySelector("img")).not.toBeInTheDocument();
    } else {
      expect(header.querySelector("svg")).toBeInTheDocument();
    }
  });
});
