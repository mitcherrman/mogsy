

## Plan: Paginated Theme Switcher (5 per page)

### What changes
Replace the scrollable theme list in `FloatingThemeSwitcher.tsx` with a paginated view showing 5 theme circles at a time, with a small "more" button (e.g., ChevronUp/ChevronDown) to navigate between pages.

### Implementation (single file: `src/components/FloatingThemeSwitcher.tsx`)

1. **Add page state**: `const [page, setPage] = useState(0)` — reset to 0 when menu opens
2. **Compute pages**: `const PAGE_SIZE = 5`, slice `visibleThemes` into `visibleThemes.slice(page * 5, page * 5 + 5)`
3. **Total pages**: `Math.ceil(visibleThemes.length / 5)`
4. **Render**: Show 5 theme circles for current page. Add a small chevron button at the top (to go to previous page) and bottom (to go to next page) of the theme list, only when there are more pages in that direction
5. **Remove** `max-h-[70vh] overflow-y-auto` from the container since pagination replaces scrolling
6. **Reset page to 0** when `open` changes to `true`

### UI structure
```text
  [▲]  (if page > 0)
  ○ theme 1
  ○ theme 2
  ○ theme 3
  ○ theme 4
  ○ theme 5
  [▼]  (if more pages)
  
  [🎨 FAB]
```

Chevron buttons will be small (w-6 h-6), styled subtly with `text-muted-foreground hover:text-foreground`.

