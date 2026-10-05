import { describe, expect, it } from "vitest";
import { CATCHUP_REPORT_STALE_MS, PATCH_REPORTS_KEY, patchReportKey, planCatchUpRange } from "./plan";

const index = (...versions: string[]) => ({ patches: versions.map((patch_version) => ({ patch_version })) });
const ok = (plan: ReturnType<typeof planCatchUpRange>) => {
  if (plan.ok === false) throw new Error(`plan failed: ${plan.failure.code}`);
  return plan;
};

describe("query keys", () => {
  it("are exactly the keys the Patch Reports page and Patch Impact use", () => {
    expect(PATCH_REPORTS_KEY).toEqual(["patch-reports"]);
    expect(patchReportKey("26.14")).toEqual(["patch-report", "26.14"]);
    expect(CATCHUP_REPORT_STALE_MS).toBe(30 * 60 * 1000);
  });
});

describe("fetch set: (since, through] — X excluded, Y included", () => {
  const listing = index("26.19", "26.18", "26.17", "26.16", "26.15", "26.14");

  it("since 26.18 through 26.19 needs 26.19 only", () => {
    expect(ok(planCatchUpRange(listing, "26.18", "26.19")).versions).toEqual(["26.19"]);
  });

  it("since 26.15 through 26.19 needs 26.16–26.19, oldest first", () => {
    expect(ok(planCatchUpRange(listing, "26.15", "26.19")).versions).toEqual([
      "26.16",
      "26.17",
      "26.18",
      "26.19",
    ]);
  });

  it("never includes anything before X or after Y", () => {
    const plan = ok(planCatchUpRange(listing, "26.15", "26.17"));
    expect(plan.versions).toEqual(["26.16", "26.17"]);
  });

  it("a baseline below the oldest listed patch needs every listed patch up to Y (floor clamp)", () => {
    expect(ok(planCatchUpRange(listing, "26.1", "26.16")).versions).toEqual(["26.14", "26.15", "26.16"]);
  });

  it("since === through is up to date and needs no report", () => {
    const plan = ok(planCatchUpRange(listing, "26.19", "26.19"));
    expect(plan.upToDate).toBe(true);
    expect(plan.versions).toEqual([]);
  });

  it("orders semantically, not lexically or by list position (26.2 < 26.10)", () => {
    const shuffled = index("26.10", "26.2", "26.9", "26.11", "26.1");
    expect(ok(planCatchUpRange(shuffled, "26.1", "26.11")).versions).toEqual(["26.2", "26.9", "26.10", "26.11"]);
  });

  it("does not assume consecutive minors: a hole in the listing stays a hole", () => {
    expect(ok(planCatchUpRange(index("26.13", "26.15", "26.16"), "26.12", "26.16")).versions).toEqual([
      "26.13",
      "26.15",
      "26.16",
    ]);
  });
});

describe("through patch", () => {
  const listing = index("26.17", "26.19", "26.18", "26.2", "26.10");

  it("defaults to the newest listed patch by semantic order", () => {
    const plan = ok(planCatchUpRange(listing, "26.17", null));
    expect(plan.throughPatch).toBe("26.19");
    expect(plan.versions).toEqual(["26.18", "26.19"]);
  });

  it("an explicit through is used as given and is not requested when the index does not list it", () => {
    const plan = ok(planCatchUpRange(listing, "26.17", "26.25"));
    expect(plan.throughPatch).toBe("26.25");
    expect(plan.throughListed).toBe(false);
    expect(plan.versions).toEqual(["26.18", "26.19"]);
  });

  it("no through and no orderable listed patch → range_invalid / no_listed_patches", () => {
    const plan = planCatchUpRange(index("25.S1.1"), "26.1", null);
    expect(plan).toMatchObject({ ok: false, failure: { code: "range_invalid", detail: "no_listed_patches" } });
  });
});

describe("range validation (PH3-B's verdict)", () => {
  it.each([
    ["bad", "26.19", "since_unparseable"],
    ["26.1", "latest", "through_unparseable"],
    ["26.19", "26.15", "since_after_through"],
  ])("since %s through %s → %s", (since, through, detail) => {
    expect(planCatchUpRange(index("26.15", "26.19"), since, through)).toMatchObject({
      ok: false,
      failure: { code: "range_invalid", detail },
    });
  });
});

describe("the index listing", () => {
  it("is passed on exactly as returned (order, duplicates, unorderable forms)", () => {
    const listed = ["26.16", "25.S1.1", "26.15", "26.16", "26.14"];
    expect(ok(planCatchUpRange(index(...listed), "26.14", "26.16")).listedVersions).toEqual(listed);
  });

  it("unorderable forms are never requested", () => {
    expect(ok(planCatchUpRange(index("26.15", "25.S1.1", "26.16", "26.12b"), "26.14", "26.16")).versions).toEqual([
      "26.15",
      "26.16",
    ]);
  });

  it("a repeated spelling is requested once", () => {
    expect(ok(planCatchUpRange(index("26.15", "26.15", "26.16"), "26.14", "26.16")).versions).toEqual([
      "26.15",
      "26.16",
    ]);
  });

  it("different spellings of one patch are each requested (so a conflict can be detected)", () => {
    expect(ok(planCatchUpRange(index("26.3", "26.4", "26.04", "26.5"), "26.3", "26.5")).versions).toEqual([
      "26.04",
      "26.4",
      "26.5",
    ]);
  });

  it("equal-ranked spellings are ordered by spelling, not by where the index listed them", () => {
    expect(ok(planCatchUpRange(index("26.5", "26.4", "26.3", "26.04"), "26.3", "26.5")).versions).toEqual([
      "26.04",
      "26.4",
      "26.5",
    ]);
  });

  it.each([
    ["not an object", null],
    ["no patches array", { patches: "x" }],
    ["entry without a version", { patches: [{ patch_version: "26.1" }, {}] }],
    ["entry with a non-string version", { patches: [{ patch_version: 26.1 }] }],
    ["blank version", { patches: [{ patch_version: " " }] }],
  ])("%s → index_malformed", (_label, body) => {
    expect(planCatchUpRange(body, "26.1", "26.2")).toMatchObject({
      ok: false,
      failure: { code: "index_malformed" },
    });
  });
});
