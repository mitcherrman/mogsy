# COMBAT V4 — Combat Theater prototype handoff

Built 2026-10-21 by Claude Fable 5.1 from the preparation handoff
`docs/handoffs/COMBAT_V4_VISUAL_PREP.md` (branch `docs/combat-v4-visual-prep-20261021`).
Audience: the owner reviewing the first Combat Theater vertical slice, and the next instance that extends it.

## 1. What exists

An isolated, development-only route **`/dev/combat-theater`** that stages committed, authoritative Team Simulator
captures as a cinematic, scrubbable, inspectable playback:

- **Scene `ashe-garen`** (default): `sim_1v1_trace_full.json` — Ashe vs Garen, 7 basic attacks over 8.340 s, full trace,
  ends in a kill with an overkill on the final blow.
- **Scene `lux-q`**: `sim_2v2_calculation.json` — opens pinned on Lux's Q (`champion_ability` with `formula_text` and
  `formula_bindings`), Ashe & Lux vs Garen & Soraka.

Open `http://localhost:<port>/dev/combat-theater` (desktop or phone width), press Play or step with `]`, scrub the timeline,
click any marker, and read the "Why" ledger beside (desktop) or below (mobile) the stage.

| Deliverable | Status |
|---|---|
| Working isolated prototype code | Done, branch `combat-v4/theater-prototype` |
| Ashe vs Garen combat playback | Done, deterministic, play/pause/restart/prev/next/scrub/speed |
| Lux Q animated mathematical explanation | Done, verbatim formula + bound substitution + server result |
| Desktop and mobile layouts | Done, verified at 1440×900 and 375×812 |
| Tests and validation | 37 new tests green, lint clean, `vite build` clean, route absent from the production bundle |
| Exact branch, commit, file inventory | §2 |
| Known limitations and missing backend contracts | §6, §7 |
| Owner review instructions | §8 |

## 2. Branch, commits, worktree, files

- Base: `origin/main` @ `2c6dee3269cd80e633fe9d49ab231efd9204c0e4` (frontend; verified by `git fetch` at session start).
  Backend `origin/master` was not touched; the prep handoff's inspected tip was `59aed696`.
- Branch: **`combat-v4/theater-prototype`**, worktree `C:\Users\mlmit\mogzy-wt\combat-theater`
  (`node_modules` is a junction to the primary checkout's; see the repo memory on never running `pnpm` in worktrees).
- Code commit: **`8f41e0eca298e718f463b713add230a5f84695b3`** — "COMBAT V4: Combat Theater prototype at /dev/combat-theater".
  This document is the following commit. **Nothing is pushed, merged, deployed or published.**
- `origin/main` moved 21 commits during the session (to `d3854e5f`, "chore: re-sync Lovable with main", 04:32 -0700). A dry-run
  `git merge-tree --write-tree origin/main HEAD` is clean (no conflicts) and both `App.tsx` anchor hunks still exist there; rebase
  or merge just before opening a PR, as the prep handoff advised.

New files (all under new directories except `App.tsx`):

```
src/lib/combat-theater/theater.ts                 pure adapter: script, beats, deterministic state, explainBeat, tokenizeFormula
src/lib/combat-theater/useTheaterController.ts    clock + pin controller over lib/motion/usePlaybackClock
src/lib/combat-theater/theater.test.ts            26 tests: provenance, state reconstruction, Lux Q math, basic-attack limitations
src/components/combat-theater/CombatTheater.tsx   composition root (HUD, stage, timeline, transport, explainer, keyboard)
src/components/combat-theater/TheaterHud.tsx      champion plates, lagging-ghost HP bars, fight clock
src/components/combat-theater/TheaterStage.tsx    opposing portraits, measured anchors, strike streak, impact, damage reveal, caption
src/components/combat-theater/TheaterTimeline.tsx scrubber (pointer + keyboard slider), beat markers, playhead
src/components/combat-theater/TheaterTransport.tsx restart / prev / play-pause / next / speed / readouts
src/components/combat-theater/MathExplainer.tsx   seven-step ledger with per-step provenance and a limitations block
src/components/combat-theater/ChampionArt.tsx     manifest art with glyph fallback
src/components/combat-theater/visuals.ts          damage-type tokens, fallback anchors, art resolvers
src/components/combat-theater/theater.css         scoped `.ct-*` styles, own dark palette, responsive rules
src/components/combat-theater/CombatTheater.test.tsx 11 tests through the component tree (see §5)
src/pages/dev/combat-theater/CombatTheaterDev.tsx DEV-only host page, scene switch, ?motion=reduce
src/pages/dev/combat-theater/scenes.ts            the two fixture scenes
docs/handoffs/combat-v4-theater/*.jpg             six evidence captures (§5)
```

Modified: `src/App.tsx` — exactly the two hunks the prep handoff proposed (a `import.meta.env.DEV ? lazy(...) : null`
constant next to `CombatEstimateLab`, and one `<Route path="/dev/combat-theater">` guarded by it). No other existing file changed.
The `.claude/launch.json` entry `combat-theater` (port 5330) lives in the primary checkout and is git-excluded.

## 3. Architecture

```
TeamSimulationResponse (fixture)
   └─ buildTheaterScript()  ───────────────►  TheaterScript { combatants(left/right), beats[], deaths[], duration }
                                                      │
        usePlaybackClock (rAF delta, speed) ──┐       │
        pinned beat index (prev/next/click) ──┴─► useTheaterController
                                                      │  selectedIndex = pinned ?? beatIndexAt(script, time)
                                                      │  state         = stateAfterBeat(script, selectedIndex)
                                                      ▼
        TheaterHud · TheaterStage · TheaterTimeline · TheaterTransport · MathExplainer(explainBeat(script, beat))
```

Design decisions worth knowing:

- **Determinism.** The displayed state is a pure function of `(script, selectedIndex)`. HP is reconstructed by replaying
  `meta.damage_accounting.by_scope.PRIMARY.hp_after` in scheduler `seq` order; it is never subtracted client-side, so backward
  scrubbing cannot drift. Deaths come from `lifecycle/death.meta.cause_action_seq`, with the victim confirmed against
  `combatant_summaries[*].death_time` (prep hazard H9).
- **Clock.** `lib/motion/usePlaybackClock` (existing, unmodified) advances by requestAnimationFrame timestamp deltas, so 60/120 Hz
  and throttled frames reach the same fight time for the same wall time. A component test drives rAF with 16 ms and 32 ms frames
  and asserts identical clocks and HP.
- **Pinning.** Previous / Next / marker click pause, seek the clock to the beat's own `time` and pin its index, so the four
  same-instant beats at t = 0 in the 2v2 fixture can be stepped one at a time. Play and scrubbing clear the pin. Index −1 is the
  pre-fight "Ready" state. Step handlers read the live selection through a ref, so a held key advances one beat per press.
- **Bar scale.** `effective_builds[id].max_hp`; initial fill `starting_hp` (hazard H5).
- **Strike layer.** No positions exist on the wire (`unsupported_mechanics`), so the streak is a reading aid from the acting side to
  the target, coloured by `damage_type` (physical amber, magic violet, true white) and weighted by `meta.action_type`
  (basic attack = thin arc, ability = beam with the ability icon). Anchors are measured from the real portrait boxes after mount
  (fallback geometry only in jsdom). The reveal prints `applied_hp_damage` large, with the raw hit beside it when they differ
  (overkill) and a "Final blow" tag on the killing beat.
- **Math ledger** (`explainBeat`): identity → formula → substitution → mitigation → shield → final → HP. Every number is a
  `Sourced { value, field }` and each step prints its wire fields. `formula_text` is shown verbatim (decimal comma intact:
  `(40 + 40 * P_Q + 0,75 * AP) * MOD_Magic`); the substituted line replaces whole-word identifiers present in
  `formula_bindings` only, and the `=` result is the server's `payload.raw_damage` (240). Nothing is parsed or evaluated.
  A step with no data reports a limitation instead of a value.
- **Hazard H1 handled.** On basic attacks `raw_damage_before_pipeline` equals the post-mitigation value; the ledger uses
  `payload.raw_damage` (192.8) as the pre-mitigation figure and says so in the step note and in Limitations.
- **Applied-damage authority.** The kernel packet's `metadata.applied_hp_damage` on the killing blow is the unclamped hit (110.29);
  the scheduler accounting's `applied_hp_damage` (69.14) is what left the pool. The ledger prefers the accounting value and notes
  the disagreement. (This was found while writing the tests; it is a backend labelling question — §7.)
- **Reduced motion.** `useReducedMotionPreference` (OS query or the app's `reduce-motion` class) or `?motion=reduce` sets
  `data-reduced="true"`: every framer transition becomes zero-duration, CSS transitions are disabled, portraits do not lunge or
  shake, the strike renders in its settled state.
- **Isolation.** Imports only `team-sim/playback.ts`, `team-sim/contract.ts` (types), `team-sim/__fixtures__`, `abilityIcons`,
  `useChampionAssets`, `useReducedMotionPreference`, `lib/motion/usePlaybackClock`, `framer-motion`, `lucide-react`. It does not
  import `CombatLab.tsx`, `TeamSimPage`, `TeamCombatPlayback`, `team-sim/hooks.ts`/`client.ts`, `ChampionVisual.tsx` or Supabase.
  No production component was modified.
- **Art.** `GET {VITE_COMBAT_API_URL}/api/assets/champions` manifest → loading art for the stage portraits (cutouts are empty for
  all four champions), icons for the plates, `abilityIcons.ts` for the Q/E badges; right-side portraits are mirrored so the
  champions face each other; a glyph renders when nothing resolves.

## 4. Validation results

| Check | Command | Result |
|---|---|---|
| Adapter tests | `npx vitest run src/lib/combat-theater` | 26 / 26 pass |
| Component tests | `npx vitest run src/components/combat-theater` | 11 / 11 pass |
| Existing playback tests | `npx vitest run src/lib/combat-lab/team-sim/playback.test.ts` | 16 / 16 pass (unchanged file) |
| Typecheck | `npx tsc --noEmit -p tsconfig.app.json` | 2 errors, both pre-existing on the base commit (`OnboardingProfile.tsx:180`, `lib/identity/connections.ts:263`); 0 in new files |
| Lint | `npx eslint src/lib/combat-theater src/components/combat-theater src/pages/dev/combat-theater` | 0 errors, 0 warnings |
| Production build | `npx vite build` | clean, 1 m 17 s |
| Production isolation | `grep -rl "buildTheaterScript\|ct-root\|CombatTheaterDev" dist` | 0 files; `CombatLab-*.js` has 0 theater references |

The full frontend suite was not run (it OOMs as one process on this machine; see memory). Nothing outside the new directories and
the two `App.tsx` hunks changed, and the `playback.test.ts` suite the adapter builds on is green.

## 5. Browser validation and evidence

Per `AGENTS.md`, no local Edge/Chrome automation and no Playwright were used. Validation ran in the Claude desktop app's built-in
Browser pane (its own embedded tab, not the user's browser) against the worktree's Vite dev server on port 5330, at 1440×900 and
375×812. Captures are committed under `docs/handoffs/combat-v4-theater/`:

| File | Shows |
|---|---|
| `desktop-1440-ashe-garen-event5.jpg` | event 5 / 7 at 4.776 s: HUD (Ashe 770, Garen 69), strike, −110 physical · mitigated, ledger steps 01–04 |
| `desktop-1440-ashe-garen-final-blow.jpg` | event 7 / 7 at 7.164 s: Garen defeated, −69 with "hit 110", Final blow, overkill in the ledger |
| `desktop-1440-lux-q-formula.jpg` | Lux Q: verbatim formula, bindings, substituted line, = 240, effective magic resist 44.2 → 166.4 |
| `mobile-375-ready.jpg` | pre-fight state with the compact HUD (clock bar + two plates) |
| `mobile-375-event1-damage.jpg` | first beat on a phone: −110 over Garen, caption |
| `mobile-375-math-ledger.jpg` | timeline, transport and ledger stacked below the stage |

Observed and verified live: play runs 0 → 8.340 s and stops with "Ashe wins · team elimination"; the HP bars ease with a lagging
ghost; stepping, marker clicks, keyboard shortcuts and pointer scrubbing all reconstruct the right HP; no console or server errors.
Limitation of this mechanism: while the pane is hidden, requestAnimationFrame is throttled, so framer enter-animations wait for the
next frame; captures were taken after a forced paint. Motion quality (easing, timing) was judged from live playback, not frames.

## 6. Known limitations (prototype)

1. **No heal, shield-gain or shield-absorb exemplar exists in any committed fixture.** The shield step renders the (all-zero) trio
   honestly; healing is not presented at all. Both need a capture at `trace_detail: "full"` (e.g. Soraka heal, Lux E shield).
2. **Basic attacks have no formula on the wire**; the ledger shows the engine's reported `ashe_attack_model` inputs as inputs, not
   as a formula, and marks the step limited.
3. **Penetration / lethality inputs are not on the wire**; only `effective_armor` / `effective_magic_resist` are shown.
4. **Crit** is expected-value only (`crit_mode`); there is no per-hit crit flag to present.
5. **No positions, ranges, projectiles or cast-vs-impact timing.** The streak and impact ring are reading aids; the damage number
   appears at the beat's `time`, which is the scheduler's execution instant.
6. The theater is **fixture-only**: no live Team Sim call (needs the feature flag, verified account, Premium/credits and an
   idempotency key), and the public 1v1 endpoints lack per-event instants and attacker HP, so they cannot drive it as-is.
7. `audio` (`useSfx`) is not wired. Skins are not selectable (default art only).
8. The dev host sits inside the app shell, so the global header overlaps the page's top edge; a production placement would get
   its own layout slot.

## 7. Missing or questionable backend contracts (ask the backend owner)

- `raw_damage_before_pipeline` on basic-attack `damage_packet`s equals the post-mitigation value (prep H1). Intended?
- Kernel `metadata.applied_hp_damage` is unclamped on a killing blow (110.29) while the scheduler accounting says 69.14.
  Which is the intended "applied" meaning on the packet?
- A per-hit crit flag, and the base-resistance → penetration → effective ladder, if the theater should explain them.
- Captured exemplars with non-zero `healing_accounting`, `target_shield_absorbed` and a shield gain, at `full` detail.
- For a live theater later: either an authenticated dev path to `/team-simulate/v1`, or per-event `time`/actor fields and attacker
  HP on the public 1v1 endpoints.

## 8. Owner review (without touching the public simulator)

```bash
cd C:\Users\mlmit\mogzy-wt\combat-theater
node node_modules\vite\bin\vite.js --port 5330 --strictPort
```

Then open:

- `http://localhost:5330/dev/combat-theater` — Ashe vs Garen. Space play/pause, `]` `[` next/previous, Home restart,
  arrows on the focused timeline nudge 0.1 s (Shift = 1 s), click a marker to inspect it.
- `http://localhost:5330/dev/combat-theater?scene=lux-q` — opens on Lux Q with the formula ledger.
- append `&motion=reduce` to force the reduced-motion path.

Resize the window below 1120 px to see the stacked (phone) composition. The public `/combat-lab` page is untouched; a production
build does not contain the route (`import.meta.env.DEV` is `false` there and the branch is dead-code-eliminated, like
`/dev/combat-estimate`).

## 9. Suggested next steps (not started)

1. Owner visual review; decide whether the broadcast HUD / portrait composition is the direction before polishing further.
2. Capture heal and shield exemplars (backend), then add healing and shield-absorb presentations with the same provenance rules.
3. Decide the data path for a live theater (gated Team Sim vs. extended 1v1 contract) before any public-route promotion
   (reuse the `VITE_*` pattern in `team-sim/featureGate.ts`).
4. Optional polish: skin selection, `useSfx` hits, a compact "folded autos" timeline mode (`timelineGroups.ts`), ability
   variants for champion-runtime actions.
