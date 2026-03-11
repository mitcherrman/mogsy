

# Fix Title Image Bleed in Swipe Cards

## Problem
The outer card div correctly toggles `overflow-visible` when a title image exists, but the inner `motion.button` element always has `overflow-hidden`, which clips the title image and prevents it from bleeding over the card edges.

## Fix
In `SwipePreset.tsx`, make the `motion.button`'s overflow class conditional on whether a title image exists — same pattern already used on the outer div.

There are **three instances** of this pattern in the file:
1. **Line 909** — mobile card rendering inside the `pair.map()` loop
2. **Line 1191** — the `cardContent` variable used for desktop rendering  
3. **Line 798** — the first/top card in the initial pair display

Each `motion.button` with `className="relative overflow-hidden ..."` needs to become `overflow-visible` when the item has a `title_image_url`.

### Change
```tsx
// Before:
className={`relative overflow-hidden cursor-pointer ...`}

// After:
className={`relative ${item.title_image_url ? 'overflow-visible' : 'overflow-hidden'} cursor-pointer ...`}
```

| File | Change |
|------|--------|
| `SwipePreset.tsx` | Toggle overflow on motion.button at ~3 locations |

