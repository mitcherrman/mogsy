

## Root Cause

The `<Suspense fallback={<LazyFallback />}>` in `App.tsx` wraps the entire route tree, including the `<Layout>` component which contains the Navbar. When a lazy-loaded page component (like Home) is first accessed, React.lazy throws a promise that bubbles up to this Suspense boundary, which **replaces everything below it** — including the already-rendered Navbar — with a blank div. Once the lazy component loads, everything re-renders together.

```text
Current tree (problematic):
  <Suspense fallback={blank}>     ← catches lazy promise, hides EVERYTHING
    <Routes>
      <Route element={<Layout>}>  ← has Navbar
        <Route path="/home" element={<Home />} />  ← lazy, triggers Suspense
```

## Fix

**File: `src/App.tsx`**

Move the `<Suspense>` boundary from around the entire `<Routes>` to inside the `<Layout>` component, wrapping only the `<Outlet>`. This way, when a lazy page loads, only the content area shows the fallback — the Navbar stays visible.

1. Remove `<Suspense>` wrapper from `App.tsx` around `<Routes>`
2. Add `<Suspense>` inside `Layout.tsx` wrapping only `<Outlet>`

**File: `src/components/Layout.tsx`**

Wrap `<Outlet>` with `<Suspense fallback={<div className="min-h-screen" />}>` so the Navbar persists while lazy pages load.

For non-Layout routes (like `/`, `/auth`, `*`), add individual `<Suspense>` wrappers or keep them eagerly loaded (Index and NotFound are already non-lazy).

