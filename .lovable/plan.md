

## Plan: Rebuild the Floating Theme Switcher (FTS)

### Problem
The current FTS has tooltip visibility issues and needs a fresh rebuild with all requested features properly implemented.

### Approach
Delete and rewrite `src/components/FloatingThemeSwitcher.tsx` from scratch with a cleaner architecture. No other files need changes — it's already imported in `Layout.tsx` and uses the existing `useSitewideTheme` hook.

### Key Features
1. **All themes visible** — shows every theme from `profileThemes`, minus admin-disabled ones
2. **Pro/Free indicators** — Crown badge on pro themes, Lock icon on locked themes, Check on active
3. **Tooltip with theme name** — using a simple custom hover label (not Radix Tooltip, which has portal/overflow issues in this context). A small floating label appears to the left after ~400ms hover delay.
4. **Admin-synced config** — loads `theme_config` from `app_settings` on mount, listens for `theme-config-updated` CustomEvent for live admin updates
5. **Click-outside dismiss** — closes the panel when clicking elsewhere
6. **Smooth animations** — framer-motion for open/close and hover/tap interactions
7. **FAB button** — palette icon button at bottom-right to toggle the panel

### Implementation Details

**Custom tooltip approach**: Instead of Radix `Tooltip` (which clips inside `overflow-y-auto` containers), use a simple `div` positioned absolutely to the left of each circle, shown/hidden via `onMouseEnter`/`onMouseLeave` with a 400ms timeout. This avoids all portal and z-index issues.

**Theme circle rendering**:
- Background: use `pageBg` style or a fallback gradient
- Active: white checkmark + primary ring
- Locked (pro theme, non-pro user): dimmed + Lock icon
- Pro but accessible: small Crown badge at top-right corner
- Free: no extra badge

**Structure**:
```text
fixed bottom-6 right-6 z-[60]
├── AnimatePresence panel (vertical list of theme circles)
│   └── For each visible theme:
│       ├── Circle button (gradient bg, status icon)
│       └── Hover label (absolute, left side, custom div)
└── FAB toggle button (Palette icon)
```

### Files Changed
- `src/components/FloatingThemeSwitcher.tsx` — full rewrite

