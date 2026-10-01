# JP5 — The Reasoning Chain, Before and After the Answer

| | |
|---|---|
| Frontend branch / worktree | `jp5/journey-equation-unfold` at `mogsy/.worktrees/jp5-equation-unfold` |
| Starting SHA | `bb2c60f4` (JP4 screenshots + handoff; JP4 code `9ed7938b`), verified clean before branching |
| JP5 commits | `628e85b9` feature · `96d3193d` polish · `4dab535c` docs (round 1) · `2fa9cfa5` compact phone chain + per-child probe · `ccdbac38` docs (round 2) · **`f578ecc4` round 3 (typed workings, per-child timing, Step 2 + haste)** · the round-3 docs commit |
| Backend | **Round 3: `jp5/journey-structured-working` at `96fff403`** (worktree `League_Combat_Simulator/.worktrees/jp5-structured-working`, from JP4 `fc95e81e`, which is untouched). Rounds 1–2 were read-only audits (§7–§10). |
| Production / Railway / Patch Ops / items / Order Forge / other worktrees | **Untouched.** Nothing pushed, merged, integrated or deployed. |
| Round 5 | **Terminology + reduction copy (§R5)**: presentation only — `(Bonus AD)`, `19.4% Reduced` / `≈16 less`, `9.1% Reduced` / `≈1.1s shorter`; "notebook" retired for **champion portrait popup**. Frontend code commit + docs commit after §R4's. Backend unchanged. |
| Round 4 | **The champion portrait popup (§R4)**: frontend `9a7a1760` + `1e46ecb7`, backend `a9a4be2e` (armor provenance in `stat_sources`). Retained board bubbles removed; stage geometry unchanged; freed space measured, not applied. |
| Status | **Not owner-approved.** Round 3 (§0) implements the bounded foundation: one typed working carrier, per-child reveal windows, Step 2 composition, haste Stage 1 — certified locally. §7–§9 below are the round-2 designs it implemented (§0 records what was actually built and where it differs). Open items: §0.7. |

## R5. Round 5 — terminology and reduction copy (presentation only)

**Status: implemented and certified locally; NOT owner-approved.** Copy and presentation only: no calculation, served value, contract, popup behaviour or stage geometry changed. Backend untouched this round (still `a9a4be2e`). Nothing pushed, merged, integrated or deployed.

### R5.1 Terminology (owner-locked)

The words are **board**, **champion portrait popup**, **mini scenario**, **Reasoning Chain**, **Journey Path**, **Exact**. "Notebook", "knowledge sheet", "workspace" and "context surface" are gone from code, tests and this handoff (`git grep -niE "notebook|knowledge sheet|context surface" -- src` is empty).

| Was | Now |
|---|---|
| `JourneyChampionNotebook.tsx` | `JourneyChampionPortraitPopup.tsx` |
| `lib/journey/notebook.ts` (`championNotebook`, `NotebookEntry`, `NotebookCheckpoint`, `NOTEBOOK_STATS`) | `lib/journey/portraitPopup.ts` (`championPortraitPopup`, `PortraitPopupEntry`, `PortraitPopupCheckpoint`, `PORTRAIT_POPUP_STATS`) |
| `jp5.notebook.test.ts`, `masterySliceModule.notebook.test.tsx` | `jp5.portraitPopup.test.ts`, `masterySliceModule.portraitPopup.test.tsx` |
| test ids / classes `journey-notebook-*` | `journey-portrait-popup-*` |
| stage-grammar mark label `opponent-notebook` | `opponent-portrait` |

The popup itself is unchanged from round 4 (per reached authored state, established or stated knowledge only, provenance when served, selector only with more than one state, no stat-category filter, no calculator). Board bubbles stay removed; the portrait keeps its `!` and opens the popup. **Bonus AD 21 lives only in Zed's champion portrait popup** — nothing new shows it, and Step 2 stays clean.

### R5.2 Copy

| Where | Round 4 | Round 5 |
|---|---|---|
| Step 2 composition node | `70% of 21 ≈ 15` / BONUS AD DAMAGE | `70% of 21 ≈ 15` / **(BONUS AD)** — League's parenthetical scaling source |
| Step 4 transformation node | `80.6%` / DAMAGE TAKEN | **`19.4%` / REDUCED** |
| Step 4 magnitude bar | `85 raw · 68 final` | `85 raw · 68 final` · **`≈16 less`** |
| Haste transformation node | `90.9%` / COOLDOWN KEPT | **`9.1%` / REDUCED** |
| Haste duration bar | `12s base · 11s effective` | `12s base · 11s effective` · **`≈1.1s shorter`** |
| Bar accessible names | `85 raw, 80.6% taken: 68 final` | `85 raw, 19.4% reduced: 68 final (≈16 less)`; `12s base, 9.1% reduced: 11s effective (≈1.1s shorter)` |

* The percentage is the share the **served** multiplier removes, `1 − mitigation_multiplier` (0.8063 → 19.4%, 100/110 → 9.1%, Leona 0.6663 → 33.4%). Never "90.9% of base", never "10% cooldown reduction" for 10 haste (a test pins both out of the haste chain).
* The flat difference is of the two **served exact** values — `raw_damage − final_damage` (84.56 − 68.1804 = 16.38 → `≈16`), `base − effective cooldown` (12 − 10.909 → `≈1.1s`) — never of the displayed whole numbers (85 − 68 would claim 17). `≈` whenever rounding was needed. It is computed client-side from the served working (`approxWhole` / `approxTenths` in `reasoning.ts`), formatting only; if the owner prefers, the backend can serve it on the working instead.
* Percentage reduction is in the Reasoning Chain; the flat difference sits at the end of the magnitude bar, after the value it arrives at. Compressed chains drop the bar as before, so the compressed reading is `85 → 24 → 19.4% Reduced → 68` and `12s → 10 → 9.1% Reduced → 11s`.
* Precision unchanged: player-facing rounding stays (Ahri Armor 24, never 24.024 outside Exact); Exact still holds the full working.
* `sharePercent` (the "share kept" writer) is removed: nothing draws it.

**Fit** (`copy-fit-r5.cjs`, expanded reveal, 375 / 390 / 768 / 1024 / 1280 / 1920, Step 2, Step 4, Volibear haste, Ahri survival haste `≈12.7s shorter`): no node text clipped, no bar label overlapping another or leaving the bar. On a 390 phone the haste bar reads `12s base` 0–47px, `11s effective` 201–273px, `≈1.1s shorter` 279–352px of 352px — fits without crowding, so no narrow-container hiding was added.

### R5.3 Certification

* **Frontend tests**: the round-4 certification set (Journey + question-surface + ranked-public + quiz-ranked + mastery + dev arena) **1988/1988** (157 files). Updated for the copy only: the old wording ("Bonus AD damage", "Damage taken", "Cooldown kept", 80.6% / 90.9% / 66.6% / 59.2%) and the renamed ids; new assertions pin `reductionPercent`, `approxWhole` / `approxTenths` (the served difference, not 85 − 68), the delta element and both bar accessible names (`≈16 less`, `≈41 less` for Leona, `≈1.1s shorter`), and that the haste chain never says "kept", "90.9", "of base" or "10% cooldown reduction". `tsc`: only the 2 known Supabase errors. ESLint: 0 errors.
* **Geometry** (focused, the four captures whose reveals changed copy — reference Zed/Ahri, Pantheon/Leona, Volibear, Ahri survival — × 375/390/768/1024/1280/1920, every snapshot: 726 states): **0 violations, 0 page errors, all 24 region sets identical to round 4's.** The stage has not moved.
* **Backend**: untouched this round (`a9a4be2e`, clean).

### R5.4 Screenshots (`docs/handoffs/jp5-equation-unfold/r5/`, live fonts, JP5-backend captures)

| File (`jp5-r5-…`) | |
|---|---|
| `zed-popup-desktop-after-step2`, `zed-popup-mobile-after-step2` | Zed's champion portrait popup after Step 2: Bonus AD 21 (its only home), provenance open: Doran's Blade +10 · Adaptive Force +5.4 ×2 · Exact 20.8 |
| `ahri-popup-desktop-armor-learned`, `ahri-popup-mobile-armor-learned` | Ahri after Step 3: Armor 24 · Lv 2 base · learned Step 3 · Exact 24.024 (the row stays 24) |
| `leona-popup-desktop-modified-armor`, `leona-popup-mobile-modified-armor` | Leona's modified Armor, provenance expanded: Lv 3 base 50.08 + Cloth Armor +15 · Exact 65.08; state selector + served note |
| `board-desktop-step2-live`, `board-desktop-step4-live`, `board-mobile-step4-live` | the cleaned board: no retained bubbles |
| `portrait-detail-step4-live.png`, `portrait-detail-mobile-step4-live.png` | 2× crop of the board at Step 4 live: Ahri's portrait `!` and active outline (her armor is an input), Zed E's `!` and outline |
| `step2-reveal-desktop`, `step2-reveal-mobile` | Step 2 reveal: `70 Base damage + 70% of 21 ≈ 15 (Bonus AD) → 85 Raw damage`, composition bar |
| `step4-expanded-desktop`, `step4-expanded-mobile`, `step4-compressed-desktop` | Step 4: `19.4% Reduced`; bar `85 raw … 68 final · ≈16 less` (expanded); four-node summary (compressed) |
| `haste-expanded-desktop`, `haste-compressed-desktop`, `haste-expanded-mobile`, `haste-compressed-mobile`, `haste-expanded-tablet768` | Volibear Q haste: `9.1% Reduced`; bar `12s base … 11s effective · ≈1.1s shorter` (expanded); `12s → 10 → 9.1% Reduced → 11s` (compressed) |

Every popup opened is fully inside the viewport (264px wide; 1280 and 390). Seen in passing, unchanged from round 4: on a 1280 board, the Leona Armor row's meta line ellipsizes after "stated" (the full "stated Step 4" is in the row's accessible name); the first-visit K2 coach bubble ("Learned facts live on the board…") overlays the opponent half on the phone shots, as it did in round 3.

### R5.5 Open for the owner

1. Visual approval of the copy (R5.2) and the champion portrait popups (R5.4).
2. Whether the flat differences should be served by the backend rather than formatted client-side from the served working.
3. The geometry pass remains unstarted (R4.6 measurements and recommendation stand: phones ≈147px horizontal, tablet/desktop ≈25–36px vertical).

## R4. Round 4 — one job each: the board, the Reasoning Chain, the champion portrait popup

**Status: implemented and certified locally; NOT owner-approved.** No geometry change was made (the owner reviews the geometry pass first, §R4.6). Nothing pushed, merged, integrated or deployed.

| | Frontend | Backend |
|---|---|---|
| Round-4 commits | `9a7a1760` code + re-captured fixtures · `1e46ecb7` grouped transition notes · the docs commit after it | `a9a4be2e` (on `96fff403`) |

### R4.1 Audit — the authority reused (verified in code and on the real captures)

| Question | Answer | Where |
|---|---|---|
| Stat-at-level authority? | **Yes.** K1 `champion_stat_at_level` facts: `context {stat, level}`, the champion object, the establishing child, the exact value; K2 joins the reveal's display. The backend asks it only where no item touches the stat, so it is the champion's own base at that level. | `knowledge.ts`, ledger `established[]` |
| Item/stat-modified values served as canonical values? | **Yes, where a premise states them**: each child's public state carries the numbers its premise states (Leona armor 65.08 after Cloth Armor; 68.872 at level 4; Zed bonus AD 20.8). Never all stats: only what a question stated. | `child.state.sides[].stats` |
| Multiple authored checkpoints? | **Yes.** Every child's state carries its node on the Journey's state path (`state_version`); transitions carry the node they lead into and a served `note` ("Leona buys Cloth Armor."). No arbitrary "Level 3 + Ruby" construct exists — none is invented. | `J3State.stateVersion`, `J3Transition` |
| Learned values tied to a state? | **Yes**: the establishing child → its `state_version`. | ledger `child` |
| Provenance? | **Partial → one additive gap.** `stat_sources` (JP4) served only bonus AD (items + shards). A stated armor had none. | backend `_stat_sources` |

### R4.2 The one backend gap, and the smallest additive contract (`a9a4be2e`)

`stat_sources` now also explains a stated **armor**, through the existing carrier and fail-closed rule: a new part kind `{"kind": "level", "level", "value"}` — the champion's base armor at the state's level (the resolved state's own `armor.at_level`, the value a `champion_stat_at_level` question teaches) — then each item's own canonical armor. Published only when the parts reproduce the stated value at the binding precision; a side with a shard page is not modelled (no breakdown). Not part of `state_key`: no composition pin moves.

Real values: Leona 65.08 = Lv 3 base **50.08** + Cloth Armor **15**; 68.872 = Lv 4 base **53.872** + Cloth Armor 15; Lee Sin 46.1925 = Lv 4 base alone.

Deploy note: the JP4/JP5 frontend reader was strict about source kinds; round 4's reader accepts `level`. The pre-round-4 JP5 frontend must not meet this backend (both are unreleased; ship together, frontend first).

Backend tests: 4 new in `test_jp5_structured_working.py` (the Leona values, reconcile + level-first shape across three recipes, fail-closed, no `state_key` movement); `test_jref1…::test_jp4_a_daily_side…` now reads bonus AD by key. Differential regression: **1021 passed / 67 failed — the 67 are exactly the pristine `fc95e81e` baseline's.**

### R4.3 The board: retained scalar bubbles removed

Removed from both halves, on every density: `Bonus AD 21` (+ its source badges), `Raw 85 !`, `Armor ?` / `Armor 24 !` / `Armor !`, `recall` faces and the transition-delta chips. `anchors.ts` and `JourneyStateAnchor.tsx` are deleted, with their CSS.

Kept: portraits, level, Q/W/E/R (each ability keeps its own learned `!` — formula, raw damage, cooldowns), items (new items stay marked all child long), shards, the transition beat, the State sheet (every stat, deltas, asked/recalled wording), current-focus outlines. The former anchor row keeps its reserved box, **empty and `aria-hidden`**, so the JP2 stage has not moved (§R4.6).

**Consequence for the owner** (the locked decision, applied literally): at Step 2 the raw-damage question's input, Zed's bonus AD 21, is no longer printed on the board (JP2's "no helper lines" keeps it out of the sentence too). It is one tap away in Zed's champion portrait popup, and Zed's portrait is **outlined** whenever the question on screen states his stats (served: a premise states exactly its question's inputs). If the owner wants inputs visible without a tap, the natural home is the Reasoning Chain's live row (its job: "surface whatever values the current question requires") — not built, because "Step 2 live remains clean" is also locked.

### R4.4 The champion portrait popup (`JourneyChampionPortraitPopup`, `lib/journey/portraitPopup.ts`)

The circular portrait is a button. It opens a compact sheet (a Radix popover, portalled, collision-padded; 16.5rem, inside the viewport at every certified width):

```
AHRI · Lv 2                              [Current state ▾]
HP          —
Armor       24   Lv 2 base · learned Step 3   ▾   → Exact · shown 24 · 24.024
MR / AD / Bonus AD / AP / AH   —
```

**Data model** — `championPortraitPopup(journey, knowledge, side, stepOnScreen) → { key, championName, current, learned, checkpoints[] }`; a checkpoint is `{ node (state_version), level, note, firstStep, lastStep, entries: { [stat]: { display, how: "learned" | "stated", step, level, exact, sources } } }`.

* **learned** = K2's revealed `champion_stat_at_level` facts (display verbatim; the exact once the ledger lists it) in the node of the child that taught them;
* **stated** = the numbers a REACHED child's premise stated for this champion, whole via the board's own `formatStatValue`, with their served `stat_sources`;
* only reached children are read (no later state, and the open child's asked stat is withheld and dropped by K2); nothing is carried into a later node (after Cloth Armor, Leona's level-3 base is not her armor); no arithmetic.
* rows are the fixed League order HP, Armor, MR, AD, Bonus AD, AP, AH (no stat-category filter, no move speed: nothing serves it); unknown rows stay `—`;
* the selector appears only when more than one authored state has been reached; it defaults to the board's state; each other state is labelled by its steps, level and served transition note;
* a row with served provenance or a rounded exact opens in place (item / shard icons, `Lv N base`, the exact total);
* the portrait wears the gold `!` when a stat was LEARNED by a reveal (right, wrong or timed out alike), glowing once when it arrives.

Base vs modified reads naturally: `Armor 24 · Lv 2 base · learned Step 3` vs `Armor 65 · Lv 3 · Cloth Armor · stated Step 4` → `Lv 3 base 50.08 · Cloth Armor +15 · 65.08`.

### R4.5 Certification

* **Frontend tests**: Journey + surface + ranked-public + quiz-ranked + mastery suites **1988/1988** (157 files) at `9a7a1760`; the note fix adds one assertion (popup suites 18/18). New: `jp5.portraitPopup.test.ts` (the join on the real captures: stated with sources, learned only from its reveal, wrong = right, the Cloth Armor and level-4 states, no unreached state, grouped transition notes) and `masterySliceModule.portraitPopup.test.tsx` (no chip on ANY snapshot of the reference and Pantheon Journeys; what stays; the portrait button and sheet; Zed / Ahri / Leona in the DOM; the input outline; the Reasoning Chain unchanged). Thirty older tests that pinned the chips were rewritten to assert the same facts where they now live (champion portrait popup, ability `!`, State sheet) — none was dropped for being inconvenient. `tsc`: only the 2 known Supabase errors. ESLint: 0 errors; no warning in a changed file.
* **Geometry**: the full sweep (9 captures × 375/390/768/1024/1280/1440/1920, every snapshot, each reveal also tapped compressed; 1,680 states): **0 violations, 0 page errors, every region set identical to round 3's** — the stage has not moved. Every champion portrait popup opened in the screenshots is fully inside the viewport (375 → 1280).
* **Ordinary Ranked**: `/dev/ranked-shell-probe`, JP4 `bb2c60f4` vs round 4, 22 states × 1280×800 / 390×844: **0 pixels over 24/255 in all 44 states** on a clean run. Two earlier runs differed only in account-dependent chrome (the floating Friends button appears once a fresh context's Supabase sign-in completes; Supabase was intermittently timing out) — in different places from run to run, in a component neither branch touches.
* **Hosts**: Ranked Bot reference, Daily Standard (Pantheon, Volibear), Daily Survival (Ahri, Volibear) — the same board component and join everywhere.
* **Tooling note**: `fonts.googleapis.com` timed out from this machine for part of the session (gstatic did not). `pw.cjs` can serve the cached stylesheets with `JP5_OFFLINE_FONTS=1`; the certified sweep and all screenshots ran with the live fonts after the network recovered.

### R4.6 Freed board space — measured, NOT applied (owner review)

The former anchor row is kept, empty (`aria-hidden`), so nothing moved. What it holds, per champion half (measured on the production client path, `freed.cjs`):

| Viewport | Board | Where the row is | Space it now wastes |
|---|---|---|---|
| 375×812, 390×844 | 337/352 × 200 | on each half's **name line** (`portrait 40px · name 129px · row 147px`) | **horizontal**: a 147px column. Names still truncate beside it ("PAN…" 46 of the 82px "PANTHEON" needs; "LEO…"). No vertical gain. |
| 768×1024 | 698 × 240 | the last grid row of each half | **21.6px + 8px gap ≈ 30px** of height |
| 1024×768 | 500 × 214 | the last grid row | **19.2px + 6px gap ≈ 25px** |
| 1280×800, 1440×900, 1920×1080 | 700/679 wide | the last grid row | **24px + 12px gap = 36px**; each half's content now ends at 154 of its 190px |

**Recommendation for a later, owner-reviewed geometry pass (not implemented):**
1. **Phones — cleaner, not shorter.** Give the name line the empty column: champion names read in full ("PANTHEON", "LEONA") with no change to the board's 200px or the question region. Lowest risk, clearest visible win.
2. **Tablet/desktop — shorter board, not larger internals.** Removing the row lets each half end at its content: 25–36px of board height per breakpoint. The best use is to give it to the **question/reveal region** (the prompt box is 96–100px at 768/1280+, the tightest reserve on the stage; +25–36px there removes most of the live-chain yield/compact pressure and lets the Reasoning Chain's expanded tier breathe), rather than enlarging board art. That touches the JP2 stage reserves (`--jq-prompt-h`, board band heights), so it needs its own sweep and owner sign-off.
3. Do not reuse the row for new board content: it would re-introduce the retained-scalar role the owner removed.

### R4.7 Reasoning Chain — unchanged

Step 2 live stays clean; Step 4 live still resurfaces `85 → 24 → ? Final damage`; expanded / compressed / reopen, haste, per-child timing and the served workings are untouched (their tests pass unchanged). The copy changes the owner is leaning toward (Step 2 patch-note parentheses; haste "≈ 9.1% reduced" / "≈ 1.1s shorter"; damage deltas) are **not** in this round.

### R4.8 Screenshots (`docs/handoffs/jp5-equation-unfold/r4/`, live fonts, JP5-backend captures)

| File (`jp5-r4-…`) | |
|---|---|
| `board-desktop-step2-live`, `board-desktop-step4-live`, `board-mobile-step2-live`, `board-mobile-step4-live` | **after**: no retained bubbles. **Before** = round 3's `r3/jp5-r3-desktop-step2-live`, `-desktop-step4-live`, `-mobile-step2-live`, `-mobile-step4-live` (Bonus AD 21, Raw 85 !, Armor !) |
| `zed-desktop-after-step2`, `zed-mobile-after-step2` | Zed after Step 2: Bonus AD 21, opened to Doran's Blade +10 · Adaptive Force +5.4 ×2 · exact 20.8 |
| `ahri-desktop-before-armor` | Ahri while Step 3 asks her armor: every row `—` |
| `ahri-desktop-armor-learned`, `ahri-mobile-armor-learned` | Ahri after Step 3: Armor 24 · Lv 2 base · learned Step 3 · exact 24.024 |
| `leona-desktop-cloth-armor`, `leona-mobile-cloth-armor`, `leona-mobile375-cloth-armor` | the modified stat: Armor 65 = Lv 3 base 50.08 + Cloth Armor 15 |
| `leona-desktop-earlier-state` | the selector on the earlier state: Armor 50 · Lv 3 base · learned Step 1 |
| `leona-desktop-level4` | the level-4 state: Armor 69 (Lv 4 base 53.872 + Cloth Armor 15), both transition notes |

### R4.9 Open for the owner

1. Visual approval of the champion portrait popup and the portrait `!` / input outline.
2. **Step 2's input** is now one tap away (R4.3): accept, or allow a live-chain input row at Step 2.
3. The geometry pass (R4.6): phones first (names), then the tablet/desktop height.
4. The copy changes still pending (R4.7).

## 0. Round 3 — the foundation (typed working, per-child timing, Step 2, haste)

**Status: implemented and certified locally; NOT owner-approved.** Nothing pushed, merged, integrated or deployed.

| | Frontend | Backend |
|---|---|---|
| Branch / worktree | `jp5/journey-equation-unfold` · `mogsy/.worktrees/jp5-equation-unfold` | `jp5/journey-structured-working` · `League_Combat_Simulator/.worktrees/jp5-structured-working` (NEW, from JP4 `fc95e81e`) |
| Round-3 commits | `f578ecc4` code + captures · the docs commit after it (this handoff, timing, screenshots) | `96fff403` |
| Untouched | JP4 worktrees, every other worktree, production, Railway, Patch Ops, items, Order Forge | `jp4/journey-stat-mods-contract` (`fc95e81e`, clean) |

A detached checkout `League_Combat_Simulator/.worktrees/jp5-baseline` (`fc95e81e`) exists only to run the backend baseline; it is clean and can be removed.

### 0.1 One carrier, typed calculations (implemented)

Every Journey working travels ONE path: `Produced.working` → `JourneySlice.workings` → the private row's `combat_working` → that child's own reveal (`own_challenge_reveals[]`, the submit response's `challenge_reveal`) and its review row. `contract` names the shape; `calculation` says what it explains. Old readers ignore an unknown contract (the JOURNEY5 reader's exact-key allowlist returns null).

| Contract | `calculation` | Fields (all served, 4 dp) | Emitted only when |
|---|---|---|---|
| `combat_working.v1` | `physical_ability_damage` | unchanged | (unchanged) |
| `raw_damage_working.v1` | `physical_ability_raw_damage` | `attacker`, `ability`, `formula {flat, ratios[{stat,label,ratio,value}]}` (the after-armor sub-shape; `value` = the EXACT stat the evaluator bound, `result.formula_bindings`), `terms [{term:"flat",value}, {term:"ratio",stat,value}]`, `raw_damage` | flat + Σ ratio×bound stat reproduces `result.raw_damage` unrounded, AND the rounded terms reproduce the rounded total |
| `cooldown_working.v1` | `cooldown_under_haste` | `champion`, `ability`, `base_cooldown`, `ability_haste`, `cooldown_multiplier` (= `calculate_cooldown.haste_to_cooldown_multiplier`, the function the state derivation used), `effective_cooldown`, `unit` | base × multiplier reproduces the candidate's answer |

`answer` (the display string) is injected at reveal time by the existing `combat_working_reveal`, for every variant. A working that does not reconcile is omitted; the child still composes and its reveal keeps its prose. No champion-specific code; no pin input moves (workings live on private rows only; `_pin` hashes the Journey blocks).

Real values (canonical DB): Zed E r1 `70 + 0.7 × 20.8 = 70 + 14.56 = 84.56`; Volibear Q r1 `12 × 0.9091 → 10.9091` (answer 11); Olaf Q r3 (flat shape) `9 → 8.1818`; Ahri R under Kindlegem → 127.

Frontend: `readJourneyWorking` (`lib/journey/combatWorking.ts`) dispatches on `contract` to one allowlist reader per variant (fail closed; the raw reader also refuses terms out of formula order or not summing to the served total). `MasteryChallengeReveal.working` carries the typed block; `combatWorking` stays the after-armor variant only for older readers (review card).

### 0.2 Per-child reveal timing (implemented)

* **Freeze** (`ranked_modules/mastery_slice.py`): `journey_reveal_windows(workings, base)` — per child, the window for the calculation its reveal PRESENTS, from `JOURNEY_WORKING_REVEAL_WINDOWS_MS = {physical_ability_damage: 6000 (only a real reduction, 0 < m ≤ 1), physical_ability_raw_damage: 4000, cooldown_under_haste: 6000}`; everything else keeps the base (1750). A policy never shortens a longer base. The list is frozen as top-level `reveal_windows_ms` **only when non-uniform**; `reveal_window_ms` stays the base and the switch. Outcome-independent: a wrong answer or a timeout is revealed exactly as long as a right one.
* **Read** (`ranked_public/segment_flow.py`): `reveal_windows_from_payload` returns the scalar, or a per-child tuple (missing/invalid entries fall back to the scalar, never 0; the list alone switches nothing on); `window_at(windows, i)`. Every reader indexes by child: `card_schedule` / `_pooled_schedule` (`available = settled + windows[i]`), the final hold (`_final_hold`: the last REACHED child's own window, read after the chain, so a pool exhausted on an earlier child holds THAT child's window; still none after a strike stop), `durations_ms`, `reveal_compensation_seconds` (Σ windows[:n−1]), `card_schedules`, `resolve_outcomes`, `start_card_deadline`.
* **Service**: compensation at all three sites; `_open_segment` now passes the final hold too (the pre-existing omission: the open-time deadline now equals the rehydrated one); bot stamps `Σ windows[j<idx]` and `card_start = stamp + windows[idx] + beat`; `own_reveal_until` uses the revealing child's window. New client fields, **only on per-child segments** (absent otherwise, so every other payload keeps its key set): `segment_state.own_reveal_window_ms`, submit response `challenge_reveal_window_ms`.
* **Frontend**: the hold uses `own_reveal_window_ms ?? reveal_window_ms` (read once per held reveal) and is armed for what is LEFT of the server's reveal (`own_reveal_until`), so a reveal remounted mid-way (reload) never outlives the server. The Journey poll after a reveal uses the same window.

Pooled clocks are unaffected by construction (a card's duration is `settled − started`; reveals sit between). Certified end to end (below).

### 0.3 Choreography inside the granted window (measured)

`reasoning.ts`: `UNFOLD_COMPRESS_AT_MS = 3200` (a fixed, measured point — no longer 60% of the window), `UNFOLD_MIN_COMPRESSED_MS = 1200`: a window shorter than 4400 ms never folds (1750 stays expanded). Motion tightened so the bar settles in ~0.6 s (was ~1.2 s): contract 440 ms from 120 ms, endpoint lands at 440–600 ms.

Measured on the real client path (`/dev/journey-arena`, JP5 captures, reveal starting at mount; desktop 1280×800, phone 390×844 within 20 ms). Raw logs + contact sheets: `docs/handoffs/jp5-equation-unfold/timing-r3/`.

| Reveal (served window) | Bar / segments settled | Folds | Fold done | Settled expanded (readable) | Compact state, no tap | Reopened visible after a tap at fold + 0.5 s / + 1.0 s | Gone |
|---|---|---|---|---|---|---|---|
| Step 4 after armor (6000) | 0.60 s | 3.19 s | 3.55 s | **2.59 s** | **2.46 s** | **2.25 s / 1.74 s** | 6.01 s |
| Haste (6000) | 0.60 s | 3.20 s | 3.54 s | **2.60 s** | **2.44 s** | — / **1.70 s** | 5.98 s |
| Step 2 raw composition (4000) | 0.60 s (segments joined 0.50–0.56 s) | — (never folds) | — | **3.40 s** | — | — | 3.99 s |
| Simple reveals (1750) | — | never | — | 1750 ms, unchanged | — | — | — |

Round 2's 60/40 split at 6000 gave 2.42 s expanded, 2.09 s compressed and 1.53 / 1.01 s reopened; the fixed fold and the faster bar give **+0.2 s of reading, +0.4 s of compact state and +0.7 s of reopened time** in the same 6000 ms. **Step 2 at 4000 ms**: 3.4 s of settled reading for a three-node sum (3500 would leave ≈2.9 s; the simple 1750 leaves ≈1.2 s). **Haste at 6000 ms**: the same choreography as the armor unfold, so the same window.

### 0.4 Step 2 — raw-damage composition

`rawReasoning(working)`: `[70 · Base damage] + [70% of 21 ≈ | 15 · Bonus AD damage] → [85 · Raw damage]` — the term is the SERVED contribution (14.56, shown 15), the `≈` is written because the stat and the term are rounded for display (a whole stat and an exact term write `=`), and the answer follows by an arrow (70 + 15 is not how 84.56 was reached). Exact: `Exact bonus AD: 20.8 · 70% of 20.8 = 14.56 · 70 + 14.56 = 84.56 · Shown as 85`. Below it the **composition bar**: the base segment and the scaling segment side by side, each `flex-grow`-weighted by its own served term (`--jc-w: 70` / `14.56` — no quotient in the client), ending at `85 raw`; segments slide in and close up (~0.6 s). The reveal box keeps the unfold's node heights, so the bar fits the JP2 box.

**The regex and the subtraction are deleted** (`explainedExact`, `exactRaw`, `raw − flat`); a source-guard test forbids them. A reveal from a backend BEFORE JP5 (no working) keeps a words-only chain `[70] + [70% of · 21 · Bonus AD] → [85]` from the taught formula and the stated stat — no number derived — so the frontend can ship before the backend without Step 2 losing its chain.

**Consequence (owner decision):** Step 3's Exact line ("Exact armor at level 2: 24.024") also came from the prose regex. Nothing structured serves 24.024 at Step 3's own reveal (it reaches Step 4 as an established value), so Step 3 now has no Exact control. Restoring it needs a served value (e.g. a `champion_stat_at_level` working) — not built (outside the bounded foundation).

### 0.5 Ability haste — Stage 1

`cooldownReasoning(working)`: `[12s · Base cooldown] → [10 · Ability haste] → [100 / (100 + 10)] → [0.909] → [90.9% · Cooldown kept] → [11s · New cooldown]`, the formula and decimal are DETAIL, the share is the TRANSFORM (tap to reopen) — the same fold, reopen and timing as the armor unfold, and the **duration bar** is the existing magnitude bar at the served `cooldown_multiplier` (`12s base … 11s effective`). The formula is drawn only when the served multiplier IS `100/(100+AH)` (checked, never computed). Certified on Volibear (Daily Standard + Survival) and, generically, Ahri R under Kindlegem (Survival). No live chain (Stage 2 not built: no base-cooldown dependency is served).

### 0.6 Certification

**Tests**
* Backend: `test_jp5_structured_working.py` **37/37** (reading the frozen windows incl. malformed lists; per-card and pooled chains with mixed windows; timeout followed by its own window; the final hold = the last REACHED child's window, incl. pool exhaustion on a long child and no hold after a strike; pool paused through a long reveal; `projected_terminal_at` monotone; block durations; compensation; the freeze policy; the reference and haste workings on the canonical DB; fail-closed raw/cooldown builders; end to end on the reference preset: frozen list `[1750, 4000, 1750, 6000]`, `own_reveal_window_ms` / `own_reveal_until` through reconnects, the pool unchanged through the long reveal, the final 6000 ms hold for **correct, wrong and timeout**, and the bot's stamps measuring only its think time (mutation-checked: fails with the scalar offset)).
* Backend differential regression (41 suites: Journey 2–5, K1, motion, JREF1/2, JCHAIN1, JFND1, JX2, DD1, DCMOD, DCSURV, DSC1, TTC1, DCGR products, ranked mastery reveal/secrecy/on-demand/applied-chain, segment timer, answer safety, stat shards, per-question reveal): **1017 passed / 67 failed; the 67 are exactly the pristine `fc95e81e` baseline's** (canonical-DB drift pins, `quiz1_segment_config`, `ranked_mastery_applied_chain`, two per-question-reveal key-set tests) — no new failure, none fixed. Five end-to-end tests that hard-coded 1750 ms for every child now read the child's own window (`test_journey5_release` helper, `test_journey_motion_v1_beats`, `test_journey2_core`, `test_journey3_daily`, `test_journey_k1_knowledge_objects`); the Survival driver in `test_dcgr_content_products` polls up to 12 s (was 4.8 s) for the next card.
* Frontend: Journey + surface set (`lib/journey`, `components/journey`, `ranked-core/modules`, `question-surface`, `pages/dev/journey-arena`) **779/779**; with `ranked-public`, `quiz-ranked`, `features/mastery` **1970/1970**. New: `jp5.working.test.ts` (typed readers on the real captures, no working before settle, fail-closed); Step 2 / haste / per-child-timing DOM tests in `masterySliceModule.jp5.test.tsx`. `tsc -p tsconfig.app.json`: only the 2 known Supabase errors. ESLint on changed files: 0 errors.

**Geometry** — the full sweep (`.claude/jp5-scripts/sweep.cjs`: every snapshot of 9 captures — the 7 JP5 captures + the pre-JP5 reference and Pantheon — at 375/390/768/1024/1280/1440/1920, each reveal also tapped compressed; 1,680 states): **0 page errors; every region set identical to the certified JP2–JP5 sets** (the Survival captures' second set at ≥1024 is the known Survival board shift, identical to round 2's). Violations found and fixed during the sweep: the words-only Step 2 term was too wide on a phone (now `70% of` over `21 · Bonus AD`), and the composition's "15" clipped at 1024 (segment words now show only in the widest reveal box); after the fixes the reference captures re-swept at all seven widths with **0 violations**, and the final screenshot probes report 0 violations. Node sizes stay uniform through expanded → compressed (390: 6×72×44 in two rows → 4 in one; 1280: 6×92×52 → 4); the reveal box is filled to its fixed height and never beyond (140/140 phone, 100/100 desktop).

**Ordinary Ranked** — `/dev/ranked-shell-probe`, JP4 (`bb2c60f4`) vs JP5 round 3, 22 states × 1280×800 and 390×844: **0 pixels over 24/255** anywhere.

**Hosts** — Daily Standard (Volibear, Pantheon), Daily Survival (Volibear, Ahri) and the Ranked Bot reference preset, all captured on the JP5 backend and swept; the hold/timing path is the same module for all three.

**Screenshots** — `docs/handoffs/jp5-equation-unfold/r3/jp5-r3-*.jpg` (served windows, no probe; the reveal snapshot is read 0.5 s in): Step 2 live/reveal (1280, 390, 1920); Step 4 live/expanded/compressed/reopened (1280), timeout expanded, expanded at 1440, live/expanded/compressed (390); haste expanded/compressed (1280, 390), expanded at 768; Ahri R haste (375); **Pantheon compact live at 375 and 390** (`[armor] 50 → ? Final`, unchanged); Pantheon Step 3 expanded (1280). Timing contact sheets: `timing-r3/`. Videos (not in git): `.claude/jp5-timing-recordings/`.

### 0.7 Remaining before owner visual approval

1. **Visual approval** of the Step 2 composition bar, the haste chain + duration bar, the 3.2 s fold point, and the "New cooldown" / "Cooldown kept" labels (the owner's "Effective cooldown" clipped in the phone and dense-desktop node; "New cooldown" is the same length class as "Final damage").
2. **Policy numbers**: after armor 6000, raw 4000 (measured ≈3.4 s of settled reading; 3500 would leave ≈2.9 s), haste 6000. They are backend constants in one table.
3. **Step 3 Exact line** (0.4): accept its removal, or commission a served stat value.
4. **Readable reopen**: at 6000 ms a tap 1.0 s after the fold leaves ≈1.7 s of reopened equation (0.5 s → ≈2.25 s). The learner-held reveal (§7.3) remains unbuilt.
5. **Deploy order** is free: new frontend on an old backend keeps JP4/round-2 behaviour (words-only Step 2, scalar windows); old frontend on the new backend ignores the new contracts and holds for the scalar window then "opening…" until the server opens the next child (it cannot answer early).
6. **Cooldown comparison** (§10) and **Haste Stage 2** stay deferred as before; integration of JP3–JP5 onto main is still the prerequisite for the comparison chain.

### 0.8 Files (round 3)

**Backend** (`96fff403`): `mastery/setup_state/journey.py` (`raw_damage_working`, `cooldown_working`, the contract/calculation constants, wired into `_produce_raw_damage` / `_produce_cooldown`); `ranked_modules/mastery_slice.py` (`JOURNEY_WORKING_REVEAL_WINDOWS_MS`, `journey_reveal_windows`, `PAYLOAD_REVEAL_WINDOWS_MS`, frozen in `_generate_journey`); `ranked_public/segment_flow.py` (`REVEAL_WINDOWS_KEY`, `reveal_windows_ms` / `_from_payload`, `window_at`, `final_reveal_from_payload`, `_final_hold`, per-child chains, durations, compensation); `ranked_public/service.py` (compensation sites, `_open_segment` final hold, bot offsets, `own_reveal_until`, `own_reveal_window_ms`, `challenge_reveal_window_ms`); tests as in §0.6.

**Frontend** (`f578ecc4`): `lib/journey/combatWorking.ts` (typed readers, `readJourneyWorking`); `lib/ranked-public/contracts.ts` (`MasteryChallengeReveal.working`, `SegmentStateView.ownRevealWindowMs`); `lib/journey/reasoning.ts` (`rawReasoning(working)`, `rawWordsReasoning`, `cooldownReasoning`, `isHasteFormula`, `ReasonComposition`, `UNFOLD_COMPRESS_AT_MS`; `explainedExact` deleted); `components/journey/JourneyReasoning.tsx` (`JourneyComposition`, magnitude wording); `components/journey/JourneyStageQuestion.tsx` (`workingReasoning`, `data-compose`); `lib/ranked-core/modules/masterySliceModule.tsx` + `MasterySliceChallengeSurface.tsx` (per-child hold, `working` prop); `pages/quiz-ranked/useRankedMatch.ts` (poll after the child's own window); `pages/dev/journey-arena/JourneyArenaHarness.tsx` (probe rewrites the own window; `jp5-ref-*` hosted as Ranked); `lib/journey/realFixtures.ts` + `__fixtures__/jp5/`; `index.css` (composition bar, shared unfold heights, faster bar); tests.

## 1. Objective

JP4 made every reveal a Reasoning Chain. JP5 extends **that same chain** (no second component) so it starts before the answer and teaches the derivation on the reveal:

* **Live** — a child that relies on established facts shows them under its question: `85 Raw damage → 24 Ahri armor → ? Final damage`.
* **Expanded** — the reveal unfolds the whole derivation at once: `85 → 24 → 100/(100+24) → 0.806 → 80.6% → 68`, with a magnitude bar sized by the served `mitigation_multiplier`.
* **Compressed** — it folds to `85 → 24 → 80.6% Damage taken → 68`; the 80.6% node is a button that reopens it.

The board and its `!` marks are unchanged, and so is the JP2 stage geometry.

## 2. Owner decisions (as given) and where they live

| Decision | Where |
|---|---|
| Generic `relies_on → established → reveal display` join; no backend contract change for it | `lib/journey/adapter.ts` (`prerequisites3`, `JourneyPrerequisite`) |
| Never infer a dependency the server did not serve (haste, comparison get no live chain today) | same; tested on Volibear, Ahri Survival, Pantheon |
| Shown value = the establishing reveal's text ("85"); the ledger's 84.56 is never rounded client-side | same (K2's rule) |
| No live chain on Zed Step 2 | `reasoning.liveReasoning` (closed vocabulary: raw damage, champion stat) |
| Unfold all at once; arrows only (never `85 × 0.806 = 68`); Exact keeps `84.56 × 0.8063 ≈ 68.1804` | `reasoning.combatReasoning`, `index.css` JP5 §4 |
| Magnitude ratio = served `mitigation_multiplier` | `ReasonMagnitude.ratio` → `--jm-ratio` → `width: calc(var(--jm-ratio) * 100%)` |
| Never lengthen a reveal client-side; the unfold only divides the served window | `useEquationUnfold`, `unfoldCompressAtMs` |
| **Round 2: do not move Journey timing to 4000ms**; study per-child timing | §7 (design only) |
| **Round 2: Pantheon phone must keep its dependency** | §4.1 compact form |
| **Round 2: Step 2's regex/subtraction is technical debt; do not build on it** | §8 (design only; the JP4 chain is untouched) |
| Ability haste and cooldown comparison stay in scope | §9, §10 (design only) |

## 3. Files

**New** — `src/lib/journey/jp5.contract.test.ts`, `src/lib/ranked-core/modules/masterySliceModule.jp5.test.tsx`, `docs/handoffs/jp5-equation-unfold/*`, `JP5_HANDOFF.md`.

**Changed**

* `src/lib/journey/adapter.ts` — `JourneyPrerequisite`, `JourneyRevealDisplay`, `prerequisites3`; `adaptJourneyJ3` / `journeyViewFor` take the segment's reveals (optional).
* `src/lib/journey/reasoning.ts` — node flags `given / asked / detail / transform / short`; `liveReasoning`; the multiplier as formula / decimal / share; `ReasonMagnitude`; `sharePercent`; `unfolds`; `unfoldCompressAtMs`.
* `src/components/journey/JourneyReasoning.tsx` — chain `phase` (`live / expanded / compressed`), an `inline` rendering from phrasing elements (list roles), the transform button, `JourneyMagnitude`, `useEquationUnfold`.
* `src/components/journey/JourneyStageQuestion.tsx` — the live chain (in the prompt box, or inside a stated formula's line); the reveal's unfold state.
* `src/components/journey/JourneyQuestionText.tsx` — `useFittedQuestion` steps a `data-yields` block down (stacked → one line → compact → yielded) before the box would grow.
* `src/components/question-surface/InteractiveScenarioSurface.tsx` — optional `promptFooter` (only the Journey stage passes it).
* `src/lib/ranked-core/modules/masterySliceModule.tsx`, `MasterySliceChallengeSurface.tsx` — reveals and the server's reveal window / end instant reach a Journey child only.
* `src/pages/dev/journey-arena/JourneyArenaHarness.tsx` — dev-only `?revealMs=` probe, and `&revealChild=<i>` to limit it to one child's reveal.
* `src/index.css` — JP5 block (live tiers incl. compact, unfold tier, two-row break, fold, magnitude bar, motion).
* Tests updated because JP5 supersedes their Step-4 lock: `jp4.contract.test.ts`, `masterySliceModule.jp4 / .stageGrammar / .journey5 / .visualLanguage`.

## 4. Behaviour

**Live.** Prerequisites come from the child's own `learner.relies_on`, joined to its `learner.established` and the establishing child's reveal. A fact must belong to an earlier child and must not be the asked fact, or it is dropped. The asked node is a literal `?`.

| Child | Live chain |
|---|---|
| Zed/Ahri Step 4 | `85 Raw damage → 24 Ahri armor → ? Final damage` |
| Pantheon/Leona Step 3 | `50 Leona armor → ? Final damage` (phones: `[armor] 50 → ? Final`, §4.1) |
| Zed Step 2; Pantheon Steps 4–5 (formula only) | none |
| Ability haste, cooldown comparison, Steps 1 and 3 | none (no served dependency) |

**Reveal.** A Combat working whose multiplier is the armor formula yields six nodes; the fraction and the decimal fold away. Nodes established earlier are `given` and do not animate in. A multiplier that is not the armor formula keeps JP4's single node. Steps 2 and 3 are exactly JP4's.

**Timing.** (Round 3: a fixed fold at 3200 ms, §0.3; this paragraph described round 2's 60% split.) Measured on the server's clock (`own_reveal_until`), so a reload mid-reveal lands in the right phase; a window leaving under 1.2s for the compressed state is not divided (1750ms stays expanded). A tap takes over until the child leaves.

**Reduced motion** (OS setting or `html.reduce-motion`): no animation or transition; the bar is drawn at the served ratio; phases still switch.

**Phone reveal.** Expanded takes two rows (three and three); compressed is one row of four; node size is constant through the phases.

### 4.1 The compact live form (round 2)

On phones Pantheon Step 3's prompt box already holds a four-line question and a two-line stated formula at the smallest certified type (19.5px; it is four lines at every size down to 17px). There is no row to spare, so the chain now takes no row:

* Beside a formula the child **states**, the live chain belongs to that premise line (rendered from spans with `list`/`listitem` roles, since a `<p>` may hold only phrasing content).
* A new step before yielding, **compact**, draws the dependency at its semantic minimum — the stat's mnemonic and its value, then the open `?` named by its kind: **`[armor] 50 → ? Final`**. It flows onto the formula's last line (about 165px of text there; the chain is 96px).
* The champion's name gives way (the board's target already carries the armor `!`); the spoken label still says "Leona armor: 50". The asked node's one-word kind (`short: "Final"`) is served by the chain builder, not derived in CSS.
* Fit order is now stacked → one line → compact → yielded. Measured: the question stays 19.5px, the box uses 138.9 of 140px (unchanged), nothing else moves.

| Viewport | Zed Step 4 | Pantheon Step 3 |
|---|---|---|
| 375, 390 | stacked | **compact** (was yielded) |
| 768 | stacked | one line |
| 1024 | stacked | stacked |
| 1280–1920 | stacked | one line |

## 5. Certification

**Geometry sweep** (round 1: all seven captures × seven widths, 1,085 states; round 2 re-run in full, then Pantheon + reference again after the final CSS): **0 violations, 0 page errors, every region set identical to the certified one.** Checks: prompt overflow and growth, live chain inside the prompt box, reveal overflow x/y, uniform node size, node/label clipping, row overlap, board bounds, document x-overflow.

| Viewport | Board y / h | Question y / h | Prompt h | Answers y |
|---|---|---|---|---|
| 375×812, 390×844 | 139 / 200 | 347 / 432 | 140 | 495 |
| 768×1024 | 155 / 240 | 403 / 348 | 96 | 507 |
| 1024×768 | 127 / 214 | 349 / 324 | 136 | 493 |
| 1280×800 | 127 / 302 | 437 / 268 | 100 | 545 |
| 1440×900 | 133 / 390 | 531 / 268 | 100 | 643 |
| 1920×1080 | 145 / 558 | 711 / 268 | 100 | 823 |

JP4 run through the same sweep (390, 1280, 1920) gives identical region sets, including the known Survival finish shift (the board absorbs 10px from 1024 up).

Question type beside a live chain, JP4 → JP5 (measured on both at 390, 1280, 1920): Zed Step 4 28–29 → 21.5px desktop, 23 → 22.5px phone; Pantheon Step 3 20 → 19.5px desktop, 19.5 → 19.5px phone (now with its chain). JP5 alone: Zed 20px at 768, 26.5px at 1024; Pantheon 18px at 768 and 1024. All inside the stage's 17–30px.

**Ordinary Ranked** — `/dev/ranked-shell-probe`, all 22 states, JP4 vs JP5 (round 1): 0 pixels over 24/255 at 1280×800; 2 pixels in one media state at 390×844. Round 2 changed only Journey-scoped CSS and the Journey stage; the `promptFooter` guard test still passes.

## 6. Tests

* **New**: `jp5.contract.test.ts` (20) and `masterySliceModule.jp5.test.tsx` (45): the join on real captures, no leakage, right/wrong/timeout equivalence, fail-closed drops, live/expanded/compressed builders, the magnitude from the served multiplier, the window division, live Step 4, no live Step 2, board untouched, all-at-once unfold, auto-compress at 3500/4000/4500 and none at 1750, reload mid-reveal, manual reopen/close, Pantheon reuse and its compact premise-line form, reduced motion, fixed-stage guards, the four-step fit order, three hosts, ordinary Ranked.
* **Journey + surface suites** (`lib/journey`, `components/journey`, `ranked-core/modules`, `question-surface`, `pages/dev/journey-arena`): **755 / 755**.
* **Broad run vs JP4** (round 1, 4,105 vs 4,042 tests): 12 shared unrelated failures (`AnswerGrid.elimination` 2, `QuestionStageGeometry` 3, `LobbyPreviewPage` 2, `syntheticRankedHistory` 1, `statCategoryIcons` 1, `StatCheckPage` 3); 2 JP5-only in that run, both passing in isolation (a CRLF working-copy artefact, now resolved; a load-sensitive TeamSim test).
* `tsc -p tsconfig.app.json`: the same 2 pre-existing Supabase errors. ESLint on changed files: 0 errors.

## 7. Reveal timing: measurements and a per-child design (round 2 — IMPLEMENTED in round 3, §0.2–§0.3)

### 7.1 Measurements (dev probe only, Step 4 only)

Production stays at `reveal_window_ms = 1750`. The probe rewrites the captured snapshot before the production parser reads it; round 2 used `&revealChild=3`, so every other reveal kept its captured 1750ms. Instants are the page's own, in ms from the reveal mounting (desktop; phone runs are within 20ms).

| Window | Bar landed | Compress | Fold done | Gone | Settled expanded | Compressed (no tap) | Reopened visible, tap +0.5s / +1.0s |
|---|---|---|---|---|---|---|---|
| 1750 (prod) | 1192 | — | — | 1760 | 0.57s (never folds) | — | — |
| 3500 | 1190 | 2103 | 2431 | 3506 | 0.91s | 1.08s | 0.52s / — |
| 4000 | 1174 | 2411 | 2744 | 4014 | 1.24s | 1.27s | 0.73s / — |
| 4500 | 1190 | 2703 | 3031 | 4507 | 1.51s | 1.48s | 0.92s / — |
| **5000** | 1192 | 2996 | 3326 | 5006 | **1.80s** | **1.68s** | **1.13s / 0.63s** |
| **5500** | 1184 | 3296 | 3625 | 5510 | **2.11s** | **1.89s** | **1.34s / 0.82s** |
| **6000** | 1180 | 3598 | 3928 | 6016 | **2.42s** | **2.09s** | **1.53s / 1.01s** |

Reading of the owner's target ("2–3s of readable expanded state, a usable compressed state, a readable reopen, simple reveals not slow"):

* **Expanded 2–3s** is first met at **5500ms** (2.1s) and comfortably at **6000ms** (2.4s), with 1.9–2.1s of compressed state after the fold.
* **A readable reopen is not reachable by a fixed window of this size.** After a realistic ~1s reaction the reopened equation is up for 0.8–1.0s at 5500–6000ms. Holding it ≥2s would need about 7.3s at the 60% split — or a server-authoritative hold (§7.3).
* **Simple reveals** stay at 1750ms only if the window is per child (§7.2); a Journey-wide 5500–6000ms would add ~15s to the four-step reference Journey.

Contact sheets and event logs: `docs/handoffs/jp5-equation-unfold/timing/jp5-timing-<window>ms-<device>[-reopen|-reopen1000].{jpg,json}`. Recordings: §13. Live: `/dev/journey-arena?capture=jref-zed-ahri&step=14&revealMs=6000&revealChild=3`, then ▶.

### 7.2 Proposed authoritative per-child reveal window

Verified in `ranked_public/segment_flow.py` ("sf"), `ranked_public/service.py` ("svc"), `ranked_modules/mastery_slice.py` ("MS"):

**Where the single window is assumed**

* Frozen once per segment: `MS:1747` (`reveal_window_ms or JOURNEY_REVEAL_WINDOW_MS`), `MS:1820-1827`.
* Read as a scalar in: `sf.reveal_compensation_seconds` (`window × (count−1)`, block clocks), `sf.card_schedule` / `sf._pooled_schedule` (`available = settled + reveal`, per index — already loop per child), `CardSchedule.final_reveal` (**set before the loop**, one value), `sf.card_schedules`, `sf.start_card_deadline`, `sf.resolve_outcomes`, `sf.durations_ms`, `svc.segment_state_view` (`reveal_until = min(next open, settled + window)`), the bot (`reveal_offset * idx`), the submit response and segment state (`reveal_window_ms`).
* Precedent: the Journey's per-child `open_delays_ms` already flows through the same schedule functions, indexed per child, with an absent list meaning "original behaviour".

**Can a child carry its own window safely?** Yes. Every per-card and pooled reader walks children one index at a time; `own_reveal_until` is already per-reveal and authoritative. One structure must change shape: the final-reveal hold must become `windows[last played]`, computed after the loop.

**Contract (additive, backward-compatible)**

* Top-level public payload `reveal_windows_ms: [int]`, length `challenge_count`, frozen by `MS._freeze_segment` **only when non-uniform** (uniform segments stay byte-identical). Computed in `MS._generate_journey` from what is in hand at freeze: children whose `composed.child_workings[i]` is set (the Combat derivation reveal) get `JOURNEY_WORKING_REVEAL_WINDOW_MS` (a new constant beside `JOURNEY_REVEAL_WINDOW_MS`), others the base.
* The scalar `reveal_window_ms` stays as the base value and the on/off switch.
* New client fields: `segment_state.own_reveal_window_ms` (the revealing child's window) and the submit response's `challenge_reveal_window_ms`. Nothing is added to the Journey block (that would reach the cursor functions, which copy unexcluded keys to the reached prefix, and the byte pins).

**Readers to change** — `sf`: `reveal_windows_ms(row)` (short/invalid entries fall back to the scalar, never to 0); `card_schedule` / `_pooled_schedule` index by the settling child; `final_reveal` after the loop; `reveal_compensation_seconds` sums `windows[:count−1]`; thread through `card_schedules`, `start_card_deadline`, `resolve_outcomes`, `durations_ms`. `svc`: the 3 compensation call sites, both `start_card_deadline` sites (and pass `final_reveal_ms` at `_open_segment`, a pre-existing omission), bot offsets (`Σ windows[j<idx]`, `windows[idx]`), `reveal_until` by `revealing.index`.

**Effects**

| Surface | Effect |
|---|---|
| Pooled clock (Daily Standard, reference) | unchanged: the pool is paused while a card is pending (`active_time_running`), and durations exclude the reveal |
| Per-card (Survival) | next card opens at `settled + windows[i]`; correct once indexed |
| `own_reveal_until` / reload | recomputed from persisted rows + the frozen list: a reload mid-reveal lands correctly |
| Final child | `complete_at = terminal + windows[last]` — needs the post-loop fix |
| Timeouts | a timed-out Combat child would also get the long reveal (product decision, §12) |
| Ranked Bot | bot offsets must use the per-child windows, or the bot gains a speed edge |
| Daily Review re-ask | block-clocked, one child, no server hold; the window is a client hint there, and it only exists when the deployment flag is set |
| Old frozen segments | no list → byte-identical |
| Old clients | hold the scalar, then "opening…" until the server opens the next child; they cannot answer early |

**Frontend (later)** — hold for `own_reveal_window_ms ?? reveal_window_ms` (still gated by `own_reveal_until`) and divide that window in `useEquationUnfold`. No other change.

**Tests** — mixed windows under pooled / per-card / block clocks (next-open instants, unchanged durations, pool remainder inside a long reveal); a long final child (`complete_at`, `projected_terminal_at`, `own_reveal_until`); pool exhaustion on a short child after a long one and the reverse; strike stop on a long child (no hold); timeout + long reveal; reconnect mid long reveal; long reveal followed by a grouped beat; old segments without the list and malformed lists; Review re-ask; bot stamps in both branches; open-time deadline equals rehydrated deadline; no list in `public_view` / pre-reveal payloads; `_pin` unchanged; the freeze policy (only children with a working, frozen at generation). End-to-end tests that hard-code `REVEAL_MS` after a Combat child's reveal may move (candidates: `test_journey5_release.py:231-240` and `:524-569`, `test_journey_motion_v1_beats.py:244-246`; which children carry a working in each canonical composition was not established without the DB).

### 7.3 If a reopen must be readable: a learner-held reveal

A bounded, server-authoritative "hold" (the learner reopens; the server extends that one reveal once, up to a cap) is the only way to guarantee reading time after a reopen. It is much larger: a new action endpoint, a new persisted table (reveal rows are insert-only) and migration, new schedule inputs through every reader above, worst-case deadline budgeting (the cap for every unrevealed child, for both players), and a PvP griefing lever (the opponent's completion waits on holds). Recommendation: decide 7.2 first; treat 7.3 as a separate design only if ~1s of reopened time is not acceptable.

## 8. Step 2: structured raw-damage working (round-2 design — implemented in round 3 through the ONE carrier, not a new key: §0.1, §0.4)

**The debt.** JP4's `rawReasoning()` shows `70% of 21 = 15` from `84.56 − 70`: `84.56` is regex-parsed from the reveal's explanation prose (`explainedExact`) and the subtraction runs in the client. (The same prose parse also supplies Step 3's Exact line.) The contribution is not served anywhere.

**What the backend has in hand** in `_produce_raw_damage` (`mastery/setup_state/journey.py:1212-1292`): the disclosure (`flat_at(rank)`, ratios as identifier/coefficient), the premise stats at 4 dp, the exact stat values used (`explanation.derivation_inputs`, keyed by metric), the evaluator's `formula_bindings`, and `result.raw_damage`. The evaluator returns only the total — no per-term breakdown. Only linear, level-independent, verified physical formulas can be raw-damage children (`_teachable_disclosure`), so `flat + Σ ratio × stat` reproduces the total by construction at the disclosure's probe points; piecewise formulas and 6-dp rounding still justify a reconcile.

**Proposed contract** — a new reveal-only private key (not `combat_working`, whose consumers expect armor/mitigation fields), sharing `combat_working.v1`'s `formula` sub-shape so one frontend reader serves both:

```json
{"contract": "raw_damage_working.v1", "calculation": "physical_ability_raw_damage",
 "damage_type": "physical",
 "attacker": {"side": "player", "champion": "Zed"},
 "ability": {"slot": "E", "name": "Shadow Slash", "rank": 1},
 "formula": {"flat": 70, "source": "revealed", "established_in_child": 0,
   "ratios": [{"stat": "bonus_attack_damage", "label": "bonus attack damage",
               "ratio": 0.7, "value": 20.8, "contribution": 14.56}]},
 "attacker_stats": {"bonus_attack_damage": 20.8},
 "raw_damage": 84.56,
 "answer": "85"}
```

* `contribution` = ratio × the **exact** stat (from `derivation_inputs`), rounded to the Combat binding precision (4 dp, `CS._round`). The block is emitted only if `flat + Σ contribution` reconciles with `result.raw_damage` (JP4's `stat_sources` fail-closed rule); otherwise it is omitted and the child still composes.
* `answer` is injected at reveal time (`correct_answer_display ?? correct_answer`), exactly as `combat_working_reveal` does, so the client never rounds a total.
* Display precision: terms are served exact; the chain shows them whole. Whole terms need not sum to the whole answer (70.4 + 14.4 → 70 + 14 vs 85), so the chain draws `=` only when they do, else `≈`.

**Backend files** — `journey.py` (`raw_damage_working()` beside `combat_working()`, set in `_produce_raw_damage`, `child_working` fills `formula.source` / `established_in_child` from the ledger), `ranked_modules/mastery_slice.py` (private key, `_working_extra` routing by contract, `challenge_reveals`, reveal helper), `ranked_public/review.py`, `answer_safety.py` (`FORBIDDEN_PRE_REVEAL_KEYS` += the new key; `combat_working` is not listed today either). No identity or `_pin` input changes (workings live only on private rows). No servable recipe has a raw child today; only the reference Journey's Step 2.

**Frontend files** — `src/lib/journey/combatWorking.ts` (shared `formula` reader + `readRawDamageWorking`), `src/lib/ranked-public/contracts.ts` (reveal and review readers), `masterySliceModule.tsx` / `MasterySliceChallengeSurface.tsx` (pass the held reveal's working), `JourneyStageQuestion.tsx` (use the working; **delete** `explainedExact` from the raw path), `reasoning.ts` (`rawReasoning` takes served terms; Exact lines from served numbers), `JourneyCombatWorking.tsx` (review). A reveal without the block falls back to JP4's words-only term (`70% of 21`, no number) — the regex path is removed, not kept as a fallback.

**Tests** — backend: the reference child's values (70, 0.7, 20.8, 14.56, 84.56; reconciles), fail-closed omission, private-row only, disclosed only after settle, present in review, re-ask `source: stated`, forbidden-key walk, pins unchanged. Frontend: fail-closed reader, the chain's numbers equal the served terms, no prose parsing left (source guard), legacy reveal words-only.

## 9. Ability haste: verified recipes and a staged extension (Stage 1 implemented in round 3 on the ONE carrier as `cooldown_under_haste`: §0.1, §0.5; Stage 2 not built)

**Verified against the recipe catalog and the canonical-DB tests** (`mastery/setup_state/data/journey_recipes.v1.json`; haste children resolve to `combat_cooldown` per `test_journey4_catalog.py`; ranks from `skill_paths.v1.json`; AH from the item data):

| Recipe (status) | Haste child → earlier intrinsic child | Plans with it | Rank | Base fact key |
|---|---|---|---|---|
| `jungle.volibear_vs_leesin` J-A (featured) | c3 Q (Caulfield's) → c1 | standard, survival, standard_alt | 1→1 | `r1` |
| `top.olaf_vs_sett` T-C (featured) | c3 Q → c1 | standard, survival | 3→3 | **`flat`** (confirmed by the real capture) |
| `jungle.olaf_vs_jarvan` J-B (p1_ready) | c3 Q → c1 | standard, survival | 3→3 | flat (inferred) |
| `jungle.nocturne_vs_vi` J-C (p1_ready) | c4 Q → c1 | standard, survival, standard_alt | 2→2 | flat (R1 label) |
| `mid.pantheon_vs_ahri` M-C (p1_ready) | c3 E → c1 | standard, survival | 1→1 | `r1` |
| `mid.ahri_vs_syndra` M-D (p1_ready) | c6 R (Kindlegem) → c4 | survival | 1→1 | `r1` (confirmed by capture) |
| `support.leona_vs_thresh` S-B (hold) | c4 E → c2; **c5 R → none** | standard, survival | — | — |
| `support.nautilus_vs_leona` S-D (hold) | c3 Q → c1; **c4 R → none** | standard, survival | — | — |
| `top.riven_vs_darius` T-B (hold_formula) | c5 Q → none | refused earlier anyway | — | — |

* **Every servable haste child** has an earlier intrinsic child for the same ability at the **same rank**, the base value matches by construction, and the recipe already names that child in `reinforces`. So the dependency is valid for all servable recipes.
* It is **not** a property of the haste family: the held S-B/S-D plans ask an R cooldown after a haste item with no intrinsic R child. It is a property of authored chains.
* The key must follow the intrinsic child's shape rule (`flat` vs `r<rank>`), which `_produce_cooldown` can look up.

**Strength options**

| Option | Refuses | Moves |
|---|---|---|
| (i) always-on enforced `requires` (`what: "base_cooldown"`) | 4 held plans (S-B, S-D standard/survival); breaks `test_journey4_catalog.py:432` | public/private pins of 13 of 31 servable compositions; `test_journey3_daily.py:443-448` |
| (ii) recipe opt-in vocabulary | nothing | recipe digests, catalog digest, every `composition_key` of opted-in recipes (most disruptive) |
| (iii) non-gating declaration (emitted only when the base fact is established and current) | nothing | the same 13 pins as (i); needs a new soft-requirement path in the ledger |
| (iv) link inside a reveal-only working | nothing | nothing |

**Recommended, staged**

1. **Stage 1 (no pin movement): `cooldown_working.v1`**, reveal-only on a new private key (not `Produced.working`: `test_journey5_release.py:390` asserts non-Combat children have none):

   ```json
   {"contract": "cooldown_working.v1", "calculation": "ability_cooldown_under_haste",
    "side": "player", "champion": "Volibear",
    "ability": {"slot": "Q", "name": "Thundering Smash", "rank": 1},
    "base_cooldown": {"value": 12, "fact": "ability_cooldown:volibear:Q:r1", "established_in_child": 0},
    "ability_haste": {"value": 10, "sources": [{"kind": "item", "item_id": "3133", "name": "Caulfield's Warhammer", "value": 10}]},
    "multiplier": 0.9091, "effective_cooldown": 10.9091, "unit": "seconds", "answer": "11"}
   ```

   Everything is in hand in `_produce_cooldown` / the haste candidate (`derivation_inputs` base and bound haste, exact answer, unit, precision); `multiplier` from `calculate_cooldown.haste_to_cooldown_multiplier` (the function the state derivation used); omitted unless `base × multiplier` reconciles; `sources` optional and reconciled. This gives the reveal chain `12s Base cooldown → 10 Ability haste → 100/(100+10) → 90.9% → 11s Effective cooldown` and the duration bar (the existing magnitude bar, ratio = served `multiplier`).
2. **Stage 2 (only if a LIVE haste chain is wanted): option (iii)** for the authored pairs, accepting the 13 pin updates. The frontend already resurfaces any `relies_on` generically once its vocabulary names cooldown kinds; `prerequisites3` would take the champion from the fact's K1 object when no withheld row exists.

**Backend files** — `journey.py` (`_produce_cooldown`, a `cooldown_working()` builder, a per-child reveal-extras path through `JourneySlice` / `ComposedJourney`), `ranked_modules/mastery_state_slice.py`, `ranked_modules/mastery_slice.py`, `ranked_public/review.py`, `answer_safety.py`; stage 2 adds `Ledger` and the pin/test updates above.

**Generality** — nothing in the haste path names a champion. Generic refusals: static cooldowns, dual-form or charge shapes, rank 0, unresolved haste. Future risk: a shard page with Ability Haste (5007) would make node 0 a haste node, so a haste child could never have an intrinsic partner.

**Tests** — J-A c3 values and answer; T-C flat key; omitted when not reconciling; private/reveal-only incl. the forbidden key; pins unchanged (stage 1); stage 2: refusal-free composition of every plan, the exact pin movements, and the leak walks (the base cooldown may appear only because an earlier child established it).

## 10. Cooldown comparison: integration dependency and certification path

* **No new backend contract.** `comparison_values.v1` (DD1, in backend `fc95e81e`) already serves both authoritative values on the reveal: `sides[{token, value, display}]`, `unit`, `unit_label`, `operator`, `delta`, `delta_display`.
* **Integration dependency.** This branch's merge base with `origin/main` is `50f9ff88` (JP2). `origin/main` (now `623ce3ce`) already has JP2, DD1's reader (`src/features/mastery/contracts/comparisonValues.ts`, `MasteryChallengeReveal.comparisonValues`) and Order Forge changes in `ranked-core/modules` — but not JP3–JP5.
* **A boundary to keep.** Main's `masterySliceModule.dataDuel.integration.test.tsx` (DD1-F) locks that a **Journey** comparison renders the Journey stage and **never** the Data Duel view. So the comparison chain belongs in `JourneyReveal`, reading `reveal.comparisonValues` — not a route into Data Duel.

**Certification path, once JP3–JP5 converge with main** (no merge of main into JP5 now):

1. Integrate JP3 → JP4 → JP5 onto the then-current main on a dedicated integration branch (as JP2 was), resolving `contracts.ts` / `masterySliceModule.tsx` / `MasterySliceChallengeSurface.tsx` against DD1 and Order Forge; DD1-F stays green.
2. Re-capture the M1 Standard Journeys (Volibear c5 R, Pantheon c2 E, Olaf c2 Q) on a backend that includes DD1, to prove a Journey compare reveal carries the block (backend has no Journey-specific test for it; add one: private row frozen, disclosed only after settle).
3. Frontend: `comparisonReasoning(comparisonValues, comparisonSemantics, board)` — two value nodes (displays verbatim) with paired magnitude bars sized by the served `value`s (proportion only, as DD1 does), the relationship from `delta_display` + `operator`, the winner from `correct_answer`; ties; legacy reveals (no block) keep the prose.
4. Tests: DD1-F unchanged; no values before settle; bars from served values only; a Journey comparison never mounts Data Duel; the geometry sweep. No live chain for comparisons (nothing is relied on by design).

## 11. Screenshots

`docs/handoffs/jp5-equation-unfold/`, headless Edge through `/dev/journey-arena`, dev server started from this worktree. Reference shots from `96d3193d`; all Pantheon shots from `2fa9cfa5` (the only change after `96d3193d` that affects rendering is Pantheon's premise-line chain). Live and expanded shots run at the captures' 1750ms (the reveal arrives by ▶, shot 1.3s in); compressed shots use the 4000ms probe.

| File (`jp5-final-…`) | |
|---|---|
| `desktop-step2-live`, `desktop-step2-reveal` | 1280×800, unchanged from JP4 |
| `desktop-step4-live`, `-expanded`, `-compressed` | 1280×800 |
| `desktop1440-step4-live`, `-expanded` | 1440×900 |
| `mobile-step2-live`, `-reveal`, `mobile-step4-live`, `-expanded`, `-compressed` | 390×844 |
| `daily-pantheon-desktop-step3-live`, `-expanded`, `-compressed` | reuse, one-line live tier |
| `daily-pantheon-desktop1024-step3-live` | stacked live tier |
| **`daily-pantheon-mobile375-step3-live`**, **`daily-pantheon-mobile-step3-live`** (390) | **the compact form** |
| **`daily-pantheon-mobile375-step3-prompt-3x.png`**, **`daily-pantheon-mobile-step3-prompt-3x.png`** | the prompt box at 3× |
| `daily-pantheon-mobile-step3-expanded` | the reveal on a phone |
| `daily-voli-desktop-haste-reveal` | a haste reveal, unchanged (no chain invented) |
| `timing/…` | §7.1 |

Every committed shot was retaken until all of its images had loaded (the board's art comes from the remote asset host, which was intermittently slow).

## 12. Owner decisions open

1. **Complex-reveal window** for the per-child design: 5500ms (2.1s settled expanded) or 6000ms (2.4s). Simple reveals stay 1750ms.
2. **Readable reopen:** accept ~1s of reopened time at that window, or commission the learner-held reveal (§7.3) as its own design.
3. **Approve the per-child timing backend change** (§7.2), including whether a timed-out Combat child also gets the long reveal.
4. **Approve `raw_damage_working.v1`** (§8), after which the regex/subtraction path is deleted.
5. **Haste:** stage 1 only, or stage 1 + stage 2 (non-gating `relies_on`, moving 13 pins); enforced `requires` is not recommended (it would refuse two held recipes' plans).
6. **When to integrate** JP3–JP5 onto main, which is the prerequisite for the comparison work (§10).

## 13. Worktree hygiene

* `git status --short` in the JP5 worktree is clean after the docs commit.
* Screen recordings (29 `.webm`, ~46MB) are **not in version control**: `mogsy/.worktrees/jp5-equation-unfold/.claude/jp5-timing-recordings/`, ignored by the repository's `.git/info/exclude` (`.claude/`).
* `src/index.css`'s working copy has LF endings (the repo stores LF; no content change). It keeps one line-ending-sensitive stylesheet test passing in this Windows checkout.
* The dev-server launch entries used for capture live in the JP2 worktree's `.claude/launch.json` (git-excluded).

## 14. Next task

1. Owner visual approval of round 3 (§0.7): the Step 2 composition bar, the haste chain and duration bar, the fixed fold point, the labels, and the three policy windows.
2. Owner decisions in §0.7 (Step 3 Exact line; readable reopen).
3. Then integrate: backend `jp5/journey-structured-working` onto master and JP3–JP5 frontend onto main on dedicated integration branches (either may deploy first, §0.7.5); re-capture on the integrated backend; then the comparison chain (§10).
4. Stop generalizing (owner's hard stop): no infrastructure for shields, DPS, on-hit, healing, penetration chains, thresholds or an animation DSL until real Journey content needs it.

## 15. Worktree hygiene (round 3)

* Frontend and backend worktrees: `git status --short` clean after the docs commit.
* The capture, sweep, timing, screenshot and ranked-diff scripts used in round 3 are kept (git-excluded) in `mogsy/.worktrees/jp5-equation-unfold/.claude/jp5-scripts/` (run with cwd = this worktree, dev server `jp5-vite` on 8095; `ranked-diff.cjs` also needs `jp4-vite-cwd` on 8096; `capture_jp5_test.py` runs from the backend worktree with `LOL_CALC_DB_PATH=C:/Users/mlmit/mogzy-data/lol_calc.db` and `JOURNEY_CAPTURE_OUT`; `run_be.sh <worktree> <out>` is the backend differential suite).
* `League_Combat_Simulator/.worktrees/jp5-baseline` is a detached `fc95e81e` checkout used only for the backend baseline run; safe to remove.
* Do not edit `src/` while a sweep runs: Vite's reload destroys the page context mid-sweep.
