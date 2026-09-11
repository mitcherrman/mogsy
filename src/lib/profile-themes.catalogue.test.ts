/**
 * The profile theme catalogue, and the one fact three places have to agree on.
 *
 * `app_settings.theme_config.free_themes` used to be a third, LIVE statement of
 * which themes are free, and it disagreed with the `isPro` flags in this file:
 * the shipped default config listed neither `light` nor `dark`, so a Free user
 * saw them unlocked in one entry point and locked in another. PT2E deleted that
 * source. What remains is the catalogue flag, the derived predicate, and the
 * SQL restatement — and the first two are pinned here, the third by
 * `src/test/security/pt2eProfileThemeAuthority.test.ts`.
 */
import { describe, it, expect } from "vitest";
import {
  profileThemes,
  getThemeById,
  profileThemeRequiresPremium,
  FREE_PROFILE_THEMES,
  DEFAULT_PROFILE_THEME,
} from "./profile-themes";

describe("profile theme catalogue", () => {
  it("has exactly five free themes, and default is one of them", () => {
    expect([...FREE_PROFILE_THEMES]).toEqual(["default", "light", "dark", "midnight", "forest"]);
    expect(FREE_PROFILE_THEMES).toContain(DEFAULT_PROFILE_THEME);
  });

  it("gives every catalogue entry an isPro flag that matches the free list", () => {
    for (const t of profileThemes) {
      expect(t.isPro, `${t.id}`).toBe(!(FREE_PROFILE_THEMES as readonly string[]).includes(t.id));
    }
  });

  it("no longer ships the sitewide-only Cycle All theme", () => {
    // `cycle` had no style tokens at all — it was an instruction to the sitewide
    // provider to rotate the root class on a timer. It cannot mean anything for
    // a profile card, and it was also `profileThemes[0]`, which made it the
    // silent fallback for every unknown id.
    expect(profileThemes.map((t) => t.id)).not.toContain("cycle");
  });

  it("falls back to default by NAME, not by position", () => {
    expect(getThemeById("not-a-theme").id).toBe("default");
    expect(getThemeById("").id).toBe("default");
    // The fallback must carry real style tokens; the old one did not.
    expect(getThemeById("not-a-theme").styles.heroBg).toBeTruthy();
  });

  it("gives every theme the full set of profile style tokens", () => {
    for (const t of profileThemes) {
      for (const key of ["heroBg", "accentRing", "textAccent", "iconAccent"] as const) {
        expect(t.styles[key], `${t.id}.${key}`).toBeTruthy();
      }
    }
  });

  it("fails closed: an unknown id is Premium, not free", () => {
    expect(profileThemeRequiresPremium("not-a-theme")).toBe(true);
    expect(profileThemeRequiresPremium("cycle")).toBe(true);
  });

  it("treats absent as free, and is case/whitespace insensitive", () => {
    expect(profileThemeRequiresPremium(null)).toBe(false);
    expect(profileThemeRequiresPremium(undefined)).toBe(false);
    expect(profileThemeRequiresPremium("")).toBe(false);
    expect(profileThemeRequiresPremium("  MIDNIGHT ")).toBe(false);
    expect(profileThemeRequiresPremium(" Royal ")).toBe(true);
  });
});
