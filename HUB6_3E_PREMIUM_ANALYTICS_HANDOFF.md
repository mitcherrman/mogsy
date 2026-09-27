# HUB6.3E — Premium History Analytics Visual Experience: handoff

The Premium analytics experience for Mogzy History. The expanded Daily's analytics region becomes a League-knowledge analytics room, fed by real HUB6.3C population data. The frozen HUB6.2 / HUB6.3D History shell is unchanged.

## Branch, base, backend

| | |
|---|---|
| Branch | `hub6/premium-analytics-v2`, worktree `mogsy/.worktrees/hub6-premium-v2`. `node_modules` is a junction to the main checkout's |
| Base | HUB6.3D `0e53b6e2` (`hub6/ranked-hub-visuals`), not amended |
| Backend consumed | `claude/hub6-3-population` `00c794cd` (HUB6.3B `d4a43826` → HUB6.3C `769ebdfc` → Free strike markers `00c794cd`). Read only; its worktree stayed clean |
| Pushed | **No** |

> **Note: a parallel attempt exists.** `hub6/premium-analytics` (`18876c75`, worktree `.worktrees/hub6-premium`) is an earlier HUB6.3E attempt from a different session. This workstream was briefed as a fresh instance on a clean branch from `0e53b6e2`, so it was built independently and that branch was not touched. The two can be compared side by side.

**Commits** (oldest first):

| Commit | Scope |
|---|---|
| `04b0aa96` | Population contract, HUB6.3C Free fields, real-backend lab population, preview/lock cross-highlight, timeline additions, shared chart primitives, pure derivations |
| `adf7b345` | Premium Daily Overview. Removes the raw-score PB, the trend label and HUB6.2's lane/course/path |
| `5925c973` | Time Trial room, and shared stage sections |
| `c723a952` | Standard and Survival rooms |
| `3848b7e7` | Review and Weak Areas rooms; the Premium page test suite |
| `c7a3d012` | Certification fixes (200% text, fine-pointer targets) |
| `e8f70846` | Performance: the highlight context split so a hover re-renders only the rails |
| _docs commit_ | This handoff and the HUB6_HANDOFF section |

Each commit typechecks on its own (a temporary worktree per commit). The one exception is a test-helper type in `analyticsLabPopulation.test.ts` in the first two commits, fixed in `5925c973`; Vitest does not typecheck, so those tests ran green throughout.

## Frozen shell — unchanged

- The same Daily expands in place.
- Every stage row and every question rail stays visible at every layer.
- Selecting a stage lights its own row, which gains larger icons and its Free quick facts.
- The analytics region below changes; "Daily Overview" returns to the overview.
- The question Popover (fine pointer) and Sheet (touch) open from any icon.
- One Daily is expanded at a time.
- There is no separate Daily screen, stage screen, duplicate navigator or replacement card.

## A. HUB6.3C population contract

**New file:** `src/lib/history/population.ts`, wired through `contracts.ts`.

| Wire | Frontend |
|---|---|
| `item.population {status, reason_code, policy_version, metric_policy_version, core, strongest_mode[]}` | `DailyHistoryRecord.population: RunPopulation \| null` |
| `stage.population` (Standard / Time Trial / Survival) | `HistoryStage.population: PopulationSubjectBlock \| null` |
| cohort `{cohort {type, as_of, window_days, users, observations, generated_at}, status, reason_code, sufficiency, metrics}` | `PopulationCohort` |
| metric `{value, percentile, median, quantiles {p10..p90}, histogram {scale, bins[], subject_bin}}` | `PopulationMetric` |
| `strongest_mode[i] {cohort_type, stage_kind, percentile, margin, candidates[], reason_code}` | `StrongestMode` (read, never recomputed) |

**Free HUB6.3C facts (also parsed):**
- Stage basic: `longest_streak`, `longest_streak_span`.
- Survival basic: `depth`, `strikes_used`, `max_strikes`.
- Per question: `is_strike`, `strike_index`.

The view model reads these first, then HUB6.3B's Premium `current`, then counts by the server's rule (older payloads).

**Rules:**
- Population is optional and lenient. HUB2.3 and HUB6.3B payloads parse to `null`, and personal analytics render without it.
- A cohort that is not `available` never carries a percentile, median, quantiles or histogram, even if one is sent. There is never a zero for "not enough players".
- An out-of-range percentile is dropped. A winner's percentile only travels with a winner.
- States handled:
  - `available`
  - `insufficient` (`insufficient_population`, with its count)
  - `unavailable` (`aggregate_not_built`, `population_not_configured`, `population_projection_failed`)
  - `not_applicable`
- Schema stays v1.

## B. Analytics Lab — real population through the real route

`analyticsLabPopulation.ts` is now a set of **recipes**, part of the hashed lab input. Each recipe gives, per Daily and cohort type, a cohort size and target midrank percentiles.

`scripts/hub63-generate-analytics-lab.py` (extended):
1. Seeds the lab rows into a temp-file SQLite database.
2. Runs HUB6.3C's own `migrate_history_population`.
3. Reads the player's real analytics keys and values with HUB6.3C's `population.load_observations`.
4. Builds a deterministic value list around the player's value (quantile-spaced normal, its centre bisected toward the target; a tie spike or an outlier where asked).
5. Stores it through HUB6.3C's own `population._write_date` → `summarize`.
6. Drives the real `GET /api/history/v1`.

No user rows or records are created: a cohort is only the list of values `summarize` receives. The golden records `backend_commit: 00c794cd…`. The HUB2.3 goldens (Timmy, First, Full, Newcomer) are untouched.

| Daily | Population state (the backend's own numbers) |
|---|---|
| L1 Sep 1 | Insufficient: 40 players, no percentile anywhere, `mode_population_insufficient` |
| L2 | Exactly 100 players (available) |
| L3 | Rolling 28 days available; same day insufficient (88) |
| L4 | Time Trial strongest, moderate lead (0.80, +25) |
| L5 / L6 / L8 / L12 | Core correct ≈ 20th / 50th / 85th / 97th percentile |
| L7 | `aggregate_not_built` |
| L8 / L11 / L12 | Time Trial / Survival / Standard strongest |
| L9 | Survival 60 players → no strongest (`mode_population_insufficient`) |
| L10 | 22% tied at the Survival ceiling: midrank 0.89, and Survival strongest by it |
| L13 | No strongest: lead of 3 points (`margin_below_threshold`) |
| L14 | Extreme outlier: Time Trial correct in the open overflow bin at 0.9997. Same-day cohort available (173) |

**Regenerate:**
```
npx tsx scripts/hub63-export-analytics-lab-rows.ts <scratch>/lab-rows.json
python scripts/hub63-generate-analytics-lab.py <League_Combat_Simulator/.worktrees/hub6-3-population> <scratch>/lab-rows.json src/pages/dev/lobby-preview/history/analyticsLab.golden.json
```

## C. Visual architecture

```
DailyRunRow (frozen shell; one HistoryHighlightProvider per Daily)
├ stage rows ─ HistoryQuestionTimeline (lit/dimmed, pulse once, lock pages, pager flags,
│                                       Free strike tabs, question-context footer)
├ footer ─ Run analysis · Daily Overview · HighlightBar ("Lighting N questions · Clear")
└ region ─ CohortProvider (one cohort choice per expanded Daily)
   ├ overview → HistoryAnalysis ─ Premium (HUB6.3B+) → analytics/DailyOverview
   │                             ─ HUB2.3 payload    → accuracy history (no PB, no trend label)
   │                             ─ Free              → FreeDailyFacts + the one invitation
   └ stage    → StageAnalytics.StageAnalyticsView
                 ├ time_trial → analytics/TimeTrialRoom
                 ├ standard   → analytics/StandardRoom
                 ├ survival   → analytics/SurvivalRoom
                 ├ review     → analytics/ReviewRoom.ReviewRoom
                 ├ weak_areas → analytics/ReviewRoom.WeakAreasRoom
                 └ Free / older payload → exact question cards (unchanged)
```

**Shared modules (`src/components/quiz/workspace/analytics/`):**

| File | Contents |
|---|---|
| `charts.tsx` | Panel (a size container), Segmented, Counted, DeltaChip, ChartTip, the scrubber, LineHistory, NestedDonut, Distribution, PercentileDial, outcome textures |
| `trophies.tsx` | RecordMedal (round / shield / star / hex), StreakChain, CompareBoard |
| `population.tsx` | CohortProvider, PopulationPanel, ModeProfile, StrongestBanner |
| `stageShared.tsx` | StageCompare, CategoryDonut, StreakPanel, RecordsPanel |
| `roomParts.tsx` | HighlightBar, HistoryPanel |
| `derive.ts` | Pure view models |
| `copy.ts` | Wording |
| `ink.ts` | Inks |
| `interact.ts` | Donut → highlight wiring |
| `QuestionContext.tsx` | The question-context strip |

**Removed (one analytics system):**
- HUB6.2's `RoundPath`, `RoundNode`, `Marker`, `QuestionMarks`, `StageVisual` (lane / course / path).
- The raw Daily-score `PersonalBestCrest`.
- The Up / Down / Stable trend label.

The HUB2.3 accuracy chart remains only for payloads without HUB6.3B data.

## D. Daily Overview

| Section | Content |
|---|---|
| This Daily vs Previous Daily | Today / Previous / Change. Example (L14): "72 / 82 vs 84 / 91", "−12 correct", "9 fewer questions played", "88% vs 92% · 4 points lower", "Streak −7". Core longest streak with its stage ("15 Standard"; ties list every stage). The previous Core streak shows only when Core's previous run IS that Daily. A note appears when stage composition differs ("this Daily had 5 stages, the previous one 4") |
| Core Daily records | Most correct (round medal), longest streak (shield). First attempt / new / tied / below, prior best and date. A line explains why the raw Daily score is not a record. The raw score stays only in the header |
| Core Daily history | Standard + Time Trial + Survival. One line chart; toggle Accuracy / Correct / Longest streak, one axis at a time (accuracy 0–100%, counts from 0). Dashed personal average; dotted record rule (not for accuracy — no best-accuracy PB). Current run ringed and labelled. Keyboard, hover or tap reads date, C / played, accuracy, streak |
| The Daily's questions | Nested donut, result × **stage** (see below); lights every rail |
| Mode profile | Three stage-inked dials: Standard score, Time Trial correct, Survival depth percentiles. The strongest is crowned. Cohort toggle |
| Strongest mode | Backend `strongest_mode` for the chosen cohort: "TIME TRIAL · Strongest relative mode · 99th · correct answers · leads by 20 points". No winner, with the reason, on `margin_below_threshold` ("top two are 3 points apart") or insufficient population |
| Core across Mogzy players | One distribution with tabs (Correct / Accuracy / Longest streak): You, percentile, median, players, cohort line, "You" marker, median rule, secondary dials, a table view |

**Donut A/B (checkpoint 1): Option B, result × stage, kept.** Option A (result × public category) was built and captured on L14 (`cp1-d-1440-l14-cat`). At Daily level its outer ring broke into about 11 thin slices with a 12-row legend, and it repeated what the stage rooms' category donuts show better. Option B maps one-to-one onto the five stage rows directly above and lights whole rails coherently. Only B ships.

## E. Stage rooms

**Time Trial**
- **Compare:** 23/29 → 25/28 reads "+2 correct · 89% vs 79% · 10 points higher · 1 fewer question played · Streak +3", plus how it ended.
- **Nested donut:** result × public category, exact per-outcome membership. The slice detail reads, for example, "Objectives: 2 / 2 correct · 100% this Time Trial · Your earlier Time Trial stages: 15 / 19 correct · 79%".
- **Stopwatch:**
  - One tick per question, in order, by result: long solid (correct), short heavy (incorrect), dotted (timeout).
  - The hand sweeps to the count.
  - Bezel markers: previous ▲, personal average (dashed), most-played record ◆.
  - A throughput list: This / Previous / Your average / Most played.
- **Records:** most correct (round), most questions played (hex), longest streak (shield).
- **Streak chain:** "Light the streak", plus the population percentile.
- **History:** Correct / Played / Accuracy / Streak.
- **Population:** correct first, plus three dials.

**Standard**
- **Compare:** score, correct, accuracy, streak.
- **The course:**
  - The ten production modules from `stage.modules` (the frozen recipe's unit per round): Splash ×4, Meta Reflex, Splash ×3, Meta Reflex, Journey.
  - Splash is a square tile with its category dot; Meta Reflex a round bolt node with card pips; Journey a double-ringed gate with child pips (5, or 4 when its clock ran out). Never "Slice".
  - Each node shows its result mark and C / played.
  - Nodes resolve in order; the road stretches to the panel.
  - Hover or focus lights the module on the Standard rail and names it; a click locks.
- **Records:** highest score (star), most correct, longest streak.
- **History:** Score / Accuracy / Streak.
- Category donut, streak, and score-first population.

**Survival**
- **Compare:** depth ("5 questions deeper"), correct, accuracy, strikes ("1 more strike used", neutral), streak, and how it ended.
- **The descent:**
  - One floor per question down to the run's depth (the focal number). Journey slots are bracketed.
  - The **exact** strike floors are badged 1/2/3 from HUB6.3C's `strike_index`: for L11, depth 24/30/33, which is rail 22/28/31. Nothing is inferred.
  - Previous, average and deepest are ruled on the shaft.
  - A three-plate shield cracks per strike.
  - A strike list lights each strike's question; the rail pages to it.
- **Records:** deepest (hex), most correct, longest streak.
- **History:** Depth / Accuracy / Streak.
- **Population:** depth first.

## F. Review and Weak Areas

**Review**
- Each served replay is drawn as: Original (stage · Question N of M · result) ─▶ Review replay N (its category) ─▶ result.
- The link comes from the backend's exact `review_sources`.
- "Light both" lights the replay and its source miss, each on its own rail; other rails are untouched.
- A replay without a stored link says "Source not recorded for this replay". Nothing is matched by content or order.
- With ≥ 2 linked replays, a result × source-stage donut (cautiously approved): its slices light the replays and their misses.
- No "recovered", mastery or recovery-rate wording.

**Weak Areas**
- A result × category donut of the current questions.
- The slots: slot → public category → "Question N on the row" (plus "asked as …" when the served question's category differs) → result.
- The evidence cutoff line: "Chosen from your results before Sep 13. The record keeps which categories were chosen — not which earlier question led to each one."
- No source question, miss count or last-missed date (they do not exist).

## G. Question-level analytics

**Where:** `QuestionContext` renders under the unchanged `QuestionReviewCard` in both the Popover and the touch Sheet, via a `footer` slot. Ranked passes nothing. Hover is never the only path.

**Content, per question** (each Journey child listed):

| Tier | Lines |
|---|---|
| Free | Public category and result; "Itemization in this Survival: 7 / 7 correct"; "Strike 2 of 3" |
| Premium | "Seen 14 times before · 14 correct · last Sep 10: correct" (or "First time this question appeared in your Dailies"); "Earlier Survival stages, Itemization: 33 / 38 correct · 87%"; "Replays your Time Trial question 7 (incorrect)"; "Replayed in Review: correct" |

## H. Cross-highlighting

**Model** (`historyHighlight.tsx`):
- Hover or focus **previews**; click or tap **locks**; a second click unlocks.
- **Escape** clears. There is one document listener, only while something is locked.
- "Clear" in the lock bar also clears.
- Scope is one stage, several stages, or the whole run.

**Timeline response:**
- Lit icons get a brass ring and pulse once; the rest step back to 32%.
- A **lock** pages the rail to its first lit icon; a preview never moves the rail.
- A lit icon on another page puts a brass dot on that pager arrow.

**Wired:**
- Daily donut ↔ every rail (group → its stage).
- Time Trial / Standard / Weak Areas donuts ↔ their rail.
- Review links and the Review donut ↔ the Review rail and the source rails.
- Course module ↔ Standard rail.
- Strike floor and list ↔ Survival rail.
- Streak chain ↔ its exact span.
- Weak Areas slot ↔ its question.

## I. Animation

All one-shot, on `useReveal` (one IntersectionObserver per panel):
- The history line draws oldest → newest.
- Donut: the inner ring, then the outer.
- Histogram: bins rise, then the "You" marker drops in.
- Medals count prior → current; new and tied records settle, and a new record's shine passes once.
- Streak: the count rises, links fill, the flame settles.
- Standard: course nodes resolve in order.
- Survival: the shaft grows to depth, then strike badges appear in sequence and shield plates crack.
- Review: connectors draw.
- Lit icons pulse once.

**Reduced Motion** (OS or app): the final state at once. `useReveal` returns 1; the CSS animations are off and the pulse and shine are hidden.

## J. Accessibility

- **Keyboard:** every interactive mark is a real button — legend rows, legend slices, outcome chips, course modules, strike items, Review "Light both", slot rows, the streak control, toggles. Line charts and histograms are one tab stop each: ← → Home End step through points or bins, Escape clears, and a live tooltip reads the item. Focus rings throughout.
- **Tooltips:** they show on focus and tap, and are clamped inside their chart (never past the region or the viewport).
- **Text:**
  - Population: an sr-only sentence, "You: 67 · 88th percentile · median 55 · 1,455 players".
  - Distributions: a "table" disclosure.
  - Dials, the stopwatch and the shaft: `role="img"` summaries.
  - Donut slices: "Itemization, correct: 4" and "Itemization: 11 of 15 correct".
- **Never colour alone:** outcomes carry textures (hatch for incorrect, dots for timeout) and ✓ / × / clock glyphs; strikes carry numbers; deltas carry ▲ / ▼ / =.
- **Category inks:** validated with the dataviz validator against the parchment. Lightness, chroma and normal-vision separation pass. The worst adjacent colour-blind pair (Runes ↔ Champion Stats, deutan ΔE 6.4) and three hues under 3:1 contrast are relieved by slice gaps, named legend rows with counts, and tooltips.
- **Touch:** targets are ≥ 44px on a coarse pointer.

## K. Free / Premium

| Tier | What it sees |
|---|---|
| Free | Every row, rail, question and result; the question review; the selected row's current facts (score, C / played, accuracy, longest streak, depth, strikes used, how it ended); **exact Survival strike tabs on the rail**; the question context's Free lines; the Overview's current Daily facts (C / played, accuracy, Core longest streak and its stage) above the one invitation. Stage regions keep their exact question cards |
| Premium | Everything in D–H: comparisons, deltas, records, averages, series, historical category totals, exact-question prior history, population, percentiles, strongest mode, the rooms |
| Missing Premium data | A section is omitted or says why. Free facts are never removed |

## L. Responsive certification

**Method:** `scripts/hub63e-probe.mjs` drives the real page (`/dev/lobby-preview`, Analytics Lab, Premium) in Playwright (msedge).
- Reduced motion. Touch plus coarse pointer below 768; fine pointer at 768 and up.
- Per shot: expand the Daily or select the stage, act, then measure:
  - page overflow;
  - region width and overflow;
  - any visible element past the region's edge;
  - list and chart overflow;
  - tooltip, Popover and Sheet bounds against the viewport;
  - the smallest interactive target in the region, and every target under 44px.

**Views:**

| View | Run and action |
|---|---|
| Overview | L14 |
| Time Trial | L14, a donut slice locked |
| Standard | L12 |
| Survival | L11 |
| Review | L14, a link locked |
| Weak Areas | L14 |

**Also:** the question Popover (1440), the question Sheet (390; 320 @ 200%), distribution and line tooltips (320, 1440), a donut hover (1280), and Free (320). That is 68 shots, then a re-check of 25 after the fixes.

| Viewport | Pointer | Page overflow | Region overflow | Past region edge | Min target in region | Notes |
|---|---|---|---|---|---|---|
| 320×568 | touch | 0 | 0 | 0 | 44 | all six views |
| 375×667 | touch | 0 | 0 | 0 | 44 | |
| 390×844 | touch | 0 | 0 | 0 | 44 | Sheet inside the viewport (0–390) |
| 412×915 | touch | 0 | 0 | 0 | 44 | |
| 667×375 | touch | 0 | 0 | 0 | 44 | |
| 768×1024 | fine | 0 | 0 | 0 | 24 | fine-pointer controls 24–30px (legend slices, toggles), as in HUB6.3D's rails |
| 1280×720 | fine | 0 | 0 | 0 | 24 | donut hover lights 18 icons across rails |
| 1440×900 | fine | 0 | 0 | 0 | 24 | Popover 421–885 × 412–796, inside |
| 320 @ 200% text | touch | 0* | 0 | 0 | 44 | after the certification fixes |
| 390 @ 200% text | touch | 0 | 0 | 0 | 44 | after the certification fixes |

\* The global HUD header at 200% text widens the layout viewport in mobile emulation to 375px, so full-width fixed layers (including the question Sheet) follow it. This is HUB6.3D's known pre-existing HUD issue, present with every Daily collapsed. It is not History.

**Tooltips:** distribution and line tooltips measured inside the viewport at 320 and 1440; they are clamped inside their chart.

**Residual:** 1–6px internal `scrollWidth` on two lists at 320 @ 200% (the strike list, the Review link list), from corner result badges. No visible element is past the region's edge.

**Fixes made by certification** (`c7a3d012`):
- Record medal art is px-sized (it doubled with 200% text).
- Records rows use `min(…, 100%)` auto-fit columns.
- Streak rows stack below 24rem.
- Donut legend rows stack their per-result buttons below 22rem (at 390 @ 200% the name had been squeezed to 11px).
- The table disclosure is ≥ 24px fine and ≥ 44px touch.

**Timeline reachability:** unchanged from HUB6.3D. A lock pages the rail to its first lit icon; a lit icon on another page flags that arrow.

## M. Screenshots

In the session scratchpad (not committed), `…/scratchpad/{cp1,cp2,cp3,cp4,cert,cert2}`:

| Checkpoint | Files |
|---|---|
| 1 · Daily Overview | `cp1-d-1440-l14` (mature), `cp1-d-1440-l14-cat` (donut option A, rejected), `cp1-d-390-l14` (mobile), `cp1-d-1280-l1-insufficient`, `cp1-d-1280-l7-notbuilt`, `cp1-d-1280-l13-nostrongest`, `cp1-d-1280-l12-std` (Standard strongest), `cp1-d-1280-l9-oneinsuff`, `cp1-d-1440-lock` |
| 2 · Time Trial | `cp2-tt-1440-l4` (23/29 → 25/28, NEW RECORD), `cp2b-tt-1440-l14-lock` (Objectives × correct locked, outlier population), `cp2c-tt-390-l4` (mobile), `cp2-tt-1280-l14-dist` (distribution tooltip) |
| 3 · Standard and Survival | `cp3-std-1440-l12` (records gilded, course), `cp4-std-1440-l14` (stretched course, 4-child Journey), `cp3-std-390-l14`, `cp3-surv-1440-l11` (strikes at depth 24/30/33), `cp3-surv-390-l11`, `cp3-surv-1280-l9-insuff` |
| 4 · Review and Weak Areas | `cp4-review-1440-l14-link` ("Light both": Time Trial Q7 + replay 1), `cp4-review-390-l14`, `cp4-wa-1440-l14`, `cp4-question-1440` (Popover with "In your History"), `cp4-question-390-sheet` (touch Sheet), `cp4-free-1280-l14`, `cp4-free-1280-surv` |
| Certification | `cert-<view>-<w>x<h>[-t2]` for all 10 configurations × 6 views, `cert-question-*`, `cert-dist-*`, `cert-line-320`, `cert-donut-hover-1280`, `cert-free-320`; `cert2/c2-*` after the fixes. Measurements are in `measure.jsonl` |

## N. Tests

**New suites:**

| Suite | Tests | Covers |
|---|---|---|
| `lib/history/population.test.ts` | 10 | The HUB6.3C parser: available block, a non-available cohort never carrying a percentile, out-of-range percentile dropped, strongest mode read not recomputed, a winner's percentile only with a winner, `population_not_configured`, malformed → null; through the page parser: old payload compatibility, Free streak / depth / strikes / strike markers, a malformed block never fatal |
| `analytics/derive.test.ts` | 24 | Time Trial 23/29 → 25/28 wording; nested donut exact membership (server ids, category × outcome, every question once, outer sums to inner); timeout-heavy donut; group history with no verdict; Daily donut membership; public labels only (no raw family); Core streak (and Free = Premium); streak span ids; Core records never raw score; the ten-module course and 5- / 4-child Journey; Survival strike rail positions 22/28/31 (Free = Premium); Review exact links and "no stored link"; Weak Areas has no provenance fields; question context (Premium, Free, Review both ways, strikes); copy (ordinals, 1–99, reasons, bin labels) |
| `LobbyPreviewPage.premiumAnalytics.test.tsx` | 39 | Through the real page: every Overview section; no raw-score PB; no pp / settled / learning-signal / mastery / raw family words; previous Daily wording and composition note; Core records (new / below / first); Core history toggle and keyboard readout; Daily donut hover / lock / Escape across rails; strongest Time Trial / Survival / Standard; no winner (margin, one mode insufficient); insufficient; `aggregate_not_built`; distribution sentence, cohort toggle, metric tabs; 99th never 100th; Time Trial compare, records, stopwatch, slice lighting (stage-scoped), streak span, history tabs, population; Standard course and Journey, module lighting, records, population; Survival shaft, exact strikes, rail lock paging, Free strike tabs, compare / records / population; Review links lighting two rails; Review donut; Weak Areas slots and provenance; Free gating; question context Premium / Free / Journey; keyboard; touch 44px and tap lock; reduced motion; one room per expanded Daily and no chart remount on hover |

**Rewritten:** `analyticsLabPopulation.test.ts` (17): the real wire — policy versions, the Core and three mode blocks, Free / unavailable null, histogram sums and ≥ 5 per bin, fraction vs integer scale, every lab state (insufficient, 100, same-day, not built, ≈20/50/85/97, ties, outlier, three winners, margin, one mode insufficient), the player's value equals the record, recipes hashed, and no user data in the golden.

**Updated:**
- `analyticsLab.test.ts` (+2): provenance `backend_commit 00c794cd`; Free HUB6.3C streak / depth / strikes equal the Premium duplicates on every lab stage; Free strike markers equal Premium `analytics.strikes` on every Survival, and only Survival carries them.
- `HistoryQuestionTimeline.test.tsx`: the population slot is removed.
- `LobbyPreviewPage.analyticsLab.test.tsx`: the accuracy change chip.
- `LobbyPreviewPage.history.test.tsx` and `DailyHistory.test.tsx`:
  - The raw-score best is asserted **absent**, and the trend has no direction label.
  - HUB2.3 stages list their exact question cards instead of the removed lane / course / path.
  - The rail's module badges carry "4/5" and "3/4".
  - HUB2.3 Survival pins no strike.

**History scope** (`src/lib/history`, `src/pages/dev/lobby-preview`, `src/components/quiz/workspace`): **25 files, 580 tests, all passing** at `c7a3d012`. At `e8f70846`, 578 pass. The two others are `QuestionReviewHost` popover tests that timed out while the full-repo run shared the CPU; they pass 16/16 in isolation (HUB6.3D noted the same load sensitivity).

`tsc -p tsconfig.app.json`: only the 2 known errors. ESLint on the touched files: 0 errors (react-refresh warnings only, the existing pattern).

**Full-repo baseline comparison:**
- **Method:** Vitest, the whole repository, `--testTimeout=240000`, `pt2cProfileFrameAuthority` excluded (it runs out of memory at baseline too). Run on detached snapshot worktrees of this branch (`c7a3d012`) and of HUB6.3D `0e53b6e2`, compared by test name.

| | Test files | Tests | Failed | Suite load errors |
|---|---|---|---|---|
| Baseline `0e53b6e2` | 3380 | 12414 | 64 | 0 |
| This branch `c7a3d012` | 3403 | 12496 | 64 | 0 |

- 63 failures are identical by name. The areas are security migrations (23), quiz-screenshot (7), welcome (6), ranked-arena (5), feedback (5), guards (3), quiz components (4), routing contract (2), admin (3), profile, identity, question-surface, and two Quiz pages.
- One differs each way:
  - `QuizRankedMatch.endScreen` failed on the branch run only.
  - `TeamSimPage.phase5a` failed at baseline only.
  - Both pass in isolation on **both** snapshots, so they are load flakes.
- **New failures: none.**
- Line endings were normalized to git's CRLF checkout form before the run, so the CRLF-sensitive style tests behave as at baseline.

## O. Performance

`scripts/hub63e-perf.mjs`: the mature Analytics Lab page, 10 Dailies, one expanded, 1440, motion on. **Dev build**: the lab route is dev-only, so a production build cannot serve it. The CPU was also shared with the full-suite run, so treat the absolute times as upper bounds.

| | Collapsed page | Overview | Time Trial | Standard | Survival | Review |
|---|---|---|---|---|---|---|
| Analytics regions mounted | 0 | 1 | 1 | 1 | 1 | 1 |
| Room DOM nodes | — | 457 | 607 | 675 | 492 | 191 |
| Room SVGs | — | 16 | 15 | 25 | 13 | 17 |
| Open (click → room in DOM) | — | ~1.0 s | 0.87 s | 0.43 s | 0.18 s | 0.15 s |
| Hover preview (focus → 2nd frame, 2 frames included) | — | 55 ms | 57 ms | 26 ms | — | 27 ms |

**Observers:**
- One IntersectionObserver per section reveal, disconnected on first sight. There are none per icon or per mark.
- ResizeObservers: 50, which is HUB6.3D's one per rail, unchanged.

**Collapsed rows:** ~578 DOM nodes and 79 SVGs each; they mount no analytics.

**Memoization:**
- Derivations are memoized per stage or record.
- Charts keep their DOM on hover (tested).

**The highlight context is split in three** (`e8f70846`):
- A preview re-renders only the rails; it was ~150 ms per change before.
- Overview and Time Trial previews are higher because a Daily or Time Trial slice repaints several rails.

**Reveal:**
- Opening the Overview produces a run of 50–67 ms dev-mode frames for ~1 s while its six sections reveal (each section's reveal re-renders its own panel per frame).
- Reduced Motion removes this entirely.
- A production profile would give the real number.

## P. Remaining launch-facing issues

1. **Production data.** HUB6.3B / C are not on `origin/master`. The population refresh needs `HISTORY_POPULATION_REFRESH_TOKEN` and a scheduler entry. Until then, Premium reads `aggregate_not_built` (worded neutrally) and every personal section still renders.
2. **RG2 "general" category.**
   - What happens: Mastery / Journey children and some lab questions fall to RG2's fallback, which the server labels "Question". The page shows it as "General", its key's own word.
   - Effect: Standard's and Weak Areas' donuts carry a General slice, and the lab's Weak Areas slots are all "General".
   - Fix: classify the Mastery chain families in RG2.
3. **Fine-pointer targets** in the room are 24–30px (legend slices, toggles, links), consistent with HUB6.3D's rails. Touch is ≥ 44px everywhere.
4. **320 @ 200% text:** the global HUD header (pre-existing, not History) widens the mobile layout viewport, and the question Sheet follows it.
5. **Question context in the Popover** sits under the review card inside the 24rem-capped Popover, so on long questions it needs a scroll. It is fully visible in the touch Sheet.
6. **The reveal of a mature Overview** is heavy in dev mode (see O). Profile a production build before launch; if needed, memoize the donut legend and the history panels off the reveal clock.
7. **Owner review items:**
   - The cohort default (rolling 28 days; "Same day" one toggle away).
   - The cautiously approved Review donut (shown only with ≥ 2 linked replays).
   - The strongest-mode crest wording.
8. **A parallel HUB6.3E exists** on `hub6/premium-analytics` (`18876c75`). Decide which lands; do not merge both.

## Q. Next recommended task

**HUB6.3F — owner visual review + production integration.**
1. Walk the certified screens with the owner, compare them with the parallel attempt, and settle item 7.
2. Rebase onto `main` once HUB6.3B / C land on production.
3. Run a staging population refresh to see `aggregate_not_built` → available on real data.
4. Profile the mature Overview in a production build.

**In parallel:** RG2 classification of the Mastery chain families.
