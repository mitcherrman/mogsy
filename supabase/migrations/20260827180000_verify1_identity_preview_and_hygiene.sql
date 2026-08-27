-- ===========================================================================
-- VERIFY1 — authenticated preview, pending-row hygiene, expiry purge.
--
-- Builds on 20260827170000. Forward-only; nothing earlier is rewritten.
--
-- WHY A PREVIEW STEP EXISTS
-- Redemption is atomic and irreversible: it writes a durable verified identity.
-- A user should see WHICH external account they are about to attach before that
-- happens — both because a person may hold several Discord accounts and be
-- signed into the wrong one, and because the ticket otherwise redeems silently
-- on page load, so merely reopening a URL from history would re-link.
--
-- Preview is therefore a READ. It is STABLE, it does not consume the ticket,
-- and it cannot write. It is bound to the authenticated caller exactly as
-- redeem is, and it returns display-safe fields only:
--
--   * NOT provider_user_id. The Discord snowflake and the Riot PUUID are
--     durable cross-service identifiers. Nothing in the confirmation UI needs
--     one, so nothing sends one to a browser.
--   * NOT the ticket hash, timestamps, or the owning user id.
--
-- A preview by the wrong Mogzy user returns zero rows — the same result as a
-- ticket that never existed — so it cannot be used to discover whose ceremony
-- a ticket belongs to.
--
-- WHAT THIS ADDS
--   1. public.identity_link_preview        — non-consuming, user-bound read
--   2. public.identity_link_purge_expired  — opportunistic cleanup
--   3. COMMENTs recording that a pending row is a CLAIM, not a verified link
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Preview — read-only, non-consuming, user-bound.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.identity_link_preview(
  p_ticket_hash text,
  p_user_id     uuid
)
RETURNS TABLE (
  out_provider     text,
  out_username     text,
  out_display_name text,
  out_tag_line     text,
  out_avatar_url   text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.provider, p.username, p.display_name, p.tag_line, p.avatar_url
    FROM public.identity_link_pending p
   WHERE p.ticket_hash = p_ticket_hash
     AND p.user_id     = p_user_id
     AND p.consumed_at IS NULL
     AND p.expires_at  > now();
END;
$$;

REVOKE ALL ON FUNCTION public.identity_link_preview(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.identity_link_preview(text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Purge — opportunistic, no scheduler.
--
-- consume_attempt and redeem already delete stale rows as they run, which
-- covers every ceremony that reaches the provider. A ceremony ABANDONED at the
-- consent screen reaches neither, so its attempt row would linger. The edge
-- function calls this on `start`, which is the one step every ceremony takes.
-- That is sufficient: rows are tiny, bounded by link attempts, and carry no
-- token. No cron, no always-on service.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.identity_link_purge_expired()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.identity_link_attempts WHERE expires_at < now() - interval '1 hour';
  DELETE FROM public.identity_link_pending  WHERE expires_at < now() - interval '1 hour';
END;
$$;

REVOKE ALL ON FUNCTION public.identity_link_purge_expired() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.identity_link_purge_expired() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Pending-row hygiene, recorded where a reader will actually find it.
--
-- A row in identity_link_pending is an UNPROVEN CLAIM. It says only: "the
-- Mogzy account that started this ceremony completed a provider login, and the
-- provider returned this identity." It is NOT evidence that the two accounts
-- belong to the same person, because anyone can hand their own authorize URL
-- to someone else and have that person's provider login land here.
--
-- The claim becomes a verified association only when the authenticated owner
-- redeems it, at which point the row is consumed and public.user_identity_links
-- holds the result. No admin, user or public surface may read these tables as
-- evidence of a link.
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.identity_link_pending IS
  'TRANSIENT, UNVERIFIED. A provider identity claim awaiting authenticated redemption by the Mogzy account that started the ceremony. NOT a verified account link — public.user_identity_links is the only source of truth for that. Never render or export these rows as an association between a Mogzy user and an external account. Rows are single-use and expire in minutes.';

COMMENT ON COLUMN public.identity_link_pending.user_id IS
  'The Mogzy account that STARTED the ceremony — not necessarily the owner of the provider identity in this row. Redemption is what proves they are the same person.';

COMMENT ON COLUMN public.identity_link_pending.ticket_hash IS
  'SHA-256 of the redemption ticket. The ticket itself is never stored: it travels in a URL and therefore reaches browser history. Reading this table yields nothing redeemable.';

COMMENT ON TABLE public.identity_link_attempts IS
  'TRANSIENT. One in-flight OAuth ceremony, referenced by the signed state. Single-use: consuming it is what makes a replayed OAuth state fail. Holds no provider identity and no token.';

COMMENT ON TABLE public.user_identity_links IS
  'The verified external identities attached to a Mogzy account. Written ONLY by public.identity_link_redeem after an authenticated redemption. Discord and Riot are LINKED identities, never login providers — the Mogzy account remains primary. Holds no OAuth access or refresh token.';

COMMENT ON COLUMN public.user_identity_links.contact_consent IS
  'User-controlled. Permission to contact this person on the provider. Independent of verification and of public visibility: connecting an account never implies consent, and consent resets to false when a DIFFERENT provider account is linked.';

COMMENT ON COLUMN public.user_identity_links.public_on_profile IS
  'User-controlled. Whether this verified identity may be shown on the public Mogzy profile. Stored now; public rendering is a later product decision. Resets to false when a DIFFERENT provider account is linked.';

COMMIT;
