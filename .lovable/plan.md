

## Plan: Enhance Demo Preview with Theme Backgrounds and Full Game UI

### Problem
The demo preview cards don't show the themed background within the card area itself, and they're missing some UI elements that appear in the real collections swipe game (progress bar, match count indicator, "Who Mogs?" header, sword icons, etc.).

### Changes

**File: `src/pages/AdminDemo.tsx`**

1. **Apply theme background to the preview card area** - Use the theme's `pageBg` style as the background inside the preview container, and apply theme-specific card styling (`cardBg`, `textAccent`, etc.) to the individual cards so the preview accurately reflects how cards look under each theme.

2. **Add game-like UI chrome to the swipe preview** - Mirror the real SwipePreset layout:
   - Add a top bar with back arrow, Swords icon + match count, "Who Mogs?" title, camera icon, and trophy icon (all non-functional, purely visual)
   - Add a thin progress bar below the top bar
   - The MatchupCapture wrapper is already used -- ensure it shows the Mogsy text logo and league name properly
   - Add the bottom helper text ("Tap or swipe to choose") and the eye/stats toggle icon

3. **Theme selector shows color preview swatches** - In the theme dropdown in the controls panel, show the theme's preview gradient swatch next to each theme name for quick visual identification.

### Implementation Details

- The `renderSwipeCard` function will receive additional theme style classes to apply `cardBg` styling from the selected theme
- A new `renderGameChrome` wrapper will surround the MatchupCapture in the preview, adding the toolbar and progress bar that match the real game
- The fullscreen preview will also get the same game chrome treatment
- All added UI elements are purely decorative/visual -- no functional changes needed

