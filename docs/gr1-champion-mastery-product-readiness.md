# GR1 — Champion Mastery product readiness

> Implementation pass over the findings in
> [`gr1-champion-mastery-capability-audit.md`](./gr1-champion-mastery-capability-audit.md).
> Nothing here re-audits Champion Mastery; nothing here touches Matchup or Applied-chain.
> Screenshots: `docs/audits/gr1-champion-mastery-readiness/` (6 PNGs, real Admin Generator Lab).

**Bases.** Backend `origin/master` **`f6d61632`**; branch `gr1/champion-mastery-product-readiness`
@ **`ce9ae8f6`**, one commit, clean fast-forward (`HEAD~1 == origin/master`).
Frontend `origin/main` **`ec9c8bbd`** at the start; upstream moved one commit during the pass
(`6eafd998`, POINT1 Daily scoring — **zero file overlap** with the seven files changed here), the
branch was rebased onto it anyway and the suites re-run afterwards. Frontend branch
`gr1/champion-mastery-product-readiness` @ **`84aaf5a1`**, one commit, clean fast-forward
(`HEAD~1 == origin/main == 6eafd998`).

**Neither branch is pushed.** `origin/master` auto-deploys to Railway and `origin/main` is what
Lovable publishes from, so both pushes are owner actions:

```bash
git -C /Users/macmoney/lcs-wt-gr1-prod  push origin gr1/champion-mastery-product-readiness:master
git -C /Users/macmoney/mogsy-wt-gr1-prod push origin gr1/champion-mastery-product-readiness:main
# then press Publish in Lovable — a push alone does NOT deploy the frontend
```

**Scope held.** The four servable families are unchanged (`ability_cooldown_rank`,
`ability_cooldown_flat`, `ability_cost_rank`, `champion_stat_level`). `champion_base_stat` is
still unmapped, flat ability cost still stranded, `dual_form_row` / `nonstandard_rank_count`
still held, difficulty still unbuilt, source authority / persistence / the Lab's design
unchanged, public Ranked still serves no Mastery.

---

## 1. Terminology — the level-stat prompt no longer asserts something false

`champion_stat_at_level` asks for `base + growth × level multiplier`. The prompt rendered
`humanizeMetric(metric)` over the canonical slug, so it read **"At level 18, what is Aatrox's
Base Armor?"** — answer 120, while Aatrox's base armor is 38. All 3,482 candidates, all 173
champions.

**Fix: wording only.** `statName()` in `formatPromptSemantics.ts` drops the `base_` qualifier
for the level template. The metric slug is untouched everywhere — it is the identity the fact,
the candidate key, the grader and the provenance all travel under, and renaming a canonical
field to fix a sentence would break identity to fix presentation.

| metric | before | after |
|---|---|---|
| `base_armor` | Base Armor | **Armor** |
| `base_attack_damage` | Base Attack Damage | **Attack Damage** |
| `base_magic_resist` | Base Magic Resist | **Magic Resist** |
| `base_health` | Base Health | **Health** |
| `base_mana` | Base Mana | **Mana** |
| `base_health_regen` | Base Health Regen | **Health Regen** |
| `base_mana_regen` | Base Mana Regen | **Mana Regen** |

Those seven are the whole servable level-scaled set (verified against the live pool: 519 / 519 /
519 / 519 / 435 / 498 / 473 = 3,482). Attack speed, movement speed and attack range are not
level-servable and were not touched. `champion_base_stat` — where "base" IS true — keeps it,
and its latent **"base Base Armor"** double-qualifier is fixed at the same time.

**The media chip agreed to the same claim.** `METRIC_LABELS` is the shared vocabulary every
pooled Ranked question draws its chip from, so the chip read `BASE MR` over a level-18 MR
question. The table is untouched; `presentation_render._stat_badge` drops the qualifier at the
one place both the metric and the stated level are known. A base-stat question elsewhere still
reads "Base Armor".

**A unit is now words.** Exposing the real input contract (§5) put `per_5_seconds` beside the
answer box. `playerFormat.unitLabel` renders underscores as spaces — `per 5 seconds`,
`attacks per second`, `magic resist` — one rule, no per-unit table to keep in step.

## 2. Ability names

`bank._ability_name()` was literally `return slot`, so every prompt read "Aatrox W" while the
media band above it printed INFERNAL CHAINS. Affects 2,180 cooldown + 1,028 cost candidates.

The name now comes off `ChampionFactSet.ability_name(slot)`, populated from the SAME
`champion_abilities` read the ability facts came from — no second lookup, no second authority,
and no new presentation code: `abilityLabel()` in the renderer already knew how to render a
parenthetical and already dropped it when the name was just the slot again.

> before `At rank 4, what is Aatrox W's cooldown, in seconds?`
> after  **`At rank 4, what is Aatrox W (Infernal Chains)'s cooldown, in seconds?`**

The slot is kept, as asked. An unnamed slot still falls back to the slot letter — the pre-phase
sentence exactly, never a blank. **Identity is unaffected**: `candidate_key` is keyed on the
slot and is asserted not to contain the name.

## 3. Cost questions name their resource

"At rank 3, what does Ahri Q cost?" is ambiguous between three resources, and Lee Sin's energy
costs read identically to Ahri's mana ones.

`PromptSemantics.resource` is the fact's own `unit`, inverted through
`COST_RESOURCE_UNIT` — the certified value the projection already read from
`champion_abilities.cost_resource`, not a second judgement. **Fail-closed**: a cost candidate
whose resource cannot be named is refused (`COST_RESOURCE_UNNAMEABLE`) rather than guessed.

> after **`At rank 3, how much mana does Ahri Q (Orb of Deception) cost?`**
> after **`How much energy does Lee Sin Q (Sonic Wave) cost?`**

**The gate costs nothing**, and that is measured rather than assumed: the servable corpus is
**6,690 before and 6,690 after** (cooldown 2,180 / level-stat 3,482 / cost 1,028, 173/173
champions, min 19 / max 54) — every servable cost already carried a certified resource. A
regression test pins the 1,028.

## 4. Repetition — prefer a fact the slice has not asked yet

Phase 3 fixed category monoculture; the audit found the same *fact* re-asked at another rank
(Alistar n=8 was six Alistar Q; Aatrox n=3 was W cooldown at ranks 4 and 5).

Two changes, both stating the same notion of "same fact" the sequencer already had
(`resolver._pattern_group` = `champion : subject_ref : metric`, rank and level dropped):

1. **Selection** (`resolver._select_for_request`) walks the seeded rotation twice — once taking
   only unseen patterns, once taking the remainder. The `used_patterns` set is threaded across
   the WHOLE plan, so "different fact first" is a property of the slice, not of one category.
2. **Allocation** (`recipe.allocate` + `distinct_facts_by_category`) round-robins the budget
   over each category's DISTINCT FACT count first, then over raw counts. Ahri's one servable
   cost ability used to win three of eight questions; it now wins one.

Neither can shrink a slice: the second pass is the whole remainder, so a thin pool fills exactly
as far as it filled before and `InsufficientQuestionsError` fires in exactly the same place.
Omitting `distinct_counts` reproduces the pre-phase allocation byte for byte, which is what
keeps **Matchup untouched**.

A third change was needed to keep Phase 3's win: shifting budget toward the deep level-stat
category produced family runs of 3, invisible to both existing passes (seven stats are seven
metrics and seven pattern groups). `_interleave_by_key` — `_interleave_by_metric` generalised —
now also bounds the CATEGORY run at `max_consecutive_same_metric`, and gained a second move
(insert backward) because the old forward-only pull could never fix a run at the tail.

### Measured, 519 slices per length (173 champions × 3 seeds), real generator output

| Metric | n=3 | n=5 | n=8 |
|---|---|---|---|
| Slices repeating a **`(metric, subject_ref)`** | 113 (21.8%) → **0 (0%)** | 498 (95.9%) → **0 (0%)** | 519 (100%) → **24 (4.6%)** |
| Slices repeating an **ability slot** | 214 (41.2%) → **116 (22.4%)** | 493 (95.0%) → **280 (54.0%)** | 502 (96.7%) → **381 (73.4%)** |
| Slices with a family run of **3+** (excl. the 15 single-family) | 0 → **0** | 0 → **0** | 36 → **0** |
| Questions generated | 1557 → **1557** | 2595 → **2595** | 4152 → **4152** |

A repeated *slot* is not a repeated fact — "Ahri Q's cooldown" and "Ahri Q's cost" share a slot
and are different questions — which is why that row falls without reaching zero.

**The residual 24 is exactly the thin pools.** Eight champions, three seeds each, and every one
is an upstream hold: the five single-family champions (`aphelios`, `elise`, `jayce`, `nidalee`,
`udyr`) plus three form-changers (`gnar`, `lee-sin`, `reksai`). Where alternatives exist, there
is no repetition; where they do not, the slice still generates rather than failing.

**Determinism preserved.** Same seed ⇒ identical artifact (verified ×2 for six champions);
different seed ⇒ different slice (6/6).

## 5. Presentation wiring

| Defect | Fix |
|---|---|
| **`toPlayerQuestion` hardcoded `patchDisplay: ""`**, and `patchLabel("")` returns the literal **`"Fixed scenario"`** — badged on every question, in the arena and the Lab, over a question generated minutes earlier from League 26.16 | The label was always computed (Phase 2, canonical `league_patches`) and always stamped on the artifact; it never crossed this wire. `patch_display` is now frozen onto each public challenge and read by the adapter. Badge now reads **`Patch 26.16`**. |
| **`inputConstraints` synthesized all-empty**, discarding what `_numeric_constraints` computes — so a player saw a bare box with no unit and no precision instruction while the grader held `8.076250000000002` | `input_constraints` is frozen onto each NUMERIC public challenge from **the same function the standalone player's projection calls**, and read with **the same reader** (`readNumericConstraints`, now exported). No second constraints model, no second interpretation. |
| **`MasteryAssetsProvider` mounted only by `MasteryPlayerLive`**, so the slice path drew the grey initial-letter disc | Mounted on `MasterySliceChallengeSurface` — the ONE shared surface, so the arena and the Lab both get it and the number of champion-image paths stays at one. The provider module-caches the manifest and resolves through the existing `getChampionIcon`. |

Both new wire fields are **absent-means-unknown**: a segment frozen before this phase carries
neither, reads as `null`, and renders exactly as it already rendered. Added to
`PUBLIC_CHALLENGE_FIELDS`, so review and every historical path see them too.

**On the latent `championDisplay.toLowerCase()` id.** It is real (`"lee sin"` where the
canonical id is `lee-sin`) and it does not bite, because the call also passes
`displayName={ps.championDisplay}` and the provider resolves on the display name. Left as-is
rather than "fixed" blind — a portrait-resolution change is not a presentation-wiring change.

## 6. Tests

| Suite | Result |
|---|---|
| `pytest mastery/tests` + the 5 Ranked-Mastery integration files | **1762 passed, 17 skipped, 3 failed** — exactly the documented pre-existing set (2× `test_audit_db`, 1× `test_phase4f` stale format expectation). **Zero introduced.** |
| `mastery/tests/test_gr1_champion_mastery_product_readiness.py` (**new**, 41 tests) | **41 passed** |
| 7 RR1 / QUIZ1 presentation suites | **169 passed, 1 failed** — `test_every_ranked_pool_family_is_declared`, which **fails identically at the base SHA** |
| `vitest` mastery + ranked-core + ranked-public (78 files) | **898 passed** |
| `formatPromptSemantics.test.ts` (**new**, 25 tests) | **25 passed** — the file that writes every player-facing sentence had **no test file at all**, which is how "Base Armor" shipped |
| `masterySlicePresentation.test.ts` (**new**, 9 tests) | **9 passed** |
| `tsc --noEmit` | zero errors in any file this pass touched |

**Two existing tests were changed, both because their proxy was wrong rather than their rule:**

* `test_synthesis_question_uniqueness._patterns` was `(prompt-prefix, family)`, which matched
  for an ability question but collapsed all seven of a champion's level-scaled stats into one
  pattern — reporting two DIFFERENT stat facts adjacent as a repeat. It now reads the same
  `(subject_ref, metric)` key the resolver enforces.
* `test_rr1_mastery_presentation` asserted the chip says `"Base Armor"` for a premise that
  **states `champion_level: 9`** — the defect itself, written down. Now `"Armor"`; the
  no-level case is asserted in the new suite.

## 7. Test-isolation finding — investigated, NOT fixed, and it is not what the audit thought

The audit reported `test_ranked_mastery_artifact_persistence.py::test_one_semantic_question_…`
failing when `test_ranked_mastery_reveal_e2e.py` runs first.

Measured at both SHAs, five runs each of the same ordered pair:

| | base `f6d61632` | this branch |
|---|---|---|
| `reveal_e2e` then `artifact_persistence` | 4 pass, **1 fail** | **1 fail**, 4 pass |

* The failing test is `test_review_is_unchanged_after_the_canonical_data_moves`, **not** the one
  the audit named.
* It is **intermittent (~1 in 5), not order-deterministic** — the same command passes and fails
  across identical runs.
* It reproduces **identically at the base SHA**, so this pass neither causes nor fixes it.
* The mechanism is the suite's own `_shift_cooldowns` helper monkeypatching
  `bank_module.project_champion` against module-level generator state — **no file this pass
  touches is involved**, and the five Ranked-Mastery suites pass **104/104** in natural order.

Left for a separate test-infrastructure task, as instructed. Not expanded into fixture cleanup.

## 8. Screenshots

`docs/audits/gr1-champion-mastery-readiness/` — 6 PNGs, all end-to-end through the real Admin
Generator Lab against a local backend serving the canonical database, via the real
`MasterySliceChallengeSurface` the arena renders. Reaching `/admin/ranked/generator-lab` needed
a throwaway local swap of `components/AdminRoute` (its Supabase-admin guard redirects to `/`;
the `X-Admin-Key` fallback authorizes the backend but not the route). Every rendering file was
the real one and the harness was reverted after capture.

| File | Shows |
|---|---|
| `gr1r-01-aatrox-cooldown-and-level-stat` | cooldown question with the ability named; level-stat question; `Patch 26.16`; free-input unit |
| `gr1r-02-ahri-ability-cost-resource` | **ability-cost question naming mana**; 5 distinct facts; portraits |
| `gr1r-03-lux-level-stat-terminology` | level-stat wording across a mage |
| `gr1r-04-aphelios-low-coverage` | a **one-family champion**: 5 questions, 5 distinct stats, no repeats |
| `gr1r-05-caitlyn-three-question-slice` | a **diversified 3-question slice** |
| `gr1r-06-ornn-eight-question-slice` | n=8 on a tank |

## 9. Remaining Champion Mastery limitations

1. **Five champions remain one-family** (`aphelios`, `elise`, `jayce`, `nidalee`, `udyr`), and
   three more (`gnar`, `lee-sin`, `reksai`) have a single-fact cooldown category. Upstream
   `dual_form_row` / `nonstandard_rank_count` holds; the owner decision (split dual-form rows in
   `champion_abilities`) is CHAMPDATA/Patch Ops, unchanged by this pass.
2. **Explanations still teach nothing** — 100% are a restatement of the answer. Untouched:
   it is content design, not a defect.
3. **Distractors still leak compositionally** where two ranks of one ability do co-occur — now
   only in the thin pools above.
4. **`champion_base_stat` is still 0 servable** and flat ability cost 0. Family-contract policy.
5. **Difficulty is still a restatement of the category** and participates in nothing. Do not
   build it yet.
6. **`mastery/serving/attempts.py` is still fail-soft**, so analytics loss is silent.
7. **NEW, and newly visible**: a manaless champion can be asked its **mana regen at level N**
   (answer 0) — e.g. Aatrox, whose `base_mana_regen` row survives the resource gate. It is a
   fact projection/serving-policy question, not a wording one, and was out of scope here.
8. **The live Ranked arena is still unphotographed.** Both surfaces share one renderer, so this
   is an argument from identity, not a photograph — the same caveat the audit carried.
