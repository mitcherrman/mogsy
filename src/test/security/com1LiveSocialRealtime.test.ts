/**
 * COM1-2B — the realtime publication migration, read as source.
 *
 * This is a source-level contract test, the same shape as
 * com1SocialNotificationIdentity: it asserts what the migration COMMITS the
 * database to, because that is the half of this phase no unit test of the
 * frontend can reach.
 *
 * The two things that make this migration correct rather than merely present:
 *
 *  1. REPLICA IDENTITY FULL is set, and set BEFORE publication membership.
 *     Without it a DELETE carries only the primary key, realtime cannot prove
 *     the frame belongs to the subscriber, and unfriend / decline / cancel /
 *     block — the whole reason the phase exists — never arrive.
 *
 *  2. It changes NOTHING else. Publishing a table means realtime starts
 *     evaluating its RLS SELECT policy against subscribers; if the migration
 *     also edited a policy, the review of "does this disclose anything new"
 *     would be a review of two things at once.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const MIGRATION = "supabase/migrations/20260824120000_com1_live_social_realtime.sql";
const SOCIAL_TABLES = ["friendships", "user_blocks"];

describe("the social tables become subscribable", () => {
  const sql = read(MIGRATION);

  it("adds both tables to the supabase_realtime publication", () => {
    for (const t of SOCIAL_TABLES) {
      expect(sql).toContain(`ALTER PUBLICATION supabase_realtime ADD TABLE public.${t}`);
    }
  });

  it("sets REPLICA IDENTITY FULL on both, so a DELETE can be authorised", () => {
    for (const t of SOCIAL_TABLES) {
      expect(sql).toContain(`ALTER TABLE public.${t} REPLICA IDENTITY FULL`);
    }
  });

  it("sets replica identity BEFORE publishing, never after", () => {
    for (const t of SOCIAL_TABLES) {
      const identityAt = sql.indexOf(`ALTER TABLE public.${t} REPLICA IDENTITY FULL`);
      const publishAt = sql.indexOf(`ALTER PUBLICATION supabase_realtime ADD TABLE public.${t}`);
      expect(identityAt).toBeGreaterThan(-1);
      expect(publishAt).toBeGreaterThan(-1);
      // Publishing first would open a window in which a DELETE is replicated
      // with a key-only payload — silently unroutable, and invisible in review.
      expect(identityAt).toBeLessThan(publishAt);
    }
  });

  it("guards both ALTERs so re-running cannot abort the transaction", () => {
    // ALTER PUBLICATION ... ADD TABLE raises duplicate_object on a member.
    expect(sql).toContain("pg_publication_tables");
    expect(sql).toContain("relreplident");
  });
});

describe("the migration changes nothing but visibility plumbing", () => {
  const sql = read(MIGRATION);
  // Comment lines carry the policy text for reviewers; only executable SQL is
  // examined here.
  const executable = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("creates, alters or drops no policy", () => {
    expect(executable).not.toMatch(/\b(CREATE|ALTER|DROP)\s+POLICY\b/i);
  });

  it("creates or replaces no function, and touches no trigger", () => {
    expect(executable).not.toMatch(/\bCREATE\s+(OR\s+REPLACE\s+)?FUNCTION\b/i);
    expect(executable).not.toMatch(/\bCREATE\s+(OR\s+REPLACE\s+)?TRIGGER\b/i);
  });

  it("grants and revokes nothing", () => {
    expect(executable).not.toMatch(/\b(GRANT|REVOKE)\b/i);
  });

  it("writes no rows", () => {
    expect(executable).not.toMatch(/\b(INSERT|UPDATE|DELETE)\s+(INTO\s+|FROM\s+)?public\./i);
  });

  it("publishes only the two social tables and nothing else", () => {
    const published = [...executable.matchAll(/ADD TABLE public\.(\w+)/g)].map((m) => m[1]);
    expect(published.sort()).toEqual([...SOCIAL_TABLES].sort());
  });
});

describe("the client subscribes to exactly what was published", () => {
  const client = read("src/lib/community/social-realtime.ts");

  it("names no table the migration did not publish", () => {
    const tables = [...client.matchAll(/table:\s*"(\w+)"/g)].map((m) => m[1]);
    const distinct = [...new Set(tables)].sort();
    // user_notifications was already published, by 20260225115950.
    expect(distinct).toEqual(["friendships", "user_blocks", "user_notifications"]);
  });

  it("never subscribes to user_blocks by the BLOCKED side", () => {
    // `user_blocks` RLS is `is_profile_owner(blocker_profile_id)`: a subscriber
    // can only ever see blocks they created. Asking for the other direction
    // would be a silent no-op that reads, in review, like coverage.
    expect(client).not.toContain("blocked_profile_id=eq.");
  });
});
