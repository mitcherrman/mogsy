# UX3C — Worlds rollback deep-link protection

Branch `ux3c/worlds-rollback-links`, base `origin/main` `fe2c3503` (contains `7be45341`). Not merged, not activated, not published.

## Problem
UX3B limitation L2: with `VITE_WORLDS_EXPERIENCE_ENABLED` off, no `worlds-2026/*` route is registered, so shared `/stages/*`, `/teams` and `/schedule?…` links land on the 404 page.

## Change (2 source files)
- `productionGate.ts`: `WORLDS_ROLLBACK_SCREEN_PATHS` — `/stages/play-in`, `/stages/swiss`, `/stages/knockouts`, `/teams`, `/schedule` under the Worlds base.
- `App.tsx`: the flag-off branch of the existing `isWorldsExperienceEnabled()` ternary maps those paths to `<Navigate to={WORLDS_EXPERIENCE_BASE} replace />` (was `null`).

Explicit paths, not a splat: `worlds-2026/*` also matches the base URL and would loop. The base URL still resolves to the published `ProPlayTournament`. The flag-on branch is unchanged (no extra redirects or remounts). Query strings are dropped by the redirect (target is the bare canonical URL).

Not redirected, still 404: `/discover`, `/stages`, `/stages/knockout` (singular, UX3B L1), `/stages/<anything else>`, `/teams/<x>`, other contexts' sub-paths (DCGI). `/lol/dev/worlds-experience` stays dev-only.

## Tests
- `App.ux3aRoutes.test.ts`: flag-on ranking unchanged; new flag-off route-ranking test (base never matches a redirect, listed paths do, unknowns/DCGI hit `*`); structural regex for the redirect branch. Replaced the old assertion that `/teams` matched `*`.
- `ProPlayTournamentExperience.test.tsx`: test app routes mirror App.tsx; replaced the "screen paths 404" test with redirect tests (all stages, teams, schedule, `?match=`), Back-after-redirect leaves the page (no loop), canonical URL not redirected, unknown paths and DCGI still 404. Flag-on suites (four workspaces, deep links) pass unchanged.
- Results: 3 UX3A suites, 53/53 (`App.ux3aRoutes`, `ProPlayTournamentExperience`, `featuredSwitchUx3a`).
- `tsc -p tsconfig.app.json`: 2 errors (`OnboardingProfile.tsx`, `identity/connections.ts`), identical on the unmodified base. ESLint on touched files: 0 errors; 1 pre-existing `App.tsx:426` warning.
- Production builds (vite, flag unset and `true`) both succeed. The experience chunk (`ProductionExperience-*.js`) is emitted in both as a lazy chunk, as before; it is only requested when the flag-on route renders.

## Browser evidence (local production builds, real browser)
Flag OFF: `/schedule?match=abc` → `/lol/pro-play/tournament/worlds-2026`, TournamentV2 rendered, history length 2 (replace). `/stages/swiss` → canonical. `/discover` → 404 page.
Flag ON: `/schedule?stage=swiss` stays put with its query, title "Schedule — Worlds 2026"; `/stages/knockouts` renders the Knockouts screen, no redirect.

## Activation implications
None by itself: ship with the flag off (current prod) and nothing visible changes except that screen links now land on the canonical page instead of 404. On a later enable, redirects disappear and screens render. On rollback, shared links degrade to the canonical page; indexed screen canonicals still drop out of search. Requires a Lovable Publish like any FE change.

## Risks
- Query selection (`?match=`, `?team=`) is lost on rollback by design.
- Tests mirror App.tsx's route block; a structural regex test pins the real file.
- Test tooling used the esbuild-JSX/rollup-wasm workaround (shared swc/rollup native blocked); the repo's own build chain was not run.
