# RECONSTRUCT R3B — Final-round presentation and match ending

**Status: implemented, verified locally, committed locally only.** Nothing was pushed, merged into
`main`/`master`, deployed or published. No production DB was touched. The MG-P1 rune migration never ran
(every server started in this work used `lifespan="off"` against a scratch DB).

**Result:** a Reconstruct round now keeps the completed recipe on screen about 2.5 s after its
correction finishes, in every round including the last. The match then ends
`Lock → correction → readable recipe → match outro → final results`. Before R3B, the final wrong
recipe was complete for only **36–50 ms** before the outro covered it. After R3B it is **2.52–2.56 s**
(reduced motion: **4.04–4.06 s**). The change reuses RANKED-INT1's server-paced settlement hold. It has
no new timing system and changes no grading, points, deadline, bot or replay behaviour.

---

## 1. Bases and commits

| | Backend (`League_Combat_Simulator`) | Frontend (`mogsy`) |
|---|---|---|
| Base (INT1 tip) | `ranked-int1/multi-mode-backend` `ea7645d9` | `ranked-int1/multi-mode-frontend` `9ff45c49` |
| R3B branch | `reconstruct/r3b-backend` | `reconstruct/r3b-frontend` |
| Worktree | `.worktrees/reconstruct-r3b-be` | `C:/Users/mlmit/mogzy-wt/reconstruct-r3b-fe` (node_modules junction) |
| Code commit | `f6b6c355` | `91c67a1f` |
| Final (this handoff + rig) | see `git log -1` on the branch | see `git log -1` on the branch |
| Clean baseline worktree | `.worktrees/reconstruct-r3b-be-base` (detached `ea7645d9`) | the INT1 worktree `mogzy-wt/ranked-int1-fe` (read-only use) |

The INT1 source worktrees are preserved and unmodified. The INT1 frontend worktree already had an
untracked `playwright.int1.local.config.ts` before this work, and it is still there.

**Backend master drift (not merged).** `origin/master` = `bf4cffe4`, 4 commits ahead of INT1
(`bb671f09`, `c815bc20`, `0e720996`, `bf4cffe4`: Worlds tournament authority PW4-A/A1/A2 and 42 Vision
Practice questions). Diff vs INT1: `live_esports/*`, `pro_authority/tournament_context.py`,
`routes/live_esports.py`, `quiz/*` (Vision), fixtures and tests. **None of it touches `ranked_*`,
`ranked_modules/*`, `ranked_formats/*` or pacing**, so R3B has no drift interaction. The local
`master` ref is stale at `d5c82cc7`. Frontend `origin/main` is still `b2b1804a` (INT1's base), so it
has no drift.

## 2. Files changed

**Backend `f6b6c355`:**
- `ranked_modules/reconstruct.py`: `REVEAL_CHOREOGRAPHY_MS` 1500, `EXACT_REVEAL_CHOREOGRAPHY_MS` 900,
  `EVIDENCE_READ_MS` 2500, `SETTLEMENT_REVEAL_WINDOW_MS` 4000, `EXACT_BOARD_HOLD_MS` 3400;
  `ReconstructModule.settlement_hold_ms` (same shape as Match/Assembly's).
- `ranked_formats/schema.py`: `reconstruct_test_format` (the `admin.reconstruct` preset) freezes
  `reveal_window_ms` = `SETTLEMENT_REVEAL_WINDOW_MS` (4000; was 3000). Nothing else in the preset changed.
- `test_reconstruct_r3b_settlement_hold.py` (new, 8 tests).
- Pins updated: `test_ranked_int1_settlement_hold.py` (hook holders now include reconstruct; the
  Scrub window pin is kept), `test_match_grid_module.py` (holders and the Reconstruct preset window),
  `test_reconstruct_flow.py` (frozen window 4000).

**Frontend `91c67a1f`:**
- `src/lib/ranked-core/orderForgeLockReveal.ts`: `SERVER_PACED_REVEAL_MODULES` += `RECONSTRUCT_MODULE_ID`.
  This is the only product-code line changed.
- `src/lib/ranked-public/__fixtures__/reconstructServerCapture.json`,
  `reconstructDrawResultCapture.json`: regenerated from the R3B backend (`RC_WIRE_CAPTURE_PATH` /
  `RC_RESULT_CAPTURE_PATH` on `test_reconstruct_wire_contract.py`), never hand-edited. The vocabulary
  is unchanged. Deals are fresh per run.
- `src/pages/quiz-ranked/useRankedMatch.revealHold.test.ts`: allow-list pin, plus 3 R3B tests.
- `src/pages/quiz-ranked/QuizRankedMatch.rfx1b3.test.tsx`: 2 real-controller lifecycle tests.

**Frontend, final commit:** this handoff and `e2e/r3b-real-backend/` (dev-only live rig; see its README).

**Not touched:** `src/components/interaction-grammar/Reconstruct.tsx` (the R3A-owned visual
primitive), `reconstructReveal.ts`, `reconstructModule.tsx`, `useRankedMatch.ts`, `pacing.ts` (FE and
BE), `CanonicalArena`, shared Arena layout and styles, the match-complete overlay, and the end screen.

## 3. The timing contract (server ↔ frontend)

**Reveal clock (frontend, verified against `reconstructReveal.ts` and live frames):**

| | marks | settle (wrong picks) | evidence | `done` |
|---|---|---|---|---|
| any wrong / timeout | 0–450 | 450–1050 | 1050–1500 | **1500** |
| fully correct | 0–450 | — | 450–900 | **900** |
| reduced motion | — | — | — | **0** (settled frame at t = 0) |

Live frames confirm it: wrong `evidence@1052–1074`, `done@1502–1521`; exact `evidence@453–464`,
`done@903–914` (ms after the reveal's first frame).

**Server (persisted at resolution, never recomputed):**
- `hold = ReconstructModule.settlement_hold_ms(window, reveal)`: the frozen window **4000** if any
  player's build was not exact (wrong or timeout), else **3400** (`min(window, 3400)`). With no
  window it is `None`, which keeps the generic beat.
- `presentation_ms = hold + MODULE_TITLE_MS (1400)`. Before the final round it is
  `hold + Final Round warning (3950)`. For the final round it is `hold + 1400`.
- The next round's `started_at = resolved_at + presentation_ms`. Each round's own deadline =
  `started_at + 30 s` (unchanged).
- Stored values, live: wrong/timeout **5400**, both exact **4800**, penultimate **7950** (wrong) /
  **7350** (both exact), final **5400 / 4800**.

**Frontend (existing INT1 code, unchanged; Reconstruct now opts in):**
- Ordinary round: hold = `max(1500, msUntilNextAnswerable − 1400)`, clipped by
  `anchoredRevealHoldMs` to the server boundary. It ends exactly where the server's title beat starts.
- Final round (no next `started_at`): hold = `presentation_ms − 1400`, counted from this client's
  discovery of the resolution. Then `MATCH_OUTRO_MS` (1200), then the end screen.
- Reconstruct's sizing: `4000 − 1500 = 3400 − 900 = 2500` ms of the completed recipe, by design.

**Why 2500 ms of reading and not more.** It is the brief's target, it is the same reading allowance INT1
gave Assembly's context plate, and the live measurements below show it lands at 2.43–2.56 s after
discovery latency. A wrong round now costs 2.5 s more than before (next board 5400 ms after
resolution, was 2900). An exact round costs 1.9 s more (4800, was 2900).

## 4. Before / after (live, real backend, real arena, bot matches)

"Readable" = from the reveal reaching `done` (recipe fully drawn) to the next board replacing it, or
to the match outro covering it. Each cell is the range over the runs listed in §7.

| Case | INT1 baseline | R3B |
|---|---|---|
| Ordinary round, own build wrong | swapped **before `done`** (swap at 1450 ms, evidence visible 396 ms) | **2443** |
| Ordinary round, both exact | 533–548 | **2431–2441** |
| Ordinary round, own exact, bot wrong (window 4000) | 533–548 | **3040–3058** |
| Penultimate round, wrong (Final Round warning follows) | 1137–1157 | **4311–4348** |
| Penultimate round, both exact (7350 stored) | 1750–1760 | **4340** |
| Penultimate round, own exact, bot wrong (7950 stored) | 1750–1760 | **4940** |
| **Final round, wrong → outro** | **36–50** | **2523–2559** |
| Final round, own exact (bot wrong) → outro | 644 | **3151** |
| Final round, reduced motion (settled at t = 0) → outro | 1547–1556 | **4037–4058** |
| Ordinary round, reduced motion | 1450–1456 | **3346–3349** (exact), **5846–5849** (penultimate) |
| Outro → end screen | 1207–1228 | 1207–1221 (unchanged) |
| Lock → reveal (inline bot settle) | ~70–170 | ~70–170 (unchanged) |

Server-side truth for every R3B run was read back after the match (`/result` plus each round's
resolved projection): `presentation_ms` exactly as in §3, every round's `final_deadline −
started_at` = 30 s, and the end screen's "You" score equals the sum of the server's persisted round
points in **16/16** completed runs.

## 5. Final-round lifecycle proof

**Live (R3B, 1440×900, wrong final; ms after the reveal's first frame):** `revealing` + hold @61 →
marks → settle @456 → evidence @1058 → **done @1506** → (no frame changes: the board is perfectly
still) → **match-outro @4059** → **end screen @5266**. The same order holds at every required viewport
and in reduced motion (§4). The outro never appears before `done`. There is no blank frame, and no
end screen under the outro.

**Real controller (vitest, `QuizRankedMatch` + the real hook):** with the *captured* final Reconstruct
round from the R3B backend (`presentation_ms` 5400), the phases are exactly
`answering → revealing → match-outro → end-screen`, the reveal holds ≥ 3850 ms (4000 − 150 tolerance),
and the outro holds ≥ `MATCH_OUTRO_MS − 100`. This holds in both motion modes. The Scrub and
presentation-less-backend cases from INT1 still keep the ordinary beat.

**Server:** `test_a_full_match_keeps_points_deadlines_and_stores_the_final_hold`:
correct → wrong → timeout. Each board's deadline is `started_at + 30 s`. Points are 2/0/0 base. The
penultimate round stores `4000 + 3950`. The final round stores `4000 + 1400` and `match_over`.

## 6. Layout, scroll and continuity (measured, not changed)

Sampled every animation frame and DOM commit through the final transition (`summary.json` keeps
the boxes at `done`, the last frame before the outro, the outro and the end screen).

- **Through the whole read window (`done` → outro), nothing moves:** parchment/board, header,
  rails, evidence and equation boxes are identical frame to frame. `scrollY` = 0, no ancestor scroll,
  and no layout shift. This holds at 1280×600, 1440×900, 390×844, 360×640 and in reduced motion.
- **Final-transition boxes (R3B, top/left/width/height):**
  - 1440×900: header `8,128,1184,78`, board `92,406.8,626.4,703.7`, rails `92,128 / 92,1045.2 ×266.8×703.7`,
    outro `8,128,1184,880`, end screen `8,128,1184,511.8`. Document 900 / 900.
  - 1280×600: board `92,…,403.7` (bottom 496), evidence bottom 457, outro `8,48,1184,580`. Document 600 / 600.
  - 390×844: board top 110.3, bottom 754, evidence bottom 683, outro `46,8,374,784`. Document 844 / 844.
  - 360×640: board top 110.3, bottom 646, evidence `324.8–613` (fully on screen), outro
    `46,8,344,675.6`. Document **728 / 640**.

**Pre-existing defects found (identical on the INT1 baseline; for R3A / the combined acceptance pass):**
1. **Header `min-h` dip (R3A's verified cause, desktop only).** In the final round the host header goes
   78 → 68 → 78 px for **~30 ms at lock-ack** (between the reveal's first frame and the hold starting).
   The board and rails jump 10 px up and back, and the Reconstruct regions move 5 px. It dips again at
   the outro, where the board shifts 10 px under the outro scrim. This is `CanonicalArena.tsx`
   `min-h-[4.25rem]` vs the 78 px timer face, as R3A §7 diagnosed. It does **not** occur during the read window.
2. **360×640: the match outro overflows the viewport.** The outro box runs to 722 px on a 640 px
   screen (82 px below the fold), and the arena document is 728 px tall during play. The recipe
   evidence itself fits. Phones ≥ 390×844 fit.
3. Not layout, but seen: the "Ranked Rules" first-visit popover sits over the right rail on desktop
   for the whole match under the E2E persona.

## 7. Tests executed

**Backend (`python -m pytest -q -p no:cacheprovider`; branch and base run sequentially, never in parallel):**
- Targeted R3B/hook/Reconstruct/MG suites: 170 passed.
- Regression: `test_ranked*`, `test_reconstruct*`, `test_assembly*`, `test_match_grid*`,
  `test_scrub*`, `test_order_forge*` (3612 collected):

  | | passed | failed | errors | skipped |
  |---|---|---|---|---|
  | base `ea7645d9` | 2863 | 260 | 5 | 476 |
  | R3B | 2871 | 260 | 5 | 476 |

  The failure/error sets are **identical** (276 = 276; 0 branch-only, 0 base-only). +8 passed = the new R3B
  tests. The shared failures are INT1's documented environmental baseline: fresh-DB shared-bank
  pools (`no such table: quiz_questions`), stale OWN1 admin harnesses (403), entitlement 503s, and
  `test_ranked_runtime_capsule_lifecycle` setup errors.

**Frontend vitest** (INT1's directory set, `--pool=forks`): **3924 passed / 16 failed**. The 16 are INT1's
documented baseline, the same 9 files with the same counts (`QuestionStageGeometry` 4,
`masterySliceModule.visualLanguage` 2, `App.routing-contract` 2, `AnswerGrid.elimination` 2,
`DailyOnCanonicalArena.boundary` 2, `CanonicalArena.boundary` 1, `AdminPlatformPolicies` 1,
`App.routeGuards` 1, `AdminQuizReview.proPlay` 1). INT1 recorded 3919 passed, and R3B adds 5 tests.
`useRankedMatch.revealHold` + `QuizRankedMatch.rfx1b3` in isolation: 56/56. ESLint on the changed
files: clean.

**Playwright (existing specs, R3B vite, installed headless shell 1228):**
`ranked-reconstruct-continuity`, `ranked-outro-axis`, `ranked-result-fit`: **50/50**.

**Live real-backend matrix** (`e2e/r3b-real-backend`; R3B = BE `f6b6c355` + FE `91c67a1f`; baseline =
INT1 tips). These ran on the same machine with the same rig. Required brief items:

| # | Requirement | Evidence |
|---|---|---|
| 1 | Normal three-round match | 4 viewports × `right,wrong,wrong`, plus `right,right,right` and `wrong,right,timeout`, all completed to the end screen |
| 2 | Correct and incorrect reveals | marks/settle/evidence/done timings in §3, both outcomes in every run |
| 3 | Duplicate Lock | Lock double-pressed every round: **exactly 1 POST** in every run on both stacks; module test pins |
| 4 | Minimum readable interval | §4: ≥ 2431 ms (motion), ≥ 3346 ms (reduced), every round |
| 5 | Server deadlines unchanged | every round `final_deadline − started_at = 30 s` (live readback); backend test |
| 6 | Final correction before outro | §5: `done` 1506 → outro 4059; never before `done` |
| 7 | Authoritative final score | end screen = server persisted points, 16/16 |
| 8 | Reduced motion readable | 1280×600 and 390×844: final settled frame held 4037–4058 ms |
| 9 | Reconnect | §8 |
| 10 | Regressions | backend and FE suites above, Playwright 50/50 |

Viewports: 1280×600, 1440×900, 390×844 and 360×640 (motion), plus 1280×600 and 390×844 (reduced). 11
R3B and 11 baseline matches, plus 2 timeout captures and 4 combined R3A+R3B matches (§10).

**Environmental failures, reported separately (not product):**
- Every run logs dummy-Supabase `ERR_UNSAFE_PORT` / CORS on `/api/assets/champions` and achievements
  (no Supabase, no CORS for a second origin). The page error `Cannot read properties of undefined
  (reading 'toLowerCase')` appears on the INT1 baseline at the same rate, so it predates R3B.
- The scratch DB is kept open by the backend after a reload lands on `/lol` (Windows file lock, so
  `--wipe` fails). Restarting the server clears it. This may be a connection that a non-Ranked route
  behind the home page doesn't close. It was not investigated (out of scope).
- **Smart App Control (§9)** blocked the toolchain mid-session. The workaround is documented there.

## 8. Timeouts and reconnect (findings, both pre-existing)

**Timeout: the recipe is not taught to the player who timed out.** Reconstruct's board reveal comes
only from `segment_state.own_challenge_reveals`, which the backend publishes for *answered*
challenges (`ReconstructModule`'s viewer reveal: `for idx in answered`). On a timeout, the board stays
`phase=open` with empty sockets and the tray. The host shows its generic verdict ("TIMED OUT ·
0 / 1 CORRECT · +0") during the hold, and then the next board or the outro follows. The INT1 baseline
behaves the same. R3B only lengthens the hold: the verdict stays **~3.9–4.0 s** (non-final 3935,
final 4009) instead of ~1.4–1.5 s, because the server window treats a timeout like a wrong build.
Correctness and points are unaffected (`unanswered` 1, 0 points, both stacks). See §12, decision 1.

**Reconnect (reload during the hold):**
- *Ordinary round:* the reloaded page resumes into the next round with no reveal replay. This is by
  design: `backfillDamageLog` never starts a reveal hold for history. Rounds 2–3 then play with the R3B
  holds (2551 ms final readable). The baseline behaves the same.
- *Final round:* the server completed the match inside the lock transaction, so after a reload
  `/quiz/ranked` finds no active match and lands on **`/lol`** (home), not on the end screen. The
  baseline behaves the same (1440×900 and 390×844 on both stacks). The authoritative result is
  persisted (`/result` 200, round 3 `match_over: true`, `presentation_ms` 5400). The INT1 controller
  tests ("a RECONNECT into a completed match" → stable end screen) cover the in-controller path
  (`QuizRankedMatch` with a match id). This is a page-entry routing matter, not R3B timing. See §12,
  decision 3.

## 9. Environment: Smart App Control and the rollup WASM workaround (owner-approved)

**Diagnosis (Code Integrity log, 2026-10-12 ~17:16 local).** Event 3077, Policy
`VerifiedAndReputableDesktop` (Smart App Control, `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`), blocked
`C:\Program Files\nodejs\node.exe` from loading
`C:\Users\mlmit\OneDrive\Desktop\mogsy\node_modules\@rollup\rollup-win32-x64-msvc\rollup.win32-x64-msvc.node`.
- Requested signing level 2 vs validated 1, status `0xc0e90002`. Event 3089: `TotalSignatureCount 0`,
  publisher/issuer `Unknown`. `Get-AuthenticodeSignature`: **NotSigned**. Event 3118: Defender
  called, no cloud call made, **no threat name**. SHA256 (flat) `CA11063D…E118DA`.
- The file is the `main` of `@rollup/rollup-win32-x64-msvc@4.64.3`, which is what the installed
  `rollup@4.64.3` loads. Upstream rollup native bindings are not Authenticode-signed. **Every**
  rollup copy on the machine was blocked alike (other worktrees and Temp copies), which points to a
  reputation/policy change, not one altered file. **Not judged suspicious.** The installed binary was
  not hashed against the registry tarball (that needed another download, not requested).
- Side observation: the shared `mogsy/node_modules` has rollup **4.64.3** / vite **5.4.21** /
  vitest **3.2.7**, while `package-lock.json` pins 4.24.0 / 5.4.19 / 3.2.4. The install has drifted
  from the lockfile since 2026-10-09. This was not changed.
- The normal toolchain cannot be restored without changing Smart App Control or reinstalling
  dependencies, and neither was done.

**Workaround (session-scoped, nothing persistent changed):**
1. `npm pack @rollup/wasm-node@4.64.3` from `https://registry.npmjs.org/` into the session
   scratchpad. Integrity `sha512-uL6ph679cYL+PJ9cqXq2saT/2/bIPUblxJ54NG/jiSxuKuMxPvbznOmBCDKN7mI1+W9VcrDXZF4XzOtANpKHpA==`
   matched `npm view … dist.integrity` and was recomputed independently with Node's `crypto`.
2. A 30-line `rollup-wasm-hook.cjs` (scratchpad) patches `Module._load` for exactly one request,
   `@rollup/rollup-win32-x64-msvc`, returning the WASM bindings with the native module's export shape
   (`parse`, `parseAsync`, `xxhashBase64Url/36/16`). All other resolution is untouched.
3. Loaded only per command via `NODE_OPTIONS=--require <scratch>/rollwasm/rollup-wasm-hook.cjs` (vitest,
   vite dev servers, eslint, Playwright). Smoke-tested first (`parseAst`, `xxhashBase16`, a 73-test
   vitest run), then the full matrix.
- **Unchanged:** shared `node_modules`, `package.json`/lockfiles, Windows security policy, and system
  configuration. SWC's native binding still loads from `C:\swc-native-cache` and was not blocked.
- **Remaining limitation:** until the owner restores rollup natively (or Smart App Control trusts it),
  every vite/vitest/Playwright run on this machine needs the hook. Without it they fail immediately with
  `ERR_DLOPEN_FAILED`.

## 10. Compatibility with R3A

R3A (`reconstruct/r3a-final-polish`, `329c9706`, code `a389c0b3`) changes the primitive
(`Reconstruct.tsx` + test), adds its rig and spec, and edits `playwright.arena.config.ts`. R3B changes
none of those files. R3A's handoff §9 proposed R3B options. This work took its stated "alternative with
no seam" (Reconstruct in `SERVER_PACED_REVEAL_MODULES` with a backend window), plus the backend half
§9.4(b) said was the only way to get 2.5 s in every round. It did **not** take §9.2's client-side
`revealReadMs` seam or the header change (§9.5; that is R3A's). R3A's note that "INT1's final hold
gives no extra time for Reconstruct" no longer applies: the backend now stores 5400.

**Combine trial (scratch worktree, removed afterwards):** `91c67a1f` + `git merge --no-ff 329c9706`.
- One conflict only: `playwright.arena.config.ts` (`testMatch`), which is INT1 vs R3A and predates R3B.
  Resolution = the union:
  `/(ranked-((arena|result)-fit|outro-axis|visual-continuity|statcheck-boundary|reconstruct-continuity|reconstruct-r3a|scrub-continuity)|match-grid-(arena-)?continuity|pro-play-assembly-continuity)\.spec\.ts/`
- vitest on the combined tree (interaction-grammar ×2, `reconstructModule`, hold and lifecycle tests,
  `lib/ranked-public`): **728/728**.
- Live, combined FE + R3B backend, 1440×900 / 1280×600 / 360×640 / 390×844-reduced: final wrong
  readable **2523–2547 ms**, ordinary exact 2440–2441, outro→end 1207–1217, end score = server. R3A's
  readable breakdown is held through the whole window (screenshot reviewed). No region moves during
  the read window.

## 11. Exact steps to combine R3A and R3B

Frontend (from a fresh branch at the R3B tip; R3A and R3B share base `b2b1804a` via INT1):
```bash
git switch -c reconstruct/r3-combined reconstruct/r3b-frontend
git merge --no-ff reconstruct/r3a-final-polish      # conflict: playwright.arena.config.ts only
# resolve testMatch to the union in §10, then:
git add playwright.arena.config.ts && git commit
```
Backend: only R3B has backend changes. Use `reconstruct/r3b-backend` (or merge it onto whatever
integrates INT1's backend; it touches only `ranked_modules/reconstruct.py`,
`ranked_formats/schema.py` and tests). Its only contact with INT1's code is the
`test_ranked_int1_settlement_hold.py` / `test_match_grid_module.py` pins it updates.

Then verify: backend `test_reconstruct*` + `test_ranked_int1_settlement_hold` + `test_match_grid_module`.
Frontend: vitest over the §7 set, plus `ranked-reconstruct-continuity` and the R3A spec. Do one
live `matrix.sh r3b … quick` against the combined FE. Order across the program: INT1 first (it carries
the rune-migration gate), then R3A+R3B on top. R3B must ship **both halves together**. Backend-only
gives a 5.4 s server gap while the client still holds 1.5 s, so the board sits locked and post-reveal
for ~2.5 s before the title. Frontend-only reads 2900 → the ordinary 1.5 s beat (no harm, no gain).

## 12. Remaining owner decisions

1. **Timeout teaching.** A player who times out never sees the recipe on the board, before or after
   R3B. R3B holds the TIMED OUT verdict ~4 s. Options: (a) accept; (b) publish the Reconstruct reveal
   for an *expired* challenge too (backend `own_challenge_reveals` + module), as JOURNEY5 does for
   expired children. That is a module-contract change for an R3C. (c) Make `settlement_hold_ms`
   return the generic beat when nobody locked. That is a one-line rule change, but a human opponent
   who *did* lock would then lose their reading time, so it is not recommended.
2. **Reading time value.** 2500 ms (wrong final 2.52–2.56 s live). If the owner still finds the end
   abrupt, the lever is `EVIDENCE_READ_MS` (backend only, ≤ `MAX_REVEAL_WINDOW_MS` 10 000). A manual
   "View Match Results" gate is **not** implemented and is not recommended yet. If one is wanted,
   R3A §9's option A-with-skip (a tap shortens the hold and never gates) is the safer next step.
3. **Reconnect after the final lock** lands on `/lol`, not the end screen (pre-existing, all modules).
   Routing a completed-just-now match to its end screen or `/history` is a Ranked-entry decision.
4. **Pace cost.** Each wrong/timeout round now adds 2.5 s and each exact round 1.9 s before the next board
   (a three-round match is ~6–7.5 s longer). This is admin-preset only today. A public format that
   includes Reconstruct must freeze its own `reveal_window_ms`. Any frozen window now also sizes the
   hold: a format saved with the old default 3000 would hold 3000. INT1's open item on the
   format-config allow-list still applies.
5. **Rollup / Smart App Control (§9)** and the `node_modules`-vs-lockfile drift on this machine.
6. Pre-existing layout items for R3A / combined acceptance (§6): the header dip at lock-ack and at
   the outro, and the 360×640 outro overflow.

## Reproduce

Live rig: `e2e/r3b-real-backend/README.md` (servers were started from the backend repo's ignored
`.claude/launch.json` entries `r3b-be`, `r3b-fe`, `r3b-base-be`, `r3b-base-fe`, all bound to scratch
paths). Raw outputs (frames, summaries, screenshots) live in this session's scratchpad (`out-r3b`,
`out-base`, `out-combined`, `out-timeout-*`). They are not committed.
