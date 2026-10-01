# JP3–JP5 Journey — integration onto main / master, and release certification

| | Frontend | Backend |
|---|---|---|
| Integration base (remote, fetched 2026-10-01) | `origin/main` **`f87240f8`** (OF3-F3) | `origin/master` **`9440d5e1`** (OF3-B4) |
| Integration branch | `jpint/journey-jp3-jp5-main` | `jpint/journey-jp4-jp5-master` |
| Worktree | `mogsy/.worktrees/jpint-frontend` | `League_Combat_Simulator/.worktrees/jpint-backend` |
| Integrated code tip | **`25dedf78`** (this handoff + screenshots: the docs commit after it) | **`ebb777b2`** |
| Baseline checkouts (detached, test-only) | `mogsy/.worktrees/jpint-fe-baseline` @ `f87240f8` | `League_Combat_Simulator/.worktrees/jpint-be-baseline` @ `9440d5e1` |
| Source branches | `jp5/journey-equation-unfold`: only the test-timeout commit `3cb209b1` added | `jp5/journey-structured-working` @ `a9a4be2e`: untouched |

**Nothing pushed, merged into `main`/`master`, or deployed.** Production DB, Railway, Lovable, Patch Ops, items and Order Forge untouched. **Stop for owner approval.**

## 1. What the git graph actually said (verified, not remembered)

* **Frontend.** Merge base of `jp5/journey-equation-unfold` with `origin/main` = `50f9ff88` (JP2, merged to main as `3d582908`). None of the 24 JP3–JP5 commits (`2f9c2827` … `0058eb1b`) is on main, not even patch-equivalent (`git cherry`). Main has 84 commits since, touching six JP files: `index.css`, `MasterySliceChallengeSurface.tsx`, `masterySliceModule.tsx`, `contracts.ts` (DD1, OF1-B, HUB6), `QuizRankedMatch.tsx`, `useRankedMatch.ts` (NAV1, OF3-F2). Main **does** carry DD1's `comparison_values.v1` reader (`features/mastery/contracts/comparisonValues.ts`, `MasteryChallengeReveal.comparisonValues`) and the DD1-F Journey boundary test.
* **Backend.** Merge base of `jp5/journey-structured-working` with `origin/master` = `1002230a` (DD1 production deploy). JP4 `fc95e81e`, JP5 `96fff403`, `a9a4be2e` are not on master. Master has 16 Order Forge commits since. **Master already serves `comparison_values.v1`** (DD1, `mastery/manifest_session/adapter.py`, frozen and disclosed per child by `ranked_modules/mastery_slice.py`). One of master's commits, `de956571` (of2), also re-encoded 1,178 files LF→CRLF with no content change.

## 2. Commits integrated

**Frontend** (`jpint/journey-jp3-jp5-main`, on `f87240f8`):

| Commit | |
|---|---|
| `3cb209b1` (on the JP5 branch, then merged) | test-only: the "Ahri's armor…" portrait-popup test gets its own 60 s ceiling (§3) |
| `752f3108` | **merge** of `jp5/journey-equation-unfold` @ `3cb209b1`: JP3 `2f9c2827` `3295c51c` · JP4 `9ed7938b` `bb2c60f4` · JP5 `628e85b9` … `0058eb1b` (rounds 1–9, code + docs) |
| `31734b53` | test-only: three `match(…) ?? []` fallbacks typed `string[]` (tsc on main's tree, §4) |
| `25dedf78` | the cooldown-comparison Reasoning Chain (§5) |

**Backend** (`jpint/journey-jp4-jp5-master`, on `9440d5e1`): `ebb777b2` = **merge** of `jp5/journey-structured-working` @ `a9a4be2e` (JP4 `fc95e81e`, JP5 `96fff403`, `a9a4be2e`). No other backend change.

Merges rather than cherry-picks, so every approved SHA is in the integrated history as it was approved (the JP2 precedent).

## 3. The flaky test (`3cb209b1`)

Reproduced before touching anything: in the full JP5 certification run (2,036 tests) the **only** failure was `masterySliceModule.portraitPopup` › "Ahri's armor…", a Vitest timeout after **29.7 s** under parallel load. Alone it passed (16.7 s on this loaded machine). It mounts the full Viewport twice and opens two Radix popovers in jsdom. The sibling Journey DOM suites already raise their file-level timeout to 25 s; this was the one heavy Journey DOM file still on the 5 s default. Fix: that test alone takes `60_000`. Global timeout and popup unchanged. On the integrated tree the full Journey/Ranked set passes with it (§6).

## 4. Conflicts and semantic resolutions

| Where | What | Resolution |
|---|---|---|
| FE `src/lib/ranked-public/contracts.ts` (4 hunks) | DD1 added `comparisonValues` to `MasteryChallengeReveal` and its reader; JP5 added the typed `working` at the same spots | **Union.** The reveal carries both; `combat_working` → `working`, `comparison_values` → `comparisonValues`; one `combatWorking` import gains `readJourneyWorking` beside DD1's import. Main's Order Forge `moduleId` reveal path auto-merged untouched. |
| FE `src/index.css` (end of file) | main appended HUB6 history-motion rules; JP3–JP5 appended the Journey block | **Union**, main's block first. No main rule names a Journey selector. 3-way check: no line either side kept is missing. Working copy kept LF (the line-ending-sensitive stylesheet test). |
| FE auto-merged, checked by hand | `MasterySliceChallengeSurface.tsx` / `masterySliceModule.tsx` (DD1's Data Duel adoption = the ordinary-child path; JP5 = the Journey path), `QuizRankedMatch.tsx` / `useRankedMatch.ts` (NAV1 exit guard, OF3 SFX vs the JP5 per-child poll), `CombatantPanel` / `MobileMatchBar` (JP3's Journey-only role change) | no overlap; DD1-F, NAV1, OF3 and RFX1 suites pass (§6) |
| FE type-check (not a textual conflict) | on main's tree tsc infers `s.match(re) ?? []` as `RegExpMatchArray \| []`, giving 4 `never` errors in the JP3/JP4 test files (clean on the JP5 branch; no type augmentation anywhere, so order-dependent inference) | `31734b53`: the empty fallback typed `string[]`; no assertion changed |
| BE 8 Journey test files | `de956571` re-encoded them LF→CRLF on master with **no content change** (verified with `--ignore-cr-at-eol`) | JP5's content, in master's CRLF encoding |
| BE `ranked_public/service.py` (auto-merged) | master: Order Forge import, admin preset, generation kwargs; JP5: per-child reveal windows | disjoint; Order Forge freezes a scalar `reveal_window_ms` (no `reveal_windows_ms`), which every JP5 reader treats exactly as before. Order Forge suites pass. |

## 5. Cooldown comparison (the deferred JP5 follow-up), `25dedf78`

**Verified, not assumed:**
* The backend already freezes and discloses `comparison_values.v1` for a **Journey** comparison child. It appears in the real JP5-backend captures (`jp5/pantheon.standard` child 1: Leona E 12 vs Pantheon E 22, `lesser`, delta 10; `jp5/voli.standard` child 4: Lee Sin R 110 vs Volibear R 160, delta 50), only on reveals.
* **Re-captured on the integrated backend `ebb777b2`** (same harness, canonical DB `mode=ro`): Zed/Ahri reference identical in every non-volatile field; Pantheon / Volibear identical except the bot opponent's per-run progress; both comparison blocks byte-identical.
* On the integrated frontend the block reaches the Journey reveal through DD1's own fail-closed reader (`reveal.comparisonValues`). **No backend work and no new contract were needed.**

**Built (Journey UI only, never the Data Duel):** in the existing Reasoning Chain (`comparisonReasoning`, `JourneyPair`),

```
Correct · Leona                                   E cooldown — Rank 1
              [12s · LEONA E]  <  [22s · PANTHEON E]
     LEONA    [==========          ] 12s | 10s shorter
     PANTHEON [====================] 22s
```

* the two displays verbatim; the relation from the served winner (`correct_answer`) and `operator`, then **checked** against the served values (a block that contradicts itself draws nothing). The winner's node is the answer's gold;
* paired bars: each value as a share of the larger (proportion only, the Data Duel's own rule), winner's row gold, carrying the served `delta_display`;
* cooldowns only (`unit: "seconds"`). Anything else, or a reveal without the block (a pre-DD1 backend), keeps the served explanation exactly as before;
* the served 1750 ms window, unchanged; it never unfolds. Right / wrong / timeout identical apart from the verdict.

Tests: `masterySliceModule.comparison.test.tsx` (11: both real Journeys, correct/wrong/timeout, nothing before settle, legacy and contradicting blocks, no Data Duel, the library's refusals, the stylesheet). One JP5 test that pinned the deferral ("keeps its prose until main's `comparison_values.v1` is integrated") now asserts the chain. DD1-F unchanged and green.

**Owner review:** the visual (screenshots `jpint-compare-*`). At 1750 ms the bars settle at ≈0.56 s, leaving ≈1.2 s settled. A longer comparison window would be a backend policy entry (`JOURNEY_WORKING_REVEAL_WINDOWS_MS` keys on a working's calculation; a comparison has none). **Not built**, owner decision.

**Haste Stage 2: not built** (still deferred, as instructed).

## 6. Certification

### Frontend

* **Full Vitest suite, integration `25dedf78` vs main `f87240f8`**, run in fresh processes per chunk (one process exhausts a worker's heap on this machine, main too; §8):

  | Chunk | main | integration |
  |---|---|---|
  | `src/pages/` | 4182 passed / 13 failed | 4180 / 15 (the +2: below) |
  | `src/lib/` (Journey, ranked-core, ranked-public, question-surface…) | 4152 / 13 | **4328 / 13** (+176 = the JP3–JP5 and comparison tests) |
  | `src/components/` (journey, ranked-arena, question-surface, interaction-grammar…) | 3206 / 30 | 3206 / 30 |
  | the rest (`features`, `graph1`, `hooks`, `test`, `video`, `App`, `scripts`, `supabase`) | 1507 / 27 | 1507 / 27 |
  | **total** | **13047 / 83** | **13221 / 85** |

  * **0 new failures from the integration, 0 baseline-only failures.** The 83 shared failures are all pre-existing on main and outside Journey (security/migration contracts, feedback/username contract mirrors, `quiz-screenshot` shell tests, `QuestionTimeline`, `FriendActionMenu`, Esports `ArchivePage`, champion-card-duel, `QuestionStageGeometry` / `DailyOnCanonicalArena.boundary` / `AnswerGrid.elimination`, two `App.routing-contract` routes…).
  * The +2 are **load flakes in main's own HUB6 suite** (`LobbyPreviewPage.premiumAnalytics` › Daily Overview L14, two 5 s timeouts). They passed in the first integration pass, pass **39/39 alone** on integration, and integration touches none of their files. Not changed (outside this scope).
  * Excluded on both: `src/test/security/pt2cProfileFrameAuthority.test.ts`, which **exhausts a 4 GB worker heap alone, on main** (pre-existing).
  * Vitest worker RPC timeouts (`onTaskUpdate`), printed as unhandled errors under load: main 2 / 3 / 0 (lib / pages / components), integration 5 / 3 / 1. Pre-existing class, reported, not counted as passes.
  * The first integration pass (on `9dd8f026`) caught 2 JP5 stylesheet tests that pin exact selector lists my comparison CSS had extended; `25dedf78` restores those rules verbatim and adds the comparison's rules separately (same declarations; sweep and screenshots are unaffected). JP5 + comparison suites then 69/69.
* **The "Ahri's armor…" test** passes inside the full `src/lib/` chunk with its own ceiling; the JP5 certification set had it as its only failure before `3cb209b1`.

* **tsc** (`-p tsconfig.app.json`): integration = main's baseline exactly. 6 errors, all pre-existing on `f87240f8` (the 2 known Supabase + 4 in NAV1's `practiceLeaveContract.test.ts`); 0 new.
* **ESLint** (`src`): integration 306 errors / 242 warnings vs main 306 / 235. **0 new errors**; the +7 warnings are `react-refresh/only-export-components` in Journey files that do not exist on main (the same warnings are on the approved JP5 branch).
* **Geometry sweep** (`sweep.cjs`, integrated build `9dd8f026` = `25dedf78` minus a selector regrouping, 9 captures × 375/390/768/1024/1280/1440/1920, every snapshot, each reveal also tapped compressed): **1,680 states, 0 violations, 0 page errors; all 63 viewport × capture region sets identical to the approved round-9 sweep.** The stage did not move.
* **Screenshots** (`shots-int.cjs`, 18): 0 violations, no document x-scroll, no page errors.
* **Ordinary Ranked** (`/dev/ranked-shell-probe`, main `f87240f8` vs integration, 23 states × 1280×800 / 390×844, animations frozen): **0 pixels over 24/255 in all 46 states**, including Order Forge, Meta Reflex and the ordinary Data Duel comparison.
* **Hosts:** Ranked Bot reference (`jp5-ref-*`), Daily Standard (Pantheon, Volibear), Daily Survival (Ahri, Volibear), JREF and M1 captures. Same board / reveal component everywhere, all in the sweep.
* **Approved states verified on the integrated build:** Zed/Ahri Step 2 raw composition (`(Bonus AD)`), Step 4 unfold (`19.4% Reduced`, `≈16.4 DMG`) / compress / reopen, Pantheon/Leona dependency reuse and Leona's Cloth Armor provenance popup, Ahri's popup, portrait `!` and hint, Volibear haste (`9.1% Reduced`, `≈1.1s shorter`), correct / wrong / timeout, reload mid-reveal and per-child windows (DOM suites), Round-8 geometry and Round-9 fill/blend (region sets + screenshots).

### Backend

* **Differential suite** (`run_be.sh`: 37 Journey / Daily / Survival / DD1 / ranked-mastery / segment-timer suites + all Order Forge, module-stats, quiz-parity and RR2 suites): **integration `ebb777b2`: 1846 passed / 67 failed; master baseline `9440d5e1`: 1796 passed / 67 failed, the identical 67** (0 new, 0 fixed). The +50 are JP4/JP5's tests (incl. `test_jp5_structured_working.py`: workings, per-child windows, pooled clock through long reveals, final hold for correct/wrong/timeout, bot offsets, reconnects).
* **Baseline-only failures (environmental, unchanged since JP4):** `test_jchain1_curriculum_contract` 31, `test_quiz1_segment_config` 18, `test_ranked_mastery_applied_chain` 11, `test_dcmod_c_content_sets` 3, `mastery/tests/test_mastery_per_question_reveal` 2 (key-set), `test_jfnd1_foundation_integration` 1, `test_journey_k1_knowledge_objects` 1 (canonical-DB drift pins / config).

## 7. Deployment compatibility (audited, not deployed)

Re-evaluated on the real contracts, by parsing every real capture with each build's own readers:

| Frontend ↓ / backend → | current production backend (`9440d5e1` line, DD1) | integrated backend (`ebb777b2`, JP4/JP5) |
|---|---|---|
| **current production frontend** (`f87240f8`) | today | **BREAKS.** `readPublicRound` throws on every Journey snapshot once a child's state carries JP4's keys: `state.sides.player carries a field J3 does not publish: "stat_mods"` / `"stat_sources"` (Zed/Ahri 23 of 24 snapshots, Volibear 29 of 35, Pantheon 16 of 35) |
| **integrated frontend** (`25dedf78`) | **works**: 0 parse errors on the production-master capture (`jref`, `fe942a58`), Motion (`m1`) and JP5 captures. Step 2 words-only, scalar windows, no armor provenance. **The comparison chain is live immediately** (DD1 is already in production) | works: everything |

**The historical rule still holds: frontend first → verify → backend second.**

**Recommended release sequence**
1. **R0 (rollback point):** record the live SHAs (frontend publish = `f87240f8`?, Railway web = `9440d5e1`?). *Not verified from here; confirm before step 2.*
2. Owner approves; land the frontend: fast-forward `main` to the integrated frontend tip (main has not moved since `f87240f8`; re-check, else re-merge) → push → Lovable publish.
3. **Verify on production with the old backend:** a Daily Journey (Pantheon or Volibear) plays end to end; the comparison chain shows; Step 2 words-only; ordinary Ranked, Order Forge, Daily, Survival unchanged.
4. **R1 (rollback point):** new frontend + old backend, a stable state.
5. Land the backend: fast-forward `master` to `ebb777b2` (re-check master has not moved) → push → Railway deploy.
6. **Verify:** typed workings (Step 2 composition bar, Step 4 unfold, haste), per-child reveal windows (6000 / 4000 / 1750), Leona's armor provenance, the reference Journey for an admin, Order Forge v2 admin preset.

**Rollback**
* Backend problem after step 5 → roll back the backend only (to R1). The new frontend reads the old backend.
* Frontend problem before step 5 → roll back the frontend (to R0).
* Frontend problem **after** step 5 → **roll back the backend first, then the frontend.** The old frontend cannot read the new backend.

## 8. Open for the owner / what blocks

* **Nothing blocks owner playtesting** of the integrated branches (local `/dev/journey-arena` on `jpint-vite`, or a deployed preview).
* Owner decisions: (1) approve the comparison chain visual; (2) optionally, a longer comparison reveal window (backend policy, not built); (3) the release (§7). Unchanged deferrals: Haste Stage 2; Step 3 Exact line; learner-held reopen.
* **Machine note:** the whole Vitest suite in one process dies here: `pt2cProfileFrameAuthority.test.ts` alone exhausts a 4 GB worker heap (main too). Certified in fresh processes per chunk (`vt-chunks.sh`, `vt-rest.sh` in the git-excluded scripts folder); see §6. Worth a separate fix on main.

## 9. Worktree hygiene

`git status --short` after the docs commit:

| Worktree | Branch @ tip | Status |
|---|---|---|
| `mogsy/.worktrees/jpint-frontend` | `jpint/journey-jp3-jp5-main` @ the docs commit after `25dedf78` | clean |
| `mogsy/.worktrees/jp5-equation-unfold` | `jp5/journey-equation-unfold` @ `3cb209b1` | clean |
| `mogsy/.worktrees/jpint-fe-baseline` | detached @ `f87240f8` | ` M src/index.css` (line endings only) |
| `League_Combat_Simulator/.worktrees/jpint-backend` | `jpint/journey-jp4-jp5-master` @ `ebb777b2` | clean |
| `League_Combat_Simulator/.worktrees/jp5-structured-working` | `jp5/journey-structured-working` @ `a9a4be2e` | clean |
| `League_Combat_Simulator/.worktrees/jpint-be-baseline` | detached @ `9440d5e1` | clean |

* Git-excluded tooling: `mogsy/.worktrees/jpint-frontend/.claude/jp5-scripts/` (the JP5 scripts plus `shots-int.cjs`, `ranked-diff-int.cjs`). Dev-server entries `jpint-vite` (8140) / `jpmain-vite` (8141) in the JP2 worktree's git-excluded `.claude/launch.json`.
* The two baseline checkouts are detached and test-only; safe to remove. `jpint-fe-baseline` shows `src/index.css` as stat-dirty only (its working copy normalised to LF for the stylesheet test; no content change).

## 10. Screenshots (`docs/handoffs/jp-integration/`, integrated build, live fonts, all board images loaded)

| File (`jpint-…`) | |
|---|---|
| `compare-pantheon-{375,390,768,1024,1280,1440,1920}` | **the comparison chain**, Pantheon Step 2 reveal, every certified width |
| `compare-voli-r-{390,1280}` | the comparison chain on Volibear Step 5 (R) |
| `compare-pantheon-live-390` | the same child before it settles: no values, no chain |
| `zed-ahri-step2-reveal-1280`, `zed-ahri-step4-reveal-{1280,390}`, `zed-ahri-step4-live-390` | the approved Reasoning Chain states, unchanged after integration |
| `ahri-popup-1280`, `leona-popup-390` | champion portrait popups (learned / modified-stat provenance) |
| `voli-haste-reveal-{1280,390}` | the approved haste reveal |
| `shots-int.json` | per-shot probe results |
