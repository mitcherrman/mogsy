The SwipeHub category selection page already has two `AutoScrollRow` marquees, but both currently scroll in the same direction at 30px/s.

Changes to `src/pages/SwipeHub.tsx`:

1. Make the two rows scroll in **opposite directions** — first row left-to-right (`direction={1}`), second row right-to-left (`direction={-1}`).
2. Reduce the auto-scroll **speed from 30px/s to 27px/s** for a more subtle, ambient feel.
3. Keep all existing behavior (bubble sizing, shapes, click handling, image preloading) unchanged.

This creates a gentle, opposing marquee motion on the category hub without affecting gameplay.