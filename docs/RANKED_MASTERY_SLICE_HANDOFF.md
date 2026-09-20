# Ranked `mastery_slice` — Handoff

> **Read this first.** The full evidence is in
> [`docs/ranked-mastery-slice-current-state-audit.md`](./ranked-mastery-slice-current-state-audit.md)
> (GR1 Phase 1 — audit only) and
> [`docs/gr1-phase2-source-authority.md`](./gr1-phase2-source-authority.md)
> (GR1 Phase 2 — implementation) and
> [`docs/gr1-phase3-generator-quality.md`](./gr1-phase3-generator-quality.md)
> (GR1 Phase 3 — generator quality and composition) and
> [`docs/gr1-phase4-generated-artifact-persistence.md`](./gr1-phase4-generated-artifact-persistence.md)
> (GR1 Phase 4 — the durable generated-question lifecycle) and
> [`docs/gr1-phase5-admin-generator-lab.md`](./gr1-phase5-admin-generator-lab.md)
> (GR1 Phase 5 — the Admin Generator Lab) and
> [`docs/gr1-champion-mastery-product-readiness.md`](./gr1-champion-mastery-product-readiness.md)
> (GR1 Champion Mastery product readiness — implementation over the Champion Mastery audit) and
> [`docs/gr1-matchup-mastery-capability-audit.md`](./gr1-matchup-mastery-capability-audit.md)
> (GR1 Matchup Mastery capability audit — audit only) and
> [`docs/gr1-matchup-mastery-rank-fix.md`](./gr1-matchup-mastery-rank-fix.md)
> (GR1 Matchup rank identity — implementation over that audit) and
> [`docs/gr1-matchup-mastery-rank-diversity.md`](./gr1-matchup-mastery-rank-diversity.md)
> (GR1 Matchup rank diversity — the seed picks which rank is asked) and
> [`docs/gr1-matchup-mastery-tie-policy.md`](./gr1-matchup-mastery-tie-policy.md)
> (GR1 Matchup tie policy — **design and measurement only, nothing implemented**) and
> [`docs/gr1-reusable-state-architecture-audit.md`](./gr1-reusable-state-architecture-audit.md)
> (GR1 reusable state architecture — **audit only**; its §0 reports a post-GR1 upstream change
> that halved the Champion Mastery corpus) and
> [`docs/gr1-reusable-state-architecture-design.md`](./gr1-reusable-state-architecture-design.md)
> (GR1 reusable state architecture — **design, revision 2 (2026-09-19): four owner-approved constraints, Phase 1 seam proposed**) and
> [`docs/gr1-reusable-state-phase1.md`](./gr1-reusable-state-phase1.md)
> (GR1 reusable state **Phase 1 — inert foundation, MERGED to `master`, NOT wired**) and
> [`docs/gr1-reusable-state-phase2.md`](./gr1-reusable-state-phase2.md)
> (GR1 reusable state **Phase 2 — resolution and derivation. `StateTemplate → ResolvedState`
> works; merged to `master`, and still not wired into anything a player can reach**) and
> [`docs/gr1-reusable-state-phase3.md`](./gr1-reusable-state-phase3.md)
> (GR1 reusable state **Phase 3 — the FIRST state-aware question path. The whole seam runs,
> in the Admin Generator Lab only, behind a flag that is off; committed, NOT pushed**) and
> [`docs/gr1-reusable-state-phase4-design.md`](./gr1-reusable-state-phase4-design.md)
> (GR1 reusable state **Phase 4 — DESIGN ONLY: durable frozen state, the state-sequence model,
> coherent Slice windows, Full, and where states come from. Direction APPROVED; the sequence and
> source proposals remain provisional. Records two measured defects on `master`**) and
> [`docs/gr1-reusable-state-phase4a.md`](./gr1-reusable-state-phase4a.md)
> (GR1 reusable state **Phase 4A — the frozen block repaired and readable. `derived_used` went
> 0/162 → 162/162; INTEGRATED and PUSHED as `8227e4a3`; still persists nothing**) and
> [`docs/gr1-reusable-state-phase4b.md`](./gr1-reusable-state-phase4b.md)
> (GR1 reusable state **Phase 4B — the frozen block made DURABLE. The write/read seam into
> `segment_private_json`, an answer-free review projection, zero DDL; backend **`dcfe8e2e`**
> INTEGRATED AND PUSHED to `origin/master`; no production caller writes a block yet**) and
> [`docs/gr1-reusable-state-sequence-window.md`](./gr1-reusable-state-sequence-window.md)
> (GR1 reusable state **sequence/window phase — ordered `StateNode`s, derived transitions,
> `StateWindow`, one deterministic window policy and the source CONTRACT with no production source.
> Pure contract code, INTEGRATED and PUSHED (`origin/master` `6073e035`); wired into nothing**).
> Do not paste any of them into a new session; start here and open them for detail.
>
> **⚠️ These docs are UNTRACKED and were swept once already.** On 2026-09-13 a concurrent
> session realigned the shared `mogsy` checkout and the whole untracked GR1 doc set
> disappeared. It was preserved, not lost — commit **`99b34257`** on branch
> `safety/shared-checkout-preclean-20260913` holds every one of them, including
> `docs/audits/`. They were restored from there. If they vanish again, restore with
> `git show 99b34257:docs/<file> > docs/<file>`. Committing the set is still an owner call
> (open item 11 below), and it is now overdue.

## Where this workstream is

| Phase | Status |
|---|---|
| **GR1 Phase 1 — current-state audit** | Complete. Audit only; nothing implemented. |
| **GR1 Phase 2 — source authority and integrity** | **COMPLETE and ON `master`.** The owner merged it; `origin/master` contains `77bae306`. |
| **GR1 Phase 3 — generator quality and composition** | **COMPLETE and ON `master`.** The owner merged it; `origin/master` contained `b499d80f`. |
| **GR1 Phase 4 — durable generated-question lifecycle** | **COMPLETE and verified.** Branch `gr1/phase4-artifact-persistence` @ **`ed254ca6`**, base `b499d80f`. Served-artifact contract, historical immutability, `quiz_attempts` integration and review provenance. **Not yet on `master`** — one owner action remains (below). |
| **GR1 Phase 5 — the Admin Generator Lab** | **COMPLETE and verified.** Backend branch `gr1/phase5-admin-generator-lab` @ **`31c0bbe8`**, base `ed254ca6`. Frontend branch `gr1/phase5-admin-generator-lab` @ **`ec9c8bbd`**, base `147c9996`. Admin can run all three production generators, see what a player would see, read the provenance and reproduce a slice from its seed. **Neither branch is pushed** — both targets auto-deploy. |
| **GR1 Champion Mastery readiness** | **NOW MERGED IN BOTH REPOS.** Backend landed as **`36cfef96`** (ancestor of `origin/master`); frontend **`84aaf5a1`** is an ancestor of `origin/main`. The "neither is pushed" note further down is superseded. |
| **GR1 Matchup Mastery capability audit** | **COMPLETE, 2026-09-13. Audit only — nothing implemented.** Bases: backend `origin/master` **`c4f08761`**, frontend `origin/main` **`33d27b2f`**. See [`gr1-matchup-mastery-capability-audit.md`](./gr1-matchup-mastery-capability-audit.md) and the summary below. |
| **GR1 Matchup rank identity** | **COMPLETE and verified, 2026-09-13.** Blockers 1, 2, 4 and 5 of that audit. Backend branch `gr1/matchup-rank-identity` @ **`52f5564a`** (base `c4f08761`), frontend @ **`756b6b41`** (base `3ce50045`) — one commit each, both clean fast-forwards. **Neither pushed** (both targets auto-deploy). See [`gr1-matchup-mastery-rank-fix.md`](./gr1-matchup-mastery-rank-fix.md) and the summary below. |
| **GR1 Matchup rank diversity** | **COMPLETE and MERGED.** `origin/master` contains **`825e2db2`** — the seed now chooses which rank a comparison is asked at. See [`gr1-matchup-mastery-rank-diversity.md`](./gr1-matchup-mastery-rank-diversity.md). |
| **GR1 Matchup tie policy — design** | **DESIGN + MEASUREMENT COMPLETE, 2026-09-13. Superseded by the implementation row below.** Audited backend `origin/master` **`825e2db2`**; frontend `origin/main` **`756b6b41`** read only. Four policies simulated in a throwaway probe layer over **45,144 real generated slices**. Recommendation: **tie deprioritization + a per-slice tie cap; do NOT adopt metric-level suppression.** See [`gr1-matchup-mastery-tie-policy.md`](./gr1-matchup-mastery-tie-policy.md) and the summary below. |
| **GR1 Matchup tie policy — implementation** | **COMPLETE and verified, 2026-09-13.** The approved hybrid — tie deprioritization + a per-slice cap of `max(1, n // 4)` — on branch `gr1/matchup-tie-policy` @ **`afb55d1e`**, base `origin/master` **`087f9a78`**. One commit, clean fast-forward. **NOW INTEGRATED** — `origin/master` is **`16db3690`** and `git diff afb55d1e 16db3690` is one documentation file. **No frontend change.** See [`gr1-matchup-mastery-tie-policy-implementation.md`](./gr1-matchup-mastery-tie-policy-implementation.md) and the summary below. |
| **GR1 Matchup Mastery structural audit** | **COMPLETE, 2026-09-13. AUDIT ONLY — nothing implemented, nothing pushed.** Audited backend `origin/master` **`16db3690`** (which contains the tie policy: `git diff afb55d1e 16db3690` is one doc file), frontend `origin/main` **`756b6b41`** read only, docs base `origin/gr1/docs-snapshot` **`decc49b6`**. Full structural picture of what Matchup generates, what it holds, what dominates, and what the owner may eventually have to decide. See [`gr1-matchup-mastery-structural-audit.md`](./gr1-matchup-mastery-structural-audit.md) and the summary below. |
| **GR1 reusable state architecture audit** | **COMPLETE, 2026-09-19. AUDIT ONLY — nothing implemented.** Backend `origin/master` **`fc2e8be9`**, frontend `origin/main` **`4c29f7ba`** (both fast-forwards of the brief's `2387e8f5` / `791027de`). How close the architecture is to "questions consume a reusable, data-driven state", and to one universe feeding FULL and SLICE composers. **§0 is a regression report:** upstream `b7ccf8e0` (qca8) removed `MASTERY` from the `champion_stat_level` / `champion_stat_compare` modes. See [`gr1-reusable-state-architecture-audit.md`](./gr1-reusable-state-architecture-audit.md) and the summary below. |
| **GR1 × QCA8 Mastery eligibility correction** | **CORRECTED, 2026-09-19. Committed, NOT pushed.** Intent audit [`gr1-qca8-mastery-eligibility-intent-audit.md`](./gr1-qca8-mastery-eligibility-intent-audit.md) classified the QCA8 (`b7ccf8e0`) loss of `MASTERY` on `champion_stat_level` / `champion_stat_compare` as collateral. Backend branch `gr1/qca8-mastery-compat` @ **`5769dee3`**, base `origin/master` **`5c15cb5d`**, one commit. See the section below. |
| **GR1 reusable state architecture — design** | **DESIGN PROPOSAL, 2026-09-19. Nothing implemented.** Backend read at `origin/master` **`b1fd3510`** (one items-only fast-forward past the brief's `5769dee3`; no `mastery/`, `quiz/` or `ranked_modules/` change), docs base `origin/main` **`3c9ddfc4`**. StateTemplate / ResolvedState / FrozenStateArtifact for **setup** state, the matchup composition, the source abstraction, the pipeline, Full/Slice over one universe, identity under state, fail-closed rules. **17 owner decisions (§16) pending.** See [`gr1-reusable-state-architecture-design.md`](./gr1-reusable-state-architecture-design.md) and the summary below. |
| **GR1 reusable state architecture — design revision 2** | **DESIGN ONLY, 2026-09-19. Nothing implemented.** Backend read at `origin/master` **`b1fd3510`** (unchanged), docs base `origin/main` **`2ba820e1`**. Four owner-approved corrections: **no architectural level-18 cap** (capability ≠ rules ≠ derivation support), **independent matchup sides** (symmetric-only is generator policy), **replaceable setup sources** (no recommended-build authority exists), **historical patch = capability** (generic basis id; unavailable → refuse). Defines the smallest **Phase 1 seam** (inert `mastery/setup_state/` package, no callers, no I/O). See the section below. |
| **GR1 reusable state — Phase 1 (inert foundation)** | **IMPLEMENTED AND MERGED, 2026-09-19. NOT wired.** `origin/master` contains **`88c9f7a0`** (rebased from `d9db54cb` onto `cf1d2db2`; upstream moved two items-only commits with zero file overlap), one commit. New package `mastery/setup_state/` (contracts, identity, structural validation, errors) with **no importer outside its own tests** (AST-enforced). Empty `ScenarioBinding` reproduces every existing fact, candidate and comparison id/digest byte-for-byte (fixtures + roster probe 173/173). See [`gr1-reusable-state-phase1.md`](./gr1-reusable-state-phase1.md) and the section below. |
| **GR1 reusable state — Phase 2 (resolution + derivation)** | **IMPLEMENTED AND MERGED, 2026-09-19. Wired for the first time by Phase 3, in the Lab only.** `origin/master` contains **`89b5ce4b`** (implemented as `35e08c11` on `88c9f7a0`, rebased onto `57016334` — one upstream items-only commit, zero file overlap); worktree `~/lcs-wt-gr1-state2`, one commit, **14 files all inside `mastery/setup_state/` or `mastery/tests/`**. Six new modules: a **data-basis resolver** (one available basis, named concretely; a pinned historical one is refused, never served from current data), a **rules authority** (legality as data; the per-champion rank domain is READ from `champion_state.ability_rank_ceiling`, and an undeclared special availability rule refuses rather than falling back to the 5/3 rule that is wrong for six champions), **setup sources** (one curated source, selectable by name and NOT the default; source-blind identity), **canonical normalization** (unknown references fail closed), a **derivation authority** (level-scaled stats read from Mastery's OWN fact layer, so they cannot drift; **no silent zero** — AP 0 is a supported zero, an unsupported value carries no number, a manaless resource pool is `not_applicable`), and the **pipeline** with pure matchup resolution. Two tested contract corrections: `resolved_state_digest` no longer hashes `rules_rev`/`derivation_version`, and a template axis may say `INTRINSIC`. Roster-wide: **173/173** resolve, **692/692** states fully derived on the core axes, 0 failures, 0 silent-zero cases, 60/60 matchups reversal-identical. `mastery/tests` failure **set** identical to the base. See [`gr1-reusable-state-phase2.md`](./gr1-reusable-state-phase2.md) and the section below. |
| **GR1 reusable state — Phase 3 (the first state-aware question path)** | **IMPLEMENTED AND INTEGRATED, 2026-09-19. PUSHED to both repos. Admin Generator Lab only.** Backend: `origin/master` contains **`22a1c7d9`** (base `ca3d7333`; implemented on `295fd58f` and rebased over 3 item-runtime commits with **zero file overlap** — at integration master had not moved, so no second rebase was needed), worktree `~/lcs-wt-gr1-state3`. Frontend: `origin/main` contains **`8f949824`** (pre-rebase `bd4b78e8`; implemented on `b901ea0e` and rebased onto **`ce3f49be`** over 3 RFX1 commits — Ranked asset derivatives and the entry intro — with **zero file overlap**), worktree `~/mogsy-wt-gr1-state3`. The seam runs end to end: `StateTemplate → ResolvedState → state-aware candidates → the EXISTING composition, publication gate and Mastery presentation → a Lab preview`. One family — **champion ability cooldown under resolved ability haste** — and it unlocks nothing: it names `quiz.family_contract`'s already-CERTIFIED, Mastery-eligible **`combat_cooldown`**, goes through the same gate as an intrinsic candidate, and honours that family's own `static_cooldown` exclusion. The resolver seam is one optional `universe=` on `resolve_with_universe`/`publish`, and supplying the pool the resolver would have rebuilt gives a **byte-identical** snapshot. **Nothing a player can reach is wired**: `mastery_slice` has no state-aware mode, so no saved Ranked format can name one, and the single serving-side importer is one admin-gated route behind `GR1_STATE_AWARE_LAB_ENABLED`, off by default. **Current behaviour proven unmoved byte-for-byte** across two worktrees (887 candidates, 303 comparisons both orders, 12 published artifacts, 16 slice preview/coverage payloads — identical 1.7 MB dumps). Roster-wide: 165/173 champions, 2,356 candidates, **0 answer mismatches**, 589/589 identity equality at equal haste and 589/589 difference at different haste. See [`gr1-reusable-state-phase3.md`](./gr1-reusable-state-phase3.md) and the section below. |
| **GR1 reusable state — Phase 4 (design)** | **DESIGN ONLY, 2026-09-19. NOTHING IMPLEMENTED, nothing pushed.** Backend audited at `origin/master` **`e9bdf537`** (two item-runtime commits past Phase 3's `22a1c7d9`, zero `mastery/` overlap); docs base `origin/main` **`fe0804c3`**. Answers the five brief questions: how a served question freezes its exact state, what a `FrozenStateArtifact` contains, how a Slice picks a coherent window instead of unrelated states, how Full walks the same sequence without a second question system, and where states come from when nobody types one. **Recommends a slice-level `FrozenStateBundle` in a new `mastery_state` key of `segment_private_json` (sibling to `mastery_artifact`, never public, ZERO DDL)**, a `StateSequence` of templates with derived transitions, window-first Slice composition, Full as the same pipeline with no budget, `rule.haste_ladder.v1` as the first state source, and **Champion Mastery as the first consumer**. **Two measured defects recorded, not fixed:** `derived_used` is empty on every frozen block master can produce (a `used_metrics` shape mismatch, fail-open and untested), and item display names are never frozen so a historical state cannot be read without re-reading `item_canonical`. **14 proposed decisions (§13.2) await the owner.** See [`gr1-reusable-state-phase4-design.md`](./gr1-reusable-state-phase4-design.md) and the section below. |
| **GR1 reusable state — Phase 4A (the frozen block)** | **INTEGRATED, PUSHED AND LIVE ON `origin/master`, 2026-09-20. Still persists nothing.** Backend **`8227e4a3`** (pre-rebase `96f16a08`) on `gr1/setup-state-phase4a`, integration base `origin/master` **`91fd0cc5`** (implementation base **`d90fd45b`**) (two item-runtime commits past the design's `e9bdf537`, zero `mastery/` overlap), worktree `~/lcs-wt-gr1-state4a`. One commit, 10 files, all inside `mastery/setup_state/` or `mastery/tests/`. **The defect is fixed and measured: frozen blocks carrying a derived value went 0/162 → 162/162 roster-wide** (1,028 values), with the same 11 fail-closed refusals on both arms. The fix is the SHAPE, not the call site — `check_used_metrics` refuses a flat sequence, a side-count mismatch, and a declared metric the state does not carry. The block also gained `display_labels` (captured at normalization, where `resolve_item` already returns the name, so no extra query and no chance of reading a different row), the resolver/derivation versions and warnings the digest deliberately excludes, and per-step `state_index`/`family_id`/`answer_metric`/`candidate_id`/`content_digest`. `FrozenStateBundle` holds ordered self-contained states and refuses a mixed basis. **First deserializers in the package besides `StateTemplate`'s**, plus `verify_frozen_bundle`, which reads nothing but the block (a test monkeypatches `sqlite3.connect` to raise), reports the digest as unverifiable-by-design rather than silently passing it, and never repairs. **Nothing moved:** two-worktree probe over 20 banks, 7 pairs both orders and 8 published artifacts gave IDENTICAL 1,030,247-byte dumps; `mastery/tests` failure SET byte-identical to base. See [`gr1-reusable-state-phase4a.md`](./gr1-reusable-state-phase4a.md) and the section below. |
| **GR1 reusable state — Phase 4B (persistence)** | **INTEGRATED AND PUSHED TO `origin/master`, 2026-09-20. ZERO DDL, and in fact zero writes.** Backend **`dcfe8e2e`** (pre-rebase `906e72c2`) on `gr1/setup-state-phase4b`, implementation base `origin/master` **`8227e4a3`** (which IS Phase 4A), integration base **`92be472e`** (one item-runtime commit later, zero `mastery/` overlap; the patch is byte-identical across the rebase), worktree `~/lcs-wt-gr1-state4b`; comparison base `~/lcs-wt-gr1-4b-base` @ `8227e4a3`. Docs base `origin/main` **`84de68ef`**. One commit, **7 files, all inside `mastery/`** — 3 new, 4 modified; no route, no generator, no Ranked module, no frontend, no migration. **This is the design's Phase 4C delivered as 4B** (the owner sequenced persistence ahead of the sequence contract), minus attempt provenance and minus the review wiring, both deliberately. **The seam is split along the isolation boundary rather than across it:** `mastery/setup_state/persistence.py` is the TYPED half (verify → serialise → parse → verify → project) and is declared in the isolation guard's **CONTRACT** list, so "reading a frozen block cannot reach a database" is mechanically enforced; `mastery/serving/state.py` is the PLAIN half and imports nothing but `typing`, so **no serving module names `setup_state` and that pinned one-file boundary is unwidened**. It is a NEW file rather than an edit to `mastery/serving/artifact.py`, which stays byte-identical. **Write fails closed** — a bundle that cannot verify is never stored, and a caller that supplied one either gets it persisted or gets an exception. **Read never repairs and never re-resolves** — corrupt, tampered, truncated and future-versioned blocks all raise, with `sqlite3.connect` made to throw to prove the refusal never becomes a lookup. **Answer safety is proved, not promised:** the block holds the answer as a number under the bare key `value`, which `answer_safety` does **not** carry (asserted), so the block is safe by placement and by never being projected whole — and `state_review_view` is a positive allow-list that omits `derived_used` entirely, making it answer-free by construction rather than by being gated. **Nothing writes a block**: `generate_segment` is untouched and a test scans the tracked file list for a production importer and asserts there is none. `mastery/tests` failure **SET** byte-identical to base (5 failed, 2108 → **2179** passed; the +71 reconciles exactly); 6 Ranked-Mastery integration files identical on both arms. Read-only probe: **16 real state-aware artifacts** round-tripped through a real `TEXT` column — 0 mismatches, 0 findings, **0 answer leaks**. See [`gr1-reusable-state-phase4b.md`](./gr1-reusable-state-phase4b.md) and the section below. |
| **GR1 reusable state — sequence + window mechanics** | **IMPLEMENTED, INTEGRATED AND PUSHED, 2026-09-20. Pure contract code; wired into nothing.** Backend **`6073e035`** (rebase of `3a202eb9`) on `gr1/reusable-state-sequence-window`, base `origin/master` **`09d58a98`** (zero file overlap across the 5 intervening commits), worktree `~/lcs-wt-gr1-seq`; **`origin/master` is now `6073e035`.** Docs base `origin/main` **`7bc6581b`**, docs commit *(this commit; a commit cannot embed its own SHA — read it with `git log`)*, worktree `~/mogsy-wt-gr1-seq`. **9 files, all inside `mastery/`** — 4 new, 5 modified; no route, no generator, no Ranked module, no frontend, no migration, no DDL. Three new modules in the isolation guard's **CONTRACT** half, so the sequence layer provably reads no data and carries no game-rule number (integer literals restricted to `{0,1,2}`, no float, no QWER letter): **`sequence.py`** (a `StateNode` holds a TEMPLATE — never a resolved state, never a question; ordered dense ordinals; identity is the template's SPECIFIED axes with `template_ref`, label, `setup_source` and basis excluded; a sequence refuses a mixed kind, champion set, ruleset or basis, and adjacent nodes need not differ at all), **transitions DERIVED by diffing adjacent templates over the existing CLOSED axis vocabulary** with side association kept (`SideChange` names its champion) and absence explicit (`absent_before` — unspecified is not zero), a supplied-but-wrong transition set refused; **`window.py`** (`StateWindow` is contiguous, inclusive, fail-closed on every out-of-range span, valid at one node, and carries **no question selection** — `max_nodes` is a STATE count), plus ONE deterministic testing policy `window.contiguous_seeded.v1` that positions the span by a `content_hash` offset over every legal start (so it does **not** bias to the first state) and supports a containment `anchor`; **`sequence_source.py`** (the replaceable `StateSequenceSource` Protocol, `LiteralSequenceSource`, and **`default_sequence_registry()` is EMPTY — asserted**, so `rule.haste_ladder.v1` is unregistered and no production caller can obtain a sequence). **One side permutation governs the whole run** rather than per-node canonicalization, which is what keeps a MIRROR matchup's sides attached to their own progressions. Identity: one material, two encodings — readable `sseq.v1:` key and the design's compact `sseq_` digest — plus `strans_` per transition and `swin_` per window composition (seed included only when the policy declares it material; **no candidate id, because no question exists at this layer**). The resolution seam `resolve_window_states` is **PREPARED and unwired**: each node resolves independently through the existing `resolve_state`, a refusal names the node, and there is no partial result. Generator Lab: **backend JSON `window.diagnostic()` only, no new endpoint** — the Lab router's route set is pinned by exact set equality and widening it for an inspection a pure function provides was the wrong trade. `mastery/tests` failure **SET** byte-identical to base (5 failed, 2179 → **2266** passed; +87 reconciles exactly as 72 new tests + 15 new parametrised isolation cases); 9 Ranked/Mastery-slice integration files **269 passed on both arms**. One existing test edited on purpose: Phase 4B's "no sequence exists yet" scope guard, narrowed to "the sequence layer arrived and persistence gained nothing from it". See [`gr1-reusable-state-sequence-window.md`](./gr1-reusable-state-sequence-window.md) and the section below. |
| GR1 Phase 6+ | Not started. Public Ranked rotation and the rollout decision are still untouched. Difficulty as a composition input, and the Applied-chain generalization decision, remain the open generator items. |

## GR1 × QCA8 — accidental Mastery mode regression, CORRECTED (2026-09-19)

**What happened.** Upstream QCA8 (`b7ccf8e0`, 2026-09-14) moved `champion_stat_level` and
`champion_stat_compare` to runtime composition with zero stored rows, and in the same line
narrowed their modes from `practice, daily, ranked, mastery` to `practice` — one rationale
("Practice is the only surface with a runtime consumer") written for six families. That premise is
about *row* consumers. The Mastery publication gate reads the family **declaration**, not rows, so
the narrowing silently took out Champion Mastery's level-stat category and Matchup Mastery's
base-stat comparisons. No test pinned Mastery eligibility, so nothing failed.

**Narrow correction.** Backend `5769dee3` on `gr1/qca8-mastery-compat` (base `5c15cb5d`):
`quiz/family_contract.py` — both families `modes=(PRACTICE,)` → `modes=(PRACTICE, MASTERY)`, and the
`_QCA8_STAT` note rewritten to say why. QCA4/QCA8 contract tests updated to the new tuple. New
`mastery/tests/test_gr1_qca8_stat_family_mastery_eligibility.py` pins: exact modes, exclusion from
DAILY / RANKED / TIME_TRIAL (both `eligible_family_ids` and `families_for_mode`), the Mastery gate
admitting both, the bank/composer hints still naming them, RUNTIME architecture intact, and zero
stored rows in the canonical DB. No change to Mastery, composition, tie policy, wording,
`runtime_casual`, `champion_stat_authority`, Ranked `shared_bank`, Time Trial, frontend or migrations.

**Restored behaviour** (canonical `lol_calc.db`, 5.7 GB, `mode=ro`; same probe as the intent audit):

| | before fix (`5c15cb5d`) | after fix (`5769dee3`) | pre-QCA8 (`23d0f688`) |
|---|---|---|---|
| Champion Mastery gate-eligible, 173 champions | 3,238 | **6,787** | 6,787 |
| · `champion_stat_level` | 0 | **3,549** | 3,549 |
| Matchup `champion_stat_compare`, 249 pairs | 0 | **2,183** | 2,183 |
| · `ability_cooldown_compare` | 1,908 | 1,908 | 1,908 |
| Pairs with zero eligible comparisons | 109 | **0** | 0 |

All 109 previously empty pairs (108 involving aphelios/elise/jayce/nidalee/udyr, plus
`reksai|shyvana`) regained base-stat comparisons.

**QCA8 architecture preserved.** Both families remain RUNTIME, composed by `quiz.runtime_casual`
from `quiz.champion_stat_authority`; stored `quiz_questions` rows for both = **0**; no QCA8 code
reverted. DAILY, RANKED and TIME_TRIAL remain excluded. Whether Mastery should keep following
`family_contract` modes or own its eligibility is still reusable-state audit §13 Q1 (owner).

## Commits

| Repo | Phase 1 audit SHA | Phase 2 | Phase 3 |
|---|---|---|---|
| Backend `League_Combat_Simulator` — `origin/master` auto-deploys to prod | `11c96ab0` | branch `gr1/phase2-source-authority` @ `77bae306`, **now on `master`** | base `db709873`; branch `gr1/phase3-generator-quality` @ **`b499d80f`** — **pushed to `origin`**, one commit, fast-forward onto `master` |
| Frontend `mogsy` — `origin/main`, Lovable publishes from it | `7d7de643` | docs only | **docs only — no code changed** |

**Phase 4:** backend branch `gr1/phase4-artifact-persistence` @ **`ed254ca6`**, base `b499d80f` (which IS `origin/master`). Frontend: **docs only — no code changed.** It is now on `origin/master`.

**Phase 5:** backend branch `gr1/phase5-admin-generator-lab` @ **`31c0bbe8`**, base **`ed254ca6`**
(which IS `origin/master`) — one commit, clean fast-forward. Frontend branch
`gr1/phase5-admin-generator-lab` @ **`ec9c8bbd`**, base **`147c9996`** (which IS `origin/main`)
— one commit, clean fast-forward, and the **first frontend code** any GR1 phase has produced.
Upstream moved **zero** commits in either repo during the phase, so no reconciliation was
required and none was performed. **Neither branch is pushed:** `origin/master` auto-deploys to
Railway and `origin/main` is what Lovable publishes from, so the push is an owner action.
Owner commands:

```bash
# backend
git -C <backend> push origin gr1/phase5-admin-generator-lab:master
# frontend — then press Publish in Lovable, which a push alone does NOT do
git -C <frontend> push origin gr1/phase5-admin-generator-lab:main
```

**Phase 4 reconciled against `origin/master` @ `27610924` (2026-09-12).** Upstream moved **five** commits during the phase — JQ1's activation record and Patch Ops Batch 7 (item stack automation). **Zero file overlap** with GR1's twelve changed files: upstream touched `knowledge_engine/apply/*`, `item_*`, `stat_modifier_engine.py` and four docs. The branch was rebased onto them anyway and the suites re-run afterwards: **3 failed, 1782 passed** across `mastery/tests` + the 5 Ranked-Mastery integration files + the 3 fast QR1 attempt suites — the same three pre-existing failures, zero introduced. Clean fast-forward (`HEAD~1 == origin/master`).

**Overlap check with QR1 (the other attempt/persistence workstream): none.** QR1's `quiz_attempts` v2 rebuild is already on `master` and Phase 4 does not modify it, its migration, or its schema. The one QR1 file Phase 4 touches is `services/attempt_recorder.py`, and the change is a single parameter with a default that leaves every existing caller byte-identical.

**Phase 3 reconciled against `origin/master` @ `db709873` (2026-09-12).** Upstream
moved **ten** commits since the Phase 3 base — all of them JQ1's Jungle Systems
question generator. **Zero file overlap** with GR1's nine changed files. The branch
was rebased onto them anyway and every suite re-run: `mastery/tests` failure set
unchanged, and the composition probe's output is **byte-identical** before and
after the rebase, so JQ1's `quiz/family_contract.py` edits do not reach Mastery
eligibility. Clean fast-forward.

**Reconciled against `origin/master` @ `705cdefe` (2026-09-12).** Upstream moved **zero** commits
since the Phase 2 base: `origin/master` *is* `705cdefe`. There was no concurrent work on Mastery
generation, Mastery provenance, Ranked `mastery_slice`, source authority or their guards, so no
reconciliation was needed and the branch is a clean **fast-forward** — `HEAD~2 == origin/master`.
No rebase was performed because none was required.

Upstream moved exactly one commit in each repo between the phases, and neither touches Mastery
generation authority (backend `705cdefe` is QR1's `quiz_attempts` rebuild — out of scope here;
frontend `147c9996` is the RIV2 summoner-spell card extraction).

**Both primary checkouts are STILL stale AND dirty and must not be read as current:**
backend on `live1/phase4b1-match-context` @ `28bf2ee4`; frontend on `main` @ `e12f5900`.
Both phases used fresh worktrees. Do the same.

## Current architecture (one paragraph)

`mastery_slice.v1` is a **runtime carrier**, not content. When a segment opens it runs the generator
named by `module_config.mastery_mode`, freezes the questions onto `ranked_rounds`, and renders them
in the Ranked arena. Grading delegates to the single Mastery grader over the frozen payload; replay
never re-publishes. The static Mastery Set catalog is **deleted** (MC1); old ids are decoded once on
the stored-config read path.

Since GR1 Phase 2, generation is **preceded by a source preflight**, **salted by the match's own
seed**, and **stamped with the patch it was generated from**. A source that cannot be read now
refuses the segment instead of quietly producing a different one.

Since GR1 Phase 4, a segment additionally freezes **what it was generated FROM** — a
`mastery_artifact` block in the private payload naming the generator, its version, the
normalised config, the salt, the source artifact and the patch — and every challenge a real
account answers becomes one ordinary `quiz_attempts` row (`source='ranked_mastery'`, no XP).
Zero DDL: the round row was already an immutable write-once document, and `quiz_attempts` v2
was already built for a question with no stored row.

Since GR1 Phase 3, **candidate generation and slice composition are separate responsibilities and
the split is enforced**: candidate generation decides what is VALID (unchanged), composition decides
what subset is a useful sequence, and `mastery/synthesis/invariants.py` states once — over finished
steps, for all three generators — what makes any of it a usable question.

## Current generator types — exactly three

| Mode | Generator | Coverage | Notes |
|---|---|---|---|
| `champion` | `mastery.synthesis.service.synthesize_champion_mastery` | **173/173** champions, 6,690 questions | Goes through the publication gate. Since P3: round-robin allocation over the categories the pool has, one block per role |
| `matchup` | `…synthesize_matchup_mastery` | **14,878** pairs | Order-independent; universe = comparisons **+ both atomic banks**. Since P3: comparisons lead the sequence as well as the budget |
| `applied_chain` | `mastery.synthesis.applied_chain…` | 3 attacker abilities × 6 targets, **≤14 q each** (was 17) | **No publication gate**, `is_prototype=True`, level-11 scenario. Since P3: items collapsed by derived mechanic; prompt states the item's bonus AD |

Champion + Matchup are **one pipeline**. Applied-chain is architecturally separate.

## Important decisions / facts

1. **Public Ranked serves none of them.** No built-in format (`ranked_points_v2`, `ranked_modern`,
   `ranked_legacy_quiz`) names `mastery_slice`.
2. **The only saved format in the DB is a Mastery Slice**, and it is still written in the **retired**
   `mastery_set_id: chain.jarvan.physical_penetration` spelling. It works only via
   `ranked_formats/retired_mastery_sets.py`, which decodes it to applied-chain (Jarvan Q vs Olaf, n=2).
   All 29 rows are `target='admin_bot'`; **zero** `target='public'`.
   ⇒ The registry comment saying `mastery_slice` is "UNREACHABLE" is **wrong for stored configs**.
3. ~~**The cooldown JSON is load-bearing and fails OPEN.**~~ **FIXED in Phase 2.** It now **fails
   closed** (`CooldownAuthorityUnavailable` → `SourceIntegrityError` →
   `RANKED_MODULE_DATA_UNAVAILABLE`), reports its own provenance (content SHA-256, revision span,
   declared source hash) and is **mechanically verified** against `champion_abilities` by
   `mastery/facts/integrity.py`. It was NOT deleted, and the reason is measured: the value of record
   was always the DB column — the artifact *arbitrates* it — and its irreducible content is the
   **cooldown SHAPE**, which no column expresses and which holds 26 abilities out of the cooldown
   families. It is also not hand-written: `scripts/dc1_ability_semantic_audit.py` generates it via
   the approved wiki parser. `cooldown_is_static` agrees 688/688, so staticness *is* fully
   DB-supplied.
4. ~~**Applied-chain patch identity is a hardcoded Python literal.**~~ **FIXED in Phase 2.** All
   three modes now stamp the label from the canonical `league_patches` catalog
   (`mastery/provenance/canonical_patch.py`) — `"League 26.16"` today, `""` or "26.13" before.
   Identity is unaffected: `game_patch_display` is excluded from `patch_key_digest` by
   construction, verified byte-identical at runtime. The literal still exists because its
   **machine** fields are the certified-adapter registration key.
5. ~~**Certified Python champion data disagrees with the canonical DB.**~~ **RESOLVED in Phase 2 —
   no value was changed, and no owner ruling was needed.** Production (read-only, via its own public
   docs API) agrees with the certified Python on **all five** disputed values, plus a sixth the
   tests never covered (Maokai Q). The local `lol_calc.db` is a pre-CHAMPDATA snapshot: every
   `champion_ability_formulas` row is the single `2026-05-31` spreadsheet import. The guard tests
   now assert through `mastery/provenance/certified_provenance.py`, which tells "the copy drifted" apart
   from "this store predates the correction". Full reconciliation table: Phase 2 doc §5.
6. ~~**Short slices are ~97% `ability_cooldown`.**~~ **FIXED in Phase 3.** It was worse than
   "the first three": *every* slice shorter than a champion's cooldown pool was 100% cooldown,
   because `recipe._plan` drained `CATEGORY_ORDER` greedily. Allocation is now a round-robin and
   one role's categories share one block so the resolver's existing interleaving can mix them.
   Roster-wide first-three cooldowns: **503/519 → 211/519**; a 3-question slice now spans all
   three categories a champion has, and the longest same-family run at n=8 is **≤2**.
   Correction to the old note: the "3,482 base-stat" candidates are **raw**. The publication gate
   rejects the whole of `champion_base_stat` for atomic recall as `family_unmapped`, roster-wide,
   so the servable atomic bank is three categories, not four. That is a serving-policy fact and
   Phase 3 did not touch it. `champion_base_stat` IS eligible as a **comparison**, which is why
   Matchup sees it and Champion does not.
7. ~~**`seed` is ignored.**~~ **FIXED in Phase 2.** The match's server-only `order_seed` (plus the
   segment number) is now a **selection salt** mixed into the candidate rotation the resolver
   already had — no new RNG, and no change to curriculum ordering or the category plan. Same seed ⇒
   same artifact; different seeds ⇒ different valid samples; `selection_salt=None` reproduces the
   pre-phase output byte for byte, so every preview/admin/test path is unchanged.
8. ~~**Nothing writes to `quiz_attempts`**, so Personal/Premium analytics can never see these
   questions.~~ **FIXED in Phase 4.** An answered challenge is now one ordinary `quiz_attempts`
   row — `question_id` NULL, `question_key` the round's own frozen `mastery:<concept_id>` ref,
   `source='ranked_mastery'`, with `choices_snapshot` / `source_version` / `provenance_json`
   populated. **Zero DDL**: the v2 table was built for exactly this case. Written from
   `submit_challenge`'s FIRST-WRITE branch, in the same `BEGIN IMMEDIATE` transaction as the
   submission, so a duplicate is structurally impossible rather than deduplicated afterwards.
   **No quiz XP, streak, category or achievement runs** (`apply_progress=False`) — Ranked pays
   Elo, and turning that on is owner decision 5 below.
9. ~~**Admin Quiz Review shows 0 of them.**~~ **Still true, and now CORRECT rather than a gap.**
   All 56 "mastery" rows there are Summoner Spell Mastery, and generated Mastery questions are
   deliberately NOT in that table: a `mastery_slice` question is virtual until a match serves
   it, and Quiz Review is a table of STORED questions with ids you can approve and publish.
   **Phase 5 built the Generated Questions surface instead** — `/admin/ranked/generator-lab`,
   the Mastery Generator Lab — and cross-linked the two in both directions so the distinction
   is visible rather than implied. Admin Quiz Review itself is untouched.
11. **A served generated question is now explainable, not just re-readable** (Phase 4). The
    segment's PRIVATE payload carries `mastery_artifact`: generator type, generator version,
    the normalised config, the subject key, the selection salt (server-only), the source
    artifact's `mastery_set_id`/`artifact_digest`/`patch_key_digest`, and the patch label. Four
    identity levels, none conflated — `generator_type` → `mastery:<concept_id>` →
    `artifact_instance_id` → `quiz_attempts.id`. **Absent means unknown**: every segment frozen
    before Phase 4 has no block and every reader treats `None` as "predates the contract".
12. **`generator_version` is provenance, never a dispatch key.** History is reconstructed from
    the persisted content, never by rerunning an old generator. Nothing reads it and
    re-dispatches, and nothing ever should. Phase 5 DISPLAYS it and still does not dispatch on it.
13. **NEW (Phase 5) — there is exactly one per-challenge renderer, and both surfaces use it.**
    `MasterySliceChallengeSurface` was lifted out of `masterySliceModule.tsx`; the arena and the
    Generator Lab both render through it. A second renderer built to "look like" the arena is
    the specific mistake this phase existed to avoid, and the reuse is what makes "is this
    exactly what a player would see?" answerable by identity. Do not fork it.
14. **NEW (Phase 5) — `seed` is an ADMIN INPUT on the preview path, and omitting it is not
    "seed zero".** No seed reproduces the pre-Phase-5 fixed preview byte for byte, which is
    what keeps the Format Builder's existing preview panel unchanged. There is still exactly
    one salt derivation (`MasterySliceModule._selection_salt`) and exactly one RNG path.
15. **NEW (Phase 5) — a coverage count and a generated slice read the SAME candidate pool.**
    `mastery.synthesis.service.eligible_champion_pool` / `eligible_matchup_pool` name the first
    half of generation, and the synthesizers call them. Never count the pool a second way: a
    coverage panel that disagrees with what the generator will serve is worse than no panel.
10. **Naming collision — internalise this:** `ranked_modules/mastery_slice.py` (the module) and
    `ranked_public/mastery_slices.py` (the SSM provider decorator, flag-gated OFF) are different systems
    sharing a name and no code path.

## Relevant files

**Backend** — `ranked_modules/mastery_slice.py` (carrier), `ranked_modules/mastery_config.py` (the config
authority), `ranked_modules/registry.py`, `ranked_formats/retired_mastery_sets.py`, `ranked_formats/schema.py`,
`ranked_public/{format_config,readiness,builder_catalog,mastery_preview,service}.py`,
`mastery/synthesis/{service,recipe,applied_chain,invariants,preflight}.py`,
`mastery/manifest/resolver.py` (selection + `CURRICULUM_V2` sequencing — Phase 3 touched
`_break_adjacent_pattern` only), `mastery/questions/physical_penetration_rendering.py`
(the applied-chain prompt), `mastery/facts/{sources,projection}.py`,
`mastery/knowledge/bank.py`, `mastery/matchup/composer.py`, `mastery/publication_gate/gate.py`,
`mastery/data/*.py` (6 certified champions), `mastery/data/slice_patch.py`,
`mastery/chains/physical_penetration_set.py`, `quiz/review_universe.py`, `routes/mastery.py`,
`mastery/serving/{artifact,attempts}.py` (Phase 4 — the served-artifact contract and the
`quiz_attempts` bridge), `mastery/synthesis/coverage.py` (Phase 5 — a COUNT, never content),
`ranked_public/review.py` (the ONE historical rendering system),
`services/attempt_recorder.py`, `migrate_quiz_attempts_v2.py` (read, not changed),
`fixtures/dc1_phase2f_cooldown_authority.json`.

**Frontend** — `src/lib/ranked-core/modules/MasterySliceChallengeSurface.tsx` (Phase 5 — THE
one per-challenge renderer, shared by the arena and the Generator Lab; holds `renderPathFor`),
`src/lib/ranked-core/modules/masterySliceModule.tsx` (the arena's match model; renders through
the shared surface), `src/pages/admin/ranked/MasteryGeneratorLab.tsx` (Phase 5 — the Lab),
`src/features/mastery/interactions/{registry.tsx,AtomicRecallQuestionView.tsx,ComparisonQuestionView.tsx,formatPromptSemantics.ts}`,
`src/features/mastery/contracts/{promptSemantics,comparisonSemantics,playerQuestion}.ts`,
`src/lib/question-surface/masterySliceScenario.ts` (current, not legacy),
`src/pages/dev/ranked-arena-inspector/RankedArenaInspector.tsx`, `src/pages/admin/ranked/RankedFormatBuilder*`.

## Source authorities

- Champion/Matchup → `champion_stats` + `champion_abilities` (canonical — the VALUE of record)
  **+ the generated wiki cooldown artifact as arbiter and shape authority** (fail-closed,
  provenance-bearing, drift-verified since Phase 2).
- Applied-chain → 6 hand-authored Python modules (**provenance-checked** against
  `champion_ability_formulas` since Phase 2) + `item_canonical` (17 penetration items).
- Patch label (all three modes) → `league_patches`, the canonical patch catalog.
- Presentation/media → server-side `quiz/presentation_contract.py` + `ranked_public/presentation_render.py`.

### New in Phase 2

| Module | Answers |
|---|---|
| `mastery/facts/integrity.py` | Is the cooldown artifact readable, and does it still agree with its store? |
| `mastery/provenance/certified_provenance.py` | Do the certified constants still agree with canonical data — and if not, is the copy wrong or the store behind? |
| `mastery/provenance/canonical_patch.py` | Which League patch is live, per the canonical catalog? |
| `mastery/synthesis/preflight.py` | Can this mode's sources be trusted right now? (`SourceIntegrityError` if not.) |

### New in Phase 3

| Module | Answers |
|---|---|
| `mastery/synthesis/invariants.py` | Is this generated slice made of usable questions? (One correct answer among distinct options; no duplicate semantic question; a free-input step judged by its own shape.) |
| `mastery/synthesis/recipe.allocate` | How is a slice's budget SHARED between the categories a subject actually has? |
| `mastery/synthesis/applied_chain.item_mechanic_key` | Are these two items the same learning task? (`(bonus AD, lethality, %pen)` — the inputs that decide the answer.) |

### New in Phase 4

| Module | Answers |
|---|---|
| `mastery/serving/artifact.py` | What WAS this generated question — which generator, at which version, over which config, from which patch, out of which artifact instance? Plus the redaction a review may show. |
| `mastery/serving/attempts.py` | One answered challenge → one ordinary `quiz_attempts` row. No parallel table, no second identity. |
| `ranked_modules.mastery_slice.attempt_material` | Everything an attempt records about one challenge, drawn from the FROZEN payloads only. |
| `ranked_modules.mastery_config.normalized_config` | The inverse of the parser: the config keys the generator actually consumed. |
| `services.attempt_recorder.record_attempt(apply_progress=…)` | Record the attempt WITHOUT paying the quiz progression, for a surface that has its own. |

`equivalent_answer_groups` is reported separately from `inspect_steps`, not folded into it: two
steps with the same answer AND the same options are a duplicate only where the prompt differs by a
label the derivation ignores (applied-chain's item name). Where the prompts name different subjects
it is coincidence.

A **valid no-content state and a source failure are now different things**: `error_kind` on the
readiness report is one of `source_integrity`, `insufficient_questions`, `publication_blocked` or
`synthesis`. A *successful* report additionally carries `patch_display` and any
`source_advisories` — so a slice can be reported servable **and** disputed at the same time,
which the pre-phase report could not say.

## Champion Mastery — capability audit (2026-09-12, audit only)

Full evidence: [`docs/gr1-champion-mastery-capability-audit.md`](./gr1-champion-mastery-capability-audit.md).
Screenshots: `docs/audits/gr1-champion-mastery/` (10 PNGs, end-to-end through the real Admin
Generator Lab). Bases: backend `origin/master` **`31c0bbe8`**, frontend `origin/main`
**`ec9c8bbd`**. Matchup and Applied-chain deliberately not audited. **Nothing was implemented.**

**What it is.** Numeric atomic recall over one champion, in **four** quiz families across three
categories: `ability_cooldown_rank`, `ability_cooldown_flat`, `ability_cost_rank`,
`champion_stat_level`. **6,690 servable candidates, 173/173 champions**, 0 generation errors
across 2,076 real probe slices. No comparison, no scenario, no calculation.

**Raw → servable: 8,801 → 6,782 (policy) → 6,690 (dedupe).** The *only* rejection reason
roster-wide is `family_unmapped`: **`champion_base_stat` is 1,702 raw / 0 servable** and flat
ability cost is 317 / 0. `champion_stat_level` alone is **52%** of the corpus.
*Correction to decision 6 above: "3,482 base-stat" is wrong — 3,482 is the servable
`champion_level_stat` count; base stat is 1,702 raw and 0 servable.*

**Coverage.** min 19 / median 40 / max 54 per champion. 125 champions have three categories, 43
have two, and **5 have ONE** (`aphelios`, `elise`, `jayce`, `nidalee`, `udyr` — level-stat only).
Root cause is upstream and *correct*: `dual_form_row` and `nonstandard_rank_count` in
`quiz/ability_question_eligibility.py`. Zero champions have zero coverage.

**Phase 3 solved the wrong half.** Category monoculture IS fixed (2.9% single-family at n=3).
Same-**fact** repetition is not: **36.8%** of 3-question slices repeat an ability slot, rising to
**97%** at n≥5; **97%** of 8-question slices repeat rank variants of one ability. Real captures:
6 of 8 Alistar questions are Alistar Q (cd r1, cost r1, cd r2, cost r2, cd r3, cost r3);
7 of 8 Garen questions are two facts. Seeds change *which* questions in all 692 (champion, n)
cells, but the **category mix is identical across every seed** — `allocate()` reads only counts
and budget, so a seed can never change a slice's shape.

**Two confirmed player-visible defects, both from screenshots, both one-line wiring:**
1. **`toPlayerQuestion` hardcodes `patchDisplay: ""`** → `patchLabel("")` returns the literal
   **`"Fixed scenario"`**, badged on *every* question, in the arena and the Lab, contradicting
   the League 26.16 label the backend already computed and returned.
2. **`MasteryAssetsProvider` is mounted only by `MasteryPlayerLive`**, so the slice path renders
   the grey initial-letter portrait fallback. (Latent behind it: the call passes
   `championDisplay.toLowerCase()`, i.e. `"lee sin"`, not the canonical `lee-sin`.)

**Worst wording defect.** `champion_stat_at_level` renders `humanizeMetric("base_armor")`, so the
prompt reads **"At level 18, what is Aatrox's Base Armor?"** for a base+growth value. Affects the
whole 3,482-candidate family and all 173 champions. The media band, from the *server's*
presentation contract, already says `HEALTH REGEN` where the prompt says "Base Health Regen" —
the two disagree. Also: an ability is **never named** (`bank._ability_name()` is `return slot`)
even though the image above prints "Infernal Chains", and a cost prompt **never names the
resource** despite `RESOURCE_LABEL` existing upstream.

**Internal taxonomy is NOT leaking**, proved from the renderer: `question_family` and the
backend's `prompt` (`"Ahri E — ability_cooldown"`) both cross the wire but
`AtomicRecallQuestionView` renders `formatRecallPrompt(promptSemantics)` and never them;
`ATOMIC_RECALL`/`ABILITY_COOLDOWN` appear only in the Lab's admin diagnostic header.
`Recall` and `Fixed scenario` ARE rendered to players.

**Difficulty is not real.** `difficulty_class` exists on every frozen step and is
`difficulty_for(certification)` — a two-entry map that splits exactly along the category line
(3,208 at 2 = cooldown+cost, 3,482 at 4 = level-stat). Nothing in generation, composition,
distractors or sequencing reads it. **Do not build it yet.**

**Persistence (Phase 4) re-verified, nothing contradicted** — frozen artifact, `mastery_artifact`
provenance, `mastery:<concept_id>` key shared with the standalone bank, one `quiz_attempts` row
per answered challenge with `apply_progress=False`, four unconflated identities, absent-means-
unknown. Note `mastery/serving/attempts.py` is **fail-soft**: a record failure is logged and
swallowed, so analytics loss is silent. The Lab writes nothing (verified in the backend log).

**Tests.** `pytest mastery/tests` → **3 failed, 1617 passed** — the documented pre-existing set,
zero introduced. GR1 P2/P3/P4 + synthesis + roster + gate → **288 passed**. `vitest` mastery +
ranked-core + Lab → **236 passed**. **New:** `test_ranked_mastery_artifact_persistence.py` passes
**21/21 alone** but fails one test when `test_ranked_mastery_reveal_e2e.py` runs before it —
cross-suite state leakage, bisected to that one culprit. **Untested:**
`formatPromptSemantics.ts` has no test file at all — the one file that writes every player-facing
sentence, and the site of the "Base Armor" defect.

**Top 5 to product-ready — ALL FIVE ARE DONE.** See
[`gr1-champion-mastery-product-readiness.md`](./gr1-champion-mastery-product-readiness.md).
Branch `gr1/champion-mastery-product-readiness` in BOTH repos, one commit each, both clean
fast-forwards: backend **`ce9ae8f6`** on base `f6d61632`, frontend **`84aaf5a1`** on base
`ec9c8bbd` rebased onto `6eafd998` (POINT1, zero file overlap). **Neither is pushed** —
`origin/master` auto-deploys and `origin/main` is what Lovable publishes from:

```bash
git -C <backend>  push origin gr1/champion-mastery-product-readiness:master
git -C <frontend> push origin gr1/champion-mastery-product-readiness:main
# then press Publish in Lovable — a push alone does NOT deploy the frontend
``` What changed, one line each:

1. **Level-stat wording.** "At level 18, what is Aatrox's **Armor**?" — `formatPromptSemantics
   .statName` drops the `base_` qualifier for the level template, and the metric slug (the
   identity everything travels under) is untouched. The server's chip agrees now too:
   `presentation_render._stat_badge` drops it wherever a level is STATED; `METRIC_LABELS` is not
   edited, so a base-stat question elsewhere still reads "Base Armor".
2. **Ability names.** `bank._ability_name` was literally `return slot`. It now reads
   `ChampionFactSet.ability_name(slot)`, off the SAME `champion_abilities` read the ability facts
   came from → "Aatrox W (Infernal Chains)". `candidate_key` is unaffected, and asserted so.
3. **Cost resources.** `PromptSemantics.resource` is the fact's own unit inverted through
   `COST_RESOURCE_UNIT` → "how much **mana** does Ahri Q (Orb of Deception) cost?".
   **Fail-closed** (`COST_RESOURCE_UNNAMEABLE`), and it costs nothing: the servable corpus is
   **6,690 before and after**, because every servable cost already carried a certified resource.
4. **Same-fact repetition.** Two changes over the definition the sequencer already had
   (`_pattern_group` = champion:subject_ref:metric): `_select_for_request` prefers unseen patterns
   with `used_patterns` threaded across the WHOLE plan, and `recipe.allocate` round-robins over
   each category's DISTINCT FACT count before its raw count. Roster-wide, 519 slices per length:
   `(metric, subject_ref)` repeats **113→0 at n=3, 498→0 at n=5, 519→24 at n=8**, with the question
   count byte-identical (1557/2595/4152) — nothing thin was lost. The residual 24 is exactly the
   five single-family champions plus `gnar`/`lee-sin`/`reksai`. A third change keeps Phase 3's win:
   `_interleave_by_key` also bounds the CATEGORY run, and gained a backward-insert move because the
   forward-only pull could never fix a run at the tail.
5. **Presentation wiring.** `patch_display` and `input_constraints` are now frozen onto each public
   challenge (`PUBLIC_CHALLENGE_FIELDS`) — the badge reads **`Patch 26.16`** instead of the literal
   `"Fixed scenario"`, and a free-input question shows the grader's own unit and precision
   instruction (same `_numeric_constraints`, same `readNumericConstraints`). `MasteryAssetsProvider`
   is mounted on the ONE shared surface, so both surfaces get portraits and there is still exactly
   one image path. Both fields are absent-means-unknown.

**Superseded — the original list:** (1) fix the level-stat prompt wording; (2) pass the real
`patchDisplay` through `toPlayerQuestion`; (3) add a per-slice cap on `(metric, subject_ref)` /
`redundancy_group` where `_break_adjacent_pattern` already lives; (4) name the ability and the
resource; (5) mount `MasteryAssetsProvider` and pass real `inputConstraints` on the slice path.

**Do NOT change yet:** difficulty; the `dual_form_row` / `nonstandard_rank_count` holds (correct
— widening them ships ambiguous questions); `champion_base_stat`'s unmapping (family-contract's
call, and unblocking it exposes a latent "base Base Armor"); the gate, preflight, freeze and
attempts contracts (all sound); Matchup; Applied-chain.

**Test-isolation defect — re-measured, and it is not what the audit thought.** The failing test is
`test_review_is_unchanged_after_the_canonical_data_moves`, not the one named; it is
**intermittent (~1 in 5), not order-deterministic**; and it reproduces **identically at the base
SHA**, so the readiness pass neither causes nor fixes it. No file that pass touches is involved —
the mechanism is the suite's own `_shift_cooldowns` monkeypatch against module-level generator
state. The five Ranked-Mastery suites pass **104/104** in natural order. Left for a separate
test-infrastructure task.

**Owner decision required (one).** Raising ability coverage for the five single-family champions
needs **dual-form rows in `champion_abilities` split into per-form rows** — a canonical-data
change owned by CHAMPDATA/Patch Ops, not GR1. Wait for that, or accept five champions shipping
with a one-family product?

## Matchup Mastery — capability audit (2026-09-13, audit only)

Full evidence: [`docs/gr1-matchup-mastery-capability-audit.md`](./gr1-matchup-mastery-capability-audit.md).
Bases: backend `origin/master` **`c4f08761`**, frontend `origin/main` **`33d27b2f`**.
Champion Mastery and Applied-chain deliberately untouched. **Nothing was implemented.**

**What it is.** Two servable comparison families — `ability_cooldown_compare` and
`champion_stat_compare` — plus both sides' atomic banks. **14,878 / 14,878 pairs generatable,
0 errors.** Of the four comparison templates the composer and the renderer both know,
`ability_cost` and `champion_stat_at_level` are `family_unmapped` (no family in
`quiz/family_contract.py`), so **two of the four renderer branches are dead code**.

**Raw → policy → servable: 726,049 → 322,026 → 174,970 comparisons** (+1,150,680 atomic).
The only policy rejection roster-wide is `family_unmapped` (404,023 = all level-stat + all
cost). Per pair: comparisons **min 8 / median 12 / max 13**; total servable min 47 / median 90.

**THE FINDING — one rank-silent f-string costs coverage AND correctness.**
`adapter._comparison_prompt_and_explanation` builds `f"{a} vs {b} — {metric}"` with **no
context**, and `effective_question_key` is keyed on that prompt. So a cooldown comparison at
ranks 1–5 is ONE effective question and four are deduped away: **cooldown comparisons
192,562 → 45,506, a 76.4% loss**, which is what caps every pair at 13. Worse, the survivor is
always rank 1, and across all 14,878 pairs **43,085 collapse groups exist and 11,880 (27.6%)
disagree on the answer between ranks** — 9,880 of those are a tie at one rank and decisive at
another. The question as asked has a different correct answer at a rank it does not exclude.
Fixing the prompt fixes both. *(The media band already prints `RANK 1`; only the sentence
does not — visible in the same card of the existing capture.)*

**Ties — quantified, not removed, per instruction.** 20,296 / 174,970 servable comparisons are
ties (**11.6%**); in real slices **14.5–15.2% of questions**, and **64.4% of n=8 slices contain
≥1 tie, 31.1% contain ≥2, 15.5% ≥3**. Worst metrics: **`base_magic_resist` 39.3%**,
`movement_speed` 18.4%, `attack_range` 15.7%, `ability_cooldown` 9.9%. Two structural causes:
Riot's shared constants (MR 32, MS 345, range 125/175), and every cooldown being judged at
rank 1 where kits agree by convention. **The user's Aatrox-vs-Akali example is exactly this** —
R and W are ties at rank 1 and decisive at every higher rank.

**Composition is HEALTHY and needs nothing.** 5,016 real slices (418-pair stratified sample ×
{3,5,8} × 4 salts): **0.0% repeat a `(subject, slot, metric)` pattern at every length**,
0.0% repeat an ability slot, longest same-family run 2, **0 comparison/atomic order
violations**. The readiness pass's `used_patterns` threading is mode-agnostic and already
carries. Determinism holds (same salt ⇒ 1 slice), `(a,b) == (b,a)` digests are identical, and
12 salts give 6–11 distinct slices. **Atomic recall is unreachable at n ≤ 8** — spill begins
exactly at pool exhaustion, so slices are **100% comparative / 0% atomic fallback** at every
realistic length.

**The one un-ported half of the readiness fix:** `synthesize_matchup_manifest` passes no
`distinct_counts` to `_plan`. Free at n ≤ 8; repeats a fact up to 5× at n ≥ 16.

**Correctness is otherwise clean.** 517/517 base-stat values and winners match
`champion_stats`; 325/325 parseable cooldowns match `champion_abilities`. Phase 2 still fails
closed for matchup — `CooldownAuthorityUnavailable` ⇒ `AUTHORITY_UNAVAILABLE` ⇒
`SourceIntegrityError`, verified by injection and by recovery. Patch stamped `League 26.16`.
**One new data/semantics defect:** 22 champions have `mp5 = 0` because they use no mana, so
**3,553 pairs (23.9%) ask "which has more base Mana Regen" with one side at a structural 0**,
and 231 manaless-vs-manaless pairs serve it as a guaranteed 0–0 tie. `base_mana` already
declines correctly for those champions; `base_mana_regen` does not.

**Wording — all 10 served shapes inventoried.** No ability is ever named ("Ahri R or
Syndra R?"); no rank is stated; **7 of 10 read "more base Base X"** (the template hardcodes
`base ` and `humanizeMetric` re-emits it), while `attack_range`/`movement_speed` get the
inverse error; and the player-visible reveal leaks raw unit slugs — `per_5_seconds`,
`units_per_second`, `attack_damage`, `hitpoints`. Direction ("shorter"/"less"/"more") is
correct and leaks nothing; "which champion" is never ambiguous; internal taxonomy does not
reach a player. One oddity: the segment **header** echoes the caller's champion order while
every question inside uses canonical order.

**Presentation — two defects.** (1) `movement_speed` and `attack_range` are **absent from
`quiz.public_presentation.METRIC_NAMES`**, so `MatchupRef` refuses and those challenges ship
with **no media band at all — 29,756 of 174,970 = 17.0%**, mid-slice, beside cards that have
one. (2) `presentation_render.py:423` is literally
`subject["ability_name"] = f"Ability {ref.ability_slot}"` — the single-champion path resolves
the canonical name, the matchup path prints **"Ability W"**. The badge and portrait defects the
Champion audit found are FIXED and confirmed fixed on the live payload.

**Persistence needs nothing.** `subject_key` is canonical both ways
(`matchup:ahri:syndra`), `mastery_set_id` / `artifact_digest` / `artifact_instance_id` are
identical for either config order, `subject_kind = MATCHUP`, two `fact_refs` per comparison,
and the step's `candidate_key` (`…:W:vs:…:W:r1`) **carries the rank the prompt omits**.

**Tests.** `pytest mastery/tests` → **3 failed, 1658 passed** — the documented pre-existing
set, zero introduced. 6 Ranked-Mastery integration files → **2 failed, 151 passed**; both
failures (`test_mastery_ranked_capsule.py` pinned ids/digests) reproduce at `ed254ca6`, so they
predate the readiness pass. **`formatComparisonSemantics.ts` has no test file** — it writes
every sentence above and holds four of the wording defects.

**Top 5 blockers, in recommended implementation order:**

1. **State the rank in the comparison prompt** (backend f-string + frontend template).
   Correctness fix; also 4.2× the cooldown universe and most of the tie mass. One change,
   three blockers.
2. **Re-measure ties over the widened universe, then set a tie policy.** Do not cap before (1).
3. **Prompt wording** — name both abilities, drop the double `base`, invert the unit slugs.
4. **Presentation** — add `movement_speed`/`attack_range` to `METRIC_NAMES`/`METRIC_LABELS`;
   decide what a two-champion band says instead of `"Ability W"`.
5. **Manaless mana regen** — make `base_mana_regen` decline the way `base_mana` already does.

Then, lower: `distinct_counts` for the matchup plan, and the Lab coverage headline (it says
`total_candidates: 87` for `ahri × syndra` when the number that decides the product is
`comparison_candidates: 12`).

**Do NOT bundle in** — both are open owner decisions, neither is GR1's: the comparative
cost/level-stat **families** (404,023 held candidates, `quiz/family_contract.py`'s call), and
the **dual-form row split** (why the 10 thinnest pairs — all involving `aphelios`, `elise`,
`gnar`, `jayce`, `nidalee`, `reksai`, `udyr`, `lee-sin` — have zero ability comparisons).

**New owner decision:** manaless mana regeneration — decline it, or accept "0 vs 50" as a
legitimate question about a champion having no mana?

## Matchup rank identity — SHIPPED to branch (2026-09-13)

Full evidence: [`gr1-matchup-mastery-rank-fix.md`](./gr1-matchup-mastery-rank-fix.md).
Backend `gr1/matchup-rank-identity` @ **`52f5564a`** on base **`c4f08761`**; frontend
@ **`756b6b41`** on base **`3ce50045`**. One commit each, both clean fast-forwards,
**neither pushed**:

```bash
git -C /Users/macmoney/lcs-wt-gr1-rankfix   push origin gr1/matchup-rank-identity:master
git -C /Users/macmoney/mogsy-wt-gr1-rankfix push origin gr1/matchup-rank-identity:main
# then press Publish in Lovable — a push alone does NOT deploy the frontend
```

**The fix, in one paragraph.** `effective_question_key` is keyed on the rendered prompt, and
a comparison's options are always `[a, b, tie]` — so unlike atomic recall, where five ranks
yield five option sets and stay distinct for free, the prompt was the only thing that could
separate two ranks, and it carried no rank. `_comparison_context_clause` now appends
`" at rank N"`, and honours the composer's `rank_independent` (the flat pair) by stating
**no** rank there, which is the difference between stating one and fabricating one.

**Measured, all 14,878 pairs.** Collapse groups **43,085 → 0**; cross-rank answer
disagreements **11,880 (27.6%) → 0**; servable comparisons **174,970 → 322,026** (cooldown
**45,506 → 192,562**, dedupe now discards nothing); per-pair comparisons **min 8 / median 12
/ max 13 → min 8 / median 22 / max 27**. Raw candidates, policy-accepted counts, skip reasons
and the `family_unmapped` rejection are all **byte-identical** — nothing policy refused was
unlocked.

**Ties, re-measured and NOT suppressed.** Roster-wide **11.60% → 9.50%**. In 5,016 real
slices: questions that are ties **14.5/14.8/15.2% → 12.9/14.0/14.6%** at n=3/5/8; n=8 slices
with ≥1 tie **64.4% → 63.4%**, ≥2 **31.1% → 30.8%**, ≥3 **15.5% → 14.0%**. The slice-level
gain is small **and the reason is measured**: selection still meets each slot at **rank 1**
(79% of ability comparisons at n=8), and rank 1 ties at **21.5%** against 8.1–11.5% at every
other rank. ⇒ **The rank collapse was worth ~2 points roster-wide and ~1–1.6 in a slice. The
rest is rank-1 preference plus genuinely shared base constants (`base_magic_resist` 39.3%),
so rank diversity in selection is a cheaper first lever than tie suppression.**

**Composition preserved — and one change was REQUIRED to preserve it.** Multiplying the raw
cooldown count by five without changing its DISTINCT-FACT count made `recipe.allocate`'s
raw-count round-robin repeat a fact in **43.1%** of 8-question slices.
`synthesize_matchup_manifest` now passes `distinct_facts_by_category`, which Champion Mastery
has had since the readiness pass and Matchup never did — free before this commit,
load-bearing after it. Re-measured: repeated `(subject, slot, metric)` **0.0% at n=3/5/8**,
repeated slot 0, longest family run 2, zero atomic fallback at n ≤ 8, zero order violations,
same salt ⇒ one slice, reversed pair ⇒ identical digest, 4 salts ⇒ 4 distinct slices for 319
of 418 pairs (was 254).

**Wording and presentation.** Both abilities named — `MatchupPromptSemantics` carries a
**pair**, because a same-slot comparison is the one shape where the slot is shared and the
name is not. `"more base Base Armor"` → `"more base Armor"`, and no "base" at all for
`movement_speed`/`attack_range`, which have no base-vs-scaled distinction. `per_5_seconds` →
`per 5 seconds` via `UNIT_LABELS` in `mastery/facts/contract.py`, applied **only** on the
comparison path so Champion explanations stay byte-identical. `movement_speed` and
`attack_range` added to `METRIC_NAMES`/`METRIC_LABELS` — they were absent, so `MatchupRef`
refused and **17.0% of comparisons shipped with no media band**. The band emits both ability
names or neither, and keeps the old `"Ability W"` key as a fallback for an un-shipped client.

**Do NOT reuse `_subject_label` for comparisons.** The atomic one *replaces* the slot with
the name; `_comparison_subject_label` keeps both. Keeping them apart is exactly what kept
this pass off Champion Mastery's prompts, and therefore off its dedupe.

**Tests.** `mastery/tests` → **3 failed, 1677 passed** (the documented pre-existing set, zero
introduced). 7 Ranked-Mastery integration files → 2 failed / 200 passed, both pre-existing at
`ed254ca6`. 8 presentation/media suites → failure set **byte-identical at the base SHA**.
Footprint guards **166 passed** against the real commit. `vitest` → **70 files / 951 tests, all
green**. New: 19 backend tests (`test_gr1_matchup_rank_identity.py`) and 15 frontend tests for
`formatComparisonSemantics.ts`, **which had no test file at all**. Three existing tests changed
and all three are stronger — most notably `test_distinct_candidate_ids_that_render_alike_are_deduped`,
which asserted a pair "still contains colliding candidates" **and the collision it pinned WAS
this defect**; it is inverted and now proves the mechanism over a duplicate it supplies itself.

`GR1_RUNTIME_FILES` grew by exactly three presentation files, re-pinned by exact set equality.
No other workstream's footprint moved.

**Still open for Matchup:** tie policy (decide after reading §4 of the rank-fix doc); the
comparative cost/level-stat families; manaless mana regen (deliberately untouched); the
dual-form split (why 1,480 pairs are base-stat-only); the Lab coverage headline; and no fresh
screenshot.

## Matchup rank diversity — SHIPPED to branch (2026-09-13)

Full evidence: [`gr1-matchup-mastery-rank-diversity.md`](./gr1-matchup-mastery-rank-diversity.md).
Backend `gr1/matchup-rank-diversity` @ **`1f8f1de9`** on base **`b9f7cd73`** — one commit, a
clean fast-forward, **not pushed**. **The frontend did not change**, and did not need to: the
previous pass already put the rank clause on the wire and already renders whatever value it
holds, so this pass changes *which* rank arrives, not its shape.

```bash
git -C /Users/macmoney/lcs-wt-gr1-rankdiv push origin gr1/matchup-rank-diversity:master
```

**The defect, and why it was not a weighting.** Selection sorts a pool by `candidate_key` and
rotates it once by a seed offset; the rank is the LAST segment of a comparison's key, so a
fact's five variants sort as one contiguous block. One rotation of the whole pool moves the
boundary past **at most one** block — every other fact is entered at `:r1`, `used_patterns`
marks it met, and its higher ranks are deferred forever. The measurement says so without
inference: over 5,040 real slices the **raw count** of non-rank-1 draws was *identical* at
n=3, n=5 and n=8 (334 at rank 2 in each), which a weighting cannot produce, and **no slice
ever drew three distinct ranks**. The pool rotation was never wrong; it simply never reached
the axis *inside* a fact.

**The fix.** `resolver._context_diverse_order` applies the same mechanism one level down: each
pattern's variants are rotated by an offset hashed from `(seed, pattern key)`. It is a
reordering only — every candidate appears exactly once, and pattern ORDER is untouched — so no
request's count or fill can move, and a single-variant fact (a flat cooldown, any base stat)
provably does not move at all. It names no rank: "context variants of one fact" is
`_pattern_group`, the same notion of same-fact selection and adjacency already use, so the
level axis is handled by the identical code with no branch.

**Opt-in.** `RepetitionPolicy.diversify_context_within_pattern`, default `False`, additive in
`to_dict()`. `synthesize_matchup_manifest` sets it; `synthesize_champion_manifest` does not,
and a test asserts that. A hand-authored request that pins `ability_rank` still resolves to
exactly that rank, because `_matches` filters before any of this runs.

**Measured, same 420-pair stratified sample run twice — once at the base SHA, once on the
branch.** Rank-1 share at n=8 **76.2% → 24.0%**, tracking the pool's own 23.6%; slices drawing
**only** rank 1 **24.2% → 3.4%**; slices spanning ≥3 ranks **0.0% → 51.3%** and ≥4 **0.0% →
9.8%**. Per slot: E 67.5→21.1, Q 70.7→19.8, W 65.2→19.3, R 77.8→34.6 (three ranks, even share
33.3).

**Ties fell as a consequence and were never suppressed** — nothing on the branch reads an
outcome. n=8 **13.53% → 13.29%**; cooldown family **14.30% → 13.69%**; slices with ≥1 tie
61.0% → 58.9%. **That is ~0.24 points, and it is the honest end of this lever.** After the
rank fix the remaining tie rate is not a rank artefact: it is shared base constants, led by
`base_magic_resist` at 38.5%, which contributes ~2.5 of the 13.2 points on its own. **Tie
policy is now a decision about base stats.**

**Unchanged and re-verified:** the candidate universe is byte-identical over all 14,878 pairs
(322,026 comparisons / 1,150,680 atomic, 0 pairs differ); 14,878/14,878 generatable, 0 errors;
cooldown comparisons drawn per slice identical; 0 repeated `(subject, slot, metric)`; 0
repeated slot; max metric run 2; 0 atomic fallback at n ≤ 8; 0 order violations; 4 salts ⇒ 4
distinct slices for all 420 pairs; same seed ⇒ same slice across processes and hash seeds;
`(a,b)` ≡ `(b,a)`.

**Tests.** New `mastery/tests/test_gr1_matchup_rank_diversity.py`, **15 tests**, and the suite
**fails at the defect** — with the one policy line flipped off, 5 of 15 fail. Regression arms
run serially against base `b9f7cd73`: `mastery/tests` 3 failed / 1,677 → 1,692 passed; 7
integration files 2 failed / 200 passed; 8 presentation-media suites 7 failed / 411 passed;
footprint guards 15 passed against the real commit. **Every failure set is byte-identical
between the arms; zero introduced, none repaired.** No footprint list changed — all three
runtime files were already inside `SLICE_FOOTPRINT`.

**Still open for Matchup:** unchanged from the list above, except that tie policy is now
scoped to shared base constants and **rank diversity is spent**.

## Matchup tie policy — DESIGN ONLY, owner decision pending (2026-09-13)

Full evidence: [`gr1-matchup-mastery-tie-policy.md`](./gr1-matchup-mastery-tie-policy.md).
Audited backend `origin/master` **`825e2db2`** (clean worktree, `git status` clean before
and after). Frontend `origin/main` **`756b6b41`** read only. **No runtime code changed, no
policy implemented, nothing pushed to `master`/`main`.** Docs only, on
`gr1/docs-snapshot`.

**READ THIS FIRST: the previous two docs' tie headlines over-state the problem by ~2.4
points.** The 418-pair stratified sample deliberately includes the 40 **tie-heaviest**
pairs on the roster. On the 298 pairs from its random stratum — what a player actually
meets — the baseline is **9.54% / 10.20% / 10.58%** at n=3/5/8, not 12.4 / 12.9 / 13.0.
Every slice-level tie number in the rank-fix and rank-diversity docs is a **stress**
figure. Use §1.4 of the tie-policy doc for the player-facing one.

**The problem is a TAIL, not an average.** Across all 14,878 pairs the tie rate is median
**8.3%**, p90 21.7%, p99 36.8%, max **63.6%**; **426 pairs (2.9%) run above 30%** and
8,889 (59.7%) below 10%. On a random pair an 8-question slice carries ≥3 ties **5.5%** of
the time. On the 40 worst pairs it carries **two ties in 100.0% of slices and three or
more in 71.9%**. Any policy judged on the average is judged on the wrong number.

**Two universe facts that settle most of the argument.** (a) `base_magic_resist` has
**ten distinct values across 173 champions** and 32/30 cover **88.5%** of the roster — a
tie there says "both took the default", which is 39.3% of pairs. (b) Ties are a **U-shape
over rank**, not a rank-1 artefact: `R` at rank 1 is 17.18% (the shared 120 s convention)
but rank 5 is the second-worst cell for every basic ability, because cooldowns converge on
a shared floor. That is why rank diversity bought only 0.24 points — it moved draws from
one end of the U to the other.

**Four policies, 45,144 real slices, 0 errors, 0 under-filled, 0 order violations.**
Headline at n=8 on the stratified sample (tie rate / ≥3 ties / cost):

| policy | tie rate | ≥3 ties | atomic slices | repeat fact | universe deleted |
|---|---|---|---|---|---|
| A natural | 12.99% | 11.7% | 0 | 0 | — |
| B cap (naive 1/1/2) | 11.19% | 2.3% | 0 | **6** | — |
| B2 cap (refined) | 11.31% | 3.2% | 0 | 0 | — |
| C deprioritize | 10.99% | 9.0% | 0 | 0 | — |
| **C + cap (recommended)** | **9.70%** | **1.9%** | **0** | **0** | **none** |
| D suppress MR+MS+range | 7.78% | 4.7% | **64** | **8** | **3.39%, 52.2% of pairs** |
| Dn suppress MR only | 10.55% | 7.2% | **32** | 0 | 1.82%, 39.3% of pairs |

**RECOMMENDATION — a narrowly defined hybrid: tie deprioritization (C) + a per-slice tie
cap, `max(1, n // 4)`. Do NOT adopt metric-level suppression.** They fix two different
defects and neither substitutes for the other. **C** makes the shipped within-pattern
rotation land on a **discriminating** variant — 9,880 of 43,085 cooldown patterns tie at
some rank and not others, and asking those at a tying rank is choosing the least
informative reading of a fact that has a better one; the cap cannot fix that, its only
move is to drop the question. **The cap** fixes stacking, which is the actual tail
problem; C is nearly powerless there (≥3 ties 71.9% → 63.1% on the tail) because the tail
is base-stat-dense and **C provably cannot touch a base stat** — a base stat has exactly
one candidate per pair, so there is no second variant to prefer, and the measurement
confirms it byte-exactly (`base_magic_resist` 644 → 644, `attack_range` 373 → 373,
`movement_speed` 343 → 343).

Together: **≥3 ties 0.5 → 0.0 (n=3), 4.2 → 0.0 (n=5), 11.7 → 1.9 (n=8); adjacent tie
pairs 87/169/323 → 0/0/127; on the tail at n=8, ≥3 ties 71.9% → 12.5%** — at a measured
cost of **exactly zero** on every axis: 0 under-filled, 0 atomic fallback, 0 repeated
facts, 0 repeated slots, identical family mix and metric diversity, rank distribution
within 1.1 points of the baseline, determinism and reversed-pair symmetry hold, 4 salts ⇒
4 distinct slices for all 418 pairs.

**Why D is refused, in four measured costs.** It deletes 3.39% of the comparison universe
and touches 52.2% of pairs; it pushes atomic single-champion recall into 64 of 1,672 n=8
slices and repeats a fact in 8 — both invariants held at zero since Phase 3; **13% of its
benefit leaks straight back** (`base_mana_regen` 153 → 190, `base_armor` 80 → 120 under
it, because freed budget lands on the next metric's shared constants); and it deletes
legitimate knowledge, since `attack_range` has 19 values and "Aurora 550 vs Elise 550 —
tie" is a real fact it cannot tell apart from "both in the 32 MR club". **If the MR
questions should go, the instrument is content, not policy** — `base_magic_resist` is a
weak comparison even when decisive (32 vs 30) — and that is now open item 3 below, not
something this pass did.

**Product answers.** One tie in a short slice is **fine** (it is the only answer a player
cannot guess from priors, and 74% of random-draw n=3 slices have none) — nothing here
removes the first tie. Ties turn repetitive **at two when they share a family or sit
adjacent, unambiguously at three**: 31–45% of multi-tie slices repeat a tie metric, 36% of
n=8 ones are all base-stat, and 323 adjacent tie pairs fall across 1,672 n=8 slices. A tie
**must stay a valid correct answer** — the alternatives are hiding the question (D) or
grading a tie as a win, which is the correctness lie the rank-identity pass existed to
remove. Tie suppression **does** hide legitimate knowledge (D), which the recommendation
does not: C asks the same fact where it discriminates and the cap defers rather than
deletes, so every tied comparison stays reachable at some seed. Worth doing? **Split: low
priority for the median pair, high for the 2.9% tail** — and since the fix costs nothing
measurable, do it, but scope and review it as a tail fix.

**Footprint if adopted:** `mastery/manifest/contract.py` (two additive `RepetitionPolicy`
fields, absent-means-off so every pre-existing manifest keeps its pinned digest),
`mastery/manifest/resolver.py`, `mastery/synthesis/recipe.py`, one new test file. **All
three runtime files are already inside `SLICE_FOOTPRINT`** — no guard list moves.
Frontend unchanged; `tie_state` and the three-option control already ship. Zero DDL, no
migration. Generated Matchup `mastery_set_id`/`artifact_digest` move, as in the previous
three passes; Champion Mastery must not adopt either flag and should be asserted not to.
**One boundary for a reviewer to confirm deliberately:** this would be the first resolver
code to read a candidate's *answer* (`outcome.is_tie`).

**Still open for Matchup:** the tie decision itself; the cost and level-stat families;
**`base_magic_resist` as a comparison metric at all (NEW)**; manaless mana regeneration;
the dual-form row split (which is also why the tie tail is base-stat-dense); the Lab
coverage headline.

## Matchup tie policy — IMPLEMENTED on branch (2026-09-13)

Full evidence: [`gr1-matchup-mastery-tie-policy-implementation.md`](./gr1-matchup-mastery-tie-policy-implementation.md).
Backend `gr1/matchup-tie-policy` @ **`afb55d1e`** on base `origin/master` **`087f9a78`** — one
commit, a clean fast-forward, **not pushed**. Worktree `/Users/macmoney/lcs-wt-gr1-tie`,
`git status` clean. **The frontend did not change and did not need to**: `tie_state` already
travels, the three-option control already renders, and a tie is still a legal correct answer.

```bash
git -C /Users/macmoney/lcs-wt-gr1-tie push origin gr1/matchup-tie-policy:master
```

**Base SHA note.** The design pass measured `origin/master` `825e2db2`; `origin/master` has
since moved to `087f9a78` (two unrelated `item-runtime` commits). `git diff 825e2db2
087f9a78 -- mastery/` is **empty**, so this sits on the identical Mastery code that was
measured.

**What shipped: exactly §5 of the design doc, nothing more.** Two opt-in
`RepetitionPolicy` fields, set only by `synthesize_matchup_manifest`.
`prefer_discriminating_context` advances the shipped within-pattern rotation to the first
variant that does **not** tie, cyclically from the seeded offset — a further rotation of one
fact's own members, so the pool is unchanged as a set, pattern ORDER is untouched, and a
single-variant pattern (**every base stat**) provably does not move. `max_tie_questions`
bounds ties per slice at the approved **rule** `max(1, question_count // 4)` — 1 / 1 / 2 at
n=3 / 5 / 8. **Metric-level suppression was NOT adopted**: the comparison universe is
byte-identical, 322,026 comparisons over 14,878/14,878 generatable pairs, 0 errors.

**The cap is a preference, and the mechanism is the point.** `_select_for_request` now keeps
**two** deferral queues and drains the **tie** queue before the already-asked-pattern queue.
That ordering is the whole difference between the design pass's `B2` and its naive `B`, and
it is what holds repeated facts at zero: a tie is only ever passed over for a **fresh
non-tie**, never for a fact the slice already asked. When both queues are exhausted the tie
is served and `_TieBudget` records the overrun rather than preventing it. **Proved
exhaustively, not argued: over 2,400 slices on the 40 tie-heaviest pairs plus 160 random
pairs, 104 (4.33%) exceed the cap and in 0 of them did a fresh deciding alternative exist.**

**The architecture boundary, confirmed deliberately** — the one thing the design pass asked a
reviewer to look at. One function, `resolver._is_tie`, reads the composer's
already-computed `outcome.is_tie` and nothing else. Answer correctness stays owned by
`ComparisonOutcome`; no candidate is removed from any pool; no canonical value moves;
candidate validity is unchanged; atomic recall has no outcome so both policies are inert
over it. Both fields are **absent-means-off and additive in `to_dict()`**, so the resolver is
*not* globally tie-aware — every caller that does not opt in resolves byte for byte as
before, and every manifest authored earlier keeps its pinned digest. **Champion Mastery
adopts neither, asserted.**

**Measured before/after, same 420-pair stratified sample, both arms in one process, 10,080
real generated slices, 0 errors.** (Sample is 420 rather than the design pass's 418 — same
strata and seed, different tie-break in the tie-heaviest stratum — so deltas are exact and
absolutes are compared as shape.)

| | n=3 | n=5 | n=8 |
|---|---|---|---|
| tie rate (all 420) | 13.23% → **8.49%** | 13.52% → **7.83%** | 13.48% → **10.28%** |
| tie rate (random stratum, player-facing) | 9.69% → **6.33%** | 10.35% → **6.53%** | 10.72% → **8.38%** |
| slices ≥2 ties | 7.3% → **0.2%** | 16.4% → **1.7%** | 28.6% → 24.6% |
| slices **≥3** ties | 0.7% → **0.0%** | 5.2% → **0.0%** | 13.4% → **4.8%** |
| adjacent tie pairs | 106 → **4** | 203 → **0** | 357 → **160** |
| **tail (40 tie-heaviest), ≥3** | 6.2% → **0.0%** | 46.2% → **0.0%** | 87.5% → **42.5%** |

**Tie volume by metric shows the two halves separately.** `ability_cooldown` 1,419 → **801**
(−44%: deprioritization, which only multi-variant facts have). Every base stat falls ~a
fifth — that is the cap alone, since deprioritization cannot reach a single-variant pattern.
**No metric rises**, which is the whack-a-mole leak that sank Policy D (`base_mana_regen`
rose 153 → 190 under it). Total 3,615 → **2,468**.

**Against the simulation: it reproduces, with one gap, and the gap is mostly the sample.**
n=5 matches digit for digit (7.70% sim vs 7.83%, ≥2 1.7% vs 1.7%, ≥3 0.0% vs 0.0%, adjacent
0 vs 0); n=3 and n=8 ≥2 are close. The one divergence is the **residual ≥3 at n=8** — sim
1.9%, measured 4.8%; tail 12.5% vs 42.5%. **This sample's tail stratum is strictly harder**:
its *baseline* n=8 tie rate is 45.23% against the design pass's 40.94% and its baseline ≥3 is
87.5% against 71.9%, and the baselines run high in the same direction at every cell. A denser
tail leaves a bigger residual for the same policy. **No policy change was made to close it** —
the approved policy is implemented as approved.

**Unchanged and re-verified on the branch:** 14,878/14,878 pairs generatable with 0 errors;
322,026 comparisons and 30,604 ties, reproduced exactly; **0** repeated `(subject, slot,
metric)`; **0** repeated slot; **0** under-filled slices; **0** atomic fallback at n ≤ 8;
longest same-metric run **2**; 4 salts ⇒ 4 distinct slices for **420/420** pairs at every
length in both arms; same seed ⇒ same slice; `(a,b)` ≡ `(b,a)` identical `artifact_digest`,
`mastery_set_id` and step order. Rank diversity and the rank-identity fix are both intact —
their suites pass unchanged. No footprint list moved; all three runtime files were already
inside `SLICE_FOOTPRINT`, and the 15 guards pass.

**Generated Matchup `mastery_set_id`/`artifact_digest` move**, as in each of the three
preceding passes. Reachable surface is admin-bot matches and the Generator Lab.

**Tests.** New `mastery/tests/test_gr1_matchup_tie_policy.py`, **23 tests, 0 skipped**, and
the suite **fails at the defect** — with the two policy lines flipped off, **4 of 23 fail**.
Focused Matchup + composition arms: **307 passed**. Full `mastery/tests`: **3 failed / 1,722
passed** on the branch against **3 failed / 1,699 passed** at `afb55d1e~1` — **failure sets
byte-identical, zero introduced, none repaired**; the three are `test_audit_db.py` (2) and a
Ranked format-naming drift in `test_phase4f_ranked_mastery_slice.py`, all pre-existing and
untouched per the brief.

**Still open for Matchup:** unchanged, minus tie policy — the cost and level-stat families;
`base_magic_resist` as a comparison metric at all; manaless mana regeneration; the dual-form
row split; the Lab coverage headline. ~~**The broader Matchup structural review was NOT
started.**~~ — **it has now been done, audit-only: see the structural-audit section below.**

## Matchup Mastery structural audit — AUDIT ONLY (2026-09-13)

Full evidence: [`gr1-matchup-mastery-structural-audit.md`](./gr1-matchup-mastery-structural-audit.md).
Backend `origin/master` **`16db3690`**, frontend `origin/main` **`756b6b41`** (read only),
docs base `origin/gr1/docs-snapshot` **`decc49b6`**. **No runtime code changed, nothing
implemented, nothing pushed.** The tie policy IS integrated — `git diff afb55d1e 16db3690` is one
documentation file — so this audit measures the generator the previous pass shipped.

**Instruments.** A 14,878-pair sweep through the real pipeline (0 errors), 5,040 real generated
slices over a 420-pair stratified sample × n={3,5,8} × 4 salts (0 errors, 0 under-filled), a
1,200-pair quality probe rendering every served comparison through the real adapter and a faithful
transcription of the shipped `formatComparisonSemantics.ts`, and a fallback probe generating five
pairs at every length from 1 upward.

**The universe.** 726,049 raw → 322,026 policy-accepted → **322,026 servable** (dedupe now removes
nothing) + 1,150,680 atomic. `ability_cooldown` **59.8%** / `champion_base_stat` **40.2%**.
404,023 candidates held at `family_unmapped`: `champion_level_stat` 299,124, `ability_cost`
104,899 — **both have canonical data, a complete identity and a live renderer branch**; the
blocker is `quiz/family_contract.py` in both cases. A third metric, `base_attack_speed`, is held
one layer earlier — `MetricSpec` gives it no `dimension`, so it has no comparison key at all.

**Slices.** 100% comparisons and **0 atomic at n=3/5/8**. The family mix **inverts with length** —
cooldown 55.6% → 47.4% → **34.8%**, base stat 44.4% → 52.6% → **65.2%** — because the distinct-fact
allocator meets a ceiling of **4 ability facts against up to 10 base-stat facts**. An 8-question
slice averages 2.78 ability comparisons and 5.22 base-stat comparisons. Rank draw tracks pool
availability to within 3.1 points (rank 5 is the one consistently under-drawn axis, 12.9% vs 16.0%).

**The new content finding: near-miss, not ties.** Both servable families publish under a
`FamilyContract` that **declares exclusions the Mastery path does not apply** — `exclusions` is
prose read by one report script, never a gate. Measured: **91.5% of served `movement_speed`
comparisons are a tie or differ by under 5%**, the band `champion_stat_compare` itself calls "a
guess in the quiz". `base_health` 46.5%, `base_magic_resist` 41.6%, `base_attack_damage` 30.2%,
`ability_cooldown` 17.6% against its own 10% band. **`movement_speed` is worse than
`base_magic_resist`, and no tie-rate table could have surfaced it.**

**Pair health.** 14,878/14,878 generatable, 0 with no comparison. **Rich (≥21) 10,655 (71.6%) ·
normal (13–20) 2,743 (18.4%) · thin (≤12) 1,480 (9.9%)**, of which **880 are base-stat-only**.
The cause is **84 of 692 QWER slots held upstream across FIVE reason codes** — `secondary_gate`
27, `dual_form_row` 26, `no_cooldown` 11, `cooldown_shape_unsupported` 10, `nonstandard_rank_count`
10. This **refines the earlier record**: only **5** champions are fully ability-comparison-incapable
(`aphelios` `elise` `jayce` `nidalee` `udyr`), 3 publish one slot, 9 publish two — and
`dual_form_row` is the second-largest cause, not the only one.

**Atomic fallback.** Not a fallback mechanism — the second half of a two-plan recipe that is
usually allocated zero. The first atomic step appears at exactly **n = (that pair's comparison
count) + 1**, verified at 9/9/10/23/28 on five pairs. Roster minimum is **n=9** (166 pairs); the
median pair reaches it at **n=23**. 78.1% of the pair universe is unreachable at every length in use.

**Strengths, re-verified not assumed.** Total pair coverage · fail-closed source integrity · rank
identity (0 collapsed groups) · rank diversity · tie control (≥3 ties **0.0/0.0/0.7%** on the
random stratum) · 0 repeated facts and 0 repeated slots across 5,040 slices · determinism ·
pair-order symmetry · 4 salts ⇒ 4 distinct slices for **420/420** pairs · all ten metrics now draw
a media band · all 29 `ranked_format_configs` rows still `target='admin_bot'`.

**Limitations, observed only**, split into data/source (4), policy (3), family-contract (3),
composition (6) and presentation (4). **16 owner questions** are listed at the end of the document
— including whether `movement_speed` and `base_magic_resist` belong in the product at all, whether
Mastery should honour its families' declared exclusions, whether the held families should be
requested, whether a 65% base-stat 8-question slice is the intended shape, and whether the
1,150,680 unreachable atomic candidates belong in the matchup universe.

**Nothing was turned into an implementation plan, and no redesign was proposed.**

## Reusable state architecture audit — AUDIT ONLY (2026-09-19)

Full evidence: [`gr1-reusable-state-architecture-audit.md`](./gr1-reusable-state-architecture-audit.md).
Backend `origin/master` **`fc2e8be9`**, frontend `origin/main` **`4c29f7ba`**, clean worktrees,
read-only probes (`mode=ro`). **No runtime code changed, nothing implemented.**

**⚠️ Regression found upstream, not remedied (§0).** `b7ccf8e0` — QCA8, 2026-09-14, after
`2387e8f5` — narrowed `champion_stat_level` and `champion_stat_compare` to
`modes=(PRACTICE,)`, calling Practice "the only surface with a runtime consumer". The Mastery
publication gate reads those modes. Same DB, only the commit differs: **Champion Mastery
6,695 → 3,213 servable** (level-stat 3,482 → 0), **Matchup comparisons −40%** (base stat → 0),
and **880 of 14,878 pairs now have no comparison at all** (e.g. `aphelios × ahri` = 15 Ahri
atomic-recall candidates). Every earlier Matchup figure on base stats, MR/MS ties and "65%
base-stat slices" predates this. It is owner decision 1 in the audit.

**Core findings, one line each:**

* **The generated path is stateless by design.** `FactContext` holds rank, level and form only,
  and its docstring forbids scenario axes such as haste. Levels are the constant `(6, 11, 18)`.
  No item, rune, shard or patch input reaches `synthesize_*`, and `normalized_config` refuses
  unknown keys.
* **Matchup has no pair state.** It joins two independent banks on an *identical* context. The
  wire (`StatedContext`, both semantics types) carries one context, so per-side levels or
  items are unrepresentable.
* **The Ahri/Syndra lineage is NOT retired.** Ahri-vs-Syndra v2 is still the **default set** of
  `/api/mastery/sets`, served by `/quiz/mastery` (Mastery Journey, `HUB_MODULES.masteryJourney:
  true`). MC1 retired only the Ranked static catalog.
* **A full state model already exists there.** `CanonicalMasteryState` has one or two
  champions, each with level, ranks, inventory, runes and vitals, plus a `ValidationContext`,
  24 transition types and `BuildCandidate.classification` (a declared build source). The
  generated path imports none of it. Applied-chain is the bridge: it is on that lineage, at
  `SCENARIO_LEVEL = 11`, and mixes live item data with frozen champion data.
* **No service resolves champion + level + ranks + items + runes + shards + patch.** The
  closest is Combat Lab's `build_runtime_champion_stats` (`/build-preview`). It has no ranks, no
  shards and no patch, and it zero-fills a missing champion.
* **No build, rune-page, shard or skill-order authority exists.** The nearest are
  `quiz/data/champion_item_builds.json` (a whitelist) and the curated Ahri `build_candidates.py`.
* **Canonical data is overwritten in place.** No "as of patch N" read exists. There are three
  unrelated patch notions, and nothing in Mastery keys on `league_patches.patch_id`.
* **The Phase 4 freeze preserves content, not state.** Private JSON can hold more; the public
  side, `review_view` and `review.py` are positive allow-lists.
* **Full vs Slice.** Generation is already separate from composition. But the universe is a bag
  of intrinsic facts with no state order, and every composition mechanism is budget-first.

**15 owner questions** are listed in §13 of the audit, and are not repeated here.

## Reusable state architecture — DESIGN PROPOSAL (2026-09-19)

> **SUPERSEDED by revision 2 (section below).** Kept for history. Its level-18 cap, its
> symmetric-only matchup recommendation, `champion_item_builds.json` as `curated_default`, and
> the `"current" | PinnedBasis` basis were all corrected by the owner.

Full proposal: [`gr1-reusable-state-architecture-design.md`](./gr1-reusable-state-architecture-design.md).
**Design only. No runtime code, schema, migration, Slice, Full, tie, QCA, Applied-chain,
Combat Lab or UI change.** Backend read at `b1fd3510`, frontend/docs base `3c9ddfc4`.

**The proposal in eight lines:**

* **Setup state only.** Champion, form, level, ranks, items, runes, shards, position.
  Encounter state (HP/resource, buffs, stacks, gold) is a separate later layer, so the state
  does not become a god object.
* **Three layers.** `StateTemplate` (a request; may reference a source; no numbers) →
  `ResolvedState` (canonical ids + a `DerivedBlock` where every value has a status
  `supported | unsupported | not_applicable` and `depends_on`, plus a `DataBasis`) →
  `FrozenStateArtifact` (an optional private sub-block of `mastery_artifact`: inputs,
  `derived_used`, data basis, source provenance; never re-resolved).
* **Sources** (`literal`, `curated_default` = `champion_item_builds.json` with confidence
  normalized, later `saved` / `historical` / `internal_observed`) all yield one normalized
  `SetupRecord`. Generators never see a source. Source provenance is recorded but is **not**
  part of state identity.
* **Matchup** = two fully independent sides + ONE shared data basis + `PairDerived`, in
  canonical side order (slug), so `(a,b) == (b,a)`. Attacker/target roles live on the
  *question*. NOW only symmetric templates; asymmetry is owner decision D-6.
* **`FactContext` stays intrinsic.** Scenario inputs travel in a separate `ScenarioBinding`
  = the dependency projection (only the resolved values the answer depends on, e.g.
  `{ability_haste.total: 20}`). **Empty binding ⇒ every current `candidate_key`, `mastery:`
  ref, `fact_id` and digest is byte-identical.** That is the migration key.
* **Identity:** semantic (intrinsic + binding) / state (`state_key` readable inputs;
  `state_digest` = + data basis) / artifact instance (Phase 4, unchanged).
* **Full/Slice:** candidates are generated per state over an ordered state sequence and
  deduped by semantic identity, so Full is naturally incremental (only questions whose
  inputs changed come back). Slice = a coherent window + the existing budget composer.
  Today's slices = the intrinsic template, sequence length 1, unchanged.
* **Fail closed.** Unknown or non-current item, illegal rank, missing stat row and basis
  mismatch refuse the state. An unsupported modifier is `unsupported`, never 0. §11.2 lists
  the existing zero-fill paths (Combat `default_preview_base_stats`, `calculate_build_stats`
  keeping unknown items at zero, silent unknown runes/shards, the certified-only rank check).
  They are unchanged and not routed through.

**Migration (concept):** pure types with no callers + a roster-wide byte-identity probe →
`resolver.publish` receives its universe instead of re-projecting → optional private
`state` block → first state-reading family Lab-only behind a flag → a single-state Slice
window → Full (a separate phase). Journeys and Combat Lab are untouched throughout.

**Owner decisions:** 17, listed with options, trade-offs and recommendations in §16 of the
design (D-1 setup-only … D-17 eligibility via `family_contract` + Mastery pin tests).

## Reusable state architecture — DESIGN REVISION 2 (2026-09-19)

Full design: [`gr1-reusable-state-architecture-design.md`](./gr1-reusable-state-architecture-design.md)
(revision 2 replaces revision 1 in place; revision 1 is `2ba820e1`). **Design only. Phase 1 is
proposed, NOT implemented.** Backend read at `b1fd3510` with `git show`/`git grep`; no DB opened.

**Four owner-APPROVED constraints (§17.1 A-1…A-4):**

* **No architectural level-18 cap.** The contract holds level, ranks, items, runes and shards as
  data with no game-rule numbers. Legality comes from a **rules authority** keyed by
  ruleset + basis. What derivation can compute is a separately declared **support manifest**
  (levels 1–18 at first). Out-of-rules → refused. In-rules but out-of-support → `unsupported`.
  Never clamped. Evidence: both existing skill-point rules (`transitions._min_level_for_rank`,
  `combat_scenarios.resolver.validate_rank_for_level`) hardcode 5 basic ranks / R at 6-11-16 ≤ 3,
  which is wrong for Nidalee/Elise/Karma (4-rank R, rank 1 at start) and Jayce/Yuumi/Udyr (6-rank
  basics). `champion_state.py`'s store-guarded ceiling tables are the right source. Revision 1's
  "adopt `_min_level_for_rank`" recommendation is **withdrawn**.
* **Independent matchup sides.** Ahri L7 vs Syndra L6, different ranks, items, runes, shards and
  derived stats are all ordinary states. Generating only today's symmetric cases is a **generator
  policy** (D-6, OPEN). Canonical side order is `(slug, side setup key)`. Setup stays bound to its
  champion. Directional roles live in the binding after canonicalization.
* **Replaceable sources.** Resolution consumes a normalized `SetupRecord`. Generators are
  source-blind. Provenance is frozen but is never identity. The default is `SourcePolicy`
  **configuration**. **Mogzy has no recommended-build, skill-order, rune-page or shard
  authority.** `champion_item_builds.json` is at most one curated adapter (D-9 recommends
  selectable-by-name, not default).
* **Historical basis = capability.** `BasisRequest = current | pinned(DataBasisId)`. A resolved
  state always stores a **concrete** generic `DataBasisId{scheme,key}` with
  `availability = live_only | retrievable`. Today only the live basis is available, so any other
  pinned basis → `HistoricalBasisUnavailable`. Snapshots added later would change availability,
  not the contract.

**Identity (§8):** semantic question id = existing intrinsic material + binding (the empty binding
returns the material **unchanged**, byte-identical). State identity has three parts:
`semantic_state_key` (readable inputs, no basis, no source), `resolved_state_digest` (value-bearing,
following the `fact_id`/`content_digest` precedent, so a patch that changes nothing read leaves it
alone), and provenance (never identity). Manual vs saved source for the same setup gives the same
key and digest with different provenance. `(Ahri,Syndra)` ≡ `(Syndra,Ahri)`.

**Phase 1 seam (§15), PROPOSED:** new `mastery/setup_state/` (`contract.py`, `identity.py`,
`validation.py`, `errors.py`) plus four new tests. Files only, **no importer outside tests
(AST-enforced)**, no I/O, no rules data, no derivation, no source reads. The key acceptance test
builds real Champion and Matchup banks from `facts_support` fixtures and proves that
`bind_identity(material, EMPTY)` reproduces every `fact_id`, `candidate_id`, `content_digest` and
`candidate_key`. Rollback = revert one additive commit.

**Stages (§16):** 1 contracts+identity (inert) → 2 resolution + rules + derivation (uncalled by
serving) → 3 first state-aware family in Generator Lab (includes `resolver.publish` receiving its
universe) → 4 Slice over a resolved state/window → 5 Full composer.

**Decisions (§17):** A-1…A-4 and R-1…R-9 APPROVED. D-1, D-2, D-3 (revised), D-5, D-6 (now
generation policy), D-7 (shape), D-9 (revised), D-10…D-17 and new D-18…D-21 are OPEN. D-21 is
"approve Phase 1 as specified".

## Reusable state — PHASE 1 IMPLEMENTED, inert (2026-09-19)

Full record: [`gr1-reusable-state-phase1.md`](./gr1-reusable-state-phase1.md). The owner approved
Phase 1 as specified in design §15 (D-21), with the package name `mastery/setup_state/` (D-18 a).

* **Backend:** **`88c9f7a0`**, now on `origin/master`. Implemented on `b1fd3510`, rebased onto
  `cf1d2db2` (two upstream items-only commits, zero file overlap) and pushed on 2026-09-19.
  Branch `gr1/setup-state-phase1`, worktree `~/lcs-wt-gr1-state1`. One commit. It adds 9 files (5 in the package, 4 tests). It edits 2 test-support files:
  `facts_support.GR1_PACKAGES` plus that list's pinned-set test, because the footprint guards
  require the new package to be declared.
* **Types:** `StateTemplate` / `SideTemplate` / `SharedContextTemplate` / `BasisRequest`;
  `ResolvedState` / `ResolvedSide` / `SetupInputs` / `DerivedBlock` / `DerivedValue` (status
  enforced, so unsupported is never zero) / `PairDerived` / `DataBasis{DataBasisId, availability}`
  / `ResolutionRecord` / `DerivationSupport`; `FrozenStateArtifact` + `StepBinding`;
  `ScenarioBinding` (generic typed inputs + roles, **no provenance field**); `SetupRecord`,
  `SourceRef`, `SourceProvenance` and `SourcePolicy` as types only.
* **Identity:** `semantic_state_key` (readable, caller-order free, provenance/basis-free).
  `resolved_state_digest` (value-bearing, so manual vs saved gives the same digest, a new basis
  with the same values gives the same digest, and a moved value gives a new digest).
  `bind_identity(material, EMPTY)` **returns the same object**. Matchup canonicalization moves
  whole sides and remaps roles and `side<i>.` keys. Identical mirrors minimise the binding.
* **Validation:** shape only. Level 19, rank 6, a four-rank R and seven items all validate.
  No game-rule number exists in the package (enforced: every int literal is 0, 1 or 2).
* **Tests:** 103 new pass. Focused Mastery suites: same single pre-existing failure before and
  after (`test_format_for_creation_is_unaffected_by_this_module`, Ranked default-format drift),
  1042 → 1152 passed. Roster probe (read-only, not committed): 173/173 banks, 12,333 facts,
  8,806 candidates, 60 pairs / 2,961 comparisons, all byte-identical.
* **Ambiguities for the owner (Phase 1 doc §9):** the frozen block is one per state (a
  multi-state container is Stage 3/4); runes and shards are order-free multisets; there is no
  per-metric precision registry, so the producer must round bound floats; `rules_rev` and
  `derivation_version` bumps move the digest.
* **Next:** Stage 2 (rules authority, current-basis resolution, sources, derivation with a support
  manifest) needs its own approval. At that point the isolation rule narrows deliberately from
  "no importer" to "no serving importer".

## Reusable state — PHASE 2 IMPLEMENTED, resolution + derivation, still unwired (2026-09-19)

Full record: [`gr1-reusable-state-phase2.md`](./gr1-reusable-state-phase2.md).
**`StateTemplate → ResolvedState` now actually works. Nothing a player can reach uses it.**

* **Backend:** **`89b5ce4b`**, now on `origin/master`. Implemented as `35e08c11` on
  base `88c9f7a0`, rebased onto `origin/master` `57016334` (one upstream items-only
  commit, zero file overlap) and pushed on 2026-09-19; worktree `~/lcs-wt-gr1-state2`.
  One commit, **pushed**. 14 files, **every one inside `mastery/setup_state/` or
  `mastery/tests/`** — zero serving files, zero generators, zero routes, zero frontend.
  No migration, no DDL, no config key, no flag.
* **Six new modules.** `basis.py` (the one available data basis), `rules.py` (structural
  legality as data), `sources.py` (`SetupRecord` + registry + `SourcePolicy`),
  `normalize.py` (canonical ids + precedence), `derive.py` (values with statuses),
  `resolve.py` (the pipeline + matchup resolution).
* **Data basis.** Machine key = a fingerprint over observed store revisions, following
  the convention `projection_patch_key` already set and reusing `load_source_revisions`;
  label = `league_patches`' live row via `canonical_patch`, display only. Availability is
  `live_only` because the stores are overwritten in place, so `pinned(anything but live)`
  is **`HistoricalBasisUnavailable`** and current data is never substituted. A resolved
  state never stores the word `"current"`. **Remaining mismatch, documented not fixed:** a
  state's `DataBasisId` and a Mastery artifact's `patch_key_digest` are computed over
  different material and are not interchangeable.
* **Rules authority.** Level bounds, inventory slot limit and the unlock rules are DATA,
  and `rules_rev` is derived from that data. The per-champion rank domain is **read** from
  `champion_state.ability_rank_ceiling`, never copied — so Jayce/Yuumi/Udyr's six-rank
  basics and Nidalee/Elise/Karma's four-rank ultimates are right. Rank **availability** is
  the ordinary rule for ordinary champions plus declared exceptions (`nidalee/R`,
  `karma/R`, each carrying the wiki sentence); the other four champions' anomalous slots
  refuse with `rank_rule_unsupported` and are **never** measured against the 5/3 rule that
  `_min_level_for_rank` and `validate_rank_for_level` encode, both of which are wrong for
  them and both of which are unmodified. `InventoryPolicy` is reused as rules data.
* **Legality ≠ derivation support.** Udyr Q rank 6 is legal and its cooldown derives
  (6.0 s); the same state *with a level* refuses, because his availability rule is
  undeclared; and a level-dependent value with no level is `unsupported`, never clamped
  and never zero.
* **Derivation reuses, never restates.** Level-scaled stats come from
  `mastery.facts.projection.ChampionFactSet.resolve`, i.e. **Mastery's own fact layer**, so
  a derived value is the value Mastery publishes bit for bit (tested per champion). Attack
  speed from `champion_stat_profile`'s canonical composition; item stats from
  `item_canonical`; haste → cooldown from the declared shared primitive; movement speed
  from `movement_speed_model`'s own arithmetic. `build_runtime_champion_stats`,
  `calculate_build_stats`, `calculate_rune_stats` and `apply_stat_shards` were all
  **rejected as the authority** (zero-fill, clamps, silent ignores) and **none was changed**.
* **One deliberate widening.** Mastery's question-eligibility gate refuses any ability
  progression whose length is not 5/5/5/3, which is a publication policy rather than a
  derivation limit. Cooldown and cost are therefore read from the canonical row at the
  rank, with the progression length required to equal the declared ceiling. Result: Udyr Q
  rank 6 = 6.0 s, Yuumi Q rank 6 cost 75, **Karma R rank 4 = 34.0 s** (the number the old
  three-rank clamp published as 36). Aphelios Q/W/E — six stored values that are five
  weapons and a pad — are `unsupported(rank_domain_mismatch)`, the only three rows in 692
  where the progression and the ceiling disagree.
* **No silent zero.** `ability_power.total = 0` with no AP source is a **supported** zero;
  an `unsupported` value carries no number at all (contract-enforced); a manaless
  champion's resource pool is `not_applicable` per the canonical resource authority rather
  than per the populated `champion_stats.mp` column; a missing stats row is
  `SourceIntegrityError`, never zeros.
* **Runes and shards.** Runes are representable, their identity resolves (by name), and
  their numbers are **unsupported** for two independent reasons: `rune_provenance` is the
  repo's own statement that rune values are unversioned and excluded, and the nine
  `rune_stats` rows are conditional maxima. Shards are representable and **cannot resolve
  at all** — there is no `stat_shards` table and no id space, so normalization refuses with
  `unknown_shard`.
* **Matchup.** Independent sides, one shared concrete basis, asymmetry ordinary, caller
  order not an input (same key AND same digest from either order), setups never detach
  from their champion, no attacker/target direction anywhere in state identity, and
  `pair_derived` is `None` because every pair value the design lists is combat.
* **Two contract corrections, both tested.** (1) `resolved_state_digest` no longer hashes
  `rules_rev` or `derivation_version` — they are provenance, and Phase 1's inclusion made a
  refactor look like new data. Nothing consumed the Phase 1 digest. (2) A template axis may
  state `AxisState.INTRINSIC`, so "deliberately unmodelled" is requestable and not only
  representable. **No existing Mastery question identity changed.**
* **The guard was reworked, not weakened.** `setup_state → canonical services` is now
  allowed and is the point; `serving → setup_state` stays forbidden and is checked against
  a prefix set derived from the repository's own declared footprints plus the Ranked, API,
  Journey and Combat Lab packages; the contract half keeps every Phase 1 property (a static
  import closure proves it cannot reach `sqlite3`); every canonical read is deferred into
  the function that needs it, so importing the package loads no generator, route or
  framework; and game-rule numbers now exist in exactly one module. The stronger "no
  importer at all" claim is kept as a fact of today, so Phase 3's wire-up must edit that
  file on purpose.
* **Roster-wide (read-only, not committed):** 173/173 champions resolve, **692/692**
  (champion, level) states fully derived on the core axes, 692 distinct digests, **0
  failures**, **0 silent-zero or status violations**. 599 of 38,320 values unsupported
  (1.6%), all four reasons accounted for. Curated item builds at level 18: 146/173 resolve
  with the whole path and 173/173 truncated to six items — the 27 refusals are the
  inventory rule working on seven-entry paths. 60/60 sampled asymmetric matchups, 0
  reversal mismatches.
* **Tests:** 125 new (102 resolution + 23 backwards-compat) and the isolation guard 26 →
  55. Whole `mastery/tests`: **the failure SET is identical to the base** (the same five
  pre-existing failures — three audit-DB drift, per-question reveal persistence, Ranked
  default-format drift), 1830 → 1985 passed.
* **Phase 3 boundary:** the first real consumer is a state-aware family in the **Generator
  Lab**, admin-only and behind a flag, with `resolver.publish` receiving its universe
  instead of re-projecting it. Blockers carried forward: no per-metric precision registry;
  `resolver.publish` re-projects; `FrozenStateArtifact` is still written nowhere and is one
  block per state; the patch-identity mismatch; `get_identity_registry` can fall back to
  the curated six; four champions' rank-availability rules are undeclared; runes and shards
  need a versioned store. Rollback is `git revert 35e08c11`.

## Reusable state — PHASE 3 IMPLEMENTED, the first state-aware question path (2026-09-19)

Full record: [`gr1-reusable-state-phase3.md`](./gr1-reusable-state-phase3.md).
**The whole seam runs. It runs in the Admin Generator Lab and nowhere else.**

* **Backend:** **`22a1c7d9`** on `gr1/setup-state-phase3`, base `origin/master`
  **`ca3d7333`** (implemented on `295fd58f`, rebased over 3 upstream
  item-runtime commits with zero file overlap), worktree `~/lcs-wt-gr1-state3`.
  One commit, 14 files. **NOT pushed.**
  **Frontend:** **`bd4b78e8`** on `gr1/reusable-state-phase3`, base
  `origin/main` **`b901ea0e`** (upstream moved zero commits), worktree
  `~/mogsy-wt-gr1-state3`. One commit, 8 files. **NOT pushed.**
* **The seam.** `StateTemplate → ResolvedState → state-aware candidates → the
  EXISTING composition, publication gate, session adapter and Ranked
  presentation → a Lab preview`. Everything after candidate generation is the
  production path called with production arguments; the new code composes no
  sequence, dedupes nothing, gates nothing, writes no prompt, builds no option
  set and resolves no media asset.
* **One family, and it unlocks nothing.** Champion ability cooldown under
  resolved ability haste. Every part already existed — a certified
  `ChampionFact` for the base, a Phase 2 derived value for the haste,
  `calculate_cooldown.haste_to_cooldown_multiplier` reached *through* the
  Phase 2 derivation, and the already-**CERTIFIED**, Mastery-eligible
  **`combat_cooldown`** family in `quiz.family_contract`, which is
  **not modified**. A state-aware candidate is put to the same publication
  gate as an intrinsic one. `ability_cooldown_haste` was rejected as the
  family id because it is RETIRED and the gate correctly refuses it.
* **It honours the declared family's own exclusions.** A roster probe found 20
  abilities whose cooldown ability haste does not reduce (`static_cooldown.v1`
  — Amumu W, Jinx Q, Karthus E, Samira R, Singed Q and others). The question
  would have been correct and would have taught the wrong thing, and
  `combat_cooldown` excludes exactly that case, so the generator skips them
  with that word.
* **The resolver seam.** `resolve_with_universe` / `resolve` /
  `gate_snapshot` / `publish` gain one optional `universe=`; `None` — every
  existing caller — is unchanged, and **supplying the pool the resolver would
  have rebuilt gives a byte-identical snapshot** (same digest, seed, steps and
  bindings), which a test pins. A supplied pool is validated against exactly
  what the selector reads and refused on anything malformed. It exists because
  no manifest source can name a state-aware candidate: without it
  `_build_universe` would silently substitute the intrinsic bank.
* **Identity, all seven brief cases.** An empty binding adds **no key at all**
  — not even `{}` — so every existing fact, candidate, comparison,
  `mastery_set_id` and `artifact_digest` is byte-identical. Two different
  builds that both resolve to 20 haste are **one question** (589/589
  roster-wide) with two different state keys; 20 vs 40 are two (589/589); a
  manual and a curated source of the same setup give one question and differ
  only in per-axis provenance; a level no bound value reads changes the state
  and not the question; and a bound `{AH: 0}` stays distinct from the
  intrinsic question, because "read zero" and "did not read" are different
  questions. **The per-metric binding precision Phases 1 and 2 left open is
  now declared** (`ability_haste.total` → 0 places).
* **Correctness.** Cross-checked against the projection fact **and** the shared
  primitive: roster-wide **2,356 candidates, 0 answer mismatches**. The
  formula is not duplicated, asserted structurally — `scenario.py` imports
  neither `calculate_cooldown` nor the multiplier, calls neither, and contains
  no `100` and no float literal, so it *cannot* disagree.
* **Deliberately narrower than Phase 2 can derive.** The generator additionally
  requires Mastery's own certified fact at that rank, so Udyr Q rank 6 and
  Karma R rank 4 are not asked here. A published step must carry canonical
  `fact_refs`, and a state-aware question must not be the back door through
  which Mastery starts asking about facts its gate declined.
* **Fail-closed.** Unknown champion, a non-current item, an illegal or
  unavailable rank, a pinned historical basis, an unresolved required derived
  value (**never** read as zero), no rank stated, a matchup state, and nothing
  askable each refuse the whole preview — in the state layer's own words,
  re-typed but never rephrased.
* **The Lab, and only the Lab.** Two endpoints under
  `/api/ranked/admin/mastery-state-lab/`, admin-gated and behind
  `GR1_STATE_AWARE_LAB_ENABLED` (off by default; `families` answers anyway so a
  client can say the deployment does not serve it). **There is no
  ability-haste override** — haste comes from the items the state names,
  because a derived value with no input behind it describes a build that
  cannot exist. The frontend adds a second, clearly-experimental surface
  beside the production picker, holds no roster and no rule, and draws the
  questions with `MasterySliceChallengeSurface`, the arena's own component.
* **Current behaviour proven unmoved, byte-for-byte.** A read-only probe run in
  a clean base worktree and in the Phase 3 worktree — 20 champion banks (887
  candidates, with identity material, rendered prompts, explanations, options
  and effective-question keys), 7 pairs in **both call orders** (303
  comparisons), 8 published Champion and 4 published Matchup artifacts with
  every step's identity material, and 16 `mastery_slice` preview/coverage
  payloads across all three production generators seeded and unseeded —
  produced **identical 1,720,329-byte dumps**.
* **`mastery_slice` has no state-aware mode**, so **no saved Ranked format can
  name one**. Asserted: the mode set is exactly `{champion, matchup,
  applied_chain}`, the module source does not contain `setup_state`, and
  parsing a `state_aware` mode raises.
* **The guards were narrowed on purpose, not dropped.** Phase 2's "no importer
  at all" becomes a pinned allow-list of **one** file, declared from both
  directions (the isolation test and `facts_support.GR1_RUNTIME_FILES`) and
  asserted to be admin- and flag-gated and not where the question is built.
  The importer scan now runs over **prose-free** source, so a module may name
  the package in a docstring without being read as depending on it while a
  dynamic `import_module` is still caught. The diff-shape guard becomes six
  named serving files, each with its reason.
* **Tests:** 59 new, isolation 64 → 68, backwards-compat 24 → 25. The
  `mastery/tests` + Ranked-Mastery failure **SET is identical to the base**
  (the same five pre-existing failures), 2068 → 2146 passed. Frontend: Lab
  suite 31 → 45, 1160 passed across the Mastery / ranked-core / admin suites
  with the one pre-existing `adminCredentials` failure. One observed flake is
  recorded in the phase doc rather than tidied away.
* **Screenshots:** `docs/audits/gr1-reusable-state-phase3/` — 8 PNGs through
  the REAL route and the REAL components, including the production surface
  beside the new one, unchanged.
* **Before a state-aware question can be SERVED:** frozen-state persistence
  (and a multi-state container decision); the D-20 composition policy;
  Ranked reachability (a mode, a config key, a schema branch, a readiness
  report — and an owner decision that it should be served at all); a source of
  states for when nobody types one (`SourcePolicy` ships empty); the
  three-champion `db_lookup_name` normalization gap §11 found (fail-closed, so
  coverage not correctness); four champions' undeclared rank-availability
  rules; the patch-identity mismatch; reveal wording that shows the
  arithmetic; and more than one family. Full list in the phase doc §14.
* **Rollback:** `git revert 22a1c7d9` / `bd4b78e8`. Nothing persisted, nothing
  to un-migrate, and the one consumer is behind a flag that is off.

## Reusable state — PHASE 4 DESIGN, nothing implemented (2026-09-19)

Full record: [`gr1-reusable-state-phase4-design.md`](./gr1-reusable-state-phase4-design.md).
**DESIGN ONLY. No runtime code, no schema, no migration, no persistence, no composer change.**
Backend audited at `origin/master` **`e9bdf537`**; docs base `origin/main` **`fe0804c3`**;
branch `gr1/reusable-state-phase4-design`, worktree `~/mogsy-wt-gr1-state4-design`. **Not pushed.**

* **Two measured defects on `master`, found and recorded, NOT fixed.**
  1. **`derived_used` is empty on every frozen state block the code can produce.**
     `lab.py:288` hands `freeze_resolved_state` a **flat** `used_metrics` tuple where the
     contract declares one tuple **per side**, so `set(used_metrics[0])` is a set of
     *characters* and no metric ever matches (`contract.py:619`). Measured 0 values on all four
     probe cases while the Lab's display panel beside it correctly shows 7 — the two disagree,
     and the block is the half that was going to become history. It fails **open** and it is
     **untested**: the contract tests pass correctly-shaped tuples, and the Lab test reads the
     display field. Harmless today (nothing persists it, the route is flag-off); permanent the
     moment Phase 4 persists it.
  2. **Item display names are never frozen.** A state freezes `items: [{"item_id": "4629"}, …]`
     and `display_names: ["Ahri"]` — champions only. Rendering "with Axiom Arc" requires
     re-reading `item_canonical`, whose own `availability` is `live_only`, so a renamed or
     delisted item makes a historical state unreadable. Directly violates the rule that frozen
     state must not depend on re-reading old canonical data.
* **What is persisted today, exactly.** One write-once `ranked_rounds` row per SEGMENT. The
  `KnowledgeMasteryStep` itself is **discarded** at freeze — only its projection survives — so
  `candidate_id`, `content_digest`, `fact_refs`, the per-step `patch_key_digest`,
  `difficulty_class` and `redundancy_group` are all lost. The frozen payload is fully sufficient
  to **re-display and re-grade** a question forever (proven by the double-assertion immutability
  test) and carries **nothing** about the scenario state beyond the display premise
  `prompt_semantics.scenario`, which the contract explicitly declares is not identity.
* **Recommended home: a new `mastery_state` key in `segment_private_json`**, sibling to
  `mastery_artifact`, never inside it, never in a challenge row, never public. **Zero DDL** —
  the column is TEXT, written once at INSERT and never updated (verified). The load-bearing
  reason is a safety one: `derived_used` holds the answer as a number, and
  `answer_safety.FORBIDDEN_PRE_REVEAL_KEYS` denylists `raw_value`, `result` and `value_display`
  but **not the bare key `value`**, which is what `DerivedValue` emits. A state block in a public
  payload would leak every answer and the guard would not catch it.
* **Granularity: a slice-level `FrozenStateBundle`** (ordered self-contained states + step→state
  bindings + a hoisted per-family read-set map), not one block per question. Measured: 3,920 B
  per state, 460 B per enriched step, 2,045 B of that state being `derived_used` — against
  **12,281 B** for the whole derived block, which is why only what was read is frozen. k=2/n=8
  costs ~12 KB against ~35 KB for per-question copies, and the two converge at k = n. A
  normalized table was rejected because `mastery/serving/artifact.py`'s own docstring already
  argues that case for this exact data, and adopting it would make this the first GR1 phase to
  need DDL.
* **One proposed rule did not survive measurement.** "`derived_used` = the transitive closure of
  `DerivedValue.depends_on`" is **not implementable**: `depends_on` names *axes*
  (`('ability_ranks','items')`), never metrics, so there is no metric graph to close over. The
  rule becomes "the generator's declared set, **validated** to contain every bound and answer
  metric", which `scenario.py` already produces correctly.
* **State sequences hold templates and nothing else.** `StateSequence` → `StateNode`
  (a `StateTemplate`, never a resolved state) → derived `StateTransition` (diffed, never
  authored) → `StateWindow`. The explicit break with `mastery/chains/timeline.py`, whose
  `TimelineCheckpoint` holds `questions: Sequence[PreparedQuestion]` beside its state — which is
  exactly why Journey's traversal could never share a universe with Slice. Reuse the idea of a
  checkpoint and the `TransitionType` vocabulary; reuse neither class nor engine. The attachment
  point already exists: `manifest/contract.py:98` says in its own comment that a future
  `ScenarioSource` is added to the union and the resolver's dispatch and nothing else moves.
* **A coherent Slice picks the WINDOW first, then runs the existing composer inside it.** The
  measured reason: **one state yields at most 4 questions** (one per askable ability slot — the
  probe refused `question_count=8` with "only 4 distinct publishable questions are available"),
  so n=8 requires k ≥ 2 and a single-state slice of eight does not exist. `k` is derived as the
  smallest span that fills the budget, capped at `MAX_WINDOW_SPAN` (proposed 3); an unfillable
  window is reported **under-filled**, never widened. **This inverts today's priority —
  coherence becomes hard and the budget becomes the preference.** Window choice is seeded from
  the existing `selection_salt`, with no new RNG.
* **One required composition change, and it has a precedent.** `resolver._pattern_group` is
  `champion:subject_ref:metric`, so under a window "Ahri Q cooldown at state 0" and "at state 2"
  are the same pattern and `used_patterns` would delete the progression the window exists to
  show. It must gain the state index **for state-bearing candidates only** (intrinsic ones stay
  byte-identical). This is the same shape as the Matchup rank-identity fix — an identity that
  omitted an axis the question actually varied on — which took cooldown comparisons 45,506 →
  192,562 and collapse groups 43,085 → 0.
* **Full is the same pipeline with `window = the whole sequence` and no budget.** No separate
  generation, no Full-only family. Adjacent semantic duplicates collapse to the earliest state
  by `candidate_id`, which already contains the binding, so no new dedupe rule is needed.
  Window-local policies (the tie cap, cross-state freshness) do **not** apply to Full — D-11 (a).
  Player progress keys on `(sequence_id, state_index, candidate_id)`, never `step_index` or
  `artifact_instance_id`, so it survives recomposition and reseeding.
* **First state source: `rule.haste_ladder.v1`**, a declared cumulative ladder of single
  canonical ability-haste items. The obvious choice — a level-6/11/18 progression, which needs no
  new data at all — is the **wrong** first choice and the measurement says why: the one existing
  family reads `items`, so a level-only sequence binds `{ability_haste.total: 0}` at every node
  and ships a product whose premise is decorative. The ladder moves the axis the family actually
  reads (20 → 45 → 130 AH measured), invents no data, makes no build claim, and is replaceable by
  config. `champion_item_builds.json` stays selectable-by-name and **not** the default.
* **First consumer: Champion Mastery.** Matchup has **no** state-aware generation at all —
  `generate_cooldown_under_haste` refuses a matchup state by construction — `pair_derived` is
  `None` for every Phase 2 state because every pair metric is combat, and Matchup carries three
  interacting shipped composition policies (rank identity, rank diversity, tie cap) whose
  behaviour under a window is unmeasured. Champion carries one. Nothing is foreclosed: the
  contract is kind-agnostic and A-2 is settled.
* **Backward compatibility: no migration, in either place.** `segment_private_json` and
  `quiz_attempts.provenance_json` are both TEXT holding free-shaped JSON. The block is optional
  and absent-means-unknown, with three shipped precedents in the same payload.
  `mastery_artifact` stays at `ARTIFACT_SCHEMA_VERSION = 1` because the state block is a sibling.
  **Absent and empty must stay distinguishable** — an intrinsic slice carries no bundle, never an
  empty one. Fail **closed on write** (an unexplainable served question is permanent), **soft on
  read**, and **report, never repair** on a verification mismatch. A migration would be needed
  only if state ever had to be queryable *across* rounds, which nobody has asked for; that would
  be a read model beside the row, never a replacement for it.
* **The proposed next phase is 4A and it persists NOTHING.** Fix the `used_metrics` defect with a
  test that fails at it; implement the `derived_used` rule; add the §2 fields including
  `display_labels`; add `FrozenStateBundle`; add `from_dict` and `verify_frozen_bundle` (which
  recomputes both identities from the block alone, with **no canonical read** — there is no
  deserializer for anything but `StateTemplate` today); prove the round-trip. Roughly 8 backend
  files, all already inside `GR1_PACKAGES`, **no DDL**, one revert to roll back. The reason for
  this order is the whole point: persisting is one line, the block being wrong is the risk, and
  it is currently provably wrong in two ways that a frozen artifact could never un-freeze.
* **One upstream note.** The two item-runtime commits past `22a1c7d9` modified
  `movement_speed_model.py`, which `setup_state/derive.py` borrows for `movement_speed.total`.
  Not a defect and no action needed, but it is the first live instance of the class: **a shared
  primitive borrowed by the state layer can move `resolved_state_digest` from outside this
  workstream** (and correctly leaves `semantic_state_key` alone). Any future pinned-digest test
  must be written knowing that.
* **14 proposed decisions (§13.2), none owner-approved**, plus the still-open earlier ones —
  D-6, D-13, D-17, **D-20** (which §7.2 shows stops being theoretical the moment a state source
  is chosen), the patch-identity mismatch, the three-champion `db_lookup_name` gap, four
  champions' undeclared rank-availability rules, and runes/shards.

## Reusable state — PHASE 4A IMPLEMENTED, the frozen block repaired (2026-09-20)

Full record: [`gr1-reusable-state-phase4a.md`](./gr1-reusable-state-phase4a.md).
**The block is now correct and readable. It is still written nowhere.**
Backend **`8227e4a3`** on `origin/master` (pre-rebase `96f16a08` on `gr1/setup-state-phase4a`), integration base `origin/master` **`91fd0cc5`**, implementation base **`d90fd45b`**,
worktree `~/lcs-wt-gr1-state4a`. One commit, 10 files. **PUSHED to `origin/master` 2026-09-20.**
Comparison base `~/lcs-wt-gr1-4a-base` @ `d90fd45b`.

* **The defect, measured at both SHAs.** `lab.py` handed `freeze_resolved_state` a FLAT tuple of
  metric names where the contract takes one sequence PER SIDE, so `used_metrics[0]` was a metric
  *string*, `set()` of it a set of single characters, and no metric ever matched. **0 of 162
  frozen blocks carried a derived value at base; 162 of 162 do on the branch** (1,028 values
  roster-wide), with the same 11 fail-closed refusals on both arms so nothing about which states
  resolve changed. It failed OPEN and was invisible because the Lab panel beside the block uses
  the same tuple flat, and was right — the panel showed seven values while the block below it
  recorded none.
* **The fix is the shape, not the call site.** `contract.check_used_metrics` refuses a flat
  sequence, a per-side length that disagrees with the state, and a declared metric the state does
  not carry. The last of those is fail-closed ON WRITE deliberately: a frozen artifact is never
  rewritten, so a question frozen without the value its answer came from is unexplainable forever.
* **One design rule did not survive the data.** "`derived_used` = the transitive closure of
  `depends_on`" is **not implementable**: every `depends_on` entry is an AXIS
  (`('ability_ranks','items')`), never a metric, so there is no metric graph to close over. The
  implemented rule is the generator's DECLARED set, validated to contain every bound and answer
  metric — which `scenario.py` already produced correctly.
* **Historical display metadata, captured where the names already are.** A state froze
  `items:[{"item_id":"4629"}]` and champions-only `display_names`, so rendering the build meant
  re-reading `item_canonical`, whose own `availability` is `live_only`. `display_labels` is now
  collected at NORMALIZATION, because `resolve_item` already returns `canonical_name` beside the
  id — no extra query, and no chance of naming a different row than the one that produced the
  state. Labels are never identity (asserted), and a CONFLICTING label for one id is refused.
  162/162 states label every opaque id.
* **What else the block gained:** `resolver_version` / `derivation_version` /
  `derivation_support` / `warnings` — all of which `resolved_state_digest` deliberately excludes
  (Phase 2 §11), so the block is the only place they survive; `state_index`, because a digest is
  not an order; and per step `family_id` (into a hoisted bundle-level `families` map carrying the
  read-set), `answer_metric`, `candidate_id` and `content_digest` — the last two being what a
  served slice currently loses entirely, since it keeps only the projection of a step.
* **`FrozenStateBundle`** holds ordered, self-contained states plus the step→state map, and
  **refuses a mixed basis, ruleset or rules revision**, so the self-containment is checked rather
  than tolerated. `FrozenTransition` is typed and nothing produces one, so adding transitions
  later changes no shape.
* **Reading it back — the first deserializers in the package besides `StateTemplate`'s.** Until
  now a block could be written and never parsed, so nothing could verify one.
  `verify_frozen_bundle` **reads nothing but the block** (a test monkeypatches `sqlite3.connect`
  to raise), **reports and never repairs**, and says the digest is
  `unverifiable_by_design` — it covers every derived value and the block keeps only the read ones
  — rather than silently returning "verified". `frozen.py` is declared in the isolation guard's
  CONTRACT half, which makes the no-database claim mechanically enforced.
* **Nothing moved.** A read-only two-worktree probe over 20 champion banks, 7 pairs in BOTH call
  orders and 8 published artifacts produced **identical 1,030,247-byte dumps**. `mastery/tests`
  failure SET byte-identical to base (the same five pre-existing failures), 2056 → 2109 passed
  pre-commit and 2116 / 6 skipped post-commit — the +7/−7 being the committed-footprint guards
  that skip until something is committed, the same arithmetic Phases 1 and 3 recorded. Three
  Ranked-Mastery integration files: 2 failed / 85 passed on both arms.
* **No footprint list moved.** `mastery/setup_state/` is already in `GR1_PACKAGES`. The one guard
  edit is declaring `frozen.py` in the isolation test's pinned module set, which the guard forced.
* **Still persists nothing, and the sequence/source work is untouched.** No `mastery_artifact`
  change, no round row, no review projection, no attempt provenance, no `StateSequence`, no
  source, **no `rule.haste_ladder.v1`** (the haste items in tests are literal fixtures, not a
  registered source), no Slice window, no Full, no new family, no `mastery_slice` mode, no DDL, no
  frontend change.
* **Rollback:** `git revert 8227e4a3`. Nothing persisted, nothing to un-migrate, one consumer
  behind a flag that is off.

## Reusable state — PHASE 4B IMPLEMENTED, the frozen block made durable (2026-09-20)

**COMMITTED, NOT PUSHED. Zero DDL, and in fact zero writes.** Full record:
[`gr1-reusable-state-phase4b.md`](./gr1-reusable-state-phase4b.md).

* **SHAs.** Backend **`dcfe8e2e`** (pre-rebase `906e72c2`) on `gr1/setup-state-phase4b`,
  implementation base `origin/master` **`8227e4a3`** — which IS Phase 4A. Master moved to
  **`92be472e`** during validation (one item-runtime commit, **zero `mastery/` overlap**), so the
  branch was rebased onto it and the Phase 4B patch is byte-identical before and after; pushed as
  `dcfe8e2e`. **Re-validated on the rebased tip:** `mastery/tests` 5 failed / 2186 passed, the
  failure SET byte-identical to `origin/master`'s own run (`test_audit_db` x3,
  `test_mastery_per_question_reveal`, `test_phase4f_ranked_mastery_slice`), all pre-existing and
  none touched by this phase; the answer-safety arm (`test_quiz_answer_safe_delivery`, the three
  `setup_state` suites, the state-aware Lab suite and Champion-Mastery identity) is clean. The
  real-artifact round-trip was re-run at integration over 4 canonical state-aware artifacts
  (Ahri x2, Lux, Darius) — attach → serialize → read → verify — with **0 mismatches and 0 answer
  leaks**, a tampered `semantic_state_key` raising `StateIntegrityError`, and an intrinsic payload
  gaining no key. A **wider arm** (`test_quiz_answer_safe_delivery`, `test_ranked_prototype`,
  `test_ranked_launch_readiness` and all of `quiz/tests/`) was run on BOTH arms serially — never in
  parallel, because concurrent runs share `lol_calc.db` and fabricate differences — and came back
  **44 failed / 565 passed on each**, totals identical and every branch failure present in the
  baseline set. Those 44 are pre-existing and DB/environment-dependent (`test_combat_lab_credits`
  x15, `test_quiz_history` x10, `test_quiz_packs` x6, `test_missed_questions` x5, and others); none
  of the files involved imports `setup_state`, `serving.state` or `mastery_state`. Note
  `test_realistic_cooldown_builds.py::test_a_legacy_stored_state_rebuilds_but_is_never_newly_served`
  fails on both arms and is **not** GR1 state: its "stored state" is a legacy champion-item build
  (Ahri R with Horizon Focus under the retired `ARCHETYPE_ITEMS` pairing) hitting the realism
  admission gate. Comparison base
  `~/lcs-wt-gr1-4b-base` @ `8227e4a3`, same symlinked `lol_calc.db`. Docs base `origin/main`
  **`84de68ef`**. Worktrees `~/lcs-wt-gr1-state4b` and `~/mogsy-wt-gr1-state4b`. **No frontend
  commit.**
* **Phase numbering.** The Phase 4 design §12 sketched 4B as the sequence contract and 4C as
  persistence. The owner sequenced persistence first, so **this is the design's 4C delivered as
  4B**. The sequence contract remains unstarted.
* **7 files, all inside `mastery/`** — `setup_state/persistence.py` (new, +290),
  `serving/state.py` (new, +136), `tests/test_setup_state_persistence.py` (new, +795, 63 tests),
  plus `setup_state/__init__.py` exports, 3 live tests in `tests/test_gr1_state_aware_lab.py`, and
  two guard declarations. No route, no generator, no Ranked module, no migration, no frontend.
* **The audit answered against HEAD, not against the design.** One `ranked_rounds` row per
  segment; `segment_private_json` is `TEXT`, written once at INSERT by
  `ranked_public/persistence.py:207`, never updated; built in exactly one place
  (`ranked_modules/mastery_slice.py:806`); read by exactly one renderer
  (`ranked_public/review.py:_mastery_slice_round`) and only when `revealed`; nothing splats a
  private dict into a response. Additive sibling key ⇒ **zero DDL**.
* **The constraint the design missed, and the shape that answers it.**
  `test_setup_state_isolation.py` pins **`serving → setup_state` as FORBIDDEN** with exactly one
  allowed file, by set equality in both directions. `ranked_modules/mastery_slice.py` is a serving
  module, so "`generate_segment` takes a `FrozenStateBundle`" cannot be written without widening
  that boundary for a parameter nothing would pass. The seam is therefore **split along the
  boundary**: `setup_state/persistence.py` is the typed, verifying half (declared in the guard's
  **CONTRACT** list, which is what makes "a reader cannot reach a database" mechanically enforced),
  and `serving/state.py` is the plain, structural half that imports nothing but `typing` — asserted
  from its AST. A NEW file rather than an edit to `serving/artifact.py`, which stays byte-identical.
* **Write fails closed.** `private_block` runs the full Phase 4A verification before it serialises
  anything. A caller that supplied a bundle either gets it persisted or gets an exception; there is
  no path that returns a payload with the key silently missing. A frozen artifact is never
  rewritten, so a question stored without the state its answer came from is unexplainable forever.
* **Absent is not empty.** `attach(payload, None)` returns a byte-identical copy, so an intrinsic
  artifact never gains an empty state block — and an **empty** bundle is refused at construction,
  so absence is the only way to say "not asked from a state".
* **Read never repairs and never re-resolves.** Corrupt, tampered, truncated, mixed-basis and
  future-versioned blocks all raise, with `sqlite3.connect` monkeypatched to throw to prove the
  refusal never becomes a lookup, and the block asserted byte-unchanged after a failed read.
* **Versioning: none created.** The stored object IS the bundle's plain projection, so the version
  is its own `frozen_state_bundle.v1`; `ARTIFACT_SCHEMA_VERSION` stays `1`. Absent is valid forever,
  a `frozen_state.v1` state still reads, and an unknown FUTURE version is refused rather than parsed.
* **Answer safety, proved.** The block holds the answer as a number under the bare key `value` —
  and a test asserts `"value" not in FORBIDDEN_PRE_REVEAL_KEYS`, so the structural guard **would
  not catch it**. The block is safe by placement and by never being projected whole.
  `state_review_view` is a positive allow-list carrying the premise, the identities and the metric
  NAMES, and omitting `derived_used` entirely — answer-free by construction rather than by being
  gated. Mutation-checked: removing either verification, or adding `derived_used` to the
  projection, turns **11** of the 63 tests red.
* **`review.py` deliberately untouched.** Nothing produces a state-bearing segment, so a
  `mastery_state` key would be `None` on every row that exists — a wire-contract change for a field
  that is always null. A test asserts the stronger property: `build_round_review` over a resolved
  row that DOES carry a block emits no state at all. Wiring it later is one call behind the existing
  `revealed` flag. Attempt provenance likewise untouched.
* **Nothing writes a block.** `generate_segment` is byte-identical; the caller is one line and it is
  deliberately unwritten. A test scans the tracked file list for a production importer of the seam
  and asserts there is none.
* **Nothing moved.** `mastery/tests` failure **SET** byte-identical to base — the same five
  pre-existing failures — 5 failed, 2108 → **2179** passed, 14 skipped. The +71 reconciles exactly:
  63 new + 3 new Lab + 5 new parametrized isolation cases (the guard is parametrized over the
  package's modules and `persistence.py` is one more). Six Ranked-Mastery integration files: 2
  failed / 180 passed on **both** arms. Guards + focused, post-commit: 288 passed.
* **Read-only probe.** 20 champions, 3 questions each, real canonical data: **16 tested** (4 refuse,
  the known fail-closed set), payload 173 bytes without state and ~7.5 KB with it, **0 round-trip
  mismatches, 0 real verification findings, 0 answer leaks into the projection**, served-artifact
  block unaltered in all 16. Not committed, per the project rule.
* **Still unwired, on purpose.** No `StateSequence`, `StateNode`, `StateWindow`,
  `StateSequenceSource` or `SequencePolicy` (a test asserts none of those names exists on the
  package — *superseded by the sequence/window phase, which adds them and narrows that guard to
  "persistence gained nothing from them"; see the section below*). **No `rule.haste_ladder.v1`.**
  No transitions produced. No Slice window, no
  `_pattern_group` change, no Full. No new family, no Matchup state-aware generation, no
  `mastery_slice` mode, no config key, no Ranked exposure. No DDL, no migration, no frontend change.
* **Rollback:** `git revert dcfe8e2e`. Nothing persisted, nothing to un-migrate, no production
  caller.

## Reusable state — SEQUENCE + WINDOW mechanics IMPLEMENTED, wired into nothing (2026-09-20)

Full record: [`gr1-reusable-state-sequence-window.md`](./gr1-reusable-state-sequence-window.md).
Backend **`6073e035`** (rebase of `3a202eb9`) on `gr1/reusable-state-sequence-window`, base
`origin/master` **`09d58a98`**, worktree `~/lcs-wt-gr1-seq`. Docs base
`origin/main` **`7bc6581b`**, docs commit *(this commit; a commit cannot embed its own SHA — read it with `git log`)*, worktree `~/mogsy-wt-gr1-seq`.
**BOTH PUSHED 2026-09-20 — `origin/master` is `6073e035`.** No frontend commit.

* **What it is.** The reusable ordered-state and bounded-window mechanics a future Slice and a future
  Full will both consume: `StateSequenceSource → StateSequence → ordered StateNode → derived
  StateTransition per adjacent pair → StateWindow`. **9 files, all inside `mastery/`** (4 new, 5
  modified). Three new modules live in the isolation guard's **CONTRACT** half, which mechanically
  enforces stdlib-plus-hashing imports, no reachable `sqlite3`, no file or environment access,
  integer literals restricted to `{0,1,2}` with no float, and no ability-slot letter — so no level
  cap, inventory size, unlock level or rank ceiling can hide in the sequence layer.
* **A node holds a TEMPLATE.** Never a resolved state, never a question, never presentation, and no
  cached derivation but its own verified identity. Node identity is the template's *specified* axes
  (kind + ruleset + per-side), with `template_ref`, label, `setup_source` and the basis request
  excluded, items/runes/shards as multisets, an explicit inventory slot as an input, and an
  unspecified axis **omitted rather than encoded as null**.
* **Transitions are derived, never authored.** Diff of adjacent templates over the existing CLOSED
  axis vocabulary (`form`, `position`, `level`, `ability_ranks`, `items`, `runes`, `shards`), per side
  and with the champion named, absence explicit, and a supplied set that is not the derived one
  refused. `FrozenTransition` was deliberately NOT reused: it describes two *resolved* states by
  bundle index and belongs to the durable artifact.
* **One side permutation governs the whole run.** Per-node `canonicalize_sides` would swap which side
  is "first" halfway through a **mirror** matchup, so a transition would read as both champions
  changing at once. The run computes the permutation once, from the champion slugs with node 0
  breaking a mirror tie, so `(Ahri, Syndra)` and `(Syndra, Ahri)` are one sequence and no side ever
  re-pairs.
* **A window selects states and nothing else.** Contiguous, inclusive, fail-closed on every
  out-of-range span rather than clamping, valid at one node, unable to reorder or reach outside its
  sequence, and carrying **no question selection**: `max_nodes` is a STATE count. One deterministic
  testing policy, `window.contiguous_seeded.v1`, positions the span by a `content_hash` offset over
  *every* legal start — so it does not bias to the first state — and supports a containment anchor.
  **It is not the product policy**, and its identity is recorded in every window so a later policy
  cannot inherit these windows' identities.
* **Identity.** One material, two encodings: the readable `sseq.v1:` key and the design's compact
  `sseq_` digest, over the policy plus the ordered node keys. Reversing the run moves both; the same
  ordered nodes from two different source types move neither. Window composition is `swin_` over
  the sequence id, the span, the node keys in order and the selection policy — with the seed included
  only when the policy declares it material, and **no candidate id, because no question exists at
  this layer**. Transitions get `strans_`; the design's `stxn_` stays reserved for the
  resolved-digest-linked transition identity.
* **The source contract is registered EMPTY.** `StateSequenceSource` is a runtime-checkable Protocol,
  `LiteralSequenceSource` is the only implementation, and `default_sequence_registry()` has zero
  entries — asserted, including that asking it for `rule.haste_ladder.v1` refuses. Mogzy has no
  progression authority and this phase does not invent one; `champion_item_builds.json` is not
  consumed.
* **The candidate seam is PREPARED, not wired.** `resolve_window_states(conn, window)` resolves each
  node independently through the existing `resolve_state`, fails on the first refusal with the node's
  ordinal and key added to the exception context, and never returns a partial result. No production
  caller, and none is reachable without a registered source.
* **Generator Lab: backend JSON only.** `window.diagnostic()` returns the ordered nodes, the
  transitions and the selected window, reading nothing. **No endpoint was added**: the Lab router's
  route set is pinned by exact set equality, and widening a deliberately pinned serving surface for
  an inspection a pure function already provides was the wrong trade. Frontend untouched.
* **Nothing moved.** Champion Mastery, Matchup Mastery, Ranked, the current Slice, `_pattern_group`,
  `mastery_slice.py`, `lab.py`, `scenario.py`, the Lab route, `persistence.py` and
  `mastery/serving/state.py` are all byte-identical. No `mastery_state` writer, no sequence or window
  persisted, no DDL, no migration, no new family, no Full.
* **Tests.** `mastery/tests` failure **SET** byte-identical to base: 5 failed both arms, 2179 →
  **2266** passed, and the +87 reconciles exactly as 72 new tests plus 15 new parametrised isolation
  cases. The 9-file Ranked/Mastery-slice arm is **269 passed on both worktrees**. The five
  pre-existing failures (`test_audit_db` ×3, `test_reveal_needs_no_new_persistence`,
  `test_format_for_creation_is_unaffected_by_this_module`) are unrelated and untouched.
* **Rollback:** `git revert <backend>`. Nothing persisted, no production caller, no migration.

## Screenshots / artifacts

`docs/audits/gr1-reusable-state-phase3/` — **8 PNGs (reusable state Phase 3, the
state-aware Generator Lab).** Captured with Playwright through the REAL
`/admin/ranked/generator-lab` route, the REAL `MasteryGeneratorLab`, the REAL
`MasterySliceChallengeSurface` and the REAL backend routers, against the
canonical database — no mock. The configured state, the resolved-state
context, an unanswered state-aware question, the same card answered with its
admin-only key, the scenario binding and provenance, the raw response, the
whole surface, and — the one that matters most — `08-production-surface-unchanged.png`,
the intrinsic generator beside it with no scenario clause in either its prompt
or its explanation. Capture harness notes are in the phase doc §12; both
harness files were deleted and neither is committed.

`docs/audits/gr1-matchup-mastery/` — **2 PNGs (Matchup Mastery capability audit).** Both are
the Phase 5 Generator Lab captures reproduced here because they are the only real Matchup
captures that exist: `matchup-generator-lab-phase5.png` (Ahri vs Syndra, n=3, seed `lab-demo`,
through the real Lab at backend `31c0bbe8` / frontend `ec9c8bbd`) and
`matchup-mirror-refusal-phase5.png`. **They predate the Champion readiness pass**, so the
`Fixed scenario` badge and the grey initial-letter portraits in them are STALE — both were
fixed, and the audit re-verified the fix against the live wire payload instead. Everything
else in them — the rank-silent prompt beside a `RANK 1` chip, `ABILITY R`, "more base Base
Armor", the two-champion layout, the three answer controls and the reveal — is current.
**No new capture was taken:** the session's permission classifier refused both the Browser pane
and a Playwright harness. A fresh capture would add only a mobile-width check and confirmation
of the post-readiness portrait path.

`docs/audits/gr1-champion-mastery/` — **10 PNGs (Champion Mastery capability audit).** All
end-to-end through the real Admin Generator Lab against a local backend serving the canonical
database. Note: reaching `/admin/ranked/generator-lab` required a throwaway Vite alias on
`components/AdminRoute` only (its Supabase-admin guard redirects to `/`, and the `X-Admin-Key`
fallback authorizes the backend but not the route); every rendering file was the real one, and
the harness was deleted after capture.

`docs/audits/gr1-phase5-generator-lab/` — **9 PNGs (Phase 5), and these are the end-to-end
ones now.** Captured with Playwright against a LOCAL backend serving the real canonical
database: every champion, number, option and explanation came out of the production generator
through the real Admin page. All three generators, plus coverage, the provenance panel, the raw
response, mobile width, and a refusal in the backend's own words. **Applied-chain has a
capturable UI for the first time** (`gr1p5-05`) — the note below saying it has none is
superseded.

`docs/audits/ranked-mastery-slice/` — 25 PNGs. The genuinely end-to-end ones are the `*-live-*` files
(real generation via `/dev/mastery-generated`, backend 201s): Champion Mastery (Ahri, Zed) and Matchup
(Ahri vs Syndra), unanswered + reveal + mobile. The `arena` ones come from `/dev/ranked-arena-inspector`
— **real components and real server-shaped media, but bench fixture answer options**.
Applied-chain has **no capturable UI** here (needs a real Supabase JWT); its exact render path is
documented instead (prose → `InteractiveScenarioSurface`, no media band).

## Tests run

### Reusable state — Phase 3 (2026-09-19), base `origin/master` `ca3d7333`

| Run | Result |
|---|---|
| New `mastery/tests/test_gr1_state_aware_lab.py` | **59 passed** |
| Reworked `test_setup_state_isolation.py` | 68 passed (was 64) |
| `test_setup_state_backwards_compat.py` | 25 passed (was 24) |
| `mastery/tests` + Phase 5 Lab + artifact persistence + applied chain **at the base** | 5 failed, 2068 passed, 14 skipped |
| The same four targets **at `22a1c7d9`** | 5 failed, **2146 passed**, 7 skipped |
| Frontend `MasteryGeneratorLab.test.tsx` | 45 passed (was 31) |
| Frontend `src/features/mastery` + `ranked-core` + `pages/admin/ranked` + `lib/admin` | 1 pre-existing failure, **1160 passed** |

**The failure SET is identical to the base** — the same five pre-existing
failures (three audit-DB drift, per-question reveal persistence, Ranked
default-format drift). The skip count falls 14 → 7 because seven
committed-footprint guards skip while nothing is committed and run once it is;
Phase 1 recorded the same arithmetic. One observed flake
(`test_review_is_unchanged_after_the_canonical_data_moves`, once, not
reproducible in three re-runs or in isolation on either tree) is recorded in
the phase doc §10 rather than omitted.

**Byte-for-byte invariance probe** (read-only, two worktrees, not committed):
887 champion candidates, 303 comparisons in both call orders, 12 published
artifacts and 16 `mastery_slice` preview/coverage payloads — identical
1,720,329-byte dumps.

**Roster-wide state-aware probe** (read-only, not committed): 165/173
champions, 2,356 candidates over four builds, **0 answer mismatches**,
589/589 identity equality at equal haste, 589/589 difference at different
haste, 3 champions refused by a pre-existing `db_lookup_name` gap.

### Reusable state — Phase 2 (2026-09-19), base `origin/master` `88c9f7a0`

| Suite | Base `88c9f7a0` | Phase 2 `35e08c11` |
|---|---|---|
| `pytest mastery/tests` | 5 failed, 1830 passed, 13 skipped | **5 failed, 1985 passed, 13 skipped** — the failure **SET is identical** |
| 34 focused suites (knowledge bank, champion facts, every `test_gr1_*`, identity, footprint guard, Ranked Mastery, Generator Lab) | 994 passed, 5 skipped, **0 failed** | **1149 passed, 5 skipped, 0 failed** |
| `mastery/tests/test_setup_state_resolution.py` | — | **102 passed** (new) |
| `mastery/tests/test_setup_state_backwards_compat.py` | — | **23 passed** (new) |
| `mastery/tests/test_setup_state_isolation.py` | 26 passed | **55 passed** (guard reworked, §13 of the Phase 2 doc) |
| `vitest` | — | not run — **no frontend file changed** |

The five pre-existing failures: 3 × `test_audit_db` (audit-DB drift),
`test_mastery_per_question_reveal::test_reveal_needs_no_new_persistence`, and
`test_phase4f_ranked_mastery_slice::test_format_for_creation_is_unaffected_by_this_module`
(`'ranked_points_v2' == 'ranked_modern'`). Counts reconcile: 1830 + 102 + 23 + 29 + 1 = 1985.

### GR1 generator phases (historical)

| Suite | Phase 1 (audit) | Phase 2 (after) |
|---|---|---|
| `pytest mastery/tests` | 8 failed, 1422 passed, 13 skipped | **3 failed, 1466 passed, 10 skipped** — a strict SUBSET of the 8 |
| `pytest` 8 Ranked-Mastery integration files | 160 passed | **160 passed** |
| `pytest mastery/tests/test_gr1_phase2_source_authority.py` | — | **28 passed** (new) |
| `pytest` all `test_ranked*.py` + capsule, vs a clean baseline worktree | — | **61 failed on BOTH — `diff` of the failure sets is EMPTY, zero introduced** |
| The 4 branch-footprint guards + `test_footprint_guard_split.py` | 4 failed | **166 passed, 0 failed** — resolved, see below |
| 8 Ranked `mastery_slice` integration files | — | **164 passed, 3 failed** — all 3 pre-existing on the clean baseline |
| `vitest` mastery + ranked-core modules | 422 passed (43 files) | not re-run — **no frontend code changed** |

### Phase 3 (after)

| Suite | Result |
|---|---|
| `pytest mastery/tests` | **3 failed, 1605 passed, 10 skipped** — failure-set `diff` vs a clean `origin/master` worktree is **EMPTY** |
| `pytest mastery/tests/test_gr1_phase3_composition.py` | **139 passed** (new) |
| 8 Ranked `mastery_slice` integration files | **158 passed, 0 failed** |
| 16 mastery chain/rendering/parity root files | **27 failed, 377 passed** — failure-set `diff` vs the baseline is **EMPTY** (the legacy static-set suites MC1 retired) |
| The 4 footprint guards + `test_footprint_guard_split.py` | **166 passed, 0 failed** (run against a real commit, not a dirty tree) |

**Zero regressions introduced**, by failure-**set** comparison against a clean baseline worktree at
`origin/master` with the same symlinked `lol_calc.db`. Two existing tests were updated and both are
strictly stronger afterwards — see Phase 3 doc §7. Phase 3 grew `GR1_RUNTIME_FILES` by exactly one
entry (`mastery/questions/physical_penetration_rendering.py`, the prompt fix — a rendering file, not
a generator one), pinned by exact set equality. `GR1_PACKAGES`, `BANNED_PREFIXES` and
`ALLOWED_UNDER_BANNED_PREFIXES` are unchanged, and no other workstream's footprint moved.

### Phase 4 (after)

| Suite | Result |
|---|---|
| `mastery/tests/test_gr1_phase4_artifact_persistence.py` | **19 passed** (new — the pure contract: shape, the four identities, redaction, absent-means-unknown) |
| `test_ranked_mastery_artifact_persistence.py` | **21 passed** (new — live end-to-end: serve→persist ×3 generators, resume, submit, historical immutability, identity, analytics, no materialization, fail-soft) |
| The 4 footprint guards + `test_footprint_guard_split.py` | **166 passed, 0 failed** (run against the real commit `ed254ca6`, not a dirty tree) |
| 12 QR1 attempt/persistence suites, vs a clean `origin/master` baseline worktree | **17 failed, 230 passed on BOTH — failure-set `diff` is EMPTY, zero introduced** |

The 17 QR1 failures are **all** in the three suites that build a fixture through
`db_fixture_support.clone_for_test`, and they fail **inside the fixture builder, before any
product code runs**: `MAX_FIXTURE_BYTES` is 200 MB while `HEAVY_TABLES` excludes only two
esports tables, so the current `lol_calc.db` clones over the ceiling. That is the pre-existing
`combat1-db-fixture-heavy-tables-stale` defect, and it is branch-independent. **Every fast QR1
suite passed** — including `test_attempt_recorder.py` (16) and
`test_quiz_attempts_v2_migration.py` (14), which ARE the attempt contract this phase touches.

> Both sides were run **serially**, not in parallel: concurrent pytest runs against the shared
> 5.7 GB `lol_calc.db` fabricate failures. A first, parallel attempt was discarded for that
> reason.

**The historical-immutability proof is a double assertion, not a single one.** The test
freezes a Zed slice, plays it to completion, shifts the cooldown values at the seam the
generator reads through, and asserts (a) the match review is byte-identical and the attempt
rows are unchanged, AND (b) a freshly generated slice for the same champion now has
*different* answers. Without (b), the equality in (a) would also be satisfied by a mutation
that never happened.

**Phase 4 grew `GR1_PACKAGES` by exactly one entry** (`mastery/serving/`) and
`GR1_RUNTIME_FILES` by three (`ranked_public/review.py`,
`services/attempt_recorder.py`, `test_ranked_mastery_artifact_persistence.py`), each
re-pinned by exact set equality in `test_footprint_guard_split.py` so the growth is a
deliberate, reviewable edit. `BANNED_PREFIXES`, `ALLOWED_UNDER_BANNED_PREFIXES` and the
Mastery and Builder footprints are unchanged, and no other workstream's footprint moved.

### The footprint guards — RESOLVED (`77bae306`)

**Root cause, verified independently.** The four guards run `git diff --name-only
origin/master...HEAD` and assert every changed file starts with `SLICE_FOOTPRINT`
(`mastery/tests/facts_support.py`). Exactly **seven** of the branch's 17 changed files fell outside
it: `mastery/provenance/{canonical_patch,certified_provenance}.py`,
`mastery/synthesis/{applied_chain,errors,preflight,service}.py` and the root file
`test_ranked_mastery_applied_chain.py`. Not one of them is a boundary violation — `SLICE_FOOTPRINT`
was written as the union of the Mastery redesign slices and the Ranked Admin Builder, and it
**predates `mastery/synthesis/` and `mastery/provenance/` entirely**. The guards were never told the
production generator package exists.

**Fix — the smallest one that keeps the guards honest.** A third named workstream footprint,
`GR1_FOOTPRINT`, declared alongside the other two rather than widening either of them:

- `GR1_PACKAGES = ("mastery/provenance/", "mastery/synthesis/")`
- `GR1_RUNTIME_FILES = ("test_ranked_mastery_applied_chain.py",)`
- `SLICE_FOOTPRINT` becomes the union of **four** lists.

Nothing was weakened. `BANNED_PREFIXES` is byte-identical and `ALLOWED_UNDER_BANNED_PREFIXES` is
**unchanged** — GR1 touches no banned prefix at all, which is itself the evidence.
`test_footprint_guard_split.py` now runs its non-overlap guard **pairwise over all three**
workstreams, checks the shared file against all three, and pins `GR1_PACKAGES` and
`GR1_RUNTIME_FILES` by **exact set equality**, so any later growth of GR1's allowance is a
deliberate, reviewable edit and never a quiet one. Neither the Mastery nor the Builder footprint
gained a single entry, and no product behaviour was changed to satisfy a test.

**Result: 166 passed, 0 failed** across the four guards and the split test.

### The remaining 3 failures are pre-existing — proven, not asserted

A clean detached worktree at `origin/master` (with the same `lol_calc.db`) fails **8**:
2 x `test_audit_db`, 5 x `test_cross_check_db`, and the stale
`ranked_modern`/`ranked_points_v2` expectation in `test_phase4f`. The branch fails **3** — the
`test_audit_db` pair and the `test_phase4f` expectation. The 5 `test_cross_check_db` failures are
**resolved by Phase 2 without changing a value**. The branch's failure set is a strict subset of
the baseline's: **zero introduced.**

> A fresh worktree auto-creates an empty stub `lol_calc.db` and fails 85. The baseline was only
> valid once its `lol_calc.db` was symlinked to the primary checkout's. Do not compare against an
> unlinked worktree.

### Historical identities — untouched, deliberately

Syndra R and Maokai Q keep their legacy `SourceBinding` provenance labels. Correcting them would
move the pinned `mastery_set_id` of the `first_ahri_syndra` artifacts (78 tests). No
re-certification and no historical-ID migration was performed. Owner decision 6 below stands open.

**(Superseded — kept for history.) 4 of those 7 were branch-footprint guards, and they were
structural.** The Mastery isolation
guards run `git diff origin/master...HEAD` and assert every changed file falls inside
`SLICE_FOOTPRINT` (`mastery/tests/facts_support.py`); they **skip when nothing is committed**,
so they pass on a dirty tree and fail once you commit. That footprint belongs to the Mastery
redesign slices and the Ranked Admin Builder — it **predates `mastery/synthesis/`**, the
production generator package that is GR1's whole subject. Proven on the clean baseline worktree:
a one-line commit touching only `mastery/synthesis/service.py` fails all four identically, while
one touching only `ranked_public/readiness.py` passes. **They were not widened** — doing so
silently would be another workstream's boundary moved to suit this one. See Phase 2 doc §11 item 7.

The other 3 are **pre-existing and unrelated**, and are a strict subset of the original 8:
2 × `test_audit_db` (the audit's "needs triage" pair) and the stale `ranked_modern` vs
`ranked_points_v2` expectation. The 5 certified-vs-DB failures are resolved **without changing a
value**. The 61 ranked failures are pre-existing on clean master too — mostly a stale
`create_bot_match(difficulty=…)` signature — and are out of scope. Nothing is hidden.

Failure **sets** were diffed against a clean baseline worktree, not totals, per project rule.

## Unresolved (need owner/admin access, or an owner decision)

1. Does **production** have a `target='public'` format row? (Admin API returned **403**.) *Open.*
2. Is `RANKED_MASTERY_SLICES_ENABLED` set in production? Are the modern capability flags set? *Open.*
3. Has an admin-bot Mastery Slice match ever been played in production? *Open.*
4. ~~For each certified-vs-DB divergence, which store wins?~~ **ANSWERED by measurement:** the
   certified Python wins in all six cases, production agrees with it, and the local DB is stale.
5. **Should a Ranked Mastery answer pay quiz XP, streak and category progress?** Phase 4 records
   the attempt but applies **none** of them (`apply_progress=False`), because Ranked already pays
   Elo and changing the XP rules was explicitly out of that phase's scope. It is one argument
   away if the owner wants it. *Open — owner decision.*
6. **Should `time_taken_ms` be recorded on a generated attempt?** It is `NULL` today. Per-challenge
   response time with reveal compensation is derived by `segment_flow` at RESOLVE, not at submit,
   and moving the attempt write to resolve time would forfeit the first-write idempotency
   guarantee that makes duplicates structurally impossible. *Open — needs a design call, not just
   a yes.*
7. **Should `difficulty` be frozen onto the step so attempts can carry it?** It is `NULL` today
   because `difficulty_class` exists on every candidate but not on the frozen step. This is the
   same data the largest open composition lever needs (difficulty as a composition input), so the
   two belong in one phase. *Open.*
5. Should `mastery_slice` enter a public format at all, and in which mode? *Open — the single
   largest remaining decision. Phase 5 gives an operator everything needed to answer it by
   looking: run any subject, see the real questions, read the coverage.*
8. **NEW — should the Phase 5 branches be pushed?** Both targets auto-deploy (`origin/master`
   → Railway; `origin/main` → what Lovable publishes from, and a push alone does not publish).
   The commands are in the Commits section above. *Open — owner action.*
6. **NEW — owner decision.** Syndra R and Maokai Q carry correct values under a `SourceBinding`
   that names the superseded spreadsheet. Correcting the label changes the pinned `mastery_set_id`
   of the legacy `first_ahri_syndra` artifacts (78 tests fail). Re-certify and re-pin, or leave
   labelled? The checker reports it either way.
7. **NEW — owner decision.** `SLICE_PATCH_DESCRIPTOR`'s machine revision fields are still pinned
   literals and are the certified-adapter registration key. Re-sourcing them moves
   `patch_key_digest` and breaks adapter routing — that is a re-certification pass.
8. **NEW — operator action.** Three abilities cite a newer wiki revision in `champion_abilities`
   than the cooldown artifact does. Remedy is mechanical: re-run
   `scripts/dc1_ability_semantic_audit.py` (live wiki requests; rewrites a committed artifact).
9. **NEW — data.** Camille W and Kalista E disagree between `champion_abilities` and the wiki
   authority. Now reported; the projection already refuses to certify them. CHAMPDATA lane item.
10. ~~**Four Mastery branch-footprint guards fail on any branch that touches
    `mastery/synthesis/`.**~~ **RESOLVED in `77bae306`** — a third named `GR1_FOOTPRINT` tuple was
    added the way `RANKED_BUILDER_FOOTPRINT` was, pinned by exact set equality. Full reasoning in
    "The footprint guards — RESOLVED" above. No other workstream's boundary moved.
11. **housekeeping.** This handoff, the Phase 1 audit, `docs/audits/` and the Phase 2 and Phase 3
    docs are all **untracked** in `mogsy`. Phases 2 and 3 kept that convention rather than committing
    the set unilaterally. Committing them is an owner call.
12. **NEW — owner decision, blocks Applied-chain expansion.** Widen the 6-champion certified slice by
    hand (linear, safe, keeps Phase 2's provenance guarantee), or source the applied-chain generator
    from canonical `champion_ability_formulas` / `champion_stats` (roster-wide in one step, but it
    becomes a second consumer of canonical ability formulas and inherits CHAMPDATA's open defects —
    including the AD-ratio *kind* gap pass 6D found, which would produce wrong answers rather than
    refusing). Full reasoning: Phase 3 doc §9. **The canonical route is not available until the
    ratio-kind field is canonical and CHAMPDATA's confirmed defects are closed for the abilities in
    scope** — both CHAMPDATA lane items, not GR1's.
13. **NEW — serving policy.** `champion_base_stat` is rejected for **atomic** recall roster-wide as
    `family_unmapped`, so Champion Mastery diversity is capped at three categories and a genuinely
    diverse part of the bank is unservable. (It IS eligible as a **comparison**, which is why Matchup
    uses it.) Mapping the family is a serving-policy decision with its own owner; Phase 3 measured it
    and did not touch it.
14. **NEW — data.** `Ohmwrecker (Turret Item)` sits in the canonical penetration item pool (0 AD,
    30% armour pen) and is offered as a champion applied-chain scenario. It survives Phase 3's
    mechanic collapse because its derivation is genuinely unique. An `item_canonical` classification
    question, not a composition one.

## GR1 Phase 2 is COMPLETE and MERGED

Reconciled against `origin/master` @ `705cdefe` — no concurrent overlap existed. Guards resolved
without weakening them. Historical `mastery_set_id`s untouched. Branch
`gr1/phase2-source-authority` @ `77bae306` is **on `origin/master`** — the owner performed the
merge. Nothing further is outstanding for Phase 2.

## GR1 Phase 3 is COMPLETE

Reconciled against `origin/master` @ **`db709873`** — upstream moved ten JQ1 commits with **zero
file overlap**; rebased onto them anyway and re-verified, with a **byte-identical** composition
probe before and after. Verification clean by failure-**set** comparison against a clean baseline
worktree: **zero regressions introduced**. Branch `gr1/phase3-generator-quality` @ **`b499d80f`**
is **pushed to `origin`** and is a clean **fast-forward** onto `master`.

**What Phase 3 changed, in one line each:** a short Champion slice spans every category the champion
has instead of being all cooldowns (503/519 → 211/519 roster-wide); a Matchup slice leads with
comparisons in the sequence as well as the budget; applied-chain no longer publishes one arithmetic
problem four times, and its prompt now states the item bonus AD the answer depends on; and one
shared invariant module states what makes any of the three generators' output a usable question.

### ONE OWNER ACTION REMAINS — the merge to `master`

The final `git push origin gr1/phase3-generator-quality:master` was **not performed**: pushing
`master` auto-deploys to production, and the agent session's safety classifier blocks that push.
The merge is otherwise ready and requires no rebase, no conflict resolution and no further review.

**Phase 3 is already merged** — `origin/master` contained `b499d80f`. The command below is the
**Phase 4** one.

```bash
git -C /Users/macmoney/lcs-wt-gr1p4 push origin gr1/phase4-artifact-persistence:master
```

Or open the PR: `gr1/phase4-artifact-persistence` → `master`. Either way it is a fast-forward of
one commit (`ed254ca6`).

**What deploying Phase 4 actually changes in production.** No visual, no wire field and no
mechanic: the public segment payload is pinned at its pre-phase six keys by a test. Two things
start happening, both invisible to a player:

* every `mastery_slice` segment opened from now on freezes a `mastery_artifact` block into its
  private payload (a few hundred bytes on the round row);
* every challenge answered by a real account in one of those segments writes one
  `quiz_attempts` row with `source='ranked_mastery'` — **no XP, no streak, no category
  progress, no achievements**.

Because no public Ranked format names `mastery_slice` and all 29 stored configs are
`target='admin_bot'`, that means admin-bot matches only, today. **Zero DDL**, so there is no
migration to run and nothing to sequence: `quiz_attempts` v2 is already live in production, and
`segment_private_json` is JSON. Segments frozen before the deploy are unaffected — every reader
treats a missing block as "predates the contract".

**(Superseded — kept for history: the Phase 3 owner command was
`git -C /Users/macmoney/lcs-wt-gr1p3 push origin gr1/phase3-generator-quality:master`.)**

**What deploying actually changes in production:** nothing a player can currently reach, because no
public Ranked format names `mastery_slice` (fact 1 above) and all 29 stored Mastery-Slice format rows
are `target='admin_bot'`. For those admin-bot matches the behavioural delta is real and is the point:
a generated Champion slice draws from every category the champion has instead of only cooldowns, a
Matchup slice never opens on single-champion recall, and an applied-chain request beyond 14 questions
is refused instead of served with a repeat. Generated `mastery_set_id`s and `artifact_digest`s move
for Champion and Matchup, because the composition they identify changed — that is correct, and no
historical or hand-authored artifact identity is affected (the applied-chain prompt change moves no
identity at all, since prompt text is not in `identity_material`).

## Next task

**GR1 reusable state — Phase 4, not yet scoped, and it needs its own approval.**
Phase 3 proved the seam in the Lab. The next thing it is missing is the one
that gates everything else: **frozen-state persistence** —
`FrozenStateArtifact` is computed and written nowhere, and it is currently one
block per state, so a Slice window over more than one state needs a container
decision first (`StepBinding` already carries the digest, so the type does not
move). Everything else on the road to serving a state-aware question to a
player is listed in [`gr1-reusable-state-phase3.md`](./gr1-reusable-state-phase3.md) §14.
**Do not widen Phase 3 into a family-expansion project**; one family is the
seam, and a second one before persistence exists buys nothing.

**Current next task — candidate composition over a window, Generator Lab only.** The
sequence/window mechanics now exist and are wired into nothing (see the row above and
[`gr1-reusable-state-sequence-window.md`](./gr1-reusable-state-sequence-window.md) §13). The seam
stops at `StateWindow → resolve_window_states → (next phase starts here)`. The next phase generates
the EXISTING state-aware candidates per resolved state and composes them over the existing supplied
-universe manifest seam, in the Lab only, over the ONE existing family. It has to decide three things
nothing before it should assume: **how many questions a window yields and from which of its states**
(`max_nodes` is a state count on purpose); **whether a multi-state `FrozenStateBundle` is written**,
which is the first thing that would produce a non-empty `FrozenTransition` tuple; and **what the
first real source is** — a product window policy chosen before a real source exists would be fitted
to a fixture. Do NOT register `rule.haste_ladder.v1`, change Slice composition or `_pattern_group`,
or add a family as part of it.

**Superseded — GR1 Phase 5 — not yet scoped.** (Phase 4 is done; see below.)

**Superseded note, kept for history — GR1 Phase 4 — not yet scoped.** The generators now compose sensibly and the foundation under them
is trustworthy. Still untouched, each needing its own phase: public Ranked rotation, Admin Quiz
Review support, `quiz_attempts` integration, user history, and visuals.

**Before anything else:** confirm whether the owner has merged
`gr1/phase4-artifact-persistence` into `master` (the owner command is at the end of this file).
Phase 3 is already merged — `origin/master` contained `b499d80f`. Pushing to `master`
auto-deploys to production.

The two open **generator** items, in priority order:

1. **Difficulty is not a composition input.** `difficulty_class` is on every candidate and
   `SelectionRequest` can already filter on it; nothing does, so a slice has no easy→hard
   progression. This is the largest untaken composition lever and it needs no new data.
2. **The Applied-chain generalization decision** — see Phase 3 doc §9. Coverage is gated by the
   6-champion certified slice, not by the generic chain code. Widening it by hand is linear and safe;
   sourcing the chain from canonical data is roster-wide in one step but makes applied-chain a second
   consumer of canonical ability formulas and **cannot be done until the AD-ratio *kind* is canonical
   and CHAMPDATA's confirmed defects are closed for the abilities in scope**. Owner decision 12 below.
   Phase 3 built nothing toward either.

Also open, and not GR1's to decide: **`champion_base_stat` is unservable as atomic recall**
roster-wide (`family_unmapped`), which caps Champion diversity at three categories. Owner decision 13.
