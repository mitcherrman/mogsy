-- Global navbar visibility policy (admin-controlled).
--
-- ONE new row in the EXISTING public.app_settings key/value store, alongside the
-- three rows added by 20260730120000_platform_access_tutorial_policies.sql. No
-- new settings system, no new table, no schema change, no new authorization
-- model, and no new audit trigger.
--
--   global_navbar_visible
--     {"enabled": true}  -> the standard Mogzy navigation bar is displayed across
--                           public and authenticated pages.
--     {"enabled": false} -> reserved for Phase 2. NOTHING reads this row yet, so
--                           an off value has no effect on rendering today.
--
-- DEFAULTS TO true, which reproduces current production behaviour exactly: the
-- navbar is always visible. The client contract in
-- src/lib/platform-policy/policy.ts also defaults this key to true whenever the
-- row is missing, malformed, or unreadable, so a settings outage can never
-- remove navigation.
--
-- ON CONFLICT DO NOTHING makes re-running a no-op and, critically, never resets
-- a value an admin has already changed.
--
-- Nothing beyond the seed is needed. Everything this row relies on already
-- exists on the table and applies to every row generically:
--   - reads:  policy "Settings are publicly readable" (SELECT USING (true))
--   - writes: policies "Admins can insert settings" / "Admins can update
--             settings", both gated on has_role(auth.uid(), 'admin'::app_role)
--             (20260222065043_24eaa310-c1a2-4a3e-94f5-f22a834e4b49.sql)
--   - audit:  trigger app_settings_stamp_audit stamps updated_at + updated_by
--             from the verified session on INSERT OR UPDATE
--             (20260730120000_platform_access_tutorial_policies.sql)
-- Re-declaring any of them here would duplicate an existing policy or trigger,
-- so this migration deliberately adds only the seed row.

INSERT INTO public.app_settings (key, value)
VALUES (
  'global_navbar_visible',
  '{"enabled": true}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
