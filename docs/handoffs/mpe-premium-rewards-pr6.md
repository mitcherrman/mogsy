# MPE Premium Rewards — Claude Handoff (2026-10-12)

## Objective and constraints
The user wants focused, *high-quality polish* across existing Mogzy (League of Legends learning game), **not** a redesign or new architecture. Specifically: compelling end-screen *card discovery and earned Academy XP* animations, synchronized sound design, contextual Mogzy mascot reactions, and consistent visual language for highlights/transitions. Reuse existing components and audio engine; implement improvements, not a planning exercise. Prioritize quality, then credits, then speed. No Docker. Do not change or overlap the separate Daily Challenge / Role Challenge / Quiz Hub selection workstream. Do not merge/deploy without review.

## Working branch and PR
- Frontend: `mitcherrman/mogsy`; base `main` observed at `8c9c1f739685121e5606342e6e585c4c47e68178` when PR started (reverify current refs).
- Branch: `mpe/premium-reward-polish-20261012`.
- Draft PR: https://github.com/mitcherrman/mogsy/pull/6
- No backend changes; do not modify reward accounting/DB.
- The frontend may have moved since this PR was opened; verify upstream/ongoing work before integration.

## Changes already committed (9 source/test files before this handoff)
1. `src/components/ranked-arena/DiscoveryReveal.tsx`: Ranked discovery panel gets gold ambient light, compact book/card glyph, nuanced hover and entry stagger, existing cheering `MogzyMascot` pose, and new audio event on positive discoveries. Uses the authoritative `MatchDiscoveriesView` contract, never computes discoveries. Quiet/no-data behavior preserved.
2. `src/lib/audio/sfx-registry.ts`: `ranked.discovery.reveal` event reuses existing `sfx.ranked.points-awarded` synth at reduced gain. This is not bespoke sound design. Source syntax was corrected after an initial editing error.
3. `src/components/game-results/ResultProgress.tsx`: warm highlight for XP/collection, subtle entry, and extra reward animation for `icon === "xp" && typeof delta === "number" && delta > 0`. XP totals, level XP and zero/negative changes never imply a new award. Does **not** count-up or fill an XP bar. No XP-specific sound.
4. `src/components/game-results/ResultSummaryStrip.tsx`: gold/blue-tinted XP/discovery cells in compact results.
5. `src/components/game-results/ResultHero.tsx`: understated reduced-motion-aware entrance fade.
6. `src/components/game-results/MogzyMatchReport.tsx`: slight entrance fade/slide, existing Mogzy pose.
7. `src/pages/dev/ranked-arena-inspector/RankedArenaInspector.tsx`: reuses pre-existing dev-only fixture harness. Adds `Replay animation` button that remounts real result components (no live match/network/database/account reward). New "RESULT — earned Academy XP (synthetic reward)" fixture explicitly supplies `delta:80` and `value:"+80 XP"` solely for preview. Discovery fixture uses a new synthetic matchId each replay so SFX can fire again. Existing states include full Rated/Bot Ranked, Practice, discoveries and no discoveries. Route `/dev/ranked-arena-inspector`, guarded by `import.meta.env.DEV`.
8. `src/pages/dev/ranked-arena-inspector/RankedArenaInspector.test.tsx`: replay and earned-XP fixture tests added.
9. `src/components/game-results/ResultProgress.test.tsx`: tests positive XP delta vs stored account total/in-match level XP/zero/negative.

## Verified facts vs unverified
- **Verified by GitHub source/diff:** above source files and draft PR exist and include intended edits. The shared `GameResultsModel` holds `ResultProgressItem` including optional signed `delta`. `src/lib/quiz/sessionResults.ts` currently maps `currentXp` to **total** account XP without delta; `src/pages/quiz-ranked/rankedResultsModel.ts` uses `player.xp` for **match level XP**, not earned Academy XP. Daily stage model `src/lib/daily-challenge/run/stageResultModel.ts` shows score, not a settled Academy XP award. Never infer earned XP from these totals. Discovery is backed by server response.
- **NOT verified:** tests passing, typecheck, build, CI, browser rendering, SFX playback policy, real user feedback, accessibility/mobile review. GitHub returned no checks or PR workflow runs when last queried. Do NOT claim production readiness.
- The added sound guard is a module-global bounded `Set<matchId>` (64 entries). It prevents refetch/StrictMode duplicate audio in a loaded client session, but does NOT prevent replay after page reload/history revisit and may emit on preview even if SFX system not ready. Review this carefully.
- A potential bug: the test environment may not satisfy the dev-only `import.meta.env.DEV` inspector guard; verify test setup.
- `ResultProgress` is full-mode only; Ranked's compact `ResultSummaryStrip` currently gets highlight but not earned-XP animation; determine desired consistent treatment without double awards.
- Existing discovery reveal lists questions but does not perform a cinematic card transfer; earlier implementation is preliminary polish. Need significant creative craft for actual request.

## Next action: quality-first takeover on existing branch
1. Read this file, PR #6 patch, and the actual call-sites of `DiscoveryReveal`, `GameResultsBody`, `ResultProgress`, `ResultSummaryStrip`, `GameResultsShell`, `useSfx`, `sfx-registry`, and the inspector. Inspect any current file-level changes from parallel work; **do not touch Quiz Hub/Role selector**.
2. Run typecheck + focused existing/new Vitest tests + build. Fix actual failures; review tests for meaningful behavior vs superficial DOM assertions. No Docker.
3. Critically review PR #6's visual quality and product behavior: animation pacing, discoverability, sound overlap with victory, repeated/revisit behavior, mobile layout, reduced motion, no layout shift, contrast, performance, and whether mascot is appropriately sized.
4. Replace preliminary polish with **genuine premium microinteractions** within existing architecture: impactful but fast discovery card moment, truthful signed earned-XP reveal/optional count-up only where persisted deltas exist, coherent transition/highlight treatment and appropriately timed, non-jarring SFX/mascot feedback. Do not invent XP gains or change reward grants. Treat live Academy XP wiring as a separate, verified integration concern if no award delta is available in existing settled data.
5. Keep fixture-based replay front-and-center, including sound replay and cases: 1 discovery, multiple, none, missing metadata, earned XP, no XP, mobile and reduced-motion. Testing a match must never be necessary for visual QA. Preserve dev-only gate and no backend writes.
6. Use local browser/preview for actual visual verification, capture screenshots/video or provide reproducible dev URL + instructions. Distinguish what's observed versus not observable.
7. Keep PR draft until tests and visual QA pass. Do not merge or deploy without authorization. Update this handoff in place at each milestone with decisions, files, test results and next task.

## Success criteria
- Players see a distinctly premium, readable card-discovery ceremony, Academy XP reward only on verified gains, tailored existing Mogzy reaction, short coordinated sound and transitions; no noisy replay on revisiting old results.
- All of it remains optional/fast, accessible under reduced-motion, works mobile, and survives refetches and reconnects without fake or duplicate rewards.
- A developer can repeatedly trigger all visual/audio states via existing inspector; no real game or persistent user changes.
- Tests/build and live visual review demonstrate quality; active Daily/Role work untouched.
