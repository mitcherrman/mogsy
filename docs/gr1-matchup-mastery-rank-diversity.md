# GR1 — Matchup Mastery rank diversity

Implementation over blocker 1 of
[`gr1-matchup-mastery-rank-fix.md`](./gr1-matchup-mastery-rank-fix.md) §10 —
*"rank diversity in selection is the cheaper first lever than suppression"*.
**Champion Mastery untouched. Applied-chain untouched. No tie suppression, and
no code on this branch reads an outcome. No source-authority change, no new
question family, no canonical-fact change. Nothing pushed.**

| | |
|---|---|
| Date | 2026-09-13 |
| Backend | base `origin/master` **`b9f7cd73`** → branch `gr1/matchup-rank-diversity` @ **`1f8f1de9`** (one commit, clean fast-forward) |
| Frontend | **unchanged.** No presentation change was required — see §7 |
| Push status | **Not pushed.** `origin/master` auto-deploys to Railway |

---

## 1. What was measured, and how

The same two instruments as the previous Matchup passes, both against the real
canonical database, both read-only, and — this is what makes the before/after
comparable — **the identical sample, run twice**: once from a detached worktree
at the base SHA, once from the branch.

1. **Pair sweep** — the real pipeline (`identity → preflight_matchup →
   project_champion ×2 → compose_matchup → publication_gate.evaluate →
   dedupe_by_effective_question`) over **all 14,878 pairs**, 173/173 champions,
   0 errors, 86 s.
2. **Composition probe** — the real
   `mastery.synthesis.service.synthesize_matchup_mastery` over a stratified
   **420-pair sample** (40 thinnest + 40 richest + 40 tie-heaviest + 300
   random, seed `20260912`) × {3, 5, 8} questions × {no salt, `s1`, `s2`, `s3`}
   = **5,040 real generated slices, 0 errors**, before and after.

**One disclosure on the sample.** The previous audit's sample was 418 pairs;
the same strata drawn here give 420, because two pairs that qualified for two
strata in that draw do not in this one. The sample size is the only thing that
differs, and **both arms of every number below are the same 420 pairs**, so the
deltas are exact even where a level does not line up with the earlier document
to the tenth of a point.

The sweep reproduces the post-rank-fix universe exactly — 322,026 servable
comparisons (192,562 `ability_cooldown` + 129,464 `champion_base_stat`),
1,150,680 atomic, 9.50% roster-wide tie rate, per-pair comparisons min 8 /
median 22 / max 27, zero pairs with no comparison — so the two passes are
measuring the same product.

---

## 2. The rank-1 bias, before

**The universe is already almost flat.** Of the 192,562 servable cooldown
comparisons:

| rank | candidates | share |
|---|---|---|
| 1 | 45,506 | 23.6% |
| 2 | 43,085 | 22.4% |
| 3 | 43,085 | 22.4% |
| 4 | 30,443 | 15.8% |
| 5 | 30,443 | 15.8% |

(Ranks 4 and 5 are lower only because ultimates publish three ranks. 2,421
comparisons are the composer's rank-INDEPENDENT flat pair and carry no rank at
all; they are excluded from every rank figure in this document and are counted
separately throughout.)

**What slices actually drew was not.**

| n | r1 | r2 | r3 | r4 | r5 |
|---|---|---|---|---|---|
| 3 | **60.0%** | 12.2% | 11.6% | 8.0% | 8.2% |
| 5 | **71.6%** | 8.7% | 8.2% | 5.7% | 5.8% |
| 8 | **76.2%** | 7.3% | 6.9% | 4.8% | 4.9% |

By slot: E 67.5% · Q 70.7% · R 77.8% · W 65.2% at rank 1. One family carries
all of it (`ability_cooldown`); `champion_base_stat` has no rank axis.

---

## 3. The cause, read off the numbers rather than inferred

**The RAW COUNT of non-rank-1 draws is identical at every slice length.**

```
n=3 : r2=334  r3=317  r4=219  r5=224
n=5 : r2=334  r3=317  r4=219  r5=224
n=8 : r2=334  r3=317  r4=219  r5=224
```

Only the rank-1 count grows with n (1,638 → 2,757 → 3,494). A *weighting*
toward rank 1 would scale every rank with the budget. A number that does not
move when the budget triples is a **per-slice constant**: exactly one fact per
slice escapes rank 1, and which one depends only on the seed. The second
signature agrees — **no slice in the 5,040 ever drew three distinct ranks**
(≥3 distinct: 0.0% at n=3, n=5 and n=8), and 24.2% drew only rank 1.

**The mechanism.** `mastery.manifest.resolver._select_for_request`:

```python
pool = sorted((c for c in universe.candidates if _matches(c, request)),
              key=lambda c: c.candidate_key)
offset = _seed_offset(seed, len(pool))
rotated = pool[offset:] + pool[:offset]
```

then walks `rotated` and takes the first candidate of each `_pattern_group` it
has not met (the GR1 readiness pass's `used_patterns`, which is what keeps a
fact out of the slice once it is asked).

`mastery.matchup.composer._key_for` builds a comparison's key as
`…:{display_a}:{slot}:vs:{display_b}:{slot}:r{rank}`. **The rank is the last
segment**, so a fact's five variants share every leading segment and sort
adjacently — `:r1`, `:r2`, … `:r5` — as one contiguous block.

A single rotation of the whole pool can move the boundary past **at most one**
such block. Every other block is still entered at `:r1`, `used_patterns` marks
the fact met, and ranks 2–5 of it are deferred and never reached in a slice
that asks each fact once. With four comparable slots that is three of four at
rank 1 whatever the seed, which is 76.2% at n=8 once ultimates and flat pairs
are mixed in.

**The rotation was never wrong.** It does exactly what it was written to do —
stop two manifests from always picking the same slice of a shared category. It
simply operates one level above the axis *inside* a fact, and nothing else ever
did.

Not the cause, checked: `recipe.allocate` (the cooldown count per slice is
**identical** before and after — 2,824 / 4,016 / 4,792 at n=3/5/8), the
publication gate, `dedupe_by_effective_question` (zero collapse since the rank
fix), and the sequencer, which reorders finished selections and cannot add a
rank the selector did not pick.

---

## 4. The change

**`mastery/manifest/resolver.py` — `_context_diverse_order(rotated, seed)`.**
The same mechanism, one level down: each pattern's own variants are rotated by
an offset derived from `content_hash({"seed": …, "pattern": …})`, so which
context represents a fact varies **between facts inside one slice** and
**between seeds for one fact**.

It is a **reordering only**, and three properties follow from that rather than
from care:

* **The pool is unchanged as a set.** Every candidate appears exactly once, so
  no request's count, fill, or `SELECTION_UNDER_FILLED` diagnostic can move
  because of it.
* **Pattern ORDER is untouched** — only order *within* a pattern. A fact with
  one variant is returned exactly where it was, which is why a flat cooldown
  and every base stat are provably unaffected rather than incidentally so.
* **It is order-symmetric.** `_pattern_group` is built from the composer's
  already-canonical champion order, so `(a,b)` and `(b,a)` derive identical
  offsets.

It names no rank, no level, no metric and no champion. "Context variants of one
fact" is read off `_pattern_group` — the **same** notion of "same fact" that
selection's `used_patterns` and the sequencer's adjacency rule already use. So
this is a general composition rule over a context axis, not a rank sequence:
the level axis a `champion_level_stat` candidate carries (`:lvl6` … `:lvl18`)
is handled by the identical code with no branch, the day that family becomes
servable.

**`mastery/manifest/contract.py` —
`RepetitionPolicy.diversify_context_within_pattern`, default `False`**, emitted
into `to_dict()` only when set, so every manifest authored before it keeps a
byte-identical dict and therefore its pinned digest.

**Off by default, for the same reason `require_distinct_effective_question` is.**
A hand-authored recipe that pins `ability_rank` on a `SelectionRequest` has
already chosen its context and must keep resolving to exactly that one; a
*synthesized* recipe asked for "N of this category" and named no rank, so no
request in it is entitled to a particular one. Rank filtering still happens
first regardless — `_matches` runs before any of this — and a test proves a
pinned request still resolves to exactly its rank with the policy on.

**`mastery/synthesis/recipe.py`** — `synthesize_matchup_manifest` sets it.
`synthesize_champion_manifest` does not, and a test asserts that it does not.

Two policies, deliberately independent and composing cleanly:
`distinct_facts_by_category` + `used_patterns` decide **how many different
facts** a slice asks about; this decides **which context** each is asked at.

---

## 5. Before → after

### Rank distribution — 5,040 slices, same 420 pairs

| n | | r1 | r2 | r3 | r4 | r5 |
|---|---|---|---|---|---|---|
| 3 | before | **60.0%** | 12.2% | 11.6% | 8.0% | 8.2% |
| 3 | after | **24.6%** | 22.7% | 23.3% | 14.8% | 14.6% |
| 5 | before | **71.6%** | 8.7% | 8.2% | 5.7% | 5.8% |
| 5 | after | **24.3%** | 23.2% | 23.5% | 15.1% | 13.8% |
| 8 | before | **76.2%** | 7.3% | 6.9% | 4.8% | 4.9% |
| 8 | after | **24.0%** | 23.5% | 23.8% | 15.0% | 13.7% |

**The drawn distribution now tracks the pool's own** (23.6 / 22.4 / 22.4 / 15.8
/ 15.8) to within a point at every rank — which is the strongest available
statement that nothing replaced the old preference with a new one.

**By slot** (all n): E 67.5% → **21.1%** · Q 70.7% → **19.8%** · W 65.2% →
**19.3%** at rank 1; R (three ranks) 77.8% → **34.6%**, against an even share of
33.3%. **By family:** `ability_cooldown` 70.6% → **24.2%**;
`champion_base_stat` has no rank axis and is untouched.

**Flat / rank-independent cooldowns are handled separately and did not move**:
92 / 165 / 204 drawn at n=3/5/8, identical in both arms. They are a single
candidate per fact by construction, so the rule has nothing to rotate, they
still state no rank, and they are excluded from every figure above.

### Distinct ranks per slice

Over slices holding at least one rank-bearing cooldown comparison (1,444 per n):

| | n=3 | n=5 | n=8 |
|---|---|---|---|
| only rank 1 — before → after | 24.2% → **7.8%** | 24.2% → **3.9%** | 24.2% → **3.4%** |
| ≥2 distinct ranks | 68.3% → **71.1%** | 71.6% → **87.4%** | 71.7% → **89.5%** |
| ≥3 distinct ranks | 0.0% → **0.0%** | 0.0% → **35.0%** | **0.0% → 51.3%** |
| ≥4 distinct ranks | 0.0% → 0.0% | 0.0% → 0.0% | **0.0% → 9.8%** |
| mean distinct | 1.68 → **1.71** | 1.72 → **2.22** | 1.72 → **2.51** |

(≥3 stays 0.0% at n=3 because a three-question slice rarely holds three
cooldown comparisons at all — an allocation fact, not a diversity one.)

### Ties — re-measured, never suppressed

**No tie policy was introduced, and nothing on this branch reads
`outcome.tie_state`.** Ties fall only as a consequence of drawing away from the
rank where kits agree.

| | n=3 | n=5 | n=8 | overall |
|---|---|---|---|---|
| tie questions / all — before | 13.00% | 13.67% | 13.53% | 13.47% |
| tie questions / all — after | **12.88%** | **13.29%** | **13.29%** | **13.21%** |
| slices ≥1 tie | 32.6% → **31.3%** | 47.5% → **46.0%** | 61.0% → **58.9%** | |
| slices ≥2 ties | 6.1% → **6.9%** | 16.1% → **15.5%** | 28.8% → **28.7%** | |
| slices ≥3 ties | 0.2% → **0.4%** | 4.2% → **4.3%** | 12.1% → **12.4%** | |

**Tie rate by rank drawn:** r1 15.6% → 15.1% · r2 13.2% → 12.4% · r3 12.6% →
14.6% · r4 5.5% → 12.3% · r5 16.1% → 15.1%. The per-rank rates barely move; the
*sample size* behind ranks 2–5 grows from ~650–1,000 to ~1,560–2,630 each,
which is why the earlier document's much lower late-rank rates (8.1–11.5% over
251 draws) do not reproduce — they were small samples.

**Tie rate by metric drawn** is byte-identical for all nine base stats
(`base_magic_resist` 38.52%, `movement_speed` 20.74%, `attack_range` 18.17%, …)
because composition draws the same base stats; only `ability_cooldown` moves,
**14.30% → 13.69%**.

**Be honest about the size of this.** Rank diversity was worth roughly **0.24
points** of the overall slice tie rate and **0.6 points** of the cooldown
family's own. The lever moved the thing it was aimed at — rank-1 share fell by
a factor of three — and it did **not** move the tie rate much, because after
the rank fix most of what remains is not a rank artefact. It is the base-stat
constants Riot shares across the roster: `base_magic_resist` alone is 38.5% ties
and, at 1,734 of 26,880 drawn questions, contributes about 2.5 points of the
13.2% on its own. **Tie policy is now a decision about shared base constants,
not about ranks**, and rank diversity has been spent.

### Everything that must not have moved

| | before | after |
|---|---|---|
| Candidate universe, all 14,878 pairs | 322,026 comparisons / 1,150,680 atomic | **byte-identical, 0 pairs differ** |
| Pairs generatable | 14,878 / 14,878, 0 errors | **14,878 / 14,878, 0 errors** |
| Cooldown comparisons drawn @ n=3/5/8 | 2,824 / 4,016 / 4,792 | **2,824 / 4,016 / 4,792** |
| Slices repeating `(subject, slot, metric)` | 0 / 0 / 0 | **0 / 0 / 0** |
| Slices repeating an ability slot | 0 / 0 / 0 | **0 / 0 / 0** |
| Longest same-metric run | 2 | **2** |
| Longest same-family run | 3 / 5 / 8 | **3 / 5 / 8** |
| Atomic fallback at n ≤ 8 | 0 slices | **0 slices** |
| Comparison-before-atomic violations | 0 | **0** |
| 4 salts ⇒ distinct slices, all 420 pairs | 4 | **4** |

The "longest same-family run = n" entries are the base-stat-only pairs — a
slice that *is* one family end to end because the pair has only one. The bound
the repetition policy actually states is `max_consecutive_same_metric = 2`, and
that holds at **2** in both arms.

**Determinism**: the same salt over 3 runs ⇒ 1 slice, and 3 processes at
different `PYTHONHASHSEED` values over 3 pairs × 4 salts ⇒ **1 distinct digest
set**, so the per-pattern hash is stable across processes.
**Symmetry**: `(a,b)` and `(b,a)` ⇒ identical `artifact_digest`,
`mastery_set_id` and step order, at four salts.
**Variation**: 4 salts give 4 distinct slices for **all 420** pairs at every
length, unchanged.

---

## 6. Tests

**New — `mastery/tests/test_gr1_matchup_rank_diversity.py`, 15 tests, all
passing.** Rules, never League content, and never a rank sequence: what is
asserted is the *shape* of the choice — proportionate to what is available,
varying with the seed, stable under it — and every shape is re-read off the
pool before it is relied on, so a balance patch fails the suite loudly instead
of quietly weakening it.

- no slot is *usually* met at its lowest published rank (stated as a **share**,
  because "some seed drew something else" was already true before the fix and
  would not have caught it)
- no published rank of a slot is unreachable
- the drawn distribution tracks availability, as a **ratio** — under 1.5×,
  against 3.0× before — because availability is data and may move
- one slice can span three or more ranks, which nothing in the 5,040-slice
  baseline ever did
- `_context_diverse_order` is a permutation, is deterministic, differs by seed,
  and leaves pattern order alone
- a single-variant pattern does not move
- the policy is off by default and absent from `to_dict()` when off
- Champion Mastery does not adopt it, and its artifacts still reproduce
- a request pinning `ability_rank` still resolves to exactly that rank **with
  the policy on**
- a flat cooldown is one candidate, states no rank, and still does
- no slice repeats a fact or an ability slot, and no atomic recall enters a
  short slice
- same seed ⇒ identical slice; 8 seeds ⇒ ≥4 distinct slices; reversed pair ⇒
  identical digest
- asked for its **whole** comparison pool, a pair returns exactly that pool —
  composition selects, it does not filter

**The suite fails at the defect.** With the one policy line flipped off in
`recipe.py`, **5 of the 15 fail** and 10 pass; with it on, 15 pass. The five are
the four behavioural ones plus the policy declaration.

**Suites run, compared against the base SHA `b9f7cd73` serially** (never in
parallel — concurrent runs against the shared `lol_calc.db` fabricate
failures):

| Suite | Base `b9f7cd73` | Branch `1f8f1de9` |
|---|---|---|
| `pytest mastery/tests` | 3 failed, **1,677** passed, 17 skipped | 3 failed, **1,692** passed, 17 skipped |
| 7 Ranked-Mastery integration files | 2 failed, 200 passed | **2 failed, 200 passed** |
| 8 presentation / media suites | 7 failed, 411 passed | **7 failed, 411 passed** |
| `test_footprint_guard_split.py`, against the real commit | 15 passed | **15 passed** |

**Every failure set is byte-identical between the two arms; zero introduced.**
They are the documented pre-existing ones: 2 × `test_audit_db`, the stale
`test_phase4f` format expectation, the 2 `test_mastery_ranked_capsule.py`
pinned ids/digests, and the 7 presentation/media failures the previous pass
already proved pre-existing. **No unrelated historical failure was repaired.**

**Footprint.** No guard list changed. All three runtime files are already
inside `SLICE_FOOTPRINT` — `mastery/manifest/` and `mastery/tests/` via
`MASTERY_PACKAGES`, `mastery/synthesis/` via `GR1_PACKAGES` — so
`GR1_RUNTIME_FILES`, `GR1_PACKAGES`, `MASTERY_FOOTPRINT`,
`RANKED_BUILDER_FOOTPRINT`, `BANNED_PREFIXES` and `SHARED_INTEGRATION_FILES`
are all untouched and **no other workstream's boundary moved**.

---

## 7. Why the frontend did not change

The rank clause is already on the wire and already rendered: the previous pass
put `" at rank N"` into `_comparison_context_clause` and
`formatComparisonSemantics.ts` reads `context.abilityRank` for whatever value
it holds, with the flat case omitting it. This pass changes **which** value
arrives, not its shape, its presence, or its absence for a flat pair — and
`formatComparisonSemantics.test.ts` already covers a *varying* rank clause.
No presentation change was required and none was made.

---

## 8. What deploying this changes

A generated Matchup slice asks its comparisons at the rank the seed chose
rather than at rank 1. Generated `mastery_set_id`s and `artifact_digest`s for
**Matchup move**, because the composition they identify changed — the same
thing Phase 3 and the rank-identity pass did. Champion Mastery and
applied-chain identities are **unaffected**, asserted by the suites above.

The reachable surface is still admin-bot matches and the Generator Lab: no
public Ranked format names `mastery_slice` and all 29 stored configs are
`target='admin_bot'`. **Zero DDL**, no migration, nothing to sequence. Segments
frozen before the deploy are unaffected — the new policy field is
absent-means-off on both sides of the wire.

---

## 9. Remaining Matchup blockers

1. **Ties** — still open, and now a decision about **shared base constants**
   rather than ranks. `base_magic_resist` at 38.5% is a third of the remaining
   slice tie rate on its own; rank diversity is spent, and the next lever costs
   content or policy. *Open — owner decision.*
2. **The comparative cost and level-stat families** — still `family_unmapped`,
   still 404,023 candidates, still two live renderer branches with no content.
   *Open — family-contract workstream.*
3. **Manaless mana regeneration** — 3,553 pairs (23.9%). *Open — documented,
   still deliberately not fixed.*
4. **The dual-form row split** — why 1,480 pairs are base-stat-only.
   *Open — CHAMPDATA.*
5. **The Lab coverage headline** still leads with `total_candidates`.
   *Open — small.*
6. **No fresh screenshot.** Not attempted this pass; the Phase 5 Matchup
   capture remains the reference and now predates three passes.
