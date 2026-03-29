

# Updated Plan: Add Guide Lines + Title Position Presets to Preview Editor

## Addition to Existing Plan

On top of the visual guide lines (already planned), add **title image position presets** — quick-apply buttons that snap the title image to ideal positions matching the reference screenshots.

## Title Position Presets

Add a row of preset buttons in `CardPreviewEditor.tsx` near the title image sliders:

| Preset | Scale | Offset Y | Offset X | Max Height | Description |
|--------|-------|----------|----------|------------|-------------|
| **Centered Above Footer** | 1.0 | 0 | 0 | 120 | Title centered in the gap between image and footer |
| **Large Bleed** | 2.5 | -80 | 0 | 200 | Title bleeds over the card image, prominent display (matches the uploaded screenshots) |
| **Compact Bottom** | 0.8 | 10 | 0 | 80 | Small title tucked just above the stats |
| **Left Aligned** | 1.2 | -20 | -60 | 150 | Title shifted left for stylistic offset |

These presets apply to whichever mode is active (desktop or mobile), so you can set desktop to "Large Bleed" and mobile to "Compact Bottom" independently.

## Changes in `src/components/admin/CardPreviewEditor.tsx`

1. **Add `showGuides` state** (default true) with a small toggle button near the mode switcher.

2. **Guide overlay** — a `pointer-events-none absolute inset-0` div inside the preview card containing:
   - Horizontal dashed cyan line at the image/footer boundary
   - Dotted orange rectangle showing the title image's computed bounding box (moves live with sliders)
   - Faint vertical lines at 12.5% and 87.5% width (75% max-width constraint)
   - Tiny `text-[8px]` labels on each guide

3. **Preset buttons** — a row of small buttons ("Centered", "Large Bleed", "Compact", "Left") in the title image controls section. Clicking one sets the active mode's title image values (scale, offsetY, offsetX, maxHeight) to the preset values. The preview updates immediately.

## No Other File Changes
This is entirely within `CardPreviewEditor.tsx`. No database changes, no game rendering changes.

