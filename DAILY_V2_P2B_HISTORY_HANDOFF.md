# DAILY V2 — P2B History main Daily presentation (DV2-P2B) — handoff

Date: 2026-10-08 · Frontend only · feature branch, **not merged, not published**.

## 1. Bases (verified)

- Frontend `mitcherrman/mogsy`: branch base = **`d528bf9fe87e22371ff3dacf4eeb2f58fe383a33`** (the expected base; same base as P2A).
  `origin/main` had moved to `c08882f6` by the time of the fetch: 8 unrelated Mastery-retirement commits
  (`Quiz.tsx`, `Quiz.hub.test.tsx`, `quiz-mastery/*`, `MASTERY_RETIREMENT_HANDOFF.md`). None touches History,
  the Daily run files or anything this branch edits, so the branch stays on `d528bf9f` and every
  differential is against that exact commit.
- Backend `mitcherrman/League_Combat_Simulator` (read only): `origin/dv2/b2-main-history` = **`ec3500d0`**
  (B1 `4302ba1f` → B2 `d81bd6a3` → B1.1 `ec3500d0`). Read: `history/daily.py`, `history/personal.py`,
  `history/population.py`, `test_dv2_b2_main_history.py`, both backend handoffs. Nothing written there.

## 2. Branch / worktrees

- Branch `dv2/p2b-history-main`, worktree `C:\Users\mlmit\mogzy-wt\dv2-p2b` (`node_modules` junction, `.env` copied).
- Baseline checkout (detached at `d528bf9f`): `C:\Users\mlmit\mogzy-wt\dv2-p2b-base`.

## 3. Reader contract (`src/lib/history/contracts.ts`)

New parsed types on `DailyHistoryRecord`:

```
main:   { completedAt: string; dailyScore: number } | null     // DailyMain
parent: { status: "active" | "completed"; completedAt: string | null } | null   // DailyParent
```

| Wire | Parsed |
|---|---|
| field absent (today's production) or `null` | `null` |
| `main: {completed_at: str, daily_score: int}` | `DailyMain` |
| `main` missing either half / non-integer score / not an object | **record refused** (`HistoryContractError`) — never completed with a guess |
| `parent: {status: active, completed_at: null}` / `{status: completed, completed_at: str}` | `DailyParent` |
| unknown parent status, active with a time, completed without one | refused |
| `parent.status = active` with `main = null` | refused (B2 never admits it) |

`parent: null` means "older backend / unknown", never "active". `stageCount` may exceed `stages.length`
(B2 sends only settled stages while a parent is active); that is valid and nothing is synthesised.
Everything else in the reader is unchanged. Strictness follows the existing rule: the record is strict,
analytics are tolerant — `main`/`parent` belong to the record.

## 4. Headline-facts authority (`src/components/quiz/workspace/dailyHeadline.ts`)

`dailyHeadline(record)` is the one pure helper the row reads:

- `main === null` (v1–v4, or any pre-B2 payload): `record.basic` score / correct / answered / accuracy,
  **exactly as before** (`source: "legacy"`).
- `main !== null`: score = `main.dailyScore`; correct / answered / accuracy = the record's single
  `standard` stage's own `basic` (`source: "main"`). Never `record.basic` (the aggregate, which grows as
  optional stages settle).
- `main !== null` without exactly one Standard stage: score = `main.dailyScore`, C/A and accuracy
  **null** → the row shows `—` (`daily-run-correct-neutral`) and an empty ring. No aggregate fallback.

The row (`DailyRunRow`) renders `headline.*` in the same places, same markup. `data-headline="main"` is
added only on a main record, so legacy markup is byte-identical (see §8).

## 5. Parent-active presentation

`optionalActivities(record, now)` → `"open" | "left_open" | null` (P2B.1: `unplayed` renamed):

- `main` present and `parent.status === "active"`:
  - plan date ≥ today (UTC, the Daily's own boundary) → **"Optional challenges still open"**
  - an earlier plan date → **"Optional challenges were left open"** (P2B.1). The backend resumes only
    *today's* run (`service.current_run` filters `plan_date = utc_date(now)`), so "still open" would
    be false. P2B's earlier "Optional challenges not played" was also false: a bundle can be partly
    played (the real `open_partial` fixture has Time Trial completed). "Were left open" is true
    however many were played, does not say the Daily was incomplete, and does not offer a resume.
- otherwise null (resolved parent, legacy record, absent parent).

Shown as one faint italic line in the run's footer (the slot "Run analysis" normally occupies; same
11px italic ink as a stage's ended-by note). Never "unfinished", "incomplete", or "Stage X of N"
(tested). Owner may want different words; the copy lives in `OPTIONAL_ACTIVITIES_COPY`.

Rows: exactly the stages the server sent, in order. No placeholder / pending row, no inferred identity.

## 6. Analytics behaviour

Audit (base `d528bf9f`): the run's "Run analysis" toggle always rendered. For a run-level
`not_applicable`, `hasExpansion` is false, so clicking it expanded the card with **no region at all** —
an empty "Daily Overview" (confirmed in the base DOM dump: `data-focused="true"`, no
`daily-analytics-region`). B2 sends exactly that for an open parent.

Change (smallest coherent): `runOverviewWithheld(record)` = run capability `not_applicable` **and**
reason `parent_activities_incomplete` (exported as `PARENT_ACTIVITIES_INCOMPLETE`) **and**
`parent.status === "active"` — B2's exact contract (P2B.1 added the reason; any other or future
`not_applicable` reason, even on an open parent, keeps the existing toggle behaviour). When withheld:

- no "Run analysis" toggle (the note takes the footer);
- each settled stage's name still selects it and opens its own analysis region (Standard's room is
  reachable, tested with real `available` stage analytics);
- re-selecting the lit stage, or the footer's **Close** (replaces "Daily Overview", which would lead to
  nothing), collapses the row instead of opening an Overview.

Not withheld (unchanged):
- legacy `not_applicable` runs (no parent): existing toggle behaviour, untouched;
- an open parent with `not_applicable` and any other reason: existing toggle behaviour (the note
  still shows — it describes the parent, not the analysis);
- an open parent whose run capability is `upgrade_required` / `temporarily_unavailable` (the backend's
  paywall/outage wins over the open parent): the existing invitation / retry, plus the note;
- a completed v5 parent: the server's Overview as for any completed run.

`#trends` arrival already skips runs without an expansion (`hasExpansion`), so it never targets an open
parent. No main-score personal best, trend, percentile, rank or population metric was added.

Population: unchanged. Stage population blocks (Standard etc.) render as before inside their rooms; the
Core population is only in the Overview, which an open parent does not have. Nothing relabels a Core
percentile as a Daily-score percentile.

Review terminology: untouched (Weak Areas / Recently Missed / History "From that day…" rule).

## 7. Files changed

- `src/lib/history/contracts.ts` — `DailyMain`, `DailyParent`, `readMain`, `readParent`, record fields.
- `src/components/quiz/workspace/dailyHeadline.ts` (new) — `dailyHeadline`, `optionalActivities`,
  `OPTIONAL_ACTIVITIES_COPY`, `runOverviewWithheld`.
- `src/components/quiz/workspace/DailyRunRow.tsx` — headline from the helper; footer note; withheld
  toggle; deselect/Close collapse when withheld.
- `src/lib/history/__fixtures__/dv2-b2-history.json` (new) — REAL backend output (see §9).
- Tests (new): `src/lib/history/contracts.dv2p2b.test.ts` (24), `src/components/quiz/workspace/DailyHistory.dv2p2b.test.tsx` (12).
- This handoff.

Not touched (P2A ownership): `src/lib/daily-challenge/run/*`, `src/pages/quiz-daily-challenge/run/*`,
`src/lib/daily-challenge/status.ts`, hub status / leave-contract files. No overlap with P2A's diff
(`d528bf9f..32500ed1` touches none of this branch's files).

## 8. Tests / differential / static

Focused suites (`src/components/quiz/workspace`, `src/lib/history`, `src/pages/dev/lobby-preview`,
`src/components/quiz/LeaguecraftHub*`), `--maxWorkers=4`, Windows:

| | files | tests | failed |
|---|---|---|---|
| base `d528bf9f` | 30 (2 failed) | 649 | 15 |
| branch | 32 (2 failed) | 685 | 15 |

The 15 failures are the **same node IDs** on both (diffed): `QuestionTimeline.test.tsx` 14 (5 s popover
timeouts) and `syntheticRankedHistory.test.ts` 1. Inherited, not touched.
Unhandled errors: base 1 (`useAuth must be used within AuthProvider`, `LobbyPreviewPage.test.tsx`); branch
the same 1 plus one `window is not defined` teardown error attributed to `OwnedQuestionsPane.test.tsx`
under full parallel load. That file imports nothing this branch touches and passes cleanly 3/3 in
isolation (21/21) — a load-dependent teardown flake, reported, not fixed.

DOM differential (base vs branch, same harness, temporary untracked test file): every Daily row of
every golden page (pre-B2 production shape) and of every real B2 page, collapsed, at its Overview and at
each stage — 150 states on base. **All 72 golden states and all 60 B2-legacy-row states are
byte-identical.** Only the v5 row differs, exactly as intended: headline 17 / 2/3 / 67 % instead of the
aggregate (19 / 3/5 / 60 % open; 25 / 6/11 / 55 % completed), `data-headline="main"`, the note, no
Run-analysis toggle and no empty Overview for the open parent, Close instead of "Daily Overview".

Mutation: see §11.

- `tsc -p tsconfig.app.json --noEmit`: the 2 inherited errors only (`OnboardingProfile.tsx:180`,
  `identity/connections.ts:263`), as on base.
- ESLint on every touched file: clean.
- `git diff --check`: clean.

## 9. Fixture generation (real B2 wire)

`dv2-b2-history.json` is `history.daily.project(...)` at backend `ec3500d0`, over the B2 suite's own
helpers (`test_dv2_b2_main_history.add_legacy / add_run / write_stage / v5_day`), `as_of`
2026-10-03T23:00Z, one player:

- `legacy_only`: two v4 Dailies (Oct 1, Oct 2) → `main: null`, `parent: completed`.
- `open_standard`: + v5 Oct 3, Standard settled (score 17 = `main_score`, as B1 freezes it), parent active.
- `open_partial`: + Time Trial completed, Survival `in_progress` (therefore not sent).
- `completed`: every stage settled (Review skipped), parent completed at 22:00.
- `open_partial_free`: `open_partial` for a non-entitled reader.

Generator (session scratchpad, not kept): imports the backend modules read-only with `python -B`,
builds a temp SQLite DB in the scratchpad, writes compact JSON. To regenerate: replicate the scenario
above against any later backend commit.

## 10. Known limitations / owner notes

- Overview "This Daily" figures (Premium `DailyOverview`, Free `FreeDailyFacts`) remain the
  backend's whole-run figures, now for a completed v5 parent too. They are the run analysis, not the
  headline, and the backend defines them; a later pass may want them to say "all activities".
- For a free reader with an open parent, the Free facts under the invitation are the aggregate of the
  settled stages (backend `basic`), as for any run.
- A past day's open parent stays `active` forever (no skip-extras in B1/B2), so its run analysis never
  opens and it never becomes a "previous Daily" on the backend. Frontend says "were left open"; the
  lifecycle itself is a backend/owner decision.
- "Today" is the client's UTC date; around UTC midnight a skewed client clock can show one wording for
  a few minutes.
- No visual sweep beyond the DOM differential and one preview check (§12).

## 11. Mutation check

26/26 mutants killed by the two new suites (`contracts.dv2p2b.test.ts`, `DailyHistory.dv2p2b.test.tsx`),
each applied alone and restored byte-for-byte: headline from `basic` (score, C/A, accuracy, whole
helper), neutral → aggregate fallback, first-of-several Standard, Overview never/always withheld
(ignoring parent or capability), past day read as open, absent parent read as active, row rendering
`basic`, Run analysis always shown, deselect/Close opening the Overview, note dropped, `data-headline`
on legacy markup, `main`/`parent` dropped by the reader, and each of the six reader refusals removed.

## 12. Visual check

Dev lobby preview (`/dev/lobby-preview`, Timmy Premium) with a throwaway, uncommitted source serving
the real `open_partial` B2 page, Vite on the branch worktree: the Oct 3 row reads SCORE 17 · 67 % · 2/3
over Standard (17 · 2/3) and Time Trial (1/2) only; footer then read "Optional challenges not played"
(client date Oct 8; P2B.1 changed that wording to "were left open" — a copy-only change in the same
slot, covered by the DOM tests, not re-captured); no Run analysis. Selecting Standard opens its own stage room (current facts, previous
attempt, cohort bar) with Close in the footer; Close collapses the row. No console errors. The
throwaway source and launch entry were reverted.

## 13. DV2-P2B.1 (on top of `2f655c20`, additive)

Command-center review approved P2B except two points, both fixed without redesign:

1. **Truthful earlier-day copy.** `unplayed` → `left_open`, "Optional challenges not played" →
   **"Optional challenges were left open"** (§5). Today's copy is unchanged.
2. **Exact withheld reason.** `runOverviewWithheld` now also requires
   `reasonCode === "parent_activities_incomplete"` (§6).

Tests added/adjusted (`contracts.dv2p2b.test.ts` 24 → 27, `DailyHistory.dv2p2b.test.tsx` 12 → 16):
today → "still open"; a later day for `open_standard` and for `open_partial` (Time Trial completed) →
"were left open", never "not played"; no copy implies an incomplete Daily, nothing played, or a
resumable bundle; the exact triple withholds; `not_applicable` with another reason (synthetic
`some_future_reason`, `missing_question_or_ruleset_provenance`, null) on the same open parent does
not, and renders the existing toggle; an outage on an open parent keeps the retry; the exact reason
on a completed parent does not withhold. The legacy DOM-identity, today's-production, completed-v5
and free-paywall tests are unchanged and pass.

Gate vs `2f655c20` (same focused suites, `--maxWorkers=4`): 677 passed / 15 failed (was 670 / 15);
the 15 failures are the identical inherited node IDs. Unhandled errors: only the inherited
`useAuth` one (`LobbyPreviewPage.test.tsx`); the earlier `OwnedQuestionsPane` teardown flake did not
recur. Mutation: 5/5 killed (reason check dropped / widened, parent check dropped, earlier-day copy
reverted to "not played", earlier day read as "still open"). `tsc`: the 2 inherited errors only.
ESLint on touched files: clean. `git diff --check`: clean.

## 14. Result

**READY** for command-center review. Integrate with P2A (no file overlap), then publish the frontend
before releasing backend B1+B2+B1.1.
