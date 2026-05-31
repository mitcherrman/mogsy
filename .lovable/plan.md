# Swipe Hub: opposite directions + scrollable rows

Scope: `src/pages/SwipeHub.tsx` only. Visual/interaction change, no business logic.

## Changes

1. **Opposite directions**
   - Row 1 keeps `direction={1}` (scrolls left→right visually).
   - Row 2 becomes `direction={-1}` so it auto-scrolls the other way.

2. **User-scrollable rows**
   - Each row already overflows horizontally; expose it as a usable scroller:
     - Show a thin horizontal scrollbar (replace `scrollbarWidth: "none"` with a slim styled bar, keep the fade mask).
     - Keep mouse wheel / touch drag / trackpad swipe working (native overflow-x already supports this).
   - Auto-scroll cooperates with manual scrolling:
     - Pause the rAF loop on `pointerdown`, `wheel`, `touchstart`, and while the pointer is hovering the row.
     - Resume ~1.5s after the last interaction, continuing from the user's current `scrollLeft` (no jump).
     - Keep the seamless loop logic by wrapping `scrollLeft` against `scrollWidth / 2` whenever it drifts past the bounds, including after manual scrolls.

3. **Page-level scroll lock**
   - The page currently sets `touch-action: none` and `overscroll-behavior: none` on `html`/`body` and the container. Narrow this so horizontal panning inside the rows still works:
     - Leave the outer container locking vertical scroll.
     - Set `touch-action: pan-x` on each row's scroller so horizontal touch drags reach the overflow instead of being swallowed.

## Technical notes

- No new deps. All logic stays inside `AutoScrollRow` plus a one-line prop change at the two call sites.
- Direction sign already drives the rAF math; flipping row 2 to `-1` is sufficient.
- For the resume-after-interaction behavior, use a `lastInteractionRef` timestamp checked inside the existing `tick`, so we don't need to tear down / rebuild the rAF loop.
