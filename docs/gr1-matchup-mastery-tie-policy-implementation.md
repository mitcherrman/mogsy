# GR1 — Matchup Mastery tie policy, implemented

The approved hybrid from
[`gr1-matchup-mastery-tie-policy.md`](./gr1-matchup-mastery-tie-policy.md) §5 — **tie
deprioritization + a per-slice tie cap of `max(1, n // 4)`** — built, measured against
the same instrument that chose it, and committed to a branch.

**BACKEND ONLY. Nothing pushed to `master`. Docs on `gr1/docs-snapshot`, not merged.
No frontend change, and none needed.** Champion Mastery untouched and asserted so.
Metric-level suppression (Policy D) was rejected in the design pass and is not here: the
comparison universe is byte-identical.

| | |
|---|---|
| Date | 2026-09-13 |
| Base | `League_Combat_Simulator` `origin/master` @ **`087f9a78`** |
| Branch | `gr1/matchup-tie-policy` @ **`afb55d1e`** — one commit, clean fast-forward, **not pushed** |
| Worktree | `/Users/macmoney/lcs-wt-gr1-tie`, `git status` clean |
| Frontend | `mogsy` — **no change** |
| Scope | `mastery_mode: matchup`, tie policy only |

**A note on the base SHA.** The brief names `origin/master` = `825e2db2`, which is where
the design pass measured. `origin/master` has since moved to `087f9a78` (two
`item-runtime` commits). `git diff 825e2db2 087f9a78 -- mastery/` is **empty**, so the
implementation sits on the identical Mastery code the design pass measured, and this
document's baseline arm is that code exactly.

```bash
# when the owner decides to ship it
git -C /Users/macmoney/lcs-wt-gr1-tie push origin gr1/matchup-tie-policy:master
```

---

## 1. What was implemented

Two opt-in fields on the shared `RepetitionPolicy`, set only by the Matchup synthesizer,
threading through two seams that already existed.

### `prefer_discriminating_context: bool = False`

The shipped `_context_diverse_order` rotates each fact's own context variants by a
`(seed, pattern)` hash. This advances that seeded landing to the first variant that does
**not** tie, cyclically from the offset the seed already chose. Three properties follow
from the mechanism rather than from care, and all three are asserted:

* **The pool is unchanged as a set.** A group's members are only rotated further, so no
  request's count, fill or under-fill diagnostic can move.
* **Pattern ORDER is untouched.** No category, slot or metric is reordered, so the
  family mix and the metric-diversity bound cannot move.
* **A single-variant pattern does not move at all.** Every base stat has exactly one
  candidate per pair, so this **provably cannot touch a base-stat tie** — the design
  pass's measured ceiling, now a property of the code.

A group all of whose variants tie is returned as the seed left it. Nothing is deleted.

### `max_tie_questions: Optional[int] = None`

At most this many tied questions in one resolved slice. The Matchup synthesizer sets it
as the approved **rule**, `max(1, question_count // 4)` — not a per-length table — which
yields 1 at n=3, 1 at n=5 and 2 at n=8.

It is a **preference, not an invariant**, and the mechanism is the one thing in this
pass worth reading twice. `_select_for_request` already walked its rotated pool keeping
one deferral queue, for candidates whose fact the slice had already asked. The cap adds
a **second, separate queue** for over-budget ties, and drains **ties first**:

```
for candidate in rotated:
    if pattern already asked          -> deferred            (queue 2)
    elif tie and budget exhausted     -> deferred_tie        (queue 1)
    else                              -> take it

for candidate in deferred_tie + deferred:   # queue 1 BEFORE queue 2
    take it
```

That ordering is the whole difference between the design pass's `B2` and its naive `B`,
and it is what holds repeated facts at zero: a tie is only ever passed over in favour of
a **fresh non-tie**, and never in favour of a fact the slice already asked. When both
queues are exhausted the tie is taken and `_TieBudget` records the overrun rather than
preventing it — composition correctness outranks the cap.

The budget is one object per resolution, threaded through `_run_selection_plan` →
`_select_for_request` on the identical parameter path as `used_patterns`, so it is a
property of the **slice** and not of one category's request.

### Files

| File | Change |
|---|---|
| `mastery/manifest/contract.py` | the two `RepetitionPolicy` fields, each emitted into `to_dict()` **only when set** |
| `mastery/manifest/resolver.py` | `_is_tie`, `_TieBudget`, the non-tie landing in `_context_diverse_order`, the two-queue deferral in `_select_for_request`, the budget in `_run_selection_plan` |
| `mastery/synthesis/recipe.py` | `synthesize_matchup_manifest` sets both. `synthesize_champion_manifest` sets neither |
| `mastery/tests/test_gr1_matchup_tie_policy.py` | new, 23 tests |

+160 / −6 across three runtime files, **all already inside `SLICE_FOOTPRINT`**
(`mastery/manifest/` and `mastery/tests/` via `MASTERY_PACKAGES`, `mastery/synthesis/`
via `GR1_PACKAGES`). No footprint list moved; the 15 footprint guards pass unchanged.

---

## 2. The architecture boundary

The design pass flagged this as the first resolver behaviour that may inspect a
candidate's *answer*, and asked that a reviewer confirm the boundary deliberately. It is
one function, and it is the only place either policy touches content:

```python
def _is_tie(candidate) -> bool:
    return (isinstance(candidate, M.MatchupQuestionCandidate)
            and candidate.outcome.is_tie)
```

What that buys, and what it deliberately does not:

| | |
|---|---|
| Answer correctness | **Unchanged and still owned by `ComparisonOutcome`.** Nothing here computes, compares, re-derives or overrides a value |
| Candidate validity | **Unchanged.** A tie is a valid question whose canonical answer is `"tie"`, and the three-option control already ships |
| The candidate universe | **Unchanged.** No candidate is removed from any pool at any point; a deferred tie is still reachable at another seed |
| What the resolver reads | **Only the already-computed tie signal**, as a selection-quality hint: which of a fact's variants represents it, and how many such questions one slice carries |
| Every other caller | **Unaffected.** Both fields are absent-means-off, so the resolver is *not* globally tie-aware — a manifest that does not opt in resolves byte for byte as before |
| Atomic recall | **Inert by construction.** A single-champion candidate has no outcome, so `_is_tie` is `False` for it and both policies are no-ops over atomic content |
| Champion Mastery | **Does not adopt either**, asserted in `test_champion_mastery_does_not_adopt_either_policy`, which also re-checks that a Champion artifact still reproduces from its seed |
| A hand-authored recipe that pins `ability_rank` | **Unaffected.** `_matches` filters the pool before any of this runs; asserted |

Both fields are additive in `to_dict()`, so **every manifest authored before this pass
keeps a byte-identical dict and therefore its pinned digest.**

---

## 3. Measurement

Same instrument as the design pass: the real
`recipe.synthesize_matchup_manifest → publication_gate` pipeline against the real
canonical database, over a stratified sample at n=3/5/8 × 4 salts.

**The sample is 420, not the design pass's 418.** Same strata (40 thinnest + 40 richest
+ 40 tie-heaviest + 300 random, deduplicated) and the same seed (`20260912`), but the
tie-heaviest stratum's tie-break differs slightly, so the draw does. **Every arm below
is the same 420 pairs**, so every before/after delta is exact; the design doc's absolute
figures are a slightly different sample and are compared as *shape*, not digit for
digit. In particular this sample's tail stratum is **harder** than the design pass's —
see §3.3.

**The baseline arm is the real pre-pass generator**, produced by stripping both fields
from the synthesized recipe in-process; the hybrid arm is the branch as committed.
1,680 slices per cell, 10,080 real generated slices, 0 errors.

### 3.1 The comparison universe — reproduced exactly

Before anything else, the roster-wide sweep over all 14,878 pairs on the branch:

| | design pass @ `825e2db2` | this branch | |
|---|---|---|---|
| Pairs generatable | 14,878 / 14,878, 0 errors | **14,878 / 14,878, 0 errors** | ✅ |
| Servable comparisons | 322,026 | **322,026** | ✅ |
| Ties in the universe | 30,604 (9.50%) | **30,604 (9.50%)** | ✅ |

**Nothing was suppressed, deleted or hidden.** That is the central claim of choosing the
hybrid over metric-level suppression, and it is a measurement, not an assertion.

### 3.2 Before / after — the three lengths

420 pairs × 4 salts = 1,672… 1,680 slices per cell.

#### n=3 (cap 1)

| | before | after |
|---|---|---|
| tie rate, all 420 | 13.23% | **8.49%** |
| tie rate, random stratum (player-facing) | 9.69% | **6.33%** |
| slices ≥1 tie | 31.7% | 25.2% |
| **≥2** | 7.3% | **0.2%** |
| **≥3** | 0.7% | **0.0%** |
| adjacent tie pairs | 106 | **4** |
| ties-per-slice | 0:1147 1:411 2:110 3:12 | 0:1256 1:420 **2:4** |

#### n=5 (cap 1)

| | before | after |
|---|---|---|
| tie rate, all 420 | 13.52% | **7.83%** |
| tie rate, random stratum | 10.35% | **6.53%** |
| slices ≥1 tie | 45.1% | 37.5% |
| **≥2** | 16.4% | **1.7%** |
| **≥3** | 5.2% | **0.0%** |
| adjacent tie pairs | 203 | **0** |
| ties-per-slice | 0:922 1:483 2:187 3:73 4:15 | 0:1050 1:602 **2:28** |

#### n=8 (cap 2)

| | before | after |
|---|---|---|
| tie rate, all 420 | 13.48% | **10.28%** |
| tie rate, random stratum | 10.72% | **8.38%** |
| slices ≥1 tie | 58.3% | 51.2% |
| ≥2 | 28.6% | 24.6% |
| **≥3** | 13.4% | **4.8%** |
| adjacent tie pairs | 357 | **160** |
| ties-per-slice | 0:700 1:499 2:256 3:129 4:68 5:26 6:2 | 0:820 1:446 2:334 **3:52 4:28** |

**The ties-per-slice rows are the result, not the rates.** At n=3 and n=5 the
distribution is *truncated at the cap* except for a handful of slices; at n=8 the mass
moves from the 3–6 tail into the 0–2 band, and the whole 5-and-6 tail disappears.

### 3.3 The tail — the 40 tie-heaviest pairs

| n=8, 160 slices | before | after |
|---|---|---|
| tie rate | 45.23% | **32.50%** |
| ≥1 | 100.0% | 100.0% |
| ≥2 | 100.0% | 100.0% |
| **≥3** | **87.5%** | **42.5%** |

| n=5 | before | after | | n=3 | before | after |
|---|---|---|---|---|---|---|
| tie rate | 49.12% | **23.50%** | | tie rate | 51.46% | **32.29%** |
| ≥2 | 91.2% | **17.5%** | | ≥2 | 51.9% | **2.5%** |
| ≥3 | 46.2% | **0.0%** | | ≥3 | 6.2% | **0.0%** |

### 3.4 Tie volume by metric, pooled over n=3/5/8

| metric | before | after |
|---|---|---|
| `ability_cooldown` | 1,419 | **801** |
| `base_magic_resist` | 723 | 554 |
| `attack_range` | 438 | 343 |
| `movement_speed` | 370 | 275 |
| `base_mana_regen` | 183 | 115 |
| `base_health_regen` | 120 | 102 |
| `base_attack_damage` | 109 | 73 |
| `base_armor` | 96 | 77 |
| `base_health` | 95 | 80 |
| `base_mana` | 62 | 48 |
| **TOTAL** | **3,615** | **2,468** |

**The two halves are visible separately here, exactly as designed.** `ability_cooldown`
falls 44% — that is deprioritization, which only multi-variant facts have. Every base
stat falls too, by roughly a fifth — that is the cap alone, since deprioritization
provably cannot reach a single-variant pattern. **No metric rises**, which is the
whack-a-mole leak that sank Policy D (`base_mana_regen` 153 → 190 under it); the hybrid
changes what a slice *chooses*, not what the product *contains*, so there is no freed
budget to re-acquire.

### 3.5 Comparison against the simulation

| | sim `C + cap` | measured | |
|---|---|---|---|
| n=3 tie rate | 7.91% | 8.49% | close |
| n=3 ≥2 / ≥3 | 0.0% / 0.0% | 0.2% / **0.0%** | close |
| n=3 adjacent | 0 | 4 | close |
| n=5 tie rate | 7.70% | 7.83% | **match** |
| n=5 ≥2 / ≥3 | 1.7% / 0.0% | **1.7% / 0.0%** | **match** |
| n=5 adjacent | 0 | **0** | **match** |
| n=8 tie rate | 9.70% | 10.28% | close |
| n=8 ≥2 | 24.3% | **24.6%** | **match** |
| n=8 ≥3 | 1.9% | 4.8% | **the one gap** |
| n=8 adjacent | 127 | 160 | close |
| tail n=8 ≥3 | 71.9% → 12.5% | 87.5% → **42.5%** | **the one gap** |

**The implementation reproduces the simulation everywhere except the residual ≥3 at
n=8, and most of that gap is the sample, not the code.** This sample's tail stratum is
strictly harder than the design pass's: its *baseline* n=8 tie rate is 45.23% against
40.94%, and its baseline ≥3 is 87.5% against 71.9%. A harder tail leaves a larger
residual for the same policy, because the residual is exactly the slices whose requests
run out of deciding comparisons. The baselines differ in the same direction at every
cell (n=8 all-sample 13.48% vs 12.99%), which is the signature of a denser sample rather
than of a weaker mechanism.

**No policy change was made to close that gap**, per the brief. The approved policy is
implemented as approved.

### 3.6 Where the cap is not met, and why — proved, not assumed

The cap's one legal overrun is "this request had no fresh deciding candidate left to
take instead". That was checked exhaustively rather than argued: **2,400 slices over the
40 tie-heaviest pairs plus 160 random pairs, at n=3/5/8 × 4 salts.**

| | |
|---|---|
| Slices exceeding the cap | **104 of 2,400 (4.33%)** |
| …of which a fresh deciding alternative existed in that category | **0** |

Every single overrun is a request whose admitted pool held no deciding comparison the
slice had not already asked. **The cap is never abandoned while an alternative exists,
and never met at the expense of an invariant.** This is asserted as a test, not only
measured — `test_a_slice_honours_the_cap_wherever_the_pair_can`.

---

## 4. Invariants — all re-verified on the branch

Over the same 10,080 generated slices, and the 14,878-pair sweep:

| Invariant | Result |
|---|---|
| Pairs generatable | **14,878 / 14,878, 0 errors** |
| Comparison universe | **322,026 — byte-identical to the design-pass baseline** |
| Repeated `(subject, slot, metric)` | **0** at every length, both arms |
| Repeated ability slot | **0** at every length, both arms |
| Under-filled slices | **0** at every length, both arms |
| Atomic fallback at n ≤ 8 | **0** at every length, both arms |
| Longest same-metric run | **2**, unchanged |
| 4 salts ⇒ 4 distinct slices | **420 / 420** at every length, both arms |
| Determinism | same salt × 3 runs ⇒ 1 digest; asserted for both `PAIR` and the tie-dense pair |
| Reversed-pair symmetry | `(a,b)` ≡ `(b,a)` ⇒ identical `artifact_digest`, `mastery_set_id` and step order; asserted |
| Rank diversity | **intact.** Deprioritization is a further rotation of a group's own members and pattern order is untouched, so the drawn rank distribution's relationship to the pool cannot move; the full `test_gr1_matchup_rank_diversity.py` suite passes unchanged |
| Rank-identity fix | **intact.** `test_gr1_matchup_rank_identity.py` passes unchanged |
| Pre-existing manifest digests | unchanged — both fields absent-means-off in `to_dict()` |

**Generated Matchup `mastery_set_id`s and `artifact_digest`s move**, because the
composition they identify changed. Certain and intended, and the same thing Phase 3, the
rank-identity pass and the rank-diversity pass each did. Reachable surface is admin-bot
matches and the Generator Lab.

---

## 5. Tests

New: **`mastery/tests/test_gr1_matchup_tie_policy.py`, 23 tests, 0 skipped.**

Anchored on two pairs, both re-derived from the live pool before they are relied on and
skipped rather than asserted if a balance patch removes the shape: `aatrox` / `ahri`
(the neutral invariants) and `braum` / `mordekaiser` (26 comparisons of which 14 tie —
the tail the cap exists for). No test asserts a tie RATE, a champion value, or that a
given slot ties.

| What | Test |
|---|---|
| decisive variant preferred over tied | `test_a_decisive_variant_is_preferred_over_a_tied_one` |
| …and it is a rotation only — same set, same pattern order | `test_deprioritization_is_a_rotation_and_changes_nothing_else` |
| …and cannot touch a single-variant fact (every base stat) | `test_a_fact_with_one_variant_is_untouched` |
| …and a fact that ties everywhere still asks its tie | `test_a_fact_that_ties_everywhere_still_asks_its_tie` |
| tied variant still selectable and valid | `test_a_tied_variant_remains_selectable`, `test_a_tied_question_keeps_its_canonical_answer_and_stays_valid` |
| cap = `max(1, n // 4)` at n=3 / 5 / 8, as a rule | `test_the_recipe_sets_the_approved_cap_rule` |
| cap honoured wherever a fresh deciding alternative exists | `test_a_slice_honours_the_cap_wherever_the_pair_can` |
| cap is not vacuous — it binds on the tail | `test_the_cap_actually_binds_on_the_tail` |
| cap yields to composition correctness | `test_the_cap_yields_to_composition_correctness` |
| B2 drain order — tie queue ahead of the used-pattern queue | `test_an_over_budget_tie_is_deferred_before_an_already_asked_fact` |
| overrun recorded, not prevented | `test_the_budget_records_an_overrun_rather_than_preventing_it` |
| default off, absent from `to_dict()` | `test_both_policies_are_off_by_default_and_absent_from_the_dict` |
| an opted-out caller resolves byte for byte as before | `test_a_caller_that_does_not_opt_in_resolves_exactly_as_before` |
| Champion Mastery unaffected, and still reproduces | `test_champion_mastery_does_not_adopt_either_policy` |
| a pinned `ability_rank` still resolves to that rank | `test_a_request_that_pins_a_rank_still_resolves_to_exactly_that_rank` |
| determinism | `test_the_same_seed_reproduces_the_same_slice` |
| seed variation not collapsed | `test_different_seeds_still_draw_meaningfully_different_slices` |
| reversed-pair symmetry | `test_reversing_the_pair_yields_the_identical_slice` |
| no duplicate fact / slot / atomic regression | `test_no_slice_repeats_a_fact_or_a_slot_or_falls_back_to_atomic` |
| universe unchanged and fully reachable | `test_the_candidate_universe_is_unchanged_and_fully_reachable` |
| the boundary itself | `test_the_resolver_reads_the_composer_s_outcome_and_nothing_else` |
| the policies move the slice and not the pool | `test_the_policies_move_the_slice_and_not_the_pool` |

**The suite fails at the defect.** With the two policy lines in
`synthesize_matchup_manifest` flipped off, **4 of 23 fail** — the cap wiring, the cap
honoured, the cap binding, and the before/after direction — and the remaining 19 still
pass, because they assert the mechanism and the boundary rather than the wiring.

### Runs

All with `/Users/macmoney/League_Combat_Simulator/.venv/bin/python -m pytest`.

| Suite | Result |
|---|---|
| `mastery/tests/test_gr1_matchup_tie_policy.py` | **23 passed** |
| Focused Matchup + composition — `test_gr1_matchup_rank_diversity`, `test_gr1_matchup_rank_identity`, `test_gr1_phase3_composition`, `test_gr1_champion_mastery_product_readiness`, `test_synthesis_matchup`, `test_synthesis_champion`, `test_manifest_resolver`, `test_synthesis_question_uniqueness` | **307 passed** |
| Persistence / gate / footprint / isolation — `test_gr1_phase4_artifact_persistence`, `test_phase4d2_publication_gate`, `test_phase4f_ranked_mastery_slice`, `test_phase5_mastery_slice_config`, `test_manifest_isolation`, `test_footprint_guard_split`, `test_ranked_mastery_frozen_segment`, `test_synthesis_runtime_restart`, `test_matchup_composition`, `test_matchup_identity` | 1 failed / 306 passed / 5 skipped |
| `test_ranked_launch_readiness.py` | 9 passed |
| **Full `mastery/tests`, branch** | **3 failed / 1,722 passed / 10 skipped** |
| **Full `mastery/tests`, baseline arm (`afb55d1e~1`, new test file removed)** | **3 failed / 1,699 passed / 10 skipped** |

**The failure SETS are byte-identical between the arms** — `test_audit_db.py`
(2 tests) and `test_phase4f_ranked_mastery_slice.py::test_format_for_creation_is_unaffected_by_this_module`
(a Ranked format naming drift, `ranked_points_v2` vs `ranked_modern`, unrelated to
Mastery). **Zero introduced, none repaired**, and none touched, per the brief. Passing
count moves by exactly the 23 new tests.

---

## 6. Remaining Matchup blockers

Unchanged from the design pass except item 1, which is now closed:

1. ~~**Tie policy**~~ — **IMPLEMENTED on `gr1/matchup-tie-policy` @ `afb55d1e`, not
   pushed.** *Owner action: push, or decline.*
2. **The comparative cost and level-stat families** — still `family_unmapped`, still
   404,023 candidates. *Open — family-contract workstream.*
3. **`base_magic_resist` as a comparison metric at all** — ten roster values, 88.5% of
   champions on two of them. Still the clearest content finding, and still a
   `quiz/family_contract` + CHAMPDATA question that no tie policy answers. The cap took
   its tie volume 723 → 554 without touching the metric. *Open.*
4. **Manaless mana regeneration** — 3,553 pairs (23.9%). *Open, deliberately not fixed.*
5. **The dual-form row split** — why 1,480 pairs are base-stat-only. *Open — CHAMPDATA.*
6. **The Lab coverage headline** still leads with `total_candidates`. *Open — small.*
7. **No fresh screenshot.** Not attempted; this pass changes which questions a slice
   carries, not how any of them is presented, and the frontend did not change.

**The broader Matchup Mastery structural review was NOT started.** Nothing in this pass
touched the composer, the candidate universe, the family contract, difficulty, the
applied chain, the wire contract or the frontend.
