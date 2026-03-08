

# Dual Elo: Local Rankings + Throttled Global Updates

## Summary
Each swipe instantly updates a **local (per-user) Elo** for items in a league. The **global Elo** (on `preset_items.elo` / `league_memberships.elo`) is only affected by a user's **first session of the day** (or first session per refresh cycle). The UI shows exact Elo change for local rankings and a simple +/− indicator for global. Global Elo values displayed in the app refresh visually on 1-hour intervals (cached/snapshotted).

## Database Changes

### New table: `local_rankings`
Stores each user's personal Elo per item (preset) or per profile (user leagues).

```sql
CREATE TABLE public.local_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  league_id uuid NOT NULL,
  item_id uuid,           -- for preset leagues
  target_profile_id uuid, -- for user-compete leagues
  local_elo integer NOT NULL DEFAULT 1200,
  matches_played integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, league_id, item_id),
  UNIQUE (profile_id, league_id, target_profile_id)
);
ALTER TABLE public.local_rankings ENABLE ROW LEVEL SECURITY;
-- Users can read/write own local rankings
CREATE POLICY "Users can view own local rankings" ON public.local_rankings FOR SELECT USING (is_profile_owner(profile_id));
CREATE POLICY "Users can insert own local rankings" ON public.local_rankings FOR INSERT WITH CHECK (is_profile_owner(profile_id));
CREATE POLICY "Users can update own local rankings" ON public.local_rankings FOR UPDATE USING (is_profile_owner(profile_id));
-- Admins full access
CREATE POLICY "Admins can manage local rankings" ON public.local_rankings FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
```

### New table: `daily_global_sessions`
Tracks whether a user has already contributed to global Elo today for a given league.

```sql
CREATE TABLE public.daily_global_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  league_id uuid NOT NULL,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, league_id, session_date)
);
ALTER TABLE public.daily_global_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own sessions" ON public.daily_global_sessions FOR ALL USING (is_profile_owner(profile_id)) WITH CHECK (is_profile_owner(profile_id));
```

### New RPC: `record_dual_preset_match`
Replaces direct calls to `record_preset_match`. Logic:
1. Always update `local_rankings` (upsert local Elo for both items for the calling user).
2. Check `daily_global_sessions` — if no row exists for today + this league + this user, insert one and ALSO update global `preset_items.elo` via existing Elo formula + insert into `matches`. Otherwise skip global update but return a +/− direction hint.
3. Return `{ localWinnerElo, localLoserElo, localWinnerChange, localLoserChange, globalDirection: 'up'|'down'|'none' }`.

Similarly, a `record_dual_user_match` for user-compete leagues (modifies `record_user_match`).

### New table: `global_elo_snapshots`
Hourly cached snapshot of global Elo values, used for display purposes.

```sql
CREATE TABLE public.global_elo_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL,
  item_id uuid,
  profile_id uuid,
  elo integer NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);
-- Publicly readable, only system (SECURITY DEFINER functions) writes
ALTER TABLE public.global_elo_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Snapshots are publicly readable" ON public.global_elo_snapshots FOR SELECT USING (true);
```

A scheduled edge function (pg_cron, every hour) snapshots current global Elo values into this table. The leaderboard and swipe UI read from snapshots for display, while the actual global Elo still lives on `preset_items.elo` / `league_memberships.elo`.

## Frontend Changes

### `SwipePreset.tsx` — Dual Elo flow
- On mount, fetch user's `local_rankings` for this league to display local Elo on cards.
- On swipe, call new `record_dual_preset_match` RPC.
- Show **exact local Elo change** (e.g., "+18") via `EloChangeIndicator`.
- Show a **subtle global indicator** (arrow up/down or "none") separately — a small secondary badge.
- Track `countsTowardGlobal` boolean in state (from first RPC response); show a small badge like "Contributing to Global" or "Local only today".

### `Swipe.tsx` — Same pattern for user-compete
- Call `record_dual_user_match` instead of `record_user_match`.
- Same dual indicator UI.

### `EloChangeIndicator.tsx` — Add global direction prop
- New optional prop `globalDirection?: 'up' | 'down' | 'none'`.
- When present, render a small secondary icon (globe + arrow) next to the local change.

### `Leaderboard.tsx` — Read from snapshots
- For display Elo, read from `global_elo_snapshots` (latest per item/profile).
- Show "Last updated X min ago" timestamp.
- Actual ranking order still uses snapshot data so it only visually shifts hourly.

### New: "Your Rankings" tab on Leaderboard
- Query `local_rankings` for the current user + league.
- Show personal Elo ranking of all items the user has swiped on.

## Edge Function: `snapshot-global-elo`
- Runs every hour via pg_cron.
- Reads all `preset_items` and `league_memberships`, inserts snapshot rows.
- Cleans up snapshots older than 24 hours.

## Files to Create/Modify
- **Migration SQL**: `local_rankings`, `daily_global_sessions`, `global_elo_snapshots` tables + `record_dual_preset_match` + `record_dual_user_match` RPCs
- **Edge function**: `supabase/functions/snapshot-global-elo/index.ts`
- **pg_cron job**: Hourly call to snapshot function
- `src/pages/SwipePreset.tsx` — dual Elo flow
- `src/pages/Swipe.tsx` — dual Elo flow
- `src/components/EloChangeIndicator.tsx` — global direction indicator
- `src/pages/Leaderboard.tsx` — snapshot-based display + "Your Rankings" tab

