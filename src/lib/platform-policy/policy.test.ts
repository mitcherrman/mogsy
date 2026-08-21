import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLATFORM_POLICY,
  POLICY_KEYS,
  evaluateTutorialPresentation,
  parsePlatformPolicy,
} from "./policy";

const KEY = POLICY_KEYS;

describe("defaults reproduce current production behaviour", () => {
  it("is all-on, except bot labels", () => {
    // showBotLabels is the one key defaulting FALSE, and that is what
    // reproduces production: there is no user-facing bot label today, so the
    // toggle introduces the "on" path rather than suppressing an existing one.
    expect(DEFAULT_PLATFORM_POLICY).toEqual({
      combatSim: { tokensRequiredForNonPro: true },
      tutorial: { autoPopupEnabled: true, completionRequiredForNewUsers: true },
      navigation: { globalNavbarVisible: true },
      community: { showBotLabels: false },
      // PLAY1: all three match-entry options visible, which is the intended
      // presentation of the Ranked lobby's PLAY scroll.
      play: { modes: { ranked: true, dailyChallenge: true, invite: true } },
    });
  });

  it("defaults the navbar to visible, so navigation is never lost by default", () => {
    expect(DEFAULT_PLATFORM_POLICY.navigation.globalNavbarVisible).toBe(true);
  });
});

describe("parsePlatformPolicy", () => {
  it("reads all five settings", () => {
    const policy = parsePlatformPolicy([
      { key: KEY.combatSimTokensRequiredForNonPro, value: { enabled: false } },
      { key: KEY.tutorialAutoPopupEnabled, value: { enabled: false } },
      { key: KEY.tutorialCompletionRequiredForNewUsers, value: { enabled: false } },
      { key: KEY.globalNavbarVisible, value: { enabled: false } },
      { key: KEY.showBotLabels, value: { enabled: true } },
    ]);
    expect(policy.combatSim.tokensRequiredForNonPro).toBe(false);
    expect(policy.tutorial.autoPopupEnabled).toBe(false);
    expect(policy.tutorial.completionRequiredForNewUsers).toBe(false);
    expect(policy.navigation.globalNavbarVisible).toBe(false);
    expect(policy.community.showBotLabels).toBe(true);
  });

  it("keeps the settings independent of one another", () => {
    const policy = parsePlatformPolicy([
      { key: KEY.tutorialAutoPopupEnabled, value: { enabled: false } },
    ]);
    // Only the popup was changed; the others keep their fail-closed defaults.
    expect(policy.tutorial.autoPopupEnabled).toBe(false);
    expect(policy.tutorial.completionRequiredForNewUsers).toBe(true);
    expect(policy.combatSim.tokensRequiredForNonPro).toBe(true);
    expect(policy.navigation.globalNavbarVisible).toBe(true);
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

describe("global navbar visibility", () => {
  it("maps to the app_settings key the migration seeds", () => {
    expect(KEY.globalNavbarVisible).toBe("global_navbar_visible");
  });

  it("parses an explicit true", () => {
    const policy = parsePlatformPolicy([
      { key: KEY.globalNavbarVisible, value: { enabled: true } },
    ]);
    expect(policy.navigation.globalNavbarVisible).toBe(true);
  });

  it("parses an explicit false", () => {
    const policy = parsePlatformPolicy([
      { key: KEY.globalNavbarVisible, value: { enabled: false } },
    ]);
    expect(policy.navigation.globalNavbarVisible).toBe(false);
  });

  it("defaults to visible when the row is missing entirely", () => {
    const policy = parsePlatformPolicy([
      { key: KEY.tutorialAutoPopupEnabled, value: { enabled: false } },
    ]);
    expect(policy.navigation.globalNavbarVisible).toBe(true);
  });

  it.each([
    ["null rows", null],
    ["undefined rows", undefined],
    ["empty rows (unreadable / failed fetch)", []],
  ])("defaults to visible on %s", (_label, rows) => {
    expect(parsePlatformPolicy(rows as never).navigation.globalNavbarVisible).toBe(true);
  });

  it.each([
    ["null value", null],
    ["bare boolean", false],
    ["string", "false"],
    ["array", []],
    ["missing enabled", { on: false }],
    ["non-boolean enabled", { enabled: "false" }],
    ["numeric enabled", { enabled: 0 }],
  ])("defaults to visible on a malformed value: %s", (_label, value) => {
    const policy = parsePlatformPolicy([{ key: KEY.globalNavbarVisible, value }]);
    // An outage or a bad row must never strand users without navigation.
    expect(policy.navigation.globalNavbarVisible).toBe(true);
  });

  it("turning the navbar off leaves every other policy field untouched", () => {
    const policy = parsePlatformPolicy([
      { key: KEY.globalNavbarVisible, value: { enabled: false } },
    ]);
    expect(policy.navigation.globalNavbarVisible).toBe(false);
    expect(policy.combatSim).toEqual(DEFAULT_PLATFORM_POLICY.combatSim);
    expect(policy.tutorial).toEqual(DEFAULT_PLATFORM_POLICY.tutorial);
  });

  it("a malformed navbar row does not weaken the other keys' parsing", () => {
    const policy = parsePlatformPolicy([
      { key: KEY.globalNavbarVisible, value: "nonsense" },
      { key: KEY.combatSimTokensRequiredForNonPro, value: { enabled: false } },
      { key: KEY.tutorialAutoPopupEnabled, value: { enabled: false } },
    ]);
    expect(policy.navigation.globalNavbarVisible).toBe(true);
    expect(policy.combatSim.tokensRequiredForNonPro).toBe(false);
    expect(policy.tutorial.autoPopupEnabled).toBe(false);
    expect(policy.tutorial.completionRequiredForNewUsers).toBe(true);
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
