# 2026-10-19 — Ranked pause / Combat beta / Daily Journey audit

## Objective
Temporarily disable public Ranked entry in the Quiz Hub while keeping existing records and other modes available. Label Combat Simulation BETA on both desktop and mobile Academy Home Hub. Investigate repeated Daily Challenge Pantheon vs Leona Mastery Journey.

## Frontend changes (review branch only)
- `src/components/FeatureRibbon.tsx`: manually placed diagonal BETA / COMING SOON ribbons; no automatic registry.
- `AcademyHubBook.tsx` and `MobileAcademyBookStack.tsx`: Combat Simulation BETA overlay, links remain functional.
- `RankedLobbyHero.tsx`: COMING SOON over Ranked tab; Ranked PLAY seal disabled; match availability badge hidden; selectable Ranked page, other modes intact.
- `LeaguecraftHub.tsx`: `PUBLIC_RANKED_COMING_SOON=true` default only for Quiz Hub; prevents match-entry scroll even for arrival deep links; customizable prop for legacy fixture tests.
- Tests updated in `LeaguecraftHub.playCommit.test.tsx`, `RankedLobbyHero.test.tsx`, `LolHub.test.tsx`.

## Daily findings
- Backend source: `daily_challenge/recipe.py` Standard module 10 selects ONE deterministic daily Journey, no reselection per player or retry.
- `content_sets/products.py` uses a date-seed/canonical-catalog-digest hash permutation of featured recipes; first composable recipe wins.
- `mastery/setup_state/data/journey_recipes.v1.json` has **five** `featured_launch` entries, including `support.pantheon_vs_leona`; many other catalog recipes are not eligible for Standard Daily.
- Historic `JOURNEY3_DAILY_HANDOFF.md` explicitly identifies thin variety at five featured recipes.
- Live production readiness and actual multi-day selected IDs have **not yet been measured**, so a deterministic repetition is plausible but a stuck selector isn't proven.
- Next: run read-only per-date readiness/selection audit on Railway production via existing operator mechanism, assess if catalog viability prevents rotation; preserve already-frozen Daily runs and do not mutate records.

## Safety/state
- Source base: GitHub frontend main `e2fee510bf0f467f194458c6fbda9ca7dad120c9`; Lovable aligned at that SHA on initial inspection.
- All changes on branch `ui/ranked-coming-soon-combat-beta-20261019`; no production deployment, backend writes, or merges.
- Browser safety: `AGENTS.md` prohibits local automated installed Chrome/Edge; use CI runner for visual acceptance.
- Tests/CI: not executed yet. Review `Quiz.hub.test.tsx` and any tests relying on Ranked default open, run frontend test suite in safe environment.
- Note: direct `/quiz/ranked` and backend queue API are not disabled by the Quiz Hub presentation change; if a global pause is intended use existing server-authoritative owner queue policy, only after separate approval.

## Next task
Run tests/CI, fix visual or test regressions, complete read-only production Daily rotation audit, then seek owner approval before merge/deploy.


## 2026-10-19 deeper investigation: three consecutive Pantheon vs Leona days
The owner reports three consecutive days of the Pantheon vs Leona Mastery Journey.

- Railway `sweet-analysis` production `web` service is running backend `e53364ee` (deployed 2026-10-18). Historical backend deployments 2026-10-16/17/18 have **identical blob SHA** for the Journey catalog, `content_sets/products.py` and `daily_challenge/run/plan.py`.
- Reconstructed the catalog semantic SHA-256 digest and exact `journey_rotation` ordering using the current backend and JSON catalog. Current catalog digest: `jrecipe_b734f6d0d389499dec1ca168`; 5 featured entries.
- Calculated Standard first-choice ordering (UTC, plan v5), assuming candidates compose:
  - 2026-10-17: Lucian/Caitlyn → Zed/Ahri → Olaf/Sett → Volibear/Lee Sin → **Pantheon/Leona (5th)**.
  - 2026-10-18: Volibear/Lee Sin → Lucian/Caitlyn → Olaf/Sett → **Pantheon/Leona (4th)** → Zed/Ahri.
  - 2026-10-19: **Pantheon/Leona (1st)** → Zed/Ahri → Olaf/Sett → Lucian/Caitlyn → Volibear/Lee Sin.
- Thus if the owner observed Pantheon on 17–19 and these were v5 Standard runs, the first four 17th candidates and first three 18th candidates **must have failed the live composition gate**, or the serving path/frozen plan did not follow this algorithm. Do NOT dismiss as mere small-pool coincidence.
- `JOURNEY4_CATALOG_HANDOFF.md` reported all five READY on the *Sept 25 canonical DB*, which is not proof that all five remain READY with the current production SQLite.
- Railway deployment logs include no structured readiness verdicts or selected recipe ids; direct production SQLite execution is not exposed by currently connected Railway tool actions. Do not claim live readiness verified.
- Built-in read-only operator script exists in backend: `daily_standard_readiness_report.py [db_path] [plan_date]`. It prints each candidate's READY/blocked reason and selected module 10. Run on live canonical `/data/lol_calc.db`, with `LOL_CALC_DB_PATH=/data/lol_calc.db`, for 17, 18 and 19. Script only selects / computes; no mutations intended. Ensure no other environment than production web is targeted.
- Verified official Railway CLI syntax from docs: `railway ssh -p <project> -s web -e production -- env ... python /app/daily_standard_readiness_report.py /data/lol_calc.db <date>`. Actual Railway project id: `78e5414c-a771-4df7-9e98-9185c461c9aa`.

**Decision gate:** Do NOT force another recipe until its live readiness is confirmed. If other recipes are READY, investigate plan version/frozen snapshot and code before adding anti-repeat/round-robin constraints. If only Pantheon is READY, fix blocked recipe inputs first; hard-coding a different matchup risks a Daily launch 503. Any change must preserve existing frozen day runs and date-wide reproducibility; stage an owner-reviewed backend PR, never mutate production silently.
