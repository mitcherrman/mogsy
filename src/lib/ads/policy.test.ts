import { describe, expect, it } from "vitest";
import { classifyBlockedRoute, resolveAdPolicy, type AdPolicyContext } from "./policy";
import type { AdsConfig } from "./config";

const allOn: AdsConfig = {
  adsGloballyEnabled: true,
  thirdPartyAdsEnabled: true,
  houseAdsEnabled: true,
  placeholdersEnabled: true,
};

function ctx(overrides: Partial<AdPolicyContext> = {}): AdPolicyContext {
  return {
    placement: "quiz_results",
    route: "/quiz",
    proStatus: "free",
    isSignedIn: true,
    consent: "granted",
    config: allOn,
    ...overrides,
  };
}

describe("resolveAdPolicy", () => {
  it("suppresses everything when the global kill switch is off", () => {
    expect(
      resolveAdPolicy(ctx({ config: { ...allOn, adsGloballyEnabled: false } })),
    ).toEqual({ kind: "suppressed", reason: "global_disabled" });
  });

  it("rejects unknown placement identifiers", () => {
    expect(
      resolveAdPolicy(ctx({ placement: "made_up_slot" as never })),
    ).toEqual({ kind: "suppressed", reason: "unknown_placement" });
  });

  it("grants third-party eligibility to a known-free user with consent", () => {
    expect(resolveAdPolicy(ctx())).toEqual({ kind: "third_party" });
  });

  it("never grants third-party eligibility to Pro (falls back to house)", () => {
    expect(resolveAdPolicy(ctx({ proStatus: "pro" }))).toEqual({ kind: "house" });
  });

  it("Pro with house disabled is fully suppressed with reason pro (no placeholder flash)", () => {
    expect(
      resolveAdPolicy(
        ctx({
          proStatus: "pro",
          config: { ...allOn, houseAdsEnabled: false, placeholdersEnabled: false },
        }),
      ),
    ).toEqual({ kind: "suppressed", reason: "pro" });
  });

  it("fails closed while a signed-in user's entitlement is loading", () => {
    expect(resolveAdPolicy(ctx({ proStatus: "unknown" }))).toEqual({
      kind: "suppressed",
      reason: "entitlement_loading",
    });
  });

  it("treats guests (not signed in) with resolved free status as eligible", () => {
    expect(resolveAdPolicy(ctx({ isSignedIn: false }))).toEqual({ kind: "third_party" });
  });

  it("suppresses during an active quiz question", () => {
    expect(resolveAdPolicy(ctx({ isActiveQuizQuestion: true }))).toEqual({
      kind: "suppressed",
      reason: "active_quiz",
    });
  });

  it("suppresses during an active ranked match", () => {
    expect(
      resolveAdPolicy(ctx({ placement: "ranked_results", isActiveRankedMatch: true })),
    ).toEqual({ kind: "suppressed", reason: "active_ranked_match" });
  });

  it("suppresses during ranked recovery", () => {
    expect(
      resolveAdPolicy(ctx({ placement: "ranked_queue", isRankedRecoveryState: true })),
    ).toEqual({ kind: "suppressed", reason: "ranked_recovery" });
  });

  it.each([
    ["/auth", "auth_or_checkout"],
    ["/reset-password", "auth_or_checkout"],
    ["/shop", "auth_or_checkout"],
    ["/lol/pro", "auth_or_checkout"],
    ["/settings", "auth_or_checkout"],
    ["/admin", "admin"],
    ["/admin/quiz-broadcast", "admin"],
    ["/moderator", "admin"],
    ["/quiz/admin", "admin"],
    ["/dev/ranked-duel", "developer_route"],
    ["/quiz/diagnostics", "developer_route"],
    ["/combat-lab/diagnostics", "developer_route"],
    ["/broadcast/live-view", "developer_route"],
    ["/privacy", "policy_route"],
    ["/terms", "policy_route"],
    ["/security", "policy_route"],
    ["/contact", "policy_route"],
  ])("suppresses on blocked route %s", (route, reason) => {
    expect(resolveAdPolicy(ctx({ route }))).toEqual({ kind: "suppressed", reason });
    expect(classifyBlockedRoute(route)).toBe(reason);
  });

  it("does not block ordinary product routes", () => {
    for (const route of ["/quiz", "/lol", "/lol/docs/champions/ahri", "/combat-lab"]) {
      expect(classifyBlockedRoute(route)).toBeNull();
    }
  });

  it("suppresses third-party without consent, falling back to house/placeholder", () => {
    expect(resolveAdPolicy(ctx({ consent: "unknown" }))).toEqual({ kind: "house" });
    expect(
      resolveAdPolicy(
        ctx({
          consent: "unknown",
          config: { ...allOn, houseAdsEnabled: false, placeholdersEnabled: false },
        }),
      ),
    ).toEqual({ kind: "suppressed", reason: "consent" });
  });

  it("with third-party disabled, free users get house ads when enabled", () => {
    expect(
      resolveAdPolicy(ctx({ config: { ...allOn, thirdPartyAdsEnabled: false } })),
    ).toEqual({ kind: "house" });
  });

  it("falls back to a dev placeholder when only placeholders are enabled", () => {
    expect(
      resolveAdPolicy(
        ctx({
          config: {
            adsGloballyEnabled: true,
            thirdPartyAdsEnabled: false,
            houseAdsEnabled: false,
            placeholdersEnabled: true,
          },
        }),
      ),
    ).toEqual({ kind: "placeholder" });
  });

  it("suppresses with nothing_to_render when all render paths are off", () => {
    expect(
      resolveAdPolicy(
        ctx({
          config: {
            adsGloballyEnabled: true,
            thirdPartyAdsEnabled: false,
            houseAdsEnabled: false,
            placeholdersEnabled: false,
          },
        }),
      ),
    ).toEqual({ kind: "suppressed", reason: "nothing_to_render" });
  });

  it("broadcast_below never allows third-party even when everything is on", () => {
    expect(resolveAdPolicy(ctx({ placement: "broadcast_below", route: "/watch" }))).toEqual({
      kind: "house",
    });
  });
});
