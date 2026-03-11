## Percentile-Based Rank System (Implemented)

### Tier Distribution (Compete Leagues Only)
- **Unranked**: Bottom 60% (0–60th percentile)
- **Bronze 🥉**: 60th–75th percentile
- **Silver 🥈**: 75th–90th percentile
- **Gold 🥇**: 90th–99th percentile
- **Diamond 💎**: Top 1% (99th–100th percentile)

### What Changed
1. **`src/lib/mock-data.ts`** — Added `getTierFromPercentile()`, `getTierRowBg()`, `getTierIcon()`, `TierConfig` type, `DEFAULT_TIER_CONFIG`. Renamed platinum → diamond throughout. Added "unranked" support.
2. **`src/pages/Leaderboard.tsx`** — User leagues now use percentile-based tiers. Rows are highlighted with tier-colored left borders and subtle backgrounds. Tier section headers with icons separate rank groups.
3. **`src/pages/UserProfile.tsx`** — Hero section now shows a large prominent medal tag for the user's best compete league tier (diamond/gold/silver/bronze). Percentile-based computation.
4. **`src/components/admin/AdminRankSettings.tsx`** — New master admin panel for managing rank system: enable/disable toggle, editable percentile thresholds per tier, visual preview bar.
5. **`src/pages/Admin.tsx`** — Added "Ranks" tab (master_admin only) linking to AdminRankSettings.
6. **`tailwind.config.ts`** — Added `tier.diamond` color token.
7. **`app_settings.rank_tiers`** — Database row stores enabled flag + tier config array.

### Collections (Preset) Leagues
Still use absolute Elo-based tiers (unchanged).

## Condensed Mobile Swipe Layout + UI Tweaks (Implemented)

### Changes Made

1. **"Who Mogs?" between cards** — On mobile, replaced the "VS" badge between cards with "Who Mogs?" text. Title removed from top controls bar on mobile.

2. **Floating back button** — On mobile, back button is now a floating absolute element in the top-left corner (outside the card game area), not in the controls bar.

3. **Match count toggle** — Added `show_match_count` setting to `app_settings`. Admin toggle under new "Swipe UI" section. Swords icon + count hidden when disabled.

4. **Progress bar toggle** — Added `show_swipe_progress` setting to `app_settings`. Admin toggle under "Swipe UI" section. Progress bar hidden when disabled.

5. **Mobile spacing condensed** — Controls bar collapsed on mobile (contents relocated/hidden). Outer container uses `py-0 pb-4`. Card gap reduced to `gap-0.5`. Card stats padding reduced to `py-1`. Action bar buttons shrunk to `h-7 w-7`. Help text margin reduced to `mt-0.5`.

6. **MatchupCapture** — Accepts `isMobile` prop. Mobile: `p-1.5`, `mb-1` header, `h-4` logo, `mt-1 pt-1` footer.

### Files Changed
- `src/pages/SwipePreset.tsx`
- `src/pages/Swipe.tsx`
- `src/components/MatchupCapture.tsx`
- `src/components/admin/AdminSettings.tsx`
- Database: `show_match_count` and `show_swipe_progress` in `app_settings`
