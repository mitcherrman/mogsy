-- M2 — Friendship hardening.
--
-- Every constraint here lands VALIDATED immediately. That is safe because the
-- live preflight (2026-07-30) found the table pristine: 4 rows, all 'accepted',
-- all seeded 2026-03-08, and zero on every violation counter — no self-rows, no
-- orphan ids, no duplicate pairs, no reverse-direction pairs, no block
-- conflicts, no rate-limit exceeders, and no friend notifications at all. There
-- is nothing to reconcile, so no constraint needs a NOT VALID staging pass.
--
-- NO DATA IS MODIFIED OR DELETED. This migration adds constraints, indexes, two
-- functions, one trigger, and replaces one policy. Rolling back is a matter of
-- DROP CONSTRAINT / DROP INDEX / DROP TRIGGER / DROP FUNCTION plus restoring the
-- prior UPDATE policy (its original text is in
-- 20260308205107_35cde3d6-0ccd-41b6-b7c1-fcce63043b43.sql).
--
-- Apply as `postgres`, in the Supabase SQL Editor, wrapped in BEGIN/COMMIT.
-- Do NOT use `supabase db push`: the repo and the remote ledger have 117
-- drifted versions and a push would replay them.


-- ---------------------------------------------------------------------------
-- 1. Status domain
-- ---------------------------------------------------------------------------
-- Live data is 100% 'accepted'. The app only ever produces 'pending' (the
-- column default, used by useFriends.sendRequest and UserProfile) and
-- 'accepted' (useFriends.acceptRequest). 'declined' is permitted as a
-- forward-compatible terminal state so that decline-without-delete does not
-- need a migration later; today decline/cancel/remove all DELETE the row.
--
-- 'blocked' is deliberately NOT a status. public.user_blocks is the single
-- source of truth for blocking; the `blocked` value in the frontend's
-- FriendStatus union is derived from user_blocks and never written here.
ALTER TABLE public.friendships
  ADD CONSTRAINT friendships_status_check
  CHECK (status IN ('pending', 'accepted', 'declined'));


-- ---------------------------------------------------------------------------
-- 2. No self-friendship
-- ---------------------------------------------------------------------------
ALTER TABLE public.friendships
  ADD CONSTRAINT friendships_no_self
  CHECK (requester_id <> addressee_id);


-- ---------------------------------------------------------------------------
-- 3. No reverse-direction live pair
-- ---------------------------------------------------------------------------
-- The pre-existing UNIQUE (requester_id, addressee_id) stops A->B twice but
-- allows A->B and B->A to coexist. This closes that, and is PARTIAL so a
-- terminal 'declined' row cannot permanently block a fresh request.
--
-- LEAST/GREATEST over uuid is immutable (uuid btree comparison is immutable),
-- so it is valid in an index expression. If a future Postgres rejects it, the
-- equivalent fallback is:
--   ((CASE WHEN requester_id < addressee_id THEN requester_id ELSE addressee_id END),
--    (CASE WHEN requester_id < addressee_id THEN addressee_id ELSE requester_id END))
--
-- NOTE for a future decline-without-delete change: the plain
-- UNIQUE (requester_id, addressee_id) constraint would then also need to become
-- partial, or a declined A->B row would block a new A->B request.
CREATE UNIQUE INDEX friendships_unique_live_pair
  ON public.friendships (least(requester_id, addressee_id),
                         greatest(requester_id, addressee_id))
  WHERE status IN ('pending', 'accepted');


-- ---------------------------------------------------------------------------
-- 4. Supporting indexes
-- ---------------------------------------------------------------------------
-- The live table has only friendships_pkey and the requester/addressee unique
-- index. These serve the drawer's incoming-requests query and the rate-limit
-- lookup added in step 6.
CREATE INDEX friendships_addressee_status_idx
  ON public.friendships (addressee_id, status);

CREATE INDEX friendships_requester_created_idx
  ON public.friendships (requester_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- 5. Block check helper
-- ---------------------------------------------------------------------------
-- Must be SECURITY DEFINER. RLS on public.user_blocks exposes only blocks the
-- caller created ("Users can view own blocks" USING is_profile_owner(
-- blocker_profile_id)), so an invoker-side check can never see that the
-- ADDRESSEE blocked the requester — the exact case that matters.
CREATE OR REPLACE FUNCTION public.is_blocked_between(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_profile_id = _a AND b.blocked_profile_id = _b)
       OR (b.blocker_profile_id = _b AND b.blocked_profile_id = _a)
  )
$$;

-- New functions inherit EXECUTE for PUBLIC, anon, authenticated, service_role
-- from ALTER DEFAULT PRIVILEGES in this project. Narrow it, matching the
-- pattern established in 20260514042724_cff396f2-c01c-4fd1-be74-184a28c6430a.sql.
REVOKE ALL ON FUNCTION public.is_blocked_between(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 6. Guard trigger
-- ---------------------------------------------------------------------------
-- Enforces what a CHECK constraint cannot: cross-table block state, rate
-- limits, party immutability, and legal status transitions.
--
-- BEFORE, so that a rejected write aborts the statement before the AFTER
-- trigger `friendships_notify` can insert a user_notifications row. That is the
-- mechanism satisfying "invalid requests cannot trigger notifications" — no
-- change to notify_on_friendship_change is required.
--
-- No admin bypass: the only writers are useFriends and UserProfile, both of
-- which insert with the 'pending' default and update only to 'accepted'. No
-- admin tooling writes this table.
--
-- KNOWN LIMITATION — the rate limit is evadable. declineRequest,
-- cancelRequest and removeFriend all DELETE the row (useFriends.ts:142-157),
-- so a send -> cancel -> send loop never accumulates a count. This stops naive
-- bursts only. A non-evadable limit needs an append-only request-event log;
-- that is deliberately out of scope while the table holds 4 rows and has seen
-- zero request volume in 30 days.
CREATE OR REPLACE FUNCTION public.enforce_friendship_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _recent int;
  _open   int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'a new friendship must start as pending'
        USING ERRCODE = 'check_violation';
    END IF;

    IF public.is_blocked_between(NEW.requester_id, NEW.addressee_id) THEN
      RAISE EXCEPTION 'friend request refused: a block exists between these profiles'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO _recent
    FROM public.friendships f
    WHERE f.requester_id = NEW.requester_id
      AND f.created_at > now() - interval '1 hour';
    IF _recent >= 10 THEN
      RAISE EXCEPTION 'friend request rate limit exceeded (max 10 per hour)'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO _open
    FROM public.friendships f
    WHERE f.requester_id = NEW.requester_id
      AND f.status = 'pending';
    IF _open >= 20 THEN
      RAISE EXCEPTION 'too many open friend requests (max 20 outstanding)'
        USING ERRCODE = 'check_violation';
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- The UPDATE policy is USING/WITH CHECK on the addressee only, which alone
    -- would still let an addressee rewrite requester_id or hand the row to a
    -- third party. Parties are immutable for the life of the row.
    IF NEW.requester_id <> OLD.requester_id
       OR NEW.addressee_id <> OLD.addressee_id THEN
      RAISE EXCEPTION 'friendship parties are immutable'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined')) THEN
      RAISE EXCEPTION 'illegal friendship transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friendships_enforce_rules ON public.friendships;
CREATE TRIGGER friendships_enforce_rules
  BEFORE INSERT OR UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_friendship_rules();

-- Trigger functions are never invoked directly by clients. Firing a trigger
-- does not require EXECUTE on its function, so this revoke does not affect the
-- trigger; it only removes a direct-call surface.
REVOKE ALL ON FUNCTION public.enforce_friendship_rules() FROM PUBLIC, anon, authenticated;

-- Same treatment for the pre-existing notify trigger function, which was
-- created in 20260523081658 after the 20260514042724 hardening pass and so was
-- never included in it. Verified live: its ACL currently carries =X/postgres
-- (PUBLIC) and anon=X/postgres.
REVOKE ALL ON FUNCTION public.notify_on_friendship_change() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 7. Close the UPDATE policy's missing WITH CHECK
-- ---------------------------------------------------------------------------
-- Verified live: "Addressee can update friendship status" has
-- USING is_friendship_party(addressee_id) and with_check = NULL. Without a
-- WITH CHECK, the row the addressee writes back is unconstrained.
DROP POLICY IF EXISTS "Addressee can update friendship status" ON public.friendships;
CREATE POLICY "Addressee can update friendship status"
ON public.friendships FOR UPDATE TO authenticated
USING (is_friendship_party(addressee_id))
WITH CHECK (is_friendship_party(addressee_id));
