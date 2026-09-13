# GR1 — Champion Mastery capability audit

**Audit only. Nothing was implemented, and no product code was changed.**

| | |
|---|---|
| Backend base | `League_Combat_Simulator` `origin/master` = **`31c0bbe8`** (worktree `/Users/macmoney/lcs-wt-gr1-p5`) |
| Frontend base | `mogsy` `origin/main` = **`ec9c8bbd`** (worktree `/Users/macmoney/mogsy-wt-gr1-p5`) |
| Scope | `mastery_slice.v1`, mode `champion`, only |
| Out of scope | Matchup Mastery, Applied-chain, public Ranked rollout, Lab architecture, legacy curricula |
| Date | 2026-09-12 |
| Canonical data | the real `lol_calc.db` (symlinked into the worktree), patch label **League 26.16** |

> **Read the SHAs carefully.** The local `master` (`c2511a52`) and local `main` (`e12f5900`)
> branches do **not** contain the audited commits. `31c0bbe8` / `ec9c8bbd` are the heads of
> `origin/master` / `origin/main`. Both primary checkouts are stale AND dirty. This audit was
> run entirely from the two `gr1-p5` worktrees, which sit exactly on those SHAs.

---

## 0. How the evidence was produced

Three independent instruments, all against the real canonical database:

1. **Universe probe** — walks the real pipeline per champion
   (`identity → preflight → project_champion → build_bank → publication_gate.evaluate →
   dedupe_by_effective_question`) and counts every stage. 173/173 champions.
2. **Composition probe** — calls the real
   `mastery.synthesis.service.synthesize_champion_mastery` for
   173 champions × {3, 5, 8, 10} questions × {no salt, `seedA`, `seedB`} = **2,076 real
   generated slices, 0 errors**, and measures repetition over the frozen steps.
3. **Admin Generator Lab, driven by Playwright** — a local backend at `31c0bbe8` serving the
   canonical DB, the frontend at `ec9c8bbd`, screenshots in
   `docs/audits/gr1-champion-mastery/`.

**Disclosure on the Lab captures.** `/admin/ranked/generator-lab` sits behind
`components/AdminRoute`, which does `<Navigate to="/" replace />` for any session that is not a
Supabase admin; the `X-Admin-Key` fallback authorizes the *backend* but not the *route*. For the
captures, a throwaway Vite config aliased **only** `./components/AdminRoute` to a pass-through.
`MasteryGeneratorLab`, `AdminAuthGate`, `MasterySliceChallengeSurface` and every Mastery
interaction renderer were the real, unmodified files, and the backend still authorized on
`X-Admin-Key`. The harness was deleted after capture; both worktrees are clean.

---

## 1. Capability inventory — what Champion Mastery can generate today

Champion Mastery is a **numeric atomic-recall generator over one champion**. It has no
comparison, no scenario, no calculation and no multi-step question. The Knowledge Bank emits
**six candidate shapes** in **four categories**; the publication gate admits **four quiz
families** across **three categories**.

| Family (quiz family id) | Servable? | Coverage | Source | Example (real, from the Lab) | Limitations |
|---|---|---:|---|---|---|
| `ability_cooldown_rank` | **Yes** | 2,071 raw → **~2,047** servable, 168/173 champs | `champion_abilities.cooldown` (canonical) arbitrated by the wiki cooldown artifact | "At rank 4, what is Aatrox W's cooldown, in seconds?" | Ability is named by **slot letter only**, never its real name; adjacent ranks are drained consecutively |
| `ability_cooldown_flat` | **Yes** | 133 raw → **~133**, 84 distinct prompts | as above, collapsed where `cooldown_shape = FLAT` | "What is Garen Q's cooldown, in seconds?" | Same slot-letter defect |
| `ability_cost_rank` | **Yes** | 1,029 raw → **1,028** | `champion_abilities.cost` + `cost_resource` | "At rank 3, what does Ahri Q cost?" | **Prompt never names the resource** — "what does X cost?" with no "mana"/"energy"/"health"; 125 champs only |
| `champion_stat_level` | **Yes** | 3,549 raw → **3,482** | `champion_stats` base + growth, at levels 6/11/18 | "At level 18, what is Aatrox's Base Armor?" | **Semantically wrong wording** (§5); 52% of the whole corpus |
| *ability cost, flat* | **No — stranded** | 317 raw → **0** | as `ability_cost_rank` | — | `family_unmapped`: the quiz vocabulary has `ability_cooldown_flat` but **no `ability_cost_flat`** |
| `champion_base_stat` | **No — stranded** | 1,702 raw → **0** | `champion_stats` base values | — | `family_unmapped`, roster-wide. No quiz family asks a base stat outright |

Common to every servable family:

* **Semantic type** — numeric recall of one canonical value. `interaction_kind = atomic_recall`.
* **Generator** — `mastery.knowledge.bank.build_bank` (candidates) →
  `mastery.synthesis.recipe` (allocation) → `mastery.manifest.resolver` (`CURRICULUM_V2`
  sequencing) → `mastery.publication_gate.gate.publish`.
* **Answer shape** — `single_choice` with 4 options where a defensible option set exists,
  otherwise **free numeric entry** (see §6.4).
* **Distractors** — `mastery.choices.build_numeric_choice_set`, seeded from the candidate's own
  `content_digest`, so they are deterministic and move only when the value moves.
* **Explanation** — a one-line restatement of the answer (§6.3).
* **Presentation** — a `ScenarioMediaBand` with the champion splash and typed chips
  (`CHAMPION MASTERY` / `BASE ARMOR`, `INFERNAL CHAINS · ABILITY · SLOT W`, `RANK 4`,
  `LEVEL 18`), built server-side by `quiz/presentation_contract.py`.

There is **no other Champion Mastery family**. The four above are the entire product.

---

## 2. Raw universe vs servable universe

Every stage, roster-wide, counted through the production code path:

| Category | Source facts → raw candidates | Passes policy | Enters pool (deduped) | Loss |
|---|---:|---:|---:|---:|
| `ability_cooldown` | 2,204 | 2,204 | **2,180** | −24 (1.1%) |
| `ability_cost` | 1,346 | 1,029 | **1,028** | −318 (23.6%) |
| `champion_base_stat` | 1,702 | **0** | **0** | −1,702 (**100%**) |
| `champion_level_stat` | 3,549 | 3,549 | **3,482** | −67 (1.9%) |
| **Total** | **8,801** | **6,782** | **6,690** | **−2,111 (24.0%)** |

* The only policy rejection reason in the entire roster is **`family_unmapped`** (2,019
  candidates). Nothing is rejected for being uncertified, conflicted or mode-ineligible.
* The residual 92 lost at dedupe are candidates whose *player-visible question* collides
  (e.g. a level-scaled stat that rounds to the same displayed value at two of 6/11/18).
* `6,690` matches the handoff's figure exactly, and matches the Lab's own coverage panel
  per champion — the coverage count and the generator read the same pool, as Phase 5 intended.

**Is Champion Mastery broad in theory but narrow in practice?** Yes, in a specific way. The
*count* survives well (76% of raw candidates are servable). What is narrow is the **number of
question shapes**: 6,690 questions are four families, and one of them
(`champion_stat_level`) is **52.0%** of the corpus while the two cooldown families are 32.6%
and cost is 15.4%. A player cannot meet a fifth kind of Champion Mastery question, because none
exists.

> **Correction to the handoff.** Handoff decision 6 says "the 3,482 base-stat candidates are
> raw". That is wrong twice: 3,482 is the **servable `champion_level_stat`** count, and the
> base-stat family is **1,702 raw / 0 servable**. The conclusion it draws (base stat is rejected
> roster-wide as `family_unmapped`) is correct.

---

## 3. Roster coverage

All 173 identities resolve, project and generate. **Zero champions have zero coverage**, and
**zero champions fail preflight or projection.**

| Servable candidates per champion | |
|---|---|
| min / median / mean / max | **19 / 40 / 38.7 / 54** |
| Distribution | 10s: 2 · 20s: 18 · 30s: 66 · 40s: 79 · 50s: 8 |

**By number of servable categories:**

| Categories | Champions | Meaning |
|---:|---:|---|
| 3 | 125 | cooldown + cost + level-stat |
| 2 | 43 | cooldown + level-stat (no mana/energy/health cost) |
| **1** | **5** | **level-stat ONLY** |

### Outliers — flagged

**The five single-family champions: `aphelios`, `elise`, `jayce`, `nidalee`, `udyr`.**
Every question these champions can produce is `champion_stat_level`. Their entire Champion
Mastery experience is "At level N, what is X's Base <stat>?", forever, at every slice length.
Aphelios at n=3 (captured: `06-aphelios-unanswered.png`) is Base Armor @18, Health Regen @11,
Base Armor @6 — **the same stat twice in three questions**.

**Lowest coverage:** `gnar` 19, `reksai` 19, `aphelios` 20, `elise` 21, `jayce` 21, `lee-sin` 21,
`nidalee` 21, `udyr` 21.
**Highest:** `alistar` 54, `ekko` 54, `hwei` 54, `xerath` 54, `mel` 53, `swain` 52, `tristana` 52.

### Root cause of the outliers — an upstream hold, not a Champion Mastery bug

The ability data is present and numerically parseable for all of them. Two deliberate
fail-closed gates in `quiz/ability_question_eligibility.py` remove it *before* projection:

* **`dual_form_row`** — `" / "` in `ability_name` means one row carries two abilities
  ("Boomerang Throw / Boulder Toss", "Hop / Crunch"). The stored number may belong to either
  half, so the whole row is held. This removes Gnar Q/W/E, Lee Sin Q/W/E, Elise, Jayce, Nidalee.
* **`nonstandard_rank_count`** — a progression whose length is not the slot's standard rank
  count. This removes Udyr and Aphelios Q/W/E (6 values).

Both holds are correct: naming an ability in a prompt whose number may belong to its other form
is exactly the ambiguity a quiz must not ship. But the consequence — five champions with a
one-family product — is a Champion Mastery problem even though the cause is not.

**Repetition despite Phase 3:** Phase 3's fix holds for *category* mix at n=3 (only 2.9% of
3-question slices are single-family, and those 15 are the 5 one-category champions × 3 seeds).
It does **not** hold for *within-category* repetition — see §4.

---

## 4. Composition

### The rules, exactly

1. `eligible_champion_pool` produces the deduped, policy-passed candidate list.
2. `recipe.allocate(counts, budget)` shares the budget across `CATEGORY_ORDER`
   (`ability_cooldown`, `ability_cost`, `champion_base_stat`, `champion_level_stat`) by a
   **round-robin, one question per category per pass**. Categories absent from the pool are
   absent from the plan; there is no per-category ceiling.
3. `recipe._plan` emits one `SelectionRequest` per allocated category, **all sharing one
   `block`** (`"recall"`), so `CURRICULUM_V2`'s interleaving and adjacency-breaking can mix
   them rather than playing every cooldown before the first cost.
4. `CURRICULUM_V2` sequences and applies `_break_adjacent_pattern` **within the block**.
5. `selection_salt` (the match's `order_seed` + segment number, or the Lab's admin seed) rotates
   the candidate pool inside each category.
6. `RepetitionPolicy(reinforcement_repeats=0, require_distinct_effective_question=True)`;
   duplicate *effective questions* are collapsed in the gate, before the snapshot is frozen.
7. `InsufficientQuestionsError` if the request exceeds the pool — it never silently returns fewer.

### Determinism and seed behaviour — verified

| Property | Result |
|---|---|
| Same seed, repeated calls | **Byte-identical artifact digest** (verified ×3 for ahri/garen/aphelios) |
| `selection_salt=None`, repeated calls | **Identical** |
| Three different seeds, 692 (champion, n) cells | **692/692 produce a different digest** |
| Does the seed change *which* questions? | **Yes — all 692 cells; the selected set differs, not just the order** |
| Does the seed change the **category mix**? | **No — 692/692 cells have an identical family histogram across all three seeds** |

That last row is the important one: **`allocate()` depends only on counts and budget, so the
shape of a slice is fixed per (champion, n)**. The seed diversifies content within a shape it
can never change. Roster-wide at n=3 the family mix is byte-identical across seeds
(cooldown 211 / level-stat 183 / cost 125 of 519).

### Repetition measured — 2,076 real slices

| Metric | n=3 | n=5 | n=8 | n=10 |
|---|---:|---:|---:|---:|
| Slices that are 100% one family | 2.9% | 2.9% | 2.9% | 2.9% |
| Slices repeating an **ability slot** | **36.8%** | **95.8%** | **97.1%** | **97.1%** |
| Slices repeating a **metric+subject** | **20.8%** | **97.1%** | **100%** | **100%** |
| Slices repeating **rank variants of one ability** | **17.9%** | **93.3%** | **97.1%** | **97.1%** |
| Longest same-family run | ≤2 for 97.1% | ≤2 for 97.1% | ≤2 for 95.2% | 3 for 65.3% |

**Phase 3 solved the wrong half.** It fixed the *category* monoculture and the same-family run
length, and those wins are real and hold. What it did not touch is that within a category the
resolver walks **consecutive rank/level variants of a single fact**. The result at realistic
slice lengths is worse for the player than a same-family run would be, because the questions are
not merely the same *kind* — they are the same *fact*, re-asked.

Real, captured examples:

* **Alistar, n=8** (`07-alistar-unanswered.png`) — Q cooldown r1, Q cost r1, Q cooldown r2,
  Q cost r2, Q cooldown r3, Q cost r3, MR@6, MP5@11. **Six of eight questions are Alistar Q**,
  marching through ranks 1-2-3 in lockstep. The category interleave is perfect and the slice is
  still almost entirely one ability.
* **Garen, n=8** (`08-garen-unanswered.png`) — W cooldown r3/r4/r5 plus Base Health Regen at
  levels 6/18/11. **Seven of eight questions are two facts.**
* **Aatrox, n=3** (`01-aatrox-unanswered.png`) — W cooldown r4, Base Armor @18, W cooldown r5.
  **Two of three questions are the same ability's cooldown at adjacent ranks**, at the slice
  length Phase 3 was tuned for.
* **Ahri, n=5** (`02-ahri-unanswered.png`) — W cd r3, Q cost r3, W cd r4, Q cost r4, HP5 @18.

**Difficulty does not participate in selection, and there is no pedagogical sequencing.** There
is no champion-specific ordering, no easy→hard ramp, and no notion that rank 1 should precede
rank 5 for a reason. The order is the resolver's generic interleave over a salted rotation.

---

## 5. Terminology and semantic correctness

Every player-facing Champion Mastery sentence is assembled in **one** frontend file,
`src/features/mastery/interactions/formatPromptSemantics.ts`, from typed fields. The backend's
own `prompt` string is never rendered on this path (§9).

| # | Defect | Severity | Evidence |
|---|---|---|---|
| **T1** | **"Base <stat>" in a level-scaled prompt.** `champion_stat_at_level` renders `humanizeMetric(ps.metric)`, and the metric slugs are `base_armor`, `base_health`, `base_mana`, `base_health_regen`, `base_magic_resist`, `base_mana_regen`. The value asked for is base **+ growth × level multiplier** — it is not the base stat. **"At level 18, what is Aatrox's Base Armor?" (answer 120) is asking for a number that is by definition not base armor** (Aatrox's base armor is 38). Affects the whole `champion_stat_level` family: **3,482 candidates, 52% of the corpus, all 173 champions.** | **Blocker** | Confirmed from screenshot, all of `01`,`02`,`03`,`04`,`05`,`06`,`07`,`08` |
| **T2** | **The media band and the prompt disagree.** For the same question the `ScenarioMediaBand` chip reads `HEALTH REGEN` while the prompt reads "Base Health Regen"; the chip reads `BASE ARMOR` where the prompt reads "Base Armor". The presentation contract already strips/normalises the metric name; the prompt formatter does not. | High | `06-aphelios-unanswered.png` Q2 |
| **T3** | **An ability is never named.** `bank._ability_name()` is `return slot`, so `ability_name == subject_ref` always, and `abilityLabel()` correctly drops the redundant parenthetical. Every prompt says "Aatrox W", never "Aatrox W (Infernal Chains)" — **even though the media band immediately above it prints `INFERNAL CHAINS`**. Affects all 2,180 cooldown + 1,028 cost candidates. | High | `01-aatrox-unanswered.png` |
| **T4** | **A cost prompt never names the resource.** `ability_cost_at_rank` renders "At rank 3, what does Ahri Q cost?" — no unit, no bar. The eligibility layer went to the trouble of a `RESOURCE_LABEL` map ("mana"/"energy"/"health") precisely so a prompt would not say "mana" for an energy cost; the Mastery prompt says nothing at all. Lee Sin's energy costs and Ahri's mana costs read identically. | High | `02`,`03`,`04`,`05`,`07` |
| **T5** | **`"Fixed scenario"` is shown to the player on every question.** See §9 — this is a wiring defect with a terminology symptom. | **Blocker** | every screenshot |
| **T6** | **Raw unit slugs in explanations.** "Aphelios: 8.1 per_5_seconds." and "Aatrox: 103.875 attack_damage, which rounds to 104". | Medium | `06-aphelios` Q2 reveal |
| **T7** | **Singular/plural not handled.** "Amumu W: 1 seconds." | Low | composition probe, `ability_cooldown_flat` |
| **T8** | **Artifact title is the lowercase canonical id.** `recipe.synthesize_champion_manifest` sets `title = f"{champion_id} Champion Mastery"` → "ahri Champion Mastery", "lee-sin Champion Mastery". The Lab's coverage panel likewise says "Champion Mastery (aphelios)". Not currently on the player card, but it is on the artifact and in admin surfaces. | Low | probe + `06-aphelios` coverage panel |

**Checked and found correct:** rank wording ("At rank 4" — matches the game's 1-indexed ranks);
cooldown units ("in seconds"); rounding (the displayed option and the explanation agree, and the
grader uses the same `precision_accepts` policy); `champion_base_stat`'s latent double-"base"
("what is X's base Base Armor") **cannot currently reach a player** because the family is
stranded — but it is one policy change away from doing so.

---

## 6. Question quality

Findings are separated by kind, as requested.

### 6.1 Correctness defects
**None found.** Across 4,152 inspected steps at n=8: every single-choice step has exactly 4
distinct options, **zero** steps have duplicate options, and **zero** steps are missing their
correct answer from the option set. Values trace to canonical `champion_stats` /
`champion_abilities`, arbitrated by a fail-closed, drift-verified cooldown artifact. T1 is a
*wording* defect, not a wrong number: the number 120 is correct for Aatrox's armor at 18.

### 6.2 Composition defects
The whole of §4. In one sentence: **at every slice length a player will actually be served,
Champion Mastery re-asks the same fact with a different rank or level number.**

### 6.3 Product-quality weakness — explanations teach nothing
Every explanation is a restatement of the answer:

* `ability_cooldown` → `"Aatrox W: 14 seconds."`
* `ability_cost` → `"Ahri Q: 55 mana."` *(note: the explanation names the resource the prompt withheld — T4)*
* `champion_stat_level` → `"Aatrox: 119.6 armor, which rounds to 120 for this question."`

**100% of explanations** are of this shape. None states the growth formula, the rank
progression, why the value matters, or anything the player did not just guess or read. The
level-stat one is marginally better because it exposes the pre-rounding value — but it still
never shows `base + growth × (level-1) × (0.7025 + 0.0175 × (level-1))`, which is the one thing
that would make the question teach.

### 6.4 Product-quality weakness — the free-input questions are unguided
`_atomic_choice_set` deliberately returns `None` where no defensible 4-option set exists
(a sub-unit value has no same-shape integer neighbours). That decision is sound. The
consequence is not: **409 of the generated steps across the probe are free numeric entry**, and
on the Ranked/Lab path `MasterySliceChallengeSurface.toPlayerQuestion` builds
`inputConstraints` as **all-empty** — `unit: ""`, `decimalPlaces: null`, `roundingMode: null`,
`precisionInstruction: null` — discarding the real constraints the backend computes in
`_numeric_constraints`. The player sees a bare "Your answer" box with **no unit and no
precision instruction**, while the answer of record is `8.076250000000002` and the grader
accepts only what rounds to `8.1`. Confirmed from screenshot (`06-aphelios-unanswered.png` Q2).

### 6.5 Product-quality weakness — distractors are numerically fine, pedagogically leaky
Median nearest distractor sits 12–20% from the answer and the farthest 29–44%, per family —
reasonable spread, no giveaway odd-one-out. The leak is compositional: when a slice asks the
same ability's cooldown at rank 3 and rank 4, the two option sets overlap with the two real
answers (Ahri W: rank-3 options `5/7/12/9`, rank-4 options `9/8/7/6`), so one card partially
answers the other.

### 6.6 Near-duplicates in one slice
`require_distinct_effective_question` prevents *identical* prompt+options pairs, and it works —
zero duplicates observed. It does **not** prevent same-fact-different-rank, which is the actual
problem, because those are genuinely distinct questions with distinct answers.

---

## 7. Difficulty — essentially unused

| Question | Answer |
|---|---|
| Is there difficulty metadata? | **Yes.** `ChampionQuestionCandidate.difficulty_class`, carried onto every frozen step. |
| Where does it come from? | `K.difficulty_for(fact.certification)` — a two-entry map: `READY → 2 (RECALL)`, `READY_DERIVED → 4 (REASONING)`. |
| Does it affect candidate generation? | **No.** |
| Does it affect composition? | **No.** `recipe.allocate`, `_plan` and `CURRICULUM_V2` never read it. |
| Does it affect distractors? | **No.** `build_numeric_choice_set` takes answer, precision, subject_ref and a digest seed. |
| Does it affect question count or sequencing? | **No.** |
| Is there unused infrastructure? | **Yes** — the field, its enum, and `bank.summary()["by_difficulty_class"]`. |

**It carries no information.** Roster-wide the 6,690 servable candidates split exactly
**3,208 at difficulty 2 / 3,482 at difficulty 4**, and that split is *identical* to the category
split: every `champion_level_stat` candidate is 4 (it is `READY_DERIVED`, because a level-scaled
value is derived) and every cooldown/cost candidate is 2. `difficulty_class` is therefore a
**restatement of the category**, not an independent signal.

**To make difficulty a real composition input** you would need, in order: (a) a difficulty model
that is not certification — plausibly rank/level distance from the memorable anchor, whether the
value is flat, and whether the metric is one players quote; (b) a difficulty *target* on the
slice config, as `DIFFICULTY_TARGETS` already does for Ranked; (c) `allocate` to become a
two-dimensional fill over (category × difficulty) rather than round-robin over category alone.
None of that exists. **Do not build it before §13's top five.**

---

## 8 & 9. Player rendering and the renderer path — proved, not inferred

### The path
`ranked_modules/mastery_slice.py` freezes steps and projects
`PUBLIC_CHALLENGE_FIELDS = (challenge_index, interaction_kind, question_family, prompt,
answer_type, answer_options, prompt_semantics, comparison_semantics, presentation)`.
`MasterySliceChallengeSurface.renderPathFor` dispatches: Champion Mastery always has
`interaction_kind = atomic_recall` **and** `prompt_semantics`, so it always takes the
`atomic_recall` path into `AtomicRecallQuestionView`, never the `prose` fallback.

### Is internal taxonomy visible to a normal player?

| Token | Crosses the wire? | Visible to a player? | Proof |
|---|---|---|---|
| `ability_cooldown` (`question_family`) | **Yes** | **No.** `AtomicRecallQuestionView` never renders it; only the prose fallback would, via `questionViewForChallenge`'s `category`, and Champion Mastery never reaches that branch. | renderer source + every screenshot |
| `"Ahri E — ability_cooldown"` (`prompt`) | **Yes** | **No.** The view renders `formatRecallPrompt(ps)` and the file states it never echoes `question.prompt`. | renderer source + screenshots |
| `atomic_recall` | Yes | **No** on the player card. Visible only in the **Lab's own diagnostic header** (`QUESTION 1 · ABILITY_COOLDOWN · ATOMIC_RECALL`), which is admin chrome. | `01-aatrox-unanswered.png` |
| `Recall` | — | **YES, rendered.** A literal `<span>Recall</span>` in the question header. Defensible as a player-facing label. | every screenshot |
| **`Fixed scenario`** | — | **YES, rendered — and wrong.** | every screenshot |

### V1 — "Fixed scenario" badge · **Blocker · confirmed from screenshot**
`toPlayerQuestion` hardcodes `patchDisplay: ""`. `MasteryPatchBadge` calls
`patchLabel("")`, whose regex finds no `\d+\.\d+` and **returns the literal string
`"Fixed scenario"`**. So every Champion Mastery question — in the Ranked arena *and* in the
Lab — carries a badge reading "Fixed scenario", on a question generated minutes earlier from
live patch **League 26.16**, a label the backend computes, stamps on the artifact, and returns
in the preview response. The badge says the opposite of the truth, in internal vocabulary.

### V2 — no champion portrait · **High · confirmed from screenshot**
`MasteryChampionPortrait` reads `championIconUrl` from `MasteryAssetsContext`, whose default
value is `() => null`. The only provider, `MasteryAssetsProvider`, is mounted **exclusively by
`MasteryPlayerLive`** (the standalone Mastery player). Neither `MasterySliceChallengeSurface`
nor `MasteryGeneratorLab` wraps it, so every question renders the grey initial-letter fallback.
Visible as a plain "A"/"G"/"O" disc beside the champion name in all nine screenshots. (The large
`ScenarioMediaBand` splash *does* render, from a different, server-driven path — so the card is
not imageless, it just has a broken avatar next to a correct splash.)

There is also a latent id defect behind it: the call is
`championId={ps.championDisplay.toLowerCase()}`, which yields `"miss fortune"` / `"lee sin"`
(space) where the canonical ids are `miss-fortune` / `lee-sin`. It cannot bite today because the
provider is absent, and it will the moment V2 is fixed naively.

### Confirmed vs unverified

* **Confirmed from screenshot:** T1, T2, T3, T4, T5/V1, V2, the free-input defect (6.4), the
  Lab's admin-only reveal, the repetition examples in §4, the coverage panel.
* **Content-only (correct in the payload, not a visual bug):** T6, T7, T8, 6.3, 6.5.
* **Unverified until visual review:** the **live Ranked arena** rendering. Every capture here is
  the Generator Lab. Because Phase 5 made both surfaces share one renderer
  (`MasterySliceChallengeSurface`), V1 and V2 are structurally identical in the arena — both
  originate in the shared file and in a provider neither surface mounts — but that is an
  argument from identity, not a photograph. Mobile at 390px (`09-ahri-mobile-unanswered.png`)
  reflows without layout defects; nothing material differs.

---

## 10. Admin Generator Lab — as it relates to Champion Mastery

| Item | Status |
|---|---|
| Champion selector | Present, all 173, display names |
| Question count | Present, validated against the pool |
| Seed | Present, plus "New seed" and "Regenerate with this seed"; empty = the fixed preview, not seed zero |
| Coverage | "WHAT THIS SUBJECT CAN SUPPLY" — total, minimum servable slice, per-family counts |
| Candidate/family counts | Yes, and they **agree with the generator** — verified: Lab said ahri 35 / aatrox 34 / caitlyn 36 / ornn 48 / lux 45 / aphelios 20 / alistar 54, identical to the independent probe |
| Deterministic reproduction | Verified end-to-end |
| Real production renderer reuse | Verified — the Lab mounts the same `MasterySliceChallengeSurface` the arena does, which is why V1/V2 reproduce there |
| Persistence side effects | **None.** `preview_mastery_slice` opens a connection, calls `mastery_preview.preview_segment`, closes. No match, round, segment or attempt. Backend log across the whole capture shows only `POST …/coverage` and `…/preview` |

**Missing diagnostics that would materially help review** (not a redesign request, just the gap):

1. The Lab shows what a champion *can* supply but not **what the slice actually drew** — no
   per-slice family/ability histogram. The Alistar-is-six-Q problem is invisible in the Lab
   unless you read all eight cards.
2. No **excluded-candidate** view. `PublicationReport.decisions` already carries every
   `family_unmapped` rejection with its reason; the Lab shows only survivors, so "Aphelios has
   20 questions" is displayed without "…and 11 were held, all `family_unmapped`".
3. The **route is unreachable with the admin-key fallback** (§0). The gate offers "Use admin key
   fallback", the backend honours it, and `AdminRoute` redirects before either matters.

---

## 11. Persistence / history / analytics — verification

Verified as described by GR1 Phase 4; nothing contradicted.

| Claim | Verified |
|---|---|
| The served artifact is frozen | Yes — steps are written to the round row at segment open; grading reads the frozen private payload via `_GradingStep`, never a re-publish |
| `mastery_artifact` provenance block | Yes — generator type, version, normalised config, subject key, salt (server-only), `mastery_set_id` / `artifact_digest` / `patch_key_digest`, patch label |
| Semantic question key | Yes — `mastery:<concept_id>` minted from `candidate_key` via `discovery.canonical_ref_for_concept`; the **same** key the standalone bank indexes, so one fact is one question across surfaces. Fail-closed: a step with no key gets no ref rather than a fabricated one |
| `quiz_attempts` behaviour | Yes — one row per answered challenge, `question_id` NULL, `source='ranked_mastery'`, `choices_snapshot` / `source_version` / `provenance_json` populated, written in the submission's own `BEGIN IMMEDIATE` |
| No quiz XP/streak/category/achievement | Yes — `apply_progress=False` |
| Four identity levels, not conflated | Yes — `generator_type` → `mastery:<concept_id>` → `artifact_instance_id` → `quiz_attempts.id` |
| Historical reconstruction | Yes — from persisted content only; `generator_version` is displayed and never dispatched on |
| Absent means unknown | Yes — pre-Phase-4 segments have no block and every reader treats `None` as "predates the contract" |
| Tests | `test_ranked_mastery_artifact_persistence.py` **21/21 in isolation** |

**One thing worth knowing:** `mastery/serving/attempts.py` is **fail-soft** — a failure to record
the attempt is logged and swallowed so the player's submission still succeeds. Deliberate, but
it means analytics loss is silent.

---

## 12. Tests

**Run at `31c0bbe8` / `ec9c8bbd`, serially** (concurrent pytest against the shared `lol_calc.db`
fabricates failures).

| Suite | Result |
|---|---|
| `pytest mastery/tests` | **3 failed, 1617 passed, 17 skipped** — exactly the documented pre-existing set (2× `test_audit_db`, 1× `test_phase4f` stale `ranked_modern`/`ranked_points_v2` expectation). **Zero introduced.** |
| GR1 P2+P3+P4 + synthesis + roster + publication gate (7 files) | **288 passed, 1 skipped** |
| 6 Ranked-Mastery integration files together | **1 failed, 129 passed** — see below |
| `test_ranked_mastery_artifact_persistence.py` alone | **21 passed** |
| `vitest` mastery interactions + ranked-core modules + Lab (20 files) | **236 passed** |

### New finding — a cross-suite isolation defect
`test_ranked_mastery_artifact_persistence.py::test_one_semantic_question_in_two_matches_is_two_attempts_one_key`
**passes alone (21/21) and fails when co-run.** Bisected to a single culprit: running
`test_ranked_mastery_reveal_e2e.py` **before** it makes it fail; the other three co-runners are
harmless. This is state leakage between suites, not a product defect — but the Phase 4 handoff
reports "21 passed" from an isolated run, so the suite's health is order-dependent and that is
not currently known.

### Coverage map

| Behaviour | Covered? |
|---|---|
| Family generation | **Yes** — `test_synthesis_champion`, `test_knowledge_bank_*`, `test_phase4d2_publication_gate` |
| Composition / allocation | **Yes** — `test_gr1_phase3_composition.py` (139 tests) |
| Seed determinism | **Yes** — Phase 2 + Phase 3 suites |
| Source integrity | **Yes** — `test_gr1_phase2_source_authority.py`, `mastery/facts/integrity.py` |
| Roster coverage | **Yes** — `test_identity_roster_coverage.py` |
| Duplicate prevention | **Yes** for identical effective questions; **NO** test asserts anything about same-fact-different-rank |
| Historical immutability | **Yes** — the double assertion in the Phase 4 suite |
| Analytics persistence | **Yes** — `test_ranked_mastery_artifact_persistence.py` |

### Important untested behaviour

1. **`formatPromptSemantics.ts` has no test file at all.** The single file that assembles every
   player-facing Champion Mastery sentence — and the site of T1 — is untested. Its sibling
   `formatComparisonSemantics.ts` is equally untested.
2. **Nothing asserts `patchDisplay` reaches the badge.** No test covers the `""` →
   "Fixed scenario" path (V1). A test that rendered the slice surface and asserted a patch
   number would have caught it.
3. **Nothing asserts the champion portrait resolves** on the slice path (V2).
4. **No repetition/diversity invariant.** `invariants.py` asserts a slice is made of *usable*
   questions; nothing asserts it is made of *different* ones in the same-fact sense.
5. **No test for the free-input `inputConstraints` passthrough** (6.4).

---

## 13. Product-readiness assessment

### Blocker
| | |
|---|---|
| **B1 — T1** | "Base <stat>" wording on every level-scaled question. 3,482 candidates, 52% of the corpus, all 173 champions, and it is the *only* question a player of the five single-family champions will ever see. The prompt asserts something false about what the number is. |
| **B2 — V1** | Every question is badged **"Fixed scenario"**, internal vocabulary that contradicts the live patch label the backend already computed and returned. |
| **B3 — §4** | Same-fact repetition at every realistic slice length: 97% of 8-question slices re-ask one metric+subject, 6 of 8 Alistar questions are Alistar Q. This is what a player will describe as "it keeps asking me the same thing". |

### High priority
| | |
|---|---|
| **H1 — T3** | Abilities are never named, while the image directly above prints the name. |
| **H2 — T4** | Cost prompts never name the resource; mana and energy read identically. |
| **H3 — V2** | No champion portrait on the slice path (`MasteryAssetsProvider` unmounted); latent display-name→id defect behind it. |
| **H4 — 6.4** | 409 free-input steps rendered with no unit and no precision instruction, against a grader that enforces precision. |
| **H5 — §3** | Five champions (`aphelios`, `elise`, `jayce`, `nidalee`, `udyr`) have a one-family product, caused by correct upstream `dual_form_row` / `nonstandard_rank_count` holds. |
| **H6 — 6.3** | Explanations restate the answer and teach nothing, 100% of the time. |

### Medium
| | |
|---|---|
| **M1 — T2** | Media band and prompt disagree on the metric name. |
| **M2 — §2** | 2,019 candidates (23% of raw) stranded as `family_unmapped` — the whole `champion_base_stat` family and all flat costs — waiting on `quiz/family_contract.py`, not on Mastery. |
| **M3 — §12** | Cross-suite isolation defect in the Phase 4 persistence suite. |
| **M4 — §12** | `formatPromptSemantics.ts` untested. |
| **M5 — §10** | Lab shows the available pool but not the drawn slice's composition, nor the held candidates. |
| **M6 — T6** | Raw unit slugs (`per_5_seconds`, `attack_damage`) in explanations. |
| **M7 — §10** | The Lab is unreachable via the admin-key fallback it offers. |

### Low
T7 (plural), T8 (lowercase id in title/labels), 6.5 (adjacent-rank option overlap — folds into
B3), the handoff's 3,482 mislabel (§2).

### The nine answers

1. **What can it generate today?** Numeric atomic recall over one champion, in four quiz
   families across three categories: ability cooldown (rank and flat), ability cost (rank only),
   and level-scaled champion stats at levels 6/11/18. 6,690 servable questions, 173/173
   champions, generated on demand from canonical data, seeded, frozen and provenance-stamped.
   Nothing else — no comparison, no scenario, no calculation.
2. **How diverse is it really?** Narrow. Four families, one of which is 52% of the corpus. Per
   champion the median is 40 questions but they are permutations of ~12 facts across rank and
   level axes. In practice a slice is "a few ranks of one ability plus a few levels of one stat".
3. **Missing or stranded families?** Stranded: `champion_base_stat` (1,702, 100% loss) and flat
   ability cost (317) — both `family_unmapped`. Missing entirely: ability range, damage,
   ratios, passives, cooldown-with-haste, resource type, attack type — the projection produces
   or refuses these facts and the bank has no template for them.
4. **What repetition remains?** Category monoculture is fixed. **Same-fact repetition is not**:
   36.8% of 3-question slices repeat an ability slot, rising to 97% at n≥5, and 97% of
   8-question slices repeat rank variants of one ability.
5. **Semantic/wording defects?** T1–T8 in §5. T1 is the blocker; T3 and T4 are the two that most
   cheapen the questions.
6. **Confirmed visual defects?** V1 ("Fixed scenario", every question) and V2 (no portrait),
   both from screenshots, plus the unguided free-input box. The live arena is unverified by
   photograph though structurally identical.
7. **Is difficulty real?** No. The field exists, is frozen onto every step, and is a
   one-to-one restatement of the category. Nothing reads it.
8. **Top 5 changes to reach product-ready:**
   1. Fix the level-stat prompt wording (B1) — drop the `base_` prefix in the level-scaled
      template, or ask the presentation contract for the metric label it already normalises.
   2. Pass the real `patchDisplay` through `toPlayerQuestion` (B2) — the value is already on the
      wire; and make `patchLabel`'s empty case not read as a scenario type.
   3. Add a same-fact diversity rule to composition (B3) — a per-slice cap on
      `(metric, subject_ref)` and on `redundancy_group`, enforced in the resolver where
      `_break_adjacent_pattern` already lives.
   4. Name the ability and the resource (H1, H2) — the ability name exists in
      `champion_abilities` and the media band already prints it; `RESOURCE_LABEL` already exists.
   5. Mount `MasteryAssetsProvider` on the slice path and pass real `inputConstraints`
      (H3, H4) — two wiring fixes in `MasterySliceChallengeSurface`.
9. **What should explicitly NOT be changed yet?**
   * **Difficulty.** Do not build a difficulty model or make it a composition input. It would
     add a second selection axis on top of a composition layer that has not yet solved the first.
   * **The `dual_form_row` / `nonstandard_rank_count` holds.** They are correct. Widening them
     to raise coverage for the five thin champions would ship ambiguous questions.
   * **`champion_base_stat`'s unmapping.** It is the family-contract workstream's decision, and
     unblocking it would immediately expose the latent "base Base Armor" wording.
   * **The publication gate, the source preflight, the freeze/provenance contract and the
     `quiz_attempts` bridge.** All verified sound; none is implicated in any finding here.
   * **Matchup and Applied-chain.** Out of scope and deferred.
   * **`generator_version` dispatch.** It is provenance; nothing should ever dispatch on it.

---

## Owner decision required

**One.** Two of the five single-family champions' fixes are not Champion Mastery's to make:
raising coverage for `aphelios` / `elise` / `jayce` / `nidalee` / `udyr` (and the ability half of
`gnar` / `reksai` / `lee-sin`) requires **splitting dual-form ability rows in
`champion_abilities` into per-form rows** — a canonical-data change owned by CHAMPDATA/Patch Ops,
not by GR1. Champion Mastery can either wait for that, or accept that five champions ship with a
one-family product. **Which?**

## Screenshots

`docs/audits/gr1-champion-mastery/` — 10 PNGs, all end-to-end through the real Admin Generator
Lab against a local backend serving the canonical database:

| File | What it evidences |
|---|---|
| `01-aatrox-unanswered.png` | n=3; **same ability twice**; "Base Armor" at 18; "Fixed scenario"; portrait fallback; media band naming *Infernal Chains* while the prompt says "W" |
| `01b-aatrox-lab-answer-shown.png` | the Lab's admin-only answer panel (the Lab has no player reveal — its submit is inert) |
| `02-ahri-unanswered.png` | n=5 lockstep W-cd/Q-cost through ranks 3→4 |
| `03-caitlyn-unanswered.png` | marksman; "Base Mana" at level 6 |
| `04-ornn-unanswered.png` | tank; "Base Armor" at level 6 |
| `05-lux-unanswered.png` | mage, `seedA`; flat and ranked cooldowns together |
| `06-aphelios-unanswered.png` | **lowest coverage (20)**; coverage panel showing one family; **free-input box with no unit or precision**; Base Armor twice in three questions |
| `07-alistar-unanswered.png` | **highest coverage (54)**; n=8 — **six of eight questions are Alistar Q** |
| `08-garen-unanswered.png` | n=8 — seven of eight questions are two facts |
| `09-ahri-mobile-unanswered.png` | 390px; reflows cleanly, no material difference |
