
-- Issue 1: Add length constraints on user-controlled text fields
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_length CHECK (char_length(display_name) <= 50),
  ADD CONSTRAINT profiles_status_message_length CHECK (char_length(status_message) <= 200),
  ADD CONSTRAINT profiles_location_length CHECK (char_length(location) <= 100),
  ADD CONSTRAINT profiles_admin_notes_length CHECK (char_length(admin_notes) <= 1000);

-- Issue 2: Create a SECURITY DEFINER function to atomically handle image report auto-hide
CREATE OR REPLACE FUNCTION public.check_and_auto_hide_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _report_count integer;
  _item_name text;
BEGIN
  -- Count total reports for this image
  SELECT COUNT(*) INTO _report_count
  FROM public.image_reports
  WHERE image_id = NEW.image_id;

  -- Auto-hide if threshold reached
  IF _report_count >= 10 THEN
    UPDATE public.preset_item_images
    SET is_hidden = true
    WHERE id = NEW.image_id AND is_hidden = false;

    -- Only notify if we actually hid it (wasn't already hidden)
    IF FOUND THEN
      -- Get item name for notification
      SELECT pi.name INTO _item_name
      FROM public.preset_items pi
      JOIN public.preset_item_images pii ON pii.preset_item_id = pi.id
      WHERE pii.id = NEW.image_id;

      INSERT INTO public.admin_notifications (type, title, message, metadata)
      VALUES (
        'image_report_critical',
        'Image auto-hidden: ' || COALESCE(left(_item_name, 100), 'Unknown'),
        'An image for "' || COALESCE(left(_item_name, 100), 'Unknown') || '" received ' || _report_count || ' reports and was automatically hidden.',
        jsonb_build_object('image_id', NEW.image_id, 'report_count', _report_count)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on image_reports table
CREATE TRIGGER auto_hide_reported_images
AFTER INSERT ON public.image_reports
FOR EACH ROW
EXECUTE FUNCTION public.check_and_auto_hide_image();
