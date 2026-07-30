/* =============================================================================
   MOGZY — REMAINING MIGRATION-RECONCILIATION CHECKS (READ-ONLY)
   COM2, 2026-07-30.

   NOT A MIGRATION. Deliberately filed under docs/ so it can never be picked up
   by supabase/migrations tooling.

   Three statements. Run one at a time in the Supabase SQL Editor and paste each
   result back. Nothing here writes.
   ============================================================================= */


/* -----------------------------------------------------------------------------
   CHECK 1 — RECOVER THE FOUR ORPHAN MIGRATIONS
   These four versions are in supabase_migrations.schema_migrations with no
   corresponding repo file and name = ''. They are schema changes Lovable
   applied whose migration files never reached git, so the repository is not a
   faithful record of the schema.

   They are NOT a blocker for M1/M2/M3 — whatever they did is already reflected
   in the live state audited in Sections 1-3. This recovers their SQL so the
   files can be reconstructed and committed.

   20260318105426 and 20260318105456 are the priority: they land ~30s apart
   immediately after 20260318083701, which is the public_profiles view rebuild,
   so they sit squarely in the object window this workstream touches.

   RESULT (2026-07-30) — RUN. None touched public_profiles, profiles, the
   friendship objects, or Community grants. M1/M2/M3 are unaffected.

     20260224125853  SCHEMA/POLICY. Dropped "Profile photos are publicly
                     readable" on public.profile_photos and replaced it with
                     "Authenticated users can view profile photos"
                     (FOR SELECT TO authenticated USING true). This matches the
                     live policy already captured in audit Section 2, so the
                     audited state already reflects it.
                     >> RECONSTRUCT INTO THE REPO. This is a SECURITY HARDENING
                     that exists only in the database. A rebuild from the repo
                     would silently restore the public-readable policy.
     20260310114226  SCHEMA. ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS
                     show_global_stats boolean DEFAULT false.
                     >> RECONSTRUCT INTO THE REPO.
     20260318105426  DATA ONLY. UPDATE leagues SET category = 'Anime' for two
                     fixed ids. A one-off backfill, not schema.
                     >> DO NOT re-commit as a migration.
     20260318105456  DATA ONLY. UPDATE play_layout_config stripping league_%
                     categories from the published/draft configs.
                     >> DO NOT re-commit as a migration.
   ----------------------------------------------------------------------------- */
SELECT
  m.version,
  s.ord         AS statement_number,
  s.statement
FROM supabase_migrations.schema_migrations m
CROSS JOIN LATERAL unnest(m.statements) WITH ORDINALITY AS s(statement, ord)
WHERE m.version IN ('20260224125853', '20260310114226', '20260318105426', '20260318105456')
ORDER BY m.version, s.ord;


/* -----------------------------------------------------------------------------
   CHECK 2 — DID 20260520135130_revoke_custom_links_grant_columns EVER RUN?
   That file is repo-only. It contains no CREATE, only
     REVOKE SELECT (grant_pro, grant_diamonds, created_by_user_id)
       ON public.custom_links FROM anon, authenticated;
   so there is no object whose existence proves it ran. A column-level ACL
   entry (attacl) exists only where a column-level GRANT or REVOKE was issued,
   which makes attacl the tell.

   RESULT (2026-07-30) — RUN. The prediction written here beforehand was WRONG.
   It generalised public.profiles (table-level SELECT for anon/authenticated,
   which makes column-level REVOKEs inert) onto custom_links. custom_links does
   not share that shape.

     created_by_user_id   attacl = {anon=r/postgres,authenticated=r/postgres}
                          anon_can_select = true, authenticated_can_select = true
     grant_diamonds       no column acl, NOT selectable by either role
     grant_pro            no column acl, NOT selectable by either role

   Reading: anon/authenticated do NOT hold table-level SELECT on custom_links —
   otherwise grant_pro/grant_diamonds would be selectable. Access is by
   column-level grant, and created_by_user_id has one.

   Did 20260520135130 run? Almost certainly NOT. If it had, it would have
   removed the created_by_user_id column grant too, and nothing in the repo
   re-grants it. The state is fully consistent with the migration never running
   and grant_pro/grant_diamonds simply never having been column-granted.
   One query would settle it definitively — dump relacl plus every attacl on
   custom_links and compare against the grant history.

   Operational conclusions:
     - grant_pro / grant_diamonds ARE protected, by never having been granted
       rather than by this migration.
     - created_by_user_id (a Supabase auth user id) IS column-readable by anon
       and authenticated. Currently inert: 20260520083308 dropped the public
       read policy, so RLS yields no rows, and resolve_custom_link() is
       SECURITY DEFINER with a fixed 10-column contract that omits it. It would
       become live the moment any permissive read policy is added to
       custom_links.
     - This belongs to the same perimeter as M3's user_id omission: auth user
       ids must not become reachable cross-user.
   ----------------------------------------------------------------------------- */
SELECT
  att.attname                              AS column_name,
  att.attacl IS NOT NULL                   AS has_explicit_column_acl,
  att.attacl::text                         AS column_acl,
  has_column_privilege('authenticated', c.oid, att.attname, 'SELECT') AS authenticated_can_select,
  has_column_privilege('anon',          c.oid, att.attname, 'SELECT') AS anon_can_select
FROM pg_class c
JOIN pg_namespace n   ON n.oid = c.relnamespace
JOIN pg_attribute att ON att.attrelid = c.oid AND att.attnum > 0 AND NOT att.attisdropped
WHERE n.nspname = 'public'
  AND c.relname = 'custom_links'
  AND att.attname IN ('grant_pro', 'grant_diamonds', 'created_by_user_id')
ORDER BY att.attname;


/* -----------------------------------------------------------------------------
   CHECK 3 — CONFIRM THE LEDGER PRIMARY KEY
   Must be run BEFORE any backfill insert. Two repo files share the version
   20260710120000 (broadcast_live_state and league_swipe). If `version` is the
   primary key — near-certain — the second backfill insert would fail, and one
   file must be renamed first:
       20260710120000_league_swipe.sql -> 20260710120100_league_swipe.sql
   (league_swipe was committed 2026-07-10, broadcast_live_state 2026-07-09, so
   the later one moves.)

   RESULT (2026-07-30) — RUN. Confirmed:
     schema_migrations_pkey                 PRIMARY KEY (version)
     schema_migrations_idempotency_key_key  UNIQUE (idempotency_key)

   Consequences:
     - The duplicate 20260710120000 MUST be resolved by rename before any
       historical backfill; the second insert would violate the primary key.
       Not yet done — held pending authorisation.
     - The M1/M2/M3 ledger inserts are unaffected: their versions are unique.
     - UNIQUE (idempotency_key) is not a problem for those inserts. Every
       existing row has idempotency_key = NULL and NULLs do not conflict under
       a unique constraint, so leaving the column out is safe.
   ----------------------------------------------------------------------------- */
SELECT
  con.conname                     AS constraint_name,
  con.contype                     AS constraint_type,
  pg_get_constraintdef(con.oid)   AS definition
FROM pg_constraint con
WHERE con.conrelid = to_regclass('supabase_migrations.schema_migrations')
ORDER BY con.contype, con.conname;
