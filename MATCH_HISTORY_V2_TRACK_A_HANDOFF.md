# Match History V2 — Track A (UI) handoff

Branch: `history-v2/a-ui-20261019` · Base: `19ef674e` (main, per command-center handoff)
Scope: `src/components/quiz/workspace/QuestionReviewCard.tsx` + focused tests only. No host, timeline, QuestionContext, history stats or backend edits.

## What changed (all inside the card)
1. **Answer pair.** "Your answer" and "Correct answer" are now two tiles side by side (`grid auto-fit minmax(9.5rem)`; one column only when the *container* is narrower, e.g. 320px). Value is the largest text after the question; icon + label + sr-only verdict word (colour is never the only signal). Own-wrong-answer derivation sits inside the "Your answer" tile.
2. **Choices strip.** Frozen options are all kept (same `review-options`, `data-review-option`, `data-option-state`, "yours") but sit *under* the pair as a reference strip: chips when every option ≤14 chars (4 prices = one line), full rows for sentences. Fixes Leona-armor "4 option rows + 2 repeated answer lines".
3. **Verdict chip** in the heading line (`review-outcome`: Correct / Incorrect / Partial / Unanswered / Not played out). `data-outcome` and timeline tint (`questionOutcome`) unchanged — Partial is display-only.
4. **Sealed correctness fix.** A pick on an unrevealed round was printed red (judged against a null answer). It is now `pending` (neutral). Green/red only against a revealed answer.
5. **Mastery slice.** Same pair+choices per challenge, `n/N` ordinal and hairline between challenges, pips next to "x of y right" (Meta Reflex too). Pips are decorative (`aria-hidden`).
6. **Combat (Pantheon E vs Leona).** The served `combatWorking` renders via the existing `JourneyCombatWorking rows` (Journey reveal's own 3-line form) in an inset. The dense frozen sentence ("…after armor at Leona target, 4 target level…") is **kept verbatim** but folded behind a native `<details>` "Full explanation" *only when structured working is shown*. Rows without working are unchanged (visible "Explanation").
7. **Working (quiz).** Inset, wrapped, closing total ruled off.
8. **Subject mark** (18px) in the heading: `resolveQuestionIcon(round.iconHint)` — the *same* resolver as the timeline icon. Proven entity art as-is; category tile muted like the timeline; module sigil / Meta Reflex bolt; **nothing** when art is unproven. No new imagery, no champion/ability inferred.
9. Meta Reflex card sides: check/cross icons for correct/picked; label clamps at 2 lines instead of truncating at 1.

## Preserved contracts
All existing test IDs and data attributes (`question-review-card`, `review-position`, `review-your-answer`, `review-correct-answer`, `review-unresolved`, `review-options`, `review-working`, `review-explanation`, `review-mastery-*`, `review-cards`, family bodies untouched). Fixed `Q{n} of {total}` text. Sealed text unchanged. No answerable control (no button/radio/input; `<summary>` is the only focusable addition). Popover/sheet sizing is host-owned and untouched; the card is shorter, not taller.

## Needs owner/integration attention
- **Decision to confirm:** folding the combat prose behind `<details>` (item 6). Revert = render the `else` branch always (one conditional in `MasterySliceBody`).
- Order Forge, Reconstruct, Scrub, Match, Assembly bodies were studied but intentionally not restyled beyond the shared heading/chip (already icon-marked, tested, low pain).
- `QuestionContext` / host / timeline untouched; header now ~4px taller when a mark shows (18px icon vs ~12px text row).
- No browser screenshots (AGENTS.md: no local browsers). Needs CI visual pass at 320/360/390 + desktop popover (max-h 24rem) incl. keyboard Tab through `<summary>`.

## Tests
New: `QuestionReviewCard.hierarchy.test.tsx` (27). Existing card, timeline, host, ownership, combat-working, DailyHistory, LeaguecraftWorkspace suites pass. Wider run (`quiz`, `ranked-public`, `ranked-core/modules`, `pages/quiz-ranked`, `ranked-arena`): 19 failures in 9 CSS/source-structure files that fail identically on the base card file (pre-existing). `tsc`: 2 pre-existing errors (OnboardingProfile, identity/connections), none in touched files. eslint clean.
