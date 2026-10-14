# Scrub / Chronoscope S3 — Frontend (admin-only live integration)

**Status: READY FOR COMMAND-CENTER REVIEW. Draft PR only. Not merged, not published to Lovable.** Deploy **after** the backend twin
(`mitcherrman/League_Combat_Simulator` · `scrub/s3-admin-live`): a frontend without the backend cannot reach a `scrub` segment, and a
backend without this frontend is inert.

| | |
|---|---|
| Repo / branch | `mitcherrman/mogsy` · `scrub/s3-admin-live` (base `main` = `7be45341`, unchanged at hand-off time) |
| Code SHAs | `30f8d270` (integration) · `0c25f7ee` (objective-fit fix + rig) · `1b6a3523` (server-paced pin) · `18b46f67` (input gate) · this note and the evidence follow |
| Source candidate | S2 `506ac30b` (feature commit `bc50ca8b`, parent `a59526b2`, local-only, verified present). `SCRUB_S2_HANDOFF.md` is carried as the historical design record. |
| Backend twin | base `f12a7432`; code SHAs `322d2528`, `fc024b2d`; its `SCRUB_S3_RELEASE_HANDOFF.md` has the wire contract, fail-closed proof and rollback |

## Scope
Only the Chronoscope as module `scrub.v1`, reachable only through **Admin → Leaguecraft → Ranked → Playtests → Chronoscope → Play
Chronoscope** (`admin.scrub`, three unrated rounds against the bot). **Not in:** the old INT1 rune migration or Assembly, the S1 dev
harness (`/dev/scrub-chronoscope`), S1's answer-bearing prototype capture, any bot/versus/speed-scoring change, any public format. No
`package.json`, lockfile or migration change.

## Reconciliation with the newer mainline (additive; nothing overwritten)
S2 predates Match Grid and Reconstruct R3. Fifteen shared files conflicted (contracts, client, module registry + test, central stage,
transcript, review card, sigil, icons, timeline, results model, admin Playtests panel + test, `playwright.arena.config.ts`,
`orderForgeLockReveal.ts`); each keeps the live `match`/`reconstruct` entries and adds `scrub`. The submit union is now
`placement | assignments | checkpoint`. **Shared server-paced reveal:** Scrub is added to `INLINE_LOCK_REVEAL_MODULES` and to
`SERVER_PACED_REVEAL_MODULES`, so the arena holds the reveal until the server's boundary (the backend's frozen 4000 ms window, 3400 ms when
exact). `SCRUB_REVEAL_BUDGET_MS` is now the primitive's own `CHRONOSCOPE_BUDGET_MS` (1500), no longer tied to the generic `REVEAL_HOLD_MS`.

## A defect found and fixed here (not in S2's evidence)
At the **normal tier** the objective block was a fixed 44 px, but eyebrow + two prompt lines needs 56.5 px, so any objective that wrapped was
clipped mid-glyph and the target level was hidden. S2 only played the three short "first wave … reaches Level N" objectives. Measured with
true line counts over all nine authority objectives × eleven viewports: 17 of 99 cases clipped (the two "first **cannon** wave …"
objectives at 1280×720, 1366×768, 1440×799, 640×900; every objective at 1024×768). Fix: normal-tier objective 44 → **58 px**, lens 216 → **202 px**
(module height unchanged at 492; other tiers untouched). `e2e/ranked-scrub-objective-fit.spec.ts` (nine objectives × ten viewports)
was **red on 4 viewports before the fix and is green after**. Screenshots `00-BEFORE…` / `01-AFTER…`.
**Residual, owner call:** the compact tier at a ~480 px module (a ≥1024 px window under 720 px tall, e.g. 1024×650) still wraps the two
cannon objectives; that tier has 1 px spare, so nothing was borrowed.

## A second defect found and fixed here: a fake Lock through the timeout hold
Found by running a **timeout** plan on the real stack. A timed-out lock never receives an own reveal, so through the arena's ~5.4 s result hold the
instrument stayed `open`, with an **enabled Lock**, under the "TIMED OUT · 0 / 1 CORRECT" stamp. The shell already closes input there
(`permissions.canSelectAnswer = false`) and refuses the submit, but the module ignored `permissions`, so a click flipped the instrument into a
"locked · reading…" state that nothing had been sent for. `scrubModule` now reads `permissions.canSelectAnswer`: with input closed and no lock
from the viewer the instrument is inert (like the pre-open lead-in), carries `data-input-closed`, and refuses the lock
(`scrubModule.input.test.tsx`, red on the pre-fix module). Screenshot `11-timeout-hold-input-closed`. Match Grid's module also ignores `permissions`
(whether it shows the same symptom was not tested); it is not touched here.

## Strict reader and server authority
`contracts.ts` parses `scrub.v1` blocks, own reveals, settlements and review rows strictly and refuses an unrevealed round that carries a
checkpoint or any reveal-only key (`canonical_checkpoint`, `satisfied_checkpoints`, `proof`, `traverse_path`, `threshold_xp`,
`granularity_caveat`, `breakpoint_note`) — including inside a checkpoint. The verdict is the server's `is_correct`; the adapter never
compares tokens (pinned by a source test). The Lock body is exactly `{"checkpoint": "<token>"}`: verified on the wire in every live run.

## Real-backend browser smoke (bot-inline) — `e2e/scrub-real-backend/`
The real arena against the real `api_server:app` (scratch DB built only by the existing migration, `lifespan="off"`, only the owner RPC
replaced), real network between them, **12 full matches / 36 segments** (1600×900, 1366×768, 1280×720, 1366×650, 1280×600, 390×844 and 360×640; the
last two with real CDP touch; reduced motion at 1280×720 and 390×844; exact, wrong and timeout locks; keyboard and mouse scrub):
* every UI verdict equals the server's resolved round; every Lock POST body is exactly `{"checkpoint":…}`; **0** reveal-only keys in
  **259** pre-lock `segment_state` bodies; canonical marker hidden, no proof/verdict/passed detent before Lock;
* reveal stages `clamp → traverse (wrong lock only) → settle → proof → done` complete in ≈1.0–1.8 s and are **held until the server's
  boundary** (Lock → next open ≈ 4.0 s, matching the frozen 4000 ms; both hold branches, 3400 and 4000, were observed live);
  reduced motion renders the finished frame in ≈0.1–0.16 s;
* **0.00 px** max frame-to-frame movement and 0.00 px spread for all eleven regions in every run, no horizontal overflow;
* resume: reloading during the hold lands on the next segment, answer-free, with **0** extra Lock POSTs; the server review lists three
  `scrub` rounds with canonical + proof; history lists the match;
* accessibility: axe-core 4.10.2 on the open instrument — **0 violations, 21 rules passed**; the rail is a `role="slider"` with
  `aria-valuenow/valuetext`, arrows/Home/PageUp/PageDown, a live region, and the reveal respects `prefers-reduced-motion`.
Server-side admin gate over real HTTP: anonymous 401, authenticated non-owner 403 `RANKED_PRESET_NOT_AUTHORIZED`, owner 200.
Console noise in the rig (~80 `ERR_UNSAFE_PORT`, dummy realtime socket, 503 on `/api/assets/*`) is the dummy Supabase URL and the absent
asset server, not the page.

**Not verified in a browser:** the admin shell click-through. The dev-only E2E *admin* persona makes `AdminAuthProvider` re-run forever
(`ensureAuthorized` is a new function every render) — identical on clean `main`, untouched here. The Playtests panel is covered by
`AdminShell.areas.test.tsx` and `ScrubLaunch.test.tsx` (the button posts `{match_with_bot:true, preset:"admin.scrub"}` through the shared
`PresetLaunch`); the same body was posted by the rig over real HTTP. The owner's first production click-through is the remaining check.

## Tests
**Backend:** see its handoff (98 new tests; clean baseline comparison identical after one pin fix).

**Frontend vitest** (S2's directory set — `lib/ranked-public`, `lib/ranked-core`, `pages/quiz-ranked`, `components/ranked-arena`,
`components/interaction-grammar`, `lib/interaction-grammar`, `components/quiz`, `pages/admin`, `pages/dev`, `lib/scrub`, `components/scrub` — run sequentially on both trees):
base `7be45341` **5977 passed / 13 failed of 5994**; branch **6048 passed / 15 failed of 6067** (+73 = the S2 tests). Failure-set diff:
* **Branch-only, deterministic: 1** — `useRankedMatch.revealHold.test.ts` pinned the shared server-paced set to exactly Match Grid + Reconstruct
  (and asserted `scrub` absent). Scrub now joins it, so the pin is updated and Scrub's own hold arithmetic and stored-presentation tests were
  added (`1b6a3523`, +3 tests). Found by this comparison.
* **Shared baseline, deterministic: 10** in six files — `QuizCategoryRail` (3), `DailyOnCanonicalArena.boundary` (2), `QuestionStageGeometry` (2),
  `CanonicalArena.boundary` (1), `AdminQuizReview.proPlay` (1), `syntheticRankedHistory` (1); each fails identically when run alone on clean base.
* **Load-timing flake, both trees:** `LobbyPreviewPage.premiumAnalytics` fails 1–5 *different* tests per run on **both** trees (isolated: branch 4 / 5, base
  5 / 5 / 2 …; always including the same Daily-records test), and `QuizRankedMatch.rfx1b3` failed once in a loaded run and passed 35/35 twice alone.
  Two of the Lobby tests happened to be on the branch side of that one run; they are not related to this change.
After the pin fix the deterministic branch failures equal the baseline's. `PlaytestMatchHost.test.tsx` (the one other file naming the touched modules) 15/15 on both.
**New since the comparison:** the input-gate fix (`18b46f67`, +2 tests, red on the pre-fix module) and re-runs of `lib/ranked-core`, `pages/quiz-ranked`,
`lib/scrub`, `components/scrub`, `components/interaction-grammar` (2007 tests, 1 load-flake that passes alone).
**Browser (Playwright, arena config):** `ranked-scrub-objective-fit` 10/10 (new; red on 4 viewports before the CSS fix) and S2's `ranked-scrub-continuity` 12/12 (6 viewports × 2 motion modes, replay-based; re-run on this branch after the CSS and input-gate changes).
**Production build:** `vite build` succeeds; the bundle contains the Chronoscope and `admin.scrub` and **not** the dev-only `mogsy_e2e_identity` seam.
**Types/lint:** `tsc -p tsconfig.app.json` shows only the two pre-existing errors on clean main (`OnboardingProfile.tsx`, `identity/connections.ts`).

## Evidence
`docs/audits/scrub-s3/` — 13 JPEGs from the real-backend runs (before/after the objective fix, desktop, tall, compact, phone, small
phone, reduced motion). Raw per-run JSON and per-frame samples are in the session scratchpad, not committed.

## Rollback
Frontend only, no data: revert the merge on `main` (`git revert -m 1 <merge sha>`) and republish via Lovable (or republish the previous
Lovable version). The admin Playtests panel and the `scrub` renderer disappear; the backend preset becomes unreachable from the UI and is
inert. Revert the backend afterwards only if desired (see its handoff for the resume caveat on unfinished admin matches).

## Release-gate checklist
Command-center review of both PRs → backend merge + Railway deploy + owner `queue` smoke → this PR merge + Lovable publish → owner plays the
Chronoscope from the Admin Playtests panel on desktop and on a phone, then confirms public Ranked/Daily/Study Hall, Match Grid, Reconstruct
and Order Forge are unaffected.

## Known limitations / owner decisions
* Compact-tier residual above.
* A timed-out lock shows the generic result stamp over an inert instrument and **no proof on screen** during the hold (Reconstruct R3C has a dedicated
  timeout-reveal path; Match Grid does not). The proof is in Review (`outcome: timeout`, proof present — verified live).
* The arena's top strip shows "INCORRECT / +0 points" as soon as the settlement is discovered, before the traverse finishes (shared shell
  behaviour, S2 limitation 2; unchanged).
* No SFX beyond the shared lock sound; melee/cannon art are SVG projections.
* The `/dev/ranked-shell-probe?q=scrub` replay (`scrubBotReplay.ts`) and its fixture are dev-route only.

## Update log
* S3 start: isolated branch from `7be45341`.
* S3 integration: S2 recovered and reconciled, server-paced reveal, objective-fit fix + spec, real-backend rig and smoke, comparison runs.
