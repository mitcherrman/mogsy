/**
 * COM1-1 / P0-1A — a social notification must never carry another account's
 * Supabase auth id.
 *
 * Two independent guarantees, tested separately because they fail separately:
 *
 *  1. THE DATABASE stops writing it. Migration 20260823120000 replaces the four
 *     trigger functions so a user-to-user row records the system sentinel
 *     instead of the other party's `auth.users.id`, and backfills history.
 *     That is the real fix — it holds against a hand-written PostgREST query,
 *     which no client-side change can.
 *
 *  2. THE CLIENT stops asking for it. The bell used `select("*")`; it now names
 *     its columns. That does not close the hole on its own, but it stops the
 *     next column added to the table from being republished by default.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const MIGRATION = "supabase/migrations/20260823120000_com1_social_notification_identity.sql";
const HUD = "src/components/hud/MogzyIdentityMenu.tsx";

/** The four types written by a trigger on behalf of one user, to another. */
const SOCIAL_TYPES = [
  "friend_request",
  "friend_accepted",
  "comment_reply",
  "comment_reaction",
];

describe("P0-1A · the database stops writing a foreign auth id", () => {
  const sql = read(MIGRATION);

  it("redefines every trigger that used to write one", () => {
    for (const fn of [
      "notify_on_friendship_change",
      "notify_user_on_comment_reply",
      "notify_user_on_comment_reaction",
    ]) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${fn}()`);
    }
  });

  it("no rewritten trigger still reads a profile's user_id into the row", () => {
    // The exact expression that leaked: `(SELECT user_id FROM public.profiles ...)`
    // passed as the sent_by_user_id argument.
    expect(sql).not.toMatch(/SELECT\s+user_id\s+FROM\s+public\.profiles/i);
  });

  it("writes the system sentinel instead", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.system_notification_actor()");
    // One call site per trigger insert: friendship x2, reply, reaction.
    const calls = sql.match(/public\.system_notification_actor\(\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });

  it("backfills the ids already sitting in history, scoped to the social types", () => {
    expect(sql).toMatch(/UPDATE\s+public\.user_notifications/i);
    for (const t of SOCIAL_TYPES) expect(sql).toContain(`'${t}'`);
  });

  it("leaves admin-authored announcement provenance alone", () => {
    // The backfill must be type-scoped. An unscoped UPDATE would erase the
    // acting admin from every announcement, which IS a legitimate reader.
    const update = sql.slice(sql.search(/UPDATE\s+public\.user_notifications/i));
    expect(update).toMatch(/WHERE\s+type\s+IN\s*\(/i);
  });

  it("keeps the public profile identifier the client actually navigates on", () => {
    expect(sql).toContain("requester_profile_id");
    expect(sql).toContain("addressee_profile_id");
  });
});

describe("P0-1A · the client stops asking for it", () => {
  const hud = read(HUD);

  it("reads user_notifications through a named column allow-list", () => {
    expect(hud).toContain("const NOTIFICATION_COLUMNS");
    expect(hud).toContain(".select(NOTIFICATION_COLUMNS)");
  });

  it("does not reference sent_by_user_id in code", () => {
    // Comments are stripped first: the allow-list constant is DOCUMENTED by a
    // comment that names the leaked column, and that prose is the record of
    // why the list exists. What must not survive is a code reference.
    const code = hud
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).not.toContain("sent_by_user_id");
  });

  it("no longer star-selects the notification table", () => {
    const star = /from\("user_notifications"\)\s*\n?\s*\.select\("\*"\)/;
    expect(hud).not.toMatch(star);
  });

  it("the allow-list carries every field the panel renders and nothing more", () => {
    const match = hud.match(/const NOTIFICATION_COLUMNS\s*=\s*\n?\s*"([^"]+)"/);
    expect(match).not.toBeNull();
    const columns = (match![1]).split(",").map(c => c.trim()).sort();
    expect(columns).toEqual([
      "action_url", "created_at", "id", "image_url", "message",
      "metadata", "profile_id", "target_type", "title", "type",
    ]);
  });
});
