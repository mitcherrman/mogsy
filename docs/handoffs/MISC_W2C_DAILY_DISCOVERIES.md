# MISC Wave 2C — Earned discovery card ceremonies in Daily results (F04)

Issue: [mitcherrman/mogsy#60](https://github.com/mitcherrman/mogsy/issues/60) · branch `fix/misc-w2c-daily-discoveries` · base `origin/main` = `f248f840` ("fix(journey): preserve stated ability formulas on inspectable tiles (F08)", fetched 2026-10-17). Frontend only. Nothing merged, deployed or written to any backend.

## 1. What shipped

A Daily result now shows the question cards the player **newly discovered in that stage**, after the score has landed:

- **Main result** (`DailyMainResult`, plan v5+ Standard): panel sits between the Performance snapshot and the Optional box.
- **Stage results** (`DailyStageResult`: Time Trial, Survival, Weak Areas, Order Forge, and every stage of a legacy v1–v4 Daily): panel sits between the snapshot and the "Up next" row.
- Cards, headline, growth line (`423 → 426 discovered`) and cue are the **existing** `DiscoveryReveal` and the **existing** `useMatchDiscoveries` loader. No lookup, count or ownership is derived on the client.
- The panel's CTA ("Review New Discoveries") goes to `/quiz#review`, the destination Ranked already uses.

## 2. Verified contracts (read before changing anything)

| Question | Finding | Source |
| --- | --- | --- |
| Which match id? | A completed stage **keeps** `child_match_id` (the Daily snapshot never clears it). The result is about *that stage*, so the id is `stage.childMatchId` of the stage the result shows — never `currentStage`/`activeChildMatchId`, which already point at the **next** stage once the result is up. | BE `daily_challenge/run/service.py` `snapshot()` (origin/master `80da3edc`); FE `contracts.ts` `readStage` |
| Does a Daily child collect discoveries? | Yes. Only `role_challenge` and `bonus_game` hosts are in `NON_COLLECTING_HOSTS`; a Daily stage's host is `daily_challenge`. | BE `ranked_public/discovery.py` |
| Who may read? | `GET /api/ranked/matches/{id}/discoveries`: participant (403) then terminal (409); guest 401, anonymous Supabase session 403 `ACCOUNT_REQUIRED`. Free, read-only. | BE `routes/ranked_public.py`, `service.get_match_discoveries`; FE `client.ts` |
| When is the child terminal? | When the parent has settled the stage (`stage.status === "completed"` / main pair frozen). The read is enabled only then. | `useDailyRun` / `flow.ts` |
| Is the reveal answer-free? | Yes; `readMatchDiscoveries` refuses a leaking payload (`assertNoCorrectness`). Tested at the Daily level too. | `contracts.ts` |

No backend or API change is needed or proposed.

## 3. Design decisions

1. **Only "earned" renders.** `newCount > 0` is the single condition. Loading, nothing-found, guest/anonymous/404/409/5xx, network failure, malformed body and an answer-leaking payload all render **nothing**: no skeleton, no error plate, no "No new questions" strip (the Ranked quiet strip is deliberately *not* used on a Daily — it would be noise on a stage result). Continue never waits on the slot.
2. **Review stages never ask.** A Review replays the day's misses, which are owned by definition (`stageCanDiscover`).
3. **Sequenced after the score.** The read starts at the settle; the cards are held `1200 ms` (main: score lands 800 ms, snapshot enters 900 ms) or `600 ms` (stage: clears the completion sting) from the settle. A fast read does not land on top of the score; a slow read adds no extra wait. Reduced motion skips the hold and the ease. Constants: `DAILY_DISCOVERY_HOLD_MS`.
4. **No jump.** The slot is not in the tree until there is something to show, so empty/loading/error add zero height and no flex gap. When earned it mounts closed (`grid-rows-[0fr]`, `-mt-4` cancelling the parent's `gap-4`) and opens on the next frame via a `grid-template-rows` transition. Tailwind utilities only — **`src/index.css` and the timer/SFX runtime are untouched** (Wave 2D owns them).
5. **One sound event.** The panel's own cue under Ranked's id `ranked:<matchId>:discovery` (`discoverySoundEventId`); the engine's `eventId` dedupe is the guard. Mute/unlock are the engine's, as for every cue. No new registry row, no sound code changed.
6. **Host-supplied CTA.** `DailyMainResult`/`DailyStageResult` take an optional `onReviewDiscoveries`; without it there is neither the panel nor the request (so every pre-existing test/consumer is byte-identical). `DailyRunPage` supplies `navigate("/quiz#review")`.
7. **Loader fix (the one Ranked-visible change).** `useMatchDiscoveries` now (a) clears `view` when `matchId` changes and (b) only returns a view whose `matchId` equals the one asked about. The Daily result component is reused from stage to stage, so before this a previous stage's cards could show for a render under the next stage. Ranked is unaffected (one match per mount). Moved to `src/lib/ranked-core/flow/useMatchDiscoveries.ts` because the Daily may not import from `pages/quiz-ranked` (`DailyOnCanonicalArena.boundary`); `pages/quiz-ranked/useMatchDiscoveries.ts` is now a re-export shim (precedent: `roundTimeline`), so `QuizRankedMatch` is unchanged.

## 4. Changed files

New: `src/pages/quiz-daily-challenge/run/DailyDiscoveries.tsx` (+ `.test.tsx`), `.../run/dailyF04.discoveries.test.tsx`, `src/lib/ranked-core/flow/useMatchDiscoveries.test.tsx`, `src/lib/ranked-public/__fixtures__/dailyMatchDiscoveries.backend.json` (+ `.generate.py`), `e2e/f04/daily-discoveries.check.ts`, this file and `docs/handoffs/misc-w2c-daily-discoveries/*.png`.
Modified: `DailyMainResult.tsx`, `DailyStageResult.tsx`, `DailyRunPage.tsx` (prop + `navigate`), `src/lib/ranked-core/flow/useMatchDiscoveries.ts` (moved + fix), `src/pages/quiz-ranked/useMatchDiscoveries.ts` (shim), `DailyOnCanonicalArena.boundary.test.tsx` (lists `DailyDiscoveries.tsx` as an allowed between-stage component).

## 5. Evidence

### Real backend response fixture
`dailyMatchDiscoveries.backend.json` is **not hand-written**: `dailyMatchDiscoveries.generate.py` imports the real backend projection (`ranked_public.projections.project_match_discoveries` from `origin/master` `80da3edc`, extracted with `git archive`) and renders an earned response (2 resolved cards + 1 retired question, 423→426) and a nothing-found response. It is the backend's own output shape, not a production capture (reading production needs an authorised DB/identity, which this pass did not use). Every test parses it through the real `readMatchDiscoveries`.

### Failed-before / pass-after
- `src/lib/ranked-core/flow/useMatchDiscoveries.test.tsx` › "never shows match A's answer under match B": **fails** with the loader reverted (`expected { …(10) } to be null`), **passes** with the fix. The component-level stage-switch test (`DailyDiscoveries.test.tsx`) also asserts no old-stage card for a single frame.
- Every `DailyDiscoveries`/`dailyF04` test is new behaviour (the component did not exist), so each was red before by construction.

### Unit / integration (vitest 3.2.7; plain `npx vitest run` works today)
```
npx vitest run src/pages/quiz-daily-challenge src/lib/ranked-core/flow/useMatchDiscoveries.test.tsx \
  src/pages/quiz-ranked/QuizRankedMatch.discovery.test.tsx src/components/ranked-arena/DiscoveryReveal \
  src/components/ranked-arena/DailyOnCanonicalArena.boundary.test.tsx \
  src/lib/ranked-public/contracts.matchDiscoveries.test.ts src/lib/daily-challenge
→ Test Files 1 failed | 24 passed (25) · Tests 2 failed | 338 passed (340)
```
The 2 failures are **pre-existing** and unrelated (also red on `f248f840`): `DailyOnCanonicalArena.boundary` › "names no manual progression control" (the word "Continue" in `entry.ts`/`DailyRunPage.tsx`/`dailyLeaveContract.ts`) and › "the parent run is the ONLY Daily runtime" (stale file list). My change makes neither worse, and the one boundary test it *would* have broken ("remaining components…", "names no module under pages/quiz-ranked") passes.

Wider chunks run as separate processes (the full suite OOMs here):
- `src/components/ranked-arena src/components/game-results`: 9 failed | 657 passed — **identical failure set to a clean `f248f840` checkout** (diffed).
- `src/lib/ranked-public`: 394/394. `src/pages/quiz-ranked`: 751/751.
- `src/lib/ranked-core src/pages/quiz-daily-challenge src/pages/quiz-ranked src/test` (minus `pt2cProfileFrameAuthority`): 2686 passed | 32 failed in 13 files (CSS-slice, migration byte-identity, Stripe/identity guards; none touches a file in this change).
- `tsc -p tsconfig.app.json`: only the two pre-existing errors (`OnboardingProfile.tsx`, `identity/connections.ts`). ESLint: 0 errors, 3 `react-refresh/only-export-components` warnings (same pattern as the existing `DailyMainResult` export).

Test coverage (`DailyDiscoveries.test.tsx`, 25): read is gated on settle and names the settled stage's match, once across polls/re-renders (StrictMode only adds dev double-invoke); Review never asks; exact server cards, order and growth arithmetic; no answer text; sits between snapshot and Optional; mounts closed then opens; cue once under `ranked:<id>:discovery`; CTA → `onReview`; reduced motion; stage result + legacy Daily; nothing-found; **10 failure modes** (401, 403 ACCOUNT_REQUIRED, 403 not-participant, 404, 409, 500, transport, malformed body, contract failure, answer-leaking payload) each with no panel, no alert, Continue enabled and working; slow read never blocks Continue; no host CTA → no request; stage switch. `dailyF04.discoveries.test.tsx` (3) drives the real `DailyRunPage` + in-memory B: Standard → cards → CTA `/quiz#review`; Continue into a bonus stage reads `child-1` and never replays Standard's; a reload lands on `optional-entry` with no read and no ceremony.

### Browser (Microsoft Edge via Playwright, real `/quiz/daily-challenge`, real `QuizRankedMatch` hosted child, backend reads intercepted)
Run: `node <vite-node>/vite-node.mjs e2e/f04/daily-discoveries.check.ts` against `vite --mode e2e` (the Playwright test runner cannot load the JSON fixtures under Node 24 — the existing DRS1 e2e fails the same way — so this is a plain `playwright` script). **24/24 scenarios pass** at 1280×800, 390×844, 360×640, 320×568; every animation frame sampled. (Review follow-up in §7 adds overlap, focus and reduced-motion scenarios: 34 in total.)

| Viewport | Earned | none / 401 / 403 / 404 / network |
| --- | --- | --- |
| 1280×800 | cards 1243 ms after settle; opens over 16 frames; hero eased 25.3 px (page is vertically centred, ≤25.3 px/frame) | 244 settled frames, max drift **0.00 px**, page height constant |
| 390×844 | 1235 ms; 436 px panel over 17 frames; hero 0 px | same, 0.00 px |
| 360×640 | 1218 ms; 469 px over 17 frames; hero 0 px | same, 0.00 px |
| 320×568 | 1227 ms; 503 px over 18 frames; hero 0 px | same, 0.00 px |

Also asserted: panel mounts closed at ~0 px and never gains >50 % of its height in one frame; no horizontal overflow in any frame (≤12 px pre-existing glow bleed on phones, constant); panel inside the viewport width; Continue enabled and reachable after scrolling; no `role=alert` for any failure. Screenshots: `docs/handoffs/misc-w2c-daily-discoveries/` (`desktop-1280x800-cards.png`, `phone-390x844-cards.png`, `phone-360x640-cards.png`, `phone-320x568-cards.png`).

## 6. Risks / notes for the reviewer

- **Earned state adds height by definition.** On a desktop-height viewport the vertically-centred card shifts up ~25 px, eased over ~270 ms (not a snap); on phones the page already scrolls, so nothing above moves. Loading/empty/error add none (0.00 px measured).
- **Panel wait is ≈1.2 s after the score** on the main result, by design (so cards never overlap the count-up/cue). Players who tap Continue first simply leave; Continue is enabled at the settle.
- **No duplicate read.** The hosted Daily child mounts `QuizRankedMatch`, which has its own `useMatchDiscoveries` call gated on `match_over`; the browser run counted exactly **one** discoveries request per Standard stage (asserted), so the hosted child hands back before it ever reads.
- **StrictMode (dev only)** double-invokes the loader effect (2–3 identical reads in dev); production makes one (asserted in the non-strict test).
- **Floating Friends (Community) trigger** can sit over the CTA's left edge at some mid-scroll offsets on phones — measured and documented in §7; no source change.
- **Fixture provenance** is the real projection code, not a production capture (see §5).
- Pre-existing red tests listed above were not touched; `DailyOnCanonicalArena.boundary` "ONLY Daily runtime" list is stale on `main` and would be a trivial separate fix.
- **Not done (out of scope per #60):** F05 compact-layout redesign; any `src/index.css` / timer / SFX runtime change (Wave 2D); backend changes (none needed); merge/deploy.
- Worktree: `C:\Users\mlmit\mogzy-wt\misc-w2c-daily-discoveries` (node_modules is a junction to the primary checkout's). Dev server entry `f04-daily-discoveries` (port 5311) lives in the git-excluded primary `.claude/launch.json`.

## 7. Review follow-up — floating Community (Friends) trigger vs. "Review New Discoveries" (PR #62 review, 2026-10-17)

The review asked whether the fixed Community trigger (`FloatingFriendsButton`: `fixed left-6 bottom-6 z-40`, 44×44 → occupies x 24–68, the bottom 24–68 px of the viewport) can obstruct the CTA on phones. Reproduced in Edge with a mobile context (touch) on the real Daily page, panel open, by sweeping every 40 px scroll offset plus the maximum and sampling `elementFromPoint` on a 4 px grid over the CTA's visible rect; plus real `touchscreen.tap`s. `e2e/f04/daily-discoveries.check.ts` (`overlap`, `focus`, `reduced-motion` scenarios) keeps it as a regression check.

| Viewport | Trigger rect | CTA fully on screen / fully **clear** (of N offsets) | Partly covered offsets (worst reachable area) | CTA centre ever covered | At max scroll | Continue |
| --- | --- | --- | --- | --- | --- | --- |
| 390×844 | 24,785→68,829 | 10 / **8** of 17 | 3 (89 %) | **never** | CTA 100 % reachable | centre never covered; 99 % reachable at max, never fully clear |
| 360×640 | 24,580→68,624 | 9 / **7** of 22 | 3 (88 %) | **never** | 100 % | centre never covered; 98 % at max |
| 320×568 | 24,508→68,552 | 11 / **9** of 26 | 2 (91 %) | **never** | 100 % | centre never covered; 98 % at max |

Real taps:
- **390×844 and 360×640:** the "covered" offsets only graze the trigger's bottom edge (the deepest covered point is 20 / 18 px from the trigger's centre); a real tap on that point still lands on the CTA (`pointerdown/touchstart/click` all on `discovery-cta`) and reaches `/quiz#history`.
- **320×568:** a genuine overlap exists at one offset class (scroll ≈ 600, CTA inside the viewport's bottom 68 px): a real tap on the CTA's left strip (4 px from the trigger centre) opens the Community drawer instead. Tapping the CTA's centre — or anywhere right of x≈68 — at the same or any clear offset reaches the hub.
- Focus (`cta.focus()`, which is what Tab does) centres the CTA: 254–335 px of space below it, 100 % reachable, at all three sizes.

**Conclusion: the CTA is never blocked, so no source change was made.** Its centre is never covered at any scroll offset, it is fully clear at 7–9 offsets including the maximum scroll (where the natural rest position puts it well above the trigger, with the Optional box and Continue below it), and keyboard focus lands it clear. The residual left-edge overlap (≤ 12 % of the CTA's area, transient, 320 px only for a deliberate tap) is the pre-existing behaviour of a fixed, page-wide overlay passing over any full-width control — Continue itself is never fully clear of it at max scroll (98–99 % reachable, centre never covered), on every Daily result, before this PR. Removing it from the Daily result alone would mean narrowing or re-aligning the CTA/panel, which changes layout the review asked to leave alone, and moving or hiding the trigger is a global Friends change (out of scope). A follow-up, if wanted, belongs to the Community trigger (e.g. dock-aware lift like its existing `lifted` state).

Other checks re-run on this head (no source changes in this pass):
- **Continue:** enabled and clickable in every scenario; centre never covered; `earned` still asserts it reachable after scrolling.
- **Overflow:** no horizontal overflow in any sampled frame at 1280/390/360/320 (≤ 12 px pre-existing glow bleed on phones, constant).
- **Motion:** default — cards 1.22–1.24 s after the settle, eased over 18 frames; reduced motion (`reducedMotion: "reduce"` on the context) — cards 250–267 ms after the settle (just the read round trip), open within 0 frames, all 3 cards, Continue enabled, no overflow.
- **Empty / failure states:** `none`, 401, 403, 404, network at all four viewports: no panel, no alert, **0.00 px** drift of hero/snapshot/optional/Continue over ~260 settled frames, page height constant.
- Browser matrix: **34/34** (24 original + 3 overlap + 3 focus + 4 reduced-motion).
- Vitest (focused): `quiz-daily-challenge`, `useMatchDiscoveries`, `QuizRankedMatch.discovery`, `DiscoveryReveal*`, `DailyOnCanonicalArena.boundary` → 281 passed, 2 failed (the same two pre-existing `boundary` failures).
- CI on `7f416915` (rechecked 2026-10-17): `measure` (Journey Mobile Space Experiment) ✓ and `role-challenge` ✓ — both completed successfully. These two workflows are the only ones that ran for the PR; neither runs the Daily/discovery suites, so they do not substitute for the vitest/browser evidence above.
