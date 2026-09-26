import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = (name: string) =>
  readFileSync(resolve(__dirname, "../../pages", name), "utf8");

describe("NAV1-B isolated temporal Back call sites", () => {
  it.each([
    ["Profile.tsx", 1],
    ["UserProfile.tsx", 2],
    ["SecretRoom.tsx", 1],
  ] as const)("moves every audited raw Back in %s to the shared /lol fallback", (file, controls) => {
    const source = page(file);
    expect(source).toContain('useSafeTemporalBack("/lol")');
    expect(source).not.toMatch(/navigate\(\s*-1\s*\)/);
    expect(source.match(/onClick=\{goBack\}/g)).toHaveLength(controls);
  });

  it("makes Settings temporal with a direct-entry Home fallback", () => {
    const source = page("Settings.tsx");
    expect(source).toContain('useSafeTemporalBack("/lol")');
    expect(source).toContain('aria-label="Go back" onClick={goBack}');
    expect(source).not.toContain('navigate("/home")');
  });

  it("returns a successful direct password reset to registered product Home", () => {
    const source = page("ResetPassword.tsx");
    expect(source).toContain('safeReturnPath(searchParams.get("returnTo"), LEAGUE_HOME_ROUTE)');
    expect(source).toContain('navigate(resetReturnTo, { replace: true })');
    expect(source).not.toContain('safeReturnPath(searchParams.get("returnTo"), "/home")');
    // An invalid/expired reset remains a structural return to the auth flow.
    expect(source).toContain('navigate("/auth")');
  });
});

describe("NAV1-C Premium contextual return", () => {
  it("uses bounded temporal Back with the League hub as its direct-entry fallback", () => {
    const source = page("LolPremium.tsx");
    expect(source).toContain('useSafeTemporalBack("/lol")');
    expect(source).toContain('aria-label="Go back" onClick={goBack}');
    expect(source).not.toContain('aria-label="Back to LoL hub"');
    expect(source).not.toMatch(/<Link to="\/lol"><ArrowLeft/);
  });
});

