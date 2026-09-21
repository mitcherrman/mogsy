# DCMOD-E — Daily Challenge parent-run stage flow (frontend)

**Branch:** `dcmod/e-daily-arena` (worktree `mogsy/.worktrees/dcmod-e-daily-arena`)
**Baseline:** `origin/main` @ `a9a7b45a` (contains RFX1 2A → 2B3, merge `ba710c6f`).
Not merged anywhere.

> Baseline note: the checked-out local branch (`envvis1-batch1-scene-channel` @
> `30b75cbe`) and local `main` (`2e2f385b`) do **not** contain the RFX1/Ranked
> presentation work; `origin/main` does (80 commits ahead). This branch was cut
> from freshly fetched `origin/main`. `dcmod/d-hub` sits on the stale
> `30b75cbe` — worth checking before D integrates.

## 1. What this is

One Daily Challenge = one parent run of sequential stages. Each playable stage
is a canonical Bot Ranked **child match**, rendered by the existing
`QuizRankedMatch` → `CanonicalArena`. The Daily owns only what surrounds a stage:

```
entry ─► Daily intro (lineup) ─► stage tag ─► [canonical match] ─► short stage result
      ─► next stage tag ─► … ─► REVIEW ─► ONE final completion
```

* No Victory/Defeat outro, result sting or end screen after a child stage — the
  child is handed back through a new neutral `MatchHost` seam at the instant its
  outro would have started (after the final round's own reveal).
* Only the parent completion is a full closing state.
* No second arena, no answer/timer logic in the Daily (source-guarded).

## 2. Frontend contract expected from DCMOD-B

Transport: `src/lib/daily-challenge/run/client.ts` (`DailyRunTransport`), bound
to B's routes under **`/api/daily-run`**:

| verb | route | returns |
|---|---|---|
| read today | `GET /today` | `{ "run": <snapshot> \| null }` |
| start/resume | `POST /today` | `<snapshot>` |
| read | `GET /{run_id}` | `<snapshot>` |
| launch current stage | `POST /{run_id}/stages/{i}/launch` | `<snapshot>` |
| sync (pull child result, advance ≤ once) | `POST /{run_id}/sync` | `<snapshot>` |

Errors: `{detail: {code, message}}` with codes `SESSION_REQUIRED`,
`DAILY_RUN_NOT_FOUND`, `DAILY_RUN_CONFLICT`, `DAILY_RUN_CHILD_UNAVAILABLE`,
`DAILY_RUN_INTEGRITY`, `DAILY_RUN_NOT_WIRED` (→ "isn't ready" screen).

### Snapshot (schema_version 1)

Base fields are exactly B's current `snapshot()`. Fields marked **B+** are what
this presentation additionally needs; the reader (`readDailyRun`) tolerates
their absence (screen omits what it does not know), so they can land after the
frontend.

```jsonc
{
  "schema_version": 1,
  "run_id": "dr_…", "plan_date": "2026-09-21",
  "status": "active" | "completed",
  "outcome": null | "reviewed" | "perfect",
  "current_stage_index": 0,            // null when completed
  "server_now": "ISO-8601",            // B+  for clock skew (Time Trial projection)
  "stages": [{
    "stage_index": 0, "stage_id": "dr_…:0:time_trial",
    "kind": "standard" | "time_trial" | "survival" | "weak_areas" | "review",
    "ruleset_id": "standard" | "time_trial" | "survival",
    "ruleset": { "ruleset_id": "time_trial", "time_bank_ms": 90000, "max_strikes": null }, // B+ A's frozen RulesetSpec.to_dict()
    "content": { "title": "Champion Mastery", "focus": "Ahri" },                           // B+ from C's content set
    "status": "pending" | "launching" | "in_progress" | "completed" | "skipped",
    "child_match_id": "…" | null,
    "live": {                          // B+ ACTIVE stage only; from A's StageLedger for the human player
      "time_bank": { "total_ms": 90000, "remaining_ms": 61234, "as_of": "ISO", "draining": true },
      "strikes":   { "used": 1, "max": 3 }
    },
    "result": {                        // B+ completed stages; from StageResultReader.summary
      "correct": 8, "answered": 10, "score": 16,
      "ended_by": "completed" | "time_bank_exhausted" | "strikes_exhausted",
      "misses": 2
    }
  }],
  "review_items": [ … ]                // only its length is read
}
```

Reader invariants (a snapshot breaking one is refused as `invalid_response`):
stages contiguous from index 0; exactly one `review` stage and it is last; an
active run names an existing current stage.

**Time bank semantics required:** `remaining_ms` is authoritative *at* `as_of`
(server time); `draining` is true iff at `as_of` the governed player had an
answerable question (A's `[answerable_at, settled_at)`). The client never
decrements on its own authority.

## 3. Presentation decisions

* **Stage identity** (`stageIdentity.ts`): one table names every mode the same
  way everywhere — Daily intro lineup, stage tag, in-match header, stage result,
  final recap. Reusable rulesets vs special stages get different tag treatments;
  a special stage under a non-standard ruleset shows both (`WEAK AREAS · SURVIVAL`).
  Rules copy reads numbers off the frozen ruleset (e.g. "One 90-second bank…").
* **Beats** use RFX1's `.ranked-beat` vocabulary: Daily intro + final completion
  are MAJOR; stage tag + stage result are MEDIUM. No mascots/duel on stage beats.
* **Pacing** is borrowed from Ranked (`flow.ts`): Daily intro
  `ENTRY_INTRO_MIN_MS + 1000`; stage tag ≥ `ENTRY_INTRO_MIN_MS` (and until the
  child exists); stage result `REVEAL_HOLD_LEVEL_UP_MS`.
* **Launch timing:** the child is launched when its stage tag goes up — never
  during the Daily intro — so the tag covers child creation exactly as Ranked's
  duel card covers a bot match's (the bot entry lead-in budget).
* **During play** the arena's `chrome` slot carries the Daily header: "Daily
  Challenge · Stage N of M · [TAG] · content" plus the ruleset readout:
  * Time Trial — server bank via `projectTimeBank`: drains visually only while
    the server said `draining` **and** the arena reports `answering`; held
    through reveals/titles/transitions/prep; re-read from the server on every
    presented-phase change (throttled 400 ms).
  * Survival — "Mistakes left" marks (✕ for spent). Never HP/health/damage.
* **Review** always reads as the closing stage: "Final stage", gold tag,
  highlighted recap row; its completion goes straight to the final completion
  (no interstitial). **Perfect day**: last pre-review stage result says
  "Nothing to review", completion shows "Perfect day — nothing to review",
  Review row "Not needed".
* **Recovery = read, no beat replay:** in-progress stage → child remounted as
  `entry="recovered"` with no intro/tag/launch; pending stage → tag + launch;
  finished day → completion; untouched run (stage 0 pending) → Daily intro;
  a child that finished while away → hands back on mount → sync → result.
* **Failure:** launch/sync errors show on the tag/result beat with a "Try again"
  control (bounded retries: launch 3/stage, sync 6 × 1 s).

## 4. The neutral seam (only change outside Daily folders)

`src/lib/ranked-core/flow/matchHost.ts` + optional `host?: MatchHost` prop on
`QuizRankedMatch`. With a host: no duel intro card, no `RankedMatchOutro`, no
result sting (`outcomeMoment` false), no end screen (placeholder with the host's
copy instead), no `RankedRulesScroll`; `onMatchSettled` fires once at
`presentationPhase === "match-outro" || phase === "match_over"`;
`onPresentationPhase` reports phase changes. **No host → byte-identical.**
No `isDailyChallenge` branch anywhere in Ranked.

## 5. Files

New:
```
src/lib/ranked-core/flow/matchHost.ts
src/lib/daily-challenge/run/{contracts,client,fixtures,flow,stageIdentity,timeBank}.ts
src/lib/daily-challenge/run/run.test.ts
src/pages/quiz-daily-challenge/run/{DailyRunPage,DailyRunBeats,DailyCompletion,DailyStageChrome,StageTag}.tsx
src/pages/quiz-daily-challenge/run/useDailyRun.ts
src/pages/quiz-daily-challenge/run/{DailyRunPage.test.tsx,dailyRun.boundary.test.ts}
src/pages/quiz-ranked/QuizRankedMatch.hosted.test.tsx
DCMOD_E_HANDOFF.md
```
Modified:
```
src/pages/quiz-ranked/QuizRankedMatch.tsx                         (host seam, ~40 lines)
src/components/ranked-arena/DailyOnCanonicalArena.boundary.test.tsx (POSIX paths; DCMOD-E components; one allowed QuizRankedMatch import)
src/components/ranked-arena/CanonicalArena.boundary.test.tsx       (POSIX paths)
```
Untouched: `App.tsx`, the DC2 page/controller, Ranked Hub / play-scroll,
Practice/Quiz Forge, queue availability, backend.

## 6. Tests

* `src/lib/daily-challenge/run/run.test.ts` (20) — contract reader + Review-last
  invariants, tolerant base shape, perfect run, stage identity/tags, flow
  projection, `stageCompletedBetween`, Time Trial bank projection (hold/drain/
  skew/clamp).
* `src/pages/quiz-daily-challenge/run/DailyRunPage.test.tsx` (13) — full 4-stage
  flow intro → tag → play → result → … → Review → one completion; no completion
  between stages; tags/content in chrome; perfect day; ended-by copy; Survival
  marks (no HP); Time Trial held/draining/re-read; refresh recovery (in-progress,
  finished-while-away, pending, completed, untouched); launch failure + retry.
* `src/pages/quiz-daily-challenge/run/dailyRun.boundary.test.ts` (5) — no answer
  path/renderer/clock/CanonicalArena in Daily run code; no Ranked full ending;
  no health vocabulary; no manual progression control.
* `src/pages/quiz-ranked/QuizRankedMatch.hosted.test.tsx` (6, real controller +
  real arena) — no intro card, no rules scroll, phase reporting, final reveal
  plays then single handback with no outro/end screen, recovered-over handback,
  and ordinary matches unchanged.
* Existing CanonicalArena / Daily boundary suites pass (they failed on Windows
  at baseline only because of `\` path separators — fixed in `8dc88f2d`).

Results: see §8.

## 7. Integration wiring (exact)

1. **Route** (`src/App.tsx`): point `/quiz/daily-challenge` at the new page:
   ```ts
   const QuizDailyChallengePage = lazy(() => import("./pages/quiz-daily-challenge/run/DailyRunPage"));
   ```
   Then retire the DC2 page/controller (`QuizDailyChallengePage.tsx`,
   `useDailyChallengeRun.ts`, `dailyArenaView.ts`, `dailyChallengeViews.ts`,
   `DailyChallengePanel.tsx`, `DailyResultSummary.tsx`, `explanationPolicy.ts`,
   their tests) together with B's backend
   retirement list, and update `DailyOnCanonicalArena.boundary.test.tsx`'s
   "the Daily does" / "stayed a controller" / component-list rules to the new page.
   **Keep** `lib/daily-challenge/{client,contracts,status,useDailyChallengeStatus}.ts`
   for now: the Hub / Play-scroll (`LeaguecraftHub`, `PlayScrollRecord`,
   `Quiz.tsx`, dev previews — DCMOD-D territory) read today's DC2 status through
   them. Their switch to the parent run's `GET /api/daily-run/today` is D's/the
   integrator's call, not made here.
2. **B:** register `migrate_add_daily_runs`, `include_router(daily_run.router)`,
   override `get_daily_run_ports`; add the B+ fields in §2 to `snapshot()`
   (`server_now`, `ruleset` spec, `content`, `live` for the active stage,
   `result` for completed stages).
3. **A:** expose the human player's `StageLedger` (`remaining_ms`,
   `strikes`, whether a question is currently answerable) to B for `live`, and
   `ended_reason` → `result.ended_by`.
4. **C:** a display `title`/`focus` per resolved content set.
5. **Child matches** must be readable through the existing ranked_public match
   API by the viewer (the arena polls `/matches/{id}` etc. exactly as for a bot
   match) and must be bot-driven (factory kicks `_drive_bot`).
6. Optional: B's push hook (child completion → `sync_run`) is compatible; the
   frontend still calls `sync` on handback, which is idempotent.

## 8. Results

* New suites: 44/44 pass (20 + 13 + 5 + 6).
* Regression sweep — `src/pages/quiz-ranked`, `src/components/playtest`,
  `src/components/ranked-arena`, `src/lib/ranked-core`,
  `src/pages/quiz-daily-challenge`, `src/lib/daily-challenge`,
  `src/components/ranked-rules`: **1929 passed, 5 failed / 1934**. The 5
  (`AnswerGrid.elimination` ×2, `QuestionStageGeometry` ×3) fail identically
  on the untouched baseline `a9a7b45a` on this Windows checkout (`\` path
  separators, and CRLF from `core.autocrlf` breaking a multi-line
  `toContain`). They are not regressions and were left alone (not Daily files).
* `tsc -p tsconfig.app.json`: zero errors in touched files (the repo has
  pre-existing errors elsewhere).
* `vite build`: passes. (The new page is not routed yet, so it is not in the
  bundle; the typecheck is what covers it.)
* eslint on touched files: 0 errors (1 pre-existing warning in
  `QuizRankedMatch.tsx`).

## 9. Commits

```
8dc88f2d test(arena): boundary guards compare POSIX paths, so they hold on Windows
24b7e0ef feat(ranked-core): a hosted match — the parent flow owns entry and close (DCMOD-E)
456df735 feat(daily): DCMOD-E parent-run stage flow over the canonical arena
(this doc) docs(daily): DCMOD-E handoff
```
