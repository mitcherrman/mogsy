# Mogzy Tournament Arena & Match Host Portal — Audit Handoff

**Status:** §0–§10 are the original audit (2026-10-21). **Update 2026-10-22:** the admin-only production integration is built and locally certified on draft PRs LCS #88 (on #86) and mogsy #122 (on #118) — see §11 (what exists), §12 (owner release runbook), §13 (evidence), §14 (build-order status). Nothing is merged, published, deployed or enabled.
**Date:** 2026-10-21
**Audience:**
- **Primary:** the Fable 5.1 frontend session that will build the animated visual experience.
- **Secondary:** whichever backend session builds the server side.

**Baselines:** every claim below was checked against these exact commits.

| Repo | Ref | Commit | Clean audit checkout |
|---|---|---|---|
| Mogzy frontend (`mitcherrman/mogsy`) | `origin/main` | `0fd1bb6a` | this worktree (`docs/tournament-arena-handoff`) |
| League Combat Simulator backend (`mitcherrman/League_Combat_Simulator`, private) | `origin/master` | `77c08167` | read-only detached worktree |

**Conventions for reading this doc:**
- `FE:` means a path in the mogsy repo and `BE:` a path in the LCS repo. Both are relative to the repo root.
- "Branch-only" means the code exists only on the named branch, and its merged status is stated.
- **Backed up 2026-10-21** marks a Dynasty branch that existed only on the owner's PC at audit time. Each was pushed to `origin` as-is that day: no merge, no PR, no force-push. They are **still unmerged** and stale against main. No local-only Dynasty branches remain.
- **PROPOSED** marks something that does not exist yet and is a recommendation.

**What could not be verified:**
- Production values of runtime switches: `app_settings.queue_ranked_enabled`, `STAT_CHECK_MP_ENABLED`, `STAT_CHECK_FRIEND_INVITES_ENABLED`, `RANKED_LIFECYCLE_WORKER_ENABLED`.
- Whether the PLAY1 Playtest Director SQL is applied in production.
- Open/closed state of LCS pull requests. The repo is private and `gh` is not installed. Merge state was instead checked with `git merge-base --is-ancestor`.
- Mogsy open PRs were read from the public GitHub API on 2026-10-21.

---

## 0. TL;DR

1. **No prior plan exists for user- or admin-created tournaments, custom matches, a host portal or private Ranked lobbies.**
   - Every existing "tournament"/"bracket" artifact is either a read-only pro-esports viewer (DCGI and Worlds 2026) or the owner-only Worlds Dynasty roguelike.
   - This is greenfield product work built on strong existing parts.
2. **The match engine is ready; the orchestration layer is missing.**
   - The Ranked engine (`BE: ranked_public/service.py`) is server-authoritative, deterministic, replayable and two-seat.
   - It already accepts `format_override=`, `host=` and `creation_source=` in `create_match_rows` (`service.py:2682`).
   - Nothing calls it for two *named* humans. `FE: src/lib/ranked-public/rankedInvite.ts` states this outright and forbids faking it.
3. **A bracket UI exists on main but has no motion.**
   - `FE: src/components/pro-play/tournament/TournamentBracket.tsx` provides `SingleElimStage`, `DoubleElimStage`, `BracketMatchCard`, measured SVG `Connectors` and `ChampionBanner`.
   - The Worlds experience adds zero-scroll fitting and framer-motion screen transitions.
   - The bracket itself is static: lines don't draw, winners don't advance, and there is no celebration.
4. **The best cinematic assets are on unmerged branches.** These are the Worlds Dynasty visual stack (`ux/ux6-dynasty-management`, which contains `vis/vis-f1…f4`): championship trophy and confetti sequence, finals VS intro, stingers, Bo5 pips and Web-Audio cues. They were local-only until they were backed up to `origin` on 2026-10-21. They are still unmerged and 389 commits behind main (§3.3).
5. **The data must live in the backend.**
   - Tournament state belongs in the LCS backend (SQLite on Railway), next to the Ranked tables, so that bracket advancement and match creation share one transaction.
   - Supabase is used only for identity, friends/blocks, transient presence and (later) notifications.
   - The single SQLite writer is the capacity ceiling. Cap v1 tournaments at 16 entrants.
6. **Build order:**
   - Fable builds the whole visual layer now against a **fixture gateway** on a DEV-only route.
   - In parallel, a backend session builds `arena_*` tables, the duel-invite flow, then bracket advancement.
   - The two tracks meet on the contract in §6.

---

## 1. What the owner asked for, mapped to existing primitives

| Product concept | Meaning in this handoff | Built on |
|---|---|---|
| **Custom duel** | One 1v1 match between two named accounts, using a preset game type | Ranked engine `create_match_rows(creation_source=…, host=…)` plus a new invite flow |
| **Custom match** | A 1v1 (optionally a Bo3/Bo5 series) whose *rules* the host configures: modules, timers, ruleset | Same engine. Format built through `RankedFormat`/`SegmentSpec` validation and `apply_ruleset` |
| **Custom game** | The host picks a *game type* from the catalog (Quiz, Match Grid, Reconstruct, Order Forge, Chronoscope, Roster Lock, Meta Reflex, Journey) | `BE: public_game_modes/catalog.py` plus the preset formats in `ranked_public/service.py` (`PRESET_FORMATS`) |
| **Tournament** | 4–16 entrants in a single-elimination bracket. Each node is a custom match or series | New `arena_*` tables plus an advancement hook in `_commit_result` |
| **Tournament Arena** | Player-facing browse/join/watch-bracket surface | New FE feature folder (§7) |
| **Match Host Portal** | Create/configure/run events. Users organize their own events; the owner moderates all of them | New FE feature, plus owner pages under `AdminRoute` |

**Hard engine limits (verified):**
- **Exactly two seats per match.**
  - `ranked_matches` has `p1_user_id`/`p2_user_id` with a CHECK that they differ (`BE: migrate_add_ranked_public.py`).
  - Team games and free-for-all are not possible on this engine without a major engine change. They are out of scope for v1.
- **One active match per account.**
  - `has_active_match` is at `BE: ranked_public/service.py:2610`.
  - `public_game_modes/launch.py` refuses a second match with `RANKED_ACTIVE_MATCH_EXISTS`.

---

## 2. Current-state findings by area

### 2.1 Worlds 2026 tournament and bracket (FE main, all merged)

**Data and backend:**
- **Contract:** `FE: src/lib/pro-play/tournamentApi.ts`.
  - `TournamentResponseV2`, `TournamentMatchV2` (:186) and `SlotSource` (:169, `{kind: "draw"|"winner_of"|"loser_of"|"unknown", match_id?}`).
  - The bracket graph is stored as **edges on the target slot**.
  - Also `BracketSummary` (:233, with `bracket_authority`) and `useTournament` (:435), which polls every 120 s.
- **Pure layout logic:** `FE: src/lib/pro-play/tournamentV2View.ts`.
  - Generic: `winnerEdges` :217, `routesFrom` :204, `singleElimRounds` :332.
  - English cell-name regexes: `doubleElimLayout` :295 keys off "Upper Bracket - …".
  - Also `swissRounds` :370 and `championMatch` :542.
- **Backend:** FastAPI router `BE: routes/live_esports.py` (`GET /api/live-esports/tournament/{context_id}`, :431).
  - The registry is a hardcoded Python dict (`BE: pro_authority/tournament_context.py`, `CONTEXTS` :584).
  - State is computed per request from Riot upstream (`BE: live_esports/tournament_state.py`).
  - **Nothing is persisted, and nothing advances winners.**
- **Supabase:** there are no tournament tables anywhere (`supabase/migrations`, `drizzle/`, or BE `migrate_*.py`).

**UI:**
- **Routes:** `/lol/pro-play/tournament/:contextId` (`FE: src/lib/pro-play/routes.ts:144`, `src/App.tsx:760`).
- **Worlds experience flag:** `VITE_WORLDS_EXPERIENCE_ENABLED`, read fail-closed in `FE: src/lib/pro-play/worldsExperience/productionGate.ts:31`.
  - **The tracked `.env:5` sets it to `"true"`**, so this UI is live. Do not regress it.
- **Worlds experience:** `FE: src/components/pro-play/worlds-experience/*`.
  - Screen transitions use framer-motion `AnimatePresence`.
  - URL-driven navigation state lives in `ExperienceContext.tsx` (`ExperienceProvider` :128, `DESKTOP_QUERY` :54, `LANDSCAPE_QUERY` :61).
  - Zero-scroll fitting comes from `fit.tsx` (`FitCascade`, `FitPages` :141, `Pager` :275, `rowsThatFit` :175).
  - Motion tokens are in `motion.ts`.
- **Bracket rendering is static:**
  - Connectors are SVG elbows measured from the DOM with `ResizeObserver` (`TournamentBracket.tsx:221/286`).
  - The only transitions are CSS `border-color`/`box-shadow`.
  - Outcomes render only when `bracket_authority === "standings"` (`TournamentBracket.tsx:91`, `:447`).

### 2.2 Worlds Dynasty visual components (mostly **unmerged**; backed up to origin 2026-10-21)

See the branch table in §3.3.

**There is no bracket component in Dynasty.** Its "season path" (`screens.tsx:182` `SeasonScreen`) is an 8-node linear `<ol>`.

The value of the stack is its **ceremony and motion vocabulary**. All of it is CSS `@keyframes` plus inline SVG; there is no framer-motion, canvas, three or Lottie. All paths below are on the branch `ux/ux6-dynasty-management` (backed up 2026-10-21, unmerged), under `src/pages/dev/dynasty-v2/`:
- **Championship moment:** `cinematics.tsx:190` `FullFrame kind="championship"`.
  - Sequence: black → flash → trophy rises → rotating conic rays → 36 CSS confetti pieces (`--x/--r/--d`) → title → roster stagger.
  - Audio: `hush(360)` → `playMoment` → crowd roar at 950 ms.
- **Finals intro:** `FullFrame kind="finals_intro"`. Crests slide in left and right with a "VS" title.
  - Auto-dismisses after 3 s.
  - Skippable with tap, Esc, Enter or Space.
- **Broadcast layer:** `broadcast.tsx`.
  - `StingerHost` :90 and `useStinger` :124: one title plate at a time, `aria-live`.
  - Also `CasterPop`, `ReactionPop` and `CrowdMeter`.
- **Series pips:** `screens.tsx:438` `BoPips` (with a "Match point" pulse), `parts.tsx:169` `Pips`, `:327` `SevenPips`, `:344` `LeadMeter`.
- **Sequences:**
  - `walkout.tsx:25` `WalkoutSequence`
  - `lock.tsx:17` `DraftLockSequence`
  - `environments.tsx:415` `TrophyHall` (SVG)
- **Team marks:** `parts.tsx:42` `Crest`, `:70` `Monogram`, and `:36` `accentStyle` (sets the per-org `--dyn-accent` variable).
- **Count-up:** `parts.tsx:363` `useCountUp`. Driven by rAF; instant under reduced motion.
- **Keyframes:** `vis.css` (21), `vis-f2.css` (9), `vis-f3.css` (16) and `vis-f4.css` (27).
  - All are prefixed `dyn-` and scoped under `.dyn`.
  - Motion is enabled only by opt-in classes (`.dyn-cine--motion`, etc.) that JS adds when `useMotionAllowed()` is true.
- **Audio:** `audio.ts`. All sounds are synthesized with the Web Audio API.
  - Exports: `playCue` :209, `MOMENT_CUES` :226, `playMoment` :239, `hush` :310, `useDynastyAudio` :114.
  - It honours the shared `mogsy-sounds-muted` key.
- **Shipping status:** `/dev/dynasty` and `/dev/dynasty-v2` are `import.meta.env.DEV`-only, so none of this is in a production bundle.

**PR #44 (`roguelike/rog1d1-dynasty-frontend`, open, pushed):**
- `src/pages/admin/dynasty/MatchStage.tsx:28` `MatchStage` is a stepped reveal with `setTimeout`.
- When the result is resumed or motion is reduced, it shows the final state immediately.
- It plays `ranked.discovery.reveal` and `ranked.match.victory/defeat` through `useSfx`.

### 2.3 Ranked match hosting, human-vs-human play and scoring (BE master, FE main)

**Stack:**
- FastAPI, a single uvicorn process (`BE: Procfile`), **SQLite** (`db.DB_PATH`, `/data/lol_calc.db` on Railway).
- No websockets, SSE or Supabase realtime for Ranked. Clients poll, heartbeat and resume.

**Lifecycle:**

| Step | Endpoint | Code |
|---|---|---|
| Join queue | `POST /api/ranked/queue` (`BE: routes/ranked_public.py:887`) | → `queue.join_queue` → `service.create_match_rows` (`service.py:2682`) |
| Resume | `POST /matches/{id}/resume` (:683) | |
| Play: read state | `GET /matches/{id}` (:413), `/private` (:436), `/rounds/current` (:458) | Polled every 1.5 s (`FE: src/pages/quiz-ranked/useRankedMatch.ts:46`) |
| Play: heartbeat | `POST /presence` (:482) | Every 10 s |
| Play: submit | `POST /rounds/{n}/submission` (:516) | → `service.submit` |
| Resolve | (on read) | `_resolve` (service.py:1472) → `DuelCombatMatch.commit_resolution` |
| Commit result | (on read) | `_commit_result` (`service.py:2481`) → `ranked_results` + `_apply_rating`, in the same transaction |
| Result views | `GET /matches/{id}/result` (:724), `/review` (:741) | |
| Forfeit | `POST /matches/{id}/forfeit` (:649) | |

**Authority:**
- **Server decides:** deadlines, grading, points and the winner. The client timer is display-only.
- **Secrecy:** answers are protected by `answer_safety.assert_pre_reveal_safe` in `projections.py`.
- **Membership:** every match read requires it (`_require_membership`, `service.py:2595`), so **spectating does not exist.**
- **Reconnect:** absent after 20 s, then a 25 s grace period, then forfeit (`LifecyclePolicy`, `service.py:984`).

**Scoring:**
- **Points only.** `MatchConfig.validate` rejects anything but `scoring_model='points'` (`BE: duel_match_engine.py:184`).
- **Default public format:** `ranked_points_v2`, 10 modules, selected by `_format_from_ladder` (`service.py:695`, verified).
- **Points per module** (`BE: ranked_modules/points.py`): correct = tier points (easy/medium 2, hard/scenario 3), +1 speed bonus only if correct *and* strictly faster.
- **Draws are possible.**

**Rating:**
- Elo (`BE: ranked_public/rating.py`), with `RATED_CREATION_SOURCES = {"queue", "direct"}` (:83).
- Bot matches and `no_contest` are unrated.

**Host provenance:**
- `BE: ranked_public/host.py` (`MatchHost`, `HOST_DIRECT` and others; `parent_activity_type/id`, `parent_stage_index/kind`).
- Mirrored on the FE in `src/lib/ranked-public/matchHost.ts`.
- Daily already uses parent provenance to orchestrate child matches. It *pulls* child results, around `BE: daily_challenge/wiring.py:988`.

**Embeddable match UI:**
- `FE: src/pages/quiz-ranked/QuizRankedMatch.tsx` takes `onSessionComplete`, `host`, `chrome` and `onTerminalNavigate` (around :180).
- It is already hosted by `DailyRunPage.tsx`.
- The host seam is `FE: src/lib/ranked-core/flow/matchHost.ts`, documented as being for "any future multi-match session".

**Current pause state:**
- **FE:** `PUBLIC_RANKED_COMING_SOON = true` (`FE: src/components/quiz/LeaguecraftHub.tsx:173`).
- **Server:** the pause is `app_settings.queue_ranked_enabled` (`BE: services/platform_policy.py`), which fails closed. Its production value was not verified.
- **Master flag:** `RANKED_PUBLIC_ENABLED` (`_require_enabled`, `routes/ranked_public.py:250`).
- **PR #105** (adds `RANKED_QUEUE_PAUSED` to `KNOWN_CODES`) is **not merged**.

### 2.4 Role Challenge, More Challenges and game modes

**Four registries:**
1. **Segment modules (BE):** `ranked_modules/registry.py`. Entries implement the `RoundModule` protocol (`ranked_modules/contract.py`).
2. **Formats (BE):** `ranked_formats/schema.py` (`RankedFormat`, `SegmentSpec`) and rulesets in `ranked_rulesets/`.
   - Rulesets: `standard`, `time_trial(time_bank_ms)`, `survival(max_strikes=3)`; applied with `apply_ruleset`.
3. **Public catalog (BE):** `public_game_modes/catalog.py` (`MODES`, 13 entries), served at `GET /api/game-modes`.
4. **FE renderers:** `src/lib/ranked-core/modules/registry.ts` (`RENDERERS`), `src/lib/public-modes/{contracts,gallery,launch}.ts`, and the `GAMES` map in `src/pages/quiz-more-challenges/BonusSessionPage.tsx`.

**Admin format builder:**
- BE `ranked_public/builder_catalog.py` (`GET /api/ranked/admin/module-catalog`).
  - It allow-lists only `quiz.v2`, `item_cost_duel.v4` and `mastery_slice.v1`.
- FE `src/pages/admin/ranked/RankedFormatBuilder.tsx` plus `src/lib/admin/rankedFormatApi.ts`.
- Saved configs: `ranked_public/format_config.py`, for the targets `public` and `admin_bot` only.

**Tournament suitability:**

| Game type | Engine | Two humans? | Verdict for v1 |
|---|---|---|---|
| Ranked Quiz / `ranked_points_v2` | Ranked | Yes | **Eligible** |
| Match Grid (`ranked_modules/match.py`), Reconstruct, Order Forge, Chronoscope (`scrub`), Roster Lock / Draft Memory (`assembly`) | Ranked (preset formats) | Engine yes; launched vs bot today | **Eligible** |
| Meta Reflex (`item_cost_duel` v4/v5) | Ranked segment | Yes | **Eligible**, as a segment |
| Journey Library | Ranked (`journey_library_seed` is deterministic) | Engine yes | **Eligible.** The only mode where every player gets identical content |
| Role Challenge (`role_challenge/composer.py`) | Ranked, bot only, about 17 s compose time | Engine yes | **Defer.** Compose cost; Free = 1/day |
| Time Trial / Survival rulesets | Ruleset | Yes | **Eligible** as rule toggles on single-question formats. `apply_ruleset` refuses multi-challenge segments |
| Champion Card Duel (`/quiz/stat-check*`, BE `stat_check_public/`) | **Separate engine** | Yes (rooms) | **Not v1.** Different engine and scoring; `rankedInvite.ts` forbids mixing it with Ranked |
| Rangefinder, Glyph Press, Perfect Timing, Stat Drop, Combat Estimate | In-memory solo sessions (`interaction_lab`, `perfect_timing`, `numeric_lab`) | No | **Not eligible.** Solo, unseeded (`SystemRandom`); Perfect Timing is client-timed; numeric modes are ungraded |
| Pro Play Quiz / Worlds 2026 Quiz | In-memory solo session | No | Not eligible |

**Fairness:**
- Within one match, both seats receive the same frozen segment, so the match is fair.
- **Across matches, content differs:** `order_seed = secrets.token_hex(16)` is generated per match (around `service.py:2801`).
- Same-content rounds across a bracket would need a seed or exact-content pin threaded through. Defer to v2.

**Open PRs touching modes (not merged):**
- #45 `role-challenge/v2-patch-badge-20261015`
- #13 `rc6/role-challenge-origin-20261014`
- #112 `qmedia2/option-media-fallbacks`
- #108 `fix/stat-check-final-verdict-20261019`
- #106 `fix/interaction-labs-pt-portal-assertion`

### 2.5 Multiplayer lobbies, invitations and Supabase

**What exists:**
- **The only working room/invite system** is Champion Card Duel (formerly "Stat Check").
  - **Backend:** `stat_check_public/{rooms,friend_invites,lifecycle,service}.py`, routes in `routes/stat_check_public.py`:
    - Rooms: `POST /rooms` :97, `POST /rooms/join` :116, `GET /rooms/{id}` :135, `POST /rooms/{id}/ready` :151, `DELETE /rooms/{id}` :169
    - Invites: `POST /invites` :369
  - **Tables:** SQLite `sc_rooms` (with `invite_code`), `sc_seats`, `sc_matches`, `sc_friend_invites` (opaque token, status enum, one pending invite per pair).
  - **Friend and block checks:** `services/community_identity.py`, which calls Supabase PostgREST with the **caller's JWT** (`friendships`, `rpc/is_blocked_between`).
  - **Frontend:** `src/lib/champion-card-duel-online/*`, `src/hooks/useChampionCardDuelInvites.ts` (30 s poll), `FriendActionMenu.tsx`, and the bell in `src/components/hud/MogzyIdentityMenu.tsx`.
  - **This is the design to copy, not the engine to reuse.**
- **The strongest Supabase-side host/lobby template** is the Playtest Director (PLAY1), in `supabase/migrations/20260927120000_play1_director_foundation.sql` and `src/features/playtest-director/*`.
  - `playtest_cohorts.invite_slug` is a high-entropy capability token.
  - State advances by compare-and-set on `revision`.
  - All writes go through SECURITY DEFINER RPCs.
  - Clients use realtime plus a 15 s poll fallback.
  - Its production apply status is unverified.
- **Ranked "lobby"** (`RankedLobbyHero.tsx`, `LobbyPanel.tsx`, `src/pages/dev/lobby-preview/`) is single-player hub UI. It is a visual reference only.

**Retired — do not reuse:**
- `multiplayer_*` tables (`supabase/migrations/20260309040233_…sql`) and the legacy `matches` table (`20260221153521_…sql`).
- The name `matches` is taken; do not create a table with that name.

**Signup invite links:**
- `src/pages/CustomLink.tsx` is bound to the **catch-all `/:slug`** (`src/App.tsx:886`).
- It resolves `invite_links` codes for signup and Premium grants. It is not a lobby invite.

**Identity and auth:**
- **Usernames:** `profiles.display_name` is unique, case-insensitively.
  - Read other users through `get_league_profiles` or the `public_profiles` view.
  - **Never expose `profiles.user_id` across users.**
- **Anonymous visitors** are minted lazily (`src/lib/backend-auth.ts`). Room endpoints use `require_account_identity`, which returns 403 `ACCOUNT_REQUIRED` for anonymous callers.
- **Realtime in use today:** only `postgres_changes`, treated as a refetch signal (`src/lib/community/social-realtime.ts`, `src/lib/notifications/usePlayerInbox.ts`, `src/lib/quiz-broadcast/liveSync.ts`, `src/features/playtest-director/api.ts`).
  - **There is no Presence or Broadcast usage anywhere.**
- **Admin/owner:** there is a single privileged identity, the owner (OWN1).
  - It is defined by `private.owner_config`, `is_owner()`, `assert_owner()` and `owner_auth_state()` (`supabase/own1-staged/migrations/01_own1_a_owner_core.sql`).
  - `user_roles` admin/moderator rows are blocked by the trigger `block_legacy_privileged_role_write`.
  - FE guard: `src/components/AdminRoute.tsx` with `useOwnerAuth` and `OwnerStepUp` (MFA).
  - BE guard: `routes/_auth.py` `require_admin`, which calls `rpc/owner_auth_state` with the caller's token.
- **The backend has no Supabase service-role key, by design.** It cannot insert `user_notifications` rows.

**Platform:**
- **Frontend → backend:** base URL `VITE_COMBAT_API_URL`, `Authorization: Bearer <supabase access token>` (`src/lib/backend-auth.ts`). CORS is `*` without credentials (`BE: api_server.py:564`).
- **Hosting:** frontend on Lovable (mogzy.lol); backend on Railway (single process).
- **Capacity:**
  - The untracked `CAPACITY_LAUNCH_HANDOFF.md` in the owner's clone says the ceiling is the single SQLite writer: roughly 25–100 concurrent match players at 1.5 s polling.
  - Rate limits are in-memory and per process (`BE: ranked_public/ratelimit.py`).

### 2.6 Art, motion and audio (FE main)

**Motion libraries:**
- **framer-motion ^12.34.3:** 65 source files.
- **three / @react-three/fiber:** one file (`src/components/quiz-broadcast/HextechCore3D.tsx`).
- **Not used:** drei (0 imports). No gsap, lottie, canvas-confetti or tsparticles is installed.

**Reduced motion:**
- **Single reader:** `src/hooks/useReducedMotionPreference.ts` (`useReducedMotionPreference`, `APP_REDUCE_MOTION_CLASS`). It reads both the OS setting and the app toggle (`html.reduce-motion`, localStorage `mogsy-reduce-motion`).
- `src/lib/motion/useReveal.ts:85` `useMotionAllowed()` combines it with `canAnimate()`.
- **Do not use framer's `useReducedMotion` alone.** It ignores the app toggle.

**Motion primitives:**
- `src/lib/motion/usePlaybackClock.ts`
- `src/lib/motion/useReveal.ts` (`useReveal`, `staggered` :76, `canAnimate` :27)
- `src/lib/motion/easing.ts`
- `src/components/pro-play/worlds-experience/motion.ts`

**Ceremony components:**
- `src/components/ranked-arena/RankedEntryIntro.tsx` (VS intro)
- `RankedMatchOutro.tsx` (1200 ms victory/defeat beat)
- `RoundResultBeat.tsx` (`BeatPlate`)
- `DiscoveryReveal.tsx`
- `src/components/game-results/{ResultHero,EarnedXpValue,useCountUp}`
- `src/components/mascot/RoleMascot.tsx` (actions `cheer`, `celebrate`)

**Audio:**
- **Engine:** `src/lib/audio/engine.ts` (`mogzyAudio`), `src/lib/audio/useSfx.ts` (`useSfx()` → `{play, stop, preload}`), registry `src/lib/audio/sfx-registry.ts`.
- **Cues:**
  - Victory/defeat/draw: `ranked.match.victory` :105, `ranked.match.defeat` :106, `ranked.match.draw` :107.
  - Match start and points: `ranked.duel.begin` :92, `ranked.opponent.found`, `ranked.round.final`, `ranked.points.awarded`.
  - Reveal and countdown: `broadcast.reveal`, `broadcast.transition`, `quiz.countdown.tick/urgent/final`.
- **Mute:** localStorage `mogsy-sounds-muted`.

**Design tokens:**
- **`.theme-lol`** (`src/index.css:462`): navy background, gold `--primary`, teal `--secondary`, Cinzel for h1/h2.
- **Layout height:** `--app-viewport-h`. Never use `100dvh`.
- **Plates:** `.ranked-beat*` reveal plates (`index.css` around 16712–16780).
- **Palette constants:** `SURFACE` and `GOLD_TEXT` (`worlds-experience/parts.tsx`), `LEAGUECRAFT_INK` and `LEDGER_INK` (`src/components/quiz/leaguecraft-ink.ts`).
- **Champion art:** from the backend via `src/hooks/useChampionAssets.ts` (`getChampionSplash/Icon/Cutout`), not from Data Dragon.
- **Team crests:** `src/components/pro-play/media/EntityCrest.tsx` (`TeamCrest`, `PlayerPortrait`).

**Art that does not exist:**
- No trophy, podium or confetti art or component on main.
- No user avatars beyond the mascot and role art: `public/mascot/*`, `public/mascot/ranked/*`, `public/assets/ranked/mogzy-role-icons/*.svg`, `public/images/ranked/crowns/*`.

**Combat Theater (PR #115, `combat-v4/theater-prototype`, draft, not merged):**
- framer-motion `useAnimate` plus `motion.path` strike lines.
- Scrub/step/pin controller (`src/lib/combat-theater/useTheaterController.ts`).
- Ghost HP bar and timeline/transport controls.
- Useful as a pattern for bracket "replay" scrubbing.

### 2.7 Prior plans and documents

| Doc | Where | Relevance |
|---|---|---|
| `DCGI1_HANDOFF.md` | FE main | Read-only tournament page. **Rule: never derive seeds, eliminations or future opponents; TBD stays TBD.** |
| `docs/handoffs/{PW1,PW4-B,UX1,UX2,UX3A,UX3C,UX4-NOSCROLL}.md` | FE main | Worlds bracket UI. UX4 holds the zero-scroll rules. Its header says "Not merged", but git shows it merged. |
| `JOURNEY_LIBRARY_HOST_FRONTEND_HANDOFF.md` | FE main | Defines **"host" = the product surface that launched a match** (`MatchHost`), not a person |
| `PRO_PLAY_QUIZ_ARENA_HANDOFF.md` | FE main | **"Arena" already names the match stage** (`CanonicalArena`) |
| `docs/COM1_SOCIAL_AUDIT.md` §D | FE main | "Invite" already means six things. Invite rules: friends only, blocks fail closed, 15-minute TTL, at most 5 pending per sender, idempotent per pair |
| `docs/handoffs/public-game-modes.md` | FE + BE | Bonus modes: guests allowed, unrated, repeatable |
| `docs/naming-premium-vs-pro-play.md` | FE main | Binding: "Premium" is the subscription; "Pro" means pro play only |
| `roguelike/rog0-worlds-dynasty-audit`: `docs/roguelike/WORLDS_DYNASTY_ROG0_AUDIT.md` | FE branch (pushed, unmerged) | Plans an 8-team single elimination (QF Bo3, SF Bo3, F Bo5) via a `TournamentBracket` adaptation (line 542). Never built. |
| `DCGI_2026_RESEARCH.md`, `NEW_MODES_*`, `MOGZY_STUDIO_*`, `CAPACITY_LAUNCH_HANDOFF.md` | **Untracked** in the owner's FE clone root | Research. DCGI research gap G2 is "no tournament/event model". |
| `docs/WORLDS_DYNASTY_DATA{1,2}_*.md` | Untracked in the owner's BE clone; also committed on `roguelike/data3-dynasty-certification` (unmerged) | Dynasty rating data. Not relevant to user tournaments. |
| `roadmap.md` | FE main | Nothing on tournaments |

---

## 3. Reuse inventory (exact paths)

**Verdict key:**
- **Reuse:** import as-is.
- **Fork:** copy into the new feature and generalize. Do not edit the original, because Worlds is live.
- **Pattern:** follow the design and write new code.
- **Ref:** look only.
- **Avoid:** do not use.

### 3.1 Frontend, on `origin/main`

| Path | Exports | Verdict | Use in Arena |
|---|---|---|---|
| `src/components/pro-play/tournament/TournamentBracket.tsx` | `BracketMatchCard` :79, `Connectors` :221, `useBracketEdges` :286, `SingleElimStage` :406, `DoubleElimStage` :344, `ChampionBanner` :444, `BracketSelectContext` :63 | **Fork** | Base of the bracket. Remove the `bracket_authority`/`useKit`/`TeamCrest`/`matchHref` coupling and add motion. |
| `src/components/pro-play/tournament/TournamentParts.tsx` | `TournamentKitProvider` :53, `TeamLine` :143, `MatchLine` :208 | Fork | Entrant line and match line |
| `src/lib/pro-play/tournamentV2View.ts` | `winnerEdges` :217, `routesFrom` :204, `singleElimRounds` :332 | Fork (pure) | Edge and route logic. Drop the cell-name regex layout. |
| `src/lib/pro-play/tournamentApi.ts` | `SlotSource` :169, `TournamentMatchV2` :186 | Pattern | Mirror the slot-source graph in the Arena contract (§6) |
| `src/components/pro-play/worlds-experience/fit.tsx` | `FitCascade`, `FitPages`, `Pager`, `ViewTabs`, `rowsThatFit` | **Reuse** | Whole bracket → tight → one round at a time |
| `src/components/pro-play/worlds-experience/motion.ts` | `EASE_OUT`, `DURATION`, `OFFSET`, `slideVariants`, `slideTransition` | **Reuse** | Screen and panel transitions |
| `src/components/pro-play/worlds-experience/ExperienceContext.tsx` | `DESKTOP_QUERY`, `LANDSCAPE_QUERY`, URL-state pattern | Reuse queries; pattern for state | Deep-linkable round and node focus |
| `src/components/pro-play/worlds-experience/KnockoutWorkspace.tsx` | round-focus mode | Ref | Phone one-round view |
| `src/components/pro-play/worlds-experience/Detail.tsx` | `MatchSheet` :177 (draggable bottom sheet) | Fork | Node detail sheet on phones |
| `src/lib/pro-play/worldsExperience/viewportLock.ts` | `useViewportLock` | Reuse | Zero-scroll page lock |
| `src/hooks/useReducedMotionPreference.ts` | `useReducedMotionPreference`, `APP_REDUCE_MOTION_CLASS` | **Reuse (mandatory)** | The only reduced-motion source |
| `src/lib/motion/useReveal.ts` | `useMotionAllowed` :85, `staggered` :76, `canAnimate` :27, `useReveal` :41 | Reuse | Staggered round reveals |
| `src/lib/motion/usePlaybackClock.ts`, `easing.ts` | `usePlaybackClock`, `easeOutCubic`, … | Reuse | Bracket replay timeline |
| `src/components/ranked-arena/RankedEntryIntro.tsx` | `RankedEntryIntro` | Reuse/Ref | VS intro before a node's match |
| `src/components/ranked-arena/RankedMatchOutro.tsx` | `RankedMatchOutro` | Reuse | Per-match result beat |
| `src/components/ranked-arena/RoundResultBeat.tsx` | `BeatPlate`, `BeatBody`, `RESULT_TONE` | Reuse | Round-complete plates |
| `src/components/game-results/*` | `ResultHero`, `useCountUp`, `EarnedXpValue`, `GameResultsShell` | Reuse | Score count-ups and final standings |
| `src/components/mascot/RoleMascot.tsx`, `mascot-assets.ts` | `RoleMascot` (`cheer`/`celebrate`), `MOGZY_MASCOT_ASSETS` | Reuse | Entrant avatars and champion celebration |
| `src/components/ranked-arena/RoleEmblem.tsx`, `src/lib/ranked/crowns.ts` | `RoleEmblem`, `resolveCrownArt` | Reuse | Entrant identity and tier |
| `src/lib/audio/useSfx.ts`, `sfx-registry.ts` | `useSfx`, `SFX_REGISTRY` | **Reuse** | Register new `arena.*` cues alongside the `ranked.*` ones |
| `src/pages/quiz-ranked/QuizRankedMatch.tsx` | props `onSessionComplete`, `host`, `chrome`, `onTerminalNavigate` | **Reuse** | Plays each Arena match. No new match UI is needed. |
| `src/lib/ranked-core/flow/matchHost.ts` | `hostedMatchSettled` :71 | **Reuse** | Arena intro/outro around a canonical match |
| `src/lib/ranked-public/matchHost.ts` | `MATCH_HOST` | Extend | Add `tournament` (mirrors the BE) |
| `src/lib/ranked-public/rankedInvite.ts` | gateway seam (always "unavailable") | **Extend** | Real gateway once the BE invite endpoint lands. Keep the "no pretend success" rule. |
| `src/lib/ranked-public/{client,contracts}.ts` | typed envelopes | Pattern | Arena client |
| `src/lib/backend-auth.ts` | `getBackendAuthHeaders`, `ensureBackendAuthToken` | Reuse | Auth header for `/api/arena/*` |
| `src/hooks/useChampionCardDuelInvites.ts`, `src/components/hud/MogzyIdentityMenu.tsx`, `FriendActionMenu.tsx` | invite inbox and bell | Pattern | Arena invite inbox in the same bell |
| `src/hooks/useFriends.ts`, `src/lib/community/*`, `src/lib/league-profiles` | friends, blocks, profiles | Reuse | Invite picker |
| `src/features/playtest-director/*` | revision CAS, realtime plus poll fallback | Pattern | Live lobby refresh |
| `src/pages/admin/ranked/RankedFormatBuilder.tsx`, `src/lib/admin/rankedFormatApi.ts`, `rankedFormatEditing.ts` | format editing UI | Fork | Host Portal "rules" step |
| `src/lib/public-modes/{contracts,gallery,launch}.ts` | `PUBLIC_MODE_IDS`, `MODE_ACCENT`, `MODE_COLLECTIONS` | Reuse | Game-type picker cards and accents |
| `src/hooks/useChampionAssets.ts`, `src/components/pro-play/media/EntityCrest.tsx` | champion art, `TeamCrest` monogram fallback | Reuse | Card art |
| `src/components/AdminRoute.tsx`, `src/hooks/useOwnerAuth.ts` | owner guard plus MFA step-up | Reuse | Owner moderation pages |
| `src/components/quiz-broadcast/BroadcastRenderer.tsx` | internal `GoldCoinShower`, `SparkleField`, `FinalCountdownOverlay` (**not exported**) | Ref | Particle and countdown look |
| `src/components/quiz/RankedLobbyHero.tsx`, `LobbyPanel.tsx` | lobby visuals | Ref | Visual language for the Arena home |
| `src/lib/quiz-broadcast/liveSync.ts`, `src/pages/BroadcastLiveView.tsx` | OBS overlay from a Supabase row | Ref | Possible future stream overlay of a bracket |
| `src/lib/pro-play/__fixtures__/worldsScenarios.ts`, `src/pages/dev/worlds-experience/scenarios.ts` | phase simulators | Pattern | Arena fixture scenarios |
| `src/lib/pro-play/featuredTournament.ts`, `tournamentView.ts` `KNOCKOUT_ROUNDS` | hardcoded Worlds lists | **Avoid** | |
| `supabase/migrations/20260309040233_*` (`multiplayer_*`), legacy `matches` | retired | **Avoid** | |

### 3.2 Frontend, branch-only but pushed

| Branch (PR) | Merged? | What to take |
|---|---|---|
| `roguelike/rog1d1-dynasty-frontend` (#44, open) | No | `src/pages/admin/dynasty/MatchStage.tsx` (stepped reveal pattern with resume and reduced-motion short-circuit); `admin/dynasty/parts.tsx` `PlayerCard` :131, `RosterRail` :199, `PhaseRail` :50 |
| `combat-v4/theater-prototype` (#115, draft) | No | `src/lib/combat-theater/useTheaterController.ts` (scrub/step/pin); `src/components/combat-theater/{TheaterTimeline,TheaterTransport}.tsx`. A pattern for "replay the tournament". |
| `roguelike/rog0-worlds-dynasty-audit` | No | Docs only (bracket plan, line 542) |

### 3.3 Frontend, Dynasty visual stack (backed up to origin 2026-10-21; **unmerged**)

All of these form one linear stack forked from `6407559a` (2026-10-16), 389 commits behind `origin/main`. **`ux/ux6-dynasty-management` (`0e187917`, 19 ahead) contains every commit**, apart from the diverged duplicate `vis/vis-f2-support-docs`. Use it as the single source.

| Path on `ux/ux6-dynasty-management` | Exports | Verdict |
|---|---|---|
| `src/pages/dev/dynasty-v2/cinematics.tsx` | `FullFrame` :190 (`championship`, `finals_intro`) | **Extract** → generic `ChampionCelebration` and `FinalsIntro` |
| `src/pages/dev/dynasty-v2/broadcast.tsx` | `StingerHost` :90, `useStinger` :124 | **Extract** (already generic) → round-complete and "Semifinals" title plates |
| `src/pages/dev/dynasty-v2/screens.tsx` | `BoPips` :438, `SeriesScreen` :533, `EndScreen` :567, `SeasonScreen` :182 | Extract `BoPips`; ref the rest |
| `src/pages/dev/dynasty-v2/parts.tsx` | `Pips` :169, `SevenPips` :327, `LeadMeter` :344, `useCountUp` :363, `Crest` :42, `Monogram` :70, `accentStyle` :36 | Extract the pips and `accentStyle` (per-entrant accent variables) |
| `src/pages/dev/dynasty-v2/{walkout,lock,environments,spotlight}.tsx` | `WalkoutSequence` :25, `DraftLockSequence` :17, `TrophyHall` :415 | Ref; optional for a finals walkout |
| `src/pages/dev/dynasty-v2/audio.ts` | `playCue`, `playMoment`, `hush`, `MOMENT_CUES` | Pattern. Port chosen moments into `sfx-registry.ts` as `arena.*` generators, rather than shipping a second audio engine. |
| `src/pages/dev/dynasty-v2/{vis,vis-f2,vis-f3,vis-f4}.css` | `dyn-confetti`, `dyn-champ-*`, `dyn-stinger`, `dyn-slide-l/r`, `dyn-stamp`, `dyn-matchpoint`, `dyn-node`, … | Extract chosen keyframes. Rename the prefix (e.g. `ta-`), re-scope from `.dyn`, and keep the "motion only under an opt-in class" rule. |
| `src/pages/dev/dynasty-v2/bo5/{Bo5Flow,present}.ts(x)` | `Bo5Flow` :227, `matchPoint` :77 | Pattern for series state |

**How to read this code without merging.** From any mogsy clone, after `git fetch origin`:

```
git show origin/ux/ux6-dynasty-management:src/pages/dev/dynasty-v2/cinematics.tsx
git ls-tree -r --name-only origin/ux/ux6-dynasty-management -- src/pages/dev/dynasty-v2
```

- **Copy** what you need into the new feature folder.
- **Do not** merge, rebase or cherry-pick the stack. It is 389 commits stale and conflicts in `src/App.tsx`.
- It imports these main modules, which may have drifted since the fork: `@/lib/motion/useReveal`, `@/lib/audio/useSfx`, `@/components/pro-play/worlds-experience/parts`, `EntityCrest`, `RoleEmblem`, `MogzyMascot`.

### 3.4 Backend, on `origin/master`

| Path | Symbols | Verdict | Use |
|---|---|---|---|
| `ranked_public/service.py` | `create_match_rows` :2682 (`format_override`, `host`, `creation_source`), `_commit_result` :2481, `_record_ranked_completion` :2451, `_require_membership` :2595, `has_active_match` :2610, `LifecyclePolicy` :984, `effective_format`, `_stored_format` (lru 64) | **Reuse; one hook added** | Create Arena matches; call the advancement hook from `_commit_result` and the forfeit/disconnect terminal paths |
| `ranked_public/host.py` | `MatchHost`, `HOST_DIRECT`, `PARENT_*` | **Extend** | Add `HOST_TOURNAMENT` and `PARENT_ARENA_EVENT` |
| `ranked_public/rating.py` | `RATED_CREATION_SOURCES` :83 | Decide | Use a new `creation_source="arena"`, kept out of the rated set unless the owner decides otherwise |
| `ranked_formats/schema.py`, `ranked_rulesets/{contract,apply}.py` | `RankedFormat.validate`, `SegmentSpec`, `apply_ruleset` | **Reuse** | Validate host-chosen rules server-side |
| `ranked_public/builder_catalog.py`, `format_config.py` | module allow-list, saved targets | Extend | Host-facing settings schema per game type |
| `public_game_modes/catalog.py`, `ranked_public/service.py` `PRESET_FORMATS` | `MODES`, preset formats | Reuse | Game-type catalog for the Host Portal |
| `ranked_public/worker.py` | lifecycle and pairing sweep (15 s) | Reuse | **Required** for unattended tournaments. It is off by default (`RANKED_LIFECYCLE_WORKER_ENABLED`). |
| `ranked_public/projections.py`, `answer_safety.py` | pre-reveal safety | Reuse | Any bracket projection that embeds live match state must pass through these |
| `stat_check_public/{rooms,friend_invites}.py`, `migrate_add_stat_check_friend_invites.py` | room code, ready-check, `sc_friend_invites` | **Pattern** | Copy the design for `arena_invites` |
| `services/community_identity.py` | friendship and block checks with the caller's JWT | **Reuse** | Invite eligibility |
| `services/platform_policy.py` | `QUEUE_MODE_KEYS`, `queue_mode_enabled` | Extend | Add `queue_arena_enabled` |
| `routes/_auth.py`, `routes/supabase_auth.py` | `require_admin`, `require_account_identity`, `require_write_identity` | Reuse | Endpoint guards |
| `daily_challenge/wiring.py` (around :988) | parent pulls child results | Pattern | A parent orchestrating child matches |
| `routes/ranked_duel.py`, `ranked_duel_match_service.py` | in-memory staff duel | **Avoid** | Not durable |

### 3.5 Backend, branch-only

| Branch | Location | Merged? | Relevance |
|---|---|---|---|
| `roguelike/rog1c1-dynasty-run-foundation` | pushed; tip `a97559e8` (the previously unpushed commit was pushed 2026-10-21) | No | Append-only actions with `UNIQUE(run_id, action_id)` and `expected_seq` idempotency. A good pattern for `arena_actions`. |
| `roguelike/wd-v2-e3a-management` (+ a1/a2/e2-*, e3b-campaign) | backed up 2026-10-21 | No | Bo5 series service (`dynasty/combat_v2/series/*`). Reference only for series state. Simulated, not human play. |

---

## 4. Target architecture

```
                         ┌──────────────────────────────── Supabase ───────────────────────────────┐
                         │ auth (JWT) · profiles/display_name · friendships · user_blocks          │
                         │ Realtime PRESENCE channel  arena:event:{eventId}  (who is here, no DB)  │
                         │ (later) user_notifications via SECURITY DEFINER trigger/RPC             │
                         └───────────────▲───────────────────────────────▲─────────────────────────┘
                                         │ caller JWT (PostgREST)        │ presence track()
┌──────────────────────── Mogzy FE (Lovable) ─────────────────┐          │
│ /quiz/arena            Arena home (browse, my events)        │──────────┘
│ /quiz/arena/e/:id      Event view: lobby → animated bracket  │  poll GET /api/arena/events/:id?since_revision=N
│ /quiz/arena/join/:code Join by capability code               │  (5 s live · 15 s idle · pause when hidden)
│ /quiz/arena/host       Match Host Portal (create wizard)     │
│ /quiz/arena/host/:id   Organizer console (seed, start, DQ)   │──┐ POST /api/arena/…
│ /admin/arena           Owner moderation (AdminRoute)         │  │
│ match play  → QuizRankedMatch host="tournament" (existing)   │──┼─ existing /api/ranked/matches/* (unchanged)
└──────────────────────────────────────────────────────────────┘  │
┌──────────────────────── LCS BE (Railway, FastAPI, SQLite) ──────▼───────────────────────────────┐
│ routes/arena_public.py  /api/arena/*      routes/arena_admin.py  /api/arena/admin/* (require_admin)│
│ arena/ (PROPOSED pkg): events · entrants · invites · bracket gen · advancement · projections   │
│   ├─ node ready → ranked_public.service.create_match_rows(                                     │
│   │      creation_source="arena", host=MatchHost(HOST_TOURNAMENT, parent=arena_event, stage=node),│
│   │      format_override=<frozen event format>)                                                 │
│   └─ ranked _commit_result / forfeit / disconnect ──(same tx)──► arena.on_match_terminal(match) │
│        → update node wins → series done? → winner → fill next slot (winner_of) → revision++     │
│ ranked_* tables (unchanged)       arena_* tables (NEW)        worker.py sweeps no-shows/deadlines│
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Why the backend owns the data and Supabase does not:**
- Match creation (`create_match_rows`) and result commit (`_commit_result`) run inside SQLite transactions on Railway.
- Bracket advancement must be atomic with the result, otherwise a crash between "match done" and "winner advanced" corrupts the bracket.
- The backend deliberately has no service-role key, so it cannot write Supabase tables.

**Why realtime is polling plus Presence, and not Broadcast:**
- Only the backend knows the true state, and it cannot publish to Supabase Realtime.
- A client "broadcast" would be unauthenticated as a source of truth.
- So the bracket is fetched from `/api/arena/events/:id` keyed by `revision`, which is cheap and read-only.
- Supabase Presence carries only "who is in the lobby" and puts no load on SQLite.
- This matches the house rule: realtime is a signal, never the authority (PLAY1, social-realtime).

**Naming:**
- **Product names** stay "Tournament Arena" and "Match Host Portal".
- **Code names** avoid the existing meanings:
  - "Arena" = `CanonicalArena` / `src/components/ranked-arena`.
  - "host" = `MatchHost` provenance.
- **Proposed:**
  - BE package `arena/`, tables `arena_*`, route prefix `/api/arena`.
  - FE folder `src/features/tournament-arena/`; components prefixed `TournamentArena*` / `HostPortal*`.
  - The person running an event is the **organizer** in code. Never call them "host".
  - The `MatchHost` value is `"tournament"`.

---

## 5. Backend requirements (PROPOSED; none exist)

### 5.1 Flags and policy (all fail closed)

- **`ARENA_ENABLED`** (env): the master switch. Every `/api/arena/*` route returns 404 `ARENA_DISABLED` when off. This mirrors the `DYNASTY_ENABLED` pattern.
- **`app_settings.queue_arena_enabled`** via `services/platform_policy.py` `QUEUE_MODE_KEYS`: a runtime pause with owner bypass, the same as `queue_ranked_enabled`.
  - It must be **independent** of the Ranked queue pause. Arena does not use `/api/ranked/queue`.
- **Dependencies:**
  - Arena matches run on the Ranked engine, so `RANKED_PUBLIC_ENABLED` must be on.
  - Each chosen game type must have its module flags (e.g. `RANKED_MODULE_ITEM_COST_DUEL_ENABLED` for formats that include Meta Reflex).
- **Worker:** `RANKED_LIFECYCLE_WORKER_ENABLED` must be on in any environment that runs tournaments, so that no-shows and deadlines resolve without a client polling.

### 5.2 Tables (SQLite, new `migrate_add_arena.py`, additive and idempotent like the other `migrate_add_*.py`)

| Table | Key columns |
|---|---|
| `arena_events` | `event_id` PK (`aev_…`), `kind` (`duel`/`match`/`tournament`), `title`, `organizer_user_id`, `visibility` (`private`/`link`/`public`), `status` (`draft`/`open`/`locked`/`running`/`complete`/`cancelled`), `game_type`, `format_snapshot_json` (frozen `RankedFormat` once locked), `best_of` (1/3/5), `bracket_type` (`single_elimination` in v1), `max_entrants` (≤16 in v1), `rated` (default 0), `join_code` (server-generated, high entropy, unique), `starts_at`, `revision` INTEGER, `created_at`, `updated_at` |
| `arena_entrants` | PK (`event_id`, `user_id`); `profile_id`, `display_name` (snapshot), `role` (`organizer`/`cohost`/`player`), `status` (`invited`/`joined`/`checked_in`/`withdrawn`/`eliminated`/`champion`), `seed`, `joined_at` |
| `arena_nodes` | PK (`event_id`, `node_id`); `round`, `position`, `section` (`main`; later `upper`/`lower`/`grand_final`), `slot_a_source_json` / `slot_b_source_json` (`{kind: "seed", seed}` \| `{kind: "winner_of", node_id}` \| `{kind: "loser_of", node_id}` \| `{kind: "bye"}`), `entrant_a`, `entrant_b`, `best_of`, `wins_a`, `wins_b`, `status` (`pending`/`ready`/`live`/`complete`/`walkover`/`bye`), `winner_user_id`, `completed_reason`, `ready_deadline` |
| `arena_node_games` | PK (`event_id`, `node_id`, `game_index`); `match_id` (FK-like → `ranked_matches.match_id`, UNIQUE), `winner_user_id`, `outcome` (`decisive`/`draw`/`forfeit`/`no_contest`) |
| `arena_invites` | `invite_id` PK, `event_id`, `sender_user_id`, `recipient_profile_id`, `token` (opaque), `status` (`pending`/`accepted`/`declined`/`cancelled`/`expired`), `expires_at`. Unique pending invite per (event, recipient). Copy the `sc_friend_invites` rules: friends only, blocks fail closed, TTL, a per-sender pending cap. |
| `arena_actions` | Append-only audit: `event_id`, `action_id` UNIQUE per event (idempotency), `actor_user_id`, `kind`, `payload_json`, `expected_revision`, `at`. Copy the Dynasty `UNIQUE(run_id, action_id)` / `expected_seq` idea. |

### 5.3 Endpoints (`routes/arena_public.py`, prefix `/api/arena`; identity `require_account_identity`, so anonymous callers get 403)

| Method & path | Who | Behaviour |
|---|---|---|
| `GET /catalog` | any account | Eligible game types (§2.4 "Eligible" rows), each with a **settings schema** derived from `builder_catalog` and preset formats, plus limits (`max_entrants`, `best_of` options) |
| `POST /events` | any account (see decision D2) | Create a draft event. The server validates the format via `RankedFormat.validate()` / `apply_ruleset`. Returns `join_code`. |
| `GET /events?scope=mine\|joined\|public` | any account | List |
| `GET /events/{id}?since_revision=N` | entrant, organizer, or anyone for `public`/`link` | Event projection (§6). Returns `{unchanged: true, revision}` when nothing changed. **Never** includes `user_id`; use `profile_id` and `display_name`. |
| `POST /events/{id}/join` (body `{code}` unless public) | account | Join. Checks capacity and status. |
| `POST /events/{id}/leave`, `/check-in` | entrant | |
| `POST /events/{id}/invites` | organizer/cohost | Friend invite (friend and block check via `community_identity`) |
| `GET /invites` · `POST /invites/{token}/accept\|decline` · `DELETE /invites/{id}` | recipient / sender | Inbox, polled at 30 s like `useChampionCardDuelInvites` |
| `POST /events/{id}/lock` | organizer | Freeze the format, assign seeds (random, or organizer order), generate `arena_nodes` with byes for non-power-of-two fields |
| `POST /events/{id}/start` | organizer | Mark round-1 nodes `ready`, set `ready_deadline` |
| `POST /events/{id}/nodes/{node}/play` | either node entrant | Idempotent. Creates (or returns) the node's current game: `create_match_rows(p1, p2, creation_source="arena", host=MatchHost("tournament", parent_activity_type="arena_event", parent_activity_id=event_id, parent_stage_index=<node ordinal>, parent_stage_kind="bracket_node"), format_override=<event format>)`. Returns `match_id`. Refuses with `RANKED_ACTIVE_MATCH_EXISTS` semantics if the user is in another match. |
| `POST /events/{id}/nodes/{node}/resolve` | organizer | Walkover or DQ, with an audit row |
| `POST /events/{id}/cancel` | organizer | |
| `GET/POST /api/arena/admin/*` | `require_admin` (owner) | List all, force-cancel, remove entrant, edit title (moderation) |

**"Custom duel"** is just `kind="duel"`, `max_entrants=2`, with one node and no bracket. The FE flow is: invite a friend → accept → `play` → the existing match UI.

### 5.4 Advancement hook (the one change inside the Ranked engine)

- In `ranked_public/service.py` `_commit_result` (:2481), and in the forfeit and disconnect terminal paths that write `ranked_results`, call `arena.on_match_terminal(cur, match_id)` **in the same transaction** when `ranked_matches.host == "tournament"`.
- On each call:
  - Record the game in `arena_node_games` and increment `wins_a`/`wins_b`.
  - If the series is decided: set `winner_user_id`, set the loser to `eliminated`, fill every node whose slot source is `winner_of(node)` (or `loser_of`), mark those nodes `ready` once both slots are filled, and bump `arena_events.revision`.
  - If it was the final: set the event to `complete` and the winner to `champion`.
- **Draws** (points ties are possible): see decision D4. The safest v1 is to not count the game and require one more game in the node.
- **No-shows:** in `ranked_public/worker.py`, sweep `ready` nodes past `ready_deadline`. If one side never called `play`, award a walkover; if neither did, the organizer resolves it.
- **Keep the existing rule:** `_record_ranked_completion` "never completes the PARENT activity". The new hook is a separate, explicit call so the boundary stays visible.

### 5.5 Backend tests to require

- Bracket generation for 2–16 entrants with byes.
- Advancement for Bo1, Bo3 and Bo5.
- Draw replay; forfeit and disconnect advancement; walkovers.
- Idempotent `play` (double-click creates one match).
- Concurrent `play` from both entrants creates one match (per-match lock or `BEGIN IMMEDIATE`, like `queue.join_queue`).
- Projection safety: no `user_id`, no pre-reveal fields, passes `answer_safety`.
- Flags off → 404 or 503.
- Rating is untouched when `creation_source="arena"`.

---

## 6. Frontend ↔ backend contract (PROPOSED; this is what Fable builds against)

Put it in `src/features/tournament-arena/contracts.ts`, with a validator in the same style as `src/lib/ranked-public/contracts.ts`. This shape mirrors the pro-play `SlotSource` graph on purpose, so the forked bracket logic carries over.

```ts
export type ArenaEventKind = "duel" | "match" | "tournament";
export type ArenaEventStatus = "draft" | "open" | "locked" | "running" | "complete" | "cancelled";
export type ArenaSlotSource =
  | { kind: "seed"; seed: number }
  | { kind: "winner_of"; node_id: string }
  | { kind: "loser_of"; node_id: string }
  | { kind: "bye" };
export type ArenaNodeStatus = "pending" | "ready" | "live" | "complete" | "walkover" | "bye";

export interface ArenaEntrant {
  profile_id: string;            // never auth user_id
  display_name: string;
  seed: number | null;
  status: "invited" | "joined" | "checked_in" | "withdrawn" | "eliminated" | "champion";
  role: "organizer" | "cohost" | "player";
  role_emblem?: "top" | "jungle" | "mid" | "bot" | "support" | null; // ranked role identity, if any
}
export interface ArenaSlot { source: ArenaSlotSource; profile_id: string | null; wins: number }
export interface ArenaNode {
  node_id: string; round: number; position: number; section: "main";
  best_of: 1 | 3 | 5; status: ArenaNodeStatus;
  slots: [ArenaSlot, ArenaSlot];
  winner_profile_id: string | null;
  current_match_id: string | null;  // only for the viewer's own node, so the viewer can jump into play
  ready_deadline: string | null;
}
export interface ArenaEvent {
  contract_version: "arena_event.v1";
  event_id: string; kind: ArenaEventKind; status: ArenaEventStatus; revision: number;
  title: string; game_type: string; best_of: 1 | 3 | 5; max_entrants: number; rated: boolean;
  organizer_profile_id: string; viewer_role: "organizer" | "cohost" | "player" | "spectator";
  join_code?: string;               // organizer only
  entrants: ArenaEntrant[];
  bracket: { type: "single_elimination"; rounds: number; nodes: ArenaNode[] } | null;
  champion_profile_id: string | null;
  server_now: string;               // anchor client clocks as the Ranked timer does
}
```

**Gateway seam:** follow `src/lib/ranked-public/rankedInvite.ts`. Define an `ArenaGateway` interface with two implementations:
- `fixtureArenaGateway`: DEV only. Drives scripted scenarios.
- `httpArenaGateway`: real.

In production, until the backend ships, the gateway must report itself **unavailable**. It must never pretend success.

---

## 7. Visual implementation instructions (for Fable)

### 7.1 Where things go

- **Feature folder:** `src/features/tournament-arena/` with these subfolders:
  - `contracts.ts`, `gateway/` (fixture and http), `fixtures/` (scenarios)
  - `bracket/` (pure `layout.ts`, `TournamentArenaBracket.tsx`, `TournamentArenaNodeCard.tsx`, `TournamentArenaConnectors.tsx`)
  - `ceremony/` (`FinalsIntro.tsx`, `ChampionCelebration.tsx`, `RoundStinger.tsx`, `SeriesPips.tsx`)
  - `lobby/`, `portal/` (create wizard), `motion.ts`, `audio.ts` (cue ids only), and a scoped `tournament-arena.css` with the `ta-` prefix.
- **Pages:** `src/pages/arena/` (`ArenaHomePage`, `ArenaEventPage`, `ArenaJoinPage`, `HostPortalPage`, `HostConsolePage`).
- **DEV harness first:** `src/pages/dev/tournament-arena/TournamentArenaDev.tsx`.
  - Register it with the existing pattern: `const X = import.meta.env.DEV ? lazy(() => import(...)) : null` plus `{X ? <Route …/> : null}` (see `src/App.tsx` around 257–323 and 803–840).
  - Route: `/dev/tournament-arena`.
  - Include a scenario switcher (4/8/16 entrants, byes, Bo3 mid-series, final pending, champion crowned), a `?motion=reduce` override and a "step result" button that advances a fixture node.
- **Production routes (when wired):**
  - Put them under **`/quiz/arena/*`**. That path already gets `dark theme-lol` before first paint (`index.html:148-170` checks `/lol`, `/quiz`, `/combat-lab`).
  - A new top-level `/arena` would flash the wrong theme unless `index.html` and `src/lib/startup-shell.ts` are both updated.
  - Register them before the catch-all `/:slug` (`src/App.tsx:886`).
  - Owner moderation goes under `/admin/arena` inside `AdminRoute`.
- **Do not edit** `src/components/pro-play/tournament/*` or `worlds-experience/*`. Worlds is live (`.env:5`). **Fork** into the feature folder, and import only the generic pieces listed as "Reuse" in §3.1.

### 7.2 Bracket layout

- **Layout is pure.** Compute node positions from `(round, position)` and the slot-source graph in `bracket/layout.ts`.
  - Do not use DOM cell names (the pro-play `doubleElimLayout` regexes) for layout.
  - Make connector geometry deterministic from the layout, so `pathLength` animations have stable paths.
  - The measured `useBracketEdges` approach is fine as a fallback for variable-height cards, but it re-measures on resize.
- **Sizes:**
  - Support 2–16 entrants, with byes rendered as quiet ghost slots.
  - Round names come from the count: Final, Semifinals, Quarterfinals, Round of 16.
  - Never hardcode them the way `tournamentView.ts` `KNOCKOUT_ROUNDS` does.
- **Fit:** use `FitCascade`. The order is whole bracket → tight bracket → one round at a time with `Pager`/`ViewTabs`.
  - Phones always show one round at a time.
  - Use `LANDSCAPE_QUERY` for landscape phones.
  - Frame height is `h-[var(--app-viewport-h)]` with `overflow-clip`, following the zero-scroll rules in `docs/handoffs/UX4-NOSCROLL.md`.
- **Safe areas:** `index.html:11` has **no `viewport-fit=cover`**, so `env(safe-area-inset-*)` reads 0 on iOS. Don't rely on insets unless the owner approves changing the meta tag.
- **Truthfulness (DCGI rule):** future slots show "Winner of SF1" / "TBD", never a projected name. Only render a winner when the contract says so.

### 7.3 Motion beats (framer-motion ^12, already installed; no new animation dependencies needed)

| Beat | Trigger | Spec | Reduced motion |
|---|---|---|---|
| Bracket reveal | First paint of a locked bracket | Rounds stagger left to right (`staggered()` from `useReveal.ts`); cards rise and fade; connectors draw with `pathLength` 0→1 after their source card lands | Final state, opacity only (≤120 ms, as in `motion.ts`) |
| Live node | `status === "live"` | A slow breathing ring on the card (reuse the `dyn-node` / `ranked-entry-breathe` feel); "LIVE" pill | Static ring, no pulse |
| Game result inside a series | `wins_*` increments | `SeriesPips` pip stamps in (`dyn-stamp` feel); score count-up (`useCountUp`); "Match point" pulse (`dyn-matchpoint`) | Pips appear filled; no pulse |
| Advancement | Node `complete` and the next slot filled | Winner chip glides along the connector into the next slot (shared `layoutId` = `${event_id}:${profile_id}`, which framer already uses elsewhere, e.g. `StagesScreen.tsx:87`). The connector from winner to next node turns gold; the loser card desaturates. | Swap in place; connector colour changes without travel |
| Round complete | All nodes in a round complete | `RoundStinger` title plate ("Semifinals"), one at a time, `aria-live` (port of `StingerHost`) | Plate shows briefly, no slide |
| Finals intro | Final node becomes `ready`, or the viewer opens it | `FinalsIntro`: crests and portraits slide in from both sides, "VS" stamp; skippable with tap/Esc/Enter/Space; auto-dismiss at 3 s (port of `FullFrame finals_intro`) | Single static VS frame, dismissible |
| Champion | Event `complete` | `ChampionCelebration`: black → flash → trophy rises → conic rays → CSS confetti (about 36 pieces) → champion name in Cinzel → `RoleMascot` `celebrate` (port of `FullFrame championship`). Replay button in the event header. | Static trophy plate with the name; no confetti or rays |
| Match handoff | Viewer taps "Play" on their node | Short `RankedEntryIntro`, then the existing `QuizRankedMatch` with `host="tournament"`; on `onSessionComplete`, return to the bracket and play that node's advancement beat | Existing component behaviour |

**Motion rules:**
- Animate only `transform` and `opacity`, plus SVG `pathLength` / `stroke`.
- Never animate layout properties of large lists.
- Keep beats short and skippable. The Dynasty spec principle is "speed over spectacle".
- **Every beat must be idempotent on resume:** opening an already-finished event shows the final state, not a replay. This is the `MatchStage.tsx` pattern, where a resumed result shows everything at once.
- **Reduced motion:** use `useReducedMotionPreference()` / `useMotionAllowed()` only.
  - CSS keyframes must be gated behind an opt-in class added by JS (the `.dyn-*--motion` pattern).
  - The global `html.reduce-motion *` rule (`src/index.css` around :3546) is the backstop.
- **Particles:** no confetti library is installed. Port the CSS confetti (`dyn-confetti` in `vis-f3.css` on the local branch) instead of adding a dependency. three.js is available but unjustified for a bracket.

### 7.4 Audio

- Use `useSfx()` only. Do not ship a second engine.
  - Reuse: `ranked.duel.begin`, `ranked.match.victory`, `ranked.match.defeat`, `ranked.match.draw`, `broadcast.reveal`, `broadcast.transition`, `quiz.countdown.*`.
  - Add new entries to `src/lib/audio/sfx-registry.ts` as built-in synth generators: `arena.bracket.reveal`, `arena.advance`, `arena.round.complete`, `arena.champion`. Port the shapes from the local-branch `dynasty-v2/audio.ts` `MOMENT_CUES`.
- Pass `eventId` for dedupe, so a cue never replays on poll.
- Reduced motion does not mute audio. `mogsy-sounds-muted` does.

### 7.5 Visual language

- **Theme:** `.theme-lol` tokens (`bg-background`, `bg-card`, gold `text-primary`, cyan `border-border`). Use Cinzel for display titles.
- **Surfaces:** `SURFACE` / `GOLD_TEXT` from `worlds-experience/parts.tsx`; `.ranked-beat__*` styling for plates.
- **Entrants are people, not teams.** Use the display name plus a `RoleMascot` or `RoleEmblem` (if the entrant has a Ranked role) plus a tier crown (`resolveCrownArt`).
  - Per-entrant accent comes from a deterministic hash of `profile_id` into a fixed palette (the `accentStyle` pattern).
  - Do not use pro team crests for users. Team-mark use is limited to trademark identification (`ProPlayMedia.test.tsx:10-12`).
- **Copy:** "Premium" is the subscription; "Pro" means pro play only. Don't call the organizer a "host" in UI strings that sit next to Ranked surfaces.

### 7.6 Accessibility

- The bracket is a `role="list"` of rounds, each with a list of nodes.
- Use `aria-current="step"` on the viewer's live node.
- Result changes are announced through an `aria-live="polite"` region (the `JourneyTransitionBeat` pattern).
- Every ceremony is keyboard-dismissible.
- Focus returns to the bracket node after the match.

### 7.7 Testing (mandatory rules from `AGENTS.md` / `CLAUDE.md`)

- **Vitest + Testing Library (jsdom)** for the pure `layout.ts`, contract validation, gateway behaviour, and reduced-motion branches.
  - `src/test/setup.ts` stubs `matchMedia` (always false) and `ResizeObserver`, so pass `desktop`/`landscape` explicitly in tests.
- **Never run local automated Edge/Chrome.** Browser or geometry checks go in a new `.github/workflows/tournament-arena-*.yml` with a `playwright.tournament-arena.config.ts` (bundled Chromium, `workers: 1`).
  - Follow the pattern of `quiz-hub-main-fit.yml`: geometry assertions plus screenshot artifacts. There is no visual-diff baseline in this repo.
- `tsconfig.app.json` has `strict: false`. Write strict-clean code anyway.

---

## 8. Constraints and risks (must respect)

1. **Two-seat engine:** every Arena match is 1v1. Team/FFA tournaments need engine work; out of scope.
2. **One active match per account** (`has_active_match`). Organizers can't schedule overlapping nodes for one player. The UI must explain the `RANKED_ACTIVE_MATCH_EXISTS` refusal.
3. **Capacity:**
   - The single SQLite writer and a single uvicorn process are the ceiling (untracked `CAPACITY_LAUNCH_HANDOFF.md`; `docs/ranked-public-service.md` says "Open public launch: NOT ready").
   - Cap v1 at 16 entrants and a small number of concurrent events.
   - Bracket polling must use `since_revision`, and must stop when the tab is hidden.
4. **No spectating of live matches** (`_require_membership`). Spectators see bracket state only. Live spectating needs a new safe projection.
5. **Cross-match content differs** (per-match random `order_seed`). Fair within a node, not identical across nodes. Same-content rounds are a v2 backend change.
6. **Ranked is paused publicly on the FE** (`PUBLIC_RANKED_COMING_SOON = true`). Arena must have its own entry point and policy key, and must not depend on the Ranked queue.
7. **Owner is the only admin.** There are no moderator roles (`block_legacy_privileged_role_write`). Per-event organizer/cohost authority lives in `arena_entrants.role`, not in `app_role`.
8. **Backend has no service-role key.** It cannot write `user_notifications`. Invite delivery v1 is a backend inbox polled by the client, like Champion Card Duel. Bell integration through Supabase needs a DEFINER RPC/trigger plus `user_notifications_v2_classify` and `src/lib/notifications/policy.ts`, later.
9. **Identity hygiene:** never expose auth `user_id` cross-user; use `profiles.id` and `display_name`.
10. **Supabase migration conventions** (if any SQL is added later):
    - Name files `YYYYMMDDHHMMSS_<workstream>_<desc>.sql`.
    - Apply them manually in the SQL editor with BEGIN/COMMIT; **never `supabase db push`** (the ledger has drifted).
    - Use SECURITY DEFINER RPCs for writes, RLS SELECT for reads, and a `supabase/verification/*_verify.sql` / `*_rollback.sql` pair.
    - The generated `src/integrations/supabase/types.ts` (5179 lines) is stale. Use a narrow `(supabase as any).rpc` until it is regenerated.
11. **Live Worlds UI** depends on `src/components/pro-play/tournament/*` and `worlds-experience/*`. Fork; don't modify.
12. **Dynasty branches are backed up but unmerged:**
    - The Dynasty visual stack (8 FE branches) and the v2 series and data backend (9 BE branches) were pushed to `origin` as-is on 2026-10-21. BE `rog1c1` was fast-forwarded to `a97559e8` the same day.
    - They are still unmerged and stale: FE is 389 commits behind main, BE about 200 behind master. Copy from them; do not merge them.
    - The untracked docs in both clones are still uncommitted. The two Dynasty data docs also exist on `roguelike/data3-dynasty-certification`, which is now pushed.
13. **Truthfulness:** never present projected pairings or outcomes as fact. No real-money prizes or entry fees exist anywhere, and none should be implied.
14. **Process:** no deploys, no merges to main without review, branch isolation, and test evidence (`CLAUDE.md`).

---

## 9. Owner decisions needed (recommendation first)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Rated? | **Unrated.** New `creation_source="arena"`, kept out of `RATED_CREATION_SOURCES`; `rated=false` on events |
| D2 | Who can organize? | **Owner-only beta**, then any signed-in account for duels and Premium for tournaments. Anonymous never. |
| D3 | v1 size and format | Single elimination, 2–16 entrants, Bo1/Bo3 (Bo5 final optional) |
| D4 | Draw rule | **Replay**: one extra game in the node until decisive (cap 2 replays; then the organizer resolves) |
| D5 | v1 game types | Ranked Quiz (`ranked_points_v2`), Match Grid, Reconstruct, Order Forge, Chronoscope, Roster Lock, Journey. Role Challenge and Champion Card Duel later. |
| D6 | Route namespace | `/quiz/arena/*` (inherits theme pre-paint) |
| D7 | Arena while public Ranked is paused? | Yes, behind its own `queue_arena_enabled` |
| D8 | Back up local-only Dynasty branches (push to origin as-is, no merge)? | **Done 2026-10-21.** The owner approved, and all 17 local-only branches plus the `rog1c1` fast-forward were pushed with no merge or PR. |
| D9 | Naming of "invite" | Follow COM1 §D: Arena uses "Challenge" (duel) and "Join code" (event); signup links stay "invite links" |
| D10 | Ready deadline for no-shows | 10 minutes per node in v1, organizer-adjustable |

---

## 10. Recommended build order

The work runs in two tracks. **Track F** (Fable, frontend visuals) needs no backend until F4. **Track B** (backend) can run in a separate session in parallel.

| Phase | Track | Deliverable | Depends on |
|---|---|---|---|
| **P0** | Owner | Answer D1–D7, D9 and D10 (D8 is done) | — |
| **F1** | FE | `contracts.ts` (§6), `fixtureArenaGateway`, scenarios, DEV route `/dev/tournament-arena` | — |
| **F2** | FE | Pure `layout.ts` plus static forked bracket (4/8/16, byes, phone one-round view, landscape, FitCascade) with unit tests | F1 |
| **F3** | FE | Motion and ceremony: reveal, live node, series pips, advancement glide, round stinger, finals intro, champion celebration, `arena.*` SFX, full reduced-motion parity. A CI Playwright geometry workflow. | F2; reads `origin/ux/ux6-dynasty-management` (§3.3) |
| **F3b** | FE | Host Portal UI against the fixture gateway: game-type picker (from `/catalog` shape), rules step (fork of `RankedFormatBuilder` limited to the schema), entrant/invite picker (`useFriends`), organizer console (seed/start/walkover) | F1 |
| **B1** | BE | `migrate_add_arena.py`, `arena/` package (events, entrants, invites, actions), `ARENA_ENABLED`, `queue_arena_enabled`, `GET /catalog`, create/list/get/join/leave, invite inbox; tests | P0 |
| **B2** | BE | **Custom duel end-to-end**: `HOST_TOURNAMENT`, `creation_source="arena"`, `POST …/nodes/{id}/play` → `create_match_rows`, terminal hook for a single node; tests | B1 |
| **F4** | FE | `httpArenaGateway`; custom duel flow (challenge → accept → `QuizRankedMatch host="tournament"` → result back on the event page); invite inbox in the identity-menu bell | B2, F3b |
| **B3** | BE | Bracket generation (`lock`), advancement in `_commit_result` / forfeit / disconnect, series, draw replay, no-show sweep in `worker.py`, `since_revision` projection; tests | B2 |
| **F5** | FE | Live tournaments: revision polling (5 s live / 15 s idle / paused when hidden), Supabase Presence `arena:event:{id}` for lobby avatars, beats driven by real revisions, deep links | B3, F3 |
| **B4/F6** | Both | Owner moderation (`/api/arena/admin/*`, `/admin/arena` under `AdminRoute`) and audit view | B3 |
| **F7** | Both | Release hardening: GitHub Actions browser matrix, small load test against capacity limits, copy review, flags off by default, then owner-gated enablement. **No deploy without explicit approval.** | all |

**Later (v2+):** double elimination (fork `DoubleElimStage`); Swiss or round robin (fork `TournamentSwiss.tsx`); same-content rounds (seeded `order_seed` or a `question_ref` pin); live spectating projection; Supabase bell notifications; a stream overlay (`BroadcastLiveView` pattern); Champion Card Duel as a game type through an adapter.

---

## Appendix A: Branch and PR status (verified 2026-10-21)

### Open mogsy PRs (GitHub API)

| PR | Branch | Relevant? |
|---|---|---|
| #115 | `combat-v4/theater-prototype` | Yes. Scrub/timeline pattern |
| #112 | `qmedia2/option-media-fallbacks` | Minor. Option art fallback in Match Grid |
| #108 | `fix/stat-check-final-verdict-20261019` | Minor (Meta Reflex reveal) |
| #106 | `fix/interaction-labs-pt-portal-assertion` | No |
| #105 | `ranked/queue-paused-unavailable` | Minor. `RANKED_QUEUE_PAUSED` code |
| #95 | `academy-core/hover-to-front` | No |
| #81 | `ui/ranked-coming-soon-combat-beta-20261019` | Equivalent code is already on main |
| #76 | `qa/release-guest-smoke-20261018` | No |
| #59 | `test/misc-f09-standard-timer-compat-20261017` | No |
| #49 | `billing/custom-one-time-50-completion` | No |
| #46 | `ux/journey-update-clarity-20261015` | No |
| #45 | `role-challenge/v2-patch-badge-20261015` | Minor |
| #44 | `roguelike/rog1d1-dynasty-frontend` | Yes. `MatchStage` reveal pattern |
| #13 | `rc6/role-challenge-origin-20261014` | Minor |
| #4 | `fix/mogzi-desktop-click-20261010` | No |

### Worlds and tournament branches (mogsy)

- **Merged:**
  - Worlds hub and featured: `pw1/worlds-hub`, `pw4b/worlds-featured-integration`.
  - Worlds experience: `ux1/worlds-experience-prototype`, `ux2/worlds-teams-schedule`, `ux3a/worlds-integration-candidate`, `ux3c/worlds-rollback-links`, `ux4/worlds-zero-scroll`, `ux5/worlds-landscape-phones`.
  - Release and quiz: `release/worlds-2026-experience-enable`, `worlds26/quiz-frontend`.
  - Lobby and social: `lc1/ranked-lobby-hero`, `rl1/ranked-lobby-redesign`, `rl2/lobby-analytics`, `integ/stat-check-friend-invites`, `integ/stat-check-invite-switch`.
- **Landed by rebase (tip not an ancestor, but the code is on main):** `pw4b/worlds-featured`, `dcgi1/tournament-surface*`.
- **Unmerged, nothing needed:** `ux3b/worlds-release-acceptance` (docs and test only).

### Dynasty stack (mogsy; all unmerged; backed up to origin 2026-10-21 unless noted)

| Branch | Ahead of main | Last commit |
|---|---|---|
| `roguelike/rog1d1-dynasty-frontend` (pushed, PR #44) | 4 | 2026-10-15 |
| `ux/ux-d0-dynasty-design` | 5 | 2026-10-17 |
| `vis/vis-f1-premium-visuals` | 7 | 2026-10-19 |
| `vis/vis-f2-cinematic-journey` | 8 | 2026-10-19 |
| `vis/vis-f3-living-worlds` | 12 | 2026-10-19 |
| `vis/vis-f4-cinematic-production` | 13 | 2026-10-20 |
| `ux/ux3-dynasty-real-bo5` | 17 | 2026-10-20 |
| `ux/ux6-dynasty-management` (tip; contains all of the above) | 19 | 2026-10-21 |

- `vis/vis-f2-support-docs` is a diverged duplicate (different SHAs). Ignore it.
- `origin/roguelike/rog0-worlds-dynasty-audit` (pushed, docs only, unmerged).

### LCS

- **Merged:**
  - Tournament context: `dcgi1/tournament-context`, `pw4a/worlds-tournament-context`.
  - Host provenance: `host1/hosted-role-context`, `jlib-match-host-identity`.
  - Stat Check: `integ/stat-check-mp`, `integ/stat-check-friend-invites`, `integ/stat-check-invite-switch`.
- **Unmerged, pushed before the audit:** `roguelike/rog1a-dynasty-sim-core`, `roguelike/rog1c1-dynasty-run-foundation` (its one unpushed commit, `a97559e8`, was pushed 2026-10-21), `roguelike/data3-registry-fix-rc2`, `audit/pw2-worlds-2026`, `audit/pw3-worlds-intelligence`.
- **Unmerged, backed up to origin 2026-10-21 (previously local-only):** `roguelike/wd-v2-combat-a1`, `wd-v2-combat-a2`, `wd-v2-e2-series`, `wd-v2-e2-hardening`, `wd-v2-e3a-management`, `wd-v2-e3b-campaign` (same commit as e3a), `data2-dynasty-catalog`, `data3-dynasty-certification`, `data3-registry-fix-rc`.

## Appendix B: Audit method

- Two clean checkouts were used: mogsy `origin/main` `0fd1bb6a` (this branch's base) and LCS `origin/master` `77c08167` (a detached worktree).
- Branch code was read with `git show <branch>:<path>`, `git ls-tree`, `git diff --stat` and `git merge-base --is-ancestor`, without checking anything out.
- Local-only status was confirmed with `git ls-remote --heads origin <branch>`, which returned nothing.
- After the audit, on the owner's instruction, those branches were pushed as-is (2026-10-21). Every remote tip was then confirmed to equal its local tip.
  - Before pushing, branch diffs were scanned: no `.db`, `.env` or key files, and nothing over 20 MB.
- Mogsy PRs came from the public GitHub REST API. LCS PR state is unavailable (private repo, no `gh`).
- No tests, builds, dev servers or browsers were run. No secrets were read.
- Sub-audits covered seven areas in parallel.
- The load-bearing claims were re-verified directly. These include:
  - the `create_match_rows` signature;
  - the `ranked_points_v2` default;
  - the `rankedInvite.ts` statement;
  - `PUBLIC_RANKED_COMING_SOON`;
  - the theme pre-paint paths and the `/:slug` catch-all;
  - the `RATED_CREATION_SOURCES` value;
  - the existence of the referenced FE files;
  - the local-only branch status.
- One sub-audit claim was corrected: it said HP `ranked_modern` was the public default. It is not; it is `ranked_points_v2`.

---

## 11. Update 2026-10-22 — admin-only production integration (built, not deployed)

The owner asked for the Arena to work for real on mogzy.lol, **reachable only through Admin**: only the owner creates and runs events; signed-in players join by link or invitation and play their own matches; no public directory, no public creation, no home-page entry. That is now built and tested locally on two stacked branches. **Nothing is merged, published, deployed or enabled.**

### 11.1 Where it is

| Repo | Branch | Commits | Stacked on |
|---|---|---|---|
| LCS backend | `feat/arena-admin-lifecycle-20261022` — draft PR #88 | `c0438d70` (code), `bc7f8fd2` (docs) | PR #86 `feat/arena-backend-b1b2-20261021` @ `dbf22a72` (base master `77c08167`) |
| mogsy frontend | `feat/tournament-arena-admin` — draft PR #122 | `fbd8f2b1` (code), `ad795752` (registry test) | PR #118 `feat/tournament-arena-visual` @ `0911d045` |
| mogsy docs | `docs/tournament-arena-handoff` | this commit | `f3b5d29d` |

Detailed backend notes: LCS `docs/arena/ARENA_BACKEND_B1B2_HANDOFF.md` (B1/B2) and `docs/arena/ARENA_ADMIN_BETA_HANDOFF.md` (B3/B4).

### 11.2 Owner decisions as implemented

| # | Decision | As built |
|---|---|---|
| D1 | Rated? | Unrated (`creation_source="arena"`, `rated=false`) |
| D2 | Who organizes | **Owner only** (this beta). Enforced server-side on every organizer route; players need no privilege |
| D3 | Size / format | Single elimination, 2–16 entrants (`ARENA_MAX_ENTRANTS`, hard max 32), Bo1/3/5 (earlier rounds Bo3 when the final is Bo5) |
| D4 | Draws | Replay; after 2 replays the node is flagged and the owner resolves |
| D5 | Game types | The server catalog: Ranked Quiz, Ranked Mix, Match Grid, Reconstruct, Order Forge, Chronoscope, Roster Lock, Draft Memory. Journey, Role Challenge, Champion Card Duel: later |
| D6 | Routes | Players `/quiz/arena/*`; owner `/admin/tournament-arena/*` (not `/admin/arena`, which LEGACY1 retired) |
| D7 | While Ranked is paused | Yes, behind its own `ARENA_ENABLED` + `app_settings.queue_arena_enabled` |
| D9 | Wording | "Join link" / "Join code" / "Invite"; organizer, never "host" |
| D10 | No-show deadline | Server-wide `ARENA_READY_DEADLINE_SECONDS` (600 s). One side ready at the deadline wins; nobody ready → the owner resolves |

### 11.3 What exists now

**Backend (B3/B4 on top of B1/B2):** owner-only organizer gate (`ARENA_ORGANIZER_REQUIRED` 403, `ARENA_ADMIN_UNAVAILABLE` 503 fail-closed), no public discovery (`ARENA_PUBLIC_DISABLED`), `viewer_can_manage` projection, the two-sided ready check on `play`, the deadline/abandoned-game sweep (on every read and in the Ranked worker), owner moderation `/api/arena/admin/*` (list, detail + audit, edit open event, remove entrant, override a result while nothing downstream was played), migration v2 (three nullable `arena_nodes` columns, ALTERed in place).

**Frontend:**

| Route | Who | What |
|---|---|---|
| `/admin/tournament-arena` | owner (Admin rail entry "Tournament Arena") | Service state read live from the backend (Arena flag, new-starts pause, Ranked engine, servable game types, limits) and every event |
| `/admin/tournament-arena/new` | owner | Fable's Match Host Portal on the real catalog (no public option; only server-applied settings; organizer-seat choice); Launch creates the event, then invites challenged friends |
| `/admin/tournament-arena/event/:id` | owner | Fable's event page with organizer controls (Lock, Start, walkovers, override) + **Organizer tools** drawer: join link, invite friends / withdraw, settings until lock, remove player, cancel, audit trail |
| `/quiz/arena` | signed-in player | Your events + your invitations (accept / decline) |
| `/quiz/arena/join/:code` | signed-in player | The join link: confirm → join → the event |
| `/quiz/arena/e/:id` | entrant (or a `link` event's reader) | Lobby (check in) → animated bracket → champion; never organizer controls |
| `/quiz/arena/e/:id/match/:node` | the node's two players | Fable's VS seats drive the **real ready check**; then the canonical `QuizRankedMatch` mounts as a tournament-hosted match; the result screen shows **only the game the server recorded** ("Recording the result…" until it arrives) |

Fable's visuals and motion are unchanged and reused (bracket, node cards, connectors, stingers, finals intro, champion celebration, launch transition, duel seats, score plate). The DEV fixture harness `/lol/dev/tournament-arena` still runs on the fixture gateway and still marks everything **Simulated**; no simulated score can reach a real page.

### 11.4 Not done (follow-ups, not blockers for the admin beta)

- A GitHub Actions browser workflow (`playwright.tournament-arena.config.ts`) — browser checks were done in the desktop app's built-in browser, not CI.
- Supabase bell notifications for invitations (inbox polling only).
- Rate limits on non-Play Arena routes; cohost assignment; per-event ready deadline; same-content rounds; spectating; double elimination.
- Leaving a live match has no "are you sure" guard in the Arena match room (the Ranked engine's reconnect window applies: absent 20 s, forfeit at 45 s).

---

## 12. Release runbook (owner actions; nothing here has been done)

Claude has no Railway access. Every Railway step below is for the owner in the Railway dashboard. Do the steps in order and stop at any failed check.

**Step 0 — reviews.** Review and merge, in order: LCS PR #86 → LCS PR (this B3/B4 branch, base #86). mogsy PR #118 → mogsy PR (`feat/tournament-arena-admin`, base #118). Merge each base before its stacked PR (or retarget the stacked PR to `master`/`main` after the base merges).

**Step 1 — backend with the Arena OFF.**
1. Confirm a recent database backup exists (the usual pre-deploy check).
2. In Railway → the web service → Variables: make sure `ARENA_ENABLED` is **absent** (or `0`). Do not add it yet. Optional, defaults shown: `ARENA_MAX_ENTRANTS=16`, `ARENA_READY_DEADLINE_SECONDS=600`, `ARENA_INVITE_TTL_MINUTES=1440`, `ARENA_MAX_DRAW_REPLAYS=2`.
3. Let Railway deploy `master`. Startup runs `migrate_arena()` (additive: six `arena_*` tables; on an existing B1 table it only adds three nullable columns).

**Step 2 — verify database and API readiness (Arena still off).**
- From any terminal: `curl -s https://<backend-host>/api/arena/catalog` must answer **404** `{"detail":{"code":"ARENA_DISABLED","message":"Not found."}}` (the route is deployed and fails closed). Same for `/api/arena/admin/events`.
- In the Railway dashboard → web service → Shell, run (read-only):
  ```
  cd /app && /app/.venv/bin/python -c "import sqlite3;c=sqlite3.connect('file:/data/lol_calc.db?mode=ro',uri=True);print(sorted(r[0] for r in c.execute(\"select name from sqlite_master where name like 'arena_%' and type='table'\")));print([r[1] for r in c.execute('pragma table_info(arena_nodes)') if r[1] in ('ready_a_at','ready_b_at','attention')])"
  ```
  Expect `['arena_actions', 'arena_entrants', 'arena_events', 'arena_invites', 'arena_node_games', 'arena_nodes']` and `['ready_a_at', 'ready_b_at', 'attention']`.
- Ranked is unaffected: an ordinary Ranked/Daily smoke as after any deploy.

**Step 3 — publish the frontend (Arena still off).** Merge to `main`, check Lovable is on `main` at the merge commit, then Publish. Verify on mogzy.lol:
- `/admin/tournament-arena` (as the owner): the rail shows **Tournament Arena**; Service state says "The Arena is OFF on the backend".
- `/quiz/arena` (any signed-in account): "The Tournament Arena is not open right now." No hub, home or navigation entry links to the Arena.

**Step 4 — enable.** Railway → Variables: set `ARENA_ENABLED=1` and redeploy. Confirm `RANKED_PUBLIC_ENABLED` is on (Play needs the Ranked engine; Service state shows it). Optional: `RANKED_LIFECYCLE_WORKER_ENABLED=1` makes no-shows resolve with nobody looking (without it they resolve on the next read). To pause new events later without disabling: Supabase `app_settings` row `queue_arena_enabled` = `{"enabled": false}` (absent row = enabled; unreadable = paused).
- `curl -s https://<backend-host>/api/arena/catalog` now answers **401** `AUTH_REQUIRED` (deployed, on, account required).

**Step 5 — production acceptance on mogzy.lol** (owner + one other real account you control):
1. Owner: `/admin/tournament-arena` → Service state all **On** → **New event** → Custom duel, Ranked Quiz, 3 questions, "I play in it" → Launch → the console shows the lobby and a join link.
2. Second account (other browser profile/device): open the join link → Join → lands on the event; it sees **no** organizer controls; `/admin/tournament-arena` is refused for it.
3. Both press **Play your match** → match room → **I am ready** on each side → the match starts only when both are ready → play it → each sees the same server-recorded score → Back to the bracket shows the champion.
4. Owner console: audit trail shows create → join → ready → play → game_terminal. Reload both pages (reopen): same final state.
5. Optional: a 3–4 player tournament with one owner walkover, to see a multi-round bracket advance.
6. Rollback at any point: unset `ARENA_ENABLED` and redeploy (every Arena route 404s at once; tables and Ranked are untouched). The frontend needs no rollback (it reads the flag).

---

## 13. Verification evidence (2026-10-22)

**Backend** (LCS worktree, `python -m pytest`): `arena/tests` 107 passed (86 B1/B2 updated + 21 new admin-lifecycle tests); `test_ranked_worker_quiescence.py` 13 passed. Broad regression `test_ranked_*.py public_game_modes/tests test_daily_*.py test_stat_check*.py`: branch vs `77c08167` baseline **identical failure sets** (272 failed / 1742 passed / 7 errors on both — this machine's environment), **zero new**.

**Frontend** (`vitest`): `src/features/tournament-arena` 65 passed (31 new); `tsc -p tsconfig.app.json` — only the two pre-existing errors (`connections.ts`, `OnboardingProfile.tsx`). Full suite in four chunks vs a detached baseline (`f60d35f3`, PR #118 + current main): identical failure sets (183 pre-existing failures on both; zero new) after updating two Admin-registry guard tests for the new rail entry (the LEGACY1 guard now allows exactly one "arena" label, *Tournament Arena*; the registry entry says OWN1 owner-only). The rebased branch (on `0911d045`, without the main merge) re-ran tsc and 652 targeted tests with only pre-existing failures, and merges cleanly with `origin/main` `d809f836`. `admin-registry.routes.test.ts`'s two `/admin/knowledge` / Premium Preview regex failures fail identically on the baseline.

**Local integration against the real backend** (copy of the canonical DB, `ARENA_ENABLED=1`, six separately signed local test identities through the backend's own HS256 path, a local stand-in for the Supabase owner/profile/friendship RPCs; real Ranked matches, server-graded):
- HTTP lifecycle: **44/44** checks — Create → Invite → Join → Configure → Start → Play → Resolve → Advance → Complete → Reopen, a 4-player multi-round bracket, a real 0–0 draw replayed, reconnect after a 12 s drop, unauthorized access on every organizer door, replayed and concurrent presses.
- Deadlines with `ARENA_READY_DEADLINE_SECONDS=60` and the worker on: **8/8** — worker-applied no-show, one-side-ready walkover, nobody-ready flag → owner resolve, abandoned game → no-contest → replay.
- Built-in browser (desktop app pane, not local Edge/Chrome automation), dev server in E2E-identity mode: owner created a duel through the real Admin portal; the console polled the second player's join; the owner pressed Play → match room → I am ready (second identity readied over the API) → the **canonical Ranked match** played three real questions in the browser → result screen **Victory 6–3**, identical to the server-recorded game → bracket with champion. Also: Organizer tools (settings save to Bo3/Bo5 reflected and audited; lock and start from the console; a 3-player bracket with a bye and "Winner of SF2"), the player home and a completed 4-player bracket as a participant (no organizer bar, no walkovers, no Simulated badge), phone width 375 px (round pager, no horizontal scroll), reduced motion (no motion classes, no confetti, static champion plate; with motion: 40 confetti pieces). A non-admin identity's direct calls to `/api/arena/admin/events` and `POST /api/arena/events` were refused 403 `ARENA_ORGANIZER_REQUIRED`.

**What is NOT verified:** production (nothing is deployed); real Supabase accounts (the owner's real session through `owner_auth_state`, and real friendships, were stood in for locally — Step 5 above covers them in production); CI browser runs; Lovable publish.

---

## 14. Status of §10's build order

| Phase | Status |
|---|---|
| F1–F3, F3b | Done (PR #118, Fable) |
| B1, B2 | Done (PR #86) |
| F4 | Done (`feat/tournament-arena-admin`): real gateway, duel flow, match handoff. Invite inbox lives on `/quiz/arena`, not the bell |
| B3 | Done (ready check, deadlines, sweep) |
| F5 | Done except Supabase Presence avatars (not built) |
| B4/F6 | Done (owner moderation + Admin console) |
| F7 | Partly: flags off by default, fail-closed authorization, local acceptance. Not done: GitHub Actions browser matrix, load test |
