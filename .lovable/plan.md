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

## Swipe Media System Upgrade (Implemented)

### What Changed

1. **`processed_media` table** — New database table tracking GIF/video assets with fields for original_url, mp4_url, webm_url, thumbnail_url, media_type, dimensions, and duration. RLS: admin-managed, publicly readable.

2. **`src/components/AutoVideo.tsx`** — Reusable component that renders `<video autoPlay loop muted playsInline>` for video URLs (mp4/webm) or `<img>` for images. Includes IntersectionObserver-based play/pause for offscreen performance.

3. **`src/components/SwipeDirectionOverlay.tsx`** — Drag direction indicator showing "👑 MOG" or "👎 PASS" overlay during card swipes, with opacity proportional to drag distance.

4. **`src/pages/SwipePreset.tsx`** — 
   - **Prebuffering**: Preloads next 3 matchup pairs (images/videos) into browser cache
   - **GPU drag**: Cards use `translate3d` + `rotate` transforms via Framer Motion `useMotionValue`/`useTransform`
   - **Velocity prediction**: Swipes complete at lower offset when velocity > 500px/s
   - **Direction overlays**: MOG/PASS overlay appears during drag
   - **`will-change: transform`** on card containers

5. **`src/pages/Swipe.tsx`** — Avatar prebuffering for next 6 profiles

6. **GIF → Video migration** — Decorative GIFs replaced with `<video>` tags with webm/mp4 sources + GIF fallback:
   - `SgtDoakesAnimation.tsx` — sgt-doakes.gif → video
   - `AmongUsAnimation.tsx` — amongus-backstab.gif → video
   - `ThemeOverlay.tsx` — amongus-crewmate.gif → video
   - `SecretRoom.tsx` — twerking-amongus.gif → video

7. **`AdminPlayLeagueItems.tsx`** — GIF uploads detected and logged to `processed_media` table for future conversion pipeline

### Video Files Needed
Place MP4/WebM versions in `public/images/`:
- `sgt-doakes.mp4` / `sgt-doakes.webm`
- `amongus-backstab.mp4` / `amongus-backstab.webm`
- `amongus-crewmate.mp4` / `amongus-crewmate.webm`
- `twerking-amongus.mp4` / `twerking-amongus.webm`

Convert using: `ffmpeg -i input.gif -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" output.mp4`
