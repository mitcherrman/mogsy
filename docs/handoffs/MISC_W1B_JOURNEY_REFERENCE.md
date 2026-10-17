# MISC Wave 1B — F08: stated ability formula reference (Journey board)

Issue: mitcherrman/mogsy#54 · Branch `fix/misc-w1b-journey-ability-reference` · Draft PR mitcherrman/mogsy#57
Owner session: Claude Code, Opus 5.5, medium effort · Date 2026-10-16

## Status

**Done, draft PR open, not merged, not deployed.** No backend change, no Docker, no production write. Stat shards deliberately **not** touched.

| | SHA |
|---|---|
| Base (`origin/main`, fresh fetch) | `9930da17` (Merge PR #53) |
| Head | `939f50cd` at PR open (fix `f1f47eac` + handoff); this line is updated by a later docs commit |
| Backend authority read (`League_Combat_Simulator` `origin/master`) | `fadec94a` |
| PR #46 head inspected | `64e45176` (draft, open, 84 commits behind `main`) |

## The defect, reproduced

Authority: backend `mastery/setup_state/data/journey_recipes.v1.json` → `support.pantheon_vs_leona` (Daily S-A). c3 = `combat_ability_damage`, `formula: "state"`; c4, c5 = `formula: "recall"`; t1 Leona buys Cloth Armor; t2 both reach L4; t3 Pantheon buys Long Sword.

Served state (real capture `src/lib/journey/__fixtures__/jattn1/pantheon.standard.json`, every snapshot inspected):

- **Disclosure window.** Child index 2 (c3, "Step 3") first appears in `journey.children` at **`child2-open`**; its `learner.states[]` carries `ability_damage_formula:pantheon:E` with the structured value (`flat_by_rank [55,105,155,205,255]`, ratios `attack_damage ×1`, `bonus_attack_damage ×1.5`, `damage_type physical`) and K1 object `player:pantheon:E`. It is **absent** through `child1-reveal-end` (children `[0,1]`).
- c4 / c5 ledgers (`learner.established`) list the same fact with **`source: "stated"`, `child: 2`**; c3's reveal never re-publishes it as `revealed`.
- `journeyKnowledge` (K2) adds only `source: "revealed"` facts → no `!` on Pantheon E. `AbilityRankPips` is `role="img"`, so the highlighted (relevant reticle) E tile had **no control** in c4 / c5. The stated formula was only on c3's own question card.

Failing-before proof: the new DOM suite on unmodified source → **8 failed / 4 passed** (the 4 that passed are the negative "nothing appears" cases). After → **12 / 12**.

## Decisions

1. **Reference, not knowledge.** New pure `src/lib/journey/abilityReference.ts` → `statedAbilityReferences(journey, stepIndex, knowledge)`: reads only reached children with `index ≤ step on screen`, from `learner.states` (the stating child) and `learner.established` with `source: "stated"`; kind `ability_damage_formula` with an ability K1 object; restated → latest statement wins (Volibear Q: Steps 2 and 4). Same guards as K2 (no block / re-ask / pre-K1 contract → nothing).
2. **Window opens at the stating child's open (c3), not only c4.** The formula is already on c3's question card then, so the tile offers nothing new; from c4 it is the only place to look it up. Nothing before c3 (verified c1, c2, c2 reveal-end, beats).
3. **Wording separates semantics.** "stated Step 3" (never K2's "learned Step N"); no gold `!`; no Saved arrival; `data-facts` of any `!` unchanged.
4. **One control per ability.**
   - No `!` on the ability (Pantheon E) → the **tile itself** is the control: the existing `journey-ref-btn` (transparent, `inset: 0` over the ability host — same as item/shard references), Radix popover, same hover-preview / tap-to-pin / Enter-Space / Escape grammar.
   - Ability already wears a `!` (Ashe W cooldown, Volibear Q) → the `!` stays the single control; its card gains a "stated Step N" section below K2's learned lines. Not a second button.
   - Formula was **revealed** (Zed E in the reference Journey) → K2's `!` card already shows it; no stated reference at all.
5. **Answer-safe.** The served formula is printed verbatim and never evaluated (no stat × ratio, no damage). The current rank's base is underlined from the board's own rank. Test asserts the c4 / c5 served answers (75, 90) and every distractor not literally a formula number are absent. Note: c4's distractor "55" equals rank 1's stated base — that is the premise itself, not a leak.
6. **Meaning line**: "Physical damage before armor: the value at the ability's rank, plus each % of that stat." (`magic` → "magic resist"; other types: no mitigation clause.)

## Files

- `src/lib/journey/abilityReference.ts` (new) — pure selector + `statedLabel`.
- `src/components/journey/JourneyAbilityReference.tsx` (new) — `StatedReferenceLines`, `JourneyAbilityReference` (tile control).
- `src/components/journey/JourneyStateBoard.tsx` — computes references once per render; ability map renders the tile control when there is no `!`, else passes `reference` to the mark.
- `src/components/journey/JourneyKnowledgeMark.tsx` — optional `reference` prop (card section only; trigger, aria-label, data attributes unchanged).
- `src/components/journey/JourneyReferencePopover.tsx` — `ReferencePopover` exported (no behavior change).
- `src/index.css` — one scoped block after `.journey-ref-pop__note` (`.journey-know-host--ability:has(> .journey-ref-btn)` affordance + `.journey-ability-ref__meaning`). No global rule; motion only under `prefers-reduced-motion: no-preference`; the existing `html.reduce-motion` ability-tile rule already neutralizes it.
- Tests: `src/lib/journey/abilityReference.test.ts` (34, every snapshot of every K1-contract capture: jattn1, jp5, k1, m1, jext, jref), `src/lib/ranked-core/modules/masterySliceModule.abilityReference.test.tsx` (12, production module DOM).

## Tests run (worktree, `npm ci`)

- New: 12/12 DOM + 34/34 pure.
- Focused regression `vitest run src/lib/journey src/components/journey src/lib/ranked-core/modules/masterySliceModule*`: **665 passed, 4 failed — all 4 fail identically on untouched `main` 9930da17** (verified by restoring `index.css` from HEAD and re-running): `masterySliceModule.jp5` "reveal is still the prompt box's own layer…", `masterySliceModule.visualLanguage` ×3 (champion art fade, board fills its band, tablet polish geometry). Pre-existing stylesheet assertions; not touched here.
- `tsc -p tsconfig.app.json --noEmit` clean; eslint clean on changed files.

## Browser evidence (local Vite, `/dev/journey-arena?capture=jattn1-pantheon`, real capture, production module path)

In `docs/handoffs/misc-w1b-journey-ref/`:

- `390-c4-closed.jpg` — 390×844, c4 (`step=20`, child3-live): E highlighted, no `!`.
- `390-c4-e-reference-tap.jpg` — tap on the E tile: card inside the viewport (x 20–292 of 390, no horizontal scroll).
- `390-c5-e-reference-keyboard.jpg` — c5 (`step=28`): after Leona's armor, L4 and Long Sword; opened with keyboard Enter; same card.
- `1440-c4-e-reference-hover.jpg` — 1440×900 desktop, mouse hover preview.

Measured: tile control 28×43 px at 390 (tile + pips), 44×44 at 1440 (≥ 24 px). Keyboard: focus lands on the button, `:focus-visible` gold outline `rgba(243,220,160,.8)` on the tile; Enter opens, Escape closes, focus stays on the tile. `step=7` (c2): zero reference controls. No console errors. Viewport reset and dev server stopped afterwards.

Not browser-tested: physical touch device, Safari/WebKit, `html.reduce-motion` toggle in the live app (covered by the existing stylesheet rule only).

## PR #46 — overlap and merge order

#46 (`ux/journey-update-clarity-20261015`, draft, head `64e45176`) touches `JourneyStateBoard.tsx` (coach line + `data-update-flash`), `useKnowledgeCoach.ts`, `src/index.css` (two appended blocks), `masterySliceModule.motion.test.tsx`.

`git merge-tree` results: #46 → `main` = **5 conflict hunks** (board coach line vs JUX1-F1 `itemArrivals`; 2 CSS; 2 coach hook). #46 → this branch = **the same 5, none new**. F08 touches a different board region (the ability map), a different CSS location, and no coach / flash code. **Order is free**: F08 can land first; #46 needs a rebase onto `main` regardless (its own conflicts must be resolved in favour of keeping both `itemArrivals` and the flash). F08 does not overwrite #46's flash or hints.

## Review round 1 (command-center comment on #57, 2026-10-17) — unified tile control

**Request.** Make the whole highlighted tile the single interaction target whether the ability has a learned `!` or only a stated formula, `!` kept as a visual marker, with no nested or competing buttons and no duplicate popovers. Keep the Pantheon E path unchanged.

**Mechanism (least invasive, the portrait popup's existing pattern).** In `JourneyKnowledgeMark`, the Radix trigger moved from the corner badge to one transparent `journey-ref-btn journey-know-btn` over the whole ability host (the same box the stated-only control uses). The `!` is now a `<span aria-hidden class="journey-know journey-know--ability">` inside that button, with `pointer-events: none`, which is exactly how `.journey-portrait-btn > .journey-know` already works. The `!` keeps its position and size and lights with the control on hover/open. Unchanged: the test id (`journey-know-<side>-<slot>`), `data-facts`, `data-just-learned` (on the control only), `data-state`, the accessible name `Known facts: <Champion> <slot>[, relevant to this question]`, the hover-preview / tap-pin / Enter-Space / Escape handlers, and learned vs stated provenance in the card. `JourneyAbilityReference` (Pantheon E, stated-only) is untouched.

**Tests.**
- New (in `masterySliceModule.abilityReference.test.tsx`, 23 total now, all pass): for Pantheon E (stated only), Ashe W (`!` + stated), Volibear Q (`!` + restated) and Zed E (`!` only): exactly **one focusable control** in the ability host; it is a `BUTTON` with `journey-ref-btn` (fills the host), contains no nested button, and the host has one button. A click on it opens **one** popover (`data-radix-popper-content-wrapper` count 1) and a second click closes it. The `!` is inside the control and `aria-hidden`, with the `pointer-events: none` rule asserted. Provenance stays split (learned Step 1 / stated Step 2). Keyboard on a `!` tile: Enter opens, Escape closes, focus stays on the tile.
- Two existing tests changed **only their DOM selector** to the new control class, with the same assertions and counts: `masterySliceModule.stageGrammar` `marks()` (`button.journey-know` → `button.journey-know-btn`) and `masterySliceModule.jp5` "board is untouched" (same change). No assertion was relaxed.
- Focused regression (journey libs/components + all `masterySliceModule*`): on the branch 675/680, and on a **temporary merge with fresh `main` `f83b01de`** 676/680. The failures are always the **same 4 baseline** stylesheet tests (`jp5` fixed stage; `visualLanguage` art fade, band units, tablet polish). Two snapshot-looping tests (`visualLanguage` "no 'recall' pill", `portraitPopup` "no anchor chip") failed intermittently in one or two full parallel runs and pass in isolation and in the merged run. They look like load timing; I did not establish whether they flake on `main` too.
- `tsc -p tsconfig.app.json --noEmit` clean (branch and merged tree); eslint clean on changed files.

**Browser (local Vite harness, real captures).**
- 390×844, Ashe W at `capture=jattn1-ashe-jinx&step=12`: one control (`BUTTON journey-know-subject-W`, "Known facts: Ashe W", 28×43 px). `elementFromPoint` at the tile centre **and** at the `!` both hit that button, and the `!` computes `pointer-events: none`. A real tap on the tile centre opens one card: 18s learned Step 1, Raw damage 60 learned Step 2, `60 / 95 / 130 / 165 / 200 + 100% bonus AD` stated Step 2, inside the viewport (x 8–280). Tapping again closes it (`data-state` closed); tapping the `!` opens it; Enter opens; Escape closes, and focus stays on the tile with `:focus-visible` and the gold tile outline `rgba(243,220,160,.8)`.
- 1440×900: hover-preview opens it, 44×44 control, no horizontal scroll.
- Pantheon E (`step=20`): still one control, `journey-ability-ref-subject-E`, "…damage formula, stated Step 3", no `!`.
- Captures: `misc-w1b-journey-ref/390-ashe-w-tile-tap-learned-and-stated.jpg`, `misc-w1b-journey-ref/1440-ashe-w-tile-hover.jpg`.
- Note for anyone re-checking: Radix keeps a closing popover's node through its exit animation, so judge open/closed by the trigger's `data-state`, not by the popover node's presence.

**CI.** All 3 workflows passed on `a5ddbbdc`: Journey Mobile Space Experiment, mobile-arena-visibility, Mobile Recording Fit. The new head's runs start on push.

**Merge compatibility.** `git merge-tree` with fresh `main` `f83b01de` is clean, with no conflicts. #46 was not absorbed: it is still a separate conflicted branch, and the earlier analysis still holds (F08 adds no new conflicts with it).

## Not done / blockers / follow-ups

- "False premise" stage named in the issue: **no capture with a false-premise child exists** in `__fixtures__/`; not tested. Needs a backend capture if that stage type is real.
- Timeout: covered for Zed reference (`.timeout`) and wrong-answer variants (Zed, Ashe); there is no Pantheon timeout capture in the K1-contract fixtures.
- ~~Ability with both a `!` and a stated formula: tile inert~~ — resolved in the review round below.
- Next task in wave: stat shards (explicitly out of scope here).
