

# Add "Convert All GIFs" Button to Admin Play

## Summary
Add a button in the league items list view that scans all `preset_item_images` for `.gif` URLs, converts each to WebM client-side using the existing `gifToWebm()` utility, uploads the WebM versions, records them in `processed_media`, and then updates the `preset_item_images` rows to point to the WebM URL directly — so the swipe game never serves GIFs again.

## Changes

### Edit `src/components/admin/AdminPlayLeagueItems.tsx`

1. **Add state**: `convertingAll` boolean, `convertProgress` string (e.g. "3/12")

2. **Add `handleConvertAllGifs` function**:
   - Query all `preset_item_images` for this league's items where `image_url ILIKE '%.gif%'`
   - For each GIF image:
     - Fetch the GIF as a `File` blob
     - Call `gifToWebm(file)` 
     - Upload the WebM blob to storage at `preset-items/{item_id}/{timestamp}.webm`
     - Upload the thumbnail
     - Upsert into `processed_media` (original_url, webm_url, thumbnail_url)
     - **Update `preset_item_images.image_url`** to the WebM URL (so the GIF reference is fully replaced)
     - If this was the item's `preset_items.image_url`, update that too
   - Update progress toast after each conversion
   - Call `loadItems()` to refresh

3. **Add button in the items list view** (between "Add Item" and the items list, around line 836):
   - "Convert All GIFs" button with a film/refresh icon
   - Disabled while `convertingAll` is true
   - Shows progress like "Converting 3/12..."

## Technical Details

- Fetching remote GIFs: use `fetch(url)` then `new File([blob], 'image.gif', { type: 'image/gif' })`
- The existing `gifToWebm()` handles browser capability check and returns null on unsupported browsers
- After conversion, `preset_item_images.image_url` is updated to the WebM URL, so SwipePreset renders `<video>` via `AutoVideo` without needing the `processed_media` lookup
- Also update `preset_items.image_url` if it pointed to the old GIF URL

## Files
| File | Action |
|------|--------|
| `src/components/admin/AdminPlayLeagueItems.tsx` | Edit — add convert all button + handler |

