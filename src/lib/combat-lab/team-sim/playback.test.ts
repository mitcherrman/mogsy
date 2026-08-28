/**
 * playback.ts derivations, asserted against real recorded responses.
 */
import { describe, expect, it } from "vitest";

import {
  actionSpan,
  buildPlaybackActions,
  formulaDiagnostics,
  hasNoFormulaEvidence,
  isChampionRuntimeAction,
  pipelineEventFor,
  pipelineStages,
  primaryHp,
  shieldAbsorbed,
} from "./playback";
import { REAL_1V1, REAL_2V2, REAL_2V2_CALCULATION, REAL_ACTION_FAILED } from "./__fixtures__";

describe("buildPlaybackActions", () => {
  it("returns every scheduler action row in chronological (seq) order", () => {
    const actions = buildPlaybackActions(REAL_1V1);
    expect(actions.length).toBeGreaterThan(0);
    for (let i = 1; i < actions.length; i++) {
      expect(actions[i].seq).toBeGreaterThan(actions[i - 1].seq);
    }
    for (const a of actions) {
      expect(["scheduler"]).toContain(a.event.source);
    }
  });

  it("reads HP before/after straight from damage_accounting.by_scope.PRIMARY, never computed", () => {
    const actions = buildPlaybackActions(REAL_1V1);
    const withDamage = actions.find((a) => a.damageAccounting?.by_scope?.PRIMARY);
    expect(withDamage).toBeDefined();
    const hp = primaryHp(withDamage!);
    expect(hp).not.toBeNull();
    // hp_after must equal exactly what the backend reported — no
    // hp_before - applied_hp_damage recomputation anywhere in this module.
    const raw = withDamage!.event.meta!.damage_accounting as any;
    expect(hp!.hp_after).toBe(raw.by_scope.PRIMARY.hp_after);
    expect(hp!.hp_before).toBe(raw.by_scope.PRIMARY.hp_before);
  });

  it("includes failed actions and marks them not-ok", () => {
    const actions = buildPlaybackActions(REAL_ACTION_FAILED);
    const failed = actions.filter((a) => !a.ok);
    expect(failed.length).toBeGreaterThan(0);
    for (const f of failed) expect(f.event.type).toBe("action_failed");
  });

  it("attaches kernel events sharing the same actor/action/time", () => {
    const actions = buildPlaybackActions(REAL_2V2);
    const withAbility = actions.find((a) =>
      a.kernelEvents.some((e) => e.type === "champion_ability")
    );
    expect(withAbility).toBeDefined();
    for (const k of withAbility!.kernelEvents) {
      expect(k.actor_id).toBe(withAbility!.actorId);
      expect(k.time).toBe(withAbility!.startTime);
    }
  });
});

describe("actionSpan", () => {
  it("is zero-width when the action carried no positive clock_after span", () => {
    const actions = buildPlaybackActions(REAL_1V1);
    const zero = actions.find((a) => a.resolutionTime === null || a.resolutionTime <= a.startTime);
    if (zero) {
      const span = actionSpan(zero);
      expect(span.end).toBe(span.start);
    }
  });

  it("spans start to clock_after when clock_after advances time", () => {
    const actions = buildPlaybackActions(REAL_1V1);
    const withSpan = actions.find(
      (a) => a.resolutionTime !== null && a.resolutionTime! > a.startTime
    );
    expect(withSpan).toBeDefined();
    const span = actionSpan(withSpan!);
    expect(span.start).toBe(withSpan!.startTime);
    expect(span.end).toBe(withSpan!.resolutionTime);
  });
});

describe("formulaDiagnostics / pipelineStages (real Lux Q event, trace_detail=calculation)", () => {
  const luxEvent = REAL_2V2_CALCULATION.events.find((e) => e.type === "champion_ability")!;

  it("reads formula_text and formula_bindings verbatim — CS2-2's authoritative evidence", () => {
    const diag = formulaDiagnostics(luxEvent);
    expect(diag).not.toBeNull();
    expect(diag!.formulaText).toBe("(40 + 40 * P_Q + 0,75 * AP) * MOD_Magic");
    expect(diag!.formulaStatus).toBe("ok");
    // Every value here is exactly what the server's own evaluator used — not
    // re-evaluated in this test or anywhere in the frontend.
    expect(diag!.formulaBindings).toEqual({ P_Q: 5, AP: 0, MOD_Magic: 1 });
  });

  it("returns only the pipeline stages actually present, never a padded fixed list", () => {
    const stages = pipelineStages(luxEvent);
    expect(stages.length).toBeGreaterThan(0);
    const keys = stages.map((s) => s.key);
    expect(keys).toContain("post_mitigation_damage");
    expect(keys).toContain("raw_damage_before_pipeline");
    // Every stage key must be a number that really appears in metadata.
    const metadata = (luxEvent.payload as any).metadata;
    for (const s of stages) expect(s.value).toBe(metadata[s.key]);
  });

  it("returns null for a non champion_ability kernel event", () => {
    const other = REAL_2V2_CALCULATION.events.find(
      (e) => e.source === "kernel" && e.type !== "champion_ability"
    );
    if (other) expect(formulaDiagnostics(other)).toBeNull();
  });
});

describe("formulaDiagnostics at trace_detail=full (pre-CS2-2 capture)", () => {
  it("carries no formula_bindings key at all — never fabricated, never state_used", () => {
    const luxEvent = REAL_2V2.events.find((e) => e.type === "champion_ability")!;
    const diag = formulaDiagnostics(luxEvent);
    expect(diag).not.toBeNull();
    expect(diag!.formulaBindings).toBeNull();
  });

  it("reads shield absorbed when the kernel event reports one", () => {
    const luxEvent = REAL_2V2.events.find((e) => e.type === "champion_ability")!;
    expect(shieldAbsorbed(luxEvent)).toBe(0);
  });
});

describe("isChampionRuntimeAction / hasNoFormulaEvidence — the labeling correction", () => {
  it("isChampionRuntimeAction is false for a generic-formula action even without formula_bindings (trace_detail=full) — missing bindings is a detail-level fact, not proof of champion-runtime", () => {
    const actions = buildPlaybackActions(REAL_2V2);
    const luxAction = actions.find((a) =>
      a.kernelEvents.some((e) => e.type === "champion_ability")
    );
    expect(luxAction).toBeDefined();
    // The event still carries formula_status ("ok"), which is the real
    // signal — so this must NOT be labeled champion-runtime.
    expect(isChampionRuntimeAction(luxAction!)).toBe(false);
    expect(hasNoFormulaEvidence(luxAction!)).toBe(false);
  });

  it("isChampionRuntimeAction is false for an action whose kernel event carries formula_bindings (trace_detail=calculation)", () => {
    const actions = buildPlaybackActions(REAL_2V2_CALCULATION);
    const luxAction = actions.find((a) =>
      a.kernelEvents.some((e) => e.type === "champion_ability")
    );
    expect(luxAction).toBeDefined();
    expect(isChampionRuntimeAction(luxAction!)).toBe(false);
  });

  it("a basic attack (no champion_ability kernel event) is 'no evidence', never asserted as champion-runtime", () => {
    const actions = buildPlaybackActions(REAL_1V1);
    const withoutFormula = actions.find(
      (a) => a.ok && !a.kernelEvents.some((e) => formulaDiagnostics(e) !== null)
    );
    expect(withoutFormula).toBeDefined();
    // The corrected behaviour: absence of a champion_ability event proves
    // nothing about champion-runtime ownership, so this must be false —
    // hasNoFormulaEvidence is the honest "we have no evidence" signal.
    expect(isChampionRuntimeAction(withoutFormula!)).toBe(false);
    expect(hasNoFormulaEvidence(withoutFormula!)).toBe(true);
  });

  it("isChampionRuntimeAction is true only for the reliable signal: a champion_ability event with no formula_status key at all", () => {
    // Constructed at the pure-function boundary — no fixture in this repo yet
    // captures a genuine champion_recast_runtime.py damage event, but its own
    // source confirms it never sets `formula_status` on any emitted event
    // (unlike generic_ability_runtime.py, which sets it unconditionally).
    const action = {
      event: {} as any,
      seq: 1,
      startTime: 0,
      resolutionTime: null,
      ok: true,
      actorId: "A1",
      targetId: "B1",
      actorTeam: "A",
      actionId: "R",
      actionType: "active",
      damageAccounting: null,
      healingAccounting: null,
      kernelEvents: [
        {
          seq: 2,
          time: 0,
          source: "kernel",
          type: "champion_ability",
          actor_id: "A1",
          actor_team: "A",
          target_id: "B1",
          target_team: "B",
          action_id: "R",
          payload: { metadata: { final_damage: 500, raw_damage_before_pipeline: 500 } },
          meta: null,
        },
      ],
    };
    expect(hasNoFormulaEvidence(action as any)).toBe(false);
    expect(isChampionRuntimeAction(action as any)).toBe(true);
  });
});

describe("pipelineEventFor", () => {
  it("finds pipeline stage data on a basic attack's damage_packet kernel event, not just champion_ability", () => {
    const actions = buildPlaybackActions(REAL_1V1);
    const basicAttack = actions.find(
      (a) => a.ok && a.kernelEvents.some((e) => e.type === "damage_packet")
    );
    expect(basicAttack).toBeDefined();
    const event = pipelineEventFor(basicAttack!);
    expect(event).not.toBeNull();
    expect(pipelineStages(event!).length).toBeGreaterThan(0);
  });
});
