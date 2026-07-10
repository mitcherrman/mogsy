-- League Swipe stats portal: one read-only aggregate function.
-- league_swipe_results is RLS-restricted to own rows, so global aggregates
-- (accuracy, response times, most-missed) are exposed through this
-- security-definer function instead. No user ids or per-user data leave it.

create or replace function public.get_league_swipe_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
select jsonb_build_object(
  'totals', (
    select jsonb_build_object(
      'swipes', count(*),
      'opinionVotes', count(*) filter (where g.mode = 'opinion'),
      'knowledgeAnswers', count(*) filter (where g.mode = 'knowledge'),
      'correct', count(*) filter (where r.is_correct),
      'incorrect', count(*) filter (where r.is_correct = false),
      'accuracy', round(avg(case when r.is_correct then 1.0 when r.is_correct = false then 0.0 end) * 100, 1),
      'avgResponseMs', round(avg(r.response_time_ms)),
      'uniqueMatchups', (select count(*) from league_swipe_matchups)
    )
    from league_swipe_results r
    join league_swipe_games g on g.id = r.game_id
  ),
  'perGame', (
    select coalesce(jsonb_agg(row order by (row->>'swipes')::int desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'slug', g.slug,
        'title', g.title,
        'mode', g.mode,
        'swipes', count(r.id),
        'accuracy', round(avg(case when r.is_correct then 1.0 when r.is_correct = false then 0.0 end) * 100, 1)
      ) as row
      from league_swipe_games g
      left join league_swipe_results r on r.game_id = g.id
      where g.is_active
      group by g.id
    ) t
  ),
  'mostMissed', (
    select coalesce(jsonb_agg(row), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'game', g.slug,
        'entityA', m.entity_a,
        'entityB', m.entity_b,
        'correct', r.correct_entity,
        'missCount', count(*)
      ) as row
      from league_swipe_results r
      join league_swipe_matchups m on m.id = r.matchup_id
      join league_swipe_games g on g.id = r.game_id
      where r.is_correct = false
      group by g.slug, m.entity_a, m.entity_b, r.correct_entity
      order by count(*) desc
      limit 5
    ) t
  ),
  'mostVoted', (
    select coalesce(jsonb_agg(row), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'game', g.slug, 'gameTitle', g.title,
        'entityA', m.entity_a, 'entityB', m.entity_b,
        'votesA', m.votes_a, 'votesB', m.votes_b,
        'total', m.votes_a + m.votes_b
      ) as row
      from league_swipe_matchups m
      join league_swipe_games g on g.id = m.game_id
      order by m.votes_a + m.votes_b desc
      limit 5
    ) t
  ),
  'closest', (
    select coalesce(jsonb_agg(row), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'game', g.slug, 'gameTitle', g.title,
        'entityA', m.entity_a, 'entityB', m.entity_b,
        'votesA', m.votes_a, 'votesB', m.votes_b,
        'total', m.votes_a + m.votes_b
      ) as row
      from league_swipe_matchups m
      join league_swipe_games g on g.id = m.game_id
      where m.votes_a + m.votes_b >= 5
      order by abs(m.votes_a - m.votes_b)::numeric / (m.votes_a + m.votes_b) asc,
               m.votes_a + m.votes_b desc
      limit 5
    ) t
  ),
  'blowouts', (
    select coalesce(jsonb_agg(row), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'game', g.slug, 'gameTitle', g.title,
        'entityA', m.entity_a, 'entityB', m.entity_b,
        'votesA', m.votes_a, 'votesB', m.votes_b,
        'total', m.votes_a + m.votes_b
      ) as row
      from league_swipe_matchups m
      join league_swipe_games g on g.id = m.game_id
      where m.votes_a + m.votes_b >= 5
      order by greatest(m.votes_a, m.votes_b)::numeric / (m.votes_a + m.votes_b) desc,
               m.votes_a + m.votes_b desc
      limit 5
    ) t
  )
);
$$;

grant execute on function public.get_league_swipe_stats to anon, authenticated;
