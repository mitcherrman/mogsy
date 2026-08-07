/**
 * Result derivations, asserted against real responses.
 *
 * The attribution rule under test: on a `death` event the scheduler puts the
 * KILLER in actor_id and the combatant that died in target_id.
 */
import { describe, expect, it } from "vitest";

import {
  deathOrder,
  describeEvent,
  digestReport,
  effectiveBuildEntries,
  filterEvents,
  isActionFailure,
  orderedRuntimeIds,
  resultOverview,
  TRACE_FILTERS,
} from "./result";
import {
  REAL_1V1,
  REAL_2V2,
  REAL_2V2_TRUNCATED,
  REAL_ACTION_FAILED,
  REAL_CATALOG,
} from "./__fixtures__";

const DIGEST = REAL_CATALOG.catalog_digest;

describe("digestReport", () => {
  it("reports agreement when the request, response and page all match", () => {
    const report = digestReport(REAL_2V2, DIGEST, DIGEST);
    expect(report.responseDigests).toEqual([DIGEST]);
    expect(report.executionMismatch).toBe(false);
    expect(report.pageDrift).toBe(false);
    expect(report.mismatch).toBe(false);
  });

  it("flags a response whose effective builds ran on a different catalog", () => {
    const report = digestReport(REAL_2V2, "configured-digest", "configured-digest");
    expect(report.executionMismatch).toBe(true);
    expect(report.responseDigests).toEqual([DIGEST]);
  });

  it("separates later PAGE drift from an execution disagreement", () => {
    // The run itself was perfectly consistent; only the page moved on. Calling
    // that "the catalog changed between configuration and execution" is false,
    // and its remedy (refresh) cannot clear it.
    const report = digestReport(REAL_2V2, DIGEST, "newer-digest");
    expect(report.executionMismatch).toBe(false);
    expect(report.pageDrift).toBe(true);
    expect(report.mismatch).toBe(true);
  });

  it("flags a response carrying no digest at all", () => {
    const stripped = {
      ...REAL_2V2,
      effective_builds: {
        A1: {
          ...REAL_2V2.effective_builds.A1,
          data_version: { patch: null, catalog_digest: "" },
        },
      },
    };
    expect(digestReport(stripped, DIGEST, DIGEST).executionMismatch).toBe(true);
  });

  it("flags ONE build with a missing digest even when its siblings agree", () => {
    // Filtering empty digests out before comparing would let this build hide
    // behind the others and produce "matched on every effective build".
    const partial = {
      ...REAL_2V2,
      effective_builds: {
        ...REAL_2V2.effective_builds,
        B2: {
          ...REAL_2V2.effective_builds.B2,
          data_version: { patch: null, catalog_digest: "" },
        },
      },
    };
    const report = digestReport(partial, DIGEST, DIGEST);
    expect(report.executionMismatch).toBe(true);
    expect(report.responseDigests).toContain("");
  });

  it("fails closed on an empty effective_builds map", () => {
    const empty = { ...REAL_2V2, effective_builds: {} };
    expect(digestReport(empty, DIGEST, DIGEST).executionMismatch).toBe(true);
  });

  it("flags disagreement between builds inside one response", () => {
    const mixed = {
      ...REAL_2V2,
      effective_builds: {
        ...REAL_2V2.effective_builds,
        B2: {
          ...REAL_2V2.effective_builds.B2,
          data_version: { patch: null, catalog_digest: "other" },
        },
      },
    };
    const report = digestReport(mixed, DIGEST, DIGEST);
    expect(report.executionMismatch).toBe(true);
    expect(report.responseDigests).toContain("other");
  });
});

describe("event trace filters", () => {
  it("filters strictly by scheduler SOURCE", () => {
    for (const spec of TRACE_FILTERS) {
      if (spec.sources === null) continue;
      const filtered = filterEvents(REAL_2V2.events, spec.key);
      for (const event of filtered) expect(spec.sources).toContain(event.source);
    }
  });

  it("keeps every event under 'all'", () => {
    expect(filterEvents(REAL_2V2.events, "all")).toHaveLength(REAL_2V2.events.length);
  });

  it("surfaces the real death and retarget events under their filters", () => {
    const lifecycle = filterEvents(REAL_2V2.events, "lifecycle");
    expect(lifecycle.some((e) => e.type === "death")).toBe(true);
    const targeting = filterEvents(REAL_2V2.events, "targeting");
    expect(targeting.some((e) => e.type === "target_changed")).toBe(true);
  });

  it("recognises action_failed events in the real trace", () => {
    const failures = REAL_ACTION_FAILED.events.filter(isActionFailure);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0].source).toBe("scheduler");
    expect(String(failures[0].meta?.error)).toContain("Unsupported active_name");
  });
});

describe("describeEvent", () => {
  it("attributes a death to the combatant that DIED, not the killer", () => {
    const death = REAL_2V2.events.find((e) => e.type === "death")!;
    // The scheduler's own attribution: actor is the killer.
    expect(death.actor_id).toBe("A2");
    expect(death.target_id).toBe("B2");
    expect(describeEvent(death)).toBe("B2 died — killed by A2");
  });

  it("describes retargets with both the old and new target", () => {
    const retarget = REAL_2V2.events.find((e) => e.type === "target_changed")!;
    expect(describeEvent(retarget)).toContain("retargeted");
    expect(describeEvent(retarget)).toContain(String(retarget.meta?.previous_target_id));
    expect(describeEvent(retarget)).toContain(String(retarget.target_id));
  });

  it("reports the backend's own reason for a rejected action", () => {
    const failure = REAL_ACTION_FAILED.events.find(isActionFailure)!;
    expect(describeEvent(failure)).toContain("Unsupported active_name");
  });

  it("reports applied damage on an executed action", () => {
    const executed = REAL_1V1.events.find((e) => e.type === "action_executed")!;
    expect(describeEvent(executed)).toMatch(/HP damage|executed/);
  });

  it("reads the scheduler's OWN meta keys for skips, halts and delays", () => {
    // Verified against team_combat/scheduler.py: {policy, error} on skip and
    // halt, {from_time, to_time, waiting_for} on delay. A wrong key name here
    // silently degrades every one of these rows to a generic label.
    const skipped = REAL_ACTION_FAILED.events.find(
      (e) => e.type === "plan_step_skipped"
    )!;
    expect(skipped.meta).toHaveProperty("policy");
    expect(skipped.meta).toHaveProperty("error");
    expect(describeEvent(skipped)).toContain("on_failure=skip");
    expect(describeEvent(skipped)).toContain("Unsupported active_name");

    const base = REAL_ACTION_FAILED.events[0];
    expect(
      describeEvent({
        ...base,
        type: "delay",
        meta: { from_time: 1, to_time: 4.5, waiting_for: ["B1"] },
      })
    ).toBe("idle until 4.500s (waiting for B1)");
    expect(
      describeEvent({
        ...base,
        type: "plan_halted",
        meta: { policy: "halt", error: "boom", cursor: 2 },
      })
    ).toBe("plan halted (on_failure=halt): boom");
    expect(
      describeEvent({ ...base, type: "plan_exhausted", meta: { steps: 3, cursor: 3 } })
    ).toContain("3 steps");
  });

  it("reports the termination reason and winner", () => {
    const terminated = REAL_2V2.events.find((e) => e.type === "terminated")!;
    expect(describeEvent(terminated)).toContain("team_elimination");
    expect(describeEvent(terminated)).toContain("winner A");
  });
});

describe("deathOrder", () => {
  it("lists the real 2v2 deaths in time order with the right casualties", () => {
    const deaths = deathOrder(REAL_2V2);
    expect(deaths.map((d) => d.runtimeId)).toEqual(["B2", "B1"]);
    expect(deaths.every((d) => d.selfInflicted === false)).toBe(true);
    expect(deaths.map((d) => d.killerId)).toEqual(["A2", "A2"]);
    expect(deaths.every((d) => d.attributionUnavailable === false)).toBe(true);
    // Times come from the summaries, which cover the whole run.
    expect(REAL_2V2.combatant_summaries.B2.death_time).toBeCloseTo(deaths[0].time, 6);
    expect(REAL_2V2.combatant_summaries.B1.death_time).toBeCloseTo(deaths[1].time, 6);
  });

  it("still lists every casualty when the TRACE was truncated past the deaths", () => {
    // The real truncated fixture returns seq 1-12 and contains zero death
    // events, while its summaries still report both B1 and B2 dead. Deriving
    // the list from the trace would silently drop the entire casualty list.
    expect(REAL_2V2_TRUNCATED.events.some((e) => e.type === "death")).toBe(false);
    const deaths = deathOrder(REAL_2V2_TRUNCATED);
    expect(deaths.map((d) => d.runtimeId)).toEqual(["B2", "B1"]);
    // The killer is genuinely trace-only, so it is reported as unavailable
    // rather than guessed.
    expect(deaths.every((d) => d.killerId === null)).toBe(true);
    expect(deaths.every((d) => d.attributionUnavailable)).toBe(true);
  });

  it("returns nothing when nobody died", () => {
    const noDeaths = {
      ...REAL_2V2,
      events: REAL_2V2.events.filter((e) => e.type !== "death"),
      combatant_summaries: Object.fromEntries(
        Object.entries(REAL_2V2.combatant_summaries).map(([id, s]) => [
          id,
          { ...s, alive: true, death_time: null },
        ])
      ),
    };
    expect(deathOrder(noDeaths)).toEqual([]);
  });
});

describe("resultOverview", () => {
  it("reports the winner, termination and full/returned counts", () => {
    const overview = resultOverview(REAL_2V2);
    expect(overview.winner).toBe("A");
    expect(overview.outcomeLabel).toBe("Team A wins");
    expect(overview.terminationReason).toBe("team_elimination");
    expect(overview.truncated).toBe(false);
    expect(overview.returnedEventCount).toBe(overview.simulatedEventCount);
  });

  it("keeps BOTH counts visible when the backend truncated the trace", () => {
    const overview = resultOverview(REAL_2V2_TRUNCATED);
    expect(overview.truncated).toBe(true);
    expect(overview.returnedEventCount).toBeLessThan(overview.simulatedEventCount);
    expect(overview.truncationRule).toMatch(/^first_\d+_by_seq$/);
    expect(REAL_2V2_TRUNCATED.trace.summaries_cover_full_simulation).toBe(true);
  });

  it("says 'no winner' rather than inventing one", () => {
    const drawn = {
      ...REAL_2V2,
      termination: { reason: "max_duration", winner: null, detail: "" },
    };
    expect(resultOverview(drawn).outcomeLabel).toBe("No winner");
  });
});

describe("ordering", () => {
  it("orders runtime IDs by the backend's scenario slot index", () => {
    expect(orderedRuntimeIds(REAL_2V2)).toEqual(["A1", "A2", "B1", "B2"]);
    expect(orderedRuntimeIds(REAL_1V1)).toEqual(["A1", "B1"]);
  });

  it("renders effective builds in the same slot order", () => {
    expect(effectiveBuildEntries(REAL_2V2).map(([id]) => id)).toEqual([
      "A1",
      "A2",
      "B1",
      "B2",
    ]);
  });
});
