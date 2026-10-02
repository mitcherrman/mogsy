# SC-RENAME3 — Meta Reflex → "Stat Check" (display) + level-badge slot/contrast

Base: `origin/main` @ `66fc472e`. Worktree `.worktrees/sc-rename3`, branch `sc-rename3-level-badge`. Not merged/pushed.
Implements the scope "A" from the SC-RENAME2 audit (`.worktrees/sc-rename2/SC_RENAME2_HANDOFF.md`, never committed).

## Objective
Players see "Stat Check" for the Ranked/Daily Meta Reflex block. Every machine id is unchanged. The `LVL n` badge is
readable, and level-aware vs level-independent cards no longer reflow the prompt/cards.

## Verified findings
- SC-RENAME1 moved the old mode to Champion Card Duel; the Meta Reflex → Stat Check display rename was never done. Confirmed.
- `ChampionLevelBadge` returns `null` for no level, and `CardPrompt` is a vertical flex column, so the prompt and cards shifted ~23px between aware and independent cards. Confirmed.
- The badge used `#e8c97a` text on a 15% gold wash, which barely shows on the parchment folio. Confirmed.
- The CanonicalArena geometry lock is untouched. The fix is local to `CardPrompt`.

## Decisions
- **One label constant.** `META_REFLEX_LABEL = "Stat Check"` now lives in the new dependency-free leaf
  `src/lib/ranked-core/modules/metaReflexLabel.ts`, re-exported from `metaReflexModule.tsx`. History/review code imports the leaf.
- **Ids unchanged:** `meta_reflex`, `meta-reflex`, `item_cost_duel`, `META_REFLEX_*` names, testids, `mr-sting__*` classes,
  sfx/beat keys, analytics ids, admin review keys and fixtures. Comments were not bulk-edited.
- **Out of scope (left as "Meta Reflex"):** the standalone League Swipe `META_REFLEX_NAME` (`league-swipe/branding.ts`, retired by LS-RETIRE1),
  the `metrics.ts` and `activityLifecycle.ts` labels for that game, and the developer-facing parse errors in `contracts.ts`.
- **Badge slot:** `CardPrompt` always renders `data-testid="mr-level-slot"`, a fixed `h-5` row. The pill is about 17px. The slot gets `aria-hidden` when it is empty.
  The badge component contract (null → nothing) is unchanged.
- **Contrast:** the pill is now solid `--ranked-bg-panel` with a `--ranked-gold` border and `--ranked-gold-bright` text, which is about 9:1 against the pill.
  These are existing `.ranked-academy` tokens, with hex fallbacks.
- Mastery Journey was not touched.

## Files
- New: `src/lib/ranked-core/modules/metaReflexLabel.ts`, `metaReflexLabel.test.ts`
- Badge/layout: `src/components/ChampionLevelBadge.tsx`, `src/lib/ranked-core/modules/metaReflexModule.tsx`
- Display sites → constant: `centralStage.ts`, `RoundTimeline.tsx`, `SegmentTranscript.tsx` (import only), `MetaReflexSting.tsx`
  ("Stat ✦ Check"), `rankedResultsModel.ts`, `historyFormat.ts`, `questionIcons.ts`, `QuestionReviewCard.tsx`,
  `timelineNodeModel.ts`, `publicCategory.ts`, `playtest/preset.ts`, `AdminQuizReview.tsx` ("Stat Check rules/specimens")
- Dev probe: `RankedShellProbe.tsx` adds `?mrlvl=N`, which makes the active Meta Reflex card level-aware for visual QA
- Tests: copy assertions were updated in 11 test files. New slot/transition tests are in `metaReflexModule.level.test.tsx`; a new contrast test is in `ChampionLevelBadge.test.tsx`

## Tests
- Ran vitest on `ranked-arena`, `ranked-core`, `QuestionTimeline`, `QuizRankedMatch.metaReflex` and `ChampionLevelBadge`: **1509 passed, 23 failed. All 23 also fail on
  the untouched base in this Windows env** (CRLF source-scan tests, `/bin/sh` ENOENT, 5s timeouts under load). There are no new failures.
- `QuizRankedMatch.rfx1b3` timed out under the full parallel run but passes 32/32 on its own.
- `tsc --noEmit -p tsconfig.app.json`: the only errors are pre-existing ones in unrelated files (`OnboardingProfile`, `identity/connections`,
  `practiceLeaveContract.test`). There are none in the changed files.
- `pnpm build` was not run because the build includes the prerender scripts.

## Visual certification (dev probe `/dev/ranked-shell-probe?q=metareflex[&mrlvl=N]`)
Measured top offsets for the sequence LVL 11 → no level → LVL 20:
| viewport | slot | prompt | choice cards |
|---|---|---|---|
| 375×812 | 345.7 / 345.7 / 345.7 | 371.7 ×3 | 407.7 ×3 |
| 1280×800 | 220.4 ×3 | 246.4 ×3 | 286.4 ×3 |
There is **zero vertical drift**. The badge computes to text `rgb(213,182,111)` on `rgb(11,23,39)`. The mobile screenshot shows the pill clearly on the parchment
and the "STAT CHECK" eyebrow. Screenshots were inspected in-session and not saved to the repo.

## Unresolved / next task
1. **Feedback category collision.** The DB-seeded "Stat Check" feedback category (`feedback/contract.ts`, `app_settings.feedback_config`)
   still routes to `/quiz/stat-check`, which is Champion Card Duel. It needs a DB/config follow-up.
2. Owner call: rename the standalone League Swipe `META_REFLEX_NAME`? Recommended: no.
3. Check the entry sting "STAT ✦ CHECK" visually on mobile in a live match (unit-tested only). Regenerate `analyticsLab.golden.json` if a lab run diffs.
