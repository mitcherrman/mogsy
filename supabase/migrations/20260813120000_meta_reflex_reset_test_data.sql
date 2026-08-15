-- ============================================================================
-- Meta Reflex (internally League Swipe) — Phase 2, step 0
-- DESTRUCTIVE: discard the Meta Reflex play/aggregate test data.
--
--                    ⚠  READ THIS BEFORE APPLYING  ⚠
--
-- This migration DELETES ROWS. It is irreversible without a backup. It is here
-- because the owner has confirmed that all existing Meta Reflex play history is
-- TEST DATA with no product value, and that the new preference/rating model may
-- start completely fresh.
--
-- Running it against data anyone still cares about would destroy that data.
-- If in any doubt, stop and take a Lovable backup first.
--
-- WHY RESET RATHER THAN MIGRATE
-- The remaining Phase 2 migrations become dramatically simpler and safer on
-- empty tables. Specifically, all of the following stop being needed:
--   * quarantining pre-fix Stat Duel aggregates that blended six stats into one
--     counter and cannot be split apart;
--   * relabelling historical rows by guessing which variant they belonged to;
--   * carrying an unusable Elo value forward for continuity;
--   * a whole optional backfill script with no clean inverse.
-- Every one of those was a source of ambiguity. None of them survive a reset.
--
-- ============================== SCOPE ======================================
-- TRUNCATED (Meta Reflex play data only):
--   league_swipe_results          — the attempt log
--   league_swipe_matchups         — per-pair aggregate counters
--   league_swipe_entity_ratings   — the community ladder
--
-- PRESERVED (deliberately NOT touched):
--   league_swipe_games            — the four CATEGORY DEFINITIONS. These are
--                                   product configuration, not test data, and
--                                   the app resolves game slugs against them.
--                                   Wiping them would break every route.
--
-- NOT TOUCHED, AND STRUCTURALLY CANNOT BE:
--   quiz_*, ranked_*, daily_*, combat lab, auth.*, profiles, app_settings, and
--   everything else. Verified: every foreign key into this family points at
--   league_swipe_games, and nothing outside the family references any
--   league_swipe_* table. CASCADE is deliberately NOT used anywhere below, so
--   there is no path by which this can reach an unrelated table.
-- ============================================================================

begin;

-- Fail loudly if the tables are not the ones we expect, rather than truncating
-- something unexpected. A missing table here means the schema has drifted from
-- what this migration was written against.
do $$
begin
  if to_regclass('public.league_swipe_results') is null
     or to_regclass('public.league_swipe_matchups') is null
     or to_regclass('public.league_swipe_entity_ratings') is null
     or to_regclass('public.league_swipe_games') is null then
    raise exception 'Meta Reflex tables are not in the expected shape — aborting reset';
  end if;
end $$;

-- Report what is about to be discarded, so the operator sees it in the output
-- rather than having to have run a query beforehand.
do $$
declare
  v_results integer;
  v_matchups integer;
  v_ratings integer;
  v_games integer;
begin
  select count(*) into v_results  from public.league_swipe_results;
  select count(*) into v_matchups from public.league_swipe_matchups;
  select count(*) into v_ratings  from public.league_swipe_entity_ratings;
  select count(*) into v_games    from public.league_swipe_games;
  raise notice 'Meta Reflex reset — discarding % result rows, % matchup rows, % rating rows. Preserving % game definitions.',
    v_results, v_matchups, v_ratings, v_games;
end $$;

-- Explicit order (child before parent), and NO CASCADE. `truncate` on the three
-- together also satisfies the FK between results and matchups in one statement,
-- but listing them explicitly keeps the blast radius readable and auditable.
truncate table
  public.league_swipe_results,
  public.league_swipe_matchups,
  public.league_swipe_entity_ratings;

commit;

-- ============================================================================
-- VALIDATION (read-only — run immediately after)
-- ============================================================================
--
-- V1. Play data is gone, category definitions survive.
--     Expect: results 0, matchups 0, ratings 0, games 4.
--
--   select
--     (select count(*) from league_swipe_results)        as results,
--     (select count(*) from league_swipe_matchups)       as matchups,
--     (select count(*) from league_swipe_entity_ratings) as ratings,
--     (select count(*) from league_swipe_games)          as games;
--
-- V2. The four categories are intact and active — this is what the app routes
--     against, so all four must still be here.
--     Expect exactly: favorite-champion, most-annoying-champion,
--                     higher-base-stat, item-cost-duel — all is_active = true.
--
--   select slug, title, mode, entity_type, is_active
--     from league_swipe_games order by slug;
--
-- V3. Nothing outside the family was affected. Spot-check a few shared tables
--     against the counts captured in Step 0 of the execution plan.
--
--   select
--     (select count(*) from quiz_questions) as quiz_questions,
--     (select count(*) from profiles)       as profiles,
--     (select count(*) from app_settings)   as app_settings;
--
-- ROLLBACK
--   None. Truncation is irreversible; recovery is a restore from the Lovable
--   backup taken beforehand. This is the only irreversible step in Phase 2 and
--   it is deliberately first, so everything after it operates on a known-clean
--   state.
-- ============================================================================
