# GR1 — Champion Slice composition v2 (`composition.lab_profile_gate_aware.v2`)

**CERTIFIED FOR THE GENERATOR LAB, COMMITTED, NOT PUSHED (2026-09-22). Internal only.** A second
certified profile composition policy now exists beside v1. Its **only** semantic change: among
full-budget feasible sets, it reaches one with better intra-Slice variety before one that repeats a
stat metric or an ability subject. v1 is kept and is byte-for-byte unchanged. Nothing a player can
reach moved: no Ranked wiring, no route, no `mastery_slice` mode, no persistence, no `mastery_state`
writer, no migration, no third family, no Full, no frontend. Checkpoint weighting, the Slice
profiles, Snapshot level-1 behaviour, family supply, the publication gate and all question wording
are untouched. **v2 is not the default anywhere.** A caller gets it only by naming its id.

| | SHA | Note |
|---|---|---|
| Backend base | `origin/master` **`b5c37f48`** | The brief named `ded63efb`; `origin/master` had moved one commit (`b5c37f48`, Hatefog item arbitration, 11 files, **zero `mastery/` overlap**). Did not move during the phase. |
| Backend commit | **`3f18a75f`** | One commit on `gr1/slice-composition-v2`, worktree `~/lcs-wt-gr1-v2`. **NOT PUSHED.** |
| Comparison base | `~/lcs-wt-gr1-v2-base` detached @ `b5c37f48` | Same symlinked read-only `lol_calc.db`. |
| Docs base | `origin/main` **`45a322d4`** | As named in the brief; did not move. |
| Docs commit | *(this commit — `git log`)* | Branch `gr1/slice-composition-v2-docs`, worktree `~/mogsy-wt-gr1-v2`. **NOT PUSHED.** |
| Frontend | **none** | |

**Files: 6 backend. 1 new, 5 modified, all inside `mastery/setup_state/` or `mastery/tests/`.**

```
mastery/setup_state/composition.py        +  v2 id, the variety criteria, variety_preference_order (pure),
                                             profile_preference_order_v2, compose_…_gate_aware_v2,
                                             compose_profile_questions (certified dispatch)
mastery/setup_state/window_lab.py         +  run_profile(composition_policy=, default v1);
                                             profile_policy_comparison (Lab diagnostic)
mastery/setup_state/slice_quality.py      ~  quality_order DELEGATES to the one shared function
mastery/setup_state/slice_experiment.py   +  compose_certified / run_certified (v1 / v2 records)
mastery/setup_state/errors.py             +  COMPOSITION_POLICY_UNKNOWN
mastery/tests/test_gr1_slice_composition_v2.py           NEW  50 tests
mastery/tests/test_gr1_slice_distribution_experiment.py  ~    footprint guard names this phase's files
```

`slice_profile.py`, `families.py`, `scenario.py`, `stat_scenario.py`, `progression.py`, `frozen.py`,
`__init__.py`, the gate and its preflight, `bank.py`, `mastery_slice.py`, `mastery_config.py` and the
Lab route are **unmoved** (the footprint test pins them).

---

## 1. Audit — v1, experimental `balanced`, the shared search (read at `b5c37f48` before any edit)

```
v1   = scope.state_preference  →  profile_preference_order(universe, state_order, seed)
                               →  _gate_aware_from_order(...)   ← the ONE shared search
balanced (experiment)
     = scope.state_preference  →  profile_preference_order(...)
                               →  slice_quality.quality_order(base, balanced)
                               →  compose_preferred_gate_aware(...) → _gate_aware_from_order(...)
```

| # | Question | Answer |
|---|---|---|
| 1 | **What v1 optimises** | Nothing set-level. It walks the profile's state preference round-robin (each state's queue: novel questions then inherited, each spread across `subject_ref` buckets in seeded order), then takes the **lexicographically earliest publishable** combination of that order. The seed chooses *which* feasible set; the order never touches *whether*. Nothing reads `answer_metric`, and every stat shares `subject_ref ""`. That is the root cause of the 23–53% repeat rate. |
| 2 | **What `balanced` changes** | Only the **order**: a greedy re-rank of v1's own walk under four 0/1 penalties in order (`new_state`, `new_metric`, `new_subject`, `new_family`), with ties going to v1's position. |
| 3 | **What it does NOT change** | Scope, eligible states, the state preference (strict checkpoints), presentation states (a question keeps the state v1's walk gave it), the search, its node budget, `maximum_feasible_count`, the limiting-verdict call, the progression-order output and the gate. |
| 4 | **Depends only on candidate metadata?** | Yes: `primary_ordinal`, `answer_metric`, `subject_ref`, `family_id`, plus the base position. It has no I/O, no family, metric or stat names, and no numbers. |
| 5 | **Can it change feasibility?** | No. `_search` is exhaustive over whatever order it gets. Pruning uses only `blocked_ids` / `exclusion_groups`, which are order-free, so a feasible `budget`-set is found in any permutation. The infeasible branch reports `maximum_feasible_count` from the same exhaustive descent, and its limiting codes are read from the verdict over `preferred[:budget]`, which **could** differ between orders. Measured: 0 differences (§4, §5). |
| 6 | **Does search-bound behaviour differ?** | In principle, yes. The number of verdicts spent before the first publishable leaf depends on the order, so under a tight `SEARCH_NODE_BUDGET` one order could exhaust where another would not. Measured: **identical `verdicts_evaluated` in all 13,840 cells** and 0 exhaustions under either policy (§5). |
| — | Final progression order | `(primary_ordinal, family_id or "", candidate_key)`, applied after the search and independent of the rank. |
| — | Publication preflight | `window_lab.gate_constraints(states, universe).verdict(ids)`: the same oracle for both policies, and the production `publish` still re-judges a rendered set. |

**Inconsistency found (recorded, not "fixed").** `balanced` is a **greedy order**, not a set-level
optimum. Section 7 shows the one place this matters (0.12% of feasible sets). The brief asked v2 to
follow the proven experimental ordering unless the audit found a reason not to. Because the effect is
tiny and fully characterised, v2 keeps the proven ordering exactly. Closing the gap would need a
set-level search, which is a v3 question.

---

## 2. v2 semantics — exactly

```
composition.lab_profile_gate_aware.v2
  = v1's profile walk
  → variety_preference_order(walk, VARIETY_CRITERIA)          ← the ONLY new step
  → _gate_aware_from_order(...)                               ← unchanged shared search
  → (presentation ordinal, family_id, candidate_key)          ← unchanged final order
```

`VARIETY_CRITERIA = ("new_state", "new_metric", "new_subject", "new_family")`. At each step the
greedy takes the entry that minimises, in order:

| # | Criterion | Penalised when | Brief's preference |
|---|---|---|---|
| 1 | `new_state` | its presentation state is already represented | broader desired state representation |
| 2 | `new_metric` | its `answer_metric` is already asked | fewer repeated metrics |
| 3 | `new_subject` | its **non-empty** `subject_ref` is already asked | fewer repeated subjects |
| 4 | `new_family` | every chosen question shares one family and this one is in it | family variety where otherwise comparable |
| 5 | v1's position | — | existing checkpoint/profile preference, then the deterministic seeded tie-break |

**What counts as "repeated":**

* **A. Repeated stat metric**: the same `answer_metric` twice (armor at L11 and armor at L12).
* **B. Repeated ability subject**: the same non-empty `subject_ref` twice (Ahri W at two ranks). For
  cooldowns the metric is per slot (`ability.W.cooldown.effective`), so B is also A.
* **C. Repeated family**: **never** penalised by itself. Health + armor + MR are three different
  metrics with an empty subject, so there is no repeat. `new_family` only lifts a second family
  while the set is still single-family. It is not a quota and never forces a split (Karma, who has no
  cooldown supply, still fills every profile with stats).

**Everything is soft.** No entry is removed, so if the only full-budget feasible set repeats, the
search still reaches it (§8). The ordering names no profile, champion, cooldown or stat.

### 2.1 One implementation of "balanced"

`composition.variety_preference_order` is the one implementation. `slice_quality.quality_order`
now **delegates** to it, and its `C_NEW_*` / `CRITERIA` constants are the composer's own. The
historical semantics are proved rather than assumed. The test suite carries `quality_order` exactly as
shipped in `ded63efb` and asserts that all nine experimental policies order identically over real
universes (4 champions × 5 profiles). A second test asserts that experimental `balanced` and v2 select
**the same questions** on 6 representatives × 5 profiles × 2 budgets, under their own distinct
policy ids.

### 2.2 Identity

* `COMPOSITION_POLICY_LAB_PROFILE_GATE_AWARE_V2 = "composition.lab_profile_gate_aware.v2"`.
* `PROFILE_COMPOSITION_POLICIES = (v1, v2)`. `compose_profile_questions(policy_id=…)` dispatches
  only these two and refuses anything else (`composition_policy_unknown`), including every
  `composition.lab_quality.*` id, the window gate-aware id and a hypothetical `.v3`.
* `MODULE_POLICY_IDS` (coverage, window gate-aware, v1, v2): `compose_preferred_gate_aware`
  refuses them all, so an experimental preference can never carry a certified identity.
* A v2 set records `policy_id = …v2`, so its `composition_key` differs from v1's even when the
  steps are identical.

---

## 3. v1 is unchanged

| Proof | Result |
|---|---|
| Roster: 173 champions × 5 profiles × b=3/4 × 8 seeds = **13,840** v1 records on base (`b5c37f48`, certified composer) vs branch (`compose_profile_questions(v1)`) | **0 mismatches**, every field |
| Pinned in the suite: v1 selections for 6 representatives × 5 profiles × b=3/4 × 2 seeds, plus two default `profile_diagnostic` views (cooldown-only and mixed) | hashes recorded on base, re-derived on the branch: equal |
| The experiment's `baseline` = v1, record for record | asserted |
| `run_profile` / `profile_diagnostic` default | still v1; `composition_policy` in the diagnostic is v1; key set unchanged |
| Serving dump (§12) | `cmp`-identical |

`compose_profile_questions_gate_aware` (v1) was not edited. `run_profile` now calls the dispatcher,
which calls v1's function unchanged.

## 4. Feasibility guarantee

* **Structural:** v2 hands `_gate_aware_from_order` a permutation of the same universe (asserted in
  the tests). The search is exhaustive within its budget, so feasibility is order-invariant (§1 row 5).
* **Exhaustive cross-check:** 6 representatives × all 5 profiles × b=3/4 × 8 seeds × {cooldown-only,
  mixed}, each compared with a brute-force enumeration of every combination through the gate's own
  verdict. **1,748 v1/v2 compositions, 0 mismatches**, 0 exhausted. The suite keeps a
  3-profile slice of this.
* **Roster:** v1 and v2 feasibility, `feasible_count`, `limiting_codes` and `supply_codes` are
  identical in **all 13,840 cells**. `search_exhausted` 0 / 0, and `verdicts_evaluated` identical per cell.
* **Synthetic:** when the gate refuses v2's preferred triple and the only publishable triple repeats
  a metric, v2 returns that triple. A truly infeasible budget reports the same maximum under both.

---

## 5. Roster-wide certification run

173 champions (164 rank-bearing + 9 LEVEL-only: elise, jayce, karma, nidalee, udyr, yuumi, dr-mundo,
nunu, renata), both families, 5 profiles × b=3/4 × seeds `gr1-v2-0…7`. **27,680 compositions**
(13,840 per policy), in 53 s on 8 processes. Raw JSONL stayed in the session scratchpad and is not
committed.

| profile | b | policy | feasible | repeated metric | repeated subject | adjacent same metric | mixed | all-cd | all-stat | states | span (levels) | v2 set = v1 set |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| snapshot | 3 | v1 | 1300/1384 | 0% | 0% | 0% | 76.8% | 16.8% | 6.3% | 1 | 0 | |
| snapshot | 3 | **v2** | 1300/1384 | 0% | 0% | 0% | **93.7%** | 0% | 6.3% | 1 | 0 | 1081 |
| snapshot | 4 | v1 | 1300/1384 | 0% | 0% | 0% | 91.9% | 1.8% | 6.3% | 1 | 0 | |
| snapshot | 4 | **v2** | 1300/1384 | 0% | 0% | 0% | 93.7% | 0% | 6.3% | 1 | 0 | 1277 |
| tight | 3 | v1 | 1384/1384 | **31.2%** | 15.4% | **19.7%** | 71.7% | 6.3% | 22.0% | 2.97 | 1.98 | |
| tight | 3 | **v2** | 1384/1384 | **0.6%** | 0.6% | **0%** | 92.5% | 0% | 7.5% | 2.98 | 1.98 | 819 |
| tight | 4 | v1 | 1384/1384 | **46.1%** | 24.1% | **30.2%** | 88.5% | 0.6% | 10.9% | 2.98 | 1.98 | |
| tight | 4 | **v2** | 1384/1384 | **0.6%** | 0.6% | **0%** | 93.5% | 0% | 6.5% | 2.98 | 1.98 | 636 |
| early_phase | 3 | v1 | 1384/1384 | 19.2% | 8.1% | 0.7% | 85.9% | 2.3% | 11.8% | 3.00 | 4.17 | |
| early_phase | 3 | **v2** | 1384/1384 | **0%** | 0% | 0% | 93.4% | 0% | 6.6% | 3.00 | 4.23 | 1048 |
| early_phase | 4 | v1 | 1384/1384 | 32.7% | 9.8% | 9.0% | 90.8% | 0% | 9.2% | 4.00 | 4.40 | |
| early_phase | 4 | **v2** | 1384/1384 | **0%** | 0% | 0% | 93.4% | 0% | 6.6% | 4.00 | 4.47 | 918 |
| wide | 3 | v1 | 1384/1384 | 31.5% | 20.7% | 0% | 84.4% | 4.5% | 11.1% | 3.00 | 9.01 | |
| wide | 3 | **v2** | 1384/1384 | **0%** | 0% | 0% | 94.1% | 0% | 5.9% | 3.00 | 8.40 | 902 |
| wide | 4 | v1 | 1384/1384 | **53.3%** | 31.6% | 0.1% | 88.7% | 0.9% | 10.4% | 4.00 | 9.09 | |
| wide | 4 | **v2** | 1384/1384 | **0%** | 0% | 0% | 94.1% | 0% | 5.9% | 4.00 | 8.66 | 631 |
| full_range_sample | 3 | v1 | 1384/1384 | 27.0% | 7.5% | 0% | 65.8% | 2.9% | 31.3% | 3.00 | 13.31 | |
| full_range_sample | 3 | **v2** | 1384/1384 | **0%** | 0% | 0% | 94.2% | 0% | 5.8% | 3.00 | 13.68 | 780 |
| full_range_sample | 4 | v1 | 1384/1384 | 38.2% | 8.6% | 0% | 85.4% | 0.6% | 14.0% | 4.00 | 15.94 | |
| full_range_sample | 4 | **v2** | 1384/1384 | **0%** | 0% | 0% | 94.2% | 0% | 5.8% | 4.00 | 15.28 | 808 |

Totals over the 11,072 multi-state feasible sets: a set with a repeated metric **34.9% → 0.1%**
(4,066 repeats → 16), a repeated subject 15.7% → 0.1%, adjacent same-metric 7.5% → **0%**, mixed
families 82.7% → 93.7%. The LEVEL arm (576 multi-state sets, stats only): repeated metric **50.3% →
0%**. v2 picked a different set from v1 in 4,772 of 13,672 feasible cells.

| Check (both policies) | v1 | v2 |
|---|---|---|
| feasible | 13,672 | 13,672 |
| `search_exhausted` | 0 | 0 |
| final gate verdict not publishable | 0 | 0 |
| progression order broken | 0 | 0 |
| total verdicts evaluated | 13,792 | 13,792 |
| deterministic regeneration (full sweep re-run, sorted JSONL `cmp`) | — | identical |

**Readings.**

* **Feasibility v2 == v1** in every cell. The 168 infeasible cells per policy are all **Snapshot anchored
  at level 1** (120 `semantic_supply_below_budget`; 48 also `no_candidate_in_state`), and they are
  unchanged.
* **Repetition falls materially everywhere it existed.** The residual 16 are all Tight and are
  explained in §7.
* **Coverage is preserved.** State count per set is equal or higher (asserted on representatives).
  Span moves by under 0.7 levels, down on Wide and Full b=4 and up on Early and Full b=3, because a
  different question can move a presentation state within its producers. The ~6% all-stat residual
  is supply: the 9 LEVEL-only champions and Aphelios have no cooldown question.
* **Side effect, not a goal:** median distinct state patterns over 8 seeds rise a little (Wide b=3
  2 → 4, Early b=3 2 → 3, Full 5 → 6). Checkpoint strength, not v2, remains the replayability lever.

## 6. Representative examples (seed `gr1-v2-N`, mixed families)

**A. v1 repeats, v2 picks a more varied full-budget set**

| champion | profile b seed | v1 | v2 |
|---|---|---|---|
| Ahri | full 3 s1 | L2:Q · L10:mana · L18:mana | L2:Q · L6:AD · L18:mana |
| Jarvan IV | tight 3 s2 | L14:Q · L15:MR · L16:MR | L14:Q · L15:AD · L16:MR |
| Jarvan IV | early 3 s0 | L2:Q · L4:Q · L6:MR | L1:E · L2:Q · L6:MR |
| Jarvan IV | full 4 s0 | L1:E · L7:armor · L13:AD · L18:armor | L1:E · L4:Q · L7:armor · L13:AD |
| Teemo | wide 4 s1 | L2:Q · L6:health · L8:health · L11:health | L2:Q · L4:mana · L9:armor · L11:health |
| Karma (LEVEL) | early 4 s1 | L2:AD · L4:AD · L5:AD · L6:health | L2:MR · L3:hp5 · L4:AD · L6:health |
| Karma (LEVEL) | full 3 s1 | L9:mana · L13:mana · L18:mp5 | L5:AD · L9:mana · L18:mp5 |
| Garen (manaless) | tight 3 s0 | L2:E · L3:E · L4:health | L2:Q · L3:E · L4:health |
| Garen (manaless) | wide 4 s2 | L2:MR · L6:R · L8:AD · L11:AD | L2:MR · L4:health · L6:R · L11:AD |
| Akali (energy) | tight 3 s0 | L3:E · L4:hp5 · L5:E | L3:Q · L4:hp5 · L5:E |
| Akali (energy) | full 4 s2 | L2:armor · L6:R · L10:armor · L18:MR | L2:armor · L6:R · L8:AD · L18:MR |

Garen and Akali never receive a mana question under either policy. Their stat supply is 5 metrics.

**B. Repetition is unavoidable, and v2 keeps the full-budget set.** Ahri, Tight b=4, cooldown family only,
seed 0: the scope's universe is **exactly four** questions, two of them R at different ranks. v1 and
v2 both return `L10:E · L10:R · L11:R · L12:Q` rather than underfilling (asserted). The same holds for
seeds 3, 4 and 6. In the synthetic test, the gate refuses every repeat-free triple and v2 returns the
repeating one.

**C. Snapshot: variety within one state.** A single state cannot repeat a metric (0% under both).
v2's gain there is a **family mix**: Jarvan IV L15 `E · Q · R` → `armor · E · R`, Akali L15
`E · Q · R` → `armor · E · R`, and Snapshot b=3 mixed sets 76.8% → 93.7%. No state diversity is
required or attempted. Level-1 Snapshots still refuse with the same structured
`semantic_supply_below_budget` under v2 (asserted for Ahri and Karma with a requested level-1 anchor).

## 7. The one known limit: greedy, not set-optimal (16 of 13,672 = 0.12%)

All 16 residual v2 repeats are **Tight anchored on levels 1–3**, for 8 champion-seed pairs (Bel'Veth ×2,
Bard, Mel, Seraphine, Skarner, Xayah, Zed) at both budgets. Level 1 offers exactly **one** question (E
at rank 1; the stat family refuses level 1). The greedy's first pick is v1's first entry, E at
**level 3**. Criterion 1 (`new_state`) then forces level 1's only question, **E again**.

A brute-force enumeration through the gate proves that in **every** one of the 16 a repeat-free
3-state set was publishable, e.g. Bel'Veth `L1:E · L2:AD · L3:armor`. So these are not "repetition
required" cases. They are a limit of a greedy ordering. The brief's ordering is **honoured on criterion
1** (all 3 states represented) and **missed on criterion 2** in those cells. The limit is pinned by
`test_the_greedy_limit_is_recorded_not_hidden`, so any future change to it is deliberate.

Closing it would take a set-level lexicographic search: prefer the best (states, repeats, family)
tier, then the lexicographically earliest feasible set in it. That changes the proven experimental
semantics and needs its own bound analysis, which makes it a **v3** candidate, not a v2 patch.

## 8. Snapshot and multi-state behaviour

* **Snapshot:** diversity within one state (distinct stats, distinct abilities, mixed families when
  both exist). State diversity is not required. Level-1 behaviour and its refusal are unchanged.
* **Tight / Early / Wide / Full:** progression coverage first (`new_state` outranks everything),
  then no repeated metric or subject. The "armor L10 · armor L11 · armor L12" shape (adjacent same
  metric) falls from 19.7% / 30.2% of Tight sets to **0**. When repetition is the only way to fill
  the budget, it is allowed and the Slice is not underfilled.

## 9. Presentation order

Selection changes which questions are chosen. The final order is still
`(presentation ordinal, family_id, candidate_key)`, asserted on every feasible roster record (0
violations). The suite also asserts a case where the v2 rank order differs from the final order, so
questions are not sorted by quality rank.

## 10. Checkpoint weighting stays v1-era

v2 uses `scope.state_preference`, the certified strict checkpoint spread (asserted for Early, Wide
and Full). `checkpoint_soft`, `spread_only` and the other Lab policies remain experimental in
`slice_quality.QUALITY_POLICIES` (9 policies, unchanged ids), and none is part of v2.

## 11. FrozenStateBundle

Roster sweep under v2: 173 champions × 5 profiles × b=3/4 × 2 seeds, mixed families. **3,460 runs,
3,420 feasible** (the 40 others are level-1 Snapshots with no bundle):

| Check | Failures |
|---|---|
| non-informational verification findings | 0 |
| `to_dict → JSON → from_dict → to_dict` exact | 0 |
| each included state = a presentation state of a selected step; each step bound there with the right `candidate_id` / `content_digest` / `family_id` / `answer_metric` | 0 |
| `derived_used` narrowing: exactly the selected stats' `.at_level`, no other `.at_level`, `ability_haste.total` iff a cooldown step is at that state | 0 |
| progression order | 0 |
| multi-family bundles | 3,195 of 3,420 |

The suite repeats these checks on four representatives and runs `assert_frozen_bundle` with
`sqlite3.connect` monkeypatched to raise (offline). `is_persisted: false`. There is no production
persistence writer.

## 12. Generator Lab diagnostic

`window_lab.profile_policy_comparison(conn, sequence, profile, seed=, anchor=, policies=(v1, v2),
families=…)` is backend JSON only, with no route. For each policy it returns: `composition_policy`,
`feasible`, `feasible_count`, `infeasibility`, `search_exhausted`, `verdicts_evaluated`, `selected[]`
(candidate id, family id, answer metric, subject, presentation ordinal and **level**),
`selected_presentation_levels`, `state_span`, `repetition` (repeated metric/subject counts and which,
adjacent same-metric pairs), `family_distribution`, `family_mix`, `final_publication_verdict` (the
gate's verdict asked again), and a bundle summary. At the top level it adds `same_selection` and
`same_feasibility`.

`run_profile` / `compose_profile` / `profile_diagnostic` accept `composition_policy=`, which
defaults to v1. `slice_experiment.run_certified(run, profile, seed=, composition_policy=)` emits the
experiment's record shape for either certified policy.

## 13. Current-serving invariance

A read-only probe run on base (`b5c37f48`) and branch against the same DB: **173 Mastery Knowledge
Banks** (full `to_dict`), **240 default v1 `profile_diagnostic` views** (6 champions × 5 profiles ×
b=3/4 × 2 seeds × {default cooldown-only, mixed}), **two rendered through the production `publish`**
(Karma Tight 4 mixed; Ahri Tight 3), and one `progression_diagnostic`. **Both dumps are 21,768,462
bytes, `cmp` IDENTICAL.**

| Claim | Held by |
|---|---|
| Champion Mastery / Practice / Matchup unchanged | no file outside `mastery/setup_state` + tests moved; bank dump identical |
| Ranked / current Slice unchanged | `mastery_slice.py`, `mastery_config.py` and the Lab route unmoved and naming no v2 symbol; `parse_mastery_slice_config` refuses `composition_policy` / v2; no tracked production module names `lab_profile_gate_aware` |
| Default diagnostics still v1 | pinned hashes; default `composition_policy` is v1; key set unchanged |
| No player state-aware mode, persistence, Full, migration or frontend | footprint test |
| Cooldown and stat wording unchanged | `scenario.py`, `stat_scenario.py` and `bank.py` unmoved |
| Composer purity | `composition.py` still names no family, metric, stat, profile or `slice_quality` (text test); the isolation guard passes |

## 14. Tests

`/Users/macmoney/League_Combat_Simulator/.venv/bin/python -m pytest … -p no:randomly`, with a read-only
`lol_calc.db` symlinked into both worktrees.

**New: `mastery/tests/test_gr1_slice_composition_v2.py`, 50 passed.** It covers: v1 exact invariance
(pinned selections and diagnostics, baseline == v1, default == v1); v2 identity and version (id, dispatch,
refusals, distinct composition key); determinism; synthetic repeated-metric and repeated-subject
preference; family repetition ≠ subject repetition; soft family mix with no forced split; repetition
kept when it is the only set; the variety order is a permutation keeping presentation states; Snapshot
diversity; multi-state diversity (Jarvan MR); v2 never repeats more than v1 on representatives
(sum > 50 → 0); unavoidable repetition on Ahri; the greedy limit pinned; exhaustive enumeration ==
v1 == v2 (both family sets); v1/v2 feasibility identity (6 representatives × 5 profiles × 2 budgets ×
4 seeds); the same maximum when infeasible; level-1 Snapshot refusal unchanged; final gate authority
and progression order; order is not the quality rank; production `publish` render; lying oracle;
FrozenStateBundle bindings, narrowing, round trip and offline checks; multi-family bundle; the comparison
diagnostic; default diagnostic shape; experimental historical equivalence (all 9 policies); balanced
== v2 selection; checkpoint_soft unchanged; certified state preference; composer / profile
isolation; Ranked and Lab route naming nothing; no production importer; two families; footprint.

**Regression arm (`mastery/tests`, both worktrees):**

```
mastery/tests   base   b5c37f48 (detached):   5 failed, 2683 passed, 14 skipped
                branch (pre-commit):          5 failed, 2733 passed, 14 skipped
failure SET identical by name, all pre-existing, none repaired:
  test_audit_db.py::test_pool_and_certified_counts / ::test_lux_q_cooldown_conflict_surfaced /
  ::test_json_roundtrips_and_schema; test_mastery_per_question_reveal.py::test_reveal_needs_no_new_persistence;
  test_phase4f_ranked_mastery_slice.py::test_format_for_creation_is_unaffected_by_this_module
counts reconcile: 2683 + 50 (new suite) = 2733.
after committing 3f18a75f: the four GR1 suites carrying committed-footprint guards
  (v2, experiment, profiles, stats): 256 passed.

Ranked / Mastery integration arm (the 12 files the stats phase used):
  base    3 failed / 330 passed   branch   2 failed / 331 passed
  stable failures identical: test_mastery_ranked_capsule::test_pinned_capsule_ids / _digests
  (pre-existing). The base's third, test_ranked_mastery_artifact_persistence::
  test_review_is_unchanged_after_the_canonical_data_moves, passes when re-run alone on base --
  the same flake the experiment phase recorded. No frontend test ran: no frontend file changed.
```

## 15. Unresolved product decisions (none taken here)

* **Checkpoint strength per profile** (strict vs `checkpoint_soft`). v2 deliberately keeps strict.
  The experiment's evidence (Wide b=3 median 2 → 15 state patterns under soft) is unchanged.
* **Level-1 Snapshot**: refuse / redraw (fixes 173/173) / permit level-1 stat questions / wait for a
  family with level-1 supply. v2 preserves the refusal.
* **The Ranked profile distribution and weights**, and whether Ranked should ever name v2. No
  distribution is registered.
* **Whether to close the greedy limit (§7)** with a set-level v3.
* Unchanged from earlier phases: budget per profile (evidence: Tight 3, Full 4), prompt-rank wording,
  Snapshot's tier, the 9 rank-bearing gaps, State Context UI, the bank's manaless mana-regen question.

## 16. Recommended next phase (a recommendation, NOT a decision)

**The checkpoint-strength decision for the broad profiles, measured over v2.** Run Early / Wide / Full
under v2 × {strict, soft} with the existing experiment machinery. No new code is needed, because the
experimental `balanced_soft` is already v2's criteria plus soft checkpoints. Then put the
replayability vs coverage numbers to the owner. The level-1 Snapshot rule is the other owner call that must precede
any Ranked distribution. Ranked wiring stays later.

**Rollback:** `git revert 3f18a75f`. Nothing is persisted, and there is no route, migration or
frontend change.
