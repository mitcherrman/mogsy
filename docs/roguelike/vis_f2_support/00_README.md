# Worlds Dynasty VIS-F2: cinematic presentation support package

**Status:** support docs only, finalized 2026-10-19. This package supports the parallel VIS-F2 visual pass; it does not design it. No application code was changed. Nothing is pushed, merged or deployed.

**Inputs read:**
- Master plan (updated 2026-10-17, §§7, 11, 16–21)
- UX-D0 spec + handoff, UX-1 handoff, VIS-F1 handoff
- Command Center, Events E0 contract, E1 snapshot API, E1 event catalog
- Pro Play media authority handoff, RR1 media backlog

**Code inventory (read-only):**
- Frontend `mogzy-wt/vis-f1` @ `3d79759c`
- Backend `assets/` and `api_server.py`
- Combat worktree `.worktrees/wd-v2-combat` @ `d279233b`

| Doc | What it gives the visual pass |
|---|---|
| `01_MOMENT_MAP.md` | Moment ids (`dyn.*`), triggers (UX-1 step → E1 beat / `settlement.how`), weight tiers W0–W3, E1 compatibility rules, PROTOTYPE-ONLY labels |
| `02_MEDIA_SLOTS.md` | ~50 slot ids by screen: type, priority, motion, real / placeholder / generated; the four-tier portrait chain |
| `03_AUDIO_HOOKS.md` | ~48 hooks with `dynasty.*` cue ids, verified v1 fallbacks, the 12 signature cues + 5 loops, sourcing rules, `SFX_REGISTRY` wiring |
| `04_AMBIENT_SYSTEMS.md` | Five loops, crowd one-shots, caster desk, pop-ins, chat: default-on controls, rate limits, fictional attribution |
| `05_ASSET_INVENTORY.md` | What exists and what's needed (E / T / PH / S / L), rights decisions, licensing-evidence status, per-asset manifest rules |
| `06_STORYBOARDS.md` | Seven signature-moment beat sheets with reduced-motion alternatives for the two W3 cinematics |

## Owner decisions applied (2026-10-19)

1. **W3 cinematics approved.** Only the Worlds Finals intro and the championship victory may take the full frame, for ≤ 3 s, immediately skippable, each with a static reduced-motion alternative. See 01 (conventions), 02, 06 (S6, S7).
2. **Tiered player imagery.** The chain is: approved real-player portrait → original fictional-player art → premium placeholder → monogram fallback.
   - Rights and provenance are recorded per asset.
   - Simulated traits are never shown as verified facts.
   - See 02 `player.portrait` / `player.trait_chip` and 05 §3, §4.
3. **12 signature cues + 5 ambient loops** form the P0 audio set.
   - Original or appropriately licensed audio only; no unverified Riot music and no meme clips.
   - No paid purchases without separate approval.
   - See 03 (Signature set, Sourcing rules), 04, 05 §3.
4. **Ambient text on by default.** It has an Ambience master switch, per-layer switches, density control, global rate limits, and fictional attribution ("DYNASTY DESK · SIMULATED", "SIMULATED CHAT"). No real broadcasters or streamers. See 04 rules 2–6.
5. **E1 compatibility.** One game maps to E1 beats; no moment runs ahead of its beat; published tallies are never shown changing. **Elder, Dragon Soul and Dragon questions are PROTOTYPE-ONLY.** See 01, 02, 03.

## Review results (this pass)

| Check | Found | Fixed in |
|---|---|---|
| Existing cue names | All 10 cited cues exist in `SFX_REGISTRY`; 9 have a built-in generator | 03 legend |
| Prototype cue count | 03 said 7 cues; it is **8** (line refs added) | 03 |
| Unavailable fallbacks | `ranked.round.final` is voiceless, so the move into Late is silent today; `ranked.discovery.reveal` throttles at 850 ms, so only tiles 1 and 4 of 6 sound; shared fallbacks can swallow each other (per-cue `minReplayMs`); `none` rows were not marked silent | 03 (new `dynasty.game.tile`, throttle table, "none (silent)") |
| E1 accuracy | Dragon in E1 is skill-free and **post-stage** (not a question, not pre-score); `mid.baron_contest` is the opponent's Baron; only `baron_three_question` encounters exist | 01, 02, 03 |
| Contradictory guidance | Monogram-only vs. tiered portraits; "one voice at a time" vs. all layers at the championship; "one cue per moment" vs. cue + crowd; 4–5 s fanfare vs. the 3 s W3 cap; 1.8 s Baron result vs. the 1.5 s W2 cap; chat between questions vs. "nothing during an open question"; 02's dangling F3/F4/F5 references; "commission" as a default | 02, 03, 04, 05, 06 |
| Licensing evidence | No provenance on file for the mascot, role emblems, crowns, ranked backgrounds, `caster-minion.webp` or `elder-dragon.webp`; crests and portraits have provenance but no Dynasty rights rows; portraits have no licence to Mogzy; Tidecaller's rights note is unfinished | 05 §3a |

## Important findings (still true)

1. There is no separate VIS-F2 brief on disk. Scope comes from the owner briefs plus VIS-F1 §9.
2. Every P0 visual slot can be finished in CSS / SVG / type. No sourced raster art blocks the pass.
3. Mogzy has no ambient audio and no music usable here. All 12 signature cues and 5 loops need original or licensed sources. Audio Studio can bind a licensed file to a cue without a code deploy.
4. One BO5 produces ~25–30 W2 moments, so W2 must stay tap-through and ≤ 1.5 s, and ambient text stays rate-limited.
5. No caster, chat or ticker component exists. The nearest reusable parts are the `MogzyGuide` mascot bubble, `caster-minion.webp`, the quiz-broadcast shell and `usePatchBriefFeed`.

## Top 10 asset / media priorities

1. **`playMoment()` + registered `dynasty.*` cues with verified fallbacks.** This fixes the silent move into Late and the throttled tile ticks. (03)
2. **Baron set:** `baron_start` ★, `loop.tension`, outcome stings ★ (exceptional / partial / disaster) + `outcome_success`. (03, S4–S5)
3. **`loop.stage` + `crowd.roar` ★:** the biggest "on broadcast" lift per byte. (04)
4. **Finals intro W3:** VS card + `finals.intro` ★, with its static alternative. (S6)
5. **Championship W3:** original trophy SVG + `end.championship` ★ + one confetti burst → legacy card. (S7)
6. **Draft lock:** lock ticks, lineup strip, identity badge, `draft.lock_all` ★. (S3)
7. **Org choice + sign-player stamps** with `org.choose` ★ / `recruit.sign` ★. (S1–S2)
8. **Season segment banner + `season.segment` ★.** (02, 03)
9. **Portrait-tier frame + `player.trait_chip`:** monogram and premium placeholder now; slots for original art and approved portraits. (02, 05)
10. **Ambient text layer** (desk line, chat bank of ~150 lines, controls) plus **`public/assets/dynasty/MEDIA_MANIFEST.md`** as the per-asset rights home. (04, 05)

## Still open for the owner

- Per-asset rights for any real-player portrait or real-org crest Dynasty wants to show. None qualifies today.
- Provenance confirmation for the mascot and the other Mogzy-made art (05 §3a).
- Which source makes each signature cue and loop: in-house synthesis vs. a CC0 library. Paid options need separate approval.
- Backend support for Elder and Dragon Soul (deferred in E1), and whether Dragon becomes interactive (O-4).
