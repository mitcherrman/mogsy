-- FUNNEL1B1 — the canonical analytics foundation.
--
-- Applied by hand through the Lovable Cloud SQL Editor, like every other
-- migration in this project. See docs/FUNNEL1_HANDOFF.md §5: the reason this
-- migration exists at all is that 20260710130000_funnel_events.sql was
-- committed on 2026-07-10 and never applied, so every trackFunnelEvent() call
-- in production has been a silent no-op for two months. THIS MIGRATION MUST BE
-- APPLIED BEFORE THE FRONTEND SHIPS — the frontend's inserts name three tables
-- that do not exist until it runs, and the emitter's failure contract is
-- deliberately non-fatal, so nothing will break loudly if it is skipped again.
--
--
-- 0. WHY NEW TABLES AND NOT `funnel_events`
--
-- `public.funnel_events` does not exist in production and never has (proven
-- three ways in the audit). There are zero rows to preserve and no read path
-- to keep compatible, so the July shape is not a constraint — it is a draft.
--
-- The name is also wrong for what this store now holds. It holds the
-- acquisition funnel, product telemetry that is not funnel at all
-- (practice_builder_*, trends_*, ad_slot_*), and — from B2 onward — gameplay
-- milestones that Railway proves. Calling that ledger "funnel" would repeat
-- exactly the defect the audit flagged in `lol_landing_viewed`: a name that
-- stopped describing its contents and then quietly misled everyone reading it.
-- `analytics_events` is what it is.
--
-- 20260710130000_funnel_events.sql is neutralized to an inert tombstone in the
-- same commit, so a replay of this folder cannot create the dead table
-- alongside the live one.
--
--
-- 1. THE THREE TABLES, AND WHY NOT ONE, AND WHY NOT SIX
--
--   analytics_events    — the append-only ledger. One row per thing that happened.
--   analytics_visitors  — one row per visitor. FIRST-TOUCH acquisition.
--   analytics_sessions  — one row per session. CURRENT-TOUCH acquisition.
--
-- Attribution is not an event property, it is an identity property, and the
-- two halves have different lifetimes. First touch is written once per visitor
-- and must never change; current touch is written once per session and is
-- SUPPOSED to change when the same person arrives again from a new campaign.
-- Flattening both onto every event row would copy eleven text columns onto
-- every one of them, and — the part that actually matters — would make
-- first-touch immutability a client-side promise instead of a database fact.
--
-- Here it is a database fact. `analytics_visitors` has an INSERT policy and no
-- UPDATE policy and no DELETE policy, for any role short of service_role. A
-- client can introduce a visitor's first touch exactly once; it cannot revise
-- it, and neither can a later visit, a bug, or a hostile caller. The frontend
-- writes it with ON CONFLICT DO NOTHING (PostgREST `resolution=ignore-
-- duplicates`) so the second attempt is a no-op rather than an error.
--
-- Three is where it stops. No event_names dimension table, no channel table,
-- no UTM dictionary. Those normalize values that are already short text and
-- that we specifically want to keep raw (§4).
--
--
-- 2. SOURCE SYSTEM IS THE AUTHORITY BOUNDARY, NOT A LABEL
--
-- A browser-originated event is a statement of intent by an untrusted party.
-- A Railway-originated event is a statement of fact by a system that owns the
-- record. Storing both in one table is right — they answer the same questions
-- — but pretending they carry the same weight is not.
--
-- So `source_system` is constrained, and the RLS INSERT policy pins it to
-- 'web' for anon and authenticated. A browser CANNOT write source_system =
-- 'railway'. Server-authoritative rows arrive over service_role (which
-- bypasses RLS) and are the only rows permitted to claim a non-'web' origin.
-- That is the whole integrity model, and it is one WITH CHECK clause.
--
-- The same clause pins user_id to auth.uid(). A client may write NULL (the
-- landing page fires before an anonymous session exists) or its own uid, and
-- nothing else. visitor_id and session_id are deliberately NOT constrained:
-- they are client-minted by design and unforgeable-ness is not available at
-- any price short of a server round trip per event, which analytics does not
-- justify. They are treated as self-reported throughout.
--
--
-- 3. IDEMPOTENCY FOR AUTHORITATIVE EVENTS
--
-- A retried Ranked-completion notification must not count twice. The rule is a
-- PARTIAL unique index over
--     (source_system, event_name, source_entity_type, source_entity_id)
-- restricted to rows where source_system <> 'web' AND both entity columns are
-- present.
--
-- Partial, because the constraint must not reach web events. A visitor can
-- legitimately open Leaguecraft nine times in a session, and a uniqueness rule
-- that made the ninth impossible would be a data-loss bug wearing a
-- correctness costume. Web rows have source_entity_id IS NULL and fall outside
-- the predicate entirely.
--
-- The emitter picks the entity granularity, and the granularity IS the
-- definition of "the same event". For a ranked match completing, that is the
-- match: ('railway','ranked_completed','ranked_match',<match_id>). For a
-- ranked match STARTING there is one event per player, so the entity is the
-- participant, not the match — ('railway','ranked_started',
-- 'ranked_participant',<participant_id>) — because keying on the match would
-- silently drop four of five players. B2 owns getting each one right; this
-- migration owns making the mistake impossible to persist twice.
--
--
-- 4. WHAT IS STORED RAW ON PURPOSE
--
-- utm_source / medium / campaign / content / term and referrer are stored
-- exactly as they arrived, trimmed and length-capped and nothing else. No
-- channel classification, no host extraction, no TikTok-vs-Shorts-vs-direct
-- bucketing. That grouping is a reporting decision, it will be wrong the first
-- three times, and every version of it is recoverable from raw text by a
-- query. None of the raw text is recoverable from a bucket. Admin can classify
-- in a view later; the ledger stays lossless.

-- ---------------------------------------------------------------------------
-- analytics_visitors — first touch, insert-once, immutable
-- ---------------------------------------------------------------------------

CREATE TABLE public.analytics_visitors (
  visitor_id          uuid PRIMARY KEY,
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  first_landing_path  text,
  first_referrer      text,
  first_utm_source    text,
  first_utm_medium    text,
  first_utm_campaign  text,
  first_utm_content   text,
  first_utm_term      text,

  CONSTRAINT analytics_visitors_landing_path_len CHECK (first_landing_path IS NULL OR length(first_landing_path) <= 512),
  CONSTRAINT analytics_visitors_referrer_len     CHECK (first_referrer IS NULL OR length(first_referrer) <= 1024),
  CONSTRAINT analytics_visitors_utm_len CHECK (
    coalesce(length(first_utm_source), 0)   <= 255 AND
    coalesce(length(first_utm_medium), 0)   <= 255 AND
    coalesce(length(first_utm_campaign), 0) <= 255 AND
    coalesce(length(first_utm_content), 0)  <= 255 AND
    coalesce(length(first_utm_term), 0)     <= 255
  )
);

-- Cohorting ("visitors first seen in week N") is the only query this table is
-- scanned for on its own; every other use is a lookup by primary key.
CREATE INDEX idx_analytics_visitors_first_seen_at
  ON public.analytics_visitors (first_seen_at DESC);

-- ---------------------------------------------------------------------------
-- analytics_sessions — current touch, insert-once
-- ---------------------------------------------------------------------------

CREATE TABLE public.analytics_sessions (
  session_id    uuid PRIMARY KEY,
  visitor_id    uuid NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  landing_path  text,
  referrer      text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,

  CONSTRAINT analytics_sessions_landing_path_len CHECK (landing_path IS NULL OR length(landing_path) <= 512),
  CONSTRAINT analytics_sessions_referrer_len     CHECK (referrer IS NULL OR length(referrer) <= 1024),
  CONSTRAINT analytics_sessions_utm_len CHECK (
    coalesce(length(utm_source), 0)   <= 255 AND
    coalesce(length(utm_medium), 0)   <= 255 AND
    coalesce(length(utm_campaign), 0) <= 255 AND
    coalesce(length(utm_content), 0)  <= 255 AND
    coalesce(length(utm_term), 0)     <= 255
  )
);

-- "Sessions per visitor", "repeat sessions", D1/D7 return: all of them are
-- this index. No FK to analytics_visitors on purpose — the visitor row and the
-- session row are written by two independent fire-and-forget inserts, and an
-- FK would let the first one's failure cascade into losing the second. An
-- orphan session is a recoverable gap; a rejected session is a lost one.
CREATE INDEX idx_analytics_sessions_visitor
  ON public.analytics_sessions (visitor_id, started_at DESC);
CREATE INDEX idx_analytics_sessions_started_at
  ON public.analytics_sessions (started_at DESC);

-- ---------------------------------------------------------------------------
-- analytics_events — the ledger
-- ---------------------------------------------------------------------------

CREATE TABLE public.analytics_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  event_name         text NOT NULL,
  -- Per-event contract version. Bumped when an event's metadata shape changes
  -- meaningfully, so a reader can tell a v1 payload from a v2 one instead of
  -- guessing from the date.
  event_version      smallint NOT NULL DEFAULT 1,

  -- occurred_at is the EMITTER's clock and is therefore not trustworthy: a
  -- browser with a wrong system time, or an event queued through a sleeping
  -- tab, will lie. received_at is the database's clock and is the one every
  -- dashboard should group by. Both are kept because their difference is the
  -- only way to notice the lie.
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  received_at        timestamptz NOT NULL DEFAULT now(),

  route              text,

  visitor_id         uuid,
  session_id         uuid,
  -- Deliberately NOT a foreign key to auth.users. purge-anonymous-users
  -- deletes anon accounts (audit §8), and an FK would either delete the
  -- history with them or block the purge. Analytics keeps the uid as a value.
  user_id            uuid,
  is_guest           boolean,

  source_system      text NOT NULL DEFAULT 'web',
  source_entity_type text,
  source_entity_id   text,

  -- Open text, never an enum. A new verification method must be a one-line
  -- frontend change, not a type migration with a deploy ordering problem.
  verification_type  text,

  metadata           jsonb,

  CONSTRAINT analytics_events_source_system_known
    CHECK (source_system IN ('web', 'railway', 'supabase')),

  -- Keeps the vocabulary to one shape without capping its growth: any new
  -- lower_snake_case name is accepted, arbitrary client junk is not.
  CONSTRAINT analytics_events_event_name_shape
    CHECK (event_name ~ '^[a-z][a-z0-9_]{2,63}$'),

  CONSTRAINT analytics_events_route_len
    CHECK (route IS NULL OR length(route) <= 512),
  CONSTRAINT analytics_events_entity_type_len
    CHECK (source_entity_type IS NULL OR length(source_entity_type) <= 64),
  CONSTRAINT analytics_events_entity_id_len
    CHECK (source_entity_id IS NULL OR length(source_entity_id) <= 128),
  CONSTRAINT analytics_events_verification_type_len
    CHECK (verification_type IS NULL OR length(verification_type) <= 64),

  -- The ledger is public-writable. Without a cap, one caller can write the
  -- table full. 8 KiB is several orders of magnitude more than any event this
  -- contract defines needs.
  CONSTRAINT analytics_events_metadata_size
    CHECK (metadata IS NULL OR length(metadata::text) <= 8192)
);

-- Every dashboard reads "recent first", so every index leads with the column
-- the query filters on and trails with received_at DESC.
CREATE INDEX idx_analytics_events_received_at
  ON public.analytics_events (received_at DESC);
CREATE INDEX idx_analytics_events_name_received_at
  ON public.analytics_events (event_name, received_at DESC);
CREATE INDEX idx_analytics_events_visitor_received_at
  ON public.analytics_events (visitor_id, received_at DESC)
  WHERE visitor_id IS NOT NULL;
CREATE INDEX idx_analytics_events_user_received_at
  ON public.analytics_events (user_id, received_at DESC)
  WHERE user_id IS NOT NULL;
-- Session reconstruction walks one session in order; it does not filter by
-- time, so this one does not trail received_at DESC.
CREATE INDEX idx_analytics_events_session
  ON public.analytics_events (session_id, received_at)
  WHERE session_id IS NOT NULL;

-- §3. The idempotency rule. Partial, so web events are untouched by it.
CREATE UNIQUE INDEX uq_analytics_events_authoritative_entity
  ON public.analytics_events (source_system, event_name, source_entity_type, source_entity_id)
  WHERE source_system <> 'web'
    AND source_entity_type IS NOT NULL
    AND source_entity_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- The shape is the same for all three tables and is the one the audit called
-- for: write-only for the public, read-only for admins, append-only for
-- everyone below service_role.
--
--   INSERT  anon, authenticated   — with the integrity checks described in §2
--   SELECT  admin / master_admin  — nobody else reads analytics, including the
--                                   visitor whose rows they are. There is
--                                   nothing in this store a normal user has a
--                                   reason to read, and a SELECT policy scoped
--                                   to "your own rows" would hand any caller a
--                                   way to confirm whether a visitor_id exists.
--   UPDATE  — no policy, for any role. The ledger is append-only.
--   DELETE  — no policy, for any role. Retention is a service_role job.
--
-- The REVOKEs below are belt-and-braces: RLS with no policy already denies
-- these, but Supabase's default grants hand anon and authenticated the
-- privilege bits, and a future migration that enables a policy by accident
-- should not also find the grant waiting for it.
--
--
-- A CONSEQUENCE OF "NO SELECT POLICY" THAT COSTS AN AFTERNOON TO REDISCOVER
--
-- Granting anon no SELECT makes `INSERT ... ON CONFLICT (col) DO NOTHING`
-- fail. Naming a conflict target makes Postgres read the arbiter index, that
-- read needs SELECT, and the rejection is reported as "new row violates
-- row-level security policy" — on rows that conflict with nothing, which sends
-- the reader hunting through the WITH CHECK clause for a bug that is not
-- there. A TARGETLESS `ON CONFLICT DO NOTHING` is unaffected.
--
-- This is why the frontend writes analytics_visitors and analytics_sessions
-- with a plain INSERT and treats SQLSTATE 23505 as success, rather than with
-- supabase-js `.upsert({ onConflict })`, which renders the targeted form.
-- Both behaviours are pinned in
-- src/test/security/funnel1b1AnalyticsSchema.test.ts. Anyone adding a SELECT
-- policy here should expect that test to change meaning, not just to pass.

ALTER TABLE public.analytics_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events   ENABLE ROW LEVEL SECURITY;

REVOKE UPDATE, DELETE ON public.analytics_visitors FROM anon, authenticated;
REVOKE UPDATE, DELETE ON public.analytics_sessions FROM anon, authenticated;
REVOKE UPDATE, DELETE ON public.analytics_events   FROM anon, authenticated;

-- Visitors ------------------------------------------------------------------

-- Landing events fire before an anonymous Supabase session exists, so `anon`
-- must be able to write here or the top of the funnel stays invisible — which
-- is the single largest gap the audit found.
CREATE POLICY "Anyone can record a visitor first touch"
  ON public.analytics_visitors
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read visitors"
  ON public.analytics_visitors
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.is_master_admin(auth.uid()));

-- Sessions ------------------------------------------------------------------

CREATE POLICY "Anyone can record a session"
  ON public.analytics_sessions
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read sessions"
  ON public.analytics_sessions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.is_master_admin(auth.uid()));

-- Events --------------------------------------------------------------------

CREATE POLICY "Clients can insert their own web events"
  ON public.analytics_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    -- §2: a browser cannot claim to be Railway.
    source_system = 'web'
    -- ...nor claim to be another account. NULL is allowed: the landing page
    -- fires before any session, anonymous or otherwise, exists.
    AND (user_id IS NULL OR user_id = auth.uid())
    -- Server-authority fields are meaningless on a web row and are the only
    -- lever a client would have on the idempotency index, so they are closed.
    AND source_entity_type IS NULL
    AND source_entity_id IS NULL
  );

CREATE POLICY "Admins can read events"
  ON public.analytics_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.is_master_admin(auth.uid()));
