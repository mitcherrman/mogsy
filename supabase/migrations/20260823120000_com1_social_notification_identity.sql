-- ---------------------------------------------------------------------------
-- COM1-1 / P0-1A — a social notification must not carry the other account's
-- Supabase auth id.
--
-- WHAT WAS WRONG
-- public.user_notifications.sent_by_user_id is `auth.users.id`. The four
-- SECURITY DEFINER triggers added in 20260523081658 populate it, for a
-- user-to-user notification, with the OTHER party's auth id:
--
--   notify_on_friendship_change   -> requester's / addressee's auth id
--   notify_user_on_comment_reply  -> replier's auth id
--   notify_user_on_comment_reaction -> reactor's auth id
--
-- The recipient may read that row: the SELECT policy from 20260520093257 is
--   target_type = 'all' OR has_role(admin) OR is_profile_owner(profile_id)
-- and the row is addressed to them. So `select('sent_by_user_id')` over
-- PostgREST hands any recipient the sender's raw auth subject.
--
-- That is precisely the identifier 20260730150000 (get_league_profiles) was
-- written to withhold, and its stated reason still holds: several
-- /api/quiz/{user_id} reads in the League_Combat_Simulator backend resolve a
-- CLIENT-SUPPLIED user id to the subject they serve whenever no verified token
-- is presented, and REQUIRE_SUPABASE_AUTH is confirmed unset in production.
-- An auth id is the missing half of that; a friend request was handing it over.
--
-- WHY THE COLUMN IS NOT DROPPED, AND NOT REVOKED
-- It is NOT NULL and it is legitimately used for admin-authored announcements
-- (AdminPushNotifications writes the acting admin's own id as provenance, and
-- the admin surface is the only reader). A column-level REVOKE would also be a
-- no-op here: this project's ALTER DEFAULT PRIVILEGES grants table-level
-- privileges to `authenticated`, and a column REVOKE cannot remove a
-- table-level grant — the same finding recorded in the 20260730150000 header.
--
-- So the fix is at the SOURCE: system-generated user-to-user rows stop
-- carrying an account id at all. They already have the right identifier —
-- `metadata.requester_profile_id` / `metadata.addressee_profile_id`, a
-- public `profiles.id`, which is what the client actually reads and what
-- get_league_profiles is keyed on.
--
-- NOTHING ELSE CHANGES. Same tables, same columns, same policies, same
-- notification titles, same metadata, same triggers, same firing conditions.
-- The four function bodies differ by one argument each, and one backfill
-- rewrites the ids already sitting in history.
--
-- Apply as `postgres`, in the Supabase SQL Editor, wrapped in BEGIN/COMMIT.
-- Do NOT use `supabase db push`: repo and remote ledger have drifted versions
-- and a push would replay them.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. The sentinel.
--
-- Not a new vocabulary item: the four triggers ALREADY fall back to this exact
-- value via COALESCE when a profile has no auth row, so every reader that
-- tolerates the column today already tolerates it. It means "system-generated,
-- no acting account is disclosed".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.system_notification_actor()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid $$;

REVOKE ALL ON FUNCTION public.system_notification_actor() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. Friend request / acceptance.
--
-- Body is byte-identical to 20260523081658 except that the sent_by_user_id
-- argument is now the sentinel. metadata keeps requester_profile_id /
-- addressee_profile_id, which is what MogzyIdentityMenu.openNotification
-- navigates on.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_friendship_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _requester_name text;
  _addressee_name text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT display_name INTO _requester_name FROM public.profiles WHERE id = NEW.requester_id;
    INSERT INTO public.user_notifications (
      title, message, type, profile_id, target_type, sent_by_user_id, is_sent, metadata
    ) VALUES (
      COALESCE(_requester_name, 'Someone') || ' sent you a friend request',
      NULL,
      'friend_request',
      NEW.addressee_id,
      'user',
      public.system_notification_actor(),
      true,
      jsonb_build_object('friendship_id', NEW.id, 'requester_profile_id', NEW.requester_id)
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND COALESCE(OLD.status, '') <> 'accepted' THEN
    SELECT display_name INTO _addressee_name FROM public.profiles WHERE id = NEW.addressee_id;
    INSERT INTO public.user_notifications (
      title, message, type, profile_id, target_type, sent_by_user_id, is_sent, metadata
    ) VALUES (
      COALESCE(_addressee_name, 'Someone') || ' accepted your friend request',
      NULL,
      'friend_accepted',
      NEW.requester_id,
      'user',
      public.system_notification_actor(),
      true,
      jsonb_build_object('friendship_id', NEW.id, 'addressee_profile_id', NEW.addressee_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_on_friendship_change() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. Comment reply.
--
-- These two types are suppressed by the client's allow-list today
-- (MogzyIdentityMenu INTENTIONALLY_SUPPRESSED_TYPES), but the triggers keep
-- writing rows for when the feature is activated. Fixing them now means the
-- leak does not come back with the feature.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_user_on_comment_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _parent_profile_id uuid;
  _replier_name text;
BEGIN
  IF NEW.parent_comment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT profile_id INTO _parent_profile_id
  FROM public.comments WHERE id = NEW.parent_comment_id;

  IF _parent_profile_id IS NULL OR _parent_profile_id = NEW.profile_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO _replier_name
  FROM public.profiles WHERE id = NEW.profile_id;

  INSERT INTO public.user_notifications (
    title, message, type, profile_id, target_type, sent_by_user_id, is_sent, metadata
  ) VALUES (
    COALESCE(_replier_name, 'Someone') || ' replied to your comment',
    LEFT(NEW.content, 140),
    'comment_reply',
    _parent_profile_id,
    'user',
    public.system_notification_actor(),
    true,
    -- replier_profile_id is ADDED: the public identifier the auth id used to
    -- stand in for, so activating this feature does not need the leak back.
    jsonb_build_object('comment_id', NEW.id, 'parent_comment_id', NEW.parent_comment_id,
                       'league_id', NEW.league_id, 'blog_post_id', NEW.blog_post_id,
                       'replier_profile_id', NEW.profile_id)
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_user_on_comment_reply() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4. Comment reaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_user_on_comment_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _owner_profile_id uuid;
  _reactor_name text;
BEGIN
  SELECT profile_id INTO _owner_profile_id
  FROM public.comments WHERE id = NEW.comment_id;

  IF _owner_profile_id IS NULL OR _owner_profile_id = NEW.profile_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO _reactor_name
  FROM public.profiles WHERE id = NEW.profile_id;

  INSERT INTO public.user_notifications (
    title, message, type, profile_id, target_type, sent_by_user_id, is_sent, metadata
  ) VALUES (
    COALESCE(_reactor_name, 'Someone') || ' reacted ' || NEW.emoji || ' to your comment',
    NULL,
    'comment_reaction',
    _owner_profile_id,
    'user',
    public.system_notification_actor(),
    true,
    jsonb_build_object('comment_id', NEW.comment_id, 'emoji', NEW.emoji,
                       'reactor_profile_id', NEW.profile_id)
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_user_on_comment_reaction() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5. Backfill — history carries the leak too.
--
-- Scoped to the four SYSTEM-generated types only. Admin-authored announcements
-- (general/update/warning/lol_* and anything with target_type = 'all') keep
-- their real sent_by_user_id: that is genuine provenance, it names an admin
-- rather than a player, and only the admin surface reads it.
--
-- No row is deleted and no other column is touched, so the bell renders
-- exactly what it rendered before.
-- ---------------------------------------------------------------------------
UPDATE public.user_notifications
   SET sent_by_user_id = public.system_notification_actor()
 WHERE type IN ('friend_request', 'friend_accepted',
                'comment_reply', 'comment_reaction')
   AND sent_by_user_id IS DISTINCT FROM public.system_notification_actor();


-- ---------------------------------------------------------------------------
-- 6. Verification — run after COMMIT. Both must return zero rows.
-- ---------------------------------------------------------------------------
-- SELECT count(*) AS must_be_zero
--   FROM public.user_notifications
--  WHERE type IN ('friend_request','friend_accepted','comment_reply','comment_reaction')
--    AND sent_by_user_id <> '00000000-0000-0000-0000-000000000000'::uuid;
--
-- SELECT count(*) AS must_be_zero
--   FROM public.user_notifications n
--   JOIN public.profiles p ON p.user_id = n.sent_by_user_id
--  WHERE n.target_type = 'user' AND n.profile_id IS DISTINCT FROM p.id
--    AND n.type IN ('friend_request','friend_accepted','comment_reply','comment_reaction');
