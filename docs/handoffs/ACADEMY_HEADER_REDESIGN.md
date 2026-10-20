# Academy header redesign + Ranked removal

Date: 2026-10-19. Base: `origin/main` 71da9531. Repository: `mitcherrman/mogsy`.

| Phase | Branch | PR | State |
|---|---|---|---|
| A: Ranked removal | `academy/ranked-removal` | #100 (ready) | Authorised for production once checks pass. Contains no visual redesign. |
| B: Orrery-first masthead | `academy/orrery-first-header` (based on A) | #102 (draft, base `academy/ranked-removal`) | **Owner visual review required before merge or publish.** |

Worktrees: `C:\Users\mlmit\mogzy-wt\acore-ranked-removal` and `C:\Users\mlmit\mogzy-wt\acore-header`. Each has a node_modules junction, so `rmdir` the junction before running `git worktree remove`.

## Phase A: Ranked removal

- `AcademyCorePage.tsx` no longer renders the `academy-core-ranked` link on any layout. There is no disabled button, placeholder or Coming Soon label.
- Removed: `RANKED_ROUTE` (`academy-core-destinations.ts`), the `academy_core_ranked` funnel click and its `trackFunnelEvent` import (the book door keeps `academy_core_book`), and the `.acore-cta-secondary` / `.acore-cta-hint` CSS.
- Daily Challenge is unchanged: label, resume wording, `DAILY_START_STATE`, route and intent prefetch.
- Tests: the unit test asserts that the shortcuts hold exactly one control and no Ranked/Coming Soon text. Both Orrery E2E specs assert that Ranked is absent on desktop and phones. The text-zoom test checks Daily by role.
- CI: added `.github/workflows/academy-core-orrery.yml`, byte-identical to PR #95's copy (blob 0d0096b8).

### Direct navigation (read-only audit; FE 71da9531, BE origin/master 84567e11)

Ranked gameplay is **blocked server side**:
- `POST /api/ranked/queue` returns 503 `RANKED_QUEUE_PAUSED` when `queue_ranked_enabled` is off (`routes/ranked_public.py:912`). It runs before the bot and preset paths and fails closed (`services/platform_policy.py:198`). Only the verified admin bypasses it. The env gate `RANKED_QUEUE_ENABLED` is separate.
- `/quiz?play=1`: the play scroll offers only the visible modes, so Ranked is omitted (`Quiz.tsx:1455`, `playModes.ts:78`).
- `/quiz/ranked` loaded directly only resumes an existing match. With no match it redirects to `/quiz` and never joins a queue (`QuizRankedPage.tsx:274-313, 401`).
- Practice, Daily and Role Challenge have their own gates and are untouched.
- Pre-existing gap, not changed here: `RANKED_QUEUE_PAUSED` is missing from `UNAVAILABLE_CODES` (`useRankedQueue.ts:70`). It shows the server's generic "temporarily unavailable" message instead of the proper unavailable state.

## Phase B: Orrery-first masthead

- `orrery/AcademyMasthead.tsx` (new) holds two pieces:
  - The **crest**: an inline-SVG hex mark, the `Mogzy Academy` h1 (`#acore-title`) and a gold hairline.
  - The **Daily seal**: a gold medallion with an engraved play glyph on an engraved dark-glass plate with a chevron end. It keeps the same link contract (accessible name `Play`/`Resume Daily Challenge`, `academy-core-daily`, `academy-core-shortcuts`).
- `orrery/academy-core-masthead.css` (new). The page imports it **after** `academy-core-v35.css`, and the order matters because it overrides stacked rules at equal specificity. `academy-core-v35.css` itself is not edited.
  - Desktop: the crest sits above the seal at the head of the left column. The column width and the Orrery's geometry are unchanged. Narrowing the column was tried and reverted: it moved the orbit under the fixed-coordinate drag tests and changed the Patch Report's layout. The Orrery gains the vertical space the old header took. The Patch Report and the Commons/Hall links are unchanged.
  - Phones: crest and seal share one row of about 52 px above the instrument. The crest never shrinks, and the seal label wraps on the narrowest phones (container queries at 359 px and 300 px).
  - Short landscape (< 1024 px wide, landscape, ≤ 560 px tall): the identity and arrows sit beside a viewport-fitted Orrery (height from `--app-viewport-h`), centred in the remaining width. The Patch Report follows below.
  - Reduced motion: the seal's turning tick ring stops.
- `AcademyCorePage.tsx`: the header and the `shortcuts` block are replaced by `<AcademyMasthead dailyResume={dailyResume} />`, plus the import lines.
- No new images or fonts, so the RC2.2 startup gate is unaffected.
- `e2e/academy-core-masthead.spec.ts` + `.github/workflows/academy-masthead-review.yml` check, at every viewport:
  - no Ranked and no horizontal overflow;
  - Daily is in the first viewport, at least 44 px tall and hit-testable;
  - the seal never covers the title;
  - phones: the masthead row is ≤ 64 px and the Core is in the first viewport;
  - landscape: the instrument, all books and both arrows are on screen;
  - desktop: the h1 is ≤ 34 px tall and the stage is ≥ 66 % of the width.
- Screenshots are in the `academy-masthead-screens` artifact of the `academy-masthead-review` run. The cover art is real; the Patch feed and Daily status are stubbed.

## Integration with PR #95 (hover-to-front, on hold)

`git merge-tree` of each branch against `origin/academy-core/hover-to-front` (cbb1c798): **no conflicts**. The merged tree keeps the Ranked removal in every spec and test, plus the masthead import and render. Integration order once the owner approves:
1. Merge #100 (Ranked removal) to main.
2. Merge #95 when approved. The workflow file is identical, so there is nothing to resolve.
3. Retarget #102 to `main`, merge `main` into it, rerun both workflows, then get the owner's visual approval and merge.

If #95 changes before then, re-run `git merge-tree --write-tree --name-only <branch> origin/academy-core/hover-to-front`. Phase B's only page hunk is the brand/shortcuts block and its imports; #95's hunks are the hover handlers and slots.

## Test evidence

See the "CI results" section below (filled from the final runs).
