# QI2 — Question Intelligence into Admin Analytics: integration plan

Set up 2026-10-22. **Local only:** nothing pushed, no PR, nothing merged or
deployed. This follows DREP1 (backend PR #68, merged as master `77c08167`,
**not yet verified live**: `DAILY_REPEAT_HANDOFF.md` §9).

## 1. Where things are

| side | worktree | branch | contents |
|---|---|---|---|
| backend | `C:\Users\mlmit\lcs-qi2` | `analytics/qi2-integration-20261022` | QI1 `08e82986` + handoff `b064e0d0`, merged with master `77c08167` (clean) → `ca51e91b` |
| frontend | `C:\Users\mlmit\mogzy-wt\qi2-fe` | `admin/qi2-integration-20261022` | QI1 `1940a98b` + handoff `34d22df3`, merged with main (clean) → `5ed6fba8`; `node_modules` is a junction to the primary checkout |

The QI1 source branches are untouched: backend `analytics/question-intelligence-qi1`
in `C:\Users\mlmit\lcs-qintel`, and frontend `admin/question-intelligence-qi1`.

## 2. Destination

The destination is "Admin Analytics", which **is Users › Audience** now.
On current main, `/admin/analytics` redirects to `/admin/users`: USERS1
folded the Analytics area into Users (admin-registry `product-analytics`,
legacy route `/admin/analytics`). QI1 already lives there, as an owner-only
sub-tab at `/admin/users?section=audience&view=questions`. It is not a
fourth Users section, because `src/test/guards/users2AudienceIa.test.ts`
pins Users to Audience / Accounts / Moderation. No re-homing is needed.

Data path: the frontend calls Railway `GET /api/admin/question-intelligence`,
which is backend owner-only, through `ADMIN_API_BASE_URL` +
`buildAdminHeaders`. Audience's other panels read Supabase `analytics_*`,
which has no per-question fact, so QI is the Railway read path.

## 3. State on current bases

* Backend `test_question_intelligence.py`: **29 passed** on master + DREP1.
* Frontend QI vitest (`src/lib/admin/questionIntelligence`, the panel,
  `AdminUsersPage.questions`): **31 passed** on current main. Run with an
  esbuild scratch vitest config, because the shared `@swc/core` is broken
  here. Never run pnpm in worktrees.
* The frontend fixture `question-intelligence-v1.json` is byte-identical to
  the backend golden.

## 4. Work items

1. **DREP1 forced-repeat split (proposed; needs owner OK).** QI1 ports the
   DREP1 repeat audit but forked before #68. It cannot yet tell:
   * a *forced* repeat: the ref was in the child's frozen
     `avoid_question_refs`, so the family was exhausted (expected for
     Standard's Herald / highest-base-stat, R4); from
   * an *avoidable* one: no set, i.e. a child frozen before DREP1, or a bug.

   That split is how QI verifies DREP1 live. **Constraint:** the set sits
   inside each child's `format_snapshot_json`, and Time Trial / Survival
   snapshots are ~2 MB. A week of children is GBs of reads against a
   70 MB/s cgroup cap, and DBVAL1 showed unpaced full reads cause
   `database is locked` / 5xx. Options:
   * (a) json_extract, but only for the Daily children of repeat rows,
     with a hard cap;
   * (b) a small read-side cache keyed by child id (snapshots are
     immutable);
   * (c) leave the split to `scripts/audit_daily_question_repeats.py` and
     link it.

   Recommend (a) with a cap, plus a test that the read count is bounded.
2. **Screenshots (owner gate).** One headless Chromium run on fixture data:
   `npx playwright test -c playwright.question-intelligence.config.ts`
   (1280 + 1440, plus hover variants). Run it once the owner approves local
   browser automation (AGENTS.md), or once GitHub Actions billing works.
3. **Admin-wide regression on main.** QI1 recorded 7 pre-existing failures
   on main (registry routes ×2, noStaticLeagueFacts, users1AudienceIdentity
   ×2, AdminPlatformPolicies, AdminQuizReview.proPlay). Re-baseline on
   current main and diff, `tsc -p tsconfig.app.json`, and `npm run build`
   followed by `git checkout -- public/sitemap.xml`.
4. **Backend differential.** Admin/analytics suites, branch vs master,
   Windows env failures excluded.

## 5. Release order and gates

1. Owner reviews the panel and approves the screenshots (item 2).
2. Owner decides on item 1 and it is implemented; the golden updates on
   both sides together.
3. Backend: push, then PR. CI is Actions billing-blocked, so local gate
   evidence replaces it. Merge, then **owner deploys web**: auto-deploy from
   master is not firing (handoff §9.2). Verify via `/api/live-esports/health`
   `poller.started_at` and the commit's `sweet-analysis - web` status.
   Smoke: `GET /api/admin/question-intelligence` without a session → 401/403;
   with owner → 200.
4. Frontend: push, PR, merge, then **Lovable Publish** (owner). Check that
   the live bundle contains the panel. Until the backend is live, the view
   shows "could not be reached", never an empty table.
5. Use QI on live data to complete DREP1 §9.4 (repeat audit) once DREP1 is
   live.
