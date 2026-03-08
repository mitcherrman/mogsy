

## Refine Among Us GIF Overlay

### Changes to `src/components/animations/AmongUsAnimation.tsx`

1. **Crop top 25%**: Change the GIF's `object-position` to shift it down, and use `object-fit: cover` with a clip or adjust the container to cut the top quarter. Simplest: keep `overflow-hidden` container, shift the image up with negative margin or `object-position: center 75%` approach. Actually, increase scale and shift down: use `scale-[1.4]` with `origin-bottom` and `object-position: bottom`.

2. **Round corners**: Add `rounded-2xl` to the overflow-hidden container.

3. **Tighter radial fade**: Shrink the mask ellipse from `70% 70%` to something like `55% 55%` with a sharper falloff (`black 30%, transparent 85%`), making edges fade more aggressively so only the center action is visible.

### Specific edits (lines 80-98)

- Container (line 81): add `rounded-2xl`
- Mask (lines 88-89): change to `radial-gradient(ellipse 50% 55% at center 60%, black 25%, transparent 80%)`
- Image (line 95): change to `object-cover scale-[1.3]` and add `object-bottom` styling to crop the top

