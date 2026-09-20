# GR1 — Reusable state: composition reconciled with the publication gate

**IMPLEMENTED AND COMMITTED, NOT PUSHED (2026-09-20). Generator Lab only, no route, nothing
persisted, and nothing a player can reach.** This is the third of the three things the
window-composition phase named as candidates for the next phase, and the one it said was not
optional: *reconciling the composition policy with the publication gate.*

It wires nothing new into serving. Champion Mastery, Matchup Mastery, Ranked, the current Slice
composition, `_pattern_group`, the Phase 3 single-state state-aware path and the persistence seam
are all unchanged. **The publication gate itself is unchanged, and a test pins its refusal wording
to prove it.** `default_sequence_registry()` is still empty, `rule.haste_ladder.v1` is still
unregistered, no `mastery_state` is written, no DDL, no migration, no frontend, and Full does not
exist.

| | SHA | Note |
|---|---|---|
| Backend base | `origin/master` **`35f11822`** | Implementation base, fetched at the start of this phase. Past the window-composition phase's `aa9e2ea5`, **zero `mastery/setup_state/` overlap**. |
| Backend integration base | `origin/master` **`e886fd5f`** | At integration. One commit landed since (`e886fd5f`, items P8 target-mode shred); **zero file overlap** with this phase, so the branch rebased cleanly and the GR1 files are byte-identical. |
| Backend commit | **`0ce7b531`** | One commit, branch `gr1/gate-aware-composition`, worktree `~/lcs-wt-gr1-gate`. Rebased from `829cdcb7` onto `e886fd5f`. **PUSHED to `origin/master`.** |
| Comparison base | `~/lcs-wt-gr1-gate-base` @ **`35f11822`** | Clean detached worktree, same symlinked `lol_calc.db`, for the failure-set arm. |
| Docs base | `origin/main` **`8a38fcbb`** | Implementation base, fetched at the start of this phase. |
| Docs integration base | `origin/main` **`1f0133f9`** | At integration. Two FUNNEL1B2.6 commits landed since; **zero file overlap**, rebased cleanly. |
| Docs commit | *(this commit; a commit cannot embed its own SHA — read it with `git log`)* | This file + the handoff. Branch `gr1/gate-aware-docs`, worktree `~/mogsy-wt-gr1-gate`. **PUSHED to `origin/main`.** |
| Frontend | **none** | No frontend commit, and none was needed. |

**Files: 8 — 2 new, 6 modified.**

```
mastery/publication_gate/preflight.py              NEW  +395  the reusable constraint seam
mastery/tests/test_gr1_gate_aware_composition.py   NEW  +721  43 tests
mastery/setup_state/composition.py                 +390       the gate-aware policy
mastery/setup_state/window_lab.py                  +189       the oracle, the flow, the diagnostic
mastery/manifest/resolver.py                       +23        ONE public name for an existing rule
mastery/setup_state/errors.py                      +11        two structural refusal codes
mastery/setup_state/__init__.py                    +8         exports
mastery/tests/test_setup_state_backwards_compat.py +7         the new file declared in the shape guard
```

No route, no generator, no Ranked module, no serving file, no migration, no DDL.

---

## 1. The audit: where the production publication rules actually live

The previous phase reported the refusal but not its mechanism. Read at `35f11822`, then reproduced
against the live database rather than inferred:

```
composed: 3
  combat_cooldown:state:Ahri:W:r2:ah20
      eqk: ('atomic_recall', 'Ahri Fox-Fire — ability_cooldown @ 20 ability haste', 'numeric', ())
  combat_cooldown:state:Ahri:W:r3:ah20
      eqk: ('atomic_recall', 'Ahri Fox-Fire — ability_cooldown @ 20 ability haste', 'numeric', ())
  combat_cooldown:state:Ahri:W:r4:ah20
      eqk: ('atomic_recall', 'Ahri Fox-Fire — ability_cooldown @ 20 ability haste',
            'single_choice', ('5', '8', '6', '3'))
dedupe survivors: 2       eligible: 3
request: recall_ability_cooldown ability_cooldown 3
```

**The limiting rule is not a "diversity rule" and it is not in `gate.py`'s own logic.** It is
`require_distinct_effective_question` on the manifest's `RepetitionPolicy`, which `gate_snapshot`
reads and applies through `manifest_session.adapter.dedupe_by_effective_question`. `W r2` and `W r3`
render the **same prompt** — the state-aware prompt names the haste, not the rank — with the same
empty numeric option tuple, so they reach the player as one question and collapse. `W r4` renders as
`single_choice` with options, so it survives. Two candidates survive; the synthesized plan asks for
three; the resolver's `SELECTION_UNDER_FILLED` fires; `gate_snapshot` refuses.

The three authorities, and where each one lives:

| rule | owner | shape |
|---|---|---|
| serving eligibility | `publication_gate.gate.evaluate` → `policy.decide` → `quiz.family_contract` | **unary** — a candidate is servable or is not |
| player-visible uniqueness | `manifest_session.adapter.effective_question_key`, applied only when the recipe's `repetition_policy.require_distinct_effective_question` asks | **pairwise** — at most one of a colliding group |
| request availability | `manifest.resolver`'s matching rule, reported as `SELECTION_UNDER_FILLED` | **set-level** — a function of the whole selection's category composition |

The brief's five audit questions, answered before anything was edited:

1. **Which rules are hard?** All three. Each one can stop a set being served at all.
2. **Which are composition preferences?** None of these. Diversity, coverage and progression are
   the *composition policy's* preferences and do not live in the gate.
3. **Which depend only on candidate metadata?** The first two. Eligibility reads the candidate's
   family and status; uniqueness reads its rendered question. Neither needs a database.
4. **Which need final publication context?** The third. It is a function of the selected set and of
   the recipe the set would be published under, so it cannot be answered per candidate.
5. **Can the composer ask "is this feasible?" without publishing?** Yes — and that is §2. Every
   input is a candidate object the caller already holds, and the recipe is synthesized from those
   candidates by the production synthesiser, which is pure.

**One more finding that made the whole thing tractable.** `_select_for_request`'s pattern-aware walk
documents that *"it never changes the count"* — its deferral queues are drained back into the same
pick list. So `SELECTION_UNDER_FILLED` fires **exactly** when the request's matching pool is shorter
than its count, and availability can be answered by counting a pool rather than by re-running
selection.

---

## 2. The reusable seam — `mastery/publication_gate/preflight.py`

A NEW file **beside** the gate, deliberately not an edit to it. Pure, I/O-free, deterministic, no
hidden globals, no DB write and no artifact.

```
publication_constraints(candidates, *, manifest_for, mode) -> PublicationConstraints
PublicationConstraints.verdict(candidate_ids)              -> FeasibilityVerdict
preflight_selection(selection, *, manifest_for, mode)      -> FeasibilityVerdict   (one-shot)
```

**No gate constant is copied and no rule is restated.** Every rule is evaluated by calling the module
that owns it — `gate.evaluate`, the adapter's `effective_question_key`, and the resolver's matching
rule. The one repository change that made the third possible is a single public name:

```python
# mastery/manifest/resolver.py  — additive, no behaviour change
def candidates_matching(candidates, request) -> Tuple[Candidate, ...]:
    return tuple(c for c in candidates if _matches(c, request))
```

`require_distinct_effective_question` is read off a **real manifest** built by the production
synthesiser, not from a literal here — so the flag the preflight honours is the flag the gate reads.

### 2.1 One recipe builder, two uses

`window_lab.lab_manifest(...)` is the single place the Lab's recipe is built. `_render` publishes
through it and `gate_constraints` preflights against it, so a feasibility answer can never describe a
plan the publication path does not resolve. Everything load-bearing — the selection plan and the
repetition policy — comes from `recipe.synthesize_champion_manifest`; only the id, titles and
metadata are Lab-specific, and none of those reaches selection. A test asserts the production
synthesiser is named exactly once in the file.

### 2.2 Pruning structures, and why the verdict is still the answer

A subset search needs to prune, and a search that prunes on its own idea of the rules is precisely
the drift this seam exists to prevent. So `PublicationConstraints` publishes the two structures the
gate's rules **actually have**, both computed by the authorities above:

* `blocked_ids` — unary, from `gate.evaluate`;
* `exclusion_groups` — pairwise, from `effective_question_key`, and **empty when the recipe does not
  require distinct effective questions** (because then there is no such rule, not because it was
  waived).

The composer may prune on those. It must still put the surviving subset to `verdict()`, which runs
the full arithmetic including the per-request counts no pairwise structure can express. **Pruning is
an optimisation; the verdict is the answer.**

---

## 3. Hard vs soft — drawn by which module a rule lives in

Not by a flag, and not by a list this phase maintains.

**HARD** — everything the preflight reports, each able to stop a set being served:
`policy_ineligible`, `effective_question_collision`, `request_under_filled`,
`nothing_publishable`. A test asserts the set of codes a verdict can carry is exactly these four.

**SOFT** — state coverage, subject/family spread, progression locality, the no-monopoly ceiling.
These live with the composition policy that holds them, never appear in the preflight, and the
preflight has no opinion about which of several feasible sets is nicer.

**No hard production rule was demoted to a Lab preference.** The evidence is that the refusal is
still a refusal: `test_a_monotonous_composed_set_is_refused_by_the_production_gate` (the previous
phase's test, unedited) and this phase's `test_the_known_refusal_case...` both still see the gate
block the same set.

---

## 4. The policy — `composition.lab_window_gate_aware.v1`

**EXPERIMENTAL, Generator Lab only.** A NEW id beside `composition.lab_window_coverage.v1`, not a
revision of it, because the behaviour is materially different in both directions: it will decline a
set the coverage policy returns happily, and it can return a set the coverage policy would never have
chosen. The sets the two build must never be mistaken for one another's.

```
1  order the WHOLE universe by preference_order() — the coverage policy's own
   walk at this seed and budget, continued until every state's queue is empty
2  search that order for the lexicographically earliest combination of
   `budget` entries the oracle calls publishable
3  return it in PROGRESSION order (primary_ordinal, family_id, candidate_key)
4  if none exists: return NO SET, and a report saying why and what was possible
```

**The property step 1 exists for:** the first `budget` entries of `preference_order` *are* the set
the coverage policy would have returned. (`budget` is in the seeded group offset because
`compose_window_questions` puts it there — leaving it out made the two agree at one budget and
silently disagree at every other. That was caught during implementation and is asserted by
`test_the_preference_order_is_the_coverage_policys_own_walk`.) So "prefer the coverage answer and
deviate as little as possible" is the same thing as "take the lexicographically earliest feasible
combination of these ranks".

Consequences, each tested: where the coverage policy's answer is publishable the gate-aware policy
returns **exactly that answer** — gate-awareness does not quietly become a second composition
policy on the sets where both agree; state coverage, semantic dedupe, progression ordering and
seed-independence of the order are all the coverage policy's, unchanged; and the seed still chooses
*which* questions, never their order.

### 4.1 The composer is in the CONTRACT half and stays there

`composition.py` is declared in the isolation guard's `CONTRACT_MODULES`: stdlib plus `hashing`
only, no `sqlite3` reachable even transitively, integer literals restricted to `{0, 1, 2}` and no
float. That is not an obstacle to gate-awareness — it is the design. The composer **cannot import the
gate**, so the consumer half (`window_lab.py`) builds the oracle from the real gate and hands it in.
A test re-asserts the composer names no `mastery.publication_gate`, `mastery.manifest` or
`ranked_modules` import, and the search's node budget lives in `window_lab.SEARCH_NODE_BUDGET`
because the contract half may carry no number of its own.

The oracle contract is three pure members — `blocked_ids`, `exclusion_groups`, `verdict(ids)` — and
`PublicationConstraints` is the only implementation any caller uses.

---

## 5. The search: bounded exhaustive DFS, and its exact guarantee

Choose-or-skip depth-first over the preference order, which visits combinations in lexicographic
order of their rank tuples — so the first leaf reached is `(0, 1, … budget-1)`, and every later leaf
deviates from it later and less. Two prunings, both read off the oracle's declared structures: a
blocked candidate is never taken, and at most one member of an exclusion group is.

**The guarantee:** within the node budget the walk is exhaustive — if a feasible combination of the
requested size exists among the candidates that survive the two structural prunings, it is found.
The prunings cannot hide one, because a set containing a blocked candidate or two members of an
exclusion group is refused by the verdict anyway.

**The bound and its failure semantics:** the node budget counts *verdicts*, is
`SEARCH_NODE_BUDGET = 20000`, and is shared across the whole call including the descending search.
An exhausted search reports `search_exhausted=True` and **never becomes a claim of infeasibility**.
In practice the prunings make the search trivial: every case in the suite resolves in a single
verdict, because the exclusion-group pruning steers away from a collision before a verdict is spent.

A heavyweight optimiser was considered and rejected. It was not needed: realistic Lab windows offer
well under twenty semantic questions, and the DFS is exact at that size with room to spare.

---

## 6. The feasibility result

`CompositionFeasibility`, Lab-only, JSON-serialisable, deterministic:

```
requested_budget          selected_count          publishable
limiting_constraints      (the gate's own words, as dicts)
maximum_feasible_count    naive_publishable       naive_limiting_codes
verdicts_evaluated        search_budget           search_exhausted
universe_size             blocked_candidate_ids   exclusion_groups
unused_candidate_ids      state_coverage          subject_counts   family_counts
```

**`selected_count` is never quietly less than `requested_budget`.** When the full budget is
infeasible the call raises `NoFeasibleComposition` carrying the report, no set is returned at all,
and `maximum_feasible_count` says what the universe could have supported. A caller may then choose to
ask for fewer — and a test proves the reported maximum is not advice but a budget that actually
composes *and publishes*. Nothing is invented, no filler exists, and no rule is relaxed to reach a
count.

The contrast with the coverage policy is deliberate and is the §4 rule of the brief: a budget of 99
over a three-question universe makes the coverage policy return three, and makes the gate-aware
policy refuse and report. A caller that asked for 99 is told 99 is impossible rather than handed
three and left to notice.

---

## 7. The known refusal case, and the feasible-alternative case

**The known case — `SEQ_B` at budget 3 — is genuinely infeasible, and that is the correct answer.**
That window's universe holds exactly three candidates, two of which are one player question. There
is no other three. So:

```
NoFeasibleComposition: no set of 3 question(s) from this window can be published;
the publication gate reports effective_question_collision, request_under_filled
and the largest publishable budget is 2

  effective_question_collision  combat_cooldown:state:Ahri:W:r3:ah20 reaches the player
                                as the same question as combat_cooldown:state:Ahri:W:r2:ah20
  request_under_filled          request 'recall_ability_cooldown' asked for 3, only 2 available
```

The resolver's own sentence, reached through the seam rather than copied. `maximum_feasible_count`
is 2, and budget 2 over the same window composes and renders through the production path.

**The feasible-alternative case needed a fixture where one exists**, so this phase adds one — and
found the seed by running the policy, not by asserting a property:

```
SEQ_ALT = [ L6  Q3 W2 E2  Axiom Arc      # rich: Q and E are flat, so they collapse here
            L8      W3    Axiom Arc      # contributes one W
            L10     W4    Axiom Arc ]    # contributes one W
seed = "eta", budget = 3
```

| | chosen | gate |
|---|---|---|
| `composition.lab_window_coverage.v1` | `W r2`, `W r3`, `W r4` | **refused** — `request_under_filled` |
| `composition.lab_window_gate_aware.v1` | `E flat`, `W r2`, `W r4` | **accepted**, and the production path drew all three |

An independent exhaustive search over the same universe (`itertools.combinations` + the oracle)
agrees with the composer at **every** budget from 1 to the universe size, in both directions — so
the guarantee in §5 is checked against something that is not the composer's own answer.

---

## 8. The final gate remains authoritative

Five tests, each one a different way of saying the composer is not the authority:

* **it is re-judged** — a gate-aware set with `render=True` still goes to
  `publication_gate.publish`, which resolves twice and decides independently;
* **tampering is caught by the gate** — the monotonous `SEQ_B` triple, which the gate-aware policy
  declines to compose, is still refused when handed to the publication path directly;
* **a lying oracle does not make a set servable** — an oracle stubbed to answer "publishable" to
  everything makes the composer return the monotonous triple, and `publish` refuses it anyway. The
  preflight has the same authority as the publication path, never more: a verdict is a *prediction*,
  and publication is what makes it true or false;
* **a gate rule change moves the composer's feasibility in the same commit** — relaxing
  `require_distinct_effective_question` **at its owner** (the recipe's repetition policy, read
  through the same path the gate reads it) turns `SEQ_B` at 3 from infeasible into feasible, with
  nothing in the composer changed. The composer has no copy of the rule to update, which is the
  point;
* **`gate.py` is unchanged** — pinned by a test that asserts its refusal wording and its
  `allow_shortage` parameter are still there, and that it does not name the preflight. Weakening the
  gate to make a composition green is the failure this phase was built to avoid.

---

## 9. The FrozenStateBundle

Built **only** from the final gate-aware selection, and from nothing else.

* Only the states an accepted question needs are included, in window order, densely remapped from
  zero — the previous phase's semantics, unchanged.
* A combination the search tried and discarded leaves no trace: a test asserts the frozen step
  bindings and the rejected candidate ids are disjoint, on a fixture where the search really did have
  alternatives to discard.
* **An infeasible composition builds no bundle at all**, because there is no selection to build one
  from. The refusal is raised before `build_window_bundle` is reached.
* Serialize → deserialize → verify is still exactly equal, and verification still finds only the
  informational `resolved_state_digest_unverifiable_by_design`.
* Nothing is persisted. `mastery/setup_state/persistence.py` still has no production caller.

---

## 10. The Generator Lab diagnostic — no new route

`window_diagnostic(conn, window, seed=…, budget=…, render=…, gate_aware=…)` gains four fields, and
**only when `gate_aware=True`** — the coverage policy's diagnostic is byte-identical to before:

```
gate_aware                 bool
publication_constraints    the gate's constraints over the universe
composition_feasibility    the §6 report for the RETURNED set
naive_composition          what the coverage policy would have chosen, for contrast
```

**No HTTP endpoint was added**, the same trade the previous two phases made and for the same reason:
`test_gr1_state_aware_lab.py` pins the Lab router's route set by exact set equality and
`routes/admin_mastery_state_lab.py` is the single pinned importer of the package. Wiring this to a
route remains a one-file, one-test change whenever an operator wants the button. No frontend file was
touched and no capture needs recapturing.

---

## 11. Tests

Command: `/Users/macmoney/League_Combat_Simulator/.venv/bin/python -m pytest -p no:randomly`, with
`lol_calc.db` symlinked read-only into both worktrees (a fresh worktree otherwise gets an empty stub
database and the data-backed tests error at fixture setup).

**New: `mastery/tests/test_gr1_gate_aware_composition.py` — 43 tests, all passing.** Covering, in
the brief's order: the preflight reading the recipe's own repetition policy; one recipe builder for
preflight and publication; the shared-authority proof; the preflight performing no I/O (with
`sqlite3.connect` made to raise) and being deterministic; every reported constraint being hard; the
composer refusing to run without the gate's constraints; the budget/seed/search-budget refusals; the
known refusal case with the gate's own words and a maximum that really composes; single-state with
enough diversity; single-state impossible budget; the coverage policy composing an unpublishable set
and the gate-aware policy finding the alternative; policy identity; the guarantee checked against an
independent exhaustive search at every budget; multi-state with no feasible full budget; budget >
supply refused rather than trimmed; a barren state; a duplicate-collapsed universe; re-judgement by
the real publication path; tampering refused; a lying oracle refused; progression ordering and its
seed-independence; determinism; seed sensitivity with every choice publishable; gate-awareness
preferring the coverage answer; the preference-order correspondence; state coverage; the bundle from
the accepted selection only, with no bundle when infeasible and no trace of rejected combinations;
the diagnostic's fields, JSON round trip and per-subject/family counts; the default path unchanged;
the Slice composer untouched; `gate.py` pinned; the Lab router pinned; and the empty source registry.

**Regression / invariance arm, same command on both worktrees:**

```
mastery/tests      base 35f11822:  5 failed, 2337 passed, 14 skipped
                   this phase:     5 failed, 2380 passed, 14 skipped   (pre-commit)
                   this phase:     5 failed, 2387 passed,  7 skipped   (post-commit)

failure SET byte-identical to base:
  test_audit_db.py::test_pool_and_certified_counts
  test_audit_db.py::test_lux_q_cooldown_conflict_surfaced
  test_audit_db.py::test_json_roundtrips_and_schema
  test_mastery_per_question_reveal.py::test_reveal_needs_no_new_persistence
  test_phase4f_ranked_mastery_slice.py::test_format_for_creation_is_unaffected_by_this_module
all five pre-existing on master; none repaired here.
```

**The counts reconcile exactly.** 2337 + 43 (the new file) = **2380**, and no isolation case was
added because no module was added to `mastery/setup_state/` — the two new files live in
`mastery/publication_gate/` and `mastery/tests/`. 2380 + 7 = **2387**, the seven committed-footprint
guards that skip while nothing is committed and run once it is, for the same mechanical reason every
earlier phase recorded.

**Focused arm** (`test_setup_state_*`, `test_gr1_*`, `test_manifest_*`, `test_synthesis_*`,
`test_phase4*`, `test_phase5*`): **1 failed, 1251 passed, 4 skipped** — the one failure is
`test_phase4f_ranked_mastery_slice`, in the base failure set above.

**Ranked / Mastery integration arm** (`test_ranked_mastery_applied_chain`,
`test_ranked_mastery_artifact_persistence`, `test_ranked_mastery_on_demand`,
`test_ranked_mastery_reveal_e2e`, `test_ranked_mastery_reveal_secrecy`,
`test_mastery_ranked_capsule`, `test_mastery_artifact`, `test_mastery_integration`,
`test_ranked_prototype`): **2 failed, 213 passed** — identical to the base worktree, both failures
`test_mastery_ranked_capsule`'s pinned capsule ids and digests.

> One transient extra failure was seen on the phase worktree's very first run of the integration arm
> (`test_ranked_mastery_artifact_persistence::test_review_is_unchanged_after_the_canonical_data_moves`).
> It did not reproduce in two consecutive re-runs, nor when the file was run alone, and the worktree's
> first run is the one that creates the scratch migration tables. Recorded rather than dismissed.

**Root-level consumers of the changed modules** (`test_mc1_static_content_retirement`,
`test_ranked_mastery_on_demand`): **62 passed.**

No frontend test was run, because no frontend file changed.

---

## 12. Current behaviour has not moved

| Surface | State |
|---|---|
| Champion Mastery | Unchanged. No generator, composer, gate, manifest or presentation file touched; the full `mastery/tests` failure SET is byte-identical to base. |
| Matchup Mastery | Unchanged. Same evidence; `synthesize_matchup_manifest` and the tie/rank policies are not named by anything here. |
| Ranked | Unchanged. No Ranked module, route, config key, mode or readiness entry. |
| Current Slice / `_pattern_group` | Unchanged. `ranked_modules/mastery_slice.py` is byte-identical; a test asserts it contains none of `setup_state`, `StateWindow`, `state_aware`, `preflight` or either composition policy id, and that `parse_mastery_slice_config({"mode": "state_window"})` raises. |
| The publication gate | **Unchanged.** `gate.py` is byte-identical and pinned by a test. The preflight is a new file beside it. |
| The resolver | One **additive public name** (`candidates_matching`) wrapping the existing private `_matches`. No selection logic moved; `test_manifest_resolver` passes unchanged. |
| Phase 3 single-state path | Unchanged. `lab.py` and `scenario.py` are byte-identical. |
| Window composition (previous phase) | Unchanged. `compose_window_questions` is untouched and is still what `compose_over_window` returns by default; its 63 tests pass unedited. |
| Existing Generator Lab modes | Unchanged. No route, no response shape change on the non-gate-aware path, no frontend. |
| Lab route set | Unchanged, asserted by exact set equality, and `routes/admin_mastery_state_lab.py` names neither `window_lab` nor `gate_aware`. |
| Persistence | No production `mastery_state` writer, no DDL, no migration. |
| Full | Nonexistent. |
| Frontend | Untouched. |

**Isolation.** The allow-list of importers outside the package is **unchanged at exactly one file**
(`routes/admin_mastery_state_lab.py`). No module was added to `mastery/setup_state/`, so the
guard's module lists needed no edit. `composition.py` remains provably unable to reach a database and
still carries no game-rule number, no family id and no ability-slot letter. One deliberate edit to a
guard: `mastery/publication_gate/preflight.py` is declared in the backwards-compat shape guard's
pinned serving-file set, with the reason recorded beside it.

---

## 13. What remains deliberately provisional, and the next-phase boundary

Provisional by instruction, and none of it was started:

* **no production `StateSequenceSource`.** `default_sequence_registry()` is empty,
  `rule.haste_ladder.v1` is unregistered, `champion_item_builds.json` is not consumed. Every
  sequence here is a literal fixture.
* **both composition policies are Lab policies.** `composition.lab_window_gate_aware.v1` was fitted
  to fixtures exactly as the coverage policy was, which is why it carries its own id and version. It
  is not the Slice policy and the current Slice composer is untouched.
* **nothing is persisted, no route, no player-facing serving, no `mastery_slice` mode, no second
  family, no Full, no DDL, no frontend.**

Blockers **closed** by this phase:

1. ~~**Composition and publication are two policies, and they disagree.**~~ **Closed.** They still
   are two policies — deliberately — but composition can now ask publication in advance, through one
   seam that holds no copy of publication's rules, and publication remains the final authority. The
   previous phase's open question ("should the gate's rule constrain composition up front, or should
   composition propose and re-propose?") is answered: **constrain up front, verify at the end.**

Blockers this phase adds or sharpens:

1. **The refusal was never about diversity.** It is `require_distinct_effective_question` colliding
   with a prompt that does not name the ability rank. `W r2` and `W r3` at the same haste are two
   different facts that reach the player as one question. Whether the **prompt** should name the rank
   is a product decision nobody has taken, and taking it would change how many questions a rank
   progression can ask far more than any composition policy can. This is now the largest single lever
   on state-aware slice length, and it is not GR1's to pull alone.
2. **A window budget is a promise the universe may not be able to keep.** The gate-aware policy
   refuses rather than shortens, which is correct for a Lab. A *product* Slice has to decide whether
   a segment asked for 5 and able to publish 3 is a refusal, a 3, or a different window — and that is
   a serving decision, not a composition one.
3. **The search bound is generous but real.** 20000 verdicts is exhaustive for every window shape a
   single state-aware family can produce today. A second state-aware family, or a window over many
   more states, could reach it; the failure is honest (`search_exhausted`, never a false "no"), but
   a larger universe would want a better algorithm than DFS.
4. Carried forward unchanged: **which state presents a shared question** (earliest producer wins —
   deterministic, but unasked as a product question); **`FrozenTransition` cannot describe a sparse
   selection**; **D-20**; **Ranked reachability**; **the three-champion normalization gap**
   (`dr-mundo`, `nunu`, `renata`); **four champions' undeclared rank-availability rules**
   (`elise/R`, `jayce/*`, `udyr/*`, `yuumi/Q`); **the patch-identity mismatch**; **reveal wording**;
   **family breadth** — one family is a seam, not a product.

**The next phase's boundary, exactly.** The seam is now: a window composes a set the publication
gate will accept, or says why it cannot, and the accepted set freezes into a verified multi-state
bundle. Two of the previous phase's three candidates remain, and nothing here assumes which comes
first:

1. **A real state source.** Until one exists, every window policy and every composition policy —
   including this one — is fitted to a fixture. This is still the first thing that would make the
   previous three phases' machinery describe something real, and it is the one that has been open
   longest.
2. **Persisting a multi-state bundle on a served segment**, which is one line beside the
   `served_artifact.build(...)` that `generate_segment` already freezes — and which must not happen
   before something can actually produce a state-aware segment.

**Explicitly NOT the next phase:** choosing a production progression source *and* wiring
player-serving in one go, registering `rule.haste_ladder.v1`, giving `mastery_slice` a
`state_window` mode, adding a second state-aware family, or implementing Full.

**Rollback:** `git revert 0ce7b531`. Nothing is persisted, nothing to un-migrate, no production
caller, no route, and no frontend.
