// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = (name: string) => readFileSync(join(process.cwd(), "supabase/migrations", name), "utf8");
const VISITOR = "11111111-1111-4111-8111-111111111111";
const SESSION = "55555555-5555-4555-8555-555555555555";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LATE_VISITOR = "22222222-2222-4222-8222-222222222222";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, is_anonymous boolean NOT NULL DEFAULT false);
    CREATE TABLE public._ctx (uid uuid); INSERT INTO public._ctx VALUES (NULL);
    GRANT SELECT ON public._ctx TO anon, authenticated;
    CREATE TYPE public.app_role AS ENUM ('master_admin', 'admin', 'moderator');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT uid FROM public._ctx LIMIT 1 $$;
    CREATE FUNCTION public.has_role(uuid, public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.is_master_admin(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  `);
  await db.exec(sql("20260920120000_funnel1b1_analytics_foundation.sql"));
  await db.exec(sql("20260923120000_users1_traffic_classification.sql"));
  await db.exec(sql("20260926120000_users2_3b_session_intelligence.sql"));
  await db.exec(`
    INSERT INTO public.analytics_visitors (visitor_id) VALUES ('${VISITOR}');
    INSERT INTO public.analytics_sessions (session_id, visitor_id, frontend_release)
      VALUES ('${SESSION}', '${VISITOR}', '61673c53683f');
    INSERT INTO auth.users (id, is_anonymous) VALUES ('${USER}', false);
  `);
}, 120_000);

afterAll(async () => db?.close());

describe("USERS2.3B migration", () => {
  it("keeps browser boundaries separate from authoritative session ends", async () => {
    await db.query(`SELECT public.analytics_record_session_activity(
      '${SESSION}', '${VISITOR}', 5000, now(), NULL, 'page_hidden')`);
    await db.query(`SELECT public.analytics_record_session_activity(
      '${SESSION}', '${VISITOR}', 3000, now(), 'inactivity_timeout', NULL)`);
    const { rows } = await db.query<{
      active_ms: number;
      session_end_reason: string | null;
      last_browser_boundary: string | null;
    }>(
      `SELECT active_ms, session_end_reason, last_browser_boundary FROM public.analytics_sessions`,
    );
    expect(Number(rows[0].active_ms)).toBe(5000);
    expect(rows[0].session_end_reason).toBe("inactivity_timeout");
    expect(rows[0].last_browser_boundary).toBe("page_hidden");
  });

  it("derives the linked user from auth.uid and makes repeat observations idempotent", async () => {
    await db.exec(`UPDATE public._ctx SET uid = '${USER}'`);
    await db.query(`SELECT public.analytics_link_visitor_user('${VISITOR}')`);
    await db.query(`SELECT public.analytics_link_visitor_user('${VISITOR}')`);
    const { rows } = await db.query<{ user_id: string; observation_count: number }>(
      `SELECT user_id, observation_count FROM public.analytics_visitor_user_links`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(USER);
    expect(Number(rows[0].observation_count)).toBe(2);
  });

  it("returns false before first touch exists and succeeds on a later identity-link retry", async () => {
    await db.exec(`UPDATE public._ctx SET uid = '${USER}'`);
    const unavailable = await db.query<{ linked: boolean }>(
      `SELECT public.analytics_link_visitor_user('${LATE_VISITOR}') AS linked`,
    );
    expect(unavailable.rows[0].linked).toBe(false);

    await db.exec(`INSERT INTO public.analytics_visitors (visitor_id) VALUES ('${LATE_VISITOR}')`);
    const retried = await db.query<{ linked: boolean }>(
      `SELECT public.analytics_link_visitor_user('${LATE_VISITOR}') AS linked`,
    );
    expect(retried.rows[0].linked).toBe(true);
  });
});
