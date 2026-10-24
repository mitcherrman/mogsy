-- ===========================================================================
-- PULSE-2B — Academy Pulse admin workspace: storage, owner RPCs, public read.
-- Contract: admin "pulse-admin/2", public "pulse-public/2".
--
-- STAGED, NOT APPLIED. Lives outside supabase/migrations on purpose so no
-- tool (Lovable included) applies it on sync. Applying it is an L3 release
-- gate owned by the command center (docs/handoffs/ACADEMY_PULSE_P2B.md §6).
--
-- ADDITIVE ONLY: new tables and functions; no change to any existing table,
-- policy or function. Requires OWN1 (public.assert_owner, public.is_owner,
-- public.log_owner_action, admin_audit_log.aal/session_id) — already live.
--
-- CONTENT MODEL
--   * Editorial items (news / event / question / mini-game): the shared
--     PulseItem payload in an editorial envelope.
--   * Partner records (sponsor / creator): PULSE-2C's SponsorCampaignRecord /
--     CreatorRecord (#153 partner-contract.ts), stored without status /
--     approval / provenance (server-owned columns) and emitted in exactly
--     2C's shape. Only admin-side columns (compensation, note, revision) are
--     added, and they are never public.
--
-- AUTHORIZATION MODEL
--   * Tables: RLS on, NO insert/update/delete policies, table privileges
--     revoked from anon/authenticated. The only write path is the
--     pulse_admin_* SECURITY DEFINER functions; each starts with
--     public.assert_owner(level) and writes an admin_audit_log row.
--   * Owner may SELECT the tables (RLS USING public.is_owner()) for support.
--   * Assurance (provisional owner policy, PR #155 command-center review):
--       trusted     editorial work incl. event publication; emergency
--                   disable; anything that only reduces exposure
--       fresh_aal2  restore after emergency disable (incl. narrowing
--                   managed → partners); approve / resume a sponsor or a
--                   paid/affiliate creator; editing an approved or paused
--                   paid-promotion record; adding a sponsor destination host
--   * Release gates (private.pulse_release_gates) can be opened ONLY by a
--     reviewed migration. Until the shared-type PR renders disclosure, no
--     sponsor and no paid creator leaves the database, approved or not.
--   * The public reads ONLY pulse_public_catalogue(), which applies every
--     eligibility rule server-side and never exposes drafts, notes,
--     compensation, owner ids or excluded content.
-- ===========================================================================

-- --- tables ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pulse_content_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label         text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
  kind          text NOT NULL CHECK (kind IN ('news', 'question', 'minigame')),
  category      text NOT NULL,
  payload       jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 16384),
  state         text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'published', 'unpublished', 'archived')),
  publish_at    timestamptz,
  expires_at    timestamptz,
  priority      integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 999),
  featured      boolean NOT NULL DEFAULT false,
  note          text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  revision      integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz,
  updated_by    uuid,
  CONSTRAINT pulse_item_kind_category CHECK (
    (kind = 'news' AND category IN ('news', 'event'))
    OR (kind = 'question' AND category = 'educational')
    OR (kind = 'minigame' AND category = 'mini-game')),
  CONSTRAINT pulse_item_window_order CHECK (publish_at IS NULL OR expires_at IS NULL OR expires_at > publish_at)
);
CREATE INDEX IF NOT EXISTS pulse_content_items_public_idx
  ON public.pulse_content_items (category, featured DESC, priority, published_at DESC) WHERE state = 'published';

-- PULSE-2C records. `record` holds the owner-editable fields only.
CREATE TABLE IF NOT EXISTS public.pulse_partner_records (
  id             text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  type           text NOT NULL CHECK (type IN ('sponsor', 'creator')),
  record         jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object' AND pg_column_size(record) <= 16384),
  compensation   text,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending-review', 'approved', 'paused', 'ended', 'rejected')),
  approved_at    timestamptz,
  approved_by    uuid,
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  recorded_by    uuid,
  note           text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  decision_note  text NOT NULL DEFAULT '' CHECK (char_length(decision_note) <= 500),
  revision       integer NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pulse_partner_compensation_fits_type CHECK (
    (type = 'sponsor' AND compensation IS NULL)
    OR (type = 'creator' AND compensation IN ('unpaid', 'paid', 'affiliate'))),
  CONSTRAINT pulse_partner_approval_matches_status CHECK ((status IN ('approved', 'paused')) = (approved_at IS NOT NULL)),
  CONSTRAINT pulse_partner_record_id_matches CHECK (record->>'id' = id)
);

-- Global sponsor destination allowlist: a destination host must be here AND
-- in the campaign's own approvedHosts. Empty by default: no sponsor can be
-- approved until the owner (fresh MFA) allows its host.
CREATE TABLE IF NOT EXISTS public.pulse_sponsor_host_allowlist (
  host      text PRIMARY KEY CHECK (host ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
                                    AND host !~ '^[0-9.]+$' AND char_length(host) <= 253),
  added_at  timestamptz NOT NULL DEFAULT now(),
  added_by  uuid
);

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

CREATE SCHEMA IF NOT EXISTS private;

-- Release gates: no RPC writes this table. Opening a gate is a reviewed
-- migration that ships with the shared-type PR rendering the disclosure.
CREATE TABLE IF NOT EXISTS private.pulse_release_gates (
  singleton                         boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  sponsor_disclosure_rendered       boolean NOT NULL DEFAULT false,
  paid_creator_disclosure_rendered  boolean NOT NULL DEFAULT false
);
INSERT INTO private.pulse_release_gates (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;
REVOKE ALL ON private.pulse_release_gates FROM PUBLIC, anon, authenticated;

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

ALTER TABLE public.pulse_content_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulse_partner_records         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulse_sponsor_host_allowlist  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulse_category_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulse_schedule_settings       ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pulse_content_items, public.pulse_partner_records, public.pulse_sponsor_host_allowlist,
  public.pulse_category_settings, public.pulse_schedule_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pulse_content_items, public.pulse_partner_records, public.pulse_sponsor_host_allowlist,
  public.pulse_category_settings, public.pulse_schedule_settings TO authenticated;

-- Owner may read for support. There are deliberately NO write policies.
CREATE POLICY "Owner reads pulse content"        ON public.pulse_content_items          FOR SELECT TO authenticated USING (public.is_owner());
CREATE POLICY "Owner reads pulse partners"       ON public.pulse_partner_records        FOR SELECT TO authenticated USING (public.is_owner());
CREATE POLICY "Owner reads pulse sponsor hosts"  ON public.pulse_sponsor_host_allowlist FOR SELECT TO authenticated USING (public.is_owner());
CREATE POLICY "Owner reads pulse categories"     ON public.pulse_category_settings      FOR SELECT TO authenticated USING (public.is_owner());
CREATE POLICY "Owner reads pulse schedule"       ON public.pulse_schedule_settings      FOR SELECT TO authenticated USING (public.is_owner());

-- --- private helpers: shared -----------------------------------------------

CREATE OR REPLACE FUNCTION private.pulse_internal_path(_t text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT _t IS NOT NULL AND _t ~ '^/[A-Za-z0-9._~/?#&=%+-]*$' AND _t !~ '^//'
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

-- --- private helpers: editorial ----------------------------------------------

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
    IF jsonb_typeof(_p->'dwellMs') <> 'number' THEN
      i := i || private.pulse_issue('dwellMs', 'Time on screen must be a number.');
    ELSE
      _dwell := (_p->>'dwellMs')::numeric;
      IF _dwell < 6000 OR _dwell > 30000 THEN i := i || private.pulse_issue('dwellMs', 'Time on screen is 6–30 s.'); END IF;
    END IF;
  END IF;

  IF _kind = 'news' THEN
    IF jsonb_typeof(_p->'href') = 'string' AND NOT private.pulse_internal_path(_p->>'href') THEN
      i := i || private.pulse_issue('href', 'Editorial links stay on Mogzy.'); END IF;
    IF char_length(coalesce(_p->>'headline', '')) > 90 THEN i := i || private.pulse_issue('headline', 'Headline too long.'); END IF;
    IF char_length(coalesce(_p->>'summary', '')) > 220 THEN i := i || private.pulse_issue('summary', 'Summary too long.'); END IF;
    IF (_p->>'variant' = 'event') IS DISTINCT FROM (_category = 'event') THEN i := i || private.pulse_issue('category', 'Events are filed under Event.'); END IF;
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
    IF _for_publish AND NOT (jsonb_typeof(_p#>'{demo,windowSizeDeg}') = 'number' AND jsonb_typeof(_p#>'{demo,sweepMs}') = 'number'
        AND (_p#>>'{demo,windowSizeDeg}')::numeric > 0 AND (_p#>>'{demo,windowSizeDeg}')::numeric < 360
        AND (_p#>>'{demo,sweepMs}')::numeric > 0) THEN
      i := i || private.pulse_issue('payload', 'Dial settings are out of range.'); END IF;
  ELSE
    i := i || private.pulse_issue('kind', 'Not an editorial kind: sponsors and creators are partner records.');
  END IF;
  RETURN i;
END;
$$;

CREATE OR REPLACE FUNCTION private.pulse_item_json(r public.pulse_content_items)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', r.id, 'label', r.label, 'payload', r.payload, 'state', r.state, 'publishAt', r.publish_at, 'expiresAt', r.expires_at,
    'priority', r.priority, 'featured', r.featured, 'revision', r.revision,
    'createdAt', r.created_at, 'updatedAt', r.updated_at, 'publishedAt', r.published_at, 'note', r.note)
$$;

-- --- private helpers: partner records (PULSE-2C rules) -----------------------

-- 2C parseInstant: ISO-8601 WITH an explicit offset, else NULL.
CREATE OR REPLACE FUNCTION private.pulse_instant(_t text)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF _t IS NULL OR _t !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$' THEN RETURN NULL; END IF;
  RETURN _t::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- 2C cleanText as a predicate: non-blank, bounded, no control / bidi-override characters.
CREATE OR REPLACE FUNCTION private.pulse_text_ok(_t text, _max integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT _t IS NOT NULL
     AND btrim(regexp_replace(_t, '\s+', ' ', 'g')) <> ''
     AND char_length(btrim(regexp_replace(_t, '\s+', ' ', 'g'))) <= _max
     AND _t !~ '[\u0001-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]'
$$;

-- 2C safeHttpsUrl: https, no credentials / port / IP literal, exact (case-insensitive) host match.
CREATE OR REPLACE FUNCTION private.pulse_https_host(_url text, _hosts text[])
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN _url IS NULL OR char_length(_url) > 2048 OR _url <> btrim(_url) THEN NULL
    WHEN _url !~ '^https://[A-Za-z0-9.-]+(/[^[:space:]]*)?$' THEN NULL
    ELSE (SELECT h FROM (SELECT lower(substring(_url FROM '^https://([A-Za-z0-9.-]+)')) AS h) q
           WHERE q.h !~ '^[0-9.]+$' AND q.h = ANY (SELECT lower(x) FROM unnest(_hosts) x))
  END
$$;

-- 2C safeImageSrc: same-origin absolute path, or https on the partner image hosts.
CREATE OR REPLACE FUNCTION private.pulse_image_ok(_url text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT _url IS NOT NULL AND (
    (_url LIKE '/%' AND _url NOT LIKE '//%' AND position('\' IN _url) = 0 AND position('..' IN _url) = 0 AND char_length(_url) <= 2048)
    OR private.pulse_https_host(_url, ARRAY['i.ytimg.com']) IS NOT NULL)
$$;

CREATE OR REPLACE FUNCTION private.pulse_youtube_ok(_url text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT _url IS NOT NULL AND char_length(_url) <= 2048 AND (
       _url ~ '^https://(www\.|m\.)?youtube\.com/watch\?(.*&)?v=[A-Za-z0-9_-]{11}(&[^[:space:]]*)?$'
    OR _url ~ '^https://(www\.|m\.)?youtube\.com/(shorts|embed|live)/[A-Za-z0-9_-]{11}([/?][^[:space:]]*)?$'
    OR _url ~ '^https://youtu\.be/[A-Za-z0-9_-]{11}([/?][^[:space:]]*)?$'
    OR _url ~ '^https://(www\.)?youtube-nocookie\.com/embed/[A-Za-z0-9_-]{11}([/?][^[:space:]]*)?$')
$$;

CREATE OR REPLACE FUNCTION private.pulse_twitch_ok(_url text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT _url IS NOT NULL AND _url ~ '^https://(www\.|m\.)?twitch\.tv/[A-Za-z0-9_]{4,25}/?$'
$$;

/*
 * Partner record rules. Save (_for_approval = false): only the owner-editable
 * keys of 2C's record are accepted (so status / approval / provenance, any
 * LIVE or viewer claim, and challenge scores can never be written), and
 * nothing present may be unsafe or too long. Approval adds 2C's full rules
 * plus the global sponsor host allowlist.
 */
CREATE OR REPLACE FUNCTION private.pulse_partner_issues(_type text, _r jsonb, _for_approval boolean, _allow text[], _now timestamptz)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  i jsonb := '[]'::jsonb;
  _k text;
  _start timestamptz;
  _end timestamptz;
  _host text;
  _m jsonb := _r->'media';
BEGIN
  IF jsonb_typeof(_r) IS DISTINCT FROM 'object' THEN RETURN private.pulse_issue('record', 'Record must be an object.'); END IF;
  IF coalesce(_r->>'id', '') !~ '^[A-Za-z0-9_-]{1,80}$' THEN i := i || private.pulse_issue('id', 'A short id: letters, digits, - and _.'); END IF;

  IF _type = 'sponsor' THEN
    FOR _k IN SELECT jsonb_object_keys(_r) LOOP
      IF _k NOT IN ('id', 'sponsorName', 'campaignTitle', 'tagline', 'ctaLabel', 'artwork', 'destinationUrl', 'approvedHosts',
                    'disclosure', 'window', 'placement') THEN
        i := i || private.pulse_issue(_k, format('“%s” is not an owner-editable sponsor field.', _k)); END IF;
    END LOOP;
    IF NOT private.pulse_blank(_r->>'sponsorName') AND NOT private.pulse_text_ok(_r->>'sponsorName', 40) THEN i := i || private.pulse_issue('sponsorName', 'Up to 40 characters.'); END IF;
    IF NOT private.pulse_blank(_r->>'campaignTitle') AND NOT private.pulse_text_ok(_r->>'campaignTitle', 100) THEN i := i || private.pulse_issue('campaignTitle', 'Up to 100 characters.'); END IF;
    IF NOT private.pulse_blank(_r->>'tagline') AND NOT private.pulse_text_ok(_r->>'tagline', 140) THEN i := i || private.pulse_issue('tagline', 'Up to 140 characters.'); END IF;
    IF NOT private.pulse_blank(_r->>'ctaLabel') AND NOT private.pulse_text_ok(_r->>'ctaLabel', 24) THEN i := i || private.pulse_issue('ctaLabel', 'Up to 24 characters.'); END IF;
    IF jsonb_typeof(_r->'approvedHosts') IS DISTINCT FROM 'array'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(_r->'approvedHosts') h
                  WHERE jsonb_typeof(h) <> 'string' OR lower(h #>> '{}') !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
                     OR (h #>> '{}') ~ '^[0-9.]+$') THEN
      i := i || private.pulse_issue('approvedHosts', 'Approved hosts must be hostnames.'); END IF;
    IF NOT private.pulse_blank(_r->>'destinationUrl') AND private.pulse_https_host(_r->>'destinationUrl',
         ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(_r->'approvedHosts') = 'array' THEN _r->'approvedHosts' ELSE '[]' END))) IS NULL THEN
      i := i || private.pulse_issue('destinationUrl', 'https, on one of this campaign''s approved hosts.'); END IF;
    IF NOT private.pulse_blank(_r#>>'{artwork,url}') AND NOT private.pulse_image_ok(_r#>>'{artwork,url}') THEN
      i := i || private.pulse_issue('artworkUrl', 'Same-origin path or an allowed image host.'); END IF;
    IF _r#>>'{disclosure,label}' IS DISTINCT FROM 'Sponsored' THEN i := i || private.pulse_issue('disclosure', 'Sponsors are disclosed as Sponsored.'); END IF;
    IF jsonb_typeof(_r#>'{placement,surfaces}') IS DISTINCT FROM 'array'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(_r#>'{placement,surfaces}') s WHERE s <> 'academy-pulse') THEN
      i := i || private.pulse_issue('placement', 'Academy Pulse is the only surface.'); END IF;

    IF _for_approval THEN
      IF NOT (private.pulse_text_ok(_r->>'sponsorName', 40) AND private.pulse_text_ok(_r->>'campaignTitle', 100)
              AND private.pulse_text_ok(_r->>'tagline', 140) AND private.pulse_text_ok(_r->>'ctaLabel', 24)) THEN
        i := i || private.pulse_issue('text', 'Sponsor name, campaign title, tagline and button label are required.'); END IF;
      IF NOT private.pulse_image_ok(_r#>>'{artwork,url}') OR NOT private.pulse_text_ok(_r#>>'{artwork,alt}', 140) THEN
        i := i || private.pulse_issue('artworkUrl', 'Artwork with alt text is required.'); END IF;
      IF btrim(coalesce(_r#>>'{disclosure,advertiser}', '')) IS DISTINCT FROM btrim(coalesce(_r->>'sponsorName', '')) THEN
        i := i || private.pulse_issue('disclosure', 'The disclosure must name the sponsor shown.'); END IF;
      _host := private.pulse_https_host(_r->>'destinationUrl',
        ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(_r->'approvedHosts') = 'array' THEN _r->'approvedHosts' ELSE '[]' END)));
      IF _host IS NULL THEN i := i || private.pulse_issue('destinationUrl', 'https, on one of this campaign''s approved hosts.');
      ELSIF NOT _host = ANY (_allow) THEN i := i || private.pulse_issue('destinationUrl', format('%s is not on the sponsor host allowlist.', _host));
      END IF;
      _start := private.pulse_instant(_r#>>'{window,startsAt}');
      _end := private.pulse_instant(_r#>>'{window,endsAt}');
      IF _start IS NULL OR _end IS NULL OR _end <= _start OR _end - _start > interval '92 days' THEN
        i := i || private.pulse_issue('window', 'Flight needs a start and end, at most 92 days apart.');
      ELSIF _end <= _now THEN i := i || private.pulse_issue('window', 'This flight has already ended.');
      END IF;
      IF NOT coalesce(_r#>'{placement,surfaces}' @> '["academy-pulse"]'::jsonb, false) THEN
        i := i || private.pulse_issue('placement', 'Place it on Academy Pulse.'); END IF;
    END IF;

  ELSIF _type = 'creator' THEN
    FOR _k IN SELECT jsonb_object_keys(_r) LOOP
      IF _k NOT IN ('id', 'creatorName', 'creatorTag', 'media', 'activeFrom', 'activeUntil') THEN
        i := i || private.pulse_issue(_k, format('“%s” is not an owner-editable creator field.', _k)); END IF;
    END LOOP;
    IF jsonb_typeof(_m) IS DISTINCT FROM 'object' OR _m->>'platform' NOT IN ('youtube', 'twitch') THEN
      i := i || private.pulse_issue('media', 'Media is a YouTube video or a Twitch channel.');
    ELSE
      FOR _k IN SELECT jsonb_object_keys(_m) LOOP
        IF (_m->>'platform' = 'youtube' AND _k NOT IN ('platform', 'url', 'title', 'durationSeconds', 'thumbnailUrl'))
           OR (_m->>'platform' = 'twitch' AND _k NOT IN ('platform', 'channelUrl', 'title', 'thumbnailUrl', 'artChampion')) THEN
          -- no LIVE state, viewer count or score is ever owner-entered
          i := i || private.pulse_issue('media', format('“%s” is not an owner-editable media field.', _k)); END IF;
      END LOOP;
      IF _m->>'platform' = 'youtube' AND NOT private.pulse_blank(_m->>'url') AND NOT private.pulse_youtube_ok(_m->>'url') THEN
        i := i || private.pulse_issue('mediaUrl', 'Not a YouTube video or Short URL.'); END IF;
      IF _m->>'platform' = 'twitch' AND NOT private.pulse_blank(_m->>'channelUrl') AND NOT private.pulse_twitch_ok(_m->>'channelUrl') THEN
        i := i || private.pulse_issue('mediaUrl', 'Not a Twitch channel URL.'); END IF;
      IF _m ? 'thumbnailUrl' AND NOT private.pulse_image_ok(_m->>'thumbnailUrl') THEN
        i := i || private.pulse_issue('thumbnailUrl', 'Same-origin path or an allowed image host.'); END IF;
      IF _m ? 'durationSeconds' AND (jsonb_typeof(_m->'durationSeconds') <> 'number' OR (_m->>'durationSeconds')::numeric <= 0) THEN
        i := i || private.pulse_issue('durationSeconds', 'Duration is a positive number of seconds.'); END IF;
    END IF;
    IF NOT private.pulse_blank(_r->>'creatorName') AND NOT private.pulse_text_ok(_r->>'creatorName', 40) THEN i := i || private.pulse_issue('creatorName', 'Up to 40 characters.'); END IF;
    IF NOT private.pulse_blank(_r->>'creatorTag') AND NOT private.pulse_text_ok(_r->>'creatorTag', 32) THEN i := i || private.pulse_issue('creatorTag', 'Up to 32 characters.'); END IF;
    IF NOT private.pulse_blank(_m->>'title') AND NOT private.pulse_text_ok(_m->>'title', 100) THEN i := i || private.pulse_issue('mediaTitle', 'Up to 100 characters.'); END IF;
    IF (_r ? 'activeFrom' AND private.pulse_instant(_r->>'activeFrom') IS NULL) OR (_r ? 'activeUntil' AND private.pulse_instant(_r->>'activeUntil') IS NULL) THEN
      i := i || private.pulse_issue('window', 'Feature window needs full dates and times with an offset.'); END IF;

    IF _for_approval THEN
      IF NOT (private.pulse_text_ok(_r->>'creatorName', 40) AND private.pulse_text_ok(_r->>'creatorTag', 32) AND private.pulse_text_ok(_m->>'title', 100)) THEN
        i := i || private.pulse_issue('text', 'Creator name, tag and media title are required.'); END IF;
      IF NOT ((_m->>'platform' = 'youtube' AND private.pulse_youtube_ok(_m->>'url'))
           OR (_m->>'platform' = 'twitch' AND private.pulse_twitch_ok(_m->>'channelUrl'))) THEN
        i := i || private.pulse_issue('mediaUrl', 'Connect a real video or channel.'); END IF;
      IF _r ? 'activeUntil' AND private.pulse_instant(_r->>'activeUntil') <= _now THEN
        i := i || private.pulse_issue('window', 'This feature window has already ended.'); END IF;
      IF _r ? 'activeFrom' AND _r ? 'activeUntil' AND private.pulse_instant(_r->>'activeUntil') <= private.pulse_instant(_r->>'activeFrom') THEN
        i := i || private.pulse_issue('window', 'Feature window is inverted.'); END IF;
    END IF;
  ELSE
    i := i || private.pulse_issue('type', 'Partner records are sponsor or creator.');
  END IF;
  RETURN i;
END;
$$;

CREATE OR REPLACE FUNCTION private.pulse_paid(_type text, _compensation text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT _type = 'sponsor' OR coalesce(_compensation, 'unpaid') <> 'unpaid'
$$;

-- 2C's full record. Owner ids never leave the database: the actor is "owner".
CREATE OR REPLACE FUNCTION private.pulse_partner_record_json(p public.pulse_partner_records)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT p.record || jsonb_build_object(
    'status', p.status,
    'approval', CASE WHEN p.approved_at IS NULL THEN NULL
                     ELSE jsonb_build_object('approvedBy', 'owner', 'approvedAt', to_char(p.approved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) END,
    'provenance', jsonb_build_object('source', 'owner-entry', 'recordedBy', 'owner',
                                     'recordedAt', to_char(p.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
$$;

CREATE OR REPLACE FUNCTION private.pulse_partner_json(p public.pulse_partner_records)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('type', p.type, 'record', private.pulse_partner_record_json(p), 'compensation', p.compensation,
    'revision', p.revision, 'createdAt', p.created_at, 'updatedAt', p.updated_at, 'note', p.note, 'decisionNote', p.decision_note)
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

CREATE OR REPLACE FUNCTION private.pulse_allowlist()
RETURNS text[] LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(array_agg(host ORDER BY host), ARRAY[]::text[]) FROM public.pulse_sponsor_host_allowlist
$$;

REVOKE ALL ON FUNCTION private.pulse_internal_path(text), private.pulse_blank(text), private.pulse_issue(text, text),
  private.pulse_raise_invalid(jsonb), private.pulse_payload_issues(text, text, jsonb, boolean),
  private.pulse_item_json(public.pulse_content_items), private.pulse_instant(text), private.pulse_text_ok(text, integer),
  private.pulse_https_host(text, text[]), private.pulse_image_ok(text), private.pulse_youtube_ok(text), private.pulse_twitch_ok(text),
  private.pulse_partner_issues(text, jsonb, boolean, text[], timestamptz), private.pulse_paid(text, text),
  private.pulse_partner_record_json(public.pulse_partner_records), private.pulse_partner_json(public.pulse_partner_records),
  private.pulse_category_json(public.pulse_category_settings), private.pulse_schedule_json(public.pulse_schedule_settings),
  private.pulse_allowlist()
  FROM PUBLIC, anon, authenticated;

-- --- owner RPCs: workspace ---------------------------------------------------

CREATE OR REPLACE FUNCTION public.pulse_admin_snapshot()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_owner('trusted');
  RETURN jsonb_build_object(
    'contractVersion', 'pulse-admin/2',
    'items', coalesce((SELECT jsonb_agg(private.pulse_item_json(r) ORDER BY r.category, r.priority, r.created_at) FROM public.pulse_content_items r), '[]'::jsonb),
    'categories', coalesce((SELECT jsonb_agg(private.pulse_category_json(s) ORDER BY s.category) FROM public.pulse_category_settings s), '[]'::jsonb),
    'schedule', (SELECT private.pulse_schedule_json(s) FROM public.pulse_schedule_settings s WHERE s.singleton),
    'partners', coalesce((SELECT jsonb_agg(private.pulse_partner_json(p) ORDER BY p.type, p.created_at) FROM public.pulse_partner_records p), '[]'::jsonb),
    'sponsorHostAllowlist', to_jsonb(private.pulse_allowlist()),
    'gates', (SELECT jsonb_build_object('sponsorDisclosureRendered', g.sponsor_disclosure_rendered,
                                        'paidCreatorDisclosureRendered', g.paid_creator_disclosure_rendered)
                FROM private.pulse_release_gates g WHERE g.singleton),
    'serverNow', now());
END;
$$;

-- --- owner RPCs: editorial ----------------------------------------------------

CREATE OR REPLACE FUNCTION public.pulse_admin_save_item(_item jsonb, _expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id uuid := nullif(_item->>'id', '')::uuid;
  _p jsonb := _item->'payload';
  _kind text := _item#>>'{payload,kind}';
  _category text := _item#>>'{payload,category}';
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
    INSERT INTO public.pulse_content_items (id, label, kind, category, payload, publish_at, expires_at, priority, featured, note, updated_by)
    VALUES (_id, btrim(_item->>'label'), _kind, _category,
            _p || jsonb_build_object('id', _id, 'provenance', 'live'), _publish_at, _expires_at,
            coalesce((_item->>'priority')::integer, 100), coalesce((_item->>'featured')::boolean, false),
            coalesce(_item->>'note', ''), auth.uid())
    RETURNING * INTO r;
  ELSE
    SELECT * INTO r FROM public.pulse_content_items WHERE id = _id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'pulse_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF r.revision IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION 'pulse_conflict' USING ERRCODE = 'serialization_failure'; END IF;
    IF r.kind <> _kind THEN PERFORM private.pulse_raise_invalid(private.pulse_issue('kind', 'Kind cannot change.')); END IF;
    -- Editing published content must keep it publishable.
    IF r.state = 'published' THEN
      _issues := private.pulse_payload_issues(_kind, _category, _p, true);
      IF _issues <> '[]'::jsonb THEN PERFORM private.pulse_raise_invalid(_issues); END IF;
    END IF;
    UPDATE public.pulse_content_items SET
      label = btrim(_item->>'label'), category = _category, payload = _p || jsonb_build_object('id', _id, 'provenance', 'live'),
      publish_at = CASE WHEN r.state = 'published' THEN r.publish_at ELSE _publish_at END, expires_at = _expires_at,
      priority = coalesce((_item->>'priority')::integer, r.priority), featured = coalesce((_item->>'featured')::boolean, r.featured),
      note = coalesce(_item->>'note', ''), revision = r.revision + 1, updated_at = now(), updated_by = auth.uid()
    WHERE id = _id RETURNING * INTO r;
  END IF;
  PERFORM public.log_owner_action('pulse.save_item', NULL, 'ok', jsonb_build_object('id', r.id, 'revision', r.revision));
  RETURN private.pulse_item_json(r);
END;
$$;

-- Editorial and event publication: trusted owner (no paid promotion involved).
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
  IF NOT coalesce(_allowed, false) THEN
    PERFORM private.pulse_raise_invalid(private.pulse_issue('state', format('Cannot %s content that is %s.', _action, r.state)));
  END IF;

  IF _action IN ('publish', 'schedule') THEN
    IF _action = 'schedule' AND (_publish_at IS NULL OR _publish_at <= now()) THEN
      PERFORM private.pulse_raise_invalid(private.pulse_issue('publishAt', 'Schedule for a time in the future.'));
    END IF;
    _issues := private.pulse_payload_issues(r.kind, r.category, r.payload, true);
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

-- --- owner RPCs: partner records (PULSE-2C shape) ----------------------------

CREATE OR REPLACE FUNCTION public.pulse_admin_save_partner(
  _type text, _record jsonb, _compensation text, _note text, _expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id text := _record->>'id';
  p public.pulse_partner_records;
  _issues jsonb;
  _exposed boolean;
BEGIN
  PERFORM public.assert_owner('trusted');
  _issues := private.pulse_partner_issues(_type, _record, false, private.pulse_allowlist(), now());
  IF _issues <> '[]'::jsonb THEN PERFORM private.pulse_raise_invalid(_issues); END IF;

  SELECT * INTO p FROM public.pulse_partner_records WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    IF _expected_revision IS NOT NULL THEN RAISE EXCEPTION 'pulse_conflict' USING ERRCODE = 'serialization_failure'; END IF;
    BEGIN
      INSERT INTO public.pulse_partner_records (id, type, record, compensation, note, recorded_by)
      VALUES (_id, _type, _record, CASE WHEN _type = 'creator' THEN coalesce(_compensation, 'unpaid') END, coalesce(_note, ''), auth.uid())
      RETURNING * INTO p;
    EXCEPTION WHEN check_violation THEN
      PERFORM private.pulse_raise_invalid(private.pulse_issue('compensation', 'Compensation is unpaid, paid or affiliate (creators only).'));
    END;
    PERFORM public.log_owner_action('pulse.partner_create', NULL, 'ok', jsonb_build_object('id', p.id, 'type', p.type));
    RETURN private.pulse_partner_json(p);
  END IF;

  IF _expected_revision IS NULL THEN PERFORM private.pulse_raise_invalid(private.pulse_issue('id', 'That id is already used by another partner record.')); END IF;
  IF p.revision IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION 'pulse_conflict' USING ERRCODE = 'serialization_failure'; END IF;
  IF p.type <> _type THEN PERFORM private.pulse_raise_invalid(private.pulse_issue('type', 'A partner record''s type cannot change.')); END IF;

  -- Editing paid promotion that is (or was just) public is approval-sensitive: fresh MFA.
  _exposed := p.status IN ('approved', 'paused');
  IF _exposed AND (private.pulse_paid(p.type, p.compensation) OR private.pulse_paid(_type, _compensation)) THEN
    PERFORM public.assert_owner('fresh_aal2');
  END IF;

  BEGIN
    UPDATE public.pulse_partner_records SET
      record = _record,
      compensation = CASE WHEN _type = 'creator' THEN coalesce(_compensation, p.compensation) END,
      note = coalesce(_note, ''),
      -- any edit to approved / paused content goes back for review (leaves the Home Hub)
      status = CASE WHEN _exposed THEN 'pending-review' ELSE p.status END,
      approved_at = CASE WHEN _exposed THEN NULL ELSE p.approved_at END,
      approved_by = CASE WHEN _exposed THEN NULL ELSE p.approved_by END,
      revision = p.revision + 1, updated_at = now()
    WHERE id = _id RETURNING * INTO p;
  EXCEPTION WHEN check_violation THEN
    PERFORM private.pulse_raise_invalid(private.pulse_issue('compensation', 'Compensation is unpaid, paid or affiliate (creators only).'));
  END;
  PERFORM public.log_owner_action('pulse.partner_save', NULL, 'ok',
    jsonb_build_object('id', p.id, 'type', p.type, 'revision', p.revision, 'returnedToReview', _exposed));
  RETURN private.pulse_partner_json(p);
END;
$$;

CREATE OR REPLACE FUNCTION public.pulse_admin_transition_partner(_id text, _action text, _note text, _expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.pulse_partner_records;
  _to text;
  _issues jsonb;
BEGIN
  PERFORM public.assert_owner('trusted');
  SELECT * INTO p FROM public.pulse_partner_records WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pulse_not_found' USING ERRCODE = 'no_data_found'; END IF;
  IF p.revision IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION 'pulse_conflict' USING ERRCODE = 'serialization_failure'; END IF;

  -- Same table as contract.ts PARTNER_TRANSITIONS.
  _to := CASE
    WHEN _action = 'submit'  AND p.status = 'draft' THEN 'pending-review'
    WHEN _action = 'approve' AND p.status = 'pending-review' THEN 'approved'
    WHEN _action = 'reject'  AND p.status = 'pending-review' THEN 'rejected'
    WHEN _action = 'pause'   AND p.status = 'approved' THEN 'paused'
    WHEN _action = 'resume'  AND p.status = 'paused' THEN 'approved'
    WHEN _action = 'end'     AND p.status IN ('approved', 'paused') THEN 'ended'
    WHEN _action = 'revise'  AND p.status IN ('rejected', 'ended') THEN 'draft'
    END;
  IF _to IS NULL THEN
    PERFORM private.pulse_raise_invalid(private.pulse_issue('status', format('Cannot %s a record that is %s.', _action, p.status)));
  END IF;

  -- Making paid promotion public (sponsor, or a paid/affiliate creator): fresh MFA.
  IF _action IN ('approve', 'resume') AND private.pulse_paid(p.type, p.compensation) THEN
    PERFORM public.assert_owner('fresh_aal2');
  END IF;
  IF _action IN ('reject', 'pause', 'end') AND private.pulse_blank(_note) THEN
    PERFORM private.pulse_raise_invalid(private.pulse_issue('note', 'Record why.'));
  END IF;
  IF _action IN ('submit', 'approve', 'resume') THEN
    _issues := private.pulse_partner_issues(p.type, p.record, true, private.pulse_allowlist(), now());
    IF _issues <> '[]'::jsonb THEN PERFORM private.pulse_raise_invalid(_issues); END IF;
  END IF;

  UPDATE public.pulse_partner_records SET
    status = _to,
    approved_at = CASE WHEN _to = 'approved' THEN now() WHEN _to = 'paused' THEN p.approved_at END,
    approved_by = CASE WHEN _to = 'approved' THEN auth.uid() WHEN _to = 'paused' THEN p.approved_by END,
    decision_note = CASE WHEN private.pulse_blank(_note) THEN p.decision_note ELSE left(btrim(_note), 500) END,
    revision = p.revision + 1, updated_at = now()
  WHERE id = _id RETURNING * INTO p;
  PERFORM public.log_owner_action('pulse.partner_' || _action, NULL, 'ok', jsonb_build_object('id', p.id, 'type', p.type, 'status', p.status));
  RETURN private.pulse_partner_json(p);
END;
$$;

-- Adding a host widens where sponsor links may go: fresh MFA. Removing only narrows: trusted.
CREATE OR REPLACE FUNCTION public.pulse_admin_set_sponsor_host(_host text, _op text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _h text := lower(btrim(coalesce(_host, '')));
BEGIN
  PERFORM public.assert_owner('trusted');
  IF _op NOT IN ('add', 'remove') THEN PERFORM private.pulse_raise_invalid(private.pulse_issue('op', 'add or remove.')); END IF;
  IF _op = 'add' THEN
    PERFORM public.assert_owner('fresh_aal2');
    BEGIN
      INSERT INTO public.pulse_sponsor_host_allowlist (host, added_by) VALUES (_h, auth.uid()) ON CONFLICT (host) DO NOTHING;
    EXCEPTION WHEN check_violation THEN
      PERFORM private.pulse_raise_invalid(private.pulse_issue('host', 'Not a hostname.'));
    END;
  ELSE
    DELETE FROM public.pulse_sponsor_host_allowlist WHERE host = _h;
  END IF;
  PERFORM public.log_owner_action('pulse.sponsor_host_' || _op, NULL, 'ok', jsonb_build_object('host', _h));
  RETURN to_jsonb(private.pulse_allowlist());
END;
$$;

-- --- owner RPCs: emergency disable -------------------------------------------
-- Disable: trusted (never blocked behind MFA in an incident), no revision
-- check (it must win), reason required. Anything that RE-EXPOSES content —
-- restoring, or narrowing managed → partners — needs a fresh MFA.
CREATE OR REPLACE FUNCTION public.pulse_admin_set_kill(_active boolean, _scope text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s public.pulse_schedule_settings;
  _reexposes boolean;
BEGIN
  PERFORM public.assert_owner('trusted');
  IF _active IS NULL OR _scope IS NULL OR _scope NOT IN ('partners', 'managed') THEN
    PERFORM private.pulse_raise_invalid(private.pulse_issue('scope', 'Unknown scope.'));
  END IF;
  IF _active AND private.pulse_blank(_reason) THEN PERFORM private.pulse_raise_invalid(private.pulse_issue('reason', 'Record why.')); END IF;
  SELECT * INTO s FROM public.pulse_schedule_settings WHERE singleton FOR UPDATE;
  _reexposes := s.kill_active AND (NOT _active OR (s.kill_scope = 'managed' AND _scope = 'partners'));
  IF _reexposes THEN PERFORM public.assert_owner('fresh_aal2'); END IF;
  UPDATE public.pulse_schedule_settings SET kill_active = _active, kill_scope = _scope,
    kill_reason = CASE WHEN _active THEN left(btrim(_reason), 300) ELSE left(btrim(coalesce(_reason, '')), 300) END,
    kill_changed_at = now(), revision = revision + 1, updated_at = now()
  WHERE singleton RETURNING * INTO s;
  PERFORM public.log_owner_action(CASE WHEN _reexposes THEN 'pulse.kill_restore' WHEN _active THEN 'pulse.kill_on' ELSE 'pulse.kill_off' END,
    NULL, 'ok', jsonb_build_object('scope', _scope, 'active', _active, 'reason', s.kill_reason));
  RETURN private.pulse_schedule_json(s);
END;
$$;

-- --- the ONLY public read ----------------------------------------------------
-- "pulse-public/2", consumed by the PULSE-2A provider:
--   items     eligible editorial PulseItems, rotation order
--   partners  approved, in-window partner records in PULSE-2C's exact shape
--             (feed to adaptPartnerContent); release-gated
--   cadence   effective slots (empty = consumer keeps DEFAULT_PULSE_CADENCE)
-- No drafts, notes, labels, compensation, owner ids or excluded content leave the database.
CREATE OR REPLACE FUNCTION public.pulse_public_catalogue()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s public.pulse_schedule_settings;
  g private.pulse_release_gates;
  _now timestamptz := now();
  _allow text[] := private.pulse_allowlist();
  _items jsonb := '[]'::jsonb;
  _sponsors jsonb := '[]'::jsonb;
  _creators jsonb := '[]'::jsonb;
  _slots jsonb;
BEGIN
  SELECT * INTO s FROM public.pulse_schedule_settings WHERE singleton;
  SELECT * INTO g FROM private.pulse_release_gates WHERE singleton;

  IF NOT (s.kill_active AND s.kill_scope = 'managed') THEN
    SELECT coalesce(jsonb_agg(r.payload || jsonb_build_object('id', r.id, 'provenance', 'live')
             ORDER BY r.category, r.featured DESC, r.priority, r.published_at DESC NULLS LAST, r.id), '[]'::jsonb)
      INTO _items
      FROM public.pulse_content_items r
      JOIN public.pulse_category_settings cs ON cs.category = r.category
     WHERE r.state = 'published'
       AND (r.publish_at IS NULL OR r.publish_at <= _now)
       AND (r.expires_at IS NULL OR r.expires_at > _now)
       AND cs.enabled AND coalesce(cs.max_per_cycle, 1) > 0 AND (cs.expires_at IS NULL OR cs.expires_at > _now)
       AND private.pulse_payload_issues(r.kind, r.category, r.payload, true) = '[]'::jsonb;
  END IF;

  IF NOT s.kill_active THEN
    SELECT coalesce(jsonb_agg(private.pulse_partner_record_json(p) ORDER BY p.approved_at, p.id) FILTER (WHERE p.type = 'sponsor'), '[]'::jsonb),
           coalesce(jsonb_agg(private.pulse_partner_record_json(p) ORDER BY p.approved_at, p.id) FILTER (WHERE p.type = 'creator'), '[]'::jsonb)
      INTO _sponsors, _creators
      FROM public.pulse_partner_records p
      JOIN public.pulse_category_settings cs ON cs.category = CASE p.type WHEN 'sponsor' THEN 'sponsor' ELSE 'creator-spotlight' END
     WHERE p.status = 'approved' AND p.approved_at IS NOT NULL AND p.approved_at <= _now
       AND cs.enabled AND coalesce(cs.max_per_cycle, 1) > 0 AND (cs.expires_at IS NULL OR cs.expires_at > _now)
       -- release gates: disclosure must be renderable before paid promotion is public
       AND (p.type <> 'sponsor' OR g.sponsor_disclosure_rendered)
       AND (p.type <> 'creator' OR NOT private.pulse_paid(p.type, p.compensation) OR g.paid_creator_disclosure_rendered)
       -- inside the flight / feature window (start inclusive, end exclusive)
       AND CASE WHEN p.type = 'sponsor'
                THEN private.pulse_instant(p.record#>>'{window,startsAt}') <= _now AND _now < private.pulse_instant(p.record#>>'{window,endsAt}')
                ELSE coalesce(private.pulse_instant(p.record->>'activeFrom') <= _now, NOT p.record ? 'activeFrom')
                 AND coalesce(_now < private.pulse_instant(p.record->>'activeUntil'), NOT p.record ? 'activeUntil') END
       -- 2C's rules + the host allowlist, re-checked at read time
       AND private.pulse_partner_issues(p.type, p.record, true, _allow, _now) = '[]'::jsonb;
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
    'contractVersion', 'pulse-public/2',
    'generatedAt', _now,
    'fallbackToStatic', s.kill_active AND s.kill_scope = 'managed',
    'cadence', jsonb_build_object('slots', _slots, 'maxPromotionsPerCycle', s.max_promotions, 'minPromotionGap', s.min_gap),
    'items', _items,
    'partners', jsonb_build_object('creators', _creators, 'sponsors', _sponsors));
END;
$$;

-- --- function privileges -----------------------------------------------------

REVOKE ALL ON FUNCTION public.pulse_admin_snapshot(), public.pulse_admin_save_item(jsonb, integer),
  public.pulse_admin_transition_item(uuid, text, timestamptz, integer),
  public.pulse_admin_save_category(text, boolean, integer, timestamptz, integer),
  public.pulse_admin_save_schedule(text[], integer, integer, integer),
  public.pulse_admin_save_partner(text, jsonb, text, text, integer),
  public.pulse_admin_transition_partner(text, text, text, integer),
  public.pulse_admin_set_sponsor_host(text, text),
  public.pulse_admin_set_kill(boolean, text, text),
  public.pulse_public_catalogue()
  FROM PUBLIC, anon;

-- Signed-in callers may invoke the admin RPCs; assert_owner() refuses everyone but the owner.
GRANT EXECUTE ON FUNCTION public.pulse_admin_snapshot(), public.pulse_admin_save_item(jsonb, integer),
  public.pulse_admin_transition_item(uuid, text, timestamptz, integer),
  public.pulse_admin_save_category(text, boolean, integer, timestamptz, integer),
  public.pulse_admin_save_schedule(text[], integer, integer, integer),
  public.pulse_admin_save_partner(text, jsonb, text, text, integer),
  public.pulse_admin_transition_partner(text, text, text, integer),
  public.pulse_admin_set_sponsor_host(text, text),
  public.pulse_admin_set_kill(boolean, text, text)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.pulse_public_catalogue() TO anon, authenticated;
