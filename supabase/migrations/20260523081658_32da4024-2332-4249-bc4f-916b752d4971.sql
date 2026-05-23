
-- 1) Add tables to realtime publication for live admin refresh
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comment_reports;

-- 2) Extend admin_notifications RLS to allow new notification types from triggers
DROP POLICY IF EXISTS "Authenticated users can insert allowed notification types" ON public.admin_notifications;
CREATE POLICY "Authenticated users can insert allowed notification types"
  ON public.admin_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND type = ANY (ARRAY['image_report','mod_delete_request','comment_report','user_report','feedback'])
  );

-- 3) Update comment-report trigger function to also emit a per-report admin notification
CREATE OR REPLACE FUNCTION public.check_and_auto_hide_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _report_count integer;
  _comment_content text;
BEGIN
  SELECT COUNT(*) INTO _report_count
  FROM public.comment_reports
  WHERE comment_id = NEW.comment_id;

  SELECT LEFT(content, 100) INTO _comment_content
  FROM public.comments WHERE id = NEW.comment_id;

  -- Per-report notification so admins see incoming reports immediately
  INSERT INTO public.admin_notifications (type, title, message, metadata)
  VALUES (
    'comment_report',
    'Comment reported',
    COALESCE(_comment_content, 'A comment was reported.') || ' (' || _report_count || ' total)',
    jsonb_build_object('comment_id', NEW.comment_id, 'report_count', _report_count, 'reason', NEW.reason)
  );

  -- Auto-hide if threshold reached
  IF _report_count >= 5 THEN
    UPDATE public.comments
    SET is_hidden = true, hidden_by_admin = false
    WHERE id = NEW.comment_id AND is_hidden = false;

    IF FOUND THEN
      INSERT INTO public.admin_notifications (type, title, message, metadata)
      VALUES (
        'comment_report',
        'Comment auto-hidden',
        'A comment received ' || _report_count || ' reports and was automatically hidden.',
        jsonb_build_object('comment_id', NEW.comment_id, 'report_count', _report_count, 'auto_hidden', true)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) Trigger: notify admins on new feedback
CREATE OR REPLACE FUNCTION public.notify_admins_on_feedback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.admin_notifications (type, title, message, metadata)
  VALUES (
    'feedback',
    'New feedback: ' || COALESCE(LEFT(NEW.title, 80), NEW.category),
    LEFT(COALESCE(NEW.body, ''), 200),
    jsonb_build_object('feedback_id', NEW.id, 'category', NEW.category, 'priority', NEW.priority)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feedback_admin_notify ON public.feedback;
CREATE TRIGGER feedback_admin_notify
  AFTER INSERT ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_feedback();

-- 5) Trigger: notify admins on new user_report
CREATE OR REPLACE FUNCTION public.notify_admins_on_user_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.admin_notifications (type, title, message, metadata)
  VALUES (
    'user_report',
    'User reported',
    'Reason: ' || NEW.reason || COALESCE(' — ' || LEFT(NEW.details, 160), ''),
    jsonb_build_object('user_report_id', NEW.id, 'reported_profile_id', NEW.reported_profile_id, 'reporter_profile_id', NEW.reporter_profile_id, 'reason', NEW.reason)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_reports_admin_notify ON public.user_reports;
CREATE TRIGGER user_reports_admin_notify
  AFTER INSERT ON public.user_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_user_report();

-- 6) Trigger: notify user on comment reply
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
    COALESCE((SELECT user_id FROM public.profiles WHERE id = NEW.profile_id), '00000000-0000-0000-0000-000000000000'::uuid),
    true,
    jsonb_build_object('comment_id', NEW.id, 'parent_comment_id', NEW.parent_comment_id, 'league_id', NEW.league_id, 'blog_post_id', NEW.blog_post_id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_reply_notify ON public.comments;
CREATE TRIGGER comments_reply_notify
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_user_on_comment_reply();

-- 7) Trigger: notify user on comment reaction
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
    COALESCE((SELECT user_id FROM public.profiles WHERE id = NEW.profile_id), '00000000-0000-0000-0000-000000000000'::uuid),
    true,
    jsonb_build_object('comment_id', NEW.comment_id, 'emoji', NEW.emoji)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comment_reactions_notify ON public.comment_reactions;
CREATE TRIGGER comment_reactions_notify
  AFTER INSERT ON public.comment_reactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_user_on_comment_reaction();

-- 8) Trigger: notify on friendship request / acceptance
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
      COALESCE((SELECT user_id FROM public.profiles WHERE id = NEW.requester_id), '00000000-0000-0000-0000-000000000000'::uuid),
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
      COALESCE((SELECT user_id FROM public.profiles WHERE id = NEW.addressee_id), '00000000-0000-0000-0000-000000000000'::uuid),
      true,
      jsonb_build_object('friendship_id', NEW.id, 'addressee_profile_id', NEW.addressee_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friendships_notify ON public.friendships;
CREATE TRIGGER friendships_notify
  AFTER INSERT OR UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_friendship_change();
