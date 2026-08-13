/**
 * SIM2 Phase 6A: the draft model at three combatants per side.
 *
 * The standing draft.test.ts pins the model's rules; this file pins that the
 * THIRD slot is an ordinary participant in every one of them. The valuable
 * cases are the ones only a third slot can express:
 *
 *   - a shape round trip through a SMALLER shape (3v3 -> 2v2 -> 3v3) has to
 *     restore A3/B3, and 2v2 is the intermediate that a four-slot model could
 *     never have lost anything at;
 *   - a fixed-priority list can now name three enemies, so "the request omits
 *     inactive entries" becomes a statement about a partially-active list
 *     rather than an all-or-nothing one;
 *   - inactive slots must never reach the wire, which matters more at six
 *     slots because four of them can be inactive at once.
 */
import { describe, expect, it } from "vitest";

import { indexCatalog } from "./catalog";
import {
  activeEnemiesOf,
  activePriority,
  activeRuntimeIds,
  createDraft,
  draftReducer,
  enemiesOf,
  MAX_EDITOR_TEAM_SIZE,
  RUNTIME_IDS,
  runtimeIdsOfTeam,
  TEAM_OF,
  validateDraft,
  type DraftAction,
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

const ALL_SHAPES: Array<[TeamSize, TeamSize]> = [1, 2, 3].flatMap((a) =>
  [1, 2, 3].map((b) => [a, b] as [TeamSize, TeamSize])
);

/* ───────────────────────────── slots ───────────────────────────── */

describe("six runtime slots", () => {
  // Phase 6B note. This file is the THIRD SLOT's characterization, and every
  // property it pins is still true at a cap of five. What is no longer true is
  // that three is the cap, so the handful of assertions that said so are now
  // derived — a 3v3 must still be exactly A1..A3 vs B1..B3, but A3 is no longer
  // the last slot team A has. The cap itself is pinned in draft.5v5.test.ts.
  it("models A1..A3 and B1..B3 among the editor's slots, in slot order", () => {
    expect(RUNTIME_IDS.slice(0, 3)).toEqual(["A1", "A2", "A3"]);
    expect(MAX_EDITOR_TEAM_SIZE).toBeGreaterThanOrEqual(3);
    expect(runtimeIdsOfTeam("A").slice(0, 3)).toEqual(["A1", "A2", "A3"]);
    expect(runtimeIdsOfTeam("B").slice(0, 3)).toEqual(["B1", "B2", "B3"]);
    // Team A's slots all precede team B's, which is what makes editor order
    // and scheduler slot order agree.
    expect(RUNTIME_IDS.indexOf("A3")).toBeLessThan(RUNTIME_IDS.indexOf("B1"));
  });

  it("assigns every slot to the team its ID names", () => {
    for (const id of RUNTIME_IDS) {
      expect(TEAM_OF[id]).toBe(id[0]);
    }
  });

  it("gives A3 the full enemy team and B3 the full enemy team", () => {
    // `enemiesOf` is structural (every slot of the other team), not shape-aware
    // — `activeEnemiesOf` is the shape-aware one, asserted further down. At a
    // cap of five that is five entries, still all on the opposing side.
    expect(enemiesOf("A3")).toEqual(runtimeIdsOfTeam("B"));
    expect(enemiesOf("B3")).toEqual(runtimeIdsOfTeam("A"));
    expect(enemiesOf("A3").every((id) => id.startsWith("B"))).toBe(true);
  });

  it("creates a configured, valid draft for all six slots", () => {
    const draft = createDraft(index);
    for (const id of RUNTIME_IDS) {
      const c = draft.combatants[id];
      expect(c.runtimeId).toBe(id);
      expect(index.championByName.has(c.champion)).toBe(true);
      expect(c.plan.steps).toHaveLength(1);
    }
    // One distinct default champion PER SLOT, so no shape is silently a mirror
    // match. Derived from the slot count so a cap raise keeps meaning this.
    expect(
      new Set(RUNTIME_IDS.map((id) => draft.combatants[id].champion)).size
    ).toBe(RUNTIME_IDS.length);
  });
});

/* ─────────────────────────── team shapes ─────────────────────────── */

describe("all nine team shapes", () => {
  it.each(ALL_SHAPES)("activates exactly the slots for %iv%i", (a, b) => {
    const draft = shape(createDraft(index), a, b);
    const expected = [
      ...["A1", "A2", "A3"].slice(0, a),
      ...["B1", "B2", "B3"].slice(0, b),
    ];
    expect(activeRuntimeIds(draft)).toEqual(expected);
    expect(activeRuntimeIds(draft)).toHaveLength(a + b);
  });

  it.each(ALL_SHAPES)("submits %iv%i with only its active slots", (a, b) => {
    const draft = shape(createDraft(index), a, b);
    const prepared = buildSimulationRequest(draft, index);

    expect(prepared.request.team_a.combatants.map((c) => c.runtime_id)).toEqual(
      ["A1", "A2", "A3"].slice(0, a)
    );
    expect(prepared.request.team_b.combatants.map((c) => c.runtime_id)).toEqual(
      ["B1", "B2", "B3"].slice(0, b)
    );
    expect(Object.keys(prepared.request.action_plans).sort()).toEqual(
      activeRuntimeIds(draft).slice().sort()
    );
    expect(prepared.teamShape).toBe(`${a}v${b}`);
  });

  it.each(ALL_SHAPES)("prices %iv%i from the catalog", (a, b) => {
    const draft = shape(createDraft(index), a, b);
    const prepared = buildSimulationRequest(draft, index);
    expect(prepared.creditCost).toBe(a + b - 1);
  });

  it("never serializes an inactive slot, even when four are inactive", () => {
    const draft = shape(createDraft(index), 1, 1);
    const serialized = JSON.stringify(buildSimulationRequest(draft, index).request);
    for (const id of ["A2", "A3", "B2", "B3"]) {
      expect(serialized).not.toContain(id);
    }
  });
});

/* ─────────────────────── round-trip preservation ─────────────────────── */

describe("shape round trips preserve the third slot", () => {
  it("restores A3/B3 configuration after 3v3 -> 2v2 -> 3v3", () => {
    let draft = shape(createDraft(index), 3, 3);
    draft = apply(
      draft,
      { type: "setChampion", id: "A3", champion: "Ashe" },
      { type: "setLevel", id: "A3", level: 7 },
      { type: "setChampion", id: "B3", champion: "Garen" },
      { type: "setStartingHp", id: "B3", startingHp: 555 }
    );

    const shrunk = shape(draft, 2, 2);
    // Still THERE, just not active — the whole point of hiding rather than
    // destroying.
    expect(shrunk.combatants.A3.champion).toBe("Ashe");
    expect(activeRuntimeIds(shrunk)).not.toContain("A3");
    expect(
      JSON.stringify(buildSimulationRequest(shrunk, index).request)
    ).not.toContain("A3");

    const restored = shape(shrunk, 3, 3);
    expect(restored.combatants.A3.champion).toBe("Ashe");
    expect(restored.combatants.A3.level).toBe(7);
    expect(restored.combatants.B3.champion).toBe("Garen");
    expect(restored.combatants.B3.startingHp).toBe(555);
  });

  it("keeps a three-entry priority order across a round trip", () => {
    let draft = shape(createDraft(index), 1, 3);
    draft = apply(
      draft,
      { type: "setTargetingPolicy", id: "A1", policy: "fixed" },
      { type: "togglePriority", id: "A1", target: "B3" },
      { type: "togglePriority", id: "A1", target: "B2" },
      { type: "togglePriority", id: "A1", target: "B1" }
    );
    expect(draft.combatants.A1.targeting.priority).toEqual(["B3", "B2", "B1"]);

    const shrunk = shape(draft, 1, 1);
    // The draft keeps all three; only the ACTIVE one is sent.
    expect(shrunk.combatants.A1.targeting.priority).toEqual(["B3", "B2", "B1"]);
    expect(activePriority(shrunk, "A1")).toEqual(["B1"]);

    const restored = shape(shrunk, 1, 3);
    expect(activePriority(restored, "A1")).toEqual(["B3", "B2", "B1"]);
  });

  it("sends only the active entries of a partially-active priority list", () => {
    let draft = shape(createDraft(index), 1, 3);
    draft = apply(
      draft,
      { type: "setTargetingPolicy", id: "A1", policy: "fixed" },
      { type: "togglePriority", id: "A1", target: "B3" },
      { type: "togglePriority", id: "A1", target: "B1" }
    );
    const twoEnemies = shape(draft, 1, 2);
    // B3 is inactive; B1 is not. A partially-filtered list is the case a
    // four-slot model could not produce with a three-entry list.
    expect(activePriority(twoEnemies, "A1")).toEqual(["B1"]);

    const prepared = buildSimulationRequest(twoEnemies, index);
    const targeting = prepared.request.targeting.A1 as {
      policy: string;
      priority?: string[];
    };
    expect(targeting.priority).toEqual(["B1"]);
    expect(JSON.stringify(prepared.request)).not.toContain("B3");
  });
});

/* ───────────────────────── slot independence ───────────────────────── */

describe("the third slot is independent", () => {
  it("keeps A3's build separate from A1 and A2", () => {
    let draft = shape(createDraft(index), 3, 1);
    const item = [...index.supportedItemNames][0];
    draft = apply(
      draft,
      { type: "setChampion", id: "A3", champion: "Ashe" },
      { type: "toggleItem", id: "A3", item, max: index.maxItems },
      { type: "setLevel", id: "A3", level: 4 }
    );

    expect(draft.combatants.A3.items).toEqual([item]);
    expect(draft.combatants.A1.items).toEqual([]);
    expect(draft.combatants.A2.items).toEqual([]);
    expect(draft.combatants.A1.level).not.toBe(4);
  });

  it("keeps A3's action plan separate from its team-mates", () => {
    let draft = shape(createDraft(index), 3, 1);
    draft = apply(draft, {
      type: "addStep",
      id: "A3",
      step: { kind: "slot", slot: "Q", activeName: null, notBefore: 2 },
    });

    expect(draft.combatants.A3.plan.steps).toHaveLength(2);
    expect(draft.combatants.A1.plan.steps).toHaveLength(1);
    expect(draft.combatants.A2.plan.steps).toHaveLength(1);
    // Step IDs are namespaced by runtime ID, so no cross-slot collision.
    expect(draft.combatants.A3.plan.steps[1].id).toContain("A3");
  });

  it("keeps three mirror champions independent", () => {
    let draft = shape(createDraft(index), 3, 1);
    draft = apply(
      draft,
      { type: "setChampion", id: "A1", champion: "Ashe" },
      { type: "setChampion", id: "A2", champion: "Ashe" },
      { type: "setChampion", id: "A3", champion: "Ashe" },
      { type: "setLevel", id: "A2", level: 5 }
    );

    const prepared = buildSimulationRequest(draft, index);
    const sent = prepared.request.team_a.combatants;
    expect(sent.map((c) => c.champion)).toEqual(["Ashe", "Ashe", "Ashe"]);
    expect(sent.map((c) => c.runtime_id)).toEqual(["A1", "A2", "A3"]);
    expect(sent[1].level).toBe(5);
    expect(sent[0].level).not.toBe(5);
  });

  it("copies a build into A3 without moving its plan or targeting", () => {
    let draft = shape(createDraft(index), 3, 1);
    draft = apply(
      draft,
      { type: "setChampion", id: "A1", champion: "Ashe" },
      { type: "setLevel", id: "A1", level: 9 },
      {
        type: "addStep",
        id: "A1",
        step: { kind: "basic_attack", slot: null, activeName: null, notBefore: 5 },
      },
      { type: "copyBuild", from: "A1", to: "A3" }
    );

    expect(draft.combatants.A3.champion).toBe("Ashe");
    expect(draft.combatants.A3.level).toBe(9);
    // The plan stayed with A1.
    expect(draft.combatants.A1.plan.steps).toHaveLength(2);
    expect(draft.combatants.A3.plan.steps).toHaveLength(1);
  });

  it("resets A3 alone", () => {
    let draft = shape(createDraft(index), 3, 3);
    const before = draft.combatants.A3.champion;
    draft = apply(
      draft,
      { type: "setChampion", id: "A3", champion: "Ashe" },
      { type: "setChampion", id: "A2", champion: "Garen" },
      { type: "resetCombatant", id: "A3", index }
    );
    expect(draft.combatants.A3.champion).toBe(before);
    expect(draft.combatants.A2.champion).toBe("Garen");
  });
});

/* ──────────────────────────── validation ──────────────────────────── */

describe("validation across six slots", () => {
  it("accepts a default 3v3", () => {
    const draft = shape(createDraft(index), 3, 3);
    expect(validateDraft(draft, index).canSubmit).toBe(true);
  });

  it("ignores an invalid INACTIVE third slot", () => {
    let draft = shape(createDraft(index), 3, 3);
    draft = apply(draft, { type: "setChampion", id: "A3", champion: "NotAChampion" });
    expect(validateDraft(draft, index).canSubmit).toBe(false);

    // Shrinking to 2v2 hides the broken slot, and a valid 2v2 must submit.
    const shrunk = shape(draft, 2, 2);
    expect(validateDraft(shrunk, index).canSubmit).toBe(true);
  });

  it("reports an invalid ACTIVE third slot against its own runtime ID", () => {
    let draft = shape(createDraft(index), 3, 3);
    draft = apply(draft, { type: "setChampion", id: "B3", champion: "NotAChampion" });
    const validation = validateDraft(draft, index);
    expect(validation.canSubmit).toBe(false);
    expect(
      validation.issues.some((i) => i.runtimeId === "B3" && i.field === "champion")
    ).toBe(true);
  });

  it("blocks a fixed policy whose only listed enemies are now inactive", () => {
    let draft = shape(createDraft(index), 1, 3);
    draft = apply(
      draft,
      { type: "setTargetingPolicy", id: "A1", policy: "fixed" },
      { type: "togglePriority", id: "A1", target: "B3" }
    );
    expect(validateDraft(draft, index).canSubmit).toBe(true);

    const shrunk = shape(draft, 1, 1);   // B3 no longer active
    const validation = validateDraft(shrunk, index);
    expect(validation.canSubmit).toBe(false);
    expect(
      validation.issues.some(
        (i) => i.runtimeId === "A1" && i.field === "targeting"
      )
    ).toBe(true);
  });

  it("refuses a priority entry that is not an active enemy of the third slot", () => {
    const draft = shape(createDraft(index), 3, 3);
    // An ALLY is never addable, whatever the shape.
    const attempted = draftReducer(draft, {
      type: "togglePriority",
      id: "A3",
      target: "A1",
    });
    expect(attempted).toBe(draft);
    expect(activeEnemiesOf(draft, "A3")).toEqual(["B1", "B2", "B3"]);
  });
});
