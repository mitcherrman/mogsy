# VIS-F2 support · 06 · Signature-moment storyboards

The seven highest-value moments. Each is a short beat sheet the visual pass can build and capture. Times are targets inside the weight caps of `01_MOMENT_MAP.md` (W2 ≤ 1.5 s; W3 ≤ 3 s, used only by S6 and S7 and owner-approved 2026-10-19). Every board must (a) be immediately skippable (any tap / key jumps to the resting frame), (b) end on a resting frame that is the final design, and (c) show that frame, static, under reduced motion. Player identity everywhere uses the four portrait tiers (02 `player.portrait`); trait chips stay labelled *Generated in-run*. Audio cue ids refer to `03_AUDIO_HOOKS.md`; slot ids to `02_MEDIA_SLOTS.md`.

---

## S1 · Org choice — `dyn.run.org_choice` (W2, ~1.4 s)

- **Emotional goal:** "This is *my* team now." Ownership and identity, the first commitment of the run.
- **Visual:** chosen org card; crest (`org.card_crest`); accent colour; motto; the two stars in their portrait tier.
- **Audio:** `dynasty.org.choose` ★ (a short brass-and-low-drum "crest stamp"), then `dynasty.loop.hq` fades in under the next screen.
- **Motion:**
  1. 0–250 ms: other two cards dim and slide back 8 px.
  2. 250–700 ms: chosen card lifts, crest scales 1 → 1.15 and its accent floods outward from the corner across the backdrop (the run's accent from now on).
  3. 700–1100 ms: motto types on in Cinzel small caps.
  4. 1100–1400 ms: crest docks into the run bar position (shared-element feel), screen advances to Stars.
- **Commentary layer (optional):** none on screen. This is a private moment; at most a lower-third "A new dynasty: {org}" on the next screen.

## S2 · Sign player — `dyn.season.sign_player` (W2, ~1.2 s)

- **Emotional goal:** "Got them." Acquisition, a bit of swagger; for a swap, a beat of cost (the departing player).
- **Visual:** recruit card (portrait tier, role emblem, phase bars), "SIGNED" ink stamp in the org accent, honeymoon chip if present; for a swap, the outgoing card.
- **Audio:** `dynasty.recruit.sign` ★ (pen scratch + stamp thud + small chime). Swap: a soft `dynasty.recruit.release` whoosh before the stamp.
- **Motion:**
  1. Swap only, 0–300 ms: outgoing card slides down and desaturates (no red, no shake).
  2. 300–650 ms: recruit card flips face-up into its role slot.
  3. 650–900 ms: "SIGNED" stamp lands (scale 1.4 → 1, 4° tilt), ring changes to accent.
  4. 900–1200 ms: roster cohesion meter ticks (down for a swap, honestly shown).
- **Commentary layer (optional):** "SIMULATED CHAT" burst of 3 lines ("W signing", "academy diff incoming", "{role} upgrade?"), after the stamp lands. On by default, subject to the 04 rate limits.

## S3 · Draft lock — `dyn.draft.lock_all` (W2, ~1.5 s)

- **Emotional goal:** "Lineup set. Here's our plan." Confidence and readability: what the comp is for.
- **Visual:** five role rows; champion tiles (`draft.champion_tile`; real splashes cropped into `draft.champion_splash_strip` when real champions exist); comp identity badge; at most 2 strengths and 2 warnings.
- **Audio:** one `dynasty.draft.lock_role` tick per row (rising pitch across the five), then `dynasty.draft.lock_all` ★ (a lock "clunk" + low hit). `dynasty.loop.scrim` steps up a notch.
- **Motion:**
  1. 0–600 ms: rows lock top → support, 120 ms apart; each gets a gold "LOCKED" edge.
  2. 600–1100 ms: tiles slide together into a five-portrait lineup strip (broadcast "lineup" graphic).
  3. 1100–1500 ms: identity badge stamps in under the strip; strength / warning chips fade in.
- **Commentary layer (optional):** "DYNASTY DESK · SIMULATED" lower-third on the next screen: "{org} goes {identity}: they want this game long." (from the comp identity tag).

## S4 · Baron appearance — `dyn.obj.baron_start` (W2, ~1.5 s, then holds on the stakes card; opens only on E1 `objective_prompt` for `mid.baron_qualified`)

- **Emotional goal:** "This is the big one." Dread plus opportunity; the player should *feel* the stakes before reading them.
- **Visual:** violet mood light; Baron sigil (`obj.baron.sigil`; later `obj.baron.hero_art`); pit-fog backdrop; the four-row stakes ladder (3/3 gold row, 0/3 red row); "Optional boost: knowledge decides this" label.
- **Audio:** `dynasty.obj.baron_start` ★ (low sub-drop + growl-like synth swell; original, not the in-game Baron sound). The `dynasty.loop.stage` murmur ducks to near-silence and `dynasty.loop.tension` (70 bpm pulse) starts; it ducks a further −6 dB once Q1 opens and stops on the outcome.
- **Motion:**
  1. 0–400 ms: mood light crossfades gold → violet; published tally collapses to one line (VIS-F1 rule).
  2. 400–900 ms: sigil rises from below with fog; eye glints once.
  3. 900–1500 ms: stakes rows cascade in 3 → 0 (70 ms apart); the closeout row gets a gold edge only when `closeout_on_perfect` is true.
  4. Hold: sigil breathes (the existing 3.2 s loop) until the player starts.
- **Commentary layer (optional):** Dynasty Desk lower-third "Baron's up. {org} leads Mid {score}." on the stakes card, before Q1. Nothing while questions are open.

## S5 · Baron result — `dyn.obj.outcome_0..3` (W2, 0.8–1.5 s by tier; E1 `objective_result`)

- **Emotional goal:** four distinct feelings: **3/3** triumph / relief, **2/3** satisfaction, **1/3** "worth it?", **0/3** gut-punch, but recoverable.
- **Visual:** the outcome tier card with its arrival (VIS-F1: burst / rise / pulse / jolt); effect chips; "Comeback paths remain" line on 1/3 and 0/3; on 3/3 with closeout, a direct hand-off to the closeout hero.
- **Audio:**
  - 3/3: `dynasty.obj.outcome_exceptional` ★ + `dynasty.crowd.roar` ★.
  - 2/3: `dynasty.obj.outcome_success` + crowd swell.
  - 1/3: `dynasty.obj.outcome_partial` ★ (major chord resolving to a suspended one).
  - 0/3: `dynasty.obj.outcome_disaster` ★ (low impact + reverse cymbal), `dynasty.crowd.gasp`, then the stage loop drops a notch.
- **Motion:** 3/3: gold ring burst + light sweep (≤ 1.5 s). When `closeout_on_perfect` is true, the closeout hero follows as its own W2 moment (`settlement.how = objective_closeout`). 2/3: soft rise. 1/3: amber double pulse. 0/3: overshoot, small jolt and desaturation dip, then colour returns, all within 1.5 s (recoverable, not punitive). No screen shake.
- **Commentary layer (optional):** 3/3 and 0/3 only, starting 1.5 s after the arrival: the game's one simulated pop-in reaction, or a 2.5 s "SIMULATED CHAT" burst ("BARON ACE", "how did they lose that") if the pop-in was already used. Never both at once. 2/3 and 1/3: none.

## S6 · Finals intro — `dyn.series.finals_intro` (W3, ≤ 3 s, immediately skippable; owner-approved)

- **Emotional goal:** "We made it to the biggest stage." Awe and nerves. The one moment the game is allowed to slow down before a series.
- **Visual:** full-frame dark stage; two crests face off (`finals.vs_plate`); "WORLDS FINAL" in gold-gradient Cinzel; the two starting fives as portrait-tier rows; the season record strip; optional venue silhouette (`season.venue_plate`).
- **Audio:** `dynasty.loop.backstage` → `dynasty.finals.intro` ★ (an original sting of ≤ 3 s: rising strings and a big drum hit on the title) → `dynasty.loop.stage` at Worlds level (+3 dB). A skip fades the sting out over 300 ms.
- **Motion:**
  1. 0–600 ms: black; a single spotlight sweeps down from the top (the VIS-F1 stage light, at full strength).
  2. 600–1400 ms: crests slide in from opposite edges and meet at a centre "VS" diamond.
  3. 1400–2200 ms: "WORLDS FINAL" tracks in from wide letter-spacing with blur (the hero-word motion).
  4. 2200–3000 ms: both lineups rise in under the crests; season record strip ticks in; primary button beckons.
- **Commentary layer (optional):** one Dynasty Desk line on the resting frame: "{org} versus {opponent}, for everything." Chat stays off; the room should feel tense, not noisy.
- **Reduced-motion alternative:** the resting frame (crests, title, lineups, record strip) appears at once, static, with the sting; it stays until the player continues.

## S7 · Championship win — `dyn.end.championship` (W3, ≤ 3 s, immediately skippable, then settles on the legacy card; owner-approved)

- **Emotional goal:** catharsis and pride, and *"look what this roster did"*: the run's story, not only a trophy.
- **Visual:** original Dynasty trophy (`end.trophy`, not the Summoner's Cup); champion banner in the org accent; gold-fleck confetti (one burst); cheering mascot; then the legacy card: crest, five starters + two bench in their portrait tiers, series record strip, crown, key moments from the event ledger.
- **Audio:** `dynasty.end.championship` ★ (an original fanfare that peaks inside the 3 s cinematic, with a tail of ≤ 2 s more under the legacy card), plus `dynasty.crowd.roar` ★. Then `dynasty.loop.stage` fades to its quietest level under the legacy card. A skip fades the fanfare out over 300 ms.
- **Motion:**
  1. 0–500 ms: final pip fills and flashes; the frame whites out to gold light.
  2. 500–1300 ms: trophy rises into a spotlight; rays begin (the VIS-F1 victory rays).
  3. 1300–2000 ms: "CHAMPIONS" word arrival; confetti burst (single, ~1.5 s fall).
  4. 2000–3000 ms: camera "pulls back": trophy shrinks and docks onto the legacy card as it assembles row by row.
- **Commentary layer (optional):** on the legacy card, in sequence and never overlapping: the Dynasty Desk line "{org} are world champions." → the simulated pop-in → the long "SIMULATED CHAT" burst (~5 s). This is the only moment where all three layers fire (04 rule 4).
- **Reduced-motion alternative:** the trophy, "CHAMPIONS" banner and legacy card appear at once, static, with the fanfare; no confetti, no rays.

---

## Capture checklist (for the visual pass)

For each board: one phone capture at 390 × 844 with motion, one at reduced motion, one desktop at 1280 × 860. Add a `?view=showcase` entry for S4–S7 so they can be reviewed without replaying a run (VIS-F1 already covers outcomes and heroes; S6 and S7 are new).
