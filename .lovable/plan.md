

## Analysis

**Yes, these are conflicting and causing the flash.** Here's what happens:

1. `Layout.tsx` (line 20) sets `bg-background` on the outer wrapper, then conditionally overrides it with the theme's `pageBg` via inline `style`.
2. `Home.tsx` (line 388) **also** sets `bg-background` on its own root div — this paints the default background color **on top of** the themed background for a brief moment before the theme fully renders, causing the visible flash.

The Layout is the single source of truth for background. Home.tsx should not redeclare it.

## Plan

**Single change — remove `bg-background` from Home.tsx line 388:**

```tsx
// Before
<div className="min-h-screen bg-background px-4 py-8">

// After
<div className="min-h-screen px-4 py-8">
```

No changes needed in Layout.tsx — it correctly handles both default and themed backgrounds already.

I'll also scan other pages for the same duplicate `bg-background` pattern so we can fix them all at once.

