# GR1 — Champion Slice Profiles: scope breadth vs question budget

**IMPLEMENTED, INTEGRATED to `origin/master` `c2634d8a` (fast-forward from `d5fbacd6`, 2026-09-21). Internal / Generator Lab only.** A Slice no
longer means one fixed window size. A **Champion Slice Profile** states two independent things —
which states of a progression are *eligible* (scope breadth) and how many questions are *asked*
from them (question budget) — and five profile types are certified over the one trusted source.

Nothing a player can reach changed. No Ranked wiring, no route, no `mastery_slice` mode, no
persistence, no `mastery_state` writer, no migration, no new question family, no Full, no Matchup
profile, no frontend. The cooldown prompt is untouched, `ChampionProgressionSource` is untouched,
and the contract half's `default_sequence_registry()` is still empty.

| | SHA | Note |
|---|---|---|
| Backend base (brief) | `origin/master` **`e7436166`** | As named. `origin/master` moved once **during** the phase (`d5fbacd6`, Immolate target multipliers — 11 files, **zero `mastery/` overlap**); the branch was rebased onto it before committing. |
| Backend commit | **`c2634d8a`** | One commit on `gr1/champion-slice-profiles`, worktree `~/lcs-wt-gr1-prof`, parent `d5fbacd6`. **PUSHED to `origin/master` (fast-forward, SHA unchanged).** |
| Comparison base | `~/lcs-wt-gr1-base` detached @ **`d5fbacd6`** | Same symlinked `lol_calc.db`, for the failure-set arm. |
| Docs base | `origin/main` **`4cf0b247`** | The brief named `884e96a5`; `origin/main` had moved three commits (Lovable/FUNNEL, no doc overlap). |
| Docs commit | *(this commit — read it with `git log`)* | Branch `gr1/champion-slice-profiles-docs`, worktree `~/mogsy-wt-gr1-prof`. **PUSHED to `origin/main` (fast-forward from `4cf0b247`).** |
| Frontend | **none** | None was expected and none was needed. |

**Files: 7 — 2 new, 5 modified, every one inside `mastery/setup_state/` or `mastery/tests/`.**

```
mastery/setup_state/slice_profile.py                 NEW  +839  the profile contract (CONTRACT half)
mastery/tests/test_gr1_champion_slice_profiles.py    NEW  +943  93 tests
mastery/setup_state/window_lab.py                    +256       the Lab flow and diagnostic
mastery/setup_state/composition.py                   +194 −17   one new policy; the search body shared
mastery/setup_state/errors.py                        +45        seven structural codes
mastery/setup_state/__init__.py                      +30        exports
mastery/tests/test_setup_state_isolation.py          +54 −3     module declared; ONE named exemption
```

---

## 1. Audit of the existing window / composition contracts

Read at `e7436166` before anything was edited.

| Object | What it already does | What it assumes |
|---|---|---|
| `StateSequence` / `StateTransition` | Ordered nodes; transitions **derived** by diffing templates over the closed axis vocabulary, with explicit absence. | Nothing about questions. Exactly the right input for a checkpoint reading. |
| `StateWindow` (`window.py`) | A **contiguous** span with a `WindowSelection` policy id recorded in its `composition_key`. Contiguity is the contract ("a consumer that genuinely needs disjoint states takes two windows"). `max_nodes` is documented as a **state** count, never a question count. | `select_window` / `window.contiguous_seeded.v1` is explicitly the *testing* policy. |
| `WindowCandidateUniverse` (`composition.py`) | Collapses per-state candidates on `candidate_id()`; keeps every producing state in `source_ordinals`; **presentation = earliest producer**. | That the earliest producer is always the presentation state. |
| `composition.lab_window_coverage.v1` | Budget is a plain count, independent of state count; round-robin over states. | **Starts at a seeded group offset and walks in window order**, so over an 18-state window a budget of 3 takes three *adjacent* states. There is no checkpoint or spread preference anywhere. |
| `composition.lab_window_gate_aware.v1` | Lexicographically-earliest publishable combination over the coverage walk; refuses rather than shrinks; reports `maximum_feasible_count`. | Its preference order *is* the coverage walk. |
| `publication_gate/preflight.py` | Hard rules from their owners; `verdict(ids)` is the authority. | Its recipe is synthesized **from the selection itself** — so "fewer semantic questions than the budget" is a supply fact it cannot phrase (see §9). |
| Progression diagnostics (`progression_diagnostic`) | Source → nodes → transitions → window → composition. | Window chosen by explicit span or the testing policy only. |
| `FrozenStateBundle` construction (`build_window_bundle`) | Includes only states a selected question needs, dense remap, transitions only when contiguous and single-sided. | Binds each step to `step.primary_ordinal` — so it works unchanged for any presentation state that actually produced the question. |

**The four audit questions, answered.**

1. **What already separates eligible states from selected questions?** `StateWindow` (states only, no
   question count) plus the composition layer (budget as a separate count). The separation existed;
   what was missing was a policy object that *chooses* the eligible window and a composition that
   *samples* it rather than clustering.
2. **What still equates window length with question count?** No contract does. The *behaviour* of the
   coverage walk does in effect: with `budget ≤ window` it represents a contiguous run of states
   starting at a seeded offset, so a broad window with a small budget looks like a small window. And
   the testing policy's `max_nodes` was the only way to choose breadth at all.
3. **Is `StateWindow` sufficient?** For eligibility, **yes** — every scope a profile needs (one
   state, a local span, a level band, the whole run) is contiguous. It is not sufficient as a
   *request*: nothing in it says "levels 1–6", "around this anchor", "prefer checkpoints", or "this
   many questions". So a higher-level object was added **above** it (`SliceScope`, built from a
   `ChampionSliceProfile`), and "window" kept its meaning. Sparse selection lives in composition,
   never in the window.
4. **Where does each piece of logic belong?**

| Layer | Owns |
|---|---|
| progression source | Which states exist, in which legal order. Unchanged; knows nothing about profiles (asserted). |
| **Slice profile** | Scope breadth, anchor semantics, question budget, sampling mode — as identity-bearing data. |
| **state selection** (`derive_slice_scope`) | The eligible contiguous window, the checkpoint reading of its transitions, and a complete STATE preference order. Coverage only — never feasibility. |
| question composition | Which questions, from which preferred states, subject to the gate. The existing gate-aware search, now walked over the profile's state preference. |

---

## 2. The profile contract

```
ChampionSliceProfile                         (slice_profile.py — CONTRACT half, pure)
  profile_id        "slice_profile.<name>"   namespaced; a profile's window can never share
                                             an identity with a testing-policy window
  profile_version   "v1"
  scope             ScopeSpec                WHICH states are eligible
  sampling          single_state | dense_local | checkpoint_spread
  question_budget   int ≥ 1                  a count of QUESTIONS, never of states
  anchor_policy     seeded | none
  label             display only, not identity

ScopeSpec
  kind = anchored_span   span_nodes          contiguous span CONTAINING an anchor
  kind = axis_band       axis, low, high     every node whose axis value is in [low, high]
  kind = whole_sequence  —                   the run the source supplied

AnchorRequest(ordinal=…) | AnchorRequest(axis="level", value=1)   — resolved against the run
```

**Identity is split on purpose.**

* `scope_key` (`sscope_…`) = profile id + version + scope + anchor policy. **No budget, no sampling.**
* `profile_key` (`sprof_…`) = the scope material + schema version + sampling + **budget**.
* The scope's window records `profile_id/version` as its `WindowSelection.policy_id`; the seed enters
  the window's identity **only** when it actually chose the anchor.
* `SliceScope.scope_instance_key` = scope key + sampling + window + anchor + preference. Budgets 3 and
  4 share it — that is the scope-vs-budget proof in a single hash (§4).

**No question-family knowledge lives in the profile layer.** A test reads `slice_profile.py` and
fails on `cooldown`, `haste`, `candidate`, `family_id`, `answer_metric`, `ScenarioBinding`,
`publication_gate`, `mastery_slice` or `ranked_`. It imports only `contract`, `errors`, `sequence`,
`window` and `hashing`.

**Validation, all structural** (`slice_profile_invalid`): a non-count budget; an unknown scope kind
or sampling mode; a field an unread kind would carry; single-state sampling on a multi-state scope
or vice versa (they imply one another); an anchored span without a seeded anchor policy.

---

## 3. The certified profiles

| Profile | Scope | Sampling | Anchor | Semantics |
|---|---|---|---|---|
| **`snapshot`** | `anchored_span`, 1 state | `single_state` | seeded, or requested | One exact state; several distinct questions may examine it. **First-class, not degenerate** (§6). |
| **`tight`** | `anchored_span`, 3 states | `dense_local` | seeded, or requested | A small contiguous local progression around one state; the anchor is preferred first, then its neighbours. |
| **`early_phase`** | `axis_band`, `level` 1..6 | `checkpoint_spread` | none | The owner's "early levels 1–6", sampled rather than exhausted. |
| **`wide`** | `axis_band`, `level` 1..11 | `checkpoint_spread` | none | A broad region, sampled at checkpoints. |
| **`full_range_sample`** | `whole_sequence` | `checkpoint_spread` | none | The whole legal run the source supplied; sparse checkpoint-style selection. |

`certified_profile(name, question_budget=…)` — the budget is a **parameter**, not part of the
certified entry. One certified scope policy, any question count. A profile is `is_certified` only
when its scope, sampling and anchor policy are exactly a certified entry's; `with_sampling()` makes a
labelled, *uncertified* variant so the Lab can compare modes over one scope.

**None of these is a Ranked preset.** No Ranked format, config key or mode can name one (§13).

### 3.1 Scope is data and sequence-based

* **Full range is whatever the source supplied.** A `from_level=4, to_level=9` run's full range is
  levels 4–9. When the rules authority is monkeypatched to grant two more levels, the full range
  grows to match — no profile code changes, and no `18` exists anywhere in the profile machinery.
* **A band is a request checked against the nodes the run holds.** Both requested bounds must be
  present among the nodes' own values, and the selected nodes must be one contiguous span.
  Otherwise the profile is **refused** — `slice_scope_unsatisfiable` / `slice_scope_not_contiguous`
  — never clamped. A run starting at level 3 cannot honour "levels 1–6"; it is not silently turned
  into 3–6.
* **A band over an axis the run does not state is unreadable** (`slice_scope_axis_unreadable`), not
  empty: an *item* run leaves `level` unspecified, so `early_phase` and `wide` refuse it while
  `snapshot`, `tight` and `full_range_sample` work over it.
* **Nothing reads a level as meaning something.** "6" is the owner's product phrasing for the early
  phase; it is never used as "ultimate unlock". The checkpoint policy (§5) derives importance only
  from transitions that actually occurred.

### 3.2 The one guard exemption, and why it is honest

The contract half's isolation guard permits no integer outside `{0, 1, 2}`. The certified requests
need `3`, `6` and `11`. Rather than route around the guard (a JSON file, or arithmetic on 1s and
2s), the guard was **deliberately extended with one named exemption**, exactly as it already has one
for slot letters:

```python
PROFILE_REQUEST_DATA = ("slice_profile.py", "_CERTIFIED_SCOPE_REQUESTS")
```

Integers are exempt **only inside that one assignment in that one module**, and a new guard test
asserts the assignment exists exactly once in the contract half and that every other integer in
`slice_profile.py` is still in `{0, 1, 2}`. The numbers are requests, not caps: the behavioural tests
in §3.1 are what prove a run that cannot honour one refuses the profile.

---

## 4. Scope vs budget — the proof

| Claim | Test |
|---|---|
| Budgets 3 and 4 over the same profile select the **same** window (`composition_key`), the same eligible ordinals, the same state preference and the same `scope_instance_key`; only `profile_key` differs | `test_the_budget_never_changes_the_eligible_scope` × 5 profiles |
| A broad scope with a small budget samples: full range = 18 eligible states, 3 or 4 questions, ≤ budget states represented | `test_a_broad_scope_with_a_small_budget_samples_rather_than_exhausts` |
| One state can answer a budget of 4 | Snapshot / Tight at budget 4 (§6, §3) |
| Every profile certifies at **both** 3 and 4 for a representative | `test_budget_three_and_four_both_certify_on_every_profile_somewhere` |

---

## 5. Checkpoint policy

A state's **priority** is the number of signals on the transition *into* it, read off the
sequence's own derived `StateTransition`:

| Signal | Meaning |
|---|---|
| `axis_changed:<axis>` | the axis changed on this step **and it does not change on every step of the scope**. An axis that moves every time (a level run's `level`, a skill run's `ability_ranks`) is *routine* and says nothing about any one step. |
| `key_activated:<axis>` | a key on a keyed axis went from absent/zero to present — a rank vector gaining its first point in some slot, an inventory gaining an item id. |
| `key_removed:<axis>` | a key went from present to absent — components consumed by a completion. |

Keyed values are read generically (rank pairs as `{key → weight}`, inventories as multisets), so no
slot, item or rune is known to the policy. The scope's first state has no in-scope incoming
transition and is marked as the boundary.

**Observed, not assumed:**

* A pure level run: every transition is `('level',)` → routine → **every priority is 0** → the policy
  falls back to spread and the seed, deterministically.
* A level + stated-order run: priority 1 exactly where some slot gets its **first** point (for the
  harness order used here: levels 2, 6 and 13), and nowhere else. The test recomputes the expected
  set from the rank vectors rather than hard-coding levels.
* A component item run: `key_activated:items` on every purchase and `key_removed:items` where a
  completion consumes its partials.

No champion-specific heuristic exists. "Level 6" appears as a checkpoint for Ahri only because a
slot actually receives its first point there in the stated order.

## 6. Sampling behaviour — state coverage preference, not feasibility

`derive_slice_scope` returns a **complete** ordering of every eligible state — never a cut, never a
count. The composer walks it; states that turn out to have nothing askable are skipped; the gate
decides feasibility.

| Mode | Order |
|---|---|
| `single_state` | the one state |
| `dense_local` | the anchor (requested, else seeded), then its neighbours nearest-first; ties → higher priority → seed |
| `checkpoint_spread` | the requested anchor if any, else the highest-priority state (seeded among ties); then repeatedly the state maximising **distance to the nearest already-preferred state + its priority**, seeded among ties. With equal priorities this is plain farthest-point spreading. |

**The composition side — `composition.lab_profile_gate_aware.v1`.** A third Lab policy id, not a
revision. Its only change to the gate-aware policy is the **preference order**:

1. each preferred state's queue holds **every** question it produces — its *novel* ones first (those
   it is the earliest producer of), then inherited ones — each part spread across subjects by the
   coverage policy's own `_state_queue`;
2. round-robin over the states **in profile preference order**, listing each question once, at the
   first preferred state that reaches it.

Everything after that is the existing machinery, **literally**: the gate-aware body was extracted
into `_gate_aware_from_order`, which both the old gate-aware policy and the profile policy call. Same
lexicographic search, same guarantee, same `SEARCH_NODE_BUDGET`, same refusal to shorten, same
`maximum_feasible_count`, same progression-order output. The existing policies' 106 tests pass
unedited.

**Presentation at a producing state.** A question produced identically at levels 2–18 is *askable*
at level 10. `StateCandidate` gained an optional `presentation_ordinal` (default `None` = the
existing earliest-producer rule, byte-identical `to_dict()`); when set it **must** be one of the
candidate's `source_ordinals` or construction is refused (`presentation_not_a_producer`). So a frozen
step still binds to a state that asked exactly that question — asserted against the bundle's
`resolved_state_digest` per step. Without this, a spread profile could never represent a later state
whose questions all first appeared earlier.

**Broad scopes do not cluster.** Full range at budget 3 always spans at least half the run across
six seeds (asserted); `wide` under `checkpoint_spread` spans strictly more of the run than the same
scope under `dense_local` for every seed tested (asserted).

## 7. Deterministic variation

* Same champion, source, profile, budget and seed → **identical diagnostic** (asserted for all five
  profiles).
* Every seeded choice is a `content_hash` over (scope key, seed, material). No clock, no RNG.
* The seed chooses **which** states/questions — never their order. The final set is always
  `(presentation ordinal, family_id, candidate_key)`, asserted across seeds and profiles.

**How much a seed actually varies the result** (24 seeds, rank-bearing arm, feasible runs):

| | early_phase 3 | early_phase 4 | wide 3 | wide 4 | full_range 3 | full_range 4 |
|---|---|---|---|---|---|---|
| Ahri — distinct state sets | 3 | *(infeasible)* | 2 | 5 | 7 | 10 |
| Jarvan IV — distinct state sets | 4 | 4 | 2 | 6 | 7 | 6 |
| Jarvan IV — distinct question sets | 4 | 4 | 2 | 6 | **13** | **15** |

Honest reading: **checkpoint priority deliberately concentrates the choice.** Early Phase lands on
levels 2/4/6 for ~80% of seeds and Wide b=3 on 2/6/11 for ~70–80%, because those states carry the
only activation signals in their band. Full Range varies well. Whether a product wants more
replayability at the cost of weaker checkpoint preference is a tuning decision this phase does not
take (§14); the knob is the priority term in the spread score.

---

## 8. Representative Champion results

Level progression from `champion.progression.legal_advance.v1`. "ranks" = level + a **stated**
skill order (the progression suite's harness order, attributed; not a Mogzy store). "level" = pure
level run. Seed `alpha`. Levels shown, not ordinals. *pooled* = per-state candidates after the
gate's eligibility filter and per-state effective-question dedupe; *semantic* = after cross-state
collapse on `candidate_id()`.

| champion | arm | profile | b | eligible | preferred (first 6) | pooled | semantic | collapsed | feasible | selected levels | limit |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ahri | ranks | snapshot | 3 | 1 | [14] | 4 | 4 | 0 | 3/3 | [14] | — |
| ahri | ranks | snapshot | 4 | 1 | [14] | 4 | 4 | 0 | 4/4 | [14] | — |
| ahri | ranks | tight | 3 | 3 | [11, 12, 13] | 10 | 4 | 6 | 3/3 | [11, 12, 13] | — |
| ahri | ranks | tight | 4 | 3 | [11, 12, 13] | 10 | 4 | 6 | 4/4 | [11, 12, 13] | — |
| ahri | ranks | early_phase | 3 | 6 | [6, 2, 4, 3, 5, 1] | 12 | 3 | 9 | 3/3 | [2, 4, 6] | — |
| ahri | ranks | early_phase | 4 | 6 | [6, 2, 4, 3, 5, 1] | 12 | 3 | 9 | 3/4 ✗ | — | semantic_supply_below_budget |
| ahri | ranks | wide | 3 | 11 | [2, 11, 6, 4, 9, 3] | 27 | 4 | 23 | 3/3 | [2, 6, 11] | — |
| ahri | ranks | wide | 4 | 11 | [2, 11, 6, 4, 9, 3] | 27 | 4 | 23 | 4/4 | [2, 4, 6, 11] | — |
| ahri | ranks | full_range_sample | 3 | 18 | [2, 18, 10, 6, 13, 8] | 54 | 10 | 44 | 3/3 | [2, 10, 18] | — |
| ahri | ranks | full_range_sample | 4 | 18 | [2, 18, 10, 6, 13, 8] | 54 | 10 | 44 | 4/4 | [2, 6, 10, 18] | — |
| teemo | ranks | snapshot | 3 | 1 | [3] | 1 | 1 | 0 | 1/3 ✗ | — | semantic_supply_below_budget |
| teemo | ranks | tight | 3 | 3 | [1, 2, 3] | 2 | 1 | 1 | 1/3 ✗ | — | semantic_supply_below_budget |
| teemo | ranks | early_phase | 3 | 6 | [6, 1, 2, 4, 3, 5] | 5 | 1 | 4 | 1/3 ✗ | — | semantic_supply_below_budget |
| teemo | ranks | wide | 3 | 11 | [6, 2, 11, 8, 4, 9] | 10 | 1 | 9 | 1/3 ✗ | — | semantic_supply_below_budget |
| teemo | ranks | full_range_sample | 3 | 18 | [13, 2, 8, 18, 5, 6] | 23 | 2 | 21 | 2/3 ✗ | — | semantic_supply_below_budget |
| jarvan-iv | ranks | snapshot | 3 | 1 | [4] | 2 | 2 | 0 | 2/3 ✗ | — | semantic_supply_below_budget |
| jarvan-iv | ranks | tight | 3 | 3 | [7, 8, 9] | 9 | 5 | 4 | 3/3 | [7, 8, 9] | — |
| jarvan-iv | ranks | tight | 4 | 3 | [7, 8, 9] | 9 | 5 | 4 | 4/4 | [7, 8, 9] | — |
| jarvan-iv | ranks | early_phase | 3 | 6 | [2, 6, 4, 3, 1, 5] | 12 | 6 | 6 | 3/3 | [2, 4, 6] | — |
| jarvan-iv | ranks | early_phase | 4 | 6 | [2, 6, 4, 3, 1, 5] | 12 | 6 | 6 | 4/4 | [2, 3, 4, 6] | — |
| jarvan-iv | ranks | wide | 3 | 11 | [2, 11, 6, 9, 4, 3] | 27 | 11 | 16 | 3/3 | [2, 6, 11] | — |
| jarvan-iv | ranks | wide | 4 | 11 | [2, 11, 6, 9, 4, 3] | 27 | 11 | 16 | 4/4 | [2, 6, 9, 11] | — |
| jarvan-iv | ranks | full_range_sample | 3 | 18 | [2, 18, 10, 6, 13, 8] | 54 | 14 | 40 | 3/3 | [2, 10, 18] | — |
| jarvan-iv | ranks | full_range_sample | 4 | 18 | [2, 18, 10, 6, 13, 8] | 54 | 14 | 40 | 4/4 | [2, 6, 10, 18] | — |
| karma | level | *every profile, b=3 and 4* | | 1 / 3 / 6 / 11 / 18 | spread over the band | 0 | 0 | 0 | 0/b ✗ | — | required_axis_absent |
| ahri | level | *every profile, b=3 and 4* | | 1 / 3 / 6 / 11 / 18 | spread over the band | 0 | 0 | 0 | 0/b ✗ | — | required_axis_absent |

(Teemo's budget-4 rows mirror its budget-3 rows with `n/4`. Jarvan's snapshot at `alpha` lands on
level 4, which holds two semantic questions; other seeds land on richer states — `beta` → level 7,
3 questions, feasible at 3.)

**Readings.**

* **The profiles behave coherently in every case.** Scope sizes are exactly 1 / 3 / 6 / 11 / 18,
  preference orders spread across the band, selections come back in progression order, bundles
  hold only the selected states.
* **Every underfill is a supply fact of the one family, never a profile failure.** Teemo has two
  semantic cooldown questions across its entire 18-state run; a pure level run states no ranks, so
  the cooldown family reports its own `required_axis_absent` in every state. The profile reports
  both and composes nothing rather than filling.
* **Collapse is where the length goes.** Ahri's full range pools 54 per-state candidates into 10
  semantic questions: Q and E are flat, so a single question is produced by up to 17 states.

### 8.1 Roster sweep (rank-bearing arm, seed `alpha`)

164 of 173 champions have a rank-bearing run (the 9 known fail-closed gaps are unchanged). Scope
derivation over the **LEVEL** arm succeeds for **all 173 × all 5 profiles** with exactly the
expected eligible counts.

| profile | b=3 feasible | b=4 feasible | underfills (b=3) |
|---|---|---|---|
| snapshot | 92 / 164 | **28 / 164** | 72 supply |
| tight | 138 / 164 | 116 / 164 | 25 supply, 1 gate — Ryze (`effective_question_collision` + `request_under_filled`, max 2) |
| early_phase | 146 / 164 | 130 / 164 | 18 supply |
| wide | 155 / 164 | 146 / 164 | 9 supply (b=4 adds 1 gate — Kog'Maw, max 3) |
| full_range_sample | **162 / 164** | 159 / 164 | 2 supply (Aphelios 0 semantic, Teemo 2) |

Full-range semantic supply per champion: 0 (Aphelios) … 18; 43 champions sit at 18 and 43 at 14.
The smallest are form/flat kits (Teemo 2; Gnar, Lee Sin, Rek'Sai 3).

---

## 9. Gate-aware feasibility, and structured infeasibility

`window_lab.run_profile(conn, sequence, profile, seed=…, anchor=…)` never raises for a **supply**
shortfall. It returns a `ProfileRun` with exactly one of `composed` and `infeasibility` set:

```
infeasibility = {
  code                no_feasible_composition | no_candidate_in_window
  requested_budget    the profile's budget, never altered
  feasible_count      the largest budget this scope CAN publish (0 when nothing is askable)
  limiting_codes      the publication gate's own words, or the family's barren reasons
  supply_codes        ["semantic_supply_below_budget"] when the universe < budget
  semantic_candidates the deduplicated universe size
  detail              one human sentence
}
```

* **`semantic_supply_below_budget` is reported beside the gate's codes, never instead of them.** The
  preflight synthesises its recipe from the selection itself, so it cannot say "you asked for more
  than exists". That is a composition-level fact and is named as one; the gate was not touched.
* **No filler, no repeat, no silent shrink.** `composed` and `bundle` are both `None` when
  infeasible; `compose_profile` (the strict entry point) raises `NoFeasibleComposition` carrying the
  report. A test proves the reported `feasible_count` is not advice but a budget that actually
  composes **and renders through the production publication path**.
* **The gate stays the authority.** A profile set with `render=True` is re-judged by
  `publication_gate.publish`; a stubbed "yes to everything" oracle makes the profile composer return
  the known monotonous `W r2/r3/r4` triple, and the real `publish` still refuses it with
  `PublicationBlocked`, while `run_profile` over the same states reports
  `effective_question_collision`.
* **Scope refusals are still raised** in the state layer's own words (`slice_scope_*`,
  `slice_anchor`) — they are request errors, not supply.

## 10. Snapshot behaviour

* One exact state; `len(window) == 1`; the bundle holds one state; 3 or 4 **distinct** questions
  from it when the state can supply them (Ahri level 14: 4 semantic questions → both budgets
  compose).
* Anchor by seed, or requested by ordinal or by axis value (`AnchorRequest(axis="level", value=1)`).
  A requested anchor removes the seed from the window identity.
* **Ahri level 1, budget 4:** requested 4, **feasible 1**, limit `semantic_supply_below_budget` —
  level 1 holds one ability point, so the one family has one question. Reported, not shrunk.
* Roster: only 28/164 champions have a seed-`alpha` snapshot state rich enough for 4 cooldown
  questions. **That is the cooldown family's ceiling per state (≤ one question per learned ability),
  not a Snapshot defect.** Snapshot will become rich when stats, resource costs, ratios and damage
  families exist; no family was added here to make it look richer.

## 11. Early Phase and Full Range behaviour

* **Early Phase** = exactly the nodes whose level is 1..6 (asserted by reading the nodes). Budget 3
  and 4 represent fewer than six states and span at least three levels (asserted for Jarvan IV
  across seeds). A run that does not contain level 1 **and** level 6 refuses the profile.
* **Full Range** = the whole supplied run, any length. Budget 3 ≈ start / middle / end
  (`[2, 10, 18]`), budget 4 adds a checkpoint (`[2, 6, 10, 18]`). Sparse selections carry **no**
  `FrozenTransition` and say why ("the selected states are not contiguous in the sequence…"),
  exactly as the window-composition phase defined; a contiguous Tight selection carries its
  transitions.

## 12. FrozenStateBundle

Built only from the final gate-aware selection. Each `StepBinding` binds to its **presentation**
state, whose `resolved_state_digest` is asserted to be that state's own — including when the profile
presented a shared question later than its earliest producer. Included states are exactly the
selected presentation states, dense-remapped in window order. Serialize → JSON → deserialize →
verify is exactly equal and verification finds only informational findings. **Nothing is persisted**
(`is_persisted: false`), and an infeasible request builds no bundle at all.

## 13. Isolation and current-serving invariance

| Claim | How it is held |
|---|---|
| `ChampionProgressionSource` semantics unchanged | `progression.py` byte-identical (footprint test) and names no profile concept (text test). |
| Profile is not a question layer | text + import tests over `slice_profile.py` (§2). |
| Source / profile / question isolation | source → profile: profile reads only templates and derived transitions; profile → question: only a state order crosses; question → gate: the injected oracle, as before. An explicit literal sequence composes through the same path without any source. |
| Champion Mastery / Matchup Mastery unchanged | full `mastery/tests` failure SET identical to base (§15). |
| Ranked unchanged; current Slice unchanged | `ranked_modules/mastery_slice.py` byte-identical, names no `setup_state` / `slice_profile` / profile policy id; `parse_mastery_slice_config` refuses `slice_profile`, `state_window`, `snapshot`, `full_range_sample`. |
| No player state-aware mode, no route | Lab router names no profile function; the tracked-file scan finds **no** production importer of the profile layer. |
| No `mastery_state` production writer | profile module names no persistence symbol; `window_lab` calls no persistence writer. |
| No Full, no DB migration, no new family | footprint test: every changed path is under `mastery/setup_state/` or `mastery/tests/`, none is a migration or `.sql`; `scenario.py` (the cooldown family) byte-identical. |
| Cooldown prompt unchanged | `scenario.py` in the pinned UNMOVED set. |
| Contract-half `default_sequence_registry()` empty | asserted, including that it refuses `champion.progression.legal_advance.v1`. |
| Gate and preflight unchanged | `gate.py`, `preflight.py`, `resolver.py` in the UNMOVED set. |

## 14. Explicit scenarios vs progression claims

"Level 11 Ahri with Malignance" composes as a **Snapshot over a literal one-node sequence**: 3
questions, and the diagnostic's source block carries **no** provenance and does not mention the
progression source. It is a stated scenario, not a claim that Ahri canonically owns Malignance at
level 11 — no level↔item timing authority exists and none was invented. Profiles consume any
`StateSequence`, so explicit setups will keep working without being mistaken for sourced progression.

---

## 15. Tests

`/Users/macmoney/League_Combat_Simulator/.venv/bin/python -m pytest … -p no:randomly`, with
`lol_calc.db` symlinked read-only into both worktrees.

**New: `mastery/tests/test_gr1_champion_slice_profiles.py` — 93 tests, all passing.** Profile
identity and versioning; label not identity; malformed profiles and scopes refused; scope-vs-budget
independence for every profile; Snapshot (one state, several questions, anchor by axis value,
requested vs feasible vs limit, seed choosing the state); Tight (contiguous, contains its anchor,
dense preference, refuses a short run, budget 4 over 3 states); Early Phase (band read from nodes,
sampled not exhausted, refuses a run missing a bound, unreadable axis, non-contiguous band); Wide;
Full Range (the supplied run, follows the rules data, sparse and spread, spread vs dense);
checkpoints (level-only all zero, activations exactly where a slot first appears, component
removals, highest checkpoint leads); complete preferences; determinism for all five; seed variation;
progression order; structured infeasibility; strict raise; the reported maximum composes and
renders; no effective-question repeat; the real publication path accepts profile sets; a lying
oracle still refused; presentation only at a producer; existing candidates unchanged; the bundle
binds each step to its presentation state; sparse vs contiguous transitions; round trip; no bundle
when infeasible; the diagnostic's whole chain and its infeasible form; **173-champion LEVEL
compatibility**; the **9 fail-closed champions in LEVEL mode**; the explicit Malignance scenario;
isolation, invariance and the footprint.

**Isolation guard:** `test_setup_state_isolation.py` 102 → **108** (5 parametrised cases for the new
contract module + 1 exemption test), all passing.

**Regression / invariance arm — `mastery/tests`, same command on both worktrees:**

```
mastery/tests      base   d5fbacd6:  5 failed, 2457 passed, 14 skipped
                   branch c2634d8a:  5 failed, 2563 passed,  7 skipped

failure SET byte-identical to base (compared by name):
  test_audit_db.py::test_pool_and_certified_counts
  test_audit_db.py::test_lux_q_cooldown_conflict_surfaced
  test_audit_db.py::test_json_roundtrips_and_schema
  test_mastery_per_question_reveal.py::test_reveal_needs_no_new_persistence
  test_phase4f_ranked_mastery_slice.py::test_format_for_creation_is_unaffected_by_this_module
all five pre-existing on origin/master; none repaired here.
```

**The counts reconcile exactly.** 2457 + 93 (the new file) + 6 (five parametrised isolation cases
for the new contract module, plus the exemption test) = 2556; + 7 = **2563**, the seven
committed-footprint guards that skip on a detached base and run once a branch has a commit — the
same mechanical skip delta every earlier GR1 phase recorded. They run, and they pass.

**Ranked / Mastery integration arm** (`test_ranked_mastery_applied_chain`,
`test_ranked_mastery_artifact_persistence`, `test_ranked_mastery_on_demand`,
`test_ranked_mastery_reveal_e2e`, `test_ranked_mastery_reveal_secrecy`,
`test_mastery_ranked_capsule`, `test_mastery_artifact`, `test_mastery_integration`,
`test_ranked_prototype`, `test_mc1_static_content_retirement`): **2 failed, 233 passed on both
worktrees, identical** — both failures are `test_mastery_ranked_capsule`'s pinned capsule ids and
digests, pre-existing.

**Focused arm** (`test_setup_state_*`, `test_gr1_*`): before this commit's new file, the existing
setup_state + GR1 suites ran **1030 passed, 1 skipped** over the refactored `composition.py` — the
existing gate-aware and coverage policies are behaviourally unchanged.

No frontend test was run, because no frontend file changed.

---

## 16. Current cooldown-family limitations (diagnostic consumer only)

* **Per-state supply ≤ one question per learned ability.** That caps Snapshot hardest (28/164 at
  b=4) and caps Tight next.
* **Flat cooldowns collapse across the whole run.** Teemo: 2 semantic questions in 18 states; Ahri: Q
  and E flat, 10 in 18.
* **A pure level run is barren**: the family requires `ability_ranks`. The level source is fully
  trusted and 173/173; it simply states nothing this family reads.
* **The prompt-rank question is still open.** The state-aware prompt names haste, not rank, so rank
  moves at one haste collide at the gate (the one gate-limited Tight/Wide row in §8.1). Untouched.

None of these was fixed by bending the profile layer, and the profile layer does not know any of
them exists.

## 17. Future UI requirement — State Context UI (DOCUMENT ONLY)

Recorded owner requirement; **no frontend code was written.**

State-aware Champion questions should eventually use the existing high-quality Ranked Champion
visual language. A question's scenario context may show **Champion media, level, ability icon, item
icons, and rune/shard icons when applicable**. Desktop: **hover** a context icon. Mobile: **tap**.
For an item such as Malignance, hover/tap opens a compact **canonical item-information preview** —
item name, stats, relevant effect text, and potentially a path into the Mogzy item reference/wiki.
It must consume **the same canonical authority as the question** (the frozen state's display labels
and the canonical item store), never duplicated UI text. Working name: **State Context UI**.

## 18. Unresolved product decisions — deliberately left open

* whether cooldown prompts name the ability rank;
* which profile(s) enter Ranked, and the distribution/weights among them;
* user progression through profile types;
* whether Snapshot is free / practice / premium / other;
* exact visual design (State Context UI included);
* whether the 9 rank-bearing progression gaps are fixed now;
* **new:** how strongly checkpoint priority should concentrate broad-profile selections versus
  seed-driven replayability (§7);
* **new:** whether a product Slice that cannot fill its budget refuses, re-draws a different
  scope/seed, or ships fewer — the Lab refuses, which is right for a Lab and is a serving decision
  for a product.

## 19. Next phase options

Pick **one**; none is started.

1. **A second state-aware family** (base stats at level, resource cost, ratio) — the single biggest
   lever on Snapshot and Tight, and the cleanest test that profiles are not cooldown-shaped.
2. **The prompt-rank content decision** — owner/product, not GR1; raises rank-progression supply.
3. **Profile distribution experiment** — Lab-only: sample profile × seed across the roster and
   measure feasibility and variety to inform which profiles Ranked could carry. Still no wiring.
4. **Persist a multi-state bundle on a served segment** — must still wait for something that can
   produce a state-aware segment for players.
5. **Close the 9 rank-bearing gaps** upstream (declared rank-availability rules; identity ↔
   `champion_abilities` names).

**Explicitly not next:** Ranked wiring, a `mastery_slice` profile mode, Full, Matchup profiles,
level↔item timing, recommended builds/runes.

**Rollback:** `git revert c2634d8a`. Nothing persisted, no route, no migration, no frontend.
