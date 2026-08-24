-- ===========================================================================
-- COM1-2 — Community reachability and blocking as a first-class relationship.
--
-- Two problems, one migration, because they are the same problem seen twice:
-- a user cannot FIND another user, and the block that is supposed to stop them
-- interacting is assembled from two unsynchronised client statements.
--
-- WHAT THIS ADDS
--   1. public.pair_lock_key(uuid, uuid)        — order-independent pair lock id
--   2. public.enforce_friendship_rules()       — REWRITTEN: pair-scoped advisory
--                                                lock on INSERT, block re-check
--                                                on the accept transition
--   3. public.search_league_profiles(text,int) — username discovery
--   4. public.get_relationship_state(uuid)     — the canonical A↔B check
--   5. public.get_blocked_profiles()           — the drawer's Blocked tab
--   6. public.block_profile(uuid)              — ATOMIC block + unfriend
--   7. public.unblock_profile(uuid)            — idempotent, restores nothing
--
-- WHAT THIS DOES NOT ADD
-- No new table, no new column, no widened RLS policy on public.profiles.
-- `public.profiles` stays owner-only; every cross-user read below is a
-- SECURITY DEFINER function with an explicit column list, exactly as
-- 20260730150000 (`get_league_profiles`) established. `user_blocks` remains the
-- single blocking authority — `friendships.status` still has no 'blocked'.
--
-- IDENTITY
-- No function here returns `profiles.user_id`. That identifier is what
-- 20260730150000 was written to withhold and what COM1-1 finished removing from
-- the notification and Ranked surfaces; a discovery endpoint publishing it
-- would hand back the enumeration key both phases just closed.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Pair lock key
--
-- Blocking and friend-requesting are two writers racing over the same LOGICAL
-- object — the ordered pair {A,B} — that has no single row to lock. Under READ
-- COMMITTED the interleaving is real and reachable:
--
--     T1 (A requests B)                 T2 (B blocks A)
--     BEGIN                             BEGIN
--     trigger: is_blocked_between → f   |
--     |                                 INSERT user_blocks           (uncommitted)
--     |                                 DELETE friendships           (sees nothing)
--     |                                 COMMIT
--     INSERT friendships                (block gate already passed)
--     COMMIT
--     => a live friendship AND a block, simultaneously.
--
-- A pair-scoped transaction advisory lock serialises the two. Both writers take
-- it FIRST, before any row lock, so the acquisition order is identical on both
-- sides and the pair cannot deadlock against itself.
--
-- The key is order-independent: block_profile(A,B) and a friendship row stored
-- B→A must hash to the same lock.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pair_lock_key(_a uuid, _b uuid)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT hashtextextended(
           least(_a, _b)::text || ':' || greatest(_a, _b)::text,
           0
         );
$$;

COMMENT ON FUNCTION public.pair_lock_key(uuid, uuid) IS
  'COM1-2: order-independent advisory-lock key for the profile pair {a,b}. Held by block_profile() and by enforce_friendship_rules() on INSERT so a request and a block cannot cross.';

REVOKE ALL ON FUNCTION public.pair_lock_key(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pair_lock_key(uuid, uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 2. enforce_friendship_rules — rewritten
--
-- Every rule from 20260730140000 is preserved verbatim. Two things are added:
--
--   INSERT: take the pair lock BEFORE testing is_blocked_between, so the test
--           and the insert are one critical section with respect to any
--           concurrent block on the same pair.
--
--   UPDATE: a pending row may not be accepted across a block. block_profile()
--           deletes the row, so in practice the accept finds nothing — but the
--           UPDATE branch had NO block test at all, and "cannot remain
--           actionable" should be enforced by the rule, not only by the race
--           having gone the other way.
--
-- The rate limits are unchanged and remain evadable exactly as
-- 20260730140000 documents (decline/cancel/remove all DELETE). Closing that
-- needs an append-only event log and is not this phase.
-- ---------------------------------------------------------------------------
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

    -- COM1-2. Serialise against block_profile() on this pair. Taken before the
    -- block test so a block committing concurrently is either fully visible
    -- here or fully behind us.
    PERFORM pg_advisory_xact_lock(
      public.pair_lock_key(NEW.requester_id, NEW.addressee_id)
    );

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

    -- COM1-2. A pending request cannot be accepted across a block. Same
    -- message vocabulary as the INSERT branch so the client's classifier maps
    -- both to the same neutral 'refused' sentence and neither names a cause.
    IF NEW.status = 'accepted'
       AND OLD.status = 'pending'
       AND public.is_blocked_between(NEW.requester_id, NEW.addressee_id) THEN
      RAISE EXCEPTION 'friend request refused: a block exists between these profiles'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_friendship_rules() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. search_league_profiles — the one discovery path
--
-- AUTH3 made `profiles.display_name` the canonical, case-insensitively unique
-- public username and installed `profiles_display_name_unique_ci` over
-- `normalize_display_name(display_name)`. This function searches that same
-- normalised form, so "find a player" and "is this name taken" agree by
-- construction.
--
-- WHAT IS DELIBERATELY EXCLUDED, and why
--
--   * Unclaimed names. `is_claimed_display_name` is the AUTH3 predicate that
--     drives the uniqueness index: an anonymous row still carrying its
--     generated `Anonymous1234` placeholder is not an identity anyone chose,
--     so it is not a search result. A guest who picked a real name IS claimed
--     and IS findable — the test is the name, not the account tier.
--
--   * Bot personas. `admin_create_bot_profile` provisions no `auth.users` row
--     (ADM2 §8), so a bot has no session and can never accept a friend
--     request. Listing one would offer an action that cannot complete. Bots
--     remain fully visible to admins through `admin_list_profiles()`, and an
--     admin still links them with `admin_link_friendship`.
--
--   * Disabled profiles (`is_disabled`). Soft-retired; the same reasoning.
--
--   * Profiles that blocked the caller. They are absent, not marked — absence
--     carries no information, whereas an "unavailable" badge would tell the
--     caller a block exists and who created it. This is the same discipline as
--     the Stat Check backend's SC_INVITE_BLOCKED ("This invite is not
--     available"). Profiles the CALLER blocked are returned, tagged
--     'blocked': that is the caller's own knowledge, and it is what makes the
--     result actionable (unblock) instead of mysteriously missing.
--
-- ENUMERATION
-- Two normalised characters minimum, LIMIT hard-capped at 20 regardless of the
-- argument, and no ordering by anything an attacker controls. This is a lookup,
-- not a directory: `admin_list_profiles()` remains the only full enumeration
-- and it still requires has_role(admin).
--
-- RANKING (`match_rank`, ascending)
--   0  exact normalised equality — AUTH3 guarantees at most one such row
--   1  prefix
--   2  substring
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_league_profiles(
  _query text,
  _limit int DEFAULT 10
)
RETURNS TABLE (
  id             uuid,
  display_name   text,
  avatar_url     text,
  profile_frame  text,
  is_pro         boolean,
  is_bot         boolean,
  is_anonymous   boolean,
  created_at     timestamptz,
  is_disabled    boolean,
  relationship   text,
  friendship_id  uuid,
  match_rank     int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- The projection is wrapped in a subquery and ORDER BY reads the INNER
  -- aliases, never the RETURNS TABLE output names. In a LANGUAGE sql function
  -- an unqualified name that matches an output parameter is resolved as that
  -- parameter, so `ORDER BY match_rank` would not mean the computed column.
  SELECT s.p_id,
         s.p_display_name,
         s.p_avatar_url,
         s.p_profile_frame,
         s.p_is_pro,
         s.p_is_bot,
         s.p_is_anonymous,
         s.p_created_at,
         s.p_is_disabled,
         s.p_relationship,
         s.p_friendship_id,
         s.p_match_rank
  FROM (
    WITH me AS (
      SELECT p.id
      FROM public.profiles p
      WHERE auth.uid() IS NOT NULL
        AND p.user_id = auth.uid()
      LIMIT 1
    ),
    q AS (
      -- LIKE metacharacters in a username are matched literally: a search for
      -- "100%" must not become a wildcard. ESCAPE '\' is stated on every LIKE
      -- below, so the backslash introduced here is the escape character.
      SELECT
        public.normalize_display_name(_query) AS needle,
        replace(
          replace(
            replace(public.normalize_display_name(_query), '\', '\\'),
            '%', '\%'),
          '_', '\_') AS pattern
    )
    SELECT p.id                       AS p_id,
           p.display_name             AS p_display_name,
           p.avatar_url               AS p_avatar_url,
           p.profile_frame            AS p_profile_frame,
           p.is_pro                   AS p_is_pro,
           p.is_bot                   AS p_is_bot,
           p.is_anonymous             AS p_is_anonymous,
           p.created_at               AS p_created_at,
           p.is_disabled              AS p_is_disabled,
           CASE
             WHEN mine.blocked THEN 'blocked'
             WHEN f.status = 'accepted' THEN 'friends'
             WHEN f.status = 'pending' AND f.requester_id = me.id THEN 'outgoing'
             WHEN f.status = 'pending' THEN 'incoming'
             ELSE 'none'
           END                        AS p_relationship,
           -- Withheld for a blocked profile: there is no friendship row left to
           -- act on, and the only offered action is unblock.
           CASE WHEN mine.blocked THEN NULL ELSE f.id END
                                      AS p_friendship_id,
           CASE
             WHEN public.normalize_display_name(p.display_name) = q.needle THEN 0
             WHEN public.normalize_display_name(p.display_name)
                  LIKE q.pattern || '%' ESCAPE '\' THEN 1
             ELSE 2
           END                        AS p_match_rank,
           public.normalize_display_name(p.display_name) AS p_sort_name
    FROM public.profiles p
    CROSS JOIN q
    JOIN me ON true
    LEFT JOIN LATERAL (
      SELECT EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE b.blocker_profile_id = me.id
          AND b.blocked_profile_id = p.id
      ) AS blocked
    ) mine ON true
    LEFT JOIN LATERAL (
      -- The M2 partial unique index guarantees at most one live row per pair,
      -- so this is deterministic without an ORDER BY -- unlike the client's
      -- `rows[0]`, which is not.
      SELECT f2.id, f2.status, f2.requester_id
      FROM public.friendships f2
      WHERE f2.status IN ('pending', 'accepted')
        AND least(f2.requester_id, f2.addressee_id) = least(me.id, p.id)
        AND greatest(f2.requester_id, f2.addressee_id) = greatest(me.id, p.id)
      LIMIT 1
    ) f ON true
    WHERE length(q.needle) >= 2
      AND p.id <> me.id
      AND COALESCE(p.is_bot, false) = false
      AND COALESCE(p.is_disabled, false) = false
      AND public.is_claimed_display_name(p.display_name, p.is_anonymous)
      AND public.normalize_display_name(p.display_name)
          LIKE '%' || q.pattern || '%' ESCAPE '\'
      -- Hide only the blocks the OTHER party created. See the header.
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE b.blocker_profile_id = p.id
          AND b.blocked_profile_id = me.id
      )
  ) s
  ORDER BY s.p_match_rank, s.p_sort_name, s.p_id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 10), 1), 20);
$$;

COMMENT ON FUNCTION public.search_league_profiles(text, int) IS
  'COM1-2: username discovery over the AUTH3 normalised name. Excludes self, bots, disabled and unclaimed-name profiles, and profiles that blocked the caller. Never returns profiles.user_id. Min 2 chars, max 20 rows.';

REVOKE ALL ON FUNCTION public.search_league_profiles(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_league_profiles(text, int) TO authenticated;


-- ---------------------------------------------------------------------------
-- 4. get_relationship_state — the canonical A↔B check
--
-- One place that answers "what is my relationship with this profile, and may I
-- send them something". COM1-3 (quiz sending) is expected to consume this
-- rather than re-deriving the answer from `friendships` and `user_blocks` in
-- the client, which is how `useFriendStatus` came to report "Add Friend" for
-- someone whose every request the trigger refuses.
--
-- NO BLOCK DISCLOSURE. A block the CALLER created is the caller's own
-- knowledge and is reported as 'blocked'. A block the OTHER party created
-- changes NOTHING in this answer: relationship stays 'none' and `can_request`
-- stays true. The refusal happens at the write, in the trigger, and reaches the
-- user as the same neutral sentence any other refusal does. Reporting it here
-- would hand back exactly what the blocker withheld.
--
-- `can_request` is therefore an ELIGIBILITY hint, not a guarantee. The database
-- remains the authority: enforce_friendship_rules() is what actually decides.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_relationship_state(_target_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me           uuid;
  _relationship text := 'none';
  _friendship   uuid;
  _row          record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('relationship', 'unavailable',
                              'friendship_id', NULL,
                              'can_request', false);
  END IF;

  SELECT p.id INTO _me
  FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;

  IF _me IS NULL OR _target_profile_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _target_profile_id) THEN
    RETURN jsonb_build_object('relationship', 'unavailable',
                              'friendship_id', NULL,
                              'can_request', false);
  END IF;

  IF _target_profile_id = _me THEN
    RETURN jsonb_build_object('relationship', 'self',
                              'friendship_id', NULL,
                              'can_request', false);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE b.blocker_profile_id = _me
      AND b.blocked_profile_id = _target_profile_id
  ) THEN
    RETURN jsonb_build_object('relationship', 'blocked',
                              'friendship_id', NULL,
                              'can_request', false);
  END IF;

  SELECT f.id, f.status, f.requester_id INTO _row
  FROM public.friendships f
  WHERE f.status IN ('pending', 'accepted')
    AND least(f.requester_id, f.addressee_id) = least(_me, _target_profile_id)
    AND greatest(f.requester_id, f.addressee_id) = greatest(_me, _target_profile_id)
  LIMIT 1;

  IF FOUND THEN
    _friendship := _row.id;
    _relationship := CASE
      WHEN _row.status = 'accepted' THEN 'friends'
      WHEN _row.requester_id = _me   THEN 'outgoing'
      ELSE 'incoming'
    END;
  END IF;

  RETURN jsonb_build_object(
    'relationship', _relationship,
    'friendship_id', _friendship,
    'can_request', _relationship = 'none'
  );
END;
$$;

COMMENT ON FUNCTION public.get_relationship_state(uuid) IS
  'COM1-2: canonical caller<->target relationship. self|none|outgoing|incoming|friends|blocked|unavailable. A block created by the OTHER party is deliberately not disclosed; the write path refuses neutrally instead.';

REVOKE ALL ON FUNCTION public.get_relationship_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_relationship_state(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 5. get_blocked_profiles — the drawer's Blocked tab
--
-- The tab has rendered empty since it was written. It read profiles through
-- `get_league_profiles`, which filters out anything blocked in EITHER
-- direction — precisely this set. The names were never fetchable by that path.
--
-- Deliberately NOT a variant of get_league_profiles: this returns only rows the
-- CALLER blocked, so it cannot be used to discover who blocked the caller.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_blocked_profiles()
RETURNS TABLE (
  id            uuid,
  display_name  text,
  avatar_url    text,
  profile_frame text,
  is_pro        boolean,
  is_bot        boolean,
  is_anonymous  boolean,
  created_at    timestamptz,
  is_disabled   boolean,
  blocked_at    timestamptz
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
         p.is_bot,
         p.is_anonymous,
         p.created_at,
         p.is_disabled,
         b.created_at AS blocked_at
  FROM public.user_blocks b
  JOIN public.profiles p ON p.id = b.blocked_profile_id
  WHERE auth.uid() IS NOT NULL
    AND b.blocker_profile_id = (
      SELECT me.id FROM public.profiles me WHERE me.user_id = auth.uid() LIMIT 1
    )
  ORDER BY b.created_at DESC
  LIMIT 200;
$$;

COMMENT ON FUNCTION public.get_blocked_profiles() IS
  'COM1-2: profiles the CALLER has blocked, for the Community drawer Blocked tab. Never reveals blocks created by others. No profiles.user_id.';

REVOKE ALL ON FUNCTION public.get_blocked_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_blocked_profiles() TO authenticated;


-- ---------------------------------------------------------------------------
-- 6. block_profile — ATOMIC block + unfriend
--
-- Replaces a client sequence that was three statements and one transaction per
-- statement (`useBlocks.blockUser`): insert the block, read the friendships,
-- delete them. A failure between them left "blocked but still friends", and
-- COM1-1 could only make that visible, not impossible.
--
-- Here the block and the unfriend commit together or not at all, under the pair
-- lock, so no concurrent friend request can slip between them.
--
-- Returns the ADM2 `{ok, code}` envelope. Codes:
--   blocked  — the block was created (and any friendship removed)
--   already  — the block already existed; still re-runs the unfriend sweep, so
--              a half-completed older attempt is repaired by a retry
--   self     — cannot block yourself
--   stale    — no such profile, or the caller has no profile row
--   forbidden— not authenticated
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_profile(_target_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me       uuid;
  _inserted int;
  _removed  int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;

  SELECT p.id INTO _me
  FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;

  IF _me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stale');
  END IF;

  IF _target_profile_id IS NULL OR _target_profile_id = _me THEN
    RETURN jsonb_build_object('ok', false, 'code', 'self');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _target_profile_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stale');
  END IF;

  PERFORM pg_advisory_xact_lock(public.pair_lock_key(_me, _target_profile_id));

  INSERT INTO public.user_blocks (blocker_profile_id, blocked_profile_id)
  VALUES (_me, _target_profile_id)
  ON CONFLICT (blocker_profile_id, blocked_profile_id) DO NOTHING;
  GET DIAGNOSTICS _inserted = ROW_COUNT;

  -- Direction-agnostic, and every status: an accepted friendship, a request
  -- this user sent, and a request they received all stop existing. "Pending
  -- requests cannot remain actionable" is enforced by their absence, and by the
  -- accept-transition block test added in section 2 for the row that a
  -- concurrent transaction may still hold.
  DELETE FROM public.friendships f
  WHERE least(f.requester_id, f.addressee_id)
        = least(_me, _target_profile_id)
    AND greatest(f.requester_id, f.addressee_id)
        = greatest(_me, _target_profile_id);
  GET DIAGNOSTICS _removed = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'code', CASE WHEN _inserted > 0 THEN 'blocked' ELSE 'already' END,
    'friendships_removed', _removed
  );
END;
$$;

COMMENT ON FUNCTION public.block_profile(uuid) IS
  'COM1-2: block a profile and remove every friendship row with it, in ONE transaction under the pair advisory lock. Idempotent. Returns {ok, code, friendships_removed}.';

REVOKE ALL ON FUNCTION public.block_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.block_profile(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 7. unblock_profile
--
-- Removes the block and NOTHING else. It restores eligibility to interact; it
-- does not restore the friendship the block destroyed, and it never re-sends a
-- request. Rebuilding the relationship is an ordinary, deliberate act by
-- whichever party wants it — silently resurrecting a friendship someone chose
-- to end would be the worst possible reading of "unblock".
--
-- Idempotent: unblocking someone who is not blocked is 'already', not an error.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unblock_profile(_target_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me      uuid;
  _removed int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;

  SELECT p.id INTO _me
  FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;

  IF _me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stale');
  END IF;

  DELETE FROM public.user_blocks b
  WHERE b.blocker_profile_id = _me
    AND b.blocked_profile_id = _target_profile_id;
  GET DIAGNOSTICS _removed = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'code', CASE WHEN _removed > 0 THEN 'unblocked' ELSE 'already' END
  );
END;
$$;

COMMENT ON FUNCTION public.unblock_profile(uuid) IS
  'COM1-2: remove the caller''s block on a profile. Restores eligibility to interact; deliberately does NOT recreate any friendship. Idempotent.';

REVOKE ALL ON FUNCTION public.unblock_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unblock_profile(uuid) TO authenticated;
