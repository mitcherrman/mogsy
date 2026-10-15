# Role Challenge — release handoff (RC8)

_Last updated: 2026-10-15 ~03:00 UTC. Owner deployment approval required before merge/deploy._

## Current state

| Piece | Where | Head |
|---|---|---|
| Frontend release candidate | `mitcherrman/mogsy` PR #18, branch `rc7/role-challenge-hub-20261014` (same commits as `claude/relaxed-archimedes-8kq1vi`), base `main` | **`106c5bd`** code (= candidate + `main` `8856611`); later commits on the branch are handoff-only |
| Backend release candidate | `mitcherrman/League_Combat_Simulator` PR #14, branch `rc5/role-challenge-pools`, base `master` | **`8fb9b50f`** (= canonically accepted `38aa1125` + `master` `ee722bc1`) |
| Superseded | mogsy PR #12 (RC4 transport) and PR #13 (RC6 origin) — fully contained in PR #18 | — |

**Backend MERGED by the owner** (2026-10-15 04:02 UTC): `master` `5bc5fe57` = "Merge PR #14: Role Challenge V1
backend release", parents `ee722bc1` + `8fb9b50f`; its tree is **byte-identical to the reviewed `8fb9b50f`**, so the
canonical acceptance on `38aa1125` carries to production unchanged (Role Challenge tree identical).

**Frontend PR #18: READY for the owner's deployment approval** (clean, 0 behind `main`, CI green). Remaining
owner steps: smoke `GET /api/role-challenges/catalog` in production (this cloud session's network policy
blocks the Railway host, so it could not be run from here), then mark #18 ready and merge.

## Canonical acceptance (owner's workstation, 2026-10-15)

Run by the owner with `scripts/role_challenge_canonical_acceptance.ps1` on backend commit
**`38aa1125f87693dcdd6a4a909e7a7fa8afe1fa7d`**: **865/865** champion-role compositions passed, **543/543**
unconventional pairs passed, **378 backend tests passed, 0 failed, 0 skipped**, canonical database
**unchanged**, exit code **0**.

## Final reconciliation (2026-10-15 ~02:45 UTC)

### Backend PR #14 → `8fb9b50f`
- Merge of `master` `ee722bc1` (PRs #25, #26, #12: Patch Ops cron transport, watcher leases, guarded
  report re-promotion) into the accepted head `38aa1125`. Clean, no conflicts. History preserved.
- **Every file that differs from `38aa1125` is Patch Ops**: `knowledge_engine/patch_report/*`,
  `knowledge_engine/tests/test_patch_ops_*`, `scripts/patch_ops*.py`, `.github/workflows/patchops-*`,
  `docs/handoffs/PATCHOPS_AUTO_REPROMOTION.md`. Verified with `git diff --name-only 38aa1125 8fb9b50f`.
- `git diff 38aa1125 8fb9b50f` is **empty** for `role_challenge/ ranked_public/ ranked_modules/
  ranked_formats/ mastery/ content_sets/ quiz/ routes/ services/ schemas/ analytics/ api_server.py`, the
  865 probe, the acceptance scripts, every `test_rc*`/HOST1/CAP2 test and the RC migration.
- Import closure check: none of the changed modules is imported by `role_challenge.composer`,
  `role_challenge.launch`, `routes.role_challenge` or `api_server` (and none of those importers changed).
- Focused RC + Reconstruct **333 passed, 45 skipped** (the 45 are exactly the DB-gated tests the canonical
  run executed on byte-identical code); merged Patch Ops suites **117 passed**; GitHub safety /
  integration / role-challenge **3/3 success** on `8fb9b50f`.

**Canonical evidence: NOT invalidated.** The canonical run exercised the Role Challenge composer, pools,
launch service, routes and DB-gated tests; all of that code and its whole import closure is identical
between `38aa1125` and `8fb9b50f`. The only new code (Patch Ops) is outside that closure, has its own
suites (green) and touches no Role Challenge table. **No canonical rerun is required.** A rerun would
become required only if a later change touched any path listed above or `requirements.txt`.

### Frontend PR #18 → `106c5bd`
- Merge of `main` `8856611` (PR #28 ranked reconnect after deploy; PR #19 interaction playtests). Clean.
- **Overlap**: `src/pages/quiz-ranked/QuizRankedMatch.tsx` changed on both sides in disjoint hunks.
  #28 adds `connectionInterrupted` ("Connection lost — reconnecting…" in the status row and segment
  errors) and an `online`/`visibilitychange` re-poll in `useRankedMatch`; RC8 keeps the origin-aware rules
  scroll and the in-place Role Challenge review. Both retained; #28's recovery also protects a resumed
  Role Challenge (same arena controller).
- No `package.json`/`package-lock.json` change; `npm ci` dry-run in sync; `tsc` app + node **0 errors**;
  production `vite build` passes.
- Affected suites (Role Challenge, hub, rules, results, all of `src/pages/quiz-ranked` incl. the new
  `useRankedMatch` tests, Quiz guide/playScroll/rankedRole, LeaguecraftHub, workspace, lobby preview):
  **1,064 passed, 1 failed** — the one failure (`Quiz.rankedRole › commits NOTHING for Practice after a
  role change`) fails identically on current `main` `8856611` (pre-existing).
- Live acceptance on `106c5bd` + backend `8fb9b50f`: **27 / 27 PASS**.
- Deploy-outage drill (new #28 behaviour on a Role Challenge match): backend killed mid-question →
  "Connection lost — reconnecting…" after 1.5 s; backend restarted → the **same** Role Challenge match
  (question 1/12) resumed 4.7 s after the outage began.
- **Full frontend suite**, candidate `106c5bd` vs `main` `8856611`: candidate **17,100 passed / 32 failed /
  7 skipped** (17,139 tests); main **17,064 / 31 / 7** (17,102). **No file fails only on the candidate.**
  The only per-test deltas are inside `LobbyPreviewPage.premiumAnalytics` (dev-only Daily History lab; no
  code in this branch touches it). Four isolated runs per tree: line 130 fails on both every time
  (pre-existing); lines 237 and 507 fail intermittently on both trees (237: main 3/4, candidate 2/4;
  507: candidate 1/4, otherwise passing) — waitFor timing on a heavy render, **not a regression**.
- GitHub on `106c5bd`: `role-challenge-review` (npm ci → tests → tsc → vite build) **success**;
  `ranked-deployment-recovery` (#28's workflow) **success**; same two green again on handoff head `e987e24`.
- Frontend changes cannot affect the canonical backend evidence (separate repository; the API contract
  consumed by the frontend is unchanged in `role_challenge/` and `routes/role_challenge.py`).

## What the feature does

- Quiz Hub keeps its three parchments. **Left Ranked Standing and right Academy Record are unchanged.**
- Centre parchment is a tablist: **Daily Challenge (default) · Role Challenge · Ranked**.
  `/quiz?mode=role|ranked|daily` opens that mode; `/quiz?play=1` (Ranked "Play Again") opens Ranked.
- Role Challenge: any of 173 champions × any of 5 roles (off-meta allowed and labelled), portrait grid,
  search, Free/Premium plan chip, UTC reset countdown, Premium upgrade link, active-run **Resume**,
  today's completed free run, loading skeleton, retryable catalog/status errors.
- Start → the **existing Ranked arena** (`/quiz/ranked`), labelled "Role Challenge · vs Bot · n / 12",
  12-node timeline, Role-Challenge rules copy ("12 questions · Unrated"). Result: "Match Complete ·
  Unrated", **Back to Role Challenge** → `/quiz?mode=role`; **Review Match** opens the result's own
  question review in place (Role Challenge is deliberately not in Ranked history).
- Server-authoritative: catalog, eligibility (`status.next_start`), active run, match. Free = one start
  per UTC day; Premium = unlimited; one start key per user action, reused on transport failure.
- Unrated and isolated (backend): `rating_eligible=False`; excluded from Ranked history (so from the
  Ranked Standing ledgers/role W-L, which are tallied from history); `role_challenge` host never adds to
  the permanent question library. No client-side achievement/XP writes exist in the arena.

## Decisions

1. **PR #18 preserved as the release candidate**; RC8 commits are fast-forwarded onto its branch and its
   base moved from the RC4 branch to `main` (it already contains RC4 + RC6 + current `main`).
2. **Lockfile**: `package-lock.json` gained the 84 entries `package.json` already declared
   (drizzle-kit, drizzle-orm, postgres + their esbuild/tsx). Additive only: **0 existing versions
   changed, 0 removed**. `npm ci` works again; CI no longer needs `--package-lock=false`.
3. **TypeScript**: the two previously reported errors are already fixed on current `main`; whole-app
   `tsc` (app + node projects) exits 0 on the candidate and CI now enforces it with no allowance.
4. **Champion art** uses the catalog's `riot_id` (Data Dragon key: `MonkeyKing`, `KSante`, …). The
   lowercase catalog id 404s on a case-sensitive host. Fallback rule covers a null `riot_id`.
5. **Mogzy's Ranked role guide** mounts only on the Ranked mode it points at.
6. **Review Match** for a Role Challenge opens the end screen's Match details in place instead of
   `/quiz#history` (which correctly does not contain it).
7. Dev-only `/dev/lobby-preview` mounts the real picker, so its Role tab would read the public catalog
   (the route 404s in production builds).
8. **Module statistics** (`/api/ranked/module-stats`, a per-module accuracy read) *do* include Role
   Challenge answers, the same policy the backend already applies to Daily-hosted matches (a genuine
   attempt is a genuine attempt). It is not rating, history, achievements or role W/L. Flip it in
   `services/ranked_module_stats.py` if the owner wants it excluded.

## Changed files (frontend, vs `main`)

- `src/lib/role-challenge/{contracts,client}.ts` (+tests) — RC4 transport (unchanged).
- `src/lib/role-challenge/presentation.ts` (+test) — art key, search, eligibility copy, reset countdown, mode-from-URL.
- `src/components/quiz/RoleChallengePicker.tsx` (+test) — the finished picker.
- `src/components/quiz/RankedLobbyHero.tsx`, `LeaguecraftHub.tsx`, `src/pages/Quiz.tsx` — centre tablist, Daily panel, initial mode, guide gating.
- `src/pages/quiz-ranked/{matchOrigin.ts,QuizRankedMatch.tsx}`, `src/lib/ranked-public/matchHost.ts` — origin/host, return route, rules variant, in-place review.
- `src/components/ranked-rules/*`, `src/components/game-results/openResultDetails.ts` — rules copy variant, review opener (+test).
- `package-lock.json`; `.github/workflows/role-challenge-review.yml` (replaces the RC4/RC7 diagnostic workflows).
- `e2e/role-challenge-real-backend/` — local real-backend rig + acceptance driver (dev only, never shipped).

Backend (PR #14) changes in this pass: merge of `master` `35bc16bf`; `scripts/role_challenge_canonical_acceptance.ps1`.

## Tests (this pass)

- **Frontend focused / CI gate** (Role Challenge, hub, arena, rules, results; `role-challenge-review.yml`):
  **905 passed, 0 failed (82 files)** locally; the GitHub workflow (npm ci → tests → tsc → vite build) is green.
- **Frontend full suite, candidate `2738ad1`** vs **`main` `0210282`**: candidate **16,771 passed / 34 failed /
  7 skipped** (16,812 total; +37 tests); main **16,739 / 29 / 7**. Every failing file fails on `main` too.
  The only per-test differences were in two slow timing-sensitive files (`LobbyPreviewPage.premiumAnalytics`,
  `PatchReports.catchup`); rerun alone on both trees they give **identical results** (2 failed / 70 passed on
  both). **No regression.** Pre-existing failures (not touched here): App routing/route guards, admin
  registry routes, QuizCategoryRail (Vision), arena boundary/geometry, Quiz.hub h1 + rail, users1/pt14/
  admin-notification guards, noStaticLeagueFacts, DailyHistory, syntheticRankedHistory, useSafeTemporalBack.
- `tsc` app + node: **0 errors**. `vite build` (production): **passes**.
- ESLint on touched files: 0 new errors (the 12 `no-explicit-any` errors in `Quiz.tsx` are identical on `main`).
- **Backend** on the master-merged candidate: GitHub **3/3 green**; focused **293 passed, 45 skipped (DB-gated),
  179 subtests**; Reconstruct timing **40 passed**; wide differential over 154 files **identical failure sets**
  (414 failed / 33 errors on both, inherited), candidate +2 passes. **No regression.**
- **Live acceptance** (real `api_server:app` on a scratch DB, real arena, Chromium; desktop 1440×900 + mobile
  390×844) on PR head `2738ad1`: **27 / 27 PASS** — hub modes and parchments, 173-champion picker with portraits,
  off-meta pick, full 12-question play, reload resume, hub Resume card, in-place review, Free daily gating with
  reset/Premium offer, server 403 on a second Free start, lost-response retry → same run, Premium repeat
  (premium slot), 409 on a second active match, Ranked history/rating/placements untouched, Ranked seal and
  `?play=1` still open the Ranked record, Daily button opens Daily. A run that crossed 00:00 UTC also showed the
  daily slot resetting at the UTC boundary as designed.


### Re-integration (2026-10-15 ~01:00 UTC)

Both default branches moved during the session; both candidates were re-merged (clean, no conflicts):

- Frontend `8424bee` = candidate + `main` `ecc6fcb` (mobile arena visibility/sticky timeline, stat-check,
  numeric lab, creator replay). Lockfile still in sync (`npm ci` dry-run OK); `tsc` app+node 0 errors;
  CI-gate + hub suites **1,003 passed / 0 failed (88 files)**; live acceptance **27 / 27** on both
  re-integrated candidates (incl. the new sticky mobile timeline).
- Backend `29d27212` = candidate + `master` `7b4e35d3` (scrub S3, creator replay, numeric lab, Patch Ops).
  Focused RC + Reconstruct **333 passed, 45 skipped (DB-gated)**. Wide differential over 190 files incl. the
  new scrub/creator suites: master 4,026 passed / 743 failed / 33 errors, candidate 4,027 / 744 / 33. The
  single delta, `test_rp1_ranked_points_v2.py::test_a_bot_scores_points_by_the_same_rules_with_no_bot_specific_branch`,
  is **nondeterministic on master too** (passes alone on both trees; the file alternates 7/8 failures across
  repeated runs on both). **No regression.**

## Blockers

None technical. Remaining gate: **owner approval to merge/deploy** (both repos auto-deploy from their
default branches).

## Next action (owner) — merge order

1. Confirm both PRs are still `mergeable: clean` with green CI on the heads above (if a default branch
   moves again, re-run this reconciliation; rerun the canonical acceptance only if the new base changes
   any Role Challenge path listed under *Final reconciliation*).
2. Mark backend PR #14 ready and merge it (Railway `web` + cron deploy from `master`; migration
   `migrate_add_role_challenge_runs.py` is additive).
3. Smoke production: `GET /api/role-challenges/catalog` returns `role_challenge_catalog.v2` with 173
   champions per role.
4. Mark frontend PR #18 ready and merge it.

The canonical acceptance script stays in the backend for future reruns:
`scripts/role_challenge_canonical_acceptance.ps1 -CanonicalDb <lol_calc.db> -WorkDir <scratch>`.

## Re-running the live acceptance locally

```bash
export RC_BACKEND_WORKTREE=<backend checkout at the candidate> RC_RIG_DATA=<scratch dir outside repos>
python e2e/role-challenge-real-backend/rig/setup_db.py --wipe
python e2e/role-challenge-real-backend/rig/serve.py &          # :8190, lifespan off, scratch DB only
VITE_COMBAT_API_URL=http://127.0.0.1:8190 VITE_E2E_AUTH=1 VITE_SUPABASE_URL=http://127.0.0.1:1 \
  VITE_SUPABASE_PUBLISHABLE_KEY=dummy npx vite --host 127.0.0.1 --port 8151 &
RC_PYTHON=python node e2e/role-challenge-real-backend/acceptance.mjs --out ./rc-acceptance
```
