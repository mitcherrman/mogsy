// EMAIL1 — PGlite fixture. Supplies only what Supabase would (roles, auth.uid,
// auth.users with email columns, the OWN1 gate stand-ins from the shared
// fixture) and then applies the STAGED migration verbatim, so the SQL under test
// is the SQL that would ship.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE } from "./customOfferDbFixture";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
export const EMAIL1_MIGRATION_PATH = "supabase/email1-staged/migrations/01_email1_subscriptions.sql";
export const EMAIL1_MIGRATION = read(EMAIL1_MIGRATION_PATH);
export const EMAIL1_ROLLBACK = read("supabase/email1-staged/rollback/01_email1_rollback.sql");

const AUTH_EXTRAS = `
  -- Supabase's service_role bypasses RLS; the shared fixture's bare role does not.
  ALTER ROLE service_role BYPASSRLS;
  ALTER TABLE auth.users ADD COLUMN email text, ADD COLUMN email_confirmed_at timestamptz;
  -- OWN1's log_owner_action, reduced to the property under test: owner only,
  -- one audit row per call.
  CREATE FUNCTION public.log_owner_action(
    _action text, _target_profile_id uuid DEFAULT NULL, _result text DEFAULT 'ok', _detail jsonb DEFAULT '{}'::jsonb)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
  DECLARE _id uuid;
  BEGIN
    IF NOT public.is_owner() THEN RAISE EXCEPTION 'owner_required' USING ERRCODE = 'insufficient_privilege'; END IF;
    INSERT INTO public.admin_audit_log (actor_user_id, action, target_profile_id, result, detail)
      VALUES (auth.uid(), _action, _target_profile_id, _result, _detail) RETURNING id INTO _id;
    RETURN _id;
  END $$;
  GRANT EXECUTE ON FUNCTION public.log_owner_action(text, uuid, text, jsonb) TO authenticated, service_role;
`;

/** Boot a database with users present BEFORE the migration (to prove it backfills nobody). */
export async function bootEmailDb(opts: { preUsers?: Array<{ id: string; email: string; anonymous?: boolean }> } = {}): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(FIXTURE);
  await db.exec(AUTH_EXTRAS);
  for (const u of opts.preUsers ?? []) await addUser(db, u.id, u.email, { anonymous: u.anonymous });
  await db.exec(EMAIL1_MIGRATION);
  return db;
}

export async function addUser(
  db: PGlite, id: string, email: string | null, opts: { anonymous?: boolean } = {},
): Promise<void> {
  await db.query(
    `INSERT INTO auth.users (id, is_anonymous, email, email_confirmed_at) VALUES ($1::uuid, $2, $3, now())`,
    [id, !!opts.anonymous, email],
  );
  await db.query(`INSERT INTO public.profiles (user_id, display_name) VALUES ($1::uuid, $2)`, [id, email ?? "guest"]);
}

/** Run `fn` as a Supabase role, with auth.uid() and the owner flags set. */
export async function asRole<T>(
  db: PGlite, role: "anon" | "authenticated" | "service_role",
  ctx: { uid?: string | null; owner?: boolean; fresh?: boolean },
  fn: () => Promise<T>,
): Promise<T> {
  await db.query(`UPDATE public._ctx SET uid = $1::uuid, owner = $2, fresh = $3`, [
    ctx.uid ?? null, !!ctx.owner, !!ctx.fresh,
  ]);
  await db.exec(`SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
    await db.query(`UPDATE public._ctx SET uid = NULL, owner = false, fresh = false`);
  }
}

export async function rejected(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error("expected a rejection");
}

/** 64 hex chars, deterministic per seed — stands in for sha256(token). */
export const fakeHash = (seed: string) => seed.padEnd(64, "0").slice(0, 64).replace(/[^0-9a-f]/g, "a");
