# DAILY-V2-P0-FRONTEND-COMPAT (DV2-P0) — handoff

Date: 2026-10-07 · Frontend only · local branch, **not pushed, not published**.

## 1. Base

`origin/main` = `4eb044e4f30e5d44705d26ecf3ff4df285ee2988` (fetched first; the delta since the DV2S1 audit at `849e6198` is unrelated OWN1 work, and none of it touches the Daily run files).

## 2. Branch / worktree

Branch `dv2/p0-frontend-compat`, worktree `C:\Users\mlmit\mogzy-wt\dv2-p0` (`node_modules` junction, `.env` copied).

## 3. Every exhaustive stage-kind seam found

| # | Seam | Kind of seam | Change |
|---|---|---|---|
| 1 | `src/lib/daily-challenge/run/contracts.ts` `DailyStageKind` + reader `KINDS` | type union + fail-closed `oneOf` | Both now come from one `DAILY_STAGE_KINDS` tuple, `order_forge` added |
| 2 | `stageIdentity.ts` `IDENTITY: Record<DailyStageKind,…>` | exhaustive record | `order_forge` row; `category` field; new copy |
| 3 | `pages/quiz-daily-challenge/run/DailyStageResult.tsx` `SNAPSHOT_FLOOR: Record<DailyStage["kind"],…>` | exhaustive record (layout floor) | `order_forge` = Standard's floor (same four tiles). **Re-measure when the backend serves it.** |
| 4 | `lib/daily-challenge/run/fixtures.ts` `FIXTURE_CONTENT_SET` | exhaustive record | `order_forge` entry; new synthetic `FUTURE_V5_DAY` |
| 5 | `components/quiz/workspace/historyFormat.ts` `KNOWN_KINDS` | hard-coded string list | now `DAILY_STAGE_KINDS` |
| 6 | `components/quiz/workspace/StageAnalytics.tsx` `KNOWN` | hard-coded string list | now `DAILY_STAGE_KINDS` |
| 7 | `pages/dev/lobby-preview/history/dailyFixtureBuilder.ts` `PRODUCTION_FORMAT` + 4 kind-typed signatures | exhaustive record in a dev fixture that models PRODUCTION history | narrowed to `Exclude<DailyStageKind,"order_forge">` (no invented recipe format) |
| 8 | `components/quiz/workspace/stageTheme.ts` `TONES` | string-keyed map with a fallback | **unchanged on purpose**: unknown kinds borrow the Daily tone and glyph. No invented icon/colour for a stage that is not served. |
| 9 | `stageResultModel.ts` `headlineFor` | `switch` with `default` | unchanged: Order Forge gets the neutral "Stage complete" |
| 10 | `StageTag`, `StageLadder`, `DailyCompletion`, `DailyStageChrome`, `flow.ts`, `client.ts`, `useDailyRun.ts`, `status.ts` | kind-agnostic (read identity/status only) | none needed; `StageTag` gained `data-stage-category` |
| 11 | `lib/history/contracts.ts` | History reads `kind` as a bare string | none |
| 12 | Test literals (`contracts.test.ts`, `run.test.ts`, `DailyStageResult.frame.test.tsx`, …) | literal lists | frame test now includes `order_forge`; others are production-History shapes and stay as-is |

`content-atlas/api.ts` has a `weak_areas` key: that is the atlas wire, not a stage kind.

## 4. `order_forge` compatibility (exact)

- Reader: `order_forge` parses. Anything else still throws `DailyRunParseError` (`kind must be one of …`). Near-misses (`Order_Forge`, `order-forge`, empty, null, number) are refused. The "Review is the one and final stage" invariant is unchanged and still applies to a day containing it.
- **Ruleset ids are not widened.** `RULESETS` is still `standard | time_trial | survival`. An Order Forge stage must therefore arrive with `ruleset: null` / `ruleset_id: null` or `"standard"`. A stage that sends `ruleset_id: "order_forge"` is refused (fail-closed, tested). **Backend P1 must not mint a new ruleset id without an FE reader change first.**
- Identity: label `Order Forge`, family `special`, category `bonus`, rule `Order the cards from highest to lowest by the shown stat.` Nothing about the stat, the board or the card count (those would come from the stage's own `content` line, which `stageContentLine` already prints).
- Result: same snapshot grid as Standard; misses tile applies.
- No `ruleset` tag is drawn for it (`specialStageRulesetLabel` is null for a stage with no ruleset).
- Current backend snapshots: byte/behaviour compatible. The only new parsed field is `skipReason` (reads `skip_reason`, which the backend **already sends**; absent/`null` → `null`).

## 5. Category authority

`src/lib/daily-challenge/run/stageCategory.ts`:

```
standard -> main
survival, time_trial, order_forge -> bonus
weak_areas, review -> training   (internal category; the stage `review` is shown as "Recently Missed")
```

`stageCategory(kind)`, `stageCategoryOf(string)` (null for an unknown kind, never guessed), `DAILY_STAGE_CATEGORY`. `stageIdentity().category` reads it. Nothing renders it except a `data-stage-category` attribute on the stage tag. No reordering, no grouped UI.

## 6. Copy changes

| Where | Before | After |
|---|---|---|
| Weak Areas rule (stage intro, History rule sentence) | "Built from what you've missed before." | "From your history — fresh questions from areas you've struggled with before." |
| Review rule (stage intro) | "Today's mistakes, one more time." | "From today — retry the knowledge you missed in this Daily." |
| Stage `review` label (tag, ladder, recap, History) | Review | **Recently Missed** everywhere (internal kind `review` unchanged). "Review" is the future umbrella section the P2 screen will head; it is not a stage name. |
| Review rule in History (`ruleSentence`) | same as live | "From that day — a retry of the knowledge missed in that Daily." (kept: "From today" would be false for a past run) |
| Daily intro | "N stages · Review closes the day" | "N stages today" |
| Stage result tile | "For Review: N questions saved" | "Missed: N question(s)" — a fact about the stage. Recently Missed asks a deduped share of the day's misses, not all of them. |
| Recap, skipped stage | "Not needed" for everything | from the server's `skip_reason`: Review+`perfect` → "Nothing missed"; Review+`review_items_unavailable` → "Couldn't be replayed"; Weak Areas+`weak_areas_unavailable` → "Not enough past misses"; any other or absent reason → "Not played". No reason is invented. |
| Guest save gate | "Weak Areas built from your history from tomorrow" | "Weak Areas questions drawn from your saved history" |

Deliberately NOT changed: "Stage X of N" (still true of today's linear run; the N may include a Review that is skipped as perfect — the grouped presentation in P2 replaces it), "Perfect day — nothing to review" and "Nothing to review" (true: perfect = zero replayable misses), and the **backend-owned** Review content title "Today's Mistakes" shown as the stage-intro heading (it comes from the server's `_TITLES`; a BE/P1 follow-up if the owner wants it to match "Recently Missed").

## 7. Fake-streak findings

There is **no Daily streak model** (confirmed again): `featured-mock.ts` already dropped its client-side Daily streak, and `dailyStatusFrom` hard-codes `streak: null`.

Removed (Daily-facing claims):
- `src/lib/quiz/playModes.ts` — PLAY scroll Daily line: "…keep your streak alive." → "Complete today's Leaguecraft set. A fresh one arrives every day."
- `src/lib/ads/houseAds.ts` — Daily house ad: "Keep your streak alive." → "Come back tomorrow for the next."
- `src/pages/admin/AdminPlatformPolicies.tsx` — admin warning claimed the Daily "still keeps streaks".

Left alone, flagged for the owner (not Daily claims):
- `QuizSignUpGate` default benefit "Keep your streaks", `AccountUpgradePanel` / `MogzyIdentityMenu` / `QuizSignUpNudge` "streaks", and the `/quiz` meta description "Daily challenges, streaks, and ranks": these refer to the Quiz `current_streak` (a correct-answer streak, a real backend field), not a Daily-return streak. The Daily's own gate passes explicit benefits, so none of them reach a Daily screen. Worth a wording pass when the real Daily streak lands.
- `PlayScrollRecord` / `PlayModeMenu` still draw a "N-day streak" if `daily.streak > 0`. It is dormant (always `null`) and is the right slot for the future streak; no change.
- `lol-changelog.ts` entries are history, `pages/dev/*` are previews.

## 8. Tests

New: `src/pages/quiz-daily-challenge/run/dailyV2P0.compat.test.tsx` (33 tests) — A current snapshots unchanged (parse, render, hub status); B synthetic `FUTURE_V5_DAY` parses and renders (intro, stage intro, tag, ladder, settled + pending result, recap, History label); C unknown kind / near-misses / non-strings / unknown ruleset id / Review-last still refused; category table; D approved sentences, skip-reason notes, guest gate, old strings gone from code; E no streak anywhere on the Daily screens, PLAY line, house ad, admin copy; F a completed Standard does not make an active day "done", `main_completed_at` in a wire snapshot is ignored, nothing draws "Today's Challenge" / "More Challenges".

Updated: `run.test.ts` (label), `DailyRunPage.test.tsx` ("Nothing missed"), `DailyStageResult.frame.test.tsx` (+`order_forge`), `playModes.test.ts`; `fixtures.ts` transport now stamps `skip_reason: "perfect"` as the server does.

Runs (Windows, `--maxWorkers=3–4`):
- Daily suites (`src/pages/quiz-daily-challenge`, `src/lib/daily-challenge`, `playModes`, `ads`): **16 files, 213 tests pass.**
- History/hub neighbours (`components/quiz/workspace`, `lib/history`, `pages/dev/lobby-preview`, `play-scroll`, `LeaguecraftHub*`): 29 files pass, **3 files / 17 tests fail identically on the untouched base** (stashed and re-run): `playModeCard.styles.test.ts` (2, CSS read), `QuestionTimeline.test.tsx` (14, 5s popover timeouts), `syntheticRankedHistory.test.ts` (1). Pre-existing, unrelated.
- `tsc -p tsconfig.app.json --noEmit`: 2 errors, both in untouched files and pre-existing (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`). No errors in touched files.
- ESLint on all touched files: 0 errors; 1 pre-existing `react-refresh` warning (`StageAnalytics.tsx` `ruleSentence`).
- Phase 1 not rerun, as instructed. Nothing was run in a browser (no visual change beyond copy).

## 9. Files changed

Source: `lib/daily-challenge/run/{contracts,stageIdentity,stageResultModel,fixtures}.ts`, `lib/daily-challenge/run/stageCategory.ts` (new), `pages/quiz-daily-challenge/run/{DailyCompletion,DailyRunBeats,DailyStageResult,StageTag}.tsx`, `components/quiz/workspace/{historyFormat.ts,StageAnalytics.tsx}`, `lib/quiz/playModes.ts`, `lib/ads/houseAds.ts`, `pages/admin/AdminPlatformPolicies.tsx`, `pages/dev/lobby-preview/history/dailyFixtureBuilder.ts`.
Tests: `dailyV2P0.compat.test.tsx` (new), `run.test.ts`, `DailyRunPage.test.tsx`, `DailyStageResult.frame.test.tsx`, `playModes.test.ts`. Doc: this file.

## 10. Deploy-order notes for the backend (P1)

- This FE can ship before the backend change. It tolerates, but does not require, `order_forge` and `skip_reason`.
- A run with `order_forge` must keep Review as the single final stage and ruleset id in `standard | time_trial | survival | null`.
- `main_completed_at` / `main_complete` / stage `section` are not read yet (P2). They are ignored harmlessly (tested).

## 11. DV2-P0-CORRECTION (owner decision, after 1db8da41)

- Category authority stays `main | bonus | training` (`weak_areas` and `review` -> `training`). The future user-facing REVIEW umbrella is P2 presentation, not encoded in P0.
- Stage `review` is named **Recently Missed**; Weak Areas unchanged. The History-only "Review" label override was removed.
- Still preparation only: no sections rendered, nothing reordered. Daily *attendance* streak claims stay removed; the future global Answer Streak is a separate workstream.

## 12. Result

See the head of `dv2/p0-frontend-compat`. **READY for command-center review.**
