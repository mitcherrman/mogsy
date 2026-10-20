# Worlds Dynasty VIS-F2: the cinematic esports journey

**Status:** DEV-only, SYNTHETIC. A worldbuilding and presentation pass over VIS-F1. Committed locally, **not pushed, merged or deployed**.
**Branch:** `vis/vis-f2-cinematic-journey` (child of `vis/vis-f1-premium-visuals` @ `3d79759c`), worktree `C:\Users\mlmit\mogzy-wt\vis-f2` (`node_modules` is a junction to the main `mogsy` checkout; delete the junction before any `git worktree remove`). Dev server: `.claude/launch.json` entry `vis-f2`, port 5421.
**Inputs:** `WORLDS_DYNASTY_VIS_F1_HANDOFF.md`, the UX-D0 spec and UX-1 handoff, the master plan (§§11, 16, 21), and the Mogzy asset registry (`src/components/mascot/mascot-assets.ts`, `public/assets/ranked`, `public/images/lol-hub`).
**Not touched:** engine, fixtures, objectives, `src/App.tsx`, auth, schemas, production routes, shared CSS and shared components, backend contracts. Route still `/dev/dynasty-v2`, DEV only.

## 1. Direction: one journey, five languages

VIS-F1 made Dynasty a broadcast package. VIS-F2 gives it **places, people and a crowd**, in one direction that combines:

- **Broadcast presentation.** Stingers (short title plates) for every signature moment, an LED ribbon with both team names over the stage, a crowd meter, and two fictional casters (SYN-Lyra, analyst; SYN-Dax, play-by-play) who pop in with one line at the right beat.
- **Story / comic-panel framing.** `StoryBeat` strips of two or three panels with captions for the special beats: a new campaign, a signing, the Worlds Final intro, the championship, the run's end. Never modal, always skippable, folded to a one-line caption afterwards.
- **Strategy-game readability.** The tactical screens keep VIS-F1's focus-stage rules; the new layers sit around the decision, never on it. Champion cards carry class glyph, phase curve, tags and a relevance tag; player cards carry hierarchy, form, fatigue heat and pressure.
- **Team HQ / gaming-house atmosphere.** Seven **locations** painted behind the screens: Team HQ, practice room, war room, arena tunnel, main stage, backstage, trophy hall. A scene caption ("Team HQ · the gaming house") names the space on every non-game screen.
- **Live stadium spectacle.** The game plays on the main stage: light rig with slow-sweeping beams, crowd silhouettes, the LED ribbon, the crowd meter that rises with the lead and with a Baron on the table. The first beat of a series' first game plays in the **tunnel** ("Walking out"), and the next tap steps onto the stage.

Nothing new is external imagery: Mogzy's own chamber and classroom art sit behind the HQ and practice room, Mogzy's painted mascot poses are the casters, chat avatar and hero figures, and everything else is CSS / inline SVG through named media slots (§5).

## 2. What changed, by screen

| Screen | Location | VIS-F2 additions |
|---|---|---|
| Home, org select, stars | Team HQ | HQ scene (Mogzy chamber art, washed); org choice fires the **org stinger** (crest name + trait). |
| Roster | Team HQ | **"A new campaign" story beat** (crest, house, road), run-start stinger, caster line, **hierarchy player cards** (stars large and ornate, academy small). |
| Season hub | Team HQ | scene + caption. |
| Transfer window, prep | Practice room | classroom art; a signing fires a stinger and shows the **"Signed" story beat** + caster line on the prep screen. |
| Scout, draft | War room | lit map-table scene; **champion cards** (class glyph, phase curve, tags, proficiency, Locked / used states, relevance tags "Rare play possible" and "Matches their tempo"); **finals intro** story beat and caster line before game 1 of the Worlds Final; draft lock fires a stinger. |
| Game | Tunnel → Main stage | LED ribbon with both teams and the crowd meter; casters at stage open and at the published score; objective **stingers** (Dragon ember, Baron violet, Elder ice, teamfight gold). |
| Objective encounters | (on stage) | the panel header is a **map moment**: a pit with the objective's light rising from below, a mist layer and ring, a bigger breathing sigil; caster at stakes; on the outcome the pit washes gold / green / amber / red, a result stinger fires, caster and chat react. |
| Game result, tactic, series | Backstage | bulb-row scene; caster line and a **chat burst** (match-point chat when it applies); game, match-point and series stingers. |
| Run end | Trophy hall | spotlight scene; **championship** or **run-defeat** story beat; a rising gold **trophy** for champions; caster and chat; championship / run-over stinger. |
| Showcase (`?view=showcase`) | switchable | scene switcher with slot info, a board that fires every stinger, a story beat, casters, chat, crowd meters, hierarchy player cards and champion cards, plus everything from VIS-F1. |

## 3. Systems added (all inside `src/pages/dev/dynasty-v2/`)

- `media.ts`: the **media slot registry** (§5), scene metadata, and `pick()` (a deterministic hash used only for broadcast copy; engine draws untouched).
- `scenes.tsx`: `Scene` (fixed backdrop layer per location + caption).
- `broadcast.tsx`: `StingerHost` / `useStinger` (one plate at a time, auto-dismiss, click to dismiss, `aria-live`), `CasterPop` (deterministic line per moment and key), `ChatBurst` (fictional handles and messages per moment), `CrowdMeter` / `crowdLevel`.
- `story.tsx`: `StoryBeat` (non-modal, skippable, folds to a caption) and `PanelArt` (eight SVG panel motifs).
- `cards.tsx`: `PlayerCard` (hierarchy, form ring, fatigue heat, pressure badge, Overconfident / Honeymoon chips, spotlight), `ChampionCard`, `ClassGlyph` (six classes), `PhaseCurve`.
- `vis-f2.css`: scene washes, crowd, rig beams, stinger tones, caster / chat / crowd motion, comic panels, cards, pit layers, LED ribbon, trophy.
- Modified: `DynastyV2Prototype.tsx` (StingerHost, scene per screen, signature stingers), `GameView.tsx` (tunnel/stadium, ribbon, crowd, casters, objective stingers), `ObjectivePanel.tsx` (pit, casters, chat, result stinger), `screens.tsx` (cards, beats, casters, chat, trophy), `Showcase.tsx`, `DynastyV2Prototype.test.tsx` (+5 tests).

## 4. Signature moments → treatment

| Moment | Stinger | Story beat | Caster | Chat | Other |
|---|---|---|---|---|---|
| New run start | "Welcome to the house" | A new campaign (3 panels) | run.start | | HQ scene |
| Org choice | org name + trait | | | | |
| Recruit / sign | "Signed · name" | Signed (2 panels) | player.sign | | practice scene |
| Draft lock | "Draft locked · Walk out." | | | | tunnel scene on the next screen |
| Objective appearance | Dragon / Baron / Elder / teamfight, toned | | objective.offer | | pit map moment, crowd meter up |
| Objective result | outcome title, toned by tier | | objective.result | burst | pit wash by tier, four outcome arrivals (F1) |
| Game result | Victory / Defeat + series score | | game.win / loss | burst | backstage scene |
| Series point | "Match point" | | | match-point chat | pulse on the BO5 pips (F1) |
| Finals intro | (series stinger chain) | Worlds Final (3 panels) | finals.intro | | |
| Championship win | "Champions" | Champions (3 panels) | championship | burst | trophy rises, rays (F1), trophy hall |
| Run defeat | "The run ends here" | The run ends (2 panels, cold) | run.defeat | burst | trophy hall, defeat hero |

## 5. Media slots introduced

All art goes through `MEDIA_SLOTS` in `media.ts`. `fill` says what paints it today; `brief` is the production-art request.

| Slot | Today | Brief |
|---|---|---|
| `scene.hq` | Mogzy asset `/assets/ranked/ranked-academy-duel-bg-960w.webp` (washed) | Gaming-house common room at night |
| `scene.practice` | Mogzy asset `/images/lol-hub/leaguecraft-classroom-bg.png` (washed) | Scrim room, five glowing monitors |
| `scene.warroom` | CSS/SVG (map grid, table rings) | War room with lit map table and dossier |
| `scene.tunnel` | CSS/SVG (perspective frames, light at the end) | Players' tunnel |
| `scene.stadium` | CSS/SVG (truss, five beams, crowd silhouettes) | Stadium with LED ribbon and crowd |
| `scene.backstage` | CSS/SVG (bulb row, cases) | Backstage with a replay monitor |
| `scene.trophy` | CSS/SVG (spotlight cone, pedestal) | Trophy hall |
| `caster.analyst` | Mogzy `mogzy-explaining` (192 WebP) | Fictional analyst portrait |
| `caster.hype` | Mogzy `mogzy-raising-hand` (192 WebP) | Fictional play-by-play portrait |
| `chat.avatar` | Mogzy `mogzy-peeking` (192 WebP), reserved | 6–8 fictional viewer avatars |
| `hero.victory` / `hero.defeat` | Mogzy cheering / defeated plates (F1) | Team celebration / quiet backstage key art |
| `objective.dragon` / `.baron` / `.elder` / `.teamfight` | CSS pit + inline SVG sigils | Pit key art per objective |
| `champion.class` | inline SVG glyphs (6) | Gold line-art class glyphs |
| `player.portrait` | monogram fallback (F1) | Painted portraits per synthetic player |
| `trophy.cup` | inline SVG cup | The Worlds Dynasty cup |

Not used on purpose: `public/themes/lol-bg.png` (Summoner's Rift wallpaper, Riot art) and the pixel-art role mascots (a different Mogzy style that fights the broadcast look). No audio was added; stingers reuse Ranked cues (`ranked.module.start`, `ranked.round.final`, `ranked.answer.lock`, `ranked.points.awarded`, `ranked.opponent.found`, `ranked.mode.confirm`, `ranked.match.victory`, `ui.feedback.error`).

## 6. Reduced motion and phones

- Every new animation is a `.dyn` descendant, so VIS-F1's rules freeze it under `prefers-reduced-motion` and `html.reduce-motion`; the JS gates (`useMotionAllowed`) also drop the entrance, panel, caster, chat, crowd-bar, beam, mist, spotlight and trophy classes. Stingers still appear (static, same duration) because they carry a title the player may want to read; story beats show all panels at once and do not auto-fold.
- Phones: casters and chat are desktop-and-up on the game and encounter screens (`hidden sm:flex`) so VIS-F1's fit numbers hold; the roster, prep, result and end screens (which scroll by design) show them at every width. Story beats stack their panels in one row at 390 and 360 (two or three narrow panels; captions wrap).

## 7. Verification (this machine, 2026-10-19)

- `vitest src/pages/dev/dynasty-v2`: 43 tests pass (20 engine, 13 UX-1 UI, 5 VIS-F1, 5 VIS-F2: scene per screen and tunnel → stadium; stingers on org choice, run start, draft lock and Dragon plus the roster story beat and its Skip; champion cards keep the radio contract and show the rare-play tag; casters and chat are deterministic per key and the showcase stinger board / scene switcher work; the roster sheet renders two star-size and three bench-size cards). The pre-existing Dynasty suites (D1 contract / page / route) still pass.
- `tsc -p tsconfig.app.json --noEmit`: no errors in `dynasty-v2`. `eslint`: 0 errors, 11 `react-refresh/only-export-components` warnings (constants exported beside components in `parts.tsx`, `broadcast.tsx`, `cards.tsx`).
- Browser: the desktop app's built-in pane against vite on port 5421 (no Edge / Chrome / Playwright). Desktop 1280×860 full flow: home → org (stinger) → stars → roster (story beat, stinger, caster, hierarchy cards) → season → transfer (practice room) → sign (stinger, "Signed" beat) → prep → scout (war room) → draft (champion cards, relevance tags) → lock (stinger) → tunnel → stage (rig, ribbon, crowd meter) → Dragon (stinger, pit, caster) → outcome (stinger, wash, caster, chat) → Early reveal → Mid → Baron (stinger, violet pit) → 3/3 → closeout → result (backstage, stinger, caster, chat). No console errors.
- Phone 390×844: the showcase (scene switcher, stinger board, story beat, casters, chat, crowd meters, player hierarchy cards, champion cards, closeouts, outcomes, results, series, champions and eliminated endings) with `scrollWidth === innerWidth` throughout; the game-screen additions on phones are limited to the LED ribbon (crowd meter hidden) and the pit header, and casters / chat are desktop-only there, so VIS-F1's fit numbers stand. **Not re-measured at 360×780 in this pass:** the pit header adds up to ~8 px above the Baron stakes ladder, which sat at 787 / 780 in VIS-F1; the sigil is now 48 px on phones to compensate. Re-measure on the next phone pass.
- Reduced motion: with `reduce-motion` on `<html>` the panel, caster, chat, crowd-bar, spotlight, trophy and scene/pit motion classes drop out of the DOM, the rig beam's computed `animation-duration` reads `1e-06s`, and a fired stinger renders static at opacity 1. Removing the class restores the classes.
- Screenshots (local, **not committed**): `C:\Users\mlmit\OneDrive\Desktop\vis-f2-dynasty-shots\` (`desktop/` 17 frames, `mobile-390/` 5 frames).

## 8. Remaining polish and integration needs

- Panel art is deliberately simple SVG; the briefs in §5 are the production-art pass. The HQ and practice scenes would benefit most from purpose-made backdrops.
- Caster and chat copy is a small fixed pool per moment; a larger pool (and E1's `narrative` / `explanation.short` strings once UX-3 wires the snapshot) would stop repeats across a long run.
- No dedicated audio: a stinger whoosh, a crowd bed that follows the crowd meter, and caster voice stabs are the obvious next asset task.
- Stingers are one-at-a-time by design; two moments firing together (series won + championship) keep the later one.
- The hidden pane throttles CSS animations during capture; the showcase "Replay motion" button re-runs entrances.
- UX-3 mapping notes from VIS-F1 still apply; the broadcast layer only needs `moment` + a key, so it wires to E1 beats directly.
