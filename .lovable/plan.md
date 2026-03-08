

# Fix: Animation Overlay Cards Appearing Larger Than Actual Cards

## Root Cause

**Classic Fade (`DefaultFadeAnimation`)** renders `null` — it shows nothing. The user only ever sees the parent's properly-sized cards (with borders, padding, name/stats section). No overlay = no sizing mismatch.

**All other animations** (Shatter, Burn, Vaporize, Crush, Slice) render a **full-screen overlay** (`absolute inset-0 z-50 bg-background`) containing their own duplicate `<img>` tags. These overlay images use `flex-1` to fill available space with no borders, no padding, and no stats section below — so the images are **taller/larger** than the parent's actual cards (which reserve space for name, Elo stats, borders, etc.). This creates the brief "zoom" flash when the overlay appears.

```text
Parent card layout:              Animation overlay layout:
┌─ border ──────────┐            ┌─ no border ──────────┐
│ ┌──────────────┐  │            │                      │
│ │   IMAGE      │  │            │                      │
│ │  (aspect     │  │            │     IMAGE             │
│ │   ratio)     │  │            │   (fills ALL          │
│ └──────────────┘  │            │    flex space)        │
│  Name              │            │                      │
│  Local 1200 #3     │            │                      │
│  🌐 Global 1180 #5│            └──────────────────────┘
│  EloChangeIndicator│             Name (small text below)
└───────────────────┘
```

## Fix

Update all 5 animation components (Shatter, Burn, Vaporize, Crush, Slice) so their card replicas match the parent's structure:

1. **Add matching border container**: Wrap each card in `rounded-2xl border border-border bg-card overflow-hidden`
2. **Constrain image area**: Use the same aspect ratio constraint (`portrait:aspect-[5/4] landscape:aspect-[3/4] md:aspect-[3/4]`) instead of letting the image fill all flex space
3. **Reserve space for name/stats below image**: Include a simple name text block so the overlay's total card height matches the parent's

This ensures when the overlay appears, it's pixel-matched to the parent cards — no size jump.

## Files to Modify
- `src/components/animations/ShatterAnimation.tsx`
- `src/components/animations/BurnAnimation.tsx`
- `src/components/animations/VaporizeAnimation.tsx`
- `src/components/animations/CrushAnimation.tsx`
- `src/components/SliceBattleAnimation.tsx`

Each file gets the same structural fix: replace the current simple `flex-1 > rounded-2xl > img` layout with a bordered card that constrains the image area and includes a name/stats placeholder section.

