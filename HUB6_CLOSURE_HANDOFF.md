# HUB6.4C — Closure handoff

Date: 2026-09-28. Scope: certify the published HUB6 frontend, land docs, retire superseded HUB6 branches/worktrees. No runtime change was made.

**Status:** HUB6 is live in production on both tiers. Two owner-side verifications could not be run from this session (authenticated History smoke, first scheduled cron run); see §7.

## 1. Objective delivered

One History surface in the Ranked Hub: collapsed Daily rows → one Daily expands in place → every stage row stays visible → selecting a stage enriches that same row (question/module rail, outcomes, historical public-category micro-stats, current facts, previous-stage comparison) → deeper Premium analytics below → question Popover (desktop) / Sheet (touch). No separate Daily page, no Stage Focus screen, no duplicate navigator.

## 2. Production lineage

| | SHA | Evidence |
|---|---|---|
| Backend `origin/master` (runtime) | `26ef8829` | `/api/health` 200; `/api/history/v1` no-auth 401 |
| Frontend runtime | `660dbfce` | see §3 |
| Frontend `origin/main` | `27f1420a` → this closure commit | docs-only on top of `660dbfce` |

## 3. Publish verification (mogzy.lol)

- Entry bundle changed from `index-BMVTPSSE.js` (pre-HUB6, recorded in HUB6.4B) to **`index-Bb_yS2LU.js`**.
- `Quiz-kr8e78Jy.js` contains strings that exist only in `660dbfce`: "isn't used for records because Review", "Chosen from your results before this Daily started", "Core longest streak", plus `api/history/v1`, `aggregate_not_built`, "strikes used".
- The pre-`660dbfce` copy "a higher total can mean" is absent.
- Runtime: `/quiz#review` is rewritten to `#history` (HUB6-only redirect).

## 4. Production smoke (guest, built-in browser)

| Check | Result |
|---|---|
| Site, Ranked Hub | load |
| History surface | renders; guest reads "Sign in to save and review your study record" |
| `#review` → `#history` | yes |
| `/api/history/v1` as guest | not requested (correct: GET never mints) |
| Console | only pre-existing guest 401s (`ranked/role`, `ranked/progression`, `ranked/history`, `daily-run/today`); no History/parser errors |

Expanded Daily, stage selection, micro-stats, comparison, Standard/Time Trial/Survival/Review/Weak Areas rooms, Popover/Sheet, Free/Premium and population states **were not exercised on production**: they require an authenticated session with History, and none was available (built-in browser has no session; Claude in Chrome was not connected). Those behaviours are certified by the HUB6.4B integrated-build probe (81 shots, desktop/mobile/200% text, Free/Premium, not-built/insufficient) and 628/628 focused tests, on code identical to what is now live.

## 5. Behaviour reference (unchanged, see HUB6.4B)

- **Free:** rows, rails, outcomes, exact question inspection, factual score/count/accuracy, stage streak, Time Trial Questions played, Survival depth, strikes used, strike markers. No topic %, comparison, series, records or population room (server-gated: `analytics: null`).
- **Premium:** all of the above plus micro-stats, comparison, records, series, population.
- **Core Daily** = Standard + Time Trial + Survival (excludes Weak Areas, Review): "Core accuracy / Core correct / Core longest streak". Score note: "Daily score isn't used for records because Review can add points after missed questions."
- Survival null `max_strikes`: "N strikes used", no plates, no guessed 3.
- Population: no percentile/median/player count unless `available`.

## 6. Tests and certification inherited from HUB6.4B

Full suite 11,308 tests / 76 failures vs baseline 10,910 / 77 (74 identical IDs, 2 load-timeouts pass isolated); focused 628/628; typecheck and lint baseline-equivalent; build passes; responsive probe clean. Not re-run: no runtime code changed after `660dbfce`.

## 7. Outstanding owner verifications

1. **Authenticated History smoke** on mogzy.lol with a real Premium account (expand a Daily, select Standard/Time Trial/Survival, open a question, check population state) and one Free account. Also the pragmatic production-performance check (open Overview / Time Trial, hover, lock).
2. **Population cron first scheduled run** (`history-population-cron`, `30 0 * * *` UTC, first run 2026-09-28 00:30 UTC). The Railway CLI would not execute in this session. Check:
   ```powershell
   cd C:\Users\mlmit\OneDrive\Desktop\League_Combat_Simulator; railway logs --service history-population-cron
   ```
   Expect a `run_id`, final status `ok`, no `running`/`interrupted` orphan. 0 observations remains correct unless compatible post-`26ef8829` Dailies were completed before the run.

## 8. Migrations and cron

History migrations run in the `web` lifespan (applied at `26ef8829`). Durable refresh run table live. First manual refresh `hpr_1172b441ffe111ca2d68b389`: `ok`, 3 dates built, 0 observations, 0 aggregates (expected: pre-HUB2.4 Dailies lack frozen compatibility keys).

## 9. Docs

- Frontend `27f1420a` (HUB6.4B handoff): pushed to `origin/main` (docs only; no publish needed).
- Backend `85a0a13e` (deploy/cron handoff + `railway_watch_paths.json` record): **not pushed to master**. `web` has `watchPatterns: []` and both crons watch `railway_watch_paths.json`, so a push would rebuild every service for paperwork. Preserved on **`origin/claude/hub6-backend-integration`**. Land it with the next real backend change.
- `HUB6_3_ANALYTICS_BLUEPRINT.md` (never committed; found untracked in the 3D worktree) is preserved in this commit.

## 10. Cleanup

Removed (all fully contained in `origin/main` / patch-equivalent to `origin/master`):
- Frontend worktrees `hub6-final`, `hub6-premium-v2`, `hub6-visuals`, `hub6-prod-int`, `hub63f-a`, `hub63f-b`, `hub6-premium`; branches `hub6/premium-analytics-final`, `hub6/premium-analytics-v2`, `hub6/ranked-hub-visuals`, `hub6/history-production-integration`.
- Backend worktrees `hub6-3-personal`, `hub6-3-population`; branches `claude/hub6-3-personal-analytics`, `claude/hub6-3-population`, `claude/hub6-backend-integration-on-35450a27`.
- HUB6 dev-server launch entries. The :5201 dev server was already stopped.

Retained:
- `hub6/rollback-main-pre-hub6` → `3011a416` (frontend rollback).
- `hub6/premium-analytics` (v1 candidate, 5 unmerged commits; rejected design, kept as evidence).
- Backend `claude/hub6-backend-integration` (docs `85a0a13e`, local + origin); rollback `fe942a58` is an ancestor of `origin/master` and tagged `hub6/rollback-master-pre-hub6`.
- `codex/history-analytics-a/b`, `claude/history-production-reland` and all non-HUB6 worktrees (not HUB6-owned or have unique commits).

## 11. Known non-blockers

Population insufficient / not built until ≥100 compatible users per cohort; some questions show "General"; 320px @ 200% collapsed-row ~3px clip; baseline-equivalent test failures; AuthProvider harness gap in `LobbyPreviewPage.test`; dev-mode open-time variance.

## 12. Rollback

Frontend: `git revert --no-edit 660dbfce; git revert --no-edit -m 1 2ce5fb43` on `main`, push, publish (tree returns to `3011a416`). Backend: `fe942a58`.

## 13. Next workstream

HUB6.5 as planned by the owner, after §7 is ticked.
