# COMBAT ESTIMATE CEG1 — grading and fairness audit (handoff)

Research only. No production integration, no frontend interaction change, no change to CE1's grader,
fixture or visuals, no backend change, no DB access, no Docker. Local only: not pushed, not merged,
CE2 not started. **Nothing here is an approved grading policy** — §8 is a *provisional
recommendation for owner review*.

## 0. Bases and isolation

| What | Where | SHA |
|---|---|---|
| CE1 prototype (read, untouched, still playtestable) | `C:/Users/mlmit/mogzy-wt/ce1-fable`, `combat-estimate/ce1-fable` | `7929f2dc` (verified head; work commit `dd0d442e`) |
| This audit | `C:/Users/mlmit/mogzy-wt/ceg1-grading-audit`, `combat-estimate/ceg1-grading-audit` | branched from `7929f2dc`; final SHA in §14 |
| Backend (read only) | detached worktree `C:/Users/mlmit/mogzy-wt/ceg1-be-read` | `7e2cb3b7b28c6e774a2eaaf4fa04911ece30f3a1` = `origin/master` after `git fetch` (verified) |

The capture was made at backend `8829fc3c`. `git diff 8829fc3c 7e2cb3b7` over `combat_calculations/`,
`mastery/calculations/`, `damage_mitigation.py`, `generic_ability_damage.py`,
`item_canonical/runtime_stats.py`, `services/combat_helpers.py`, `ranked_modules/{points,contract}.py`,
`mastery/questions/precision.py`, `schemas/ranked_public_schemas.py`, `ranked_public/bot.py` is
**empty** (5 commits between, none touching them). The capture was not re-run (it needs the 6 GB
DB); a CE2 implementation should re-capture at its own base.

`node_modules` in the new worktree is a junction to the main checkout (same as CE1's) — never
`git worktree remove` it with contents.

Prior grading decisions found: the only documented one is MIG1's (`mig1/1-interaction-lab`,
`docs/MIG1_INTERACTION_GRAMMAR_HANDOFF.md` §8.2/§15.2): *"Stat Drop 'how close were you' is
display-only … Grading stays binary"* and *"Should Stat Drop ever score closeness? … product
decision"* — left open, Stat Drop on HOLD. No Stat Drop grading report or threshold exists. The
backend's binding numeric precedent is `mastery/questions/precision.py` (`mastery-precision-1.1.0`):
binary grading, the **displayed** value is the graded value, `ROUND_HALF_UP`, and an explicit
rejection of percentage tolerance for *recall* answers ("a large health total does not buy a
sloppier answer"). CE is an *estimation* task, so this audit reaches a different rule but keeps that
contract's two invariants: binary, and *the number shown is the number graded*.

## 1. How to reproduce

```
npx tsx scripts/combat-estimate/grading/audit.ts            # print every table
npx tsx scripts/combat-estimate/grading/audit.ts --write    # refresh CEG1_AUDIT_TABLES.md
npx vitest run scripts/combat-estimate/grading/             # 20 tests, incl. "tables are current"
```

All numbers below come from `scripts/combat-estimate/grading/CEG1_AUDIT_TABLES.md` (generated, 13
sections; a test fails if it is stale). Evidence labels used throughout:

* **[verified]** — a mathematical property, proven or pinned by a test for every input it claims.
* **[measured]** — computed on CE1's 12 certified scenarios.
* **[modelled]** — hypothetical player answers derived offline from the public premise + disclosed
  formula. They are *models of plausible errors*, not player data and not certified League numbers.
  Anchor: the unmodified model reproduces all 12 captured answers to |Δ| = 0.0 (tested < 1e-9).
* **[hypothetical]** — invented truths for stress tests. Not League data.
* **[judgment]** — product judgment. **[owner]** — still requires owner playtest.

## 2. The instrument and the data

### Instrument contract [verified, from `estimate.ts` / `labAuthority.ts`]

* Submits one whole number in `[0, max − 1]`. Coarse beam notched every 50; fine beam 0–49 (one
  unit per tick); ±1/±10 vernier keys; arrows ±1, Shift ±10, PgUp/PgDn ±50. **Every whole value is
  reachable on every beam** (±1 keys) — exactness costs time, never reachability.
* Off-beam / non-integer / negative responses are *refused* by the lab authority, not graded. The
  beam cannot produce them. The grading simulations therefore round an intended estimate half-up
  and clamp it, and report separately when an intent was not expressible (2 of 288 simulated
  intents fell off a beam: Zed Q 73 − 100, and Jarvan R raw 486 + 30% > 599).
* Scale (dev-only `ce1.scale.four_times_attack_damage.dev-v0`): `max = clamp(ceil(4·AD/100)·100,
  400, 1000)`. Answer-*independent*, but AD-*correlated* (see trap T6).
* Fine-beam resolution is the same on every round (the fine beam always spans one 50-point notch):
  12.3 px/unit at 1600×900, 5.5 at 390×844, 4.9 at 360×640. The coarse beam's px/unit falls as the
  beam grows (0.34 px/unit for an 800 beam on a 390 phone). **Changing the scenario changes the
  coarse beam's difficulty, not the fine beam's**; a band in points is the same physical width on
  the fine beam everywhere [measured, §11 of the tables].

### Certified distribution [measured]

| | |
|---|---|
| Scenarios | 12 certified, 0 synthetic in the capture (the lab's `synthetic-demo` lives in `labAuthority.ts` and the capture reader refuses it — excluded); 1 recorded refusal (`jarvan-q-r5-l11-ldr-vs-olaf`) |
| Metric | 10 after armor (post-mitigation), 2 before armor (raw) |
| Exact answer | min 72.5666 · Q1 140.2 · median 173.9 · Q3 241.1 · max 486 |
| After-armor range | 72.6 – 269.3 (raw: 170, 486) |
| Precision | after-armor answers are real-valued (10/10 fractional); display = `ROUND_HALF_UP` whole; largest |exact − whole| = 0.47 |
| Beams | 400, 500, 600, 700, 800; answer sits at 0.18–0.81 of the beam (median 0.36) |

**Representativeness: not sufficient to *finalise* a policy.** All answers are 73–486; nothing
below 70 or above 500; physical damage only; one formula shape (flat + ratio); 2 raw rounds; 6
champions dominate (Jarvan IV is 4 of 12). The data supports *choosing a rule shape and a
provisional width*; the small-magnitude and large-magnitude behaviour below is **[hypothetical]**.

## 3. Policies compared

| | Rule (as implemented in `policies.ts`) | Ranked-compatible as is? |
|---|---|---|
| **A** Absolute | `|e − whole| ≤ K` | yes (binary, per player) |
| **B** Relative | `|e − exact| ≤ p·exact` (CE1's relative convention) | yes, but undefined at 0 and asymmetric (T1, T2) |
| **C** Hybrid | `|e − whole| ≤ T`, `T = max(K, ROUND_HALF_UP(p·whole))` — an integer band on the shown answer | yes |
| **D** Smooth | `score = max(0, 1 − rel/0.5)`; also log-ratio distance | **no** as authority (no fractional outcome; see §7) — reveal-only |
| **E** Closest wins | nearer estimate wins, equal distance draws | **no** without a contract change (§7) |

## 4. Policy comparison [measured]

Offset simulations — correct verdicts out of 12 (under / over). Intents: `whole ± d`, or
`exact·(1 ± p)`, then rounded/clamped to what the beam can submit. (Full table: tables §3.)

| Offset | Abs ±5 | Abs ±10 | Rel 5% | Rel 10% | **C max(±2, 2.5%)** | C max(±3, 5%) | C max(±5, 10%) | D mean score |
|---|---|---|---|---|---|---|---|---|
| exact | 12 | 12 | 12 | 12 | **12** | 12 | 12 | 1.00 |
| ±1 | 12/12 | 12/12 | 12/12 | 12/12 | **12/12** | 12/12 | 12/12 | 0.99 |
| ±5 | 12/12 | 12/12 | 11/11 | 12/12 | **4/4** | 11/11 | 12/12 | 0.94 |
| ±10 | 0/0 | 12/12 | 4/4 | 11/11 | **1/1** | 4/4 | 11/11 | 0.88 |
| ±25 | 0/0 | 0/0 | 0/0 | 3/3 | **0/0** | 0/0 | 3/3 | 0.69 |
| ±50, ±100 | 0 | 0 | 0 | 0 | **0** | 0 | 0 | 0.41, 0.10 |
| ±5% | 1/1 | 8/8 | 7/8 | 12/12 | **0/0** | 12/10 | 12/12 | 0.90 |
| ±10% | 0/0 | 1/1 | 0/0 | 5/7 | **0/0** | 0/0 | 11/11 | 0.80 |
| ±15/20/30% | ~0 | ~0 | 0 | 0 | **0** | 0 | 0 | 0.70/0.60/0.40 |

The asymmetric cells (Rel 5% at ±5%: 7/8; Rel 10% at ±10%: 5/7) are trap T2 in action: the same
nominal distance is correct over and incorrect under on the same round.

**Discrimination sweep** [modelled] — 5 correct-method shortcuts (multiplier to 2 dp, etc.), 19
rough shortcuts (armor to nearest 5, multiplier to nearest 0.05), 69 misconceptions (forgot armor,
forgot penetration, percent pen as flat, armor as a straight % cut, AD/bonus-AD swapped, forgot the
ratio, rank ±1, armor applied to a raw question). Selected rows (full: tables §7):

| Policy | Method shortcuts accepted | Rough shortcuts accepted | Misconceptions rejected | Uniform random hit |
|---|---|---|---|---|
| Abs ±2 | 100% | 58% | 100% | 1.0% |
| Abs ±5 | 100% | 89% | 96% | 2.2% |
| Abs ±10 | 100% | 100% | 88% | 4.3% |
| Rel 2.5% | 100% | 79% | 100% | 2.0% |
| Rel 5% | 100% | 100% | 94% | 3.9% |
| Rel 10% | 100% | 100% | 83% | 7.8% |
| **C max(±2, 2.5%)** | **100%** | **79%** | **100%** | **2.2%** |
| C max(±3, 5%) | 100% | 100% | 94% | 4.1% |
| C max(±5, 10%) | 100% | 100% | 83% | 8.0% |

Distances that set the window [modelled]: method shortcuts land ≤ 0.9% / ≤ 2 pts from the truth;
rough shortcuts ≤ 4.6% / ≤ 10 pts; the *nearest* misconceptions are 2.7% (Olaf, percent pen as
flat, +5), 2.9% (Lee Sin, forgot lethality, −8), 4.3% (Jhin, forgot lethality, −5), 4.5% (Vi, %
pen as flat, −8). **A tolerance above ~2.7% stops measuring penetration on low-penetration
premises; a tolerance below ~1.2% starts failing correct-method players** (bound in §6).

## 5. Stress tests [hypothetical] (tables §9)

| Truth | Abs ±5 | Rel 10% | C max(±2, 2.5%) | Comment |
|---|---|---|---|---|
| 0 (no damage) | 0..5 | **undefined (÷0)** | 0..2 | relative rules need a special case at zero |
| 3 | 0..8 | 3..3 (exact only) | 1..5 (±67%) | the floor dominates; tiny answers are near-guessable either way |
| 12.4 | 7..17 | 12..13 | 10..14 | |
| 40 | 35..45 | 36..44 | 38..42 | |
| 144.5 → 145 / 144.4999 → 144 | 140..150 / 139..149 | 131..158 / 131..158 | 141..149 / 140..148 | hybrid follows the shown whole number; rel. ignores it |
| 450 | 445..455 | 405..495 | 439..461 | |
| 980 (beam 1000) | 975..985 | 882..999 (clipped) | 955..999 (clipped) | top clipping is harmless: unclipped values are not inputtable |
| 395 (beam 0–399) | 390..399 | 356..399 | 385..399 | |

Near-boundary under the recommendation: at 150, 146 and 154 are correct and 145 / 155 are not
(2.7% at the edge); at 450, ±11. One point decides the edge — that cliff exists for *every* binary
rule; the hybrid's is at least an integer the reveal can print.

## 6. Fairness traps identified

* **T1 — relative error at zero.** [verified] A pure relative rule has no answer when damage is 0
  and is effectively "exact only" below ~10 damage (10% of 3 is 0.3). CE1's `gradeEstimate`
  already returns `relative: null` at zero. The hybrid's floor `K` handles both.
* **T2 — relative on the exact value is asymmetric around the shown answer.** [measured] 7 of 12
  rounds have unequal under/over allowances under Rel 5% or 10% (Zed Q 73: −4/+3 at 5%; Olaf
  178: −17/+18 at 10%). The player sees "144"; the band is centred on 144.2259. The hybrid band is
  symmetric in points by construction [verified].
* **T3 — percent display vs percent grade.** [measured] CE1's reveal prints `Math.round(rel×100)%`.
  Under a `≤ p%` rule, **23** estimates read exactly "5%" but fail a 5% rule, **22** read "10%" but
  fail a 10% rule (e.g. Jarvan Q: 159 reads "10% over", is 10.24%). Fix: state the band and the miss
  in damage points ("needed within ±4 — you were 6 over"); keep percent as secondary text.
* **T4 — a fixed point tolerance cannot scale.** [verified bound] Rounding the armor multiplier
  `m` to 2 dp costs ≤ `0.005/m` of the answer — relative, magnitude-free. With `m` 0.43–0.81 on the
  certified rounds that is ≤ 1.2%: 11.6 pts at a hypothetical 1 000 damage. Abs ±3 (which looks
  best on today's narrow 73–486 data) would fail correct-method players at high magnitudes.
* **T5 — the tolerance must not be published before Lock.** [verified] `T` is a function of the
  answer: seeing "±4" tells a player the answer is in 140–179. The *rule* ("within 2.5%, at least
  ±2") may be public; the *band* is reveal-only and must be kept server-side.
* **T6 — the beam carries a magnitude signal.** [measured, n = 12, leave-one-out] Answer/beam
  clusters (median 0.36). A no-knowledge "lock 0.362 × beam" guesser hits the recommended band on
  2/12 rounds (both Jarvan Q: 0.361, 0.364), against 2.2% for a uniform guess. The AD chip alone
  (lock c × AD) hits 0/12 under the recommendation, 2/12 under ±10 / 10%. Twelve rounds cannot
  measure this durably, but it is enough to say the production scale should not be a stable
  multiple of AD (§9 difficulty controls).
* **T7 — whether a round measures a mechanic depends on the premise, not the threshold.**
  [modelled] With lethality 5–10 (Lee Sin, Jhin) "forgot lethality" lands only 5–8 pts away;
  Zed Q (bonus AD 10) makes "forgot the ratio" cost 8–10. No threshold can make such rounds test
  those mechanics without also failing approximate-but-correct players. Per-round margin (nearest
  misconception − T): Olaf 1, Lee Sin 1, Jhin 2, Zed Q 3, Vi 4, others 6–24 (tables §12).
* **T8 — closest-wins rewards relative, not absolute, knowledge.** [measured pairs] 144 vs 145 on
  a 144.23 truth: both correct by any reasonable band, but head-to-head makes one "incorrect"; 120
  vs 450 on a 265.89 truth: both badly wrong, one becomes "correct" (tables §10).
* **T9 — speed bonus.** [judgment] `single_points` gives +1 to the strictly-faster *correct*
  player. With a wide band (±10%) a fast rough dial-in earns the bonus as surely as a careful
  answer; with an exact-only band, the bonus rewards vernier dexterity. A band ≈ 2.5% is wide
  enough that a fine-beam drag (≥ 25 px of target on the smallest phone) lands it in one motion
  and narrow enough that a knowledge-free guess almost never does. Unproven without timing data.
* **T10 — recall load.** [verified from the board code] The premise shows AD, bonus AD,
  lethality/pen and armor, but **not** the ability's base damage or ratio — the player must recall
  them (patch-specific). Rank ±1 recall errors land 12–50% away and are rejected by every band ≤
  10%; this is the largest knowledge component and is *fair only if recall is the intended skill*
  [owner]. The reveal ledger shows the formula, so a miss is always explained.
* **T11 — rough shortcuts.** [judgment] "Multiplier to the nearest 0.05" is correct mechanics with
  coarse mental math; the recommendation accepts 79% of these (rejects Jarvan Q −5, Jarvan Q no
  items +5, Pantheon −10, Vi +8). Whether such a player "knows" the answer is the core owner call;
  the fallback accepts all of them at the cost of T7's penetration misconceptions.

Desktop vs mobile [verified]: the rule is a pure function of the submitted integer, so it is
identical on every device. What differs is *effort*: the band on the 390×844 fine beam is 28 px (73
answer, ±2) to 138 px (486, ±12) vs 62–308 px at 1600×900; exact (±0) would be a 4.9 px target on
the smallest phone.

## 7. Ranked compatibility

The Ranked v2 seam (`ranked_modules/contract.py`, `points.py`, `ranked_public/*` at `7e2cb3b7`):

* A module provides `challenge_is_correct(private_payload, legacy_row, challenge_index,
  raw_choice) -> bool` — **one player's raw choice and the frozen private payload, nothing else**.
  It is called per player in submission/attempt recording (`ranked_public/service.py:4510`), in
  legacy replay (`:1235`, `:3274`), and for Survival strike flags (`segment_flow.py:777`, whose
  docstring pins "this is not a second grader" — it must agree with `resolve_segment`).
* `resolve_segment(..., submissions, context)` returns per-player outcomes from `{correct,
  incorrect, timeout}`, integer points in `0..100`, and `ChildOutcome`s; points for a single
  challenge come from `points.single_points(correct, timed_out, strictly_faster, correct_points)`
  with `correct_points` frozen from `TIER_CORRECT_POINTS` (2/2/3/3) and one `SPEED_BONUS_POINTS`.
* `SegmentChallengeIn` (`extra="forbid"`) has `item_id | card_id | selected | order | placement`;
  CE1's `{ estimate }` is a new spelling (as `order` and `placement` were).

| Requirement | A / B / C | D smooth | E closest wins |
|---|---|---|---|
| One authoritative submitted estimate | ✓ | ✓ | ✓ |
| One server-owned decision | ✓ pure fn of (frozen T, e) | ✗ a score, not a decision — thresholding it collapses to B | ✗ needs the opponent's estimate; `challenge_is_correct` has none |
| One correct/incorrect/timeout outcome | ✓ | ✗ no fractional outcome; points ∝ score would need a new points function (a second scoring engine) | ✗ "correct" would mean "won": a 1-pt loser becomes a Survival strike, a Review item and Weak Areas evidence; draws have no outcome; solo/Daily/bot formats have no opponent |
| Frozen, replayable | ✓ (freeze T in the private payload) | ✓ | ✓ only via `resolve_segment`, then disagrees with `challenge_is_correct` |
| One educational reveal | ✓ | ✓ (as reveal text) | ✓ |

**Conclusion:** A, B and C fit the existing seam with no contract change. D is reveal-only
(closeness label / needle — CE1 already does this). E would require changing the frozen outcome
semantics (or a separate head-to-head contract the comment in `contract.py` gestures at but
nothing implements) — out of scope for V1; revisit only as a distinct Ranked format.

**Launch gating** [judgment]: admin preset first (`admin.combat_estimate`, the Reconstruct
pattern), then practice/Study Hall, and only then Ranked pools — after the evidence in §8.8. A
graded estimation game changes what "correct" means to players; it should not first appear in a
rated match.

## 8. Provisional V1 recommendation (for owner review — NOT adopted)

1. **Error metric.** Integer absolute error against the **displayed whole answer**:
   `d = |estimate − whole|`, whole = `ROUND_HALF_UP(exact)`. [verified: symmetric, integer, no
   display/grade cliff, defined at 0]
2. **Threshold.** `T = max(2, ROUND_HALF_UP(0.025 × whole))`; correct ⇔ `d ≤ T`. On the certified
   rounds T = 2 (73) … 4 (144–178) … 7 (266–269) … 12 (486). Policy id
   `combat_estimate.hybrid.k2.p025.v1`.
   *Selection procedure* (reusable when content grows): p must exceed the correct-method shortcut
   bound (≤ 1.2% at m ≥ 0.43 [verified]) and stay below the nearest misconception that the content
   intends to test (≥ 2.7% today [modelled]); K must give ≥ 5 accepted values (≥ 25 px on the
   smallest phone's fine beam) so the floor is about touch precision, not knowledge. 2.5% / ±2 is
   the point in that window that rejected all 69 modelled misconceptions [measured].
3. **Display.** Reveal states the verdict, the band in points ("Within ±4"), the signed miss in
   points, and the relative error as secondary text only. Never show T before Lock (T5). The rule
   in words may be public.
4. **Scoring semantics.** Unchanged Ranked v2: correct → `single_points(correct_points=tier)`, +1
   speed bonus only if correct and strictly first; incorrect → 0; timeout → 0. **No exact/perfect
   bonus** (RP1 has exactly one bonus; an exact lock gets the "Exact" label in the reveal only).
   One `ChildOutcome` with `answer = estimate`.
5. **Edge cases.** Zero damage → band `[0, 2]`. Band clipped to `[0, max − 1]` (unreachable values
   are not inputtable). Non-integer / negative / off-beam / bool → refused in
   `validate_challenge_input` (422), never graded. T computed once at generation and **frozen in
   the private payload** with the policy id, so a later policy change never re-grades a frozen
   match. Raw (before-armor) rounds use the same rule [judgment; owner may tighten — raw answers are
   exact arithmetic].
6. **Difficulty controls.** (a) Serve a round in Ranked only when its nearest modelled
   misconception is ≥ T + 3 points away (today this excludes Olaf Q, Lee Sin R and Jhin W —
   keep them for practice or raise their penetration/ratio stakes in the premise). (b) Tier by
   mechanics: raw only → opening; armor → middle; armor + penetration → late. (c) Replace the
   dev 4×AD scale with a server-owned scale that is not a stable multiple of AD (e.g. seeded
   choice among 3–5 multiples, or fixed beams per tier) so answer/beam does not cluster (T6).
7. **Instrument compatibility.** No EstimateBeam change needed: every band is ≥ 5 whole values;
   exactness stays one tap away (±1); CE1's reveal already draws the error band and needle.
8. **Required pre-launch evidence.** (a) Owner playtest (§10) with ≥ 80% agreement between the
   owner's blind gut call and the rule. (b) A small blind trial (≥ 10 players × all rounds,
   desktop + phone) logging estimate, time and device, to test whether real errors look like the
   modelled ones — *no claim here that mathematical closeness equals skill is proven*. (c)
   Re-capture at CE2's base and grow the certified pool (≥ 40 rounds; magnitudes < 70 and > 500;
   more champions) and re-run `audit.ts` — the window in (2) must still exist. (d) Timing data for
   T9.

**Fallback if the owner finds 2.5% punishing:** `max(±3, 5%)` (`…hybrid.k3.p05.v1`): accepts every
rough shortcut, rejects 94% of modelled misconceptions (lets the four low-penetration ones
through — those rounds then stop testing penetration), uniform-guess hit 4.1%. If the owner finds
the *recommendation* too forgiving: `max(±1, 2%)` (79% rough accepted, 100% misconceptions
rejected, 1.7% guess) — same shape, narrower.

### What kind of claim each part is

| Claim | Kind |
|---|---|
| Hybrid band is symmetric, integer, contains the answer, defined at 0, never narrower than K; wider ⊇ narrower | **verified** (tests) |
| Relative-on-exact asymmetry; 23 / 22 display cliffs; the counts in §4; T values; band px | **measured** on CE1's 12 rounds |
| Multiplier-rounding bound 0.005/m | **verified** (algebra) + measured m range |
| Shortcut/misconception distances, the sweep, margins, which rounds measure penetration | **modelled** |
| Zero, tiny, 450, 980, boundary behaviour | **hypothetical** |
| 2.5% / ±2 as the provisional width, no exact bonus, admin-first launch, scale change | **product judgment** |
| Whether rough-shortcut players should pass; whether recall is the intended skill; whether the edge cliff feels fair; raw-round width | **owner playtest** |

## 9. Required owner decisions

1. Rule shape: hybrid integer band (recommended) vs absolute vs relative.
2. Width: `max(±2, 2.5%)` (rec.) / `max(±3, 5%)` (fallback) / `max(±1, 2%)` (strict).
3. Is coarse-but-correct mental math (T11) "knowing the answer"?
4. Is recalling the ability's base damage and ratio part of the skill (T10), or should the premise
   state them (turning the round into a pure mitigation estimate)?
5. Raw rounds: same width, or exact-only/±1?
6. Exact lock: label only (rec.), or any reward (would break RP1's one-bonus rule)?
7. Launch path: admin → practice → Ranked (rec.).
8. Transport: new `estimate: StrictInt` field (rec., the `order`/`placement` precedent) vs reusing
   `selected: StrictInt` (no schema change, but `selected` is Mastery's spelling).

## 10. Owner playtest protocol (≈ 30 minutes, desktop + phone)

Use CE1 **unchanged**: in `C:/Users/mlmit/mogzy-wt/ce1-fable`, start `ce1-fe` (vite :5280) and open
`/dev/combat-estimate` (on a phone: the LAN address of the same server). The lab shows no pass
mark, which is what keeps the owner blind.

1. Copy `scripts/combat-estimate/grading/playtest-log.template.csv` **outside the repo**.
2. Play all 12 rounds on desktop, then all 12 on the phone (use "Next"; the lab's `?round=` URL
   gives the id). Do not use a calculator — play as a player would.
3. Per round, *before* reading the reveal's numbers, write: round id, device, the locked estimate
   (the chrome shows it as `{161}`), rough seconds, and a gut call `fair-correct | fair-incorrect |
   unsure` ("would I accept this as knowing the answer?"). After the reveal add a note: was setting
   the value natural; was the premise clear (what was missing?); did the ledger explain the miss;
   was the round satisfying.
4. Grade offline: `npx tsx scripts/combat-estimate/grading/grade_playtest.ts <your log>.csv` —
   prints each policy's verdict per row and its agreement with the gut calls.
5. Decide: the policy with the highest agreement (≥ 80% required) wins, unless the notes say
   the instrument, premise or reveal — not the threshold — caused the disagreement. Too many
   "fair-correct" rows graded incorrect ⇒ too punishing (move to the fallback); "fair-incorrect"
   rows graded correct ⇒ too forgiving (move to strict).

No new production infrastructure: a CSV and an offline script.

## 11. Proposed CE2 backend module contract (`combat_estimate.v1`) — sketch, not implemented

* **generate_segment** — one challenge; a certified premise via the existing
  `mastery.setup_state.combat_scenario` + `combat_calculations.physical_ability_damage.v1`.
  `public_payload`: the board (attacker/ability/target/stated stats), metric, definition,
  assumptions, scale `{max, coarse_step, figure_every}` (server-owned policy, §8.6c),
  certification, and the grading **rule text** (`policy_id`, "within 2.5%, at least ±2") — never T.
  `private_payload`: `exact`, `whole`, `tolerance` (T, frozen), `policy_id`, `combat_working.v1` /
  `raw_damage_working.v1`, provenance.
* **validate_challenge_input** — `{estimate: StrictInt}`, `0 ≤ e ≤ max − 1`; anything else 422.
* **challenge_is_correct** — `abs(e − whole) <= tolerance`, reading only the frozen payload.
* **resolve_segment** — per player: timeout / correct / incorrect via `challenge_is_correct`;
  `points.single_points(...)` with frozen `correct_points` and `strictly_faster`; one
  `ChildOutcome(answer=e)`; reveal = CE1's `EstimateReveal` + `band {lo, hi, tolerance}` +
  `closeness` (educational) + the working block.
* **bot_challenge_input** — with `BOT_ANSWER_ACCURACY` (0.75) a seeded value inside the band,
  otherwise a seeded *modelled misconception* value outside it (falls back to `whole ± (T + 1..3T)`
  when none applies), clamped to the beam. `bot_card_response_seconds`: seeded 8–20 s [judgment].
* **public_view** — `public_payload` only; forbidden pre-reveal keys include `exact`, `whole`,
  `tolerance`, `band`, `raw_damage`, `effective_armor`, `mitigation_multiplier`.
* Flags: `supports_points_scoring = True`; single challenge, so no child-timer/reached semantics.
* Wire: `SegmentChallengeIn.estimate`, `SegmentChoice` widening, registry, admin preset
  `admin.combat_estimate` — per CE1 handoff §15.

## 12. Files added (exact)

* `scripts/combat-estimate/grading/policies.ts` — policies A–E, the instrument's input contract,
  the offline player models and the authority anchor. Imports nothing.
* `scripts/combat-estimate/grading/audit.ts` — the report generator.
* `scripts/combat-estimate/grading/CEG1_AUDIT_TABLES.md` — generated tables (13 sections).
* `scripts/combat-estimate/grading/grade_playtest.ts` — offline grader for the owner's log.
* `scripts/combat-estimate/grading/playtest-log.template.csv` — the log template.
* `scripts/combat-estimate/grading/policies.test.ts` — 20 tests.
* `COMBAT_ESTIMATE_CEG1_HANDOFF.md` — this file.

No existing file changed (CE1's visuals, interaction, grader, fixture and tests are byte-identical
to `7929f2dc`).

## 13. Test results

* `npx vitest run scripts/combat-estimate/grading/ src/lib/combat-estimate/
  src/lib/interaction-grammar/estimate.test.ts src/components/interaction-grammar/EstimateBeam.test.tsx
  src/pages/dev/combat-estimate/labAuthority.test.ts` → **5 files, 95 passed, 0 failed** (CE1's
  75 unchanged + 20 new). The `act(...)` warning printed by `EstimateBeam.test.tsx` is pre-existing
  in CE1.
* ESLint on `scripts/combat-estimate/grading/`: clean. `tsc --strict --noEmit` on `policies.ts` +
  `audit.ts`: clean.
* The 20 new tests pin: the evidence base (12 certified, commit), the model anchor (< 1e-9 on all
  12), ROUND_HALF_UP parity with CE1, the input contract, the hybrid's symmetry / floor / zero /
  containment, T at 73/144/266/486/1000, nesting of wider policies, the relative asymmetry (Zed
  −4/+3), the display cliff (Jarvan 159 reads "10%", fails 10%), smooth score, closest-wins, the
  recommendation's 100%/100% claim, the fallback's exact four leaks, beam containment, the playtest
  grader, and that the committed tables equal a fresh run.

## 14. Final commit

Branch `combat-estimate/ceg1-grading-audit`, one local commit on `7929f2dc`: "CEG1: Combat Estimate
grading and fairness audit (research only)" — see `git log -1`. Not pushed, not merged, not
deployed; CE2 not started.
