

## Plan: Leaderboard Hub — Side-by-Side League Panels

### What You Want
The `/leagues` page should look like the individual leaderboard pages (`/leaderboard/:id`) — large circles with rank, name, tier badge, and aura score — but with all leagues displayed side by side in a 2-column scrollable grid on mobile, fitting to screen on desktop/iPad.

### Changes

**`src/pages/Leagues.tsx`** — Redesign `LeagueCard` to match Leaderboard style

- Each league card becomes a mini version of the individual leaderboard page:
  - League name as header
  - Top 5 entries shown vertically with circle avatars, rank number, name, `TierBadge`, and aura score
  - Top 3 entries get larger circles (`w-16 h-16`) vs ranks 4-5 (`w-12 h-12`)
  - Rank 1 shows `Crown` icon instead of number (matching individual leaderboard)
  - Each entry row mirrors the `renderEntries` layout from `Leaderboard.tsx`
- Import `TierBadge`, `getTierFromElo`, `getTierColor` from existing utils
- Keep existing data fetching logic (already fetches top 5 per league)
- Extend the interface to include `tier` on each entry
- Grid: `grid-cols-2` on mobile, `md:grid-cols-3 lg:grid-cols-4` on desktop
- Clicking a card navigates to `/leaderboard/:id` (unchanged)

No changes to `Play.tsx` or data fetching — purely a visual redesign of the card component.

