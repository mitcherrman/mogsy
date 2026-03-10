

## Plan: Mobile Icon Relocation + Auto-Hide Bottom Nav in Games

### Problem
1. On mobile, the controls bar (inventory, animation picker, camera, leaderboard) is crammed into a single top row -- icons should move below the cards
2. The bottom sticky navbar stays visible during swipe games, wasting vertical space
3. Need a small pull-up handle so users can reveal the nav bar when needed

### Changes

**File: `src/pages/SwipePreset.tsx`** (lines ~624-670)
- Split the controls bar into two sections:
  - **Top bar (always)**: Back arrow, gauntlet toggle, match count, "Who Mogs?" title, timer
  - **Bottom bar (mobile only, below MatchupCapture)**: SwipeInventoryButton, SwipeAnimationPicker, Camera button, Trophy/Leaderboard button -- displayed as a centered row of icon buttons
- On desktop (`md:` and up), keep all icons in the top bar as-is
- Use `useIsMobile()` hook to conditionally render

**File: `src/pages/Swipe.tsx`** (lines ~394-448)
- Same split: move inventory/animation/camera/trophy buttons below the matchup area on mobile

**File: `src/components/Navbar.tsx`** (lines ~116-162)
- Hide the mobile bottom nav when the current route matches `/swipe`, `/swipe/preset/`, or `/multiplayer/game/`
- Use `useLocation()` (already imported) to check pathname
- When hidden, render a small 16px-tall translucent pull-up handle bar at the bottom instead
- Tapping the handle toggles the full nav visible (local state `navRevealed`); auto-hides after 4 seconds or on route change
- The handle is a small centered pill/line (like iOS home indicator style)

### Implementation Detail

```text
Mobile Layout (before):
┌─────────────────────────┐
│ ← ⚔ 12 Who Mogs? 🎒✨📷🏆 │  ← cramped
│ ▰▰▰▰▰▰▰▰▰░░░░          │
│ ┌─────────────────────┐ │
│ │     Card 1          │ │
│ └─────────────────────┘ │
│           VS            │
│ ┌─────────────────────┐ │
│ │     Card 2          │ │
│ └─────────────────────┘ │
│ [sticky bottom nav]     │
└─────────────────────────┘

Mobile Layout (after):
┌─────────────────────────┐
│ ← ⚔ 12   Who Mogs?     │  ← clean
│ ▰▰▰▰▰▰▰▰▰░░░░          │
│ ┌─────────────────────┐ │
│ │     Card 1          │ │
│ └─────────────────────┘ │
│           VS            │
│ ┌─────────────────────┐ │
│ │     Card 2          │ │
│ └─────────────────────┘ │
│    🎒  ✨  📷  🏆       │  ← action bar
│        ━━━━━            │  ← pull handle (nav hidden)
└─────────────────────────┘
```

