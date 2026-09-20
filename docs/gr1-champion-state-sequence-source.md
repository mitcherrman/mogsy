# GR1 — the first production Champion `StateSequenceSource`

**IMPLEMENTED, COMMITTED, NOT PUSHED.** This phase adds the first real, deterministic,
replaceable Champion progression source, and wires it into nothing a player can reach. Champion
Mastery serving, Matchup Mastery, Ranked, the current Slice, `_pattern_group`, the persistence seam
and the cooldown prompt are byte-for-byte unchanged; no `mastery_state` is written; Full does not
exist; no Matchup source was added; no DB migration, no route and no frontend.

| | SHA | Note |
|---|---|---|
| Backend base | `origin/master` **`399c8e60`** | The handoff named `0ce7b531`; `origin/master` had already moved twice, and it moved again **during** this phase (`cffa85f0` → `399c8e60`, RFX1 presentation lead-in). Implemented on `cffa85f0`, rebased forward onto `399c8e60` — **zero file overlap**. |
| Backend commit | **`e7436166`** | Branch `gr1/champion-sequence-source`, worktree `~/lcs-wt-gr1-src`. **INTEGRATED — pushed to `origin/master` 2026-09-20.** Authored as `bd586737` on `399c8e60`; rebased again at integration onto `cb017087` (minion-execute item semantics, zero file overlap) and re-validated. |
| Comparison base | detached worktree @ **`399c8e60`** | Same symlinked `lol_calc.db`, for the failure-set arm. Re-run after the rebase. |
| Docs base | `origin/main` **`ba710c6f`** | The handoff named `f274f66e`; `origin/main` had also moved. |
| Docs commit | *(this commit — read it with `git log`)* | Branch `gr1/champion-sequence-source-docs`, worktree `~/mogsy-wt-gr1-src`. **Pushed to `origin/main` at integration 2026-09-20**, rebased onto `9f3d3dfa`. |
| Frontend | **none** | None was needed. §10 asked for a diagnostic, not a route. |

**Files: 5 — 2 new, 3 modified, every one inside `mastery/`.**

```
mastery/setup_state/progression.py                        NEW  +815
mastery/tests/test_gr1_champion_progression_source.py     NEW  +905   74 tests
mastery/setup_state/window_lab.py                         +96         the Lab diagnostic
mastery/setup_state/__init__.py                           +31         exports
mastery/tests/test_setup_state_isolation.py               ~14         one module declared RESOLUTION
```

---

## 1. Source authority audit

Read at `cffa85f0`, against the live `lol_calc.db` (173 champions). The audit is what decided the
shape of the source, so it comes first.

| Dimension | Current authority | Trust level | Current enough? | Suitable for a production source? |
|---|---|---|---|---|
| **Level progression** | `mastery/setup_state/rules.py` — `Ruleset.min_level/max_level`, declared as data with the wiki sentence that supplies it, and folded into a derived `rules_rev` | **high** — a rules layer whose whole job is legality | **yes** | **YES.** The ordering is uncontested: a champion's level increases, and the bounds are data that a rules edit moves. |
| **Ability rank legality** | `champion_state.ability_rank_ceiling` (store-guarded) + `rules.rank_availability`, which applies the ordinary 1/3/5/7/9 + 6/11/16 rule **only** to a champion whose rank domain is ordinary and refuses the other six | **high for legality** | **yes, for legality** | **YES, for legality only.** It answers "is rank 4 reachable at level 7". It does not answer "which slot gets the point". |
| **Ability rank ORDER (skill order)** | **NONE.** No table, no file, no column. `grep` over the repository finds `skill_order` only as a field on `SetupRecord` (never populated) and `mastery/chains/syndra_progression.py`, a single hand-authored historical Journey | **none** | **no** | **NO.** The source will normalize an order a caller STATES, with an authority string the caller must supply; it derives none. |
| **Item progression (which items, in which order)** | `quiz/data/champion_item_builds.json`, registered as `curated.item_whitelist.v1`. 173/173 champions, 3 paths each, `needs_manual_review: **true** on every row`, `source_patch_basis: "26.16/26.17 working approximation"` on every row, self-described as "an editable best-effort whitelist and timing prior" | **low** — and Phase 2 already normalizes its confidence DOWN (its own `"high"` on 9 rows is never forwarded) | **usable when named**, not as a default | **YES, but only when explicitly named**, carrying its own provenance, confidence and patch claim. Never silently, and never as "recommended". |
| **Item currency** | `item_canonical`, restricted to `validation_status='validated_current'` **and** `is_current_sr` (WIKI1-1A) | **high** | **yes** | **YES.** Audited: **all 83 distinct items across all 519 curated paths resolve as current SR items.** Zero fail-closed refusals on item currency. |
| **Components** | `item_canonical_components` — `parent_item_id`, `component_item_id`, `quantity`, `component_order`, `source_revision`, from `Module:ItemData` | **high for the RECIPE**, **none for purchase order** | **yes, for the recipe** | **YES, for the recipe.** Audited: all 83 curated items have 1–3 components, `component_order` is never null, `quantity` is 1 or 2, and **every component also resolves as a current SR item**. What the store does *not* say is which component a player buys first — so the source calls its ordering "the recipe order the canonical store publishes" and never a purchase recommendation. |
| **Item TIMING (which level an item arrives at)** | **NONE.** The only thing resembling it is `quiz/champion_item_builds.stage_for_rank` / `item_count_for_stage`, which bucket a rank into early/mid/late — and whose own docstring says it gives "broad build timing **without pretending an exact champion level**" | **none** | **no** | **NO, and this is the single finding that shaped the source.** See §2. |
| **Runes** | `runes` (identity only). `mastery/runes/rune_provenance` is the repository's own statement: no source revision, no captured effect values, no patch binding; every rune `UNVERSIONED` + `UNCERTIFIED`; "rune numerical effects must be excluded from authoritative calculations". The nine `rune_stats` rows are conditional maxima | **identity only** | **no** | **NO.** Carried if a caller states them; never produced, never ordered. |
| **Shards** | **NONE.** No `stat_shards` table, no shard id space anywhere. `normalize.resolve_shard` refuses every shard that exists | **none** | **no** | **NO**, structurally. A shard held across a run still refuses at normalization, and a test pins that. |
| **Role / position** | `primary_role` on the same curated file (Top 50 / Mid 44 / Jungle 35 / ADC 23 / Support 21) | **low**, same row and same caveat as the build path | **usable when named** | **YES, opt-in only** (`include_position`), carrying the curated source's provenance. |
| **Recent / observed builds** | **NONE reachable.** The Pro corpus has **zero item data** (`pro-builds-capability-audit`: NOT READY), and no live build-ingestion feed exists | **none** | **no** | **NO.** No adapter was written for a system that does not exist. |

**Nothing in this source is labelled "recommended".** A test reads every string the source publishes
— presentation phrase, patch basis, classification, provenance note — and fails on `recommended`,
`optimal`, `meta build` or `best build`. A caller-supplied skill-order authority string is checked
the same way at construction.

---

## 2. The correlation the source refuses to invent

The audit's sharpest result is a **negative** one, and it is what makes the rest honest.

Mogzy can defend an order over levels. It can defend an order over items *when it names the curated
file*. It can defend that an item's components come before the item. It **cannot defend any
statement that relates the two** — "Rocketbelt arrives at level 9" has no authority anywhere in the
repository, and the one helper that looks like it might supply one says in its own docstring that it
deliberately does not.

So a run advances **exactly one dimension**:

| `advance` | what moves | ordering authority |
|---|---|---|
| `level` | `level` | the ruleset's declared level bounds |
| `level` + `skill_order` | `level` **and** `ability_ranks` | levels from the rules authority; the rank order is the CALLER's statement, one point per level, every rank legality-checked |
| `items` | `items` | the named curated path |
| `items` + `granularity="components"` | `items` | the curated path, plus each item's canonical recipe order |

An axis that does not advance may still be **stated**, through `held`: a literal value carried
unchanged by every node. The distinction is exact and is the reason `held` is safe — **a constant is
a statement about the whole run; a schedule is a claim about time.** "This item run is at level 11
with these ranks" says nothing about when anything was bought. Holding an axis the advance moves is
refused (`progression_axis_conflict`), which is what keeps "one advancing dimension" a fact about
the code rather than a convention.

`held` is keyed on the existing **closed** axis vocabulary, so role, runes, shards and form are
covered without a field each, and an axis outside it is refused (`unknown_axis`).

---

## 3. The selected source

```
source_id        champion.progression.legal_advance.v1
source_kind      derived_progression
version          progression.champion_legal_advance.v1/1
classification   derived   (a level run)  |  curated  (an item run)
phrase           "a legal progression of states"
```

It names what actually governs the order — a **legal advance** along one declared dimension — and
says neither "recommended" nor "optimal" nor "meta", because no authority for any of the three
exists here.

**Where it lives: the RESOLUTION half of `mastery/setup_state/`.** `sequence_source.py` already
stated the rule one level up — *a source that must READ canonical data to build its templates
belongs in the resolution half and hands its templates in* — and this is the first source for which
that rule bites. It reads the rules authority, `champion_abilities` and `item_canonical`, builds
`StateTemplate` values, and calls the contract half's `build_sequence`. The contract half therefore
still cannot reach a database, and the sequence layer still holds no opinion about what a
progression should be.

### 3.1 The plan is data

```
ProgressionPlan
  champion, advance, ruleset
  from_level, to_level            None => the RULESET's own bounds
  skill_order                     SkillOrder(slots, authority)   — authority REQUIRED
  item_source_id, path_index, item_count, granularity
  include_position, include_empty_inventory
  held                            axis -> literal, constant on every node
  label
```

Changing a run is a request change, not a code change. There is no field whose default silently
asserts something about a champion: `advance` has no default, `skill_order` is absent unless stated,
and `item_source_id` must name a registered setup source by id — an item run with no named source is
refused, because **this module holds no item authority of its own**.

### 3.2 The policy is provenance, not sequence identity

`PROGRESSION_POLICY_ID = "progression.champion_legal_advance.v1"` is recorded as
`SequenceProvenance.source_version`. It is deliberately **not** the sequence's `SequencePolicy`.

A `SequencePolicy` states what "ordered" MEANS, and it means the same thing here as anywhere; two
runs holding the same ordered nodes **are** the same run, whoever ordered them. Had the progression
policy gone into the sequence material, an identical run replayed through `LiteralSequenceSource`
would have been a second sequence with a second identity — which is precisely the replaceability
property §7 of the brief asked to be proved. The run therefore uses `DEFAULT_SEQUENCE_POLICY`, and a
test replays a built run literally and asserts one `sequence_id`, one `semantic_key`, and two
different provenances.

---

## 4. What creates a node

One node per meaningful change in the advancing dimension, and nothing else.

* **Level run:** one node per level in the requested range, the range defaulting to the ruleset's
  own `min_level`/`max_level`. **No level cap exists in this module** — a test monkeypatches the
  ruleset to grant 20 levels and the run becomes 20 nodes long with no source edit.
* **Level + stated order:** the same nodes, each carrying the **complete** rank vector after that
  many points (every slot of the champion's kit appears, rank 0 included, so a reader never has to
  interpret a partial map).
* **Item run, `completed`:** the empty inventory, then one node per completed item.
* **Item run, `components`:** the empty inventory, then one node per purchase — each partial
  component, then the completion, which **consumes** the partials rather than stacking beside them.

A prospective state whose semantic key equals its predecessor's is **dropped, not emitted**, and the
count is reported on the build. Across the whole roster in all four arms the count is **0** and the
number of empty transitions is **0**: the construction does not produce duplicates in the first
place, and the guard is there so it cannot start to.

There is no node cadence, no fixed node count, no six-item assumption and no requirement that a node
yield a question.

---

## 5. Ability-rank progression

Mogzy has no skill-order authority, so the source produces none. It accepts one:

```
SkillOrder(slots, authority)
```

`authority` is **required**, must be non-empty, and may not claim the order is recommended, optimal
or meta. An unattributed order is refused at construction, because an unattributed order printed in
a diagnostic reads exactly like a derived one.

Given an order, the ranks at each level follow from the rules and nothing else — one ability point
per level — and every resulting rank is checked with `rules.check_rank(..., level=L)`, so ceiling
**and** availability both apply. An order shorter than the run is refused, not padded; an order
longer than the ruleset grants is refused; an order naming a slot the champion's kit has not got is
refused.

### 5.1 Special-rank champions fail closed, and they fail closed for the right reason

Six champions have a non-ordinary rank domain: **elise, jayce, karma, nidalee, udyr, yuumi**. For
any of them, a rank checked *with a level* and without a declared availability exception raises
`NormalizationError(rank_rule_unsupported)`. The source does not paper over this and does not fall
back to the ordinary rule.

The test that proves it is deliberately narrow: one point, at level 1, on a slot that has **no
declared exception** (Karma's and Nidalee's ultimates *do* have one, quoted from the wiki in
`rules.py`, and picking one of those would have proved the opposite). The rank is inside every
ceiling, so the only thing that can refuse it is the missing availability rule.

**Fail-closed is per claim, not per champion.** All six still get a full 18-node **level** run: the
level ladder needs no skill-point rule, so refusing the ranks does not refuse the levels. That
distinction is asserted.

---

## 6. Item progression

Canonical throughout. Every item a curated path names is resolved through `normalize.resolve_item`
(`validated_current` + `is_current_sr`), so a node carries a canonical **id**, never the name it was
given, and a path naming an item the wiki no longer lists as current fails closed with the source
named. Every component is resolved the same way.

**Recipe order, not purchase order.** `item_canonical_components.component_order` is the order the
canonical store publishes, expanded by `quantity`. The source says exactly that, everywhere it says
anything.

**One level deep, declared.** A component that is itself built from smaller components has its own
recipe and the source does not walk into it. That is stated in the function's docstring rather than
implied away, and extending it is a change to `recipe_for` and to nothing else.

**The inventory policy refuses; it never truncates.** Every node is checked against the ruleset's
`InventoryPolicy` (`slot_limit=6`, reused as rules data). A path that cannot be carried is refused
with the rule that refused it, the champion and the node named — and the caller can shorten the run
on purpose with `item_count`. A silently shortened run would be a different run than the one whose
identity was recorded, and nothing downstream could tell.

### 6.1 Components are not decoration

The finer granularity produces states the completed-item walk never reaches. Ahri's first item is
built from a haste component, so the partial inventory resolves to an ability haste that the
completed walk skips entirely:

```
ord  0  AH=0    no items
ord  1  AH=0    Hextech Alternator (component 1 of 3 for Hextech Rocketbelt)
ord  2  AH=10   Kindlegem          (component 2 of 3 for Hextech Rocketbelt)   <-- never reachable
ord  3  AH=20   Hextech Rocketbelt complete                                        by `completed`
ord  4..12      AH=20 throughout
```

---

## 7. Adaptability — proved, not asserted

| Change | Effect | Test |
|---|---|---|
| a different curated `path_index` | different nodes, different `sequence_id` | `test_a_different_curated_path_is_a_different_sequence` |
| a different stated skill order | different `sequence_id` | `test_a_different_stated_order_is_a_different_sequence` |
| the setup source returns a different path (monkeypatched at `record_for_side`) | different `sequence_id`, **no edit to the progression module** | `test_a_changed_ITEM_PATH_moves_the_run_while_the_source_code_stands_still` |
| the RULES grant more levels | a longer run, no source edit | `test_the_span_follows_the_rules_data_rather_than_a_constant` |
| a different authority *wording* for the same order | provenance moves, **identity does not** | `test_a_changed_AUTHORITY_string_moves_provenance_and_not_identity` |
| the same ordered states from a second source implementation | **one** `sequence_id`, two provenances | `test_a_literal_replay_of_the_same_states_is_the_SAME_sequence` |
| role / runes / shards / form | `held`, on the existing closed axis vocabulary — no new field per axis | `test_a_held_axis_is_carried_unchanged_by_every_node` |

Neither `StateSequence`, `StateWindow`, the composer nor any generator changed for any of these.

---

## 8. Registry and the default decision

**Exactly one production Champion source is registered — in
`progression.default_champion_sequence_registry()`, the RESOLUTION half's registry.**

`sequence_source.default_sequence_registry()` **stays EMPTY**, and a test pins it empty including
that it still refuses `rule.haste_ladder.v1`.

The blocker to putting it there is structural, not editorial, and it is worth stating precisely
because it is a property of the architecture rather than a limitation of the data:

> `sequence_source.py` is a **CONTRACT** module. `test_setup_state_isolation` takes a static import
> closure over the contract half and asserts it cannot reach `sqlite3`, `champion_state`, `quiz`,
> `routes` or any of a dozen other names — **transitively, including imports written inside
> functions**. A source that reads `item_canonical` and `champion_abilities` cannot be named from
> `default_sequence_registry()` without giving the contract half exactly the data dependency it
> exists to refuse. A sequence layer that COULD read data would be able to decide, mid-contract,
> what a progression "should" be.

So the honest placement is: the contract-half default stays empty, and a source that reads data is
registered from the half that is allowed to read it. This is **not** a "could not be trusted enough
to register" outcome — the source *is* registered and obtainable by name. It is a statement about
*which* registry a data-reading source may live in.

**Registered is not reachable.** No player-serving module imports this package at all;
`routes/admin_mastery_state_lab.py` is still the one allowed importer, and a test asserts that file
does not mention `progression` or `ChampionProgressionSource`.

The separate, *data* trust judgement, stated plainly:

* a **level** run is fully rules-backed and could be a default for any consumer that wants one;
* a **level + skill_order** run is as trustworthy as the order the caller states, which is why the
  authority string is mandatory;
* an **items** run inherits the curated file's `low` confidence and its "26.16/26.17 working
  approximation" claim. It is honest **because it is explicitly named and carries that claim**, and
  it should not become any consumer's silent default while every one of its 173 rows still says
  `needs_manual_review: true`.

---

## 9. Roster-wide generation — all 173 champions, four arms

| | `level` | `level` + stated order | `items` (completed) | `items` (components) |
|---|---|---|---|---|
| sequences produced | **173 / 173** | **164 / 173** | **146 / 173** | **118 / 173** |
| refused | 0 | 9 | 27 | 55 |
| node counts | `{18: 173}` | `{18: 164}` | `{7: 146}` | `11–18` (mode 16: 44) |
| transitions | 2941 | 2788 | 876 | 1629 |
| changed-axis signatures | `{('level',): 2941}` | `{('level','ability_ranks'): 2788}` | `{('items',): 876}` | `{('items',): 1629}` |
| levels represented | 1..18 (18 distinct) | 1..18 (18 distinct) | — (unspecified, by design) | — (unspecified, by design) |
| duplicate semantic nodes | **0** | **0** | **0** | **0** |
| empty transitions | **0** | **0** | **0** | **0** |
| illegal / clamped states | **0** | **0** | **0** | **0** |
| deterministic regeneration | 173/173 identical `sequence_id` | 164/164 | 146/146 | 118/118 |

### 9.1 Refusal categories, every one accounted for

| Code | Count | Cause | Remedy |
|---|---|---|---|
| `rank_rule_unsupported` | **6** — elise, jayce, karma, nidalee, udyr, yuumi | the rank-availability rule for their domain is undeclared in `rules.py` | declare it, with the wiki sentence, as `rules.py` already does for Karma's and Nidalee's ultimates. **Not** this phase's to invent. |
| `unknown_ability_slot` | **3** — dr-mundo, nunu, renata | **PRE-EXISTING.** The identity registry's `db_lookup_name` is `Dr Mundo` / `Nunu` / `Renata` while `champion_abilities` stores `Dr. Mundo` / `Nunu & Willump` / `Renata Glasc`, so `normalize.champion_slots` returns `()`. Any Phase 2 caller resolving these three with ranks already hits this. **Surfaced here, deliberately not repaired** — the fix is in `normalize.py`/identity and would change existing resolver behaviour. | See §12. |
| `inventory_policy` | **27** (completed) | path 0 of the curated file holds **7** items and the ruleset declares **6** slots. Verified: the 27 refused champions are *exactly* the 27 whose path 0 is over-long. | `item_count=6` — **27/27 then build.** |
| `inventory_policy` | **55** (components) | the 27 above, plus 28 more where carrying the partial components of a late item genuinely exceeds six slots (5 completed + 2 loose = 7 is not a state a player can hold either) | shortening works: **41 build at `item_count=5`, 14 at `item_count=6`** — every one of the 55 has a depth at which it builds. |

Nothing refused for an unexplained reason, and **no champion was clamped into legality anywhere**:
every node passes through `normalize_side` before it is emitted, so a produced run has zero illegal
nodes by construction and a failure is a refusal rather than a quietly repaired state.

### 9.2 Representative runs

```
ahri, advance=level                       18 nodes, every transition ('level',)
ahri, advance=level + stated order        18 nodes, every transition ('level','ability_ranks')
    ord 0  level 1   {E:1, Q:0, R:0, W:0}
    ord 5  level 6   {E:3, Q:2, R:1, W:0}
    ord 7  level 8   {E:4, Q:3, R:1, W:0}

ahri, advance=items, completed             7 nodes
    no items -> Hextech Rocketbelt -> Sorcerer's Shoes -> Stormsurge
             -> Shadowflame -> Zhonya's Hourglass -> Rabadon's Deathcap

ahri, advance=items, components           13 nodes
    no items
    Hextech Alternator (component 1 of 3 for Hextech Rocketbelt)
    Kindlegem          (component 2 of 3 for Hextech Rocketbelt)
    Hextech Rocketbelt complete (item 1 of 6)
    Sorcerer's Shoes complete (item 2 of 6)          <- 1-component recipe, no partial
    Aether Wisp (component 1 of 2 for Stormsurge)
    Stormsurge complete (item 3 of 6)
    ...
```

Provenance carried on that last run:

```
source_id        champion.progression.legal_advance.v1
classification   curated
source_version   progression.champion_legal_advance.v1/1
patch_basis      rules=rules_e9ffca5c...; item_path_source=curated.item_whitelist.v1;
                 item_path_confidence=low; item_path_claim=26.16/26.17 working approximation
note             "inventory grows along path 0 of curated.item_whitelist.v1, a curated
                  best-effort whitelist whose confidence this layer normalizes DOWN and whose
                  own patch claim is carried verbatim (...). Each completed item is preceded by
                  its recipe's DIRECT components, in the order item_canonical_components lists
                  them -- the published recipe order, not a purchase recommendation, and not
                  recursed into a component's own recipe. No level, rank or purchase-timing
                  correlation is claimed..."
```

None of that appears in the sequence's identity material — a test asserts each string is absent from
it.

---

## 10. The Generator Lab diagnostic

Backend only, and still **no route**. `window_lab` gains two functions beside the untouched
`literal_window`:

```
progression_window(conn, plan, *, start/end | seed/max_nodes/anchor)  -> (build, StateWindow)
progression_diagnostic(conn, plan, *, seed, budget, ...)              -> dict
```

`progression_diagnostic` is the chain the brief asked an operator to be able to inspect —
**champion → selected source → ordered nodes → transitions → selectable window → gate-aware
composition** — as one JSON-serialisable view. It adds a `sequence` block (source, provenance,
policy, plan, every node with its phase label and side, every transition with its changed axes and
per-side deltas) to the diagnostic `window_diagnostic` already produced, and changes nothing about
that diagnostic.

It refuses an ambiguous window request rather than resolving it by precedence: an explicit span and
a seeded selection together, or neither, are both refused.

`literal_window` and every literal fixture the architecture tests use are **unchanged**, as §10
required.

---

## 11. The source produces states, not questions

Enforced three ways, all mechanical:

1. **Text.** The whole module, docstrings included, is scanned for `combat_cooldown`,
   `ScenarioBinding`, `candidate`, `question_budget`, `publication_gate`, `Slice`, `mastery_slice`,
   `answer_metric`, `family_id`, `bound_metrics`, `subject_ref`. **Zero hits.** (The word
   *candidate* was rewritten to *prospective state* for exactly this reason — a state layer that
   borrows the question layer's noun is already thinking in its terms.)
2. **Imports.** No import of `mastery.knowledge`, `mastery.synthesis`, `mastery.serving`,
   `mastery.publication_gate`, `mastery.matchup`, `routes`, `ranked_modules`, `ranked_public`, or
   even of the package's own consumer half (`lab`, `scenario`, `window_lab`, `composition`).
3. **Direction.** The pipeline runs source → window → resolution → generation, and a test asserts
   the states a window generates carry the node keys the *sequence* produced.

---

## 12. The existing cooldown family as a diagnostic consumer

Used only to observe the source. **The source was not distorted to improve its yield**, and the
cooldown prompt wording was not touched (§13 of the brief).

The family declares `required_axes=("ability_ranks",)`, `optional_axes=("items",)`, and binds one
metric: `ability_haste.total`. Two consequences fall straight out:

**A level run with no stated order is BARREN in every state**, with the family's own reason
`required_axis_absent`. That is not an error and not a reason to change the run — it is the family
saying "this question needs ranks and this state states none". Recorded per state, never dropped.

**An item run with held ranks is productive, and collapses hard.** The distinct-question count is
`abilities with a readable cooldown × DISTINCT ability-haste values`, not the node count:

| champion | granularity | nodes | distinct AH | per-state candidates | distinct questions | barren |
|---|---|---|---|---|---|---|
| ahri | completed | 7 | 2 | 28 | 8 | 0 |
| ahri | **components** | 13 | **3** | 52 | **12** | 0 |
| syndra | completed | 7 | 2 | 21 | 6 | 0 |
| syndra | **components** | 13 | **4** | 39 | **12** | 0 |
| lux | completed | 7 | 2 | 28 | 8 | 0 |
| lux | **components** | 13 | **3** | 52 | **12** | 0 |
| jarvan-iv | completed | 7 | 4 | 28 | 16 | 0 |
| jarvan-iv | **components** | 16 | **6** | 64 | **24** | 0 |
| garen | completed | 7 | 3 | 28 | 12 | 0 |
| garen | **components** | 16 | **4** | 64 | **16** | 0 |

Two readings, both worth carrying forward:

* **A longer run does not mean more questions.** Ahri's 13-state component run collapses 52
  per-state candidates into 12 distinct questions, because ten of those thirteen states resolve to
  the same 20 ability haste. The dedupe is semantic and it is behaving correctly.
* **The component granularity strictly increases supply in every case measured**, because it reaches
  intermediate haste values the completed walk skips. That is a property of the states, not of the
  question layer.

**The prompt-rank question remains open and untouched.** The state-aware cooldown prompt still does
not name the ability rank, so two states that differ only in a rank whose cooldown is flat produce
one effective question. Adding the rank to the prompt would raise distinct-question supply and is
**deliberately not done here** — it is a product/content decision, not a state-layer one. Its effect
on effective-question dedupe is documented and unchanged.

A gate-aware composition over a progression window was run end to end: 6-state window, 6 productive
states, 0 barren, budget 4, `publishable: true`, no limiting constraints, frozen bundle built and
verified, `frozen_state_is_persisted: false`.

---

## 13. Current behaviour has not moved

| Claim | How it is held |
|---|---|
| Champion Mastery serving unchanged | no file outside `mastery/setup_state/` + its tests was touched |
| Matchup Mastery unchanged | same; no Matchup source was added, and the abstraction stays side-agnostic |
| Ranked unchanged | `ranked_modules/mastery_slice.py` and `_pattern_group` untouched |
| current Slice composition unchanged | untouched |
| no `mastery_state` written in production | nothing calls `persistence`; the diagnostic reports `frozen_state_is_persisted: false` |
| no `StateWindow` product use | the only window callers are tests and `window_lab` functions |
| no Full | does not exist |
| no state-aware player mode | the one allowed importer is still `routes/admin_mastery_state_lab.py`, admin- and flag-gated |
| the Lab route set has not grown | asserted: that file mentions neither `progression` nor `ChampionProgressionSource` |
| literal test sequences retained | `literal_window` and every fixture unchanged; asserted |
| cooldown prompt wording unchanged | not touched |
| no DDL, no migration, no route, no frontend | none |

---

## 14. Tests

```
/Users/macmoney/League_Combat_Simulator/.venv/bin/python -m pytest mastery/tests -q -p no:randomly
```

| Arm | Result |
|---|---|
| branch `bd586737` | **5 failed, 2464 passed, 7 skipped** *(implementation-time measurement, on base `399c8e60`)* |
| comparison base `399c8e60` | **5 failed, 2380 passed, 14 skipped** *(implementation-time measurement)* |
| integration re-run, focused arm on `cb017087` | **939 passed, 1 failed, 2 skipped** — the one failure (`test_phase4f_ranked_mastery_slice::test_format_for_creation_is_unaffected_by_this_module`, `ranked_points_v2` vs `ranked_modern`) reproduces identically on the base worktree, so the failure SET is still unchanged by this source. Not repaired here; it is not this workstream's. |

**Failure SET identical**, by name:

```
test_audit_db.py::test_pool_and_certified_counts
test_audit_db.py::test_lux_q_cooldown_conflict_surfaced
test_audit_db.py::test_json_roundtrips_and_schema
test_mastery_per_question_reveal.py::test_reveal_needs_no_new_persistence
test_phase4f_ranked_mastery_slice.py::test_format_for_creation_is_unaffected_by_this_module
```

All five are pre-existing at `origin/master` and none was touched.

The skip count falls 14 → 7 because seven branch-footprint guards skip with *"nothing committed on
this branch yet"* on a detached base and **run** on a branch that has a commit. They run, and they
pass.

**New: 74 focused tests** in `test_gr1_champion_progression_source.py`, covering determinism (both
arms), provenance separation from identity, source version identity, the level/rank legality of
produced runs, the level cap coming from rules data rather than a constant, all six special-rank
champions, all three unreadable-kit champions, unknown champion/ruleset, item normalization to
canonical ids, the component walk and its partial consumption, the inventory refusal and its
`item_count` remedy, held axes and the axis-conflict refusal, changed source data → changed
sequence, literal replay → identical identity, the Protocol, registry contents in both halves,
source/question-layer isolation, the Lab diagnostic, roster-wide generation in three arms, and
production-serving invariance.

`test_setup_state_isolation` (102 tests) passes with `progression.py` declared a **RESOLUTION**
module — including the static closure proving the contract half still cannot reach a database.

---

## 15. Exact blockers before a player-serving Champion Slice

1. **No product window policy exists.** `window.contiguous_seeded.v1` is the testing policy and says
   so; its identity is recorded in every window precisely so a product policy cannot inherit these
   windows' identities. Choosing one is the next decision and it needs a real source — which now
   exists.
2. **No Ranked persistence writer.** Phase 4B's seam can write a `FrozenStateBundle` and nothing
   calls it. Serving a multi-state Slice means writing one, and that is a schema-touching phase.
3. **Nine champions have no rank-bearing run.** Six need a declared rank-availability rule (with its
   wiki sentence, as `rules.py` already does for two ultimates); three need the identity ↔
   `champion_abilities` name mismatch closed. Until then a Slice that needs ranks cannot cover the
   whole roster, and the level ladder alone is barren for the one state-aware family.
4. **The curated item path is the only item ordering that exists, and it is `low` confidence on
   every one of its 173 rows.** Serving it to players means either reviewing the file or accepting —
   and presenting — that the build shown is a curated approximation on a 26.16/26.17 basis while the
   live patch has moved on.
5. **One state-aware family.** `combat_cooldown` reads only ranks and total ability haste, so the
   distinct-question supply over a run is `abilities × distinct haste values`. A Slice that wants
   progression to *feel* like progression needs either a second state-aware family or the
   prompt-rank decision (§12), and both are separate phases.
6. **No level ↔ item authority.** Until something can say when an item arrives, a single run cannot
   show a champion levelling *and* building. A Slice that wants both must either compose two runs or
   accept a stated constant on one axis.
7. **Matchup is untouched by design.** The abstraction stays compatible with independent per-side
   sequences; nothing was built toward it.

---

## 16. Out of scope — confirmed not done

Not wired into normal Champion Mastery, Matchup Mastery, Ranked, the current Slice or Full. No
`mastery_state` persisted. No `StateWindow` in a product path. No Matchup source. No second
state-aware family. No cooldown prompt change. No invented build, rune or shard authority. No
external provider. No DB migration. Combat Lab and Journey untouched. No player-serving rollout
begun. Nothing pushed.
