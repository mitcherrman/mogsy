# JLIB-FE: public Journey Library frontend (handoff)

| | |
|---|---|
| Repo / branch | `mogsy`, branch `jlib/journey-library-frontend` (worktree `.worktrees/jlib-frontend`) |
| Starting SHA | `origin/main` = `dab1eeb73a2e7f24598b73dc76dad78f3d9708dc` (verified before branching) |
| Implementation commit | `569fe1a2` "JLIB-FE: public Journey Library at /quiz/journeys" |
| Final SHA | the branch tip: this handoff SHA note, the commit directly on top of `569fe1a2` (`git log -1 jlib/journey-library-frontend`) |
| Backend | JLIB-API, `League_Combat_Simulator` branch `jlib-public-api`, local SHA `1256ff7c`. **Not pushed, not deployed.** Read `JOURNEY_LIBRARY_API_HANDOFF.md` there. |
| State | Committed locally only. Not pushed, not deployed. |

## 1. What was built

`/quiz/journeys` is a new public page for the stateful Journey runtime. It does not replace `/quiz/mastery`, which is the legacy standalone Mastery system and is untouched: same route, same page, same hub link, same name.

## 2. Files

| File | Change |
|---|---|
| `src/pages/quiz-journeys/JourneyLibraryPage.tsx` | new: the page |
| `src/lib/journey-library/contracts.ts` | new: list reader/projection, role labels, filter |
| `src/lib/journey-library/useJourneyLibrary.ts` | new: React Query hook (fetched once per page session) |
| `src/lib/ranked-public/client.ts` | `listJourneys`, `launchJourney`, and the three `JOURNEY_*` codes in `KNOWN_CODES` |
| `src/pages/quiz-ranked/matchOrigin.ts` | new: `journey_library` origin (label, route, return labels) |
| `src/pages/quiz-ranked/QuizRankedPage.tsx` | reads the origin from router state; passes it to the arena and to the back link |
| `src/pages/quiz-ranked/QuizRankedMatch.tsx` | optional `origin` prop: the result screen's primary action and the mode eyebrow |
| `src/pages/quiz-ranked/RankedRouteHeader.tsx` | optional `back` link (href + label); default unchanged |
| `src/App.tsx` | lazy `/quiz/journeys` route (public, no `ProtectedRoute`) |
| `src/pages/Quiz.tsx` | "Journey Library" link in the hub utility line, beside "Mastery Journey" |
| `src/lib/admin/analytics/metrics.ts` | `journey_library` Ranked-by-host bucket. These matches were falling into "Legacy / unknown host". |
| Tests | `src/lib/journey-library/{contracts,client}.test.ts`, `src/pages/quiz-journeys/JourneyLibraryPage.test.tsx`, `src/pages/quiz-ranked/QuizRankedPage.journeyOrigin.test.tsx`, `src/App.journeyLibraryRoute.test.ts`, plus cases added to `QuizRankedMatch.endScreen.test.tsx`, `Quiz.hub.test.tsx`, `metrics.test.ts` |
| Fixture | `src/lib/journey-library/__fixtures__/journeyLibrary.ts`: the real `GET /api/journeys` answer captured from the backend at `1256ff7c` against the canonical DB (14 recipes, v1) |
| Browser spec | `e2e/jlib/journey-library.spec.ts` |

## 3. Route and API integration

* `GET /api/journeys` → `listJourneys` → `readJourneyLibrary`.
  * The reader validates `schema_version: journey_library_list.v1`.
  * It projects each entry to `{key, recipeId, recipeVersion, title, role, champions[{id,label}], questions, available, unavailableCode}`.
  * `source`, `plan`, `status` and `superseded` are validated or ignored and are never shown.
  * Non-`active` entries and duplicate keys are dropped.
  * Key: `` `${recipe_id}@${recipe_version}` ``.
* `POST /api/journeys/{recipe_id}/{recipe_version}/launch` → `launchJourney`.
  * It goes through the same `request()` as the rest of Ranked: bearer JWT, typed `RankedApiError`, no body.
  * The answer is read with the existing `readQueueStatus`, because it is the queue's `matched` envelope. The extra `journey` block is ignored.
* Caching. React Query key `["journey-library"]`:
  * `staleTime` is 10 minutes, so the list is fetched once on entry and reused for the page session.
  * There is no polling and no focus or reconnect refetch.
  * The list is refetched only after a `JOURNEY_VERSION_NOT_ACTIVE` or `JOURNEY_NOT_FOUND` launch refusal.

## 4. UI behaviour

* **Header:** the Leaguecraft · Academy eyebrow and the "Journey Library" title, styled with the `ranked-academy` backdrop and the `ranked-panel` / `ranked-subpanel` surfaces.
* **Role filter:** chips built from the roles actually returned, in lane order: Top, Jungle, Mid, Bot, Support. The recipes spell the bot lane `bot`, not Ranked's `adc`, so the Library has its own small label map.
* **Champion filter:** a text search over champion label and id, ignoring case, accents and punctuation. Clicking a champion portrait on a card filters to that champion. A "Clear filters" link and an "N of M Journeys" count appear while filtering.
* **Cards:**
  * Each card shows the role, the question count, the two champion portraits with "vs", the title, and a Start Journey button.
  * Portraits use the shared champion asset manifest (`getChampionIcon`, then `getChampionSquareIconUrl`), with an initial-letter fallback.
* **`available: false`:** the card is dimmed, shows "Unavailable right now", and has no Start button. No other version is ever substituted.
* **States:** loading skeleton, load error with Try again, empty Library, and no filter matches.
* **Never displayed:** approval metadata, digests, seeds, plan or planner terms, source, superseded versions. A test asserts that none of these words appear on the page.

## 5. Auth behaviour

* **Browsing is public.** The route has no `ProtectedRoute`, and the GET mints no identity.
* **Signed out or guest (`is_anonymous`):**
  * Start sends nothing.
  * It shows the same account gate `/quiz/ranked` uses ("Account required", Create account / Sign in), with `returnTo=/quiz/journeys`.
  * The gate scrolls into view, since on a phone the press may be far down the grid.
* **Server 401/403 (`AUTH_REQUIRED` / `ACCOUNT_REQUIRED`):** shows the same gate.
* **Any signed-in account launches.** There is no Premium or entitlement check anywhere in the page, and a test guards the source for it.

## 6. Launch, result and return behaviour

* **Success:** `navigate("/quiz/ranked", { state: { matchId, origin: "journey_library" } })`. This is the lobby's own handoff plus one hint. No new player, grader, arena or renderer.
* **Ranked route:** `QuizRankedPage` reads the origin once, beside the handoff id. The existing `rankedEntry: "recovered"` replace keeps it, so a reload still knows it.
* **Result screen:** the existing screen, not a second one.
  * The primary action is **Back to Journey Library** → `/quiz/journeys`. "Play Again" would have opened the Ranked queue.
  * Review Match and Back to Leaguecraft are unchanged.
* **During play:** the arena eyebrow reads "Journey Library" instead of "Ranked Duel".
* **Fixed route link:** still "Leave Match" during play (the leave guard is unchanged), now leading to `/quiz/journeys`. On the result screen it reads **Journeys**. It is short on purpose: that link shares the HUD band with the result frame, and at 1440px a longer label is clipped. That overlap is pre-existing and noted in the nav1 spec.
* **Refusals:**

| Refusal | Behaviour |
|---|---|
| 409 `JOURNEY_VERSION_NOT_ACTIVE` / 404 `JOURNEY_NOT_FOUND` | "This Journey was updated…" notice and a list refetch. The stale version is never retried. |
| 503 `JOURNEY_UNAVAILABLE` | Stays on the page. That exact key is marked unavailable for the visit, with a notice. No refetch. |
| 409 `RANKED_ACTIVE_MATCH_EXISTS` | Notice with "Return to it" → `/quiz/ranked` (existing discovery recovers it). |
| 429 / `FEATURE_DISABLED` / other | A plain notice. The player stays on the Library. |

## 7. Host labels audit

| Surface | Finding | Action |
|---|---|---|
| Arena / result | The backend exposes no host or format on the match, the active-match endpoint, or history. | The Library label comes from the router-state origin (above). |
| Player History (`/quiz#history`) | A Library match lists as an ordinary unrated bot match, labelled by role and opponent. No raw `journey_library` id is shown. | None. Labelling it "Journey Library" needs a backend field (out of scope; General History not redesigned). |
| Admin Ranked-by-host | `journey_library` fell into "Legacy / unknown host". | Added a "Journey Library" bucket. |

## 8. Entry point

The hub utility line (bottom of `/quiz`) now reads "Journey Library" and then "Mastery Journey". This is the row where `/quiz/mastery` already lives, so the entry is consistent and the HUB7 page composition is not disturbed. Promoting it into the PLAY scroll or a hub section is an owner IA decision.

## 9. Tests

* **New:**
  * contracts 8
  * client 3
  * page 13: route, public browse, role filter, champion search and portrait filter, unavailable, exact id and version, matched handoff, Free account, signed-out and guest gate, 403 gate, 409 refetch, 503 unavailable, active match
  * origin 3
  * route 2
* **Added cases:** end screen Back to Journey Library, hub link beside Mastery, admin bucket.
* **Directly affected suites:** `src/pages/quiz-ranked`, hub and play-scroll, ranked client and active-match, admin analytics and users, route guards and contract, quiz-mastery, plus the new files. **847 passed, 3 failed.** The same 3 fail identically on untouched `dab1eeb7`:
  * `App.routing-contract` "retired legacy multiplayer routes" ×2
  * `Quiz.hub` "keeps exactly one h1"
* `eslint` is clean on the touched files. `tsc -p tsconfig.app.json` reports nothing in the touched files; its existing errors are in unrelated test files.

## 10. Browser certification

```bash
npx playwright test -c playwright.frontend.config.ts e2e/jlib
```

* All 4 pass, Chromium only.
* Every request is fulfilled in the spec, because the backend is not deployed:
  * the captured list, with `top.olaf_vs_sett` forced unavailable;
  * the `matched` launch;
  * the shared settled-match fixture for the arena;
  * a Free E2E identity.
* Set `JLIB_SHOTS=<dir>` to write screenshots, and `JLIB_ASSET_ROOT=<backend>/assets/champions` to draw real portraits.

| Check | Result |
|---|---|
| Desktop 1440 Library | 14 cards |
| Role filter (Jungle) | 3 cards |
| Champion search ("olaf") | 2 cards, the unavailable Olaf vs Sett has no Start |
| Mobile 390 | no horizontal overflow |
| Signed-out Start | account gate in view, zero launch requests, `returnTo=%2Fquiz%2Fjourneys` |
| Start | POSTs `/api/journeys/mid.zed_vs_ahri/1/launch` → `/quiz/ranked`, the canonical arena renders match `m1`'s result, primary "Back to Journey Library" returns to `/quiz/journeys` |

Screenshots: `01-desktop-library`, `02-desktop-role-jungle`, `03-desktop-champion-olaf-unavailable`, `04-mobile-library`, `05-mobile-signed-out-start`, `06-desktop-arena-result-journey`. They were written to the session scratchpad and are not committed.

## 11. Known issues / follow-ups

1. **Deploy order:** the backend must deploy first. Against today's production, `GET /api/journeys` 404s, so the page shows its "Library unavailable" state and the hub link leads there.
2. **The origin lives only in router state:**
   * A match recovered by discovery (new tab, cleared history state) shows the ordinary Ranked result actions.
   * A backend `host` on `/active-match` or the match projection would let the client recover the origin. Today `/active-match` reports only `daily_challenge`.
3. Player History does not label Library matches as "Journey Library" (see §7).
4. The live arena was certified against the settled-match fixture, not a live Journey round. A real end-to-end play needs the deployed (or locally run) backend and a real signed-in session.
5. Not covered:
   * WebKit and Firefox certification.
   * Analytics surface events for Library open and Start.
6. The hub entry is a quiet utility link (§8).
