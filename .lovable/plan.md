

# Rebase Horizontal Offset to Current "50" Position

## Problem
The ideal default horizontal position for title images corresponds to `offset_x = 50` in the current system. The user wants this to be the new zero point, with the slider moving left/right relative to it.

## Approach
Shift the baseline so the rendering formula becomes `marginLeft = (storedValue + 50)px`. The admin slider stays at -50 to +50 with 0 as center, but the rendered result maps 0 → 50px of margin.

## Changes

### 1. Database migration
Shift all existing `title_image_offset_x` values down by 50 so items currently at 50 become 0:
```sql
UPDATE public.preset_items SET title_image_offset_x = title_image_offset_x - 50 WHERE title_image_offset_x != 0;
```

### 2. `SwipePreset.tsx` — `getTitleImageStyle`
Change offset calculation: `marginLeft = (offsetX + 50)px`, always applied (since baseline is 50px).

### 3. `AnimationCardStats.tsx` — `getTitleImgStyle`
Same formula: `marginLeft = (offsetX + 50)px`.

### 4. `AdminPlayLeagueItems.tsx` — Preview `<img>` style
Same formula in the preview and the non-adjusting display: `marginLeft: (value + 50)px`.

| File | Change |
|------|--------|
| DB migration | Shift existing offset_x values by -50 |
| `SwipePreset.tsx` | `marginLeft = (offsetX + 50)px` |
| `AnimationCardStats.tsx` | Same |
| `AdminPlayLeagueItems.tsx` | Same in preview styles |

