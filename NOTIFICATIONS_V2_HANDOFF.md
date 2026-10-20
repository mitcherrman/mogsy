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

## Exact-record deep linking (added requirement)

**Audit of what existed before this work (on `main`):** every admin
notification in the bell navigated to bare `/admin`; the admin notifications
page had no record links at all; the moderation views had no way to be opened
on a specific record. The first pass on this branch added `&focus=<id>` links
for feedback, user reports, comments and moderator requests — kept — but the
audit found five gaps, all now closed:

| Gap | Fix |
|---|---|
| Views load capped lists (300 comments, 50 reports, 50 requests; archived feedback hidden) so an older record silently didn't open | Each view also loads the focused record **by id** (bypassing cap, hidden and archived filters) and merges it in; filters/search that would hide it are cleared |
| Image reports and platform/system notices had no destination | Notification permalink `/admin/operations?section=notifications&notification=<id>`; for image reports its detail card IS the record view (image, item, report count, Hide/Restore) |
| Read was marked on click | `&from_notification=<id>`: the destination marks it read only after the record actually opened; a deleted record leaves it unread |
| Deleted / inaccessible records gave an empty list | `RecordFocusNotice` explains it and links back to the notification permalink; a notification whose subject is deleted links to its permalink |
| No Back/Forward or refresh support | Everything is URL-driven: the views re-evaluate focus on every URL change (and re-check "missing" once their data reloads); the admin page reads the permalink via `useLocation` |

Destinations (`adminRecordLink`, pinned by `src/lib/notifications/policy.test.ts`):

| Notification | Destination |
|---|---|
| feedback, question report, page report | `/admin/users?section=moderation&view=feedback&focus=<feedback id>&from_notification=<id>` — row expanded |
| user report | `…&view=reports&focus=<user_reports id>&from_notification=<id>` — highlighted |
| comment report | `…&view=comments&focus=<comment id>&from_notification=<id>` — highlighted, shown even if hidden |
| moderator request | `…&view=mod-config&focus=<id>&from_notification=<id>` — highlighted |
| image report (incl. critical) | `/admin/operations?section=notifications&notification=<id>` — image record card |
| platform / system notice | same permalink — the notification itself is the record |

Authorization is unchanged: the views run their existing admin queries/RPCs
(RLS-scoped); the permalink uses `admin_get_notification(_id)` (INVOKER,
admin-only, returns nothing for unknown/invisible ids). Viewing never resolves.
Resolution still comes from the owning workflow; for image reports, an ADMIN
hiding/restoring/deleting the image now resolves the notification via a new
`preset_item_images` trigger (the automatic threshold hide only escalates).

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
- Deep links: `src/lib/notifications/focus.ts` (hook), `src/components/admin/RecordFocusNotice.tsx`,
  by-id loading in `AdminFeedback`, `AdminUserReports`, `AdminComments`,
  `AdminModeratorConfig`; permalink card + image record view in `AdminNotifications`.
- Tests: `src/test/security/notificationsV2Lifecycle.test.ts` (PGlite, real
  migration over a production-shaped fixture), `notificationsV2Policy.test.ts`
  (TS ⇄ SQL parity), updated `adminNotificationReadSemantics.test.ts` and
  `com1SocialNotificationIdentity.test.ts`, component suites, `src/lib/notifications/api.test.ts`,
  fake server `src/test/notifications/inboxServer.ts`.
- Browser acceptance (GitHub Actions only): `e2e/notifications-v2/*`,
  `playwright.notifications-v2.config.ts`, `.github/workflows/notifications-v2.yml`.

## Database migration — how to apply (owner or connected-database operator)

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

- PGlite DB suite: **42/42** (backfill, isolation, RLS, grants, action guard,
  dedupe/escalation/unread-again, resolution sync for every workflow incl. image
  hide/restore/delete, permalink RPC incl. missing ids and non-admins, player
  lifecycle, muting, friend-request expiry, starvation + keyset paging,
  preflight accuracy, verify script, rollback without data loss, re-apply).
- TS ⇄ SQL policy parity: **3/3**.
- Component/unit: all notification-related suites **445/446** — the one failure
  is pre-existing on `main` (see below). Includes deep links per type
  (`recordDeepLinks.test.tsx`: beyond-cap, hidden, archived, resolved, missing,
  Back/Forward, mark-read-on-success) and `policy.test.ts` (every type → a
  specific destination).
- `tsc -p tsconfig.app.json` clean; harness typechecks and bundles.
- Regression comparison vs clean `main` (56 affected test files): no new
  failures, 4 fixed (see PR description).

## CI (GitHub Actions, PR #97, commit `eaf7342a`)

- **Notifications 2.0 Acceptance — success**
  ([run 39363130479](https://github.com/mitcherrman/mogsy/actions/runs/39363130479)):
  PGlite suites, component suites, typecheck (app + harness), production build,
  and browser acceptance **22/22** (11 cases × desktop + phone), screenshots
  uploaded as the `notifications-v2-acceptance` artifact.
- creator-replay-frontend — success.
- interaction-labs-integration — failure on one case unrelated to this work
  (`/admin/perfect-timing` owner bookmark). The same case has failed on every
  recent branch (8 of the last 8 runs before this PR), i.e. pre-existing on `main`.
- The browser runs found and fixed two real issues along the way: test reloads
  that re-seeded the harness, and a race where a permalink's mark-read could
  reload the previous tab (fixed in both inbox hooks).

Pre-existing failures on `main` (unrelated, not touched): `AdminFeedback.rfb`
"reason and comment kept apart" (fixed by open PR #94), plus several
Windows/shell-specific suites.

## Production preflight and the orphaned alert (2026-10-20)

The read-only preflight was run against production through the connected
Lovable/Supabase database (no writes). Result:

| | |
|---|---|
| admin rows | 13 (12 action, 1 community) |
| action_required_upper_bound | 12 |
| player rows | 13 |
| friend requests no longer actionable | 6 |
| admin / user receipts (untouched) | 20 / 14 |
| feedback_subject_missing | **1** |

The missing subject is admin notification `e1819840-afcb-4f66-b648-367e3d2c4c6c`
("New feedback: Other — Ranked", 2026-10-18 10:21 UTC), whose feedback row
`3aa6a1fb-a7ac-404e-9763-cc9ec8d4e6de` no longer exists.

**How the migration handles it.** Without its feedback row there is no digest,
so it classifies as Community rather than Action Required. The backfill then
resolves every alert whose record is missing as `subject_deleted`. It **keeps**
the row: title, message and metadata are unchanged and the row stays in
Completed and on its permalink. It also tags the row
`metadata.resolution_source = 'v2_backfill_missing_subject'`, because the old
schema never recorded when the record was deleted.

`notifications_v2_preflight.sql` now lists every such alert by id
(`missing_subject_notifications`). `notifications_v2_verify.sql` asserts that
none stays open (`orphans_resolved_ok`) and reports how many were kept
(`orphans_kept`, expected **1** in production). A live deletion after the
migration resolves through the delete triggers, without the backfill tag. The
PGlite suite reproduces both cases and pages through Completed to find the
orphan.

## CI flake and Perfect Timing (2026-10-20)

- **Desktop flake at `97ba551b`** (`inbox.spec.ts:142`: the permalink opened
  but `s1` never read). This was a test-harness defect, not a product defect.
  The harness persisted its stand-in database with an async wrapper, so a
  permalink's mark-read and the refresh it triggers interleaved and the write
  was lost. Persistence moved to `src/test/notifications/persistentInbox.ts`,
  which reloads, applies and saves in one synchronous step. A unit test
  overlaps a write with two reads. No browser assertion was weakened.
- **`interaction-labs-integration` → `/admin/perfect-timing`** is a stale test
  on `main`, outside this workstream. PT4.4 (`8fbce340`, 2026-10-16) hides
  `#root` (`display:none` + `inert`, `useFixedViewport`) and renders the mode in
  a `<body>` portal (`data-testid="perfect-timing-page"`). The access spec still
  asserts the `owner-playtest-page` wrapper inside `#root` is visible, which is
  impossible by design. It fails on every PR that touches `App.tsx` (the
  workflow's path filter); on recent branches it failed 8 of 8 runs. The fix
  belongs to the Perfect Timing owners. #97 does not change it.

## Current state

- Branch: `notifications/v2`, PR [#97](https://github.com/mitcherrman/mogsy/pull/97),
  up to date with `main` @ `2a7fa911`. Final SHA and its CI run are in the PR
  thread.
- **Not merged, not deployed.** The migration has **not** been applied to
  production. The PR stays unmerged by instruction.

## Remaining blockers / next actions

1. After CI is green, ChatGPT (connected database) will:
   - re-run the preflight and confirm `missing_subject_notifications` lists only
     `e1819840-…`;
   - apply the migration in one transaction;
   - run verify: every `*_ok` must be true and `orphans_kept` must be 1.
   Rollback: `notifications_v2_rollback.sql`.
2. Merge #97, then Lovable deploys.
3. Verify on `mogzy.lol`:
   - the bell badge and panel;
   - Clear all and Dismiss persist across reload;
   - admin inbox tabs and counters;
   - a feedback status change resolves its item and notifies the player;
   - one deep link per type (refresh, Back/Forward, a deleted id);
   - the orphan appears under Completed as "Record deleted".
4. Follow-ups, not required for this issue:
   - regenerate Supabase types;
   - the Perfect Timing owners update `e2e/interaction-labs-access.spec.ts`
     for PT4.4.
