

# Blurred Background Image Effect for All Cards

Add a larger, blurred copy of the same image behind the main image on every card — creating a visually rich background fill effect.

## Approach

In every image container div (the `bg-muted/30 overflow-hidden relative` wrapper), insert a second `<img>` element **before** the main image. This background image will be:
- Absolutely positioned, filling the container
- Scaled up (~120-130%) via `object-fit: cover` to ensure full coverage with no gaps
- Blurred with CSS `filter: blur(20px)`
- Slightly dimmed with reduced opacity

The main image stays on top with `object-contain` as-is, now composited over the blurred version.

## Locations to update

| File | Line(s) | Context |
|------|---------|---------|
| `SwipePreset.tsx` | ~800 | Initial pair display (first card) |
| `SwipePreset.tsx` | ~920 | Mobile card loop |
| `SwipePreset.tsx` | ~1203 | Desktop `cardContent` |
| `AdminPlayLeagueItems.tsx` | ~645 | Admin preview card |

## Change pattern (same at each location)

```tsx
// Before:
<div className="w-full ... bg-muted/30 overflow-hidden relative">
  {displayImage ? (
    <img src={displayImage} ... className="w-full h-full object-contain" ... />
  ) : ( ... )}
</div>

// After:
<div className="w-full ... bg-muted/30 overflow-hidden relative">
  {displayImage && (
    <img
      src={displayImage}
      alt=""
      className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-70"
      aria-hidden="true"
    />
  )}
  {displayImage ? (
    <img src={displayImage} ... className="w-full h-full object-contain relative z-10" ... />
  ) : ( ... )}
</div>
```

The blurred image uses `scale-110` to prevent edge gaps from the blur, `blur-xl` (20px) for the background effect, and `opacity-70` so it's subtle. The main image gets `relative z-10` to stay on top.

4 locations, 1 pattern, 2 files.

