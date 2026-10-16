# Public Game Modes — PGM1 + PGM2 handoff

The same file is kept in both repos:
* `mitcherrman/mogsy`: `docs/handoffs/public-game-modes.md`
* `mitcherrman/League_Combat_Simulator`: `docs/handoffs/public-game-modes.md`

**Status (2026-10-16):**
* **Phase 2 (PGM2): all 13 modes publicly playable, on branches, NOT merged.** See §12. Backend `pgm2/bonus-games-be`, frontend `pgm2/bonus-games-fe`.
* Phase 1 is **merged**:
* Backend `master` = `d7623549`. It is **live on Railway** (deploy `6f1c9853` SUCCESS). `GET https://web-production-83e53.up.railway.app/api/game-modes` returns 200 with `public_game_modes.catalog.v1`, 13 modes, and `Access-Control-Allow-Origin: *`.
* Frontend `main` = `3bb7100d`. It is **not yet on mogzy.lol**: the owner publishes it in Lovable.

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

## 5. Phase 2: launches that remained (all built in PGM2, §12)

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

**Merged 2026-10-16, on the owner's go-ahead.**
* Backend: `--no-ff` merge `d7623549` into `master`, pushed first. On the merge result: 208 passed, 5 skipped. Railway deploy `6f1c9853` SUCCESS. The live route was verified before the frontend was pushed.
* Frontend: `--no-ff` merge `3bb7100d` into `main`. On the merge result: 32 files and 451 tests passed, `vite build` OK (`MoreChallengesPage` lazy chunk, 11 kB).
* **Remaining:** the owner's Lovable publish, then a smoke test on mogzy.lol:
  * `/quiz/more-challenges` shows 13 cards;
  * the Daily main result's "Play More Challenges" lands there;
  * Leaguecraft's "Browse More Challenges" lands there.
* Lovable has lagged GitHub before: check for a new entry-bundle hash.

The pre-merge notes follow.

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

## 11. Next exact task (PGM1's; superseded by §12.10)

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

---

## 12. Phase 2 (PGM2): all thirteen modes publicly playable

### 12.1 Owner decisions applied (2026-10-16)

1. **Access.** Every bonus mode is open to Free and Premium accounts and to verified anonymous guests. The Premium Ranked Bot entitlement is never asked.
2. **Pause.** A dedicated Bonus Games switch, `app_settings.queue_bonus_games_enabled`, independent of Daily and Ranked.
   * It stops NEW starts only.
   * A retried press and a live game are still handed back.
3. **Stat Drop and Combat Estimate** launch ungraded: the authoritative value is revealed, with the player's error, and no pass mark.
4. **Perfect Timing** is public practice with browser-measured time. It makes no integrity claim.

All bonus modes are repeatable, unrated, and independent of the Daily score.

### 12.2 Ranked-backed modes (Match Grid, Roster Lock, Draft Memory, Chronoscope, Reconstruct, Order Forge)

**Backend**
* `POST /api/game-modes/{mode_id}/start` (`routes/public_game_modes.py`, `public_game_modes/launch.py`).
* It creates a canonical Ranked **bot** match on the mode's frozen unrated test format: `create_bot_match(format_override=preset_format(internal preset))`.
* The match gets host `bonus_game` and `session_preset` `bonus.<mode>`.
* No preset is passed, so `ADMIN_ONLY_PRESETS`, `_authorize_preset`, `_authorize_ranked_bot` and `require_admin` are never consulted. A test asserts this from the AST.
* Identity is `require_player`: any verified session except the legacy shared guest id.
* A start is idempotent per `start_key`: the match id is derived from `(user, start_key)`.
* If the player has a live bonus game of any mode, that game is handed back (`result: "resumed"`). Any other live match (Ranked, Daily, Journey, Role Challenge) refuses with `RANKED_ACTIVE_MATCH_EXISTS`.
* Expired matches are settled first. Rate limit `bonus_start` (user and IP rules).
* `require_match_identity` admits a guest when the **server-frozen** `ranked_matches.host` is `bonus_game`. Membership is still checked on every call. A guest on any other non-Daily match still gets `ACCOUNT_REQUIRED`, which is tested.
* Bonus games are excluded from:
  * Ranked history (`persistence.load_history_rows`);
  * the discovery library (`NON_COLLECTING_HOSTS`);
  * Daily Weak Areas evidence (`NON_EVIDENCE_HOSTS`).
* Ratings are already skipped three ways: the format is not rating-eligible, it is a bot match, and the creation source is `bot_playtest`.
* Module stats count bonus matches as **product** play: their session preset is never `admin.`.
* Match payloads carry `game_mode_id` and mask the internal `playtest.session_preset`. A test asserts `admin.` never appears in the payload.

**Frontend**
* More Challenges Play starts the game with one start key per press. A POST mints a guest identity when there is none. The match is handed to `/quiz/ranked` with `origin: "bonus_game"`.
* The `bonus_game` host implies the origin, so a reload keeps "Back to More Challenges".
* `/quiz/ranked` lets a verified guest in **only** for a bonus hand-off (`isBonusHandoff`). Every other entry keeps the account gate, which now links back to More Challenges.
* In the arena:
  * the mode's own Rules (`BonusModeRules`, from the server catalog) replace Ranked's scroll;
  * the eyebrow and the result name the mode ("Match Grid · Unrated");
  * the result offers **Play Again** (the same mode, via `/quiz/more-challenges?play=<mode>`, started once and then the parameter is dropped), **Review Match** (in place, since bonus games are not in Ranked history) and **Back to More Challenges**.
* **Board reporting.** `ModuleRenderer.reportBoard` is implemented for Match Grid, Reconstruct, Order Forge, Chronoscope and Assembly.
  * It reports the prompt, the entries, and the player's locked board.
  * The correct board and its evidence (recipe totals, ranked values, the XP proof, the historical series) are taken **only** from the viewer's own reveal row.
  * The arena's one publisher files it with `game_mode_id`.
* If the server hands back a live bonus game of **another** mode, the catalog names it and offers "Return to it" instead of silently opening a different game.

### 12.3 Specialized modes as player-scoped sessions (Rangefinder, Glyph Press, Perfect Timing, Stat Drop, Combat Estimate)

**Backend** (`public_game_modes/sessions.py`; routes under `/api/game-modes/{mode}/sessions…`)
* The same service functions as the owner labs, but on a **separate public store** keyed `player:<user_id>`.
  * A foreign session or round reads as unknown.
  * At most 3 live sessions per player and mode.
  * The global ceiling is separate, so public traffic can never evict the owner's lab sessions.
* **Stat Drop and Combat Estimate** become dealt sessions (6 rounds each).
  * Each round locks once. The authority's value is released only by that lock.
  * The reveal comes with `feedback {guess, canonical, error, abs_error, relative_error, graded:false}`.
  * Build identity (`backend_commit`, capture branch) is stripped.
  * The labs' stateless "lock anything any number of times" route is not reachable publicly.
* **Perfect Timing** rounds are owned by their run.
  * At most 10 are dealt per run (5, plus replacements), so re-dealing cannot be used to shop for easier abilities.
  * The scoring is PT's own.
* **Glyph Press** clues are served from `/api/game-modes/glyph_press/sessions/{sid}/rounds/{i}/clue` with `private, no-store`.
* Rate limits: `bonus_session` and `bonus_action`.
* The Bonus Games pause stops new sessions only.
* The owner labs, their stores, flags (`NUMERIC_LAB_ENABLED`, `PERFECT_TIMING_LAB_ENABLED`) and `require_admin` are untouched. The 178 lab tests still pass.

**Frontend** (`/quiz/more-challenges/:mode` → `BonusSessionPage`)
* The page mounts a game only for a mode the catalog opens as a session, with the mode's Rules beside it.
* `src/pages/quiz-more-challenges/games/*` reuse the **same primitives**: Rangefinder, GlyphPress, MIG1 StatDrop, CE1 balance, and the PT4.4 page.
  * They run inside the real `CanonicalArena`, with player chrome: the way back, a round bar, rails, a results screen (Play again / Back to More Challenges), and player-facing errors.
  * There is no owner, prototype, flag or commit copy, and tests assert that.
* Combat Estimate draws no fake opponent and no clock.
* Perfect Timing is the owner page with an optional `publicHost` prop. The owner path is unchanged.
* Every game publishes its round to the report control with `game_mode_id`. The answer and evidence are included only after the server's reveal.
* Client: `src/lib/public-modes/sessionsApi.ts`. `bonusTimingApi` keeps the owner client's shape **and its error class**, so the page's expiry handling works.

### 12.4 Owner controls
* **Admin → Platform policies → "Queue · Bonus Games"** writes `queue_bonus_games_enabled`.
  * An absent row means open.
  * The backend checks it within 60 s.
  * An unreadable setting fails closed (paused).
* Admin analytics has a `bonus_game` host bucket.

### 12.5 Accurate Rules (server-owned, `catalog.rules` + `scoring_summary`)

Each mode's sections are written from its own format and grader:
* **Ranked-backed modes:** "Each board scores 2 points only when … ; a partly right board scores nothing. A correct board locked strictly before the bot's earns 1 more."
  * The timers come from each format: Match Grid and the Assembly modes 45 s; Reconstruct, Order Forge and Chronoscope 30 s.
* **Rangefinder:** exact stops only.
* **Glyph Press:** per letter.
* **Perfect Timing:** tiers at 3%, 7% and 15%, and "not a verified score".
* **Stat Drop / Combat Estimate:** "Not graded".

### 12.6 Files
* **Backend:**
  * `public_game_modes/{catalog,launch,sessions}.py` and tests (`test_catalog`, `test_bonus_start`, `test_bonus_sessions`)
  * `routes/public_game_modes.py`
  * `services/platform_policy.py`
  * `ranked_public/{host,projections,persistence,discovery,ratelimit}.py`
  * `routes/ranked_public.py` (`require_match_identity`, `_frozen_host`)
  * `content_sets/learning.py`
  * updated pins in `test_ops_queue_controls.py` and `test_rc3_role_challenge_launch.py`
* **Frontend:**
  * `src/lib/public-modes/{contracts,launch,rules,sessionsApi}.ts` (and the regenerated catalog fixture)
  * `src/lib/ranked-public/{client,contracts,matchHost}.ts`
  * `src/pages/quiz-ranked/{matchOrigin.ts,QuizRankedMatch.tsx,QuizRankedPage.tsx}`
  * `src/lib/ranked-core/{reportSnapshot.ts,modules/types.ts,modules/boardReports.ts,modules/*Module.tsx}`
  * `src/components/public-modes/BonusModeRules.tsx`
  * `src/pages/quiz-more-challenges/{MoreChallengesPage,BonusSessionPage}.tsx` and `games/*`
  * `src/pages/admin/perfect-timing/PerfectTimingPage.tsx` (`publicHost`)
  * `src/components/perfect-timing/PerfectTimingResults.tsx` (`exitLabel`)
  * `src/pages/admin/playtests/ownerArena.tsx` (optional phone reserve)
  * `src/lib/platform-policy/policy.ts`, `src/pages/admin/AdminPlatformPolicies.tsx`
  * `src/lib/admin/analytics/metrics.ts`
  * `src/App.tsx`

### 12.7 Tests and verification
**Backend** (`python -m pytest`, run in the pgm2-be worktree):
* `public_game_modes`: 66 passed (catalog, bonus start, bonus sessions).
* Owner labs (`interaction_lab`, `perfect_timing`, `numeric_lab`): 178 passed.
* **Broad regression**, against clean `master` `016ab72d` in its own worktree with the same command: 147 test files (ranked*, rc*, dcmod*, dv2*, jlib*, journey*, match_grid*, reconstruct*, scrub*, order_forge*, assembly*, ops*, daily* and others) plus the lab and public-mode packages.
  * Branch: 405 failed, 3755 passed, 706 skipped, 7 errors.
  * Base: 666 failed, 3803 passed, 345 skipped, 7 errors.
  * Every failure on the branch also fails on base, except one: `test_jlib_api_journey_routes.py::test_the_list_needs_no_session`. It passes in isolation on both sides, so it is a load flake.
  * Base fails more because of environment: tests that need the canonical `lol_calc.db`, and 2 stale test files that do not import (`AUTH_METHOD_SUPABASE`).
  * `test_rc3_role_challenge_launch.py::test_exclusion_hosts_name_the_role_challenge_host` was updated on purpose to pin `bonus_game`.

**Frontend** (vitest 3.2.7):
* Focused suites, all green:
  * public modes, More Challenges, games, session page, client: 77
  * board reports: 31 + 7
  * Ranked page: 64
  * end screen: 26
  * owner labs: 124
  * policy and analytics
* **Full `src` suite**, branch vs clean `main` `f5f90c72`: no branch-caused failure.
  * Every test failing only on the branch passes in isolation: RFX1 2B3, R3B reduced-motion hold, lobby-preview rooms, patch-report scroll.
  * The one that still failed, `AdminPlatformPolicies` "no file outside the policy module…", fails identically on `main`: Windows `relative()` returns backslashes.
  * The same 11 pre-existing files fail as in PGM1.
* `tsc --noEmit -p tsconfig.app.json`: only the two pre-existing files (`OnboardingProfile.tsx`, `identity/connections.ts`).
* eslint: 0 errors.

**Live local end-to-end** (real `pgm2-be` `api_server` on a scratch copy of the 2026-09-26 canonical DB, HS256 personas, real browser):
* All 13 modes report `available`.
* **API smoke**, every mode as a fresh player, guests and accounts alternating:
  * Each Ranked-backed start runs on the right module (`match`, `reconstruct`, `order_forge`, `scrub`, `assembly`), host `bonus_game`, correct `game_mode_id`, with no `admin.` leak.
  * Rangefinder deals 10 rounds and locks.
  * Glyph Press deals 9 rounds and returns its clue as `image/png`.
  * Stat Drop deals 6 and returns feedback (graded false).
  * Combat Estimate deals 6 and returns feedback.
  * Perfect Timing deals 5 and grades a round as `perfect` (100 points).
* **Browser, as a guest:**
  * Catalog → Match Grid Play → live arena ("MATCH GRID · VS BOT"), with the Match Grid Rules scroll and the report panel open over a board.
  * The full match ends on "Match Grid · Unrated", with Play Again / Review Match / Back to More Challenges.
  * Play Again starts a new match id.
  * Rangefinder: a real lock graded "Short" by the server.
  * Glyph Press, Stat Drop, Combat Estimate and Perfect Timing deal from the real backend.
  * At 375 px: no horizontal overflow, and two fixes landed from this run (the chrome row kept Next on screen, and the dock band was reserved).
* The scratch DB and the ignored DBs the launcher created were deleted afterwards.

### 12.8 Delivery
* Branches are pushed. They are **not merged** and need the owner's go-ahead.
* **Deploy order: backend first.**
  * The frontend's Play calls `/api/game-modes/{mode}/start` and `/sessions`.
  * Against PGM1's backend the catalog would publish no `ranked_match` or `session` launch, so nothing breaks; the cards simply stay "Coming soon".
* After the backend deploys:
  * Seed nothing: an absent `queue_bonus_games_enabled` row means open.
  * To start paused, the owner flips "Queue · Bonus Games" off first.

### 12.9 Known limits
* Specialized sessions live in **process memory**, as the owner labs do. A Railway restart expires them; the page says "This game expired. Start a new one."
* `/api/ranked/active-match` stays account-only.
  * A guest who loses the tab returns through More Challenges: Play hands back their live bonus game.
  * Browser history state keeps a reloaded tab working.
* Bonus matches are not in Ranked history, so a bonus match's review is the in-place Match details only. There is no long-term bonus history yet.

### 12.10 Next exact task
**Live-traffic follow-ups** after the owner merges and deploys:
* watch the `bonus_game` analytics bucket and the `more_challenges_mode_selected` events per mode;
* decide whether specialized sessions need durable storage (today they are memory-only);
* consider a per-mode "bonus history" surface, since bonus games are deliberately absent from Ranked history.
