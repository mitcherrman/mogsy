# HISTORY ANALYTICS — Workstream D handoff

Mobile / accessibility / question-review reliability. Authority:
`HISTORY_ANALYTICS_SPEC.md` §10, §11, §13, §14.D, §17. That spec is
untracked in the main checkout and is not committed on this branch.

## Objective

Fix the frontend infrastructure the future History hierarchy depends on:
the `useMatchReviews` loader lifecycle, Ranked row clipping on mobile,
touch-appropriate question review, and the accessibility these need. This
workstream adds no Daily/Stage analytics, DTO, tabs, cards or copy.

## Base / branch

- Base: `origin/main` @ `dd987084810cc7744782a43f9d17b3b8932de956`
- Branch: `histd/mobile-review-reliability`
- Worktree: `mogsy/.worktrees/histd-mobile` (its `node_modules` is a junction
  to the main checkout's; `package.json`/lockfile are identical to `origin/main`)
- Not pushed.

## Concurrent branches inspected

`git diff origin/main...<branch>` over `src/components/quiz/workspace`,
`src/components/ui`, `src/pages/LolHistory*`, `src/hooks`:

| Branch | Overlap |
|---|---|
| `dcsurv/survival-ux` | none |
| `dclane-c/daily-stage-result` (committed) | none. Its dirty worktree edits `src/index.css` and Journey/arena files, and this branch touches neither |
| `users1/audience-identity` | none |
| `envvis1-batch1-scene-channel` (active checkout, dirty) | sound hooks only, no overlap |
| `envvis1-integration` | none |

## Bugs reproduced

1. **`useMatchReviews` stranded ids.** Each effect run owned one
   `AbortController` and added every queued id to a permanent `claimed` set.
   Any id-set change aborted the in-flight and queued reads, but the ids stayed
   claimed with a stored `pending`, so they were never fetched again. React
   StrictMode's mount → unmount → mount stranded **every** row. Reproduced first
   with 5 failing tests: churn/concurrency, removal, abort → re-request, list
   growth, and StrictMode.
2. **Ranked row clipping.** The row's fixed columns (3.9rem + 8.5rem + 3.25rem
   + a fixed `w-[13rem]` timeline track + 42px) add up to ~34rem. Below that,
   the row's `overflow-hidden` cut off the timeline and the delta.
3. **Touch inspector.** The 28px icons and the anchored Popover gave no 44px
   targets, no close control, and a card covering the row it describes.
4. **Found while testing the fix:** the sheet's focus-return callback read the
   already-reset `open` state, so focus fell to `<body>`. It now uses a
   last-opened ref, and a test pins it.

## Fixes implemented

- **`useMatchReviews.ts`** — the lifetime now belongs to the hook, not the
  effect. Each read has its own controller in an `inFlight` map. On an id-set
  change, still-requested reads continue (no abort, no duplicate request) and
  removed ids are aborted and forgotten, so re-adding one fetches it again. A
  completion whose controller is no longer the current one is dropped, which
  stops stale responses from overwriting state. Only settled results
  (`ready` / `unavailable`) are cached. `pending` is derived as "requested and
  not settled" and never stored. `CONCURRENCY = 2` and display-order
  scheduling are preserved. Unmount aborts everything and nothing starts
  afterwards.
  **Retry contract is unchanged:** a failed read stays `unavailable` and is
  not retried. The frozen-preview path (`rankedReviews` → empty id list) is
  unchanged: no reads.
- **`RankedMatchRow.tsx`** — the row `li` is its own inline-size container
  (`[container-type:inline-size]`, Tailwind arbitrary `[@container(...)]:`
  variants, no `index.css` change).
  - Pointer-fine: the one-line layout applies at ≥35rem row width.
  - Coarse pointer: the one-line layout applies at ≥44rem, because the 44px
    targets need more room.
  - Below the threshold the row stacks: verdict, opponent, role and delta on
    line 1, the timeline on its own full-width line 2, then age, forfeit note
    and ladder on line 3.
  - Stacked, the role and delta size to their text (their fixed columns only
    exist to align the one-line ledger), so opponent names fit.
  - All facts are kept.
- **`QuestionTimeline.tsx`**
  - Track sizing: the fixed `w-[13rem]` track is now `w-full max-w-[13rem]`
    (`max-w-[21rem]` on touch). On desktop it still renders exactly 208px, with
    the first icon aligned across rows.
  - Paging: pages hold as many icons as fit (`useFittingPageSize`,
    ResizeObserver), capped at `TIMELINE_PAGE_SIZE = 5`. The page anchor is
    an index, so a resize or rotation keeps the reader on the same questions.
  - Touch geometry: icons and arrows are 44×44 with a 2px gap. The arrow keeps
    its small ruled tile inside the 44px button.
  - Labelling: the timeline is `role="group"` with the name "Match questions".
  - Unchanged: outcome rings, entity/category art, Meta Reflex, correctness
    semantics, one-open-at-a-time, and close-on-page. The Popover branch is
    byte-for-byte the same `PopoverContent`.
- **`QuestionReviewHost.tsx` (new, neutral)**
  - `useCoarsePointer()`: a live `(pointer: coarse)` media query.
  - `useFittingPageSize()`: the width-fit paging hook used by the timeline.
  - `QuestionReviewSheet`: built from the app's own Sheet primitives (Radix
    Dialog: `Sheet`, `SheetPortal`, `SheetOverlay`, `SheetTitle`,
    `SheetClose`) plus `DialogPrimitive.Content`. `SheetContent` wasn't used
    because its built-in 16px close and dark `bg-background` are wrong for
    this surface.
  - The sheet renders the **same `QuestionReviewCard`**. A test asserts its
    `outerHTML` equals the Popover's.

## Behavior preserved

- Pointer-fine keeps the Radix Popover with the same classes, sizing, flip,
  Escape, click-away, focus return and `!animate-none`.
- Prop APIs: `RankedMatchRow({entry, review})` is unchanged.
  `QuestionTimeline` props are unchanged, except that the `className`
  default (`justify-center`) now carries the justification that used to be
  hard-coded. Its only consumer is `RankedMatchRow`.
- `StudyHistoryLedger`, `LeaguecraftWorkspace`, `LeaguecraftHub`, `Quiz.tsx`,
  `LolHistory.tsx`, the Timmy fixtures, `index.css` and the backend are
  untouched.

## Accessibility

- 44×44 CSS-px targets on coarse pointers for icons, prev/next, and the sheet
  close. Measured in the browser.
- The sheet is a modal dialog.
  - Accessible name: the icon's own label, e.g. "Question 1 of 7, Malphite,
    correct".
  - Focus: trapped inside the sheet; initial focus lands on the close control.
  - Close: an explicit close button named "Close question review"; Escape
    also closes.
  - Focus is returned explicitly to the opening icon, because a tapped
    button isn't focused on every mobile browser.
  - Background scroll is locked. The body scrolls internally
    (`overscroll-contain`).
  - Safe-area padding: left, right and bottom (`env(safe-area-inset-*)`).
  - Height is capped at `max-h-[85dvh]`.
- The icon advertises `aria-haspopup="dialog"` on touch only.
- No hover dependency: `title` is supplementary and `aria-label` carries the
  meaning.
- Reduced motion: the sheet and overlay use `!animate-none`, for the same
  Radix Presence reason as the Popover. They open and close instantly under
  every preference, so no separate branch is needed. The app's
  `html.reduce-motion` / OS rules still apply globally, and nothing new
  animates.
- Color is not the only signal for the row result: "Victory/Defeat/Draw" text
  and the signed delta carry it. Per-question outcome is textual in the icon's
  `aria-label` and in the card. **Visually, the icon ring is still color-only**
  (pre-existing, approved design, unchanged). This is flagged for product
  review below.

## Tests — exact results

- New `useMatchReviews.test.tsx`: **10/10 pass** (5 failed before the fix).
  Covers initial fetch/order, concurrency under churn, removal while in flight,
  abort → re-request, list growth without duplicates, StrictMode, cache reuse,
  failure → unavailable with no retry, unmount, and empty/frozen.
- New `QuestionReviewHost.test.tsx`: **15/15 pass**. Covers the touch dialog
  and its name, identical card markup to the Popover, the 44px close with focus
  return, Escape with focus return, keyboard activation, body
  scroll/safe-area/no-motion, 44px icons and arrows, fine → Popover, fit paging
  (5 when wide, 3 on a 320px phone's touch row, 5 on a 336px touch row, anchor
  paging), the group label, row container/stacking classes, the absence of a
  fixed `w-[13rem]`, the touch threshold, and all row facts visible.
- Workspace + `/lol/history` scope (`src/components/quiz/workspace`,
  `src/pages/LolHistory.test.tsx`): **173/173 pass, 10 files**, with
  `--testTimeout=90000`.
- Broader scope (`src/components/quiz`, `src/pages/LolHistory.test.tsx`,
  `src/pages/dev/lobby-preview`, `src/pages/Quiz*`, `src/components/ui`,
  `src/hooks`): **1817 pass / 7 fail, 118 files**. All 7 failures reproduce
  identically on the untouched baseline (see below).
- `tsc --noEmit -p tsconfig.app.json`: no errors in changed files. There are 2
  baseline errors, in `OnboardingProfile.tsx` and `identity/connections.ts`.
- ESLint on changed files: 0 errors, 3 `react-refresh/only-export-components`
  warnings. One is pre-existing in `RankedMatchRow`, and the other two come
  from the hooks co-located in `QuestionReviewHost`.

## Known baseline failures (not fixed; identical on `dd987084`)

- `playModeCard.styles.test.ts`: two tests (CHOOSE MODE narrowest sheet;
  streak glint).
- `Quiz.hub.test.tsx`: "keeps exactly one h1".
- `Quiz.rankedRole.test.tsx`: "commits NOTHING for Practice after a role
  change".
- `LobbyPreviewPage.test.tsx`: two import-isolation tests.
- `syntheticRankedHistory.test.ts`: "imported by nothing outside the preview
  route".
- `QuestionTimeline.test.tsx`: the Popover tests take ~13–30s each in this
  jsdom on this machine, so they **time out at vitest's default 5s on the
  baseline too**. They pass with `--testTimeout=90000`. My two new
  Popover-path tests carry `{ timeout: 60000 }`.
- The full `npx vitest run` **crashed with a Node heap OOM in a worker** on
  this machine, so there's no full-suite total. The scoped runs above are the
  evidence.

## Viewport certification actually performed

- **Setup:** the built-in browser against a Vite dev server of this worktree,
  on `/dev/lobby-preview` (the real `LeaguecraftHub` with Timmy's 9 frozen
  Ranked rows and reviews). Viewports were emulated with `resize_window`;
  widths under 768 also emulate a touch device, so `(pointer: coarse)`
  matched.
- **Checks at each size:** a DOM probe checked every Ranked row for viewport
  overflow and internal clipping, whether the icons, arrows and delta stayed
  inside the row, the page's horizontal overflow, the stacking state, the page
  size, the icon target size, and opponent truncation.

| Viewport | Pointer | Row layout | Icons/page | Target | History overflow | Page overflow |
|---|---|---|---|---|---|---|
| 320×568 | coarse | stacked | 3 | 44×44 | 0 | **10px (not History, see below)** |
| 375×667 | coarse | stacked | 4 | 44×44 | 0 | 0 |
| 390×844 | coarse | stacked | 4 | 44×44 | 0 | 0 |
| 412×915 | coarse | stacked | 4 | 44×44 | 0 | 0 |
| 667×375 landscape | coarse | stacked | 5 | 44×44 | 0 | 0 |
| 768×1024 | fine* | one line | 5 | 28 | 0 | 0 |
| 1280×720 | fine | one line (track 208px, all rows aligned) | 5 | 28 | 0 | 0 |
| 1440×900 | fine | one line | 5 | 28 | 0 | 0 |
| 1440×900, root font 200% | fine | stacked (rem threshold scales) | 5 | 28 | 0 | 0 |
| 1280×720, CSS zoom 2 (≈640px) | fine | stacked | 5 | 28 | 0 | 0 |
| ~400px pane, native | fine | stacked | 5 | 28 | 0 | — |

\* The emulator only reports coarse below 768px. The coarse layout at tablet
width was verified by unit tests, not in a browser.

Also exercised in the browser:
- **320×568, coarse:** the sheet opens with its accessible name, initial focus
  on the close control and body scroll locked. The close button and Escape
  both return focus to the opening icon.
- **667×375, coarse:** the sheet is capped to the viewport and its body
  scrolls internally.
- **1280×720, fine:** the Popover opens inside the viewport, Escape closes
  it, focus returns, and no sheet renders.
- **`/lol/history`:** renders its shell and error state (no backend) with 0
  overflow and no console errors.

**The 320px page overflow (10px) is not History.** The offenders are
`global-hud-controls`, `ranked-class-slide-support` and
`workspace-tab-trends`. None of them are in this workstream's files. The
workspace tab row belongs to C/orchestration. Because of this overflow the
mobile layout viewport is 330px, so the sheet measures 329px wide at 320.

## Remaining manual checks

- Visual review of desktop 1280/1440 by a human: the browser pane was 400px
  wide, so desktop was certified by DOM measurement, not screenshot.
- A real iOS Safari / Android Chrome device:
  - Safe-area insets on a notched phone.
  - Tap-to-focus behavior.
  - Android hardware back: Radix Dialog has no back-button handling, so this
    is not implemented.
  - Real tablet coarse pointer at 768–1024.
- Real-account `/lol/history` with Ranked rows (a backend is needed).
  Currently covered by `LolHistory.test.tsx` and shared-component tests.
- Browser text-only zoom (the settings font size), as opposed to the root
  font-size simulation.
- Product decision: whether per-question outcome needs a non-color **visual**
  mark on the icon. It is already textual for screen readers and in the card.
  I didn't change the approved design.

## Integration notes for Workstream C

- Reuse `QuestionTimeline` as-is in Daily/Stage summaries. It picks the
  Popover or the Sheet itself, and fits pages to its own width. Give it a
  `min-w-0` flex/grid slot and a `justify-*` class via `className`.
- For §11 Daily/Stage rows, copy the row pattern: `[container-type:inline-size]`
  on the row plus `[@container(min-width:…)]:` variants. Tailwind needs literal
  class strings, so see `ROW_LAYOUT` in `RankedMatchRow.tsx`.
- `useMatchReviews` is safe to feed changing id lists (filters, pagination,
  the Daily/ordinary split). Removing Daily child matches from the ordinary
  Ranked id list is now harmless.
- `useCoarsePointer` / `QuestionReviewSheet` live in
  `workspace/QuestionReviewHost.tsx`. Don't build a second inspector.
- Files this branch touches, for merge planning: `QuestionTimeline.tsx`,
  `RankedMatchRow.tsx`, `useMatchReviews.ts`, plus the new
  `QuestionReviewHost.tsx` and the two new test files. `StudyHistoryLedger.tsx`
  is untouched.
