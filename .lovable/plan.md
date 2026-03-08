

## Winner Card Glow/Celebration Effects

Every animation currently only punishes the loser card — the winner card is completely static. Adding a thematic positive effect to the winner card will make the result feel more satisfying and clear.

### Per-Animation Winner Effects

Here are custom ideas matched to each animation's personality:

| Animation | Winner Effect | Description |
|-----------|--------------|-------------|
| **Classic Fade** | Soft green pulse glow | Border briefly pulses with a green/primary glow, then settles. Simple to match the minimal vibe. |
| **Paper Rip** | Steel gleam sweep | A diagonal white highlight sweeps across the winner card like light reflecting off a blade — matching the cutting theme. |
| **Shatter** | Diamond sparkle border | Tiny white sparkle particles drift around the card border, like the winner absorbed the shattered fragments. |
| **Disenchant (Burn)** | Golden aura border | Winner card gets a warm golden outer glow that pulses once — absorbing the loser's golden energy. |
| **Vaporize** | Ethereal shimmer | Subtle color-shifting border glow (cyan to purple), like the winner exists on a higher plane. |
| **Crush** | Power surge pulse | Card border does a single strong scale-up pulse (1.02x) with a bright white flash ring expanding outward — the winner is the one doing the crushing. |
| **You're Chopped** | Victory stamp + green border | Green pulsing border glow. Clean and celebratory. |
| **Mogged** | Chad golden crown glow | Warm golden glow emanates from the top of the winner card, like a crown/halo effect. The winner IS the chad. |
| **Sgt Doakes** | Red/blue police siren flash | Border alternates red and blue twice quickly — the winner called in Doakes on the loser. |

### Implementation Approach

1. **Create a reusable `WinnerGlow` sub-component** — or inline the effect directly in each animation file for maximum customization per animation.
2. For each animation file, wrap the winner card's `<div>` with a `motion.div` that animates:
   - `boxShadow` for glow effects
   - `scale` for pulse effects  
   - Additional child elements for sparkles/sweeps/flashes
3. The effects trigger when `phase` leaves `"idle"` and animate over ~0.4-0.6s with a slight delay so the winner celebration starts just after the loser destruction begins.
4. **DefaultFadeAnimation** is a no-op component — it will need to become a full overlay like the others to show the winner glow, OR the glow can be applied at the parent level for just this case.

### Files to Modify

- `src/components/SliceBattleAnimation.tsx` — steel gleam sweep on winner
- `src/components/animations/ShatterAnimation.tsx` — diamond sparkle border
- `src/components/animations/BurnAnimation.tsx` — golden aura glow
- `src/components/animations/VaporizeAnimation.tsx` — cyan-purple shimmer
- `src/components/animations/CrushAnimation.tsx` — power surge pulse
- `src/components/animations/ChopAnimation.tsx` — green border glow
- `src/components/animations/MoggedAnimation.tsx` — golden crown halo
- `src/components/animations/SgtDoakesAnimation.tsx` — red/blue siren flash
- `src/components/animations/DefaultFadeAnimation.tsx` — convert to overlay with soft green pulse

