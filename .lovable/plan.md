

# Fix Default Image Fitting Logic

## Problem
Currently all card images use `object-cover`, which crops the image to fill the card container. This cuts off parts of the image. The goal is the opposite: **show the entire image by default**, fitting it into the card while minimizing blank space. Admins can then use the zoom/focal/padding controls to fine-tune.

## Solution
Switch the default image fitting from `object-cover` to `object-contain`. This CSS property scales the image to fit entirely within the container at maximum size without cropping. Some letterboxing may appear if aspect ratios differ, but the full image is always visible.

The existing admin zoom controls (0.3x-3x) let admins zoom in to crop if needed — effectively giving them the `object-cover` behavior on demand, but with `object-contain` as the safe default.

## Files to Change

1. **`src/pages/SwipePreset.tsx`** — Change `object-cover` to `object-contain` on all card `<img>` tags (gameplay cards + GauntletCard)
2. **`src/components/admin/ImagePositionEditor.tsx`** — Change preview `<img>` to `object-contain`
3. **`src/components/admin/AdminPlayLeagueItems.tsx`** — Change card preview `<img>` to `object-contain`
4. **All animation components** (DefaultFade, Shatter, Burn, Vaporize, Crush, Chop, Mogged, SgtDoakes, AmongUs, SliceBattleAnimation) — Change `object-cover` to `object-contain` on card images

This is a CSS-only change across ~13 files, no logic or layout changes.

