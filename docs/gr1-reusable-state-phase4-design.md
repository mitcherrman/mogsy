# GR1 — Reusable state architecture: Phase 4 design (durable state, sequences, coherent slices)

**DESIGN ONLY. Nothing was implemented.** No runtime code, schema, migration, generator,
composer, family, slice, Full mode, Journey, Combat Lab or frontend behaviour was changed. No
`FrozenStateArtifact` was persisted. Two read-only probes were run against the real canonical
database to size the frozen block and to measure the per-state candidate ceiling; neither is
committed (project rule). Decisions and their approval status appear **only in §13**.

| | SHA | Note |
|---|---|---|
| Backend audited | `origin/master` **`e9bdf537`** | The brief names `22a1c7d9` (Phase 3) as integrated. `origin/master` has since moved **two** item-runtime commits (`fe5ad948`, `e9bdf537`). `git diff 22a1c7d9 origin/master` touches **no `mastery/`, `quiz/`, `ranked_modules/`, `ranked_public/` or `routes/` file** — see §0.1 for the one file that deserves a note. |
| Frontend / docs base | `origin/main` **`fe0804c3`** | Exactly the brief's SHA. This document's branch is `gr1/reusable-state-phase4-design`, worktree `~/mogsy-wt-gr1-state4-design`. |
| Probe worktree | `~/lcs-wt-gr1-state3` @ **`22a1c7d9`**, clean | `lol_calc.db` symlinked to the primary checkout, opened **read-only** (`file:…?mode=ro`). |
| Inputs | [design rev 2](./gr1-reusable-state-architecture-design.md) · [Phase 1](./gr1-reusable-state-phase1.md) · [Phase 2](./gr1-reusable-state-phase2.md) · [Phase 3](./gr1-reusable-state-phase3.md) · this repo's handoff | Every code claim below was re-read at `origin/master`, not taken from those documents. |

> **Read this before trusting the handoff in a stale checkout.** The tracked
> `RANKED_MASTERY_SLICE_HANDOFF.md` at `fe0804c3` is **1,809 lines** and contains the whole
> reusable-state record. The copy in the shared `~/mogsy` working checkout is **1,277 lines**
> and stops at the Matchup structural audit. Read the tracked one, from a fresh worktree.

---

## 0. The design in one page

```
StateSequenceSource ──► StateSequence            ordered StateNodes, each holding a TEMPLATE
                            │                    (no questions, no families, no answers)
                            │  StateWindow(start..end)          ← Slice picks ONE window
                            │  whole sequence                   ← Full walks ALL of it
                            ▼
                  per node: resolve_state ──► ResolvedState      (Phase 2, unchanged)
                            │
                            ▼  scenario.generate_*               (Phase 3, unchanged shape)
                  state-aware candidates, deduped by candidate_id ACROSS the window
                            │
                            ▼  ONE universe ──► publication gate ──► recipe ──► resolver
                            │                   (all unchanged; universe= is the Phase 3 seam)
                            ▼
                  ordered steps ──► the existing freeze ──► segment_private_json
                                                              ├── challenges[]        (unchanged)
                                                              ├── mastery_artifact    (unchanged)
                                                              └── mastery_state       ◄── NEW
                                                                    FrozenStateBundle
```

Eight load-bearing decisions, each argued below:

1. **The frozen state is a SLICE-LEVEL BUNDLE, not a per-question copy** (§3, Option B).
2. **Its home is a new top-level key in `segment_private_json`, sibling to `mastery_artifact`** —
   never inside it, never in a challenge row, never public (§1.4). **No DDL** (§9).
3. **A frozen block must be interpretable with zero canonical reads.** Today it is not: it
   stores bare item ids and no display labels (§1.3, §2).
4. **`derived_used` is empty on every frozen block master can produce today.** A measured
   defect, fail-open and untested (§0.2). It must be fixed *before* the block is made durable.
5. **A `StateSequence` holds templates and nothing else.** No questions, no families, no
   answers — the explicit break with `TimelineCheckpoint`, which holds its own questions and is
   the reason Journey's Full could never share a universe with Slice (§4).
6. **A coherent Slice picks a WINDOW first, then runs the existing composer inside it** (§5).
   Coherence is the hard bound; budget is the soft one. This is the inversion of today.
7. **Full is the same pipeline with the window set to the whole sequence and no budget** (§6).
   It is a parameterisation, not a second system.
8. **Champion Mastery is the first consumer** (§8). Matchup has no state-aware generation at
   all today — `generate_cooldown_under_haste` refuses a matchup state by construction.

### 0.1 One upstream note on the two commits past `22a1c7d9`

`fe5ad948` / `e9bdf537` (the item slow tranche) modified **`movement_speed_model.py`** and
**`services/combat_helpers.py`**. Neither is a `mastery/` file, so the Phase 3 "zero file
overlap" claim holds. But `mastery/setup_state/derive.py` reaches
`movement_speed_model.soft_cap` and `champion_self_move_speed_percent` for
`movement_speed.total` (Phase 2 §7.2). A change to either function moves that derived value and
therefore moves `resolved_state_digest` for any state whose block includes it — with **no
change to `semantic_state_key`**, which is the digest working exactly as designed.

This is not a defect and needs no action now. It is recorded because it is the first live
instance of the class: **a shared primitive that the state layer borrows can move the state
digest from outside the workstream.** Any future pinned-digest test must be written knowing
that. (`derive.py` borrows five such primitives; `movement_speed_model` is the only one an
item-runtime workstream actively edits.)

### 0.2 The measured defect that gates this whole phase

`mastery/setup_state/lab.py:288` calls:

```python
frozen = C.freeze_resolved_state(state, used_metrics=generation.used_metrics, …)
```

`ScenarioGeneration.used_metrics` is `Tuple[str, ...]` — a **flat** tuple of metric names
(`scenario.py:227`, built at `:442`). `freeze_resolved_state` declares
`used_metrics: Tuple[Tuple[str, ...], ...]` — **one tuple per side** — and selects with:

```python
if v.metric in set(used_metrics[i])          # contract.py:619
```

So `used_metrics[0]` is a single metric *string*, `set(...)` of it is a set of **characters**,
and no metric name is ever a member. **`derived_used` is empty on every frozen block the
current code can produce.** Measured, all four probe cases:

| probe state | frozen bytes | `derived_used` values | `_state_context["derived_used"]` |
|---|---|---|---|
| Ahri, no items | 2,714 | **0** | 7 |
| Ahri, Axiom Arc (20 AH) | 2,724 | **0** | 7 |
| Ahri, 6 haste items (130 AH) | 2,949 | **0** | 7 |
| Zed, 2 items (40 AH) | 2,782 | **0** | 7 |

The Lab's *display* path is correct — `lab.py:164` uses the same flat tuple as a flat set, which
is why the Phase 3 screenshot legitimately shows seven derived values. The **frozen block** and
the **panel above it** therefore disagree, and the block is the half that was going to become
history.

It fails **open**: no exception, an empty `derived_used`, indistinguishable from "no question
read anything". It is **untested** — `test_setup_state_contract.py:337` and
`test_setup_state_resolution.py:923` call `freeze_resolved_state` with correctly-shaped per-side
tuples and pass; `test_gr1_state_aware_lab.py:652` reads the *display* field. Nothing asserts the
Lab's frozen block is non-empty.

Harmless today (nothing persists the block, the route is flag-off). Fatal the moment Phase 4
persists it: every served state-aware question would freeze **zero** derived values, which is
exactly the field that makes the answer explainable, and a frozen artifact is never rewritten.
**Fixing this is item 1 of the next phase** (§12).

---

## 1. Audit — the current artifact and persistence path

Everything in this section was read at `origin/master` `e9bdf537`. Line numbers are that ref.

### 1.1 What exact object is persisted when a generated question is served

**One `ranked_rounds` row per SEGMENT**, inserted once by `ranked_public/persistence.py:236`
and never updated (checked: no `UPDATE ranked_rounds SET segment_private_json` exists anywhere
in production code; the only `UPDATE`s touch `active_deadline`, `status` and
`question_explanation_json`). A `mastery_slice` segment carries N questions in that one row.

**`segment_payload_json` — public, the wire contract** (`mastery_slice.py:773`):

```
module_id, module_version, prompt, challenge_count, source_mastery_set_id,
[reveal_window_ms],
challenges[i] = { challenge_index, interaction_kind, question_family, prompt,
                  answer_type, answer_options,
                  prompt_semantics | comparison_semantics,
                  presentation, patch_display, input_constraints, roles }
```

Projected out through `PUBLIC_CHALLENGE_FIELDS` (`mastery_slice.py:1018`), a 12-entry positive
allow-list, plus `motif` derived at view time.

**`segment_private_json` — server-only** (`mastery_slice.py:806`):

```
module_id, module_version,
challenges[i] = { challenge_index, answer_type, correct_answer, question_family,
                  answer_options, explanation,
                  [canonical_ref], [champion_subjects] },
mastery_artifact = { artifact_schema_version, generator_type, generator_version,
                     generator_config, subject_key, question_count,
                     artifact_instance_id,
                     source: { mastery_set_id, artifact_digest, display_revision,
                               patch_key_digest, patch_display, title, is_prototype },
                     served: { match_id, segment_number },
                     selection_salt }            ← ONE per segment, not per question
```

**Per answered challenge**, one `quiz_attempts` row (`mastery/serving/attempts.py`) with
`question_key` = the frozen `mastery:` ref, `source='ranked_mastery'`, `apply_progress=False`,
and `provenance_json` = `served_artifact.attempt_provenance(...)` — the `review_view` allow-list
plus `challenge_index`, `match_id`, `segment_number`, `canonical_question_ref`.

**What is NOT persisted, and this is the load-bearing finding.** `generate_segment` takes
`published.artifact.ordered_steps`, slices `chosen = steps[:n]`, and freezes only the
**projections** `_public_challenge(...)` and `_private_challenge(...)`. The
`KnowledgeMasteryStep` object itself is discarded. Gone at freeze time, per question:

| Lost field | Where it lived | Why it matters |
|---|---|---|
| `candidate_id` | `KnowledgeMasteryStep.candidate_id` | The **only** identity that carries a `scenario_binding` (`knowledge/contract.py:413`) |
| `content_digest` | same | The value-bearing identity — "did the answer move?" |
| `fact_refs` | same | The canonical provenance a step is *required* to carry (`_validate`, `knowledge_artifact.py:150`) |
| `patch_key_digest` | same, **per step** | Only the artifact-level one survives, inside `mastery_artifact.source` |
| `difficulty_class`, `redundancy_group` | same | Named in open handoff decision 7 |

### 1.2 What is sufficient to reconstruct the question later

**Presentation and grading: fully sufficient, and proven.**
`ranked_public/review.py:_mastery_slice_round` (`:445`) reads the public half for the prompt,
options and semantics, the private half for the correct answer and explanation behind a
`revealed` gate, and the per-challenge rows for the viewer's choice. It re-resolves nothing. The
double assertion in `test_ranked_mastery_artifact_persistence.py::
test_review_is_unchanged_after_the_canonical_data_moves` shifts the cooldown values under the
seam and asserts both that the review is byte-identical **and** that a fresh slice now differs —
without the second half, the equality would also hold for a mutation that never happened.

Grading likewise: `_GradingStep` is rebuilt from the frozen private payload, not from the
manifest.

So: a served question can be **re-displayed and re-graded** forever. That is the Phase 4
(persistence) guarantee, and it holds.

### 1.3 What is missing to reconstruct the exact scenario STATE

Everything except the display premise. Concretely, for a state-aware question:

1. **No `scenario_binding`.** It is on the candidate and enters `candidate_id`, but the
   candidate is not persisted (§1.1). The only survivor is `prompt_semantics.scenario`, which
   `knowledge/contract.py:181` explicitly declares **is not identity** — it is a
   `(display_label, value)` pair list for the sentence. Measured: the wire carries
   `"scenario": [["ability_haste", 45]]` while identity carries
   `{"ability_haste.total": 45}` under a canonical metric key. A reader cannot recover the
   identity key from the label, because `SCENARIO_LABEL` (`scenario.py`) is a one-way
   presentation map and a rename there moves no identity — by design.
2. **No state inputs.** No items, level, ranks, form, ruleset or `rules_rev`.
3. **No data basis.** `mastery_artifact.source` carries `patch_display` (a label) and
   `patch_key_digest` from `projection_patch_key`. The state's `DataBasisId` is a *different*
   digest over overlapping-but-not-identical material (Phase 2 §3.1) — measured this session as
   `basis_032228ae…` beside a `patchkey_…`. They are **not interchangeable**, and neither is a
   substitute for the other.
4. **No derived values**, so the answer can be restated but not **explained**. "5.0 seconds"
   cannot be decomposed into base 6.0 × 100/(100+20) without them.
5. **No dependency projection per question**, so "prove exactly which state inputs affected this
   question" is unanswerable from the row.
6. **No state → question map**, because there is no state.

### 1.4 The safest insertion point

**A new top-level key in `segment_private_json`, sibling to `mastery_artifact` and
`challenges`.** Proposed name `mastery_state`.

Not inside `mastery_artifact["source"]` (design rev 2 §1.C already forbids it), not inside
`mastery_artifact` at all, not inside a challenge row, and never in the public payload. Five
structural reasons, in descending importance:

**(a) The state block contains the answers.** `derived_used` holds
`ability.W.cooldown.effective = 5.0` — the correct answer as a number. Putting a state block
anywhere public would leak every answer in the segment, and **`answer_safety`'s pre-reveal guard
would not catch it**: `FORBIDDEN_PRE_REVEAL_KEYS` (`answer_safety.py:24`) contains `raw_value`,
`result`, `value_display`, `answer`, `correct_answer` — but not the bare key **`value`**, which
is what `DerivedValue.to_plain()` emits. The guard is a structural exact-key check, not a
semantic one, and it was never written against this shape. Nesting inside
`segment_private_json` is safe *structurally* rather than by promise: that column's own name is
in the denylist, and `projections.project_round_segment_state` (`:363`) never reads it.

> **This is a finding, not a hypothetical.** If a later phase decides a player should see the
> premise as structured data, it must ship the premise through `prompt_semantics.scenario`
> (already public, already answer-free by construction) and **must not** widen
> `PUBLIC_CHALLENGE_FIELDS` to a state block. Alternatively, add `value` to
> `FORBIDDEN_PRE_REVEAL_KEYS` — but that would likely break unrelated payloads and should be
> measured first.

**(b) `review_view` is a positive allow-list** (`serving/artifact.py:187`) whose docstring says
a field added to `build()` "is invisible here until someone adds it on purpose". A sibling block
inherits that discipline by getting its own allow-listed projection, and until one is written
the block is invisible to review — the correct default.

**(c) Independent versioning.** `mastery_artifact.ARTIFACT_SCHEMA_VERSION` can stay `1`; the
state block carries its own `frozen_state_bundle.v1`. Nesting would force a bump of a version
that means "the generator-provenance block's shape", conflating two contracts.

**(d) The column is write-once and already JSON.** TEXT, added by
`migrate_add_ranked_segments.py:71`, written at INSERT, never rewritten.

**(e) Three shipped absent-means-unknown precedents in the same payload** —
`mastery_artifact` itself, `PAYLOAD_REVEAL_WINDOW_MS`, `PRIVATE_CANONICAL_REF`.

### 1.5 Does frozen state require a migration?

**No.** `segment_private_json` is `TEXT` holding arbitrary JSON, and the block is an additive
key. `quiz_attempts.provenance_json` is likewise `TEXT` (`migrate_quiz_attempts_v2.py:123`)
already carrying a free-shaped dict. Zero DDL in both places. §9 states the one condition under
which that would change.

### 1.6 Two more gaps found while reading

**Item display names are not frozen.** Measured — a state with Axiom Arc and Cosmic Drive
freezes:

```json
"items": [{"item_id": "4629", "slot": null}, {"item_id": "6696", "slot": null}]
"display_names": ["Ahri"]
```

`display_names` is champions only. To render "with Axiom Arc and Cosmic Drive" a review must
re-read `item_canonical` — and that store's own `availability` is `live_only` (Phase 2 §3), so a
renamed or delisted item makes a historical state **unreadable**. This directly violates the
design's own rule that frozen state must not depend on re-reading old canonical data. §2 closes
it.

**There is no deserializer.** `from_dict` exists for `StateTemplate` only
(`contract.py:301`). `FrozenStateArtifact` has `to_dict()` (→ `to_plain`) and no inverse, and
there is no `verify_frozen_*`. A persisted block could not be read back as a typed object or
checked against itself. §12 makes this part of the next phase.

---

## 2. `FrozenStateArtifact`, serving-ready

Six requirements from the brief, and what each forces:

| Requirement | What it forces |
|---|---|
| a question never changes after a patch | freeze values, never references to live rows |
| history does not re-resolve | freeze **display labels**, not only canonical ids (§1.6) |
| the answer can be explained later | freeze `derived_used` **populated** (§0.2), with the answer metric and its `depends_on` chain |
| prove which inputs affected the question | freeze the **declared read-set** as well as the realized binding |
| two questions may share one state | the container is the bundle, not the question (§3) |
| a multi-state slice preserves order | `state_index`, dense and ordered |

### 2.1 The field table

`R` = required for reconstruction · `A` = required for audit/explanation ·
`O` = optional diagnostic · `X` = should not be frozen.
**new** = not in the Phase 1 type.

| # | Field | Class | Note |
|---|---|---|---|
| **A. normalized setup inputs** | | | |
| A1 | `inputs` per side (`SetupInputs`) | **R** | Already present. Canonical ids, axis states, no `None`. |
| A2 | `display_labels: {canonical_id → label}` | **R** *(new)* | **The §1.6 fix.** Every id the block names — champion, item, rune, form — with the label it had at freeze time. Makes the block readable with zero canonical reads. Measured cost ≈ 25 B/item. |
| **B. concrete data basis** | | | |
| B1 | `data_basis.id` (`scheme` + `key`) | **R** | Which data, machine-identifiable. |
| B2 | `data_basis.patch_label` | **A** | `"League 26.16"`. A label, never identity. |
| B3 | `data_basis.availability` | **A** | `live_only` today. Says whether the basis could ever be re-read. |
| B4 | `data_basis.store_revisions` | **O** | 7 entries, **476 of the block's 592 basis bytes**. The honest `"unversioned (n=34)"` / `"absent"` strings live here. Keep — it is the only per-store answer — but classify it optional so a later size pass may drop it without losing an `R` or `A` field. |
| B5 | `data_basis.resolved_at` | **O** | `null` today. `ranked_rounds.started_at` is already the authoritative serve instant. Keep for non-round contexts (a saved Lab state). |
| **C. resolved derived values** | | | |
| C1 | `derived_used` per side | **A** | **Must actually be populated** (§0.2). Rule below. |
| C2 | the full `DerivedBlock` | **X** | ~40 values/state; freezing what nothing read is the "unnecessary global state" the brief forbids. |
| C3 | `pair_derived_used` | **A** | Present, `None` for every state today. |
| **D. provenance** | | | |
| D1 | `source_provenance` per axis | **A** | Present, 355 B. Never identity (Phase 2 §5.2 — `SetupInputs` has no provenance field at all, so it is structurally unreachable from key material). |
| D2 | `resolution.warnings` | **O** *(new)* | The unmodelled-item-stat warnings (Phase 2 §15: `TENACITY 50`, `MAGIC_PEN 43`, …). "This state had 50 tenacity and nothing modelled it" is a real audit answer and is currently dropped at freeze. |
| D3 | `resolver_version`, `derivation_version` | **A** *(new)* | On `ResolutionRecord`; `freeze_resolved_state` copies only `template_key`/`template_ref`. Without them, "which derivation produced this number" is unanswerable — and since Phase 2 §11 deliberately removed them from the digest, freezing them is the *only* place they survive. |
| D4 | `derivation_support` manifest | **O** *(new)* | Explains an `unsupported` value years later. |
| **E. ScenarioBinding** | | | |
| E1 | `StepBinding.binding` | **R** | Present. The question's identity input. |
| **F. state semantic key** | | | |
| F1 | `semantic_state_key` | **R** | Present. Derivable from `inputs`, and freezing it is the cross-check that makes `verify_frozen_bundle` possible with no canonical read. |
| **G. resolved state digest** | | | |
| G1 | `resolved_state_digest` | **R** | Present. The state↔step join key inside the bundle. |
| **H. step → state reference** | | | |
| H1 | `StepBinding.step_index` | **R** | Present. |
| H2 | `StepBinding.state_index` | **R** *(new)* | Today a step names a **digest**. A digest is not an order, and two nodes of a sequence can legitimately resolve to the same digest (a transition that moves an axis nothing reads). An ordinal is required; keep the digest too, as the integrity check. |
| **I. step → dependency projection** | | | |
| I1 | `StepBinding.family_id`, `generation_id` | **A** *(new)* | Which generator, at which version. |
| I2 | `read_set` (declared axes + metrics), via `family_id` into the bundle's hoisted `families` map | **A** *(new)* | **The binding says what WAS read; the read-set says what COULD have been.** Both are needed to answer "why did changing the level not change this question?" — the exact question `StateAwareFamily`'s docstring says the read-set exists to answer. Without it, the answer requires reading the generator source at the version that ran. |
| I3 | `StepBinding.answer_metric` | **A** *(new)* | e.g. `ability.W.cooldown.effective`. With C1 and E1 this makes the arithmetic reconstructible: base × multiplier(bound haste) = answer. |
| I4 | `StepBinding.candidate_id`, `content_digest` | **R** *(new)* | The per-question identity §1.1 currently discards. `content_digest` additionally detects "the answer moved" without recomputation. |
| **J. ordering / state index** | | | |
| J1 | `FrozenState.state_index` | **R** *(new)* | Dense, 0-based, sequence order. |
| J2 | `sequence_ref` (`sequence_id`, `window_start`, `window_end`) | **A** *(new)* | Which progression and which slice of it. `None` for a hand-stated state. |
| **K. transition metadata** | | | |
| K1 | `transitions` between adjacent frozen states | **A** *(new)* | `changed_axes` + `delta` + `transition_digest`. Compact (it names what moved instead of repeating both states) and it is what a later transition question would key on. |
| K2 | authored transition prose / reasons | **O** | Provenance only, never identity. |
| K3 | encounter transitions (HP, buffs, cooldowns in flight) | **X** | Out of scope by the brief and by design rev 2 §2.4. |
| **Never** | | | |
| — | the `StateTemplate` object | **X** | Only `template_key` / `template_ref`. A template is a request; freezing it invites re-resolution. |
| — | the candidate universe / pool | **X** | It is not what was served. |
| — | `selection_salt` | **X** | Already in `mastery_artifact`, server-only, and duplicating a secret doubles the leak surface. |
| — | setup-source **content** (the curated file's rows) | **X** | Provenance names the source and version; the content is the source's business. |
| — | any live canonical row | **X** | The whole point. |

### 2.2 The `derived_used` rule, and a dependency graph that does not exist

The natural rule would be "the transitive closure of `DerivedValue.depends_on` over
{bound metrics} ∪ {answer metrics}". **It is not implementable, and the measurement says why.**

`DerivedValue.depends_on` is documented as "input axes / derived metrics used" (design rev 2
§2.3). In practice, measured over a real Ahri L18 state, **every entry is an axis, never a
metric**:

```
ability.Q.cooldown.base        190 B   depends_on=('ability_ranks',)          sources=0
ability.Q.cooldown.effective   265 B   depends_on=('ability_ranks','items')   sources=1
ability_haste.total            215 B   depends_on=('items',)                  sources=1
```

`ability.Q.cooldown.effective` does **not** name `ability.Q.cooldown.base` or
`ability_haste.total`, even though it is computed from both. So there is no metric→metric graph
to close over. Recording this now prevents the next phase from designing against a graph that
is not there.

**The implementable rule:**

> `derived_used` is the set the **generator declares** it read — `ScenarioGeneration.
> used_metrics`, per side — and the freeze **validates** that the set contains every bound
> metric and every answer metric for every step in the bundle. A declared metric absent from
> the state's `DerivedBlock` is a **write-time refusal**.

`scenario.py:427-428` already declares exactly the right set (answer metric + the `.base` it was
derived from, per slot, plus the bound haste). Measured for a 4-question Ahri state: **9 values,
2,045 B**. Only the plumbing (§0.2) is broken.

The refusal matters because the alternative fails open: freezing a question whose bound metric
is missing produces an artifact that can never be explained, and a frozen artifact is never
rewritten.

**Why C2 (never freeze the whole block) is not a micro-optimisation.** Measured on the same
state: `derived_used` = **2,045 B** for 9 values; the whole `DerivedBlock` = **12,281 B** for
56. Freezing everything would cost **10.2 KB per state** to record values no question read.

**A later opportunity, not taken now.** `DerivedValue` could carry its metric-level inputs, which
would make the arithmetic self-describing and let a reveal render "6.0 × 100/120 = 5.0" from the
block alone. That is a `derive.py` change affecting every consumer, and it belongs in its own
phase — not in the one that makes the block durable.

### 2.3 What does not change

`semantic_state_key` and `resolved_state_digest` keep exactly their Phase 2 definitions. In
particular the digest still **excludes** `rules_rev`, `derivation_version`, the basis id and
label, and per-value store revisions (Phase 2 §11) — all four are frozen as provenance instead.
Freezing a field is not the same as identifying by it, and this design does not move that line.

---

## 3. Artifact granularity

### 3.1 Measured inputs

Read-only probe, real `lol_calc.db` (patch 26.16), compact JSON, single-champion states:

| part | bytes | scales with |
|---|---|---|
| `data_basis` | **592** | nothing — identical for every state in one resolution |
| `source_provenance` | **355** | axes stated |
| `rules_rev` + `ruleset` + `frozen_schema_version` | 105 | nothing |
| `template_key` | 76 | per state |
| `semantic_state_key` | 145–220 | items and ranks stated |
| `resolved_state_digest` | 73 | per state |
| `inputs` | 290–415 | items and ranks stated |
| `step_bindings` | 833–837 for 4 steps = **207 B/step** measured | questions |
| `derived_used` | **15 (empty — §0.2)**; **2,045 B** once fixed (9 values) | metrics read |
| the whole `DerivedBlock`, for contrast | **12,281 B** (56 values) — never frozen | |
| **whole block as measured** | 2,714 – 2,949 | |
| **whole block once §0.2 is fixed** | **≈4,750** | |

Per state, excluding step bindings: **≈3,920 B**, of which **≈1,128 B is fixed**
(592 of that the basis, invariant across one resolution), ≈600 B varies with the axes stated,
and **2,045 B is `derived_used`** — 52 % of the block, and the half that makes the answer
explainable.

An enriched `StepBinding` (§2: `state_index`, `family_id`, `answer_metric`, `candidate_id`,
`content_digest`) adds ≈250 B to the measured 207, so **≈460 B/step**. `family_id`'s
`read_set`, `generation_id` and `binding_precision` are **hoisted to a bundle-level `families`
map** rather than repeated per step — a single-family slice would otherwise carry the same
120-byte read-set eight times.

Second measured input, and the one that decides §5: **a single state yields exactly one
question per askable ability slot.** The probe refused `question_count=8` for both Ahri and Zed
with `InsufficientQuestionsError: only 4 distinct publishable question(s) are available`. Four is
the ceiling (Q/W/E/R), reduced by every static cooldown and every slot with no projected fact.
**So `n=8` requires `k ≥ 2` today** — a single-state slice of eight questions does not exist.

### 3.2 The four options, costed on the measured numbers

Realistic shapes: `n` questions over `k` states, using 3,920 B/state and 460 B/step.

| | k=1, n=4 | k=2, n=8 | k=8, n=8 | Needs DDL |
|---|---|---|---|---|
| **A** full block per question | 4 × 4,380 = **17.5 KB** | 8 × 4,380 = **35.0 KB** | **35.0 KB** | no |
| **B** one slice-level bundle | **≈6.3 KB** | **≈12.0 KB** | **≈35.0 KB** | no |
| **C** normalized table + bindings | ≈2 KB in-row + k rows | ≈3.5 KB + k rows | ≈3.5 KB + k rows | **yes** |
| **D** shared block + per-challenge bindings | ≈6.3 KB | ≈12.0 KB | ≈35.0 KB | no |

**B's advantage is exactly the sharing factor `n/k`, and it converges with A at `k = n`.**
That is the honest reading: when every question has its own state, a bundle and per-question
copies cost the same, and B's remaining advantage is structural (one index, one projection, one
write) rather than byte-count.

**A cost worth stating plainly.** Today's segment private payloads average **2,195 B** (measured
over the 40 segment rounds in the local database). A k=2/n=8 state bundle adds ~12 KB, a **~6×**
growth of the private payload on state-aware rounds. That is acceptable for a TEXT column on a
write-once row, and it is not free. If it ever needs reducing, the levers are already classified
`O` in §2: `store_revisions` (476 B/state) and the `sources` tuple on each `DerivedValue` — never
`derived_used` itself.

**Option A — reject.** At k=1, the only shape that exists today, it repeats `data_basis` (592 B),
`source_provenance` (355 B), `rules_rev`, `ruleset`, `inputs` and both identities **eight times**
for one state: ~84 % of 23 KB is duplication. It also makes "did all eight questions share one
state?" a byte-comparison of eight blobs instead of a single index lookup, and it makes a
partial write possible (seven blocks agreeing and one not).

**Option C — reject, and the reason is already written down in this repo.**
`mastery/serving/artifact.py`'s docstring, §"NO NEW TABLE, AND THAT IS THE DESIGN", argues
exactly this case for exactly this data: `ranked_rounds.segment_private_json` is already an
immutable write-once per-segment document; a separate table "would duplicate that guarantee,
need its own migration, its own cold start, its own orphan story, and would have to be joined
back to the round row to mean anything." Every word applies to state. Adopting C would reverse a
shipped, reasoned decision to save ~5 KB per admin-bot round. It also breaks the property that
makes the current design provably immutable — a second table can be UPDATEd — and it would make
this the first GR1 phase to require DDL.

**Option D — reject on one specific ground.** Splitting the step→state link across two containers
(bindings inside `challenges[i]`, states in a sibling block) means "which state did step 5 use?"
is a two-place lookup that can disagree, and it puts state material inside the challenge rows
that `attempt_material` and the review projection iterate — increasing the chance a later
refactor carries a `value` into a public projection (§1.4 (a)). Same bytes as B, strictly worse
invariants.

**Option B — recommended.**

```
segment_private_json["mastery_state"] = FrozenStateBundle {
    frozen_bundle_schema_version : "frozen_state_bundle.v1"
    states        : (FrozenStateArtifact, …)   # ordered, dense state_index 0..k-1
    step_bindings : (StepBinding, …)           # step_index -> state_index (+ binding, family_id,
                                               #   answer_metric, candidate_id, content_digest)
    families      : {family_id -> {generation_id, read_set, binding_precision}}
                                               # hoisted: a single-family slice would otherwise
                                               #   repeat one 120-byte read-set n times
    transitions   : (FrozenTransition, …)      # between adjacent states; () when k == 1
    sequence_ref  : SequenceRef | None         # which progression, which window
    display_labels: {canonical_id -> label}    # §2 A2, bundle-wide
}
```

**Each `FrozenStateArtifact` stays fully self-contained** — it keeps its own `data_basis`,
`ruleset` and `rules_rev` rather than inheriting them from a hoisted header. That costs
**≈680 B × (k−1)**: 680 B of a 12.0 KB bundle at k=2 (**5.7 %**), rising to 4.8 KB of 35 KB at
k=8 (**14 %**). At the shapes Slice will actually use (k ≤ 3, §5) it buys two things worth far
more than that:

1. **A single state can be lifted out of a bundle and verified alone.** That is precisely what a
   review of *one* question does, and precisely what `verify_frozen_bundle` must be able to do
   per state.
2. **The duplication is checked, not tolerated.** Bundle construction *refuses* a mixed basis,
   ruleset or `rules_rev` with `basis_mismatch` — the same fail-closed rule Phase 2 already
   applies to the two sides of a matchup (`normalize`, Phase 2 §11.1). A hoisted header could
   only assert equality it had already destroyed.

`display_labels` is hoisted (bundle-wide) because it is a pure lookup table with no per-state
meaning, and because a 3-state window over one build path names largely the same items.

| axis | how B answers it |
|---|---|
| storage duplication | ≈680 B × (k−1) — 5.7 % at k=2, deliberate and checked |
| review/history simplicity | one key, one index lookup, one allow-listed projection |
| backward compatibility | absent-means-unknown; old rows unaffected; no DDL |
| current artifact model fit | sibling to `mastery_artifact`, same write-once row, same privacy |
| Full compatibility | Full's bundle is the same type with k = len(sequence) |
| multiple questions from one state | many `step_bindings` → one `state_index`. The normal case. |
| questions spanning two states | `StepBinding.state_index` becomes `state_indices: (i, j)` — a tuple-valued field reserved now, unused until transition questions exist |
| migration complexity | none |

---

## 4. The state-sequence model

### 4.1 Types

```
StateSequence
  sequence_schema_version : "state_sequence.v1"
  kind        : "champion" | "matchup"
  subject     : SubjectRef              champion slug, or the canonical pair
  nodes       : (StateNode, …)          ORDERED, dense index 0..n-1
  policy      : SequencePolicyRef       WHICH progression this is (id + version)
  provenance  : SequenceProvenance      WHERE the nodes came from — never identity
  sequence_id : str                     derived (§4.3)

StateNode
  index          : int                  0-based, dense
  template       : StateTemplate        a REQUEST. Never a ResolvedState.
  checkpoint_kind: str                  open vocabulary: "level" | "purchase" | "rank" | …
  label          : str | None           display only, never identity

StateTransition                          DERIVED by diffing adjacent nodes. Never authored.
  from_index, to_index : int            always adjacent
  changed_axes         : (str, …)       Axis vocabulary (closed)
  delta                : (AxisDelta, …) per axis: before -> after
  reason               : str | None     provenance only

StateWindow
  sequence_ref : SequenceRef
  start, end   : int                    inclusive, contiguous
```

### 4.2 The six rules that make it reusable

1. **A node holds a TEMPLATE, not a resolved state.** The sequence is resolution-free, so it can
   be stored, versioned, edited and replayed, and one sequence resolves differently against a
   different basis without becoming a different sequence. This is design rev 2's R-2 applied one
   level up.
2. **A sequence contains no questions, no families, no candidate logic, no answers.** This is the
   explicit break with the existing `mastery/chains/timeline.py`, whose `TimelineCheckpoint`
   holds `questions: Sequence[PreparedQuestion]` beside `champion_level` and `ability_ranks`
   (`timeline.py:70`). That coupling is exactly why Journey's traversal could never share a
   universe with Slice: the states and the questions are one object, so there is nothing to
   compose over. **Reuse the idea of a checkpoint; do not reuse the class.**
3. **Transitions are derived, never authored.** Diff adjacent node templates. An authored
   transition beside the nodes is a second source of truth that can disagree with the nodes it
   describes. The `TransitionType` **vocabulary** is reused (`LEVEL_CHANGE`,
   `ABILITY_RANK_CHANGE`, `ITEM_ACQUIRE`, `ITEM_COMPLETION` — `transitions.py:51`); the Journey
   *engine* is not.
4. **Ordering is the only ordering.** Not level, not cost, not time. A sequence may revisit an
   axis value; indices stay dense.
5. **`n = 0` is legal and is today's default.** The intrinsic Champion and Matchup universes are
   sequence-free and stay so (design rev 2 §7). A sequence is an **additional** source of states,
   never a replacement for the intrinsic bank.
6. **No question-generation logic lives in the sequence object**, and no Full-specific question
   definition exists anywhere. Full and Slice differ only in which window they take.

### 4.3 Identity, and the one precedent worth copying

```
sequence_id = content_hash({kind, subject, policy_id,
                            nodes: [semantic projection of each node.template]},
                           prefix="sseq_")
```

Excludes labels, `checkpoint_kind`, provenance, reasons, basis and anything resolved. Two
different sources that emit the same progression therefore produce the same `sequence_id` —
the sequence-level statement of design rev 2's A-3 (sources are replaceable and generators are
source-blind).

**Transition identity copies `MasteryStateTransition.deterministic_id`** (`transitions.py:193`),
which hashes `{contract_version, before_snapshot_id, type, target, params}` and deliberately
excludes metadata. The state-layer analogue:

```
transition_digest = content_hash({from: <resolved_state_digest>,
                                  to:   <resolved_state_digest>,
                                  changed_axes, delta}, prefix="stxn_")
```

Chain-linked on the *resolved* digests, so a transition is identified by the change it actually
made to values, not by the template edit that was requested. That is what lets a later
transition question have an identity, and it is why §11 says transition identity is worth
computing even though nothing asks a transition question yet.

### 4.4 Where it attaches to the existing pipeline

`mastery/manifest/contract.py:98` already declares the seam, in its own words:

```python
#: The closed union of source types this phase implements. A future
#: ``ScenarioSource`` is added here and in the resolver's dispatch — nothing
#: about the manifest contract itself needs to change (see module docstring).
CandidateSource = Union[ChampionSource, MatchupSource]
```

A `StateWindowSource(sequence_id, start, end, subject)` is that source. Adding it to the union
and to `_build_universe`'s dispatch is the whole manifest-side change, and the Phase 3
`universe=` keyword already covers the case where the caller generated the pool itself.

---

## 5. What a coherent Slice means

Today a Slice is bounded composition over one subject's whole bank. Under state, "pick eight
unrelated questions from arbitrary states" would be strictly worse than today: it would add
scenario noise without adding structure.

**Definition.** A coherent Slice is *n* questions drawn from **one contiguous window of one
state sequence**, where the window is the smallest span that can fill the budget, capped.

### 5.1 The answers the brief asks for

**Does Slice choose the state/window first, then the questions? — Yes, and this is the core
decision.** Two stages:

1. **Window selection** — pick `(sequence_id, start, end)`.
2. **Question selection** — run the **existing** composer over the union of the window's
   per-state candidate universes, unchanged.

The reason is not aesthetic. Every quality property Champion and Matchup Slices have —
round-robin allocation over *distinct fact* counts, `used_patterns` threaded across the whole
plan, `_interleave_by_key`'s category-run bound and its backward-insert move, within-pattern
rank rotation, the tie deprioritization queue and cap — operates **over a pool**. Give it a
coherent pool and all of it survives untouched. Teach *selection* about states instead, and
every one of those policies has to learn what a state is, which is five measured behaviours
re-opened at once.

**How many states can one Slice span? — Derived, not configured, and hard-capped.**

Measured (§3.1): one state yields **≤4** questions for the single existing family. So a
single-state window **cannot** fill `n=8`. Therefore:

```
k = the smallest contiguous span from `start` whose candidate count ≥ n
    subject to k ≤ MAX_WINDOW_SPAN            (proposed: 3)
```

If `MAX_WINDOW_SPAN` states cannot fill `n`, the slice is reported **under-filled** through the
existing `SELECTION_UNDER_FILLED` diagnostic. It is **never** widened to an incoherent span.

> **This inverts today's priority, deliberately.** Today the budget is hard and diversity is a
> preference. Under a window, **coherence is hard and the budget is the preference**. A slice
> that spans a champion's whole build path to reach eight questions is not a coherent slice; it
> is the old slice with extra words.

**How are transitions represented?** Inside the slice: as the window's derived
`StateTransition` list, frozen in the bundle (§2 K1). They are *context*, not questions — they
are what lets a reveal say "between these two questions you bought Axiom Arc". Transition
**questions** are a later candidate kind in the same universe (D-13 (a)), not built here.

**Should diversity happen within the window rather than globally? — Yes, with one required
change.** All diversity policies run over the window's pool only. But one existing definition
becomes actively wrong:

> `resolver._pattern_group` is `champion:subject_ref:metric`. Under a window, "Ahri Q cooldown at
> state 0" and "Ahri Q cooldown at state 2" are **the same pattern**, so `used_patterns` would
> suppress the second — deleting exactly the progression the window exists to show.

**Recommendation: `_pattern_group` gains the state index for state-bearing candidates only.**
An intrinsic candidate has no state index and its group is byte-identical, so every existing
slice is unmoved. This is the same *shape* of fix as the Matchup rank-identity pass — an
identity that omitted an axis the question actually varied on — which is the strongest available
evidence that it is the right lever: that fix took cooldown comparisons from 45,506 to 192,562
and collapsed groups from 43,085 to 0.

**How to avoid repetition while keeping context? — Two levers, both existing shapes.**
(a) *Within* a state, the shipped distinct-fact round-robin already prevents asking one ability
twice. (b) *Across* states, prefer a **different ability slot at each state**, so the window
reads as a progression of the build rather than a drill on one ability. Proposed as
`RepetitionPolicy.prefer_fresh_subject_across_states`, additive and absent-means-off — the exact
shape the tie policy used (`prefer_discriminating_context` / `max_tie_questions`), which is
already proven to leave every non-opting caller byte-identical and every pre-existing manifest
digest pinned.

**Deterministic seeding.** The mechanism is unchanged; one thing is added. Without it every
slice for one subject opens at the same window.

```
window_start = seeded_offset(selection_salt, sequence_id) mod (len(sequence) - k + 1)
```

`selection_salt` is the existing `MasterySliceModule._selection_salt(order_seed, segment_number)`
— **no new RNG and no second salt derivation**, which handoff fact 14 requires. This is the same
"rotate by a hashed offset" mechanism used twice already: once over the whole pool (Phase 2) and
once within a pattern's variants (rank diversity). Applying it a third time, one level up, is
the consistent move.

**Semantic identity vs composition identity.**

| | includes | excludes |
|---|---|---|
| **Semantic question identity** (`candidate_id`) | intrinsic material + `ScenarioBinding` | state index, sequence, window, slice, salt, basis, answer |
| **Composition identity** (`mastery_set_id` + `artifact_digest`) | the manifest, which must **name the window** (`sequence_id`, `start`, `end`), + the ordered steps | salt, match, instance |

The manifest must name the window or two different windows over one sequence would publish under
one `mastery_set_id`, which `lab.py`'s own `LAB_MANIFEST_PREFIX` comment already warns against:
"Two different question sets must never answer to one identity."

**`n=8` is not architecture.** Nothing above names 8. `n` is the segment's `challenge_count`;
`MAX_WINDOW_SPAN` is a declared policy constant, not a game rule; `k` is derived from both.

### 5.2 Champion and Matchup under one policy

The policy is written over "a sequence for a subject", and `subject` is a champion slug or a
canonical pair. Nothing in §5.1 is champion-specific. What differs for Matchup is only where
sequences come from (two sides, §7.4) and that a pair window must choose whether both sides
advance together — which is generator policy (D-6), not composition policy. §8 recommends not
finding out yet.

---

## 6. Full, defined without implementing it

**Full is the same pipeline with `window = the whole sequence` and no budget.** It is a
parameterisation of §5, not a second system — no separate generation, no Full-only family, no
Full-only question definition.

| question | answer |
|---|---|
| what determines state order | the sequence's own `node.index`. Full never reorders. |
| what determines question order within a state | the existing `CURRICULUM_V2` block sequencing, run per state. Full = concat over states of (the existing composer, budget = the state's whole eligible pool). |
| every candidate, or a curated subset | **a curated subset, and it is already curated by construction.** The read-set bounds it: a candidate whose dependency projection does not change between adjacent states is *the same `candidate_id`* and is deduped to its earliest state. A static cooldown never becomes a candidate at all. So "emit everything" and "emit a useful subset" differ only in adjacent-duplicate policy, which the identity already decides. |
| repeated semantics across adjacent states | one question, emitted at the **earliest** state (design rev 2 §7, retained). The dedupe key is `candidate_id`, which already contains the binding — so no new rule is needed. |
| transitions as questions | deferred. Same universe, separate candidate kind, `state_indices: (i, j)` reserved in `StepBinding` (§3.2) so the container does not change when they arrive. |
| player progress identity | `(sequence_id, state_index, candidate_id)` — §10 G. Deliberately **not** `step_index` (composition-local) and **not** `artifact_instance_id` (per serving): progress must survive recomposition and reseeding. |
| determinism | fixed `(basis, sequence_id, policy, family set)` ⇒ fixed output. **Full takes no salt** — there is no sampling to vary. |

**D-11 (may Full ask what Slice's window-local policies cap?) — recommend yes.** A tie cap of
`max(1, n // 4)` is defined in terms of a budget `n` that Full does not have; `prefer_fresh_
subject_across_states` is a sampling preference with nothing to prefer when everything is
emitted. These are **window-local composition policies** and they do not survive into a
traversal. Full's only exclusions are the publication gate and semantic dedupe — the two that
decide *validity*, which is the correct line.

---

## 7. Where states come from

### 7.1 The abstraction

Parallel to Phase 2's `SetupSource`, one level up:

```
StateSequenceSource        (protocol)
  describe()                                   -> SequenceSourceDescriptor
  sequence_for(subject, ruleset, request)      -> StateSequence | SourceRefusal

SequenceSourceDescriptor
  source_id, source_kind, classification, version, confidence,
  axes_moved         : which axes this source's transitions touch
  presentation_phrase: what a player may be told this is

SequencePolicy         CONFIGURATION, not a generator constant
  default_by_subject_kind : {champion|matchup -> source_id | None}
```

Four invariants, each the sequence-level restatement of a Phase 2 invariant that is already
tested:

1. **Generators never see a source.** They receive a `StateSequence` of templates. Two sources
   that emit the same progression give the same `sequence_id`.
2. **Provenance is preserved and is never identity.** `SequenceProvenance` sits beside the
   nodes, not inside `sequence_id`.
3. **The default is configuration.** `SequencePolicy` may ship empty (explicit only), exactly as
   `SourcePolicy` does today (Phase 2 §5).
4. **One source per sequence, no merging.** A merged progression has no coherent provenance.

Source kinds are an **open registered vocabulary**: `explicit` (typed in the Lab), `rule:`
(generated by a declared rule), `saved:` (a stored sequence revision), `curated:`,
later `observed:`. Adding one is a registration, not a contract change.

### 7.2 The minimum viable first source

The brief asks for something deterministic and under our control, and warns against inventing
external data. It also notes there is no trustworthy rune/shard recommendation authority — and
Phase 2 §9 goes further: runes carry **no source revision at all** and the nine `rune_stats`
rows are *conditional maxima*, while stat shards have **no table and no id space**. So runes and
shards are out for reasons of fact, not taste.

The obvious first choice is a **level-and-rank progression** — levels 6/11/18 with max-legal
ranks — because `BANK_LEVELS` already uses that shape and `rules.max_legal_at_level` already
answers it correctly per champion (including Karma and Nidalee, and refusing the four undeclared
slots rather than guessing). It needs no new data whatsoever.

**It is the wrong first choice, and the measurement says why.** The one existing state-aware
family reads `items` (for haste) and `ability_ranks`. A level-only sequence moves neither bound
metric: `ability_haste.total` is `0` at every node, so every question in the window binds
`{ability_haste.total: 0}` — the same answer as the intrinsic question, in a distinct identity
(design D-20). That ships a product whose entire premise is decorative.

**Recommended first source: `rule.haste_ladder.v1`** — a declared, cumulative ladder over single
canonical ability-haste items.

* **Deterministic and wholly ours.** The ladder is ~3 declared item ids; everything else is read
  from `item_canonical`, which is already the single item authority (WIKI1-1A), already filtered
  to `validated_current` **and** `is_current_sr`, and already fails closed on a stale name
  (Phase 2 §15: 0 item-resolution failures across 173 champions).
* **It moves the axis the family reads.** Measured: Axiom Arc alone → 20 AH; Axiom Arc +
  Cosmic Drive → 45 AH; six haste items → 130 AH. Three distinct bindings, three distinct
  answers, one coherent progression.
* **It invents no data and makes no build claim.** Its `classification` is `curated`, its
  `confidence` is `declared`, and its `presentation_phrase` must say **"with 20 ability haste"**
  — which is what the shipped prompt already says — and must never say "recommended",
  "optimal" or "this build". There is no recommended-build authority, and this source does not
  pretend to be one. (`champion_item_builds.json` stays registered, selectable **by name**, and
  **not** the default — D-9 (c), unchanged.)
* **It is replaceable by configuration.** `SequencePolicy.default_by_subject_kind`. When a real
  build authority exists, changing the default is a config edit and no generator moves (A-3).

**Honest alternative, recorded as the open decision (D-N4).** Ship a *second family* first —
ability cost under a state, or level-scaled stats under items — so that a level sequence has
something to move, and use the level progression (which needs no new data at all) as the first
source. This is cleaner conceptually and strictly more work: it means a new family, a new
read-set, a new precision declaration and a new correctness proof before any sequence exists.

**Recommendation: the haste ladder**, because it is the only option that makes the *existing*,
already-certified, already-correctness-proven family produce a meaningful progression, and
because it needs no new canonical data at all.

### 7.3 Why not the obvious other sources

| candidate | verdict |
|---|---|
| `champion_item_builds.json` | Available as a named source, not a default. Its paths run to **seven** items for 27 champions, which the inventory rule correctly refuses (Phase 2 §15). It calls itself a whitelist and carries `"confidence": "high"` beside `"needs_manual_review": true`. Not an authority. |
| LIVE1 `live_player_state` | Riot ids do not map to the roster. Unusable. |
| historical pro corpus | **Zero item data** (`pro-builds-capability-audit`). Unusable for setup. |
| Journey `TimelineSpec.checkpoints` | The right *shape*, the wrong object: its checkpoints own their questions (§4.2 rule 2). Reuse the idea, not the class. R-7 holds — Journeys are not the source of truth and are not migrated. |

### 7.4 Matchup sources

Deferred with §8. Two sides means two sequences and a question nobody has asked: which
progressions are comparable? Advancing both sides in lockstep is one answer; advancing one is
another (and is exactly the asymmetric case D-6 leaves open). Do not decide it before Champion
has shipped one.

---

## 8. Champion Mastery first

**Recommendation: Champion Mastery.** Six reasons, each checked against code rather than
inferred:

1. **Matchup has no state-aware generation at all.** `scenario.generate_cooldown_under_haste`
   raises `ScenarioFamilyError(state_kind_unsupported)` on a matchup state, by construction
   (Phase 3 §4). Champion is the path that has been built, measured and proven — 2,356
   candidates, 0 answer mismatches.
2. **A Matchup state cannot yet produce a Matchup question.** `pair_derived` is `None` for
   **every** Phase 2 state, because every pair metric the design lists — damage, mitigation,
   penetration — is combat and out of scope. So a matchup state today yields two independent
   single-side question sets: Champion Mastery twice, wearing a pair's name.
3. **Matchup comparison identity depends on `FactContext` agreement** (`matchup/composer.py`): a
   comparison exists only where both facts share an identical context signature. An asymmetric
   pair state is precisely the case that has never been generated, and D-6 is open.
4. **The frozen bundle is 1:1 for Champion.** For Matchup it needs per-side inputs in every
   state, pair canonicalization inside the frozen block, and role remapping in every
   `StepBinding` — all representable (Phase 1 proved the canonicalization), none exercised.
5. **Matchup composition carries three shipped policies** — rank identity, rank diversity, tie
   deprioritization + cap — whose interaction with a window is entirely unmeasured. Champion
   carries one (`used_patterns` + distinct-fact allocation). Changing `_pattern_group` (§5.1)
   under three interacting policies at once is how a measured win gets silently reversed.
6. **The source problem is strictly harder** (§7.4).

**What Champion-first does not foreclose.** Nothing. The contract is `kind`-agnostic, A-2
(independent sides) is settled, `SubjectRef` already covers a pair, and §5's policy is written
over "a subject". Matchup is a later consumer of the same machinery, not a redesign.

---

## 9. Persistence and backward compatibility

### 9.1 Versioning

| block | version | when it bumps |
|---|---|---|
| `mastery_artifact` | `ARTIFACT_SCHEMA_VERSION = 1`, **unchanged** | only when a field inside *it* changes. The state block is a sibling, so it does not touch this. |
| `mastery_state` | `frozen_state_bundle.v1` *(new)* | when the bundle's shape changes |
| each state inside | `frozen_state.v2` | the Phase 1 type is `v1`; §2 adds fields, so it bumps |

Readers follow the rule `serving/artifact.py` already states: accept any version ≤ your own,
and never assume a field exists because your own version declares it.

### 9.2 Optional, absent-means-unknown

The block is **optional**. Every segment frozen before it — which is every segment that exists —
carries none, and every reader treats absence as "predates the contract", never as an error.
Three shipped precedents in the same payload: `mastery_artifact`, `PAYLOAD_REVEAL_WINDOW_MS`,
`PRIVATE_CANONICAL_REF`.

### 9.3 Review behaviour

`review.py:_mastery_slice_round` gains one key, `mastery_state`, produced by a **new positive
allow-list projection** `state_review_view(bundle)` mirroring `served_artifact.review_view`. It
is gated on `revealed` for a stronger reason than the artifact block is: the state block
contains `derived_used`, and the answer metric's value **is the answer** (§1.4 (a)).

Old rows → `None` → "state unknown". New rows without a state (every intrinsic slice, forever)
→ `None` too, and that is correct: an intrinsic question has no state, and `None` means exactly
that. **A slice must never carry an empty bundle to mean "intrinsic"** — absent and empty must
stay distinguishable, the same rule that makes an empty `ScenarioBinding` add no key.

### 9.4 Failure behaviour

| when | behaviour | why |
|---|---|---|
| **write** — freeze fails, or a seed metric is missing from `derived_used` (§2.2) | **fail closed: the segment fails** | A served state-aware question with no frozen state is unexplainable *forever*; a frozen artifact is never rewritten. This matches the existing rule that a private-payload write failure fails the segment. |
| **write** — bundle has mixed basis / ruleset / `rules_rev` | **refuse** (`basis_mismatch`) | Phase 2's matchup rule, one level up. |
| **read** — block malformed, unparseable, or an unknown future version | **fail soft**: render `None`, log a warning | A broken diagnostic must never cost a player a review. Same fail-soft posture as `_numeric_input_constraints` and `mastery/serving/attempts.py`. |
| **read** — `step_binding.state_index` names no state | **fail soft** for that step only; the rest of the bundle renders | Partial information beats none. |
| **verify** — recomputed key or digest ≠ stored | **report**, never repair | A repaired artifact is indistinguishable from an honest one. |

### 9.5 Analytics

Add `semantic_state_key`, `resolved_state_digest` and the step's binding to
`attempt_provenance`'s positive list, so `quiz_attempts.provenance_json` can group attempts by
state without joining the round row. `provenance_json` is TEXT and already free-shaped: **zero
DDL**.

### 9.6 When a migration WOULD be required

Only one case, and it is not proposed: if state ever had to be **queryable across rounds** —
"every attempt at any Ahri state with ≥20 haste" — a JSON scan over `segment_private_json`
would not serve it and a normalized table (Option C) plus DDL would be needed. That is an
analytics requirement nobody has stated. If it ever is stated, it is a **read model built beside
the frozen row**, never a replacement for it: the row stays the authority, exactly as
`mastery/serving/artifact.py` argues.

---

## 10. Identity

| | identity | includes | excludes |
|---|---|---|---|
| **A** | semantic **question** identity — `candidate_id` | champion, category, metric, `subject_ref`, `FactContext`, `interaction_kind`, template, **`ScenarioBinding`** | the answer, the basis, the state key, the state index, the sequence, the window, the slice, provenance, the salt |
| **B** | semantic **state** identity — `semantic_state_key` | ruleset + per-side canonical setup inputs, sides in canonical order | basis, derived values, provenance, template, label |
| **C** | exact **resolved-state** digest — `resolved_state_digest` | the key + every derived value (metric, status, reason, value, unit, derivation, `depends_on`) | provenance, basis id **and** label, `rules_rev`, `derivation_version`, per-value store revisions |
| **D** | **sequence** identity — `sequence_id` *(new)* | kind, subject, `policy_id`, the ordered semantic projection of each node's template | labels, `checkpoint_kind`, provenance, reasons, basis, anything resolved |
| **E** | **window / composition** identity — `mastery_set_id` + `artifact_digest` | the manifest (which names `sequence_id`, `start`, `end`) + the ordered steps | the salt, the match, the instance |
| **F** | **artifact instance** identity — `artifact_instance_id` | `mastery_slice`, schema version, `match_id`, `segment_number`, `mastery_set_id`, `artifact_digest`, `question_count` | — unique per serving, by construction |
| **G** | **player progress** identity *(new)* | `(sequence_id, state_index, candidate_id)` | manifest, window, salt, instance, match, `step_index` |

### 10.1 The owner's example, worked

*Ahri L7, Q r4. Build A = Axiom Arc (20 AH). Build B = Fiendish Codex + Caulfield's Warhammer
(20 AH).*

| | A vs B | why |
|---|---|---|
| **A** question | **same** | The binding holds the resolved *value*, not the items. Measured roster-wide in Phase 3: **589/589** identical at equal haste, **589/589** different at 20 vs 40. |
| **B** state key | **differs** | The item multisets differ. |
| **C** state digest | **differs** | And for a stronger reason than the key: the two builds differ in AP, AD and cost as well as haste, so several derived values move even where the bound one does not. |
| **D** sequence | same only if both are nodes of the same sequence | A build path is a sequence; two different paths are two sequences. |
| **E** window | differs if the window differs | Two windows over one sequence are two compositions. |
| **F** instance | **always unique** | Match + segment are in the material. |
| **G** progress | same only at the same `(sequence, index)` | Progress is about *where you are*, not which copy you were served. |

### 10.2 The two cases worth stating explicitly

**A level the answer does not read changes the STATE and not the QUESTION.** Ahri Q r4 with
20 AH at level 7 and at level 11 are one `candidate_id` and two `semantic_state_key`s. That is
the read-set doing its job, and it is why I1/I2 (§2) freeze the read-set: without it, this
correct behaviour is indistinguishable from a bug.

**`{ability_haste.total: 0}` is not the intrinsic question** (D-20, still OPEN as a *composition*
policy). Same answer, different identity: "read the axis and found zero" and "did not read this
axis" are different questions. §7.2 is where this stops being philosophy — a level-only first
source would make every shipped question the zero-bound case.

---

## 11. Transitions

A `StateTransition` **describes** a change and owns nothing else.

| it describes | it never does |
|---|---|
| previous state (index + `resolved_state_digest`) | hold question text |
| next state (index + `resolved_state_digest`) | calculate an answer |
| `changed_axes` — from the closed `Axis` vocabulary | own presentation |
| `delta` — per axis, before → after | own a family or a read-set |
| `reason` — optional, provenance only | enter `sequence_id` |

**Derived by diff, never authored** (§4.2 rule 3).

**Is transition identity useful? Yes — three concrete uses, none of which require a transition
question to exist:**

1. It **names the thing a later transition question would ask about** ("what happened to Q's
   cooldown when you bought Axiom Arc?"), so the candidate kind has a key waiting.
2. It lets Full **dedupe a repeated change** — buying the same component twice in a long
   sequence is one learning event.
3. It gives the frozen bundle a **compact** way to say what moved between two frozen states
   without repeating either. At ~680 B of shared header per state, a 60-byte delta is the
   cheaper record of "level 7 → 11".

Vocabulary reused from `TransitionType`: `LEVEL_CHANGE`, `ABILITY_RANK_CHANGE`, `ITEM_ACQUIRE`,
`ITEM_COMPLETION`, `ITEM_REMOVAL`, `ITEM_SALE`. The **engine** is not reused and Journeys are not
touched.

**Explicitly not designed and not implemented:** combat / in-fight transient state — current HP
and resource, shields, buffs, stacks, charges, cooldowns in flight, gold. That is the encounter
layer, and it stays outside this contract.

---

## 12. The smallest next implementation phase

### Phase 4A — the frozen-state bundle contract and a verified round-trip. No player serving.

**Why this and not "persist the block".** Persisting is one line. The block being *wrong* is the
risk, and it is currently **provably wrong**: `derived_used` is empty on every block the code can
produce (§0.2) and item labels are absent (§1.6). Making that durable would freeze both defects
into history permanently — the one thing this workstream cannot undo. Get the block right, prove
it round-trips and self-verifies, and *then* persist it.

**In scope**

1. **Fix the `used_metrics` shape defect** — `scenario.ScenarioGeneration.used_metrics` becomes
   per-side, or `lab.py` wraps it. Plus a test that **fails at the defect** (the standard this
   workstream has held since the rank-diversity pass: flip the fix off, watch the suite go red).
2. **Implement the §2.2 `derived_used` rule** — the generator's declared set, validated to
   contain every bound and answer metric — with the write-time refusal when a
   seed metric is absent.
3. **Add the §2 fields**: `display_labels`; `resolver_version` / `derivation_version`;
   `warnings`; `state_index`; and on `StepBinding` — `state_index`, `family_id`,
   `answer_metric`, `candidate_id`, `content_digest`; plus the bundle-level `families` map
   carrying each family's `generation_id`, `read_set` and `binding_precision`.
4. **Add `FrozenStateBundle`** (k ≥ 1) with the refuse-on-mixed-basis rule. `transitions` and
   `sequence_ref` are typed and empty/`None`; nothing produces a k > 1 bundle yet.
5. **Add deserialization and verification**: `from_dict` for the frozen types, and
   `verify_frozen_bundle(block)` which recomputes `semantic_state_key` and
   `resolved_state_digest` from the block's own contents — **with no canonical read**, which is
   the property that makes it worth having.
6. **Round-trip proof**: freeze → JSON → parse → verify, over a read-only roster-wide probe
   (not committed).
7. The Lab keeps returning `frozen_state_preview` — now complete, labelled and verifiable — and
   `frozen_state_is_persisted` stays `false`.

**Explicitly NOT in 4A:** no `StateSequence`, no window, no Slice change, no Full, no player
serving, no persistence to any round row, no review projection, no attempt-provenance change, no
new family, no `mastery_slice` mode, no config key, no frontend requirement, **no DDL**.

**Files likely changed** (backend; every one already inside the declared `GR1_PACKAGES`
footprint, so no guard list moves):

| file | change |
|---|---|
| `mastery/setup_state/contract.py` | `FrozenStateArtifact` v2 fields, `FrozenStateBundle`, `FrozenTransition`, `from_dict` |
| `mastery/setup_state/frozen.py` *(new)* | `freeze_*`, the `derived_used` validation, `verify_frozen_bundle` — kept out of `contract.py` so the contract half stays literal-free |
| `mastery/setup_state/scenario.py` | per-side `used_metrics`; export `read_set` / `answer_metric` per candidate |
| `mastery/setup_state/lab.py` | the corrected call, bundle assembly, `display_labels` |
| `mastery/setup_state/__init__.py` | exports |
| `mastery/tests/test_setup_state_frozen_bundle.py` *(new)* | round-trip, verification, refusals |
| `mastery/tests/test_gr1_state_aware_lab.py` | the failing-at-the-defect test |
| `mastery/tests/test_setup_state_isolation.py` | the pinned module set grows by one |

**DB migration: none.** Nothing is persisted in 4A at all.

**Tests.** The four new/changed files above; plus the standing regression arm — `mastery/tests`
+ the Ranked-Mastery integration files, compared as a **failure SET** against the base, never as
totals (the five pre-existing failures are documented and the Mastery isolation tests fail by
construction on any branch).

**Rollback surface.** One commit, additive, inside one package, with one admin route behind a
flag that is off. `git revert`. Nothing persisted, nothing to un-migrate, no caller outside the
Lab.

**What remains unwired after 4A** — and this is the point: persistence to
`segment_private_json`; the review projection; attempt provenance; `StateSequence`;
`StateSequenceSource` and the first source; Slice windows and the `_pattern_group` change; Full;
Matchup; any second family; and Ranked reachability.

### The phases after it, named but not scoped

**4B** the sequence contract + the first source, inert (no composer change).
**4C** persistence + review + attempt provenance, Lab-only, k = 1.
**4D** Slice windows (the `_pattern_group` change, `MAX_WINDOW_SPAN`, seeded window choice).
**4E** Ranked reachability — a mode, a config key, a schema branch, a readiness entry, and the
owner deciding state-aware questions should be served at all.
**4F** Full.

Each has its own approval. None of them is started.

---

## 13. Decisions

**Status key. APPROVED** = carried from a prior phase where the owner approved it.
**PROPOSED** = new in this document, **not owner-approved**.

### 13.1 Approved from prior phases (unchanged here)

| # | Decision |
|---|---|
| R-1 | Questions consume state; they do not own or hardcode it. |
| R-2 | `StateTemplate` = request · `ResolvedState` = exact normalized + derived · `FrozenStateArtifact` = what was served. |
| R-3 | `FactContext` stays intrinsic; scenario inputs travel in a separate `ScenarioBinding`. |
| R-4 | `ScenarioBinding` contains the answer-relevant state inputs — the dependency projection, not the whole state. |
| R-5 | Source provenance is never semantic identity. |
| R-6 | One generated universe feeds Full and Slice; both are composers, not generation systems. |
| A-1 | No architectural level-18 / six-item cap. Capability ≠ rules authority ≠ derivation support. |
| A-2 | Matchup state supports independent sides; symmetric-only generation is a generator policy. |
| A-3 | Setup sources are replaceable; the default is configuration; no recommended-build authority exists. |
| A-4 | Historical basis is a capability, not a state-model limit. An unavailable basis refuses. |
| R-9 | Fail closed; never silently substitute a zero or a default. |

### 13.2 Proposed now — **NOT owner-approved**

| # | Decision | Recommendation |
|---|---|---|
| **D-N1** | **Frozen-state home** | A new top-level `mastery_state` key in `segment_private_json`, sibling to `mastery_artifact`. Never inside it, never in a challenge row, never public. §1.4 |
| **D-N2** | **Frozen artifact granularity** | **Option B** — one slice-level `FrozenStateBundle` holding ordered, **self-contained** `FrozenStateArtifact`s + step→state bindings, with a refuse-on-mixed-basis rule. Reject A (84 % duplication at k=1), C (needs DDL and reverses a shipped, reasoned decision), D (two-place step→state lookup). §3 |
| **D-N3** | **Frozen payload, §2 table** | Add `display_labels`, `resolver_version`/`derivation_version`, `warnings`, `state_index`; per-step `state_index`/`family_id`/`answer_metric`/`candidate_id`/`content_digest`; and a hoisted bundle-level `families` map (`generation_id`, `read_set`, `binding_precision`). `derived_used` = the generator's **declared** set, **validated** to contain every bound and answer metric — not a `depends_on` closure, which §2.2 shows is not implementable. Never freeze the full derived block (12.3 KB vs 2.0 KB), the template, the pool or the salt. §2 |
| **D-N4** | **State-sequence model** | `StateSequence` of `StateNode`s holding **templates only**; transitions **derived by diff**; `StateWindow` for Slice; `sequence_id` excludes provenance. No questions inside the sequence object — the explicit break with `TimelineCheckpoint`. §4 |
| **D-N5** | **Slice coherence policy** | Window first, then the existing composer inside it. `k` derived as the smallest span that fills `n`, capped at `MAX_WINDOW_SPAN` (proposed 3); an unfillable window is **under-filled**, never widened. Window choice seeded from the existing `selection_salt`. §5 |
| **D-N6** | **`_pattern_group` gains the state index** for state-bearing candidates only | Required, or `used_patterns` deletes the progression a window exists to show. Intrinsic candidates byte-identical. §5.1 |
| **D-N7** | **Full traversal policy** | `window = whole sequence`, no budget, no salt; state order = node order; question order = existing `CURRICULUM_V2` per state; adjacent semantic duplicates collapse to the earliest state by `candidate_id`. Window-local policies (tie cap, cross-state freshness) do **not** apply to Full — D-11 (a). §6 |
| **D-N8** | **First state source** | `rule.haste_ladder.v1` — a declared cumulative ladder of single canonical ability-haste items. Deterministic, entirely ours, no new data, and it moves the axis the one existing family actually reads. **Alternative:** ship a second family first and use a level progression instead. `champion_item_builds.json` stays selectable-by-name and not the default. §7.2 |
| **D-N9** | **First consumer** | **Champion Mastery.** Matchup has no state-aware generation, no pair-derived metric, three interacting composition policies and a harder source problem. §8 |
| **D-N10** | **Player progress identity** | `(sequence_id, state_index, candidate_id)` — not `step_index`, not `artifact_instance_id`. §10 G |
| **D-N11** | **Transition identity is computed and frozen** | `transition_digest` over `(from digest, to digest, changed_axes, delta)`, on the `MasteryStateTransition.deterministic_id` precedent. No transition question is generated. §11 |
| **D-N12** | **Versioning** | `mastery_artifact` stays at `ARTIFACT_SCHEMA_VERSION = 1`; the state block carries `frozen_state_bundle.v1` / `frozen_state.v2`. Optional, absent-means-unknown. §9.1 |
| **D-N13** | **Failure posture** | Fail **closed on write** (a served state-aware question with no frozen state is unexplainable forever); fail **soft on read**; **report, never repair** on verification mismatch. §9.4 |
| **D-N14** | **Next phase = 4A** | Fix the `derived_used` defect, complete the payload, add the bundle, add `from_dict` + `verify_frozen_bundle`, prove the round-trip. **Persist nothing.** §12 |

### 13.3 Still open from earlier phases, and not closed here

D-6 (asymmetric matchup **generation** policy) · D-13 (transition questions as a product) ·
D-17 (eligibility of new state-reading families) · **D-20** (whether a composer may put a bound
`{AH: 0}` and the intrinsic question in one slice — §7.2 shows this stops being theoretical the
moment a state source is chosen) · the patch-identity mismatch between a state's `DataBasisId`
and a Mastery artifact's `patch_key_digest` · the three-champion `db_lookup_name` normalization
gap (`dr-mundo`, `nunu`, `renata`) · four champions' undeclared rank-availability rules
(`elise/R`, `jayce/*`, `udyr/*`, `yuumi/Q`) · runes and shards.

---

## 14. Out of scope — confirmed not done

No runtime code. No schema, no migration, no DDL. No `FrozenStateArtifact` persisted anywhere.
No `StateSequence`, no window, no Full mode. No Slice composition change. No new family. No
change to Champion Mastery, Matchup Mastery, Ranked, the publication gate, the resolver, the
Generator Lab, `quiz/family_contract.py`, Journeys, `CanonicalMasteryState`, Combat Lab or the
frontend. No `mastery_slice` mode. No config key or flag. The two defects in §0.2 and §1.6 were
**found and recorded, not fixed** — fixing them is Phase 4A item 1.

The backend was read at `origin/master` `e9bdf537` with `git show` / `git grep`. Two read-only
probes opened `lol_calc.db` with `mode=ro` from the clean `~/lcs-wt-gr1-state3` worktree; both
live in the session scratchpad and are **not committed** (project rule: no diagnostics in
commits). No worktree other than this documentation one was modified. Only this document and the
handoff were edited.
