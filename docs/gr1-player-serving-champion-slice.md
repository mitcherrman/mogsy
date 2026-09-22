# GR1 — First playable state-aware Champion Slice (`mastery_slice.state_aware.v1`)

**IMPLEMENTED, INTEGRATED AND PUSHED (2026-09-22).** A Ranked `mastery_slice` segment can now
serve the certified state-aware machinery to a player, end to end. The segment freezes its
`FrozenStateBundle` in `segment_private_json`, and review reads that bundle back. No new Ranked
module, no new engine, no DDL, no frontend change. The legacy Champion Slice is the default and is
byte-identical. The defaults below are **provisional**. They exist so the owner can playtest, and
they are not product decisions.

| | SHA | Note |
|---|---|---|
| Audited base (brief) | `origin/master` **`cf5c1fd5`** | The brief named `666281e5`. Master had moved 3 commits (pro-stats + PSE docs), with zero `mastery/` overlap. |
| Upstream bugfix | **`62c20fbd`** on `origin/master` | Standalone. `ranked_public/service.py` called `projections._session_preset` with no import, since `177bc0cb`. One import line plus `test_ranked_service_global_names.py`, which resolves every global name the service's own functions read. |
| Test-fixture repair | **`ef01ed2d`** on `origin/master` | Standalone, test-only. Since RP1 v2 (`8e37b00e`) a points format must declare `match_length`; the two Mastery suites never did, so both had been dying in fixture construction. Repaired, all 63 pass — and 14 of them fail with the NameError `62c20fbd` fixed, so these are the suites that should have caught it. |
| Backend commit | **`ba53f818`** on `gr1/player-serving-slice` | Worktree `~/lcs-wt-gr1-serve`. Authored on `cf5c1fd5` as `b1d9fd24`, rebased onto `9ebe7310` as `46c8b64d`, then rebased **cleanly** (zero conflicts) onto the repaired `origin/master` `ef01ed2d`. |
| Comparison base | `~/lcs-wt-gr1-serve-base` detached @ `ef01ed2d` (earlier @ `9ebe7310`, `cf5c1fd5`) | Uses the same symlinked read-only `lol_calc.db`. |
| Docs base | `origin/main` **`1a7025e9`** | Earlier `1b9ff1e5`; the original brief named `57344a41`. |
| Frontend | **none** | The existing renderers already handle both state-aware templates, and the Builder renders the new optional enum generically. |

---

## 1. The serving path (audit), and where the state-aware path enters

```
Format (public / preset) → service._open_segment → service._generate_segment(:1519)
  → MasterySliceModule.generate_segment            ranked_modules/mastery_slice.py
      parse_mastery_slice_config                   ranked_modules/mastery_config.py
      ── legacy ──> _publish_on_demand → synthesize_champion_mastery / matchup / chain
      ── NEW ────> _generate_state_aware → ranked_modules/mastery_state_slice.compose
                        → mastery/setup_state/slice_serving.compose_state_slice
      _freeze_segment  (ONE freeze, shared)  → public + private payloads
  → rp.insert_round → ranked_rounds.segment_private_json   (write once, never updated)
answer:   validate_challenge_input / challenge_is_correct (evaluate_answer, frozen row)
reveal:   service.segment_state_view → module.challenge_reveals (frozen private row)
resolve:  resolve_segment → points/HP via the unchanged Ranked shell → next segment
bot:      bot_challenge_input / drive_bot_match (same frozen rows)
attempts: attempt_material → served_artifact.attempt_provenance → quiz_attempts
review:   service.get_match_review → review.build_round_review → _mastery_slice_round
admin:    ranked_public/mastery_preview.preview_segment (runs the same generate_segment)
```

**The seam is one branch inside `generate_segment`, placed after the config parse.** Everything
downstream consumes the same public/private payload shape: payload split, grading, bot, reveal,
resolution, attempts, and review. The state-aware path returns what the legacy synthesizer returns,
a `PublishedArtifact` plus its ordered steps. Those are frozen by the same `_freeze_segment`, which
was extracted from the old body. With no optional arguments it adds nothing, so legacy output is
byte-identical (§9).

## 2. Mode and switch

* **Serving mode id:** `mastery_slice.state_aware.v1` (`slice_serving.SERVING_MODE`).
* **Config switch:** add one optional key to the **existing champion config**:
  `{"mastery_mode":"champion","champion_id":"ahri","slice_policy":"mastery_slice.state_aware.v1"}`.
  An absent key or `"legacy"` gives the legacy Slice. On normalisation the key is dropped for legacy,
  so a legacy config never gains it. Only champion mode accepts it. Matchup and applied chain refuse
  it, and any unknown value is refused. No new `MODE_`.
* **Builder:** an optional enum called "Slice policy" appears only when the mode is Champion. Its
  options are "Champion Slice (current)" and "State-aware Champion Slice (playtest)". "Add module"
  still inserts the legacy Slice.
* **Bot playtest without touching the public format:** there is a new RB3 session preset,
  **`state_slice`**. It is unrated.

  > **⚠️ Authorization is wider than intended — owner decision outstanding.** The code comment and
  > an earlier draft of this document both said "same authorization as `playtest`". That is **not**
  > what the route does. `_authorize_preset` returns early for any preset that is not exactly
  > `PRESET_PLAYTEST`, so `state_slice` never reaches the playtester-grant check; the only gate it
  > actually clears is `_authorize_ranked_bot`, i.e. **admin OR any Mogzy Premium account**. Nothing
  > is exposed to Free accounts, and the public format is untouched, but a Premium subscriber who
  > sends the preset by hand can reach the prototype. Narrowing it is one line in
  > `routes/ranked_public.py` (`if preset not in (PRESET_PLAYTEST, PRESET_STATE_SLICE): return`);
  > it was left alone here because changing an authorization surface is a product call, not a
  > rebase. Its format holds 5 state-aware Slice segments of 3 questions each, with champions
  spread evenly across the identity registry (currently aatrox, fiora, leblanc, quinn, tristana).
  Since RB2.1, Bot Ranked plays the **public** format, and the `admin_bot` target is dormant.
  Reach the preset with `POST /api/ranked/queue {match_with_bot:true, preset:"state_slice"}`. No
  frontend button sends this preset yet (`PlaytestMatchHost` hardcodes `"playtest"`). The other way
  to play is the Format Builder on `public`.
* **Rollback:** remove the key, or revert the commit. Nothing is migrated. A historical row with a
  block keeps reading, because review needs only the payload.

## 3. Provisional policy (`ProvisionalServingPolicy`, all fields are owner knobs)

| Knob | Default |
|---|---|
| `profile_weights` | snapshot 1, tight 2, early_phase 2, wide 2, full_range_sample 2 |
| budget | the segment's `challenge_count` (Builder default **3**; preset 3) |
| `anchor_redraws` | 2 (anchored profiles only: Snapshot, Tight) |
| `max_attempts` | 8 |
| `rank_progression` | on: level + a stated legal rank order where the rules declare ranks |
| `composition_policy` | `composition.lab_profile_gate_aware.v2` |
| `family_ids` | `combat_cooldown`, `champion_stat_level` |

**Determinism.** The first profile is drawn by weight from the segment seed
(`order_seed:segment_number`). Unsalted admin/preview paths use `unsalted:<match>:<segment>`. The
attempt plan is the first profile, then its anchor redraws, then the other profiles in seeded
order, each with its own redraws. It is capped at `max_attempts`. Every attempt runs under its own
seed `seed|profile|draw`.

**Rank order.** `ChampionProgressionSource` still derives no skill order. The serving policy is the
*caller* that states one. The order comes from legality alone: take the ultimate's next rank
whenever it is available, otherwise the first kit slot that has a legal next rank. Its authority
string claims nothing more (`FORBIDDEN_CLAIMS` is checked). The 9 rank-gap champions (elise, jayce,
karma, nidalee, udyr, yuumi, dr-mundo, nunu, renata) refuse that run in the rules layer's own words.
The Slice then walks **level-only** progression, and the refusal is recorded in the diagnostic. No
recommended build, item timing or rune timing is invented, and no items are held, so cooldown
questions are asked at 0 AH.

## 4. Fallback

```
attempt i (profile, seed) → run_profile(v2) → feasible? → publish → bind → verify → SERVE
                                  └ infeasible → record {code, supply_codes, feasible_count} → i+1
after max_attempts → StateSliceUnavailable(log)
   → carrier falls back to the LEGACY Champion Slice for the same champion
     (private state_slice.outcome = "fallback_legacy", reason + full log;
      artifact serving.fallback_used = true; no mastery_state key)
integrity failure (bundle doesn't verify, published ≠ composed/bound, private_block refuses,
   gate refuses a preflight-accepted set) → RankedServiceError, FAIL CLOSED, no fallback
```

A partial module is never served, and the carrier asserts `len(steps) == challenge_count` again
itself. A champion with no buildable progression counts as *supply*, and it takes the legacy
fallback.

## 5. Persistence

* **Location:** `ranked_rounds.segment_private_json["mastery_state"]`. This is the existing TEXT
  column. The key is the one Phase 4B designated, and it sits beside `mastery_artifact`. **Zero
  DDL.** A median block is ~13.5 KB.
* **Write:** `slice_serving` calls `persistence.private_block(bundle)`, which verifies or raises.
  The adapter re-checks the result with the plain `serving.state.assert_state_block`. The carrier
  calls `serving.state.attach`. There is no path that stores a payload with the key silently
  missing.
* **Binding:** challenge *i* is bundle step *i*. Before anything is frozen, the published steps are
  checked against the bindings by `candidate_id` and `content_digest`.
* **Also private:** `state_slice`, the serving diagnostic (§8). The served-artifact block gains
  `generator_version: champion.state_aware.v1`, `subject_key: champion_state:<id>` and an
  allow-listed `serving` record.

## 6. Review / history

`review._mastery_slice_round` → `mastery_state_slice.review_state(private)` →
`persistence.read_block` (parse + verify, no DB) → `state_review_view`. The key is added **only**
when the row carries a block **and** the segment is resolved. Legacy rows are unchanged, with no key.
A corrupt block gives `{"status":"refused","code":…,"view":null}`. It is never repaired or
re-resolved, and question review still renders from the frozen challenges. The view is the Phase 4B
answer-free allow-list: premise, identities, provenance, metric names and bindings, with no
`derived_used`. Nothing reads current canonical data: after mutating `champion_stats`, the review
is byte-identical, while regenerating from the same seed gives different answers.

## 7. Private/public projection proof

The public payload comes from `PUBLIC_CHALLENGE_FIELDS`, and no field was added to it. The E2E
tests check `mastery_state`, `derived_used`, `pair_derived_used`, `semantic_state_key`,
`resolved_state_digest`, `frozen_bundle_schema_version`, `source_provenance`, `data_basis` and
`state_slice` against the public payload, `public_view`, `segment_state`, `segment_reveal_items` and
the pre-resolution review, and none of them appear. `assert_pre_reveal_safe` passes on all of
them. Per-challenge reveals still carry only `REVEAL_FIELDS` for challenges the player has already
answered. The state review view is answer-free and appears only after resolution. The roster smoke
found 0 leaks in 1,730 segments.

## 8. Admin / internal diagnostic

The private `state_slice` holds: the serving mode, the full policy, champion, progression (source,
mode, sequence id, rank refusal), `profile_id` / `profile_key` / `scope_instance_key`, the
composition policy and key, the budget, the initial and final profile, `fallback_used`, the attempt
log, eligible and selected ordinals, selected levels, the state range, the selected questions
(candidate id, family, metric, subject, ordinal), and the bundle digest, state count and step count.
The admin preview (`mastery_preview.preview_segment`) now returns it as `state_slice`, for
state-aware configs only. The Lab diagnostics are unchanged.

**Analytics:** the served artifact's `serving` record is `slice_mode`, `serving_policy`,
`profile_id`, `composition_policy`, `question_budget`, `fallback_used` and `progression_mode`. It
passes through `review_view`, and so into `quiz_attempts.provenance_json`. No new subsystem was
added.

## 9. Compatibility / invariance

* A **byte-identical dump**, base vs branch, on the earlier bases (`cf5c1fd5` and `9ebe7310`);
  re-verified on `ef01ed2d` by the 120-case digest in §11. It covers
  legacy champion (×7), matchup (×2) and applied-chain segments × 3 seeds × 3 counts, with and
  without a reveal window. It also covers every Lab `profile_diagnostic` rendered through the
  production publish: 4 champions × 5 profiles × v1/v2 × {cooldown-only, mixed}. Both files are
  1.84 MB and `cmp` identical. This includes the `window_lab._render` → `publish_composed`
  extraction.
* v1 remains the Lab default, and no Lab entry point changed its default.
* An explicit `"legacy"` produces the same segment as an absent key. Legacy private keys are still
  exactly `module_id, module_version, challenges, mastery_artifact`.
* Matchup, applied chain and non-Mastery modules are untouched. Old rows need no migration.

## 10. 173-champion serving smoke (real `generate_segment`, read-only DB, not committed)

The smoke ran 173 champions × 10 seeds at budget 5 through the real
`MasterySliceModule.generate_segment` — **1,730 segments**, re-run on the final rebase
(`ba53f818` on `ef01ed2d`). Seeds were chosen from a 40-seed probe so that all five profiles appear:
profile selection is a function of the seed alone, not of the champion, so an arbitrary seed set
silently exercises only two or three of them.

| Metric | Result (re-verified `ba53f818`) | Earlier run |
|---|---|---|
| served state-aware, full budget | **1,730 / 1,730** | 1,730 / 1,730 |
| crashes / partial modules | **0 / 0** | 0 / 0 |
| legacy fallbacks | **0** | 0 |
| public leaks (`answer_safety.assert_pre_reveal_safe`) | **0** | 0 |
| segments missing a `mastery_state` block | **0** | 0 |
| review of the persisted block | **1,730 verified, 0 refused** | 1,730 verified |
| determinism (every case regenerated) | **1,730 / 1,730 identical** | sampled |
| final profile | tight 519, wide 346, full 346, snapshot 346, early 173 | early 408, wide 398, full 374, tight 349, snapshot 201 |
| fallback within state-aware | 21 (all Snapshot; anchor redraw) | 10 |
| progression | level+ranks 1,640; level-only 90 (exactly the 9 rank-gap champions) | same |

Counts that depend on the seed set (profile mix, Snapshot redraws) differ from the earlier run
because the seeds differ; the invariants — full budget, no crash, no leak, no legacy fallback, every
bundle verifying, deterministic reruns — are unchanged. The harness is not committed.

## 11. Tests

Run with `.venv/bin/python -m pytest … -p no:randomly`.

* **New:** `mastery/tests/test_gr1_player_serving_policy.py` has **45 tests**. They cover the
  policy, the attempt plan and weights, the legal rank order, all 9 rank-gap champions, Snapshot
  level-1 redraw, bounded unavailability, the carrier's served/fallback/fail-closed paths
  (persistence, binding mismatch, plain-half refusal), the public boundary, verified and corrupt
  review with no DB access, the config switch and its refusals, the Builder field, readiness and
  the admin preview.
* **New:** `test_gr1_player_serving_slice.py` has **9 end-to-end tests** through the real Ranked
  service. They cover serving + bindings; the leak check; play → reveal → complete → review →
  canonical mutation → unchanged; a patch that really changes answers (Karma); corrupt-bundle
  refusal; legacy untouched; rank-gap level-only; the `state_slice` bot preset playing into the next
  module; and the preset format.
* **Guards updated deliberately.** The isolation allow-list gains exactly one entry,
  `ranked_modules/mastery_state_slice.py`, which is also declared in `GR1_RUNTIME_FILES`. The
  earlier guards that said "not wired yet" now assert the new truth: the carrier *imports* nothing
  from `setup_state`, and the pinned seam callers are exactly `mastery_slice.py`,
  `mastery_state_slice.py` and `review.py`. The earlier phases' footprint guards now excuse exactly
  `facts_support.GR1_PLAYER_SERVING_FILES`. The builder-catalog key pin gains `slice_policy`.

**Failure-set comparison (on the final base, `ef01ed2d`):**

| Arm | Base | Branch | Set |
|---|---|---|---|
| `mastery/tests` + both repaired Mastery suites + builder + the new guard | 11 failed / 2829 passed | 11 failed / 2887 passed | **identical failure set** (verified by diffing the sorted `FAILED` lines) |
| 54 phase tests (45 policy + 9 E2E) | n/a | **54 passed** | — |

The 11 remaining failures are pre-existing on master and untouched by GR1 (`test_audit_db`,
`test_mastery_per_question_reveal`, `test_phase4f_ranked_mastery_slice`,
`test_phase5_mastery_slice_config`). The branch adds 58 net passing tests and removes none.

**Legacy invariance, re-verified on `ef01ed2d`.** A digest over 120 legacy cases — 12 champions,
5 matchups and 3 applied chains × 3 seeds × 2 counts, hashing the full public *and* private payload
— is **byte-identical** between base and branch, including 12 identical refusals for uncertified
chains. Separately, `slice_policy: "legacy"` hashes equal to an absent key on all 72 champion cases,
and the base *refuses* the key on all 72, confirming the key is genuinely new and no saved format
can already carry it.

**The upstream break is fixed.** `177bc0cb` added `projections._session_preset(match)` to
`ranked_public/service.py` with no import, so every generated-Mastery challenge submission — legacy
included — raised `NameError` once it reached attempt recording. Fixed on master as **`62c20fbd`**,
separately from this feature. Note that the 21/21 failure of
`test_ranked_mastery_artifact_persistence.py` was *not* caused by that import: those tests were
dying earlier, in fixture construction, on the unrelated `match_length` drift repaired by
**`ef01ed2d`**. With the fixtures repaired and the import removed, 14 tests fail with the exact
`NameError` — which is how the two defects were finally told apart.
