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

---

## Support handoff (2026-10-19)

### Where it lives

- **Repository:** the Mogzy frontend (`mitcherrman/mogsy`); local checkout `C:\Users\mlmit\OneDrive\Desktop\mogsy`.
- **Branch:** `vis/vis-f2-support-docs`, local only (**not pushed**), in its own worktree `C:\Users\mlmit\mogzy-wt\vis-f2-support`. It has no `node_modules` because it needs none.
- **Base:** `3d79759c` (VIS-F1), the parent of Fable's branch. Fable's `vis/vis-f2-cinematic-journey` has since moved to `ae8e67fc` (one commit, "Add Worlds Dynasty VIS-F2 cinematic journey over VIS-F1"). `git merge-tree` of that tip with this branch is clean.
- **Docs commit:** `b06d6956d99b227b89bdbd5e9bd2f0031326f687`, which adds the seven files below. The handoff and the reconciliation are two further docs-only commits on top of it.
- **Files:** `docs/roguelike/vis_f2_support/` (00_README, 01_MOMENT_MAP, 02_MEDIA_SLOTS, 03_AUDIO_HOOKS, 04_AMBIENT_SYSTEMS, 05_ASSET_INVENTORY, 06_STORYBOARDS).
- **Not touched:** Fable's worktree `C:\Users\mlmit\mogzy-wt\vis-f2`, the VIS-F1 worktree, any application code, any backend worktree. Nothing was pushed, merged or deployed.

### Integration manifest (for VIS-F2)

| Need | File | Use in the visual pass |
|---|---|---|
| Moment ids, weights, E1 rules | `01_MOMENT_MAP.md` | Name every animated moment `dyn.*`; gate W3 to two moments |
| Slot ids, portrait tiers | `02_MEDIA_SLOTS.md` | `data-media-slot` hooks; the four-tier `player.portrait` frame; `player.trait_chip` |
| Cue ids, fallbacks | `03_AUDIO_HOOKS.md` | One `playMoment()` map; fallbacks are verified voiced cues |
| Ambient layers | `04_AMBIENT_SYSTEMS.md` | Default-on text with controls and rate limits; the five loop ids |
| Rights | `05_ASSET_INVENTORY.md` | What may ship; manifest rules for any new file |
| Storyboards | `06_STORYBOARDS.md` | Beat timings for S1–S7 and the W3 reduced-motion frames |

**Safe transfer**, run by the owner or Fable from Fable's worktree at a clean point (not mid-edit):

```
git status --short                       # expect nothing under docs/roguelike/vis_f2_support/
git cherry-pick 3d79759c..vis/vis-f2-support-docs
```

- **Why it is conflict-free:** the support commits only touch files they create under `docs/roguelike/vis_f2_support/`. They cannot conflict unless that folder already exists there (it does not on `ae8e67fc`).
- **The dev server is unaffected:** nothing under `docs/` is imported, so vite / HMR does not react.
- **Line endings:** `core.autocrlf=true` prints LF→CRLF warnings; they are harmless.
- **Without the commits:** `git checkout vis/vis-f2-support-docs -- docs/roguelike/vis_f2_support` stages the files only.
- **To back out:** `git cherry-pick --abort` mid-pick, or afterwards `git revert` the picked commits.

### Reconciliation with VIS-F2 as built (`ae8e67fc`, read via `git show`, not in Fable's worktree)

Where this package and Fable's implementation differ, **the implementation's names win**; this package adapts to them.

**Slot ids.** Fable's `MEDIA_SLOTS` (`src/pages/dev/dynasty-v2/media.ts`) is the registry. The 02 ids are planning aliases:

| VIS-F2 registry id | Covers 02 slot(s) |
|---|---|
| `scene.hq` / `.practice` / `.warroom` / `.tunnel` / `.stadium` / `.backstage` / `.trophy` | `home.title_backdrop`, `prep.room_backdrop`, `scout.dossier_texture`, `season.venue_plate`, `obj.baron.pit_backdrop` (stadium), `end.defeat_plate` (trophy) |
| `objective.dragon` / `.baron` / `.elder` / `.teamfight` | `obj.*.sigil`, `obj.baron.hero_art` |
| `trophy.cup` | `end.trophy` |
| `player.portrait` | `player.portrait` (same id; apply the four tiers) |
| `champion.class` | `draft.champion_tile` (synthetic champions) |
| `hero.victory` / `hero.defeat` | `result.hero_mascot`, `end.defeat_plate` |
| `caster.analyst` / `caster.hype` / `chat.avatar` | 04 desk and pop-in avatars |

Slots in 02 with no registry entry yet (add them to `MEDIA_SLOTS` in its naming when built): `player.trait_chip`, `org.card_crest`, `season.segment_banner`, `season.worlds_mark`, `finals.vs_plate`, `end.confetti`, `meta.unlock_reveal`, `draft.champion_splash_strip`.

**Scenes → the five loops (04):**

| Scene | Loop |
|---|---|
| `scene.hq` | `loop.hq` |
| `scene.practice`, `scene.warroom` | `loop.scrim` |
| `scene.tunnel`, `scene.backstage` | `loop.backstage` |
| `scene.stadium` | `loop.stage`, plus `loop.tension` in an objective pit |
| `scene.trophy` | `loop.stage` at its quietest (champions), fading to silence (run defeat) |

**Cues to fix in VIS-F2.** Three call sites use the voiceless `ranked.round.final`, so they are silent:

- the match-point / series-point stinger (`DynastyV2Prototype.tsx:98`);
- the Elder stinger (`GameView.tsx:221`);
- the move into Late (`GameView.tsx:237`).

Use `ranked.module.start` (or a registered `dynasty.*` cue) until voiced. The other cues VIS-F2 added (`ranked.answer.lock`, `ranked.mode.confirm`, `ranked.opponent.found`, `ranked.points.awarded`, `ui.feedback.error`) are voiced.

**Attribution and controls (owner decision 4).**

- Already met: the casters are fictional (`SYN-Lyra`, `SYN-Dax`), and the chat's `aria-label` is "Fictional viewer chat".
- Still to add:
  - a **visible** "Simulated" mark on the caster pop-in and the chat (not only in `aria-label`);
  - the Ambience master switch, per-layer switches and density setting;
  - the global rate limits (04 rules 3, 5, 6). VIS-F2 currently shows one fixed line per moment, with no global cap.

**Cinematics (owner decision 1).**

- VIS-F2 presents the finals intro and the championship as non-modal, skippable `StoryBeat` panels that fold to a caption. That already satisfies the skip and reduced-motion rules.
- The approved W3 full-frame treatment (06 S6, S7) is an **allowed upgrade, not a requirement**.
- Stingers that stay on screen, static, under reduced motion are consistent with 01.

**Elder (decision 5).** VIS-F2's Elder stinger and pit are prototype-fixture paths. Keep the PROTOTYPE-ONLY label on them (01).

### Confirmed facts (verified 2026-10-19)

- All 10 existing cues cited exist in `SFX_REGISTRY` (`src/lib/audio/sfx-registry.ts` @ `3d79759c`). `ranked.round.final` (line 94) has no built-in voice.
- `sfx.ts:356` throttles each cue by `minReplayMs`. `ranked.discovery.reveal` is 850 ms against the 330 ms tile rhythm (`GameView.tsx:211`), so only tiles 1 and 4 sound.
- `dynasty-v2` calls 8 cues (see 03 for line refs).
- The E1 catalog (`.worktrees/wd-v2-combat`, `dynasty/combat_v2/events/catalog.py` @ `d279233b`):
  - `early.dragon` is a skill-free post-stage major;
  - `early.rift_herald`, `late.baron` and `late.decisive_teamfight` are skill-free pre-score majors;
  - `mid.baron_qualified` is the only encounter (`baron_three_question`, 3 questions, `closeout_on_perfect`);
  - Dragon Soul and Elder are deferred (`models.py`).
- The backend serves `assets/` statically (`api_server.py:458`). That includes the 11 objective squares (no Dragon, by recorded decision), 16 team crests and 72 player portraits.
- The Pro Play approval layer was removed 2026-09-08. The portraits' recorded `license_note` says All Rights Reserved, with a grant to Liquipedia, not to Mogzy.

### Unresolved rights

- **Real-player portraits:** no Dynasty-approved basis for any of them. Each needs a licence, written permission or owner-supplied media, recorded per asset.
- **Real org crests:** provenance is on file, but no Dynasty rights row has been recorded.
- **Mogzy-made art** (mascot, role emblems, crowns, ranked backgrounds, `caster-minion.webp`, `play-seal.png`): no provenance doc anywhere.
- **`elder-dragon.webp`:** origin undocumented.
- **Tidecaller:** the rights note is unfinished. The other Riot music in the backend inventory is unverified, and the `public/sounds/` meme clips are third-party. None of these may be used in Dynasty.
- **Signature cues and loops:** none sourced yet. In-house synthesis or CC0 only; any paid purchase or commission needs separate approval.

### Next steps

1. The owner or Fable cherry-picks the support commits into `vis/vis-f2-cinematic-journey` when convenient (manifest above).
2. VIS-F2 fixes the three silent `ranked.round.final` call sites and adds the visible "Simulated" marks, ambience controls and rate limits (Reconciliation).
3. VIS-F2 wires `playMoment()` with the 03 fallbacks; adds the W3 finals intro and championship with their static alternatives; builds the portrait-tier frame and `player.trait_chip`.
4. Audio: generate ticks and locks with Web Audio; propose sources for the 12 signature cues and 5 loops (in-house or CC0) for owner approval before anything lands in `public/assets/dynasty/`.
5. The owner records provenance for existing Mogzy art and decides per-asset rights before any real portrait or crest appears in Dynasty.
6. Backend: Elder / Dragon Soul support and the Dragon interactivity decision (O-4) before those prototype-only paths leave the fixtures.
