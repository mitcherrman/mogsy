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

* **Meta Reflex per-card presentation** — the next product task. The block's
  scoreline is already points-native from RP1; the five internal rounds are not
  yet on the top result notification.
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
