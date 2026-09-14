# GR1 — Matchup Mastery structural audit

**AUDIT ONLY.** No runtime code was changed, nothing was implemented, no family was enabled
or removed, the composer was not touched, tie policy was not touched, persistence was not
touched, Champion Mastery and the Applied-chain were not touched, and no runtime code was
pushed. The one thing this pass produces is a picture of the current structure, and a list of
questions the owner may eventually have to answer.

| | |
|---|---|
| Date | 2026-09-13 |
| Backend audited | `League_Combat_Simulator` `origin/master` @ **`16db3690`** (read from the clean worktree `/Users/macmoney/lcs-wt-gr1-tie`, `git status` clean) |
| Frontend audited | `mogsy` `origin/main` @ **`756b6b41`** — **read only, not run, not changed** |
| Docs base | `mogsy` `origin/gr1/docs-snapshot` @ **`decc49b6`** |
| Scope | `mastery_mode: matchup` |
| Database | the real canonical `lol_calc.db`, opened `mode=ro` |

**On the backend SHA.** The tie-policy implementation document measured branch
`gr1/matchup-tie-policy` @ `afb55d1e`. That work is now integrated: `git diff afb55d1e 16db3690`
is **one documentation file** (`docs/ITEM_RUNTIME_REACHABILITY_CERTIFICATION.md`) and no code.
So this audit measures exactly the generator that document shipped, and every figure it
re-derives reproduces.

---

## 0. How the evidence was produced

Four read-only instruments, all against the real canonical database, all through the real
pipeline. Nothing was monkeypatched, nothing was memoized, and no repo file was modified.

1. **Pair sweep** — `identity → project_champion ×2 → compose_matchup → publication_gate.evaluate
   → dedupe_by_effective_question` over **all 14,878 champion pairs**, 173/173 champions,
   **0 errors**, 144 s. Records every candidate's family, metric, slot, rank, tie state and
   policy decision, plus every skip the composer reports.
2. **Composition probe** — the real `recipe.synthesize_matchup_manifest →
   publication_gate.gate_snapshot` over a stratified **420-pair sample** (40 thinnest + 40
   richest + 40 tie-heaviest + 300 random, seed `20260912`, deduplicated) × {3, 5, 8} questions
   × {no salt, `s1`, `s2`, `s3`} = **5,040 real generated slices, 0 errors, 0 under-filled**.
3. **Quality probe** — 1,200 random pairs, every servable comparison rendered through the real
   `mastery.manifest_session.adapter.render_effective_question` and through a faithful Python
   transcription of the shipped `formatComparisonSemantics.ts`, plus the roster's own value
   distribution for every comparison metric and the near-miss distribution of every served
   comparison.
4. **Fallback probe** — five pairs spanning the depth range, generated at **every** question
   count from 1 to `comparisons + 3`, to find the exact length at which atomic recall first
   enters a slice.

**Two disclosures, both about reading the numbers rather than about producing them.**

* **The stratified sample over-states ties on purpose.** 40 of its 420 pairs were drawn *for
  being the most tie-heavy pairs on the roster*. Every tie table below reports the **random
  stratum (300 pairs)** separately, and that is the player-facing figure. The all-420 column is
  a stress figure and is labelled as one.
* **No screenshot was captured.** This pass changed nothing presentational and did not attempt
  a capture. The Phase 5 Matchup capture
  (`docs/audits/gr1-matchup-mastery/matchup-generator-lab-phase5.png`) remains the only real
  Matchup capture and now predates five passes; §8 says exactly which of its details are stale.
  Everything presentational below is read from the renderer source and the real adapter output
  and is labelled as such.

---

## 1. The current question universe

### 1.1 The shape of the thing

Matchup Mastery is **one composer with no per-metric branch**
(`mastery/matchup/composer.py`). It indexes both champions' projected facts by
`(metric, subject_ref, context)`, intersects them over `SLOT_RELATIONS` — which is
`(Q,Q) (W,W) (E,E) (R,R)`, deliberately same-slot only — and asks
`mastery.facts.comparison.comparable()` about each pair. The universe it hands the recipe is
**comparisons plus BOTH sides' own atomic-recall banks** (`eligible_matchup_pool`).

Four comparison families are declared. **Two are servable.**

| Category | Template | `family_hint.quiz_family_id` | Servable | Canonical source |
|---|---|---|---|---|
| `ability_cooldown` | `compare_ability_cooldown` | `ability_cooldown_compare` | **YES** | `champion_abilities.cooldown`, arbitrated by the wiki cooldown artifact |
| `champion_base_stat` | `compare_champion_base_stat` | `champion_stat_compare` | **YES** | `champion_stats` |
| `ability_cost` | `compare_ability_cost` | **`None`** | **NO** — `family_unmapped` | `champion_abilities.cost` |
| `champion_level_stat` | `compare_champion_stat_at_level` | **`None`** | **NO** — `family_unmapped` | `champion_stats` base + growth, at levels 6/11/18 |

### 1.2 Raw → policy → servable, over all 14,878 pairs

| Stage | Comparisons | Atomic |
|---|---|---|
| **Raw** (composer output) | **726,049** | — |
| **Policy-accepted** | **322,026** (44.4%) — 404,023 rejected, **100% `family_unmapped`** | — |
| **Servable** (after `dedupe_by_effective_question`) | **322,026** — **nothing is lost to dedupe** | **1,150,680** |
| Per pair | min **8** · p25 **19** · median **22** · p75 **27** · max **27** · mean 21.6 | min 38 · median 78 · max 108 |

**By family:**

| Family | Raw | Policy-accepted | Servable | % of the servable comparison universe |
|---|---|---|---|---|
| `ability_cooldown` | 192,562 | 192,562 | **192,562** | **59.8%** |
| `champion_base_stat` | 129,464 | 129,464 | **129,464** | **40.2%** |
| `champion_level_stat` | 299,124 | **0** | 0 | — |
| `ability_cost` | 104,899 | **0** | 0 | — |

**Skipped before policy** (the composer's own reason codes, 234,403 total):
`no_counterpart_fact` 176,652 · `collapsed_flat_comparison` 48,800 · `semantic_mismatch` 7,471 ·
`ambiguous_operand` 1,480. Each was sampled and each is a **correct refusal**, not a defect —
see §4.4.

**`dedupe_by_effective_question` now removes nothing.** Before the rank-identity pass it
destroyed 147,056 cooldown candidates because the prompt omitted the rank; the prompt states it
now, so every policy-accepted candidate is servable. That is the current state, stated because
three of the earlier GR1 documents' headline numbers were about its absence.

### 1.3 The servable universe in full detail

**Comparison metrics — all ten, with their tie behaviour:**

| Metric | Family | Servable | Ties | Tie rate | Share of universe | Share of all tie volume |
|---|---|---|---|---|---|---|
| `ability_cooldown` | cooldown | **192,562** | 14,806 | 7.69% | **59.8%** | **48.4%** |
| `base_magic_resist` | base stat | 14,878 | **5,845** | **39.29%** | 4.6% | **19.1%** |
| `movement_speed` | base stat | 14,878 | 2,739 | 18.41% | 4.6% | 8.9% |
| `attack_range` | base stat | 14,878 | 2,333 | 15.68% | 4.6% | 7.6% |
| `base_mana_regen` | base stat | 14,878 | 1,389 | 9.34% | 4.6% | 4.5% |
| `base_health_regen` | base stat | 14,878 | 1,114 | 7.49% | 4.6% | 3.6% |
| `base_attack_damage` | base stat | 14,878 | 757 | 5.09% | 4.6% | 2.5% |
| `base_armor` | base stat | 14,878 | 692 | 4.65% | 4.6% | 2.3% |
| `base_health` | base stat | 14,878 | 616 | 4.14% | 4.6% | 2.0% |
| `base_mana` | base stat | **10,440** | 313 | 3.00% | 3.2% | 1.0% |
| **Total** | | **322,026** | **30,604** | **9.50%** | | |

Nine base-stat metrics apply to every pair; `base_mana` is emitted only where
`champion_metadata.resource_type` says the champion holds a mana pool, so it is absent from
**4,438 pairs (29.8%)**. No metric is tie-free.

**Cooldown comparisons by rank and slot.** A cooldown comparison is asked at a stated rank
unless the composer's *flat pair* applies — neither side's value moves with rank — in which case
it states none and publishes exactly one candidate.

| | rank 1 | rank 2 | rank 3 | rank 4 | rank 5 | rank-independent |
|---|---|---|---|---|---|---|
| Candidates | 43,085 | 43,085 | 43,085 | 30,443 | 30,443 | **2,421** |
| Share of the cooldown family | 22.4% | 22.4% | 22.4% | 15.8% | 15.8% | 1.3% |
| Tie rate | **10.05%** | 5.31% | 9.36% | 4.12% | 8.98% | 7.02% |

(Ranks 4 and 5 are smaller only because ultimates publish three ranks. Earlier GR1 documents
report rank 1 as 45,506; that figure folds the 2,421 rank-independent candidates into rank 1.
43,085 + 2,421 = 45,506 — the same universe, counted two ways.)

| Slot | Candidates | r1 | r2 | r3 | r4 | r5 |
|---|---|---|---|---|---|---|
| Q | 49,805 | 8.54% | 4.42% | 9.24% | 5.27% | **10.97%** |
| W | 51,735 | 5.31% | 2.92% | 5.40% | 3.51% | 7.04% |
| E | 53,018 | 7.44% | 3.33% | 6.42% | 3.63% | 8.99% |
| R | 38,004 | **17.18%** | 9.56% | 15.06% | — | — |

**Ties are a U over rank, not a rank-1 artefact**: rank 1 is the shared-ultimate convention
(120 s), rank 5 is the shared basic-ability floor (6–12 s).

### 1.4 Typical questions per pair

Because the recipe asks each *distinct fact* once before it asks a second context of one, the
number that decides what a pair can be asked about is not its candidate count but its **distinct
fact count**: at most 4 ability slots + at most 10 base stats = **14 distinct comparison facts**,
and only 119 of 173 champions publish all four slots (§5.3). The candidate count (median 22) is
the number of *contexts* available across those facts.

### 1.5 Held / unmapped comparison-capable facts — inventory only

These exist, are composed, carry correct values, and are refused at
`mastery/publication_gate/policy.py` because `family_hint.quiz_family_id` is `None`. **No
recommendation is made about any of them.**

| Held family | Raw candidates | Rejection reason | Source data canonical? | Renderer support? |
|---|---|---|---|---|
| `champion_level_stat` (stat at level 6/11/18) | **299,124** | `family_unmapped` — no comparative level-stat family in `quiz/family_contract.py` | **Yes** — `champion_stats` base + growth, the same table the servable base-stat family reads | **Yes** — `compare_champion_stat_at_level` is a live branch in `formatComparisonPrompt` |
| `ability_cost` | **104,899** | `family_unmapped` — no comparative resource-cost family | **Yes** — `champion_abilities.cost`, and the identical fact is already servable as *atomic* recall | **Yes** — `compare_ability_cost` is a live branch in `formatComparisonPrompt` |

**Two of the four renderer branches therefore have no content today.**

Real held candidates, rendered through the real adapter and the real template:

```
Which costs less: Cho'Gath Q (Rupture) or Talon Q (Noxian Diplomacy)?
  Cho'Gath Q (Rupture): 50 mana. Talon Q (Noxian Diplomacy): 40 mana. Talon wins by 10 mana.
  key: ability_cost_compare:Cho'Gath:Q:vs:Talon:Q:r1

At level 11, which has more Base Armor: Aphelios or Kayn?
  Aphelios: 62.9 armor. Kayn: 77.5 armor. Kayn wins by 14.6 armor.
  key: champion_stat_level_compare:armor:Aphelios:vs:Kayn:lvl11
```

Two observations that follow from the render, not from the counts:

* The **cost** held family carries its own tie population. A large share of the sampled cost
  comparisons are shared conventions — 100-mana ultimates, in particular — so enabling it would
  import a tie profile of its own rather than dilute the current one. It is not quantified here,
  because measuring a family nobody has decided to enable is work the brief does not ask for.
* The **level-stat** branch still renders `"more Base Armor"` — the double-qualifier the
  rank-identity pass fixed in the *base-stat* branch and not in this one, because the branch has
  no content to expose it. Whatever else is true of enabling that family, its renderer branch has
  not had the wording pass the live branches got.

### 1.6 A comparison-capable metric held one level further up

`base_attack_speed` is projected as a canonical champion fact for all 173 champions (34 distinct
roster values), and it is **structurally excluded from comparison** — `MetricSpec` gives it
`dimension=None`, so `ChampionFact.comparison` is `None` and `comparable()` refuses it at its
first clause. The declared reason is in the contract: attack-speed growth is a percentage of the
attack-speed ratio rather than an additive curve, so neither the level axis nor the comparison
key is projected. This is **not** a `family_unmapped` hold and does not appear in the 404,023;
it is held one layer earlier, in `mastery/facts/contract.py`.

---

## 2. Structural balance

### 2.1 The universe

| | Share of the servable comparison universe |
|---|---|
| `ability_cooldown` | **59.8%** |
| `champion_base_stat` (nine metrics + `base_mana`) | **40.2%** |
| The single largest metric (`ability_cooldown`) | **59.8%** |
| The largest base-stat metric (any of nine) | 4.6% each |

**The universe is concentrated in one fact type by candidate count and in ten by fact count.**
Those two statements are both true and they point in opposite directions, which is the single
most important structural fact in this section: 59.8% of *candidates* are cooldowns, but a pair
holds at most **4** distinct cooldown facts against **up to 10** distinct base-stat facts. The
cooldown family is large because each fact is published at up to five ranks, not because there
are many cooldown facts.

Because the allocator round-robins the budget over **distinct facts** first
(`recipe.allocate` with `distinct_facts_by_category`), it is the fact count and not the
candidate count that decides a slice. That is measured next, and it inverts the universe's
proportions.

### 2.2 What slices actually draw — 5,040 real slices

| | n=3 | n=5 | n=8 |
|---|---|---|---|
| Comparison questions | **100%** | **100%** | **100%** |
| Atomic recall | **0** | **0** | **0** |
| `ability_cooldown` | **55.6%** | **47.4%** | **34.8%** |
| `champion_base_stat` | **44.4%** | **52.6%** | **65.2%** |
| Mean distinct metrics per slice | 2.20 | 3.50 | **6.09** |
| Mean distinct families per slice | 1.87 | 1.87 | 1.87 |
| Under-filled slices | 0 | 0 | 0 |

**The family mix inverts as the slice gets longer.** A three-question slice is a majority
cooldown; an eight-question slice is **two-thirds base stats**. The mechanism is not a
preference — it is the distinct-fact round-robin meeting the ceiling of four ability slots: by
n=8 a slice has usually asked every comparable slot once and the remaining budget can only go to
base stats. At n=8 an average slice carries **2.78 ability comparisons and 5.22 base-stat
comparisons**.

**Slot mix** (of the ability comparisons drawn):

| | Q | W | E | R |
|---|---|---|---|---|
| n=3 | 26.6% | 21.1% | 25.1% | 27.2% |
| n=5 | 25.6% | 22.5% | 23.4% | 28.5% |
| n=8 | 24.1% | 23.6% | 23.7% | **28.6%** |

R is drawn slightly above an even share at every length. It is not a preference either: the
ultimate is the slot **most** champions publish comparably — **R 160, W 151, E 150, Q 147** of
173 — and it is the only slot the three one-slot champions publish, so it survives in pairs
where the other three do not.

**Metric mix at n=8** — the nine universal base stats are drawn almost evenly (977–1,055 draws
each of 13,440 questions, 7.3–7.8% each); `base_mana` is lower (582, 4.3%) because it is absent
from 29.8% of pairs. **No base-stat metric is favoured or starved.**

**Rank mix** (of rank-bearing cooldown comparisons drawn):

| | r1 | r2 | r3 | r4 | r5 |
|---|---|---|---|---|---|
| Pool availability | 22.7% | 22.7% | 22.7% | 16.0% | 16.0% |
| Drawn, n=3 | 24.4% | 24.0% | 23.1% | 15.4% | 13.1% |
| Drawn, n=5 | 24.5% | 24.2% | 23.1% | 15.2% | 13.0% |
| Drawn, n=8 | 24.2% | 24.9% | 22.9% | 15.1% | **12.9%** |

The drawn distribution tracks availability to within **3.1 points at the worst cell** (rank 5,
under-drawn). Rank 1 was 76.2% before the rank-diversity pass; it is 24.2% now. **Rank 5 is the
one axis where selection is measurably off the pool**, consistently at every length, and the
audit does not have a cause for it — the tie-preference rotation (`prefer_discriminating_context`)
advances cyclically from the seeded offset, so it reaches rank 5 last more often than it reaches
rank 2 first. That is a hypothesis this pass did not test.

**Distinct ranks within one slice** (slices holding at least one rank-bearing comparison):

| | n=3 | n=5 | n=8 |
|---|---|---|---|
| 1 rank only | 33.1% | 16.1% | **14.1%** |
| 2 ranks | 66.9% | 51.6% | 39.4% |
| 3 ranks | — | 32.3% | 39.6% |
| 4 ranks | — | — | 6.9% |

### 2.3 How much do slices differ from one another

Over all 420 pairs at every length, **four salts produce four distinct slices, 420/420**. That
was 254/418 before the rank-identity pass and is now total: no pair, however thin, collapses two
seeds onto the same slice at n=3, 5 or 8.

**Verdict on balance, as measurement rather than judgement:** the universe is concentrated
(59.8% one family); the *slice* is not (1.87 families, 6.09 metrics and 2.5 distinct ranks at
n=8). Whether a slice being two-thirds base stats at n=8 is the right product is §3's and §10's
question, not this section's.

---

## 3. Current family and metric quality

Classification is **clearly useful / situational–repetitive / questionable / needs owner
judgement**, with a real prompt for each. Nothing is removed or redesigned.

### 3.0 The measurement this section rests on — near-miss volume

Both servable families publish under a `quiz/family_contract.py` contract that **declares
exclusions the Mastery path does not apply**:

* `ability_cooldown_compare` — *"pairs whose values are equal — no correct answer"*, *"pairs
  whose values differ by under 10% — a coin flush dressed as knowledge"*
* `champion_stat_compare` — *"equal values"*, *"values within 5% — indistinguishable in play and
  a guess in the quiz"*, *"base mana for a champion whose `resource_type` is not Mana"*

`FamilyContract.exclusions` is prose and reason codes read by one coverage-report script
(`scripts/dc1_family_coverage_report.py`); it is **not a gate**, and
`mastery/publication_gate/policy.py` checks only that a family exists, is serveable and declares
the mode. So the exclusions are not enforced on the Mastery path. Measured over 1,200 random
pairs' served comparisons, against each family's own declared threshold:

| Metric | Served | Tie | Within the contract's own band (non-tie) | **Tie or near-miss** |
|---|---|---|---|---|
| `movement_speed` | 1,200 | 19.3% | **72.2%** (<5%) | **91.5%** |
| `base_health` | 1,200 | 3.3% | 43.2% (<5%) | 46.5% |
| `base_magic_resist` | 1,200 | **38.9%** | 2.7% (<5%) | 41.6% |
| `base_attack_damage` | 1,200 | 4.5% | 25.7% (<5%) | 30.2% |
| `base_mana` | 840 | 3.9% | 12.6% (<5%) | 16.5% |
| `attack_range` | 1,200 | 15.9% | 5.3% (<5%) | 21.2% |
| `ability_cooldown` | 15,651 | 7.8% | 9.8% (<10%) | **17.6%** |
| `base_mana_regen` | 1,200 | 9.4% | 6.8% (<5%) | 16.2% |
| `base_armor` | 1,200 | 4.8% | 10.2% (<5%) | 15.0% |
| `base_health_regen` | 1,200 | 7.2% | 0.0% (<5%) | 7.2% |

This is a **descriptive** measurement of a gap between two authorities, not a proposal. It is
reported here because it separates "this metric ties a lot" from "this metric is a coin flip
even when it does not tie", and those are different findings about different metrics.

### 3.1 Ability cooldown comparisons — **clearly useful**

```
At rank 1, which has the shorter cooldown: Yasuo R (Last Breath) or Zaahen R (Grim Deliverance)?
  Yasuo R (Last Breath): 70 seconds. Zaahen R (Grim Deliverance): 110 seconds. Yasuo wins by 40 seconds.

At rank 2, which has the shorter cooldown: Yasuo R (Last Breath) or Zaahen R (Grim Deliverance)?
  Yasuo R (Last Breath): 50 seconds. Zaahen R (Grim Deliverance): 95 seconds. Yasuo wins by 45 seconds.
```

**What it tests:** which of two kits comes back up first at a stated point in the game — the
question that decides trades, all-ins and objective timers. It names both abilities and its rank,
so it is a specific, non-guessable claim; the same two abilities usually have a different answer
at another rank, which is what makes the rank clause load-bearing rather than decorative. 17.6%
of them fall inside the family contract's own "under 10%" band, which is the honest qualifier on
this classification.

### 3.2 `base_magic_resist` — **questionable**

```
Which has more base Magic Resist: Aphelios or Kayn?
  Aphelios: 30 magic resist. Kayn: 32 magic resist. Kayn wins by 2 magic resist.

Which has more base Magic Resist: Yasuo or Zaahen?
  Yasuo: 32 magic resist. Zaahen: 32 magic resist. Tie.
```

**What it tests:** nothing that survives the roster's own value distribution. Base MR has **10
distinct values across 173 champions, and two of them (32 and 30) cover 88.5% of the roster.**
The decisive form is a 2-point difference; the tie form (39.3% of pairs) is "both took the
default". This is the same finding the tie-policy design pass logged, arrived at here from the
near-miss side: 41.6% of served MR comparisons are a tie or inside the contract's own exclusion
band, and **47.6% are within 10%**. It is the clearest content finding in the current family set.

### 3.3 `movement_speed` — **questionable**

```
Which has more Movement Speed: Aphelios or Kayn?
  Aphelios: 325 units per second. Kayn: 340 units per second. Kayn wins by 15 units per second.

Which has more Movement Speed: Yasuo or Zaahen?
  Yasuo: 345 units per second. Zaahen: 345 units per second. Tie.
```

**What it tests:** which champion is faster at level 1, which is real lane knowledge — *when the
gap is real*. It usually is not: **9 distinct roster values** across the whole roster
(315 / 325 / 328 / 330 / 335 / 340 / 345 / 350 / 355), so **19.3% tie and a further 72.2%
differ by under 5%**, the band `champion_stat_compare` itself calls "a guess in the
quiz". **91.5% of served movement-speed comparisons are a tie or a near-miss** — the worst
number of any metric in the product, and worse than `base_magic_resist`, which is the metric the
earlier documents named. This is the one metric-level finding this pass adds that the previous
four did not have, and it is a *near-miss* finding, which is why a tie-rate table never surfaced
it.

### 3.4 `attack_range` — **situational / repetitive**

```
Which has more Attack Range: Aphelios or Kayn?
  Aphelios: 550 units. Kayn: 175 units. Aphelios wins by 375 units.

Which has more Attack Range: Cho'Gath or Talon?
  Cho'Gath: 125 units. Talon: 125 units. Tie.
```

**What it tests:** melee-vs-ranged, and inside the ranged bracket, the real 500/525/550/600
distinctions that decide a lane. The decisive form is genuine knowledge with a large margin
(only 5.3% are near-misses — the lowest near-miss rate of any base stat). The repetition is at
the *top* of the distribution rather than the bottom: 125 covers 26.6% of the roster and 550
covers 20.8%, so 15.7% of pairs tie, and the tie form reduces to "both melee" or "both standard
ranged".

### 3.5 `base_health`, `base_armor`, `base_attack_damage` — **situational / repetitive**

```
Which has more base Health: Lucian or Udyr?
  Lucian: 641 health. Udyr: 664 health. Udyr wins by 23 health.

Which has more base Attack Damage: Lucian or Udyr?
  Lucian: 60 attack damage. Udyr: 62 attack damage. Udyr wins by 2 attack damage.

Which has more base Armor: Lucian or Udyr?
  Lucian: 28 armor. Udyr: 31 armor. Udyr wins by 3 armor.
```

**What they test:** who wins a level-1 trade — the most genuinely matchup-shaped knowledge the
base-stat family offers, and the three metrics with the richest value distributions (51, 24 and
25 distinct roster values). Their tie rates are the lowest in the product (4.1%, 4.7%, 5.1%).
Their weakness is **margin, not equality**: 43.2% of `base_health` and 25.7% of
`base_attack_damage` comparisons are decided by under 5%. A 23-health or 2-AD edge is real and is
not something a player can feel.

### 3.6 Regeneration stats (`base_health_regen`, `base_mana_regen`) — **needs owner judgement**

```
Which has more base Health Regen: Aphelios or Kayn?
  Aphelios: 3.2 per 5 seconds. Kayn: 8 per 5 seconds. Kayn wins by 4.8 per 5 seconds.

Which has more base Mana Regen: Lucian or Udyr?
  Lucian: 7 per 5 seconds. Udyr: 7.5 per 5 seconds. Udyr wins by 0.5 per 5 seconds.
```

**What they test:** sustain in a long lane. Numerically these are the *cleanest* metrics in the
product — `base_health_regen` has a **0.0%** near-miss rate, because regen values are coarse
(5.5 / 7 / 8.5) so a difference is always a large relative difference. The question is not
whether the comparison is well-formed; it is whether base regeneration at level 1 is knowledge a
player uses. That is a product call, not a measurement, which is why the classification is
"needs owner judgement" rather than one of the other three.

**`base_mana_regen` carries a separate, structural problem, unchanged and still open.** 22 of
173 champions have `mp5` of 0 because they use no mana, so **3,553 pairs (23.9%)** serve *"Which
has more base Mana Regen?"* with one side at a structural 0, and 231 manaless-vs-manaless pairs
serve it as a guaranteed 0–0 tie. `base_mana` declines for exactly those champions — it is
emitted only where `resource_type` says there is a pool — so the projection already knows how to
refuse; `base_mana_regen` does not ask it to. `champion_stat_compare`'s own contract lists *"base
mana for a champion whose `resource_type` is not Mana"* as an exclusion, and the manaless
`base_mana_regen` case is the same shape one metric over.

### 3.7 `base_mana` — **clearly useful, and the one metric that already declines**

```
Which has more base Mana: Lucian or Udyr?
  Lucian: 320 mana. Udyr: 271 mana. Lucian wins by 49 mana.
```

61 distinct roster values, a 3.0% tie rate and a 12.6% near-miss rate — the second-cleanest base
stat in the product. It is also the only metric that **structurally declines** rather than
serving a meaningless comparison: absent for 4,438 pairs instead of present with a 0.

---

## 4. Missing and held knowledge — what exists, and what blocks it

**No enabling is proposed and no implementation is estimated beyond what is needed to name the
blocker.**

### 4.1 `ability_cost` comparisons

| | |
|---|---|
| Data that already exists | `champion_abilities.cost`, projected as a `ChampionFact` with a full `ComparisonKey` (dimension `resource_cost`, `higher_is_better=False`). **104,899 raw candidates**, values correct, explanations already rendered |
| Questions that could be formed | *"Which costs less: Cho'Gath Q (Rupture) or Talon Q (Noxian Diplomacy)?"* — at a stated rank, in the shape the live cooldown family already uses |
| Current blocker | **Contract.** `quiz/family_contract.py` declares no comparative resource-cost family. The composer's own hint says so: *"Neither vocabulary has a resource-cost comparison family: the quiz side compares cooldowns and base stats only, and Mastery's `ability_cost` family is single-champion recall."* `policy.decide` therefore returns `family_unmapped` |
| Renderer support | **Already exists** — `compare_ability_cost` is a live branch in `formatComparisonPrompt` |
| Identity | Already complete — `ability_cost_compare:<A>:<Slot>:vs:<B>:<Slot>:r<Rank>` |
| Note | `semantic_mismatch` correctly refuses mana-vs-energy comparisons (the unit is overridden per row from `cost_resource`), so an enabled family would be narrower than 104,899 |

**Blocker class: contract.** Not source, not renderer, not identity, not policy configuration.

### 4.2 `champion_level_stat` comparisons

| | |
|---|---|
| Data that already exists | `champion_stats` base + growth columns, projected at levels 6/11/18 through the same growth model the atomic `champion_level_stat` family already serves. **299,124 raw candidates** |
| Questions that could be formed | *"At level 11, which has more Armor: Aphelios or Kayn?"* — 62.9 vs 77.5 |
| Current blocker | **Contract.** `champion_stat_compare` is declared base-stat-only (*"Level 1 only. Level-18 comparisons need the nonlinear curve and live in `champion_stat_level`"*), and `champion_stat_level` is a single-champion family, so no contract covers a *comparative* level-stat question |
| Renderer support | **Already exists** — `compare_champion_stat_at_level` is a live branch. It has not had the wording pass the live branches got (§1.5) |
| Identity | Already complete — `champion_stat_level_compare:<stat>:<A>:vs:<B>:lvl<N>` |

**Blocker class: contract.**

### 4.3 `base_attack_speed` comparisons

**Blocker class: source/model.** One layer earlier than the two above: `MetricSpec` gives the
metric no `dimension`, therefore no `ComparisonKey`, therefore `comparable()` refuses it at its
first clause. The declared reason is that attack-speed growth is a percentage of the
attack-speed ratio rather than the additive curve every other stat uses, and that model is not
projected. Nothing downstream — contract, renderer, identity — is involved.

### 4.4 The four skip reasons, and why each is correct

Sampled over 1,200 pairs and traced to source:

| Reason | Volume (roster-wide) | What it is | Verdict |
|---|---|---|---|
| `no_counterpart_fact` | 176,652 | *"Aphelios publishes no comparable `ability_cooldown` for E at this context"* — one side's slot is held upstream by `quiz/ability_question_eligibility.py` | **Correct.** See §5.3 |
| `collapsed_flat_comparison` | 48,800 | *"both champions hold the same value at every rank, so this repeats the comparison already emitted"* — the flat pair, collapsed to one rank-independent candidate | **Correct.** This is what produces the 2,421 rank-independent candidates |
| `semantic_mismatch` | 7,471 | *"resource_cost/mana/… vs resource_cost/energy/…"* — a mana cost is not comparable with an energy cost | **Correct, and a safety boundary.** Almost entirely in the held cost family |
| `ambiguous_operand` | 1,480 | *"camille W `ability_cooldown` is ambiguous/conflicted"* — the fact's own certification refuses it | **Correct** |

---

## 5. Pair health

### 5.1 The distribution

| Servable comparisons per pair | min | p10 | p25 | median | p75 | p90 | max | mean |
|---|---|---|---|---|---|---|---|---|
| | **8** | 13 | 19 | **22** | 27 | 27 | **27** | 21.6 |

| Comparisons | 8 | 9 | 10 | 11 | 12 | 13 | 14–20 | 21–25 | 26 | 27 |
|---|---|---|---|---|---|---|---|---|---|---|
| Pairs | 166 | 715 | 15 | 518 | 66 | 99 | 2,644 | 5,264 | 1,583 | **3,808** |

**Descriptive classes**, drawn at the natural breaks in that histogram rather than at round
numbers:

| Class | Definition | Pairs | Share |
|---|---|---|---|
| **Rich** | ≥ 21 comparisons — three or four comparable slots plus a full base-stat set | **10,655** | **71.6%** |
| **Normal** | 13–20 comparisons — two or three comparable slots | **2,743** | **18.4%** |
| **Thin** | ≤ 12 comparisons — at most one comparable slot | **1,480** | **9.9%** |

* **Pairs with zero comparisons: 0.** All 14,878 are generatable; 0 errors.
* **Families available per pair:** 2 families for **13,998 pairs (94.1%)**; **1 family
  (`champion_base_stat` only) for 880 pairs (5.9%)**.
* **Base-stat-heavy pairs:** the 880 above are base-stat-*only*. A further 600 (the 9- to
  12-comparison band that still has a slot) are base-stat-dominant. So **1,480 pairs (9.9%) are
  base-stat-heavy**, which is the same 1,480 the rank-identity pass measured as "below the old
  ceiling of 13" — the two counts coincide, and only 880 of them have no ability comparison at
  all.
* **`base_mana` absent:** 4,438 pairs (29.8%), one or both sides manaless. Those pairs have one
  fewer base-stat metric — which is why the minimum is 8 rather than 9.

### 5.2 Ties per pair

| | p25 | median | p75 | p90 | p95 | p99 | max | mean |
|---|---|---|---|---|---|---|---|---|
| Pair tie rate | 3.8% | **8.3%** | 13.6% | 21.7% | 25.9% | 36.8% | **63.6%** | 9.76% |

**2,458 pairs (16.5%) have no tie at all. 8,889 (59.7%) sit below 10%. 423 (2.8%) sit above
30%.** The tie problem is a tail, not an average — unchanged from the tie-policy design pass, and
re-derived here on the shipped generator.

### 5.3 Why thin pairs are thin — the source and policy evidence

Every thin pair traces to one side publishing no comparable ability cooldown for a slot. The
cause is upstream, in `quiz/ability_question_eligibility.py`, and it is **correct**: a held slot
is one whose stored cooldown is not the whole story.

**Comparable cooldown slots per champion, roster-wide:**

| Slots | Champions | Who |
|---|---|---|
| **4** | **119** | the bulk of the roster |
| 3 | 37 | |
| 2 | 9 | `ashe` `heimerdinger` `kalista` `sylas` `teemo` `vi` `yasuo` `yone` `yuumi` |
| **1** | **3** | `gnar` `lee-sin` `reksai` — R only |
| **0** | **5** | **`aphelios` `elise` `jayce` `nidalee` `udyr`** |

**84 of the roster's 692 QWER slots are held**, across **five** reason codes:

| Reason | Held slots | What it means |
|---|---|---|
| `secondary_gate` | **27** | the ability has charges, or a gate the stored `cooldown` column does not capture |
| `dual_form_row` | **26** | a transforming champion's row conflates two forms |
| `no_cooldown` | 11 | the ability genuinely has no cooldown |
| `cooldown_shape_unsupported` | 10 | the progression's shape is not one the model handles |
| `nonstandard_rank_count` | 10 | the slot does not publish `Q/W/E 5, R 3` |

**This refines what the earlier GR1 documents record.** They attribute thin pairs to "the
dual-form row split" and name eight ability-comparison-incapable champions. Measured here:
only **five** champions are fully incapable, three more publish exactly one slot, and
`dual_form_row` is the **second** largest cause, not the only one — `secondary_gate` is larger,
and `no_cooldown` is not a data defect at all but a true statement about the ability.

**The thinnest pairs**, and what they are made of: the 166 pairs at 8 comparisons are
base-stat-only pairs where at least one side is also manaless — e.g. `aatrox × aphelios`,
`aatrox × elise`. The 880 base-stat-only pairs are every pair containing one of the five
zero-slot champions (850 of them) plus 30 more where both sides are from the one-slot / two-slot
group and their comparable slots do not overlap — `gnar × teemo`, `lee-sin × sylas`,
`heimerdinger × reksai`. **The richest pairs** are the 3,808 at 27 comparisons: both sides
publish all four slots and both hold mana.

**Consistently thin champions, in order:** `aphelios`, `elise`, `jayce`, `nidalee`, `udyr` (every
one of their 172 pairs is base-stat-only), then `gnar`, `lee-sin`, `reksai` (one slot, so at most
3 ability comparisons in any pair), then `ashe`, `kalista`, `vi`, `yasuo`, `yone`, `yuumi`,
`heimerdinger`, `sylas`, `teemo` (two slots).

---

## 6. Slice behaviour — how the composer builds a Matchup slice today

### 6.1 The path, named

```
eligible_matchup_pool                     comparisons + BOTH atomic banks, gated and deduped
  → recipe.synthesize_matchup_manifest    two plans: comparisons first, then atomic
      → recipe.allocate                   round-robin over DISTINCT FACTS, then over raw counts
  → publication_gate.gate_snapshot        resolve → evaluate → resolve the playable snapshot
      → resolver._run_selection_plan      threads used_patterns + the tie budget across requests
          → resolver._select_for_request  seeded rotation, context diversification, two queues
      → CURRICULUM_V2 sequencing          orders within a block, breaks same-fact adjacency
```

Four policies are in force, all set by `synthesize_matchup_manifest` and none of them by
`synthesize_champion_manifest`:

| Policy | Effect |
|---|---|
| `require_distinct_effective_question` | two candidates that render alike cannot both be admitted |
| `distinct_facts_by_category` (allocation) | the budget goes to fresh **facts** before a second context of one |
| `diversify_context_within_pattern` | which **context** represents a fact is a `(seed, pattern)` hash, not the lowest rank |
| `prefer_discriminating_context` + `max_tie_questions = max(1, n // 4)` | prefer a fact's non-tying context; cap ties per slice at 1 / 1 / 2 for n = 3 / 5 / 8 |

### 6.2 Measured behaviour — 5,040 real slices

| | n=3 | n=5 | n=8 |
|---|---|---|---|
| Family distribution (cooldown / base stat) | 55.6% / 44.4% | 47.4% / 52.6% | **34.8% / 65.2%** |
| Mean distinct families | 1.87 | 1.87 | 1.87 |
| Slot diversity — slices repeating an ability slot | **0** | **0** | **0** |
| Metric diversity — mean distinct metrics | 2.20 | 3.50 | 6.09 |
| Longest same-metric run | **2** | **2** | **2** |
| Longest same-family run | 2 (3 for 220 base-stat-only slices) | 2 (5 for 220) | 2 (5 for 116, 8 for 220) |
| Rank diversity — mean distinct ranks | 1.67 | 2.16 | 2.39 |
| Repeated `(subject, slot, metric)` | **0** | **0** | **0** |
| Under-filled | **0** | **0** | **0** |
| Atomic fallback | **0** | **0** | **0** |
| Comparison-before-atomic violations | **0** | **0** | **0** |

### 6.3 Tie behaviour

| | n=3 | n=5 | n=8 |
|---|---|---|---|
| **Random stratum (300 pairs — the player-facing figure)** | | | |
| tie questions / all | **6.33%** | **6.53%** | **8.38%** |
| slices with ≥1 tie | 19.0% | 32.7% | 48.6% |
| ≥2 | 0.0% | 0.0% | 17.8% |
| ≥3 | 0.0% | 0.0% | **0.7%** |
| **All 420 (stress)** | | | |
| tie questions / all | 8.61% | 7.85% | 10.30% |
| ties-per-slice histogram | 0:1250 1:426 **2:4** | 0:1049 1:603 **2:28** | 0:821 1:442 2:337 **3:52 4:28** |
| adjacent tie pairs | 4 | **0** | 156 |
| **Tie-heaviest 40 (the tail)** | | | |
| tie rate | 32.29% | 23.50% | 32.50% |
| ≥3 ties | **0.0%** | **0.0%** | **42.5%** |

The cap binds exactly as designed: the histogram is truncated at 1 tie for n=3 and n=5 apart
from 4 and 28 slices, and at 2 for n=8 apart from 80. Where it is exceeded the pair had no fresh
deciding comparison left — the tie-policy implementation pass proved that exhaustively (104 of
2,400 tail slices over cap, **0** of which had an alternative).

At n=8, the largest single source of the remaining ties is **`base_magic_resist` — 365 of 1,384
(26.4%)** — ahead of the whole `ability_cooldown` family at 316 (22.8%), which is 3.4× larger in
the universe.

### 6.4 Fallback, repeat protection, determinism

* **Fallback:** see §7. Never reached at n ≤ 8.
* **Repeat protection:** `used_patterns` is threaded across the whole plan, so a fact met by one
  request is not re-asked by another. Measured at **0 repeats** at every length. `CURRICULUM_V2`
  additionally breaks same-fact adjacency within a block.
* **Determinism:** same salt × 3 runs ⇒ **1 distinct snapshot digest**, on 12 pairs.
* **Pair-order symmetry:** `(a, b)` and `(b, a)` ⇒ **identical digest**, 12/12 pairs.
* **Seed variation:** 4 salts ⇒ **4 distinct slices for all 420 pairs**, at every length.
* **Diagnostics:** every slice carries `policy_universe_filtered`; **zero** `SELECTION_EMPTY` and
  **zero** `SELECTION_UNDER_FILLED` across all 5,040.

---

## 7. Atomic fallback

**What it is.** `synthesize_matchup_manifest` builds **two** plans: `plan_cmp` over the
comparison candidates and `plan_atomic` over both champions' own single-champion recall banks.
`plan_atomic` receives `left` — whatever budget `plan_cmp` did not claim. Comparisons lead the
sequence as well as the budget (`CURRICULUM_V2` orders blocks by first appearance and the
comparison block is declared first), so an atomic question can only ever appear *after* every
comparison in the slice.

**Who owns it.** The allocation is `mastery/synthesis/recipe.py::synthesize_matchup_manifest`
(the two `_plan` calls). The selection is `mastery/manifest/resolver.py::_run_selection_plan`,
which runs the atomic requests exactly like the comparison ones. There is no separate fallback
branch, no flag and no exception path — **atomic recall is not a fallback mechanism, it is the
second half of a two-part plan that is usually allocated zero.**

**When it can theoretically appear.** `recipe.allocate` gives a category a question only while it
has capacity; the comparison categories are consumed first. So the first atomic step appears at
exactly **n = (that pair's servable comparison count) + 1**. Verified directly by generating five
pairs at every length from 1 upward:

| Pair | Servable comparisons | Atomic pool | First atomic at n |
|---|---|---|---|
| `aatrox × aphelios` | 8 | 63 | **9** |
| `aatrox × elise` | 8 | 66 | **9** |
| `aphelios × bard` | 9 | 71 | **10** |
| `naafiri × twisted-fate` | 22 | 78 | **23** |
| `zilean × zoe` | 27 | 87 | **28** |

**Does it actually appear at n ≤ 8 today? No.** The roster-wide minimum comparison count is 8, so
the earliest any pair can draw an atomic question is **n = 9**, and that is true of only the 166
thinnest pairs. Measured over 5,040 real slices at n = 3, 5 and 8: **0 atomic questions, 0
slices.** The median pair does not reach atomic recall until **n = 23**.

**What would have to happen for it to be used.**

* A slice length above 8 — n ≥ 9 reaches 166 pairs, n ≥ 13 reaches 1,480, n ≥ 23 reaches half the
  roster; **or**
* the comparison pool shrinking below the requested length for some pair — which today would mean
  a metric or a family being withdrawn, or more ability slots being held upstream.

**1,150,680 servable atomic candidates (78.1% of the pair universe) are currently unreachable at
every slice length the product uses.** No judgement is offered here about whether that is right.

---

## 8. Current structural strengths — verified, not assumed

Each row below was measured in this pass, not carried forward.

| Strength | Evidence |
|---|---|
| **Pair coverage is total** | **14,878 / 14,878** pairs generatable, 173/173 champions, **0 errors**, 0 pairs with zero comparisons — re-run end to end for this audit |
| **Correctness and source authority** | Values re-derived clean in the capability audit (517/517 base stats, 325/325 cooldowns); the composer calculates no champion truth and delegates every comparability decision to `mastery.facts.comparison.comparable`, which refuses on dimension, unit, semantic subtype, context axis, certification and non-numeric value before it ever compares |
| **Fail-closed source integrity** | `preflight_matchup` + `assert_sources_ready` raise `SourceIntegrityError` rather than generating from an untrusted authority. Unchanged and still in the path |
| **Rank identity** | Every published rank of a slot is its own question, the prompt states the rank, and the flat pair states none. **0** effective-question groups hold two ranks; **0** disagree on the answer |
| **Rank diversity** | Drawn rank distribution tracks pool availability to within 3.1 points at the worst cell, at all three lengths; rank 1 is 24.2% at n=8, down from 76.2% |
| **Tie control** | ≥3 ties is **0.0% / 0.0% / 0.7%** at n=3/5/8 on the random stratum, and 0.0/0.0/42.5% on the deliberately-worst 40 pairs. No comparison was removed from the universe to achieve it — the universe is byte-identical at 322,026 |
| **Repeat protection** | **0** slices repeat a `(subject, slot, metric)` and **0** repeat an ability slot, at every length, across 5,040 slices. Longest same-metric run is **2**, the declared bound |
| **Determinism** | Same salt × 3 runs ⇒ 1 snapshot digest, 12/12 pairs |
| **Pair-order symmetry** | `(a,b)` ≡ `(b,a)` ⇒ identical snapshot digest, 12/12 pairs. Holds through persistence too — `subject_key`, `mastery_set_id` and `artifact_digest` are order-independent |
| **Seed variation** | 4 salts ⇒ 4 distinct slices for **420/420** pairs at every length, including the thinnest |
| **No under-fill, no shortage** | 0 under-filled slices and 0 `SELECTION_UNDER_FILLED` / `SELECTION_EMPTY` diagnostics in 5,040 slices |
| **Presentation vocabulary is complete** | All ten servable metrics are declared in `quiz.public_presentation.METRIC_NAMES`, so every servable comparison can draw a media band — the 17.0% gap the capability audit found is closed |
| **The media band names both abilities or neither** | `presentation_render._matchup` emits `ability_name_a`/`ability_name_b` together, never one side's name against a placeholder |
| **Both abilities are named in the prompt, and the units are spelled** | *"At rank 3, which has the shorter cooldown: Aatrox W (Infernal Chains) or Akali W (Twilight Shroud)?"*; *"3 per 5 seconds"*, not `per_5_seconds` |
| **The blast radius is contained** | All 29 stored `ranked_format_configs` rows are `target='admin_bot'` — verified against the live table. No public Ranked format names `mastery_slice`, so the reachable surface is admin-bot matches and the Generator Lab |

---

## 9. Current structural limitations — observed only

No fixes are proposed for any of these.

### Data / source limitations

1. **84 of 692 QWER slots are held upstream**, leaving 5 champions with no ability comparison at
   all, 3 with one slot and 9 with two. Five distinct reason codes are involved
   (`secondary_gate` 27, `dual_form_row` 26, `no_cooldown` 11, `cooldown_shape_unsupported` 10,
   `nonstandard_rank_count` 10). Consequence: **880 base-stat-only pairs, 1,480 thin pairs.**
2. **`base_attack_speed` is comparison-incapable by construction** — no `dimension`, so no
   `ComparisonKey`, because its growth model is not projected.
3. **The roster's own value distributions are narrow for three metrics.** `base_magic_resist` has
   10 distinct values with 88.5% of the roster on two of them; `movement_speed` has 9 (315 to 355);
   `attack_range` has 19 but 47.4% of the roster on two. This is Riot's design, not a data
   defect, and it is the source of both the tie mass and the near-miss mass.
4. **`base_mana_regen` is served for manaless champions** — 3,553 pairs (23.9%) with one side at a
   structural 0, 231 of them a guaranteed 0–0 tie. The sibling metric `base_mana` declines
   correctly for the same champions.

### Policy limitations

5. **`family_unmapped` holds 404,023 candidates** — the entire `ability_cost` (104,899) and
   `champion_level_stat` (299,124) comparison universes — because `quiz/family_contract.py`
   declares no comparative family for either shape.
6. **The two servable families' declared exclusions are not applied on the Mastery path.**
   `FamilyContract.exclusions` is prose read by one report script, not a gate. Measured
   consequence: 91.5% of served `movement_speed` comparisons, 46.5% of `base_health` and 41.6%
   of `base_magic_resist` are a tie or inside their own family's stated exclusion band; 17.6% of
   cooldown comparisons are inside theirs.
7. **The reachable surface is admin-only.** No public Ranked format names `mastery_slice`; all 29
   stored configs are `admin_bot`. This limits exposure and also means none of the composition
   work has player evidence behind it.

### Family-contract limitations

8. **Two of four declared comparison templates have no family**, so two of four live renderer
   branches have no content.
9. **`champion_base_stat` is servable as a comparison and unservable as atomic recall**
   roster-wide — the long-standing asymmetry. A base stat can be compared between two champions
   but not recalled for one.
10. **The held `compare_champion_stat_at_level` renderer branch still carries the
    double-qualifier wording** (*"more Base Armor"*) that the base-stat branch had fixed. Inert
    today because the branch has no content.

### Composition limitations

11. **A slice's shape is decided by the distinct-fact ceiling, and that ceiling is asymmetric**:
    at most 4 ability facts against up to 10 base-stat facts. An 8-question slice is therefore
    **65.2% base stats** and averages 2.78 ability comparisons, regardless of the pair.
12. **Rank 5 is consistently under-drawn** — 12.9–13.1% against 16.0% availability, at all three
    lengths. The only axis where selection measurably departs from the pool.
13. **Ties still stack on the tail.** 42.5% of n=8 slices on the 40 tie-heaviest pairs carry three
    or more, because those pairs run out of deciding comparisons and the cap correctly yields
    rather than under-fill.
14. **Difficulty is not a composition input.** `difficulty_class` is carried on every candidate
    (3 for a plain comparison, 4 for a derived one) and nothing selects on it.
15. **The atomic half of the universe — 1,150,680 candidates, 78.1% — is unreachable** at every
    length the product uses.
16. **`SLOT_RELATIONS` is same-slot only.** A Q can only ever be compared with a Q. The mapping is
    widenable by construction and deliberately has not been widened.

### Presentation limitations

17. **The segment header echoes the caller's champion order while the questions use canonical
    order.** Config `(syndra, ahri)` produces *"Mastery Slice: Syndra vs Ahri"* over questions
    that read *"Ahri W vs Syndra W"*. Same digest, same content; only the header disagrees.
18. **The Generator Lab's coverage panel headlines `total_candidates`** (comparisons + both atomic
    banks, ~99 for a median pair) when the number that decides the product is
    `comparison_candidates` (~22).
19. **`formatComparisonSemantics.ts` renders `movement_speed` and `attack_range` with no
    qualifier and every `base_*` metric with one** — correct today, and a rule keyed on the slug
    spelling rather than on a declared property of the metric.
20. **No current screenshot exists.** The only real Matchup capture predates five passes; its
    `Fixed scenario` badge, grey initial-letter portraits, rank-silent prompt and `ABILITY R`
    band are all stale. Nothing rules out a purely visual regression at mobile width.

---

## 10. Decisions the owner may eventually need to make

Phrased as questions. **No recommendation is attached to any of them.**

**On what belongs in Matchup Mastery**

1. Should `movement_speed` remain a comparison metric, given that **91.5%** of its served
   comparisons are a tie or inside the band `champion_stat_compare` itself calls "a guess in the
   quiz"?
2. Should `base_magic_resist` remain one, given 10 roster values, 88.5% of champions on two of
   them, and a 2-point margin even when it is decisive?
3. Should base **regeneration** stats be part of a matchup product at all — is level-1 `hp5` /
   `mp5` knowledge a player uses, or a number a player looks up?
4. Should `base_mana_regen` decline for manaless champions the way `base_mana` already does, or
   is *"0 vs 50 per 5 seconds"* a legitimate question about a champion having no mana?

**On the authorities**

5. Should the Mastery path honour the exclusions its own family contracts declare — equal values,
   and margins under 5% / 10% — or is `FamilyContract.exclusions` documentation for the quiz
   generators only, and Mastery's own composition policy the whole of its quality gate?
6. Should `ability_cooldown_compare` and `champion_stat_compare` remain the families Matchup
   publishes under, given that both were written for a different generator with different
   exclusions?

**On held families**

7. Should a comparative `ability_cost` family be requested from the family-contract workstream —
   104,899 candidates, canonical data, a live renderer branch — and if so, what happens to the
   tie population it brings with it?
8. Should a comparative `champion_level_stat` family be requested — 299,124 candidates, the
   largest single held block in the product?
9. Is a two-family Matchup product the intended end state, or an interim one?

**On the current mix**

10. Is an 8-question slice that is **65.2% base stats and 2.78 ability comparisons** the intended
    shape of Matchup Mastery, or should the ability half carry more of a long slice?
11. Is the **4-ability-fact ceiling** a thing to work around (cross-slot comparisons, a widened
    `SLOT_RELATIONS`) or a thing to accept?
12. Should the product commit to a slice length? Every structural property in this document is
    length-dependent — family mix inverts, tie stacking rises, and atomic recall becomes reachable
    at n ≥ 9.

**On thin pairs**

13. Do the **880 base-stat-only pairs** need special treatment — a different length, a different
    mix, a refusal — or is a base-stat-only Matchup slice an acceptable product?
14. Is the **84-held-slot** upstream picture worth revisiting with CHAMPDATA, now that it is known
    to be five causes rather than one, and that `no_cooldown` and `secondary_gate` (38 of 84) are
    correct refusals no data fix should touch?

**On the atomic half**

15. Should **1,150,680 atomic candidates** that no slice length in use can reach stay in the
    matchup universe, or is the matchup pool the comparisons alone?

**On exposure**

16. Should `mastery_slice` enter a public Ranked format? Every measurement in this document is
    from admin-bot and Lab generation; none of it has player evidence behind it.

---

## 11. What this pass did not do

Not touched, per the brief: Matchup was not redesigned, no V2 architecture was proposed, no
implementation phases were proposed, Champion Mastery, the Applied-chain and Full Mastery were
not touched, tie policy was not changed, no family was enabled or removed, the composer was not
changed, persistence was not changed, no frontend code was changed, source authority was not
changed, and no runtime code was pushed.

`git status` in `/Users/macmoney/lcs-wt-gr1-tie` is clean, before and after. The only artifacts
of this pass are this document and the handoff entry that points at it.
