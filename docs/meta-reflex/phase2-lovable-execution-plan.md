# Meta Reflex Phase 2 — Lovable / Supabase execution plan

Nothing here has been applied. No local Postgres, no Docker, no Supabase CLI.
All SQL is static-reviewed only.

**Premise:** the owner has confirmed all existing Meta Reflex play data is test
data. Phase 2 therefore starts by discarding it, which removes the historical
backfill, the legacy-Elo column, and every ambiguity that came with them.

**The single biggest residual risk:** PL/pgSQL function bodies compile at first
**CALL**, not at `CREATE`. Migration 4 will apply cleanly and still fail on the
first real vote if there is a typo inside the body. Step 4 exists specifically
to trigger that before players do.

---

## What is discarded, and what is not

| | |
|---|---|
| **Discarded** | `league_swipe_results`, `league_swipe_matchups`, `league_swipe_entity_ratings` — all Meta Reflex play/aggregate test data |
| **Preserved** | `league_swipe_games` — the four category definitions. Product configuration the app routes against, not play data. Wiping it breaks every route. |
| **Untouched** | `quiz_*`, `ranked_*`, `daily_*`, Combat Lab, `auth.*`, `profiles`, `app_settings`, everything else |

Verified structurally: every foreign key into this family points at
`league_swipe_games`, and **nothing outside the family references any
`league_swipe_*` table**. `CASCADE` is not used anywhere, so there is no path by
which the truncation can reach unrelated data.

---

## Dependency order — strict, do not reorder

```
1. 20260813120000_meta_reflex_reset_test_data.sql          ⚠ DESTRUCTIVE
        │  truncates the 3 play tables; preserves league_swipe_games
        ▼
2. 20260813120100_meta_reflex_variant_discriminator.sql
        │  adds matchups.variant + the 4-column unique constraint
        ▼
3. 20260813120200_meta_reflex_preferences_and_derived_ranking.sql
        │  adds league_swipe_preferences + league_swipe_derived_rating()
        ▼
4. 20260813120300_meta_reflex_vote_rpc_v2.sql
           needs BOTH: ON CONFLICT targets #2's constraint,
           and the body calls #3's derived_rating function
```

Applying 4 before 2 or 3 fails at `CREATE` (unknown column / unknown function).
Each file is wrapped in its own `begin; … commit;`.

The reset is deliberately **first** so that every later migration operates on a
known-clean state — no relabelling, no quarantine bucket, no guessing.

---

## Step 0 — capture the "before" picture (read-only)

Run and **save the output**. The shared-table counts are the control group for
proving the truncation stayed in its lane.

```sql
-- Meta Reflex, about to be discarded (record it for the record, not to restore)
select
  (select count(*) from league_swipe_results)        as results,
  (select count(*) from league_swipe_matchups)       as matchups,
  (select count(*) from league_swipe_entity_ratings) as ratings,
  (select count(*) from league_swipe_games)          as games;

-- Control group: MUST be identical after Step 2.
select
  (select count(*) from quiz_questions) as quiz_questions,
  (select count(*) from profiles)       as profiles,
  (select count(*) from app_settings)   as app_settings;
```

## Step 1 — backup

Take a Lovable backup before the destructive step. The owner has confirmed this
is test data, so this is belt-and-braces rather than a hard requirement — but
truncation has no inverse, and it costs nothing to have one.

## Step 2 — apply the four migrations, in order

Apply each, then run that file's own `VALIDATION` block (embedded at the bottom
of each file). Do not continue if a check fails.

The three highest-value checks:

**After migration 1** — the reset stayed in scope:
```sql
select
  (select count(*) from league_swipe_results)        as results,   -- 0
  (select count(*) from league_swipe_matchups)       as matchups,  -- 0
  (select count(*) from league_swipe_entity_ratings) as ratings,   -- 0
  (select count(*) from league_swipe_games)          as games;     -- 4
select slug, title, mode, is_active from league_swipe_games order by slug;
```
All four categories must still be present and active. Then re-run the Step 0
control-group query — it must be **unchanged**.

**After migration 2** — exactly one unique constraint, the 4-column one:
```sql
select c.conname,
       (select array_agg(a.attname order by a.attnum)
          from unnest(c.conkey) k(attnum)
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as columns
  from pg_constraint c
 where c.conrelid = 'public.league_swipe_matchups'::regclass and c.contype = 'u';
```
Two rows means the old 3-column constraint survived and will reject every
per-variant row at runtime.

**After migration 4** — exactly one RPC overload:
```sql
select p.oid::regprocedure
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'record_league_swipe_result';
```
Expect **one row, 10 arguments**. Two rows means the v1 drop did not match and
old traffic can still reach the vulnerable path.

## Step 3 — smoke-test the RPC body (this is what proves it compiles)

In a transaction that is **rolled back**, so nothing persists:

```sql
begin;

-- 3a. Factual path — appends an attempt, no preference, no rating.
select public.record_league_swipe_result(
  'item-cost-duel', 'Infinity Edge', 'Long Sword',
  'Infinity Edge', 3450, 350, 2500, '{"stat":"cost"}'::jsonb, 'cost', gen_random_uuid());

-- 3b. Variant separation — same pair, two stats, two independent rows.
select public.record_league_swipe_result(
  'higher-base-stat','Garen','Ahri', 'Garen', 690, 590, 2000, '{"stat":"hp"}'::jsonb, 'hp', null);
select public.record_league_swipe_result(
  'higher-base-stat','Ahri','Garen', 'Ahri', 550, 175, 2000, '{"stat":"attack_range"}'::jsonb, 'attack_range', null);
select variant, votes_a, votes_b from league_swipe_matchups
 where entity_a = 'Ahri' and entity_b = 'Garen';     -- expect TWO rows

-- 3c. Verdict is never taken from the client.
select is_correct, verdict_source, client_claimed_correct, variant
  from league_swipe_results order by created_at desc limit 3;
  -- is_correct NULL, verdict_source 'unverified'

rollback;   -- IMPORTANT
```

If any call raises, the function body has a defect — which is precisely what
this step is for. Note `auth.uid()` is NULL in the SQL editor, so the opinion
path here only exercises the session-less branch; the preference logic is
proven in Step 4.

## Step 4 — behavioural verification from the app (the real proof)

The preference/idempotency logic needs a real `auth.uid()`, so verify from a
browser session. Anonymous sign-in is enough — anonymous playtesters get a real
`auth.users` row and a stable uid, so they exercise the same path as registered
users.

| # | Action | Expected |
|---|---|---|
| 1 | Play Stat Duel, note the stat | new `matchups` row with that stat as `variant` |
| 2 | Same champion pair, different stat | a **second** row — counters independent |
| 3 | Vote Favorite Champion A over B | one `preferences` row; both ratings recomputed |
| 4 | Vote the **same** way again | counters and ratings **unchanged** |
| 5 | Vote the **other** way | preference flips; total votes unchanged |
| 6 | Play Item Cost Duel repeatedly | results grow; **no** preference row; ratings untouched |
| 7 | Inspect any result row | `is_correct` NULL, `verdict_source` = `unverified` |

For 4 and 5, `total` must not change between them:
```sql
select m.entity_a, m.entity_b, m.votes_a, m.votes_b, m.votes_a + m.votes_b as total
  from league_swipe_matchups m join league_swipe_games g on g.id = m.game_id
 where g.slug = 'favorite-champion' order by total desc limit 10;
```

Expected first-vote rating: an entity with 1 win from 1 vote shows **1333**
(not 1032 as the old Elo would have). See `rating-model.md`.

## Step 5 — drift check, after some real play

Run **V4** from migration 3. It compares stored counters against the preference
rows; any row returned is drift. The repair is:

```sql
select public.league_swipe_recompute_ratings();
```

---

## Rollback

| Migration | Reversible? | Notes |
|---|---|---|
| 1 — reset | **No** | Truncation has no inverse. Restore from the Step 1 backup. This is the only irreversible step, and it is first by design. |
| 2 — variant | Yes | Drop the constraint and column. Trivial while tables are empty. |
| 3 — preferences | Yes | Drop the table and the two functions. `rating` is left as a plain integer column. |
| 4 — RPC v2 | Yes | Restore the v1 body from `20260710120000_league_swipe.sql`, then drop the 10-arg signature. Do **not** re-grant the old broad table privileges. |

## Frontend coordination

**No frontend change is required, and none should ship first.** The client
already sends `context = {stat: …}`, which the RPC uses for the variant, and the
Phase 1a reveal already tolerates `isCorrect: null` by deriving locally. Deploy
order is free.

Two cosmetic follow-ups, after validation:

1. The `+N rating` badge stops appearing (`ratingChange` is always null in a
   derived model). Replacement options in `rating-model.md`.
2. Passing `p_client_submission_id` activates retry idempotency. The column and
   unique index exist and are inert until used.

The stats board will look bare until votes accumulate.
`LeagueSwipeStats.tsx:138` already renders an early-data notice for exactly this
case, so nothing breaks — it is simply the honest state of a fresh system.
