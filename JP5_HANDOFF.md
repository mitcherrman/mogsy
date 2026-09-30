# JP5 — The Reasoning Chain, Before and After the Answer

| | |
|---|---|
| Frontend branch / worktree | `jp5/journey-equation-unfold` at `mogsy/.worktrees/jp5-equation-unfold` |
| Starting SHA | `bb2c60f4` (JP4 screenshots + handoff; JP4 code `9ed7938b`), verified clean before branching |
| JP5 code commits | `628e85b9` feat, `96d3193d` polish |
| Screenshots, timing captures + this handoff | the commit after `96d3193d` (docs only) |
| Backend | **Not modified.** Read-only audit of `League_Combat_Simulator/.worktrees/jp4-stat-mods-contract` (`fc95e81e`) for Phase B (§9). |
| Production / Railway / Patch Ops / items / Order Forge / other worktrees | **Untouched.** Nothing pushed, merged, integrated, deployed or triggered. The JP4 worktree was only read (and served by a dev server for baseline comparison). |
| Status | Phase A implemented and certified locally. **Four owner decisions open (§11).** Phase B is a proposal only. |

## 1. Objective

JP4 made every reveal a Reasoning Chain. JP5 extends **that same chain** (no second component) so it starts before the answer and teaches the derivation on the reveal:

* **Live** — a child that relies on established facts shows them under its question: `85 Raw damage → 24 Ahri armor → ? Final damage`.
* **Expanded** — the reveal unfolds the whole derivation at once: `85 → 24 → 100/(100+24) → 0.806 → 80.6% → 68`, with a magnitude bar sized by the served multiplier.
* **Compressed** — it folds to `85 → 24 → 80.6% Damage taken → 68`; the 80.6% node is a button that reopens it.

The board and its `!` marks are unchanged. The JP2 stage geometry is unchanged.

## 2. Decisions applied

| Decision | Where |
|---|---|
| No backend contract change; generic `relies_on → established → reveal display` join | `lib/journey/adapter.ts` (`prerequisites3`, `JourneyPrerequisite`) |
| Nothing inferred: a child with no `relies_on` gets no live chain (ability haste, cooldown comparison) | same; tested on Volibear, Ahri Survival, Pantheon |
| A prerequisite's shown value is the establishing reveal's text ("85"), never the ledger's exact number (84.56) rounded client-side | same (K2's existing rule) |
| No live chain on Zed Step 2 (it relies on the formula, which is not a value) | `reasoning.liveReasoning` — a closed vocabulary: raw damage, champion stat |
| Unfold all at once; never fraction → decimal → percent serially | one entrance animation for every new step, no per-step delay (`index.css` JP5 §4) |
| Arrows only; never imply `85 × 0.806 = 68` | `reasoning.combatReasoning`; Exact keeps `84.56 × 0.8063 ≈ 68.1804` |
| Magnitude ratio is the served `mitigation_multiplier` | `ReasonMagnitude.ratio` → `--jm-ratio` → `width: calc(var(--jm-ratio) * 100%)` |
| The reveal is never lengthened client-side | `useEquationUnfold` only divides `reveal_window_ms` (expanded 60%, then compressed) |
| Production's 1750ms is not divided: the derivation stays expanded for the whole reveal | `unfoldCompressAtMs` (needs ≥1200ms left for the compressed state) |
| Manual reopen stays open until closed or the child leaves | `useEquationUnfold` (`manual` cancels the auto-compress) |
| Fixed geometry: the live chain steps down rather than grow the prompt box | `useFittedQuestion`: stacked → one-line → yielded |
| Step 2 composition visual: not built (its contribution value is not served) | §8 |

## 3. Files

**New** — `src/lib/journey/jp5.contract.test.ts`, `src/lib/ranked-core/modules/masterySliceModule.jp5.test.tsx`, `docs/handoffs/jp5-equation-unfold/*`, `JP5_HANDOFF.md`.

**Changed**

* `src/lib/journey/adapter.ts` — `JourneyPrerequisite`, `JourneyRevealDisplay`, `prerequisites3`; `adaptJourneyJ3` / `journeyViewFor` take the segment's reveals (optional).
* `src/lib/journey/reasoning.ts` — node flags `given / asked / detail / transform`; `liveReasoning`; the multiplier split into formula / decimal / share; `ReasonMagnitude`; `sharePercent`; `unfolds`; `unfoldCompressAtMs`.
* `src/components/journey/JourneyReasoning.tsx` — chain `phase` (`live / expanded / compressed`), the transform button, `JourneyMagnitude`, `useEquationUnfold`.
* `src/components/journey/JourneyStageQuestion.tsx` — the live chain in the prompt box; the reveal's unfold state.
* `src/components/journey/JourneyQuestionText.tsx` — `useFittedQuestion` steps a `data-yields` block down before the box would grow.
* `src/components/question-surface/InteractiveScenarioSurface.tsx` — optional `promptFooter` (only the Journey stage passes it).
* `src/lib/ranked-core/modules/masterySliceModule.tsx`, `MasterySliceChallengeSurface.tsx` — pass the reveals and the server's reveal window / end instant to a Journey child only.
* `src/pages/dev/journey-arena/JourneyArenaHarness.tsx` — dev-only `?revealMs=` probe (`withRevealWindow`).
* `src/index.css` — JP5 block appended (live tier, unfold tier, two-row break, fold, magnitude bar, motion).
* Tests updated because JP5 supersedes their Step-4 lock: `jp4.contract.test.ts`, `masterySliceModule.jp4 / .stageGrammar / .journey5 / .visualLanguage` tests.

`chain.ts` (the header Journey Path) is reused only for the asked node's noun (`chainNoun`). `JourneyCalcFlow.tsx` is untouched.

## 4. Behaviour

**Live.** Prerequisites come from the child's own `learner.relies_on`, joined to its `learner.established` and to the establishing child's reveal. A fact must belong to an earlier child and must not be the fact the child asks, or it is dropped. The asked node is a literal `?`.

| Child | Live chain |
|---|---|
| Zed/Ahri Step 4 | `85 Raw damage → 24 Ahri armor → ? Final damage` |
| Pantheon/Leona Step 3 | `50 Leona armor → ? Final damage` (beside the formula that child states) |
| Zed Step 2; Pantheon Steps 4–5 (formula only) | none |
| Ability haste, cooldown comparison, Steps 1 and 3 | none (no served dependency) |

**Reveal.** A Combat working whose multiplier is the armor formula yields six nodes; the fraction and the decimal are the fold's detail. Nodes already established earlier are marked `given` and do not animate in. A multiplier that is not the armor formula keeps JP4's single node and does not fold. Steps 2 and 3 are exactly JP4's.

**Timing.** Compress happens at 60% of the server's window, measured against the server's clock (`own_reveal_until`), so a reload mid-reveal lands in the right phase. A tap takes over: the chain is then only what the learner set.

**Reduced motion** (OS setting or `html.reduce-motion`): no animation or transition; the bar is drawn at the served ratio; the phases still switch.

**Phone.** Expanded takes two rows (three and three); compressed is one row of four. Node size is constant through the phases.

## 5. Certification

**Geometry sweep** — headless Edge through `/dev/journey-arena`, every snapshot of seven captures (reference right / wrong / timeout, Pantheon, Volibear, Ahri Survival, Volibear Survival) at seven widths, each unfolding reveal also probed compressed: **1,085 states, 0 violations, 0 page errors.** Checks: prompt overflow and growth, live chain inside the prompt box, reveal overflow x/y, uniform node size, node and label clipping, row overlap, board bounds, document x-overflow.

One value per region per width, identical to JP4's table:

| Viewport | Board y / h | Question y / h | Prompt h | Answers y |
|---|---|---|---|---|
| 375×812, 390×844 | 139 / 200 | 347 / 432 | 140 | 495 |
| 768×1024 | 155 / 240 | 403 / 348 | 96 | 507 |
| 1024×768 | 127 / 214 | 349 / 324 | 136 | 493 |
| 1280×800 | 127 / 302 | 437 / 268 | 100 | 545 |
| 1440×900 | 133 / 390 | 531 / 268 | 100 | 643 |
| 1920×1080 | 145 / 558 | 711 / 268 | 100 | 823 |

The same sweep run on JP4 (390, 1280, 1920) gives identical region sets, including the known Survival finish shift (the board absorbs 10px from 1024 up).

| Viewport | Live tier: Zed Step 4 / Pantheon Step 3 | Expanded | Compressed |
|---|---|---|---|
| 375, 390 | stacked / **yielded** | 2 rows, 72×44 nodes | 1 row |
| 768 | stacked / one-line | 1 row, 92×48 | 1 row |
| 1024 | stacked / stacked | 1 row, 68×60 | 1 row |
| 1280–1920 | stacked / one-line | 1 row, 92×52 | 1 row |

Question type beside a live chain, JP4 → JP5 (measured on both builds at 390, 1280 and 1920): Zed Step 4 28–29 → 21.5px on desktop, 23 → 22.5px on a phone; Pantheon Step 3 20 → 19.5px on desktop, unchanged on a phone (its chain yields). JP5 alone at the widths JP4 was not re-measured: Zed Step 4 20px at 768 and 26.5px at 1024; Pantheon Step 3 18px at both. Every other child is unchanged. All are inside the stage's 17–30px range.

**Ordinary Ranked** — `/dev/ranked-shell-probe`, all 22 states, JP4 vs JP5: **0 pixels** differ by more than 24/255 at 1280×800; at 390×844, 2 pixels in one media state.

**Hosts** — Ranked Bot (reference), Daily Standard (Pantheon, Volibear) and Daily Survival (Ahri, Volibear) draw the same chain; tested in `masterySliceModule.jp5.test.tsx`.

## 6. Reveal timing comparison (dev probe only)

Production stays at `reveal_window_ms = 1750`; nothing on the server was changed. The probe (`?revealMs=`) rewrites the captured snapshot before the production parser reads it. Instants are the page's own measurements, in ms from the reveal mounting.

| Window | Bar landed | Compress | Fold done | Reopen hint done | Reveal gone | Expanded after the bar lands | Compressed after the fold |
|---|---|---|---|---|---|---|---|
| 1750 (production) | 1192 | — | — | — | 1760 | 570 (never compresses) | — |
| 3500 | 1190 | 2103 | 2431 | 3071 | 3506 | 910 | 1075 |
| 4000 | 1174 | 2411 | 2744 | 3376 | 4014 | 1240 | 1270 |
| 4500 | 1190 | 2703 | 3031 | 3671 | 4507 | 1510 | 1475 |

(Desktop runs; the phone runs are within 20ms of these.)

Tapped 500ms after the compress (a fast reaction): the equation is fully reopened for about **520 / 730 / 920ms** before the child leaves.

**Recommendation: 4000ms.** It is the shortest probed window where the settled derivation is on screen for over a second, the fold and its hint both finish with time to spare, and the compressed state is tappable for about 1.3s. 3500 leaves about 1.0s for each and its hint ends 435ms before the reveal does. 4500 adds half a second per child for little gain.

Two limits the numbers show:

* **Manual reopen is marginal at every window.** The reopened equation lasts under a second. Making it a real reading aid needs the reveal to outlast the window, which is a server pacing change, not a constant.
* **The window is one number per segment.** At 4000ms every Journey reveal, including Step 1 and Step 3, holds 2.25s longer (+9s over the four-step reference Journey).

This is a measured budget plus frames and recordings, not a playtest. `docs/handoffs/jp5-equation-unfold/timing/` has a contact sheet (`.jpg`) and the page's event log (`.json`) per window, desktop and phone, with and without a tap. A screen recording of each run (`.webm`) sits beside them on disk but is **not committed** (26MB in total). Live: `/dev/journey-arena?capture=jref-zed-ahri&step=14&revealMs=4000`, then ▶.

**Smallest authoritative change:** `JOURNEY_REVEAL_WINDOW_MS` at `ranked_modules/mastery_slice.py:125` (today an alias of `REVEAL_WINDOW_MS`). Line 1747 (`reveal_window_ms or JOURNEY_REVEAL_WINDOW_MS`) lets `RANKED_MASTERY_REVEAL_WINDOW_MS` win when production sets it; production config was not checked. The frontend needs no change for a new value.

## 7. Tests

* **New**: `jp5.contract.test.ts` (20) — the join on real captures, no leakage, right / wrong / timeout equivalence, fail-closed drops, live / expanded / compressed builders, magnitude from the served multiplier, the window division. `masterySliceModule.jp5.test.tsx` (43) — live Step 4, no live Step 2, board untouched, unfold all at once, auto-compress at 3500 / 4000 / 4500 and none at 1750, reload mid-reveal, manual reopen and close, the bar, Pantheon reuse, reduced motion, fixed-stage guards, the yield rule, the three hosts, ordinary Ranked.
* **Updated**: the five JP4-era files listed in §3.
* **Focused Journey run** (`lib/journey`, `components/journey`, `ranked-core/modules`): 580 / 580.
* `tsc -p tsconfig.app.json`: the same 2 pre-existing Supabase errors. ESLint on changed files: 0 errors (fast-refresh warnings, the existing pattern).

### 7.1 Broad run vs JP4

The same directories on both worktrees (`lib/journey`, `components/journey`, `lib/ranked-core`, `components/ranked-arena`, `pages/quiz-ranked`, `components/question-surface`, `features/mastery`, `lib/ranked-public`, `pages/dev`), compared by test id:

| | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| JP4 `bb2c60f4` | 4,042 | 4,026 | 12 | 4 |
| JP5 `96d3193d` | 4,105 | 4,087 | 14 | 4 |

* **12 failures are shared** and unrelated to the Journey: `AnswerGrid.elimination` 2, `QuestionStageGeometry` 3, `LobbyPreviewPage` 2, `syntheticRankedHistory` 1, `statCategoryIcons` 1, `StatCheckPage` 3.
* **2 failed only on JP5 in that run; neither is a JP5 defect, and both pass in isolation (3 of 3):**
  * `QuestionMotifLayer.qf1 › Champion/Combat is unchanged by the Rift art` matches `"\n"` in the raw stylesheet. This worktree was a fresh checkout under `core.autocrlf=true`, so its working copy of `index.css` had CRLF endings (JP3's handoff records the same "CRLF case"). The working copy now has LF endings; the repository content is unchanged.
  * `TeamSimPage.phase5a › promoted route` is timing-sensitive under full-battery load.
* 65 tests are new in JP5. The 2 JP4 tests "absent" are the two Step-4 tests that were renamed for the six-node chain.

## 8. Step 2 authority finding

JP4's `rawReasoning()` builds `70% of 21 = 15` as follows:

| Part | Source | Authoritative? |
|---|---|---|
| `70` base | `learner.established` formula, `flat_by_rank[rank − 1]` | yes |
| `70%`, `21` | the formula's ratio; the premise's stated bonus AD (20.8, shown whole) | yes |
| `85` | the reveal's answer | yes |
| exact raw `84.56` | **a regex over the reveal's explanation prose** (`explainedExact`) | served, but unstructured |
| `15` contribution | **`84.56 − 70` computed in the client**, then shown whole | **no** |

So the contribution magnitude is not served anywhere. The raw-damage child's reveal carries no structured working: the backend builds `combat_working` only in `_produce_damage` (after armor); `_produce_raw_damage` (`mastery/setup_state/journey.py:1228–1292`) sets none, and `combat_working()` reads mitigation inputs a raw candidate does not have.

**The gap, exactly:** a reveal-only working for the raw family carrying `formula.flat`, `ratios[].{stat, label, ratio, value, contribution}`, `raw_damage` and `answer`. Everything but `contribution` is already in hand in `_produce_raw_damage`; `contribution` would be computed and reconciled server-side (omitted unless `flat + Σ contribution` reproduces the raw damage, as JP4's `stat_sources` does).

The composition visualization was therefore **not built**. JP4's Step 2 chain is unchanged, including its client-derived `15`.

## 9. Phase B proposal — ability haste and cooldown comparison (not implemented)

Verified by reading backend `fc95e81e`; nothing was executed.

### 9.1 Ability haste: `BASE COOLDOWN → ABILITY HASTE → EFFECTIVE COOLDOWN`

**Already served**

* The haste value: `prompt_semantics.scenario [["ability_haste", 10]]`, `learner.asks_fact.context.ability_haste`, and the transition's `stat_change` event (+10 from Caulfield's Warhammer).
* The base cooldown as a ledger fact of an earlier child (`ability_cooldown:<champion>:<slot>:r<rank>`, with K1 object, context and unit), in every servable haste plan.
* A soft link: the haste child's `reinforces` names the base-cooldown child (Volibear child 3 → child 1). It names a child, not a fact or a role, and gates nothing.

**Missing**

1. **The dependency.** `_produce_cooldown` (`journey.py:1010–1056`) passes no `requires`, so `relies_on` is empty. No cooldown requirement kind exists; all five kinds are Combat's.
2. **A working.** The reveal is prose only. The candidate already holds the inputs: `explanation.derivation_inputs = (("base_cooldown", …), ("ability_haste.total", …))`, the derivation id `haste_to_cooldown_multiplier.v1` and the unrounded answer (`mastery/setup_state/scenario.py:433–438`). The multiplier itself is not kept.

**Proposed seams**

* **Dependency → the existing ledger `requires` / `relies_on`, with a new `what: "base_cooldown"`.** This is the semantically right shape: the haste prompt never states the base cooldown, so the learner must recall it, exactly as with `target_armor: recall`. A requires-only entry withholds nothing (there is nothing in the prompt to withhold).
* **Working → a reveal-only block through the route `combat_working` uses** (`challenge_private_extra` → private row → reveal → review row), e.g. `cooldown_working.v1`: `base_cooldown {value, source, established_in_child}`, `ability_haste`, `haste_multiplier`, `effective_cooldown`, `answer`. `haste_multiplier` from `calculate_cooldown.haste_to_cooldown_multiplier` (the function the state derivation used), fail-closed unless `base × multiplier` reproduces the effective cooldown.

The two are independent. The working alone gives the reveal chain and its duration bar; the dependency adds the live chain.

**Backend files that would change**

* `mastery/setup_state/journey.py` — `_produce_cooldown` (requires, working), a builder beside `combat_working()`, `Produced`, `child_working`.
* `ranked_modules/mastery_state_slice.py`, `ranked_modules/mastery_slice.py` (`_working_extra`, the private key, `challenge_reveals`), `ranked_public/review.py`.
* `answer_safety.py` — add the new block's key to `FORBIDDEN_PRE_REVEAL_KEYS`, as DD1 did for `comparison_values`.
* `mastery/setup_state/journey_recipe.py` only if the dependency is made a recipe opt-in.

**Costs to decide**

* The dependency changes the public and private bytes of the six servable haste recipes. `composition_key`, bundle digest, `state_key` and candidate ids are unaffected, but the pinned public/private hashes and one explicit assertion move (`test_journey3_daily.py:446`, "only S-A has a revealed requirement").
* A requirement is an enforced gate: a plan that asks haste without first teaching the base cooldown would be refused. All servable plans teach it first; the held recipe `top.riven_vs_darius` does not.
* The fact key must follow the flat rule: the intrinsic fact is keyed `flat` for a flat-shaped cooldown, the haste fact always `r<rank>`.
* `test_journey5_release.py:390` asserts non-Combat children have no working; a separate field avoids widening `Produced.working`.

**Generality.** Nothing in `_produce_cooldown` or the haste generator names a champion; it is generic per family. Generic gates that can refuse an ability: static cooldowns, dual-form shapes.

**Frontend (later).** A reader beside `combatWorking.ts`; `cooldownReasoning`; `liveReasoning` gains cooldown kinds; the magnitude bar is reused as a duration bar (`ratio` = served `haste_multiplier`). `prerequisites3` needs one fallback (champion name from the fact's K1 object side) because a requires-only entry has no `withheld` row.

### 9.2 Cooldown comparison: two real values and their relationship

**Already served — more than the JP fixtures show.** Backend `fc95e81e` includes DD1's reveal-only `comparison_values.v1` (`mastery/manifest_session/adapter.py:421`, frozen at `mastery_slice.py:731`, disclosed at `:2058`): both sides' `{token, value, display}`, `unit`, `unit_label`, `operator`, `delta`, `delta_display`. It is built for every matchup candidate, and a Journey compare child is published through that same path. `origin/main`'s frontend already reads it (`features/mastery/contracts/comparisonValues.ts`) and draws it for ordinary comparisons. Ranks, ability names and champion names are in the public `comparison_semantics`.

**Missing**

1. **Proof on a Journey.** No backend test asserts a Journey compare reveal carries the block, and the M1 captures predate DD1. A re-capture on the current backend settles it with no code change.
2. **The Journey stage does not read it.** The JP branch line is 65 commits behind `origin/main` and has no reader; `JourneyReveal` uses the prose.
3. **No dependency, by design.** A compare child asks both cooldowns. It should not get `relies_on`: gating a comparison on a learned fact would be wrong.

**Proposed seam: the existing `comparison_values.v1`. No backend contract change** for paired bars and their relationship. After integrating onto `origin/main`, the Journey reveal builds a comparison chain from `reveal.comparisonValues`: two bars sized by `value`, the displays printed verbatim, `delta_display` as the relationship, the winner from `correct_answer`.

**Optional, separate curriculum decision.** Today a compare child's ledger fact is only the winner, with no object. If a comparison should also *teach* both cooldowns (so they get `!` marks and can be relied on later), `_produce_compare` would add two `ability_cooldown` facts. That changes what a comparison establishes and moves pinned bytes; it is not needed for the presentation.

### 9.3 Tests a Phase B change must carry

* The new block is absent from every pre-reveal payload and present only after its child settles (the pattern of `test_journey5_release.py:524`), and its key is in `FORBIDDEN_PRE_REVEAL_KEYS`.
* The existing prefix walks still pass (`test_journey2_core.py:419`, `test_journey3_daily.py:641`): no asked value in a reached prefix. For haste, the base cooldown may appear only because an earlier child established it.
* Every number in the working equals the evaluator's own (field-by-field, as `test_journey5_release.py:384`), and the block is omitted when it does not reconcile.
* Pins: composition keys and bundle digests unchanged; public/private hash changes limited to the haste children and listed.
* Frontend: fail-closed readers; bars sized only by served coefficients or served values; no verdict read; the same leak sweep as `jp5.contract.test.ts`.

## 10. Screenshots

`docs/handoffs/jp5-equation-unfold/`, headless Edge from committed `96d3193d` (clean tree, dev server started from this worktree), through `/dev/journey-arena`. Live and expanded shots run at the captures' own 1750ms window (the reveal arrives by ▶, shot 1.3s in). Compressed shots use the 4000ms probe, and the dev chrome line says so.

| File (`jp5-final-…`) | |
|---|---|
| `desktop-step2-live`, `desktop-step2-reveal` | 1280×800, unchanged from JP4 |
| `desktop-step4-live`, `-expanded`, `-compressed` | 1280×800 |
| `desktop1440-step4-live`, `-expanded` | 1440×900 |
| `mobile-step2-live`, `-reveal`, `mobile-step4-live`, `-expanded`, `-compressed` | 390×844 |
| `daily-pantheon-desktop-step3-live`, `-expanded`, `-compressed` | the non-reference reuse (one-line live tier) |
| `daily-pantheon-desktop1024-step3-live` | the stacked live tier |
| `daily-pantheon-mobile-step3-live`, `-expanded` | the live chain yields on a phone; the reveal unfolds |
| `daily-voli-desktop-haste-reveal` | an ability-haste reveal, unchanged (no chain invented) |
| `timing/jp5-timing-<window>ms-<device>[-reopen].{jpg,json}` | §6 (the `.webm` recordings are on disk, uncommitted) |

The art and icons on the board come from the remote asset host, which was intermittently slow during capture; every committed shot was retaken until all of its images had loaded. Start the dev server from this worktree's own directory: Tailwind reads its config and content from the working directory, and a server rooted elsewhere renders subtly differently.

## 11. Unresolved — owner decisions

1. **Reveal window.** Approve a Journey-specific window (recommended 4000ms), or keep 1750ms. At 1750ms the derivation stays expanded for the whole reveal and never auto-compresses.
2. **Manual reopen.** It lasts under a second at any probed window. Accept that, or treat a longer-held reveal as a separate pacing design.
3. **Pantheon Step 3 on phones.** Its live chain yields there: the box already holds a four-line question and a two-line stated formula at the smallest certified type. The reveal still shows the reuse. Accept, or decide what gives way.
4. **Phase B.** Approve the two haste seams (§9.1), the no-backend-change path for comparisons (§9.2), and whether Step 2 gets a raw-damage working (§8).

Also carried forward: JP4's deploy order (frontend before backend `fc95e81e`) still applies; JP5 adds no backend requirement. Long champion names still truncate on phone board rows (pre-existing).

## 12. Next task

1. Owner review of the screenshots and the timing captures; decide §11.
2. If a window is approved: the backend constant (§6), then re-capture the reference Journey at that window.
3. Integrate JP4 + JP5 onto the then-current `origin/main` (which brings DD1's `comparison_values` reader), then Phase B in the approved order.
