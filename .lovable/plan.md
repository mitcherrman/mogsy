

# Set Up Default AdSense In-Swipe Ad Cards

## Problem
The swipe ad system currently requires custom creatives to show in-swipe ad cards. When `ad_source` is set to `"adsense"` but no custom creatives exist, the code falls back to a popup overlay instead of rendering an AdSense unit inline as a swipeable card. Additionally, the database has no AdSense client ID or slot configured.

## Changes

### 1. Update database config (data update via insert tool)
Set the swipe placement to use AdSense as the default source with a frequency of 10:
- `adsense_client_id`: `"ca-pub-9823769047605421"`
- Swipe placement: `ad_mode: "in_swipe"`, `ad_source: "adsense"`, `frequency: 10`

### 2. Fix `src/components/AdBanner.tsx`
Replace the placeholder fallback `ca-pub-XXXXXXXXXXXXXXXX` with `ca-pub-9823769047605421`.

### 3. Fix `src/pages/Swipe.tsx` — AdSense in-swipe card path
Lines 297-313: When `shouldShowAd` returns `"in_swipe"` and `adSource` is `"adsense"` or `"hybrid"`, show the in-swipe ad card even without a custom creative. Currently the code does:
```
const creative = getRandomCreative();
if (creative) { setShowInSwipeAd(creative); } else { setShowAd(true); }
```
Change to: when `adSource !== "custom"`, set a flag to show an AdSense in-swipe card (use a sentinel/boolean state like `showAdsenseInSwipe`) instead of requiring a creative object. This applies to both gauntlet and normal mode blocks.

Add a new state: `showAdsenseInSwipe` (boolean). When true, render the `SwipeAdCard` with only `adsenseSlot`/`adsenseClientId` and no creative.

Update the render section (~line 518) to also trigger on `showAdsenseInSwipe`, rendering `SwipeAdCard` with adsense props and no creative.

### 4. Add preconnect hint in `index.html`
Add `<link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin>` for faster ad loading.

## Summary of Flow After Changes
Every 10 swipes (configurable in Admin → Gaming → Ads), one of the two cards is replaced with a Google AdSense unit. The user sees a countdown, then can skip or interact with the ad. Pro users are exempt.

