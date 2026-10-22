# Worlds Dynasty · VIS-F4 asset manifest

Every visual and audio asset the Dynasty prototype (`/dev/dynasty-v2`) shows or plays after VIS-F4, with source, ownership, licence status, fallback and size. Sizes are bytes on disk at commit time (`wc -c` / `ls -l`). "Code-drawn" means the asset is SVG/CSS written in this repository: no file is loaded, so its "size" is the source module that draws it.

## 1. Original code-drawn art (owned by Mogzy, written in this repo)

| Asset | Module (size) | Shown at | Fallback | Status |
|---|---|---|---|---|
| Team HQ common room (banner, wordmark, results wall, trophy shelf, cohesion board, city window, five stations with the starters, welcome banner, Worlds pennants, mood lighting) | `environments.tsx` (40 402 B, shared by all rooms) | home, org, stars, roster, season | none needed | **production-quality placeholder** — original illustration, no third-party art |
| Practice / scrim room (whiteboard, schedule board, VOD wall with moving scrubber, five stations, welcome banner) | `environments.tsx` | recruit, prep | none needed | same |
| War room (opponent dossier with the real opponent name, draft-plan board, scanning line, map table, coach) | `environments.tsx` | scout, draft | none needed | same |
| Arena tunnel (ribbed corridor, floor strips, crowd mouth, VS board, five walkers with names and roles) | `environments.tsx` + `walkout.tsx` (5 346 B) | game 1 walkout | none needed | same |
| Worlds stadium (three seat tiers, phone lights, truss and beams, camera crane, three boards with team names/score/stage, two pods with the starters, floor light by advantage, finals flags and pyro) | `environments.tsx` | every game, walkout beat 2 | none needed | same, three variants |
| Trophy hall (roster plaques, org banner, pedestal, cup, settled confetti) | `environments.tsx` | run end | none needed | same |
| Baron hero pit (sky, moon, rays, jungle, rock masses, runes, river, both teams, the Baron, four outcome treatments) | `baron.tsx` (10 718 B) | Baron encounter, gallery, showcase | none needed | **hero scene** — original silhouette; a commissioned illustration would replace it only with owner approval |
| Dragon pit (tempo chevrons, wings) and Elder pit (moon, aurora, crowned drake, both squads) | `spectacle.tsx` (13 042 B) | Dragon / Elder encounters | none needed | original, PROTOTYPE-ONLY encounters |
| Player character portraits (tier 3 of the chain: poses, hair, skin, jersey number, org patch, headset) | `portraits.tsx` (8 674 B) | every player card and spotlight | tier 4 monogram | **designed placeholder** — not a likeness; tiers 1–2 are empty on purpose |
| Draft lock-in sequence, lineup strip, comic frames (signing, tunnel, outplay, elimination), full frames (Final intro, Championship) | `lock.tsx` (5 192 B), `cinematics.tsx` (20 872 B) | draft lock, walkout, prep, results, Final, title | static under reduced motion | original |
| Org crests, sigils, class glyphs, stamps, monograms | `parts.tsx`, `cards.tsx` (VIS-F1/F2) | throughout | — | original |
| Motion (all CSS) | `vis.css`, `vis-f2.css`, `vis-f3.css` (8 263 B), `vis-f4.css` (11 163 B) | — | frozen by reduced motion | original |

## 2. Existing Mogzy assets reused (loaded from `public/`)

| File | Size | Used as | Ownership / licence | Fallback |
|---|---|---|---|---|
| `public/mascot/mogzy-explaining-transparent-192.webp` | 9 910 B | `caster.analyst` (SYN-Lyra) | Mogzy mascot art (05 §2: owned, provenance row to be written by the owner) | pop-in renders without the image |
| `public/mascot/mogzy-raising-hand-transparent-192.webp` | 8 694 B | `caster.hype` (SYN-Dax) | same | same |
| `public/mascot/mogzy-peeking-transparent-192.webp` | 9 600 B | `chat.avatar` (reaction cam) | same | same |
| `public/mascot/mogzy-cheering-transparent-240.webp` | 11 540 B | `hero.victory` (result / legacy heroes) | same | none (decorative) |
| `public/mascot/mogzy-defeated-transparent.png` | 959 743 B | `hero.defeat` | same | none (decorative) — **oversized; a webp would cut ~900 KB** |
| `public/assets/ranked/ranked-academy-duel-bg-960w.webp` | 39 752 B | `scene.hq` far layer at 10 % opacity | Mogzy ranked background (05 §2) | the SVG room alone |
| `public/images/lol-hub/leaguecraft-classroom-bg.png` | 2 041 765 B | `scene.practice` far layer at 10 % opacity | Mogzy classroom background | the SVG room alone — **oversized; candidate to drop or convert** |
| Ranked role emblems (`RoleEmblem` component) | component | role chips on cards, spotlights | existing Mogzy UI art | text label |

## 3. Audio

| Asset | Source | Licence | Size |
|---|---|---|---|
| 30 cues, 5 room loops, tension bed, hush | synthesised at runtime in `audio.ts` (25 603 B) with oscillators and filtered noise | original, no files, no third-party or Riot audio | 0 B on disk |
| Two answer sounds (`ranked.answer.correct/incorrect`) | shared Mogzy SFX registry (pre-existing) | Mogzy | pre-existing |

## 4. Not used, by decision

Real-player photographs, the real Worlds logo or Summoner's Cup, Riot champion splashes or icons, Riot or third-party audio, meme clips from `public/sounds/`, paid assets. Nothing was purchased or downloaded for VIS-F4.

## 5. Honest inventory

- **Completed to production quality (original, final-looking in context):** the six environments, the Baron / Dragon / Elder pits, the lock-in, walkout, comic frames and the two full frames, the synthesised audio behaviour.
- **Designed placeholders that still read as placeholders:** player portraits (silhouette characters, intentionally featureless) until original art or licensed portraits exist; the Mogzy mascots standing in for casters and reaction cams; synthetic champion tiles with class glyphs instead of champion art.
- **Produced media that does not exist yet:** recorded ambience beds and crowd stems, a Baron hero illustration, fictional-player artwork, an original Worlds mark beyond the laurel glyph.
