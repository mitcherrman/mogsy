/**
 * The rank column and the rank vocabulary are ONE contract (HI1-C5B).
 *
 * `profiles.league_rank` carries a CHECK constraint listing the twelve accepted
 * tier ids, and `LEAGUE_RANKS` is the list the register offers. A value added
 * to one and not the other is a write that passes every frontend check and then
 * fails at the database, on a first-run screen, for the visitor who happened to
 * pick the new option. Nothing else in the repo would catch that, so this reads
 * the migration the way recordSwipeResult.idempotency.test.ts reads the vote
 * RPC: the SQL is the source, transcribed nowhere.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { LEAGUE_RANKS } from "./academy-registration";

const MIGRATION = "20260821120000_academy_self_reported_rank.sql";

const sql = readFileSync(
  resolve(__dirname, "../../../supabase/migrations", MIGRATION),
  "utf8",
);

describe("the self-reported rank migration", () => {
  it("adds both columns idempotently", () => {
    // `IF NOT EXISTS` is not decoration: these migrations are replayed against
    // environments that may already carry the column.
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS league_rank text/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS league_rank_reported_at timestamptz/);
  });

  it("accepts exactly the twelve ids the register offers, and no others", () => {
    const check = sql.slice(sql.indexOf("league_rank IN ("), sql.indexOf("      );"));
    const quoted = Array.from(check.matchAll(/'([a-z]+)'/g)).map((m) => m[1]);
    expect(quoted.sort()).toEqual(LEAGUE_RANKS.map((r) => r.id).sort());
  });

  it("keeps NULL legal — an account that has never been asked", () => {
    // Every account that exists today is in this state, and nothing is
    // backfilled, so a NOT NULL column would have failed the migration itself.
    expect(sql).toMatch(/league_rank IS NULL OR league_rank IN/);
    expect(sql).not.toMatch(/league_rank text NOT NULL/);
  });

  it("guards the constraint so a replay cannot fail on it", () => {
    expect(sql).toMatch(/SELECT 1 FROM pg_constraint WHERE conname = 'profiles_league_rank_check'/);
  });

  it("touches nothing but the two new columns", () => {
    // No RLS change is needed — "Users can update own profile" already scopes
    // an account to its own row — and a first-run feature has no business
    // rewriting policies, dropping anything, or backfilling live rows.
    expect(sql).not.toMatch(/DROP\s+(TABLE|POLICY|COLUMN|CONSTRAINT)/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/^\s*UPDATE public\.profiles/im);
  });

  it("documents both columns, including that the rank is unverified", () => {
    expect(sql).toMatch(/COMMENT ON COLUMN public\.profiles\.league_rank IS/);
    expect(sql).toMatch(/COMMENT ON COLUMN public\.profiles\.league_rank_reported_at IS/);
    expect(sql).toMatch(/SELF-REPORTED/);
  });
});
