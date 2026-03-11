

# Title Image Size & Position Editor

## Overview
Add adjustable size, position, and stretch controls for title images so admins can fine-tune how they appear on cards. Includes a live card preview that mirrors the actual swipe game layout.

## Database
Add three columns to `preset_items`:
- `title_image_scale` (real, default 1.0) — scale multiplier
- `title_image_offset_y` (smallint, default 0) — vertical offset in px (negative = bleeds more into image)
- `title_image_max_height` (smallint, default 0) — override max-height in px (0 = use default)

## Admin UI (`AdminPlayLeagueItems.tsx`)
When a title image exists, add an "Adjust" button next to the Remove button. Clicking it opens an inline editor (similar pattern to `ImagePositionEditor`) with:
- **Live card preview**: A mock card (aspect-[5/4] image area + stats bar) showing the title image rendered exactly as it would appear in-game, with the item's actual photo behind it
- **Scale slider** (0.5x–3x): Controls the title image size
- **Vertical offset slider** (-30 to +10): Controls how much the title image bleeds upward into the card photo
- **Max height override** (0–80px): Hard cap on title image height (0 = auto)
- Save/Cancel buttons

## Swipe Game Rendering (`SwipePreset.tsx`)
Update all title image `<img>` tags to use the stored values:
- Apply `transform: scale(titleImageScale)` 
- Apply `margin-top: {offsetY}px` instead of the hardcoded `-mt-3`/`-mt-4`
- Apply `max-height: {maxHeight}px` if maxHeight > 0, else use current defaults

## AnimationCardStats.tsx
Pass through the new props and apply the same styling logic.

## Files changed
| File | Changes |
|------|---------|
| DB migration | Add 3 columns to `preset_items` |
| `AdminPlayLeagueItems.tsx` | Title image adjust editor with live card preview, sliders for scale/offset/maxHeight |
| `SwipePreset.tsx` | Use stored scale, offset, maxHeight values when rendering title images |
| `AnimationCardStats.tsx` | Accept and apply new title image sizing props |

