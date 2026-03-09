

# Multiplayer 2v2 Game Modes — Implementation Plan

## Overview
Implement all 5 multiplayer game ideas from the plan as a new "Multiplayer" section on the Play page, plus a dedicated admin panel tab for configuration. All modes use the existing friendship system for team formation and Supabase Realtime for live gameplay.

---

## Database Schema (single migration)

### New Tables

**`multiplayer_games`** — Core game session table
- `id` uuid PK
- `mode` text (tag_team | draft_duel | prediction_wars | siege | hot_streak)
- `status` text (waiting | picking | active | finished)
- `league_id` uuid (which league the game is played in)
- `league_type` text (preset | user)
- `config` jsonb (mode-specific settings like round count, tower size, etc.)
- `result` jsonb (winner_team, scores, etc.)
- `created_at`, `updated_at`, `started_at`, `finished_at`

**`multiplayer_teams`** — Teams within a game (always 2 per game)
- `id` uuid PK
- `game_id` uuid FK → multiplayer_games
- `team_index` int (0 or 1)
- `score` int default 0

**`multiplayer_players`** — Players assigned to teams
- `id` uuid PK
- `team_id` uuid FK → multiplayer_teams
- `game_id` uuid FK → multiplayer_games
- `profile_id` uuid
- `is_ready` boolean default false
- `is_host` boolean default false

**`multiplayer_rounds`** — Individual rounds/turns within a game
- `id` uuid PK
- `game_id` uuid FK → multiplayer_games
- `round_number` int
- `state` jsonb (items selected, votes, predictions, streak counts — varies by mode)
- `winner_team_id` uuid nullable
- `created_at`

**`multiplayer_actions`** — Player actions (picks, votes, attacks, predictions)
- `id` uuid PK
- `game_id` uuid FK → multiplayer_games
- `round_id` uuid FK → multiplayer_rounds
- `player_id` uuid FK → multiplayer_players
- `action_type` text (pick, vote, attack, predict, submit)
- `payload` jsonb (item_id, target, prediction value, etc.)
- `created_at`

**`multiplayer_settings`** — Admin configuration per mode
- `mode` text PK
- `is_enabled` boolean default true
- `config` jsonb (max_rounds, timer_seconds, etc.)
- `updated_at`

All tables get RLS enabled. Enable Realtime on `multiplayer_games`, `multiplayer_teams`, `multiplayer_players`, `multiplayer_rounds`, `multiplayer_actions`.

### RLS Policies
- Players can read games they're part of
- Players can insert actions for their own player_id
- Admins can read/manage all
- multiplayer_settings publicly readable, admin-writable

### Security Definer Functions
- `create_multiplayer_game(mode, league_id, league_type, host_profile_id, partner_profile_id, config)` — creates game + team 1 with 2 players
- `join_multiplayer_game(game_id, profile_id, partner_profile_id)` — creates team 2, sets status to picking/active
- `submit_multiplayer_action(game_id, round_id, player_id, action_type, payload)` — validates and inserts action, checks if round is complete, advances game state
- `resolve_multiplayer_round(game_id, round_id)` — determines round winner based on Elo/votes, updates scores

---

## Game Mode Logic (per mode)

### 1. Tag Team Battles
- Each duo submits 1 item/profile each → 2v2 matchup
- Community votes determine winner pair
- Uses existing Elo from league_memberships or preset_items
- Win probability calculated from combined team Elo

### 2. Draft & Duel
- Shared pool of items from selected league
- Alternating picks (snake draft: A1, B1, B2, A2...)
- Best-of series: each pick faces opponent's pick, Elo-based probability resolves
- Team with more round wins takes the game

### 3. Prediction Wars
- Both teams shown same upcoming matchup pairs from a league
- Each team predicts the winner
- Real outcome resolved by Elo probability
- Team with more correct predictions wins

### 4. Siege Mode
- Each team selects 3 "tower" items from a league
- Attacking team chooses which of their items faces which defender
- Elo-based resolution per battle
- First to destroy all 3 opponent towers wins

### 5. Hot Streak Relay
- Player A starts swiping against random items
- Win = streak continues, Loss = partner tags in
- Combined longest streak across both players wins
- Time-limited (60s per team)

---

## Frontend Architecture

### New Pages
- **`src/pages/Multiplayer.tsx`** — Hub page showing all 5 modes, friend invite flow
- **`src/pages/MultiplayerGame.tsx`** — Active game view (renders mode-specific component)

### New Components (in `src/components/multiplayer/`)
- **`MultiplayerLobby.tsx`** — Friend selection, game creation, waiting room with Realtime
- **`MultiplayerModeCard.tsx`** — Mode selection card with icon, description, player count
- **`TagTeamGame.tsx`** — Tag Team gameplay UI
- **`DraftDuelGame.tsx`** — Draft phase + duel resolution UI
- **`PredictionWarsGame.tsx`** — Prediction cards with timer
- **`SiegeGame.tsx`** — Tower layout, attack selection, battle animation
- **`HotStreakGame.tsx`** — Relay swipe interface with streak counter
- **`GameResults.tsx`** — End-of-game scoreboard with Elo changes

### New Hook
- **`src/hooks/useMultiplayerGame.ts`** — Realtime subscription to game state, action dispatch, turn management

### Play Page Integration
- Add a "Multiplayer" top-level bubble alongside Collections, Compete, and Aura Check
- Clicking it navigates to `/multiplayer`

### Routes (in App.tsx)
- `/multiplayer` → Multiplayer hub
- `/multiplayer/game/:gameId` → Active game

---

## Admin Panel Tab

### `src/components/admin/AdminMultiplayer.tsx`
- Toggle each mode on/off
- Per-mode config: round count, timer duration, pool size, etc.
- View active games count and recent game history
- Quick stats: games played per mode, avg duration

### Admin.tsx Changes
- Add "Multiplayer" tab to `allTabs` array (masterOnly: false)
- Import and render AdminMultiplayer

---

## Realtime Flow

```text
1. Host creates game → row in multiplayer_games (status: waiting)
2. Host invites friend → partner joins team 1 via Realtime
3. Opponent pair joins → team 2 created (status: picking/active)
4. Each player subscribes to game channel
5. Actions (picks/votes/attacks) inserted → Realtime broadcasts
6. Server function resolves rounds → state updates broadcast
7. Game finishes → results written, Elo updated
```

---

## File Summary

| Action | File |
|--------|------|
| Migration | New tables + RLS + functions + realtime |
| New page | `src/pages/Multiplayer.tsx` |
| New page | `src/pages/MultiplayerGame.tsx` |
| New component | `src/components/multiplayer/MultiplayerLobby.tsx` |
| New component | `src/components/multiplayer/MultiplayerModeCard.tsx` |
| New component | `src/components/multiplayer/TagTeamGame.tsx` |
| New component | `src/components/multiplayer/DraftDuelGame.tsx` |
| New component | `src/components/multiplayer/PredictionWarsGame.tsx` |
| New component | `src/components/multiplayer/SiegeGame.tsx` |
| New component | `src/components/multiplayer/HotStreakGame.tsx` |
| New component | `src/components/multiplayer/GameResults.tsx` |
| New hook | `src/hooks/useMultiplayerGame.ts` |
| New admin | `src/components/admin/AdminMultiplayer.tsx` |
| Edit | `src/App.tsx` — add routes |
| Edit | `src/pages/Play.tsx` — add Multiplayer bubble |
| Edit | `src/pages/Admin.tsx` — add Multiplayer tab |
| Edit | `.lovable/plan.md` — document feature |

