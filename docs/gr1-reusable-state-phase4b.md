# GR1 — Reusable state Phase 4B: the frozen block, made durable

**IMPLEMENTED, COMMITTED, NOT PUSHED. Zero DDL. Nothing a player can reach is wired, and no
production caller writes a block yet.** Phase 4A made the frozen state block *correct* and
*readable*; 4B gives it somewhere to live and proves it survives the trip. No `StateSequence`, no
state source, no `rule.haste_ladder.v1`, no Slice composition change, no Full, no new family, no
Ranked mode, no migration, no frontend change.

| | SHA | Note |
|---|---|---|
| Backend base | `origin/master` **`8227e4a3`** | The IMPLEMENTATION base. `8227e4a3` **is** Phase 4A. |
| Integration base | `origin/master` **`92be472e`** | Master at integration time: one item-runtime commit past `8227e4a3` (`combat_area_membership`, `item_slow_authority` and friends), **zero `mastery/` overlap**. Rebased onto it; the Phase 4B patch is byte-identical before and after. |
| Backend commit | **`dcfe8e2e`** | One commit (pre-rebase `906e72c2`), branch `gr1/setup-state-phase4b`, worktree `~/lcs-wt-gr1-state4b`. **INTEGRATED AND PUSHED to `origin/master`, 2026-09-20.** |
| Comparison base | `~/lcs-wt-gr1-4b-base` @ `8227e4a3` | Clean detached worktree, same symlinked `lol_calc.db`, for the failure-set arm. |
| Docs base | `origin/main` **`84de68ef`** | Fetched at the start of this phase; it is the Phase 4A docs commit. |
| Docs commit | *(this file + the handoff)* | Branch `gr1/reusable-state-phase4b`, worktree `~/mogsy-wt-gr1-state4b`. **PUSHED to `origin/main`, 2026-09-20** (base `84de68ef`, which had not moved, so no docs rebase). |
| Frontend | **none** | No frontend commit. The Lab's response shape did not change, so `masteryStatePreview.json` needs no recapture beyond the Phase 4A note that already covers it. |

### A naming note, so the phase list stays readable

The [Phase 4 design](./gr1-reusable-state-phase4-design.md) §12 sketched **4B** as "the sequence
contract + the first source" and **4C** as "persistence + review + attempt provenance". The owner
sequenced this phase as *persistence only*, explicitly ahead of any sequence work. **This document
is the design's 4C, delivered as 4B**, minus attempt provenance and minus the review wiring — both
deliberately, for reasons stated in §4 and §7. The sequence contract remains unstarted.

**Files: 7 — 3 new, 4 modified, every one inside `mastery/`.** No route, no generator, no Ranked
module, no migration, no frontend.

```
mastery/setup_state/persistence.py               NEW  +290  the typed half of the seam
mastery/serving/state.py                         NEW  +136  the plain half of the seam
mastery/tests/test_setup_state_persistence.py    NEW  +795  63 tests
mastery/setup_state/__init__.py                  +14        exports
mastery/tests/test_gr1_state_aware_lab.py        +103       3 live-path tests
mastery/tests/test_setup_state_isolation.py      ~11         persistence.py declared CONTRACT
mastery/tests/test_setup_state_backwards_compat.py +5        the one new serving file, declared
```

---

## 1. The audit, done against HEAD rather than against the design

Everything below was read at `origin/master` `8227e4a3`, not taken from the design document. The
design's §1 was written at `e9bdf537`; the five answers it gave still hold, and two of them needed
a correction the design could not have made because the constraint it collides with is in a test
file.

### 1.1 What exact private JSON object is persisted today

**One `ranked_rounds` row per SEGMENT**, inserted once by `ranked_public/persistence.py:207`
(`insert_round`) and never updated. `segment_private_json` is written as
`json.dumps(segment_private)` into a column declared `TEXT` by
`migrate_add_ranked_segments.py:71`.

The object itself is built in one place — `ranked_modules/mastery_slice.py:806`,
`generate_segment` — and has exactly three top-level keys:

```
module_id, module_version,
challenges[i] = { challenge_index, answer_type, correct_answer, question_family,
                  answer_options, explanation, [canonical_ref], [champion_subjects] },
mastery_artifact = { … }      ← ONE per segment, built by mastery/serving/artifact.py:build
```

That is the whole write path. There is no second producer.

### 1.2 The safest insertion point for `mastery_state`

**A new top-level key in that object, sibling to `mastery_artifact` and `challenges`** — the
design's §1.4 conclusion, re-verified. Confirmed at HEAD:

* the column is `TEXT`, written at INSERT, and no `UPDATE ranked_rounds SET segment_private_json`
  exists anywhere;
* `ranked_public/projections.py` never reads it — its pre-reveal projection is built purely from
  public columns, and the column's own **name** is in `answer_safety.FORBIDDEN_PRE_REVEAL_KEYS`;
* `mastery/serving/artifact.py:review_view` is a positive allow-list whose docstring already states
  that a new field is invisible until someone adds it on purpose, so a sibling block inherits
  invisibility as the default;
* three absent-means-unknown precedents already live in the same payload (`mastery_artifact`,
  `PAYLOAD_REVEAL_WINDOW_MS`, `PRIVATE_CANONICAL_REF`).

### 1.3 Which review/history code reads that private artifact

Exactly one renderer: `ranked_public/review.py:_mastery_slice_round` (`:444`), reached from
`build_round_review`. It reads `segment_private_json` **only when `revealed`** (`status ==
"resolved"`), takes `correct_answer` and `explanation` per challenge and the redacted
`mastery_artifact` block, and re-resolves nothing.

One more reader exists and is not review: `ranked_public/mastery_preview.py:165`, the admin preview
wrapper, which runs the production generator and shows the `review_view` of the block it *would*
have frozen. It never reads a stored row.

### 1.4 Does any code copy private fields into public/client payloads?

**No, and the mechanism is structural rather than a promise.** The public payload is built
independently in `generate_segment` and projected through `PUBLIC_CHALLENGE_FIELDS`, a 12-entry
positive allow-list. Review takes the private half behind a single `revealed` flag and projects the
artifact block through another positive allow-list. Nothing splats a private dict into a response.

**But the structural guard would not save us if something did.** `answer_safety` matches exact key
names and does **not** carry the bare key `value` — which is what `DerivedValue.to_plain()` emits
its number under. §6 makes this a test rather than a note.

### 1.5 Can this be done with zero DDL / zero migration?

**Yes.** `segment_private_json` is `TEXT` holding arbitrary JSON and the block is an additive key.
Nothing in this phase writes a row at all, so even the write side needs no schema. §11 states the
one hypothetical that would change that.

### 1.6 The constraint the design did not account for

`mastery/tests/test_setup_state_isolation.py` pins a boundary:

```
setup_state  ->  canonical services   ALLOWED
serving      ->  setup_state          FORBIDDEN, one pinned exception
```

with the exception being exactly `routes/admin_mastery_state_lab.py`, enforced by **set equality in
both directions** and declared a second time from the footprint side in
`mastery/tests/facts_support.py:GR1_RUNTIME_FILES`.

`ranked_modules/mastery_slice.py` is a serving module. So the obvious shape — "`generate_segment`
takes a `FrozenStateBundle`" — cannot be written without widening that boundary, for a parameter
nothing would pass. §2 is the shape that does not require it.

---

## 2. The seam, split along the boundary rather than across it

```
mastery/setup_state/persistence.py     TYPED   verify → serialise → parse → verify → project
mastery/serving/state.py               PLAIN   move an already-verified block in and out
```

A caller holding a bundle calls `persistence.private_block(bundle)` — which is where verification
and the fail-closed refusal live — and hands the resulting **plain object** to the serving half.
`mastery/serving/state.py` imports nothing but `__future__` and `typing`: a test asserts that from
its AST, so the isolation boundary is unwidened and `test_exactly_one_named_admin_module_imports_
the_package` still passes with one entry.

Neither half can be skipped to get the other: the serving half refuses anything that is not
structurally a state block, and the only documented producer of that shape is the half that
verifies.

**Why a new file rather than an edit to `mastery/serving/artifact.py`.** `artifact.py` is on every
served segment's write path and every historical review's read path. It is now **byte-identical**
to its state at `8227e4a3`, and deleting `mastery/serving/state.py` restores the previous behaviour
exactly. A new file in a package GR1 already owns also costs no footprint widening — only the
Phase 3 shape guard's named-serving-file list gains one entry.

### 2.1 The API

| | |
|---|---|
| `persistence.private_block(bundle)` | `assert_frozen_bundle` then `to_dict()`. Raises rather than returning an unverified block. |
| `persistence.attach(payload, bundle)` | A **new** dict with the key added. `bundle=None` → a copy with no key. Never mutates its input. |
| `persistence.state_block(payload)` | The raw block, or `None`. |
| `persistence.read_block(block)` | Parse + verify. Raises; never repairs. |
| `persistence.frozen_bundle(payload)` | `read_block` over whatever the payload carries, or `None`. |
| `persistence.state_review_view(bundle)` | The **answer-free** positive-allow-list projection (§6). |
| `serving.state.attach / frozen_state / carries_state / assert_state_block` | The plain half. Structure only. |

`PAYLOAD_KEY` is `"mastery_state"` on both sides, and a test pins the two equal — two spellings of
one key is a corpus nobody can read back.

---

## 3. The write path

`private_block` runs the **whole** Phase 4A verification before it serialises anything: the
semantic key is recomputed from the frozen inputs, every structural invariant is checked, and the
resolved-state digest is reported `unverifiable_by_design` rather than silently passed. Nothing is
re-resolved, nothing is recomputed, and the bundle is not mutated.

**It fails closed, and the reason is that this failure is the one that cannot be repaired later.** A
frozen artifact is never rewritten, so a question stored without the state its answer came from is
unexplainable forever. A caller that explicitly supplied a bundle either gets a payload carrying it
or gets an exception — `attach` has no path that returns a payload with the key silently missing.

**The default path did not move.** `attach(payload, None)` returns a copy with no key added, and a
test asserts `json.dumps(..., sort_keys=True)` byte-equality with the input. An intrinsic artifact
therefore never gains an empty state block, which matters because an **empty** bundle is refused at
construction (Phase 4A) — so "absent" is the only way to say "this was not asked from a state", and
it cannot be confused with anything else.

---

## 4. The read path, and why `review.py` is untouched

`read_block` parses with `frozen_bundle_from_dict` and verifies with `assert_frozen_bundle`. Two
different refusals, both real: a shape this build cannot read raises `TemplateInvalid` (an unknown
**future** version is refused, never parsed on a guess), and a block that parses but does not hold
together raises `StateIntegrityError`.

It **never re-resolves** and **never substitutes live data**. A test makes `sqlite3.connect` raise
and reads a corrupt block through it, so the refusal cannot quietly become a lookup. A second test
asserts the block object is byte-unchanged after a failed read — the reader reports, it does not
repair.

**`ranked_public/review.py` is not modified, and that is a decision rather than an omission.**

* Nothing in production produces a state-bearing segment, so a `mastery_state` key in the review
  response would be `None` on **every row that exists and every row Ranked can currently make**. It
  would be a change to the wire contract the frontend's Mastery renderers are tested against, in
  exchange for a field that is always null.
* Old artifacts already behave correctly: no key, no change, `state_block` answers `None`.
* A test asserts the stronger property directly — `build_round_review` over a resolved row whose
  private payload **does** carry a block emits no `mastery_state`, no `semantic_state_key` and no
  `derived_used`. Question review reconstructs from the challenges independently, exactly as before.

When a phase does serve a state-aware question, wiring review is one call to `state_review_view`
behind the existing `revealed` flag. The projection is written, tested and waiting.

Attempt provenance (`quiz_attempts.provenance_json`) is likewise untouched — the design's §9.5
proposes adding the state key to it for analytics, no consumer has asked for it, and every extra
copy of state material is another surface to prove safe.

---

## 5. Versioning — no new version was created

The stored object **is** the bundle's plain projection, so the version a reader dispatches on is the
bundle's own field. There is no wrapper, and no second number that could disagree with the first.

| block | version | moved this phase? |
|---|---|---|
| `mastery_artifact` | `ARTIFACT_SCHEMA_VERSION = 1` | **no** — a sibling key cannot change what that number means |
| `mastery_state` | `frozen_state_bundle.v1` | no — Phase 4A's value, now written down |
| each state inside | `frozen_state.v2` | no |

**Compatibility rules, exactly:**

1. **Absent** `mastery_state` is valid forever and means "not asked from a state". It is never an
   error, and there is no version at which it becomes one.
2. A reader accepts any bundle version in `KNOWN_BUNDLE_VERSIONS` and any state version in
   `KNOWN_FROZEN_VERSIONS`, which today are `("frozen_state_bundle.v1",)` and
   `("frozen_state.v1", "frozen_state.v2")`.
3. A `frozen_state.v1` state inside a `v1` bundle still reads, and its absent fields come back as
   the absent values they were written as. A test pins this by deleting `resolver_version`,
   `derivation_version`, `warnings` and `display_names` from a real block and reading it.
4. An **unknown future** version — bundle or state — is refused, not parsed. Reading a shape you do
   not know is how a block gets silently reinterpreted.
5. The two versions stay independent. A future bundle-shape change bumps
   `frozen_state_bundle` alone; a state-field change bumps `frozen_state` alone.

---

## 6. Answer safety — the proof, not the promise

**The block contains the answer as a number.** `derived_used` carries
`ability.Q.cooldown.effective = 5.0` under the key `value`. A test asserts this rather than assuming
it, because every claim below is about a block that really does hold the answer.

**The structural guard would not catch it.** A test asserts both halves of the finding:

```python
assert "value" not in FORBIDDEN_PRE_REVEAL_KEYS
assert_pre_reveal_safe(private_block(bundle))     # passes — which is the problem
```

`answer_safety` matches exact key names; `value` is not on the list and cannot be added without
measuring every other payload in the repository first. So the block is safe by **placement** (a
payload that is server-only by construction and whose column name is itself on the denylist) and by
**never being projected whole** — not by the guard.

**`state_review_view` is answer-free by construction.** It is a positive allow-list carrying the
premise, the identities, the provenance versions, the warnings and the metric **names**, and it
deliberately omits `derived_used` and `pair_derived_used`. Four tests:

* the exact key set of the view and of each state inside it is pinned, so a field added to the
  bundle is invisible here until someone adds it on purpose;
* the answer's digits appear nowhere in the serialised view;
* the view passes `assert_pre_reveal_safe`;
* on the **live** path, over real generated artifacts, no key named `derived_used`,
  `pair_derived_used`, `value`, `values` or `derived` exists anywhere in the view, and no answer
  long enough to test for by digits appears in it.

The consequence is stated rather than hidden: without the derived values a historical answer can be
**restated** but not **explained** — "5.0 s" cannot be decomposed into 6.0 × 100/(100+20). That
arithmetic is a reveal-time surface that does not exist yet, and when it does it must read the
frozen block directly behind its own reveal gate, **not** widen this projection.

**The wholesale-copy test.** One public payload and one private payload are built the way a segment
builds them, the state is attached to the private one, and the public one is asserted to carry
neither the key, nor the answer, nor any field name the block owns (`derived_used`,
`semantic_state_key`, `resolved_state_digest`, `frozen_bundle_schema_version`,
`source_provenance`, `data_basis`) — while the private one is asserted to carry all of it, so the
test is about placement rather than about an empty fixture.

**Mutation-checked.** Adding `derived_used` to the projection, or removing either verification call,
turns **11** of the 63 tests red. The negative controls bite.

---

## 7. The first consumer — there isn't one, on purpose

The Generator Lab persists nothing: `mastery/publication_gate/gate.py:publish` contains no `INSERT`,
the Lab builds no segment and writes no round row, and `frozen_state_is_persisted` still reports
`false`. So there was no existing persistence call to attach to, and inventing production serving
just to have one is what §7 of the brief forbids.

What exists instead:

* the seam at the shared artifact/service layer (`mastery/serving/state.py`), where
  `generate_segment` will call it in **one line** beside the `served_artifact.build(...)` it already
  freezes;
* the Lab's **real** generated bundles driven through the exact persistence serializer and
  deserializer by three live tests in `test_gr1_state_aware_lab.py`, including one that writes the
  payload into a real sqlite `TEXT` column and reads it back;
* a test that scans the tracked file list for any production importer of the seam and asserts there
  is none — so "deliberately unwired" is checked rather than claimed.

The Lab's response shape is unchanged. No diagnostics were added: the round trip is a property of
the seam, tests are where it belongs, and the Lab's JSON is a fixture the frontend captures.

---

## 8. Round-trip acceptance

`FrozenStateBundle → private_block → attach → json.dumps → a real TEXT column → json.loads →
state_block → read_block → verify → exact semantic equality`, asserted as `to_dict()` equality of
the whole projection rather than as a spot-check of remembered fields.

| proved | test |
|---|---|
| one-state bundle | `test_a_bundle_survives_the_private_payload_round_trip_exactly` |
| through real sqlite `TEXT` | `test_the_round_trip_goes_through_a_real_text_column` |
| multi-state bundle (k = 2) | `test_a_multi_state_bundle_survives_with_its_order_intact` |
| many questions, one state | `test_many_questions_referencing_one_state_survive_as_one_state` (8 steps) |
| two states with question bindings | `test_two_states_each_keep_their_own_question_binding` |
| display labels | `test_display_labels_survive_so_history_needs_no_fresh_lookup` |
| `derived_used`, and only what was read | `test_derived_used_survives_with_its_values_and_nothing_else` |
| `ScenarioBinding`, including `identity_material()` | `test_the_scenario_binding_survives_as_identity_material` |
| candidate / content identifiers | `test_candidate_and_content_identifiers_survive` |
| concrete data basis, incl. store revisions | `test_the_concrete_data_basis_survives` |
| source provenance | `test_source_provenance_survives` |
| warnings + version metadata | `test_warnings_and_version_metadata_survive` |
| the declared family read-set | `test_the_declared_family_read_set_survives` |
| **no canonical read while deserialising or verifying** | `test_reading_a_persisted_block_touches_no_database` (`sqlite3.connect` raises) |

The multi-state fixture is an **ordered bundle at k = 2**, not a `StateSequence` — the shape Phase 4A
already types, exercised at the arity a later phase will produce. No state source is registered and
none exists.

---

## 9. Backward compatibility

| claim | how |
|---|---|
| missing `mastery_state` accepted | `state_block`/`frozen_bundle` answer `None` for `{}`, a real pre-4B payload, `None`, `[]`, and a key holding a non-mapping |
| existing review/reveal unchanged | `build_round_review` asserted to emit no state key — even for a row that carries a block |
| artifact identity unchanged | `served_artifact()` and `review_view()` byte-identical with and without the sibling key; `artifact_instance_id` is computed over the artifact block's own material, never over the payload around it, so a sibling cannot move it |
| normal Champion Mastery unchanged | no generator, composer, gate, manifest or presentation file was touched |
| normal Matchup Mastery unchanged | same |
| Ranked unchanged | no Ranked module, route, config key, mode or readiness entry was touched |
| current Slice unchanged | `ranked_modules/mastery_slice.py` is byte-identical |

**Does artifact hashing include arbitrary private JSON?** Checked: no. `artifact_instance_id`
digests `("mastery_slice", ARTIFACT_SCHEMA_VERSION, match_id, segment_number, mastery_set_id,
artifact_digest, question_count)` — a closed tuple. Adding a sibling key to the payload cannot
retroactively alter any old artifact's identity semantics.

---

## 10. Failure cases — fail closed, every one

| case | behaviour | test |
|---|---|---|
| bundle that cannot verify, on **write** | refused; nothing stored | `test_a_bundle_that_cannot_verify_is_never_stored` |
| explicit bundle supplied, persistence fails | raises; never a payload without the key | `test_a_caller_that_supplied_a_bundle_never_silently_gets_none` |
| a non-bundle offered to `private_block` | refused, not coerced | `test_a_non_bundle_is_refused_rather_than_coerced` |
| malformed block JSON | `SetupStateError`, the package's own vocabulary | `test_malformed_block_json_is_refused_with_the_package_vocabulary` |
| truncated block (a required field deleted) | refused | `test_a_truncated_block_is_refused` |
| wrong / future **bundle** version | `UNKNOWN_SCHEMA_VERSION` | parametrized |
| wrong / future **state** version | `UNKNOWN_SCHEMA_VERSION` | `test_an_unknown_future_state_version_is_refused_not_guessed` |
| mixed basis, hand-edited onto disk | `BASIS_MISMATCH` **on read**, not merely at construction | `test_a_mixed_basis_block_is_refused_on_read_too` |
| step names a state the block does not have | refused | `test_a_step_naming_a_state_the_block_does_not_have_is_refused` |
| bad step binding (digest disagrees) | `DIGEST_MISMATCH` | `test_a_step_whose_digest_disagrees_with_its_state_is_refused` |
| tampered `semantic_state_key` | `KEY_MISMATCH` — recomputed from the frozen inputs | `test_a_tampered_semantic_key_is_caught_by_verification` |
| tampered premise (level edited) | caught, same mechanism from the other side | `test_a_tampered_premise_is_caught_by_verification` |
| answer metric absent from `derived_used` | refused | `test_an_answer_whose_metric_the_block_does_not_carry_is_refused` |
| bound metric absent from `derived_used` | refused | `test_a_bound_metric_the_block_does_not_carry_is_refused` |
| step names an undeclared family | refused | `test_a_step_naming_an_undeclared_family_is_refused` |
| missing display label for an opaque id | refused | `test_a_missing_display_label_is_refused_on_read` |
| corrupt block + a database | the refusal never becomes a lookup | `test_a_corrupt_block_never_falls_back_to_live_data` |
| any of the above | block object byte-unchanged afterwards | `test_reading_never_repairs` |
| the block copied into a public payload | the test fails | `test_the_block_is_never_copied_into_a_public_payload` |

Nothing re-resolves, nothing substitutes live data, nothing silently drops the block, and nothing
coerces a corrupt structure into a valid one.

---

## 11. No DB migration — the proof

`segment_private_json` is `TEXT` (`migrate_add_ranked_segments.py:71`), written once as
`json.dumps(segment_private)` at INSERT, never rewritten. The block is an additive top-level key in
a document that already carries three, one of which (`mastery_artifact`) was added the same way.
`quiz_attempts.provenance_json` is likewise `TEXT` and is not touched at all this phase.

**Zero DDL, and in fact zero writes**: no code in this commit inserts or updates a row. A test
asserts the contract half of `setup_state` contains no `INSERT INTO`, imports no `sqlite3`, and
names no private-payload column.

The single case that *would* require a migration is unchanged from the design's §9.6 and is not
proposed: state becoming **queryable across rounds** ("every attempt at any Ahri state with ≥ 20
haste"). That would be a read model built *beside* the frozen row, never a replacement for it.

---

## 12. Current serving has not moved

| surface | evidence |
|---|---|
| Champion Mastery — candidate ids, keys, content digests, serving | no generator, gate, manifest, composer or presentation file touched; the full `mastery/tests` failure **set** is byte-identical to the base |
| Matchup Mastery | same |
| Ranked | `ranked_modules/`, `ranked_public/` and `routes/` are byte-identical at this commit |
| Slice | no state-window logic, no `_pattern_group` change, no selection or composition change |
| Generator Lab | the state-aware preview still works — 4 live tests run it against the real database; response shape unchanged; no visual change |

**No existing intrinsic artifact gains `mastery_state`**, because nothing writes one and `attach`
with no bundle adds no key.

### 12.1 Test arms, compared as failure SETS

| Run | Base `8227e4a3` | Branch `906e72c2` |
|---|---|---|
| `mastery/tests` | 5 failed, 2108 passed, 14 skipped | 5 failed, **2179** passed, 14 skipped |
| 6 Ranked-Mastery integration files | 2 failed, 180 passed | 2 failed, 180 passed |
| Guards + isolation + focused, post-commit | — | **288 passed** |

**The failure set is byte-identical**, and all five predate the phase — the same five Phase 4A
recorded:

```
test_audit_db.py::test_pool_and_certified_counts          (audit-DB drift)
test_audit_db.py::test_lux_q_cooldown_conflict_surfaced   (audit-DB drift)
test_audit_db.py::test_json_roundtrips_and_schema         (audit-DB drift)
test_mastery_per_question_reveal.py::test_reveal_needs_no_new_persistence
test_phase4f_ranked_mastery_slice.py::test_format_for_creation_is_unaffected_by_this_module
```

The two integration failures are `test_mastery_ranked_capsule.py`'s pinned capsule ids and digests,
identical on both arms.

**The counts reconcile exactly.** 2108 + 63 (new file) + 3 (new Lab tests) + 5 (new parametrized
isolation cases, because the guard is parametrized over the package's modules and `persistence.py`
is one more) = **2179**. The same arithmetic Phases 1, 3 and 4A each recorded.

**No footprint list moved.** `mastery/setup_state/` and `mastery/serving/` are both already in
`GR1_PACKAGES`. The two guard edits are (a) declaring `persistence.py` in the isolation test's
`CONTRACT_MODULES`, which the pinned-module-set test forces — and which is the point, since it is
what makes "a reader cannot reach a database" mechanically enforced — and (b) naming
`mastery/serving/state.py` in the Phase 3 shape guard's list of serving files a diff may touch.

---

## 13. Read-only real-artifact probe

Twenty champions, three questions each, one state (Q/W/E ranks 4/4/3, level 11, Axiom Arc + Cosmic
Drive), against the real `lol_calc.db` (local patch 26.16). Each bundle was verified, serialised,
written to a real sqlite `TEXT` column, read back, re-verified and compared. **Not committed**, per
the project rule.

```
tested                                   16
refused (fail-closed, unchanged)          4   3 InsufficientQuestions, 1 NormalizationError
payload bytes WITHOUT state        min 173   median 173   max 173
payload bytes WITH state         min 7,464   median 7,476  max 7,489
round-trip mismatches                     0
real verification findings                0
answer leaks into the projection          0
served-artifact block altered             0
```

The four refusals are the known fail-closed set and are unchanged by this phase.

---

## 14. Out of scope — confirmed not done

No `StateSequence`, `StateNode`, `StateWindow`, `StateSequenceSource` or `SequencePolicy` — a test
asserts none of those names exists on the package. No `rule.haste_ladder.v1` and no state source of
any kind; the multi-state fixture is a literal, not a source. No Slice window, no `_pattern_group`
change, no Full. No transitions produced (`FrozenTransition` stays the inert contract Phase 4A
typed; a test asserts a bundle's `transitions` is empty). No new family, no `quiz/family_contract.py`
change. No Matchup state-aware generation, no state-aware Champion Mastery or Ranked exposure, no
`mastery_slice` mode and no config key. No attempt-provenance change. No Combat Lab, no Journey, no
external provider, no historical canonical snapshot. No DDL, no migration, no frontend change. Phase
4C not begun.

---

## 15. Blockers carried forward

1. **Nothing produces a state to persist in Ranked.** The seam is complete on both sides; the caller
   is one line in `generate_segment` and it is deliberately unwritten. *(new shape of the old
   "persistence" blocker — that one is now closed)*
2. **The review projection is written and unwired.** Wiring it is one call behind the existing
   `revealed` flag, and it should not be wired until a segment can actually carry a block.
3. **Reveal wording** — the block carries everything the arithmetic needs (`answer_metric`, the
   bound inputs, both cooldown values) and `state_review_view` deliberately does **not** carry the
   values. A reveal surface that wants to show the arithmetic must read the frozen block behind its
   own gate rather than widen the projection.
4. **D-20** — whether a composer may put a bound `{AH: 0}` and the intrinsic question in one slice.
   Still nobody's decision.
5. **Ranked reachability** — a mode, a config key, a schema branch, a readiness entry, and the owner
   deciding state-aware questions should be served at all.
6. **Where states come from** — every proposed source and the whole sequence model are provisional.
   Nothing was built toward them.
7. **The three-champion normalization gap** (`dr-mundo`, `nunu`, `renata`).
8. **Four champions' undeclared rank-availability rules** (`elise/R`, `jayce/*`, `udyr/*`,
   `yuumi/Q`).
9. **The patch-identity mismatch** — a state's `DataBasisId` and a Mastery artifact's
   `patch_key_digest` are computed over different material and are not interchangeable.

**Rollback:** `git revert dcfe8e2e`. Nothing is persisted, nothing to un-migrate, no production
caller, and the one adjacent consumer is a route behind a flag that is off.
