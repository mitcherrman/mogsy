-- M3 — Authenticated cross-user League profile reads.
--
-- Must land AFTER 20260728130000_league_profile_view_isolation.sql (M1).
--
-- WHAT THIS FIXES
-- Cross-user profile reads are currently broken end to end. public_profiles is
-- security_invoker, so RLS on public.profiles resolves every other user's row
-- to zero rows: useFriends falls back to display_name "Unknown" for every
-- friend (useFriends.ts:97-102) and /user/:profileId for anyone but yourself
-- hits the not-found path (UserProfile.tsx:288).
--
--
-- WHY THIS IS AN RPC AND NOT A POLICY ON public.profiles
-- The live policy set would have permitted a policy: 9 policies on profiles,
-- all PERMISSIVE, none RESTRICTIVE, SELECT limited to `auth.uid() = user_id`
-- and `has_role(admin)`. The blocker is column privileges, not row policies.
-- Verified live 2026-07-30: `authenticated` holds SELECT on ALL 31 columns of
-- public.profiles, including admin_notes and is_flagged_underage. The three
-- repo migrations that REVOKE SELECT on those columns (20260520094925,
-- 20260522053651, 20260609004202) are no-ops — a column-level REVOKE cannot
-- remove a table-level privilege, and the project's ALTER DEFAULT PRIVILEGES
-- grants arwdDxtm at table level. RLS is row-level; PostgREST lets a client
-- name any column. So any permissive cross-user SELECT policy on profiles
-- would expose admin_notes, is_flagged_underage, age, location, socials,
-- status_message and diamonds to every authenticated user via a direct
-- .from('profiles').select('*'), bypassing the M1 projection entirely.
--
--
-- WHY THIS IS AN RPC AND NOT A SECOND VIEW
-- A standing relation invites select('*'), so any column added to it later is
-- silently published to the whole authenticated population. A RETURNS TABLE
-- contract cannot be widened by a caller.
--
--
-- WHY user_id IS ABSENT
-- Seven /api/quiz/* endpoints in the League_Combat_Simulator backend adopt a
-- CLIENT-SUPPLIED user_id as the caller identity whenever no verified JWT is
-- present (routes/supabase_auth.py:132, resolve_user_id). Four of the seven are
-- writes. The only guard is REQUIRE_SUPABASE_AUTH, and it is CONFIRMED UNSET in
-- Railway production as of 2026-07-30.
--
-- Today those endpoints are not exploitable at scale because victim user_ids
-- are unobtainable: profiles RLS blocks cross-user reads. Publishing user_id in
-- a surface readable by every authenticated user supplies exactly the missing
-- identifier, enabling: authenticate -> harvest user_ids -> drop the
-- Authorization header -> read or write any victim's quiz record. Verified
-- identity overrides the client value, so the attack requires dropping the
-- token, which is why an authenticated-only surface does not mitigate it.
--
-- user_id stays out of this contract until that backend accepts only verified
-- identity. Remediating it is a separate backend security task (SEC1/SEC2) and
-- is NOT a prerequisite for applying this migration.
--
--
-- ON THE DELIBERATE RLS BYPASS
-- This function is owned by postgres, and public.profiles does not FORCE row
-- level security (verified: rls_forced = false), so the body sees all rows.
-- That is intended. The safety boundary is the fixed RETURNS TABLE column list
-- plus the auth.uid() gate and block filter below — not RLS. public.profiles
-- RLS and public.public_profiles are left completely untouched by this
-- migration.
--
-- Apply as `postgres`, in the Supabase SQL Editor, wrapped in BEGIN/COMMIT.
-- Do NOT use `supabase db push`.

CREATE OR REPLACE FUNCTION public.get_league_profiles(_profile_ids uuid[])
RETURNS TABLE (
  id            uuid,
  display_name  text,
  avatar_url    text,
  profile_frame text,
  is_pro        boolean,
  is_bot        boolean,
  is_anonymous  boolean,
  created_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id,
         p.display_name,
         p.avatar_url,
         p.profile_frame,
         p.is_pro,
         p.is_bot,          -- drives the thin-profile noindex rule
         p.is_anonymous,
         p.created_at       -- surfaced as the Mogzy join date
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL          -- unauthenticated callers get zero rows
    AND p.id = ANY(_profile_ids)
    AND NOT EXISTS (                    -- symmetric block filter, both directions
      SELECT 1
      FROM public.user_blocks b
      JOIN public.profiles me ON me.user_id = auth.uid()
      WHERE (b.blocker_profile_id = p.id  AND b.blocked_profile_id = me.id)
         OR (b.blocker_profile_id = me.id AND b.blocked_profile_id = p.id)
    )
  LIMIT 200;                            -- caps enumeration per call
$$;

-- New functions inherit EXECUTE for PUBLIC, anon, authenticated, service_role
-- and the two sandbox_exec roles from ALTER DEFAULT PRIVILEGES in this project.
-- PUBLIC and anon are removed explicitly. service_role and sandbox_exec* retain
-- EXECUTE by convention but resolve auth.uid() to NULL and therefore receive
-- zero rows.
REVOKE ALL ON FUNCTION public.get_league_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_league_profiles(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_league_profiles(uuid[]) IS
  'Authenticated cross-user League profile reads. Returns the approved 8-column '
  'League contract for the given profile ids, excluding profiles blocked in '
  'either direction. Deliberately omits user_id — see the migration header. '
  'Batch-in/batch-out: pass a one-element array for a single profile.';
