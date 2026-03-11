

# Fix Title Image Defaults & Max Width

## Problem
Currently the default `offsetY` is `-12` (mobile) / `-16` (desktop), meaning title images bleed upward by default. The user wants the default to match exactly where the text name sits — no offset — and adjustments should be relative to that. Also, the max horizontal size should be capped at 75% of the card width.

## Changes

### 1. `SwipePreset.tsx` — `getTitleImageStyle`
- Change default `offsetY` from `(isMobile ? -12 : -16)` to `0`
- Add `maxWidth: '75%'` to the returned style object so title images never exceed 75% of card width

### 2. `AnimationCardStats.tsx` — `getTitleImgStyle`
- Same change: default `offsetY` from `(compact ? -12 : -16)` to `0`
- Add `maxWidth: '75%'`

### 3. `AdminPlayLeagueItems.tsx` — Preview & defaults
- Update the preview `<img>` to also include `maxWidth: '75%'`
- Change the default init for `tiOffsetY` from `selectedItem.title_image_offset_y ?? 0` (already 0, no change needed)
- Ensure the slider label/range makes sense for offset relative to the default text position

### Files changed
| File | Changes |
|------|---------|
| `SwipePreset.tsx` | Default offsetY → 0, add maxWidth 75% |
| `AnimationCardStats.tsx` | Same |
| `AdminPlayLeagueItems.tsx` | Add maxWidth 75% to preview img |

