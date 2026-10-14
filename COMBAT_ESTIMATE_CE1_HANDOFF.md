# COMBAT ESTIMATE CE1 — handoff

CE1 · Mogzy's Academy of Leaguecraft and Technology · the ESTIMATE game ("Damage Dial" in the brief).

Branch `combat-estimate/ce1-fable`, worktree `C:/Users/mlmit/mogzy-wt/ce1-fable`, based on
`origin/main` `b2b1804a` (verified head at start; unmoved). Backend read at
`League_Combat_Simulator` `origin/master` `8829fc3c` (verified head; unmoved) through a detached,
read-only worktree (`C:/Users/mlmit/mogzy-wt/ce1-be-read`). **Backend untouched**: one capture script
imports its modules and reads one database; nothing in it changed.

Local only. Not pushed, not merged, not deployed, not published. No Docker.

Playtest: `/dev/combat-estimate` (DEV-only route; absent from a production build).

---

## 1. Product thesis and cognitive operation

**The player weighs the hit.** Every number on the board is public — the attacker's attack damage,
the ability and its rank, the target's armor, the penetration the items grant — and the one thing
that is not is what those numbers do when the hit lands. The player commits to a number on a bounded
beam; the authority answers with the real one beside it; the space between them is the error, and
the ladder underneath says why.

> **ESTIMATE** — set the balance to the damage one specified hit deals.

Input: a frozen attacker → target premise and one explicitly named damage event with its metric
(after armor, or before armor). Output: one whole number on the beam, submitted as `{ estimate }`.

It is not a multiple-choice card (nothing to recognise, nothing to eliminate), not a text field
(the beam makes magnitude physical and the answer-independent range is the instrument's, never the
answer's), and not Rangefinder (no spatial geometry, no origin, no bearing: a value on a scale).

## 2. Creative design: the two-beam balance

The instrument is an Academy **balance beam**, the kind a physician's scale has: a heavy poise for
the hundreds, a light poise for the ones.

* **Coarse beam** — engraved brass, notched every 50 from zero to the beam's end (figures every
  100). The heavy poise snaps to a notch.
* **Fine beam** — ticked one unit at a time across a single notch (+0 … +49). The light poise is
  the ones.
* **Estimate = notch + offset**, read on the plaque in Cinzel, and drawn on the coarse beam as a
  cyan **reading mark** (a hairline with a cap) at the exact value — so the whole estimate is one
  visible place on the beam even though it was set with two hands.
* **Balance needle** — a small brass well on the plaque with a needle on a pivot between UNDER and
  OVER. Still until the reveal.
* **Lock** — the plate's one dark button. Locked, the poises harden (their reading line goes white),
  the readout turns cyan, the plate shows LOCKED with breathing dots.
* **Reveal** (the flagship moment, one clock, four stages — `charge → descend → band → ledger`):
  a gold **truth pointer** drops from above onto the coarse beam at the true value, by the same
  linear map that placed the reading mark; the needle swings over or under in proportion to the
  relative error; the ember **error band** fills between the mark and the pointer; the plaque's
  right side turns over from `ACTUAL —` to `FINAL DAMAGE 144` in gold; the plate's state reads
  `OVER BY 30 · 21% over`; and the **ledger** lays out the authority's own working row by row.
  An exact lock lands the pointer on the mark and the two flare white as one; there is no band.
* Materials: slate stone board with an engraved bezel and brass corner fittings, vellum figures, a
  cyan reading, a gold proof, an ember band. Roughly 70% crafted, 30% engineered — the hextech is
  the reading line and the proof, nothing else glows.

Why this metaphor won: it solves the phone-precision problem *as a mechanism* (a thumb lands on a
unit because the fine beam is a whole beam, 6px per unit on a 390 phone, not a sub-pixel of the
main one), it reads in two seconds (two sliders you already understand, one number), and the reveal
has a physical "truth lands here" moment with the error as a visible span.

Lifecycle copy on the plate: `Lock estimate` → `Locked …` → `Over by 30 · 21% over` / `Under by 32
· 25% under` / `Exact`. The status line under the ledger carries the full sentence once revealed:
`Over by 30 · 21% over · Final damage 144 (144.2259 exact)`.

## 3. Reused architecture

`CONTENT AUTHORITY → AUTHORITATIVE MODULE → INTERACTION PRIMITIVE → HOST → CANONICAL ARENA`

| Layer | CE1 | What is reused |
|---|---|---|
| Content authority | `combat_calculations.physical_ability_damage.v1` (backend, read only), frozen by the capture script | the certified seam, its stat builder, its formula disclosure, its refusals |
| Authoritative module (dev stand-in) | `src/pages/dev/combat-estimate/labAuthority.ts` | the Rangefinder lab's stand-in-server pattern |
| Interaction primitive | `src/components/interaction-grammar/EstimateBeam.tsx` (+ `estimate.ts` pure lib) | MIG conventions: `*Public / *Value / *Response / *Reveal`, `SubjectArt`, `useReducedMotionPreference`, `data-mig-primitive / data-phase / data-reveal-stage / data-part` hooks, reserved-box continuity, one `role="slider"` |
| Module stage | `src/components/combat-estimate/CombatEstimateStage.tsx` | the Journey's premise grammar (attacker / target / ability / stated stats), `JourneyCombatWorking` and `readJourneyWorking` for the reveal ledger (the `combat_working.v1` / `raw_damage_working.v1` contracts, verbatim), `ratioStatLabel`, `percent`, the ability / champion art resolvers |
| Host | `src/pages/dev/combat-estimate/CombatEstimateLab.tsx` | mounts the REAL `CanonicalArena` with a lab-local `ModuleRenderer` (Rangefinder / Glyph Press / PAV1's trick), `arenaHeaderRowClass("wide")` for the chrome row, `useStageRoom` for the stage's room |

Nothing in Ranked registries, persistence, transport, scoring, Journey mechanics, Pro Play, the
Daily or any other prototype changed. `types.ts` gained the Estimate contracts (additive);
`App.tsx` / `Layout.tsx` / `Footer.tsx` gained the one DEV route (additive, DEV-gated);
`playwright.arena.config.ts` matches the new spec.

## 4. Exact file inventory

New:
- `src/lib/interaction-grammar/estimate.ts` — the pure instrument: scale assertions, clamp /
  quantise, coarse-fine split and compose, pointer → notch / unit, keyboard stepping, engraving,
  the readout format, the needle angle, the reveal clock. No React, no DOM, no domain.
- `src/lib/interaction-grammar/estimate.test.ts` — invariants + source contract (35 tests).
- `src/components/interaction-grammar/EstimateBeam.tsx` + `estimateBeam.css` — the primitive.
- `src/components/interaction-grammar/EstimateBeam.test.tsx` — behaviour, leak, reveal, continuity,
  source contract (20 tests).
- `src/components/interaction-grammar/useStageRoom.ts` — the host-side stage measurement (Match
  Grid / Rangefinder's pattern; not yet on `main`).
- `src/lib/combat-estimate/contract.ts` — the capture reader (fails closed), the public / private
  split, the grader, the dev closeness bands.
- `src/lib/combat-estimate/contract.test.ts` — the capture's provenance, the demonstration set, the
  refusals, the split, the grading (25 tests).
- `src/lib/combat-estimate/__fixtures__/combatAuthorityCapture.json` — the frozen authority capture
  (12 certified scenarios + 1 recorded refusal, with provenance).
- `src/components/combat-estimate/CombatEstimateStage.tsx` + `combatEstimate.css` — the scenario
  board, the prelude, the ledger's working / raw ladder / source line.
- `src/pages/dev/combat-estimate/CombatEstimateLab.tsx` + `labAuthority.ts` + `labAuthority.test.ts`
  — the DEV host, its stand-in server, and its tests (7 tests).
- `scripts/combat-estimate/capture_combat_authority.py` — the read-only capture script.
- `e2e/combat-estimate-continuity.spec.ts` — continuity / fit / targets / leak scan, 6 viewports × 2
  motion modes + 3 state runs.
- `COMBAT_ESTIMATE_CE1_HANDOFF.md`.

Edited:
- `src/lib/interaction-grammar/types.ts` — `EstimateScale / EstimateCertification / EstimatePublic /
  EstimateValue / EstimateResponse / EstimateReveal` (+ `_EstimateIsNotSegmentChoiceYet`).
- `src/App.tsx` — DEV-gated route `/dev/combat-estimate`.
- `src/components/Layout.tsx` — full-bleed arena frame for the lab route.
- `src/components/Footer.tsx` — footer self-hides on the lab route.
- `playwright.arena.config.ts` — registers the continuity spec.

Not committed (local throwaway): `playwright.ce1.local.config.ts` (baseURL :5281 + this machine's
`chromium_headless_shell-1228` executable), excluded via `.git/info/exclude`.

## 5. Source data and calculation provenance

Every number a round reveals came out of the backend's own authorities, called directly by
`scripts/combat-estimate/capture_combat_authority.py` (run `python -I … --backend <read worktree>
--db C:/Users/mlmit/mogzy-data/lol_calc.db --out …`; the backend's own `lol_calc.db` files in the
worktrees are 0-byte placeholders, the 6.2 GB database lives in `mogzy-data`):

| Value | Authority |
|---|---|
| attacker / target stats (AD, bonus AD, AP, armor at level with items) | `services.combat_helpers.build_runtime_champion_stats` — Combat Lab's executor stat builder, the route `test_combat_calculations_seam.py` proves the seam equals to the last bit |
| raw damage, target armor, effective armor, multiplier, post-mitigation damage, penetration | `combat_calculations.calculate` → `ability_damage.physical.post_mitigation.v1` (`combat_calculations.physical_ability_damage.v1`), which composes `generic_ability_damage.resolve_generic_ability_damage` + `item_canonical.runtime_stats.map_stats_json` + `damage_mitigation.mitigate_damage(attacker_stats) → penetration.calculate_effective_resistances` |
| the formula's flat-at-rank and ratios (the ledger's first row) | `combat_calculations.formula_disclosure.disclose` (the canonical evaluator probed; linearity checked, not assumed) |
| the modelled component (Pantheon E: "unempowered cast (no Mortal Will)") | `physical_ability_damage.modelled_component` |
| ability names | the `champion_abilities` table |
| item ids / revisions | `item_canonical` `validated_current` rows (every item `@4065930`) |

The capture stamps the backend commit (`8829fc3c…`, clean), the database path / size / mtime, every
authority id, the seam's provenance pairs (formula text, source sheet, item revisions) and formula
bindings per scenario, and the whole-number display answer (`ROUND_HALF_UP`, as
`numeric_choices.display_value` rounds). The pinned Applied-Chain case (Jarvan IV Q rank 3, level 5,
Serrated Dirk vs Olaf 5 — 199 raw, 144.22589108408587 after armor) reproduces exactly and the unit
tests pin it.

The frontend NEVER recalculates League combat. `contract.ts` reads the capture through a strict
allowlist (an answer that is not the authority's number, a mis-rounded display answer, an answer off
the beam, a non-physical row, another implementation, an off-contract working block, a missing
commit — all refuse the capture) and the only arithmetic anywhere is the player's error against the
captured number.

### The demonstration set (all certified)

| Id | Event | Beam | Answer (exact) | Why it is here |
|---|---|---|---|---|
| `jarvan-q-r3-l5-dirk-vs-olaf` | Dragon Strike r3, Lv 5, Serrated Dirk → Olaf 5 | 0–400 | 144 (144.2259) | the pinned certified case; lethality |
| `zed-q-r1-l2-longsword-vs-ahri` | Razor Shuriken r1, Lv 2, Long Sword → Ahri 2 | 0–400 | 73 (72.5666) | the small result |
| `olaf-q-r5-l11-lastwhisper-vs-jarvan` | Undertow r5, Lv 11, Last Whisper → Jarvan IV 11 | 0–600 | 178 (178.3306) | percent penetration (18%) |
| `jarvan-q-r5-l11-noitems-vs-olaf` | Dragon Strike r5, Lv 11, no items → Olaf 11 | 0–400 | 145 (145.4715) | same ability, other rank / level / stats; no penetration |
| `lucian-q-r3-l7-pickaxe-vs-ezreal` | Piercing Light r3, Lv 7, Pickaxe → Ezreal 7 | 0–400 | 121 (121.234) | a plain mid-game hit |
| `leesin-r-r2-l11-brutalizer-vs-sett` | Dragon's Rage r2, Lv 11, The Brutalizer → Sett 11 | 0–500 | 266 (265.8907) | an ultimate; lethality |
| `jhin-w-r5-l13-dirk-pickaxe-vs-malphite-chainvest` | Deadly Flourish r5, Lv 13, Dirk + Pickaxe → Malphite 13 + Chain Vest | 0–700 | 128 (128.0494) | the high-armor target (134.2 armor); two attacker items; a target item |
| `pantheon-e-r5-l13-dirk-vs-garen` | Aegis Assault r5, Lv 13, Dirk → Garen 13 | 0–500 | 233 (232.8496) | the modelled-component note |
| `vi-r-r3-l18-lastwhisper-pickaxe-pickaxe-vs-ornn-chainvest` | Cease and Desist r3, Lv 18, Last Whisper + 2× Pickaxe → Ornn 18 + Chain Vest | 0–800 | 178 (177.7506) | late game, 161 armor, percent pen |
| `yasuo-r-r3-l16-warhammer-vs-sion` | Last Breath r3, Lv 16, Caulfield's Warhammer → Sion 16 | 0–500 | 269 (269.3158) | a large after-armor number |
| `zed-q-r3-l7-longsword-vs-ahri-raw` | Razor Shuriken r3, Lv 7 — **before armor** | 0–400 | 170 | the raw variation (`raw_damage_working.v1`) |
| `jarvan-r-r3-l16-dirk-vs-olaf-raw` | Cataclysm r3, Lv 16 — **before armor** | 0–600 | 486 | the largest number |

Recorded refusal: `jarvan-q-r5-l11-ldr-vs-olaf` — `item_effect_unmodelled` (Lord Dominik's Regards
declares Giant Slayer). The seam's own words travel in `capture.refused`; the round is never served.

Coverage honesty: the seam covers 76 (champion, slot) rows of 688 damage rows (339 not physical, 147
untyped / no damage, 100 read an unsupplied input, 26 mixed); of those, the disclosure refuses rows
that are not "flat per rank + one ratio" (Darius Q's ratio moves with rank), and the premise admits
only effect-free items (Serrated Dirk, Last Whisper, The Brutalizer, Long Sword, Pickaxe,
Caulfield's Warhammer, Cloth Armor, Chain Vest… — B.F. Sword has no `validated_current` row).

### Certified versus synthetic

Every served round is certified (`certification.kind = "certified"`, label `Combat authority ·
8829fc3c` engraved on the instrument's eyebrow, `data-certification="certified"` on the root). One
**synthetic** round exists so the distinction is visible: `?round=synthetic-demo` (also the lab's
"Synthetic" chrome button) — invented numbers, `SYNTHETIC — not certified` on the eyebrow in red,
`data-certification="synthetic"`, no working at the reveal ("No authority working for this round"),
and the capture reader refuses anything not marked certified, so it can never enter the pool.

## 6. Public / private / reveal contracts

**Public (`EstimatePublic` + `CombatEstimateScenario`)** — the prompt, the measure, the unit, the
definition sentence, the assumptions, the scale `{ max, coarseStep, figureEvery }`, the
certification; the attacker (champion, level, items by name, AD, bonus AD, AP, penetration), the
ability (slot, name, rank, max rank, component), the target (champion, level, items, armor). No
field can hold the answer, the raw damage, the effective armor or the multiplier (unit-tested as a
JSON scan, and in the browser as a text + attribute scan with the answer read from the capture on
the Node side).

**Private (`CombatEstimateSecret`)** — the exact and whole answers, the result block, the working
block, the provenance map. Lives only in the lab's stand-in server; the primitive never imports it
(source-tested).

**Reveal (`EstimateReveal`)** — `lockedValue`, `truth { value, valueText, exactText, label }`,
`verdict: exact | under | over`, `error { signed, signedText, absolute, absoluteText, relative,
relativeText }`, `closeness { label, development: true } | null`, `note`, `source` — every string
formatted by the host, every decision the host's. The primitive draws; the one source test pins
that it never compares `lockedValue` to `truth.value`.

**Response** — `{ estimate: number }`. A new transport shape (`_EstimateIsNotSegmentChoiceYet`);
the production seam widens `SegmentChoice` when the module lands.

**Scale policy (DEVELOPMENT-ONLY, answer-independent)** — `max = clamp(ceil(4 × attacker AD / 100)
× 100, 400, 1000)`, coarse step 50, figures every 100. A function of the attacker's attack damage,
which is printed on the board, never of the answer; a scenario whose answer does not fit is
refused by the capture (`scale_overflow`). Recorded in the capture as
`ce1.scale.four_times_attack_damage.dev-v0` with `development_only: true`; the reader refuses a
capture whose policy is not marked so.

Secrecy caveat: the capture JSON ships in the DEV bundle and is readable by a developer. DOM absence
is tested; it is not a production secrecy guarantee. Productionisation keeps answers server-side.

## 7. Interaction behaviour

* **Pointer (mouse, touch, pen)** — press anywhere on a beam and its poise is there; drag and it
  follows continuously while the plaque and the reading mark tick through values (a `detent` cue per
  change); release and it settles on the nearest notch (coarse) or unit (fine). A cancelled drag or
  a secondary button commits nothing. Each rail's hit box reaches 6px above and below its row (≥44px
  everywhere, hit-tested in the browser); the coarse poise is 44px tall, the fine poise 36px.
* **Keyboard** — the instrument is ONE `role="slider"` (labelled by the prompt, described by the
  status line): ←/→ and ↓/↑ step 1, Shift-arrows 10, PageUp/PageDown a coarse notch (50), Home/End
  0 / max−1. Focus ring only when focus came from the keyboard. Enter / Space do nothing on the beam
  — Lock is its own button, so no key can submit by accident.
* **Vernier keys** — `−10 −1 +1 +10`, 44px, disabled at the ends and before any setting.
* **Lock** — enabled once a value exists; submits the committed value exactly (`{ estimate }` and
  nothing else). The host ignores a second Lock in the same round (double-click tested in the
  browser: one response). Locked, every input path is inert and the value shown is the locked one.
* **Reveal** — one `setTimeout` per stage boundary (never a rAF loop, which stalls in a hidden pane),
  budget 1800ms (`charge` 12% · `descend` 30% · `band` 20% · `ledger` 38%); tweens in CSS.
  `onRevealComplete` fires once per reveal. Reduced motion (OS or app class): no clock, the first
  frame is the settled frame, no needle swing, no descent, no band fade, no row stagger.
* **Round switching** — the stage remounts per round id / generation; a pending reveal timer dies
  with the round (guarded by a round ref); no verdict, truth, band or mark survives into the next
  round (unit-tested and browser-tested).
* **Announcements** — one polite `role="status"`: the value after a key move, `Locked at 161
  damage.`, then `Over by 17. Final damage is 144 damage. 12% over.`

## 8. Accuracy presentation and the unresolved grading policy

The reveal shows, always: the player's estimate, the actual value (whole, with the exact value
beside it where it differs), the signed error (`+17` / `−44` / `0`), the absolute error (`Over by
17`), and the relative error against the EXACT authority value (`12% over`; sub-percent misses to one
decimal). The needle's swing is the relative error (full deflection at 50%).

**No pass/fail exists.** `closeness` is a DEVELOPMENT-ONLY descriptive label by relative band —
Exact · Within 2% · 5% · 10% · 20% · 35% · Wide of the mark — carried on the reveal with
`development: true`, and not drawn as a verdict anywhere. Relative bands are the honest thing to
explore because they treat every magnitude alike: ±5 points is 10% of 50 damage but 0.5% of 1 000.
What each band means in points on the demonstrated rounds:

| Round | Answer (exact) | ±2% | ±5% | ±10% | ±20% |
|---|---|---|---|---|---|
| jarvan-q-r3-l5-dirk-vs-olaf | 144 (144.2259) | ±2.9 | ±7.2 | ±14.4 | ±28.8 |
| zed-q-r1-l2-longsword-vs-ahri | 73 (72.5666) | ±1.5 | ±3.6 | ±7.3 | ±14.5 |
| olaf-q-r5-l11-lastwhisper-vs-jarvan | 178 (178.3306) | ±3.6 | ±8.9 | ±17.8 | ±35.7 |
| jarvan-q-r5-l11-noitems-vs-olaf | 145 (145.4715) | ±2.9 | ±7.3 | ±14.5 | ±29.1 |
| lucian-q-r3-l7-pickaxe-vs-ezreal | 121 (121.234) | ±2.4 | ±6.1 | ±12.1 | ±24.2 |
| leesin-r-r2-l11-brutalizer-vs-sett | 266 (265.8907) | ±5.3 | ±13.3 | ±26.6 | ±53.2 |
| jhin-w-r5-l13-dirk-pickaxe-vs-malphite-chainvest | 128 (128.0494) | ±2.6 | ±6.4 | ±12.8 | ±25.6 |
| pantheon-e-r5-l13-dirk-vs-garen | 233 (232.8496) | ±4.7 | ±11.6 | ±23.3 | ±46.6 |
| vi-r-r3-l18-…-vs-ornn-chainvest | 178 (177.7506) | ±3.6 | ±8.9 | ±17.8 | ±35.6 |
| yasuo-r-r3-l16-warhammer-vs-sion | 269 (269.3158) | ±5.4 | ±13.5 | ±26.9 | ±53.9 |
| zed-q-r3-l7-longsword-vs-ahri-raw | 170 | ±3.4 | ±8.5 | ±17.0 | ±34.0 |
| jarvan-r-r3-l16-dirk-vs-olaf-raw | 486 | ±9.7 | ±24.3 | ±48.6 | ±97.2 |

Consequences the owner should weigh before choosing: a ±2% band is one or two points on the 73-damage
round (effectively "exact" on a 400-beam where one fine tick is a unit) and ten points on the 486
round; an absolute band would do the reverse. A hybrid (`max(k points, p%)`) is the usual answer and
is exactly the kind of decision the brief reserves. "Exact match" is the verdict word only when the
whole numbers agree; it is not the only successful presentation — a 12% miss still gets the full
reveal, the ladder and the proof.

## 9. Lab

`/dev/combat-estimate?round=<id>&state=open|set|locked|revealed-exact|revealed-over|revealed-under
&seed=<any>&motion=reduce` — pre-arranged states for capture; `?round=synthetic-demo` for the
visual-only round. Chrome row (inset clear of the GlobalHud's fixed chips): the state buttons,
Reduced motion, Synthetic, Reset, Next, and two reserved opacity-toggled indicators (the last response
`{161}` and `reveal done`). Dev servers (entries in the backend worktree's ignored
`.claude/launch.json`): `ce1-fe` (vite :5280) and `ce1-e2e` (vite :5281).

## 10. Responsive design

Composition is one component with CSS tokens per tier (tall desktop ≥800px, desktop, compact desktop
≤719px, phone, short phone ≤700px). The measured room (`useStageRoom`) is a CAP, not a height: on a
tall screen the instrument sits at its natural height, centred by the arena; on a short one the
ledger yields first. On phones the arena's stage is content-sized (the measurement is circular), so
the short-phone tier is budgeted by tokens to fit a 640px viewport exactly: board 128 · head 46 ·
instrument 130 · plate 44 · ledger 46 · status 12 · gaps 4 (≈ 422px of stage).

Phone: the board stacks attacker → ability → target in three rows; the plaque stacks label over
value; the plate keeps all four vernier keys and a full-width Lock on one row; the relative error
moves from the plate to the status line.

Measured in the final run (see §12 for the numbers the spec printed).

## 11. Accessibility

* One slider with `aria-valuemin/max/now/text` in damage, labelled by the prompt, described by the
  status line; `aria-disabled` and `tabindex=-1` once locked.
* Vernier keys and Lock are real buttons with full names (`More by 10 damage`); the needle well,
  the beams' engraving, the poises, the mark, the pointer and the band are `aria-hidden` —
  everything they say is also said in text (the plaque, the plate, the status line, the live region).
* One polite live region for value changes, the lock, and the verdict + fact.
* Reduced motion honoured from both switches (`useReducedMotionPreference`).
* The attacker, target and ability are named in text, not by art alone; the certification is a
  visible label with `data-kind`.

## 12. Tests

### Unit (vitest)

`npx vitest run src/lib/interaction-grammar/estimate.test.ts src/lib/combat-estimate/contract.test.ts
src/components/interaction-grammar/EstimateBeam.test.tsx src/pages/dev/combat-estimate/labAuthority.test.ts`
→ **4 files, 75 passed, 0 failed** (run from PowerShell with `SWC_NATIVE_BINDING_CACHE`).

- `estimate.test.ts` (35): content assertions (lattice, two notches, figures, certification);
  clamp / round / NaN; notches; split ↔ compose round-trip over every value on a beam; clamped
  compose; linear map; coarse snap and its last notch; fine press; engraving; keyboard steps,
  clamps and unowned keys; readout grouping and signs; needle (exact 0, ±21 at 25%, pinned at
  ±42, null relative pins); the reveal plan (contiguous, budget, minimum, reduced = instant, stage
  order); source contract (no domain, no host, no truth).
- `contract.test.ts` (25): the capture is the certified seam at the verified master, clean, dev-only
  policy; the demonstration set (the pinned case to the last bit, high armor, percent pen,
  lethality, no items, the component, small and large, the raw pair); the recorded refusal; every
  working block reads; every answer on its AD-derived beam; `readCapturedScenario` fails closed on
  seven tamperings + duplicate / no-commit captures; the public JSON carries no private value; the
  definitions; `gradeEstimate` exact / over / under / sub-percent / zero-truth / refusals; the
  bands' magnitude consequence; `exactText`.
- `EstimateBeam.test.tsx` (20): nothing answer-bearing before the reveal; one slider's keys;
  coarse / fine presses (mouse, touch, pen) and the live reading; drag follow and settle; cancel
  and secondary button commit nothing; the beams keep each other's part; vernier keys and their
  disabling; Lock submits exactly `{ estimate }`; no Lock before a setting; locked is inert; the
  reveal under reduced motion (verdict, truth, band, needle 9.7°, ledger on, prelude off,
  completion once); the band and pointer by the same map as the mark; exact = no band + pointer on
  the mark; the verdict is displayed not derived; the clock's stages on fake timers with completion
  once; unmount cancels the clock (zero timers left); a new round wipes everything; the same
  regions in every phase; the synthetic label; source contract.
- `labAuthority.test.ts` (7): no answer token in any served content; the prompt by metric; grading
  returns the authority's working and provenance line; the component note; out-of-beam responses
  refused; the synthetic round is unmistakable and outside the pool; the seeded order.

Typecheck: `tsc -p tsconfig.app.json --noEmit` — clean apart from the two pre-existing `main`
errors (`OnboardingProfile.tsx`, `identity/connections.ts`), as on base. ESLint on every CE1 file:
clean.

### Browser (Playwright, `e2e/combat-estimate-continuity.spec.ts`)

Run through the local throwaway config against `ce1-e2e` (:5281) with this machine's
`chromium_headless_shell-1228`. Each continuity run plays open → press the coarse beam → drag the
fine beam → `+10` `−1` → ←, Shift-←, PageDown, PageUp, ← → Lock (double-click) → locked → reveal
(frame series in motion mode) → done → Next → a second round by keyboard only → its reveal, sampling
twelve structural regions on every animation frame and DOM commit (budget ≤1px; the poises, the
mark, the pointer and the band are excluded by design), and asserting ≥44px controls with rendered
size = layout size, ≥44px rail hit boxes (hit-tested), zero overflow inside the stage, zero page
scroll, zero horizontal overflow, and the pre-reveal leak scan (no verdict / truth / band / stage
attribute; the answer, the exact value, the effective armor and the multiplier absent from the
stage's text and from every attribute — read from the capture on the Node side) on both rounds.

`npx playwright test -c playwright.ce1.local.config.ts` (final run, after the last change):

```
15 passed (1.9m)
```

12 continuity runs (6 viewports × 2 motion modes) + the exact-lock run (no band, needle at 0°, the
pointer's transform equals the mark's), the underestimate run (poise and band left of the truth,
needle negative) and the synthetic run (`data-certification="synthetic"`, red label, no working).

Worst frame-to-frame movement per region over the full lifecycle (open → press → drag → release →
vernier → keyboard → Lock ×2 → locked → reveal → done → Next → second round → its reveal), sampled on
every animation frame and DOM commit — **0.00px for every region in every run** (root, scenario
board, head, instrument, plaque, coarse beam, fine beam, plate, lock, ledger, status, and the
arena's question stage); budget ≤1px.

| Viewport | frames (motion / reduced) | stage (question section) | CE stage | board | instrument | ledger | px per coarse notch | px per fine unit |
|---|---|---|---|---|---|---|---|---|
| 1600×900 | 355 / 151 | 743×688 | 685×554 | 685×96 | 685×194 | 685×92 | 75.4 | 12.3 |
| 1280×720 | 401 / 166 | 626×520 | 584×488 | 584×88 | 584×174 | 584×70 | 62.8 | 10.3 |
| 1366×650 | 441 / 168 | 626×450 | 584×378 | 584×64 | 584×138 | 584×52 | 62.8 | 10.3 |
| 1280×600 | 432 / 169 | 626×400 | 584×368 | 584×64 | 584×138 | 584×44 | 62.8 | 10.3 |
| 390×844 | 450 / 169 | 374×638 | 352×544 | 352×150 | 352×170 | 352×76 | 33.8 | 5.5 |
| 360×640 | 414 / 174 | 344×434 | 322×414 | 322×128 | 322×128 | 322×44 | 30.0 | 4.9 |

(Beam resolution is for the 0–400 beam of the first round; a 0–800 beam halves the px per notch and
the fine beam is unchanged. 4.9px per fine unit on the smallest phone is the thumb's floor — the
`±1` keys and the keyboard make exactness one tap away.) The same runs assert ≥44px rendered
controls equal to their layout size, ≥44px rail hit boxes by hit-testing, zero overflow inside the
question stage, zero page scroll, zero horizontal overflow, the double-Lock producing one response,
and the pre-reveal leak scan on both rounds of every run.

Two things the browser runs caught during the build, both fixed before the final run: the
compact-desktop tier overflowed its locked stage by 16px (the tier's tokens were cut), and the
smallest phone — where the arena's stage is content-sized, so the measured room cannot cap
anything — scrolled the page by 35px (the short-phone tier is now budgeted to 640px by tokens).

Captures: `C:/Users/mlmit/OneDrive/Desktop/combat-estimate-ce1-shots/` — per viewport (`1600x900`,
`1280x720`, `1366x650`, `1280x600`, `390x844`, `360x640`, each also `-reduced`): `-1-open`,
`-2-drag`, `-3-set`, `-4-locked`, `-5-reveal-0…7` (motion only), `-6-revealed`, `-7-next`,
`-8-second-revealed`; plus `1600x900-exact`, `1600x900-under`, `1280x720-synthetic`.

## 13. Known limitations

- **Lab only.** No `combat_estimate.v1` backend module, no `SegmentChoice` widening, no registry
  entry, no admin preset: the stand-in server is `labAuthority.ts` and the answers live in a DEV
  fixture.
- **Grading unresolved** by design (§8). The closeness label is development-only.
- **Scale policy is a dev heuristic** (4× AD). It fits every demonstrated round; a production
  policy should be chosen with the grading policy, because the beam's range and the error band's
  visual width are the same number.
- **One ratio per formula.** Rows whose ratio moves with rank (Darius Q) or that are not "flat +
  ratio" are refused by the disclosure, so they have no ledger first row and are not in V1.
- **Target HP is not shown.** No percent-of-HP presentation: the target's health is not part of the
  certified premise and was not invented.
- **Compact desktop board** (1366×650 / 1280×600) truncates long item lists ("Last Whisper, Pickaxe,
  Pickaxe") with an ellipsis; the stated items are complete in the capture and the working.
- **No sound cues** are wired; `onCue` fires (`detent`, `lock`, `descend`, `settle`, `resolve`) for
  a host to voice.
- **Header verdict hold** (the known Ranked limitation): once hosted, the arena's own result plate
  would land before the module's reveal choreography; the lab has no plate.
- The lab's arena header shows a paused timer and placeholder rails.

## 14. Branch, base and final SHA

- Frontend: `combat-estimate/ce1-fable` at `C:/Users/mlmit/mogzy-wt/ce1-fable`, base `b2b1804a`
  (`origin/main`).
- Backend: read at `8829fc3c` (`origin/master`), unchanged.
- Final commits: see `git log -2 combat-estimate/ce1-fable` — the work commit "CE1: Combat Estimate —
  the ESTIMATE primitive, lab host, frozen authority capture" and "CE1: handoff current" (this file).

## 15. Recommended next backend implementation step

1. **`combat_estimate.v1` module** (Reconstruct / Rangefinder pattern): a round = one certified
   premise composed by the existing `mastery.setup_state.combat_scenario` machinery (it already
   resolves a matchup state, calls the same seam and freezes `combat_working.v1`); the server
   serves `EstimatePublic` + the scenario board data with no answer, keeps `post_mitigation_damage`
   / `raw_damage` server-side, grades `{ estimate }` into `EstimateReveal` + the working block, and
   decides the scale from the public premise by a policy it owns (replacing
   `ce1.scale.four_times_attack_damage.dev-v0`).
2. **Grading policy** — the owner's decision after playtest (§8); implement it server-side as the
   `verdict` / `closeness` the reveal already carries, and only then as points.
3. **Wire seams** (the set every module touched): `SegmentChoice` + submit body (`{ estimate }`),
   `contracts.ts` block / reveal / forbidden keys, `registry.ts`, the lock-reveal inline set,
   `centralStage.ts` title, transcript / review cards (the ledger reuses `JourneyCombatWorking`),
   `roundMedia.ts` preload, `RankedShellProbe` `?q=combat-estimate` + bot replay, an admin
   `CombatEstimateLaunch.tsx` (preset `admin.combat_estimate`).
4. **Module host** — `useStageRoom` → cap; memoise `content` / `reveal` by value; `revealBudgetMs`
   from `pacing.serverPacedHoldMs`.
5. **Content growth, after authority certification** — magic damage (a `magic_resist` twin of the
   seam), true damage, per-hit multi-hit abilities with a stated hit count, a frozen target HP for
   a percent-of-HP reading.
