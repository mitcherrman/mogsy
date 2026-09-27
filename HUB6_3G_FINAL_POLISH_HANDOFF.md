# HUB6.3G — Final Premium Analytics Polish: handoff

The polish pass on the winning HUB6.3E candidate (v2). It fixes v2's correctness bugs, carries over v1's three good ideas (Survival tower, real League art, mobile compaction), settles the owner's locked decisions, and makes the room shorter on phones. There is no redesign: the frozen History shell and v2's interaction model are unchanged.

## Branch, base, backend

| | |
|---|---|
| Branch | `hub6/premium-analytics-final`, worktree `mogsy/.worktrees/hub6-final` (`node_modules` is a junction to the main checkout's) |
| Base | v2 `hub6/premium-analytics-v2` @ `26d9b4e0`, not amended |
| Reference only | v1 `hub6/premium-analytics` @ `18876c75`. Nothing merged or cherry-picked; its ideas were re-implemented |
| Backend contract | `claude/hub6-3-population` @ `00c794cd`, read only |
| Pushed | **No** |

**Commits** (oldest first):

| Commit | Scope |
|---|---|
| `c38b752c` | Correctness fixes (A1–A5), Survival tower (B), League art in the course / Review / Weak Areas (C), Review donut removed, Weak Areas simplified (I), sticky History summary in the Popover (G) |
| `0d4e336c` | Mobile compaction (D), one cohort control (E), chart-label fixes (F), hover-preview status (H) |
| `4d946eee` | Tests (`LobbyPreviewPage.hub63g.test.tsx`, updated premium suite) and the certification probe |
| `312fb881` | Certification fixes (200% text, tower lane geometry, art fallbacks, hover note on tap-lock) and the performance probe |
| _docs commit_ | This handoff and the HUB6_HANDOFF section |

The suggested five-way split became five with a different cut: the correctness fixes and the room upgrades touch the same files (`derive.ts`, `QuestionContext.tsx`, the rooms), so they were committed together. Intermediate commits typecheck; the two existing page tests that asserted v2 behaviour (the per-panel cohort toggle, the Review donut) are updated in the test commit.

## Locked decisions — as implemented

| Decision | Result |
|---|---|
| v2 is the production candidate | This branch is v2 + polish |
| Population default: last 28 days | `PRIMARY_COHORT = rolling_28d`; the one selector opens on **Last 28 days**; **Same day** appears only when the view's population carries it |
| Review donut: do not ship | Removed (component and `reviewDonut` derivation). Tested absent |
| Keep the exact original → replay → result connector | Kept, with the exact questions' art added to its first two steps |
| Keep the Standard course, with real art | Kept, with authoritative art and segment grouping. Assessment in **J** |

## A. Correctness fixes

| | Before (v2) | Now |
|---|---|---|
| **A1 legacy slice** | `UNIT_NAME.slice = "Slice"`; a `slice` module also fell back to the Splash shape and "?" sigil | `historyFormat.moduleFamily()` / `moduleName()`: `slice` → Journey everywhere (course name, shape and sigil, the rail's accessible label and unit sigil, the question context heading). The raw unit stays on the record (`CourseModule.unit`, `data-raw-unit`) |
| **A2 max strikes** | `maxStrikes ?? 3` drew three plates | The shield draws only with the server's `max_strikes`. Unknown: no plates and no "of N"; the count prints alone ("3 strikes used") if the server sent it; the strike markers still render |
| **A3 cutoff date** | `instantDateLabel(evidence_cutoff)` → "Sep 13" in US time zones | `dateBoundaryLabel()`: the date part, formatted in UTC → "Sep 14" |
| **A4 prior exposures** | `int(prior_exposures) ?? 0` → false "First time this question appeared" | `priorExposures` / `priorCorrect` are `number \| null`. Null: the line is omitted (and the Popover summary skips it). "First time" only on an explicit 0 |
| **A5 strikes used** | Fell back to `min(misses, maxStrikes)` | Only the server's count: HUB6.3C Free `strikes_used` whenever its Survival facts are present (`depth` sent) — a null stays null; else HUB6.3B `current.strikes_used`; else a HUB2.3 payload's own factual `strikes_used`. Never rebuilt from misses |

## B. Survival tower

`SurvivalRoom.DepthShaft`, after v1's `SurvivalAnalytics` tower, inside v2's room:
- One floor per question, floor 1 at the top. **12px floors on a fine pointer, 9px on touch**, so a deep run does not tower on a phone. The unreached floors down to the deepest reference are dashed, so previous / average / deepest share one scale.
- A floor-number gutter (1, then every 5th), a surface-to-depth shading, Journey slots bracketed on the left, strike floors outlined.
- A right-hand lane of labels: **STRIKE 1 / 2 / 3** tags (arrow-shaped, from `strike_index` only) and **Previous / Average / Deepest** labels, each with its rule across the tower. `stackLabels()` lays the lane out so no label overlaps another; a displaced label gets a leader line back to its floor. It is computed from the labels' own positions, not hand-tuned offsets.
- Kept from v2: the exact strike markers, the richer strike list ("Strike 1 at depth 24 · question 22 · incorrect · Abilities & Cooldowns"), a strike lock paging the rail, hover previews on floors, the population and history panels, the `role="img"` summary.
- The v2 "Previous / Your average / Deepest" figure boxes were dropped; the lane now names those values on the tower.

## C. Real League art

**Source and rule.** Art comes only from each stage's frozen review (`MatchReviewView`, the same loader the rails use), matched **by round number** (`derive.artRound`). The art priority is HUB6.2's:
1. proven entity or category art (`resolveQuestionIcon(iconHint).src`);
2. the module sigil (Meta Reflex bolt, Journey stack, Splash drop);
3. the generic mark.

Nothing is built from a name.

**Standard course.**
- Modules are grouped into the recipe's segments, each labelled over a bracket: **Splash ×4 · Meta Reflex · Splash ×3 · Meta Reflex · Journey**. The eyebrow repeats the recipe.
- Each module wears its question's art in a frame showing its type: a square Splash, a round Meta Reflex, a double-ringed Journey gate. Its result is the ring plus a ✓/×/◷ mark; a multi-question module shows child pips and C / played (the Journey: 5 pips, "5/5").
- Kept from v2: hover/focus readout ("Module 10 · Journey · 5 / 5 correct — lit on the Standard row above"), cross-highlight, click to lock.
- Meta Reflex never borrows a portrait (its hint resolves to its sigil).

**Review.** The Original card shows the source miss's art (from its own stage's review via `reviewFor`); the Review replay card shows the replay's art (from the Review stage's review). The order is still original ↓ replay ↓ result, with "Light both" unchanged. A source with no proven art shows its module's sigil (a Journey child shows the Journey stack) before the stage's mark.

**Weak Areas.** Each row shows the **served** question's art, labelled "Question N on the row". The provenance note adds: "Each row is the question this Weak Areas served." Nothing suggests it is the historical miss.

## D. Mobile compaction

| Surface | Change |
|---|---|
| Compare board | Below 28rem (measured with a ResizeObserver, in rem so it tracks text size) the three stacked cards become one grid: **Today \| Previous** columns, one row per figure, and that figure's change chips directly beneath it. Changes carry the figure they describe (`BoardChange.metric`); "9 fewer questions played" sits under Correct. Wide boards keep Today / Previous / Change |
| Mode profile | Three dials in **one row** from a 16rem container (normal phones); fluid dials fill their cell. Below 16rem (320, or high text scale) each mode becomes a compact horizontal row |
| Records | An explicit row of 3 (or 2 for Core) from 16rem, with medal art 80px on phones and 100px from 24rem; below 16rem, compact rows with the medal beside its caption. No orphaned third medal |
| Donut legends | Name and per-result buttons share one row from 16rem (was 22rem, which stacked every row at 390). Row padding reduced. Touch buttons stay ≥ 44 × 44px. The donut is 12.5rem wide on phones (15rem from 27rem) |
| Survival | 9px floors on touch; figure boxes removed (their values are on the tower) |
| Review / Weak Areas | Review loses the donut; Weak Areas is one panel |

**Before / after at 390 and 320** (same probe and steps on v2 `26d9b4e0` and this branch; Premium, reduced motion, touch; Overview/TT/Review/WA = L14, Standard = L12, Survival = L11):

| View | Row, v2 → now | Analytics region, v2 → now | Region change |
|---|---|---|---|
| Overview 390 | 4465 → 3622 | 3595 → 2752 | −23% |
| Time Trial 390 | 5514 → 4719 | 4488 → 3693 | −18% |
| Standard 390 | 5195 → 4462 | 4186 → 3452 | −18% |
| Survival 390 | 4361 → 4046 | 3300 → 2986 | −10% |
| Review 390 | 2555 → 1866 | 1571 → 882 | −44% |
| Weak Areas 390 | 2110 → 1472 | 1126 → 488 | −57% |
| Overview 320 | 4863 → 4414 | 3949 → 3500 | −11% |
| Time Trial 320 | 5779 → 5258 | 4683 → 4162 | −11% |
| Standard 320 | 5618 → 5258 | 4491 → 4130 | −8% |
| Survival 320 | 4747 → 4322 | 3642 → 3217 | −12% |
| Review 320 | 2579 → 1953 | 1550 → 925 | −40% |
| Weak Areas 320 | 2141 → 1600 | 1113 → 571 | −49% |

The v2 row heights reproduce HUB6.3F's measurements exactly (4465 / 5514 / 5195). For reference, v1 measured 3725 / 4589 / 4452 there. The branch is now at v1's compactness while keeping v2's content.

## E. One cohort control

- `population.CohortBar` is the **only** cohort selector. It sits at the top of the expanded Daily's analytics region, **outside** the keyed view, so it survives switching between the Overview and every stage (`CohortProvider` is the region's).
- It shows only when the current view's population carries more than one cohort: the Overview reads the Core block and every stage block; a stage reads its own. It does not show for Review / Weak Areas or Free.
- `PopulationPanel` and `ModeProfile` no longer have toggles. Their eyebrow names the cohort ("Mogzy players · Last 28 days").
- If the chosen cohort is missing for one block, that panel falls back to the last 28 days and says so ("Same day comparison isn't available here — showing last 28 days.").

## F. Chart label collisions

| Chart | Fix |
|---|---|
| History lines (Core, Time Trial, Standard, Survival) | **No text inside the plot.** The in-plot "THIS DAILY" label is gone; a readout above the plot names **This Daily (value)**, **Your average (value)** and **Record (value)** with their line swatches. It wraps with the width, so it cannot collide at any width or text size |
| Population histogram | The "Median" text over the bars is gone (it could sit on the "You" pill); a key under the chart names **Your range** and **Median (value)**. Axis labels are chosen by `axisLabelIndexes()` (own bin, then the ends, then the rest), each kept only if it clears every placed label at the measured width. v2 collided "120–129" with "130 or more" at 390 |
| Stopwatch | The "PLAYED" caption moved clear of the count (v2's boxes overlapped) |
| Survival tower | The stacked lane (see **B**) |

The probe checks every pair of visible text boxes inside the history lines and keys, the tower, the histograms, the stopwatch, the course and the mode dials. **v2: 1 collision in Time Trial and 1 in Standard at 390 and 320. Now: 0 in every certified shot.**

## G. Question context

- **Desktop Popover (fine pointer):** the "In your History" heading is now a **sticky bar at the Popover's bottom edge**. It carries the question's key fact: "Seen 24 times before · 20 correct", or the category history / stage count / strike when there is no prior history; a Journey shows "Journey, 4 questions".
- It is visible as soon as the Popover opens, whatever the question's length. Selecting it scrolls the section in; once scrolled there, it sits in place as the section's heading.
- It is a direct child of the Popover's scroll box (a sticky element cannot leave its parent) and is offset by the box's padding.
- The review card stays first; the Popover is still capped at 24rem.
- **Touch Sheet:** unchanged. It keeps the plain heading, with the context shown in place.

## H. Hover-preview status

- While a chart **previews** (hover or keyboard focus), `roomParts.PreviewStatus` shows a compact note fixed at the foot of the window, e.g. "● **Lighting 6 Time Trial questions** ↑ on the rows above · select to keep them lit". Multi-stage previews say "Lighting 72 questions on 5 rows".
- It is portalled to the body, so the region's `overflow-hidden` and transforms cannot clip it. It uses `pointer-events: none` and `role="status"`.
- On touch, the tap that locks also focuses its control; that focus preview IS the lock, so the note stays hidden.
- The lock bar still appears in the run's footer above the region (v2 behaviour), shifting the room ~30px. The pointer can then rest on a neighbouring control and preview it (the note shows that). That is correct, but a reserved slot for the bar would avoid the shift: a small follow-up.
- **No auto-scroll on hover.** A click or tap **locks**: the note goes, the persistent lock bar appears, and the rail pages to the first lit question (v2 behaviour, unchanged). Escape or Clear resets.
- It reads the effective-highlight context only, so a hover re-renders the rails and this note, never a chart (v2's split context is preserved).

## I. Weak Areas

- **The donut is removed.** A Weak Areas serves 3–4 questions, and a result × category donut of four slices only repeated the slot rows.
- One panel remains, "What was selected":
  - an outcome tally (e.g. "✓ 3 correct · × 1 incorrect");
  - one row per slot: its number, the **served** question's art, its selected public category, "Question N on the row" (plus "asked as …" when the served category differs), its result marks, and hover / focus / lock on the rail;
  - the evidence cutoff (UTC-safe);
  - the note that the record keeps which categories were chosen, not which earlier question led to each.
- With no recorded slots, the rows are the served questions, and it says so.
- Nothing is added that the backend does not keep: no source question, miss count or last-missed date.

## J. Standard course — decision check (owner follow-up)

After the art pass, the course and the rail were compared again at 1440 and 390.
- **What the course now owns:**
  - the macro recipe, named and bracketed ("Splash ×4 · Meta Reflex · Splash ×3 · Meta Reflex · Journey");
  - each module's **type** by its frame;
  - the whole ten-module run in one line on desktop (the rail pages on phones);
  - a Journey's composition as child pips.
- **What it still repeats:** the rail already shows every position's art, result and a "4/5" module badge. With real art the two now look *more* alike than v2's abstract nodes did.

**Conclusion: the course adds some value beyond the rail, but not much.** The recipe labels and type frames are genuinely new information; the per-module art and results are a second copy of the rail. It is kept for this pass, as instructed, and works. **Owner follow-up:** either keep it as is, or reduce it to a one-line recipe strip (segment labels + type glyphs + results) in the same place. That strip would remove most of the duplication and some mobile height (the course is ~260px at 390). This is not a launch blocker.

## Free / Premium (unchanged rules)

| Tier | What it sees |
|---|---|
| Free | Every row and rail; question outcomes; the selected row's current facts (score, C / played, accuracy, streak, depth, strikes used **if known**, how it ended); exact strike tabs; the question context's Free lines; the Overview's current Daily facts above the one invitation. No room, no cohort control (tested) |
| Premium | Comparisons, records, averages, history, category history, exact-question prior history, population, strongest mode, the rooms |

## Population behaviour

- The default is the last 28 days, with Same day optional where the backend sends it.
- Insufficient (L1), `aggregate_not_built` (L7) and no strongest mode (L13, margin; L9, one mode insufficient) keep v2's truthful wording. There is never a zero or a percentile without an available cohort.
- `strongest_mode` is the backend's, never recomputed.
- The You / Percentile / Median / Players block is unchanged.

## Tests

**New suite:** `LobbyPreviewPage.hub63g.test.tsx`, 31 tests. It runs the real page on the lab golden, plus the same rooms fed a copy of the lab's wire with one field changed.

| Requirement | Test |
|---|---|
| 1 legacy slice → Journey · 2 "Slice" absent (course, rail label, question context) | A1 · 1, 2 |
| 3 null max_strikes invents nothing · 4 known max works | A2 · 3, 4 |
| 5 UTC-stable cutoff (Sep 14; the old formatter's Sep 13 asserted in a US zone) | A3 · 5, 5b |
| 6 null stays null · 7 no "First time" on null (and 7b: explicit 0 still says it) | A4 · 6, 7, 7b |
| 8 strikes_used null stays unknown · 9 exact markers preserved | A5 · 8, 9 |
| 10 Survival rules render and are named; lane labels ≥ 22px apart | B · 10, 10b |
| 11 course uses proven art · 12 Journey has five children | C · 11–12 |
| 13 Review steps use authoritative art; order original → replay → result | C · 13 |
| 14 one cohort selector · 15 persists across Overview → TT → Standard → Survival → Overview | E · 14, 15 |
| 16 mobile compare layout (and wide kept) | D · 16, 16b |
| 17 mobile mode profile · 18 records wrap intentionally | D · 17–18 |
| 19 no in-plot chart text; key readouts (Core and every stage metric) | F · 19, 19b |
| 20 question History discoverable (fine) / Sheet unchanged (touch) | G · 20, 20b |
| 21 preview status · 23 Escape clears | H · 21, 21b |
| 22 lock paging unchanged | B · 22 |
| 24 Weak Areas: no donut, served art, no invented provenance | I · 24 |
| 25 no Review donut | I · 25 |
| 26 Free Overview preserved | I · 26 |
| 27 old payload compatibility | unchanged HUB2.3 suites (`DailyHistory`, `LobbyPreviewPage.history`, `contracts`), green |
| 28–30 no pp / settled / learning-state wording, every room | I · 28–30 |

**Updated:** the premium suite (the cohort toggle now lives in the region; "Review donut appears" becomes "no Review donut") and `derive.test.ts` (the `reviewDonut` assertion removed).

**Runs:**

| Run | Result |
|---|---|
| History scope + Ranked timeline (`src/lib/history`, `src/pages/dev/lobby-preview`, `src/components/quiz/workspace`, `QuizRankedMatch.timeline`) — one parallel run | **164 files, 620 tests: 604 pass, 16 fail** |
| The same scope on v2 `26d9b4e0` (without the Ranked file) | 146 files, 580 tests: 564 pass, 16 fail |
| The 16 failures | **The identical 16 test names on both** — `QuestionTimeline` popover tests (14), `QuestionReviewHost` (1), one premium page test — every one a vitest timeout (`STACK_TRACE_ERROR`) while ~150 files share the CPU. HUB6.3D/E noted the same load sensitivity |
| Those three files in isolation (`--testTimeout=60000`) | v2: 89 / 89. Branch: 89 / 89 on the rerun; the first isolation run reported 2 failures that were not captured, and two further isolation runs of those files plus the HUB6.3G suite passed 120 / 120 both times (read as a load flake, but noted) |
| New HUB6.3G suite + premium suite in isolation | 70 / 70 |

- `tsc -p tsconfig.app.json`: only the 2 known, unrelated errors (`OnboardingProfile`, `identity/connections`). Each intermediate commit (`c38b752c`, `0d4e336c`) was typechecked the same way in a temporary worktree.
- ESLint on every touched file: 0 errors; the react-refresh "only export components" warnings are the existing pattern.

**Baseline comparison scope.** The change is confined to History (`workspace/analytics`, the History view model, format and timeline label, and `lib/history/personal.ts`); Ranked's `QuestionTimeline` and the shared `questionTimelineParts` are untouched. The comparison was therefore the History scope plus the Ranked timeline suite, against v2, rather than a full-repository run (HUB6.3E's full run found 64 = 64 failures at the same scope boundary). Run the full-repo comparison once at production integration (step 3 below).

## Responsive certification

`scripts/hub63g-probe.mjs` (HUB6.3E's probe, extended) drives the real `/dev/lobby-preview` Analytics Lab in Playwright (msedge) on the dev server:
- Premium, reduced motion; touch and coarse pointer below 768, fine pointer from 768.
- 78 certification shots, then a re-check of the 200%-text and affected views after the fixes (`312fb881`).
- Special states use the lab's own states (insufficient L1, `aggregate_not_built` L7, no strongest mode L13, the Sep 14 cutoff on L14 Weak Areas). A legacy slice and a null `max_strikes` are served by intercepting the golden module and changing one wire field.

| Viewport | Pointer | Views | Page overflow | Region overflow | Past region edge | Label collisions | Min target |
|---|---|---|---|---|---|---|---|
| 320×568 | touch | 6 + Free | 0 | 0 | 0 | 0 | 44 |
| 375×667 | touch | 6 | 0 | 0 | 0 | 0 | 44 |
| 390×844 | touch | 6 + Sheet + special | 0 | 0 | 0 | 0 | 44 |
| 412×915 | touch | 6 | 0 | 0 | 0 | 0 | 44 |
| 667×375 | touch | 6 | 0 | 0 | 0 | 0 | 44 |
| 768×1024 | fine | 6 | 0 | 0 | 0 | 0 | 24 (fine-pointer controls, as HUB6.3D/E) |
| 1280×720/800 | fine | 6 + states + hover | 0 | 0 | 0 | 0 | 24 |
| 1440×900 | fine | 6 + Popover + special | 0 | 0 | 0 | 0 | 24 |
| 320 @ 200% text | touch | 6 | 0 | 0 | 0 | 0 | 44 |
| 390 @ 200% text | touch | 6 | 0 | 0 | 0 | 0 | 44 |

**Other checks:**
- **Question Popover (1440):** inside the viewport (621–1083 × 82–466). The History summary is visible without scrolling (`visibleInPopover: true`), on a long Journey question and on a Time Trial question.
- **Question Sheet (390):** inside the viewport. At 320 @ 200% the Sheet shot shows 2px region overflow and a squeezed 6px history chart behind the Sheet. **v2 measures the identical figures in the same shot**: this is the known pre-existing HUD header issue at 200% text, not History.
- **Hover preview:** the status note is inside the viewport at 1280 on the Overview ("Lighting 28 Time Trial questions") and in Time Trial.
- **Tooltips:** line (320) and distribution (1440) tooltips are inside their charts and the viewport.
- **Special states:**
  - legacy slice (1440 / 390): the Journey gate, no "Slice";
  - null max strikes (1440 / 390): "3 strikes used", no plates, three STRIKE tags;
  - insufficient, not built, no strongest: v2's wording, with no figure.
- **Mobile heights:** see **D**.

**What certification fixed** (`312fb881`):
- At 200% text:
  - the new art tiles and slot badges were rem-sized (now px);
  - the course's segment rows could not wrap;
  - the tower's lane did not fit in a ~135px panel (now px geometry, with a compact lane below 230px);
  - the mode-dial caption's negative margin overlapped the ordinal;
  - compact record captions could not wrap.
- On touch, a tap-lock also left its own focus preview showing the hover note.

**Screenshots** (session scratchpad, not committed): `…/scratchpad/{smoke,smoke2,cert,cert2,cert3,after2,base,after}/`, with measurements in each folder's `measure.jsonl`.

| What | Files |
|---|---|
| Desktop | `cert/c-{daily,tt,std,surv,review,wa}-1440x900.png`, `c-question-1440*.png` (Popover), `c-preview-1280*.png` (hover note), `c-dist-1440.png` |
| Mobile 390 | `after2/a-*-390x844.png`, `cert/c-question-390-sheet.png` |
| 320 / 200% | `after2/a-*-320x568.png`, `cert2/r-*-t2.png`, `cert3/r-*-t2.png` |
| States | `cert/c-{insufficient-1280-l1,notbuilt-1280-l7,nostrongest-1280-l13,sameday-1440-l14}.png` |
| Special | `cert/c-{slice,nullmax}-{1440,390}-*.png`, `cert/c-wa-1440x900.png` (Sep 14 cutoff), `cert/c-free-{320,1280}.png` |
| v2 before (heights) | `base/b-*.png` |

## Performance

`scripts/hub63g-perf.mjs` (HUB6.3E's, plus a lock measurement): the mature lab page, 10 Dailies, one expanded, 1440, motion on. It is a **dev build**, because the lab route is dev-only. Three runs each, v2 and this branch interleaved on the same machine; medians shown.

| View | Open ms, v2 / now | Hover preview (focus → 2nd frame), v2 / now | Lock (click → 2nd frame), v2 / now | Room DOM nodes, v2 / now |
|---|---|---|---|---|
| Overview | 635 / 739 | 34 / 37 ms | 58 / 50 ms | 457 / 468 |
| Time Trial | 334 / 510 | 39 / 40 ms | 53 / 55 ms | 607 / 622 |
| Standard | 317 / 287 | 43 / 42 ms | 53 / 53 ms | 675 / 690 |
| Survival | 278 / 315 | — | 40 / 41 ms | 492 / 564 |
| Review | 304 / 238 | 29 / — (no donut) | 53 / 43 ms | 191 / 166 |
| Weak Areas | 316 / 254 | 24 / — (no donut) | 51 / — | 134 / 96 |

- **Hover previews and locks are unchanged** (≈ 35–45 ms and ≈ 40–55 ms, two frames included). There is no regression toward the earlier ~150 ms preview: the three-context highlight split is preserved, and the new hover note reads only the effective-highlight context.
- **Open times** swing ±200 ms run to run in dev (Overview v2: 369–685 ms). Time Trial's median is ~100–170 ms higher. It is plausibly the two layout-effect width measurements the room now makes (the narrow compare board and the histogram's axis labels): each can re-render its component once before paint. Profile a production build before launch, as HUB6.3E already advised.
- Collapsed rows are unchanged (578 nodes, 79 SVGs each) and mount no analytics. Observers: one IntersectionObserver per revealed section; ResizeObservers grow by 2–3 per open room (board, axis, tower), all disconnected on unmount.

## Files

| File | Change |
|---|---|
| `workspace/historyFormat.ts` | `dateBoundaryLabel`, `moduleFamily`, `moduleName` |
| `workspace/HistoryQuestionTimeline.tsx` | Unit label and sigil through `moduleFamily` (slice → Journey) |
| `workspace/historyViewModel.ts` | `stageCurrentFacts.strikesUsed`: server counts only |
| `lib/history/personal.ts` | `priorExposures` / `priorCorrect` nullable |
| `workspace/StageAnalytics.tsx`, `DailyRunRow.tsx` | Reviews passed to the rooms; `CohortBar` and `PreviewStatus` in the region |
| `analytics/derive.ts` | `unitName`, `CourseModule.family`, `courseSegments`, `artRound`; `reviewDonut` removed |
| `analytics/SurvivalRoom.tsx` | The tower, `stackLabels`, the known-limit-only shield |
| `analytics/StandardRoom.tsx` | The segmented course with art |
| `analytics/ReviewRoom.tsx` | Step art; no donut; the simplified Weak Areas room |
| `analytics/QuestionContext.tsx` | Null-safe prior line; the sticky Popover summary; `contextSummary` |
| `analytics/population.tsx` | `CohortBar`; no panel toggles; fallback note; one-row mode dials |
| `analytics/trophies.tsx` | Narrow compare layout; responsive medals |
| `analytics/charts.tsx` | `useNarrow`, `useElementWidth`, `axisLabelIndexes`; `LineKey` readout; no in-plot text; histogram key; fluid dial; legend compaction |
| `analytics/roomParts.tsx` | `PreviewStatus`, `previewWords`; the history panel's readout |
| `analytics/stageShared.tsx`, `DailyOverview.tsx`, `TimeTrialRoom.tsx` | Keyed compare figures, record grids, stopwatch caption |
| `pages/dev/lobby-preview/LobbyPreviewPage.hub63g.test.tsx` | New suite |
| `scripts/hub63g-probe.mjs`, `scripts/hub63g-perf.mjs` | Certification and performance probes |

## Remaining launch blockers

1. **Production data** (unchanged from HUB6.3E): HUB6.3B / C are not on the backend's production branch, and the population refresh needs its token and scheduler entry. Until then Premium reads `aggregate_not_built`, worded neutrally.
2. **RG2 "general" category** (unchanged): Mastery / Journey children fall into "General" until RG2 classifies the Mastery chain families.

Not blockers:
- the Standard course owner call (**J**);
- fine-pointer targets are 24–30px, as in HUB6.3D (touch ≥ 44px);
- the pre-existing HUD header at 320 @ 200%.

## Production integration sequence

1. Owner sign-off on this branch (and the **J** call).
2. Backend: land HUB6.3B → HUB6.3C (`00c794cd`) on production; configure `HISTORY_POPULATION_REFRESH_TOKEN` and the scheduler; run one staging refresh (`aggregate_not_built` → available).
3. Frontend: rebase `hub6/premium-analytics-final` onto `main` (it carries HUB6 → HUB6.3D → HUB6.3E v2 → HUB6.3G). Re-run the History and Ranked timeline suites and the full-repo baseline comparison.
4. Profile the mature Overview in a production build (the lab route is dev-only; use a staging account).
5. Ship behind the existing Premium entitlement. Retire `hub6/premium-analytics` (v1) and the HUB6.3F review worktrees.
