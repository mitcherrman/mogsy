# RECONSTRUCT R1 (GM1) — Handoff

**Objective:** Reconstruct V1. The player rebuilds a legendary item's DIRECT recipe from a six-piece tray. It runs as an admin-only, unrated Ranked Playtest module.

**State: READY FOR OWNER ADMIN PLAYTEST (local branches only).**
- **Backend: CERTIFIED** on `reconstruct/r1-backend` (local commits; nothing pushed or deployed).
- **Frontend: COMPLETE** on `reconstruct/r1-frontend` (`mogsy/.worktrees/reconstruct-r1`, local commit). It is browser-validated at 1600×900, 1280×720 and 390×844.
- Nothing has been pushed, merged, deployed to Railway or published to Lovable.

## Bases
- Backend `reconstruct/r1-backend` (this worktree, `League_Combat_Simulator/.worktrees/reconstruct-r1-be`) is based on master `f3a164f1` (re-verified as `origin/master` on 2026-10-07).
- Frontend `reconstruct/r1-frontend` (`mogsy/.worktrees/reconstruct-r1`, node_modules junction) is based on origin/main `d528bf9f` (re-verified).
- A clean detached baseline backend worktree exists at `League_Combat_Simulator/.worktrees/r1-baseline` (`f3a164f1`) for failure comparisons.

## Settled product decisions (do not reopen)
- Direct recipe only. Socket order is irrelevant. Repeated parts are allowed. There is an explicit lock.
- The backend grades the exact multiset.
- The reveal teaches the direct recipe plus the next level and the gold breakdown.
- It is not Order Forge, not multiple choice, not positional, and not a full-tree game.
- A full tree would need 2–9 sockets (median 6), and ~75% of trees repeat a token, so nested grading is ambiguous.

## Authority and measurements
- **Recipe catalog:** `ranked_recipe_catalog.py` reads `item_graph_nodes` (source=wiki), `item_build_components` (quantities), `item_canonical` (types/modes/current) and `item_graph_provenance`. It does not read closure, and there is no second recipe store.
- **Measured on certified local rev 4065930.** These are observations, not code constants. A test pins that none of them appear in production code.
  - 117 Legendary items; 106 eligible.
  - 11 excluded: 10 `not_shop_purchasable` (upgrade/transform) and Mejai's (`shape_unsupported`).
  - Slots: 2:46, 3:59, 4:1.
  - 12 targets need a part more than once.
- **Production** is on rev 4051358. Its recipes are identical for 213 items. Stormrazor's id differs: 3097 in production, 3095 locally.

## Backend certification (this run)

### The six HTTP failures: root causes
All 6 were in `test_reconstruct_flow.py` (`test_http_snapshot_and_lock` plus 5 parametrised `test_http_refuses_bad_bodies_and_stores_nothing`). They failed in three stacked layers, and all three were test-harness defects. No product code was wrong.

1. **Schema collision (`sqlite3.OperationalError: table item_canonical has no column named base_cost`).**
   - The borrowed `env` fixture (`test_ranked_playtest_preset`) first seeds a reduced 15-column `item_canonical` through `canonical_fixture_support`.
   - `seed_recipe_graph`'s `CREATE TABLE IF NOT EXISTS` then no-ops, and the insert fails.
   - Production runs the full lifecycle DDL.
   - Fix: `reconstruct_fixture_support._widen_to_lifecycle_columns` ADDs any lifecycle column the pre-existing fixture table lacks. It only adds columns and keeps rows.
2. **Stale admin harness (`403 RANKED_PRESET_NOT_AUTHORIZED`).**
   - OWN1 retired the `MOGSY_ADMIN_USER_IDS` allowlist. `is_request_admin` now requires the caller's verified owner bearer, via `routes._auth._authorize_bearer`.
   - The borrowed `env` still only sets the retired env var.
   - Clean `origin/master` shows this is not ours: 34 failures across `test_ranked_playtest_preset`, `test_ranked_admin_bot_match` and `test_jref2_*` for the same reason.
   - Fix: a new `owner` fixture in `test_reconstruct_flow.py` sends a bearer and replaces ONLY the Supabase owner-state lookup, the same way `test_own1_ranked_admin_auth.py` does. `is_request_admin`'s identity check stays real, so the owner bearer cannot authorize PREMIUM/FREE; the admin-only test now proves this.
3. **Wrong clock (`409 RANKED_STALE_ROUND: segment 1 is not the active segment (2)`).**
   - `_http_match` advanced to this file's `T0` (2026-10-07) + 8s.
   - The borrowed env created the match at its own `T0` (2026-09-09), so the advance jumped about four weeks and expired segment 1.
   - Fix: advance relative to `env["clock"]["now"]`.

### Added regressions: `test_reconstruct_certification.py` (22 tests)
- **Item-ID migration:**
  - `test_settlement_api_takes_no_catalog`: after generation, no module method can consult a catalog.
  - Stormrazor freeze-on-3095, re-key-to-3097: grade, reveal and settle are byte-identical. A new round carries 3097 with the same recipe.
  - A part re-key (Pickaxe).
  - Service level: round 1 freezes, then EVERY id it names is re-keyed in the live tables. Settlement and review equal what the frozen payload dictates.
  - Graph WIPED mid-match: the service resolves round N in the same transaction that generates N+1, so the step rolls back. Nothing settles wrongly. Once the graph is restored under migrated ids, round 1 settles correctly from its frozen payload.
- **Runtime eligibility:**
  - A synthetic graph (not the fixture): plan counts follow it, `{0:0, 1:0, 2:0, 3:3, ...}`; fewer than 3 targets cannot fill a tray.
  - A synthetic upgrade is excluded. A one-piece recipe is `shape_unsupported`. A ×2 recipe is eligible.
  - Readiness is read from a DB seeded with synthetic graphs (5/3 ok; 2/0 refused).
  - A synthetic 3-target graph serves a real match.
  - No measured count (106/117/46/59) appears in production code.
- **Quantity:**
  - One-copy in every order.
  - Duplicate needed: too few, too many, any order.
  - Over the reuse bound, unknown token, case-sensitive token, empty, nested, null and dict are all refused.
  - Across the whole population, no tray repeats an identity, and the target is never in its own tray.
- **Decoys (whole population):**
  - Every decoy is canonical, current, SR, shop, `_piece_ok`, never a correct part and never Dark Seal.
  - A synthetic recipe twin is excluded while a non-twin is taken.
  - `max_uses == slot_count` everywhere, and pieces carry only `{piece_id,label,media}`.
  - An unfillable tray fails closed (`RANKED_MODULE_DATA_UNAVAILABLE`).

### Wire contract: `test_reconstruct_wire_contract.py`
- It plays one admin match over HTTP: seg 1 wrong, seg 2 right in reversed socket order, seg 3 timeout.
- It pins the field names. With `RC_WIRE_CAPTURE_PATH` set, it writes the frontend fixture `mogsy/src/lib/ranked-public/__fixtures__/reconstructServerCapture.json`. Regenerate it whenever the contract changes.

### Contract change this run
- `ReconstructModule._reveal_body` now also carries `pieces` (the public tray: `piece_id`, `label`, `media`). This lets a settlement or transcript name a wrong (decoy) pick.
- These are public facts that were already shown pre-lock.

### Pinned-set updates (legitimate registry expansion)
- `test_ranked_modules_quiz_parity.py::test_registered_modules_are_exactly_the_shipped_set` (+`("reconstruct", 1)`)
- `test_jref2_admin_reference_journey_preset.py::test_existing_presets_are_unchanged` (+`PRESET_RECONSTRUCT`)

### Backend test results
- **Reconstruct suites:** 121 pass (module 68, flow 30, certification 22, wire 1).
- **Wide suite:** 136 ranked/review/readiness/preset/format/analytics/order-forge files, branch vs clean baseline:
  - Branch-only failures: exactly the 2 pinned tests above, now fixed.
  - The other ~344 failures also fail on clean `origin/master`. They are pre-existing, mostly OWN1-stale admin harnesses (`test_order_forge_*`, `test_ranked_admin_bot_match`, etc.).
  - The baseline shows ~260 extra failures in `test_ranked_question_media`/`premise_facts`/`option_media`. These are environmental: the fresh worktree lacks a local data DB, and those tests skip without it.

## Contract (backend)
- **Public:** `segment_state.challenges = {family, prompt, reveal_window_ms, challenges:[{challenge_index, target{label,media}, slot_count, max_uses (= slot_count), pieces[6]{piece_id p0..p5, label, media}}]}`.
- **Submission:** `{"placement": [piece_id per socket]}`.
  - An unknown or ill-shaped value gets 422 `RANKED_INVALID_CHOICE`.
  - A short body gets 422 from the schema.
- **Own reveal (lock ack `challenge_reveal` / `own_challenge_reveals[0]`):** `{challenge_index, placement, is_correct, slot_correct, settled_placement, canonical_parts[{piece_id,label,quantity,value_display,sub_parts[{label,media,quantity}]}], pieces, target{label,total_display,combine_display}}`.
- **Settlement `segment_reveal`:** module/scoring fields, `canonical_parts`, `pieces` and `target`, plus `players.{pid}.{placement, slot_correct, settled_placement, correct, incorrect, unanswered, points…}`.
- **Review round:** `kind:"reconstruct"`, with `target`, `slot_count`, `pieces`, `viewer_placement`, `canonical_parts`, `recipe_target`, `slot_correct`, `settled_placement`, `outcome` and `is_correct`. The answer fields are null when unrevealed.
- **Reveal-only keys** (backend `FORBIDDEN_PRE_REVEAL_KEYS`): `canonical_parts`, `slot_correct` and `settled_placement`.
  - The frontend `_FORBIDDEN_SEGMENT_KEYS` adds these plus `sub_parts`, `decoys`, `total_display` and `combine_display`.
  - `value_display` was already present.
- **Preset:** `admin.reconstruct` maps to `reconstruct_test_format`: 3 × `reconstruct.v1`, 30s, 2 points plus the speed bonus, unrated, admin-only.

## Known limitations (backend)
- If the recipe graph vanishes mid-match, the match stalls (fails closed) until it returns. This is the shared lazy segment-generation flow, not Reconstruct-specific.
- The wide suite's pre-existing OWN1-stale admin harnesses on master are NOT fixed here (out of scope). The Reconstruct tests use their own correct harness.

## Frontend (reconstruct/r1-frontend, mogsy/.worktrees/reconstruct-r1)

### Reused from STUDIO3-S2 (`6a85fe93`)
Ported:
- `lib/interaction-grammar/reconstruct.ts`: the placement helpers `normalizePlacement`, `placeToken`, `clearSlot`, `countUses`, `isBoardFull`, `assertReconstructContent` and the speech helpers.
- `lib/interaction-grammar/reconstructReveal.ts`: the reveal clock marks → settle → evidence, ≤1.5 s, instant under reduced motion.
- `types.ts`: `AssemblyOption`, `ReconstructPublic`, `ReconstructResponse` and `ReconstructReveal`.
- `components/interaction-grammar/Reconstruct.tsx`: select-then-place tap input, drag enhancement, roving-tabindex keyboard, one live region, and data-part hooks.
- Their test suites.

Deliberately NOT ported:
- `gradeAssembly`. The server grades. A test pins that the client lib exports no grader.
- The `/dev/reconstruct` harness and its invented fixtures.
- All Studio S3/S4 architecture.

### Adapted
- **Fixed geometry, measured in the real shell.** Every box has the same size in every phase:
  - the target row;
  - the 56px sockets (64px when the stage is at least 800px tall);
  - the fixed two-line slot labels;
  - a fixed 34px status line (hint, then locked, then the verdict plus what each wrong pick was);
  - a tray box reserved at 2×92px+8 = 192px, which the recipe panel takes over IN PLACE at the evidence stage;
  - a fixed 48px footer.
- **Wrong pick.** It is an absolute corner badge (no layout), not S2's reserved chip row.
- **Evidence.** It gained `parts` (canonical rows with counts) and `children` (the level beneath).
- **Usage.** It is a quiet badge that appears only once a piece is used.

### Integration
- `client.ts`: `SegmentChoice` gains `{placement}`.
- `contracts.ts`:
  - `RECONSTRUCT_MODULE_ID` and the block, own-reveal, settlement and review readers, with an inverse unrevealed guard.
  - `_FORBIDDEN_SEGMENT_KEYS` gains `canonical_parts`, `slot_correct`, `settled_placement`, `sub_parts`, `decoys`, `total_display` and `combine_display`. `value_display` was already present.
- `reconstructModule.tsx`:
  - It is the renderer, serving v1 only; v2 fails closed to unsupported.
  - It has `ownsSubmission` and `ownsResultReveal`, and maps the server reveal to evidence without grading.
  - The only arithmetic is counting the server's own per-socket marks, for "1/2 placed".
- `orderForgeLockReveal.ts` and `useRankedMatch.ts`: the inline bot-lock reveal path is generalized to `INLINE_LOCK_REVEAL_MODULES`. Each reveal must carry its own module's block.
- Host seams: `centralStage`, `SegmentTranscript`, `QuestionReviewCard` (`ReconstructBody`), `ModuleSigil` (Puzzle), `questionTimelineParts`, `questionIcons`, `rankedResultsModel` and `roundMedia` (target and 6 pieces preloaded).
- Admin → Leaguecraft → Ranked → Playtests: a "Reconstruct" panel with `ReconstructLaunch` (preset `admin.reconstruct`, through `PresetLaunch`).
- Dev probe: `?q=reconstruct&rc=witsEnd|stormrazor|fourSlot&recon=locked|wrong|right|live`. Add `&entry=fresh&lead=300` so the probe round is open; without it the probe clock leaves the board inert, as it does for Order Forge.
- **Fixtures (not hand-written):**
  - `__fixtures__/reconstructServerCapture.json`: real HTTP bodies from backend `test_reconstruct_wire_contract.py`.
  - `__fixtures__/reconstructProbeRounds.json`: real module output for three targets, generated by the backend module against the frozen wiki graph.

### Frontend tests (all pass)
| Suite | Tests | Covers |
|---|---|---|
| `Reconstruct.test.tsx` (primitive) | 82 | Placement, duplicates and limits, lock, keyboard, a11y, live region, drag, animated and reduced-motion reveal, 390px fit, fixed geometry, the level beneath |
| `reconstruct*.test.ts` (lib) | 32 | |
| `reconstructModule.test.tsx` | 19 | open → placed → revised → locked, `{placement}`, pending/refusal, echo, inert-until-open, keyboard-only, wrong/right/copy-too-many/4-socket reveals, node continuity, inline bot-lock reveal, source contract (no grader, no opponent build) |
| `contracts.reconstruct.serverCapture.test.tsx` | 17 | Real bytes, disclosure guard per key, own-reveal guard, settlement, transcript, review (+ unrevealed guard), media preload |
| `QuizRankedMatch.reconstruct.test.tsx` | 4 | REAL host with real bot-inline bodies: no answer before lock, the reveal from the inline ack, no generic stamp, reduced motion, a refused lock reopens |
| `ReconstructLaunch.test.tsx` (+ `AdminShell.areas`) | 4 (+1) | |
| Registry pinned list | | Updated |

- **Related set** (ranked-public, ranked-core, ranked-arena, quiz workspace, quiz-ranked, admin, interaction-grammar, probe): 3523 tests.
  - 28 failures, all of which also fail on clean `d528bf9f` (baseline worktree `mogsy/.worktrees/r1-fe-baseline`).
  - Zero branch-only failures.
- `tsc -p tsconfig.app.json`: no new errors. The 2 existing ones are in onboarding/identity.
- eslint: 0 errors.

### Browser validation (real shell via probe, real wiki art served from the backend worktree)
- **Geometry.** Sockets, status line, tray box and module bottom were measured identical across open/partial/full/revised/locked/wrong/right for Wit's End (×2), Stormrazor and Dusk and Dawn (4 sockets). The animated reveal was sampled every 50ms and never moves a node.
- **Fit.**
  - 1280×720: module bottom 543 inside a 553px question body.
  - 1600×900 and 390×844: fit, with no horizontal overflow.
  - Every control is ≥ 44px.
- **Fixed during validation:**
  - a 4.4px shift from two-line slot labels;
  - an 8px shift from the pick chip;
  - a ~200px overflow at 1280×720, solved by the compact layout;
  - a 3–6px growth of the 4-part recipe panel;
  - a truncated gold breakdown on mobile.
- **Screenshots:** session scratchpad `reconstruct-screens/`.

### Known limitations
- No module-specific verdict SFX. The lock cue plays; Order Forge's per-segment verdict cue was not generalized.
- The tray and socket cells use the interaction grammar's shared `dark:bg-card` paint, the same as Order Forge, so in the dark theme they are navy on the parchment stage.
- The recipe panel reserves room for four parts. Two-part recipes leave space above the total line; this is deliberate, so nothing moves.
- If the backend recipe graph is absent, match creation is refused (readiness). If it vanishes mid-match, the match stalls fail-closed (shared lazy segment generation).

### Next steps (owner)
1. Owner admin playtest: Admin → Leaguecraft → Ranked → Playtests → Play Reconstruct. This needs the backend branch deployed somewhere with the recipe graph.
2. Then decide whether to push/merge both branches. Nothing has been pushed.
