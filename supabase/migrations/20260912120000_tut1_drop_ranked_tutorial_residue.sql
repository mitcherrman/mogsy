-- TUT1 hard cleanup — drop the scripted Ranked tutorial's database residue.
--
-- The scripted Ranked tutorial was removed from the product in `33d27b2f`.
-- That change stopped every reader and writer but deliberately left the
-- storage dormant, on the assumption that existing accounts' completion state
-- might still matter. It does not: there are no users whose old tutorial state
-- needs preserving, so the residue is deleted rather than carried.
--
-- WHAT THIS TOUCHES, AND NOTHING ELSE:
--
--   profiles.ranked_tutorial_completed_at
--   profiles.ranked_tutorial_version
--     Added by 20260718120000_ranked_tutorial_completion.sql for the forced
--     tutorial gate. No application code has read or written them since
--     `33d27b2f`, and no database object depends on them BY NAME — no index,
--     no constraint, no RLS policy, no view, no trigger, and no function
--     signature. `handle_new_user()` (current definition in
--     20260822120000_auth3_canonical_username.sql) inserts only
--     (user_id, display_name, is_anonymous) and never referenced them.
--
--     `admin_list_profiles()` is `RETURNS SETOF public.profiles` with
--     `SELECT *`. That is a dependency on the TABLE'S ROW TYPE, not on these
--     columns, so the function follows the new shape automatically and needs
--     no redefinition. It is deliberately NOT recreated here: touching an
--     admin security-definer function to drop two unrelated columns would be
--     a larger change than the cleanup warrants.
--
--   app_settings rows 'tutorial_auto_popup_enabled' and
--   'tutorial_completion_required_for_new_users'
--     Seeded by 20260730120000_platform_access_tutorial_policies.sql. Since
--     `33d27b2f` the frontend's POLICY_KEYS no longer names them and
--     parsePlatformPolicy no longer parses them, so their value in any state
--     already produced the default policy. The backend never enforced them
--     (services/platform_policy.py enforces only Combat Sim tokens and Global
--     Premium Access). They are inert rows in a key/value store: deleting
--     them removes two dead keys from the admin's view of that table and
--     changes no behaviour.
--
-- The two migrations that created this residue are NOT edited. They are
-- applied history; this migration is the correction on top of them.
--
-- Idempotent: IF EXISTS on the drops, a plain DELETE on the rows. Re-running
-- is a no-op.

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS ranked_tutorial_completed_at,
  DROP COLUMN IF EXISTS ranked_tutorial_version;

DELETE FROM public.app_settings
  WHERE key IN (
    'tutorial_auto_popup_enabled',
    'tutorial_completion_required_for_new_users'
  );
