import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Static verification of the admin_notifications write boundary.
 *
 * Anonymous sign-in is enabled on this project and an anonymous session carries
 * the `authenticated` role, so the old policy —
 *
 *   WITH CHECK (auth.uid() IS NOT NULL AND type = ANY (ARRAY[...five types...]))
 *
 * — let any visitor post arbitrary rows into the moderation queue. These tests
 * pin the narrowed boundary so it cannot be widened back by accident.
 *
 * This is a contract test over the migrations and client source, NOT a live
 * database test: there is no local Postgres in this environment (no Docker, no
 * Supabase CLI). Executing the policy against a real database against two real
 * sessions remains the outstanding verification gap for this phase.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const SRC_DIR = join(process.cwd(), "src");

const migrationFiles = () =>
  readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();

const readMigration = (f: string) => readFileSync(join(MIGRATIONS_DIR, f), "utf8");

/** Every `CREATE POLICY ... ON public.admin_notifications FOR INSERT ...` body,
 *  in migration order. The last one is what the database ends up with. */
function insertPolicies(): { file: string; body: string }[] {
  const found: { file: string; body: string }[] = [];
  for (const file of migrationFiles()) {
    const sql = readMigration(file);
    const re =
      /CREATE POLICY\s+"[^"]+"\s+ON\s+public\.admin_notifications\s+FOR\s+INSERT([\s\S]*?);/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) found.push({ file, body: m[1] });
  }
  return found;
}

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkSourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("admin_notifications INSERT policy", () => {
  it("is defined, and the effective one is the hardened policy", () => {
    const policies = insertPolicies();
    expect(policies.length).toBeGreaterThan(0);
    const effective = policies[policies.length - 1];
    expect(effective.file).toBe("20260802120000_admin_notification_insert_hardening.sql");
  });

  it("requires a privileged role rather than merely being signed in", () => {
    const effective = insertPolicies().pop()!;
    expect(effective.body).toMatch(/has_role\(\s*auth\.uid\(\)/);
    // The blanket "any session with a uid" check is exactly what let anonymous
    // visitors write. It must not be the gate.
    expect(effective.body).not.toMatch(/auth\.uid\(\)\s+IS\s+NOT\s+NULL/i);
  });

  it("pins the write to the single workflow that needs it", () => {
    const effective = insertPolicies().pop()!;
    expect(effective.body).toMatch(/type\s*=\s*'mod_delete_request'/);
    // None of the trigger-owned types may be client-writable any more.
    for (const t of ["image_report", "comment_report", "user_report", "feedback"]) {
      expect(effective.body).not.toContain(`'${t}'`);
    }
  });
});

describe("trigger-owned notification paths still work", () => {
  const triggerFns = [
    "check_and_auto_hide_image",
    "check_and_auto_hide_comment",
    "notify_admins_on_feedback",
    "notify_admins_on_user_report",
  ];

  it("keeps every admin-notification producer SECURITY DEFINER", () => {
    for (const fn of triggerFns) {
      const defining = migrationFiles()
        .map(readMigration)
        .filter(sql => new RegExp(`FUNCTION\\s+public\\.${fn}\\s*\\(`).test(sql));
      expect(defining.length, `${fn} should be defined by a migration`).toBeGreaterThan(0);
      const latest = defining[defining.length - 1];
      const body = latest.slice(latest.indexOf(`public.${fn}`));
      expect(body, `${fn} must stay SECURITY DEFINER`).toMatch(/SECURITY DEFINER/);
    }
  });

  it("never forces RLS on admin_notifications, which would break the definer bypass", () => {
    // SECURITY DEFINER functions run as the table owner, and an owner bypasses
    // RLS only while FORCE ROW LEVEL SECURITY is off. Turning it on would
    // silently stop every report and feedback notification.
    for (const file of migrationFiles()) {
      expect(readMigration(file)).not.toMatch(
        /ALTER\s+TABLE\s+public\.admin_notifications\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i,
      );
    }
  });

  it("emits the per-report image notification from the trigger, not the client", () => {
    const sql = readMigration("20260802120000_admin_notification_insert_hardening.sql");
    const fnBody = sql.slice(sql.indexOf("check_and_auto_hide_image"));
    expect(fnBody).toContain("'image_report'");
    expect(fnBody).toContain("'image_report_critical'");
  });
});

describe("client write surface", () => {
  it("has exactly one direct admin_notifications insert, the moderator delete request", () => {
    const offenders = walkSourceFiles(SRC_DIR).filter(file => {
      const src = readFileSync(file, "utf8");
      return /from\(["']admin_notifications["']\)\s*\.\s*insert/.test(src.replace(/\s+/g, " "));
    });
    expect(offenders.map(f => f.replace(SRC_DIR, "src"))).toEqual(["src/pages/AdminPlay.tsx"]);
  });

  it("that one insert only ever raises a mod_delete_request", () => {
    const src = readFileSync(join(SRC_DIR, "pages", "AdminPlay.tsx"), "utf8");
    const at = src.indexOf('from("admin_notifications")');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 400)).toContain('type: "mod_delete_request"');
  });
});
