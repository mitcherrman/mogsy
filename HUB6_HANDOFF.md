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

1. **Product decision needed:** the Premium run analysis still shows HUB4's "Learning signals" text, including **Recurring weakness** and **Recovered**. HUB6 did not touch them, by instruction. They are not approved launch concepts, so product should decide whether to hide them for launch. Hiding them is a small change in `LearningSignals`.
2. **Mastery-slice rounds** still use HUB3's generic "?" icon (Survival). Question artwork was preserved by instruction; a proper slice icon is a HUB3-owner task.
3. Copy flags: no new sentences were written. The only new visible words are the existing metric labels reused on dormant figures. The Premium invitation text is unchanged.
4. **Hero duplication** (recent role record shown twice): owned by the hero, not HUB6.
5. Real-device checks (safe areas, Android back) and real-account certification: carried over from HUB5.
6. `/dev/play-scroll` gating and the `useFittingPageSize` live text-size refit (HUB3): carried over.

## Next task

Product review of the before/after on `/dev/lobby-preview`. Then a decision on item 1, and real-account staged-Daily certification once a persisted environment exists.
