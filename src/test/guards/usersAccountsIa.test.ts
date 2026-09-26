import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Users Accounts information architecture", () => {
  const pagePath = resolve(__dirname, "../../pages/admin/areas/AdminUsersPage.tsx");
  const source = readFileSync(pagePath, "utf8");
  const accountsSource = readFileSync(
    resolve(__dirname, "../../components/admin/AdminUsers.tsx"),
    "utf8",
  );

  it("has no retired Accounts subtabs", () => {
    expect(source).not.toContain('testId="users-accounts-subtabs"');
    for (const label of ["Profile browser", "Roles & access", "Identities"]) {
      expect(source).not.toContain(`label: "${label}"`);
    }
  });

  it("renders AdminUsers as the one account directory and keeps invite links as an action", () => {
    expect(source.match(/<AdminUsers\b/g)).toHaveLength(1);
    expect(source).toContain('data-testid="users-invite-links-action"');
  });

  it("does not drop bot profiles from the canonical source", () => {
    expect(accountsSource).not.toMatch(/\.filter\s*\(\s*\([^)]*\)\s*=>\s*[^\n]*is_bot\s*===\s*false/);
    expect(accountsSource).toContain('case "bots"');
    expect(accountsSource).toContain(">BOT<");
  });

  it("does not retain the retired directory components", () => {
    expect(existsSync(resolve(__dirname, "../../components/admin/AdminProfileDirectory.tsx"))).toBe(false);
    expect(existsSync(resolve(__dirname, "../../pages/admin/AdminUserDirectory.tsx"))).toBe(false);
  });
});
