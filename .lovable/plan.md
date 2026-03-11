

# Condense Mobile Card Stats to Single Line

## Problem
On mobile, each card's stats area takes multiple lines (name, subtitle, aura/rank, elo change indicator) causing the game to overflow the viewport. Users can still scroll.

## Solution
On mobile, collapse the name + aura/rank into a single horizontal line per card, and remove the separate EloChangeIndicator row. This saves ~20-30px per card (40-60px total), eliminating the scroll.

## Changes

### `src/pages/SwipePreset.tsx`
**Normal cards (line ~913-960)** and **GauntletCard (line ~1144-1182)**: On mobile, replace the multi-line stats block with a single-line layout:
- Name on the left, aura/rank on the right, all on one line
- Remove subtitle on mobile (or keep inline if short)
- Hide the EloChangeIndicator row on mobile (it shows during animations anyway via the overlay)
- Reduce padding from `py-1` to `py-0.5` on mobile
- Keep desktop layout unchanged

**Image aspect ratio**: Change mobile portrait from `aspect-[5/4]` to `aspect-[4/3]` to shorten cards slightly.

### `src/pages/Swipe.tsx`
**Card stats area (lines ~539-549, 564-574)**: Same single-line treatment — name left, aura right, remove EloChangeIndicator row on mobile. Reduce padding.

### `src/components/animations/AnimationCardStats.tsx`
Add optional `compact` prop. When true, render name and elo on one line, skip subtitle and EloChangeIndicator.

### Layout tightening
- Change outer container `pb-4` to `pb-6` for more bottom buffer
- Ensure `overflow-hidden` is strict (already set)

### Single-line mobile layout (per card)
```text
Before (3 lines):
  [      Item Name      ]
  [   1200 #3 | 🌐 1200 #5   ]
  [     +15 ▲            ]

After (1 line):
  [ Item Name    1200 #3 ]
```

