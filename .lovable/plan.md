## Problem

When navigating between sections, the `RouteLoader` (Mogsy logo on `bg-background`) briefly shows with a visible rectangular border. This happens because the inner `<Suspense fallback={<RouteLoader />}>` in `src/components/Layout.tsx` renders inside `<main>` (constrained to `max-w-7xl` with vertical padding `pt-14 pb-16`), so the loader's `bg-background` rectangle has hard top/bottom edges against the `#0a0a1a` page background.

The current loader stage uses `.mask-fade-x`, which only feathers the left/right edges — top/bottom stay sharp.

## Fix

Make the loader's "stage" rectangle fade on all four sides so it dissolves into the outer `#0a0a1a` regardless of whether it's rendered full-screen or inside the Layout column.

1. Add a new utility `.mask-fade-xy` in `src/index.css` that combines horizontal and vertical linear-gradient masks (using the same `clamp(24px, 6vw, 96px)` falloff so it matches the existing horizontal feather):

   ```css
   .mask-fade-xy {
     -webkit-mask-image:
       linear-gradient(to right, transparent 0, #000 clamp(24px, 6vw, 96px), #000 calc(100% - clamp(24px, 6vw, 96px)), transparent 100%),
       linear-gradient(to bottom, transparent 0, #000 clamp(24px, 6vw, 96px), #000 calc(100% - clamp(24px, 6vw, 96px)), transparent 100%);
     -webkit-mask-composite: source-in;
     mask-image: /* same */;
     mask-composite: intersect;
   }
   ```

2. In `src/components/Layout.tsx` `RouteLoader`, swap the stage's `mask-fade-x` for `mask-fade-xy` so both vertical and horizontal edges feather. The ambient radial halo stays as-is (it already fades naturally).

No changes to routing, the FCP shell, or any page UI. The full-screen Suspense fallbacks in `App.tsx` are unaffected visually (their edges run off-screen anyway).

## Files touched

- `src/index.css` — add `.mask-fade-xy` utility.
- `src/components/Layout.tsx` — `RouteLoader` uses `mask-fade-xy` instead of `mask-fade-x`.
