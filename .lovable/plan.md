

# Admin Demo Page

A new `/admin/demo` page for composing pixel-perfect, fully customizable mock matchups (Swipe and Aura Check) for screenshot/marketing purposes. No real data mutations -- purely visual.

## Features

### Shared Controls (both modes)
- **Mode toggle**: Swipe (Collections) | Swipe (Users) | Aura Check
- **Theme picker**: Select any profile theme to apply to the preview area (reuses existing `profileThemes` list)
- **Animation picker**: Select any card animation (reuses `CARD_ANIMATIONS` registry), with a "Play Animation" button to preview it
- **Screenshot button**: One-click capture of the matchup area (reuses existing `useScreenshot` hook + `MatchupCapture` wrapper)
- **Device frame toggle**: Phone-sized preview container vs full-width

### Per-Card Controls (Left & Right)
- **Item/User search**: Searchable dropdown to pick from existing preset items or user profiles in the database
- **Custom image URL override**: Paste any image URL to replace the fetched one
- **Custom name override**: Edit the displayed name
- **Custom subtitle override**: Edit subtitle text
- **Aura (Elo) number**: Manual numeric input for displayed Aura
- **Rank number**: Manual numeric input for displayed rank (#)
- **Elo change indicator**: Set a +/- delta to show the post-match change indicator
- **Winner/Loser state**: Toggle which card appears as the "chosen" winner (with ring highlight, crown, loser opacity)
- **Profile frame** (Users mode): Select from available frames (default, gold, neon, fire, diamond)
- **Tier badge** (Users mode): Override tier display (bronze/silver/gold/platinum)
- **Pro badge toggle** (Users mode): Show/hide the Pro crown

### Aura Check Specific
- **Score / Streak / Best numbers**: Editable fields for the score bar
- **Correct/Wrong overlay**: Toggle the green checkmark or red X reveal state
- **"On fire" effect**: Toggle the fire border when streak >= 3
- **League name labels**: Editable per card (shown on Aura Check cards)

### Layout
- Left panel: stacked control form (scrollable)
- Right panel: live preview rendering actual card components with overridden props
- Mobile: controls collapse into a drawer/sheet above the preview

## Technical Approach

1. **New file**: `src/pages/AdminDemo.tsx` -- the main page
2. **New route**: `/admin/demo` added to `App.tsx` (lazy-loaded, protected)
3. **Navigation**: Add "Demo" button in `Admin.tsx` header next to "Play Layout" and "Data" buttons
4. **Rendering**: Reuse `MatchupCapture` as the screenshot wrapper. Render preset item cards (same JSX structure from `SwipePreset.tsx`) or `ProfileCard` for user mode, but with all props driven by local state from the control form -- no database writes
5. **Theme application**: Apply selected theme's CSS variables to the preview container via inline styles (same pattern as `useSitewideTheme`)
6. **Animation preview**: Mount `CardAnimationRouter` inside the preview with a manual trigger button
7. **Item search**: Query `preset_items` and `profiles` tables with `.ilike()` for the search dropdowns
8. **No new database tables needed** -- this is entirely a client-side tool reading existing data

