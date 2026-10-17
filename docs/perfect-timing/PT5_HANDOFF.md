# PT5 — Perfect Timing: Cooldown Mastery Slices

**Status 2026-10-16: implemented and tested on two branches, pushed, not merged, not deployed.** Owner review and release (§9) are next.

| Repo | Branch | Base | Commit |
| --- | --- | --- | --- |
| Backend `mitcherrman/League_Combat_Simulator` | `perfect-timing/pt5-slice-authority` | `origin/master` `016ab72d` | `addaf5ce` |
| Frontend `mitcherrman/mogsy` | `perfect-timing/pt5-slice-gameplay` | `origin/main` `f5f90c72` | the tip of this branch (the commit that adds this file) |

Read first: [PERFECT_TIMING_HANDOFF.md](PERFECT_TIMING_HANDOFF.md) (§2 v1 contracts, §6 PT3 authority) and [PT44_HANDOFF.md](PT44_HANDOFF.md) (the fixed screen). Neither contract nor layout rule there changed.

## 1. Objective

A second way to play Perfect Timing next to the unchanged five-round **Random Run**: a **Mastery Slice** — one champion ability timed three times, changing one input per stage, so the player feels what each change does to the cooldown.

| Stage | Kind | Rank | Ability haste | Shown on the plate |
| --- | --- | --- | --- | --- |
| 1 | `foundation` | 1 | 0 | Rank 1 / N · no ability haste |
| 2 | `rank_up` | 3 | 0 | ▲ Rank 3 / N from 1 |
| 3 | `equipped` | 3 | Sheen's canonical AH (+10) | Rank 3 / N + Sheen chip (icon, name, +10 Ability Haste) |

The target is never shown before its stage is locked. It is a timing exercise, not a calculation quiz: the arithmetic is shown only in the reveal.

## 2. Production evidence (read-only, 2026-10-16)

Read with `railway ssh --service web` over `/data/lol_calc.db` opened `mode=ro`, running the branch's own `perfect_timing/slices.py` (`coverage_report`), cross-checked by an independent audit script. Nothing was written.

* **Sheen:** `item_canonical` row `validated_current`, `canonical_item_id 3057`, `stats_json {"ah": 10}`, **`source_revision 4051358`** (wiki `Module:ItemData/data`, fetched 2026-08-14). The local 2026-09-26 snapshot has revision 4065930 with the same `ah: 10`.
* **Patch:** `26.18`, `patch_ops_latest_completed_operation` → `patch_source: patch_operations`.
* **Pool:** PT3 pool 348 abilities (2–12 s) → **160 slices across 122 champions** (Q 87, E 46, W 26, R 1). Excluded from the PT3 pool by a slice rule: rank 1 out of window/ineligible 103, rank 3 out of window/ineligible 54, rank-invariant 82, rank 1 = rank 3 (Seraphine E) 1, modified target under 2 s (Kassadin R: 2000 → 1818 ms) 1. Production and the local snapshot list the identical 160.
* **Ezreal Q qualifies:** `5.5 / 5.25 / 5 / 4.75 / 4.5`, revision 4013233, RANK_PROGRESSION, not static → **5500 → 5000 → 4545 ms**.
* **Step distribution** (relative to the new target): rank step 9.09 %–120 % (smallest: 12 → 11 s), haste step always 10.0 % (+10 AH). See §4.3 for the filter this supports.

## 3. Contracts (frozen; v1 untouched)

Same router, same gate: `require_admin` (403/503) then `PERFECT_TIMING_LAB_ENABLED` (404 `PT_LAB_DISABLED`), both before body validation. Error body `detail.error.{code,message}`. Slice rounds live in their own store: a slice round id 404s on the v1 lock route and vice versa.

### 3.1 `POST /api/admin/perfect-timing/slices/deal` → `perfect_timing.slice_deal.v1`

Body (`extra="forbid"`): `{}` for a random slice, or `{"resume": {"champion", "slot": "Q|W|E|R", "from_stage": 1..3, "ability_revision_id": str, "item_source_revision": str}}` (§5).

```json
{
  "contract": "perfect_timing.slice_deal.v1",
  "slice_id": "pts_<32 hex>",
  "data_label": { "patch_label": "26.18", "patch_source": "patch_operations" },
  "champion": "Ezreal", "slot": "Q", "ability_name": "Mystic Shot", "rank_count": 5,
  "assumption": "no_cooldown_refunds",
  "authority": { "ability_revision_id": "4013233", "item_source_revision": "4051358" },
  "start_stage": 1,
  "expires_at": "…Z",
  "stages": [
    { "stage": 1, "kind": "foundation", "round_id": "pt_<32 hex>", "rank": 1, "ability_haste": 0,  "modifier": null },
    { "stage": 2, "kind": "rank_up",    "round_id": "pt_<32 hex>", "rank": 3, "ability_haste": 0,  "modifier": null },
    { "stage": 3, "kind": "equipped",   "round_id": "pt_<32 hex>", "rank": 3, "ability_haste": 10,
      "modifier": { "type": "item", "item_id": 3057, "name": "Sheen", "ability_haste": 10 } }
  ]
}
```

* Never carries a target, a base cooldown, the progression, or any calculation key. The backend runs `assert_pre_reveal_safe` + `PT_PRIVATE_KEYS`; the frontend reader additionally refuses `target_ms`, `cooldown*`, `by_rank`, `base_cooldown_ms`, `exact_ms`, `calculation`, `formula`, `target` at any depth, and refuses a deal that breaks the shape (stages 1..3 in order, ranks 1/3/3, AH 0/0/item's, item only on stage 3, unique ids, `round_id: null` exactly for stages before `start_stage`).
* Errors: 503 `PT_SLICE_ITEM_UNAVAILABLE` (no verified Sheen), 503 `PT_SLICE_POOL_EMPTY`, 503 `PT_DATA_UNAVAILABLE`, 409 `PT_SLICE_RESUME_REFUSED`, 422 body.

### 3.2 `POST /api/admin/perfect-timing/slices/{slice_id}/rounds/{round_id}/lock` → `perfect_timing.slice_release.v1`

Body `{"elapsed_ms": StrictInt 0..600000}` (same as v1). Graded by the unchanged `scoring.py` (`pt-scoring-0.2`).

```json
{
  "contract": "perfect_timing.slice_release.v1",
  "slice_id": "pts_…", "round_id": "pt_…", "stage": 3, "kind": "equipped",
  "elapsed_ms": 5000, "target_ms": 4545, "error_ms": 455, "abs_error_ms": 455,
  "relative_error": 0.1001, "tier": "good", "points": 60,
  "plausibility": { "server_window_ms": 1000, "verdict": "exceeds_server_window" },
  "calculation": { "rank": 3, "base_cooldown_ms": 5000, "ability_haste": 10,
    "formula": "base_cooldown × 100 / (100 + ability_haste)", "exact_ms": "4545.4545", "rounding": "nearest_ms_half_up" },
  "authority": { "cooldown_at_rank": "5", "cooldown_raw": "5.5 / 5.25 / 5 / 4.75 / 4.5",
    "revision_id": "4013233", "verified_at": "…",
    "item": { "item_id": 3057, "name": "Sheen", "ability_haste": 10, "source_revision": "4051358" } },
  "slice_expires_at": "…Z"
}
```

* `cooldown_raw` (the whole progression) is **null on stages 1–2** — it would reveal the next stage's rank value; it is released with the final stage only. `cooldown_at_rank` is this rank's value verbatim. `authority.item` is null on stages 1–2.
* `server_window_ms` runs from the slice's latest lock (or the deal), a tighter upper bound than the deal; reported only.
* Errors: 404 `PT_ROUND_NOT_FOUND` (unknown/expired slice, a round of another slice, bad ids), 409 `PT_ALREADY_LOCKED` (different value), 409 `PT_STAGE_CLOSED` (a later stage already locked), 422 body.
* The frontend reader checks the server's arithmetic agrees with itself (`error = elapsed − target`, `exact_ms` rounds to `target_ms`, no-haste ⇒ target = base, item haste = calculation haste, kind/rank match the stage) and the client checks the echo (`slice_id`, `round_id`, `elapsed_ms`).

Captures: backend `perfect_timing/fixtures/slice_capture_v1.json` (written by `python -m perfect_timing.tests.make_slice_capture`, test fixture DB, checked byte-for-byte by `test_slice_capture_is_current`), copied verbatim to `src/lib/perfect-timing/__fixtures__/sliceCaptureV1.json` (sha256 `c4533c2b…`).

## 4. Decisions

### 4.1 Authority (backend `perfect_timing/slices.py`)

* An ability is a slice only if it is in the **PT3 pool** (quiz `classify_cooldown`, ownership holds, 2F shape `RANK_PROGRESSION`/`RANK_INVARIANT` — so STATIC, STATIC_SECONDARY and CONDITIONAL shapes are out — static flag, per-row revision stamp, 2–12 s per rank) **and** `classify_cooldown_haste(...).eligible` **and** `cooldown_semantics.check(...).applies` (haste-immune out), not rank-invariant, rank 1 and rank 3 both in the PT3 window, rank 1 ≠ rank 3, every stage target 2–12 s, every step > the "great" band (§4.3).
* **Sheen** comes only from `item_canonical.runtime_stats.load_canonical_item_stats` (`validated_current`). The name **and** id 3057 are pinned as identity; the haste and revision are read every deal. Missing row, other id, no revision, no or zero AH, or no table ⇒ `SliceUnavailable` → 503; nothing is substituted. No wiki fact, no frontend number.
* Ezreal Q's hit-triggered cooldown reduction is a separate on-hit effect, not the cooldown the row states; every slice states `assumption: "no_cooldown_refunds"`, and the reveal says "cast without cooldown refunds" in its provenance line (no banner).

### 4.2 Precision

`quiz.cooldown_under_items.apply_haste` rounds to 0.1 s because the quiz prints a multiple-choice number the way the tooltip does. The game does not round a reduced cooldown to a tenth, and Perfect Timing grades in milliseconds. So: `modified_ms = round_half_up(Fraction(base_ms) × 100 / (100 + AH))`, exact rational arithmetic, rounded once. Ezreal Q rank 3 + Sheen = **4545 ms** (`exact_ms "4545.4545"`); the tenth rule would have baked a 1 % error (4500) into the answer. Base targets keep PT3's rule (`round_half_up(seconds × 1000)`). Tested in `test_the_modified_target_is_exact_then_half_up_to_the_millisecond`.

The frontend prints slice durations at the graded precision (`formatSliceSeconds`: 5000 → "5.00 s", 4545 → "4.545 s", integer arithmetic; `(4.545).toFixed(2)` would print 4.54). The Random Run keeps PT4.4's two places.

### 4.3 Minimum-difference filter (evidence first)

Measured on production: the smallest rank step is 1/11 ≈ 9.09 % of the new target, and +10 AH is always exactly 10 %. Rule adopted: each stage's target must differ from the previous stage's by **more than the scoring "great" bound (7 %) relative to the new target**, so a player who simply repeats the previous rhythm scores at best "good". It is derived from `scoring.TIERS`, not a new constant (`MIN_STEP_RELATIVE`), and **excludes nothing today**; it guards a future item or patch (a +5 AH item would fail it — tested).

### 4.4 Store, ordering, expiry and recovery

* One in-memory `SliceStore` (single process, same constraint as PT3), TTL 15 min, cap 200 slices. The **slice is the unit of expiry**, and every lock renews it (sliding), so a slice in play does not lose one stage to expiry.
* **Stages lock in order:** locking stage k closes every earlier unlocked stage (voided client-side). A later stage's release therefore can never be used to lock an earlier one (409 `PT_STAGE_CLOSED`). Replays of a locked stage stay idempotent.
* **Recovery (the explicit decision):** an expired slice is never patched with an unrelated round. The client asks for `resume` = the **same champion + slot from the current stage**, carrying the deal's `ability_revision_id` and `item_source_revision`. The server re-deals that ability with earlier stages closed, or refuses (409) if the ability left the pool or either revision changed — a progression never mixes two data revisions. Earlier results stay on screen. On refusal the player gets "data changed … Start a new slice" and a **New slice** button. The client re-deals before arming when `expires_at` (updated from each release's `slice_expires_at`) has passed, or when a lock answers 404. The client also refuses a resume answer naming another ability or stage.
* Interrupted (hidden / pagehide / clock / timeout): the stage is voided, never sent; Next goes to the next stage of the same ability. Stage 2's reveal then says "Foundation voided → 5.00 s" instead of comparing with an unrevealed value.

### 4.5 Presentation (frontend)

* **Mode pick** (new first screen, `PerfectTimingModeSelect`): two plates, Random Run / Mastery Slice, no instructions; first plate focused, arrows move, Enter picks. `?run=random|slice` skips it (and is set on pick, `replace`). Results offer Play again / **New slice** and **Change mode**.
* **Hero** (slice only): a three-pill track over the art (Foundation › Rank up › Equipped, current lit); the changed input is marked — ▲ gold rank + "from 1" on Rank up, the Sheen chip (asset-store icon `assets/items/3057.png`, name, +10 Ability Haste) on Equipped. The mark's entry animates once **only while ARMED** (gone the instant the timer runs; reduced-motion: none). Digits on the stage while running: only rank, rank count, previous rank, item AH (e2e-asserted).
* **Reveal** (slice only): one comparison line under the plates — Rank up: `Rank 1 → 3  5.50 s → 5.00 s  −0.50 s`; Equipped: `[Sheen +10 AH] −0.455 s  5.000 s × 100 ÷ (100 + 10) = 4.545 s`. Provenance line: `Base cooldown 5 s · rank 3 · cast without cooldown refunds`.
* **Results** (slice only): champion + ability once, score / 300, the story line from revealed truths only (`Rank 1 → 3: −0.50 s · Sheen +10 AH: −0.455 s`), and the ladder rows as stages (stage word, rank or item, item badge on the icon, `true −0.50 s` change).
* Everything else is PT4.4: portal screen, no scrolling, same seal, same cues, same key guard.

## 5. Files

Backend (`perfect-timing/pt5-slice-authority`):
* New `perfect_timing/slices.py` (authority, precision, store, deal/lock, `python -m perfect_timing.slices --db PATH` read-only coverage report), `perfect_timing/tests/test_slices.py` (56 tests), `perfect_timing/tests/make_slice_capture.py`, `perfect_timing/fixtures/slice_capture_v1.json`.
* Edited `routes/admin_perfect_timing.py` (two routes + strict models), `perfect_timing/tests/fixture_db.py` (3 ledger rows: Ezreal Q l.141, Kassadin R l.254, Hecarim Q l.185; Sheen copied from `fixtures/reconstruct_recipe_graph_rev4065930.json`; `build()` default unchanged so the v1 capture is byte-identical), `perfect_timing/__init__.py` (docstring).
* Untouched: `service.py`, `rounds.py`, `scoring.py`, `eligibility.py`, `routes/admin_playtests.py`, `api_server.py`. No migration, no DB write (grep-tested).

Frontend (`perfect-timing/pt5-slice-gameplay`):
* New `src/lib/perfect-timing/sliceContract.ts` (+test), `src/lib/perfect-timing/__fixtures__/sliceCaptureV1.json`, `src/pages/admin/perfect-timing/{MasterySliceRun.tsx, MasterySliceRun.test.tsx, sliceView.ts, runShared.ts}`, `src/components/perfect-timing/PerfectTimingModeSelect.tsx`, this file.
* Edited `api.ts` (+`dealSlice`, `lockSlice`, shared idempotent-retry helper), `viewModel.ts` (§3 slice extras, all optional), `PerfectTimingPage.tsx` (mode shell; Random Run body unchanged, constants moved to `runShared.ts` and re-exported), `PerfectTimingStage.tsx` (slice track, item chip, rank mark), `PerfectTimingReveal.tsx` (comparison line, slice precision), `PerfectTimingResults.tsx` / `RunLadder.tsx` (slice story and rows), `PerfectTimingArena.tsx` (`nextLabel`), `presentation.ts` (+slice helpers), `perfectTiming.css` (appended PT5 block), tests (`api.test.ts`, `presentation.test.ts`, `PerfectTimingPage.test.tsx` and `OwnerPlaytests.test.tsx` now pick Random Run first), `e2e/perfect-timing-owner.spec.ts` (Random Run specs go to `?run=random`; PT5 block added).

## 6. Verification

Baselines: backend clean `master` `016ab72d`; frontend clean detached `main` `f5f90c72` (`C:/Users/mlmit/mogzy-wt/pt5-fe-base`), same machine.

| Check | Branch | Clean base | Verdict |
| --- | --- | --- | --- |
| Backend `pytest perfect_timing/tests interaction_lab/tests numeric_lab/tests` | **234 passed** | 178 passed | +56 new (`test_slices.py`), none broken; v1 capture byte-identical |
| Backend `knowledge_engine/tests/test_no_banned_provider.py` | 1 failure | same failure | pre-existing (`test_patch_semantic_card_identity.py` ddragon URL) |
| Backend production read-only coverage (this branch's `slices.py`) | 160 slices / 122 champions, Ezreal Q 5500/5000/4545, Sheen rev 4051358 | — | §2 |
| Vitest PT suites (`src/lib/perfect-timing`, `src/components/perfect-timing`, `src/pages/admin/perfect-timing`, `src/pages/admin/playtests`) | **284/284** | — | new: `sliceContract.test.ts` 35, `MasterySliceRun.test.tsx` 14, api +4, presentation +1 |
| Vitest wider set (`src/pages/admin`, `src/components/admin`, `src/lib/{playtests,admin,ranked-arena}`, `src/test/guards`, `src/App*`) | 10 failed / 1,149 passed | 10 failed / 1,135 passed | **identical failing tests** (App.routeGuards, App.routing-contract ×2, admin-registry.routes ×2, AdminPlatformPolicies, AdminQuizReview.proPlay, noStaticLeagueFacts, users1AudienceIdentity ×2) — pre-existing; the guard names no PT file or fixture |
| `tsc -p tsconfig.app.json` | 2 errors | same 2 (`OnboardingProfile.tsx`, `identity/connections.ts`) | pre-existing |
| ESLint, every changed `src`/`e2e` file | 0 problems | — | clean |
| Playwright `e2e/perfect-timing-owner.spec.ts` (Vite :8123, stand-ins from the captures) | **55/55** full spec on the final UI code (38 Random Run/PT4.4 + 17 PT5), then the PT5 block 17/17 again after the stand-in arithmetic fix | — | see below |

The PT5 e2e covers: the mode pick (focus, Enter, no deal before a pick, `?run=`); a full slice by keyboard (1440×900) and by touch (390×844) — same champion/ability/icon every stage, track state, rank mark, Sheen icon (`assets/items/3057.png`), name and +10, no truth in the DOM before each lock, only public-input digits and no looping or "changed" animation while running, graded precision on the reveal (5.50 / 5.00 / 4.545 s), the haste arithmetic, the results story, one lock per stage, integer bodies, Change mode; and at **all 14 FIT sizes** (1920×1080 … 320×568, 844×390, 667×375): mode pick, dealing, each stage armed / running / revealed (PERFECT on the equipped stage, the widest verdict), results, the expired-slice resume message and the resumed stage, and a voided stage — no document/screen/stage overflow, every test-id inside the viewport, keys and wheel scroll nothing. Screenshots: `C:/Users/mlmit/mogzy-wt/pt5-evidence/` (forced-tier shots use the stand-in's `lie` option, so their numbers are synthetic).

Unit/jsdom covers the rest: Space and Enter (document level), duplicate/late/repeat stops → one lock, interrupted stage voided and never sent (next stage then says "Foundation voided"), lock 404 → resume of the same ability with both revisions, expiry before arming → resume, resume refused (409) → New slice only, a resume answering another ability refused client-side, 503 retried with the same stop, 409 voided, a leaking deal refused before render, Random Run still deals `count: 5` on v1.

## 7. Not done / risks

* **Real devices** (iOS Safari, Android Chrome) still not run, as in PT4.4.
* **Not run against a live backend in a browser:** the frontend was driven by stand-ins answering from the backend capture; the backend routes were exercised by FastAPI TestClient and by `coverage_report` over production data. The first real owner smoke after deploy is the integration proof.
* **Headless captures show no art**: the remote asset host was unreachable from headless Chromium here; `src` attributes are asserted (`assets/champions/Ezreal/Q_EzrealQ.png`, `assets/items/3057.png`) but pixels were not.
* The slice store is per process like PT3's: more than one worker/replica would 404 locks (the client would then resume, and a resume landing on another replica works, but the lock after it may not).
* The Sheen pin (`id 3057`) is identity, not a stat: if Riot re-keys Sheen, slices fail closed (503) until the pin is updated.
* The Playtests hub card still reports the v1 pool only ("N certified abilities, 5 per run"); it does not mention slices. Adding a slice count needs `routes/admin_playtests.py` + `src/lib/playtests/modes.ts` (deliberately not touched).
* Resumed stages re-time the stage that expired (a new round); the stop that met the 404 is not graded.

## 8. Next step

Owner review of both PRs, then §9. Optional follow-ups: hub card slice availability; more items than Sheen (the contract's `modifier.type` already says `item`); a choice of ability for a slice (the resume path already re-deals a named ability — a picker would reuse it).

## 9. Release order (owner-only)

1. Merge backend `perfect-timing/pt5-slice-authority` → `master` (Railway `web` auto-deploys). With the flag already set, the new routes go live owner-only; v1 is unchanged, so the current frontend is unaffected.
2. Smoke without a browser: `POST /api/admin/perfect-timing/slices/deal` with no bearer → 403; with the owner session → 200 `perfect_timing.slice_deal.v1` with no `target_ms`/`cooldown*`, `authority.item_source_revision` = the production Sheen revision.
3. Merge frontend `perfect-timing/pt5-slice-gameplay` → `main`, Lovable **Publish**. (Frontend first would show the mode pick, and Mastery Slice would answer 404 "lab not enabled" until the backend lands — harmless but confusing.)
4. Owner plays one Random Run and one Mastery Slice at `/admin/playtests/perfect-timing`.
5. Rollback: frontend revert/publish restores PT4.4; backend revert removes the slice routes; unsetting `PERFECT_TIMING_LAB_ENABLED` disables both modes.
