# RECONSTRUCT R3C — Final integration and certification

**Verdict: READY FOR OWNER PLAYTEST.** R3A and R3B are integrated, the timeout reveal, the
final-result recovery and the four shared-arena defects (plus one found on the way) are fixed and
measured live, and every Playwright failure on the integration is classified with baseline evidence.
**This is not production approval:** INT1's Match Grid rune migration remains a hard deployment gate
(§11), and nothing here was pushed, merged into `main`/`master`, deployed, or run against a
production or shared database. No Docker. Every server this work started used `lifespan="off"`
against a disposable scratch DB in the session scratchpad.

---

## 1. Source branches and SHAs (verified 2026-10-12)

| | SHA | Notes |
|---|---|---|
| R3A frontend `reconstruct/r3a-final-polish` | `329c9706` (code `a389c0b3`) | worktree `mogzy-wt/reconstruct-r3a`, untouched |
| R3B frontend `reconstruct/r3b-frontend` | `c44b7052` (code `91c67a1f`) | worktree `mogzy-wt/reconstruct-r3b-fe`, untouched; its untracked `playwright.r3b.local.config.ts` is still there |
| R3B backend `reconstruct/r3b-backend` | `a69eacab` (code `f6b6c355`) | worktree `.worktrees/reconstruct-r3b-be`, untouched |
| INT1 frontend / backend | `9ff45c49` / `ea7645d9` | ancestors of the R3B tips; untouched |
| `origin/main` (frontend) at start | `8c9c1f73` | as the brief stated |
| `origin/master` (backend) at start | `bf4cffe4` | as the brief stated |

Ancestry: R3A and R3B share `b2b1804a` (INT1's base); R3B sits on INT1. No mainline drift was merged.

## 2. Final integration branches (local only)

| | Branch / worktree | Tip | Baseline worktree |
|---|---|---|---|
| Frontend | `reconstruct/r3c-frontend` / `C:/Users/mlmit/mogzy-wt/reconstruct-r3c-fe` (node_modules junction) | see `git log -1` (this handoff) | `mogzy-wt/reconstruct-r3c-fe-base`, detached `33dbcfaa` (= R3A+R3B, no R3C change) |
| Backend | `reconstruct/r3c-backend` / `.worktrees/reconstruct-r3c-be` | `a9a6a361` | `.worktrees/reconstruct-r3c-be-base`, detached `a69eacab` |

Frontend commits on top of `c44b7052`:
1. `33dbcfaa` merge R3A (`329c9706`).
2. `8f9abb2d` timeout reveal. 3. `67e8b977` completed-match recovery.
4. `e439e7b0` timed-out progress line. 5. `fd470651` shared-arena fixes + `e2e/ranked-arena-r3c.spec.ts`; `9643f947` crest-guard fix.
6. `b2aee6f8` live rig (`e2e/r3c-real-backend/`, dev only). 7. this handoff.

Backend: `a9a6a361` adds `test_reconstruct_r3c_timeout_reveal.py` only. **No backend product code changed.**

Both frontend worktrees hold a `node_modules` junction: `rmdir` it before any `git worktree remove`.
Untracked by design: `playwright.r3c.local.config.ts` (R3C) and `playwright.r3cbase.local.config.ts` (baseline).

## 3. Merge resolution

`git merge --no-ff reconstruct/r3a-final-polish` onto the R3B tip: one conflict,
`playwright.arena.config.ts` `testMatch` (INT1's Scrub/Match Grid/Assembly specs vs R3A's
`reconstruct-r3a`). Inspected and resolved as the union. R3C later adds `arena-r3c` to the same pattern.
Combined focused vitest before any R3C change: **728/728** (the R3B handoff's set).

## 4. Timeout reveal — contract and answer safety

**Cause.** The board reveals from the viewer's own `own_challenge_reveals`, which the server publishes
only for an ANSWERED challenge. A timed-out player had no reveal: an empty board under a generic
TIMED OUT stamp for the whole ~4 s hold (R3B §8).

**Investigation → smallest change: none on the wire.** After settlement the resolved round
(`GET /rounds/{n}/resolved`, refused before settlement, participant-only) already carries
`segment_reveal.canonical_parts`, `target`, `pieces` and each player's own server verdict
(`placement: null`, `unanswered: 1`, `segment_result: "timeout"`). A backend `own_challenge_reveals`
extension would never be seen live (the deadline resolves the segment and the active segment moves on),
so it was not added.

**Frontend (`8f9abb2d`, `e439e7b0`).**
* `src/lib/ranked-core/reconstructTimeoutReveal.ts` — `withSettledTimeoutReveal(state, {settlement,
  roundNumber}, viewerUserId)` attaches a reveal to the presented segment only when: it is Reconstruct,
  the settlement is for THIS segment, the server settled THIS viewer as timed out with no locked
  placement, and no served reveal exists (a served reveal always wins). It reads only the viewer's entry.
* `ReconstructChallengeReveal.timedOut` / `ReconstructReveal.timedOut` (host-built, never on the wire).
* Primitive: sockets stay empty at marks, the canonical parts settle in tagged **Answer** (state
  `answer`), no ✓/✗ marks, no "your pick", no "n/m placed" notes, breakdown + equation, verdict
  **TIMED OUT** (timer glyph, #9b1c1c on the folio), live region "Timed out. The build is: …". Same
  ≤1.5 s clock, so R3B's 4000 ms hold still leaves 2.5 s of reading; reduced motion settles at t=0.
* Progress line reads "Time ran out before you locked in." (was the false "Both players have locked in.").

**Safety evidence.**
* Backend HTTP (`test_reconstruct_r3c_timeout_reveal.py`, 2 tests): before the deadline no public or
  private body carries any reveal-only key and `own_challenge_reveals == []`, and the resolved round is
  refused; after it, the recipe whose copies fill the board, `placement None`, marks empty,
  `(correct, incorrect, unanswered) = (0,0,1)`, 0 points; a non-participant gets 403/404; the opponent is
  scored on its own build; `presentation_ms` 5400; Review records `timeout` with the recipe revealed.
* Real controller (`QuizRankedMatch.reconstructTimeout.test.tsx`, captured backend bodies): no secret
  figure on screen before the resolved round is served; then the answer, TIMED OUT, no marks/picks/notes,
  the opponent's wrong part (`p4`) never on the board, hold ≥ 3850 ms, outro, end. Fails on the baseline
  (no reveal at all), passes on R3C. Plus helper (9), module (4) and primitive (5) tests.
* Live: 12 matches with a timeout (rounds 1, 2 and the final), 6 viewports, both motion modes and both
  themes: every timed-out board `data-timed-out=true`, all marks null, 0 picks, breakdown shown, no
  generic stamp, verdict "Timed out"; server points 0 for that round.

## 5. Completed-match recovery (`67e8b977`)

**Cause.** The final round completes the match in the lock transaction; `/active-match` (rightly)
never returns a finished match, so a reload without router state (the discovery path) landed on the
lobby (`/quiz` → `/lol`). With lobby router state the reload already worked.

**Fix (frontend only, existing APIs, no persistence).** `src/pages/quiz-ranked/presentedMatchHint.ts`:
a per-tab `sessionStorage` hint `{viewer, matchId, at}` written when the route mounts a match.
`QuizRankedPage` consults it ONLY when discovery finds no active match, and mounts it ONLY after
`GET /matches/{id}/result` answers (participant-only 403; terminal-only 409). The arena then enters it as
`recovered` → straight to the end screen (`sawMatchLiveRef` false: no reveal, no outro replay).
Retired on any 4xx refusal, another account's or stale (> 30 min) hint, an end-screen action, or
leaving a finished match; a reload runs no cleanup, so it survives exactly that. An active match from
discovery always wins. Match ids remain hints, never authorization.

Evidence: 12 route tests (served/403/409/404/network, foreign/stale hint, active-wins, lifetime) + 5
unit; live reloads at the final **hold** (1440×900, 360×640), **outro** (1440×900, 390×844) and **end
screen** (1280×600, 360×640): 6/6 land on the end screen, the reveal and the outro never replay, URL
stays `/quiz/ranked`. Baseline at 1440×900/hold: lands on `/quiz`. An ordinary-round reload (round 1)
resumes the match as before.

## 6. Shared arena — before/after (`fd470651`)

All measured live on the real backend (`layout.mjs`) and pinned by `e2e/ranked-arena-r3c.spec.ts`
(R3C **16/16**; the R3A+R3B baseline fails **11/16** — exactly the defect cases — and passes the 5
that do not exercise a defect: dark theme, phones whose shell fits).

| Defect | Root cause | Fix | Before → after (live) |
|---|---|---|---|
| A. Header moves | the centre's transition note (final lock-ack, outro) was a bare line; the strip fell to `min-h` | the note draws `CentralStage`'s own box (`CENTRAL_STAGE_BOX`) | 78↔68 px (90↔68 at 1600), board/rails jump 10/22 px → **78..78 / 90..90, 0 changes** at every desktop viewport |
| B. Light-theme rail ink | navy surfaces with theme ink (slate-900) | `:root:not(.dark)` token island on `.ranked-banner`, `.ranked-header-plate`, `.ranked-matchbar` (dark token set + `color`) | painted-pixel min **1.00–1.04:1 → 4.74:1** desktop, **17.8:1** phone; dark unchanged (4.74) |
| C. 1280×600 overflow | 192 px of banner rod/point + 132 px mascot slot in a 408 px column | short-desktop tier (≥1024 wide, <720 tall): mascot 52→34 % of the column, row gap and top air; every row kept, crest box itself untouched | grid overflow **60 → 0** px |
| D. 360×640 outro | beat layer covered the grown shell | phone beat layer pinned to the shell's VISIBLE box (`useBeatLayerViewportBox`) | outro bottom **721.6 → 640** of 640 (82 → 0 px below fold); result 216–255, score 290–339 unchanged |
| E. (found) phone end-screen zoom-out | end-screen frame kept the 4 px glow bleed | same repair as the phone-arena frames | layout viewport **394 → 390** (360: 364 → 360) |

Live final-transition boxes (R3C): 1440×900 header 78, grid `[92,128,1184,703.7]`, outro
`[8,128,1184,880]`; 1280×600 grid `[92,48,1184,403.7]` overflow 0, outro bottom 588/600; 390×844
outro bottom 830/844; 360×640 outro `[46,8,344,594]` bottom 640/640. `scrollY` 0 throughout every run.
The 360×640 arena itself still page-scrolls 88 px during play (by design since RMOB2; the Reconstruct
board needs it) — the outro no longer follows it below the fold.

## 7. Final-round pacing (live, R3C, ms; `done` → outro = readable completed recipe)

| Case | done | outro | readable | outro → end |
|---|---|---|---|---|
| wrong final, 1600/1440/1280×720/1280×600/390/360 | 1501–1509 | 4039–4056 | **2535–2551** | 1209–1216 |
| timed-out final (light), 1440×900 / 390×844 | 1506–1514 | 4005–4009 | **2496–2499** | 1210–1217 |
| wrong final, +250 ms latency | 1512 | 4839 | 3327 | 1214 |
| reduced motion, correct final (bot wrong → 4000 hold) | 0 | 4055–4076 | 4055–4076 | 1213–1223 |
| reduced motion, both exact (3400 hold) | 0 | 3450 | 3450 | 1213–1217 |

Ordinary rounds: correct 2442–2469 (3042 when the bot was wrong), wrong 2433–2458, timeout→next
3896–4350, penultimate 4323–5858. Identical to R3B's contract; Lock → reveal → recipe → outro → end
in every run; no View Results button.

## 8. Tests and browser evidence

Rollup ran through the session-only **WASM hook** for every vite/vitest/eslint/Playwright run below
(Smart App Control still blocks the native binding): R3B's `@rollup/wasm-node@4.64.3` tarball, sha512
`uL6ph679…pKHpA==` re-verified against `npm view` and recomputed locally; `NODE_OPTIONS=--require
<scratch>/rollwasm/rollup-wasm-hook.cjs`. Shared `node_modules`, lockfiles and Windows settings untouched.
Python/pytest did not need it.

* **Combined R3A/R3B focused vitest:** 728/728 before changes; 757/757 with the timeout tests.
* **Route/recovery:** QuizRankedPage 59/59 (all 7 files), hint 5/5. **Layout units:** 23/23.
* **Backend focused** (`test_reconstruct_*`, `test_ranked_int1_settlement_hold`,
  `test_match_grid_module`, `test_answer_safety_guard`, `test_duel_transport_projection`,
  `test_ranked_match_review_api`, `test_ranked_public_history`, `test_ranked_review_historical_records`):
  **R3C 314 passed / baseline 312 passed**, 0 failed (+2 = the new contract tests). Not rerun: R3B's
  3612-test regression matrix — backend product code is byte-identical to R3B `a69eacab`.
* **Broad frontend vitest (INT1's directory set):** see §8a.
* **Playwright arena suite on R3C** (684 tests, 3.3 h): 629 passed, 43 failed, 12 skipped. Classified:
  * `match-grid-continuity` (13), `pro-play-assembly-continuity` (26): the dev labs render (verified in the
    browser) but after the specs' 5 s wait under the dummy-Supabase identity — **identical on the
    baseline** (targeted rerun) → environment/harness, not R3C.
  * `match-grid-arena-continuity` (12 skipped): needs a live Match Grid backend; INT1's 12/12 stands.
  * `ranked-arena-fit` RMOB2 compact HUD (global HUD 44 ≠ 40): **identical on the baseline** → pre-existing.
  * `ranked-outro-axis` 390×844: R3C's intended contract change (phone layer = visible shell); spec
    updated (phones: layer = shell ∩ viewport; desktop: layer = shell, unchanged; non-collapse kept) →
    4/4 pass.
  * `ranked-visual-continuity` 375×812 / 1280×800 (5-min timeouts under suite load): pass in isolation
    (3.9 min each) → load timing.
  * Everything else passed, including `ranked-reconstruct-continuity`, `ranked-reconstruct-r3a`,
    `ranked-scrub-continuity`, `ranked-statcheck-boundary`, `ranked-result-fit`, `ranked-arena-fit`.
* **Live real HTTP/browser certification** (`e2e/r3c-real-backend/cert.sh`, 20 matches, real
  `api_server:app`, scratch DB): 1600×900, 1440×900, 1280×720, 1280×600, 390×844, 360×640 (normal);
  1440×900, 1280×600, 390×844, 360×640 (reduced); 1440×900 and 390×844 (light); +250 ms latency; reloads
  (§5). End-screen "You" score = sum of the server's persisted round points **20/20**; double-pressed
  Lock sent exactly **1 POST** every round; recipes of **2 and 3 sockets** were dealt (no 4-socket deal
  came up in these 20 — 4-socket and duplicate-part reveals are covered by the `fourSlot`/`witsEnd`
  fixtures in the primitive/module/probe tests and by R3A's live 4-socket "Dusk and Dawn" run).
* Console: only the known dummy-Supabase `ERR_UNSAFE_PORT`/CORS noise.

### 8a. Broad frontend vitest

INT1's directory set, `--pool=forks`, R3C then the R3A+R3B baseline, sequentially:

| | passed | failed |
|---|---|---|
| baseline `33dbcfaa` | 3935 | 17 |
| R3C | 3983 | 16 |

* **R3C-only failures: 2, both resolved.** (1) `CombatantPanel.banner` "no longer draws … a sigil":
  the short-desktop tier's `[data-testid="role-crest"]` padding rule tripped the banner's
  no-crest-styling guard. The rule is removed (`9643f947`); the fit still holds
  (probe and one live 1280×600 match: overflow 0, header 78..78). The guard was honoured, not edited.
  (2) `QuizRankedMatch.rfx1b3` "gives a BOT fresh match the id…": passes in isolation (69/69 with the
  banner and layout files), INT1's documented combined-run timing flake.
* **Baseline-only: 3** (`rm1Feedback` timed-out module, `masterySliceModule.visualLanguage` ×2) —
  load/timing flakes on the baseline run.
* The other 14–15 shared failures are INT1's documented baseline (`QuestionStageGeometry`,
  `App.routing-contract`, `AnswerGrid.elimination`, `*.boundary`, admin harnesses).
* +48 tests on R3C = the new R3C tests. `tsc -p tsconfig.app.json`: only the 2 pre-existing errors.
  ESLint on every changed file: 0 errors.

## 9. Cross-mode regression

The shared changes touch every Ranked mode (header, rails, short-desktop banner, phone beat layer,
end-screen frame). Evidence: the arena suite above drives Quiz (all fit states), Meta Reflex, Stat
Check, Order Forge, Reconstruct and Scrub through the production arena — all passing; Match Grid and
Assembly lab specs fail identically on the baseline (environment) and their live arena spec needs a
Match Grid backend (not run; INT1 12/12 stands). `ranked-arena-r3c` B measured the rails/header/match
bar on the Reconstruct board at 3 viewports × 2 themes; the fix is mode-independent CSS on the
banner/plate, so it applies to every mode. No mode-specific layout fork was added.

## 10. Remaining limitations

1. No human-vs-human match (bot only; the bot settles inline).
2. Match Grid / Assembly were not played live in R3C (scratch rig has no MG rune / Assembly catalog
   data; lifespan off). Their arena surfaces share the fixed CSS; INT1's live evidence predates R3C's
   CSS changes.
3. The timeout reveal appears after the client *discovers* settlement (next poll) — same timing as any
   result; on a slow network the TIMED OUT board appears a beat after the clock hits 0.
4. The completed-match hint is per tab: a reload in the same tab is covered; opening the finished match
   in a NEW tab without router state still goes to the lobby (History shows it).
5. 360×640 still page-scrolls 88 px during play (RMOB2 by design).
6. The first-visit Ranked Rules panel covers the right rail on desktop until dismissed (R3B §6, unchanged).
7. Environment: Smart App Control/rollup (WASM hook); lab specs' 5 s first-render wait; RMOB2 HUD
   44 ≠ 40 on mainline-era code.

## 11. Mainline drift and release blockers

* **Frontend `origin/main` moved** `8c9c1f73 → 20a252ec` (PW4-B / PW4-B1 Worlds tournament pages,
  44 files, none Ranked/arena). Dry-run `merge-tree` with the R3C tip: **clean**. Not merged.
* **Backend `origin/master` moved** `bf4cffe4 → f708ae39` (question-pool classification, champion
  affinity, `seed_core_runes.py` rewrite, Patch Ops guard; 14 files, none Ranked/Reconstruct).
  Dry-run merge: **clean**. Not merged. The `seed_core_runes.py` change must be reviewed together with
  INT1's rune migration.
* **Blockers (unchanged from INT1/R3B):** B2 HARD — MG-P1 rune migration runs in the lifespan against
  `LOL_CALC_DB_PATH` (owner checklist `docs/RANKED_INT1_RUNE_MIGRATION_APPROVAL_CHECKLIST.md`); B3
  Assembly catalog freshness; owner authorization of INT1/R3A/R3B/R3C; R3B's both-halves rule (backend
  4000/3400 hold and frontend server pacing ship together).

## 12. Owner-playtest procedure

Uses only local servers and a scratch DB.

1. Rollup (if Smart App Control still blocks it): use the WASM hook per `RECONSTRUCT_R3B_HANDOFF.md` §9.
2. Scratch DB + backend (R3C):
   `RC_BACKEND_WORKTREE=<…>/.worktrees/reconstruct-r3c-be RC_RIG_DATA=<scratch>/rig-r3c python e2e/r3c-real-backend/rig/setup_db.py`
   then the same env + `RC_BACKEND_PORT=8187 python e2e/r3c-real-backend/rig/serve.py`
   (`lifespan="off"`; the rig refuses any DB outside `RC_RIG_DATA`).
3. Frontend: in `mogzy-wt/reconstruct-r3c-fe`,
   `VITE_COMBAT_API_URL=http://127.0.0.1:8187 VITE_E2E_AUTH=1 VITE_SUPABASE_URL=http://127.0.0.1:1 VITE_SUPABASE_PUBLISHABLE_KEY=dummy node node_modules/vite/bin/vite.js --port 8151 --strictPort`.
4. Persona: `python e2e/r3c-real-backend/rig/mint_token.py --json` → in the browser console on
   `http://localhost:8151`: `localStorage.setItem("mogsy_e2e_identity", '<json>')` (keep `admin:false`).
5. Match: `python e2e/r3c-real-backend/rig/create_match.py` (an `admin.reconstruct` bot match), then
   open `http://localhost:8151/quiz/ranked` (first render takes several seconds).
6. Try, over a few matches: a correct build, a wrong build, **let one round time out** (expect the recipe
   tagged Answer + TIMED OUT, no marks), a duplicate part (a 2× recipe), tap/drag/keyboard, double-press
   Lock; on the **final** round reload during the reveal, during the outro and on the end screen (expect
   the end screen, no replay); both app themes (OS light/dark); 1280×600 and a phone size.
7. One active match per account: finish or wait out a match before creating the next.
8. Stop the servers; delete `<scratch>/rig-r3c`.

## 13. Recommended final integration / release steps

1. Owner playtest (§12) and review of this handoff; decide the open items in §10.
2. Owner works INT1's rune-migration checklist (including mainline's new `seed_core_runes.py`).
3. Merge mainline into the integration branches (backend `f708ae39`, frontend `20a252ec`; both dry runs
   clean), rerun the §8 focused suites and `ranked-arena-r3c` against fresh baselines.
4. Land in order INT1 → R3A+R3B+R3C (this branch carries all three), backend before frontend, both halves
   of R3B's hold together.
5. Only then push for review; no bare `git push` from source branches whose upstream is `origin/master`.
