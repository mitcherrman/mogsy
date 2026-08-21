import { describe, expect, it } from "vitest";
import { authHref, resolvePostAuthDestination, resolveReturnTo } from "./auth-destination";

describe("resolveReturnTo — explicit vs fallback", () => {
  it("marks a real internal path as explicit", () => {
    expect(resolveReturnTo("/quiz/ranked", "/lol")).toEqual({
      path: "/quiz/ranked",
      explicit: true,
    });
  });

  it("marks a missing returnTo as NOT explicit", () => {
    expect(resolveReturnTo(null, "/lol")).toEqual({ path: "/lol", explicit: false });
    expect(resolveReturnTo(undefined, "/lol").explicit).toBe(false);
    expect(resolveReturnTo("", "/lol").explicit).toBe(false);
  });

  it("preserves query and hash, which are part of the destination", () => {
    const r = resolveReturnTo("/quiz/stat-check/room/AB12?spectate=1#top", "/lol");
    expect(r.path).toBe("/quiz/stat-check/room/AB12?spectate=1#top");
    expect(r.explicit).toBe(true);
  });

  // ---- open-redirect protection is unchanged, and unsafe never wins ----

  it("rejects an absolute external URL and does not call it explicit", () => {
    const r = resolveReturnTo("https://evil.com", "/lol");
    expect(r.path).toBe("/lol");
    expect(r.explicit).toBe(false);
  });

  it("rejects a protocol-relative URL", () => {
    expect(resolveReturnTo("//evil.com", "/lol")).toEqual({ path: "/lol", explicit: false });
  });

  it("rejects the backslash variant", () => {
    expect(resolveReturnTo("/\\evil.com", "/lol").explicit).toBe(false);
  });

  it("rejects control-character smuggling", () => {
    expect(resolveReturnTo("/quiz\nhttps://evil.com", "/lol").explicit).toBe(false);
  });

  it("does not treat a returnTo that merely EQUALS the fallback as explicit", () => {
    // Nothing is lost by this: the destination is identical either way, and
    // only genuinely-preserved intent should be able to outrank onboarding.
    expect(resolveReturnTo("/lol", "/lol").explicit).toBe(false);
  });
});

describe("resolvePostAuthDestination — the one precedence", () => {
  it("1. an explicit destination beats onboarding", () => {
    expect(
      resolvePostAuthDestination({
        returnTo: resolveReturnTo("/quiz/ranked", "/lol"),
        onboardingRoute: "/onboarding/ranked-tutorial",
      }),
    ).toBe("/quiz/ranked");
  });

  it("2. onboarding applies only when nothing was preserved", () => {
    expect(
      resolvePostAuthDestination({
        returnTo: resolveReturnTo(null, "/lol"),
        onboardingRoute: "/onboarding/ranked-tutorial",
      }),
    ).toBe("/onboarding/ranked-tutorial");
  });

  it("3. the default hub is the last resort", () => {
    expect(
      resolvePostAuthDestination({ returnTo: resolveReturnTo(null, "/lol") }),
    ).toBe("/lol");
  });

  it("an UNSAFE returnTo cannot buy precedence over onboarding", () => {
    expect(
      resolvePostAuthDestination({
        returnTo: resolveReturnTo("//evil.com", "/lol"),
        onboardingRoute: "/onboarding/ranked-tutorial",
      }),
    ).toBe("/onboarding/ranked-tutorial");
  });
});

describe("authHref — one builder for every sender", () => {
  it("encodes the destination for sign-in", () => {
    expect(authHref("/quiz/ranked")).toBe("/auth?returnTo=%2Fquiz%2Franked");
  });

  it("adds the signup mode when asked", () => {
    expect(authHref("/quiz/ranked", { mode: "signup" })).toBe(
      "/auth?mode=signup&returnTo=%2Fquiz%2Franked",
    );
  });

  it("carries query and hash through the encoding", () => {
    expect(authHref("/room?code=AB12")).toBe("/auth?returnTo=%2Froom%3Fcode%3DAB12");
  });

  it("omits an unsafe destination rather than putting it in the URL", () => {
    expect(authHref("https://evil.com")).toBe("/auth");
    expect(authHref("//evil.com", { mode: "signup" })).toBe("/auth?mode=signup");
  });

  it("omits an empty destination", () => {
    expect(authHref("")).toBe("/auth");
  });
});
