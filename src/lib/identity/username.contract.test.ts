/**
 * AUTH3 — the client policy and the database policy are ONE policy.
 *
 * The whole design rests on the client's rules being the same rules the
 * database will apply. When they drift, the failure is silent and it lands on
 * a user: a name the form accepted is refused by a server that will only say
 * "invalid", or — worse — a name the form refused is one the database would
 * happily have given them.
 *
 * So the SQL is read, not transcribed, the way academy-registration.schema
 * .test.ts reads the rank CHECK. Anyone editing either side has to edit this
 * file too, and that is the point.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { USERNAME_MAX, USERNAME_MIN, isReservedUsername } from "./username";

const MIGRATION = "20260822120000_auth3_canonical_username.sql";

const sql = readFileSync(
  resolve(__dirname, "../../../supabase/migrations", MIGRATION),
  "utf8",
);

describe("the bounds match on both sides", () => {
  it("uses the same minimum", () => {
    expect(sql).toMatch(
      new RegExp(`char_length\\(cleaned\\) < ${USERNAME_MIN} THEN RETURN 'too_short'`),
    );
  });

  it("uses the same maximum", () => {
    expect(sql).toMatch(
      new RegExp(`char_length\\(cleaned\\) > ${USERNAME_MAX} THEN RETURN 'too_long'`),
    );
  });

  it("stays inside the table's own CHECK (<= 50), which is unchanged", () => {
    expect(USERNAME_MAX).toBeLessThanOrEqual(50);
    expect(sql).not.toMatch(/profiles_display_name_length/);
  });
});

describe("the character rule matches on both sides", () => {
  it("is an allow-list of letters, digits, spaces and . _ ' -", () => {
    // POSIX [[:alnum:]] is locale-aware in a UTF-8 database, which is what
    // makes it the server-side equivalent of the client's \p{L}\p{N}.
    expect(sql).toContain("cleaned !~ '^[[:alnum:] ._''-]+$' THEN RETURN 'invalid_characters'");
  });
});

describe("the reserved list matches on both sides", () => {
  const reservedInSql = Array.from(
    sql
      .slice(sql.indexOf("IN (\n           'admin'"), sql.indexOf("         );"))
      .matchAll(/'([a-z]+)'/g),
  ).map((m) => m[1]);

  it("names the same words", () => {
    expect(reservedInSql.length).toBeGreaterThan(0);
    for (const word of reservedInSql) {
      expect(isReservedUsername(word)).toBe(true);
    }
  });

  it("stays small - AUTH3 is not building name moderation", () => {
    expect(reservedInSql.length).toBeLessThanOrEqual(10);
  });

  it("blocks the generated placeholder pattern, not the word Anonymous", () => {
    expect(sql).toContain("~ '^anonymous[0-9]+$'");
    expect(isReservedUsername("Anonymous")).toBe(false);
  });
});

describe("normalisation matches on both sides", () => {
  it("collapses whitespace and trims before comparing", () => {
    expect(sql).toContain("btrim(regexp_replace(COALESCE(_name, ''), '\\s+', ' ', 'g'))");
  });

  it("compares case-insensitively but stores the chosen capitalisation", () => {
    expect(sql).toMatch(/normalize_display_name[\s\S]*?SELECT lower\(btrim/);
    // The write is of `cleaned` — the trimmed DISPLAY form — never of the
    // lower-cased comparison form.
    expect(sql).toContain("UPDATE public.profiles SET display_name = cleaned");
  });
});

describe("the database is the authority, not the client", () => {
  it("checks uniqueness inside the function that writes", () => {
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.set_display_name"));
    expect(fn).toContain("'taken'");
    expect(fn).toContain("UPDATE public.profiles SET display_name = cleaned");
    expect(fn.indexOf("'taken'")).toBeLessThan(
      fn.indexOf("UPDATE public.profiles SET display_name = cleaned"),
    );
  });

  it("runs elevated, because RLS hides the rows uniqueness is about", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.set_display_name[\s\S]*?SECURITY DEFINER/,
    );
  });

  it("can only ever write the caller's own row", () => {
    const fn = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.set_display_name"),
      sql.indexOf("REVOKE EXECUTE ON FUNCTION public.set_display_name"),
    );
    expect(fn).toContain("uid       uuid := auth.uid()");
    expect(fn).toContain("WHERE user_id = uid");
    // No target-user parameter exists, so no caller can name someone else.
    expect(fn).not.toMatch(/_target_user_id|_user_id\s+uuid/);
  });

  it("is closed to anon and open to authenticated - guests choose names too", () => {
    expect(sql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.set_display_name(text, boolean) FROM anon, public;",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.set_display_name(text, boolean) TO authenticated;",
    );
  });

  it("survives a lost race by reporting the same friendly outcome", () => {
    expect(sql).toMatch(/WHEN unique_violation THEN[\s\S]{0,400}'taken'/);
  });
});

describe("the migration cannot abort a deploy", () => {
  it("attempts the unique index without letting duplicate data fail the run", () => {
    expect(sql).toContain("enforce_display_name_uniqueness()");
    expect(sql).toMatch(/RAISE WARNING[\s\S]{0,400}uniqueness index NOT installed/);
  });

  it("leaves the trigger unable to refuse a signup over a name", () => {
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.handle_new_user"));
    // A taken or invalid name degrades to '' — it never raises, because a
    // trigger on auth.users that raises fails the signup itself.
    expect(fn).toContain("wanted := '';");
    expect(fn).not.toMatch(/RAISE (EXCEPTION|ERROR)/);
  });

  it("stops minting colliding anonymous placeholders", () => {
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.handle_new_user"));
    // The old generator counted anonymous profiles, which goes DOWN on purge
    // and races two concurrent sign-ins onto one name.
    expect(fn).not.toMatch(/COUNT\(\*\) \+ 1/i);
    expect(fn).toContain("EXIT WHEN NOT EXISTS");
    // Bounded, so a saturated namespace cannot spin forever.
    expect(fn).toContain("IF attempt >= 12 THEN");
  });
});

describe("nothing existing is rewritten", () => {
  it("never renames, deletes or backfills a display_name", () => {
    // Every display_name write in this migration is the ONE in
    // set_display_name(), and it writes the caller's own chosen name. No
    // backfill, no de-duplication pass, no placeholder cleanup: an account
    // sitting on a duplicate today keeps it until its owner renames.
    const writes = Array.from(sql.matchAll(/SET display_name\s*=\s*(\S+)/g)).map((m) => m[1]);
    expect(writes).toEqual(["cleaned"]);
    expect(sql).not.toMatch(/DELETE FROM public\.profiles/);
  });
});
