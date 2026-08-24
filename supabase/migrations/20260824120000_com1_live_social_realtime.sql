-- ---------------------------------------------------------------------------
-- COM1-2B — publish the two social tables so friendship state can be live.
--
-- WHAT WAS WRONG
-- COM1-2 shipped a correct, atomic, server-authoritative social model and no
-- way to learn that it had changed. `public.friendships` and
-- `public.user_blocks` are not members of the `supabase_realtime` publication,
-- so no client can subscribe to them, so every mutation was visible only to the
-- session that issued it:
--
--   * B accepts A's request  -> A's Friends list stays empty until A reloads
--   * A blocks B             -> B keeps A in their Friends list until B reloads
--   * decline / cancel / unfriend -> same, in both directions
--
-- `public.user_notifications` HAS been published since 20260225115950, which is
-- why the notification bell was the only social surface that ever updated live.
--
-- WHAT THIS CHANGES
-- Publication membership and replica identity. Nothing else: no table, column,
-- policy, function, trigger, grant or row is touched, and no new data is
-- exposed to anyone.
--
-- WHY THIS DISCLOSES NOTHING NEW
-- Realtime evaluates the table's RLS SELECT policy against the subscriber
-- before delivering a frame. Both policies already exist and are unchanged:
--
--   friendships  "Users can view own friendships"
--                  is_friendship_party(requester_id)
--               OR is_friendship_party(addressee_id)
--
--   user_blocks  "Users can view own blocks"
--                  is_profile_owner(blocker_profile_id)
--
-- So a subscriber receives exactly the rows they can already SELECT over
-- PostgREST, and not one row more. In particular a BLOCKED user is not told
-- about the block row — `user_blocks` is one-directional by policy — and that
-- is deliberate. They still converge, because `block_profile` deletes the
-- friendship rows in the same transaction and a friendship DELETE is visible to
-- both parties.
--
-- WHY REPLICA IDENTITY FULL IS REQUIRED, NOT COSMETIC
-- Under the default replica identity a DELETE writes only the primary key to
-- the WAL. Realtime then has no `requester_id`/`addressee_id` to test the RLS
-- policy or the subscription filter against, so it cannot prove the frame
-- belongs to the subscriber. Its two options are both wrong for us: drop the
-- event (unfriend, decline, cancel and block would never arrive — the very
-- cases this phase exists to fix) or deliver it unfiltered. FULL puts the old
-- row in the WAL, which makes the DELETE both authorised and filterable.
--
-- COST. FULL widens the WAL record for UPDATE and DELETE on these two tables
-- only. `friendships` is a narrow table (7 small columns) with one row per
-- relationship and a per-user write rate measured in single digits per day;
-- `user_blocks` is narrower and rarer still. This is not a hot path.
--
-- IDEMPOTENT. Safe to run twice; each ALTER is guarded on catalogue state.
--
-- Apply as `postgres`, in the Supabase SQL Editor, wrapped in BEGIN/COMMIT.
-- Do NOT use `supabase db push`: repo and remote ledger have drifted versions
-- and a push would replay them. (Same instruction as 20260823120000.)
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. Replica identity — must be set BEFORE the table joins the publication, so
--    no DELETE is ever published with a payload realtime cannot authorise.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'friendships' AND c.relreplident <> 'f'
  ) THEN
    EXECUTE 'ALTER TABLE public.friendships REPLICA IDENTITY FULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'user_blocks' AND c.relreplident <> 'f'
  ) THEN
    EXECUTE 'ALTER TABLE public.user_blocks REPLICA IDENTITY FULL';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2. Publication membership.
--
--    Guarded exactly like 20260803121000 did for admin_notification_reads:
--    ALTER PUBLICATION ... ADD TABLE raises `duplicate_object` if the table is
--    already a member, which would abort the surrounding transaction.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
       AND tablename = 'friendships'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
       AND tablename = 'user_blocks'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_blocks';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 3. Verification — run after COMMIT.
--
-- (a) Both tables published. Must return two rows.
--
--   SELECT tablename FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
--      AND tablename IN ('friendships', 'user_blocks')
--    ORDER BY tablename;
--
-- (b) Both tables FULL. Must return two rows, both relreplident = 'f'.
--
--   SELECT c.relname, c.relreplident
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relname IN ('friendships', 'user_blocks')
--    ORDER BY c.relname;
--
-- (c) The policies realtime will enforce are the ones documented above, and
--     were NOT modified by this migration. Must list the two SELECT policies.
--
--   SELECT tablename, policyname, cmd, qual
--     FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('friendships', 'user_blocks')
--      AND cmd = 'SELECT'
--    ORDER BY tablename, policyname;
--
-- (d) The acceptance notification this phase depends on is still written by
--     the COM1-1 trigger and still carries no auth id. Must return zero.
--
--   SELECT count(*) AS must_be_zero
--     FROM public.user_notifications
--    WHERE type IN ('friend_request', 'friend_accepted')
--      AND sent_by_user_id <> '00000000-0000-0000-0000-000000000000'::uuid;
-- ---------------------------------------------------------------------------
