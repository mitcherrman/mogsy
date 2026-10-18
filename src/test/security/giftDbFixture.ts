// PT1.7 — PGlite fixture for the gift suites. The chain is production's: the
// custom-offer fixture (Supabase roles/defaults, auth.uid, pgcrypto, OWN1
// stand-ins), PT1.4 → 0002 → 0003, the ORIGINAL gift migrations exactly as
// shipped (table, RLS, the 20260624 column revoke and the 20260721
// redeem_gift_code), then 0004.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE, M0002, M0003, PT14 } from "./customOfferDbFixture";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
export const GIFTS_CREATE = read("supabase/migrations/20260521082712_324e672a-63ad-4f55-bcf8-a6bc6676c807.sql");
export const GIFTS_COLUMN_REVOKE = read("supabase/migrations/20260624023702_6a6214cb-aa91-4d4f-8db8-cba3c8d6a3cb.sql");
const raceFix = read("supabase/migrations/20260721102819_f494c13e-1dff-487e-b79d-04fc18a9bed2.sql");
/** The 20260721 race-safe redeem_gift_code, as applied (the file also redefines purchase_powerup). */
export const GIFTS_REDEEM_V2 = raceFix.slice(raceFix.indexOf("CREATE OR REPLACE FUNCTION public.redeem_gift_code"));
export const M0004 = read("drizzle/migrations/0004_pt1_7_annual_gift.sql");

export const SUPABASE_AUTH_EXTRAS = `
  ALTER TABLE auth.users ADD COLUMN email text, ADD COLUMN email_confirmed_at timestamptz;
  ALTER TABLE public.profiles ADD COLUMN diamonds integer DEFAULT 0;
  CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql
    AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
`;

/** Boot the chain. `upTo0004 = false` stops before 0004 (to replay the old defects). */
export async function bootGiftDb(upTo0004 = true): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(FIXTURE);
  await db.exec(SUPABASE_AUTH_EXTRAS);
  await db.exec(PT14);
  await db.exec(M0002);
  await db.exec(M0003);
  await db.exec(GIFTS_CREATE);
  await db.exec(GIFTS_COLUMN_REVOKE);
  await db.exec(GIFTS_REDEEM_V2);
  if (upTo0004) await db.exec(M0004);
  return db;
}

/** A user with a profile. `verified: false` leaves email_confirmed_at NULL. */
export async function addUser(
  db: PGlite,
  id: string,
  email: string,
  opts: { verified?: boolean; anonymous?: boolean; name?: string } = {},
): Promise<void> {
  await db.query(
    `INSERT INTO auth.users (id, is_anonymous, email, email_confirmed_at)
     VALUES ($1::uuid, $2, $3, CASE WHEN $4 THEN now() END)`,
    [id, !!opts.anonymous, email, opts.verified !== false],
  );
  await db.query(`INSERT INTO public.profiles (user_id, display_name) VALUES ($1::uuid, $2)`, [id, opts.name ?? email]);
}
