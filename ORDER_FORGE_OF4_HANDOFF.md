# OF4 handoff: Order Forge interaction, reveal, scene, continuity

Branch `of4/order-forge-reveal`, from `origin/main` `66fc472e` (contains F1, F2, F3). Code commit `6fe20304`; screenshots and this file are in the docs commit on top. Frontend only. Not integrated, not published.

Untouched: backend grading, scoring, persistence, analytics, Daily, role selection, Order Forge content authority, `CanonicalArena`, pacing and reveal-hold timing, SFX (F2).

## Objective
1. Drag a card by pressing anywhere on it, and keep page scroll on phones.
2. Make the reveal teach the answer.
3. Make the base-shop art read as ambient League art, not a grey wash.
4. Keep one stable scene from round entry to the next-round swap, using the existing media-prep system.

## Audit (before editing)
- **Drag**: `Reorder.Item` with `dragListener={false}`. Only the grip called `controls.start`; only the grip had `touch-action:none`.
- **Reveal**: a static two-column grid ("My order" / "Correct order"). It had a different shape from the locked list, so the layout jumped when the reveal arrived.
- **F1 backdrop**: `absolute inset-0` of the *module* box, `opacity .25`, `blur(3px) saturate(.8)`, plus a cream scrim (55/20/60%). The module's height changed between open, locked and revealed (hint line, footer, opponent line, reveal grid), so `object-cover` re-cropped the art at every phase. The art was not in `rankedRoundMedia` and unmounted during the "Loading" branches.
- **CanonicalArena dim**: the stage only goes to `opacity-60` when `revealHold` is on and there is no viewer result cue. An Order Forge segment settlement produces a viewer `block` cue (`projectResultFeedback`), so the Order Forge reveal is not dimmed. I left the arena unchanged.
- **Media prep (RFX1)**: `useRankedMediaPreparation` covers Tier 2 (the presented round) and Tier 3 (`upcomingRound`), and the swap gate `prepareRoundCritical` waits on `rankedRoundMedia(round).critical`. Order Forge card art was already critical. I extended that list; I did not add a second system.
- **Probe fixture**: the probe's reveal put the cheapest item first under a "Start: Most expensive" rail, which looks wrong on screen.

## Decisions
| Area | Decision |
|---|---|
| Mouse | A press anywhere on the card except the arrow buttons calls `controls.start` immediately. `select-none` on the card, so dragging selects no text. |
| Touch / pen | Press and hold for `LIFT_DELAY_MS = 180`. Moving more than `LIFT_SLOP_PX = 8` before that hands the gesture to the page scroll. While a card is lifted, a non-passive `touchmove` listener on the list cancels scrolling (it is attached for the whole open phase, because a listener added mid-gesture cannot cancel). Long-press callout and context menu are suppressed. The grip still lifts at once (it is the only element with `touch-action:none`). No page-wide `touch-action`. |
| Slots | The 1–5 numerals are a fixed rail beside the cards. Cards move into slots, and the numerals stay put. |
| One footprint | Open, locked and revealed rows share one fixed height (`h-14 md:h-[60px] lg:h-[52px] lg-tall:h-[76px]`). The hint line, footer and opponent line keep their space in every phase. Measured: module 648px (1600x900) and 563px (360x800), identical from lock to settled reveal. |
| Reveal | One list. The locked rows are the same DOM nodes as the reveal rows. **Step 1, "Your order"**: rows stay in the locked order; each server value fades in (60ms stagger) with the server's right/wrong mark. **Step 2, "Correct order"** at 700ms: rows travel with a Motion `layout` spring into `canonicalOrder`. Each wrong card shows "↑/↓ was N" (the slot the player gave it). Measured settle ≈1.15s, inside `REVEAL_HOLD_MS` (1500). No server timing change. |
| When it plays | Only if this mount saw the lock become a reveal. A refresh, a resume, or mounting on an existing reveal shows the settled step 2. |
| Reduced motion | OS or in-app setting: settled step 2 on the first frame. Rows are not layout elements (no projection flash), and every value, mark and note is still there. |
| Authority | Marks come only from `positionCorrect[p]` for the card's locked slot `p`. "was N" and the arrow are display indices from `order` / `canonicalOrder`, not grading. Source-contract tests still forbid comparing the orders or aggregating marks. No partial-credit text. The live region announces the canonical order with values. |
| Remotion | Not used. Motion's `layout` is already in the live path (`Reorder`). |
| Scene | Art is `mix-blend-mode: multiply` at 0.46 onto a parchment base inside its own isolated layer. The arena's stacking contexts isolate the module, so the art cannot blend with the folio itself. Filter `saturate(1.08) blur(.5px)`. Soft edges via two intersected linear masks. A small parchment glow sits behind the prompt. No scrim, no animation. Tuned at 1600x900, 1280x720 and 360x800. |
| Dark theme | No dark variant. The arena folio is parchment in both themes and the prompt is dark ink; a dark backdrop made the prompt unreadable (caught during this pass). The verdict lost its `dark:` light reds for the same reason. |
| Continuity | The backdrop is mounted for the module's whole life, including loading states: the same `<img>` node through loading, lock and reveal (tested). Its box never resizes, so the crop never changes. `ORDER_FORGE_BACKDROP_URL` (`media/orderForgeArt.ts`) is the single URL used by both the `<img>` and `rankedRoundMedia`, so the scene is critical round media: prepared in Tier 2/3, and the existing swap gate waits on it. |
| Probe | `?forge=live` serves the lock, then the reveal 2.5s later. The probe's reveal is probe-local (canonical most-expensive-first, marks to match). The shared `fixtures.ts` is unchanged, because contract tests pin its values. |

## Files
- `src/components/interaction-grammar/OrderForge.tsx`: row drag, slot rail, fixed rows, teaching reveal, reserved lines.
- `src/lib/ranked-core/modules/orderForgeModule.tsx`: `OrderForgeBackdrop` (always mounted), reserved opponent line.
- `src/lib/ranked-core/media/orderForgeArt.ts` (new): shared scene URL.
- `src/lib/ranked-core/media/roundMedia.ts`: scene added to Order Forge critical media.
- `src/index.css`: appended "OF4 Order Forge scene" block (38 lines).
- `src/pages/dev/ranked-shell-probe/RankedShellProbe.tsx`: `?forge=live` and the consistent probe reveal.
- Tests: `OrderForge.test.tsx`, `orderForgeModule.test.tsx`, `roundMedia.test.ts`, `contracts.orderForge.v1ServerCapture.test.tsx`, `e2e/ranked-arena-fit.spec.ts`.
- `docs/of4/`: `0-before-*` (origin/main) and `1-open`, `2-locked`, `3-reveal-your-order`, `4-reveal-correct-order` at 1600x900, 1280x720 and 360x800.

## Tests added or changed
- Unit, `OrderForge.test.tsx` (38): whole-card mouse drag; arrow buttons never start a drag; touch lifts only after the hold; a move before the hold never drags; jitter within slop still lifts; grip touch immediate; scroll cancelled only while lifted; nothing starts once locked; fixed slots; keyboard and focus tests unchanged; settled reveal (canonical order, verbatim values, `data-yours`, marks per slot, "was N", arrows, screen-reader text); live reveal (mine → assembled on the timer); locked rows are the same DOM nodes; timing fits the 1500ms hold; reduced motion settles immediately; nothing answer-bearing before the boundary; one footprint (row classes, hint and footer in every phase).
- Unit, module (+4): scene is inert and static and uses the shared URL; the stylesheet multiplies with no F1 desaturate or heavy blur and has no animation/transition declarations; the same `<img>` survives loading, lock and reveal; the reserved opponent line.
- Unit, `roundMedia` (+2): scene and card art are critical; nothing reveal-only is requested.
- E2E, `ranked-arena-fit.spec.ts`:
  - Order Forge fit sweep now also covers the **locked** state (10 desktop sizes).
  - OF4 scene + input at 1600x900, 1280x720 and 360x800: computed blend/opacity/filter, art loaded, backdrop = module box, no h-overflow, up/down, grip keys, grip drag, **drag from the card name**, no text selected.
  - OF4 touch at 360x600 (raw CDP touch): a swipe over a card scrolls the page (order unchanged); a hold-drag reorders with `scrollY` unchanged.
  - OF4 reveal at the three sizes: rAF-sampled; module box and scene image identical every frame from lock to settle; first frame is the player's order with 5 values; the final frame is canonical; intermediate positions observed; settled before 1400ms.
  - Reduced-motion reveal: settled canonical order on every frame.

## Results
| Check | Result |
|---|---|
| Focused Vitest (OrderForge, module, contracts.orderForge*, media) | 10 files, 146/146 pass |
| Wider Vitest (`interaction-grammar`, `ranked-core`, `ranked-public`, `quiz-ranked`, probe, `ranked-arena`; `--maxWorkers=4`) | 2466/2476. Failures: the same 7 pre-existing source-scan failures named in the F1/integration handoffs (`AnswerGrid.elimination` 2, `DailyOnCanonicalArena.boundary` 2, `QuestionStageGeometry` 3); `masterySliceModule.visualLanguage` 2, which match `\n` against a CRLF working copy of `index.css` and pass with LF (my `index.css` diff is only the appended block); `QuizRankedMatch.rfx1b3` 1, which passes in isolation (load-flaky). |
| Playwright `-g "Order Forge"` + OF4 | 40/40 pass |
| Full arena Playwright (`playwright.arena.config.ts`) | 445/446 pass (16.2m). 1 failure: `RMOB2 compact phone HUD › is 40px tall` (expected 40, got 44), the same pre-existing failure the integration handoff recorded on clean origin/main; not Order Forge. |
| `tsc -p tsconfig.app.json` | 6 errors, all in untouched files (`practiceLeaveContract.test.ts`, `OnboardingProfile.tsx`, `identity/connections.ts`) |
| eslint on touched files | 0 errors; fast-refresh warnings only (existing pattern) |
| `npm run build` | exit 0 (`public/sitemap.xml` rewrite reverted) |

## Limits / for the owner
- **Next-round swap and match end**: the arena's existing frozen-snapshot swap still decides when Order Forge gives way to the next module. The scene unmounts with the module, because the next module has its own surface. I added no crossfade, since that would be a second transition system. The match end is unchanged.
- **Result stamp**: during the settled beat, the arena's `QuestionResultOverlay` stamp ("0 / 1 CORRECT") sits at the top of the card over the metric chip. That is arena behaviour and I left it alone; worth an owner look.
- **Touch verification**: Chromium only (CDP touch). iOS Safari long-press (`-webkit-touch-callout`, context menu) and Android are not verified on a real device.
- The probe uses monogram cards. Champion art (V2) goes through the same `SubjectArt` and critical-media path but was not captured here.
- The shared hand-written fixture's canonical order still contradicts its own direction labels. It is used only by contract tests; I flagged it and did not change it.

## Next task
Owner review of `docs/of4`. Then a real-device pass (iOS Safari and Android Chrome: hold-to-drag, swipe scroll, reveal timing in a live match). Then integrate onto main with the F-series.

## Integration onto current main (of4/integration-main)
OF4 (`6fe20304` code, `ad3c742f` docs) was replayed by cherry-pick onto `origin/main`, first at `53159f2c` (9 commits past the OF4 base `66fc472e`), then re-based onto `6186953d` (two PERF1 hub/academy commits touching none of OF4's files; the effective patch is byte-identical, same `git patch-id`). Not pushed; `main` untouched.

- **Overlap with main since the base**: only `src/index.css` and `RankedShellProbe.tsx`. `RankedShellProbe.tsx` auto-merged (main added `probeMetaReflexState`; OF4 touched the Order Forge branch). `src/index.css`: both sides appended a block at end of file; both kept, no deletions on either side (the diff against main is +38 lines).
- **Validation on the integrated tree**: focused Vitest 11 files / 160 pass; `tsc` errors identical to a clean `origin/main` worktree (6, untouched files); eslint 0 errors on touched files; `npm run build` exit 0; arena Playwright 445/446 (see below).
- **Baseline comparison** (clean worktree at `53159f2c`): the 12 other Vitest failures in the wider sweep (`AnswerGrid.elimination`, `DailyOnCanonicalArena.boundary`, `QuestionStageGeometry`, `champion-card-duel`, `statCategoryIcons`, `syntheticRankedHistory`) fail identically there; the arena Playwright test `RMOB2 compact phone HUD is 40px tall` (expected 40, got 44) fails identically there.
- **Not solved (unchanged from above)**: continuity when Order Forge gives way to the next round / module / match. No new transition mechanism was added.

## OF4-FIX1: the teaching reveal inside the real minimum reveal window
Branch `of4/fix1-reveal-timing`, from `origin/main` `d35f56b5` (OF4 as published). Frontend only; no backend, pacing, grading, scene or boundary change. Not pushed, not published.

### Production symptom
Playing the real path (Admin > Leaguecraft > Ranked > Playtests > Play Order Forge) on two incorrect rounds: values and wrong marks appeared, but the cards never visibly moved into the server's correct order, and the correct order never stayed up long enough to study.

### Root cause
`REVEAL_TIMING` assumed the nominal reveal hold. It started the move at 700ms and finished at ~1200ms (a spring, so no hard bound). The real controller does not guarantee 1500ms: `useRankedMatch.beginRevealHold` asks `anchoredRevealHoldMs`, which may shorten an ordinary reveal to `REVEAL_HOLD_MIN_MS = 900` when settlement is discovered late (so the next module keeps its title window). `QuizRankedMatch` then releases the frozen surface, and the next module replaces it. 900 is therefore the only duration a reveal may rely on, and 700 + a spring cannot finish, let alone rest, inside it. Authority was never the bug: `order`, `canonicalOrder`, `positionCorrect` and `valueDisplay` were parsed and rendered correctly.

How long the reveal is on screen before the hold starts (`g`) depends on poll timing and is 0..1500ms: a regular poll is already in flight when the player locks, the lock's poke re-runs the loop at once (`rerunRef`), the first response carries the viewer's reveal and the re-run discovers the settlement one round trip later. The window is then `g + hold`, and the design budget is the worst case, `hold` alone.

### Why the probe coverage missed it
`?forge=live` serves its own reveal 2.5s after the lock and then holds the screen as long as the test samples (2000ms); the e2e asserted "settled before 1400ms" against the nominal 1500. The unit test asserted `settleAtMs + 300 <= 1500`. Nothing ran the reveal through `useRankedMatch`'s hold and the arena's release. (The handoff above even recorded that the real next-round swap was "unchanged" and left it out of scope.)

### New timing contract (`REVEAL_TIMING` in `OrderForge.tsx`)
| ms | what |
|---|---|
| 0 | the player's locked order, with each card's server value and right/wrong mark fading in (30ms stagger, 160ms fade; all visible by ~200-300) |
| 240 | the cards start travelling into `canonicalOrder` |
| 480 | landed (a bounded 240ms tween with a fixed ease, not a spring); "was N" notes fade in |
| 480..900 | the correct order stays: `REVEAL_DWELL_MIN_MS = 420` inside the shortest legal beat, ~1000ms inside the nominal one |

Measured in Chromium on the probe: values all visible by 200ms, first movement ~250ms, every card landed by 450ms, so ~450ms of dwell before 900ms. Only the reveal reorder changed to a tween; drag / arrow reordering (`Reorder.Item`) is untouched. Reduced motion, refresh and resume are unchanged: the settled canonical order, values, marks and notes at once.

No second pacing system and no global pacing change. Existing seams were inspected and not used: `ModuleViewportProps` carries no reveal duration; the server's `reveal_window_ms` (2500, on the Order Forge segment state) is only consumed by the Journey's poll scheduling and is not wired into the Ranked hold for non-Journey segments; `presentation_ms` is the module-title window. Using either to lengthen the Order Forge hold would be a shared pacing decision for the owner, not part of this fix.

### Tests
- `QuizRankedMatch.orderForgeReveal.test.tsx` (new, 4): the real `QuizRankedMatch` + `useRankedMatch` + `CanonicalArena` + `orderForgeModule` + `OrderForge` on a fake clock, only the network faked (a real captured Order Forge settlement for the hold). For the 5-card board locked `A B C D E`, server `E C A D B`: reveal and hold are back to back; the hold is `anchoredRevealHoldMs`'s floor (not 1500); first frame is `A B C D E` with the server's values and marks; the cards reach `E C A D B` at 240ms; the finished order has >= 400ms of dwell before the release and never leaves canonical; wrong cards keep "was N", the right one has none. Plus reduced motion and resume.
- Negative control: against the shipped OF4 timings the same test fails with "landed 1200ms, released 980ms", i.e. the production symptom.
- `OrderForge.test.tsx`: the old "inside 1500" test is replaced by one pinned to `REVEAL_HOLD_MIN_MS` (land, then dwell, then notes).
- `e2e/ranked-arena-fit.spec.ts`: the probe reveal now asserts landing < 600ms, >= 300ms of dwell before 900ms, canonical for every frame in that window, and every value visible before the cards move.

### Remaining limitations
- If a settlement ever arrives with no earlier snapshot carrying the viewer's reveal (the server settles inside the lock request and the next poll is already the next round), the arena's frozen surface is the pre-lock snapshot and no reveal is shown at all during the hold. Not changed here; worth an owner look if it is seen in Playtests.
- Cross-round / module / match boundary continuity is still unresolved.
- Real-device iOS / Android certification is still outstanding.
- The arena's result stamp overlap and the RMOB2 HUD height test are unchanged.

## OF4-FIX2: the reveal never reached the cards in a bot playtest
Branch `of4/fix2-reveal-lifecycle`, from `origin/main` `2a434c2b` (FIX1 as published). Frontend only; no backend, pacing, grading, timing or content change. Not pushed, not published.

### Production symptom
After FIX1 was published, a wrong lock in Admin > Leaguecraft > Ranked > Playtests > Play Order Forge (match `rkb_50f40a7c63c0222ee7eab3ea`) still left the cards in the submitted order: they never animated and never snapped into the correct order.

### Root cause: the reveal only exists inline in the lock response
- The bot is driven inline on every request (`routes/ranked_public._drive_bot`). It locks on the first poll after the segment opens, and the lock route drives it again right after the player's submit. So in a bot match the player's lock POST itself settles the segment and opens the next round in one transaction.
- `own_challenge_reveals` is projected only on the ACTIVE segment's state. After the lock the active segment is the next one, so no polled snapshot ever carries the viewer's Order Forge reveal. The backend's own `test_order_forge_wire_contract` has to switch the inline bot off to capture that state ("in a bot match a lock settles the segment at once and the locked-but-unsettled state is never projected").
- The lock response carries the authoritative reveal inline as `challenge_reveal` (with `segment_resolved: true`). The client's `readChallengeAck` dropped it.
- The poll that sees the next round starts the reveal hold before the surface adopts that snapshot, so the arena stays frozen on the pre-lock snapshot: Order Forge `locked`, `reveal = null`, rows in the submitted order, until the next round replaces it.
- The same happens in a human match whenever the opponent locked first.
- The backend payload is correct. Replaying the production request order through the real backend HTTP surface (origin/master `d2d34b98`, bot driven as deployed): pre-lock poll `opponent_finished: true`, no reveal; lock POST `segment_resolved: true`, inline reveal with `canonical_order` != `order` and `position_correct` consistent with both; next GET already round 2, no reveal; resolved GET has the same canonical order. `is_correct`, `position_correct` and `canonical_order` derive from one private canonical list keyed by the same entry ids as the cards.
- The production database was not inspected (no read-only production access from this session).

### Why the FIX1 test missed it
`QuizRankedMatch.orderForgeReveal.test.tsx` hand-built a backend whose first poll after the lock is still segment N with the viewer's `own_challenge_reveals`, and its lock POST returned `{}`. A bot match never projects that poll, and `{}` hid both `segment_resolved` and the inline reveal. It tested the slower-opponent lifecycle; FIX1's timing work was unreachable in playtests.

### Implementation
| File | Change |
|---|---|
| `src/lib/ranked-public/contracts.ts` | `readOwnChallengeReveal(v, activeIndex, moduleId)`: one entry read by the existing `readChallengeReveals`, disclosure guard included. No second schema. |
| `src/lib/ranked-public/client.ts` | `SegmentChallengeAck.challengeReveal`: the ack's `challenge_reveal`, kept raw (null when absent), because the reader depends on the module. |
| `src/pages/quiz-ranked/useRankedMatch.ts` | `runSegmentAction` hands the accepted response to `onAccepted`. For an Order Forge lock only, the ack's reveal is read with `readOwnChallengeReveal(raw, ack.nextChallengeIndex, "order_forge")` and kept as `orderForgeLockReveal = {matchId, segmentNumber, reveal}`. Cleared when the match changes; replaced by the next lock. An unreadable reveal is logged and ignored. |
| `src/lib/ranked-core/orderForgeLockReveal.ts` (new) | `withInlineOrderForgeReveal(state, lock, matchId)`: a pure attach. Returns the same object unless the state is Order Forge, the match and segment number match exactly, and the snapshot has no reveal of its own for that challenge; then a shallow copy with the one entry appended. |
| `src/pages/quiz-ranked/QuizRankedMatch.tsx` | The arena surface's `segmentState` is `withInlineOrderForgeReveal(surfaceRound.segmentState, m.orderForgeLockReveal, matchId)` (memoised). Only the surface: the live controller state, card beat and every other reader are unchanged. |

Data flow after the fix: lock POST accepted -> ack `challengeReveal` -> parsed by the `own_challenge_reveals` reader -> `orderForgeLockReveal` tagged with match and segment -> attached to the frozen surface's segment N -> `orderForgeModule` sees `ownChallengeReveals[0]` -> the SAME mounted `OrderForge` goes `locked -> revealed` and plays FIX1's beat unchanged (values and marks on the submitted order, cards move at 240ms, land at 480ms). The next poll's round N+1 starts the hold; the surface stays frozen on N with the reveal through the hold, then adopts N+1, where the reveal never matches.

### Authority and security invariants
- `canonical_order`, `position_correct`, `value_display` and `is_correct` are the server's, passed verbatim. Nothing compares the orders, grades or reconstructs a value.
- The inline reveal is installed only from an ACCEPTED ack (a refusal or a network failure throws before `onAccepted`), only for an Order Forge segment, only for the ack's own segment, and it passes the same disclosure guard as a polled reveal.
- Server snapshots are never mutated. A polled snapshot that carries its own reveal wins and is never doubled.
- Untouched: `REVEAL_TIMING`, `REVEAL_HOLD_*`, `anchoredRevealHoldMs`, `reveal_window_ms`, `presentation_ms`, Journey and Mastery reveal paths (the attach is Order Forge only), the backend.

### Regression coverage
- `QuizRankedMatch.orderForgeBotLock.test.tsx` (new, 6): the real `QuizRankedMatch` + `useRankedMatch` + `CanonicalArena` + `orderForgeModule` + `OrderForge` on a fake clock, fed `__fixtures__/orderForgeBotLockCapture.json`, the bodies the REAL backend served for a wrong lock against the bot, in production order:
  - the payload is consistent, and no polled body of the segment carries the reveal (nor any value or `canonical_order` before the lock);
  - nothing reveal-only is on screen before the lock;
  - the first reveal frame is the submitted order with the server's values and marks; it becomes the canonical order on FIX1's beat; it stays canonical with values while the settlement and the NEXT round are polled, until the hold releases it (>= 400ms of dwell); "was N" on exactly the moved cards; after the release the reveal does not follow into the next segment;
  - with the lock POST delayed 400ms, nothing is revealed before it is accepted;
  - a refused (422) lock and a network failure install nothing (the refused one reopens the input);
  - a polled snapshot that already carries the same reveal (the slower-opponent lifecycle) is not doubled or contradicted.
- `orderForgeLockReveal.test.ts` (new, 8): the ack keeps `challenge_reveal` raw (null when absent); it reads verbatim through the `own_challenge_reveals` reader; the disclosure guard still refuses; attach without mutation; stale segment, stale match, missing match, another module and an existing reveal all return the same object.
- Negative control: with the four implementation files reverted to `2a434c2b` and the helper removed, the bot-lock suite fails 2/6 for the expected reason ("the reveal never reached the screen": hold on, phase `locked`, then the next round). Restored: 6/6.

### Results
| Check | Result |
|---|---|
| Focused Vitest (bot-lock, FIX1, `OrderForge`, `orderForgeModule`, `orderForgeLockReveal`, all `ranked-public`, `useRankedMatch*`, `QuizRankedMatch.segment/revealBeat/rfx1*/metaReflex*`, ranked media) | 47 files, 605/605 |
| Wider Vitest (`quiz-ranked`, `ranked-core`, `ranked-arena`, `interaction-grammar`; `--maxWorkers=4`) | 2181/2190. The 9 failures (`AnswerGrid.elimination` 2, `DailyOnCanonicalArena.boundary` 2, `QuestionStageGeometry` 3, `masterySliceModule.visualLanguage` 2) fail identically on clean `2a434c2b`. Plus the known 6 `onTaskUpdate` worker timeouts. |
| Playwright `-g "Order Forge\|OF4"` (`playwright.arena.config.ts`, Vite started from the worktree) | 40/40 |
| `tsc -p tsconfig.app.json` | 6 errors, identical to baseline, all in untouched files |
| eslint on touched files | 0 errors; the warnings are pre-existing |
| `npm run build` | success (`public/sitemap.xml` rewrite reverted) |

### Remaining limitations (unchanged, out of scope)
- The real production flow has not been replayed on a device after this fix; it needs a Lovable publish and an owner playtest (wrong lock against the bot, both segments).
- A refresh during the reveal hold loses the inline reveal (the server no longer projects it); the next round follows as before.
- Cross-round / module / match continuity, the result-stamp overlap, RMOB2, real-device certification and the `playwright.arena.config.ts` webServer command on Windows are unchanged.
