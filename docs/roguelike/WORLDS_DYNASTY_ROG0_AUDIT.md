# Worlds Dynasty — ROG0 Technical Feasibility and Reuse Audit

- **Date:** 2026-10-15
- **Type:** research only. No code changes, deployments or DB writes.
- **Repos inspected:**
  - `mitcherrman/mogsy` (frontend; abbreviated `mogsy/`) at `d72841a`
  - `mitcherrman/League_Combat_Simulator` (backend; abbreviated `lcs/`, repo root) at `9fc8a03`
  - `mogzy-marvel` contains only a README and is not relevant.
- **Production access:** **unavailable.** The session's network policy denied the Railway host `web-production-83e53.up.railway.app` (proxy CONNECT 403), and no `lol_calc.db`, identity DB or `live_esports.db` exists in the checkout. Every production count below is labelled **[doc]**, meaning it was quoted from code comments or docs and not measured here.

### Evidence labels used in this document

| Label | Meaning |
|---|---|
| **[code]** | Verified by reading code. |
| **[test-run]** | Verified by executing the tests in this session. |
| **[fixture]** | Measured from a committed local data file. |
| **[doc]** | Quoted from a doc or comment; not verified. |
| **[assumption]** | My design judgement. |

---

## 1. Executive assessment

**Worlds Dynasty is feasible, and most of the hard infrastructure already exists.** It has to be assembled differently, not invented. Three findings drive the design.

### Finding 1: a run-with-encounters skeleton already exists [code]

- **The Daily Challenge parent run** (`lcs/daily_challenge/run/`) is a server-authoritative, idempotent, resumable multi-stage run:
  - guarded `BEGIN IMMEDIATE` state transitions;
  - deterministic run and launch IDs;
  - a seeded plan;
  - an event log.
- **Each Daily stage is a canonical Ranked bot match** launched with `create_bot_match(format_override=…, host=MatchHost(…))`.
- **The frontend embeds that match** through the `MatchHost` prop on `QuizRankedMatch`.

This is exactly the "knowledge encounter inside a run" mechanism Worlds Dynasty needs. Worlds Dynasty should be a **sibling of the Daily run**, not a new service.

### Finding 2: the knowledge encounters are ready, but only as Ranked modules [code]

These are registered `RoundModule` + `ModuleRenderer` pairs and are therefore hostable:
- Order Forge
- Reconstruct
- Match Grid
- Scrub
- Roster Lock / Draft Memory
- Champion Mastery (`mastery_slice`)
- Quiz

**Order Forge v2** is the only one with a test proving it runs under a non-Ranked host.

These are **not** hostable yet: Rangefinder, Glyph Press and Combat Estimate. They are browser-graded or fixture-only owner labs.

### Finding 3: the professional-play data is the critical-path risk, not the code

- **What exists [code]:**
  - Canonical player and team IDs, plus per-player champion records with games, wins and win rate, in `pro_player_champion_stats`.
  - Team win rates.
  - Champion matchups.
  - Game evidence.
- **What is wrong for this mode:**
  - **The 2026 corpus ends around 2026-07-14 [doc].** The July–October delta has not been approved for production (`lcs/pro_promotion/policy.json:94` `production_apply_approved: false`) [code].
  - **There are no completed Worlds 2026 games locally [fixture].** Worlds 2026 starts today.
  - **The 19 Worlds 2026 participants exist only as an editorial list, and every lineup is `not_certified` [code].**
  - **There is no pro-player rating, tier or rarity anywhere [code].**
  - Player-vs-player and team-vs-team aggregates need new aggregation.

### Recommended path

1. Build Worlds Dynasty as an **owner-only** backend package `lcs/dynasty/`. It should mirror `daily_challenge/run/`, run a **pure, seeded, deterministic Python sim**, and use the existing SQLite plus `migrate_add_*.py` mechanism.
2. Feed it from a **frozen, digest-sealed "Dynasty catalog" artifact** built offline by a read-only aggregation script over the canonical tables. This is the same pattern as the PA2A assembly catalog.
3. Make the frontend an `AdminRoute` page. It should:
   - reuse the CanonicalArena / MatchHost stack for encounters;
   - extract the Champion Card Duel card, fan and choreography components;
   - reuse the pro-play bracket, crests, portraits, mascot and SFX.

**Do not use `team_combat` (SIM2) as the battle resolver.** It is paid per request, Premium- and flag-gated, unseeded, and needs hand-authored action plans. A lightweight rating model is the right tool.

---

## 2. Verified findings with file references

### 2.1 Platform facts

| Fact | Evidence |
|---|---|
| The backend is FastAPI on uvicorn. Flask is legacy (`api_simulate_combat.py` only). | `lcs/Procfile`; `lcs/api_server.py:511` app; routers registered at `:549+` [code] |
| Persistence is SQLite on a Railway volume (`LOL_CALC_DB_PATH`), with WAL and `BEGIN IMMEDIATE`. There is no Postgres. | `lcs/db.py:9,95,147` [code] |
| Migrations are 53 idempotent `migrate_add_*.py` scripts called in `lifespan`. | `lcs/api_server.py:96+, :188+` [code] |
| Auth: the backend verifies the Supabase JWT via JWKS with PyJWT. The frontend uses `getBackendAuthHeaders()`. | `lcs/routes/supabase_auth.py:150,190`; `mogsy/src/lib/backend-auth.ts:46` [code] |
| Owner gate on the backend: `require_admin` → Supabase RPC `owner_auth_state`. There is no env allowlist and `X-Admin-Key` is ignored. | `lcs/routes/_auth.py:56,100,129` [code] |
| Owner gate on the frontend: `AdminRoute` → `useOwnerAuth()` plus an `OwnerStepUp` MFA step. | `mogsy/src/components/AdminRoute.tsx:22`, `mogsy/src/hooks/useOwnerAuth.ts:38` [code] |
| There is no currency, wallet, inventory or cosmetic-ownership store. | Grep across both schemas; header of `mogsy/supabase/migrations/20260910120000_pt2c_profile_frame_server_authority.sql` [code] |
| No "dynasty", "roguelike", "relic" or "encounter" code exists in either repo. | grep [code] |

### 2.2 Investigation A: existing game modes

All modes listed below as Ranked modules share these contracts:
- **Frontend contract:** `ModuleRenderer{moduleId, moduleVersion, servesVersion?, ownsSubmission, ownsResultReveal?, Viewport, projectQuestion, summaryLabel}`, in `mogsy/src/lib/ranked-core/modules/types.ts:133`. The registry is `…/modules/registry.ts:33`.
- **Backend contract:** the `RoundModule` protocol in `lcs/ranked_modules/contract.py:359` (`generate_segment(match_id, segment_number, seed, config, challenge_count, provider)`, `validate_challenge_input`, `challenge_is_correct`, `bot_challenge_input`, `public_view`, `resolve_segment`). The registry is `lcs/ranked_modules/registry.py`.
- **Grading:** always server-side. Settlement goes through `service._commit_result` (`lcs/ranked_public/service.py:2364`). Bot matches are unrated.

#### 2.2.1 Core stack

| Mode | Files | Status | Renderer contract | Generation | Grading / settlement | Hostable? | Tests | Class |
|---|---|---|---|---|---|---|---|---|
| **CanonicalArena** | `mogsy/src/components/ranked-arena/CanonicalArena.tsx:52,149`; view model `mogsy/src/lib/ranked-core/arenaView.ts:422`; `ArenaShell.tsx` | Live via `QuizRankedMatch.tsx:1762` | `CanonicalArenaProps{view: ArenaViewModel, terminal?, chrome?, guidance?, outro?, warning?, recovering?}`. A pure view: it never fetches, times or grades. | n/a | n/a | **Yes, by design.** Labs already drive it with client view models (`pages/dev/interaction-lab/labArenaView.ts`). | 41 files, ~564 cases in `components/ranked-arena/` [grep] | Production (shared component) |
| **Ranked match controller** | `mogsy/src/pages/quiz-ranked/QuizRankedMatch.tsx:176` (props, `host?` at `:249`), `useRankedMatch.ts:351`, `lib/ranked-core/flow/rankedFlow.ts`; `lcs/routes/ranked_public.py`, `lcs/ranked_public/service.py` | `/quiz/ranked` is public; the backend fails closed unless `RANKED_PUBLIC_ENABLED` is set (`service.py:233`) | Module registry, above | `service._generate_segment` (`:1944`), seeded by the per-match `order_seed = secrets.token_hex(16)` (`:2680`) | `submit` (`:3300`) and `submit_challenge` (`:4698`) are idempotent on the submission PK. Elo in `ranked_public/rating.py`; bots are unrated. | Yes, through the `host` prop | Frontend ~2,000 cases across quiz-ranked, ranked-core and ranked-public; backend ~1,950 [grep] | Production, behind a backend flag. Bot play needs Premium or admin (`_authorize_ranked_bot`, `:277`). |
| **MatchHost** | Frontend `mogsy/src/lib/ranked-core/flow/matchHost.ts:33,41`; vocabulary in `mogsy/src/lib/ranked-public/matchHost.ts`. Backend `lcs/ranked_public/host.py:47` (dataclass), `daily_stage_host()` at `:93`. | Wired. Production consumer: `DailyRunPage.tsx` only. | `MatchHost{eyebrow, settlingMessage, onMatchSettled(HostedMatchSettlement{matchId, terminalReason, completionReason}), onPresentationPhase?, onPlayerFinished?, onSurvivalStatus?}` | `create_bot_match(..., format_override, host)` (`service.py:3923`) | The parent reads the child's result | It *is* the hosting seam | `QuizRankedMatch.hosted.test.tsx` 27 and `matchHost.test.ts` 9: **both passed [test-run]**. Backend 30 [grep]. | Production infrastructure |
| **Daily Challenge** | Frontend `mogsy/src/pages/quiz-daily-challenge/run/{DailyRunPage.tsx,useDailyRun.ts}`, `mogsy/src/lib/daily-challenge/run/*`. Backend `lcs/routes/daily_run.py`, `lcs/daily_challenge/run/{service,ports,plan}.py`, `lcs/daily_challenge/wiring.py:721`. | Public at `/quiz/daily-challenge` | `DailyRun` / `DailyStage` contracts (`contracts.ts`) | `run/plan.py:204` `random.Random(int(seed[:16],16))`. Each stage is a Ranked bot match. | `sync_run` (`service.py:745`) pulls the child's `summary.score`. `_complete_main` freezes the score. | It is the **reference host**. Embedding a Daily inside another host is not supported. | Frontend ~211, backend ~371 [grep]. `test_dcmod_b_daily_run.py` **passed [test-run]**. | Production |
| **Champion Mastery** | (a) Module: `lcs/ranked_modules/mastery_slice.py`, generator `lcs/mastery/synthesis/service.py:175` `synthesize_champion_mastery(conn, champion, question_count, selection_salt)`, frontend `masterySliceModule.tsx:407`. (b) Legacy player: `/quiz/mastery` (`lcs/routes/mastery.py`, `mogsy/src/features/mastery/live/*`). | (a) In production as content inside Daily, Journey and Role Challenge. (b) Deprecated but its routes are still live (`ProtectedRoute`). | `MasterySliceChallengeView` (`contracts.ts:732`) | Config `{"mastery_mode":"champion","champion_id":…}` (`mastery_config.py:267`); deterministic per salt | Server-side via the module | (a) **Yes.** (b) No (own session model). | Frontend ~744, backend ~2,700 [grep] | (a) Production. (b) Deprecated. |

#### 2.2.2 Interaction modes that are already Ranked modules

All of these are reachable **only through admin presets** today (`ADMIN_ONLY_PRESETS`, `lcs/ranked_public/service.py:568`, enforced at `lcs/routes/ranked_public.py:357`). All preset formats are `status="test"`, `rating_eligible=False`. Shared submit endpoint: `POST /api/ranked/matches/{id}/segments/{n}/challenges/{i}` with `SegmentChallengeIn` (`lcs/schemas/ranked_public_schemas.py:202`). Grading is server-side, exact match, no partial credit.

| Mode | Frontend | Backend | Response shape | Hosted? | Tests [grep] | Class |
|---|---|---|---|---|---|---|
| **Match Grid** (`match.v1`) | `mogsy/src/components/match-grid/MatchGrid.tsx:36`; `lib/match-grid/contract.ts:61-108`; `lib/ranked-core/modules/matchGridModule.tsx:295` | `lcs/ranked_modules/match.py:289` (`generate_segment` `:303`, `resolve_segment` `:636`); format `ranked_formats/schema.py:2504` | `{assignments:[{entity,group}]}`. Single content family (`rune_tree`). | Seam-compatible; **untested in a host** | Frontend ~71, backend ~50 | Admin-gated (`admin.match`) |
| **Reconstruct** (`reconstruct.v1`) | `components/interaction-grammar/Reconstruct.tsx:108`; `reconstructModule.tsx:226` | `lcs/ranked_modules/reconstruct.py:736`; recipe catalog read from the DB | `{placement}` (item recipe) | Seam-compatible; untested | Frontend ~201, backend ~112 | Admin-gated |
| **Order Forge** (`order_forge.v1/.v2`) | `components/interaction-grammar/OrderForge.tsx:63`; `orderForgeModule.tsx:191` | `lcs/ranked_modules/order_forge.py:322` and v2 `:1653` (`V2_FAMILIES` `:855`: item cost, champion and item stats); format `schema.py:2416` | `{order}` | **Certified under a synthetic Daily host.** `lcs/test_order_forge_v2_daily.py` **passed [test-run]**. | Frontend ~132, backend ~273 | Admin-gated. **Best first encounter.** |
| **Scrub / Chronoscope** (`scrub.v1`) | `components/interaction-grammar/Chronoscope.tsx:83`; `scrubModule.tsx:165` | `lcs/ranked_modules/scrub.py:278`; content family `wave_xp` pinned to patch 26.15 | `{checkpoint}` | Seam-compatible; untested | Frontend ~73, backend ~50 | Admin-gated; narrow content |
| **Roster Lock / Draft Memory** (`assembly.v1`) | `components/interaction-grammar/PositionalAssembly.tsx:57`; `assemblyModule.tsx:165`; `modules/assemblyAdapter.ts` | `lcs/ranked_modules/assembly.py:645`; frozen, digest-checked PA2A catalog (`service.py:2171`) | `placement` across 5 lanes | Seam-compatible; needs the catalog artifact | Frontend ~84, backend ~182 | Admin-gated. **Thematically ideal** (pro rosters, champion drafts). |

Only Order Forge emits a `canonical_question_ref`. Match Grid, Reconstruct, Scrub and Assembly emit `None`, so they produce no Review or Discovery items.

#### 2.2.3 Owner labs and standalone modes

| Mode | Frontend | Backend | Grading | Hosted? | Tests [grep] | Class |
|---|---|---|---|---|---|---|
| **Rangefinder** | `components/interaction-grammar/Rangefinder.tsx:47`; `lib/rangefinder/eligibility.ts`; fixture `lib/rangefinder/__fixtures__/rangeAuthorityCapture.json` (227 records); `pages/dev/rangefinder/labAuthority.ts:60,89` | **None.** The fixture is captured offline from `lcs/champion_ability_canonical/data/range_authority.json`. | In the browser, exact token match | **No**; not a `RoundModule`. Typed "NOT a SegmentChoice yet" (`lib/interaction-grammar/types.ts:558`). | ~75 | Prototype; owner lab behind `AdminRoute` (`App.tsx:535`) |
| **Glyph Press** (Word Puzzle) | `components/interaction-grammar/GlyphPress.tsx:47`; `lib/word-puzzle/authority.ts:108`; 10-round fixture | **None** | In the browser, per-socket (solved/partial/missed) | **No.** The mid-round "sounding" round-trip does not fit single-submission `SegmentChoice`. | ~65 | Prototype; owner lab |
| **Combat Estimate** | `components/interaction-grammar/EstimateBeam.tsx:51`; `lib/combat-estimate/contract.ts:303` (`gradeEstimate`); `pages/admin/numeric-lab/*` | `lcs/routes/admin_numeric_lab.py` (`require_admin` + `NUMERIC_LAB_ENABLED`); 12-scenario fixture; calculator `lcs/combat_calculations/physical_ability_damage.py:259` (no HTTP route) | The backend only *releases* the answer; the frontend grades. The tolerance policy is unapproved. | Visually only (`CombatEstimateArena.tsx`) | Frontend ~78, backend 13 | Owner-only prototype |
| **Champion Card Duel** (Stat Check) | Engine `mogsy/src/pages/dev/champion-card-duel/championCardDuelEngine.ts` (pure; exports `createMatch :867`, `compareCategory :571`, `calculateRoundDamage :636`, `createSeededRandom :517`); page `ChampionCardDuelPage.tsx` (4,070 lines) | `lcs/stat_check_public/` (Python parity port), `lcs/routes/stat_check_public.py` (`/api/stat-check`) | Deterministic engine; HP attrition. Online play uses a server seed. | **No**; a standalone page | Frontend 381, backend ~120. Engine, fanLayout and animationConfig tests and `test_stat_check_engine{,_parity}.py` **passed [test-run]**. | **Production** (`/quiz/stat-check*`; online play behind `STAT_CHECK_MP_ENABLED`) |

**What a mode must implement to become a Dynasty encounter:**
1. A backend `RoundModule` plus a `RankedFormat` validator.
2. A frontend `ModuleRenderer`.
3. A passing readiness gate (`lcs/ranked_public/readiness.py:207-390`).

Nothing mode-specific is needed in the host [code].

### 2.3 Investigation B: visual reuse

| Need | Existing asset | Reuse class |
|---|---|---|
| Arena shell, HUD and run chrome | `ranked-arena/ArenaShell.tsx`, `CanonicalArena.tsx` (`chrome`/`guidance` slots), `CombatantPanel.tsx` (`HealthMeter`, `ScoreTally`, `RoundLedger`), `CentralStage.tsx`, `TimerDisplay.tsx` | **Direct**; adapt the view model for positional battles |
| VS / intro | `ranked-arena/RankedEntryIntro.tsx` (1v1 only, no crests) | **Adaptation** (team crest variant) |
| Victory / defeat beats | `MatchOverFrame.tsx`, `RevealBanner.tsx`, `RoundResultBeat.tsx`, `AwardPops.tsx` (`useAwardPops`), `RankedMatchOutro.tsx` | **Direct** |
| Role icons for the 5 lanes | `ranked-arena/RoleEmblem.tsx` (`RoleEmblem{role,size}`, `orderedRoles()`) | **Direct** |
| Player / champion card | `ChampionCard` and `FlippableCard`, *file-local* inside `ChampionCardDuelPage.tsx`; `CategoryValueBadge`, `LanePlaque`, `ProfilePanel` are exported; stat icons in `src/assets/champion-card-duel/stats/*` | **Extraction** into `src/components/cards/`, then **adaptation** for player cards |
| Rarity frames / holo | **None.** `tailwind.config.ts` `tier.{bronze…diamond}` palette and `TierBadge.tsx` can seed it. | **New** (small) |
| Card fan / hand | `champion-card-duel/fanLayout.ts` (`fanCardLayout`, `responsiveFanParameters`; pure, tested); `PlayerHand` is file-local | fanLayout **direct**; PlayerHand **extraction** |
| Choose 1 of N (relics, powers, draft picks) | `champion-card-duel/ChampionCardDuelItems.tsx` (`ItemChoicePanel`, `ItemChoiceOverlay`, `ItemInventoryDock`) | **Adaptation** (generalise away from duel `ItemId`) |
| Reveal choreography | `champion-card-duel/animationConfig.ts` (`REVEAL_TIMELINE`, `DAMAGE_REVEAL_TIMELINE`, reduced-motion variants), `animationState.ts`, `damageReveal.ts`; `lib/motion/useReveal.ts` (`staggered`, `useMotionAllowed`); `game-results/useCountUp.ts`; `ranked-arena/DiscoveryReveal.tsx` | Config and hooks **direct**; `RevealSequence`/`TravelingCard` **extraction** |
| Mascot | `components/mascot/MogzyMascot.tsx` (poses), `RoleMascot.tsx` (per-role attack/hit/cheer/celebrate; `public/mascot/ranked/`) | **Direct**. RoleMascot fits lane battles exactly. |
| SFX and music | `lib/audio/sfx-registry.ts` (semantic cues), `useSfx.ts`, `sfx.ts`; `lib/audio/mode-soundtrack.ts`. `public/audio/sfx/` is empty; cues are mostly synthesised. | **Adaptation**: add `dynasty.*` cues |
| Champion art | `hooks/useChampionAssets.ts` (`getChampionSplash/Loading/Icon/Cutout`, `resolveAssetUrl`). Served from the backend manifest `/api/assets/champions`, not DDragon. | **Direct** |
| Player portraits | `components/pro-play/media/EntityCrest.tsx` (`PlayerPortrait`, `PlayerPortraitSlot` monogram), `lib/pro-play/mediaApi.ts` (`/api/pro-play/media/resolve`, batch 40) | **Direct**, but coverage is tiny (11 approved portraits [doc PPH3]). Monogram faces will be the norm. |
| Team logos | `EntityCrest.tsx` `TeamCrest{teamKey=lp_page}`; `worlds-experience/parts.tsx` `SideMark` | **Direct** (needs canonical `lp_page` keys) |
| Tournament bracket | `components/pro-play/tournament/TournamentBracket.tsx` (`BracketMatchCard`, `SingleElimStage`, `Connectors`), `TournamentParts.tsx` (`GOLD` tokens) | **Adaptation**: feed synthetic `TournamentMatchV2` rows for an 8-team single elimination |
| Worlds broadcast look | `components/pro-play/worlds-experience/*` (`motion.ts`, `parts.tsx` `Eyebrow`/`Figure`/`GOLD_TEXT`) | `motion.ts`/`parts.tsx` **direct** |
| Remotion / Studio | `remotion.config.ts`, `src/video/Root.tsx` (`QuizVideo`, `Graph1Race`), `src/video/broadcast-fx/*` | **Adaptation**, later: a run-recap composition. Not needed for the prototype. |
| "Fable 5" visual work | **Not found as code or assets.** "Fable" appears only as a branch suffix in handoffs (`ce1-fable`, `r1-fable`, `wp1-fable`, `m1-fable`, `pav1-fable`). The merged results live in `components/interaction-grammar/*.css`, `components/match-grid/` and `components/combat-estimate/`. | Reuse via those components. **Confirm with the owner whether "Fable 5" refers to something outside these repos.** |

**Team-battle playback:** `pages/dev/team-sim/components/TeamCombatPlayback.tsx` is a dev tool and only a reference.

### 2.4 Investigation C: professional-play data coverage

**Storage [code]:** SQLite on the Railway volume. None of it is in Supabase.

- **`lol_calc.db`** (~3.1 GB [doc]):
  - Raw `esports_champion_games` (Leaguepedia pick/ban rows).
  - Canonical layer in `lcs/pro_authority/schema.py`: `pro_canonical_games` (`:16`), `pro_canonical_player_games` (`:227`, PK `(canonical_game_id, player_lp_page)` with role, side, champion, team, win), `pro_player_champion_stats` (`:271`), `pro_team_champion_stats` (`:341`).
  - Oracle's Elixir per-player-game stats (`:407`; KDA, gold/CS diffs).
- **Identity DB** (`MOGSY_IDENTITY_DB_PATH`): `esports_players`, `esports_teams`, aliases, `esports_roster_membership(player_lp_page, team_lp_page, role, start_date, end_date)`.
- **`live_esports.db`**: LoL Esports API mirror.
- **Canonical IDs [code]:**
  - Player: Leaguepedia `lp_page`.
  - Team: `esports_teams.lp_page`. Rebrands are linked, never merged.
  - Game: sha256-derived `canonical_game_id` (`pro_authority/canonical.py:189`).
  - Ambiguous rows are quarantined.

**Production size [doc, unverified]:**
- ~113.8k–118.4k canonical games.
- ~1.07M player-game rows.
- 20,624 identity players and 3,523 teams.
- The 2026 corpus ends **~2026-07-14** (`lcs/pro_authority/worlds_focus.py:17-19`, read [code]; the date itself is [doc]). Local graph1 digests end on 2026-07-09 [fixture].
- 23.5% of eligible team-games are missing at least one player row [doc].

**Worlds 2026 [fixture/code]:**
- `lcs/live_esports/fixtures/getSchedule_worlds_2026-10-11_p0.json` holds 40 events dated 2026, **all unstarted** (Play-Ins 6, Swiss 33, QF 1). Only 4 teams are named (C9, FUR, KC, MVK); the rest are TBD. The other 40 events in the file are Worlds 2025 (16 teams, all completed).
- `lcs/pro_authority/tournament_context.py:449` `WORLDS_2026` lists **19 editorial participants**:
  - LPL: AL, BLG, TES, IG
  - LCK: GEN, HLE, T1, DK
  - LEC: G2, MKOI, KC
  - LCS: TLAW, LYON, C9
  - LCP: TSW, CFO, MVK
  - CBLOL: LOS, FUR
  - Each has a canonical `team_key`. **Every lineup is `not_certified`.**

| Data need | Status | Basis / endpoint |
|---|---|---|
| Professional players | **Verified available (code)**; production volume unknown | `/api/pro-play/research/player/{lp_page}`, `/api/docs/pro/roster/players` |
| Organizations | **Available but incomplete** | Teams are Leaguepedia pages. There is no org-level aggregate, and rebrands are not merged. |
| Worlds 2026 participants | **Available but incomplete** | 19 editorial teams, **no certified lineups**, 0 completed games. Live bracket via `/api/live-esports/tournament/worlds-2026`. |
| Player win rates | **Verified available (code)**; 2026 freshness **unknown** | `/api/pro-play/stats/players` (public) |
| Player champion records (games/wins/WR, KDA) | **Verified available (code)** | `pro_player_champion_stats`; `/api/pro-play/stats/champions?player=` (public). KDA only on OE-covered games. |
| Team win rates | **Verified available (code)** | `/api/pro-play/stats/teams` |
| Player-vs-player (lane opponent) | **Requires new aggregation** | Exact H2H exists only for a fixed champion pair and is admin-only (`/api/pro-play/matchup/exact`). `/stats/early-game?opponent_player=` gives diffs but no W-L. The raw rows exist. |
| Team-vs-team | **Requires new aggregation** | The meetings list is admin-only (`pro_authority/meetings.py:149`). There is no aggregate W-L. |
| Champion matchup records | **Verified available (code)** | Public `/api/graph1/champion-matchup?a=&b=` (opposing teams, any lane); exact same-lane pairs are admin-only |
| Historical match evidence | **Verified available (code)** | `/api/pro-play/matchup/{series,game}` (admin), `/api/live-esports/games/{id}`. **No draft order** (sequence -1, `meetings.py:28`). |
| Canonical player/team IDs | **Verified available (code)** | As above |
| Pro rating / tier / rarity | **Missing** | Nothing exists; it must be derived |
| All production counts | **Unknown** | No network or DB access in this session |

---

## 3. Reuse compatibility matrix

| Dynasty need | Reuse | How | Effort |
|---|---|---|---|
| Run state, save/resume, idempotency | `lcs/daily_challenge/run/{service,ports,plan}.py`, `migrate_add_daily_runs.py` | **Copy the pattern** into `lcs/dynasty/run/`. Guarded transitions, deterministic IDs and an event log. | M |
| Knowledge encounter | `create_bot_match(format_override, host)` + Order Forge v2 / Assembly / mastery_slice | **Direct.** Add a host constant and format factory. | S |
| Encounter UI | `QuizRankedMatch` with `host: MatchHost` | **Direct**, as in `DailyRunPage.tsx` | S |
| Owner-only access | `require_admin`; `AdminRoute` | **Direct** | XS |
| Seeded RNG (backend) | `sha256 → random.Random(int(hex[:16],16))` idiom (`daily_challenge/run/plan.py:173,204`) | **Direct idiom.** Put a small helper in `lcs/dynasty/rng.py`. | XS |
| Battle resolver | Champion Card Duel engine *shape* (lanes, margin, decisive threshold, HP) | **Adaptation**: a new Python sim borrowing the rules shape. Not SIM2. | M |
| Player/team/champion stats | Canonical tables + `pro_player_champion_stats` | **New aggregation** into a frozen catalog artifact | M–L |
| Rarity / rating | none | **New** (formula in §4.3) | S |
| Cards, fan, choice panel, reveals | Card Duel components | **Extract** to `src/components/cards/` and `src/components/choice/` | M |
| Bracket | `TournamentBracket.tsx` | **Adapt** with synthetic matches | S |
| Crests, portraits, champion art, role emblems, mascot, SFX | §2.3 | **Direct** (add `dynasty.*` SFX cues) | XS–S |
| Rewards outside the run | none (no currency) | **Decision needed.** Run-scoped only for v1. | — |
| Rangefinder, Glyph Press, Combat Estimate as encounters | owner labs | **Promote** to `RoundModule`s later. Not in the prototype. | L each |

---

## 4. Proposed architecture

### 4.1 Topology

There is **no new service**. Everything lives in the existing FastAPI app and the existing SQLite database [assumption].

```
mogsy (owner-only AdminRoute /admin/dynasty)
  DynastyRunPage ──REST──▶ lcs/routes/dynasty_run.py  (admin_router, require_admin)
       │                         │
       │                         ▼
       │                 lcs/dynasty/run/service.py   (state machine, BEGIN IMMEDIATE)
       │                         │  ├─ dynasty/sim/*   (pure, seeded, deterministic)
       │                         │  ├─ dynasty/catalog (frozen digest-sealed artifact)
       │                         │  └─ ports.EncounterFactory ─▶ ranked_public.service.create_bot_match(
       │                         │                                format_override=…, host=dynasty_encounter_host(...))
       ▼                         ▼
  QuizRankedMatch host={…}  ◀── child Ranked match (existing modules, server-graded)
```

### 4.2 Run state and save/resume

**Tables** (new `lcs/migrate_add_dynasty_runs.py`):

| Table | Contents |
|---|---|
| `dynasty_runs` | `run_id`, `user_id`, `ruleset_version`, `catalog_digest`, `seed` (server-only, `"wdr_"+token_hex(16)`), `status`, `phase`, `node_index`, `state_json`, `created_at`, `updated_at` |
| `dynasty_run_events` | `run_id`, `seq`, `kind`, `payload_json`, `at`. **PK `(run_id, seq)`** is the idempotency anchor. |
| `dynasty_run_encounters` | `run_id`, `node_index`, `launch_id` (deterministic), `match_id`, `module_id`, `status`, `outcome_json` |

**Authority:**
- `state_json` is a **cache**. The truth is `seed + catalog_digest + ruleset_version + ordered events`. A pure `replay(events)` must reproduce `state_json`, which gives resume, audit and anti-tamper. This is the same idea as Ranked `_rehydrate` (`service.py:1175`).
- Every client action carries the `expected_seq`. The server applies it inside `BEGIN IMMEDIATE`, and the rowcount decides the winner, as in the Daily run.

**Phases:**
```
org_select → roster_draft → (node loop: encounter? → champion_select → series → reward) → complete | eliminated
```

### 4.3 Data catalog, ratings and rarity

**Catalog build.** A new script `lcs/scripts/build_dynasty_catalog.py`:
- opens the DBs read-only (`?mode=ro`);
- writes `lcs/dynasty/data/catalog.v1.json` plus a digest, following the assembly-catalog pattern;
- runs as a single bounded query set, **not** per-request aggregation.

**Catalog contents:**
- `orgs[]`: the 19 `WORLDS_2026` participants (`team_key`, code, name, league).
- `players[]`: `player_lp_page`, display name, role, team history window, games, wins, `rating`, `rarity`, `champion_pool[]`.
- `champion_pool[]`: `champion_key`, games, wins, `proficiency`.
- `provenance`: the `as_of` date, source tables, and query window, e.g. 2025-01-01 → corpus end.

**Player eligibility** [assumption]:
- At least N games, e.g. 20, within the window.
- The player must hold a membership on a Worlds 2026 participant *or* be in a top-league player pool.
- Lineups are **"recent roster per Leaguepedia membership"**, labelled as such and never as "registered" (respecting `not_certified`).

**Rating formula** (understandable, lightweight) [assumption]:

```
wr_shrunk  = (wins + k*0.5) / (games + k)               k = 30    (Bayesian shrink to 50%)
league_adj = per-league offset (LCK/LPL +, minor leagues −) — small owner-set table
rating     = clamp(50 + 100*(wr_shrunk - 0.5) + league_adj + exp_bonus(games), 40, 99)
```

**Optional KDA term:** add only where OE stats exist, and flag it in provenance.

**Rarity** (percentiles of rating within the eligible pool):

| Rarity | Percentile |
|---|---|
| Common | < 50% |
| Rare | 50–80% |
| Epic | 80–95% |
| Legendary | ≥ 95% |

**Champion proficiency:**
```
prof = shrunk WR on that champion (k = 10) × min(1, games/10)
```
A player's selectable pool is their top 8 by games. An off-pool pick uses `prof = 0.45` (a penalty, not a ban).

### 4.4 Simulation engine (`lcs/dynasty/sim/`, pure, no DB, no clock)

**RNG:**
```
rng(run_seed, *labels) = random.Random(int(sha256("|".join(...)).hexdigest()[:16], 16))
```
Every random draw is labelled, for example `("series", node, game, "lane", "mid")`, so replays are exact and independent of call order.

**Positional battle (one per lane)** [assumption]:
```
power   = rating + 20*(prof - 0.5) + relic_mods(lane)
p_win   = 1 / (1 + 10**(-(power_a - power_b)/25))      # Elo-style, scale chosen so ±10 power ≈ 72/28
outcome = rng.random() < p_win                           # randomness preserved, bounded by ratings
margin  = |power_a - power_b|  → "decisive" if outcome agrees with favourite and margin ≥ 8 (CCD idea)
```

**Team battle:**
```
team_power = Σ lane power · w_role
             (w = top .18, jng .22, mid .22, bot .22, sup .16)
             + 3 · lanes_won + synergy/relic mods
p_team     = same logistic, with an inflated scale (30) so the team fight is swingy but informed
```

**Game winner:**
```
score = 0.6·team_battle_won + 0.4·(lanes_won / 5)
```
Ties are broken by the team battle. This keeps the five positional battles plus the weighted team battle legible.

**Series:**
- BO1, BO3 or BO5 per bracket round.
- **Fearless Draft:** champions used by *either* side earlier in the series are removed from both pools. If a player's pool is exhausted, they fall back to off-pool proficiency.

**Opponent teams:**
- 7 AI teams drafted from the same catalog by a seeded greedy picker, with org-themed bias toward their own roster.
- Difficulty ramps with tournament round through rarity quotas.

**Tournament:** 8-team single elimination. QF is BO3, SF is BO3, the final is BO5 [assumption; tunable].

**Statistics honesty:** every number shown in the UI is either a catalog value with provenance or a labelled sim output. **Never present sim outcomes as historical results.**

### 4.5 Relics, powers and upgrades

- Relics live in a declarative table, `lcs/dynasty/relics.py`. Each relic is `{id, name, rarity, trigger, effect}`, and effects are pure functions over sim inputs. Examples:
  - **"Baron Buff"**: +4 team-battle power.
  - **"Flash Ready"**: re-roll one lost lane per series.
  - **"Fearless Scholar"**: off-pool proficiency raised to 0.5.
- Powers are one-shot actives consumed as events.
- **Upgrades** come from rewards (node clears) and knowledge encounters. The encounter outcome maps to an upgrade tier:
  - correct + fast → choose 1 of 3;
  - correct → choose 1 of 2;
  - wrong → +1 small stat.

### 4.6 Knowledge encounters

- **New host**, following the `daily_stage_host` pattern:
  - `lcs/ranked_public/host.py`: `HOST_WORLDS_DYNASTY`, `PARENT_WORLDS_DYNASTY`, `dynasty_encounter_host(run_id, node_index, kind)`.
  - `mogsy/src/lib/ranked-public/matchHost.ts`: `MATCH_HOST.worldsDynasty`.
- **Encounter format factory** `dynasty_encounter_format(module, config)` in `lcs/dynasty/encounters.py`:
  - **v1:** Order Forge v2 (already host-certified).
  - **v2:** Roster Lock / Draft Memory and `mastery_slice` for a drafted champion.
- **Launch:** call `create_bot_match` server-side, as Daily does. This bypasses the preset gate legitimately, because the run is already owner-authorised.
- **The bot:** its result is ignored. Only the player's `points_awarded` and outcome are read, via a `StageResultReader` modelled on Daily's.
- **Run seeding:** the child match keeps its own random `order_seed`. The run records `match_id` and the outcome as events, so run replay does not depend on re-generating the child. Passing a derived seed into `create_match_rows` is optional and not needed.

### 4.7 Rewards and settlement

- v1 is **run-scoped only**. Mogzy has no currency or inventory store.
- At the end of a run, write a `dynasty_run_results` row (placement, wins, MVP).
- If out-of-run rewards are wanted later, use the idempotent ledger pattern of `combat_battle_arena_score_ledger` (`migrate_add_combat_battle_settlement.py:100`). Do not touch Ranked Elo.
- XP grants via `update_quiz_progress` are possible but **need an owner decision**.

### 4.8 Owner-only access

- **Backend:** every Dynasty route is on an `admin_router` with `Depends(require_admin)`, plus an env kill-switch `DYNASTY_ENABLED` (default off → 404), matching `NUMERIC_LAB_ENABLED`.
- **Frontend:** the route `/admin/dynasty` is wrapped in `<AdminRoute>`. Add it to the `App.routeGuards.test.ts` expectations.

### 4.9 API sketch (`/api/admin/dynasty`)

| Method and path | Purpose |
|---|---|
| `POST /runs` | Start a run (idempotent on a client `start_key`) |
| `GET /runs/{id}` | Snapshot (resume) |
| `POST /runs/{id}/actions` | `{expected_seq, kind: org_pick|draft_pick|swap_sub|champion_pick|relic_pick|power_use|advance, payload}` |
| `POST /runs/{id}/encounters/{node}/launch` | Returns the child `match_id` |
| `POST /runs/{id}/sync` | Pulls the child result and applies the upgrade |

Responses are public projections only. The seed, future packs and opponent hidden state are never sent; this is the same rule as Card Duel's forbidden keys.

---

## 5. First playable prototype ("ROG1")

### 5.1 Scope

The smallest run that demonstrates all seven required elements:

1. **Drafting:** pick an org from the 19, then make 7 draft picks. Each pick chooses 1 of 3 seeded player cards for a named slot (5 roles, then 2 subs).
2. **Roster management:** one swap between a starter and a substitute before the match.
3. **Champion selection:** each starter picks 1 of their top-3 proficient champions, or off-pool. This is a single game, so Fearless does not apply.
4. **Simulated match:** **one BO1** against one seeded AI team. It resolves 5 positional battles and the team battle with staged reveals.
5. **One knowledge encounter:** a hosted **Order Forge v2** match before the game.
6. **One earned upgrade:** the encounter result grants a choice of 1 of 2 or 1 of 3 relics from a 6-relic table.
7. **Visible result:** a victory/defeat frame showing per-lane outcomes, relic effects, and data provenance (`as_of`).

**Out of scope for ROG1:** the bracket, BO3/BO5, Fearless, powers, multiple encounters, Remotion, out-of-run rewards and non-owner access.

### 5.2 Files

**Backend (`league_combat_simulator`), all new unless marked:**

| File | Purpose |
|---|---|
| `dynasty/__init__.py` | Package marker |
| `dynasty/rng.py` | Labelled sha256 → `random.Random` |
| `dynasty/catalog.py` | Load and verify the digest of `dynasty/data/catalog.v1.json` |
| `dynasty/rating.py` | Rating, rarity and proficiency functions (§4.3), pure |
| `dynasty/sim/battle.py` | Positional battles, team battle, game resolver |
| `dynasty/sim/opponents.py` | Seeded AI team draft |
| `dynasty/relics.py` | 6-relic table and its effects |
| `dynasty/run/service.py` | State machine, actions, replay |
| `dynasty/run/ports.py` | `EncounterFactory`, `EncounterResultReader` |
| `dynasty/wiring.py` | Production adapters onto `ranked_public.service` |
| `dynasty/encounters.py` | `dynasty_encounter_format()` (Order Forge v2) |
| `routes/dynasty_run.py` | `admin_router`, `require_admin`, `DYNASTY_ENABLED` |
| `migrate_add_dynasty_runs.py` | Tables from §4.2 |
| `ranked_public/host.py` | **Modify:** add the host constants and `dynasty_encounter_host` |
| `api_server.py` | **Modify:** import and run the migration in `lifespan`; `include_router` |
| `scripts/build_dynasty_catalog.py` | Read-only catalog builder |
| `dynasty/data/catalog.v1.json` | Built artifact (needs production read access) |
| `dynasty/tests/fixtures/catalog.fixture.json` | Small **synthetic** fixture, clearly labelled, for tests only |
| Tests | `test_dynasty_rng.py`, `test_dynasty_rating.py`, `test_dynasty_sim.py`, `test_dynasty_run_service.py`, `test_dynasty_encounter_host.py`, `test_dynasty_routes.py` |

**Frontend (`mogsy`), all new unless marked:**

| File | Purpose |
|---|---|
| `src/components/cards/{GameCard.tsx, FlippableCard.tsx, CardHand.tsx, rarity.ts}` | Extracted from `ChampionCardDuelPage.tsx`. The duel page is modified to import them, with **no behaviour change**, guarded by its existing 103 page tests. |
| `src/components/choice/ChoicePanel.tsx` | Generalised from `ChampionCardDuelItems.tsx` `ItemChoicePanel` |
| `src/lib/dynasty/{contracts.ts, client.ts}` | Fail-closed parsers, as in `lib/daily-challenge/run/contracts.ts` |
| `src/pages/admin/dynasty/{DynastyRunPage.tsx, useDynastyRun.ts}` | |
| `src/pages/admin/dynasty/phases/{OrgSelect, RosterDraft, RosterManage, ChampionSelect, EncounterStage, RelicChoice, MatchReveal, RunResult}.tsx` | One component per phase |
| `src/lib/ranked-public/matchHost.ts` | **Modify:** `worldsDynasty` |
| `src/lib/audio/sfx-registry.ts` | **Modify:** `dynasty.*` cues |
| `src/App.tsx` | **Modify:** `<AdminRoute>` route `/admin/dynasty` |
| `src/App.routeGuards.test.ts` | **Modify:** assert the guard |
| Tests | Colocated `*.test.tsx`; `e2e/dynasty-owner.spec.ts` (owner session, mocked backend) |

**Direct reuse in ROG1:** `CanonicalArena`/`QuizRankedMatch` (host), `RoleEmblem`, `RoleMascot`, `TeamCrest`, `PlayerPortrait` (monogram fallback), `useChampionAssets`, `fanLayout`, `animationConfig`, `useCountUp`, `MatchOverFrame`, `useSfx`.

### 5.3 Acceptance tests

1. **Determinism.** The same `(seed, catalog_digest, ruleset, events)` produces a byte-identical `state_json` and match result. Replaying from events equals the cached state.
2. **Randomness preserved.** Over 2,000 seeds with fixed rosters, a +10 power favourite wins a lane in 65–80% of cases, and no lane outcome is 0% or 100%.
3. **Rating sanity.** Shrinkage is monotonic, and a 2-game 100% player does not out-rate a 300-game 60% player. Rarity buckets hold their percentile proportions ±2%.
4. **Idempotency and races.** A duplicate `expected_seq` returns the same snapshot without double-applying. A stale `expected_seq` returns 409. Concurrent actions advance only once.
5. **Server authority.** Public projections never contain `seed`, unrevealed pack cards or opponent picks; a key-set check fails closed.
6. **Owner gate.** A non-owner gets 403, anonymous gets 401/403, and `DYNASTY_ENABLED` off gives 404. On the frontend, `/admin/dynasty` is wrapped in `AdminRoute` (route-guard test).
7. **Hosted encounter.** Launch is idempotent on `launch_id`. The child match row carries `host=worlds_dynasty` and a parent run reference. Sync after settlement applies exactly one upgrade, and the bot's result is ignored. This is modelled on `test_order_forge_v2_daily.py`.
8. **Provenance.** Every displayed player stat traces to a catalog row with `as_of`. The synthetic test fixture is never loadable when `DYNASTY_ENABLED=1` in production mode.
9. **No regression.** `ChampionCardDuelPage.test.tsx` and the engine, fanLayout and animationConfig tests pass after the card extraction, and the existing Daily and hosted tests pass.

### 5.4 Complexity estimate [assumption]

| Workstream | Size |
|---|---|
| Catalog builder + rating | M (2–3 days), **blocked on read access** |
| Sim + relics + tests | M (2–3 days) |
| Run service + routes + migration + host | M (3 days) |
| Card / choice extraction (no behaviour change) | M (2 days) |
| Dynasty page + 8 phase components | L (4–5 days) |
| **Total** | **~2.5–3.5 engineer-weeks** |

### 5.5 Blockers

1. **Production read access (hard).** The catalog cannot be built honestly without a read-only snapshot or query access to `lol_calc.db` and the identity DB. This session could not reach Railway (network policy).
2. **2026 freshness.** The canonical corpus ends around 2026-07-14, and the July–October delta is unapproved (`policy.json:94`). The owner must choose between:
   - **(a)** shipping with a labelled "data through July 2026" window; or
   - **(b)** approving and applying the PRODATA2 delta first.
3. **Worlds 2026 lineups are not certified.** Rosters must be labelled "recent Leaguepedia roster", not "Worlds roster", or wait for certification.
4. **`RANKED_PUBLIC_ENABLED`** must be on in the target environment for hosted encounters (Daily already depends on it).

---

## 6. Risks and unresolved questions

| # | Risk / question | Note |
|---|---|---|
| 1 | Data honesty | Sim results must never be presented as history. Player-vs-player and team-vs-team "history" needs new aggregation; until then, show none rather than approximations. |
| 2 | Small samples | Many players have few games on a champion. Shrinkage handles it, but show the game counts. |
| 3 | Portrait rights | ~11 approved portraits [doc]. Design the card face around a monogram plus crest plus champion art. |
| 4 | Fearless exhaustion | In a BO5, pools of 8 can be exhausted. The off-pool fallback is defined; tune it in playtest. |
| 5 | Balance | The logistic scales (25/30), weights and relic magnitudes are first guesses and need a sim harness (`scripts/dynasty_balance.py`) before tuning. |
| 6 | Ranked dependency | Encounters inherit Ranked's flags, timers and bot. Only Order Forge is proven hosted; others need a host test each. |
| 7 | Out-of-run rewards | There is no currency or inventory. An owner decision is needed before any persistent rewards. |
| 8 | Organization semantics | "Org" means a Leaguepedia team page; rebrands are not merged. Is the selectable org list the 19 editorial teams, or the 16-team `worlds_focus` watchlist? |
| 9 | "Fable 5" | No such visual system was found in code. Clarify what it refers to. |
| 10 | Unverified deployment state | Production env flags (`STAT_CHECK_MP_ENABLED`, `NUMERIC_LAB_ENABLED`, `TEAM_SIM_ENABLED`), OWN1 SQL live status, and the merge state of the Journey branches. |
| 11 | Ungated dev routes (observed in passing) | `/dev/ranked-duel`, `/dev/ranked-arena-inspector`, `/dev/journey-arena` and `/dev/ranked-shell-probe` are registered without a gate (`App.tsx:705,711-713`). Content sensitivity was not assessed. |
| 12 | Card Duel bot seed | The public bot game always deals the same first match per page load. The seed constant is deliberately frozen (`ChampionCardDuelPage.tsx:123`). Do not copy this into Dynasty. |

**Owner questions:**
- Data window: (a) or (b) from §5.5?
- Selectable orgs: the 19 or the 16?
- Should runs grant XP?
- Which knowledge modes should be prioritised after Order Forge?
- Should non-owner playtesters get access later via the playtest grant mechanism?

---

## 7. Recommended implementation sequence

| Milestone | Scope |
|---|---|
| **ROG1-A** Sim core (no UI, no DB) | `dynasty/rng.py`, `rating.py`, `sim/*`, `relics.py`, with a **synthetic labelled fixture** and the determinism, variance and rating tests. Add a balance script. *Unblocked today.* |
| **ROG1-B** Catalog | `scripts/build_dynasty_catalog.py`, run read-only against production by the owner, plus a committed digest-sealed artifact. *Needs access and the data-window decision.* |
| **ROG1-C** Run service and host | Migration, `run/service.py`, routes behind `require_admin` + `DYNASTY_ENABLED`, the `worlds_dynasty` host, Order Forge v2 encounter, and a host test. |
| **ROG1-D** Frontend extraction | Card, hand and choice components out of Card Duel, with no behaviour change and green Card Duel tests. |
| **ROG1-E** Owner prototype page | `/admin/dynasty` phases, then an owner playtest. |
| **ROG2** | 8-team bracket (`TournamentBracket` adaptation), BO3/BO5, Fearless, powers, 3+ encounter types (Assembly, mastery_slice), opponent difficulty ramp. |
| **ROG3** | Player-vs-player and team-vs-team aggregation (evidence panels), Rangefinder / Glyph Press / Combat Estimate promoted to `RoundModule`s, Remotion run recap, reward settlement decision. |

---

## Appendix: tests executed in this session

All runs were local, with no network and no DB.

**Frontend** (`npx vitest run …` in `mogsy`, after `npm ci --ignore-scripts`): **5 files, 142 tests passed.**
- `championCardDuelEngine.test.ts`
- `fanLayout.test.ts`
- `animationConfig.test.ts`
- `lib/ranked-public/matchHost.test.ts`
- `pages/quiz-ranked/QuizRankedMatch.hosted.test.tsx`

**Backend** (`python -m pytest -q -p no:cacheprovider …` in `league_combat_simulator`, using a venv with fastapi, pytest and httpx): **82 passed.**
- `test_stat_check_engine.py`
- `test_stat_check_engine_parity.py`
- `test_order_forge_v2_daily.py`
- `test_dcmod_b_daily_run.py`
- `test_prodata2_delta_2026.py`

**All other test counts in this document are grep counts and were not executed.**
