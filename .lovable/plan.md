
# Pre-Populate Leaderboards for All League Types

## Problem
Currently, the leaderboard page only queries `league_memberships` (user profiles). For preset leagues (restaurants, movies, etc.), rankings live in the `preset_items` table instead, so their leaderboard shows empty. Additionally, user profile leagues don't auto-populate entries until someone has been swiped on.

## Solution
Make the `Leaderboard.tsx` page detect the league type and show the correct data:

### 1. Update `Leaderboard.tsx` to handle both league types

- Fetch the league record including its `type` field (not just `name`)
- **If `type === "preset"`**: Query `preset_items` for that league, sorted by ELO descending. Display item name, image, and ELO -- no profile/avatar lookup needed.
- **If `type !== "preset"` (user league)**: Keep current logic querying `league_memberships` + `profiles`, but also fall back to showing all profiles in the system with default ELO 1200 if no memberships exist yet.

### 2. Preset league leaderboard display

Each preset item entry will show:
- Rank number (with crown for #1)
- Item image (from `image_url`) or fallback initial
- Item name
- Current ELO score and tier badge

### 3. User league leaderboard

For the "Quick Swipe" / Global Rankings league:
- Query all profiles with non-empty display names
- Cross-reference with `league_memberships` to get their ELO (default 1200 if no membership yet)
- Sort by ELO descending

This means every profile shows up in the leaderboard from the start, not only after being swiped on.

## Technical Details

**File changed:** `src/pages/Leaderboard.tsx`

- Add a `leagueType` state variable
- Fetch league with `select("name, type")` instead of just `select("name")`
- Branch loading logic based on type:
  - Preset: `supabase.from("preset_items").select("*").eq("league_id", leagueId).order("elo", { ascending: false })`
  - User: current `league_memberships` + `profiles` query, enhanced to include all profiles with a default ELO
- Update the `LeaderboardEntry` interface to accommodate both types (add optional `imageUrl` for preset items)
- Render preset items with their image and name; render user entries with avatar and display name as before
