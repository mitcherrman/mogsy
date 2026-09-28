# DD1-B — Data Duel frontend adoption (handoff)

Frontend half of `docs/DD1_DATA_DUEL_PRODUCTION_PATH.md` (branch `dd1/data-duel-production-audit`, `bfab59f3`). Backend half is DD1-A (`League_Combat_Simulator`, branch `dd1/a-comparison-values-backend`, in progress at the time of writing).

| | |
|---|---|
| Base | `origin/main` `3011a416` (backend `origin/master` `26ef8829`) |
| Branch / worktree | `dd1/b-data-duel-frontend` · `mogsy/.worktrees/dd1-b-data-duel` |
| Implementation commit | `a20f6cc2` feat(dd1): adopt data duel for mastery comparisons |
| Ported from | `mig1/1-interaction-lab` `9e251141` (impl) / `b932af4b` (cert) |

## What shipped

**Primitive (ported, not the lab).** `src/components/interaction-grammar/{DataDuel,shared}.tsx`, `src/lib/interaction-grammar/types.ts`. Left behind: `InteractionLab*`, `labFixtures`, `labRenderers`, `labCues`, `featureGate`, the dev route and `StatDrop` (HOLD). Production changes to the primitive:
- The margin sentence prints the authority's strings (`values`, `marginDisplay`). The lab's client `toFixed` formatting and the pre-reveal `content.margin` are gone.
- A reveal with no value for a side shows no value row. There is no `—` placeholder.
- The prompt `h2` is focusable (`promptRef`, `tabIndex=-1`).
- Off-arena ring fallbacks keep the pick and reveal visible outside `.ranked-academy`. The arena's rules have higher specificity and win inside it.
- No audio.

**Reader.** `src/features/mastery/contracts/comparisonValues.ts` → `readComparisonValues(raw): ComparisonValues | null`.
- Required: `contract === "comparison_values.v1"` and `sides`, which must be exactly two `{token, value, display}` objects with exact keys, non-empty distinct string tokens, finite numeric values and non-empty display strings.
- Optional: `unit`, `unit_label` (string, may be `""`), `display_precision` (int ≥ 0), `operator` (non-empty string), `delta` (finite), `delta_display` (non-empty string). Each may be absent or `null`; if present with the wrong type, the whole block is dropped.
- Any unknown key, at the top level or on a side (for example a `winner` copy), drops the block.
- Never throws; returns `null`.
- `withUnitLabel(display, cv)` gives `display + " " + unit_label`. The one exception is `percent` / `%`, which is written tight. The client keeps no unit table of its own.

**Types (optional, reveal-only).**
- `MasteryChallengeReveal.comparisonValues` and `ReviewMasteryChallenge.comparisonValues` (`lib/ranked-public/contracts.ts`)
- `MasteryPlayerReveal.comparisonValues` (`contracts/playerReveal.ts`)
- `MasteryQuestionReveal.comparisonValues` (`interactions/revealState.ts`)
- No pre-reveal type gained a field: `ComparisonSemantics`, `MasterySliceChallengeView` and `DataDuelPublic` are unchanged.
- `comparison_values` was added to both frontend pre-reveal tripwires: `_FORBIDDEN_SEGMENT_KEYS` and `hiddenInfoGuard`.

**Adoption point.** `features/mastery/interactions/ComparisonQuestionView.tsx`. Its internals now render `<DataDuel>`; the props and the registry signature are unchanged.
- The adapter is `interactions/toDataDuel.ts`:
  - `toDataDuelPublic(cs, answerOptions, assets)` reads semantics, tokens and art (splash, then icon, then monogram) only.
  - `toDataDuelReveal(reveal, content)` sets `canonicalToken = correct_answer` and takes values only from `comparisonValues`. If the block's tokens are not exactly this duel's two sides, the values are dropped.
- Phase is `reveal ? revealed : submitting ? locked : open`.
- Correctness words and the explanation stay in the existing `MasteryInlineReveal`, below the duel. The duel's own evidence plate is not used, so the explanation is not printed twice.
- Pass-throughs are one line each:
  - `masterySliceModule.tsx::toQuestionReveal`, in a hunk JP2 does not touch
  - `interactions/toQuestionReveal.ts` (standalone)
- No module, registry or `ModuleRenderer` change.

**Tie.** `answer_options[2]` becomes the `Same value` tablet and submits the existing `"tie"` token; correctness stays with the server. When the structured values reveal a tie, the duel shows the certified even mark and "Dead even — 9 seconds each". The standalone reveal label changed from `Tie / Same` to `Same value` (`COMPARISON_TIE_LABEL`).

**Legacy fallback.** A reveal without the block (every segment frozen before DD1-A, and every old or frozen Review row) renders the canonical and pick tags. It shows no value row and no margin, and displays the explanation verbatim. Values are never parsed from the prose, and nothing crashes.

**Media band.** Suppressed only on the ordinary slice's comparison path, through `structuralBandSource()`, which is appended to the end of `MasterySliceChallengeSurface.tsx`. It is used by `OrdinaryChild` and by `roundMedia.ts`, so the preload stays in step. There is no global question-surface rule, and `masterySliceScenario.ts` is untouched.

**Review.** `QuestionReviewCard` Mastery rows print one "Values: Leona 90 seconds · Pantheon 180 seconds" line when the revealed row carries the block. There is no new persistence and the canonical refs are unchanged. The reader reads the block only when `revealed`, and an unrevealed row carrying it throws, like `combat_working`.

## JP2 exclusions

- No file under `src/components/journey/**` or `src/lib/journey/**` was edited.
- `MasteryInlineReveal.tsx` was not edited.
- Only two JP2-touched files were edited, each in a hunk JP2 does not change:
  - `masterySliceModule.tsx`: one line in `toQuestionReveal`
  - `MasterySliceChallengeSurface.tsx`: one line in `OrdinaryChild`, plus a function appended at the end of the file
- `git merge-tree` of `a20f6cc2` × `jp2/journey-stage-grammar` (`50f9ff88`) is clean.
- The merged tree (a scratch commit, since deleted) passes `ranked-core/modules`, `features/mastery`, `components/journey` and `interaction-grammar`: 59 files / 753 tests.
- `COMPARISON_TIE_TOKEN` is kept, and JP2 imports it.

**Interim Journey state (deferred to F-J).**
- Until JP2 lands, today's `main` Journey child still dispatches comparisons through `ComparisonQuestionView`. It therefore also gets the Data Duel, under `JourneyMatchupSides`, which draws both champions a second time.
- Removing that duplicate needs a Journey file, so it was not done.
- Once JP2 lands, Journey comparisons draw through `JourneyStageQuestion`, which keeps its own `Tie / Same` buttons. Journey adoption of Data Duel is F-J.

## Tests

New tests:
- `comparisonValues.test.ts`: reader, 22 fail-closed forms, unit text, standalone pass-through, and the hidden-info guard
- `DataDuel.test.tsx`: primitive, content-neutral fixtures, legacy reveal, and a source-neutrality scan
- `ComparisonQuestionView.test.tsx`: rewritten for the F-1…F-7 and F-12 matrix
- `masterySliceModule.dataDuel.test.tsx`: Ranked transport, render, submit, hold, legacy, band and preload, and Review

Updated tests: `perQuestionReveal`, `generatedPlaytestWalkthrough`, `ComparisonPrototype` and `ComparisonRevealView`, for the new DOM and label.

Results:
- `src/features/mastery`, `interaction-grammar`, `ranked-core/modules`, `ranked-public`, `ranked-core/media` and the Review test: **83 files / 1011 tests pass**.
- Broader run (quiz, question-surface, ranked-arena, journey, quiz-ranked, admin/ranked): the only failures also fail on clean `3011a416`:
  - `QuestionTimeline` ×14
  - `QuestionMotifLayer` Rift art ×1
  - `playModeCard.styles` ×2
  - `AnswerGrid.elimination` ×2 (Windows path separators)
  - `QuestionStageGeometry` ×3
- `masterySliceModule.knowledge` flaked twice under the full parallel load and passes alone (30/30).
- `tsc -p tsconfig.app.json`: only the 2 baseline errors, in `OnboardingProfile.tsx` and `identity/connections.ts`.
- ESLint on changed files: 0 errors.
- `vite build`: OK. The bundle contains `mig-data-duel` and none of `InteractionLab`, `labFixtures`, `labCues`, `interaction-lab` or `StatDrop`.

**Responsive QA.** Checked in the real `masterySliceModule.Viewport` inside `.ranked-shell.ranked-academy`, using a scratch harness that was deleted afterwards.
- 375×812: open with long labels (the Viktor / Jarvan side-context ranks wrap), tie reveal, no-art monograms, and legacy.
- 1440×900: correct reveal.
- 0 elements past the viewport edge at 375.
- Sides, tie and lock are all ≥ 44px tall.
- The arena paints the canonical side blue and the wrong pick red.
- Locked or revealed tablets dim to 0.62 opacity (`[data-answers-state="locked"]`), the same as the certified lab.

## Deployment order (verified)

Either order is safe.
- **Frontend first:** the reader tolerates a missing block and renders the legacy reveal. The duel itself needs only existing pre-reveal fields.
- **Backend first:** old frontends build reveal objects from named keys and ignore `comparison_values`.
- **One interaction to know about:** the new frontend's pre-reveal tripwires refuse `comparison_values` anywhere outside `own_challenge_reveals` and revealed Review rows. That matches DD1-A's `FORBIDDEN_PRE_REVEAL_KEYS`, so a backend leak fails loudly on the client as well.

## Integration requirements for DD1-A

- The block appears only on:
  - `own_challenge_reveals[i].comparison_values`
  - revealed match-review mastery rows (`challenges[j].comparison_values`)
  - the standalone `mastery_player_reveal.data.comparison_values`
- `sides[0].token == answer_options[0]` and `sides[1].token == answer_options[1]`. The frontend drops the values if the pair of tokens differs.
- `display` and `delta_display` are printed verbatim with `unit_label`. `delta_display` should be the absolute margin, because the sentence reads "Leona by 90 seconds".
- No other keys may be present. An extra key (for example `winner` or `tie_state`) drops the whole block.
- The in-progress DD1-A builder (`adapter.comparison_values`) matches this reader exactly: every field non-null, `unit` / `unit_label` possibly `""`.
- Cross-layer certification (slice C) should replace the hand-authored fixtures with a captured real `own_challenge_reveals` sample.
