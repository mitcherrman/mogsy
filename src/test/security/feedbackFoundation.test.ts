import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  FEEDBACK_ADMIN_ONLY_FIELDS,
  FEEDBACK_RATE_LIMIT_ERROR,
  FEEDBACK_RATE_LIMIT_PER_HOUR,
} from "@/lib/feedback/contract";

/**
 * FB1 Phase 1 — verification of the feedback schema foundation.
 *
 * This is a contract test over the migration SQL, NOT a live database test.
 * Mogzy's Supabase is managed through Lovable Cloud: there is no local stack,
 * the CLI is deliberately not linked to the project, and this migration is
 * applied by hand through the SQL Editor. That is the same constraint
 * adminNotificationPolicy.test.ts works under, and the same approach.
 *
 * What that means honestly: the assertions below prove the migration SAYS the
 * right thing, and pin it so a later edit cannot quietly say something else.
 * They do not prove Postgres BEHAVES that way. The behavioural claims that
 * still rest on argument rather than execution are enumerated in
 * "outstanding live checks" at the foot of this file, and are the checklist to
 * run in the SQL Editor when the migration is applied.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const FB1_MIGRATION = "20260812120000_fb1_feedback_foundation.sql";

const migrationFiles = () =>
  readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();

const readMigration = (f: string) => readFileSync(join(MIGRATIONS_DIR, f), "utf8");

const fb1 = () => readMigration(FB1_MIGRATION);

/** Strip `--` line comments so prose in the header never satisfies an assertion. */
const fb1Sql = () =>
  fb1()
    .split("\n")
    .map(line => line.replace(/--.*$/, ""))
    .join("\n");

describe("FB1 migration — ordering and shape", () => {
  it("exists and sorts after every migration currently on main", () => {
    const files = migrationFiles();
    expect(files).toContain(FB1_MIGRATION);
    expect(files[files.length - 1]).toBe(FB1_MIGRATION);
  });

  it("sorts after the two unpushed 20260803120000 migrations (NOT1 P2, ADM2)", () => {
    // Both land at 20260803120000 on their own branches. FB1 must not tie or
    // precede them, or apply order becomes ambiguous.
    expect(FB1_MIGRATION > "20260803120000_z").toBe(true);
  });

  it("is a single transaction", () => {
    const sql = fb1Sql();
    expect(sql).toMatch(/^\s*BEGIN;/m);
    expect(sql).toMatch(/COMMIT;\s*$/);
  });
});

describe("FB1 migration — preserves existing rows and vocabulary", () => {
  it("never deletes, truncates or drops feedback data", () => {
    const sql = fb1Sql();
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.feedback/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
  });

  it("adds every new column additively", () => {
    const sql = fb1Sql();
    for (const col of [
      "entry_intent",
      "type",
      "severity",
      "reproducibility",
      "expected_result",
      "actual_result",
      "evidence_url",
      "screenshot_path",
      "page_url",
      "client_meta",
      "duplicate_of",
      "legacy_category",
    ]) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\b`));
    }
  });

  it("leaves the shipped status/priority/page_reference vocabulary alone", () => {
    const sql = fb1Sql();
    // No rewrite of live status values, and no CHECK pinning a vocabulary this
    // migration cannot enumerate from production.
    expect(sql).not.toMatch(/SET\s+status\s*=/i);
    expect(sql).not.toMatch(/SET\s+priority\s*=/i);
    expect(sql).not.toMatch(/SET\s+page_reference\s*=/i);
    expect(sql).not.toMatch(/CHECK\s*\(\s*status\s+IN/i);
    expect(sql).not.toMatch(/CHECK\s*\(\s*priority\s+IN/i);
  });

  it("preserves the original category verbatim before rewriting it", () => {
    const sql = fb1Sql();
    expect(sql).toMatch(/legacy_category\s*=\s*COALESCE\(legacy_category,\s*category\)/);
    // The rewrite and the preservation are the same statement, so category can
    // never be narrowed without legacy_category being written.
    const update = sql.match(/UPDATE public\.feedback[\s\S]*?WHERE legacy_category IS NULL;/);
    expect(update).not.toBeNull();
    expect(update![0]).toMatch(/category\s*=\s*'General'/);
  });

  it("backfills deterministically and is re-runnable", () => {
    const update = fb1Sql().match(/UPDATE public\.feedback[\s\S]*?WHERE legacy_category IS NULL;/)![0];
    // Total mapping: every branch has an ELSE, so no row is left unclassified
    // and an unseen category value cannot fail the apply.
    expect(update.match(/ELSE/g)?.length).toBeGreaterThanOrEqual(2);
    expect(update).toMatch(/WHEN 'bug report'\s+THEN 'bug'/);
    expect(update).toMatch(/WHEN 'feature request' THEN 'feature'/);
    // Case/whitespace insensitive, so 'Bug Report' and 'bug report' agree.
    expect(update).toMatch(/lower\(btrim\(category\)\)/);
    // Guarded on legacy_category IS NULL: applying twice cannot double-rewrite.
    expect(update).toMatch(/WHERE legacy_category IS NULL;/);
  });

  it("does not classify any legacy row as gameplay feedback", () => {
    // No legacy row can be known to be gameplay feedback. Guessing would
    // corrupt the first real measurement of that entry path.
    const update = fb1Sql().match(/UPDATE public\.feedback[\s\S]*?WHERE legacy_category IS NULL;/)![0];
    expect(update).not.toMatch(/'gameplay'/);
  });
});

describe("FB1 migration — anonymous submitter retention", () => {
  it("replaces the cascading FK with ON DELETE SET NULL", () => {
    const sql = fb1Sql();
    expect(sql).toMatch(/ALTER COLUMN profile_id DROP NOT NULL/);
    expect(sql).toMatch(
      /ADD CONSTRAINT\s+feedback_profile_id_fkey[\s\S]{0,160}?REFERENCES public\.profiles\(id\) ON DELETE SET NULL/,
    );
    // The whole point: the purge must never destroy a submitted report again.
    expect(sql).not.toMatch(/feedback_profile_id_fkey[\s\S]{0,160}?ON DELETE CASCADE/);
  });

  it("keeps NULL reachable only via the referential action, never via insert", () => {
    const sql = fb1Sql();
    expect(sql).toMatch(/IF NEW\.profile_id IS NULL THEN[\s\S]{0,200}?RAISE EXCEPTION 'feedback_profile_id_required'/);
    expect(sql).toMatch(/CREATE TRIGGER feedback_normalize_submission\s+BEFORE INSERT ON public\.feedback/);
  });

  it("retains no personal data about a purged submitter", () => {
    const sql = fb1Sql();
    // Phase 0 proposed snapshotting display_name. Rejected: anonymous names
    // identify nobody, and retaining a real user's name past account deletion
    // works against erasure. profile_id IS NULL already answers "still
    // attributable?".
    expect(sql).not.toMatch(/submitter_label/);
    expect(sql).not.toMatch(/display_name/);
  });

  it("does not touch the anonymous purge system", () => {
    const sql = fb1Sql();
    expect(sql).not.toMatch(/purge_anonymous|purge-anonymous/i);
    expect(sql).not.toMatch(/ALTER TABLE public\.profiles/i);
    expect(sql).not.toMatch(/auth\.users/i);
  });
});

describe("FB1 migration — privacy model", () => {
  it("adds, drops and alters no RLS policy on public.feedback", () => {
    const sql = fb1Sql();
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]{0,120}?ON public\.feedback/i);
    expect(sql).not.toMatch(/DROP POLICY[\s\S]{0,120}?ON public\.feedback/i);
    expect(sql).not.toMatch(/ALTER POLICY/i);
  });

  it("does not widen any grant on public.feedback", () => {
    const sql = fb1Sql();
    expect(sql).not.toMatch(/GRANT[\s\S]{0,80}?ON public\.feedback/i);
  });

  it("exposes the submitter read path as a non-wideable RETURNS TABLE contract", () => {
    const sql = fb1Sql();
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.list_my_feedback\(\)[\s\S]*?\$\$;/)![0];
    expect(fn).toMatch(/RETURNS TABLE\s*\(/);
    expect(fn).toMatch(/SECURITY DEFINER/);
    expect(fn).toMatch(/SET search_path = public/);
    // Own rows only, and an orphaned row is excluded explicitly as well as by
    // is_profile_owner returning false for NULL.
    expect(fn).toMatch(/public\.is_profile_owner\(f\.profile_id\)/);
    expect(fn).toMatch(/f\.profile_id IS NOT NULL/);
  });

  it("omits every admin-only field from the submitter contract", () => {
    const fn = fb1Sql().match(
      /CREATE OR REPLACE FUNCTION public\.list_my_feedback\(\)[\s\S]*?\$\$;/,
    )![0];
    for (const field of FEEDBACK_ADMIN_ONLY_FIELDS) {
      expect(fn).not.toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it("narrows EXECUTE on the new function away from PUBLIC and anon", () => {
    const sql = fb1Sql();
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.list_my_feedback\(\) FROM PUBLIC, anon;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_my_feedback\(\) TO authenticated;/);
  });

  it("leaves the admin RPC and the notification trigger untouched", () => {
    const sql = fb1Sql();
    // admin_list_feedback RETURNS SETOF public.feedback, so new columns reach
    // the admin UI with no change to the function. Redefining it here would
    // risk regressing its admin gate for no gain.
    expect(sql).not.toMatch(/FUNCTION public\.admin_list_feedback/);
    expect(sql).not.toMatch(/FUNCTION public\.notify_admins_on_feedback/);
    expect(sql).not.toMatch(/TRIGGER feedback_admin_notify/);
    expect(sql).not.toMatch(/admin_notifications/);
  });
});

describe("FB1 migration — rate limit", () => {
  it("enforces the threshold server-side, before insert", () => {
    const sql = fb1Sql();
    expect(sql).toMatch(/CREATE TRIGGER feedback_rate_limit\s+BEFORE INSERT ON public\.feedback/);
    const fn = sql.match(
      /CREATE OR REPLACE FUNCTION public\.enforce_feedback_rate_limit\(\)[\s\S]*?\$\$;/,
    )![0];
    expect(fn).toMatch(/SECURITY DEFINER/);
    // Counts committed rows, so clearing storage or calling PostgREST directly
    // evades nothing.
    expect(fn).toMatch(/FROM public\.feedback[\s\S]*?created_at > now\(\) - interval '1 hour'/);
  });

  it("uses the threshold the frontend contract advertises", () => {
    const fn = fb1Sql().match(
      /CREATE OR REPLACE FUNCTION public\.enforce_feedback_rate_limit\(\)[\s\S]*?\$\$;/,
    )![0];
    expect(fn).toMatch(
      new RegExp(`_max_per_hour constant integer := ${FEEDBACK_RATE_LIMIT_PER_HOUR};`),
    );
    expect(fn).toMatch(/IF _recent >= _max_per_hour THEN/);
  });

  it("raises the exact token the frontend matches on", () => {
    const fn = fb1Sql().match(
      /CREATE OR REPLACE FUNCTION public\.enforce_feedback_rate_limit\(\)[\s\S]*?\$\$;/,
    )![0];
    expect(fn).toMatch(new RegExp(`RAISE EXCEPTION '${FEEDBACK_RATE_LIMIT_ERROR}'`));
  });

  it("exempts admins so owner testing is never blocked", () => {
    const fn = fb1Sql().match(
      /CREATE OR REPLACE FUNCTION public\.enforce_feedback_rate_limit\(\)[\s\S]*?\$\$;/,
    )![0];
    expect(fn).toMatch(/IF public\.has_role\(auth\.uid\(\), 'admin'\) THEN\s+RETURN NEW;/);
  });
});

describe("FB1 migration — insert normalisation", () => {
  it("derives type from entry_intent server-side, discarding any client value", () => {
    const fn = fb1Sql().match(
      /CREATE OR REPLACE FUNCTION public\.normalize_feedback_submission\(\)[\s\S]*?\$\$;/,
    )![0];
    expect(fn).toMatch(/NEW\.type\s*:=\s*CASE NEW\.entry_intent/);
    expect(fn).toMatch(/WHEN 'bug'\s+THEN 'bug'/);
    expect(fn).toMatch(/WHEN 'feature' THEN 'feature'/);
    // gameplay and other both collapse to the 'feedback' workflow.
    expect(fn).toMatch(/ELSE 'feedback'/);
  });
});

/**
 * OUTSTANDING LIVE CHECKS — run in the Lovable Cloud SQL Editor when this
 * migration is applied. Each is a claim argued in the migration header that
 * static analysis cannot execute:
 *
 *  1. is_profile_owner(NULL) returns false, not NULL:
 *       SELECT public.is_profile_owner(NULL);              -- expect: f
 *     This is what makes an orphaned row invisible rather than universally
 *     visible, and it is the single most important assertion in FB1.
 *
 *  2. Orphaning works and retains the row:
 *       -- against a scratch profile only, never a real one
 *       DELETE FROM public.profiles WHERE id = '<scratch>';
 *       SELECT id, profile_id FROM public.feedback WHERE id = '<row>';
 *                                                          -- expect: 1 row, profile_id NULL
 *
 *  3. The orphan is admin-visible:
 *       SELECT count(*) FROM public.admin_list_feedback(false)
 *        WHERE profile_id IS NULL;                         -- expect: >= 1
 *
 *  4. Rate limit fires on the 6th insert in an hour for a non-admin profile,
 *     and does not fire for an admin.
 *
 *  5. Row counts are unchanged by the migration:
 *       SELECT count(*) FROM public.feedback;              -- before and after
 *
 *  6. Backfill is total:
 *       SELECT count(*) FROM public.feedback
 *        WHERE entry_intent IS NULL OR legacy_category IS NULL;   -- expect: 0
 *
 *  7. PRE-EXISTING, NOT FB1'S: confirm whether admin_notes is readable by a
 *     non-admin, which 20260730150000 establishes it almost certainly is:
 *       SELECT has_column_privilege('authenticated', 'public.feedback',
 *                                   'admin_notes', 'SELECT');     -- expect: t (the defect)
 */
