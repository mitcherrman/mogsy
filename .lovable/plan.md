

## Problem Analysis

The root cause is that the `SliceBattleAnimation` only overlays the **loser half** of the screen, leaving the actual cards underneath partially visible. The winner card also gets a motion overlay that causes visual glitching (jumping up/down). Meanwhile, the actual card elements in `SwipePreset.tsx` try to hide themselves with `opacity-0` classes, but there are timing gaps between state changes that cause brief flashes.

The `AnimatePresence mode="sync"` change from the last edit also made things worse by allowing old and new pairs to render simultaneously.

## Plan

### 1. Revert recent broken changes in `SwipePreset.tsx`
- Change `AnimatePresence mode="sync" initial={false}` back to `mode="wait"`
- Change transition duration back to `0.25`

### 2. Redesign `SliceBattleAnimation` to be a full-screen opaque overlay

Instead of only overlaying parts of the screen, the animation will render **both cards as opaque replicas** covering the entire matchup area. This way, the actual cards underneath are completely irrelevant during the animation.

**New approach:**
- Accept both winner and loser image URLs + names
- Render a **full opaque overlay** with both card images side by side (matching the layout)
- The winner side stays static (no scale/lift animation — this removes the glitch)
- The loser side gets the tear animation
- When animation completes, the overlay disappears and the next pair is already loaded underneath

This means:
- No need for `opacity-0` hacks on the actual cards
- No timing-sensitive state synchronization
- The overlay is self-contained and covers everything

### 3. Update `SwipePreset.tsx` card rendering
- Remove the `sliceWinner !== null ? "opacity-0"` hack from the loser card class
- Remove the winner overlay section from `SliceBattleAnimation` (no more scale/lift on winner)
- Pass both card images to `SliceBattleAnimation` instead of just the loser
- In `handleSliceComplete`: execute the pending action first (loads next pair), then clear `sliceWinner` — the overlay hides everything during the transition

### 4. Updated `SliceBattleAnimation` props
```text
Old:  winnerSide, loserImageUrl, loserName, onComplete
New:  winnerSide, items (array of {imageUrl, name} for both cards), onComplete
```

The component renders a full opaque `div` with `bg-background` covering `absolute inset-0`, containing both card images laid out identically to the real cards. The winner side is static, the loser side gets the jagged tear. On completion, the entire overlay unmounts.

### Files to modify
- `src/components/SliceBattleAnimation.tsx` — Accept both card images, render full opaque overlay with both sides, remove winner scale animation
- `src/pages/SwipePreset.tsx` — Revert AnimatePresence changes, remove opacity-0 hack, pass both card data to SliceBattleAnimation

