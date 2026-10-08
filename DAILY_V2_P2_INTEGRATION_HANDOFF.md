# DV2-P2-INTEGRATION — frontend Daily V2 integration candidate

Date: 2026-10-08 · Frontend only · integration branch `dv2/p2-integration`, **not merged to main, not published (Lovable)**. Backend untouched.

## 1. Objective

One reviewable frontend branch, based on current frontend `main`, containing the complete reviewed **P2A/P2A.1** (live Daily hierarchy) and **P2B/P2B.1** (History main Daily) work. No behavioural redesign, no backend change. Output is an integration candidate for command-center review.

## 2. Verified source SHAs (fetched, checked before any work)

| Ref | SHA |
|---|---|
| Frontend `origin/main` (integration base) | `c08882f6982c6eca80431e00051f3af466397f12` |
| `origin/dv2/p2a-live-hierarchy` | `32500ed12934eaffb3c04d0c907cd159c6d85c9d` |
| `origin/dv2/p2b-history-main` | `e84545163105c65b98bf82650b54c0445777947c` |
| Backend `origin/master` (read only) | `f3a164f15ef440530000cd50db68eb9f986974b1` |
| Backend reviewed stack `origin/dv2/b2-main-history` (read only) | `ec3500d0f396b10381e9294269b09a40cf03d7e5` |

No drift. Both feature branches descend from `d528bf9f`; they and `main` share that merge-base.

## 3. Method

Fresh worktree `C:\Users\mlmit\mogzy-wt\dv2-p2-integration` from exact `origin/main`; branch `dv2/p2-integration`. Explicit non-fast-forward merges, histories preserved, nothing squashed or rewritten:

1. `git merge --no-ff origin/dv2/p2a-live-hierarchy` → `3e6b324a` (parents `c08882f6`, `32500ed1`).
2. `git merge --no-ff origin/dv2/p2b-history-main` → **`6e1be97e`** (parents `3e6b324a`, `e8454516`).

**No merge conflict occurred.** File-overlap precheck re-verified independently from `d528bf9f`: main-drift ∩ P2A = 0, main-drift ∩ P2B = 0, P2A ∩ P2B = 0 (main drift: 6 files; P2A: 25; P2B: 7).

Provenance:
- Integration code SHA (second merge): `6e1be97e8d5502a66dbddfa6ed64c7600145de6d`.
- Changed files vs `c08882f6`: **32** at `6e1be97e` (25 + 7); **33** on the branch tip, which adds this handoff in a doc-only commit.
- Byte-equivalence: every file either feature branch touches is identical at `6e1be97e` to that branch's version. No integration-authored code.

Frozen branches `dv2/p2a-live-hierarchy` / `dv2/p2b-history-main` untouched. Only `dv2/p2-integration` is pushed.

## 4. Combined-risk audit (source read, before testing)

| Check | Result |
|---|---|
| Live main-complete and History main-complete share one score authority | **Yes.** Backend: live `main_score` (`service.snapshot`) and History `main.daily_score` (`history/daily.py:114`, `row.get("main_score")`) read the same frozen `daily_runs.main_score` column (`ec3500d0`). |
| Hub main-complete vs History active-parent | Consistent. Hub: `completed` + `resumable` + `optionalOpen` ("Today's Daily Complete"). History: `main` + `parent.status=active` + "Optional challenges still open / were left open". Same fact, two surfaces. |
| Anything assumes `completed` ⊕ `resumable` | No. `status.ts` documents both-true; the only consumer (`PlayScrollRecord`) branches on `optionalOpen` first. `resumable` has no other non-test reader. |
| Anything assumes `stageCount === stages.length` | No. Only reader is `DailyOverview.tsx:148` (`cur?.stageCount ?? record.stages.length`, a previous-Daily composition note), which is not reached for an open parent (Overview withheld). |
| Old path renders aggregate `basic.score` as headline for a `main` record | No. Only `dailyHeadline.ts:39` reads `record.basic` for score, and only when `main === null`. No other `basic.score` read at record level. |
| V4 payload activating V5 presentation | No. Live: every consumer gates on `hasMainDaily` = `plan_version >= 5` only. History: gates on wire `main` (absent/null → legacy). Verified by the V4 smoke (§6). |
| P2A.1 launch latch survived | Yes — files byte-identical to `32500ed1`; `dailyV2P2A1.launchRace` 13/13 pass on the merge. |
| Cross-slice shared imports | History imports only `DAILY_STAGE_KINDS` from the live contracts; P2A did not change it. |

**Combined defects found: none.** No integration-side code was written.

## 5. Verification

Whole-repo `vitest run` is not usable here: it crashes on this machine with a worker V8 heap OOM (`Ineffective mark-compacts near heap limit`, ~4 GB) before writing results. The scoped differential below follows what P2A/P2B each used, widened to cover both slices, the Hub, the Daily boundary, navigation and the `main` drift.

Scope (identical on both trees, `--maxWorkers=4`): `src/pages/quiz-daily-challenge`, `src/lib/daily-challenge`, `src/components/quiz/play-scroll`, `src/components/ranked-arena`, `src/pages/Quiz.playScroll.test.tsx`, `src/pages/Quiz.hub.test.tsx`, `src/components/quiz/workspace`, `src/lib/history`, `src/pages/dev/lobby-preview`, `src/components/quiz/LeaguecraftHub*`, `src/lib/navigation`, `src/pages/quiz-mastery`, `src/App.{routing-contract,routeGuards,dataRouter}`.

| | files | tests | passed | failed |
|---|---|---|---|---|
| baseline `c08882f6` (detached worktree `dv2-p2-base`) | 91 | 1679 | 1648 | 31 |
| integration `6e1be97e` | 95 | 1782 | 1751 | 31 |

- **Failing node IDs are identical** (31 = 31, sorted and diffed).
- Passed-on-base-but-not-on-integration: 3, all in `dailyV2P0.compat.test.tsx` section F. P2A deliberately renamed these pins ("nothing reads the main fields yet" → "a legacy run never gets main-complete behaviour"); the file is 33 tests on both and all pass.
- +4 files, +103 tests, all new passing: `dailyV2P2A.hierarchy` 45, `dailyV2P2A1.launchRace` 13, `contracts.dv2p2b` 27, `DailyHistory.dv2p2b` 16, `RankedPlayScroll` +2.
- Gates on the merge, all green: `dailyV2P2A.hierarchy` 45/45, `dailyV2P2A1.launchRace` 13/13, `dailyV2P0.compat` 33/33, `contracts.dv2p2b` 27/27, `DailyHistory.dv2p2b` 16/16, `Quiz.playScroll` 15/15, `RankedPlayScroll` 152/152, `DailyRunPage.navigation` 7/7.
- `Quiz.hub.test.tsx`: 29 pass / 1 fail, the same single failure on `c08882f6` (§7).
- `DailyOnCanonicalArena.boundary` failure messages are identical to baseline except for paths, line numbers and list sizes (19→20, 16→17): that is `DailyMainResult.tsx` newly registered in both lists by P2A, as its handoff says.

Static / build:
- `tsc -p tsconfig.app.json --noEmit`: the same 2 errors on baseline and integration, byte-identical (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`).
- ESLint on all 29 changed `.ts/.tsx` files: 0 errors, 1 warning (`PlayScrollRecord.tsx:90` react-refresh), identical on baseline.
- `git diff --check c08882f6 HEAD`: clean (also with `core.whitespace=cr-at-eol`).
- `vite build`: success (20.8 s); only the usual chunk-size advisory. (`pnpm build`'s prerender scripts were not run.)

## 6. V4 compatibility smoke (production payload) — 11/11 pass

Production is `plan_version: 4`: the Daily snapshot has **no** `main_completed_at` / `main_score` keys and History records have **no** `main` / `parent`. A throwaway test drove that shape through the combined frontend. It is not committed, so the integration stays byte-equivalent; a copy is kept at `C:\Users\mlmit\mogzy-wt\dv2-p2-integration-smoke\zzV4ProductionSmoke.test.tsx` (drop it into `src/pages/quiz-daily-challenge/run/` to re-run).

- **Daily reader** (the real `httpDailyRunTransport` over a stubbed `fetch`): v4 run with the keys absent, with explicit nulls, and a v4 run with Standard completed → legacy, `hasMainDaily` / `isMainDailyComplete` false, `mainScore` null. No run today → null.
- **Hub status** (`dailyStatusFrom`, plus `readDailyStatus` over the real client): active v4 with Standard done → `completed:false, resumable:true, optionalOpen:false, resolved:1, total:5`; completed v4 → `completed:true, resumable:false`.
- **Live Daily** — the worst case, v5-shaped stage kinds (Standard, TT, Survival, Weak Areas, Review) at `plan_version: 4`, played end to end: "5 stages today" + numbered ladder, "Stage 1 of 5", Standard is just a stage (no main result, no Done for now, no V5 copy anywhere), whole-run leave guard on for every stage, "See today's results", "Daily Challenge Complete", no sectioned recap. Leave guard + copy for a v4 run with Standard done = legacy ("Exit Daily Challenge?").
- **History reader + UI**: today's golden production page (no `main`/`parent`) and a B2-backend page serving v4 days (`main:null`, `parent: completed`) both render every row from `record.basic`, with no `data-headline`, no optional-activities note, Run analysis toggle present.

Conclusion: the combined frontend is safe to publish **before** the backend cutover.

## 7. Inherited failures (identical node IDs on baseline `c08882f6`; not touched)

31 total: `QuestionTimeline.test.tsx` ×14 (popover timeouts); `QuestionStageGeometry.test.tsx` ×4; `AnswerGrid.elimination.test.tsx` ×2; `CanonicalArena.boundary.test.tsx` ×1; `DailyOnCanonicalArena.boundary.test.tsx` ×2 (stale lists); `playModeCard.styles.test.ts` ×2; `App.routing-contract.test.ts` ×2 (retired multiplayer routes); `App.routeGuards.test.ts` ×1; `useSafeTemporalBack.test.tsx` ×1; `Quiz.hub.test.tsx` ×1 ("one h1 — the centre scroll's wordmark"); `syntheticRankedHistory.test.ts` ×1.

`QuestionStageGeometry`, `AnswerGrid.elimination`, `CanonicalArena.boundary`, `App.routing-contract`, `App.routeGuards` and `Quiz.hub` were outside the earlier slices' differential scopes; this is their first recorded baseline on current `main`.

## 8. Known deferred issues (unchanged by integration; from the slice handoffs)

- History Overview "This Daily" (Premium `DailyOverview`, Free `FreeDailyFacts`) still shows the backend's whole-run `basic` correct / accuracy. For a **completed v5** row the headline (Standard's own C/A) and the expanded "This Daily" figures can therefore differ. They are run-analysis figures, not the headline, and neither is a score. A later pass may label them "all activities".
- A past day's open parent stays `active` forever (no skip-extras); History says "were left open", the lifecycle is a backend/owner decision.
- Guest save prompt at main completion (P2A §12): owner decision, deferred.
- Backend Review content title is "Review" under the "RECENTLY MISSED" tag (`_TITLES`).
- Client UTC clock skew can show "still open" vs "were left open" for a few minutes around UTC midnight.
- Order Forge, skip-extras, streaks, leaderboard, personal best: out of scope.
- Whole-repo `vitest run` OOMs a worker on this machine (pre-existing; not investigated).

## 9. Result

**READY** for command-center review. Nothing merged, published or deployed.

## 10. Next deployment sequence (after command-center approval)

1. Integration `dv2/p2-integration` → frontend `main` (merge as-is).
2. Lovable publish.
3. Verify the published bundle against **production V4**: `/api/daily-run/today` parses; hub and Daily unchanged; History unchanged.
4. Backend stack `ec3500d0` (B1 + B2 + B1.1) → backend `master`; Railway deploys on push.
5. Live V5 verification: one run end to end (main result → Done for now → hub "Today's Daily Complete" → resume → optional entry → finish → "All Done for Today"), then the History row (headline = `main.daily_score`, open-parent note, no Overview until the parent completes).

Rollback: backend first (re-pin `master` to `f3a164f1`); the frontend is inert against V4, so it stays.
