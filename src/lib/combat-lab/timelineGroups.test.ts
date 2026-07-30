/**
 * Contract for the Combat Lab timeline compaction.
 *
 * The rule this pins is conservative on purpose: a run may only stand for
 * actions whose whole visible outcome is identical, because a pill that says
 * "×7 · 107 each" is a claim about all seven. Anything that differs — damage,
 * mitigation, target, crit, the per-event breakdown — has to break the run.
 */
import { describe, expect, it } from "vitest";
import {
  groupConsecutiveTimelineEntries,
  timelineEquivalenceKey,
  type GroupableTimelineEntry,
} from "./timelineGroups";

let nextId = 1;
function aa(overrides: Partial<GroupableTimelineEntry> = {}): GroupableTimelineEntry {
  const id = nextId++;
  return {
    id,
    index: id,
    kind: "basic-attack",
    label: "Basic Attack",
    defender: "Malphite",
    final_damage: 107,
    raw_damage: 140,
    damage_type: "physical",
    shield_absorbed: 0,
    damage_reduction_percent: null,
    hp_after: 2000 - id * 107,
    hp_max: 2000,
    events: [{ type: "damage_packet", source: "Basic Attack", final_damage: 107, damage_type: "physical" }],
    ...overrides,
  };
}

describe("groupConsecutiveTimelineEntries", () => {
  it("collapses a run of identical basic attacks", () => {
    const entries = [aa(), aa(), aa(), aa(), aa(), aa(), aa()];
    const runs = groupConsecutiveTimelineEntries(entries);
    expect(runs).toHaveLength(1);
    expect(runs[0].count).toBe(7);
    expect(runs[0].damageEach).toBe(107);
    expect(runs[0].totalDamage).toBe(107 * 7);
  });

  it("keeps every underlying entry reachable, in order", () => {
    const entries = [aa(), aa(), aa()];
    const [run] = groupConsecutiveTimelineEntries(entries);
    expect(run.entries).toHaveLength(3);
    run.entries.forEach((e, i) => expect(e).toBe(entries[i]));
    expect(run.first).toBe(entries[0]);
    expect(run.latest).toBe(entries[2]);
  });

  it("never mutates or reorders the input array", () => {
    const entries = [aa(), aa(), aa({ final_damage: 90 })];
    const snapshot = entries.map((e) => ({ ...e }));
    groupConsecutiveTimelineEntries(entries);
    expect(entries).toHaveLength(3);
    entries.forEach((e, i) => expect(e).toMatchObject(snapshot[i]));
  });

  it("shows the most recent action as its own run when it differs", () => {
    const entries = [aa(), aa(), aa({ kind: "active", label: "Q1 Sweetspot", abilityKey: "Q" })];
    const runs = groupConsecutiveTimelineEntries(entries);
    expect(runs).toHaveLength(2);
    expect(runs[1].count).toBe(1);
    expect(runs[1].latest).toBe(entries[2]);
  });

  it("does not group across a damage change", () => {
    const runs = groupConsecutiveTimelineEntries([aa(), aa({ final_damage: 214 }), aa()]);
    expect(runs.map((r) => r.count)).toEqual([1, 1, 1]);
  });

  it("does not group across a mitigation change", () => {
    const runs = groupConsecutiveTimelineEntries([aa(), aa({ raw_damage: 200 })]);
    expect(runs.map((r) => r.count)).toEqual([1, 1]);
  });

  it("does not group across a damage-reduction or shield change", () => {
    expect(
      groupConsecutiveTimelineEntries([aa(), aa({ damage_reduction_percent: 0.2 })]).map((r) => r.count),
    ).toEqual([1, 1]);
    expect(
      groupConsecutiveTimelineEntries([aa(), aa({ shield_absorbed: 40 })]).map((r) => r.count),
    ).toEqual([1, 1]);
  });

  it("does not group across a target change", () => {
    const runs = groupConsecutiveTimelineEntries([aa(), aa({ defender: "Garen" })]);
    expect(runs.map((r) => r.count)).toEqual([1, 1]);
  });

  it("does not group a crit with a non-crit that happens to total the same", () => {
    const nonCrit = aa();
    const crit = aa({
      events: [
        { type: "damage_packet", source: "Basic Attack", final_damage: 107, damage_type: "physical", crit: true },
      ],
    });
    expect(groupConsecutiveTimelineEntries([nonCrit, crit]).map((r) => r.count)).toEqual([1, 1]);
  });

  it("does not group when the per-event breakdown differs", () => {
    const split = aa({
      events: [
        { type: "damage_packet", source: "Basic Attack", final_damage: 60, damage_type: "physical" },
        { type: "item_damage", source: "Sheen", final_damage: 47, damage_type: "physical" },
      ],
    });
    expect(groupConsecutiveTimelineEntries([aa(), split]).map((r) => r.count)).toEqual([1, 1]);
  });

  it("only groups consecutive runs", () => {
    const runs = groupConsecutiveTimelineEntries([
      aa(),
      aa(),
      aa({ kind: "active", label: "Q1", abilityKey: "Q" }),
      aa(),
      aa(),
    ]);
    expect(runs.map((r) => r.count)).toEqual([2, 1, 2]);
  });

  it("returns nothing for an empty timeline", () => {
    expect(groupConsecutiveTimelineEntries([])).toEqual([]);
  });
});

describe("timelineEquivalenceKey", () => {
  it("ignores float noise below the displayed precision", () => {
    expect(timelineEquivalenceKey(aa({ final_damage: 107.001 }))).toBe(
      timelineEquivalenceKey(aa({ final_damage: 107.0 })),
    );
  });

  it("separates two casts of the same ability at different ranks", () => {
    const a = aa({ kind: "active", label: "Q", abilityKey: "Q", abilityRank: 4 });
    const b = aa({ kind: "active", label: "Q", abilityKey: "Q", abilityRank: 5 });
    expect(timelineEquivalenceKey(a)).not.toBe(timelineEquivalenceKey(b));
  });
});
