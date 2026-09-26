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
