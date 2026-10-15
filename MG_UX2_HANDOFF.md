# MG-UX2 targeted polish — 2026-10-14

## Objective
Follow-up to draft PR #30: retain MG-UX1 component and real Ranked grading, improve phone five-tree fit, expand tall-desktop usage, and clarify the teaching reveal. No public mode rollout or shared ranked HUD redesign.

## Authoritative baseline and concurrency
- Parent: `integration/mg-ux1-current-main-20261014` @ `c11f13d2236503471ad9de3eb6eb5af5932cc2ed`; targeted changes on isolated `mg-ux2/viewport-and-teaching-20261014`.
- Main had advanced to `d72841adb886ff412c409b3692a7f8452c811387` at inspection. Main contains other concurrently owned Daily work; do not overwrite/rebase blindly.
- Changed only Match Grid layout planner, MatchGrid render and CSS, and directly associated unit tests.

## Decisions / work
- Mobile: five-tree phone waiting well uses a one-line resting label to save height; seated labels remain two lines, full rune name remains available on tap/hover/focus, and the worst-case correction panel footprint remains reserved. No attempt to reduce controls below 44px.
- Tall desktops: rail plan can use 58px artwork and up to 88px of measured row breathing when width >=640px and stage budget >=600px; short desktop and phone layout choices stay unchanged.
- Correction ledger: slightly stronger name typography and former-group contrast. Every correction's accessible name and browser title contains the **full rune/entry label, player's prior group, and canonical correct group**, including compact mode. UI visible correction rows remain fitted to their reserved sheet.
- No change to answer secrecy, timers, points, grading, question identity, or backend.

## Verification
- New tests added for roomy tall rails, five-tree phone reserved ledger height and two-line seated labels, and complete correction accessibility context.
- CI: pending. The Match Grid UX workflow in parent PR runs targeted Vitest, lint, Vite production build, and DEV Chromium continuum (desktop/phone/reduced motion).
- **Live owner Ranked host controls remain unverified:** the user-supplied 390x844 screenshot only proves the Forfeit/navigation controls were below the captured viewport, not unreachable. In a full five-tree board, preserving >=44px controls and teaching corrections may inherently require vertical scroll. Must verify scroll and tap accessibility through a real authenticated Ranked bot match before merging.
- Real backend score-oracle tests `e2e/match-grid-arena-continuity.spec.ts` and `e2e/match-grid-live-release.spec.ts` still require disposable E2E backend, persona, and oracle; previous historical passes on old main do not certify this branch.

## Next
1. Open draft PR into `integration/mg-ux1-current-main-20261014`.
2. Run its CI and review failures, update exact verified test counts.
3. Test real Ranked viewport accessibility and server grading before declaring release-ready.
4. Owner visually reviews fresh captures (not old MG-UX1 comparison images).
5. Only after acceptance, merge MG-UX2 into PR #30, then merge/publish production.

## Owner-approved teaching inspector addendum
- Original default correction ledger remains fitted, all-visible and stationary, with no added scrolling or enlarged footprint.
- On a **wrong revealed board** once the ledger is showing, the previously disabled 44px Lock/Resolved footer slot becomes an accessible **Details / Summary** toggle. Selecting Details overlays a voluntarily scrollable, full-label explanation of every incorrect placement (player's original group → server's correct group), inside the existing ledger box. The overlay never grades or submits and disappears across rounds. Exact boards retain Resolved.
- Corrected full explanations are also present as accessible labels and browser titles on individual rows.
- Stable reset uses phase and presence-of-reveal rather than reveal object reference, so server polling cannot collapse an open inspector.
- Dedicated Vitest verifies accessible toggle, complete explanations, fixed board height, and zero additional Lock callbacks.
- The in-place mobile height refinement does **not** prove global controls are visible without scrolling. Before production launch, a real authenticated owner needs to verify that Forfeit/Rules/timeline can still be reached by ordinary vertical scroll on 390×844 and 360×640. Avoid falsely claiming all controls fit at once.

## CI evidence
- First MG-UX2 code checkpoint [run 38691995426](https://github.com/mitcherrman/mogsy/actions/runs/38691995426) passed **123/123 Vitest**, lint, production build, **13/13** dev browser cases (including answer-secrecy pre-lock and 6 viewports with reduced-motion).
- The later opt-in inspector and row typography commits require **fresh CI**. Track the latest code SHA, not prior successes. No real backend scoring E2E is included.
