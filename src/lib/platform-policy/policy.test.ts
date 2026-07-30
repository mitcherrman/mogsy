import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLATFORM_POLICY,
  POLICY_KEYS,
  evaluateTutorialPresentation,
  parsePlatformPolicy,
} from "./policy";

const KEY = POLICY_KEYS;

describe("defaults reproduce current production behaviour", () => {
  it("is all-on", () => {
    expect(DEFAULT_PLATFORM_POLICY).toEqual({
      combatSim: { tokensRequiredForNonPro: true },
      tutorial: { autoPopupEnabled: true, completionRequiredForNewUsers: true },
    });
  });
});

describe("parsePlatformPolicy", () => {
  it("reads all three settings", () => {
    const policy = parsePlatformPolicy([
      { key: KEY.combatSimTokensRequiredForNonPro, value: { enabled: false } },
      { key: KEY.tutorialAutoPopupEnabled, value: { enabled: false } },
      { key: KEY.tutorialCompletionRequiredForNewUsers, value: { enabled: false } },
    ]);
    expect(policy.combatSim.tokensRequiredForNonPro).toBe(false);
    expect(policy.tutorial.autoPopupEnabled).toBe(false);
    expect(policy.tutorial.completionRequiredForNewUsers).toBe(false);
  });

  it("keeps the settings independent of one another", () => {
    const policy = parsePlatformPolicy([
      { key: KEY.tutorialAutoPopupEnabled, value: { enabled: false } },
    ]);
    // Only the popup was changed; the other two keep their fail-closed defaults.
    expect(policy.tutorial.autoPopupEnabled).toBe(false);
    expect(policy.tutorial.completionRequiredForNewUsers).toBe(true);
    expect(policy.combatSim.tokensRequiredForNonPro).toBe(true);
  });

  it("ignores unrelated app_settings rows", () => {
    const policy = parsePlatformPolicy([
      { key: "require_auth", value: { enabled: false } },
      { key: "nav_tab_mode", value: { mode: "swipe" } },
    ]);
    expect(policy).toEqual(DEFAULT_PLATFORM_POLICY);
  });

  it.each([
    ["null rows", null],
    ["undefined rows", undefined],
    ["empty rows", []],
  ])("fails closed on %s", (_label, rows) => {
    expect(parsePlatformPolicy(rows as never)).toEqual(DEFAULT_PLATFORM_POLICY);
  });

  it.each([
    ["null value", null],
    ["bare boolean", false],
    ["string", "false"],
    ["array", []],
    ["missing enabled", { on: false }],
    ["non-boolean enabled", { enabled: "false" }],
  ])("fails closed on a malformed value: %s", (_label, value) => {
    const policy = parsePlatformPolicy([
      { key: KEY.combatSimTokensRequiredForNonPro, value },
    ]);
    expect(policy.combatSim.tokensRequiredForNonPro).toBe(true);
  });
});

describe("evaluateTutorialPresentation — all four toggle combinations", () => {
  const newUser = { completed: false, eligibleForFirstVisit: true };

  it("popup ON + forced ON → popup appears and is not dismissible", () => {
    const r = evaluateTutorialPresentation({
      ...newUser, autoPopupEnabled: true, completionRequiredForNewUsers: true,
    });
    expect(r.showAutoPopup).toBe(true);
    expect(r.popupDismissible).toBe(false);
  });

  it("popup ON + forced OFF → popup appears but can be skipped", () => {
    const r = evaluateTutorialPresentation({
      ...newUser, autoPopupEnabled: true, completionRequiredForNewUsers: false,
    });
    expect(r.showAutoPopup).toBe(true);
    expect(r.popupDismissible).toBe(true);
  });

  it("popup OFF + forced ON → no popup (the route guard still forces entry)", () => {
    const r = evaluateTutorialPresentation({
      ...newUser, autoPopupEnabled: false, completionRequiredForNewUsers: true,
    });
    expect(r.showAutoPopup).toBe(false);
  });

  it("popup OFF + forced OFF → no popup at all", () => {
    const r = evaluateTutorialPresentation({
      ...newUser, autoPopupEnabled: false, completionRequiredForNewUsers: false,
    });
    expect(r.showAutoPopup).toBe(false);
  });

  it("never shows the popup to a user who already completed the tutorial", () => {
    for (const autoPopupEnabled of [true, false]) {
      for (const completionRequiredForNewUsers of [true, false]) {
        const r = evaluateTutorialPresentation({
          autoPopupEnabled,
          completionRequiredForNewUsers,
          completed: true,
          eligibleForFirstVisit: true,
        });
        expect(r.showAutoPopup).toBe(false);
      }
    }
  });

  it("never shows the popup to an ineligible (non-first-visit) user", () => {
    const r = evaluateTutorialPresentation({
      autoPopupEnabled: true,
      completionRequiredForNewUsers: true,
      completed: false,
      eligibleForFirstVisit: false,
    });
    expect(r.showAutoPopup).toBe(false);
  });
});
