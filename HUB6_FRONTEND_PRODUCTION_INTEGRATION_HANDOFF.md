# HUB6.4B — Frontend Production Integration: handoff

Date: 2026-09-28. Scope: integrate the final HUB6 History branch onto current production `main`, reconcile semantically, certify, push. No redesign, no analytics, no backend change.

**Status:** integrated and pushed to `origin/main` (`660dbfce`). **The production site had NOT picked up the new build when this was written** (see §9). The frontend is therefore not yet certified live.

## 1. Refs

| | SHA |
|---|---|
| Starting `origin/main` | `3011a416` (USERS2.3C-Daily browser correlation) |
| Source branch `hub6/premium-analytics-final` | `45634b5b` (verified tip; not rewritten) |
| Merge-base | `dd987084` (2026-09-24) |
| Divergence | main +47, HUB6 +25 (the 25 include HUB4 → HUB5 → HUB6 → HUB6.2 → 3D → 3E v2 → 3G → 3G1) |
| Integration branch | `hub6/history-production-integration` (worktree `.worktrees/hub6-prod-int`) |
| Integration merge | `2ce5fb43` `Merge hub6/premium-analytics-final (45634b5b) …` |
| Reconciliation | `660dbfce` `fix(history): HUB6.4B production reconciliation …` |
| Pushed `origin/main` | **`660dbfce`** (fast-forward from `3011a416`) |
| Docs | this file and the HUB6_HANDOFF section: a local commit on the integration branch, **not pushed** (see §12) |
| Rollback | `3011a416`; local branch `hub6/rollback-main-pre-hub6` |
| Backend production | `League_Combat_Simulator` `origin/master` = `26ef8829` (read only) |

## 2. Overlap and semantic review

**Textual overlap (3 files).** Every other HUB6 file is untouched on main.

| File | Main changed | HUB6 changed | Final |
|---|---|---|---|
| `src/index.css` | Appended the JOURNEY-UI1 board, JOURNEY-MOTION-V1 and K2 knowledge-mark CSS at EOF | Appended the `history-*` motion blocks (HUB6.1/6.2/6.3E) at the same EOF | **Conflict, resolved by keeping both.** Main's block comes first, then HUB6's; CRLF is preserved. There are no shared selectors (`journey-*` vs `history-*`); the result is purely additive to both sides |
| `src/App.tsx` | Added the DEV `/dev/journey-arena` route and its lazy import | Made `/dev/lobby-preview` DEV-only (HUB5) | Auto-merged; both kept. The production build contains no lab or Timmy fixture strings (verified by grepping `dist`) |
| `src/lib/admin/admin-registry.ts` | USERS2.1 audience IA (sections consolidated to `audience`; two account tools merged) | The lobby-preview tool becomes `Development` / `developerOnly` | Auto-merged; both kept. Both fields exist in main's types |

**Interface review.** These are modules main changed that HUB6 calls into. All of main's changes are additive, and `tsc` is identical to baseline.

| Module | Main change | Effect on History |
|---|---|---|
| `ranked-public/contracts.ts` | J3 Journey block (strict), `combatWorking`, `correctAnswerDisplay`, ruleset strike fields | The History review uses `readMatchReview`; the new fields are optional. None |
| `QuestionReviewCard.tsx` | Journey Combat "Working" block on a revealed child | History's question Popover / Sheet now show the working for Journey Combat children. Desired |
| `daily-challenge/run/{client,contracts}.ts` | Correlation on start/launch POSTs; `strikes.live`, `ownStageFinished` | History only reads `/api/history/v1`. None |
| `quiz/api.ts`, `mastery/live/api.ts`, `ranked-public/client.ts` | `withBrowserCorrelation` on entity-creating POSTs | History's `authedRequest` GET never mints or correlates. None |
| `useAuth.tsx`, `main.tsx` | Session intelligence | Global; nothing History-specific |

**HUB6-only navigation change.** `LeaguecraftHub` redirects the legacy `#review` / `#trends` hashes to `#history` with `replace`. This is HUB4's approved one-History-surface change. Main never touched the file. Daily runtime, Journey, Ranked Hub play, the tutorial / onboarding gate and auth are untouched by HUB6.

No analytics were added. History is a reading surface under USERS2's activity lifecycle, and no `track()` calls were removed.

## 3. Reconciliation (`660dbfce`)

1. **Core Daily wording.**
   - The Core Daily history readout said "This Daily 89%" for a Core metric. It now names the metric: "Core accuracy", "Core correct", "Core longest streak".
   - Stage rooms say "This Standard", "This Time Trial" and "This Survival".
   - `LineKey` and `HistoryPanel` take the label from the caller.
   - "This Daily" remains only where the figure really is the whole Daily. The *This Daily vs previous Daily* board uses backend `previous_daily`, which is `run.basic`, i.e. all stages. The donut's "This Daily's questions" also counts every stage.
2. **Daily score note.** It now reads "Daily score isn't used for records because Review can add points after missed questions." The old "…a higher total can mean a harder day" is gone.
3. **Weak Areas cutoff.** Backend `evidence_cutoff` is the run's **creation instant** (`daily_challenge/run/service.py`: `cutoff = _ts(now)`, `plan_date = utc_date(now)`), not a midnight boundary.
   - The UTC date shown is always the plan date.
   - The copy was "before Sep 14", which implied midnight. It now reads "Chosen from your results before this Daily started on **Sep 14**."
   - The `dateBoundaryLabel` comment is corrected.
4. **Tests.** HUB6.3G #19 is updated, and two HUB6.4B tests were added: Core wording and records note; Weak Areas cutoff wording.

## 4. Architecture preserved (verified in the integrated build)

- **Collapsed History:** 10 rows, 0 regions mounted, 578 nodes and 79 SVGs per row. Identical to G1.
- **One Daily expands in place**, and every stage row stays visible.
- **Selecting a stage enriches that same row**, in this order:
  - the exact question/module rail, with outcomes and **historical public-category micro-stats** ("83% Itemization"; "General" for RG2's fallback; none for mixed modules or missing history);
  - the Free quick facts;
  - the **previous-stage comparison with exact deltas** ("100% vs 86% · 14 points higher").
- **The deeper Premium room continues underneath**, ink-ruled to the stage.
- **Question inspection:** Popover on desktop, Sheet on touch.

**Standard.** The compact macro recipe `Splash ×4 › Meta Reflex › Splash ×3 › Meta Reflex › Journey`, with authoritative art, the Journey's five children, and hover / cross-highlight ("Lighting 5 Standard questions").

**Time Trial.** "Questions played", the timeout distinction, stopwatch, records, streak, history, result × category donut and population.

**Survival.** Depth tower with previous / average / deepest, exact strike markers and list. Null `max_strikes` shows "N strikes used", no plates and no guessed 3 (probe `nullmax-390`).

**Review.** Source miss → replay → result with art. No donut.

**Weak Areas.**
- Served questions, art / category / result, the outcome tally, and the corrected cutoff.
- No donut, and no weakness / recovery claims.

## 5. Free / Premium

**Server-side gating** (backend `routes/history.py`, `resolve_capability`): Free payloads carry `analytics: null`, `upgrade_required`, and no population. The frontend decides only from `analytics_capability.state`.

The **Free** probes (1440 / 390 / 320) show rows, rails, outcomes and current facts. They show no topic %, no comparison, no room and no cohort control.

## 6. Backend contract (production `26ef8829`)

A read-only audit of the backend code against the frontend readers.

| Item | Result |
|---|---|
| `schema_version: 1`, page shape, cursor | Match |
| personal (`previous_daily`, `core`, stage `current / categories / question_history / personal`) | Match, read leniently |
| population statuses `available / insufficient / unavailable(aggregate_not_built, population_not_configured) / not_applicable` | Match. Percentile, median and histogram are nulled unless `available`; no 0th percentile, no invented median |
| `strongest_mode` | Displayed as sent, never recomputed |
| `category_history` | Match. Public categories only; raw family ids never rendered |
| `prior_exposures` / `prior_correct` null | Match. The line is omitted, and "First time" appears only on an explicit 0 |
| Survival `is_strike`, `strike_index`, null `max_strikes` / `strikes_used` | Match. No `?? 3` / `?? 0` |
| legacy `slice` | Displays as Journey |
| Weak Areas `evidence_cutoff` | Semantic mismatch, fixed (§3.3) |
| Strict-reject scan (`readQuestion` / `readStage` / `readDailyRecord` vs DB schema) | Nothing production emits can throw |

**Real production API:**
- `GET /api/history/v1` without auth returns **401**.
- In the integrated production build (`vite preview`, real Railway backend), a guest's History reads "Sign in to save and review your study record". **No** `/api/history/v1` request is made (`authedRequest` never mints on a GET). There were no History console errors; the 401s in the console are pre-existing reads, identical on mogzy.lol today.
- **Authenticated production History was not exercised.** No safe test session was available in the automation browser, and none was created. The authenticated parse is certified by the code audit plus the lab's real-backend-shaped golden.

## 7. Tests

**Full suite.** 8 sequential shards, `--maxWorkers=8`, 8 GB heap. A single full run OOM-crashes a worker on both trees.

| Tree | Files | Tests | Passed | Failed |
|---|---|---|---|---|
| Baseline `3011a416` | 683 | 10 910 | 10 829 | **77** |
| Integrated `660dbfce` | 699 | 11 308 | 11 228 | **76** |

- **74 failures are identical by ID.** The baseline list is in Appendix A.
- **Fixed by the integration (3):**
  - `LobbyPreviewPage.test` × 2 (HUB5 isolation / Role Mastery demo);
  - `syntheticRankedHistory` "cannot leak".
- **New in the full run (2):** `LobbyPreviewPage.premiumAnalytics`, "Core Daily records" and "the global distribution". Both are `STACK_TRACE_ERROR` timeouts under shard load (HUB6.3E/G's documented load sensitivity), in HUB6-only test files. **They pass in isolation.**
- **Focused isolation run** (`src/pages/dev/lobby-preview`, `src/lib/history`, `src/components/quiz/workspace`, `--testTimeout=60000`): **27 files, 628 / 628 passed.**
  - It covers: collapsed, expanded, one-open, selected rows, rail, paging, micro-stats, gating, comparison, every stage room, Popover, Sheet, cross-highlight, Escape / Clear, insufficient, `aggregate_not_built`, no / backend strongest mode, legacy Journey, null strikes / max, UTC cutoff, and exact-question history.
  - Vitest reports 1 unhandled error, `useAuth must be used within AuthProvider`, from `LobbyPreviewPage.test.tsx`. It is **identical on baseline** (a test-harness gap: the test renders the hub without `AuthProvider`).

**Per area** (full run; tests / failed, base → int):

| Area | Base | Int |
|---|---|---|
| History | 180 / 17 | 556 / 16 |
| Ranked Hub | 349 / 3 | 351 / 3 |
| Daily Challenge | 72 / 0 | 72 / 0 |
| Journey | 141 / 0 | 141 / 0 |
| Ranked runtime | 1843 / 5 | 1843 / 5 |
| Nav / routing / shell | 414 / 15 | 414 / 15 |
| Analytics / funnel / guards | 222 / 3 | 222 / 3 |
| Tutorial / onboarding | 29 / 0 | 29 / 0 |

**Static checks and build:**
- **Typecheck** (`tsc -p tsconfig.app.json`): the 2 known errors (`OnboardingProfile.tsx`, `identity/connections.ts`), identical on both trees.
- **Lint** (`eslint .`): 316 errors on both trees, **0 new** (no file gained an error). Warnings go 196 → 230, all react-refresh "only export components" in the new History files, which is the existing pattern.
- **Build** (`npm run build`): passes. Vite built in 29s, and the item / champion prerenders verified (173 champion pages). The warnings (Tailwind ambiguous classes, the dynamic-import note) are pre-existing. The regenerated `public/sitemap.xml` was reverted.

## 8. Visual certification and performance

The HUB6.3G probe (`scripts/hub63g-probe.mjs`) ran against the **integrated** dev server: 69 shots, plus 12 collapsed shots from a supplementary probe.

- **Sizes:** desktop 1280×720 and 1440×900; mobile 390 and 320; 390 and 320 at 200% text.
- **Views:** collapsed, Overview, Standard, Time Trial, Survival, Review, Weak Areas, Popover (1440 / 1280), Sheet (390 / 320 / 390 @ 200%), Free (3 views × 3 widths), `aggregate_not_built` (L7) and insufficient (L1) at 1280 / 390 / 320 @ 200%, no strongest mode, module hover, preview note, donut lock, strike lock, legacy slice, null max strikes.

**Results:**
- **Every expanded shot:** 0 page overflow, 0 region overflow, 0 elements past the region edge, and **0 text collisions** (rail, row comparison, history lines, tower, distributions, stopwatch, course, dials).
- **Touch targets:** min ≥ 44px in every touch shot. Fine-pointer controls are 24px, as accepted in HUB6.3D/E/G.
- **Popover:** inside the viewport, with its History summary visible without scrolling. **Sheets and the preview note:** inside the viewport.
- **Heights reproduce G1 exactly** (for example, Standard 1440: selected row 211, region 1519, Daily 2030; Time Trial 390 @ 200%: region 5271).
- **Collapsed at 320 @ 200%:** a 3px hit past the row edge. It is identical on the G1 branch, where it was documented as clipped `truncate` text.

**Screens inspected by eye:**
- Overview 1440: "CORE ACCURACY 89%", the mechanical note;
- Standard 390: the selected row with micro-stats and the comparison;
- Weak Areas 390: the corrected cutoff;
- not-built 1280: complete, "Not built yet" dials, no percentile;
- Sheet 390;
- Free Standard 390.

The screenshots are in the session scratchpad (`cert/`, `collapsed/`, `cert-g1/`), not committed.

**Performance** (`scripts/hub63g-perf.mjs`, dev build, 1440, four runs each, interleaved with the G1 tip `45634b5b`):

| View | Open ms median, int / G1 | Preview median | Lock median | Room nodes | ResizeObservers |
|---|---|---|---|---|---|
| Overview | 938 / 836 | 44 / 47 | 80 / 54 | 468 / 468 | 52 / 52 |
| Time Trial | 858 / 499 | 42 / 42 | 64 / 59 | 551 / 551 | 51 / 51 |
| Standard | 448 / 466 | 31 / 32 | 72 / 54 | 608 / 608 | 51 / 51 |
| Survival | 386 / 332 | — | 62 / 54 | 488 / 488 | 52 / 52 |
| Review | 434 / 351 | — | 54 / 62 | 161 / 161 | 50 / 50 |
| Weak Areas | 504 / 355 | — | — | 88 / 88 | 50 / 50 |

- **Structure is identical:** DOM, SVG and observer counts match, and no per-icon observers were added.
- **Hover preview is unchanged.**
- **Open times are noisy in dev:** int Time Trial ranged 587–1201 ms, G1 310–792 ms. The History code in the two trees differs only by the §3 wording. The integrated app also runs main's global session-intelligence listeners.
- **Not a History regression, but not proven equal either.** Profile the mature Overview and Time Trial in a production build with a real account; this was already a carried item from HUB6.3G.

## 9. Push and production

- `git push origin HEAD:main`: `3011a416..660dbfce`, fast-forward. **Succeeded.**
- **Deploy:** mogzy.lol (Cloudflare) served `index-BMVTPSSE.js` before the push, and that bundle contained `3011a416`'s code. It was still serving the same entry **20+ minutes after the push** (polled every 20s). No new deployment was observed.
  - Hosting appears to need a separate publish step (Lovable-managed; `x-deployment-id` header).
  - The session's permission guard blocked further deploy-related actions, so none were attempted.
- **Production smoke on the new build: not performed** (the build is not live). The current live site still serves the pre-HUB6 frontend. Backend `26ef8829` works with the old frontend, as it does today.

## 10. Known launch issues

1. **Blocking launch: production has not deployed `660dbfce`.** The owner needs to publish or redeploy the frontend, then run the smoke in §13.
2. **Authenticated production History is not exercised** (no safe session). Do it in the post-deploy smoke.
3. **Population has 0 qualifying observations.** Premium shows `aggregate_not_built` or insufficient copy with no percentile, as designed. It fills in as post-HUB2.4 Dailies accumulate.
4. **RG2 "General" category lines** (carried from G1).
5. **Dev open-time variance**: profile in a production build (§8).

Not blockers:
- the icon accessible name uses the raw server label "Question" for `general` (visible text says "General");
- `readCapability` would throw on a future sixth capability state;
- the frozen footer seam / ~30px lock-bar shift (carried from G/G1).

## 11. Cleanup

**Done:**
- Baseline worktree `.worktrees/hub6-prod-base` removed (its junction unlinked first).
- Preview servers for G1 (5193) and the integrated `vite preview` (5202) stopped.
- The temporary collapsed probe was deleted from the tree.
- `public/sitemap.xml` reverted.
- `/tmp` production chunk downloads deleted.
- The `hub64b-int-preview` launch entry removed.

**Not done:**
- The integrated **dev server on :5201** is still running; the permission guard refused the stop. Stop it, then remove `.worktrees/hub6-prod-int` (unlink `node_modules` first with `cmd /c rmdir`).
- The `hub64b-int-dev` launch entry is left in place for that.

**Kept until HUB6.4C:**
- `hub6/premium-analytics-final` (and its worktree);
- `hub6/history-production-integration`;
- `hub6/rollback-main-pre-hub6`;
- v1 / v2 / 3D reference branches;
- all handoffs and tests.

## 12. Commands for the owner (PowerShell)

Push the docs commit (it changes docs only):

```powershell
cd C:\Users\mlmit\OneDrive\Desktop\mogsy\.worktrees\hub6-prod-int; git push origin HEAD:main
```

Rollback, if needed after publishing. This is a revert, so no history is rewritten; the tree returns to `3011a416`:

```powershell
cd C:\Users\mlmit\OneDrive\Desktop\mogsy\.worktrees\hub6-prod-int; git revert --no-edit 660dbfce; git revert --no-edit -m 1 2ce5fb43; git push origin HEAD:main
```

## 13. Remaining closure tasks (HUB6.4C)

1. **Publish** `main` to mogzy.lol and confirm the new entry bundle contains the HUB6 History code, for example by grepping the `Quiz-*.js` chunk for "Daily score isn't used for records".
2. **Production smoke with a real account:**
   - the Ranked Hub loads, and History collapsed renders;
   - a Daily expands, a stage can be selected, and the Premium room mounts;
   - the population empty / insufficient state shows;
   - Popover / Sheet question inspection works;
   - back navigation works;
   - the console has no History errors.
3. **Production-build profile** of Overview and Time Trial open.
4. Stop the :5201 dev server and remove the integration worktree.
5. Retire the v1 / v2 / 3D / 3F worktrees and branches once closure signs off.

## Appendix A — baseline failing test IDs (`3011a416`, 77)

- src/App.routing-contract.test.ts :: retired legacy multiplayer routes redirects the in-game route instead of rendering it
- src/App.routing-contract.test.ts :: retired legacy multiplayer routes redirects the lobby instead of rendering it
- src/components/FriendActionMenu.invite.test.tsx :: FriendActionMenu — Invite to Stat Check is hidden by default
- src/components/FriendActionMenu.invite.test.tsx :: FriendActionMenu — Invite to Stat Check is hidden for a pending request even though a friendship row exists
- src/components/FriendActionMenu.invite.test.tsx :: FriendActionMenu — Invite to Stat Check is shown for an accepted friend
- src/components/FriendActionMenu.invite.test.tsx :: FriendActionMenu — Invite to Stat Check keeps Report and Block available alongside the invite
- src/components/FriendActionMenu.invite.test.tsx :: FriendActionMenu — Invite to Stat Check reports the feature being disabled without navigating
- src/components/FriendActionMenu.invite.test.tsx :: FriendActionMenu — Invite to Stat Check sends the invite by profile id and navigates to the existing room route
- src/components/FriendActionMenu.invite.test.tsx :: FriendActionMenu — Invite to Stat Check surfaces a server-side block rejection without naming the block
- src/components/FriendActionMenu.invite.test.tsx :: FriendActionMenu — Invite to Stat Check surfaces a server-side friendship rejection
- src/components/profile/LeagueProfileStats.test.tsx :: LeagueProfileStats — activity states guest with real device-local activity keeps the truthful full progress view
- src/components/question-surface/QuestionMotifLayer.qf1.test.tsx :: QuestionMotifLayer Champion/Combat is unchanged by the Rift art
- src/components/quiz/play-scroll/playModeCard.styles.test.ts :: CHOOSE MODE holds one line steps DOWN on the narrowest sheet rather than wrapping
- src/components/quiz/play-scroll/playModeCard.styles.test.ts :: the streak's glint moves nothing but light, so it can never shift the layout
- src/components/quiz/workspace/QuestionTimeline.test.tsx :: MALT B1 — the anchored review popover closes on Escape
- src/components/quiz/workspace/QuestionTimeline.test.tsx :: MALT B1 — the anchored review popover closes on a click away
- src/components/quiz/workspace/QuestionTimeline.test.tsx :: MALT B1 — the anchored review popover closes when the reader pages the timeline out from under it
- src/components/quiz/workspace/QuestionTimeline.test.tsx :: MALT B1 — the anchored review popover is a WIDE inspector, bounded to the viewport
- src/components/quiz/workspace/QuestionTimeline.test.tsx :: MALT B1 — the anchored review popover is reachable and operable from the keyboard
- src/components/quiz/workspace/QuestionTimeline.test.tsx :: MALT B1 — the anchored review popover is review, not replay — nothing in the card is answerable
- src/components/quiz/workspace/QuestionTimeline.test.tsx :: MALT B1 — the anchored review popover keeps a very long question, choices and working inside the same box
- src/components/quiz/workspace/QuestionTimeline.test.tsx :: MALT B1 — the anchored review popover opens from the clicked icon and shows question, answers and why
- src/components/quiz/workspace/QuestionTimeline.test.tsx :: MALT B1 — the anchored review popover prints the SHIPPED explanation shape, not a flattened one
- src/components/quiz/workspace/QuestionTimeline.test.tsx :: MALT B1 — the anchored review popover returns focus to the icon that opened it
- src/components/quiz/workspace/QuestionTimeline.test.tsx :: MALT B1 — the anchored review popover reviews a Meta Reflex block as its cards
- src/components/quiz/workspace/QuestionTimeline.test.tsx :: MALT B1 — the anchored review popover says a sealed round is sealed rather than showing an empty answer
- src/components/quiz/workspace/QuestionTimeline.test.tsx :: MALT B1 — the anchored review popover shows NO internal metadata — no formula id, no rounding rule, no keys
- src/components/quiz/workspace/QuestionTimeline.test.tsx :: MALT B1 — the anchored review popover swaps to the other question rather than stacking two cards
- src/components/ranked-arena/AnswerGrid.elimination.test.tsx :: there is exactly one answer-rendering path no second INTERACTIVE component is named as an answer grid
- src/components/ranked-arena/AnswerGrid.elimination.test.tsx :: there is exactly one answer-rendering path only the canonical grid emits answer tablets
- src/components/ranked-arena/QuestionStageGeometry.test.tsx :: answering begins at the server's boundary keeps the boundary the SERVER's, never a local constant's
- src/components/ranked-arena/QuestionStageGeometry.test.tsx :: nothing inside the card was made smaller to fit it keeps the answer tablet's own box
- src/components/ranked-arena/QuestionStageGeometry.test.tsx :: the arena owns the footprint, and it owns it once is applied by the arena alone — no mode carries the class
- src/lib/feedback/contract.test.ts :: entry intent to type mapping mirrors normalize_feedback_submission()
- src/lib/feedback/contract.test.ts :: feedback contract mirrors the database CHECK constraints entry intents match feedback_entry_intent_check
- src/lib/feedback/contract.test.ts :: feedback contract mirrors the database CHECK constraints reproducibilities match feedback_reproducibility_check
- src/lib/feedback/contract.test.ts :: feedback contract mirrors the database CHECK constraints severities match feedback_severity_check
- src/lib/feedback/contract.test.ts :: feedback contract mirrors the database CHECK constraints types match feedback_type_check
- src/lib/identity/username.contract.test.ts :: the reserved list matches on both sides names the same words
- src/pages/Quiz.rankedRole.test.tsx :: the lobby and the record share one role selection commits NOTHING for Practice after a role change
- src/pages/admin/AdminPlatformPolicies.test.tsx :: Phase 1 boundary: the navbar policy is stored, not consumed no file outside the policy module and admin panel mentions the key
- src/pages/admin/AdminQuizReview.proPlay.test.tsx :: Admin — current Pro Play specimens emits a --review-key command and no credential
- src/pages/dev/lobby-preview/LobbyPreviewPage.test.tsx :: Timmy demo — isolation from production state is imported by the preview page ALONE, so no product surface can reach it
- src/pages/dev/lobby-preview/LobbyPreviewPage.test.tsx :: the Role Mastery score is DEMO-ONLY is SUPPLIED by the preview page alone; the hub only forwards it
- src/pages/dev/lobby-preview/syntheticRankedHistory.test.ts :: the fixture cannot leak into production is imported by nothing outside the preview route
- src/pages/dev/stat-check/StatCheckPage.test.tsx :: StatCheckPage item system UI auto-expands the dock when a new item is acquired
- src/pages/dev/stat-check/StatCheckPage.test.tsx :: StatCheckPage item system UI keeps an armed item visible by refusing to hide the wells
- src/pages/dev/stat-check/StatCheckPage.test.tsx :: StatCheckPage item system UI labels the lever without rendering any text on it
- src/pages/dev/stat-check/statCategoryIcons.test.tsx :: icon-only category plaque exposes the complete written category on the symbol control
- src/pages/welcome/tomeGeometry.test.ts :: WE1 — the painted spread compacts by its own width asks the tome, not the viewport, how much room the dense pages have
- src/pages/welcome/tomeGeometry.test.ts :: WE1 — the painted spread compacts by its own width brings the finale graph's floor down with the book
- src/pages/welcome/tomeGeometry.test.ts :: WE1 — the painted spread compacts by its own width takes nothing away from the register but its air
- src/pages/welcome/tomeGeometry.test.ts :: WE1 — the phone sheet is a budget, not a suggestion never sets a body font-size in the short-height blocks
- src/pages/welcome/tomeGeometry.test.ts :: the control rows reserve their height keeps both rows out of the column's own flexing
- src/pages/welcome/tomeGeometry.test.ts :: the turning sheet is the book's own paper cuts both faces out of the painting rather than inventing a beige
- src/test/guards/noStaticLeagueFacts.test.ts :: no static League facts in production frontend source declares no non-empty correct_answer literal outside tests and fixtures
- src/test/guards/users1AudienceIdentity.test.ts :: USERS1 guard · classification is metadata, never authorization is read by no gate, entitlement or rate limiter
- src/test/guards/users1AudienceIdentity.test.ts :: USERS1 guard · classification is metadata, never authorization promotes to human from exactly one module, through the RPC
- src/test/security/adminNotificationReadsMigration.test.ts :: applied migrations stay byte-identical to what production ran leaves the already-applied 20260802120000 migration byte-identical
- src/test/security/adminNotificationReadsMigration.test.ts :: applied migrations stay byte-identical to what production ran pins the Phase 2 migration itself
- src/test/security/feedbackFoundation.test.ts :: FB1 migration — anonymous submitter retention does not touch the anonymous purge system
- src/test/security/feedbackFoundation.test.ts :: FB1 migration — anonymous submitter retention retains no personal data about a purged submitter
- src/test/security/feedbackFoundation.test.ts :: FB1 migration — privacy model leaves the admin RPC and the notification trigger untouched
- src/test/security/feedbackPrivileges.test.ts :: RLS stays as the independent boundary does not rewrite the project's default privileges
- src/test/security/feedbackPrivileges.test.ts :: RLS stays as the independent boundary leaves feedback_upvotes alone
- src/test/security/feedbackPrivileges.test.ts :: RLS stays as the independent boundary leaves the notification trigger intact
- src/test/security/feedbackPrivileges.test.ts :: direct table reads are closed does not fall back on column-level REVOKE, which is a no-op here
- src/test/security/feedbackPrivileges.test.ts :: shipped operations still work does not touch service_role
- src/test/security/pt14EntitlementSources.test.ts :: no product surface gates on the raw Stripe column only admin tooling, the entitlement lib and tests mention is_pro
- src/test/security/pt14EntitlementSources.test.ts :: writer invariant: every executable is_pro write is Stripe-owned only the two Stripe edge functions write is_pro at runtime
- src/test/security/pt17bBuilderBoundaries.test.ts :: PT1.7A's Free surfaces are untouched keeps the curated Packs, the subject rail and Time Trial visible
- src/test/security/pt2eProfileThemeAuthority.test.ts :: PT2E — profile theme server authority the fence catches its own removal deleting the theme check aborts the migration
- src/test/security/pt2eProfileThemeAuthority.test.ts :: PT2E — profile theme server authority the fence catches its own removal dropping Global Premium Access from the decision aborts the migration
- src/test/security/pt2eProfileThemeAuthority.test.ts :: PT2E — profile theme server authority the fence catches its own removal dropping PT2C's frame check aborts the migration
- src/test/security/pt2eProfileThemeAuthority.test.ts :: PT2E — profile theme server authority the fence catches its own removal dropping custom_theme from the League contract aborts the migration
- src/test/security/pt2eProfileThemeAuthority.test.ts :: PT2E — profile theme server authority the fence catches its own removal dropping the canonical entitlement rule from the decision aborts the migration
- src/test/security/pt2eProfileThemeAuthority.test.ts :: PT2E — profile theme server authority the fence catches its own removal publishing user_id on the League contract aborts the migration
