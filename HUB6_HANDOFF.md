# HUB6 — Ranked Hub History + Academy Record visual polish: handoff

Authority: `HISTORY_ANALYTICS_SPEC.md` (§2 ownership, §11 mobile, §12 visualization), `HUB5_HANDOFF.md`, `HUB4_HANDOFF.md`.

## Objective

A launch-quality visual pass on the Ranked Hub's one History surface and the Academy Record, with no new product semantics:
- no new analytics;
- no backend change;
- no entitlement or Review logic change.

## Branch / base

- **Branch:** `hub6/ranked-hub-visuals`, worktree `mogsy/.worktrees/hub6-visuals`. `node_modules` is a junction to the main checkout's copy.
- **Base:** HUB5.2 `c52c31ce` (`hub5/timmy-history`). Backend reference HUB2.3 `1ffa624c` (read only).
- **Not pushed.**

## Visual problems found (before)

Inspected on `/dev/lobby-preview` (Timmy, First Daily, Newcomer; Premium, Free, Unavailable) at 1440, 1280, 390 and 320.

1. **Weak Daily hierarchy.**
   - The run line was a 10px "DAILY" label with the date.
   - Score, C/A and accuracy were 11–13px text jammed at the right.
   - Stages were flat ruled lines with nothing tying them to their run.
2. **A wall of labels.** Each stage carried an "ANALYSIS" text toggle: 5 per run, about 50 on screen.
3. **Premium analysis read as a dump.**
   - Category and question-type bars ran the full ~1000px width in 1.5px deep teal.
   - The trend was a 96×28px sparkline.
   - The figures were small.
4. **Disliked low-data style.** Missing comparisons were one long grey sentence ("Not enough matching history yet for Change from last run (0 of 1…) · Average (…) · …"). The Academy Record's empty window was a bare text box.
5. **Academy Record readability bug.** The bar-chart category labels rendered in the dark theme's light muted-foreground colour, because `ChartContainer`'s tick rule beat the chart's `tick.fill`. They were near-invisible on parchment.
6. **Duplication.** The History ledger's scope line stated "80% average · 100% best" (a Practice session accuracy aggregate). The Academy Record states "All-time accuracy 71%" and owns the accuracy charts: two competing accuracy aggregates on one page.
7. **Motion.** None anywhere in History (HUB4/HUB5 left it for HUB6).

## Decisions and changes

### Daily (`DailyRunRow.tsx`)

**The run is one contained object**, rounded and inset, and keeps the brass marginal rule.

- **Header:**
  - A calendar badge, dropped under a 22rem-wide card.
  - "DAILY · 1w ago" over the plan date at 17px.
  - The score at 22px under its "Score" caption.
  - An accuracy ring (the % inside), always beside its C/A.
- **Stages** hang on a vertical spine:
  - Each stage has a numbered node for its persisted order and a kind glyph: Swords Standard, Timer Time Trial, Shield Survival, Crosshair Weak Areas, RotateCcw Review.
  - Stage names are the Daily's own.
  - Only persisted stages are shown: 4 on a first Daily, 5 otherwise. Nothing is fabricated.
  - Results are unchanged in content (Standard score · C/A · the recap's terminal note), set in a stronger weight.
- **Stage analysis toggle:** now a chart glyph + chevron. Its accessible name and tooltip are still "Analysis" (`sr-only`), with a 44px target on touch.
- **Run analysis:** the toggle is the object's footer.
- **Stacked (narrow) layout:** result and rail indent 30px past the spine. Under a 16rem stage width (320px at 200% text) the indent is dropped so the question rail never overhangs.
- **Questions are unchanged.** They are visible without expanding anything, open the HUB3 Popover on desktop and the Sheet on touch, and `QuestionTimeline` / `QuestionReviewCard` are not forked.

### Premium analysis (`HistoryAnalysis.tsx`)

The expansion is a panel of the Daily (run) or of the stage (indented under it), and unrolls from its top edge.

**Run analysis:**
- **Layout:** a trend chart plus a 2×2 grid of figures:
  - Accuracy vs last run
  - Average accuracy
  - Best score
  - Review recovery
- **Chart:** HUB2's own 5-run values on a full 0–100% axis, drawn oldest → newest.
  - The newest point is ringed and labelled; it is always this run, which the golden verifies.
  - The historical average is a dashed rule. The "Average accuracy" label carries the same dash as its key.
  - The direction label (Up/Down/Stable) now has an arrow glyph.
- **Bars:** categories on a common zero baseline, two per row when wide, 7px, brass.

**Dormant, not absent.** A metric the server marked insufficient keeps its place:
- the figure shows "—" with the server's count ("0 of 3 matching runs");
- the trend keeps an empty frame, with no axis values, and a separate row of slots with `observed` filled ("1 of 5");
- the slots sit off the plot so they can never read as 0%.

The old "Not enough matching history yet for …" sentence is gone. `insufficient_evidence` with analytics and `available` now share one layout.

**Stage analysis:** unchanged content. Survival strikes gain pips against the frozen limit, and the bars are the same as the run's.

**Capability states** (server-authoritative, logic untouched):

| State | Behaviour |
|---|---|
| `upgrade_required` | The same sentence and button, set beside an empty chart frame, with no fake data |
| `temporarily_unavailable` | Retry, never an upsell |
| `insufficient_evidence` without analytics | The server's reason text |
| `not_applicable` | No affordance |

**Learning signals** (including recurring/recovered weakness) are left **exactly as HUB4 wrote them**: same text, not visualized, not renamed, placed last. See "Remaining".

### Academy Record (`lobby-analytics/*`)

- Axis labels are forced to the sheet's body ink (bug 5).
- Bars grow from the baseline; the donut sweeps from 12 o'clock. Recharts' own animation, off under either reduced-motion switch and in jsdom.
- **Empty window:** the chart's own frame stays with the existing sentence on it. That is the 0/50/100 axis for bars, and an unfilled ring for the donut.
- No statistic was added, removed or relabelled in the Academy Record.

## Academy Record vs History ownership

| Information | Owner | Action |
|---|---|---|
| Rank/XP, Academy tier, personal records (answered, all-time accuracy, streaks, XP, ranked matches) | Academy | Kept |
| Windowed accuracy/answers by category or mode (bars, donut) | Academy | Kept |
| Practice session **average / best accuracy** (ledger scope line) | Academy (accuracy aggregate) | **Removed from the hub's History.** `StudyHistoryLedger` gains `sessionAggregates` (default `true`); the hub passes `false`. `/lol/history`, which has no Academy Record, is unchanged. |
| Session count / window ("96 sessions on record") | History | Kept (scope of the record) |
| Run score, C/A, accuracy, stages, questions, comparisons, trend, categories | History (Daily/Stage) | Kept; not repeated in Academy |
| "Study history" link in Academy | Navigation into History | Kept |

Outside the brief's ownership scope, left alone: the hero's centre "Recent · Mid 6/7 · 86% win rate" and the left scroll's role mastery "6W·0L·1D · 7 recent matches" state the same recent role record twice. Flagged for the hero owner.

## GRAPH1 primitives reused / extracted

| Primitive | Where it went |
|---|---|
| `usePlaybackClock` (rAF timestamp delta, clamped hidden-tab steps) | Moved to `src/lib/motion/usePlaybackClock.ts`; `src/graph1/usePlaybackClock.ts` re-exports it, so GRAPH1 imports and tests are unchanged |
| `easeInOutCubic` (race interpolation) | Moved to `src/lib/motion/easing.ts` (+ `easeOutCubic`, `clamp01`); `graph1/engine.ts` imports it by relative path, so the Remotion bundle needs no alias |
| New `src/lib/motion/useReveal.ts` | A one-shot 0→1 reveal on the playback clock, started by IntersectionObserver |
| `useMotionAllowed` | Gates the Recharts animations |
| `staggered` | Staggers the pieces of one reveal |

- No GRAPH1 data contract, family registry, scope or Pro Play API is touched.
- There is no GRAPH2 and no generalized chart framework. History's four marks live in `workspace/historyVisuals.tsx`.

## Animations

- Ring: draws its share when the run is first seen.
- Expansion: unrolls (clip-path, 280ms).
- Trend: its line is revealed left→right by a widening clip, points land as the line reaches them, then the newest value appears.
- Bars: grow from zero, staggered.
- Pips: fill in order.
- Figures: count into place, and a delta keeps its sign mid-count.
- Nothing loops, and text never withholds the final value.

## Reduced motion

- `useReveal` returns progress = 1 from the first render under OS `prefers-reduced-motion` **or** the app's `html.reduce-motion` (`useReducedMotionPreference`), and whenever IntersectionObserver or rAF is missing.
- `.history-unfold` is disabled under both switches.
- Recharts animations are off.
- Verified in the browser with `reducedMotion: 'reduce'`: final state on first paint.

## Certification

Playwright + Edge headless against this worktree's Vite (`:5196`). Widths under 768 emulate touch. Run analysis and one stage analysis are open during the probe.

| Viewport | Pointer | Page overflow | Row overhang | Stages | Min toggle |
|---|---|---|---|---|---|
| 320×568 | coarse | 0 | 0 | stacked | 44 |
| 375×667 | coarse | 0 | 0 | stacked | 44 |
| 390×844 | coarse | 0 | 0 | stacked | 44 |
| 412×915 | coarse | 0 | 0 | stacked | 44 |
| 667×375 | coarse | 0 | 0 | stacked | 44 |
| 768×1024 | fine | 0 | 0 | one line | 28 |
| 1280×720 | fine | 0 | 0 | one line | 28 |
| 1440×900 | fine | 0 | 0 | one line | 28 |
| 390×844, 200% text | coarse | 0 | 0 | stacked | 44 |
| 1440×900, 200% text | fine | 0 | 0 | stacked | 56 |
| 320×568, 200% text | coarse | 52 (hero `lc-emblem`/`ranked-play-gem`, = HUB4/HUB5 baseline) | 0 visible | stacked | 44 |

**At 320×568 with 200% text:**
- The HUB4 **~28px trend-label overhang is fixed** (the trend is rebuilt as a responsive chart).
- The first cut of HUB6's indent overhung the rail by 18–22px; that was fixed with the 16rem rule.
- The one remaining probe hit (3px) is text inside a `truncate` label, which is clipped rather than visible.

**Hosts:**
- Desktop Popover opens with focus on it.
- The touch Sheet opens with focus on "Close question review", and body scroll is locked.

**Touch targets:**
- The existing "More Daily runs" button is now 44px on touch.
- The Owned/Study/Ranked stream chips gain a 44px hit area on touch (via a pseudo-element; the visual size is unchanged).

## Tests

**New:**
- `workspace/historyVisuals.test.tsx` (10): reveal fallbacks, app reduce-motion, easing parity, ring, bar, pips, trajectory, dormant slots.
- Academy dormant frame (2).
- Stage toggle accessible name.

**Updated to the intended change:**
- `DailyHistory.test.tsx`: a null metric keeps its place dormant, instead of being listed in a sentence.
- `LobbyPreviewPage.history.test.tsx` #9/M: the counts now appear in the dormant figures.
- `LeaguecraftWorkspace.test.tsx`: the hub ledger has no average/best. A new test proves the standalone ledger still states them.
- `Quiz.hub.test.tsx`: no average/best in the hub.

**Scoped** (workspace HUB3/HUB4, `lib/history`, lobby-preview HUB5, lobby-analytics, graph1): all pass. That is 35 files and 687 tests at the first run, plus the new tests.

**Broad** (`components/quiz`, LolHistory, lobby-preview, `pages/Quiz*`, `components/ui`, hooks, `lib/history`, `lib/admin`, `App*`, graph1, `components/graph1`, `lib/motion`): **2671 passed / 6 failed, 170 files**. All 6 failures are baseline:
- `App.routing-contract` ×2 (retired legacy multiplayer routes);
- `Quiz.hub` "exactly one h1";
- `Quiz.rankedRole` "commits NOTHING for Practice";
- `playModeCard.styles` glint: it slices `index.css` up to `"}\n}"`, which never matches this CRLF checkout (HUB4's documented `playModeCard.styles` set);
- `QuestionReviewHost` "renders exactly the markup the desktop popover renders": the known 60s jsdom Popover timeout under parallel load.

**`tsc --noEmit -p tsconfig.app.json`:** only the 2 baseline errors (`OnboardingProfile.tsx`, `identity/connections.ts`).

**ESLint on touched files:** no new findings. The pre-existing `@ts-nocheck` in `LeaguecraftWorkspace.test.tsx` and pre-existing fast-refresh warnings remain.

## Files

**New:**
- `src/lib/motion/{easing.ts, useReveal.ts}`
- `src/components/quiz/workspace/historyVisuals.tsx` (+ test)

**Moved:**
- `src/graph1/usePlaybackClock.ts` → `src/lib/motion/usePlaybackClock.ts`, with a re-export stub left at the old path

**Modified:**
- `workspace/DailyRunRow.tsx`
- `workspace/HistoryAnalysis.tsx`
- `workspace/DailyHistorySection.tsx`
- `workspace/StudyHistoryLedger.tsx`
- `LeaguecraftHub.tsx` (one prop)
- `lobby-analytics/{AcademyAnalyticsCarousel, AccuracyBarChart, DistributionDonut}.tsx`
- `graph1/engine.ts` (the easing import)
- `index.css` (`history-unfold`)
- Tests listed above

## Remaining launch-facing issues

1. ~~**Product decision needed:**~~ *(resolved in HUB6.1: removed from launch UI)* the Premium run analysis still showed HUB4's "Learning signals" text, including **Recurring weakness** and **Recovered**. HUB6 did not touch them, by instruction. They are not approved launch concepts, so product should decide whether to hide them for launch. Hiding them is a small change in `LearningSignals`.
2. **Mastery-slice rounds** still use HUB3's generic "?" icon (Survival). Question artwork was preserved by instruction; a proper slice icon is a HUB3-owner task.
3. Copy flags: no new sentences were written. The only new visible words are the existing metric labels reused on dormant figures. The Premium invitation text is unchanged.
4. **Hero duplication** (recent role record shown twice): owned by the hero, not HUB6.
5. Real-device checks (safe areas, Android back) and real-account certification: carried over from HUB5.
6. `/dev/play-scroll` gating and the `useFittingPageSize` live text-size refit (HUB3): carried over.

## Next task

Product review of the before/after on `/dev/lobby-preview`. Then a decision on item 1, and real-account staged-Daily certification once a persisted environment exists.


## HUB6.1 — Multi-layer Daily analytics

**Base:** HUB6 `27534215` on `hub6/ranked-hub-visuals`. HUB6.1 is one new local commit on top of it; nothing amended, nothing pushed.

### Interaction architecture (owner-locked)

```
HISTORY                       one list; ordering unchanged (Daily, then Ranked/Practice)
 └ DAILY RECORD  (layer 0)    HUB6 collapsed row: date · score · ring · C/A · stages on the spine · question rails
    └ DAILY FOCUS (layer 1)   "Run analysis" or any stage entry → the row becomes the Focus
       ├ header               date · score (34px) · 68px ring · C/A · collapse
       ├ stage navigator      Daily Overview + this run's persisted stages (4 or 5), always present
       └ ONE canvas           Daily Overview  |  exactly one Stage Focus
          └ STAGE FOCUS (layer 2)   ← Daily Overview · stage band · the stage's own visual · ruleset facts
             └ QUESTION (layer 3)   existing inspector: Popover (fine) / Sheet (touch)
```

**One Daily in Focus at a time.**
- `DailyHistorySection` owns `{runId, view}`.
- Opening another Daily collapses the first.
- A stage entry on a collapsed row opens Focus straight at that stage.
- A stage replaces the canvas content. It is keyed by view, with one canvas element, and a stage never appends a second panel.
- "← Daily Overview" restores the overview in the same Focus and moves keyboard focus to the navigator.
- Closing a question leaves Focus, view and scroll untouched.
- Legacy `#trends` opens the newest analysable run's Focus.

**Free and other capability states.**
- Focus opens for every run (it is navigation).
- Analytics appear only where the server grants them.
- `upgrade_required`: one invitation, in the Daily Overview. Stages inherit it and repeat nothing.
- Stage Focus for Free shows the basic record: result, terminal note, rule and exact questions. Weak Areas/Review show question cards; the other stages show HUB3's timeline.
- `temporarily_unavailable`: retry, never an upsell.
- `insufficient_evidence`: counts, never a paywall.
- `not_applicable`: no analytics surface.

### Data availability audit (HUB2.3 wire → `contracts.ts` → UI)

| Field / visual | Source | Available? | Safe to derive? | Backend gap |
|---|---|---|---|---|
| Daily trend data | `analytics.trajectory.value.values` (last ≤5 compatible runs, oldest first, **last = this run**, verified in golden) | Yes, when ≥5 compatible runs | — | Runs 1–5: no values (insufficient); no per-point dates/run ids |
| Historical average | `analytics.historical_average` | Yes (≥3 prior) | — | — |
| Previous-run delta | `analytics.previous_run_delta_pp` | Yes (≥1 prior) | — | — |
| Personal best | `analytics.personal_best` (score, is_current, tied, earliest) | Yes (≥2) | — | — |
| This run's accuracy on the chart | `basic.accuracy` | Yes | Yes (it is this run's own fact) | — |
| Standard module boundaries | question `round_number` / `challenge_index` (HUB2.1) | Yes | — | — |
| Standard module kind (quiz / Meta Reflex / Mastery) | stage's frozen child review `rounds[].kind`, joined by `review_identity.match_id` + `round_number` | Yes, once the review loads | Yes (documented link) | Not in History DTO itself |
| Module C/A | the round's question outcomes | — | Yes (count within the round) | — |
| Module points | nowhere | **No** | No | `stage.rounds[].score` (per-module points) |
| Historical Standard scores | only `historical_samples` (a count) | **No** | No | compatible earlier stage results `[{completed_at, score, correct, answered}]` |
| "Splash" module | no such module kind in the Ranked review contract | n/a | — | owner naming decision |
| TT settled count | `stage.analytics.settled_questions` (was on the wire, unread) | Yes (Premium) — now parsed | — | — |
| TT terminal | `basic.ended_by` / `analytics.terminal` | Yes | — | — |
| TT per-question timing | nowhere | No | **No** (wall-clock forbidden) | — (not requested) |
| Historical TT throughput | only `historical_samples` | **No** | No (client join over paged runs would be a client analytics engine) | compatible earlier TT `[{completed_at, settled_questions, correct, answered, terminal}]` |
| Survival depth | `stage.analytics.depth` (was on the wire, unread) | Yes (Premium) — now parsed | Free `answered` is not labelled depth | Free depth/strikes: server-side Premium-only |
| Strikes used | `stage.analytics.strikes_used` | Yes (Premium) | — | Free: not projected |
| Per-occurrence strike attribution | nowhere | **No** | **No** (a miss ≠ provably a strike; slices) | `questions[].strike_index` or `is_strike` |
| Historical Survival depth | only `historical_samples` | **No** | No | compatible earlier Survival `[{completed_at, depth, strikes_used, terminal}]` |
| Weak Areas source provenance | only `selected_themes` (families) | **No** | **No** (joining by ref/learning key = heuristic) | per selected question: `selection.{source_question_result_id, source_run_id, source_completed_at, source_outcome, policy_version}` |
| Review per-question source linkage | only `attempted_allocations` (count) | **No** | **No** (HUB5: exact in persistence, not projected) | per Review question: `review_source.{question_result_id, stage_kind, stage_order, outcome}` (+ allocation ordinal) |

Parser change: `StageAnalytics` now reads four fields that HUB2.3 already sends:
- `settled_questions`
- `terminal`
- `depth`
- `attempted_allocations`

All are nullable, so an older payload still parses.

### What was implemented

**Daily Overview:**
- A large accuracy history chart (0–100%, 11rem).
  - The line is drawn oldest → newest, and historical points land as it reaches them.
  - This run resolves last, ringed and labelled "this run".
  - The historical average is dashed on the same axis.
- **Before the trend exists,** the same frame plots only this run and the average, with the evidence slots filled from the newest end.
- **Previous Daily:** exactly "+4 pp" / "−26 pp" / "0 pp".
- **Personal best:** a trophy crest, gilded when this run holds it.
- **Average accuracy:** carries the chart's dash as its key.
- The stage sequence is the navigator.

**Standard — the course:**
- One node per HUB2.1 round.
- Node shape and label come from the frozen review: round for Meta Reflex, double-rimmed for "Mastery".
- Module question marks show C/A, using the timeline's own art.
- An outcome badge (✓ / ✕ / clock) sits on each node, so colour is never the only signal.

**Time Trial — the lane:**
- A timer start marker, the settled questions in order, then an end marker: hourglass with "bank ran out", or a flag.
- Premium: "Settled questions" (HUB2's count).

**Survival — the path:**
- Rounds in order, each with its per-question marks, to a terminal shield (✕ "out of mistakes" / ✓).
- Premium: Depth, and Strikes used (pips against the frozen limit — a count only, not pinned to an occurrence).

**Weak Areas / Review:** exact question cards (art, subject, result chip); Review's result lands last. No source linkage is drawn.

**Every stage:**
- A tone band with glyph, name, "Stage N", the stage's own rule sentence (`stageIdentity`, frozen numbers), and C/A (+ score for Standard).
- The terminal note.

**`QuestionInspector`:** one round's trigger, using the timeline's own wiring (`QuestionReviewCard`, `QuestionReviewSheet`, same popover classes and test id). `QuestionTimeline` is unchanged.

### Removed from launch presentation (data still parsed, backend untouched)

- Question-type (family) bars and category bars: from Stage and Daily.
- Learning Signals, including recurring and recovered weakness.
- The Review recovery headline tile.
- The Weak Areas "Built from" themes line (a broad category description).
- The stage "Compared with N earlier matching stages" sentence. With no comparison shown, it implied one.

### Stage identity

| Stage | Ink | Glyph |
|---|---|---|
| Daily | brass `#533808` (existing token) | CalendarDays |
| Standard | sapphire rgb(29,79,138) | Swords |
| Time Trial | amber rgb(154,82,8) | Timer |
| Survival | rubric `#7a2820` (existing token) | Shield |
| Weak Areas | violet rgb(90,58,142) | Crosshair |
| Review | jade rgb(31,92,60) (existing correct-ring ink) | RotateCcw |

Every use pairs ink with glyph and name. The collapsed spine's nodes and stage entries take the stage's ink.

### Motion

- Canvas change: a deeper view slides in from the right, a return from the left (`history-canvas-in`, 320ms).
- Focus unrolls (`history-unfold`).
- Ring: draws.
- Chart: clip-reveal line, points landing in order, this run last.
- Figures: count in.
- Paths and lanes: nodes resolve in canonical order as the connector reaches them, with the terminal marker last.
- Review: the result chip lands after its question.
- Nothing loops.

**Reduced motion** (the OS preference or the app's `html.reduce-motion`): `useReveal` returns progress 1 and both CSS animations are removed. Tested with a never-firing IntersectionObserver: withheld normally, final at once under Reduce Motion.

### Responsive certification

Playwright/Edge against `/dev/lobby-preview` (Timmy Premium). Widths under 768 emulate touch. For each size the probe opened the newest Daily's Focus, walked all five stages and returned.

| Viewport | Page overflow | Run overhang | Canvases | Canvas height across stages | Min toggle |
|---|---|---|---|---|---|
| 320×568 | 0 | 0 | 1 | 426–541 | 44 |
| 375×667 | 0 | 0 | 1 | 330–442 | 44 |
| 390×844 | 0 | 0 | 1 | 314–424 | 44 |
| 412×915 | 0 | 0 | 1 | 297–410 | 44 |
| 667×375 | 0 | 0 | 1 | 264–340 | 44 |
| 768×1024 | 0 | 0 | 1 | 256–328 | 28 (fine) |
| 1280×720 | 0 | 0 | 1 | 256–328 | 28 (fine) |
| 1440×900 | 0 | 0 | 1 | 256–328 | 28 (fine) |
| 390×844, 200% text | 0 | 0 | 1 | 787–1522 | 44 |
| 320×568, 200% text | 52 (hero baseline, present before Focus) | 0 | 1 | 867–1667 | 44 |

**Navigator:**
- Touch: it scrolls within itself (a swipe) and never moves the page.
- Mouse: it wraps (two lines at 768).

**Fix during certification:** at 200% text the Focus header's score and ring cluster overhung the card by 74px at 320 and 13px at 390. It now wraps.

**Question hosts** (verified in the browser):
- 1280: the Popover opens from a Stage Focus node.
- 390 touch: the Sheet opens with focus on Close and body scroll locked. Escape closes it, focus returns to the node, and the Review stage is still open.

### Tests

**New:**
- `DailyHistory.test.tsx` HUB6.1 block (9):
  - one Focus at a time;
  - a stage entry opens at its stage;
  - one canvas shared by Overview and each stage;
  - a 4- vs 5-stage navigator in saved order;
  - Popover and Sheet return to the same focus;
  - no question-type or category bars in Stage Focus;
  - the Standard course follows rounds, with no module points.
- `DailyHistory.test.tsx`: reduced motion (2).
- `historyVisuals.test.tsx` (+2): dormant slots fill from the newest end; a dormant chart plots only this run and the average.

**Rewritten to the new ownership:**
- HUB4 Stage (TT lane + settled; Survival path + depth + strikes; Weak Areas exact questions, no themes).
- Capability (Free stages navigable with no stage upsell; `not_applicable` navigable with no analytics).
- Analytics (−33 pp; no recovery tile; no categories, signals or recovery).
- Lobby-preview #8/17, E/J (the failed replay is now asserted in the Review stage), L, N, P.

**Suites:**
- History/workspace/lobby-preview/lobby-analytics/`lib/history`: **437/437**.
- Broad regression: **2681 passed / 7 failed, 170 files**. All 7 are baseline:
  - `App.routing-contract` ×2;
  - `Quiz.hub` "one h1";
  - `Quiz.rankedRole` "commits NOTHING for Practice";
  - `playModeCard.styles` ×2 — they slice `index.css` to `"}\n}"`, which a CRLF (Windows autocrlf) checkout never contains; this is HUB4's documented ×2;
  - `QuestionReviewHost` Popover timeout under load.
- `tsc`: the 2 baseline errors only.
- ESLint on touched files: 0 errors. One fast-refresh warning, the pre-existing `hasExpansion` export.

### Copy flags

These are the only new visible words:
- "Daily Overview" and "Previous Daily" (owner-named).
- "Stage N".
- "this run" (existing phrase, now on the chart).
- "accuracy" as the delta's unit hint.
- "Settled questions" and "Depth" (metric-registry names for HUB2's `settled_questions` / `depth`).
- "timed out" (outcome chip).
- "Meta Reflex" / "Mastery" (the inspector's own names).

The stage rule sentences are `stageIdentity`'s existing copy.

### Remaining launch-facing visual tasks

1. **Backend gaps** (table above) for the V2 visuals:
   - historical stage series (Standard score, TT throughput, Survival depth);
   - per-occurrence strike attribution;
   - Weak Areas selection provenance;
   - Review source linkage;
   - per-module points.

   Each has a place in Stage Focus (the band and the path/lane/cards) ready for it.
2. Survival and Mastery rounds still show HUB3's generic "?" art (no slice icon).
3. Owner naming: "Splash" does not exist as a module kind. Single-question rounds are drawn plain.
4. Carried over: hero recent-record duplication, real-device checks, real-account certification.


## HUB6.2 — In-place Daily expansion + persistent stage history

**Base:** HUB6.1 `9477617d`. HUB6.2 is one new local commit; nothing amended, nothing pushed.

### Owner correction

HUB6.1 turned an opened Daily into a different screen:
- a new header;
- a top stage-navigator strip that replaced the stage rows;
- a stage "screen" (band plus ← back) that replaced the Daily's content.

The owner's model is the opposite. **The collapsed History entry itself grows.** Its header, every stage row and every question rail stay exactly where they were at every layer, and analytics are added in new room around them.

### Final continuity model (`DailyRunRow.tsx`, one structure at every layer)

```
┌ header (date · score · ring · C/A)            ← unchanged, same size, same place
├ stage rows on the spine, each with its HUB3 question rail   ← ALWAYS present
│   └ selected row: lit in its stage's ink (wash + spine-side rule, filled node,
│     bolder name), other rows dimmed but whole; quick facts appear UNDER its own
│     icons (rule sentence · TT settled · Survival depth + strike pips)
├ footer: [Run analysis ▾/▴]                 [← Daily Overview]  (only when a stage is selected)
└ analytics region (expanded only), grown out of the card:
     Daily Overview  (trend chart · Previous Daily · personal best · average)
   | the selected stage's visual (course · lane · path · exact question cards)
```

**How it behaves:**
- **Expand:** "Run analysis" expands the entry. The card's edges move outward (`-mx-1.5 sm:-mx-2.5`, deeper shadow, brass edge), and the region grows beneath the stages, grid rows 0fr → 1fr over 320ms. Charts start after that; the reveal is gated on visibility, with a 120–180ms delay.
- **Select a stage:** click its **own name in its own row**. The rows are the navigator, so no strip exists. Selecting from a collapsed entry expands it at that stage.
- **Return to the Daily:** click "Daily Overview", or click the lit stage again. Nothing collapses.
- **Only one Daily expanded:** the section owns `{runId, view}`, and opening another collapses the first.
- **Questions:** the Popover (fine) or Sheet (touch) opens from any rail icon, collapsed or expanded, from any stage's rail while another is selected, and from the analytics region's nodes and cards. Closing it leaves the view and selection untouched.
- **Capability:** with Premium the stage's own visual shows. Without it, every stage shows its exact questions and results. The one invitation (or retry) appears only in the Daily Overview, per HUB4's one-invitation rule; a stage whose state differs from its run's still says so in the region.

### Component changes

| File | Change |
|---|---|
| `DailyRunRow.tsx` | Rewritten as the single continuous structure: selectable rows, in-place emphasis, local facts, footer return, a growing region |
| `DailyFocus.tsx` | **Deleted** (HUB6.1's replacement screen and navigator) |
| `StageFocus.tsx` → `StageAnalytics.tsx` | The band and back button are gone. `StageAnalyticsView` is region content; `StageLocalFacts` is the selected row's quick facts. Compact tiles for long stages (>12 rounds, fine pointer); question cards wrap on narrow sheets |
| `HistoryAnalysis.tsx` | The stage-facts panel moved to the row. `PremiumInvitation` and `Unavailable` are exported |
| `ModuleSigil.tsx` (new) | A deliberate Mastery module sigil (stacked layers) and the Meta Reflex bolt |
| `QuestionTimeline.tsx` | One line: a `mastery_slice` round with no proven art shows the sigil instead of "?" |
| `index.css` | `history-region` (grow) and `history-facts-in`, both off under either reduced-motion switch. `history-unfold` was removed (unused) |

### Mastery and fallback art

- **Fallback order:** backend-proven entity or category art (`iconHint.icon` / category tile), then the module sigil keyed on the review's authoritative `round.kind` (Mastery → layers, Meta Reflex → bolt), then "?".
- "?" is now used only when a curated question's legacy category bridge resolves to no tile (e.g. "Objectives & Timers" bank questions). That is the HUB3 bridge's honest "no picture".
- No art is ever built from a subject name (`questionIcons.ts` forbids it).

### Realistic-stage fixture: the "Full-length Daily" preview profile

- **New account:** `FULL_DAILY_FACTS`, `demo-full-daily` / `full-*`, generated through **HUB2.3's real route** (`1ffa624c`, backend worktree untouched). It is golden scenario `full_daily`.
- **Existing scenarios:** byte-identical. Only `input_sha256` changed.

| Run | Stages | Time Trial | Standard | Survival |
|---|---|---|---|---|
| 1 (first Daily) | 4 | 22 settled, completed | **10 modules**: Splash ×4, Meta Reflex (5 cards), Splash ×3, Meta Reflex, 4-question Mastery slice | 6 rounds (single + 2–3-question slices), 2 misses, completed |
| 2 | 5 | **28 settled, bank ran out** | the same 10-module recipe | 8 rounds, mixed, **3 strikes → out of mistakes**, depth 13 |

**Fixture machinery:**
- The `reflex:` namespace (`REFLEX_NAMESPACE`), with 10 item-cost Meta Reflex cards (`item_cost_duel`, family `item_cost_comparison`).
- The builder accepts a 5-card Meta Reflex round (`META_REFLEX_CARDS`) and freezes `meta_reflex` review rounds.
- Weak Areas selects only run 1's misses, and Review replays only same-run misses. The builder enforces both.
- Tests prove:
  - the shapes above;
  - the recipe order of round kinds;
  - one side costing more on every card;
  - every frozen review, including Meta Reflex, parses through production `readMatchReview`.

**Correction to HUB6.1:** "Splash" **is** a real Standard V1 unit (`daily_challenge/recipe.py::STANDARD_V1_UNITS`). It reviews as round kind `quiz`, so a Splash is drawn as a single-question node. The unit name is frozen in the stage composition but not projected into History, so it is not printed.

### Tests

**New HUB6.2 block** (`DailyHistory.test.tsx`), numbered to the owner's list:

| # | What it proves |
|---|---|
| 1, 2 | Collapsed and expanded keep the same row elements and every rail; the region opens and no navigator exists |
| 3–5 | Every stage selection keeps every stage and its icons; exactly one row is lit, `aria-pressed`, with local facts |
| 6, 7 | One region Daily → stage → Daily; the return keeps the Daily expanded; re-clicking the lit stage returns |
| 8, 9 | The Popover opens from a collapsed rail, the selected stage's analytics and another stage's rail, and the view is kept after closing (240s budget, as for HUB3's slow jsdom popper); the Sheet does the same on touch |
| 10 | One Daily expanded |
| 11, 12 | 4 and 5 stages at every layer |
| 16 | No bars, signals or recovery anywhere |
| — | Standard nodes follow rounds |
| 15 | Reduced motion: the region mounts closed and grows open with motion; under Reduce Motion it is open at once and removed at once; the chart is final at once |

**New (`LobbyPreviewPage.history.test.tsx`, real golden):**
- **13:** a 28-question Time Trial, all 28 reachable by paging its rail, 28 lane nodes, ending on the bank, settled 28.
- **14:** a ten-module Standard, all 10 reachable, module kinds in recipe order, Meta Reflex 4/5, Mastery 3/4 with the sigil.
- **Long Survival:** 8 nodes, strikes 3 of 3, depth 13, and nothing pinned to a question.

**New (`timmyHistory.test.ts`):** full-length fixture shapes; `reflex` namespace.

**Updated to the continuity model:**
- HUB4 Stage/capability tests: stage selection by row, region content.
- Layout tests: the ruled line is the name button's parent.
- Lobby-preview E/J, L, N, P.

**Results:**
- History, workspace, lobby-preview, `lib/history` and lobby-analytics suites: all pass.
- Broad regression: **2692 passed / 7 failed, 170 files**, the same 7 baselines as HUB6.1:
  - `App.routing-contract` ×2;
  - `Quiz.hub` "one h1";
  - `Quiz.rankedRole` "commits NOTHING for Practice";
  - `playModeCard.styles` ×2 (CRLF);
  - the `QuestionReviewHost` popper timeout.
- `tsc`: the 2 baseline errors only.
- ESLint on touched files: clean.

### Responsive certification

Playwright/Edge against `/dev/lobby-preview`, reduced motion, "Full-length Daily" unless noted. The probe:
1. measures collapsed;
2. expands;
3. selects all 5 stages from their rows;
4. opens a question from the region, closes it and checks the view;
5. returns to the Daily;
6. opens the second Daily.

"Rail" is overhang of any rail element past its **own stage row**; "region" is anything past the analytics region.

| Viewport | Page | Rail | Region | Card height (collapsed → overview → stages) | Rows + rails at every step | Region nodes TT/Std/Surv/WA/Rev | Host | Min target |
|---|---|---|---|---|---|---|---|---|
| 320×568 | 0 | 0 | 0 | 770 → 1243 → 1121–1409 | ✓ | 28/10/8/3/4 | Sheet ✓ | 44 |
| 375×667 | 0 | 0 | 0 | 726 → 1199 → 1077–1252 | ✓ | 28/10/8/3/4 | Sheet ✓ | 44 |
| 390×844 | 0 | 0 | 0 | 726 → 1199 → 1054–1252 | ✓ | 28/10/8/3/4 | Sheet ✓ | 44 |
| 412×915 | 0 | 0 | 0 | 726 → 1199 → 1002–1200 | ✓ | 28/10/8/3/4 | Sheet ✓ | 44 |
| 667×375 | 0 | 0 | 0 | 726 → 1118 → 955–1072 | ✓ | 28/10/8/3/4 | Sheet ✓ | 44 |
| 768×1024 | 0 | 0 | 0 | 324 → 716 → 493–579 | ✓ | 28/10/8/3/4 | Popover ✓ | 28 |
| 1280×720 | 0 | 0 | 0 | 324 → 583 → 490–553 | ✓ | 28/10/8/3/4 | Popover ✓ | 28 |
| 1440×900 | 0 | 0 | 0 | 324 → 583 → 490–553 | ✓ | 28/10/8/3/4 | Popover ✓ | 28 |
| 390×844, 200% | 0 | 0 | 0 | 1100 → 1898 → 2007–3054 | ✓ | 28/10/8/3/4 | Sheet ✓ | 44 |
| 320×568, 200% | 58* | 17** | 0 | 1119 → 1933 → 2038–4757 | ✓ | 28/10/8/3/4 | Sheet ✓ | 44 |
| Timmy 320 / 390 / 1280 | 0 | 0 | 0 | — | ✓ | 6/4/4/3/3 | ✓ | 44/44/28 |

Every step also passed these checks:
- after closing a question the view stays on the stage;
- the return lands on the Daily Overview;
- opening Daily 2 collapses Daily 1.

\* Present **before** any History interaction: the global HUD header at 200% text (`global-hud-right`), not HUB6.

\*\* HUB3's minimum-one rail (one 88px icon plus two 88px arrows) at the extreme size; it stays inside the card's own padding (HUB4 recorded the same rule).

**Fix during certification:** at 320/200% the Weak Areas/Review question cards' result chips overhung by 37–46px. The cards now wrap, and the chip drops to its own line.

### Screenshots (before → after)

**HUB6.1 before:**
- Timmy at 1440: `b61-collapsed`, `b61-expanded` (the new header and top strip replaced the rows), `b61-standard` (the stage band replaced the Daily).
- Full-length Time Trial: `b61-full-tt`.
- Mobile at 390: `b61-m-*`.

**HUB6.2 after:**
- **1440:** `a62-collapsed`, `a62-expanded` (the same rows in the same places, with the region below), `a62-standard` (the Standard row lit with its rule line, region = course).
- **Full-length:** `a62-full-standard` (10 modules, 2 Meta Reflex, Mastery sigil), `a62-full-tt` (a 28-node lane in two compact lines), `a62-full-surv`.
- **390:** `a62m-collapsed`, `a62m-expanded`, `a62m-survival` (lit row with depth and strike pips, path below).
- **768:** `a62t-standard`.

### Backend gaps (unchanged, not HUB6's to solve)

1. **Historical per-stage series:** earlier compatible Standard scores, Time Trial `settled_questions`, Survival depth and strikes.
2. **Per-occurrence strike attribution:** `questions[].strike_index` / `is_strike`.
3. **Weak Areas selection provenance:** source question result, run, date and outcome, plus policy version.
4. **Review source linkage:** source `question_result_id`, stage kind and order, outcome, and allocation ordinal.
5. **Per-module points:** `rounds[].score`.
6. **(new)** **The Standard unit name** (Splash / Meta Reflex / slice) is frozen in the stage composition but not projected. Module *kind* covers the shape today.

### Remaining launch-facing visual items

- Curated bank questions whose legacy category resolves to no tile still show "?". This is the HUB3 legacy bridge (e.g. "Objectives & Timers"), not History.
- At 320/200% a 28-question lane is very tall (2 nodes per line). It is usable and every node is reachable, but a denser lane for extreme zoom could be a later refinement.
- Carried over: the hero's duplicate recent record, real-device checks, real-account certification.

## HUB6.3D — Analytics Lab + persistent History timeline (frontend foundation)

**Base:** HUB6.2 `39231649`. HUB6.3D is one new local commit; nothing is amended and nothing is pushed. The backend is not modified. The full detail is in **`HUB6_3D_FRONTEND_FOUNDATION_HANDOFF.md`**.

**Backend reference:**
- HUB6.3B `d4a43826` (personal analytics).
- HUB6.3C (population) has no DTO yet, so population is a clearly separate, temporary fixture.

**Frozen shell:** HUB6.2's in-place model is untouched: the same Daily grows, every stage row and rail stays, a stage is selected by its own row, one analytics region sits below, and one Daily is expanded at a time.

### What changed

| Part | Result |
|---|---|
| A · Parser | `lib/history/personal.ts`: every HUB6.3B additive field, read leniently. HUB2.3 payloads still parse with honest fallbacks; a malformed block is dropped, never fatal |
| B · Analytics Lab | A 14-Daily preview profile, generated by HUB6.3B's real route into its own golden (`analyticsLab.golden.json`, `hub6_3b_commit` + `input_sha256`), then read by the production parser. The HUB2.3 goldens are byte-identical |
| C · Population | `analyticsLabPopulation.ts`: deterministic, pre-aggregated tables (midrank percentiles) covering every requested state, behind `AnalyticsLabPopulationSource`. Isolated from the History contract and components |
| D · Timeline | `HistoryQuestionTimeline`, opted into with `QuestionTimeline`'s `history` prop (Ranked is unchanged): as many icons as fit, paging only when needed, larger icons, and ✓ / × / dashed-clock timeout badges. Outcomes come from the DTO. Module "3/5" badges carry segment strips |
| E · Selected row | Larger icons plus Free quick facts per kind (score, Correct x / y, accuracy, longest streak, depth, strikes used, how a Time Trial ended). "Settled questions" is gone |
| F · Hover data | `historyViewModel.ts`: per-occurrence public category, outcome, stage-category C / played, exact-question prior history, and a population slot |
| G · Cross-highlight | `historyHighlight.tsx`: one local provider per Daily; outcome, category × outcome, and exact-occurrence builders. The timeline lights members and dims the rest. Proven by tests |
| H · Wording | `historyComparisons.ts`: "89% vs 79%", "10 points higher", "1 fewer question played", "25 / 28 correct", and record states. `signedPoints` no longer prints "pp" |

**Tier:** the current attempt's longest streak (and depth, strikes used, C / played, accuracy) is Free. Its Free derivation equals the server's on all 69 lab stages.

**Certification:** 320–1440 plus 200% text at 320 and 390:
- Page and rail overflow are 0 everywhere. The one exception is 320 @ 200% text, where the 58px comes from the global HUD header, which is not History.
- Every position is reachable on every long row.
- Touch targets are ≥ 44px.
- 1280 and 1440 show 18 of the Time Trial's 28 icons and all 10 Standard modules.

**Tests:**
- New: parser, lab provenance and scenarios, population, timeline / view model / highlight, wording, and lab-through-the-real-page suites.
- Updated: the "pp" and "settled" assertions, the History touch-size assertion, and the preview isolation regex.
- Full-repo regression (767 files): 61 failures, the identical 61 test names failing at HUB6.2 `39231649` (admin, security-migration, CRLF-style and routing suites). `pt2cProfileFrameAuthority` runs out of memory at baseline too. No History test fails.

**Not built:** donuts, histograms, gauges, strongest-mode profile, medals, full stage dashboards, the Review connector, and any weakness or learning-state label.

## HUB6.3E — Premium History Analytics Visual Experience

**Base:** HUB6.3D `0e53b6e2`, on branch `hub6/premium-analytics-v2` (worktree `.worktrees/hub6-premium-v2`). There are seven local commits, nothing amended, nothing pushed. The full detail is in **`HUB6_3E_PREMIUM_ANALYTICS_HANDOFF.md`**.

**Backend consumed:** HUB6.3C `00c794cd` (`claude/hub6-3-population`), read only.

**Note:** a parallel HUB6.3E attempt from another session is on `hub6/premium-analytics` (`18876c75`). This branch was built independently, from a fresh brief, on a clean branch.

**Frozen shell unchanged:**
- The same Daily grows; every stage row and rail stays.
- A stage is selected by its own row; one region below changes.
- The Popover / Sheet opens from any icon.
- One Daily is expanded at a time.

### What changed

| Part | Result |
|---|---|
| Population contract | `lib/history/population.ts` parses HUB6.3C run and stage population (cohorts, percentile, median, quantiles, merged histogram, subject bin, strongest mode). Lenient; a non-available cohort never carries a figure. Also the Free HUB6.3C fields: stage streak (+ span), Survival depth / strikes, per-question strike markers |
| Analytics Lab | The temporary fixture is replaced by population recipes, seeded through HUB6.3C's own migration, `load_observations` and `_write_date` / `summarize`, then read from the real route. Every requested state is present, including ties, the outlier, each strongest mode, margin < 10, one mode insufficient and not built |
| Daily Overview | This Daily vs the previous Daily (factual, with a composition note), Core records (most correct, longest streak), Core history (accuracy / correct / streak), a result × stage donut, a mode profile, the backend's strongest mode, and the Core population distribution. **The raw Daily-score personal best and the Up / Down / Stable label are removed** |
| Time Trial | Compare (23/29 → 25/28 wording), result × category nested donut, stopwatch throughput, records, streak chain, history, population |
| Standard | Compare, the real ten-module course (5-child Journey, never "Slice"), records, history, category donut, streak, population |
| Survival | Compare, the depth shaft with the exact strike floors from `strike_index`, a three-plate shield, a strike list, records, history, population |
| Review | Exact source miss → replay → result, "Light both" across two rails, a result × source-stage donut (≥ 2 links) |
| Weak Areas | Result × category donut, the slots, the evidence cutoff, and what the record does not keep |
| Question analytics | Under the review card, in the Popover and the Sheet: category and this stage's C / played, the strike (Free), exact prior attempts, earlier-stage category totals, and the Review link (Premium) |
| Cross-highlight | Hover / focus preview, click / tap lock, Escape / Clear; stage, multi-stage and run scopes; a lock pages the rail; pager flags; the pulse plays once; a "Lighting N questions" bar |
| One system | HUB6.2's lane / course / path visuals are removed. Free and older payloads list exact question cards |

**Certification:** 320–1440 plus 200% text at 320 and 390, across all six views, with tooltips, Popover and Sheet:
- Page overflow, region overflow and elements past the region's edge are 0 everywhere, after the certification fixes.
- Touch targets are ≥ 44px; fine-pointer targets 24–30px.
- The known HUD header at 320 @ 200% is not History.

**Tests:**
- New: parser (10), derivations (24), and the Premium room through the real page (39).
- Rewritten: the population wire (17).
- The History scope is 580 / 580 passing.
- Full repo vs `0e53b6e2`: 64 vs 64 failures, identical except one load flake in each direction; both pass in isolation on both snapshots. **No new failures.**

**Performance:** only the expanded Daily mounts a room (190–675 nodes). A hover preview re-renders only the rails (the highlight context is split).


## HUB6.3G — Final Premium Analytics Polish

**Base:** v2 `hub6/premium-analytics-v2` @ `26d9b4e0` (the HUB6.3F winner), on branch `hub6/premium-analytics-final` (worktree `.worktrees/hub6-final`). Five local commits (`c38b752c`, `0d4e336c`, `4d946eee`, `312fb881`, docs); nothing amended, nothing pushed. v1 (`18876c75`) was reference only. Full detail: **`HUB6_3G_FINAL_POLISH_HANDOFF.md`**.

**Backend consumed:** HUB6.3C `00c794cd`, read only.

**Locked decisions applied:**
- Population defaults to the last 28 days, with Same day optional.
- No Review donut; the exact original → replay → result connector is kept.
- The Standard course is kept, with real art.

| Part | Result |
|---|---|
| Correctness | Legacy `slice` → "Journey" everywhere (raw value kept) · no invented strike limit (shield only with `max_strikes`) · `strikes_used` null stays unknown · `prior_exposures` null stays null ("First time" only on 0) · Weak Areas cutoff formatted as a UTC date (Sep 14, not Sep 13) |
| Survival | v1-style tower in v2's room: taller floors (12px fine / 9px touch), floor numbers, STRIKE 1/2/3 tags and Previous / Average / Deepest rules in a lane that never overlaps; exact markers, strike list and rail paging kept |
| League art | From each stage's frozen review, by round number (proven art → module sigil → generic): the Standard course (now grouped Splash ×4 · Meta Reflex · Splash ×3 · Meta Reflex · Journey), both Review steps, and the Weak Areas served questions |
| Mobile | Narrow compare board (Today \| Previous, changes under each figure); mode dials in one row; records as an intentional row; compact donut legends. Region height at 390 vs v2: Overview −23%, Time Trial −18%, Standard −18%, Survival −10%, Review −44%, Weak Areas −57% |
| Cohort | One selector above the region, persisted across Overview and stages; no panel toggles |
| Labels | No text inside line plots (readout above); histogram median in a key and collision-free axis labels. 0 collisions in every certified shot (v2 had 2) |
| Question context | A sticky History summary at the Popover's bottom edge, visible on open; the touch Sheet is unchanged |
| Hover | A temporary "Lighting N … questions ↑" note while previewing; no auto-scroll; a lock still shows the bar and pages the rail |
| Weak Areas | The donut is removed; one panel of served questions (art, category, result), the cutoff, and no invented provenance |

**Standard course (owner follow-up):** it now adds the recipe structure and module types. However, it still repeats the rail's per-position art and results. Consider reducing it to a one-line recipe strip. Not a blocker.

**Tests:** new `LobbyPreviewPage.hub63g.test.tsx` (31 tests, all 30 requirements).
- History scope + Ranked timeline: 620 tests, 604 pass. The 16 failures are the same 16 load-timeout names that fail at v2; those files pass in isolation.
- tsc: only the 2 known errors. ESLint: 0 errors.

**Certification:** 320–1440 plus 200% text at 320 and 390, including the Popover, Sheet, hover note, tooltips, special states and Free.
- Page overflow, region overflow and elements past the region's edge are all 0.
- Touch targets are ≥ 44px.

**Performance (dev):** hover preview ≈ 35–45 ms and lock ≈ 40–55 ms, unchanged from v2.
