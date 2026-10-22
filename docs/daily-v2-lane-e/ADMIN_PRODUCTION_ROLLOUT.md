# Daily V2 — Admin-only production rollout (lane E, 2026-10-22)

The owner authorized an **Admin-only** production rollout of Three Acts Daily
V2 into the existing mogzy.lol app. Public players stay on Classic V1. This
file is the shared handoff: branches, PRs, tests, the owner's dashboard steps,
and production verification.

## 1. What ships

| repo | branch | head | base |
|---|---|---|---|
| backend `League_Combat_Simulator` | `daily-v2/e-admin-release` | §8 | master `df5b7ebd` (merged in `cf5fef1a`) |
| frontend `mogsy` | `daily-v2/e-admin-release` | §8 | main `f902f5c4` (merged in `1d01ffa7`) |

**Backend.**
* Lane B/C/E three-act composer, eligibility, V2 exact-ref index, launch
  route and Review policy (all verified in passes 1–8). None of it is wired
  into official runs.
* **New: the public Daily format.**
  * `daily_public_format_changes` is an append-only change log; triggers
    refuse UPDATE and DELETE.
  * `daily_run_formats` freezes every new run's format.
  * Owner-only `GET`/`POST /api/daily-run/admin/public-format`.
  * The server enforces the rules: a future UTC day only, an exact
    `<format>@<date>` confirmation, and a reason.
  * Three Acts V2 is refused with `PUBLIC_V2_NOT_RELEASED`: this release
    cannot serve official three-act runs.
  * Official runs record the format in force. They fail safe to V1 even if a
    V2 row were forced in.
* `GET /api/daily-run/admin/three-acts/status` now also reports
  `owner_takes_enabled` and `certification_scope`.
* **PR #46 (MISC-W1A) is reverted on this branch** (`f748d72a`). It changes
  public V1 (per-child Journey clocks, Vision cap) and is not on master.
  Public V1 therefore stays exactly master's.
* **DREP1 (PR #68) is preserved.** It is on master and was approved to stay.
  * An earlier revision of this branch reverted it (`b6532cb3`). That revert
    was not part of the authorized Admin-only V2 scope.
  * Review caught it, and `ddb72607` reverts the revert, so DREP1's serving
    rules, repeat-audit workflow, scripts, tests and docs are all back.
  * Every file DREP1 touched now equals master, except
    `daily_challenge/wiring.py`, which adds only lane E's three-act branch on
    top of master's.
* The final diff against master deletes no files. The modified shared files
  are all branch-on-top changes that keep the V1 path:
  * `review.py`, `service.py`: V1 Review still calls `allocate_review`;
  * `wiring.py`: V1 Standard still uses `_standard_shape`, DREP1 avoidance is
    intact;
  * `shared_bank.py`: the separate `EXACT_REF_POOLS` registry; `POOLS` is
    unchanged for V1;
  * `refs.py`, `exact_ref.py`: a V2 index is consulted only after the
    canonical index misses.
* No schema change to existing tables; two new tables only. No data import.

**Frontend.**
* Creator Replay (`/admin/creator-replay`, linked from Admin → Leaguecraft)
  has a **Daily format** choice: Classic Daily V1 (Journey picker, as before)
  or Three Acts Daily V2.
  * The V2 card reads the server's owner flag and content scope.
  * The launch button is disabled while the flag is off.
  * The choice is remembered per browser.
* Platform Policies (`/admin/platform-policies`) has a **Public Daily
  format** panel. It shows:
  * what public players get today, and today's official runs by format;
  * scheduled changes;
  * the change log;
  * a future-day change form: format, UTC day, reason, typed confirmation.
  
  V2 is shown as not publishable, and the server refuses it anyway.
* Lane A/D/E arena and Daily presentation work from passes 1–8. Some of it is
  shared with public play and visible to all players:
  * Meta Reflex settled-card values and timeouts shown as "unanswered";
  * the final-card verdict hold;
  * quiz reveal and ruleset-end fixes;
  * the scenario-badge fix.
  
  These are display corrections the owner reviewed in the playtests. Public
  question selection, scoring and timing are unchanged.
* The local playtest harness (which mints test tokens) is **not** on this
  branch (`4c5b8f13`). It stays on `daily-v2/e-integration` for local use.
  Nothing ships a test persona, credential or scratch database.

## 2. Safety checks (all local; GitHub Actions is billing-blocked)

**Owner-only, fail-closed.**
* Every format endpoint (`public-format` GET and POST, `three-acts` POST,
  `three-acts/status`, `creator`) answers 401/403 to a non-owner and creates
  nothing (`test_daily_public_format.py`).
* `DAILY_THREE_ACTS_V2` unset, empty, `on`, `true` or `public` → V2 takes 404.

**Isolation.**
* A full V2 take (Standard, bonus stages, Review) moves no
  `ranked_rating_events`, `ranked_ratings` or `analytics_outbox` rows.
* Every child is `creator_replay` with `rating_eligible=False`.
* The official run is untouched, and history never lists the take.
* Another player's official run that day is Classic V1.

**Public V1 unchanged.**
* `daily_challenge/recipe.py` is identical to master.
* Official Standard compositions are the ten-module V1 with master's pooled
  150 s Journey clock (`test_dcv2_e_compat.py`).

**Production supply without the scratch DB.**
* Tested on a copy of the canonical database (2026-10-17 snapshot, no
  takedown rows) through the same `readiness()` call the status route uses.
* `serveable` scope: **30/30** days from 2026-10-22 compose.
* `certified` scope: 0/30 (no certified Late-Medium content, as known).
* Golden re-composition: 5 passed.

**Final focused baseline-differential (current heads):** §8.

**Earlier runs (superseded):**
* Against `77c08167`: identical failure sets after the #46 fix.
* Against `b46f1548`, with DREP1 wrongly excluded: identical.

**Frontend baseline-differential.** See §6.

**Local end-to-end** (browser pane, local backend on the playtest copy):
* Creator Replay → V2 reported "Enabled on this server (serveable content
  scope)" and launched a take. The server froze it as `three_acts_v2` /
  `owner_take`, and no public-format row was written.
* The Public Daily format panel showed Classic V1. Choosing V2 shows the
  refusal and disables submit.
* A direct `POST` of V2 returned 409 `PUBLIC_V2_NOT_RELEASED`.
* At 360 px, page width equals the viewport on both pages (no horizontal
  scroll).

## 3. Owner actions (Claude has no Railway access)

### 3a. Merge the PRs

* Backend: <https://github.com/mitcherrman/League_Combat_Simulator/compare/master...daily-v2/e-admin-release?expand=1>
  → base `master`. Title and body: §5.
* Frontend: <https://github.com/mitcherrman/mogsy/compare/main...daily-v2/e-admin-release?expand=1>
  → base `main`. Title and body: §5.

Either order is safe:
* the old frontend never calls the new routes;
* the new frontend shows a plain error on the two new panels until the
  backend is live, and Classic takes keep working.

### 3b. Railway — service `web` (the API at `web-production-83e53.up.railway.app`)

1. **Variables** → add:
   * `DAILY_THREE_ACTS_V2` = `owner`
   * `DAILY_THREE_ACTS_CERT_SCOPE` = `serveable`
   
   Leave `DAILY_THREE_ACTS_CONFIG` unset. Do not add or change anything else.
2. Deploy the **merged master commit**. If `web` does not auto-deploy master,
   open **Deployments** and deploy the latest commit (Ctrl/⌘+K → "Deploy
   Latest Commit").
3. **What else the deploy makes live.** If production is still on
   `59aed696` (my last record; I cannot see Railway), deploying master also
   makes these already-merged PRs live:
   * #78: PatchOps cron 409 readability;
   * #68: DREP1, Daily 7-day question avoidance, approved to ship;
   * #86 / #88: Tournament Arena backend, admin-only, `ARENA_ENABLED` off by
     default.

**Rollback.**
* Instant: set `DAILY_THREE_ACTS_V2` = `off` (or delete it) and redeploy. The
  V2 take route returns 404, and a take whose Standard has not started refuses
  to start.
* Full: redeploy the previous deployment from the Deployments list. The two
  new tables are inert for V1.

### 3c. Lovable — publish the frontend

1. In Lovable, confirm the editor is on `main` at the merge commit. If it shows
   an older or "diverged" SHA, the editor is pinned off `main`: switch it
   back to `main` first.
2. Press **Publish**.

## 4. Production verification (done by Claude after 3a–3c)

| check | before (2026-10-22) | expected after |
|---|---|---|
| `GET /api/daily-run/admin/public-format` (no auth) | 404 | 401/403 (route live, owner-only) |
| `GET /api/daily-run/admin/three-acts/status` (no auth) | 404 | 401/403 |
| `POST /api/daily-run/admin/three-acts` (no auth) | — | 401/403 |
| mogzy.lol JS bundle contains "Public Daily format" and "Daily format for this take" | no | yes |
| Owner: Creator Replay → V2 → status line | — | "Enabled on this server (serveable content scope)." |
| Owner: a V2 take launches and completes | — | yes, unofficial |
| Owner: Platform Policies → Public Daily format | — | Classic Daily V1 today; V2 not publishable |
| Public `/api/daily-run/today` behaviour | V1 | V1 (unchanged) |

Production results: §7.

## 5. PR texts

### Backend PR — "Daily V2: Admin-only three-act takes + public Daily format setting (V1 stays public)"

```
Admin-only production rollout of Three Acts Daily V2 (owner-authorized).
Public players stay on Classic V1.

What ships
- Lane B/C/E three-act composer, eligibility policy, V2 exact-ref index,
  owner take route (POST /api/daily-run/admin/three-acts) and V2 Review
  policy. V2 takes are creator takes (creator:three_acts:<nonce>): unrated,
  not history, not learning evidence, not analytics. Behind
  DAILY_THREE_ACTS_V2=owner (default off -> 404).
- Public Daily format: append-only daily_public_format_changes (triggers
  refuse UPDATE/DELETE) + daily_run_formats frozen with every run. Owner-only
  GET/POST /api/daily-run/admin/public-format: future UTC day only, exact
  <format>@<date> confirmation, reason. Three Acts V2 refused
  (PUBLIC_V2_NOT_RELEASED): official three-act runs are not served by this
  release. Official runs fail safe to V1.
- three-acts/status reports owner_takes_enabled + certification_scope.
- PR #46 (MISC-W1A) is REVERTED here (f748d72a): it changes public V1 and is
  not on master. daily_challenge/recipe.py == master.
- DREP1 (PR #68) is PRESERVED: an earlier revision wrongly reverted it
  (b6532cb3); ddb72607 restores it. Every DREP1 file == master except
  wiring.py, which only adds the three-act branch.
- Reconciled with master df5b7ebd (cf5fef1a). No file deleted vs master.

Safety
- New tables only; no change to existing tables; no data import.
- test_daily_public_format.py (18): owner-only on every endpoint, fail-closed
  flag, append-only log, future-day rule, V2 refusal, V1 fail-safe, full V2
  take moves no rating/analytics rows, other players get V1.
- Focused baseline-differential vs master df5b7ebd (V1 Daily, DREP1, V2,
  admin authorization, official-run isolation): base 361 failed / head
  361 failed, failure sets identical (371 lines). DREP1 + V2 + admin
  suites: 73 passed, 1 skipped.
- Canonical DB copy (no takedown rows): serveable 30/30 days compose;
  certified 0/30 (known).

Owner deploy: set DAILY_THREE_ACTS_V2=owner and
DAILY_THREE_ACTS_CERT_SCOPE=serveable on web, deploy master. Rollback: unset
the flag (V2 takes 404). If prod is still on 59aed696 this deploy also ships
#78, #68 (DREP1) and #86/#88 (Arena, flag off). Details: mogsy docs/daily-v2-lane-e/ADMIN_PRODUCTION_ROLLOUT.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### Frontend PR — "Daily V2: Admin format choice in Creator Replay + Public Daily format panel"

```
Admin-only rollout of Three Acts Daily V2 (owner-authorized). Public players
stay on Classic V1.

What ships
- Creator Replay: Daily format choice (Classic Daily V1 / Three Acts Daily
  V2). V2 reads the server's owner flag + scope; launch disabled while off.
- Platform Policies: Public Daily format panel over the backend's owner-only
  schedule (today's format, official runs today, scheduled changes, change
  log, future-UTC-day form with typed confirmation). V2 shown as not
  publishable; the server refuses it regardless.
- Lane A/D/E three-act arena presentation (passes 1-8), plus shared display
  fixes visible to all players: Meta Reflex settled values / timeouts as
  unanswered, final-card verdict hold, quiz reveal + ruleset ends, scenario
  badge in the phone card band.
- The local playtest harness is NOT included (4c5b8f13).

Safety
- New: PublicDailyFormatControl.test.tsx (8): server state shown, V2
  unsubmittable, exact confirmation sent, refusals surfaced, Creator Replay
  never calls the public setting.
- Reconciled with main f902f5c4 (1d01ffa7). No file deleted vs main.
- Focused baseline-differential vs main f902f5c4 (Daily, arena, admin,
  ranked-core): base 19 failed / head 19 failed, failure sets identical.
- tsc: only the 2 pre-existing errors. Build passes.

Order: either; old FE never calls the new routes, new FE shows a plain
error on the two new panels until the backend is live.
Handoff: docs/daily-v2-lane-e/ADMIN_PRODUCTION_ROLLOUT.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## 6. Frontend baseline-differential

Full vitest suite in four chunks, base main `e931bc1a` vs head.

| run | pages | lib | components | rest |
|---|---|---|---|---|
| base | 119 failed / 5,362 passed | 24 / 6,556 | 17 / 4,806 | 22 / 1,626 |
| head | 127 failed / 5,361 passed | 24 / 6,652 | 16 / 4,824 | 23 / 1,625 |

* Nine failures appeared only in head. All five of their files pass in
  isolation on head (211/212), so they were timing flakes: the backend suites
  ran concurrently. The one failure in that isolated run ("Meta Reflex gets
  its own mark") fails in the base run too.
* One failure appears only in base (`rulesScroll.boundary`).
* `tsc -p tsconfig.app.json`: only the 2 pre-existing errors (OnboardingProfile,
  identity/connections).
* `npm run build`: passes.
* The built `dist/` contains no `owner@e2e.test` and no harness strings.
* The new screens are in `AdminPlatformPolicies-*.js` and
  `CreatorReplayPage-*.js`.
* Targeted: the admin tests (`PublicDailyFormatControl`, `CreatorReplayPage`,
  `AdminPlatformPolicies`) pass, except one test that also fails on main.

## 8. Final release state (2026-10-22)

| | backend | frontend |
|---|---|---|
| branch | `daily-v2/e-admin-release` | `daily-v2/e-admin-release` |
| head | `77e5fae5` | the commit adding this section |
| upstream merged | master `df5b7ebd` (`cf5fef1a`), 0 behind | main `f902f5c4` (`1d01ffa7`), 0 behind |
| files deleted vs upstream | none | none |
| PR #46 (public V1 changes) | excluded: `daily_challenge/recipe.py` and #46's tests equal master | — |
| DREP1 (#68) | preserved (`ddb72607`) | — |

**Focused baseline-differential (final heads, same machine, run concurrently).**
* Backend: 80-file V1 Daily/format suite, plus shared-bank, DREP1, lane B/C/E
  and admin-format suites (55 extra files on head, 46 on base).
  * Base master `df5b7ebd`: 361 failed, 2,146 passed, 9 errors.
  * Head: 361 failed, 2,318 passed, 9 errors.
  * Failure sets are **identical** (371 lines).
  * Targeted re-run (DREP1, avoidance, repeat audit, admin format, V2 compat
    and integration): 73 passed, 1 skipped.
* Frontend: `quiz-daily-challenge`, `daily-challenge`, `daily-v2`,
  `ranked-arena`, `ranked-core`, `ranked-public`, `quiz-ranked`, admin pages
  and components.
  * Base main `f902f5c4`: 19 failed / 4,039 passed.
  * Head: 19 failed / 4,159 passed.
  * Failure sets are **identical**.
* Canonical database copy (no takedown rows), final backend head: golden 5
  passed; `serveable` 30/30 days compose, `certified` 0/30.

## 7. Production status

Not merged, not deployed, not verified. Waiting for §3.
