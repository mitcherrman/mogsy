# Worlds Dynasty · VIS-F4 handoff — Cinematic Production

**Status:** implemented and verified locally on branch `vis/vis-f4-cinematic-production` (worktree `C:\Users\mlmit\mogzy-wt\vis-f4`), stacked on VIS-F3 `87da1f17`. The commit SHA is quoted in the delivery message and is the HEAD of that branch at handoff.
Dev-only route `/dev/dynasty-v2` (`?view=showcase`, `?view=objectives`, `?seed=`). Nothing pushed, merged or deployed. No backend, auth, schema, shared-CSS or production-integration changes. Nothing bought or downloaded.

Read with: `WORLDS_DYNASTY_VIS_F3_HANDOFF.md` (systems this builds on), `VIS_F4_ASSET_MANIFEST.md` (every asset, size, licence status, honest inventory), and the support package `docs/roguelike/vis_f2_support/00–06`.

Note: neither repository contains an `AGENTS.md` at present; the browser rule carried from VIS-F1–F3 (verify in the desktop app's built-in browser pane only) was followed.

---

## 1. The four priority experiences

| Moment | What a player sees now | Where |
|---|---|---|
| **Living inside the HQ** | A layered gaming-house common room that shows *this* run: the org crest banner and giant wordmark, the five starters seated at their stations (names and roles under the chairs, stars highlighted), monitors cycling three screens, a results wall with eight pins that fill W / L through the season, a trophy shelf that gains a cup per series won, a cohesion board, a city window with twinkling lights, pendant lamps whose colour and strength follow the mood (warm after a win, cold and dim after a loss, warmer with cohesion), a WELCOME banner after a signing, Worlds pennants at Worlds. | `environments.tsx` `HQRoom`, driven by `EnvState` from `DynastyV2Prototype.tsx` |
| **Walking onto the Worlds stage** | Draft lock plays a full-frame **lock-in sequence** (five tiles stamp LOCKED one by one with role, class glyph, champion, player and proficiency, then the composition identity slams in). The game opens on a two-beat **walkout**: the tunnel with the five walkers, their names, roles and locked champions and the opponent on the wall board; then the stadium reveal with both crests on the side boards, the centre board naming both teams and the game, a flash and the crowd swell. The lineup strip remains afterwards. | `lock.tsx`, `walkout.tsx`, `TunnelScene` / `StadiumScene` |
| **Fighting for Baron** | A hero pit on the Rift: moon, rays, far jungle, two rock masses with rim light, the rune floor, the river at the pit mouth, both teams posturing at the edge, and the Baron rising out of the mist. Every question raises the intensity (eyes burn larger, mist and rune pulse quicken, the tension ring fills, the crowd meter climbs, the tension loop gains level). Four outcome cinematics: exceptional (the Baron falls, gold burst and shards, the allies step in), success (it sinks), partial (it stays, embers, two allies down), disaster (it rears and roars, red eyes, five allies down, a shake). The outcome card is followed by a "Back to the match" line and a button that names the consequence. | `baron.tsx`, `spectacle.tsx`, `ObjectivePanel.tsx` |
| **Winning the championship** | Hush, black, a whiteout flash and the hit; the trophy rises in a field of rotating rays; CHAMPIONS; the team and series score; the five starters' names; confetti; the crowd roars on the title. ≤ 3 s, tap / Enter / Esc / Skip, static under reduced motion. The run-end hall behind it shows the five legacy plaques with the roster's names and the cup on its pedestal. | `cinematics.tsx` `FullFrame`, `TrophyHall` |

Supporting work in the same pass: practice room (whiteboard, scrim-block schedule naming the next opponent, VOD wall with a moving scrubber, stations with the starters), war room (dossier screen with the opponent's name and crest, draft-plan board with the five role slots, scanning line, map table, coach), stadium variants (normal / elimination / Worlds Final with flags and pyro) whose floor light follows the advantage and whose phone lights thicken with momentum, Dragon as tempo (racing chevrons, beating wings) and Elder as the last confrontation (moon, aurora, crowned drake, both squads), character portraits (three poses, jersey number, org patch, headset) in the four-tier chain, player spotlights for recruitment offers and the two franchise stars, and the audio polish below.

## 2. Sound and broadcast polish (engine unchanged)

- `hush(ms)`: every loop ducks to near silence for a beat and recovers over 600 ms. Used before the objective verdict (380 ms, then the outcome cue and the crowd), at the walkout start, and before the championship hit.
- `setTension(on, level)`: the tension bed now scales with the question index (0.55 → 1.0).
- Walkout: backstage murmur under the tunnel, `dyn.crowd.swell` + `stage_open` on the stadium reveal.
- Lock-in: one `lock_role` tick per stamped tile, `lock_all` on the identity.
- Championship: hush → `dyn.end.championship` at 380 ms → `crowd.roar` at 950 ms (the stinger no longer double-fires the cue).
- Nothing recorded, nothing third-party: all audio is still synthesised in `audio.ts`.

## 3. Phones and accessibility

| Check | Result |
|---|---|
| 360×780 Baron stakes, real game-1 Baron | "Go for the Baron" bottom at 742 px → **38 px clearance** (VIS-F3: 10 px). Encounter hides the LED ribbon and compacts the title on phones (`.dyn-encounter-compact`); the phone pit is 132 px tall. |
| 360×780 questions / outcome | Next at 694 px (86 px clearance); Continue at 751 px. |
| 390×844 | Stakes clearance 137 px, questions 150 px. |
| Horizontal overflow | scroll width = viewport on home, roster, season, recruit, prep, scout, draft, lock-in (grid right edge 344 px at 360), walkout, game, Baron, result. |
| Full frames | championship and Final intro ≤ 3 s, skippable by tap / key / button; reduced motion: no `dyn-cine--motion`, title visible at once. |
| Reduced motion (`html.reduce-motion` added live) | 0 `.dyn-scene--motion` / `.dyn-spect--motion` elements; rooms, pits, walkout and lock-in render static. |
| Performance | no new network assets; all new art is inline SVG + CSS; the two oversized pre-existing rasters are listed in the manifest as candidates to convert. |

## 4. Verification record

- `vitest run src/pages/dev/dynasty-v2` — **53 / 53** (49 inherited + 4 VIS-F4: room state / spotlights / welcome banner; lock-in sequence → stinger → walkout → stadium; Baron escalation 0→1→2→3 with consequence line; championship frame from run state + `hush` safe without audio). The VIS-F3 walkout test was updated to the new sequence.
- `tsc --noEmit -p tsconfig.app.json` — no errors in `dynasty-v2`; the two repo-wide errors in `OnboardingProfile.tsx` / `connections.ts` pre-date this work (baseline).
- `eslint src/pages/dev/dynasty-v2` — 0 errors, 21 warnings, all `react-refresh/only-export-components` (baseline class).
- Browser pane, desktop 1280×800: full flow home → roster → season → recruit → prep → scout → draft → lock-in → walkout → stadium → Dragon → Baron (stakes, three questions, exceptional) → closeout → result; showcase room states (win / loss / signing / worlds), stadium variants, championship frame, four Baron outcomes, Dragon / Elder, comic frames. 360×780 and 390×844: full flow to a real Baron with the measurements above.
- Evidence: `C:\Users\mlmit\OneDrive\Desktop\vis-f4-dynasty-shots\` — `desktop/` (15 captures), `mobile-360/` (7), `motion/` (frame sequences and GIFs for lock-in, walkout, stadium, Baron escalation + outcome, championship). Not committed. Captures were taken with the pane hidden, so a few show the entrance fade mid-way; the layout measurements are from the DOM.

## 5. Changed files

New: `environments.tsx`, `baron.tsx`, `walkout.tsx`, `lock.tsx`, `spotlight.tsx`, `vis-f4.css`, `docs/roguelike/VIS_F4_ASSET_MANIFEST.md`, this handoff.
Changed: `scenes.tsx` (environments + `env` / `champion` props), `spectacle.tsx` (Baron hero, tempo Dragon, Elder, intensity / crowd / accent, tension ring), `ObjectivePanel.tsx` (escalation, hush, consequence strip, accent), `GameView.tsx` (env state, walkout, compact encounter), `DynastyV2Prototype.tsx` (env state, lock-in flow, championship payoff with roster), `cinematics.tsx` (championship beats, roster, hush), `portraits.tsx` (character placeholder), `screens.tsx` (spotlights), `audio.ts` (`hush`, tension levels), `Showcase.tsx` (room states, walkout, lock-in, Baron escalation and outcomes, Dragon / Elder), `DynastyV2Prototype.test.tsx`.
Untouched: `engine.ts`, `fixtures.ts`, `objectives.ts` — every seed replays identically.

## 6. Remaining limitations (honest)

1. **No produced media.** Everything new is code-drawn SVG/CSS and synthesised audio. That is deliberate (no tooling here can generate or source licensed raster art or recordings), and it is documented per asset in the manifest; the four priority moments are original compositions, not finished hero paintings.
2. **Portrait tiers 1–2 are still empty.** The character placeholder is intentionally featureless; real-player portraits need rights rows and original art needs commissioning.
3. **Mascots stand in** for the casters and reaction cam; the Baron hero art and an original Worlds mark are listed as open commissions.
4. **Walkout tunnel beat** overlays the names list on the tunnel art, which also carries the walkers' own name tags; on phones this is dense. The stage beat and the lineup strip carry the same facts.
5. **Elimination variant** triggers on Worlds nodes or when facing match point (owner may prefer playoffs too).
6. The pre-existing `mogzy-defeated-transparent.png` (960 KB) and `leaguecraft-classroom-bg.png` (2 MB) are the only heavy assets on these screens; converting or dropping them is a cheap follow-up.
