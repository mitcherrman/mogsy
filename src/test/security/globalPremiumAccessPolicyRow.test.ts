/**
 * PT2B — authorization for the Global Premium Access policy row.
 *
 * The row is operable from an ABSENT state: the admin panel upserts, so first
 * activation CREATES it. That is only safe because creating a row and changing
 * one are guarded by the same check — `app_settings` has carried an admin-only
 * INSERT policy alongside its admin-only UPDATE policy since the table was
 * created. This suite fails if any migration ever loosens either verb, or if
 * a later migration adds a permissive write policy on that table.
 *
 * These are assertions about the SQL that ships, not about a live database.
 * The runtime behaviour they pair with is proved in
 * AdminPlatformPolicies.test.tsx (§ first activation with no stored row).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = resolve(__dirname, "../../../supabase/migrations");
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
const sql = files.map((f) => ({ f, body: readFileSync(join(MIGRATIONS, f), "utf8") }));

/** Strip `--` comments so prose about a policy is never mistaken for one. */
const code = (body: string) => body.replace(/--[^\n]*/g, "");

describe("app_settings write authorization", () => {
  it("restricts INSERT to admins, which is what makes first activation safe", () => {
    const creating = sql.find((s) => /CREATE TABLE public\.app_settings/.test(s.body))!;
    expect(creating).toBeTruthy();
    expect(code(creating.body)).toMatch(
      /FOR INSERT WITH CHECK \(has_role\(auth\.uid\(\), 'admin'::app_role\)\)/,
    );
  });

  it("restricts UPDATE to admins", () => {
    const creating = sql.find((s) => /CREATE TABLE public\.app_settings/.test(s.body))!;
    expect(code(creating.body)).toMatch(
      /FOR UPDATE USING \(has_role\(auth\.uid\(\), 'admin'::app_role\)\)/,
    );
  });

  it("keeps RLS enabled on the table", () => {
    const creating = sql.find((s) => /CREATE TABLE public\.app_settings/.test(s.body))!;
    expect(code(creating.body)).toContain("ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY");
    // And nothing later turns it back off.
    for (const { f, body } of sql) {
      expect(code(body), f).not.toMatch(/app_settings\s+DISABLE ROW LEVEL SECURITY/i);
    }
  });

  it("no migration ever grants a non-admin a write policy on app_settings", () => {
    for (const { f, body } of sql) {
      const stripped = code(body);
      // Any CREATE POLICY ... ON public.app_settings FOR INSERT/UPDATE/DELETE/ALL
      // must name the admin role check. A policy without it would be the bypass.
      const policies = stripped.match(
        /CREATE POLICY[\s\S]*?ON public\.app_settings[\s\S]*?(?=;)/g,
      ) ?? [];
      for (const policy of policies) {
        if (/FOR SELECT/i.test(policy)) continue; // reads are public by design
        expect(policy, `${f}: ${policy.slice(0, 120)}`).toMatch(/has_role\(auth\.uid\(\), 'admin'/);
      }
    }
  });
});

describe("the Global Premium Access seed", () => {
  const seed = sql.find((s) => s.f.includes("global_premium_access"))!;

  it("ships as a seed only — it creates no table, policy, column or function", () => {
    expect(seed).toBeTruthy();
    const stripped = code(seed.body);
    expect(stripped).not.toMatch(/CREATE TABLE/i);
    expect(stripped).not.toMatch(/CREATE POLICY/i);
    expect(stripped).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/i);
    expect(stripped).not.toMatch(/ALTER TABLE/i);
    expect(stripped).not.toMatch(/GRANT |REVOKE /i);
  });

  it("seeds OFF, and never overwrites a value an admin already set", () => {
    const stripped = code(seed.body);
    expect(stripped).toMatch(/'global_premium_access',\s*'\{"enabled": false\}'::jsonb/);
    expect(stripped).toMatch(/ON CONFLICT \(key\) DO NOTHING/);
  });

  it("touches no entitlement, profile or billing object", () => {
    const stripped = code(seed.body);
    for (const forbidden of ["profiles", "is_pro", "pro_grant", "stripe", "subscription"]) {
      expect(stripped.toLowerCase(), forbidden).not.toContain(forbidden);
    }
  });
});
