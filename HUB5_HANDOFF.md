# HUB5 — Deterministic Timmy History fixtures + product certification: handoff

Authority: `HISTORY_ANALYTICS_SPEC.md` (untracked in the main checkout), `HUB4_HANDOFF.md`.

## Objective

Make `/dev/lobby-preview` a deterministic certification surface for the finished History product, then certify the product against it. The fixtures test the product; they do not re-implement it.

## Branch and ancestry

- **Branch:** `hub5/timmy-history`, worktree `mogsy/.worktrees/hub5-timmy` (`node_modules` is a junction to the main checkout's copy; package files identical).
- **Base:** HUB4.1 `fcd7cbba` (`hub4/history-frontend`). Its chain is `fcd7cbba` ← `5744311d` (HUB4) ← `98bfb8ca` (HUB3) ← `origin/main` `dd987084`.
  - `origin/main` has not advanced past `dd987084`; HUB4.1 is not yet in it.
- **Backend reference:** HUB2.1 `59cceea2b1126f770fc87fc804ef1f821a3599de` (`codex/history-analytics-b`). The backend worktree was only imported, never modified.
- **Concurrent branches:** none touches `src/pages/dev/lobby-preview`, `components/quiz/workspace` or `lib/history`.
  - `dclane-c/daily-stage-result` adds a `/dev/journey-arena` route two lines above the gated route in `App.tsx`. No overlapping hunk.
  - Nothing concurrent edits `admin-registry.ts`.
- **Not pushed.**

## Fixture architecture

```
raw facts (timmyDailyFacts.ts)                 ← authored: question per (round, challenge), C/X/T, Review source + replay result
  → dailyFixtureBuilder.ts (test-only)         ← validates, emits HUB1-shaped rows + frozen child-match reviews
  → scripts/hub5-export-timmy-rows.ts          ← canonical JSON of the rows
  → scripts/hub5-generate-timmy-history.py     ← seeds HUB1's schema, drives HUB2.1's REAL route (TestClient)
  → history/timmyHistory.golden.json           ← real /api/history/v1 pages per scenario, + input_sha256 + hub2_commit
  → history/timmyHistorySource.ts              ← HistorySource: golden wire pages → production readHistoryPage
  → LeaguecraftHub → the production History components (unforked)
```

- **No analytics are computed in TypeScript.** Every average, delta, trend, personal best, learning signal, recovery rate and capability state in the preview comes from HUB2.1's own `history/daily.py`, run offline.
  - The builder derives only what a record says about itself (a stage's C/A is its questions' outcomes).
  - A test checks those facts against HUB2's projection.
- **Golden provenance is enforced.** `input_sha256` is the hash of the exact exported rows, and a test recomputes it. Editing a fact without regenerating the golden fails the suite.
- **Regenerate:**
  ```
  npx tsx scripts/hub5-export-timmy-rows.ts <tmp>/timmy-rows.json
  cd <League_Combat_Simulator>/.worktrees/history-analytics-b
  python <frontend>/scripts/hub5-generate-timmy-history.py . <tmp>/timmy-rows.json <frontend>/src/pages/dev/lobby-preview/history/timmyHistory.golden.json
  ```
  It needs FastAPI + httpx.

**The builder rejects** (`FixtureFactError`):
- non-Daily stage shapes: Review not last, repeated modes, Weak Areas on an ineligible run;
- duplicate or gapped round and challenge ordinals;
- mixed round shapes;
- Survival or Time Trial terminal paths inconsistent with their misses or time-outs;
- Weak Areas selections with no earlier-run miss;
- authored Review questions (they are derived);
- Review replays of questions that were not missed;
- one miss allocated twice;
- unserved allocations ahead of served ones;
- unknown refs.

## Fixed time

- Anchor: `FIXTURE_ANCHOR = 2026-09-15T18:00:00.000Z` (`history/fixtureClock.ts`), in UTC millisecond arithmetic.
- An instant after the anchor is refused.
- Replaced every `new Date()` + local `setHours` date in the preview:
  - Ranked match times;
  - older Ranked rows;
  - Practice sessions;
  - Owned first/last seen;
  - review `serverTime`, which is now the anchor.
- The golden's `as_of` is the anchor, through the route's `get_utc_now` dependency.
- **Proven by tests:**
  - with fake timers at 2031, re-imported modules produce byte-identical fixtures;
  - a source scan finds no `Date.now()`, `new Date()`, `setHours`, `setDate`, `getDate` or `Math.random` in any preview module.
- **Proven in the browser:** a History digest is identical across reloads.
- Relative-age copy ("1w ago") is production formatting against the reader's clock, and is expected to move.

## Identity model

- **Leaf minter:** `history/canonicalRefs.ts` — `ranked:demo-<id>`, `quiz:<key>`, `mastery:<concept>`.
- **One factory:** `history/questionIdentity.ts`. Every surface resolves through it: Ranked reviews, Daily stage reviews, Review replays, Owned, Missed, the golden's questions.
  - It supplies canonical ref, exact key (`quiz:` only), quiz-bank numeric id, family, concept, category, frozen subject, and generator, source and artifact versions.
- **Fixed defect:** the collection used `ranked:<id>` while reviews used `ranked:demo-<id>`.
- **Occurrence ≠ learning identity:** a `mastery:` concept has several generated instances. Run 11's Survival asks `mastery:annie-q-raw-damage` at (1,0) and (2,1) with different numbers. Each occurrence opens its own card.

## Scenario matrix

| | Where | Evidence |
|---|---|---|
| A new player | `newcomer` profile | Empty golden page; no Daily section; ledger empty state |
| B first Daily, 4 stages | `firstDaily` profile; Timmy run 1 | TT·Std·Surv·Review; every question `first_in_available_history` |
| C later Daily, 5 stages | Timmy runs 2–11 | Weak Areas provenance (earlier-run misses); Review last; runs 2/3 keep their own day's shuffle |
| D strong | run 11 | 88%; +4 pts; trend up; best 173 **tied** with run 8 (earliest kept); recovery 3/3 |
| E poor | run 9 | 54%; −26 pts; below average; bank out; strikes out |
| F trends | runs 8/9/10/11 | up / down / stable / up, each from HUB2's 5-run OLS |
| G recurring weakness | `ranked:demo-baron-respawn` | runs 9 and 11; repeated miss in run 9 |
| H recovered weakness | `quiz:rabadon-ap` | Missed ×3 (runs 2–3), then correct; recovered from run 6 |
| I Review success | runs 3, 11 | Replay correct, linked by result id |
| J Review failure | run 9 | Baron replay missed; 4th allocation unserved and not counted (1/3) |
| K Time Trial | runs 2, 9 exhausted; others completed | Exhaustion ends on one `timeout`; no speed claims |
| L Survival | runs 2, 9 out of strikes | 3rd miss is terminal; strikes shown only in Premium stage analysis |
| M insufficient evidence | `firstDaily`; runs 4–7 partial; run 1 | Counts ("0 of 3"), never a paywall |
| N upgrade required | Timmy · Free | One invitation per run; basic record intact |
| O temporarily unavailable | Timmy · Entitlement unavailable | Retry; no upsell; Missed shows its error (the endpoint's 503), not the paywall |
| P not applicable | run 1 Survival (no frozen ruleset, legacy) | No affordance; run says its settings were not recorded |
| Q repeated ref / multi-challenge | run 11 Survival | 4 rounds × 2 challenges; one concept twice |
| R out-of-order rows | run 11 Survival rows authored scrambled | Display by `round_number`, `challenge_index`; parser also re-sorts a reversed wire array |

- **Population:** stays `null`. No UI invented.
- **Preview controls:** an account switcher (Timmy / First Daily / Newcomer) plus, for Timmy, an entitlement switcher: Premium (default) / Free / Entitlement unavailable.
- **Each entitlement changes all three server-decided reads together:**
  - History golden;
  - quiz history — Pro: the whole 96-session career; Free: 10 of 96 + upsell; unavailable: 10, `entitlement_status: "error"`, no upsell;
  - Missed bank — Pro: a real first page of 25; Free: locked; unavailable: an error.

## HUB2.1 occurrence and Review handling

- **Child results:** carry `round_number` (1-based) and `challenge_index` (0-based).
  - Rounds are either one single-answer question or one Mastery slice.
  - Stage rails draw one position per round (8 Survival results → 4 icons), matching each frozen review.
- **Review:**
  - Allocations have ordinal ≥ 1.
  - Replays are zipped to the Review child's results in ordinal order (HUB1's `sync` rule).
  - `review_outcome` is derived from the replay's own outcome, never authored.
  - A test proves every served replay's source is an earlier-stage miss of the same ref, linked by `question_result_id`.
- **Limit:** the DTO exposes only the recovery rate, not per-item provenance (see HUB2 findings).

## Owned / Missed consistency

- **Owned** is derived with the backend's discovery rule from every submitted single-answer Ranked round, ordinary *and* Daily child. Slices, Meta Reflex and time-outs discover nothing.
  - There is one entry per ref.
  - Counts equal the submitted occurrences.
  - Questions discovered only in Daily are present.
- **Missed** (Premium) is Practice-only (`quiz_attempts`).
  - Its 25 items are authored per session.
  - Each session's miss count is checked against its score.
  - `total_count` is summed over the whole career.
- **`quiz:rabadon-ap` is one identity** on every surface: the same prompt and answer in Missed, in four Daily rounds and in Owned.

## Ranked / Practice coexistence

- Daily child matches never appear in the ordinary Ranked record, although their reviews are openable from their stages. Asserted by id.
- **Ranked fixture corrections:**
  - The 11 older rows were dated 6–31 days back, which put them *after* some newer synthetic rows. They are now strictly older (17–33 days).
  - The rating chain was restarted from 1284. It is now continuous from the synthetic chain's oldest start (1223).
  - The no-contest now moves no rating.

## Route gating

- `/dev/lobby-preview` was registered unconditionally in production.
- It is now `import.meta.env.DEV`-gated at both the lazy import and the route, the same convention as COMBAT1's dev alias.
  - `vite build` emits no LobbyPreviewPage chunk.
  - No fixture string (`demo-timmy`, run ids, golden) is in `dist`.
  - The path 404s in production.
- The admin registry entry now says `developerOnly`, "DEV builds only". It previously said "no route gate".
- Tests: `hub5Isolation.test.ts`.

## Automated tests

| Suite | Result |
|---|---|
| `history/timmyHistory.test.ts` — clock, provenance, source, identity, matrix A–R, builder refusals, coexistence, Owned/Missed, HUB2 tripwire | **62/62** |
| `LobbyPreviewPage.history.test.tsx` — real page → real components: certification items 1–20, 23–24 | **20/20** |
| `hub5Isolation.test.ts` — no production import, no Timmy branching, no analytics in production, no component fork, route gate, links | **13/13** |
| `LobbyPreviewPage.test.tsx`, `syntheticRankedHistory.test.ts` (existing) | **63/63** — the 3 baseline failures are fixed (Windows path separators, and a security test's allow-list string matched as an "import") |
| Admin registry | passes |
| Broad regression | see below |

- `tsc --noEmit -p tsconfig.app.json`: only the 2 baseline errors (`OnboardingProfile.tsx`, `identity/connections.ts`).
- ESLint on touched files: clean.

**Broad regression** covered `src/components/quiz` (HUB3 timeline/review + HUB4 workspace), `LolHistory`, lobby-preview, `src/pages/Quiz*`, `src/components/ui`, `src/hooks`, `src/lib/history`, `src/lib/admin`, `src/App*` and AdminDemoAnalytics, with `--testTimeout=90000`: **2325 passed / 7 failed, 145 files**. Every failure is baseline:

- `playModeCard.styles` ×2, `Quiz.hub` "one h1", `Quiz.rankedRole` "commits NOTHING for Practice": HUB4's documented set.
- `App.routing-contract` ×2 "retired legacy multiplayer routes": reproduce identically on untouched `fcd7cbba`. This file was outside HUB4's scope.
- `QuestionReviewHost` "renders exactly the markup the desktop popover renders": hit its own 60s limit under parallel load. It passes 16/16 in isolation. This is the slow jsdom Popover test HUB3 and HUB4 documented.

## Browser certification

Built-in browser against this worktree's Vite server (`:5195`).

- **Probe measures:**
  - page overflow, row overflow, stage-clipped content, truncated stage names, layout, icons per page, and minimum target size;
  - all of these again with load-more, run and stage analysis, and Owned & Missed (Missed tab) open;
  - the question host: kind, frozen content, focus, scroll lock, Escape, focus return.
- **Emulation:** widths under 768 emulate touch; each size was reloaded.

| Viewport | Pointer | Page overflow | Row / clipped | Stages | Icons/page | Min target | Host |
|---|---|---|---|---|---|---|---|
| 320×568 | coarse | 0 | 0 / 0 | stacked | 3 | 44 | Sheet ✓ |
| 375×667 | coarse | 0 | 0 / 0 | stacked | 4 | 44 | Sheet ✓ |
| 390×844 | coarse | 0 | 0 / 0 | stacked | 4 | 44 | Sheet ✓ |
| 412×915 | coarse | 0 | 0 / 0 | stacked | 4 | 44 | Sheet ✓ |
| 667×375 | coarse | 0 | 0 / 0 | stacked | 5 | 44 | Sheet ✓ |
| 768×1024 | fine | 0 | 0 / 0 | one line | 5 | 28 | Popover ✓ |
| 1280×720 | fine | 0 | 0 / 0 | one line | 5 | 28 | Popover ✓ |
| 1440×900 | fine | 0 | 0 / 0 | one line | 5 | 28 | Popover ✓ |
| 640×360 (= 1280×720 at 200% page zoom) | coarse* | 0 | 0 / 0 | stacked | 5 | — | — |
| 1440×900, 200% text | fine | 0 | 0 / 0 | stacked | — | — | — |
| 390×844, 200% text | coarse | 0 | 0 / 0 | stacked | 1 | 88 | Sheet ✓ |
| 320×568, 200% text | coarse | 52 (hero `lc-emblem`/`ranked-play-gem` + Practice age column; = HUB4) | 0 / 5px arrows (= HUB4) | stacked | 1 | 88 | — |

\*The tool couples widths under 768 with touch.

**Hosts:**
- Every Sheet opened the right Daily question (Rabadon's Deathcap, Q2 of 4).
- Every Sheet focused Close, locked body scroll, closed on Escape and returned focus.
- The Popover took focus and returned it.
- The repeated-ref Survival round opens its own instance (160 AP, not 100 AP).

**Keyboard:**
- Real Enter opens and real Escape closes the Popover, with focus returned.
- Tab order: a stage's icons, then its Analysis toggle, then the next stage.

**Reduced motion:**
- No animation runs in History, and the trajectory is static SVG.
- The chevrons carry `motion-reduce:transition-none`.
- Every other transition is a hover colour.
- OS reduced-motion emulation is unavailable in this browser.

**Legacy hashes:**
- `#review` opens and focuses Owned & Missed, then becomes `#history`.
- `#trends` opens and focuses the newest run's analysis, then becomes `#history`.

**HUB5's own layout fix:** the preview switcher (HUB5 added controls) made a non-wrapping 476px bar and 172px page overflow at 320px. It now wraps.

## Product certification (1–26)

**Passed:** 1–17, 19–24 and 26.

**#18 — recurring/recovered coherence: FAIL, owned by HUB2 (finding 2).**

**#25 — no page overflow:** passes at every certified size.
- The exception is 320px + 200% text: 52px from the hero and the Practice age column.
- That is the same figure HUB4 recorded; it is not HUB5-owned.

**#17 — Review provenance:**
- Exact in persistence, and tested.
- The DTO carries the recovery rate only (finding 4).

## Defects and findings, by owner

**HUB2 (backend projection) — not fixed here:**
1. **Crash — blocker for real composed Dailies.**
   - `_stage_compat` sorts `(generator_version, source_version)` tuples and raises `TypeError` when one stage mixes a null and a named generator (a curated bank question beside a generated slice).
   - The exception is outside the projection's try-block, so the whole `/api/history/v1` page fails.
   - `hub5-generate-timmy-history.py` re-proves it on every run.
   - Workaround in the fixture only: every namespace carries a non-null generator version (commented in `questionIdentity.ts`).
2. **Within-run exposures are ignored by learning signals.**
   - Each occurrence is judged against prior runs only.
   - One occurrence (run 11's Baron replay) is flagged `recurring_weakness` **and** `recovered_weakness`.
   - A replay right after a same-run miss counts as "recovered", against the spec's "≥2 consecutive correct … latest correct".
   - Visible in the UI.
   - Tripwire test: `known HUB2.1 finding`.
3. **Run comparisons are rarely reachable** (product/HUB2 decision).
   - The run compatibility key includes the *ordered* stage keys, Survival's day `content_set_id`, and each stage's content-version set.
   - The plan shuffles stage order daily, and Review/Weak Areas composition is personal.
   - So most real runs never share a key, and average/delta/trend/best stay insufficient.
   - Timmy uses one stable-order cohort (runs 4–11) to exercise rendering; runs 2–3 show the fragmentation.
4. **No per-item Review provenance in the DTO.**
   - Per-item Review→source linkage is not projected.
   - `review_recovery_rate` covers the current run's items only; the spec's registry says "across runs".
5. Carried over from HUB4: skipped-stage status, display labels, Free strikes, stage comparison value.

**HUB3 (infrastructure):**

6. `useFittingPageSize` re-fits on width, not on a live root-font change. A mid-session text-size change leaves rails paged for the old size (overflow at 390px/200% until remount). At-load 200% is correct.

**HUB4 (frontend):**

7. At 320px + 200% text with run analysis open, the trend label overhangs the run row by 28px. It does not widen the page.
8. Learning signals name questions as "Stage · category". Category-only questions read as, e.g., "Time Trial · Objective Timers", with duplicates, so the question is not identifiable.

**Other owners:**

9. `/dev/play-scroll` (ungated) links to `/dev/lobby-preview`, which now 404s in production. Play-scroll's own gating belongs to its owner.
10. Pre-existing test noise: `useAuth must be used within AuthProvider`, printed (caught) by the `LobbyPreviewPage.test` render.

## Changes intentionally NOT made

- No production History, timeline, review, ledger, Owned/Missed or hub component was changed.
  - Production files touched: `App.tsx` (the gate) and `admin-registry.ts` (the gate's description) only.
- No HUB2/HUB1 fix. The backend was not modified.
- No population UI.
- No Daily/Ranked gameplay change.
- No visual polish.
- `/dev/play-scroll` not gated.

## Files

**New:**
- `src/pages/dev/lobby-preview/history/`:
  - `fixtureClock.ts`
  - `canonicalRefs.ts`
  - `questionIdentity.ts`
  - `dailyFixtureBuilder.ts`
  - `timmyDailyFacts.ts`
  - `timmyHistoryInput.ts`
  - `goldenPageSize.ts`
  - `timmyHistorySource.ts`
  - `timmyHistory.golden.json`
  - `timmyHistory.test.ts`
- `src/pages/dev/lobby-preview/`:
  - `timmyPractice.ts`
  - `timmyLibrary.ts`
  - `LobbyPreviewPage.history.test.tsx`
  - `hub5Isolation.test.ts`
- `scripts/`:
  - `hub5-export-timmy-rows.ts`
  - `hub5-generate-timmy-history.py`

**Modified:**
- `LobbyPreviewPage.tsx`
- `lobbyPreviewFixtures.ts`
- `syntheticRankedHistory.ts` (+ both existing tests)
- `src/App.tsx`
- `src/lib/admin/admin-registry.ts`

## Remaining work for HUB6

- Visual polish and motion: trajectory reveal, bar growth.
- An icon for Mastery-slice rounds: currently HUB3's generic "?".
- The 320px/200% trend-label overhang (7).
- Identifiable signal names (8).
- GRAPH1 primitive extraction.
- Retire `PerformanceTrendsPane` with the AdminDemoAnalytics decision.
- Academy owner decision on Practice movement/cadence.
- Non-colour outcome mark.
- Real-device checks (safe areas, Android back).
- **Real-account certification:** after HUB2 findings 1–3 are resolved, against a persisted staged Daily.

## HUB5.1 — Regenerated against HUB2.2

**Consumed:** HUB2.2 `bb8ed3340c4fd23cdce23861e446cb1e235fc2d9` (`codex/history-analytics-b`). Schema 1; the occurrence and Review contracts are unchanged. Base: HUB5 `20217edd`.

### Workaround removed; truthful mixed provenance

- In `questionIdentity.ts`, curated content is back to `generator: null`: the reviewed Ranked export (`ranked:`) and the quiz bank (`quiz:`).
- Generated Mastery (`mastery:`) keeps `mastery-gen-4` / `mastery-set-12`.
- Every run now has 1–2 stages mixing null and named generator versions:
  - composed Standard: ranked + quiz + mastery;
  - Review: replays of misses from all three.
- No version is invented to make compatibility work.

### Golden regeneration

- Regenerated through HUB2.2's real `GET /api/history/v1`, same path as before (facts → rows → route → golden → production parser). `hub2_commit` is now `bb8ed334…`.
- No derived value was edited by hand.
- The old crash reproducer in `hub5-generate-timmy-history.py` is now a **regression assertion**: the mixed null/named stage must answer HTTP 200, and the script aborts otherwise. Result: **HTTP 200**.
- `timmyHistory.test.ts` asserts that run 11's Standard carries both `null` and `mastery-gen-4` and is `available`.

### Chronology (recurring / recovered)

**The HUB5 finding is fixed.**
- Run 11's Baron Review replay (`timmy-qr-11-4-1-0`) now sees its same-run source miss as its previous exposure (outcome `incorrect`, completed the same day).
- It is **not** recovered.
- It is recurring only, and the UI shows it as "Review · Objective Timers (last seen Sep 15)".
- The former tripwire now asserts this corrected behaviour permanently.

**Recurring weakness still works:** Baron is recurring in runs 9, 10 and 11.

**Recovered weakness still works:** Rabadon's Deathcap AP is recovered in runs 6, 10 and 11, after its proper miss–miss–miss then correct–correct sequence.

**First exposure now follows the same-run stream.** A first Daily marks only the first occurrence of each ref as `first_in_available_history`: 14 of 19 questions, because replays and repeated concepts already have an earlier exposure. The test was updated to that.

**Review provenance** is unchanged and exact: every served replay is linked by `question_result_id` to an earlier-stage miss of the same ref, and recovery counts are as before (run 11: 3/3; run 9: 1/3 plus 1 unserved).

**Preserved finding — HUB2 metric definitions, not a launch blocker, not approved for launch presentation, not investigated further here:**
- Run 5's `timmy-qr-05-1-4-0` (Garen health remaining, Standard round 4) still carries both `recurring_weakness` and `recovered_weakness`.
- Its exposures, in chronological order, end ✗ ✗ ✗ ✓ ✓. The last five hold 3 misses (recurring), and a recurring state at the third miss is followed by two corrects (recovered).
- Both registry definitions are literally satisfied, so this is a definitional overlap, not the within-run ordering bug.

### Compatibility cohorts (current strict policy — observed, not changed)

Measured with HUB2.2's own `_build_records` keys over Timmy's rows.

**1. Runs:** 11 completed Daily runs.

**2–3. Cohorts:** 4 — {run 1}, {run 2}, {run 3}, {runs 4–11}, of sizes 1, 1, 1 and 8.

**4. Metrics that can compute** (earlier compatible runs are counted within the cohort only):

| Metric | Minimum history | Runs that compute it |
|---|---|---|
| Previous-run delta | 1 prior run | 5–11 |
| Personal best | 2 runs | 5–11 |
| Historical average | 3 prior runs | 7–11 |
| Trajectory | 5 runs | 8–11 (up / down / stable / up) |

**5. Blocked by compatibility:**
- Runs 1, 2 and 3 compute none of the four, each being alone in its cohort.
- Run 4 (the first of its cohort) and runs 5–6 or 5–7, for the metrics with higher thresholds, are limited by cohort size, not by incompatibility.

**6. Caused solely by stage order:** runs 2 and 3.
- Their five stage keys are identical to runs 4–11; only the order differs (Survival-first; Standard-first).
- If order were ignored (measurement only), runs 2–11 would form one 10-run cohort.
- That would give runs 2–11 comparisons, and trajectory from run 6.

**7. Caused by substantive differences:** run 1 only.
- Its Survival stage froze no ruleset (legacy), so its stage key and run key are null ("settings were not recorded").
- Run 1 also has four stages, so it could not join a five-stage cohort anyway.
- Mixed curated/generated provenance does **not** split cohorts: the provenance sets are stable per stage kind across runs 2–11.

**Deliberate fixture choice:** runs 4–11 share one order on purpose, to exercise the longitudinal UI. Runs 2–3 keep their own shuffles on purpose, to show the strict policy's effect. Nothing was reordered in HUB5.1.

**Next decision (HUB2.3, product and backend):** whether run compatibility should stay keyed on the *ordered* stage keys. On this data, stage order alone removes all run-level comparison from 2 of 10 comparable five-stage runs.

### Tests

- Timmy suites (fixtures, page certification, isolation/route gating, existing preview): **159/159**.
- Scoped regression (`components/quiz/workspace` HUB4 + HUB3 timeline/review, `lib/history`, lobby-preview, `LolHistory`, `lib/admin`, `App*`): **756 passed / 2 failed**. Both failures are `App.routing-contract` "retired legacy multiplayer routes", the baseline that fails identically on untouched `fcd7cbba`.
- `tsc`: the 2 baseline errors only.
- ESLint on the preview: clean.

**Held from HUB5 and re-verified:**
- anchor, deterministic output, 4/5 stages and saved order;
- distinct repeated refs, round/challenge order;
- all five capability states, Ranked/Practice coexistence, Owned/Missed consistency, Daily child exclusion;
- unforked components, route gate, no production import.

### Browser (layout code unchanged, scoped)

At 1280×720 (fine), 390×844 (touch) and 320×568 (touch), with 11 runs loaded and run analysis plus Owned & Missed open:
- 0 page overflow, 0 row overflow, 0 clipped stages;
- Popover on desktop and Sheet on touch, both with the correct question (Rabadon's Deathcap, Q2 of 4);
- Close focused on the Sheet, and focus returned to the icon on Escape.

### Remaining findings (unchanged, not owned here)

- HUB2.3: strict run compatibility (above), and the recurring/recovered definitional overlap (above).
- HUB2: no per-item Review provenance in the DTO; `review_recovery_rate` is per run.
- HUB3: the live text-size change leaves stale rail paging.
- HUB4: 320px + 200% trend-label overhang; signal naming.
- `/dev/play-scroll` production gating.
