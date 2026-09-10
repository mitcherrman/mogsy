// @vitest-environment node
//
// PGlite loads its wasm build through fetch/Response; jsdom's shims break that,
// so this suite runs on the node environment. It touches no DOM.
/**
 * PT2C — profiles.profile_frame is authorized on the SERVER.
 *
 * This suite does not grep the migration. It RUNS it, on a real Postgres
 * (PGlite — the same engine, compiled to wasm, plpgsql included), against a
 * fixture that reproduces only what the rule actually reads: the profiles
 * columns, the app_settings row, the PT1.4 entitlement functions, and
 * stand-ins for `auth.uid()` and `has_role()` which PGlite has no Supabase
 * auth schema to provide.
 *
 * That distinction matters here. The gap being closed was invisible to every
 * text-level fence in the repo precisely because it was an ABSENCE — nothing
 * in any migration mentioned profile_frame, so nothing could be asserted about
 * it. `baseline exploit` below reconstructs the shipped PT1.5 trigger and shows
 * the crafted write going through, which is what makes the rest of the suite a
 * proof rather than a restatement of the code.
 *
 * The one thing PGlite cannot exercise is RLS as Supabase applies it (no roles,
 * no request JWT), so the cross-user case is asserted against the live policy
 * text instead, and says so where it does.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const PT2C = join(MIGRATIONS, "20260910120000_pt2c_profile_frame_server_authority.sql");

const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

/** Everything the rule reads, and nothing else. */
const FIXTURE = `
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE SCHEMA auth;
  CREATE TABLE public._ctx (uid uuid, is_admin boolean);
  INSERT INTO public._ctx VALUES (NULL, false);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT uid FROM public._ctx LIMIT 1 $$;
  CREATE FUNCTION public.has_role(_uid uuid, _role text) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT COALESCE((SELECT is_admin FROM public._ctx LIMIT 1), false) $$;
  CREATE TABLE public.app_settings (key text PRIMARY KEY, value jsonb NOT NULL);
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    display_name text, status_message text, custom_theme text,
    profile_frame text,
    is_pro boolean DEFAULT false, diamonds int DEFAULT 0, boost_credits int DEFAULT 0,
    elo_shields int DEFAULT 0, reveals int DEFAULT 0, rewinds int DEFAULT 0,
    is_bot boolean DEFAULT false, is_disabled boolean DEFAULT false,
    is_flagged_underage boolean DEFAULT false, admin_notes text,
    ads_enabled boolean DEFAULT true, active_boost_until timestamptz,
    pro_grant_kind text, pro_grant_expires_at timestamptz, pro_grant_reason text,
    pro_grant_granted_at timestamptz, pro_grant_granted_by uuid,
    pro_offer text, pro_offer_acquired_at timestamptz, pro_offer_price_id text,
    stripe_customer_id text, stripe_subscription_id text, stripe_price_id text,
    stripe_billing_interval text, stripe_subscription_status text,
    stripe_current_period_end timestamptz
  );
  -- PT1.4, verbatim in effect: the canonical per-account rule the fix composes.
  CREATE FUNCTION public.pro_grant_is_valid(_kind text, _expires_at timestamptz)
    RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT _kind IS NOT NULL AND (_expires_at IS NULL OR _expires_at > now()) $$;
  CREATE FUNCTION public.pro_entitlement_is_effective(_stripe_pro boolean, _grant_kind text, _grant_expires_at timestamptz)
    RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT COALESCE(_stripe_pro,false) OR public.pro_grant_is_valid(_grant_kind,_grant_expires_at) $$;
  -- The trigger exists before PT2C; PT2C REPLACEs the function it calls.
  CREATE FUNCTION public.protect_profile_premium_fields() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
  CREATE TRIGGER protect_profile_premium_fields_trg BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_premium_fields();
`;

async function boot(mutate?: (sql: string) => string): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FIXTURE);
  const sql = readFileSync(PT2C, "utf8");
  await db.exec(mutate ? mutate(sql) : sql);
  return db;
}

interface Seed {
  frame?: string | null;
  isPro?: boolean;
  grant?: string | null;
  grantExpires?: string | null;
  /** null = the app_settings row is ABSENT, which is the fail-closed case. */
  globalAccess?: boolean | null;
}

async function seed(db: PGlite, s: Seed = {}): Promise<string> {
  const { frame = "default", isPro = false, grant = null, grantExpires = null, globalAccess = false } = s;
  await db.query(`DELETE FROM public.app_settings`);
  if (globalAccess !== null) {
    await db.query(`INSERT INTO public.app_settings VALUES ('global_premium_access', $1::jsonb)`, [
      JSON.stringify({ enabled: globalAccess }),
    ]);
  }
  await db.query(`DELETE FROM public.profiles`);
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.profiles (user_id, profile_frame, is_pro, pro_grant_kind, pro_grant_expires_at, status_message)
     VALUES ($1,$2,$3,$4,$5,'original bio') RETURNING id`,
    [OWNER, frame, isPro, grant, grantExpires],
  );
  return r.rows[0].id;
}

const actAs = (db: PGlite, uid: string | null, admin = false) =>
  db.query(`UPDATE public._ctx SET uid=$1, is_admin=$2`, [uid, admin]);

const frameOf = async (db: PGlite, id: string) =>
  (await db.query<{ profile_frame: string | null }>(
    `SELECT profile_frame FROM public.profiles WHERE id=$1`, [id])).rows[0].profile_frame;

/** Assert the statement is refused, and refused for the RIGHT reason. */
async function expectRefused(db: PGlite, sql: string, params: unknown[]) {
  await expect(db.query(sql, params)).rejects.toThrow(/requires Mogzy Premium/);
}

describe("PT2C — profile_frame server authority", () => {
  let db: PGlite;
  beforeAll(async () => { db = await boot(); });
  afterAll(async () => { await db?.close(); });

  describe("the exploit, and that it is now refused", () => {
    it("BASELINE: on the shipped PT1.5 trigger a Free user's crafted write SUCCEEDS", async () => {
      // Strip PT2C's enforcement and the assertions that guard it: what remains
      // is exactly the trigger production runs today.
      const before = await boot((s) =>
        s.replace(/    -- PT2C[\s\S]*?END IF;\n/, "")
         .replace(/IF _def NOT ILIKE '%may_equip_profile_frame%'[\s\S]*?END IF;\n/, "")
         .replace(/  -- The permanence fence[\s\S]*?END IF;\n/, "")
         .replace(/  -- \.\.\. and it must never clamp[\s\S]*?END IF;\n/, ""));
      const id = await seed(before, { frame: "default", globalAccess: false });
      await actAs(before, OWNER);
      await before.query(`UPDATE public.profiles SET profile_frame='gold' WHERE id=$1`, [id]);
      expect(await frameOf(before, id)).toBe("gold");
      await before.close();
    });

    it("1. Free + global OFF: default -> a Premium frame is REJECTED", async () => {
      const id = await seed(db, { frame: "default", globalAccess: false });
      await actAs(db, OWNER);
      await expectRefused(db, `UPDATE public.profiles SET profile_frame='gold' WHERE id=$1`, [id]);
      expect(await frameOf(db, id)).toBe("default");
    });
  });

  describe("who may newly acquire a frame", () => {
    it("2. paid Premium (is_pro) + global OFF: ALLOWED", async () => {
      const id = await seed(db, { frame: "default", isPro: true, globalAccess: false });
      await actAs(db, OWNER);
      await db.query(`UPDATE public.profiles SET profile_frame='gold' WHERE id=$1`, [id]);
      expect(await frameOf(db, id)).toBe("gold");
    });

    it("3a. a manual grant with no expiry + global OFF: ALLOWED", async () => {
      const id = await seed(db, { frame: "default", grant: "manual", globalAccess: false });
      await actAs(db, OWNER);
      await db.query(`UPDATE public.profiles SET profile_frame='neon' WHERE id=$1`, [id]);
      expect(await frameOf(db, id)).toBe("neon");
    });

    it("3b. a playtest grant still in force + global OFF: ALLOWED", async () => {
      const id = await seed(db, {
        frame: "default", grant: "playtest", grantExpires: "2099-01-01T00:00:00Z", globalAccess: false });
      await actAs(db, OWNER);
      await db.query(`UPDATE public.profiles SET profile_frame='fire' WHERE id=$1`, [id]);
      expect(await frameOf(db, id)).toBe("fire");
    });

    it("3c. an EXPIRED grant is not entitlement: REJECTED", async () => {
      const id = await seed(db, {
        frame: "default", grant: "playtest", grantExpires: "2020-01-01T00:00:00Z", globalAccess: false });
      await actAs(db, OWNER);
      await expectRefused(db, `UPDATE public.profiles SET profile_frame='fire' WHERE id=$1`, [id]);
    });

    it("4. Free + global Premium access ON: ALLOWED, the same selection a member could make", async () => {
      const id = await seed(db, { frame: "default", globalAccess: true });
      await actAs(db, OWNER);
      await db.query(`UPDATE public.profiles SET profile_frame='gold' WHERE id=$1`, [id]);
      expect(await frameOf(db, id)).toBe("gold");
    });

    it("7. leaving a Premium frame for the default is always ALLOWED", async () => {
      const id = await seed(db, { frame: "gold", globalAccess: false });
      await actAs(db, OWNER);
      await db.query(`UPDATE public.profiles SET profile_frame='default' WHERE id=$1`, [id]);
      expect(await frameOf(db, id)).toBe("default");
    });

    it("12. an unknown, crafted frame string is fail-closed for a Free user", async () => {
      const id = await seed(db, { frame: "default", globalAccess: false });
      await actAs(db, OWNER);
      await expectRefused(db, `UPDATE public.profiles SET profile_frame=$2 WHERE id=$1`,
        [id, "<img onerror=alert(1)>"]);
    });

    it("12b. clearing the frame is free", async () => {
      const id = await seed(db, { frame: "gold", globalAccess: false });
      await actAs(db, OWNER);
      await db.query(`UPDATE public.profiles SET profile_frame=NULL WHERE id=$1`, [id]);
      expect(await frameOf(db, id)).toBeNull();
    });
  });

  describe("permanence — an already-stored frame is never re-authorized", () => {
    it("5. Free + global OFF + stored Premium frame: an unrelated save SUCCEEDS and the frame survives", async () => {
      const id = await seed(db, { frame: "gold", globalAccess: false });
      await actAs(db, OWNER);
      await db.query(
        `UPDATE public.profiles SET status_message='new bio', custom_theme='midnight' WHERE id=$1`, [id]);
      expect(await frameOf(db, id)).toBe("gold");
    });

    it("5b. a save that re-sends the SAME stored Premium frame also succeeds", async () => {
      // Profile.tsx's save payload always includes profile_frame, seeded from
      // the row. That is not an acquisition and must not be treated as one.
      const id = await seed(db, { frame: "gold", globalAccess: false });
      await actAs(db, OWNER);
      await db.query(
        `UPDATE public.profiles SET status_message='x', profile_frame='gold' WHERE id=$1`, [id]);
      expect(await frameOf(db, id)).toBe("gold");
    });

    it("6. ...but SWITCHING to a different Premium frame is REJECTED, and the stored one survives", async () => {
      const id = await seed(db, { frame: "gold", globalAccess: false });
      await actAs(db, OWNER);
      await expectRefused(db, `UPDATE public.profiles SET profile_frame='neon' WHERE id=$1`, [id]);
      expect(await frameOf(db, id)).toBe("gold");
    });

    it("6b. ...and is ALLOWED when current entitlement permits it", async () => {
      const id = await seed(db, { frame: "gold", isPro: true, globalAccess: false });
      await actAs(db, OWNER);
      await db.query(`UPDATE public.profiles SET profile_frame='neon' WHERE id=$1`, [id]);
      expect(await frameOf(db, id)).toBe("neon");
    });

    it("11b. closing the global window reverts nothing, then or later", async () => {
      const id = await seed(db, { frame: "default", globalAccess: true });
      await actAs(db, OWNER);
      await db.query(`UPDATE public.profiles SET profile_frame='gold' WHERE id=$1`, [id]);
      await db.query(
        `UPDATE public.app_settings SET value='{"enabled":false}'::jsonb WHERE key='global_premium_access'`);
      expect((await db.query<{ g: boolean }>(`SELECT public.global_premium_access() g`)).rows[0].g).toBe(false);
      expect(await frameOf(db, id)).toBe("gold");
      await db.query(`UPDATE public.profiles SET status_message='later edit' WHERE id=$1`, [id]);
      expect(await frameOf(db, id)).toBe("gold");
    });
  });

  describe("everything else the trigger governs is unchanged", () => {
    it("9. an admin editing their own profile is unaffected", async () => {
      const id = await seed(db, { frame: "default", globalAccess: false });
      await actAs(db, OWNER, true);
      await db.query(`UPDATE public.profiles SET profile_frame='diamond' WHERE id=$1`, [id]);
      expect(await frameOf(db, id)).toBe("diamond");
    });

    it("9b. an admin editing a bot row (a foreign user_id) may still set any frame string", async () => {
      await db.query(`DELETE FROM public.profiles`);
      const r = await db.query<{ id: string }>(
        `INSERT INTO public.profiles (user_id, profile_frame, is_bot)
         VALUES (gen_random_uuid(),'default',true) RETURNING id`);
      await actAs(db, OWNER, true);
      await db.query(`UPDATE public.profiles SET profile_frame='bot-only-frame' WHERE id=$1`, [r.rows[0].id]);
      expect(await frameOf(db, r.rows[0].id)).toBe("bot-only-frame");
    });

    it("9c. a service-role write (auth.uid() IS NULL) is unaffected", async () => {
      const id = await seed(db, { frame: "default", globalAccess: false });
      await actAs(db, null);
      await db.query(`UPDATE public.profiles SET profile_frame='gold' WHERE id=$1`, [id]);
      expect(await frameOf(db, id)).toBe("gold");
    });

    it("10. no Stripe, subscription, offer or grant column is touched by a frame write", async () => {
      const id = await seed(db, { frame: "default", globalAccess: true });
      await db.query(
        `UPDATE public.profiles SET stripe_customer_id='cus_X', stripe_subscription_id='sub_X',
           stripe_subscription_status='active', stripe_price_id='price_X', pro_offer='founding',
           pro_grant_kind='manual' WHERE id=$1`, [id]);
      const cols = ["stripe_customer_id", "stripe_subscription_id", "stripe_subscription_status",
                    "stripe_price_id", "pro_offer", "pro_grant_kind", "is_pro"] as const;
      const read = async () =>
        (await db.query<Record<string, unknown>>(`SELECT * FROM public.profiles WHERE id=$1`, [id])).rows[0];
      const before = await read();
      await actAs(db, OWNER);
      await db.query(`UPDATE public.profiles SET profile_frame='gold' WHERE id=$1`, [id]);
      const after = await read();
      for (const c of cols) expect(after[c]).toEqual(before[c]);
      expect(after.profile_frame).toBe("gold");
    });

    it("10b. the pre-existing paid-column clamp still holds", async () => {
      const id = await seed(db, { frame: "default", globalAccess: false });
      await actAs(db, OWNER);
      await db.query(`UPDATE public.profiles SET is_pro=true, diamonds=9999 WHERE id=$1`, [id]);
      const r = (await db.query<{ is_pro: boolean; diamonds: number }>(
        `SELECT is_pro, diamonds FROM public.profiles WHERE id=$1`, [id])).rows[0];
      expect(r.is_pro).toBe(false);
      expect(r.diamonds).toBe(0);
    });

    it("11. Global Premium Access fails CLOSED when its row is absent", async () => {
      const id = await seed(db, { frame: "default", globalAccess: null });
      expect((await db.query<{ g: boolean }>(`SELECT public.global_premium_access() g`)).rows[0].g).toBe(false);
      await actAs(db, OWNER);
      await expectRefused(db, `UPDATE public.profiles SET profile_frame='gold' WHERE id=$1`, [id]);
    });
  });

  describe("8. another user's frame", () => {
    it("is barred by RLS, which is where cross-user writes have always been barred", () => {
      // PGlite runs no Supabase RLS, so this is asserted against the live policy
      // text rather than executed. PT2C deliberately does not restate the
      // ownership check: the UPDATE policy's USING clause is the one that
      // decides whose row may be written at all, and it is untouched here.
      const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
      const last = files.filter((f) =>
        readFileSync(join(MIGRATIONS, f), "utf8").includes(`CREATE POLICY "Users can update own profile"`)).pop();
      expect(last).toBeTruthy();
      const sql = readFileSync(join(MIGRATIONS, last!), "utf8");
      expect(sql).toMatch(/CREATE POLICY "Users can update own profile"[\s\S]*USING \(auth\.uid\(\) = user_id\)/);
      // And PT2C neither drops nor recreates any policy.
      const pt2c = readFileSync(PT2C, "utf8");
      expect(pt2c).not.toMatch(/DROP POLICY/i);
      expect(pt2c).not.toMatch(/CREATE POLICY/i);
      // Its own scoping term is self-service only, so it can never widen one.
      expect(pt2c).toMatch(/OLD\.user_id = auth\.uid\(\)/);
    });
  });

  describe("re-application is safe", () => {
    // PT2C's SQL was applied to production directly, so the repo migration will
    // meet an already-enforcing database whenever a migration runner next walks
    // history. Every statement is CREATE OR REPLACE and the assertions read
    // pg_get_functiondef, so a second application is a no-op that still passes
    // its own checks — proved here by actually doing it twice rather than by
    // reading the DDL and asserting the intent.
    it("applying the migration a second time succeeds and changes no behaviour", async () => {
      const twice = await boot();
      await twice.exec(readFileSync(PT2C, "utf8"));

      const id = await seed(twice, { frame: "gold", globalAccess: false });
      await actAs(twice, OWNER);
      // permanence still holds
      await twice.query(`UPDATE public.profiles SET status_message='after re-apply' WHERE id=$1`, [id]);
      expect(await frameOf(twice, id)).toBe("gold");
      // and the refusal still holds
      await expect(
        twice.query(`UPDATE public.profiles SET profile_frame='neon' WHERE id=$1`, [id]),
      ).rejects.toThrow(/requires Mogzy Premium/);
      await twice.close();
    });

    it("contains no destructive or non-idempotent DDL", () => {
      const sql = readFileSync(PT2C, "utf8");
      expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|POLICY|TRIGGER|FUNCTION)/i);
      expect(sql).not.toMatch(/ALTER\s+TABLE/i);
      expect(sql).not.toMatch(/\b(DELETE|TRUNCATE)\b/i);
      // Every function it defines is REPLACE-able, and it creates no trigger of
      // its own — it replaces the body of the one that already exists.
      const creates = sql.match(/CREATE\s+(OR REPLACE\s+)?FUNCTION/gi) ?? [];
      expect(creates.length).toBeGreaterThan(0);
      for (const c of creates) expect(c).toMatch(/OR REPLACE/i);
      expect(sql).not.toMatch(/CREATE\s+TRIGGER/i);
    });
  });

  describe("the fence catches its own removal", () => {
    const abortsWith = async (mutate: (s: string) => string, pattern: RegExp) => {
      await expect(boot(mutate)).rejects.toThrow(pattern);
    };

    it("deleting the check aborts the migration", () =>
      abortsWith((s) => s.replace(/    -- PT2C[\s\S]*?END IF;\n/, ""), /authorization check is missing/));

    it("re-introducing the PT1.13B clamp aborts the migration", () =>
      abortsWith((s) => s.replace("    -- PT2C — a CHANGE of frame",
        "    NEW.profile_frame := OLD.profile_frame;\n    -- PT2C — a CHANGE of frame"),
        /profile_frame is being overwritten/));

    it("un-gating the check from a CHANGE aborts the migration", () =>
      abortsWith((s) => s.replace("NEW.profile_frame IS DISTINCT FROM OLD.profile_frame", "true"),
        /not gated on a change/));

    it("dropping Global Premium Access from the decision aborts the migration", () =>
      abortsWith((s) => s.replace("      OR public.global_premium_access()\n", ""),
        /Global Premium Access is not consulted/));
  });
});
