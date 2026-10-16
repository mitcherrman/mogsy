# JOURNEY_JUX1_HANDOFF

Mastery Journey UX (JUX1). The investigation is `JOURNEY_JUX1_INVESTIGATION.md` (primary checkout, 2026-10-15).

## Status

| Pass | Scope | State |
|---|---|---|
| **JUX-F2** | Calculation presentation (phone reveal) | Visual trial on branch `jux1/f2-calc-presentation` (9f0f20af); awaiting command-center review. Not in this branch. |
| **JUX-BOARD** | Compact (top-and-bottom) board polish | **Owner-approved.** Branch `jux1/compact-board-polish` (72abc6ea), merged into the JUX-F1 branch (merge commit b095063e). Not on `main`. |
| **JUX-F1** | Board attention: gold relevance ring, `!` kept, double-flash arrival, one-time `check board to see more` | **Built on branch `jux1/f1-board-attention`; awaiting owner review** (see the next section). Not merged, not published. |
| JUX-B1 | Backend-authoritative choices; no typed Journey answers | Queued (owner-approved, not started) |

Draft PR #46 is rejected and was not used. JUX-F2 is untouched and still on its own branch. JUX-F2 and this branch each append a final section to `src/index.css`, so integrating them needs a trivial merge of those appended blocks.

## JUX-F1: board attention

- **Branch:** `jux1/f1-board-attention`.
  - Based on frontend `main` f5f90c72, the latest at the time. It has no Journey change since 6407559a.
  - The owner-approved `jux1/compact-board-polish` is merged in (b095063e, clean, no conflicts), then JUX-F1 is committed on top.
- **Worktree:** `C:\Users\mlmit\mogzy-wt\jux1-f1`.
- **"Before" for every comparison:** b095063e (the approved board without F1).

### The approved language, as built

| Cue | Meaning | Source | Look |
|---|---|---|---|
| **Gold ring** | Relevant to the current question | the server's `focus` (unchanged `boardAttention`) | a continuous ring (`--jattn-ring: 255 208 88`) drawn as an inset line in the object's outset box (2px compact, 3px wide) plus a soft glow. It sits just outside the object, never over its art, caption or `!`. No animation, no blinking. Abilities, portraits, the level chip and items, on both board densities. The State sheet's question outline (`.journey-focus`) uses the same gold. |
| **Gold `!`** | Acquired knowledge | K2 knowledge (unchanged) | unchanged; stays for the rest of the Journey and still opens its card. A relevant object with knowledge shows both. Items and level changes never get one. |
| **Double flash** | New information arriving | a fact a reveal saved (`useSavedNow`, live only) or a purchase watched live (new `useItemArrivals`) | the object itself (ability tile, portrait or item slot, never the board) flashes white into gold, `380ms × 2` iterations, then stops. Reduced motion: a still white-gold edge for the 1.6s arrival window. |
| **Guide** | Once per browser | existing Mogzy Guide coach (`useBoardCoach`) | text exactly `check board to see more`, for every pointer. New storage id `board-check-more-v1`. Armed by the first arrival of either kind. The existing safeguards are unchanged: never on the clock, at least 2s of clock-free time, dismissed by tap, Escape or TTL, waits for an open popover to close. |

**Arrival lifecycle (why it is tied to real new information).**
- **Knowledge:**
  - `useSavedNow` marks a fact only when it arrives in K2 while its own child's reveal is on screen.
  - The first render seeds silently, so a reload or resume mid-reveal replays nothing.
- **Purchases:** `useItemArrivals` keys each purchase by its transition (`fromNode>toNode@beat.until`) and slot.
  - The first render seeds silently.
  - A poll re-delivering the same state, a rerender, stepping back and forward, or a later question flashes nothing.
- **Mounting:** the board is keyed per Journey (`journeyKey`), not per question, so live arrivals are never swallowed by a remount.
- **Timing:** the server's transition timing is untouched. Saved facts arrive in the reveal hold; purchases at the start of the beat.

### Legacy decorations: audit and decisions

| Decoration | Decision | Why |
|---|---|---|
| Ice relevance rails (`.journey-reticle` ::before/::after, draw-in animation) | **Replaced** by the gold ring (same element, same `focus` source) | approved |
| Green CHANGED inner rim (`.journey-changed::after`) on ability tiles and item slots | **Removed** (the class and `data-new` stay on the object) | approved; the values still say what changed |
| Green beat pulse on changed objects and on the level chip (`journey-changed-pulse`) | **Removed** | a green flash; it competed with the double flash |
| Green tint on the board's level chip (`journey-chip--delta`) | **Neutralised on the board** (the State sheet / popup stat chips keep theirs) | a green changed rim; the struck-through old level ("LV ~~3~~ 4") still shows the change |
| Transient gold "SAVED" tag (1.6s) | **Removed** | the double flash marks the same object at the same moment from the same source. The permanent `!` and the existing polite "Saved to the board: …" screen-reader line keep the information. **No meaningful information loss.** |
| `!` pop-in (`journey-know-pop`) and the coach's 3 `!` pulses (`journey-know-coach`) | **Removed** | competing animations; "exactly two flashes" |
| New item's scale-pop (`journey-item-in`) | **Removed** | competing arrival animation for the same object |
| Green NEW rank digit / green new pips | **Kept** | it is the rank value itself and says which rank just went up. Removing it would lose information. |
| Struck-through previous level | **Kept** | a state value |
| Item "+stat" gain tag and the purchase narration line | **Kept** | purchase notifications (required to be preserved) |
| Unlock lock-lift (`journey-unlock-*`) | **Kept** | the state change of an unlocked ability; not a highlight and not green |

### Files

- `src/components/journey/useItemArrivals.ts`: **new**, live purchase arrivals.
- `src/components/journey/JourneyStateBoard.tsx`:
  - `data-arrival` on the ability and portrait hosts (new test ids `journey-ability-host-*` and `journey-portrait-host-*`) and, via `arrivedSlots`, on the item slots;
  - the `SavedTag` component removed;
  - the coach armed by any arrival.
- `src/components/journey/JourneyPrimitives.tsx`: the `arrivedSlots` prop → `data-arrival` on the slot; doc comments.
- `src/components/journey/useKnowledgeCoach.ts`: exact copy `BOARD_COACH_TEXT`, new id `board-check-more-v1`.
- `src/components/journey/useSavedNow.ts`: doc comment only.
- `src/index.css`:
  - the JATTN1 attention block rewritten (ring, no rim, no rails, no Saved tag);
  - the beat pulse, item pop, `!` pop and coach pulse removed;
  - the compact caption moved 1px down to clear the ring;
  - new final section "JUX1-F1 — ARRIVING: THE DOUBLE FLASH".
- Tests, updated deliberately to the new contract: `masterySliceModule.jattn1.test.tsx`, `.jattn1DeployCompat.test.tsx`, `.boardCoach.test.tsx` (exact text), `.motion.test.tsx`. Two new item-arrival tests are added to `jattn1`.
- `docs/handoffs/jux1-f1/`: the evidence (below).

### Verification (real JATTN1 captures, headless Edge, harness controls hidden)

**Before/after sheets** (`docs/handoffs/jux1-f1/<viewport>__attention-before-after.jpg`): 7 states each at 360×640, 360×740, 390×844 (stacked board), 509×709 and 1280×800 (side-by-side board).

Every combination appears in them:

| Combination | Where |
|---|---|
| Relevant only | Zed–Ahri Step 1: Zed E; Pantheon–Leona open: Pantheon E |
| Learned only | Pantheon–Leona transition: Leona portrait `!` |
| Relevant and learned | Zed–Ahri Step 2: Zed E; Pantheon–Leona: Leona portrait; Ashe–Jinx: Ashe W, Jinx portrait |
| Newly purchased item | Pantheon–Leona transition (Leona's item, no green rim) + the flash strip |
| Newly acquired ability knowledge | Zed–Ahri first reveal (Zed E) + the flash strip |
| No highlight | every other object (for example 9 of 11 objects in Ashe–Jinx) |
| Two-flash arrival | the flash traces and frame strips |

**Arrival double flash** (`flash-probe.cjs`). Each case plays one step forward live and samples the object's brightness on every animation frame (~16ms):

| Case | Flashes | Flash starts | Replay on back/forward | Replay on reload |
|---|---|---|---|---|
| Zed E knowledge, 360×640 | **2** | 157 / 532ms | none | none |
| Ahri portrait knowledge, 360×640 | **2** | 163 / 541ms | none | none |
| Leona item purchase, 360×640 | **2** | 139 / 523ms | none | none |
| Zed E knowledge, 509×709 (side-by-side) | **2** | 273 / 648ms | none | none |
| Leona item purchase, 1280×800 | **2** | 159 / 560ms | none | none |

- Only the arriving object flashes. The ring, the `!` and the board do not.
- Peak brightness is 1.55; after the second flash the object is steady.
- **Reduced motion:** no animation; a still white-gold edge, gone after the window.
- **Traces and frames:** `ability-knowledge-360x640__flash-trace.png` and `item-purchase-360x640__flash-trace.png` (two peaks, then flat), and `*__flash-frames.jpg` (board frames about every 110ms).

**Guide.**
- It appeared with exactly `check board to see more` on the first knowledge arrival in a fresh browser.
- For a purchase-only first arrival, the beat leaves less than the 2s safeguard. The coach then waits, latched, for the next clock-free window: the existing behaviour, unchanged.

**Geometry.**
- Board and page heights are identical to the before tree in all 35 scene/viewport pairs.
- **Side-by-side board:** no element moved. The only differences are portrait-host boxes reported under their new test ids at identical positions.
- **Stacked board:** the rows shift 0.5px once, from the caption's 1px move to clear the ring. Positions are still identical across open, beat and reveal.

**Interaction and accessibility (360×640).**
- A ringed `!` ability, an item and a ringed portrait open their popovers. The ring has `pointer-events: none`.
- Accessible names still end "relevant to this question".
- The flash and ring are decorative. The polite "Saved to the board: …" line is unchanged.

### Tests

- **Journey unit set (51 files).**
  - F1: 761 passed, 2 failed. Before (b095063e): 759 passed, 2 failed. The 2 are the same pre-existing JSPACE1-related stylesheet tests on both.
  - Updated to the new contract: 17 assertions across 4 files (Saved tag → arrival, ice → gold, green rim → none, reduced-motion rules, exact coach text).
  - New: 2 item-arrival tests (live once; nothing on a mount, a re-delivered poll or later questions).
  - The reduced-motion convention tests (animations only under `prefers-reduced-motion: no-preference`) pass: the flash is declared only there.
- **Browser geometry e2e (`e2e/journey-mobile-space.spec.ts`):** 26/26 on F1, 26/26 on the before tree.
- **`tsc -p tsconfig.app.json`:** the same 2 errors as main (`OnboardingProfile.tsx`, `identity/connections.ts`).
- **eslint on the changed files:** 0 errors; the same 1 pre-existing warning in `JourneyPrimitives.tsx`.

### Open points for the owner

1. The ring's gold (`255 208 88`) is deliberately brighter and yellower than the `!` badge (`232 201 122`), so "relevant" and "learned" never read as one cue.
2. A purchase-only first arrival defers the one-time guide to the next clock-free window, which is the existing 2s safeguard. Say if it should instead show during short beats.
3. The State sheet's question outline now uses the same gold as the board's ring. It was ice; changed for one language. Easy to revert if the sheet should differ.

## JUX-BOARD: compact board polish

- **Branch:** `jux1/compact-board-polish`, based on frontend `main` ddd0f69f. Main had no Journey change since 6407559a. Worktree `C:\Users\mlmit\mogzy-wt\jux1-board`.
- **Scope:**
  - only the existing compact (stacked) board, `@container (max-width: 25.99rem)`;
  - the breakpoint is unchanged;
  - the side-by-side board (≥26rem: 509px and up) has no new rule.
- **Unchanged:** server state, calculations, grading, timers, answer controls, transitions, board height.

### What was wrong on main (measured, real captures, Daily phone shell)

**360×640 (160px board).**
- The short compact tier draws 16px ability tiles, 16px item slots and a 26px portrait.
- Each ability tile's rank digit covers the whole 16px tile, so no ability art is visible.
- About 91px of the ability row is unused.

**360×740 (190px board).**
- The four 24px tiles need 111px, but the kit column gets 99px.
- The R tile runs about 4px under the first item slot.

**All compact sizes.**
- Every tile carries its rank digit (top-left), slot letter (bottom-right) and often the `!` (top-right) on top of the art.

### What changed

**One row budget, from the row's real width.**
- The portrait is fixed per height tier: 34px on the short tier, 38px on the tall tier.
- The four abilities and six item slots share the rest. An item slot is 0.8 of an ability:
  - `--jb-ability = clamp(20px, (row width − portrait − gaps) / 8.8, 30px)`.
- So the row always fits its box, at every phone width.

**The slot letter and rank leave the art.**
- They become a small key-cap caption under each tile: `[Q|2]`, with a gold letter and the rank in dark.
- The rank half turns green while the rank is new, which is the same CHANGED signal as before.
- A locked ability shows its letter alone, dimmed, under a greyed tile with a lock.
- The art is whole. The `!` keeps its corner and its whole-tile hit area.
- If a server ever sends a maximum rank, the pips under the tile keep the original layout; no current capture does.

**The JATTN1 cues keep their meaning and look.**
- Green rim: changed. Gold `!` and "Saved" tag: saved. Ice rails above and below: relevant.
- The caption starts below the ice rail's lower bar, never under it.

**Name line.** 12px instead of 10px on the short tier.

**Files.**
- `src/components/journey/JourneyPrimitives.tsx`: class hooks only (`journey-ability__tile`, `__art`, `__slot`). The DOM and labels are otherwise identical, and the side-by-side board has no rule for these classes.
- `src/index.css`: new final section "JUX1 — THE COMPACT (TOP-AND-BOTTOM) BOARD, REFINED."
- `src/components/journey/JourneyCompactBoard.jux1.test.tsx`: new, 6 tests (hooks, tile content per state, stylesheet confined to the compact query, no height or scroll or hiding).
- `docs/handoffs/jux1-compact-board/*.jpg`: BEFORE/AFTER sheets per viewport.

### Measurements (headless Edge, DPR 3, reduced motion, real JATTN1 captures, harness controls hidden)

Scenes:
- Pantheon–Leona: question open with ice focus; transition beat (item purchase); reveal (level-ups, new ranks, saved `!`).
- Zed–Ahri: first question; armor reveal.
- Ashe–Jinx extended, late Journey (all ranks, items).

Pantheon's row:

| Viewport | Ability tile | Item slot | Portrait | Gap, R tile → first item |
|---|---|---|---|---|
| 360×640 | 16 → **26.1** | 16 → **20.9** | 26 → **34** | 91 → 6 |
| 360×740 | 24 → **24.8** | 22 → 19.8 | 40 → 38 | **−4 (overlap) → +8** |
| 390×844 | 24 → **28.2** | 22 → **22.5** | 40 → 38 | 26 → 8 |

- **Board and page height:** identical to main in all 18 compact scene/viewport pairs (160 / 190 / 200px). No horizontal page scroll.
- **Row contents:** no tile, caption, item, name or portrait leaves its row. The board's 4px/2px decorative overflow is identical on main and within the e2e tolerance.
- **No shift between states:** for every ability, item, portrait and side, the open, beat and reveal states differ by 0.0px on the branch (and on main).
- **Side-by-side board unchanged:** at 509×709 and 1280×800, **0 of 36–43** measured board elements differ in position or size from main, in all 6 scenes.
- **Interaction at 360×640:** tapping an ability tile opens its knowledge card (the `!` hit area still spans the tile). The item reference and the portrait popup open.

### Tests

- **Journey unit set (51 files, now including `src/features/mastery/player`).**
  - Branch: 759 passed, 2 failed. Main: 753 passed, 2 failed. The 2 are the same pre-existing JSPACE1-related stylesheet tests on both (see JUX-F2 below).
  - The 6 new tests pass.
- **Browser geometry e2e (`e2e/journey-mobile-space.spec.ts`):** 26/26 on the branch, 26/26 on main.
  - It covers board objects inside the board, board scroll ≤4px, answer buttons above the dock at 509 and 360×740, and equation nodes in the reveal.
- **`tsc -p tsconfig.app.json`:** the same 2 errors as main (`OnboardingProfile.tsx`, `identity/connections.ts`).
- **eslint on the changed files:** 0 errors, and the same 1 pre-existing warning in `JourneyPrimitives.tsx`.

### Tradeoffs for review

1. **At 360×740 the abilities grow only 0.8px**, because width is the limit there. The gain is the uncovered art and the removed overlap. Items shrink 22 → 19.8px and the portrait 40 → 38px to pay for the fit.
2. **The `[Q|2]` caption is 11px tall under each tile.** It uses height that was empty in every compact row.
3. **The portrait is 34px on the short tier, still smaller than the 38–40px of the tall tier.** That is a choice to give the abilities the width.

## JUX-F2: what changed (on branch `jux1/f2-calc-presentation`, not in this branch)

- **Branch:** `jux1/f2-calc-presentation`, based on frontend `main` 6407559a. Worktree `C:\Users\mlmit\mogzy-wt\jux1-f2`.
- **Scope:** phones (<640px) during the answer reveal only. Before submission nothing changes.
- **The tablets:** they keep their box but are hidden (`visibility: hidden`). This keeps the question box, stage, board and timeline at their exact heights.
- **The reveal takes the whole question box, top-down:**
  1. the verdict;
  2. the **answer strip**;
  3. the chain's subject and served formula;
  4. the chain.
  - The strip sits on the verdict line's fixed height, so the chain unfolding or compressing never moves it.
  - Spare height falls at the box's foot. On a short phone that is where the sticky match bar sits, so the bar covers empty parchment, not the answers.
- **The answer strip** (`JourneyAnswerStrip`) renders inside the reveal's verdict line and polite region:
  - it shows the player's answer and the correct answer exactly as their tablets drew them, in the tablets' reveal tones;
  - correct: one item, "Your answer · correct";
  - wrong: "Your answer" and "Correct answer";
  - timeout: "Your answer: No answer" and "Correct answer";
  - labels longer than 16 characters (damage-formula options) stack the two items full width.
- **The calculation (same Reasoning Chain, same served values, nothing computed):**
  - the served raw-damage formula and the "Exact" label are drawn again (on main they are `display:none` on phones);
  - node labels are whole (no 2-line clamp) at 10px instead of 8px;
  - text wraps only between words;
  - nothing scrolls.
- **Tablet (640–1023) and desktop:** unchanged. The strip is `display:none` there, and every new rule sits under `@media (max-width: 639.98px)`.

### Files

- `src/components/journey/JourneyStageQuestion.tsx`: `JourneyAnswerStrip`; a `strip` slot in `JourneyReveal`'s verdict line.
- `src/index.css`: new final section "JUX1-F2 — A PHONE'S REVEAL TAKES THE ANSWER REGION".
- `src/lib/ranked-core/modules/masterySliceModule.jux1.test.tsx`: new, 12 tests (strip content per outcome, long labels, placement, stylesheet contract).
- `docs/handoffs/jux1-f2/*.jpg`: before|after composites, 5 scenarios × 4 phone sizes.

## Verification (real JATTN1 captures through `/dev/journey-arena`, headless Edge, DPR 2)

**Fit sweep.** Every reveal of 6 captures was checked, 31 reveals per viewport: Pantheon E into Leona (the longest armor working), Zed/Ahri reference, the wrong-answer and timeout variants, Ashe/Jinx extended wrong, and Volibear Survival.

Each reveal was checked for:
- content overflow or spill;
- `display:none` wording;
- line clamps, ellipses, clipped text;
- mid-word breaking;
- strip position;
- stage and page height against the open question before it;
- clearance above the sticky match bar.

| Viewport | main: clean reveals | branch: clean reveals | branch reveal box | stage / page height change |
|---|---|---|---|---|
| 509×709 | 15/31 | **31/31** | 368px (was 148) | 0 / 0 |
| 390×844 | 15/31 | **31/31** | 436px (was 148) | 0 / 0 |
| 360×740 | 15/31 | **31/31** | 376px (was 148) | 0 / 0 |
| 360×640 | 15/31 (+11 with 5px overflow) | **31/31** | 356px (was 128) | 0 / 0 |
| 768×1024 | 30/31 | 30/31 (identical) | 112px | 0 / 0 |
| 1280×800 | 30/31 | 30/31 (identical) | 128px | 0 / 0 |

- On main, the phone defects are the hidden raw-damage formula, the hidden "Exact" label, the clamped labels, and a 5px overflow of the armor chain at 360×640.

**Sticky match bar (360×640).**
- On main the correct tablet is covered by the bar in 11/31 reveals (by up to 21px).
- On the branch the strip is never covered (at least 177px clear), nor is the last line of working (at least 77px clear).
- At 360×740 and above, nothing is covered on either tree.

**Strip stability.** At 360×640, toggling the chain between expanded and compressed leaves the strip at the same y. The 3px drift of the first trial build is fixed.

**Desktop.** The 1280×800 before/after screenshots differ only by the equation-unfold animation phase at capture time. The sweep's geometry and defects at 1280 and 768 are identical to main.

**Unit tests (Journey set, 44 files).**
- Branch: 707 passed, 2 failed.
- Main: 695 passed, 2 failed (the same 2).
- Both failures are pre-existing on main:
  - `masterySliceModule.jp5.test.tsx`: "JP5 sets no stage reserve" (it reads JSPACE1's later phone rules);
  - `masterySliceModule.visualLanguage.test.tsx`: "tablets' polish changes no geometry" (JSPACE1 padding).
- `src/index.css` must have LF endings in the working copy (an `autocrlf` checkout gives CRLF and adds 2 more baseline failures).

**TypeScript and lint.**
- `tsc -p tsconfig.app.json`: 2 errors, both on main as well (`OnboardingProfile.tsx`, `identity/connections.ts`).
- eslint on the changed files: 0 errors; the 4 warnings in `JourneyStageQuestion.tsx` are the same as on main.

**Browser e2e (`e2e/journey-mobile-space.spec.ts`).** 26/26 on the branch and 26/26 on main.
- The suite is the JSPACE1 Daily-host phone geometry at the four viewports, including the equation-node containment and the 509px 3+3 chain.
- Run with a scratch copy of `playwright.journey-mobile.config.ts` using the Edge channel and the wasm hook.

Machine notes: vitest and vite need the rollup wasm hook and the no-SWC config (`MEMORY: rollup-native-blocked-wasm-hook`, `shared-swc-broken-vitest-workaround`).

## Decisions and tradeoffs for review

1. **The strip sits under the verdict, not where the tablets were.** Pinned to the bottom, it was hidden behind the 360×640 match bar and moved 3px when the chain folded.
2. **On a correct answer the strip and the verdict both show the value.** This keeps one strip shape for every outcome. The verdict's "· 90" could be dropped on phones if the duplication bothers review.
3. **Tablet width (768) is unchanged and still ellipsizes one long raw-damage caption** (Volibear Survival child 2). This defect is outside the approved phone scope, and the same caption is ellipsized at 1280.
4. **A future fix of the pre-existing JP5 stylesheet test must exempt this section.** The test forbids any `data-surface-region` rule after the JP5 header, but this section intentionally hides the answer region during a phone reveal.

## Next

- Command-center review of this visual trial: `docs/handoffs/jux1-f2/`, and the full sweep under `C:\Users\mlmit\mogzy-wt\jux-audit-shots\` (`FINAL_FIT.txt`).
- After approval: integrate F2, then JUX-B1 (backend choices), then JUX-F1 (flash and message).
