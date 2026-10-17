# More Challenges UX — MC-UX1 (gallery) + MC-UX2 (hub)

**Status (2026-10-16):**
* **MC-UX2: implemented, awaiting owner review.** Not merged, not published.
  * Frontend branch `mc-ux2/hub-navigation-metrics` is pushed.
  * Backend branch `mc-ux2/bonus-history-be` @ `fce2d90c` is pushed (committed on the owner's instruction). It is not merged.
* MC-UX1: merged into `main` at `af170999` (see the MC-UX1 section below).

---

# MC-UX2 — category navigation, Random, and the player's own record

* Repositories: `mitcherrman/mogsy` (frontend) and `mitcherrman/League_Combat_Simulator` (backend, needed for history).
* Verified starting commits:
  * frontend `main` @ `6b46e1c0`; More Challenges is unchanged since MC-UX1 `6dd298f7`;
  * backend `master` @ `fadec94a`.
* Concurrent work checked: no other branch touches More Challenges or `public_game_modes`.

## UX2.1 What the player gets

| Request | Delivered |
|---|---|
| Category navigation, not one long scroll | One collection on screen at a time. Arrow buttons step through Daily Extras → Knowledge Arena → Precision & Recall (wrapping); the three tabs between them jump straight to one. A "Next: …" button sits at the foot of each page. `?c=` remembers the page. |
| Random button | "Random game" in the hero picks uniformly among the cards that are **playable right now**, then launches through the card's own `play()` (same start contract, same `more_challenges_mode_selected` analytics, same notices). With nothing playable it is disabled and says "No game is playable right now." |
| Top stats | Games played, Most played (with its count), This week (games + streak or active days), Last played (mode + when). A first-time or signed-out player sees "Your record starts with your first game…" instead of zeros. |
| Per-mode mini history | A muted line under each card's actions, at most three parts. Examples: "Played 2 · Best 3/3 boards · Last yesterday", "1 run · Closest 0.18s off · Last today", "18 hits · Avg 67 damage off · Last today". "No games yet" when there is none. |
| Reconstruct fix | The preview is a real recipe: **Spear of Shojin (3161) = Pickaxe (1037) + Ruby Crystal (1028) + Tunneler (2021)**, from the canonical wiki item graph (`item_build_components`). All four icons are served by production `/assets/items/`. |

## UX2.2 What data exists (verified before building)

| Modes | Persisted before MC-UX2? | Source used |
|---|---|---|
| Roster Lock, Draft Memory, Chronoscope, Match Grid, Reconstruct, Order Forge | **Yes** | `ranked_matches` (host `bonus_game`, `session_preset` `bonus.<mode>`), `ranked_results` (outcome), `ranked_resolved_rounds` settlements. A board counts as correct when the module awarded the viewer base points (`points_view.resolved_scoring`), the rule the result screen reads. |
| Time Trial, Survival | **Yes** | `daily_run_stages.result_json.correct` for completed stages of the player's official Daily runs. |
| Rangefinder, Glyph Press, Perfect Timing, Stat Drop, Combat Estimate | **No**: sessions lived only in process memory | **New**: `public_mode_rounds`, one row per locked round. |

**So backend support was needed, and it is minimal:**
* **Table** `public_mode_rounds`, added by `migrate_add_public_mode_rounds.py` (CREATE IF NOT EXISTS) and wired at startup after the Role Challenge migration.
  * One row per locked session round, written once (`INSERT OR IGNORE` on `(session_id, round_key)`).
  * It holds only graded facts: exact/solved `hit`, Perfect Timing `points`, `abs_error`, `relative_error`, and `run_rounds`. No content and no answers.
  * Written by the public lock routes after the lock succeeds. A recording failure is logged and **never fails the lock** (tested).
* **Route** `GET /api/game-modes/me/summary` (`public_game_modes.history.player_summary`), contract `public_game_modes.player_summary.v1`.
  * Any verified player (account or verified guest) may read it; the shared guest sentinel and unverified callers get 401.
  * It reads by the caller's own id only. It is rate-limited and bounded (300 matches, 5000 rounds, 400 Daily stages).
* **Frontend read** (`src/lib/public-modes/summary.ts`): uses `getExistingBackendAuthToken`, so it **never mints an identity** (USERS1). With no session there is no request and the page shows no record.

**Metric definitions (all real, none padded):**
* **A game:** a finished match, a completed Daily stage, or a session run with at least one locked round.
* **Board modes:**
  * played;
  * wins vs the bot;
  * best and last boards correct, as `correct/total` (`total` is the frozen format's `match_length`);
  * last outcome.
* **Daily stages:** played; best and last `correct`.
* **Rangefinder / Glyph Press:** runs; best and last exact / solved hits out of the run's rounds; total hits.
* **Perfect Timing:** runs; best run points out of 100 per ability; the closest single stop in ms.
* **Stat Drop:** stats locked; closest, last and mean **relative** error. Stats have different units, so absolute error would not compare.
* **Combat Estimate:** hits locked; closest, last and mean **absolute** error in damage.
* **Overall:**
  * games played;
  * most played (a tie goes to the more recently played mode);
  * last played;
  * games and active days in the last 7 days;
  * streak of consecutive UTC days with a game, ending today or yesterday.

**Gap (documented, not hidden):** session-game history starts at the deploy that adds the table. Earlier Rangefinder / Glyph Press / Perfect Timing / Stat Drop / Combat Estimate play was never stored, so it cannot be recovered.

## UX2.3 Fixed in passing (backend)

`perfect_timing.service.deal/lock` chose their store with `store or STORE`. `RoundStore` defines `__len__`, so an **empty** public store was falsy, and public Perfect Timing rounds were silently issued into the **owner lab's** store, defeating PGM2's separate public store.
* Fix: `STORE if store is None else store`, in both places.
* Regression test: `test_public_perfect_timing_rounds_never_enter_the_owner_lab_store`.

## UX2.4 Architecture decisions

* **Paging is presentation only.** `initialCollection` picks the first page:
  1. `?c=` if valid;
  2. Daily Extras for a visitor sent by the Daily;
  3. otherwise the Knowledge Arena, since Daily Extras is often "Daily first" for a new visitor.
* `stepCollection` and `pickRandomPlayable` live in `lib/public-modes/gallery.ts`.
* **Accessibility:**
  * The tabs are a WAI-ARIA tablist (roving tabindex; Left/Right/Home/End move selection and focus).
  * The page is a `tabpanel` labelled by its tab, and arrows have descriptive labels ("Next collection: Precision & Recall").
  * The Random pick is announced in a polite live region.
  * Every control is at least 44 px.
* **Motion:** turning a page slides 28 px in the direction of travel (260 ms). Reduced motion removes it, along with the Random and pager transitions.
* **Random never bypasses anything.**
  * The candidate pool is cards whose `cardStatus` is `ready` and whose action is `play` / `start`.
  * A Daily stage waiting on the Daily, or a paused, unavailable, played or checking mode, is never a candidate.
  * It then calls the same `play()` a card's button calls. If the pick lives in another collection, the page turns to it first so its "Starting…" state is visible.
* **Analytics:** no new event. A random launch emits the existing `more_challenges_mode_selected` with `action: "play"`, so dashboards keep working. A distinct `random` action would need an analytics-contract change; that is left for the owner to decide.
* **Hero:** the MC-UX1 jump links became the pager. The medallions show only at 2xl, so Random has room at 1366 px.

## UX2.5 Files

Backend (`mc-ux2/bonus-history-be` @ `fce2d90c`):
* New:
  * `migrate_add_public_mode_rounds.py`
  * `public_game_modes/history.py`
  * `public_game_modes/tests/test_bonus_history.py`
* Changed:
  * `api_server.py`: the migration call.
  * `routes/public_game_modes.py`: lock routes record; `GET /me/summary`.
  * `public_game_modes/sessions.py`: `run_size`.
  * `perfect_timing/service.py`: the store fix.
  * `public_game_modes/tests/test_bonus_sessions.py`: history DB kept in tmp; store regression test.

Frontend (`mc-ux2/hub-navigation-metrics`):
* New:
  * `src/lib/public-modes/summary.ts`, `summary.test.ts`;
  * fixtures `playerSummary.json` and `playerSummaryEmpty.json`: **real backend bodies** generated by playing games through the backend's own routes;
  * `src/components/public-modes/gallery/CategoryPager.tsx`, `HubToolbar.tsx`;
  * `docs/handoffs/more-challenges-ux/ux2/*.jpg`.
* Changed:
  * `src/lib/public-modes/gallery.ts`: `pickRandomPlayable`, `stepCollection`, `initialCollection`, `collectionOfMode`.
  * `gallery.test.ts`
  * `GameCard.tsx`: the history line.
  * `GalleryHero.tsx`: Random and stats slots.
  * `GameArt.tsx`: Spear of Shojin.
  * `gallery.css`: scoped `.mc-gallery` additions.
  * `MoreChallengesPage.tsx`, `MoreChallengesPage.test.tsx`.

## UX2.6 Tests and results

**Backend** (pytest, on the branch):
* `public_game_modes/tests/test_bonus_history.py`: 11 tests, covering:
  * a truthful empty history;
  * verified-only reads; a guest reads their own;
  * a lock recorded once and summarised;
  * Glyph Press solved;
  * Stat Drop / Combat Estimate errors;
  * Perfect Timing points and closest stop;
  * a recording failure never failing a lock;
  * player isolation;
  * a real Match Grid played to the end through the engine (3/3 boards, outcome);
  * Daily Extras best/last from official runs only;
  * overall favourite / week / streak.
* `public_game_modes`, `perfect_timing`, `interaction_lab`, `numeric_lab`, `test_ops_queue_controls.py` and `test_rc3_role_challenge_launch.py`: 384 passed earlier; `public_game_modes` + `perfect_timing` after the store fix: 255 passed. `python -c "import api_server"` OK.

**Frontend** (vitest 3.2.7):
* `src/lib/public-modes`, `src/pages/quiz-more-challenges`, `src/components/public-modes`: 8 files, **105 passed**. New:
  * `summary.test.ts`: the contract, words per kind, local-day dates, a read that never mints;
  * `gallery.test.ts` additions: Random never picks Daily-first / waiting / paused; the live Daily stage is a candidate; paging and wrap; the initial page;
  * page tests: one collection at a time; arrows wrap; the URL remembers; keyboard tablist; `?c=` and Next; Random launching through the start contract, a session page and the live Daily stage; Random disabled when nothing is playable; stats empty / returning / first-time / error; history lines; Spear of Shojin icons.
* Regressions (`src/pages/quiz-daily-challenge`, `src/lib/daily-challenge`, `src/components/quiz`, `src/pages/quiz-ranked`, `src/lib/ranked-public`, the Perfect Timing page and components): 2612 passed, 5 failed. The 5 are pre-existing and fail identically on clean `main`: `QuizCategoryRail` ×3, `playModeCard.styles` ×2.
* `tsc --noEmit -p tsconfig.app.json`: clean apart from the two pre-existing files.
* eslint on the touched areas: 0 problems.
* `vite build`: OK. The lazy page chunk is JS 45.9 kB (14.7 kB gzip) and CSS 14.5 kB (3.4 kB gzip).

**Browser** (Playwright on the running branch, at 1920×1080, 1366×768, 768×1024, 390×844 and 360×640):
* horizontal overflow: 0;
* controls under 44 px: none.
* The phone page is now about 2,100 px tall, down from 3,086 px for MC-UX1's long scroll.

## UX2.7 Screenshots (`docs/handoffs/more-challenges-ux/ux2/`)

**How they were captured:**
* The branch's Vite dev server with `VITE_E2E_AUTH=1` (an injected persona).
* A scratch mock API, not committed. It serves:
  * the catalog fixture and a plan-v5 Daily per scenario;
  * the backend's real `assets/`;
  * `/me/summary` bodies that the **branch backend computed** after real play through its own routes, shifted onto today's date.

| File | Shows |
|---|---|
| `01-hub-full__*`, `02-first-screen__*` | The whole hub, and the first screen, at all five sizes, for a returning player |
| `03-top-random-stats__1366x768` | Hero with Random and the stats strip |
| `04-page-{knowledge_arena,precision_recall,daily_extras-up-now}__1366x900` | Each collection page, with per-card history lines (Daily Extras with Time Trial up now) |
| `05-pager-mobile__390x844` | The pager on a phone |
| `06-card-{reconstruct,match_grid,perfect_timing}__…`, `06-card-time_trial-mobile` | Cards at 2×, including Spear of Shojin |
| `07-first-time-player__{1366x768,390x844}`, `07-signed-out__1366x768` | Empty-history states |
| `08-nothing-playable__1366x768` | Bonus Games paused and no Daily: Random disabled, with the reason |
| `09-focus-next-arrow__1366x768`, `09-hover-chronoscope__1366x900` | Keyboard focus and hover |

## UX2.8 Merge / publish status

* Nothing is merged or published (owner review first).
* **Deploy order when approved:**
  1. Merge backend `mc-ux2/bonus-history-be` into `master`. Railway runs the `public_mode_rounds` migration at startup.
  2. Verify `GET /api/game-modes/me/summary` answers 401 without auth.
  3. Then merge the frontend into `main` and publish it via Lovable.
* **If the frontend ships first:** the summary call answers 404. The stats show "couldn't be loaded" and the cards drop their history line; play is unaffected.

## UX2.9 Remaining gaps / next improvement

* Session-game history starts at deploy (see UX2.2).
* The Daily Extras history counts official Daily runs only (practice policies are excluded).
* **Next recommended improvement:**
  * a per-mode "your recent games" drawer (the last five results) on the Rules / history line, built on the same summary route extended with a bounded `recent` list;
  * whether Random gets its own analytics action.

---

# MC-UX1 — More Challenges public game gallery

**Status (2026-10-16):** owner-approved and **merged** into `main` at `af170999` (`--no-ff`, onto main `4f73badf`). **Awaiting the owner's Lovable publish.** No backend change, so there is no backend deploy.

* Repository: `mitcherrman/mogsy` (frontend only; no backend change).
* Verified starting commit: `main` @ `c5521d3e` (PGM2 merged; PGM1/PGM2 handoff: `docs/handoffs/public-game-modes.md`).
* Concurrent work checked before branching: no other branch or worktree touches `/quiz/more-challenges`.

## 1. What changed for the player

| Before | After |
|---|---|
| Thirteen identical text cards in one grid. | Three collections: **Daily Extras** (2), **Knowledge Arena** (6), **Precision & Recall** (5). |
| No imagery. | Each game has its own preview drawn from its mechanic, using Mogzy's real rune, item, champion, minion and role art. |
| "13 bonus modes · 13 open now", and an OPEN chip on every card. | "N ready to play now" counts only cards that are playable right now. No chip on a game that is simply playable. |
| Rules: a 16 px-tall text link. | Rules: a 44 px button beside Play on every card. |
| Hero: three lines of prose. | Compact hero: title, one line ("13 optional League games for extra practice. Unrated: they never change your Daily score or Ranked rating."), and jump links to the three collections. |
| Phone: 13 tall cards. | Phone: compact cards (thumbnail beside the title and objective, actions full width below). The first game is above the fold at 360×640. |

## 2. Design decisions

* **Grouping is presentation only.** `MODE_COLLECTIONS` (`src/lib/public-modes/gallery.ts`) keys on the stable public ids.
  * The server still owns which modes exist, their order, copy, availability and launch.
  * A mode the catalog returns that no collection names is drawn in a trailing "More games" group, never dropped.
  * A collection with none of its modes in the catalog is not drawn.
* **Status comes from the one launch decision.**
  * `resolveModeAction` (`launch.ts`) now also returns a `gate` on its `play`, `blocked` and `done` actions saying *why*:
    * `play`: `ready` / `daily_first`
    * `blocked`: `waiting` / `paused` / `unavailable`
    * `done`: `played` / `closed`
  * The action's kind, label, destination and router state are unchanged.
  * `cardStatus` maps that action to what a card shows. Cards decide nothing.
* **The card states:**

  | State | What the card shows |
  |---|---|
  | Playable now (bonus game) | Gold Play button, no badge. |
  | Playable now (Daily stage) | "Up now" badge and Play / Resume. |
  | Daily prerequisite | "Daily first" badge; an outlined "Start Today's Daily" / "Continue Today's Daily" button (the same operation as before); the line "Unlocks after today's Daily Challenge." |
  | Waiting for an earlier stage | A plate in place of Play: "Up after Time Trial · Today's bonus stages play in order." |
  | Played today | A plate: "Played today · 11 correct" (today's real result). |
  | Closed for today | A plate: "Closed for today". |
  | Paused | A plate: "Paused". When a whole collection is paused for one reason, the server's message is said **once** under the collection heading instead of on every card. |
  | Unavailable | A plate with the resolver's or the server's words. |
  | Checking | A skeleton while the player's Daily is read. |
  | Coming soon | A "Coming soon" badge and plate. |
* **No invented data.** There are no difficulty ratings, durations, records or percentages.
  * Card copy is the catalog's `summary`.
  * Collection blurbs describe only what is true of every member: Daily Extras unlock after the Daily and play in order; the Arena is timed matches against a bot; Precision & Recall reveals the real answer after each lock.
* **Art contains no answers.**
  * Reconstruct shows generic components under a "?" slot, never a real recipe.
  * Draft Memory seats no historical draft.
  * Match Grid shows keystones beside the board's own `RuneTreeGlyph` seals and hues, the same seals the live board prints.
* **Art geometry.** Each scene is a 240×100 canvas whose centred 100×100 core holds everything that must read at thumbnail size. The canvas fills the art box's height and is centred, so wide cards show the whole scene and phone thumbnails show the core.
* **Motion.**
  * Hovering or keyboard-focusing a card animates one element of its scene: the stopwatch hand, the scrubber, the balance, the reticle pulse, and so on.
  * The card lifts 2 px on hover-capable pointers only.
  * `prefers-reduced-motion` turns all of it off. This is verified: the computed transform stays `none` on hover.
* **Scope.** All styling lives in `src/components/public-modes/gallery/gallery.css`, every rule under `.mc-gallery`. No Ranked, Daily or Leaguecraft CSS changed. The page keeps `.ranked-academy` for the chamber backdrop and tokens.
* **Layout.**
  * Daily Extras: two wide cards, with the art beside the copy from `lg`.
  * The other collections: three across at `lg` on a six-track grid. A row left with two cards splits the width between them (Stat Drop, Combat Estimate) instead of leaving a hole.

## 3. Contracts preserved (unchanged code paths)

The following are unchanged; `MoreChallengesPage.tsx` changes only its render tree:
* catalog read (`usePublicModeCatalog`, public, no bearer);
* Daily read (`readToday`, a GET);
* `start()` (idempotent `newStartKey`, active-match / other-game / paused / rate-limited / unavailable notices, the `other_game` "Return to it");
* `play()` (analytics `more_challenges_mode_selected` with `action: play`, then a navigate or a start);
* `?play=` Play Again (once, then the parameter is dropped);
* `showRules` (analytics `action: rules`);
* `ModeRulesPanel` with the server's Rules;
* `more_challenges_viewed`;
* the error / retry state;
* Back to Leaguecraft (`/quiz`).

Every PGM1/PGM2 page test still passes unchanged, apart from two presentation expectations:
* the count line now reads "ready to play now";
* the grid class assertion moved to the per-collection grids.

## 4. Files

New:
* `src/lib/public-modes/gallery.ts`: collections, `groupModes`, `cardStatus`, `sharePause`, `countReady`, `collectionCellClass`, `MODE_ACCENT`.
* `src/lib/public-modes/gallery.test.ts`
* `src/components/public-modes/gallery/GameArt.tsx`: the 13 previews.
* `src/components/public-modes/gallery/GameCard.tsx`
* `src/components/public-modes/gallery/CollectionSection.tsx`
* `src/components/public-modes/gallery/GalleryHero.tsx`
* `src/components/public-modes/gallery/gallery.css`
* `docs/handoffs/more-challenges-ux.md` (this file) and `docs/handoffs/more-challenges-ux/*.jpg`.

Changed:
* `src/lib/public-modes/launch.ts`: adds `gate` (no behaviour change).
* `src/lib/public-modes/publicModes.test.ts`: pins `gate`.
* `src/pages/quiz-more-challenges/MoreChallengesPage.tsx`: the render tree.
* `src/pages/quiz-more-challenges/MoreChallengesPage.test.tsx`: two presentation expectations updated, seven MC-UX1 tests added.

## 5. Tests and results

All runs use vitest 3.2.7 on Windows, on the branch.

**Focused suites, all green:**
* `src/lib/public-modes`, `src/pages/quiz-more-challenges` and `src/components/public-modes`: 83 tests. These include the new `gallery.test.ts` (14) and the seven MC-UX1 page tests:
  * the three collections and their jump links;
  * no repeated OPEN chips;
  * Daily first;
  * up now / waiting;
  * played today with results;
  * paused said once per collection;
  * Rules named for each game at 44 px.
* `publicModes.test.ts`: the launch resolver, now pinning `gate`.

**Regressions** (`src/pages/quiz-daily-challenge`, `src/lib/daily-challenge`, `src/components/quiz`, `src/pages/quiz-ranked`, `src/lib/ranked-public`, `src/components/ranked-rules`, `src/components/match-grid`):
* 2649 passed, 5 failed.
* The 5 failures (`QuizCategoryRail` ×3, `playModeCard.styles` ×2) also fail on clean `main`.

**Full `src` suite, branch vs clean `main` `c5521d3e`:**
* Method: one process per directory. A single whole-`src` run runs out of heap at 8 GB on both trees.
* Branch: 1270 files, 124 failed / 20,727 passed. Main: 1269 files, 125 failed / 20,705 passed.
* 97 failures are shared, in the same 37 pre-existing files.
* **Branch-only failures**, all in dev pages this branch does not touch: `ChampionCardDuelPage` (1) and `LobbyPreviewPage` / `LobbyPreviewPage.premiumAnalytics` (4). All three files pass in isolation on the branch (161/161), so these are load flakes.
* Six failures occur only on main (`masterySliceModule.*`, `QuizRankedMatch.rfx1b3`, one Lobby Preview test). They are the same kind of flake.
* The `src/test` chunk runs out of memory on both trees (pre-existing).

**Other checks:**
* `tsc --noEmit -p tsconfig.app.json`: clean apart from the two pre-existing files (`OnboardingProfile.tsx`, `identity/connections.ts`).
* eslint on `src/components/public-modes`, `src/lib/public-modes` and `src/pages/quiz-more-challenges`: 0 errors. The 5 remaining warnings are pre-existing PGM2 game files; none are in MC-UX1 files.
* `vite build`: OK.

**Browser checks on the running branch** (Playwright, 360×640, 390×844, 768×1024, 1366×768, 1920×1080):
* horizontal overflow: 0;
* controls under 44 px: none;
* overlapping or overflowing card controls: none;
* every Daily state renders its intended card state: none → daily_first ×2; mid-Daily → daily_first ×2; Time Trial up → ready + waiting; all done → played ×2;
* reduced motion leaves the card and its art unmoved on hover.

## 6. Screenshots (running code, `docs/handoffs/more-challenges-ux/`)

**How they were captured:** Playwright against the branch's Vite dev server and a scratch mock API (not committed). The mock serves:
* the captured backend catalog fixture;
* a plan-v5 Daily run per scenario;
* the backend repo's real `assets/`.

| File | Shows |
|---|---|
| `00-before-gallery-full__{1366x768,390x844}` | The current production design (`main`), for comparison. |
| `01-gallery-full__{1920x1080,1366x768,768x1024,390x844,360x640}` | The full gallery at each review size. |
| `02-first-screen__*` | What each size sees before scrolling. |
| `03-collection-*__1366` | The three collections. |
| `04-card-*__2x`, `04-card-*__phone-2x` | Individual cards, desktop and phone. |
| `05-daily-{none,main_pending,tt_ready,all_done}__1366`, `05-daily-tt_ready__390` | Daily-dependent states: Daily first; still Daily first mid-Daily; Up now + Up after Time Trial; Played today with results. |
| `06-paused-precision_recall__1366` | Bonus Games paused: the reason once, "Paused" on each card. |
| `07-rules-match_grid__{1366x768,390x844}` | The Rules panel. |
| `08-hover-chronoscope__1366`, `08-focus-match_grid-play__1366` | Hover (the scrubber slides) and the keyboard focus ring. |

**Measured on the running page** (every size):
* horizontal overflow: 0;
* interactive controls under 44 px: none;
* overlapping controls in a card: none;
* smallest card text: 13 px on phones, 14 px from sm.

**Page weight** (lazy route chunk, `vite build`):
* JS 33.4 kB (10.7 kB gzip);
* CSS 9.6 kB (2.5 kB gzip).

Art images:
* 23 requests, about 467 kB on desktop including the page backdrop.
* The three 256 px keystone rune PNGs (about 58 kB each) are most of it.
* Images are `loading="lazy"` and decode async.

## 7. Comparison

* **Typography.** There is now a hierarchy:
  * a 48 px page title (desktop);
  * 20–24 px Cinzel collection headings;
  * 18–20 px card titles;
  * 13–14 px objectives, never smaller.
* **Card identity.** Every game is recognisable by its art and its own accent edge before its title is read.
* **Balance.** Three short collections replace one long undifferentiated grid. The five-card row is balanced 3 + 2.
* **Interaction hierarchy.** Play is the one strong action. Rules is a real 44 px button. States that cannot play say why in place of the button.
* **Phone readability.** Compact cards are about 175 px tall with full-width actions. Collection jumps are three equal tiles.
* **Performance.** The art is static SVG plus about 20 small lazy images, with no runtime cost beyond hover transitions.

## 8. PR and merge status

* Branch `mc-ux1/public-game-gallery` is **pushed** (implementation `de50bc08`, plus this handoff).
* **PR not opened yet.** This machine has no `gh` CLI, and the in-app browser is not signed in to GitHub. Open it from: https://github.com/mitcherrman/mogsy/compare/main...mc-ux1/public-game-gallery?expand=1
* Suggested PR title: **MC-UX1: More Challenges as a public game gallery**
* Suggested PR description:

  > Redesigns `/quiz/more-challenges` into a game gallery. It has three collections (Daily Extras, Knowledge Arena, Precision & Recall), a mechanic-drawn preview for each game built from Mogzy's real rune, item, champion and role art, and status that reflects real eligibility (Daily first, up now, waiting, played today, paused, unavailable) instead of thirteen OPEN chips. Frontend only.
  >
  > `resolveModeAction` gains a presentation-only `gate`. Every launch, notice, `?play=` replay, Rules and analytics path is unchanged. Styling is scoped to `.mc-gallery`.
  >
  > Screenshots of the running branch: `docs/handoffs/more-challenges-ux/`. Handoff: `docs/handoffs/more-challenges-ux.md`.
  >
  > **Do not merge before owner visual acceptance.**
* **Merged 2026-10-16** after owner visual acceptance, directly (no PR): `main` `af170999` = `4f73badf` (Worlds UX4/UX5) + `mc-ux1/public-game-gallery` @ `53c2bc97`. No file overlap.
  * Checks on the merge: `tsc` clean apart from the two pre-existing files; `vite build` OK.
  * public modes, More Challenges, Daily and Ranked suites: 124 files, 1465 tests passed.

## 9. Remaining issues

* **Image weight.** The rune keystone PNGs are 256 px and 58 kB each. A downsized WebP set on the asset host would cut the gallery's image weight roughly in half. This is not done: it is a backend asset change.
* **Glyph Press caret.** The blinking caret is captured mid-blink in some screenshots; it is a 1.2 s blink, by design.
* **Possible follow-up.** Per-mode accent colours are a presentation choice in `MODE_ACCENT`. If the owner wants the catalog to own them, that is a backend field.

## 10. Next action

The owner publishes `main` in Lovable. After the publish, check `/quiz/more-challenges` on mogzy.lol at phone and desktop sizes.
