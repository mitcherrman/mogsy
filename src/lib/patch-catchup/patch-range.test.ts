import { describe, expect, it } from "vitest";
import { buildCatchUpReport } from "./build";
import {
  adjacency,
  analyzeCoverage,
  comparePatchVersions,
  orderVersions,
  validateRange,
} from "./patch-range";
import { championCard, report, statLine } from "./test-support";

/** A report with one champion line, so it appears in `lines`. */
const rep = (version: string, n = 1) =>
  report(version, [championCard(`Champ ${version}`, Array.from({ length: n }, (_, i) =>
    statLine(`Stat ${i}`, "1", "2"),
  ))]);

const range = (since: string, through: string, versions: string[], listed?: string[]) =>
  buildCatchUpReport({
    reports: versions.map((v) => rep(v)),
    sincePatch: since,
    throughPatch: through,
    listedVersions: listed,
  });

describe("semantic patch ordering (never lexical)", () => {
  it("orders 26.2 < 26.10 and 14.24 < 25.4 < 26.1", () => {
    expect(comparePatchVersions("26.2", "26.10")).toBeLessThan(0);
    expect("26.2" < "26.10").toBe(false); // lexical order would get this wrong
    expect(orderVersions(["26.10", "26.9", "26.2", "26.1", "25.24", "14.24"]).ordered).toEqual([
      "14.24",
      "25.24",
      "26.1",
      "26.2",
      "26.9",
      "26.10",
    ]);
  });

  it("treats 25.04 and 25.4 as the same patch and puts 25.S1.1 / 26.12b outside the order", () => {
    expect(comparePatchVersions("25.04", "25.4")).toBe(0);
    const { ordered, unorderable } = orderVersions(["26.1", "25.S1.1", "26.12b", "25.04"]);
    expect(ordered).toEqual(["25.04", "26.1"]);
    expect(unorderable).toEqual(["25.S1.1", "26.12b"]);
  });

  it("classifies adjacency: consecutive, gap, unverifiable across forms and years", () => {
    expect(adjacency("26.13", "26.14")).toBe("adjacent");
    expect(adjacency("26.9", "26.10")).toBe("adjacent");
    expect(adjacency("26.13", "26.15")).toBe("gap");
    expect(adjacency("25.24", "26.1")).toBe("unverifiable");
    expect(adjacency("14.24", "25.S1.1")).toBe("unverifiable");
    expect(adjacency("25.S1.3", "25.04")).toBe("unverifiable");
    expect(adjacency("26.10", "26.10.1")).toBe("unverifiable");
  });
});

describe("range validation", () => {
  it("rejects unparseable or inverted ranges", () => {
    expect(validateRange("25.S1.1", "26.19")).toEqual({ ok: false, detail: "since_unparseable" });
    expect(validateRange("26.12b", "26.19")).toEqual({ ok: false, detail: "since_unparseable" });
    expect(validateRange("26.12", "latest")).toEqual({ ok: false, detail: "through_unparseable" });
    expect(validateRange("26.19", "26.12")).toEqual({ ok: false, detail: "since_after_through" });
    expect(validateRange("26.12", "26.19")).toEqual({ ok: true, upToDate: false });
    expect(validateRange("26.19", "26.19")).toEqual({ ok: true, upToDate: true });
  });

  it("buildCatchUpReport returns range_invalid with a detail", () => {
    expect(range("26.19", "26.12", [])).toEqual({
      ok: false,
      reason: "range_invalid",
      detail: "since_after_through",
    });
    expect(range("25.S1.1", "26.12", [])).toMatchObject({ ok: false, detail: "since_unparseable" });
  });
});

describe("X excluded, Y included", () => {
  const all = ["26.10", "26.11", "26.12", "26.13", "26.14"];

  it("returns patches strictly after X through Y inclusive", () => {
    const res = range("26.11", "26.13", all, all);
    if (!res.ok) throw new Error("range");
    expect(res.report.includedPatches).toEqual(["26.12", "26.13"]);
    expect(res.report.lines.map((l) => l.patch)).toEqual(["26.12", "26.13"]);
    expect(res.report.coverage.complete).toBe(true);
    expect(res.report.range).toMatchObject({
      semantics: "since_exclusive_through_inclusive",
      status: "range",
      clampedToCoverageFloor: false,
    });
  });

  it("ignores loaded reports outside the range without complaint", () => {
    const res = range("26.12", "26.13", all, all);
    if (!res.ok) throw new Error("range");
    expect(res.report.includedPatches).toEqual(["26.13"]);
    expect(res.report.coverage.complete).toBe(true);
  });

  it("through is mandatory: missing Y is reported, not silently shortened", () => {
    const res = range("26.11", "26.14", ["26.12", "26.13"], all);
    if (!res.ok) throw new Error("range");
    expect(res.report.coverage.missingPatches).toEqual(["26.14"]);
    expect(res.report.continuity.status).toBe("withheld");
  });

  it("since === through is up to date: no patches, no lines, no issues", () => {
    const res = range("26.14", "26.14", all, all);
    if (!res.ok) throw new Error("range");
    expect(res.report.range.status).toBe("up_to_date");
    expect(res.report.includedPatches).toEqual([]);
    expect(res.report.lines).toEqual([]);
    expect(res.report.coverage.complete).toBe(true);
    expect(res.report.totals.riotLines).toBe(0);
  });

  it("orders by semantics even when the input is lexically scrambled", () => {
    const versions = ["26.10", "26.2", "26.9", "26.1"];
    const res = range("26.0", "26.10", versions, versions);
    if (!res.ok) throw new Error("range");
    expect(res.report.includedPatches).toEqual(["26.1", "26.2", "26.9", "26.10"]);
  });

  it("no changes in the interval: reports with no cards yield an empty, complete report", () => {
    const res = buildCatchUpReport({
      reports: [report("26.12", []), report("26.13", [])],
      sincePatch: "26.11",
      throughPatch: "26.13",
      listedVersions: ["26.11", "26.12", "26.13"],
    });
    if (!res.ok) throw new Error("range");
    expect(res.report.lines).toEqual([]);
    expect(res.report.entities).toEqual([]);
    expect(res.report.continuity.chains).toEqual([]);
    expect(res.report.continuity.status).toBe("available");
    expect(res.report.coverage.complete).toBe(true);
    expect(res.report.includedPatches).toEqual(["26.12", "26.13"]);
  });
});

describe("coverage floor (baseline older than the listing)", () => {
  const listed = ["26.10", "26.11", "26.12"];

  it("clamps: the floor is included and no hole is reported before it", () => {
    const res = range("26.1", "26.12", listed, listed);
    if (!res.ok) throw new Error("range");
    expect(res.report.range).toMatchObject({ clampedToCoverageFloor: true, coverageFloor: "26.10" });
    expect(res.report.includedPatches).toEqual(listed);
    expect(res.report.coverage.complete).toBe(true);
  });

  it("without the listing the floor is unknown, so the same range is withheld", () => {
    const res = range("26.1", "26.12", listed);
    if (!res.ok) throw new Error("range");
    expect(res.report.coverage.issues.map((i) => i.kind)).toContain("ordinal_gap");
    expect(res.report.continuity.status).toBe("withheld");
  });

  it("a baseline just before the floor needs no listing", () => {
    const res = range("26.9", "26.12", listed);
    if (!res.ok) throw new Error("range");
    expect(res.report.coverage.complete).toBe(true);
  });
});

describe("missing and unverifiable patches (coverage vs continuity)", () => {
  it("a listed patch with no report: Riot lines stay, continuity is withheld", () => {
    const listed = ["26.12", "26.13", "26.14", "26.15"];
    const res = range("26.12", "26.15", ["26.13", "26.15"], listed);
    if (!res.ok) throw new Error("range");
    expect(res.report.coverage.missingPatches).toEqual(["26.14"]);
    expect(res.report.coverage.complete).toBe(false);
    expect(res.report.lines.map((l) => l.patch)).toEqual(["26.13", "26.15"]);
    expect(res.report.continuity).toMatchObject({
      status: "withheld",
      withheldReasons: ["missing_report"],
      chains: [],
    });
  });

  it("a hole in the sequence with no listing is an ordinal gap and withholds continuity", () => {
    const res = range("26.12", "26.15", ["26.13", "26.15"]);
    if (!res.ok) throw new Error("range");
    expect(res.report.coverage.issues).toContainEqual({
      kind: "ordinal_gap",
      versions: ["26.13", "26.15"],
      withholdsContinuity: true,
    });
    expect(res.report.continuity.status).toBe("withheld");
  });

  it("a year boundary is unverifiable: reported, but it only blocks links across it", () => {
    const res = range("25.23", "26.2", ["25.24", "26.1", "26.2"], ["25.24", "26.1", "26.2"]);
    if (!res.ok) throw new Error("range");
    const kinds = res.report.coverage.issues.map((i) => i.kind);
    expect(kinds).toEqual(["unverified_adjacency"]);
    expect(res.report.coverage.complete).toBe(false);
    expect(res.report.continuity.status).toBe("available");
  });

  it("an unorderable version (25.S1.1) is reported and withholds continuity", () => {
    const res = range("26.12", "26.13", ["26.13", "25.S1.1"], ["26.12", "26.13"]);
    if (!res.ok) throw new Error("range");
    expect(res.report.coverage.unorderablePatches).toEqual(["25.S1.1"]);
    expect(res.report.continuity.status).toBe("withheld");
    expect(res.report.lines).toHaveLength(1);
  });

  it("a duplicate report is reported and withholds continuity", () => {
    const res = range("26.12", "26.13", ["26.13", "26.13"], ["26.12", "26.13"]);
    if (!res.ok) throw new Error("range");
    expect(res.report.coverage.duplicatePatches).toEqual(["26.13"]);
    expect(res.report.continuity.status).toBe("withheld");
    expect(res.report.lines).toHaveLength(1);
  });

  it("analyzeCoverage is independent of input order", () => {
    const base = {
      sincePatch: "26.11",
      throughPatch: "26.14",
      upToDate: false,
      listed: ["26.11", "26.12", "26.13", "26.14"],
    };
    const a = analyzeCoverage({ ...base, loaded: ["26.12", "26.13", "26.14"] });
    const b = analyzeCoverage({ ...base, loaded: ["26.14", "26.12", "26.13"] });
    expect(b).toEqual(a);
  });
});
