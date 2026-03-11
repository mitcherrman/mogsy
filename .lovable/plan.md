

# Title Image Bleed Over Card Edges

## What
Make title images overflow and visually bleed over the card's borders (left, bottom, right), appearing on top of everything — exactly like the admin preview already does naturally with CSS overflow.

## Current State
The card container already sets `overflow-visible` when a title image exists, and the stats bar div also has `overflow-visible`. The title image positioning with negative offsets and scale should already cause visual bleed. The issue is likely that:
1. The title image `<img>` needs a higher z-index to render **on top of** the card border/theme overlay
2. The `position: relative` with a high z-index on the title image will make it visually stack above surrounding elements

## Changes

### `SwipePreset.tsx` — Title image `<img>` styling
Add `position: 'relative'` and `zIndex: 30` to the `getTitleImageStyle` helper so the title image renders above the card border, theme overlay, and adjacent elements. This single change applies to both mobile and desktop, and to all title image instances since they all use this helper.

```tsx
// In getTitleImageStyle, add to returned style:
position: 'relative',
zIndex: 30,
```

### `AnimationCardStats.tsx` — Same for animation overlays
Add the same `position: 'relative'` and `zIndex: 30` to `getTitleImgStyle` so title images bleed during animations too.

### Files
| File | Change |
|------|--------|
| `SwipePreset.tsx` | Add position/zIndex to `getTitleImageStyle` |
| `AnimationCardStats.tsx` | Add position/zIndex to `getTitleImgStyle` |

