# HUB-NEXT1 — Pro Play Hub: explicit `?next=` match links keep their match

Branch `hub-next1/explicit-fixture-identity` is based on `origin/main` `9fb89ac3bf0a8f5883ab1ffbdf4555f6b741f739`, the UX3A merge with the flag off.
- Implementation commit: `0da6d74a`.
- Tip: the commit that adds this handoff. Its SHA is in the push report and in `git log`.

Status: pushed, not merged, not deployed. No backend change. The UX3A gate and the 15 October Featured switch are untouched.

## 1. The defect, reproduced

Steps:
- Open `/lol/pro-play?next=115660540726095133` (the Worlds 2026 Knockout Final, 14 Nov) on 13 Oct, while DCGI is Featured.

What the base build `9fb89ac3` showed (real browser, production API):
- The board said **"Up next — C9 vs KC"**, the automatically picked Play-In match.
- Above it was the note "The match in this link isn't in the current schedule response … so the latest match is shown instead".
- With `&game=<id>` added, the board showed that game instead.

Evidence:
- Screenshot: `hub-next1/01-base-wrong-match-desktop-*.png`.
- Browser check #1 and the last check in `hub-next1/browser-results.json`.

A regression test was written first and run against the unmodified base:
- `ProPlayHub.test.tsx` › `HUB-NEXT1 …` › `REGRESSION: the Worlds Knockout Final, outside the upcoming window, …`.
- On the base it fails with `expected <h3 class="sr-only">C9 vs KC</h3> to be null`.

## 2. Root cause

In `src/pages/ProPlayHub.tsx` (base, lines ~142–202):

- **Lookup scope.** `?next=` was looked up only in `useSchedule()`. That hook merges two bounded `/upcoming` reads (`limit 12`, `horizon_days 14`).
- **"gone" did not block.** When both reads answered without the id, `nextNotice` was `"gone"`. The page set `nextBlocked` only for `slow` and `unavailable`, so with `gone`:
  - `autoUpcoming` and `autoGameId` stayed enabled;
  - the board drew the automatic pick under a one-line note.
- **A `?game=` pin could win.** `explicitGameId = followedGameId ?? pinnedId` let a `?game=` pin stand in for an unresolved `?next=`.

A fixture missing from a bounded read is not evidence that it does not exist. The tournament contract already serves the whole event schedule.

## 3. The correction

A new pure module, `src/lib/pro-play/explicitFixture.ts`, resolves an explicit fixture against tournament schedules.

**Which contexts it asks.** `FIXTURE_CONTEXT_IDS` covers every configured event in `FEATURED_EVENTS` (`dcgi-2026`, `worlds-2026`), not only the event Featured today. A Worlds link therefore resolves on 13–14 Oct while DCGI is Featured. Nothing depends on `featured.event.contextId`.

**`resolveExplicitFixture(id, reads)`** matches the exact `match_id` only and never maps identities. It returns one of four results:
- `found`: some context lists the id. A hit stands even if another context is pending or failed.
- `pending`: a context has not answered yet.
- `unavailable`: a context failed with anything other than 404. A miss cannot be verified.
- `not_found { partial }`: no context lists the id. `partial` is true unless every read is a healthy, non-stale v2 response with `coverage.complete === true` that does not list the id among its missing matches. A v1 response (DCGI) or a 404 always counts as partial.

**`fixtureFeedGame(match, live, recent)`** finds the feed game for a started fixture. It uses only the backend's own `live1_game_ids`, and only games the feed actually holds: a live game first, then a recent one.

**`tournamentFixtureView(found)`** converts the fixture to the existing `UpcomingMatch` shape: identity, time, league, stage and cell, best-of, and sides. A TBD side stays TBD and carries no key. It adds:
- the tournament's own `state`;
- the event's full and short names;
- a staleness flag;
- `fixtureHref`: `/schedule?match=<id>` only when `usesWorldsExperience(contextId)`; otherwise the canonical `proPlayTournamentUrl(contextId)`.

`tournamentApi.ts` gains `tournamentQuery(contextId)`. These are `useTournament`'s exact options, so `useQueries` shares the same cache entry and retry rule. `useTournament` now calls it; its behaviour is unchanged.

**Hub (`ProPlayHub.tsx`)**:
- **When the lookup runs.** `useQueries` over `FIXTURE_CONTEXT_IDS` is enabled only when all of these hold:
  - an explicit `?next=` is present;
  - neither schedule read lists it;
  - the feed does not follow it by series;
  - the schedule has answered, or the existing 2.5 s bound has passed.

  The hook count is fixed, so the hook rules hold. The Featured event's entry is the pill's cache, so it costs nothing extra.
- **Following a started fixture.** `followedGameId = seriesGameId ?? fixtureGameId`. A fixture the tournament marks started follows its feed game, as `?next=` already does today.
- **`?next=` owns the board.** `explicitGameId = nextId ? followedGameId : pinnedId`. When the URL carries `?next=`, a `?game=` pin never stands in for it.
- **Automatic pick.** `autoGameId` and `autoUpcoming` apply only when the URL carries no explicit choice. An unresolved link can no longer fall through to them.
- **Notices.** `nextNotice` is one of:
  - `slow`: the schedule or the lookup is still pending after the bound;
  - `unavailable`: a schedule read or a context failed;
  - `unverified`: everything answered and nothing lists the id.

  While the link is still resolving inside the bound, the board shows the loading frame (`nextLoading`).
- **"Try again"** re-fetches both schedule reads and the tournament reads.

**Board (`MatchCenter.tsx`)**:
- **Fixture board.** `UpcomingBoard` takes an optional `fixture` and renders `data-testid="tournament-fixture"`:
  - the source fact reads "Tournament schedule", with a tooltip saying it is the whole event, not the live list;
  - the state badge shows the tournament's state;
  - the countdown appears only while the match is upcoming;
  - the source note says the match is further out than the live list;
  - for live or completed matches, the note says the schedule marks the match that way but the feed does not hold its game yet. No score, winner or lineup is drawn;
  - a stale-copy note appears when the read is stale;
  - a link points to the event schedule ("Result in the Worlds schedule" when the match is completed).
- **No more `gone` note.** It is replaced by the blocking `unverified` alert, which also carries "Try again" and "Show the latest match" (clears `?next=` and `?game=`). Every notice now replaces the board; none sits above another match.
- **Heading and rail.** The heading is "Up next" for an upcoming fixture and "Selected match" otherwise. The rail marks no series as selected while a fixture or notice owns the board.

The existing PW1 contract is unchanged: picking a fixture clears `?game=`, picking a game clears `?next=`, and a `?next=` whose match has started follows its series.

## 4. Data authority and fallback

| Situation | Source | What the board shows |
|---|---|---|
| A. `?next=` is in either `/upcoming` read | live schedule (unchanged) | the existing upcoming board; no tournament request |
| A′. The match has started, and the feed has its series | feed (unchanged) | the live or latest game |
| B. Not in `/upcoming`, but in a configured event's schedule | `/api/live-esports/tournament/{id}` | the fixture board, labelled "Tournament schedule", with the event's own state |
| B, live or completed, and the feed holds a game in `live1_game_ids` | feed | that game (the `?next=` URL is kept) |
| B, live or completed, and no feed game | tournament | a transitional board in that state, with no score or result, and a link to the event |
| B, stale tournament copy | tournament (`stale` / `!source_ok`) | the board plus "last good read" |
| C. Nobody lists it, and everything answered | — | `unverified`; "(not all of which can confirm they are complete)" when any source is partial, v1, stale or 404 |
| A schedule read or a context failed | — | `unavailable` |
| Still pending after 2.5 s | — | `slow` |

Never claimed: that the match was cancelled or removed, a score, a winner, a lineup, or a mapping from a different id.

## 5. Files changed

- `src/lib/pro-play/explicitFixture.ts` (new): resolution, the feed follow, the view adapter and the event link.
- `src/lib/pro-play/explicitFixture.test.ts` (new): 14 unit tests.
- `src/lib/pro-play/tournamentApi.ts`: `tournamentQuery()` extracted; `useTournament` uses it.
- `src/pages/ProPlayHub.tsx`: selection, the lookup and the notices.
- `src/components/pro-play/hub/MatchCenter.tsx`: the fixture board, the blocking `unverified` state and `NextNotice`.
- `src/pages/ProPlayHub.test.tsx`: 16 HUB-NEXT1 tests, including the regression; 4 tests that asserted the substitution were rewritten (§6).
- `docs/handoffs/HUB-NEXT1.md` and `docs/handoffs/hub-next1/`: screenshots, `browser-results.json`, and the browser script.

Not touched:
- the backend, Railway and Supabase;
- `productionGate.ts` and `.env`;
- `featuredTournament.ts`;
- the Worlds experience screens, including UX2's `matchCentreLink.ts`;
- the DCGI page, Ranked, Premium and Quiz.

## 6. Tests against the baseline

This machine needs the same workarounds as UX3A: the esbuild-JSX scratch Vitest/Vite config and the rollup wasm hook. Do not run pnpm.

**Focused Vitest set.** Paths: `src/pages/pro-play`, `src/lib/pro-play`, `src/components/pro-play`, `ProPlayHub.test.tsx`, `hub5Isolation`, `App.teamSimRoutes`, `src/lib/live-esports`, `src/pages/esports`.

| | Files | Tests |
|---|---|---|
| base `9fb89ac3` | 60 passed | 2174 passed |
| branch | 61 passed | 2204 passed |

The name diff is exactly +30 new tests, plus 4 renamed. Those 4 asserted the defect, and each failed on the branch before it was rewritten:
- `PPH3 · UP NEXT › falls back to the played games when ?next= names a match no longer upcoming`
- `PW1 › does not stick on a ?next= that left the schedule: it falls back to the automatic pick`
- `PW1-A › a healthy schedule that does not list the fixture is 'gone': the fallback is labelled, not silent`
- `PW1-C › is 'gone' only once both reads have answered without the fixture`

They now assert the blocking `unverified` state. One of them also asserts that clearing the link restores the automatic pick.

**Brief coverage → tests (`HUB-NEXT1 ·` block unless noted):**
1. A fixture already in the upcoming feed: "does not ask any tournament for a fixture the upcoming feed already lists". Existing PW1/PW1-C tests cover it too.
2. A verified fixture outside the feed: REGRESSION, and "draws the verified fixture …" (identity, stage, time, TBD, state, source, link).
3. A Worlds link before 15 Oct while DCGI is Featured: "resolves a Worlds link before 15 Oct …"; the pill stays DCGI.
4. An unknown id: "an id no schedule lists is 'unverified', not 'removed' …", with all sources complete, so it is not marked partial.
5. A partial schedule: "a fixture missing from a partial tournament schedule …" and "a partial schedule that still lists the fixture shows it". Stale copy: "a stale tournament copy …".
6. A failed tournament API: "a failed tournament read is 'unavailable' …"; it goes slow → unavailable, and retry then recovers.
7. Transitions: "a fixture the tournament marks live …", which follows into the feed game via `live1_game_ids`; "… marks completed …"; and the existing PW1 upcoming → live → completed tests.
8. `?game=`: "an ordinary visit and a ?game= link ask no extra tournament", plus the existing PW1 tests.
9. Both parameters: "with both ?next= and ?game=, the fixture keeps the board …", for both a found and an unknown fixture.
10. Clearing: "clearing an unresolved fixture returns to the normal Match Center", and the rewritten PW1 test.
11. Normal automatic selection: the existing suite is unchanged, and the ordinary visit makes no Worlds request.
12. UX3A OFF/ON: "links to the Worlds Schedule screen … only when the UX3A experience is on", and the `fixtureHref` unit tests.
13. Refresh on desktop and phone: covered in the browser (§7).

**Other checks:**
- `tsc -p tsconfig.app.json --noEmit`: 2 errors on the base and the same 2 on the branch. Both are pre-existing and unrelated (`OnboardingProfile.tsx`, `identity/connections.ts`).
- ESLint on the changed files: clean on the branch and on the base.
- Production `vite build` (scratch config, same `manualChunks`): base, branch flag OFF and branch flag ON all succeed. The only warnings are the same React Query `"use client"` notices as on the base. The `ProPlayHub` chunk grows from 50,613 to 54,655 bytes (+4.0 KB raw).

## 7. Browser verification

Setup:
- Headless Edge through Playwright against `vite preview` production bundles, using the real production API, on 13 Oct.
- Ports: base `:5277`, branch OFF `:5278`, branch ON `:5279`.
- Script: `hub-next1/hubnext1-browser.cjs`. Results: `hub-next1/browser-results.json`. Result: **22/22 pass.**

| Check | Result |
|---|---|
| Base reproduces the defect | C9 vs KC under the "latest match" note; `&game=` showed GL vs MKF |
| OFF, desktop, `?next=<Final>` | TBD vs TBD · Worlds 2026 · Knockout Stage · Finals · Best of 5 · Tournament schedule · Sat 14 Nov · Upcoming. The URL is unchanged, the pill is still DCGI, and `worlds-2026` is read only for this link |
| OFF, refresh, desktop and phone (390 px) | Same fixture; no horizontal scroll |
| OFF, event link | Opens `/lol/pro-play/tournament/worlds-2026` |
| ON, desktop and phone | Same fixture; the link `/lol/pro-play/tournament/worlds-2026/schedule?match=115660540726095133` lands in the experience's Schedule |
| Unknown id, desktop and phone | "Can't confirm that match" with "Try again" and "Show the latest match"; no other match. Clearing gives a clean URL and the normal board |
| Ordinary visit | The same automatic board as the base (C9 vs KC, from the real feed); no `worlds-2026` request |
| `?next=` for a fixture in the real feed (C9 v KC) | The existing upcoming board; no tournament lookup |
| `?game=` deep link | The chosen game |
| `?next=<Final>&game=<id>` | The Final, not the game |

Screenshots:
- `01-base-wrong-match-desktop`
- `02-off-final-desktop`
- `03-off-final-phone`
- `04-on-final-desktop`
- `05-on-schedule-landing-desktop`
- `06-on-final-phone`
- `07-off-unknown-desktop`
- `08-off-unknown-phone`

Each has `-viewport` and `-board` variants.

Not exercised against real data, because no Worlds match has started yet: the live and completed tournament states. These are covered by the fixture-based tests in §6.

## 8. Remaining limitations

- **Lookup scope.** Only configured events (`FEATURED_EVENTS`) are searched. A domestic-league fixture beyond the 14-day window (for example LCK) still ends as `unverified`, which is honest but unresolved. The general fix is a backend `/upcoming?match_id=` (UX3A §15 alternative). It is out of scope here.
- **DCGI cannot vouch for completeness.** DCGI serves the v1 contract, which has no coverage block. While DCGI is configured, an unknown id's notice therefore always carries the "not all … can confirm they are complete" clause.
- **Polling.** While an unresolved or tournament-sourced `?next=` is open, the tournament reads poll every 120 s, the same cadence as the tournament page. This is what lets the board move to the live game. An ordinary visit is unaffected.
- **`slow` copy.** The notice says "The schedule is taking longer than usual" even when the wait is on the tournament lookup.
- **Completed fixtures whose games are not in the feed.** These show the completed fixture with a link to the result. They are not auto-pinned to an archived `?game=`; the tournament page's own match links already use `?game=` for those.
- **Experience-side links.** UX2's `matchCentreLink.ts`, in the Worlds experience, still offers a `?next=` link only when the hub's schedule lists the fixture. That restriction can now be relaxed. It is a follow-up in the experience and was deliberately not changed here.

## 9. Integration considerations

- **Ship order.** Frontend only. It depends only on the already-live `GET /api/live-esports/tournament/{worlds-2026,dcgi-2026}`.
- **Gate.** Works with UX3A OFF and ON (§7). Enabling the experience changes only the event link's target.
- **After 15 Oct.** When Worlds becomes Featured, the `worlds-2026` read is the pill's cache entry, so a Worlds `?next=` costs no extra request. The `dcgi-2026` read happens only for an unresolved link.
- **Merge.** `ProPlayHub.tsx` and `MatchCenter.tsx` were not modified by UX3A, so no conflict is expected with `main` at `9fb89ac3`. Merge, don't rebase, to keep the baseline SHA meaningful.
- **Tests depending on the old wording.** Any test or tool that matched `data-testid="next-gone"` or `data-reason="gone"` must use `next-unresolved` with `data-reason="unverified"`. Only two vacuous negative checks (`queryByTestId("next-gone")).toBeNull()`, PW1-A / PW1-C) remain; they still pass and can be dropped.
