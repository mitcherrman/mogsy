// PT1.6b — shared PGlite fixture for the custom-offer suites. Supplies only
// what Supabase would (see pt16CustomOfferSql.test.ts for the full rationale).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
export const PT14 = read("supabase/migrations/20260903120000_pt1_4_entitlement_sources.sql");
export const M0002 = read("drizzle/migrations/0002_pt1_6_custom_offer_one_time.sql");
export const M0003 = read("drizzle/migrations/0003_pt1_6b_custom_offer_completion.sql");

export const OWNER = "00000000-0000-4000-8000-00000000000a";
export const ALICE = "00000000-0000-4000-8000-0000000000a1";
export const BOB = "00000000-0000-4000-8000-0000000000b1";
export const GUEST = "00000000-0000-4000-8000-0000000000c1";
export const SUBSCRIBER = "00000000-0000-4000-8000-0000000000d1";
export const COMPED = "00000000-0000-4000-8000-0000000000e1";
export const GIFTED = "00000000-0000-4000-8000-0000000000f1";

export const FIXTURE = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  -- Supabase's defaults: browser roles get table AND function privileges on
  -- every new object, which is exactly what the migration must take away.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE SCHEMA extensions;
  CREATE EXTENSION pgcrypto SCHEMA extensions;
  CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, is_anonymous boolean NOT NULL DEFAULT false);
  CREATE TABLE public._ctx (uid uuid, owner boolean, fresh boolean);
  INSERT INTO public._ctx VALUES (NULL, false, false);
  GRANT SELECT ON public._ctx TO anon, authenticated, service_role;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT uid FROM public._ctx LIMIT 1 $$;
  CREATE TYPE public.app_role AS ENUM ('master_admin', 'admin', 'moderator');
  CREATE FUNCTION public.has_role(_uid uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT false $$;
  -- OWN1 stand-ins: same names, levels and error strings as 01_own1_a_owner_core.
  CREATE FUNCTION public.is_owner() RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT COALESCE((SELECT owner FROM public._ctx LIMIT 1), false) $$;
  CREATE FUNCTION public.assert_owner(_level text DEFAULT 'trusted') RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
  DECLARE _o boolean; _f boolean;
  BEGIN
    SELECT owner, fresh INTO _o, _f FROM public._ctx LIMIT 1;
    IF NOT COALESCE(_o, false) THEN RAISE EXCEPTION 'owner_required'; END IF;
    IF _level = 'fresh_aal2' AND NOT COALESCE(_f, false) THEN
      RAISE EXCEPTION 'step_up_required' USING HINT = 'fresh_aal2';
    END IF;
  END $$;
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid UNIQUE,
    display_name text,
    is_pro boolean DEFAULT false
  );
  -- ADM2, verbatim in the one property that matters: actor_user_id NOT NULL.
  CREATE TABLE public.admin_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid NOT NULL,
    action text NOT NULL,
    target_profile_id uuid,
    result text NOT NULL,
    detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  );
`;

