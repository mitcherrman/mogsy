## Plan: Prominent Aura Change Animation on Cards During Swipe Animations

### What

Add an animated floating aura change indicator that appears directly over each card's image during any swipe animation. This will show the aura gained/lost (e.g., "+15" in green, "-12" in red) with a pop-and-float animation. If the rank changes, show that too (e.g., "#5 → #3").

### Where

**Single file edit: `src/components/animations/AnimationCardStats.tsx**`

This component is already rendered by every animation variant (Slice, Burn, Shatter, Default, etc.), so adding the prominent indicator here means it works across all animations automatically.

### How

1. **Add a new `AuraChangeOverlay` section** above the existing stats in `AnimationCardStats`:
  - A floating badge that animates in with a spring/pop effect, showing `+N` or `-N` aura change
  - Green color scheme for gains, red for losses
  - Uses framer-motion: scales up from 0, slight upward float
  - Positioned above the name/stats area so it's visually prominent
2. **Rank change display**: If `rankOld` and `rankNew` differ, show a secondary line like `#8 → #5` with an upward arrow, or `#3 → #7` with a downward arrow, appearing with a slight delay after the aura change
3. **Styling**: bold text (text-lg/text-xl), pill-shaped background with color-coded transparency (emerald for gains, red for losses), with a subtle glow shadow matching the color

### Visual result

```text
┌──────────────┐
│              │
│   [image]    │
│              │
│    +15 ⬆     │  ← animated aura change overlay
│   #8 → #5    │  ← rank change (if applicable)
│──────────────│
│  Name        │
│  1215 #5     │  ← existing stats
│  +15 ▲3      │  ← existing EloChangeIndicator (kept)
└──────────────┘
```

The existing `EloChangeIndicator` at the bottom stays as-is for consistency. The new overlay is the prominent "at a glance" version that draws the eye during animation.