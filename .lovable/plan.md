## Goal

In `SwipeHub` (the `/swipe` page), the two auto-scrolling bubble rows currently let the buttons clip hard against the left and right viewport edges. Add smooth fade-to-background gutters so bubbles appear to glide in/out of view instead of being chopped off.

## Approach

Use a CSS mask gradient on the scroll track. This is the modern, GPU-friendly way to fade scrolling content into the page background — it works regardless of background color (no need to match `#0a0a1a` solid blocks), it doesn't intercept pointer events, and it animates cleanly with the marquee.

### Change

In `src/components/SwipeHub.tsx` → `AutoScrollRow`'s outer scroll `<div>`:

- Add a horizontal mask: transparent at the left/right edges, opaque in the middle.
- Width of fade: ~64px on mobile, ~96px on desktop (uses Tailwind responsive arbitrary values via inline style with `clamp()` so it scales).
- Apply via inline style:
  ```ts
  style={{
    scrollbarWidth: "none",
    WebkitMaskImage:
      "linear-gradient(to right, transparent 0, #000 clamp(40px,8%,96px), #000 calc(100% - clamp(40px,8%,96px)), transparent 100%)",
    maskImage:
      "linear-gradient(to right, transparent 0, #000 clamp(40px,8%,96px), #000 calc(100% - clamp(40px,8%,96px)), transparent 100%)",
  }}
  ```
- Add a small horizontal `padding` (e.g. `paddingLeft`/`paddingRight: bubbleSize * 0.5`) on the inner flex track so the first/last bubble doesn't sit fully under the mask before the loop wraps.

Optional polish (kept minimal so it stays "modern app" and not busy):
- No extra DOM overlays, no borders, no shadows — the gradient mask alone gives the smooth fade the user is asking for.

### Files

- `src/components/SwipeHub.tsx` — only `AutoScrollRow`'s scroll container style + inner padding. No logic, no layout, no animation timing changes.

No backend, routing, or other component changes.
