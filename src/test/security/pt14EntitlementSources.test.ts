import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * PT1.4 — contract tests over the entitlement migration and the Stripe writers.
 *
 * These assert the *shape of authority*, which no runtime test in this repo can
 * reach (Supabase is managed by Lovable and not run locally):
 *
 *   1. Stripe code writes only the Stripe-derived half (is_pro).
 *   2. Non-Stripe grants live in pro_grant_* and are protected from
 *      self-service writes.
 *   3. Effective Pro is composed in exactly one place.
 */
const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const FUNCTIONS = join(process.cwd(), "supabase/functions");

const migration = readFileSync(
  join(MIGRATIONS, "20260903120000_pt1_4_entitlement_sources.sql"),
  "utf8"
);
const inviteMigration = readFileSync(
  join(MIGRATIONS, "20260903130000_pt1_4_invite_promo_grant.sql"),
  "utf8"
);
/** The live body of redeem_invite_link, i.e. the last CREATE OR REPLACE of it. */
const inviteFn = inviteMigration.slice(
  inviteMigration.indexOf("CREATE OR REPLACE FUNCTION public.redeem_invite_link"),
  inviteMigration.indexOf("-- The function is recreated")
);
const readFn = (name: string) => readFileSync(join(FUNCTIONS, name, "index.ts"), "utf8");

/** Entitlement columns an edge function actually writes (ignoring comments). */
const writtenColumns = (src: string): string[] => {
  const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const found = new Set<string>();
  for (const m of code.matchAll(/\b(is_pro|pro_grant_\w+)\s*:/g)) found.add(m[1]);
  return [...found].sort();
};

describe("PT1.4 migration", () => {
  it("adds the grant columns", () => {
    for (const col of [
      "pro_grant_kind", "pro_grant_expires_at", "pro_grant_reason",
      "pro_grant_granted_at", "pro_grant_granted_by",
    ]) {
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS ${col}`);
    }
  });

  it("composes effective Pro in one function", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.pro_entitlement_is_effective/);
    expect(migration).toMatch(/COALESCE\(_stripe_pro, false\)\s*\n?\s*OR public\.pro_grant_is_valid/);
  });

  it("treats a NULL expiry on a real grant as permanent, and a past expiry as over", () => {
    expect(migration).toContain(
      "SELECT _kind IS NOT NULL AND (_expires_at IS NULL OR _expires_at > now());"
    );
  });

  it("exposes the resolver only to authenticated callers, scoped to auth.uid()", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.my_pro_entitlement\(\)/);
    // No user-id argument: it cannot be pointed at another account.
    expect(migration).toMatch(/my_pro_entitlement\(\)\s*\nRETURNS TABLE/);
    expect(migration).toContain("WHERE p.user_id = auth.uid()");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION public.my_pro_entitlement() FROM public, anon;");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.my_pro_entitlement() TO authenticated;");
  });

  it("gates the grant writer on the admin role", () => {
    expect(migration).toMatch(
      /IF _caller IS NULL OR NOT public\.has_role\(_caller, 'admin'\) THEN\s*\n\s*RAISE EXCEPTION/
    );
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.admin_set_pro_grant(uuid, text, timestamptz, text) FROM public, anon;"
    );
  });

  it("never lets the admin grant path write is_pro", () => {
    const rpcBody = migration.slice(
      migration.indexOf("FUNCTION public.admin_set_pro_grant"),
      migration.indexOf("-- 5. Protect the grant columns")
    );
    expect(rpcBody).not.toMatch(/\bis_pro\s*=/);
  });

  it("clamps every grant column for non-admin authenticated writers", () => {
    for (const col of [
      "pro_grant_kind", "pro_grant_expires_at", "pro_grant_reason",
      "pro_grant_granted_at", "pro_grant_granted_by",
    ]) {
      expect(migration).toContain(`NEW.${col} := OLD.${col};`);
    }
    // ...while leaving service-role / SECURITY DEFINER writes unclamped, or the
    // Stripe webhook and redeem-gift would be silently reverted (ADM2 Phase A).
    expect(migration).toContain("IF auth.uid() IS NOT NULL AND NOT has_role(auth.uid(), 'admin') THEN");
  });

  it("carries the ADM2 protections forward rather than dropping them", () => {
    for (const col of [
      "is_pro", "diamonds", "boost_credits", "elo_shields", "reveals", "rewinds",
      "is_bot", "is_disabled", "is_flagged_underage", "admin_notes", "ads_enabled",
      "active_boost_until",
    ]) {
      expect(migration).toContain(`NEW.${col} := OLD.${col};`);
    }
  });
});

describe("Stripe writers own only the Stripe half", () => {
  it("check-subscription writes is_pro and nothing else about entitlement", () => {
    const src = readFn("check-subscription");
    expect(src).toContain("update({ is_pro: hasActiveSub })");
    expect(writtenColumns(src)).toEqual(["is_pro"]);
  });

  it("stripe-webhook writes is_pro and never touches a grant", () => {
    const src = readFn("stripe-webhook");
    expect(src).toContain("update({ is_pro: isPro })");
    expect(writtenColumns(src)).toEqual(["is_pro"]);
    // Signature verification and idempotent event handling stay intact.
    expect(src).toContain("constructEventAsync");
    expect(src).toContain('["active", "trialing"].includes(subscription.status)');
  });
});

describe("gift redemption is a grant, not a Stripe write", () => {
  const src = readFn("redeem-gift");

  it("no longer sets is_pro", () => {
    expect(src).not.toMatch(/update\(\{\s*is_pro/);
  });

  it("records a gift grant with a real expiry", () => {
    expect(src).toContain('pro_grant_kind: "gift"');
    expect(src).toContain("pro_grant_expires_at");
    expect(src).toContain("days * 86400000");
  });
});

describe("the invite path is a promo grant, not a Stripe write", () => {
  it("no longer writes is_pro", () => {
    expect(inviteFn).not.toMatch(/\bis_pro\s*=[^=]/);
  });

  it("grants permanent promo Pro, preserving the historical no-expiry semantics", () => {
    // invite_links has no Pro-duration column; its expires_at bounds the CODE,
    // not the grant. Nothing ever expired an invite-granted Pro, so a NULL
    // expiry is the faithful conversion — no expiration is invented.
    expect(inviteFn).toMatch(/apply_pro_grant\(\s*\n?\s*_profile_id,\s*\n?\s*'promo',\s*\n?\s*NULL,/);
  });

  it("keeps its authorization model", () => {
    expect(inviteFn).toContain("IF auth.uid() IS NULL THEN");
    expect(inviteFn).toContain("IF auth.uid() != _user_id THEN");
    expect(inviteMigration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.redeem_invite_link(text, uuid) FROM anon, public;"
    );
    expect(inviteMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.redeem_invite_link(text, uuid) TO authenticated;"
    );
  });

  it("keeps its calling and return contract", () => {
    // Same signature, so src/pages/Auth.tsx and the generated types still bind.
    expect(inviteFn).toMatch(/redeem_invite_link\(\s*\n?\s*_code text,\s*\n?\s*_user_id uuid\s*\n?\)/);
    expect(inviteFn).toContain("RETURNS jsonb");
    for (const key of ["grant_admin", "grant_moderator", "grant_pro"]) {
      expect(inviteFn).toContain(`'${key}', COALESCE(_invite.${key}, false)`);
    }
    for (const reason of [
      "invalid_code", "expired", "max_uses_reached", "already_redeemed", "no_profile",
    ]) {
      expect(inviteFn).toContain(`'reason', '${reason}'`);
    }
  });

  it("keeps every non-Pro grant it always applied", () => {
    for (const col of [
      "grant_diamonds", "grant_boost_credits", "grant_elo_shields",
      "grant_reveals", "grant_rewinds",
    ]) {
      expect(inviteFn).toContain(`COALESCE(_invite.${col}, 0)`);
    }
    expect(inviteFn).toContain("INSERT INTO user_roles (user_id, role)");
    expect(inviteFn).toContain("INSERT INTO invite_redemptions");
    expect(inviteFn).toContain("UPDATE invite_links SET times_used");
  });
});

describe("collision: an automatic grant never weakens a stronger one", () => {
  const helper = inviteMigration.slice(
    inviteMigration.indexOf("CREATE OR REPLACE FUNCTION public.apply_pro_grant"),
    inviteMigration.indexOf("REVOKE EXECUTE ON FUNCTION public.apply_pro_grant")
  );

  it("leaves an existing permanent grant alone", () => {
    // e.g. an admin playtester comp; overwriting would change no access but
    // would destroy its reason / granted_by provenance.
    expect(helper).toContain("IF _existing_expires IS NULL THEN");
    expect(helper).toMatch(/IF _existing_expires IS NULL THEN[\s\S]{0,200}?RETURN false;/);
  });

  it("leaves an existing grant that outlasts the incoming one alone", () => {
    expect(helper).toContain("IF _expires_at IS NOT NULL AND _expires_at <= _existing_expires THEN");
  });

  it("only defers to a grant that is still valid", () => {
    expect(helper).toContain("IF public.pro_grant_is_valid(_existing_kind, _existing_expires) THEN");
  });

  it("never touches is_pro, so an active Stripe subscription is unaffected", () => {
    expect(helper).not.toMatch(/\bis_pro\b/);
  });

  it("is not callable by any client role", () => {
    expect(inviteMigration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.apply_pro_grant(uuid, text, timestamptz, text) FROM public, anon, authenticated;"
    );
  });
});

describe("writer invariant: every executable is_pro write is Stripe-owned", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
    );

  it("only the two Stripe edge functions write is_pro at runtime", () => {
    const writers = walk(FUNCTIONS)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /\bis_pro\s*:/.test(
        readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
      ))
      .map((f) => f.replace(FUNCTIONS + "/", ""));
    expect(writers.sort()).toEqual([
      "check-subscription/index.ts",
      "stripe-webhook/index.ts",
    ]);
  });

  it("no frontend code writes is_pro", () => {
    const writers = walk(join(process.cwd(), "src"))
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => !f.includes("/integrations/supabase/types.ts"))
      .filter((f) => {
        const code = readFileSync(f, "utf8")
          .replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
        // An is_pro key inside an update()/insert() payload.
        return /(update|insert)\(\{[^}]*\bis_pro\b/s.test(code);
      });
    expect(writers).toEqual([]);
  });

  it("the only SQL function that still assigns is_pro is the protection trigger", () => {
    const offenders: string[] = [];
    for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql"))) {
      const sql = readFileSync(join(MIGRATIONS, f), "utf8");
      for (const line of sql.split("\n")) {
        if (line.trimStart().startsWith("--")) continue;          // historical commentary
        if (/NEW\.is_pro\s*:=\s*OLD\.is_pro/.test(line)) continue; // the clamp, not a grant
        if (/\bis_pro\s*=[^=]/.test(line) && !/\bp\.is_pro\b/.test(line)) {
          offenders.push(`${f}: ${line.trim()}`);
        }
      }
    }
    // 20260402173928 is HISTORICAL text: migrations are immutable, and
    // 20260903130000 CREATE OR REPLACEs that function without the is_pro write,
    // so the live definition carries none.
    expect(offenders).toEqual([
      "20260402173928_9dce7aa8-053d-4ad5-ba29-12970a118ca9.sql: is_pro = CASE WHEN COALESCE(_invite.grant_pro, false) THEN true ELSE is_pro END,",
    ]);
    expect(inviteMigration).toContain("CREATE OR REPLACE FUNCTION public.redeem_invite_link");
  });
});

/**
 * Classification of every remaining `is_pro` mention outside admin components,
 * the entitlement lib, generated types and tests. Three legitimate kinds:
 *
 *  a) SELF READS that pair is_pro with the grant columns and resolve through
 *     isEffectivePro() — correct.
 *  b) BACKEND-SERVED payload fields named is_pro, which now carry *effective*
 *     Pro from services/pro_status.py — correct, and renaming them is a
 *     separate API change.
 *  c) CROSS-USER DISPLAY of another account's Stripe flag (public profile
 *     badges). Grants are not exposed cross-user, so a comped playtester wears
 *     no public Pro badge. Cosmetic only, gates nothing. Known limitation.
 *  d) COMMENTS.
 */
const CLASSIFIED = [
  "src/components/blog/data-blocks/ProfileCardBlock.tsx",  // (c) blog profile badge
  "src/hooks/blog/useBlogData.ts",                  // (c) blog profile select
  "src/hooks/useFriends.ts",                        // (c) friend list badge
  "src/hooks/useSitewideTheme.tsx",                 // (d) comment
  "src/lib/admin-auth/AdminAuthProvider.tsx",       // (d) comment
  "src/lib/admin-csv-export.ts",                    // (a) admin export count
  "src/lib/admin-data-sources.ts",                  // (a) admin Pro count
  "src/lib/combat-lab/api.ts",                      // (b) backend credit status
  "src/lib/combat-lab/team-sim/contract.ts",        // (b) backend contract type
  "src/lib/community/discovery.ts",                 // (c) discovery card badge
  "src/lib/league-profiles.ts",                     // (c) league profile badge
  "src/lib/pro/checkout.ts",                        // (d) comment
  "src/lib/quiz/api.ts",                            // (b) backend entitlement type
  "src/pages/CombatLab.tsx",                        // (b) backend credit status
  "src/pages/LolPremium.tsx",                       // (b) backend entitlement + comment
  "src/pages/Play.tsx",                             // (a) self read
  "src/pages/Shop.tsx",                             // (a) self read
  "src/pages/Swipe.tsx",                            // (a) self read + (c) card badges
  "src/pages/SwipePreset.tsx",                      // (a) self read
  "src/pages/UserProfile.tsx",                      // (c) public profile badge
  "src/pages/dev/lobby-preview/lobbyPreviewFixtures.ts",   // dev fixture
  "src/pages/dev/play-scroll/PlayScrollPreviewPage.tsx",   // dev fixture
  "src/pages/dev/team-sim/testHarness.tsx",                // dev harness
].sort();

describe("no product surface gates on the raw Stripe column", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
    );

  it("only admin tooling, the entitlement lib and tests mention is_pro", () => {
    const offenders = walk(join(process.cwd(), "src"))
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => !/\.test\.tsx?$/.test(f))
      .filter((f) => !f.includes("/components/admin/"))
      .filter((f) => !f.includes("/lib/pro/entitlement.ts"))
      .filter((f) => !f.includes("/integrations/supabase/types.ts"))
      .filter((f) => !f.includes("/test/"))
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        // `is_pro` as an entitlement read. Display-only social payloads that
        // merely carry the field through are matched too, deliberately: any new
        // one should be reviewed against this rule.
        return /\bis_pro\b/.test(src);
      })
      .map((f) => f.replace(process.cwd() + "/", ""))
      .sort();

    // Every remaining mention is classified. Anything new fails this test and
    // must be classified deliberately rather than drifting back to the bug.
    expect(offenders).toEqual(CLASSIFIED);
  });
});
