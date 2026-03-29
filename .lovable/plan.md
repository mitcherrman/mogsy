

# Separate Mobile & Desktop Image Configurations in Preview Editor

## Problem
The preview editor has a Desktop/Mobile toggle, but both modes share the same image positioning values (focal_x, focal_y, zoom, pad_top, pad_left) and title image values (scale, offset_y, offset_x, max_height). Adjusting one mode changes the other.

## Solution
Add mobile-specific columns to both `preset_item_images` and `preset_items` tables. The existing columns become the "desktop" values. New `mobile_*` columns store the mobile overrides. When `mobile_*` values are null, the game falls back to desktop values.

## Database Migration

**`preset_item_images`** — add 5 columns:
- `mobile_focal_x` (real, nullable)
- `mobile_focal_y` (real, nullable)
- `mobile_zoom` (real, nullable)
- `mobile_pad_top` (real, nullable)
- `mobile_pad_left` (real, nullable)

**`preset_items`** — add 4 columns:
- `mobile_title_image_scale` (real, nullable)
- `mobile_title_image_offset_y` (real, nullable)
- `mobile_title_image_offset_x` (real, nullable)
- `mobile_title_image_max_height` (real, nullable)

Null = "use desktop value" (no duplication needed if they want the same look).

## File Changes

### 1. `src/components/admin/CardPreviewEditor.tsx`
- Maintain two sets of state: desktop (`focalX`, `focalY`, etc.) and mobile (`mobileFocalX`, `mobileFocalY`, etc.)
- When toggling mode, switch which state the sliders read/write
- On load, initialize mobile state from `mobile_*` DB columns (falling back to desktop values if null)
- `onSaveImage` callback expanded to pass both desktop and mobile values
- `onSaveTitleImage` callback expanded similarly
- Add a "Copy from Desktop" / "Copy from Mobile" button to quickly sync one mode to the other

### 2. `src/components/admin/AdminPlayLeagueItems.tsx`
- Update the save handler to write both desktop and mobile columns when saving image position
- Update title image save to write both sets of columns

### 3. `src/pages/SwipePreset.tsx`
- Update `getImageStyle()` to check `isMobile` — if mobile and `mobile_focal_x` is not null, use `mobile_*` columns; otherwise fall back to desktop columns
- Update `getTitleImageStyle()` calls similarly — use `mobile_title_image_*` columns on mobile/tablet, desktop columns on desktop
- iPad uses mobile config (the `isMobile` check already covers portrait orientation / touch devices)

### 4. `src/components/CardStatsFooter.tsx`
No changes needed — stats config is separate from image positioning.

## Technical Notes
- Existing items with no mobile overrides will behave exactly as before (null falls back to desktop)
- The preview editor's mode toggle now controls which set of values you're editing, with independent undo/reset per mode
- iPads use the mobile configuration since `isMobile` in the app is based on viewport/touch detection which includes tablets

