
-- 1) Tighten custom_links exposure
DROP POLICY IF EXISTS "Active custom links readable for resolution" ON public.custom_links;

CREATE OR REPLACE FUNCTION public.resolve_custom_link(_slug text)
RETURNS TABLE (
  id uuid,
  slug text,
  destination_type text,
  league_id uuid,
  recommended_categories text[],
  recommended_league_ids uuid[],
  default_theme text,
  default_swipe_animation text,
  label text,
  visits integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cl.id, cl.slug, cl.destination_type, cl.league_id,
    cl.recommended_categories, cl.recommended_league_ids,
    cl.default_theme, cl.default_swipe_animation,
    cl.label, cl.visits
  FROM public.custom_links cl
  WHERE cl.slug = lower(_slug) AND cl.is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_custom_link(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_custom_link_visits(_slug text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.custom_links
  SET visits = COALESCE(visits, 0) + 1
  WHERE slug = lower(_slug) AND is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.increment_custom_link_visits(text) TO anon, authenticated;

-- 2) Restrict realtime postgres_changes subscriptions to relevant rows
DROP POLICY IF EXISTS "Authenticated can receive realtime broadcasts" ON realtime.messages;
DROP POLICY IF EXISTS "Allow authenticated realtime subscriptions" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can receive realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can read realtime messages" ON realtime.messages;

CREATE POLICY "Realtime postgres_changes scoped to participants"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (extension = 'broadcast')
  OR (extension = 'presence')
  OR (
    extension = 'postgres_changes'
    AND (
      public.realtime_is_game_topic_player(topic)
      OR public.realtime_is_notification_topic_owner(topic)
    )
  )
);
