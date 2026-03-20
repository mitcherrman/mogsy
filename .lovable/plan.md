

# Fix: Mobile Action Bar Hidden Behind Cards in Swiping Game

## Problem
On mobile, the game buttons (backpack, card animation, screenshot, leaderboard) are not visible. The root cause is layout overflow: the outer container has `h-[calc(100dvh-7.5rem)] overflow-hidden`, but the `MatchupCapture` component grows unconstrained to fit its card content, pushing the action bar below the viewport cutoff where it gets clipped by `overflow-hidden`.

## Solution
Constrain the `MatchupCapture` wrapper so it shrinks to fit available space, and ensure the mobile action bar never gets clipped.

## Changes in `src/pages/SwipePreset.tsx`

1. **Add `flex-shrink-0` to the mobile action bar** (line 1065) so it always reserves its space in the flex column.

2. **Add `min-h-0 overflow-hidden` to MatchupCapture wrappers** on mobile — the two `<MatchupCapture>` usages (lines ~819 and ~867) need to be wrapped in or given `min-h-0 flex-1` so they shrink within the flex container instead of overflowing.

3. **Ensure the inner flex container** (line 741, the `container` div) has `overflow-hidden` and `min-h-0` so the flex layout properly constrains children.

This is a CSS-only fix — no structural or functional changes needed.

