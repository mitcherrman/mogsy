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
