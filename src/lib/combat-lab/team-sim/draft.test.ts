/**
 * The local scenario model: runtime-ID stability, team-size transitions,
 * champion-change invalidation and fail-closed validation.
 */
import { describe, expect, it } from "vitest";

import { indexCatalog } from "./catalog";
import {
  activeEnemiesOf,
  activePriority,
  activeRuntimeIds,
  createDraft,
  describePlan,
  draftReducer,
  validateDraft,
  RUNTIME_IDS,
  type DraftAction,
  type TeamScenarioDraft,
} from "./draft";
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

/** A champion the catalog gives champion-specific actions to. */
const CHAMPION_WITH_ACTIONS = REAL_CATALOG.champions.find((c) => c.actions.length > 0)!;
const SOME_ACTION = CHAMPION_WITH_ACTIONS.actions[0].active_name;

describe("draft construction", () => {
  it("starts as a 1v1 with every runtime slot configured", () => {
    const draft = createDraft(index);
    expect(draft.teamSizeA).toBe(1);
    expect(draft.teamSizeB).toBe(1);
    // Asserted against RUNTIME_IDS rather than a literal list, so a future cap
    // raise cannot leave this quietly checking a subset — plus one explicit
    // check that Phase 6A's six slots are the ones actually being modelled.
    expect(Object.keys(draft.combatants).sort()).toEqual([...RUNTIME_IDS].sort());
    expect(RUNTIME_IDS).toEqual(["A1", "A2", "A3", "B1", "B2", "B3"]);
    expect(activeRuntimeIds(draft)).toEqual(["A1", "B1"]);
  });

  it("gives each slot a distinct catalog champion and a legal default plan", () => {
    const draft = createDraft(index);
    const champions = Object.values(draft.combatants).map((c) => c.champion);
    expect(new Set(champions).size).toBe(RUNTIME_IDS.length);
    for (const c of Object.values(draft.combatants)) {
      expect(index.championByName.has(c.champion)).toBe(true);
      expect(c.level).toBe(index.levelBounds.default);
      expect(c.plan.steps).toHaveLength(1);
      expect(c.plan.steps[0].kind).toBe("basic_attack");
      expect(c.plan.repeat).toBe(true);
      expect(c.targeting.policy).toBe("first_living");
    }
  });

  it("seeds scheduler limits from the catalog defaults", () => {
    const draft = createDraft(index);
    expect(draft.scheduler.maxDuration).toBe(
      REAL_CATALOG.scheduler_limits.max_duration.default
    );
    expect(draft.scheduler.maxEvents).toBe(REAL_CATALOG.scheduler_limits.max_events.default);
    expect(draft.scheduler.maxTraceEvents).toBe(
      REAL_CATALOG.scheduler_limits.max_trace_events.default
    );
  });

  it("starts with no validation issues", () => {
    expect(validateDraft(createDraft(index), index).canSubmit).toBe(true);
  });
});

describe("team-size transitions", () => {
  it("supports every priced shape", () => {
    const base = createDraft(index);
    expect(activeRuntimeIds(base)).toEqual(["A1", "B1"]);
    expect(
      activeRuntimeIds(apply(base, { type: "setTeamSize", team: "B", size: 2 }))
    ).toEqual(["A1", "B1", "B2"]);
    expect(
      activeRuntimeIds(apply(base, { type: "setTeamSize", team: "A", size: 2 }))
    ).toEqual(["A1", "A2", "B1"]);
    expect(activeRuntimeIds(to2v2(base))).toEqual(["A1", "A2", "B1", "B2"]);
  });

  it("keeps runtime IDs stable and never moves a build between slots", () => {
    let draft = to2v2(createDraft(index));
    draft = apply(draft, { type: "setChampion", id: "A2", champion: "Ashe" });
    const a1Before = draft.combatants.A1.champion;

    draft = apply(draft, { type: "setTeamSize", team: "A", size: 1 });
    expect(activeRuntimeIds(draft)).toEqual(["A1", "B1", "B2"]);
    // Hidden, not destroyed, and not promoted into A1.
    expect(draft.combatants.A1.champion).toBe(a1Before);
    expect(draft.combatants.A2.champion).toBe("Ashe");

    draft = apply(draft, { type: "setTeamSize", team: "A", size: 2 });
    expect(draft.combatants.A2.champion).toBe("Ashe");
    expect(draft.combatants.A1.champion).toBe(a1Before);
  });

  it("keeps a fixed-priority order across a team-shape round trip", () => {
    // Pruning the draft destroyed configuration: [B2, B1] came back as [B1]
    // after 2v2 -> 2v1 -> 2v2, a materially different scenario with nothing on
    // screen to say so. The entry is kept and filtered at wire time instead.
    let draft = to2v2(createDraft(index));
    draft = apply(
      draft,
      { type: "setTargetingPolicy", id: "A1", policy: "fixed" },
      { type: "togglePriority", id: "A1", target: "B2" },
      { type: "togglePriority", id: "A1", target: "B1" }
    );
    expect(draft.combatants.A1.targeting.priority).toEqual(["B2", "B1"]);

    draft = apply(draft, { type: "setTeamSize", team: "B", size: 1 });
    expect(draft.combatants.A1.targeting.priority).toEqual(["B2", "B1"]);
    expect(activePriority(draft, "A1")).toEqual(["B1"]);
    expect(validateDraft(draft, index).canSubmit).toBe(true);

    draft = apply(draft, { type: "setTeamSize", team: "B", size: 2 });
    expect(activePriority(draft, "A1")).toEqual(["B2", "B1"]);
  });

  it("blocks submission when a fixed priority has no ACTIVE enemy left", () => {
    let draft = to2v2(createDraft(index));
    draft = apply(
      draft,
      { type: "setTargetingPolicy", id: "A1", policy: "fixed" },
      { type: "togglePriority", id: "A1", target: "B2" }
    );
    expect(validateDraft(draft, index).canSubmit).toBe(true);

    draft = apply(draft, { type: "setTeamSize", team: "B", size: 1 });
    const result = validateDraft(draft, index);
    expect(result.canSubmit).toBe(false);
    expect(result.issues.some((i) => i.message.includes("ACTIVE enemy"))).toBe(true);
  });

  it("refuses to add a priority entry that is not an active enemy", () => {
    let draft = createDraft(index); // 1v1: B2 is inactive
    draft = apply(draft, { type: "setTargetingPolicy", id: "A1", policy: "fixed" });
    const before = draft;
    draft = apply(draft, { type: "togglePriority", id: "A1", target: "B2" });
    expect(draft).toBe(before);
    expect(activeEnemiesOf(draft, "A1")).toEqual(["B1"]);
  });
});

describe("combatant editing", () => {
  it("keeps mirror champions independent", () => {
    let draft = createDraft(index);
    draft = apply(
      draft,
      { type: "setChampion", id: "A1", champion: "Ashe" },
      { type: "setChampion", id: "B1", champion: "Ashe" },
      { type: "toggleItem", id: "A1", item: "Infinity Edge", max: index.maxItems },
      { type: "setLevel", id: "B1", level: 5 }
    );
    expect(draft.combatants.A1.items).toEqual(["Infinity Edge"]);
    expect(draft.combatants.B1.items).toEqual([]);
    expect(draft.combatants.A1.level).toBe(index.levelBounds.default);
    expect(draft.combatants.B1.level).toBe(5);
  });

  it("toggles items and enforces the catalog limit", () => {
    let draft = createDraft(index);
    const names = index.supportedItems.slice(0, index.maxItems + 2).map((i) => i.name);
    for (const item of names) {
      draft = apply(draft, { type: "toggleItem", id: "A1", item, max: index.maxItems });
    }
    expect(draft.combatants.A1.items).toHaveLength(index.maxItems);

    draft = apply(draft, {
      type: "toggleItem",
      id: "A1",
      item: names[0],
      max: index.maxItems,
    });
    expect(draft.combatants.A1.items).not.toContain(names[0]);
  });

  it("toggles runes and enforces the catalog limit", () => {
    let draft = createDraft(index);
    const names = index.supportedRunes.slice(0, index.maxRunes + 2).map((r) => r.name);
    for (const rune of names) {
      draft = apply(draft, { type: "toggleRune", id: "B1", rune, max: index.maxRunes });
    }
    expect(draft.combatants.B1.runes).toHaveLength(index.maxRunes);
  });

  it("copies a build without moving the plan or targeting", () => {
    let draft = to2v2(createDraft(index));
    draft = apply(
      draft,
      { type: "setChampion", id: "A1", champion: "Ashe" },
      { type: "toggleItem", id: "A1", item: "Infinity Edge", max: index.maxItems },
      { type: "setTargetingPolicy", id: "A1", policy: "lowest_hp" },
      { type: "copyBuild", from: "A1", to: "A2" }
    );
    expect(draft.combatants.A2.champion).toBe("Ashe");
    expect(draft.combatants.A2.items).toEqual(["Infinity Edge"]);
    // Targeting stays with its own runtime ID.
    expect(draft.combatants.A2.targeting.policy).toBe("first_living");
    expect(draft.combatants.A1.targeting.policy).toBe("lowest_hp");
  });

  it("resets one combatant without touching the others", () => {
    let draft = createDraft(index);
    const b1 = draft.combatants.B1.champion;
    draft = apply(
      draft,
      { type: "setChampion", id: "A1", champion: "Ashe" },
      { type: "setLevel", id: "A1", level: 3 },
      { type: "resetCombatant", id: "A1", index }
    );
    expect(draft.combatants.A1.level).toBe(index.levelBounds.default);
    expect(draft.combatants.B1.champion).toBe(b1);
  });
});

describe("action plans", () => {
  it("adds, reorders and removes steps with stable ids", () => {
    let draft = createDraft(index);
    draft = apply(
      draft,
      { type: "addStep", id: "A1", step: { kind: "slot", slot: "Q", activeName: null, notBefore: 0 } },
      { type: "addStep", id: "A1", step: { kind: "basic_attack", slot: null, activeName: null, notBefore: 2 } }
    );
    const [first, second, third] = draft.combatants.A1.plan.steps;
    expect(draft.combatants.A1.plan.steps).toHaveLength(3);
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);

    draft = apply(draft, { type: "moveStep", id: "A1", stepId: third.id, direction: -1 });
    expect(draft.combatants.A1.plan.steps.map((s) => s.id)).toEqual([
      first.id,
      third.id,
      second.id,
    ]);

    draft = apply(draft, { type: "removeStep", id: "A1", stepId: first.id });
    expect(draft.combatants.A1.plan.steps.map((s) => s.id)).toEqual([third.id, second.id]);
  });

  it("keeps plans independent per combatant", () => {
    let draft = to2v2(createDraft(index));
    draft = apply(draft, {
      type: "addStep",
      id: "A1",
      step: { kind: "slot", slot: "R", activeName: null, notBefore: 5 },
    });
    expect(draft.combatants.A1.plan.steps).toHaveLength(2);
    expect(draft.combatants.A2.plan.steps).toHaveLength(1);
  });

  it("accepts an empty NON-REPEATING plan as legal", () => {
    const draft = apply(
      createDraft(index),
      { type: "clearPlan", id: "A1" },
      { type: "setRepeat", id: "A1", repeat: false }
    );
    expect(draft.combatants.A1.plan.steps).toEqual([]);
    expect(validateDraft(draft, index).canSubmit).toBe(true);
    expect(describePlan(draft.combatants.A1.plan)).toBe("No actions (idle)");
  });

  it("rejects an empty REPEATING plan, which the backend refuses", () => {
    // team_combat/planning.py: `if repeat and not steps` -> PlanValidationError
    // -> 422. Repeat is on by default, so "Clear plan" lands here.
    const draft = apply(createDraft(index), { type: "clearPlan", id: "A1" });
    expect(draft.combatants.A1.plan.repeat).toBe(true);
    const result = validateDraft(draft, index);
    expect(result.canSubmit).toBe(false);
    expect(result.issues.some((i) => i.message.includes("repeating plan"))).toBe(true);
  });

  it("carries repeat and on_failure", () => {
    const draft = apply(
      createDraft(index),
      { type: "setRepeat", id: "A1", repeat: false },
      { type: "setOnFailure", id: "A1", onFailure: "halt" }
    );
    expect(draft.combatants.A1.plan.repeat).toBe(false);
    expect(draft.combatants.A1.plan.onFailure).toBe("halt");
  });

  it("renders a readable plan summary", () => {
    const draft = apply(createDraft(index), {
      type: "addStep",
      id: "A1",
      step: { kind: "slot", slot: "Q", activeName: null, notBefore: 3 },
    });
    expect(describePlan(draft.combatants.A1.plan)).toBe("Basic Attack → Cast Q @≥3s ↻");
  });
});

describe("champion change invalidates unsupported steps", () => {
  it("marks a champion-specific step invalid and blocks submission", () => {
    let draft = createDraft(index);
    draft = apply(
      draft,
      { type: "setChampion", id: "A1", champion: CHAMPION_WITH_ACTIONS.name },
      {
        type: "addStep",
        id: "A1",
        step: { kind: "champion_action", slot: null, activeName: SOME_ACTION, notBefore: 0 },
      }
    );
    expect(validateDraft(draft, index).canSubmit).toBe(true);

    // Lux has no champion-specific actions at all.
    draft = apply(draft, { type: "setChampion", id: "A1", champion: "Lux" });
    const after = validateDraft(draft, index);
    expect(after.canSubmit).toBe(false);
    expect(after.invalidStepIds.A1).toHaveLength(1);
    expect(after.issues.some((i) => i.message.includes(SOME_ACTION))).toBe(true);
    // The step is NOT silently rewritten.
    expect(draft.combatants.A1.plan.steps[1].activeName).toBe(SOME_ACTION);
  });

  it("leaves basic attacks and generic slot casts valid on any champion", () => {
    let draft = createDraft(index);
    draft = apply(
      draft,
      { type: "setChampion", id: "A1", champion: "Lux" },
      { type: "addStep", id: "A1", step: { kind: "slot", slot: "R", activeName: null, notBefore: 0 } }
    );
    expect(validateDraft(draft, index).canSubmit).toBe(true);
  });

  it("clears the block once the invalid steps are removed", () => {
    let draft = apply(
      createDraft(index),
      { type: "setChampion", id: "A1", champion: "Lux" },
      {
        type: "addStep",
        id: "A1",
        step: { kind: "champion_action", slot: null, activeName: SOME_ACTION, notBefore: 0 },
      }
    );
    const invalid = validateDraft(draft, index).invalidStepIds.A1;
    draft = apply(draft, { type: "removeInvalidSteps", id: "A1", stepIds: invalid });
    expect(validateDraft(draft, index).canSubmit).toBe(true);
  });
});

describe("validation", () => {
  it("rejects an out-of-range ability rank", () => {
    const draft = apply(createDraft(index), {
      type: "setAbilityRank",
      id: "A1",
      slot: "R",
      rank: 4,
    });
    const result = validateDraft(draft, index);
    expect(result.canSubmit).toBe(false);
    expect(result.issues.some((i) => i.field === "ranks")).toBe(true);
  });

  it("rejects an out-of-range level", () => {
    const result = validateDraft(
      apply(createDraft(index), { type: "setLevel", id: "A1", level: 19 }),
      index
    );
    expect(result.issues.some((i) => i.field === "level")).toBe(true);
  });

  it("rejects an unsupported item that the current catalog no longer carries", () => {
    // Simulates a catalog that changed under the editor.
    const draft = createDraft(index);
    const stale: TeamScenarioDraft = {
      ...draft,
      combatants: {
        ...draft.combatants,
        A1: { ...draft.combatants.A1, items: ["Definitely Not An Item"] },
      },
    };
    const result = validateDraft(stale, index);
    expect(result.canSubmit).toBe(false);
    expect(result.invalidItems.A1).toEqual(["Definitely Not An Item"]);
  });

  it("reports WHY a step is invalid, not just that it is", () => {
    const draft = apply(
      createDraft(index),
      { type: "setChampion", id: "A1", champion: "Lux" },
      {
        type: "addStep",
        id: "A1",
        step: { kind: "champion_action", slot: null, activeName: SOME_ACTION, notBefore: 0 },
      }
    );
    const result = validateDraft(draft, index);
    const stepId = result.invalidStepIds.A1[0];
    expect(result.stepIssues.A1[stepId]).toContain(SOME_ACTION);
    expect(result.stepIssues.A1[stepId]).toContain("Lux");
  });

  it("distinguishes a bad not_before from an uncastable action", () => {
    let draft = createDraft(index);
    const stepId = draft.combatants.A1.plan.steps[0].id;
    draft = apply(draft, {
      type: "updateStep",
      id: "A1",
      stepId,
      patch: { notBefore: -1 },
    });
    expect(validateDraft(draft, index).stepIssues.A1[stepId]).toMatch(/Not-before/);
  });

  it("rejects fixed targeting with an empty priority list", () => {
    const result = validateDraft(
      apply(createDraft(index), { type: "setTargetingPolicy", id: "A1", policy: "fixed" }),
      index
    );
    expect(result.canSubmit).toBe(false);
    expect(result.issues.some((i) => i.field === "targeting")).toBe(true);
  });

  it("rejects scheduler limits above the catalog ceilings", () => {
    const result = validateDraft(
      apply(createDraft(index), {
        type: "setScheduler",
        patch: { maxEvents: REAL_CATALOG.scheduler_limits.max_events.maximum + 1 },
      }),
      index
    );
    expect(result.canSubmit).toBe(false);
    expect(result.issues.some((i) => i.field === "scheduler")).toBe(true);
  });

  it("ignores problems parked in an INACTIVE slot", () => {
    let draft = to2v2(createDraft(index));
    draft = apply(draft, { type: "setLevel", id: "A2", level: 99 });
    expect(validateDraft(draft, index).canSubmit).toBe(false);

    draft = apply(draft, { type: "setTeamSize", team: "A", size: 1 });
    expect(validateDraft(draft, index).canSubmit).toBe(true);
  });

  it("rejects a negative not_before", () => {
    let draft = createDraft(index);
    const stepId = draft.combatants.A1.plan.steps[0].id;
    draft = apply(draft, {
      type: "updateStep",
      id: "A1",
      stepId,
      patch: { notBefore: -1 },
    });
    const result = validateDraft(draft, index);
    expect(result.canSubmit).toBe(false);
    expect(result.invalidStepIds.A1).toEqual([stepId]);
  });
});
