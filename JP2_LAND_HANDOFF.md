# JP2-LAND: Journey stage grammar into production `main`

| | |
|---|---|
| Pre-merge `origin/main` | `32479644` (HUB7 withdraw Recurring weaknesses). Main advanced 32 commits since JP2 branched at `3011a416`. |
| JP2 source integrated | `50f9ff88` (JP2 code `a5180a0f` + polish `934cd593` + screenshots). This is the tip DD1-C certified. |
| Not integrated | JP3 (`2f9c2827`, `3295c51c`) now sits on `jp2/journey-stage-grammar` above JP2. Its handoff says "awaiting owner screenshot review". The owner chose JP2 only. JP3 stays on the branch. |
| Integration | branch `jp2/journey-stage-grammar-integration`, worktree `.worktrees/jp2-integration`. It is a `--no-ff` merge: `3d582908`. |
| Pushed | `origin/main` = `3d582908` (fast-forward from `32479644`) |
| DD1 frontend | **Not merged.** `dd1/c-data-duel-integration` is still `99dea17b`. |

## Conflicts / reconciliation

The only file both sides touched is `src/index.css`. Git merged it with no textual conflict. No manual reconciliation was needed. JP2 does not touch `App.tsx`, `src/pages/dev`, the app header, Ranked scoring, answer transport or the backend.

## Tests (integration tree)

- `src/lib/ranked-core src/components/journey src/lib/journey src/pages/quiz-ranked src/features/mastery`: **151 files / 1827 tests passed**. There were 2 vitest worker RPC timeouts ("onTaskUpdate"). These are load-related, not test failures.
- Covered suites: `stageGrammar` (JP2), journey, journey5, journeyPresentation, knowledge, and `QuizRankedMatch.hosted`.
- `tsc -p tsconfig.app.json`: 2 errors, `identity/connections.ts` and `onboarding/OnboardingProfile.tsx`. Clean `origin/main` has the same errors (baseline).
- ESLint on changed TS files: 1 error, `no-control-regex` in `QuizRankedMatch.hosted.test.tsx:372`. It is present on clean `origin/main` (baseline). The rest are warnings.
- `vite build`: success. JP2 adds no new dev routes. The `/dev/journey-arena` harness chunk already ships on main (lazy), so it is unchanged.

## DD1 compatibility (temporary tree, deleted, never pushed)

The tree was `3d582908` + `dd1/c-data-duel-integration@99dea17b`.

- The merge had **no conflicts**.
- The same suites plus the DD1 suites: **154 files / 1910 tests passed**.
- The ordinary `comparison_left_right` DD1 test still asserts `mig-data-duel` (Leona/Pantheon) and passes.
- A throwaway probe rendered every live j3/j4 Journey snapshot: 90 snapshots, **9 Journey comparison children**. Each had **0 `mig-data-duel`** and **0 `journey-matchup-sides`**.
- Routing: `JourneyChild` sends non-numeric children, comparisons included, to `JourneyStageQuestion`. `JourneyMatchupSides` no longer exists.

## Visual QA

The dev harness `/dev/journey-arena` replays real captures through `readPublicRound` → `masterySliceModule` → `CanonicalArena`.

A probe stepped all 24 `j4-voli` snapshots at 375, 390, 768, 1024, 1280 and 1440. `j4-voli` includes Volibear vs Lee Sin comparison child 5. The reference capture `jref-zed-ahri` was checked by hand at 390.

- At every width: one board and one child per step. No Data Duel, no matchup sides, no clipped controls, no reveal/answer overlap.
- Horizontal scroll: none caused by JP2. At 375 in the desktop pane, the app header measures 4px over after the page grows a vertical scrollbar (`100vw` vs a classic scrollbar). JP2 does not touch the header, and phones use overlay scrollbars. `journey-node-label` overflows by design inside the `truncate` eyebrow.
- `journey-open-state` / `journey-open-formulas` are 16px-tall link-buttons. They already exist on main.
- Reveals happen in place on the fixed stage (verdict, explanation, "your pick"). The board stays put.
- JP2 adds no animations, transitions or keyframes, so reduced-motion behavior is unchanged.

## Deploy

- The push landed on `origin/main` (`3d582908`).
- **Lovable publish: PENDING (owner action).** Pushing to `main` does not publish mogzy.lol. After the push, the live `MasterySliceChallengeSurface` chunk still contains `journey-matchup-sides`, so production is pre-JP2.
- Production smoke: not run yet. It needs the publish first.

## Next

1. The owner presses **Publish** in Lovable.
2. Confirm the live `MasterySliceChallengeSurface-*.js` no longer contains `journey-matchup-sides`. Then smoke-test a Journey on mogzy.lol: loads, the comparison renders once, reveal/transition work, the console is clean.
3. **REFRESH + LAND DD1 FRONTEND** (`dd1/c-data-duel-integration`) onto `3d582908`+.
