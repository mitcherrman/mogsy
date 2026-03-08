

## Among Us Theme Implementation Plan

### Overview
Add a new "Among Us" profile theme with hand-drawn spaceship/building decorations, a fading crewmate GIF with a secret clickable mechanic, and a hidden secret room page.

### What gets built

**1. Copy the uploaded GIF into the project**
- Copy `user-uploads://color_change_amongus.gif` → `public/images/amongus-crewmate.gif`

**2. New "Among Us" theme in `src/lib/profile-themes.ts`**
- Add an `amongus` entry with space-themed dark blue/purple/red color palette (Pro theme)
- Dark space background, red/cyan accents matching Among Us aesthetics

**3. Among Us overlay in `src/components/ThemeOverlay.tsx`**
- **Pencil-drawn SVG spaceships** (3-4) floating/drifting at various positions with thick stroke, hand-drawn style (rough edges, visible stroke)
- **Pencil-drawn SVG buildings** along the bottom — blocky Among Us map-style structures (Skeld/Polus inspired) with thick outlines
- **Stars** scattered in background (small dots)
- **Crewmate GIF** (`/images/amongus-crewmate.gif`):
  - Appears at random screen positions
  - Fades in over ~1s, stays visible ~3s, fades out over ~1s
  - Repeats on a ~6s cycle
  - Internal counter tracks appearances. Every 3rd appearance, the GIF becomes `pointer-events-auto` (clickable) with a subtle glow hint
  - Clicking navigates to `/secret-room`
- Register `"amongus"` in the ThemeOverlay switch

**4. Secret Room page — `src/pages/SecretRoom.tsx`**
- Simple page with a pencil-drawn SVG room containing a couch
- Dark background, thick stroke SVG art of a room interior with a couch in the center
- Minimal text like "You found the secret room..." 
- A back/home button

**5. Route registration in `src/App.tsx`**
- Add `/secret-room` route (lazy loaded, no auth required so it stays mysterious)

### Files changed
| File | Action |
|------|--------|
| `public/images/amongus-crewmate.gif` | Copy from upload |
| `src/lib/profile-themes.ts` | Add `amongus` theme entry |
| `src/components/ThemeOverlay.tsx` | Add `AmongUsOverlay` function + register |
| `src/pages/SecretRoom.tsx` | Create new page |
| `src/App.tsx` | Add `/secret-room` route |

