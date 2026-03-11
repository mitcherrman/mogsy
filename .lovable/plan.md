

# Expand Title Image Configuration Bounds

Massively increase all slider/input ranges in `AdminPlayLeagueItems.tsx` so title images can cover the entire card and beyond. Shift the vertical offset center up by ~300 so the midpoint aligns with the card/image center rather than the title text area.

## Changes — `AdminPlayLeagueItems.tsx`

| Control | Current Range | New Range | Notes |
|---------|--------------|-----------|-------|
| **Scale** | 0.1 – 6 | 0.1 – 15 | |
| **Offset Y** | -100 – 50 | -600 – 300 | Shifted up ~300 from previous plan's -300/300 |
| **Offset X** | -50 – 50 | -200 – 200 | |
| **Max Height** | 0 – 200 | 0 – 600 | |

Update all matching locations per control:
- `<Slider min/max>`
- `<Input min/max>`
- Clamp in `onChange` handler
- Nudge button clamp values (Offset Y and Offset X have `+1`/`-1` buttons with `Math.max`/`Math.min`)

**Single file:** `src/components/admin/AdminPlayLeagueItems.tsx`, lines 350–421.

