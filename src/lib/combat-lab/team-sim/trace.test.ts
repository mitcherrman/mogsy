/**
 * SIM2 Phase 7A: trace-detail plumbing and compacted-trace derivations.
 *
 * Everything here runs against REAL captured payloads. The three
 * REAL_TRACE_LEVELS responses are one scenario simulated once per level, so a
 * difference between them can only be the level — and the capture itself
 * asserted the authoritative fields are byte-identical across all three before
 * writing them.
 *
 * Page-level behaviour (the selector, no-auto-submit, rendering) lives in
 * src/pages/dev/team-sim/TeamSimPage.trace.test.tsx.
 */
import { describe, expect, it } from "vitest";

import {
  REAL_CATALOG,
  REAL_CATALOG_PHASE7A,
  REAL_TRACE_LEVELS,
  REAL_TRACE_LEVEL_REQUESTS,
} from "./__fixtures__";
import { indexCatalog, traceDetailOptions } from "./catalog";
import type { TeamSimulationRequest, TraceDetail } from "./contract";
import {
  createDraft,
  draftReducer,
  validateDraft,
  type TeamScenarioDraft,
} from "./draft";
import { buildSimulationRequest } from "./request";
import {
  deathOrder,
  describeEvent,
  filterEvents,
  isActionFailure,
  repeatCount,
  traceReport,
  TRACE_DETAIL_LABELS,
} from "./result";

const LEVELS: TraceDetail[] = ["summary", "standard", "full"];

const index7a = indexCatalog(REAL_CATALOG_PHASE7A);
const indexLegacy = indexCatalog(REAL_CATALOG);

function apply(
  draft: TeamScenarioDraft,
  ...actions: Parameters<typeof draftReducer>[1][]
): TeamScenarioDraft {
  return actions.reduce(draftReducer, draft);
}

/* ───────────────────── catalog-driven level vocabulary ───────────────────── */

describe("traceDetailOptions", () => {
  it("reads the levels and the default from the catalog", () => {
    const options = traceDetailOptions(index7a);
    expect(options.allowed).toEqual(["summary", "standard", "full"]);
    expect(options.default).toBe("standard");
    expect(options.published).toBe(true);
    expect(options.selectable).toBe(true);
    expect(options.affectsDigest).toBe(true);
    expect(options.descriptions.standard).toBeTruthy();
  });

  it("degrades to un-selectable and UNPUBLISHED on a pre-7A catalog", () => {
    // The compatibility case, on a real pre-7A capture: no selector, and — the
    // part that matters — `published: false`, which is what makes the request
    // builder omit the field rather than send a level such a backend rejects.
    const options = traceDetailOptions(indexLegacy);
    expect(options.published).toBe(false);
    expect(options.selectable).toBe(false);
    expect(options.allowed).toEqual(["full"]);
  });

  it("ignores an unknown level and a default outside its own allowed list", () => {
    const malformed = indexCatalog({
      ...REAL_CATALOG_PHASE7A,
      trace_options: {
        default: "extreme" as TraceDetail,
        allowed: ["standard", "telepathic" as TraceDetail],
        field: "limits.trace_detail",
        affects_idempotency_digest: true,
        descriptions: {},
      },
    });
    const options = traceDetailOptions(malformed);
    expect(options.allowed).toEqual(["standard"]);
    // Falls back to an ALLOWED level rather than seeding every draft with one
    // the backend would reject.
    expect(options.default).toBe("standard");
  });
});

/* ─────────────────────────── draft and request ─────────────────────────── */

describe("trace detail in the draft and on the wire", () => {
  it("seeds a new draft from the catalog's published default", () => {
    expect(createDraft(index7a).scheduler.traceDetail).toBe("standard");
  });

  it("carries the selected level in limits.trace_detail", () => {
    for (const level of LEVELS) {
      const draft = apply(createDraft(index7a), {
        type: "setScheduler",
        patch: { traceDetail: level },
      });
      const { request } = buildSimulationRequest(draft, index7a);
      expect(request.limits.trace_detail).toBe(level);
    }
  });

  it("omits the field entirely against a pre-7A catalog", () => {
    const { request } = buildSimulationRequest(
      createDraft(indexLegacy),
      indexLegacy
    );
    expect(request.limits).not.toHaveProperty("trace_detail");
  });

  it("mints a DIFFERENT idempotency key for a different level", () => {
    // The level is inside the backend's request digest, so two levels are two
    // logical requests. Reusing one key across them is a 409, and a client
    // that reused it would be asking to be told its key is spoken for.
    const base = createDraft(index7a);
    const a = buildSimulationRequest(base, index7a);
    const b = buildSimulationRequest(
      apply(base, { type: "setScheduler", patch: { traceDetail: "full" } }),
      index7a
    );
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
    expect(a.request.limits.trace_detail).not.toBe(
      b.request.limits.trace_detail
    );
  });

  it("refuses to build while the draft names a level this backend rejects", () => {
    const draft = apply(createDraft(index7a), {
      type: "setScheduler",
      patch: { traceDetail: "exhaustive" as TraceDetail },
    });
    const validation = validateDraft(draft, index7a);
    expect(validation.canSubmit).toBe(false);
    expect(
      validation.issues.some(
        (issue) => issue.field === "scheduler" && /Trace detail/.test(issue.message)
      )
    ).toBe(true);
  });

  it("matches the captured requests the fixture responses came from", () => {
    for (const level of LEVELS) {
      const captured = REAL_TRACE_LEVEL_REQUESTS[level] as unknown as
        TeamSimulationRequest;
      expect(captured.limits.trace_detail).toBe(level);
    }
  });
});

/* ──────────────────────────── traceReport ──────────────────────────── */

describe("traceReport", () => {
  it("reports the backend's own numbers at every level", () => {
    for (const level of LEVELS) {
      const report = traceReport(REAL_TRACE_LEVELS[level]);
      expect(report.detail).toBe(level);
      expect(report.returned).toBe(REAL_TRACE_LEVELS[level].events.length);
      // The invariant the backend guarantees, re-checked on real bytes.
      expect(report.returned + report.omitted).toBe(report.simulated);
    }
  });

  it("separates compaction from truncation", () => {
    const full = traceReport(REAL_TRACE_LEVELS.full);
    expect(full.compacted).toBe(false);
    expect(full.truncated).toBe(false);
    expect(full.omitted).toBe(0);

    const standard = traceReport(REAL_TRACE_LEVELS.standard);
    expect(standard.compacted).toBe(true);
    expect(standard.truncated).toBe(false);
    expect(standard.grouped).toBeGreaterThan(0);

    const summary = traceReport(REAL_TRACE_LEVELS.summary);
    expect(summary.compacted).toBe(true);
    expect(summary.grouped).toBe(0);
    expect(summary.omitted).toBeGreaterThan(summary.grouped);
  });

  it("never claims compaction for a pre-7A response that merely truncated", () => {
    const legacy = {
      ...REAL_TRACE_LEVELS.full,
      trace: {
        truncated: true,
        simulated_event_count: 100,
        returned_event_count: 10,
        rule: "first_10_by_seq",
        summaries_cover_full_simulation: true,
      },
    };
    const report = traceReport(legacy);
    expect(report.detail).toBeNull();       // never guessed
    expect(report.compacted).toBe(false);   // never inferred from the counts
    expect(report.truncated).toBe(true);
    expect(report.omitted).toBe(90);        // derived, since the field is absent
  });
});

/* ─────────────────────── the level-independence claim ─────────────────────── */

describe("the result does not depend on the trace level", () => {
  it("reports the same winner, HP, totals and death order at every level", () => {
    const reference = REAL_TRACE_LEVELS.full;
    for (const level of LEVELS) {
      const payload = REAL_TRACE_LEVELS[level];
      expect(payload.termination).toEqual(reference.termination);
      expect(payload.duration).toBe(reference.duration);
      expect(payload.event_count).toBe(reference.event_count);
      expect(payload.combatant_summaries).toEqual(reference.combatant_summaries);
      expect(payload.team_summaries).toEqual(reference.team_summaries);
      expect(payload.final_targets).toEqual(reference.final_targets);
    }
  });

  it("derives the casualty list identically at every level", () => {
    // deathOrder reads combatant_summaries, and uses the trace only to
    // attribute the KILLER. Deaths are lifecycle events, which no level drops,
    // so attribution survives compaction too.
    const reference = deathOrder(REAL_TRACE_LEVELS.full);
    expect(reference.length).toBeGreaterThan(0);
    for (const level of LEVELS) {
      expect(deathOrder(REAL_TRACE_LEVELS[level])).toEqual(reference);
    }
    expect(reference.every((death) => !death.attributionUnavailable)).toBe(true);
  });
});

/* ────────────────────────── event families and rows ────────────────────────── */

describe("what each level returns", () => {
  it("keeps every family full returned, at standard", () => {
    const kinds = (payload: (typeof REAL_TRACE_LEVELS)[TraceDetail]) =>
      new Set(payload.events.map((e) => `${e.source}/${e.type}`));
    const missing = [...kinds(REAL_TRACE_LEVELS.full)].filter(
      (kind) => !kinds(REAL_TRACE_LEVELS.standard).has(kind)
    );
    expect(missing).toEqual([]);
  });

  it("returns no kernel events at summary, and keeps the rest", () => {
    const sources = new Set(
      REAL_TRACE_LEVELS.summary.events.map((e) => e.source)
    );
    expect(sources.has("kernel")).toBe(false);
    expect(sources.has("scheduler")).toBe(true);
    expect(sources.has("lifecycle")).toBe(true);
    expect(sources.has("termination")).toBe(true);
  });

  it("keeps deterministic seq order at every level", () => {
    for (const level of LEVELS) {
      const seqs = REAL_TRACE_LEVELS[level].events.map((e) => e.seq);
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
      expect(new Set(seqs).size).toBe(seqs.length);
    }
  });

  it("keeps every filter working, keyed off source as before", () => {
    for (const level of LEVELS) {
      const events = REAL_TRACE_LEVELS[level].events;
      const combat = filterEvents(events, "combat");
      expect(combat.every((e) => e.source === "kernel")).toBe(true);
      expect(filterEvents(events, "all")).toEqual(events);
      expect(
        filterEvents(events, "lifecycle").every((e) => e.source === "lifecycle")
      ).toBe(true);
    }
    // The one filter the level genuinely empties, and only that one.
    expect(filterEvents(REAL_TRACE_LEVELS.summary.events, "combat")).toEqual([]);
    expect(
      filterEvents(REAL_TRACE_LEVELS.standard.events, "combat").length
    ).toBeGreaterThan(0);
  });
});

/* ──────────────────────────── grouped rows ──────────────────────────── */

describe("repeat rows", () => {
  const grouped = REAL_TRACE_LEVELS.standard.events.filter((e) => e.repeats);

  it("exist in the captured standard trace", () => {
    expect(grouped.length).toBeGreaterThan(0);
  });

  it("carry a consistent count and span", () => {
    for (const event of grouped) {
      const repeats = event.repeats!;
      expect(repeats.count).toBeGreaterThan(1);
      expect(repeats.first_seq).toBe(event.seq);
      expect(repeats.first_time).toBe(event.time);
      expect(repeats.last_seq).toBeGreaterThanOrEqual(repeats.first_seq);
      expect(repeats.last_time).toBeGreaterThanOrEqual(repeats.first_time);
    }
  });

  it("account for exactly the events the backend says it folded", () => {
    const folded = grouped.reduce((sum, e) => sum + (e.repeats!.count - 1), 0);
    expect(folded).toBe(traceReport(REAL_TRACE_LEVELS.standard).grouped);
  });

  it("never appear at full", () => {
    expect(REAL_TRACE_LEVELS.full.events.some((e) => e.repeats)).toBe(false);
  });

  it("say so in their own description, with the span", () => {
    const event = grouped[0];
    const text = describeEvent(event);
    expect(text).toContain(`×${event.repeats!.count}`);
    expect(text).toContain(`#${event.repeats!.first_seq}`);
    expect(repeatCount(event)).toBe(event.repeats!.count);
  });

  it("leaves an ordinary row's description untouched", () => {
    const plain = REAL_TRACE_LEVELS.full.events.find((e) => !e.repeats)!;
    expect(describeEvent(plain)).not.toContain("×");
    expect(repeatCount(plain)).toBe(1);
  });
});

/* ─────────────────────────── never hidden ─────────────────────────── */

describe("the two families no level may hide", () => {
  it("returns every death at every level", () => {
    const dead = Object.values(REAL_TRACE_LEVELS.full.combatant_summaries)
      .filter((s) => s.death_time !== null)
      .map((s) => s.runtime_id)
      .sort();
    expect(dead.length).toBeGreaterThan(0);
    for (const level of LEVELS) {
      const reported = REAL_TRACE_LEVELS[level].events
        .filter((e) => e.type === "death")
        .map((e) => e.target_id)
        .sort();
      expect(reported).toEqual(dead);
    }
  });

  it("treats action_failed as a failure at every level", () => {
    for (const level of LEVELS) {
      for (const event of REAL_TRACE_LEVELS[level].events) {
        expect(isActionFailure(event)).toBe(event.type === "action_failed");
      }
    }
  });
});

describe("labels", () => {
  it("names every level the catalog can publish", () => {
    for (const level of traceDetailOptions(index7a).allowed) {
      expect(TRACE_DETAIL_LABELS[level]).toBeTruthy();
    }
  });
});
