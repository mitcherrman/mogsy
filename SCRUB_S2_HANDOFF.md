# SCRUB S2 — Chronoscope productionization — Handoff

**Objective.** Turn the approved SCRUB-S1 Chronoscope prototype into a real canonical Ranked module, `scrub.v1`, without redesigning it: `wave/XP authority → Scrub Ranked module → Chronoscope primitive → QuizRankedMatch → CanonicalArena`. No new Arena, scoring, history store, attempt database or wave/XP engine, and no frontend correctness.

**State: COMPLETE on local branches, committed locally only.** Nothing pushed, merged, deployed (Railway) or published (Lovable).

## Bases (fetched and verified at start)
| Repo | Production head | S2 branch / worktree |
|---|---|---|
| Frontend `mogsy` | `origin/main` **`a59526b2`**. The brief named `0e37e621`, but main had moved 16 commits on (Archives item directory + SEO), so S2 is based on the actual head. | `scrub/s2-frontend`, `mogsy/.worktrees/scrub-s2-fe` (`node_modules` is a junction to the main checkout) |
| Backend `League_Combat_Simulator` | `origin/master` was `63847f4f` at fetch. **Another session pushed 5 JATTN1 commits mid-run** (`→ 679173bf`, fast-forward, Journey/mastery files only, zero overlap); S2 was fast-forwarded onto **`679173bf`** before commit | `scrub/s2-backend`, `League_Combat_Simulator/.worktrees/scrub-s2-be` |

The S1 sources (`e489da4b` frontend, `c4ac2af1` backend) are local-only; they were read from their worktrees (`mogsy/.worktrees/scrub-s1-chronoscope`, `League_Combat_Simulator/.worktrees/scrub-s1-be`).

Baseline worktrees used only for comparison (detached, not branches): `mogsy/.worktrees/scrub-s2-fe-base` (`a59526b2`), `League_Combat_Simulator/.worktrees/scrub-s2-be-base` (`679173bf`).

## Production reconciliation (frontend `bdf4bbf1 → a59526b2`, 23 commits)
I audited all 23 commits on main since S1's base: the 7 named in the brief (JATTN1 Journey attention + integrations) and 16 more (Archives/SEO). Of the files S1 touched, only `src/App.tsx` changed (+2 lines, an `/lol/docs/items` route). `CanonicalArena`, stage geometry, `QuizRankedMatch`, `useRankedMatch`, the reduced-motion hook (`useReducedMotionPreference`) and the arena/ranked-core flow are **unchanged**. Shared CSS changes are Journey-scoped (`.journey-*`); there are no collisions with the primitive's `cs-*`/`wx-*` classes. The one new shared hook (`useCoarsePointer`) is unused by the Chronoscope. **Nothing needed semantic reconciliation, and nothing on main was overwritten.** S2 does not touch `App.tsx` at all (the S1 dev route is not carried; see below).

The backend S1 seam (`c4ac2af1`) applies cleanly to the current master. Its `routes/mechanics_xp.py` change had rewritten the whole CRLF file as LF (910-line churn), so that file was **not** carried (see wire contract).

## S1 → S2: reused unchanged vs adapted
**Reused byte-identical** (content-compared; CRLF only from `core.autocrlf`):
- `src/components/interaction-grammar/Chronoscope.tsx`, `chronoscope.css`, `Chronoscope.test.tsx`: the primitive, its fixed tiers and its 17 tests.
- `src/lib/interaction-grammar/chronoscope.ts` + `chronoscope.test.ts`: the pure clock, snap and plan helpers.
- `src/components/scrub/WaveXpLens.tsx` + `wave-xp-lens.css`: the lens scene.
- `src/lib/interaction-grammar/types.ts`: S1's contract hunk (`ChronoscopeCheckpoint/Public/Reveal/ProofReading/Response`), applied as-is.
- Backend `league_mechanics/wave_xp_authority.py`: the authority seam (`chronoscope_checkpoint_rounds`, `level_after_wave` + level-curve bracket on each row), identical.

**Adapted:**
- `src/lib/scrub/waveXpChronoscope.ts` (+ test): now maps the **Ranked wire** (`ScrubBlockView` / `ScrubChallengeReveal`) instead of the prototype capture. The scene, the wording, the gauge ratio and the teaching lines are unchanged. One substantive change: **the verdict is the server's `is_correct`.** S1 computed `lockedToken === canonicalToken` in the browser; S2 never compares tokens (pinned by a source test).
- `chronoscopeModule.tsx` (S1, context-fed) became `src/lib/ranked-core/modules/scrubModule.tsx`, the production renderer fed by `segmentState`, shaped like `reconstructModule`.
- `league_mechanics/tests/test_wave_xp_chronoscope.py`: the two tests of the public `/chronoscope-rounds` route are dropped with the route; the other 8 are unchanged.
- `e2e/ranked-scrub-continuity.spec.ts`: rewritten to drive the **real host** (see Continuity).

**Not carried (prototype-only):** the `/dev/scrub-chronoscope` harness (`ScrubChronoscopeHarness`, `chronoscopeProbeView`, the context seam), the prototype capture `waveXpChronoscopeCapture.json` (it bundled every answer into the client), the DEV route in `App.tsx`, the backend `GET /api/mechanics/xp/wave-xp-authority/chronoscope-rounds` route (it served every canonical answer to anyone), `scripts/scrub_chronoscope_fixture.py`, and the S1 local Playwright config and capture script.

## Backend (`scrub/s2-backend`)
- `ranked_modules/scrub.py`, **`ScrubModule` (`scrub.v1`)**, mirrors `reconstruct.v1`'s contract: `supports_points_scoring`, `settles_child_outcomes`, `supports_challenge_reveals`; no per-card timers and no child refs (playtest surface). It adds no wave/XP math: rounds come from `chronoscope_checkpoint_rounds(patch)` and fail closed (`RANKED_MODULE_DATA_UNAVAILABLE`) on an unsupported patch or zero provable rounds.
- **Generation is deterministic.** A seeded permutation of the 9 provable rounds (26.15) is indexed by segment, so no objective repeats within a match. It is a pure function of `(seed, match, segment, config)`.
- **Freezing.** The public payload holds the objective, the source (patch/map/mode), the unit label, the footnote and 15 checkpoints. Each checkpoint carries the same 12 public lane fields: `token, wave_number, spawn_time_display, is_cannon_wave, melee/caster/cannon_count, level, cumulative_xp, wave_xp, level_floor_xp, level_ceiling_xp`. The private payload holds the canonical token, the satisfied tokens, the before/after readings (with breakpoint notes), the threshold, the granularity caveat and `round_id`.
- **Wiring, all additive.** `registry.py`; `ranked_formats/schema.py` (`_validate_scrub_config`, `scrub_test_format()`: 3 × `scrub.v1`, 30 s, pressure 0, 2 pts + v2 speed bonus, reveal window 3000 ms, unrated, bot-eligible); `ranked_public/service.py` (`PRESET_SCRUB = "admin.scrub"`, admin-only); `projections.py` (preset map); `readiness.py` (`_scrub_readiness` uses the module's own loader, with no DB); `review.py` (`_scrub_round`, graded through `ScrubModule`); `schemas/ranked_public_schemas.py` (`checkpoint` choice, 1–16 chars, exactly-one rule); `answer_safety.py` (reveal-only keys); `quiz/public_category.py` (`scrub:wave_xp → wave-management`).
- Preset visibility: `admin.scrub` is in no Daily, Standard, Time Trial, Survival, Journey, Study Hall, builder or production format (asserted by test).

## Wire contract (`scrub.v1`)
- **Submit:** `POST /api/ranked/matches/{id}/segments/{n}/challenges/0` with the body **`{"checkpoint":"w4"}`** and nothing else. Tokens are `w<wave>`, and the wave identity is already engraved on the rail, so a token carries nothing the player can't see. Refused: a token outside the frozen set, any other choice key (`placement`/`order`/`selected`/…), any derived field (`level`, `xp`, `cumulative_xp`, `is_correct`, `threshold_xp`, …), wrong types or lengths. A schema violation returns 422; a module refusal returns 422 `RANKED_INVALID_CHOICE`, and nothing is stored. A retry is idempotent; a different re-lock is `conflicting` and keeps the first.
- **Grading:** `checkpoint == frozen canonical`, exact equality. A later checkpoint where the state also holds is wrong, as designed ("first").
- **Lock ack / own reveal (viewer only, after their lock):** `{challenge_index, checkpoint, is_correct, traverse_path, canonical_checkpoint, satisfied_checkpoints, proof:{lane, target_level, cannon_only, threshold_xp, before, after}, granularity_caveat}`. Each reading is `{token, wave_number, spawn_time_display, level, cumulative_xp, is_cannon_wave, breakpoint_note, satisfied}`. `traverse_path` is chosen → canonical inclusive, `[canonical]` for an exact lock.
- **Settlement (`segment_reveal`):** module/version/scoring/points, `checkpoints` (rail tokens), the reveal body, and per player `{checkpoint, traverse_path, correct, incorrect, unanswered, base_points, speed_bonus_points, points_awarded, finished_first, duration_ms, segment_result}`. The child record is `scrub:wave_xp` with `answer = token`.
- **Review (`kind:"scrub"`):** objective, unit, the rail, `viewer_checkpoint`; and, only when the round is resolved, `canonical_checkpoint`, `satisfied_checkpoints`, `proof`, `traverse_path`, `granularity_caveat`, `outcome`. Unresolved rounds carry nulls.
- **Honesty:** correctness is at wave (spawn-time) granularity. The authority's caveat travels as `granularity_caveat`, and its short form ("Checkpoints are wave spawn times · levels at wave granularity") is the public footnote. Nothing claims a minion-death instant.
- **Fixture:** `src/lib/ranked-public/__fixtures__/scrubServerCapture.json` is the backend's `test_scrub_wire_contract.py` bodies (`SCRUB_WIRE_CAPTURE_PATH=…`). Regenerate it; never hand-edit it.

## No-answer-leak certification
Before Lock there is no canonical field, no correctness boolean, no breakpoint note, no proof, no traverse, and no satisfied set anywhere on the wire or in the DOM:
- **Backend guard:** `answer_safety.FORBIDDEN_PRE_REVEAL_KEYS` gains `canonical_checkpoint, satisfied_checkpoints, proof, traverse_path, threshold_xp, granularity_caveat` (`breakpoint_note` was already listed). `public_view` is an allow-list rebuild, never a copy (tested with injected keys). The flow and HTTP tests key-walk the public, private and resume snapshots, the persisted public payload, and the opponent's view, and fragment-scan for the round id and breakpoint notes. The wire test key-walks every pre-lock body (open, both pre-bot-lock pairs, after-refusal) against the shared guard plus the Scrub vocabulary.
- **Frontend guard:** `_FORBIDDEN_SEGMENT_KEYS` gains the same 7 names. The capture test injects each into the block **and into a checkpoint** and expects a parse error, refuses an own reveal for a challenge still answerable, and checks that the canonical token appears exactly once in a pre-lock challenge (its own rail entry) and that every checkpoint has the same key set.
- **DOM (real host, jsdom):** before Lock the canonical marker is `data-shown="false"` **and parked at position 0** (never placed on the answer); there is no proof node, no trace, no reveal stage, no `data-passed` detent, and no note, verdict or teaching text. The browser spec re-checks this at every viewport before each lock.
- **Server-private data:** `round_id`, the threshold and the notes never appear pre-lock. One deliberate property: the threshold's *value* (e.g. 2400) is a level-curve figure and appears pre-lock as some checkpoints' `level_ceiling_xp` (the gauge's "next level" figure, public by S1's design). Only the objective's `threshold_xp` *key* is reveal-only.

## Real Ranked lifecycle
`QuizRankedMatch.scrub.test.tsx` (7) runs the real controller, arena and module over the real captured bodies on the production bot-inline path. The bot has already locked, so the lock POST settles the segment and its inline `challenge_reveal` is the only copy of the reveal (now joining `INLINE_LOCK_REVEAL_MODULES`).
- Open → keyboard scrub → Lock sends exactly `{checkpoint}`.
- **Wrong lock** (w15, canonical w6): the chosen marker holds its detent through the whole reveal; the reticle moves monotonically w15 → w6 and is sampled at **every** intermediate detent; the canonical marker shows only after the traverse; the reveal ends at `done` with the proof (the authority's before/after XP) and "Not the first checkpoint · Wave 15 reaches it too — wave 6 was first."
- **Exact lock** (w4): no traverse stage, the reticle stays put, both markers sit on one detent, and the verdict reads "Exact checkpoint".
- **Reduced motion:** the first revealed frame is `done` with the proof and both markers (chosen at w15, reticle and canonical at w6).
- **Refused lock:** no reveal, the rail reopens at the same checkpoint.
- **The module owns the result:** no generic result stamp during the reveal.
- `ScrubLaunch` (Admin → Ranked → Playtests → "Chronoscope" panel → **Play Chronoscope**) sends `{match_with_bot:true, preset:"admin.scrub"}` through the shared `PresetLaunch` and navigates to `/quiz/ranked`, like Reconstruct and Order Forge.

## Review / history / resume
- **Review:** backend `_scrub_round` grades through `ScrubModule` (it cannot disagree with settlement) and withholds everything for an unresolved round. The frontend `reviewScrub` reader refuses an unrevealed round that carries the checkpoint. `QuestionReviewCard` renders the objective, "My checkpoint · Wave N · m:ss" with the server's verdict, and the before/first proof with the threshold. The timeline sigil (`Hourglass`) and subject "Chronoscope" appear in the results model, transcript, live title and question icons. Tested over the captured three-round review (correct / incorrect / incorrect).
- **History:** `/api/ranked/history` lists the match (bot flag); module stats record `scrub:wave_xp` children. Tested backend and in the capture.
- **Resume:** a reload after the lock re-projects the identical reveal (backend `test_a_reload_reprojects_the_same_reveal`; HTTP resume carries the echo and own reveal). Real host: mounting from `resume_locked` / `private_locked` renders the revealed instrument (both markers, verdict, no Lock) and posts nothing. A finished match's resume reads as over.

## Bot
`bot_challenge_input` is deterministic in `(seed, segment)`: the canonical checkpoint with the shared `BOT_ANSWER_ACCURACY`, otherwise a **neighbouring human mistake**, either one checkpoint early (not there yet) or the next later checkpoint where the state already holds (true, but not first). It is always a legal token. Measured share correct over 9 rounds × 40 seeds is within ±0.12 of the shared accuracy. Think time is 4–10 s. A service test proves the settled bot checkpoint equals the module's function of the match's frozen `order_seed`.

## Continuity (real host, real browser)
`e2e/ranked-scrub-continuity.spec.ts` runs through `/dev/ranked-shell-probe?q=scrub&frame=0&bot=1&lol=1`. That route mounts the production `QuizRankedMatch` and replays the captured backend bodies (`scrubBotReplay.ts`) with timestamps shifted onto the browser clock. **One mount plays two segments and the opening of a third:** segment 1 (drag 0→9, snap, tap w4, exact lock, confirmation, proof, reveal complete), segment 2 (waits out its real lead-in, drags, taps w15, wrong lock, traverse through every checkpoint, settle, proof, reveal complete), then segment 3 opens. It uses mouse on desktop and real CDP touch on phones; every region is sampled on every rAF and every DOM commit.

**12/12 pass — 0.00 px max frame-to-frame step and 0.00 px spread for every region (shell, stage, body, module, objective, instrument, lens, reading, rail, footer, status) at every size, both motion modes. Stage overflow 0, scrollTop 0, horizontal overflow 0. Each reveal reached `done` before the next segment replaced it.**

| Viewport | Stage body | Module | Frames (motion / reduced) |
|---|---|---|---|
| 1600×900 | 650 | 610 | 372 / 526 |
| 1280×720 | 494 | 492 | 409 / 503 |
| 1366×650 | 424 | 388 | 440 / 512 |
| 1280×600 | 374 | 388 | 518 / 535 |
| 390×844 | 626 | 544 | 693 / 595 |
| 360×640 | 488 | 488 | 684 / 587 |

Stages observed: motion `clamp, traverse, settle, proof, done`; reduced `done` only.

**Correction to S1's recorded tiers.** The primitive's geometry is byte-identical to S1's, and measured in the host its tiers are compact 388, normal 492, tall 610, phone 544, phone-short 488 (S1's handoff said 368/472/590/524/496). At 1280×600 the 388 px module is 14 px taller than the 374 px stage body. Its last 13 px (the status line) sit inside the stage's 14 px bottom padding, so **nothing clips** (`ranked-question` overflow 0) but only 1 px is spare. If the owner wants margin there, the compact tier's status line or lens is the place to take it from; that is a design call and was not made here.

## Tests
- **Backend new: 90.** `test_scrub_module.py` 46 (deterministic generation, distinct objectives, canonical = authority, rail = authority rows, config refusals, unsupported patch fails closed, no-leak ×9 rounds, allow-list view, guard vocabulary, 16 invalid-choice shapes, exact grading incl. later-satisfied ≠ correct, bot, traverse path, own reveal, settlement/children/pure replay, frozen points required, format and category). `test_scrub_flow.py` 35 (preset, no other surface, open phase and reveal window, pre-reveal secrecy ×2, lock echo and viewer-only reveal, reload reprojection, 8 invalid choices store nothing, idempotent/conflict, correct+first = 3, wrong = 0, timeout, children and replay, resolved projection, bot determinism, full match + review, unresolved review, module stats, readiness, admin-only HTTP, HTTP snapshot/lock/resume, 7 HTTP bad bodies). `test_scrub_wire_contract.py` 1 (the capture). `league_mechanics/tests/test_wave_xp_chronoscope.py` 8 (S1, minus the 2 route tests). Updated pins: `test_ranked_modules_quiz_parity.py` (registry) and `test_jref2_admin_reference_journey_preset.py` (preset sets).
- **Frontend new: 73.** Primitive 17 and helpers 13 (S1, unchanged); adapter 10; server-capture contract 20; real-host lifecycle 7 (no-leak DOM, wrong-lock traverse, exact lock, reduced motion, refused lock, resume, capture sanity); `ScrubLaunch` 4; registry +1; admin shell +1. Plus the continuity e2e: 12 browser cases.
- **Regression vs clean baseline (same suites, same machine):**
  - Backend, every `test_ranked*`, `test_reconstruct*`, `test_order_forge*`, answer-safety, public-category, format, `test_jref2*`, `test_scrub*`, minion-XP/premise suites and `league_mechanics/tests` plus the wave-economy tables. **Branch 4076 passed / 262 failed / 477 skipped; clean `679173bf` 3986 / 262 / 477. The failure sets are identical (0 branch-only)**, and the +90 passes are exactly the new tests. All 262 also fail on clean master on this machine; among them are admin-bot and HTTP suites, and suites whose readiness log shows an empty `medium_ability_costs` shared-bank pool on a fresh DB. `test_ranked_builder_catalog.py` and `test_ranked_format_config.py` fail to *collect* on clean master too (`routes._auth` has no `AUTH_METHOD_SUPABASE`). Note: an earlier run with base and branch **in parallel** produced ~260 spurious media/asset failures (run interference). With fresh state those files give identical results on both (12 failed / 65 passed / 361 skipped), and the sequential rerun above is the authoritative one.
  - Frontend vitest over `lib/ranked-public`, `lib/ranked-core`, `pages/quiz-ranked`, `components/ranked-arena`, `components/interaction-grammar`, `lib/interaction-grammar`, `components/quiz`, `pages/admin`, `pages/dev`, `lib/scrub`, `components/scrub`. **Branch 5870 passed / 30 failed of 5904; clean `a59526b2` 5800 / 27 of 5831.** 22 failures are shared baseline (source-scan and stylesheet tests: `QuestionStageGeometry`, `AnswerGrid.elimination`, `CanonicalArena.boundary`, `DailyOnCanonicalArena.boundary`, `playModeCard.styles`, `masterySliceModule.visualLanguage`, `AdminPlatformPolicies`, `AdminQuizReview.proPlay`, and others). The rest are load-timing flakes that differ run to run (`LobbyPreviewPage.premiumAnalytics`, `QuizRankedMatch.rfx1b3`, `adminQuizRetirement`, `LobbyPreviewPage` isolation). Each of those **passes in isolation on the branch** (71/71 and 29/29), and base flaked on different tests of the same files.
- **Lint/types:** eslint 0 errors (4 `react-refresh/only-export-components` warnings, the established pattern; 2 pre-existing). `tsc -p tsconfig.app.json`: 2 errors, both pre-existing on clean main (`OnboardingProfile.tsx`, `identity/connections.ts`).

## Evidence (not committed)
In this session's scratchpad: `evidence/` holds 120 state screenshots (s1-open, s1-mid-drag, s1-snapped, s1-revealing, s1-proof, s2-open, s2-mid-drag, s2-revealing, s2-proof, s3-open at all 12 viewport × motion runs) and 12 `*-continuity.json` movement reports. `video/` holds three ~15 s VP8 recordings of the real-host lifecycle (segment 1 exact lock → segment 2 wrong lock with traverse → segment 3 opening): `scrub-1280x720-motion.webm`, `scrub-390x844-motion.webm` (real CDP touch), `scrub-1280x720-reduced.webm`. They were recorded through CDP screencast and encoded with the installed ffmpeg-1011, because Playwright's own recorder wants ffmpeg-1013, which is not installed; `SCRUB_VIDEO_DIR` in the spec works once it is.

**How to rerun the continuity spec on this machine.** Playwright 1.64 wants chromium headless-shell 1248 / ffmpeg 1013, but 1228 / 1011 are installed. Start the S2 Vite (`.claude/launch.json` entry `scrub-s2-fe`, port 5420), then use a throwaway config with `use: { baseURL: "http://localhost:5420", launchOptions: { executablePath: ".../chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe" } }`, or install the matching browser and use `playwright.arena.config.ts` (the spec is registered there).

## Final SHAs (local only, nothing pushed)
- Frontend `scrub/s2-frontend`: **`bc50ca8b`** (the module), on `a59526b2`; this handoff note follows it.
- Backend `scrub/s2-backend`: **`e832ff39`** (the module), on `679173bf`; this handoff note follows it.
- Deploy order: backend before frontend. The backend is inert without the admin preset, and a frontend without the backend can't reach a `scrub` segment.

## Remaining limitations
1. **The answer is derivable from public readings by design.** S1 made level and XP public at every checkpoint ("that is the game"). The task is locating the first crossing under time pressure, not recalling a hidden fact. A scripted client could compute the first `level >= L` itself. The server-side guarantees (frozen canonical, exact grading, no canonical/proof/notes pre-lock) hold; the information-theoretic one cannot without redesigning what the lens shows, which is out of scope.
2. **The shell's header verdict lands before the traverse.** On the bot-inline path the arena's top strip shows "INCORRECT / +0 points" as soon as the settlement is discovered, while the instrument is still clamping and traversing. The instrument's own choreography is intact, and `ownsResultReveal` suppresses the overlay stamp, but the header pre-empts it. This is shared shell behaviour (Order Forge and Reconstruct show it too); holding the header beat until the module reports reveal complete would be a shell change for the owner to decide on.
3. No SFX: the primitive's `onCue` seam is not wired to the Ranked SFX controller beyond the shared lock sound.
4. Melee and cannon art is still SVG projections (S1 limitation; a media task).
5. 1280×600 has 1 px of spare room (see Continuity).
6. One content family (`wave_xp`, 9 rounds on 26.15); `declares_child_refs = False`, so misses do not feed Review re-serving or Weak Areas replay yet (same as Reconstruct V1).

## Exact next task
Owner playtest via Admin → Ranked → Playtests → **Play Chronoscope** (needs both branches deployed together). Then decide limitation 2 (hold the shell's header verdict for module-owned reveals) and whether `scrub` should declare child refs.
