# GR1 — Reusable state architecture: Phase 1 (inert foundation)

**IMPLEMENTED AND MERGED TO `master`. Inert by construction.** Phase 1 adds the contract, pure
identity helpers, structural validation and the refusal vocabulary. Nothing calls it. No
Champion Mastery, Matchup Mastery, Ranked, Combat Lab, Journey, Generator Lab or frontend
behaviour changed. It has no derivation, no Full mode, no DB read, no migration and no
persistence change.

| | SHA | Note |
|---|---|---|
| Backend base at implementation | `origin/master` **`b1fd3510`** | Same base the design revision 2 read. |
| Backend base at integration | `origin/master` **`cf1d2db2`** | `origin/master` moved two items-only commits (`fc19ba57`, `cf1d2db2`) during the phase. **Zero file overlap** — neither touched `mastery/`. Clean rebase, same 11 files. |
| Backend commit | **`88c9f7a0`** (was `d9db54cb` before the rebase) | One commit. **PUSHED to `origin/master`** on 2026-09-19, which auto-deploys. Nothing is wired, so the deploy carries no behaviour change. |
| Docs base | `origin/main` **`0bddb784`** | This moved from the brief's `82b7acf6` by one unrelated rfx1 docs commit. |
| Design | [`gr1-reusable-state-architecture-design.md`](./gr1-reusable-state-architecture-design.md) rev 2 §15 | The owner approved Phase 1 (D-21), with the package name `mastery/setup_state/` (D-18 option a). |

---

## 1. What was added

```
mastery/setup_state/__init__.py      public names
mastery/setup_state/contract.py      types (below); no game-rule numbers
mastery/setup_state/identity.py      semantic key, resolved digest, canonical order, bind_identity
mastery/setup_state/validation.py    structural validation only
mastery/setup_state/errors.py        refusal vocabulary
mastery/tests/test_setup_state_contract.py            30 tests
mastery/tests/test_setup_state_identity.py            30 tests
mastery/tests/test_setup_state_legacy_invariance.py   17 tests  ← the key acceptance test
mastery/tests/test_setup_state_isolation.py           26 tests
```

**Existing files changed: two, both test support, three lines of code.**
`mastery/tests/facts_support.py` adds `"mastery/setup_state/"` to `GR1_PACKAGES`, and
`test_footprint_guard_split.py` updates the pinned set to match. The committed-footprint guards
(`test_no_existing_mastery_or_quiz_file_was_modified` and its siblings) fail on any committed
path outside a declared footprint. Declaring the new package is the only way to add it without
weakening those guards. See ambiguity A-1.

## 2. Contracts

All types are frozen dataclasses. Mappings passed to them are normalized to key-sorted pair
tuples, so equality never depends on the order the caller wrote. A duplicate key is refused,
not resolved as last-one-wins.

### Vocabulary

| Name | Values |
|---|---|
| `StateKind` | `champion`, `matchup`. `SIDE_COUNT = {champion: 1, matchup: 2}` is the structural shape, not a game rule. |
| `Axis` (closed) | `form`, `position`, `level`, `ability_ranks`, `items`, `runes`, `shards`. The values on each axis are open data. |
| `AxisState` | `intrinsic` (the state deliberately does not model this axis) and `absent_unrequested`. A resolved axis never holds `None`, and "unknown" never means zero. |
| `DerivedStatus` | `supported`, `unsupported`, `not_applicable` |
| `BasisAvailability` | `live_only`, `retrievable` |

### `StateTemplate` (a request)

`StateTemplate{kind, sides: tuple[SideTemplate], shared: SharedContextTemplate, template_ref?,
label?, template_schema_version="state_template.v1"}`

* `SideTemplate{champion (canonical slug), form?, position?, setup_source: SourceRef?, level:
  int | LevelRule | None, ability_ranks: {slot→int} | RankRule | None, items: tuple[ItemEntry]?,
  runes: tuple[str]?, shards: tuple[str]?}`. A side holds no derived value, question,
  presentation or encounter field. A test pins that.
* `ItemEntry{item_id (canonical), slot: int?}`. An item sequence can have any length. A bare
  string is accepted as shorthand for `ItemEntry(id)`.
* `LevelRule` / `RankRule{rule_id, params}` name a rule for filling an axis. A later rules
  authority evaluates it (for example `max_legal_at_level`).
* `SharedContextTemplate{ruleset, basis_request: BasisRequest}` is the **one** context both sides
  of a matchup share.
* `BasisRequest{kind: current | pinned, basis_id: DataBasisId?}`. `current` is a request alias
  only.
* `to_dict()` / `from_dict()` round-trip. Tested with every optional field populated.

### `ResolvedState` (the exact resolved setup)

`ResolvedState{kind, sides: tuple[ResolvedSide], shared: ResolvedSharedContext, resolution:
ResolutionRecord, semantic_state_key, resolved_state_digest, pair_derived: PairDerived?,
resolved_schema_version="resolved_state.v1"}`

* `ResolvedSide{inputs: SetupInputs, derived: DerivedBlock, sources: SideProvenance}`
* `SetupInputs`: the normalized exact inputs. Each axis holds a value or an `AxisState`, never
  `None` and never an unevaluated rule. It has **no provenance field**.
* `DerivedBlock{values: tuple[DerivedValue]}`. Values are sorted by metric, and a metric may
  appear only once.
* `DerivedValue{metric, status, unit, value?, reason?, derivation?, depends_on, sources:
  tuple[SourceRevision]}`. **The constructor enforces the status rules.** A `supported` value
  needs a number. `unsupported` and `not_applicable` values may not carry one. An `unsupported`
  value needs a reason. **Unsupported is never zero.**
* `PairDerived{entries: (source_side, target_side, DerivedValue)}` uses canonical side indices.
  It is a type only; nothing computes pair values yet.
* `ResolvedSharedContext{data_basis: DataBasis (CONCRETE), ruleset, rules_rev}`
* `DataBasis{id: DataBasisId{scheme,key}, availability, patch_label?, store_revisions,
  resolved_at?}` is one shape for current and historical data.
* `ResolutionRecord{resolver_version, derivation_version, template_key?, template_ref?,
  basis_request?, derivation_support: DerivationSupport?, warnings}` records provenance of *how*
  the state was resolved.
* `DerivationSupport{support_id, level_range?, supported_axes, supported_metrics}` is a type
  only. It is data and never legality.
* `SetupRecord` (the normalized output of any source, carrying `provenance: SourceProvenance`),
  `SourceRef`, `SourceProvenance`, `SourcePolicy{default_by_axis}` and `TemplateRef` are types
  only.
* Build a state with `assemble_resolved_state(kind, sides, shared, resolution, pair_derived=)`.
  It orders sides canonically, remaps pair indices and computes both identities. It computes no
  derived value.

### `FrozenStateArtifact` (what was served)

`FrozenStateArtifact{semantic_state_key, resolved_state_digest, inputs (per side), data_basis,
ruleset, rules_rev, source_provenance (per side), derived_used (per side, only values some served
question read), pair_derived_used?, display_names, template_key?, template_ref?, step_bindings:
tuple[StepBinding{step_index, resolved_state_digest, binding}], frozen_schema_version}`.

`freeze_resolved_state(state, used_metrics=, step_bindings=, display_names=)` is a pure copy.
Nothing is recomputed. **`mastery_artifact` persistence is not modified.** The block is not
written anywhere.

### `ScenarioBinding`

`ScenarioBinding{inputs: {key → value}, roles: {role → canonical side index}, version=
"scenario_binding.v1"}` with `EMPTY_BINDING = ScenarioBinding()`.

* It is generic and typed. It has no hardcoded field names. Single-champion keys are bare
  (`"ability_haste.total"`). Pair keys are `side<i>.<metric>` with a canonical `i`.
* Values can be `int`, `str` or finite `float`. A float with an integral value becomes an int,
  so `20.0 ≡ 20`. Other floats are kept exactly. `bool`, `NaN`, `None` and containers are
  refused.
* It has **no provenance field**. `ScenarioBinding(..., provenance=...)` is a `TypeError`.
* `FactContext` is untouched.

## 3. Identity rules

| Identity | Built from | Excludes |
|---|---|---|
| `semantic_state_key` | `"sstate.v1:"` + canonical JSON of `{kind, ruleset, sides}`, with sides in canonical order. Per side: `champion`, then each axis. A specified axis is its value. An `intrinsic` axis is `null`. An `absent_unrequested` axis is **omitted**. Absent, intrinsic and specified therefore give three different keys. Ranks are a slot map. Items, runes and shards are sorted **multisets**. An item's inventory position counts only when `ItemEntry.slot` is set explicitly. | basis, derived values, provenance, template, label |
| `resolved_state_digest` | `content_hash(prefix="rstate_")` over the key, every derived value's `{metric, status, reason, value, unit, derivation, depends_on}` per side, pair values, `derivation_version` and `rules_rev` | provenance, template, basis id and label, and each value's `sources` (store revisions) |
| question identity | `bind_identity(material, binding)`. **An empty or `None` binding returns the same object** (`is`, not only `==`). A non-empty binding returns a new dict with exactly one added key, `"scenario_binding"`. | provenance (structurally unreachable) |

The design's owner examples, each covered by a test:

* **Manual vs saved source, same setup:** same key, same digest, different provenance.
* **A new basis (fingerprint, patch label, store revision) with no consumed value moved:** same
  key, same digest.
* **A new basis that moved a consumed value:** same key, **different digest**.
* A `rules_rev` or `derivation_version` bump moves the digest. So does `supported` becoming
  `unsupported`.
* `{ability_haste.total: 0}` is **not** the same identity as the empty binding. "Read zero" and
  "did not read" stay distinct (D-20 remains a composition-policy question).
* Two builds that resolve to the same bound value give the same question identity, even though
  their state keys differ.

**Matchup canonicalization.** Side order is `(champion slug, side setup key)`. Whole sides move,
so a setup is never re-paired with the other champion. `canonicalize_sides(sides, binding)`
returns the ordered sides, the permutation and the binding with roles and `side<i>.` keys
remapped.

* `(Ahri L7, Syndra L6) ≡ (Syndra L6, Ahri L7)`, and `≠ (Ahri L6, Syndra L7)`.
* Asymmetric items and ranks stay attached to their champion.
* A directional role survives the reorder. "Ahri → Syndra" is one identity from either call
  order, and "Syndra → Ahri" is a different one.
* In a mirror matchup (Ahri L11 vs Ahri L6), the setup key orders the sides deterministically.
* In an identical mirror (Ahri L6 vs Ahri L6), the binding is minimised over the side swaps that
  leave the sides unchanged, so one question never gets two identities.
* Attacker/target direction is **not** part of state ordering. It lives only in the binding.

## 4. Validation scope

Validation is **structural only**. It decides everything from the object it is given:

* the schema version
* `kind` and whether the side count matches it
* sides passed as a tuple
* canonical identifiers present: non-empty, no surrounding whitespace
* level is a positive int or a `LevelRule`
* ranks map a non-empty slot to an int ≥ 0, or are a `RankRule`
* items are `ItemEntry` values, with slot ≥ 0 when set
* one source per side (`multiple_sources`)
* a `current` basis request names no id, and a `pinned` one names a complete id
* a resolved side holds no `None` and no rule
* binding keys and roles name sides that exist, and a key's shape fits the state kind
* a stored key or digest equals the one recomputed from the contents, and sides are in
  canonical order (`StateIntegrityError`)
* frozen step indices are unique, and each step names the digest of the state that was frozen

`check_basis_request(request, available_ids)` refuses a pinned basis that is not in the set the
**caller** supplies (`HistoricalBasisUnavailable`). Phase 1 knows of no basis on its own.

**Not validated, by design:** level legality, rank ceilings or availability, ultimate unlock
levels, item slot counts or legality, rune-page or shard shape, patch availability, whether a
champion or item id exists, and derivation support. Level 19, a rank of 6 on every Udyr slot,
Nidalee R at level 1, Karma at level 30 with R4, and a seven-item inventory all construct **and
validate**. Those numbers appear only in test fixtures.

## 5. Errors

| Class | Phase 1 |
|---|---|
| `TemplateInvalid(code)`: `malformed_container`, `side_count`, `missing_identifier`, `invalid_type`, `unknown_axis`, `unknown_kind`, `unknown_schema_version`, `multiple_sources`, `duplicate_key`, `invalid_binding` | raised |
| `StateIntegrityError`: `semantic_state_key_mismatch`, `resolved_state_digest_mismatch`, `sides_not_in_canonical_order` | raised |
| `HistoricalBasisUnavailable` | raised only by `check_basis_request`, and only against a caller-supplied set |
| `NormalizationError`: `unknown_champion`, `item_not_current`, `unknown_rune`, `unknown_shard`, `illegal_level`, `illegal_rank`, `rank_rule_unsupported`, `inventory_policy`, `basis_mismatch` | **reserved.** It needs rules and canonical data, which Phase 1 does not read. |
| `SourceUnavailable` | **reserved** for Stage 2 adapters |
| "Unsupported derivation" | **not an exception.** It is a `DerivedValue` status with a `REASON_*` code (`derivation_support_range`, `rune_effects_unsupported`, `shard_effects_unsupported`, `no_canonical_value`), because the design makes it non-fatal to the state. |

## 6. Proof of no runtime wiring

`test_setup_state_isolation.py` checks each of the following mechanically:

* **No importer.** It runs an AST scan plus a text scan (which catches `importlib` strings) over
  every `.py` file listed by `git ls-files -co --exclude-standard` (2,686 files). No module
  outside `mastery/setup_state/` and test code names the package. A negative control proves the
  scan catches `from mastery import setup_state` and a dynamic `import_module`, and ignores test
  files.
* **Nothing forbidden loads.** Each of the package's five modules is imported in a fresh
  subprocess. None of them loads `sqlite3`, `mastery.{facts, knowledge, matchup, synthesis,
  serving, publication_gate, publication, state, transitions, chains, identity, data}`, `quiz`,
  `routes`, `ranked_public`, `ranked_modules`, `services`, `champion_state`,
  `champion_stat_profile`, `calculate_build_stats`, `fastapi` or `starlette`. A negative control
  proves the detector sees a real leak.
* **Imports are limited.** The package imports only the stdlib (`dataclasses`, `enum`, `typing`,
  `math`, `itertools`, `re`), `mastery.provenance.hashing` and its own modules.
* **No I/O calls.** The package makes no `open`, `exec`, `eval`, `__import__`, `.connect`,
  `.execute`, `.read_text`, `.write_text`, `import_module` or `environ` call.
* **No game-rule number.** Every integer literal in the package source is 0, 1 or 2, and there
  are no float literals. The ability-slot letters Q/W/E/R are not hardcoded.
* The module set is pinned, and the package is declared in `GR1_PACKAGES`.

`git diff --stat cf1d2db2..88c9f7a0` lists 9 new files and 2 test-support edits. No production
module, generator, route, frontend file, migration or persistence path changed.

## 7. Backwards compatibility

`test_setup_state_legacy_invariance.py` uses the existing `facts_support` fixtures: both schema
shapes, Ahri, Syndra, Olaf and Jarvan IV, and `test_matchup_identity`'s pairs.

* **Champion Mastery facts:** each fact comes from `fact_set.facts` plus the level-scaled facts
  in `facts_by_id`. `bind_identity(m, EMPTY) is m`, the canonical JSON is byte-equal, and
  `fact_id` and `content_digest` both reproduce through the helper.
* **Champion Mastery candidates:** `candidate_id` and `content_digest` reproduce through the
  helper.
* **Matchup comparisons:** `candidate_id` and `content_digest` reproduce. The reversed pair gives
  identical `(id, key, digest)` lists.
* **Import side effects:** a subprocess that **never** imports `mastery.setup_state` (asserted
  inside that subprocess) builds banks whose fact ids and digests, candidate ids, keys and
  digests, and matchup ids, keys and digests all equal the in-process build with the package
  loaded.
* **A binding really changes identity:** empty, `{AH: 0}` and `{AH: 20}` give three distinct ids
  on a real candidate, and the original material is never mutated.

**A roster-wide read-only probe was run as evidence and not committed** (project rule). It used
the real `lol_calc.db`, opened read-only. **173/173** banks built with zero errors. **12,333**
facts and **8,806** candidates reproduced `fact_id`, `candidate_id` and both digests
byte-for-byte through the empty binding. **60 random pairs** (seed 0) gave **2,961**
comparisons, and each pair reproduced `candidate_id` and `content_digest` and was
reversal-identical.

## 8. Test results

Run with `/Users/macmoney/League_Combat_Simulator/.venv/bin/python -m pytest`, in the backend
worktree with `lol_calc.db` symlinked (gitignored, opened read-only by the GR1 rank, tie and
composition tests).

| Run | Result |
|---|---|
| New `test_setup_state_*` (4 files) | **103 passed** |
| Focused suites at the integration base `cf1d2db2`: `test_knowledge_bank_*`, `test_matchup_*`, `test_champion_facts_*`, `test_gr1_*` (Champion readiness, Matchup rank identity, rank diversity, tie policy, Phase 2/3/4, QCA8), `test_footprint_guard_split`, `test_phase4f_ranked_mastery_slice`, `test_manifest_isolation` | 1 failed, 1042 passed, 13 skipped |
| The same suites + the new tests at `88c9f7a0` (post-rebase) | 1 failed, **1152 passed**, 6 skipped |

**The failure set is identical**: one pre-existing failure,
`test_phase4f_ranked_mastery_slice::test_format_for_creation_is_unaffected_by_this_module`
(`'ranked_points_v2' == 'ranked_modern'`, a Ranked default-format drift unrelated to GR1). The
counts reconcile: 1042 + 103 new + 7 committed-diff footprint guards that skip while nothing is
committed = 1152.

## 9. Design ambiguities found (for the owner)

* **A-1 — "zero existing files modified" is not literally possible.** The footprint guards
  require every committed path to belong to a declared workstream. Phase 1 therefore edits two
  test-support files, adding one tuple entry and one pinned-set entry. No runtime file changed.
* **A-2 — `FrozenStateArtifact` is single-state.** Design §1.C gives the block one key and one
  digest, but calls `step_bindings` "required when >1 state". Phase 1 freezes **one block per
  resolved state**, and each `StepBinding` must name that block's own digest. A multi-state
  container (a Slice window or sequence) is a Stage 3/4 decision. `StepBinding` already carries
  the digest, so the container can be added without changing this type.
* **A-3 — Runes and shards are order-free multisets for identity.** Positional meaning, such as
  a shard's row, is not an input unless normalization encodes it in the canonical key (for
  example `offense.adaptive`). A future `ShardRef{id,row}` would parallel `ItemEntry.slot`. That
  choice belongs to the rules authority and normalization stage.
* **A-4 — No per-metric precision registry exists.** The design rounds binding floats to "the
  metric's declared precision". Phase 1 normalizes integral floats to ints and keeps other
  floats exactly. **The producer must round before binding.** The first state-aware family
  (Stage 3) has to declare precision per metric.
* **A-5 — "Roles collapse to the lowest index" was generalized.** For identical mirror sides,
  collapsing every role to 0 would erase a two-role binding (attacker 0, target 0). Phase 1
  instead chooses the smallest binding over the side swaps that leave the sides unchanged.
* **A-6 — The digest takes `rules_rev` and `derivation_version` as the design lists them.**
  So a rules-data or derivation-version bump moves the digest even when no number moved.
  Per-value store revisions are treated as provenance and excluded, so a store refresh that
  changes no value does not move it.
* **A-7 — Level is structurally a *positive* int, as the design states.** Level 0 is refused as
  shape. Rank 0 is allowed.
* **A-8 — "Duplicate/ambiguous matchup sides".** Identical mirror sides are **valid**, because
  the design makes them representable. What is refused is duplicate keys (rank slots, binding
  keys, derived metrics, step indices), the wrong side count, and bindings that name a side that
  does not exist.

## 10. Deliberately unwired: the next-phase boundary

Unchanged: `FactContext`, `identity_material`, `candidate_key`, `_key_for`, `BANK_LEVELS`,
`projection.MAX_LEVEL`, the generator registry, the publication gate, `resolver.publish`,
`mastery_slice`, `mastery_config`, the Generator Lab, `mastery_artifact`, `CanonicalMasteryState`
and Journeys, Combat Lab and the frontend. No config key, no flag and no migration were added.

**Stage 2 (next, needs its own approval):** the rules authority (from `champion_state` ceiling
tables, the ordinary rank rule plus declared per-champion exceptions, and `InventoryPolicy`);
current-basis resolution; the `SetupSource` protocol with `SourcePolicy` (default none); and the
derivation authority with a declared support manifest. It still has no serving importer. The
isolation test's "no importer" rule should be narrowed at that point to "no serving importer",
deliberately.

**Rollback:** `git revert 88c9f7a0`. Nothing to un-migrate, and no caller exists to break.
