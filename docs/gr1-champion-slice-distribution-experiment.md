# GR1 — Champion Slice profile distribution / quality experiment

**EXPERIMENT, INTEGRATED AND PUSHED (2026-09-21). Generator Lab / diagnostics only. `balanced` remains EXPERIMENTAL; certified profile composition remains `composition.lab_profile_gate_aware.v1`.** This phase asks
*"what kinds of 3–4 question Champion Slices should eventually appear inside Ranked?"* and answers
it with measurements, not a decision. Nothing a player can reach changed: no Ranked wiring, no
route, no `mastery_slice` mode, no persistence, no `mastery_state` writer, no migration, no third
family, no Full, no frontend. The certified profiles, the cooldown and stat families and both
prompts are untouched. **No distribution is registered anywhere** — candidate weights exist only
as arguments in the analysis script and as rows in this document.

| | SHA | Note |
|---|---|---|
| Backend base | `origin/master` **`a9085292`** | Fast-forward of the brief's `1090633f` (one items-only commit, zero `mastery/` overlap). Did not move during the phase. |
| Backend commit | **`ded63efb`** on `origin/master` | Authored as `4e987b09`; rebased clean onto `7130e8c1` (one items/combat commit, zero `mastery/` overlap) and pushed. See §19. |
| Comparison base | `~/lcs-wt-gr1-dist-base` detached @ `a9085292` | Same symlinked read-only `lol_calc.db`. |
| Docs base | `origin/main` **`a9a7b45a`** | Fast-forward of the brief's `8d166bcd` (one FUNNEL commit, no doc overlap). |
| Docs commit | *(this commit — `git log`)* | Branch `gr1/slice-distribution-docs`, worktree `~/mogsy-wt-gr1-dist`. Pushed to `origin/main`. |
| Frontend | **none** | |

**Files: 6 — 3 new, 3 modified, all inside `mastery/setup_state/` or `mastery/tests/`.**

```
mastery/setup_state/slice_quality.py                   NEW  contract half (pure): measures + 9 Lab policies
mastery/setup_state/slice_experiment.py                NEW  consumer: runner, seed cells, distribution simulation
mastery/tests/test_gr1_slice_distribution_experiment.py NEW 34 tests
mastery/setup_state/composition.py                     +65  compose_preferred_gate_aware (the SAME search, caller's order)
mastery/setup_state/errors.py                          +11  two structural codes
mastery/tests/test_setup_state_isolation.py            +9   the two modules declared (contract / consumer)
```

`slice_profile.py`, `window_lab.py`, `families.py`, `scenario.py`, `stat_scenario.py`,
`progression.py`, the gate, its preflight, `bank.py`, `mastery_slice.py`, `mastery_config.py`, the
Lab route and every `quiz/` file are **unmoved** (footprint test).

---

## 1. Audit — what currently decides a composed Slice

Read at `a9085292` before any edit.

| # | Question | What decides it today |
|---|---|---|
| 1 | **Which states are preferred** | `slice_profile.state_preference`. `single_state`: the one state. `dense_local` (Tight): the anchor (seeded or requested), then neighbours nearest-first; ties → higher checkpoint priority → seed. `checkpoint_spread` (Early / Wide / Full): the highest-priority state first (seed among ties), then repeatedly `argmax(distance to nearest chosen + priority)`, seed among ties. **Priority is ADDED to distance**, so a state with one signal is worth one extra level of distance. |
| — | Checkpoint priority | `slice_profile.checkpoints`: count of signals on the transition INTO a state — a non-routine axis change, a key activated (a slot's first point), a key removed. On the rank-bearing run the only signals are a slot's FIRST point (a few early levels and the ultimate's unlock, e.g. Ahri 2 / 6 / 13 in the harness order); the scope's first state is a boundary with none; a pure LEVEL run has **none** anywhere (every priority 0). |
| 2 | **Which semantic questions are preferred** | `composition.profile_preference_order`: for each state in preference order, a queue of its *novel* questions then *inherited* ones, each built by `_state_queue`; round-robin across states; each question listed **once**, at the first preferred state that reaches it. |
| 3 | **How subjects spread** | Only inside one state's queue: `_state_queue` buckets by `subject_ref` and interleaves buckets in seeded order. **No memory across states.** Every stat question has `subject_ref ""`, so all seven stats are ONE bucket beside Q / W / E / R. |
| 4 | **How families mix** | No family rule anywhere. Mixing is a side effect of subject bucketing (one stat bucket competing with up to four ability buckets). |
| 5 | **How metrics repeat** | Nothing reads `answer_metric`. The same metric at a different state is a different `candidate_id` and nothing stops it; the gate forbids only a repeated **effective question**. |
| 6 | **How the seed affects a valid selection** | Anchor (Snapshot / Tight), spread tie-breaks, bucket order and within-bucket order. The gate-aware search then takes the lexicographically earliest publishable combination, so the seed chooses *which* feasible set, never feasibility. |
| 7 | **How progression order is restored** | `(presentation_ordinal, family_id, candidate_key)`, independent of the seed. `presentation_ordinal` is set when the walk lists a shared question at a later producer. |
| — | Publication preflight | `publication_constraints(...).verdict(ids)` is the authority (blocked candidates, exclusion groups, distinct effective question, the synthesised recipe). Supply shortfall is reported as `semantic_supply_below_budget` beside the gate's codes. |

---

## 2. Three independent axes

The experiment varies them separately and never bakes a combination:

* **A. Scope profile** — the five certified profiles, unchanged.
* **B. Question budget** — 3 and 4, always as separate cells.
* **C. Composition preference** — nine declared Lab policies (§5), `baseline` = the certified
  composition.

---

## 3. Quality dimensions (no overall score)

`slice_quality.measure_selection(steps, eligible_ordinals=, axis_of=)` returns four separate
groups; `replayability(records)` a fifth. Nothing combines them.

| Group | Fields |
|---|---|
| **State coverage** | eligible state count; selected state count; selected ordinals and **levels**; state span; eligible span; normalized scope coverage (`None` for a one-state scope) |
| **Question variety** | family count / distribution / mix (`mixed` or `only:<family>`); distinct & repeated **metric** count (+ which); distinct & repeated **subject** count (+ which; an empty subject is not a subject) |
| **Progression** | contiguous transitions represented; gaps; `is_clustered`; `adjacent_same_metric_pairs` (the same metric at neighbouring states — the "health regen at 11, 12, 13" shape) |
| **Replayability** (across seeds) | unique question sets; unique presentation-state patterns; the most common pattern and its share |
| **Publication** (per record) | feasible / `feasible_count`; limiting and supply codes; effective-question collisions; `search_exhausted`; `final_verdict_publishable` (the gate's verdict asked again); `progression_order_ok` |

**Metric vs subject under the current families.** For cooldowns the metric is per slot
(`ability.W.cooldown.effective`), so a repeated metric *is* a repeated ability subject. For stats
the subject is empty and the metric is the stat. So "repeated subject" counts only abilities and
"repeated metric" counts both — the two measures differ only on stat repeats.

---

## 4. Method

* **Source modes.** The trusted arm used by every prior roster sweep: the rank-bearing run
  (level + the progression suite's stated harness skill order) for **164** champions, the LEVEL run
  for the **9** rank-gap champions (elise, jayce, karma, nidalee, udyr, yuumi, dr-mundo, nunu,
  renata) = **173**. A second, LEVEL-only arm (all 173) isolates the checkpoint effect.
* **Families:** cooldown + stat (`ALL_FAMILIES`). The manaless mana-regen bug is not touched and does
  not enter: the state-aware stat family already refuses mana / mana-regen for the 28 manaless
  champions.
* **Cells:** 173 champions × 5 profiles × budgets 3 and 4 × 9 policies × **24 seeds**
  (`gr1-dist-0` … `gr1-dist-23`) = **373,680** compositions on the trusted arm; **12 seeds** on the
  LEVEL arm (186,840). Plus every Snapshot anchor (L1–L18) × budgets 3/4 per champion.
* **Reuse.** A run's states are generated once through `window_lab.generate_over_window`; a scope's
  states are exactly that subset (nodes resolve independently). The universe, the gate oracle and
  the search are the existing ones. **The `baseline` record equals `window_lab.run_profile`
  question-for-question** (asserted, 3 champions × 5 profiles × 2 budgets × 3 seeds; 0/60
  mismatches in the pre-check).
* Raw output (~0.8 GB JSONL) stayed in the session scratchpad and is **not committed**.

---

## 5. Lab-only preference policies

A policy = a **state mode** + an **ordered tuple of soft criteria**. `quality_order` re-ranks the
profile's own question preference greedily — at each step the entry minimising one 0/1 penalty per
criterion, in order, then its position in the profile's order. Presentation states are the
profile walk's own.

| Criterion | Penalised when |
|---|---|
| `new_state` | the question's presentation state is already represented |
| `new_metric` | its `answer_metric` is already asked |
| `new_subject` | its non-empty `subject_ref` is already asked |
| `new_family` | every chosen question shares one family and this one is in it (never forces a split) |

| State mode | Behaviour (checkpoint_spread profiles only; others unchanged) |
|---|---|
| `checkpoint_strict` | the certified score (distance + priority) |
| `checkpoint_soft` | seed chooses among states within **1** of the best score; first state among priority ≥ top − 1 |
| `spread_only` | priorities zeroed → plain farthest-point from a seeded start |

| Policy id (`composition.lab_quality.<name>.v1`) | State mode | Criteria |
|---|---|---|
| `baseline` | strict | — (**is** the certified composition; reports the certified policy id) |
| `metric_diverse` | strict | new_state, new_metric |
| `subject_diverse` | strict | new_state, new_subject |
| `family_variety` | strict | new_state, new_family |
| `balanced` | strict | new_state, new_metric, new_subject, new_family |
| `checkpoint_soft` | soft | — |
| `spread_only` | spread_only | — |
| `balanced_soft` | soft | balanced criteria |
| `balanced_spread` | spread_only | balanced criteria |

### 5.1 Why a policy cannot cause a false infeasibility

```
candidate universe  →  hard feasibility: the existing exhaustive gate-aware search
                    →  the lexicographically earliest PUBLISHABLE set in THIS order
                    →  final publication validation (the gate's verdict, again)
```

`composition.compose_preferred_gate_aware` accepts only a **permutation** of the universe
(`preference_not_a_permutation` otherwise) and hands it to the same `_gate_aware_from_order` every
gate-aware policy uses. That search is exhaustive over the order it is given within
`SEARCH_NODE_BUDGET`, so reordering changes *which* feasible set is found, never *whether*. It also
refuses the three certified policy ids, so an experimental set can never carry a certified identity.

**Proof, both ways:**

* **Synthetic:** a universe whose policy-preferred triple the (stub) gate refuses, and whose only
  publishable triple repeats a metric → the policy returns that triple, not "no set"; a truly
  infeasible budget reports the same `maximum_feasible_count` under the policy and the baseline.
* **Roster:** across all 373,680 trusted-arm compositions, every policy's feasibility equals the
  baseline's in every cell (the `feasible` column is identical across all nine policies),
  `search_exhausted` = **0**, `final_verdict_publishable` false = **0**, progression order broken =
  **0**.

---

## 6. Baseline (certified composer) — trusted arm, 173 champions × 24 seeds

4,152 compositions per row.

| profile | b | feasible | mixed | all-cd | all-stat | **repeated metric** | repeated subject | **adjacent same metric** | states | span (levels) | norm. coverage | clustered | unique state patterns (median / 24) | top-pattern share |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| snapshot | 3 | 94.7% | 76% | 18% | 7% | 0% | 0% | 0% | 1 | 0 | — | — | 13 | 17% |
| snapshot | 4 | 94.7% | 90% | 4% | 7% | 0% | 0% | 0% | 1 | 0 | — | — | 13 | 17% |
| tight | 3 | 100% | 70% | 11% | 19% | **29.7%** | 16.5% | **19.6%** | 2.97 | 1.97 | 0.99 | 100% | 13 | 17% |
| tight | 4 | 100% | 88% | 2% | 10% | **46.0%** | 26.7% | **31.4%** | 2.98 | 1.98 | 0.99 | 100% | 13 | 17% |
| early_phase | 3 | 100% | 69% | 15% | 16% | 23.4% | 13.5% | 0.7% | 3.0 | 4.17 | 0.83 | 1% | **4** | **74%** |
| early_phase | 4 | 100% | 81% | 8% | 12% | 36.0% | 16.0% | 7.9% | 4.0 | 4.40 | 0.88 | 2% | 4 | 45% |
| wide | 3 | 100% | 71% | 14% | 15% | 34.5% | 24.1% | 0% | 3.0 | 9.00 | 0.90 | 0% | **2** | **72%** |
| wide | 4 | 100% | 83% | 4% | 13% | **52.5%** | 30.8% | 0% | 4.0 | 9.10 | 0.91 | 0% | 7 | 33% |
| full_range_sample | 3 | 100% | 66% | 10% | 24% | 27.7% | 12.5% | 0% | 3.0 | 13.23 | 0.78 | 0% | 8 | 33% |
| full_range_sample | 4 | 100% | 81% | 5% | 14% | 42.0% | 17.8% | 0% | 4.0 | 15.95 | 0.94 | 0% | 7 | 32% |

Every Snapshot underfill (222 per budget) is a level-1 anchor (§12). No other cell underfills.
Unique **question** sets are high everywhere (median 20–24 of 24) — seeds vary *which* questions
even where they barely vary *which states*.

---

## 7. Repetition findings

* **The composer repeats metrics often and near-identical adjacent questions regularly.** A
  repeated metric appears in 23–35% of b=3 and 36–53% of b=4 multi-state Slices. Tight is the worst
  for the "health regen at 11 / 12 / 13" shape: **one in five** Tight b=3 and **one in three** Tight
  b=4 sets ask the same metric at neighbouring levels.
* **Root cause is structural, not data:** subject spread has no memory across states, and nothing
  reads the metric (§1 rows 3–5). Stats share one subject bucket, so stat-heavy supply repeats most.
* **Snapshot never repeats** — one state holds each metric at most once.
* **All-one-family sets are common under baseline:** 30–34% at b=3 on the multi-state profiles.
* **LEVEL arm (stats only, no cooldowns):** worse — repeated metric 37–43% at b=3, **60–67%** at
  b=4; Tight adjacent same-metric 28% / 45%.
* Examples (seed `gr1-dist-0`): Jarvan IV Tight b=3 `L5:E · L6:R · L7:E`; Ahri Full b=3
  `L6:R · L13:W · L18:W`; Garen Tight b=3 `L1:E · L2:AD · L3:E`; Karma Full b=4
  `L5:MR · L9:mp5 · L14:mp5 · L18:health`.

**Evidence for the brief's four options** (allowed / soft-penalised / capped / forbidden): a
*soft* penalty (§8) removes ~99% of repeats with **zero** feasibility cost and no coverage cost.
The residual 0.2–0.7% are cases where every alternative is worse on an earlier criterion
(Tight, 3 states, the new-state criterion outranks metric). The data therefore supports **soft
penalty**; a hard cap or prohibition would buy almost nothing more and would be a new gate-like
rule. Not decided here.

---

## 8. Preference-policy results (trusted arm)

Feasibility is identical to baseline in every cell (§5.1), so only quality moves.

| profile | b | policy | repeated metric | adjacent same metric | mixed | all-cd | all-stat | span | unique patterns | top share |
|---|---|---|---|---|---|---|---|---|---|---|
| tight | 3 | baseline | 29.7% | 19.6% | 70% | 11% | 19% | 1.97 | 13 | 17% |
| tight | 3 | metric_diverse | 1.1% | 0% | 80% | 5% | 15% | 1.98 | 13 | 17% |
| tight | 3 | **balanced** | **0.7%** | **0%** | **93%** | 0% | 7% | 1.98 | 13 | 17% |
| tight | 4 | baseline | 46.0% | 31.4% | 88% | 2% | 10% | 1.98 | 13 | 17% |
| tight | 4 | **balanced** | **0.7%** | **0%** | 94% | 0% | 6% | 1.98 | 13 | 17% |
| early_phase | 3 | baseline | 23.4% | 0.7% | 69% | 15% | 16% | 4.17 | 4 | 74% |
| early_phase | 3 | balanced | 0% | 0% | 94% | 0% | 6% | 4.21 | 6 | 52% |
| early_phase | 3 | checkpoint_soft | 22.2% | 3.1% | 68% | 16% | 15% | 4.15 | 10 | 22% |
| early_phase | 3 | **balanced_soft** | 0% | 0% | 94% | 0% | 6% | 4.07 | **11** | **22%** |
| wide | 3 | baseline | 34.5% | 0% | 71% | 14% | 15% | 9.00 | 2 | 72% |
| wide | 3 | balanced | 0% | 0% | 94% | 0% | 6% | 8.36 | 9 | 43% |
| wide | 3 | **balanced_soft** | 0% | 0% | 94% | 0% | 6% | 7.79 | **19** | **13%** |
| wide | 4 | baseline | 52.5% | 0% | 83% | 4% | 13% | 9.10 | 7 | 33% |
| wide | 4 | balanced_soft | 0% | 0% | 94% | 0% | 6% | 8.32 | 22 | 9% |
| full_range_sample | 3 | baseline | 27.7% | 0% | 66% | 10% | 24% | 13.23 | 8 | 33% |
| full_range_sample | 3 | **balanced_soft** | 0% | 0% | 94% | 0% | 6% | 13.68 | **22** | **9%** |
| full_range_sample | 4 | baseline | 42.0% | 0% | 81% | 5% | 14% | 15.95 | 7 | 32% |
| full_range_sample | 4 | balanced_soft | 0% | 0% | 94% | 0% | 6% | 14.60 | 23 | 8% |

* **`balanced` is the clear quality win** with no measured cost: repeats ~0, near-identical
  adjacent questions 0, mixed families 66–88% → 93–94%. The remaining ~6% all-stat is **supply**:
  the 9 LEVEL-only champions and Aphelios have no cooldown question at all. It never forced a split
  (`new_family` only ranks).
* `subject_diverse` alone removes ability repeats but leaves stat repeats (10–26%); `family_variety`
  alone mixes families but leaves 11–51% metric repeats. **Metric is the dimension that matters.**
* Balanced raises replayability a little by itself (question choice moves presentation states), but
  the big replayability lever is the **state mode** (§10).

Representative before/after (seed `gr1-dist-0`, balanced):

| champion | profile b | baseline | balanced |
|---|---|---|---|
| Jarvan IV | tight 3 | L5:E · L6:R · L7:E | L5:MR · L6:R · L7:E |
| Jarvan IV | early 3 | L1:E · L3:E · L6:R | L1:E · L2:mp5 · L6:R |
| Jarvan IV | full 3 | L1:E · L7:E · L13:W | L1:E · L13:W · L18:health |
| Ahri | full 3 | L6:R · L13:W · L18:W | L2:AD · L6:R · L18:W |
| Garen (manaless) | tight 3 | L1:E · L2:AD · L3:E | L1:E · L2:AD · L3:MR |
| Karma (LEVEL) | early 3 | L2:AD · L4:mana · L6:AD | L2:AD · L3:hp5 · L4:mana |
| Karma (LEVEL) | full 4 | L5:MR · L9:mp5 · L14:mp5 · L18:health | L5:MR · L9:mp5 · L11:mana · L18:health |

---

## 9. Profile distinctness

Selected-level frequency (baseline, trusted arm, 4,152 draws per row):

| profile b=3 | Where it lands |
|---|---|
| snapshot | uniform over L2–L18 (205–271 each); L1 always underfills |
| tight | every 3-level window; L16–18 over-represented (10% — anchors 17 and 18 both clamp to it) |
| early_phase | L2 (83%), L4 (83%), L6 (99%); L3 11%, L5 3%. **Top pattern [2,4,6] = 74%** |
| wide | L6 (96%), L11 (99%), L2 (71%) / L1 (21%); L3–L5, L7–L10 each < 3%. **Top [2,6,11] = 71%** |
| full_range_sample | L18 (73%), L13 (49%), L2 (47%), L6 (45%), L10 (31%); top [2,10,18] = 30% |

* **Tight vs Early Phase — distinct.** Tight: span ≈ 2 levels, 100% clustered, anywhere in 1–18,
  and it is the only profile with near-identical-adjacent risk (20–31% baseline). Early: span ≈ 4.2
  of 5, almost never clustered, always inside 1–6. Overlap is limited to Tight anchored in 1–6
  (~1/3 of draws), which is still clustered.
* **Wide vs Full Range — distinct in coverage, but Wide under strict checkpoints is "Early + L11".**
  Wide b=3 selects L6 and L11 in ~97% of draws and L1/L2 in 92%; it shares two of its three levels
  with Early Phase most of the time. Full spans 13–16 levels vs Wide's 9 and reaches L13–18, which
  nothing else does. Under `checkpoint_soft` Wide's middle states (L3–L10) open up (unique patterns
  2 → 15) and it stops looking like Early + 1.
* **LEVEL arm** (no checkpoint signals): Early spreads over [2,4,6] 27%, [3,4,6] 22%, [3,5,6] 18%;
  Wide over [5,8,11] / [4,7,11] / [4,8,11] (~13% each) — the concentration in the trusted arm is
  entirely checkpoint priority.

---

## 10. Checkpoint vs replayability

Median unique presentation-state patterns over 24 seeds (share of the most common pattern):

| profile | b | checkpoint_strict | checkpoint_soft | spread_only |
|---|---|---|---|---|
| early_phase | 3 | 4 (74%) | **10 (22%)** | 4 (39%) |
| early_phase | 4 | 4 (45%) | 10 (24%) | 8 (28%) |
| wide | 3 | **2 (72%)** | **15 (17%)** | 11 (26%) |
| wide | 4 | 7 (33%) | 21 (9%) | 13 (20%) |
| full_range_sample | 3 | 8 (33%) | 20 (11%) | 13 (17%) |
| full_range_sample | 4 | 7 (32%) | 21 (9%) | 16 (15%) |

* **Quantified: strict checkpoint priority is dominant.** Wide b=3 gives a median of **2** state
  patterns in 24 seeds, and Early b=3 lands on its top pattern **74%** of the time.
* **`checkpoint_soft` restores replayability without abandoning checkpoints**: 2.5–7.5× more patterns;
  the top pattern falls to 9–24%. Coverage cost is small: Wide b=3 span 9.0 → 8.1 levels (norm.
  0.90 → 0.81); Full b=3 span actually *rises* (13.2 → 14.1).
* **`spread_only` does not help Early Phase** (4 → 4 at b=3): farthest-point over six states is
  itself nearly deterministic (the endpoints win). It helps Wide/Full, less than soft.
* **LEVEL arm confirms the mechanism:** with every priority 0, `spread_only` ≡ `checkpoint_strict`
  exactly, and strict already yields 5–10 patterns.
* The certified profiles were **not** changed. Soft / spread exist only as experimental policy ids.

---

## 11. Budget 3 vs 4

| Question | Evidence |
|---|---|
| Does 4 substantially improve coverage? | **Broad profiles, yes:** +1 state each; Full span 13.2 → 16.0 levels (norm. 0.78 → 0.94), Early 4.2 → 4.4, Wide 9.0 → 9.1. **Tight, no:** its scope is 3 states, so the 4th question must share one (states 2.97 → 2.98). |
| Does 4 increase repetition too much? | **Under baseline, yes** — +12 to +18 points of repeated metric in every multi-state profile (Wide 35% → 53%, Tight 30% → 46%, Tight adjacent 20% → 31%). **Under `balanced`, no** — ≤ 0.7% at both budgets. |
| Is Snapshot worse at 4? | **Not on any measured dimension.** Repetition is 0% at both (one state cannot repeat a metric); feasibility is identical (only level 1 underfills, at both); family mix improves (76% → 90% mixed). What 4 does cost is 4 questions about one moment — a pacing judgement, not a measured defect. |
| Is 3 preferable for Ranked speed? | 25% fewer questions; not measurable here. |
| Natural fit | **Tight fits 3** (one question per state; 4 forces a shared state). **Full Range fits 4** (start / checkpoint / mid / end; biggest coverage gain). Early / Wide: 4 improves coverage slightly and is only safe from repetition with a metric-aware policy. Snapshot: neutral on the measures. |

No budget decision is taken.

---

## 12. Level 1 and Snapshot (measured; rule unchanged)

* **How often Snapshot selects level 1:** 5.35% of draws (222 of 4,152 per budget ≈ 1/18).
* **How often that underfills:** **every time** — and **every** Snapshot underfill is a level-1
  anchor (222/222 at b=3 and at b=4; 0 underfills at L2–L18).
* **Supply at level 1:** the stat family refuses L1 (`level_redundant_with_base`, unchanged). The
  cooldown family has one learned ability: **143** champions have exactly 1 semantic question at L1,
  **30** have 0 (the 9 LEVEL-only champions, plus 21 rank-arm champions whose level-1 state yields no publishable question — cause not investigated here).
  LEVEL arm: 0 for all 173. So level-1 Snapshot has **not** enough non-stat supply for 3 or 4.
* **Would a redraw solve it?** **Yes, 173/173 at both budgets** — every other anchor (L2–L18)
  composes for every champion.
* Tight at `[1,2,3]` is always feasible (L2/L3 supply); Early/Wide/Full select L1 legitimately
  when it carries a checkpoint (Early b=4: 42% of draws).

Options for the owner, unranked: refuse L1 Snapshots; redraw the anchor (evidence: always works);
permit level-1 stat questions (base-stat wording question); wait for a family with L1 supply.

---

## 13. Candidate Ranked distributions (simulation only — none registered)

20,000 deterministic module draws per row: champion uniform over 173, profile by weight, seed record
uniform over its 24. A = Snapshot 20 / Tight 30 / Early 30 / Wide 15 / Full 5; B = 10 / 25 / 40 /
20 / 5; C = even; **D** (added from the evidence: less Snapshot, more Full) = 5 / 35 / 25 / 20 / 15.

| dist | policy | b | feasible | span (levels) | states | mixed | repeated metric | adjacent same metric |
|---|---|---|---|---|---|---|---|---|
| A | baseline | 3 | 98.9% | 3.91 | 2.61 | 71% | 23.6% | 6.4% |
| A | baseline | 4 | 98.9% | 4.14 | 3.12 | 85% | 35.6% | 12.3% |
| A | balanced | 3 / 4 | 98.9% | 3.84 / 4.04 | 2.62 / 3.12 | 93% / 94% | 0.2% | 0% |
| B | baseline | 3 | 99.5% | 4.63 | 2.80 | 70% | 25.1% | 5.3% |
| B | baseline | 4 | 99.5% | 4.87 | 3.46 | 84% | 38.6% | 11.2% |
| B | balanced | 3 / 4 | 99.5% | 4.54 / 4.78 | 2.81 / 3.46 | 93% / 94% | 0.2% | 0% |
| C | baseline | 3 | 98.9% | 5.73 | 2.62 | 70% | 23.3% | 4.3% |
| C | baseline | 4 | 98.9% | 6.34 | 3.23 | 84% | 35.7% | 8.0% |
| C | balanced | 3 / 4 | 98.9% | 5.67 / 6.11 | 2.62 / 3.23 | 93% / 94% | 0.2% | 0% |
| D | baseline | 3 | 99.7% | 5.58 | 2.90 | 70% | 27.5% | 6.9% |
| D | baseline | 4 | 99.7% | 6.07 | 3.50 | 84% | 42.4% | 12.9% |
| D | balanced | 3 / 4 | 99.7% | 5.52 / 5.89 | 2.90 / 3.51 | 93% / 94% | 0.3% | 0% |

(`balanced_soft` matches `balanced` on repetition and mix, with span 0.1–0.3 levels lower and more
distinct question sets.)

**Readings.**

* **Every distribution is ≥ 98.9% feasible, and all of the shortfall is Snapshot-at-level-1**
  (≈ Snapshot weight × 5.35%). A redraw rule would make every one 100%.
* **The composition policy moves quality far more than the distribution does.** Changing the mix
  A → D moves repeated-metric by ~4–7 points; changing baseline → balanced moves it by 23–42 points.
* **The distribution mostly buys breadth:** mean span 3.9 (A) → 4.6 (B) → 5.6–5.7 (C / D) levels at
  b=3. Snapshot-heavy mixes are shortest in span and most exposed to the level-1 underfill.
* No winner is selected.

---

## 14. Lab diagnostic (backend only, no route)

`slice_experiment.quality_diagnostic(conn, sequence, profile, seed=, policy=, seeds=)` →
JSON-serialisable: the quality policy; profile; budget; seed; eligible ordinals **and levels**;
anchor level; state preference used; semantic supply by family; selected steps (presentation
ordinal, level, family, metric, subject); every quality group (§3); limiting / supply codes;
effective-question collisions; `search_exhausted`; `final_verdict_publishable`;
`progression_order_ok`; and replayability across `seeds`. `seed_cell` and `simulate_distribution`
are the building blocks the roster experiment used; weights are always the caller's argument.

---

## 15. Invariance

| Claim | Held by |
|---|---|
| Current Champion Mastery unchanged | 173 Knowledge Banks (every candidate `to_dict`, every skip) dumped on base and branch |
| Current Lab profile / window diagnostics unchanged | 5 champions × 5 profiles × b=3/4 × {cooldown-only, mixed} + Karma LEVEL × 5, **one Tight rendered through production `publish`** — same dump |
| — | **Both dumps 19,886,611 bytes, `cmp` IDENTICAL** |
| Practice / Matchup / Ranked / current Slice unchanged | no file outside the package and tests changed; `mastery_slice.py`, `mastery_config.py`, the Lab route name nothing new; `parse_mastery_slice_config` refuses `balanced`, `quality_policy`, `slice_profile`, `profile_distribution` |
| Certified profiles unchanged | `slice_profile.py` unmoved; scope kind / sampling / anchor / version asserted for all five |
| Progression source unchanged | `progression.py` unmoved |
| Cooldown and stat wording unchanged | `scenario.py`, `stat_scenario.py`, `bank.py` unmoved |
| No third family | `ALL_FAMILIES` = (combat_cooldown, champion_stat_level); default still cooldown-only |
| No persistence / Full / frontend / migration | footprint test; the experiment module names no persistence symbol and no profile name; no `.sql` |
| Contract purity | `slice_quality.py` passes every contract-half guard (stdlib + hashing + package only, no I/O, no game-rule number) and names no family, metric, stat or serving surface |

## 16. Tests

`/Users/macmoney/League_Combat_Simulator/.venv/bin/python -m pytest … -p no:randomly`, read-only
`lol_calc.db` symlinked into both worktrees.

**New: `mastery/tests/test_gr1_slice_distribution_experiment.py` — 34 passed.** Measure correctness
(repeated metric / subject counts, family distribution and mix, state span, normalized coverage,
clustering, adjacent same-metric pairs); replayability counting; policy validation and ids distinct
from certified ones; empty criteria = the base order; metric-diverse and family-variety ordering;
**a gate-refused preferred set still finds the feasible one**; the same maximum when truly
infeasible; the permutation guard; **no policy changes feasibility** — 6 representatives × 5
profiles × 2 budgets × 4 seeds × 9 policies, each set re-judged by the gate, in progression order,
never exhausted; **baseline = certified `run_profile`**; state modes vary only checkpoint-spread
profiles; softer checkpoints raise replayability; **a balanced set renders through production
`publish`**; a lying oracle's set is re-judged by the real verdict; metric-diverse never repeats more
than baseline (Karma); determinism of records, diagnostic and simulation; isolation, Ranked config
refusal, certified-profile invariance, two families, footprint.

**Regression arm — `mastery/tests`, both worktrees:**

```
base   a9085292 (detached):   5 failed, 2641 passed, 14 skipped
branch (pre-commit):          5 failed, 2683 passed, 14 skipped
failure SET identical by name, all pre-existing:
  test_audit_db.py::test_pool_and_certified_counts / ::test_lux_q_cooldown_conflict_surfaced /
  ::test_json_roundtrips_and_schema; test_mastery_per_question_reveal.py::test_reveal_needs_no_new_persistence;
  test_phase4f_ranked_mastery_slice.py::test_format_for_creation_is_unaffected_by_this_module
```

Counts reconcile: 2641 + 34 (new suite) + 8 (isolation cases for the two new modules) = **2683**.
After committing `4e987b09`, the committed-footprint guards of this and the two previous GR1
suites run and pass (four GR1 suites: 328 passed).

**Ranked / Mastery integration arm** (the 12 files the stats phase used): base **2 failed / 331
passed**; branch **2 failed / 331 passed**, identical (the pre-existing pinned capsule id / digest
pair). *Honest note:* a first branch run, executed while an 8-process roster sweep saturated the
machine, also failed `test_review_is_unchanged_after_the_canonical_data_moves`; it passes alone on
both worktrees and the full arm re-run on an idle machine is identical to base — load-induced, not a
regression. No frontend test ran: no frontend file changed.

---

## 17. Unresolved product decisions (none taken here)

* Whether repeated metrics are allowed / **soft-penalised** (evidence favours this) / capped /
  forbidden.
* Checkpoint strength per profile (strict vs soft); whether Wide should keep looking like
  "Early + L11".
* Budget per profile (evidence: Tight → 3, Full → 4; Early/Wide/Snapshot open).
* The Ranked profile distribution and weights.
* Level-1 Snapshot: refuse / redraw / permit level-1 stat questions / other families.
* Unchanged from earlier phases: prompt-rank wording, Snapshot's tier, the 9 rank-bearing gaps,
  State Context UI, the Mastery bank's manaless mana-regen bug (still unfixed, deliberately).

## 18. Recommended next implementation step (a recommendation, NOT a decision)

**Version the profile composition with the `balanced` criteria — still Lab-only.** Promote
`new_state > new_metric > new_subject > new_family` from an experimental policy to a candidate
**`composition.lab_profile_gate_aware.v2`** (a new id; v1 kept), because it is the one change with a
large measured benefit (repeats 23–53% → ≤0.7%, near-identical adjacent 0, mixed 94%) and no
measured cost (identical feasibility, unchanged coverage). Run the certified profiles over v2 in the
Lab, and put the checkpoint-strength (strict vs soft, per profile) and level-1 (redraw) questions to
the owner with this document's numbers. Choosing a distribution, and any Ranked wiring, stay later.

**Rollback:** `git revert ded63efb` (authored as `4e987b09`). Nothing persisted, no route, no migration, no frontend.

## 19. Integration record (2026-09-21)

The measurements above are **historical measurements** taken at `a9085292`. Integration did not
change any policy or any conclusion.

| | Result |
|---|---|
| Upstream since `a9085292` | 1 commit, `7130e8c1` (Hatefog item closure): 28 files, **zero** under `mastery/`, no composition / setup_state / gate / profile / family / Ranked / Slice file. Rebase mechanical. |
| Lab-only proof | `slice_quality`, `slice_experiment`, `compose_preferred_gate_aware` are referenced only by each other, `composition.py` (definition), `errors.py` (codes) and tests. `compose_preferred_gate_aware` refuses the three certified policy ids. No route, no default, no registered distribution. |
| Focused tests (`mastery/tests` GR1 + setup_state + profiles + Ranked slice arms) | branch 1 failed / 1379 passed; `origin/master` 1 failed / 1337 passed. **Failure set identical** (`test_phase4f_ranked_mastery_slice::test_format_for_creation_is_unaffected_by_this_module`, pre-existing). +42 = the experiment suite. |
| Current-serving invariance (branch vs `7130e8c1`, same DB) | 173-champion Champion Mastery bank digest identical; 60 certified-profile `profile_diagnostic` digests (Ahri/Jarvan/Karma × 5 profiles × budget 3,4 × 2 seeds) identical; production-publish rendered `run_profile` (Karma, Tight, 4, `alpha`) identical. |
| Sanity sample (6 champions × 5 profiles × budget 3,4 × 16 seeds = 960 cells per policy) | **baseline**: 305 repeated metrics, 287 sets with a repeat. **balanced**: 0 repeated metrics, 0 repeated subjects. Feasibility identical across policies (950/960, 0 `feasible_count` mismatches). Final gate verdict publishable and progression order held on every feasible set. **checkpoint_soft** unique state patterns (b=3): Ahri Wide 2→12, Early 3→11; Jarvan Wide 2→10, Early 4→7. |

**FACT:** the experiment measured the above. **DECISION:** none made. `balanced` is not the default;
no `composition.lab_profile_gate_aware.v2` exists; checkpoint weighting, Snapshot level-1 behaviour,
any profile distribution, and any Ranked wiring are all undecided and unimplemented.
