# QI2 — Question Intelligence into Admin Analytics: integration plan

Set up 2026-10-22. This follows DREP1 (backend PR #68, merged as master
`77c08167`, **not yet verified live**: `DAILY_REPEAT_HANDOFF.md` §9).

**Status (2026-10-22):** work item 1 (the DREP1 split) is DONE. The owner
approved option (a), the capped read.
* Backend `0f363554`: `MAX_AVOIDANCE_READS = 60`. Only children behind a
  repeat are read, Standard first, by primary key via `json_extract`. An
  unreadable snapshot counts as unclassified. 32/32 tests.
* Frontend `b076f333`: an absent split shows "not reported", never zeros.
  The panel gains a DREP1 totals line, an Avoidable column and a detail grid.
  35/35 tests; tsc shows only the 2 pre-existing errors.
* The golden is regenerated on both sides, byte-identical.

Both branches are pushed as draft PRs. Nothing is merged or deployed.

**Release review (2026-10-22):** items 2–4 are done; see §6. Review fixes:
backend `d3df4efd`, frontend `82af16f3`. Verdict: **GO for both PRs**, in
the §6.6 order. DREP1 is **still not live** in production (§6.5).

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

## 6. Release review (2026-10-22)

Fresh review of BE PR #85 (head was `dcc7ce87`) and FE PR #117 (head was
`8617fb5f`) against backend master `77c08167` (= DREP1 #68) and frontend
main `0fd1bb6a`; both PR branches already contain those bases. All evidence
is local: GitHub Actions is billing-blocked and was not pursued.

### 6.1 The 60 read limit: what it bounds

`MAX_AVOIDANCE_READS = 60` bounds **only** the DREP1 forced / avoidable
split: at most 60 Daily child `format_snapshot_json` values are read per
request. Served, answered, correct / incorrect / timeout, rates, positions,
hosts, stage kinds and every repeat figure come from **every eligible
record** in the range. The only other ceiling, `MAX_EXPOSURES = 400k`, refuses
the read with 422 `RANGE_TOO_LARGE`; it never truncates. New test
`test_the_read_cap_never_touches_counts_or_repeats` runs the same data at
cap 60 and cap 0: everything outside `drep1` is identical.

What *was* misleading, and is fixed:

1. **"Avoidable" counted repeats DREP1 never promised to avoid** (backend,
   High for the DREP1 verification). DREP1's frozen history
   (`question_avoidance.served_refs`) is the player's OFFICIAL Daily
   Standard / Time Trial / Survival children of the previous 7 *plan* days
   plus the earlier stages of the same run. QI's repeat universe is wider
   (Ranked, Review, other hosts). A Daily repeat first seen in Ranked was
   reported `avoidable_protected` (set without it) or, when the player had no
   in-scope history, `avoidable_unprotected` (DREP1 froze `None`), which
   looks exactly like a pre-DREP1 child. A creator-replay child was also
   treated as protected. Now a repeat is classified only when DREP1 promised
   it (in-scope earlier sighting, plan-day window or same run); everything
   else is `outside_scope` and costs no snapshot read. Same-run stages that
   straddle UTC midnight are matched by run, not clock.
2. **The read budget ignored the page** (backend, Medium). Children were read
   Standard-first across the whole range, so the rows on screen could be
   `unclassified` while the budget went to rows off the page. The split is
   now computed after paging, and the page's refs are read first.
3. **The Avoidable column hid partial data** (frontend, Medium). `0`,
   "not reported" and "all unclassified" all rendered `—`. Now: `—` = nothing
   to split, `0` = repeats but none avoidable, `N?` (+ title) = some
   unclassified. The totals line states `read X of Y Daily child snapshots,
   cap 60, this page first`.

### 6.2 Audit of the rest

| area | finding |
|---|---|
| owner-only endpoint | `require_admin` (owner session, MFA, trusted device); without it 401/403/503 (test). `mode=ro` + `PRAGMA query_only`, `Cache-Control: no-store`, owner id logged. Frontend sub-tab renders only for `isMasterAdmin`; a non-owner deep link falls back to traffic (test). OK. |
| canonical dedup | one row per exact `canonical_question_ref`. `ranked_segment_child_results` PK `(match, round, user, challenge_index)` rules out duplicate children; a quiz round is read from the round only for a human seat with no child row, and that check is built before family / namespace filters, so filters cannot double count. No ref → `unattributed`. OK. |
| selected-option positions | per-module mapping re-verified against the writers: quiz index into frozen `question_options_json`; Mastery `answer_options`; Meta Reflex `cN:left/right` = 1/2; item-cost v1–v3 item ids. Never re-graded. Minor (unchanged): an answered exposure whose pick cannot be decoded counts in `positional_exposures` and in `undecoded`. |
| timeouts | settled outcome; in the rate denominators (correct + incorrect + timeout), not in `answered`. `unsettled` (round never settled) is kept apart. Child outcomes are DB-CHECKed to the three values. OK. |
| test-data exclusion | `ranked_module_stats` rule + placeholder bank + non-official Daily policy; bots by `bot::`. Exclusion is per match: a QA or owner human account playing real matches is counted (no account-level QA list exists in the backend). Documented, unchanged. |
| DREP1 forced vs avoidable | fixed as in 6.1. QI repeats compare *previous days*; DREP1's same-day (Standard vs Time Trial in one run) prevention is visible only as `forced` within a run. For same-day totals use `scripts/audit_daily_question_repeats.py`. |
| frontend states | unreachable → "could not be reached"; 401/403 → "Owner access … refused"; 422 → the backend's reason; unknown schema / missing core count → "invalid" (core counts are now required, never drawn as 0); empty → explicit empty table + empty detail + zero totals; absent split → "not reported"; partial split → `N?`. Tests for each. |
| discoverability | `/admin/analytics` → `/admin/users` (Audience is the default section) → sub-tab **Question Intelligence**. New admin-registry entry `users-question-intelligence` (master_admin) so All Tools search finds it. |

### 6.3 Evidence (local)

Backend (`d3df4efd`, system Python 3.14, Windows):
* `test_question_intelligence.py` **37 passed** (32 + 5 new review tests).
* QI + DREP1 (`test_daily_question_avoidance`, `test_daily_question_repeat_audit`,
  `test_drep1_*`) + `test_ranked_module_stats`: **110 passed**.
* Differential, 79 files (QI, DREP1, every `test_daily_*`, module stats,
  admin auth and the 68 files that import `api_server`), branch vs a
  detached master `77c08167`: **1,556 vs 1,519 passed; 251 failed and 24
  errors on BOTH, identical sets** (Windows / no-canonical-DB environment:
  item runtime certification, admin bot match, RG1, …; 2 collection errors
  from a stale `AUTH_METHOD_SUPABASE` import in `test_ranked_builder_catalog`
  and `test_ranked_format_config`). No new failure.
* Golden: only the DREP1 limitation string changed; FE fixture byte-identical.
* The local canonical DB has 0 child results, so no real-data run was
  possible; production reads were not made.

Frontend (`82af16f3`; vitest via an esbuild scratch config because the
shared `@swc/core` fails its DACL check here):
* QI set (`questionIntelligence`, panel, `AdminUsersPage.questions`,
  registry, IA guard): 13 + 14 + 9 + 3 + 36 + 2 passed.
* Admin-wide (`src/components/admin`, `src/pages/admin`, `src/lib/admin`,
  `src/test/guards`), branch vs detached main `0fd1bb6a`: **1,186 vs 1,147
  passed; the same 7 pre-existing failures on both** (registry routes ×2,
  users1AudienceIdentity ×2, noStaticLeagueFacts, AdminPlatformPolicies,
  AdminQuizReview.proPlay).
* `tsc -p tsconfig.app.json`: only the 2 pre-existing errors. ESLint clean.
* `npm run build`: exit 0 (vite build, prerender, 173-URL sitemap verify);
  the panel is in the `AdminUsersPage` chunk; `public/sitemap.xml` restored.
* Playwright (owner-approved local run): bundled headless Chromium
  (headless shell 1248), this PC, 1 worker, 3 cases (1280 / 1440 / 1920),
  fixture harness, no visible window, Playwright-owned dev server torn down.
  **3/3 passed**: A1 / A2 hover drives the side panel, A1.4 = bottom-right,
  A1.2 hover caption, side panel beside the table, no sideways page scroll,
  Avoidable `0` / `—` / `1?`, A6 detail `Forced 0 · Avoidable 1 · Outside
  DREP1 0 · Unclassified 1`. Captures:
  `test-results/question-intelligence/qi1-{1280,1440,1920}{,-cell-hover}.png`,
  `qi2-{1280,1440,1920}-drep1-partial.png` (git-ignored). The run used a
  local config that only swaps the dev-server command for a no-swc scratch
  Vite config; the committed config is unchanged.

### 6.4 GO / NO-GO

* **Backend PR #85 — GO**, at the review head. Read-only, additive (one new
  router), no migration, no schema change to anything DREP1 reads. It does
  not need DREP1 live to work; until DREP1 is live, Daily repeats show as
  `avoidable_unprotected` where an in-scope history exists, which is true.
* **Frontend PR #117 — GO**, merged only **after** the backend is live (the
  panel otherwise shows "could not be reached"; harmless, but noisy).
* Not blocking, owner's call: account-level QA exclusion; same-day repeat
  totals in QI.

### 6.5 DREP1 production status (read-only evidence, 2026-10-22 05:04Z)

**Not deployed.** The public process marker
`/api/live-esports/health` → `poller.started_at` = `2026-10-21T06:36:50.976Z`,
the 59aed696 web deploy, so the web process predates the DREP1 merge
(`77c08167`, 00:18:33Z). GitHub shows no deployment for `77c08167`; its only
commit status is `history-population-cron` "No deployment needed". On
59aed696 the `League_Combat_Simulator` service shows a new **failed**
deployment at 2026-10-22T01:55:20Z. `GET /api/admin/question-intelligence`
answers 404 (route not deployed). No production write or authenticated read
was made.

### 6.6 Deployment sequence

0. Railway access first (`railway login`; the saved login was invalid
   10-21). Confirm a fresh backup (DBVAL1 paced recipe) and look at why the
   `League_Combat_Simulator` redeploy failed at 01:55Z before deploying.
1. **Deploy DREP1 alone**: web from master `77c08167`. Verify
   `poller.started_at` moves past the deploy time and the commit's
   `sweet-analysis - web` status is success; run `DAILY_REPEAT_HANDOFF.md`
   §9 live checks. DREP1 is roll-forward only (R2): to disable, deploy
   `release/drep1-rollforward-disable-20261021`, never a pre-DREP1 build.
2. **Backend #85**: mark ready, merge to master (keep the merge commit; the
   branch contains master). Owner deploys web from the new master.
   Verify as in step 1, then smoke: `GET /api/admin/question-intelligence`
   without a session → 401/403 (not 404); in the owner's browser session
   → 200 with `schema_version: 1`.
3. **Frontend #117**: mark ready, merge to main. Lovable: confirm the editor
   tracks `main` at the merge SHA (Lovable⇄GitHub sync checks), then
   **Publish**. Verify the live `AdminUsersPage-*.js` chunk contains
   `users-question-intelligence`, then open
   `/admin/users?section=audience&view=questions` as owner.
4. Owner sanity read: last 7 days, `host=daily`, sort "Most repeated";
   compare `repeat_vs_previous_days` with
   `scripts/audit_daily_question_repeats.py` (read-only) for the same days.
   After DREP1 has been live 1–7 days, `avoidable` should fall towards 0 and
   `forced` should sit on the thin families (Standard Herald,
   highest_base_stat).

Rollback: frontend revert is independent and safe. Backend #85 is read-only
and can be reverted alone; DREP1 itself stays roll-forward only.
