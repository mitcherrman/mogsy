

# Preview Editor: Unified Card Editor in Admin Play

## Problem
Currently, image positioning (focal point, zoom, padding) and title image adjustments (scale, offset, max-height) are in separate sections of the admin item detail view. The "Card Preview" dialog uses hardcoded aspect ratios (`5:4` and `3:4`) that don't perfectly match the actual swiping game's responsive layout, which uses CSS classes like `portrait:aspect-[5/4] landscape:aspect-[3/4] md:aspect-[3/4]` with additional dynamic sizing from `flex-1 min-h-0`.

## What Changes

### 1. Create a unified "Preview Editor" component
Replace the separate "Image Position Editor" and "Title Image Adjust" sections with a single `CardPreviewEditor` component that:
- Shows the card exactly as it appears in the swiping game (same aspect ratios, same blurred background layer, same stats footer structure)
- Has a **Desktop** / **Mobile** toggle to switch between the two layouts
- Includes all controls in one place: image focal point, zoom, padding, title image scale/offset/max-height, and title image upload/URL input

### 2. Match exact game card dimensions
- **Mobile preview**: `aspect-[5/4]` image area + condensed single-line footer (name left, elo/rank right)
- **Desktop preview**: `aspect-[3/4]` image area + centered name + elo/rank footer + elo change indicator placeholder
- Both include the blurred background layer at configurable opacity (read `card_bg_opacity` from app_settings)
- Title image rendering uses the identical `getTitleImageStyle()` function from `SwipePreset.tsx`

### 3. Unified controls panel
Below the preview card, a collapsible controls section with two groups:
- **Image Controls**: Focal X, Focal Y, Zoom, Border Top, Border Left (same as current `ImagePositionEditor`)  
- **Title Image Controls**: Scale, Vertical Offset (with nudge buttons), Horizontal Offset (with nudge buttons), Max Height (same as current title image adjust section)
- Image selector strip at the top to pick which image to edit
- Title image URL/upload input integrated

### 4. Integration into AdminPlayLeagueItems
- Remove the separate `ImagePositionEditor` sub-view (lines 428-446) and the separate title image adjust editor (lines 486-607)
- The "Card Preview" button and the "Position & Zoom" (Move icon) button on each image both open the new unified Preview Editor
- The Preview Editor replaces the current item detail view when active (same pattern as current positioning sub-view)

## Files to Modify

1. **`src/components/admin/CardPreviewEditor.tsx`** (new) — The unified preview editor component
2. **`src/components/admin/AdminPlayLeagueItems.tsx`** — Remove separate image position and title image editor sections; wire up the new unified editor
3. **`src/components/admin/ImagePositionEditor.tsx`** — Can be deleted (absorbed into CardPreviewEditor)

## Technical Details

The preview card in the editor will use the exact same CSS structure as `SwipePreset.tsx`:

```text
┌─────────────────────────────┐
│ [Desktop] [Mobile]  toggle  │
├─────────────────────────────┤
│  ┌───────────────────────┐  │
│  │ blurred bg layer      │  │
│  │ ┌───────────────────┐ │  │
│  │ │ main image        │ │  │
│  │ │ (object-contain)  │ │  │
│  │ └───────────────────┘ │  │
│  │ aspect-[3/4] or [5/4] │  │
│  ├───────────────────────┤  │
│  │ title image or name   │  │
│  │ elo • rank            │  │
│  └───────────────────────┘  │
├─────────────────────────────┤
│ Image selector strip        │
├─────────────────────────────┤
│ ▸ Image Controls            │
│   Focal X/Y, Zoom, Padding  │
│ ▸ Title Image Controls      │
│   Scale, Offsets, Max Height │
│   [Upload] [URL input]      │
├─────────────────────────────┤
│ [Cancel]  [Save All]        │
└─────────────────────────────┘
```

Key rendering rules copied from `SwipePreset.tsx`:
- Image style: `getImageStyle()` — applies focal_x, focal_y, zoom, pad_top, pad_left as absolute positioning
- Background: blurred copy with `object-cover scale-110 blur-xl` at `cardBgOpacity/100` opacity
- Title image: `getTitleImageStyle()` — applies scale, marginTop, marginLeft (+50 baseline), maxHeight, maxWidth 75%
- Desktop footer: centered name, elo below, elo change indicator placeholder
- Mobile footer: name left, elo/rank right in single row

