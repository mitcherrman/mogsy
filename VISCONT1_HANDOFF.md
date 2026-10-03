# VISCONT1 — Arena visual continuity (geometry certification)

Worktree `.worktrees/viscont1`, branch `viscont1/visual-continuity`. Committed locally; **not merged, not pushed, not published to Lovable**.
Baseline for every comparison: `.worktrees/viscont1-baseline`, detached at the same base, with the extended probe copied in uncommitted so both trees were measured through the same instrument.

## Objective
Within one arena mode and one viewport, changing the question must not move what a player's eyes and cursor track.
The anchors are the folio top and bottom, the media region top and bottom, the prompt top, the answer-grid top, the first tablet and the Module Rail.
The only allowed exception is content that genuinely cannot fit.
This is an Arena-wide invariant, fixed at the narrowest shared geometry authority (`index.css`, Question Stage). There are no per-family, per-question or Daily-specific offsets.

## Base
`origin/main` @ `53159f2c` ("docs(journey): JPX + JL1 integration handoff and screenshots"), fetched 2026-10-02 and verified as the tip.

## Verified root causes (all measured in Chromium through `/dev/ranked-shell-probe`)
1. **The media region was allocated per band profile.** QV1 gave `data-band="cinematic"`/`"family"` a 17.25rem region at ≥1024×861 and a 19rem region at ≥1600×780.
   `compact` kept 16rem. At 1880×900 a rich round's region was 48px taller than a compact round's.
2. **The question was centred on its content height.** `CanonicalArena` wraps the surface in `lg:my-auto`.
   Any content-height difference therefore moved every anchor by half of it, while the folio and Module Rail (all ARENA1's test measured) stayed still.
   At 1880×900, rich vs compact moved the art top −27.6px and the prompt and answers +20.4px.
   Option-media grids, long prompts and the reveal's evidence line each re-centred the card too. The reveal moved the whole stack 14.3px on every settlement.
3. **QV1 raised type and padding without paying for them in the reserves.**
   - The 19px prompt from `lg` makes the 192-character RA7 family prompt 5 lines at 1024 (156.7px against a 152px reserve).
   - It makes the bank's 188-character maximum 4 lines from 1280 (129.2px against 124).
   - The 24px wide-tier prompt makes the same prompts 148.6px against 136.
   - 18px wide-tier padding makes a 2×2 option-media grid 142px against 120.
   - 14px padding at the 861 tier makes the RCP1 item grid 167.5px at 1024 against 138.
   A region that overflows its reserve moves everything below it.
4. **Phone (RMOB2).** The phone folio is screen-tall and centres the question with `margin-block: auto`, on its content height, with no reserves.
   The plate (64px) vs the cinematic band (121px), 2 vs 4 stacked tablets, and prompt length each re-centred everything. At 375×812 the answer grid ranged 361–466px across ordinary rounds, and reveals moved it 12px.

Audited and proven **not** to move anchors once the above is fixed:
- **Asset load and failure (`?broken=1`).** Box identical; the band's box is declared.
- **The `--qs-media-max`/`scenario-hero` caps.** These size the band *inside* a fixed region.
- **The RS2 4-stacked padding exception.** Below the answer top.
- **RS2 sliver suppression.** A size container; no geometry.
- **QuestionResultOverlay.** Absolute.
- **The Stat Check level slot.** SC-RENAME3, re-certified below.

## Chosen geometry contract (`src/index.css`)
- **One allocation per viewport.** `--qs-media-h`, `--qs-prompt-h` and `--qs-answers-h` are set on `.ranked-question-stage` by width and height only.
  - 16rem from `lg`, 17.25rem at ≥1024×861 and 19rem at ≥1600×780, for every profile.
  - No rule keyed on `data-band` may size anything (structural test guard).
  - Rich art keeps all of QV1's allocation. The compact plate fills the same box (it has grown into its region since RR1), and the context strip still seats at 7rem.
- **Reserves re-derived to the ordinary corpus:**

  | tier | prompt | answers |
  |---|---|---|
  | ≥1024 | 9.875rem (158) | 8.625rem (138) |
  | ≥1280 | 8.125rem (130) | 7.5rem |
  | ≥1500 | 8.5rem (unchanged) | — |
  | ≥1024×861 | — | 10.5rem |
  | ≥1280×861 | — | 8rem |
  | ≥1600×780 | 9.375rem | 9rem |

- **The reserve is seated, not the content.**
  - `--qs-stack-h` = media + prompt + answers + 3 gaps + feedback slot.
  - A `::before` spacer of `max(0, (body − stack-h) / 2)` replaces the content-centring top margin for the canonical quiz stack only (`body > * > .question-surface-stack`).
  - Content that outgrows a region extends downward. When it genuinely cannot fit, the media region yields (the RM1 order) and the art's top, the folio and the rail still do not move.
  - Meta Reflex, Order Forge, Mastery and Journey are not matched and keep their own placement.
- **Reveal slot.** The one post-answer line Ranked and the hosted Daily mount (the evidence statement, `text-xs leading-snug`) has a held `::after` slot while it is absent. This is the SC-RENAME3 pattern.
- **Phone.** Media 7.75rem, prompt 7.75rem and answers 13.125rem on the phone stack.
  - The total is 498.5px including gaps and the slot, inside the ~600px folio at 375×812, so an ordinary round still never scrolls.
  - RMOB2's centring is kept; it now centres a constant box.
  - Room is given back where the one-screen contract needs it: a four-answer stack drops the reveal slot, and phones under 780px tall drop the slot and use a 6.125rem prompt (see Mobile findings).
- **The compaction tier** sets `--qs-stack-gap: 0.5rem` beside its own `gap: 0.5rem`, so the reserve counts the gap the stack draws.

## Changed files
- `src/index.css` — the contract above, with the comments rewritten.
- `src/components/ranked-arena/QuestionStageGeometry.test.tsx`:
  - The width-ladder parser is fixed: a height-gated rule used to read as unguarded.
  - MEASURED is re-derived, and the QV1 tests are re-cut to one allocation per viewport.
  - New `data-band` box-property guard.
  - New VISCONT1 block: a cascade evaluator per (w, h), reserves ≥ measured ordinary content at 9 tiers, the stack-h identity, seating, reveal slot, scoping and the phone allocation.
- `e2e/ranked-visual-continuity.spec.ts` (new) — the browser certification below.
- `playwright.arena.config.ts` — `testMatch` includes the new spec.
- `src/pages/dev/ranked-shell-probe/RankedShellProbe.tsx` (dev probe only):
  - `?seq=a,b,c,d` with `?sfx=1` serves one probe state per live round and settles each with a correct option and an evidence note. This gives a real question → reveal → next question in one mount.
  - `?broken=1` points every served asset path at nothing.
  - New states: `matchup` (two-champion Matchup card) and `twoChamp` (RCP1 two-option champion duel).
- No production component was changed. CSS alone establishes the invariant.

## Before / after (top coordinates in px; folio t/b and Module Rail top identical before and after at every viewport)
`tl` = Module Rail top. Rows are probe states; the band profile is in brackets.

**1880×900** (QV1 wide + tall, the known hole) — folio 52/747.7, tl 778.2

| state | media t/b before | prompt before | answers before | media t/b after | prompt after | answers after |
|---|---|---|---|---|---|---|
| opts4 [compact] | 124.5/380.5 | 392.5 | 540.5 | 74.6/378.6 | 390.6 | 552.6 |
| twoChamp [compact, icons, 2] | 120.9/376.9 | 388.9 | 536.9 | 74.6/378.6 | 390.6 | 552.6 |
| media [cinematic, premise+icons] | 96.9/400.9 | 412.9 | 560.9 | 74.6/378.6 | 390.6 | 552.6 |
| abilityCost [cinematic champion] | 100.5/404.5 | 416.5 | 564.5 | 74.6/378.6 | 390.6 | 552.6 |
| matchup [cinematic, 2 champions] | 100.5/404.5 | 416.5 | 564.5 | 74.6/378.6 | 390.6 | 552.6 |
| family [family] | 94.2/398.2 | 410.2 | 570.8 | 74.6/378.6 | 390.6 | 552.6 |
| jungleRule [compact jungle] | 124.5/380.5 | 392.5 | 540.5 | 74.6/378.6 | 390.6 | 552.6 |
| realP99 (exception) | 100.1/356.1 | 368.1 | 516.1 | 74.6/340.7 | 352.7 | 514.7 |

Anchor spread across ordinary rows: before media-top 30.3px, prompt 27.7px, answers 30.3px; **after 0**. Rich art is still 304px (QV1's 19rem).

**1600×780** (wide tier, lock regime) — folio 52/627.7, tl 658.2. Before, media top ranged 67–68.5 and prompt 321.4–334 (12.6px spread). After, every ordinary row is media 67/278.2, prompt 286.2, answers 444.2.

**1440×900** — folio 40/747.7, tl 778.2. Before: media top 118.9–131.9, prompt 396.9–409.9, answers 532.9–548.5 (15.6px). After: every ordinary row is 100.6/376.6, 388.6, 530.6.

**1280×800** — folio 40/647.7, tl 678.2. Before: family moved 2.6px (prompt overflow). After: every ordinary row is 70.6/326.6, 334.6, 472.6.

**1024×768** — folio 40/615.7, tl 646.2. Before: media/family moved up to 4.7px. After: every ordinary row is 55/264.2, 272.2, 438.2.

**375×812 phone** (`frame=0`) — folio 104.3/722.1.

| state | media top before | prompt before | answers before | media top after | prompt after | answers after |
|---|---|---|---|---|---|---|
| opts4 | 255.1 | 327.1 | 361.2 | 163.9 | 295.9 | 427.9 |
| opts2 | 309.1 | 381.1 | 415.2 | 163.9 | 295.9 | 427.9 |
| twoChamp | 296.1 | 368.1 | 428.3 | 163.9 | 295.9 | 427.9 |
| media / abilityCost | 204 | 333.1 | 412.3 | 163.9 | 295.9 | 427.9 |
| matchup | 258 | 387.1 | 466.3 | 163.9 | 295.9 | 427.9 |
| jungleRule | 242.1 | 314.1 | 374.3 | 163.9 | 295.9 | 427.9 |
| family (exception, 6-line prompt) | 150.7 | 282.2 | 465.7 | 138.2 | 270.2 | 453.7 |

Ordinary answer-grid spread on the phone: **105px before, 0 after**.

**Live sequence in one mount** (`?sfx=1&seq=opts4,media,family,opts2`):
- 1880×900 before: every reveal moved the stack −14.3px, and round changes moved it up to 34px.
- 1880×900 after: media 74.6, prompt 390.6, answers 552.6 on **every sampled frame**, including the reveal frames (correct tablet lit, evidence line mounted).
- 375×812 after: constant across reveals and rounds (the family round is the documented exception).

## Tests / baseline differential (Windows, vitest 3.2.7)
- **Focused suites:** AnswerGrid ×3, CanonicalArena ×3, DailyOnCanonicalArena.boundary, QuestionStageGeometry, CompactScenarioBand.env1, InteractiveScenarioSurface ×3, QuizRankedMatch.{bottomInvariant, geometry, metaReflex, metaReflexHeader}, metaReflexModule.level, RankedShellProbe, ItemAnalysisScenarioCard.scale.
  - Feature: 19 files, **327 passed / 7 failed**. Baseline: 318 tests, 311 passed / 7 failed. The failing sets are **identical**:
    - CRLF source scans: QuestionStageGeometry ×3, DailyOnCanonicalArena.boundary ×2, AnswerGrid.elimination ×2.
    - All are already listed as environmental in PHASE1_FRONTEND_INTEGRATION_HANDOFF.
  - QuestionStageGeometry alone: 79 passed, plus the 3 baseline CRLF failures.
- **Typecheck:** `tsc --noEmit -p tsconfig.app.json` gives 6 errors on both trees, an **identical** set, all in untouched files (`OnboardingProfile.tsx`, `identity/connections.ts`, `practiceLeaveContract.test.ts`).
- `pnpm build` was not run (it includes the prerender scripts). Nothing was deployed.

### Browser runs (Chromium, Playwright; `npx playwright test -c playwright.arena.config.ts …`)
Port 8123, the arena config's default, was occupied by another worktree's Vite (`of4-integration`), which I left alone. The runs used a throwaway config pointing `baseURL` at this tree's Vite (:5311) or the baseline's (:5312). Nothing about the specs differs.

| spec | VISCONT1 tree | untouched baseline |
|---|---|---|
| `ranked-visual-continuity` (new, 33 tests) | **33 passed** | 10 passed / **23 failed** — every ordinary-matrix and live-sequence test at all five viewports, the named QV1-hole test and both exception bounds; broken-asset and Stat Check pass on both |
| `ranked-arena-fit` (existing, 391 tests: fit / no scroll / no clipping, desktop matrix + seams + phones) | **390 passed**, 1 failed | the failing test fails identically on baseline: `RMOB2 compact phone HUD › is 40px tall` (44px received) |

The continuity spec covers:
- **Viewports:** 375×812 (production frame), 1024×768, 1280×800, 1600×780 and 1880×900.
- **Ordinary rounds (12 states):** compact/cinematic/family/Matchup/environment/jungle, 2 vs 4 options, icons vs none, premise vs option-media only. Every anchor must equal the first round's to within 0.5px. The profile drawn is asserted, and the Matchup card's VS seam must render.
- **Broken vs loaded assets** for 4 states.
- **Three live sequences in one mount**, sampled every 80ms through each settlement, reveal hold (asserting at least one disclosed reveal frame was observed) and next-round entrance.
- **Stat Check:** quiz ↔ Stat Check shell plus SC-RENAME3's LVL 11 → none → LVL 20.
- **The named 1880×900 rich → compact → rich hole**, including the 304px art assertion.
- **Two bounded exceptions.**

## Mobile findings
- **Avoidable reflow:** yes, and large (see root cause 4). Fixed with the smallest allocation that makes RMOB2's centring constant. It reuses the cinematic band's own height for media, the bank p95 (4 lines + category) for the prompt, and four single-line tablets for the answers.
- **No page growth** for ordinary rounds at 375×812: the total is 498.5px against a ~600px folio.
- **Visible cost:** a one-line prompt now sits above ~100px of parchment before the tablets. The compact plate is 124px tall instead of 64px, the same height as the cinematic art.
- **Sized against RMOB2's one-screen contract too.** The first cut (the same allocation on every phone) put the RS2 stress rounds 18px off one screen at 375×812 and realP99/realMax/family 20–39px off at 360×740. The existing `ranked-arena-fit` spec caught it. Room is now given back by shape or viewport, never identity:
  - A **four-answer stack** (`AnswerGrid` stacks four only when a label runs past 56 characters, the RS2 signal) gives back the reveal slot. Its evidence line re-centres by half its 24.5px.
  - **Phones under 780px tall** give back the slot and step the prompt reserve to 3 lines + category (6.125rem). A 4-line prompt there re-centres by 3px (bare) or 13px (with a category line), and the reveal by about 12px.
  - With these, every RMOB2 one-screen case passes again (157/158 phone fit tests; the one failure is the HUD-height test, which fails identically on baseline).
- **Remaining phone exceptions:**
  - Prompts over 4 lines (5–6 lines at 375, the bank's p95–max) re-centre by half their overflow. The RA7 family fixture (192 characters, 6 lines) moves 25.7px.
  - Long-label four-answer stacks and short phones (<780px) as above.
- **Probe artifact (not a defect):** the phone folio top differs by 6px between the probe's hp-match and points-match fixtures. A points combatant cell is taller. Mode does not change within a live match, and within one points match the folio held still through submit, reveal and next round.

## Journey boundary finding (read-only)
- **Unchanged.** `/dev/journey-arena?capture=zed&step=1..8` measures byte-identically before and after at 1880×900, 1280×800 and 375×812 (folio, board, question box, prompt, answers, rail).
- **No Journey file or `.journey-*` selector was edited.** Every VISCONT1 selector requires `body > * > .question-surface-stack`, and Journey's stack is inside `.journey-viewport`.
- **Shell vs board.** Across a Journey ↔ quiz module boundary the shared shell (folio box, Module Rail) is the same `CanonicalArena` box. Journey's board is deliberately top-anchored and full-height (JOURNEY-UI3), so its internal anchors intrinsically differ from a quiz round's. That difference is by design and is not addressed here.

## Stat Check / Daily
- **Stat Check:** LVL 11 → none → LVL 20 has zero drift at 375×812 (slot 345.7 / prompt 371.7 / cards 407.7) and 1280×800 (220.4 / 246.4 / 286.4). These are the exact SC-RENAME3 figures, and 1880×900 is identical to baseline.
- **Quiz ↔ Stat Check:** the folio and Module Rail are the same box.
- **Daily:** `DailyRunPage` mounts `ArenaShell` (`.ranked-academy`) + `QuizRankedMatch` → `CanonicalArena`, so it gets the identical stage. No Daily geometry exists; QuestionStageGeometry's "no mode sets a height" guard and DailyOnCanonicalArena enforce that.

## Remaining exceptions (measured, not hidden)
1. **Long-label 4-option rounds at desktop** (`realP99`, 48-character labels; `realMax`, 63) genuinely exceed the stage at full art.
   - The art yields; the art top, folio and rail stay.
   - Prompt and answers move up by the overflow only: realP99 −38px at 1880×900 (−56.6px at 1280×800, −44.5 at 1024×768).
   - Reserving for them would shrink every round's art.
2. **Phone prompts over 4 lines** re-centre by half the overflow (family fixture 25.7px).
3. **Art cost in the wide-tier lock band.** On ≥1600-wide desktops roughly 780–890px tall, ordinary rich art is smaller than before. That is the price of paying QV1's 24px prompt (4-line reserve), its 18px tablets (142px grid) and the reveal slot for every round:

   | viewport | rich art before | after |
   |---|---|---|
   | 1600×780 | 259 | 211 |
   | 1600×800 | 279 | 231 |
   | 1878×797 | 276 | 228 |
   | 1920×800 | 279 | 231 |

   Taller desktops (1880×900, 1920×1080) keep the full 304px, and 1024–1440 bands are unchanged (aspect-bound).
   **This is the owner call carried forward.** If it is unacceptable, the cheapest levers are, in order:
   1. Keep the 21px prompt in this band (gate the 1.5rem step on ≥890px tall).
   2. Drop the 18px tablet padding there.
   Each recovers about 14–24px. Not done here, because both re-tune approved QV1 design.

## Commit
See `git log -1 viscont1/visual-continuity`. This handoff is part of the commit.

## Next task
1. **Owner decision on exception 3** (wide-tier lock-band art size).
2. **Live QA on a real Ranked and Daily match** at 1880×900 and on a phone, through several reveals. The probe certifies the canonical arena; the live backend serves the same envelopes.
3. **Content follow-up.** If more than ~5% of served rounds carry 2-line option labels, consider a per-tier answers reserve for them, with its art cost measured first.
