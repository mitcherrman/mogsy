# JP5 — The Reasoning Chain, Before and After the Answer

| | |
|---|---|
| Frontend branch / worktree | `jp5/journey-equation-unfold` at `mogsy/.worktrees/jp5-equation-unfold` |
| Starting SHA | `bb2c60f4` (JP4 screenshots + handoff; JP4 code `9ed7938b`), verified clean before branching |
| JP5 commits | `628e85b9` feature · `96d3193d` polish · `4dab535c` docs (round 1) · `2fa9cfa5` compact phone chain + per-child probe · the docs commit after it (round 2: this handoff, timing, screenshots) |
| Backend | **Not modified.** Read-only audits of `League_Combat_Simulator/.worktrees/jp4-stat-mods-contract` (`fc95e81e`): §7–§10. |
| Production / Railway / Patch Ops / items / Order Forge / other worktrees | **Untouched.** Nothing pushed, merged, integrated or deployed. |
| Status | **Not owner-approved.** Phase A works and is certified locally; the owner rejected a Journey-wide 4000ms window and the Pantheon phone drop (both addressed in round 2). All backend work is proposal only (§7–§10). Open decisions: §12. |

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

**Timing.** Compress at 60% of the server's window, measured on the server's clock (`own_reveal_until`), so a reload mid-reveal lands in the right phase; a window leaving under 1.2s for the compressed state is not divided (production's 1750ms stays expanded). A tap takes over until the child leaves.

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

## 7. Reveal timing: measurements and a per-child design (no backend change made)

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

## 8. Step 2: structured raw-damage working (design only)

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

## 9. Ability haste: verified recipes and a staged extension (design only)

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

1. Owner decisions (§12).
2. Then, in the approved order: the backend per-child window (§7.2), `raw_damage_working` (§8), `cooldown_working` (§9 stage 1) — each with the tests listed — and a re-capture of the reference and M1 Journeys on that backend.
3. Integrate JP3–JP5 onto main; then the comparison chain (§10).
