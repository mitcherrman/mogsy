# PRO PLAY ASSEMBLY PAV1 — handoff

PAV1 · Mogzy's Academy of Leaguecraft and Technology · the ASSIGN game, in two
families: **Roster Lock** and **Draft Memory**.

Branch `pro-play-assembly/pav1-fable`, worktree `C:/Users/mlmit/mogzy-wt/pav1-fable`,
based on `origin/main` `b1f65a9c640d3d1ce6954a3f0d68d66a3007448c` (verified head after
fetch; unmoved). Backend `League_Combat_Simulator` read at `origin/master`
`679173bfee6b8b34228aa74d05f45453e0b2d0c7` (verified head; unmoved) and at the PA1
worktree `.worktrees/pa1-assembly-content` (content commit `a34965e5`), **read-only**:
one Python script imports PA1's module and the two read-only snapshots PA1 certified
from, and writes a frozen JSON capture into this repo. Nothing in the backend changed;
the PA1 worktree's `git status` is clean.

Local only. Not pushed, not merged, not deployed, not published.

Playtest: `/dev/pro-play-assembly` (DEV-only route; 404 in a production build).

---

## 1. Product thesis

**The player reconstructs a moment of competitive history by seating identity cards in
labelled positions.** A dark stone plate carries five engraved positions — TOP, JUNGLE,
MID, BOT, SUPPORT — and a tray of ten or fifteen cards sits beneath it. Roster Lock
deals sealed player cards (a brass monogram seal and the handle); Draft Memory deals
champion icon cards. The player seats five, Locks, and the board answers position by
position: a gold seal on a position held right, an ember seal on one held wrong, then
the true card rises into each wrong position while the player's own card sinks to a
small chip beneath it — still named, still explained — and finally the context plate
takes the tray's place: who, where, when, and what each wrong pick actually was.

The two families are one instrument. They share the board, the tray, every input
path, the Lock, and the reveal; only the card face (seal vs. icon) and the host's words
differ. Nothing in the primitive names a player, a champion, a role or a league.

## 2. The exact cognitive operation

> **ASSIGN** — put each of N distinct things in the one labelled position it belongs in.

Input: a subject (team + event), N labelled positions, a tray of M ≥ N cards. Output: one
complete map `position → card`, submitted as opaque tokens.

| Mode | Operation | PAV1 differs because… |
|---|---|---|
| Reconstruct | RECONSTRUCT an unordered multiset | every position here has semantic meaning; the right card in the wrong position is wrong |
| Order Forge | ORDER a set | positions are not a sequence; the tray is larger than the board |
| Match Grid | MATCH entities to groups | one entity per position, every position filled, no groups |
| Rangefinder | PLACE a target on a field | discrete labelled slots, not a geometry |

## 3. Grading model

One whole-board outcome with per-position evidence: `assignment[p] === answer[p]` for
every position, and `isCorrect` only when all five hold. The reveal carries, per
position, the mark, the canonical card and the player's card, plus a host-worded note
for every wrong pick (its tier and role anchor, which are private until then). No
frontend production grading exists: the lab's stand-in server grades inside the host's
closure and hands the primitive only the reveal.

**Not Reconstruct's rule.** Reconstruct's grader is an unordered multiset; this is a
per-position comparison. The `_PositionalAssemblyIsNotSegmentChoiceYet` assertion in
`types.ts` records that `{ assignment }` is a new transport shape for the production
seam to widen (as Rangefinder did with `{ stop }`).

## 4. Content and authority boundaries

Everything historical comes from **PA1's certified output** (`pro_authority.assembly_content`,
contract `assembly_content.v1`, rules `pa1.1`), frozen by
`scripts/pro-play-assembly/capture_pa1_sample.py` into
`src/lib/pro-play-assembly/__fixtures__/pa1AssemblyCapture.json` (494 KB, one line).

The sample is PA1's pilot pool, narrowed to **Worlds Finals, 2015 onward** (11 series):

- **Roster Lock: 9 eligible sides** — ROX 2015, SSG 2016, SSG 2017, iG 2018, FPX 2019,
  G2 2019, EDG 2021, DRX 2022, KT 2025. The other 13 Finals sides are PA1's own
  refusals and stay refused: `identity_conflict` (SKT 2015 — Wolf; DK 2020/2021 — Ghost),
  `registry_gap` (T1 2022–2025 — Faker), `substitution` (SKT 2017, FNC 2018),
  `missing_role` (SKT 2016, SN 2020, WBG 2023, BLG 2024). **Nothing is overridden.**
- **Draft Memory: 26 team-games** — the 2017 Final, every game, both sides; every
  other Final, the deciding game, both sides. 22 on PA1's `canonical` path, 4
  `source_recovered` (SKT 2016 G5, SN 2020 G4, WBG 2023 G3, BLG 2024 G5). No player
  identity is served for Draft Memory, exactly as PA1 specifies.
- **Trays: PA1's own** (`build_roster_tray` / `build_draft_tray`), three seeds per
  variant: size 10 and 15, and for Roster Lock with and without the bench tier (the
  prompt says "starting lineup", which PA1 allows the bench tier for). Every tray passed
  PA1's `audit_tray` at capture (role-balanced, answer-blind token order, no duplicate
  entity or label). The unit tests re-check the public card shape and role balance on
  every captured tray.
- **Team crests through the real media authority** (`pro_authority.media.resolve_media`,
  dated `as_of` the game). Five teams resolve to art (iG, G2, DK, T1, BLG); the rest draw
  the authority's own monogram (SSG, SKT, ROX, FNC, FPX, EDG, KRX, KT, SN, WBG). No
  player portraits are used anywhere — PA0 excluded historical portraits, and the
  current-era portraits the authority holds for some players (Ruler, CoreJJ, Rookie,
  JackeyLove, Tian, Caps, Meiko, Zeka) would read as historical photographs. Roster Lock
  cards are monogram seals by design.
- **PA1's verified SSG 2017 facts** are asserted by test: CuVee / Ambition / Crown /
  Ruler / CoreJJ; Game 3 = Cho'Gath / Sejuani / Malzahar / Varus / Lulu; and the
  `pick_order` note that no draft chronology exists. The prompt copy never says "pick",
  "ban" or "order".

**The capture contains answers** (`private.answer`, per-card tier and role anchor): it
is the lab's server. It is imported only by `labAuthority.ts`; the primitive's source
test pins that `PositionalAssembly.tsx` imports no fixture, lab, pro-play or ranked
module and names no League domain.

**Leak audit.** The public `PositionalAssemblyPublic` has no field that could hold an
answer (unit-tested: `JSON.stringify(content)` contains no `answer|tier|role_anchor|private`).
The pre-reveal DOM carries no `data-mark`, no `data-verdict`, an empty context plate
and no demoted pick, and the primitive's outer HTML contains none of
`canonical|answer|tier|role_anchor|isCorrect|right player` (asserted in the real
browser at every viewport). The PA1 card's `entity_key` is on the public card only for
media lookup, as PA1 §4 intends.

## 5. Architecture

```
src/lib/interaction-grammar/types.ts            PositionalAssemblyPublic / Value / Response / Reveal (+ AssemblyPosition, AssemblyCard)
src/lib/interaction-grammar/positionalAssembly.ts  pure: board invariants (placeCard, clearPosition…), snap, keyboard, reveal plan
src/components/interaction-grammar/PositionalAssembly.tsx + positionalAssembly.css   the primitive
src/components/interaction-grammar/useStageRoom.ts   ported from Rangefinder (GM-R1), unchanged
src/lib/pro-play-assembly/capture.ts            the capture's TypeScript shape + slot vocabulary
src/lib/pro-play-assembly/__fixtures__/pa1AssemblyCapture.json   PA1's frozen sample (DEV-only authority)
scripts/pro-play-assembly/capture_pa1_sample.py  the read-only capture script
src/pages/dev/pro-play-assembly/labAuthority.ts  stand-in server: rounds, token minting, grader, reveal wording
src/pages/dev/pro-play-assembly/ProPlayAssemblyLab.tsx  DEV host: real CanonicalArena + lab renderer
e2e/pro-play-assembly-continuity.spec.ts         continuity / fit / targets / leak matrix
```

- **One primitive, two families.** `cardKind: "identity" | "icon"` selects the face;
  `positions` and `cards` are content. The lab builds both families from the same
  `buildLabRound`.
- **Real arena.** The lab hands `CanonicalArena` a lab-local `ModuleRenderer` whose
  Viewport mounts the primitive (Rangefinder's pattern), measures the stage with
  `useStageRoom`, and passes `maxHeight`. No registry, transport or contract seam is
  touched; no second Arena exists.
- **State ownership.** Host: `value` (the board), `phase`, `reveal`, grading, what
  happens after. Primitive: the armed card, the drag in flight, roving focus, the
  announcement, and the reveal's stage clock — all ephemeral, none graded or submitted.
- **Reveal contract** (`PositionalAssemblyReveal`): `assignment`, `canonical`,
  `positionCorrect`, `isCorrect`, `verdictText`, `cardNotes` (token → the host's
  words), `context` (title, lines, source). Everything is worded by the host.

## 6. Interaction

Every input path ends in one placement (`placeCard`), which keeps two invariants: one
card per position, a card in one position only.

- **Tap, then tap.** Tap a tray card (it arms: cyan ring, lifted), tap a position. Tap
  the armed card again, or press Escape, to put it down.
- **Number keys.** With a card armed, `1`–`5` seat it at that position (the digits are
  engraved in the wells on desktop).
- **Drag.** Press a tray card and move more than 6px: a fixed-position ghost follows the
  pointer (mouse, touch, pen), the nearest position lights cyan, the drop is forgiving
  (the board grown by 24×40px, nearest well wins). A drop elsewhere cancels.
- **Replace.** A tray card dropped or tapped onto an occupied position replaces the
  occupant, which returns to the tray.
- **Move / swap.** Tap a seated card (or press Enter on its position) to pick it up,
  then tap another position: it moves; if that position is occupied the two swap.
  Dragging a seated card does the same.
- **Return.** Drag a seated card onto the tray, tap its hollow in the tray (a seated card
  leaves an engraved outline where it was, tagged with its position), or press
  Delete / Backspace on the position.
- **Keyboard.** Two roving-tabindex groups (tray: arrows in a 5-column grid, Home/End;
  positions: arrows, Home/End) plus Lock. Enter/Space is the button's own click. Focus
  never moves on its own.
- **Lock** is enabled only when all five are filled, and submits `{ assignment }`.

Screen reader: every card and position has a full accessible name that states what
pressing it will do ("Crown, selected. Press to put it down." / "Mid position: Crown.
Press to pick it up."); one polite `role="status"` region announces each discrete
action, the lock, and the whole reveal once (position by position).

## 7. Reveal

Three stages on one bounded clock (≤ 1.9 s), one timer per boundary; reduced motion
(OS or in-app) has no clock and renders the settled frame first.

| Stage | Window | What moves |
|---|---|---|
| marks | 0 – 700 ms | each position gains its seal, position by position (110 ms stagger) |
| settle | 700 – 1500 ms | at each wrong position the player's card sinks and the canonical card rises, on the same stagger; the player's card reappears as the chip beneath (ember ✗, art, name) |
| context | 1500 – 1900 ms | the tray crossfades out and the context plate takes its reserved box: title, facts, the wrong picks explained, the source line; the Lock box shows `n / 5`; the status line reads the verdict |

A fully right board has no settle stage. Roster Lock's correct lineup therefore emerges
role by role; Draft Memory's uses the same placement with champion icons. Nothing
disappears: every wrong pick stays as a chip under its position and as a line in the
context plate ("Bang — SK Telecom T1's bot laner in this series", "Ruler — Samsung
Galaxy's bot laner in this series — right player, wrong position").

## 8. Fixed geometry

Head / board / stage region / plate are reserved boxes in every phase. The board's
height is a constant of the viewport (label row + well + chip row + padding). The
stage region takes what the stage leaves (`maxHeight` from `useStageRoom`); the tray
grid inside it has `minmax(0, 1fr)` rows capped per tier, and the context plate is
stacked over it (absolute, crossfade). The Lock box holds two stacked layers (button,
state plate) swapped by opacity. A seated card's hollow stays in the tray; the chip row
under each well is reserved. The drag ghost is a portal. Tiers (CSS variables): default
desktop (≥1024 wide, 720–799 tall), compact (≥1024, <720), tall (≥1024, ≥800), phone
(<640), with a tall-phone variant (≥760 tall) and a short-phone variant (≤700 tall).

Measured compositions (real arena, `[data-testid=ranked-question-body]`):

| Viewport | Stage body | Head | Board | Well | Tray cell (10 / 15 cards) | Plate | Lock |
|---|---|---|---|---|---|---|---|
| 1600×900 | 685×646 | 72 | 178 | 94×104 | 128×82 / 128×83 | 52 | 180×44 |
| 1280×720 | 584×490 | 64 | 154 | 78×88 | 110×58 / 110×59 | 48 | 180×44 |
| 1366×650 | 584×420 | 50 | 118 | 64×62 | 111×48 / 111×49 | 44 | 180×44 |
| 1280×600 | 584×370 | 50 | 118 | 64×62 | 111×48 / 111×44 | 44 | 180×44 |
| 390×844 | 352×620 | 78 | 112 | 54×62 | 65×82 / 65×83 | 44 | 128×44 |
| 360×640 | 322×416 | 72 | 112 | 54×62 | 59×58 / 59×51 | 44 | 128×44 |

(Measured with Playwright on the final CSS, both families; the two families share
every number. The tightest cell is the 15-card tray at 1280×600: 111×44, exactly the
floor. Every card, every well and the Lock are asserted ≥ 44×44 rendered, with
rendered size equal to layout size, at every viewport — see §11.)

## 9. Files changed

New:
- `src/lib/interaction-grammar/positionalAssembly.ts` + `.test.ts` (20 tests)
- `src/components/interaction-grammar/PositionalAssembly.tsx`, `positionalAssembly.css`, `PositionalAssembly.test.tsx` (22 tests)
- `src/components/interaction-grammar/useStageRoom.ts` (port of GM-R1's hook)
- `src/lib/pro-play-assembly/capture.ts`, `__fixtures__/pa1AssemblyCapture.json`
- `scripts/pro-play-assembly/capture_pa1_sample.py`
- `src/pages/dev/pro-play-assembly/ProPlayAssemblyLab.tsx`, `labAuthority.ts`, `labAuthority.test.ts` (13 tests)
- `e2e/pro-play-assembly-continuity.spec.ts`
- `PRO_PLAY_ASSEMBLY_PAV1_HANDOFF.md`

Edited (additive only):
- `src/lib/interaction-grammar/types.ts` — the Positional Assembly contracts appended.
- `src/App.tsx` — DEV-gated route `/dev/pro-play-assembly` (lazy, `import.meta.env.DEV`).
- `src/components/Layout.tsx` — full-bleed frame for the lab route.
- `src/components/Footer.tsx` — footer self-hides on the lab route.
- `playwright.arena.config.ts` — registers the continuity spec.

Untouched: Rangefinder, Glyph Press, Scrub, Match Grid, Daily Challenge, Journey, every
shared Ranked module, the backend, every database, the PA1 worktree.

## 10. Tests

Vitest (`npx vitest run positionalAssembly PositionalAssembly labAuthority`): **55 passed**.
- `positionalAssembly.test.ts` (20): content assertions; place / replace / move / swap
  / clear with a 500-step random walk holding both invariants; snap and slack; grid and
  digit keys; the reveal plan (stages, no-settle path, ≤ 2 s, staggers inside their
  windows); monograms.
- `PositionalAssembly.test.tsx` (22): tap-then-tap, put down, Escape, number keys,
  replace, pick-up / move / swap, return via hollow, empty-position tap; drag with
  threshold, forgiving drop, far drop cancels, drag-to-tray return, pointer cancel,
  secondary button ignored, post-drag click suppressed; full keyboard path through
  Lock; Lock gating; the locked phase carries no mark / verdict / context and inert
  cards; the three reveal stages with the demoted pick, notes and `onRevealComplete`;
  no-settle path; reduced motion; identical `data-part` set in open / locked /
  revealed; `maxHeight`; both card faces; source contract (no authority, fixture, lab,
  ranked or pro-play import; no token comparison for a verdict; no League domain word).
- `labAuthority.test.ts` (13): contract and rules versions and the PA1 commit; the
  exact nine roster sides and 26 draft team-games, all Worlds Finals 2015+; PA1's
  refusals kept (no T1 / SKT roster side); PA1's SSG facts; every captured tray
  role-balanced with a complete answer map and no private field on a public card; per-
  round opaque tokens; no answer field in the public content; prompt and eyebrow copy;
  Draft Memory icon cards and the no-pick-order prompt; tray size and bench options;
  the grader's one outcome / per-position evidence / notes only for wrong picks; the
  Draft Memory wording; a never-dealt card is refused; deterministic order; crests only
  through the dated authority.

TypeScript (`tsc -p tsconfig.app.json`): clean apart from the two pre-existing base
errors (`OnboardingProfile.tsx`, `identity/connections.ts`, present on `b1f65a9c`).
ESLint on every new file: clean.

Playwright (`playwright.arena.config.ts`, spec `pro-play-assembly-continuity`): see §11.

## 11. Browser evidence

Spec `e2e/pro-play-assembly-continuity.spec.ts`, run through a throwaway local config
(`baseURL` on a vite started by launch.json, the installed headless-shell 1228 named
by `executablePath`; the config is not committed). Captures in
`C:/Users/mlmit/OneDrive/Desktop/pro-play-assembly-pav1-shots/` (266 files): per family
(`roster-`, `draft-`) and viewport (`1600x900`, `1280x720`, `1366x650`, `1280x600`,
`390x844`, `360x640`, each also `-reduced`): `-1-open`, `-2-armed`, `-3-drag` (ghost
in flight, target lit), `-4-filled`, `-5-locked`, `-6-reveal-0…7` (the frame series,
motion mode only), `-7-revealed`, `-8-next`; plus `roster-1600x900-exact.png` (all
right, five gold seals) and `draft-1600x900-wrong.png` (the Game 3 five seated,
three demoted picks explained).

**Result: 26 passed, 0 failed (3.6 min).** 24 lifecycle cases (2 families × 6
viewports × 2 motion modes) + 2 reveal scenarios.

Each lifecycle case plays: open → tap card, tap position → tap card, number key →
drag card onto position (ghost visible, drop target lit) → tap a seated card, tap
another position (move) → drag a seated card to the tray (return) → arrows between
positions, Delete (return) → fill by number keys → Lock → locked → reveal (marks,
settle, context) → done → Next (board empty, instrument in place), and asserts at
every step:

- **Continuity:** root, head, board, the Top and Support wells, stage region, tray,
  plate, Lock box and the arena's question stage sampled on every animation frame and
  DOM commit (170–355 frames per case) — **0.00px of movement in every region, in all
  24 cases** (budget ≤ 1px). The drag ghost is a portal and moves by design.
- **Targets:** every tray card (10 or 15), every well and the Lock ≥ 44×44 rendered,
  rendered size equal to layout size (no transform scaling), checked at open and when
  filled.
- **Fit:** no overflow inside the question stage, no stage scroll, no horizontal page
  overflow, no page scroll, the instrument inside the stage — at open and after the
  reveal.
- **Leak:** before the reveal, no `data-mark`, no `data-verdict`, an empty and hidden
  context plate, no shown pick chip, and the primitive's HTML free of
  `canonical|answer|tier|role_anchor|isCorrect|right player`.
- **Lifecycle:** `data-phase` open → locked → revealed, `data-reveal-stage` reaches
  `done`, the host's `onRevealComplete` fires (lab indicator), the context plate shows,
  a verdict is set, and Next returns to an empty open board.

Known pre-existing failures, unrelated and identical on the untouched base
`b1f65a9c` (verified in a throwaway worktree): `App.routeGuards.test.ts` "admin
platform-policies route inherits the gate", and `App.routing-contract.test.ts`'s two
"retired legacy multiplayer routes" redirects. The neighbouring interaction-grammar
suites (Reconstruct, Order Forge, Data Duel, reconstruct libs) still pass: 214 tests
across the directory.

## 12. How to run it

- Static assets (champion icons, team crests): `python -m http.server 8799 --bind 127.0.0.1`
  from the backend checkout root (`assets/` is served from there).
- Frontend: `VITE_COMBAT_API_URL=http://127.0.0.1:8799 vite --port 5270` in this
  worktree (launch.json entries `pav1-assets`, `pav1-fe`, `pav1-e2e` exist in the
  backend worktree's ignored `.claude/launch.json`).
- Open `/dev/pro-play-assembly`. Chrome row: family (Roster Lock / Draft Memory), round
  id, tray size (10 / 15), bench tier (Roster Lock), pre-arranged states (`open`,
  `filled`, `locked`, `revealed-right`, `revealed-wrong`), reduced motion, Reset, Next.
  Query: `?family=roster|draft&round=<id>&size=10|15&bench=0|1&state=…&seed=…&motion=reduce`.
- Continuity matrix: start vite on 8123 (or any port via a throwaway local config with
  that `baseURL` and the installed headless-shell's `executablePath`), then
  `npx playwright test -c playwright.arena.config.ts pro-play-assembly-continuity`.
  `ASSEMBLY_SHOTS=<dir>` redirects the captures.
- Re-capture PA1 content: `python scripts/pro-play-assembly/capture_pa1_sample.py`
  (reads the PA1 worktree and the two read-only snapshots; writes the fixture).

## 13. Limitations

- **Prototype, not production.** No `assembly.v1`, no Ranked registration, no
  persistence, no API route, no grading service. The lab's grader and the frozen
  capture stand in for the server.
- **The sample is small by design** (9 roster sides, 26 draft team-games, 3 seeds per
  variant). PA1's full pilot (33 / 262) and knockout universe (137 / 932) are one
  script argument away but were deliberately not bundled.
- **Identity cards are monograms.** No historical portraits exist in the authority; the
  current-era portraits it holds are not used. Team crests resolve for five of fifteen
  teams and are drawn as identity marks (small, round, beside the prompt), never as
  historical imagery.
- **Era presentation is typographic.** Season, event and stage sit in the eyebrow and
  prompt; there is no per-era art direction.
- **Champion flex is an inherent tell** (PA1 §9); the series-tier distractors are the
  counterweight, as PA1 intends. Pre-reveal, nothing on a card says its role.
- **Context plate density.** Five wrong picks on the smallest phone (360×640) can exceed
  the plate's reserved box; the plate then scrolls inside itself (never the stage or
  the page). Desktop tiers lay facts and notes side by side.
- **The display name's parenthetical** ("Blank (Kang Sun-gu)") is split into handle +
  sublabel for the card; PA1 guarantees distinct display names per tray, and the full
  name stays in the card's accessible name and title.
- **Snapshot dates.** PA1's capture is from the 2026-09-26 canonical snapshot and the
  2026-10-10 identity recovery; re-certification against deployed data is PA2's.

## 14. Next production step

PA2 (backend) as PA1 §10 proposes: an offline certification job that writes the frozen
catalog (candidates, pools, `content_id`, `rules_version`, provenance), a Ranked module
`assembly.v1` that mints per-round tokens and keeps `private` server-side, one
whole-board grade with per-position evidence in the reveal, and `answer_safety`
entries for `answer`, `cards` and `provenance`. Then PA3 (frontend) adapts this
primitive through a real `ModuleRenderer`: the lab's `buildLabRound` / `gradeLabRound`
are the exact shape of the public round and the reveal the module must serve, and
`PositionalAssemblyResponse` `{ assignment }` is the transport to widen `SegmentChoice`
with. Bracket Forge is a future family and was not started.

## 15. Commits

- **Work commit** (primitive, library, contracts, lab, capture script + fixture, tests, spec, the five additive edits): `1479de2c`.
- **Handoff commit:** the branch tip of `pro-play-assembly/pav1-fable` (this file).

Not committed, by design: `playwright.pav1.local.config.ts` (the throwaway local
Playwright config), `test-results/`, and the capture folder on the Desktop.
