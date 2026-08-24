/**
 * COM1-2 — the contract migration 20260823130000 must hold.
 *
 * These are SQL-text assertions, not database tests. They exist because every
 * guarantee below is a property of the migration as written, and the migration
 * is the artefact that gets applied to production. A regression here is
 * somebody editing the file, not a runtime condition — so reading the file is
 * the right instrument.
 *
 * What they defend:
 *   - discovery never publishes `profiles.user_id`
 *   - discovery is a lookup, not an enumeration (min length, hard row cap)
 *   - a block and a friend request on one pair cannot cross
 *   - block + unfriend is ONE transaction
 *   - unblock restores eligibility and nothing else
 *   - nothing here widens RLS on `public.profiles`
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION =
  "supabase/migrations/20260823130000_com1_community_reachability.sql";

const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

/** The whole `CREATE OR REPLACE FUNCTION public.<name>` block, prose included. */
function functionBody(name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `${name} is not defined in the migration`).toBeGreaterThan(-1);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION public.", start + 1);
  return sql.slice(start, next === -1 ? sql.length : next);
}

/**
 * Just the executable body, between `AS $$` and its terminator.
 *
 * Needed wherever an assertion COUNTS occurrences: the surrounding COMMENT ON
 * text says things like "Never returns profiles.user_id", and a naive count
 * over the whole block reads that sentence as a use of the column.
 */
function executableBody(name: string): string {
  const block = functionBody(name);
  const open = block.indexOf("AS $$");
  const close = block.indexOf("$$;", open);
  expect(open, `${name} has no $$ body`).toBeGreaterThan(-1);
  return block.slice(open + "AS $$".length, close === -1 ? block.length : close);
}

/**
 * The executable body with `--` comments removed.
 *
 * Required for any assertion that counts a KEYWORD: these functions carry long
 * explanatory comments that use the same words as the SQL ("LIKE", "user_id"),
 * and counting them makes the test fail on prose.
 */
function statementsOnly(name: string): string {
  return executableBody(name)
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

const ADDED = [
  "pair_lock_key",
  "enforce_friendship_rules",
  "search_league_profiles",
  "get_relationship_state",
  "get_blocked_profiles",
  "block_profile",
  "unblock_profile",
];

describe("COM1-2 · the migration defines what it claims to", () => {
  it("creates every function the header lists", () => {
    for (const fn of ADDED) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    }
  });

  it("adds no table, no column and no policy", () => {
    // The whole point of the SECURITY DEFINER approach: `public.profiles` stays
    // owner-only. A CREATE POLICY here would be the change that makes
    // `public_profiles` start publishing auth uids to anon (audit F.3).
    expect(sql).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bCREATE\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+POLICY\b/i);
  });

  it("grants every caller-facing function to authenticated only", () => {
    for (const fn of [
      "search_league_profiles",
      "get_relationship_state",
      "get_blocked_profiles",
      "block_profile",
      "unblock_profile",
    ]) {
      const grant = new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon;[\\s\\S]{0,200}?GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO authenticated;`,
      );
      expect(sql, `${fn} must be revoked from anon and granted to authenticated`).toMatch(grant);
    }
  });

  it("never grants the trigger function a direct call surface", () => {
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.enforce_friendship_rules() FROM PUBLIC, anon, authenticated;",
    );
  });
});

describe("COM1-2 · discovery withholds the auth identifier", () => {
  const search = functionBody("search_league_profiles");
  const blocked = functionBody("get_blocked_profiles");
  const state = functionBody("get_relationship_state");

  it("no returned column is user_id", () => {
    // The RETURNS TABLE clause is the contract. `user_id` appearing anywhere in
    // it would republish the exact identifier 20260730150000 withheld and
    // COM1-1 removed from the notification and Ranked surfaces.
    for (const [name, body] of [
      ["search_league_profiles", search],
      ["get_blocked_profiles", blocked],
    ] as const) {
      const returns = body.slice(body.indexOf("RETURNS TABLE"), body.indexOf("LANGUAGE"));
      expect(returns, `${name} returns user_id`).not.toMatch(/\buser_id\b/);
    }
  });

  it("reads user_id only to resolve the CALLER's own profile", () => {
    // `<alias>.user_id = auth.uid()` is the one legitimate use: finding the
    // caller. Any other reference in executable SQL would be a cross-user read.
    for (const fn of [
      "search_league_profiles",
      "get_blocked_profiles",
      "get_relationship_state",
      "block_profile",
      "unblock_profile",
    ]) {
      const body = executableBody(fn);
      const uses = body.match(/user_id/g) ?? [];
      const selfJoins = body.match(/user_id\s*=\s*auth\.uid\(\)/g) ?? [];
      expect(uses.length, `${fn} reads user_id for something other than auth.uid()`)
        .toBe(selfJoins.length);
    }
  });

  it("the relationship state envelope carries no identifier but the friendship row", () => {
    const keys = state.match(/jsonb_build_object\([^;]*?\)/gs) ?? [];
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(k).not.toMatch(/user_id/);
    }
  });
});

describe("COM1-2 · discovery is a lookup, not a directory", () => {
  const search = functionBody("search_league_profiles");

  it("refuses a query shorter than two normalised characters", () => {
    expect(search).toMatch(/length\(q\.needle\)\s*>=\s*2/);
  });

  it("caps rows server-side regardless of the requested limit", () => {
    // GREATEST(...,1) then LEAST(...,20): a caller asking for 5000 gets 20, a
    // caller asking for 0 or a negative gets 1.
    expect(search).toMatch(/LIMIT\s+LEAST\(GREATEST\(COALESCE\(_limit,\s*10\),\s*1\),\s*20\)/);
  });

  it("normalises through the AUTH3 authority rather than its own lower()", () => {
    // Search and "is this name taken" must agree. `normalize_display_name` is
    // the function the uniqueness index is built on.
    expect(search).toContain("public.normalize_display_name");
    expect(search).toContain("public.is_claimed_display_name");
  });

  it("treats LIKE metacharacters in a username literally", () => {
    // A search for "100%" must not become a wildcard, and "a_b" must not match
    // "axb". Both LIKEs declare ESCAPE '\' and the needle is escaped for it.
    const body = executableBody("search_league_profiles");
    // The needle escapes the escape character first, then the two LIKE
    // wildcards. Order matters: escaping '%' before '\\' would double-escape.
    expect(body).toContain("replace(public.normalize_display_name(_query), '\\', '\\\\')");
    expect(body).toContain("'%', '\\%'");
    expect(body).toContain("'_', '\\_'");
    // Every LIKE in the body must declare the escape character, or the
    // escaping above turns a backslash into a literal instead of an escape.
    const statements = statementsOnly("search_league_profiles");
    const likes = statements.match(/\bLIKE\b/g) ?? [];
    const escapes = statements.match(/ESCAPE '\\'/g) ?? [];
    expect(likes.length).toBeGreaterThanOrEqual(2);
    expect(escapes.length).toBe(likes.length);
  });

  it("excludes self, bots and disabled profiles", () => {
    expect(search).toMatch(/p\.id\s*<>\s*me\.id/);
    expect(search).toMatch(/COALESCE\(p\.is_bot,\s*false\)\s*=\s*false/);
    expect(search).toMatch(/COALESCE\(p\.is_disabled,\s*false\)\s*=\s*false/);
  });

  it("returns nothing at all to an unauthenticated caller", () => {
    // `me` is an INNER join, so no caller profile means no rows — the same
    // defence get_league_profiles uses.
    expect(search).toMatch(/auth\.uid\(\)\s+IS NOT NULL/);
    expect(search).toContain("JOIN me ON true");
  });
});

describe("COM1-2 · blocks are never disclosed", () => {
  const search = functionBody("search_league_profiles");
  const state = functionBody("get_relationship_state");

  it("search hides profiles that blocked the caller, and only those", () => {
    // The filter is one-directional on purpose: `b.blocker_profile_id = p.id`.
    // A symmetric filter would also hide the caller's OWN blocks, which is what
    // left the Blocked tab with no way to render a name.
    expect(search).toMatch(
      /NOT EXISTS \(\s*SELECT 1 FROM public\.user_blocks b\s*WHERE b\.blocker_profile_id = p\.id\s*AND b\.blocked_profile_id = me\.id\s*\)/,
    );
  });

  it("the only 'blocked' relationship search can report is one the caller created", () => {
    expect(search).toMatch(
      /SELECT 1 FROM public\.user_blocks b\s*WHERE b\.blocker_profile_id = me\.id\s*AND b\.blocked_profile_id = p\.id/,
    );
    expect(search).toMatch(/WHEN mine\.blocked THEN 'blocked'/);
  });

  it("get_relationship_state reports 'blocked' only for the caller's own block", () => {
    expect(state).toMatch(
      /b\.blocker_profile_id = _me\s*AND b\.blocked_profile_id = _target_profile_id/,
    );
    // There must be no branch that inspects a block in the other direction.
    expect(state).not.toMatch(/blocker_profile_id\s*=\s*_target_profile_id/);
  });

  it("get_blocked_profiles can only ever return the caller's own blocks", () => {
    const blocked = functionBody("get_blocked_profiles");
    expect(blocked).toMatch(/b\.blocker_profile_id = \(/);
    expect(blocked).not.toMatch(/b\.blocked_profile_id\s*=\s*\(\s*SELECT me\.id/);
  });

  it("the refusal message names no cause", () => {
    // The trigger's message is matched by the client classifier and never
    // shown; what the user sees is SEND_REQUEST_MESSAGES.refused. Both the
    // INSERT and the new accept-transition branch raise the SAME text, so
    // neither path can be distinguished by a user watching the UI.
    const trigger = functionBody("enforce_friendship_rules");
    const raises =
      trigger.match(/friend request refused: a block exists between these profiles/g) ?? [];
    expect(raises.length).toBe(2);
  });
});

/**
 * The trigger replacement, proved against the definition it actually replaces.
 *
 * WHY THIS SUITE EXISTS. The first draft of this migration was written against
 * the M2 text (20260730140000 §6) — but ADM2 (20260803120000 §4) had ALREADY
 * re-created the function, and ADM2 is what is live. The draft therefore
 * silently dropped ADM2's `_admin_self_link` exemption, which would have made
 * `admin_link_friendship` raise check_violation on every call and broken
 * "Add to My Friends" and bot auto-friending outright.
 *
 * So this suite does not hard-code a baseline. It FINDS the newest migration
 * before this one that defines the function and proves the replacement is that
 * definition plus additions only. The next person to touch this function gets
 * the same protection without having to know this story.
 */
describe("COM1-2 · enforce_friendship_rules is the LIVE definition plus additions", () => {
  const MIGRATIONS_DIR = "supabase/migrations";
  const SIGNATURE = "CREATE OR REPLACE FUNCTION public.enforce_friendship_rules()";

  /** Executable lines only: `--` comments and blanks removed. */
  function triggerLines(file: string): string[] {
    const text = readFileSync(resolve(process.cwd(), MIGRATIONS_DIR, file), "utf8");
    const i = text.indexOf(SIGNATURE);
    if (i === -1) return [];
    const j = text.indexOf("\n$$;", i);
    return text
      .slice(i, j)
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("--"));
  }

  /** Every migration that defines the function, oldest first (names sort by date). */
  const definers = readdirSync(resolve(process.cwd(), MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => triggerLines(f).length > 0);

  const OURS = "20260823130000_com1_community_reachability.sql";

  it("this migration is the newest definition of the function", () => {
    expect(definers[definers.length - 1]).toBe(OURS);
  });

  it("more than one prior definition exists — the baseline is NOT the oldest", () => {
    // The trap that produced the bug: M2 is the first definer and the obvious
    // one to diff against. It is not the live one.
    expect(definers.length).toBeGreaterThanOrEqual(3);
    expect(definers[0]).toContain("friendship_hardening");
  });

  it("preserves every executable line of the live definition, in order", () => {
    const live = triggerLines(definers[definers.length - 2]);
    const ours = triggerLines(OURS);
    expect(live.length).toBeGreaterThan(0);

    // Subsequence walk: every live line must still be present, in the same
    // relative order. A deleted or edited line breaks the walk and names itself.
    let k = 0;
    for (const line of live) {
      const at = ours.indexOf(line, k);
      expect(at, `live line dropped or reordered: ${line}`).toBeGreaterThan(-1);
      k = at + 1;
    }
  });

  it("adds ONLY the advisory lock and the accept-transition block test", () => {
    const live = triggerLines(definers[definers.length - 2]);
    const ours = triggerLines(OURS);

    // Walk again, collecting what is extra.
    const added: string[] = [];
    let k = 0;
    for (const line of live) {
      const at = ours.indexOf(line, k);
      added.push(...ours.slice(k, at));
      k = at + 1;
    }
    added.push(...ours.slice(k));

    expect(added.join(" ")).toContain("pg_advisory_xact_lock");
    expect(added.join(" ")).toContain("public.pair_lock_key(NEW.requester_id, NEW.addressee_id)");
    expect(added.join(" ")).toContain("NEW.status = 'accepted'");
    expect(added.join(" ")).toContain("OLD.status = 'pending'");
    // Nothing else. If a future edit smuggles a rule change in alongside the
    // lock, it shows up here as an unexpected added line.
    const unexpected = added.filter(
      (l) =>
        !/pg_advisory_xact_lock|pair_lock_key|NEW\.status = 'accepted'|OLD\.status = 'pending'|is_blocked_between|RAISE EXCEPTION 'friend request refused|USING ERRCODE = 'check_violation'|^\);$|^\)$|^IF |^END IF;$|^AND /.test(l),
    );
    expect(unexpected, `unexpected additions: ${JSON.stringify(unexpected)}`).toEqual([]);
  });

  it("keeps the ADM2 master-admin self-link exemption intact, all three conditions", () => {
    // Without this, admin_link_friendship cannot insert its accepted row and
    // "Add to My Friends" raises check_violation on every call — including the
    // copy of that button on the new Community · Users tab.
    const body = functionBody("enforce_friendship_rules");
    expect(body).toContain("_admin_self_link boolean;");
    expect(body).toMatch(/_admin_self_link :=\s*\n\s*NEW\.status = 'accepted'/);
    expect(body).toContain("public.is_master_admin(auth.uid())");
    expect(body).toMatch(
      /NEW\.requester_id = \(\s*\n\s*SELECT p\.id FROM public\.profiles p WHERE p\.user_id = auth\.uid\(\)/,
    );
    // The status gate still honours it...
    expect(body).toContain("IF NEW.status IS DISTINCT FROM 'pending' AND NOT _admin_self_link THEN");
    // ...and the rate limits still skip it.
    expect(body).toContain("IF NOT _admin_self_link THEN");
  });

  it("keeps the block gate UNCONDITIONAL — the admin path is not exempt from it", () => {
    const body = statementsOnly("enforce_friendship_rules");
    const gate = body.indexOf("IF public.is_blocked_between(NEW.requester_id, NEW.addressee_id) THEN");
    const skip = body.indexOf("IF NOT _admin_self_link THEN");
    expect(gate).toBeGreaterThan(-1);
    // The block test must sit BEFORE the rate-limit skip block, i.e. outside it.
    expect(gate).toBeLessThan(skip);
  });

  it("takes the pair lock on EVERY insert path, including the admin self-link", () => {
    const body = statementsOnly("enforce_friendship_rules");
    const lock = body.indexOf("pg_advisory_xact_lock");
    const skip = body.indexOf("IF NOT _admin_self_link THEN");
    // Same reasoning: the lock is outside the exemption branch, so an admin
    // link and a concurrent block on that pair still serialise.
    expect(lock).toBeLessThan(skip);
  });

  it("changes no exception message and no ERRCODE", () => {
    const live = triggerLines(definers[definers.length - 2]);
    const ours = triggerLines(OURS);
    const messages = (lines: string[]) =>
      lines.filter((l) => l.startsWith("RAISE EXCEPTION")).sort();
    const liveMsgs = messages(live);
    const ourMsgs = messages(ours);
    // The frontend classifier matches on this exact vocabulary
    // (TRIGGER_VOCABULARY in lib/community/social-result.ts). Changing a word
    // would silently downgrade a mapped code to `unavailable`.
    for (const m of liveMsgs) expect(ourMsgs).toContain(m);
    // The one addition re-raises an EXISTING message rather than inventing one.
    expect(new Set(ourMsgs).size).toBe(new Set(liveMsgs).size);
  });

  it("keeps 'declined' in the legal-transition set", () => {
    // Nothing writes it, but removing it here would be an unrelated behaviour
    // change smuggled in with the lock. Retiring it is P3-3, a separate call.
    expect(statementsOnly("enforce_friendship_rules")).toContain(
      "NEW.status IN ('accepted', 'declined')",
    );
  });
});

describe("COM1-2 · a request and a block on one pair cannot cross", () => {
  const trigger = functionBody("enforce_friendship_rules");
  const block = functionBody("block_profile");
  const key = functionBody("pair_lock_key");

  it("the lock key is order-independent", () => {
    // A friendship stored B->A and a block created A->B must hash to the same
    // lock, or the two writers serialise on nothing.
    expect(key).toMatch(/least\(_a, _b\)::text \|\| ':' \|\| greatest\(_a, _b\)::text/);
  });

  it("the trigger takes the pair lock BEFORE it tests for a block", () => {
    const lockAt = trigger.indexOf("pg_advisory_xact_lock");
    const testAt = trigger.indexOf("public.is_blocked_between(NEW.requester_id");
    expect(lockAt).toBeGreaterThan(-1);
    expect(testAt).toBeGreaterThan(lockAt);
  });

  it("block_profile takes the same lock before it writes", () => {
    const lockAt = block.indexOf("pg_advisory_xact_lock(public.pair_lock_key(_me, _target_profile_id))");
    const insertAt = block.indexOf("INSERT INTO public.user_blocks");
    expect(lockAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(lockAt);
  });

  it("a pending request cannot be accepted across a block", () => {
    expect(trigger).toMatch(
      /NEW\.status = 'accepted'\s*AND OLD\.status = 'pending'\s*AND public\.is_blocked_between/,
    );
  });

  it("keeps every rule the 20260730140000 trigger already enforced", () => {
    for (const rule of [
      "a new friendship must start as pending",
      "friend request rate limit exceeded (max 10 per hour)",
      "too many open friend requests (max 20 outstanding)",
      "friendship parties are immutable",
      "illegal friendship transition",
    ]) {
      expect(trigger).toContain(rule);
    }
  });
});

describe("COM1-2 · block is atomic, unblock restores nothing", () => {
  const block = functionBody("block_profile");
  const unblock = functionBody("unblock_profile");

  it("block records the block and removes the friendship in one function", () => {
    expect(block).toContain("INSERT INTO public.user_blocks");
    expect(block).toContain("DELETE FROM public.friendships");
  });

  it("the unfriend is direction-agnostic and status-agnostic", () => {
    // Accepted friendships, requests sent and requests received all go: a
    // pending row left behind is exactly the "still actionable" state.
    const del = block.slice(block.indexOf("DELETE FROM public.friendships"));
    expect(del).toMatch(/least\(f\.requester_id, f\.addressee_id\)/);
    expect(del).toMatch(/greatest\(f\.requester_id, f\.addressee_id\)/);
    expect(del.slice(0, del.indexOf(";"))).not.toMatch(/status/);
  });

  it("self-block is impossible", () => {
    expect(block).toMatch(/_target_profile_id = _me[\s\S]{0,120}'self'/);
  });

  it("blocking twice is idempotent and still reported as success", () => {
    expect(block).toContain("ON CONFLICT (blocker_profile_id, blocked_profile_id) DO NOTHING");
    expect(block).toMatch(/'ok',\s*true,\s*'code',\s*CASE WHEN _inserted > 0 THEN 'blocked' ELSE 'already' END/);
  });

  it("unblock touches user_blocks and NOTHING else", () => {
    expect(unblock).toContain("DELETE FROM public.user_blocks");
    // The one assertion that matters here: no friendship is written back.
    expect(unblock).not.toMatch(/friendships/i);
  });

  it("unblocking someone who is not blocked is not an error", () => {
    expect(unblock).toMatch(/'ok',\s*true,\s*'code',\s*CASE WHEN _removed > 0 THEN 'unblocked' ELSE 'already' END/);
  });
});
