/**
 * The pure reorder/insert operations behind the rebuilt builder controls.
 *
 * Tested away from the DOM because the property that matters is not what the
 * row looks like: it is that a move REPOSITIONS one segment and carries every
 * other segment, and every unexposed field, through untouched. That is the
 * Phase 4 format-preservation guarantee, and a reorder control is exactly the
 * kind of edit that quietly breaks it.
 */
import { describe, expect, it } from "vitest";
import { insertSegmentAt, moveSegmentTo } from "@/lib/admin/rankedFormatEditing";
import type { RankedFormatJson, SegmentSpecJson } from "@/lib/admin/rankedFormatApi";

const seg = (tag: string, extra: Record<string, unknown> = {}): SegmentSpecJson => ({
  module_id: "quiz", module_version: 1, analytics_tag: tag, ...extra,
});

const format = (...tags: string[]): RankedFormatJson => ({
  format_id: "f", format_version: 1, status: "active",
  // A format-level field the builder never renders. It must survive a move.
  rollout_allowlist: ["someone"],
  segment_pattern: tags.map((t) => seg(t)),
});

const tags = (f: RankedFormatJson) => f.segment_pattern.map((s) => s.analytics_tag);

describe("moveSegmentTo", () => {
  it("moves last to first in one call, keeping the others in order", () => {
    // The interaction the arrows made expensive: with the old swap-only
    // controls this was N-1 clicks AND a different result per click.
    expect(tags(moveSegmentTo(format("a", "b", "c", "d"), 3, 0)))
      .toEqual(["d", "a", "b", "c"]);
  });

  it("moves first to last the same way", () => {
    expect(tags(moveSegmentTo(format("a", "b", "c"), 0, 2))).toEqual(["b", "c", "a"]);
  });

  it("shifts the passed rows rather than swapping two", () => {
    // A swap would give ["a", "d", "c", "b"]; that is a different edit, and
    // the wrong one for a drag.
    expect(tags(moveSegmentTo(format("a", "b", "c", "d"), 3, 1)))
      .toEqual(["a", "d", "b", "c"]);
  });

  it("carries unexposed segment and format fields through untouched", () => {
    const f: RankedFormatJson = {
      ...format("a", "b"),
      segment_pattern: [seg("a", { pressure_seconds: 4 }), seg("b")],
    };
    const moved = moveSegmentTo(f, 0, 1);
    expect(moved.segment_pattern[1].pressure_seconds).toBe(4);
    expect(moved.rollout_allowlist).toEqual(["someone"]);
    // The segment objects are carried, not rebuilt from what the UI knows.
    expect(moved.segment_pattern[1]).toBe(f.segment_pattern[0]);
  });

  it("is identity for a no-op or out-of-range move", () => {
    const f = format("a", "b");
    // Identity, not a clone: a move that did not happen must not read as a
    // pending change in the dirty check.
    expect(moveSegmentTo(f, 1, 1)).toBe(f);
    expect(moveSegmentTo(f, -1, 0)).toBe(f);
    expect(moveSegmentTo(f, 0, 5)).toBe(f);
  });
});

describe("insertSegmentAt", () => {
  it("inserts at the named position", () => {
    expect(tags(insertSegmentAt(format("a", "b"), seg("new"), 0)))
      .toEqual(["new", "a", "b"]);
    expect(tags(insertSegmentAt(format("a", "b"), seg("new"), 1)))
      .toEqual(["a", "new", "b"]);
  });

  it("appends at the end, which is what the old add-only control did", () => {
    expect(tags(insertSegmentAt(format("a", "b"), seg("new"), 2)))
      .toEqual(["a", "b", "new"]);
  });

  it("clamps rather than dropping the admin's new module", () => {
    expect(tags(insertSegmentAt(format("a"), seg("new"), 99))).toEqual(["a", "new"]);
    expect(tags(insertSegmentAt(format("a"), seg("new"), -5))).toEqual(["new", "a"]);
  });

  it("deep-clones, so two rows from one catalog entry never share config", () => {
    const defaults = seg("d", { module_config: { pool: "easy" } });
    const once = insertSegmentAt(format("a"), defaults, 0);
    const twice = insertSegmentAt(once, defaults, 0);
    (twice.segment_pattern[0].module_config as Record<string, unknown>).pool = "hard";
    expect((twice.segment_pattern[1].module_config as Record<string, unknown>).pool)
      .toBe("easy");
    expect((defaults.module_config as Record<string, unknown>).pool).toBe("easy");
  });
});
