-- ===========================================================================
-- OWN1.1 — routine owner RPCs: trusted owner session instead of fresh aal2.
--
-- OWN1-B prepended `PERFORM public.assert_owner('fresh_aal2'); -- OWN1` to four
-- RPCs. Two of them are routine, reversible content edits that the owner does
-- day to day, and a fresh MFA (<= 10 min) for each one made Admin unusable:
--
--   admin_create_bot_profile  creates a bot persona (no real account touched;
--                             disable/rename is reversible; audited)
--   admin_update_bot_profile  renames / re-skins / enables / disables a bot
--                             (refuses non-bots; reversible; audited)
--
-- These move to `trusted` (owner AND (aal2 OR a live trusted-device
-- attestation for THIS session)) — still the canonical owner only.
--
--   admin_link_friendship     a BOT target becomes `trusted` (routine, used by
--                             bot creation); a REAL PERSON target keeps
--                             `fresh_aal2` (it writes into another person's
--                             social graph without a request).
--   admin_set_pro_grant       UNCHANGED: fresh_aal2 (privilege grant).
--
-- Only the OWN1 guard line is rewritten; the rest of each body is preserved
-- byte-for-byte. Idempotent. The rewritten lines keep the `-- OWN1` marker,
-- so rollback/own1_rollback.sql still strips them, and
-- rollback/own11_rollback.sql restores the OWN1 fresh_aal2 guard exactly.
--
-- NOT applied by committing this file. Apply through the Supabase SQL editor
-- / migration path in one transaction, then run
-- verification/own11_verify.sql.
-- ===========================================================================

DO $own11$
DECLARE
  _fn  text;
  _oid oid;
  _def text;
  _old constant text := 'PERFORM public.assert_owner(''fresh_aal2''); -- OWN1';
  _trusted constant text :=
    'PERFORM public.assert_owner(''trusted''); -- OWN1 (OWN1.1: routine, reversible)';
  _link constant text :=
    'PERFORM public.assert_owner(CASE WHEN EXISTS (SELECT 1 FROM public.profiles p '
    'WHERE p.id = _target_profile_id AND COALESCE(p.is_bot, false)) '
    'THEN ''trusted'' ELSE ''fresh_aal2'' END); -- OWN1 (OWN1.1: bot targets routine; people fresh)';
BEGIN
  FOREACH _fn IN ARRAY ARRAY['admin_create_bot_profile', 'admin_update_bot_profile', 'admin_link_friendship'] LOOP
    SELECT p.oid INTO _oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = _fn;
    IF _oid IS NULL THEN
      RAISE EXCEPTION 'OWN1.1: expected function public.% not found', _fn;
    END IF;
    _def := pg_get_functiondef(_oid);
    IF position('-- OWN1 (OWN1.1' IN _def) > 0 THEN CONTINUE; END IF;  -- already applied
    IF position(_old IN _def) = 0 THEN
      RAISE EXCEPTION 'OWN1.1: OWN1 fresh_aal2 guard not found in public.% (apply OWN1-B first)', _fn;
    END IF;
    _def := replace(_def, _old, CASE WHEN _fn = 'admin_link_friendship' THEN _link ELSE _trusted END);
    EXECUTE _def;
    IF position('-- OWN1 (OWN1.1' IN pg_get_functiondef(_oid)) = 0 THEN
      RAISE EXCEPTION 'OWN1.1: guard rewrite not present after update of public.%', _fn;
    END IF;
  END LOOP;

  -- The Pro grant must still demand fresh MFA.
  SELECT p.oid INTO _oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'admin_set_pro_grant';
  IF position(_old IN pg_get_functiondef(_oid)) = 0 THEN
    RAISE EXCEPTION 'OWN1.1: admin_set_pro_grant lost its fresh_aal2 guard';
  END IF;
END
$own11$;
