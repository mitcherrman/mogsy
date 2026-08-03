-- ===========================================================================
-- ADM2 Phase 0 — production precondition verification bundle.
--
-- READ-ONLY. Ten SELECTs. Nothing is created, altered, deleted or written.
-- Safe to run on production at any time.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste all of this -> Run.
--   Run it while signed in as the OWNER account, because check 10 reports on
--   whoever is executing the statement.
--
-- WHAT TO PASTE BACK
--   All ten result sets. They contain NO auth user ids, NO emails, NO display
--   names and NO profile ids -- only booleans, counts, function bodies and
--   role names. Check 10 returns a boolean, never an id.
--
-- WHY THIS IS NEEDED
--   The local environment holds only the publishable/anon key. That key can
--   prove a FUNCTION EXISTS (a permission error rather than "not found") but
--   it cannot read a trigger function's body, cannot see privileged counts and
--   cannot evaluate has_role. Checks 1-5 are the ones the ADM2 Phase A
--   migration depends on being exactly as the repository expects.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Does enforce_friendship_rules exist?
--    EXPECT: exactly 1 row, security_definer = true, and a fixed search_path.
--    If 0 rows, migration 20260730140000_friendship_hardening.sql was never
--    applied and the Phase A migration MUST NOT be run as written.
-- ---------------------------------------------------------------------------
SELECT
  '1. enforce_friendship_rules exists'          AS check_name,
  count(*)                                      AS found,
  bool_or(p.prosecdef)                          AS security_definer,
  max(array_to_string(p.proconfig, ', '))       AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'enforce_friendship_rules';


-- ---------------------------------------------------------------------------
-- 2. The full definition of enforce_friendship_rules.
--    EXPECT: the INSERT branch raises unless NEW.status = 'pending', and there
--    is NO admin exemption yet. This is the function Phase A replaces, so its
--    current text is also the rollback text -- keep this output.
-- ---------------------------------------------------------------------------
SELECT
  '2. enforce_friendship_rules definition'      AS check_name,
  pg_get_functiondef(p.oid)                     AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'enforce_friendship_rules';


-- ---------------------------------------------------------------------------
-- 3. Does notify_on_friendship_change exist?
--    EXPECT: exactly 1 row. Phase A does NOT modify this function; it relies
--    on its current behaviour.
-- ---------------------------------------------------------------------------
SELECT
  '3. notify_on_friendship_change exists'       AS check_name,
  count(*)                                      AS found,
  bool_or(p.prosecdef)                          AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'notify_on_friendship_change';


-- ---------------------------------------------------------------------------
-- 4. The full definition of notify_on_friendship_change.
--    CRITICAL EXPECTATION: the INSERT branch must be guarded by
--        IF TG_OP = 'INSERT' AND NEW.status = 'pending'
--    and the UPDATE branch by
--        ELSIF TG_OP = 'UPDATE' AND NEW.status = 'accepted' ...
--
--    Phase A's "Add to My Friends" inserts a row with status = 'accepted'
--    directly. That matches NEITHER branch, which is precisely why no false
--    friend-request notification is produced and why this function needs no
--    change. If the live body differs from this shape, STOP -- the
--    no-false-notification guarantee does not hold and the design must be
--    revisited.
-- ---------------------------------------------------------------------------
SELECT
  '4. notify_on_friendship_change definition'   AS check_name,
  pg_get_functiondef(p.oid)                     AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'notify_on_friendship_change';


-- ---------------------------------------------------------------------------
-- 5. Which triggers are attached to public.friendships, and are they enabled?
--    EXPECT: friendships_enforce_rules (BEFORE), friendships_notify (AFTER)
--    and update_friendships_updated_at, all with enabled = 'O' (origin, i.e.
--    normally enabled). Any 'D' means DISABLED.
-- ---------------------------------------------------------------------------
SELECT
  '5. friendships triggers'                     AS check_name,
  t.tgname                                      AS trigger_name,
  t.tgenabled                                   AS enabled_flag,
  CASE t.tgenabled
    WHEN 'O' THEN 'enabled (origin)'
    WHEN 'D' THEN 'DISABLED'
    WHEN 'R' THEN 'enabled (replica only)'
    WHEN 'A' THEN 'enabled (always)'
  END                                           AS enabled_meaning,
  CASE WHEN (t.tgtype & 2) <> 0 THEN 'BEFORE' ELSE 'AFTER' END AS timing
FROM pg_trigger t
WHERE t.tgrelid = 'public.friendships'::regclass
  AND NOT t.tgisinternal
ORDER BY t.tgname;


-- ---------------------------------------------------------------------------
-- 6. Friendship counts by status.
--    Counts only. No ids, no names.
-- ---------------------------------------------------------------------------
SELECT
  '6. friendships by status'                    AS check_name,
  f.status                                      AS status,
  count(*)                                      AS row_count
FROM public.friendships f
GROUP BY f.status
ORDER BY f.status;


-- ---------------------------------------------------------------------------
-- 7. Bot / non-bot / anonymous / disabled profile counts.
--    `disabled_column_exists` tells us whether a previous attempt already
--    added the soft-disable column. EXPECT false on a clean production DB.
-- ---------------------------------------------------------------------------
SELECT
  '7. profile counts'                                            AS check_name,
  count(*)                                                       AS total_profiles,
  count(*) FILTER (WHERE COALESCE(p.is_bot, false))              AS bots,
  count(*) FILTER (WHERE NOT COALESCE(p.is_bot, false))          AS non_bots,
  count(*) FILTER (WHERE COALESCE(p.is_anonymous, false))        AS anonymous,
  count(*) FILTER (WHERE COALESCE(p.is_pro, false))              AS pro,
  (SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles'
        AND column_name = 'is_disabled'))                        AS disabled_column_exists
FROM public.profiles p;


-- ---------------------------------------------------------------------------
-- 8. How many friendships already involve a bot on either side?
--    EXPECT 0 on a clean production DB. A non-zero value is not a blocker but
--    means "Add to My Friends" will report already_friends for those bots.
-- ---------------------------------------------------------------------------
SELECT
  '8. friendships involving a bot'              AS check_name,
  count(*)                                      AS bot_friendship_rows
FROM public.friendships f
JOIN public.profiles a ON a.id = f.requester_id
JOIN public.profiles b ON b.id = f.addressee_id
WHERE COALESCE(a.is_bot, false) OR COALESCE(b.is_bot, false);


-- ---------------------------------------------------------------------------
-- 9. Role counts.
--    Role names and counts only -- no user ids.
--    EXPECT at least one master_admin.
-- ---------------------------------------------------------------------------
SELECT
  '9. role counts'                              AS check_name,
  ur.role::text                                 AS role_name,
  count(*)                                      AS holders
FROM public.user_roles ur
GROUP BY ur.role
ORDER BY ur.role::text;


-- ---------------------------------------------------------------------------
-- 10. Does the account running THIS query hold master_admin?
--     Returns booleans only -- never an id.
--
--     NOTE: in the Supabase SQL Editor auth.uid() is normally NULL because the
--     editor runs as `postgres`, not as an end user. If executing_uid_present
--     is false, this check is INCONCLUSIVE from the editor -- confirm instead
--     by loading /admin/knowledge in the browser while signed in as the owner
--     (that route is already gated on roles={["master_admin"]}), or run this
--     same statement from an authenticated client session.
-- ---------------------------------------------------------------------------
SELECT
  '10. current account master_admin'            AS check_name,
  (auth.uid() IS NOT NULL)                      AS executing_uid_present,
  CASE WHEN auth.uid() IS NULL THEN NULL
       ELSE public.is_master_admin(auth.uid())
  END                                           AS is_master_admin,
  CASE WHEN auth.uid() IS NULL
       THEN 'INCONCLUSIVE from the SQL Editor -- see the note above'
       ELSE 'conclusive'
  END                                           AS interpretation;
