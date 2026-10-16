# PT4.4 — Perfect Timing: fixed viewport, champion art, cleaner frame

Frontend only (`mitcherrman/mogsy`). Branch `perfect-timing/pt44-fixed-viewport-polish`, from `origin/main` a874b272 (PT4.3 merged).
No backend change, no scoring or cooldown change, no new data system.

## What the owner reported, and what changed

| Report | Change |
| --- | --- |
| Scrolling must not exist | The mode is a fixed screen. `PerfectTimingScreen` renders through a portal into `<body>` as `position: fixed; inset: 0` and, while mounted, `useFixedViewport` sets `overflow: hidden` + `overscroll-behavior: none` on `<html>`/`<body>`, hides the app root (`#root` is `display: none` + `inert`, so the document is exactly one viewport and Tab cannot reach the header/footer underneath), swallows Space / Page / Home / End / arrow keys aimed at the page, and cancels a one-finger touch drag on the screen. Everything is restored on unmount, including the scroll position. Every state is laid out in `dvh`/`vw` clamps to FIT; nothing relies on overflow. |
| Space/Enter misbehave | Document-level Space/Enter (PT4.3) still drive armed/running. New: after the reveal settles (1.7 s, 320 ms reduced-motion) Space/Enter anywhere advance it, once, never on a repeat, never when a control/field owns the key. A key that advanced the reveal arms a 250 ms `keyGuard` on the timer, so a double-tap cannot also start the round it armed. Pointer presses are never guarded. |
| Playtest/prototype clutter | Removed: "Prototype · owner lab" badge, the amber disclaimer banner, both Ranked flank panels (run + archive), the Ranked header/eyebrow/"Hidden clock" note, the round rail, the mode-title next to Back. What is left: Back (or Exit), the round pips, the score, the stage. |
| No champion art / ability icon in the game | The main screen is now a **hero card**: champion splash crop, ability icon, spell letter (Q/W/E/R), champion, ability name, rank — plus the splash blurred behind the whole screen. The seal keeps the ability icon (it darkens while running). Splash comes from the champion manifest (`getChampionSplash`, name matched on its alphanumeric form); a missing/failed image leaves the dark card, never blocks a round. |
| Reveal/results too plain | Reveal: tier word (tier-coloured, the hero card takes the tier's glow), points, signed error, YOU / TRUE plates, the cooldown rail, one provenance line, the way on. Results: one screen — score, landed / mean / closest, Play again, and a ladder with each round's ability icon, tier colour, error bar and points; backdrop is the closest stop's champion. |

## Files

- New: `components/perfect-timing/PerfectTimingScreen.tsx` (+test), `lib/perfect-timing/useFixedViewport.ts`, `lib/perfect-timing/useSplashManifest.ts`, `lib/perfect-timing/useTimingEngine.keyGuard.test.tsx`.
- Rewritten: `PerfectTimingArena.tsx` (no `CanonicalArena`), `PerfectTimingStage.tsx` (hero + seal), `PerfectTimingReveal.tsx`, `PerfectTimingResults.tsx`, `RunLadder.tsx`, `perfectTiming.css`.
- Edited: `PerfectTimingPage.tsx`, `roundView.ts` (+ `splashUrl`), `viewModel.ts` (`splashUrl?`, `onNext(source?)`), `useTimingEngine.ts` (`keyGuard`, exported `OWNS_KEYS_SELECTOR`), `ownerArena.tsx` / `OwnerPlaytestPage.tsx` (`PlaytestLead bare`), the demo page, tests, `e2e/perfect-timing-owner.spec.ts`.
- Deleted: `arenaView.tsx`, `arenaParts.tsx`, `stageContext.ts`, `resultsModel.tsx` (the Ranked-arena projection, the flanks, the shared-results adapter).

## Layout rules

Two layouts: **wide** (≥760 px, or a landscape phone ≥560 px) puts the hero beside the seal/reveal; **narrow portrait** stacks the hero as a banner above. The seal is `clamp(110px, 100dvh − 176px, 340px)` wide / `clamp(104px, min(66vw, 76dvh − 176px), 300px)` narrow, minus 96 px when a recovery button is shown. The tier word is `min(8.5dvh, 11vw)`. The ladder's rows shrink to `minmax(34px, 62px)`.

## Verification

`e2e/perfect-timing-owner.spec.ts` (Playwright, `playwright.arena.config.ts`, vite on :8123) asserts at 1920×1080, 1440×900, 1366×768, 1280×720, 1024×600, 820×1180, 768×1024, 430×932, 390×844, 375×667, 360×640, 320×568, 844×390, 667×375, in dealing / armed / running / reveal (miss, perfect, exact) / results / voided / refused deal / failed lock: no document, screen, main or stage overflow on either axis; `<html>`/`<body>` are `overflow: hidden`; every test-id'd element is inside the viewport; Page/Home/End/arrows and the wheel move nothing; the page behind scrolls again after leaving. Screenshots: `PERFECT_TIMING_SHOTS`.
The stand-in's `lie` option answers with a truth that is a chosen fraction off the stop, to draw PERFECT and EXACT (a real press rarely lands one).

## Not done / owner calls

- Real-device check (iOS Safari rubber-band, Android Chrome URL-bar resize) is not run; the layout uses `dvh` and a `touchmove` guard, not verified on hardware.
- Hub registration, scoring, and the BE are untouched. Deploy is FE publish only.
- Unrelated failures on clean `origin/main`, unchanged by this branch: `AdminPlatformPolicies` boundary, `AdminQuizReview.proPlay` review-key, `App.routeGuards`, `App.routing-contract` (×2), `admin-registry.routes`, plus the two baseline `tsc` errors (`OnboardingProfile.tsx`, `identity/connections.ts`).
