# RANKED-INT0 — Multi-mode integration readiness audit and plan

Audit date: 2026-10-12. Read-only. Nothing merged, rebased, pushed, deployed or
written to any database. This file sits uncommitted in the detached audit
worktree `League_Combat_Simulator/.worktrees/ranked-int0-audit` (at `origin/master` `7e2cb3b7`).

Scope: Match Grid (P1/P2/P2.1 backend, P3/P3.1 frontend), Scrub S2 (Chronoscope),
Pro Play Assembly PA2B.

**Verdict: READY FOR CONTROLLED INTEGRATION.** This means building local
integration branches, resolving conflicts and running tests. It does not mean
release. Release is gated separately by §8.

---

## 1. Verified heads and ancestry (fetched 2026-10-12)

| Remote | Head | Matches brief |
|---|---|---|
| Backend `origin/master` | `7e2cb3b7b28c6e774a2eaaf4fa04911ece30f3a1` | yes |
| Frontend `origin/main` | `b2b1804afdd1eee1a328629033a6c074128a7e3d` | yes |

Backend master since `679173bf` has 6 commits (STORAGE4 backup lifecycle, PW1-B live-esports filter). They share **no file** with any of the three workstreams.

| Workstream | Branch | Tip | Merge-base with mainline | Ahead / behind | Tree |
|---|---|---|---|---|---|
| MG backend (P1+P2+P2.1) | `match-grid/p2.1-release-candidate` | `2464703c` | `679173bf` | 6 / 6 | clean |
| MG frontend (P3+P3.1) | `match-grid/p3-frontend` | `453aa333` | `a59526b2` | 3 / 43 | clean |
| Scrub backend | `scrub/s2-backend` | `e9e0e9a0` | `679173bf` | 2 / 6 | clean |
| Scrub frontend | `scrub/s2-frontend` | `506ac30b` | `a59526b2` | 2 / 43 | clean |
| PA2B backend | `pa2b/assembly-ranked-integration` | `5243081c` | `8829fc3c` | 7 / 5 | clean |
| PA2B frontend | `pa2b/assembly-ranked-ui` | `4e399a03` | `b2b1804a` (= main) | 5 / 0 | untracked `playwright.pa2b.local.config.ts` only (deliberately uncommitted) |

Superseded branches. Integrate neither:
- `match-grid/p2-module` `7da4f2ec` (on `63847f4f`). P2.1 RC cherry-picked it onto `679173bf`.
- `match-grid/p1-rune-authority` `888e01c5`. Same reason.

Two branches have `origin/master` set as their upstream: `match-grid/p2.1-release-candidate` and `scrub/s2-backend`. Never run a bare `git push` from them.

## 2. Worktree ownership (preserve all)

| Worktree | Branch | Owner |
|---|---|---|
| `LCS/.worktrees/mg-p21-rc` | `match-grid/p2.1-release-candidate` | Match Grid BE |
| `LCS/.worktrees/mg-p21-base` | detached `679173bf` | MG baseline |
| `LCS/.worktrees/mg-p2-module`, `mg-p1-rune-authority` | superseded MG | MG (historical) |
| `mogsy/.worktrees/match-grid-p3` | `match-grid/p3-frontend` | Match Grid FE |
| `mogsy/.worktrees/mg-p3-baseline` | detached `a59526b2` | MG FE baseline (node_modules junction) |
| `LCS/.worktrees/scrub-s2-be` (+ `scrub-s2-be-base`) | `scrub/s2-backend` | Scrub BE |
| `mogsy/.worktrees/scrub-s2-fe` (+ `scrub-s2-fe-base`) | `scrub/s2-frontend` | Scrub FE (junction) |
| `LCS/.worktrees/pa2b-assembly-integration` | `pa2b/assembly-ranked-integration` | PA2B BE |
| `C:/Users/mlmit/mogzy-wt/pa2b-ui` | `pa2b/assembly-ranked-ui` | PA2B FE (junction) |
| `LCS/.worktrees/pa1-assembly-content`, `pa2a-assembly-module`, `mogzy-wt/pav1-fable` | PA1 / PA2A / PAV1 | Assembly sources (read-only) |
| `LCS/.worktrees/ranked-int0-audit` | detached `7e2cb3b7` | this audit |

Several frontend worktrees hold `node_modules` junctions. `rmdir` the junction before any `git worktree remove`.

## 3. Readiness per workstream

| | Match Grid | Scrub S2 | Assembly PA2B |
|---|---|---|---|
| Module | `match.v1` (rune → tree) | `scrub.v1` (wave/XP checkpoint) | `assembly.v1` (Roster Lock / Draft Memory) |
| Presets (admin-only, unrated, `status="test"`) | `admin.match` | `admin.scrub` | `admin.roster_lock`, `admin.draft_memory` |
| Suites re-run **by this audit** | BE `test_match_grid_module.py` **47 passed**; FE matchGridModule + revealHold + registry **68 passed** | BE module+flow+wire **82 passed**; FE ranked-public + QuizRankedMatch.scrub + registry **375 passed (30 files)** | BE flow+wire+module+catalog **211 passed**; FE assembly contracts + module + registry **68 passed** |
| Live evidence (self-reported) | P3.1 real-server arena matrix 12/12 vs P2.1 | Continuity 12/12, on replayed captures rather than a live server | Live HTTP probe + 24/24 live Playwright admin matches |
| Implementation defects | (a) FE wire fixture `matchGridP2WireCapture.json` is **stale**: `reveal_window_ms: 3000`, while backend P2.1 serves `4500`; it was captured from P2, not P2.1. (b) The final-round reveal is not server-paced (§6.4). | Header verdict lands before the traverse (shared shell). 1 px slack at 1280×600. | L1 hold too short (§6). Final round as for MG. |
| Production-surface effects beyond admin presets | **Yes, MG-P1.** A startup migration (`api_server.lifespan` → `migrate_add_rune_canonical`) adds columns to the **production `runes` table** and converges it: 33 rows certified, 29 inserted, Phase Rush retired. It also changes the public `/api/meta/runes` (Combat Lab consumes it) and live quiz rune sources (`quiz/rune_facts.py`, `quiz/recognition_authority.py`). | None outside the preset. The S1 public chronoscope route was dropped. | None outside the presets. `PLACEMENT_MAX_SLOTS` 4→5 widens the shared HTTP schema; Reconstruct still refuses 5 at the module. |
| Prototype vs Ranked integration | Integrated against the real host and server, admin-only | Integrated in the real host. The browser run used **replayed** server captures; no live-server run. | Integrated, with a live server and browser |
| Ready to integrate now | Yes, locally. Release needs the §8 B2 sign-off. | Yes | Yes. Integrate after MG so the L1 fix can use the hook. |

No branch has been integrated against the other two. All three self-certifications predate the others and current mainline. §4's dry-runs are the only cross-branch evidence so far.

## 4. Collision map (evidence: `git merge-tree --write-tree` dry runs; no refs written)

### 4.1 Each branch against current mainline
- Backend: all three merge **cleanly** onto `7e2cb3b7`.
- Frontend: Scrub and PA2B merge cleanly onto `b2b1804a`. **MG-P3 conflicts with main** in `src/App.tsx` (2 hunks) and `src/components/Layout.tsx` (1 hunk), against PPQ2-E's Pro Play Arena route. All are additive DEV-route lines. The trap: in Layout's `||` chain the `;` must end only the last term.

### 4.2 Backend pairwise (identical file set for every pair)

| File | MG | Scrub | PA2B | Kind |
|---|---|---|---|---|
| `ranked_modules/registry.py` | ✓ | ✓ | ✓ | additive (`register(...)`) |
| `answer_safety.py` | ✓ | ✓ | ✓ | additive (`FORBIDDEN_PRE_REVEAL_KEYS` union) |
| `ranked_public/projections.py` | ✓ | ✓ | ✓ | additive (`_PRESET_BY_FORMAT_ID`) |
| `ranked_public/review.py` | ✓ | ✓ | ✓ | additive (module id + `elif` dispatch) |
| `ranked_public/readiness.py` | ✓ | ✓ | ✓ | additive: `_x_readiness`, its report key, and the `assert_format_servable` tuple, which must list **all** of `match`, `scrub`, `assembly` |
| `ranked_public/service.py` | ✓ | ✓ | ✓ | additive: presets, `PRESET_FORMATS`, **`ADMIN_ONLY_PRESETS` must hold all four new presets**, catalog injection `if` arms in `_generate_segment`, catalog helpers |
| `ranked_formats/schema.py` | ✓ | ✓ | ✓ | additive but **interleaved**. Git aligns the shared lines of `_validate_match_config` / `_validate_scrub_config` / `_validate_assembly_config`. Rebuild each function whole and keep all three validator calls. |
| `schemas/ranked_public_schemas.py` | ✓ | ✓ | ✓ | **semantic trap.** MG's side carries `PLACEMENT_MAX_SLOTS = 4` beside its new block; PA2B sets `5`. Keep **5** plus MG's `ASSIGNMENTS_*` / `MatchAssignmentIn`. Also union the choice fields (`assignments`, `checkpoint`), the exactly-one tuple, the error text and the `to_choice` arms. |
| `test_ranked_modules_quiz_parity.py`, `test_jref2_admin_reference_journey_preset.py` | ✓ | ✓ | ✓ | pinned sets: union of all three |
| `ranked_public/pacing.py`, `service._resolve` hook | ✓ | | | MG only (no conflict) |
| `test_reconstruct_module.py` | | | ✓ | PA2B only (placement-bound pin) |

### 4.3 Frontend (pairwise among the three)
Overlapping in all three: `contracts.ts` (19 hunks for Scrub×PA2B alone), `modules/registry.ts`, `registry.test.ts`, `orderForgeLockReveal.ts`, `centralStage.ts`, `SegmentTranscript.tsx`, `rankedResultsModel.ts`, `QuestionReviewCard.tsx`, `ModuleSigil.tsx`, `questionIcons.ts`, `questionTimelineParts.tsx`, `AdminRankedPage.tsx`, `playwright.arena.config.ts`.

Overlapping in two: `client.ts` (MG, Scrub: `SegmentChoice` union), `AdminShell.areas.test.tsx` (MG, Scrub), `roundMedia.ts` (MG, PA2B), `interaction-grammar/types.ts` (Scrub, PA2B), `App.tsx`/`Layout.tsx` (MG, PAV1).

**Semantic traps.** Each conflict below looks one-sided, but taking either side silently drops a module, and only tests catch it:
- `contracts.ts`: `ReviewRound.kind` union and the two `kind !== …` guards. A missing kind makes **a whole match review fail to parse**, which PA2B found once already.
- `contracts.ts`: the `isOrderForge || isReconstruct || isX` boolean chains (tallies, `challenges:`) and `_FORBIDDEN_SEGMENT_KEYS`, which needs the union of all three lists.
- `orderForgeLockReveal.ts`: `INLINE_LOCK_REVEAL_MODULES` must hold all three. The `moduleId === X ? !!reveal.x : …` **nested ternary** must chain `match`, `scrub` and `assembly`.
- `registry.ts`: the map entries **and** the separate import / module list.
- `useRankedMatch.ts`: only MG touches it (`serverPaced = !!segment?.reveal.match`). The Assembly opt-in is new work (§6).

### 4.4 Cross-module guard check
Each module's fixtures were walked against the other modules' reveal-only keys:
- Assembly forbids `matched`, which **Match uses**. It appears only in Match's own lock reveal and settlement. The frontend strips `own_challenge_reveals` before its walk, and the backend's `assert_pre_reveal_safe` runs on pre-reveal views. **Expected to pass.** Prove it with the MG suites after the union.
- In the PA2B worktree, live backend code contains no `"proof"`, `"answers"`, `"settled"` keys. `"canonical"` appears only in the offline `pro_authority/assembly_catalog.py`, and `"matched"` in `queue.py`/`oe_stats.py`/`review.py`. PA2B already carried `matched` and its regression was clean, so the union is still unproven but expected to pass.

## 5. Integration prerequisites
1. Owner authorizes building the local integration branches. Pushing is a separate decision.
2. Backend integration branch from `origin/master` `7e2cb3b7`; frontend from `origin/main` `b2b1804a`. Use **merge commits only**: no rebase or cherry-pick of source branches, and source branches stay untouched.
3. Before merging, re-fetch. If either head moved, re-run §4.1.
4. Regenerate every wire fixture from the **integrated** backend. Never hand-edit them:
   `MG_WIRE_CAPTURE_PATH=… pytest test_match_grid_module.py::test_wire_contract_field_names_and_capture`, `SCRUB_WIRE_CAPTURE_PATH=… pytest test_scrub_wire_contract.py`, `ASSEMBLY_WIRE_CAPTURE_DIR=… pytest test_assembly_wire_contract.py`. This also fixes MG's stale 3000 fixture.

## 6. Settlement hold

### 6.1 How Match Grid's hold works (verified in code)
- **Owner: the backend.** `MatchModule.settlement_hold_ms(reveal_window_ms, reveal)` (`ranked_modules/match.py`) is read by duck typing in `service._resolve` (`getattr(module, "settlement_hold_ms", None)`). It is fed the round's **frozen** `reveal_window_ms` and passed to `pacing.module_transition_ms(..., hold_ms=)`, which replaces only the result-beat term (`RESULT_HOLD_MS` 1500). `None` means the old rule, unchanged.
- **Timer start:** at settlement. The result is stored as `settlement["presentation_ms"]` in the resolved round's blob. `_presentation_for_previous_round` reads it back as the next segment's lead-in, so `started_at = resolved_at + hold + MODULE_TITLE_MS`.
- **Deadlines:** the hold **moves the next segment's `started_at`**, and its deadline moves with it. The segment's own `timer_seconds`, scoring, bot think-time (stamped relative to `challenge_started_at`) and speed bonus are unchanged. This is a server timeline change, not only presentation.
- **Frontend half (MG-P3.1):** the client's own `REVEAL_HOLD_MS` 1500 was a ceiling. `beginRevealHold(..., serverPaced)` uses `serverPacedHoldMs(next started_at − now, MODULE_TITLE_MS)`, enabled **only** by `!!segment?.reveal.match`. Without both halves the reveal stays at 1.5 s.
- **Other modules:** unaffected. No other module defines the hook (test-pinned in P2.1). The client flag is Match-only.
- **Replay:** `presentation_ms` is persisted per resolved round and never recomputed. Old and in-flight matches keep the boundary they had. A segment frozen without `reveal_window_ms` returns `None`.

### 6.2 Can Assembly reuse it without copying logic?
Yes. The hook in `service`/`pacing` is generic. Assembly needs:
1. A method `AssemblyModule.settlement_hold_ms(*, reveal_window_ms, reveal)`. It is a few lines, not a copy of the plumbing.
2. A frozen window sized to its reveal.
3. A one-term client opt-in.

The admin presets already freeze `reveal_window_ms` (3000 today). No pacing or service edits are needed.

### 6.3 Minimum safe change (Assembly)
- Target: reveal completes at ~1.9 s (PA2B measurement), plus **2.5 s readable**, so a hold of **4400 ms**.
- Backend:
  - `roster_lock_test_format` / `draft_memory_test_format`: `reveal_window_ms` 3000 → **4400** (`MAX_REVEAL_WINDOW_MS` is 10 000).
  - Add `AssemblyModule.settlement_hold_ms` returning the frozen window (`None` when absent).
  - If an exact board's reveal is measurably shorter, an exact-board shorter hold like MG's `EXACT_BOARD_HOLD_MS` may be added. **Measure first; don't assume.**
  - Effect: next board answerable 4400 + 1400 = 5800 ms after resolution, up from 2900.
- Frontend: `serverPaced = !!(segment?.reveal.match || segment?.reveal.assembly)`. Better: lift it into one exported set beside `INLINE_LOCK_REVEAL_MODULES`. No other change.
- Replay: `assembly.v1` grading and payloads are unchanged. Already-resolved rounds keep their stored `presentation_ms`. A match frozen at 3000 that resolves after deploy gets a 3000 hold, which is benign (local admin playtests only). Tests to update: PA2B's preset/format pins, and P2.1's "no other module has the hook" pin, which becomes "only match and assembly".

### 6.4 Gap not covered by either certification: the final round
When the match ends there is no next `started_at`. `serverPacedHoldMs` returns 0, so the final round falls back to `REVEAL_HOLD_MS` 1500 + `MATCH_OUTRO_MS` 1200 (`useRankedMatch.ts`). MG-P3.1's matrix measured deal 1 → deal 2 only.
- **Measure round 3** for both Match and Assembly in the integrated build.
- If it's short, the fix is presentation-only and frontend-only: for a server-paced module with no next round, use the frozen `reveal_window_ms` as the nominal hold. No backend timing is involved.

## 7. Test matrix (run on base and integration branch sequentially, never in parallel; Scrub saw ~260 spurious failures from parallel runs)

**Backend** (`python -m pytest -q -p no:cacheprovider`, fresh scratch state):

| Area | Suites |
|---|---|
| New modules | `test_match_grid_module.py`, `test_mg_p1_rune_authority.py`, `test_scrub_module.py`, `test_scrub_flow.py`, `test_scrub_wire_contract.py`, `league_mechanics/tests/test_wave_xp_chronoscope.py`, `test_assembly_flow.py`, `test_assembly_wire_contract.py`, `test_assembly_module.py`, `test_assembly_catalog_artifact.py` |
| Pins / shared seams | `test_ranked_modules_quiz_parity.py`, `test_jref2_admin_reference_journey_preset.py`, `test_answer_safety_guard.py`, `test_ranked_playtest_preset.py`, `test_ranked_launch_readiness.py` |
| Reconstruct / Order Forge | `test_reconstruct_{module,flow,wire_contract,certification}.py`, `test_order_forge_{module,flow,wire_contract,v1_frozen,v2_*,b4_preset}.py` |
| Existing Ranked / pacing / bot | `test_ranked_answerable_boundary.py`, `test_meta_reflex_card_reveal.py`, `test_ranked_mastery_reveal_{e2e,secrecy}.py`, `test_ranked_admin_bot_match.py`, `test_ranked_bot_result_parity.py`, `test_ranked_bot_presence_and_recovery.py` |
| Review / history / replay | `test_ranked_match_review_api.py`, `test_ranked_public_history.py`, `test_ranked_question_review.py`, `test_ranked_review_historical_records.py`, `test_ranked_module_stats.py`, plus each module's pure-replay test |
| MG-P1 blast radius | `test_qca5_*`, `test_qca7_*`, `test_qca8_*`, rune runtime suites (`test_*runes_runtime.py`, `test_rune_runtime_rules.py`, `test_legend_runes.py`) |
| Builder non-exposure | `test_ranked_builder_catalog.py`, `test_ranked_format_config.py`. **These currently fail to collect on master** (`AUTH_METHOD_SUPABASE` no longer exists; `routes/_auth.py` has `AUTH_METHOD_SUPABASE_OWNER`), so the `BUILDER_MODULES` pin is not executing. See B6. |

Baseline failures. These are environmental, not integration failures:
- PA2B (108 files): 266 fail on its own base.
- Scrub (wider set): 262 fail on clean `679173bf`.
- MG (46 files): 33 fail on clean `679173bf`.
- Recorded causes: empty shared-bank pools on a fresh DB (`medium_ability_costs`), missing canonical item/champion tables in fixture DBs, stale OWN1 admin harnesses, and the two collection errors above.
- `test_ranked_public_queue_crossprocess::test_cancel_racing_pairing_is_consistent` is a known timing flake.
- **Pass criterion:** the integration branch's failure set ⊆ the base `7e2cb3b7` failure set. The only allowed deltas are the pin updates.

**Frontend** (`vitest`, `SWC_NATIVE_BINDING_CACHE=C:\swc-native-cache`, `--pool=forks`; the full suite OOMs on this machine):
- Scope: `lib/ranked-public`, `lib/ranked-core`, `pages/quiz-ranked` (incl. `QuizRankedMatch.scrub`, `useRankedMatch.revealHold`), `components/ranked-arena`, `components/interaction-grammar`, `lib/interaction-grammar`, `components/quiz/workspace` (incl. `QuestionReviewCard.matchGrid`), `pages/admin`, `lib/scrub`, `components/scrub`, `pages/dev/pro-play-assembly`, `App.routeGuards`, `App.routing-contract`.
- Also `tsc -p tsconfig.app.json` and eslint on changed files.
- Known baseline failures, not regressions: `QuestionStageGeometry`, `AnswerGrid.elimination`, `CanonicalArena.boundary`, `DailyOnCanonicalArena.boundary`, `masterySliceModule.visualLanguage`, `AdminPlatformPolicies`, `AdminQuizReview.proPlay`, `App.routeGuards`, `App.routing-contract`, `playModeCard.styles`. The 2 pre-existing tsc errors are `OnboardingProfile.tsx` and `identity/connections.ts`.
- Load flakes that pass in isolation: `QuizRankedMatch.rfx1b3`, `LobbyPreviewPage*`, `adminQuizRetirement`.

**Browser** (installed headless-shell 1228 via throwaway config; see memory notes on Playwright on Windows):
- `match-grid-arena-continuity` (live integrated server).
- `ranked-scrub-continuity` (replay).
- `pro-play-assembly-ranked` (live).
- Reveal continuity: deal 1 → 2 **and** final round for Match and Assembly, normal and reduced motion. Viewports 1280×600 and 390×844 at minimum.

Coverage of the brief's areas:

| Area | Covered by |
|---|---|
| Existing Ranked gameplay | quiz-parity, answerable boundary, Meta Reflex, mastery suites |
| Version-pinned replay | per-module pure-replay tests; `assembly.v2` → `RANKED_UNKNOWN_MODULE`; frontend registry v2 fails closed |
| Reconstruct | reconstruct suites, including the 5-token refusal at the module |
| Order Forge | order_forge suites |
| Admin-only authorization | HTTP 403 tests in all three flows, plus `ADMIN_ONLY_PRESETS` content |
| Production format non-activation | each flow's "in no other surface" test, plus builder pins once B6 is fixed |
| Strict frontend parsing | three server-capture contract suites |
| Bot timing | the bot-stamp tests; hold vs `timer_seconds` |
| Reveal continuity | the browser specs |
| Review / history | review API, history, and the per-kind review readers |

## 8. Gates and blockers

None of these blocks building the local integration. B1–B3 block push and release. B4–B6 must be resolved or explicitly accepted before release.

- **B1 — Owner authorization.** All three handoffs end at "owner review / authorize". None is authorized to land.
- **B2 — MG-P1 production effect.**
  - Deploying MG runs a startup migration that writes the production `runes` table: additive nullable columns, a `rune_canonical_certifications` ledger, and convergence (+29 rows, Phase Rush retired). It also changes the public `/api/meta/runes` and live quiz rune sources.
  - Needs explicit owner sign-off, plus a dry run of `rune_canonical.cli` against a **copy** of the production DB. Check that the Combat Lab rune list (`/api/meta/runes` consumer) tolerates the 29 new runes, which have no `rune_stats`/effects.
  - `migrate()` is not wrapped, so any apply error **blocks startup**.
- **B3 — Assembly catalog freshness (PA2B L6).** The artifact is unchanged since PA2A `c5bea6b6` (`catalog_revision 99531ef6fe06a894`, digest `99531ef6…54ee`, pinned in `ranked_formats/schema.py`).
  - It was certified from the 2026-09-26 snapshot.
  - Before launch: `python scripts/build_assembly_catalog.py --db <deployed copy> --identity-db <identity copy> --check`. Review the manifest diff. If it changed, commit a new artifact and bump the pin. Readiness then refuses any mismatch.
  - Read-only copies only.
- **B4 — Final-round reveal hold (§6.4).** Unmeasured for Match and Assembly.
- **B5 — Scrub owner decisions.** Header verdict before the traverse (shared shell), child refs, 1280×600 slack.
- **B6 — The builder/format-config pins don't run** (collection error on master). The non-exposure claim currently rests on code inspection plus each flow's own "no other surface" test:
  - `BUILDER_MODULES = (quiz 2, item_cost_duel 4, mastery_slice 1)`.
  - Presets require `match_with_bot`.
  - Admin is decided server-side in `routes/ranked_public.py` (`ADMIN_ONLY_PRESETS` → `is_request_admin`: a verified bearer resolved through `public.owner_auth_state()`; fails closed).
  - Fix the two test imports in a separate, test-only commit so the pin executes.

Security and data gates verified in code. Admin is enforced by the server route, and the frontend buttons are convenience only. All presets are `status="test"`, `rating_eligible=False`, and in no Daily/Standard/Time Trial/Journey/Study Hall/builder/matchmaking path. Assembly reads a committed, digest-checked file and never the esports tables; tampering refuses the match. No production DB was touched by this audit.

## 9. Recommended merge order

Backend (`ranked-int1/backend` from `7e2cb3b7`):
1. `scrub/s2-backend`: clean onto master. It's the smallest, has no production side-effects, and gives a known-good checkpoint.
2. `match-grid/p2.1-release-candidate`: 10 additive conflicts against Scrub (§4.2). Brings the pacing hook and P1.
3. `pa2b/assembly-ranked-integration`: 10 conflicts. Mind the `PLACEMENT_MAX_SLOTS = 5` trap.
4. Follow-up commit: Assembly settlement hold (§6.3).

After each step, run the module's own suites plus pins. After step 4, run the full §7 backend matrix, then regenerate all three wire fixtures.

Frontend (`ranked-int1/frontend` from `b2b1804a`):
1. `scrub/s2-frontend`: clean.
2. `match-grid/p3-frontend`: main conflicts (App/Layout) plus Scrub overlaps.
3. `pa2b/assembly-ranked-ui`.
4. Follow-up: server-paced opt-in for assembly, regenerated fixtures, and the final-round hold if measured short.

Backend before frontend at deploy time. Each frontend renderer is inert without its backend module.

## 10. Exact next Claude assignment — RANKED-INT1

> **RANKED-INT1 — Controlled local integration of Scrub S2, Match Grid P2.1/P3 and Assembly PA2B.**
> Fresh instance. Read `RANKED_INT0_INTEGRATION_PLAN.md` (this file) and the three handoffs first.
> 1. Fetch, then verify `origin/master` = `7e2cb3b7` and `origin/main` = `b2b1804a` (else re-run §4.1 and stop if anything new collides).
> 2. Create local branches only:
>    - backend `ranked-int1/backend` (worktree `LCS/.worktrees/ranked-int1-be`) from `7e2cb3b7`;
>    - frontend `ranked-int1/frontend` (worktree `C:/Users/mlmit/mogzy-wt/ranked-int1-fe`, node_modules junction) from `b2b1804a`.
>
>    Add detached baseline worktrees at the same SHAs.
> 3. Merge in the §9 order with `git merge --no-ff`. Resolve every conflict as a **union** per §4.2/§4.3, checking each listed semantic trap explicitly. Never edit a source branch.
> 4. Implement §6.3: `AssemblyModule.settlement_hold_ms`, preset window 4400, the client `serverPaced` set covering `match` and `assembly`, and updated pins.
> 5. Regenerate all wire fixtures from the integrated backend (§5.4) and copy them into the frontend.
> 6. Run the §7 matrix on base and branch **sequentially**. Report failure-set diffs, not raw counts.
> 7. Live browser:
>    - Assembly and Match on the integrated server. Measure the readable correction after reveal completion for rounds 1→2 **and the final round** (target ≥ 2.5 s); fix the final round frontend-only if short (§6.4).
>    - Scrub continuity spec.
> 8. Optional, separate commit: fix the two `AUTH_METHOD_SUPABASE` test imports (B6) so the builder pin runs.
> 9. Write `RANKED_INT1_HANDOFF.md` in both integration branches with SHAs, conflict resolutions and evidence.
>
> Constraints: no push, deploy, or production DB access. No Docker. Do not touch MG-P1's migration behaviour; B2 is the owner's call. Stop before committing unless the owner explicitly instructs it (repo `CLAUDE.md`). Never commit `lol_calc.db`, `reports/`, diagnostics or local Playwright configs.
> Finish with READY FOR OWNER REVIEW or BLOCKED, with reasons.

---

**Verdict: READY FOR CONTROLLED INTEGRATION.**
- All six source branches are clean and verified at the SHAs above.
- Each merges cleanly onto current mainline, except two additive DEV-route conflicts between MG-P3 and main.
- Every cross-branch conflict is an enumerated union at a known append point, with the semantic traps listed.
- Every workstream's own suites re-pass today.
- The Assembly hold fix is a small use of Match Grid's existing generic hook.

Release stays blocked on B1–B3, and on B4–B6 being resolved or accepted.
