// @vitest-environment node
//
// PGlite loads its wasm build through fetch/Response; jsdom's shims break that,
// so this suite runs on the node environment. It touches no DOM.
/**
 * PT2E — profiles.custom_theme is authorized on the SERVER, and a profile
 * theme is actually visible on a profile.
 *
 * This suite does not grep the migration. It RUNS it, on a real Postgres
 * (PGlite — the same engine, compiled to wasm, plpgsql included), against a
 * fixture that reproduces only what the rule reads: the profiles columns, the
 * app_settings row, the PT1.4 entitlement functions, PT2C's shipped trigger
 * and frame decision, and stand-ins for `auth.uid()` and `has_role()` which
 * PGlite has no Supabase auth schema to provide.
 *
 * `baseline exploit` boots the trigger as production runs it TODAY (PT2C
 * applied, PT2E not) and shows the crafted write going through, so the rest of
 * the suite is a proof rather than a restatement of the code.
 *
 * The one thing PGlite cannot exercise is RLS as Supabase applies it (no roles,
 * no request JWT), so the cross-user case is asserted against the policy's own
 * scope term instead, and says so where it does.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FREE_PROFILE_THEMES,
  profileThemes,
  profileThemeRequiresPremium,
} from "@/lib/profile-themes";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const PT2C = join(MIGRATIONS, "20260910120000_pt2c_profile_frame_server_authority.sql");
const PT2E = join(MIGRATIONS, "20260911130000_pt2e_profile_theme_server_authority.sql");

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
    avatar_url text, profile_frame text, onboarding_completed boolean DEFAULT false,
    is_pro boolean DEFAULT false, diamonds int DEFAULT 0, boost_credits int DEFAULT 0,
    elo_shields int DEFAULT 0, reveals int DEFAULT 0, rewinds int DEFAULT 0,
    is_bot boolean DEFAULT false, is_disabled boolean DEFAULT false,
    is_anonymous boolean DEFAULT false, created_at timestamptz DEFAULT now(),
    is_flagged_underage boolean DEFAULT false, admin_notes text,
    ads_enabled boolean DEFAULT true, active_boost_until timestamptz,
    pro_grant_kind text, pro_grant_expires_at timestamptz, pro_grant_reason text,
    pro_grant_granted_at timestamptz, pro_grant_granted_by uuid,
    pro_offer text, pro_offer_acquired_at timestamptz, pro_offer_price_id text,
    stripe_customer_id text, stripe_subscription_id text, stripe_price_id text,
    stripe_billing_interval text, stripe_subscription_status text,
    stripe_current_period_end timestamptz
  );
  CREATE TABLE public.user_blocks (
    blocker_profile_id uuid, blocked_profile_id uuid
  );
  -- PT1.4, verbatim in effect: the canonical per-account rule the fix composes.
  CREATE FUNCTION public.pro_grant_is_valid(_kind text, _expires_at timestamptz)
    RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT _kind IS NOT NULL AND (_expires_at IS NULL OR _expires_at > now()) $$;
  CREATE FUNCTION public.pro_entitlement_is_effective(_stripe_pro boolean, _grant_kind text, _grant_expires_at timestamptz)
    RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT COALESCE(_stripe_pro,false) OR public.pro_grant_is_valid(_grant_kind,_grant_expires_at) $$;
  -- ADM2 Phase A's get_league_profiles, as production runs it before PT2E.
  CREATE FUNCTION public.get_league_profiles(_profile_ids uuid[])
  RETURNS TABLE (
    id uuid, display_name text, avatar_url text, profile_frame text,
    is_pro boolean, is_bot boolean, is_anonymous boolean,
    created_at timestamptz, is_disabled boolean
  ) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, p.display_name, p.avatar_url, p.profile_frame, p.is_pro,
           p.is_bot, p.is_anonymous, p.created_at, COALESCE(p.is_disabled,false)
    FROM public.profiles p
    WHERE auth.uid() IS NOT NULL AND p.id = ANY(_profile_ids)
    LIMIT 200;
  $$;
  -- The trigger exists before PT2C; each migration REPLACEs the function.
  CREATE FUNCTION public.protect_profile_premium_fields() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
  CREATE TRIGGER protect_profile_premium_fields_trg BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_premium_fields();
`;

/** Boot the fixture + PT2C. This is production TODAY. */
async function bootShipped(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(readFileSync(PT2C, "utf8"));
  return db;
}

/** Boot the fixture + PT2C + PT2E. This is production AFTER this change. */
async function boot(mutate?: (sql: string) => string): Promise<PGlite> {
  const db = await bootShipped();
  const sql = readFileSync(PT2E, "utf8");
  await db.exec(mutate ? mutate(sql) : sql);
  return db;
}

interface Seed {
  theme?: string | null;
  frame?: string | null;
  isPro?: boolean;
  grant?: string | null;
  grantExpires?: string | null;
  /** null = the app_settings row is ABSENT, which is the fail-closed case. */
  globalAccess?: boolean | null;
}

async function seed(db: PGlite, s: Seed = {}): Promise<string> {
  const {
    theme = "default", frame = "default", isPro = false,
    grant = null, grantExpires = null, globalAccess = false,
  } = s;
  await db.query(`DELETE FROM public.app_settings`);
  if (globalAccess !== null) {
    await db.query(`INSERT INTO public.app_settings VALUES ('global_premium_access', $1::jsonb)`, [
      JSON.stringify({ enabled: globalAccess }),
    ]);
  }
  await db.query(`DELETE FROM public.profiles`);
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.profiles
       (user_id, custom_theme, profile_frame, is_pro, pro_grant_kind, pro_grant_expires_at, status_message)
     VALUES ($1,$2,$3,$4,$5,$6,'original bio') RETURNING id`,
    [OWNER, theme, frame, isPro, grant, grantExpires],
  );
  return r.rows[0].id;
}

const actAs = (db: PGlite, uid: string | null, admin = false) =>
  db.query(`UPDATE public._ctx SET uid=$1, is_admin=$2`, [uid, admin]);

const themeOf = async (db: PGlite, id: string) =>
  (await db.query<{ custom_theme: string | null }>(
    `SELECT custom_theme FROM public.profiles WHERE id=$1`, [id])).rows[0].custom_theme;

const frameOf = async (db: PGlite, id: string) =>
  (await db.query<{ profile_frame: string | null }>(
    `SELECT profile_frame FROM public.profiles WHERE id=$1`, [id])).rows[0].profile_frame;

/** Assert the statement is refused, and refused for the RIGHT reason. */
async function expectRefused(fn: () => Promise<unknown>) {
  let caught: unknown = null;
  try { await fn(); } catch (e) { caught = e; }
  expect(caught, "the statement was NOT refused").not.toBeNull();
  expect(String((caught as Error).message)).toMatch(/requires Mogzy Premium/);
}

const setTheme = (db: PGlite, id: string, theme: string | null) =>
  db.query(`UPDATE public.profiles SET custom_theme=$2 WHERE id=$1`, [id, theme]);

// ───────────────────────────────────────────────────────── the exploit today

describe("PT2E — profile theme server authority", () => {
  describe("baseline exploit (PT2C applied, PT2E not — production today)", () => {
    let db: PGlite;
    beforeAll(async () => { db = await bootShipped(); });
    afterAll(async () => { await db.close(); });

    it("lets a Free user equip a Premium theme with a crafted write", async () => {
      const id = await seed(db, { isPro: false, globalAccess: false });
      await actAs(db, OWNER);
      // No UI involved: this is the PostgREST PATCH the picker's lock cannot reach.
      await setTheme(db, id, "royal");
      expect(await themeOf(db, id)).toBe("royal");
    });
  });

  // ─────────────────────────────────────────────── who may CHANGE a theme

  describe("acquisition is authorized", () => {
    let db: PGlite;
    beforeAll(async () => { db = await boot(); });
    afterAll(async () => { await db.close(); });

    it("refuses a Free user with Global Premium Access OFF", async () => {
      const id = await seed(db, { isPro: false, globalAccess: false });
      await actAs(db, OWNER);
      await expectRefused(() => setTheme(db, id, "royal"));
      expect(await themeOf(db, id)).toBe("default");
    });

    it("refuses a Free user when the app_settings row is ABSENT (fail closed)", async () => {
      const id = await seed(db, { isPro: false, globalAccess: null });
      await actAs(db, OWNER);
      await expectRefused(() => setTheme(db, id, "aurora"));
      expect(await themeOf(db, id)).toBe("default");
    });

    it("allows a Stripe Premium member", async () => {
      const id = await seed(db, { isPro: true, globalAccess: false });
      await actAs(db, OWNER);
      await setTheme(db, id, "royal");
      expect(await themeOf(db, id)).toBe("royal");
    });

    it("allows a valid manual/playtest grant", async () => {
      const id = await seed(db, { isPro: false, grant: "playtest", globalAccess: false });
      await actAs(db, OWNER);
      await setTheme(db, id, "cyberpunk");
      expect(await themeOf(db, id)).toBe("cyberpunk");
    });

    it("allows a grant with a future expiry, and refuses an expired one", async () => {
      const live = await seed(db, {
        isPro: false, grant: "manual",
        grantExpires: new Date(Date.now() + 86_400_000).toISOString(),
      });
      await actAs(db, OWNER);
      await setTheme(db, live, "aurora");
      expect(await themeOf(db, live)).toBe("aurora");

      const dead = await seed(db, {
        isPro: false, grant: "manual",
        grantExpires: new Date(Date.now() - 86_400_000).toISOString(),
      });
      await expectRefused(() => setTheme(db, dead, "aurora"));
      expect(await themeOf(db, dead)).toBe("default");
    });

    it("allows a Free user while Global Premium Access is ON", async () => {
      const id = await seed(db, { isPro: false, globalAccess: true });
      await actAs(db, OWNER);
      await setTheme(db, id, "sunset");
      expect(await themeOf(db, id)).toBe("sunset");
    });
  });

  // ────────────────────────────────────────── the stored value is never re-proved

  describe("permanence: the change is authorized, the stored value is not", () => {
    let db: PGlite;
    beforeAll(async () => { db = await boot(); });
    afterAll(async () => { await db.close(); });

    it("a retained Premium theme survives the loss of access", async () => {
      // Chosen legitimately while Premium, then the membership lapses.
      const id = await seed(db, { theme: "royal", isPro: false, globalAccess: false });
      await actAs(db, OWNER);
      // Every unrelated save must go through untouched...
      await db.query(`UPDATE public.profiles SET status_message='new bio' WHERE id=$1`, [id]);
      expect(await themeOf(db, id)).toBe("royal");
      // ...including the Profile page's payload, which always RESENDS the theme.
      await db.query(
        `UPDATE public.profiles SET status_message='newer bio', custom_theme=$2 WHERE id=$1`,
        [id, "royal"],
      );
      expect(await themeOf(db, id)).toBe("royal");
    });

    it("a lapsed member cannot switch a retained Premium theme to ANOTHER one", async () => {
      const id = await seed(db, { theme: "royal", isPro: false, globalAccess: false });
      await actAs(db, OWNER);
      await expectRefused(() => setTheme(db, id, "cyberpunk"));
      expect(await themeOf(db, id)).toBe("royal");
    });

    it("a lapsed member may always return to a free theme", async () => {
      const id = await seed(db, { theme: "royal", isPro: false, globalAccess: false });
      await actAs(db, OWNER);
      await setTheme(db, id, "default");
      expect(await themeOf(db, id)).toBe("default");
      // ...and having gone back, cannot climb out again.
      await expectRefused(() => setTheme(db, id, "royal"));
    });

    it("closing the Global Premium window writes nothing and reverts nothing", async () => {
      const id = await seed(db, { isPro: false, globalAccess: true });
      await actAs(db, OWNER);
      await setTheme(db, id, "mogged");
      await db.query(`UPDATE public.app_settings SET value='{"enabled":false}'::jsonb
                      WHERE key='global_premium_access'`);
      expect(await themeOf(db, id)).toBe("mogged");
      await expectRefused(() => setTheme(db, id, "water"));
      expect(await themeOf(db, id)).toBe("mogged");
    });
  });

  // ───────────────────────────────────────────────────── the free catalogue

  describe("the free list", () => {
    let db: PGlite;
    beforeAll(async () => { db = await boot(); });
    afterAll(async () => { await db.close(); });

    it("lets a Free user move freely among every free theme", async () => {
      const id = await seed(db, { isPro: false, globalAccess: false });
      await actAs(db, OWNER);
      for (const t of FREE_PROFILE_THEMES) {
        await setTheme(db, id, t);
        expect(await themeOf(db, id)).toBe(t);
      }
    });

    it("agrees with the client catalogue, theme for theme", async () => {
      for (const t of profileThemes) {
        const { rows } = await db.query<{ premium: boolean }>(
          `SELECT public.profile_theme_requires_premium($1) AS premium`, [t.id]);
        expect(rows[0].premium, `${t.id} disagrees between client and server`)
          .toBe(profileThemeRequiresPremium(t.id));
        // ...and with the catalogue's own isPro flag, the third statement of
        // the same fact that app_settings.theme_config used to contradict.
        expect(rows[0].premium, `${t.id}: isPro flag disagrees with the free list`)
          .toBe(t.isPro);
      }
    });

    it("treats NULL and empty as the absent theme, which is free", async () => {
      const id = await seed(db, { theme: "royal", isPro: false, globalAccess: false });
      await actAs(db, OWNER);
      await setTheme(db, id, null);
      expect(await themeOf(db, id)).toBeNull();
      await setTheme(db, id, "");
      expect(await themeOf(db, id)).toBe("");
    });

    it("fails closed on an id the catalogue does not know", async () => {
      const id = await seed(db, { isPro: false, globalAccess: false });
      await actAs(db, OWNER);
      await expectRefused(() => setTheme(db, id, "not-a-theme"));
      // Including the retired Cycle All theme, which PT2E deleted.
      await expectRefused(() => setTheme(db, id, "cycle"));
      expect(await themeOf(db, id)).toBe("default");
    });

    it("is case- and whitespace-insensitive, so casing is not a bypass", async () => {
      const id = await seed(db, { isPro: false, globalAccess: false });
      await actAs(db, OWNER);
      await setTheme(db, id, "  MIDNIGHT  ");
      expect(await themeOf(db, id)).toBe("  MIDNIGHT  ");
      await expectRefused(() => setTheme(db, id, "  ROYAL  "));
    });

    it("cannot be widened by an app_settings row (theme_config is inert)", async () => {
      const id = await seed(db, { isPro: false, globalAccess: false });
      await db.query(
        `INSERT INTO public.app_settings VALUES ('theme_config', $1::jsonb)`,
        [JSON.stringify({ free_themes: ["default", "royal", "cyberpunk", "aurora"] })],
      );
      await actAs(db, OWNER);
      await expectRefused(() => setTheme(db, id, "royal"));
      expect(await themeOf(db, id)).toBe("default");
    });
  });

  // ──────────────────────────────────────────────── onboarding is not a bypass

  describe("onboarding grants nothing", () => {
    let db: PGlite;
    beforeAll(async () => { db = await boot(); });
    afterAll(async () => { await db.close(); });

    it("completing onboarding cannot carry a Premium theme in with it", async () => {
      const id = await seed(db, { isPro: false, globalAccess: false });
      await actAs(db, OWNER);
      await expectRefused(() => db.query(
        `UPDATE public.profiles SET onboarding_completed=true, custom_theme='royal' WHERE id=$1`,
        [id],
      ));
      expect(await themeOf(db, id)).toBe("default");
    });

    it("completing onboarding without a theme still works", async () => {
      const id = await seed(db, { isPro: false, globalAccess: false });
      await actAs(db, OWNER);
      await db.query(
        `UPDATE public.profiles SET onboarding_completed=true WHERE id=$1`, [id]);
      expect(await themeOf(db, id)).toBe("default");
    });
  });

  // ────────────────────────────────────────────────────────── who is exempt

  describe("scope: self-service writes only", () => {
    let db: PGlite;
    beforeAll(async () => { db = await boot(); });
    afterAll(async () => { await db.close(); });

    it("exempts service-role / SECURITY DEFINER writes (no auth.uid())", async () => {
      const id = await seed(db, { isPro: false, globalAccess: false });
      await actAs(db, null);
      await setTheme(db, id, "royal");
      expect(await themeOf(db, id)).toBe("royal");
    });

    it("exempts an admin", async () => {
      const id = await seed(db, { isPro: false, globalAccess: false });
      await actAs(db, OWNER, true);
      await setTheme(db, id, "aurora");
      expect(await themeOf(db, id)).toBe("aurora");
    });

    it("does not fire for a row that is not the caller's own", async () => {
      // The rule is scoped `OLD.user_id = auth.uid()`. Admin bot profiles carry
      // a synthetic user_id that is never the acting admin's, so their
      // arbitrary theme strings keep working under their own authorization.
      // NOTE: RLS is what stops one USER reaching another user's row, and
      // PGlite cannot model Supabase RLS — this asserts the trigger's scope
      // term only, not the policy.
      const id = await seed(db, { isPro: false, globalAccess: false });
      await actAs(db, OTHER);
      await setTheme(db, id, "royal");
      expect(await themeOf(db, id)).toBe("royal");
    });
  });

  // ─────────────────────────────────────────────── PT2C must survive PT2E

  describe("PT2C's frame rule survives this replacement", () => {
    let db: PGlite;
    beforeAll(async () => { db = await boot(); });
    afterAll(async () => { await db.close(); });

    it("still refuses a Free user a Premium frame", async () => {
      const id = await seed(db, { isPro: false, globalAccess: false });
      await actAs(db, OWNER);
      await expectRefused(() =>
        db.query(`UPDATE public.profiles SET profile_frame='gold' WHERE id=$1`, [id]));
      expect(await frameOf(db, id)).toBe("default");
    });

    it("still lets a Premium member change frame", async () => {
      const id = await seed(db, { isPro: true, globalAccess: false });
      await actAs(db, OWNER);
      await db.query(`UPDATE public.profiles SET profile_frame='gold' WHERE id=$1`, [id]);
      expect(await frameOf(db, id)).toBe("gold");
    });

    it("still keeps a retained frame through an unrelated save", async () => {
      const id = await seed(db, { frame: "gold", isPro: false, globalAccess: false });
      await actAs(db, OWNER);
      await db.query(`UPDATE public.profiles SET status_message='x' WHERE id=$1`, [id]);
      expect(await frameOf(db, id)).toBe("gold");
    });

    it("refuses a frame and a theme grabbed in the SAME statement", async () => {
      const id = await seed(db, { isPro: false, globalAccess: false });
      await actAs(db, OWNER);
      await expectRefused(() => db.query(
        `UPDATE public.profiles SET profile_frame='gold', custom_theme='royal' WHERE id=$1`, [id]));
      expect(await frameOf(db, id)).toBe("default");
      expect(await themeOf(db, id)).toBe("default");
    });
  });

  // ────────────────────────────────────── a profile theme must be VISIBLE

  describe("the League profile contract publishes the theme", () => {
    let db: PGlite;
    beforeAll(async () => { db = await boot(); });
    afterAll(async () => { await db.close(); });

    it("returns custom_theme to another authenticated viewer", async () => {
      const id = await seed(db, { theme: "royal", isPro: true });
      await actAs(db, OTHER);
      const { rows } = await db.query<{ custom_theme: string | null }>(
        `SELECT custom_theme FROM public.get_league_profiles(ARRAY[$1]::uuid[])`, [id]);
      expect(rows).toHaveLength(1);
      expect(rows[0].custom_theme).toBe("royal");
    });

    it("still returns nothing to an unauthenticated caller", async () => {
      const id = await seed(db, { theme: "royal", isPro: true });
      await actAs(db, null);
      const { rows } = await db.query(
        `SELECT * FROM public.get_league_profiles(ARRAY[$1]::uuid[])`, [id]);
      expect(rows).toHaveLength(0);
    });

    it("still publishes no user_id", async () => {
      const id = await seed(db, { theme: "royal" });
      await actAs(db, OTHER);
      const { rows } = await db.query<Record<string, unknown>>(
        `SELECT * FROM public.get_league_profiles(ARRAY[$1]::uuid[])`, [id]);
      expect(Object.keys(rows[0])).not.toContain("user_id");
      expect(Object.keys(rows[0]).sort()).toEqual([
        "avatar_url", "created_at", "custom_theme", "display_name", "id",
        "is_anonymous", "is_bot", "is_disabled", "is_pro", "profile_frame",
      ]);
    });

    it("still filters a profile blocked in either direction", async () => {
      const them = await seed(db, { theme: "royal" });
      const { rows: mine } = await db.query<{ id: string }>(
        `INSERT INTO public.profiles (user_id, custom_theme) VALUES ($1,'default') RETURNING id`,
        [OTHER]);
      await db.query(`INSERT INTO public.user_blocks VALUES ($1,$2)`, [them, mine[0].id]);
      await actAs(db, OTHER);
      const { rows } = await db.query(
        `SELECT * FROM public.get_league_profiles(ARRAY[$1]::uuid[])`, [them]);
      expect(rows).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────── the migration's own fence

  describe("re-application is safe", () => {
    it("applying the migration a second time succeeds and changes no behaviour", async () => {
      const db = await boot();
      await db.exec(readFileSync(PT2E, "utf8"));
      const id = await seed(db, { isPro: false, globalAccess: false });
      await actAs(db, OWNER);
      await expectRefused(() => setTheme(db, id, "royal"));
      await db.close();
    });
  });

  describe("the fence catches its own removal", () => {
    /** Each mutation deletes real enforcement; the migration must then abort. */
    const mutations: [string, (s: string) => string][] = [
      ["deleting the theme check", (s) => s.replace(
        /\n    -- PT2E — and so must a CHANGE[\s\S]*?\n    END IF;\n  END IF;/,
        "\n  END IF;")],
      ["un-gating the theme check from a CHANGE", (s) => s.replace(
        "AND NEW.custom_theme IS DISTINCT FROM OLD.custom_theme", "AND true")],
      ["adding a clamp that destroys a retained theme", (s) => s.replace(
        "    NEW.is_pro := OLD.is_pro;",
        "    NEW.is_pro := OLD.is_pro;\n    NEW.custom_theme := OLD.custom_theme;")],
      ["dropping Global Premium Access from the decision", (s) => s.replace(
        "      OR public.global_premium_access()\n", "")],
      ["dropping the canonical entitlement rule from the decision", (s) => s.replace(
        /      OR public\.pro_entitlement_is_effective\(_stripe_pro, _grant_kind,\n\s+_grant_expires_at\)/,
        "      OR false")],
      ["dropping PT2C's frame check", (s) => s.replace(
        /    -- PT2C — a CHANGE of frame[\s\S]*?END IF;\n\n    -- PT2E/,
        "    -- PT2E")],
      ["dropping custom_theme from the League contract", (s) =>
        s.replace("  is_disabled   boolean,\n  custom_theme  text\n", "  is_disabled   boolean\n")
         .replace("         COALESCE(p.is_disabled, false),\n         p.custom_theme\n",
                  "         COALESCE(p.is_disabled, false)\n")],
      ["publishing user_id on the League contract", (s) =>
        s.replace("  custom_theme  text\n)", "  custom_theme  text,\n  user_id       uuid\n)")
         .replace("         p.custom_theme\n", "         p.custom_theme,\n         p.user_id\n")],
    ];

    for (const [label, mutate] of mutations) {
      it(`${label} aborts the migration`, async () => {
        const db = await bootShipped();
        let caught: unknown = null;
        try {
          await db.exec(mutate(readFileSync(PT2E, "utf8")));
        } catch (e) { caught = e; }
        expect(caught, `mutation "${label}" was NOT caught by the migration's assertions`)
          .not.toBeNull();
        await db.close();
      });
    }
  });
});
