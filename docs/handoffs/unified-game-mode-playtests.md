# Unified Game Mode Playtests (UGMP)

> Taking over? Read this file first, then §9 "Next exact action".

## 1. Objective

One owner-only place to play every game mode: **Admin → Leaguecraft → Ranked → Playtests**
(`/admin/leaguecraft?section=ranked&view=playtests`). The owner opens it, picks a mode, clicks Play
and plays. There are no separate labs, no local JSON files, and no answers in the browser bundle.

## 2. Commits

| Repo | Branch | Base merged in | Work commits |
|---|---|---|---|
| frontend `mitcherrman/mogsy` | `ugmp/unified-playtests-fe` (worktree `C:/Users/mlmit/mogzy-wt/ugmp-fe`) | `main` `805529a0` (PR #37) | `ac69ea75` hub + hosts + redirects; `d080fb2b` phone stage room, chip contrast, e2e, handoff; merged to `main` as `21a6705b` |
| backend `mitcherrman/League_Combat_Simulator` | `ugmp/unified-playtests-be` (worktree `.worktrees/ugmp-be`) | `master` `b84b17bc` (PR #32) | `65e52f6e` interaction lab + status; `20552ac5` queue-pause reporting; `32b851de` handoff; merged to `master` as `8c1d9b16` |

Production at the start (2026-10-15): frontend `main` `8afb0ea2` (PR #30/#34 were already in it via
`1df306a5`; PR #36 followed). Backend `master` and Railway `web` were both at `9fc8a034`.
During the work, the queue-controls PRs landed (#37 frontend, #32 backend). Both are merged into
the UGMP branches without conflicts.

## 3. Architecture decisions

**One presentation, three honest maturities.** Every mode is one `PlaytestModeCard`: name, a
maturity chip, a description, a Play control, and a reserved status line.

| Chip | Modes | Engine | Grading |
|---|---|---|---|
| Ranked Bot · unrated | Roster Lock, Draft Memory, Chronoscope, Match Grid, Reconstruct, Order Forge | the existing admin-only presets through the ordinary Ranked queue (unchanged) | server-authoritative, unrated |
| Prototype · server-validated | Rangefinder, Glyph Press | new `interaction_lab` backend, original primitives in the real `CanonicalArena` | original prototype rules, now run on the server (exact stop; per-glyph) |
| Experiment · no grading | Stat Drop, Combat Estimate | existing `numeric_lab` backend + NUM-REC2 page | none: the value is released after Lock; blind gut-call CSV export kept |

No mode writes a rating, points, a leaderboard row or a public result. No new Ranked engine or shell
was introduced; the lab modes reuse `CanonicalArena` with a host renderer, as GM-R1 and MIG1 did.

**Availability is the backend's answer.** `GET /api/admin/playtests/status` (require_admin) reports:
* each lab: whether its pack loads and validates, and `NUMERIC_LAB_ENABLED` for the numeric labs;
* each preset: whether it is registered admin-only, whether its format builds, and whether the
  owner's Ranked queue switch is open. PR #32's pause also closes preset launches. That is
  PR #32's rule; it is reported here, not changed.

A lab is not offered while this is loading or when it fails; the card shows the exact reason. A
preset stays launchable unless the backend positively reports it unavailable, because the queue
join is its own authority.

**Rangefinder and Glyph Press moved server-side** (`interaction_lab/`, `routes/admin_interaction_lab.py`):
* The packs are the frontend fixtures, byte-identical (same git blob ids). Tests re-derive them
  from this repo's authorities: all 227 cast ranges against `range_authority.json`, and every
  served Glyph Press answer against `range_authority.json` and the recipe graph. The capture script
  re-run at master `9fc8a034` deep-equals the frozen pool.
* Only the 9 `verified` WP1.1 rounds are served. `shurima` (no authority) is never served.
* A session is dealt server-side, held in process memory, bound to the owner's user id, and
  expires (4 h, at most 64 sessions). Round references are session indexes, because fixture ids
  spell answers (`kaisa`). Stop tokens are random per session.
* The canonical stop or glyphs are never in a pre-Lock payload, as checked by
  `answer_safety.assert_pre_reveal_safe` plus a lab deny-list.
* A round locks once. Repeating the identical lock returns the same reveal; a different one gets 409.
* Soundings and their budget are enforced by the server.
* Clue images stream from an owner-only endpoint (`Cache-Control: private, no-store`), fetched
  with the admin headers into blob URLs. This keeps paths like `Kaisa/icon.png` out of every
  payload.
* A restart (deploy) expires sessions; the page shows "session expired → Start a new session".

**Return path.** Admin presets persist host `playtest`, which the public guided Playtest shares, so
no host can imply the hub. Instead, a hub launch puts `origin: "admin_playtests"` in router state.
`resolveMatchOrigin` accepts that hint only as a refinement of `playtest`. The live back control
then points at Playtests, and the result screen's primary action is "Back to Playtests". After a
reload the hint is gone and the ordinary actions return.

**Phone stage.** With panel rails, the arena stacks on phones and its stage is content-sized. So
`useStageRoom` is circular there, and Rangefinder/Glyph Press collapsed at 360×640.
`useOwnerStageRoom` gives them the room under the stage top below `lg`, with a floor of 380 px.

**Retired labs.** `/admin/interaction-labs[/:lab]` and `/admin/numeric-lab[?mode=]` are redirect-only
routes to the hub or `/admin/playtests/:mode`. The file-loader page is deleted. The registry's two lab
entries are merged into the Playtests entry (`legacyRoutes`). The DEV-only labs (`/dev/rangefinder`,
`/dev/word-puzzle`, `/dev/numeric-lab`) are unchanged.

## 4. Files

Frontend:
* new: `src/lib/playtests/{api,modes}.ts`, `src/pages/admin/ranked/{PlaytestHub,PlaytestModeCard}.tsx`,
  `src/pages/admin/playtests/{OwnerPlaytestPage,RangefinderOwnerPlaytest,GlyphPressOwnerPlaytest,ownerArena,legacyRedirects}.tsx`,
  tests `PlaytestHub.test.tsx`, `OwnerPlaytests.test.tsx`, `matchOrigin.adminPlaytests.test.ts`,
  e2e `unified-playtests-live.spec.ts`
* changed: `App.tsx`, `Layout.tsx`, `admin-registry.ts`, `AdminRankedPage.tsx`, `PresetLaunch.tsx`
  plus the six launchers (optional card props), `NumericLabPage.tsx` (`mode` / `lead`), `matchOrigin.ts`,
  tests `AdminShell.areas`, `NumericLabPage`, `packs`, e2e `interaction-labs-access` (rewritten for
  the new routes)
* deleted: `src/pages/admin/interaction-labs/InteractionLabPage(.test).tsx`

Backend:
* new: `interaction_lab/` (service, fixtures, tests), `routes/admin_interaction_lab.py`, `routes/admin_playtests.py`
* changed: `api_server.py` (two `include_router`)

## 5. Tests and results

| Suite | Kind | Result |
|---|---|---|
| `interaction_lab/tests` + `numeric_lab/tests` | backend unit/HTTP; auth gate on every route, real-app registration, secrecy, grading, sessions, provenance, fail-closed packs, status | **57/57** |
| Adjacent backend: admin auth, OWN1, answer-safety, quiz admin auth, ranked routes, preset suites (assembly, journeys, MG live, OF, playtest preset, reconstruct, scrub) | backend regression | 249 passed / 21 failed / 3 errors on **both** base `9fc8a034` and branch: identical failure sets (environmental: empty worktree DB, stale harnesses) |
| vitest: playtests, ranked launchers, numeric lab, admin areas, admin registry, packs, matchOrigin | frontend, MOCKED backend | all pass, except 2 `admin-registry.routes` failures that also fail on clean `main` `805529a0` |
| `tsc -p tsconfig.app.json` | | only the 2 pre-existing errors (`OnboardingProfile.tsx`, `identity/connections.ts`) |
| ESLint (changed files) | | 0 errors |
| `vite build` + bundle scan | production build | builds; 0 hits for 13 pack markers (capture timestamps, wiki template URLs, round ids, notes, `castRangeUnits`) and 0 CE answers across every emitted asset; owner chunks hold no answer string |
| Backend after merging `master` `b84b17bc` (adds `test_ops_queue_controls.py`) | backend regression | branch 276 passed, base 219 passed; 59 failed + 3 errors on both, with **identical failure sets**. The failures are environmental: PR #32's queue switches fail closed without Supabase in older harnesses. |
| `unified-playtests-live.spec.ts` | **REAL local backend** (this branch, on a disposable copy of the 2026-09-26 production DB), real browser | **26/26**, see §5.1 |
| `interaction-labs-access.spec.ts` (rewritten) | production bundle (`vite preview`), hermetic, owner RPC answered locally | **15/15**: non-owner and signed-out visitors are refused at `/admin/playtests/*` and every retired URL; owner bookmarks redirect; no file input anywhere; no fixture content in any JS asset |
| Existing browser suites: `rangefinder-continuity`, `word-puzzle-continuity`, `combat-estimate-continuity`, `numeric-lab-owner` | DEV labs + numeric page | **57/57** (plain dev server). Under the E2E/dummy-Supabase dev server they cannot render at all, which is environmental. |
| vitest broad run (admin, playtests, quiz-ranked, interaction-grammar, ranked-arena, numeric) | | 16 failures. 13 are identical on clean `main`. `QuizRankedViewport` (2) passes 9/9 in isolation, and `rfx1b3` (1) is a known timing flake. |

### 5.1 Real-backend browser run

Setup: backend `api_server:app` from `ugmp-be` on `127.0.0.1:8840`, and vite with `VITE_E2E_AUTH=1`.
Simulated on the backend only:
* `owner_auth_state` returns owner, for an HS256 token the backend has already verified;
* the owner's queue switches read open.

Everything else is real: routes, `require_admin`, packs, the Ranked queue, the bot and the arena.

* 360×640, 390×844 (touch), 1366×768 and 1920×1080: the hub lists all 10 modes, each available,
  with Play controls at least 36 px tall and no sideways scroll.
* Rangefinder: place (tap / keyboard) → Lock (HTTP 200) → server reveal → Next → back.
* Glyph Press: blob clue → sounding (HTTP 200) → set → Lock → reveal → Next → back.
* Stat Drop and Combat Estimate: Lock → historical value revealed, with no Correct/Incorrect wording → back.
* 1366×768, each of the six presets: Play → real queue join with the right preset → `/quiz/ranked`
  arena → the live back control points at Playtests → concede → result screen "Back to Playtests" → hub.

## 6. Security checks

* The backend gates every new route independently with `require_admin`. It refuses no bearer,
  `X-Admin-Key`, and a bad bearer (tested). Without a token, the live local backend answered 403.
* Sessions are bound to the owner's user id. A foreign, expired or wrong-mode id is the same 404.
  A token from another session or round gets 422.
* No pre-Lock payload carries an answer or an answer-spelling id or path (tests and live check).
* No pack is under a static mount (tested). The bundle scan is clean, and source walks of the owner
  route's whole import graph (lazy hosts included) reach no fixture, capture or lab authority.
* Nothing writes scores, ratings or leaderboard rows. Preset matches stay unrated Ranked Bot
  matches, as before.
* Caveat, unchanged from INT1/NUM-REC2: `mogsy` is a public repository, so these historical packs
  have been readable on GitHub all along. They suit owner playtests only, never competitive use.

## 7. PRs and deployment

No PR objects exist, because `gh` is not installed and the browser is not signed in to GitHub.
Each branch was pushed and merged `--no-ff`. The merge commit's tree is byte-identical to the
tested branch tip.

| Step | Status (2026-10-15) |
|---|---|
| Backend `ugmp/unified-playtests-be` → `master` | **merged** as `8c1d9b16` |
| Railway `web` | **deployed** `8c1d9b16`, status SUCCESS, startup complete. The new routes answer 403 without an owner session (before: `/api/admin/playtests/status` was 404). `/api/meta/champions` and `/assets` return 200. `NUMERIC_LAB_ENABLED=1` is already set on `web`; no variable changed. |
| Frontend `ugmp/unified-playtests-fe` → `main` | **merged** as `21a6705b` (handoff fast-forwards follow) |
| Lovable sync + publish | **NOT PUBLISHED.** mogzy.lol still served `index-DnSOZ4RY.js` (no `/admin/playtests/` route) 6+ minutes after the push. Lovable needs its Publish step, and this session cannot sign in to Lovable. The new frontend is not live yet. |

Local re-run recipe (nothing committed beyond the spec):
* Run the backend through `run_backend.py` (HS256 secret, owner-state and queue-switch stand-ins,
  disposable DB copy via the SQLite backup API).
* Run vite with `VITE_E2E_AUTH=1 VITE_COMBAT_API_URL=… VITE_SUPABASE_URL=<dummy>`.
* Mint a persona with `admin: true`. The PA2B L7 fix makes the E2E admin persona work.
* Run `UGMP_E2E_PERSONA=… UGMP_E2E_API=… npx playwright test e2e/unified-playtests-live.spec.ts`
  with a local config whose `baseURL` is that vite.
* The DEV continuity specs need a plain vite (real `.env`), because they cannot render under the
  dummy Supabase URL.

## 8. Not verified here (owner-only)

* **Real owner sign-in with MFA** on the live site. No owner credentials exist in this session.
  Authorization is proven by backend tests and the local HS256 run, not by a live owner login.
* Playing a **full preset match round** from the hub on production. The local run launched,
  conceded and returned for all six; their gameplay code is unchanged by UGMP.

## 9. Next exact action

1. **Owner: publish the frontend in Lovable.** Confirm that Lovable shows `main` at `21a6705b` or
   a later docs-only commit, then Publish. Verify that mogzy.lol's entry bundle changed (it was
   `index-DnSOZ4RY.js`) and that it contains `/admin/playtests/`.
2. **Owner smoke on the live site,** signed in with MFA:
   1. Open Admin → Leaguecraft → Ranked → Playtests. All 10 cards should be available.
   2. Play one Rangefinder and one Glyph Press round. Check that the Glyph Press clue image shows.
   3. Lock one Stat Drop and one Combat Estimate round.
   4. Start Match Grid and leave it; the leave guard should take you back to Playtests.
   5. Open `/admin/interaction-labs` and `/admin/numeric-lab`; both should redirect.
3. Optional follow-ups, not started:
   * a tolerance policy for the numeric experiments (CEG1 owner decision);
   * fresh, server-only content before Rangefinder or Glyph Press could ever be competitive,
     since the packs are public on GitHub.

Rollback: revert `21a6705b` on `main`, then republish; revert `8c1d9b16` on `master`. Neither
involves a schema change or data, and the old lab URLs only redirect, so a frontend-only rollback
is safe.
