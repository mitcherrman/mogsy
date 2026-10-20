# Match History V2.1 — Mastery review navigator (handoff)

Branch: `history-v21/mastery-review-navigator` · Base: `origin/main` e0fa3fa7 (instruction cited 9dfdaa33, an ancestor; fetched and branched from the newer tip).
Scope: frontend only. No backend, contract, premium-entitlement or history-statistics change.

## Objective
Replace the cramped, scrolling 29rem popover that stacked every Mastery challenge with a larger inspector that shows **one Mastery question at a time**, behind a numbered selector with Previous/Next.

## Decisions
1. **State ownership.** The selected challenge is `MasterySliceBody`'s own `useState`, not the host's. Both hosts (Radix Popover, fine pointer; modal Sheet, touch) render the same card, so desktop and mobile are identical by construction. The card keys the body on `position:roundNumber:challengeIndexes`, so a different round — and every close/reopen, since both hosts unmount the card — starts at question 1. No host, timeline or `QuestionContext` state was added.
2. **Semantics.** WAI-ARIA tablist (automatic activation): numbers = tabs, the challenge = `tabpanel` labelled by its tab. Roving tabindex (one tab stop); Left/Right/Up/Down/Home/End move and select, clamped. Previous/Next are native buttons that use `aria-disabled` (never `disabled`) at the ends so a focused control does not drop focus inside a modal sheet.
3. **Status without leaks.** Status comes from the same reveal-gated facts the card prints: `correct` / `incorrect` / `unanswered` only when `round.revealed && correctAnswer !== null`; **everything else is `sealed`** — no glyph, no tint, no `data-status` word, aria name exactly "Question n of N". Every judged status also has its own glyph (✓ ✕ –) and a spoken word; colour is never the only signal.
4. **Single / zero challenge.** One challenge: shown directly, no selector (as before). Zero: result line only, no crash.
5. **Popover box.** `REVIEW_POPOVER_CLASS` (exported from `questionTimelineParts.tsx`, used by both `QuestionPopover` and `QuestionInspector`): `w-[min(42rem,calc(100vw-2rem))]`, `max-h-[min(85dvh,var(--radix-popper-available-height))]`, `p-4`. The Radix measured space is still the real ceiling, so a row near an edge shrinks the card (it scrolls inside) and never overflows. The mobile Sheet is unchanged (bottom sheet, 85dvh, 32rem).
6. **No jump under the pointer.** An anchored popover that grows upward would move the selector while the reader clicks. The question panel keeps a `min-height` equal to the tallest challenge seen so far (ResizeObserver ratchet, capped at `min(Npx, 24rem, 45dvh)`); it resets with the round. Changing question scrolls an internally scrolled host back to its top, where the selector is.
7. **History footer.** The sticky "In your History" bar is now a quiet single line: hairline instead of a drop shadow, 9px/10.5px lighter weight, smaller chevron; offsets updated for the 1rem popover padding. The multi-occurrence list uses `auto-fit minmax(15rem)` columns so it is shorter in a wide card. Facts, premium gating and `scrollIntoView` behaviour are unchanged. History data is **not** duplicated per challenge (it stays one footer under the card).
8. **Typography.** Mastery question 14px, working 12px, explanation 12px; the answer pair / choices / values / working / explanation structure and every `review-mastery-*` test id are preserved.
9. **Other families untouched.** Order Forge, Reconstruct, Scrub, Match, Assembly, Meta Reflex and ordinary quiz rounds render exactly as before (Meta Reflex keeps its `Pips`).

## Contracts changed on purpose
- `review-mastery-ordinal-N` ("1/2" tag inside the question line) and the Mastery `review-pips` are **removed**: the selector's position text and per-number status replace them. (`review-pips` remains on Meta Reflex.)
- Mastery challenges other than the selected one are no longer in the DOM (`review-mastery-your-answer-1` etc. exist only while challenge 2 is selected). Existing tests that read several challenges now click the selector first.
- "no answerable control" now means: the only buttons are the selector's (choose which frozen record to read); no radio/checkbox/textbox.

## New test ids
`review-mastery-nav`, `review-mastery-selector` (tablist), `review-mastery-select-{1..N}` (+ `data-status`, `data-selected`), `review-mastery-position` ("Question 3 of 5"), `review-mastery-prev`, `review-mastery-next`, `review-mastery-panel` (`data-selected-index`).

## Files
- new `src/components/quiz/workspace/MasteryQuestionNavigator.tsx`
- `QuestionReviewCard.tsx` (`MasteryChallenge`, `MasterySliceBody`, `masteryNavStatus`, `scrollParentOf`, keyed body)
- `questionTimelineParts.tsx`, `QuestionInspector.tsx` (shared popover class)
- `analytics/QuestionContext.tsx` (footer)
- tests: new `QuestionReviewCard.masteryNavigator.test.tsx` (18); updated `QuestionReviewCard.mastery/hierarchy`, `QuestionTimeline`, `reviewRoles.rq1`
- CI: `e2e/history-review/{fixtures.ts,review-inspector.spec.ts}` (new `mastery-five` fixture; new bounds; ~12 new test shapes), `.github/workflows/history-review-acceptance.yml` (path filters)

## Verification (local, no browsers — AGENTS.md)
- Vitest: `src/components/quiz/workspace`, `src/lib/ranked-public`, the two `masterySliceModule.dataDuel*` suites, `src/pages/quiz-ranked`: **122 files / 1582 tests pass**.
- `tsc -p tsconfig.app.json`: 2 errors, both pre-existing and unrelated (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`; identical to Track A's baseline).
- eslint on touched files: 0 errors; the one `react-refresh/only-export-components` warning in `QuestionContext.tsx` (`contextSummary`) is pre-existing.
- Not run locally by design: Playwright. Browser acceptance is the GitHub Actions workflow "History Review Acceptance".

## CI evidence
Run 1 (39352448750, tip 495d6ecc): 146 passed, 5 failed. Fixes in the next commit:
1. **Mobile selector x3 (spec line ~446)** — test-ordering bug. The per-question loop ends on question 5, so `Next` is correctly `aria-disabled` and Playwright (correctly) will not click it. UI unchanged; the spec now asserts the disabled end state, proves a forced activation changes nothing, then walks back with Previous and forward with Next.
2. **200% text at 320px** — the answer pair grid used `minmax(9.5rem,1fr)`; at a 32px root that is 304px, wider than the 256px content box (tiles at x=33..337 in a 320 host). Now `minmax(min(9.5rem,100%),1fr)` (same for the Choices chip grid): identical at 100% text, one wrapping column when the container is narrower than a tile. Pre-existing Track A sizing, newly exposed by this PR's 200% test.
3. **Missing-art test** — two causes. (a) The spec routed art only for `http://127.0.0.1:8000/**`, but the tracked `.env` has `VITE_COMBAT_API_URL=https://web-production-83e53.up.railway.app` (since 2026-05-22), so in CI the image went to the real production host and the interception never applied; the spec now routes `**/art/*.png` on any host. (b) A proven image that fails to load left a broken-image glyph in the card header; `SubjectMark` now drops a failed image (no substitute picture; the module sigil/none rules are unchanged). Unit test added.

## Not covered by the browser harness
The real History footer (`QuestionContext`) needs a `DailyHistoryRecord`; the harness renders `QuestionInspector` only. The footer restyle is covered by the existing `QuestionContext`/DailyHistory unit tests (all pass) but has no screenshot.

## Next steps
1. Inspect the CI screenshots (`history-review-evidence` artifact) for hierarchy/spacing; adjust.
2. Owner review of the selector look and the removed ordinal/pips.
3. Do not merge or deploy before browser acceptance is verified.
