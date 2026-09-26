# JOURNEY K2: knowledge marks on Journey objects (frontend V1)

| | |
|---|---|
| Branch | `journey-knowledge-ui-v1` (worktree `.worktrees/journey-knowledge-ui-v1`) |
| Base | JP1 `f6d30034` (`journey-presentation-v1`), **not** `origin/main` |
| Backend contract | K1 `597a2432` (`k1/knowledge-objects`), `journey_knowledge_object.v1` |
| Backend | not modified. It was run only from a throwaway detached worktree to capture real payloads. |
| Status | local commit only, **not pushed** |

## What it does

A board object the Journey has **established** a fact about gets a tiny gold `!` at the top-right of its icon.

* **Hover** (mouse) opens a small popover, and leaving closes it.
* **Click or tap** pins the popover. A second click or tap closes it, and so does an outside tap or Escape.

The `!` means "the Journey established something usable here". It does **not** mean "you answered correctly":

* a wrong answer + reveal marks the object the same way;
* a timeout + reveal marks it the same way;
* nothing in the mark reads `is_correct`.

## Contract consumed

K1 handoff §1.3 join, mirrored from the backend's reference `_marks()`. Implemented in `src/lib/journey/knowledge.ts` `journeyKnowledge(journey, own_challenge_reveals, own_card_index)`:

```
for each reached child c:
  c.learner.established[] with object AND source == "revealed"  → mark
  c.learner.asks_fact     with object AND reveal(asks.child)     → mark
drop the fact the OPEN child (own_card_index) asks               (S4)
de-duplicate by fact; group by object.key
display := reveal(child).correct_answer_display ?? reveal(child).correct_answer
```

### Reader: additive, strict allowlist (`src/lib/journey/j3.ts`)

* **`knowledge_object_contract`** is optional on the block. The join acts only on `journey_knowledge_object.v1`.
* **`object` / `context` / `unit`** are optional on `learner.established[]` and `learner.states[]`. A fact carries all three or none.
  * `object` must be `{type: ability|champion, key, side, champion_id, slot?}`.
  * **The key is cross-checked.** It must equal `<side>:<champion_id>[:<slot>]`, or the read fails.
  * `context` allows only `rank` (int or `null`), `ability_haste`, `stat` and `level`.
  * `unit` must be `"seconds"` or `null`.
* **`learner.asks_fact`** is optional, and must have **exactly** its six keys. A `value`, label or any extra key fails the read. This is tested.
* **Segments frozen before K1** (every J3/J4 capture) read with `knowledgeContract: null` and draw no marks. **Review re-asks** also have no marks, because the backend strips their K1 keys.

### Reveal reader (`contracts.ts`)

`own_challenge_reveals[].correct_answer_display` is now read into `correctAnswerDisplay`. The key is added **only when the wire carries one**, the same pattern as `combatWorking`, so every existing reveal keeps its exact shape.

### Display rule

**The value shown is the reveal's string, verbatim.**

* The frontend never rounds, never reconstructs an answer, and never prints the ledger `value`. For example, the haste cooldown's ledger value is 10.909… and the learner sees the reveal's `"11"`.
* A fact whose reveal is not in the payload has **no mark**. It is not hidden with CSS: the value is never rendered.
* Context numbers (`ability_haste: 10.0` becomes "10 AH") are printed as JSON gives them, with no arithmetic.

### Board keys

The board's `subject` maps to K1's `player`. A mark is looked up by:

* `player|opponent:<championId>:<slot>` on each ability;
* `player|opponent:<championId>` on each portrait.

The board side's `championId` must match. A mark whose champion is not on that side draws nothing (tested). The same code serves both sides; neither is special-cased.

## Supported fact kinds (V1)

| kind | object | popover line |
|---|---|---|
| `ability_cooldown` | ability icon | `⏱ 12s ①` (title `Q · R1`; a flat cooldown, `rank: null`, is titled `Q`) |
| `ability_cooldown_under_haste` | ability icon | `⚡ 11s · 10 AH ③` |
| `champion_stat_at_level` | champion portrait | `Armor 50 ①` (title `Lv3`, stat labels from the existing `JOURNEY_STAT_META`) |

When facts on one object disagree on rank or level, the header drops it and each line gets a lead (`R2`, `Lv5`). The step marker (①…⑳) is the only provenance shown.

## Deferred fact kinds (no mark)

* **`ability_damage_formula` (stated):**
  * the value is a formula object, which would make the popover a paragraph;
  * K1's only stated fact with an object is this one, so **no stated fact is marked in V1**.
* **`ability_damage` (Combat damage)** and **`ability_cooldown_compare`**: both have `object: null`, and no object means no mark.
* **Items:** K1 has no item fact kind. Items are never marked (tested).
* **Premise-derived facts:** these are not ledger facts (K1 §10).

## Badge and popover design

* **Badge (`JourneyKnowledgeMark`):**
  * a gold circle (`#e8c97a`, the slot-badge palette) with a dark `!`;
  * 8px on phone (compact board) and 12px from the band density;
  * a 1px dark rim and a small shadow.
* **Hit area:** it is widened by an invisible `::before` (about 22px on phone), not by the badge's box.
* **Placement:**
  * The badge is absolutely positioned at the icon's top-right corner, so it lays out nothing.
  * **Abilities:** it is pinned to the tile's corner. It reaches no further right than the kit's gap, so it never touches the next tile's top-left rank digit.
  * **Portraits:** it sits on the round portrait's bounding-box corner, off the face.
* **Hosts:** every portrait and ability sits in a same-size `journey-know-host`, marked or not.
  * A mark appearing therefore changes no box.
  * The badge is a *sibling* of the icon's `role="img"`, never inside it, so it stays reachable by assistive tech.
  * The compact grid's portrait rule now targets the host.
* **Accessible label:** `Known facts: Volibear Q`. Each popover line has a spoken sentence, e.g. "Q cooldown at rank 1 with 10 ability haste: 11s, step 3".
* **Popover:**
  * It uses the existing Radix `Popover` primitive, portalled so the board's `overflow: hidden` cannot clip it.
  * Its placement is `side="top"` with `collisionPadding` 8, and `max-width: min(14rem, 100vw − 16px)`.
  * It uses the board's black-glass / gold-hairline style.
  * It has **no** explanatory text: no "learned", "correct" or "established".
* **Where marks live:** on the state board (portraits + Q/W/E/R) only.
  * The question's large focal icon (`JourneyFocusMedia`) is **not** marked. It shows the current question's object, whose new fact must not be marked anyway, and the board already carries the persistent icon. No icon was duplicated to hold a badge.

## Question safety

* **Before settlement:** no mark and no value for the asked fact.
  * `asks_fact` has no value.
  * A mark needs `reveal(child)`, and the reveal reader already refuses any reveal at or beyond `own_next_challenge_index`.
  * The open child's fact is dropped as well (S4).
* **During the reveal hold:** the child's own fact is marked. Its reveal is in `own_challenge_reveals`, and the marks are computed from the **live** state, not the held board.
* **Leak test:** the test sweeps every snapshot of every K1 capture. In none of them is the open child's asked fact a mark, and every mark has its reveal. The DOM test opens the popover on a live haste question and asserts that its answer is absent.

## Final-child behavior

The final child's fact is in no later child's `established` list, because there is no later child. It is marked from its own `asks_fact` + its reveal, during J5's final reveal window (`own_finished: true`, `own_card_index: null`).

The marks persist:

* through the finished state, because the board stays mounted around "Mastery Slice complete" and the reveals stay listed;
* through every reconnect.

The real case is Ahri/Syndra survival:

* child 3 asks Ahri R r1 @ 10 AH and is answered **wrong**;
* the final reveal marks R with `140s ②` and `127s · 10 AH ③`.

The timeout case is `voli.standard.timeout`: child 0 spends the whole pool, and its reveal (`player_answer: null`) marks Q `12s ①` in the final window.

## Responsive certification

**Setup:**

* **Harness:** `/dev/journey-arena`, with the real K1 captures added to its registry (`k1-*`).
* **Browser:** headless Edge (Playwright), with touch emulation below 768px.
* **Board baseline:** the same child's pre-K1 J4 capture (no marks), at the same width.

**Scenarios:**

1. one fact (`k1-voli` child 2 live);
2. two facts (`k1-voli` child 4 live);
3. + 4. opponent champion (`k1-pantheon` child 2);
5. live question, no leak (`k1-voli` child 3 live: the haste answer is absent);
6. final child (`k1-ahri-survival` final reveal);
7. reconnect (`final-reconnect`; `voli.standard.timeout` reconnect).

"No-fact object" is covered on every screen: each has 10 objects and only the listed ones are marked.

| Width | Board (K1 = J4 baseline) | h-overflow | Badge / icon, corner cover | Popover in viewport | Hover | Tap/click · 2nd tap · outside | Leak |
|---|---|---|---|---|---|---|---|
| 375×812 | 121 = 121, stable | 0 | 8/16px ability 10%; 8/26px portrait 4% | ✓ all 7 | n/a (touch) | ✓ ✓ ✓ | none |
| 390×844 | 127 = 127, stable | 0 | same | ✓ all 7 | n/a | ✓ ✓ ✓ | none |
| 1024×768 | 200 = 200, stable | 0 | 12/26px 11%; 12/36px 7% | ✓ all 7 | ✓ | ✓ ✓ ✓ | none |
| 1280×800 | 208 = 208, stable | 0 | same | ✓ all 7 | ✓ | ✓ ✓ ✓ | none |
| 1440×900 | 200 = 200, stable | 0 | same | ✓ all 7 | ✓ | ✓ ✓ ✓ | none |

**Question scroll:** 0 everywhere except these cases, all of which are pre-existing:

* **1024, `voli` child 3 (live):** 14px. It is identical on the unmarked J4 capture of the same child, so the content is taller and the marks did not cause it.
* **Final / timeout reveal states:** 44px / 5px at 1024 and 21px at 1280. A served reveal scrolls inside the question by JP1 design.

Board heights equal JP1's certified figures (121 / 127 / 200 / 208 / 200).

**Screenshots:** `docs/handoffs/journey-knowledge-ui-v1/*.jpg`. They show 390 and 1440 for each scenario, plus 1024 for two facts, each with the popover open. Ability art is missing in some phone shots because of headless asset loading; the badge and popover are unaffected.

## Tests

**New:** `src/lib/ranked-core/modules/masterySliceModule.knowledge.test.tsx`, 30 tests on real K1 captures through the production parser, the join and the production `masterySliceModule` viewport.

* **Contract:**
  * all captures parse and name v1;
  * a `value` on `asks_fact` fails the read;
  * a mismatched object key fails the read;
  * a pre-K1 (J4) block has no contract and no marks.
* **Establishment:**
  * no mark while the asking child is open;
  * correct + reveal gives a mark;
  * wrong + reveal gives the same mark;
  * flipping every `is_correct` changes nothing;
  * timeout + reveal gives a mark, and nothing is marked before it.
* **Display:**
  * the reveal's `"11"` is shown, not the ledger's 10.909…;
  * `correct_answer_display` wins over `correct_answer`, and neither is re-rounded (`"12.000"` stays `"12.000"`);
  * a missing reveal means no mark.
* **Grouping:** two facts produce one badge with `Q · R1 / 12s ① / 11s · 10 AH ③`. A flat cooldown is titled `Q`.
* **Objects:**
  * `object: null`, Combat damage and the stated formula get no mark;
  * the opponent key goes to the opponent portrait;
  * a wrong-side key draws nothing;
  * items are never marked.
* **Final child and reconnect:**
  * the Ahri R final wrong answer is marked in the final window;
  * the finished state keeps every mark;
  * 3 reconnect pairs give equal marks.
* **Leakage:** the all-snapshot sweep, and the DOM popover on a live question.
* **Interaction:**
  * hover opens and leave closes;
  * click pins and a second click closes;
  * a touch hover does nothing, a tap opens and a second tap closes;
  * Escape closes.
* **JP1 layout:**
  * same-size hosts, testids unchanged, and the badge sits outside the `role="img"`;
  * the stylesheet keeps the portrait grid rule, keeps the badge absolutely positioned and keeps the motif clip.

**Existing suites:** journey, ranked-core, ranked-public, ranked-arena, question-surface, mastery, ranked, quiz-broadcast and dev harnesses. Full sweep: 238 files, 3619 tests.

* **After the final fixes:** the affected set is 163 files / 2164 tests, with **6 failures**. These are exactly JP1's known pre-existing set: `QuestionMotifLayer.qf1` 1, `AnswerGrid.elimination` 2 and `QuestionStageGeometry` 3.
* **Also failing on untouched JP1 `f6d30034`:** 7 dev-page tests (`lobby-preview` 3, `stat-check` 4). They reproduce identically there.
* **`TeamSimPage.phase5a`:** it failed once under full-suite load and passes in isolation.
* **`tsc -p tsconfig.app.json --noEmit`:** the same 2 pre-existing Supabase-typed errors, none in changed files.
* **ESLint on changed files:** 0 errors. The 4 existing fast-refresh warnings are in `masterySliceModule.tsx`.
* **`npm run build`:** passes. The build rewrote `public/sitemap.xml`, which was reverted and not committed.

## Captures (`src/lib/journey/__fixtures__/k1/`)

These are real K1 backend output (see `CAPTURE.md`): `voli.standard` (K1's own wrong/right/wrong sample), `pantheon.standard` (opponent Leona armor), `ahri.survival` (final child answered wrong), `voli.standard.timeout` and `voli.survival`. The harness is stored as `capture_k2_test.py.txt`.

## Findings for the backend / owner

* **`plan: "standard_alt"` is rejected by the frontend J3 reader** (`plan must be standard|survival`). The Daily only serves `standard` / `survival` today (`JOURNEY_PLAN_BY_CHILDREN`), so it is latent.
  * K1's handoff cites "M-A `standard_alt` ends on Zed R" as a real final-child example. That Journey could not be played by this client if it were ever served.
  * The served final-child example is Ahri/Syndra survival, which is what K2 certifies.
* **`mid.ahri_vs_syndra.level_six`** is `journey2_fixture` (not servable). `mid.ahri_vs_syndra` is the servable one.

## Not done (out of scope)

Motion V1, transition compression, formula/calculator display, SFX, item facts, premise extraction, notebook/history, cross-Journey memory, closed-book modes and dynamic curriculum. No backend change.

## Final SHA

The commit carrying this file (`git log --oneline -1` on `journey-knowledge-ui-v1`).
