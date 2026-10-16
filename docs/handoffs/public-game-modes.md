# Public Game Modes — Phase 1 (PGM1) handoff

The same file is kept in both repos:
* `mitcherrman/mogsy`: `docs/handoffs/public-game-modes.md`
* `mitcherrman/League_Combat_Simulator`: `docs/handoffs/public-game-modes.md`

**Status (2026-10-16):** Phase 1 is implemented and tested on two branches. They are pushed. They are **not merged** and **not deployed**.

## 1. Product decision (approved, not reopened)

The owner approved 13 bonus modes for public play:

* Time Trial, Survival
* Roster Lock, Draft Memory
* Chronoscope, Match Grid, Reconstruct, Order Forge
* Rangefinder, Glyph Press
* Perfect Timing, Stat Drop, Combat Estimate

The target loop: Daily Challenge → More Challenges → select a mode → play → results → More Challenges. More Challenges must also be reachable from Leaguecraft.

Phase 1 builds the public foundation. It does **not** claim that all 13 modes are publicly playable.

## 2. Verified starting points

Both repos were fetched at the start of the session.

| Repo | Brief said | Actual tip at start | Branch | Worktree |
|---|---|---|---|---|
| Backend | `c39638b9` | `origin/master` = `c39638b9` (PR #39, PT4.3) | `pgm1/public-catalog-be` | `League_Combat_Simulator/.worktrees/pgm1-be` |
| Frontend | `ddd0f69f` | `origin/main` = `fc4c5ed5`, 2 commits past `ddd0f69f` (PR #48, PT4.4) | `pgm1/more-challenges-fe` | `C:/Users/mlmit/mogzy-wt/pgm1-fe` |

Commit SHAs are in §10.

An unmerged Daily V6 branch exists: `dv6/daily-v6-final-recipe` @ `45331bd7`. It changes the Standard recipe only. PGM1 does not touch `daily_challenge/run/plan.py`.

## 3. Decisions

**D1. The server owns the catalog.**
* `public_game_modes/catalog.py` is the one list of the 13 modes. It holds:
  * stable snake_case public ids;
  * title, theme and one-line summary;
  * More Challenges order;
  * availability;
  * a launch object;
  * scoring facts;
  * `rules_id` and `report_id`.
* `GET /api/game-modes` serves it. The route is public and read-only: it reads no identity, mints no identity and writes nothing.

**D2. Internal names never reach the public payload.**
* Each mode records the internal surface it plays on today (`admin.match`, `lab:rangefinder`, `daily_stage:time_trial`, …) in `internal_surface`. That field is never serialized.
* A test proves the payload carries no `admin.`, `lab:`, `preset` or `engine` text.
* A test proves the six Ranked-backed surfaces are exactly the Playtests hub's `HUB_PRESETS` and are still in `ADMIN_ONLY_PRESETS`.

**D3. Three internal engines; launch kinds are the public face.**
* Engines (internal):
  * `daily_stage`: Time Trial, Survival.
  * `ranked_match`: Roster Lock, Draft Memory, Chronoscope, Match Grid, Reconstruct, Order Forge.
  * `session`: Rangefinder, Glyph Press, Perfect Timing, Stat Drop, Combat Estimate.
* A mode carries `launch` only when the public can start it. Phase 1 publishes `daily_stage` only.
* `ranked_match` and `session` are reserved launch kinds. The client accepts them but never draws Play for a kind it cannot carry out.
* Players never see the engine split: cards look identical.

**D4. Being approved is not being launchable.**
* The 11 modes with no public route are `coming_soon` (`PUBLIC_LAUNCH_PENDING`). They have `launch: null`, no Play button, and `scoring.summary: null`.
* A scoring description is published only together with a working launch. It is never guessed.

**D5. Time Trial and Survival launch as today's Daily bonus stages.** They are real, public and server-authoritative.
* Availability reads the same gates as the Daily routes:
  * `RANKED_PUBLIC_ENABLED` off → `unavailable`.
  * Owner Daily queue switch off → `paused`. The launch is kept, because a run that has already started may finish.
* `launch.min_plan_version = 5` is the explicit plan/version compatibility. A v1–v4 run is "Not in today's Daily".
* The card's action comes from `resolveModeAction` (`src/lib/public-modes/launch.ts`) plus the player's own `GET /api/daily-run/today`:

  | Player state | Card action |
  |---|---|
  | No run, or no session | **Start Today's Daily** ("Unlocks after today's Daily Challenge.") |
  | Main Daily not done | **Continue Today's Daily** |
  | The run's current stage | **Play** / **Resume**, with `DAILY_CONTINUE_STATE` |
  | A later bonus stage | "Up after Time Trial" (v5 bonus stages play in the server's frozen order) |
  | Stage finished | "Played today · N correct" |

**D6. The Daily's primary score and plan are untouched.**
* No backend Daily code changed.
* The frontend changes are navigation only:
  * The main result's **Play More Challenges** opens `/quiz/more-challenges` when the next stage is a bonus stage. **Start Review** and the recap still proceed in place.
  * A v5 bonus stage's result gains a secondary **More Challenges** button.
  * A finished v5 recap gains a **More Challenges** link. v1–v4 are unchanged.
  * `DAILY_CONTINUE_STATE` (`{continueDaily:true}`) on `/quiz/daily-challenge` enters the current optional stage. It fires once, and only from `optional-entry`. It never starts a run and never pre-empts a live child's recovery.
* `main_score` is asserted unchanged across the round trip.

**D7. Leaguecraft entry point.**
* A quiet "More Challenges" section sits after Quick Study and before History. It is a plain link with `moreChallengesState("leaguecraft")`.
* The hub still fetches nothing for it.

**D8. Rules, Report and telemetry contracts reuse what exists.**
* **Rules:**
  * `buildModeRules(entry, extra?)` returns sections: How to play / [mode extras] / Scoring / Your standing.
  * `ModeRulesPanel` renders it in `MogzyExplainsPanel` at `DOCK_ORDER.rules`.
  * The catalog opens it per card.
* **Report:**
  * `ReportableQuestionSnapshot` gains optional `gameModeId` and `answerEvidence`.
  * `QuestionReportContext` gains `game_mode_id` and `answer_evidence`. They go in the existing jsonb `feedback.report_context`, so there is no migration.
  * The admin report view shows both rows.
  * `publicModeReportSnapshot(entry, question, reveal)` passes the answer and evidence only when `reveal.revealed === true`.
  * Reports file under the existing "Leaguecraft" feedback category. No new category was added, because categories are seeded in `app_settings.feedback_config`.
* **Telemetry:**
  * Product events `more_challenges_viewed` `{source}` and `more_challenges_mode_selected` `{game_mode_id, action, source}`.
  * `source` is one of `daily`, `leaguecraft`, `direct`.

**D9. Security boundaries are unchanged.**
* `/api/admin/playtests/*`, the admin presets, `require_admin` and the Ranked bot gate (Premium or admin) are untouched.
* Nothing public imports or loosens them. Tests pin both facts.

## 4. Public routes and contracts that work now

| Surface | Contract |
|---|---|
| `GET /api/game-modes` (backend) | `public_game_modes.catalog.v1`: `{contract, modes:[{id, order, title, theme, summary, availability:{status, reason_code, message}, launch, scoring:{summary, affects_daily_score, affects_ranked_rating}, rules_id, report_id}]}` |
| `/quiz/more-challenges` (frontend) | Public page. 13 cards. Play only from `resolveModeAction`. Rules per card. Loading, error and retry states. 1 / 2 / 3 columns. |
| `/quiz/daily-challenge` + `DAILY_CONTINUE_STATE` | Continues the run into its current bonus stage |
| Daily main result → catalog | "Play More Challenges" |
| Bonus stage result → catalog | "More Challenges" |
| v5 recap → catalog | "More Challenges" link |
| `/quiz` → catalog | "Browse More Challenges" |

Status vocabulary: `available` | `paused` | `unavailable` | `coming_soon`.
Launch kinds: `daily_stage` (live), `ranked_match` and `session` (reserved).

## 5. Phase 2: launches that remain

| Mode | Engine | Played today on | Needs |
|---|---|---|---|
| Roster Lock | ranked_match | `admin.roster_lock` | Public start route + host |
| Draft Memory | ranked_match | `admin.draft_memory` | Same |
| Chronoscope | ranked_match | `admin.scrub` | Same |
| Match Grid | ranked_match | `admin.match` | Same |
| Reconstruct | ranked_match | `admin.reconstruct` | Same |
| Order Forge | ranked_match | `admin.order_forge` | Same |
| Rangefinder | session | `/api/admin/interaction-lab/rangefinder` | Public session route |
| Glyph Press | session | `/api/admin/interaction-lab/glyph-press` | Same, plus a public clue-image path |
| Perfect Timing | session | `/api/admin/perfect-timing` | Same. The flag is `PERFECT_TIMING_LAB_ENABLED` and timing is browser-measured |
| Stat Drop | session | `/api/admin/numeric-lab` | Same. Ungraded: no approved tolerance |
| Combat Estimate | session | `/api/admin/numeric-lab` | Same. Ungraded: no approved tolerance |

**Owner decisions before Phase 2 launches:**

1. **Entitlement for public `ranked_match` launches.** The Ranked bot gate is Premium or admin. Journey Library and Role Challenge both bypass it, with their own rules: any account for Journeys; a daily slot plus `can_repeat_role_challenge` for Role Challenge. More Challenges needs its own rule: any account, a daily cap, or Premium.
2. **Queue pause.** Should public mode starts obey `queue_ranked_enabled`, or get their own `app_settings` switch?
3. **Stat Drop and Combat Estimate grading.** Launch ungraded and say so, or wait for a tolerance policy (CEG1's provisional `max(±2, 2.5%)` was not adopted)?
4. **Perfect Timing.** Accept browser-measured timing for public play?

**Engineering notes for Phase 2:**
* Add a match host, e.g. `HOST_PUBLIC_MODE = "public_mode"`, with `session_preset` = the internal preset. `ranked_matches.host` has no DB CHECK.
* Add a `more_challenges` origin in `src/pages/quiz-ranked/matchOrigin.ts` so the result screen offers "Back to More Challenges". It should be implied by the persisted host, unlike `admin_playtests`.
* Lab sessions today are in memory and owner-bound. Public sessions need account binding, rate limits, and an expiry that survives restarts (or an explicit no-resume rule).

## 6. Files

**Backend (`pgm1/public-catalog-be`):**
* `public_game_modes/__init__.py` (new)
* `public_game_modes/catalog.py` (new)
* `public_game_modes/tests/__init__.py` (new)
* `public_game_modes/tests/test_catalog.py` (new)
* `routes/public_game_modes.py` (new)
* `api_server.py`: router import and `include_router` (+3 lines)
* `docs/handoffs/public-game-modes.md`

**Frontend (`pgm1/more-challenges-fe`):**
* New:
  * `src/lib/public-modes/{contracts,client,launch,rules,report}.ts`
  * `src/lib/public-modes/__fixtures__/publicModeCatalog.json`: the backend's own `public_catalog()` output, all gates open, captured verbatim.
  * `src/lib/public-modes/publicModes.test.ts`
  * `src/components/public-modes/ModeRulesPanel.tsx`
  * `src/pages/quiz-more-challenges/MoreChallengesPage.tsx` and `.test.tsx`
  * `src/pages/quiz-daily-challenge/run/dailyPgm1.moreChallenges.test.tsx`
  * `src/components/quiz/LeaguecraftHub.moreChallenges.test.tsx`
  * `src/test/moreChallengesStandIn.tsx`
* Changed:
  * `src/App.tsx`: route.
  * `src/components/quiz/LeaguecraftHub.tsx`: section.
  * `src/lib/daily-challenge/run/entry.ts`: continue intent.
  * `src/pages/quiz-daily-challenge/run/{DailyRunPage,DailyMainResult,DailyStageResult,DailyCompletion}.tsx`
  * `src/lib/feedback/{report-context.ts,reportable-question.tsx,adminReportView.ts}`
  * `src/lib/analytics/contract.ts`: two events.
* Updated tests (round trip through the catalog stand-in):
  * `dailyV2P2A.hierarchy`
  * `dailyV2P2A1.launchRace`
  * `dailyV2P2C.opening`

## 7. Tests run (2026-10-16)

**Backend** (`python -m pytest`, run in the pgm1-be worktree):
* `public_game_modes`: 15 passed.
* Combined with `test_dv2_b1_main_daily.py`, `test_dcmod_b_daily_run.py`, `test_ops_queue_controls.py`, `test_rc3_role_challenge_launch.py`, `perfect_timing/tests/test_playtests_status.py` and `interaction_lab/tests/test_admin_interaction_lab.py`: **208 passed, 5 skipped**.
* The full backend suite was **not** run.

**Frontend** (vitest 3.2.7, native rollup loaded fine this session; `SWC_NATIVE_BINDING_CACHE=C:\swc-native-cache`):
* Focused suites (public-modes, more-challenges, all Daily pages, hub, feedback report context/view, analytics): **27 files, 398 passed**.
* Broad run (adds `src/components/quiz`, `src/pages/quiz-ranked`, `src/test`, journeys, playtests, rules, dock): 13 files failed.
  * 11 fail identically on clean `main` `fc4c5ed5` (worktree `mogzy-wt/pgm1-fe-base`), with the same per-file counts:
    * `src/test/security/*`: migration byte-pins and constraint lookups
    * `feedback/contract.test.ts`
    * `users1AudienceIdentity`
    * `noStaticLeagueFacts`: 22 violations on both base and branch, none in PGM1 files
    * `pt2eProfileThemeAuthority`
    * `QuizCategoryRail`
    * `playModeCard.styles`
  * `canonicalSurfaces` and `QuizRankedMatch.rfx1b1` failed only under load. Both pass in isolation on the branch.
* `tsc --noEmit -p tsconfig.app.json`: only `OnboardingProfile.tsx` and `identity/connections.ts` fail. Both are untouched and pre-existing.
* eslint on new files: clean.

**Browser:**
* Setup: vite on 8191, plus a scratch server exposing only `public_game_modes.router` on 8192 with gates forced open.
* `/quiz/more-challenges` renders 13 cards from the real payload. Two are Open ("Start Today's Daily", since there is no Daily backend). Eleven are Coming soon.
* At 375×812: one column, `scrollWidth == 375`, Play targets 44 px.
* The Rules scroll opens in the Mogzy dock with the server's copy.
* `/quiz` itself could not render, because the scratch server has no quiz API. The hub section is covered by the real-composition unit test instead.

## 8. Delivery and deployment

* No `gh` CLI on this machine, so no PR objects. Branches are pushed; open PRs in the GitHub UI, or merge with `--no-ff` as UGMP did.
* **Deploy order matters: backend first.**
  * The backend change is additive (one public GET).
  * The frontend's Daily "Play More Challenges" depends on `/api/game-modes`. Against an old backend the catalog page shows its error state, and the bonus stages are then reachable only from the Daily recap or a reload.
* Backend `master` auto-deploys to Railway. Frontend `main` needs the owner's Lovable publish.

## 9. Environment traps

* `pgm1-fe` and `pgm1-fe-base` have `node_modules` **junctions** into `Desktop/mogsy/node_modules`.
  * **Remove the junction before `git worktree remove`**: `(Get-Item node_modules).Delete()`. A recursive delete follows the junction.
* Data-router tests in jsdom need the `RouterTestRequest` stand-in (undici `AbortSignal` mismatch).
* The Daily leave guard uses `useBlocker`, so page-level Daily tests need `createMemoryRouter`.
* `api_server.app.routes` does not list included routers as plain paths here. Test registration behaviourally through `TestClient(api_server.app)`. Lifespan is not run, so no migrations run.

## 10. Commits

* Backend: `pgm1/public-catalog-be`
  * `ee909c71`: the catalog, route and tests, on base `c39638b9`.
  * The next commit records these SHAs.
* Frontend: `pgm1/more-challenges-fe`
  * `41fc080f`: the catalog page, Daily round trip, hub section, and the Rules/Report/telemetry contracts, on base `fc4c5ed5`.
  * The next commit records these SHAs.

## 11. Next exact task

**PGM2-A: the public `ranked_match` launch for one mode, Match Grid**, once the owner answers §5 Q1 and Q2:

1. Backend:
   * Add `POST /api/game-modes/{mode_id}/start`, accounts only (`require_account_identity`). Model it on `routes/role_challenge.py`: idempotent `start_key`, settle expired matches, rate limit `queue_join`.
   * Freeze host `public_mode` with `session_preset` = `admin.match`, using the format from `preset_format`. The preset stays admin-only for the admin queue route.
   * Publish `launch: {kind:"ranked_match"}` for `match_grid` in the catalog, with availability from the new gate.
2. Frontend:
   * Handle `ranked_match` in `resolveModeAction` (Play → start → navigate to `/quiz/ranked` with `{matchId}`).
   * Add the `more_challenges` origin in `matchOrigin.ts`.
   * Publish `publicModeReportSnapshot` from the Match Grid board.
   * Mount `ModeRulesPanel` beside the arena.
3. Then repeat for the other five Ranked-backed modes, and design the public `session` route for the labs.
