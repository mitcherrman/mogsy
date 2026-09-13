import { describe, expect, it } from "vitest";
import { computePostConversionDestination } from "./post-conversion-route";
import { resolveReturnTo } from "./auth-destination";

/** The caller always hands a resolved returnTo; these build one either way. */
const explicit = (path: string) => resolveReturnTo(path, "/quiz");
const implicit = (fallback: string) => resolveReturnTo(null, fallback);

describe("computePostConversionDestination", () => {
  it("honours an explicit returnTo", () => {
    expect(computePostConversionDestination(explicit("/quiz/ranked"))).toBe("/quiz/ranked");
    expect(computePostConversionDestination(explicit("/profile"))).toBe("/profile");
  });

  it("falls back to the supplied hub when nothing was preserved", () => {
    expect(computePostConversionDestination(implicit("/quiz"))).toBe("/quiz");
  });

  it("TUT1: never routes anyone into a tutorial, with or without a destination", () => {
    // The retired flow used to claim an un-preserved destination for itself.
    expect(computePostConversionDestination(implicit("/quiz"))).not.toMatch(/tutorial/);
    expect(computePostConversionDestination(resolveReturnTo("//evil.com", "/quiz")))
      .toBe("/quiz");
  });

  it("an UNSAFE returnTo is rejected and never gains precedence", () => {
    expect(computePostConversionDestination(resolveReturnTo("//evil.com", "/lol")))
      .toBe("/lol");
  });
});
