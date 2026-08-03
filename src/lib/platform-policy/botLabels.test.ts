/**
 * `show_bot_labels` — the public bot-label platform policy.
 *
 * Two things matter here and they are asserted separately:
 *
 *  1. The DEFAULT is false, and it stays false for a missing, null or malformed
 *     row. This is the one policy key that defaults off, because there is no
 *     user-facing bot label in production today — the toggle introduces the
 *     "on" path rather than suppressing an existing one.
 *
 *  2. CONTAINMENT. The flag is presentation only. The static assertions at the
 *     bottom are the guard: they read the actual source of the modules that
 *     decide authorization, filtering, analytics and SEO, and fail if any of
 *     them ever starts consulting this key.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLATFORM_POLICY,
  POLICY_KEYS,
  parsePlatformPolicy,
} from "./policy";

const SRC = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

/**
 * Source with comments removed. Several of these files mention the policy by
 * name in a comment precisely to record that they deliberately do NOT consult
 * it — matching on raw text would flag that documentation as a violation.
 * What matters is executable references.
 */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("default", () => {
  it("is false", () => {
    expect(DEFAULT_PLATFORM_POLICY.community.showBotLabels).toBe(false);
  });

  it("stays false when no row exists", () => {
    expect(parsePlatformPolicy([]).community.showBotLabels).toBe(false);
    expect(parsePlatformPolicy(null).community.showBotLabels).toBe(false);
  });

  it.each([
    ["null value", null],
    ["bare boolean", true],
    ["string", "true"],
    ["wrong shape", { on: true }],
    ["non-boolean enabled", { enabled: "yes" }],
    ["array", [1, 2]],
  ])("stays false for a malformed value (%s)", (_label, value) => {
    const policy = parsePlatformPolicy([{ key: POLICY_KEYS.showBotLabels, value }]);
    expect(policy.community.showBotLabels).toBe(false);
  });

  it("reads a valid stored value in both directions", () => {
    expect(
      parsePlatformPolicy([{ key: POLICY_KEYS.showBotLabels, value: { enabled: true } }]).community
        .showBotLabels,
    ).toBe(true);
    expect(
      parsePlatformPolicy([{ key: POLICY_KEYS.showBotLabels, value: { enabled: false } }]).community
        .showBotLabels,
    ).toBe(false);
  });

  it("uses the documented app_settings key", () => {
    expect(POLICY_KEYS.showBotLabels).toBe("show_bot_labels");
  });
});

describe("isolation from the other policies", () => {
  it("parsing only the bot-label row leaves the other defaults intact", () => {
    const policy = parsePlatformPolicy([
      { key: POLICY_KEYS.showBotLabels, value: { enabled: true } },
    ]);
    expect(policy.combatSim.tokensRequiredForNonPro).toBe(true);
    expect(policy.tutorial.autoPopupEnabled).toBe(true);
    expect(policy.tutorial.completionRequiredForNewUsers).toBe(true);
    expect(policy.navigation.globalNavbarVisible).toBe(true);
  });

  it("toggling it does not disturb explicitly stored sibling values", () => {
    const rows = [
      { key: POLICY_KEYS.combatSimTokensRequiredForNonPro, value: { enabled: false } },
      { key: POLICY_KEYS.globalNavbarVisible, value: { enabled: false } },
      { key: POLICY_KEYS.showBotLabels, value: { enabled: true } },
    ];
    const policy = parsePlatformPolicy(rows);
    expect(policy.combatSim.tokensRequiredForNonPro).toBe(false);
    expect(policy.navigation.globalNavbarVisible).toBe(false);
    expect(policy.community.showBotLabels).toBe(true);
  });
});

/**
 * CONTAINMENT. The requirement is that the policy "must never affect
 * authorization, filtering, analytics, SEO noindex behavior, soft-disable
 * behavior, or future bot runtime behavior". These are static guards over the
 * modules that own each of those concerns.
 */
describe("containment", () => {
  const FORBIDDEN = /showBotLabels|show_bot_labels/;

  it.each([
    ["SEO noindex", "pages/UserProfile.tsx"],
    ["admin analytics filtering", "lib/admin-data-sources.ts"],
    ["admin CSV export", "lib/admin-csv-export.ts"],
    ["route authorization", "components/AdminRoute.tsx"],
    ["admin session authorization", "lib/admin-auth/AdminAuthProvider.tsx"],
    ["soft-disable + friends filtering", "hooks/useFriends.ts"],
    ["cross-user profile reads", "lib/league-profiles.ts"],
    ["admin directory data layer", "lib/admin/admin-users.ts"],
  ])("%s never consults the bot-label policy", (_what, file) => {
    expect(code(file)).not.toMatch(FORBIDDEN);
  });

  it.each([
    "components/admin/AdminBots.tsx",
    "components/admin/AdminUserCard.tsx",
    "pages/admin/AdminUserDirectory.tsx",
  ])("master-admin surface %s never consults it either", (file) => {
    expect(code(file)).not.toMatch(FORBIDDEN);
  });

  it("is offered as a control in the admin platform-policies panel", () => {
    const panel = read("pages/admin/AdminPlatformPolicies.tsx");
    expect(panel).toContain("POLICY_KEYS.showBotLabels");
    expect(panel).toContain("Show bot labels");
    // Warns when ON: for this key, enabling is the material change.
    expect(panel).toMatch(/field: "showBotLabels"[\s\S]*?warnWhen: "on"/);
  });

  it("the SEO noindex rule still keys off is_bot alone", () => {
    // Guards the exact production behaviour: a bot profile stays out of search
    // results whether or not it wears a visible badge.
    expect(read("pages/UserProfile.tsx")).toMatch(/noindex=\{[^}]*profile\.is_bot/);
  });
});
