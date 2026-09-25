# HUB4 — Ranked Hub History frontend: handoff

Authority: `HISTORY_ANALYTICS_SPEC.md` (untracked in the main checkout; not
committed here), HUB2 `HISTORY_ANALYTICS_B_HANDOFF.md`, HUB3
`HISTORY_ANALYTICS_D_HANDOFF.md`.

## Objective

Turn the Ranked Hub's lower workspace into one player-facing History surface:
- completed staged Daily runs, shown as Daily → Stage → Question from HUB2's `GET /api/history/v1`;
- the existing ordinary Ranked and Practice ledger;
- Review and Trends as capabilities inside History, not tabs.

## Ancestry and branch

- **Base:** `origin/main` @ `dd987084810cc7744782a43f9d17b3b8932de956`.
- **HUB3:** `98bfb8ca` (`histd/mobile-review-reliability`) sits directly on that base, so this branch starts at `98bfb8ca`.
- No reconciliation was needed:
  - `origin/main` has not advanced since HUB3.
  - No later commit touches HUB3's files.
- **Branch:** `hub4/history-frontend`, in worktree `mogsy/.worktrees/hub4-history`.
  - `node_modules` is a junction to the main checkout's copy.
  - The package files are identical to `origin/main`.
- **Concurrent branches:**
  - `dclane-c/daily-stage-result` (7 commits ahead) changes Daily run, Journey and `QuizRankedMatch`. It has no overlap with `workspace/**`, History or `LolHistory`. This branch does not edit `QuizRankedMatch`, and that file's `#review` / `#history` links keep working through the legacy mapping.
  - `users1`, `dcsurv` and the `envvis1-*` branches: no overlap.
- **Not pushed.**

## HUB2 contract consumed

- **Endpoint:** `GET /api/history/v1?limit=&cursor=`, backend `codex/history-analytics-b` @ **HUB2.1 `59cceea2b1126f770fc87fc804ef1f821a3599de`** (HUB4 `5744311d` consumed HUB2 `856563ff`; HUB4.1 moved to HUB2.1).
  - `schema_version: 1`.
  - Analytics policy `history-daily-v1`.
  - Read from the implemented code (`history/daily.py`, `routes/history.py`), not from the spec.
- **Auth:** `authedRequest`. It never creates a guest identity for a read.
  - No session, `401 AUTH_REQUIRED` and `403 ACCOUNT_REQUIRED` all mean "signed out". This is a state, not an error.
  - Anything else is an error, shown with a retry.
- **Paging:** 10 runs per page. The cursor is passed back exactly as received.
- **Parser (`src/lib/history/contracts.ts`):**
  - The schema version is checked first.
  - The basic record is parsed strictly.
  - Premium `analytics` blocks are parsed leniently. An unreadable block becomes `temporarily_unavailable` / `analytics_unreadable` and the record itself is kept.
  - Opaque ids are normalised to strings.
  - Unknown `record_type`s are skipped, which leaves room for Ranked/Practice variants later.
- **No contradictions with the spec that block HUB4.** Non-blocking gaps are listed under "HUB2 follow-ups".

## Files

New:
- `src/lib/history/contracts.ts` — DTO types and parser.
- `src/lib/history/historyApi.ts` — client, `HistorySource` seam, `EMPTY_HISTORY_SOURCE`.
- `src/lib/history/contracts.test.ts`
- `src/lib/history/__fixtures__/hub2-history-v1.golden.json` — real HUB2 route output.
- `scripts/hub4-generate-history-golden.py` — regenerates the golden file.
- `src/components/quiz/workspace/useDailyHistory.ts`
- `src/components/quiz/workspace/DailyHistorySection.tsx`
- `src/components/quiz/workspace/DailyRunRow.tsx`
- `src/components/quiz/workspace/HistoryAnalysis.tsx`
- `src/components/quiz/workspace/historyFormat.ts`
- `src/components/quiz/workspace/PracticeWeaknesses.tsx`
- `src/components/quiz/workspace/DailyHistory.test.tsx`
- `src/components/quiz/trends/RecurringWeaknesses.tsx` — lifted unchanged out of the Trends pane.

Modified:
- `LeaguecraftWorkspace.tsx` — rewritten: the tab shell becomes one surface.
- `LeaguecraftHub.tsx` — hash mapping, Daily loader, one ownership index, composition.
- `StudyHistoryLedger.tsx` — its ownership provider now applies only when `ownsCollection` is set. No visible change.
- `QuestionReviewHost.tsx` — the fit geometry now scales with the root font size (see Mobile).
- `PerformanceTrendsPane.tsx` — imports the extracted block; renders the same output.
- `Quiz.tsx` — `trends=` becomes `onPractiseWeakness=`.
- `LobbyPreviewPage.tsx` — offline `dailyHistorySource`.
- Tests: `LeaguecraftWorkspace.test.tsx`, `OwnedQuestionsPane.test.tsx`, `QuestionReviewHost.test.tsx` (+1), `Quiz.hub.test.tsx`, `Quiz.playScroll.test.tsx`.

Deleted:
- `LeaguecraftWorkspace.trends.test.tsx` — it tested the removed tab architecture.

## History hierarchy

```
LeaguecraftHub
└ section[hub-record-section] "History"
  └ LeaguecraftWorkspace — one vellum sheet, no tabs
    ├ [Owned & Missed] toggle → section[history-questions]   (open on request / #review)
    │   ├ ReviewPane — Owned | Missed sources, loaders, paywall, actions unchanged
    │   └ PracticeWeaknesses → RecurringWeaknesses (Premium; Practice Builder hand-off)
    └ history-record
      └ OwnedQuestionIndexProvider — one collection read for Daily and Ranked
        ├ DailyHistorySection — useDailyHistory + useMatchReviews
        │   └ DailyRunRow × runs
        │       ├ Daily · plan date · Score · C/A · accuracy · age
        │       ├ StageRow × persisted stages → QuestionTimeline (HUB3, unchanged)
        │       │   └ [Analysis] → StageAnalysis
        │       └ [Run analysis] → DailyRunAnalysis
        └ StudyHistoryLedger — ordinary Ranked + Practice, unchanged
```

Daily runs lead the record. The spec orders Daily, then Ranked, then Practice. Grouping Daily first also keeps two independently paginated streams from interleaving with gaps.

## Legacy hashes

| Hash | Behaviour |
|---|---|
| `#history` | Scrolls to and focuses History. |
| `#review` | Opens and focuses Owned & Missed, then `replace`s the hash with `#history`. |
| `#trends` | Opens, focuses and scrolls to the newest run that has an analysis to expand, then `replace`s the hash with `#history`. With no such run, History is simply focused. |
| Unknown | Left alone. No scroll, History stays in its default state. |

A plain arrival at `/quiz` never scrolls. The canonicalising replace does not scroll a second time. Existing `/quiz#review` links (`Quiz.tsx`, `QuizRankedMatch.tsx`) are unchanged and still land.

## Daily and Stage

- **Stages:** rendered exactly as persisted, sorted by `order`. The UI never infers `stage_count`. A 4-stage first run shows 4; a `stage_count` that disagrees with the stage list does not produce a fake stage.
- **Daily row (Free):** plan date (UTC calendar date), run score, C/A, whole-percent accuracy, relative age. Stage metrics are not repeated at run level.
- **Stage row:** one component, with facts that depend on the ruleset:

  | Stage | Shows |
  |---|---|
  | Standard | score, C/A |
  | Time Trial | C/A · "bank ran out" |
  | Survival | C/A · "out of mistakes" |
  | Weak Areas | C/A |
  | Review | C/A |

  The terminal notes and stage names are the Daily's own wording (`DailyCompletion`, `stageIdentity`).
- **Questions:**
  - Every stage carries HUB3's `QuestionTimeline`, unforked, fed by `review_identity.match_id` through the shared `useMatchReviews` loader (2 concurrent reads, in display order).
  - Timeline positions are Ranked round/module occurrences, not question results (HUB4.1, below).
  - Icons can be opened with nothing expanded and no Premium.
  - Desktop uses a Popover; touch uses HUB3's Sheet.
  - `QuestionReviewCard` is untouched.

## Capability behaviour (server state, never inferred)

| State | Run | Stage |
|---|---|---|
| `available` | "Run analysis" opens HUB2 metrics | "Analysis" opens stage analytics |
| `upgrade_required` | Existing Premium invitation → `/lol/premium` | No toggle of its own; the run's one invitation covers it (the state is inherited from the run) |
| `insufficient_evidence` | Server counts in words ("0 of 3 matching runs"); no paywall | Same, e.g. "0 of 1 earlier matching stages" |
| `temporarily_unavailable` | "Analysis is unavailable right now." + Try again; never an upsell | Inherited from the run, so the run shows it |
| `not_applicable` | No affordance | No affordance |

**What a run analysis shows when available:** accuracy vs last run (pts), average accuracy with its sample size, best score (current / tied / date), a 5-run trend line with HUB2's up/down/stable label, Review recovery, sufficient category bars, and grouped learning signals (up to 4 named, then "+N more").

- Metrics with a null value are omitted. They are listed once, with the server's counts, in a single "Not enough matching history yet" line.

**What a stage analysis shows:** sample count, strikes used against the frozen limit (Survival), frozen themes (Weak Areas), and sufficient category / question-type bars.

- Facts that repeat the row (settled, depth, attempted, terminal) are not shown again.
- There is no response-time comparison.
- There is no Weak Areas conversion; HUB2 defers it.

**Never shown:**
- `population` (always null) has no UI.
- Opaque ids, keys, refs and versions are not printed as copy.
- Family and category slugs go through the app's `formatQuestionFamily`.
- Concept ids are not printed at all.

## Review and Trends

**Review:** kept whole.
- `ReviewPane` (Owned | Missed), its loaders, the Missed Pro paywall and its actions are unchanged.
- It now lives in History's Owned & Missed section and reads nothing until opened.
- It is not a tab, and there is one question inspector.

**Trends:** the pane is no longer mounted on `/quiz`.

| Element | Disposition |
|---|---|
| Window picker | B — Academy carousel filter owns it. |
| Answers / accuracy / days studied | B — Academy high-level aggregate. |
| Movement sentence, volume (cadence) sparkline | B — high-level Practice aggregate. **Academy does not currently display these; flagged for HUB6 / Academy.** |
| Category and mode lists | B — Academy bars and donut. |
| Daily comparison | A — HUB2 run and stage analysis. |
| Recurring weaknesses + Practise | **C — preserved** in Owned & Missed, same Builder preset hand-off. |

- The old race and spinner bugs were not repaired; that code is retired from the lobby.
- `PerformanceTrendsPane.tsx` remains only for `/admin` demo analytics (`AdminDemoAnalytics`).

## Ranked, Practice and `/lol/history`

- **Ordinary Ranked:** rows, filter, reviews and ownership lines are unchanged.
- **Daily children:** never appear as Ranked rows. The server excludes them with `load_history_rows` … `NOT EXISTS daily_run_stages` (verified in the backend). The frontend does no id guessing.
- **Practice:** the ledger is unchanged.
- **`/lol/history`:** mounts `StudyHistoryLedger` exactly as before. It has no Daily loader, and a test asserts that.
- **Guests:** no History read is made.

## Pagination

- **First page:** one bounded page (`limit=10`). A skeleton shows only while no rows exist.
- **More Daily runs:** requests the server cursor. Runs are de-duplicated by `run_id`. The button disappears when the cursor is null.
- **Failures:**
  - A failed later page keeps the rows already shown and offers "Try again".
  - A failed first page shows an error with a retry, and the Ranked/Practice ledger stays.
- **States kept apart:**
  - An empty or signed-out account shows nothing extra; the ledger owns the empty state.
  - "No records" and "insufficient evidence" never share UI.

## Mobile

Certified in the built-in browser against a Vite server of this worktree, on `/dev/lobby-preview`.
- **Temporary data:** for the run only, a local uncommitted edit fed the real HUB2 golden pages into the preview. It was reverted before commit.
- **Emulation:** widths under 768 emulate touch.
- **Probe:** checks page overflow, row overflow, elements clipped by their stage, stacking, truncated stage names, page size and target size.

| Viewport | Pointer | Page overflow | Row overflow / clipped | Stages | Icons/page | Min target |
|---|---|---|---|---|---|---|
| 320×568 | coarse | **0** | 0 / 0 | stacked | 3 | 44 |
| 375×667 | coarse | 0 | 0 / 0 | stacked | 4 | 44 |
| 390×844 | coarse | 0 | 0 / 0 | stacked | 4 | 44 |
| 412×915 | coarse | 0 | 0 / 0 | stacked | 4 | 44 |
| 667×375 | coarse | 0 | 0 / 0 | stacked | 5 | 44 |
| 768×1024 | fine | 0 | 0 / 0 | one line | 5 | 18 (arrows; HUB3 desktop geometry) |
| 1280×720 | fine | 0 | 0 / 0 | one line | 5 | 18 |
| 1440×900 | fine | 0 | 0 / 0 | one line | 5 | 18 |
| 1440×900, root 200% | fine | 0 | 0 / 0 | stacked | — | — |
| 390×844, root 200% | coarse | 0 | 0 / 0 | stacked | 1 | 88 |
| 320×568, root 200% | coarse | 52 (hero only) | 0 / arrow +5px | stacked | 1 | 88 |

**320px overflow resolved.** HUB3 measured a 10px page overflow at 320px, partly caused by the `workspace-tab-trends` tab. With the tabs removed, 320×568 measures **0px**.

**Touch Sheet at 390 and 320.** Verified in the browser:
- it opens as a modal dialog named after the icon;
- focus starts on "Close question review";
- body scroll is locked;
- Escape closes it and returns focus to the opening icon.

**200% text: HUB3 infrastructure correction.**
- The defect: `useFittingPageSize` states its geometry in px at a 16px root, but the icons are rem-sized. At 200% root text a touch timeline therefore paged three 88px icons into room for three 44px ones. This overflowed the **existing Ranked rows** identically (measured 51px page overflow at 390px), so it was not Daily-specific.
- The fix scales the geometry by the live root font size (three lines). jsdom has no root size, so HUB3's constants and tests are unchanged. A new test pins the case.
- Remaining at 320px + 200%: one icon plus two 88px arrows overhang the stage by 5px inside the run's padding. That is HUB3's minimum-one rule at an extreme size. Page overflow there comes from hero elements (`lc-emblem`, `ranked-play-gem`), which HUB4 does not own.

**Stacked stage layout.** Name and toggle share line 1 (the name never truncates or breaks), the result is line 2, the question rail is line 3. On desktop it is one ruled line: name, result, rail, toggle.

**Reduced motion.** No new motion. The trajectory is a static SVG with a textual `aria-label`. Chevrons carry `motion-reduce:transition-none`.

## Tests and results

- **New or changed focused suites:**
  - `DailyHistory.test.tsx` 38/38 — Daily, Stage, Question, Capability, Analytics, other history, layout, pagination, `#trends`.
  - `contracts.test.ts` 24/24 — real HUB2 golden.
  - `LeaguecraftWorkspace.test.tsx` 37/37 — one surface, hashes, `replace`.
  - `OwnedQuestionsPane.test.tsx` 21/21.
  - `QuestionReviewHost.test.tsx` 16/16.
- **Workspace + History scope** (`src/components/quiz/workspace`, `src/lib/history`): **226/226, 10 files**.
- **Broad scope** (`src/components/quiz`, `src/pages/LolHistory.test.tsx`, `src/pages/dev/lobby-preview`, `src/pages/Quiz*`, `src/components/ui`, `src/hooks`, `src/lib/history`, AdminDemoAnalytics): **1890 passed / 7 failed, 120 files**, run with `--testTimeout=90000`.
- **`tsc --noEmit -p tsconfig.app.json`:** only the 2 baseline errors (`OnboardingProfile.tsx`, `identity/connections.ts`).
- **ESLint on changed files:** no new errors.
  - The pre-existing `@ts-nocheck` in `LeaguecraftWorkspace.test.tsx` and the pre-existing `no-explicit-any` errors in `Quiz.tsx` (12 before, 12 after) remain.

## Baseline failures

All 7 reproduce identically on untouched HUB3 `98bfb8ca`:
- `playModeCard.styles.test.ts` ×2
- `Quiz.hub.test.tsx` — "keeps exactly one h1"
- `Quiz.rankedRole.test.tsx` — "commits NOTHING for Practice…"
- `LobbyPreviewPage.test.tsx` ×2 (isolation)
- `syntheticRankedHistory.test.ts` — "imported by nothing outside…"

These are the same set HUB3 documented.

## Real-data certification

- **Performed:** HUB2's actual FastAPI route (`routes/history.py` → `history/daily.project`) was driven through `TestClient`.
  - Dependencies overridden: identity, capability, and an in-memory SQLite seeded with HUB2's own test helpers.
  - Scenarios: Free, Premium, entitlement-unavailable, newcomer, empty, a 3-page cursor walk, and an invalid cursor (400 `INVALID_HISTORY_CURSOR`).
  - Its JSON is committed as the golden, and the parser and UI are tested against it. The same pages were rendered in the browser.
  - The backend worktree was not modified.
- **To regenerate:** see `scripts/hub4-generate-history-golden.py`. It needs FastAPI and httpx; run it with the backend worktree as the working directory.
- **Not performed:** a real account against a running backend with persisted staged Daily runs. There was no such environment. This remains the real-account certification step.

## HUB4.1 — HUB2.1 question occurrences

HUB2.1 (`59cceea2`) adds two fields to every `stage.questions[]` item. Schema version stays 1.

- `round_number` — the one-based Ranked round/module occurrence in the stage's child match.
- `challenge_index` — the zero-based question position inside that round.

The `(round_number, challenge_index)` pair is the occurrence identity. A canonical ref is a learning identity and may repeat. The review link is unchanged: `stage.review_identity.match_id`.

**The bug this fixes (HUB4 `5744311d`).** Before a stage's review loaded, `QuestionTimeline` received `roundCount = stage.questions.length`.

- A Standard round (Meta Reflex, slice) or a Survival slice settles several questions but is one review round, drawn as one icon and one card.
- So the pre-review rail showed one placeholder per question result (e.g. 5 for a 3-round stage, ~21 for a 10-round Standard stage), then shrank when the review arrived.

**Now:**

- **Parser** (`contracts.ts`):
  - Reads both ordinals; `round_number` must be a positive integer and `challenge_index` a non-negative one.
  - Orders `stage.questions` by `round_number` ascending, then `challenge_index` ascending, from the ordinals rather than the array order.
  - Exposes `stage.rounds` as `[{ roundNumber, questions }]`, grouped the same way.
  - Nothing is de-duplicated: a repeated canonical ref stays as distinct occurrences.
  - No grouping is inferred from family, type or count.
  - Two results claiming one `(round, challenge)` pair is a contract error.
  - If any question lacks the ordinals, `rounds` is `null` (structure unknown).
- **Stage row:** `roundCount = stage.rounds.length`, one position per round occurrence. With `rounds` null, no placeholders are invented; the timeline appears when the review loads.
- **Unchanged:**
  - Once the review loads, HUB3's `QuestionTimeline` and the review flow are the authority, as before (not forked).
  - C/A and all analytics stay question-grain and server-computed.

**Golden:** regenerated through HUB2.1's real route. It adds an `occurrences` scenario with Standard and Survival stages:

- 5 results in 3 rounds (`[1,0] [1,1] [2,0] [3,0] [3,1]`);
- `quiz:repeat` at two occurrences;
- rows inserted out of order.

The earlier scenarios are unchanged apart from the new fields and `as_of`.

**Tests (HUB4.1):**

- `contracts.test.ts` 32/32, including:
  - real-route ordinals;
  - Standard/Survival grouping;
  - repeated ref;
  - reversed-array ordering;
  - numeric order (9 before 10) with a cross-round repeated ref;
  - duplicate-occurrence refusal.
- `DailyHistory.test.tsx` 43/43. The new cases:
  - Standard 5 results / 3 rounds → 3 positions before review;
  - Survival 8 results / 6 rounds → 6;
  - repeated refs are not collapsed;
  - the review loads into the same timeline (`m-s-0`, 3 positions);
  - no invented positions without ordinals.
- Workspace + History scope: **239/239, 10 files**.
  - On the first parallel run, two untouched HUB3 Popover tests in `QuestionReviewHost.test.tsx` failed. They passed in isolation (50/50 with `QuestionTimeline.test.tsx`) and on the rerun of the full scope.
  - These are the slow jsdom Popover tests HUB3 documented.
- Broad scope (the same 120 files as before): **1902 passed / 8 failed**.
  - 7 are the baseline failures listed below.
  - The 8th is the same untouched HUB3 Popover test, which hit its own hard 60s per-test limit while that file took 141s under the parallel run. It is a load timeout, not a result of this patch.
- Visual check (temporary, uncommitted preview feed of the `occurrences` scenario, reviews not loaded):
  - 320×568 touch: each 5-result stage shows 3 positions with no paging arrows; 0 overflow, 0 clipped.
  - 1280×720: 3 positions, one-line layout, 0 overflow.
  - The old code would have shown 5 positions (paged at 320).

## HUB2 follow-ups (non-blocking; for the backend owner)

1. **Skipped stages.** `daily_run_stages.status` is not projected, so a skipped stage cannot say "Not needed". It renders "—".
2. **Display labels.** `family` and `concept` are internal slugs, and `category` is a family slug for slice questions.
   - HUB4 formats slugs with `formatQuestionFamily` and never prints concepts.
   - Projected display labels would be better.
3. **Survival strikes.** `strikes_used` is only in Premium analytics. Free shows the terminal note only.
4. **Stage comparison.** Stage analytics carry a sample count and group performance, but no comparison value such as a previous stage's score.

## Left for HUB5

- Timmy staged Daily fixtures through the `dailyHistorySource` seam. `LobbyPreviewPage` passes `EMPTY_HISTORY_SOURCE` for now.
- Frozen stage reviews through `rankedReviewPreview`, keyed by child match id.
- Scenario matrix and goldens.
- Real-account certification.

## Left for HUB6

- Final visuals and motion: trajectory reveal, bar growth, polish.
- GRAPH1 primitive extraction.
- Retiring `PerformanceTrendsPane.tsx` together with the AdminDemoAnalytics decision.
- An Academy owner decision on the retired Practice movement and cadence views.
- A product decision on a non-colour per-question outcome mark (carried over from HUB3).
- Human visual review at desktop sizes; the pane here was ≤800px, so wider sizes were checked by DOM measurement.
- Real-device checks: iOS/Android safe areas, the Android back button.
