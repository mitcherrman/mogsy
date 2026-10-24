# Academy Pulse — Phase 1 (PULSE-1) handoff

Branch `academy/pulse-phase1` (base `main` 9685c68d, which includes #95 hover-to-front and #139 its certification). Draft PR mitcherrman/mogsy#140. Nothing is merged or published.

## 1. Objective

A central, animated discovery and engagement device inside the Living Hextech Orrery (`/lol`). It brings together community activity, personal progress, gameplay discovery, leaderboards, news, Premium, sponsors and creators. It has a permanent frame, interchangeable cinematic scenes, real interactions and a structured cadence. This phase is a prototype on **labelled development fixtures**, behind a flag.

## 2. How to see it

| Where | What |
|---|---|
| `/lol?pulse=1` on the dev server (`vite`, or `vite --mode e2e`) | Pulse in the real Orrery. The choice is remembered for the tab; `?pulse=0` turns it off. |
| `/dev/academy-pulse` (DEV-only route) | The scene lab: any fixture at the sizes the Home Hub gives Pulse. Parameters: `scene=<id>`, `size=desktop\|short\|tall\|mobile`, `zoom=2`, `paused=0`, `still=1` (jumps every animation to its end, for layout review). |
| Production build | **Off.** `VITE_ACADEMY_PULSE` unset means `/lol` is unchanged and the Pulse chunk is never fetched. `preview` honours `?pulse=1`; `on` always shows it (a later release decision). |

## 3. Design decisions

**Placement, desktop (≥ 1024 px).** The left column keeps its width (`--o35-col`), so the Orrery stage, its drag geometry and its tests don't move; e2e asserts the stage box is identical with and without Pulse. From top to bottom the column holds:

1. The masthead and Daily seal, unchanged.
2. The Patch Report book, raised. Its width now follows the viewport height (`(100dvh − header) × 0.37`, min 232 px), so short screens keep room for Pulse.
3. Academy Radio as a 40 px strip, replacing the 93 px dock. It keeps Play/Pause, the track and status line, and an accessible volume slider. Next is dropped because there is only one track; the HUD player still has it.
4. Pulse, taking all remaining height (`flex: 1`, min 118 px, max ≈ the column width).
5. The Commons and Hall links. On fine pointers their rows are 30 px instead of 44.

Measured Pulse slot heights:

| Viewport | Pulse slot |
|---|---|
| 1366×768 | ≈ 246 px (glass ≈ 190) |
| 1280×720 | ≈ 214 px |
| 1920×1080 | 421 px (capped) |
| 1366×657 (a 768 px laptop screen minus browser chrome) | ≈ 151 px |

**Short glass becomes a ticker.** Below 132 px of glass a full scene is cramped, so each item is shown as one broadcast line (sigil, category, sentence, **Open**), and Open shows the full scene in the expanded view. Real laptop browsers at 1366×657 and 1280×609 land here.

**Tall glass stands up.** On glass of 280 px or more, the side-by-side scenes switch to a centred vertical composition (big desktops).

**Header as a nameplate.** The brand, category chip and **Sample** badge sit *on* the frame's top edge, so they cost the glass no height. The emitter crystal inside the nameplate flares in the next scene's colour at every change.

**Phones and tablets (< 1024 px).** The approved no-scroll first screen is untouched (e2e asserts the stage and arrows don't move). Pulse sits below it, in the Patch Report's former spot, with the Patch Report following. There is no strip on phones, because the global HUD radio already covers it.

**Engine.**

```
PulseContentProvider ──► PulseCatalogue ──► buildPulseCycle(cadence) ──► usePulseRotation ──► SceneRenderer(kind)
     (content)              (by category)        (order + guard rails)       (clock + holds)      (presentation)
```

- A **category** is a cadence slot; a **kind** is the scene component that draws it. Event uses the News scene, and items within a category are swappable.
- `DEFAULT_PULSE_CADENCE` is the owner's 12 steps: Player activity → Mini-game → Sponsor → Leaderboard → News → Premium → Player activity → Personal insight → Educational → Creator spotlight → Community challenge → Event.
- **Scheduler guard rails:**
  - It skips empty or broken payloads.
  - It never repeats an item within a cycle.
  - It rotates the items inside each category from cycle to cycle.
  - It allows at most 2 promotions (sponsor or premium) per cycle, at least 3 positions apart, including across the wrap.
  - It never plays two scenes of the same kind back to back.
- The cadence is plain data (`PulseCadence`) and owner-configurable.
- **Rotation holds:** hover, keyboard focus, a scene interaction (until 10 s of quiet), the expanded view, the viewer's Pause, off-screen, and hidden tab. Holds stack: releasing one never resumes what another still holds. Each scene's dwell is per kind (8–12 s). The progress line is a CSS animation that mirrors the same clock, so there are no per-frame React renders.
- **Startup:** the slot reserves its box from the first frame (an empty CSS frame), and the Pulse code and art load only once the Orrery's first screen has settled and the browser is idle (`pulseReady = startup.shown && deferredReady`). Pulse is outside the startup gate's image set, a lazy chunk (≈ 55 KB JS + 42 KB CSS, not gzipped), and inside an error boundary.

**Motion.** Framer Motion with a shared grammar (`scene-kit.tsx`):
- **Exit:** the outgoing scene dims, softens (blur) and shrinks slightly while its pieces fall away in reverse.
- **Change:** a light sweep in the next scene's accent crosses the glass in the direction of travel, and the emitter flares.
- **Enter:** each scene choreographs its own arrival.
- The frame never changes size, because scenes are absolutely positioned in the glass.
- **Reduced motion:** both the OS setting and Settings → Reduce motion give `MotionConfig reducedMotion="always"`. That means cross-fades only, no flare, no loops or particles, count-ups landing at once, and **rotation starting paused**.

**Scenes (`scenes/`).** Each has its own personality:

| Archetype | Scene | Interaction |
|---|---|---|
| Player activity | Medallion forge: mascot rises in a forged medallion, rune rings draw, score counts up, tier seal stamps in a burst | Medallion turns over to criteria and rarity |
| Mini-game | Reflex dial: needle sweeps a Hextech dial (rAF transform, no React state per frame) | Stop / Again; "Bonus challenges" → `/quiz/more-challenges` |
| Leaderboard | Ascent: rows cascade in, then the climber slides up through them (layout animation) with a gold trail and ▲ badge | Inspect any row (card, focus returns) |
| News / Event | Broadcast: splash drifts behind a scanline, headline struck in by a light wipe; Event has a live countdown | Read update → expanded article |
| Premium | Vault: shutters swing open on a gem and beam, benefits ignite | See Premium → `/lol/premium` |
| Sponsor | Billboard: silver (not gold), permanent SPONSORED band, art plate | Inert for a placeholder ("No sponsor connected"); a real one opens `rel="sponsored noopener"` |
| Creator spotlight | Screen: thumbnail switches on like a crystal screen; YouTube duration or Twitch LIVE pill | Watch → expanded viewer; creator-challenge entry |
| Personal insight | Reading: sparkline draws, last point pings, milestone ring fills | Hover or focus a day to read it |
| Educational | Riddle: practice question | Answer → right/wrong reveal + explanation; **nothing is submitted or scored** |
| Community challenge | Vessel: crystal vessel fills with a liquid swell, tally counts up | (Join inert for a sample) |

**Video and radio.** Compact scenes only ever draw a still. The expanded viewer (a Radix Dialog: focus trap and return, Escape closes) loads a **privacy-enhanced YouTube** or **Twitch** player only when Play is pressed, and only for a well-formed id (`pulse-embed.ts`; Twitch gets `parent=<host>`). While it plays, `setRadioSuppressedByMode(true)` silences Academy Radio without touching the visitor's Play/Mute choice, volume or live clock. It is released on stop, close or unmount. Fixture creators have no video, so they get a labelled **stand-in player**: the flow and the radio hand-off can be reviewed without inventing a real creator's content.

**Honesty rules for fixtures (`content/pulse-fixtures.ts`).**
- Every item has `provenance: "fixture"`, and the frame shows **Sample**.
- Players, scores, ranks, creators, streams and the sponsor are invented and link nowhere (unit-tested: no `http`, null hrefs, video ids and channels).
- Learnable facts are true:
  - the practice question is a stable champion title;
  - announcements describe shipped features (#95 hover-to-front, Patch Deck);
  - **Premium copy comes only from `src/lib/premium/matrix.ts`**, as shipped, differentiating rows with their `userFacingSummary`.
- Links that exist go to real public routes: `/quiz`, `/quiz/more-challenges`, `/lol/premium`, `/lol/patch-deck`.

## 4. Changed files

New:
- `src/features/academy-pulse/`
  - `model/`: `pulse-types`, `pulse-cadence`, `pulse-rotation`, `pulse-flag`, `pulse-embed`, each with tests
  - `content/`: `pulse-fixtures`, `pulse-provider`, with tests
  - `AcademyPulse.tsx` (shell, with test), `AcademyPulseSlot.tsx` (lazy slot), `PulseExpanded.tsx`, `PulseVideoViewer.tsx`, `usePulseRotation.ts`, `useRadioYield.ts`
  - `scenes/`: ten scenes, `TickerScene`, `SceneRenderer`, `scene-kit`
  - `academy-pulse.css`, `academy-pulse-slot.css`
- `src/components/audio/AcademyRadioStrip.tsx` (+ test)
- `src/pages/academy-core/orrery/academy-core-pulse.css` (layout, every rule under `.o35-root[data-pulse="on"]`)
- `src/pages/dev/academy-pulse/AcademyPulseLab.tsx`
- `e2e/academy-pulse.spec.ts`
- `.github/workflows/academy-pulse.yml`

Edited (small):
- `src/pages/academy-core/AcademyCorePage.tsx`: flag read once, `data-pulse`, strip and slot when on, mobile slot, CSS import placed before phone-fit (the seamless-HUD test pins the last two imports).
- `src/components/lol/broadcast/AcademyBroadcastCenterpiece.tsx`: optional `dock` prop, default `true`.
- `src/App.tsx`: DEV-only lab route.
- `src/pages/academy-core/AcademyCorePage.test.tsx`: 4 flag tests and stubs.

## 5. Tests

- **Unit (local, vitest):** 497 tests passing across Pulse, the academy-core page and Orrery suites, the radio strip and dock, the broadcast components and `src/lib/audio`.
  - cadence 13, rotation 9, flag and embeds 7, provider 3, shell 15, strip 3
  - page: 83 tests, including 4 new flag tests
- **Typecheck:** `tsc -p tsconfig.app.json` is clean for every touched file.
- **Lint:** eslint reports 0 errors (fast-refresh warnings only, a pattern common in the repo).
- **Build:** `vite build` passes. The lab is absent from the bundle; Pulse is its own chunk.
- **Browser (GitHub runner only, AGENTS.md):** `academy-pulse` workflow, artifact `academy-pulse-evidence`. It covers:
  - flag off;
  - six desktops (stage identical, no new scroll, column order without collisions, nameplate clears the radio, ticker threshold, Daily still hit-testable);
  - five stacked viewports (first screen identical, Pulse in the Patch Report's place);
  - controls, Pause, focus and hover holds, the question, the expanded view with Escape and focus return, leaderboard inspect, and the creator viewer with no third-party requests;
  - reduced motion;
  - a 52-image scene gallery and a motion recording.
- **Local visual inspection** used the Claude app's built-in browser pane on the Vite dev server (the owner had no preference among the offered options). Edge and Chrome were never automated.

CI results: see §8.

## 6. Outstanding issues and owner questions

1. **Motion not yet reviewed at full frame rate.** The local pane was backgrounded (animation frames throttled) and CI's headless Chromium records slowly. The choreography needs an owner look on a real GPU (`/lol?pulse=1`, or the lab with `paused=0`).
2. **Patch Report size.** It is smaller on Pulse layouts (≈ 263 px wide at 1366×768, was 369). Is that acceptable, or should Pulse give back height?
3. **Short laptops get the ticker** (1366×657, 1280×609). The alternative is a smaller book, or letting the hero scroll.
4. **Reduced motion starts paused**, the conservative choice. Should it rotate with cross-fades instead?
5. **Phone order.** Pulse now comes before the Patch Report below the first screen. Should it come after?
6. **Mini-game target.** Perfect Timing is still owner-only, so the dial's Play goes to `/quiz/more-challenges` and is labelled "Reflex Dial", a taster rather than a real mode.
7. **Thumbnail weight.** Creator and news art use full champion splashes, the only 16:9 art in the manifest. A real creator feed brings its own thumbnails; until then each scene fetches one splash.
8. **Sponsor policy.** Disclosure wording, frequency caps beyond the cadence, and any brand-safety review are owner and legal decisions before a real campaign.
9. **Premium for Premium members.** The provider should drop the Premium scene for subscribers once a live provider knows the viewer.

## 7. Next implementation task (PULSE-2)

A **live content provider** behind the same `PulseContentProvider` interface:
- Real Academy activity and leaderboards from authoritative backend sources (consented, real-data only; personal scenes only for the signed-in viewer).
- The Patch Brief feed as News.
- An owner-editable cadence and catalogue (admin), with `provenance: "live"` items.
- Then: the owner's motion review, and turning the flag to `on` only on the owner's decision.

## 8. CI (PR #140)

| Workflow | Result | Note |
|---|---|---|
| `academy-pulse` (new) | **pass**, run 40055797657 on a3f1ec15 | vitest 319/319; build and bundle guard; Playwright **19/19** in 4.7 min |
| `academy-core-orrery` | **pass**, run 40047186116 | V3.5 + V3 Orrery browser specs, unit tests, build: flag-off `/lol` unaffected |
| `academy-masthead-review` | **pass** | Masthead geometry unchanged |
| `academy-seamless-hud` | fail, **pre-existing** | Its "before" job deletes `academy-core-seamless-hud.css` from main's source while main's page still imports it, so Vite cannot resolve it. It fails the same way on every PR touching `src/pages/academy-core` since #111 merged (atlas, tournament-arena PRs). Needs its own fix: drop the import too, or retire the before/after job. |
| `interaction-labs-integration` | fail, **pre-existing** | The owner-prototypes browser suite fails on unrelated PRs too (e.g. qrt2/mastery-tablet-tabs) |

First run (36e33792): 18/19. The real defect it found was that Escape didn't return focus to the opener of the expanded view, because Radix restores focus only to a `Dialog.Trigger`. It was fixed in 9665cbc3 and covered by unit and browser tests.

Evidence artifact `academy-pulse-evidence`:
- desktop full-page and column stills at 6 viewports;
- first-screen and Pulse stills at 5 stacked viewports;
- interaction stills: question, expanded view, leaderboard inspect, creator viewer;
- reduced motion;
- `gallery/` with 13 scenes × 4 sizes at 2×;
- `video/`, a motion recording of a full cycle. Headless Chromium records slowly, so it shows choreography order, not real smoothness.
