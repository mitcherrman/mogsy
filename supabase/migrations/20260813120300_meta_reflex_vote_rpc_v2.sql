-- ============================================================================
-- Meta Reflex (internally League Swipe) — Phase 2C
-- Vote RPC v2: variant-aware, idempotent, revote-safe, and no longer trusting
-- the browser to declare what is true.
--
-- Replaces the behaviour of record_league_swipe_result. Depends on Phase 2A
-- (matchups.variant) and Phase 2B (preferences + derived rating). Apply in
-- order.
--
-- WHAT CHANGES
--   1. Matchup identity now includes the variant, so Stat Duel stats no longer
--      share one aggregate.
--   2. Opinion games write a durable PREFERENCE. Revoting the same way is a
--      no-op; revoting differently moves the vote instead of adding one.
--   3. Ranking is recomputed from counters via league_swipe_derived_rating
--      rather than accumulated with a non-invertible K=32 Elo step.
--   4. Correctness is NO LONGER taken from the client. `is_correct` is written
--      NULL with verdict_source='unverified'; a server-side verifier fills
--      verified_correct later. The client's claim is retained verbatim, but as
--      a claim.
--   5. Retries are idempotent via client_submission_id.
--   6. Anonymous callers can still play and be logged, but cannot move a
--      community ranking.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Result columns for server authority and idempotency.
-- ---------------------------------------------------------------------------
alter table public.league_swipe_results
  add column if not exists variant text not null default '',
  add column if not exists client_claimed_correct boolean,
  add column if not exists verified_correct boolean,
  add column if not exists verdict_source text not null default 'unverified',
  add column if not exists client_submission_id uuid;

comment on column public.league_swipe_results.is_correct is
  'RETAINED FOR SHAPE ONLY — always NULL from v2 onward. The v1 RPC wrote a verdict the browser supplied and trusted verbatim; that is exactly what v2 stops doing. Read verified_correct for truth, and verdict_source for how it was established.';

comment on column public.league_swipe_results.client_claimed_correct is
  'What the browser asserted. Retained for telemetry and for detecting '
  'tampering (client_claimed_correct <> verified_correct). NEVER authoritative.';

comment on column public.league_swipe_results.verified_correct is
  'Server-derived correctness, from canonical Mogzy data. NULL until a verifier '
  'has run. Only a service-role/backend path may set it.';

comment on column public.league_swipe_results.verdict_source is
  'unverified | server. Records HOW verified_correct came to be, so an accuracy query can exclude unjudged rows explicitly. Rows start unverified and are promoted by the backend verifier (factual_duel.verify_choice).';

-- RESPONSE TIME IS CASUAL CLIENT TELEMETRY — deliberately not hardened.
--
-- Audited 2026-08-13: response_time_ms is consumed in exactly two places, both
-- purely descriptive — the "avg response" tile (LeagueSwipeStats.tsx:106) and
-- the per-row time in "your recent answers" (LeagueSwipeStats.tsx:234). It does
-- NOT feed a leaderboard, competitive score, reward, rank, or any persistent
-- skill stat. Entity ranking comes solely from preference rows.
--
-- The client measures it with Date.now() deltas, so a determined user can send
-- anything. Building server-issued timing tokens to defend a display statistic
-- would be disproportionate. What IS worth doing is bounding it, so one absurd
-- value cannot wreck the average for everyone: implausible durations are stored
-- as NULL rather than rejected, since the vote itself is still valid.
--
-- If response time ever becomes competitive (a speed leaderboard, a reward),
-- this stops being adequate and the duration must become server-derived.
comment on column public.league_swipe_results.response_time_ms is
  'CLIENT-REPORTED, display only. Not trustworthy for competitive use. Out-of-range values are stored NULL — see the sanity bound in record_league_swipe_result.';

-- No historical relabelling and no variant backfill: 20260813120000 truncated
-- league_swipe_results, so every row from here on is written by the v2 RPC with
-- a real variant and an honest verdict_source.

-- Idempotency: a retried submit with the same id must not count twice.
-- Partial index so the (very many) legacy NULL rows do not collide.
create unique index if not exists league_swipe_results_submission_idx
  on public.league_swipe_results (client_submission_id)
  where client_submission_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Remove the v1 function.
--
-- REQUIRED, not cosmetic: Postgres identifies a function by name + argument
-- types, so `create or replace` with an extended parameter list would create a
-- SECOND overload rather than replacing v1. Both would then be callable and
-- PostgREST could resolve either — meaning some traffic would keep hitting the
-- old, vulnerable path. Dropping a function removes no data.
-- ---------------------------------------------------------------------------
drop function if exists public.record_league_swipe_result(
  text, text, text, text, numeric, numeric, integer, jsonb
);

-- ---------------------------------------------------------------------------
-- 3. v2.
-- ---------------------------------------------------------------------------
create or replace function public.record_league_swipe_result(
  p_game_slug text,
  p_selected text,
  p_other text,
  p_correct_entity text default null,       -- retained as a CLAIM only
  p_selected_value numeric default null,
  p_other_value numeric default null,
  p_response_time_ms integer default null,
  p_context jsonb default null,
  p_variant text default null,
  p_client_submission_id uuid default null
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
  v_variant text;
  v_matchup public.league_swipe_matchups%rowtype;
  v_voter uuid := auth.uid();
  v_existing text;
  v_delta_a integer := 0;
  v_delta_b integer := 0;
  v_pref_changed boolean := false;
  v_rating_selected integer;
  v_rating_other integer;
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

  -- Idempotency short-circuit. A retried POST (offline queue, double tap,
  -- network retry) must observe the first outcome, not add a second vote.
  if p_client_submission_id is not null
     and exists (select 1 from league_swipe_results
                  where client_submission_id = p_client_submission_id) then
    select * into v_matchup
      from league_swipe_matchups
     where game_id = v_game.id
       and entity_a = least(p_selected, p_other)
       and entity_b = greatest(p_selected, p_other)
       and variant = coalesce(nullif(p_variant, ''), coalesce(p_context->>'stat', ''));
    return jsonb_build_object(
      'matchupId', v_matchup.id,
      'entityA', v_matchup.entity_a,
      'entityB', v_matchup.entity_b,
      'votesA', coalesce(v_matchup.votes_a, 0),
      'votesB', coalesce(v_matchup.votes_b, 0),
      'totalVotes', coalesce(v_matchup.votes_a, 0) + coalesce(v_matchup.votes_b, 0),
      'isCorrect', null,
      'ratingChange', null,
      'selectedRating', null,
      'otherRating', null,
      'duplicate', true
    );
  end if;

  v_a := least(p_selected, p_other);
  v_b := greatest(p_selected, p_other);
  v_selected_is_a := (p_selected = v_a);

  -- Variant resolution. Explicit parameter wins; otherwise fall back to the
  -- context the client has always sent, so an un-updated client still lands in
  -- the right per-stat bucket instead of a shared one.
  v_variant := coalesce(nullif(p_variant, ''), coalesce(p_context->>'stat', ''));

  -- ---- opinion games: durable preference, no compounding --------------------
  if v_game.mode = 'opinion' then
    if v_voter is null then
      -- NOTE: this branch is NOT "anonymous players". Anonymous playtesters
      -- sign in via supabase.auth.signInAnonymously() and DO have a stable
      -- auth.uid(), so they fall through to the preference logic below and
      -- count toward community ranking exactly like registered users.
      --
      -- This branch is only reached by a caller with no session at all — the
      -- raw `anon` role hitting the RPC directly with the publishable key.
      -- Such a caller has no identity, so there is nothing to make the vote
      -- idempotent against and no way to stop it repeating without limit. Its
      -- play is still logged below; it just cannot move a public ranking.
      v_delta_a := 0;
      v_delta_b := 0;
    else
      -- Race-safe upsert. An earlier draft did SELECT ... FOR UPDATE and then
      -- INSERT, which has a real bug: FOR UPDATE locks nothing when the row
      -- does not exist yet, so two concurrent votes from the same voter (two
      -- tabs, a double tap, an offline queue flush) both see NULL, both INSERT,
      -- and the second raises unique_violation — surfacing to the player as a
      -- failed vote. ON CONFLICT makes the write atomic instead.
      --
      -- `prev` is captured BEFORE the upsert so we still know what the voter
      -- previously thought; it is only used for the returned `changed` flag,
      -- never to compute a counter delta (see below).
      with prev as (
        select preferred_entity
          from league_swipe_preferences
         where game_id = v_game.id and entity_a = v_a and entity_b = v_b
           and voter_id = v_voter
      ), up as (
        insert into league_swipe_preferences
              (game_id, entity_a, entity_b, voter_id, preferred_entity)
        values (v_game.id, v_a, v_b, v_voter, p_selected)
        on conflict (game_id, entity_a, entity_b, voter_id) do update
           set preferred_entity = excluded.preferred_entity,
               updated_at = now()
        returning preferred_entity
      )
      select (select preferred_entity from prev) into v_existing from up;

      -- An identical revote is inherently idempotent under the model below:
      -- the counters are RECOMPUTED from preference rows, and re-writing the
      -- same preference changes none of them. No special case is needed.
      v_pref_changed := (v_existing is distinct from p_selected);
    end if;
  else
    -- ---- factual games: every attempt counts toward the community split -----
    -- Practice repeats are legitimate gameplay, so there is no dedupe here.
    -- Crucially this branch never touches preferences or entity ratings.
    v_delta_a := case when v_selected_is_a then 1 else 0 end;
    v_delta_b := case when v_selected_is_a then 0 else 1 end;
  end if;

  -- ---- aggregate row (per pair PER VARIANT) ---------------------------------
  -- Created first so the recompute below always has a row to write into.
  -- Factual games apply their delta here; opinion games insert a placeholder
  -- and have their counters derived immediately afterwards.
  insert into league_swipe_matchups (game_id, entity_a, entity_b, variant, votes_a, votes_b)
  values (v_game.id, v_a, v_b, v_variant, greatest(v_delta_a, 0), greatest(v_delta_b, 0))
  on conflict (game_id, entity_a, entity_b, variant) do update set
    votes_a = greatest(0, league_swipe_matchups.votes_a + v_delta_a),
    votes_b = greatest(0, league_swipe_matchups.votes_b + v_delta_b)
  returning * into v_matchup;

  -- ---- opinion counters are DERIVED, never incremented ----------------------
  -- Deltas cannot be made correct under concurrency: two transactions can each
  -- read "no previous preference", each conclude "+1", and both apply it —
  -- double-counting one voter. Recomputing from the preference rows removes
  -- that entire class of bug, is self-healing if a counter ever drifts, and
  -- makes an identical revote a no-op for free. It matches how the rating is
  -- derived, so the two can never disagree.
  if v_game.mode = 'opinion' and v_voter is not null then
    update league_swipe_matchups m
       set votes_a = t.a, votes_b = t.b
      from (
        select count(*) filter (where p.preferred_entity = v_a)::integer as a,
               count(*) filter (where p.preferred_entity = v_b)::integer as b
          from league_swipe_preferences p
         where p.game_id = v_game.id and p.entity_a = v_a and p.entity_b = v_b
      ) t
     where m.id = v_matchup.id
    returning * into v_matchup;
  end if;

  -- ---- attempt log ----------------------------------------------------------
  -- is_correct is deliberately NULL: the server cannot verify a League fact
  -- from inside Postgres (the canonical item/champion data lives in the backend
  -- SQLite, not here), and the browser's claim is not evidence. A backend
  -- verifier fills verified_correct.
  insert into league_swipe_results (
    game_id, matchup_id, user_id, selected_entity, other_entity,
    correct_entity, is_correct, client_claimed_correct, verdict_source,
    selected_value, other_value, response_time_ms, context, variant,
    client_submission_id
  ) values (
    v_game.id, v_matchup.id, v_voter, p_selected, p_other,
    p_correct_entity,
    null,
    case when v_game.mode = 'knowledge' and p_correct_entity is not null
         then (p_selected = p_correct_entity) else null end,
    'unverified',
    p_selected_value, p_other_value,
    -- Sanity bound, not anti-cheat: under 100 ms is faster than a human can
    -- read two cards, over 10 minutes means the tab was left open. Both are
    -- stored as NULL so one bogus number cannot distort the average, while the
    -- vote itself still counts.
    case when p_response_time_ms between 100 and 600000
         then p_response_time_ms else null end,
    p_context, v_variant,
    p_client_submission_id
  );

  -- ---- derived ranking ------------------------------------------------------
  if v_game.mode = 'opinion' and v_pref_changed and v_voter is not null then
    insert into league_swipe_entity_ratings (game_id, entity_type, entity_id)
    values (v_game.id, v_game.entity_type, v_a),
           (v_game.id, v_game.entity_type, v_b)
    on conflict (game_id, entity_id) do nothing;

    -- Canonical (a, b) lock order so opposite-direction concurrent votes on the
    -- same pair cannot deadlock. This ordering was already load-bearing in v1.
    perform 1 from league_swipe_entity_ratings
      where game_id = v_game.id and entity_id = v_a for update;
    perform 1 from league_swipe_entity_ratings
      where game_id = v_game.id and entity_id = v_b for update;

    -- Recompute both sides from durable preference state. Not an increment:
    -- this is what makes a changed vote representable at all.
    update league_swipe_entity_ratings r
       set vote_count = t.vote_count,
           win_count = t.win_count,
           rating = league_swipe_derived_rating(t.win_count, t.vote_count),
           updated_at = now()
      from (
        select e.entity_id,
               count(*)::integer as vote_count,
               count(*) filter (where p.preferred_entity = e.entity_id)::integer as win_count
          from league_swipe_preferences p
          cross join lateral (values (p.entity_a), (p.entity_b)) as e(entity_id)
         where p.game_id = v_game.id
           and e.entity_id in (v_a, v_b)
         group by e.entity_id
      ) t
     where r.game_id = v_game.id and r.entity_id = t.entity_id;

    select rating into v_rating_selected from league_swipe_entity_ratings
      where game_id = v_game.id and entity_id = p_selected;
    select rating into v_rating_other from league_swipe_entity_ratings
      where game_id = v_game.id and entity_id = p_other;
  end if;

  return jsonb_build_object(
    'matchupId', v_matchup.id,
    'entityA', v_matchup.entity_a,
    'entityB', v_matchup.entity_b,
    'variant', v_matchup.variant,
    'votesA', v_matchup.votes_a,
    'votesB', v_matchup.votes_b,
    'totalVotes', v_matchup.votes_a + v_matchup.votes_b,
    -- Deliberately null: the browser must not receive a server-blessed verdict
    -- it did not earn. The client renders its own local comparison for the
    -- reveal; persisted truth arrives via the backend verifier.
    'isCorrect', null,
    'ratingChange', null,
    'selectedRating', v_rating_selected,
    'otherRating', v_rating_other,
    'duplicate', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Privilege hygiene.
--
-- Supabase ships `alter default privileges ... grant all on tables to anon,
-- authenticated`, so these five tables were created with the full DML grant
-- set. RLS masks SELECT/INSERT/UPDATE/DELETE, but the grants themselves are
-- broader than intended and none of the original migrations narrowed them.
-- Writes must only ever happen through the definer RPC above.
-- ---------------------------------------------------------------------------
revoke all on public.league_swipe_games from anon, authenticated;
revoke all on public.league_swipe_matchups from anon, authenticated;
revoke all on public.league_swipe_results from anon, authenticated;
revoke all on public.league_swipe_entity_ratings from anon, authenticated;
revoke all on public.league_swipe_preferences from anon, authenticated;

-- Re-grant exactly what the RLS policies are written to allow, and nothing more.
grant select on public.league_swipe_games to anon, authenticated;
grant select on public.league_swipe_matchups to anon, authenticated;
grant select on public.league_swipe_entity_ratings to anon, authenticated;
grant select on public.league_swipe_results to authenticated;      -- own rows, per RLS
grant select on public.league_swipe_preferences to authenticated;  -- own rows, per RLS

grant execute on function public.record_league_swipe_result(
  text, text, text, text, numeric, numeric, integer, jsonb, text, uuid
) to anon, authenticated;

commit;

-- ============================================================================
-- VALIDATION (read-only — run after applying)
-- ============================================================================
--
-- V1. Exactly ONE record_league_swipe_result overload exists (expect 1 row).
--     More than one means the v1 drop did not match and old traffic can still
--     reach the vulnerable path.
--   select p.oid::regprocedure as signature
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'record_league_swipe_result';
--
-- V2. No row ever carries a trusted client verdict.
--   select verdict_source, count(*), count(is_correct) as non_null_is_correct
--     from league_swipe_results group by 1;
--     -- expect only 'unverified' (and later 'server'), with is_correct all NULL
--
-- V3. Results table starts empty and fills only through v2.
--   select count(*) from league_swipe_results;   -- expect 0 before any play
--
-- V4. Table privileges are narrowed (expect NO insert/update/delete rows).
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public' and table_name like 'league_swipe%'
--      and grantee in ('anon','authenticated')
--      and privilege_type <> 'SELECT'
--    order by 1, 2;
--
-- V5. Counters never negative (the greatest(0, ...) guard holds).
--   select count(*) from league_swipe_matchups where votes_a < 0 or votes_b < 0;
--
-- ============================================================================
-- ADVERSARIAL REVIEW — issues found in this file and fixed before submission
--
--   R1. CONCURRENCY BUG (fixed). The first draft did
--       `SELECT ... FOR UPDATE` then `INSERT` on league_swipe_preferences.
--       FOR UPDATE locks nothing when the row does not exist, so two
--       simultaneous votes from one voter both saw NULL, both inserted, and the
--       second died on unique_violation — a failed vote for the player. Now a
--       single ON CONFLICT upsert.
--   R2. DOUBLE-COUNT UNDER CONCURRENCY (fixed). Even with R1 fixed, computing
--       vote counters from ±1 deltas is unsound: two transactions can each read
--       "no previous preference", each conclude "+1", and both apply it.
--       Opinion counters are now DERIVED from the preference rows instead of
--       incremented, which removes the class of bug and is self-healing.
--   R3. CONSTRAINT DROPPED BY NAME (fixed in 2A). `drop constraint if exists`
--       with a guessed auto-generated name fails SILENTLY, which would have
--       left the old 3-column unique constraint rejecting every per-variant
--       row. Now dropped by matching its column list.
--   R4. FUNCTION GRANTS (fixed in 2B). Revoking EXECUTE from anon/authenticated
--       alone leaves the default PUBLIC grant intact. PUBLIC is now revoked.
--
-- KNOWN AND ACCEPTED
--   * An identical revote still appends a row to league_swipe_results. That is
--     intentional — results is an attempt log, and the play did happen. It
--     moves no counter and no ranking.
--   * A caller with no session at all (raw anon role) can still repeat votes
--     into the attempt log. It cannot move any counter or ranking.
--   * An opinion vote from a session-less caller may create a matchup row with
--     0/0 counters. Harmless.
--
-- CANNOT BE PROVEN WITHOUT EXECUTION — please review these by eye
--   * plpgsql compiles only at first CALL, not at CREATE. Syntax/typos inside
--     the body will not surface until the function is invoked. THIS IS THE
--     BIGGEST RESIDUAL RISK in the whole change set.
--   * The ON CONFLICT target must match the Phase 2A constraint exactly
--     (game_id, entity_a, entity_b, variant) or the insert raises at runtime.
--   * The `with prev as (...), up as (insert ... returning ...) select ... from up`
--     construct: `prev` is evaluated in the same snapshot as the upsert, which
--     is what makes it the PRE-write value. Verify by eye.
--   * `cross join lateral (values (p.entity_a), (p.entity_b))` is used in both
--     2B and 2C; standard Postgres, untested here.
--   * `returning * into v_matchup` on the derived-counter UPDATE assumes the
--     row exists — guaranteed by the INSERT immediately above it.
--   * REVOKE cannot be verified against the live grant set from this checkout.
--   * The idempotency short-circuit assumes the retried call passes the SAME
--     p_variant/p_context; a retry with a different variant returns that other
--     matchup's counts. The row is still not double-counted.
--
-- ROLLBACK
--   Restore the v1 function body from
--   supabase/migrations/20260710120000_league_swipe.sql, then:
--     drop function if exists public.record_league_swipe_result(
--       text, text, text, text, numeric, numeric, integer, jsonb, text, uuid);
--   The added columns and index are additive and may be left in place.
--   Re-granting the old broad privileges is NOT recommended.
-- ============================================================================
