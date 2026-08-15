-- ============================================================================
-- Meta Reflex (internally League Swipe) — Phase 2B
-- Durable subjective preference state, and a ranking derived from it.
--
-- PROBLEM 1 — unlimited compounding
-- `league_swipe_results` has no unique constraint and the RPC unconditionally
-- INSERTs, so one account can vote the same opinion matchup without limit. Each
-- repeat re-increments the aggregate counters AND re-applies a K=32 Elo update,
-- so a single user can push a champion's rating arbitrarily far.
--
-- PROBLEM 2 — the existing Elo cannot represent a changed vote
-- The owner's requirement is "changed vote → update preference and adjust the
-- ranking consistently". The shipped Elo cannot do that. Concretely, from
-- record_league_swipe_result:
--
--     v_expected := 1 / (1 + power(10, (loser - winner) / 400.0));
--     v_change   := greatest(1, round(32 * (1 - v_expected))::integer);
--
--   (a) PATH DEPENDENT. v_change is a function of both ratings AT THAT MOMENT.
--       Elo is non-commutative: replaying the same set of votes in a different
--       order yields different ratings. "Remove vote X" is therefore not a
--       well-defined operation once any later vote has touched either entity.
--   (b) DELTA STORAGE DOES NOT RESCUE IT. Even if each vote's delta were
--       persisted, subtracting it later leaves every SUBSEQUENT vote's delta
--       wrong, because those were computed from a rating that included X.
--   (c) THE CLAMP IS NOT INVERTIBLE. greatest(1, ...) means a lopsided pair
--       records +1 where the true value rounded to 0. Nothing in the stored
--       state distinguishes a clamped update from a genuine one.
--
-- So this migration stops treating the rating as an accumulator and makes it a
-- PURE FUNCTION of durable vote state, exactly as the brief asked
-- ("prefer deriving ranking from durable vote state if practical").
--
--     rating = round(2000.0 * (win_count + 1) / (vote_count + 2))
--
--   Laplace-smoothed win rate on a 0..2000 scale. It yields exactly 1000 with
--   no data (matching today's default), is order-independent, and is exactly
--   recomputable at any time. Changing a vote is then just: decrement one
--   counter, increment another, recompute. Reversal-safe by construction.
--
-- FRESH START. 20260813120000 has already discarded the Meta Reflex play data
-- (owner-confirmed test data), so there is no historical ladder to preserve and
-- no continuity problem to solve. Every rating from here on is derived.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Durable preference state.
--
-- WHY A NEW TABLE RATHER THAN REUSING league_swipe_results:
-- results is an append-only ATTEMPT LOG — it carries response_time_ms,
-- is_correct, and one row per play, and factual practice depends on being able
-- to append the same pair repeatedly. Putting a uniqueness constraint on it to
-- express "current preference" would break factual replay, which the brief
-- explicitly requires to keep working. Current-state and event-log are
-- different lifetimes; conflating them is what forces the destructive choice.
--
-- This table is small, Meta-Reflex-specific interaction state — exactly the
-- category the brief says Meta Reflex may own — and holds no League facts.
-- ---------------------------------------------------------------------------
create table if not exists public.league_swipe_preferences (
  game_id uuid not null references public.league_swipe_games(id) on delete cascade,
  -- Canonical order, matching league_swipe_matchups, so a pair has one identity.
  entity_a text not null,
  entity_b text not null,
  voter_id uuid not null,
  preferred_entity text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_id, entity_a, entity_b, voter_id),
  constraint league_swipe_preferences_canonical_pair check (entity_a < entity_b),
  constraint league_swipe_preferences_side check (preferred_entity in (entity_a, entity_b))
);

comment on table public.league_swipe_preferences is
  'One row per (opinion matchup, voter): the voter''s CURRENT preference. Revoting updates this row rather than appending, so community ranking cannot be compounded by repeat clicks. voter_id is auth.uid(), which INCLUDES anonymous playtesters: Supabase Anonymous Sign-In issues them a real auth.users row, so they have a stable server-issued uid. Only a caller with no session at all (raw anon role) is identity-less and cannot hold a preference.';

-- ---------------------------------------------------------------------------
-- ANONYMOUS VOTERS ARE INCLUDED. This is the important thing to understand
-- about voter_id, and an earlier draft of this migration got it backwards.
--
-- There are two distinct things both called "anonymous" in Supabase:
--
--   1. The `anon` ROLE — an unauthenticated caller using only the publishable
--      key. auth.uid() is NULL. Has no identity of any kind.
--   2. Anonymous SIGN-IN (supabase.auth.signInAnonymously) — creates a REAL
--      row in auth.users with is_anonymous = true. The caller's role is
--      `authenticated` and auth.uid() returns a stable UUID.
--
-- Mogzy already uses (2) product-wide: src/hooks/useAuth.tsx:85 (policy-gated
-- on the require_auth app_setting), and unconditionally on the Meta Reflex game
-- page itself (src/pages/LeagueSwipeGame.tsx:52), plus Quiz, LolHub and Combat
-- Lab. The client persists that session (persistSession: true, storage:
-- localStorage, autoRefreshToken: true — src/integrations/supabase/client.ts),
-- and src/lib/backend-auth.ts has a single-flight guard specifically so
-- concurrent writes do not mint duplicate throwaway anonymous users.
--
-- So an anonymous playtester DOES have an identity suitable for one-current-
-- preference voting, and it is SERVER-ISSUED (a Supabase-signed JWT) rather
-- than a client-generated value a user could forge. No new identity concept is
-- needed and none is invented here.
--
-- KNOWN LIMIT, stated honestly: an anonymous identity is per-browser-profile.
-- Clearing localStorage, using a private window, or switching device yields a
-- new uid. That bounds ballot-stuffing to "one vote per browser profile"
-- rather than eliminating it. For playtest-scale community sentiment that is
-- the right trade; it is not a defence against a determined attacker.
-- ---------------------------------------------------------------------------

-- Leaderboard/recompute support: "all preferences for this game".
create index if not exists league_swipe_preferences_game_idx
  on public.league_swipe_preferences (game_id, preferred_entity);

alter table public.league_swipe_preferences enable row level security;

-- Aggregates are public (the community split is the product); individual
-- preferences are private to their owner, matching how results are scoped.
create policy "Users can view their own league swipe preferences"
  on public.league_swipe_preferences for select using (auth.uid() = voter_id);

-- No INSERT/UPDATE/DELETE policy: all writes go through the security-definer
-- RPC, exactly as the other four tables already work.

-- ---------------------------------------------------------------------------
-- 2. `rating` changes meaning.
--
-- No legacy_elo_rating column: the owner has confirmed the existing ladder is
-- test data with no product continuity to protect, and 20260813120000 has
-- already truncated league_swipe_entity_ratings. Carrying an unusable value
-- forward would only invite someone to compare two numbers that are not
-- comparable — one an unbounded path-dependent accumulator, the other a bounded
-- ratio.
-- ---------------------------------------------------------------------------
comment on column public.league_swipe_entity_ratings.rating is
  'DERIVED, not accumulated: round(2000.0 * (win_count + 1) / (vote_count + 2)). A pure function of the counters, which are themselves derived from league_swipe_preferences. Order-independent and reversal-safe. Recompute at any time with public.league_swipe_recompute_ratings().';

-- ---------------------------------------------------------------------------
-- 3. The derived rating, as a function so SQL and the RPC cannot disagree.
-- ---------------------------------------------------------------------------
create or replace function public.league_swipe_derived_rating(
  p_win_count integer,
  p_vote_count integer
) returns integer
language sql
immutable
parallel safe
as $$
  -- Laplace smoothing (+1 win / +2 votes) keeps a single 1-0 entity from
  -- outranking a 50-30 entity, and yields exactly 1000 for an unvoted entity.
  select round(2000.0 * (coalesce(p_win_count, 0) + 1)
                      / (coalesce(p_vote_count, 0) + 2))::integer;
$$;

-- ---------------------------------------------------------------------------
-- 4. Full recompute from durable state.
--
-- This is the safety net that an accumulator does not have: if counters ever
-- drift, the truth can be rebuilt from the preference rows. Only opinion games
-- participate — factual play must never move a community ranking.
-- ---------------------------------------------------------------------------
create or replace function public.league_swipe_recompute_ratings(
  p_game_slug text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  with scope as (
    select id from league_swipe_games
     where mode = 'opinion'
       and (p_game_slug is null or slug = p_game_slug)
  ),
  -- Every entity that appears on either side of any preference row, with how
  -- many times it was offered and how many times it was chosen.
  tallies as (
    select p.game_id,
           e.entity_id,
           count(*)::integer as vote_count,
           count(*) filter (where p.preferred_entity = e.entity_id)::integer as win_count
      from league_swipe_preferences p
      join scope s on s.id = p.game_id
      cross join lateral (values (p.entity_a), (p.entity_b)) as e(entity_id)
     group by p.game_id, e.entity_id
  )
  insert into league_swipe_entity_ratings as r
        (game_id, entity_type, entity_id, rating, vote_count, win_count, updated_at)
  select t.game_id,
         coalesce(g.entity_type, 'champion'),
         t.entity_id,
         league_swipe_derived_rating(t.win_count, t.vote_count),
         t.vote_count,
         t.win_count,
         now()
    from tallies t
    join league_swipe_games g on g.id = t.game_id
  on conflict (game_id, entity_id) do update set
        rating = league_swipe_derived_rating(excluded.win_count, excluded.vote_count),
        vote_count = excluded.vote_count,
        win_count = excluded.win_count,
        updated_at = now();

  get diagnostics v_rows = row_count;

  -- Entities with no surviving preference rows fall back to the neutral value
  -- rather than keeping a stale accumulated score.
  --
  -- NOTE: the `scope` CTE above belongs to that single INSERT statement only,
  -- so this statement re-derives the same set inline rather than referencing it.
  update league_swipe_entity_ratings r
     set rating = league_swipe_derived_rating(0, 0),
         vote_count = 0,
         win_count = 0,
         updated_at = now()
   where r.game_id in (
           select id from league_swipe_games
            where mode = 'opinion'
              and (p_game_slug is null or slug = p_game_slug)
         )
     and not exists (
       select 1 from league_swipe_preferences p
        where p.game_id = r.game_id
          and r.entity_id in (p.entity_a, p.entity_b)
     );

  return v_rows;
end;
$$;

-- Functions are granted EXECUTE to PUBLIC by default, and anon/authenticated
-- inherit that through PUBLIC — so revoking only those two roles would leave
-- the grant intact. PUBLIC must be revoked explicitly. This is an operator
-- tool: a full recompute is not something a client may trigger.
revoke all on function public.league_swipe_recompute_ratings(text) from public;
revoke all on function public.league_swipe_recompute_ratings(text) from anon, authenticated;

commit;

-- ============================================================================
-- VALIDATION (read-only — run after applying)
-- ============================================================================
--
-- V1. Ratings table starts empty (the reset ran).
--   select count(*) from league_swipe_entity_ratings;   -- expect 0
--
-- V2. The derived function reproduces the documented anchors.
--   select league_swipe_derived_rating(0, 0)     as no_data_expect_1000,
--          league_swipe_derived_rating(10, 10)   as all_wins_expect_1833,
--          league_swipe_derived_rating(0, 10)    as all_losses_expect_167,
--          league_swipe_derived_rating(5, 10)    as even_expect_1000;
--
-- V3. Preferences start empty (this migration creates no rows).
--   select count(*) from league_swipe_preferences;
--
-- V4. AFTER the Phase 2C RPC is live and has taken traffic — counters must
--     agree with durable state. Any row returned is drift and means the RPC's
--     incremental maintenance has a bug; league_swipe_recompute_ratings() is
--     the repair.
--
--   with tallies as (
--     select p.game_id, e.entity_id,
--            count(*) as vote_count,
--            count(*) filter (where p.preferred_entity = e.entity_id) as win_count
--       from league_swipe_preferences p
--       cross join lateral (values (p.entity_a), (p.entity_b)) as e(entity_id)
--      group by 1, 2
--   )
--   select r.game_id, r.entity_id, r.vote_count, t.vote_count as expected_votes,
--          r.win_count, t.win_count as expected_wins, r.rating,
--          league_swipe_derived_rating(t.win_count::int, t.vote_count::int) as expected_rating
--     from league_swipe_entity_ratings r
--     join tallies t on t.game_id = r.game_id and t.entity_id = r.entity_id
--    where r.vote_count is distinct from t.vote_count
--       or r.win_count  is distinct from t.win_count
--       or r.rating     is distinct from league_swipe_derived_rating(t.win_count::int, t.vote_count::int);
--
-- ROLLBACK
--   drop function if exists public.league_swipe_recompute_ratings(text);
--   drop function if exists public.league_swipe_derived_rating(integer, integer);
--   drop table if exists public.league_swipe_preferences;
--   Safe at any time. The rating column itself is untouched by this migration
--   (only its documented meaning changes), so rolling back the function and
--   table leaves a plain integer column behind.
-- ============================================================================
