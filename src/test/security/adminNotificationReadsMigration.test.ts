import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * SQL contract for per-admin admin-notification read state (NOT1 Phase 2/2B).
 *
 * `20260803121000_admin_notification_per_admin_reads.sql` is ALREADY APPLIED in
 * production, and the production ledger records it. The file therefore is not a
 * plan any more — it is the repository's record of what the live database
 * contains, and the only way it can ever lie is by being edited. These tests
 * read it and assert it still says what the production verification proved:
 * 17/17 schema checks and 17/17 live RLS probes.
 *
 * They are static. They do not execute SQL; there is no local Postgres in this
 * environment. The client half of the phase's boundary — that no frontend path
 * derives read state from the global flag — lives in
 * adminNotificationReadSemantics.test.ts.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const PHASE2 = "20260803121000_admin_notification_per_admin_reads.sql";
const PHASE1 = "20260802120000_admin_notification_insert_hardening.sql";

const migrationFiles = () =>
  readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();

const readMigration = (f: string) => readFileSync(join(MIGRATIONS_DIR, f), "utf8");

/** Whitespace-collapsed, so assertions do not depend on SQL formatting. */
const flat = (s: string) => s.replace(/\s+/g, " ");

const phase2 = () => readMigration(PHASE2);

function policy(command: "SELECT" | "INSERT" | "UPDATE" | "DELETE"): string | null {
  const re = new RegExp(
    `CREATE POLICY\\s+"[^"]+"\\s+ON\\s+public\\.admin_notification_reads\\s+FOR\\s+${command}([\\s\\S]*?);`,
    "i",
  );
  const m = re.exec(phase2());
  return m ? flat(m[1]) : null;
}

describe("applied migrations stay byte-identical to what production ran", () => {
  it("pins the Phase 2 migration itself", () => {
    // Production applied exactly these bytes and the ledger names them. An edit
    // here would make the repository disagree with the live database with
    // nothing to notice it — and re-deriving the truth would mean re-reading a
    // schema nobody is allowed to touch.
    const digest = createHash("sha256").update(readFileSync(join(MIGRATIONS_DIR, PHASE2))).digest("hex");
    expect(digest).toBe("6cebdef591e96bfd01ed3a87f240bdf037a48e9e6471267099a0278b863d5604");
  });

  it("carries the reconciled version number, not the pre-renumber one", () => {
    // ADM2 independently claimed 20260803120000. Two migrations under one
    // version means the first recorded silently makes the second look applied.
    expect(migrationFiles()).not.toContain(
      "20260803120000_admin_notification_per_admin_reads.sql",
    );
    expect(phase2()).toContain("(since 20260803121000)");
    expect(phase2()).not.toContain("20260803120000");
  });

  it("leaves the already-applied 20260802120000 migration byte-identical", () => {
    // Editing an applied migration would make the repository disagree with the
    // production database, silently.
    const digest = createHash("sha256").update(readFileSync(join(MIGRATIONS_DIR, PHASE1))).digest("hex");
    expect(digest).toBe("d849d7fe2ee3650c7d67f3c5cae36e57a2568d99cbb1781ba9d06e08a6ac1601");
  });

  it("orders the new migration after it", () => {
    const files = migrationFiles();
    expect(files).toContain(PHASE2);
    expect(files.indexOf(PHASE2)).toBeGreaterThan(files.indexOf(PHASE1));
  });

  it("still never forces RLS on admin_notifications", () => {
    // FORCE RLS would stop the four SECURITY DEFINER trigger producers from
    // bypassing policy as table owner, killing every report notification.
    for (const file of migrationFiles()) {
      expect(readMigration(file)).not.toMatch(
        /ALTER\s+TABLE\s+public\.admin_notifications\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i,
      );
    }
  });

  it("does not drop or rename admin_notifications.is_read", () => {
    const sql = flat(phase2());
    expect(sql).not.toMatch(/ALTER TABLE public\.admin_notifications DROP COLUMN/i);
    expect(sql).not.toMatch(/RENAME COLUMN is_read/i);
  });

  it("does not widen any policy on admin_notifications", () => {
    expect(phase2()).not.toMatch(/CREATE POLICY[\s\S]*ON\s+public\.admin_notifications/i);
  });
});

describe("admin_notification_reads schema", () => {
  it("cascades receipts when their notification is deleted", () => {
    expect(flat(phase2())).toMatch(
      /notification_id uuid NOT NULL REFERENCES public\.admin_notifications\(id\) ON DELETE CASCADE/i,
    );
  });

  it("is unique per (notification, admin), so a duplicate mark cannot double-insert", () => {
    expect(flat(phase2())).toMatch(/UNIQUE \(notification_id, admin_user_id\)/i);
  });

  it("indexes the per-admin lookup the product actually runs", () => {
    // The UNIQUE index leads with notification_id, which is the wrong order for
    // "which of these has MY session read".
    expect(flat(phase2())).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_admin_notification_reads_admin ON public\.admin_notification_reads \(admin_user_id, notification_id\)/i,
    );
  });

  it("enables row level security", () => {
    expect(flat(phase2())).toMatch(
      /ALTER TABLE public\.admin_notification_reads ENABLE ROW LEVEL SECURITY/i,
    );
  });
});

describe("admin_notification_reads access model", () => {
  it("lets an admin select only their own receipts", () => {
    const p = policy("SELECT");
    expect(p).not.toBeNull();
    expect(p).toMatch(/TO authenticated/i);
    expect(p).toMatch(/auth\.uid\(\) = admin_user_id/);
    expect(p).toMatch(/has_role\(\s*auth\.uid\(\), 'admin'/);
  });

  it("lets an admin insert only their own receipts", () => {
    const p = policy("INSERT");
    expect(p).not.toBeNull();
    expect(p).toMatch(/TO authenticated/i);
    // This single clause is what stops admin A forging a receipt for admin B.
    expect(p).toMatch(/auth\.uid\(\) = admin_user_id/);
    expect(p).toMatch(/has_role\(\s*auth\.uid\(\), 'admin'/);
  });

  it("keeps ordinary authenticated users out, not merely empty-handed", () => {
    // Without the has_role clause a non-admin would simply see zero rows. The
    // requirement is that they hold no access to the table at all.
    for (const p of [policy("SELECT"), policy("INSERT")]) {
      expect(p).toMatch(/has_role/);
      expect(p).not.toMatch(/auth\.uid\(\) IS NOT NULL/i);
      expect(p).not.toMatch(/USING \( true \)/i);
    }
  });

  it("gives the anon role no policy and no grant", () => {
    expect(policy("SELECT")).toMatch(/TO authenticated/i);
    expect(policy("INSERT")).toMatch(/TO authenticated/i);
    expect(flat(phase2())).not.toMatch(/GRANT[^;]*admin_notification_reads TO[^;]*anon/i);
  });

  it("revokes the inherited default privileges from BOTH client roles first", () => {
    // This project carries Supabase's stock
    //   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES
    //     TO postgres, anon, authenticated, service_role
    // so CREATE TABLE hands `authenticated` all seven privileges before this
    // migration's own GRANT runs. Revoking only from anon — which is what the
    // first version of this migration did — leaves authenticated holding
    // DELETE, TRUNCATE, REFERENCES, TRIGGER and UPDATE. TRUNCATE is not
    // filtered by RLS at all, so the row policies would not have covered it.
    const sql = flat(phase2());
    expect(sql).toMatch(
      /REVOKE ALL ON public\.admin_notification_reads FROM anon, authenticated/i,
    );
    // Guard against a regression to the anon-only form.
    expect(sql).not.toMatch(
      /REVOKE ALL ON public\.admin_notification_reads FROM anon;/i,
    );
  });

  it("grants authenticated exactly SELECT and INSERT, after the revoke", () => {
    const sql = flat(phase2());
    expect(sql).toMatch(
      /GRANT SELECT, INSERT ON public\.admin_notification_reads TO authenticated/i,
    );
    // Order matters: a GRANT before the REVOKE would be undone by it.
    expect(sql.indexOf("REVOKE ALL ON public.admin_notification_reads"))
      .toBeLessThan(sql.indexOf("GRANT SELECT, INSERT ON public.admin_notification_reads"));
  });

  it("has no UPDATE or DELETE policy — a receipt is immutable and permanent", () => {
    expect(policy("UPDATE")).toBeNull();
    expect(policy("DELETE")).toBeNull();
  });
});

describe("backfill model", () => {
  const backfill = () => {
    const sql = flat(phase2());
    const at = sql.indexOf("INSERT INTO public.admin_notification_reads (notification_id, admin_user_id) SELECT");
    expect(at).toBeGreaterThan(-1);
    return sql.slice(at, sql.indexOf(";", at));
  };

  it("backfills only rows that are globally read today", () => {
    // Anything already unread for everyone must stay unread for everyone; the
    // migration must not invent read state that never existed.
    expect(backfill()).toMatch(/WHERE n\.is_read = true/i);
  });

  it("backfills only users who hold admin or master_admin at migration time", () => {
    expect(backfill()).toMatch(/FROM public\.user_roles WHERE role::text IN \('admin', 'master_admin'\)/i);
  });

  it("does not seed receipts for a future admin", () => {
    // There is no trigger, no scheduled job and no ON INSERT hook on user_roles:
    // a newly promoted admin starts with an empty receipt set on purpose.
    expect(flat(phase2())).not.toMatch(/CREATE TRIGGER[^;]*user_roles/i);
  });

  it("is re-runnable", () => {
    expect(backfill()).toMatch(/ON CONFLICT \(notification_id, admin_user_id\) DO NOTHING/i);
  });
});

describe("read-state RPCs", () => {
  const fn = (name: string) => {
    const sql = phase2();
    const at = sql.indexOf(`FUNCTION public.${name}`);
    expect(at).toBeGreaterThan(-1);
    return flat(sql.slice(at, sql.indexOf("$$;", at)));
  };

  it("derives the unread count from receipts, not from is_read", () => {
    const body = fn("admin_unread_notification_count");
    expect(body).toMatch(/NOT EXISTS \( SELECT 1 FROM public\.admin_notification_reads r/i);
    expect(body).toMatch(/r\.admin_user_id = auth\.uid\(\)/);
    expect(body).not.toMatch(/is_read/);
  });

  it("takes no admin id: the unread count can only ever be about the caller", () => {
    expect(phase2()).toMatch(/FUNCTION public\.admin_unread_notification_count\(\)/);
  });

  it("requires an admin role rather than quietly returning zero", () => {
    expect(fn("admin_unread_notification_count")).toMatch(
      /IF NOT public\.has_role\(auth\.uid\(\), 'admin'::app_role\) THEN RAISE EXCEPTION/i,
    );
  });

  it("resolves a moderator request and records the acting admin's receipt together", () => {
    const body = fn("admin_resolve_mod_request");
    expect(body).toMatch(/UPDATE public\.admin_notifications SET is_read = true/i);
    expect(body).toMatch(
      /INSERT INTO public\.admin_notification_reads \(notification_id, admin_user_id\) VALUES \(_notification_id, auth\.uid\(\)\)/i,
    );
    expect(body).toMatch(/ON CONFLICT \(notification_id, admin_user_id\) DO NOTHING/i);
  });

  it("takes no admin id, so a receipt cannot be forged through it", () => {
    expect(phase2()).toMatch(
      /FUNCTION public\.admin_resolve_mod_request\(\s*_notification_id uuid,\s*_approved boolean\s*\)/,
    );
    const params = /FUNCTION public\.admin_resolve_mod_request\(([\s\S]*?)\)/.exec(phase2())![1];
    expect(params.match(/_[a-z_]+ /g)?.map(p => p.trim())).toEqual(["_notification_id", "_approved"]);
  });

  it("pins the resolve RPC to moderator-request rows", () => {
    expect(fn("admin_resolve_mod_request")).toMatch(
      /type IN \('mod_delete_request', 'mod_action'\)/i,
    );
  });

  it("runs both RPCs with invoker rights, so the caller's own RLS still applies", () => {
    for (const name of ["admin_unread_notification_count", "admin_resolve_mod_request"]) {
      expect(fn(name)).not.toMatch(/SECURITY DEFINER/i);
    }
  });

  it("withholds EXECUTE from anon on both RPCs", () => {
    const sql = flat(phase2());
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.admin_unread_notification_count\(\) FROM anon, public/i,
    );
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.admin_resolve_mod_request\(uuid, boolean\) FROM anon, public/i,
    );
  });
});
