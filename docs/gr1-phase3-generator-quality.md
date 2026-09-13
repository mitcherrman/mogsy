# GR1 Phase 3 — generator quality and composition

> Phase 1 (`docs/ranked-mastery-slice-current-state-audit.md`) audited. Phase 2
> (`docs/gr1-phase2-source-authority.md`) made the sources trustworthy. Phase 3
> changes **what a valid slice is composed of**. It changes no source authority,
> no canonical data, no persistence, no Admin surface and no frontend.

**Base:** backend `origin/master` @ `77bae306` (Phase 2 is merged — the owner
completed it). Branch `gr1/phase3-generator-quality`.

**The three generators remain three.** Champion and Matchup still share one
pipeline; Applied-chain is still architecturally separate and does not touch the
recipe/manifest path. A test pins that.

---

## 1. The architecture this phase enforces

```
candidate generation          →  what is VALID          (unchanged this phase)
  ChampionFact projection, Knowledge Bank, Matchup Composer,
  publication gate, effective-question de-duplication

slice composition             →  what SUBSET is a useful sequence   (this phase)
  mastery/synthesis/recipe.py           allocation + block declaration
  mastery/manifest/resolver.py          the sequencing it declares
  mastery/synthesis/applied_chain.py    which scenarios are distinct tasks

generator invariants          →  what makes any of it a QUESTION    (new)
  mastery/synthesis/invariants.py
```

Nothing was moved across that line. The composition layer never adds a
candidate, never drops one to make a sequence prettier, and never learns a
champion's name; the candidate layer still decides what may be asked at all.

### The eligible pool is three categories, not four — and that is upstream

`CandidateCategory` declares four. The publication gate rejects the whole of
`champion_base_stat` for **atomic** recall as `family_unmapped`, roster-wide:
Ahri's 49 raw candidates are 35 eligible, and all ten base-stat candidates are
among the fourteen removed. So Phase 1's "3,482 base-stat vs 2,180 cooldown"
counted the **raw** bank; the servable atomic bank is
`ability_cooldown` + `ability_cost` + `champion_level_stat`.

This is a family-mapping fact, not a composition one, and Phase 3 did **not**
change it — mapping a family is a serving-policy decision with its own owner.
It matters here only because it sets the ceiling on Champion diversity at three
categories. `champion_base_stat` *is* eligible as a **comparison**, which is why
Matchup sees it and Champion does not.

---

## 2. Champion Mastery

### Before

`recipe._plan` walked `CATEGORY_ORDER` and took `min(available, budget)` from
each in turn. `ability_cooldown` is first and every champion has ten or more of
them, so **every slice shorter than the cooldown pool was 100 % cooldown** — not
just the first three steps. Roster-wide, **503 of 519** first-three slots
(96.9 %). The salt varied *which* cooldowns, never *that* they were cooldowns.

Secondary effect: `CURRICULUM_V2` applies metric-run interleaving only *within*
a block, and `_plan` gave each category its own block. A single-category block
gives the interleaver nothing to pull forward, so the whole slice was one run.

### After — two rules, both in `recipe.py`

1. **`allocate(counts, budget)`** — one round-robin pass over `CATEGORY_ORDER`
   per question. Every category with capacity gives up one, in order, repeating
   until the budget is spent. A short slice therefore spans every category the
   champion actually has, and the first category cannot claim the whole of it.
   Absent categories stay absent rather than appearing at zero.
2. **One block per role.** All of one role's requests declare the same `block`,
   so the resolver's existing interleaving mixes the categories instead of being
   confined inside one. Each request keeps its own per-category `label`, so which
   request selected a step is still readable.

Variety is never forced. 5 of 173 champions have one eligible category and 43
have two; those slices are one and two categories wide, at full requested length.

### Measured

| | before | after |
|---|---|---|
| Roster first-three, `ability_cooldown` | **503 / 519 (96.9 %)** | **211 / 519 (40.7 %)** |
| Roster first-three, `ability_cost` | 1 | 125 |
| Roster first-three, `champion_level_stat` | 15 | 183 |
| Categories in a 3-question slice (Ahri, Zed, Olaf, Jarvan IV, Soraka) | 1 | **3** |
| Longest same-family run at n=8 | **8** | **≤ 2** |
| Requested count honoured | yes | yes |
| Distinct samples across 3 seeds | 3 | 3 |

Ahri, n=3: `[cooldown, cooldown, cooldown]` → `[cooldown, cost, level_stat]`.
Identical for the other four probed champions.

### A defect the monoculture was hiding

Level-stat steps can be `answer_type: numeric` — free input, no options by
design. Because no short slice had ever reached one, nothing had ever inspected
them. The invariant checker's first run reported them as "correct answer appears
0 times in []". They are correct; the checker now judges a free-input step by
its own shape. Recorded because it is the kind of thing a monoculture hides, and
because the fix is in the checker, not the product.

---

## 3. Matchup Mastery

### Is the atomic universe intentional?

**Yes, as fill — and the existing product semantics already said so.** The
universe is comparisons **plus both atomic banks**, and the budget has always
been claimed comparisons-first: atomic recall is drawn *only* when the pair's
comparison pool is exhausted. At every realistic slice length (n ≤ 12 for the
probed pairs) a Matchup slice is **100 % comparative**. Phase 1's "Matchup can
draw both" is true, but only past the comparison ceiling.

So the answer is not to remove atomic fill — a pair with 10 comparisons and a
16-question request has to come from somewhere, and single-side recall about the
two champions in the matchup is the honest source. The answer is that it must
never *lead*.

### Before

The budget said comparisons first; the declared plan said
`selection_plan = plan_atomic + plan_cmp`. `CURRICULUM_V2` runs blocks in
first-appearance order, so on exactly the pairs where fill happens the player
**opened on unrelated single-champion recall** and met the matchup afterwards.
Measured: `comparisons_lead` was `False` for every probed pair at n=13/16.

### After

* `selection_plan = plan_cmp + plan_atomic`. Comparisons lead the sequence as
  well as the budget. `comparisons_lead` is now `True` at every probed length.
* `allocate` applies within each half, so a 3-question matchup slice spans both
  comparison categories (an ability-cooldown comparison **and** a base-stat
  comparison) instead of draining cooldown comparisons first.
* Order-independence is unchanged: `(A, B)` and `(B, A)` produce the identical
  `mastery_set_id` at every probed length and salt.

### Measured

| pair | n | comparison steps | comparisons lead (before → after) | comparison categories (before → after) |
|---|---|---|---|---|
| Ahri / Syndra | 3 | 3 | True → True | 1 → **2** |
| Ahri / Syndra | 13 | 12 | **False → True** | 2 → 2 |
| Ahri / Syndra | 16 | 12 | **False → True** | 2 → 2 |
| Zed / Yasuo | 13 | 10 | **False → True** | 2 → 2 |
| Olaf / Soraka | 16 | 13 | **False → True** | 2 → 2 |
| Jarvan IV / Ahri | 16 | 13 | **False → True** | 2 → 2 |
| Syndra / Ahri (reverse) | all | = forward | = forward | = forward |

Thin content: `Ahri vs Syndra` has 12 eligible comparisons. n=12 is fully
comparative; n=13 is 12 comparisons then one atomic step; beyond the combined
pool the generator raises `InsufficientQuestionsError` with both numbers rather
than repeating.

No new League fact was invented and no Champion generator logic was duplicated:
the atomic half is the Champion bank, read through the same eligibility and
de-duplication filters.

---

## 4. Applied-chain

### Responsibility — the working definition holds

> Applied-chain produces questions that require applying one or more
> transformations/modifiers to authoritative game facts to derive a result.

Current architecture agrees. Every generated question is
`raw ability damage (base + ratio × item AD) → percent then flat penetration →
mitigation`, and the answer exists in no table. It is a derivation, not a lookup.

### What is generic and what is not

| | |
|---|---|
| **Generic** | `scenario_items` (which items, and the flat/percent alternation), `scenario_ability_rank` (highest certified rank legal at the level, via the transition engine's own rule), `SCENARIO_LEVEL` as stated generation policy, the salt rotation, the step/artifact shape, `item_mechanic_key` |
| **Champion/ability-specific** | the certified adapter registry — **3 attacker abilities** (2 champions) and **6 certified targets** — and `mastery/chains/physical_penetration_set.py`. Coverage is data, not a list, but the data is 6 hand-authored certified champions. |
| **One operation only** | `physical_penetration`. There is no second chain. |

### Two defects found, both fixed, neither an expansion

**(a) Duplicate chains producing effectively identical learning tasks.** 17
canonical penetration items express only **14 distinct derivations**. Four —
Axiom Arc, Hubris, Profane Hydra, Youmuu's Ghostblade — all carry 55 bonus AD
and 18 lethality, so a 14+ question set published **one arithmetic problem four
times over**, with the same answer (`214`), the same four options, and only the
item's name different.

Fixed in composition: items are collapsed by `item_mechanic_key` —
`(bonus AD, lethality, %pen)`, the inputs that decide the answer — keeping the
first in canonical-name order. The key was validated against the observed
collision: it predicts the four-member group exactly, with no false positives.
Collapsing happens **before** the salt rotation, so the ceiling is a property of
the data and not of the seed. The real ceiling is therefore **14**, not 17; a
request beyond it raises `InsufficientQuestionsError`.

**(b) The prompt was underdetermined — the more serious of the two.** The item's
bonus AD is fed into raw damage before the ability's bonus-AD ratio, but the
prompt stated only penetration. At 18 lethality, Axiom Arc (55 AD) answers
**214** and Umbral Glaive (60 AD) answers **219** — two questions whose stated
premises a player cannot tell apart, with contradictory correct answers. The
prompt now states the bonus AD, read from the chain's own provenance
(`attacker_bonus_ad_from_item`), never recomputed.

Prompt text is **not** in `KnowledgeMasteryStep.identity_material`, so this
changed no `step_id`, `mastery_set_id` or `artifact_digest`. Zero identity impact.

### Measured

| | before | after |
|---|---|---|
| Item pool (Jarvan Q vs Olaf) | 17 | **14 distinct derivations** |
| n=14: distinct (answer, options) tasks | **12 of 14** | **14 of 14** |
| n=14: groups publishing one identical task | 1 (4 members) | **0** |
| n=17 | 17 steps, 14 distinct | **refused**, `available=14` |
| Prompt states every input the answer uses | no | yes |

### Not done, deliberately

No roster-wide expansion. Coverage is still 3 attacker abilities × 6 targets ×
1 operation. The architectural decision that gates broader generalization is in
§8 below.

---

## 5. Generator invariants — `mastery/synthesis/invariants.py`

One read-only inspection over finished steps, shared by all three generators. It
returns findings rather than raising, knows no champion/item/family, and reads no
source: a finding is a composition or rendering defect, never a disagreement
about League. Deliberately **not** a framework — 169 lines, no registry, no
plugin seam.

| code | guarantee |
|---|---|
| `single_correct_answer` | for a choice step, the stated answer is among the options **exactly once** |
| `distinct_options` | no option repeats |
| `missing_answer` | a step states an answer at all |
| `empty_prompt` | a step publishes a prompt |
| `unused_options` | a free-input step does not also ship options |
| `duplicate_semantic_question` | no two steps share `(prompt, options)` |

`equivalent_answer_groups` is reported **separately**, not folded in: two steps
with the identical answer and options are a duplicate only where the prompt
differs by a label the derivation ignores (applied-chain's item name). Where the
prompts name different subjects, two questions landing on the same number is
coincidence. It measured the applied-chain defect (4 → 0).

The remaining invariants are relations between generations, not properties of one
artifact, and are asserted by tests that hold two artifacts at once: determinism
for a given seed, different seeds producing different valid compositions,
graceful degradation of a thin pool, exact requested count preserved.

**Phase 2 is not weakened.** No preflight, integrity check, provenance module or
fail-closed path was touched. `BANNED_PREFIXES` and
`ALLOWED_UNDER_BANNED_PREFIXES` are byte-identical.

### One resolver change, scoped to synthesized recipes

`_break_adjacent_pattern` could only pull a differently-patterned candidate
**forward**, which cannot fix a clash in a block's last two steps. Before Phase 3
no generated block reached that state — a block held one category and its
candidates differed by ability slot. A block that now holds several categories
ends in whichever category the round-robin gave the final questions to, and those
can be twins with nothing behind them. A backward fallback was added: place the
candidate at the latest earlier slot where it neighbours no twin. It never drops
or adds a candidate, and the whole pass is gated on
`require_distinct_effective_question`, which is **off by default and only a
synthesized recipe turns it on** — so no hand-authored curriculum's declared
order is touched.

---

## 6. Deterministic examples

Probe, both records and the script:

* `docs/audits/ranked-mastery-slice/gr1-phase3-probe.py`
* `…/gr1-phase3-probe-before.json` (run against `origin/master` @ `77bae306`)
* `…/gr1-phase3-probe-after.json` (same script, same DB, this branch)

Subjects: Champion — Ahri, Zed, Olaf, Jarvan IV, Soraka, at n ∈ {3, 5, 8} × salt
∈ {None, `gr1p3-seedA`, `gr1p3-seedB`}, plus a 173-champion n=3 sweep. Matchup —
Ahri/Syndra, Zed/Yasuo, Olaf/Soraka, Jarvan IV/Ahri and the reversed Syndra/Ahri,
at n ∈ {3, 5, 8, 13, 16} × the same salts. Applied-chain — Jarvan Q vs Olaf at
n ∈ {2, 4, 14, 17}. Each record carries candidate counts by family, the selected
slice, its semantic identities, repeated-family runs and the seed.

---

## 7. Tests

| suite | before (`origin/master` @ `77bae306`) | after |
|---|---|---|
| `mastery/tests` | 3 failed, 1459 passed, 17 skipped | **3 failed, 1598 passed, 17 skipped — failure-set `diff` EMPTY** |
| `mastery/tests/test_gr1_phase3_composition.py` (new) | — | **139 passed** |
| 8 Ranked `mastery_slice` integration files | — | **158 passed, 0 failed** |
| 16 mastery chain/rendering/parity root files | 27 failed, 377 passed | **27 failed, 377 passed — failure-set `diff` EMPTY** |
| the 4 branch-footprint guards + `test_footprint_guard_split.py` | — | **166 passed, 0 failed** (run against a real commit) |

Failure **sets** were diffed against a clean baseline worktree at
`origin/master` with the same `lol_calc.db`, per project rule — never totals.
Both diffs are empty: **zero regressions introduced.** The 3 pre-existing
`mastery/tests` failures are the `test_audit_db` triage pair and the stale
`ranked_modern` vs `ranked_points_v2` expectation, unchanged since Phase 2. The
27 are the legacy static-set suites MC1 retired.

### Two existing tests were updated, and why

* `test_synthesis_current_truth_first.py::test_new_synthesis_after_patch_uses_updated_canonical_values`
  zipped the two answer lists positionally and asserted **every** answer moved
  by the simulated cooldown patch. That only ever passed because every short
  slice was entirely cooldowns — it encoded the defect. It now compares **per
  family**, and additionally asserts nothing the patch did not touch moved,
  which the positional form could not say. Strictly stronger.
* `mastery/tests/facts_support.py` + `test_footprint_guard_split.py` name
  `mastery/questions/physical_penetration_rendering.py` in `GR1_RUNTIME_FILES`
  (the prompt fix is a rendering file, not a generator one). Pinned by exact set
  equality, as Phase 2 established, so any later growth is a reviewable edit.
  `GR1_PACKAGES` is unchanged and no other workstream's footprint moved.

No product behaviour was changed to satisfy a test.

---

## 8. Remaining quality limitations

1. **`champion_base_stat` is unservable as atomic recall**, roster-wide, as
   `family_unmapped`. It caps Champion diversity at three categories and hides a
   genuinely diverse part of the bank. Serving-policy owner's call; not touched.
2. **Champion allocation is equal-share, not pedagogically weighted.** A
   round-robin gives cooldowns and level stats the same claim even where one pool
   is twice the other. It is defensible and it is not a curriculum.
3. **Difficulty is not a composition input.** `difficulty_class` exists on every
   candidate and `SelectionRequest` can filter on it; nothing does. A slice has
   no easy→hard progression. This is the largest untaken composition lever.
4. **Matchup atomic fill cannot be steered toward the comparison subjects.**
   `SelectionRequest` has no champion axis, so the fill cannot be balanced
   between the two sides or restricted to the abilities the comparisons touched.
   It leads with comparisons and is honest about the fallback; it is not yet
   *about* the matchup.
5. **Matchup comparison pools are small** (2–4 ability-cooldown comparisons per
   pair), so long slices are base-stat-comparison heavy. A content limit.
6. **Applied-chain is one operation, 3 abilities, 6 targets.** Unchanged by
   design this phase.
7. **`Ohmwrecker (Turret Item)` is in the penetration item pool** — a turret item
   with 0 AD and 30 % armour pen, offered as a champion scenario. It survives the
   mechanic collapse because its derivation is genuinely unique. A
   `item_canonical` classification question, not a composition one.
8. **The invariant checker sees finished steps only.** It cannot tell that a
   *distractor* is implausible, only that it is distinct and that the answer is
   among the options once.

---

## 9. Decision needed before broader Applied-chain generalization

**One architectural decision, for the owner, before any coverage work.**

Applied-chain coverage is gated by the **certified champion slice** — 6
hand-authored Python modules in `mastery/data/` — not by the generic chain code.
The chain itself needs, per scenario: certified ability base-by-rank, the ability's
AD-ratio *kind*, and certified level scaling for the target's Armor. Two of those
three now exist canonically for the whole roster (`champion_ability_formulas`,
`champion_stats`); the third, the ratio *kind* (total vs bonus AD), is precisely
what CHAMPDATA pass 6D found the runtime inventory had never recorded.

So the choice is:

* **(A) Widen the certified slice.** Hand-certify more champions. Linear cost per
  champion, keeps the current provenance guarantee exactly as Phase 2 verified
  it, and coverage stays a curated list wearing a data-driven interface.
* **(B) Source the chain from canonical data.** Let the applied-chain generator
  read `champion_ability_formulas` / `champion_stats` directly, with
  `mastery/provenance/certified_provenance.py` as arbiter. Roster-wide in one
  step, but it makes the applied-chain generator a **second consumer of canonical
  ability formulas with its own correctness bar**, and it inherits CHAMPDATA's
  open defect count (pass 7: 108 confirmed) — including the ratio-kind gap, which
  would silently produce wrong answers rather than refusing.

**(B) is the only route to roster-wide coverage, and it cannot be taken until the
ratio-kind field is canonical and CHAMPDATA's confirmed defects are closed for
the abilities in scope.** Those are CHAMPDATA lane items, not GR1 ones. Until
then, (A) is the only safe expansion and its cost is per champion.

This phase deliberately did not choose. Nothing was built toward either.

---

## 10. Explicitly not done

Source authority, canonical data, static Mastery sets, Admin Quiz Review /
generated preview, `quiz_attempts` persistence, user history, Ranked XP/Elo/streak,
enabling Mastery in public Ranked, frontend presentation, roster-wide
Applied-chain expansion, standalone authored Mastery curricula. No UI
screenshots were needed — every composition finding was reachable from the
generators.
