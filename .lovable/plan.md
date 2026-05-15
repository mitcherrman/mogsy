# Fix: empty-template flash after onboarding completes

## Where the handoff happens

The transition from "onboarding finished" to "Home screen visible" lives entirely in `src/pages/Home.tsx`:

- **Render gate** (lines 773–779):
  ```tsx
  if (showOnboarding) return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  if (loading) return <div className="min-h-screen bg-background" />;
  ```
- **Completion handler** (lines 209–215):
  ```tsx
  const handleOnboardingComplete = async (categories) => {
    setShowOnboarding(false);          // (A) unmount onboarding
    setPreferredCategories(categories);
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("id")...;
    if (profile) await loadData(profile.id, categories);  // (B) sets loading=true inside
  };
  ```

## Why the flash happens

When the user lands on `/home` for the first time, the path through `checkOnboardingAndLoad` sets `loading=false` *before* showing onboarding (line 174). When `handleOnboardingComplete` runs:

1. `setShowOnboarding(false)` flips the gate — Home re-renders.
2. `loading` is still `false`, and all data arrays (`leagues`, `bannerItems`, `categorySections`, `playCollections`, `playCompetes`, `recentSwipes`, `topComments`, `previewImages`, etc.) are still their initial empty values.
3. React paints one frame of the full Home layout with empty sections — that is the "outlines/templates/textboxes of old code" the user sees.
4. A microtask later, `loadData` runs, calls `setLoading(true)`, and Home swaps to the blank loader, then to real content.

So the flash window = the gap between step 1 and `setLoading(true)` inside `loadData` (one render + one async profile fetch).

## Fix

Eliminate the gap by entering the loading state in the *same* React update that hides onboarding, before any await:

```tsx
const handleOnboardingComplete = async (categories: string[]) => {
  // Set loading first so the gate falls through to the loader, not empty Home
  setLoading(true);
  setShowOnboarding(false);
  setPreferredCategories(categories);
  if (!user) return;
  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
  if (profile) await loadData(profile.id, categories);
  else setLoading(false);
};
```

Both `setLoading(true)` and `setShowOnboarding(false)` are batched into one render, so the next paint hits the `if (loading)` branch (the branded loader/blank shell) instead of an empty Home, and the flash disappears.

## Optional polish (same file)

- Use the branded `RouteLoader` from `src/components/Layout.tsx` instead of the bare `<div className="min-h-screen bg-background" />` at line 778, so the post-onboarding wait matches the boot shell visually.
- Add a defensive `setLoading(false)` in the `if (!user)` early return to avoid a stuck loader if the user signs out mid-flow.

## Files touched

- `src/pages/Home.tsx` — only `handleOnboardingComplete` (and optionally the `loading` fallback markup).

No backend, schema, or routing changes required.
