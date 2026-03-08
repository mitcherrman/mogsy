
## Plan: Desktop-Only Inline Expansion on Play Page

### Goal
On **desktop only**, clicking Collections or Compete expands the sub-options (Swipe / Aura Check) directly below the clicked button on the same screen, rather than navigating to a new view. Mobile keeps the current full-screen navigation behavior.

### Changes

**`src/pages/Play.tsx`**

1. **Import `useIsMobile`** hook from `@/hooks/use-mobile`

2. **Modify the initial view (`!expanded`)** to check for desktop:
   - On desktop: Show Collections & Compete side by side, each with space below for inline expansion
   - When a mode is clicked on desktop, toggle `expanded` state but render sub-buttons (Swipe/Aura Check) directly below the clicked bubble in the same view
   - On mobile: Keep current behavior (full navigation to new view)

3. **Restructure `renderContent()` for desktop:**
   - When `!isMobile` and `!expanded`: Show both bubbles
   - When `!isMobile` and `expanded` but `!subExpanded`: Instead of a separate screen, show both bubbles side by side with the selected one active and sub-options expanded below it
   - Layout: The selected mode stays in place, sub-bubbles (Swipe/Aura Check) animate in below it

4. **Mobile behavior unchanged** — continues to use the step-by-step navigation flow

### Visual Layout (Desktop)
```text
┌─────────────────────────────────────────┐
│        Collections      Compete         │
│           (active)                      │
│                                         │
│       ┌─────────┬─────────┐             │
│       │ Swipe   │  Aura   │             │
│       │         │  Check  │             │
│       └─────────┴─────────┘             │
└─────────────────────────────────────────┘
```

The sub-options appear below only the active mode, keeping both top-level bubbles visible.
