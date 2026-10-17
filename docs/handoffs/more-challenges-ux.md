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
