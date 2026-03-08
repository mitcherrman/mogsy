

## Plan: Desktop Layout View Toggle (5 modes)

### Goal
Add a toggle in the Play page header (desktop only) that lets you switch between 5 layout modes for subcategory items. The selected mode persists via localStorage.

### Layout Modes
1. **Bubbles** — Original circular bubbles (the `Bubble` component, pyramid-style)
2. **Pills** — Current rectangular rounded pills (`RectPill`)
3. **Grid Cards** — Fixed-width cards in a 3-column grid, uniform size, image thumbnail + centered label
4. **List** — Full-width horizontal rows with icon/image on left, name on right
5. **Tiles** — Equal-sized square tiles with image background and overlaid label

### Changes — `src/pages/Play.tsx`

1. **New state + localStorage persistence:**
   - `type DesktopLayout = "bubbles" | "pills" | "grid" | "list" | "tiles"`
   - `const [desktopLayout, setDesktopLayout] = useState<DesktopLayout>(() => localStorage.getItem("play-desktop-layout") || "pills")`
   - Sync to localStorage on change

2. **Layout toggle UI** (desktop only, next to Animation popover):
   - Small segmented button group or dropdown with 5 icons (Circle, RectangleHorizontal, LayoutGrid, List, Square) from lucide-react
   - Compact, fits in the header bar

3. **New render components** (internal to Play.tsx):
   - `GridCard` — 160×120px card with image bg, rounded-lg, label overlay, 3-column CSS grid
   - `ListRow` — Full-width row, h-12, image thumbnail 32×32 on left, label on right, border-b
   - `TileSquare` — 120×120px square, image bg, label overlay centered
   - Existing `RectPill` stays for "pills" mode
   - Existing `Bubble` component used for "bubbles" mode

4. **Refactor item rendering:**
   - Extract a `renderDesktopItem(item, index)` function that switches on `desktopLayout` to render the correct component
   - Replace all desktop `RectPill` usages in `renderCategoryContent` and `renderDesktopSubContent` with this function
   - For "bubbles" mode, use the same `Bubble` component with `size={100}` and flex-wrap layout (not pyramid)
   - Container layout changes per mode:
     - bubbles/pills/tiles: `flex flex-wrap gap-3`
     - grid: `grid grid-cols-3 gap-3`
     - list: `flex flex-col gap-1 w-full`

### No changes to mobile — all layout toggle logic gated behind `!isMobile`.

