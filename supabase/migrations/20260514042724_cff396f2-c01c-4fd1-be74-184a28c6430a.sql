
-- Revoke direct EXECUTE from anon/authenticated on internal trigger and helper SECURITY DEFINER functions.
-- These are still invoked correctly via triggers or inside RLS policies (which run as the function owner).

-- Trigger functions (never called directly by clients)
REVOKE EXECUTE ON FUNCTION public.check_and_auto_hide_comment() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.check_and_auto_hide_image() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.protect_profile_premium_fields() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

-- RLS / policy helper functions (called inside policies, not by clients directly)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_master_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_profile_owner(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_league_creator(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_friendship_party(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_game_player(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.realtime_is_game_topic_player(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.realtime_is_notification_topic_owner(text) FROM anon, authenticated, public;

-- Authenticated RPCs: revoke from anon only (these all check auth.uid() internally)
REVOKE EXECUTE ON FUNCTION public.get_own_profile() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.purchase_powerup(uuid, text, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.rewind_user_match(uuid, uuid, uuid, integer, integer, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.record_user_match(uuid, uuid, uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.record_preset_match(uuid, uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.record_dual_preset_match(uuid, uuid, uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.record_dual_user_match(uuid, uuid, uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_multiplayer_game(text, uuid, text, uuid, uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.join_multiplayer_game(uuid, uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.submit_multiplayer_action(uuid, uuid, uuid, text, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.redeem_invite_link(text, uuid) FROM anon, public;
