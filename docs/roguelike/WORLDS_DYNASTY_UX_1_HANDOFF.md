# Worlds Dynasty UX-1: synthetic clickable gameplay prototype

**Status:** DEV-only, SYNTHETIC flow prototype. Committed locally, **not pushed, merged or deployed**.
**Branch:** `ux/ux-1-synthetic-prototype` (child of `ux/ux-d0-dynasty-design` @ `9d4e1227`), worktree `C:\Users\mlmit\mogzy-wt\ux-1`.
**Spec:** `WORLDS_DYNASTY_UX_D0_SPEC.md` (flows, reuse map, O-1..O-11).
**Not connected to** the Combat v2 / Event E0 simulator, any backend, auth, database or real data. The Combat v2/Event Director worktree and the D1 frontend branch/PR were not touched.

## How to run
`/dev/dynasty-v2` (registered only under `import.meta.env.DEV`, so production has no such route). Options: `?seed=abc` (same seed + same choices replay identically), `?view=objectives` (objective gallery).
On this machine vite starts with `SWC_NATIVE_BINDING_CACHE=C:\swc-native-cache` and `node node_modules/vite/bin/vite.js --port <p> --strictPort`; `node_modules` is a junction to the main `mogsy` checkout (do not `git worktree remove` this worktree without deleting the junction first).

## What is covered
1. Home (resume card, seed, version pin), org select (3 orgs), choose 2 of 3 stars, 3 academy stand-ins, roster with open bench.
2. Season hub: 8 illustrative nodes (4 regular, 2 playoffs, 2 Worlds); elimination only in playoffs/Worlds (placeholder for O-3).
3. Transfer-window recruitment with swap preview and honeymoon; preparation (2 of 6 actions, previewed Confidence/Fatigue/cohesion/scouting deltas, diminishing returns).
4. Scouting tiers (committed opponent, progressively revealed), Fearless draft, composition read-out (7 tag meters, identity, max 2 strengths + 2 warnings).
5. Early/Mid/Late stages: 1-2 small events + major slot per reached stage, seven-point score (5 lanes + 2-point team), five labelled states, carried advantage ("not points"), tap-to-explain sheet (Simulation / Baseline tabs, roll strip, "their perspective").
6. Reusable `ObjectivePanel` (stakes ladder -> N questions -> outcome): Baron 3Q (post-Mid), Dragon 1Q (Early), Elder 3Q (Late, only when tight). Gallery shows Baron 0-3 (closeout on/off), Dragon 0-1, Elder 0-3.
7. Game result (per-player Confidence/Fatigue before->after with causes, cohesion, new/expired traits), BO5 tracker, between-game tactic (4 options), series result, run end legacy card.

Preserved rules: event budgets per reached stage (Early 1-2 small + 1 major; Mid 1-2 small + at most 1 major [Baron, post-stage]; Late 1-2 small + 1-2 major); Early+Mid both Winning (or both Losing) closes the game at Mid with no Late stage and no Late events; Baron 3/3 closes only when a closeout was offered; Dragon and Elder never close; Late always decides with 4+ of 7 points. Rare "1v2" event needs the rare champion on Top plus an Early lead and a Top win, and leaves an Overconfident trait for exactly the next game.

## Files (all new except one)
`src/pages/dev/dynasty-v2/`: `fixtures.ts` (synthetic orgs/players/champions/season/prep/questions), `objectives.ts` (outcome tables + ladder), `engine.ts` (seeded deterministic stand-in; keyed draws), `parts.tsx`, `ObjectivePanel.tsx`, `GameView.tsx`, `screens.tsx`, `ObjectiveGallery.tsx`, `DynastyV2Prototype.tsx`, `engine.test.ts`, `DynastyV2Prototype.test.tsx`.
Modified: `src/App.tsx` (+7 lines: DEV-gated lazy import + one DEV-gated `<Route>`, the same seam as `/dev/dynasty`). This is the only shared file touched; no CSS, auth, schema or routes outside DEV.
Reused: `RoleEmblem`, Worlds `SURFACE`/`Eyebrow`/`GOLD_TEXT`, `useMotionAllowed`, `useSfx` (existing cues only), shadcn `Sheet`/`Tabs`.

## Verification (this machine, 2026-10-18)
- `vitest`: 20 engine tests (budgets, closeout, Late finality, rare event, determinism, clamps, Fearless, prep, signing, BO5, elimination) + 13 UI tests (full clickthrough, whole 8-node run, Mid-closeout flow, reached-Late flow, explain sheet, Baron 0/1/2/3 live panel and gallery variants, Dragon/Elder, reveal timing with fake timers) all pass. Existing Dynasty suites (D1 contract/page/route) still pass: 68 tests across 5 files.
- `tsc -p tsconfig.app.json`: no errors in the new files (2 pre-existing errors elsewhere). `eslint`: 0 errors, 1 react-refresh warning for `parts.tsx` re-exports.
- `App.routeGuards` / `App.routing-contract`: 3 failures, identical with and without this change (pre-existing).
- Real browser (Playwright Chromium 1248, scripted full clickthrough at 1280x900 and 390x844, plus mobile reduced-motion): Mid-closeout and reached-Late games both completed on both viewports; 0 horizontal overflow on every captured screen; 0 console errors. Animated stage reveal took about 2.36 s (six 330 ms tiles, Skip available); with `prefers-reduced-motion` the result is immediate (about 0.1-0.4 s including the click). Escape closes the explain sheet; Enter on the focused Continue advances; focus moves to the new screen heading on navigation.
- Screenshots (local, **not committed**): `C:\Users\mlmit\OneDrive\Desktop\ux1-dynasty-shots` (`desktop/`, `mobile/`, `mobile-reduced/` per flow, plus gallery and explain-sheet images and `report.json`). The Playwright driver was a throwaway script in the session scratchpad and is not in the repo.

## Known issues and observations
- **Perfect play ends most games at Mid.** With 3/3 Baron answers a closeout fires whenever Baron is offered (Mid Even or better), so strong players rarely see Late. Qualification threshold, difficulty and frequency are unresolved (O-4); consider requiring a Kinda-winning-or-better Mid or a harder third question.
- Mirrored picks: the opponent can show the same synthetic champion as you ("Syn 01 vs Syn 01"); harmless here, decide Fearless scope (own side vs both) with the real rules.
- Elder is covered by unit tests and the gallery but was not hit in the captured browser runs (Late was not tight); Decisive teamfight was.
- Coach Call (O-5) is not in the prototype; the only tactical choice is the between-game adjustment (O-7).
- Shared `SheetContent` close button is 16 px (below the 32 px audit line); not changed (shared component).
- The global Mogzy HUD floats over the top of dev pages (as on D1); the run bar sits below it at `top-11`. A light strip shows below the page on tall desktop viewports from the site layout.
- Objective questions are placeholders about the prototype's own rules, with `data-synthetic-correct` exposed on options for tests. Production must use server-graded questions and never expose answers.
- VOD Review is marked "Knowledge" but resolves instantly; no hosted Mogzy activity is mounted.
- Balance numbers (lane/team formulas, opponent strength, effect sizes) are placeholders; the win rate across seeds is roughly in a plausible band but has not been tuned.

## Next steps
1. Owner playtest of the flow; decisions on O-1, O-3, O-4 first (see D0 spec §17) and the Baron closeout frequency above.
2. VIS-F1 (Fable 5.1 High) visual milestone, after interactions and the backend event/objective contracts are stable.
3. UX-3: replace `engine.ts` with adapters over the real COMBAT-2A/2B + E0 outputs (stage records, event ledger, effect channels); keep the screens, delete the fixtures' stand-in simulator.
4. Mount a real server-graded Ranked arena for the objective encounters (E2/KNOW-1) instead of `ObjectivePanel`'s placeholder questions.
