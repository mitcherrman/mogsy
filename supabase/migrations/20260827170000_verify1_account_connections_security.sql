-- ===========================================================================
-- VERIFY1 — Account Connections security correction (forward-only).
--
-- The prior migration (20260827063810) created public.user_identity_links and
-- is ALREADY APPLIED IN PRODUCTION. Nothing here rewrites or drops it. This
-- migration corrects three defects found in the VERIFY1 read-only audit.
--
-- 1. THE COLUMN-GRANT MODEL NEVER TOOK EFFECT
--    That migration granted UPDATE (contact_consent, public_on_profile) to
--    `authenticated` and described it as the browser's ceiling. It is not.
--    This project's ALTER DEFAULT PRIVILEGES already grants TABLE-level
--    privileges on new public tables, and a column GRANT only ADDS to that —
--    it removes nothing. The same finding is recorded in the headers of
--    20260730150000 and 20260823120000.
--
--    Measured, not assumed: on 2026-08-27 an anonymous PostgREST read of
--    public.user_identity_links returned HTTP 200 with an empty array. The
--    prior migration never granted anything to `anon`. Only RLS (no anon
--    policy) was holding the line, over a live table-level SELECT grant.
--
--    So: REVOKE at both table and column level from PUBLIC/anon/authenticated,
--    then re-grant exactly the intended ceiling, and PROVE it in a DO block
--    that fails the migration if the resulting privilege set is wrong.
--
-- 2. A SIGNED OAUTH STATE WAS SUFFICIENT TO WRITE A VERIFIED IDENTITY
--    The callback wrote user_identity_links using only the user id embedded in
--    the signed state, with no live Mogzy session. An attacker could mint a
--    state for their OWN account, hand the authorize URL to a victim, and the
--    victim's Discord approval would bind the VICTIM's Discord identity to the
--    ATTACKER's Mogzy account — permanently, because (provider,
--    provider_user_id) is unique.
--
--    So: two server-managed ceremony tables split the flow into legs that are
--    each single-use, short-lived, and invisible to browser roles. The commit
--    now requires a live authenticated session that matches the pending row.
--
-- 3. admin_list_identity_links HID ROWS AND COULD NOT BE RECONCILED
--    It INNER JOINed profiles, so a link belonging to a user without a profile
--    row silently vanished, and it returned no user_id to reconcile with.
--
-- WHAT THIS ADDS
--   1. privilege correction + self-proving assertions on user_identity_links
--   2. public.identity_link_attempts        — leg 1, kills OAuth state replay
--   3. public.identity_link_pending         — leg 2, holds the verified
--                                             identity until an authenticated
--                                             redemption commits it
--   4. public.identity_link_consume_attempt — atomic single-use consume
--   5. public.identity_link_redeem          — atomic consume + commit
--   6. protect_identity_link_verified_fields — hardened against role drift
--   7. admin_list_identity_links            — LEFT JOIN, returns user_id
--
-- NO PROVIDER TOKENS ARE STORED ANYWHERE. Neither ceremony table has a column
-- for an access or refresh token; the edge function discards them with its
-- own scope after the identity lookup.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. PRIVILEGES ON public.user_identity_links
--
-- Table-level and column-level REVOKEs are separate operations in PostgreSQL:
-- REVOKE ... ON TABLE does not remove column grants, and a column REVOKE
-- cannot remove a table grant. Both are issued so neither layer survives.
-- ---------------------------------------------------------------------------

REVOKE ALL PRIVILEGES ON TABLE public.user_identity_links FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES (
  id, user_id, provider, provider_user_id, username, display_name, tag_line,
  avatar_url, verified_at, contact_consent, public_on_profile, metadata,
  created_at, updated_at
) ON TABLE public.user_identity_links FROM PUBLIC, anon, authenticated;

-- The intended ceiling, and nothing else.
--   anon           — no access at all.
--   authenticated  — read and disconnect own rows (RLS-scoped), and flip only
--                    the two user-owned switches. No INSERT: a browser may
--                    never assert a verified identity.
GRANT SELECT, DELETE ON public.user_identity_links TO authenticated;
GRANT UPDATE (contact_consent, public_on_profile) ON public.user_identity_links TO authenticated;
GRANT ALL ON public.user_identity_links TO service_role;

-- Proof, not commentary. If the privilege set is not exactly this, the
-- migration aborts rather than reporting a security model it did not achieve.
DO $proof$
BEGIN
  -- anon: nothing, at table level or on any single column.
  IF has_any_column_privilege('anon', 'public.user_identity_links', 'SELECT')
     OR has_any_column_privilege('anon', 'public.user_identity_links', 'INSERT')
     OR has_any_column_privilege('anon', 'public.user_identity_links', 'UPDATE')
     OR has_table_privilege('anon', 'public.user_identity_links', 'DELETE') THEN
    RAISE EXCEPTION 'VERIFY1: anon retains privileges on user_identity_links';
  END IF;

  -- authenticated: no INSERT anywhere.
  IF has_any_column_privilege('authenticated', 'public.user_identity_links', 'INSERT') THEN
    RAISE EXCEPTION 'VERIFY1: authenticated can INSERT verified identities';
  END IF;

  -- authenticated: no TABLE-level UPDATE (this is the defect being corrected).
  IF has_table_privilege('authenticated', 'public.user_identity_links', 'UPDATE') THEN
    RAISE EXCEPTION 'VERIFY1: authenticated retains table-level UPDATE';
  END IF;

  -- authenticated: UPDATE on the two consent columns and no others.
  IF NOT has_column_privilege('authenticated', 'public.user_identity_links', 'contact_consent', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.user_identity_links', 'public_on_profile', 'UPDATE') THEN
    RAISE EXCEPTION 'VERIFY1: consent columns are not user-writable';
  END IF;
  IF has_column_privilege('authenticated', 'public.user_identity_links', 'provider_user_id', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.user_identity_links', 'verified_at', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.user_identity_links', 'username', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.user_identity_links', 'user_id', 'UPDATE') THEN
    RAISE EXCEPTION 'VERIFY1: authenticated can rewrite verified identity fields';
  END IF;

  -- authenticated: the two RLS-scoped reads/deletes it does need.
  IF NOT has_table_privilege('authenticated', 'public.user_identity_links', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.user_identity_links', 'DELETE') THEN
    RAISE EXCEPTION 'VERIFY1: authenticated cannot read or disconnect its own links';
  END IF;
END
$proof$;

-- ---------------------------------------------------------------------------
-- 6. HARDEN THE VERIFIED-FIELD TRIGGER
--
-- Unchanged in intent: a browser role may never move a verified field. The
-- guard previously keyed solely on auth.role() = 'service_role', which is a
-- PostgREST request claim. A SECURITY DEFINER server function (identity_link_
-- redeem, below) runs as the table owner and legitimately writes these fields,
-- but carries no such claim. Keying on the role the statement actually runs as
-- states the real rule: the protection exists to bind the BROWSER roles.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_identity_link_verified_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_user_id IS DISTINCT FROM OLD.provider_user_id
     OR NEW.username IS DISTINCT FROM OLD.username
     OR NEW.display_name IS DISTINCT FROM OLD.display_name
     OR NEW.tag_line IS DISTINCT FROM OLD.tag_line
     OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.metadata IS DISTINCT FROM OLD.metadata THEN
    RAISE EXCEPTION 'Verified identity fields are server-managed';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_identity_link_verified_fields() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. LEG 1 — public.identity_link_attempts
--
-- Created at `start`, consumed at the provider callback. The OAuth `state`
-- carries this row's id; the row is the single-use record that makes replay
-- impossible. The prior design generated a nonce and never stored it, so a
-- captured state stayed valid for its full 10-minute window.
--
-- The return origin and path are pinned here at mint time AND revalidated by
-- the edge function at callback, so a state minted before an allowlist change
-- cannot carry a no-longer-trusted origin through.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.identity_link_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider      text NOT NULL CHECK (provider IN ('discord', 'riot')),
  return_origin text NOT NULL,
  return_path   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS identity_link_attempts_expires_at_idx
  ON public.identity_link_attempts (expires_at);

-- ---------------------------------------------------------------------------
-- 3. LEG 2 — public.identity_link_pending
--
-- Written at the callback once the provider has PROVEN ownership, and consumed
-- by an authenticated redeem. This row is the reason a signed state is no
-- longer sufficient to create a link: the identity waits here until a live
-- Mogzy session claims it.
--
-- The ticket is never stored. Only its SHA-256 is, because the ticket travels
-- in a URL — browser history, and any Referer the settings page emits. A read
-- of this table therefore yields nothing redeemable.
--
-- Columns are exactly the durable identity the link will hold. There is no
-- access_token or refresh_token column, by design.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.identity_link_pending (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_hash      text NOT NULL UNIQUE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider         text NOT NULL CHECK (provider IN ('discord', 'riot')),
  provider_user_id text NOT NULL,
  username         text,
  display_name     text,
  tag_line         text,
  avatar_url       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  consumed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS identity_link_pending_expires_at_idx
  ON public.identity_link_pending (expires_at);

-- Both ceremony tables are server-only. RLS is enabled and NO policy is
-- created for either: with RLS on and no policy, every non-bypassing role
-- reads and writes exactly zero rows, whatever grants may exist now or later.
-- The REVOKEs remove the inherited default-privilege grants on top of that, so
-- the browser cannot reach these tables through two independent mechanisms.
ALTER TABLE public.identity_link_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_link_pending  ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.identity_link_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.identity_link_pending  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.identity_link_attempts TO service_role;
GRANT ALL ON public.identity_link_pending  TO service_role;

DO $proof$
BEGIN
  IF has_any_column_privilege('anon', 'public.identity_link_attempts', 'SELECT')
     OR has_any_column_privilege('authenticated', 'public.identity_link_attempts', 'SELECT')
     OR has_any_column_privilege('anon', 'public.identity_link_pending', 'SELECT')
     OR has_any_column_privilege('authenticated', 'public.identity_link_pending', 'SELECT') THEN
    RAISE EXCEPTION 'VERIFY1: ceremony tables are reachable from a browser role';
  END IF;
END
$proof$;

-- ---------------------------------------------------------------------------
-- 4. public.identity_link_consume_attempt — single-use, atomic.
--
-- One UPDATE ... RETURNING is the whole guard. Expiry, prior consumption and
-- provider binding are all in the WHERE clause, so two concurrent callbacks
-- for the same state cannot both succeed: the second matches zero rows.
-- Returning no rows is the only failure mode — the caller learns nothing about
-- WHY, so this is not an oracle for probing attempt ids.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.identity_link_consume_attempt(
  p_attempt_id uuid,
  p_provider   text
)
RETURNS TABLE (out_user_id uuid, out_return_origin text, out_return_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.identity_link_attempts WHERE expires_at < now() - interval '1 hour';

  RETURN QUERY
  WITH consumed AS (
    UPDATE public.identity_link_attempts a
       SET consumed_at = now()
     WHERE a.id = p_attempt_id
       AND a.provider = p_provider
       AND a.consumed_at IS NULL
       AND a.expires_at > now()
    RETURNING a.user_id, a.return_origin, a.return_path
  )
  SELECT c.user_id, c.return_origin, c.return_path FROM consumed c;
END;
$$;

REVOKE ALL ON FUNCTION public.identity_link_consume_attempt(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.identity_link_consume_attempt(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. public.identity_link_redeem — the authenticated commit.
--
-- This is the step that structurally closes the account-linking CSRF. The
-- caller must supply BOTH the ticket and the id of a live authenticated Mogzy
-- session, and p_user_id is part of the consuming WHERE clause. A ticket
-- presented by the wrong user matches nothing — and is deliberately NOT burnt,
-- so a stray or hostile redeem cannot deny the rightful owner their link.
--
-- Every failure returns the same 'invalid_ticket' so the function does not
-- disclose whether a ticket exists, is expired, is spent, or belongs to
-- someone else.
--
-- CONSENT DOES NOT TRANSFER BETWEEN ACCOUNTS. Re-verifying the SAME provider
-- account preserves the user's switches. Linking a DIFFERENT provider account
-- over an existing row resets both to false: permission was granted for
-- account A and account B never received it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.identity_link_redeem(
  p_ticket_hash text,
  p_user_id     uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending  public.identity_link_pending%ROWTYPE;
  v_owner    uuid;
  v_existing public.user_identity_links%ROWTYPE;
  v_same     boolean;
BEGIN
  DELETE FROM public.identity_link_pending WHERE expires_at < now() - interval '1 hour';

  -- Atomic single-use consume, bound to the authenticated caller.
  UPDATE public.identity_link_pending p
     SET consumed_at = now()
   WHERE p.ticket_hash = p_ticket_hash
     AND p.user_id     = p_user_id
     AND p.consumed_at IS NULL
     AND p.expires_at  > now()
  RETURNING p.* INTO v_pending;

  IF NOT FOUND THEN
    RETURN 'invalid_ticket';
  END IF;

  -- The external account may already belong to a different Mogzy user. The
  -- unique constraint below remains the final authority under concurrency;
  -- this check exists to return the accurate reason in the common case.
  SELECT l.user_id INTO v_owner
    FROM public.user_identity_links l
   WHERE l.provider = v_pending.provider
     AND l.provider_user_id = v_pending.provider_user_id;

  IF v_owner IS NOT NULL AND v_owner <> p_user_id THEN
    RETURN 'already_linked';
  END IF;

  SELECT * INTO v_existing
    FROM public.user_identity_links l
   WHERE l.user_id = p_user_id
     AND l.provider = v_pending.provider;

  -- Same external account as before? Then the user's switches survive.
  v_same := FOUND AND (v_existing.provider_user_id IS NOT DISTINCT FROM v_pending.provider_user_id);

  INSERT INTO public.user_identity_links AS l (
    user_id, provider, provider_user_id, username, display_name, tag_line,
    avatar_url, verified_at, updated_at,
    contact_consent, public_on_profile
  )
  VALUES (
    p_user_id, v_pending.provider, v_pending.provider_user_id, v_pending.username,
    v_pending.display_name, v_pending.tag_line, v_pending.avatar_url, now(), now(),
    false, false
  )
  ON CONFLICT (user_id, provider) DO UPDATE
     SET provider_user_id  = EXCLUDED.provider_user_id,
         username          = EXCLUDED.username,
         display_name      = EXCLUDED.display_name,
         tag_line          = EXCLUDED.tag_line,
         avatar_url        = EXCLUDED.avatar_url,
         verified_at       = EXCLUDED.verified_at,
         updated_at        = EXCLUDED.updated_at,
         contact_consent   = CASE WHEN v_same THEN l.contact_consent   ELSE false END,
         public_on_profile = CASE WHEN v_same THEN l.public_on_profile ELSE false END;

  RETURN 'success';
EXCEPTION
  WHEN unique_violation THEN
    -- Lost the race for (provider, provider_user_id) to another Mogzy user.
    RETURN 'already_linked';
END;
$$;

REVOKE ALL ON FUNCTION public.identity_link_redeem(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.identity_link_redeem(text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. admin_list_identity_links — LEFT JOIN, and reconcilable.
--
-- Same authorization as before: the existing has_role admin/master_admin
-- architecture, reused exactly. Public access is not broadened.
--
-- The return type changes (user_id is added), so the function is dropped and
-- recreated rather than replaced.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_list_identity_links();

CREATE FUNCTION public.admin_list_identity_links()
RETURNS TABLE (
  user_id           uuid,
  profile_id        uuid,
  provider          text,
  provider_user_id  text,
  username          text,
  display_name      text,
  tag_line          text,
  contact_consent   boolean,
  public_on_profile boolean,
  verified_at       timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
    -- LEFT JOIN: a link whose user has no profile row is a reconciliation
    -- problem an admin must SEE, not a row the directory quietly drops.
    SELECT l.user_id, p.id, l.provider, l.provider_user_id, l.username,
           l.display_name, l.tag_line, l.contact_consent, l.public_on_profile,
           l.verified_at
      FROM public.user_identity_links l
      LEFT JOIN public.profiles p ON p.user_id = l.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_identity_links() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_identity_links() TO authenticated;

COMMIT;
