import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Static guard over the split NOT1 Phase 2 made in `admin_notifications`.
 *
 * Two meanings used to share one boolean column:
 *
 *   read state   — "an admin has seen this". Per admin. Now lives in
 *                  admin_notification_reads, one row per (notification, admin).
 *   disposition  — "this moderator delete request has been approved or denied".
 *                  Genuinely global, and the ONLY surviving meaning of
 *                  `admin_notifications.is_read`.
 *
 * Mixing them is what the phase exists to stop: with one global flag, the first
 * admin to open a report cleared it for every other admin, who then never saw
 * it at all. Nothing in that failure is loud — the queue simply looks empty —
 * so the boundary is pinned here rather than left to review.
 *
 * This is a source-level contract test. The database half (RLS isolation, RPC
 * grants) was verified against production and is not re-checked here.
 */

const SRC_DIR = join(process.cwd(), "src");

/** Product source only: tests deliberately mention the retired shapes. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Comments are documentation of the old defect and must stay quotable. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const files = sourceFiles(SRC_DIR).map(f => ({
  path: relative(process.cwd(), f),
  code: stripComments(readFileSync(f, "utf8")),
}));

/** Where `is_read` legitimately survives, and why. */
const DISPOSITION_OWNER = "src/components/admin/AdminModeratorConfig.tsx";
/** Generated from the live schema; it must describe the column, not use it. */
const GENERATED_TYPES = "src/integrations/supabase/types.ts";

describe("admin read state comes from receipts, never from is_read", () => {
  it("has no client query filtering admin notifications by is_read", () => {
    const offenders = files.filter(f => /is_read"\s*,\s*false/.test(f.code));
    expect(offenders.map(f => f.path)).toEqual([]);
  });

  it("has no client write of admin_notifications.is_read outside the disposition owner", () => {
    const offenders = files.filter(
      f =>
        f.path !== DISPOSITION_OWNER &&
        /from\(["']admin_notifications["']\)[\s\S]{0,200}?\.update\(/.test(f.code),
    );
    expect(offenders.map(f => f.path)).toEqual([]);
  });

  it("does not write is_read even in the disposition owner — that goes through the RPC", () => {
    const owner = files.find(f => f.path === DISPOSITION_OWNER)!;
    expect(owner.code).not.toMatch(/\.update\(\s*\{\s*is_read/);
    expect(owner.code).toContain("admin_resolve_mod_request");
  });

  it("selects is_read only where it means disposition", () => {
    const readers = files.filter(
      f => f.path !== GENERATED_TYPES && /["'][^"']*\bis_read\b[^"']*["']/.test(f.code),
    );
    expect(readers.map(f => f.path)).toEqual([DISPOSITION_OWNER]);
  });

  it("counts unread through the per-admin RPC everywhere a badge exists", () => {
    const badgeSurfaces = [
      "src/lib/admin/useAdminAttention.ts",
      "src/pages/Admin.tsx",
      "src/pages/AdminDiagnostics.tsx",
    ];
    for (const path of badgeSurfaces) {
      const file = files.find(f => f.path === path);
      expect(file, `${path} is missing`).toBeTruthy();
      expect(file!.code, path).toContain("admin_unread_notification_count");
    }
  });

  it("never passes an admin id to the count RPC — the subject is always the session", () => {
    for (const f of files) {
      expect(
        /admin_unread_notification_count"\s*,/.test(f.code),
        `${f.path} passes arguments to admin_unread_notification_count`,
      ).toBe(false);
    }
  });

  it("scopes every receipt read and write to a single admin", () => {
    // types.ts only declares the table, so it does not count as a consumer —
    // without this the assertion would pass on a tree where no surface reads
    // receipts at all, which is exactly the pre-phase state.
    const touchers = files.filter(
      f => f.path !== GENERATED_TYPES && f.code.includes("admin_notification_reads"),
    );
    expect(touchers.map(f => f.path).sort()).toEqual([
      "src/components/admin/AdminNotifications.tsx",
      "src/components/hud/MogzyIdentityMenu.tsx",
    ]);
    for (const f of touchers) {
      expect(f.code, `${f.path} touches receipts without an admin_user_id scope`)
        .toMatch(/admin_user_id/);
    }
  });

  it("keeps the retired global-bell component retired", () => {
    // The MALT HUD consolidation absorbed UserNotificationBell into
    // MogzyIdentityMenu. Restoring the old file would restore the global
    // is_read derivation with it.
    expect(existsSync(join(SRC_DIR, "components", "UserNotificationBell.tsx"))).toBe(false);
    const importers = files.filter(f => /UserNotificationBell/.test(f.code));
    expect(importers.map(f => f.path)).toEqual([]);
  });
});
