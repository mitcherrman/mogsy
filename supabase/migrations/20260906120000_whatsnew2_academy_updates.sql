-- WHATSNEW2 — Academy Updates become admin-managed.
--
-- WHATSNEW1 shipped the /lol Hall's "Academy Updates" surface with its content
-- and its master switch living in source code (`src/lib/lol/academy-updates.ts`).
-- This migration moves both into the database so the owner can write, publish
-- and withdraw an announcement — and turn the whole feature on or off — without
-- a commit or a deploy.
--
-- It reuses the two storage primitives Mogzy already has and adds no third:
--   * the master switch is one more row in the existing public.app_settings
--     key/value store (public SELECT, admin-only writes via the existing
--     has_role policies, audited by the existing stamp_app_settings_audit
--     trigger);
--   * the updates themselves get one table modelled on public.blog_posts —
--     the same published-rows-are-public / admins-manage-everything RLS shape,
--     and the same update_updated_at_column() trigger.
--
-- Nothing about the Hall's presentation changes. This migration is purely a
-- change of authority.

-- ---------------------------------------------------------------------------
-- 1. Master switch
-- ---------------------------------------------------------------------------
--
--   academy_updates_enabled
--     {"enabled": false} -> the Hall renders NOTHING for this feature: no mark,
--                           no panel, no hidden click region, no layout shift.
--     {"enabled": true}  -> the Hall shows the mark, PROVIDED at least one
--                           update is published. Enabled with zero published
--                           updates still renders nothing; an empty "What's
--                           New" is worse than none.
--
-- It defaults to FALSE, which reproduces production exactly: WHATSNEW1 shipped
-- with ACADEMY_UPDATES_ENABLED = false and has never been turned on. Migrating
-- to `true` would activate a feature the owner has not chosen to activate.
--
-- ON CONFLICT DO NOTHING makes a re-run a no-op and, critically, never resets a
-- value the owner has already changed in Admin.

INSERT INTO public.app_settings (key, value) VALUES
  ('academy_updates_enabled', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. The updates themselves
-- ---------------------------------------------------------------------------
--
-- Deliberately small. No slug, no author, no tags, no view counter, no
-- scheduling column: WHATSNEW2's scope is "the owner writes a short notice and
-- decides whether it is visible", and an unread column is a claim the product
-- cannot keep.
--
-- `id` is a uuid generated once at creation and NEVER rewritten. That is not
-- incidental — it is the key each browser stores in localStorage as "the newest
-- notice I have read" (src/lib/lol/academy-updates-seen.ts). Because it is
-- stable across edits, correcting a typo in an old notice does not re-announce
-- it to everyone; only publishing something genuinely new does.
--
-- `published` is a boolean rather than a status enum on purpose: it maps 1:1
-- onto the `published` field WHATSNEW1's pure selectors already read, and it
-- leaves no room for a half-built "scheduled" state.

CREATE TABLE IF NOT EXISTS public.academy_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  -- A calendar date, not an instant: it is written by hand, sorted on, and
  -- displayed as "5 September 2026". A timestamptz would drag a timezone into
  -- a value that has none.
  publish_date date NOT NULL DEFAULT CURRENT_DATE,
  published boolean NOT NULL DEFAULT false,
  -- Optional single call to action. `cta_href` is validated in the client
  -- against the same rule WHATSNEW1 applied (an in-app route starting "/", or
  -- an absolute https:// URL) and re-checked at render, so a row that somehow
  -- carries a bad href is dropped rather than emitted as an anchor.
  cta_label text,
  cta_href text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.academy_updates IS
  'Owner-authored announcements for the /lol Hall''s Academy Updates surface (WHATSNEW2). Canonical: src/lib/lol/academy-updates.ts holds types and selectors only, no update list.';
COMMENT ON COLUMN public.academy_updates.id IS
  'Stable for the life of the row. Browsers store the newest published id as "seen", so rewriting an id re-announces the entry to every visitor.';

-- The public read is "published rows, newest first"; the admin list is "every
-- row, newest first". One index serves both.
CREATE INDEX IF NOT EXISTS idx_academy_updates_published_date
  ON public.academy_updates(published, publish_date DESC, created_at DESC);

ALTER TABLE public.academy_updates ENABLE ROW LEVEL SECURITY;

-- Public read: PUBLISHED ROWS ONLY. This is the whole of the draft guarantee —
-- a draft's title and body never leave Postgres for a non-admin session, so the
-- promise does not depend on the client remembering to filter.
-- Left at the default TO PUBLIC deliberately: this is the one policy that must
-- serve BOTH a signed-out visitor (role anon) and a signed-in one (role
-- authenticated), and it calls no function either of them lacks.
DROP POLICY IF EXISTS "Published academy updates are publicly readable" ON public.academy_updates;
CREATE POLICY "Published academy updates are publicly readable"
  ON public.academy_updates FOR SELECT
  USING (published = true);

-- Admins read everything, drafts included. has_role() already returns true for
-- master_admin (migration 20260223120918), so this one predicate covers both
-- roles and no second gate is needed.
--
-- `TO authenticated` IS LOAD-BEARING, and the reason is not obvious. EXECUTE on
-- public.has_role is granted to `authenticated` but NOT to `anon`. A policy left
-- at the default `TO PUBLIC` lands in the anon role's policy set, so an
-- anonymous request references a function it may not execute and the whole
-- SELECT fails with 42501 -- including the visitor's read of PUBLISHED rows,
-- which has nothing to do with being an admin. Scoping the policy to the only
-- role that could ever satisfy it keeps has_role out of anon's way entirely.
--
-- This is what public.blog_posts does in the live database (its policies are
-- `TO authenticated`, though its migration file does not say so), and it was
-- found by testing anon reads against the real database rather than by reading
-- the SQL. An admin is authenticated by definition, so nothing is lost.
DROP POLICY IF EXISTS "Admins can read all academy updates" ON public.academy_updates;
CREATE POLICY "Admins can read all academy updates"
  ON public.academy_updates FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins create, edit, publish, unpublish and delete. This policy — not the
-- AdminRoute wrapper, not any client-side isAdmin boolean — IS the
-- authorization. An anonymous or ordinary session that calls insert/update/
-- delete directly is refused by Postgres.
DROP POLICY IF EXISTS "Admins can manage academy updates" ON public.academy_updates;
CREATE POLICY "Admins can manage academy updates"
  ON public.academy_updates FOR ALL
  -- `TO authenticated` for the same reason as the policy above: it keeps a
  -- function anon cannot execute out of anon's policy set. It also narrows the
  -- write surface to the only role that could ever pass the check.
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Same updated_at trigger blog_posts uses, so the column cannot drift by a
-- client forgetting to send it.
DROP TRIGGER IF EXISTS trg_academy_updates_updated_at ON public.academy_updates;
CREATE TRIGGER trg_academy_updates_updated_at
  BEFORE UPDATE ON public.academy_updates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. Seed data: NONE, on purpose.
-- ---------------------------------------------------------------------------
--
-- WHATSNEW1's two entries were labelled in their own source comment as
-- "clearly marked examples for development and tests — not production copy".
-- Inserting them here, even as drafts, would put throwaway text one click away
-- from being published. The table therefore starts empty and the switch starts
-- off, which is exactly what production looks like today.
