

# Remove Help Text + Lock Scroll on Mobile Swipe Pages

## Problem
1. "Tap or swipe to choose" text wastes vertical space on mobile
2. `pb-16` from Layout's `<main>` (for bottom navbar) creates empty scrollable space below the game
3. The swipe container uses `h-[calc(100dvh-4rem)]` but the Layout wrapper adds extra bottom padding

## Changes

### 1. Remove help text on mobile
**`SwipePreset.tsx`** (line ~1081) and **`Swipe.tsx`** (line ~676): Wrap the help text `<p>` in `{!isMobile && ...}` so it only shows on desktop.

### 2. Lock scroll on mobile swipe pages
**`SwipePreset.tsx`** and **`Swipe.tsx`**: Add a `useEffect` that sets `document.body.style.overflow = 'hidden'` on mount (mobile only) and restores it on unmount. This prevents any scrolling past the game area regardless of Layout padding.

### 3. Account for Layout's bottom padding
**`SwipePreset.tsx`** (line ~670) and **`Swipe.tsx`** (line ~406): Change the mobile height from `h-[calc(100dvh-4rem)]` to `h-[calc(100dvh-4rem-4rem)]` (subtract the navbar top `pt-14` ≈ 3.5rem + bottom `pb-16` = 4rem) so the game fits exactly within the visible area. Combined with the scroll lock, there will be zero scrollable overflow.

## Files changed
| File | Changes |
|------|---------|
| `src/pages/SwipePreset.tsx` | Hide help text on mobile, add scroll lock effect, adjust height calc |
| `src/pages/Swipe.tsx` | Same changes |

