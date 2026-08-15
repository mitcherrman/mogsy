-- ============================================================================
-- Meta Reflex (internally League Swipe) — Phase 2A
-- Stat Duel aggregation fix: add the missing variant dimension.
--
-- PROBLEM
-- `league_swipe_matchups` was keyed `unique (game_id, entity_a, entity_b)`.
-- The Stat Duel game (`higher-base-stat`) picks one of SIX stats at random per
-- round (hp, ad, armor, magic_resist, move_speed, attack_range —
-- src/lib/league-swipe/api.ts STAT_KEYS), but the stat was not part of the
-- matchup identity. So "Garen vs Ahri — HP" and "Garen vs Ahri — Attack Range"
-- incremented the SAME counters, and the community split shown on reveal was a
-- blend of unrelated questions.
--
-- WHY `variant` AND NOT A NEW TABLE
-- The stat key is already recorded per result — the client has written
-- `context = {stat, statLabel}` on every Stat Duel row and `{stat: 'cost'}` on
-- every Item Cost Duel row since the feature's first commit (b8a2a3d4). The
-- only thing missing was the same dimension on the AGGREGATE. One column on the
-- existing table is strictly smaller than a parallel aggregate table and keeps a
-- single read path.
--
-- DEPENDS ON 20260813120000 (reset). Because the play tables are empty when
-- this runs, there is no historical relabelling, no ambiguity, and no
-- quarantine bucket — every row that ever carries a variant will have been
-- written by the fixed RPC with a real value.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- The new dimension.
--
-- '' (empty string), not NULL: two NULLs are never equal in a UNIQUE
-- constraint, so a nullable variant would allow two rows for the same pair and
-- silently reintroduce the duplicate-aggregate bug for opinion games. An empty
-- string means "this category has no variant dimension" and participates in
-- uniqueness normally.
-- ---------------------------------------------------------------------------
alter table public.league_swipe_matchups
  add column if not exists variant text not null default '';

comment on column public.league_swipe_matchups.variant is
  'Sub-category discriminator, part of the matchup identity. Stat Duel: the stat key (hp/ad/armor/magic_resist/move_speed/attack_range). Item Cost Duel: cost. Opinion games: empty string (no variant dimension).';

-- ---------------------------------------------------------------------------
-- Swap the uniqueness key.
--
-- Dropped BY SHAPE, not by name. The v1 constraint was created inline
-- (`unique (game_id, entity_a, entity_b)`) so Postgres auto-named it, and if a
-- guessed name is wrong then `drop constraint if exists` silently does nothing
-- — leaving the old 3-column constraint in place to reject every new
-- per-variant row. Failing silently is not acceptable here, so it is located by
-- its column list instead.
-- ---------------------------------------------------------------------------
do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.league_swipe_matchups'::regclass
       and c.contype = 'u'
       and (
         select array_agg(a.attname::text order by a.attname)
           from unnest(c.conkey) as k(attnum)
           join pg_attribute a
             on a.attrelid = c.conrelid and a.attnum = k.attnum
       ) = array['entity_a', 'entity_b', 'game_id']
  loop
    execute format('alter table public.league_swipe_matchups drop constraint %I', v_name);
    raise notice 'dropped legacy unique constraint %', v_name;
  end loop;
end $$;

alter table public.league_swipe_matchups
  add constraint league_swipe_matchups_pair_variant_key
  unique (game_id, entity_a, entity_b, variant);

commit;

-- ============================================================================
-- VALIDATION (read-only — run after applying)
-- ============================================================================
--
-- V1. The column exists with the right type/default/nullability.
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'league_swipe_matchups' and column_name = 'variant';
--
-- V2. Exactly ONE unique constraint, and it is the 4-column one.
--     Two rows here means the old constraint survived and per-variant rows will
--     be rejected at runtime — the single most important check in this file.
--   select c.conname,
--          (select array_agg(a.attname order by a.attnum)
--             from unnest(c.conkey) k(attnum)
--             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
--          ) as columns
--     from pg_constraint c
--    where c.conrelid = 'public.league_swipe_matchups'::regclass and c.contype = 'u';
--   -- expect one row: league_swipe_matchups_pair_variant_key
--   --                 {game_id, entity_a, entity_b, variant}
--
-- V3. Table is still empty (the reset ran, nothing has been played yet).
--   select count(*) from league_swipe_matchups;   -- expect 0
--
-- ROLLBACK
--   alter table public.league_swipe_matchups
--     drop constraint if exists league_swipe_matchups_pair_variant_key;
--   alter table public.league_swipe_matchups
--     add constraint league_swipe_matchups_game_id_entity_a_entity_b_key
--     unique (game_id, entity_a, entity_b);
--   alter table public.league_swipe_matchups drop column variant;
--   Safe while the table is empty or contains no two rows sharing a pair. Once
--   the fixed RPC has written real per-variant rows, re-adding the 3-column
--   constraint requires merging those rows first.
-- ============================================================================
