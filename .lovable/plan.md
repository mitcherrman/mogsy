

## Problem

After the slice animation completes, there's a visible "blink" where the old cards reappear briefly before the new cards load. This happens because of **two competing transition systems**:

1. **SliceBattleAnimation** — opaque overlay that covers cards during the tear animation (700ms)
2. **AnimatePresence mode="wait"** — wraps the card pair with a 250ms fade-out exit, then 250ms fade-in enter

When `executeChoice` runs, it batches: new pair state + `setSliceWinner(null)`. React removes the overlay and sees the AnimatePresence key change in the same render. With `mode="wait"`, the OLD pair plays its exit animation (250ms fade-out) before the new pair enters — that exit is the "blink" showing the same cards again momentarily.

Additionally, in `Swipe.tsx`, the underlying cards have redundant `animate` props that scale/fade based on `sliceWinner` — but those are invisible under the opaque overlay.

## Plan

### 1. SwipePreset.tsx — Remove AnimatePresence exit delay (standard mode)

Replace `<AnimatePresence mode="wait">` with just rendering the `motion.div` directly (no AnimatePresence). Keep the `key` for remounting and the `initial/animate` for a quick fade-in of new cards — but eliminate the exit animation entirely. The slice overlay already provides the visual transition.

**Lines ~556-561**: Remove `<AnimatePresence mode="wait">` opening tag
**Line ~661**: Remove closing `</AnimatePresence>`

### 2. Swipe.tsx — Same fix for user profile cards

Replace `<AnimatePresence mode="wait">` (line 331) with no wrapper. Remove closing tag (line 388). Keep `motion.div` with key, initial, animate — but no exit.

Also remove the redundant `animate` props on the left/right card `motion.div`s (lines 341-350 and 364-372) that scale/fade based on `sliceWinner` — these are invisible under the overlay and only cause a flash when the overlay is removed.

### 3. Both files — Clear `eloChanges` timing

In `SwipePreset.tsx`, `eloChanges` is set then immediately cleared in `executeChoice` (lines 252-277), meaning the indicators never display. This is a separate existing issue but not causing the blink — noting for awareness.

### Summary of changes

| File | Change |
|------|--------|
| `SwipePreset.tsx` | Remove `AnimatePresence mode="wait"` wrapper around standard-mode cards |
| `Swipe.tsx` | Remove `AnimatePresence mode="wait"` wrapper; remove redundant `sliceWinner`-based animate props on card wrappers |

