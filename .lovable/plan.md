

## Plan: Admin Data Dashboard with CSV Export and Custom Graph Builder

### Overview
Add a CSV export button to the admin panel and a new `/admin/data` page with a custom graph builder. The system queries all existing tables to provide comprehensive statistics including Elo/rank changes (local, global, combined), user sentiment signals, item popularity, and feature engagement.

### Files Modified

**`src/pages/Admin.tsx`** — Add "Export CSV" and "Data" buttons in the header (master admin only), next to "Play Layout".

**`src/App.tsx`** — Add lazy-loaded route `/admin/data` → `AdminData`.

### Files Created

**`src/lib/admin-data-sources.ts`** — Central registry of ~25 data source definitions. Each source is a named async function returning `{ labels: string[], datasets: { label: string, values: number[] }[] }`. Sources include:

1. **User Metrics**: Signups over time (from `profiles.created_at`), active users (from `last_seen_at` — 24h/7d/30d buckets), pro vs free (from `is_pro`), bot count, users by location
2. **Match & Elo Data**:
   - Matches per day (from `matches.created_at`)
   - Matches per league (group by `league_id`, join `leagues.name`)
   - **Global Elo distribution** — query `preset_items.elo` and `league_memberships.elo`, bucket into Bronze/Silver/Gold/Platinum ranges
   - **Global Elo changes over time** — from `global_elo_snapshots` table (already exists), compute delta between snapshots per item/profile
   - **Local vs Global rank divergence** — compare `local_rankings.local_elo` vs `preset_items.elo` (or `league_memberships.elo`) for the same items/profiles, showing how personal rankings differ from consensus
   - **Combined Elo movement** — aggregate net Elo change across all leagues per day from `global_elo_snapshots`
3. **Item Popularity**: Top items by Elo (from `preset_items`), most-matched items (count appearances in `matches` as winner or loser), items with biggest Elo swings (max delta in `global_elo_snapshots`)
4. **User Swiping Sentiment**: Win rate per item/user (from `matches` — wins / total appearances), most "controversial" items (close to 50% win rate = divisive), most dominant items (highest win rate), user engagement per league (from `daily_global_sessions` count)
5. **Feature Engagement**: Theme popularity (from `profiles.custom_theme`), animation popularity (from `profiles.swipe_animation`), animation usage logs (from `animation_usage_logs`), Aura Check accuracy (from `elo_check_games.is_correct`), purchases by type (from `purchases.item_type`), invite link redemptions over time (from `invite_redemptions.created_at`)
6. **Comments & Social**: Comments per league, comment volume over time, reactions distribution (from `comment_reactions.emoji`)
7. **Rank Movement**: Top risers/fallers — items/users with largest positive/negative Elo delta over last 7/30 days from snapshots

**`src/pages/AdminData.tsx`** — The main dashboard page:

- Master admin gate (same pattern as AdminPlay)
- **Summary cards** at top: total users, total matches, avg Elo, active users today
- **Graph Builder UI**:
  - Dropdown: select data source from the registry (grouped by category: Users, Matches, Elo/Rank, Items, Features, Comments)
  - Chart type selector: Line, Bar, Pie, Area (using recharts)
  - Optional filters: date range picker, specific league filter
  - "Add Graph" button creates a new chart card
  - Each card shows the chart title, type selector, and a remove button
  - Graph configs saved to `localStorage` key `admin_graph_configs` so they persist
- **Pre-built section**: 3-4 default graphs always shown (signups over time, matches per day, theme popularity pie, top items bar)
- All data fetched on-demand per graph (not all at once)

**`src/lib/admin-csv-export.ts`** — CSV generation utility:

- Fetches all data sources in parallel
- Builds a multi-section CSV with headers per section
- Uses `Blob` + `URL.createObjectURL` for download
- Sections: Users, Leagues, Items (with Elo + match count + win rate), Matches Summary, Elo Distribution, Theme Usage, Animation Usage, Purchases, Comments, Invite Links, Aura Check Stats

### No Database Changes
All data comes from existing tables. No new tables or migrations needed.

### Key Technical Decisions
- Data sources are pure functions — easy to add more later
- Graph configs in localStorage avoid needing another DB table
- CSV export runs all queries client-side via the admin's authenticated session (RLS allows admins to read all relevant tables)
- Elo/rank data leverages the existing `global_elo_snapshots` table for historical trends and `local_rankings` for personal vs global comparisons

