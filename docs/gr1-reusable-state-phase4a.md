# GR1 — Reusable state Phase 4A: the frozen block, repaired and readable

**IMPLEMENTED, COMMITTED, NOT PUSHED. Nothing is persisted and nothing a player can reach is
wired.** Phase 4A makes the frozen state block *correct* and *readable* before any later phase
makes it durable. No `mastery_artifact` change, no round row, no review projection, no attempt
provenance, no state-aware question in Ranked, no new family, no Slice or Full change, no
`StateSequence`, no state source, no DDL and no migration. The admin Lab route stays behind
`GR1_STATE_AWARE_LAB_ENABLED`, off by default.

| | SHA | Note |
|---|---|---|
| Backend base | `origin/master` **`d90fd45b`** | Moved two item-runtime commits past the design's `e9bdf537` during the phase (`fe5ad948`→`e9bdf537`→`d90fd45b`). **At integration the commit was rebased onto `origin/master` `91fd0cc5`** — the two commits in between (`1bddaf71` Force of Nature, `91fd0cc5` items docs) touch **zero** files this phase touches, so the diff is byte-identical. `git diff e9bdf537 d90fd45b` touches **no** `mastery/`, `quiz/`, `ranked_*` or `routes/` file, and none of the five shared primitives `derive.py` borrows. |
| Backend commit | **`8227e4a3`** (was `96f16a08` before integration) | One commit, branch `gr1/setup-state-phase4a`, worktree `~/lcs-wt-gr1-state4a`. **INTEGRATED AND PUSHED to `origin/master` 2026-09-20**, rebased unchanged onto `91fd0cc5` (same 10 files, same diff). |
| Comparison base | `~/lcs-wt-gr1-4a-base` @ `d90fd45b` | Clean detached worktree, same symlinked `lol_calc.db`, for the failure-set and byte-identity arms. |
| Docs | `origin/main` **`9469c26a`** (design record `eec4a14c`) | Branch `gr1/reusable-state-phase4-design`, worktree `~/mogsy-wt-gr1-state4-design`, rebased onto `origin/main` `aa62fc22`. **PUSHED to `origin/main` 2026-09-20. Docs-only — there is no Phase 4A frontend runtime commit.** |
| Design | [Phase 4 design](./gr1-reusable-state-phase4-design.md) §12 (Phase 4A) | The owner approved the direction and scoped this phase to: repair `derived_used`, finalize the block including historical display metadata, and test serialization/round-trip. |

**Files: 10 — 2 new, 8 modified, every one inside `mastery/setup_state/` or `mastery/tests/`.**
No serving file, no route, no generator, no frontend, no migration.

```
mastery/setup_state/frozen.py                     NEW  +253  assembly + verification
mastery/tests/test_setup_state_frozen_bundle.py   NEW  +532  41 tests
mastery/setup_state/contract.py                   +520  v2 fields, the bundle, deserializers
mastery/setup_state/lab.py                        ~36   the corrected call + bundle
mastery/setup_state/normalize.py                  ~28   display labels, where the names already are
mastery/setup_state/resolve.py                    ~16   threading them through
mastery/setup_state/scenario.py                   ~33   per-side used_metrics + answer metrics
mastery/setup_state/__init__.py                   ~26   exports
mastery/tests/test_gr1_state_aware_lab.py         +113  7 tests, on the live path
mastery/tests/test_setup_state_isolation.py       ~13   frozen.py declared in the CONTRACT half
```

---

## 1. The defect, and why the fix is not a call site

`lab.py` handed `freeze_resolved_state` a **flat** tuple of metric names. The contract declares
one sequence **per side** and selects with `v.metric in set(used_metrics[i])`. So
`used_metrics[0]` was a metric *string*, `set()` of it a set of single **characters**, and no
metric name was ever a member.

**`derived_used` was empty on every frozen block the code could produce.**

It failed **open**: no exception, an empty block, indistinguishable from "no question read
anything". It was invisible because the Lab's display panel beside it (`state["derived_used"]`)
uses the same tuple *flat*, and was correct — so the panel showed seven values while the block
below it recorded none. And it was untested: the contract tests pass correctly-shaped tuples,
and the Lab test read the display field.

Measured, over the roster, same probe at both SHAs:

| | base `d90fd45b` | branch `96f16a08` |
|---|---|---|
| champions previewable | 162 / 173 | 162 / 173 |
| refusals (fail-closed, unchanged) | 11 | 11 |
| **frozen blocks carrying a derived value** | **0** | **162** |
| derived values frozen roster-wide | 0 | **1,028** |

**The fix is the shape, not the call.** `contract.check_used_metrics` refuses a flat sequence, a
per-side length that disagrees with the state's side count, and (via
`require_declared_metrics`) a declared metric the state does not carry. The wrong shape is now
impossible to pass rather than merely absent from one call site.

The declared-metric refusal is **fail-closed on write** on purpose: a frozen artifact is never
rewritten, so a question frozen without the value its answer came from is unexplainable forever.
That is the one failure that cannot be repaired later.

### 1.1 One design rule did not survive contact with the data

The design proposed `derived_used` = "the transitive closure of `DerivedValue.depends_on` over
the bound and answer metrics". **It is not implementable.** `depends_on` is documented as "input
axes / derived metrics used" and in practice every entry is an *axis*:

```
ability.Q.cooldown.effective   depends_on=('ability_ranks', 'items')
ability_haste.total            depends_on=('items',)
```

`ability.Q.cooldown.effective` does not name `ability.Q.cooldown.base` or
`ability_haste.total`, though it is computed from both. There is no metric→metric graph to close
over. The implemented rule is therefore *the generator's declared set, **validated** to contain
every bound and answer metric* — which `scenario.py` already produced correctly. Recorded so the
next phase does not design against a graph that is not there.

---

## 2. Historical display metadata

A state froze `items: [{"item_id": "4629"}]` and `display_names: ["Ahri"]` — champions only. To
render "with Axiom Arc" a reader had to re-read `item_canonical`, whose own `availability` is
`live_only`, so a renamed or delisted item made a historical state unreadable. That is exactly
the "history re-resolves against current data" failure a frozen artifact exists to prevent.

**`display_labels` is captured at normalization, not at freeze time**, and that placement is the
point: `resolve_item` already returns `canonical_name` beside the id it resolved, so recording it
costs **no extra query** and cannot name a different row than the one that produced the state. A
freeze that looked the name up afterwards would be a second read of a moving store.

Runes and forms are deliberately absent: a resolved rune **is** its canonical name and a resolved
form **is** its canonical label, so an entry for either would map a string to itself.

Labels are display data and never identity — a test asserts that two bundles differing only in a
label share both the `semantic_state_key` and the `resolved_state_digest`. A **conflicting** label
for one id is refused rather than silently resolved, because two sides that disagree about an
item's name mean one of them read a different row.

Roster-wide: **162/162** states label every opaque id they name.

---

## 3. What the block now carries

| Added | Why it could not be left out |
|---|---|
| `display_labels` (bundle) | §2 |
| `resolver_version`, `derivation_version`, `derivation_support` | `resolved_state_digest` deliberately excludes all of it (Phase 2 §11), so the frozen block is the **only** place "which implementation produced this number" survives |
| `warnings` | "This state carried 50 tenacity and no metric read it" is a real audit answer, dropped entirely if not frozen |
| `state_index` | A digest is not an order. Two nodes of a progression can resolve to the same digest when the axis that moved is one no value reads |
| step `family_id` → bundle `families` | The binding says what **was** read; the read-set says what **could** have been. Both are needed to answer "why did changing the level not change this question?" without reading the generator at the version that ran. Hoisted once per family, not repeated per step |
| step `answer_metric` | With the bound inputs and that metric's value, the arithmetic is reconstructible |
| step `candidate_id`, `content_digest` | A served slice keeps only the *projection* of a step, so nothing recorded **which** candidate a question was — and `candidate_id` is the only identity that carries the scenario binding |

`FrozenStateBundle` holds ordered, **self-contained** states plus the step→state map. Each state
keeps its own `data_basis`, `ruleset` and `rules_rev` so one can be lifted out and verified alone
— which is what a review of *one* question does — and the bundle **refuses** a mixed basis,
ruleset or rules revision, so the duplication is checked rather than tolerated.

`FrozenTransition` is typed and **nothing produces one**. It exists so that adding transitions
later does not change the bundle's shape. A test asserts a single-state bundle's `transitions` is
empty.

**Version:** `frozen_state.v2` and `frozen_state_bundle.v1`. A `v1` state still reads — the new
fields come back as the absent values they were written as — and an unknown *future* version is
**refused rather than parsed on a guess**.

---

## 4. Reading it back, and proving it

Until this phase the only deserializer in the package was `StateTemplate`'s, so a frozen block
could be written and never read back — which means nothing could **verify** one. A block nobody
can verify is a claim, not a record.

`frozen_state_from_dict` / `frozen_bundle_from_dict` are the inverse of `to_plain`. A test pins
that the three axis states (`absent_unrequested`, `intrinsic`, a specified value) survive the
round trip distinctly, because collapsing any of them would silently change the state's identity.

`verify_frozen_bundle` **reads nothing but the block** — no database, no store, no registry, no
clock. A test monkeypatches `sqlite3.connect` to raise and runs it. The stores a state was
resolved against are overwritten in place, so a check that consulted them would be asking today's
data whether yesterday's answer was right.

It **reports; it never repairs.** A repaired artifact is indistinguishable from an honest one
forever after.

**What it deliberately does not claim.** `resolved_state_digest` covers *every* derived value the
state carried and the block keeps only the read ones, so it cannot be recomputed here.
`verify_frozen_bundle` reports it as `resolved_state_digest_unverifiable_by_design`, flagged
informational, **once per bundle rather than once per state** — silently returning "verified"
would be a lie a reader could not detect.

`frozen.py` is listed in the isolation guard's **CONTRACT** half, which makes "a verifier cannot
reach a database" mechanically enforced by the static import-closure test rather than intended.

---

## 5. Current behaviour has not moved

### 5.1 Byte-for-byte, across two worktrees

A read-only probe at `d90fd45b` and at `96f16a08` against the same canonical database — 20
champion banks (candidate ids, keys, content digests, identity material, prompt semantics,
bindings), 7 pairs in **both call orders**, and 8 published Champion artifacts with every step's
identity material:

```
two 1,030,247-byte JSON dumps — IDENTICAL (cmp)
```

### 5.2 Test arms, compared as failure SETS

| Run | Base `d90fd45b` | Branch `96f16a08` |
|---|---|---|
| `mastery/tests` (pre-commit) | 5 failed, 2056 passed, 13 skipped | 5 failed, **2109** passed, 13 skipped |
| `mastery/tests` (post-commit) | — | 5 failed, **2116** passed, **6** skipped |
| 3 Ranked-Mastery integration files | 2 failed, 85 passed | 2 failed, 85 passed |
| Footprint guards + isolation, against the real commit | — | **133 passed** |

**The failure set is byte-identical**, and all five predate the phase:

```
test_audit_db.py::test_pool_and_certified_counts          (audit-DB drift)
test_audit_db.py::test_lux_q_cooldown_conflict_surfaced   (audit-DB drift)
test_audit_db.py::test_json_roundtrips_and_schema         (audit-DB drift)
test_mastery_per_question_reveal.py::test_reveal_needs_no_new_persistence
test_phase4f_ranked_mastery_slice.py::test_format_for_creation_is_unaffected_by_this_module
```

The two Ranked-Mastery failures are `test_mastery_ranked_capsule.py`'s pinned capsule ids and
digests, identical on both arms.

**The counts reconcile exactly.** 2056 + 41 (new file) + 7 (new Lab tests) + 5 (new parametrized
isolation cases, because the guard is parametrized over the package's modules and `frozen.py` is
one more) = 2109. Post-commit, +7 passed and −7 skipped are the seven committed-footprint guards
that skip while nothing is committed and run once it is — the same arithmetic Phases 1 and 3 both
recorded.

**No footprint list moved.** `mastery/setup_state/` is already in `GR1_PACKAGES`, so a new module
inside it needs no widening. The one guard edit is declaring `frozen.py` in the isolation test's
`CONTRACT_MODULES`, which the pinned-module-set test forced — deliberately, as designed.

---

## 6. Roster-wide validation

Read-only against the real `lol_calc.db` (local patch 26.16), **not committed** per the project
rule. All 173 identities, one state each (Q/W/E at rank 1, Axiom Arc + Cosmic Drive = 45 AH).

```
roster                                    173
previewable                               162     (11 refuse, fail-closed, unchanged)
  derived_used populated AND agreeing
  with the display panel                  162/162
  every opaque id labelled                162/162
  verifies clean (no real findings)       162/162
  round-trips through JSON exactly        162/162
derived values frozen                     1,028
findings                                  162 informational (the digest note), 0 real

bundle bytes    min 4,833   median 5,762   max 5,798
```

The 11 refusals are the known, unchanged fail-closed set: 8 `no_candidate_in_state` and 3
`unknown_ability_slot` (`dr-mundo`, `nunu`, `renata` — the Phase 2 `db_lookup_name` spelling gap,
still not fixed and still costing coverage rather than correctness).

---

## 7. Out of scope — confirmed not done

No persistence of any kind: `mastery_artifact` is untouched, no round row is written, and
`frozen_state_is_persisted` is still `False`. No review projection, no attempt provenance. No
`StateSequence`, no `StateNode`, no `StateWindow`, no `StateSequenceSource`, no `SequencePolicy`.
**No `rule.haste_ladder.v1`** — the design's proposed first state source remains provisional and
nothing registers it; the haste items in the tests are literal fixtures for isolated testing, not
a source. No Slice window, no `_pattern_group` change, no Full. No new family, no
`quiz/family_contract.py` change. No Matchup state-aware generation. No `mastery_slice` mode, no
config key. No DDL, no migration. No frontend change.

The frontend's `masteryStatePreview.json` fixture is a Phase 3 capture and is **still valid** —
the preview gained keys and lost none — but it is no longer a complete capture. Updating it
belongs with whatever phase next touches the Lab UI.

---

## 8. Blockers carried forward, unchanged

1. **Persistence** — the block is computed, verified and returned; nothing writes it. The design's
   recommended home is a new `mastery_state` key in `segment_private_json`, sibling to
   `mastery_artifact`, never public. Zero DDL. That is Phase 4C.
2. **D-20** — whether a composer may put a bound `{AH: 0}` and the intrinsic question in one
   slice. Still nobody's decision.
3. **Ranked reachability** — a mode, a config key, a schema branch, a readiness entry, and the
   owner deciding state-aware questions should be served at all.
4. **Where states come from** — every proposed source and the whole sequence model are
   provisional. Nothing was built toward them.
5. **The three-champion normalization gap** (`dr-mundo`, `nunu`, `renata`).
6. **Four champions' undeclared rank-availability rules** (`elise/R`, `jayce/*`, `udyr/*`,
   `yuumi/Q`).
7. **The patch-identity mismatch** — a state's `DataBasisId` and a Mastery artifact's
   `patch_key_digest` are computed over different material and are not interchangeable.
8. **Reveal wording** — a served scenario question probably wants the arithmetic shown; the block
   now carries everything needed for it (`answer_metric`, the bound inputs and both cooldown
   values), and nothing renders it.

**Rollback:** `git revert 8227e4a3`. Nothing persisted, nothing to un-migrate, and the one
consumer is a route behind a flag that is off.
