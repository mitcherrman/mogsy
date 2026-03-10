-- Drop the old overly permissive policy if it exists
DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.admin_notifications;

-- Ensure the proper authenticated-only policy exists
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.admin_notifications;
CREATE POLICY "Authenticated users can insert notifications"
  ON public.admin_notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Create a trigger function for comment auto-hide (mirrors image auto-hide pattern)
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
  -- Count total reports for this comment
  SELECT COUNT(*) INTO _report_count
  FROM public.comment_reports
  WHERE comment_id = NEW.comment_id;

  -- Auto-hide if threshold reached (5 reports)
  IF _report_count >= 5 THEN
    UPDATE public.comments
    SET is_hidden = true, hidden_by_admin = false
    WHERE id = NEW.comment_id AND is_hidden = false;

    -- Only notify if we actually hid it
    IF FOUND THEN
      SELECT LEFT(content, 100) INTO _comment_content
      FROM public.comments WHERE id = NEW.comment_id;

      INSERT INTO public.admin_notifications (type, title, message, metadata)
      VALUES (
        'comment_report_critical',
        'Comment auto-hidden',
        'A comment received ' || _report_count || ' reports and was automatically hidden.',
        jsonb_build_object('comment_id', NEW.comment_id, 'report_count', _report_count)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Create the trigger
DROP TRIGGER IF EXISTS auto_hide_reported_comments ON public.comment_reports;
CREATE TRIGGER auto_hide_reported_comments
  AFTER INSERT ON public.comment_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.check_and_auto_hide_comment();