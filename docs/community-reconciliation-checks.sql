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

   EXPECTED, based on the identical pattern already confirmed on public.profiles:
   has_explicit_column_acl = false and both *_can_select = true — i.e. the
   revoke either never ran or ran and did nothing, because a column-level
   REVOKE cannot remove a table-level privilege and this project's
   ALTER DEFAULT PRIVILEGES grants arwdDxtm at table level.

   Either outcome means the same thing operationally: this protection is not in
   effect and must not be relied on.
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
   ----------------------------------------------------------------------------- */
SELECT
  con.conname                     AS constraint_name,
  con.contype                     AS constraint_type,
  pg_get_constraintdef(con.oid)   AS definition
FROM pg_constraint con
WHERE con.conrelid = to_regclass('supabase_migrations.schema_migrations')
ORDER BY con.contype, con.conname;
