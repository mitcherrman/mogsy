# JOURNEY_JUX1_HANDOFF

Mastery Journey UX (JUX1). The investigation is `JOURNEY_JUX1_INVESTIGATION.md` (primary checkout, 2026-10-15).

## Status

| Pass | Scope | State |
|---|---|---|
| **JUX-F2** | Calculation presentation (phone reveal) | **Visual trial built; awaiting command-center review.** Not merged, not published. |
| JUX-F1 | Flash newly inspectable objects (white/yellow); show exactly `check board to see more` once | Queued (owner-approved, not started) |
| JUX-B1 | Backend-authoritative choices; no typed Journey answers | Queued (owner-approved, not started) |

Draft PR #46 is rejected and was not used.

## JUX-F2: what changed

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
