# JP2 — Journey Stage Grammar

| | |
|---|---|
| Branch / worktree | `jp2/journey-stage-grammar` at `mogsy/.worktrees/jp2-stage-grammar` |
| Base | `origin/main` `3011a416`. This is production `afa8e57a` plus one USERS2.3C-Daily analytics commit, which has no Journey overlap. |
| Backend | **Not modified.** The captures came from a throwaway detached worktree at production `fe942a58` (`League_Combat_Simulator/.worktrees/jp2-capture`), with the canonical DB opened `mode=ro`. |
| Patch Ops / items | **Untouched:** no trigger, cron, watch path, item refresh, import, certification or Stormrazor work. The canonical DB is unchanged (6,217,244,672 B, mtime 2026-09-26 16:01:13). |
| Status | Local commit only. **Not pushed, not deployed.** |

## 1. Objective

This pass acts on the owner's first production playtest of the Zed/Ahri reference Journey. It is a presentation and renderer pass only. The curriculum, scoring, Journey orchestration, knowledge semantics and the reference chain are unchanged.

> "Every Journey child uses the same fixed stage. The state changes; the layout does not."

## 2. Owner decisions applied

| # | Decision | Where it lives |
|---|---|---|
| A | One fixed stage: board, prompt, answers and reveal at the same coordinates from Step 1 to the finish, on desktop and mobile | `index.css` "JP2 — THE FIXED JOURNEY STAGE"; `JourneyStageQuestion` |
| B | The state board is the primary media | Board takes the locked card's leftover height from `lg`; taller fixed height below `lg`; two new density tiers |
| C | Learned knowledge lives on the state | K2 join extended (`knowledge.ts`); premise / "Builds on" manifest removed; a one-line cue remains |
| D | Identical stackable consumables stack, with a count | `lib/journey/inventory.ts`, `adapter.itemsOf`, `InventorySlots` |
| E | "total AD" wherever the formula means total AD | `lib/journey/statWording.ts` (display only) |
| F | Step 2 asks the semantic question | Raw template joins the Combat seam (`JourneyCombatQuestion`) |
| G | No "Lock in answer" | A tap submits (the Ranked arena's own rule) |
| H | Reveal in reserved geometry, no clipping | `.journey-reveal` layer in the prompt box; tablet check mark kept out of the text flow |
| I | Every transition boundary is stable | Lead-in, between-children and finished states fill the same boxes |
| J | Step 3 in the same grammar; Armor 24 becomes Ahri knowledge | Same stage path; K2 champion mark |
| K | Step 4 read off the board | No manifest; Zed E carries 85 (Step 2), Ahri carries 24 (Step 3) |

## 3. Audit findings, and the cause of the choppiness

### Files that controlled each behavior before JP2

| Behavior | File(s) |
|---|---|
| Shell geometry | `JourneyModuleStage` (band + `.journey-question`) and `index.css` JOURNEY-UI2/PRES |
| Board | `JourneyStateBoard`, `JourneyPrimitives` |
| Question and answers | `MasterySliceChallengeSurface.JourneyChild`, which dispatched to **three different renderers**: the prose surface with "Lock in", the Mastery radio list with "Submit answer", and a Combat premise panel stacked over the prose surface |
| Reveal | `MasteryInlineReveal`, appended in flow |
| Transitions | `masterySliceModule` pending / complete divs |
| Knowledge marks (K2) | `knowledge.ts`, `JourneyKnowledgeMark` |
| Inventory | `adapter.itemsOf` (one slot per wire unit) |

### Causes of the reflow, clipping and choppiness

1. `.journey-question` **reset the stage's region reserves (`--qs-prompt-h` / `--qs-answers-h`) to 0**, so every child took its content height.
2. Each child kind drew a different renderer with a different height. The serialized Step 2 prompt ran to three lines. The Step 4 premise panel added about 90 px.
3. The reveal replaced the lock-in button **in flow**, and the long served prose made the desktop question box scroll (13 px at Step 4).
4. On reveal, each tablet gained a trailing check/cross icon. That narrowed the label, so a three-line formula option became four lines and the answer grid grew mid-reveal.
5. The placeholders shown between children and at the finish, the lead-in without a board, and the focus plate sized to leftover space were all content-sized.

### Measured before JP2

On the real captures:
* **1280×800:** the prompt top moved 347 → 376 → 359 → 452 and the first answer 395 → 444 → 410 → 500.
* **390×844:** the first answer moved 399 → 480 → 361 → 614, and the stage height swung from 626 to 944.

### Data questions

* **Inventory quantity / stackability:** not present anywhere. The wire lists one entry per unit, and the canonical data has no inventory stack size.
* **Raw-damage knowledge:** the backend publishes the `ability_raw_damage` fact with `object: null`. The child's own asked field (`abilities.E.raw_damage`, `reason: asked`) does name the board object, so it is anchored from that. No backend change was needed.

## 4. Implementation

### One stage

`JourneyModuleStage` = **board band + one question box**. Every Journey child answered by choosing goes through **`JourneyStageQuestion`** (new). It uses the arena's own `InteractiveScenarioSurface`, with its `data-surface-region="prompt"` / `"answers"` boxes.

The Journey stage **reserves** those regions with the same `--qs-*` tokens the ordinary Ranked stage uses:

| Width | Prompt reserve | Answer reserve | Board height |
|---|---|---|---|
| Phone (< 640) | 8.75rem | 17.5rem | 12.5rem |
| 640–1023 | 5.75rem | 15rem | 15rem |
| ≥ 1024 (locked card) | 7.75rem, then 5.75rem from 1280 | 11.75rem, then 11.5rem from 1280; 12.5rem from 1500 | Takes the rest |

The reserves were measured: the tallest real content (reference + Daily captures) plus about one line. The measurements are recorded in the CSS.

What differs per child kind is only **words**:
* **Combat** (after armor **and** the raw template): `combatQuestionSentence`.
* **Recall:** `formatRecallPrompt`.
* **Comparison:** `formatComparisonPrompt`, with champion names on the tablets.
* **Anything else:** the served prompt.

A numeric free-entry recall keeps its Mastery input, inside the same frame.

### Direct answer

A tap submits the **served option string** for that tablet, looked up by index. The module's existing guards are unchanged: not open → nothing sent; pending → one submission; a refused 409 releases the tablets. Ordinary (non-Journey) Mastery slices keep their lock-in, and `ProseChallenge` is back to its pre-Journey shape.

### Reveal

The reveal is a layer in the prompt box: the prompt is hidden, not removed. The tablets keep their place and take the surface's own reveal tones. It contains:
* the verdict ("Correct" / "Not quite" / "Time's up") and the answer;
* then **one** line of working, chosen in this order:
  1. the server's `combat_working` (Step 4);
  2. the raw result laid out from **served parts only**: the ledger's taught formula, the premise's bonus AD and the reveal's answer. For example, *"Rank 1 Shadow Slash: 70 + (70% × 20.8 bonus AD) ≈ 85 physical damage before armor"*. There is no arithmetic.
  3. the served explanation.

### Board as memory (K2 extended)

* K2 now also marks a **revealed** `ability_damage_formula` (its K1 object is the ability).
* It also marks `ability_raw_damage`, anchored only by the establishing child's asked field `abilities.<slot>.raw_damage`. A Matchup's asked cooldown and after-armor damage are never anchored; this is tested.
* Popover lines read "Formula … · Step 1", "Raw damage 85 · Step 2", "Armor 24 · Step 3", replacing the ①–⑳ markers. The ability card is titled "E · Shadow Slash · R1".

### Inventory

`stackInventory` groups by **canonical item id**, capped at the game's stack size:
* Health Potion 2003 stacks to 5.
* Control Ward 2055 stacks to 2.
* Anything else takes one slot per unit.

The count is drawn bottom-right on the slot. The State sheet says "Health Potion ×2". Purchase beats resolve to the stack's slot. The wire units are unchanged.

### "total AD"

The formula option **labels**, K2 formula lines and working ratio names use `explicitAdText` / `ratioStatLabel`:
* `attack_damage` → "total AD";
* `bonus_attack_damage` → "bonus AD".

The **submitted value is the served string** (for example, "…(+70% AD)"). The distinct distractor is preserved.

### Removed (only reached from the old Journey paths)

* `JourneyFocusMedia` + `lib/journey/focusMedia.ts`: JP1's per-child plate. The board is now the media.
* `JourneyMatchupSides`.
* `JourneyCombatPremise` (the manifest panel).
* `journeyRenderPathFor`.
* `MasteryInlineReveal`'s `working` prop.
* The related CSS.

### Transitions

* **Lead-in:** now draws the stage's empty frame (`JourneyStageLeadIn`), so Step 1 opens *into* the stage.
* **Between children and finished:** fill the same question box (`journey-stage-status`).
* **Beat:** animates inside the board, as before.

## 5. Files changed

**New**
* `src/components/journey/JourneyStageQuestion.tsx`
* `src/lib/journey/inventory.ts`
* `src/lib/journey/statWording.ts`
* `src/lib/ranked-core/modules/masterySliceModule.stageGrammar.test.tsx`
* `src/lib/journey/__fixtures__/jref/*`: 3 real captures, answers, harness, `CAPTURE.md`
* `docs/handoffs/jp2-stage-grammar/*.jpg`: before/after at 1280×800 and 390×844
* `JP2_HANDOFF.md`

**Modified**
* `src/index.css`
* `src/components/journey/`: `JourneyCombatQuestion`, `JourneyCombatWorking`, `JourneyKnowledgeMark`, `JourneyModuleStage`, `JourneyPrimitives`, `JourneyStateBoard`, `JourneyStateSheet`
* `src/components/question-surface/InteractiveScenarioSurface.tsx`: `context` widened to `ReactNode` (additive)
* `src/features/mastery/interactions/MasteryInlineReveal.tsx`
* `src/lib/journey/`: `adapter.ts`, `contract.ts` (optional `JourneyItem.quantity`), `knowledge.ts`, `realFixtures.ts`
* `src/lib/ranked-core/modules/`: `MasterySliceChallengeSurface.tsx`, `masterySliceModule.tsx`
* Tests updated to the new grammar, with the same intent:
  * `JourneyCombatWorking.test`
  * `masterySliceModule.journey` / `.journey5` / `.journeyPresentation` / `.knowledge`
  * `QuizRankedMatch.hosted.test`

**Deleted**
* `src/components/journey/JourneyFocusMedia.tsx`
* `src/components/journey/JourneyMatchupSides.tsx`
* `src/lib/journey/focusMedia.ts`

## 6. Tests

**New suite.** `masterySliceModule.stageGrammar.test.tsx`: **26/26**, on the real reference captures (correct / wrong / timeout). It covers:
* all four children on one stage path;
* no lock-in anywhere;
* a tap submits the served string, including the "(+70% AD)" distractor drawn as "total AD";
* a not-yet-open child sends nothing;
* the Step 2 sentence and the absence of serialized state;
* the Step 2 working from served parts (every number accounted for);
* Step 3 armor becoming Ahri knowledge;
* the Step 4 sentence and the absence of a manifest;
* the Step 4 server working (84.56 → 24.024 → 68);
* the K2 timeline (each fact appears at its reveal, never before, and persists), including after wrong answers and after a timeout ("Time's up · 68");
* a leak sweep over every open or live snapshot of all three captures;
* the narrow anchor (Daily M1 captures included);
* potion stacking and the generic stacking rules;
* the stage skeleton on every snapshot;
* the stylesheet reserves (the reveal is out of flow; no inner scroll).

**Focused Journey suites:** all green.

**Broad battery** (admin, quiz-ranked, ranked-core, ranked-public, journey, Daily run, analytics, ranked-arena, dev, audio, question-surface, mastery, quiz), compared by test id against a clean `origin/main` baseline:

| | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| JP2 | 5,955 | 5,918 | 33 | 4 |
| Baseline | 5,934 | 5,899 | 31 | 4 |

* JP2-only: the 2 hosted Journey tests. Both were fixed afterwards and now pass 27/27.
* The other **31 are identical to baseline**:
  * `QuestionTimeline` 14
  * `QuestionStageGeometry` 3
  * `StatCheckPage` 3
  * `AnswerGrid.elimination` 2
  * `LobbyPreviewPage` 2
  * `playModeCard.styles` 2
  * `syntheticRankedHistory` 1
  * `statCategoryIcons` 1
  * the QF1 CRLF case 1
  * `AdminPlatformPolicies` 1
  * `AdminQuizReview.proPlay` 1

  None are baseline-only.

**Re-run after the final edits** (journey, ranked-core, mastery, quiz-ranked, Daily run, question-surface, ranked-arena): 2,597 / 2,603. The 6 failures are the known pre-existing set.

**Static checks**
* `tsc -p tsconfig.app.json`: the same 2 pre-existing Supabase-typing errors.
* ESLint on changed files: 0 errors (fast-refresh warnings only, the existing pattern).
* `npm run build`: passes. The regenerated `public/sitemap.xml` was reverted.

**Backend (unchanged code, as evidence).** `test_jref1_zed_ahri_reference_journey.py` + `test_jref2_admin_reference_journey_preset.py` on `fe942a58`: **54 passed**. These prove that:
* the raw child refuses without a taught formula;
* a stated formula does not satisfy it;
* the application refuses without the raw damage or without taught, current armor;
* wrong or timed-out answers still establish facts;
* the preset freezes exactly one Journey module;
* public catalogs are untouched.

## 7. Viewport certification

**Method.** The dev harness `/dev/journey-arena` replays the real captures through the production path (`readPublicRound` → `masterySliceModule` → `CanonicalArena`). A probe steps every snapshot and records each region's coordinates.

**Desktop.** One value per region across every snapshot of the correct, wrong and timeout captures:

| Viewport | Board (y / h) | Question box (y / h) | Prompt top | Answer origin | Overflow | Lock-in | x-overflow |
|---|---|---|---|---|---|---|---|
| 1024×768 | 127 / 214 | 349 / 324 | 349 | 481 | 0 | 0 | 0 |
| 1280×800 | 127 / 282 | 417 / 288 | 417 | 517 | 0 | 0 | 0 |
| 1440×900 | 133 / 370 | 511 / 288 | 511 | 615 | 0 | 0 | 0 |
| 1920×1080 | 145 / 522 | 675 / 304 | 675 | 779 | 0 | 0 | 0 |

**Mobile and tablet.**

| Viewport | Board (y / h) | Question box (y / h) | Prompt top | Answer origin | Overflow | Lock-in | x-overflow |
|---|---|---|---|---|---|---|---|
| 768×1024 | 155 / 240 | 403 / 344 | 403 | 503 | 0 | 0 | 0 |
| 390×844 | 159 / 200 | 367 / 432 | 367 | 515 | 0 | 0 | 0 |
| 375×812 | 159 / 200 | 367 / 432 | 367 | 515 | 0 | 0 | 0 |

**Board height before JP2:** 1024 → 200, 1280 → 208, 1440 → 200, 390 → 127.

**Other certification**
* The Daily M1 captures (Volibear with transition beats and a comparison, Pantheon with a stated formula, Ahri Survival) give the same single-value result at 1024, 1280, 768 and 390.
* The lead-in frame equals the child geometry (1280: board 127/282, question 417/288).
* Every reveal fits its box.
* The K2 popover stays in the viewport on phone and desktop.

**Screenshots.** `docs/handoffs/jp2-stage-grammar/`:
* `before-*` / `after-*` at `desktop` (1280×800) and `mobile` (390×844), for Step 1–4 live and reveal, and finished;
* `after-*-step4-mark-*`: the Zed E and Ahri popovers.

These were taken with headless Edge.

## 8. Curriculum and data invariants (unchanged)

* No backend file changed.
* The reference captures show the same chain:
  * Zed/Ahri, level 2 / level 2, bonus AD 20.8;
  * formula `70 / 92.5 / 115 / 137.5 / 160 (+70% bonus AD)`;
  * raw 84.56 → **85**;
  * armor 24.024 → **24**;
  * after armor 68.1804 → **68**;
  * candidate options unchanged, and Step 1's four served options are unchanged.
* Profiles, checkpoint, P1 / T2 / S1 semantics, raw-damage currency, recipe identity, the admin preset, Daily catalogs, public Ranked catalogs and scoring are untouched. The JREF1/JREF2 suites pass.

## 9. Known follow-ups

1. **Journey-aware result presentation (the next workstream, per owner).** The result screen still shows module-level "Modules won 0/1 / Accuracy 0%". The Journey remains one Ranked module; untouched here.
2. **Backend (optional, needs owner approval):**
   * **(a)** publish `ability_raw_damage` with its ability object, so the anchor becomes a K1 fact;
   * **(b)** a raw-damage `combat_working`, so the Step 2 reveal can show the unrounded 84.56 without frontend arithmetic;
   * **(c)** `formula_choices.RATIO_LABELS` `AD` → `total AD` at the source. This re-words new compositions' options, so check it against the P1 composition pins first;
   * **(d)** a canonical inventory stack size to replace `STACKABLE_ITEM_MAX`.
3. **Survival header.** When a Survival Journey finishes, the arena header's per-child timer disappears and the whole stage shifts up 10 px. This is outside the Journey renderer and predates JP2. It affects Daily Survival only, not the reference Journey.
4. **Daily Journeys get the same grammar.** It is a renderer-level change, so the Daily's Journey module and Survival Journeys are also answered by tap, drawn in the fixed stage, and have no focus plate. Non-Journey Daily stages and ordinary Ranked are unchanged.
5. **Stated formulas are not marked.** A formula a premise **stated** (Daily Combat, `formula: state`) is shown with its question, but it is not marked on the board afterwards. Only revealed facts are marked.
6. **Other JREF1 §5 notes** are not in scope: the rules popover's "10 modules", the "Mastery Slice complete" wording and the eyebrow labels.

## 10. Exact next task

1. **Owner review.** Replay `/dev/journey-arena?capture=jref-zed-ahri` (and `-wrong`, `-timeout`) on a dev server of this branch, and look at the screenshots.
2. On approval, integrate onto the then-current `origin/main` and deploy the frontend. **No backend deploy is needed:** the frontend reads the production backend `fe942a58` unchanged.
3. Next workstream: Journey-aware result presentation.
