-- ---------------------------------------------------------------------------
-- COM1-1 / P0-3 — an admin-created bot persona obeys the same public-name
-- rules as a person.
--
-- WHAT WAS WRONG
-- ADM2 (20260803120000) predates AUTH3 (20260822120000) and was never
-- revisited. `admin_create_bot_profile` and `admin_update_bot_profile` write
-- `public.profiles.display_name` DIRECTLY, validating only
-- `'' < length <= 60`. AUTH3 then made `display_name` the canonical public
-- Mogzy username, with `set_display_name()` as its one write path and
-- `profiles_display_name_unique_ci` as the backstop. That backstop is LIVE.
--
-- Three consequences, all present-tense:
--
--  1. RAW unique_violation. A bot named after an existing account hits the
--     backstop index, and the exception escapes a function whose entire
--     contract is "returns jsonb {ok, code}". The admin UI renders a Postgres
--     error string, and the audit row is rolled back with it — so the failed
--     attempt leaves no trace.
--  2. RESERVED NAMES. `is_reserved_display_name` refuses 'Admin', 'Moderator',
--     'Mogzy', 'System', 'Support' and the 'Anonymous<n>' placeholder shape to
--     every human. A bot could take any of them — and impersonating a
--     moderator is the exact case AUTH3's reserved list exists for.
--  3. SHAPE. AUTH3 binds a person to 2..24 characters from a fixed class. A
--     bot could hold 1..60 characters of anything, including control
--     characters and direction overrides, and that name is rendered in the
--     friends drawer beside real ones.
--
-- WHAT THIS DOES
-- Routes both admin RPCs through the AUTH3 functions rather than duplicating
-- their rules: `clean_display_name`, `display_name_problem`,
-- `normalize_display_name`, `is_claimed_display_name`. There is no second
-- validation regime to drift — that was the whole point of AUTH3, and this is
-- the one caller it missed.
--
-- WHAT IS DELIBERATELY UNCHANGED
--   * No auth.users row is created. A bot persona still has a fabricated
--     `profiles.user_id` and cannot authenticate. That is by design and this
--     migration does not touch it.
--   * is_bot / is_disabled semantics, the auto-friend hand-off to
--     admin_link_friendship, every audit row, and the master_admin gate.
--   * The uniqueness rule binds bots because a bot's name IS claimed
--     (`is_claimed_display_name` is true: non-empty and not an anonymous
--     placeholder), which is correct — a bot the drawer shows beside people
--     must not be able to duplicate a person's name.
--
-- RESULT CONTRACT — the code vocabulary widens; the shape does not.
-- Existing codes are unchanged. `invalid_display_name` remains for a name that
-- is empty or absurdly long, and the AUTH3 codes are now reachable:
--   too_short | too_long | invalid_characters | reserved | taken
-- The frontend already maps every one of these (src/lib/identity/username.ts).
--
-- Apply as `postgres`, in the Supabase SQL Editor, wrapped in BEGIN/COMMIT.
-- Must land AFTER 20260822120000_auth3_canonical_username.sql.
-- Do NOT use `supabase db push`.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. Shared name check for the bot RPCs.
--
-- Returns NULL when the name is usable, otherwise the AUTH3 problem code. The
-- uniqueness half must be SECURITY DEFINER-visible, which it is: both callers
-- already are, and this is invoked from inside them.
--
-- `_self_profile_id` lets the UPDATE path re-save a bot's own name (including a
-- pure re-capitalisation) without colliding with itself — the same
-- accommodation `set_display_name` makes for a person renaming themselves.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bot_display_name_problem(
  _name            text,
  _self_profile_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cleaned text := public.clean_display_name(_name);
  problem text := public.display_name_problem(_name);
BEGIN
  IF problem IS NOT NULL THEN
    RETURN problem;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE public.is_claimed_display_name(p.display_name, p.is_anonymous)
       AND public.normalize_display_name(p.display_name)
         = public.normalize_display_name(cleaned)
       AND (_self_profile_id IS NULL OR p.id IS DISTINCT FROM _self_profile_id)
  ) THEN
    RETURN 'taken';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.bot_display_name_problem(text, uuid)
  FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. Create a bot persona — now name-checked.
--
-- Body is the ADM2 original with the validation block replaced and the INSERT
-- wrapped. Everything after the name check — the audit row, the auto-friend
-- hand-off, the return shape — is untouched.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_bot_profile(
  _display_name   text,
  _avatar_url     text    DEFAULT NULL,
  _profile_frame  text    DEFAULT NULL,
  _add_to_my_friends boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_uid     uuid := auth.uid();
  _actor_profile uuid;
  -- Stored in the AUTH3 display form: whitespace collapsed and trimmed, the
  -- capitalisation the admin chose preserved.
  _name          text := public.clean_display_name(_display_name);
  _problem       text;
  _new_profile   uuid;
  _friend_result jsonb := NULL;
BEGIN
  IF _actor_uid IS NULL OR NOT public.is_master_admin(_actor_uid) THEN
    RAISE EXCEPTION 'master_admin authorization required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT p.id INTO _actor_profile
  FROM public.profiles p WHERE p.user_id = _actor_uid LIMIT 1;

  _problem := public.bot_display_name_problem(_name, NULL);
  IF _problem IS NOT NULL THEN
    INSERT INTO public.admin_audit_log
      (actor_user_id, actor_profile_id, action, target_profile_id, result, detail)
    VALUES (_actor_uid, _actor_profile, 'admin_create_bot_profile', NULL,
            _problem, jsonb_build_object('requested_display_name', _name));
    RETURN jsonb_build_object('ok', false, 'code', _problem,
                              'profile_id', NULL, 'friendship', NULL);
  END IF;

  -- The check above and this write are not one statement, so a concurrent
  -- claim can still win the race. The backstop index catches it; this turns
  -- that into the SAME friendly code rather than a raw 23505 escaping a
  -- jsonb-contract function. Identical to how set_display_name handles it.
  BEGIN
    INSERT INTO public.profiles (user_id, display_name, avatar_url,
                                 profile_frame, is_bot, is_disabled)
    VALUES (gen_random_uuid(), _name,
            NULLIF(btrim(COALESCE(_avatar_url, '')), ''),
            NULLIF(btrim(COALESCE(_profile_frame, '')), ''),
            true, false)
    RETURNING id INTO _new_profile;
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO public.admin_audit_log
        (actor_user_id, actor_profile_id, action, target_profile_id, result, detail)
      VALUES (_actor_uid, _actor_profile, 'admin_create_bot_profile', NULL,
              'taken', jsonb_build_object('requested_display_name', _name));
      RETURN jsonb_build_object('ok', false, 'code', 'taken',
                                'profile_id', NULL, 'friendship', NULL);
  END;

  INSERT INTO public.admin_audit_log
    (actor_user_id, actor_profile_id, action, target_profile_id, result, detail)
  VALUES (_actor_uid, _actor_profile, 'admin_create_bot_profile', _new_profile,
          'created', jsonb_build_object('display_name', _name,
                                        'auto_friend_requested', _add_to_my_friends));

  IF _add_to_my_friends THEN
    _friend_result := public.admin_link_friendship(_new_profile);
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'created',
                            'profile_id', _new_profile,
                            'friendship', _friend_result);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_bot_profile(text, text, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_bot_profile(text, text, text, boolean)
  TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. Edit a bot persona — the rename path had the same hole.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_bot_profile(
  _profile_id     uuid,
  _display_name   text    DEFAULT NULL,
  _avatar_url     text    DEFAULT NULL,
  _profile_frame  text    DEFAULT NULL,
  _is_disabled    boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_uid     uuid := auth.uid();
  _actor_profile uuid;
  _is_bot        boolean;
  _was_disabled  boolean;
  _problem       text;
  -- NULL still means "leave unchanged"; the toggle switch calls this with the
  -- name omitted and must not be dragged through name validation.
  _name          text := NULLIF(public.clean_display_name(_display_name), '');
BEGIN
  IF _actor_uid IS NULL OR NOT public.is_master_admin(_actor_uid) THEN
    RAISE EXCEPTION 'master_admin authorization required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT p.id INTO _actor_profile
  FROM public.profiles p WHERE p.user_id = _actor_uid LIMIT 1;

  SELECT COALESCE(p.is_bot, false), COALESCE(p.is_disabled, false)
    INTO _is_bot, _was_disabled
  FROM public.profiles p WHERE p.id = _profile_id;

  IF NOT FOUND OR NOT _is_bot THEN
    INSERT INTO public.admin_audit_log
      (actor_user_id, actor_profile_id, action, target_profile_id, result, detail)
    VALUES (_actor_uid, _actor_profile, 'admin_update_bot_profile', NULL,
            'not_a_bot', jsonb_build_object('requested_target', _profile_id));
    RETURN jsonb_build_object('ok', false, 'code', 'not_a_bot', 'profile_id', NULL);
  END IF;

  IF _display_name IS NOT NULL THEN
    -- Self-exempt, so re-saving the form without touching the name, or
    -- re-capitalising it, is not a collision with the bot itself.
    _problem := public.bot_display_name_problem(_name, _profile_id);
    IF _problem IS NOT NULL THEN
      INSERT INTO public.admin_audit_log
        (actor_user_id, actor_profile_id, action, target_profile_id, result, detail)
      VALUES (_actor_uid, _actor_profile, 'admin_update_bot_profile', _profile_id,
              _problem, jsonb_build_object('requested_display_name', _name));
      RETURN jsonb_build_object('ok', false, 'code', _problem,
                                'profile_id', _profile_id);
    END IF;
  END IF;

  BEGIN
    UPDATE public.profiles p SET
      display_name  = COALESCE(_name, p.display_name),
      avatar_url    = CASE WHEN _avatar_url IS NULL THEN p.avatar_url
                           ELSE NULLIF(btrim(_avatar_url), '') END,
      profile_frame = CASE WHEN _profile_frame IS NULL THEN p.profile_frame
                           ELSE NULLIF(btrim(_profile_frame), '') END,
      is_disabled   = COALESCE(_is_disabled, p.is_disabled)
    WHERE p.id = _profile_id;
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO public.admin_audit_log
        (actor_user_id, actor_profile_id, action, target_profile_id, result, detail)
      VALUES (_actor_uid, _actor_profile, 'admin_update_bot_profile', _profile_id,
              'taken', jsonb_build_object('requested_display_name', _name));
      RETURN jsonb_build_object('ok', false, 'code', 'taken',
                                'profile_id', _profile_id);
  END;

  INSERT INTO public.admin_audit_log
    (actor_user_id, actor_profile_id, action, target_profile_id, result, detail)
  VALUES (_actor_uid, _actor_profile,
          CASE WHEN _is_disabled IS DISTINCT FROM NULL
                    AND _is_disabled IS DISTINCT FROM _was_disabled
               THEN CASE WHEN _is_disabled THEN 'admin_disable_bot'
                                           ELSE 'admin_enable_bot' END
               ELSE 'admin_update_bot_profile' END,
          _profile_id, 'updated',
          jsonb_build_object('display_name_changed', _name IS NOT NULL,
                             'avatar_changed', _avatar_url IS NOT NULL,
                             'frame_changed', _profile_frame IS NOT NULL,
                             'disabled_from', _was_disabled,
                             'disabled_to', COALESCE(_is_disabled, _was_disabled)));

  RETURN jsonb_build_object('ok', true, 'code', 'updated', 'profile_id', _profile_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_bot_profile(uuid, text, text, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_bot_profile(uuid, text, text, text, boolean)
  TO authenticated;


-- ---------------------------------------------------------------------------
-- 4. Verification — run after COMMIT. Every call must return a jsonb envelope,
-- never raise. Run as a master admin.
-- ---------------------------------------------------------------------------
-- SELECT public.admin_create_bot_profile('Moderator');        -- {"code":"reserved"}
-- SELECT public.admin_create_bot_profile('A');                -- {"code":"too_short"}
-- SELECT public.admin_create_bot_profile(repeat('x', 30));    -- {"code":"too_long"}
-- SELECT public.admin_create_bot_profile('bad<name>');        -- {"code":"invalid_characters"}
-- SELECT public.admin_create_bot_profile('<an existing name>');-- {"code":"taken"}
