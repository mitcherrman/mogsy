# Academy Core V3.5 — The Living Hextech Orrery (Phase 1, Phase 2, targeted changes, crystal redesign)

Branch `design/academy-core-v35-floating-orrery`, cut from `origin/main` **`6407559a`** (fetched at the start of the pass).
Preview route: **`/lol/dev/academy-core-v35`** (development-only; see "Guarantees"). Nothing is merged, deployed, PR'd or published.
Frontend only: no backend, Supabase or Railway change.

> Status: Phase 1, Phase 2 and the Phase 2 targeted changes (arrow selector, larger crystal; §P2T, `2a543a0f`) are approved.
> **Crystal redesign (exactly two projections: Leaguecraft and Pro Play) built and STOPPED FOR OWNER REVIEW** — §P2C below. Watch
> `docs/handoffs/academy-core-v35/orrery-crystal-redesign.webm` (26 s) first.

## P2C. Crystal redesign — Leaguecraft (pentagon + scroll/quill) and Pro Play (5 v 5)

Base `2a543a0f` (branch, HEAD and remote verified; clean tree). Only the Leaguecraft and Pro Play projections changed. The books, orbit,
drag and inertia, arrow selector and hold, lens size, Core and rings, Patch Report, radio, Mogzy, Daily/Ranked, navigation, analytics,
Combat and Archives projections, audio and backend are untouched. Production `/lol` is untouched (verified by test).

### What changed

**Leaguecraft** now draws the composition Pro Play used to draw: the targeting reticle (it rotates to lock on when the room is focused),
the five real role icons on the pentagon (r 76, 72° apart, the same `CORE_OBSERVE_ROLES` files), and the violet crystal field. Ahri's
portrait is replaced by a **scroll-and-quill medallion**, drawn as vector art: a navy-violet disc with the gold lamp ring, a parchment
sheet with ink lines between two brass-capped rolls, a white-violet quill with a gold nib crossing it, and a glint off the quill's tip.
It is centred in the reticle and shown at about 60 px across at 1366 wide (drawn at r 26, displayed 1.2×). It grows into place as the room
is focused and, under ambient motion, floats ±1.2 units with a soft pulsing glow (the existing `acore-pulse` keyframes). The Leaguecraft iris
opening (104, wider than Pro Play's 88) was left as it is: the composition is fully visible inside it.

**Pro Play** now shows **5 v 5 around Summoner's Rift**, in the Archives' language: a central circular subject (r 46, in the instrument's own
art clip) in a layered crystal field, with five champion icon plates on an **upper arc** and five opposing plates on a **mirrored lower arc**
(r 74, 23° steps, icons r 12 — about 22 px at 1366 wide). The sides are told apart by subtle blue and ember ring tints and a tinted plate
plus a fine dashed trace under each arc. As the room is focused the two sides slide out from the centre into place (as the Archives' strata
spread), and a dashed ring around the Rift turns slowly. There is no text, no patch content, no players, no results.

**Fit (local lens units):** every icon's outer edge is within 86 of the centre along every iris blade normal (the open Pro Play iris is a
hexagon of inradius 88), so no blade covers a portrait once the iris is open. Icons are 5.5 apart and 15 clear of the Rift ring. Everything is
inside the lens (r 118). This is unit-tested exactly and checked in the browser at real scale.

### Assets and provenance

- **Champion icons:** the champion manifest's own `icon` files (`/api/assets/champions`, the same authority and request the book covers
  already use), resolved with `getChampionIcon`. Lineup, top → support: blue **Gnar, Lee Sin, Azir, Jinx, Thresh**; red **K'Sante, Vi,
  Orianna, Kai'Sa, Nautilus** (manifest keys verified against production on 2026-10-16). A representative decorative lineup, not a real
  match. If the manifest lacks a name the plate stays empty; no image is guessed. The icons load after the critical art, like the other
  projections.
- **Summoner's Rift centre:** `src/assets/academy-core/rift-lane-turret.webp` (256 × 256, 13 KB), a derivative of two assets the product
  already ships:
  - `src/assets/ranked/lane.png`, the owner-supplied Summoner's Rift lane scene (ENVVIS1, `d0090576`, 2026-09-20; it shows the lane,
    brush and base wall);
  - the backend's canonical turret render, `assets/structures/turret.png` (the `quiz.structure_assets` registry art).

  The turret is composited on the lane, which is the same pairing the quiz's `lane_turret` environment scene uses. I chose this over a lane
  crop alone: at the real ~86 px size, plain lane crops read as generic grass and dirt, while the turret makes the image read as Summoner's
  Rift at once. No external Riot URL was fetched or invented; both sources are already in use in Mogzy under its existing fan-project terms.

### Isolation

`AcademyCoreInstrument.tsx` (shared with V3) gained one opt-in prop, `projectionOverrides` (Leaguecraft and/or Pro Play artwork drawn in the
lens's local space inside the room's own mode group). When it is absent, the V3 projections render exactly as before. V3.5 passes its
designs from `OrreryProjections.tsx`. The Leaguecraft violet palette and the new styles are V3.5-scoped CSS (`.o35-root`).

### Files

New: `OrreryProjections.tsx` (both designs), `orrery-projections-data.ts` (lineup, Rift art, arc geometry), `OrreryProjections.test.tsx`,
`src/assets/academy-core/rift-lane-turret.webp`. Changed: `AcademyCoreInstrument.tsx` (+`projectionOverrides`, two conditional wrappers),
`OrreryCore.tsx` (passes the overrides), `AcademyCoreV35Page.tsx` (lineup icons from the manifest), `academy-core-v35.css` (Leaguecraft
palette and reticle lock, emblem, 5 v 5 styles), `AcademyCoreV35Page.test.tsx`, `e2e/academy-core-v35.spec.ts` (stub manifest gained the
lineup names; new tests; an evidence suite).

### Tests

| Suite | Result |
|---|---|
| vitest: V3.5 (motion 39, engine 7, page 41, **projections 8**) + V3 (`AcademyCorePage` 32, route 9, warm 5, lens 2) + `route-prefetch` 7 | **150 / 150** |
| Playwright `e2e/academy-core-v35.spec.ts --grep-invert evidence` (Chromium) | **52 / 52** (46 previous + 6 new) |
| `tsc` | only the 2 pre-existing baseline errors |
| `eslint` | 0 errors; the 1 pre-existing warning (`AcademyCoreInstrument.tsx:55`) |

The new checks cover:

1. Exactly five role icons on the r 76 pentagon, the emblem centred and ≥ 56 px, and no champion portrait in Leaguecraft.
2. Exactly ten champion icons, five per side, each on its side, inside the iris's inscribed circle, clear of the Rift ring, and ≥ 18 px.
3. The Rift image centred, ≥ 80 px and served (200).
4. All four modes switch, and only Leaguecraft and Pro Play carry overrides.
5. The arrow selector and the crystal stay in step.
6. `/lol` still has the V3 magnifier and the Ahri track mark, and no override.
7. Phones and reduced motion show the same two projections, with no overflow.
8. No page errors.

Unit tests also check that Combat and Archives markup is byte-identical with and without the overrides. Pixel diffs at identical framing
against the `2a543a0f` captures show **idle, Combat and Archives with 0 changed pixels**; only Leaguecraft and Pro Play differ.

### Performance (A/B against `2a543a0f` served side by side, headless Edge, 1366×768, 60 Hz this session)

| | before | after |
|---|---|---|
| idle | 29.6 / 31.2 % | 28.2 / 30.4 % |
| Leaguecraft pinned | 33.0 / 32.9 % | 34.8 / 34.5 % |
| Pro Play pinned | 32.1 / 32.7 % | 32.6 / 31.2 % |

60 fps was held in every run. The only measurable difference is about +1.7 points while Leaguecraft is pinned (the emblem's float and glow
animations). No console or page errors.

### Evidence (`docs/handoffs/academy-core-v35/`, real art, Edge)

- `orrery-crystal-redesign.webm` — 26 s: the crystal cycles Leaguecraft → Pro Play → Combat → Archives twice, holding on the two new ones;
  then the arrows bring Pro Play round, with the crystal following.
- Actual desktop size: `crystal-redesign-1366x768-leaguecraft.png` and `crystal-redesign-1366x768-pro-play.png` (full frames).
- All four modes at 1×: `crystal-redesign-actual-size-{leaguecraft,pro-play,combat-lab,archives}.png`.
- Close-ups at 3× device pixels, same framing: `crystal-redesign-closeup-leaguecraft.png`, `crystal-redesign-closeup-pro-play.png`.
- Phones (390×844 at 2×): `crystal-redesign-mobile-390x844-leaguecraft.png`, `crystal-redesign-mobile-390x844-pro-play.png`.

### Limitations and owner questions

1. **Leaguecraft and Pro Play now share the violet crystal.** The brief lists the violet field as part of the composition Leaguecraft
   inherits, and nothing asked for Pro Play's colour to change, so it stayed violet. Leaguecraft's halo, comet, needle and tether stay gold.
   If you would rather Leaguecraft keep its gold crystal, or Pro Play move to another tint, it is one CSS rule.
2. **On phones the ten icons are small** (about 11 CSS px, read from the 2× capture; the phone lens is about half the desktop one). They are
   visible but not individually identifiable at a glance. The emblem stays clear (measured over 28 CSS px).
3. The champion icons depend on the asset host. While it is slow, the plates show empty until the icons arrive (the same behaviour as the
   book covers).
4. The Rift image is a derivative composite, documented above. If you would prefer an untouched source image (e.g. a lane crop only, or the
   Nexus scene), it is a one-file swap.

### Next

Owner review of the two projections. Nothing else is started: no PR, merge, deploy, sound or Phase 3.

---

## P2T. Phase 2 targeted improvements — the arrow selector and the larger crystal

Base: `b2518371` (verified HEAD and remote, clean tree before work). Nothing else was changed: no new text, no other visual work, no audio,
no backend. Production `/lol` is untouched (the shared instrument got one opt-in prop whose default is the V3 value; verified by test).

### Change 1 — two arrows that turn the orbit

**What you see.** Two small round Hextech buttons (navy disc, gold ring, blue inner ring, gold chevron) beneath the Core, flanking the
front of the orbit — exactly the place a selected book comes to rest, so the pair reads `‹ [book] ›`. No text, labels, counters or panels;
the names are `aria-label` only ("Previous book" / "Next book", group "Turn the orbit"). Hover brightens, press dips, keyboard focus shows a
gold outline. Targets are ≥ 44 px. On phones the same pair sits centred under the composed books.

**Direction.** `›` (right) turns the orbit the way it already idles: the near side moves left and the book coming from the **right** is
brought to the front; `‹` does the opposite. Each press advances exactly one book in the books' real order around the orbit; it wraps after four.

**Motion lifecycle (one controller, in the existing state machine).** `SpinModel` (orrery-motion.ts) gained two phases:

```
free / inertia / snapping / dwell --arrow--> steering --(turn ends)--> held
held --arrow--> steering (one more book)      steering --arrow--> steering (re-planned, one more book)
held | steering --grab (drag / press on open space)--> grabbed --> (existing fling/snap/dwell/free)
held | steering --crystal click--> free (the crystal's own preview takes over)
```

- *Which book*: from any free-running phase the target is the **next book to arrive at the front** in the arrow's direction
  (`nextArrival`); a book already within 20° of the front is skipped, so the first press from idle is always a visible turn (20°–110°).
  While steering or held, each press adds exactly one quarter turn to the planned target, so rapid presses are counted exactly, never dropped
  or doubled, and opposite presses cancel cleanly. No timers, no completion callbacks: nothing can go stale.
- *How it moves*: a cubic Hermite from the orbit's **current position and angular velocity** to the target with zero end velocity
  (accelerate, glide, decelerate); ~1.2 s a quarter turn, up to 2.2 s for several queued steps. Taking over a fling or a snap keeps position
  and speed continuous; the start slope is bounded so the turn can never overshoot its target or reverse unexpectedly.
- *Foreground*: the selected book comes to rest **in the orbit** at front-centre (angle 90°), directly beneath the crystal — the whole orbit
  turns, all four books keep their relative positions, depth and scale. It is lit and on top, but grows only 4 % (not the hover 14 %) so it
  does not climb over the lens. It is **held**: the idle orbit does not resume and carry it away. Releasing is intentional: a drag of the orbit,
  a press on open space, or using the crystal.
- *Reduced motion*: the orbit is placed at the selection at once; no loop runs. *Phones* (no orbit): the arrows step the preview round the
  composed ring clockwise (right) / anticlockwise (left); the chosen book is lit and grows slightly with a 300 ms transform transition;
  nothing moves away from the finger.

**One preview, two sources.** `useCoreNavigator` keeps a single `pinned` destination plus `pinSource: "crystal" | "selector"`. The arrows
set it (`select`), so the crystal projection, its tint and tempo, the bearing needle, the tether, Mogzy's line and the screen-reader readout
all show the selected book. The crystal still only cycles previews and never navigates; its cycle continues from whatever is previewed
(after an arrow selected Leaguecraft, the crystal shows Pro Play next) and it releases the arrow hold first (the crystal-pinned book then
rests beside the lens, as before). Only crystal pins pull a book out of the orbit; selector pins never do. Hover and keyboard focus are
temporary emphasis layered on top: one emphasised book at a time, and the selection comes back when they leave. The arrows never navigate;
books still navigate with the 240 ms activation, modified clicks, prefetch (an arrow selection also prefetches its room) and analytics unchanged.

### Change 2 — a larger crystal inside the same Core

`AcademyCoreInstrument` gained one optional prop, `lensScale` (default **0.78**, the V3 value — production unchanged). V3.5 passes
**0.96** (`V35_LENS_SCALE`, OrreryCore.tsx). Everything in the crystal assembly — lens plate, facets, inner hexagon, glow, all four projections,
their clip paths, and the iris blades and rim — is authored in the lens's local space under that one transform, so it scales as one
coherent unit with no clipping or misalignment. Geometry (viewBox units): lens radius 92 → **113** (+23 % across, +51 % area), now filling
the dial's dark enamel band up to its edge (r 118); the iris rim sits at r ≈ 117–120, clear of the scale ticks (r 128+); the bezel (r 150),
ticks, rings, gyroscopes, orbit and the whole 640-unit Core are unchanged. The crystal button's hit area is resized to match the lens
(40 % → 49.2 % of the instrument), and the inner energy is a little brighter (glow opacity 0.55 → 0.75, a soft accent glow on the inner hexagon) —
V3.5-scoped CSS only. Measured at 1366×768: lens 178.8 px → **220.0 px** wide in the same 446.75 px instrument (ratio 0.400 → 0.493).

Consequence (accepted, tested): a near-side book passing front-centre — including the selector's held book — now overlaps the **bottom rim**
of the larger lens by up to ~25 stage units. It never reaches the projection art or the lens centre (unit-tested over the whole orbit), and the
crystal remains clickable everywhere above it.

### Files

`orrery-motion.ts` (selector phases, `nextArrival`, `steerDuration`, `hermite`), `OrreryEngine.ts` (`steer`, `releaseSelection`, `selected`,
smaller held emphasis, `data-spin` on the stage for inspection/tests), `useCoreNavigator.ts` (`pinSource`, `select`, `clearSelection`),
`AcademyCoreV35Page.tsx` (arrows, crystal/drag release wiring, phone ring), `OrreryCore.tsx` (`V35_LENS_SCALE`), `academy-core-v35.css`
(selector, crystal hit area/glow, phone transition), shared `src/pages/academy-core/AcademyCoreInstrument.tsx` (+`lensScale` prop, 9 lines),
tests: `orrery-motion.test.ts`, `OrreryEngine.test.ts`, `AcademyCoreV35Page.test.tsx`, new `AcademyCoreInstrument.lens.test.tsx`, `e2e/academy-core-v35.spec.ts`.

### Tests

| Suite | Result |
|---|---|
| vitest: V3.5 (`orrery-motion` 39, `OrreryEngine` 7, page 39) + V3 (`AcademyCorePage` 32, route 9, warm 5, **lens 2**) + `route-prefetch` 7 | **140 / 140** |
| Playwright `e2e/academy-core-v35.spec.ts --grep-invert evidence` (Chromium) | **46 / 46** (32 previous + 14 new) |
| `tsc -p tsconfig.app.json` | only the 2 pre-existing baseline errors (`OnboardingProfile.tsx`, `identity/connections.ts`) |
| `eslint` on changed files | 0 errors; 1 pre-existing warning (`react-refresh/only-export-components`, `AcademyCoreInstrument.tsx:55`, the existing `BOOK_SLOTS` export) |

New coverage — selector: exactly two buttons, no visible text, names, ≥ 44 px, unobstructed, beneath the Core; right advances one book per press
in orbit order and wraps after four, left reverses; all four (including a back-facing book) reach the front; the whole orbit turns together;
the held book is front-centre, still for 3 s, on top, and one click navigates; rapid presses count exactly; takes over a fling and a snap;
a drag releases the hold and the orbit resumes; the crystal projects the selection and its own cycle continues from it; Enter/Space and focus
ring; reduced motion places at once; phones 390 / 320 step clockwise without orbiting. Crystal: lens/instrument 0.48–0.51 (was 0.400), Core,
rings and dial unchanged; iris, hit area and all four projections centred and inside the lens; `/lol` keeps the V3 ratio (0.192).
Unit: turns preserve relative positions exactly, monotone with no overshoot, continuity on take-over, single controller, reduced-motion placement.

Not new failures but fixed test design along the way: two Phase 2 tests relied on wall-clock timing / a stationary pointer and became flaky
under load; they now wait on the engine's `data-spin` phase and park the pointer. A "books stopped moving" heuristic misfired on cold pages
(frames can stall for a few hundred ms), which is why `data-spin` exists. No console errors were seen in the browser probes.

### Performance (measured, same harness, A/B against `b2518371` served side by side)

Headless Edge, 1366×768, CDP main-thread busy / style recalc over 6 s idle, alternating before/after:

| | before (b2518371) | after |
|---|---|---|
| full, steady pairs | 38.0 % / 34.3 % | 35.3 % / 35.0 % |
| lite | 28.7 % | 30.1 % |
| full, 390×844 | 24.5 % | 27.6 % |

All runs held the display rate (75 Hz in this session, rAF p95 13.4 ms). Differences are within run-to-run noise (±3 points); I see no
measurable regression. (These absolute numbers are higher than Phase 2's because this session ran at 75 Hz rather than 60 Hz: more frames
per second. Compare within a table only.) Not measured on real GPU hardware.

**Recording caveat found while doing this:** Playwright's bundled headless Chromium renders this scene at **~8 fps while recording** on this
machine (Edge: ~70 fps), and the engine caps a frame step at 50 ms, so recordings made in it show the motion slowed and choppy. The new
recording was made in Edge (`V35_EVIDENCE_CHANNEL=msedge`). The earlier Phase 1 and Phase 2 recordings were made with the bundled Chromium
and therefore **understate the real speed and smoothness**; they were not re-recorded (out of scope).

### Evidence (`docs/handoffs/academy-core-v35/`, real art)

- `orrery-selector-and-crystal.webm` — 32 s, 1366×768, Edge: idle orbit → `›` (whole orbit turns, book held) → `›` → `‹` (reverses) → a
  back-facing book brought round (two steps, the second mid-turn) → three rapid `›` → the enlarged crystal cycling all four projections →
  `›` then a click on the selected book → its room (Pro Play). A white ring marks the pointer.
- `selector-desktop-1366x768-idle.png`, `selector-desktop-1366x768-selected.png`, `selector-desktop-1920x1080-selected.png`
- `selector-mobile-390x844-stage.png`, `selector-mobile-390x844-full.png`
- `crystal-before-after.png` — identical framing (1366×768, reduced motion so books and rings hold still, 380 px crop on the instrument),
  before = `b2518371`, after = this change, for idle and all four projections.

### Outstanding / for the owner

1. The held book overlaps the bottom rim of the larger lens (see Change 2). If you want a clean gap, the options are a slightly smaller lens
   (0.90 gives ~+15 % instead of +23 %) or holding the selected book a little lower — your call; neither was done unasked.
2. On phones the arrows sit under the composed books (there is no room beneath the Core between the tiers without redesigning the layout).
3. Hover / keyboard on another book temporarily shows that book while the selection stays held — this is deliberate; say if you would rather a
   focused book become the selection.
4. Still Chromium/Edge only; no real-GPU numbers; Phase 1/2 recordings understate motion (above).

### Next recommended work (not started)

Owner review of these two changes; then Phase 3 as previously proposed (integration plan), sound only with your go-ahead on the shared audio registry.

---

## P2. Phase 2 — advanced interaction polish

Scope was handoff §7 items 2, 3 and 5 (items 1 and 6 had nothing to fix / need the owner; item 4 is deferred, see below).

| Item | What changed |
|---|---|
| **Drag-to-spin** | Grab the orbit from **empty space** (never from a book, link or the crystal, so every click contract is untouched). The orbit follows the pointer; a fast release **flings** (inertia, capped at ~1.7 rad/s); the books then **settle onto the nearest symmetric composition** (the four corners: none behind the dial), **pause 1.8 s**, and the slow orbit resumes. A slow release is a nudge (no inertia, no snap). A hovered book damps the coast quickly and cancels the snap, so a book never slides out from under a resting cursor. `cursor: grab / grabbing`; `touch-action: pan-y` so vertical touch still scrolls. Off under reduced motion and in the phone layout. State machine = `SpinModel` in `orrery-motion.ts` (pure, tested); the engine owns the pointer API (`grab` / `dragBy` / `release`). |
| **Richer focus** | (a) The focused cover **swings open on its spine** (3D, −24°) and **light spills from its pages** (accent-coloured `pagelight`). (b) The Core's rings and comets change **tempo per room** (Measure ×2.5 races, Observe ×1.3, Inquiry ×1.6, Strata ×0.65 slow), eased through `Animation.playbackRate`, no restart. (c) The attended **comet takes the room's colour**. (d) The lit tether is a **beam** (double glow). (e) **Activation camera push**: the scene scales 4 % toward the Core for the 240 ms. |
| **Keyboard** | **Arrow keys** step focus through the books (wrapping), on top of Tab; modified arrows and other controls are untouched. Fixed a bug found while capturing: moving keyboard focus between books left the *previous* book emphasised behind the new one (blur's release was cancelled by the next focus in the same tick); now each focus clears the other channel. A unit test fails without the fix. |
| **Performance** | (a) **Quality tiers**: `?quality=lite|full` (forced, never overridden), else Save-Data / ≤2 cores / ≤2 GB → lite, else full; and a **frame-rate monitor** drops a full scene to lite once if ≥150 frames after warm-up exceed 30 ms. Lite keeps the orbit, books, dial, first comet/gyro/ring set, tethers, Patch Report; it drops fragments, twinkle, extra comets/gyro rings/rune ring, sparks, one aurora, two shafts and the glow filters. (b) Every CSS animation in the Core, environment and Patch Report is **paused when the stage is off screen / the tab is hidden** (`data-ambient=off`). |
| **Sound** | **Deferred, deliberately.** The only way to add orbit / focus cues is to extend the shared audio registry and renderers (`sfx-registry.ts`, `sfx-renderers.ts`), which are used by the whole app and have per-cue user settings. That is a cross-cutting change that needs your go-ahead, not a preview-only one. V3's `hub.destination.focus` and `bookRuffle` cues are reused as before. |

### Phase 2 verification

| Suite | Result |
|---|---|
| `vitest src/pages/dev/academy-core-v35` | **63 / 63** (28 motion-maths incl. 6 for the spin state machine; 5 engine tests: drag API, frame-rate monitor, tempo ramp; 30 rendered-page tests incl. drag, arrow keys, quality tiers, the focus bug) |
| `playwright … e2e/academy-core-v35.spec.ts --grep-invert evidence` | **32 / 32** (22 Phase 1 + 10 Phase 2: drag → coast → symmetric snap → dwell → resume; click-after-drag; cursor; reduced motion; ring tempo; cover swing + page light + comet colour; arrow keys; lite tier; **auto-degrade under a 40 ms/frame main-thread hog**; forced `full` never degrades) |
| V3 regression `vitest src/pages/academy-core src/lib/route-prefetch.test.ts` | 53 / 53 (run at the end of Phase 1; no V3 file touched in Phase 2) |
| `eslint` on the new files | clean |

Two e2e assertions were load-sensitive and were made robust rather than loosened blindly: total orbit travel (≈1,300 px / 9 s on an idle machine; the loop slows with frame rate, so the floor is 450 px) and "the books pass each other" (now watches until they have, up to ~35 s). Locator clicks cannot be used on orbiting targets (Playwright waits for them to hold still), so the tests aim by coordinates or at a point proven to hit the book.

Performance, same harness as Phase 1 (headless Chromium, software compositing, 1366×768, main-thread busy / style recalc, 60 fps held in every case):

| | busy | style |
|---|---|---|
| V3 `/lol` | 7.4–7.9 % | 1.8–2.0 % |
| V3.5 **full** | 24–27 % | 9–11 % |
| V3.5 **lite** | 18–20 % (15 % in a quieter run) | 6 % |
| V3.5 full / lite, phone | 17 % / 14 % | 8 % / 5 % |

(The machine was busier than in Phase 1, so the V3 baseline also read higher; the ratio is what to compare: full ≈ 3.3× V3, lite ≈ 2.4×.) Ablating the lite tier moved the number by ≤ 2 points per item (books' glow filters, Patch Report animation, instrument internals): the remaining cost is spread thin, not one hotspot. Not measured on real GPUs or low-end devices: the quality monitor exists because that cannot be known from here.

Evidence added (`docs/handoffs/academy-core-v35/`): `orrery-phase2-interaction.webm` (38 s: idle, fling right → coast → snap → dwell → resume, fling left, hover with cover swing and beam, crystal through all four rooms with tempo changes, keyboard arrow + Enter with the camera push), `phase2-1366x768-{fling-midcoast,snapped,hover-cover-crack,crystal-measure,keyboard-focus,lite}.png`.

### Phase 2 known issues / owner questions

1. The cover swing and page light are **subtle** at 1366 wide (a thin lit edge on the right of the focused cover). Easy to push further (angle, glow); I held back so it does not fight the crystal. Your call.
2. **Fling feel** (max speed, coast length, 1.8 s dwell, snap stiffness) is tuned by reasoning and a handful of recordings, not by hands-on play. Constants are at the top of the drag section of `orrery-motion.ts`.
3. A book can still slide under a *resting* cursor during a fling; hovering damps the coast within ~0.3 s and holds it there. If you would rather the orbit never stop for a passing book, say so.
4. The front-right focus pose now sometimes overlaps Mogzy's bubble (bubble is on top, not clickable): shift the pose or Mogzy.
5. Sound is deferred (above). Lite tier visuals have not been reviewed by you; `?quality=lite` shows them.
6. Still Chromium-only; still no real-GPU numbers; the integration items (§7.6) are untouched.

### Phase 3 candidates (not started)

Integration plan (swap `/lol` to the orrery via `useCoreNavigator`, `bare` instrument prop, Layout full-bleed, restore `hub_entered`, delete the V3 chassis, Firefox/WebKit runs, release and rollback notes); sound design if you approve touching the shared audio registry; real-device performance pass; tuning from your hands-on notes.

---

# Phase 1 (approved)

> Phase 1 status at the time: STOPPED FOR OWNER VISUAL REVIEW; approved ("the look and motion work").

## 1. Objective

Turn the V3 Four-Book Hextech Navigator (a pentagon chassis with four recessed book slots on a bench) into a much more
ambitious, animated, interactive scene: a large living Hextech Core floating in open magical space, the four real
champion-art books orbiting it, a floating Patch Report, and a deliberately composed (not orbiting) phone layout —
while preserving every V3 interaction contract and reusing V3's books, crystal, data, routing, Mogzy, Patch Report and audio.

## 2. What was built

| Brief item | Result |
|---|---|
| 1. Open atmospheric composition | Full-bleed deep-navy sky, violet / blue / gold haze, three light shafts, two parallax star fields, ten drifting Hextech fragments, vignette. No wall, pilasters, lamp or bench. |
| 2. No chassis, slots, clips, arms, floor | None of `.acore-chassis`, `.acore-cradle*`, `.acore-arm`, `.acore-room*`, `.acore-books-mounted` exist in the DOM (asserted). The compact instrument still *emits* four fixed-angle `.acore-channel` stub elements and the bezel cursor; both are `display:none` in the V3.5 sheet (asserted by reading the CSS). See §6. |
| 3. Significantly larger living Core | Dial ≈ 1.4× the V3 dial at 1366×768 (≈ 305 px across vs ≈ 220 px) with the ring assembly reaching ≈ 640 px, i.e. ~2.9× the dial's width and most of the stage's height. Layered: breathing halo ×2, periodic + per-focus shockwave, flat tick ring, counter-rotating rune ring, three comet arcs of flowing energy, **three gyroscopic rings in real CSS 3D** (they cross in front of and behind the crystal), a bearing needle that points at the book the Core is attending to, a curved `MODE · …` readout. |
| 4. Four genuinely orbiting books | `orrery-motion.ts` / `OrreryEngine.ts`. Each book rides an elliptical orbit (period 50 s) with depth-scaled size, depth-ordered stacking (far books pass *behind* the Core, near books *in front*), a few degrees of yaw toward the Core, always upright. Independent levitation per book (`translate` + `rotate` keyframes, four different periods). Faint dashed orbit path + orbital plane glow, and an energy **tether** from the Core to each book (lit and flowing for the attended one). |
| 5. Working navigation, hover and focus | Same `<Link>`s, hrefs and aria names as V3. **Hover** emphasises the book *in place* (grows, top of stack, others dim, orbit eases to 3.5 % speed, tether lights, crystal projects the room, Mogzy reacts) — it never runs from the pointer. **Keyboard focus and the crystal's pinned preview** have no pointer to lose, so that book is brought toward the viewer to a resting place beside the crystal. |
| 6. Floating Patch Report | The real `AcademyBroadcastCenterpiece` + radio, untouched, now levitating (7.5 s, slight 3D tilt) with a halo, a cast glow, a slowly turning rune circle beneath and rising sparks. Daily / Ranked and the Academy heading sit as floating lettering and rune-pills in the same space. |
| 7. Considered mobile presentation | No orbit. Two staggered tiers of floating books around a smaller Core (same rings), limited levitation, tap-to-focus, 44 px+ targets down to 320 px, Mogzy in the gutter, Patch Report floating below. |

## 3. Decisions (and why)

1. **Pose engine, not CSS 3D, for the books.** Positions come from one rAF loop writing `transform` onto four elements. That is what makes
   "stabilise under the cursor, then resume" and "bring the keyboard-focused book forward" possible; a pure-CSS orbit can only pause. React never
   re-renders for motion (page state changes only on focus).
2. **Pointer vs keyboard are separate.** A book under the cursor stays put (emphasis in place). Only books with no pointer on them travel to the
   front composition. This is the answer to the brief's "avoid pointer-chasing / hard-to-click movement".
3. **Real 3D for the gyro rings only.** Depth-sorting rings against the flat crystal is exactly what CSS `preserve-3d` is good at; it is free of JS.
4. **Design units + one `--u`.** The stage is 960×700 units (360×640 on phones); `.o35-stage` is a size container and `--u` is derived from it
   in CSS. No ancestor `transform: scale()` (it softens the books' text). Books are laid out at their largest drawn size and only ever scaled *down*
   or by the small emphasis growth, so text stays crisp.
5. **Far books go behind the Core.** This is the orrery. Consequence: a far book is partly hidden behind the dial for part of each revolution (§6).
   A circular `dial-block` absorbs pointer events over the dial disc only, so books are reachable everywhere the Core does not cover them.
6. **Compact V3 instrument reused as-is** (crystal, iris, bezel, all four projections, `focus`/`activating`/`media` props). Its fixed-angle bezel
   cursor is hidden and replaced by an engine-driven needle, because per-channel angles are meaningless when the books move.
7. **V3 logic lifted, V3 page untouched.** `useCoreNavigator` is the V3 page's focus / 240 ms activation / crystal-cycle logic as a hook
   (plus the pointer/keyboard split). It duplicates ~100 lines of `AcademyCoreHome` on purpose, to keep `/lol` byte-identical; Phase 2 should
   make the production page use the hook.
8. **Dev preview emits no `hub_entered`** (it would count looks at the preview as Landing→Hub conversions). `noindex`. One line to restore at integration.

## 4. Files

New (all under `src/pages/dev/academy-core-v35/` unless noted):

| File | Role |
|---|---|
| `AcademyCoreV35Page.tsx` | The page: composition, data hooks (as V3), engine wiring, two layouts. |
| `orrery-motion.ts` | Pure orbit mathematics: poses, depth, stacking, front composition, phone composition, easing, tether paths. |
| `OrreryEngine.ts` | The rAF controller (writes transforms, tether paths, needle, parallax; pauses off-screen / hidden tab / reduced motion). |
| `useCoreNavigator.ts` | V3 focus / activation / crystal-cycle behaviour, lifted into a hook. |
| `OrreryCore.tsx` | The enlarged Core around the unchanged V3 `AcademyCoreInstrument` (compact). |
| `OrreryEnvironment.tsx` | The open-space backdrop (memoised, aria-hidden, deterministic star field). |
| `academy-core-v35.css` | All presentation, scoped `.o35-`; loaded after the V3 sheet. |
| `orrery-motion.test.ts`, `AcademyCoreV35Page.test.tsx` | 43 unit / component tests. |
| `e2e/academy-core-v35.spec.ts` | 22 real-browser tests + an opt-in evidence suite. |
| `docs/handoffs/academy-core-v35/` | Evidence (below). |

Changed: `src/App.tsx` (+12 lines): a `import.meta.env.DEV`-gated lazy import and route for `/lol/dev/academy-core-v35` (and `/dev/…` redirect), the same pattern as
the other dev previews. **No other existing file is modified.** Reused unchanged: `academy-core-destinations`, `AcademyCoreInstrument`, `MogzyOperator`,
`academy-core-warm`, `academy-core.css`, `AcademyHubBook`, `AcademyBroadcastCenterpiece`, all data hooks.

## 5. Verification

### Motion is measured, not assumed

Positions of the four book wrappers sampled from a real browser (1366×768, idle, centres in px):

```
t=0   leaguecraft [1013,567]  pro-play [550,481]  combat-lab [745,280]  archives [1207,365]
t=3   leaguecraft [ 900,577]  pro-play [523,429]  combat-lab [856,265]  archives [1231,410]
t=6   leaguecraft [ 783,566]  pro-play [535,377]  combat-lab [971,270]  archives [1220,461]
t=9   leaguecraft [ 678,546]  pro-play [584,335]  combat-lab [1077,295]  archives [1173,509]
```

(≈ 35–50 px/s; widths change 125→170 px with depth.) The e2e suite asserts, over 9 s: every book travels > 100 px and the four together > 800 px, at least two books visibly
change apparent size, and the left-to-right order of the books changes. A further test asserts near books have a higher z-index than the Core and far books a lower one.
Hovered, the same book drifts < 25 px over 1.2 s and grows ≥ 6 %; the *other* books' travel falls below 30 % of free-orbit travel and recovers (> 2.5×) after the pointer leaves.

### Tests run

| Suite | Result |
|---|---|
| `vitest src/pages/dev/academy-core-v35` | **43 / 43** (22 orbit-maths properties + 21 rendered-page tests: contracts, structure, engine over fake time, reduced motion, phone layout) |
| V3 regression: `vitest src/pages/academy-core src/lib/route-prefetch.test.ts` | **53 / 53** (V3 untouched) |
| `playwright -c playwright.frontend.config.ts e2e/academy-core-v35.spec.ts --grep-invert evidence` | **22 / 22** (Chromium) |
| `eslint` on the new files | clean |
| `tsc -p tsconfig.app.json` | only the 2 pre-existing baseline errors (`OnboardingProfile.tsx`, `identity/connections.ts`), same as `origin/main` |

The e2e suite also covers: the V3 240 ms activation measured in-page (200–350 ms, then navigation); modified clicks left to the browser; keyboard Tab + focus ring + Enter;
the crystal cycling without navigating and the chosen book coming forward; reduced motion (zero running animations, books static, navigation immediate); phones at 390/320/430
(no overflow, no orbit, ≥ 44 px targets, Patch Report below); touch tap; **every control hit-testable** (this caught a real bug: the decorative Patch Report halo was intercepting
clicks on Ranked — fixed with `pointer-events:none`); `/lol` is still the V3 Core.

### Performance (honest numbers)

Measured over 6 s of idle in headless Chromium (software compositing), 1366×768, CDP `Performance.getMetrics`, V3 `/lol` vs V3.5 in the same harness:

| | main-thread busy | style recalc | script | rAF median / p95 |
|---|---|---|---|---|
| V3 `/lol` | 5.5–6.8 % | 1.2–1.5 % | ~0 % | 16.7 / 16.8 ms |
| **V3.5** | **17–19 %** | 6.8–7.1 % | 0.6–0.8 % | **16.7 / 16.8 ms** (60 fps held) |
| V3.5 mobile (390×844) | ~11 % | ~5 % | ~0 % | 16.7 / 16.8 ms |
| V3 mobile | 5.5 % | 1.5 % | ~0 % | 16.7 / 16.8 ms |

V3.5 costs roughly three times V3 on the main thread; it does not drop frames. A first build measured 21–24 %; one inherited custom property written per frame
(forcing subtree style recalcs) and SVG-group twinkle (whole-sky repaints) were found by ablation and fixed. With every CSS animation disabled the scene is ~10 %, so about
7 points are the ~80 compositor animations in aggregate (no single one dominates: each ablation moved the number by < 1 point). Not measured: real GPU hardware, a throttled laptop,
battery. Treat the numbers as relative, and see §7 for the Phase 2 levers.

### Evidence (`docs/handoffs/academy-core-v35/`, real champion splash art from the asset host)

- `orrery-motion-desktop.webm` — **29 s, 1366×768**: 7 s idle orbit, hover of Leaguecraft then Pro Play (needle, tether, projection, Mogzy), the crystal previewing all four rooms with
  each chosen book coming forward, then a click on Combat Simulation → 240 ms activation → navigation to Combat Lab. A white ring marks the pointer (headless capture has no cursor).
- `desktop-1366x768-orbit-t00s … t18s.png` — four stills six seconds apart (the books in four different places).
- `desktop-{1366x768,1920x1080,1280x660}-idle.png`, `desktop-1366x768-hover-{leaguecraft,pro-play}.png`, `desktop-1366x768-crystal-{leaguecraft,pro-play,combat-lab,archives}.png`.
- `mobile-{390x844,320x568,430x932}-{top,full}.png`, `mobile-390x844-crystal-preview.png`.

Regenerate: `V35_EVIDENCE=1 npx playwright test -c playwright.frontend.config.ts e2e/academy-core-v35.spec.ts -g evidence` (the recording lands in `_video/raw.webm` with a `meta.json`
of the ready / end offsets; the committed file is that clip trimmed and re-encoded with Playwright's bundled ffmpeg).

## 6. Known issues and honest limits

1. **Far books pass behind the Core.** Each book is partly hidden for roughly a fifth of every revolution (a hovered far book pops in front of the Core while hovered). Intended for an orrery, but it is
   the first thing I would ask you about (§8).
2. **Instrument DOM residue.** `AcademyCoreInstrument` compact still renders four `.acore-channel` stubs and the bezel cursor (hidden by CSS). Phase 2: a `bare` prop on the instrument.
3. **Performance cost** (above): 60 fps held in a software-rendered headless browser; ~3× V3's main-thread time; not measured on real GPUs or low-end devices.
4. **Chromium only.** Not run in Firefox / WebKit. Uses `translate`/`rotate` keyframes, `color-mix()`, `@property`, CSS masks and `preserve-3d`; all current in Firefox/Safari but unverified here (V3's Firefox config exists: `playwright.academy-core.config.ts`).
5. **Full-bleed hack.** `<main>` is capped at 1280 px by the shell; the preview breaks out with `width:100vw` and `html:has(.o35-root){overflow-x:clip}`. Fine for a dev route; production should opt the page out in `Layout`.
6. **1024–1180 px wide desktops** get a smaller orrery (scale ≈ 0.65–0.8; books ~125–150 px, text still legible) because the Patch Report column is fixed.
7. **Preview-only deviations from V3:** no `hub_entered`, `noindex`. Daily status with a *real* authenticated session remains unverified (as in V3).
8. **Mobile bubble.** When a room is previewed on a phone Mogzy's bubble overlays the right of the Core for as long as the preview is pinned (hidden at idle).
9. **Behaviour suite uses stubbed (icon) art**; the evidence set uses real art. `/lol` was verified unchanged by test, not by build: I did not run a production build.
10. Support books are dimmed while one is focused (opacity 0.66); their titles are less crisp then. Tunable.

## 7. Next phase (advanced interaction polish — not started)

Candidates, in the order I would take them, once you have judged the look and motion:
1. Fix whatever the visual review rejects (speed, depth range, Core ring density, support dimming, how far books hide behind the dial).
2. Direct manipulation: drag-to-spin with inertia and snap, scroll / wheel nudge, pointer-led parallax tuning.
3. Richer focus choreography: book "opens a crack" on hover, Core ring tempo and tint per room, a light beam to the focused book, optional gentle camera push on activation.
4. Sound design for orbit and focus (V3 cues are reused today).
5. Performance pass: pause off-screen environment groups, one pre-composed backdrop, adaptive quality tier, measure on real hardware.
6. Integration plan: make `/lol` use `useCoreNavigator` and the orrery, `bare` instrument prop, Layout full-bleed, restore `hub_entered`, delete the V3 chassis, Firefox/WebKit runs, release notes / rollback (route swap).

## 8. Questions for the owner

1. Is the 50 s orbit period right, or should it be slower / livelier?
2. Are books passing **behind** the Core acceptable, or should every book always stay in front of / beside it?
3. Is the Core now the focal point enough (ring density, glow), or too busy?
4. Patch Report: keep it as a floating artifact in a left column, or integrate it into the orbit space more (e.g. closer to the Core)?
5. Phone: composed floating arrangement (current), or a very slow, small-amplitude drift as well?

## 9. Run it

```bash
cd <worktree>            # C:\Users\mlmit\mogzy-wt\acore-v35
node node_modules/vite/bin/vite.js --port 5352 --strictPort
# open http://localhost:5352/lol/dev/academy-core-v35   (desktop width ≥ 1024 for the orbit; narrower for the phone composition)
npx vitest run src/pages/dev/academy-core-v35
npx playwright test -c playwright.frontend.config.ts e2e/academy-core-v35.spec.ts --grep-invert evidence
```

## 10. Guarantees

- Production `/lol` is unchanged: the only edit to an existing file is `src/App.tsx` (+12 lines, DEV-gated, identical in form to the other dev previews); the route does not exist in a production build.
- No backend / Supabase / Railway changes. No PR, merge or deploy. Only the V3.5 branch is pushed.
- Reused unchanged: destinations and routes, the 240 ms activation, crystal cycling, modified-click behaviour, reduced-motion handling, Mogzy dialogue and reactions, Patch Report and radio, Daily / Ranked shortcuts, analytics for the book doors, image warm-up and prefetch.
