# Worlds Dynasty VIS-F1: premium game visuals

**Status:** DEV-only, SYNTHETIC. Visual layer over the UX-1 flow prototype. Committed locally, **not pushed, merged or deployed**.
**Branch:** `vis/vis-f1-premium-visuals` (child of `ux/ux-1-synthetic-prototype` @ `b3d70cfc`), worktree `C:\Users\mlmit\mogzy-wt\vis-f1` (`node_modules` is a junction to the main `mogsy` checkout; delete the junction before any `git worktree remove`).
**Inputs:** `WORLDS_DYNASTY_UX_D0_SPEC.md`, `WORLDS_DYNASTY_UX_D0_HANDOFF.md`, `WORLDS_DYNASTY_UX_1_HANDOFF.md`, the updated master plan (2026-10-17, §§7, 11, 16–21), the E1 snapshot API (read; no integration attempted since there is no route), and the UX-1 source.
**Not touched:** the UX-1 worktree, any backend worktree, `src/App.tsx`, auth, schemas, production routes, shared CSS (`src/index.css`) and shared components. The route is still `/dev/dynasty-v2`, registered only under `import.meta.env.DEV`.

## 1. Visual direction: "the broadcast package"

One cohesive direction, no competing prototypes. Dynasty reads as a championship broadcast on Mogzy's established navy / gold, not as a dashboard:

- **Atmosphere.** A fixed backdrop with one warm stage light from the top, a cool counter-light at the foot, a deep vignette and a fine grain, all CSS. The light's hue is the **mood**: cool dawn blue for Early, gold for Mid, ember for Late, orange for Dragon, violet for Baron, ice for Elder, bright gold for victory, cold grey-blue for defeat. A gold hairline sits at the top of the frame.
- **Type.** Cinzel (already loaded by the app) for every display line: screen titles, stage names, result words, the stage score, org names and monograms. Inter for everything else. Gold-gradient Cinzel is reserved for the home title, closeouts and victory words.
- **Plates.** The Worlds `SURFACE` idea, extended: `dyn-plate` (navy gradient, hairline, inset top light), `dyn-plate--ornate` (gold corner marks, used only for hero cards: org cards, objective encounters, stakes, result heroes, legacy card), `dyn-plate--accent` (the chosen org's colour washes in from the corner) and `dyn-plate--selected`.
- **Identity.** Each org has an accent (Ember Wing warm orange, Tidal Forge teal, Gale Court violet), a hex **crest** with a Cinzel monogram and a motto. The accent follows the run: resume card, run bar crest, signed-player rings. Players have **monogram portraits** whose ring says star (gold, starred), academy (dashed) or signed (accent). Objectives have inline-SVG **sigils**: Dragon (ember diamond), Baron (violet horns and eye), Elder (ice crown), teamfight (crossed blades).
- **Gauges.** Confidence is five gold diamonds; fatigue five bars that go from cool to hot; phase skill three labelled bars; the seven points are five lane pips plus a double-width team pip; the lead meter is a bipolar track with a glowing diamond marker and a fill from centre. The five states are stamps: Winning is a filled gold pill with a glow, Losing a filled red pill, the three between are outlined.
- **No external imagery.** Everything new is CSS or inline SVG. Reused Mogzy assets: Ranked role emblems, the Mogzy mascot plates (cheering / defeated, compact WebP derivatives) on result, series and legacy heroes. No champion art is needed for synthetic champions. Nothing was downloaded.

## 2. Animation language

All motion lives in `vis.css` (keyframes prefixed `dyn-`) or behind `useMotionAllowed()`. Every keyframe's resting frame is the final design, so reduced motion simply removes it.

| Moment | Motion | Duration |
|---|---|---|
| Screen entrance | rise 12 px + fade; staggered children (`--i`) | 420 ms, 60 ms steps |
| Stage reveal | lanes 330 ms apart (unchanged from UX-1, Skip kept); a won tile flashes gold and lifts, a lost tile sinks and desaturates; pending tiles breathe | 520 ms per tile |
| Score published | the numeral counts up (rAF) and bumps; seven pips tick in; the state label **stamps** in (scale 1.45 → 1 with a blur); Late shows a "Game won / Game lost" verdict stamp instead of a state | 380–520 ms |
| Lead meter | marker and fill glide | 520 ms |
| Events | cards rise in sequence; a rare play gets a one-time gold sheen around its border | 900 ms sheen |
| Encounter | the sigil breathes slowly while stakes or questions are open; the four stakes rows cascade in; a right answer rings green, a wrong one shakes | 3.2 s breathe (loops, the only looping motion besides the victory rays), 70 ms cascade |
| Outcomes | four distinct arrivals: **exceptional** (gold burst ring + light sweep), **success** (soft rise), **partial** (amber double pulse), **disaster** (overshoot, jolt, desaturation dip) | 520–760 ms |
| Condition deltas | rows rise in sequence; diamonds and fatigue bars fill from before → after in place; the delta chip pops | 520 ms fill |
| Heroes | the result word arrives from wide tracking and blur; victory plates carry slow rotating gold rays; defeat plates desaturate | 700 ms word, 22 s rays |
| Match point | the pill pulses | 1.8 s |
| Primary button | a slow light sweep marks the one thing to tap next ("beckon") | 3.6 s |

Ordinary actions stay fast: every hand-off is a single tap, reveals are skippable, nothing blocks input, and there is no interstitial cinematic. Nothing shakes the screen.

## 3. Layout rules

- **Focus stage.** The game view shows exactly one live thing below the header, stage strip and lead meter: events → major → score → objective → closeout. Resolved events collapse into chips with a Ledger sheet; a published tally collapses to one line while the Baron is on the table. On phones, the events chips and the published strip hide during a question encounter so the encounter is the whole screen.
- **Scoreboard.** The six contests are a five-column board plus a team row at every width (desktop no longer uses a tall row list).
- **Width.** Content column is `max-w-4xl` (896 px). Phones get 16 px gutters.
- **Scroll.** The flow scrolls to the top on every screen change and on every game step or encounter phase change (UX-1 kept the scroll position, which left the next step off-screen).
- **Run bar.** Crest + org name (name hidden below `sm`), node label, series score, cohesion, roster sheet.

## 4. Screens

1. Home: gold Cinzel title, resume card with crest and accent, "new campaign" plate with the four-step loop, "the road" summary, version pin.
2. Org select: three ornate accent cards with crest, motto, trait, strength/weakness chips, star-candidate monograms.
3. Stars / roster / recruit: monogram player cards, phase bars, condition gauges, selected-plate glow; recruit swap preview with monograms and the honeymoon chip. Roster screen is two columns on desktop.
4. Season: a numbered path (vertical rail on phones, 4 × 2 grid on desktop) with connectors; done nodes show W / L, the current node glows, Worlds nodes carry a spark.
5. Prep: six action cards with stage chips; selected cards glow; condition preview plate.
6. Scout: a dossier plate with the tier pips, identity tags, locked weakness and five lane cards (hidden lanes dimmed).
7. Draft: role rows with monogram + emblem + "Locked" chip, champion chips (scroll on phones), Fearless strike-through list, composition read-out with two-segment tag meters.
8. Game: see §3; closeout hero; Late verdict stamp; explain sheet and ledger sheet restyled.
9. Objective encounters: banner with sigil, stakes ladder (3/3 row gold, 0/3 row red), A/B/C options with right / wrong motion, the four outcome arrivals.
10. Game result: Victory / Defeat hero with mascot, BO5 pips with the match-point pulse, stage timeline tiles, animated before → after condition rows.
11. Between-game tactic, series result (per-game W / L tiles), run end: legacy card with crest, series record strip, roster monograms, a crown for champions, cheering / defeated mascot.
12. `?view=objectives` gallery restyled; new `?view=showcase` puts the rare states side by side (both closeouts, Baron 3/3, 0/3, 1/3, Elder 3/3, victory and defeat results, won and lost series, champions and eliminated legacy cards) with a "Replay motion" button, so reviewers and video capture do not have to replay a run to reach them.

## 5. Files

New: `src/pages/dev/dynasty-v2/vis.css`, `src/pages/dev/dynasty-v2/Showcase.tsx`, this handoff.
Modified (all inside `src/pages/dev/dynasty-v2/`): `parts.tsx`, `screens.tsx`, `GameView.tsx`, `ObjectivePanel.tsx`, `ObjectiveGallery.tsx`, `DynastyV2Prototype.tsx`, `DynastyV2Prototype.test.tsx`.
Unchanged: `engine.ts`, `fixtures.ts`, `objectives.ts`, `engine.test.ts`, `src/App.tsx`, everything outside the folder.

Preserved from UX-1: every flow, rule, test id and `data-*` attribute the tests use; the 330 ms reveal rhythm; `useMotionAllowed`, `useSfx` cues; the shadcn `Sheet` / `Tabs`.

## 6. Verification (this machine, 2026-10-19)

- `vitest src/pages/dev/dynasty-v2`: 20 engine + 18 UI tests pass (the 13 UX-1 UI tests unchanged, plus 5 VIS-F1 tests: showcase renders its heroes; org accent and mood follow the run; the published tally collapses during the Baron and Late shows the verdict stamp; the lead marker stays inside the track at the caps; with motion off there is no reveal delay and no motion class in the DOM).
- `tsc -p tsconfig.app.json --noEmit`: no errors in `dynasty-v2`. `eslint src/pages/dev/dynasty-v2`: 0 errors, 6 `react-refresh/only-export-components` warnings in `parts.tsx` (constants exported next to components; UX-1 had one).
- Browser: the Claude desktop app's built-in browser pane against the local vite server (`.claude/launch.json` entry `vis-f1`, port 5420). No installed Edge / Chrome and no Playwright were launched, per `AGENTS.md`. Full flow home → org → stars → roster → season → transfer → prep → scout → draft → Early (events, Dragon 1Q, reveal) → Mid (reveal, Baron 3Q) → Late (events, teamfight, reveal) → result → tactic at 1280×860; home → draft → Early → Mid → Baron 3/3 closeout → result at 390×844 and 360×780. `document.documentElement.scrollWidth === innerWidth` on every checked screen (no horizontal overflow). Console: no errors.
- Phone fit (bottom of the game block vs viewport): Early events 686 / 844; Dragon stakes 790 / 844; Early scored 820 / 844; Baron stakes at 360×780 787 / 780 after the phone focus rules; Baron question 763 / 780; Baron 3/3 outcome 710 / 780; closeout 708 / 780. The result and roster screens scroll by design.
- Reduced motion: see §7.
- Screenshots (local, **not committed**): `C:\Users\mlmit\OneDrive\Desktop\vis-f1-dynasty-shots\` (`baseline/` UX-1 home, `desktop/` 27 frames, `mobile-390/`, `mobile-360/`).

A caveat on captures: the pane was hidden behind the conversation during this session, which throttles CSS animations, so several frames caught an entrance mid-animation (dim or empty content). The second screenshot of each pair is the settled frame; "Replay motion" on the showcase re-runs the entrances on demand.

## 7. Reduced motion

Two switches feed `useMotionAllowed()` (OS `prefers-reduced-motion` and the app's `html.reduce-motion` class). With either set: no entrance, stagger, stamp, tile, sheen, breathe, rays or count-up classes are applied (JS gate), and `vis.css` additionally forces every `.dyn` animation and transition to 0.001 ms (CSS gate), so the resting frame is shown immediately. Reveals show all six tiles at once (UX-1 behaviour), the delta gauges show the "after" state at once, and the mood light still changes colour (a background-image change, not a motion). Verified in jsdom by the new test, and in the browser on the showcase at 360×780 by adding `reduce-motion` to `<html>` at runtime: the entrance, stagger, stamp, outcome, hero-word and beckon classes drop out of the DOM on the next render, computed `animation-duration` on the remaining CSS animations (pips, victory rays) reads `1e-06s`, and the closeout plate is at opacity 1 immediately. Removing the class brings the motion classes back.

## 8. Known issues and observations (not fixed here; gameplay or out of scope)

- Causes on the result screen can repeat ("Fatigue, all starters, Fatigue, all starters") when two events apply the same effect; the engine joins cause labels verbatim. A UX-3 concern.
- Perfect play still ends most games at Mid (UX-1 observation stands); the showcase makes the closeout reviewable without replaying.
- The explain sheet keeps UX-1's content; only type and chrome changed. The shared `SheetContent` close button is still 16 px.
- The global Mogzy HUD still floats over the top of the page; the run bar sits below it at `top-11`.
- `motion-safe:` Tailwind utilities were replaced by explicit classes gated on `useMotionAllowed()` inside this folder, so the app's own Reduce Motion setting now disables them too (UX-1 only honoured the OS query for those).
- The ornate corner marks use `::before/::after` on the plate, so a plate that also needs its own pseudo-elements (the hero rays) layers them: `dyn-hero--victory::before` replaces the top-left corner mark on victory heroes. Intentional, but worth knowing.

## 9. Next steps

1. Owner playtest of the look on a real phone (video capture at 390 × 844 is the target).
2. Dedicated `dynasty.*` audio cues to match the four outcome arrivals (v1 reuses Ranked cues).
3. When UX-3 wires the E1 snapshot: the `events[]` beat order maps directly onto the focus stage (event_revealed → cards, stage_tally → reveal, objective_prompt → encounter, settlement → closeout / result); `effects[].channel` maps onto the existing effect chips; `outcomes[4]` is the stakes ladder.
4. A legacy-card image export (SOCIAL-1) can reuse the ornate plate as-is.
