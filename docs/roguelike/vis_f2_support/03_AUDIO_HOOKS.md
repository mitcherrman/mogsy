# VIS-F2 support · 03 · Audio hook map

One table of every Dynasty sound event, keyed to moment ids (`01_MOMENT_MAP.md`). Cue ids follow the existing registry naming (`ui.*`, `ranked.*`), adding a `dynasty.*` family. **v1 fallback** is an existing, voiced Mogzy cue to play until the dedicated sound exists (`none` = silent), so most hooks can sound today and get their own sound later without a code change.

## Legend

- **Unique** = a dedicated Dynasty sound. **Reusable** = one sound shared by several hooks, or an existing Mogzy cue kept as the final answer.
- **Pri:** **P0 = the owner-prioritized set: 12 signature cues (★) + 5 ambient loops** (see Signature set) · P1 = before owner playtest · P2 = polish.
- **v1 fallback** names are verified against `SFX_REGISTRY` (`src/lib/audio/sfx-registry.ts` @ `3d79759c`): all ten existing cues named here exist, and nine have a built-in Web Audio generator. **`none` means silent** until a dedicated voice exists.
- **PROTOTYPE-ONLY** marks hooks for behaviour the backend catalog does not implement yet (Elder, Dragon Soul, Dragon questions).
- **Rules (all cues):** respect the global sound setting; every cue has a visual twin (no information is audio-only); ≤ −14 LUFS short-term for ticks, louder only for W2/W3; one cue per moment plus at most one crowd one-shot (anything more stacking is a bug); no cue fires while an objective question timer is running except the answer feedback. Beds and loops are not cues: the tension loop keeps running, ducked −6 dB, under the questions.

## UI and flow

| Hook | Cue id | Trigger moment | Desired feeling | Pri | Unique / reusable | v1 fallback |
|---|---|---|---|---|---|---|
| UI click | `ui.button.press` | any button / card tap | Crisp, invisible | P1 | Reusable (keep) | same |
| Card focus | `dynasty.ui.focus` | `dyn.run.org_focus`, card select | Soft tick, paper-like | P2 | Reusable | `ui.button.press` |
| Screen advance | `dynasty.ui.advance` | primary "Continue" | Forward motion, light whoosh | P2 | Reusable | `ui.button.press` |
| Org chosen ★ | `dynasty.org.choose` | `dyn.run.org_choice` | Ownership: crest stamp, brass + drum | **P0** | Unique | `ranked.points.awarded` |
| Star picked | `dynasty.roster.pick` | `dyn.run.star_pick` | Pleased, light chime | P1 | Reusable (with sign) | `ui.button.press` |
| Recruit / sign player ★ | `dynasty.recruit.sign` | `dyn.season.sign_player` | "Got them": pen + stamp + chime | **P0** | Unique | `ranked.points.awarded` |
| Release (swap) | `dynasty.recruit.release` | swap outgoing card | Brief cost, soft whoosh down | P2 | Unique | none (silent) |
| Prep confirmed | `dynasty.prep.confirm` | `dyn.prep.confirm` | Work done, clipboard tick | P2 | Reusable | `ui.button.press` |
| Scout reveal | `dynasty.scout.reveal` | `dyn.prep.scout_reveal` | Intel: paper slide + tick | P2 | Reusable (= `ranked.discovery.reveal`) | `ranked.discovery.reveal` |
| Stage transition (season) ★ | `dynasty.season.segment` | `dyn.season.stage_transition` | Escalation: rising sting, bigger each segment | **P0** | Unique ×1, pitched per segment | `ranked.module.start` (`round.final` is silent) |

## Draft

| Hook | Cue id | Trigger | Feeling | Pri | U / R | v1 fallback |
|---|---|---|---|---|---|---|
| Champion select | `dynasty.draft.select` | `dyn.draft.champ_select` | Light, quick | P2 | Reusable | `ui.button.press` |
| Role lock | `dynasty.draft.lock_role` | `dyn.draft.role_lock` | Click-lock, pitch rises per row | P1 | Reusable (pitched) | `ui.button.press` |
| **Draft lock** ★ | `dynasty.draft.lock_all` | `dyn.draft.lock_all` | Committed: heavy lock + low hit | **P0** | Unique | `ranked.module.start` |
| Comp warning | `dynasty.draft.warn` | `dyn.draft.comp_warning` | Gentle caution, not an error | P2 | Reusable | none (silent) |

## Game

| Hook | Cue id | Trigger | Feeling | Pri | U / R | v1 fallback |
|---|---|---|---|---|---|---|
| Stage open | `dynasty.game.stage_open` | `dyn.game.stage_open` | Fresh chapter; one variant per stage (dawn / gold / ember) | P1 | Unique ×3 (or one, pitched) | `ranked.module.start` |
| Small event | `dynasty.game.event` | `dyn.game.event_small` | Soft notification | P1 | Reusable | `ranked.module.start` (soft) |
| Rare event | `dynasty.game.event_rare` | `dyn.game.event_rare` | Sparkle, "that was special" | P1 | Unique | `ranked.points.awarded` |
| Lane / team reveal | `dynasty.game.tile` | each of six tiles (`dyn.game.contests`) | Rhythmic ticks | P1 | Reusable (Web Audio generator, `minReplayMs` ≤ 250) | `ranked.discovery.reveal`: **only tiles 1 and 4 sound** (its `minReplayMs` is 850 and tiles land 330 ms apart) |
| Stage Winning | `dynasty.game.state_winning` | `dyn.game.state_winning` | Lift | P1 | Unique | `ranked.points.awarded` |
| Stage Losing | `dynasty.game.state_losing` | `dyn.game.state_losing` | Low, short, not an error buzz | P1 | Unique | `ui.feedback.error` (low vol) |
| Crowd swell | `dynasty.crowd.swell` | see 04 crowd system | Arena reacts | P1 | Reusable one-shot | none (silent) |
| Crowd roar ★ | `dynasty.crowd.roar` | see 04 | Peak | **P0** | Reusable one-shot (closeouts, 3/3, championship) | none (silent) |
| Crowd gasp | `dynasty.crowd.gasp` | see 04 | Shock | P1 | Reusable one-shot | none (silent) |
| Double-Winning closeout | `dynasty.game.closeout` | `dyn.game.closeout_double` | Domination: big hit + crowd roar | P1 | Unique (shared with objective closeout) | `ranked.match.victory` |
| Late verdict | `dynasty.game.verdict` | `dyn.game.late_verdict` | Gavel: decisive single hit | P1 | Unique | `ranked.module.start` (`round.final` is silent) |

## Objectives

| Hook | Cue id | Trigger | Feeling | Pri | U / R | v1 fallback |
|---|---|---|---|---|---|---|
| **Dragon start** ★ | `dynasty.obj.dragon_start` | `dyn.obj.dragon_start` (E1 `early.dragon`, skill-free) | Heat, wingbeat-like swell (original) | **P0** | Unique | `ranked.module.start` |
| Herald / grubs / soul | `dynasty.obj.minor` | Herald; soul point is **PROTOTYPE-ONLY** | Medium sting | P2 | Reusable | `ranked.module.start` |
| **Baron start** ★ | `dynasty.obj.baron_start` | `dyn.obj.baron_start` | Dread + opportunity: sub-drop, swell, then `dynasty.loop.tension` | **P0** | Unique | `ranked.module.start` (`round.final` is silent) |
| Objective tension loop | `dynasty.loop.tension` | stakes card open → outcome (all 3Q encounters) | Held breath, 70 bpm pulse | **P0** (loop 5 of 5) | Reusable loop | none (silent) |
| Elder start | `dynasty.obj.elder_start` | `dyn.obj.elder_start` (**PROTOTYPE-ONLY**) | Cold, ancient: icy shimmer + low choir pad | P1 | Unique | `ranked.module.start` (`round.final` is silent) |
| Decisive teamfight | `dynasty.obj.teamfight_start` | `dyn.obj.teamfight` | Clash: blades + drum roll | P1 | Unique | `ranked.module.start` (`round.final` is silent) |
| Question shown | (none) | `dyn.obj.question` | Silence is the design | – | – | – |
| **Right answer** | `ranked.answer.correct` | `dyn.obj.answer_right` | Clean confirm | P1 | Reusable (keep; Ranked parity) | same |
| **Wrong answer** | `ranked.answer.incorrect` | `dyn.obj.answer_wrong` | Clear, not cruel | P1 | Reusable (keep) | same |
| **3/3 success** ★ | `dynasty.obj.outcome_exceptional` | `dyn.obj.outcome_3` | Triumph: bright hit, rising tail + roar | **P0** | Unique | `ranked.match.victory` |
| 2/3 success | `dynasty.obj.outcome_success` | `dyn.obj.outcome_2` | Satisfied resolve | P1 | Unique | `ranked.points.awarded` |
| **Partial (1/3)** ★ | `dynasty.obj.outcome_partial` | `dyn.obj.outcome_1` | Bittersweet: major → suspended chord | **P0** | Unique | `ranked.points.awarded` |
| **Disaster (0/3)** ★ | `dynasty.obj.outcome_disaster` | `dyn.obj.outcome_0` | Gut-punch, recoverable: low impact + reverse cymbal | **P0** | Unique | `ui.feedback.error` |

If a Dragon or Elder question variant ships (both **PROTOTYPE-ONLY** today), it reuses the Baron outcome cues at a lower intensity (−3 dB, shorter tail). Only Baron gets the full set.

## Results, series, finals

| Hook | Cue id | Trigger | Feeling | Pri | U / R | v1 fallback |
|---|---|---|---|---|---|---|
| **Game win** | `ranked.match.victory` → `dynasty.result.game_win` | `dyn.result.game_win` | Earned win | P1 | Unique later | `ranked.match.victory` |
| **Game loss** | `ranked.match.defeat` → `dynasty.result.game_loss` | `dyn.result.game_loss` | Deflated, not punished | P1 | Unique later | `ranked.match.defeat` |
| Delta ticks | `dynasty.result.tick_up` / `_down` | `dyn.result.deltas` | Tiny ticks per row | P2 | Reusable | none (silent) |
| Trait earned | `dynasty.result.trait` | `dyn.result.trait_earned` | Curious chime | P2 | Reusable | none (silent) |
| **Series point** | `dynasty.series.point` | `dyn.series.point_won` / `_lost` (pitch down for lost) | Momentum | P1 | Reusable (pitched) | `ranked.points.awarded` |
| Match point | `dynasty.series.match_point` | `dyn.series.match_point` | Tension: two-note rising | P1 | Unique | none (silent) |
| Series win / loss | `dynasty.series.win` / `_loss` | series result | Bigger than a game | P1 | Unique ×2 | `ranked.match.victory` / `defeat` |
| **Finals intro** ★ | `dynasty.finals.intro` | `dyn.series.finals_intro` | Awe: ≤ 3 s rising strings + drum hit on title | **P0** | Unique | `ranked.module.start` (`round.final` is silent) |
| **Trophy / championship** ★ | `dynasty.end.championship` | `dyn.end.championship` | Catharsis: fanfare peaking inside the 3 s cinematic, tail ringing ≤ 2 s more under the legacy card | **P0** | Unique | `ranked.match.victory` |
| Run defeat | `dynasty.end.defeat` | `dyn.end.defeat` | Dignified close: soft low chord, then silence | P1 | Unique | `ranked.match.defeat` |
| Unlock earned | `dynasty.meta.unlock` | `dyn.meta.unlock` | Reward: key turn + sparkle | P1 | Unique | `ranked.points.awarded` |

## Signature set (owner-prioritized, 2026-10-19)

**12 signature cues (★):**

1. `dynasty.org.choose`
2. `dynasty.recruit.sign`
3. `dynasty.season.segment`
4. `dynasty.draft.lock_all`
5. `dynasty.obj.dragon_start`
6. `dynasty.obj.baron_start`
7. `dynasty.obj.outcome_exceptional`
8. `dynasty.obj.outcome_partial`
9. `dynasty.obj.outcome_disaster`
10. `dynasty.crowd.roar`
11. `dynasty.finals.intro`
12. `dynasty.end.championship`

**5 ambient loops** (defined in `04_AMBIENT_SYSTEMS.md`):

1. `dynasty.loop.stage` (arena air + crowd murmur)
2. `dynasty.loop.hq`
3. `dynasty.loop.scrim`
4. `dynasty.loop.backstage`
5. `dynasty.loop.tension`

Everything else is P1 or P2. Most of it is ticks and chimes, which suit Web Audio generators: no files and no licensing. Elder is deliberately outside the set while it is prototype-only.

**Kept existing cues:** `ui.button.press`, `ranked.answer.correct`, `ranked.answer.incorrect`. Ranked parity matters: the 3Q encounter should feel like the Mogzy quiz the player knows. `ranked.discovery.reveal` stays the fallback for tile reveals only until `dynasty.game.tile` exists (see the throttle note).

## What the prototype actually plays today (verified in `mogzy-wt/vis-f1` @ `3d79759c`)

`dynasty-v2` calls **8** cues:

- `ui.button.press` (`DynastyV2Prototype.tsx:67`)
- `ranked.match.victory` / `ranked.match.defeat` (`:79`)
- `ranked.discovery.reveal` (`GameView.tsx:211`, `:237`)
- `ranked.module.start` / `ranked.round.final` (`GameView.tsx:226`; `round.final` when the next stage is Late)
- `ranked.answer.correct` / `ranked.answer.incorrect` (`ObjectivePanel.tsx:89`)

Two of them do not sound as intended:

1. **`ranked.round.final` has no built-in voice** (`sfx-registry.ts:94` has no generator). It is silent unless an admin binds a sound in Audio Studio (the production binding was not checked). So the move into Late is silent today, and every fallback above uses `ranked.module.start` instead.
2. **`ranked.discovery.reveal` is throttled.** Its `minReplayMs` is 850 (`sfx.ts:356` drops replays inside that window), and the six tiles reveal 330 ms apart, so only tiles 1 and 4 make a sound.

**Throttle rule for fallbacks:** throttling is per cue, so two moments that share a fallback can swallow each other:

| Cue | `minReplayMs` |
|---|---|
| `ranked.module.start` | 300 |
| `ranked.points.awarded` | 180 |
| `ranked.match.victory` / `defeat` | 1000 |

A dedicated `dynasty.*` cue removes the collision. `play()` also returns early before the Audio Studio config has loaded and before the first user gesture unlocks audio.

## Implementation hook (for later, not now)

The Mogzy audio stack already supports this without new infrastructure (`src/lib/audio/`):

1. **Register** each `dynasty.*` cue in `SFX_REGISTRY` (`sfx-registry.ts`) with a group (`dynasty`), `minReplayMs` and `relativeGain`. Entries without a built-in voice are legal (they play nothing), the same as `ranked.round.final`.
2. **Voice** them one of three ways, cheapest first:
   - a Web Audio generator in `SFX_GENERATORS` (`sfx-renderers.ts`, 48 exist): right for ticks, locks, pips and chimes; no files and no licensing;
   - an **Audio Studio binding** (`admin-sfx-bindings.ts`, `AdminSounds.tsx`): the owner drops a licensed file onto a cue with no deploy of code;
   - `builtInAssetVoices` pointing at a file in `public/audio/sfx/` (empty today apart from a README).
3. **Call** through one `playMoment(momentId)` helper in `src/pages/dev/dynasty-v2/` that maps moment → cue → fallback cue, so the visual pass can wire every moment now.
4. **Gating is already there:** `play()` honours mute (`mogsy-sounds-muted`), the audio unlock, `minReplayMs` and `eventId` dedupe. The audio layer does **not** check reduced motion. Leave sound on under reduced motion (it is not motion). W3 stings peak inside the 3 s cinematic, and a skip fades any sting out over 300 ms.
5. **The five loops** (04) need a loop player. `mode-soundtrack.ts` (per-mode music via Audio Studio) and `academy-radio.ts` (fade-in, volume) are the closest patterns; reuse their fade/volume handling rather than adding howler or tone.

## Sourcing rules (owner decision 2026-10-19)

- **Original or appropriately licensed audio only.** "Original" covers Web Audio generators (`sfx-renderers.ts`), in-house synthesis or recording, and owner-made sounds. "Appropriately licensed" means a licence that covers a commercial web app (CC0, or a free licence whose terms allow it), stored next to the file with source, author, date and SHA-256 (`05_ASSET_INVENTORY.md` §4).
- **No paid purchase, subscription or commission without separate owner approval.**
- **Never import:** Riot game audio or music whose licence is unverified (including Tidecaller until its rights note is finished, and the Riot tracks in the backend `assets/audio/audio-inventory.csv`), or the third-party meme clips in `public/sounds/`.
