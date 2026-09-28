# HUB6.3G1 — Selected Timeline Analytics + Visual Fusion: handoff

A narrow composition patch on HUB6.3G. Selecting Standard, Time Trial or Survival should feel like the **same History stage row opening further**, not a row plus a separate analytics screen.

The first Premium facts now sit **on the row**:
- the exact questions;
- a historical topic percentage under each question;
- the current facts;
- the previous-stage comparison.

The charts continue beneath. There are no new analytics, backend fields or scoring semantics.

## Branch, base

| | |
|---|---|
| Branch | `hub6/premium-analytics-final` (worktree `.worktrees/hub6-final`) |
| Base | HUB6.3G tip `8489da90` (verified before editing), not amended |
| Commits | `22124326` feat (code + tests), docs commit (this file + HUB6_HANDOFF) |
| Backend | `00c794cd`, reference only |
| Pushed | **No** |

## A. Per-question historical topic stat

**Definition (exact).** For a position on the selected stage's rail, the stat is the player's personal accuracy in that position's **public category** over **earlier compatible stages**. It is read from HUB6.3B's `stage.analytics.personal.category_history`:
- the entry for the category key;
- its `correct`, its `questions_played`, and the **server's own `accuracy`**.

It is shown as `NN% <public category label>` ("83% Itemization"), with the label from the public-category taxonomy. RG2's unclassified fallback reads "General", as elsewhere.

**Derivation.** `analytics/derive.topicStats(stage, vm)`, memoized once per selected stage in `DailyRunRow.StageRow`, gives a `Map<roundNumber, stat>`. It is passed to the timeline as `mode.topics`. There is no per-icon observer or computation.

**Missing data → no line.** The line is omitted, never "0%", "No history" or "First time", when any of these holds:
- no personal history (Free, older payloads);
- no entry for the category;
- `accuracy` is null;
- `questions_played` is 0.

Nothing is computed from the current stage.

**Modules.** One line per position:
- A multi-question module (Meta Reflex, Journey) gets one **only if every child shares one public category** with history.
- Mixed children get none: no dominant pick, no average.
- In the lab, Meta Reflex cards all carry the `meta-reflex` public category and the server keeps its history, so they show e.g. "82% Meta Reflex" (an existing fact, not a new metric). Journeys are mixed and show none.

**Visual.**
- The rail stays one horizontal row. Each position becomes a fixed column (62px fine / 58px touch, in root-relative units) with the icon and result mark, then two short secondary lines: the **percentage** (11px bold) and the **category** (9.5px, at most two lines, wrapping rather than truncating).
- Positions without a stat keep the column, so the row stays aligned.
- The pager counts columns: fewer icons per page on the selected row only; every question is reachable by paging.
- Mobile keeps the feature: four columns per page at 390, three at 320.

**Hover / focus / tap.**
- The icon's accessible name and the line's tooltip carry the full fact: "Itemization: 17 of 26 correct in your earlier matching stages, 65%".
- The question Popover / Sheet (HUB6.3G) already lists this stage's count, the category's earlier-stage totals and exact-question history.

## B. The comparison moves into the selected row

`analytics/stageShared.stageComparison(stage, fields)` holds the HUB6.3E comparison logic, unchanged. `StageRowCompare` renders it **inside the selected row**, directly under the row's Free quick facts (which already state this attempt):

```
[timeline + topic lines]
Every answer scores. Play the whole stage.
SCORE 120   CORRECT 22/22   ACCURACY 100%   LONGEST STREAK 22        ← Free quick facts
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
PREVIOUS · SEP 11   SCORE 105  CORRECT 19/22  ACCURACY 86%  LONGEST STREAK 9
[▲ Score +15] [▲ +3 correct] [▲ 100% vs 86% · 14 points higher] [▲ Streak +13]
```

| Stage | Fields (unchanged) |
|---|---|
| Standard | score · correct · accuracy · streak |
| Time Trial | correct · accuracy · questions played · streak · ended |
| Survival | depth · correct · accuracy · strikes used (only if known) · streak · ended |
| Weak Areas / Review | none (no historical comparison exists; their rooms are unchanged) |

- If there is no previous attempt: "No earlier matching Standard yet — this is the first."
- It sits inside the row's tinted, stage-ruled box, so it visibly belongs to the row.

**Removed:**
- The rooms' "THIS STANDARD VS THE PREVIOUS ONE" boards (Time Trial, Standard, Survival). There is **one** comparison.
- The "1 STANDARD · ANALYTICS" region title. A screen-reader heading remains (`sr-only`).
- Section headings stay (The course, Personal records, …).

**Continuity.** When a stage is selected, the analytics region carries the stage's ink rule (3px inset) and a wash of its tint fading down (`data-continues`). The first thing below the row and the frozen footer is the one cohort control, then the room's first chart (the course / the donut / the descent).

## D. Standard course → recipe strip

- Five segments joined by chevrons (Splash ×4 › Meta Reflex › Splash ×3 › Meta Reflex › Journey).
- Frames shrink to 36px (Journey 42px; touch keeps 44px).
- No per-module numbers and no Meta Reflex card pips; the timeline owns exact questions.
- Kept: authoritative art, result ring and mark, module type by frame, "5/5" on multi-question modules, the Journey's five child pips, the hover readout, and cross-highlighting.

## Free / Premium

| | Free | Premium |
|---|---|---|
| Selected timeline, outcomes, strike tabs | ✓ | ✓ |
| Quick facts (current score / C / accuracy / streak / depth / strikes if known) | ✓ | ✓ |
| Historical topic % under icons | — (no personal data on the Free payload; tested) | ✓ |
| Previous-stage comparison on the row | — | ✓ |
| Analytics room | exact question cards (unchanged) | ✓ |

## Before / after (same probe, same data: HUB6.3G `8489da90` → `22124326`)

Heights in px. "Selected row" is the stage row alone; "Daily" is the whole expanded Daily (rows + footer + region).

| View | Selected row, before → after | Region, before → after | Whole Daily, before → after |
|---|---|---|---|
| Standard 1440 | 108 → 211 | 1856 → 1519 | 2264 → 2030 |
| Time Trial 1440 | 108 → 212 | 1758 → 1423 | 2166 → 1936 |
| Survival 1440 | 108 → 212 | 1980 → 1606 | 2388 → 2118 |
| Standard 390 | 254 → 462 | 3454 → 2952 | 4464 → 4170 |
| Time Trial 390 | 270 → 502 | 3697 → 3218 | 4723 → 4476 |
| Survival 390 | 305 → 547 | 2988 → 2425 | 4048 → 3728 |
| Standard 320 | 279 → 485 | 4132 → 3578 | 5260 → 4911 |
| Time Trial 320 | 296 → 580 | 4166 → 3660 | 5262 → 5040 |
| Survival 320 | 305 → 556 | 3219 → 2612 | 4324 → 3967 |
| Standard 390 @ 200% | 381 → 732 | 5641 → 5056 | 7217 → 6982 |
| Time Trial 390 @ 200% | 398 → 858 | 5999 → 5271 | 7591 → 7324 |
| Survival 390 @ 200% | 432 → 957 | 4665 → 3849 | 6291 → 5999 |

**The selected row visibly gains analytical depth; the whole Daily got shorter at every width** (−4% to −12%). Weak Areas and Review are unchanged (no compare, no topic lines).

**Certification** (the same shots, `scripts/hub63g-probe.mjs`):
- Page overflow, region overflow and elements past the region's edge: 0 in every after-shot (1440, 390, 320, 390 @ 200%, Weak Areas, Review, Free, Popover 1440, Sheet 390).
- Text collisions, now also audited inside the selected rail and the row comparison: 0.
- Touch targets ≥ 44px.
- The Popover's History summary stays visible.

**Screenshots** (session scratchpad, not committed): `…/scratchpad/g1-before/*.png` and `…/scratchpad/g1-after/*.png`: `std|tt|surv-{1440,390,320,390-t2}`, `wa-390`, `review-390`, `question-1440`, `question-390-sheet`, `free-std-390`; measurements in each `measure.jsonl`.

## Tests

**New:** `LobbyPreviewPage.hub63g1.test.tsx`, 14 tests covering all 27 requirements:
- topic stat equals the server's category accuracy, label and counts; public label only; icon names the full fact (1–2);
- no stat without history / accuracy / plays, never 0% (3–4);
- mixed module none, single-category module one (5–6);
- Free has no % and no compare (7, 23);
- Standard / Time Trial / Survival row compare with exact figures (8–10);
- no room board or stage title (11–12);
- compact course: 10 modules, 5 segments, 4 chevrons, 36 / 42px frames, only the Journey's 5 children (13–15);
- region continuity, other rows visible (16–17);
- Popover and History summary (18); module cross-highlight (19);
- touch / narrow paging with topic lines (20–21);
- wording sweeps (24–27).
- Mobile height (22) is measured by the probe (above), not in jsdom.

**Updated:** the premium suite. Time Trial changes are read from the row; the streak span is counted across the paged selected rail.

**Runs:**
- History scope + Ranked timeline: 169 files, 634 tests, 618 pass. The 16 failures are the same 16 load-timeout names as at HUB6.3G and v2.
- The five affected suites in isolation: **134 / 134**.
- tsc: only the 2 known unrelated errors. ESLint: 0 errors.

## Performance

`scripts/hub63g-perf.mjs`, dev build, one run each, before / after:

| View | Open ms | Preview | Lock | Room nodes | ResizeObservers |
|---|---|---|---|---|---|
| Time Trial | 659 / 401 | 43 / 42 ms | 56 / 55 ms | 622 / 551 | 52 / 51 |
| Standard | 404 / 403 | 48 / 30 ms | 75 / 56 ms | 690 / 608 | 52 / 51 |
| Survival | 430 / 332 | — | 47 / 44 ms | 564 / 488 | 53 / 52 |

- Topic stats are one memoized map per selected stage, so long Time Trial rails do no per-icon work.
- No observers are added. The room is lighter (no comparison board).

## Files

`analytics/derive.ts` (`topicStats`), `HistoryQuestionTimeline.tsx` (`mode.topics`, topic columns, captions, fuller accessible name), `DailyRunRow.tsx` (topics, `StageRowCompare` on the row, region continuity), `analytics/stageShared.tsx` (`stageComparison`, `StageRowCompare`, `COMPARE_FIELDS`; room board removed), `StageAnalytics.tsx` (sr-only heading), `TimeTrialRoom.tsx` / `StandardRoom.tsx` / `SurvivalRoom.tsx` (no board; compact course), `scripts/hub63g-probe.mjs` (row metrics, rail collision audit), tests.

## Remaining issues

1. **"General" topic lines.** Questions RG2 has not classified show "71% General" (the server's fallback). It is factual but unhelpful. This is fixed by RG2 classification (the existing launch item).
2. **The frozen footer sits between the row and the region.** "Run analysis / Daily overview" and the cohort control remain a thin seam. The ink rule and wash carry the stage across it; moving the footer is outside this patch (HUB6.2 shell).
3. The selected rail shows fewer positions per page (columns are wider). All positions remain reachable by paging, with a lit-question flag on the pager.
4. Carried over from HUB6.3G: production HUB6.3B/C data and the population refresh; the lock bar's ~30px layout shift.
