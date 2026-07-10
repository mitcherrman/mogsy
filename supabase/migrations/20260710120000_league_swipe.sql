-- League Swipe: opinion + knowledge swipe games for the Mogsy LoL hub.
-- Tables: games catalog, per-matchup aggregate votes, per-user results,
-- per-game entity Elo ratings (opinion games).

create table public.league_swipe_games (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  prompt text not null,
  mode text not null check (mode in ('opinion', 'knowledge')),
  entity_type text not null default 'champion',
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.league_swipe_matchups (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.league_swipe_games(id) on delete cascade,
  -- Canonical pair: entity_a < entity_b so each matchup has exactly one row.
  entity_a text not null,
  entity_b text not null,
  votes_a integer not null default 0,
  votes_b integer not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, entity_a, entity_b),
  check (entity_a < entity_b)
);

create table public.league_swipe_results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.league_swipe_games(id) on delete cascade,
  matchup_id uuid not null references public.league_swipe_matchups(id) on delete cascade,
  user_id uuid,
  selected_entity text not null,
  other_entity text not null,
  correct_entity text,
  is_correct boolean,
  selected_value numeric,
  other_value numeric,
  response_time_ms integer,
  -- Patch/source/stat-key metadata for factual comparisons.
  context jsonb,
  created_at timestamptz not null default now()
);

create index league_swipe_results_game_user_idx
  on public.league_swipe_results (game_id, user_id, created_at desc);

create table public.league_swipe_entity_ratings (
  game_id uuid not null references public.league_swipe_games(id) on delete cascade,
  entity_type text not null default 'champion',
  entity_id text not null,
  rating integer not null default 1000,
  vote_count integer not null default 0,
  win_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (game_id, entity_id)
);

-- RLS: everything is publicly readable except individual results (own rows
-- only). All writes go through the security-definer RPC below.
alter table public.league_swipe_games enable row level security;
alter table public.league_swipe_matchups enable row level security;
alter table public.league_swipe_results enable row level security;
alter table public.league_swipe_entity_ratings enable row level security;

create policy "League swipe games are viewable by everyone"
  on public.league_swipe_games for select using (true);

create policy "League swipe matchups are viewable by everyone"
  on public.league_swipe_matchups for select using (true);

create policy "League swipe ratings are viewable by everyone"
  on public.league_swipe_entity_ratings for select using (true);

create policy "Users can view their own league swipe results"
  on public.league_swipe_results for select using (auth.uid() = user_id);

-- Records one swipe atomically: upserts matchup vote counts, inserts the
-- result row, and (for opinion games) applies a K=32 Elo update to the two
-- entities. Returns the post-vote aggregates for the reveal screen.
create or replace function public.record_league_swipe_result(
  p_game_slug text,
  p_selected text,
  p_other text,
  p_correct_entity text default null,
  p_selected_value numeric default null,
  p_other_value numeric default null,
  p_response_time_ms integer default null,
  p_context jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.league_swipe_games%rowtype;
  v_a text;
  v_b text;
  v_selected_is_a boolean;
  v_matchup public.league_swipe_matchups%rowtype;
  v_is_correct boolean;
  v_winner_rating integer;
  v_loser_rating integer;
  v_expected numeric;
  v_change integer;
  v_new_winner integer;
  v_new_loser integer;
begin
  if p_selected is null or p_other is null or p_selected = p_other then
    raise exception 'invalid matchup entities';
  end if;

  select * into v_game
  from league_swipe_games
  where slug = p_game_slug and is_active;
  if not found then
    raise exception 'unknown league swipe game: %', p_game_slug;
  end if;

  v_a := least(p_selected, p_other);
  v_b := greatest(p_selected, p_other);
  v_selected_is_a := (p_selected = v_a);

  insert into league_swipe_matchups (game_id, entity_a, entity_b, votes_a, votes_b)
  values (
    v_game.id, v_a, v_b,
    case when v_selected_is_a then 1 else 0 end,
    case when v_selected_is_a then 0 else 1 end
  )
  on conflict (game_id, entity_a, entity_b) do update set
    votes_a = league_swipe_matchups.votes_a + (case when v_selected_is_a then 1 else 0 end),
    votes_b = league_swipe_matchups.votes_b + (case when v_selected_is_a then 0 else 1 end)
  returning * into v_matchup;

  if v_game.mode = 'knowledge' and p_correct_entity is not null then
    v_is_correct := (p_selected = p_correct_entity);
  else
    v_is_correct := null;
  end if;

  insert into league_swipe_results (
    game_id, matchup_id, user_id, selected_entity, other_entity,
    correct_entity, is_correct, selected_value, other_value,
    response_time_ms, context
  ) values (
    v_game.id, v_matchup.id, auth.uid(), p_selected, p_other,
    p_correct_entity, v_is_correct, p_selected_value, p_other_value,
    p_response_time_ms, p_context
  );

  v_change := null;
  v_new_winner := null;
  v_new_loser := null;

  if v_game.mode = 'opinion' then
    insert into league_swipe_entity_ratings (game_id, entity_type, entity_id)
    values (v_game.id, v_game.entity_type, p_selected),
           (v_game.id, v_game.entity_type, p_other)
    on conflict (game_id, entity_id) do nothing;

    select rating into v_winner_rating from league_swipe_entity_ratings
      where game_id = v_game.id and entity_id = p_selected for update;
    select rating into v_loser_rating from league_swipe_entity_ratings
      where game_id = v_game.id and entity_id = p_other for update;

    v_expected := 1 / (1 + power(10::numeric, (v_loser_rating - v_winner_rating) / 400.0));
    v_change := greatest(1, round(32 * (1 - v_expected))::integer);
    v_new_winner := v_winner_rating + v_change;
    v_new_loser := v_loser_rating - v_change;

    update league_swipe_entity_ratings set
      rating = v_new_winner,
      vote_count = vote_count + 1,
      win_count = win_count + 1,
      updated_at = now()
    where game_id = v_game.id and entity_id = p_selected;

    update league_swipe_entity_ratings set
      rating = v_new_loser,
      vote_count = vote_count + 1,
      updated_at = now()
    where game_id = v_game.id and entity_id = p_other;
  end if;

  return jsonb_build_object(
    'matchupId', v_matchup.id,
    'entityA', v_matchup.entity_a,
    'entityB', v_matchup.entity_b,
    'votesA', v_matchup.votes_a,
    'votesB', v_matchup.votes_b,
    'totalVotes', v_matchup.votes_a + v_matchup.votes_b,
    'isCorrect', v_is_correct,
    'ratingChange', v_change,
    'selectedRating', v_new_winner,
    'otherRating', v_new_loser
  );
end;
$$;

grant execute on function public.record_league_swipe_result to anon, authenticated;

-- Seed the four MVP games.
insert into public.league_swipe_games (slug, title, prompt, mode, entity_type, description) values
  ('favorite-champion', 'Favorite Champion', 'Which champion do you like more?', 'opinion', 'champion',
   'Choose your favorites and shape the community ranking.'),
  ('most-annoying-champion', 'Most Annoying Champion', 'Who is more annoying to play against?', 'opinion', 'champion',
   'Vote on League''s most tilting champions.'),
  ('higher-base-stat', 'Stat Duel', 'Which champion has the higher base stat?', 'knowledge', 'champion',
   'Guess which champion has the higher stat.'),
  ('item-cost-duel', 'Item Cost Duel', 'Which item costs more gold?', 'knowledge', 'item',
   'Learn item costs through quick comparisons.');
