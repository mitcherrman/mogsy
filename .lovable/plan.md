

## Plan: Banner Navigation + "AURA" Uppercase + Mogged Sound Bug Fix

### 1. Banner Click → Leaderboard (`src/components/NavBanner.tsx`)
- Import `useNavigate`, add `onClick={() => navigate('/leagues/collections')}` and `cursor-pointer` to the outer div

### 2. Home Banner Click → Leaderboard (`src/pages/Home.tsx`)
- Wrap the home banner section (lines 630-656) with navigation to `/leagues/collections` on click, add `cursor-pointer`

### 3. "Aura" → Uppercase Treatment
Apply `uppercase tracking-wider` styling to all user-facing "Aura" text:
- **`src/pages/Home.tsx`** line 650: `"{elo} Aura"` → styled uppercase
- **`src/pages/EloCheck.tsx`** line 417: `"Aura Check"` title, line 553: `"Aura: {elo}"`
- **`src/pages/UserProfile.tsx`** line 432: `"Best Aura"`
- **`src/pages/Leaderboard.tsx`** line 303: already "AURA" (no change)
- **`src/pages/Leagues.tsx`** line 256: already "AURA" (no change)
- **`src/pages/Play.tsx`**: check for instances

### 4. Mogged Sound Bug Fix (`src/components/ThemeOverlay.tsx`)

**Root cause**: `MoggedOverlay` plays the sound in a `useEffect` with `[]` deps — so every time the cycle theme lands on "mogged", the component mounts and plays the sound again. During rapid cycling this causes random-seeming playback.

**Fix**: Track whether the sound has already been played this session using a module-level variable (`let moggedSoundPlayed = false`). Only play the sound on first mount. Reset it when the component unmounts after a longer period (or not at all — play once per page load). This prevents the sound from firing on every cycle rotation through the mogged theme.

