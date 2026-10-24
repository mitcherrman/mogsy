-- ===========================================================================
-- PULSE-2B — Academy Pulse admin workspace: storage, owner RPCs, public read.
--
-- STAGED, NOT APPLIED. Lives outside supabase/migrations on purpose so no
-- tool (Lovable included) applies it on sync. Applying it is an L3 release
-- gate owned by the command center (docs/handoffs/ACADEMY_PULSE_P2B.md §6).
--
-- ADDITIVE ONLY: four new tables, new functions, no change to any existing
-- table, policy or function. Requires OWN1 (public.assert_owner,
-- public.is_owner, public.log_owner_action) — already live.
--
-- AUTHORIZATION MODEL
--   * Tables: RLS on, NO insert/update/delete policies, table privileges
--     revoked from anon/authenticated. The only write path is the
--     pulse_admin_* SECURITY DEFINER functions, each of which starts with
--     public.assert_owner(level) and writes an admin_audit_log row.
--   * Owner may SELECT the tables (RLS USING public.is_owner()) for support.
--   * Levels: 'trusted' for editorial work and the emergency disable;
--     'fresh_aal2' for campaign decisions (approve / reject / end).
--   * The public reads ONLY pulse_public_catalogue(), which applies every
--     eligibility rule server-side (kill switch, status, schedule, category,
--     campaign approval + flight, payload re-validation) and never exposes
--     drafts, notes, contract references or excluded content.
--
-- JSON at the RPC boundary is camelCase and matches
-- src/lib/admin/pulse/contract.ts (contract "pulse-admin/1").
-- ===========================================================================

-- --- tables ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pulse_campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type             text NOT NULL CHECK (type IN ('sponsor', 'creator')),
  partner_name     text NOT NULL CHECK (char_length(btrim(partner_name)) BETWEEN 1 AND 120),
  title            text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  disclosure       text NOT NULL CHECK (disclosure IN ('sponsored', 'paid-partnership', 'affiliate', 'unpaid-spotlight')),
  disclosure_text  text NOT NULL DEFAULT '' CHECK (char_length(disclosure_text) <= 300),
  approval         text NOT NULL DEFAULT 'pending' CHECK (approval IN ('pending', 'approved', 'rejected', 'ended')),
  decided_at       timestamptz,
  decided_by       uuid,
  decision_note    text NOT NULL DEFAULT '' CHECK (char_length(decision_note) <= 500),
  flight_start     timestamptz,
  flight_end       timestamptz,
  contract_ref     text NOT NULL DEFAULT '' CHECK (char_length(contract_ref) <= 200),
  revision         integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pulse_campaign_disclosure_fits_type CHECK (
    (type = 'sponsor' AND disclosure = 'sponsored')
    OR (type = 'creator' AND disclosure IN ('paid-partnership', 'affiliate', 'unpaid-spotlight'))),
  CONSTRAINT pulse_campaign_paid_is_worded CHECK (disclosure = 'unpaid-spotlight' OR char_length(btrim(disclosure_text)) > 0),
  CONSTRAINT pulse_campaign_flight_order CHECK (flight_start IS NULL OR flight_end IS NULL OR flight_end > flight_start)
);

CREATE TABLE IF NOT EXISTS public.pulse_content_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label         text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
  kind          text NOT NULL CHECK (kind IN ('news', 'question', 'minigame', 'sponsor', 'creator')),
  category      text NOT NULL,
  payload       jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 16384),
  state         text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'published', 'unpublished', 'archived')),
  publish_at    timestamptz,
  expires_at    timestamptz,
  priority      integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 999),
  featured      boolean NOT NULL DEFAULT false,
  campaign_id   uuid REFERENCES public.pulse_campaigns(id) ON DELETE RESTRICT,
  note          text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  revision      integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz,
  updated_by    uuid,
  CONSTRAINT pulse_item_kind_category CHECK (
    (kind = 'news' AND category IN ('news', 'event'))
    OR (kind = 'question' AND category = 'educational')
    OR (kind = 'minigame' AND category = 'mini-game')
    OR (kind = 'sponsor' AND category = 'sponsor')
    OR (kind = 'creator' AND category = 'creator-spotlight')),
  CONSTRAINT pulse_item_partner_has_campaign CHECK ((kind IN ('sponsor', 'creator')) = (campaign_id IS NOT NULL)),
  CONSTRAINT pulse_item_window_order CHECK (publish_at IS NULL OR expires_at IS NULL OR expires_at > publish_at)
);
CREATE INDEX IF NOT EXISTS pulse_content_items_public_idx
  ON public.pulse_content_items (category, featured DESC, priority, published_at DESC) WHERE state = 'published';

CREATE TABLE IF NOT EXISTS public.pulse_category_settings (
  category       text PRIMARY KEY CHECK (category IN ('player-activity', 'mini-game', 'sponsor', 'leaderboard', 'news', 'premium',
                   'personal-insight', 'educational', 'creator-spotlight', 'community-challenge', 'event')),
  enabled        boolean NOT NULL DEFAULT true,
  max_per_cycle  integer CHECK (max_per_cycle IS NULL OR max_per_cycle BETWEEN 0 AND 24),
  expires_at     timestamptz,
  revision       integer NOT NULL DEFAULT 1,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pulse_schedule_settings (
  singleton        boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  slots            text[] NOT NULL CHECK (cardinality(slots) BETWEEN 1 AND 24 AND slots <@ ARRAY['player-activity', 'mini-game', 'sponsor',
                     'leaderboard', 'news', 'premium', 'personal-insight', 'educational', 'creator-spotlight', 'community-challenge', 'event']),
  max_promotions   integer NOT NULL CHECK (max_promotions BETWEEN 0 AND 4),
  min_gap          integer NOT NULL CHECK (min_gap BETWEEN 1 AND 12),
  kill_active      boolean NOT NULL DEFAULT false,
  kill_scope       text NOT NULL DEFAULT 'partners' CHECK (kill_scope IN ('partners', 'managed')),
  kill_reason      text NOT NULL DEFAULT '' CHECK (char_length(kill_reason) <= 300),
  kill_changed_at  timestamptz,
  revision         integer NOT NULL DEFAULT 1,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pulse_kill_has_reason CHECK (NOT kill_active OR char_length(btrim(kill_reason)) > 0)
);

-- Defaults: today's DEFAULT_PULSE_CADENCE; categories without an
-- authoritative public source start off (PULSE-2A turns them on).
INSERT INTO public.pulse_schedule_settings (singleton, slots, max_promotions, min_gap)
VALUES (true, ARRAY['player-activity', 'mini-game', 'sponsor', 'leaderboard', 'news', 'premium', 'player-activity',
                    'personal-insight', 'educational', 'creator-spotlight', 'community-challenge', 'event'], 2, 3)
ON CONFLICT (singleton) DO NOTHING;

INSERT INTO public.pulse_category_settings (category, enabled)
SELECT c, c NOT IN ('player-activity', 'leaderboard', 'personal-insight', 'community-challenge')
FROM unnest(ARRAY['player-activity', 'mini-game', 'sponsor', 'leaderboard', 'news', 'premium', 'personal-insight',
                  'educational', 'creator-spotlight', 'community-challenge', 'event']) AS c
ON CONFLICT (category) DO NOTHING;

-- --- privileges + RLS ------------------------------------------------------

ALTER TABLE public.pulse_campaigns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulse_content_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulse_category_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulse_schedule_settings  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pulse_campaigns, public.pulse_content_items, public.pulse_category_settings, public.pulse_schedule_settings
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pulse_campaigns, public.pulse_content_items, public.pulse_category_settings, public.pulse_schedule_settings
  TO authenticated;

-- Owner may read for support. There are deliberately NO write policies.
CREATE POLICY "Owner reads pulse campaigns"  ON public.pulse_campaigns          FOR SELECT TO authenticated USING (public.is_owner());
CREATE POLICY "Owner reads pulse content"    ON public.pulse_content_items      FOR SELECT TO authenticated USING (public.is_owner());
CREATE POLICY "Owner reads pulse categories" ON public.pulse_category_settings  FOR SELECT TO authenticated USING (public.is_owner());
CREATE POLICY "Owner reads pulse schedule"   ON public.pulse_schedule_settings  FOR SELECT TO authenticated USING (public.is_owner());

-- --- private helpers -------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.pulse_internal_path(_t text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT _t IS NOT NULL AND _t ~ '^/[A-Za-z0-9._~/?#&=%+-]*$' AND _t !~ '^//'
$$;

CREATE OR REPLACE FUNCTION private.pulse_https(_t text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT _t IS NOT NULL AND _t ~* '^https://[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]{1,5})?(/[^[:space:]]*)?$'
$$;

CREATE OR REPLACE FUNCTION private.pulse_blank(_t text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT _t IS NULL OR btrim(_t) = ''
$$;

CREATE OR REPLACE FUNCTION private.pulse_issue(_field text, _message text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_array(jsonb_build_object('field', _field, 'message', _message))
$$;

CREATE OR REPLACE FUNCTION private.pulse_raise_invalid(_issues jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- data_exception, not check_violation: RPCs map constraint failures to their own message.
  RAISE EXCEPTION 'pulse_invalid' USING ERRCODE = 'data_exception', DETAIL = _issues::text;
END;
$$;

-- Payload rules (mirrors validation.ts). _for_publish adds "can be drawn" checks.
CREATE OR REPLACE FUNCTION private.pulse_payload_issues(_kind text, _category text, _p jsonb, _for_publish boolean)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  i jsonb := '[]'::jsonb;
  _dwell numeric;
  _opts jsonb;
BEGIN
  IF jsonb_typeof(_p) IS DISTINCT FROM 'object' THEN RETURN private.pulse_issue('payload', 'Payload must be an object.'); END IF;
  IF _p->>'kind' IS DISTINCT FROM _kind THEN i := i || private.pulse_issue('kind', 'Payload kind does not match.'); END IF;
  IF _p->>'category' IS DISTINCT FROM _category THEN i := i || private.pulse_issue('category', 'Payload category does not match.'); END IF;
  IF char_length(coalesce(_p->>'title', '')) > 140 THEN i := i || private.pulse_issue('title', 'Title too long.'); END IF;
  IF _p ? 'dwellMs' AND jsonb_typeof(_p->'dwellMs') <> 'null' THEN
    _dwell := (_p->>'dwellMs')::numeric;
    IF _dwell < 6000 OR _dwell > 30000 THEN i := i || private.pulse_issue('dwellMs', 'Time on screen is 6–30 s.'); END IF;
  END IF;

  IF _kind = 'news' THEN
    IF jsonb_typeof(_p->'href') = 'string' AND NOT private.pulse_internal_path(_p->>'href') THEN
      i := i || private.pulse_issue('href', 'Editorial links stay on Mogzy.'); END IF;
    IF char_length(coalesce(_p->>'headline', '')) > 90 THEN i := i || private.pulse_issue('headline', 'Headline too long.'); END IF;
    IF char_length(coalesce(_p->>'summary', '')) > 220 THEN i := i || private.pulse_issue('summary', 'Summary too long.'); END IF;
    IF (_p->>'variant' = 'event') <> (_category = 'event') THEN i := i || private.pulse_issue('category', 'Events are filed under Event.'); END IF;
    IF _for_publish AND private.pulse_blank(_p->>'headline') THEN i := i || private.pulse_issue('payload', 'Headline required.'); END IF;
    IF _for_publish AND _p->>'variant' = 'event' AND private.pulse_blank(_p->>'startsAt') THEN
      i := i || private.pulse_issue('startsAt', 'An event needs a start time.'); END IF;
  ELSIF _kind = 'question' THEN
    IF NOT private.pulse_internal_path(_p->>'practiceHref') THEN i := i || private.pulse_issue('practiceHref', 'Practice link stays on Mogzy.'); END IF;
    _opts := coalesce(_p->'options', '[]'::jsonb);
    IF _for_publish AND (jsonb_typeof(_opts) <> 'array' OR jsonb_array_length(_opts) < 2
        OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_opts) o WHERE o->>'id' = _p->>'correctId')) THEN
      i := i || private.pulse_issue('payload', 'A question needs 2+ answers including the correct one.'); END IF;
  ELSIF _kind = 'minigame' THEN
    IF NOT private.pulse_internal_path(_p->>'playHref') THEN i := i || private.pulse_issue('playHref', 'Play link stays on Mogzy.'); END IF;
    IF _for_publish AND NOT (coalesce((_p#>>'{demo,windowSizeDeg}')::numeric, 0) > 0 AND (_p#>>'{demo,windowSizeDeg}')::numeric < 360
        AND coalesce((_p#>>'{demo,sweepMs}')::numeric, 0) > 0) THEN
      i := i || private.pulse_issue('payload', 'Dial settings are out of range.'); END IF;
  ELSIF _kind = 'sponsor' THEN
    IF jsonb_typeof(_p->'href') = 'string' AND NOT private.pulse_https(_p->>'href') THEN i := i || private.pulse_issue('href', 'Sponsor destinations must be https.'); END IF;
    IF jsonb_typeof(_p->'artUrl') = 'string' AND NOT private.pulse_https(_p->>'artUrl') THEN i := i || private.pulse_issue('artUrl', 'Artwork must be https.'); END IF;
    IF _for_publish AND (private.pulse_blank(_p->>'sponsorName') OR private.pulse_blank(_p->>'campaignTitle')) THEN
      i := i || private.pulse_issue('payload', 'Sponsor name and campaign title required.'); END IF;
  ELSIF _kind = 'creator' THEN
    IF jsonb_typeof(_p#>'{media,thumbnailUrl}') = 'string' AND NOT private.pulse_https(_p#>>'{media,thumbnailUrl}') THEN
      i := i || private.pulse_issue('thumbnailUrl', 'Thumbnail must be https.'); END IF;
    IF (_p#>>'{media,live}') = 'true' THEN i := i || private.pulse_issue('live', 'LIVE cannot be set by hand.'); END IF;
    IF jsonb_typeof(_p#>'{challenge,href}') = 'string' AND NOT private.pulse_internal_path(_p#>>'{challenge,href}') THEN
      i := i || private.pulse_issue('challengeHref', 'Challenge link stays on Mogzy.'); END IF;
    IF _for_publish THEN
      IF private.pulse_blank(_p->>'creatorName') OR private.pulse_blank(_p#>>'{media,title}') THEN
        i := i || private.pulse_issue('payload', 'Creator name and media title required.'); END IF;
      IF NOT ((_p#>>'{media,platform}' = 'youtube' AND coalesce(_p#>>'{media,videoId}', '') ~ '^[A-Za-z0-9_-]{11}$')
           OR (_p#>>'{media,platform}' = 'twitch' AND coalesce(_p#>>'{media,channel}', '') ~ '^[A-Za-z0-9_]{3,25}$')) THEN
        i := i || private.pulse_issue('media', 'Connect a real video or channel id.'); END IF;
    END IF;
  ELSE
    i := i || private.pulse_issue('kind', 'This kind is provider-generated.');
  END IF;
  RETURN i;
END;
$$;

-- Campaign gate for a partner item going (or staying) live.
CREATE OR REPLACE FUNCTION private.pulse_campaign_issues(_kind text, _campaign_id uuid, _at timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN _kind NOT IN ('sponsor', 'creator') THEN '[]'::jsonb
    WHEN c.id IS NULL THEN private.pulse_issue('campaignId', 'Campaign missing.')
    WHEN c.type <> _kind THEN private.pulse_issue('campaignId', 'Campaign type does not match.')
    WHEN c.approval <> 'approved' THEN private.pulse_issue('campaignId', 'Campaign must be approved first.')
    WHEN c.flight_end IS NOT NULL AND c.flight_end <= _at THEN private.pulse_issue('campaignId', 'Campaign flight has ended.')
    ELSE '[]'::jsonb END
  FROM (SELECT 1) one LEFT JOIN public.pulse_campaigns c ON c.id = _campaign_id
$$;

CREATE OR REPLACE FUNCTION private.pulse_item_json(r public.pulse_content_items)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', r.id, 'label', r.label, 'payload', r.payload, 'state', r.state, 'publishAt', r.publish_at, 'expiresAt', r.expires_at,
    'priority', r.priority, 'featured', r.featured, 'campaignId', r.campaign_id, 'revision', r.revision,
    'createdAt', r.created_at, 'updatedAt', r.updated_at, 'publishedAt', r.published_at, 'note', r.note)
$$;

CREATE OR REPLACE FUNCTION private.pulse_campaign_json(c public.pulse_campaigns)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'type', c.type, 'partnerName', c.partner_name, 'title', c.title, 'disclosure', c.disclosure,
    'disclosureText', c.disclosure_text, 'approval', c.approval, 'decidedAt', c.decided_at, 'decisionNote', c.decision_note,
    'flightStart', c.flight_start, 'flightEnd', c.flight_end, 'contractRef', c.contract_ref, 'revision', c.revision)
$$;

CREATE OR REPLACE FUNCTION private.pulse_category_json(s public.pulse_category_settings)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('category', s.category, 'enabled', s.enabled, 'maxPerCycle', s.max_per_cycle,
    'expiresAt', s.expires_at, 'revision', s.revision)
$$;

CREATE OR REPLACE FUNCTION private.pulse_schedule_json(s public.pulse_schedule_settings)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('slots', to_jsonb(s.slots), 'maxPromotionsPerCycle', s.max_promotions, 'minPromotionGap', s.min_gap,
    'kill', jsonb_build_object('active', s.kill_active, 'scope', s.kill_scope, 'reason', s.kill_reason, 'changedAt', s.kill_changed_at),
    'revision', s.revision)
$$;

REVOKE ALL ON FUNCTION private.pulse_internal_path(text), private.pulse_https(text), private.pulse_blank(text),
  private.pulse_issue(text, text), private.pulse_raise_invalid(jsonb), private.pulse_payload_issues(text, text, jsonb, boolean),
  private.pulse_campaign_issues(text, uuid, timestamptz), private.pulse_item_json(public.pulse_content_items),
  private.pulse_campaign_json(public.pulse_campaigns), private.pulse_category_json(public.pulse_category_settings),
  private.pulse_schedule_json(public.pulse_schedule_settings)
  FROM PUBLIC, anon, authenticated;

-- --- owner RPCs --------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pulse_admin_snapshot()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_owner('trusted');
  RETURN jsonb_build_object(
    'contractVersion', 'pulse-admin/1',
    'items', coalesce((SELECT jsonb_agg(private.pulse_item_json(r) ORDER BY r.category, r.priority, r.created_at) FROM public.pulse_content_items r), '[]'::jsonb),
    'categories', coalesce((SELECT jsonb_agg(private.pulse_category_json(s) ORDER BY s.category) FROM public.pulse_category_settings s), '[]'::jsonb),
    'schedule', (SELECT private.pulse_schedule_json(s) FROM public.pulse_schedule_settings s WHERE s.singleton),
    'campaigns', coalesce((SELECT jsonb_agg(private.pulse_campaign_json(c) ORDER BY c.created_at) FROM public.pulse_campaigns c), '[]'::jsonb),
    'serverNow', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.pulse_admin_save_item(_item jsonb, _expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id uuid := nullif(_item->>'id', '')::uuid;
  _p jsonb := _item->'payload';
  _kind text := _item#>>'{payload,kind}';
  _category text := _item#>>'{payload,category}';
  _campaign uuid := nullif(_item->>'campaignId', '')::uuid;
  _publish_at timestamptz := nullif(_item->>'publishAt', '')::timestamptz;
  _expires_at timestamptz := nullif(_item->>'expiresAt', '')::timestamptz;
  _issues jsonb;
  r public.pulse_content_items;
BEGIN
  PERFORM public.assert_owner('trusted');
  _issues := private.pulse_payload_issues(_kind, _category, _p, false);
  IF private.pulse_blank(_item->>'label') THEN _issues := _issues || private.pulse_issue('label', 'Name required.'); END IF;
  IF _issues <> '[]'::jsonb THEN PERFORM private.pulse_raise_invalid(_issues); END IF;

  IF _id IS NULL THEN
    IF _expected_revision IS NOT NULL THEN RAISE EXCEPTION 'pulse_conflict' USING ERRCODE = 'serialization_failure'; END IF;
    _id := gen_random_uuid();
    INSERT INTO public.pulse_content_items (id, label, kind, category, payload, publish_at, expires_at, priority, featured, campaign_id, note, updated_by)
    VALUES (_id, btrim(_item->>'label'), _kind, _category,
            _p || jsonb_build_object('id', _id, 'provenance', 'live'), _publish_at, _expires_at,
            coalesce((_item->>'priority')::integer, 100), coalesce((_item->>'featured')::boolean, false), _campaign,
            coalesce(_item->>'note', ''), auth.uid())
    RETURNING * INTO r;
  ELSE
    SELECT * INTO r FROM public.pulse_content_items WHERE id = _id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'pulse_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF r.revision IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION 'pulse_conflict' USING ERRCODE = 'serialization_failure'; END IF;
    IF r.kind <> _kind THEN PERFORM private.pulse_raise_invalid(private.pulse_issue('kind', 'Kind cannot change.')); END IF;
    -- Editing published content must keep it publishable.
    IF r.state = 'published' THEN
      _issues := private.pulse_payload_issues(_kind, _category, _p, true) || private.pulse_campaign_issues(_kind, _campaign, now());
      IF _issues <> '[]'::jsonb THEN PERFORM private.pulse_raise_invalid(_issues); END IF;
    END IF;
    UPDATE public.pulse_content_items SET
      label = btrim(_item->>'label'), category = _category, payload = _p || jsonb_build_object('id', _id, 'provenance', 'live'),
      publish_at = CASE WHEN r.state = 'published' THEN r.publish_at ELSE _publish_at END, expires_at = _expires_at,
      priority = coalesce((_item->>'priority')::integer, r.priority), featured = coalesce((_item->>'featured')::boolean, r.featured),
      campaign_id = _campaign, note = coalesce(_item->>'note', ''), revision = r.revision + 1, updated_at = now(), updated_by = auth.uid()
    WHERE id = _id RETURNING * INTO r;
  END IF;
  PERFORM public.log_owner_action('pulse.save_item', NULL, 'ok', jsonb_build_object('id', r.id, 'revision', r.revision));
  RETURN private.pulse_item_json(r);
END;
$$;

CREATE OR REPLACE FUNCTION public.pulse_admin_transition_item(_id uuid, _action text, _publish_at timestamptz, _expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.pulse_content_items;
  _issues jsonb;
  _allowed boolean;
BEGIN
  PERFORM public.assert_owner('trusted');
  SELECT * INTO r FROM public.pulse_content_items WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pulse_not_found' USING ERRCODE = 'no_data_found'; END IF;
  IF r.revision IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION 'pulse_conflict' USING ERRCODE = 'serialization_failure'; END IF;

  -- Same table as lifecycle.ts.
  _allowed := CASE r.state
    WHEN 'draft' THEN _action IN ('publish', 'schedule', 'archive')
    WHEN 'published' THEN _action IN ('unpublish', 'schedule')
    WHEN 'unpublished' THEN _action IN ('publish', 'schedule', 'revert-to-draft', 'archive')
    WHEN 'archived' THEN _action = 'revert-to-draft'
    ELSE false END;
  IF NOT _allowed THEN
    PERFORM private.pulse_raise_invalid(private.pulse_issue('state', format('Cannot %s content that is %s.', _action, r.state)));
  END IF;

  IF _action IN ('publish', 'schedule') THEN
    IF _action = 'schedule' AND (_publish_at IS NULL OR _publish_at <= now()) THEN
      PERFORM private.pulse_raise_invalid(private.pulse_issue('publishAt', 'Schedule for a time in the future.'));
    END IF;
    _issues := private.pulse_payload_issues(r.kind, r.category, r.payload, true) || private.pulse_campaign_issues(r.kind, r.campaign_id, now());
    IF r.expires_at IS NOT NULL AND r.expires_at <= coalesce(_publish_at, now()) THEN
      _issues := _issues || private.pulse_issue('expiresAt', 'Expiry must be after it goes live.');
    END IF;
    IF _issues <> '[]'::jsonb THEN PERFORM private.pulse_raise_invalid(_issues); END IF;
  END IF;

  UPDATE public.pulse_content_items SET
    state = CASE _action WHEN 'publish' THEN 'published' WHEN 'schedule' THEN 'published' WHEN 'unpublish' THEN 'unpublished'
                         WHEN 'archive' THEN 'archived' ELSE 'draft' END,
    publish_at = CASE _action WHEN 'publish' THEN NULL WHEN 'schedule' THEN _publish_at WHEN 'revert-to-draft' THEN NULL ELSE r.publish_at END,
    published_at = CASE WHEN _action = 'publish' THEN now() WHEN _action = 'schedule' THEN coalesce(r.published_at, now()) ELSE r.published_at END,
    revision = r.revision + 1, updated_at = now(), updated_by = auth.uid()
  WHERE id = _id RETURNING * INTO r;
  PERFORM public.log_owner_action('pulse.' || _action, NULL, 'ok', jsonb_build_object('id', r.id, 'publishAt', r.publish_at));
  RETURN private.pulse_item_json(r);
END;
$$;

CREATE OR REPLACE FUNCTION public.pulse_admin_save_category(
  _category text, _enabled boolean, _max_per_cycle integer, _expires_at timestamptz, _expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.pulse_category_settings;
BEGIN
  PERFORM public.assert_owner('trusted');
  SELECT * INTO s FROM public.pulse_category_settings WHERE category = _category FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pulse_not_found' USING ERRCODE = 'no_data_found'; END IF;
  IF s.revision IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION 'pulse_conflict' USING ERRCODE = 'serialization_failure'; END IF;
  IF _max_per_cycle IS NOT NULL AND (_max_per_cycle < 0 OR _max_per_cycle > 24) THEN
    PERFORM private.pulse_raise_invalid(private.pulse_issue('maxPerCycle', 'Frequency is 0–24.'));
  END IF;
  UPDATE public.pulse_category_settings SET enabled = coalesce(_enabled, s.enabled), max_per_cycle = _max_per_cycle,
    expires_at = _expires_at, revision = s.revision + 1, updated_at = now()
  WHERE category = _category RETURNING * INTO s;
  PERFORM public.log_owner_action('pulse.save_category', NULL, 'ok', private.pulse_category_json(s));
  RETURN private.pulse_category_json(s);
END;
$$;

CREATE OR REPLACE FUNCTION public.pulse_admin_save_schedule(_slots text[], _max_promotions integer, _min_gap integer, _expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.pulse_schedule_settings;
BEGIN
  PERFORM public.assert_owner('trusted');
  SELECT * INTO s FROM public.pulse_schedule_settings WHERE singleton FOR UPDATE;
  IF s.revision IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION 'pulse_conflict' USING ERRCODE = 'serialization_failure'; END IF;
  BEGIN
    UPDATE public.pulse_schedule_settings SET slots = _slots, max_promotions = _max_promotions, min_gap = _min_gap,
      revision = s.revision + 1, updated_at = now()
    WHERE singleton RETURNING * INTO s;
  EXCEPTION WHEN check_violation OR not_null_violation THEN
    PERFORM private.pulse_raise_invalid(private.pulse_issue('slots', 'Cadence is out of bounds (1–24 known slots, 0–4 promotions, spacing 1–12).'));
  END;
  PERFORM public.log_owner_action('pulse.save_schedule', NULL, 'ok', private.pulse_schedule_json(s));
  RETURN private.pulse_schedule_json(s);
END;
$$;

CREATE OR REPLACE FUNCTION public.pulse_admin_save_campaign(_campaign jsonb, _expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id uuid := nullif(_campaign->>'id', '')::uuid;
  c public.pulse_campaigns;
  _material boolean;
BEGIN
  PERFORM public.assert_owner('trusted');
  BEGIN
    IF _id IS NULL THEN
      IF _expected_revision IS NOT NULL THEN RAISE EXCEPTION 'pulse_conflict' USING ERRCODE = 'serialization_failure'; END IF;
      INSERT INTO public.pulse_campaigns (type, partner_name, title, disclosure, disclosure_text, flight_start, flight_end, contract_ref)
      VALUES (_campaign->>'type', btrim(_campaign->>'partnerName'), btrim(_campaign->>'title'), _campaign->>'disclosure',
              coalesce(_campaign->>'disclosureText', ''), nullif(_campaign->>'flightStart', '')::timestamptz,
              nullif(_campaign->>'flightEnd', '')::timestamptz, coalesce(_campaign->>'contractRef', ''))
      RETURNING * INTO c;
    ELSE
      SELECT * INTO c FROM public.pulse_campaigns WHERE id = _id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'pulse_not_found' USING ERRCODE = 'no_data_found'; END IF;
      IF c.revision IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION 'pulse_conflict' USING ERRCODE = 'serialization_failure'; END IF;
      IF c.type IS DISTINCT FROM _campaign->>'type' THEN PERFORM private.pulse_raise_invalid(private.pulse_issue('type', 'Type cannot change.')); END IF;
      -- A material change to an approved campaign goes back for approval.
      _material := c.partner_name IS DISTINCT FROM btrim(_campaign->>'partnerName')
        OR c.disclosure IS DISTINCT FROM _campaign->>'disclosure' OR c.disclosure_text IS DISTINCT FROM coalesce(_campaign->>'disclosureText', '');
      UPDATE public.pulse_campaigns SET partner_name = btrim(_campaign->>'partnerName'), title = btrim(_campaign->>'title'),
        disclosure = _campaign->>'disclosure', disclosure_text = coalesce(_campaign->>'disclosureText', ''),
        flight_start = nullif(_campaign->>'flightStart', '')::timestamptz, flight_end = nullif(_campaign->>'flightEnd', '')::timestamptz,
        contract_ref = coalesce(_campaign->>'contractRef', ''),
        approval = CASE WHEN _material AND c.approval = 'approved' THEN 'pending' ELSE c.approval END,
        revision = c.revision + 1, updated_at = now()
      WHERE id = _id RETURNING * INTO c;
    END IF;
  EXCEPTION WHEN check_violation OR not_null_violation THEN
    PERFORM private.pulse_raise_invalid(private.pulse_issue('disclosure', 'Campaign fields or disclosure are not valid for this type.'));
  END;
  PERFORM public.log_owner_action('pulse.save_campaign', NULL, 'ok', jsonb_build_object('id', c.id, 'approval', c.approval));
  RETURN private.pulse_campaign_json(c);
END;
$$;

CREATE OR REPLACE FUNCTION public.pulse_admin_decide_campaign(_id uuid, _decision text, _note text, _expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.pulse_campaigns;
BEGIN
  -- Approving a sponsor / paid creator is the highest-trust editorial act: fresh MFA.
  PERFORM public.assert_owner('fresh_aal2');
  SELECT * INTO c FROM public.pulse_campaigns WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pulse_not_found' USING ERRCODE = 'no_data_found'; END IF;
  IF c.revision IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION 'pulse_conflict' USING ERRCODE = 'serialization_failure'; END IF;
  IF NOT ((_decision = 'approve' AND c.approval IN ('pending', 'rejected'))
       OR (_decision = 'reject' AND c.approval = 'pending')
       OR (_decision = 'end' AND c.approval = 'approved')) THEN
    PERFORM private.pulse_raise_invalid(private.pulse_issue('approval', format('Cannot %s a campaign that is %s.', _decision, c.approval)));
  END IF;
  IF _decision <> 'approve' AND private.pulse_blank(_note) THEN
    PERFORM private.pulse_raise_invalid(private.pulse_issue('note', 'Record why.'));
  END IF;
  UPDATE public.pulse_campaigns SET
    approval = CASE _decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'ended' END,
    decided_at = now(), decided_by = auth.uid(), decision_note = left(coalesce(btrim(_note), ''), 500),
    revision = c.revision + 1, updated_at = now()
  WHERE id = _id RETURNING * INTO c;
  PERFORM public.log_owner_action('pulse.campaign_' || _decision, NULL, 'ok', jsonb_build_object('id', c.id, 'partner', c.partner_name));
  RETURN private.pulse_campaign_json(c);
END;
$$;

-- Emergency disable: trusted level (never blocked behind MFA in an incident),
-- no revision check (it must win), reason required to switch on.
CREATE OR REPLACE FUNCTION public.pulse_admin_set_kill(_active boolean, _scope text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.pulse_schedule_settings;
BEGIN
  PERFORM public.assert_owner('trusted');
  IF _scope NOT IN ('partners', 'managed') THEN PERFORM private.pulse_raise_invalid(private.pulse_issue('scope', 'Unknown scope.')); END IF;
  IF _active AND private.pulse_blank(_reason) THEN PERFORM private.pulse_raise_invalid(private.pulse_issue('reason', 'Record why.')); END IF;
  UPDATE public.pulse_schedule_settings SET kill_active = _active, kill_scope = _scope, kill_reason = left(btrim(coalesce(_reason, '')), 300),
    kill_changed_at = now(), revision = revision + 1, updated_at = now()
  WHERE singleton RETURNING * INTO s;
  PERFORM public.log_owner_action(CASE WHEN _active THEN 'pulse.kill_on' ELSE 'pulse.kill_off' END, NULL, 'ok',
    jsonb_build_object('scope', _scope, 'reason', s.kill_reason));
  RETURN private.pulse_schedule_json(s);
END;
$$;

-- --- the ONLY public read ----------------------------------------------------
-- Consumed by the PULSE-2A provider. Returns eligible scene payloads in
-- rotation order with their campaign disclosure, and the effective cadence
-- (empty slots = consumer keeps DEFAULT_PULSE_CADENCE). No drafts, notes,
-- contract refs or excluded content ever leave the database.
CREATE OR REPLACE FUNCTION public.pulse_public_catalogue()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s public.pulse_schedule_settings;
  _now timestamptz := now();
  _items jsonb;
  _slots jsonb;
BEGIN
  SELECT * INTO s FROM public.pulse_schedule_settings WHERE singleton;

  IF s.kill_active AND s.kill_scope = 'managed' THEN
    _items := '[]'::jsonb;
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'item', r.payload || jsonb_build_object('id', r.id, 'provenance', 'live'),
             'disclosure', CASE WHEN c.id IS NULL THEN NULL
               ELSE jsonb_build_object('kind', c.disclosure, 'text', c.disclosure_text, 'partner', c.partner_name) END)
           ORDER BY r.category, r.featured DESC, r.priority, r.published_at DESC NULLS LAST, r.id), '[]'::jsonb)
      INTO _items
      FROM public.pulse_content_items r
      JOIN public.pulse_category_settings cs ON cs.category = r.category
      LEFT JOIN public.pulse_campaigns c ON c.id = r.campaign_id
     WHERE r.state = 'published'
       AND (r.publish_at IS NULL OR r.publish_at <= _now)
       AND (r.expires_at IS NULL OR r.expires_at > _now)
       AND cs.enabled AND coalesce(cs.max_per_cycle, 1) > 0 AND (cs.expires_at IS NULL OR cs.expires_at > _now)
       AND (r.kind NOT IN ('sponsor', 'creator') OR (
             NOT (s.kill_active AND s.kill_scope = 'partners')
             AND c.approval = 'approved'
             AND (c.flight_start IS NULL OR c.flight_start <= _now)
             AND (c.flight_end IS NULL OR c.flight_end > _now)))
       AND private.pulse_payload_issues(r.kind, r.category, r.payload, true) = '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(slot ORDER BY ord), '[]'::jsonb) INTO _slots
    FROM (
      SELECT t.slot, t.ord, row_number() OVER (PARTITION BY t.slot ORDER BY t.ord) AS n, cs.max_per_cycle
        FROM unnest(s.slots) WITH ORDINALITY AS t(slot, ord)
        JOIN public.pulse_category_settings cs ON cs.category = t.slot
       WHERE cs.enabled AND coalesce(cs.max_per_cycle, 1) > 0 AND (cs.expires_at IS NULL OR cs.expires_at > _now)
    ) q
   WHERE q.max_per_cycle IS NULL OR q.n <= q.max_per_cycle;

  RETURN jsonb_build_object(
    'contractVersion', 'pulse-public/1',
    'generatedAt', _now,
    'fallbackToStatic', s.kill_active AND s.kill_scope = 'managed',
    'cadence', jsonb_build_object('slots', _slots, 'maxPromotionsPerCycle', s.max_promotions, 'minPromotionGap', s.min_gap),
    'items', _items);
END;
$$;

-- --- function privileges -----------------------------------------------------

REVOKE ALL ON FUNCTION public.pulse_admin_snapshot(), public.pulse_admin_save_item(jsonb, integer),
  public.pulse_admin_transition_item(uuid, text, timestamptz, integer),
  public.pulse_admin_save_category(text, boolean, integer, timestamptz, integer),
  public.pulse_admin_save_schedule(text[], integer, integer, integer), public.pulse_admin_save_campaign(jsonb, integer),
  public.pulse_admin_decide_campaign(uuid, text, text, integer), public.pulse_admin_set_kill(boolean, text, text),
  public.pulse_public_catalogue()
  FROM PUBLIC, anon;

-- Signed-in callers may invoke the admin RPCs; assert_owner() refuses everyone but the owner.
GRANT EXECUTE ON FUNCTION public.pulse_admin_snapshot(), public.pulse_admin_save_item(jsonb, integer),
  public.pulse_admin_transition_item(uuid, text, timestamptz, integer),
  public.pulse_admin_save_category(text, boolean, integer, timestamptz, integer),
  public.pulse_admin_save_schedule(text[], integer, integer, integer), public.pulse_admin_save_campaign(jsonb, integer),
  public.pulse_admin_decide_campaign(uuid, text, text, integer), public.pulse_admin_set_kill(boolean, text, text)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.pulse_public_catalogue() TO anon, authenticated;
