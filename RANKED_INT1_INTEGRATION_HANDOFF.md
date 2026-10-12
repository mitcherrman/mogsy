# RANKED-INT1 — Controlled Multi-Mode Integration — Handoff

Scrub / Chronoscope S2 + Match Grid P2.1 (backend) / P3.1 (frontend) + Pro Play
Assembly PA2B, integrated locally on both repos. Date 2026-10-12. Claude Opus 5.5,
fresh instance. The same file is committed in both integration branches.

**Verdict: READY FOR OWNER REVIEW** — the combined local integration meets its tests (0 integration-introduced failures on either repo; live lifecycles green for all three modules) and every production blocker is documented. **Not production-ready:** the MG-P1 rune migration (hard deployment blocker, §8) and the deployed-catalog check (§10) are unapproved.

Nothing was pushed, merged into master/main, deployed, published, or run against a
production, Railway or Supabase database. No Docker.

---

## 1. Verified bases and source SHAs (fetched 2026-10-12)

| | SHA | Verified |
|---|---|---|
| Backend `origin/master` | `7e2cb3b7b28c6e774a2eaaf4fa04911ece30f3a1` | unchanged since INT0 |
| Frontend `origin/main` | `b2b1804afdd1eee1a328629033a6c074128a7e3d` | unchanged since INT0 |
| Scrub BE `scrub/s2-backend` | `e9e0e9a0b77a2af0d84962216fa47c8294957ee7` | clean |
| Match Grid BE `match-grid/p2.1-release-candidate` (RC) | `2464703ca7143ef67f373cd015aedc718d82f7ef` | clean; superseded `p2-module` `7da4f2ec` is **not** an ancestor and was not merged |
| PA2B BE `pa2b/assembly-ranked-integration` | `5243081c52c13cc40170fb29ebf18dd440d468c5` | clean |
| Scrub FE `scrub/s2-frontend` | `506ac30bebd7c6153670dd46253499d388a3f48c` | clean |
| Match Grid FE `match-grid/p3-frontend` | `453aa333bd9bd11464c23de0db4ac17eac96356e` | clean |
| PA2B FE `pa2b/assembly-ranked-ui` | `4e399a03d99fd8182040a17050bf951154783bb8` | clean (its untracked local Playwright config is deliberate) |

Every source worktree (`scrub-s2-be`, `mg-p21-rc`, `pa2b-assembly-integration`,
`pa1-assembly-content`, `pa2a-assembly-module`, `ranked-int0-audit`, `scrub-s2-fe`,
`match-grid-p3`, `pa2b-ui`, `pav1-fable`) was re-checked at the end: same HEAD, same
working tree as found. The INT0 plan (`RANKED_INT0_INTEGRATION_PLAN.md`, uncommitted in
`.worktrees/ranked-int0-audit`) is preserved byte-identically (sha256 `67090f88…`) in
both integration branches; the original is left where it was.

**Mainline moved during the session (seen at the end, 2026-10-12):** backend `origin/master` is now `bf4cffe4` (4 commits after `7e2cb3b7`: PW4-A Worlds 2026 tournament authority + retries, and "Add 42 Vision Practice questions with idempotent startup importer"). A `git merge-tree` dry run of the integration tip against it is **clean** (textual overlap only in `api_server.py` and `quiz/public_category.py`); it was not merged here. Note the new master commit adds another startup importer to the lifespan beside MG-P1's. Frontend `origin/main` is unchanged (`b2b1804a`).

Handoffs read: Scrub S2, Match Grid P2 (+ P2.1 section), Match Grid P3 (+ P3.1),
PA1, PA2A, PA2B.

## 2. Integration branches and worktrees (local only)

| | Branch | Worktree | Baseline worktree |
|---|---|---|---|
| Backend | `ranked-int1/multi-mode-backend` | `League_Combat_Simulator/.worktrees/ranked-int1-be` | `.worktrees/ranked-int1-be-base` (detached `7e2cb3b7`) |
| Frontend | `ranked-int1/multi-mode-frontend` | `C:/Users/mlmit/mogzy-wt/ranked-int1-fe` | `C:/Users/mlmit/mogzy-wt/ranked-int1-fe-base` (detached `b2b1804a`) |

Both frontend worktrees hold a `node_modules` **junction** to the main checkout:
`rmdir` it before any `git worktree remove`.

Final SHAs: see §15.

## 3. Merge order (INT0 §9, confirmed safe on fresh evidence)

`git merge --no-ff`, source tip verified before each merge, conflicts resolved hunk
by hunk (never `ours`/`theirs`), focused suites run and the stage committed.

Backend (`7e2cb3b7` →):
1. `ce7a75d7` merge `scrub/s2-backend` — clean.
2. `262132b4` merge `match-grid/p2.1-release-candidate` — 10 files, all additive.
3. `2a0e17d0` merge `pa2b/assembly-ranked-integration` — 10 files, all additive.
4. `9da40f07` encoding repair (see §4 note).
5. `1bc0bccb` Assembly settlement hold.
6. `1f16b06b` builder/format-config pins collect again (test-only).
7. handoff commit.

Frontend (`b2b1804a` →):
1. `420a1350` merge `scrub/s2-frontend` — clean.
2. `35f20277` merge `match-grid/p3-frontend` — 17 files / 47 hunks.
3. `675d044a` merge `pa2b/assembly-ranked-ui` — 17 files.
4. `310d810a` shared server-paced hold + final round + regenerated wire fixtures.
5. multi-mode live spec + handoff commit.

The audited order held: each stage conflicted only at the enumerated append points.

## 4. Conflict resolutions

All conflicts were unions at append points; each was rebuilt by hand from the three
sides (diff3 view).

**Backend** (stage 2 = Scrub×Match, stage 3 = (Scrub+Match)×Assembly):
- `ranked_modules/registry.py`: `register(ScrubModule())`, `register(MatchModule())`,
  `register(AssemblyModule())`. Registered set (pinned):
  `assembly 1, item_cost_duel 1-5, mastery_slice 1-2, match 1, order_forge 1-2, quiz 1-2,
  reconstruct 1, scrub 1`.
- `answer_safety.py`: `FORBIDDEN_PRE_REVEAL_KEYS` = previous ∪ Scrub
  (`canonical_checkpoint, satisfied_checkpoints, proof, traverse_path, threshold_xp,
  granularity_caveat`) ∪ Match (`canonical, canonical_assignments, settled,
  settled_assignments, answers, entity_correct, correct_group, entity_facts`) ∪ Assembly
  (`canonical_lineup, position_correct, card_facts, historical_context, matched`).
  Match's `canonical` and Assembly's `matched` are both kept; every module's flow suite
  passes with the union (Match uses `matched` only post-reveal).
- `ranked_formats/schema.py`: `_validate_scrub_config`, `_validate_match_config`,
  `_validate_assembly_config` all called and kept whole; all three admin format factories.
- `ranked_public/readiness.py`: three readiness functions, three report keys, and the
  `assert_format_servable` tuple lists `mastery_slice, order_forge, reconstruct, scrub,
  match, assembly`.
- `ranked_public/service.py`: `PRESET_SCRUB`, `PRESET_MATCH`, `PRESET_ROSTER_LOCK`,
  `PRESET_DRAFT_MEMORY` in `PRESET_FORMATS` **and** `ADMIN_ONLY_PRESETS`; catalog injection
  arms for `match` (`_rune_catalog`) and `assembly` (`_assembly_catalog`) in
  `_generate_segment`; both helpers. Match's `_resolve` settlement-hold hook auto-merged.
- `ranked_public/review.py`: module ids + three dispatch arms (`_scrub_round`,
  `_match_round`, `_assembly_round`).
- `ranked_public/projections.py`: all four preset map entries.
- `schemas/ranked_public_schemas.py`: **`PLACEMENT_MAX_SLOTS = 5`** (the trap: Match's side
  still carried 4) beside Match's `ASSIGNMENTS_*`/`MatchAssignmentIn` and Scrub's
  `CHECKPOINT_TOKEN_MAX_LENGTH`; `checkpoint` and `assignments` fields; the exactly-one
  tuple, error text and `as_choice` arms list all seven spellings.
- Pins `test_ranked_modules_quiz_parity.py`, `test_jref2_admin_reference_journey_preset.py`:
  union.
- Note: the stage-3 docstring resolution was written through a helper that read its text
  in the console code page, double-encoding one em dash; `9da40f07` repairs it (docstring
  only). The same slip in the frontend `Layout.tsx` comments was repaired inside the stage-3
  merge; `Layout.tsx` now differs from main only by the two DEV routes.

**Frontend:**
- `contracts.ts` (17 + 18 hunks): `ReviewRound.kind` = `… | "reconstruct" | "scrub" |
  "match" | "assembly"`; **both** `kind !== …` guards list all three; the tally and
  `challenges:` chains are `isOrderForge || isReconstruct || isScrub || isMatch ||
  isAssembly`; `_FORBIDDEN_SEGMENT_KEYS` = union of all three lists (incl. Match's
  `rune_key/tree_key/is_keystone/rune_type/tree_label` and Assembly's
  `role_anchor/slot_anchor/registry_evidence`); every reader (block, echo, own reveal,
  settlement, review) for all three; PA2B's exact allow-list readers intact.
- `orderForgeLockReveal.ts`: `INLINE_LOCK_REVEAL_MODULES` holds order_forge, reconstruct,
  scrub, match, assembly; `carriesOwnBlock` chains reconstruct → scrub → match → assembly.
- `client.ts` `SegmentChoice`: `placement | checkpoint | assignments`.
- `registry.ts` (+ test): map entries **and** the module list for all three.
- `centralStage`, `SegmentTranscript`, `roundMedia`, `QuestionReviewCard` (`ScrubBody`,
  `MatchBody`, `AssemblyBody`), `questionIcons`, `questionTimelineParts`, `ModuleSigil`
  (`Hourglass`, `Network`, `Users`), `rankedResultsModel`, `AdminRankedPage` (+ areas
  test), `interaction-grammar/types.ts`, `App.tsx`/`Layout.tsx` (both DEV labs beside
  main's Pro Play Arena routes; the `||` chain ends once), `playwright.arena.config.ts`.
- `rankedResultsModel.reviewRoundQuestionTally`: Scrub is not in that guard on its own
  branch; left as Scrub shipped it (its `challenge_count` is 1, so both branches count one
  question).

## 5. Placement width and strict contracts

- HTTP route: `placement` 2..5 (`PLACEMENT_MAX_SLOTS = 5`).
- A valid five-token Assembly lock → 200 (`test_assembly_flow` HTTP five-token lock; live
  browser runs); malformed Assembly boards (incomplete, duplicate, foreign token,
  `{assignment}`, extra fields) → 422 and nothing stored.
- Reconstruct still refuses five tokens at the module (`RANKED_INVALID_CHOICE`, 422):
  `test_reconstruct_module.py` (PA2B pin).
- Match `assignments` and Scrub `checkpoint` contracts unchanged (their suites pass).
- Every frontend strict reader passes against fixtures regenerated from the
  **integrated** backend (§12).

## 6. Settlement hold (shared implementation)

Mechanism (verified in code, unchanged): `service._resolve` reads an optional
`module.settlement_hold_ms(reveal_window_ms=<frozen>, reveal=<segment_reveal>)` and passes
it to `pacing.module_transition_ms(hold_ms=)`, which replaces only the result-beat term.
The result is persisted per resolved round as `presentation_ms` and moves the next round's
`started_at` (and with it its deadline). It is never recomputed.

**Backend (`1bc0bccb`):** `AssemblyModule.settlement_hold_ms` (same shape as Match's): the
frozen window when any player's board was not exact, else `EXACT_BOARD_HOLD_MS`; `None`
without a window. Sized from the PAV1 primitive's own clock (`ASSEMBLY_TIMING`): marks
0–700, settle 700–1500, plate in by 1900 ms → **4400** (1900 + 2500 to read the plate);
an exact board has no settle stage, plate in by 1100 → **3600**. Presets
`admin.roster_lock` / `admin.draft_memory` freeze `reveal_window_ms` 4400 (was 3000);
the module default (3000) is unchanged. Effect: next board answerable 5800 ms after a
wrong/timeout board (was 2900), 5000 ms after exact boards.

**Frontend (`310d810a`):** `SERVER_PACED_REVEAL_MODULES = {match, assembly}` beside
`INLINE_LOCK_REVEAL_MODULES` replaces the Match-only `!!reveal.match` flag; the existing
`serverPacedHoldMs` path is reused unchanged.

Not changed: scoring, bot accuracy/think time/stamps, block deadlines (Assembly is
block-clocked; tested that each board's deadline stays `started_at + 45 s`), other
modules' windows (Reconstruct/Scrub 3000), `RESULT_HOLD_MS`, `MODULE_TITLE_MS`.
Replay: a stored `presentation_ms` is not recomputed even if the rule changes (tested).
A match frozen at 3000 that resolves after deploy gets a 3000 hold (admin playtests only).

## 7. Final-round findings (INT0 B4)

**Defect confirmed.** With no next `started_at`, `serverPacedHoldMs(null)` returned 0, so
the final Match/Assembly correction got the generic 1500 ms and then the match-complete
outro covered it. Measured in the real controller (`QuizRankedMatch` + real hook) on the
captured final Assembly round: **1503 ms** before the outro.

**Fix (frontend-only, one shared rule, `310d810a`):** when a server-paced module's round
has no next boundary, the hold is the round's own stored `presentation_ms` minus the
module title — exactly what the round would have shown before a next board. The backend
writes the last round's `presentation_ms` as `hold + MODULE_TITLE_MS` (no special beat
follows it; pinned in `test_ranked_int1_settlement_hold.py`: Assembly 5800, Match 5900,
Scrub generic). After the fix the same lifecycle test holds ≥ 4400 ms, then the outro,
then the end screen. Missing `presentation_ms` (old backend) or any other module: the
ordinary beat, unchanged (tested). The hold counts from this client's discovery, so it can
only run longer than the server window; nothing waits on it except the outro.

Live browser measurements: §13.

## 8. Match Grid rune migration — risk and production gate

**HARD DEPLOYMENT BLOCKER.** Starting the integrated backend runs MG-P1's rune
convergence unconditionally in the FastAPI lifespan (`api_server.py:306`) against
`$LOL_CALC_DB_PATH` (else `lol_calc.db` in the CWD). Any boot against the production volume
IS the production migration: +15 nullable `runes` columns, an index, a
`rune_canonical_certifications` ledger, +29 rune rows, Phase Rush flagged `retired`, a
filtered `/api/meta/runes` (503 when uncertified), filtered quiz rune sources. No
down-migration; reverting the code leaves the rows and columns and resurfaces Phase Rush.
Importing modules writes nothing; it is SQLite-only (Supabase is never touched); no test
enters the lifespan or resolves to a non-temp DB.

The migration was **not** disabled or rewritten (that would change Match Grid). Disposable
dry run, exact changes, consumers, rollback and the owner checklist:
`docs/RANKED_INT1_RUNE_MIGRATION_APPROVAL_CHECKLIST.md` (backend).

## 9. Builder / admin security

`test_ranked_builder_catalog.py` and `test_ranked_format_config.py` did not COLLECT on
master (stale `AUTH_METHOD_SUPABASE` import, retired by OWN1). Repaired test-only
(`1f16b06b`): test principals use `AUTH_METHOD_SUPABASE_OWNER` via dependency override;
the admin-key test (an OWN1-retired path) now pins that `X-Admin-Key` grants nothing (403
on PUT and GET) instead of reinstating it. New pin: Scrub, Match Grid, Assembly (and
Reconstruct, Order Forge) are absent from `BUILDER_MODULES` and the served module
catalog; their presets are admin-only, `status="test"`, unrated, and not Study Hall.
Result: **85 passed, 1 skipped** (needs the canonical identity DB).

Admin restriction is server-side: each new preset → `RANKED_PRESET_NOT_AUTHORIZED` (403)
for non-owners (each module's HTTP suite; Assembly also live in PA2B).

**Owner decision found (pre-existing class, not changed):** the owner-only
`PUT /api/ranked/admin/format-config/{target}` validates through the generic schema, which
accepts **any registered module**. Probed on a scratch DB: the owner can save a public
format of `reconstruct` (already true on master), `scrub`, `match` or `assembly` by raw
API. The builder UI does not offer them. This is owner power, not public reachability, but
before any public launch the owner should decide whether format-config saves must be
restricted to `BUILDER_MODULES`.

## 10. Assembly content safety

- Catalog `assembly_catalog/pa2a_worlds_finals_semifinals_2015.v1.json` (+ manifest):
  **byte-identical** to PA2A `c5bea6b6` (git blob `4f1e90ef…` / `c69c005b…` in the commit
  and the working tree; `*.json -text` protects it from autocrlf).
- `catalog_digest = 99531ef6fe06a89434586eef652038ab59a2cac31111766ddb08606baf8054ee`,
  revision `99531ef6fe06a894` = the pin `ASSEMBLY_TEST_CATALOG_REVISION`; the loader's
  integrity check passes.
- Missing / tampered / truncated / re-revisioned catalog refuses the Assembly match and
  stores nothing while a Reconstruct match on the same DB still creates; catalog lost
  mid-match fails closed and recovers; readiness reports the pinned population
  (`test_assembly_flow`, `test_assembly_catalog_artifact`: 37 passed in the focused run).
- All 158 catalog champions resolve to a frontend icon.
- **Not executed in INT1:** the local `build_assembly_catalog.py --check`. It reads the
  identity-registry recovery DB (personal data) and the tool permission for that read was
  declined in this session; PA2A's `REPRODUCED` (2026-10-11, same artifact) remains the
  latest reproduction. This is NOT production verification.

**Pre-deployment recertification (read-only):**
```
python scripts/build_assembly_catalog.py --db <READ-ONLY COPY of deployed lol_calc.db> --identity-db <READ-ONLY COPY of deployed mogsy_esports_identity_full.db> --check
```
- Prereqs: Python env of this repo; both DBs as **copies** (opened `mode=ro`); env
  `LOL_CALC_DB` / `MOGSY_IDENTITY_DB_PATH` may replace the flags; ~40–100 s (resolver
  warm-up). Exit 0 + `REPRODUCED digest=99531ef6…` = unchanged.
- `--check` writes nothing. **Without `--check` the script overwrites the committed
  artifact** — to inspect a changed catalog, add `--out-dir <scratch dir>`, review the
  manifest diff, then commit a new artifact and bump the pin (readiness refuses any
  mismatch).

## 11. Scrub open issues (launch gates for the owner)

Preserved as shipped; nothing redesigned. The integration does not touch the shared
shell/arena CSS or `CanonicalArena` (only the primitives' own scoped stylesheets were
added), and Scrub is not server-paced (its 1500 ms beat is unchanged). Still owner
decisions: (1) the shell header verdict lands before the traverse; (2) whether `scrub`
declares child refs; (3) 1 px of spare room at 1280×600. Browser evidence: §13.

## 12. Regression results against baseline

Sequential runs on the clean baseline worktrees, then the branch (never in parallel).

**Backend** — `python -m pytest -q -p no:cacheprovider --continue-on-collection-errors`, 126
files on the branch (113 exist on base): every `test_ranked*`, Reconstruct, Order Forge,
Scrub, Match Grid, MG-P1 authority, Assembly (module, catalog artifact, real-corpus,
flow, wire), answer-safety, jref2 pins, Meta Reflex card reveal, QCA5/7/8, the rune
runtime suites, public-category, wave/XP chronoscope, and `test_ranked_int1_settlement_hold`.

| | passed | failed | errors | skipped |
|---|---|---|---|---|
| base `7e2cb3b7` | 2656 | 534 | 7 | 118 |
| branch | 3178 | 533 | 5 | 135 |

- **Tests failing on the branch but not on base: 0.**
- Fixed on the branch: the 2 collection errors (builder/format-config, §9) and the known
  `test_ranked_public_queue_crossprocess::test_cancel_racing_pairing_is_consistent` timing
  flake (passed this time).
- 538 tests exist only on the branch: 521 passed, 17 skipped (the two real-corpus Assembly
  suites need `LOL_CALC_DB` / `MOGSY_IDENTITY_DB_PATH`, not provided).
- The 533 shared failures are the environmental baseline recorded by INT0/Scrub/MG/PA2B:
  empty shared-bank pools on a fresh DB (`QuestionBankError … no such table:
  quiz_questions`), missing canonical tables (`champion_runtime_profiles`, …), stale OWN1
  admin harnesses (403), entitlement lookups. Largest: `test_ranked_question_media` 139,
  `test_ranked_premise_facts` 70, `test_ranked_candidate_review_routes` 41,
  `test_ranked_option_media` 40, `test_ranked_admin_bot_match` 28. Includes
  `test_jref2…::test_an_ordinary_bot_match_is_unchanged` (fails identically on base).

Focused per-stage runs (all green except that jref2 baseline test): Scrub stage 131;
Match Grid stage 302; Assembly stage 518; hold suites 247; builder/format-config 85 (+1
skip).

**Frontend** — vitest `--pool=forks` over `lib/ranked-public`, `lib/ranked-core`,
`pages/quiz-ranked`, `components/ranked-arena`, `components/interaction-grammar`,
`lib/interaction-grammar`, `components/quiz/workspace`, `pages/admin`, `lib/scrub`,
`components/scrub`, `pages/dev/pro-play-assembly`, `components/match-grid`,
`lib/match-grid`, `App.routeGuards`, `App.routing-contract`.

| | passed | failed |
|---|---|---|
| base `b2b1804a` | 3620 | 16 |
| branch | 3919 | 16 |

- **Identical failure set** (0 branch-only, 0 base-only): `QuestionStageGeometry` 4,
  `masterySliceModule.visualLanguage` 2, `App.routing-contract` 2,
  `AnswerGrid.elimination` 2, `DailyOnCanonicalArena.boundary` 2,
  `CanonicalArena.boundary` 1, `AdminPlatformPolicies` 1, `App.routeGuards` 1,
  `AdminQuizReview.proPlay` 1 — all INT0's documented baseline.
- 299 new tests, all passing. `QuizRankedMatch.rfx1b3` timing cases flaked once under a
  combined run and pass in isolation (documented load flake).
- `tsc -p tsconfig.app.json`: only the 2 pre-existing errors (`OnboardingProfile.tsx`,
  `identity/connections.ts`). ESLint on every changed file: 0 errors (warnings identical to
  base).

**Wire fixtures** regenerated from the integrated backend (never hand-edited):
`matchGridP2WireCapture.json` (stale 3000 → served 4500), `scrubServerCapture.json`,
`assembly{RosterLock,DraftMemory}ServerCapture.json` (window 4400; final-round
`presentation_ms` 5800). Field vocabulary identical; deals differ per run (match seeds are
not fixed), so two MG-P3 tests that pinned one specific deal now read those values from
the capture's own server bodies (with a precondition test pinning the one-wrong-trio
shape), and PA2B's media test asserts the exact resolved icon URL (`Bel'Veth` →
`Belveth/icon.png`; the old regex assumed folder == key). All 158 catalog champions resolve
to an icon.

## 13. Browser / HTTP evidence

**Stack (all local, scratch only).** The real `api_server:app` from the backend
integration worktree on `127.0.0.1:8091`, `LOL_CALC_DB_PATH` = a disposable scratch DB in
this session's scratchpad (its startup migrations, including MG-P1's rune convergence,
wrote only that file: 62 certified runes, one ledger row; `/api/meta/runes` → 62, no Phase
Rush). Auth = the backend's HS256 test path with a locally generated secret; the only
substitution is `routes._auth._owner_state` answering "owner" for one local test user.
Frontend integration vite on `:5391` with `VITE_E2E_AUTH=1` and a dummy Supabase URL.
Launchers/persona/oracle: session scratchpad `e2e/` (`run_backend.py`, `run_vite.cjs`,
`persona*.json`, `oracle.py`); `.claude/launch.json` entries `int1-be`, `int1-fe`,
`int1-fe-base` (ignored file). Browser: installed headless-shell 1228 via the uncommitted
`playwright.int1.local.config.ts`.

**Live HTTP probe** (real network, real bearers): non-owner → 403
`RANKED_PRESET_NOT_AUTHORIZED` for `admin.scrub`, `admin.match`, `admin.roster_lock`,
`admin.draft_memory`; owner + unknown `admin.assembly` → 422 `RANKED_UNKNOWN_PRESET`;
non-owner + `X-Admin-Key` on the admin module catalog → 403; owner module catalog →
`item_cost_duel, mastery_slice, quiz` only.

**New multi-mode spec `e2e/ranked-int1-multimode.spec.ts` — 28/28 passed (22.6 min), 28
distinct live admin matches.** Each case: `joinQueue` (the `PresetLaunch` call) → real
arena → three boards with real input (taps / keyboard digits / rail clicks) → final
correction → outro → end screen → `/history` and `/review` through the real readers; no
contract/parse errors in the console.
- *full* (1280×720, all four presets): round 1 CORRECT, round 2 TIMEOUT, round 3 WRONG;
  Review outcomes `correct, timeout, incorrect`; match listed in history.
- *quick* (three WRONG boards): Roster Lock, Match Grid and Scrub at 1600×900, 1280×720,
  1366×650, 1280×600, 390×844, 360×640, plus reduced motion at 1280×600 and 390×844;
  no horizontal page overflow; Review `incorrect ×3`; in history.

Final round, measured from the lock (ms; `done` = the module's reveal complete):

| | reveal → outro | done → outro | plate → outro | outro → end |
|---|---|---|---|---|
| Assembly (Roster Lock / Draft Memory), 7 normal cases | 4442–4483 | 2536–2574 | 2935–2977 | 1206–1229 |
| Assembly, reduced motion (2) | 4451–4466 | 4451–4466 | 4451–4466 | 1208–1213 |
| Match Grid, 7 normal cases | 4541–4577 | 3036–3073 | — | 1207–1219 |
| Match Grid, reduced motion (2) | 4544–4596 | same | — | 1209–1219 |
| Scrub (not server-paced), 7 normal cases | 1540–1586 | 25–80 | — | 1207–1214 |
| Scrub, reduced motion (2) | 1546–1554 | same | — | 1209–1218 |

Before the fix the same final Assembly correction was covered after 1503 ms (real
controller, captured round). Captures: scratchpad `e2e/shots/` (`<case>-r1-open`,
`-r3-revealed`, `-outro`, `-end` + a JSON timeline per case).

**Existing module specs on the integrated stack:**
- `pro-play-assembly-ranked` (PA2B, live): **24/24** — both families × six viewports ×
  normal/reduced; double-pressed Lock sends exactly one five-token POST; all five
  positions carry the server's mark.
- `ranked-scrub-continuity` (S2, replayed captures through the real host): **12/12** — six
  viewports × both motion modes; no structural region moves (the spec's ≤ budget), stage
  overflow 0, every reveal reaches `done`; 1280×600 still fits (the 1 px slack is
  unchanged: no shared arena CSS changed).
- `match-grid-arena-continuity` (MG-P3.1, live, `MG_REQUIRE_SETTLE=1`): **12/12** after one
  harness fix. All 12 first failed at setup: `/quiz/ranked` takes ~17–25 s to first render
  under the local E2E identity (dummy Supabase) — measured the same on clean main
  (`b2b1804a`: 25.3 s / 18.4 s) as on the branch (16.9 s / 18.4 s), while `/` renders in
  ~0.6 s — and the spec allowed 20 s for the board. Its start helper now waits up to 60 s
  for the arena to mount; every Match Grid assertion is unchanged. Ledger held ~3.0 s before
  the next board (e.g. 27 265 → 30 269 ms at 1600×900), as MG-P3.1 certified.

## 14. Known defects and unresolved owner decisions

**Release blockers (production):**
- **B2 / HARD — MG-P1 rune migration runs on every startup** against
  `$LOL_CALC_DB_PATH` (§8). Deploying this branch IS the production migration. Owner
  approval + a dry run on a production copy + a backup/rollback plan are required first
  (`docs/RANKED_INT1_RUNE_MIGRATION_APPROVAL_CHECKLIST.md`).
- **B3 — Assembly catalog freshness.** The artifact is the PA2A pilot certified from the
  2026-09-26 snapshot; deployed-data `--check` not run (§10).
- **B1 — owner authorization** of all three workstreams and of this integration.

**Owner decisions (not changed here):**
1. **Scrub final/any-round readability.** Scrub is not server-paced: its whole reveal is
   budgeted to `REVEAL_HOLD_MS` 1500, so in motion the proof reaches `done` only 25–80 ms
   before the next beat (live: the final round's outro, 1540–1586 ms after the reveal;
   reduced motion holds the settled proof ~1.55 s). This is S2's shipped behaviour, the
   same in every round, and it is preserved. If the owner wants the proof readable, the
   same adapter applies: `ScrubModule.settlement_hold_ms` + a preset window + one entry in
   `SERVER_PACED_REVEAL_MODULES`.
2. Scrub S2 open items: shell header verdict lands before the traverse; child refs;
   1 px slack at 1280×600 (§11).
3. **Format-config allow-list:** the owner-only format-config `PUT` accepts any registered
   module, so Scrub/Match/Assembly (like Reconstruct already) can be put into a public
   format by raw API (§9). Decide whether saves must be restricted to `BUILDER_MODULES`.
4. Match Grid on 360×640: the 4–5-tree ledger is taller than the screen, so the player
   scrolls to reach Lock (MG-P3.1 design, unchanged).
5. Exact-board holds are shorter (Match 3000, Assembly 3600); a final round always holds
   from the server's stored value, measured from client discovery, so it can run up to one
   poll interval longer than the server window (benign: nothing waits on it but the outro).
6. MG-P3 / PA2B limitations carried as-is: Assembly L2 (no child refs, no re-serving), L3
   (no team crest), L4 (unsent draft not persisted), L7 (admin page not driven under the
   E2E identity; launches use `PresetLaunch`'s exact call); MG no durable child refs.

**Environment notes (not defects):** the two-run regression baselines in §12; a 0-byte,
gitignored `lol_calc.db` was created in both new backend worktrees by test runs (removed
at the end); the preview launcher's `node` cannot load the SWC native binding, so the
`int1-fe` launch entry uses `cmd /c … node …` like the other working entries.

## 15. Final SHAs

Backend `ranked-int1/multi-mode-backend` (from `7e2cb3b7`):
`ce7a75d7` → `262132b4` → `2a0e17d0` → `9da40f07` → `1bc0bccb` → `1f16b06b` → the handoff
commit (branch tip; adds this file, the rune-migration checklist and the preserved INT0 plan).

Frontend `ranked-int1/multi-mode-frontend` (from `b2b1804a`):
`420a1350` → `35f20277` → `675d044a` → `310d810a` → the handoff commit (branch tip; adds the
multi-mode spec, the MG continuity harness wait, this file and the preserved INT0 plan).

Not committed, by design: `playwright.int1.local.config.ts`, `test-results/`, the
session-scratchpad launchers / scratch DB / persona / oracle / captures, the ignored
`.claude/launch.json` entries.

## 16. Exact recommended next step

1. Merge the new backend master (`bf4cffe4`, clean in a dry run) into the backend integration branch and re-run the §12 backend matrix against a matching fresh baseline.
2. Owner reviews this handoff and the two integration branches (tips in §15).
3. Owner works the rune-migration checklist: production backup → dry run of
   `python -m rune_canonical.cli --apply --db <copy>` → Combat Lab / quiz checks on the
   converged copy → written rollback → explicit approval.
4. Ops runs the Assembly recertification `--check` against READ-ONLY copies of the
   deployed `lol_calc.db` and identity DB (§10); if it differs, commit the new artifact,
   bump `ASSEMBLY_TEST_CATALOG_REVISION`, rerun the Assembly suites.
5. Owner decides the §14 items (Scrub hold, format-config allow-list, Scrub S2 items).
6. Only then: push both branches for review (no bare `git push` from the source branches,
   whose upstream is `origin/master`), backend before frontend at deploy time.
