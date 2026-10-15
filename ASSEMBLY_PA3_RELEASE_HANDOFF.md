# Assembly PA3 — Roster Lock / Draft Memory as owner-only admin playtests

**Status: READY FOR COMMAND-CENTER INTEGRATION GATE — draft PRs only. Not merged, not deployed.**
Both families launch independently from Admin → Leaguecraft → Ranked → Playtests and play end to end as the owner, server-authoritative, unrated, against the bot. Bot / versus / speed balancing is explicitly deferred. Same file in both repos.

Date 2026-10-14. Fresh Claude Code instance.

## 1. Bases and sources (verified after `git fetch`)

| | SHA | Check |
|---|---|---|
| Backend base `origin/master` | `f12a7432d1e9a613e0eaee0c3e6e1151a395834e` | = prepared base; mainline had not moved |
| Frontend base `origin/main` | `7be45341e59bc047c69b95ff95e8c331a202c893` | = prepared base; mainline had not moved |
| PA2B backend | `5243081c52c13cc40170fb29ebf18dd440d468c5` | NOT an ancestor of master (merge-base `8829fc3c`, 43 master commits behind); merged, not rebased |
| PA2B frontend | `4e399a03d99fd8182040a17050bf951154783bb8` | NOT an ancestor of main (merge-base `b2b1804a`, 72 main commits behind); merged |
| RANKED-INT1 backend `1bc0bccb` | Assembly settlement hold only | ported by hand (3 files); INT1's merges were NOT taken (they carry Scrub and the MG-P1 rune migration) |

Read: PA0/PA1/PA2A/PA2B handoffs, `RANKED_INT1_INTEGRATION_HANDOFF.md` (`ea7645d9`) for the shared seams.

## 2. Commits

| Repo / branch | Commit | What |
|---|---|---|
| BE `assembly/pa3-admin-live` | `07c6a6b6` | merge PA2B `5243081c` onto `f12a7432` (conflict resolution only) |
| BE | `749cb4d8` | settlement hold, as-played team names, provenance gate tests |
| BE | (this handoff) | |
| FE `assembly/pa3-admin-live` | `0ae8561` | merge PA2B `4e399a03` onto `7be45341` (conflict resolution only) |
| FE | `c23bf4e` | server-paced Assembly hold, regenerated wire captures, E2E admin fix, live spec |
| FE | (this handoff) | |

## 3. What changed (and what did not)

**Backend** (on top of PA2B, which is unchanged in substance):
- Conflict resolution, all additive: `answer_safety` (Match Grid ∪ Assembly reveal-only keys), `registry`, `review`, `projections`, `service` (presets `admin.roster_lock` / `admin.draft_memory` in `PRESET_FORMATS` **and** `ADMIN_ONLY_PRESETS`), `readiness`, `ranked_formats/schema` (both validators, both factories), `schemas/ranked_public_schemas` (`PLACEMENT_MAX_SLOTS = 5` beside Match Grid's `assignments`; Reconstruct still refuses 5 at its module).
- `AssemblyModule.settlement_hold_ms` (INT1 `1bc0bccb`): wrong/timeout → frozen **4400 ms**, all exact → **3600 ms**; presets freeze `reveal_window_ms = 4400`. Uses the shared hook already on master (Match Grid, Reconstruct). Final round stores `hold + MODULE_TITLE_MS` = 5800.
- **As-played team names (new, provenance fix).** The catalog's canonical `team_key` carries a lineage's *current* name. Boards printed "ROX Tigers" for KOO Tigers at Worlds 2015, "Dplus Kia" for DAMWON Gaming (2020) / DWG KIA (2021), "Kiwoom DRX" for DRX (2022) — 34 Draft Memory boards plus the matching Roster Lock boards and opponents. `AssemblyCatalog.as_played_name()` now reads the name from the sealed, source-cross-checked Draft Memory provenance (`source_team_names`), only when every game of that match agrees on exactly one name. All 295 boards × both sides resolve. No catalog rebuild; pinned revision `99531ef6fe06a894` unchanged; `team_key` (identity) unchanged.
- Not touched: Match Grid (no rune migration; it still reads the committed snapshot), Reconstruct, Order Forge, builder catalog, Study Hall, matchmaking, ratings, bot accuracy/think time.

**Frontend** (on top of PA2B/PAV1, unchanged in substance):
- Conflict resolution, all additive (`contracts.ts` 17 hunks, `SegmentTranscript`, `QuestionReviewCard`, registry, media, icons, results model, admin page, App DEV routes, arena Playwright config).
- `SERVER_PACED_REVEAL_MODULES += assembly` → the client holds the in-board correction for the server's window, including the final board before the outro (existing `finalServerPacedHoldMs`).
- Wire captures regenerated from this backend (never hand-edited).
- `useOwnerAuth` DEV/E2E branch: one stable `ensureAuthorized`. The old per-render closure re-fired `AdminAuthProvider`'s effect forever (PA2B L7), so the owner admin page could not be driven in a browser. Dev-only code, statically removed from production bundles.
- Admin: launches live under **Leaguecraft → Ranked → Playtests**, panel "Pro Play Assembly", buttons `Play Roster Lock` / `Play Draft Memory` (each its own preset; convenience only — the server is the gate).

## 4. Historical content provenance (hard gate) — PASS with stated limits

Audited on the committed artifact `assembly_catalog/pa2a_worlds_finals_semifinals_2015.v1.json` (digest `99531ef6…54ee`, builder `pa2a.1`, rules `pa1.1`), pinned in `test_assembly_pa3_admin_live.py`:
- Scope: Worlds Finals + Semifinals, 2015 →. 33 Roster Lock sides served (33 refused: 13 missing role, 9 registry gap, 5 identity conflict, 5 substitution, 1 membership ineligible); 262 Draft Memory team-games (210 canonical, 52 source-recovered).
- Every board: five distinct identities in lane order top/jungle/mid/adc/support.
- Every Roster Lock starter (165): level A/B dated registry membership for *that* team and *that* role, dated on exactly the subject's game dates, inside the tenure.
- Every Draft Memory board: `canonical_pick_set`, `canonical_rows_vs_source`, `historical_source_picks` all `match`; source revision recorded.
- No label names two entities (412 players, 158 champions, case-insensitive); no subject served twice; no refused subject served; ambiguous handles carry their disambiguated label (e.g. "NL (Hsiung Wen-An)"); the known collisions (SKT Wolf, DK Ghost, T1 Faker registry gap) stay refused.

**Data limitations (truthful):**
- The real-corpus re-certification (`test_assembly_catalog_real_corpus.py`, 4 tests; `test_pro_authority_assembly_content.py` snapshot tests, 6) **could not run here**: `lol_calc.db` / `mogsy_esports_identity_full.db` are not available in this environment. Certification rests on the frozen artifact built by PA2A on 2026-09-26 (canonical max game date 2026-08-23) and the identity recovery of 2026-10-10. Before any non-admin exposure: `python scripts/build_assembly_catalog.py --check --db … --identity-db …`, review the manifest diff, commit a new artifact and bump the pinned revision.
- Worlds 2026 (in progress) is not in the catalog.
- Display copy: possessive is naive ("KOO Tigers's", "Top Esports's") — PAV1 copy, unchanged.
- No team crest (PA2B L3); Roster Lock thin pool (33 sides; T1/Faker era refused by design).

## 5. Tests (exact)

**Backend** (`python -m pytest -p no:cacheprovider`, Python 3.13):
- `test_assembly_pa3_admin_live.py` (new): **23 passed**.
- Assembly + pins: `test_assembly_flow`, `_wire_contract`, `_module`, `_catalog_artifact`, `_catalog_real_corpus` (skipped, §4), `test_pro_authority_assembly_content`, `test_reconstruct_module`, `test_ranked_modules_quiz_parity`, `test_jref2_…`, `test_match_grid_module`: all pass except `test_jref2…::test_an_ordinary_bot_match_is_unchanged` (**pre-existing**, fails on `f12a7432` too: no `quiz_questions` table in the test DB).
- **Regression**: 157 Ranked / Reconstruct / Match Grid / Order Forge / answer-safety / journey / mastery / segment / bot / pacing files on the branch and on a clean `f12a7432` worktree: **0 new failures.** (Note: a 0-byte `lol_calc.db` created in the checkout by a test makes six media/premise suites fail instead of skip on *either* side — identical 12 failed / 65 passed / 361 skipped once removed on both. Never committed.)

**Frontend** (vitest):
- `contracts.assembly.serverCapture` (40), `assemblyModule` (14), registry, `useRankedMatch.revealHold` (17, incl. new Assembly window/final-board pins): pass.
- Regression over `ranked-public`, `ranked-core`, `quiz-ranked`, `admin`, `ranked-arena`, `quiz/workspace`, interaction-grammar, `dev/pro-play-assembly`, App routing: **3,873 passed / 7 failed → 6 after the media-test fix; the 6 are identical on clean `main` 7be45341** (`CanonicalArena.boundary` ×1, `DailyOnCanonicalArena.boundary` ×2, `QuestionStageGeometry` ×2, `AdminQuizReview.proPlay` ×1).
- `tsc -p tsconfig.app.json`: only the 2 pre-existing errors (`OnboardingProfile.tsx`, `identity/connections.ts`). ESLint on changed files: 0 errors.

## 6. Live evidence (real HTTP, real browser)

Scratch stack (nothing committed, no production data): real `api_server:app` on `127.0.0.1:8078` over an empty scratch SQLite (Ranked migrations), lifespan off; HS256 test tokens (`SUPABASE_ALLOW_HS256`); the **only** substitution is `routes._auth._owner_state` answering "owner" for one generated UUID (the seam the HTTP tests replace). Frontend: vite with `VITE_E2E_AUTH=1`, Chromium 1194.

HTTP probe:
- non-owner → `admin.roster_lock` **403** / `admin.draft_memory` **403** (`RANKED_PRESET_NOT_AUTHORIZED`); `admin.assembly` → **422** `RANKED_UNKNOWN_PRESET`.
- owner match: pre-lock `/private` free of every reveal key (only the shared `topic.tier = null`); a non-participant reading or submitting → **403**; incomplete / duplicate / foreign / `{assignment}` / six tokens → **422** each; perfect lock **200** with own reveal; relock → **409**; forfeit **200**; review **200**.

Browser (`e2e/pro-play-assembly-pa3-live.spec.ts`, local config not committed) — **4/4 passed**: {Roster Lock, Draft Memory} × {desktop 1366×768, mobile 390×844 touch}. Each: owner opens Admin → Leaguecraft → Ranked → Playtests and presses the family's button → `/quiz/ranked`; every `/api/ranked` response before the first lock scanned for reveal-only keys (none); pre-lock board DOM has no marks/verdict; all cards and wells ≥ 44 px, no horizontal overflow; **board 1 perfect** (true lineup read by the harness from the backend DB, never the page) → server verdict right, 5 marks; **board 2 wrong** (Top/Jungle swapped) → wrong, 3 right / 2 wrong, correction visible ≥ 4.0 s before the next title; **board 3 untouched** → timeout, match result; review = `correct 5 / incorrect 3 / timeout 0`, all revealed. Screenshots show "Reconstruct KOO Tigers's starting lineup in the 2015 World Championship Semifinal." with the context plate and per-pick notes.

Not executed: a second live server with a missing/corrupt catalog (covered by `test_assembly_flow`); the 8-viewport PA2B matrix was not re-run (two viewports here).

## 7. Merge order and rollback

1. Command center gates the integration. **Backend first** (`assembly/pa3-admin-live` → `master`): the presets are owner-only and the frontend renderer is inert without the module.
2. Then frontend → `main`, then Lovable.
3. Re-run after any other mainline merge: `test_assembly_flow.py`, `test_assembly_wire_contract.py` (regenerate captures with `ASSEMBLY_WIRE_CAPTURE_DIR`), `test_assembly_pa3_admin_live.py`, answer-safety guard, frontend `contracts.assembly.serverCapture`.

Rollback (no migrations, no schema, no data writes beyond ordinary Ranked match rows for the owner):
- Fast: revert the merge commits (`git revert -m 1 <merge>` on master / main). Existing admin Assembly matches keep their frozen payloads; an unfinished one is settled by the lifecycle.
- Surgical: drop `PRESET_ROSTER_LOCK` / `PRESET_DRAFT_MEMORY` from `PRESET_FORMATS` → both presets 422, nothing else changes.
- Frontend alone can be reverted any time; a backend without the frontend only exposes owner-only presets nobody can press.

## 8. Open / deferred

- Bot, versus and speed balancing (explicitly deferred).
- Real-corpus re-certification (§4) before any non-admin exposure.
- PA2B L2 (no repeat-practice re-serve; needs `assembly.v2`), L3 (no crest), L4 (unsent draft not persisted across reload) remain as documented in PA2B.
