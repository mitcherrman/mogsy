-- PULSE-2B rollback: removes exactly what 01_pulse_admin_workspace.sql added.
-- DESTRUCTIVE for Pulse admin content (drops the tables). Export first:
--   SELECT public.pulse_admin_snapshot();   -- as the owner
-- The admin_audit_log rows it wrote are kept. Touches no OWN1 object.

DROP FUNCTION IF EXISTS public.pulse_public_catalogue();
DROP FUNCTION IF EXISTS public.pulse_admin_set_kill(boolean, text, text);
DROP FUNCTION IF EXISTS public.pulse_admin_set_sponsor_host(text, text);
DROP FUNCTION IF EXISTS public.pulse_admin_transition_partner(text, text, text, integer);
DROP FUNCTION IF EXISTS public.pulse_admin_save_partner(text, jsonb, text, text, integer);
DROP FUNCTION IF EXISTS public.pulse_admin_save_schedule(text[], integer, integer, integer);
DROP FUNCTION IF EXISTS public.pulse_admin_save_category(text, boolean, integer, timestamptz, integer);
DROP FUNCTION IF EXISTS public.pulse_admin_transition_item(uuid, text, timestamptz, integer);
DROP FUNCTION IF EXISTS public.pulse_admin_save_item(jsonb, integer);
DROP FUNCTION IF EXISTS public.pulse_admin_snapshot();

DROP FUNCTION IF EXISTS private.pulse_allowlist();
DROP FUNCTION IF EXISTS private.pulse_schedule_json(public.pulse_schedule_settings);
DROP FUNCTION IF EXISTS private.pulse_category_json(public.pulse_category_settings);
DROP FUNCTION IF EXISTS private.pulse_partner_json(public.pulse_partner_records);
DROP FUNCTION IF EXISTS private.pulse_partner_record_json(public.pulse_partner_records);
DROP FUNCTION IF EXISTS private.pulse_paid(text, text);
DROP FUNCTION IF EXISTS private.pulse_partner_issues(text, jsonb, boolean, text[], timestamptz);
DROP FUNCTION IF EXISTS private.pulse_twitch_ok(text);
DROP FUNCTION IF EXISTS private.pulse_youtube_ok(text);
DROP FUNCTION IF EXISTS private.pulse_image_ok(text);
DROP FUNCTION IF EXISTS private.pulse_https_host(text, text[]);
DROP FUNCTION IF EXISTS private.pulse_text_ok(text, integer);
DROP FUNCTION IF EXISTS private.pulse_instant(text);
DROP FUNCTION IF EXISTS private.pulse_item_json(public.pulse_content_items);
DROP FUNCTION IF EXISTS private.pulse_payload_issues(text, text, jsonb, boolean);
DROP FUNCTION IF EXISTS private.pulse_raise_invalid(jsonb);
DROP FUNCTION IF EXISTS private.pulse_issue(text, text);
DROP FUNCTION IF EXISTS private.pulse_blank(text);
DROP FUNCTION IF EXISTS private.pulse_internal_path(text);

DROP TABLE IF EXISTS public.pulse_content_items;
DROP TABLE IF EXISTS public.pulse_partner_records;
DROP TABLE IF EXISTS public.pulse_sponsor_host_allowlist;
DROP TABLE IF EXISTS public.pulse_category_settings;
DROP TABLE IF EXISTS public.pulse_schedule_settings;
DROP TABLE IF EXISTS private.pulse_release_gates;
