# Worlds Dynasty · VIS-F3 handoff — Living Worlds & Cinematic Media

**Status:** implemented and verified locally on branch `vis/vis-f3-living-worlds` (worktree `C:\Users\mlmit\mogzy-wt\vis-f3`), commit = the HEAD of that branch at handoff (SHA quoted in the delivery message).
Stacked on VIS-F2 `ae8e67fc` plus the three support-package commits cherry-picked from `vis/vis-f2-support-docs` (`b06d6956`, `ca236fe2`, `3aa806bc` → `d638b7b5`, `1c968fc2`, `db827f93`).
Dev-only route `/dev/dynasty-v2` (`?view=showcase`, `?view=objectives`, `?seed=`). Nothing pushed, merged or deployed. No backend, auth, schema, shared-CSS or production-integration changes.

Read with: `WORLDS_DYNASTY_VIS_F1_HANDOFF.md`, `WORLDS_DYNASTY_VIS_F2_HANDOFF.md`, and the support package `docs/roguelike/vis_f2_support/00–06`.

---

## 1. What changed, in one screen

| Area | VIS-F2 state | VIS-F3 |
|---|---|---|
| Known defects | 3 silent `ranked.round.final` cues, 850 ms-throttled tile ticks, no SIMULATED marks, no commentary limits, 360 px Baron tight | All five fixed (§2) |
| Sound | shared `useSfx` registry only | `audio.ts`: a self-contained Web Audio synth engine — 30 cues, 5 room loops, tension bed, scene crossfades, volume / loops / shared mute, first-gesture unlock |
| Ambient text | casters + chat, unlimited | "DYNASTY DESK · SIMULATED" / "SIMULATED CHAT" / "Simulated cam" marks; global rate limiter; **Ambience & sound** sheet (master, per-layer, density, volume, loops, test cue) |
| Rooms | flat gradients + two Mogzy rasters at low opacity | layered SVG illustrations: HQ common room, scrim room, war room (back wall → furniture / screens → foreground), screens flicker, dossier ring turns |
| Stadium | one look | three variants: `normal`, `elimination` (red rig, ELIMINATION board), `finals` (violet-gold, 7 rigs, flag wall); three audience tiers with phone lights, big boards, two player pods, front row |
| Objectives | sigil + light wash header | `spectacle.tsx`: the Baron pit on the Rift (jungle walls, river glint, violet mist, the worm rising, eyes lit), Dragon ember pit, Elder ice pit; tension bar; phase-aware height; outcome wash + flash; "E1 contract · 3Q" on Baron, "Prototype-only" on Dragon / Elder |
| Players | monogram portraits, plain trait chips | four-tier `PortraitSlot` (real → art → placeholder → monogram; the two image tiers are empty on purpose), `TraitChip` with the **GEN** mark, "Generated in-run" on every condition row |
| Champions | cards in the draft | `LineupStrip` at walk-out: five class-glyph tiles slide in, composition identity badge, "peaks Early / Mid / Late" |
| Cinematics | story beats | W2 `CineFrame` (signing, tunnel walk, rare outplay, elimination-game victory) and W3 `FullFrame` (Worlds Final intro, Championship: ≤ 3 s, tap / Esc / Skip, static under reduced motion) |
| Showcase | scenes, stingers, cards | + stadium variants, six spectacle tiles, four comic frames, both full frames, the Ambience panel |

Everything new lives in `src/pages/dev/dynasty-v2/` — `audio.ts`, `ambience.tsx`, `spectacle.tsx`, `cinematics.tsx`, `portraits.tsx`, `vis-f3.css`, with edits to `broadcast.tsx`, `scenes.tsx`, `cards.tsx`, `media.ts`, `GameView.tsx`, `ObjectivePanel.tsx`, `DynastyV2Prototype.tsx`, `screens.tsx`, `Showcase.tsx`. `engine.ts`, `fixtures.ts`, `objectives.ts` are untouched: every seed replays identically.

---

## 2. The five known defects

| Defect | Fix | Where |
|---|---|---|
| Three silent `ranked.round.final` triggers (series point, Elder stinger, Late stage open) | All stingers and moments now play **Dynasty cues**: `dynasty.series.match_point`, `dynasty.obj.elder_start`, `dynasty.game.stage_open` (+ a crowd swell into Late). `useSfx` is no longer imported by the prototype shell or the game view; only the two answer sounds still come from the shared registry. | `DynastyV2Prototype.tsx`, `GameView.tsx`, `audio.ts` `MOMENT_CUES` |
| Tile reveal sound throttled (`ranked.discovery.reveal` minReplay 850 ms vs 330 ms tiles) | `dynasty.game.tile`, minReplay 120 ms: one tick per tile. A verdict cue lands on the sixth tile (`state_winning` / `state_losing`, the gavel on Late). | `GameView.tsx` reveal effect |
| Missing simulated-state labelling | `SimTag` on every text layer: "DYNASTY DESK · SIMULATED", "SIMULATED CHAT", "Simulated cam"; `TraitChip` carries a **GEN** suffix and sr-only "(generated in-run)"; every condition row ends with "Generated in-run"; Dragon / Elder encounters carry "Prototype-only", Baron carries "E1 contract · 3Q". | `broadcast.tsx`, `cards.tsx`, `ObjectivePanel.tsx` |
| Commentary rate limits (04 rule 6) | `claim()` limiter in `broadcast.tsx`: ≥ 8 s between any two ambient text items, ≤ 6 per game, ≤ 1 pop-in, ≤ 3 chat bursts, nothing while a question is open (`ambientQuestionOpen`), per-game reset (`ambientNewGame`), decisions remembered per key so re-renders are stable and excess items are **dropped, not queued**. The showcase gallery is `exempt`. Reduced density halves the caps. | `broadcast.tsx`, `GameView.tsx`, `ObjectivePanel.tsx`, `DynastyV2Prototype.tsx` |
| 360 px Baron fit | The pit shrinks with the phase (stakes 140 px / ask 84 px / outcome 120 px on phones), the sigil is smaller (44 / 34 px), and the encounter still hides the context rows on phones (VIS-F1 focus stage). Measured at 360×780 in a real game-1 Baron: stakes card fits: the "Go for the Baron" button bottom sits at 770 px of a 780 px viewport (was 907 px before VIS-F3); questions: three options end at 636 px and Next at 724 px; outcome: Continue at 707 px; no horizontal overflow (scroll width 360; the draft fieldset's min-content overflow to 706 px was fixed with `min-w-0`). On phones the encounter now also hides the stage strip and advantage meter (restored at `sm:`). | `spectacle.tsx`, `ObjectivePanel.tsx` |

---

## 3. Sound (`audio.ts`)

- **Original audio only.** Every cue and loop is synthesized in the browser (oscillators, filtered noise, short envelopes). No audio files were added; no Riot audio, no third-party clips, nothing from `public/sounds/` is used (05 §2 found those unclear). The missing *produced* assets are listed in §7.
- **Cues (30)** — the 12 signature cues from 03 plus supporting ones: `dynasty.org.choose`, `recruit.sign`, `season.segment`, `draft.lock_role`, `draft.lock_all`, `obj.dragon_start`, `obj.baron_start`, `obj.elder_start`, `obj.teamfight_start`, `obj.outcome_exceptional|success|partial|disaster`, `crowd.swell|roar|gasp`, `finals.intro`, `end.championship`, `end.defeat`, `game.tile|stage_open|verdict|closeout|state_winning|state_losing`, `series.point|match_point`, `result.game_win|game_loss`, `ui.advance`. Per-cue replay guard (`MIN_REPLAY`), −6 dB loop duck under every cue.
- **Loops (5)** — `loop.hq`, `loop.scrim`, `loop.backstage`, `loop.stage`, `loop.tension` (70 bpm pulse). `Scene` calls `setScene()` on mount: 400 ms crossfade; Worlds nodes run the stage loop louder (`loud`). `ObjectivePanel` holds `setTension(true)` from stakes to outcome and ducks the stage bed.
- **Moments → cues**: `MOMENT_CUES` maps the 01 moment ids (`dyn.*`) to cues; `playMoment()` is what the screens call.
- **Controls / rules**: honours the global mute key `mogsy-sounds-muted` (+ its change event and cross-tab `storage`), Dynasty volume `dynasty.audio.volume`, loops `dynasty.audio.loops`; first-gesture unlock (`pointerdown` / `keydown` / `touchend`); silent and side-effect free when Web Audio is unsupported, muted or locked; `stopAllDynastyAudio()` for unmount. A dev-only `window.__dynastyAudio` hook exists for browser verification.
- **Verified in the browser pane** (desktop): snapshot `supported: true`, `unlocked: true` after a real click; `playCue()` → `true`, `lastCue` updates; `setMuted(true)` → `playCue()` returns `false`; volume persists to local storage; `setScene("stadium", true, true)` → `scene: "stadium"`. The Ambience sheet's **Play a test cue** button reports `ready`.

## 4. Ambience & sound sheet (`ambience.tsx`)

Button in the run bar (and top-right on pre-run screens): **Sound** (mute all Mogzy sounds, Dynasty volume, room loops, test cue, state line) and **Ambience** (master, Caster desk, Reactions, Chat, density Full / Reduced). On by default, stored in `dynasty.ambience`. Switching a layer off hides mounted items at once (claims are invalidated on every settings change).

## 5. Scenes, stadium, spectacles, frames

- `scenes.tsx` — HQ, practice and war room are 1000×600 SVG rooms with the org accent on banners / wordmarks / table rings; rendered at 0.62 opacity under a wash that is strongest at the top so titles stay readable. Motion: screen flicker (7 s), phone-light twinkle, dossier ring rotation, beam sweep — all under `.dyn-scene--motion`, frozen by the VIS-F1 reduced-motion rules.
- Stadium variant is chosen in `GameView`: `finals` on the last season node, `elimination` on Worlds nodes or when facing match point, else `normal`; `data-variant` on `game-view`.
- `spectacle.tsx` — `ObjectiveSpectacle` replaces the pit header (`data-testid="objective-pit"` kept, plus `data-spectacle`, `data-phase`). The Baron and the drakes are original silhouettes; the Baron pit explicitly reads "Summoner's Rift · Baron pit". Tension bar fills during stakes; outcome tone paints the wash and the creature falls on a success.
- `cinematics.tsx` — `CineFrame` (W2) at: prep after a signing, game 1 walk-out (with `LineupStrip`), any stage with a rare event (plus one `ReactionPop`), game result when the win came while facing elimination or at Worlds. `FullFrame` (W3) fires from the flow at draft lock of game 1 of the Worlds Final (`dyn.series.finals_intro` cue) and when the title is won (`championship`); 3000 ms (2500 ms static under reduced motion), tap / Enter / Space / Esc / Skip; `cine-full`, `cine-skip` test ids.

## 6. Player identity (`portraits.tsx`, `cards.tsx`)

`PortraitSlot` runs the owner's four-tier chain: `PORTRAIT_REAL` (approved real portrait, needs a rights row) → `PORTRAIT_ART` (original art) → `PlaceholderPortrait` (code-drawn silhouette, seeded hair / skin / jersey stripe, no facial features) → `Monogram`. Both image tiers are **empty** in the prototype (no licence to real-player imagery for Dynasty, no art commissioned); an image error falls through automatically; `data-tier` reports the live tier. Simulated traits never sit inside the frame.

---

## 7. Provenance report

| Asset | Source | Status |
|---|---|---|
| All scene / pit / frame / trophy / crest / portrait art | Drawn in this repo (SVG + CSS), `provenance: "code"` in `MEDIA_SLOTS` | Original, no rights needed |
| Caster / pop-in / hero mascots (`/mascot/mogzy-*.webp|png`) | Existing Mogzy mascot art | Mogzy-owned per 05; provenance rows still to be written by the owner |
| `scene.hq` far layer `/assets/ranked/ranked-academy-duel-bg-960w.webp`, `scene.practice` far layer `/images/lol-hub/leaguecraft-classroom-bg.png` | Existing Mogzy backgrounds (10 % opacity) | Same as above |
| Role emblems (`RoleEmblem`) | Existing Mogzy ranked emblems | Same as above |
| Audio (30 cues, 5 loops) | Synthesized in `audio.ts` | Original |
| Real-player portraits, real Worlds / Summoner's Cup marks, Riot champion art, Riot audio | **Not used** | By decision (05 §3) |
| Fonts | Cinzel / Inter already loaded by the app | Unchanged |

Nothing was purchased or downloaded. **Still missing (needs owner decisions / budget):** produced ambience loops and crowd beds (the synth stands in), original fictional-player portraits (tier 2), a Baron hero illustration (02 `obj.baron.hero_art`), Mogzy-asset rights rows, six prep action icons, an original Worlds mark beyond the laurel glyph used here.

---

## 8. Verification

- `vitest run src/pages/dev/dynasty-v2` — **49 / 49** (43 inherited + 6 VIS-F3: cue routing and slot provenance; limiter gap / open-question / settings; SIMULATED labels, placeholder tiers, Ambience sheet; walk-out strip + tunnel frame + variant + prototype-only label; Baron E1 label in the gallery; W3 frame ≤ 3 s and skip). Every test starts with the limiter and settings reset.
- `tsc --noEmit -p tsconfig.app.json` — no errors in `dynasty-v2` (the two repo-wide errors in `OnboardingProfile.tsx` / `connections.ts` pre-date this work).
- `eslint src/pages/dev/dynasty-v2` — 0 errors, 21 warnings, all `react-refresh/only-export-components` (files that export helpers next to components; same class as VIS-F1/F2).
- Browser pane (app's built-in browser, per AGENTS.md): desktop 1280×800 full flow home → roster → recruit → prep → scout → draft → walk-out → Dragon → scoreboard → Mid closeout → result → tactic, then a second game to a **real Baron window** (stakes → 3 questions → Exceptional → closeout); showcase variants, spectacles, frames, both full frames; audio probe (above). 390×844 flow to a real Baron (stakes / ask / outcome). 360×780 flow to a real Baron: stakes card fits: the "Go for the Baron" button bottom sits at 770 px of a 780 px viewport (was 907 px before VIS-F3); questions: three options end at 636 px and Next at 724 px; outcome: Continue at 707 px; no horizontal overflow (scroll width 360; the draft fieldset's min-content overflow to 706 px was fixed with `min-w-0`). On phones the encounter now also hides the stage strip and advantage meter (restored at `sm:`). Reduced motion: with `html.reduce-motion` added live (the app's own switch, observed by `useReducedMotionPreference`): 0 `.dyn-spect--motion`, `.dyn-scene--motion` and `.dyn-frame--motion` elements, tension bar static at full, the championship full frame mounts without `dyn-cine--motion`, its title is visible at once (no animation) and it dismisses itself by 2.5 s.
- Evidence: `C:\Users\mlmit\OneDrive\Desktop\vis-f3-dynasty-shots\{desktop,mobile-390,mobile-360}` (not committed).

## 9. Remaining limitations

1. **Produced audio** — the synth engine is original and complete in behaviour, but the loops are placeholders for produced beds; mixing levels were tuned by ear on one machine.
2. **Image tiers are empty** — the portrait chain is wired and tested but shows the placeholder tier everywhere until art or licensed portraits (with rights rows) exist.
3. **Chat on phones** — the limiter and the 04 "phone overlay" rule mean chat rarely appears on phones; it is text texture, not information.
4. **Finals / championship in the flow** need a run to reach the Worlds Final; verified in the flow logic by tests and in the showcase in the browser (the full frames themselves are the same component).
5. **Elimination variant trigger** is a reading of 04 ("Worlds node or facing match point"); the owner may prefer playoffs too.
6. **Confetti / blur-based text effects** are compositor-friendly now, but a background tab still throttles SVG `.dyn-screen` flicker; harmless.
7. The `?view=objectives` gallery mounts the real panel, so it benefits from the spectacle; its Elder / Dragon tiles carry the Prototype-only label as in the flow.
