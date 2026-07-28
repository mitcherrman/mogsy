-- League profile isolation.
--
-- The legacy Mogsy profile was a dating profile. `age`, `location`,
-- `status_message`, `socials` and `custom_theme` remain in public.profiles,
-- still owned and still editable by their owner -- this migration only stops
-- the PUBLIC projection from carrying them, so they cannot reach a League
-- surface, a cross-user query, page metadata, JSON-LD or a social preview.
--
-- NO DATA IS DELETED. No column is dropped. No table is dropped. Rolling this
-- back is a single CREATE VIEW with the previous column list
-- (supabase/migrations/20260615053533_29904b31-f0bb-4b98-8850-6389fd1bce05.sql).
--
-- This migration deliberately adds NO policy. Cross-user reads of public.profiles
-- remain impossible after it runs, exactly as before: the surviving SELECT
-- policies are still owner-only and admin-only, and anon still cannot evaluate
-- them (EXECUTE on has_role was revoked from anon/public in
-- 20260514042724_cff396f2-c01c-4fd1-be74-184a28c6430a.sql). Granting authenticated
-- cross-user SELECT is a separate, later migration and must never land before
-- this one.
--
-- security_invoker is preserved: the view must keep evaluating the caller's RLS
-- rather than the view owner's, or it would become a way around those policies.

DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles
WITH (security_invoker = true) AS
  SELECT
    id,             -- public profile identifier used in /user/:profileId
    user_id,        -- auth subject; the key every /api/quiz/* endpoint uses
    display_name,
    avatar_url,
    profile_frame,
    is_pro,
    is_bot,         -- drives the thin-profile noindex rule
    is_anonymous,
    created_at,     -- surfaced as the Mogzy join date
    updated_at
  FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Note on the anon grant: it is carried over verbatim from the previous view
-- and is NOT what makes rows readable. Row visibility is decided by RLS on
-- public.profiles, under which anon currently resolves to zero rows. Removing
-- the grant here would be a behaviour change beyond the scope of this
-- migration, so it is left exactly as it was.
