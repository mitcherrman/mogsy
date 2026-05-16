## Goal
Eliminate the hard vertical line where the centered content column (`max-w-7xl`) meets the surrounding body background on desktop. Replace it with a very soft, glowy fade so foreground and background blend seamlessly.

## What's happening today
- `index.html` paints `<body>` at `#0a0a1a`.
- `src/components/Layout.tsx` wraps the app in `min-h-screen bg-background` (dark mode `hsl(222 47% 11%)` ≈ `#0f172a`), full viewport width.
- Because both layers are full-width, on a clean page there's no edge — but on themed pages and on the home/profile/swipe routes the inner `<main>` (`max-w-7xl mx-auto`) sits over a content column that's visually distinguishable from the body, especially when the theme applies a `pageBg` gradient to the outer div but cards inside use `bg-card`. The result on ≥1280px viewports is a vertical "shelf" at ±640px from center.

## Approach (very soft, level 5)
Stop painting `bg-background` (and any theme `pageBg`) across the full viewport. Instead, paint it only behind the centered column and feather both vertical edges with a CSS mask + an ambient outer glow so it dissolves into the body color.

### Changes (all in `src/components/Layout.tsx` + a small utility in `src/index.css`)

1. **Restructure Layout wrapper**
   - Outer `<div>`: keep `min-h-screen`, but set background to body color (`#0a0a1a`) — i.e. drop `bg-background`. Move theme `pageBg` off this element.
   - Insert a new "stage" wrapper inside, centered, `max-w-[88rem]` (slightly wider than content so the fade lives in the gutter, not over text):
     - `bg-background` (or theme `pageBg`) applied here.
     - `mx-auto relative`.
     - Apply `mask-image: linear-gradient(to right, transparent 0, #000 clamp(24px, 6vw, 96px), #000 calc(100% - clamp(24px, 6vw, 96px)), transparent 100%)` and the `-webkit-mask-image` equivalent so the column's own background fades to transparent at both vertical edges.
   - Keep `<main className="max-w-7xl mx-auto …">` inside the stage so content stays at current width; the stage's extra ~64px on each side becomes the fade gutter.

2. **Ambient outer glow (optional polish, still inside the stage)**
   - Add two absolutely-positioned `pointer-events-none` divs at `left:-120px` / `right:-120px`, full height, `w-60`, with `bg-[radial-gradient(...)]` using `hsl(var(--background)/0.5)` fading to transparent. Behind content (`z-0`).
   - Gives a halo so the column feels lit rather than cut.

3. **Below the small breakpoint**
   - On `< md`, the column already fills the viewport (px-0), so the mask is a no-op visually — but keep it on so theme transitions look continuous.

4. **`src/index.css` — add reusable utility**
   ```css
   @layer utilities {
     .mask-fade-x {
       -webkit-mask-image: linear-gradient(to right, transparent 0, #000 clamp(24px,6vw,96px), #000 calc(100% - clamp(24px,6vw,96px)), transparent 100%);
       mask-image: linear-gradient(to right, transparent 0, #000 clamp(24px,6vw,96px), #000 calc(100% - clamp(24px,6vw,96px)), transparent 100%);
     }
   }
   ```
   Use it on the stage wrapper.

5. **Theme integration**
   - When a sitewide theme is enabled, apply `theme.styles.pageBg` to the stage wrapper instead of the outer div, so the themed gradient also fades into the body color at the edges (matches the rest of the soft treatment).

### What is intentionally NOT changed
- No edits to individual page files (Home, Profile, Swipe, etc.) — they keep their existing card styles.
- Navbar, floating buttons, theme overlay, cycle-fade overlay all stay full-viewport (they should bridge the gutter; they already do via `fixed`).
- `bg-card` rectangles inside pages are untouched (user picked "vertical column edge" only).

## Diagram

```text
viewport (body #0a0a1a)
┌──────────────────────────────────────────────────────────────┐
│   fade gutter   ┌──────── stage (bg-background) ────────┐ … │
│  (mask→transp.) │   <main max-w-7xl>  content cards     │   │
│                 │                                       │   │
│                 └───────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## Verification
- Open `/home`, `/profile`, `/swipe-hub` on 1336px wide preview: confirm no hard vertical line; column dissolves into body.
- Toggle a sitewide theme (e.g. via FloatingThemeSwitcher): confirm themed gradient also feathers, no shelf.
- Resize to < 768px: confirm content is unaffected and fills width.
- Confirm fixed Navbar and floating FABs are unaffected (still span full viewport).