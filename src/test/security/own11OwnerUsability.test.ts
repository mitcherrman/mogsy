// OWN1.1 — static contracts for "old Admin usability on the OWN1 owner model".
// Runtime behaviour lives in the admin-auth unit tests; these pin the source
// shape so a later edit cannot quietly reintroduce a legacy authority path.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("Railway session contract", () => {
  it("accepts exactly supabase_owner (never admin_key or the pre-OWN1 supabase_user)", () => {
    expect(code("src/lib/admin-auth/types.ts")).toMatch(/export type AdminAuthMethod = "supabase_owner";/);
    const client = code("src/lib/admin-auth/adminSessionClient.ts");
    expect(client).toMatch(/VALID_METHODS: readonly AdminAuthMethod\[\] = \["supabase_owner"\]/);
    expect(client).not.toMatch(/supabase_user|admin_key/);
  });
});

describe("owner-facing UI no longer reads retired role rows", () => {
  const FIXED = [
    "src/components/hud/MogzyIdentityMenu.tsx",
    "src/pages/admin/AdminBlog.tsx",
    "src/pages/blog/BlogPost.tsx",
    "src/pages/Profile.tsx",
    "src/components/combat-lab/ChampionProfile.tsx",
    "src/components/combat-lab/ChampionVisual.tsx",
    "src/components/lol/LolPopoutStyleToggle.tsx",
  ];
  it.each(FIXED)("%s gates on the owner session, not user_roles / has_role", (p) => {
    const s = code(p);
    expect(s).not.toMatch(/from\("user_roles"\)/);
    expect(s).not.toMatch(/rpc\("has_role"/);
    expect(s).toMatch(/useOwnerAuth|useAdminAuthority/);
  });

  it("AdminUsers offers no admin/moderator grant (privilege is never granted from the UI)", () => {
    const s = code("src/components/admin/AdminUsers.tsx");
    expect(s).not.toMatch(/Grant Admin|Grant Moderator|toggleAdminRole|toggleModeratorRole/);
    expect(s).not.toMatch(/insert\(\{ user_id: userId, role: "(admin|moderator|master_admin)"/);
  });

  it("the Admin entry is the owner session, so it survives Railway rechecks", () => {
    const s = code("src/components/hud/MogzyIdentityMenu.tsx");
    expect(s).toMatch(/const showAdminEntry = owner\.isOwner;/);
    expect(s).not.toMatch(/useAdminAuth\(/);
  });
});

describe("sensitive actions keep fresh MFA; routine ones do not demand it", () => {
  const users = code("src/components/admin/AdminUsers.tsx");
  it("Premium grants, account actions and the anonymous purge run at level fresh", () => {
    expect(users).toMatch(/level: "fresh", reason: kind === null \? "Revoking a Premium grant" : "Granting Premium"/);
    expect(users).toMatch(/level: "fresh", reason: ACCOUNT_ACTION_REASONS\[action\]/);
    expect(users).toMatch(/level: "fresh", reason: "Purging anonymous users"/);
  });
  it("irreversible actions are never marked idempotent (no automatic replay)", () => {
    for (const m of users.matchAll(/level: "fresh"[^}]*\}/g)) expect(m[0]).not.toMatch(/idempotent/);
  });
  it("Edge Function levels are unchanged by OWN1.1", () => {
    const d = read("supabase/functions/_shared/owner-decision.ts");
    expect(d).toMatch(/get_auth_info: "trusted"/);
    for (const a of ["send_password_reset", "resend_verification", "confirm_email", "ban_user", "unban_user"]) {
      expect(d).toMatch(new RegExp(`${a}: "fresh_aal2"`));
    }
    expect(read("supabase/functions/purge-anonymous-users/index.ts")).toMatch(/requireOwner\(req, "fresh_aal2"\)/);
    expect(read("supabase/functions/admin-get-emails/index.ts")).toMatch(/requireOwner\(req, "trusted"\)/);
  });
});

describe("staged OWN1.1 SQL (05) is scoped", () => {
  const sql = read("supabase/own1-staged/migrations/05_own11_routine_owner_rpcs.sql");
  const body = sql.replace(/--[^\n]*/g, "");
  it("rewrites only the three routine RPCs' OWN1 guard line", () => {
    expect(body).toMatch(/ARRAY\['admin_create_bot_profile', 'admin_update_bot_profile', 'admin_link_friendship'\]/);
    expect(body).not.toMatch(/owner_device_|has_role|is_master_admin|user_roles|owner_config/);
  });
  it("keeps fresh MFA for a friendship with a real person, and asserts the Pro grant keeps it", () => {
    expect(sql).toMatch(/THEN ''trusted'' ELSE ''fresh_aal2'' END/);
    expect(body).toMatch(/admin_set_pro_grant lost its fresh_aal2 guard/);
  });
  it("keeps the -- OWN1 marker so both rollbacks still find the line, and seeds no identity", () => {
    expect(sql).toMatch(/-- OWN1 \(OWN1\.1: routine, reversible\)/);
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(read("supabase/own1-staged/rollback/own11_rollback.sql")).toMatch(/assert_owner\(''fresh_aal2''\); -- OWN1/);
  });
  it("is staged, not in the auto-applied migrations folder", () => {
    expect(() => read("supabase/migrations/05_own11_routine_owner_rpcs.sql")).toThrow();
  });
});
