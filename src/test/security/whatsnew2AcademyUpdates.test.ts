import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Static verification of the Academy Updates data boundary (WHATSNEW2).
 *
 * The product promise is narrow and worth pinning: an ordinary visitor may read
 * PUBLISHED announcements and nothing else. Not drafts — not their titles, not
 * their bodies, not their existence — and no writes of any kind, to the notices
 * or to the switch that governs them.
 *
 * That promise is kept by Postgres, not by the client. `listPublishedUpdates`
 * adds `.eq("published", true)`, but that is a narrowing of a permission the
 * caller already lacks; delete the line and a visitor still sees only published
 * rows. These tests pin the policies that make that true, so the guarantee
 * cannot be widened back by accident.
 *
 * This is a CONTRACT test over the migration and the client source, not a live
 * database test: there is no local Postgres in this environment (no Docker, no
 * Supabase CLI). Executing these policies against a real database with a real
 * anonymous session and a real admin session is the outstanding verification
 * step, and it belongs to whoever applies the migration.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const SRC_DIR = join(process.cwd(), "src");

const migrationFiles = () =>
  readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

/** Every migration that mentions the table, newest last. */
function sqlTouchingTable(): string {
  return migrationFiles()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .filter((sql) => /academy_updates/i.test(sql))
    .join("\n");
}

/** Policy bodies for one command on public.academy_updates, in migration order.
 *  The last one is what the database ends up with. */
function policies(command: string): string[] {
  const sql = sqlTouchingTable();
  const re = new RegExp(
    `CREATE POLICY\\s+"[^"]+"\\s+ON\\s+public\\.academy_updates\\s+FOR\\s+${command}([\\s\\S]*?);`,
    "gi",
  );
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) found.push(m[1]);
  return found;
}

describe("the academy_updates table", () => {
  const sql = sqlTouchingTable();

  it("is created exactly once, by a migration", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.academy_updates/i);
  });

  it("has row-level security switched on", () => {
    // Without this line every policy below is decoration: RLS off means the
    // table is world-readable and world-writable to anyone holding the anon key.
    expect(sql).toMatch(/ALTER TABLE public\.academy_updates ENABLE ROW LEVEL SECURITY/i);
  });

  it("defaults a new row to unpublished", () => {
    // Creation and publication must be two separate acts. A default of true
    // would put a blank notice in front of every visitor on the create click.
    expect(sql).toMatch(/published\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i);
  });

  it("generates its own ids and never asks the client for one", () => {
    // The id is the seen-state key. A client-supplied id could be reused, and a
    // reused id makes an old notice look already-read to everyone.
    expect(sql).toMatch(/id\s+uuid\s+PRIMARY KEY\s+DEFAULT\s+gen_random_uuid\(\)/i);
  });
});

describe("what an ordinary visitor may read", () => {
  it("has exactly one public SELECT policy, and it is published-rows-only", () => {
    const publicSelects = policies("SELECT").filter((p) => !/has_role/i.test(p));
    expect(publicSelects).toHaveLength(1);
    expect(publicSelects[0]).toMatch(/USING\s*\(\s*published\s*=\s*true\s*\)/i);
  });

  it("never widens the public read with an OR", () => {
    // The failure this guards: a later edit adding `OR auth.uid() IS NOT NULL`,
    // which on this project — where anonymous sign-in is enabled and an
    // anonymous session carries the `authenticated` role — would publish every
    // draft to every visitor.
    const publicSelects = policies("SELECT").filter((p) => !/has_role/i.test(p));
    for (const body of publicSelects) expect(body).not.toMatch(/\bOR\b/i);
  });

  it("grants a visitor no write of any kind", () => {
    for (const command of ["INSERT", "UPDATE", "DELETE", "ALL"]) {
      for (const body of policies(command)) {
        // Every write policy must be gated on the admin predicate. A policy
        // that never mentions has_role is open to whoever can reach the table.
        expect(body, `${command} policy is not admin-gated`).toMatch(/has_role/i);
      }
    }
  });
});

describe("what an admin may do", () => {
  it("can read drafts, through a policy of its own", () => {
    const adminSelects = policies("SELECT").filter((p) => /has_role/i.test(p));
    expect(adminSelects).toHaveLength(1);
    expect(adminSelects[0]).toMatch(/has_role\(auth\.uid\(\),\s*'admin'::app_role\)/i);
  });

  it("can create, edit, publish and delete, under one FOR ALL policy", () => {
    const all = policies("ALL");
    expect(all).toHaveLength(1);
    // Both halves: USING governs which rows may be touched, WITH CHECK governs
    // what may be written. A FOR ALL policy missing WITH CHECK lets a
    // non-admin's INSERT through.
    expect(all[0]).toMatch(/USING\s*\(\s*public\.has_role\(auth\.uid\(\),\s*'admin'::app_role\)\s*\)/i);
    expect(all[0]).toMatch(
      /WITH CHECK\s*\(\s*public\.has_role\(auth\.uid\(\),\s*'admin'::app_role\)\s*\)/i,
    );
  });

  it("scopes both admin policies TO authenticated, or anon reads break entirely", () => {
    // REGRESSION PIN, found only by testing the live database.
    //
    // EXECUTE on public.has_role is granted to `authenticated` but NOT to
    // `anon`. An admin policy left at the default TO PUBLIC therefore lands in
    // the anon role's policy set, and an anonymous visitor's read of PUBLISHED
    // rows fails with 42501 "permission denied for function has_role" -- the
    // public surface breaks on a policy that was only ever meant for admins.
    //
    // This is what public.blog_posts does live (its policies are TO
    // authenticated, though its own migration file does not say so), which is
    // why the shape could not be copied from source and had to be measured.
    const sql = sqlTouchingTable();
    for (const name of [
      "Admins can read all academy updates",
      "Admins can manage academy updates",
    ]) {
      const re = new RegExp(
        `CREATE POLICY\\s+"${name}"\\s+ON\\s+public\\.academy_updates[\\s\\S]*?;`,
        "i",
      );
      const body = re.exec(sql)?.[0] ?? "";
      expect(body, `${name} is missing TO authenticated`).toMatch(/\bTO\s+authenticated\b/i);
    }
  });

  it("leaves the public read policy unscoped, so a signed-out visitor still qualifies", () => {
    // The mirror of the rule above: this policy must serve BOTH anon and
    // authenticated, so it must NOT be narrowed to one of them.
    const re =
      /CREATE POLICY\s+"Published academy updates are publicly readable"\s+ON\s+public\.academy_updates[\s\S]*?;/i;
    const body = re.exec(sqlTouchingTable())?.[0] ?? "";
    expect(body).not.toMatch(/\bTO\s+authenticated\b/i);
  });

  it("uses has_role rather than is_master_admin, so both admin roles qualify", () => {
    // has_role() returns true for master_admin as well (migration
    // 20260223120918), so this one predicate covers both and the owner cannot
    // be locked out of their own announcements by holding the wrong role.
    expect(sqlTouchingTable()).not.toMatch(/is_master_admin/i);
  });
});

describe("the master switch", () => {
  const sql = sqlTouchingTable();

  it("is a row in the existing app_settings store, not a new table", () => {
    // Mogzy has exactly one global settings store. A second one would fragment
    // authorization, which is the failure the platform-policy work removed.
    expect(sql).toMatch(/INSERT INTO public\.app_settings[\s\S]*academy_updates_enabled/i);
    expect(sql).not.toMatch(/CREATE TABLE[^;]*(feature_flags|site_settings|academy_settings)/i);
  });

  it("is seeded OFF, and a re-run never overwrites the owner's choice", () => {
    expect(sql).toMatch(/'academy_updates_enabled',\s*'\{"enabled":\s*false\}'/i);
    expect(sql).toMatch(/ON CONFLICT \(key\) DO NOTHING/i);
  });

  it("seeds no announcements at all", () => {
    // WHATSNEW1's two entries were labelled in their own source as examples,
    // not production copy. Inserting them even as drafts would put throwaway
    // text one click from being published.
    expect(sql).not.toMatch(/INSERT INTO public\.academy_updates/i);
  });
});

describe("the frontend holds no second authority", () => {
  const contract = readFileSync(join(SRC_DIR, "lib/lol/academy-updates.ts"), "utf8");

  it("exports no update list and no enabled constant", () => {
    // Two production authorities is precisely the failure WHATSNEW2 removes: an
    // owner editing an array here while the database said otherwise would have
    // no way to tell which one visitors were reading.
    expect(contract).not.toMatch(/export const ACADEMY_UPDATES\s*[:=]/);
    expect(contract).not.toMatch(/export const ACADEMY_UPDATES_ENABLED/);
  });

  it("keeps the contract pure — no Supabase, no React", () => {
    expect(contract).not.toMatch(/from "@\/integrations\/supabase/);
    expect(contract).not.toMatch(/from "react"/);
  });

  it("uses no service-role key anywhere in the feature", () => {
    for (const file of [
      "lib/lol/academy-updates.ts",
      "lib/lol/academy-updates-store.ts",
      "components/lol/AcademyUpdates.tsx",
      "pages/admin/AdminAcademyUpdates.tsx",
    ]) {
      const source = readFileSync(join(SRC_DIR, file), "utf8");
      expect(source, file).not.toMatch(/service_role|SERVICE_ROLE|serviceRole/);
    }
  });

  it("routes every database call through the one store module", () => {
    // Keeping the boundary in one file is what makes the query shape, the
    // ordering rule and the fail-closed behaviour reviewable in one place.
    for (const file of ["components/lol/AcademyUpdates.tsx", "pages/admin/AdminAcademyUpdates.tsx"]) {
      const source = readFileSync(join(SRC_DIR, file), "utf8");
      expect(source, file).not.toMatch(/from "@\/integrations\/supabase\/client"/);
    }
  });
});
