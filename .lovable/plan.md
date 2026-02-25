

## Analysis of the Problem

The current `SliceBattleAnimation` renders **abstract semi-transparent colored divs** (`bg-destructive/8`) with clip-path polygons. It never shows the actual card content — no image, no text. The user sees vague tinted rectangles splitting apart, which looks cheap and disconnected from the cards on screen.

Your suggestion about splitting the actual image is exactly the right approach. We don't need to pre-process or store two halves — we can render the loser's actual image twice, each clipped to a half with a jagged tear edge using CSS `clip-path` and `mask-image`, then animate them apart. This is a well-established technique used in card game UIs (Hearthstone card destruction, Clash Royale defeats, etc.).

---

## Technical Approach: Real Image Tear

### Core Idea
1. Pass the **loser card's image URL and name** into `SliceBattleAnimation`
2. Render a full replica of the loser card (image + name overlay) positioned exactly over the real card
3. At the tear moment, swap to **two copies** of that replica, each clipped to top/bottom half with a jagged SVG edge mask
4. Animate the halves separating — top half drifts up-left with slight rotation, bottom half drops down-right
5. Add a bright diagonal slash line at the moment of separation

### Jagged Tear Edge
Instead of a clean diagonal line, use an **inline SVG `clipPath`** with a zigzag/perforated pattern along the cut line. This gives the torn-paper / sliced effect. The zigzag runs at approximately 10-15 degrees diagonally across the card.

### Animation Phases (total ~800ms)
```text
Phase 1: "rise" (0-200ms)
  - Winner card scales up 1.05x, lifts -8px (existing behavior, improved)
  - Loser card: no change yet — builds tension

Phase 2: "slash" (200-350ms)  
  - A bright white diagonal line sweeps across the loser card (150ms)
  - At 300ms mark: loser card snaps into two jagged halves

Phase 3: "split" (350-650ms)
  - Top half: translates (-30px, -40px), rotates -5°, fades to 0
  - Bottom half: translates (20px, 50px), rotates 3°, fades to 0
  - Winner card settles back to scale 1.0

Phase 4: "done" (650-800ms)
  - Cleanup, call onComplete
```

### Changes Required

**`src/components/SliceBattleAnimation.tsx`** — Full rewrite:
- New props: `loserImageUrl: string | null`, `loserName: string`, and existing `winnerSide` / `onComplete`
- Render an **inline SVG** defining a jagged polygon clip-path for top-half and bottom-half
- Two `motion.div` elements each containing the actual loser image, clipped to their respective halves
- The jagged edge is a zigzag polyline at ~12° angle across the midpoint
- Diagonal slash flash line (bright white, 2px, sweeps via `scaleX` animation)
- Winner glow remains but simplified

**`src/pages/SwipePreset.tsx`** — Minor prop additions:
- Pass `loserImageUrl` and `loserName` to `SliceBattleAnimation` based on the current pair and `sliceWinner` state
- Also need to know the loser card's position (top/left vs bottom/right) — already derivable from `winnerSide`

### Jagged Edge Detail
The SVG clip-path polygon for the top half would look like:
```text
0,0 → 100,0 → 100,45% → zigzag teeth → 0,55% → 0,0
```
Where the zigzag has ~12-16 small triangular teeth running diagonally, creating a torn/perforated look. The bottom half uses the inverse polygon. Both clip-paths reference the same SVG `<defs>` block rendered once.

### Why This Works
- Uses the **real image** — the tear looks like the actual card is being destroyed
- Jagged edges via SVG clip-path are GPU-accelerated and crisp at any resolution
- No image pre-processing, no storage, no server changes needed
- The framer-motion spring/ease curves give physicality to the falling halves
- Total duration stays under 1 second so it doesn't slow down gameplay

