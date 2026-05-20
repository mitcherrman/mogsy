## Problem

When navigating between sections (Home → Leaderboard → Swipe → Profile, etc.), a brief loading screen appears with a visible vertical seam. The route-level `Suspense` fallback in `src/App.tsx` is:

```tsx
const LazyFallback = () => (
  <div className="min-h-screen bg-background" />
);
```

`bg-background` ends abruptly against the outer `#0a0a1a` page color — same hard edge we previously fixed for `RouteLoader` in `src/components/Layout.tsx` using the feathered "stage" (`max-w-[88rem]` + `.mask-fade-x` + radial halo).

Every `<Suspense>` in `App.tsx` (~15 routes including `/`, `/auth`, `/admin/*`, `/multiplayer`, `/:slug`, etc.) uses this same fallback, so the seam appears on every section transition.

## Fix

Unify on a single feathered loader so transitions stay seamless.

1. Export `RouteLoader` from `src/components/Layout.tsx` (currently it's a private component already used for the inner Suspense and as `<RouteLoader />` when `useNavigation()` reports loading).
2. In `src/App.tsx`, replace the local `LazyFallback` with the exported `RouteLoader` and use it for every `<Suspense fallback={...}>` (drop the `LazyFallback` definition).

This means the static FCP shell → route Suspense fallback → `Layout` Suspense fallback → page content all share the same `#0a0a1a` outer background and `bg-background` column with `.mask-fade-x` masked edges, so there is no visible vertical line at any stage of the transition.

## Files touched

- `src/components/Layout.tsx` — `export function RouteLoader()` (or named re-export); no visual change.
- `src/App.tsx` — import `RouteLoader`, swap all `fallback={<LazyFallback />}` to `fallback={<RouteLoader />}`, remove `LazyFallback`.

No changes to backend, routing logic, or per-page UI.
