// OWN1 — static contract tests over the staged migrations, staged Edge
// Functions and the production frontend sources. (Runtime DB behaviour is
// covered by supabase/own1-staged/verification/own1_verify.sql once applied.)
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(p, "utf8");
const STAGE = "supabase/own1-staged";
const A = read(`${STAGE}/migrations/01_own1_a_owner_core.sql`);
const B = read(`${STAGE}/migrations/02_own1_b_owner_cutover.sql`);
const C = read(`${STAGE}/migrations/03_own1_c_display_name_enforcement.sql`);
const D = read(`${STAGE}/migrations/04_own1_d_client_privilege_hardening.sql`);
const ALL_SQL = [A, B, C, D].join("\n");
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const strip = (s: string) => s.replace(/--[^\n]*/g, "");

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

describe("canonical owner identity", () => {
  it("is never seeded in committed SQL (no UUIDs, no emails, no INSERT into owner_config)", () => {
    expect(strip(ALL_SQL)).not.toMatch(UUID);
    expect(ALL_SQL).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
    expect(ALL_SQL).not.toMatch(/INSERT\s+INTO\s+private\.owner_config/i);
  });
  it("lives in a private schema clients cannot read", () => {
    expect(A).toMatch(/REVOKE ALL ON private\.owner_config FROM PUBLIC, anon, authenticated/);
    expect(A).toMatch(/REVOKE ALL ON SCHEMA private FROM anon, authenticated/);
  });
  it("cutover preflight aborts without exactly one live owner with verified MFA", () => {
    expect(B).toMatch(/owner_config must hold exactly one row/);
    expect(B).toMatch(/auth\.mfa_factors[\s\S]*status = 'verified'/);
  });
});

describe("authorization consolidation", () => {
  it("has_role/is_master_admin resolve privileged roles only for the configured owner", () => {
    const hasRole = B.slice(B.indexOf("FUNCTION public.has_role"), B.indexOf("FUNCTION public.is_master_admin"));
    expect(hasRole).toMatch(/WHEN _role::text IN \('admin', 'master_admin', 'moderator'\) THEN\s+public\.is_owner_user\(_user_id\)/);
    // the privileged branch must not consult user_roles
    const privBranch = hasRole.slice(hasRole.indexOf("WHEN"), hasRole.indexOf("ELSE"));
    expect(privBranch).not.toMatch(/user_roles/);
    expect(B).toMatch(/FUNCTION public\.is_master_admin[\s\S]*?is_owner_user\(_user_id\)/);
  });
  it("removes role mutation authority from clients", () => {
    expect(B).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.user_roles FROM anon, authenticated/);
    for (const p of ["delete", "insert", "update"]) expect(B).toContain(`DROP POLICY IF EXISTS "Admins can ${p} roles"`);
  });
  it("sensitive RPCs get a fresh-aal2 guard", () => {
    expect(B).toMatch(/assert_owner\(''fresh_aal2''\)/);
    for (const f of ["admin_set_pro_grant", "admin_create_bot_profile", "admin_update_bot_profile", "admin_link_friendship"]) expect(B).toContain(`'${f}'`);
  });
});

describe("trusted devices", () => {
  it("stores only SHA-256 hashes and returns the plaintext once", () => {
    expect(A).toMatch(/token_hash\s+bytea NOT NULL UNIQUE/);
    expect(A).toMatch(/extensions\.digest\(_token, 'sha256'\)/);
    expect(A).not.toMatch(/token\s+text\s+NOT NULL/i);
  });
  it("enrollment requires fresh aal2; attestation is session-bound, short-lived, revocable, expiring", () => {
    expect(A).toMatch(/owner_device_enroll[\s\S]*?assert_owner\('fresh_aal2'\)/);
    expect(A).toMatch(/session_id\s+uuid PRIMARY KEY/);
    expect(A).toMatch(/interval '15 minutes'/);
    expect(A).toMatch(/d\.revoked_at IS NULL[\s\S]*?d\.expires_at > now\(\)/);
    expect(A).toMatch(/a\.session_id = private\.jwt_session_id\(\)/);
  });
  it("a trusted device never satisfies fresh_aal2", () => {
    const fresh = A.slice(A.indexOf("FUNCTION public.is_owner_fresh_aal2"), A.indexOf("FUNCTION public.is_owner()"));
    expect(strip(fresh)).not.toMatch(/attestation/);
  });
  it("browser stores an opaque token in IndexedDB, not a localStorage flag", () => {
    const src = read("src/lib/admin-auth/ownerDevice.ts");
    expect(src).toContain("indexedDB");
    expect(src.replace(/\/\/[^\n]*/g, "")).not.toMatch(/localStorage/);
  });
});

describe("reserved display names", () => {
  it("are enforced by a trigger on direct client writes, owner-only for bots", () => {
    expect(C).toMatch(/BEFORE INSERT OR UPDATE OF display_name ON public\.profiles/);
    expect(C).toMatch(/display_name_problem\(NEW\.display_name\)/);
    expect(C).toMatch(/is_owner\(\) AND current_setting\('own1\.owner_write', true\) = 'on'/);
  });
});

describe("client privilege hardening", () => {
  it("revokes TRUNCATE/REFERENCES/TRIGGER from client roles, now and by default, and asserts it", () => {
    expect(D).toMatch(/REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public\.%I FROM anon, authenticated/);
    expect(D).toMatch(/ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated/);
    expect(D).toMatch(/RAISE EXCEPTION 'OWN1-D/);
    expect(D).not.toMatch(/REVOKE (SELECT|INSERT|UPDATE|DELETE)/);
  });
});

describe("staged Edge Functions", () => {
  const F = `${STAGE}/functions`;
  const actions = read(`${F}/admin-user-actions/index.ts`);
  const emails = read(`${F}/admin-get-emails/index.ts`);
  const purge = read(`${F}/purge-anonymous-users/index.ts`);
  it("never consult user_roles", () => {
    for (const s of [actions, emails, purge]) expect(s).not.toMatch(/user_roles/);
  });
  it("admin-user-actions never generates or returns action links and audits every action", () => {
    expect(actions).not.toMatch(/generateLink/);
    expect(actions).not.toMatch(/action_link/);
    expect(actions).toMatch(/resetPasswordForEmail/);
    expect(actions).toMatch(/sanitizeAdminActionBody/);
    expect(actions).toMatch(/auditOwnerAction/);
  });
  it("purge requires owner + fresh aal2 and keeps the service-role continuation", () => {
    expect(purge).toMatch(/requireOwner\(req, "fresh_aal2"\)/);
    expect(purge).toMatch(/isInternalContinuation = token === serviceRoleKey/);
  });
  it("admin-get-emails is owner-only", () => {
    expect(emails).toMatch(/requireOwner\(req, "trusted"\)/);
  });
  it("owner gate trusts only Authorization", () => {
    const g = read(`${F}/_shared/owner.ts`);
    expect(g).not.toMatch(/x-admin-key/i);
  });
});

describe("production frontend", () => {
  const files = walk("src");
  it("has no X-Admin-Key sender outside the DEV-guarded staff duel prototype", () => {
    const offenders = files.filter((f) => {
      const s = read(f);
      if (!/X-Admin-Key/.test(s)) return false;
      if (f.endsWith("staff-duel/rankedDuelClient.ts")) return !/adminKey && import\.meta\.env\.DEV/.test(s);
      // comments/descriptions only are fine; any header assignment is not
      return /headers?\[["']X-Admin-Key["']\]\s*=|["']X-Admin-Key["']\s*:/.test(s);
    });
    expect(offenders).toEqual([]);
  });
  it("the knowledge-admin key store is gone", () => {
    expect(existsSync("src/lib/knowledge-admin/key.ts")).toBe(false);
    expect(files.filter((f) => /knowledge-admin\/key/.test(read(f)))).toEqual([]);
  });
  it("AdminRoute has no roles prop and uses the owner check", () => {
    const r = read("src/components/AdminRoute.tsx");
    expect(r).not.toMatch(/roles\??:/);
    expect(r).toMatch(/useOwnerAuth/);
    expect(read("src/App.tsx")).not.toMatch(/<AdminRoute roles=/);
  });
  it("E2E identity is only honoured behind import.meta.env.DEV", () => {
    expect(read("src/hooks/useOwnerAuth.ts")).toMatch(/if \(import\.meta\.env\.DEV\) \{\s+const e2e = getE2EIdentity\(\)/);
    expect(read("src/lib/e2e/identity.ts")).toMatch(/import\.meta\.env\.DEV === true && import\.meta\.env\.VITE_E2E_AUTH === "1"/);
  });
  it("useAdminRoles is a shim over the owner check (no user_roles read)", () => {
    const s = read("src/hooks/useAdminRoles.ts").replace(/\/\/[^\n]*/g, "");
    expect(s).not.toMatch(/user_roles/);
    expect(s).toMatch(/useAdminAuthority/);
  });
});
