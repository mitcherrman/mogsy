/** RECONSTRUCT-R3C — the presented-match hint is a best-effort, per-account, bounded hint. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetPresentedMatch, MAX_AGE_MS, readPresentedMatch, rememberPresentedMatch } from "./presentedMatchHint";

afterEach(() => { vi.restoreAllMocks(); window.sessionStorage.clear(); });

describe("presentedMatchHint", () => {
  it("round-trips for the same account only", () => {
    rememberPresentedMatch("a", "m1", 1_000);
    expect(readPresentedMatch("a", 2_000)).toBe("m1");
    expect(readPresentedMatch("b", 2_000)).toBeNull();
  });

  it("expires after MAX_AGE_MS and is removed", () => {
    rememberPresentedMatch("a", "m1", 0);
    expect(readPresentedMatch("a", MAX_AGE_MS + 1)).toBeNull();
    expect(readPresentedMatch("a", 1)).toBeNull();
  });

  it("forgets only the named match when one is given", () => {
    rememberPresentedMatch("a", "m1");
    forgetPresentedMatch("m2");
    expect(readPresentedMatch("a")).toBe("m1");
    forgetPresentedMatch("m1");
    expect(readPresentedMatch("a")).toBeNull();
  });

  it("a malformed entry reads as no hint and is removed", () => {
    window.sessionStorage.setItem("mogzy.ranked.presentedMatch.v1", "{not json");
    expect(readPresentedMatch("a")).toBeNull();
    expect(window.sessionStorage.getItem("mogzy.ranked.presentedMatch.v1")).toBeNull();
  });

  it("blocked storage is simply no hint (private mode, blocked site data)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceeded"); });
    expect(() => rememberPresentedMatch("a", "m1")).not.toThrow();
    expect(readPresentedMatch("a")).toBeNull();
    expect(() => forgetPresentedMatch("m1")).not.toThrow();
  });
});
