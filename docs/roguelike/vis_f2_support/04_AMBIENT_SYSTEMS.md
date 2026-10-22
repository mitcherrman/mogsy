# VIS-F2 support · 04 · Ambient systems plan

Lightweight layers that make Dynasty feel like a season on broadcast without adding gameplay. **Structure and timing only**; no engine work is implied.

## Ground rules (apply to every layer)

1. **Never carries information the player needs.** Every fact stays on the cards; ambient text is colour. Screen readers get one polite line per moment at most; the rest is `aria-hidden`.
2. **Generated, labelled, fictional.** Lines are templates filled from stored run facts (org, role, champion, stage result). They are *Generated in-run* content (D0 §12 label system).
   - Never real caster names, real streamer handles, quotes attributed to real people, or claims about a real pro's psychology.
   - A real pro's name may appear only as the subject of a recorded game fact ("Mid wins lane"), never as a speaker or with an invented emotion.
3. **Fictional attribution, visibly.** Every speaker is a fictional persona and is labelled as one:
   - the caster strip's eyebrow reads "DYNASTY DESK · SIMULATED";
   - pop-in avatars are Mogzy mascots with invented names;
   - the chat column's header reads "SIMULATED CHAT".

   No real broadcaster's or streamer's name, likeness, voice, catchphrase, channel art or platform emote, and no persona styled to be mistaken for one.
4. **One voice at a time.** At most one ambient text layer is visible at once; it yields to any W2/W3 moment and to an open objective question. The championship (S7) is the one sequenced exception: caster line → pop-in → chat burst, one after another, never overlapping.
5. **On by default, with visibility controls (owner decision 2026-10-19).**
   - The text layers (caster desk, reactions, chat) start **on**.
   - Settings: one **Ambience** master switch; per-layer switches (Caster desk / Reactions / Chat); a **density** choice (Full / Reduced, where Reduced halves every cap and turns chat off on phones).
   - These are per-viewer preferences; local storage is acceptable, and the defaults apply when it is unavailable.
   - Audio layers follow the existing global mute and mode-music volume.
   - Reduced motion keeps the text but removes the slide-ins.
6. **Rate limits (global, on top of the per-layer caps below).**
   - At least 8 s between any two ambient text items.
   - At most 6 ambient text items per game.
   - At most 1 pop-in per game and 3 chat bursts per game.
   - Nothing during an open question or in the first 1.5 s of a W2/W3 moment.
   - Excess items are dropped, never queued, so text never trails behind the action.
7. **Deterministic.** Template choice is seeded by the run seed + moment id, so replays and captures match.

## Ambient loops (the five owner-prioritized loops)

All loops play quietly under the cues: ducked −6 dB on any cue, with a 400 ms crossfade between rooms. Ship each as one seamless 20–40 s loop (OGG/Opus + AAC fallback, ≤ 300 KB). None exist in Mogzy today (05). Sourcing: original or appropriately licensed only; no paid purchase without separate approval (03, Sourcing rules).

| # | Loop id | Where it plays | Feel | Notes |
|---|---|---|---|---|
| 1 | `dynasty.loop.stage` | Game view (all stages), results | Arena air: low crowd murmur, PA reverb tail | Base layer for the crowd one-shots below; +3 dB at Worlds nodes |
| 2 | `dynasty.loop.hq` | Home, season hub, roster, recruit | Calm office: HVAC hum, far keyboard, one distant laugh every ~20 s | The "home base" loop; lowest level |
| 3 | `dynasty.loop.scrim` | Prep, scout, draft | Focused: dense mechanical keys, mouse clicks, muffled callouts (no words) | Steps up one notch at `dyn.draft.lock_all` |
| 4 | `dynasty.loop.backstage` | Series briefing, between-game tactic, finals walk-up | Corridor: muffled crowd through walls, footsteps, a door | Bridges scrim → stage |
| 5 | `dynasty.loop.tension` | Objective stakes card → outcome | Held breath, 70 bpm pulse | Ducks −6 dB once questions open; stops on the outcome |

## Crowd system

A murmur inside `dynasty.loop.stage`, plus three one-shots (`dynasty.crowd.swell`, `dynasty.crowd.roar` ★, `dynasty.crowd.gasp`). The **one-shots are driven by moments**. VIS-F2's visual `CrowdMeter` / `crowdLevel` (rises with the lead and with a Baron on the table) may set the stage loop's gain, within ±3 dB, but never fires a one-shot by itself.

| Level | Trigger moments | Shape |
|---|---|---|
| **Murmur** (always in game view) | `dyn.game.stage_open` | Steady |
| **Swell** | `dyn.game.state_winning`, `dyn.game.event_rare`, `dyn.obj.answer_right` on Q3, `dyn.series.match_point` | 1.5 s rise and fall |
| **Roar** | `dyn.game.closeout_double`, `dyn.obj.outcome_3`, `dyn.result.game_win` in an elimination series, `dyn.end.championship` | 3 s burst + tail |
| **Gasp / groan** | `dyn.obj.outcome_0`, `dyn.game.state_losing` in Late, `dyn.series.elimination` | 1 s, then the stage loop drops a notch |

Cap: at most one swell per stage and one roar per game (the championship is exempt). Worlds nodes run the stage loop +3 dB louder than the regular season: the cheapest "bigger stage" signal there is.

## Caster-style text overlays ("lower third")

A one-line strip at the bottom of the focus stage, broadcast lower-third style: small org crest, a Cinzel eyebrow ("DYNASTY DESK · SIMULATED"), one sentence in Inter.

- **When:** `dyn.game.stage_open` (stage framing), `dyn.game.stage_tally` (one-line read), `dyn.obj.baron_start` (stakes framing), `dyn.game.late_verdict` / closeouts. Nowhere else.
- **Cap:** 1 per stage, 4 per game, inside the global limits (rule 6). Visible 2.5 s or until the next tap.
- **Template examples:** "Early goes to {org}: {won_lanes} lanes and the team fight." / "Baron's up, and {org} has the numbers." / "Late game. Every point decides it." Templates key on stored results only (`you_label`, five-state, `settlement.how`).
- **Voice:** two fictional desk personas at most ("Desk A" play-by-play, "Desk B" colour), named generically (invented names, never a real caster's name or style catchphrase) or not at all. Never voiced audio in v1 (VO is a licensing and cost step; see 05).

## Streamer / commentator pop-ins

A small circular "cam" bubble (fictional avatar: a code-drawn silhouette or Mogzy mascot variant, with an invented name and a "Simulated" tag) with a one-line reaction, top corner, slides in and out.

- **When:** only on rare or extreme moments: `dyn.game.event_rare`, `dyn.obj.outcome_3`, `dyn.obj.outcome_0`, `dyn.game.closeout_double`, `dyn.series.match_point` saved or lost.
- **Cap:** 1 per game. Never during an open question; on phones it waits until the encounter's outcome card has settled (focus stage rule).
- **Why it earns its place:** it is the cheapest way to say "that was unusual" without a stat. It should feel like a clip-worthy moment, which feeds SOCIAL-1 later.
- **Never** a real streamer's likeness, handle, catchphrase or channel art.

## Twitch-chat-style popups

A narrow, fading column headed "SIMULATED CHAT", with 3–6 short chat lines ("W", "BARON THROW?", "academy diff", emote-like glyphs drawn in SVG). Pure texture.

- **When:** bursts of 2–3 s on `dyn.obj.outcome_*` (after the last answer, never between questions), `dyn.series.point_won/_lost` and `dyn.end.championship` (a longer burst, ~5 s, exempt from the per-game cap).
- **Cap:** 3 bursts per game. Desktop: right gutter. Phone: overlay the top 20 % of the stage with a gradient mask, only on W2 result moments, never over answer options.
- **Content rules:** a curated, reviewed line bank (~150 lines) tagged by sentiment and moment. No user-generated text, no slurs/toxicity, no real usernames, no real emotes (no Kappa / PogChamp: platform IP). Fictional handles come from a generator (`mid_or_feed_88`) and are checked against a blocklist that includes known real creator and pro handles.
- **Accessibility:** `aria-hidden`; motion off → the column appears static and fades.

## Where each layer appears (summary)

| Screen | Loop | Crowd | Caster | Pop-in | Chat |
|---|---|---|---|---|---|
| Home / season / roster / recruit | HQ | – | – | – | – |
| Prep / scout / draft | Scrim | – | – | – | – |
| Series briefing / tactic | Backstage | far murmur | – | – | – |
| Game stages | Stage | murmur → swell | ✓ | rare only | – |
| Objective encounter (questions open) | Tension (stage ducked) | – | stakes line only, before Q1 | – | – |
| Objective outcome | Stage | swell / roar / gasp | – | extreme only | ✓ (after 1.5 s) |
| Game / series result | Stage | roar / groan | – | – | ✓ |
| Finals intro | Backstage → Stage | rising roar | ✓ (one line) | – | – |
| Championship | Stage | roar | ✓ | ✓ | ✓ (long) |
| Run defeat | Stage fading to HQ | groan, then silence | – | – | – |

## Reuse (nothing like this exists yet; these are the nearest parts)

No caster, chat, crowd or ticker component exists in the app. Closest pieces in the frontend:

- **Pop-in bubble:** `components/mogzy-guide/MogzyGuide.tsx` (mascot pose + `GuideMessage` + placement). A mascot "streamer" avoids any real-person likeness; `public/mascot/family/` and `public/mascot/ranked/` (role Mogzys) give a cast of distinct avatars for free.
- **Caster desk avatar:** `public/assets/ranked/caster-minion.webp` already exists and fits a fictional desk persona.
- **Broadcast shell and its SFX:** `components/quiz-broadcast/BroadcastRenderer.tsx` + `BroadcastSfxLayer.tsx` (broadcast lower-third language, `broadcast.*` cues).
- **Feed hook:** `components/lol/broadcast/usePatchBriefFeed.ts` (timed text feed); a model for the seeded chat-burst scheduler.
- **Not** Sonner / shadcn toasts: they are global, stack, and read as system notices, not as atmosphere.

## Build order

1. Stage loop + tension loop + crowd roar (biggest feel per byte).
2. Caster lower-third (text only, no new assets).
3. Chat bursts (needs the line bank; pure text + SVG).
4. HQ, scrim and backstage loops.
5. Pop-ins (mascot avatars, invented names).

Every text layer ships **on by default** behind the controls in rule 5.
