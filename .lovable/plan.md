

# Standardize Aura/Rank + Admin Card Stats Preview Editor

## Overview
Two connected changes: (1) unify the aura/rank display on cards to a fixed bottom position on both mobile and desktop, and (2) create a new admin "Card Stats Preview" on the initial Admin Play screen for customizing the stats display appearance, position, and visibility — all stored in `app_settings` and consumed by the swiping game.

## Database Change

Add a new `app_settings` row with key `card_stats_config` storing a JSON value:

```json
{
  "position": "bottom-center",
  "show_aura": true,
  "show_rank": true,
  "show_global": true,
  "show_elo_change": true,
  "aura_label": "Aura",
  "rank_label": "#",
  "font_size": "xs",
  "font_weight": "semibold",
  "color_scheme": "default",
  "use_default_layout": true
}
```

No migration needed — this is an `app_settings` upsert at runtime.

## New Component: `AdminCardStatsPreview.tsx`

A standalone preview editor on the Admin Play main screen (not inside the image editor) that:

1. **Shows a 1:1 card preview** (reuses the same rendering logic as `CardPreviewEditor` and `SwipePreset`) with desktop/mobile toggle, showing a sample item card with the stats footer.

2. **Stats customization controls**:
   - **Position**: dropdown — `bottom-center` (default), `bottom-left`, `bottom-right`, `below-name`, `overlay-bottom`
   - **Visibility toggles**: show/hide aura, rank, global stats, elo change indicator
   - **Labels**: editable text for "Aura" label and rank prefix
   - **Typography**: font size (8px–16px slider), font weight (normal/semibold/bold), color scheme (default/muted/accent/custom)
   - **"Use Default" toggle**: one-click to apply the recommended layout (bottom-center, all visible, default styling)

3. **Live preview** updates as controls change. Save button upserts to `app_settings` key `card_stats_config`.

4. **Linked to both previews**: The `CardPreviewEditor` (image adjustment) will read and render the same `card_stats_config` so the stats look identical there.

## Changes to `SwipePreset.tsx`

### Unify mobile/desktop footer
Replace the `isMobile ? ... : ...` branching (lines 945-1023 and 1271-1340) with a single footer component that:

- Always renders name row on top, stats row below it (centered), elo change below that
- Reads `card_stats_config` from `app_settings` to determine positioning, visibility, labels, font size, etc.
- Falls back to current defaults if no config exists
- Responsive padding: `px-1.5 py-0.5` mobile, `px-2 py-1.5` desktop
- Both mobile and desktop now show elo change indicator (currently mobile-only omits it)

### Consume config
Add a `useEffect` to load `card_stats_config` from `app_settings` (or extend `useAppSettings` hook). Apply the config's position/visibility/styling to the stats row.

## Changes to `CardPreviewEditor.tsx`

- Load `card_stats_config` from `app_settings`
- Render the stats footer in the preview card using the same config, so the image preview and stats preview are visually in sync
- No new controls here — stats editing happens in the dedicated `AdminCardStatsPreview`

## Changes to `AdminPlay.tsx`

- Add a "Card Stats" section/button on the main Admin Play screen (near the top, alongside existing stats)
- Opens `AdminCardStatsPreview` inline or as an expandable panel
- Shows current config state with a "Customize" button

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/admin/AdminCardStatsPreview.tsx` | **Create** — stats preview editor |
| `src/pages/AdminPlay.tsx` | **Modify** — add Card Stats section |
| `src/pages/SwipePreset.tsx` | **Modify** — unify footer, consume config |
| `src/components/admin/CardPreviewEditor.tsx` | **Modify** — render stats using config |
| `src/hooks/useAppSettings.tsx` | **Modify** — include `card_stats_config` in loaded settings |

