# GR1 — Matchup Mastery tie policy

Design and measurement over blocker 1 of
[`gr1-matchup-mastery-rank-diversity.md`](./gr1-matchup-mastery-rank-diversity.md) §9 —
*"tie policy is now a decision about shared base constants, not about ranks"*.

**AUDIT / DESIGN ONLY. No runtime code was changed, nothing was implemented, and no
policy was chosen for the generator.** Champion Mastery untouched. Applied-chain
untouched. No difficulty work. No family unlocked. No frontend change. Nothing pushed
to `master` or `main`.

| | |
|---|---|
| Date | 2026-09-13 |
| Backend audited | `League_Combat_Simulator` `origin/master` @ **`825e2db2`** (clean detached worktree `lcs-wt-gr1-rankdiv`, working tree clean) |
| Frontend | `mogsy` `origin/main` @ **`756b6b41`** — **read only, not run, not changed** |
| Scope | `mastery_mode: matchup`, tie policy only |
| Probe layer | in-process monkeypatches over `mastery.manifest.resolver`, discarded at exit. **Zero repo files modified** (`git status` clean before and after) |

---

## 0. How the evidence was produced

Four read-only instruments, all against the real canonical database, all through the
real pipeline.

1. **Pair sweep** — `identity → preflight_matchup → project_champion ×2 →
   compose_matchup → publication_gate.evaluate → dedupe_by_effective_question` over
   **all 14,878 pairs**, 173/173 champions, **0 errors**.
2. **Suppression sweep** — the same sweep, recording per pair how many candidates each
   Policy-D metric set would delete and what the pair is left with.
3. **Composition probe** — the real
   `recipe.synthesize_matchup_manifest → publication_gate.gate_snapshot` over a
   stratified **418-pair sample** × {3, 5, 8} questions × {no salt, `s1`, `s2`, `s3`}
   × **9 policy arms** = **45,144 real generated slices, 0 errors, 0 under-filled, 0
   comparison/atomic order violations.**
4. **Tie-usefulness probe** — 1,200 random pairs' real tied comparisons, rendered
   through the real adapter, plus the roster-wide value distribution of every
   tie-producing metric.

### The probe layer, and why it is not an implementation

Each policy is a monkeypatch on one of three existing seams, applied in the probe
process only:

| Policy | Patched | What that means |
|---|---|---|
| A | — | the shipped generator, unmodified |
| B / B2 | `_run_selection_plan` | a slice-level tie budget threaded exactly the way `used_patterns` already is |
| C | `_context_diverse_order` | the shipped within-pattern rotation, landing on a non-tie variant |
| D / Dn | `_build_universe` | the tied candidates of the named metrics do not exist |

`_build_universe` is **also memoized under every arm**, because it recomposes the pair
from the database on each of the two resolutions `gate_snapshot` performs, and that was
90% of the runtime. The memo is proved faithful rather than assumed: 12 slices resolved
with and without it produce **identical `snapshot_digest`s**, asserted in the probe
before any measurement runs.

### Two disclosures, and the second one matters more than anything else in this document

**The sample is 418, not 420.** The same strata and the same seed (`20260912`) as the
previous passes — 40 thinnest + 40 richest + 40 tie-heaviest + 300 random, deduplicated
— draw 418 here. Every arm below is the **same 418 pairs**, so every delta is exact.

**THE STRATIFIED SAMPLE OVER-STATES THE TIE RATE, AND SO DOES EVERY SLICE-LEVEL TIE
NUMBER IN THE TWO PREVIOUS GR1 DOCS.** 40 of its 418 pairs were drawn *for being the
most tie-heavy pairs on the roster*. On the 298 pairs that came from the random stratum
— which is what a player actually meets — the baseline is **9.54% / 10.20% / 10.58%** at
n=3/5/8, not 12.36% / 12.91% / 12.99%. The stratified figure is a **stress** figure. It
is the right instrument for comparing policies and the wrong one for deciding whether
there is a problem, and §1.4 reports both throughout. The earlier "13.29% at n=8" is
therefore also a stress number; the player-facing one was always ~10.6%.

---

## 1. The current tie baseline, at `825e2db2`

### 1.1 The comparison universe — reproduced exactly

The sweep reproduces the post-rank-diversity universe byte for byte, which is the proof
that this document measures the same product the last one shipped:

| | |
|---|---|
| Pairs generatable | **14,878 / 14,878**, 0 errors |
| Servable comparisons | **322,026** (192,562 `ability_cooldown` + 129,464 `champion_base_stat`) |
| Roster-wide tie rate | **30,604 / 322,026 = 9.50%** |
| Comparisons per pair | min **8** / median **22** / max **27**; zero pairs with none |
| Ties per pair | min 0 / median **2** / max **14**; **2,458 pairs (16.5%) have none** |

### 1.2 Tie rate by metric — and the contribution to total tie volume

| Metric | Comparisons | Ties | Tie rate | **Share of all tie volume** |
|---|---|---|---|---|
| `ability_cooldown` | 192,562 | 14,806 | 7.69% | **48.4%** |
| **`base_magic_resist`** | 14,878 | 5,845 | **39.29%** | **19.1%** |
| `movement_speed` | 14,878 | 2,739 | 18.41% | 8.9% |
| `attack_range` | 14,878 | 2,333 | 15.68% | 7.6% |
| `base_mana_regen` | 14,878 | 1,389 | 9.34% | 4.5% |
| `base_health_regen` | 14,878 | 1,114 | 7.49% | 3.6% |
| `base_attack_damage` | 14,878 | 757 | 5.09% | 2.5% |
| `base_armor` | 14,878 | 692 | 4.65% | 2.3% |
| `base_health` | 14,878 | 616 | 4.14% | 2.0% |
| `base_mana` | 10,440 | 313 | 3.00% | 1.0% |

By family: `champion_base_stat` **12.20%**, `ability_cooldown` **7.69%**. No metric is
tie-free.

**Note the two columns disagree about what the problem is.** `base_magic_resist` has the
worst *rate* by a factor of two; `ability_cooldown` contributes the most *volume*,
because it is 60% of the universe. A policy aimed only at the worst rate addresses a
fifth of the ties.

### 1.3 Tie rate by ability slot and rank — kits agree at BOTH ends

| slot | r1 | r2 | r3 | r4 | r5 |
|---|---|---|---|---|---|
| Q | 8.54% | 4.42% | 9.24% | 5.27% | **10.97%** |
| W | 5.31% | 2.92% | 5.40% | 3.51% | **7.04%** |
| E | 7.44% | 3.33% | 6.42% | 3.63% | **8.99%** |
| R | **17.18%** | 9.56% | 15.06% | — | — |

Rank-independent (flat) pairs: 2,421 candidates, **7.02%** ties.

**This corrects an assumption the previous two documents carried.** They said rank 1 is
where kits agree *by convention* — true, and `R` at rank 1 (17.18%, the shared 120 s
ultimate) is the single worst cell in the table. But **rank 5 is nearly as tie-prone as
rank 1 for every basic ability**, because cooldown sequences converge on a shared floor:
the most frequent tied cooldown values roster-wide are 120 s (the rank-1 ultimate
convention) and then 12 / 10 / 8 / 9 / 7 / 6 s (basic abilities at max rank). Ties are a
**U-shape over rank**, not a rank-1 artefact, which is exactly why the rank-diversity
pass bought only 0.24 points: it moved draws from one end of the U to the other.

### 1.4 In real slices — the baseline, on both samples

| | n=3 | n=5 | n=8 |
|---|---|---|---|
| **Stratified 418 (stress)** | | | |
| tie questions / all | **12.36%** | **12.91%** | **12.99%** |
| slices ≥1 tie | 30.6% | 44.7% | **58.1%** |
| ≥2 | 5.9% | 15.0% | **28.3%** |
| ≥3 | 0.5% | 4.2% | **11.7%** |
| adjacent tie pairs (per 1,672 slices) | 87 | 169 | **323** |
| **Random 298 (player-facing)** | | | |
| tie questions / all | **9.54%** | **10.20%** | **10.58%** |
| slices ≥1 tie | 26.0% | 41.2% | 56.9% |
| ≥2 | 2.4% | 8.6% | 21.6% |
| ≥3 | **0.2%** | **1.1%** | **5.5%** |
| **Tie-heaviest 40 (the tail)** | | | |
| tie questions / all | **43.3%** | **43.6%** | **40.9%** |
| slices ≥1 tie | 87.5% | 98.1% | **100.0%** |
| ≥2 | 38.1% | 78.8% | **100.0%** |
| ≥3 | 4.4% | 35.0% | **71.9%** |

Candidate/pair coverage under the baseline: **0 under-filled slices, 0 atomic fallback
at n ≤ 8, 0 repeated `(subject, slot, metric)`, 0 repeated ability slot, longest
same-metric run 2, 4 salts ⇒ 4 distinct slices for all 418 pairs.** Confirmed
post-rank-diversity baseline; nothing regressed between the two passes.

### 1.5 The shape of the problem, stated once

The pair-level tie rate across all 14,878 pairs:

| p25 | median | p75 | p90 | p95 | p99 | max | mean |
|---|---|---|---|---|---|---|---|
| 3.8% | **8.3%** | 13.6% | 21.7% | 25.9% | 36.8% | **63.6%** | 9.76% |

**426 pairs (2.9%) sit above a 30% tie rate. 8,889 pairs (59.7%) sit below 10%.**

So the product defect is **not an average**, it is a **tail**. The median 8-question
slice has one tie and reads fine. The worst 2.9% of pairs produce a slice that is
one-third to two-thirds "these are the same", and on the 40 worst pairs an 8-question
slice is **guaranteed** two ties and carries three or more 72% of the time. **Any policy
judged on the average will be judged on the wrong number.**

---

## 2. Four policies, simulated

### Policy A — natural
The shipped generator. No tie preference. Nothing reads `outcome.tie_state`.

### Policy B — slice cap
Ties allowed but capped per slice: **1 at n=3, 1 at n=5, 2 at n=8** (the brief's
values; as a rule, `max(1, n // 4)`). Implemented as a budget threaded through the
selection plan the way `used_patterns` already is: an over-budget tie is **deferred**,
not removed, so it stays a legal filler and the request's count and under-fill
behaviour cannot move.

**Two forms were measured, because the naive one has a real cost.** `B` defers an
over-budget tie behind *everything* remaining, including candidates whose fact the slice
has already asked — so when the cap binds and fresh non-ties run out, the slice buys a
non-tie by **repeating a fact**: 34 of 1,672 slices at n=5 and 6 at n=8 repeat a
`(subject, slot, metric)` and an ability slot, which the generator has held at zero
since GR1 Phase 3. `B2` keeps the two deferrals in separate queues and drains
fresh-pattern ties **first**, so a tie is only ever taken over a fresh non-tie and never
a repeat over a tie. **B2 holds repeats at 0 for +0.1 points of tie rate.** Every later
reference to "the cap" means B2.

**Are non-tie alternatives available?** Yes, and without any fallback: **0 under-filled
slices and 0 atomic questions** in all 5,016 cap slices at every length. Where the cap
is *not* honoured it is because the pair's comparison pool has no non-tie left at all —
n=3 0.0% over-cap, n=5 3.7%, n=8 3.2% — and the generator correctly serves the tie
rather than shortening the slice.

### Policy C — tie deprioritization
The **smallest** composition-level preference that exists: the shipped
`_context_diverse_order` already rotates each pattern's own context variants by a
`(seed, pattern)` hash; C makes that rotation land on the first **non-tie** variant at
or after the seeded offset, cyclically. Nothing else changes.

Three properties follow from the mechanism rather than from care, and all three are
measured below: **pattern ORDER is untouched** (so no category, slot or metric is
reordered), **the pool is unchanged as a set** (so no count can move), and **a
single-variant pattern does not move at all**.

That last one is C's hard ceiling and it is worth stating plainly: **a base stat has
exactly one candidate per pair.** There is no second variant to prefer. C therefore
**cannot touch a single base-stat tie**, and the measurement confirms it exactly —
`base_magic_resist` 644 → **644**, `attack_range` 373 → **373**, `movement_speed`
343 → **343**, byte-identical. C is a cooldown-family policy and nothing else.

It was deliberately **not** implemented as "sort all non-ties before all ties". That
would reorder patterns and so would trade tie rate for category/slot/metric diversity,
which is the distortion the brief rules out.

### Policy D — metric-level suppression
A tied comparison of a named metric is removed from the candidate universe entirely.
**The metric itself is never removed**: wherever the two champions differ, the question
is served exactly as before.

Metric selection is read off §1.2 rather than chosen. `base_magic_resist` (39.3%),
`movement_speed` (18.4%) and `attack_range` (15.7%) are the only metrics whose rate is
materially elevated — the next one down, `base_mana_regen` at 9.34%, is within a point
and a half of the whole `ability_cooldown` family's 7.69% and is not distinguishable as
"low discriminative value". Two variants were measured: **`D`** = all three,
**`Dn`** = `base_magic_resist` only.

**The universe cost, over all 14,878 pairs:**

| | D (three metrics) | Dn (MR only) |
|---|---|---|
| Comparisons removed | **10,917 of 322,026 (3.39%)** | 5,845 (1.82%) |
| Pairs affected | **7,765 (52.2%)** | 5,845 (39.3%) |
| Comparisons per pair, min | 8 → **5** | 8 → **7** |
| Pairs left below 8 comparisons | **229** | 41 |
| Pairs left below 5 / below 3 | **0 / 0** | 0 / 0 |
| Pairs left with none | **0** | 0 |

Because no pair drops below 5, **D can never cost a comparison at n=3 or n=5**. The
whole of its fallback cost lands at n=8, and it is exactly the 229 thin pairs.

---

## 3. Policy comparison

Same 418 pairs, same four salts, 1,672 slices per cell. `cd/bs` is the count of
cooldown vs base-stat questions drawn — the family mix. "pairs ≠ A" is how many of the
418 pairs have **any** slice whose `snapshot_digest` differs from the baseline.

### n=3

| policy | tie rate | ≥1 | ≥2 | ≥3 | adj. ties | under­fill | atomic slices | repeat fact | repeat slot | metric run | metric div. | cd/bs drawn | 4 salts ⇒ 4 | pairs ≠ A |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **A** natural | 12.36% | 30.6% | 5.9% | 0.5% | 87 | 0 | 0 | 0 | 0 | 2 | 2.16 | 2864/2152 | 418/418 | — |
| **B** cap, naive | 10.21% | 30.6% | 0.0% | 0.0% | 0 | 0 | 0 | 0 | 0 | 2 | 2.16 | 2864/2152 | 418/418 | 62 |
| **B2** cap | 10.35% | 30.6% | 0.4% | 0.0% | 7 | 0 | 0 | 0 | 0 | 2 | 2.16 | 2864/2152 | 418/418 | 60 |
| **C** deprioritize | 9.27% | 23.7% | 3.9% | 0.1% | 51 | 0 | 0 | 0 | 0 | 2 | 2.16 | 2864/2152 | 418/418 | 112 |
| **C + cap** | **7.91%** | 23.7% | **0.0%** | **0.0%** | **0** | 0 | 0 | 0 | 0 | 2 | 2.16 | 2864/2152 | 418/418 | 138 |
| **D** suppress ×3 | 9.45% | 23.9% | 4.4% | 0.1% | 60 | 0 | 0 | 0 | 0 | 2 | 2.16 | 2864/2152 | 418/418 | 212 |
| **Dn** suppress MR | 11.16% | 27.9% | 4.9% | 0.7% | 76 | 0 | 0 | 0 | 0 | 2 | 2.16 | 2864/2152 | 418/418 | 170 |
| C + Dn | 7.87% | 20.3% | 3.2% | 0.2% | 43 | 0 | 0 | 0 | 0 | 2 | 2.16 | 2864/2152 | 418/418 | 236 |
| C + D | 6.00% | 15.7% | 2.3% | 0.1% | 30 | 0 | 0 | 0 | 0 | 2 | 2.16 | 2864/2152 | 418/418 | 267 |

### n=5

| policy | tie rate | ≥1 | ≥2 | ≥3 | adj. ties | under­fill | atomic slices | repeat fact | repeat slot | metric run | metric div. | cd/bs drawn | 4 salts ⇒ 4 | pairs ≠ A |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **A** natural | 12.91% | 44.7% | 15.0% | 4.2% | 169 | 0 | 0 | 0 | 0 | 2 | 3.41 | 4124/4236 | 418/418 | — |
| **B** cap, naive | 9.21% | 44.7% | 1.4% | 0.0% | 0 | 0 | 0 | **34** | **34** | 2 | 3.41 | 4124/4236 | 418/418 | 118 |
| **B2** cap | 9.75% | 44.7% | 3.7% | 0.4% | 6 | 0 | 0 | 0 | 0 | 2 | 3.41 | 4124/4236 | 418/418 | 110 |
| **C** deprioritize | 10.30% | 36.8% | 12.0% | 2.5% | 115 | 0 | 0 | 0 | 0 | 2 | 3.41 | 4124/4236 | 418/418 | 136 |
| **C + cap** | **7.70%** | 36.8% | **1.7%** | **0.0%** | **0** | 0 | 0 | 0 | 0 | 2 | 3.41 | 4124/4236 | 418/418 | 191 |
| **D** suppress ×3 | 8.83% | 32.8% | 9.6% | 1.6% | 83 | 0 | 0 | 0 | 0 | 2 | 3.41 | 4124/4236 | 418/418 | 212 |
| **Dn** suppress MR | 10.93% | 38.9% | 12.2% | 3.1% | 130 | 0 | 0 | 0 | 0 | 2 | 3.41 | 4124/4236 | 418/418 | 170 |
| C + Dn | 8.22% | 30.4% | 9.2% | 1.5% | 81 | 0 | 0 | 0 | 0 | 2 | 3.41 | 4124/4236 | 418/418 | 252 |
| C + D | 5.86% | 22.9% | 5.9% | 0.5% | 46 | 0 | 0 | 0 | 0 | 2 | 3.41 | 4124/4236 | 418/418 | 279 |

### n=8

| policy | tie rate | ≥1 | ≥2 | ≥3 | adj. ties | under­fill | atomic slices | repeat fact | repeat slot | metric run | metric div. | cd/bs drawn | 4 salts ⇒ 4 | pairs ≠ A |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **A** natural | 12.99% | 58.1% | 28.3% | 11.7% | 323 | 0 | 0 | 0 | 0 | 2 | 5.94 | 4900/8476 | 418/418 | — |
| **B** cap, naive | 11.19% | 58.1% | 28.3% | 2.3% | 165 | 0 | 0 | **6** | **6** | 2 | 5.94 | 4900/8476 | 418/418 | 81 |
| **B2** cap | 11.31% | 58.1% | 28.3% | 3.2% | 165 | 0 | 0 | 0 | 0 | 2 | 5.94 | 4900/8476 | 418/418 | 79 |
| **C** deprioritize | 10.99% | 51.0% | 24.3% | 9.0% | 240 | 0 | 0 | 0 | 0 | 2 | 5.94 | 4900/8476 | 418/418 | 152 |
| **C + cap** | **9.70%** | 51.0% | 24.3% | **1.9%** | 127 | 0 | **0** | **0** | **0** | 2 | 5.94 | 4900/8476 | 418/418 | 184 |
| **D** suppress ×3 | 7.78% | 40.8% | 14.7% | 4.7% | 115 | 0 | **64** | **8** | **8** | 2 | 5.93 | 4968/8384 | 418/418 | 212 |
| **Dn** suppress MR | 10.55% | 52.5% | 20.9% | 7.2% | 200 | 0 | **32** | 0 | 0 | 2 | 5.94 | 4932/8444 | 418/418 | 170 |
| C + Dn | 8.50% | 44.5% | 16.5% | 4.8% | 147 | 0 | **32** | 0 | 0 | 2 | 5.94 | 4932/8444 | 418/418 | 262 |
| C + D | **5.59%** | 30.4% | 10.6% | 2.4% | 75 | 0 | **64** | **8** | **8** | 2 | 5.93 | 4968/8384 | 418/418 | 288 |

### On the tail — the only cell that decides this

The 40 tie-heaviest pairs, n=8 (480 slices — the pairs that produce the complaint):

| policy | tie rate | ≥1 | ≥2 | **≥3** | adj. ties |
|---|---|---|---|---|---|
| A | 40.94% | 100.0% | 100.0% | **71.9%** | 183 |
| B2 cap | 29.22% | 100.0% | 100.0% | **25.0%** | 68 |
| C | 37.34% | 100.0% | 100.0% | **63.1%** | 151 |
| **C + cap** | **27.19%** | 100.0% | 100.0% | **12.5%** | 60 |
| D | 31.95% | 100.0% | 93.1% | 41.9% | 79 |
| Dn | 36.80% | 100.0% | 98.1% | 56.2% | 127 |
| C + D | 28.12% | 100.0% | 88.8% | 22.5% | 61 |

**C alone barely dents the tail** (71.9% → 63.1%): the tail is base-stat-dense, and C
provably cannot touch a base stat. **D dents it but does not fix it** (→ 41.9%) and pays
64 atomic slices and 8 repeated facts to get there. **Only a per-slice cap is shaped
like the problem**, because it is the only one of the four whose strength scales with
how dense the ties in *this* slice are: it does nothing to the 74% of slices that
already carry at most one.

### Tie volume by metric, pooled over n=3/5/8

| metric | A | rate | B2 | C | C+cap | D | Dn | C+Dn | C+D |
|---|---|---|---|---|---|---|---|---|---|
| `ability_cooldown` | 1,525 | 12.8% | 1,434 | **885** | 826 | 1,578 | 1,548 | 882 | 864 |
| `base_magic_resist` | 644 | 37.5% | 479 | **644** | 512 | **0** | **0** | 0 | 0 |
| `attack_range` | 373 | 21.1% | 294 | **373** | 319 | **0** | 391 | 391 | 0 |
| `movement_speed` | 343 | 19.5% | 242 | **343** | 256 | **0** | 357 | 357 | 0 |
| `base_mana_regen` | 153 | 8.6% | 81 | 153 | 97 | **190** | 176 | 176 | 190 |
| `base_health_regen` | 110 | 6.5% | 88 | 110 | 90 | **133** | 115 | 115 | 133 |
| `base_armor` | 80 | 4.7% | 66 | 80 | 70 | **120** | 104 | 104 | 120 |
| `base_health` | 79 | 4.5% | 70 | 79 | 70 | 83 | 76 | 76 | 83 |
| `base_attack_damage` | 71 | 4.1% | 50 | 71 | 51 | 89 | 71 | 71 | 89 |
| `base_mana` | 58 | 6.1% | 43 | 58 | 48 | 60 | 47 | 47 | 60 |
| **TOTAL** | **3,436** | | 2,847 | 2,796 | **2,339** | **2,253** | 2,885 | 2,219 | **1,539** |

Two things are visible here that no headline rate shows.

**C is surgical.** It removes 42% of the cooldown tie volume (1,525 → 885) and changes
**not one** base-stat tie. Read against §2's mechanism, that is not a coincidence — it
is the single-variant property, measured.

**D leaks.** Removing the MR/MS/range ties frees budget that the allocator spends on
*other* base stats, which have tie rates of their own: `base_mana_regen` **rises**
153 → 190, `base_armor` 80 → 120, `base_health_regen` 110 → 133, and even
`ability_cooldown` 1,525 → 1,578. **D deletes 1,360 tie questions from the draw and the
total falls by only 1,183.** 13% of the benefit is immediately re-acquired elsewhere.
That is what "suppression is whack-a-mole over a roster of shared constants" looks like
in numbers.

### Rank diversity, determinism, symmetry, seed variation — the invariants

The rank-diversity pass's achievement is that the drawn rank distribution tracks the
pool's own. **No policy disturbs it.** Shares among rank-bearing cooldown comparisons
(flat pairs excluded, which is why rank 1 reads ~24% and matches the previous document's
24.0%):

| n=8 | r1 | r2 | r3 | r4 | r5 |
|---|---|---|---|---|---|
| pool | 23.6% | 22.4% | 22.4% | 15.8% | 15.8% |
| A | 24.31% | 23.39% | 23.52% | 15.17% | 13.60% |
| C | 24.12% | 24.44% | 22.96% | 15.47% | 13.00% |
| Dn | 23.78% | 23.71% | 24.79% | 14.22% | 13.50% |
| C + Dn | 23.52% | 24.79% | 24.36% | 14.52% | 12.81% |

Maximum drift from A across every policy and every length: **1.1 points.** And C's
effect inside the family is visible in the *tie rate per rank*, which A leaves as the
§1.3 U-shape and C flattens:

| n=8 cooldown tie rate | r1 | r2 | r3 | r4 | r5 | family |
|---|---|---|---|---|---|---|
| A | 16.39% | 12.09% | 12.75% | 10.73% | 14.02% | **12.88%** |
| C | 8.61% | 8.06% | 6.90% | 7.48% | 6.43% | **7.43%** |

C removes the U entirely, because wherever a fact discriminates at *some* rank it is now
asked at one of those. What is left — 7.43% — is the irreducible part, and the universe
says exactly how big that is: of **43,085** rank-bearing cooldown patterns roster-wide,
**1,220 (2.83%) tie at every published rank**, while **9,880 (22.93%) tie at some rank
and not others**. That second number is the same 9,880 the rank-identity pass measured
as "a tie at one rank and decisive at another" — the population C addresses, arriving at
it from the other direction.

**Every policy, at every length:** determinism (same salt × 3 runs ⇒ **1** distinct
digest, 40 pairs), reversed-pair symmetry (`(a,b)` ≡ `(b,a)` ⇒ identical digest,
**40/40** pairs), seed variation (4 salts ⇒ **4** distinct slices for **all 418** pairs),
longest same-metric run **2**, comparison-before-atomic violations **0**, under-filled
slices **0**, and zero `SELECTION_UNDER_FILLED` / `SELECTION_EMPTY` diagnostics across
all **45,144** slices. *(One observation: under D and C+D, 8 of 5,016 slices carry a
`policy_excluded` diagnostic that the baseline does not — the changed universe moves the
seed, so the pre-gate resolution occasionally lands on a `family_unmapped` candidate the
gate then drops and refills. No shortage resulted in any of the 8.)*

---

## 4. Is a tie a useful question? The evidence, not an opinion

### 4.1 The roster's own value distributions — how many answers a metric has

| metric | champions | distinct values | modal value | modal share | P(two random champions tie) | top values |
|---|---|---|---|---|---|---|
| **`base_magic_resist`** | 173 | **10** | 32 | **45.1%** | **39.29%** | 32 ×78, 30 ×75, 28 ×12 |
| `movement_speed` | 173 | 9 | 335 | 23.7% | 18.41% | 335 ×41, 330 ×38, 340 ×37, 345 ×27 |
| `attack_range` | 173 | 19 | 125 | 26.6% | 15.68% | 125 ×46, 550 ×36, 175 ×28, 525 ×18 |
| `base_mana_regen` | 173 | 37 | 8 | 22.5% | 9.34% | 8 ×39, 0 ×22, 7 ×18 |
| `base_health_regen` | 173 | 19 | 5.5 | 15.0% | 7.49% | 5.5 ×26, 7 ×17, 8.5 ×16 |
| `base_attack_damage` | 173 | 25 | 60 | 9.8% | 5.09% | 60 ×17, 55 ×17, 62 ×13 |
| `base_armor` | 173 | 24 | 35 | 7.5% | 4.65% | 35 ×13, 33 ×13, 24 ×13 |
| `base_health` | 173 | 51 | 630 | 11.6% | 4.14% | 630 ×20, 600 ×13, 610 ×12 |

**`base_magic_resist` has ten distinct values across the whole roster, and two of them
cover 88.5% of it.** The question "which has more base magic resist" is, for 88.5% of
champions, the question "is this one in the 32 club or the 30 club" — and a tie is
"same club", which is what 39.3% of pairs are. Nothing in the shape of that question
gets more informative with practice.

### 4.2 Real tied questions, classified, with the canonical values

Rendered through the real adapter, then through the real
`formatComparisonSemantics.ts` template, from a 1,200-pair sample.

**Low-information / trivial shared constant.** 396 of 400 sampled `base_magic_resist`
ties are 30 or 32:

```
Which has more base Magic Resist: Yasuo or Zaahen?
  Yasuo: 32 magic resist. Zaahen: 32 magic resist. Tie.

Which has more base Magic Resist: Samira or Soraka?
  Samira: 30 magic resist. Soraka: 30 magic resist. Tie.

Which has more base Mana Regen: Annie or Azir?
  Annie: 8 per 5 seconds. Azir: 8 per 5 seconds. Tie.        (8 = 22.5% of the roster)
```

A marksman and a support at the same 30 MR is not a fact about either of them. It is a
fact about Riot's default.

**Acceptable but repetitive / common.** Movement speed and the melee/ranged range
brackets. The *decisive* form of these is real knowledge — 340 vs 325 matters in lane —
but the tie form teaches only "both sit in this bracket":

```
Which has more Movement Speed: Vi or Zyra?
  Vi: 340 units per second. Zyra: 340 units per second. Tie.

Which has more Attack Range: Cho'Gath or Talon?
  Cho'Gath: 125 units. Talon: 125 units. Tie.                (= "both melee", 26.6% of roster)

Which has more Attack Range: Aurora or Elise?
  Aurora: 550 units. Elise: 550 units. Tie.                  (= "both standard ranged", 20.8%)
```

**Useful knowledge test.** A rank-specific cooldown equality is genuinely
non-universal — it names two abilities and one rank, and the same two abilities usually
differ at other ranks:

```
At rank 5, which has the shorter cooldown: Cho'Gath Q (Rupture) or Talon Q (Noxian Diplomacy)?
  Cho'Gath Q (Rupture): 6 seconds. Talon Q (Noxian Diplomacy): 6 seconds. Tie.

At rank 3, which has the shorter cooldown: Vi R (Cease and Desist) or Zyra R (Stranglethorns)?
  Vi R (Cease and Desist): 90 seconds. Zyra R (Stranglethorns): 90 seconds. Tie.

Which has the shorter cooldown: Nocturne Q (Duskbringer) or Sona Q (Hymn of Valor)?
  Nocturne Q (Duskbringer): 8 seconds. Sona Q (Hymn of Valor): 8 seconds. Tie.
```

The third one states **no rank** — it is the composer's flat pair, both abilities 8 s at
every rank. That is the most defensible tie in the product: a genuine invariant, stated
as one.

**Useful but convention-bound.** The one cell the previous documents already named:

```
At rank 1, which has the shorter cooldown: Briar R (Certain Death) or Ezreal R (Trueshot Barrage)?
  Briar R (Certain Death): 120 seconds. Ezreal R (Trueshot Barrage): 120 seconds. Tie.
```

120 s at rank 1 is a design convention shared by 36 of 54 sampled R-rank-1 ties. Asking
it once is fine; it is the single most repeated tie in the product.

### 4.3 Repetitiveness — the measured shape

Among stratified-sample slices that hold **two or more** ties (policy A):

| | n=3 | n=5 | n=8 |
|---|---|---|---|
| ties-per-slice distribution | 0:1160 1:413 2:90 3:9 | 0:925 1:497 2:180 3:58 4:12 | 0:700 1:499 2:277 3:128 4:44 5:21 6:2 7:1 |
| slices with ≥2 | 99 | 250 | 473 |
| …of which **repeat a tie metric** | 42% | 45% | 31% |
| …of which are **all base-stat** | 10% | 21% | 36% |
| **adjacent tie pairs** | 87 | 169 | **323** |

At n=8, **323 adjacent tie pairs across 1,672 slices** — roughly one slice in five puts
two "they're the same" cards back to back — and **36% of multi-tie slices are ties
entirely within the base-stat family**, i.e. two or three consecutive shared constants.
That, not the rate, is what reads as broken.

---

## 5. Recommendation

### Adopt a narrowly defined hybrid: **tie deprioritization (C) + a per-slice tie cap (B2)**. Do NOT adopt metric-level suppression (D).

The brief asks for the smallest policy that solves the actual problem and permits a
hybrid only if the measurements clearly justify it. They do, and the justification is
that **C and the cap fix two different defects and neither substitutes for the other**:

* **C fixes "asked at a rank where this exact fact happens to tie, when the same fact
  discriminates at another rank."** 9,880 of 43,085 cooldown patterns are in that state.
  The cap cannot fix it — the cap's only move is to *drop* the question; C keeps the
  question and asks it where it has an answer. This is the same class of defect as the
  rank-identity fix, one level down.
* **The cap fixes stacking**, which §1.5 and §3 show is the actual product problem: a
  tail of 2.9% of pairs where a slice is guaranteed multiple ties. C is nearly powerless
  there (71.9% → 63.1% at ≥3) because the tail is base-stat-dense and C provably cannot
  touch a base stat.

Together, at zero measured cost: **≥3 ties 0.5% → 0.0% (n=3), 4.2% → 0.0% (n=5), 11.7%
→ 1.9% (n=8); adjacent tie pairs 87/169/323 → 0/0/127; on the tail at n=8, ≥3 ties
71.9% → 12.5%.** Adding C to the cap is worth 1.6–2.4 points of rate and halves the
residual ≥3 on the tail, and **its measured cost on every axis is exactly zero.**

### Why not each of the others

**Not natural (A).** The average is defensible — 10.6% on a random pair draw, and 74%
of 8-question slices carry at most one tie. The tail is not: 100% of slices on the 40
worst pairs carry two ties and 71.9% carry three or more. A player who queues into one
of those 426 pairs gets a coin-flip round, and no amount of "it's fine on average"
reaches them.

**Not the cap alone.** It leaves the cooldown family asking discriminating facts at
their tying rank, and it leaves 25.0% of tail slices at ≥3 where C+cap reaches 12.5%.
Adding C is free.

**Not C alone.** It cannot touch a base stat, which is 51.6% of the tie volume and most
of the tail.

**Not D, in either form, and this is the firmest of the five conclusions.** D is the only
policy that changes what the product *contains* rather than what a slice *chooses*, and
it buys its rate with four separate costs the others do not pay:

1. **It deletes 3.39% of the comparison universe and touches 52.2% of all pairs** —
   against the recommended hybrid, which changes nothing about the universe at all. (At
   n=8, D changes some slice of 212 of the 418 sampled pairs, the hybrid 184, the cap
   alone 79 — but only D's change is a question that no longer exists at any seed.)
2. **It pushes atomic single-champion recall into a comparative product.** 64 of 1,672
   n=8 slices draw atomic questions they would not have drawn, and 8 repeat a fact —
   both invariants the generator has held at zero since Phase 3. A Matchup slice that
   asks a single-champion question instead of a comparison has stopped being a matchup
   slice; that is a worse defect than the tie it avoided.
3. **13% of its benefit leaks straight back** into `base_mana_regen`, `base_armor` and
   `base_health_regen`, whose tie counts *rise* under it. Every metric on the roster has
   shared constants; suppressing three just moves the draw onto the fourth.
4. **It deletes legitimate knowledge.** "Aurora 550 vs Elise 550 — tie" is a real fact
   about two ranged champions; `attack_range` has 19 distinct values and its decisive
   form is genuine lane knowledge. D cannot tell that from "both are in the 32 MR club",
   because it suppresses by metric and the problem is per-value.

If a future pass wants the MR-shaped questions gone, **the honest instrument is content,
not policy**: `base_magic_resist` with ten roster values is a weak comparison *even when
decisive* (32 vs 30 is a 2-point difference nobody plays around), and the right fix is
to reconsider whether it should be a comparison metric at all — a `quiz/family_contract`
and CHAMPDATA question, not a tie question. That is explicitly **out of scope here** and
is logged as a new open item rather than done.

### What changes in generator behaviour

* `_context_diverse_order`'s seeded within-pattern rotation lands on a discriminating
  variant where the pattern has one. **Pattern order, pool membership, and
  single-variant patterns are untouched** — so allocation, counts, fill, family mix,
  metric diversity and the rank distribution cannot move, and the measurements confirm
  all six are identical to the baseline.
* The selection plan carries a slice-level tie budget alongside the `used_patterns` set
  it already carries. An over-budget tie is **deferred, never removed**, and is drained
  *before* any already-met pattern — which is the whole difference between B2 and B, and
  is what holds repeated facts at 0.
* Generated Matchup `mastery_set_id`s and `artifact_digest`s **move**, because the
  composition they identify changed. The same thing Phase 3, the rank-identity pass and
  the rank-diversity pass each did.

### What remains untouched

The candidate universe, the composer, the publication gate, source authority, every
canonical value, `champion_stats`, `champion_abilities`, Champion Mastery (which must
not adopt either flag, and should be asserted not to), Applied-chain, difficulty,
persistence and history, the wire contract, and **the frontend** — `tie_state` already
travels, the "Tie / Same" control is already rendered, and a tie is still a legal
correct answer. Zero DDL, no migration, nothing to sequence. Segments frozen before a
deploy are unaffected: both new policy fields are absent-means-off on both sides.

### Implementation footprint

| File | Change |
|---|---|
| `mastery/manifest/contract.py` | two `RepetitionPolicy` fields — `prefer_discriminating_context: bool = False` and `max_tie_questions: Optional[int] = None` — each emitted into `to_dict()` **only when set**, so every manifest authored before them keeps a byte-identical dict and its pinned digest |
| `mastery/manifest/resolver.py` | the non-tie landing inside `_context_diverse_order`; the tie budget threaded through `_run_selection_plan` → `_select_for_request` with the two-queue deferral |
| `mastery/synthesis/recipe.py` | `synthesize_matchup_manifest` sets both. The cap as a **rule**, `max(1, question_count // 4)`, not a per-length literal — which reproduces the brief's 1 / 1 / 2 at n=3 / 5 / 8. `synthesize_champion_manifest` sets neither, asserted |
| `mastery/tests/test_gr1_matchup_tie_policy.py` | new |

**Three runtime files, all already inside `SLICE_FOOTPRINT`** (`mastery/manifest/` and
`mastery/tests/` via `MASTERY_PACKAGES`, `mastery/synthesis/` via `GR1_PACKAGES`), so
`GR1_RUNTIME_FILES`, `GR1_PACKAGES`, `MASTERY_FOOTPRINT`, `RANKED_BUILDER_FOOTPRINT`,
`BANNED_PREFIXES` and `SHARED_INTEGRATION_FILES` all stay as they are and **no other
workstream's boundary moves.** Frontend: **no change, none needed.**

Complexity: **small.** Both mechanisms are one level of indirection on seams that
already exist — the shipped within-pattern rotation, and the shipped cross-request
`used_patterns` threading. Neither introduces a new stage, a new import, a champion
name, a metric literal or a rank literal.

### Regression risk, and where it actually sits

| Risk | Assessment |
|---|---|
| Generated Matchup identities move | **Certain and intended.** Same as the previous three passes. Reachable surface is admin-bot matches and the Generator Lab; no public Ranked format names `mastery_slice` and all 29 stored configs are `target='admin_bot'` |
| Champion Mastery drifts | **The real risk**, because both flags live on the shared `RepetitionPolicy`. Mitigated exactly as rank diversity was: off by default, set only by the Matchup synthesizer, with a test asserting Champion Mastery does not adopt them and its artifacts still reproduce |
| A hand-authored recipe that pins `ability_rank` stops resolving to its rank | **None.** `_matches` filters before any of this runs; the rank-diversity suite already pins this and the new preference sits inside the same function |
| The cap starves a thin pair | **Measured at zero.** 0 under-filled slices and 0 atomic questions in 5,016 cap slices; the cap is a preference satisfied where alternatives exist and abandoned where they do not, which is why n=8 keeps a 1.9% residual at ≥3 instead of forcing a repeat |
| The cap makes a later request depend on an earlier one | **Not new.** `used_patterns` has been a slice-level, cross-request set since the GR1 readiness pass; the budget is threaded through the identical parameter |
| Reading `outcome.is_tie` in the resolver | **New, and worth naming.** This is the first resolver code that reads a candidate's *answer*. The resolver's Phase 4A isolation says it consults no serving policy; a tie state is content, not policy, and it is already on the candidate the selector holds — but a reviewer should confirm that boundary deliberately rather than incidentally |

---

## 6. The product questions, answered

**Is one tie in a short slice actually bad?** **No.** It is one of three options, it is a
true statement about both champions, and it is the only answer a player cannot reach from
priors — "the ranged one has more range" is guessable, "they are identical" is not. In a
3-question slice a single tie still leaves two discriminating questions, and 74% of
random-draw 3-question slices have no tie at all. **Nothing in this document argues for
removing the first tie**, and both recommended caps allow it.

**At what point do ties become repetitive?** **At two, when they share a family or sit
adjacent; unambiguously at three.** The measurement, not the intuition: among multi-tie
slices, 31–45% repeat a *tie metric* and 36% of n=8 ones are ties entirely inside the
base-stat family; 323 adjacent tie pairs fall across 1,672 n=8 slices. Three ties in
eight is 37.5% of the round returning "same", and on the worst 40 pairs that is the
**modal** outcome at 71.9%. That is why the recommended cap is `max(1, n // 4)` — it
permits one in a short slice and two in eight, and forbids the third.

**Are base-MR ties worth asking at all?** **The tie form, essentially no; and the
decisive form is weak too.** Ten distinct values across 173 champions, with 32 and 30
covering 88.5% of the roster. A tie says "both took the default", which is 39.3% of
pairs. This is the clearest single content finding in the pass — and it is a *content*
finding, which is why the recommendation does not suppress the metric: deleting the 39.3%
that tie leaves the 60.7% that differ by 2 points, which is not much better. Whether
`base_magic_resist` belongs in a comparison family is a `quiz/family_contract` /
CHAMPDATA question and is now logged as one.

**Should a tie be a valid correct answer in Matchup Mastery?** **Yes, unconditionally.**
It is the canonical answer; the alternatives are to hide the question (Policy D, which
costs content) or to grade a tie as a win for one side (a correctness lie of exactly the
kind the rank-identity pass existed to remove). The three-option control already ships
and needs no change.

**Is tie suppression hiding legitimate knowledge?** **Yes, measurably, in Policy D's
case.** `attack_range` has 19 distinct values and "both are 550" is a real fact about two
ranged champions; D deletes 2,333 such questions to reach 15.7%. The recommended hybrid
hides nothing: C asks the *same fact* at a rank where it discriminates, and the cap
defers a tie without removing it from the universe, so every tied comparison remains
reachable at some seed. **That is the central reason the recommendation is C + cap rather
than D.**

**Would reducing ties noticeably improve the experience, or is this low priority now?**
**Split, and the split is the finding.** For the median pair it is **low priority** — the
random-draw baseline is 10.6% at n=8 with 5.5% of slices at ≥3, and a player would
struggle to notice the difference. For the **tail it is high priority**: 426 pairs
(2.9%) run above a 30% tie rate, and on the 40 worst an 8-question slice carries three
or more ties 71.9% of the time. Since the recommended policy costs nothing measurable and
takes that 71.9% to 12.5% without touching the median pair's slice at all, it is worth
doing — but it should be scoped and reviewed as **a fix for the tail**, not as a
roster-wide quality problem. The two previous documents' 13% headline over-stated it by
~2.4 points, and this pass's own headline does too; §1.4 is the honest table.

---

## 7. Remaining Matchup blockers

1. **Tie policy** — measured and designed here; **recommendation made, nothing
   implemented.** *Open — owner decision on §5.*
2. **The comparative cost and level-stat families** — still `family_unmapped`, still
   404,023 candidates, still two live renderer branches with no content. *Open —
   family-contract workstream.*
3. **`base_magic_resist` as a comparison metric at all** — **NEW from this pass.** Ten
   roster values, 88.5% of champions on two of them, and a 2-point spread even when
   decisive. This is a content/family question, not a tie question, and no tie policy
   answers it. *Open — `quiz/family_contract.py` + CHAMPDATA.*
4. **Manaless mana regeneration** — 3,553 pairs (23.9%); 22 champions at `mp5 = 0`, and
   `8` is 22.5% of the roster, so this metric is both tie-prone and structurally wrong
   for those champions. *Open — documented, still deliberately not fixed.*
5. **The dual-form row split** — why 1,480 pairs are base-stat-only, which is also why
   the tie tail is base-stat-dense. *Open — CHAMPDATA.*
6. **The Lab coverage headline** still leads with `total_candidates`. *Open — small.*
7. **No fresh screenshot.** Not attempted; this was a measurement pass with no
   presentation change. The Phase 5 Matchup capture remains the reference and now
   predates four passes.
