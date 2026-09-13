# GR1 Phase 5 — the Admin Generator Lab

> Read [`RANKED_MASTERY_SLICE_HANDOFF.md`](./RANKED_MASTERY_SLICE_HANDOFF.md) first.
> Phases 1–4 are not re-audited here. This document covers only what Phase 5 added.

**Status: COMPLETE.** Backend branch `gr1/phase5-admin-generator-lab` @
**`31c0bbe8`**, base `ed254ca6` (which IS `origin/master`). Frontend branch
`gr1/phase5-admin-generator-lab` @ **`ec9c8bbd`**, base `147c9996` (which IS
`origin/main`). Neither branch is pushed — see §14.6.

This document and the screenshots live **untracked in the primary checkout**,
beside every earlier GR1 phase's; neither commit contains a doc.

---

## 1. What this phase is, in one paragraph

Admin can now run the three production Mastery generators — `champion`,
`matchup`, `applied_chain` — from a page in the Admin app, see exactly what a
player would be served, read where each question came from, and reproduce any
slice from its seed. **No Admin-only generator was written.** The screen calls
`MasterySliceModule.generate_segment`, the same call a live match makes, and
draws the result with `MasterySliceChallengeSurface`, the same component the
Ranked arena draws a challenge with. Everything else in this phase exists to
make that reuse visible, safe and provable.

## 2. The production-generator reuse path — exactly

```
Admin Generator Lab (React)
  → POST /api/ranked/admin/mastery-slice/preview        [require_admin]
    → routes/ranked_public.preview_mastery_slice
      → ranked_public/mastery_preview.preview_segment
        → SegmentSpec(...).validate()                  ← the SAME schema Save runs
        → MasterySliceModule().generate_segment(...)   ← THE PRODUCTION GENERATOR
          → MasterySliceModule._publish_on_demand
            → mastery.synthesis.service.synthesize_champion_mastery
              | mastery.synthesis.service.synthesize_matchup_mastery
              | mastery.synthesis.applied_chain.synthesize_applied_chain_mastery
```

A live match's path is identical from `generate_segment` down. The only
differences above it are the synthetic `match_id` (`preview:mastery_slice`) and
that the result is returned instead of frozen onto a round row.

**This is asserted, not assumed.** `test_preview_reuses_the_production_generator_path`
spies on `MasterySliceModule.generate_segment` and checks it is called once,
with the caller's own `config`, `challenge_count` and `seed`. Every other claim
in this phase follows from that one.

Renderer reuse is the same shape:

```
MasterySliceChallengeSurface           ← ONE component
  ├── ranked-core masterySliceModule   (the live arena)
  └── MasteryGeneratorLab              (this phase)
```

`renderPathFor`, `toPlayerQuestion`, `questionViewForChallenge` and
`ProseChallenge` moved out of `masterySliceModule.tsx` into that file; the
module re-exports them so every existing importer is unchanged. Nothing about
the rendering changed in the move — the 126 existing `ranked-core/modules`
tests passed before and after with no edits.

## 3. Backend — what changed

| File | Change |
|---|---|
| `ranked_public/mastery_preview.py` | `preview_segment` takes an optional `seed`; the response gains `seed`, `selection_salt` and `mastery_artifact`. New `coverage_for_config`. Response schema → `ranked.mastery_slice_preview.v2` (purely additive). |
| `routes/ranked_public.py` | `seed` threaded through the existing preview route; new `POST /api/ranked/admin/mastery-slice/coverage` on the **same admin router**. |
| `schemas/ranked_public_schemas.py` | `MasterySlicePreviewIn.seed` (optional, ≤128 chars); new `MasterySliceCoverageIn`. |
| `mastery/synthesis/service.py` | **The one structural change.** `eligible_champion_pool` / `eligible_matchup_pool` name the first half of generation; the synthesizers now call them. |
| `mastery/synthesis/coverage.py` | **New.** Counts a subject's candidate pool. Never returns content. |
| `mastery/synthesis/recipe.py` | `counts_by_category` made public; `_counts_by_category` delegates to it. |
| `mastery/tests/facts_support.py`, `test_footprint_guard_split.py` | `GR1_RUNTIME_FILES` grew by two, re-pinned by exact set equality. |
| `test_gr1_phase5_admin_generator_lab.py` | **New.** 49 tests. |

### Why the pool extraction is the right change and not a refactor for its own sake

Coverage has to answer "how many questions could this subject supply" without
generating a slice. Answering it by re-running the four pipeline calls in the
same order would produce a second pool that drifts from the generator's the
first time either moves — and a coverage panel that disagrees with what the
generator will serve is worse than no panel. So the pool step is named once and
both callers read it. A consequence worth having: an untrustworthy source now
refuses a **coverage read** in the same words it refuses a generation, because
the preflight lives inside the shared function.

`test_coverage_and_generation_read_the_identical_candidate_pool` asserts the
identity rather than comparing two numbers that happen to agree today.

## 4. Frontend — what changed

| File | Change |
|---|---|
| `src/pages/admin/ranked/MasteryGeneratorLab.tsx` | **New.** The page. |
| `src/lib/ranked-core/modules/MasterySliceChallengeSurface.tsx` | **New.** The shared per-challenge renderer, lifted out of the arena module. |
| `src/lib/ranked-core/modules/masterySliceModule.tsx` | Renders through the shared surface; re-exports what moved. |
| `src/lib/ranked-public/contracts.ts` | `readMasterySliceChallenge` exported — the Lab parses a challenge with the arena's own parser. |
| `src/lib/admin/rankedFormatApi.ts` | `previewMasterySlice` takes a seed; new preview/coverage/provenance types; new `fetchMasterySliceCoverage`. |
| `src/lib/admin/rankedFormatEditing.ts` | Segment-level `setSegmentSpecField`, `normalizeSegmentSpecConfig`, `fillVisibleSpecDefaults`; the format-level helpers delegate. `fillVisibleSpecDefaults` additionally seeds **dependent** fields (`options_by`). |
| `src/App.tsx` | Route `/admin/ranked/generator-lab`, lazy, under the existing `/admin` layout gate. |
| `src/lib/admin/admin-registry.ts` | Registry entry (Ranked › Question Bank). |
| `src/pages/admin/areas/AdminRankedPage.tsx` | A **Generated questions** panel beside the existing **Ranked questions** one. |
| `src/pages/admin/ranked/MasteryGeneratorLab.test.tsx` | **New.** 31 tests. |
| `src/lib/admin/__fixtures__/masterySlicePreviews.json`, `masterySliceCoverage.json` | **New.** Verbatim backend captures, all three generators. |

### One real bug fixed on the way

Switching generator in the Lab left the previous mode's config keys behind and
the new mode's unset, and the backend correctly refuses a config carrying
another mode's fields — so changing the generator produced a 422 with nothing
on screen explaining why. The Format Builder had already solved exactly this at
exactly this moment (`normalizeSegmentConfig` + `fillVisibleDefaults`), so
those were split into segment-level helpers and reused rather than
reimplemented. Caught by the screenshot run, not by a test — which is the
argument for §12 existing.

## 5. Admin surface, and the Static/Generated boundary

Route: **`/admin/ranked/generator-lab`** — Ranked › Question Bank.

It is deliberately **not** a tab of Admin Quiz Review. Quiz Review is a table of
STORED questions with ids you can approve, edit and publish. A `mastery_slice`
question is virtual until a match serves it: synthesized when the segment
opens, frozen onto that one round, never a reusable row. Pouring generated
samples into that table would teach an operator a model of the product that is
false.

The distinction is stated in three places rather than one:

* the Lab's own header ("generated, not stored"), with a link to **Static
  Questions — Admin Quiz Review**;
* a **Generated questions** panel on the Ranked area page, beside the existing
  **Ranked questions** panel that links to Quiz Review;
* the registry entry's notes.

**Admin Quiz Review is unchanged.** No file under the quiz workspace was
touched, and nothing generated is written anywhere it could be listed.

## 6. Generator controls

Rendered by `ModuleConfigFields` — the Format Builder's own component — from
`GET /api/ranked/admin/module-catalog`, the backend's own field descriptions.
The Lab therefore holds **no roster, no ability list, no certification list and
no validation rule**.

| Generator | Controls |
|---|---|
| Champion | Mastery type · Champion (173, roster-backed) · Questions · Seed |
| Matchup | Mastery type · Champion A · Champion B · Questions · Seed |
| Applied chain | Mastery type · Attacker (certified only) · Ability (dependent on attacker) · Target (certified only) · Questions · Seed |

Applied-chain coverage is **not** expanded by this phase: the controls offer
exactly what `certified_attacker_abilities()` and `certified_target_ids()`
already declare.

## 7. Visual preview

Each generated challenge is drawn by `MasterySliceChallengeSurface`, which
dispatches exactly as the arena does:

* `atomic_recall` / `comparison_left_right` → `ScenarioMediaBand` +
  `MasteryQuestionDispatch` (the existing Mastery interaction renderers);
* everything else (including applied-chain's `legacy_combat`) →
  `InteractiveScenarioSurface`, the arena's own question card.

It renders **live, not disabled**: selecting an option, typing a number and
picking a side are the states most worth seeing. The only inert control is the
terminal "lock in" — there is no session to answer into. **Grading is
deliberately not reproduced**; the answer is stated from the backend payload in
a visually separate admin-only strip, and the server remains the only authority
on correctness.

This is the first time applied-chain has had a **capturable UI** at all. The
Phase 2 doc recorded it as unrenderable here (it needed a real Supabase JWT);
`gr1p5-05` is it, with real worked explanations.

## 8. Diagnostics and provenance

Collapsed by default. Shows the Phase 4 served-artifact block through that
module's own `review_view` **positive-list** redaction — so a field added to
the frozen block later is invisible here until someone adds it on purpose:

generator type · generator version · artifact schema version · subject key ·
artifact instance id · mastery set id · artifact digest · source patch ·
patch key digest · prototype flag · generator config

…plus, one level up, **seed**, **selection salt** and the response schema
version. Raw JSON is one further explicit click.

**Why the salt may be shown here and not in a match review.** `review_view`
drops `selection_salt` because in a real segment it derives from the match's
server-only `order_seed`. A preview's salt derives from a string the admin just
typed, against a synthetic match id no match can hold. It is reported from the
endpoint's own knowledge of its own input rather than by widening the
redaction.

The prototype flag is **reported, not interpreted**: it is `true` for Champion
and Matchup slices too, which are gated, so glossing it as "did not go through
the publication gate" would be wrong.

## 9. Seed behaviour

* `seed` is an admin input standing where a match's `order_seed` stands.
* It is turned into a salt by `MasterySliceModule._selection_salt` — the
  **same method** the live service uses, read off the module rather than
  recomputed, and the response echoes what was actually used.
* Same seed + same data ⇒ byte-identical slice, **and the same
  `artifact_instance_id`**.
* A different seed draws a different valid sample from the same pool — and
  the tests re-check the Phase 3 validity invariants over whatever it drew.
* **No seed ⇒ the pre-Phase-5 fixed preview, byte for byte.** The Builder's
  existing preview panel sends none and is unchanged.
* "New seed" is client-side and is **not a second RNG path**: it types a
  different arbitrary string, exactly as a keyboard would. All determinism
  lives in the backend's single salt derivation.

## 10. Persistence side-effect proof

Two independent proofs, both in `test_gr1_phase5_admin_generator_lab.py`, for
all three generators:

1. **Structural.** A sqlite **authorizer** installed over `ranked_public.
   persistence.connect` — the one function every Ranked admin route opens its
   connection through — DENIES every `INSERT`, `UPDATE`, `DELETE` and DDL
   action there is. A write would surface as a failed request rather than as a
   passed assertion. Result: `preview` and `coverage` attempt **zero** writes.
2. **Named.** Row counts across `quiz_attempts`, `ranked_matches`,
   `ranked_rounds`, `generated_mastery_recipes` and `mastery_sessions` before
   and after a preview: unchanged. This says WHICH absences were promised, so a
   future change that routed around `rp.connect` would still be caught.

Plus: no generated question row is materialized anywhere (there is no such
table to write to — that is the design), and the frontend calls neither
endpoint on mount.

## 11. Auth

Unchanged, and reused rather than extended. Both endpoints sit on the existing
`admin_router`, whose `dependencies=[Depends(require_admin)]` is declared once
on the router. Verified:

* no credential → **403**, and the refusal carries no prompt and no answer;
* wrong `X-Admin-Key` → **403**;
* the routes are asserted to be **on the admin router**, structurally.

No gate was weakened, no new bypass added, and no public route was created.
The frontend page additionally sits under the `/admin` `AdminRoute` layout gate
and its own `AdminAuthGate`.

Error mapping is the pre-existing Ranked one and was deliberately not changed:
an unknown champion or an uncertified chain returns **503
`RANKED_MODULE_DATA_UNAVAILABLE`** — the same code and status the readiness
report and live match creation give for the same cause. See §13.

## 12. Screenshots

`docs/audits/gr1-phase5-generator-lab/` (frontend repo) — 9 PNGs, captured with
Playwright against a **local backend serving the real canonical database**.
Every champion, number, option and explanation came out of the production
generator; nothing is mocked.

| File | What it shows |
|---|---|
| `gr1p5-01-champion-configured.png` | Champion Lab configured — controls from the backend catalog, seed set |
| `gr1p5-02-champion-coverage.png` | Coverage: Zed, 42 generatable, three families |
| `gr1p5-03-champion-generated.png` | A generated Champion slice — real splash art, real ability cards, real questions |
| `gr1p5-04-matchup-generated.png` | A generated Matchup slice (comparison renderers) |
| `gr1p5-05-applied-chain-generated.png` | A generated applied chain — the first capturable UI it has had |
| `gr1p5-06-champion-diagnostics.png` | The provenance panel, expanded |
| `gr1p5-07-champion-raw-json.png` | The optional raw response |
| `gr1p5-08-champion-mobile.png` | 390px — single column, no horizontal scroll |
| `gr1p5-09-refusal-mirror-matchup.png` | The backend's own refusal, verbatim |

Three legibility defects were found by looking at these and fixed: the answer
strip, the explanation text and every error block used tokens that are
near-invisible on the light Admin theme.

## 13. Tests

### Backend

| Suite | Result |
|---|---|
| `test_gr1_phase5_admin_generator_lab.py` | **49 passed** (new) |
| `mastery/tests` | **3 failed, 1617 passed, 17 skipped** — the documented pre-existing set (2 × `test_audit_db`, the stale `test_phase4f` expectation). Zero introduced. |
| 5 Ranked-Mastery + 2 format-config integration suites | **184 passed, 0 failed** |
| The 4 isolation guards + `test_footprint_guard_split.py` | **166 passed, 0 failed** — run against the real commit `31c0bbe8` |

### Frontend

| Suite | Result |
|---|---|
| `MasteryGeneratorLab.test.tsx` | **31 passed** (new) |
| `src/lib/ranked-core/modules` | **126 passed** — unchanged by the renderer extraction, no test edited |
| `src/lib/{ranked-core,ranked-public,admin}` + `src/features/mastery` + `src/pages/admin`, vs a clean `origin/main` baseline worktree | **11 failed, 1544 passed on BOTH — failure-set `diff` is EMPTY, zero introduced** |
| `tsc -p tsconfig.app.json` | No error in any Phase 5 file |

The 11 baseline failures are `adminCredentials.test.ts` (1) and
`StructuralReview.test.tsx` (10) — neither touched by this phase, both failing
identically on clean `origin/main`. The baseline worktree used **hardlinked**
`node_modules`, never a symlink.

## 14. Limitations and what was deliberately not done

1. **A 503 for an unknown champion is odd but pre-existing.**
   `RANKED_MODULE_DATA_UNAVAILABLE` maps to 503 in the shared Ranked error map.
   Re-mapping it for the Lab alone would give an operator two different answers
   to one question. Left as-is and asserted as-is.
2. **Applied-chain coverage is not per-subject.** Its ceiling (14) is a
   property of the canonical penetration-item pool collapsed by derived
   mechanic, not of the attacker or target. Reported as exactly that.
3. **No grading in the Lab.** The terminal lock-in control is inert. Making it
   grade would require this page to hold an opinion about correctness —
   including numeric tolerances — and the server is the only authority.
4. **`difficulty` is still not visible**, because it is still not on the frozen
   step. That remains owner decision 7 in the handoff.
5. **Public Ranked still serves no Mastery.** Nothing in this phase changes
   which formats name `mastery_slice`, and no rollout was started.
6. Nothing was pushed. Both `origin/master` and `origin/main` auto-deploy
   (master → Railway; main → Lovable publish), so the owner commands are in
   the handoff's integration section.
