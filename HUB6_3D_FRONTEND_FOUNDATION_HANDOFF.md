# HUB6.3D — Analytics Lab + persistent History timeline: frontend foundation

This workstream is frontend, fixture and contract parser only. It builds the foundation HUB6.3E will design the Premium dashboard on; it is not that dashboard.

**Branch and base:**
- Branch: `hub6/ranked-hub-visuals`, one local commit on HUB6.2 `39231649`. HUB6.2 is not amended, and nothing is pushed.

**Backend reference:**
- Commit: HUB6.3B `d4a43826` (`claude/hub6-3-personal-analytics`, worktree `League_Combat_Simulator/.worktrees/hub6-3-personal`).
- No backend file was modified. The backend worktree stayed clean.
- HUB6.3C (population) has no DTO yet.

**Frozen shell (HUB6.2), unchanged:**
- The same Daily expands in place.
- Every stage row and question rail stays.
- A stage is selected by its own row, and one analytics region sits below the stages.
- Popover on a fine pointer, Sheet on touch.
- One Daily expanded at a time.

---

## A. Parser (HUB6.3B additive fields)

`src/lib/history/personal.ts` (new) holds lenient readers. `contracts.ts` wires them in and re-exports the types.

**Free fields:**

| Where | Fields read |
|---|---|
| Run `basic` | `questions_played`, `incorrect`, `timeout` |
| Stage `basic` | the same three, plus `completion_reason` |
| Stage | `modules[]`, `status`, `skip_reason` |
| Question | `unit`, `public_category {key,label}`, `module_id`, `module_version` |

**Premium fields:**
- `analytics.personal`:
  - `previous_daily`;
  - `core`, with current (including `longest_streak_stages`), previous, delta, history aggregate, records and series.
- `stage.analytics`:
  - `current`, `outcomes`, `categories`, `question_history`, `replayed_by`;
  - `personal` (including `category_history`);
  - `strikes` (Survival), `review_sources` (Review), `selection` (Weak Areas).

**Backwards compatible:**
- A HUB2.3 payload still parses.
- `questionsPlayed` falls back to `answered`.
- `incorrect` and `timeout` fall back to counts of the stage's own question outcomes.
- Every new block is null or empty.
- A malformed new block is dropped, never fatal. The strict HUB2.3 core is unchanged.

## B. Analytics Lab profile — "Analytics Lab — 14 Dailies"

**Pipeline:**
1. Authored facts: `analyticsLabFacts.ts`.
2. Builder rows: `dailyFixtureBuilder` in opt-in `production` mode.
3. HUB6.3B's real `GET /api/history/v1`, run over in-memory SQLite by TestClient.
4. `analyticsLab.golden.json`.
5. The production `readHistoryPage`.
6. The production components.

**The golden is kept separate:** it records `hub6_3b_commit` and `input_sha256`. The HUB5/HUB6 goldens (Timmy, First, Full, Newcomer) stay on HUB2.3 `1ffa624c`, byte-identical.

**Production mode** (off for every other account), in `dailyFixtureBuilder.ts`:
- `ranked_rounds.segment_config_json.analytics_tag`;
- child `module_id` / `module_version`;
- `daily_run_stages.status` and `context_json` (Weak Areas evidence cutoff and policy);
- `result_json.format` and `completion_reason`;
- Journey rounds of up to 5 children;
- timeouts allowed in every non-Review stage.

**Production Standard:** Splash ×4, Meta Reflex (5 cards), Splash ×3, Meta Reflex, and one five-child Journey (the `journey_slice` tag, `mastery_slice` v2).

| Run | Date | What it exercises |
|---|---|---|
| L1 | Sep 1 | First Daily, 4 stages (49/63); every record `first_attempt`; Survival strikes [1,2,3] |
| L2 | Sep 2 | 5 stages. The previous Daily had a different stage set, so `same_stage_kinds` is false |
| L3 → L4 | Sep 3–4 | Time Trial 23/29 → **25/28**: 2 more correct, 1 fewer question played |
| L5 | Sep 5 | Time Trial with 6 timeouts, ending on the bank; a Survival timeout strike; a Meta Reflex card timeout |
| L7 | Sep 7 | Time Trial 18/19 (high accuracy, few played) |
| L8 / L9 | Sep 8–9 | Time Trial 31/34 new record, then 26/30 below record |
| L10 | Sep 10 | Time Trial longest streak 25 (a new record); Survival completed at depth 28 with strikes [1,2] |
| L11 | Sep 11 | Survival depth **33** record, streak 23 |
| L12 | Sep 12 | Standard 22/22: new score and streak records |
| L13 | Sep 13 | Time Trial 31, a **tied** record; Standard tied |
| L14 | Sep 14 | Standard 20/21: the Journey stopped after 4 children |

**Regenerate:** run the first command from the frontend worktree:
```
npx tsx scripts/hub63-export-analytics-lab-rows.ts <scratch>/lab-rows.json
```
Then run this from `League_Combat_Simulator/.worktrees/hub6-3-personal`:
```
python "<FE>/scripts/hub63-generate-analytics-lab.py" . <scratch>/lab-rows.json "<FE>/src/pages/dev/lobby-preview/history/analyticsLab.golden.json"
```

## C. Population fixture (temporary, isolated)

`analyticsLabPopulation.ts` is an `AnalyticsLabPopulationFixture` per run, behind `AnalyticsLabPopulationSource.forRun(runId)`, the seam HUB6.3C replaces.

**Shape:** follows blueprint §11-E, camelCased:
- per metric: status, cohort, users, percentile, median, frequency table, quantiles and sufficiency;
- per run: `strongestMode`.

**How it is computed:**
- Static, deterministic frequency tables with no synthetic users.
- The percentile is the midrank, (below + ½·equal) / N.
- Published tables can top-code a sparse tail.

**Isolation:**
- It never touches `/api/history/v1`, the parser, `DailyHistoryRecord`, or any History component. A test enforces this.
- The server's `population` stays null.

| Run | State |
|---|---|
| L1 | insufficient (40 players) |
| L2 | exactly sufficient (100) |
| L5 / L6 / L8 / L12 | ≈20th / 50th / 85th / 98th percentile |
| L10 | heavy ties (22% of players at the Survival ceiling) |
| L14 | extreme outlier (Time Trial at the 100th percentile) with a top-coded sparse tail |
| L12 / L8 / L11 | Standard / Time Trial / Survival strongest |
| L13 | no strongest mode (lead under 10 points) |
| L9 | one mode insufficient (Survival, 60 players) |

## D. The persistent History timeline

`HistoryQuestionTimeline.tsx` (new) is opted into with `QuestionTimeline`'s `history` prop. Without that prop, `QuestionTimeline` is HUB3's Ranked track, and its DOM is unchanged; `RankedMatchRow` does not pass the prop. The shared art and Popover moved verbatim to `questionTimelineParts.tsx`.

**Fit and paging:**
- **As many icons as fit.** No page-size constant and no width cap: the track measures its content box and shows every icon that fits.
- **Paging only when needed:**
  - Wide rows: arrows sit together at the end of the track, so every row's first icon stays on one vertical line.
  - Narrow rows (6 or fewer icons per line): the pager takes its own line with "5–8 of 28", so the arrows don't cost two icons.
- **200% text:** arrows are fixed 44px CSS targets on touch, so enlarged text never pushes them past the row.

**Sizes:**

| | Unselected row | Selected row |
|---|---|---|
| Fine pointer | 32px (HUB3: 28px) | 38px |
| Touch | 44px | 48px |

**Results, never colour alone:**
- Correct: a green ring and a ✓ badge.
- Incorrect: a red ring and a × badge.
- Timeout: a **dashed slate** ring and a **clock** badge. It is its own result, not a grey "unanswered".
- A module that is not unanimous (Meta Reflex, Journey): a "3/5" badge, plus a child-order segment strip; timeout segments are hatched.

**Other behaviour:**
- **Source:** outcomes come from the History DTO (`RoundVM`), never the review payload, so they are right before the art loads.
- **Art priority** (unchanged `IconFace`): proven art, then the module sigil. Before the review loads, a unit sigil stands in (Journey → layers, Meta Reflex → bolt, Review replay → rotate), so a Journey is never "?".
- **Accessible names:** "Question 7 of 30, Itemization, timed out" or "Question 10 of 10, Journey, 3 of 5 correct, 1 timed out".
- **Legacy stages:** a stage without round ordinals keeps the Ranked track (HUB4.1: nothing may hold a position the record cannot place).

## E. The selected stage row

**Growth:** the selected row keeps HUB6.2's wash and stronger accent, and adds:
- larger icons (`size: "selected"`);
- a rule line, then quick facts (`StageLocalFacts`, rewritten).

**Quick facts:** every one is a fact of the current attempt, and **Free**. The server's `current` is used when present; otherwise the value is counted by the server's own definition (`stageCurrentFacts`).

| Stage | Quick facts |
|---|---|
| Standard | Score · Correct 22 / 22 · Accuracy · Longest streak |
| Time Trial | Correct 24 / 28 · Accuracy · Longest streak · Ended (Bank ran out / Every question played) |
| Survival | Depth · Strikes used (pips, "3 of 3") · Correct · Accuracy · Longest streak |
| Weak Areas, Review | Correct · Accuracy |

**Terminology:**
- "Settled questions" is gone.
- The Daily Overview's Previous Daily reads "+4 points", with the hint "accuracy, 88% vs 84%" when HUB6.3B's previous-Daily block is present.
- `signedPoints` never prints "pp".

## F. Hover and focus data (`historyViewModel.ts`)

`buildStageViewModel(stage)` returns rounds (`RoundVM`: position, unit, C/incorrect/timeout, a verdict never rounded in the reader's favour) and `byOccurrence`.

Each `QuestionOccurrenceVM` carries:
- a stable `occurrenceId` (the DTO's `question_result_id`);
- the public category and outcome;
- the stage category's C / played;
- `priorHistory` (prior exposures and prior correct; last prior outcome, date and run);
- `strikeIndex`, `reviewSource`, `replayedBy`;
- `population: null`, the HUB6.3C slot.

HUB6.3E's hover card reads this model and does not need a new fetch.

## G. Cross-highlight (`historyHighlight.tsx`)

**State:** one `HistoryHighlightProvider` per Daily (`DailyRunRow` wraps each run), holding `{stageId, outcome, publicCategory, occurrenceIds}`. Changing the run's view clears it.

**Builders:**
- `outcomeHighlight` (the donut's inner ring);
- `categoryHighlight(key, outcome?)` (a slice, or a slice × outcome), using the server's exact membership, and the record's own categories for Free;
- `occurrenceHighlight(ids)` (a streak span, a strike, a replay).

**Timeline response:** the timeline lights member positions (brass halo) and steps the rest back (32% opacity, desaturated).

**Proof:** tests only; no control fakes it. They cover:
- outcome;
- category × outcome;
- a 25-question streak span;
- another stage's highlight leaving a row untouched;
- clearing.

## H. Formatting helpers (`historyComparisons.ts`)

- `accuracyComparison`: "89% vs 79%", "10 points higher", "Accuracy +10 points". Points are the difference of the **displayed** percentages.
- `questionsPlayedDelta`: "1 fewer question played" / "5 more questions played".
- `correctDelta`, `correctOfPlayed` ("25 / 28 correct"), `questionsPlayed`.
- `recordView`: First attempt / New record / Tied record / Below record. Only new and tied records earn a medal.
- `seriesOf`, `streakLabel`, `COMPLETION_LABEL`.

## Tier rule

**Free:**
- The current attempt's longest streak, depth, strikes used, C / played, accuracy and completion.
- A test holds the Free-derived streak equal to the server's on all 69 lab stages. Free and Premium facts are identical run for run.

**Premium:** previous comparisons, records, series and category history (all server-side). Population comes later.

**Unchanged:** Free still sees every stage row, rail, question and result.

## Not built (deferred, as asked)

- Donuts, histograms, gauges;
- the strongest-mode profile, medal systems, full stage dashboards;
- the Review connector;
- any recurring/recovered weakness, mastery/recovery or learning-state label.

## Certification

Everything was measured through the real page (`/dev/lobby-preview`, Analytics Lab, Premium). The probe is Playwright (msedge), with reduced motion, touch at 320–667 and fine pointer at 768 and up.

**Rows covered:**
- L14: Time Trial 28, 10-module Standard, Survival 24, Weak Areas, Review.
- L11: Survival (31 positions).
- L1: the 4-stage Daily.

| Viewport | Page overflow | Rail overflow | Icons per unselected row (TT / Std / Surv) | Icon (unsel → sel) | Min target | Every position reachable |
|---|---|---|---|---|---|---|
| 320×568 | 0 | 0 | 4 / 4 / 4 (stacked pager) | 44 → 48 | 44 | 28/28, 10/10, 24/24, 31/31 |
| 375×667 | 0 | 0 | 5 / 5 / 5 | 44 → 48 | 44 | ✓ |
| 390×844 | 0 | 0 | 5 / 5 / 5 | 44 → 48 | 44 | ✓ |
| 412×915 | 0 | 0 | 6 / 6 / 6 | 44 → 48 | 44 | ✓ |
| 667×375 | 0 | 0 | 8 / **10 (all)** / 8 | 44 → 48 | 44 | ✓ |
| 768×1024 | 0 | 0 | 6 / 6 / 6 | 32 → 38 | 26 (fine) | ✓ |
| 1280×720 | 0 | 0 | **18** / **10 (all)** / **18** | 32 → 38 | 26 (fine) | ✓ |
| 1440×900 | 0 | 0 | **18** / **10 (all)** / **18** | 32 → 38 | 26 (fine) | ✓ |
| 320 @ 200% text | 58* | 0 | 2 / 2 / 2 | 88 → 96 | 44 | ✓ |
| 390 @ 200% text | 0 | 0 | 2 / 2 / 2 | 88 → 96 | 44 | ✓ |

\* The 58px comes from the app's global HUD header at 200% text. It is present with every Daily collapsed and contains no History element.

**Heights:**
- Selected-row growth at 1280: 44 → 108px (rule line plus facts).
- On phones, a paged row's stacked pager adds one 44px line. That is the price of 4 icons per page at 320 instead of 2.
- Card heights are in the probe log.

**Touch targets:** no target is under 44px on touch, including at 200% text. Weak Areas and Review never page.

## Tests

**New suites:**

| Suite | Tests |
|---|---|
| `lib/history/personal.test.ts` (parser, backwards compatibility) | 4 |
| `analyticsLab.test.ts` (provenance, the 14 Dailies, Free = server streak) | 14 |
| `analyticsLabPopulation.test.ts` | 10 |
| `HistoryQuestionTimeline.test.tsx` (view model, fit and paging, results, Ranked unchanged, cross-highlight) | 22 |
| `historyComparisons.test.ts` | 8 |
| `LobbyPreviewPage.analyticsLab.test.tsx` (the lab through the real page) | 9 |

**Updated assertions:**
- "pp" → points (3 tests);
- "settled" → "questions played" (2 tests);
- History touch size is now read from the inline rem style;
- the preview isolation regex now expects the combined source map.

**Regression:**
- The Ranked `QuestionTimeline` suite passes 34/34 with `--testTimeout=240000`. Its Radix popover tests exceed the 5s default in this environment, identically at `39231649`.
- Full-repo run: 767 files. 61 failures, all identical by test name to a run at `39231649`: admin, security migrations, CRLF style slices, routing, and guard suites. None is in History.
- `src/test/security/pt2cProfileFrameAuthority.test.ts` runs out of memory at baseline too.
- `tsc -p tsconfig.app.json`: only the 2 known errors (`OnboardingProfile.tsx`, `identity/connections.ts`).
- ESLint on the touched files: 0 errors. The warnings are react-refresh "only exports components", the same pattern as the existing `HistoryAnalysis` and `StageAnalytics`.

## Remaining for HUB6.3E

- Design the Premium region on top of `StageViewModel`, `historyHighlight` and `historyComparisons`: previous comparison, records, series, category donut, strike and streak marks.
- Replace `analyticsLabPopulation` with HUB6.3C's adapter.
- `HUB6_3_ANALYTICS_BLUEPRINT.md` sits **untracked** in the worktree root. It is the owner's file and was deliberately not committed.
