# JLIB-HOST-FE: Journey Library identity from the persisted match host (handoff)

| | |
|---|---|
| Repo / branch | `mogsy`, branch `jlib-fe-host-identity` (worktree `.worktrees/jlib-fe-host`) |
| Starting SHA | `d4de016626b7842c421979d9e9560575130a40fc` (JLIB-FE, `jlib/journey-library-frontend`) |
| Final SHA | the branch tip (`git log -1 jlib-fe-host-identity`); the implementation commit is recorded in §9 |
| Backend | JLIB-HOST, `League_Combat_Simulator` branch `jlib-match-host-identity`, local SHA `1b62f1a3`. **Not pushed, not deployed.** Read `JOURNEY_LIBRARY_HOST_HANDOFF.md` there. |
| State | Committed locally only. Not pushed, not deployed. |

## 1. What changed

Before, a Journey Library match was recognized only from the router-state hint `origin: "journey_library"`. That hint is lost in a new tab, with cleared history, or after active-match discovery. Now the backend's persisted `host` is the canonical source on every read that carries it. The router state is only a hint for the first frames.

## 2. Files

| File | Change |
|---|---|
| `src/lib/ranked-public/matchHost.ts` | **new**: the one host type and reader. `MATCH_HOST` constants, `RankedMatchHost`, `readMatchHost`, `matchHostLabel` |
| `src/lib/ranked-public/client.ts` | `ActiveMatchInfo.host` widened from `"daily_challenge" \| null` to `RankedMatchHost \| null` and read verbatim; `isDailyHosted` uses the constant |
| `src/lib/ranked-public/contracts.ts` | `PublicRoundView.host?` (match state and the resume's embedded public projection); `MatchHistoryEntryView.host` |
| `src/pages/quiz-ranked/matchOrigin.ts` | origin ids are host values; `originForHost`, `resolveMatchOrigin` (the precedence rule) |
| `src/pages/quiz-ranked/QuizRankedMatch.tsx` | resolves the origin from the latched persisted host over the hint; new `onOriginChange` prop |
| `src/pages/quiz-ranked/QuizRankedPage.tsx` | discovery's host becomes the hint when there is no router state; the back link follows the arena's resolved origin |
| `src/components/quiz/workspace/RankedMatchRow.tsx` | History quiet line: `· Journey Library` |
| Typed fixtures | `host: null` added in `lobbyPreviewFixtures.ts`, `syntheticRankedHistory.ts`, and 4 test fixtures |
| Tests | new `matchHost.test.ts` (9) and `RankedMatchRow.host.test.tsx` (6); added cases in `QuizRankedPage.journeyOrigin.test.tsx` (+9) and `QuizRankedMatch.endScreen.test.tsx` (+8) |
| Browser spec | new `e2e/jlib/journey-host.spec.ts` (3) |

## 3. Host type and reader

* `RankedMatchHost = "journey_library" | "daily_challenge" | "study_hall" | "playtest" | "direct" | (string & {})`.
* `readMatchHost(v)` returns any non-empty string **verbatim**, and `null` for an absent, null, empty or non-string value.
* An unknown future host is preserved. It matches no constant, so it behaves as an ordinary match.
* Callers compare against `MATCH_HOST.*`. There is no second vocabulary: `RankedMatchOriginId` is `typeof MATCH_HOST.journeyLibrary`.
* `matchHostLabel(host)` returns the player-facing name, or `null`. Only `journey_library` → "Journey Library" is named. Raw ids are never rendered.

Where `host` is read:

| Read | Field | Absent |
|---|---|---|
| `GET /active-match` | `ActiveMatchInfo.host` | `null` |
| `GET /matches/{id}` | `PublicRoundView.host` | `undefined` (key omitted) |
| `POST /matches/{id}/resume` | `ResumeView.public.host` (same reader) | `undefined` |
| `GET /history` | `MatchHistoryEntryView.host` | `null` |

On the match state, `undefined` ("not reported": older backend, private projection) is kept distinct from `null` ("reported ordinary"). The precedence rule depends on that difference.

## 4. Precedence: persisted host vs router state

`resolveMatchOrigin(persistedHost, hint)`:

* **A reported host wins**, a string or `null`, even when it contradicts the hint:
  * `journey_library` → Journey origin;
  * `null` / Daily / Study Hall / Playtest / direct / unknown → no origin (ordinary Ranked actions).
* **Only an unreported host (`undefined`) lets the hint stand.** That covers the frames before the first snapshot, and a backend that predates the field.
* The hint is router state for a handoff, or discovery's `found.host` for a match found without router state.
* **Latching.** The arena latches the first host any read reports for the match. The backend writes the host once, at creation, so a later snapshot that omits the key cannot hand the decision back to the hint.

## 5. Recovery behavior

* **Fresh Library launch:** unchanged. The hint gives the first frame "Journey Library", and the snapshot then confirms it.
* **Reload, new tab, cleared history, discovery** (`/quiz/ranked` with no router state):
  * `active_match.host === "journey_library"` gives the Journey hint at once.
  * The match state or resume host confirms it.
  * The arena eyebrow reads "Journey Library".
  * The result primary is "Back to Journey Library" → `/quiz/journeys`; there is no "Play Again".
  * The route link is "Leave Match" during play and "Journeys" on the result screen, both → `/quiz/journeys`.
* **Daily:** discovery with `daily_challenge` still redirects to `/quiz/daily-challenge`. `useRankedQueue`'s `!== "daily_challenge"` checks are unchanged and behave the same with the wider type.
* **`null` / Study Hall / Playtest / direct:** ordinary Ranked behavior, exactly as before.
* **Hosted (Daily) arenas:** `onSessionComplete` and `host` still take precedence over any origin, as before.

## 6. History behavior

* A `RankedMatchRow` with `host: "journey_library"` adds `· Journey Library` to its quiet line, after the relative age (e.g. "Today · Journey Library"). The structure is otherwise unchanged.
* `null` and every other host render byte-identically to a row from a backend that never sent `host`. A test asserts this.
* The lobby hero's compact "Recent ranked" ledger is not labelled (§10).

## 7. Tests

**New and added tests (all pass):**

| File | Result | Covers |
|---|---|---|
| `matchHost.test.ts` | 9 | readers on all four surfaces, verbatim hosts, absent vs null, labels |
| `QuizRankedPage.journeyOrigin.test.tsx` | 12 | discovery recovery for `journey_library`, `null`, `study_hall` / `playtest` / `direct`, Daily redirect, stale router hint overruled by `null`, persisted Journey host over a plain handoff, precedence unit |
| `QuizRankedMatch.endScreen.test.tsx` | 24 | real arena: recovered Journey result → `/quiz/journeys`, resume-only host (latch), stale origin with `null` host → Play Again, other hosts → Play Again |
| `RankedMatchRow.host.test.tsx` | 6 | label, no raw id, null row identical to legacy, no label for other hosts |

Requested coverage, item by item:

1. Fresh launch: `journey-library.spec` Start test plus the handoff page test.
2. Recovered active-match: page and browser tests.
3. Resume: end-screen test "reads the host off the resume payload alone".
4. Result → `/quiz/journeys`: end-screen and browser tests.
5. History label: row and browser tests.
6. No raw id: page, end-screen, row and browser tests.
7. `null`: page, end-screen, row and browser tests.
8. Daily unchanged: page redirect test and `activeMatch.test.ts`.
9. Router-state hint still works: the existing handoff test.
10. Persisted host wins: the page and end-screen stale tests.

**Directly affected suites:** `src/pages/quiz-ranked`, `src/lib/ranked-public`, `src/components/quiz/workspace`, `src/lib/journey-library`, `src/pages/quiz-journeys`, `src/pages/quiz-daily-challenge`, `src/pages/dev/lobby-preview`. Results are in §9.

**Static checks:**

* `tsc -p tsconfig.app.json`: no errors in touched files. The remaining errors are pre-existing: `OnboardingProfile`, `identity/connections`, `practiceLeaveContract.test`.
* `eslint` on touched files: clean apart from 2 fast-refresh warnings on existing exports.

## 8. Browser certification

```bash
npx playwright test -c playwright.frontend.config.ts e2e/jlib
```

7/7 pass, Chromium only. These are the 3 new checks plus the 4 JLIB-FE checks. Every request is fulfilled in the spec, from the shared settled-match fixture with `host` added where the backend puts it. No router state is set.

| Check | Result |
|---|---|
| `/quiz/ranked`, no router state, `host: journey_library` | `history.state.usr` null; result "Back to Journey Library"; link "Journeys" → `/quiz/journeys`; no "Play Again"; no raw id; survives reload; click → `/quiz/journeys` |
| `/quiz/ranked`, `host: null` | "Play Again", link → `/quiz`, no Journey text |
| `/quiz#history` with one Journey and one null entry | Journey row "Today · Journey Library"; null row unlabelled with its 1200 → 1186 ladder; no raw id |

Set `JLIB_SHOTS=<dir>` for the screenshots `h1-recovered-journey-result`, `h2-recovered-ordinary-result` and `h3-history-journey-label`. They were written to `Desktop/jlib-host-shots` and are not committed.

## 9. Results and commit

**Combined run** of the 7 affected directories: 120 files, 1659 tests.

* 1633 passed and 26 failed, in 6 files.
* Most failures were 20–80 s timeouts from running everything in parallel.

**Serial rerun of those 6 files:** 175 passed and 15 failed, in 2 files. Those 15 fail **identically on untouched `d4de0166`**, measured in the `jlib-frontend` worktree:

* `QuestionTimeline.test.tsx`: 14, the "MALT B1 anchored review popover" timeouts.
* `syntheticRankedHistory.test.ts`: 1, "Meta Reflex" vs "Stat Check" label.

**No failure is introduced by this change.**

**Implementation commit:** `jlib-fe-host-identity`, "JLIB-HOST-FE: Journey Library identity from the persisted match host". The final SHA is the branch tip.

## 10. Remaining issues

1. **Deploy order:** the backend `1b62f1a3` must deploy first. Against an older backend, every host reads `null` or unreported. The router-state hint then still covers the immediate handoff, which is the JLIB-FE behavior.
2. **Lobby hero "Recent ranked" ledger** (`RankedLobbyHero`) does not label Journey matches. It is a compact 5-column grid, and labelling it is a design decision. Only the History ledger was in scope.
3. **Hosts are not recipes:** the reads do not say *which* Journey (recipe or version), so the result returns to the Library root, not to a specific card.
4. **No labels for other hosts:** Study Hall and Playtest hosts are now available client-side but deliberately get no label or behavior change.
5. **Dead component:** `pages/quiz-ranked/RankedMatchHistory.tsx` appears unused (tests only). Only its test fixture was updated.
6. **Browser coverage:** Chromium only; WebKit and Firefox were not run. There was no live end-to-end play against the real backend.
