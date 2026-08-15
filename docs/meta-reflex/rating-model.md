# Meta Reflex community rating — a product/statistical migration

This is not a refactor. The number shown next to a champion on the Meta Reflex
stats board **changes meaning, scale, and behaviour**. Anyone reviewing the
Phase 2B migration should read this first.

---

## What it was

An incremental **Elo** ladder, maintained inside `record_league_swipe_result`:

```sql
v_expected := 1 / (1 + power(10, (loser - winner) / 400.0));
v_change   := greatest(1, round(32 * (1 - v_expected))::integer);
```

Every vote mutated both entities by `±v_change`. Starting value 1000, K-factor
32, minimum step 1, zero-sum within the pair, applied to opinion games only.

## Why it had to change

The owner's requirement is that a user may change their vote and the ranking
adjusts consistently. **The Elo above cannot express that**, for three
independent reasons:

1. **Path dependence.** `v_change` is a function of both ratings *at that
   moment*. Elo is non-commutative — the same set of votes applied in a
   different order gives different ratings. "Remove vote X" is not a
   well-defined operation once any later vote has touched either entity.
2. **Storing the delta does not rescue it.** Even with every vote's delta
   persisted, subtracting one later leaves every *subsequent* vote's delta
   wrong, because those were computed from a rating that already included the
   vote being removed.
3. **The clamp is not invertible.** `greatest(1, ...)` records `+1` where the
   true value rounded to `0`. Nothing in the stored state distinguishes a
   clamped update from a genuine one, so it cannot be undone exactly.

Layered on top: with no unique constraint, a single account could vote the same
pair without limit, each repeat re-applying a full K=32 step. The ladder was
therefore inflatable by one determined user.

## What it is now

```sql
rating = round(2000.0 * (win_count + 1) / (vote_count + 2))
```

A **Laplace-smoothed win rate**, mapped onto 0–2000.

- `win_count` — times this entity was the *preferred* side.
- `vote_count` — times this entity *appeared* in a matchup someone voted on.

Both are derived from `league_swipe_preferences`, which holds one row per
(matchup, voter) and is *updated* on a revote rather than appended to.

### Properties

| Property | Elo (before) | Derived (now) |
|---|---|---|
| Order-independent | No | **Yes** |
| Revote representable | No | **Yes** — adjust two counters, recompute |
| Recomputable from durable state | No | **Yes** — `league_swipe_recompute_ratings()` |
| Inflatable by repeat voting | Yes | No — one preference per voter per pair |
| Range | Unbounded, drifts from 1000 | Bounded 0–2000 |
| No-data value | 1000 | 1000 (unchanged) |

### Reference points

| win / votes | rating | reading |
|---|---|---|
| 0 / 0 | 1000 | never voted on — neutral |
| 1 / 1 | 1333 | one win, barely evidence |
| 10 / 10 | 1833 | strong and well-sampled |
| 50 / 100 | 1000 | genuinely divisive |
| 0 / 10 | 167 | strongly disliked |
| 0 / 1 | 667 | one loss, barely evidence |

## How ranking order is derived

`order by rating desc` — unchanged, and `fetchTopRatings` needs no edit
(`api.ts:275`). Ordering by this rating is equivalent to ordering by smoothed
win rate.

**Ties are possible and expected** now that the value is a bounded ratio (1/2
and 5/10 both yield 1000), where Elo produced near-unique values. The current
board does not specify a tiebreak, so ordering within a tie is arbitrary. If
that matters visually, break ties by `vote_count desc` — better-sampled entity
first.

## Low-sample entities

Smoothing (`+1` win, `+2` votes) is what stops a 1-vote champion from topping
the board: at 1 win from 1 vote it scores 1333, while a 10-from-10 champion
scores 1833. It is a **soft** guard, not a threshold — a 3/3 champion (1600)
still outranks a 40/60 champion (1290), which may or may not be what you want
on a leaderboard.

If low-sample entries prove distracting in playtest, the honest fix is a
**display filter** (`where vote_count >= N`), not more smoothing — smoothing
distorts every entity to suppress a few. This is a product call and is
deliberately not baked into the migration.

## UI terminology

**No user-visible string says "Elo"** — verified across `LeagueSwipeStats.tsx`,
`LeagueSwipeGame.tsx`, `LeaguePublicProfile.tsx` and `api.ts`. The board renders
a bare number under a "rating" heading, so **no rename is required**.

Two real UI consequences, neither of which is a code error:

1. **The board starts empty.** Not "numbers shift" — the ratings table is
   truncated by `20260813120000`, so the leaderboard has no rows until people
   vote. `LeagueSwipeStats.tsx` already handles the empty case (it renders an
   early-data notice), so nothing breaks; it will simply look bare during the
   first playtest session. That is the correct state for a fresh system, not a
   defect to paper over.
2. **The `+N rating` badge stops appearing.** `LeagueSwipeGame.tsx:372` renders
   it only when `ratingChange != null`, and the v2 RPC always returns null —
   because there is no longer a per-vote delta to report; the rating is
   recomputed, not incremented. The badge silently disappears rather than
   breaking.

   Recommended replacement, **not implemented here** because it is a product
   decision: show the entity's new standing (`"Ahri — 1450"`) or its community
   share, instead of a delta. Say the word and it is a small change.

## There is no historical migration

The owner has confirmed all existing Meta Reflex play data is test data, so
`20260813120000` truncates `league_swipe_results`, `league_swipe_matchups` and
`league_swipe_entity_ratings` before anything else runs.

That removes every hard question this section used to wrestle with:

- **No `legacy_elo_rating` column.** Nothing to preserve, and keeping it would
  only invite comparing two numbers that are not comparable.
- **No preference seeding.** There is no history to infer intent from, so
  nothing asserts on a user's behalf what they still believe.
- **No "the board resets to neutral" problem.** The board legitimately starts
  empty, which is the honest state for a fresh system.

The four **category definitions** in `league_swipe_games` are explicitly
preserved — they are product configuration the app routes against, not play
data.

## What a reviewer should expect to see on day one

- `league_swipe_entity_ratings` empty. It fills as votes arrive.
- Every entity's first rating is derived, never seeded: an entity with one win
  from one vote shows **1333**, not 1032 as Elo would have.
- Ties in the leaderboard are normal (1/2 and 5/10 both give 1000). Break by
  `vote_count desc` if the ordering looks arbitrary in practice.
- The `+N rating` badge never appears, because `ratingChange` is always null —
  there is no per-vote delta in a derived model. See the UI section above for
  the recommended replacement.
