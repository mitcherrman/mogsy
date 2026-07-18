-- Ranked Tutorial onboarding completion (E2)
--
-- Durable, versioned, account-bound completion for the mandatory Ranked Tutorial.
-- This is intentionally SEPARATE from profiles.onboarding_completed (which gates the
-- existing profile-setup flow) so the tutorial can be versioned and replayed
-- independently.
--
-- Grandfathering: every profile that exists at migration time is stamped complete
-- with the sentinel version 0 ("pre-rollout account, never actually trained") so no
-- existing account is ever locked out. New signups created by handle_new_user()
-- insert with column defaults (NULL) => tutorial required.
--
-- No RLS change is required: the existing "Users can update own profile" policy
-- (FOR UPDATE USING auth.uid() = user_id) already lets a user stamp their own
-- completion, and no other user's row.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ranked_tutorial_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ranked_tutorial_version integer;

-- Grandfather all pre-existing accounts. Idempotent: COALESCE + the NULL guard mean
-- re-running never overwrites a real completion timestamp or version.
UPDATE public.profiles
  SET ranked_tutorial_completed_at = COALESCE(ranked_tutorial_completed_at, now()),
      ranked_tutorial_version = COALESCE(ranked_tutorial_version, 0)
  WHERE ranked_tutorial_completed_at IS NULL;

COMMENT ON COLUMN public.profiles.ranked_tutorial_completed_at IS
  'First time the account finished the mandatory Ranked Tutorial. NULL = required for eligible new accounts. First-write-wins: never overwritten on replay.';
COMMENT ON COLUMN public.profiles.ranked_tutorial_version IS
  'Onboarding contract version satisfied by the completion. 0 = grandfathered pre-rollout account; >=1 = actually completed that tutorial version.';
