-- ===========================================================================
-- VERIFY1 — verification harness for the Account Connections security model.
--
-- WHAT THIS IS
-- The database half of the VERIFY1 test plan. The pure-TypeScript half (origin
-- allowlisting, return-path safety, state integrity, scopes, ticket hashing)
-- runs in vitest at supabase/functions/identity-link/security.test.ts. The
-- properties below live in SQL and can only be proven against a real Postgres.
--
-- HOW TO RUN
-- Apply 20260827170000_verify1_account_connections_security.sql first, then run
-- this whole file as `postgres` in the Supabase SQL editor.
--
-- It runs inside BEGIN ... ROLLBACK and asserts by RAISE EXCEPTION: it writes
-- two throwaway auth.users rows and undoes everything. A clean run ends with
-- "VERIFY1 HARNESS PASSED" and leaves no residue. Prefer staging; it is safe on
-- production only because it rolls back, and the rollback is not optional.
--
-- Each assertion names the numbered case from the VERIFY1 Phase 2 test plan.
-- ===========================================================================

BEGIN;

DO $harness$
DECLARE
  u_a uuid := '00000000-0000-4000-8000-00000000000a';
  u_b uuid := '00000000-0000-4000-8000-00000000000b';
  t_ok   text := 'ticket-hash-ok';
  t_exp  text := 'ticket-hash-expired';
  t_two  text := 'ticket-hash-second-account';
  status text;
  v_consent boolean;
  v_public  boolean;
  v_count   int;
  v_attempt uuid;
  v_rows    int;
BEGIN
  -- Throwaway principals.
  INSERT INTO auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  VALUES (u_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'verify1-a@example.invalid', now(), now()),
         (u_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'verify1-b@example.invalid', now(), now());

  -- =========================================================================
  -- CASE 5 — OAuth state replay is rejected (the attempt is single-use).
  -- =========================================================================
  INSERT INTO public.identity_link_attempts (user_id, provider, return_origin, return_path, expires_at)
  VALUES (u_a, 'discord', 'https://mogsy.net', '/settings', now() + interval '10 minutes')
  RETURNING id INTO v_attempt;

  SELECT count(*) INTO v_rows FROM public.identity_link_consume_attempt(v_attempt, 'discord');
  IF v_rows <> 1 THEN RAISE EXCEPTION 'CASE 5: first consume of a valid attempt failed'; END IF;

  SELECT count(*) INTO v_rows FROM public.identity_link_consume_attempt(v_attempt, 'discord');
  IF v_rows <> 0 THEN RAISE EXCEPTION 'CASE 5: attempt was replayable'; END IF;

  -- An expired attempt is never consumable.
  INSERT INTO public.identity_link_attempts (user_id, provider, return_origin, return_path, expires_at)
  VALUES (u_a, 'discord', 'https://mogsy.net', '/settings', now() - interval '1 second')
  RETURNING id INTO v_attempt;
  SELECT count(*) INTO v_rows FROM public.identity_link_consume_attempt(v_attempt, 'discord');
  IF v_rows <> 0 THEN RAISE EXCEPTION 'CASE 5: expired attempt was consumable'; END IF;

  -- A state whose provider does not match its attempt is not consumable.
  INSERT INTO public.identity_link_attempts (user_id, provider, return_origin, return_path, expires_at)
  VALUES (u_a, 'discord', 'https://mogsy.net', '/settings', now() + interval '10 minutes')
  RETURNING id INTO v_attempt;
  SELECT count(*) INTO v_rows FROM public.identity_link_consume_attempt(v_attempt, 'riot');
  IF v_rows <> 0 THEN RAISE EXCEPTION 'CASE 5: provider binding not enforced'; END IF;

  -- =========================================================================
  -- CASES 1 + 2 — a pending identity can only be claimed by its own user.
  --
  -- This is the account-linking CSRF, expressed as data: the pending row that
  -- the OAuth callback writes is bound to the Mogzy user who STARTED the
  -- ceremony, and only a live session for that user can commit it.
  -- =========================================================================
  INSERT INTO public.identity_link_pending
    (ticket_hash, user_id, provider, provider_user_id, username, expires_at)
  VALUES (t_ok, u_a, 'discord', 'discord-account-1', 'victim', now() + interval '5 minutes');

  -- User B holds A's ticket. It must not link, and must not be burnt.
  status := public.identity_link_redeem(t_ok, u_b);
  IF status <> 'invalid_ticket' THEN
    RAISE EXCEPTION 'CASE 2: ticket for user A was redeemable by user B (got %)', status;
  END IF;
  SELECT count(*) INTO v_count FROM public.user_identity_links WHERE user_id = u_b;
  IF v_count <> 0 THEN RAISE EXCEPTION 'CASE 1: a link was created for the wrong Mogzy account'; END IF;
  SELECT count(*) INTO v_count
    FROM public.identity_link_pending WHERE ticket_hash = t_ok AND consumed_at IS NULL;
  IF v_count <> 1 THEN RAISE EXCEPTION 'CASE 2: a hostile redeem burnt the rightful owner ticket'; END IF;

  -- The rightful owner commits it.
  status := public.identity_link_redeem(t_ok, u_a);
  IF status <> 'success' THEN RAISE EXCEPTION 'CASE 1: rightful redeem failed (%)', status; END IF;
  SELECT count(*) INTO v_count
    FROM public.user_identity_links WHERE user_id = u_a AND provider = 'discord';
  IF v_count <> 1 THEN RAISE EXCEPTION 'CASE 1: link was not committed for the owner'; END IF;

  -- =========================================================================
  -- CASE 3 — a ticket is single-use.
  -- =========================================================================
  status := public.identity_link_redeem(t_ok, u_a);
  IF status <> 'invalid_ticket' THEN RAISE EXCEPTION 'CASE 3: ticket was redeemable twice (%)', status; END IF;

  -- =========================================================================
  -- CASE 4 — an expired ticket is rejected.
  -- =========================================================================
  INSERT INTO public.identity_link_pending
    (ticket_hash, user_id, provider, provider_user_id, expires_at)
  VALUES (t_exp, u_b, 'discord', 'discord-account-9', now() - interval '1 second');
  status := public.identity_link_redeem(t_exp, u_b);
  IF status <> 'invalid_ticket' THEN RAISE EXCEPTION 'CASE 4: expired ticket was redeemable (%)', status; END IF;

  -- =========================================================================
  -- CASE 16 — re-verifying the SAME provider account preserves preferences.
  -- =========================================================================
  UPDATE public.user_identity_links
     SET contact_consent = true, public_on_profile = true
   WHERE user_id = u_a AND provider = 'discord';

  INSERT INTO public.identity_link_pending
    (ticket_hash, user_id, provider, provider_user_id, username, expires_at)
  VALUES ('ticket-hash-reverify', u_a, 'discord', 'discord-account-1', 'victim-renamed',
          now() + interval '5 minutes');
  status := public.identity_link_redeem('ticket-hash-reverify', u_a);
  IF status <> 'success' THEN RAISE EXCEPTION 'CASE 16: re-verification failed (%)', status; END IF;

  SELECT contact_consent, public_on_profile INTO v_consent, v_public
    FROM public.user_identity_links WHERE user_id = u_a AND provider = 'discord';
  IF NOT v_consent OR NOT v_public THEN
    RAISE EXCEPTION 'CASE 16: same-account re-verification discarded user preferences';
  END IF;

  -- =========================================================================
  -- CASE 17 — linking a DIFFERENT provider account resets consent/visibility.
  --
  -- Permission was granted for account 1. Account 2 never received it.
  -- =========================================================================
  INSERT INTO public.identity_link_pending
    (ticket_hash, user_id, provider, provider_user_id, username, expires_at)
  VALUES (t_two, u_a, 'discord', 'discord-account-2', 'someone-else',
          now() + interval '5 minutes');
  status := public.identity_link_redeem(t_two, u_a);
  IF status <> 'success' THEN RAISE EXCEPTION 'CASE 17: relink failed (%)', status; END IF;

  SELECT contact_consent, public_on_profile INTO v_consent, v_public
    FROM public.user_identity_links WHERE user_id = u_a AND provider = 'discord';
  IF v_consent OR v_public THEN
    RAISE EXCEPTION 'CASE 17: consent/visibility transferred to a different Discord account';
  END IF;

  -- =========================================================================
  -- CASE 15 — one external identity cannot belong to two Mogzy accounts.
  -- =========================================================================
  INSERT INTO public.identity_link_pending
    (ticket_hash, user_id, provider, provider_user_id, expires_at)
  VALUES ('ticket-hash-steal', u_b, 'discord', 'discord-account-2', now() + interval '5 minutes');
  status := public.identity_link_redeem('ticket-hash-steal', u_b);
  IF status <> 'already_linked' THEN
    RAISE EXCEPTION 'CASE 15: one Discord account was linkable to two Mogzy users (%)', status;
  END IF;
  SELECT count(*) INTO v_count
    FROM public.user_identity_links WHERE provider = 'discord' AND provider_user_id = 'discord-account-2';
  IF v_count <> 1 THEN RAISE EXCEPTION 'CASE 15: duplicate external identity rows exist'; END IF;

  RAISE NOTICE 'server-side ceremony cases passed (1,2,3,4,5,15,16,17)';
END
$harness$;

-- ===========================================================================
-- CASES 18, 19, 20 — what the BROWSER role can and cannot do.
--
-- Executed as `authenticated` with a forged JWT claim set, which is exactly the
-- authority a logged-in Mogzy user has in the browser.
-- ===========================================================================

DO $browser$
DECLARE
  u_a uuid := '00000000-0000-4000-8000-00000000000a';
  u_b uuid := '00000000-0000-4000-8000-00000000000b';
  blocked boolean;
  v_count int;
BEGIN
  -- ---- CASE 19: a browser may never assert a verified identity ------------
  blocked := false;
  BEGIN
    SET LOCAL role authenticated;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', u_a::text, 'role', 'authenticated')::text, true);
    INSERT INTO public.user_identity_links (user_id, provider, provider_user_id, username)
    VALUES (u_a, 'riot', 'self-asserted-puuid', 'Impostor');
  EXCEPTION WHEN OTHERS THEN
    blocked := true;
  END;
  RESET role;
  IF NOT blocked THEN RAISE EXCEPTION 'CASE 19: browser inserted a verified identity'; END IF;

  -- ---- CASE 20: a browser may never move a verified field -----------------
  blocked := false;
  BEGIN
    SET LOCAL role authenticated;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', u_a::text, 'role', 'authenticated')::text, true);
    UPDATE public.user_identity_links
       SET provider_user_id = 'attacker-controlled'
     WHERE user_id = u_a AND provider = 'discord';
  EXCEPTION WHEN OTHERS THEN
    blocked := true;
  END;
  RESET role;
  IF NOT blocked THEN RAISE EXCEPTION 'CASE 20: browser rewrote provider_user_id'; END IF;

  blocked := false;
  BEGIN
    SET LOCAL role authenticated;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', u_a::text, 'role', 'authenticated')::text, true);
    UPDATE public.user_identity_links
       SET verified_at = now() + interval '10 years'
     WHERE user_id = u_a AND provider = 'discord';
  EXCEPTION WHEN OTHERS THEN
    blocked := true;
  END;
  RESET role;
  IF NOT blocked THEN RAISE EXCEPTION 'CASE 20: browser rewrote verified_at'; END IF;

  -- ---- the two switches the user DOES own must still work -----------------
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_a::text, 'role', 'authenticated')::text, true);
  UPDATE public.user_identity_links
     SET contact_consent = true, public_on_profile = true
   WHERE user_id = u_a AND provider = 'discord';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RESET role;
  IF v_count <> 1 THEN RAISE EXCEPTION 'consent switches are not user-writable'; END IF;

  -- ---- CASE 18: disconnect affects only the authenticated owner -----------
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_b::text, 'role', 'authenticated')::text, true);
  DELETE FROM public.user_identity_links WHERE provider = 'discord';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RESET role;
  IF v_count <> 0 THEN RAISE EXCEPTION 'CASE 18: user B deleted user A''s link'; END IF;

  SELECT count(*) INTO v_count FROM public.user_identity_links WHERE user_id = u_a;
  IF v_count <> 1 THEN RAISE EXCEPTION 'CASE 18: user A''s link did not survive'; END IF;

  -- ---- ceremony tables are invisible to the browser -----------------------
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_a::text, 'role', 'authenticated')::text, true);
  BEGIN
    SELECT count(*) INTO v_count FROM public.identity_link_pending;
  EXCEPTION WHEN OTHERS THEN
    v_count := 0;
  END;
  RESET role;
  IF v_count <> 0 THEN RAISE EXCEPTION 'ceremony tickets are readable from the browser'; END IF;

  RAISE NOTICE 'browser-authority cases passed (18,19,20)';
END
$browser$;

DO $done$ BEGIN RAISE NOTICE 'VERIFY1 HARNESS PASSED'; END $done$;

ROLLBACK;
