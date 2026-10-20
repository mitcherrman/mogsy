# VIS-F2 support · 05 · Asset inventory and provenance plan

What Mogzy already holds, what Dynasty still needs, and the rights posture of each. Audited read-only on 2026-10-19:

- **Frontend:** `mogzy-wt/vis-f1` @ `3d79759c`. The main `mogsy` checkout (`0d3fbcbb`, 2026-10-09) is an older ancestor with nothing extra.
- **Backend:** this repo's `assets/` (git-tracked) and docs `PRO_PLAY_MEDIA_AUTHORITY_HANDOFF.md`, `workstreams/RR1_MEDIA_BACKLOG.md`, `assets/objectives/provenance.json`.

Classes: **E** existing / reusable · **T** representable with UI / typography only · **PH** placeholder okay for now · **S** needs future sourcing · **L** licensing-sensitive (owner decision before public use).

## 1. What exists

| Asset | Where | Count / spec | Dynasty use | Class | Rights note |
|---|---|---|---|---|---|
| Cinzel, Inter (+ Lora, Space Mono) | Google Fonts, `index.html` | – | All display / body type | E | OFL, fine |
| VIS-F1 visual kit: plates, crests, monograms, sigils (dragon / baron / elder / teamfight), gauges, mood lights | `src/pages/dev/dynasty-v2/vis.css`, `parts.tsx` | 8 moods, 4 sigils, 3 org accents | Most P0 slots | E / T | Original code; clean |
| Mogzy mascot | `public/mascot/*-transparent.png` (`MOGZY_MASCOT_ASSETS`) | 14 poses + webp sizes; `family/` 12; `ranked/` 5 role Mogzys | Result heroes, outcome tiers, streamer pop-ins | E | Mogzy-owned art (no provenance doc found; owner to confirm) |
| Role emblems | `public/assets/ranked/mogzy-role-icons/*.svg` | 5 | Player cards, draft | E | Mogzy-made |
| Mogzy crowns | `public/images/ranked/crowns/*.png` | 5 tiers | Possible Worlds / champion crown | E | Mogzy-made |
| Backgrounds / textures | `public/assets/ranked/` (navy-banner, parchment, vellum, academy-duel-bg), `caster-minion.webp`, `play-seal.png` | ~12 | Backdrops, caster avatar, seals | E | Mogzy-made (assumed) |
| Champion art | backend `assets/champions/<Name>/{splash,loading,cutouts}`, icons; `useChampionAssets`, `getChampionSquareIconUrl` | 5,102 files | Draft tiles, lineup strip (when real champions arrive) | E · **L** | Riot IP, used across Mogzy under the fan-content posture; see §3 |
| Item icons | backend `assets/items` (+ `items_wiki`) | 706 + 228 | Item-spike event | E · L | Riot IP; 64 px resolution limit (RR1 backlog) |
| Objective squares | backend `assets/objectives/*.png` | 11 (Baron, Herald, Voidgrubs, Scuttle, camps) at 128 px | Event chips only | E · L | Riot wiki art with provenance JSON; **no Dragon on purpose** (no neutral drake exists); no Elder |
| Elder icon | frontend `public/assets/ranked/elder-dragon.webp` | 1, ~4.7 KB | Chip only | E · L | Provenance undocumented |
| Structures / minions / ranks / runes / spells | backend `assets/` | 4 / 5 / 32 / 62 / 16 | Plates, turret event | E · L | Riot IP |
| Team crests | backend `assets/esports/teams/` via `/api/pro-play/media/resolve`, `TeamCrest` / `EntityCrest` | 16 focus orgs | Only if Dynasty uses real orgs | E · **L** | Trademark; the identification-basis gate was removed 2026-09-08 |
| Player portraits | backend `assets/esports/players/`, `PlayerPortrait` | 72 tracked | Tier 1 of the portrait chain, **only per asset, after approval** (§3) | E · **L** | Pro Play recorded the source declaration in `license_note`: Riot / lolesports photography, "All Rights Reserved", with a grant that runs to Liquipedia, not to Mogzy. No portrait carries a recorded licence to Mogzy |
| SFX engine | `src/lib/audio/` (`SFX_REGISTRY` 67 cues, 48 Web Audio generators, Audio Studio bindings, mute) | – | Every cue in 03 | E | Synth voices are original |
| Music | `public/audio/music/tidecaller.*` (Academy Radio) | 1 track | Not for Dynasty | **L** | `docs/audio-licenses/riot-music-usage-rights.md` is unfinished |
| Meme SFX | `public/sounds/` (amongus-death, surprise-motherfucker, mogged, youre-chopped, card-rip) | 5 | **None** | **L** | Third-party clips; wrong tone too |
| Broadcast video | `public/quiz-broadcast/assets/akali-*.mp4/webm` | 3 | None | L | Riot champion footage |
| Motion libraries | `framer-motion` 12, `three` / R3F, `remotion` 4, `html2canvas`, `modern-gif` | – | Motion (prefer CSS per VIS-F1); legacy-card export (`html2canvas`); a promo / share clip (`remotion`) | E | MIT-style |

**Not present anywhere:** music or ambient beds, crowd audio, voice-over, confetti library, Lottie / Rive, trophy art, venue art, a neutral Dragon image, Baron art above 128 px, Worlds / league marks, any caster / chat / ticker component.

## 2. What Dynasty still needs, classified

| Need | Class | Plan |
|---|---|---|
| Org crests (fictional orgs) | **T** | VIS-F1 hex crest + Cinzel monogram is the final answer |
| Player identity | **T → PH → S** | A four-tier chain (02 `player.portrait`): approved real portrait → original fictional-player art → premium placeholder → monogram. Monogram and placeholder are buildable now; original art is in-house work or needs approval; real portraits per §3 |
| Prep action icons ×6, event icons, comp badges, stamps | **T** | Inline SVG + lucide |
| Season / segment banners, finals VS card, champion banner | **T** | Type + light + crest; no imagery needed |
| Dragon / Elder / teamfight visuals | **T** | Keep the sigils (no neutral Dragon art exists by design) |
| Outcome arrivals, confetti, rays | **T** | CSS; one hand-built confetti burst (Mogzy already hand-builds particles, e.g. `HextechOverloadFX.tsx`) |
| Synthetic champion tiles | **PH** | Class glyph until a real champion catalog is wired |
| Baron hero art | **PH → S** | Sigil now; one original illustration (silhouette, violet), made in-house or commissioned with separate approval |
| Dynasty trophy | **PH → S** | SVG now; an original raster trophy later if needed, deliberately unlike the Summoner's Cup |
| Venue silhouette | **PH → S** | Optional; illustrated, never a photo of a real arena |
| Dedicated `dynasty.*` SFX | **PH → S** | Fallback cues now; Web Audio generators for ticks and locks; the 12 signature cues from original or appropriately licensed sources |
| 12 signature cues (03, Signature set) | **S** | Original (synthesis, in-house) or appropriately licensed (CC0 or equivalent); finals and championship ≤ 3 s peak. Paid sources need separate approval |
| 5 ambient loops + crowd one-shots (04) | **S** | Same sourcing rule; licence file stored per asset |
| Chat line bank (~150) and caster templates | **T** | Write in-house; review for tone |
| Caster / streamer avatars | **T / E** | Mascot family + `caster-minion.webp` |
| Real champion art in draft | **E · L** | Use existing Mogzy assets when real champions arrive; same posture as the rest of Mogzy |
| Real org crests / real player portraits | **L** | Allowed per asset after a recorded rights decision (§3) |
| Voice-over (caster lines) | **L / S** | Out of v1 |

## 3. Rights decisions (owner decisions 2026-10-19 applied)

1. **Player imagery is tiered, not monogram-only.** Dynasty supports four tiers in one frame: approved real-player portraits, original fictional-player artwork, premium placeholders, and monogram fallbacks.
   - **Rights and provenance are recorded per asset** in the Dynasty media manifest (§4), with an explicit rights decision.
   - Pro Play's inert `rights_basis` column, or the fact that a file is served, is **not** approval.
   - **None of the 72 Pro Play portraits qualifies today.** Each records "All Rights Reserved" with a grant to Liquipedia, not to Mogzy. Each one needs its own basis, such as a licence or written permission Mogzy holds, or owner-supplied media.
2. **Simulated traits are never presented as real-world facts.**
   - Trait, mood and confidence chips always carry the *Generated in-run* source chip and sit outside the portrait frame (02 `player.trait_chip`).
   - No caption, commentary line or chat line attributes a simulated psychological state to a real person (04 rule 2).
   - A source-chip test should fail if a Dynasty-rules or event row ever renders a Verified chip (UX-D0 §18).
3. **Real org crests are allowed per asset, as identification.** Each needs its own Dynasty rights row. Fictional "Dynasty traits" on a real org's card carry the "Dynasty rules" label. The synthetic catalog keeps fictional orgs.
4. **No Worlds logo, Summoner's Cup likeness, LoL Esports marks or real venue imagery.** "Worlds" appears as a word in Cinzel next to an original mark, which keeps the championship moment ownable.
5. **Audio: original or appropriately licensed only.**
   - Never import Riot game audio or music whose licence is unverified. That covers the ~127 tracks in the backend `assets/audio/audio-inventory.csv` (not in the repo) and Tidecaller until its rights note is finished.
   - Never import the third-party meme clips in `public/sounds/`.
   - **No paid purchase, subscription or commission without separate owner approval.**
6. **Champion art and objective squares follow the existing Mogzy posture.** Dynasty adds surfaces, not a new kind of risk. Record them in the manifest as `existing_mogzy_posture` so the exposure stays visible.

## 3a. Licensing evidence status of assets marked E

| Asset | Evidence on file | Status |
|---|---|---|
| Cinzel, Inter | Google Fonts, SIL OFL 1.1 | OK |
| VIS-F1 kit, Web Audio generators | Original code in the repo | OK |
| Mogzy mascot (all poses, family, ranked) | **None found** (no provenance or licence doc) | Missing: owner to record origin and author |
| Role emblems, crowns, ranked backgrounds, `caster-minion.webp`, `play-seal.png` | **None found** | Missing: assumed Mogzy-made, unconfirmed |
| `elder-dragon.webp` (added `e4632461`, 2026-08-21) | **None found** | Missing; likely Riot-derived; chip use only |
| Objective / structure squares | backend `provenance.json` (source URL, revision, hashes) | Provenance yes; licence = Riot IP under the fan-content posture |
| Champion, item, rank, rune, spell art | No per-file licence; existing Mogzy posture | Riot IP; known exposure |
| Team crests (16) | Per-row `license_note` (Pro Play handoff: 8 "fairuselogo", 4 empty, 1 "fu"), `source_url`, hashes | Provenance yes; Dynasty rights row not yet recorded |
| Player portraits (72) | Per-row `license_note`, credit, `origin_url`, hashes | Provenance yes; **no licence to Mogzy** |
| Tidecaller | `docs/audio-licenses/riot-music-usage-rights.md` (unfinished) | Not for Dynasty |
| `public/sounds/*` meme clips | None | Not for Dynasty |

## 4. Provenance rules for new Dynasty media

- One folder: `public/assets/dynasty/{img,portraits,sfx,loops}/`, with one manifest, `public/assets/dynasty/MEDIA_MANIFEST.md` (or `.json`).
- **One row per asset:** id, file, slot or cue id, source, author, licence or basis, rights decision (`approved` / `held`), decided by, date, SHA-256, and a real-person flag.
- A file lands only together with its approved row. A held row keeps its file out of `public/`.
- Prefer original work or CC0 / free licences that cover a commercial web app. **Any paid purchase or commission needs separate owner approval** before sourcing.
- Never hot-link; never request a wiki or CDN at render time (the Pro Play rule).
- Every slot keeps fixed geometry and a code fallback, so withdrawing an asset is a file delete plus a manifest row change, never a layout change.
