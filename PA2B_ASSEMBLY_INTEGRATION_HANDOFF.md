# PA2B — Pro Play Assembly: End-to-End Ranked Integration — Handoff

**Workstream:** PA2B (Roster Lock + Draft Memory into the existing Ranked host). Fresh instance, Claude Opus 5.5. Date: 2026-10-11/12.

**Verdict: READY FOR INDEPENDENT REVIEW AND OWNER AUTHORIZATION — not production-released.** Both families play end to end as an admin-only, unrated Ranked bot match inside the existing host (`QuizRankedMatch → CanonicalArena`), with server-generated frozen boards, authoritative grading and per-position correction, timeout, reconnect, result and review. Nothing is pushed, merged, deployed or published. One playtest-quality limitation is open (§11, L1: the in-match result beat is shorter than PAV1's reveal + context plate).

The same file is committed in both repos (backend `pa2b/assembly-ranked-integration`, frontend `pa2b/assembly-ranked-ui`).

---

## 1. Source worktrees and SHAs (verified 2026-10-11, after `git fetch`)

| | Worktree | Branch | SHA | State |
|---|---|---|---|---|
| PA1 backend | `.worktrees/pa1-assembly-content` | `pa1/assembly-content` | `586ed4c6` | clean, untouched |
| PA2A backend | `.worktrees/pa2a-assembly-module` | `pa2a/assembly-frozen-module` | `675f5402` | clean, untouched |
| PAV1 frontend | `C:/Users/mlmit/mogzy-wt/pav1-fable` | `pro-play-assembly/pav1-fable` | `16592c20` | clean except PAV1's own untracked `playwright.pav1.local.config.ts`; untouched |
| Backend `origin/master` | | | `8829fc3c942d1e81b7817187716c57da4459473a` | = the brief's reference |
| Frontend `origin/main` | | | `b2b1804afdd1eee1a328629033a6c074128a7e3d` | = the brief's reference |

Drift of the sources versus mainline:
- **PA2A vs `origin/master`:** merge-base `679173bf`; PA2A adds only new files (17 files, +6,888). Master is one commit ahead (`8829fc3c PW1-B`, live-esports upcoming filter), disjoint from PA2A.
- **PAV1 vs `origin/main`:** merge-base `b1f65a9c`; PAV1 adds 19 files (+3,966/−1, additive edits to `types.ts`, `App.tsx`, `Layout.tsx`, `Footer.tsx`, `playwright.arena.config.ts`). Main is 4 commits ahead (PW1 Worlds hub: `pro-play/worlds*`, `ProPlayHub*`), disjoint from PAV1.

## 2. Integration branches (local only)

| | Worktree | Branch | Ancestry | Work commit | Handoff commit |
|---|---|---|---|---|---|
| Backend | `.worktrees/pa2b-assembly-integration` | `pa2b/assembly-ranked-integration` | `675f5402` (PA2A) + merge of `origin/master` `8829fc3c` = `6d48772b` (clean merge) | see §15 | see §15 |
| Frontend | `C:/Users/mlmit/mogzy-wt/pa2b-ui` | `pa2b/assembly-ranked-ui` | `16592c20` (PAV1) + merge of `origin/main` `b2b1804a` = `8c6e1f38` (clean merge) | see §15 | see §15 |

The frontend worktree's `node_modules` is a **junction** to `C:/Users/mlmit/OneDrive/Desktop/mogsy/node_modules` — `rmdir` the junction before any `git worktree remove`.

## 3. Ownership and collision audit

No ownership collision: PA2B adds a new module id (`assembly`) and new presets, and edits shared chokepoints only additively. Nothing of another workstream was edited. Recorded so the merger knows what will touch the same lines:

| Branch (unmerged) | SHA | Ahead of mainline | Overlap with PA2B |
|---|---|---|---|
| Match Grid P2.1 BE `match-grid/p2.1-release-candidate` | `2464703c` | 6 | Same append points in `ranked_modules/registry.py`, `answer_safety.py` (adds `canonical`, `canonical_assignments`, `settled*`, `answers`, `entity_correct`, `correct_group`, `entity_facts`), `ranked_formats/schema.py` (validator chain + format factory region), `ranked_public/service.py` (presets, `ADMIN_ONLY_PRESETS`, `_generate_segment` injection, catalog helper), `readiness.py` (report keys, `assert_format_servable` tuple), `review.py` (module ids + dispatch), `projections.py` (`_PRESET_BY_FORMAT_ID`), `schemas/ranked_public_schemas.py` (adds `assignments` beside `placement`). Also `pacing.py` + `service._resolve` (`settlement_hold_ms` hook — see §11 L1). |
| Match Grid P3 FE `match-grid/p3-frontend` | `453aa333` | 3 | `modules/registry.ts`, `ranked-public/contracts.ts`, `client.ts` (`SegmentChoice` += `assignments`), `SegmentTranscript.tsx`. |
| Scrub S2 BE `scrub/s2-backend` | `e9e0e9a0` | 2 | Same backend append points as Match Grid (+ `checkpoint` in the wire schema). |
| Scrub S2 FE `scrub/s2-frontend` | `506ac30b` | 2 | `types.ts`, `registry.ts`, `contracts.ts`, `client.ts`, `SegmentTranscript.tsx`. |
| Role Challenge `rc-int/role-challenge-foundation-current`, DV6 `dv6-int/universal-exactness-current`, HOST1 `host1/hosted-role-context` | `04551661`, `60111309`, `4c163804` | 12 / 9 / 3 | `service.py` / `readiness.py` (role context, frozen segments) — different functions; low risk. |
| CE1 (`combat-estimate/ce1-fable`, `ce1-be-read`) | `7929f2dc` / `8829fc3c` | — | **None.** Not opened. |
| Reconstruct, Order Forge | on master | — | Pattern source only (read). |

Scrub and Match Grid are **not** merged (verified: their commits are not ancestors of `origin/master` / `origin/main`).

## 4. Architecture (as built)

```
assembly_catalog/*.json (PA2A frozen artifact, rev 99531ef6fe06a894)
  → ranked_assembly_catalog.load_assembly_catalog()   [digest-checked, cached by path/size/mtime]
  → service._assembly_catalog()  → _generate_segment(kwargs["assembly_catalog"])  (only for module_id == "assembly")
  → assembly.v1 (PA2A, unchanged) → frozen public/private payloads in ranked_rounds
  → segment_flow / submit_challenge / bot / resolve  (the existing Ranked host, unchanged)
  → public_view (allow-list) / challenge_reveals / segment_reveal / review._assembly_round
  → frontend contracts.ts (strict, exact-allow-list readers)
  → assemblyModule (ModuleRenderer) + assemblyAdapter (the ONE mapping)
  → PositionalAssembly (PAV1 primitive, unchanged) inside CanonicalArena
```

No second engine, grading layer, timer, rating, persistence model, transport or arena. PA1/PA2A authority code is unchanged (no defect found).

## 5. Backend changes (`pa2b/assembly-ranked-integration`)

| File | Change |
|---|---|
| `ranked_modules/registry.py` | `register(AssemblyModule())` → `("assembly", 1)`. |
| `answer_safety.py` | `FORBIDDEN_PRE_REVEAL_KEYS` += `assembly.REVEAL_ONLY_KEYS` (`canonical_lineup`, `position_correct`, `card_facts`, `historical_context`, `matched`). |
| `schemas/ranked_public_schemas.py` | **`PLACEMENT_MAX_SLOTS` 4 → 5.** Found during integration: the HTTP route capped `placement` at Reconstruct's 4 sockets, so every five-token Assembly lock was a 422 before reaching the module (a service-level test cannot see this). Reconstruct still refuses five at the module (`RANKED_INVALID_CHOICE`, still HTTP 422). |
| `ranked_formats/schema.py` | `_validate_assembly_config` (module `parse_config`, `challenge_count == 1`, explicit `pressure_seconds`, `timer_seconds >= ASSEMBLY_MIN_TIMER_SECONDS = 20`); `assembly_test_format(family)` + `roster_lock_test_format` / `draft_memory_test_format`: 3 × `assembly.v1`, 10-card tray (Roster Lock with bench tier), `timer_seconds=45`, `pressure_seconds=0`, `correct_points=2`, `speed_bonus_points=RANKED_V2_SPEED_BONUS`, `reveal_window_ms=3000`, **`catalog_revision="99531ef6fe06a894"` pinned**; `status="test"`, `rating_eligible=False`, `bot_eligible=True`. |
| `ranked_public/service.py` | Presets `admin.roster_lock`, `admin.draft_memory` in `PRESET_FORMATS` **and `ADMIN_ONLY_PRESETS`**; `_generate_segment` injects `assembly_catalog` only for `module_id == "assembly"`; `_assembly_catalog()` turns a missing/unreadable/tampered artifact into `RANKED_MODULE_DATA_UNAVAILABLE`. |
| `ranked_public/readiness.py` | `_assembly_readiness(fmt)`: loads the same artifact, `validate_catalog`, checks the pinned revision, and that each (family, size, bench) variant has ≥ one certified entry per segment; report key `assembly`; `assert_format_servable` now covers `assembly`. |
| `ranked_public/projections.py` | `_PRESET_BY_FORMAT_ID` maps both format ids to their presets (`session_preset`). |
| `ranked_public/review.py` | `_assembly_round`: public board (via the module's own `public_view`), the viewer's placement, and — only when the round is resolved — `canonical_lineup`, `card_facts`, `historical_context`, `position_correct`, `matched`, `outcome`, all through `AssemblyModule` (Review can never grade differently from settlement). |
| `test_assembly_flow.py` (new, 82 tests) | Service + HTTP flow, both families (§9). |
| `test_assembly_wire_contract.py` (new, 2 tests) | Real HTTP bodies for both families; writes the frontend fixtures with `ASSEMBLY_WIRE_CAPTURE_DIR`. |
| `test_reconstruct_module.py`, `test_ranked_modules_quiz_parity.py`, `test_jref2_admin_reference_journey_preset.py` | Pins updated for the new bound / module / presets (each change commented). |

**Not exposed:** not in `builder_catalog.BUILDER_MODULES`, not in any other format factory, not a Free Study Hall preset, not in matchmaking. `admin.` presets are already counted as test cohort by `services/ranked_module_stats.py`.

## 6. Timer decision

Ranked's semantics, verified in code and live: the admin bot acts **inline** on the human's requests and its lock is **stamped** with `AssemblyModule.bot_schedule` (8–16 s after `challenge_started_at`); that stamp is what timing, speed bonus and replay read. The block timer must therefore exceed 16 s or a slow bot draw would be a timeout. Seating five of ten by tap/key/drag is a recall-then-place task the size of a Match Grid board (45 s there). **45 s chosen**; the schema refuses an `assembly` segment under 20 s. A segment settles when both have locked or at the deadline; `pressure_seconds=0` (declared explicitly, as Order Forge/Reconstruct require).

## 7. Frontend changes (`pa2b/assembly-ranked-ui`)

| File | Change |
|---|---|
| `src/lib/ranked-public/contracts.ts` | `ASSEMBLY_MODULE_ID`, `ASSEMBLY_LANE_ORDER = ["top","jungle","mid","adc","support"]`, types (`AssemblyBlockView`, `AssemblyChallengeReveal`, `AssemblySettlement`, `ReviewAssembly`, …); strict readers for the live block (**exact allow-list**: any unknown key on the block, challenge, card, position or subject is a parse error), submitted-choice echo, own reveal, settlement and review (inverse guard: an unrevealed review round carrying the lineup throws); `_FORBIDDEN_SEGMENT_KEYS` += `canonical_lineup`, `card_facts`, `historical_context`, `matched`, `role_anchor`, `slot_anchor`, `registry_evidence`; `ReviewRound.kind` += `"assembly"` (**without this, a whole completed-match review failed to parse**). |
| `src/lib/ranked-core/modules/assemblyAdapter.ts` (new) | The one adapter (§8). |
| `src/lib/ranked-core/modules/assemblyModule.tsx` (new) | `ModuleRenderer` for `assembly.v1` (serves v1 only): mounts PAV1's `PositionalAssembly` unchanged; phase from the server (`open` / `locked` from the echo / `revealed` from the own reveal); one Lock per segment guarded by a synchronous ref + pending state (a slow server cannot receive a second Lock); a refused Lock reopens; `useStageRoom` measured on the always-mounted viewport root; opponent progress announced (sr-only) so PAV1's measured geometry is untouched. |
| `src/lib/ranked-core/modules/registry.ts` | `[ASSEMBLY_MODULE_ID]: [assemblyModule]`. |
| `src/lib/ranked-core/orderForgeLockReveal.ts` | `INLINE_LOCK_REVEAL_MODULES` += assembly (the bot-settled lock's inline reveal attaches to the presented segment, as Order Forge/Reconstruct). |
| `src/lib/ranked-core/centralStage.ts`, `SegmentTranscript.tsx`, `rankedResultsModel.ts`, `questionIcons.ts`, `ModuleSigil.tsx`, `questionTimelineParts.tsx`, `QuestionReviewCard.tsx` | Family names ("Roster Lock" / "Draft Memory"), settlement transcript (both boards + the true lineup + `n/5 in position`), review outcome from the backend's word, a module sigil, and an `AssemblyBody` review card (my board with the server's marks and the host's note under each wrong pick, the true lineup, the context plate). |
| `src/lib/ranked-core/media/roundMedia.ts` | Preloads lane emblems and Draft Memory champion icons. |
| `src/pages/admin/ranked/AssemblyLaunch.tsx` (new) + `AdminRankedPage.tsx` | "Pro Play Assembly" admin panel with Roster Lock / Draft Memory launch buttons (convenience only — the server is the gate). |
| `src/lib/ranked-public/__fixtures__/assembly{RosterLock,DraftMemory}ServerCapture.json` (new) | Real backend HTTP bodies (from `test_assembly_wire_contract.py`). Never hand-edit. |
| Tests | `contracts.assembly.serverCapture.test.tsx` (40), `assemblyModule.test.tsx` (14), `registry.test.ts` (pin + v2 fails closed). |
| `e2e/pro-play-assembly-ranked.spec.ts` (new) | Live-backend Playwright matrix (skipped unless `PA2B_E2E_PERSONA` is set). |

PAV1's primitive, its CSS, its lab (`/dev/pro-play-assembly`) and its capture are unchanged.

## 8. Contract adaptations (the adapter)

| PAV1 | `assembly.v1` wire | Adapter |
|---|---|---|
| Response `{assignment: {slot: token}}` | `{placement: [5 tokens]}` in lane order | `placementFromAssignment(assignment, dealt)` reads `ASSEMBLY_LANE_ORDER` — never labels, never insertion order; returns `null` (nothing sent) for an incomplete, duplicated or foreign board. `SegmentChoice` already had `{placement}` (Reconstruct), so no transport change; `_PositionalAssemblyIsNotSegmentChoiceYet` stays true (the primitive's own response is not sent). |
| `positions[].id/label/short/emblem` | `positions[].slot_id/label/short` | rename; emblem = `ROLE_EMBLEM_SRC[slot_id]`. The reader refuses positions not exactly in lane order. |
| `cards[].token/label/sublabel/media/monogram` | `token/entity_type/label/sublabel/media_key` | champion → `getChampionSquareIconUrl(media_key)`; player → `monogramFor(label)` seal (no portraits, PAV1 §4). |
| `subject {label, sublabel, media, monogram}` | `subject {team, opponent, event, team_key, …}` | `label = team`, `sublabel = "vs {opponent} · {event}"`, monogram. **No crest** (L3). |
| `prompt`, `eyebrow`, `cardKind`, `footnote` | `prompt`, `eyebrow`, `card_kind`, `catalog_revision` | rename; footnote = "Frozen Worlds catalog · rev 99531ef6". |
| Reveal `assignment/canonical/positionCorrect/isCorrect/verdictText/cardNotes/context` | own reveal `placement`, `canonical_lineup[]`, `position_correct{}`, `is_correct`, `matched`, `card_facts{}`, `historical_context{}` | Marks, canonical cards and verdict are the server's verbatim; `verdictText` = "Every position right — …" / "`matched` of 5 in position."; `cardNotes` = PAV1 `noteFor` wording over `card_facts` (tier, role anchor) for wrong positions only; `context` = PAV1 `contextFor` over `historical_context`. One deliberate wording fix: PAV1 printed "Best of N" with N = games played (a 3–1 series is not a Bo4); the host now says "N games · dates". A reveal naming a card this tray never dealt is not drawn (the module keeps its locked plate). |

Grep-pinned: the adapter/module import no lab capture and never compare a placed token with a canonical one.

## 9. Tests executed (exact)

**Backend** (`python -m pytest … -q -p no:cacheprovider`, Python 3.14, no xdist):

| Suite | Result |
|---|---|
| `test_assembly_flow.py` (new) | **82 passed** — both families: preset freezes an unrated single-family format; admin-only + in no other surface; pinned revision; three different entries per match; answer-free state + persisted payload (shared guard + private-only key walk + esports match id / catalog digest / player registry keys absent); reconnect before lock; lock echo + own reveal only (opponent sees nothing); reconnect after lock before settlement; swapped pair = two wrong positions; wrong identity = one; perfect board; 5 invalid shapes + 3 foreign fields refused and store nothing; idempotent retry / conflicting relock; bot stamp 8–16 s < timer; correct-and-first = 2+1; swapped = 0; timeout; reconnect after reveal; child records (`assembly:<family>`) + pure replay; resolved projection carries the correction; full match + review; unrevealed review withholds; readiness population; **missing / tampered / truncated / re-revisioned catalog refuses the match and stores nothing, while a Reconstruct admin match on the same DB still creates**; catalog lost mid-match fails closed (nothing half-written) and resumes when restored; `assembly.v2` → `RANKED_UNKNOWN_MODULE`; schema refuses bad segments (timer 12, 2 challenges, no pressure, unknown family, bench on draft, unknown config key); HTTP: non-admin (Premium, Free) 403 `RANKED_PRESET_NOT_AUTHORIZED` with nothing stored; unknown preset refused; snapshot answer-free + five-token lock 200; 6 bad bodies refused, nothing stored. |
| `test_assembly_wire_contract.py` (new) | **2 passed** (both families). |
| `test_assembly_module.py`, `test_assembly_catalog_artifact.py` (PA2A) | 127 passed (in the targeted run: 321 passed incl. flow/wire/guard/pins) |
| Updated pins: `test_reconstruct_module.py` 69 passed; `test_ranked_modules_quiz_parity.py`, `test_jref2_…` pass except `test_an_ordinary_bot_match_is_unchanged` (**pre-existing**, fails on the baseline too). |
| **Regression** — 108 Ranked/Reconstruct/Order Forge/answer-safety/journey/mastery suite files, run on the branch **and** on the pre-change baseline `6d48772b` (detached worktree `.worktrees/pa2b-baseline`) | Branch: 270 failed / 2,934 passed / 583 skipped / 5 errors. Baseline: 266 failed / 2,854 passed / 583 skipped / 5 errors. **Exactly 4 failures were new, all pins on what PA2B deliberately changed** (`test_reconstruct_module::test_wire_schema…`, `test_ranked_modules_quiz_parity::test_registered_modules…`, `test_jref2…::test_existing_presets_are_unchanged`, and `test_ranked_public_queue_crossprocess::test_cancel_racing_pairing_is_consistent` — a timing race that passed 3/3 in isolation). The three pins are updated. The 266 baseline failures are environmental (empty shared-bank pools, missing canonical item/champion tables in fixture DBs). |
| Not collected on master either | `test_ranked_builder_catalog.py`, `test_ranked_format_config.py` import `AUTH_METHOD_SUPABASE`, which `routes/_auth.py` no longer defines (pre-existing on `origin/master`). |

**Frontend** (vitest, `SWC_NATIVE_BINDING_CACHE=C:\swc-native-cache`):

| Suite | Result |
|---|---|
| `contracts.assembly.serverCapture.test.tsx` (new) | **40 passed** — both families against real server JSON: exact request bytes; retry/conflict; schema/incomplete/duplicate refusals → `RankedApiError`; routes to `assemblyModule`; block read exactly as served; reconnect identical; disclosure guard refuses 11 reveal/private keys on the challenge and 6 answer-shaped keys on a card, the subject and the block; 8 adversarial blocks refused (re-ordered/missing positions, duplicate or non-opaque token, 4 cards, wrong face, unknown family, two challenges); own reveal for an answerable challenge refused; locked echo; reveal keys only under `own_challenge_reveals`; inline lock reveal attaches once and never to another match; adapter maps reveal + notes + context; settlement (wrong/right/timeout); transcript; review (outcomes, tallies, inverse guard, card, timeout); media preload. |
| `assemblyModule.test.tsx` (new) | **14 passed** — real renderer + primitive from real snapshots: incomplete Lock sends nothing; a scrambled seating order is sent in lane order, **once, however often Lock is pressed** (pending promise); refused Lock reopens and retries; reload after lock (echo, no reveal) shows `locked`; reload after reveal shows `revealed`; adapter vocabulary = PAV1 `ASSEMBLY_SLOT_ORDER`; incomplete/duplicate/foreign → `null`; source contract. |
| `registry.test.ts` | 14 passed. |
| **Regression** — `ranked-public`, `ranked-core`, `interaction-grammar` (lib + components), `ranked-arena`, `quiz/workspace`, `pages/admin`, `pages/quiz-ranked`, `pages/dev/pro-play-assembly`, `App.routeGuards`, `App.routing-contract` (256 files) | 3,728 passed / 17 failed → after the registry pin update, the 16 remaining failures are **identical on the pre-change baseline** `8c6e1f38` (worktree `mogzy-wt/pa2b-ui-base`): `App.routeGuards` ×1, `App.routing-contract` ×2 (PAV1-documented), `AnswerGrid.elimination` ×2, `CanonicalArena.boundary` ×1, `DailyOnCanonicalArena.boundary` ×2, `QuestionStageGeometry` ×4, `masterySliceModule.visualLanguage` ×2, `AdminPlatformPolicies` ×1, `AdminQuizReview.proPlay` ×1. |
| `tsc -p tsconfig.app.json` | clean except the 2 pre-existing base errors (`OnboardingProfile.tsx`, `identity/connections.ts`). |
| ESLint (all new/changed files) | 0 errors; 2 `react-refresh/only-export-components` warnings (same pattern as every sibling module file). |

## 10. Real HTTP and browser end-to-end evidence

Setup (scratch only, nothing in either repo, no production data): the **real** `api_server:app` from the PA2B backend worktree on `127.0.0.1:8078` against an empty scratch SQLite DB (Ranked migrations + a `champions` name table seeded from the catalog's own champion keys, so `/api/assets/champions` answers). Auth is the backend's own HS256 test path (`SUPABASE_ALLOW_HS256` + a locally generated secret); the **only** substitution is the Supabase owner-state RPC (`routes._auth._owner_state`) answering "owner" for one local test user — the seam the backend's HTTP tests replace. Frontend: PA2B vite on `:5290` with the dev-only E2E identity seam (`VITE_E2E_AUTH=1`) and a dummy Supabase URL. Launcher/config: session scratchpad `e2e/run_backend.py`, `e2e/run_vite.cjs`; `launch.json` entries `pa2b-be`, `pa2b-fe` (ignored file).

**Live HTTP probe** (`e2e/http_probe.py`, real network, real bearer):
- Non-admin account → `admin.roster_lock` **403 `RANKED_PRESET_NOT_AUTHORIZED`**, `admin.draft_memory` **403**; unknown preset `admin.assembly` → **422 `RANKED_UNKNOWN_PRESET`**.
- Owner: one full match per family (`rkb_426b72ba…` Roster Lock — FPX 2019 Semifinal; `rkb_2773b768…` Draft Memory — BLG 2023 Semifinal G4): pre-lock bodies free of every reveal key; incomplete and duplicate placements **refused (RANKED_INVALID_CHOICE)**; `{assignment}` refused **422**; locks accepted with server reveal (`matched`, `position_correct`, true lineup); segment 3 left to its 45 s deadline → `placement: null, unanswered: 1`; `/result` 200; `/review` = 3 × `assembly` (incorrect / incorrect / timeout); the match is in `/history`.

**Real browser, real arena** (in-app browser, 800×600):
- **Roster Lock** `rkb_7df22bdf…`: the arena opened "Reconstruct Samsung Galaxy's starting lineup in the 2016 World Championship Final." (10 seals). Seated CuVee/Ambition/Crown/Ruler/CoreJJ by tap→tap → server **CORRECT +2** (bot also correct and faster → no bonus). Round 2 (C9 2018 Semifinal): board filled, **no marks pre-lock**; Lock → **INCORRECT +0**, gold seals on Mid/Bot/Support, Licorice and Svenskeren rose into their true positions, my swapped picks as named chips beneath. Round 3 timed out. Result: canonical screen "MATCH COMPLETE · UNRATED · DEFEAT 2–9 · Bot matches do not move the ladder". The live `/review` body parsed in the page through the real `getMatchReview` reader: `correct 5/5`, `incorrect 3/5`, `unanswered`, with the true lineups.
- **Draft Memory** `rkb_ffdae479…`: "Reconstruct Weibo Gaming's Game 1 composition in the 2023 World Championship Semifinal." with champion icon art served by the backend; **reload before Lock = reconnect: identical prompt and ten identical opaque tokens, server clock continuing**; round 1 **TIMED OUT +0**; round 2 (T1 2021 Semifinal G4) Lock → **INCORRECT +0**, the true Jayce / Jarvan IV / Ryze / Lucian / Lulu rose into the positions, my five picks as chips, "0 of 5 in position".
- Earlier attempt `rkb_0792c49a…` sat untouched during setup and was settled by the real lifecycle as a forfeit (result screen rendered) — a correct lifecycle outcome, noted for completeness.

**Playwright matrix** (`e2e/pro-play-assembly-ranked.spec.ts` via the untracked `playwright.pa2b.local.config.ts`, installed headless-shell 1228): both families × {1600×900, 1280×720, 1366×650, 1280×600, 390×844, 360×640} × {normal, reduced motion}, each a **new live admin match** through `joinQueue` → `/quiz/ranked` → real taps → Lock → server reveal → real forfeit. Per case it asserts: board opens at the server boundary; pre-lock primitive HTML carries no mark/verdict/answer vocabulary; every card, well and Lock ≥ 44×44; no horizontal page overflow; instrument inside the question stage; five cards seated; **a double-clicked Lock sends exactly one POST**, `{placement: [5]}`; `data-phase=revealed` with the server's mark on all 5 positions (recorded by a MutationObserver from the Lock, because the host advances after its result beat). **Result: 24 passed, 0 failed (9.3 min)** — 24 distinct live admin matches. A first run's reduced-motion cases failed on a test-side assumption (it counted ✓/✗ seals; PAV1 removes a wrong position's seal once the true card has risen in, and reduced motion starts settled) — the spec now counts per-position `data-mark`, which is PAV1's verdict carrier. Observed: under reduced motion the whole correction, including the context plate with the host's notes, is on screen at once (e.g. `draft_memory-360x640-reduced-3-revealed.png`). Captures: `C:/Users/mlmit/OneDrive/Desktop/pa2b-assembly-shots/` (`<family>-<WxH>[-reduced]-{1-open,2-filled,3-revealed}.png`).

Not executed live (covered at the service/HTTP-TestClient level instead): "locked, awaiting the opponent" against the bot cannot be held live (the bot settles inline on the lock POST) — covered by `test_reconnect_after_a_lock_before_settlement…` (bot not driven) and the module unit test; the missing/corrupt-catalog refusal was proven through the service and readiness (and a Reconstruct match created on the same DB), not against a second live server.

## 11. Known limitations (truthful)

- **L1 — In-match result beat is shorter than PAV1's reveal + context plate.** Measured live: Ranked holds the settled result `RESULT_HOLD_MS = 1500` ms (then the next module title/intro overlays the board; round 2→3 `presentation_ms = 5450` incl. the final-round intro). PAV1's reveal reaches its context plate at 1.5–1.9 s, so the marks, the true cards and the demoted chips are seen, but the notes/context plate is barely readable before the next round. `reveal_window_ms` does not extend this beat. The full correction (notes + context) is always available in Review. Remediation: Match Grid P2.1 adds exactly the needed hook (`settlement_hold_ms` on a module → `pacing.module_transition_ms(hold_ms=…)`); after it merges, give `AssemblyModule` `settlement_hold_ms ≈ 1900 + 3000–4000`. Not done here to avoid editing the same `pacing.py` / `service._resolve` lines Match Grid owns.
- **L2 — Repeat-practice re-serving is not supported.** `assembly.v1` declares no durable child ref (`declares_child_refs=False`, PA2A §12.6), so Review cannot re-serve a missed board as a new practice attempt; that needs `assembly.v2` (v1 must stay replay-stable). What *is* supported: (1) persisted frozen replay — `resolve_segment` reads only the frozen private payload (pure replay test); (2) completed-match history — `/api/ranked/history` lists it; (3) post-match correction review — `/review` serves board, marks, true lineup, card facts and context, re-graded through the module, withheld for an unresolved round.
- **L3 — No team crest in Ranked.** PAV1's lab crests came from its answer-bearing capture; no dated media authority rides the wire, so the subject shows a monogram. A future public `subject.mark` from `pro_authority.media.resolve_media(as_of=…)` would restore it.
- **L4 — Unsent draft is not persisted across a reload** (the server stores nothing before a lock; same as Reconstruct).
- **L5 — Catalog lost mid-match stalls the match** (the next board cannot be generated; nothing is half-written) until the artifact is restored or the lifecycle settles it. Same shape as Reconstruct losing its recipe graph.
- **L6 — Snapshot content.** The catalog was certified from the 2026-09-26 canonical snapshot and the 2026-10-10 identity recovery (PA2A §12.2). Before any launch, re-run `scripts/build_assembly_catalog.py --check` against deployed data, review the manifest diff and commit a new artifact (bumping the pinned revision).
- **L7 — The owner admin page itself was not driven in the browser.** Under the E2E identity with `admin:true` the dev `AdminAuthProvider` loops (pre-existing, MG-P3 notes); launches used the identical call `PresetLaunch` makes. The server-side gate is what was tested (403s above).
- **L8 — Leaguecraft History page** on the scratch DB shows "Failed to fetch" for its quiz-hub sources (`/api/quiz/progress|categories|achievements|sets` need quiz tables) — environmental; all Ranked review/history requests were 200 and parsed.
- Thin Roster Lock pool (33 sides; T1 Faker era and DK Ghost years refused by PA1) and champion-flex role tells are content properties (PA1 §9, PA2A §12).

## 12. Privacy / contract gates (verified)

Before reveal no public response, private snapshot or client-parsed payload carries the correct mapping, answer order, correctness flags, tiers, role anchors, entity keys, registry evidence, provenance, esports match id, catalog digest or the opponent's board (backend key walks + value scans; frontend exact allow-list + guard; live HTTP probe; Playwright DOM check). Tokens are per-round, index-derived (`pa_<10 hex>`), never entity-derived; card order is PA1's answer-blind order (PA2A χ² evidence). After reveal: server-certified per-position correction + historical context. The admin restriction is enforced server-side (`ADMIN_ONLY_PRESETS` at the queue route); the frontend button is a convenience.

## 13. Remaining collision risks

Textual (additive) conflicts are expected with Match Grid P2.1/P3 and Scrub S2 at the append points listed in §3; resolve by keeping both sides. Semantic checks after merging any of them: re-run `test_assembly_flow.py`, `test_assembly_wire_contract.py`, the answer-safety guard, and the frontend `contracts.assembly.serverCapture` test (Match Grid adds `canonical` to the backend forbidden keys — the assembly public payload carries no such key, so this is expected to pass); the wire schema's `SegmentChallengeIn` gets Match Grid's `assignments` and Scrub's `checkpoint` beside PA2B's widened `placement` (independent fields).

## 14. Merge-order recommendation

1. Land Match Grid P2.1 (BE) / P3 (FE) and Scrub S2 (BE/FE) in whatever order the owner approves them (they precede PA2B and are already release candidates).
2. Then rebase/merge PA2B **backend** onto that master, resolve the additive conflicts, regenerate the wire fixtures (`ASSEMBLY_WIRE_CAPTURE_DIR=… pytest test_assembly_wire_contract.py`) and copy them into the frontend.
3. Then PA2B **frontend** onto that main.
4. If Match Grid's `settlement_hold_ms` hook landed, add `AssemblyModule.settlement_hold_ms` (L1) as a small follow-up and re-run the matrix.
5. Before any non-admin exposure: L6 re-certification, owner playtest, and a decision on L2.
Backend before frontend: the frontend renderer is inert without the backend module, and the backend presets are admin-only.

## 15. Commits (local only — not pushed, merged, deployed or published)

| Repo / branch | Base | Work commit | Then |
|---|---|---|---|
| Backend `pa2b/assembly-ranked-integration` | `6d48772b` (PA2A `675f5402` + master `8829fc3c`) | `0f92424c` | this handoff (branch tip) |
| Frontend `pa2b/assembly-ranked-ui` | `8c6e1f38` (PAV1 `16592c20` + main `b2b1804a`) | `3bc75fa9` | this handoff (branch tip) |

Not committed, by design: `playwright.pa2b.local.config.ts` (throwaway local config), `test-results/`, the capture folder `C:/Users/mlmit/OneDrive/Desktop/pa2b-assembly-shots/`, the session-scratchpad launcher/DB/persona files, and the ignored `.claude/launch.json` entries `pa2b-be` / `pa2b-fe` (in `.worktrees/reconstruct-r1-be`). The source worktrees (PA1, PA2A, PAV1) were read only and are unchanged.

Reproduce the live run: start `pa2b-be` and `pa2b-fe` (launch.json), then from the frontend worktree with `PA2B_E2E_PERSONA=<persona.json>` run `npx playwright test -c playwright.pa2b.local.config.ts` (a persona is `{token, user:{id,email,is_anonymous}, admin:false}` with an HS256 token signed by the backend launcher's `secret.txt` for the owner id in `owner_uuid.txt`).
