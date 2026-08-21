-- Academy Registration: the self-reported League rank (HI1-C5B)
--
-- The Academy introduction now asks a new visitor for two things before the
-- tour: a name, and roughly where they play. The name has a home already —
-- profiles.display_name is what the whole product treats as an account's
-- display identity — but the rank had nowhere to live at all, so it sat in
-- localStorage and was not user data in any durable sense. This migration gives
-- it a home.
--
-- SELF-REPORTED, AND NAMED THAT WAY ON PURPOSE. This is what a person SAYS
-- their rank is. It is not verified against Riot, it is not Mogzy's own
-- progression tier (see below), and nothing may treat it as either. Any future
-- consumer — difficulty targeting, matchmaking hints, cohort reporting — is
-- reading an unverified claim, and `league_rank_reported_at` is there so it can
-- also ask how old that claim is. A League rank goes stale every split; a
-- self-report with no date on it silently becomes a lie.
--
-- NOT public.app_role, NOT the five-tier progression vocabulary. Mogzy's own
-- tiers (bronze/silver/gold/diamond/challenger, see src/lib/progression/
-- tiers.ts) are scored by quiz XP and by the Public Ranked rating; they are a
-- different scale that happens to share five words with this one. The CHECK
-- below is the Riot ladder plus the two honest non-answers, and the two
-- vocabularies must never be joined by a cast.
--
-- WHY A CHECK AND NOT AN ENUM. An enum would need its own type, its own grants,
-- and a migration to add a value; Riot has added a tier (Emerald) inside the
-- lifetime of this codebase and will do it again. A CHECK is one ALTER to
-- change, and it keeps the column readable as plain text everywhere.
--
-- NO RLS CHANGE IS REQUIRED. The existing "Users can update own profile" policy
-- (FOR UPDATE USING auth.uid() = user_id) already lets an account write its own
-- row and no one else's, which is exactly the access this needs. Nothing here
-- grants anon anything: a signed-out visitor cannot reach this column at all,
-- which is precisely why the client keeps a local record and adopts it once a
-- session exists (see src/lib/welcome/provisional-identity.ts).
--
-- NOTHING IS BACKFILLED. Unlike the ranked-tutorial migration, there is no
-- sensible grandfathered value here: NULL means "this account has never told us
-- where it plays", which is true of every account that exists today and is a
-- state the product has to handle regardless.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS league_rank text,
  ADD COLUMN IF NOT EXISTS league_rank_reported_at timestamptz;

-- Idempotent: re-running the migration must not fail on an existing constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_league_rank_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_league_rank_check
      CHECK (
        league_rank IS NULL OR league_rank IN (
          'unranked',
          'iron',
          'bronze',
          'silver',
          'gold',
          'platinum',
          'emerald',
          'diamond',
          'master',
          'grandmaster',
          'challenger',
          'unsure'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.league_rank IS
  'SELF-REPORTED League of Legends rank, lower-case tier id. Never verified against Riot, and NOT Mogzy''s own progression tier. NULL = never asked or never answered. ''unranked'' and ''unsure'' are real answers, not absences.';
COMMENT ON COLUMN public.profiles.league_rank_reported_at IS
  'When league_rank was last self-reported. A League rank goes stale every split; consumers must weigh the claim by its age.';
