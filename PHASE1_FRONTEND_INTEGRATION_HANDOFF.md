# Phase 1 frontend integration — SC-RENAME3 + RCP1 option-media cert

Worktree `.worktrees/phase1-fe-int`, branch `phase1/frontend-integration`. Local commits only; not merged, not pushed.
Baseline worktree for comparison: `.worktrees/phase1-fe-baseline` (detached at the base SHA).

## Base
`origin/main` @ `66fc472e4b3509695ddb3219425da49ebf2b9f26` ("DCGI1: final integration gate on current upstream tips"), fetched 2026-10-02.
Local `main` (`42c4b897`) is stale and was not used.

## Integrated commits
| source | original | integrated |
|---|---|---|
| `sc-rename3-level-badge`: Stat Check display rename, level-badge slot, and contrast | `9ab117aa` | `538dd9bd` |
| `rcp1/frontend-option-media-cert`: two-option `champion_choice` regression | `40ad6170` | `23023d25` |

## Conflicts and reconciliations
**None.** Both source commits are parented directly on `66fc472e`, and `origin/main` has not moved past them. They touch disjoint files.
Both cherry-picks applied cleanly, and no code was reconciled by hand.

## Scope audit (against the integrated diff)
- Mastery Journey: no file was touched.
- League Swipe: not touched. `league-swipe/branding.ts` `META_REFLEX_NAME` is still "Meta Reflex".
- Feedback: not touched.
- Internal ids are preserved. Every removed line that mentions `meta_reflex`, `meta-reflex` or `META_REFLEX_*` is a display label replaced by `META_REFLEX_LABEL`.
  The glyph keys, kinds, module id `item_cost_duel`, testids, `mr-sting__*` classes and analytics ids are unchanged.
- Badge slot: `CardPrompt` always renders a fixed `h-5` `data-testid="mr-level-slot"`, with `aria-hidden` when it is empty.
- Contrast: solid `--ranked-bg-panel` with `--ranked-gold` border and `--ranked-gold-bright` text.
- The two-option `champion_choice` fixture `TWO_CHAMPION_OPTION_QUESTION` is in `OPTION_MEDIA_QUESTIONS`, and the `AnswerGrid` stacked/2-option test is present.
- `?mrlvl=N` is read only inside `probeMetaReflexState()` in `src/pages/dev/ranked-shell-probe/RankedShellProbe.tsx`.
  It is used only for the probe's `metareflex` state, and no other source file reads it. It has no effect on normal navigation.
  (Note: the `/dev/ranked-shell-probe` route itself was already registered without a DEV gate on main, like the other `/dev/*` probes. This integration does not change that.)

## Tests (Windows, vitest 3.2.7)
- Focused: Meta Reflex modules, label, level, reveal; `MetaReflexSting`; `ChampionLevelBadge`; `QuizRankedMatch.metaReflex*`;
  `adaptToViews.optionMedia.test.ts` (23); `AnswerGrid.optionMedia.test.tsx` (24). **10 files, 164/164 passed.**
- Broad changed-area run: `ranked-arena`, `ranked-core`, `components/quiz`, `ChampionLevelBadge`, `pages/quiz-ranked`, `lib/quiz*`,
  `lib/playtest`, `dev/ranked-shell-probe`, `AdminQuizReview`.
  - Integration: 257 files, 3782 tests, **3744 passed / 35 failed** / 3 skipped.
  - Baseline (`66fc472e`, same paths): 256 files, 3774 tests, 3736 passed / 35 failed.
  - **The failing-test sets are identical (0 failures only on integration, 0 only on baseline).**
  - On the prior SC-RENAME3 scope (comparable to its 1509/23): integration has **1559 passed / 23 failed**, baseline 1551 / 23.
- Type check: `tsc --noEmit -p tsconfig.app.json` gives 6 errors on both trees, an **identical** set, all in untouched files
  (`OnboardingProfile.tsx`, `identity/connections.ts`, `practiceLeaveContract.test.ts`). The changed files have none.
- `pnpm build` was not run because it includes the prerender scripts.

## Baseline (environmental) failures, all reproduced on untouched `66fc472e`
- CRLF source-scan assertions: `AnswerGrid.elimination` (2), `DailyOnCanonicalArena.boundary` (2), `QuestionStageGeometry` (3),
  `playModeCard.styles` (2), `masterySliceModule.visualLanguage` (2).
- `spawnSync /bin/sh ENOENT`: `quiz-screenshot/command.parser` (6), `command.reviewKey` (1).
- `AdminQuizReview.proPlay` "emits a --review-key command" (1). It fails identically on baseline, including in isolation.
- 5s timeouts under load: `QuestionTimeline` (14) and `QuestionReviewHost` (2).
  `QuestionTimeline` passes **34/34 on both trees with `--testTimeout=60000`**, including "reviews a Meta Reflex block as its cards".
  `QuestionReviewHost` passes 16/16 on both trees in isolation, twice.

## Visual certification (Vite dev server on the integration tree, `/dev/ranked-shell-probe?q=metareflex[&mrlvl=N]`)
Measured top offsets for the sequence LVL 11 → no level → LVL 20:
| viewport | slot | prompt | choice cards (L/R) |
|---|---|---|---|
| 375×812 | 345.7 ×3 | 371.7 ×3 | 407.7 ×3 |
| 1280×800 | 220.4 ×3 | 246.4 ×3 | 286.4 ×3 |
- **There is zero drift.** The slot is 20px in all three cases, the badge is 17px, and the slot has `aria-hidden="true"` only when it is empty.
- Badge colours compute to text `rgb(213,182,111)` on `rgb(11,23,39)`. Screenshots show it clearly readable on the parchment at both widths.
- The STAT CHECK eyebrow was present on the block at both widths.
- Intro sting on mobile: `?beat=meta&rm=1` mounts the same `MetaReflexSting variant="beat"` that `metaReflexModule` uses on entry.
  With animations frozen mid-hold, the screenshot shows **"STAT ✦ CHECK"** with the "Five cards · Think fast" sub-line.
  This is the probe mount, not a live match entry.
- Screenshots were inspected in-session and not saved to the repo.

## Remaining live QA (not certifiable locally)
The local backend DB is empty and Public Ranked returns 503 FEATURE_DISABLED, so these RCP1 cases are **carried to final live QA without results**:
1. stat-level premise portrait (`champion_stat_level`)
2. two-champion compare option icons (`champion_stat_compare`)
3. named-champion attack type/resource premise portrait
4. champion-choice (melee/ranged) attack-type option icons

Also check the "STAT ✦ CHECK" entry sting in a real live Ranked/Daily match.

## Recorded, not fixed in this integration
- **Feedback category clash.** The persisted feedback category "Stat Check" (`src/lib/feedback/contract.ts` around line 131–168, `app_settings.feedback_config`,
  supabase feedback migrations) is the legacy stored name for the old **Champion Card Duel** area (`/quiz/stat-check`).
  Players now also see "Stat Check" for the Ranked/Daily Meta Reflex block. This needs a DB/config follow-up.
- Owner call (carried from SC-RENAME3): rename the retired League Swipe `META_REFLEX_NAME`? Recommended: no.

## Final integration commit
Integrated code tip: `23023d25`. This handoff is committed on top of it as the branch tip of `phase1/frontend-integration`.
The SHA is the commit that adds this file; see `git log -1 phase1/frontend-integration`.
