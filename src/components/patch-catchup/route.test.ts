import { afterEach, describe, expect, it, vi } from "vitest";
import {
  catchUpSearch,
  patchReportHref,
  readLocationState,
  readPatchHubRoute,
  reportSearch,
} from "./route";
import {
  REMEMBERED_BASELINE_KEY,
  forgetRememberedBaseline,
  readRememberedBaseline,
  writeRememberedBaseline,
} from "./remembered-baseline";

const route = (search: string) => readPatchHubRoute(new URLSearchParams(search));

describe("Patch Hub route (§4)", () => {
  it("normal mode is untouched", () => {
    expect(route("")).toEqual({ mode: "report", patch: null });
    expect(route("?patch=26.19")).toEqual({ mode: "report", patch: "26.19" });
    expect(route("?patch=26.19&through=26.18")).toEqual({ mode: "report", patch: "26.19" });
  });

  it("since is the mode; a clean URL needs no rewrite", () => {
    expect(route("?since=26.14")).toEqual({ mode: "catchup", since: "26.14", cleanSearch: null });
    expect(route("?view=catchup")).toEqual({ mode: "catchup", since: null, cleanSearch: null });
  });

  it("patch and since never coexist; through and view are dropped", () => {
    expect(route("?patch=26.19&since=26.14")).toMatchObject({ since: "26.14", cleanSearch: "?since=26.14" });
    expect(route("?since=26.14&through=26.17")).toMatchObject({ since: "26.14", cleanSearch: "?since=26.14" });
    expect(route("?view=catchup&since=26.14")).toMatchObject({ since: "26.14", cleanSearch: "?since=26.14" });
    expect(route("?since=")).toMatchObject({ since: null, cleanSearch: "?view=catchup" });
  });

  it("builds canonical URLs", () => {
    expect(catchUpSearch("26.14")).toBe("?since=26.14");
    expect(catchUpSearch(null)).toBe("?view=catchup");
    expect(reportSearch(null)).toBe("");
    expect(reportSearch("26.18")).toBe("?patch=26.18");
    expect(patchReportHref("26.18", "s-patch-items__e-item-sundered-sky")).toBe(
      "/lol/patch-reports?patch=26.18#s-patch-items__e-item-sundered-sky",
    );
  });

  it("reads router state defensively", () => {
    expect(readLocationState(null)).toEqual({});
    expect(readLocationState({ returnPatch: 5, fromMemory: "yes" })).toEqual({ returnPatch: null, fromMemory: false });
    expect(readLocationState({ returnPatch: "26.17", fromMemory: true })).toEqual({ returnPatch: "26.17", fromMemory: true });
  });
});

describe("remembered baseline (§13, owner decision 7)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });
  const listed = ["26.19", "26.18", "26.14"];

  it("round-trips a listed patch under a versioned key", () => {
    writeRememberedBaseline("26.14");
    expect(localStorage.getItem(REMEMBERED_BASELINE_KEY)).toBe("26.14");
    expect(readRememberedBaseline(listed)).toBe("26.14");
    forgetRememberedBaseline();
    expect(readRememberedBaseline(listed)).toBeNull();
  });

  it("ignores unlisted and malformed values", () => {
    localStorage.setItem(REMEMBERED_BASELINE_KEY, "26.02");
    expect(readRememberedBaseline(listed)).toBeNull();
    localStorage.setItem(REMEMBERED_BASELINE_KEY, "<script>");
    expect(readRememberedBaseline(listed)).toBeNull();
    writeRememberedBaseline("not a patch");
    expect(localStorage.getItem(REMEMBERED_BASELINE_KEY)).toBe("<script>");
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => writeRememberedBaseline("26.14")).not.toThrow();
    expect(readRememberedBaseline(listed)).toBeNull();
  });
});
