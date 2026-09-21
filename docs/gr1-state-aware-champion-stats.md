# GR1 — State-aware Champion stats: the existing `champion_stat_level` as a second family

**IMPLEMENTED, COMMITTED, NOT PUSHED (2026-09-21). Internal / Generator Lab only.** The existing
`champion_stat_level` question — *"What is Ahri's base health at level 6?"* — is now the second
consumer of the reusable `StateTemplate → ResolvedState` architecture. It joins the cooldown family
in **one** state-aware candidate universe, through the same semantic collapse, the same gate-aware
composition and the same `FrozenStateBundle`. It is not a new family, not a duplicate, and it is
not wired to anything a player can reach.

Nothing a player sees moved. Practice `champion_stat_level`, Champion Mastery, Matchup Mastery,
Ranked, the current Slice, the cooldown family and its prompt are **byte-identical** — proved by a
22.8 MB two-worktree dump (§14). No route, no `mastery_slice` mode, no persistence, no
`mastery_state` writer, no migration, no Full, no frontend, no State Context UI.

| | SHA | Note |
|---|---|---|
| Backend base | `origin/master` **`c2634d8a`** | As named in the brief; fetched at the start of the phase, did not move. |
| Backend commit | **`81e5b24d`** | One commit on `gr1/state-aware-champion-stats`, worktree `~/lcs-wt-gr1-stats`. Authored on `c2634d8a`; `origin/master` moved once mid-phase (`a178a116`, Sundered Sky item lane — 9 files, **zero `mastery/` overlap**) and the branch was rebased onto it. At integration (2026-09-21) rebased again onto `71919f50` (one items-only commit, zero file overlap) and **PUSHED to `origin/master` as `1090633f`**. |
| Comparison base | `~/lcs-wt-gr1-stats-base` detached @ **`c2634d8a`** | Same symlinked `lol_calc.db`, for the invariance probe and the failure-set arm. |
| Docs base | `origin/main` **`7d003128`** | As named in the brief; did not move. |
| Docs commit | *(this commit — read it with `git log`)* | Branch `gr1/state-aware-champion-stats-docs`, worktree `~/mogsy-wt-gr1-stats`. **PUSHED to `origin/main`** (no rebase needed; `origin/main` still `7d003128`). |
| Frontend | **none** | None was needed. |

**Files: 10 — 3 new, 7 modified.**

```
mastery/setup_state/stat_scenario.py                    NEW   the stat family (consumer half)
mastery/setup_state/families.py                         NEW   which generator produces each family
mastery/tests/test_gr1_state_aware_champion_stats.py    NEW   79 tests
mastery/setup_state/window_lab.py                       ~     opt-in families=, per-family freeze, diagnostics
mastery/setup_state/composition.py                      +8    per-candidate family_id (generic)
mastery/setup_state/__init__.py                         +      exports
mastery/knowledge/bank.py                               ~     construction extracted into ONE public function
mastery/tests/test_setup_state_isolation.py             +     two consumer modules declared
mastery/tests/test_setup_state_backwards_compat.py      +     bank.py named, with its reason
mastery/tests/test_gr1_champion_slice_profiles.py       +     its footprint guard names bank.py
```

`scenario.py` (the cooldown family and its prompt), `lab.py`, `progression.py`, `slice_profile.py`,
`sequence*.py`, `window.py`, `derive.py`, the publication gate, its preflight, the resolver, the
knowledge contract, the projection, `mastery_slice.py`, the Lab route and every `quiz/` file are
**unmoved** — pinned by the new suite's footprint test.

---

## 1. Audit of the existing `champion_stat_level` (read before any edit)

There are **two** implementations of the one family, and they agree on the question and disagree on
a few edges.

| | Practice runtime | Champion Mastery (Knowledge Bank) |
|---|---|---|
| Where | `quiz/champion_stat_authority.askable_level_facts` + `quiz/runtime_casual` (QCA8 made it RUNTIME) | `mastery/knowledge/bank._project_level_stats` |
| Family | `champion_stat_level` (`quiz.family_contract`; QCA8 modes `('practice','mastery')`) | category `CHAMPION_LEVEL_STAT`, hint `champion_stat_level` → the gate maps it to that family |
| Levels asked | `LEVELS = (11, 18)` | `BANK_LEVELS = (6, 11, 18)`; **level 1 excluded by name** (`LEVEL_EXCLUDED_AS_REDUNDANT_WITH_BASE`) |
| Stats | hp, ad, armor, mr, mp | every `STAT_METRICS` entry except the flat three: hp, ad, armor, mr, **mana, hp5, mp5** |
| Arithmetic | `value_at` → `champion_stat_profile.riot_level_multiplier` | `ChampionFactSet.resolve(metric, FactContext(champion_level=L))` → the same curve |
| Refusals | not level-scaled; **zero growth for this champion**; resource not Mana; no row | flat metrics; ineligible certification; mana only where the resource authority says Mana |
| Identity | runtime key `champion_stat_level:v1:at_level:<Champ>:<stat>:lvl<L>` | `ChampionQuestionCandidate` material: category, champion_id, **context (champion_level)**, interaction_kind, metric, subject_ref `""`, template `champion_stat_at_level` |
| Prompt | runtime composer's own | `PromptTemplate.CHAMPION_STAT_AT_LEVEL` |

**The six questions, answered.**

1. **What does the existing family calculate itself?** Nothing, in either path. Practice calls
   `riot_level_multiplier`; the bank calls the projection, which calls it. There is one curve.
2. **What can come directly from `ResolvedState`?** `<stat>.at_level` for health, attack damage,
   armor, magic resist, resource (mana), health regen and resource regen. Phase 2's `derive.py`
   produces it with **exactly the bank's call** — `fact_set.resolve(metric,
   FactContext(champion_level=level))` — so the state's number and the bank's answer are the same
   number by construction, not by agreement.
3. **Which stats are intrinsic canonical facts?** The base value of every stat, and its scaled value
   at a level (the level is the fact's own context axis). Level-scaled attack speed is **not** a
   projected fact (its growth is a percentage of the ratio; the projection refuses the axis with
   `attack_speed_growth_unsupported`).
4. **Which are scenario/state-dependent?** `<stat>.total` / `.bonus` (items), movement speed total,
   ability haste, effective cooldowns. **None of them is read by this family.**
5. **Which identity semantics must be preserved?** The bank's: champion + metric + level in the
   intrinsic `FactContext`, no binding, the `champion_stat_level:<Display>:<stat>:lvl<L>` key and the
   `<champion>:<metric>:lvl<L>` redundancy group. Level 1 is not a level question.
6. **Can it be adapted behind a state-aware seam without changing serving?** Yes. The bank's
   construction was extracted, unchanged, into one public function; the state path calls it; a
   `families=` keyword on the Lab path defaults to cooldown-only.

---

## 2. Reuse, not duplication

```
mastery/knowledge/bank.py
    _project_level_stats(...)                       the bank's ask-list loop, unchanged
        -> level_stat_candidate(fact_set, fact, display_name=, registry=)   NEW public name
                                                    the construction, moved verbatim
mastery/setup_state/stat_scenario.py
    generate_stat_at_level(state, fact_set=)        reads state.<stat>.at_level,
        -> level_stat_candidate(...)                THE SAME constructor
```

* **One family id.** `CHAMPION_STAT_AT_LEVEL.family_id == "champion_stat_level"`. A test fails if a
  `state_champion_stat…` id ever appears.
* **One constructor.** A test rebuilds every bank level-stat candidate through
  `level_stat_candidate` and requires `to_dict()` equality for three champions; another requires a
  state at levels 6, 11 and 18 to produce the bank's candidate **field for field** — same
  `candidate_id`, same `content_digest`, same `to_dict()`.
* **No formula.** An AST test over `stat_scenario.py` forbids `riot_level_multiplier`, `value_at`,
  `linear_at`, `champion_stat_profile`, any `_per_level` column, any `champion_stats` read and any
  float literal. The module cannot disagree with the curve because it cannot compute one.
* **No second stat table.** The metric list is `derive.stat_families()`, iterated; admission is read
  off each derived value's status. The module keeps exactly one piece of stat knowledge of its own,
  a declared premise pair — mana regeneration presupposes a mana pool — and reads the pool's status
  from the state to apply it.

---

## 3. State-aware semantics

```
StateAwareFamily(
  family_id              = "champion_stat_level"          the declared family
  generation_id          = "setup_state_stat_at_level.v1"
  required_axes          = ("level",)
  optional_axes          = ()
  bound_metrics          = ()                              nothing bound
  answer_metric_template = "{stat}.at_level"
  binding_precision      = {}
)
```

A state supplies the **level**. A candidate asks for a stat derived from that state. The answer is
the state's `<stat>.at_level`; the projected fact at the same level supplies `fact_refs`; if the two
disagree the stat is skipped `fact_disagrees_with_state` (a test tampers a state's value by +1 and
sees the refusal) — the question is never published from whichever was read last.

**Intrinsic only (§13 of the brief).** `.total` and `.bonus` are deliberately not read. Items, runes,
shards, position, form and ranks never reach the answer, so they never reach the identity — and a
derived value that declares a dependency outside `level` is refused
(`hidden_scenario_dependency`, tested by tampering `armor.at_level.depends_on`). A "health under
items" question is a different family with a scenario binding; it is not this phase's.

---

## 4. Supported-metric matrix

At level 9, all 173 champions (LEVEL source):

| Derived metric | Admitted | Refused | Reason (the family's own word) |
|---|---|---|---|
| `health.at_level` | **173** | 0 | — |
| `attack_damage.at_level` | **172** | 1 (Senna) | `stat_does_not_grow_for_champion` |
| `armor.at_level` | **172** | 1 (Thresh) | `stat_does_not_grow_for_champion` |
| `magic_resist.at_level` | **173** | 0 | — |
| `health_regen.at_level` | **172** | 1 (Briar) | `stat_does_not_grow_for_champion` |
| `resource.at_level` (mana) | **145** | 28 | `resource_not_held` — the canonical resource authority says no mana pool |
| `resource_regen.at_level` (mana regen) | **145** | 28 | `resource_not_held` — presupposes a mana pool; `champion_stats.mp5` holds energy regen for the 6 energy champions |
| `movement_speed.at_level` | 0 | 173 | `stat_not_level_scaled` (the state says `not_applicable`) |
| `attack_range.at_level` | 0 | 173 | `stat_not_level_scaled` |
| `attack_speed.at_level` | 0 | 173 | `no_projected_fact` — the state CAN derive it, Mastery publishes no certified level fact (172); one champion's does not grow either |
| any `.total` / `.bonus` | — | — | not read: item-dependent (§3) |

**Whole-state refusals:** no level (`required_axis_absent`); a matchup state
(`state_kind_unsupported`); a **stated form** (`form_stat_unmodelled` — canonical base stats are one
row per champion and no derivation reads a number from form, so Mega Gnar would be answered from Mini
Gnar's row; without a stated form Gnar is asked the canonical row, exactly as the bank does);
nothing askable (`no_candidate_in_state`).

**Special cases, each explicitly checked:** resource-less (Garen: no resource questions), energy
(Akali: never a mana question, never a zero), zero-growth (Senna AD, Thresh armor, Briar hp5 at
levels 2/9/18), special-form (Gnar above), rank-domain champions (§12). Nothing unsupported is ever
turned into zero or a default.

---

## 5. Identity

Identity is the bank's intrinsic material: champion, metric, `FactContext(champion_level)`. **No
`ScenarioBinding`** — so no `scenario_binding` key is added and the identity *is* the bank's.

| Case | Result | Test |
|---|---|---|
| state at level 6/11/18 vs the bank's level question | **same** `candidate_id`, `content_digest`, `to_dict()` | `test_a_state_at_a_bank_level_asks_the_banks_question_exactly` |
| same level from the production level run vs a literal template | **same** ids | `test_two_sources_of_one_state_ask_one_question` |
| level 7 plain / + Rocketbelt / + ranks (three `semantic_state_key`s) | **same** ids and digests | `test_unrelated_axes_do_not_move_a_stat_question` |
| level 6 vs level 7 | **different** ids and different answers, every metric | `test_a_level_that_changes_the_answer_is_a_different_question` |
| provenance, sequence, profile, presentation ordinal | not in the material at all | structural (the bank's material) |

---

## 6. Static / flat cases — the level question

* **Flat metrics** (movement speed, attack range) are not level questions at all; the state marks
  them `not_applicable` and the family refuses them.
* **Zero growth for this champion** is refused rather than asked at every level. Level IS part of
  this family's established identity, so a zero-growth stat asked at levels 2–18 would be 17
  "distinct" semantic questions with one answer — manufactured by the state ordinal. The Practice
  composer already refuses exactly this; the rule is read off the state (`.at_level == .base` above
  level 1), not off a column.
* **Consequence in the universe:** over a level run, every admitted stat changes every level, so a
  stat question is **never shared** across states (`source_ordinals` has length 1 — asserted), while
  flat cooldowns still collapse across the run. Across equivalent states (same level, different
  items) a stat question **does** collapse, and `source_ordinals` keeps every producer (asserted:
  `(0, 1)`).
* **Level 1 — the one genuine product ambiguity, documented, not changed.** At level 1 the scaled
  value *is* the base stat. The bank excludes it by name ("the same question twice with different
  wording") and Practice never asks it, so this family refuses it
  (`level_redundant_with_base`). The cost is measurable: every remaining Snapshot underfill in the
  roster sweep (§11) is a seed-`alpha` Snapshot that anchored on **level 1**. Whether "What is X's
  health at level 1?" should be askable when the base-stat family (`champion_base_stat`) remains
  unservable (`family_unmapped`) is an owner decision; nothing was widened here.

---

## 7. Current-family invariance

* **Practice `champion_stat_level`**: no `quiz/` file changed; all **1,670** askable Practice
  questions compose byte-identically (§14).
* **Champion Mastery `champion_stat_level`**: `bank.py`'s only change is the extraction; all
  **173** banks (every candidate's id, digest, key and `to_dict()`, and every skip) are
  byte-identical (§14).
* **The default Lab path**: `generate_over_window(..., families=None)` is the cooldown family alone.
  Every existing profile/window diagnostic is byte-identical, including one rendered through the
  real publication path; no new diagnostic key appears unless a mixed set was asked for.

---

## 8. One state-aware candidate universe

```
resolved states
  -> every requested family, per state        families.py: (family, generator) in declaration order
  -> one pool per state                       eligible_candidates + dedupe_by_effective_question,
                                              over BOTH families' candidates together
  -> one semantic universe                    build_candidate_universe, collapse on candidate_id()
                                              (each entry now carries ITS family id)
  -> gate-aware composition                   unchanged search, unchanged gate
  -> FrozenStateBundle                        per-family narrowing of derived_used
```

* **Opt-in:** `families=FA.ALL_FAMILIES` (or ids). `None` = `COOLDOWN_ONLY`. Unknown, duplicate or
  empty requests are refused.
* **A family refusing a state does not make it barren.** Karma's level states: the cooldown family
  says `required_axis_absent`, the stat family produces; the refusal is kept per state
  (`family_refusals`, prefixed with the family id). A state is barren only when **every** family
  refused — then with their shared code, or `no_candidate_in_state`, and every family's own words.
* **The composer's one change is generic:** `build_candidate_universe(..., family_ids=)` maps
  `candidate_id → family_id` so a mixed universe's entries carry the right family. The composer
  names no family, metric or stat (text + import test).

## 9. Family mixing

* A **Snapshot** at one state now holds health, armor, MR, mana, regen **and** cooldowns — Ahri's
  seed-`alpha` level-14 Snapshot at budget 4 picks one stat and three cooldowns.
* The existing **soft subject spread** does the mixing: a state's queue is bucketed by `subject_ref`,
  so a stat (subject `""`) competes as one bucket beside Q/W/E/R. There is **no** "one question per
  family" rule — Karma's level run fills every profile's budget of 4 from the stat family alone
  (asserted).
* **No duplicate effective question** in any mixed set (asserted across 5 profiles × 2 champions ×
  budget 4 with the adapter's own `effective_question_key`); the preflight still refuses a set that
  repeats one (asserted); a mixed Tight set renders through the **production** `publish`.
* **Observation, not changed:** because every stat question shares `subject_ref ""`, the soft
  spread does not prefer *different metrics* — Karma's Tight picked health regen at levels 11 and 12.
  Two different questions, both legal. Bucketing by metric would be a composition-policy decision
  (it would apply to every family), so it is recorded, not made.

Share of stat questions in feasible mixed sets (rank-bearing arm, 164 champions): Snapshot 0.30
(b=3) / 0.37 (b=4), Tight 0.52 / 0.51, Early Phase 0.18 / 0.30, Wide 0.39 / 0.43, Full Range 0.28 /
0.28.

---

## 10. Profile impact — representative champions

Seed `alpha`, level progression source. "ranks" = level + the progression suite's stated harness
skill order; "level" = pure level run. *gen* = candidates generated across the scope's states;
*sem* = the semantic universe (cooldown + stat). **A** = cooldown-only (before), **B** = cooldown +
stat (after).

| champion | arm | profile | b | A gen/sem | B gen/sem (cd+stat) | A | B | B families | B levels |
|---|---|---|---|---|---|---|---|---|---|
| ahri | ranks | snapshot | 3 | 4/4 | 11/11 (4+7) | 3/3 | 3/3 | cd+stat | [14] |
| ahri | ranks | snapshot | 4 | 4/4 | 11/11 (4+7) | 4/4 | 4/4 | cd+stat | [14] |
| ahri | ranks | tight | 3 | 10/4 | 31/25 (4+21) | 3/3 | 3/3 | cd+stat | [11, 12, 13] |
| ahri | ranks | tight | 4 | 10/4 | 31/25 (4+21) | 4/4 | 4/4 | cd+stat | [11, 12, 13] |
| ahri | ranks | early_phase | 3 | 12/3 | 47/38 (3+35) | 3/3 | 3/3 | cd+stat | [2, 4, 6] |
| ahri | ranks | early_phase | 4 | 12/3 | 47/38 (3+35) | **3/4 ✗** | **4/4** | cd+stat | [2, 3, 4, 6] |
| ahri | ranks | wide | 3 | 27/4 | 97/74 (4+70) | 3/3 | 3/3 | cd+stat | [2, 6, 11] |
| ahri | ranks | wide | 4 | 27/4 | 97/74 (4+70) | 4/4 | 4/4 | cd+stat | [2, 4, 6, 11] |
| ahri | ranks | full_range | 3 | 54/10 | 173/129 (10+119) | 3/3 | 3/3 | cd+stat | [2, 10, 18] |
| ahri | ranks | full_range | 4 | 54/10 | 173/129 (10+119) | 4/4 | 4/4 | cd+stat | [2, 6, 10, 18] |
| jarvan-iv | ranks | snapshot | 3 | 2/2 | 9/9 (2+7) | **2/3 ✗** | **3/3** | cd+stat | [4] |
| jarvan-iv | ranks | snapshot | 4 | 2/2 | 9/9 (2+7) | **2/4 ✗** | **4/4** | cd+stat | [4] |
| jarvan-iv | ranks | tight | 3/4 | 9/5 | 30/26 (5+21) | 3/3 · 4/4 | 3/3 · 4/4 | cd+stat | [7, 8, 9] |
| jarvan-iv | ranks | early_phase | 3/4 | 12/6 | 47/41 (6+35) | 3/3 · 4/4 | 3/3 · 4/4 | cd · cd+stat | [2,4,6] · [2,3,4,6] |
| jarvan-iv | ranks | wide | 3/4 | 27/11 | 97/81 (11+70) | 3/3 · 4/4 | 3/3 · 4/4 | cd+stat | [2,6,11] · [2,6,9,11] |
| jarvan-iv | ranks | full_range | 3/4 | 54/14 | 173/133 (14+119) | 3/3 · 4/4 | 3/3 · 4/4 | cd+stat | [2,10,18] · [2,6,10,18] |
| teemo | ranks | snapshot | 3/4 | 1/1 | 8/8 (1+7) | **1/3 ✗ · 1/4 ✗** | **3/3 · 4/4** | cd+stat | [3] |
| teemo | ranks | tight | 3/4 | 2/1 | 16/15 (1+14) | **1/3 ✗ · 1/4 ✗** | **3/3 · 4/4** | cd+stat | [2, 3] |
| teemo | ranks | early_phase | 3/4 | 5/1 | 40/36 (1+35) | **1/3 ✗ · 1/4 ✗** | **3/3 · 4/4** | cd+stat | [2,4,6] · [2,3,4,6] |
| teemo | ranks | wide | 3/4 | 10/1 | 80/71 (1+70) | **1/3 ✗ · 1/4 ✗** | **3/3 · 4/4** | cd+stat | [2,6,11] · [2,6,8,11] |
| teemo | ranks | full_range | 3/4 | 23/2 | 142/121 (2+119) | **2/3 ✗ · 2/4 ✗** | **3/3 · 4/4** | cd+stat | [2,8,13] · [2,8,13,18] |
| karma | level | snapshot | 3/4 | 0/0 | 7/7 (0+7) | **0 ✗** (`required_axis_absent`) | **3/3 · 4/4** | stat | [4] |
| karma | level | tight | 3/4 | 0/0 | 21/21 (0+21) | **0 ✗** | **3/3 · 4/4** | stat | [11, 12, 13] |
| karma | level | early_phase | 3/4 | 0/0 | 35/35 (0+35) | **0 ✗** | **3/3 · 4/4** | stat | [2,4,6] · [2,3,4,6] |
| karma | level | wide | 3/4 | 0/0 | 70/70 (0+70) | **0 ✗** | **3/3 · 4/4** | stat | [3,7,11] · [3,7,9,11] |
| karma | level | full_range | 3/4 | 0/0 | 119/119 (0+119) | **0 ✗** | **3/3 · 4/4** | stat | [6,10,18] · [6,10,14,18] |
| garen (no resource) | ranks | snapshot | 3/4 | 4/4 | 9/9 (4+5) | 3/3 · 4/4 | 3/3 · 4/4 | cd+stat | [14] |
| garen | ranks | early_phase | 3/4 | 12/5 | 37/30 (5+25) | 3/3 · 4/4 | 3/3 · 4/4 | cd+stat | [2,4,6] · [2,4,5,6] |
| garen | ranks | full_range | 3/4 | 54/14 | 139/99 (14+85) | 3/3 · 4/4 | 3/3 · 4/4 | cd | [1,6,13] · [1,6,13,18] |
| akali (energy) | ranks | snapshot | 3/4 | 4/4 | 9/9 (4+5) | 3/3 · 4/4 | 3/3 · 4/4 | cd · cd+stat | [16] |
| akali | ranks | tight | 3/4 | 9/4 | 24/19 (4+15) | 3/3 · 4/4 | 3/3 · 4/4 | cd+stat | [7, 8, 9] |
| akali | ranks | full_range | 3/4 | 54/14 | 139/99 (14+85) | 3/3 · 4/4 | 3/3 · 4/4 | cd+stat | [6,12,18] · [1,6,12,18] |

A resource-less or energy champion supplies **5** stat questions per state instead of 7 — health,
AD, armor, MR, health regen — and never a mana one.

---

## 11. Roster-wide profile impact (173 champions, seed `alpha`)

### 11.1 LEVEL source — the trusted source, all 173

| profile | b | A feasible | **B feasible** | B underfilled (reason) | A sem | **B sem median (min–max)** |
|---|---|---|---|---|---|---|
| snapshot | 3 | 0 / 173 | **163 / 173** | 10 — anchor at **level 1** (`no_candidate_in_state` + `semantic_supply_below_budget`) | 0 | 7 (0–7) |
| snapshot | 4 | 0 / 173 | **163 / 173** | same 10 | 0 | 7 (0–7) |
| tight | 3 | 0 / 173 | **173 / 173** | — | 0 | 21 (10–21) |
| tight | 4 | 0 / 173 | **173 / 173** | — | 0 | 21 (10–21) |
| early_phase | 3 | 0 / 173 | **173 / 173** | — | 0 | 35 (20–35) |
| early_phase | 4 | 0 / 173 | **173 / 173** | — | 0 | 35 (20–35) |
| wide | 3 | 0 / 173 | **173 / 173** | — | 0 | 70 (40–70) |
| wide | 4 | 0 / 173 | **173 / 173** | — | 0 | 70 (40–70) |
| full_range_sample | 3 | 0 / 173 | **173 / 173** | — | 0 | 119 (68–119) |
| full_range_sample | 4 | 0 / 173 | **173 / 173** | — | 0 | 119 (68–119) |

A: every run refuses with the cooldown family's own `required_axis_absent` (a pure level run states
no ranks). B: the ten Snapshot underfills are brand, briar, gwen, jinx, karthus, malphite, rengar,
shaco, varus, yorick — **every one** a seed that anchored on level 1 (verified). No gate-limited
underfill anywhere.

### 11.2 Rank-bearing source (level + stated order), 164 champions — before vs after

| profile | b | A feasible | **B feasible** | A underfills | B underfills | A sem median (min–max) | **B sem** |
|---|---|---|---|---|---|---|---|
| snapshot | 3 | 92 | **157** | 72 (70 supply, 2 barren) | 7 supply | 3 (0–4) | 9 (1–11) |
| snapshot | 4 | **28** | **157** | 136 | 7 supply | 3 (0–4) | 9 (1–11) |
| tight | 3 | 138 | **164** | 26 (incl. Ryze, gate) | **0** | 4 (0–6) | 25 (12–27) |
| tight | 4 | 116 | **164** | 48 (incl. Ryze, gate) | **0** | 4 (0–6) | 25 (12–27) |
| early_phase | 3 | 146 | **164** | 18 | **0** | 5 (0–6) | 39 (24–41) |
| early_phase | 4 | 130 | **164** | 34 | **0** | 5 (0–6) | 39 (24–41) |
| wide | 3 | 155 | **164** | 9 | **0** | 8 (0–11) | 77 (47–81) |
| wide | 4 | 146 | **164** | 18 (incl. Kog'Maw, gate) | **0** | 8 (0–11) | 77 (47–81) |
| full_range_sample | 3 | 162 | **164** | 2 (Aphelios, Teemo) | **0** | 14 (0–18) | 132 (77–137) |
| full_range_sample | 4 | 159 | **164** | 5 | **0** | 14 (0–18) | 132 (77–137) |

The A column reproduces the slice-profile phase's published numbers exactly (92/28, 138/116,
146/130, 155/146, 162/159). B's 7 Snapshot underfills (fiddlesticks, gwen, kayn, nautilus, nocturne,
sivir, ziggs) each have `feasible_count` 1: the seed anchored on **level 1**, where the cooldown
family has its one learned ability and the stat family refuses level 1 (§6). The two gate-limited
cases the previous phase recorded (Ryze, Kog'Maw) fill once stat questions exist, because the
search no longer has to use a colliding cooldown pair. **No policy was altered to produce any of
these numbers.**

**Reading.** The second family is not a marginal addition. Snapshot at budget 4 goes from 28/164 to
157/164, and the LEVEL source — fully trusted, 173/173, and barren for cooldowns — becomes a
productive source for every profile. Tight, Early Phase, Wide and Full Range have no underfill left
in either arm.

---

## 12. The nine rank-bearing gaps (LEVEL mode; their rank rules are NOT fixed)

| champion | rank-bearing run | LEVEL, cooldown-only | **LEVEL, + stat** | stat metrics | full-range semantic |
|---|---|---|---|---|---|
| elise | refused `rank_rule_unsupported` | 0 on every profile | **all 5 profiles, b=3 and 4** | 7 | 119 |
| jayce | refused `rank_rule_unsupported` | 0 | **all 10 cells** | 7 | 119 |
| karma | refused `rank_rule_unsupported` | 0 | **all 10 cells** | 7 | 119 |
| nidalee | refused `rank_rule_unsupported` | 0 | **all 10 cells** | 7 | 119 |
| udyr | refused `rank_rule_unsupported` | 0 | **all 10 cells** | 7 | 119 |
| yuumi | refused `rank_rule_unsupported` | 0 | **all 10 cells** | 7 | 119 |
| dr-mundo | refused `unknown_ability_slot` | 0 | **all 10 cells** | 5 (no mana) | 85 |
| nunu | refused `unknown_ability_slot` | 0 | **all 10 cells** | 7 | 119 |
| renata | refused `unknown_ability_slot` | 0 | **all 10 cells** | 7 | 119 |

**All nine gain usable questions; none still fails.** The rank-bearing run still refuses for each —
asserted, because the gap is a rank-rule / identity-name gap, and neither was touched. The stat
family reads only the level and the canonical stat row, which the three name-mismatch champions
resolve (Phase 2 already derived their stats; only their kit lookup misses). Nidalee, Elise and
Jayce are asked their canonical row, not a form's: a stated form would refuse (§4).

---

## 13. FrozenStateBundle

* **`derived_used` narrows per family.** A state whose selected steps are all stat questions freezes
  exactly those steps' `<stat>.at_level` values — not the other admitted stats, not the base values
  the zero-growth check read, and **not `ability_haste.total`** (the cooldown family's bound input),
  because no cooldown question was selected there. A mixed state freezes the haste and the selected
  cooldown's metrics plus the selected stats' values, and nothing else. Asserted in the suite and
  on **every feasible run of the 6,740-run roster sweep**.
* **Step bindings:** a stat step carries `family_id="champion_stat_level"`, `answer_metric`,
  `candidate_id`, `content_digest` and an **empty** binding; the bundle declares only families some
  selected step belongs to.
* **Round trip:** `to_dict → JSON → from_dict → to_dict` is exact, and verification finds only the
  informational digest note. *(Pre-existing and unchanged: a restored bundle is not `==` the
  original object because `derivation_support` deserializes to an equal-plain but differently-typed
  value; the existing cooldown-only bundle behaves identically, which is why every GR1 suite compares
  plain forms.)*
* **Offline:** `assert_frozen_bundle` passes with `sqlite3.connect` monkeypatched to raise — no live
  re-resolution. Nothing is persisted (`is_persisted: false`); zero non-informational findings
  across the sweep.

## 14. Current-serving invariance

A read-only probe, run in `~/lcs-wt-gr1-stats-base` (@ `c2634d8a`) and in the branch worktree
against the same database:

```
173 Mastery Knowledge Banks      every candidate: id, content_digest, key, to_dict(); every skip
1,670 Practice champion_stat_level questions, composed by quiz.runtime_casual
78 default Lab diagnostics       6 champions x 5 profiles x budgets 3/4 (one Tight rendered through
                                 the production publish) + gate-aware window diagnostics at 1/2/3,
                                 including identical refusals

RESULT: both dumps 22,803,913 bytes, cmp IDENTICAL.
```

Structurally: `mastery_slice.py` and the Lab route name nothing new; `parse_mastery_slice_config`
refuses `state_aware`, `champion_stat_level` and `families`; no production module imports
`stat_scenario` or `setup_state.families`; `scenario.FAMILIES` is still the cooldown family alone;
`default_sequence_registry()` is still empty; no migration, no `.sql`, no frontend path in the diff.

## 15. Isolation

| Claim | Held by |
|---|---|
| source knows no stat family | `progression.py`, `sequence.py`, `window.py` name no `stat_scenario`, `families`, `champion_stat_level`, `at_level` (text test); `progression.py` unmoved |
| profile knows no stat family | same test over `slice_profile.py`; unmoved |
| composer has no stat special case | `composition.py` names no family, metric or stat and imports no generator (text + import test); its one change is a generic `family_ids` map |
| stat family knows no profile/window/composer | `stat_scenario.py` names no `slice_profile`, `snapshot`, `early_phase`, `full_range`, `window`, `composition` |
| only one table names both generators | `families.py` |
| consumer-half rules | both new modules declared `CONSUMER_MODULES`; they pass the deferred-import, no-game-rule-number and no-slot-letter guards |

## 16. Tests

`/Users/macmoney/League_Combat_Simulator/.venv/bin/python -m pytest … -p no:randomly`, with
`lol_calc.db` symlinked read-only.

**New: `mastery/tests/test_gr1_state_aware_champion_stats.py` — 79 passed.** Existing-family identity
and the one constructor; the pinned bank key shape; bank-level equality at 6/11/18; Practice still
composes; state as numerical authority (including a tampered state refused); no formula; the metric
matrix (mana, resource-less, energy, three zero-growth champions × three levels, level 1, no level,
form, hidden dependency, matchup); unrelated axes, level sensitivity, two sources, no binding key;
equivalent-state collapse with `source_ordinals`; stat questions never shared across a level run;
presentation only at a producer (5 profiles); default = cooldown only; family-request validation;
one pool per state; per-family refusal vs barren; mixed Snapshot; no duplicate effective question;
production `publish` accepts a mixed set; the preflight still judges it; no one-per-family rule;
**every profile × budget 3/4** for Ahri, Karma (LEVEL), Garen and Teemo; the before/after expansion;
scope independent of budget; determinism; **173-champion LEVEL compatibility**; **the 9 rank-gap
champions × 5 profiles × 2 budgets**; bundle narrowing (stat-only, mixed, four seeds); round trip;
offline verification; nothing persisted; diagnostics mixed and default shapes; isolation; serving
invariance; footprint.

**Regression arm — `mastery/tests`, same command on both worktrees:**

```
base   c2634d8a (detached):            5 failed, 2556 passed, 14 skipped
branch 81e5b24d (committed, rebased):  5 failed, 2648 passed,  7 skipped

failure SET identical by name, all pre-existing:
  test_audit_db.py::test_pool_and_certified_counts
  test_audit_db.py::test_lux_q_cooldown_conflict_surfaced
  test_audit_db.py::test_json_roundtrips_and_schema
  test_mastery_per_question_reveal.py::test_reveal_needs_no_new_persistence
  test_phase4f_ranked_mastery_slice.py::test_format_for_creation_is_unaffected_by_this_module
```

Counts reconcile: 2556 + 79 (new file) + 6 (isolation cases for the two new consumer modules) = 2641;
+ 7 committed-footprint guards that skip on a detached base and run on a committed branch = **2648**.

**Ranked / Mastery integration arm** (`test_ranked_mastery_applied_chain`, `…artifact_persistence`,
`…on_demand`, `…reveal_e2e`, `…reveal_secrecy`, `test_mastery_ranked_capsule`, `test_mastery_artifact`,
`test_mastery_integration`, `test_ranked_prototype`, `test_mc1_static_content_retirement`,
`test_qca8_recognition_and_stat_runtime`, `test_dc1_phase6_question_families`): **2 failed, 331 passed
on both**, identical — the pre-existing pinned capsule id/digest pair.

**Focused arm, before committing:** every existing `test_setup_state_*` + `test_gr1_*` test passed
over the modified `window_lab.py` / `composition.py` (1124 passed) except the three
footprint/module-set guards this phase then updated deliberately (§15).

No frontend test was run: no frontend file changed.

---

## 17. Generator Lab diagnostics (backend only)

`profile_diagnostic(..., families=ALL_FAMILIES)` and `window_diagnostic(..., families=…)` gain a
`family_supply` block — **only** when more than one family was requested:

```
family_supply
  requested_families              ["combat_cooldown", "champion_stat_level"]
  semantic_candidates_by_family   {"combat_cooldown": 3, "champion_stat_level": 35}
  per_state[]                     ordinal, level, generated{family: n}, pooled{family: n},
                                  semantic_candidates, family_refusals[], barren_reason
  selected_family_ids             ["champion_stat_level", "combat_cooldown"]
  selected[]                      candidate_id, family_id, answer_metric, subject_ref,
                                  presentation_ordinal, presentation_level, source_ordinals
  selected_presentation_levels    [2, 3, 4, 6]
```

Each state's `to_dict()` gains a `families` list (generated / pooled / refusal) under the same
condition. Feasibility is the existing `infeasibility` / `composition_feasibility`. No route.

## 18. Remaining gaps and open decisions

* **Level 1** (§6) — refused by the existing family's rule; costs every remaining Snapshot underfill.
  Owner decision, together with `champion_base_stat`'s unservability.
* **Metric diversity inside a set** — stat questions share one subject bucket (§9). A composition
  policy decision for all families, not a stat rule.
* **Existing-bank false premise, surfaced not fixed:** the Mastery bank's own `champion_stat_level`
  candidates include **"base mana regen"** for the **28** champions with no mana pool (it gates
  `base_mana` on the resource authority but not `base_mana_regen`; for the 6 energy champions the
  column holds energy regen). The state-aware path refuses it; the bank is unchanged here because
  changing it would move live Mastery content. **Integration recheck (2026-09-21): still present,
  deliberately NOT fixed.** All 28 still carry `champion_base_stat:<Name>:mp5` *and*
  `champion_stat_level:<Name>:mp5:lvl11` / `lvl18` in the live bank; the state-aware family admits
  neither `resource` nor `resource_regen` for any of them. Tracked as a separate content-quality bug.
* **Item-modified stats** (`.total`) — a separate family with a scenario binding.
* **Form-dependent stats** (Mega Gnar, Kled/Skaarl) — no canonical per-form stat store.
* **Attack speed at level** — derivable, but no certified projected fact.
* Unchanged from before: the prompt-rank decision; which profiles enter Ranked and with what
  weights; checkpoint concentration vs replayability; refuse / re-draw / ship-fewer for an
  unfillable budget; Snapshot's tier; the 9 rank-bearing gaps upstream; State Context UI.

## 19. Next phase options (pick one; none started)

1. **Profile distribution experiment (Lab-only)** — now meaningful: with two families every profile
   fills almost everywhere, so profile × seed × roster can measure *variety* rather than
   feasibility, and inform which profiles Ranked could carry. Still no wiring.
2. **Owner decisions that now bind supply more than code does** — level 1 as a question; metric
   diversity inside a set; the prompt-rank question.
3. **A third state-aware family** — ability resource cost at rank (the state already derives
   `ability.<slot>.cost` in the row's own resource) — or item-modified totals with a binding.
4. **Close the 9 rank-bearing gaps upstream** — they are no longer blocked for LEVEL-state
   questions, only for rank-state ones.

**Explicitly not next:** Ranked wiring, a `mastery_slice` family/profile mode, Full, Matchup
profiles, persistence of a served bundle, State Context UI.

**Rollback:** revert the backend commit. Nothing persisted, no route, no migration, no frontend.

## Integration (2026-09-21)

Measurements above are implementation-time and kept as history. Integration recheck:

* Backend rebased `81e5b24d` → **`1090633f`** onto `origin/master` `71919f50` (Cinderbloom item
  lane, 14 item/runtime files, zero overlap with `mastery/`, stat authority, bank, composition or
  Slice/Ranked paths). Pushed to `origin/master`.
* `bank.py` diff re-audited: pure extraction into `level_stat_candidate` (same key, template, hint,
  category, redundancy group, registry).
* Invariance vs `71919f50`: 173 banks, 1,670 Practice `champion_stat_level` questions and 213 default
  Lab diagnostics (173 LEVEL-arm Full Range b=4 + Ahri/Jarvan IV/Teemo/Garen × 5 profiles × b=3/4)
  dump `cmp`-identical.
* `mastery/tests` + Ranked/Slice suites: 5 failed / 2703 passed vs base 5 / 2611, failure SET
  identical (audit_db ×3, per-question-reveal, phase4f format-for-creation — all pre-existing).
* Supported metrics unchanged: health 173, MR 173, AD 172, armor 172, hp5 172, mana 145, mp5 145;
  move speed / range / attack speed 0.
* Roster (164 rank-arm + 9 LEVEL-arm = 173), cooldown-only → mixed: Snapshot b3 92→166, b4 28→166;
  Tight 138/116→173/173; Early 146/130→173/173; Wide 155/146→173/173; Full 162/159→173/173.
  Nine rank-gap champions in LEVEL mode: 0 → feasible on all 5 profiles × b=3/4.

