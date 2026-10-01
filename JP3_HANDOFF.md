# JP3 — Journey Visual Language

| | |
|---|---|
| Branch / worktree | `jp2/journey-stage-grammar` at `mogsy/.worktrees/jp2-stage-grammar` (continued on top of JP2) |
| Starting HEAD | `50f9ff88` (JP2 final screenshots; JP2 code `a5180a0f` + polish `934cd593`) |
| JP3 code commit | `2f9c2827` — `feat(journey): JP3 Journey visual language` |
| Screenshots + this handoff | the commit after `2f9c2827` (docs only) |
| Backend | **Not modified.** Everything below reads the production contract `fe942a58` as captured in `lib/journey/__fixtures__/`. |
| Production / Railway / Patch Ops / item maintenance | **Untouched.** Nothing pushed, deployed, integrated or triggered. |
| Status | Local commits only. **Not pushed.** Awaiting owner screenshot review. |

## 1. Objective

JP2 fixed the Journey's structure. JP3 defines its visual language on top of that structure. It covers hierarchy, art direction and information presentation, all inside the JP2 fixed-stage contract.

> "Every Journey child uses the same fixed stage. The state changes; the layout does not."

JP3 does not move the board, prompt, answers or reveal region at any certified width (§8).

## 2. Owner locks applied

| Lock | Where |
|---|---|
| Journey dominates desktop; banners recede; ordinary Ranked unchanged | `index.css` JP3 §1 (`.ranked-arena-grid:has(.journey-viewport)`) |
| Match roles (Jungle/Top) not drawn beside the Journey scenario | `CombatantPanel` (`identityLabel` null while `journey`), `MobileMatchBar` |
| Champion art is real media, not texture | `JourneyStateBoard.SideArt` + `index.css` JP3 §2 |
| Parchment art is a deliberate engraving, not sliced | `index.css` JP3 §6 |
| One learned-knowledge grammar (gold `!`) | `knowledge.ts` (JP3 section), `JourneyStateBoard.SidePanel`, `JourneyPrimitives` |
| Learning visibly changes the board; correctness never read | `useJustLearned` (board), CSS JP3 §3 |
| Micro-chain, no hardcoded Zed/Ahri labels | `lib/journey/chain.ts`, `JourneyStateBoard.JourneyChain` |
| Reveals are calculations | `components/journey/JourneyCalcFlow.tsx`, `JourneyStageQuestion.JourneyReveal` |
| **Display precision**: derived values whole; taught decimals kept | `lib/journey/stats.ts` (`displayWhole`, `exactValueNote`) |
| Restrained answer-tablet polish, no geometry change | `index.css` JP3 §7 |
| Arena vs Academy: contrast kept, connective tissue added | shared corner brackets / gold / `!`, `index.css` JP3 header |

## 3. Audit findings (before editing)

1. **Host seam.** `CanonicalArena` sets the three columns as `lg:grid-cols-[23fr_54fr_23fr]` on `.ranked-arena-grid`. The `JUNGLE`/`TOP` label is `CombatantPanel`'s `identity-tag` (JOURNEY-PRES-V1 added an RQ1 emblem there). It named the participant's queue role beside the Journey's champion crest.
2. **Why the splash looked small.** The art (`SideSplash`) was sized to each side's content box, not the board. It was cover-cropped from a landscape splash at `opacity 0.42`, `brightness 0.7`, and masked to transparent by 90% of the side. What was left was a dim strip behind the chips.
3. **Why the parchment art was cut.** On the Journey stage, the champion/combat motif reused the ordinary card's reviewed composition. That is 180% of the card width, positioned for a card with a tall media band above. Under the opaque board, only an arm and half a face showed, clipped by the sheet edge.
4. **Learned state before JP3.**
   * Zed E: a gold `!` on the ability, whose popover listed Formula (Step 1) and Raw damage 85 (Step 2).
   * Ahri Armor: a gold `!` on the portrait (Armor 24 · Step 3), plus the board chip "ARMOR recall · step 3". That was two treatments for one concept.
5. **Chain labels.** These are derivable without the backend for **reached** steps only, from each reached child's served `asks` (family/metric). The server publishes only the reached prefix of `journey.children`. A future step's ask is deliberately off the wire, so future nodes are unlabelled (the brief's generic fallback). No backend change was made.
6. **Where derived decimals were formatted.**
   * `stats.formatStatValue`, which printed every digit on purpose ("never round a stated premise"): board chips, State sheet, beat lines.
   * `JourneyCombatWorking` rows (84.56, 24.024, 68.1804).
   * `rawWorkingParts` (20.8).
   * The served explanation prose ("24.024 armor, which rounds to 24…").
7. **Reveal seam.** `JourneyStageQuestion.JourneyReveal`, inside the JP2 reserved prompt box (`.journey-reveal`).
8. **File set.** Listed in §5. No backend requirement was found, so there was no stop.

## 4. Implementation

### 4.1 Desktop host (Journey dominance)

A presentation **state** of the existing shell. It uses no new component. It is keyed on the Journey's own viewport being in the centre column.

| | lg (1024–1279) | ≥1280 |
|---|---|---|
| Ordinary Ranked | 23 / 54 / 23 | 23 / 54 / 23 (unchanged) |
| Journey | 20 / **60** / 20 (+11%) | 18 / **64** / 18 (+19%) |

The Journey board went from **584 → 700 px** at 1280, and from 700 at 1440.

In the banners:
* the crest and module history drop to 0.72 opacity;
* the glow is lowered;
* name, score and status stay at full strength;
* the status pill is capped to the narrower cloth.

The match role is not drawn during a Journey, on the banner (name and emblem) or on the phone bar (emblem). The board is the scenario's one authority. Outside a Journey both are byte-identical.

### 4.2 Champion art (board)

`SideArt` sits at board level, one per side, `aria-hidden`:
* It uses the champion's **loading-screen art** (`MasteryAssets.championLoadingUrl`, new, optional), falling back to the splash, then to nothing.
* Loading art is the same illustration composed on the champion, so the crop is generic (no per-champion tuning).
* The crop is 150% of the board height (`cqh`, since the band is a size container), top-anchored, with the face's centre line 9% of the board width in from the outer edge.
* Horizontal and bottom masks fade it; a radial `::after` darkens the centre lane.

The side content now hugs the seam, so the faces sit in the open outer margins. Portraits step down 4rem → 3.5rem on the tall desktop board. The phone's compact rows keep their quieter per-row splash.

### 4.3 Parchment engraving

On the Journey stage (`.journey-question`), the motif's `::before` is the **whole drawing**:
* scaled to the question region's height and centred;
* `aspect-ratio` of the art;
* masked with a `closest-side` radial sized to the drawing, which dissolves its torn paper edge;
* `opacity 0.2`.

It no longer bleeds or slices. It uses the same asset. The phone shows no motif, as everywhere. The ordinary card's composition is untouched: the selectors use `:is([data-motif-art=…])` so they never shadow the base rules.

### 4.4 One learned-knowledge grammar

> **A gold `!` means the learner established knowledge about this piece of game state earlier in this Journey.**

* **A learned value fills the board's `?`.**
  * `StatChip` has a new `learned` face: "Armor ? → Armor 24 !".
  * `AbilityReadoutChip` is new: "E raw damage ? → E raw damage 85 !".
  * The values are K2's reveal display, verbatim. `learnedStatFact` / `learnedRawDamage` are joins only.
* **The `!` sits on the most specific object.**
  * A stat's fact goes on its chip.
  * An ability's facts go on its icon: Zed E lists Formula · learned Step 1 and Raw damage 85 · learned Step 2.
  * Anything else goes on the portrait (`markWithout` drops what a chip shows).
* **Ability readouts are value-free.** They come from the server's withheld **field names** (`abilities.<slot>.raw_damage`, asked/recalled) via the new optional `JourneySide.readouts`. They persist once learned: the board is the notebook. Compact rows show only the readout the current question asks or relies on.
* **Removed:** the "ARMOR recall · step 3" pill wherever the learner holds the value. The recalled face remains only as the fallback when no K1 knowledge exists (older contracts).
* The State sheet speaks the same grammar ("24 · learned Step 3"). Popover lines read "learned Step N". Champion cards are titled "Ahri · Lv2".
* Server prerequisite semantics are untouched. The server still withholds and requires the recall. The client shows the learner's own established value, which K2 already displayed in JP2's popover.

### 4.5 Learning animation

`useJustLearned` (board) diffs the set of K2 fact keys between renders:
* A key that **arrives** is "just learned" for ~1.6 s.
* The value rises into its chip (`journey-learned-in`), the chip glows once (`journey-learned-glow`), and the `!` pops in (`journey-know-pop`).
* It then settles into the learned face.

The first render seeds silently, so a reload replays nothing. It reads only which facts exist, so right, wrong and timed-out reveals glow identically, and an unreached child teaches nothing. Reduced motion (OS or `html.reduce-motion`) disables it.

### 4.6 Micro-chain

`journeyChain(reached, count, index, settled)` → nodes `done` / `current` / `future`:
* **Labels.** `chainNoun(asks)` is a **closed generic vocabulary** over served family/metric: Formula, Raw damage, Final damage, the stat's short name, `<slot> cooldown` / `haste CD` / `compare`. It returns null for anything unknown. There are no champion or recipe names, and a source guard test enforces this. Future nodes are bare ○.
* **Done.** A node is done when its reveal shows or the server has moved past it (`own_next_challenge_index`). "Done" means established, never correct. The gold ✓ is not green.
* **Self-fitting.** It tries full labels → current label only → dots, keeping the first form that fits the header line. It re-measures on resize with `ResizeObserver`, never clips, and keeps a Daily transition note at ≥ 96 px.
* **Making room.** The question's role emblems and the "Calc" word (icon kept, with aria-label and title) yield on boards narrower than 48rem. On a phone the chain replaces the "Step N of M" text visually; the text stays in the accessible name.

### 4.7 Display precision (owner lock)

`stats.ts`:
* `displayWhole(n)` — `Math.round`, **display only**.
* `formatStatValue` → whole.
* `exactValueNote(n)` → "Exact value 84.56 · shown as 85, rounded for display. Calculations use the exact value."

The note is used as a `title`; it is never on screen and never says "rounded up".

| Where | Before | After |
|---|---|---|
| Bonus AD chip | 20.8 | **21** (title: exact 20.8) |
| Armor (board, sheet, reveal) | 24.024 | **24** |
| Raw damage | 84.56 | **85** |
| Final | 68.1804 | **68** (the served answer) |
| Served "…: X, which rounds to N for this question." | verbatim | "…: N unit." (`displayExplanation`; exact in the title; unrecognised prose untouched) |
| Zed E rank values | 92.5 / 137.5 | **kept** (canonical taught fact) |
| Armor multiplier | ×0.8063 | **kept** (served coefficient) |

No arithmetic moved to the client. The server still computes on exact values, and the reveal's answer is the server's.

### 4.8 Reveals as calculations (`JourneyCalcFlow`)

* **Step 2:** `[Base · R1 70] + [bonus AD 70% × 21] = [Raw damage 85]`. Served parts: the ledger's formula, the premise stat and the answer.
* **Step 3:** `[Ahri Level 2] → [Ahri armor 24]`. From the recall's own prompt semantics plus the answer.
* **Step 4:** `[Raw damage 85] → [Ahri armor 24] → [Armor multiplier ×0.8063] → [Final damage 68]`. From the server's `combat_working`.
  * With penetration, `[Penetration] − [Effective armor] =` cells are inserted.
  * When the raw damage was not established earlier (a Daily stated formula), the formula leads as a one-line caption: "E R1: 55 + 100% total AD (69) + 150% bonus AD (0)".
* **Final cell:** gold, with corner brackets. It is the culmination.
* **Phone:** cells wrap. Text stays at reading size (labels 10 px, values 16–22 px).

`JourneyCombatWorking`'s line mode (match review) is unchanged.

### 4.9 Tablets and connective tissue

`--jp3-corners` gold L-brackets (a pseudo-element; lays out nothing) are shared by:
* the board;
* every Journey tablet, whose brackets follow the tablet's selected / correct / incorrect tones;
* the final calc cell.

On tablets the bottom-right bracket steps aside for "Your pick". The tablet border is slightly warmer. There are no padding, border-width or size changes, and a test enforces this.

## 5. Files

**New**
* `src/lib/journey/chain.ts`
* `src/components/journey/JourneyCalcFlow.tsx`
* `src/lib/ranked-core/modules/masterySliceModule.visualLanguage.test.tsx`
* `docs/handoffs/jp3-visual-language/jp3-final-*.jpg`
* `JP3_HANDOFF.md`

**Modified**
* `src/index.css` (JP3 block appended)
* `src/components/journey/`: `JourneyStateBoard`, `JourneyPrimitives`, `JourneyKnowledgeMark`, `JourneyStageQuestion`, `JourneyModuleStage`, `JourneyStateSheet`
* `src/components/ranked-arena/`: `CombatantPanel`, `MobileMatchBar`
* `src/lib/journey/`:
  * `stats.ts`, `knowledge.ts`, `adapter.ts`;
  * `contract.ts` (optional `JourneySide.readouts`, additive);
* `src/features/mastery/`:
  * `player/MasteryAssets.tsx` (optional `championLoadingUrl`);
  * `live/MasteryAssetsProvider.tsx`;
* `src/lib/ranked-core/modules/masterySliceModule.tsx` (passes `reached` and `answeredThrough` to the stage)
* Tests updated to the new grammar with the same intent:
  * `stageGrammar`, `journey5`, `journey`, `knowledge`, `journeyPresentation`;
  * `JourneyModuleStage`, `contract`;
  * `QuizRankedMatch.hosted`.

**Reuse, not duplication.** K1/K2 (`journeyKnowledge`, `JourneyKnowledgeMark`), the asked-field anchor, the JP2 stage and its reserves, `combat_working.v1` and the existing asset manifest are all reused. There is no second state, knowledge or renderer system.

## 6. Tests

* **New JP3 suite** (`visualLanguage`), **20/20**:
  * no recall pill on any reference snapshot;
  * the `? → value` timeline;
  * the glow on the right and wrong paths (the timeout path glows nothing new and keeps its facts);
  * the glow settles;
  * no glow on reload;
  * the State sheet grammar;
  * the Daily K1 grammar;
  * chain states on all three paths and after the reveal window;
  * the generic vocabulary plus a source guard;
  * the Daily chain;
  * the precision sweep over **every** reference snapshot (right / wrong / timeout) and the M1 Daily Journeys: no derived decimal in visible text, 92.5 kept;
  * `displayExplanation`;
  * art source order and fallback;
  * host / parchment / tablet stylesheet guards.
* **Updated JP2 suites:** stageGrammar 26/26, journey5 18/18, knowledge, journeyPresentation 14/14, JourneyModuleStage, contract and the hosted test all pass.
* **Focused final run** (journey, ranked-core modules, quiz-ranked, ranked-arena, question-surface): **1806 / 1813**. The 7 failures are all pre-existing on the JP2 baseline:
  * AnswerGrid.elimination 2
  * QuestionStageGeometry 3
  * QuestionMotifLayer "Champion/Combat unchanged by the Rift art" 1
  * an rfx1b3 timing assertion (258 ms vs < 250) 1, which also flakes on baseline
* **Broad battery vs the clean JP2 baseline** (admin, quiz-ranked, ranked-core, ranked-public, ranked, journey, daily-challenge, analytics, ranked-arena, dev, audio, question-surface, mastery, quiz), by test id:
  * JP3: 6,384 tests, 6,336 passed, 41 failed.
  * Baseline: 6,363, 6,315, 41.
  * The single JP3-only failure (a motif test finding the last `…[data-motif-art="spells"]::before {` in the stylesheet) was fixed with `:is()` selectors.
  * Two `STACK_TRACE_ERROR` timeouts under full-battery load occur identically on both trees and pass in isolation.
  * One baseline-only rfx1b3 timing flake.
* **Static checks**
  * `tsc -p tsconfig.app.json`: the same 2 pre-existing Supabase-typing errors.
  * ESLint on changed files: 0 new errors (fast-refresh warnings, the existing pattern). The one error in `QuizRankedMatch.hosted.test.tsx:372` (`no-control-regex`) is pre-existing on `50f9ff88`.
  * `npm run build`: passes. The regenerated `public/sitemap.xml` was reverted.

## 7. Screenshots

`docs/handoffs/jp3-visual-language/`, captured with headless Edge from the committed code `2f9c2827` (clean tree), through `/dev/journey-arena` (the real captures through the production path). The page clock was frozen so the reveal hold is on screen. There are no interim shots in the folder.

| # | File |
|---|---|
| 1–8 | `jp3-final-desktop-step{1..4}-{live,reveal}.jpg` (1280×800) |
| 9–10 | `jp3-final-desktop1440-step4-{live,reveal}.jpg` (1440×900) |
| 11–14 | `jp3-final-mobile-step2-live`, `-step3-reveal`, `-step4-live`, `-step4-reveal` (390×844) |
| 15 | `jp3-final-daily-pantheon-step4-reveal.jpg` (Daily Standard, 1280×800) |

JP2's `final-*` / `before-*` shots in `docs/handoffs/jp2-stage-grammar/` are the before set.

## 8. Breakpoint certification

**Method.** A probe stepped the reference Journey on the correct, wrong and timeout paths, plus Daily M1 Pantheon (Standard), Volibear (Standard) and Ahri (Survival), at every width. It recorded:
* the region coordinates;
* reveal overflow in y and x;
* board element clipping;
* tablet text overflow;
* question-box scroll;
* lock-in;
* document x-overflow.

**Result.** One value per region per width, **identical to JP2's certified coordinates**:

| Viewport | Board y / h | Question y / h | Prompt | Answer origin | Board width (JP2 → JP3) |
|---|---|---|---|---|---|
| 375×812 | 159 / 200 | 367 / 432 | 367 | 515 | 337 |
| 390×844 | 159 / 200 | 367 / 432 | 367 | 515 | 352 |
| 768×1024 | 155 / 240 | 403 / 348 | 403 | 507 | 698 |
| 1024×768 | 127 / 214 | 349 / 324 | 349 | 493 | → 500 |
| 1280×800 | 127 / 302 | 437 / 268 | 437 | 545 | 584 → **700** |
| 1440×900 | 133 / 390 | 531 / 268 | 531 | 643 | → 700 |
| 1920×1080 | 145 / 558 | 711 / 268 | 711 | 823 | → 679 |

* Overflow, clipping, x-overflow and lock-in are all 0.
* The chain fits at every width. The final probe records the chosen form: `full` at ≥1280 for the reference, `current` on phones, `dots` for Pantheon's five steps plus a transition note on a phone.
* JP2's 2 px question-box overhang (pre-existing, from the motif bleed) is gone.
* **Known and unchanged:** the Survival finish header drops its per-child timer (10 px shift, pre-existing, outside the renderer).

**Daily.** The Standard (Pantheon, Volibear) and Survival (Ahri vs Syndra) Journeys draw:
* the same grammar;
* their own generic chain labels;
* Syndra/Leona/Volibear art with the same generic crop;
* whole-number display (127.273 s → 127, 50.08 → 50, 68.8675 → 69).

**Non-Journey Ranked** (`/dev/ranked-shell-probe`, text round, media round, Mastery round, phone), JP2 baseline vs JP3: identical grid (`259 / 609 / 259` px), focus column, question box, banners and role tags. **0 pixels** differ by more than 24/255.

## 9. Known follow-ups (not in JP3)

1. **JR1 — Journey-aware results** (next workstream): "Victory 2–1 / Modules won 0/1 / Accuracy 0%" on a four-child Journey.
2. Canonical item stack-size authority (replace `STACKABLE_ITEM_MAX`).
3. Structured raw-damage working from the backend. Step 2's cells are laid out from served parts.
4. Source-level `total AD` wording after identity review (`RATIO_LABELS`).
5. Survival header 10 px completion shift.
6. Typed / free-entry numeric question audit / removal.
7. **Chain labels for future steps would need a backend contract change** (unreached children are not published). The chain deliberately leaves them bare.
8. **Pre-existing:** on a phone, long champion names truncate on the compact board rows ("P…", "LE…" for Pantheon/Leona). This was measured identical on the JP2 baseline.
9. Match review still uses `JourneyCombatWorking`'s line mode with exact decimals. JR1 should decide whether the display-precision lock extends to results and review.

## 10. Exact next task

1. **Owner review** of `docs/handoffs/jp3-visual-language/jp3-final-*`. For a live replay, run the dev server on this branch and open `/dev/journey-arena?capture=jref-zed-ahri` (also `-wrong` and `-timeout`, and `m1-pantheon` / `m1-ahri-survival`).
2. On approval, integrate onto the then-current `origin/main` and deploy the frontend. No backend deploy is needed.
3. Next workstream: **JR1 — Journey-Aware Results**.
