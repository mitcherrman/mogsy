

# Condensed Mobile Swipe Layout + UI Tweaks (Updated)

## All Changes (mobile-only unless noted)

### 1. Replace "VS" with "Who Mogs?" between cards
Replace the VS badge between the two cards with "Who Mogs?" on mobile. Remove the title from the top controls bar on mobile.

### 2. Move back button to floating top-left
Position back button as absolute/floating element outside the card area on mobile.

### 3. Hide match count with admin toggle
- **DB**: Add `show_match_count` key to `app_settings` (default `true`)
- **AdminSettings**: Add "Show Match Count" toggle
- **Swipe pages**: Conditionally hide Swords + count

### 4. Hide progress bar with admin toggle *(new)*
- **DB**: Add `show_swipe_progress` key to `app_settings` (default `true`)
- **AdminSettings**: Add "Show Swipe Progress Bar" toggle under a new "Swipe UI" section (alongside match count toggle)
- **SwipePreset.tsx / Swipe.tsx**: Conditionally hide the progress bar based on this setting

### 5. Condense mobile spacing & reclaim freed space
With the progress bar hidden, back button floated, title moved between cards, and match count hidden, the top controls area is largely empty. Changes:

**`MatchupCapture.tsx`** — Accept `isMobile` prop. Mobile: `p-1.5`, `mb-1`, logo `h-4`, footer `mt-1 pt-1`.

**`SwipePreset.tsx` & `Swipe.tsx`** (mobile-only):
- Remove/collapse the top controls bar since its contents (back button, title, match count) are all relocated or hidden
- Outer container: `py-0 pb-4` — push cards up to reclaim the freed vertical space
- Card gap: `gap-0.5`
- Card stats: `py-1`, tighter text
- Action bar: `mt-1`, buttons `h-7 w-7`
- Help text: `mt-0.5`

### 6. Admin panel grouping
Group the two new toggles (Show Match Count, Show Swipe Progress Bar) under a new **"Swipe UI"** heading with an `Eye` icon in `AdminSettings.tsx`.

## Files changed

| File | Changes |
|------|---------|
| `src/pages/SwipePreset.tsx` | All mobile layout changes, conditional hiding |
| `src/pages/Swipe.tsx` | Same |
| `src/components/MatchupCapture.tsx` | `isMobile` prop, compact padding |
| `src/components/admin/AdminSettings.tsx` | Two new toggles under "Swipe UI" section |
| Database migration | Insert `show_match_count` and `show_swipe_progress` into `app_settings` |

