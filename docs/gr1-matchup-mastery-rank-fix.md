# GR1 — Matchup Mastery rank identity

Implementation over blockers 1, 2, 4 and 5 of
[`gr1-matchup-mastery-capability-audit.md`](./gr1-matchup-mastery-capability-audit.md).
**Champion Mastery untouched. Applied-chain untouched. No tie suppression. No difficulty work.
Public Ranked not enabled. Nothing pushed.**

| | |
|---|---|
| Date | 2026-09-13 |
| Backend | base `origin/master` **`c4f08761`** → branch `gr1/matchup-rank-identity` @ **`52f5564a`** (one commit, clean fast-forward) |
| Frontend | base `origin/main` **`3ce50045`** → branch `gr1/matchup-rank-identity` @ **`756b6b41`** (one commit, clean fast-forward) |
| Push status | **Neither pushed.** `origin/master` auto-deploys to Railway; `origin/main` is what Lovable publishes from, and a push alone does not publish. |

---

## 1. The defect, exactly

`mastery.manifest_session.adapter.effective_question_key` is
`(interaction_kind, prompt, answer_type, answer_options)`, and a comparison's
options are **always** `[champion_a, champion_b, "tie"]`.

Atomic recall survives that for free: five ranks of one ability produce five different
numeric option sets, so the five stay distinct without the prompt saying anything. A
**comparison has nothing but the prompt** to tell two ranks apart — and the prompt was

```python
prompt = f"{subject_a} vs {subject_b} — {ps.metric}"      # no context
```

So one shared slot's cooldown comparison at ranks 1–5 was **one question**. Four were
discarded by `dedupe_by_effective_question`, and the survivor — always rank 1, because that
is where the `candidate_key` sort lands — answered a question whose winning side changes
higher up.

**One f-string was three defects at once:**

| | |
|---|---|
| **Correctness** | one prompt, more than one right answer — 11,880 of 43,085 collapse groups (**27.6%**) disagreed between ranks; 9,880 of those were a tie at one rank and decisive at another |
| **Coverage** | 147,056 of 192,562 cooldown candidates thrown away (**76.4%**), which is what capped every pair at 13 comparisons |
| **Ties** | rank 1 is where kits agree by convention — ultimates share 120 s, basics share 20 s and 14 s |

## 2. The fix

**`_comparison_context_clause(ps)`** appends the intrinsic axis the comparison is stated at
— `" at rank N"`, or `" at level N"` where a level-stat comparison ever becomes servable.

**It honours `rank_independent` rather than ignoring it.** The composer's *flat pair* —
neither side's value moves with rank — holds at every rank by construction, so it states no
rank at all. The number really is the rank-1 number, but printing "at rank 1" would imply
the answer might differ elsewhere when it provably cannot. **That is the difference between
stating a rank and fabricating one**, and it is why the requirement "do not fabricate ranks
for flat cooldowns" needed a derived flag and not a heuristic.

`rank_independent` is set from the `flat_pair` the composer already computed; a
champion-level comparison (no slot) can never claim it, and a test asserts the flag is only
ever set on a candidate whose `redundancy_group` ends `:flat`.

**What did NOT move.** `candidate_key` already carried `:r{rank}`, so candidate identity is
untouched. Source authority is untouched — no value is read a second way, and the ability
names come off the same `ChampionFactSet` the values came from. The composer was not
redesigned; `SLOT_RELATIONS` is still same-slot only.

## 3. The comparison universe, before and after

All 14,878 pairs, 173/173 champions, 0 generation errors, both runs through the real
pipeline (`identity → preflight_matchup → project_champion ×2 → compose_matchup →
publication_gate.evaluate → dedupe_by_effective_question`).

| | Audit baseline | After | Δ |
|---|---|---|---|
| Raw comparison candidates | 726,049 | 726,049 | — |
| Policy-accepted | 322,026 | 322,026 | — |
| **Servable comparisons** | **174,970** | **322,026** | **+84.0%** |
| — `ability_cooldown` | 45,506 | **192,562** | **×4.23** |
| — `champion_base_stat` | 129,464 | 129,464 | — |
| Lost to dedupe | 147,056 | **0** | — |
| Servable atomic | 1,150,680 | 1,150,680 | — |
| Total servable | 1,325,650 | 1,472,706 | +11.1% |

**Per pair — comparisons:** min 8 / median **12** / max **13** → min 8 / median **22** /
max **27**. Pairs with zero comparisons: 0, before and after. Pairs below the old ceiling
of 13: **1,480 of 14,878** — the base-stat-only pairs, whose depth is gated by the
dual-form hold upstream and not by this fix.

**Skip reasons are byte-identical** (`no_counterpart_fact` 176,652 · `collapsed_flat_comparison`
48,800 · `semantic_mismatch` 7,471 · `ambiguous_operand` 1,480) and the only policy rejection
is still `family_unmapped` × 404,023. Nothing was unlocked that policy had refused.

**The collapse itself:**

| | Before | After |
|---|---|---|
| Effective-question groups holding 2+ ranks | 43,085 | **0** |
| …of which disagree on the answer | 11,880 (27.6%) | **0** |
| …involving a tie at one rank | 9,880 | **0** |

## 4. Ties — re-measured, not suppressed

**No tie policy was introduced.** The point of measuring first was to find out how much of
the tie problem was the rank collapse.

**Roster-wide: 11.60% → 9.50%** (20,296/174,970 → 30,604/322,026). The cooldown family's own
rate falls 9.9% → 7.7%; every base-stat rate is unchanged by construction.

**In real slices** — 5,016 generated slices, 418-pair stratified sample × {3,5,8} × 4 salts:

| | n=3 | n=5 | n=8 |
|---|---|---|---|
| Tie questions / all — **before** | 14.5% | 14.8% | 15.2% |
| Tie questions / all — **after** | **12.9%** | **14.0%** | **14.6%** |
| Slices ≥1 tie — before → after | 35.5% → **33.3%** | 50.1% → **49.0%** | 64.4% → **63.4%** |
| Slices ≥2 ties | 7.5% → **4.9%** | 18.0% → **16.1%** | 31.1% → **30.8%** |
| Slices ≥3 ties | 0.5% → **0.4%** | 5.3% → **4.2%** | 15.5% → **14.0%** |

**The slice-level improvement is much smaller than the roster-wide one, and the reason is
measurable.** Over 150 pairs × 3 seeds, the ranks a slice actually draws:

| n | rank 1 | ranks 2–5 |
|---|---|---|
| 3 | 406 | 251 |
| 5 | 724 | 251 |
| 8 | **937 (79%)** | 251 |

and the tie rate **by rank drawn** is **rank 1: 21.5% · rank 2: 9.7% · rank 3: 11.5% ·
rank 4: 8.1% · rank 5: 8.9%** — rank 1 is roughly twice as tie-prone as any other.

Composition allocates one question per *distinct fact* before a second rank of a fact
already asked (§5), and within a pattern the `candidate_key` order puts rank 1 first. So a
short slice still meets each slot **at rank 1**, which is exactly where kits agree.

**Conclusion for the tie decision, which remains open:** the rank collapse was worth about
**2 percentage points** of the roster-wide rate and roughly **1–1.6 points** of the slice
rate. The rest is two other things — (a) selection's rank-1 preference, and (b) genuinely
shared base constants, led by `base_magic_resist` at **39.3%** — and **rank diversity in
selection is a cheaper first lever than tie suppression**, because it costs no content and
the data to do it now exists.

## 5. Composition — preserved, and one change was required to preserve it

The first measurement after the fix showed a **regression**: repeated `(subject, slot,
metric)` went 0.0% → **43.1%** at n=8.

Cause, not guess: multiplying the RAW cooldown count by five did not change how many
**distinct facts** those candidates are about. `recipe.allocate`'s round-robin over raw
counts therefore handed a pair with two comparable slots four cooldown questions, and it met
each slot twice. This is exactly the failure `distinct_facts_by_category` was written for in
the Champion readiness pass — and `synthesize_matchup_manifest` was the one caller that never
passed it. The audit logged that omission as low priority *because it was free at n ≤ 8*;
widening the pool is what made it load-bearing.

Matchup now passes it, for both the comparison and the atomic plan. Re-measured:

| | baseline | after |
|---|---|---|
| Slices repeating `(subject, slot, metric)` @ n=3/5/8 | 0.0% / 0.0% / 0.0% | **0.0% / 0.0% / 0.0%** |
| Slices repeating an ability slot | 0 / 0 / 0 | **0 / 0 / 0** |
| Longest same-family run | 2 | **2** |
| Atomic fallback at n ≤ 8 | 0 slices | **0 slices** |
| Comparison-before-atomic violations | 0 | **0** |

**Determinism and symmetry, re-verified:** same salt × 3 runs ⇒ **1** slice; `(a,b)` and
`(b,a)` ⇒ **identical `artifact_digest`, `mastery_set_id` and step order**; 4 salts over 418
pairs ⇒ 4 distinct slices for **319** pairs (was 254), 3 for 87, 2 for 11, and **1 for a
single pair** — a pair whose whole comparison pool *is* the slice at that length, which is
correct rather than a seeding failure. Atomic fill still begins exactly at pool exhaustion.

## 6. Wording and presentation

All ten served shapes were inventoried in the audit; these are the four defects it named.

**Both abilities are named.** `MatchupPromptSemantics` carries a **pair**
(`ability_name_a` / `ability_name_b`), because a same-slot comparison is the one shape where
the slot is shared and the name is not — one name would have to belong to one side. The
names come off the same `ChampionFactSet.ability_name` read the Champion readiness pass
already uses, so this is not a second lookup and not a second authority. An unnamed slot, or
the backend's own slot-letter fallback, renders exactly the sentence that shipped before.

`_comparison_subject_label` is deliberately **not** `_subject_label`: the atomic one
*replaces* the slot with the name, and reusing it would have moved Champion Mastery's
prompts and therefore its dedupe. Keeping the two apart is what keeps this pass off Champion
Mastery.

**Before → after, the player-facing sentence:**

```
Which has the shorter cooldown: Aatrox W or Akali W?
At rank 3, which has the shorter cooldown: Aatrox W (Infernal Chains) or Akali W (Twilight Shroud)?

Which has more base Base Armor: Aatrox or Akali?
Which has more base Armor: Aatrox or Akali?

Which has more base Movement Speed: Aatrox or Akali?
Which has more Movement Speed: Aatrox or Akali?

Aatrox: 3 per_5_seconds. Akali: 9 per_5_seconds. Akali wins by 6 per_5_seconds.
Aatrox: 3 per 5 seconds. Akali: 9 per 5 seconds. Akali wins by 6 per 5 seconds.
```

**"base" is stated once, and only where it means something.** The template hardcoded `base `
over a slug that already began `base_`. It now drops the slug's qualifier — and omits the
word entirely for `movement_speed` and `attack_range`, which have no base-vs-scaled
distinction to qualify. The metric slug, which every identity travels under, is untouched.

**Units are spelled.** `UNIT_LABELS` + `unit_label()` live in `mastery/facts/contract.py`,
beside the unit identities, so a label can only exist for a unit that exists. It falls back
to the slug — which is what printed before the table — rather than to `""`, so an unlabelled
unit degrades to the status quo instead of silently dropping the dimension. `UNIT_CATEGORY`
and `UNIT_BOOLEAN` are deliberately unlabelled: neither ever suffixes a number. **Applied
only on the comparison path**, so Champion Mastery's explanations are byte-identical.

**The media band.** `movement_speed` and `attack_range` were absent from
`quiz.public_presentation.METRIC_NAMES`, so `MatchupRef.__post_init__` raised, the premise
builder returned `None`, and **17.0% of servable comparisons shipped with no media band at
all**, mid-slice, beside cards that had one. Both are now declared, labelled without a
"Base" qualifier. The existing `base_move_speed` / `base_attack_range` spellings are other
families' and were not renamed.

`ranked_public/presentation_render._matchup` hardcoded `f"Ability {slot}"`. It now emits
`ability_name_a` / `ability_name_b` **together or not at all** — a card naming one side's
ability and a placeholder for the other is the exact emphasis a matchup premise must not
carry. The old `ability_name` key **stays** as the literal it always was, so a client that
has not shipped the pair yet still draws a band; the frontend prefers the pair and falls
back to it.

## 7. Out of scope, as instructed

Not touched: Champion Mastery, Applied-chain, tie suppression, Full Mastery, difficulty,
public Ranked, persistence/history, the comparative cost and level-stat families
(`family_unmapped`, 404,023 candidates — the family-contract workstream's call), the five
Champion single-family cases, Patch Ops canonical data, and unrelated historical test
failures.

**The manaless mana-regeneration issue was left documented and unfixed**, per the brief. It
is a `mastery/facts/projection` question — `base_mana` already declines for those champions
and `base_mana_regen` does not — and no function this pass touched was the natural place for
it. It remains open in the audit and in the handoff: 22 champions, 3,553 pairs (23.9%), 231
of them a guaranteed 0–0 tie.

## 8. Tests

**New — backend `mastery/tests/test_gr1_matchup_rank_identity.py`, 19 tests, all passing.**
Rules, never League content: every subject is named only to reach a *shape* the roster
genuinely contains, and the shape is asserted, so a balance patch that moves which slot is
which fails loudly instead of quietly weakening the suite.

- every published rank of a slot is its own question, and no two share an `effective_question_key`
- ranks with **different** winners are all served, and each carries the winner for *its own* rank
- ranks with **identical** winners are still distinct questions (their explanations differ, and
  collapsing on equal answers would be tie policy wearing a dedupe costume)
- a rank-independent (flat) cooldown states **no** rank, publishes exactly one candidate, and
  the flag is only ever the composer's flat pair
- a cooldown prompt names both abilities *and* its rank; an unnamed slot falls back to the
  bare slot and never renders `(W)`
- no explanation contains an underscore (the unit-slug guard), plus `unit_label`'s own contract
- `movement_speed` / `attack_range` are declared and drawable; **every** servable comparison
  metric renders a premise card
- the band names both abilities or neither
- pair reversal ⇒ identical digest; same seed ⇒ identical slice; different seeds vary; a short
  slice repeats no fact and leads with comparisons; the pool a slice draws from is the pool
  coverage reports

**New — frontend `formatComparisonSemantics.test.ts`, 15 tests, all passing.** The file that
writes every Matchup sentence had **no test file at all**; it now covers the rank clause
(present, varying, absent for flat, absent when the payload has none), both-ability naming
and its fallbacks, the base-qualifier fix, the level template, contract reading of the new
fields, pre-fix payload handling, and the fail-closed unknown template.

**Suites run, compared against the baseline SHA serially (never in parallel — concurrent runs
against the shared `lol_calc.db` fabricate failures):**

| Suite | Result |
|---|---|
| `pytest mastery/tests` | **3 failed, 1677 passed, 17 skipped** — the documented pre-existing set (2 × `test_audit_db`, the stale `test_phase4f` format expectation). **Zero introduced.** |
| 7 Ranked-Mastery integration files | **2 failed, 200 passed** — both `test_mastery_ranked_capsule.py` pinned ids/digests, which **also fail at `ed254ca6`**, predating this work |
| 8 presentation / media suites | **7 failed, 416 passed** — failure set is **byte-identical at the base SHA `c4f08761`**, zero introduced |
| 4 footprint guards + `test_footprint_guard_split.py` | **166 passed, 0 failed**, run against the real commit rather than a dirty tree |
| `vitest` mastery + ranked-core + scenario-cards + question-surface | **70 files, 951 tests, all passing** |
| `tsc --noEmit` | no new errors in any touched file (the pre-existing repo errors are unchanged) |

**Three existing tests changed, and all three are stronger afterwards:**

1. `test_distinct_candidate_ids_that_render_alike_are_deduped` → **`test_per_rank_comparisons_no_longer_render_alike`**. It asserted that a pair "still contains colliding candidates" — and **the collision it pinned WAS this defect**. Inverted to assert there are none, and the dedupe *mechanism* is now proved over a duplicate the test supplies itself, so the file no longer needs a live bug to produce one.
2. `test_a_matchup_exhausts_its_real_comparisons_before_falling_back` — the literal `12` is now **read** from `eligible_matchup_pool`. A literal there made a correct widening of the universe read as a composition regression.
3. `comparisonSemantics.test.ts`'s key-set pin, which exists to prove the parsed shape carries no value, winner or tie state. The three added keys are two identities and a boolean that is true of both sides at once; the assertion now says so explicitly and checks they are inert when absent.

**Footprint.** `GR1_RUNTIME_FILES` grows by exactly three (`quiz/public_presentation.py`,
`quiz/presentation_contract.py`, `ranked_public/presentation_render.py`), re-pinned by exact
set equality in `test_footprint_guard_split.py` so the growth is a deliberate, reviewable
edit. `GR1_PACKAGES`, `MASTERY_FOOTPRINT`, `RANKED_BUILDER_FOOTPRINT`, `BANNED_PREFIXES` and
`SHARED_INTEGRATION_FILES` are unchanged; **no other workstream's boundary moved.**

## 9. What deploying this changes

A generated Matchup slice draws from a **1.84× larger** comparison pool, states the rank it
is judging, names both abilities, spells its units, and draws a media band on every card.
Generated `mastery_set_id`s and `artifact_digest`s for **Matchup move**, because the content
they identify changed — correct, and the same thing Phase 3 did. Champion Mastery and
applied-chain identities are **unaffected**, asserted by the suites above.

Because no public Ranked format names `mastery_slice` and all 29 stored configs are
`target='admin_bot'`, the reachable surface today is admin-bot matches and the Generator Lab.
**Zero DDL**, no migration, nothing to sequence. Segments frozen before the deploy are
unaffected: every new field is absent-means-unknown on both sides of the wire.

## 10. Remaining Matchup blockers

1. **Ties** — now quantified before and after. Decide policy; **rank diversity in selection
   is the cheaper first lever than suppression** (§4). *Open — owner decision.*
2. **The comparative cost and level-stat families** — still `family_unmapped`, still 404,023
   candidates, still two live renderer branches with no content. *Open — family-contract
   workstream.*
3. **Manaless mana regeneration** — 3,553 pairs (23.9%). *Open — documented, deliberately
   not fixed in this pass.*
4. **The dual-form row split** — why 1,480 pairs are base-stat-only. *Open — CHAMPDATA.*
5. **The Lab coverage headline** still leads with `total_candidates` when the number that
   decides the product is `comparison_candidates`. *Open — small.*
6. **No fresh screenshot.** The capability audit could not capture one (permission
   classifier), and neither did this pass; the Phase 5 Matchup capture is the current
   reference and predates both this work and the Champion readiness pass.
