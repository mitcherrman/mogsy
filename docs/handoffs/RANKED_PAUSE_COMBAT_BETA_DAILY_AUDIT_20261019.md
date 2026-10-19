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
