/**
 * PLAY1 — what the match-entry scroll offers, and who decides.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLATFORM_POLICY,
  POLICY_KEYS,
  parsePlatformPolicy,
} from "@/lib/platform-policy/policy";
import {
  PLAY_MODES,
  isPlayScrollEmpty,
  playModeVisibility,
  visiblePlayModes,
} from "./playModes";

describe("the three play modes", () => {
  it("are exactly Ranked, Daily Challenge and Invite, in that order", () => {
    expect(PLAY_MODES.map((m) => m.id)).toEqual(["ranked", "daily", "invite"]);
    expect(PLAY_MODES.map((m) => m.title)).toEqual([
      "Ranked Match", "Daily Challenge", "Invite",
    ]);
  });

  it("carries the owner-approved copy verbatim", () => {
    // Pinned to the exact strings, not to a shape. These three lines are the
    // whole of what the record says about each way in, they were written by
    // the owner, and a well-meaning rewrite of any of them is a product
    // change rather than a refactor.
    const byId = Object.fromEntries(PLAY_MODES.map((m) => [m.id, m]));
    expect(byId.ranked.kicker).toBe("Competitive");
    expect(byId.ranked.note).toBe(
      "Enter Ranked queue to test your League knowledge.",
    );
    expect(byId.daily.kicker).toBe("Today's Study");
    expect(byId.daily.note).toBe(
      "Complete today's Leaguecraft set and keep your streak alive.",
    );
    expect(byId.invite.kicker).toBe("Your Roster");
    expect(byId.invite.note).toBe(
      "Challenge a friend to find out who is better.",
    );
    // Invite makes no Ranked claim: the invite backend does not exist, and
    // the card must not imply a rated match is on the other side of it.
    expect(byId.invite.note).not.toMatch(/ranked|rating|rated/i);
  });

  it("every mode carries the copy the scroll renders", () => {
    for (const mode of PLAY_MODES) {
      expect(mode.kicker.length).toBeGreaterThan(0);
      expect(mode.note.length).toBeGreaterThan(0);
      // No scaffolding copy ever reaches production UI.
      expect(mode.note).not.toMatch(/TODO|coming soon|placeholder/i);
      expect(mode.title).not.toMatch(/TODO|coming soon|placeholder/i);
    }
  });
});

describe("visibility comes from the global policy", () => {
  it("shows all three by default — the intended presentation", () => {
    const visibility = playModeVisibility(DEFAULT_PLATFORM_POLICY);
    expect(visibility).toEqual({ ranked: true, daily: true, invite: true });
    expect(visiblePlayModes(visibility)).toHaveLength(3);
    expect(isPlayScrollEmpty(visibility)).toBe(false);
  });

  it("shows all three when the settings table is unreadable", () => {
    // Fail-SAFE, not fail-closed: an outage must not silently empty the one
    // menu the lobby's primary action opens.
    expect(playModeVisibility(parsePlatformPolicy(null)))
      .toEqual({ ranked: true, daily: true, invite: true });
  });

  it("hides exactly the one mode a row turns off", () => {
    const policy = parsePlatformPolicy([
      { key: POLICY_KEYS.playModeInviteVisible, value: { enabled: false } },
    ]);
    const visibility = playModeVisibility(policy);
    expect(visibility).toEqual({ ranked: true, daily: true, invite: false });
    expect(visiblePlayModes(visibility).map((m) => m.id)).toEqual(["ranked", "daily"]);
  });

  it("keeps the written order when a middle mode is withheld", () => {
    const policy = parsePlatformPolicy([
      { key: POLICY_KEYS.playModeDailyChallengeVisible, value: { enabled: false } },
    ]);
    expect(visiblePlayModes(playModeVisibility(policy)).map((m) => m.id))
      .toEqual(["ranked", "invite"]);
  });

  it("reports the empty case rather than leaving the scroll blank", () => {
    const policy = parsePlatformPolicy([
      { key: POLICY_KEYS.playModeRankedVisible, value: { enabled: false } },
      { key: POLICY_KEYS.playModeDailyChallengeVisible, value: { enabled: false } },
      { key: POLICY_KEYS.playModeInviteVisible, value: { enabled: false } },
    ]);
    expect(isPlayScrollEmpty(playModeVisibility(policy))).toBe(true);
  });

  it("a malformed row falls back to visible, not to hidden", () => {
    const policy = parsePlatformPolicy([
      { key: POLICY_KEYS.playModeRankedVisible, value: "yes" },
      { key: POLICY_KEYS.playModeDailyChallengeVisible, value: null },
      { key: POLICY_KEYS.playModeInviteVisible, value: { enabled: "true" } },
    ]);
    expect(playModeVisibility(policy)).toEqual({ ranked: true, daily: true, invite: true });
  });

  it("changing a play mode leaves every other policy alone", () => {
    const policy = parsePlatformPolicy([
      { key: POLICY_KEYS.playModeRankedVisible, value: { enabled: false } },
    ]);
    expect(policy.combatSim).toEqual(DEFAULT_PLATFORM_POLICY.combatSim);
    expect(policy.tutorial).toEqual(DEFAULT_PLATFORM_POLICY.tutorial);
    expect(policy.navigation).toEqual(DEFAULT_PLATFORM_POLICY.navigation);
    expect(policy.community).toEqual(DEFAULT_PLATFORM_POLICY.community);
  });
});
