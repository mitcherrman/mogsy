# POINT1 — Scoring Architecture Migration (DAMAGE/HP → POINTS)

**Status:** Daily migrated onto the canonical RP1 score path. Ranked was already done by RP1.
**Base:** `origin/main` @ `ec9c8bbd`
**Repos:** frontend `/Users/macmoney/mogsy`, backend `/Users/macmoney/League_Combat_Simulator`

---

## 0. Product decisions (owner)

1. All ACTIVE Mogzy question scoring counts UP in points.
2. Active question modes do not use HP depletion or knockout as their scoring model.
3. Active scoring uses no combat modifiers — no shields, mitigation, absorbed
   damage, outgoing bonus, or incoming reduction.
4. That machinery is PRESERVED as legacy / future-capability infrastructure.
   Nothing is deleted.
5. Completion is mode-driven: the configured sequence completes; higher point
   total wins; equal totals draw.
6. `ranked_modules/` stays scoring-model agnostic.
7. **Stat Check is OUT OF SCOPE.**
8. Legitimate League question content about champion damage/HP is NOT part of
   this migration.

---

## 1. What was already true before this workstream touched anything

**RP1 had already built the whole points architecture, backend and frontend.**
Two earlier POINT1 attempts wasted effort rediscovering and then duplicating it.

### Backend (shipped, `origin/master`)

`ranked_points_v2` is `format_for_creation` rung 2 — the default for every
normal authenticated account, no allowlist, rating-eligible: ten modules,
points, highest score wins. Owner-verified in production.

| Published | Where |
|---|---|
| `scoring` = `{model, match_length, modules_completed, module_number}` | public/private payload |
| `players[].score` — cumulative, counts UP | public/private player entry |
| `points_awarded` / `score_before` / `score_after` | every settlement player entry |
| `module_points` — base/bonus split, reconciled against the engine | resolved payload |
| `scoring.final_scores` | result payload |

In a v2 match **HP is never written** (`duel_match_engine`:
`new_hp[pid] = state.hp`, `reached_zero_hp` permanently False), and the score
banks `base_damage_dealt` — the module's award **before** class modifiers — so
a shield cannot confiscate points the module already decided were earned.

### Frontend (shipped, `origin/main`)

| Commit | What |
|---|---|
| `b40aaef3` | feat(rp1): the Ranked arena reads a score, not a health bar (Step 3) |
| `3c087a0d` | feat(rp1): what the score did, and why (Step 4) |

The canonical idiom, and the one every future mode must use:

* **`CombatantView.score?: number \| null`** — non-null means this match scores
  points. `CombatantPanel` asks once
  (`const scored = combatant.score !== null && combatant.score !== undefined`),
  sets `data-scoring="points"`, and from that one answer draws `ScoreTally`
  instead of `HealthMeter`, states awards in the ledger, and states points in
  the verdict row.
* **`ScoreTally` is A NUMBER, NOT A BAR.** A proportion needs a maximum that
  means something, and a score has none you play toward. There is no
  max-score field and there must not be one.
* **`RoundHistoryEntry.pointsAwarded?: number \| null`** — present ⇒ the row
  states the award and says nothing about damage or HP.
* **`ArenaRail.feedback?: PointsFeedbackView`** — wins over `damageDealt` in
  the verdict row; carries the base/bonus split (`pointsFeedback.ts`).

---

## 2. Abandoned local commits — DO NOT RESURRECT

Both were built in the shared checkout `/Users/macmoney/mogsy` against a `main`
that was 68 commits behind. Neither was pushed.

| Commit | Verdict |
|---|---|
| `27cdb83c` *"add points-native arena contract for Daily"* | **SUPERSEDED.** Solved a real problem, but invented `CombatantMeterView` / `PointsMeterView` / `HealthMeterView` — a competing abstraction over the `score` field RP1 had already shipped. Replaced by the change described in §3. |
| `420be5e7` *"read the RP1 points contract in the Ranked arena"* | **ABANDONED DUPLICATE.** Reimplemented `b40aaef3`. Upstream's version ships more (`pointsFeedback.ts`, `RankedScoreline.tsx`, points-aware `MatchOverFrame`) and occupies the same file paths. Never push, rebase or cherry-pick it. |

### Root cause, recorded so it does not happen a third time

Both phases were designed after searching a **stale local checkout** — the
frontend `main` 68 commits behind, and the backend sitting on
`live1/phase4b1-match-context`, which predates RP1 entirely. The reconcile that
would have caught it was run at the END of the phase, before pushing.

**Rule: `git fetch` and diff `origin/main` / `origin/master` BEFORE designing a
phase.** In the backend repo, search with `git show origin/master:<path>` and
`git grep origin/master` — never the working tree.

---

## 3. THIS CHANGE — Daily onto the canonical score path

The Daily was the last active question mode still disguising points as combat
data. Upstream's panel keys its points vocabulary off `combatant.score`; the
Daily never set it, so every points branch RP1 shipped stayed switched off.

### Mappings removed

| Was | Now |
|---|---|
| `dailyArenaView.ts` `hp: run.score` | `score: run.score` (RP1's field) |
| `dailyArenaView.ts` `maxHp: run.maxScore > 0 ? … : null` | *(gone — the tally publishes no maximum)* |
| `dailyArenaView.ts` `damageDealt: verdict.awarded` | `feedback: { baseLabel: "CORRECT", basePoints, speed: null, … }` |
| `dailyChallengeViews.ts` `dealt: card.awardedScore` | `pointsAwarded: card.awardedScore` |
| `dailyChallengeViews.ts` `hpBefore`/`hpAfter: running` | *(gone — zeroed; the score lives on the tally)* |

`meterLabel: "Score"` is **kept** — RP1 states it is exactly the field a mode
uses to supply its own noun over the tally.

### Existing upstream fields reused — no new shared type was needed

`CombatantView.score`, `CombatantView.meterLabel`,
`RoundHistoryEntry.pointsAwarded`, `ArenaRail.feedback` /
`PointsFeedbackView`. **Nothing was added to any shared type**, and no file
outside `src/pages/quiz-daily-challenge/` was modified.

### Visible behaviour

| | Before | After |
|---|---|---|
| Meter | proportional bar, health palette | `ScoreTally` — the number, labelled "Score", no fill |
| Fresh run (score 0) | **RED** bar (`pct <= 25` ⇒ `bg-destructive`) | plain `0` — no destructive/amber treatment exists |
| Verdict row | **`100 DMG`** | `+100` on RP1's points chip |
| Ledger row | `+100` with sr-only *"dealt 100 … HP 100."* | `+100` with sr-only *"Module 1: Correct, 100 points."* |
| Ledger heading | "Recent rounds" | "Recent modules" |
| Column | `data-scoring` absent | `data-scoring="points"` |

The tone inversion is not merely repainted, it is **structurally impossible**:
`ScoreTally` draws no fill, so there is no palette to get backwards.

### Untouched, deliberately

`RoundResultBeat` / `SegmentResultBeat` — the Daily sets `roundBeat: null` and
`segmentBeat: null`, so neither renders for it. Both are already points-aware
from RP1 for Ranked. Meta Reflex's per-card redesign is a separate task.

---

## 4. What remains for POINT1

POINT1 is no longer an architecture project. The architecture exists; what is
left is bringing the remaining surfaces onto it.

* **Meta Reflex per-card presentation** — **SHIPPED. See §5.**
* **Ranked tutorial** (`src/pages/dev/ranked-tutorial/`) still teaches the
  legacy model — "Correct answers deal damage", "Zero HP ends the match". It is
  now the only active surface teaching a model normal Ranked no longer uses.
  Content decision, deliberately out of scope here.
* **Backend cleanup, non-blocking:** retire the damage-shaped fields from the
  v2 wire once no client reads them (`damage{}`, `hp_before`/`hp_after`,
  `reached_zero_hp` are meaningless in a points match); rename
  `SegmentResolution.damage` and `base_damage_dealt` to awards —
  `points_view.py` already flags this as an internal compatibility detail
  awaiting cleanup. `starting_hp` / `class_hp_json` / `participants.max_hp`
  stay readable: v1 matches replay through them.
* **Still out of scope:** Stat Check (separate flag-off HP card-battler), and
  every legitimate League question about champion damage or HP.


---

## 5. Meta Reflex per-card reveal — SHIPPED

### Why presentation-only was impossible

`ranked_public.segment_flow.card_schedule` chained `available = settled`: card
N+1's window opened **the instant card N was accepted**. The reveal for card N
and the advance to card N+1 therefore arrived on the same snapshot, so there
was no instant at which a settled card and its own answer were on screen
together. That is why the resolution used to be a strip laid BESIDE live play
(`MetaReflexCardResult`), and why the correct answer could never be marked
where the player had just been looking.

Holding the card client-side was not an option either: a Meta Reflex card timer
is 6.0s, so the standard 1500ms Ranked beat would have silently spent **25% of
the next card's answering window** (the same hold costs a 30s Ranked round 5%).

### The authoritative reveal scheduling design

The backend already had a per-question reveal mechanism, built for Mastery
Slice — a frozen-per-segment `reveal_window_ms` plus
`reveal_compensation_seconds` — but it only reached **block-clocked** segments.
This extends the same idea, in the same vocabulary, to **per-card** ones.

```
answer window   started_at ────────────► deadline
settlement                               settled_at
reveal                                   settled_at ──► settled_at + window
next card                                              started_at
```

`card_schedule(..., reveal_window_ms=...)` now chains
`available = settled + reveal` for an answered card, `deadline + reveal` for a
timed-out or still-live one. Every other property falls out of that one change:

* **each card keeps its full timer** — the offset lands in the NEXT card's
  `started_at`, never in this card's span;
* **the block clock self-corrects** — `apply_card_deadline` assigns it from
  `projected_terminal_at`, which walks the same chain, so it now leaves room
  for `5 × 6.0s + 4 × 1.5s`;
* **the bot needs no special case** — `service` already applied a generic
  `reveal_offset * idx` to bot stamps from `sf.reveal_window_ms(row)`.

New: `CardSlot.pending_at(now)` (has this card opened?) and
`CardSchedule.revealing_slot(now)` (which settled card is being shown). The
submit path refuses a card that has not opened with `RANKED_CARD_NOT_OPEN`
(409), gated on the schedule rather than on the request.

### The frozen `reveal_window_ms` contract

`meta_reflex.CARD_REVEAL_WINDOW_MS = 1500`, written into the generated public
payload under `meta_reflex.PAYLOAD_REVEAL_WINDOW_MS` (`"reveal_window_ms"`, the
same key `mastery_slice` uses). It is **read back off the frozen payload**, so:

* a block opened before this existed keeps its original timing, deadlines and
  duration arithmetic forever — live, on reconnect and on replay;
* changing the constant cannot reach a match already in flight;
* the number is never taken from a frontend constant.

### Speed / finish-time semantics — UNCHANGED, deliberately

`item_cost_duel.block_duration_ms` is `total_response_ms`, the **sum of
per-card durations**, and `CardSlot.duration_ms` is `settled_at - started_at`.
Because the reveal is added to the next card's start and not to this card's
span, every per-card duration is byte-identical to what it would have been
without reveals, and so is their sum.

**Answer completion decides speed; reveal is presentation time.** Pinned by
`test_block_duration_is_identical_with_and_without_reveals`. `block_damage` was
not touched: +1 a correct card, +1 perfect, +1 speed (perfect-only).

### Frontend result treatment

* **Removed:** `src/components/ranked-arena/MetaReflexCardResult.tsx` and its
  test — the below-card strip, gone completely.
* **Top notification:** `CardResultBeat` in `metaReflexModule.tsx`, rendering
  the arena's own **`BeatPlate`** (imported from `RoundResultBeat`), so a card
  result and a round result cannot drift into two visual languages. It sits at
  the top of the module's viewport rather than in the arena header, because the
  header has ONE result slot and the module-level `SegmentResultBeat` owns it.
* **Correct-answer state:** `ChoiceCard` gained `reveal={"correct"|"wrong"}` —
  `border-emerald-400 bg-emerald-500/15 ring-2 ring-emerald-400/40` for the
  side the server named in `correctCardId`, green **whether or not the player
  picked it**, plus a spoken `"…, correct answer"` so it is never colour alone.
  The border was already 2px in every state, so a reveal cannot reflow the row.
* **+1 / +0 is a PROJECTION, documented as such.** The backend publishes no
  per-card award; Meta Reflex pays exactly one point per correct card
  (`block_damage` = `correct_count`), so the card states that rule applied to
  the server's own verdict. It is not a second scorer, and there is no opponent
  clause — a Meta Reflex card is not zero-sum, so "OPPONENT +1 POINT" would
  invent a transfer the rules do not contain.
* **Module end unchanged:** card five is held, revealed, until the module
  summary replaces it; `SegmentResultBeat` still owns the scoreline and the
  perfect/first bonus.

### Tests

**Backend** — `test_meta_reflex_card_reveal.py`, 22 tests: next card not
available until the reveal ends; full timer after a reveal; four inter-card
windows; timeout settles at its deadline, is followed by the same window, and
gains no extra answering time; pending/revealing phase; reconnect determinism;
`None`/`0` window reproduces the old chaining exactly; frozen payload beats the
constant; durations exclude the reveal; block duration identical with and
without; `block_damage` unchanged.

**Frontend** — `metaReflexModule.reveal.test.tsx`, 16 tests: settled card held;
CORRECT/+1 POINT; INCORRECT/+0 POINTS with no OPPONENT wording; green driven by
`correctCardId` not by the selection; timed-out card still green; no strip; next
card withheld during the reveal and live after it; remount reconstructs the same
phase; all five cards reveal; no `+2`/PERFECT/BONUS on any card; final card held
for the summary.

### SHAs

* backend `origin/master` — see the commit named in the report
* frontend `origin/main` — see the commit named in the report
