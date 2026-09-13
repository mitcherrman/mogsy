# GR1 — Matchup Mastery capability audit

**Audit only. Nothing was implemented, no generator behaviour was changed, Champion Mastery
was not touched, Applied-chain was not touched, and public Ranked was not enabled.**

| | |
|---|---|
| Date | 2026-09-13 |
| Backend base | `League_Combat_Simulator` `origin/master` @ **`c4f08761`** |
| Frontend base | `mogsy` `origin/main` @ **`33d27b2f`** |
| Scope | `mastery_mode: matchup` only |
| Reused, not re-derived | GR1 Phase 1–5 decisions and the Champion Mastery audit + readiness pass |

Both GR1 branches the handoff listed as unpushed are **now on their targets**: backend
`gr1/champion-mastery-product-readiness` landed as `36cfef96` (ancestor of `origin/master`),
frontend `84aaf5a1` is an ancestor of `origin/main`. Every file on the Matchup render path is
**byte-identical** between `84aaf5a1` and `33d27b2f` (`git diff` over `src/features/mastery`,
`src/pages/admin/ranked`, `MasterySliceChallengeSurface.tsx`, `masterySliceModule.tsx`,
`src/lib/question-surface`, `src/components/question-surface` is empty).

---

## 0. How the evidence was produced

Five instruments, all against the real canonical database, all read-only:

1. **Pair sweep** — the real pipeline
   (`identity → preflight_matchup → project_champion ×2 → compose_matchup → publication_gate
   .evaluate → dedupe_by_effective_question`) over **all 14,878 champion pairs**, 173/173
   champions, 0 projection failures, 157 s.
2. **Composition probe** — the real `mastery.synthesis.service.synthesize_matchup_mastery` over
   a stratified **418-pair sample** (40 thinnest + 40 richest + 40 tie-heaviest + 300 random,
   seed `20260912`) × {3, 5, 8} questions × {no salt, `s1`, `s2`, `s3`} = **5,016 real generated
   slices, 0 errors**.
3. **Rank-collapse probe** — every effective-question collision group across all 14,878 pairs,
   asking whether the members agree on the answer.
4. **Correctness probe** — served comparison values re-derived from `champion_stats` and
   `champion_abilities` directly, over 60 random pairs.
5. **Live backend** — the real `api_server:app` at `c4f08761` serving the canonical DB, driven
   through `POST /api/ranked/admin/mastery-slice/{preview,coverage}` — the same endpoints the
   Admin Generator Lab calls.

**Two disclosures.**

* The backend at `c4f08761` does not start on this machine: `api_server.lifespan` runs
  `ensure_ability_components(strict=True)` and the local `lol_calc.db` snapshot fails it on
  Kalista E / Varus W component rows — a **Patch Ops data item with no Mastery code path**. A
  throwaway launcher in the scratchpad ran the real `api_server:app` with that one unrelated
  gate relaxed. Nothing in the repo was modified.
* **Screenshots were not captured.** The browser tools and the Playwright harness were refused
  by the session's permission classifier. Everything in §7 below is read from the real
  renderer source plus the real wire payloads the live backend returned, and is labelled as
  such — it is not a screenshot, and §7 says exactly what a capture would still add.

---

## 1. The exact current question universe

### 1.1 What Matchup Mastery can generate

The matchup universe is **comparisons + BOTH sides' own atomic recall banks**
(`mastery.synthesis.service.eligible_matchup_pool`). It is one composer
(`mastery/matchup/composer.py`) with **no per-metric branch**: it indexes both champions'
facts by `(metric, subject_ref, context)`, intersects them, and asks
`mastery.facts.comparison.comparable()`.

**Comparison families — 4 declared, exactly 2 servable.**

| Category | Template | `family_hint.quiz_family_id` | Servable | Canonical facts behind it |
|---|---|---|---|---|
| `ability_cooldown` | `compare_ability_cooldown` | `ability_cooldown_compare` | **YES** | `champion_abilities.cooldown`, arbitrated by the wiki cooldown artifact |
| `champion_base_stat` | `compare_champion_base_stat` | `champion_stat_compare` | **YES** | `champion_stats` (hp, mp, armor, magic_resist, ad, move_speed, attack_range, hp5, mp5) |
| `ability_cost` | `compare_ability_cost` | **`None`** | **NO** — `family_unmapped` | `champion_abilities.cost` |
| `champion_level_stat` | `compare_champion_stat_at_level` | **`None`** | **NO** — `family_unmapped` | `champion_stats` base + growth, at levels 6/11/18 |

The two unmapped ones fail closed at `mastery/publication_gate/policy.py` because
Mogzy's family vocabulary has no comparative cost family and no comparative level-stat family
(`_HINT_COST_COMPARE` / `_HINT_LEVEL_STAT_COMPARE` say so in the composer's own words). The
**frontend already has phrasings for both** (`COMPARISON_TEMPLATES` in
`comparisonSemantics.ts`, both branches in `formatComparisonPrompt`), so two of the four
renderer branches are dead code today.

**Atomic families** (both sides' banks, unchanged from Champion Mastery): `ability_cooldown`,
`ability_cost`, `champion_level_stat`. `champion_base_stat` is unservable as atomic recall
roster-wide — the asymmetry the handoff already records.

### 1.2 Raw → policy-accepted → servable, roster-wide (14,878 pairs)

| Stage | Comparisons | Atomic | Note |
|---|---|---|---|
| **Raw** (composer output) | **726,049** | — | mean 48.8 per pair |
| **Policy-accepted** | **322,026** (44.4%) | — | 404,023 rejected, **100% `family_unmapped`** |
| **Servable** (after `dedupe_by_effective_question`) | **174,970** (24.1% of raw) | **1,150,680** | mean 11.8 / 77.3 per pair |

**Rejections by family** — a single reason, roster-wide:

| Family | Raw | Policy-accepted | Servable |
|---|---|---|---|
| `ability_cooldown` | 192,562 | 192,562 | **45,506** (−147,056 to dedupe) |
| `champion_base_stat` | 129,464 | 129,464 | **129,464** (0 lost) |
| `champion_level_stat` | 299,124 | **0** | 0 |
| `ability_cost` | 104,899 | **0** | 0 |

**Skipped before policy** (the composer's own reasons, 234,403 total):
`no_counterpart_fact` 176,652 · `collapsed_flat_comparison` 48,800 · `semantic_mismatch` 7,471 ·
`ambiguous_operand` 1,480.

### 1.3 The single biggest number in this audit

**76.4% of the policy-accepted cooldown comparison universe is destroyed by dedupe**, and the
cause is one missing clause in one f-string.

`mastery/manifest_session/adapter._comparison_prompt_and_explanation` builds the prompt as:

```python
prompt = f"{subject_a} vs {subject_b} — {ps.metric}"   # ← no context
```

`effective_question_key` is `(interaction_kind, prompt, answer_type, options)`. Because the
prompt omits the rank, **"Aatrox Q vs Akali Q — ability_cooldown" at ranks 1, 2, 3, 4 and 5 is
one effective question**, and four of the five are discarded. The atomic-recall path does not
have this problem: its prompt states the rank.

### 1.4 What exists upstream but is unservable

| Upstream fact | Why it never reaches a player |
|---|---|
| 299,124 level-stat comparisons | no comparative level-stat family in `quiz/family_contract.py` |
| 104,899 cost comparisons | no comparative cost family |
| 147,056 non-rank-1 cooldown comparisons | collapsed by a rank-silent prompt (§1.3) |
| 1,150,680 atomic candidates | reachable in principle, **never drawn at n ≤ 8** (§3) |

---

## 2. Pair coverage

**14,878 of 14,878 pairs are generatable. Zero errors. Zero pairs with no comparison.**

| Per pair | min | p10 | median | p90 | max | mean |
|---|---|---|---|---|---|---|
| **Servable comparisons** | **8** | 10 | **12** | 13 | **13** | 11.8 |
| Servable atomic | 38 | 63 | 78 | 91 | 108 | 77.3 |
| Total servable | 47 | 73 | 90 | 103 | 121 | 89.1 |
| Ties among the comparisons | 0 | 0 | **1** | 3 | **9** | 1.4 |

The comparison pool is **hard-capped at 13** — 4 ability slots (one surviving rank each) plus
at most 9 base stats. There is no pair anywhere on the roster with 14.

### Thin pairs, and why — source/policy evidence, not guesses

The 10 thinnest pairs all have **8 comparisons and `cmp_cats == ['champion_base_stat']`** —
i.e. **zero ability comparisons at all**:

```
aphelios×gnar 8 · aphelios×reksai 8 · elise×gnar 8 · elise×reksai 8 · gnar×jayce 8
gnar×nidalee 8 · gnar×udyr 8 · jayce×reksai 8 · nidalee×reksai 8 · reksai×udyr 8
```

Every champion in that list is one of the **six** the Champion Mastery audit already identified
as ability-comparison-incapable: `aphelios`, `elise`, `gnar`, `jayce`, `nidalee`, `reksai`,
`udyr`, `lee-sin`. The cause is upstream and **correct**: `dual_form_row` and
`nonstandard_rank_count` holds in `quiz/ability_question_eligibility.py`. A transforming
champion's `champion_abilities` row conflates two forms, so no rank-indexed cooldown fact is
certifiable, so the composer's index has no counterpart to intersect. It is not a Matchup bug,
and widening the hold would ship ambiguous questions.

Those pairs also sit at 8 rather than 9 comparisons because at least one side is **manaless** —
`base_mana` is absent, so the base-stat intersection is 8 metrics, not 9.

**Unusual pairs.** `aphelios × gnar` and `aphelios × reksai` have the smallest total pool on the
roster (47). The richest are every `ahri × …` pair at 13 comparisons — Ahri is a
four-standard-ability, mana-using champion with a complete `champion_stats` row, which is the
maximum the current families allow.

---

## 3. Composition behaviour

5,016 real slices, 418 pairs, n ∈ {3, 5, 8}, 4 salts.

| Measure | n=3 | n=5 | n=8 |
|---|---|---|---|
| Slices repeating a `(subject, slot, metric)` pattern | **0 / 1672 (0.0%)** | **0 / 1672 (0.0%)** | **0 / 1672 (0.0%)** |
| Slices repeating an ability slot | **0 (0.0%)** | **0 (0.0%)** | **0 (0.0%)** |
| Longest same-family run | 2 | 2 | 2 |
| Comparison questions | **100%** | **100%** | **100%** |
| Atomic fallback used | **0 slices** | **0 slices** | **0 slices** |
| Comparison-before-atomic order violations | 0 | 0 | 0 |

**The Phase 3 + readiness composition work carries to Matchup and holds.** Same-fact repetition
— the defect the Champion readiness pass existed to fix — is **already zero for Matchup at
every realistic length**, because `mastery.manifest.resolver._select_for_request` threads
`used_patterns` across the whole plan and that change is mode-agnostic.

**Atomic recall is unreachable in practice.** Spill begins exactly at pool exhaustion and not
before: `ahri × syndra` (12 comparisons) is all-comparison at n=12 and puts its first atomic at
index 12 when asked for 13; `gnar × reksai` (9) spills at n=10. Comparisons always lead.
So the answer to "what percentage are comparative vs fallback atomic" is **100 / 0** for every
slice length the product would plausibly use, and the atomic half of the universe is dead
weight below n ≈ 9–14.

**The one un-ported half of the readiness fix.** `recipe.synthesize_champion_manifest` passes
`distinct_facts_by_category(...)` into `_plan`; `synthesize_matchup_manifest` passes **nothing**
for either of its two `_plan` calls. It costs nothing at n ≤ 8 (nothing repeats anyway) and
bites only in the atomic tail:

```
ahri×syndra  n=30 : 3 repeated patterns, worst = Syndra W ability_cost ×3
aatrox×akali n=30 : 4 repeated patterns, worst = Akali Q ability_cost ×5
gnar×reksai  n=16 : 2 repeated patterns, worst = Rek'Sai R ability_cooldown ×3
```

### Determinism and seed variation — verified

| Property | Result |
|---|---|
| Same salt, 3 runs, 5 pairs | **1 distinct slice each** — deterministic |
| `(a,b)` vs `(b,a)`, same salt | **identical `artifact_digest`** for all 5 pairs |
| 12 salts, n=5 | 6–11 distinct slices per pair (`hwei×lux` 11/12, `lee-sin×udyr` 6/12) |
| Over the 418-pair sample, 4 salts | 254 pairs give 4 distinct slices, 148 give 3, 16 give 2 |

Salt collisions rise as the pool narrows — a 9-candidate pool asked for 8 has very little room
to differ, which is a coverage consequence, not a seeding bug.

---

## 4. Tie quality — quantified, not removed

**Roster-wide: 20,296 of 174,970 servable comparisons are ties — 11.6%.**
**In actual short slices it is worse, because ties concentrate in the metrics short slices
prefer:**

| | n=3 | n=5 | n=8 |
|---|---|---|---|
| Tie questions / all questions | **14.5%** | **14.8%** | **15.2%** |
| Slices with ≥1 tie | **35.5%** | **50.1%** | **64.4%** |
| Slices with ≥2 ties | 7.5% | 18.0% | **31.1%** |
| Slices with ≥3 ties | 0.5% | 5.3% | **15.5%** |

**Which metrics produce ties** (tie count / comparisons of that metric):

| Metric | Ties | Total | Tie rate |
|---|---|---|---|
| **`base_magic_resist`** | 5,845 | 14,878 | **39.3%** |
| `movement_speed` | 2,739 | 14,878 | **18.4%** |
| `attack_range` | 2,333 | 14,878 | **15.7%** |
| `ability_cooldown` | 4,498 | 45,506 | 9.9% |
| `base_mana_regen` | 1,389 | 14,878 | 9.3% |
| `base_health_regen` | 1,114 | 14,878 | 7.5% |
| `base_attack_damage` | 757 | 14,878 | 5.1% |
| `base_armor` | 692 | 14,878 | 4.7% |
| `base_health` | 616 | 14,878 | 4.1% |
| `base_mana` | 313 | 10,440 | 3.0% |

No metric is tie-free.

### The cause is structural, and it is two things

**(a) Riot's own design uses shared constants.** Base magic resist is 32 or a small set of
values for most of the roster; movement speed is 325/330/335/340/345; melee attack range is
125/175. A comparison on those axes is a coin flip with a "Tie / Same" button, and the correct
answer is Tie 39% of the time for MR.

**(b) Every cooldown comparison is served at rank 1, where cooldowns are equal by convention.**
This is the same defect as §1.3, seen from the other side. Ultimates share 120 s at rank 1;
basic abilities share 20 s, 14 s, 16 s. The rank-1 survivor of the dedupe is precisely the rank
where two kits are most likely to agree. **The user's reported example is exactly this**:

```
Aatrox R vs Akali R — served answer TIE  (rank 1: 120 vs 120)
                      rank 2:  100 vs 90  → Akali
                      rank 3:   80 vs 60  → Akali
Aatrox W vs Akali W — served answer TIE  (rank 1:  20 vs 20)
                      ranks 2-5: Aatrox at every one
```

**Do tie-heavy slices reduce usefulness?** Yes, measurably: at n=8, **31.1% of slices ask the
player to identify "these are the same" two or more times**, and 15.5% three or more. A tie
question teaches nothing about either champion and offers a 1-in-3 guess; a slice with three of
them is mostly a coin-flip round. **No ties were removed, per instruction.**

---

## 5. Prompt quality — every served shape, in full

All 10 distinct player-facing comparison shapes, from real payloads. The rendered sentence is
the literal template in `src/features/mastery/interactions/formatComparisonSemantics.ts`
applied to the backend's own `comparison_semantics`.

| Backend prompt | **What the player reads** | Reveal explanation |
|---|---|---|
| `Aatrox Q vs Akali Q — ability_cooldown` | *Which has the shorter cooldown: Aatrox Q or Akali Q?* | Aatrox Q: 14 seconds. Akali Q: 1.5 seconds. Akali wins by 12.5 seconds. |
| `Aatrox vs Akali — base_attack_damage` | *Which has more base **Base Attack Damage**: Aatrox or Akali?* | Aatrox: 60 **attack_damage**. … |
| `Aatrox vs Akali — base_armor` | *Which has more base **Base Armor**…* | … 38 armor … |
| `Aatrox vs Akali — attack_range` | *Which has more **base** Attack Range…* | … 175 units … |
| `Aatrox vs Akali — base_health_regen` | *Which has more base **Base Health Regen**…* | … 3 **per_5_seconds** … |
| `Aatrox vs Akali — base_health` | *Which has more base **Base Health**…* | … 650 **hitpoints** … |
| `Aatrox vs Akali — base_magic_resist` | *Which has more base **Base Magic Resist**…* | … 32 **magic_resist** … |
| `Aatrox vs Akali — movement_speed` | *Which has more **base** Movement Speed…* | … 345 **units_per_second**. Tie. |
| `Aatrox vs Akali — base_mana_regen` | *Which has more base **Base Mana Regen**…* | Aatrox: **0** per_5_seconds. Akali: 50 … |
| `Ahri vs Syndra — base_mana` | *Which has more base **Base Mana**…* | … 418 mana … |

### The defects, ranked

1. **No ability is ever named.** "Aatrox Q or Akali Q?" — the slot is the whole label. This is
   the exact defect the Champion Mastery readiness pass fixed for atomic recall
   (`bank._ability_name` now reads `ChampionFactSet.ability_name(slot)`), and Matchup did not
   get it. `abilitySubjectLabel` in `formatComparisonSemantics.ts` is `${champion} ${slot}`.
   A same-slot comparison has **two** names, so this is not a one-line copy of the Champion
   fix — it needs a two-name phrasing.
2. **No rank is ever stated, and the answer depends on it.** `context.abilityRank` is on the
   wire (always `1`) and `formatComparisonPrompt` uses `context.championLevel` for the level
   template but ignores `abilityRank` for the cooldown and cost templates. See §6.
3. **"more base Base X" — the double qualifier**, on **7 of the 10 shapes**. The template
   hardcodes `base ` and then `humanizeMetric("base_armor")` re-emits it. Attack range and
   movement speed get the inverse error: they are prefixed "base" although neither has a
   base/scaled distinction.
4. **Raw unit slugs in the player-visible reveal**: `per_5_seconds`, `units_per_second`,
   `attack_damage`, `magic_resist`, `hitpoints`. The reveal is post-submission but it is
   player-facing prose.
5. **Comparative direction is stated and is correct** — "shorter cooldown", "costs less", "more"
   — and the module docstring justifies it as a property of the metric family, not of these two
   values. No leak.
6. **"Which champion" is never ambiguous** — options are the two ids with the display names as
   labels and a third `tie` token rendered "Tie / Same", always three, regardless of whether
   this comparison is a tie.
7. **The segment title echoes the caller's order while the questions use canonical order.**
   Config `(syndra, ahri)` produces the header *"Mastery Slice: Syndra vs Ahri"* over questions
   that all read *"Ahri W vs Syndra W"*. Same digest, same content — only the header disagrees.
8. **Internal taxonomy does not leak.** The backend `prompt`
   (`"Aatrox vs Akali — base_armor"`) and `question_family` both cross the wire and
   `ComparisonQuestionView` renders `formatComparisonPrompt(cs)` instead. The word `Comparison`
   IS rendered to players, as the corner chip.

---

## 6. Correctness and source authority

### 6.1 Values — clean

Re-derived from the canonical tables over 60 random pairs:

| Check | Result |
|---|---|
| Base-stat comparison values vs `champion_stats` | **517 / 517 exact** |
| Base-stat declared winner vs the arithmetic | **517 / 517 agree** (tie iff equal) |
| Cooldown comparison values vs `champion_abilities.cooldown` | **325 / 325 exact** (23 more not machine-parseable by the probe's naive parser — a probe limit, not a finding) |

**Zero value defects found.** No second source system was created; every check reads the same
tables the composer reads.

### 6.2 The rank-silent prompt IS a correctness defect

Across all 14,878 pairs, **43,085 effective-question groups collapse two or more ranks into one
served question. In 11,880 of them (27.6%) the members do not agree on the answer**, and
**9,880 of those involve a tie at one rank and a decisive winner at another.**

The served member is always rank 1 (the `candidate_key` sort). So for **27.6% of ability-cooldown
comparisons, the question "Which has the shorter cooldown: A's Q or B's Q?" has a different
correct answer at a rank the prompt does not exclude.** Real examples:

```
Aatrox Q vs Ahri Q     served "Ahri"  (r1 14 vs 7) … but r5 is 6 vs 7 → Aatrox
Aatrox W vs Ambessa W  served "Ambessa" (r1 20 vs 18) … r3 is a tie, r4-5 → Aatrox
Aatrox Q vs Anivia Q   served "Anivia" (r1 14 vs 11) … r4 is a tie, r5 → Aatrox
```

This is a **wording defect that is also a correctness defect**: the answer is right for the
rank the generator meant and wrong for the question as asked. It is the same root cause as the
147,056-candidate coverage loss in §1.3, and fixing the prompt fixes both.

### 6.3 Phase 2 source integrity — still holds for Matchup

| Check | Result |
|---|---|
| `preflight_matchup` provenance | reports the artifact path, `content_sha256`, 688 entries, 172 champions, `wiki.leagueoflegends.com`, revisions 3433210–4050364 |
| Fail-closed on an unreadable authority | `load_cooldown_authority` raising `CooldownAuthorityUnavailable` ⇒ `preflight.ok = False`, code `AUTHORITY_UNAVAILABLE` ⇒ `synthesize_matchup_mastery` raises **`SourceIntegrityError`**: *"matchup Mastery for ahri, syndra cannot be generated from a trustworthy source"*. It never fails open. |
| Recovery | preflight returns `ok = True` again once the authority is restored |
| Patch stamping | `patch_display = "League 26.16"` from the canonical `league_patches` catalog, on the artifact and on every public challenge |
| Source bindings | 3 per artifact (both `ChampionSource`s + the `MatchupSource`) |

### 6.4 One data/semantics defect found

**Manaless champions are compared on mana regeneration.** 22 of 173 champions have
`champion_stats.mp5` of 0/NULL because they use no mana (`aatrox`, `belveth`, `briar`,
`dr-mundo`, `garen`, `gnar`, `katarina`, `kled`, `mordekaiser`, `reksai`, `renekton`, `rengar`,
`riven`, `rumble`, `sett`, `shyvana`, `tryndamere`, `viego`, `vladimir`, `yasuo`, `yone`,
`zac`). **3,553 pairs (23.9%) therefore serve "Which has more base Base Mana Regen?" with one
side at a structural 0**, and the 231 manaless-vs-manaless pairs serve it as a guaranteed 0–0
tie. `base_mana` handles this correctly — it is simply absent for those champions (10,440 pairs,
not 14,878) — so the projection already knows how to decline; `base_mana_regen` does not.

---

## 7. Presentation

**No NEW screenshot was captured** — the session's permission classifier refused both the
Browser pane and a Playwright harness. Two things stand in for it:

* **A real Matchup capture through the real Admin Generator Lab already exists**:
  `docs/audits/gr1-phase5-generator-lab/gr1p5-04-matchup-generated.png` (Ahri vs Syndra, n=3,
  seed `lab-demo`), captured at backend `31c0bbe8` / frontend `ec9c8bbd` — i.e. **before** the
  Champion Mastery readiness pass. It is reproduced as
  `docs/audits/gr1-matchup-mastery/matchup-generator-lab-phase5.png`. It is authoritative for
  the layout and for every defect the readiness pass did not touch, and **stale** for the two
  it did (badge, portraits) — both re-verified below against the live payload instead.
* Everything else is read from the live wire payloads and the real renderer source.

This is not sufficient to rule out a purely visual regression at mobile width or under the
post-readiness portrait path, and that is what a fresh capture would still add.

### What the existing capture shows, verbatim

| On screen | Reading |
|---|---|
| *"Which has the shorter cooldown: **Ahri R** or **Syndra R**?"* | **Confirms §5.1/§5.2 on screen**: no ability name, no rank |
| The media band above it: `AHRI` · **`ABILITY R`** · `BOTH CHAMPIONS` · chips `COMPARE COOLDOWN` **`RANK 1`** · `SYNDRA` | **The band states RANK 1 and the question does not.** The two disagree in the same card. Also confirms P2 — `ABILITY R`, not the two real names |
| *"Which has more **base Base Armor**: Ahri or Syndra?"* | **Confirms the double qualifier on screen** |
| Split splash art, `VS` divider, both names, symmetric weight | **The two-champion layout is good.** No emphasis favours either side |
| Three radio options: `Ahri` / `Syndra` / `Tie / Same`, then `Submit answer` | Answer controls correct |
| Reveal panel: *"Ahri R: 140 seconds. Syndra R: 120 seconds. Syndra wins by 20 seconds."* | Reveal state correct; units clean **here** because the metric is seconds (see §5.4 for the metrics where they are not) |
| Badge reads **`Fixed scenario`**; portraits are grey `A` / `S` initial circles | **Stale — both fixed by the readiness pass.** The live payload now carries `patch_display: "League 26.16"` on every challenge, and `MasteryAssetsProvider` is mounted on the shared surface. Re-verified below, not assumed |
| Corner chip `COMPARISON`; card header `QUESTION 1 · ABILITY_COOLDOWN · COMPARISON_LEFT_RIGHT` | The header is the **Lab's admin diagnostic**, not a player surface. `COMPARISON` is the one internal-ish word a player sees |

### What crosses the wire (live `POST /mastery-slice/preview`, `aatrox × akali`, n=8, seed `s1`)

| Field | Present | Value |
|---|---|---|
| `patch_display` | **YES**, every challenge | `"League 26.16"` — the readiness fix carried to Matchup; the badge reads `Patch 26.16`, **not** the old literal `"Fixed scenario"` |
| `comparison_semantics` | YES | template, both displays, metric, dimension, `subject_ref`, `context`, unit |
| `answer_options` | YES | `["aatrox", "akali", "tie"]` — always 3 |
| `input_constraints` | n/a | numeric-only; a comparison is single-choice |
| `presentation` | **6 of 8** | see below |

### Champion identity and images

`ComparisonQuestionView` draws two `MasteryChampionPortrait`s either side of
"Aatrox vs Akali", and `MasteryAssetsProvider` **is** mounted on the shared
`MasterySliceChallengeSurface` (readiness fix), so portraits resolve on the slice path. The
`championId` argument is `cs.championADisplay.toLowerCase()` — *"lee sin"*, not the canonical
`lee-sin` — but `championIconUrl(id, displayName)` prefers the display name, so the lowercased
id only reaches the `data-testid`. **Not a defect; a latent one if the fallback order ever
flips.**

The server-side media band resolves both champions' splash and icon correctly.

### Two presentation defects, both from the live payload

**P1 — 2 of 8 cards have no media band at all.** `movement_speed` and `attack_range` are
**absent from `quiz.public_presentation.METRIC_NAMES`**, so `MatchupRef.__post_init__` raises,
`_mastery_comparison`'s builder returns `None`, and the challenge ships with no `presentation`
key. Roster-wide that is **29,756 of 174,970 servable comparisons — 17.0%** rendering without
the band every neighbouring card has. The refusal is deliberate and correct
(`metric_label` returns `None` rather than guessing); the **vocabulary gap** is the defect:
`METRIC_LABELS` has `base_move_speed` and `base_attack_range`, the facts are named
`movement_speed` and `attack_range`, and the two never meet.

**P2 — the matchup media band prints `"Ability W"`.**
`ranked_public/presentation_render.py:423` is literally
`subject["ability_name"] = f"Ability {ref.ability_slot}"`, while the single-champion path two
hundred lines above resolves the canonical name from `champion_abilities` and refuses the whole
premise if it cannot. The docstring justifies emitting **no ability icon** (an icon can only
belong to one side); it does not justify the placeholder name. A same-slot comparison has two
real names — "Umbral Trance / Twilight Shroud" — and the card shows neither.

### Answer controls and reveal

Three buttons — `Aatrox`, `Akali`, `Tie / Same` — always three, regardless of the actual
outcome, which is correct: showing Tie conditionally would leak the answer. Reveal passes the
backend's frozen explanation through verbatim (`MasteryInlineReveal`), never recomputed — which
is why the raw unit slugs of §5 reach the player.

---

## 8. Persistence — Phase 4 applies correctly, nothing redesigned

| Contract | Matchup |
|---|---|
| Frozen artifact | `mastery_artifact` block present, `generator_type: "matchup"`, `generator_version: "matchup.v1"` |
| `subject_key` | **canonical**: `matchup:ahri:syndra` for `(ahri,syndra)` **and** `(syndra,ahri)` |
| `mastery_set_id` / `artifact_digest` / `artifact_instance_id` | **identical for both config orders** — order-independence holds through persistence, not just generation |
| `generator_config` | the parser's round-trip (`normalized_config`), preserving the caller's key order — this is the one thing that differs between `(a,b)` and `(b,a)`, and it changes no identity |
| `subject_kind` | `MasterySubjectKind.MATCHUP`; `champion_matchup_identity = {champion_a: ahri, champion_b: syndra}` |
| Step identity | `candidate_key` `ability_cooldown_compare:Ahri:W:vs:Syndra:W:r1` — **carries the rank the prompt omits**, so the artifact knows what the question does not say |
| `fact_refs` | two `cfact_…` refs per comparison, one per side |
| `quiz_attempts` bridge | unchanged and mode-agnostic (`mastery/serving/attempts.py`), `source='ranked_mastery'`, `apply_progress=False` |
| Preview writes | none — the Lab endpoints are read-only |

No persistence defect found, and nothing here needs redesigning.

**One inherited note, not new:** `mastery/serving/attempts.py` is fail-soft — a record failure
is logged and swallowed, so analytics loss is silent. Already recorded in the Champion audit.

---

## 9. Product-readiness ranking

### The top 5 blockers

| # | Blocker | Class | Evidence |
|---|---|---|---|
| **1** | **Cooldown comparisons are served without stating the rank, and 27.6% of them have a different answer at another rank.** One f-string in `_comparison_prompt_and_explanation` + one branch in `formatComparisonPrompt`. | **Correctness** (and, as a side effect, the single largest coverage gain available) | §1.3, §6.2 |
| **2** | **The comparison pool is capped at 13 per pair — median 12 — and the rank collapse is 76.4% of the cause.** Fixing #1 raises the cooldown universe from 45,506 to 192,562 and the per-pair ceiling from 13 to ~29. | **Data coverage** | §1.2, §2 |
| **3** | **11.6% of served comparisons are ties; 64.4% of 8-question slices contain one and 31.1% contain two or more.** `base_magic_resist` alone ties 39.3% of the time, and every cooldown is judged at the rank where kits agree most. | **Composition quality** | §4 |
| **4** | **Prompt wording: no ability is ever named, and 7 of the 10 shapes read "more base Base X".** Plus raw unit slugs (`per_5_seconds`) in the player-facing reveal. | **Wording/presentation** | §5 |
| **5** | **17.0% of comparisons render with no media band** (`movement_speed`, `attack_range` missing from `METRIC_NAMES`), and every ability comparison's band says **"Ability W"**. | **Presentation** | §7 |

### By class, in full

**Correctness bugs**
* The rank-silent cooldown prompt (#1). **The only true correctness defect found.**
* Manaless champions compared on mana regeneration — 3,553 pairs, 231 of them a guaranteed 0–0
  tie (§6.4). Semantic rather than numeric: the numbers are right.
* Everything else verified clean: 517/517 base stats, 325/325 cooldowns, winners agree with the
  arithmetic, Phase 2 still fails closed.

**Composition-quality issues**
* Tie density (#3).
* `recipe.synthesize_matchup_manifest` does not pass `distinct_counts` to `_plan` — the
  un-ported half of the Champion readiness fix. Harmless at n ≤ 8, repeats a fact up to 5× at
  n ≥ 16 (§3).
* Salt collisions on thin pairs (6 distinct slices from 12 salts for `lee-sin × udyr`) — a
  consequence of the 13-cap, not a seeding bug.
* Difficulty is still not a composition input. **Do not build it yet** — same call as Champion.

**Data coverage gaps**
* The 13-cap (#2).
* `ability_cost_compare` and `champion_stat_compare`-at-level have no family in
  `quiz/family_contract.py`, holding 404,023 candidates and leaving 2 of 4 renderer branches
  dead. **Owner: the family-contract workstream, not GR1.**
* Eight transforming/non-standard champions contribute zero ability comparisons, so the 10
  thinnest pairs are base-stat-only. **Owner: CHAMPDATA — the dual-form row split. Same open
  owner decision the Champion audit raised.**
* The atomic half of the universe (1,150,680 candidates) is unreachable below n ≈ 9.

**Wording/presentation issues**
* Ability names, "more base Base X", unit slugs (#4).
* No media band on 2 metrics; `"Ability W"` on every ability comparison (#5).
* The segment header echoes the caller's champion order while the questions use canonical order.
* `Comparison` chip and `Tie / Same` are the two internal-ish strings players do see; both read
  acceptably.
* The Lab's coverage panel headlines `total_candidates: 87` for `ahri × syndra` when the number
  that decides the product is `comparison_candidates: 12`. Honest, but it reads 7× deeper than
  the pair is.

**Future expansion ideas** (none of them this pass)
* Cross-slot comparisons — `SLOT_RELATIONS` is already a widenable mapping, deliberately
  `(Q,Q)…(R,R)` today.
* Comparisons at a *stated* rank as a first-class family, once #1 lands: "at rank 5" is a
  different and better question than "at rank 1".
* A tie-budget as a composition input, once #3 is quantified in the generator rather than only
  in this document.
* Level-stat comparisons, if the family contract ever gains the family — 299,124 candidates and
  a renderer branch already exist.

### Recommended implementation order

1. **State the rank in the comparison prompt** (backend f-string + frontend template). Fixes the
   correctness defect, multiplies the cooldown universe by 4.2×, and dissolves most of the
   cooldown tie mass — one change, three of the five blockers.
2. **Re-measure ties over the widened universe**, then decide a tie policy. Do not cap ties
   before step 1: the distribution will move.
3. **Prompt wording**: name both abilities, drop the double `base`, invert the unit slugs
   through the label table the reveal already has upstream.
4. **Presentation**: add `movement_speed` / `attack_range` to `METRIC_NAMES` + `METRIC_LABELS`,
   and decide what a two-champion band should say instead of `"Ability W"`.
5. **Manaless mana-regen**: make `base_mana_regen` decline the way `base_mana` already does.
6. Only then: `distinct_counts` for the matchup plan, and the coverage-panel headline.

Everything above is inside GR1's existing footprint. The two items that are **not** GR1's —
the comparative cost/level-stat families, and the dual-form row split — are already open owner
decisions in the handoff and should not be bundled in.

---

## 10. Tests

| Suite | Result |
|---|---|
| `pytest mastery/tests` | **3 failed, 1658 passed, 17 skipped** — the documented pre-existing set (2 × `test_audit_db`, the stale `test_phase4f` format expectation). Zero introduced; nothing was changed. |
| 6 Ranked-Mastery integration files | **2 failed, 151 passed** — both in `test_mastery_ranked_capsule.py` (`test_pinned_capsule_ids`, `test_pinned_capsule_digests`) |
| The same 2 at `gr1-wt-gr1p4` (`ed254ca6`, pre-readiness) | **also fail** — pre-existing, and older than the readiness pass |

**Untested behaviour that this audit's findings sit on:**
`formatComparisonSemantics.ts` has **no test file**, exactly like its atomic-recall sibling. It
writes every sentence in §5 and holds four of the wording defects.

---

## 11. Owner decisions this audit raises

1. **The comparative cost and level-stat families.** 404,023 candidates and two working
   renderer branches are held by `family_unmapped`. Classifying them is
   `quiz/family_contract.py`'s call. Ask for it, or accept a two-family Matchup product?
2. **Ties.** Quantified here and untouched, per instruction. Cap them, weight them, or accept
   them — but decide after step 1 of the order above, not before.
3. **Manaless mana regeneration.** Decline it (matching `base_mana`), or accept "0 vs 50" as a
   legitimate question about a champion having no mana at all?
4. Already open and unchanged: the dual-form row split, `champion_base_stat` as atomic recall,
   difficulty as a composition input, and whether `mastery_slice` enters a public format.
