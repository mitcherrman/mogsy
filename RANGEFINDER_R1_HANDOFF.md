# RANGEFINDER R1 — handoff

GM-R1 · Mogzy's Academy of Leaguecraft and Technology · the PLACE game.

Branch `rangefinder/r1-fable`, worktree `mogsy/.worktrees/rangefinder-r1`, based on
`origin/main` `a59526b2` (verified head at start; unmoved). Backend read at
`League_Combat_Simulator` `origin/master` `679173bf` (verified head; unmoved),
**read-only**: one committed JSON file is read by a capture script. Nothing in the
backend changed.

Local only. Not pushed, not merged, not deployed, not published.

Playtest: `/dev/rangefinder` (DEV-only route; 404 in a production build).

---

## 1. Product thesis

**The ability's reach is a shape on the ground, and the player's job is to draw it.**

Every existing Mogzy game asks the player to *compare*, *order*, *assemble*, *scrub to*
or *group*. None asks them to commit to a geometry. League players carry a spatial
memory of range — "Zephyr reaches about to there" is a thing you *see* in game, a ring
on the ground — and Rangefinder asks for exactly that memory, in exactly that form.

The player operates an Academy **targeting board**: the champion stands at a fixed
origin on a dark stone field engraved with calibration rings; the player drags a brass
**training target** across the ground, and the ability's **reach** projects from the
champion to wherever the target stands — a cyan ring with a filled disc. Only the
*distance* from the champion matters; the bearing is theirs to choose, which is what
keeps it a placement on a field rather than a thumb on a track. The board carries its
own engraved reading plaque; the plate under the board holds only the hand controls
(vernier, lens, Lock).

On Lock the target settles onto the instrument's stop and the player's ring freezes.
At the reveal the instrument charges and **projects the true ring outward from the
champion in gold**. Right: the two rings fuse and flare. Wrong: both rings stay, the
band of ground between them is hatched in ember, and a gold true-mark sits on the
player's own bearing — the scene proves the answer before the plaque names it.

## 2. The exact cognitive operation

> **PLACE** — put the target where this ability's cast reach ends.

Input: a champion + ability (art, name, slot) and the measure being asked for (cast
range). Output: one discrete stop on the field, submitted as an opaque token.

## 3. Why it is distinct from every existing Mogzy game

| Mode | Operation | Rangefinder differs because… |
|---|---|---|
| Stat Check (Meta Reflex) | COMPARE | there is nothing to compare; the player commits to a magnitude in space |
| Order Forge | ORDER a set | one subject, one geometry |
| Reconstruct | RECONSTRUCT a composition | the answer is a boundary, not a set of parts |
| Scrub / Chronoscope | SCRUB a timeline to a breakpoint | the axis is physical distance from a fixed origin, and the scene *is* the ability's area, not a lens over a state |
| Match Grid | MATCH entities to groups | no entities, no groups |

The nearest ancestor is Stat Drop (an estimate), held because it needed a tolerance.
Rangefinder resolves that (§4).

## 4. Grading model — exact, discrete, no tolerance

The field has **stops every 25 units from 100 to 6000** (237 stops). The player's
submitted state is one stop token; the server grades `stop === canonical`. There is
no "within ±N": a placement at 575 for a 550 ability is wrong.

Why 25 is not an arbitrary tolerance: it is the **lattice Riot authors ranges on**.
Of the 267 single-value cast ranges the authority publishes, 258 are multiples of 25.
The instrument's resolution is the authority's resolution; it adds no slack and takes
none away. The nine abilities off the lattice (Azir Q 740, Evelynn E 210, Jarvan IV E
860, Jayce E 240, Orianna E 1120, Samira Q 340, Teemo Q 680, Tryndamere E 660,
Warwick Q 365) are **refused, not rounded** — the instrument cannot represent them
exactly, so it does not ask about them.

The interaction *feels* continuous (the target follows the pointer freely, the reading
ticks through stops as it moves) and the submitted state is discrete (the target
settles onto the nearest stop on release and the reading shows that stop). Every stop
behaves identically before Lock: the same engraved rings every 100 units, the same
settle, the same target. No stop is magnetic, highlighted or special, and the
canonical units never enter the DOM before the reveal (tested at the DOM, in jsdom and
in a real browser).

Stop tokens are opaque and per-round (the lab's stand-in server mints them with a
seeded hash); the client submits `{ stop: token }`, never a number it asserts. The
server resolves the token itself.

**Scale honesty.** `unitsToPx` is one linear map per lens: zero at the origin, the
lens' reach at the far edge. The player's ring and the projected true ring are drawn
by the same map, so their ratio on screen is their ratio in units (tested). Two
lenses exist — Field (0–1500, rings every 100) and Horizon (0–6000, rings every 500) —
and the lens is the **player's** choice; every round opens on Field. At the reveal, if
the truth lies beyond the current lens, the instrument refocuses **once, before the
first revealed frame**, so the scene can show it and geometry stays fixed through the
reveal.

## 5. R1 content eligibility (the honest pool)

Source: `champion_ability_canonical/data/range_authority.json` (CHAMPDATA Pass 12,
wiki-stamped, 692 records). Frozen by `scripts/rangefinder/captureRangeAuthority.ts`
into `src/lib/rangefinder/__fixtures__/rangeAuthorityCapture.json` (capture stamps the
backend commit `679173bf…`); the rules live in `src/lib/rangefinder/eligibility.ts`
and are tested. A record is an R1 round only if:

1. the authority publishes a plain per-rank `CAST_RANGE` ladder (`cast_range_by_rank`
   non-null — so never a self-cast, never a min–max band, never level / channel /
   charge / state scaling, never a multi-distance string);
2. the ladder is one value across every rank (the 9 genuine per-rank ladders are out);
3. the cast range is finite (the 11 globals are out);
4. targeting is exactly `Unit`, `Location` or `Direction` — mixed-mode casts
   ("Location / Auto", "Unit / Direction", Vector, Proximity, Auto) are out because
   the published cast range may belong to only one of the modes (27 refused);
5. exactly one `CAST_RANGE` component, equal to the ladder, with no qualifying note
   (`BUG`, `See notes`, `Total range is…`, `estimated`, `based off`) — Cassiopeia E,
   Heimerdinger W, Locke E, Maokai R refused;
6. the value is on the 25-unit lattice within the instrument's reach [100, 6000].

Result: **227 abilities across 132 champions** (of 692). Everything else is listed in
the capture's `excluded` array with its reason:

| Reason | Abilities |
|---|---|
| no cast range ladder published (self-cast, band, scaled, global, multi) | 416 |
| mixed or non-spatial targeting | 27 |
| cast range varies by rank | 9 |
| not on the 25-unit lattice | 9 |
| authority note qualifies the number | 4 |

The brief's own example "Set Ahri Charm's reach" is **not** eligible — Ahri E publishes
no cast range, only a 1000 travel range and a 120 width. Honest R1 copy uses abilities
such as Janna W (550), Ezreal Q (1200), Malphite R (1000), Caitlyn R (3500).

Prompt copy (lab): "Set the target at the cast limit of Zephyr." Eyebrow "Rangefinder
· Cast range". No patch/source clutter in the prompt; the wiki revision is the
footnote after Lock and the source link is in the reveal.

## 6. Branch / worktree

- Frontend: `rangefinder/r1-fable` at `mogsy/.worktrees/rangefinder-r1` (base `a59526b2`).
- Backend: untouched; read from `League_Combat_Simulator/.worktrees/reconstruct-r1-be`
  which sits on master `679173bf` for the authority file.
- Captures: `C:/Users/mlmit/OneDrive/Desktop/rangefinder-r1-shots/` (outside the repo).

## 7. Files changed

New:
- `src/lib/interaction-grammar/rangefinder.ts` — the pure instrument (geometry,
  projection, clamps, snapping, keyboard, calibration, reveal clock).
- `src/lib/interaction-grammar/rangefinder.test.ts` — invariants + source contract.
- `src/components/interaction-grammar/Rangefinder.tsx` + `rangefinder.css` — the primitive.
- `src/components/interaction-grammar/Rangefinder.test.tsx` — behaviour + leak + reveal + continuity.
- `src/components/interaction-grammar/useStageRoom.ts` — host-side stage measurement
  (Match Grid's pattern), handed to the primitive as `maxHeight`.
- `src/lib/rangefinder/eligibility.ts` + `.test.ts` — the R1 pool rules.
- `src/lib/rangefinder/__fixtures__/rangeAuthorityCapture.json` — the frozen pool
  (227 eligible + 465 excluded with reasons).
- `scripts/rangefinder/captureRangeAuthority.ts` — read-only capture script.
- `src/pages/dev/rangefinder/RangefinderLab.tsx` + `labAuthority.ts` — the DEV host
  and its stand-in server (grader). The primitive never imports either (source-tested).
- `e2e/rangefinder-continuity.spec.ts` — continuity / fit / targets / leak, 6 viewports × 2 motion modes.
- `RANGEFINDER_R1_HANDOFF.md`.

Edited:
- `src/lib/interaction-grammar/types.ts` — `RangefinderPublic / Value / Response / Reveal`
  (+ the `_RangefinderIsNotSegmentChoiceYet` assertion, as Match Grid did).
- `src/App.tsx` — DEV-gated route `/dev/rangefinder`.
- `src/components/Layout.tsx` — full-bleed frame for the lab route.
- `src/components/Footer.tsx` — footer self-hides on the lab route (as on the shell probe).
- `playwright.arena.config.ts` — registers the continuity spec.

## 8. Existing authority / assets reused

- Range authority: `services/canonical_range.py` semantics and its data file, verbatim.
- Ability art: `getAbilityIconUrl(champion, slot)` and `getChampionSquareIconUrl`
  from `src/lib/combat-lab/abilityIcons.ts` (all 173 authority champions have art;
  `SubjectArt` draws a monogram in the same box if a load fails).
- Arena: the real `CanonicalArena` + `ArenaShell` (the lab hands the arena a
  lab-local `ModuleRenderer`; no registry seam touched), `.ranked-folio` vellum,
  `.ranked-panel`, `ranked-eyebrow`, Cinzel display face, the Academy palette tokens.
- MIG conventions: `InteractionPhase`, `SubjectMedia`, `*Public / *Reveal` boundary,
  `data-mig-primitive / data-phase / data-reveal-stage / data-part` hooks,
  `useReducedMotionPreference`.

## 9–12. Captures

Written by the continuity spec to `C:/Users/mlmit/OneDrive/Desktop/rangefinder-r1-shots/`:
per viewport (`1600x900`, `1280x720`, `1366x650`, `1280x600`, `390x844`, `360x640`, each
also `-reduced`): `-1-open`, `-2-drag`, `-3-placed`, `-4-locked`, `-5-reveal-0…7`
(the frame series, motion mode only), `-6-revealed`, `-7-next`; plus `1600x900-exact`.

Composition facts (measured in the real arena, `[data-testid=ranked-question-body]`):

| Viewport | Stage body | Field | Orientation | px per 25-unit stop (Field lens) |
|---|---|---|---|---|
| 1600×900 | 685×652 | 685×468 | landscape | 10.0 |
| 1280×720 | 584×496 | 584×332 | landscape | 8.3 |
| 1366×650 | 584×426 | 584×288 | landscape | 8.3 |
| 1280×600 | 584×376 | 584×238 | landscape | 8.3 |
| 390×844 | 352×626 | 352×474 | portrait | 6.5 |
| 360×640 | 322×422 | 322×286 | portrait | 3.3 |

Phone is a genuine portrait composition: origin at the bottom centre, reach upward,
plaque in the top-left, one 44px control row. 3.3px per stop on the smallest phone is
coarse for a thumb — which is what the ±25 vernier is for (and why it exists at all).

## 13. Target sizes (rendered, no transform scaling; asserted by the spec at every viewport)

| Control | Size |
|---|---|
| Nearer / Farther (vernier) | 47×44 |
| Lens | 80×44 |
| Lock | 180×44 desktop · full row width ×44 phone |
| Training target | 44×44 (the whole field is the pointer target) |

## 14. Continuity

Regions sampled every animation frame and every DOM commit through open → press →
drag → release → vernier → keyboard → Lock → locked → reveal (charge, project, settle,
proof) → done → next round: root, head, field, origin, plaque, plate, lock, status and
the arena's question stage. Budget ≤1px frame-to-frame; the target is excluded (it
moves by design). Result: see §16.

Structure: head / field / plate / status are reserved boxes in every phase; the plaque
is two stacked layers (live reading, fact plate) that swap by opacity+visibility; the
Lock box is two stacked layers (button, state plate); rings are SVG inside the field;
the target and the origin move by transform only. No region is added or removed by a
phase change (unit-tested: the `data-part` list is identical in open / locked / revealed).

## 15. Accessibility

- The field is a `role="slider"` with `aria-valuemin/max/now/text` in units, labelled
  by the prompt, described by the status line. Arrows step one stop; Shift+Arrow and
  PageUp/Down step 100; Home/End reach the lens' ends. Enter/Space do nothing on the
  field — Lock is its own button, so no key can submit by accident.
- Vernier buttons have full names ("Farther by 25 units"); the lens button announces
  what the field shows.
- One polite `role="status"` live region: the stop after a key move, "Locked at…",
  then the verdict and the fact.
- Focus ring on the field only when focus came from the keyboard.
- Reduced motion (OS or app class): no reveal clock; the first revealed frame is the
  settled frame; no flare, no dots animation, no target settle transition.
- The ability is identified by champion name, ability name and slot in text, not by
  icon alone; the origin art has the champion's name as alt.

## 16. Tests

Vitest (`npx vitest run …rangefinder… …Rangefinder…`): **59 passed**.
- `rangefinder.test.ts` (22): content assertions; projection is linear, origin-zero,
  ratio-preserving across lenses, px↔units round-trip; pointer → placement reads
  distance whatever the bearing, clamps to span/reach/breadth, portrait draws upward;
  nearest-stop snapping (lower on tie); lens/last-visible helpers; keyboard stepping
  and clamping; calibration is round-independent; reveal clock stages, budget scaling,
  reduced = instant, monotone projection; source contract (no reveal, no domain).
- `eligibility.test.ts` (13): every refusal reason, the brief's controls (Janna W in,
  Ahri E out, the nine off-lattice names), the frozen capture's partition and
  reproducibility.
- `Rangefinder.test.tsx` (24): legal placements only; drag (press/follow/settle,
  touch/pen pointer types, secondary button ignored, cancel commits nothing);
  keyboard complete path; vernier; lens; revision before Lock and the exact submitted
  token (`{stop}` and nothing else); inert once locked; no leak (no canon markup, same
  markup shape at 550 and 1200, content type cannot carry an answer); reveal
  comparison (ring ratio equals unit ratio, band, true-mark, plaque text, verdict
  display is handed not derived, lens refocus); reduced motion first frame +
  `onRevealComplete` once; motion choreography through every stage; structural
  continuity (same regions, definite height); source contract (no grader/fixture/lab
  imports, no token comparison for a verdict, no League names in code).

Playwright (`playwright.arena.config.ts` now matches `rangefinder-continuity`): 12
continuity runs (6 viewports × 2 motion modes) + 1 exact-lock run. See the run log in
§16a once the final run completes.

### 16a. Final run log

`npx playwright test -c <arena config with this machine's browser build, baseURL :5250>`
(the committed `playwright.arena.config.ts` matches the spec; on this Windows machine
vite is started via launch.json `rf-r1` and `launchOptions.executablePath` points at
`chromium_headless_shell-1228`, per the usual workaround):

```
13 passed (1.2m)
```

Worst frame-to-frame movement per region over the full lifecycle (open → press →
drag → release → vernier → keyboard → Lock → locked → reveal → done → next round),
sampled on every animation frame and DOM commit — identical in both motion modes:

| Viewport | frames (motion / reduced) | root | head | field | origin | plaque | plate | lock | status | stage |
|---|---|---|---|---|---|---|---|---|---|---|
| 1600×900 | 293 / 76 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| 1280×720 | 257 / 89 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| 1366×650 | 292 / 89 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| 1280×600 | 287 / 90 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| 390×844 | 263 / 96 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| 360×640 | 253 / 96 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

(px; budget ≤1.) The same runs assert ≥44px rendered targets with rendered size equal
to layout size, zero overflow inside the question stage, zero page scroll, zero
horizontal overflow, and no canonical geometry / mark / band / verdict in the DOM
before the reveal. The 13th run pins the exact lock: equal radii, no band.

Two things the spec caught during the build, both fixed: the lab's chrome row sat
under the GlobalHud's fixed sign-up chip (the "Next" click never landed), and the
chrome row wrapped by 15px at 1280-class widths when its "reveal done" indicator
appeared — the indicators are now reserved boxes that toggle by opacity.

Lifecycle videos (CDP screencast → ffmpeg, since Playwright's recordVideo needs a
newer ffmpeg than this machine has): `1600x900-janna-w-lifecycle.webm` and
`390x844-ezreal-q-lifecycle.webm` in the captures folder.

## 17. Limitations

- **Lab only.** No `rangefinder.v1` backend module, no `SegmentChoice` widening, no
  registry entry, no admin preset: the stand-in server lives in `labAuthority.ts`.
- **Phone precision.** 3.3px per stop at 360×640 means the thumb lands on a stop ±2;
  the vernier makes exactness one tap away, but a first-time player will need the hint.
- **The far lens is coarse** (2.5px per stop on desktop); only 7 of 227 abilities
  (2500–5000) need it, and all are multiples of 250, so Shift-arrows reach them.
- **No sound cues** are wired; `onCue` fires (detent, lock, project, settle, resolve)
  for a host to voice.
- **Header verdict hold** (the known shared limitation from Scrub S2) would apply once
  hosted in Ranked: the arena's "INCORRECT" lands before the module's reveal choreography.
- **Mixed targeting** abilities are refused wholesale (27); a later pass could admit
  those whose cast range the wiki states applies to every mode.
- The lab's arena header shows a paused timer and placeholder rails; the question
  stage box is the production one (measured against `/dev/ranked-shell-probe`: the
  lab's body is 685×652 vs the probe's 668×654 at 1600×900 — the probe's chrome row
  is one line taller and its page frame 16px narrower; the lab is otherwise the same
  `CanonicalArena`).

## 18. What to productionize next

1. **Backend `rangefinder.v1` module** (Reconstruct/Scrub pattern): round = one
   eligible record; the server mints per-round stop tokens, serves
   `{prompt, measureLabel, subject, field}` with no canonical figure, grades
   `{stop}` by token equality, returns the `RangefinderReveal` shape. The eligibility
   rules in `eligibility.ts` port 1:1 to Python over `canonical_range.record()`.
2. **Wire seams** (the set every module touched): `SegmentChoice` + submit body
   (`{ stop }`), `contracts.ts` block/reveal/forbidden keys, `registry.ts`,
   `orderForgeLockReveal.ts` inline set, `centralStage.ts` title, transcript/review
   cards, `roundMedia.ts` preload, `RankedShellProbe` `?q=rangefinder` + bot replay,
   admin `RangefinderLaunch.tsx` (preset `admin.rangefinder`).
3. **Module host**: `useStageRoom` → `maxHeight`; memoise `content`/`reveal` by value
   (every poll re-parses); `revealBudgetMs` from `pacing.serverPacedHoldMs`.
4. **Second family**: the authority's other semantic types (EFFECT_RADIUS → "place the
   edge of the blast", TRAVEL_RANGE → "where does the skillshot die", WIDTH) are the
   same primitive with a different `measureLabel` and, for width, a second origin.
5. **Per-rank ladders** (9 abilities) as a "freeze rank 1 / rank 5" variant; min–max
   bands as a two-target placement.

## 19. Final SHA

(filled in below after the local commit)
