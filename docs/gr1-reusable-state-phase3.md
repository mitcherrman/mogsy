# GR1 — Reusable state architecture: Phase 3 (the first state-aware question path)

**IMPLEMENTED, COMMITTED, NOT PUSHED. Admin Generator Lab only; nothing a player
can reach is wired.** Phase 3 runs the whole seam for the first time —
`StateTemplate → ResolvedState → state-aware candidates → the EXISTING
composition, publication gate and Mastery presentation → a Generator Lab
preview`. No Champion Mastery, Matchup Mastery, Ranked, composer, Full mode,
slice, Journey or Combat Lab behaviour changed; a byte-for-byte probe over the
generators proves it (§9). No migration, no DDL, no persistence change, no
external provider. Phase 4 not begun.

| | SHA | Note |
|---|---|---|
| Backend base | `origin/master` **`ca3d7333`** | Implemented on `295fd58f`, rebased onto `ca3d7333` (3 upstream item-runtime commits, **zero file overlap**). |
| Backend commit | **`22a1c7d9`** | One commit, branch `gr1/setup-state-phase3`, worktree `~/lcs-wt-gr1-state3`. Pre-rebase SHA was `d2b5ef23`. **PUSHED — `origin/master` is `22a1c7d9`** (integration, 2026-09-19; master had not moved from `ca3d7333`, so no second rebase was needed). |
| Frontend base | `origin/main` **`ce3f49be`** | Implemented on `b901ea0e` (Phase 2's docs commit). At integration upstream had moved **three** RFX1 commits (Ranked asset derivatives and the entry intro) with **zero file overlap**; the branch was rebased onto `ce3f49be`. |
| Frontend commit | **`8f949824`** | One commit, branch `gr1/reusable-state-phase3`, worktree `~/mogsy-wt-gr1-state3`. Pre-rebase SHA was `bd4b78e8`. **PUSHED to `origin/main`.** |
| Docs commit | *this document's own commit* | Same branch, docs + screenshots only. A commit cannot name its own SHA; the final report carries it. |
| Inputs | [design rev 2](./gr1-reusable-state-architecture-design.md) §§8, 15–17 · [Phase 1](./gr1-reusable-state-phase1.md) · [Phase 2](./gr1-reusable-state-phase2.md) §17 · this repo's handoff | |

**Files changed: 14 backend, 8 frontend.** Backend: 4 new modules/tests, 6
modified `mastery/` files, 1 new route, 1 registration line, 3 guard/footprint
updates. Every serving-side edit is additive with a default that leaves every
existing caller byte-identical, and the set is pinned by a test (§9.3).

```
BACKEND
mastery/setup_state/scenario.py             NEW  state-aware candidate generation
mastery/setup_state/lab.py                  NEW  the Generator Lab assembly
routes/admin_mastery_state_lab.py           NEW  THE one admin, flag-gated entry point
mastery/tests/test_gr1_state_aware_lab.py   NEW  59 tests
mastery/manifest/resolver.py                ~118 CandidateUniverse + optional `universe=`
mastery/publication_gate/gate.py            ~27  forwards it to BOTH resolutions
mastery/knowledge/contract.py               ~79  scenario_binding, scenario, one template
mastery/manifest_session/adapter.py         ~48  states the scenario when there is one
mastery/setup_state/__init__.py             ~46  exports
api_server.py                               +7   registers the one router
mastery/tests/{facts_support,test_footprint_guard_split}.py   the declared footprint
mastery/tests/{test_setup_state_isolation,…backwards_compat}.py  the guards, narrowed

FRONTEND
src/pages/admin/ranked/MasteryGeneratorLab.tsx        the second surface
src/lib/admin/rankedFormatApi.ts                      the state-lab client
src/features/mastery/contracts/promptSemantics.ts     scenario + one template
src/features/mastery/interactions/formatPromptSemantics.ts   the sentence
src/lib/admin/__fixtures__/masteryStatePreview.json   a verbatim backend capture
+ the three test files beside them
```

---

## 1. Implementation preflight

Read at `295fd58f`. Not the architecture audit repeated — the narrower
question this phase had to answer: *where is the narrowest place a Lab can
supply a candidate universe without touching normal production generation, and
which existing family can consume a resolved state without any policy being
unlocked?*

### 1.1 What the generation path actually does

```
mastery_slice.generate_segment
  -> synthesis.service.synthesize_champion_mastery
       eligible_champion_pool        identity, preflight, projection, bank,
                                      publication gate, dedupe   <-- a POOL
       recipe.synthesize_champion_manifest(pool, …)              <-- a PLAN
       publication_gate.publish(conn, manifest)
            gate_snapshot -> resolve_with_universe(conn, manifest)  x2
                 _build_universe(conn, manifest)   <-- REBUILDS from the
                                                       manifest's sources
  -> published.artifact.ordered_steps -> _public_challenge -> the wire
```

The blocker Phase 2 named is exactly here and is worse than "the resolver
re-projects": the pool the service computed is **discarded**, and the resolver
rebuilds an ungated one from `manifest.candidate_sources`. For an intrinsic
Champion set that is harmless (the gate re-filters). For a state-aware pool it
is fatal: no manifest source can name a state-aware candidate, so the resolver
would silently substitute the intrinsic bank for the same champion and the
snapshot would name questions the caller never generated.

### 1.2 The narrowest seam, and why it is this one

| Candidate seam | Verdict |
|---|---|
| A new `mastery_slice` mode | **No.** It is a production Ranked module; a stored config could name the mode, and the parser, the schema, the builder catalog and the readiness report would all have to learn about it. The whole safety claim of this phase is that there is *nothing to name*. |
| A second resolver / composer for state-aware candidates | **No.** That is the second question system the workstream exists to prevent. |
| Making `resolve_with_universe` **receive** its universe | **Yes.** One optional keyword on the two entry points, forwarded by the gate. Default `None` reproduces the existing path byte for byte, which a test pins by resolving the same pool both ways (§3). |
| Wiring the Lab into `routes/ranked_public.py` | **No.** That file serves every live Ranked request, and the isolation guard's serving prefix set covers it for good reason. The Lab gets one new route file instead — one deletable file rather than a hole in that one. |

### 1.3 The family, and why it needed nothing new

| Need | What already existed |
|---|---|
| the intrinsic fact | `ChampionFact(M_ABILITY_COOLDOWN, rank)` — certified, and Mastery already publishes it |
| the scenario value | `ability_haste.total`, a Phase 2 derived value summed from `item_canonical` |
| the arithmetic | `calculate_cooldown.haste_to_cooldown_multiplier`, the declared shared primitive, reached **through** the Phase 2 derivation |
| the flat/rank distinction | the published `cooldown_shape` fact the Knowledge Bank already reads |
| the question shape's POLICY | `quiz.family_contract`'s **`combat_cooldown`** — "Cooldown under items", **CERTIFIED**, modes include `MASTERY` |
| the presentation | `CandidateCategory.ABILITY_COOLDOWN` → the existing `presentation_contract` media path |

So: **no family is unlocked, no contract is widened, no policy is routed
around.** A state-aware candidate is put to `publication_gate.policy.decide`
exactly as an intrinsic one is, and it is admitted for the same reason.
`quiz/family_contract.py` is **not modified by this phase.**

Rejected alternative: `ability_cooldown_haste` is the older family with the
same shape, but it is `RETIRED`, so it is not in `SERVEABLE` and the gate
would refuse it — correctly. The converged family is `combat_cooldown`.

---

## 2. Architecture in one page

```
StateTemplate                          (admin-stated axes: champion, ranks, items, level)
   │  resolve_state                    Phase 2, unchanged
   ▼
ResolvedState                          inputs + derived(status) + ONE concrete basis
   │  scenario.generate_cooldown_under_haste
   │      intrinsic fact  +  ScenarioBinding  +  resolved value
   ▼
ChampionQuestionCandidate…             THE SAME TYPE the Knowledge Bank produces
   │  eligible_candidates -> dedupe_by_effective_question      (unchanged)
   │  recipe.synthesize_champion_manifest                      (unchanged)
   │  publish(…, candidate_universe=CandidateUniverse(pool))   (one new keyword)
   │      gate_snapshot -> resolve_with_universe x2 -> adapter -> PublishedArtifact
   ▼
mastery_slice._public_challenge        THE SAME function a live segment freezes
   ▼
Generator Lab                          admin-gated, flag-gated, stores nothing
```

Everything after candidate generation is the production path called with
production arguments. `mastery/setup_state/lab.py` composes no sequence,
dedupes nothing, gates nothing, writes no prompt, builds no option set,
formats no explanation and resolves no media asset.

---

## 3. The resolver / universe seam

`mastery/manifest/resolver.py`:

* `_Universe` becomes public as **`CandidateUniverse`** (the private name stays
  as an alias, because two selection tests construct it).
* `resolve_with_universe(conn, manifest, *, universe=None, …)` and
  `resolve(…)` take it. `None` → `_build_universe(conn, manifest)`, unchanged.
* `_checked_universe` validates a supplied pool against exactly what the
  selection, sequencing and snapshot code reads off a candidate
  (`candidate_id()`, `content_digest()`, `candidate_key`, `category`,
  `difficulty_class`, `interaction_kind`, `redundancy_group`), refuses a
  duplicate id, refuses an empty pool and refuses a non-mapping source
  binding. **Fail closed at the door, not deep inside sequencing.**

`mastery/publication_gate/gate.py`: `gate_snapshot` and `publish` take
`candidate_universe=` and forward it to **both** resolutions. Forwarding only
the playable one would make every decision in the report describe candidates
the playable snapshot never saw.

**Proved, not asserted:**

| Claim | Test |
|---|---|
| Supplying the pool the resolver would have rebuilt gives a byte-identical snapshot — same digest, same seed, same steps, same source bindings | `test_supplying_the_universe_the_resolver_would_have_built_changes_nothing` |
| A supplied pool is what actually gets resolved | `test_a_supplied_universe_is_actually_what_gets_resolved` |
| Five malformed pools refuse | `test_a_malformed_supplied_universe_is_refused_not_resolved`, `…missing_a_read_attribute…` |
| The gate judges the pool it was given | `test_the_gate_judges_the_universe_it_was_given` |
| No existing caller changed | every caller passes `None` by omission; the whole-suite failure set is unmoved (§9) |

What this seam is **not**: it is not `resolver.publish` being split, not a
second resolution path, and not a way to skip the gate. It is one parameter.

---

## 4. The state-aware family

`mastery/setup_state/scenario.py`. One family, declared as data:

```
StateAwareFamily(
  family_id            = "combat_cooldown"          the POLICY authority's own id
  generation_id        = "setup_state_scenario.v1"
  required_axes        = ("ability_ranks",)
  optional_axes        = ("items",)
  bound_metrics        = ("ability_haste.total",)
  answer_metric_template = "ability.{slot}.cooldown.effective"
  binding_precision    = {"ability_haste.total": 0}
)
```

The read-set is the whole contract between a question and a state: an axis or
metric not named here cannot enter the family's identity, and one that *is*
named must resolve or the family refuses. It is why "why did changing the
level not change this question?" is answerable without reading the generator.

**Precision, the blocker Phases 1 and 2 left open.** Phase 1 ambiguity A-4 /
Phase 2 blocker 1: a `ScenarioBinding` keeps integral floats as ints and
everything else exactly, so *the producer must round*, and until one declared
a precision two answer-equivalent states could get two identities.
`binding_precision` is that declaration, applied before the value is bound.

**Deliberately narrower than Phase 2 can derive.** Phase 2 derives a cooldown
at any rank the rules authority admits (Udyr Q rank 6, Karma R rank 4), which
is wider than Mastery's own publication policy. This generator additionally
**requires the projection's own certified fact at that rank** and skips where
there is none — because a published step must carry canonical `fact_refs` (the
artifact contract refuses one that does not), and because a state-aware
question must not become the back door through which Mastery starts asking
about facts its own gate declined. It also cross-checks: if the resolved
`ability.<slot>.cooldown.base` and the projected fact disagree, the candidate
is refused rather than published from whichever was read last.

**Skips are recorded, never silent:**

| Reason | Meaning |
|---|---|
| `ability_not_learned` | rank 0 — nothing rank-dependent to state |
| `state_value_unsupported` | the resolved effective cooldown is not a number (with the Phase 2 reason) |
| `no_projected_fact` | Mastery's projection publishes no certified fact at that rank |
| `fact_disagrees_with_state` | the two authorities disagree |
| **`static_cooldown`** | **ability haste does not reduce this cooldown**, so the bound input never reaches the answer — named with the same word the declared family's own exclusion list uses |

The static-cooldown skip is a finding this phase produced: a roster probe
showed 20 abilities (Amumu W, Jinx Q, Karthus E, Samira R, Singed Q and
others) whose derivation is `static_cooldown.v1`. The question would have been
*correct* and would have taught the wrong thing, and `combat_cooldown`
excludes exactly that case. Honouring a declared family's exclusions is part
of not routing around policy.

**Whole-state refusals** (`ScenarioFamilyError`), distinct from a skip because
they say "not this state" rather than "not this ability":
`state_kind_unsupported` (a matchup state), `required_axis_absent` (no ranks),
`required_metric_unresolved` (haste did not resolve — **never read as zero**),
`no_candidate_in_state`.

---

## 5. Identity

`ChampionQuestionCandidate` gains one optional field, `scenario_binding`,
holding **already-canonical** material — exactly
`ScenarioBinding.identity_material()`. The knowledge layer carries it and
canonicalizes nothing; the state layer produces it and knows nothing about
candidates. Neither imports the other, and a test keeps the one shared key
(`"scenario_binding"`) in lockstep.

`identity_material()` adds that key **only when the binding is non-empty** —
not even `{}` — which is the whole backward-compatibility property. The same
rule for `PromptSemantics.to_dict()`, which matters more than it looks:
`KnowledgeMasteryStep.identity_material()` includes the prompt semantics, so an
unconditional key would have moved every `mastery_set_id` and every
`artifact_digest` Mastery has ever published.

| # | The brief's case | Result |
|---|---|---|
| **A** | same intrinsic fact + empty binding | **unchanged.** Over every candidate the real Ahri bank builds: no key added, and `bind_identity(m, EMPTY) is m` |
| **B** | same intrinsic fact + 20 haste | a new, **deterministic** id. The intrinsic half is identical field for field except `template`, which differs because the sentence must state the scenario |
| **C** | two different builds that both resolve to 20 haste | **one question.** `Axiom Arc` and `Fiendish Codex + Caulfield's Warhammer` give different `semantic_state_key`s and the **same** `candidate_id` and `content_digest`. Roster-wide: **589/589** |
| **D** | 20 vs 40 haste | **different.** Roster-wide: **589/589** |
| **E** | the same state from a manual vs a curated source | **one question.** Same state key, same state digest, same candidate id; only the per-axis `source_id` differs |
| **F** | provenance alone | **no change.** The identity material is structurally provenance-free: its key set is exactly the seven intrinsic keys plus the binding |
| **G** | the state identity rules | still hold **separately**: same request → same key and digest; different items → a different setup even at equal resolved haste; a level is part of the setup; `verify_resolved_state` recomputes both from contents; the basis is concrete and never the alias |

Two more, both load-bearing:

* **a level the answer does not read changes the STATE and not the question** —
  the read-set doing its job;
* **`{ability_haste.total: 0}` is not the intrinsic question** (design D-20).
  Same number, different identity: "read the axis and found zero" and "did not
  read this axis" stay different questions.

---

## 6. Correctness

Cross-checked against **both** authorities and computed by neither:

```
expected = projection fact at the rank  ×  haste_to_cooldown_multiplier(bound haste)
```

| Case | Result |
|---|---|
| 0 haste (no items) | the answer **is** the canonical base cooldown |
| 20 haste, Ahri W r4 | `6.0 × 100/120 = 5.0 s` exactly; the state's `.base` equals the projected fact |
| two builds, same haste | same answer, same identity |
| an item change | the haste moves, the answer moves, and it is below the base |
| a non-current item | `NormalizationError(item_not_current)` — the whole state |
| an illegal rank | `NormalizationError(illegal_rank)` — *"Ahri R rank 2 is not reachable before level 11; the state says level 7"* |
| roster-wide, 4 builds | **2,356 candidates, 0 answer mismatches** |

**The formula is not duplicated**, and that is asserted structurally rather
than by inspection: `test_this_module_does_not_restate_the_cooldown_formula`
parses `scenario.py` and requires that it imports neither `calculate_cooldown`
nor `haste_to_cooldown_multiplier`, calls neither, and contains no `100` and
no float literal. It cannot disagree with the shared primitive because it
cannot compute one.

---

## 7. Fail-closed

| Condition | Result |
|---|---|
| unknown champion | `NormalizationError(unknown_champion)` |
| item unknown or not current | `NormalizationError(item_not_current)` |
| rank illegal, or unavailable at the level | `NormalizationError(illegal_rank)` |
| a champion whose rank-availability rule is undeclared | `NormalizationError(rank_rule_unsupported)` (Phase 2, unchanged) |
| a pinned basis that is not the live one | `HistoricalBasisUnavailable` — **never** served from current data |
| `ability_haste.total` unsupported | `ScenarioFamilyError(required_metric_unresolved)` — **never** read as zero |
| no ability rank stated | `ScenarioFamilyError(required_axis_absent)` — never defaulted |
| a matchup state | `ScenarioFamilyError(state_kind_unsupported)` |
| nothing askable in the state | `ScenarioFamilyError(no_candidate_in_state)` |
| the gate or the dedupe leaves nothing | the same refusal |
| the flag is off | `503 FEATURE_DISABLED`, naming the flag |
| not an admin | `403`, and the response body carries no prompt and no answer |

Each reaches the admin **in the state layer's own words**, re-typed but never
rephrased, so a refusal read in the Lab is the refusal a later serving path
would fail with.

---

## 8. The Generator Lab

One new route module, `routes/admin_mastery_state_lab.py`:

```
GET  /api/ranked/admin/mastery-state-lab/families   the declared read-set + enabled
POST /api/ranked/admin/mastery-state-lab/preview    resolve, generate, compose, show
```

Admin-gated by the shared `routes._auth.require_admin`, and additionally
behind **`GR1_STATE_AWARE_LAB_ENABLED`**, which is **off** unless a deployment
sets it. `families` answers even while disabled, so a client can say "this
deployment does not serve it" instead of showing a button that 503s.

**There is no ability-haste override, and that is the design.** A resolved
state's derived values are recomputed from its inputs, always. A "set the
haste to 20" field would be a derived value with no input behind it: the state
would name items it does not have, the frozen block would record a number
nothing produced, and the first use of it would be a question about a build
that cannot exist. The Lab states haste the way the game does — by naming
items — and shows which items produced the number. A test asserts neither the
request dataclass nor the route model has a haste field.

**What the preview shows.** The state context (inputs, the derived values some
question read with their units and statuses, the concrete `DataBasisId`, the
patch label, the ruleset revision, both identities); the questions, drawn by
`MasterySliceChallengeSurface`, the same component the Ranked arena uses; and
in diagnostics beside them the scenario binding, the family's read-set, the
mastery set id, the template key, the seed, the derived selection salt, what
the generator declined, and the frozen state block. A player-facing card
carries its **premise** (`prompt_semantics.scenario`), never its provenance.

**The frontend holds no rule.** The champion list is the backend catalog's own
`module_config.champion_id` options; slots and items are free text, and an
unknown one is refused by the backend and printed verbatim. `Add` appends an
**empty** row, never a copy of the first — a second ability pre-filled with
the first one's slot would read as though the form had an opinion about which
slots exist.

**Presentation.** One new `PromptTemplate`, `ability_cooldown_under_state`,
phrased by `formatPromptSemantics.ts` — the one place an atomic-recall
sentence is written. One template covers both shapes, exactly as
`champion_stat_at_level` covers a null level: *"At rank 4 with 20 Ability
Haste, …"* when the state binds a rank, *"With 20 Ability Haste, …"* when the
cooldown is rank-invariant and the backend collapsed it the way the Knowledge
Bank collapses a flat one.

---

## 9. Current behaviour has not moved

### 9.1 Byte-for-byte, across two worktrees

A read-only probe dumping everything Phase 3 promised not to move, run in a
clean worktree at the base and in the Phase 3 worktree, against the same
canonical database:

```
20 champion banks          887 candidates   id, key, content_digest,
                                            identity_material, prompt_semantics,
                                            rendered prompt + explanation +
                                            options, effective_question_key
7 pairs, both call orders  303 comparisons  the same, plus reversal
8 published Champion artifacts              mastery_set_id, artifact_digest,
4 published Matchup artifacts               every step's identity_material
16 mastery_slice payloads                   preview + coverage, all three
                                            production generators, seeded and not

RESULT: the two 1,720,329-byte JSON dumps are IDENTICAL (cmp).
```

That covers candidate counts, candidate ids, candidate keys, content digests,
matchup pair-order symmetry, published artifact identity, and the Generator
Lab's existing Champion / Matchup / Applied-chain modes.

### 9.2 And structurally, in committed tests

* no intrinsic candidate carries a binding, in **either** generator;
* an intrinsic `PromptSemantics.to_dict()` is byte-identical to a literal;
* an intrinsic rendered prompt and explanation gained **no word** —
  `_scenario_clause` returns `""`, and no `" @ "` or `" at "` appears;
* `mastery_slice` has **no** state-aware mode: its mode set is exactly
  `{champion, matchup, applied_chain}`, the module source does not contain the
  string `setup_state`, and `parse_mastery_slice_config({"mode": "state_aware"})`
  raises — so **no saved Ranked format can name one**;
* the intrinsic admin preview is untouched, and a state-aware preview is a
  separate call an admin has to choose;
* on the frontend: switching surfaces leaves the production one exactly as it
  was, and the state-aware path issues no request until it is chosen.

### 9.3 The guards, narrowed deliberately rather than dropped

Phase 2 kept the stronger claim — *nothing outside the package and its tests
imports it at all* — explicitly so the first wire-up would have to edit that
file on purpose. Phase 3 is that wire-up, and this is that edit:

| Before | After |
|---|---|
| `test_no_production_module_imports_the_package_at_all` | `test_exactly_one_named_admin_module_imports_the_package` — a pinned allow-list of **one** file, by exact set equality in both directions |
| — | `test_the_allowed_importer_is_declared_by_the_repository_too` — the same one file named in `facts_support.GR1_RUNTIME_FILES`, and asserted to really be under a serving prefix |
| — | `test_the_allowed_importer_is_admin_and_flag_gated` — read statically off the file, and it must not be where the question is *built* |
| `test_no_serving_module_imports_the_package` | unchanged, minus that one excused path |
| the text scan | now runs over **prose-free** source: comments and docstrings are blanked, so a module can say which package produced the material it carries without being read as depending on it, while `importlib.import_module("mastery.setup_state")` is still caught. Four negative controls, including a trailing `# noqa` that must not swallow its own import line |
| `test_the_diff_adds_no_serving_file` | `test_the_diff_touches_only_the_package_and_the_named_serving_files` — six named files, each with the reason it is there, each additive with a byte-identical default, and each asserted to belong to a declared footprint |
| the game-rule-number rule | **widened** to the new consumer modules as well |
| the pinned module set | grows by the two new modules |

`routes/admin_mastery_state_lab.py` is added to `GR1_RUNTIME_FILES` and to the
pinned set in `test_footprint_guard_split.py`. `api_server.py` is already in
the declared footprint (the Ranked Builder's), so the registration needed no
widening.

---

## 10. Test results

Run with `~/League_Combat_Simulator/.venv/bin/python -m pytest -p no:randomly`
in `~/lcs-wt-gr1-state3`, `lol_calc.db` symlinked (gitignored, read-only).

| Run | Result |
|---|---|
| New `test_gr1_state_aware_lab.py` | **59 passed** |
| Reworked `test_setup_state_isolation.py` | **68 passed** (was 64) |
| `test_setup_state_backwards_compat.py` | **25 passed** (was 24) |
| `mastery/tests` + Phase 5 Lab + artifact persistence + applied chain, **at the base `ca3d7333`** | 5 failed, 2068 passed, 14 skipped |
| The same four targets **at `22a1c7d9`** | 5 failed, **2146 passed**, 7 skipped |

**The failure set is identical**, and every one of the five predates the phase:

```
test_audit_db.py::test_pool_and_certified_counts              (audit-DB drift)
test_audit_db.py::test_lux_q_cooldown_conflict_surfaced        (audit-DB drift)
test_audit_db.py::test_json_roundtrips_and_schema              (audit-DB drift)
test_mastery_per_question_reveal.py::test_reveal_needs_no_new_persistence
test_phase4f_ranked_mastery_slice.py::test_format_for_creation_is_unaffected_by_this_module
```

The skip count falls from 14 to 7 for a mechanical reason: seven
committed-footprint guards skip while nothing is committed and **run** once the
work is. That is the same arithmetic Phase 1 recorded.

**One flake, reported rather than tidied away.** The first post-rebase run of
the four targets additionally failed
`test_ranked_mastery_artifact_persistence.py::test_review_is_unchanged_after_the_canonical_data_moves`.
It did not reproduce: that file passes alone on the branch, passes alone on the
base, passes in the narrower combination, and three subsequent runs of the
identical four-target command all gave 5 failed / 2146 passed. Recorded as an
observed intermittent, not as a clean result.

**Frontend** (`npx vitest run`, serially, in `~/mogsy-wt-gr1-state3` with a
hardlinked `node_modules`):

| Run | Result |
|---|---|
| `formatPromptSemantics` + `promptSemantics` | 40 passed |
| `MasteryGeneratorLab.test.tsx` | **45 passed** (was 31) |
| `src/features/mastery` + `src/lib/ranked-core` + `src/pages/admin/ranked` + `src/lib/admin` | 1 failed, **1160 passed** |

The one failure is `adminCredentials.test.ts > fallback key store`, which fails
identically on the stashed clean tree. `tsc --noEmit` reports nothing in any
file this phase touches.

---

## 11. Roster-wide probe

Read-only, against the real `lol_calc.db` (local patch 26.16), **not
committed** per the project rule. All 173 identities, four builds each
(no items, 20 haste two ways, 40 haste), one rank per slot that publishes a
cooldown fact.

```
roster                                              173
champions producing state-aware questions           165
candidates generated (4 builds)                   2,356
ANSWER MISMATCHES vs fact × shared primitive          0
20-haste build A == build B, same identity      589/589
20-haste != 40-haste identity                   589/589

skips     static_cooldown 20 · no_projected_fact 8
refusals  unknown_ability_slot 12  (3 champions x 4 builds)
absent    no cooldown facts at all 5 champions
```

**The 3 refusals are a pre-existing Phase 2 gap this phase surfaced, and did
not fix.** `dr-mundo`, `nunu` and `renata` resolve through the identity
registry to `db_lookup_name`s (`Dr Mundo`, `Nunu`, `Renata`) that do not match
their `champion_abilities.champion` spelling (`Dr. Mundo`, and the full names),
so `normalize.champion_slots` reads an empty kit and every rank refuses with
`unknown_ability_slot`. The behaviour is **fail-closed and therefore safe** —
the state refuses rather than resolving a wrong kit — but it is a coverage
limit, and closing it means changing Phase 2 normalization for every consumer,
which is not this phase's scope. Carried as a blocker (§13).

---

## 12. Visual verification

`docs/audits/gr1-reusable-state-phase3/` — **8 PNGs**, captured with Playwright
through the **real** production route (`/admin/ranked/generator-lab`), the real
`MasteryGeneratorLab`, the real `MasterySliceChallengeSurface`, and the real
backend routers, against the canonical database. No mock.

| File | What it shows |
|---|---|
| `01-configured-state.png` | the state-aware panel: champion, level 7, Q r4 / W r4 / E r3, one item, seed — and no haste field |
| `02-resolved-state-context.png` | the resolved state: inputs, concrete basis (`basis_032228…`, League 26.16), ruleset revision, both identities, and the seven derived values the questions read, including `ability_haste.total 20` |
| `03-question-unanswered.png` | *"At rank 4 with 20 Ability Haste, what is Ahri W (Fox-Fire)'s cooldown, in seconds?"* — the real media band (Fox-Fire, slot W, rank 4), the real options, the real patch badge |
| `04-question-answered-and-key.png` | the same card with the option picked, and the admin-only answer, explanation and binding beneath it |
| `05-binding-and-provenance.png` | the binding, the family, the declared read-set, the mastery set, the template key, the seed and salt, and **"computed for this preview only — NOT stored"** |
| `06-raw-response.png` | the raw payload, for a field this build does not know about |
| `07-full-page.png` | the whole surface, top to bottom |
| `08-production-surface-unchanged.png` | the production generator beside it: *"At rank 4, what is Aatrox W (Infernal Chains)'s cooldown, in seconds?"* — **no scenario clause, and an explanation with no scenario suffix** |

Capture notes, for anyone reproducing it: the harness used the repository's own
double-gated `VITE_E2E_AUTH` dev persona for the `/admin` route and the
shared admin-key **fallback dialog** for the workspace gate — both existing,
sanctioned local paths, neither a bypass of the backend's `require_admin`. The
backend was a bare app mounting the **real** `ranked_public.admin_router` and
the new state-lab router, which skips `api_server`'s startup migration pass
(irrelevant to a preview, and it writes to the shared database). Both harness
files were deleted; neither is committed.

---

## 13. Out of scope — confirmed not done

No state-aware question in Ranked. No Champion Mastery change. No Matchup
Mastery change. No Full composer. No Slice composition change. No new family
unlocked (`quiz/family_contract.py` is untouched). No ability-cost or
level-stat family. No damage, no combat state, no mitigation, no penetration.
No Journey change. No Combat Lab change. No QCA change. No DB migration and no
DDL. No external build or rune source. No historical patch storage. No
`FrozenStateArtifact` persistence — the block is computed and stored nowhere,
and `mastery_artifact` is unchanged. No config key beyond the one deployment
flag. Phase 4 not begun.

---

## 14. Blockers before a state-aware question can be SERVED to a user

In the order they would have to be met.

1. **Persistence.** `FrozenStateArtifact` is written nowhere. A served
   state-aware question must freeze its state beside its content, or history
   cannot explain it — and the block is currently **one per state**, so a
   Slice window over more than one state needs a container decision first
   (`StepBinding` already carries the digest, so the type does not change).
   This is the Phase 4 job.
2. **A composition decision about answer-equivalent identities** (design
   D-20). A bound `{AH: 0}` and the intrinsic question have the same answer
   and different identities. That is correct as identity; whether a composer
   may put both in one slice is a policy nobody has set.
3. **Ranked reachability.** `mastery_slice` has no state-aware mode, by
   design. Giving it one means a config key, a schema branch, a builder
   catalog entry and a readiness report — and the owner deciding that
   state-aware questions should be served at all.
4. **Where the state comes from when nobody types it.** The Lab's states are
   admin-stated. A served question needs a source of states — a curated
   progression, a saved template, a rule — and `SourcePolicy` ships empty
   (design D-9 (c): the curated item whitelist is selectable by name and is
   **not** the default). That is a product decision, not a code gap.
5. **The three-champion normalization gap** (§11). Fail-closed today, so it
   costs coverage rather than correctness, but a served family should not
   silently exclude three champions for a name-spelling reason.
6. **Rank availability is undeclared for four champions' anomalous slots**
   (`elise/R`, `jayce/*`, `udyr/*`, `yuumi/Q`) — carried from Phase 2. Each
   needs a wiki sentence, not a guess.
7. **The patch-identity mismatch** — carried from Phase 2 §3.1. A state's
   `DataBasisId` and a Mastery artifact's `patch_key_digest` are computed over
   different material and are not interchangeable. Both are recorded on a
   served artifact today, so nothing is lost; unifying them is a Mastery
   identity change.
8. **Reveal wording for a scenario question.** The explanation now says *"Ahri
   Fox-Fire: 5 seconds at 20 ability haste."* That is honest and sufficient for
   a Lab. A served question probably wants the arithmetic — base, multiplier,
   result — and the candidate already carries `derivation_inputs` for it.
9. **Family breadth.** One family is a seam, not a product. Ability cost under
   a state, level-scaled stats under items, and pair-derived values are all
   representable and none is generated.

**Rollback:** `git revert 22a1c7d9` (backend) and `8f949824` (frontend).
Nothing to un-migrate, nothing persisted, and the one consumer is a route
behind a flag that is off.
