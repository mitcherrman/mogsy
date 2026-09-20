# GR1 — Reusable state: coherent window candidate composition

**IMPLEMENTED AND COMMITTED, NOT PUSHED (2026-09-20). Generator Lab only, no route, nothing
persisted, and nothing a player can reach.** This is the phase the sequence/window record named as
its own boundary: `StateWindow` → `resolve_window_states` → *(starts here)* generate the existing
state-aware candidates per resolved state → compose. It connects those pieces for the first time and
produces the first **multi-state** `FrozenStateBundle`.

It wires nothing new into serving. Champion Mastery, Matchup Mastery, Ranked, the current Slice
composition, `_pattern_group`, the Phase 3 single-state state-aware path and the persistence seam
are all unchanged. **No production sequence source exists** — `default_sequence_registry()` is still
empty, `rule.haste_ladder.v1` is still unregistered, `champion_item_builds.json` is still not
consumed, and every sequence below is a literal a caller handed in. No question family was added,
no `mastery_state` is written, no DDL, no migration, no frontend, and Full does not exist.

| | SHA | Note |
|---|---|---|
| Backend base | `origin/master` **`dd97112b`** | Fetched at the start of this phase. Two item-runtime commits past the sequence/window phase's `6073e035`, **zero `mastery/` overlap**. |
| Backend commit | **`aa9e2ea5`** | One commit, branch `gr1/window-composition`, worktree `~/lcs-wt-gr1-compose`. Authored as `93f3e28f` on `dd97112b`; **rebased onto `origin/master` `21cf0c71` and PUSHED as `aa9e2ea5`** at integration (upstream was two item-runtime commits, **zero file overlap**, rebase clean). |
| Comparison base | `~/lcs-wt-gr1-compose-base` @ **`dd97112b`** | Clean detached worktree, same symlinked `lol_calc.db`, for the failure-set arm. |
| Docs base | `origin/main` **`1b4f60ea`** | Fetched at the start of this phase. |
| Docs commit | *(this commit; a commit cannot embed its own SHA — read it with `git log`)* | This file + the handoff. Branch `gr1/reusable-state-window-composition-docs`, worktree `~/mogsy-wt-gr1-compose`. **NOT PUSHED.** |
| Frontend | **none** | No frontend commit, and none was needed — see §9. |

**Files: 6 — 3 new, 3 modified, every one inside `mastery/setup_state/` or `mastery/tests/`.**

```
mastery/setup_state/composition.py                    NEW  +405  the universe + the policy
mastery/setup_state/window_lab.py                     NEW  +447  the consumer that connects them
mastery/tests/test_gr1_state_window_composition.py    NEW  +640  63 tests
mastery/setup_state/__init__.py                       +32        exports
mastery/setup_state/errors.py                         +19        four structural refusal codes
mastery/tests/test_setup_state_isolation.py           ~20        2 modules declared
```

No route, no generator, no Ranked module, no serving file, no migration. The Phase 3 diff-shape
guard (`test_the_diff_touches_only_the_package_and_the_named_serving_files`) needed no edit.

---

## 1. Preflight, read at `dd97112b`

Not the architecture audit repeated. The narrower question: *where is the narrowest place candidates
from several resolved states can be composed into one set without any existing composer moving?*

| Read | What it settled |
|---|---|
| `sequence.py` / `window.py` | `StateWindow` already carries ordered nodes, the transitions inside its span and a `composition_key` with **no candidate identity in it**. Nothing about the window needed to change; the composition gets its own identity beside it. |
| `resolve.py` `resolve_window_states` | Already resolves in window order, independently, fail-closed on the first refusal with the node named. Consumed as-is; not one line changed. |
| `scenario.py` `generate_cooldown_under_haste` | Takes ONE `ResolvedState` and a `fact_set`. Called per state, unchanged. It already returns `answer_metrics` per candidate, which is why the composer never has to infer which derived value an answer came from. |
| `knowledge/contract.py` `candidate_id()` / `content_digest()` | **`candidate_id()` is already the repository's semantic question identity** — intrinsic fact plus the scenario inputs the answer materially depends on, excluding the answer, the patch and every source revision. So this phase adds **no identity rule**; it collapses on that id and nothing else. §4. |
| `manifest/resolver.py` `CandidateUniverse` (the Phase 3 `universe=` seam) | Already the attach point for rendering. Reused verbatim for the optional render; not widened. |
| `contract.py` `FrozenStateBundle` / `StepBinding` / `FrozenTransition` | The bundle already requires `state_index` dense from 0 and one shared basis, and `StepBinding` already carries `state_index`, `candidate_id`, `content_digest`, `answer_metric` and the binding. **The multi-state bundle needed no type change** — which is what Phase 4A said it was for. §8. |
| `lab.py` (the single-state preview) | The discipline to copy: generate, then hand everything to the production path. Byte-identical; a test still runs it. |
| `test_gr1_state_aware_lab.py` route-set equality; `test_setup_state_isolation.py` one-file allow-list | Both pinned. That is what decided §9: **no endpoint**. |

**Package boundary: the new composer is in the CONTRACT half.** `composition.py` is declared in the
isolation guard's `CONTRACT_MODULES`, which mechanically enforces stdlib + `hashing` imports only,
no `sqlite3` reachable even transitively, no file or environment access, **integer literals
restricted to `{0, 1, 2}` and no float at all**, and no ability-slot letter. Choosing which of some
already-made questions to ask is a shape decision; a composer able to read canonical data would be
able to decide, mid-policy, what a "coherent" set should contain, and there is no authority for that
in this repository. `window_lab.py` is the CONSUMER half, beside `lab.py` and `scenario.py`.

---

## 2. Window → resolved states

`resolve_window_states` unchanged, called from `window_lab.generate_over_window`.

* Nodes resolve **in window order**, each one independently, through the existing `resolve_state`.
* The champion projection is built **once** and handed to every node (a sequence refuses a run whose
  nodes name different champions), which is also what makes each state's
  `ability.<slot>.cooldown.base` and the projected fact the same number by construction.
* **The first refusal fails the whole call**, with `node_ordinal` and `node_semantic_key` added to
  the state layer's own exception. There is no partial window and no silent omission — a test breaks
  node 1 of a three-node run with a non-current item and asserts the refusal names ordinal 1.
* Ordinals and node semantic keys are preserved and carried on every downstream object, so which
  `ResolvedState` belongs to which `StateNode` is read off the structure rather than re-derived.
* A window whose span leaves its sequence still **fails closed** rather than clamping, unchanged.
* A **matchup** window is refused up front with the family's own `state_kind_unsupported`: the one
  state-aware family reads a single-champion setup, and this phase adds no second family.

---

## 3. Per-state candidate generation — the existing family, unchanged

For each resolved state, `scenario.generate_cooldown_under_haste` — champion ability cooldown under
resolved ability haste — then **the same two production filters the single-state Lab applies, in the
same order**: `publication_gate.eligible_candidates`, then
`manifest_session.adapter.dedupe_by_effective_question`. A state-aware candidate reached through a
window has no easier route to publication than one reached directly. `quiz/family_contract.py` is
untouched and no family is unlocked.

Every candidate keeps what a bundle will need: its source state (ordinal + node semantic key), its
`candidate_id` / `content_digest` / `candidate_key`, its `ScenarioBinding`, its `answer_metric` and
its `family_id`. None of that lives in `StateSequence` or `StateWindow`; those two are untouched.

### 3.1 A state that yields nothing is BARREN, and barren is not an error

A window state can resolve perfectly and still have nothing askable — every ability static, no rank
learned, no haste in the build. That is a fact about the state, not a failure of the window, so it is
recorded as a `BarrenState` carrying **the family's own refusal code** (`no_candidate_in_state`,
`required_axis_absent`, `required_metric_unresolved`, `state_kind_unsupported`) and its detail.

The invariant, and a test asserts it directly: **producers ∪ barren == every node of the window, and
the two sets are disjoint.** Nothing disappears silently. A state that cannot be *resolved* is a
different thing and still fails the whole window, naming its node (§2). A window in which *no* state
can be asked anything is refused whole, with `no_candidate_in_window` listing each state's reason.

---

## 4. The multi-state candidate universe

```
StateCandidate
  candidate_id      str        the SEMANTIC question identity
  content_digest    str        identity + answer
  candidate_key     str        the stable total order the production dedupe uses
  subject_ref       str        which ability
  family_id         str
  answer_metric     str        which derived value the answer was read from
  source_ordinals   (int, …)   EVERY window node that produced this question
  primary_ordinal   int        min(source_ordinals) — the PRESENTATION state
  candidate         opaque     the candidate object itself

WindowCandidateUniverse
  entries           ordered by (primary_ordinal, candidate_key)
  window_ordinals   every node the window asked about, in window order
  barren            the states that produced nothing, with their reasons
  universe_key      content_hash of the ordered semantic ids, "suniv_"
```

* **One semantic candidate per question.** Collapse is keyed on `candidate_id()` and on nothing
  else, so this module introduces no identity rule of its own.
* **Provenance is kept BESIDE the identity, never inside it.** `source_ordinals` records every state
  that produced the question, so diagnostics can show that two states agreed — which is the
  interesting fact, and is exactly what the identity is required to hide.
* **`universe_key` excludes provenance**, so two windows offering the same questions have one
  universe. Tested with two different node keys over the same candidates.
* The order is a pure function of the content, so the universe has **no dependence on generation
  order**.
* A candidate that does not publish `candidate_id()`, `content_digest()` and `candidate_key` is
  **refused**, not guessed at.

The shape the brief preferred is the shape that fit: one semantic candidate, metadata recording every
producing state. The existing candidate and composer contracts needed no change to accommodate it.

---

## 5. Duplicate and repeat behaviour — the explicit rule

**Collapse happens if and only if `candidate_id()` is equal.** In this family that resolves to:

| Case | Result | Why |
|---|---|---|
| Ahri W r3 @ 20 haste from `Axiom Arc`, and from `Fiendish Codex + Caulfield's Warhammer` | **ONE** question, `source_ordinals == (0, 1)` | The binding holds the RESOLVED haste, not the items. The two *states* keep different `semantic_state_key`s — a test asserts that, so the collapse is about the question and not about the states being equal. |
| Ahri W r3 @ 20 vs Ahri W r3 @ 40 | **TWO** | Different bound input, different question. |
| Ahri W r2 → r3 → r4 @ 20 | **THREE** | The intrinsic rank is part of the identity. |
| **Ahri Q r3 → r4 → r4 @ 20** (the brief's own example) | **ONE** | Ahri's Q cooldown is **flat**. A rank-invariant cooldown is asked *without* a rank, exactly as the Knowledge Bank collapses one, so all three states produce the same semantic question. The rank moved and the question did not. |
| Same question, two different `content_digest`s | **REFUSED** — `StateIntegrityError(candidate_answer_conflict)` | The identity says one question and the digests say two answers. Whichever was read last would be an arbitrary winner, and the block frozen from it would explain the other one's number. |

Consequences, each tested: no duplicate reaches the composable universe; no duplicate reaches the
selected set; **state coverage never forces a duplicate** (a window whose two states agree on one
question asks it once and represents one state, not two); and state provenance alone never moves a
candidate's identity.

---

## 6. The composition policy — `composition.lab_window_coverage.v1`

**EXPERIMENTAL, Generator Lab only. Not the production Slice policy.** `ranked_modules/mastery_slice.py`
is byte-identical and `_pattern_group` is untouched.

Inputs: the candidate universe, the seed, the question budget. (The window's states arrive *through*
the universe, which carries their ordinals and the barren ones.)

```
1  group candidates by PRESENTATION state (primary_ordinal), in window order
2  order each group: bucket by subject_ref, seed-order the buckets and each
   bucket's contents, then interleave the buckets round-robin
3  select ROUND-ROBIN across the groups, in window order, starting at a
   seeded group offset
4  stop at the budget, or when every group is exhausted
5  sort the selected questions into progression order
```

* **Deterministic.** Every ordering key is a `content_hash` over `(policy, seed, material)`. No
  clock, no process state, no global RNG. Same window, seed and budget → byte-identical set.
* **The budget is independent of the number of states.** It is a plain count; a one-state window and
  a three-state window both return three questions for a budget of three. Tested both ways.
* **It represents the window rather than one node.** Round-robin bounds any state's contribution at
  `ceil(budget / producing_groups)`, so one state cannot monopolise a set when the others have
  questions to offer. Tested at budgets 2–5.
* **Step 2 is the "avoid obvious repetitive variants" rule.** A state offering four questions about
  one ability and one about another does not hand the first four to a budget of four.
* **No semantic duplicates**, because the universe has none.
* **Supply < budget works and invents nothing.** A budget of 99 over a three-question universe
  returns three. There is no filler, no padding and no relaxed duplicate rule to reach a count.
* **A state with few candidates does not stall the others** — the round-robin skips an exhausted
  group and keeps taking from the rest.
* A budget that is not a positive integer count, and an empty seed, are refused
  (`composition_budget`, `composition_seed`).
* The policy id and version are recorded on every set it builds, and the composition identity
  (`scomp_`) is **not** the window identity (`swin_`): the window says which states, the composition
  says which questions over them.

---

## 7. The final ordering rule, exactly

```
sort by (primary_ordinal, family_id, candidate_key)
```

The window state a question belongs to **first**, then a stable deterministic order inside it.

**The seed chooses WHICH questions are asked; it never reorders the progression.** Nothing is
globally randomized after composition. A set whose states interleave unpredictably is not a
progression a reader can follow, and the whole point of composing over a window is that the
progression survives to presentation. Tested across three seeds at full budget.

`primary_ordinal` is the *earliest* window state that produced a question, so a question two states
agree on is presented at the earlier of them — the same deterministic choice the bundle makes when
it binds the step (§8), so the set and the block cannot disagree about which state a question
belongs to.

---

## 8. The first multi-state `FrozenStateBundle`

Built, serialized, deserialized and verified. **Persisted by nothing.**

* **Only the states a selected question actually needs are included.** The flat-Q run has three
  window states, one question and **one** frozen state. Tested.
* Included states keep **window order**, and their `state_index` is remapped **densely from zero**
  — deterministic because the window order is. Window ordinals `0, 2` become bundle indices `0, 1`,
  the same way on every run; the map is returned as `state_index_map` and printed in the diagnostic.
* **`step_index` is the question's position in the composed presentation order**, so a reader of the
  block sees the progression the set was composed in rather than the order a generator emitted.
* Each step binds to the correct state: `state_index`, the state's `resolved_state_digest`, the
  `ScenarioBinding`, the `answer_metric`, the `candidate_id` and the `content_digest` — all
  preserved and all asserted against the composed set.
* `derived_used` is narrowed to **what the selected questions read**: the bound scenario inputs, and
  for each selected question the metrics of the ability it asks about (the effective value the answer
  came from and the base value the arithmetic starts at). Freezing the rest would record numbers no
  selected question read.
* `display_labels` are merged across the included states and refuse a conflicting label for one id;
  every champion slug and item id a frozen state names has a label, so rendering needs no fresh read
  of a `live_only` store.
* Round trip: `bundle → to_dict → json → frozen_bundle_from_dict → verify` is **exactly equal**, and
  a second test runs it through the Phase 4B persistence seam and a real sqlite `TEXT` column.
* **Verification touches no database** — a test makes `sqlite3.connect` raise and then verifies a
  three-state bundle. The only finding is the informational `resolved_state_digest_unverifiable_by_design`.

### 8.1 `FrozenTransition`, populated — but only where it can be honest

Transitions are emitted **only when the included states are contiguous in the sequence and each
change moves one side**. Three refusals to say something the type cannot:

* **Non-contiguous → empty.** A bundle holding window states 1 and 3 has them adjacent *by index*,
  and `FrozenTransition(0, 1)` over that pair would read as one step of a progression while
  describing two. A *partial* tuple would be worse than an empty one, because a reader cannot tell a
  missing transition from an absent change — so it is all or nothing, and the reason is reported in
  `frozen_state_transitions_absent_because`.
* **More than one side → empty.** `FrozenTransition.delta` is `{axis -> [before, after]}` with no
  side dimension, so a matchup diff would lose which champion moved. The template-level
  `StateTransition` keeps the side and remains the lossless representation.
* **Absence** is written as `None`, distinguishable from a value but without the explicit
  `absent_before` / `absent_after` markers the template-level transition carries. A reader needing
  that distinction guaranteed reads the template-level transition.

A contiguous three-state run produces `(0→1)` and `(1→2)` with `changed_axes` and a populated delta;
a single-state bundle produces none and says why. Both are tested.

---

## 9. The Generator Lab — backend JSON only, no endpoint, no frontend

`window_lab.window_diagnostic(conn, window, seed=…, budget=…, render=…)` returns one
JSON-serialisable view: the window, each state (resolved keys, its candidates, its bound values, its
skips, or its barren reason), the deduplicated universe with per-candidate `source_ordinals`, the
composed set with its coverage, the final questions in progression order, the frozen bundle, its
dense index map and its findings.

`literal_window(templates, start=…, end=…)` is the only sequence builder offered: it orders exactly
what it is handed. No registry is consulted and no progression rule is named.

**No HTTP endpoint was added, deliberately** — the same trade the previous phase made and for the
same reason. `test_gr1_state_aware_lab.py` pins the Lab router's route set by **exact set equality**
and `routes/admin_mastery_state_lab.py` is the single pinned importer of this package; widening a
deliberately pinned serving surface to expose an inspection a pure function already provides is the
wrong trade. The brief explicitly allows stopping at backend diagnostics. Wiring `window_diagnostic`
to a route is a one-file, one-test change whenever an operator wants the button.

No frontend file was touched and no capture needs recapturing.

### 9.1 Rendering is OPTIONAL, and here is the finding that made it so

With `render=True` the composed set is drawn by the **production** path: the selected candidates go
to `publication_gate.publish` as a supplied `CandidateUniverse` with the manifest asking for exactly
as many questions as were composed, and the rows come from `mastery_slice._public_challenge` — the
same function a live segment freezes. A composed question the gate does not return is a **refusal**
(`render_incomplete`), never a short set.

**Composition and PUBLICATION are two different policies, and the production one has a diversity
rule of its own.** The `W r2 → r3 → r4` fixture composes three perfectly valid questions that are all
about one ability at three ranks, and the production recipe **refuses to publish that set**, in its
own words:

```
PublicationBlocked: policy gating left the recipe unsatisfied
(request 'recall_ability_cooldown' asked for 3, only 2 available);
refusing to publish a malformed set rather than substitute an ineligible family
```

That refusal is correct and this phase does not route around it. A test asserts it rather than
tidying it away. It is why rendering is optional, and it is the single most useful thing this phase
learned about the eventual Slice policy: **a composition policy that ignores the publication gate's
diversity rule will compose sets that cannot be served.** Step 2 of the policy (spreading a state's
near-identical variants apart before taking any) is a partial answer; it is not a complete one, and
reconciling the two policies is named as a blocker in §13.

---

## 10. The test sequences — literals, not progression definitions

None of these is registered, none is a claim about what a champion "should" do, and
`default_sequence_registry()` is still empty (asserted, including that asking it for
`rule.haste_ladder.v1` raises `SourceUnavailable`).

| | Fixture | What it proves |
|---|---|---|
| **A** | Ahri L9 Q3/W3/E2, `Axiom Arc` — one node | Compatibility with the existing Phase 3 behaviour; a one-state bundle with no transition |
| **B** | W r2 @ L6 → r3 @ L8 → r4 @ L10, `Axiom Arc` | A rank-varying cooldown moving every step: three questions, three states, contiguous transitions |
| **B′** | **Q r3 @ L6 → r4 @ L7 → r4 @ L8** (the brief's example) | Ahri's Q is **flat**: the rank moves, the question does not, and three states collapse to one |
| **C** | W r3 @ L9 from `Axiom Arc`, and from `Fiendish Codex + Caulfield's Warhammer` | The same semantic question from two different setups, both resolving to 20 haste |
| **D** | W r3 @ L9 at 20 haste, and at 40 | Different haste stays two questions |
| **E** | W r3 / **W r0** / Q r3, all `Axiom Arc` | A window one of whose states can be asked nothing — barren, recorded, and a sparse (non-contiguous) bundle |
| **F** | Three states each with Q/W/E at three different hastes | Coverage and monopoly measured rather than inferred: 9 distinct questions, 3 groups of 3 |

Builds are read off `item_canonical` rather than asserted, so a canonical change that moved an item's
ability haste fails loudly here rather than quietly passing.

---

## 11. Tests

Command: `/Users/macmoney/League_Combat_Simulator/.venv/bin/python -m pytest -p no:randomly`, with
`lol_calc.db` symlinked read-only into both worktrees (a fresh worktree otherwise gets an empty stub
database and the data-backed tests error at fixture setup).

**New: `mastery/tests/test_gr1_state_window_composition.py` — 63 tests, all passing.** Covering, in
the brief's order: window order and node attribution; a partial window never returned, with the node
named; an out-of-range span failing closed; a matchup window refused by the family; the existing
family called unchanged per state; every node accounted for as producer or barren; a family refusal
recorded in its own words; a window with nothing askable refused whole; the candidates carrying what
the bundle needs; the five duplicate cases of §5 including the answer conflict; an unreadable
candidate refused; the universe key excluding provenance; determinism; seed sensitivity; budget
bounds; budget > supply; no duplicates; coverage not forcing a duplicate; more than one state
represented; the no-monopoly ceiling; budget independent of state count; a sparse state not stalling
the others; a non-count budget refused; the policy declaring its identity; progression ordering and
its seed-independence; a state outside the window changing nothing; a state inside it changing only
its own questions; one-state and multi-state bundles; step → correct state; a shared question binding
to its presentation state; only required states included; the dense remap; composed step indices;
transitions populated and transitions left empty with a reason; display labels; `derived_used`; the
binding and the digests; serialize → deserialize → verify exact; the Phase 4B seam round trip through
a real `TEXT` column; verification with `sqlite3.connect` made to raise; the diagnostic; the
production render and **the publication-gate refusal of §9.1**; the empty source registry; the
isolation properties of both new modules.

**Regression / invariance arm, same command on both worktrees:**

```
mastery/tests      base dd97112b:  5 failed, 2266 passed, 14 skipped
                   this phase:     5 failed, 2337 passed, 14 skipped   (pre-commit)
                   this phase:     5 failed, 2344 passed,  7 skipped   (post-commit)

failure SET byte-identical to base:
  test_audit_db.py::test_pool_and_certified_counts
  test_audit_db.py::test_lux_q_cooldown_conflict_surfaced
  test_audit_db.py::test_json_roundtrips_and_schema
  test_mastery_per_question_reveal.py::test_reveal_needs_no_new_persistence
  test_phase4f_ranked_mastery_slice.py::test_format_for_creation_is_unaffected_by_this_module
all five pre-existing on master; none repaired here.
```

**The counts reconcile exactly.** 2266 + 63 (new file) + 8 (new parametrised isolation cases,
because the guards are parametrised over the package's modules and there are two more) = **2337**.
The skip count falls from 14 to 7 once the work is committed, for the same mechanical reason every
earlier phase recorded: seven committed-footprint guards skip while nothing is committed and run
once it is. 2337 + 7 = **2344**.

**Focused setup_state arm** (isolation, backwards-compat, the Phase 3 Lab, sequence/window,
persistence, the frozen bundle, and this phase): **431 passed.**

**Ranked / Mastery integration arm** (`test_ranked_mastery_applied_chain`,
`test_ranked_mastery_artifact_persistence`, `test_ranked_mastery_on_demand`,
`test_ranked_mastery_reveal_e2e`, `test_ranked_mastery_reveal_secrecy`,
`test_mastery_ranked_capsule`, `test_mastery_artifact`, `test_mastery_integration`,
`test_ranked_prototype`): **2 failed, 213 passed.** Both failures are
`test_mastery_ranked_capsule.py`'s pinned capsule ids and digests, and both were re-run on a clean
detached worktree at `dd97112b` and fail **identically** there (2 failed, 47 passed).

No frontend test was run, because no frontend file changed.

---

## 12. Current behaviour has not moved

| Surface | State |
|---|---|
| Champion Mastery | Unchanged. No generator, composer, gate, manifest or presentation file touched; the full `mastery/tests` failure SET is byte-identical to base. |
| Matchup Mastery | Unchanged. Same evidence; a matchup window is refused by the family rather than served. |
| Ranked | Unchanged. No Ranked module, route, config key, mode or readiness entry. |
| Current Slice / `_pattern_group` | Unchanged. `ranked_modules/mastery_slice.py` is byte-identical; a test asserts it contains none of `setup_state`, `StateWindow`, `state_aware` or the new policy id, and that `parse_mastery_slice_config({"mode": "state_window"})` raises — so **no saved Ranked format can name this**. |
| Phase 3 single-state path | Unchanged. `lab.py` and `scenario.py` are byte-identical, and a test runs the single-state preview and asserts it still freezes exactly one state with no transition. |
| Existing Generator Lab intrinsic modes | Unchanged. No route, no response shape, no frontend. |
| Lab route set | Unchanged, asserted by exact set equality, and `routes/admin_mastery_state_lab.py` does not name `window_lab`. |
| Persistence | No production `mastery_state` writer, no DDL, no migration. A test scans the tracked file list for any production importer of `mastery.setup_state.window_lab` and asserts there is none. |
| Full | Nonexistent. |
| Frontend | Untouched. |

**Isolation.** The allow-list of importers outside the package is **unchanged at exactly one file**
(`routes/admin_mastery_state_lab.py`). Both new modules are declared in the isolation guard — one in
`CONTRACT_MODULES`, one in `CONSUMER_MODULES` — which is what the pinned-module-set test forces, and
which is the point: `composition.py` provably cannot reach a database, carries no game-rule number
and holds no family id, roster or metric name of its own (asserted over its AST). No guard was
weakened, and `facts_support.GR1_PACKAGES` needed no widening because both packages are already
declared.

---

## 13. What remains deliberately provisional, and the next-phase boundary

Provisional by instruction, and none of it was started:

* **no production `StateSequenceSource`.** `default_sequence_registry()` is empty,
  `rule.haste_ladder.v1` is unregistered, `champion_item_builds.json` is not consumed. Every sequence
  here is a literal fixture.
* **the composition policy is a Lab policy.** `composition.lab_window_coverage.v1` was fitted to
  fixtures, which is exactly why it carries its own id and version. It is not the Slice policy and
  the current Slice composer is untouched.
* **nothing is persisted.** The bundle is built and verified; `generate_segment` is untouched and
  `mastery/setup_state/persistence.py` still has no production caller.
* **no route, no player-facing serving, no `mastery_slice` mode, no second family, no Full, no DDL,
  no frontend.**

Blockers this phase adds or sharpens:

1. **Composition and publication are two policies, and they disagree.** §9.1: a composed set the
   policy considers coherent can be one the production gate refuses to publish. A production Slice
   policy has to satisfy both, and nobody has decided whether the gate's diversity rule should
   constrain composition up front or whether composition should propose and re-propose.
2. **Which state presents a shared question is a deterministic choice, not a product decision.** The
   earliest producer wins. That is defensible and reproducible; whether a *product* wants the
   earliest, the latest, or the one whose premise reads best is unasked.
3. **`FrozenTransition` cannot describe a sparse selection**, so a bundle over non-adjacent states
   carries none (§8.1). If a later phase wants transitions across a gap, the type needs a way to say
   "these two states are not adjacent in their run" — which is a Phase 4A contract change, not a
   composition one.
4. Carried forward unchanged from earlier phases: **D-20** (may a composer put a bound `{AH: 0}` and
   the intrinsic question in one slice); **Ranked reachability**; **the three-champion normalization
   gap** (`dr-mundo`, `nunu`, `renata`); **four champions' undeclared rank-availability rules**
   (`elise/R`, `jayce/*`, `udyr/*`, `yuumi/Q`); **the patch-identity mismatch**; **reveal wording**;
   **family breadth** — one family is a seam, not a product.

**The next phase's boundary, exactly.** The seam is now: a window composes, and the composed set
freezes into a verified multi-state bundle. The next decision is **which of three things comes
first**, and nothing here assumes an answer:

1. **A real state source.** Until one exists, any window policy and any composition policy is fitted
   to a fixture. This is the first thing that would make the previous two phases' machinery
   describe something real.
2. **Persisting a multi-state bundle on a served segment**, which is one line beside the
   `served_artifact.build(...)` that `generate_segment` already freezes — and which must not happen
   before something can actually produce a state-aware segment.
3. **Reconciling the composition policy with the publication gate** (blocker 1), which is the
   prerequisite for a production coherent Slice and is the one thing this phase proved is not
   optional.

**Rollback:** `git revert aa9e2ea5`. Nothing is persisted, nothing to un-migrate, no production
caller, no route, and no frontend.
