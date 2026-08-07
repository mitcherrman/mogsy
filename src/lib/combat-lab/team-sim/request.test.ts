/**
 * The draft → payload adapter. The properties asserted here are the ones that
 * stop a billable request carrying something the operator did not author.
 */
import { describe, expect, it } from "vitest";

import { indexCatalog } from "./catalog";
import {
  createDraft,
  draftReducer,
  type DraftAction,
  type TeamScenarioDraft,
} from "./draft";
import { buildSimulationRequest, DraftNotSubmittableError, SCENARIO_ID } from "./request";
import { REAL_CATALOG } from "./__fixtures__";

const index = indexCatalog(REAL_CATALOG);
const apply = (draft: TeamScenarioDraft, ...actions: DraftAction[]) =>
  actions.reduce(draftReducer, draft);
const to2v2 = (draft: TeamScenarioDraft) =>
  apply(
    draft,
    { type: "setTeamSize", team: "A", size: 2 },
    { type: "setTeamSize", team: "B", size: 2 }
  );

describe("buildSimulationRequest", () => {
  it("emits the catalog's contract version, not a hard-coded string", () => {
    const { request } = buildSimulationRequest(createDraft(index), index);
    expect(request.contract_version).toBe(REAL_CATALOG.contract_version);
    expect(request.contract_version).toBe("sim2.team-simulate.v1");
    expect(request.scenario_id).toBe(SCENARIO_ID);
  });

  it("sends only ACTIVE runtime IDs in teams, plans and targeting", () => {
    let draft = to2v2(createDraft(index));
    draft = apply(draft, { type: "setChampion", id: "A2", champion: "Ashe" });
    draft = apply(draft, { type: "setTeamSize", team: "A", size: 1 });

    const { request } = buildSimulationRequest(draft, index);
    expect(request.team_a.combatants.map((c) => c.runtime_id)).toEqual(["A1"]);
    expect(request.team_b.combatants.map((c) => c.runtime_id)).toEqual(["B1", "B2"]);
    expect(Object.keys(request.action_plans).sort()).toEqual(["A1", "B1", "B2"]);
    expect(Object.keys(request.targeting).sort()).toEqual(["A1", "B1", "B2"]);
    expect(JSON.stringify(request)).not.toContain("A2");
  });

  it("covers every priced shape", () => {
    const base = createDraft(index);
    const shapes: Array<[1 | 2, 1 | 2, number]> = [
      [1, 1, 1],
      [1, 2, 2],
      [2, 1, 2],
      [2, 2, 3],
    ];
    for (const [a, b, credits] of shapes) {
      const draft = apply(
        base,
        { type: "setTeamSize", team: "A", size: a },
        { type: "setTeamSize", team: "B", size: b }
      );
      const prepared = buildSimulationRequest(draft, index);
      expect(prepared.teamShape).toBe(`${a}v${b}`);
      expect(prepared.creditCost).toBe(credits);
      expect(prepared.request.team_a.combatants).toHaveLength(a);
      expect(prepared.request.team_b.combatants).toHaveLength(b);
    }
  });

  it("captures the catalog digest that configured the request", () => {
    const prepared = buildSimulationRequest(createDraft(index), index);
    expect(prepared.catalogDigest).toBe(REAL_CATALOG.catalog_digest);
  });

  it("serializes each plan-step kind into the backend's own shape", () => {
    const withActions = REAL_CATALOG.champions.find((c) => c.actions.length > 0)!;
    const draft = apply(
      createDraft(index),
      { type: "setChampion", id: "A1", champion: withActions.name },
      { type: "addStep", id: "A1", step: { kind: "slot", slot: "Q", activeName: null, notBefore: 2.5 } },
      {
        type: "addStep",
        id: "A1",
        step: {
          kind: "champion_action",
          slot: null,
          activeName: withActions.actions[0].active_name,
          notBefore: 0,
        },
      }
    );
    const { request } = buildSimulationRequest(draft, index);
    expect(request.action_plans.A1.steps).toEqual([
      { type: "basic_attack", not_before: 0 },
      { type: "active", slot: "Q", not_before: 2.5 },
      { type: "active", active_name: withActions.actions[0].active_name, not_before: 0 },
    ]);
    expect(request.action_plans.A1.repeat).toBe(true);
    expect(request.action_plans.A1.on_failure).toBe("skip");
  });

  it("filters a fixed priority to ACTIVE enemies at wire time", () => {
    // The draft keeps [B2, B1] across a shape change so the operator's order
    // survives; the request must still never name an inactive combatant.
    let draft = to2v2(createDraft(index));
    draft = apply(
      draft,
      { type: "setTargetingPolicy", id: "A1", policy: "fixed" },
      { type: "togglePriority", id: "A1", target: "B2" },
      { type: "togglePriority", id: "A1", target: "B1" },
      { type: "setTeamSize", team: "B", size: 1 }
    );
    expect(draft.combatants.A1.targeting.priority).toEqual(["B2", "B1"]);
    const { request } = buildSimulationRequest(draft, index);
    expect(request.targeting.A1).toEqual({ policy: "fixed", priority: ["B1"] });
    expect(JSON.stringify(request)).not.toContain("B2");
  });

  it("sends priority ONLY for fixed targeting", () => {
    let draft = to2v2(createDraft(index));
    draft = apply(
      draft,
      { type: "setTargetingPolicy", id: "A1", policy: "fixed" },
      { type: "togglePriority", id: "A1", target: "B2" },
      { type: "togglePriority", id: "A1", target: "B1" },
      { type: "setTargetingPolicy", id: "A2", policy: "lowest_hp_pct" }
    );
    const { request } = buildSimulationRequest(draft, index);
    expect(request.targeting.A1).toEqual({ policy: "fixed", priority: ["B2", "B1"] });
    expect(request.targeting.A2).toEqual({ policy: "lowest_hp_pct" });
    expect("priority" in request.targeting.A2).toBe(false);
  });

  it("omits starting_hp unless the operator set one", () => {
    const draft = createDraft(index);
    expect("starting_hp" in buildSimulationRequest(draft, index).request.team_a.combatants[0]).toBe(
      false
    );
    const withHp = apply(draft, { type: "setStartingHp", id: "A1", startingHp: 750 });
    expect(buildSimulationRequest(withHp, index).request.team_a.combatants[0].starting_hp).toBe(
      750
    );
  });

  it("is deterministic: the same draft always serializes identically", () => {
    const draft = to2v2(createDraft(index));
    const a = JSON.stringify(buildSimulationRequest(draft, index).request);
    const b = JSON.stringify(buildSimulationRequest(draft, index).request);
    expect(a).toBe(b);
  });

  it("sorts ability ranks so click order cannot change the payload", () => {
    let draft = createDraft(index);
    draft = apply(
      draft,
      { type: "setAbilityRank", id: "A1", slot: "R", rank: 2 },
      { type: "setAbilityRank", id: "A1", slot: "Q", rank: 4 }
    );
    const ranks = buildSimulationRequest(draft, index).request.team_a.combatants[0]
      .ability_ranks;
    expect(Object.keys(ranks)).toEqual(["E", "Q", "R", "W"]);
  });

  it("carries the scheduler limits from the draft", () => {
    const draft = apply(createDraft(index), {
      type: "setScheduler",
      patch: { maxDuration: 42, maxEvents: 500, maxTraceEvents: 250 },
    });
    expect(buildSimulationRequest(draft, index).request.limits).toEqual({
      max_duration: 42,
      max_events: 500,
      max_trace_events: 250,
    });
  });

  it("never emits scope_attribution (the backend fails closed on it)", () => {
    const { request } = buildSimulationRequest(createDraft(index), index);
    expect("scope_attribution" in request).toBe(false);
  });

  it("REFUSES to build while any validation issue stands", () => {
    const draft = apply(createDraft(index), {
      type: "setTargetingPolicy",
      id: "A1",
      policy: "fixed",
    });
    expect(() => buildSimulationRequest(draft, index)).toThrow(DraftNotSubmittableError);
  });

  it("refuses to build a plan step the current champion cannot cast", () => {
    const withActions = REAL_CATALOG.champions.find((c) => c.actions.length > 0)!;
    const draft = apply(
      createDraft(index),
      { type: "setChampion", id: "A1", champion: "Lux" },
      {
        type: "addStep",
        id: "A1",
        step: {
          kind: "champion_action",
          slot: null,
          activeName: withActions.actions[0].active_name,
          notBefore: 0,
        },
      }
    );
    expect(() => buildSimulationRequest(draft, index)).toThrow(DraftNotSubmittableError);
  });
});
