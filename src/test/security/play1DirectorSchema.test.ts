// @vitest-environment node
//
// PGlite loads its wasm build through fetch/Response; jsdom's shims break that,
// so this suite runs on the node environment. It touches no DOM.
/**
 * PLAY1 — the Playtest Director schema, RLS and RPCs, RUN on a real Postgres
 * (PGlite) rather than grepped. The fixture supplies only what Supabase would:
 * the anon/authenticated roles with their default table privileges, auth.users,
 * the app_role enum, a profiles table, the supabase_realtime publication, and
 * stand-ins for auth.uid() and has_role(). Each case runs under `SET ROLE
 * authenticated` (or anon), so RLS and grants apply exactly as they would to a
 * browser.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join as joinPath } from "node:path";

const MIGRATION = readFileSync(
  joinPath(process.cwd(), "supabase/migrations/20260927120000_play1_director_foundation.sql"),
  "utf8",
);

const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TESTER_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TESTER_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ANON = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const VISITOR = "11111111-1111-4111-8111-111111111111";
const SESSION = "55555555-5555-4555-8555-555555555555";

const FIXTURE = `
  CREATE ROLE anon; CREATE ROLE authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, is_anonymous boolean NOT NULL DEFAULT false);
  CREATE TYPE public.app_role AS ENUM ('master_admin', 'admin', 'moderator');
  CREATE TABLE public._ctx (uid uuid, is_admin boolean);
  INSERT INTO public._ctx VALUES (NULL, false);
  GRANT SELECT ON public._ctx TO anon, authenticated;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT uid FROM public._ctx LIMIT 1 $$;
  CREATE FUNCTION public.has_role(_uid uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT COALESCE((SELECT is_admin FROM public._ctx LIMIT 1), false) $$;
  CREATE TABLE public.profiles (user_id uuid, display_name text);
  CREATE PUBLICATION supabase_realtime;
`;

let db: PGlite;

async function as<T>(
  who: { uid: string | null; admin?: boolean; role?: "authenticated" | "anon" },
  work: () => Promise<T>,
): Promise<T> {
  await db.exec(
    `UPDATE public._ctx SET uid = ${who.uid ? `'${who.uid}'::uuid` : "NULL"},
       is_admin = ${who.admin ? "true" : "false"};`,
  );
  await db.exec(`SET ROLE ${who.role ?? "authenticated"};`);
  try {
    return await work();
  } finally {
    await db.exec("RESET ROLE;");
  }
}

async function rejected(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the database to reject this");
}

type Cohort = { id: string; invite_slug: string };
type Join = { cohort_id: string; enrollment_id: string; created: boolean; answered_prompt_keys: string[] };
type Advance = { applied: boolean; scene_id: string; build_step: number; revision: string | number };

let cohort: Cohort;

const createCohort = (name = "PLAY1 cohort") =>
  as({ uid: ADMIN, admin: true }, async () => {
    const { rows } = await db.query<Cohort>(
      `SELECT id, invite_slug FROM public.playtest_create_cohort($1, 'play1_placeholder', 1, 'welcome')`,
      [name],
    );
    return rows[0];
  });

const enroll = (uid: string, slug: string) =>
  as({ uid }, async () => {
    const { rows } = await db.query<{ j: Join }>(
      `SELECT public.playtest_join($1, $2::uuid, $3::uuid) AS j`,
      [slug, VISITOR, SESSION],
    );
    return rows[0].j;
  });

const advance = (who: { uid: string; admin?: boolean }, expected: number, scene: string, build: number) =>
  as(who, async () => {
    const { rows } = await db.query<Advance>(
      `SELECT * FROM public.playtest_director_advance($1, $2, $3, $4)`,
      [cohort.id, expected, scene, build],
    );
    return rows[0];
  });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(MIGRATION);
  await db.exec(`
    INSERT INTO auth.users (id, is_anonymous) VALUES
      ('${ADMIN}', false), ('${TESTER_A}', false), ('${TESTER_B}', false), ('${ANON}', true);
    INSERT INTO public.profiles VALUES ('${TESTER_A}', 'Tester A'), ('${TESTER_B}', 'Tester B');
  `);
  cohort = await createCohort();
}, 120_000);

afterAll(async () => db?.close());

describe("PLAY1 schema — cohorts", () => {
  it("creates a cohort with a high-entropy slug and its director row at revision 0", async () => {
    expect(cohort.invite_slug).toMatch(/^[a-z0-9]{64}$/);
    const other = await createCohort("second");
    expect(other.invite_slug).not.toBe(cohort.invite_slug);
    const state = await as({ uid: ADMIN, admin: true }, () =>
      db.query<{ scene_id: string; build_step: number; revision: string }>(
        `SELECT scene_id, build_step, revision FROM public.playtest_director_state WHERE cohort_id = $1`,
        [cohort.id],
      ));
    expect(state.rows[0]).toMatchObject({ scene_id: "welcome", build_step: 0 });
    expect(Number(state.rows[0].revision)).toBe(0);
  });

  it("refuses cohort creation by a non-admin", async () => {
    const msg = await rejected(() => as({ uid: TESTER_A }, () =>
      db.query(`SELECT public.playtest_create_cohort('x', 'play1_placeholder', 1, 'welcome')`)));
    expect(msg).toMatch(/playtest_admin_required/);
  });

  it("hides cohorts (and their slugs) from testers", async () => {
    await enroll(TESTER_A, cohort.invite_slug);
    const { rows } = await as({ uid: TESTER_A }, () =>
      db.query(`SELECT * FROM public.playtest_cohorts`));
    expect(rows).toHaveLength(0);
  });

  it("grants browsers no direct write on any playtest table", async () => {
    for (const sql of [
      `INSERT INTO public.playtest_enrollments (cohort_id, user_id) VALUES ('${cohort.id}', '${TESTER_B}')`,
      `UPDATE public.playtest_director_state SET revision = revision + 1`,
      `UPDATE public.playtest_enrollments SET status = 'completed'`,
      `INSERT INTO public.playtest_feedback (cohort_id, enrollment_id, user_id, prompt_key, scene_id, response)
         SELECT cohort_id, id, user_id, 'x_key', 'welcome', '{}'::jsonb FROM public.playtest_enrollments`,
      `DELETE FROM public.playtest_cohorts`,
    ]) {
      const msg = await rejected(() => as({ uid: TESTER_A }, () => db.query(sql)));
      expect(msg, sql).toMatch(/permission denied/);
    }
  });
});

describe("PLAY1 enrollment", () => {
  it("lets an authenticated invited user create, then resume, their own enrollment", async () => {
    const first = await enroll(TESTER_B, cohort.invite_slug);
    const again = await enroll(TESTER_B, cohort.invite_slug);
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.enrollment_id).toBe(first.enrollment_id);
    expect(again.cohort_id).toBe(cohort.id);
    const { rows } = await db.query<{ n: number; visitor_id: string }>(
      `SELECT count(*)::int AS n, max(visitor_id::text) AS visitor_id
         FROM public.playtest_enrollments WHERE user_id = $1`, [TESTER_B]);
    expect(rows[0].n).toBe(1);
    expect(rows[0].visitor_id).toBe(VISITOR);
  });

  it("refuses an invalid invitation", async () => {
    const msg = await rejected(() => enroll(TESTER_A, "0".repeat(64)));
    expect(msg).toMatch(/playtest_invitation_invalid/);
  });

  it("refuses a cohort UUID offered in place of the invitation", async () => {
    const msg = await rejected(() => enroll(TESTER_A, cohort.id));
    expect(msg).toMatch(/playtest_invitation_invalid/);
  });

  it("refuses anonymous sessions and the anon role", async () => {
    expect(await rejected(() => enroll(ANON, cohort.invite_slug))).toMatch(/playtest_account_required/);
    const msg = await rejected(() => as({ uid: null, role: "anon" }, () =>
      db.query(`SELECT public.playtest_join($1)`, [cohort.invite_slug])));
    expect(msg).toMatch(/permission denied/);
  });

  it("refuses NEW enrollment into a closed cohort but lets an enrollee resume", async () => {
    const closing = await createCohort("closing");
    await enroll(TESTER_A, closing.invite_slug);
    await as({ uid: ADMIN, admin: true }, () =>
      db.query(`SELECT public.playtest_set_cohort_status($1, 'closed')`, [closing.id]));
    expect((await enroll(TESTER_A, closing.invite_slug)).created).toBe(false);
    expect(await rejected(() => enroll(TESTER_B, closing.invite_slug))).toMatch(/playtest_invitation_invalid/);
  });

  it("never lets one tester read another's enrollment", async () => {
    const { rows } = await as({ uid: TESTER_A }, () =>
      db.query<{ user_id: string }>(`SELECT user_id FROM public.playtest_enrollments`));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.user_id === TESTER_A)).toBe(true);
  });

  it("refuses progress reports against another tester's enrollment", async () => {
    const b = await enroll(TESTER_B, cohort.invite_slug);
    const msg = await rejected(() => as({ uid: TESTER_A }, () =>
      db.query(`SELECT public.playtest_report_progress($1, 'completed')`, [b.enrollment_id])));
    expect(msg).toMatch(/playtest_enrollment_not_found/);
  });

  it("keeps the progress projection monotonic", async () => {
    const a = await enroll(TESTER_A, cohort.invite_slug);
    const report = (status: string, stage: number | null) => as({ uid: TESTER_A }, () =>
      db.query<{ s: string }>(
        `SELECT public.playtest_report_progress($1, $2, 'daily_standard', 'dr_x', '2026-09-27', 'active', $3, 'completed') AS s`,
        [a.enrollment_id, status, stage]));
    expect((await report("checkpoint_reached", 0)).rows[0].s).toBe("checkpoint_reached");
    expect((await report("in_gameplay", 1)).rows[0].s).toBe("checkpoint_reached");
    const { rows } = await db.query<{ daily_stage_index: number; daily_run_id: string }>(
      `SELECT daily_stage_index, daily_run_id FROM public.playtest_enrollments WHERE id = $1`, [a.enrollment_id]);
    expect(rows[0]).toMatchObject({ daily_stage_index: 1, daily_run_id: "dr_x" });
  });
});

describe("PLAY1 Director state", () => {
  it("lets an enrolled tester read their cohort's state but not another cohort's", async () => {
    const other = await createCohort("other");
    const { rows } = await as({ uid: TESTER_A }, () =>
      db.query<{ cohort_id: string }>(`SELECT cohort_id FROM public.playtest_director_state`));
    const ids = rows.map((r) => r.cohort_id);
    expect(ids).toContain(cohort.id);
    expect(ids).not.toContain(other.id);
  });

  it("refuses Director mutation by a non-admin", async () => {
    const msg = await rejected(() => advance({ uid: TESTER_A }, 0, "welcome", 1));
    expect(msg).toMatch(/playtest_admin_required/);
  });

  it("lets an admin advance, and refuses a stale expected_revision", async () => {
    const moved = await advance({ uid: ADMIN, admin: true }, 0, "welcome", 1);
    expect(moved).toMatchObject({ applied: true, scene_id: "welcome", build_step: 1 });
    expect(Number(moved.revision)).toBe(1);

    const stale = await advance({ uid: ADMIN, admin: true }, 0, "daily_standard", 0);
    expect(stale.applied).toBe(false);
    expect(stale).toMatchObject({ scene_id: "welcome", build_step: 1 });
    expect(Number(stale.revision)).toBe(1);
  });

  it("makes a repeated identical advance a no-op, not a double advance", async () => {
    const first = await advance({ uid: ADMIN, admin: true }, 1, "welcome", 2);
    const repeat = await advance({ uid: ADMIN, admin: true }, 1, "welcome", 2);
    expect(first.applied).toBe(true);
    expect(repeat.applied).toBe(false);
    expect(Number(repeat.revision)).toBe(2);
    const { rows } = await db.query<{ revision: string }>(
      `SELECT revision FROM public.playtest_director_state WHERE cohort_id = $1`, [cohort.id]);
    expect(Number(rows[0].revision)).toBe(2);
  });

  it("publishes the director row (and the roster tables) to Realtime", async () => {
    const { rows } = await db.query<{ tablename: string }>(
      `SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY 1`);
    expect(rows.map((r) => r.tablename)).toEqual(
      ["playtest_director_state", "playtest_enrollments", "playtest_feedback"]);
  });
});

describe("PLAY1 feedback", () => {
  it("stores one answer per enrollment and prompt; a repeat is a no-op", async () => {
    const a = await enroll(TESTER_A, cohort.invite_slug);
    const submit = (choice: string) => as({ uid: TESTER_A }, () =>
      db.query<{ r: { created: boolean } }>(
        `SELECT public.playtest_submit_feedback($1, 'standard_stage_feel', 'standard_feedback', $2::jsonb) AS r`,
        [a.enrollment_id, JSON.stringify({ choice })]));
    expect((await submit("just_right")).rows[0].r.created).toBe(true);
    expect((await submit("too_hard")).rows[0].r.created).toBe(false);
    const { rows } = await db.query<{ response: { choice: string } }>(
      `SELECT response FROM public.playtest_feedback WHERE enrollment_id = $1`, [a.enrollment_id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].response.choice).toBe("just_right");
    expect((await enroll(TESTER_A, cohort.invite_slug)).answered_prompt_keys).toEqual(["standard_stage_feel"]);
  });

  it("refuses feedback against another tester's enrollment and hides others' answers", async () => {
    const b = await enroll(TESTER_B, cohort.invite_slug);
    const msg = await rejected(() => as({ uid: TESTER_A }, () =>
      db.query(`SELECT public.playtest_submit_feedback($1, 'standard_stage_feel', 'standard_feedback', '{}'::jsonb)`,
        [b.enrollment_id])));
    expect(msg).toMatch(/playtest_enrollment_not_found/);
    const { rows } = await as({ uid: TESTER_B }, () =>
      db.query(`SELECT * FROM public.playtest_feedback`));
    expect(rows).toHaveLength(0);
  });

  it("gives the admin roster progress and feedback, and refuses it to testers", async () => {
    const { rows } = await as({ uid: ADMIN, admin: true }, () =>
      db.query<{ display_name: string; status: string; feedback: unknown[] }>(
        `SELECT display_name, status, feedback FROM public.playtest_admin_roster($1)`, [cohort.id]));
    const a = rows.find((r) => r.display_name === "Tester A")!;
    expect(a.status).toBe("feedback_submitted");
    expect(a.feedback).toHaveLength(1);
    expect(rows.find((r) => r.display_name === "Tester B")!.feedback).toHaveLength(0);
    const msg = await rejected(() => as({ uid: TESTER_A }, () =>
      db.query(`SELECT * FROM public.playtest_admin_roster($1)`, [cohort.id])));
    expect(msg).toMatch(/playtest_admin_required/);
  });
});

describe("PLAY1 migration hygiene", () => {
  it("re-applies cleanly (hand re-run in the SQL editor)", async () => {
    await db.exec(MIGRATION);
  });
});
