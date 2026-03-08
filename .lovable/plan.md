

## Plan: Fade to Black During Cycle Theme Transitions

Currently, the cycle transition fades the entire page to `opacity: 0` (transparent), which shows whatever is behind it. Instead, we need a black overlay that fades in, the theme swaps while hidden behind black, then the overlay fades out.

### Changes

**1. `src/components/Layout.tsx`**
- Remove the opacity-based transition on the main wrapper
- Add a fixed black overlay div that fades in/out based on `isCycleFading`
- The overlay sits above all content (`z-50`, `pointer-events-none`, `fixed inset-0`, `bg-black`)
- Transition its opacity: `0` normally, `1` when fading

**2. `src/hooks/useSitewideTheme.tsx`** (no changes needed — the existing `isCycleFading` boolean + timing already handles the fade-out/swap/fade-in lifecycle)

### Result
Instead of the page going transparent, a smooth black curtain will rise, the theme swaps behind it, then the curtain drops — giving a clean "fade to black" effect.

