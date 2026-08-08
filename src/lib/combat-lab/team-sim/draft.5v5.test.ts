/**
 * SIM2 Phase 6B: the draft model at five combatants per side.
 *
 * draft.test.ts pins the model's rules and draft.3v3.test.ts pins that a THIRD
 * slot participates in all of them. This file pins the cap itself and the cases
 * only a fourth and fifth slot can express:
 *
 *   - the editor's slot count and the `RuntimeId` template literal type must
 *     agree in BOTH directions. TypeScript cannot derive one from the other, so
 *     nothing but a test can catch "MAX_EDITOR_TEAM_SIZE went to 5 but the type
 *     still says 1 | 2 | 3" — which mints an A4 that is not a RuntimeId.
 *   - all 25 shapes must build a request, not just the nine that used to exist.
 *   - a five-entry fixed-priority list can be PARTIALLY active in more ways
 *     than a three-entry one: 5v5 -> 5v2 leaves three of five entries inert,
 *     and the surviving two must keep their relative order.
 *   - eight of ten slots can be inactive at once (1v1), and none of the eight
 *     may reach the wire.
 */
import { describe, expect, it } from "vitest";

import { indexCatalog, creditCostFor, pricedTeamShapes } from "./catalog";
import {
  activeEnemiesOf,
  activePriority,
  activeIdsForTeam,
  activeRuntimeIds,
  createDraft,
  draftReducer,
  enemiesOf,
  isActive,
  MAX_EDITOR_TEAM_SIZE,
  RUNTIME_IDS,
  runtimeIdsOfTeam,
  TEAM_OF,
  TEAM_SIZES,
  validateDraft,
  type DraftAction,
  type RuntimeId,
  type TeamScenarioDraft,
  type TeamSize,
} from "./draft";
import { buildSimulationRequest } from "./request";
import { REAL_CATALOG } from "./__fixtures__";

const index = indexCatalog(REAL_CATALOG);

const apply = (draft: TeamScenarioDraft, ...actions: DraftAction[]) =>
  actions.reduce(draftReducer, draft);

const shape = (draft: TeamScenarioDraft, a: TeamSize, b: TeamSize) =>
  apply(
    draft,
    { type: "setTeamSize", team: "A", size: a },
    { type: "setTeamSize", team: "B", size: b }
  );

const SIZES: TeamSize[] = [1, 2, 3, 4, 5];
const ALL_SHAPES: Array<[TeamSize, TeamSize]> = SIZES.flatMap((a) =>
  SIZES.map((b) => [a, b] as [TeamSize, TeamSize])
);

/* ────────────────────────────── the cap ────────────────────────────── */

describe("the editor cap", () => {
  it("models five slots per team, ten in all", () => {
    expect(MAX_EDITOR_TEAM_SIZE).toBe(5);
    expect(RUNTIME_IDS).toHaveLength(10);
    expect(runtimeIdsOfTeam("A")).toEqual(["A1", "A2", "A3", "A4", "A5"]);
    expect(runtimeIdsOfTeam("B")).toEqual(["B1", "B2", "B3", "B4", "B5"]);
  });

  it("orders team A's slots before team B's", () => {
    // The scheduler assigns slot indices in this order, so editor ordering and
    // result ordering agree by construction rather than by coincidence.
    expect(RUNTIME_IDS).toEqual([
      "A1", "A2", "A3", "A4", "A5",
      "B1", "B2", "B3", "B4", "B5",
    ]);
  });

  it("keeps the RuntimeId type and the slot count in agreement", () => {
    // TypeScript cannot derive `RuntimeId` from MAX_EDITOR_TEAM_SIZE, so this
    // is the only thing that can catch the two drifting. Both directions:
    // every minted id must type-check as a RuntimeId (the assignment below),
    // and every RuntimeId the type admits must have a slot (the length check).
    const ids: RuntimeId[] = ["A1", "A2", "A3", "A4", "A5",
                              "B1", "B2", "B3", "B4", "B5"];
    expect(RUNTIME_IDS).toEqual(ids);
    expect(RUNTIME_IDS).toHaveLength(2 * MAX_EDITOR_TEAM_SIZE);
    expect(TEAM_SIZES).toEqual([1, 2, 3, 4, 5]);
    expect(TEAM_SIZES).toHaveLength(MAX_EDITOR_TEAM_SIZE);
  });

  it("assigns every slot to the team its ID names", () => {
    for (const id of RUNTIME_IDS) {
      expect(TEAM_OF[id]).toBe(id[0]);
    }
  });

  it("gives the fourth and fifth slots the full opposing team", () => {
    for (const id of ["A4", "A5"] as RuntimeId[]) {
      expect(enemiesOf(id)).toEqual(["B1", "B2", "B3", "B4", "B5"]);
    }
    for (const id of ["B4", "B5"] as RuntimeId[]) {
      expect(enemiesOf(id)).toEqual(["A1", "A2", "A3", "A4", "A5"]);
    }
  });

  it("creates a configured, valid draft for all ten slots", () => {
    const draft = createDraft(index);
    for (const id of RUNTIME_IDS) {
      const c = draft.combatants[id];
      expect(c.runtimeId).toBe(id);
      expect(index.championByName.has(c.champion)).toBe(true);
      expect(c.plan.steps).toHaveLength(1);
      expect(c.plan.repeat).toBe(true);
    }
    // Ten distinct default champions, so a 5v5 is not silently a mirror match.
    expect(
      new Set(RUNTIME_IDS.map((id) => draft.combatants[id].champion)).size
    ).toBe(10);
  });
});

/* ─────────────────────────── all 25 shapes ─────────────────────────── */

describe("every 1..5 x 1..5 shape", () => {
  it.each(ALL_SHAPES)("activates exactly %iv%i slots", (a, b) => {
    const draft = shape(createDraft(index), a, b);
    expect(activeIdsForTeam(draft, "A")).toHaveLength(a);
    expect(activeIdsForTeam(draft, "B")).toHaveLength(b);
    expect(activeRuntimeIds(draft)).toEqual([
      ...runtimeIdsOfTeam("A").slice(0, a),
      ...runtimeIdsOfTeam("B").slice(0, b),
    ]);
  });

  it.each(ALL_SHAPES)("builds a valid %iv%i request", (a, b) => {
    const draft = shape(createDraft(index), a, b);
    expect(validateDraft(draft, index).canSubmit).toBe(true);
    const { request: body } = buildSimulationRequest(draft, index);
    expect(body.team_a.combatants).toHaveLength(a);
    expect(body.team_b.combatants).toHaveLength(b);
    expect(body.team_a.combatants.map((c) => c.runtime_id)).toEqual(
      runtimeIdsOfTeam("A").slice(0, a)
    );
    expect(body.team_b.combatants.map((c) => c.runtime_id)).toEqual(
      runtimeIdsOfTeam("B").slice(0, b)
    );
    // Every active combatant needs a plan; no inactive one may have any entry.
    expect(Object.keys(body.action_plans).sort()).toEqual(
      [...activeRuntimeIds(draft)].sort()
    );
  });

  it("prices all 25 shapes from the catalog", () => {
    expect(pricedTeamShapes(index)).toHaveLength(25);
    for (const [a, b] of ALL_SHAPES) {
      expect(creditCostFor(index, a, b)).toBe(a + b - 1);
    }
    expect(creditCostFor(index, 5, 5)).toBe(9);
    expect(creditCostFor(index, 4, 4)).toBe(7);
  });
});

/* ───────────────────── the fourth and fifth slots ───────────────────── */

describe("A4/A5/B4/B5 are ordinary slots", () => {
  const NEW_SLOTS: RuntimeId[] = ["A4", "A5", "B4", "B5"];

  it("configures each new slot independently of its teammates", () => {
    let draft = shape(createDraft(index), 5, 5);
    const other = index.championNames[11];
    draft = apply(draft, { type: "setChampion", id: "A5", champion: other });

    expect(draft.combatants.A5.champion).toBe(other);
    for (const id of ["A1", "A2", "A3", "A4"] as RuntimeId[]) {
      expect(draft.combatants[id].champion).not.toBe(other);
    }
  });

  it("keeps ten independent builds", () => {
    let draft = shape(createDraft(index), 5, 5);
    RUNTIME_IDS.forEach((id, i) => {
      draft = apply(draft, { type: "setLevel", id, level: 8 + i });
    });
    expect(RUNTIME_IDS.map((id) => draft.combatants[id].level)).toEqual(
      RUNTIME_IDS.map((_, i) => 8 + i)
    );
  });

  it("keeps ten independent plans", () => {
    let draft = shape(createDraft(index), 5, 5);
    // A different number of extra steps on every slot: a shared plan object
    // would collapse these into one count.
    RUNTIME_IDS.forEach((id, i) => {
      for (let n = 0; n <= i; n += 1) {
        draft = apply(draft, {
          type: "addStep",
          id,
          step: { kind: "basic_attack", slot: null, activeName: null, notBefore: 0 },
        });
      }
    });
    expect(RUNTIME_IDS.map((id) => draft.combatants[id].plan.steps.length)).toEqual(
      RUNTIME_IDS.map((_, i) => i + 2)   // the default step plus i+1 added
    );
    // Step ids stay unique across all ten plans.
    const stepIds = RUNTIME_IDS.flatMap((id) =>
      draft.combatants[id].plan.steps.map((s) => s.id)
    );
    expect(new Set(stepIds).size).toBe(stepIds.length);
  });

  it("marks the new slots inactive at smaller shapes", () => {
    const draft = shape(createDraft(index), 3, 3);
    for (const id of NEW_SLOTS) {
      expect(isActive(draft, id)).toBe(false);
    }
    expect(activeRuntimeIds(draft)).not.toContain("A4");
  });

  it("gives every active combatant the five active enemies at 5v5", () => {
    const draft = shape(createDraft(index), 5, 5);
    for (const id of runtimeIdsOfTeam("A")) {
      expect(activeEnemiesOf(draft, id)).toEqual(runtimeIdsOfTeam("B"));
    }
    for (const id of runtimeIdsOfTeam("B")) {
      expect(activeEnemiesOf(draft, id)).toEqual(runtimeIdsOfTeam("A"));
    }
  });
});

/* ────────────────────── five-target fixed priority ────────────────────── */

describe("a five-entry fixed priority list", () => {
  const fixedA1 = (draft: TeamScenarioDraft, order: RuntimeId[]) =>
    apply(
      draft,
      { type: "setTargetingPolicy", id: "A1", policy: "fixed" },
      ...order.map(
        (target) => ({ type: "togglePriority", id: "A1", target } as DraftAction)
      )
    );

  it("accepts all five opponents in a deliberate order", () => {
    const order: RuntimeId[] = ["B4", "B1", "B5", "B3", "B2"];
    const draft = fixedA1(shape(createDraft(index), 5, 5), order);
    expect(draft.combatants.A1.targeting.priority).toEqual(order);
    expect(activePriority(draft, "A1")).toEqual(order);
    expect(validateDraft(draft, index).canSubmit).toBe(true);
  });

  it("sends the full five-entry list in slot-independent order", () => {
    const order: RuntimeId[] = ["B4", "B1", "B5", "B3", "B2"];
    const draft = fixedA1(shape(createDraft(index), 5, 5), order);
    const { request: body } = buildSimulationRequest(draft, index);
    expect(body.targeting.A1).toEqual({ policy: "fixed", priority: order });
  });

  it("filters inactive entries but keeps the survivors' relative order", () => {
    // 5v5 -> 5v2 leaves THREE of five entries inert, which is the case a
    // three-entry list could not express.
    const order: RuntimeId[] = ["B4", "B1", "B5", "B3", "B2"];
    let draft = fixedA1(shape(createDraft(index), 5, 5), order);
    draft = shape(draft, 5, 2);

    expect(draft.combatants.A1.targeting.priority).toEqual(order);
    expect(activePriority(draft, "A1")).toEqual(["B1", "B2"]);
    const { request: body } = buildSimulationRequest(draft, index);
    expect(body.targeting.A1).toEqual({
      policy: "fixed",
      priority: ["B1", "B2"],
    });
  });

  it("blocks submission when every entry has become inactive", () => {
    const order: RuntimeId[] = ["B4", "B5"];
    let draft = fixedA1(shape(createDraft(index), 5, 5), order);
    draft = shape(draft, 5, 3);

    expect(activePriority(draft, "A1")).toEqual([]);
    const validation = validateDraft(draft, index);
    expect(validation.canSubmit).toBe(false);
    expect(
      validation.issues.some(
        (i) => i.runtimeId === "A1" && i.field === "targeting"
      )
    ).toBe(true);
  });

  it("refuses a priority entry naming an inactive enemy", () => {
    const draft = shape(createDraft(index), 5, 3);
    const attempted = draftReducer(draft, {
      type: "togglePriority",
      id: "A1",
      target: "B5",
    });
    expect(attempted).toBe(draft);
  });

  it("refuses a priority entry naming an ally", () => {
    const draft = shape(createDraft(index), 5, 5);
    const attempted = draftReducer(draft, {
      type: "togglePriority",
      id: "A1",
      target: "A5",
    });
    expect(attempted).toBe(draft);
  });
});

/* ──────────────────────── shape round trips ──────────────────────── */

describe("team-shape round trips at five", () => {
  it("restores every slot across 5v5 -> 2v2 -> 5v5", () => {
    let draft = shape(createDraft(index), 5, 5);
    const picks = RUNTIME_IDS.map((_, i) => index.championNames[20 + i]);
    RUNTIME_IDS.forEach((id, i) => {
      draft = apply(draft, { type: "setChampion", id, champion: picks[i] });
    });

    draft = shape(draft, 2, 2);
    expect(activeRuntimeIds(draft)).toEqual(["A1", "A2", "B1", "B2"]);

    draft = shape(draft, 5, 5);
    expect(RUNTIME_IDS.map((id) => draft.combatants[id].champion)).toEqual(picks);
  });

  it("restores a five-entry priority list across 5v5 -> 1v1 -> 5v5", () => {
    const order: RuntimeId[] = ["B5", "B4", "B3", "B2", "B1"];
    let draft = shape(createDraft(index), 5, 5);
    draft = apply(
      draft,
      { type: "setTargetingPolicy", id: "A1", policy: "fixed" },
      ...order.map(
        (target) => ({ type: "togglePriority", id: "A1", target } as DraftAction)
      )
    );

    draft = shape(draft, 1, 1);
    expect(activePriority(draft, "A1")).toEqual(["B1"]);

    draft = shape(draft, 5, 5);
    expect(draft.combatants.A1.targeting.priority).toEqual(order);
    expect(activePriority(draft, "A1")).toEqual(order);
  });

  it("keeps a plan authored on A5 across a shrink to 1v1", () => {
    let draft = shape(createDraft(index), 5, 5);
    draft = apply(
      draft,
      { type: "clearPlan", id: "A5" },
      {
        type: "addStep",
        id: "A5",
        step: { kind: "slot", slot: "Q", activeName: null, notBefore: 4.5 },
      },
      { type: "setRepeat", id: "A5", repeat: false }
    );
    const before = draft.combatants.A5.plan;

    draft = shape(draft, 1, 1);
    draft = shape(draft, 5, 5);
    expect(draft.combatants.A5.plan).toEqual(before);
  });
});

/* ─────────────────── inactive slots never reach the wire ─────────────────── */

describe("inactive slots", () => {
  it("omits all eight inactive slots from a 1v1 request", () => {
    let draft = shape(createDraft(index), 5, 5);
    // Configure every slot so an accidental inclusion would be obvious.
    RUNTIME_IDS.forEach((id, i) => {
      draft = apply(draft, { type: "setLevel", id, level: 8 + i });
    });
    draft = shape(draft, 1, 1);

    const { request: body } = buildSimulationRequest(draft, index);
    const serialized = JSON.stringify(body);
    for (const id of ["A2", "A3", "A4", "A5", "B2", "B3", "B4", "B5"]) {
      expect(serialized).not.toContain(id);
    }
    expect(Object.keys(body.action_plans)).toEqual(["A1", "B1"]);
    expect(Object.keys(body.targeting)).toEqual(["A1", "B1"]);
  });

  it("ignores an invalid champion parked on an inactive A5", () => {
    let draft = shape(createDraft(index), 5, 5);
    draft = apply(draft, {
      type: "setChampion",
      id: "A5",
      champion: "Not A Champion",
    });
    expect(validateDraft(draft, index).canSubmit).toBe(false);

    draft = shape(draft, 4, 5);
    expect(validateDraft(draft, index).canSubmit).toBe(true);
  });

  it("reports an invalid champion on an ACTIVE A5", () => {
    let draft = shape(createDraft(index), 5, 5);
    draft = apply(draft, {
      type: "setChampion",
      id: "A5",
      champion: "Not A Champion",
    });
    const validation = validateDraft(draft, index);
    expect(validation.canSubmit).toBe(false);
    expect(
      validation.issues.some(
        (i) => i.runtimeId === "A5" && i.field === "champion"
      )
    ).toBe(true);
  });
});

/* ───────────────────────── copy build at ten ───────────────────────── */

describe("copyBuild across five slots", () => {
  it("copies the build only, never the plan or targeting", () => {
    let draft = shape(createDraft(index), 5, 5);
    draft = apply(
      draft,
      { type: "setLevel", id: "A1", level: 17 },
      { type: "setCritMode", id: "A1", critMode: "force" },
      { type: "setTargetingPolicy", id: "A1", policy: "lowest_hp" },
      { type: "copyBuild", from: "A1", to: "A5" }
    );

    expect(draft.combatants.A5.level).toBe(17);
    expect(draft.combatants.A5.critMode).toBe("force");
    expect(draft.combatants.A5.champion).toBe(draft.combatants.A1.champion);
    // Targeting stays with its own runtime ID.
    expect(draft.combatants.A5.targeting.policy).not.toBe("lowest_hp");
    expect(draft.combatants.A5.runtimeId).toBe("A5");
  });
});
