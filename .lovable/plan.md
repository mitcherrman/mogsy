## Plan: Leaderboard Hub with Top-5 League Previews

### Summary

Redesign `/leagues` into a leaderboard hub that shows respective leagues for collections and compete users in a 2-column grid for mobile and then fit to screen for desktop and ipad, each displaying its top 5 entries as circles (top 3 bigger). Add a "Leaderboard" button (with Globe icon) only when the user is inside Collections or Compete on the Play page, linking to this hub.

### Changes

**1. `src/pages/Play.tsx**`

- Move the Leaderboard button so it only appears when `expanded` is set (i.e., user is inside Collections or Compete), not at top-level
- Change navigation target from `/leaderboard/${globalLeague.id}` to `/leagues`
- Replace `Trophy` with `Globe` icon to indicate "global"
- Remove the conditional logic that searches for "Global Rankings" league

**2. `src/pages/Leagues.tsx` — Full redesign**

- Rename header to "Leaderboard"
- Fetch top 5 entries per league:
  - For preset leagues: top 5 `preset_items` by elo (with image_url, name)
  - For user leagues: top 5 profiles by elo from `global_elo_snapshots` or `league_memberships` (with avatar, name)
- Layout: 2-column grid (`grid grid-cols-2 gap-4`) on mobile, responsive `grid-cols-3` or `grid-cols-4` on tablet/desktop to fit screen
- Each league card shows:
  - League name as header
  - Top 5 entries as circles stacked vertically, with rank number, name, and aura score
  - Top 3 circles are ~48px, ranks 4-5 are ~36px
  - Circle shows avatar/image with object-cover
- Sections: "Compete" (user leagues) and "Collections" (preset leagues) with section headers
- Clicking a league card navigates to `/leaderboard/:leagueId`
- On desktop/iPad: use enough columns so content fits without scrolling when possible
- On mobile: 2 columns, scroll down for more

**3. Data fetching approach**

- Fetch all leagues, then for each league fetch its top 5 in parallel
- For preset leagues: query `preset_items` ordered by elo desc, limit 5 per league
- For user leagues: query `global_elo_snapshots` or `league_memberships` for top 5 profiles, join with `public_profiles` for display info