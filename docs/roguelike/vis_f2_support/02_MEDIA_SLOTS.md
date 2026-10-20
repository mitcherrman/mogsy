# VIS-F2 support · 02 · Media slot map

Every place Dynasty may want premium visual media, keyed to moment ids in `01_MOMENT_MAP.md`. Use the **slot id** as a stable hook: a `data-media-slot="<id>"` attribute (or a `<MediaSlot id>` wrapper) on the frame lets art drop in later without layout change, the same rule as Pro Play's `DossierMedia` ("frame geometry is identical with or without art").

## Legend

- **Type:** `css` (gradient, light, grain), `svg` (inline sigil, crest, glyph), `type` (typography only), `raster` (image), `anim` (CSS keyframes), `loop` (short video / Lottie / sprite), `photo` (real photography).
- **Motion:** S = static, A = animated, O = optional (works static, motion is a bonus).
- **Source acceptable:** **R** real asset required eventually · **P** placeholder fine for now · **G** generated / code-drawn is the final answer. Combinations read "first acceptable → eventual" (e.g. `G→R`).
- **Priority:** P0 = the VIS-F2 cinematic pass needs a decision now · P1 = before owner playtest on real data · P2 = polish / SOCIAL-1.

## Run start

| Slot id | Moment | Asset type | Pri | Motion | Source | Notes |
|---|---|---|---|---|---|---|
| `home.title_backdrop` | `dyn.run.home` | css + type | P1 | O | G | VIS-F1 stage light + Cinzel already does it |
| `home.resume_crest` | `dyn.run.resume` | svg | P1 | S | G | VIS-F1 hex crest |
| `org.card_crest` | `dyn.run.org_focus` | svg → raster | **P0** | S | G→R | Fictional orgs: the code crest is final. Real orgs (later): 16 focus-team crests exist, but each needs its own Dynasty rights row (05 §3) |
| `org.card_backdrop` | org select | css / raster | P1 | O | G | Accent wash; optional org "arena" texture |
| `org.choice_reveal` | `dyn.run.org_choice` | anim + svg | **P0** | A | G | Crest scale-in + accent flood (S1) |
| `org.star_portraits` | org card | svg → raster | P1 | S | G→R | Uses the `player.portrait` tiers below. A fictional player gets original art, a premium placeholder or a monogram, never a real person's photo |

## Players and recruitment

| Slot id | Moment | Asset type | Pri | Motion | Source | Notes |
|---|---|---|---|---|---|---|
| `player.portrait` | all player cards | svg → raster / photo | **P0** | S | G→R | **Tiered (owner decision 2026-10-19):** (1) an approved real-player portrait, with its own rights row (05 §3); (2) original fictional-player artwork; (3) a premium placeholder (styled silhouette in the org accent); (4) the monogram ring (star / academy / signed). Same frame geometry for all four, and the fallback chain runs on error. The ring colour carries star / academy / signed in every tier |
| `player.trait_chip` | player cards, results | svg + type | **P0** | S | G | Every simulated trait or mood (Confidence, Overconfident, Pressure) carries the **Generated in-run** source chip, sits outside the portrait frame, and never reads as a caption on a real person's photo |
| `player.role_emblem` | player cards, draft | raster | P1 | S | R (exists) | Ranked role emblems reused |
| `player.card_frame` | player cards | css | P1 | S | G | Rarity is cosmetic only: frame tint, never a power cue |
| `player.signature_glyph` | star cards | svg | P2 | S | G | Optional per-archetype glyph (laner, roamer, carry) |
| `recruit.sign_reveal` | `dyn.season.sign_player` | anim + svg | **P0** | A | G | Card flip / ink-stamp "SIGNED" (S2) |
| `recruit.honeymoon_chip` | recruit | svg | P2 | O | G | |

## Season path

| Slot id | Moment | Asset type | Pri | Motion | Source | Notes |
|---|---|---|---|---|---|---|
| `season.path_nodes` | `dyn.season.hub` | svg | P1 | S | G | Exists (VIS-F1) |
| `season.segment_banner` | `dyn.season.stage_transition` | type + css + svg | **P0** | A | G | "PLAYOFFS" / "WORLDS" banner; segment-specific light |
| `season.worlds_mark` | Worlds nodes | svg | P1 | S | G | Original "Worlds" mark; **never** the real Worlds logo or the Summoner's Cup (05 §3) |
| `season.venue_plate` | segment transition, finals | raster / css | P2 | O | P→G | Arena silhouette; illustrated, not a photo of a real venue |

## Prep, scout, draft

| Slot id | Moment | Asset type | Pri | Motion | Source | Notes |
|---|---|---|---|---|---|---|
| `prep.action_icon` ×6 | prep cards | svg | P1 | S | G | Solo queue, scrims, VOD, bonding, rest, champion practice |
| `prep.room_backdrop` | prep | css | P2 | O | G | HQ / scrim-room light (pairs with `dynasty.loop.hq` / `.scrim`, 04) |
| `scout.dossier_texture` | scout | css | P2 | S | G | |
| `scout.opponent_crest` | scout, series briefing | svg → raster | P1 | S | G→R | Same rule as `org.card_crest` |
| `draft.champion_tile` | draft rows | raster | **P0** | S | P→R | Synthetic champs: class glyph (G). Real champs: Mogzy champion art (exists) |
| `draft.champion_splash_strip` | `dyn.draft.lock_all` | raster | P1 | A | R (exists) | Five cropped splashes slide into a lineup strip (S3) |
| `draft.lock_stamp` | `dyn.draft.role_lock` | anim | **P0** | A | G | |
| `draft.comp_identity_badge` | comp read-out | svg + type | P1 | S | G | e.g. "Front-to-back" |
| `draft.fearless_strike` | Fearless list | css | P1 | S | G | |

## Game

| Slot id | Moment | Asset type | Pri | Motion | Source | Notes |
|---|---|---|---|---|---|---|
| `game.stage_mood` | `dyn.game.stage_open` | css | P1 | A | G | Exists; the light is the cinematic |
| `game.stage_title` | stage open | type | P1 | A | G | |
| `game.event_icon` | small events | svg | P1 | S | G (R possible) | Scuttle, grubs, plates, solo kill, item spike. Real art exists for Scuttle, Voidgrubs, turret (05) |
| `game.rare_event_frame` | `dyn.game.event_rare` | anim | P1 | A | G | Gold sheen exists |
| `game.closeout_hero` | `dyn.game.closeout_double` | type + anim | P1 | A | G | |

## Objectives

| Slot id | Moment | Asset type | Pri | Motion | Source | Notes |
|---|---|---|---|---|---|---|
| `obj.dragon.sigil` | `dyn.obj.dragon_start` | svg | **P0** | O | **G** | No neutral Dragon art exists, by decision (05). Keep the code sigil. E1's Dragon is skill-free and post-stage; the Dragon **question** variant is **PROTOTYPE-ONLY** |
| `obj.dragon.element` | Dragon / soul | svg | P2 | S | G | Only if the event states an element. Soul is **PROTOTYPE-ONLY** (deferred in E1) |
| `obj.herald.icon` | `dyn.obj.herald` | raster | P1 | S | R (exists, 128 px) | Backend serves it at `/assets/objectives/baron_pit_herald.png`; chip size only; Riot IP (05) |
| `obj.baron.sigil` | `dyn.obj.baron_start` | svg | **P0** | A | G | Exists (horns + eye) |
| `obj.baron.hero_art` | Baron stakes card | raster / illus | P1 | O | P→G | Backend holds a 128 px wiki square (`assets/objectives/baron_pit_baron.png`): fine for chips, too small for a hero. Plan an original silhouette illustration; commissioning or buying one needs separate owner approval |
| `obj.baron.pit_backdrop` | Baron encounter | css / raster | P1 | A | G | Violet fog, pit rim light |
| `obj.elder.sigil` | `dyn.obj.elder_start` | svg | P1 | O | **G** | **PROTOTYPE-ONLY** (no Elder in the backend catalog). Keep the ice-crown sigil. A small `elder-dragon.webp` icon exists in the frontend (`public/assets/ranked/`, ~4.7 KB, provenance undocumented): chip size only |
| `obj.teamfight.sigil` | `dyn.obj.teamfight` | svg | P1 | S | G | Exists |
| `obj.stakes_ladder` | stakes card | css + type | P1 | S | G | Exists |
| `obj.outcome_art` ×4 | `dyn.obj.outcome_0..3` | anim (+ mascot) | **P0** | A | G | Burst / rise / pulse / jolt exist; optional mascot pose per tier |

## Results and endings

| Slot id | Moment | Asset type | Pri | Motion | Source | Notes |
|---|---|---|---|---|---|---|
| `result.hero_mascot` | game win / loss | raster | P1 | O | R (exists) | Cheering / defeated in use; 14 poses exist (`MOGZY_MASCOT_ASSETS`), e.g. `thinking` for 1/3, `sad` for 0/3 |
| `result.bo5_pips` | series point | svg | P1 | A | G | Exists |
| `series.result_hero` | series win / loss | type + anim | P1 | A | G | |
| `finals.intro_card` | `dyn.series.finals_intro` | type + svg + css (+ loop) | **P0** | A | G (loop optional) | Approved W3: ≤ 3 s, immediately skippable. Two crests face off, "WORLDS FINAL" (S6). The reduced-motion alternative is the same card, static |
| `finals.vs_plate` | finals intro | svg | **P0** | A | G | |
| `end.trophy` | `dyn.end.championship` | svg / illus | **P0** | A | **G** | Original Dynasty trophy; **not** a Summoner's Cup likeness (05 §3). Approved W3 moment (S7) |
| `end.confetti` | championship | anim | P1 | A | G | Gold flecks; one burst, not a loop |
| `end.champion_banner` | championship | type + css | **P0** | A | G | |
| `end.defeat_plate` | `dyn.end.defeat` | css + raster | P1 | S | G + R (mascot) | Desaturated, dignified, not punitive |
| `end.legacy_card` | `dyn.end.legacy_card` | css + svg | **P0** | S | G | Exists; export-ready frame (SOCIAL-1) |
| `meta.unlock_reveal` | `dyn.meta.unlock` | anim + svg | P1 | A | G | "New option unlocked" key-and-lock motif |
| `meta.legacy_shelf_cards` | legacy shelf | css | P2 | S | G | Thumbnails of past legacy cards |

## What this adds up to

- **Nothing in P0 requires sourced raster art.** Every P0 slot can be finished in CSS / SVG / type, which is the VIS-F1 direction. The cinematic lift comes from motion, light and audio, not imagery.
- Real media only enters at `draft.champion_tile` / `draft.champion_splash_strip` (champion art Mogzy already serves), `obj.herald.icon` and small event icons (wiki objective squares), crests for real orgs, and the mascot.
- The raster gaps worth filling are **a Baron hero illustration** (`obj.baron.hero_art`), later **an original trophy** (`end.trophy`) if the SVG reads too thin at hero size, and **original fictional-player artwork** (tier 2 of `player.portrait`). They can be made in-house. Any commission or paid purchase needs separate owner approval.
- Real-player portraits (tier 1) enter only one by one, each with an approved rights row; none qualifies today (05 §3).
