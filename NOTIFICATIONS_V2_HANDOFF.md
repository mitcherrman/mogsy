# Notifications 2.0 — handoff

Issue: [mitcherrman/mogsy#92](https://github.com/mitcherrman/mogsy/issues/92) · Branch: `notifications/v2` (from `main` @ `e0fa3fa7`)

## Objective

Turn the admin and player notification streams into clean, actionable inboxes:
a real lifecycle (unread → read → done / saved; expired; resolved), admin
triage organised by what needs action, player notifications that stay relevant,
and historical clutter that no longer dominates either inbox — without breaking
per-admin read isolation or the moderator-disposition meaning of
`admin_notifications.is_read`.

## Architectural decisions

1. **Augment, don't replace.** `admin_notifications` / `user_notifications` keep
   every row and column. New shared columns: `category`, `priority` (admin),
   `subject_type`/`subject_id`, `dedupe_key` + `occurrence_count` (admin),
   `activity_at`, `expires_at`, `resolved_at`/`resolved_by`/`resolution`.
2. **Read state is unchanged.** `admin_notification_reads` /
   `user_notification_reads` stay the only source of read state (per recipient).
   The one addition: an admin's own receipt can move forward (`read_at`) so a
   deduplicated repeat report makes an item unread again.
3. **Done / Saved are per recipient** in new tables `admin_notification_states`
   and `user_notification_states` (PK notification × recipient). Nothing global
   is ever deleted; "Done" removes an item from *my* inbox only.
4. **Resolved is shared and owned by the workflow**, never by opening a row:
   feedback status `completed`/`declined`/archived, `user_reports.status`,
   admin hide/restore/delete of a comment, friendship accepted/declined/deleted,
   moderator approve/deny (mirrored from `is_read`, whose meaning is untouched).
   Comment/image reports and platform notices — which have no workflow — can be
   resolved explicitly from the inbox ("Resolve… → Actioned / Dismiss"), with a
   reopen. The server refuses that shortcut for feedback, user reports and
   moderator requests.
5. **Action Required never hides.** Category `action` (reports, moderation,
   question/page reports, blocking bugs) never expires and cannot be marked done
   while unresolved — enforced by a trigger, not just the UI.
6. **Expiry policy (category based, documented in `src/lib/notifications/policy.ts`):**
   admin action = never; community = 30 days; platform = 7 days. Player:
   friend request 30 d (or until resolved); social/other 7 d; announcements
   30 d (low priority 7 d); account/security 90 d; retired Mogsy types expire
   immediately and never render. Saved items survive expiry.
7. **Server-side inbox RPCs filter before they paginate** (keyset cursor):
   `get_my_notifications`, `get_my_notification_summary`,
   `set_my_notification_state`, `set_my_notification_preferences`,
   `admin_get_notifications`, `admin_notification_counts`,
   `admin_set_notification_state`, `admin_resolve_notifications`,
   `admin_reopen_notification`. All INVOKER, all scoped to `auth.uid()` — no
   function accepts a user id. `admin_unread_notification_count()` keeps its
   signature with v2 meaning (unread *active* items), so existing callers
   (useAdminAttention, AdminDiagnostics) become correct without change.
8. **Dedup at the source.** Repeated comment/image reports on one subject merge
   into the open item (`occurrence_count`, priority escalation on auto-hide,
   `activity_at` bump → unread again). Feedback and user reports keep one item
   per row because each has its own status.
9. **Player control without risk.** `notification_preferences.muted_categories`
   is CHECK-constrained to `social | feedback | progress | announcement`;
   account and security notices cannot be muted by any client.
10. **Player feedback responses.** A status change on a player's feedback
    (`in-progress`, `planned`, `completed`, `declined`) sends one
    `feedback_update` notification, superseding the previous one for that
    report. Admin notes are never exposed.
11. **Safe rollout order.** The frontend falls back to the legacy reads when the
    v2 RPCs are missing (PostgREST `PGRST202`), hiding lifecycle actions. So the
    PR can merge before or after the migration without breaking the bell.
12. **Sync.** Every lifecycle table is in `supabase_realtime` (RLS-filtered to
    the owner); both surfaces refetch on any change (debounced) and on every
    reconnect; a same-tab event syncs the bell and the admin page instantly.

## Relevant files

- Migration: `supabase/migrations/20261019120000_notifications_v2_lifecycle.sql`
- Preflight (read-only scope report): `supabase/verification/notifications_v2_preflight.sql`
- Verification: `supabase/verification/notifications_v2_verify.sql`
- Rollback: `supabase/verification/notifications_v2_rollback.sql`
- Client: `src/lib/notifications/{policy,api,sync,focus,useAdminInbox,usePlayerInbox}.ts`
- UI: `src/components/admin/AdminNotifications.tsx` (admin inbox),
  `src/components/hud/MogzyIdentityMenu.tsx` (bell), `src/pages/Notifications.tsx`
  (player history/saved/preferences, route `/notifications`),
  `src/components/admin/AdminPushNotifications.tsx` (retired types removed,
  lifecycle hint, broadcast-only history).
- Deep links (`&focus=<id>` scroll + highlight/expand): `AdminFeedback`,
  `AdminUserReports`, `AdminComments` (also shows hidden), `AdminModeratorConfig`.
- Tests: `src/test/security/notificationsV2Lifecycle.test.ts` (PGlite, real
  migration over a production-shaped fixture), `notificationsV2Policy.test.ts`
  (TS ⇄ SQL parity), updated `adminNotificationReadSemantics.test.ts` and
  `com1SocialNotificationIdentity.test.ts`, component suites, `src/lib/notifications/api.test.ts`,
  fake server `src/test/notifications/inboxServer.ts`.
- Browser acceptance (GitHub Actions only): `e2e/notifications-v2/*`,
  `playwright.notifications-v2.config.ts`, `.github/workflows/notifications-v2.yml`.

## Database migration — how to apply (owner action)

Apply as `postgres` in the Supabase SQL Editor (do **not** `supabase db push`;
the ledger has drifted):

1. Run `notifications_v2_preflight.sql` and review the counts (what will expire,
   resolve or merge; `action_required_upper_bound` is what stays in Action
   Required). Nothing is deleted.
2. Optional exact dry run: `BEGIN;` + migration + `notifications_v2_verify.sql` + `ROLLBACK;`.
3. `BEGIN;` + migration + `COMMIT;`
4. Run `notifications_v2_verify.sql`: every `*_ok` column must be `true`.
5. Regenerate `src/integrations/supabase/types.ts` when convenient (the client
   uses a narrow untyped RPC door until then).

Rollback: `notifications_v2_rollback.sql` (restores the legacy schema and the
legacy unread count; drops only the v2 state/preference tables and columns —
no notification or receipt is deleted). Covered by a test.

## Test results (local, Windows, LF checkout)

- PGlite DB suite: **37/37** (backfill, isolation, RLS, grants, action guard,
  dedupe/escalation/unread-again, resolution sync for every workflow, player
  lifecycle, muting, friend-request expiry, starvation + keyset paging,
  preflight accuracy, verify script, rollback without data loss, re-apply).
- TS ⇄ SQL policy parity: **3/3**.
- Component/unit: HUD **118/118**, admin inbox **14/14**, player page **6/6**,
  api **4/4**, contract tests updated and green.
- `tsc -p tsconfig.app.json` clean; harness typechecks and bundles.
- Full-suite comparison vs clean `main`: see PR description.
- Browser acceptance: runs on the PR (desktop + phone). See PR checks.

Pre-existing failures on `main` (unrelated, not touched): `AdminFeedback.rfb`
"reason and comment kept apart" (fixed by open PR #94), plus several
Windows/shell-specific suites.

## Current state

- Branch: `notifications/v2` — see `git log` for the head commit.
- Deployment status: **not deployed**. The migration has **not** been applied to
  production (requires the owner in the SQL Editor). Frontend deploys via
  Lovable on merge to `main`.

## Remaining blockers / next actions

1. Owner: run preflight, apply migration, run verify (above).
2. Merge the PR after CI is green (order with step 1 is flexible thanks to the
   fallback, but lifecycle features appear only after the migration).
3. Verify on `mogzy.lol`: bell badge and panel, Clear all / Dismiss persist
   across reload, admin inbox tabs/counters, a feedback status change resolving
   its item and notifying the player.
4. Follow-ups (not required for this issue): regenerate Supabase types; a
   scheduled job is not needed (expiry is computed at read time).
