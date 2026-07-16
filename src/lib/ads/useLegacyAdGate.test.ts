import { describe, expect, it } from "vitest";
import { resolveLegacyAdGate, type LegacyAdGateInput } from "./useLegacyAdGate";
import type { AdsConfig } from "./config";

const allOn: AdsConfig = {
  adsGloballyEnabled: true,
  thirdPartyAdsEnabled: true,
  houseAdsEnabled: true,
  placeholdersEnabled: false,
};

function input(overrides: Partial<LegacyAdGateInput> = {}): LegacyAdGateInput {
  return {
    legacyKey: "swipe",
    route: "/swipe-game",
    proStatus: "free",
    isSignedIn: true,
    consent: "unknown",
    config: allOn,
    ...overrides,
  };
}

describe("resolveLegacyAdGate", () => {
  it("free + consented + enabled Swipe state passes with Google allowed", () => {
    const d = resolveLegacyAdGate(input({ consent: "granted" }));
    expect(d).toEqual({
      allowGoogle: true,
      allowCustom: true,
      suppressed: false,
      reason: null,
      staffQaActive: false,
    });
  });

  it("without consent, custom creatives may pass but Google may not", () => {
    const d = resolveLegacyAdGate(input());
    expect(d.allowGoogle).toBe(false);
    expect(d.allowCustom).toBe(true);
    expect(d.suppressed).toBe(false);
  });

  it("Pro Swipe user is suppressed", () => {
    const d = resolveLegacyAdGate(input({ proStatus: "pro", consent: "granted" }));
    // Legacy Swipe creatives are paid-style interstitials, so Pro is fully
    // suppressed — no Google unit AND no custom creative.
    expect(d.allowGoogle).toBe(false);
    expect(d.allowCustom).toBe(false);
    expect(d.suppressed).toBe(true);
    expect(d.reason).toBe("pro");
  });

  it("unknown signed-in entitlement is suppressed (fail closed)", () => {
    const d = resolveLegacyAdGate(input({ proStatus: "unknown", consent: "granted" }));
    expect(d.suppressed).toBe(true);
    expect(d.reason).toBe("entitlement_loading");
  });

  it("staff QA override is explicit: lifts only Pro suppression, custom-only", () => {
    const d = resolveLegacyAdGate(
      input({ proStatus: "pro", consent: "granted", overrides: { staffQa: true } }),
    );
    expect(d.allowCustom).toBe(true);
    expect(d.allowGoogle).toBe(false); // never grants live Google traffic
    expect(d.staffQaActive).toBe(true);
  });

  it("staff QA cannot override the kill switch, routes, or loading entitlement", () => {
    expect(
      resolveLegacyAdGate(
        input({ config: { ...allOn, adsGloballyEnabled: false }, overrides: { staffQa: true } }),
      ).suppressed,
    ).toBe(true);
    expect(
      resolveLegacyAdGate(input({ route: "/admin", overrides: { staffQa: true } })).suppressed,
    ).toBe(true);
    expect(
      resolveLegacyAdGate(
        input({ proStatus: "unknown", overrides: { staffQa: true } }),
      ).reason,
    ).toBe("entitlement_loading");
  });

  it("active/excluded product states remain suppressed", () => {
    expect(
      resolveLegacyAdGate(input({ overrides: { isActiveQuizQuestion: true } })).reason,
    ).toBe("active_quiz");
    expect(
      resolveLegacyAdGate(input({ overrides: { isActiveRankedMatch: true } })).reason,
    ).toBe("active_ranked_match");
    expect(resolveLegacyAdGate(input({ route: "/auth" })).reason).toBe("auth_or_checkout");
    expect(resolveLegacyAdGate(input({ route: "/dev/ranked-duel" })).reason).toBe(
      "developer_route",
    );
  });

  it("known legacy keys map to valid typed placements", () => {
    expect(resolveLegacyAdGate(input({ legacyKey: "swipe" })).suppressed).toBe(false);
    expect(
      resolveLegacyAdGate(input({ legacyKey: "blog", route: "/blog/some-post", consent: "granted" }))
        .allowGoogle,
    ).toBe(true);
  });

  it("unknown legacy placement keys fail closed", () => {
    const d = resolveLegacyAdGate(input({ legacyKey: "navbar_banner" }));
    expect(d.suppressed).toBe(true);
    expect(d.reason).toBe("unknown_placement");
  });

  it("global kill switch suppresses everything", () => {
    const d = resolveLegacyAdGate(input({ config: { ...allOn, adsGloballyEnabled: false } }));
    expect(d).toMatchObject({ allowGoogle: false, allowCustom: false, reason: "global_disabled" });
  });
});
