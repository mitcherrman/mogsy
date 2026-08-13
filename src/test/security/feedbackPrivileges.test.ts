import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { FEEDBACK_ADMIN_ONLY_FIELDS } from "@/lib/feedback/contract";

/**
 * FB1 Phase 3 — the privilege boundary on public.feedback.
 *
 * RLS limits a session to its own ROWS and always did. What was missing was any
 * boundary on which COLUMNS of those rows a client may name: ALTER DEFAULT
 * PRIVILEGES grants table-level SELECT to anon and authenticated, and the
 * column-level REVOKE in 20260522053651 that was supposed to hide admin_notes
 * cannot subtract from a table-level grant, so it does nothing.
 *
 * 20260812140000 closes that by revoking table SELECT and granting back only
 * `id`. These tests pin the resulting shape — both that the revoke is present
 * and, just as importantly, that the narrow grants still cover every shipped
 * operation. A too-tight grant is as much a bug as a too-loose one.
 *
 * Static contract tests over the SQL. Supabase is managed through Lovable
 * Cloud, so there is no local stack to execute against; the privilege
 * assertions that must be executed live are listed at the foot of this file
 * and in docs/fb1-feedback-rollout.md.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const SRC_DIR = join(process.cwd(), "src");

const HARDENING = "20260812140000_fb1_feedback_privilege_hardening.sql";
const FOUNDATION = "20260812120000_fb1_feedback_foundation.sql";
const STORAGE = "20260812130000_fb1_feedback_evidence_storage.sql";

const readMigration = (f: string) => readFileSync(join(MIGRATIONS_DIR, f), "utf8");

/** Strip `--` comments so the explanatory header never satisfies an assertion. */
const sql = (f: string) =>
  readMigration(f)
    .split("\n")
    .map(line => line.replace(/--.*$/, ""))
    .join("\n");

const hardening = () => sql(HARDENING);

describe("ordering", () => {
  it("is the last FB1 migration, after foundation and storage", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();
    expect(files.slice(-3)).toEqual([FOUNDATION, STORAGE, HARDENING]);
  });

  it("refuses to run before the safe read path exists", () => {
    // Revoking direct reads before list_my_feedback() exists would leave users
    // with no read path at all.
    expect(hardening()).toMatch(/to_regprocedure\('public\.list_my_feedback\(\)'\) IS NULL/);
    expect(hardening()).toMatch(/RAISE EXCEPTION/);
  });

  it("is flagged as apply-last, since it breaks the frontend in production today", () => {
    const raw = readMigration(HARDENING);
    expect(raw).toMatch(/APPLY LAST/);
    expect(raw).toMatch(/docs\/fb1-feedback-rollout\.md/);
  });
});

describe("direct table reads are closed", () => {
  it("revokes table-level SELECT from authenticated", () => {
    expect(hardening()).toMatch(/REVOKE SELECT ON public\.feedback FROM authenticated;/);
  });

  it("revokes everything from anon", () => {
    expect(hardening()).toMatch(/REVOKE ALL ON public\.feedback FROM anon;/);
  });

  it("grants back the primary key and nothing else", () => {
    const grants = [...hardening().matchAll(/GRANT SELECT \(([^)]*)\) ON public\.feedback TO ([^;]+);/g)];
    expect(grants).toHaveLength(1);
    expect(grants[0][1].trim()).toBe("id");
    expect(grants[0][2].trim()).toBe("authenticated");
  });

  it("leaves no readable column that could carry report content", () => {
    const granted = hardening().match(/GRANT SELECT \(([^)]*)\)/)![1];
    for (const column of [
      ...FEEDBACK_ADMIN_ONLY_FIELDS,
      "title",
      "body",
      "status",
      "priority",
      "profile_id",
      "legacy_category",
    ]) {
      expect(granted).not.toMatch(new RegExp(`\\b${column}\\b`));
    }
  });

  it("does not fall back on column-level REVOKE, which is a no-op here", () => {
    expect(hardening()).not.toMatch(/REVOKE SELECT \(/);
  });
});

describe("shipped operations still work", () => {
  /** The column list on GRANT INSERT (...) ON public.feedback. */
  const grantedInsertColumns = () => {
    const m = hardening().match(/GRANT INSERT \(([\s\S]*?)\) ON public\.feedback TO authenticated;/);
    expect(m, "GRANT INSERT column list not found").not.toBeNull();
    return m![1]
      .split(",")
      .map(c => c.trim())
      .filter(Boolean)
      .sort();
  };

  /** The keys client.ts actually sends in its insert payload. */
  const clientInsertKeys = () => {
    const src = readFileSync(join(SRC_DIR, "lib", "feedback", "client.ts"), "utf8");
    const payload = src.match(/\.insert\(\{([\s\S]*?)\}\s*as never\)/);
    expect(payload, "insert payload not found in client.ts").not.toBeNull();
    return [...payload![1].matchAll(/^\s*([a-z_]+):/gm)].map(m => m[1]).sort();
  };

  it("the INSERT grant exactly covers what the client sends — no more, no less", () => {
    // Too narrow breaks submission; too wide lets a reporter set their own
    // status or pre-fill admin_notes.
    expect(grantedInsertColumns()).toEqual(clientInsertKeys());
  });

  it("withholds admin-owned and derived columns from INSERT", () => {
    const granted = grantedInsertColumns();
    for (const column of [
      "status",
      "priority",
      "is_archived",
      "admin_notes",
      "duplicate_of",
      "legacy_category",
      "screenshot_path",
      // Derived by normalize_feedback_submission(); a BEFORE trigger assigning
      // NEW.type is not privilege-checked against the caller.
      "type",
      "id",
      "created_at",
      "updated_at",
      "upvotes",
    ]) {
      expect(granted).not.toContain(column);
    }
  });

  it("keeps SELECT on id, which the admin UPDATE/DELETE predicates need", () => {
    // AdminFeedback.tsx:129/136 issue `... WHERE id = $1`, and a WHERE clause
    // reads its columns.
    const admin = readFileSync(join(SRC_DIR, "components", "admin", "AdminFeedback.tsx"), "utf8");
    expect(admin).toMatch(/\.update\([\s\S]{0,40}?\)\.eq\("id"/);
    expect(admin).toMatch(/\.delete\(\)\.eq\("id"/);
    expect(hardening()).toMatch(/GRANT SELECT \(id\) ON public\.feedback TO authenticated;/);
  });

  it("does not revoke UPDATE or DELETE, which admins share via `authenticated`", () => {
    // An admin is an authenticated session with a user_roles row, not a
    // database role, so RLS has to remain the gate for writes.
    expect(hardening()).not.toMatch(/REVOKE UPDATE/);
    expect(hardening()).not.toMatch(/REVOKE DELETE/);
  });

  it("does not touch service_role", () => {
    expect(hardening()).not.toMatch(/service_role/);
  });
});

describe("RLS stays as the independent boundary", () => {
  it("adds, drops and alters no policy", () => {
    const s = hardening();
    expect(s).not.toMatch(/CREATE POLICY/);
    expect(s).not.toMatch(/DROP POLICY/);
    expect(s).not.toMatch(/ALTER POLICY/);
    expect(s).not.toMatch(/DISABLE ROW LEVEL SECURITY/);
  });

  it("does not rewrite the project's default privileges", () => {
    expect(hardening()).not.toMatch(/ALTER DEFAULT PRIVILEGES/);
  });

  it("leaves the SECURITY DEFINER read paths untouched", () => {
    const s = hardening();
    expect(s).not.toMatch(/FUNCTION public\.list_my_feedback/);
    expect(s).not.toMatch(/FUNCTION public\.admin_list_feedback/);
    expect(s).not.toMatch(/FUNCTION public\.attach_feedback_screenshot/);
  });

  it("leaves the notification trigger intact", () => {
    const s = hardening();
    expect(s).not.toMatch(/FUNCTION public\.notify_admins_on_feedback/);
    expect(s).not.toMatch(/TRIGGER feedback_admin_notify/);
    expect(s).not.toMatch(/admin_notifications/);
    // And it is still defined, unmodified, in the foundation migration.
    expect(sql(FOUNDATION)).not.toMatch(/notify_admins_on_feedback/);
  });

  it("leaves the rate limit intact — it must stay SECURITY DEFINER to count rows", () => {
    expect(hardening()).not.toMatch(/FUNCTION public\.enforce_feedback_rate_limit/);
    const rateLimit = sql(FOUNDATION).match(
      /CREATE OR REPLACE FUNCTION public\.enforce_feedback_rate_limit\(\)[\s\S]*?\$\$;/,
    )![0];
    // If this ran as the caller it would start failing every insert the moment
    // SELECT was revoked.
    expect(rateLimit).toMatch(/SECURITY DEFINER/);
    expect(rateLimit).toMatch(/FROM public\.feedback/);
  });

  it("leaves feedback_upvotes alone", () => {
    expect(hardening()).not.toMatch(/feedback_upvotes/);
  });
});

describe("read paths", () => {
  it("the user contract still omits every admin-only field", () => {
    const fn = sql(FOUNDATION).match(
      /CREATE OR REPLACE FUNCTION public\.list_my_feedback\(\)[\s\S]*?\$\$;/,
    )![0];
    for (const field of FEEDBACK_ADMIN_ONLY_FIELDS) {
      expect(fn).not.toMatch(new RegExp(`\\b${field}\\b`));
    }
    // legacy_category is a migration artefact, not something a reporter filed.
    expect(fn).not.toMatch(/\blegacy_category\b/);
  });

  it("the admin read path is still admin_list_feedback", () => {
    const admin = readFileSync(join(SRC_DIR, "components", "admin", "AdminFeedback.tsx"), "utf8");
    expect(admin).toMatch(/supabase\.rpc\("admin_list_feedback"/);
    // It returns SETOF public.feedback, so new columns reach admins with no
    // change to the function — and it is not redefined by any FB1 migration.
    for (const file of [FOUNDATION, STORAGE, HARDENING]) {
      expect(sql(file)).not.toMatch(/CREATE OR REPLACE FUNCTION public\.admin_list_feedback/);
    }
  });
});

/**
 * OUTSTANDING LIVE CHECKS — privilege truth cannot be asserted from SQL text.
 * Run the queries in docs/fb1-feedback-rollout.md and the runbook after
 * applying. The three that matter most:
 *
 *   1. has_column_privilege('authenticated','public.feedback','admin_notes','SELECT')
 *        -> expect FALSE after M3 (and TRUE before it — that is the defect).
 *   2. has_column_privilege('authenticated','public.feedback','id','SELECT')
 *        -> expect TRUE, or admin UPDATE/DELETE and INSERT ... RETURNING break.
 *   3. An INSERT as a real authenticated session still succeeds, proving the
 *      RLS WITH CHECK on profile_id does not require a SELECT privilege the
 *      caller no longer has. PostgreSQL applies policy expressions in the
 *      rewriter rather than checking them against caller column privileges, so
 *      this is expected to pass — but it is an assumption until executed.
 */
