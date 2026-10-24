// @vitest-environment node
//
// PGlite loads its wasm build through fetch/Response; jsdom's shims break that.
/**
 * Notifications 2.0 × OWN1 (#146) — the inbox RPCs under the REAL owner model.
 *
 * notificationsV2Lifecycle runs the migration with a user_roles-backed
 * has_role(). Production has no admin rows in user_roles: since OWN1-B,
 * has_role(uid, 'admin') is the owner shim — the configured owner, on their own
 * session, at aal2 or with a live trusted-device attestation for THIS JWT
 * session_id. This suite installs those exact function bodies (read from the
 * staged OWN1 SQL, not retyped) over the fixture and asks:
 *
 *   - do the notification RPCs authorize exactly when the working admin
 *     surfaces do (owner_auth_state().authorized, admin_unread_notification_count)?
 *   - is an empty user_roles table irrelevant for the owner?
 *   - what does a lapsed attestation look like on the wire (code + message)?
 *   - does a normal player's inbox depend on any of this? (it must not)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { PER_ADMIN_READS, V2, bootNotificationsDb } from "./notificationsV2DbFixture";

const OWNER = "0aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLAYER = "0bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION = "5e550000-0000-4000-8000-000000000001";
const OTHER_SESSION = "5e550000-0000-4000-8000-000000000002";

const own1 = (file: string) => readFileSync(resolve(__dirname, "../../../supabase/own1-staged/migrations", file), "utf8");

/** One `CREATE OR REPLACE FUNCTION <name>(…) … $$;` statement, verbatim. */
function fn(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  if (start < 0) throw new Error(`OWN1 SQL no longer defines ${name}`);
  const body = sql.indexOf("$$", start);
  const end = sql.indexOf("$$;", body + 2);
  return sql.slice(start, end + 3);
}

const A = own1("01_own1_a_owner_core.sql");
const B = own1("02_own1_b_owner_cutover.sql");
const OWN1_MODEL = `
  CREATE SCHEMA private;
  ALTER TABLE public._ctx ADD COLUMN claims jsonb;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
    AS $$ SELECT COALESCE(claims, '{}'::jsonb) FROM public._ctx LIMIT 1 $$;
  CREATE TABLE private.owner_config (singleton boolean PRIMARY KEY DEFAULT true, owner_user_id uuid NOT NULL);
  CREATE TABLE private.owner_trusted_devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL,
    expires_at timestamptz NOT NULL, revoked_at timestamptz);
  CREATE TABLE private.owner_device_attestations (
    session_id uuid PRIMARY KEY, device_id uuid NOT NULL REFERENCES private.owner_trusted_devices(id),
    owner_user_id uuid NOT NULL, expires_at timestamptz NOT NULL);
  ${fn(A, "private.configured_owner_id")}
  ${fn(A, "private.jwt_aal")}
  ${fn(A, "private.jwt_session_id")}
  ${fn(A, "public.is_owner_user")}
  ${fn(A, "private.has_device_attestation")}
  ${fn(A, "private.jwt_last_mfa_at")}
  ${fn(A, "public.is_owner_aal2")}
  ${fn(A, "public.is_owner_fresh_aal2")}
  ${fn(A, "public.is_owner")}
  ${fn(A, "public.owner_auth_state")}
  ${fn(B, "public.has_role")}
  REVOKE ALL ON SCHEMA private FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.owner_auth_state() TO authenticated;
  INSERT INTO private.owner_config (owner_user_id) VALUES ('${OWNER}');
`;

let db: PGlite;

type Session = { uid: string; aal?: "aal1" | "aal2"; session?: string };

/** Act as a browser session: auth.uid() + the JWT claims has_role reads. */
async function as<T>({ uid, aal = "aal1", session = SESSION }: Session, work: () => Promise<T>): Promise<T> {
  await db.query(`UPDATE public._ctx SET uid = $1::uuid, claims = $2::jsonb`, [
    uid, JSON.stringify({ sub: uid, aal, session_id: session, role: "authenticated" })]);
  await db.exec("SET ROLE authenticated;");
  try {
    return await work();
  } finally {
    await db.exec("RESET ROLE;");
  }
}

/** The RPC's outcome as PostgREST would report it: rows, or { code, message }. */
async function call(s: Session, sql: string) {
  return as(s, async () => {
    try {
      return { ok: true as const, rows: (await db.query<Record<string, unknown>>(sql)).rows };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      return { ok: false as const, code: err.code, message: err.message };
    }
  });
}

const authorizedState = async (s: Session) =>
  (await call(s, `SELECT public.owner_auth_state() AS s`)) as { ok: true; rows: { s: { authorized: boolean } }[] };

const INBOX_RPCS = [
  `SELECT * FROM public.admin_get_notifications('action', 31, NULL, NULL, NULL)`,
  `SELECT public.admin_notification_counts() AS c`,
];

async function attest(session: string, minutes: number) {
  const dev = (await db.query<{ id: string }>(
    `INSERT INTO private.owner_trusted_devices (owner_user_id, expires_at)
     VALUES ($1, now() + interval '30 days') RETURNING id`, [OWNER])).rows[0].id;
  await db.query(
    `INSERT INTO private.owner_device_attestations (session_id, device_id, owner_user_id, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4))
     ON CONFLICT (session_id) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
    [session, dev, OWNER, minutes]);
}

beforeAll(async () => {
  db = await bootNotificationsDb();
  await db.exec(OWN1_MODEL);
  await db.exec(`
    INSERT INTO public.profiles (user_id, display_name, created_at) VALUES
      ('${OWNER}', 'Owner', now() - interval '400 days'),
      ('${PLAYER}', 'Player', now() - interval '400 days');
  `);
  await db.exec(PER_ADMIN_READS);
  await db.exec(V2);
  const playerProfile = (await db.query<{ id: string }>(`SELECT id FROM public.profiles WHERE user_id = $1`, [PLAYER])).rows[0].id;
  await db.query(`INSERT INTO public.admin_notifications (type, title) VALUES ('user_report', 'Report')`);
  await db.query(
    `INSERT INTO public.user_notifications (title, type, target_type, profile_id, sent_by_user_id) VALUES
       ('Hello everyone', 'lol_site_notice', 'all', NULL, $2),
       ('For you', 'friend_accepted', 'user', $1, $2)`, [playerProfile, OWNER]);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("owner authorization: notification RPCs vs the working admin surfaces", () => {
  it("production shape: user_roles holds no privileged row, and that is not why anything fails", async () => {
    expect((await db.query(`SELECT 1 FROM public.user_roles`)).rows).toHaveLength(0);
    const r = await call({ uid: OWNER, aal: "aal2" }, INBOX_RPCS[1]);
    expect(r.ok).toBe(true);
  });

  const cases: { name: string; session: Session; setup?: () => Promise<void>; authorized: boolean }[] = [
    { name: "owner at aal2 (MFA)", session: { uid: OWNER, aal: "aal2" }, authorized: true },
    {
      name: "owner at aal1 with a live trusted-device attestation for this session",
      session: { uid: OWNER, aal: "aal1", session: SESSION },
      setup: () => attest(SESSION, 15),
      authorized: true,
    },
    {
      name: "owner at aal1 whose attestation lapsed (laptop slept past 15 minutes)",
      session: { uid: OWNER, aal: "aal1", session: SESSION },
      setup: () => attest(SESSION, -1),
      authorized: false,
    },
    {
      name: "owner at aal1 on a session that was never attested",
      session: { uid: OWNER, aal: "aal1", session: OTHER_SESSION },
      authorized: false,
    },
    { name: "a player, even at aal2", session: { uid: PLAYER, aal: "aal2" }, authorized: false },
  ];

  for (const c of cases) {
    it(`${c.name}: inbox RPCs ${c.authorized ? "succeed" : "refuse"} exactly when owner_auth_state() and the legacy count do`, async () => {
      await c.setup?.();
      const state = await authorizedState(c.session);
      expect(state.ok, JSON.stringify(state)).toBe(true);
      // owner_auth_state is what AdminRoute / the bell gate on.
      expect(state.rows[0].s.authorized).toBe(c.authorized);

      // admin_unread_notification_count predates v2 and powers the working
      // useAdminAttention badge: the same has_role() check.
      const legacy = await call(c.session, `SELECT public.admin_unread_notification_count() AS n`);
      expect(legacy.ok).toBe(c.authorized);

      for (const sql of INBOX_RPCS) {
        const r = await call(c.session, sql);
        expect(r.ok, sql).toBe(c.authorized);
        if (!r.ok) {
          // What the browser receives: 42501 + a fixed message. The client
          // must treat this as "re-attest and retry once", not a dead end.
          expect(r.code).toBe("42501");
          expect(r.message).toBe("admin role required");
        }
      }
    });
  }

  it("re-attesting the same session restores access without MFA (what ensureOwnerAuthorized does)", async () => {
    const s: Session = { uid: OWNER, aal: "aal1", session: SESSION };
    await attest(SESSION, -1);
    expect((await call(s, INBOX_RPCS[1])).ok).toBe(false);
    await attest(SESSION, 15);
    expect((await call(s, INBOX_RPCS[1])).ok).toBe(true);
  });
});

describe("the player inbox is independent of owner authorization", () => {
  it("a normal player reads their own inbox and summary", async () => {
    const page = await call({ uid: PLAYER }, `SELECT title FROM public.get_my_notifications('inbox', 31, NULL, NULL)`);
    expect(page.ok).toBe(true);
    expect((page as { rows: { title: string }[] }).rows.map(r => r.title).sort()).toEqual(["For you", "Hello everyone"]);
    const summary = await call({ uid: PLAYER }, `SELECT public.get_my_notification_summary() AS s`);
    expect(summary.ok).toBe(true);
  });

  it("the owner's own player inbox works whatever their assurance level", async () => {
    await attest(SESSION, -1);
    for (const aal of ["aal1", "aal2"] as const) {
      const page = await call({ uid: OWNER, aal }, `SELECT title FROM public.get_my_notifications('inbox', 31, NULL, NULL)`);
      expect(page.ok).toBe(true);
      // Recipient scoping: the player's targeted row is never in the owner's bell.
      expect((page as { rows: { title: string }[] }).rows.map(r => r.title)).toEqual(["Hello everyone"]);
    }
  });
});
