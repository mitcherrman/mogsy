# GR1 — Reusable state: StateSequence, transitions and StateWindow

**IMPLEMENTED, INTEGRATED AND PUSHED (`origin/master` `6073e035`, 2026-09-20). Pure contract code, zero DDL, zero routes, zero frontend, and
nothing a player can reach.** This phase adds the ordered-state and bounded-window mechanics that a
future Slice and a future Full will both consume. It wires them into nothing: Champion Mastery,
Matchup Mastery, Ranked, the current Slice composition, `_pattern_group`, the Generator Lab's
state-aware cooldown path and the persistence seam are all byte-for-byte unchanged. No production
source exists, `rule.haste_ladder.v1` is not registered, `champion_item_builds.json` is not consumed,
no `mastery_state` is written, no sequence or window is persisted, no question family was added and
Full does not exist.

| | SHA | Note |
|---|---|---|
| Backend base | `origin/master` **`09d58a98`** | Integration base, 2026-09-20. Originally implemented on **`e65ea3a7`**; rebased forward over 5 commits (MRLVL1 Phases 2–3, item strictness), **zero file overlap**. |
| Backend commit | **`6073e035`** | Branch `gr1/reusable-state-sequence-window`, worktree `~/lcs-wt-gr1-seq`. Rebase of `3a202eb9`. **PUSHED to `origin/master` 2026-09-20 — `origin/master` is now `6073e035`.** |
| Comparison base | detached worktree @ **`09d58a98`** | Same symlinked `lol_calc.db`, for the failure-set arm. Re-run at integration; the original arm ran at `e65ea3a7`. |
| Docs base | `origin/main` **`7bc6581b`** | Integration base, 2026-09-20. Originally written on **`2b6d3e91`**; rebased forward over 1 commit (MRLVL1 Phase 3 LVL badge), **zero file overlap**. |
| Docs commit | *(this commit; a commit cannot embed its own SHA — read it with `git log`)* | This file + the handoff. Branch `gr1/reusable-state-sequence-window-docs`, worktree `~/mogsy-wt-gr1-seq`. **PUSHED to `origin/main` 2026-09-20.** |
| Frontend | **none** | No frontend commit, and none was needed — see §8. |

**Files: 9 — 4 new, 5 modified, every one inside `mastery/`.**

```
mastery/setup_state/sequence.py                    NEW  +706  nodes, transitions, the sequence
mastery/setup_state/window.py                      NEW  +323  the window, one selection policy
mastery/setup_state/sequence_source.py             NEW  +196  the source contract, no production source
mastery/tests/test_setup_state_sequence_window.py  NEW  +638  72 tests
mastery/setup_state/__init__.py                    +54        exports
mastery/setup_state/errors.py                      +29        structural refusal codes
mastery/setup_state/resolve.py                     +62        the PREPARED, unwired resolution seam
mastery/tests/test_setup_state_isolation.py        ~11        3 modules declared CONTRACT
mastery/tests/test_setup_state_persistence.py      ~28        one Phase 4B scope guard, narrowed
```

---

## 1. The audit, read at `e65ea3a7`

Not re-derived from the design. What was read, and what it settled:

| Read | What it fixed about this phase |
|---|---|
| `mastery/setup_state/contract.py` (`StateTemplate`, `SideTemplate`, `SharedContextTemplate`, `AXES`, `AxisState`) | A node holds a `StateTemplate` and needs no new template type. The axis vocabulary is already CLOSED and already the right diff vocabulary, so a transition needs no vocabulary of its own. |
| `identity.py` (`semantic_state_key`, `side_setup_material`, `canonicalize_sides`) | The identity *shape* to mirror — and the reason a sequence must not reuse `canonicalize_sides` per node (§3). |
| Phase 4A `FrozenStateArtifact` / `FrozenTransition` / `FrozenStateBundle` | `FrozenTransition` describes two RESOLVED states by bundle index and belongs to the durable artifact. It does not fit a template-level diff, and the brief said not to contort the design to reuse the name. §4. |
| Phase 4B `persistence.py` + `mastery/serving/state.py` | The write/read seam is keyed on a *bundle*, and this phase gives it nothing. The 4B scope guard that asserted "no sequence exists" is the one existing test this phase edits, on purpose. §11. |
| Champion composer (`mastery/synthesis/`), Matchup composer (`mastery/matchup/`), `ranked_modules/mastery_slice.py` and its `_pattern_group` | None of them is touched, and none of them can reach the new code: the isolation guard forbids the direction. §9. |
| Generator Lab state-aware path (`setup_state/lab.py`, `scenario.py`, `routes/admin_mastery_state_lab.py`) | The Lab's route set is pinned by **exact set equality** in `test_gr1_state_aware_lab.py`. That is what decided §8. |
| `manifest` supplied-universe seam (Phase 3 `universe=`) | Already the attach point a later phase needs; nothing about it changes here. |
| `mastery/chains/timeline.py`, `mastery/state/`, `mastery/transitions/` | Historical reference only. `TimelineCheckpoint` holds `questions` beside `champion_level`; that coupling is exactly what this layer must not repeat, and it does not. |
| `mastery/provenance/hashing.py`, `derive.py` seed helpers | `content_hash` / `canonical_json` are the only hashing convention, and the window policy uses them rather than any RNG. |

**Package boundary chosen: the CONTRACT half of `mastery/setup_state/`.** Three new modules, declared
in the isolation guard's `CONTRACT_MODULES`, which mechanically enforces: stdlib + `hashing` imports
only, no `sqlite3` reachable even transitively, no file or environment access, **no game-rule
number** (integer literals restricted to `{0, 1, 2}`; there is not a single float), and no ability
slot letter anywhere in logic. A sequence layer that *could* read data would be able to decide, in
the middle of the contract, what a progression "should" be — and there is no authority for that in
this repository.

---

## 2. StateNode

```
StateNode
  ordinal        : int              0-based, dense within its sequence
  template       : StateTemplate    a REQUEST. Never a ResolvedState.
  phase_label    : str | None       diagnostics only ("first component"), never identity
  provenance     : SequenceProvenance | None    per-node, for a mixed-source run. Never identity.
  semantic_key   : str              DERIVED, verified (see below)
  side_order     : (int, …) | None  the sequence's one permutation; None = the template's own order
```

No generated question, no candidate, no presentation, no resolved value, and no cached derivation.
The one derived field is `semantic_key`, computed once because every consumer needs it — and a caller
that supplies a *different* one is refused with `StateIntegrityError(semantic_state_key_mismatch)`
rather than believed.

`node_semantic_key(template, side_order)` is readable canonical JSON over:

```
{kind, ruleset, sides: [ {champion, …each SPECIFIED axis…} ]}
```

**Excluded:** `template_ref`, `label`, `setup_source`, the basis request, and the ordinal. Included:
every axis the template specifies, with items/runes/shards as **multisets** (caller order is not an
input) while an explicit `ItemEntry.slot` *is*.

Two deliberate decisions:

* **An axis left `None` is omitted, never encoded as null.** "No level asked for" and "level null"
  must not be one node.
* **`setup_source` is provenance.** It names *where* an unspecified axis would be filled from, and
  the package's standing rule (`sources.py`) is that two sources yielding equal inputs give one
  identity. A node is a template, so it has no resolved values to exclude — there are none yet.

---

## 3. StateSequence

```
StateSequence
  nodes                    : (StateNode, …)   ORDERED, dense 0..n-1, at least one
  policy                   : SequencePolicy   (policy_id, version) — WHAT "ordered" means here
  provenance               : SequenceProvenance | None    where the ORDER came from. Never identity.
  label                    : str | None       display only
  transitions              : (StateTransition, …)   DERIVED, one per adjacent pair
  semantic_key             : str               readable identity
  sequence_id              : str               compact digest over the SAME material
  side_order               : (int, …)          the one permutation, derived
  sequence_schema_version  : "state_sequence.v1"
```

Immutable, pure, I/O free. It resolves nothing, generates nothing and is persisted by nothing.

**What it refuses, all structurally:** an empty run (`sequence_empty`), non-dense or unordered
ordinals (`sequence_ordinals`), a node of a different `StateKind` or side count
(`sequence_kind_mismatch`), a node whose champion tuple differs (`sequence_champion_mismatch`), and a
node that asks for a different ruleset or data basis (`sequence_shared_context_mismatch`). The
shared-context check is the analogue of `FrozenStateBundle`'s basis check: one run resolves against
one basis, and that is checked rather than assumed.

**No architectural assumption:** no level cap, no six-item inventory, no fixed node count, no
requirement that adjacent nodes differ at all. Two identical adjacent nodes are legal and produce a
transition that reports `changed_axes == ()`.

**Shared context is a property, not a duplicated field.** Every node's template already carries a
`SharedContextTemplate`; the sequence checks they agree and exposes `sequence.shared`. Likewise
`sequence.champions` is read off node 0 rather than stored as a `subject` — the design sketch's
`subject` field would have been a second source of truth for something the nodes already state.

### 3.1 Side association: one permutation for the whole run

`identity.canonicalize_sides` orders a *single* state's sides by `(champion slug, side setup key)`.
That is right for one state and wrong for a run of them: in a **mirror** matchup the setup key moves
as the run progresses, so a per-node ordering can swap which side is "first" halfway through, and a
transition then reads as *both* champions changing at once.

So a sequence computes **one** permutation — champion slug first, node 0's side setup keys breaking a
mirror tie — and every node, transition and identity uses it. Consequences, each tested:

* `(Ahri, Syndra)` and `(Syndra, Ahri)` are one sequence with one identity;
* a side never re-pairs, and every `SideChange` names its champion explicitly;
* the mirror case `Ahri 1→4→9` vs `Ahri 6` keeps exactly one side moving in each transition.

### 3.2 Identity

```
sequence material    = {policy: {policy_id, version}, nodes: [node_semantic_key, …]}
semantic_key         = "sseq.v1:" + canonical_json(material)      readable
sequence_id          = content_hash(material, prefix="sseq_")     compact — the design's D-N4 digest
```

Two encodings of **one** material, so neither can drift from the other, and a test asserts they agree.
The readable key follows `semantic_state_key`'s precedent (a reader sees which run this is without a
lookup) and grows with the run; `sequence_id` is what other identities reference.

Excluded: source provenance, labels, phase labels, node ordinals as data. Reversing the nodes changes
both. The same ordered nodes built by two different source objects give the same value of both — the
sequence-level statement that sources are replaceable and consumers are source-blind.

---

## 4. The transition model

```
StateTransition
  from_ordinal, to_ordinal : int          always adjacent
  from_node_key, to_node_key : str        the two node semantic keys
  sides                    : (SideChange, …)   ONLY the sides that changed
  reason                   : str | None   provenance only, never identity
  transition_contract      : "state_transition.v1"
  changed_axes             : property — the union, in the closed vocabulary's order
  is_empty                 : property — adjacent nodes requesting the same state
  semantic_key             : content_hash(material, prefix="strans_")

SideChange   { side_index, champion, changes: (AxisChange, …) }
AxisChange   { axis, before, after, absent_before, absent_after }
```

* **Derived by diffing the two node templates, never authored.** A supplied transition set that is
  not the one the nodes produce is refused with `StateIntegrityError(transition_mismatch)` — an
  authored transition beside the states it describes is a second source of truth that can disagree
  with them.
* **The changed dimensions are the existing closed axis vocabulary**: `form`, `position`, `level`,
  `ability_ranks`, `items`, `runes`, `shards`. Role/position and form are therefore covered without a
  special case, items cover components, and a side's changes are reported per side so a matchup diff
  keeps its direction.
* **Absence is explicit.** An axis appearing for the first time carries `absent_before=True` and
  `before=None`: an axis that went from unspecified to level 3 is not an axis that went from zero
  to 3.
* **A champion change is not an axis change** and is refused (`sequence_champion_mismatch`). Within
  one run a side is one champion, which is what keeps every transition attributable.
* **No question text, no answer, no presentation, no combat or in-fight transient state.** This is a
  change of SETUP between two requested states.
* **Identity is semantic to the change** — the two node keys and the per-side deltas — and excludes
  `reason` and the ordinals, so the same change between the same two states is the same change
  wherever in a run it occurs.

### 4.1 Why not `FrozenTransition`

`FrozenTransition` (Phase 4A) indexes into a **frozen bundle** of RESOLVED states and is part of the
durable artifact's shape; its `delta` is `{axis -> [before, after]}` pairs with no side dimension and
no absence marker. A template-level diff needs the side, needs absence, and exists before anything is
resolved. Both types stay: a later phase that freezes a window projects one into the other. For the
same reason the design's reserved `stxn_` prefix — a transition identified by the two *resolved state
digests* it links — is left alone, and the template-level one uses `strans_`.

---

## 5. StateWindow and the selection policy

```
StateWindow
  sequence_id     : str        the sequence this is a region OF
  start, end      : int        INCLUSIVE
  nodes           : (StateNode, …)     contiguous, in sequence order
  transitions     : (StateTransition, …)   only those inside the span
  selection       : WindowSelection
  composition_key : str        DERIVED, verified
  window_schema_version : "state_window.v1"

WindowSelection { policy_id, policy_version, max_nodes, anchor, seed, seed_is_material }
```

The constructor refuses a window that could reference a state its sequence does not have, reorder the
ones it does, or carry a transition outside its span. `explicit_window(sequence, start, end)` and
`select_window(...)` are the two builders; every out-of-range span **fails closed**
(`window_span`, `window_anchor`) rather than clamping, because a caller that asked for states 6..9 of
a five-state run has a bug and a silently truncated window would hide it.

A **one-node window is valid** and carries no transition. A window contains **no question selection
logic**, no candidate, no answer and no question count — a test asserts the projected payload has no
such key.

> The builder is named `explicit_window`, not `window`, because the package `__init__` re-exports this
> module's names and a function called `window` rebinds the `mastery.setup_state.window` **module**
> attribute to itself. That was found by a test, not by reasoning.

### 5.1 `window.contiguous_seeded.v1` — the testing policy, not the product policy

```
select_window(sequence, *, seed, max_nodes, anchor=None) -> StateWindow
```

* `span = min(max_nodes, len(sequence))`, so `max_nodes` greater than the run returns the whole run
  and a one-node run returns its one node.
* **`max_nodes` is a STATE count, never a question count.** How many questions a consumer asks over a
  window is that consumer's policy; a three-state window can serve one question or twenty.
* The start is the seeded offset over **every legal start**, so the policy does not bias to the first
  state — the one property a "take the first N" placeholder would have quietly failed.
* `anchor`, when given, is an ordinal the window must **contain**; the position is still chosen
  among the spans that contain it, so an anchor constrains without pinning to an end.
* Deterministic in `(sequence_id, policy, seed, max_nodes, anchor)` and nothing else: the offset comes
  from `content_hash` of that material, never from a global RNG or a clock.
* Refuses a non-positive or non-integer `max_nodes`, an empty seed and an out-of-range anchor.

**This is not the final Champion Mastery window policy and not the D-20 Slice composition policy.**
Its identity is recorded in every window it builds precisely so a later policy cannot inherit these
windows' identities.

### 5.2 Window identity

```
composition_key = content_hash({window_schema_version, sequence_id, start, end,
                                nodes: [node keys in order],
                                selection: {policy_id, policy_version, [seed]}},
                               prefix="swin_")
```

The seed is in the material **only when the policy declares it material** (`seed_is_material`): for
an explicit span the caller named the span and a seed would be noise. No candidate identity appears,
because **no question exists at this layer** — a window is the states, and what is asked over them is
a later decision with its own identity. The same span under two different policies is deliberately
two compositions.

---

## 6. The source abstraction — contract only

```
StateSequenceSource (typing.Protocol, runtime-checkable)
    describe() -> SequenceSourceDescriptor
    build(request) -> StateSequence

SequenceSourceDescriptor { source_id, source_kind, classification, version, patch_basis,
                           presentation_phrase }
SequenceProvenance       { source_id, source_kind, classification, source_version, patch_basis,
                           observed_at, note }     ← on the sequence, never in an identity
LiteralSequenceSource    the ONLY implementation: it orders exactly what it is handed
SequenceSourceRegistry   register / get / ids
default_sequence_registry() -> EMPTY
```

**`default_sequence_registry()` is empty, and a test pins it empty**, including that asking it for
`rule.haste_ladder.v1` raises `SourceUnavailable`. That is what makes "no production caller can
obtain a sequence by naming a source" a fact about the code rather than a claim in a document.

The honest statement, restated from `sources.py` one level up: **Mogzy has no progression authority.**
Nothing here knows what order a champion "should" level its abilities in or assemble a build in, and
`champion_item_builds.json` does not know it either — it calls itself an editable best-effort
whitelist and timing prior. `presentation_phrase` defaults to "a stated sequence of states"; the
wording policy that forbids "recommended" and "optimal" is inherited.

A source that must **read** canonical data to build its templates does not belong in
`sequence_source.py` — it belongs in the resolution half of the package and hands its templates in.
Keeping this module pure is what stops the sequence contract acquiring a database.

A test builds the same run through `LiteralSequenceSource` and through a second, differently-shaped
source class and asserts one `sequence_id`, different provenance, and that both satisfy the Protocol.

---

## 7. The prepared candidate seam — PREPARED, NOT WIRED

In `resolve.py` (the resolution half, where the connection already lives):

```
NodeResolution { ordinal, node_semantic_key, resolution }   # .state -> ResolvedState
resolve_sequence_node(conn, node, **kwargs)  -> NodeResolution
resolve_window_states(conn, window, **kwargs) -> (NodeResolution, …)  # window order
```

* Each node resolves **independently**, through the existing `resolve_state` with the existing
  arguments. Nothing new resolves anything.
* **Failures identify the node.** A refusal stays the state layer's own exception, with
  `node_ordinal` and `node_semantic_key` added to its context — "this run cannot be resolved" is not
  an answer anyone can act on.
* **No partial result and no silent omission.** The first refusal fails the whole call: a window that
  served seven of its eight states would not be the window whose identity was recorded, and nothing
  downstream could tell.
* **No production caller**, and none is reachable: there is no registered source to obtain a
  sequence from.

This phase stops here. It generates no candidate over a window and composes no question.

---

## 8. Generator Lab validation — backend JSON only, frontend untouched

`window.diagnostic(sequence, seed=…, max_nodes=…, anchor=…)` returns a JSON-serialisable view: the
ordered nodes with their phase labels, every transition with its changed axes, and the selected
window. It reads no database, resolves nothing and stores nothing.

**No HTTP endpoint was added, deliberately.** `test_gr1_state_aware_lab.py` pins the Lab router's
route set by **exact set equality** (`{PREVIEW_URL, FAMILIES_URL}`), and `routes/admin_mastery_state_lab.py`
is the single pinned importer of this package. Adding a third route would have meant widening a
deliberately pinned serving surface — and editing a Phase 3 guard this phase is supposed to leave
unchanged — to expose an inspection a pure function already provides. The brief explicitly allows
stopping at backend diagnostics, so that is where this stops. Wiring `diagnostic()` to a route is a
one-file, one-test change whenever an operator actually wants the button.

No frontend file was touched and no capture needs recapturing.

**Champion-first example, run through the real code** (five literal nodes: Ahri level 1 Q1 → level 5
Q3 W1 E1 + a Lost Chapter component):

```
nodes: 5   transitions: 4
  0->1  ('level', 'ability_ranks')            strans_21c1a4521…
  1->2  ('level', 'ability_ranks')            strans_20f876bf3…
  2->3  ('level', 'ability_ranks')            strans_ade57509c…
  3->4  ('level', 'ability_ranks', 'items')   strans_0b8e1d9bc…
seed=alpha  max_nodes=3 -> nodes 2..4    swin_8fe51ac230823…
seed=gamma  max_nodes=3 -> nodes 1..3    swin_3c6ead05152b3…
anchor=4    max_nodes=3 -> nodes 2..4
provenance: source_id='sequence.literal.v1', classification='literal'
```

Nothing about that example is encoded anywhere: not the skill order, not the item, not the champion.
The source supplies the run; the sequence layer represents it.

**Matchup-future compatibility** is proved structurally, with no Matchup generator wiring: a
three-node run of `Ahri 6 / Syndra 6 → Ahri 7 / Syndra 6 → Ahri 7 + component / Syndra 7 + a
different component` reports one side moving in the first transition and both in the second, each
with its own item, and the sides stay attached to their champions under either caller order.

---

## 9. Isolation and footprint

Dependency direction, unchanged in kind and now covering three more modules:

```
sequence / window / sequence_source   ->   contract, errors, identity helpers, hashing   ALLOWED
serving (Mastery, Matchup, Ranked, Slice, Combat Lab, Journey)  ->  setup_state          FORBIDDEN
tests -> setup_state                                                                    allowed
```

The three new modules are declared in the isolation guard's `CONTRACT_MODULES`, which is what
enforces, mechanically and per module: stdlib + `mastery.provenance.hashing` imports only; no
`sqlite3` in the static closure; no `open`/`exec`/`eval`/`import_module`/`environ`; **integer
literals restricted to `{0, 1, 2}` and no float at all**, so no level cap, inventory size, unlock
level or rank ceiling can hide here; and no `Q`/`W`/`E`/`R` letter in any logic. The pinned
allow-list of importers outside the package is **unchanged at exactly one file**
(`routes/admin_mastery_state_lab.py`), and no new file was added to it.

A test in the new file additionally reads the three modules as committed and asserts they name none
of `mastery_artifact`, `ranked_`, `publication_gate`, `ChampionQuestionCandidate`, `ScenarioBinding`
or `mastery_state`.

---

## 10. Current-behaviour invariance

| Surface | State |
|---|---|
| Champion Mastery | Unchanged. No file touched; the direction guard forbids it reaching this code. |
| Matchup Mastery | Unchanged. Structural compatibility is a test over the contract, not a wire-up. |
| Ranked | Unchanged. No module, no route, no format field, no mode. |
| Current Slice / `_pattern_group` | Unchanged. `ranked_modules/mastery_slice.py` is byte-identical; no window is used. |
| State-aware Generator Lab cooldown family | Unchanged. `lab.py`, `scenario.py` and the route are byte-identical; the Lab's pinned route set is intact. |
| Persistence | No production `mastery_state` writer added, no `StateSequence` or `StateWindow` serialised, no DDL, no migration. `persistence.py` and `mastery/serving/state.py` are byte-identical. |
| Full | Nonexistent. |
| Frontend | Untouched. |

---

## 11. The one existing test this phase edits, and why

`mastery/tests/test_setup_state_persistence.py::test_no_sequence_window_or_source_arrived_with_persistence`
was Phase 4B's scope guard: it asserted that `StateSequence`, `StateNode`, `StateWindow`,
`StateSequenceSource` and `SequencePolicy` **did not exist**, specifically so that the phase which
added them would have to edit it on purpose. This is that phase and this is that edit.

The claim is **narrowed, not dropped**. It is now
`test_the_sequence_layer_arrived_without_reaching_persistence`, and it asserts:

* the five concepts now exist on the package (the phase did what it says);
* `setup_state/persistence.py` names none of them, and no `state_sequence` / `state_window` key
  appears in it;
* the frozen bundle a slice writes still carries **no transition**, and its serialised form contains
  no "sequence" anywhere.

Everything else in that file, including the 4B guard that the contract half executes no SQL statement,
is untouched and still passes over the three new modules.

---

## 12. Tests

Command: `/Users/macmoney/League_Combat_Simulator/.venv/bin/python -m pytest …`, with
`lol_calc.db` symlinked read-only into both worktrees (a fresh worktree otherwise gets an empty stub
database and the data-backed tests error at fixture setup).

**New: `mastery/tests/test_setup_state_sequence_window.py` — 72 tests, all passing.** Covering, in the
brief's order: node identity stability; provenance/label/`template_ref`/`setup_source` exclusion; a
changed level, rank, item, rune, shard, form or position moving the identity; unspecified ≠ null;
multiset items vs explicit slots; ordered-node identity; reversed order differing; the same semantic
run from two source types giving one identity; policy identity in the sequence identity; the empty
run, the one-node run, mixed kind, mixed champion and mixed basis all refused; adjacent nodes that do
not differ; transitions reflecting exactly the changed axes with before/after and absence; a forged
transition refused; transition identity excluding `reason`; matchup sides staying attached including
the mirror case; contiguity, one-node windows, invalid spans failing closed, no reordering, no
question selection; window identity over sequence/span/policy/material seed; determinism per
`(seed, max_nodes)`; different seeds giving different valid windows and never only the first state;
`max_nodes` > size returning the whole run; `max_nodes` as a state count; anchors always inside and
not pinned; the empty default registry; the literal source's provenance; duplicate/unknown source
refusals; the diagnostic view; and the resolution seam resolving each node independently, in order,
and identifying the node that refuses.

**Regression / invariance arm, same command on both worktrees:**

```
mastery/tests           base e65ea3a7:  5 failed, 2179 passed, 14 skipped
                        this phase:     5 failed, 2266 passed, 14 skipped
                        failure SET byte-identical; +87 reconciles exactly
                        (72 new tests + 15 new parametrised isolation cases)
```

**Re-run at integration (rebased onto `origin/master` `09d58a98`, 2026-09-20):**

```
mastery/tests           base 09d58a98:  5 failed, 2179 passed, 14 skipped
                        integrated:     5 failed, 2273 passed,  7 skipped
                        failure SET byte-identical to base:
                          test_audit_db.py::test_pool_and_certified_counts
                          test_audit_db.py::test_lux_q_cooldown_conflict_surfaced
                          test_audit_db.py::test_json_roundtrips_and_schema
                          test_mastery_per_question_reveal.py::test_reveal_needs_no_new_persistence
                          test_phase4f_ranked_mastery_slice.py::test_format_for_creation_is_unaffected_by_this_module
                        all five pre-existing on master; none repaired here.
setup_state focused      471 passed (sequence/window, contract, identity,
                         resolution, isolation, persistence, backwards-compat,
                         legacy-invariance, frozen-bundle)
```

The five pre-existing failures, unrelated and untouched: `test_audit_db.py` ×3 (live-data
assertions), `test_mastery_per_question_reveal.py::test_reveal_needs_no_new_persistence`, and
`test_phase4f_ranked_mastery_slice.py::test_format_for_creation_is_unaffected_by_this_module`.
`test_audit_db::test_pool_and_certified_counts` is data-dependent and flipped between runs on the
BASE arm as well; it is compared as a set member, not as a count.

Ranked / Mastery-slice integration arm (9 files) was run on both worktrees: **identical results**.

---

## 13. What remains deliberately unwired, and the next-phase boundary

Unwired, by instruction:

* no production `StateSequenceSource` registered; `rule.haste_ladder.v1` unregistered;
  `champion_item_builds.json` not consumed as a recommended authority;
* no Slice composition change and no `_pattern_group` change;
* no Full; no question generated over a window; no new question family;
* no `StateSequence` or `StateWindow` persisted; no `mastery_state` written in Ranked; no migration;
* no player-facing state-aware serving; no Combat Lab or Journey change; no frontend.

**The next phase's boundary, exactly.** The seam is now: `StateWindow` → `resolve_window_states` →
*(next phase starts here)* generate the existing state-aware candidates per resolved state → compose.
The next phase is candidate composition over a window, in the Generator Lab only, over the ONE
existing state-aware family and the existing supplied-universe manifest seam. It should decide, and
nothing before it should assume:

1. **How many questions a window yields, and from which of its states.** `max_nodes` is a state count
   on purpose; the question budget is a composition decision that does not exist yet.
2. **Whether a multi-state `FrozenStateBundle` is written**, which is the first thing that would
   produce a non-empty `FrozenTransition` tuple — and therefore the first place the template-level
   transition would be projected into the frozen one.
3. **What the first real source is**, and only then whether a window policy other than
   `window.contiguous_seeded.v1` is needed. A product policy chosen before a real source exists would
   be fitted to a fixture.
