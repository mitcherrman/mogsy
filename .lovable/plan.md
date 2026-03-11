

# Title Image for Preset Items

## Overview
Add a `title_image_url` column to `preset_items`. Admins can upload/paste a title image per item via Admin Play. In the swipe game, if a title image exists, it replaces the text name and is rendered as an image that overflows/bleeds upward into the card photo area.

## Database
- Add `title_image_url text` (nullable) to `preset_items`

## Admin UI (`AdminPlayLeagueItems.tsx`)
In the item images detail view (when `selectedItem` is set), add a new "Title Image" section above the existing "Add Image" section:
- Show current title image thumbnail if set, with a remove button
- Input field to paste a URL + "Add" button
- Upload button (reuse existing upload pattern to `profile-photos` bucket under `preset-items/{id}/title-{timestamp}.{ext}`)
- When set, save to `preset_items.title_image_url`

## Swipe Game Display (`SwipePreset.tsx`)
Where item name is rendered (both mobile and desktop stats areas), check for `title_image_url`:
- If present, render an `<img>` instead of the `<h3>` text
- The image container uses `overflow-visible` and negative top margin (e.g. `-mt-3`) so it bleeds upward into the card photo area
- Image is sized to fit the stats bar width with `max-h-10` (mobile) / `max-h-14` (desktop), `object-contain`, and `w-auto`
- The parent stats container gets `overflow-visible` and `relative z-30` so the title image renders on top of the card

## Swipe.tsx (user leagues)
No changes needed — user leagues don't have preset items with title images.

## AnimationCardStats.tsx
Accept optional `titleImageUrl` prop. If present in compact mode, show `<img>` instead of the name text with the same overflow treatment.

## Files changed
| File | Changes |
|------|---------|
| DB migration | `ALTER TABLE preset_items ADD COLUMN title_image_url text` |
| `AdminPlayLeagueItems.tsx` | Title image upload/URL section in item detail view |
| `SwipePreset.tsx` | Render title image instead of name, with overflow bleed |
| `AnimationCardStats.tsx` | Optional `titleImageUrl` prop |

